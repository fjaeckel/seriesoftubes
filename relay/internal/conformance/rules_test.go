package conformance

import (
	"context"
	"encoding/json"
	"slices"
	"sort"
	"testing"

	"github.com/fjaeckel/seriesoftubes/relay/internal/boards"
	"github.com/fjaeckel/seriesoftubes/relay/internal/canon"
	"github.com/fjaeckel/seriesoftubes/relay/internal/catalog"
	"github.com/fjaeckel/seriesoftubes/relay/internal/deals"
	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
	"github.com/fjaeckel/seriesoftubes/relay/internal/rank"
	"github.com/fjaeckel/seriesoftubes/relay/internal/shun"
	"github.com/fjaeckel/seriesoftubes/relay/internal/store"
	"github.com/fjaeckel/seriesoftubes/relay/internal/update"
	"github.com/fjaeckel/seriesoftubes/relay/internal/wire"
)

func init() {
	areas["slots"] = func(t *testing.T, in, _ json.RawMessage) any {
		x := decode[struct {
			T        *int64  `json:"t"`
			Now      *int64  `json:"now"`
			Receipts []int64 `json:"receipts"`
			Records  []struct {
				ID, Key, Mode string
				Slot, T       int64
			} `json:"records"`
			Queries []int64 `json:"queries"`
		}](t, in)
		switch {
		case x.Receipts != nil:
			return map[string]any{"slot": boards.BoardSlot(x.Receipts)}
		case x.T != nil:
			return map[string]any{"slot": fed.Slot(*x.T)}
		case x.Now != nil:
			cf, ct, pf, pt := boards.Windows(*x.Now)
			return map[string]any{"current": map[string]any{"from": cf, "to": ct}, "previous": map[string]any{"from": pf, "to": pt}}
		}
		var recs []*boards.Stats
		for _, r := range x.Records {
			recs = append(recs, &boards.Stats{ID: r.ID, Key: r.Key, Slot: r.Slot, T: r.T, Body: map[string]any{"mode": r.Mode}})
		}
		s := boards.NewSeries(recs)
		res := []any{}
		for _, q := range x.Queries {
			var eff any
			if e := s.Eff(q); e != nil {
				eff = e.ID
			}
			res = append(res, map[string]any{"s": q, "eff": eff, "value": s.Value(q) != nil})
		}
		return map[string]any{"results": res}
	}

	areas["boards"] = func(t *testing.T, in, _ json.RawMessage) any {
		x := decode[struct {
			Now      int64            `json:"now"`
			Board    string           `json:"board"`
			Measure  string           `json:"measure"`
			Division string           `json:"division"`
			Exclude  []string         `json:"exclude"`
			Cities   []string         `json:"cities"`
			Founded  map[string]int64 `json:"founded"` // the cone board: founded of each key's newest announce
			Records  []struct {
				ID   string          `json:"id"`
				Key  string          `json:"key"`
				Slot int64           `json:"slot"`
				T    int64           `json:"t"`
				Body json.RawMessage `json:"body"`
			} `json:"records"`
			States []struct { // live states held at now (optional): the running slot (10.13)
				ID   string          `json:"id"`
				Key  string          `json:"key"`
				T    int64           `json:"t"`
				Body json.RawMessage `json:"body"`
			} `json:"states"`
		}](t, in)
		q := boards.Query{Now: x.Now, Board: x.Board, Measure: x.Measure, Division: x.Division,
			Exclude: map[string]bool{}, Cities: x.Cities, Founded: x.Founded}
		for _, s := range x.States {
			q.States = append(q.States, &boards.State{ID: s.ID, Key: s.Key, T: s.T, Body: strict(t, s.Body).(map[string]any)})
		}
		for _, k := range x.Exclude {
			q.Exclude[k] = true
		}
		var recs []*boards.Stats
		for _, r := range x.Records {
			recs = append(recs, &boards.Stats{ID: r.ID, Key: r.Key, Slot: r.Slot, T: r.T, Body: strict(t, r.Body).(map[string]any)})
		}
		rows := boards.Compute(q, recs)
		if rows == nil {
			rows = []boards.Row{}
		}
		// The node's in-memory ranking must give the same rows as the reference.
		a := rank.New(1)
		defer a.Close()
		raws := make([]rank.Raw, len(recs))
		for i, r := range recs {
			raws[i] = rank.Raw{ID: r.ID, Key: r.Key, Slot: r.Slot, T: r.T, Body: r.Body}
		}
		anns := map[string]*rank.Ann{}
		for k, f := range x.Founded {
			anns[k] = &rank.Ann{Name: k, Founded: f}
		}
		a.Load(raws, anns, q.Exclude, nil)
		for _, s := range q.States {
			a.State(s.ID, s.Key, s.T, s.Body, []byte(s.ID), x.Now)
		}
		ans, err := a.Rank(context.Background(), &rank.Slice{Board: x.Board, Measure: x.Measure, Division: x.Division, Cities: x.Cities}, x.Now, "", -1)
		if err != nil {
			t.Fatal(err)
		}
		got := []boards.Row{}
		for _, r := range ans.Rows {
			got = append(got, boards.Row{Key: r.Key, Value: r.Value})
		}
		if !slices.Equal(got, rows) {
			t.Errorf("rank: %v, reference %v", got, rows)
		}
		return map[string]any{"rows": rows}
	}

	areas["now"] = func(t *testing.T, in, _ json.RawMessage) any {
		x := decode[struct {
			Now      int64            `json:"now"`
			Board    string           `json:"board"`
			Division string           `json:"division"`
			Exclude  []string         `json:"exclude"`
			Cities   []string         `json:"cities"`
			Founded  map[string]int64 `json:"founded"`
			States   []struct {
				ID   string          `json:"id"`
				Key  string          `json:"key"`
				T    int64           `json:"t"`
				Body json.RawMessage `json:"body"`
			} `json:"states"`
		}](t, in)
		q := boards.NowQuery{Now: x.Now, Board: x.Board, Division: x.Division, Exclude: map[string]bool{}, Cities: x.Cities, Founded: x.Founded}
		for _, k := range x.Exclude {
			q.Exclude[k] = true
		}
		var states []*boards.State
		for _, s := range x.States {
			states = append(states, &boards.State{ID: s.ID, Key: s.Key, T: s.T, Body: strict(t, s.Body).(map[string]any)})
		}
		rows := boards.ComputeNow(q, states)
		// The node's live map, fed the states in order, must rank the same.
		a := rank.New(1)
		defer a.Close()
		anns := map[string]*rank.Ann{}
		for k, f := range x.Founded {
			anns[k] = &rank.Ann{Name: k, Founded: f}
		}
		a.Load(nil, anns, q.Exclude, nil)
		for _, s := range states {
			a.State(s.ID, s.Key, s.T, s.Body, []byte(s.ID), x.Now)
		}
		ans, err := a.Rank(context.Background(), &rank.Slice{Board: x.Board, Measure: "now", Division: x.Division, Cities: x.Cities}, x.Now, "", -1)
		if err != nil {
			t.Fatal(err)
		}
		got := []boards.Row{}
		for _, r := range ans.Rows {
			got = append(got, boards.Row{Key: r.Key, Value: r.Value})
		}
		if !slices.Equal(got, rows) {
			t.Errorf("rank now: %v, reference %v", got, rows)
		}
		return map[string]any{"rows": rows}
	}

	areas["rank"] = func(t *testing.T, in, _ json.RawMessage) any {
		x := decode[struct {
			Now      int64           `json:"now"`
			Request  json.RawMessage `json:"request"`
			Me       *string         `json:"me"`
			Excluded []string        `json:"excluded"`
			Names    []string        `json:"names"`
			Records  []struct {
				ID   string          `json:"id"`
				Key  string          `json:"key"`
				Slot int64           `json:"slot"`
				T    int64           `json:"t"`
				CC   string          `json:"cc"`
				Body json.RawMessage `json:"body"`
			} `json:"records"`
			Announces []struct {
				Key, Name, Home, Policy string
				Founded, Day            int64
			} `json:"announces"`
		}](t, in)
		f, werr := wire.Parse(x.Request, fed.ClientFrame)
		if werr != nil {
			t.Fatal(werr)
		}
		q, n, code := rank.ParseRequest(f)
		if code != "" {
			return map[string]any{"error": code}
		}
		set := func(l []string) map[string]bool {
			m := map[string]bool{}
			for _, k := range l {
				m[k] = true
			}
			return m
		}
		raws := make([]rank.Raw, len(x.Records))
		for i, r := range x.Records {
			raws[i] = rank.Raw{ID: r.ID, Key: r.Key, Slot: r.Slot, T: r.T, CC: r.CC, Body: strict(t, r.Body).(map[string]any)}
		}
		anns := map[string]*rank.Ann{}
		for _, a := range x.Announces {
			anns[a.Key] = &rank.Ann{Name: a.Name, Home: a.Home, Policy: a.Policy, Founded: a.Founded, Day: a.Day}
		}
		a := rank.New(1)
		defer a.Close()
		a.Load(raws, anns, set(x.Excluded), set(x.Names))
		me := ""
		if x.Me != nil {
			me = *x.Me
		}
		ans, err := a.Rank(context.Background(), q, x.Now, me, n)
		if err != nil {
			t.Fatal(err)
		}
		b, _ := json.Marshal(ans)
		var v any
		_ = json.Unmarshal(b, &v)
		return v
	}

	areas["quiet"] = func(t *testing.T, in, _ json.RawMessage) any {
		x := decode[struct{ Now, LastHeard int64 }](t, in)
		st, f := boards.Quiet(x.Now, x.LastHeard)
		return map[string]any{"state": st, "factor": f}
	}

	areas["shun"] = func(t *testing.T, in, _ json.RawMessage) any {
		x := decode[struct {
			Now      int64  `json:"now"`
			Target   string `json:"target"`
			Registry struct {
				AsOf    int64 `json:"asOf"`
				Servers []struct {
					ID        string   `json:"id"`
					Operators []string `json:"operators"`
					Listed    *int64   `json:"listed"`
					Answered  *int64   `json:"answered"`
				} `json:"servers"`
			} `json:"registry"`
			Records []shun.Vote `json:"records"`
		}](t, in)
		reg := shun.Registry{AsOf: x.Registry.AsOf}
		for _, s := range x.Registry.Servers {
			reg.Servers = append(reg.Servers, shun.Server{ID: s.ID, Operators: s.Operators, Listed: s.Listed, Answered: s.Answered})
		}
		return shun.Tally(reg, x.Records, x.Target, x.Now)
	}

	areas["catalog"] = func(t *testing.T, in, _ json.RawMessage) any {
		x := decode[struct {
			Now   int64  `json:"now"`
			Self  string `json:"self"`
			Entry *struct {
				ID   string   `json:"id"`
				Path []string `json:"path"`
				Seen int64    `json:"seen"`
			} `json:"entry"`
			Registry []struct {
				ID     string          `json:"id"`
				Server catalog.Summary `json:"server"`
			} `json:"registry"`
			Gossip []struct {
				ID     string          `json:"id"`
				Server catalog.Summary `json:"server"`
				Path   []string        `json:"path"`
				Seen   int64           `json:"seen"`
			} `json:"gossip"`
		}](t, in)
		if x.Entry != nil {
			d := catalog.Receive(x.Now, x.Self, x.Entry.ID, x.Entry.Path, x.Entry.Seen)
			switch d.Action {
			case "store":
				var fw any
				if d.Forward != nil {
					fw = d.Forward
				}
				return map[string]any{"action": "store", "forward": fw}
			case "drop":
				return map[string]any{"action": "drop", "why": d.Why}
			}
			return map[string]any{"action": "refuse", "error": d.Error}
		}
		var reg []catalog.Known
		for _, r := range x.Registry {
			reg = append(reg, catalog.Known{ID: r.ID, Server: r.Server})
		}
		var gos []catalog.Heard
		for _, g := range x.Gossip {
			gos = append(gos, catalog.Heard{ID: g.ID, Server: g.Server, Path: g.Path, Seen: g.Seen})
		}
		return map[string]any{"servers": catalog.Merge(x.Now, reg, gos)}
	}

	areas["deals"] = func(t *testing.T, in, _ json.RawMessage) any {
		type rec struct {
			ID   string          `json:"id"`
			Kind string          `json:"kind"`
			Key  string          `json:"key"`
			T    int64           `json:"t"`
			Body json.RawMessage `json:"body"`
		}
		x := decode[struct {
			Announces []rec `json:"announces"`
			Offer     rec   `json:"offer"`
			Accept    *struct {
				T int64 `json:"t"`
			} `json:"accept"`
			Renews *struct {
				ID    string `json:"id"`
				Start int64  `json:"start"`
				End   int64  `json:"end"`
			} `json:"renews"`
		}](t, in)
		var anns []deals.Announce
		for _, a := range x.Announces {
			anns = append(anns, deals.Announce{ID: a.ID, Kind: a.Kind, Key: a.Key, T: a.T, Body: strict(t, a.Body).(map[string]any)})
		}
		o := deals.Offer{ID: x.Offer.ID, Key: x.Offer.Key, T: x.Offer.T, Body: strict(t, x.Offer.Body).(map[string]any)}
		var acc *int64
		if x.Accept != nil {
			acc = &x.Accept.T
		}
		var run *deals.Running
		if x.Renews != nil {
			run = &deals.Running{ID: x.Renews.ID, Start: x.Renews.Start, End: x.Renews.End}
		}
		r := deals.Check(anns, o, acc, run)
		if !r.OK {
			return map[string]any{"ok": false, "error": r.Error}
		}
		return map[string]any{"ok": true, "auto": r.Auto, "start": r.Start, "end": r.End}
	}

	areas["sync"] = func(t *testing.T, in, _ json.RawMessage) any {
		type side struct {
			ID   string   `json:"id"`
			Sync string   `json:"sync"`
			List []string `json:"list"`
		}
		x := decode[struct {
			Same *bool           `json:"same"`
			A    json.RawMessage `json:"a"`
			B    json.RawMessage `json:"b"`
		}](t, in)
		if x.Same != nil {
			a, b := decode[side](t, x.A), decode[side](t, x.B)
			return map[string]any{"sync": wire.Allows(*x.Same, a.ID, a.Sync, a.List, b.ID, b.Sync, b.List)}
		}
		// Versions: a's hello answered by a node speaking b.
		av, _ := canon.Parse(x.A)
		bv, _ := canon.Parse(x.B)
		va, ok := wire.Vers(av)
		if !ok {
			return map[string]any{"error": fed.BadFrame}
		}
		vb, _ := wire.Vers(bv)
		v, ok := wire.Negotiate(va, vb)
		if !ok {
			return map[string]any{"error": fed.Unsupported}
		}
		return map[string]any{"ver": v}
	}

	areas["wire"] = func(t *testing.T, in, _ json.RawMessage) any {
		x := decode[struct {
			Role   string  `json:"role"`
			Speaks []int64 `json:"speaks"`
			State  string  `json:"state"`
			Frame  string  `json:"frame"`
		}](t, in)
		if x.Role != "client" {
			t.Fatalf("unknown role %q", x.Role)
		}
		f, werr := wire.Parse([]byte(x.Frame), fed.ClientFrame)
		if werr == nil {
			_, werr = wire.CheckClient(f, x.State == "ready", x.Speaks)
		}
		if werr != nil {
			return map[string]any{"error": werr.Code}
		}
		return map[string]any{"ok": true}
	}

	areas["impl"] = func(t *testing.T, in, _ json.RawMessage) any {
		x := decode[struct {
			Welcome json.RawMessage `json:"welcome"`
			Entry   json.RawMessage `json:"entry"`
			Nodes   []string        `json:"nodes"`
		}](t, in)
		if x.Welcome != nil { // "welcome": null is kept as the text null
			v, _ := canon.Parse(x.Welcome)
			if im := update.ReadImpl(v); im != nil {
				return map[string]any{"impl": map[string]any{"name": im.Name, "version": im.Version}}
			}
			return map[string]any{"impl": nil}
		}
		v, _ := canon.Parse(x.Entry)
		out := map[string]any{}
		for k, im := range update.ReadImpls(v, func(k string) bool { return slices.Contains(x.Nodes, k) }) {
			out[k] = map[string]any{"name": im.Name, "version": im.Version}
		}
		return map[string]any{"impl": out}
	}

	areas["dedupe"] = func(t *testing.T, in, _ json.RawMessage) any {
		x := decode[struct {
			Now      int64 `json:"now"`
			Arrivals []struct {
				Record json.RawMessage `json:"record"`
				Text   *string         `json:"text"`
			} `json:"arrivals"`
		}](t, in)
		st := store.Memory()
		results := []string{}
		for _, a := range x.Arrivals {
			text := []byte(a.Record)
			if a.Text != nil {
				text = []byte(*a.Text)
			}
			r, code := fed.ParseRecord(text, x.Now, fed.Opts{})
			if code != "" {
				results = append(results, code)
				continue
			}
			res, _, err := st.Put(r, nil, 0, 0)
			if err != nil {
				t.Fatal(err)
			}
			results = append(results, res)
		}
		type out struct {
			ID   string   `json:"id"`
			Sigs []string `json:"sigs,omitempty"`
		}
		stored := []out{}
		for _, e := range st.All() {
			rec := st.Rec(e)
			o := out{ID: e.ID}
			if rec.Sigs != nil {
				o.Sigs = rec.Signers()
			}
			stored = append(stored, o)
		}
		sort.Slice(stored, func(i, j int) bool { return stored[i].ID < stored[j].ID })
		return map[string]any{"stored": stored, "results": results}
	}
}
