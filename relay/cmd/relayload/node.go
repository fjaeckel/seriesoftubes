package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/certs"
	"github.com/fjaeckel/seriesoftubes/relay/internal/config"
	"github.com/fjaeckel/seriesoftubes/relay/internal/metrics"
	"github.com/fjaeckel/seriesoftubes/relay/internal/node"
	"github.com/fjaeckel/seriesoftubes/relay/internal/ops"
)

// runNode is one relay of the load test, in a process of its own: what `relay serve` does (the same
// node package, operator socket, TLS listener, /metrics), with one difference. Its outgoing
// connections trust the run's self-signed certificate and reach *.localhost names on loopback, and
// nothing else: Go on macOS verifies TLS with the system's trust store and ignores SSL_CERT_FILE, so
// a plain `relay serve` could not dial the other relays without changing the system's settings.
// It stops when its parent goes away (stdin closes) or on SIGTERM.
func runNode(args []string) error {
	fs := flag.NewFlagSet("node", flag.ExitOnError)
	dir := fs.String("data", "", "data folder")
	caFile := fs.String("ca", "", "the run's certificate (PEM), trusted for outgoing connections")
	_ = fs.Parse(args)
	c, err := config.Load(filepath.Join(*dir, "config.json"))
	if err != nil {
		return err
	}
	nk, err := ops.LoadKey(filepath.Join(*dir, "node.key"))
	if err != nil {
		return err
	}
	pem, err := os.ReadFile(*caFile)
	if err != nil {
		return err
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(pem) {
		return errors.New("no certificate in " + *caFile)
	}
	hc := &http.Client{Transport: loopbackTransport(pool, nil)}
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo}))
	m := metrics.New()
	r, err := node.New(node.Options{Dir: *dir, Config: c, Node: nk, Log: logger, Metrics: m, Version: "load",
		HTTPClient: hc, ReleasesURL: "https://releases.localhost:1/latest"})
	if err != nil {
		return err
	}
	defer r.Close()
	sock, err := ops.Serve(*dir, r)
	if err != nil {
		return fmt.Errorf("local socket: %w", err)
	}
	defer sock.Close()
	r.Run()
	rl, err := certs.NewReloader(c.TLSCert, c.TLSKey, logger)
	if err != nil {
		return err
	}
	srv := &http.Server{Addr: c.Listen, Handler: r.Handler(), ReadHeaderTimeout: 10 * time.Second,
		ErrorLog: log.New(io.Discard, "", 0), TLSConfig: &tls.Config{MinVersion: tls.VersionTLS12, GetCertificate: rl.GetCertificate}}
	mux := http.NewServeMux()
	mux.Handle("/metrics", m.Handler())
	msrv := &http.Server{Addr: c.Metrics, Handler: mux, ReadHeaderTimeout: 10 * time.Second, ErrorLog: log.New(io.Discard, "", 0)}
	errc := make(chan error, 2)
	go func() { errc <- srv.ListenAndServeTLS("", "") }()
	go func() { errc <- msrv.ListenAndServe() }()
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	gone := make(chan struct{})
	go func() { _, _ = io.Copy(io.Discard, os.Stdin); close(gone) }()
	var out error
	select {
	case err := <-errc:
		if !errors.Is(err, http.ErrServerClosed) {
			out = err
		}
	case <-stop:
	case <-gone:
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
	_ = msrv.Shutdown(ctx)
	return out
}

// loopbackTransport dials *.localhost names (and loopback addresses) on 127.0.0.1, refuses every
// other host, and trusts only pool. count, when set, wraps each connection to count its bytes.
func loopbackTransport(pool *x509.CertPool, count func(net.Conn) net.Conn) *http.Transport {
	return &http.Transport{
		TLSClientConfig:     &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12},
		MaxIdleConnsPerHost: 4,
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, err
			}
			if host != "localhost" && host != "127.0.0.1" && !strings.HasSuffix(host, ".localhost") {
				return nil, fmt.Errorf("relayload: %s is not on loopback", host)
			}
			var d net.Dialer
			c, err := d.DialContext(ctx, "tcp", net.JoinHostPort("127.0.0.1", port))
			if err != nil || count == nil {
				return c, err
			}
			return count(c), nil
		},
	}
}
