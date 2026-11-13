package rank

import (
	"math/bits"
	"slices"

	"github.com/fjaeckel/seriesoftubes/relay/internal/fed"
)

/* The customer cone board (10.4): per window slot, the networks reachable from X over counted
   transit edges: X lists Y in cust and Y lists X in up, both report traffic with the other both
   ways, both have a value (so were heard in the 7 days before), neither is excluded, and Y joined
   at least 30 days before the slot (founded of its newest announce).

   Worked out for all networks at once, per state (running slot and gen), when a cone ranking is
   asked for, under the read lock:
   1. Each network that lists customers or upstreams is cut into spans of window slots with one
      normal record whose list (customers, upstreams with traffic both ways) stays the same:
      usually one or a few spans.
   2. Each customer a span lists is matched against that customer's up spans: an edge X -> Y holds
      over the overlap, from the slot Y counts as established on. Edges come out as +1 / -1 events at window slot indexes.
   3. Sweeping the 576 slots, the graph changes only at events: between them it is one graph. Two
      graphs with the same edges (an order-free 128-bit hash of the edge set and its size) are
      worked out once.
   4. A graph: strongly connected components (Tarjan, iterative), then in reverse topological order
      each component's reach as a bitset over the graph's nodes, the union of its children's reach
      and members. A component's bitset is freed once every parent has read it.

   Cost per state: O(S log S) for the spans and events (S spans in all) plus, per distinct graph
   (at most 577), O(V + E + E * V / 64) for V networks and E edges in it. Memory: N int32 per
   network with a customer at some slot, and the bitsets of the components still waiting for a
   parent (at most V * V / 8 bytes, far less for tree-like graphs). */

// coneSet is the per-slot cone size of every network with customers, for one state (announces
// included: they say who is established).
type coneSet struct {
	c         int64
	gen, meta uint64
	size      map[*net][]int32
}

// span is a stretch [i, j) of window slots with one normal record r.
type span struct {
	i, j int
	r    *stat
}

// spans cuts x's window slots into spans of normal records whose list (by list()) is the same.
func spans(x *net, from int64, list func(*stat) []string) []span {
	var out []span
	x.runs(from, 0, N, func(i, j int, r *stat) {
		if r == nil || !r.normal || len(list(r)) == 0 {
			return
		}
		if k := len(out) - 1; k >= 0 && out[k].j == i && slices.Equal(list(out[k].r), list(r)) {
			out[k].j = j
			return
		}
		out = append(out, span{i, j, r})
	})
	return out
}

func custOf(s *stat) []string { return s.custOK() }
func upOf(s *stat) []string   { return s.upOK() }

// mix64 is splitmix64's finalizer: spreads an edge code over 64 bits for the edge-set hash.
func mix64(z uint64) uint64 {
	z ^= z >> 30
	z *= 0xbf58476d1ce4e5b9
	z ^= z >> 27
	z *= 0x94d049bb133111eb
	return z ^ z>>31
}

// cones gives the per-slot cone sizes of the windows of running slot c for the current state
// (read lock held), worked out once.
func (a *Agg) cones(c int64) map[*net][]int32 {
	a.cmu.Lock()
	defer a.cmu.Unlock()
	g, m := a.gen.Load(), a.meta.Load()
	if a.cone != nil && a.cone.c == c && a.cone.gen == g && a.cone.meta == m {
		return a.cone.size
	}
	a.cone = &coneSet{c: c, gen: g, meta: m, size: a.computeCones(c)}
	return a.cone.size
}

type coneEv struct {
	i int
	e uint64 // from << 32 | to, candidate indexes
	d int32
}

func (a *Agg) computeCones(c int64) map[*net][]int32 {
	from := c - N*fed.SlotLen
	var cand []*net
	for _, x := range a.nets {
		if x.withCn > 0 && !a.ex[x.key] {
			cand = append(cand, x)
		}
	}
	slices.SortFunc(cand, func(p, q *net) int {
		if p.key < q.key {
			return -1
		}
		return 1
	})
	idx := make(map[*net]uint32, len(cand))
	ups := make([][]span, len(cand))
	for i, x := range cand {
		idx[x] = uint32(i)
		ups[i] = spans(x, from, upOf)
	}
	var evs []coneEv
	for xi, x := range cand {
		for _, sx := range spans(x, from, custOf) {
			for _, yk := range sx.r.custOK() {
				if yk == x.key || a.ex[yk] {
					continue
				}
				y := a.nets[yk]
				if y == nil || y.withCn == 0 || y.ann == nil {
					continue
				}
				// Y counts from the first slot at least 30 days after it joined.
				est := ixAt(from, (y.ann.Founded+fed.NewcomerDays)*fed.Day)
				yi := idx[y]
				us := ups[yi]
				k, _ := slices.BinarySearchFunc(us, sx.i, func(s span, i int) int {
					if s.j <= i {
						return -1
					}
					return 1
				})
				for ; k < len(us) && us[k].i < sx.j; k++ {
					if !us[k].r.hasUp(x.key) {
						continue
					}
					lo, hi := max(sx.i, us[k].i, est), min(sx.j, us[k].j)
					if lo < hi {
						e := uint64(xi)<<32 | uint64(yi)
						evs = append(evs, coneEv{lo, e, 1}, coneEv{hi, e, -1})
					}
				}
			}
		}
	}
	size := map[*net][]int32{}
	if len(evs) == 0 {
		return size
	}
	slices.SortFunc(evs, func(p, q coneEv) int { return p.i - q.i })
	type gkey struct {
		h1, h2 uint64
		n      int
	}
	memo := map[gkey][]nodeSize{}
	active := map[uint64]int32{}
	var h1, h2 uint64
	for k := 0; k < len(evs); {
		i := evs[k].i
		for ; k < len(evs) && evs[k].i == i; k++ {
			e := evs[k].e
			was := active[e] > 0
			active[e] += evs[k].d
			now := active[e] > 0
			if active[e] == 0 {
				delete(active, e)
			}
			if was != now {
				m1, m2 := mix64(e), mix64(e^0x9e3779b97f4a7c15)
				if now {
					h1, h2 = h1+m1, h2+m2
				} else {
					h1, h2 = h1-m1, h2-m2
				}
			}
		}
		end := N
		if k < len(evs) {
			end = evs[k].i
		}
		if len(active) == 0 || i >= end {
			continue
		}
		key := gkey{h1, h2, len(active)}
		res, ok := memo[key]
		if !ok {
			res = coneGraph(active)
			memo[key] = res
		}
		for _, r := range res {
			x := cand[r.node]
			v := size[x]
			if v == nil {
				v = make([]int32, N)
				size[x] = v
			}
			for s := i; s < end; s++ {
				v[s] = r.size
			}
		}
	}
	return size
}

