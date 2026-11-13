// Package client speaks the client side of the protocol (9.3): the registry check's
// node challenge, a joining node's bootstrap, and the tests use it.
package client

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/update"
	"github.com/fjaeckel/seriesoftubes/relay/internal/wire"
)

// Options for Dial.
type Options struct {
	HTTPClient *http.Client // nil: the default, with system roots
	Header     http.Header  // extra handshake headers (tests set X-Forwarded-For)
	Versions   []int64      // nil: [1]
}

// Welcome is the node's answer to hello.
type Welcome struct {
	Ver    int64
	Server string
	Node   string
	Now    int64
	Impl   *update.Impl // what the node runs, when it says (informational)
	Feats  []string     // optional messages the node takes (9.3 feats)
}

// ErrFrame is an err frame from the node.
type ErrFrame struct {
	Code  string
	Retry int64
}

func (e *ErrFrame) Error() string { return "node answered " + e.Code }

// Client is one connection to a node.
type Client struct {
	c       *websocket.Conn
	Welcome Welcome
	mu      sync.Mutex
	next    int64
	waits   map[int64]chan *wire.Frame
	other   chan *wire.Frame
	done    chan struct{}
	err     error
}

// Dial connects, says hello as a client and waits for welcome.
func Dial(ctx context.Context, url string, o Options) (*Client, error) {
	vers := o.Versions
	if vers == nil {
		vers = []int64{fed.Version}
	}
	c, _, err := websocket.Dial(ctx, url, &websocket.DialOptions{
		HTTPClient: o.HTTPClient, HTTPHeader: o.Header, Subprotocols: []string{fed.Subprotocol},
	})
	if err != nil {
		return nil, err
	}
	if c.Subprotocol() != fed.Subprotocol {
		c.CloseNow()
		return nil, errors.New("node did not agree to the subprotocol")
	}
	c.SetReadLimit(fed.ClientFrame)
	cl := &Client{c: c, waits: map[int64]chan *wire.Frame{}, other: make(chan *wire.Frame, 64), done: make(chan struct{})}
	vl := make([]any, len(vers))
	for i, v := range vers {
		vl[i] = v
	}
	if err := cl.send(ctx, map[string]any{"m": "hello", "vers": vl, "role": "client"}); err != nil {
		c.CloseNow()
		return nil, err
	}
	f, err := cl.read(ctx)
	if err != nil {
		c.CloseNow()
		return nil, err
	}
	if f.M == "err" {
		c.CloseNow()
		code, _ := f.Str("code")
		return nil, &ErrFrame{Code: code}
	}
	if f.M != "welcome" {
		c.CloseNow()
		return nil, fmt.Errorf("expected welcome, got %q", f.M)
	}
	cl.Welcome.Ver, _ = wire.Int(f.Raw["ver"])
	cl.Welcome.Server, _ = f.Str("server")
	cl.Welcome.Node, _ = f.Str("node")
	cl.Welcome.Now, _ = wire.Int(f.Raw["now"])
	cl.Welcome.Impl = update.ReadImpl(f.Raw["impl"])
	cl.Welcome.Feats = wire.Feats(f.Raw["feats"])
	go cl.loop()
	return cl, nil
}

func (cl *Client) send(ctx context.Context, m map[string]any) error {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	return cl.c.Write(ctx, websocket.MessageText, canon.Encode(m))
}

// SendRaw writes frame text as is (tests send hostile frames).
func (cl *Client) SendRaw(ctx context.Context, b []byte) error {
	return cl.c.Write(ctx, websocket.MessageText, b)
}

func (cl *Client) read(ctx context.Context) (*wire.Frame, error) {
	_, r, err := cl.c.Reader(ctx)
	if err != nil {
		return nil, err
	}
	b, err := io.ReadAll(r)
	if err != nil {
		return nil, err
	}
	f, werr := wire.Parse(b, fed.ClientFrame)
	if werr != nil {
		return nil, errors.New("bad frame from node: " + werr.Code)
	}
	return f, nil
}

func (cl *Client) loop() {
	defer close(cl.done)
	for {
		f, err := cl.read(context.Background())
		if err != nil {
			cl.mu.Lock()
			cl.err = err
			for _, ch := range cl.waits {
				close(ch)
			}
			cl.waits = map[int64]chan *wire.Frame{}
			cl.mu.Unlock()
			close(cl.other)
			return
		}
		if f.M == "ping" {
			_ = cl.send(context.Background(), map[string]any{"m": "pong", "id": f.ID, "now": time.Now().Unix()})
			continue
		}
		cl.mu.Lock()
		ch := cl.waits[f.ID]
		cl.mu.Unlock()
		if ch != nil && f.ID != 0 {
			select {
			case ch <- f:
			default: // a reader that stopped listening loses frames, never blocks the loop
			}
			continue
		}
		select {
		case cl.other <- f:
		default:
		}
	}
}

