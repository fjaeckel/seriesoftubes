package main

import (
	"context"
	"crypto/ecdh"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"fmt"
	"math"
	"math/rand/v2"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/client"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/wire"
)

// rates are the mean intervals of what each player does, plus a few fractions.
type rates struct {
	announce  time.Duration // a new announce (its terms changed)
	rank      time.Duration // a leaderboard look
	nets      time.Duration // the gameplay's nets refresh
	facets    time.Duration // the filter sheet opened
	deal      time.Duration // an offer to another player
	reconnect time.Duration // the connection drops (phone changes network) and resumes with its cursor
	state     time.Duration // the game's live state tick (5.11): a state when the numbers changed
	change    float64       // fraction of state ticks whose numbers changed
	rankwhy   float64       // fraction of rank answers spot-checked with rankwhy
	filtered  float64       // fraction of rank requests with filters
	cross     float64       // fraction of offers to a player on another server
	accept    float64       // fraction of offers accepted (the rest declined, sealed)
}

// world is what every simulated player shares: the servers, the other players, the meters.
type world struct {
	c       *cluster
	hc      *http.Client
	players []*player
	byKey   map[string]*player
	m       *meter
	prop    *propagation
	sprop   *propagation // live states: a probe's marker seen on another server's board of now
	deals   *dealBook
	r       rates
	warmAt  time.Time      // rank answers after this count as warm (a finished slot with records)
	statsAt sync.Map       // key -> unix time of its first stats ack (for the board check)
	live    []atomic.Int64 // per server: players whose subscription is past its backlog
}

// liveServers says which servers have a live subscriber now.
func (w *world) liveServers() []bool {
	out := make([]bool, len(w.live))
	for i := range w.live {
		out[i] = w.live[i].Load() > 0
	}
	return out
}

// player is one simulated game: its network's keys and its connection to its home server.
type player struct {
	w      *world
	i      int
	srv    int
	key    *fed.Signer
	box    *ecdh.PrivateKey
	boxPub string
	xff    string
	rnd    *rand.Rand
	cities []string
	home   string
	ai     bool

	mu        sync.Mutex
	cl        *client.Client
	cursor    string
	annID     string
	annT      int64 // t of the last announce
	day       int64
	handled   map[string]bool // offers answered
	lastStats int64           // slot of the last stats put (one per slot, 5.2)
	stBody    map[string]any  // the numbers of the live state (5.11)
	stAt      time.Time       // when the last state was acked
	marker    int64           // pies value a probe set (states.go), 0 for none
	connected atomic.Bool
}

var cityPool = []string{"fra", "ams", "lon", "par", "mad", "mil", "waw", "sto", "vie", "zrh", "nyc", "chi", "sea", "sfo", "tyo", "sgp", "syd", "sao"}
var homes = []string{"DE", "NL", "GB", "FR", "ES", "IT", "PL", "SE", "US", "JP"}

// seedFor makes player i's seed (deterministic per run seed, so a rerun has the same networks).
func seedFor(run uint64, i int) []byte {
	var b [16]byte
	binary.BigEndian.PutUint64(b[:8], run)
	binary.BigEndian.PutUint64(b[8:], uint64(i))
	h := sha256.Sum256(append([]byte("relayload player "), b[:]...))
	return h[:]
}

func newPlayer(w *world, i, srv int, run uint64) *player {
	seed := seedFor(run, i)
	k, err := fed.NewSigner(seed)
	if err != nil {
		panic(err)
	}
	bx := boxKey(seed)
	p := &player{w: w, i: i, srv: srv, key: k, box: bx, boxPub: fed.Encode(bx.PublicKey().Bytes()),
		// A private address of its own, which the relay reads from X-Forwarded-For (loopback is a
		// trusted proxy by default), so the per-address limits apply to each player as in production.
		xff: fmt.Sprintf("10.%d.%d.%d", (i>>16)&255, (i>>8)&255, i&255),
		rnd: rand.New(rand.NewPCG(run, uint64(i))), day: int64(100 + i%400), handled: map[string]bool{}}
	n := 1 + p.rnd.IntN(8)
	perm := p.rnd.Perm(len(cityPool))
	for _, j := range perm[:n] {
		p.cities = append(p.cities, cityPool[j])
	}
	p.home = homes[p.rnd.IntN(len(homes))]
	p.ai = i%10 == 7
	return p
}