type nodeSize struct {
	node uint32
	size int32
}

// coneGraph works out every node's cone size in one graph (edges from << 32 | to): nodes with a
// cone of at least one.
func coneGraph(edges map[uint64]int32) []nodeSize {
	// Compact node numbers and adjacency (CSR).
	loc := map[uint32]int32{}
	var ids []uint32
	id := func(n uint32) int32 {
		if v, ok := loc[n]; ok {
			return v
		}
		v := int32(len(ids))
		loc[n] = v
		ids = append(ids, n)
		return v
	}
	type pair struct{ f, t int32 }
	ps := make([]pair, 0, len(edges))
	for e := range edges {
		ps = append(ps, pair{id(uint32(e >> 32)), id(uint32(e))})
	}
	V := len(ids)
	start := make([]int32, V+1)
	for _, p := range ps {
		start[p.f+1]++
	}
	for i := range V {
		start[i+1] += start[i]
	}
	adj := make([]int32, len(ps))
	fill := slices.Clone(start[:V])
	for _, p := range ps {
		adj[fill[p.f]] = p.t
		fill[p.f]++
	}
	// Tarjan's strongly connected components, iterative. Components come out sinks first.
	comp := make([]int32, V)
	index := make([]int32, V)
	low := make([]int32, V)
	on := make([]bool, V)
	for i := range index {
		index[i] = -1
	}
	var stack, members []int32
	var cstart []int32 // members[cstart[c]:cstart[c+1]] are component c's
	type frame struct{ v, e int32 }
	var call []frame
	next := int32(0)
	for root := range int32(V) {
		if index[root] >= 0 {
			continue
		}
		call = append(call, frame{root, start[root]})
		index[root], low[root] = next, next
		next++
		stack = append(stack, root)
		on[root] = true
		for len(call) > 0 {
			f := &call[len(call)-1]
			v := f.v
			if f.e < start[v+1] {
				w := adj[f.e]
				f.e++
				if index[w] < 0 {
					index[w], low[w] = next, next
					next++
					stack = append(stack, w)
					on[w] = true
					call = append(call, frame{w, start[w]})
				} else if on[w] {
					low[v] = min(low[v], index[w])
				}
				continue
			}
			call = call[:len(call)-1]
			if len(call) > 0 {
				p := call[len(call)-1].v
				low[p] = min(low[p], low[v])
			}
			if low[v] == index[v] {
				c := int32(len(cstart))
				cstart = append(cstart, int32(len(members)))
				for {
					w := stack[len(stack)-1]
					stack = stack[:len(stack)-1]
					on[w] = false
					comp[w] = c
					members = append(members, w)
					if w == v {
						break
					}
				}
			}
		}
	}
	C := len(cstart)
	cstart = append(cstart, int32(len(members)))
	// Parents per component (distinct), to free a child's bitset once all have read it.
	parents := make([]int32, C)
	seen := make([]int32, C)
	for i := range seen {
		seen[i] = -1
	}
	for c := range C {
		for _, v := range members[cstart[c]:cstart[c+1]] {
			for _, w := range adj[start[v]:start[v+1]] {
				if d := comp[w]; d != int32(c) && seen[d] != int32(c) {
					seen[d] = int32(c)
					parents[d]++
				}
			}
		}
	}
	words := (V + 63) / 64
	reach := make([][]uint64, C) // what a component reaches outside itself, its members included for parents
	var out []nodeSize
	for i := range seen {
		seen[i] = -1
	}
	// Sinks first: every child is done before its parents.
	for c := range C {
		ms := members[cstart[c]:cstart[c+1]]
		var r []uint64
		for _, v := range ms {
			for _, w := range adj[start[v]:start[v+1]] {
				d := comp[w]
				if d == int32(c) || seen[d] == int32(c) {
					continue
				}
				seen[d] = int32(c)
				if r == nil {
					r = make([]uint64, words)
				}
				if rd := reach[d]; rd != nil {
					for k := range rd {
						r[k] |= rd[k]
					}
				}
				for _, u := range members[cstart[d]:cstart[d+1]] {
					r[u>>6] |= 1 << (u & 63)
				}
				if parents[d]--; parents[d] == 0 {
					reach[d] = nil
				}
			}
		}
		n := 0
		for _, x := range r {
			n += bits.OnesCount64(x)
		}
		// Inside a cycle every member reaches the others too.
		n += len(ms) - 1
		if n > 0 {
			for _, v := range ms {
				out = append(out, nodeSize{ids[v], int32(n)})
			}
		}
		if parents[c] > 0 {
			reach[c] = r
		}
	}
	return out
}
