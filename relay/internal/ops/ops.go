// Package ops is the local control socket: the command line talks to the running relay
// through a unix socket in the data folder (mode 0600), never over the network. Operator
// actions arrive already signed with the operator key kept on that machine.
package ops

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/node"
)

// SocketName is the socket's file name in the data folder.
const SocketName = "relay.sock"

// maxSocketPath is the longest socket path every Unix accepts (macOS allows 103 bytes, Linux 107).
const maxSocketPath = 103

// Request is one command.
type Request struct {
	Cmd     string          `json:"cmd"`
	Rec     json.RawMessage `json:"rec,omitempty"`
	ID      string          `json:"id,omitempty"`
	Key     string          `json:"key,omitempty"`
	Sig     string          `json:"sig,omitempty"`
	Path    string          `json:"path,omitempty"`
	Board   string          `json:"board,omitempty"`
	Measure string          `json:"measure,omitempty"`
	Div     string          `json:"division,omitempty"`
}

// Response is the answer: a result or an error code.
type Response struct {
	OK     bool   `json:"ok"`
	Error  string `json:"error,omitempty"`
	Result any    `json:"result,omitempty"`
}

// Serve listens on the socket until the listener is closed.
func Serve(dir string, r *node.Relay) (net.Listener, error) {
	path := filepath.Join(dir, SocketName)
	if len(path) > maxSocketPath {
		return nil, fmt.Errorf("operator socket path %q is longer than %d bytes (a Unix socket limit): use a shorter data folder", path, maxSocketPath)
	}
	_ = os.Remove(path)
	old := umask(0o177)
	l, err := net.Listen("unix", path)
	umask(old)
	if err != nil {
		return nil, err
	}
	if err := os.Chmod(path, 0o600); err != nil {
		l.Close()
		return nil, err
	}
	go func() {
		for {
			c, err := l.Accept()
			if err != nil {
				return
			}
			go handle(c, r)
		}
	}()
	return l, nil
}

func handle(c net.Conn, r *node.Relay) {
	defer c.Close()
	_ = c.SetDeadline(time.Now().Add(5 * time.Minute))
	sc := bufio.NewScanner(c)
	sc.Buffer(make([]byte, 64<<10), 2<<20)
	if !sc.Scan() {
		return
	}
	var req Request
	resp := Response{}
	if err := json.Unmarshal(sc.Bytes(), &req); err != nil {
		resp.Error = "bad_frame"
	} else {
		resp = do(r, req)
	}
	b, _ := json.Marshal(resp)
	_, _ = c.Write(append(b, '\n'))
}

func do(r *node.Relay, q Request) Response {
	ok := func(v any) Response { return Response{OK: true, Result: v} }
	switch q.Cmd {
	case "status":
		return ok(r.Status())
	case "state":
		return ok(r.State())
	case "servers":
		return ok(r.Servers())
	case "players":
		return ok(r.Players())
	case "nodes":
		return ok(r.Nodes())
	case "pending":
		return ok(r.Pending())
	case "board":
		rows, err := r.Board(q.Board, q.Measure, q.Div)
		if err != nil {
			return Response{Error: "rate_limited"}
		}
		return ok(rows)
	case "get":
		if v := r.Get(q.ID); v != nil {
			return ok(v)
		}
		return Response{Error: "not_found"}
	case "put":
		v, code := canon.ParseStrict(q.Rec)
		if code != "" {
			return Response{Error: code}
		}
		res, code := r.PutValue(v)
		if code != "" {
			return Response{Error: code}
		}
		return ok(res)
	case "cosign":
		res, code := r.Cosign(q.ID, q.Key, q.Sig)
		if code != "" {
			return Response{Error: code}
		}
		return ok(map[string]any{"rid": q.ID, "result": res})
	case "backup":
		if q.Path == "" {
			return Response{Error: "missing_field"}
		}
		if err := r.Backup(q.Path); err != nil {
			return Response{Error: "internal: " + err.Error()}
		}
		return ok(map[string]any{"path": q.Path})
	case "registry-file":
		b, err := r.RegistryFile()
		if err != nil {
			return Response{Error: err.Error()}
		}
		return ok(string(b))
	case "gc":
		r.GC()
		return ok(nil)
	}
	return Response{Error: "bad_kind"}
}

// ErrNotRunning means nothing answers on the socket.
var ErrNotRunning = errors.New("the relay is not running (no answer on its local socket)")

// Call sends one command to the running relay.
func Call(dir string, q Request) (*Response, error) {
	c, err := net.DialTimeout("unix", filepath.Join(dir, SocketName), 3*time.Second)
	if err != nil {
		return nil, ErrNotRunning
	}
	defer c.Close()
	_ = c.SetDeadline(time.Now().Add(5 * time.Minute))
	b, _ := json.Marshal(q)
	if _, err := c.Write(append(b, '\n')); err != nil {
		return nil, err
	}
	sc := bufio.NewScanner(c)
	sc.Buffer(make([]byte, 64<<10), 64<<20)
	if !sc.Scan() {
		return nil, errors.New("no answer from the relay")
	}
	var resp Response
	if err := json.Unmarshal(sc.Bytes(), &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

// Running reports whether a relay answers on the socket.
func Running(dir string) bool {
	c, err := net.DialTimeout("unix", filepath.Join(dir, SocketName), time.Second)
	if err != nil {
		return false
	}
	c.Close()
	return true
}
