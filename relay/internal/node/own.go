package node

import (
	"errors"

	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/registry"
)

// ImportOwn stores a record of this node's own server chain (relay genesis, offline).
func (r *Relay) ImportOwn(v map[string]any) (string, string) {
	rec, code := fed.CheckValue(v, r.now(), fed.Opts{})
	if code != "" {
		return "", code
	}
	res, _, code := r.ingest(rec, nil, origin{boot: true})
	return res, code
}

// AddressesHeld is how many connection addresses the rate limiter holds in memory now.
func (r *Relay) AddressesHeld() int { return r.limiter.Len() }

// RegistryFile is the file for the registry pull request (11.1), without listed and answered.
func (r *Relay) RegistryFile() ([]byte, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.own == nil {
		return nil, errors.New("this node does not know its server yet")
	}
	if r.headSrv == nil {
		return nil, errors.New("no server record at the chain's head yet: run relay ops server and get it signed")
	}
	if len(r.own.Applied) > fed.MaxChain {
		return nil, errors.New("the chain is longer than a registry file holds")
	}
	return registry.File(r.own.Genesis, r.own.Applied, r.headSrv), nil
}
