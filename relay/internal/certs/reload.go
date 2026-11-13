// Package certs holds the relay's own TLS: a certificate pair that reloads itself when the files
// change (Let's Encrypt renewals without a restart), and the self-signed certificate of a LAN
// server (relay lan).
package certs

import (
	"crypto/tls"
	"crypto/x509"
	"errors"
	"log/slog"
	"os"
	"sync"
	"time"
)

// Reloader serves a certificate pair and rereads it when either file's modification time or size
// changes, checked at most once per Interval. A pair that does not load keeps the old one in
// service and is logged once.
type Reloader struct {
	Cert, Key string
	Interval  time.Duration // between checks of the files; default one minute
	Log       *slog.Logger
	Now       func() time.Time

	mu      sync.Mutex
	cur     *tls.Certificate
	stamp   [2]fileStamp // of the pair in service
	bad     [2]fileStamp // of the last pair that failed, logged once
	checked time.Time
}

type fileStamp struct {
	mod  time.Time
	size int64
}

// NewReloader loads the pair once; an error here stops the relay from starting.
func NewReloader(cert, key string, log *slog.Logger) (*Reloader, error) {
	r := &Reloader{Cert: cert, Key: key, Interval: time.Minute, Log: log, Now: time.Now}
	st, err := r.stamps()
	if err != nil {
		return nil, err
	}
	c, err := load(cert, key)
	if err != nil {
		return nil, err
	}
	r.cur, r.stamp, r.checked = c, st, r.Now()
	return r, nil
}

func (r *Reloader) stamps() ([2]fileStamp, error) {
	var out [2]fileStamp
	for i, p := range []string{r.Cert, r.Key} {
		fi, err := os.Stat(p)
		if err != nil {
			return out, err
		}
		out[i] = fileStamp{fi.ModTime(), fi.Size()}
	}
	return out, nil
}

func load(cert, key string) (*tls.Certificate, error) {
	c, err := tls.LoadX509KeyPair(cert, key)
	if err != nil {
		return nil, err
	}
	if c.Leaf == nil && len(c.Certificate) > 0 {
		if c.Leaf, err = x509.ParseCertificate(c.Certificate[0]); err != nil {
			return nil, err
		}
	}
	return &c, nil
}

// GetCertificate is for tls.Config.
func (r *Reloader) GetCertificate(*tls.ClientHelloInfo) (*tls.Certificate, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	now := r.Now()
	if now.Sub(r.checked) >= r.Interval {
		r.checked = now
		r.refresh()
	}
	if r.cur == nil {
		return nil, errors.New("no certificate")
	}
	return r.cur, nil
}

// refresh rereads the pair when the files changed. Called with mu held.
func (r *Reloader) refresh() {
	st, err := r.stamps()
	if err != nil || st == r.stamp {
		// A file missing for a moment (a renewal swapping links) is not a new pair yet.
		return
	}
	c, err := load(r.Cert, r.Key)
	if err != nil {
		if st != r.bad && r.Log != nil {
			r.Log.Warn("new TLS certificate not loaded, keeping the one in service", "err", err)
		}
		r.bad = st
		return
	}
	r.cur, r.stamp, r.bad = c, st, [2]fileStamp{}
	if r.Log != nil {
		r.Log.Info("TLS certificate reloaded", "notAfter", c.Leaf.NotAfter.UTC().Format(time.RFC3339))
	}
}

// NotAfter is when the certificate in service expires.
func (r *Reloader) NotAfter() time.Time {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.cur.Leaf.NotAfter
}