// Start sends a request and returns the channel its answers arrive on.
func (cl *Client) Start(ctx context.Context, m map[string]any) (int64, <-chan *wire.Frame, error) {
	cl.mu.Lock()
	if cl.err != nil {
		cl.mu.Unlock()
		return 0, nil, cl.err
	}
	cl.next++
	id := cl.next
	ch := make(chan *wire.Frame, 1024)
	cl.waits[id] = ch
	cl.mu.Unlock()
	m["id"] = id
	if err := cl.send(ctx, m); err != nil {
		return 0, nil, err
	}
	return id, ch, nil
}

// Stop forgets a request id.
func (cl *Client) Stop(id int64) {
	cl.mu.Lock()
	delete(cl.waits, id)
	cl.mu.Unlock()
}

// Request sends a request and returns its first answer.
func (cl *Client) Request(ctx context.Context, m map[string]any) (*wire.Frame, error) {
	id, ch, err := cl.Start(ctx, m)
	if err != nil {
		return nil, err
	}
	defer cl.Stop(id)
	select {
	case f, ok := <-ch:
		if !ok {
			return nil, errors.New("connection closed")
		}
		if f.M == "err" {
			code, _ := f.Str("code")
			retry, _ := wire.Int(f.Raw["retry"])
			return f, &ErrFrame{Code: code, Retry: retry}
		}
		return f, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

// Collect gathers recs frames of a request until more is false.
func (cl *Client) Collect(ctx context.Context, m map[string]any) ([]map[string]any, error) {
	id, ch, err := cl.Start(ctx, m)
	if err != nil {
		return nil, err
	}
	defer cl.Stop(id)
	var items []map[string]any
	var entries []any // a catalog answer's entries, joined over its frames (9.3)
	for {
		select {
		case f, ok := <-ch:
			if !ok {
				return items, errors.New("connection closed")
			}
			if f.M == "err" {
				code, _ := f.Str("code")
				return items, &ErrFrame{Code: code}
			}
			if f.M == "catalog" {
				list, _ := f.Raw["entries"].([]any)
				entries = append(entries, list...)
				if more, _ := f.Raw["more"].(bool); more {
					continue
				}
				if entries == nil {
					entries = []any{}
				}
				joined := map[string]any{}
				for k, v := range f.Raw {
					joined[k] = v
				}
				joined["entries"] = entries
				return []map[string]any{joined}, nil
			}
			list, _ := f.Raw["items"].([]any)
			for _, it := range list {
				if m, ok := it.(map[string]any); ok {
					items = append(items, m)
				}
			}
			if more, _ := f.Raw["more"].(bool); !more {
				return items, nil
			}
		case <-ctx.Done():
			return items, ctx.Err()
		}
	}
}

// Put sends a record and returns the ack.
func (cl *Client) Put(ctx context.Context, rec map[string]any) (*wire.Frame, error) {
	return cl.Request(ctx, map[string]any{"m": "put", "rec": rec})
}

// Challenge asks the node to prove its key and checks the proof against the expected server and node.
func (cl *Client) Challenge(ctx context.Context, server, node string, now int64) error {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		return err
	}
	nonce := fed.Encode(b[:])
	f, err := cl.Request(ctx, map[string]any{"m": "challenge", "nonce": nonce})
	if err != nil {
		return err
	}
	pv, ok := f.Raw["proof"]
	if f.M != "proof" || !ok {
		return errors.New("no proof in the answer")
	}
	v, code := canon.Check(pv)
	if code != "" {
		return errors.New(fed.BadChallenge)
	}
	if code := fed.CheckProof(v, nonce, server, node, now); code != "" {
		return errors.New(code)
	}
	return nil
}

// Auth proves a key to the node (9.3 auth), signed for the node and server of the welcome at t;
// it reports whether the node took it as an operator's of its server.
func (cl *Client) Auth(ctx context.Context, k *fed.Signer, t int64) (bool, error) {
	f, err := cl.Request(ctx, map[string]any{"m": "auth", "key": k.Key, "t": t, "sig": k.Auth(cl.Welcome.Node, cl.Welcome.Server, t)})
	if err != nil {
		return false, err
	}
	op, _ := f.Raw["op"].(bool)
	return op, nil
}

// Others returns frames that answer no request (pings answered already).
func (cl *Client) Others() <-chan *wire.Frame { return cl.other }

// Close ends the connection.
func (cl *Client) Close() {
	cl.c.Close(websocket.StatusNormalClosure, "")
	<-cl.done
}