// exp is an exponentially distributed interval with mean d.
func (p *player) exp(d time.Duration) time.Duration {
	if d <= 0 {
		return time.Duration(math.MaxInt64)
	}
	return time.Duration(p.rnd.ExpFloat64() * float64(d))
}

func (p *player) client() *client.Client {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.cl
}

// classify turns a dial or request error into a short code for the report.
func classify(err error) string {
	var ef *client.ErrFrame
	switch {
	case err == nil:
		return ""
	case errors.As(err, &ef):
		return ef.Code
	case errors.Is(err, context.DeadlineExceeded):
		return "timeout"
	case errors.Is(err, context.Canceled):
		return "canceled"
	}
	s := err.Error()
	switch {
	case strings.Contains(s, "too many open files"):
		return "EMFILE"
	case strings.Contains(s, "429"):
		return "http_429"
	case strings.Contains(s, "503"):
		return "http_503"
	case strings.Contains(s, "connection refused"):
		return "refused"
	case strings.Contains(s, "connection closed"), strings.Contains(s, "EOF"), strings.Contains(s, "reset by peer"):
		return "closed"
	}
	return "other"
}

// connect dials the home server, checks its node (challenge), proves the network's key and
// subscribes as the game does, resuming from the last cursor. It returns when the connection ends.
func (p *player) session(ctx context.Context, lost chan<- struct{}) error {
	w := p.w
	r := w.c.relays[p.srv]
	t0 := time.Now()
	dctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	h := http.Header{}
	h.Set("X-Forwarded-For", p.xff)
	cl, err := client.Dial(dctx, r.url, client.Options{HTTPClient: w.hc, Header: h})
	if err != nil {
		w.m.err("connect", classify(err))
		return err
	}
	w.m.framesOut.Add(1)
	w.m.framesIn.Add(1)
	if err := cl.Challenge(dctx, r.id, r.nodeKey, time.Now().Unix()); err != nil {
		cl.Close()
		w.m.err("connect", "challenge:"+classify(err))
		return err
	}
	if _, err := cl.Auth(dctx, p.key, time.Now().Unix()); err != nil {
		cl.Close()
		w.m.err("connect", "auth:"+classify(err))
		return err
	}
	w.m.framesOut.Add(2)
	w.m.framesIn.Add(2)
	w.m.obs("connect", time.Since(t0))
	p.mu.Lock()
	p.cl = cl
	since := p.cursor
	p.mu.Unlock()
	ts := time.Now()
	_, ch, err := cl.Start(ctx, map[string]any{"m": "sub", "kinds": []any{"announce", "offer", "accept", "decline", "leave", "hide"}, "since": since})
	if err != nil {
		cl.Close()
		w.m.err("sub", classify(err))
		return err
	}
	_, vch, err := cl.Start(ctx, map[string]any{"m": "sub", "kinds": []any{"shun", "unshun"}, "since": ""})
	if err != nil {
		cl.Close()
		w.m.err("sub", classify(err))
		return err
	}
	w.m.framesOut.Add(2)
	p.connected.Store(true)
	go p.drain(vch)
	go p.drain(cl.Others())
	go func() {
		p.consume(ch, ts, since != "")
		p.connected.Store(false)
		select {
		case lost <- struct{}{}:
		default:
		}
	}()
	return nil
}

func (p *player) drain(ch <-chan *wire.Frame) {
	for range ch {
		p.w.m.framesIn.Add(1)
	}
}

// consume reads the main subscription: backlog then live records.
func (p *player) consume(ch <-chan *wire.Frame, start time.Time, resumed bool) {
	w := p.w
	backlog := true
	defer func() {
		if !backlog {
			w.live[p.srv].Add(-1)
		}
	}()
	for f := range ch {
		w.m.framesIn.Add(1)
		now := time.Now()
		if f.M == "err" {
			code, _ := f.Str("code")
			w.m.err("sub", code)
			continue
		}
		if f.M != "recs" {
			continue
		}
		if c, ok := f.Str("cursor"); ok && c != "" {
			p.mu.Lock()
			p.cursor = c
			p.mu.Unlock()
		}
		if more, _ := f.Raw["more"].(bool); backlog && !more {
			backlog = false
			op := "sub_backlog"
			if resumed {
				op = "sub_backlog_resume"
			}
			w.m.obs(op, now.Sub(start))
			w.live[p.srv].Add(1)
		}
		items, _ := f.Raw["items"].([]any)
		for _, x := range items {
			it, _ := x.(map[string]any)
			rec, _ := it["rec"].(map[string]any)
			if rec != nil {
				p.see(rec, now)
			}
		}
	}
}

// see handles one record received.
func (p *player) see(rec map[string]any, now time.Time) {
	w := p.w
	kind, _ := rec["kind"].(string)
	author, _ := rec["key"].(string)
	body, _ := rec["body"].(map[string]any)
	to, _ := body["to"].(string)
	switch kind {
	case "announce":
		w.prop.saw(author+"|"+fmt.Sprint(rec["t"]), p.srv, now)
		w.m.add("announces_received", 1)
	case "offer", "accept", "decline":
		w.m.add(kind+"s_received", 1)
		if author != p.key.Key && to != p.key.Key {
			w.deals.leaks.Add(1)
			return
		}
		// Numbers arrive as written (canon.Num): checked into values, the record encodes as signed.
		v, code := canon.Check(rec)
		if code != "" {
			w.m.err("deal", "record_"+code)
			return
		}
		rec = v.(map[string]any)
		body, _ = rec["body"].(map[string]any)
		switch {
		case kind == "offer" && to == p.key.Key:
			id := recID(rec)
			p.mu.Lock()
			done := p.handled[id]
			p.handled[id] = true
			p.mu.Unlock()
			if !done {
				go p.answer(rec, id)
			}
		case to == p.key.Key: // an answer to an offer of mine
			oid, _ := body["offer"].(string)
			if kind == "decline" {
				if a := w.byKey[author]; a == nil {
					w.m.err("deal", "unknown_author")
				} else if _, err := open(p.box, p.key.Key, rec, a.boxPub); err != nil {
					w.m.err("deal", "decline_not_opened")
				}
			}
			w.deals.answered(oid, p.i, kind == "accept", now)
		}
	}
}

// answer opens an offer made to this player and accepts or declines it (sealed).
func (p *player) answer(rec map[string]any, id string) {
	w := p.w
	author, _ := rec["key"].(string)
	a := w.byKey[author]
	if a == nil {
		w.m.err("deal", "unknown_author")
		return
	}
	w.deals.delivered(id, p.i)
	plain, err := open(p.box, p.key.Key, rec, a.boxPub)
	if err != nil {
		w.m.err("deal", "offer_not_opened")
		return
	}
	if m, ok := plain.(map[string]any); !ok || m["deal"] != "peering" {
		w.m.err("deal", "offer_plaintext")
		return
	}
	p.mu.Lock()
	acc := p.rnd.Float64() < w.r.accept
	p.mu.Unlock()
	t := time.Now().Unix()
	var out map[string]any
	if acc {
		out = p.key.Seal("accept", t, map[string]any{"offer": id, "to": author})
	} else {
		out, err = sealed(p.key, p.box, "decline", t, map[string]any{"offer": id, "to": author}, map[string]any{"reason": "declined"}, author, a.boxPub)
		if err != nil {
			w.m.err("deal", "seal")
			return
		}
	}
	p.put(context.Background(), out)
}

// put sends a record and waits for its ack; it returns the record id ("" when refused).
func (p *player) put(ctx context.Context, rec map[string]any) string {
	w := p.w
	cl := p.client()
	kind, _ := rec["kind"].(string)
	w.m.add("puts", 1)
	if cl == nil {
		w.m.err("put:"+kind, "not_connected")
		return ""
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	t0 := time.Now()
	w.m.framesOut.Add(1)
	f, err := cl.Put(ctx, rec)
	if f != nil {
		w.m.framesIn.Add(1)
	}
	if err != nil {
		w.m.err("put:"+kind, classify(err))
		return ""
	}
	w.m.obs("put", time.Since(t0))
	w.m.obs("put:"+kind, time.Since(t0))
	w.m.add("acked", 1)
	rid, _ := f.Str("rid")
	return rid
}

// request sends one request and records its latency under op.
func (p *player) request(ctx context.Context, op string, m map[string]any) *wire.Frame {
	w := p.w
	cl := p.client()
	if cl == nil {
		w.m.err(op, "not_connected")
		return nil
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	t0 := time.Now()
	w.m.framesOut.Add(1)
	f, err := cl.Request(ctx, m)
	if f != nil {
		w.m.framesIn.Add(1)
	}
	if err != nil {
		w.m.err(op, classify(err))
		return nil
	}
	d := time.Since(t0)
	w.m.obs(op, d)
	if op == "rank" && t0.After(w.warmAt) {
		w.m.obs("rank_warm", d)
	}
	return f
}

// collect sends a request answered by recs frames and waits for the last one.
func (p *player) collect(ctx context.Context, op string, m map[string]any) int {
	w := p.w
	cl := p.client()
	if cl == nil {
		w.m.err(op, "not_connected")
		return 0
	}
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	t0 := time.Now()
	w.m.framesOut.Add(1)
	id, ch, err := cl.Start(ctx, m)
	if err != nil {
		w.m.err(op, classify(err))
		return 0
	}
	defer cl.Stop(id)
	n := 0
	for {
		select {
		case f, ok := <-ch:
			if !ok {
				w.m.err(op, "closed")
				return n
			}
			w.m.framesIn.Add(1)
			if f.M == "err" {
				code, _ := f.Str("code")
				w.m.err(op, code)
				return n
			}
			items, _ := f.Raw["items"].([]any)
			n += len(items)
			if more, _ := f.Raw["more"].(bool); !more {
				w.m.obs(op, time.Since(t0))
				return n
			}
		case <-ctx.Done():
			w.m.err(op, "timeout")
			return n
		}
	}
}

// announce puts a new announce (terms or numbers changed).
func (p *player) announce(ctx context.Context) {
	w := p.w
	p.mu.Lock()
	p.day++
	day := p.day
	policy := []string{"open", "open", "restrictive"}[p.rnd.IntN(3)]
	in, out := int64(1000+p.rnd.IntN(90000)), int64(500+p.rnd.IntN(40000))
	// A relay keeps the newest announce of a key per slot and refuses an older one (5.1): two in
	// one second would tie on t, so each is a second after the last.
	t := max(time.Now().Unix(), p.annT+1)
	p.annT = t
	p.mu.Unlock()
	asn, _ := fed.ASN(p.key.Key)
	ix := p.cities[:1+len(p.cities)/2]
	rec := p.key.Seal("announce", t, map[string]any{"name": fmt.Sprintf("Load Net %d", p.i), "asn": asn, "box": p.boxPub,
		"home": p.home, "day": day, "founded": t/86400 - int64(10+p.i%90), "pops": strs(p.cities), "ix": strs(ix),
		"cust": int64(p.i % 50), "mix": map[string]any{"content": int64(200), "eyeball": int64(700), "enterprise": int64(100)},
		"traffic": map[string]any{"in": in, "out": out}, "policy": policy, "rates": map[string]any{},
		"auto": map[string]any{"peering": "auto", "transit": "review", "pni": "review", "swap": "decline", "consortium": "decline", "port": "decline"}})
	w.prop.put(p.key.Key+"|"+fmt.Sprint(t), p.srv, time.Now(), w.liveServers())
	if id := p.put(ctx, rec); id != "" {
		p.mu.Lock()
		p.annID = id
		p.mu.Unlock()
	}
}

func strs(l []string) []any {
	out := make([]any, len(l))
	for i, s := range l {
		out[i] = s
	}
	return out
}

// stats puts this slot's stats.
func (p *player) stats(ctx context.Context) {
	p.mu.Lock()
	body := p.body()
	p.mu.Unlock()
	if p.put(ctx, p.key.Seal("stats", time.Now().Unix(), body)) != "" {
		p.w.statsAt.LoadOrStore(p.key.Key, time.Now().Unix())
	}
}

// body is what the player reports (p.mu held): POPs, traffic with a few other players, and the
// transit relationships of its group of ten (one seller, nine customers), so every board has data.
func (p *player) body() map[string]any {
	w := p.w
	n := len(w.players)
	pops := map[string]any{}
	for _, c := range p.cities {
		pops[c] = int64(1)
	}
	var traffic []any
	for j := 1; j <= 4 && j < n; j++ {
		o := w.players[(p.i+j*37)%n]
		if o == p {
			continue
		}
		traffic = append(traffic, map[string]any{"key": o.key.Key, "in": int64(100 + p.rnd.IntN(5000)), "out": int64(100 + p.rnd.IntN(5000))})
	}
	total := int64(1000 + p.rnd.IntN(100000))
	body := map[string]any{"mode": "normal", "pops": pops, "traffic": traffic, "total": total, "tier1": p.i%50 == 0,
		"shareCountry": false, "pies": int64(p.i % 7)}
	if traffic == nil {
		body["traffic"] = []any{}
	}
	g := p.i - p.i%10
	if p.i%10 == 0 {
		var cust []any
		for j := g + 1; j < g+10 && j < n; j++ {
			cust = append(cust, w.players[j].key.Key)
		}
		if cust != nil {
			body["cust"] = cust
		}
	} else {
		body["up"] = []any{w.players[g].key.Key}
	}
	if p.ai {
		body["ai"] = map[string]any{"model": "example-model-1", "harness": "tubes-mcp"}
	}
	return body
}

var boards = []struct {
	name string
	w    float64
}{{"pops", 0.40}, {"traffic", 0.25}, {"total", 0.20}, {"pies", 0.05}, {"cone", 0.10}}

// rankQuery picks a slice the way players look at boards: mostly the default, sometimes filtered.
func (p *player) rankQuery() map[string]any {
	p.mu.Lock()
	defer p.mu.Unlock()
	x := p.rnd.Float64()
	board := "pops"
	for _, b := range boards {
		if x < b.w {
			board = b.name
			break
		}
		x -= b.w
	}
	q := map[string]any{"m": "rank", "board": board, "measure": "total", "division": "all", "n": int64(50)}
	if p.rnd.Float64() < 0.2 {
		q["measure"] = "growth"
	}
	if p.rnd.Float64() < 0.3 {
		q["n"] = int64(100) // muted networks are left out by the game, which asks for more rows
	}
	if p.rnd.Float64() < p.w.r.filtered {
		switch p.rnd.IntN(6) {
		case 0:
			q["division"] = "human"
		case 1:
			q["division"] = "ai"
		case 2:
			q["filters"] = map[string]any{"home": p.home}
		case 3:
			q["filters"] = map[string]any{"cities": []any{p.cities[0]}}
		case 4:
			q["filters"] = map[string]any{"tier1": false, "policy": "open"}
		case 5:
			q["filters"] = map[string]any{"ageMin": int64(20), "ageMax": int64(60)}
		}
	}
	return q
}

// rank asks for a board and sometimes spot-checks a row with rankwhy, as the game does.
func (p *player) rank(ctx context.Context) {
	w := p.w
	q := p.rankQuery()
	f := p.request(ctx, "rank", q)
	if f == nil || f.M != "ranks" {
		return
	}
	rows, _ := f.Raw["rows"].([]any)
	w.m.add("rank_rows", int64(len(rows)))
	p.mu.Lock()
	check := p.rnd.Float64() < w.r.rankwhy && len(rows) > 0
	var key string
	if check {
		row, _ := rows[p.rnd.IntN(len(rows))].(map[string]any)
		key, _ = row["key"].(string)
	}
	p.mu.Unlock()
	if key == "" {
		return
	}
	why := map[string]any{"m": "rankwhy", "board": q["board"], "measure": q["measure"], "division": q["division"], "key": key}
	if fl, ok := q["filters"]; ok {
		why["filters"] = fl
	}
	w.m.add("rankwhy_items", int64(p.collect(ctx, "rankwhy", why)))
}

// nets asks what the gameplay needs of up to 64 other networks.
func (p *player) nets(ctx context.Context) {
	w := p.w
	p.mu.Lock()
	keys := make([]any, 0, 64)
	for range 64 {
		keys = append(keys, w.players[p.rnd.IntN(len(w.players))].key.Key)
	}
	p.mu.Unlock()
	seen := map[any]bool{}
	uniq := keys[:0]
	for _, k := range keys {
		if !seen[k] {
			seen[k] = true
			uniq = append(uniq, k)
		}
	}
	p.request(ctx, "nets", map[string]any{"m": "nets", "keys": uniq})
}

// offer makes a sealed peering offer to another player, mostly one on another server.
func (p *player) offer(ctx context.Context) {
	w := p.w
	n := len(w.players)
	p.mu.Lock()
	cross := p.rnd.Float64() < w.r.cross && len(w.c.relays) > 1
	var to *player
	for range 50 {
		o := w.players[p.rnd.IntN(n)]
		if o != p && (o.srv != p.srv) == cross {
			to = o
			break
		}
	}
	p.mu.Unlock()
	if to == nil {
		return
	}
	to.mu.Lock()
	basis := to.annID
	to.mu.Unlock()
	if basis == "" {
		return
	}
	t := time.Now().Unix()
	rec, err := sealed(p.key, p.box, "offer", t, map[string]any{"to": to.key.Key},
		map[string]any{"deal": "peering", "basis": basis, "terms": map[string]any{"at": []any{to.cities[0]}, "via": "ix"}}, to.key.Key, to.boxPub)
	if err != nil {
		w.m.err("deal", "seal")
		return
	}
	at := time.Now()
	// Booked before the put: the answer can come back before the ack is read.
	id := recID(rec)
	w.deals.offered(id, p.i, to.i, to.srv != p.srv, at)
	p.put(ctx, rec)
}

// run is the player's life: connect (spread over the ramp), then act until the run ends.
func (p *player) run(ctx context.Context, startIn time.Duration, wg *sync.WaitGroup) {
	defer wg.Done()
	select {
	case <-ctx.Done():
		return
	case <-time.After(startIn):
	}
	w := p.w
	first := true
	for ctx.Err() == nil {
		lost := make(chan struct{}, 1)
		if err := p.session(ctx, lost); err != nil {
			if ctx.Err() != nil {
				return
			}
			select {
			case <-ctx.Done():
				return
			case <-time.After(p.backoff()):
			}
			continue
		}
		if first {
			first = false
			w.m.add("connected", 1)
			p.announce(ctx)
		}
		reason := p.act(ctx, lost)
		cl := p.client()
		p.mu.Lock()
		p.cl = nil
		p.mu.Unlock()
		if cl != nil {
			cl.Close()
		}
		switch reason {
		case "drop":
			w.m.add("reconnects", 1)
		case "lost":
			w.m.add("connections_lost", 1)
			select {
			case <-ctx.Done():
				return
			case <-time.After(time.Second):
			}
		default:
			return
		}
	}
}

func (p *player) backoff() time.Duration {
	p.mu.Lock()
	defer p.mu.Unlock()
	return time.Duration(1000+p.rnd.IntN(2000)) * time.Millisecond
}

// act runs the player's timers on one connection; it says why it stopped.
func (p *player) act(ctx context.Context, lost <-chan struct{}) string {
	w := p.w
	now := time.Now()
	slotAt := func(after time.Time) time.Time {
		s := after.Unix() - after.Unix()%fed.SlotLen
		return time.Unix(s, 0).Add(time.Duration(5+p.rnd.IntN(fed.SlotLen-15)) * time.Second)
	}
	p.mu.Lock()
	next := map[string]time.Time{
		"stats":     slotAt(now),
		"announce":  now.Add(p.exp(w.r.announce)),
		"rank":      now.Add(p.exp(w.r.rank)),
		"nets":      now.Add(p.exp(w.r.nets)),
		"facets":    now.Add(p.exp(w.r.facets)),
		"deal":      now.Add(p.exp(w.r.deal)),
		"reconnect": now.Add(p.exp(w.r.reconnect)),
	}
	if w.r.state > 0 {
		next["state"] = now.Add(time.Duration(p.rnd.Int64N(int64(w.r.state))))
	}
	p.mu.Unlock()
	for {
		what, at := "", time.Time{}
		for k, t := range next {
			if what == "" || t.Before(at) {
				what, at = k, t
			}
		}
		select {
		case <-ctx.Done():
			return "end"
		case <-lost:
			return "lost"
		case <-time.After(time.Until(at)):
		}
		now := time.Now()
		p.mu.Lock()
		switch what {
		case "stats":
			next[what] = slotAt(now.Add(fed.SlotLen * time.Second))
		case "announce":
			next[what] = now.Add(p.exp(w.r.announce))
		case "rank":
			next[what] = now.Add(p.exp(w.r.rank))
		case "nets":
			next[what] = now.Add(p.exp(w.r.nets))
		case "facets":
			next[what] = now.Add(p.exp(w.r.facets))
		case "deal":
			next[what] = now.Add(p.exp(w.r.deal))
		case "state":
			next[what] = now.Add(w.r.state)
		}
		change := p.rnd.Float64() < w.r.change
		p.mu.Unlock()
		switch what {
		case "stats":
			p.mu.Lock()
			s := fed.Slot(now.Unix())
			due := s != p.lastStats
			p.lastStats = s
			p.mu.Unlock()
			if due {
				p.stats(ctx)
			}
		case "announce":
			p.announce(ctx)
		case "rank":
			p.rank(ctx)
		case "nets":
			p.nets(ctx)
		case "facets":
			p.request(ctx, "facets", map[string]any{"m": "facets"})
		case "deal":
			p.offer(ctx)
		case "state":
			p.state(ctx, change)
		case "reconnect":
			return "drop"
		}
	}
}
