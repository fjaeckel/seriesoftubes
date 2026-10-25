// Peering between teams: who ends up with a session at which exchange, and who pays whom.
// Pure functions over plain records so the rules are easy to test:
//   net = { asn, name, policy: {pol, min, fee}, ix: {rs: [ixId], ports: [ixId], names: {ixId: name}, served}, peers: [asn] }
'use strict';

const POLICIES = ['open', 'selective', 'restrictive', 'paid'];
const DEFAULT_POLICY = { pol: 'open', min: 0, fee: 0 };
const policyOf = (n) => ({ ...DEFAULT_POLICY, ...(n.policy || {}) });

/** Would `host` peer with `guest` over a route server? fee is what the guest pays the host each month. */
function accepts(host, guest) {
  const p = policyOf(host), served = (guest.ix && guest.ix.served) || 0;
  switch (p.pol) {
    case 'open': return { ok: true, fee: 0 };
    case 'selective': return served >= p.min ? { ok: true, fee: 0 } : { ok: false, why: `wants ${p.min} Gbps served first` };
    case 'paid': return served >= p.min ? { ok: true, fee: 0 } : { ok: true, fee: p.fee };
    default: return { ok: false, why: 'restrictive: bilateral requests only' };
  }
}

/** The session two teams have (or why they do not). */
function pair(a, b) {
  if ((a.peers || []).includes(b.asn)) return { up: true, via: 'bilateral', kind: 'bilateral', fee: 0 };
  const ra = (a.ix && a.ix.rs) || [], rb = new Set((b.ix && b.ix.rs) || []);
  const common = ra.filter((c) => rb.has(c));
  if (!common.length) {
    const pa = (a.ix && a.ix.ports) || [], pb = new Set((b.ix && b.ix.ports) || []);
    return { up: false, why: pa.some((c) => pb.has(c)) ? 'one of you has no route server session' : 'not on the same exchange' };
  }
  const ab = accepts(a, b), ba = accepts(b, a);
  if (!ab.ok || !ba.ok) return { up: false, why: !ab.ok ? `you are ${policyOf(a).pol}: ${ab.why}` : `they are ${policyOf(b).pol}: ${ba.why}`, ix: common[0] };
  const c = common[0];
  return { up: true, via: (a.ix.names && a.ix.names[c]) || c, kind: 'ix', ix: c, fee: ab.fee - ba.fee /* b pays a ab.fee; a pays b ba.fee; positive = a receives */ };
}

/** Everybody's peers: Map asn -> [{asn, name, via, kind, fee, policy}], fee from that network's point of view. */
function computePeers(nets) {
  const out = new Map(nets.map((n) => [n.asn, []]));
  for (let i = 0; i < nets.length; i++) for (let j = i + 1; j < nets.length; j++) {
    const a = nets[i], b = nets[j];
    const ab = pair(a, b), ba = pair(b, a);
    const bil = (a.peers || []).includes(b.asn) || (b.peers || []).includes(a.asn);
    const r = bil ? { up: true, via: 'bilateral', kind: 'bilateral', fee: 0 } : (ab.up && ba.up ? ab : null);
    if (!r) continue;
    out.get(a.asn).push({ asn: b.asn, name: b.name, via: r.via, kind: r.kind, fee: r.fee, policy: policyOf(b).pol });
    out.get(b.asn).push({ asn: a.asn, name: a.name, via: r.via, kind: r.kind, fee: -r.fee, policy: policyOf(a).pol });
  }
  return out;
}

/** What one network sees at each exchange it has a port on: the others there, their policies, and the state of the session. */
function exchangeView(nets, me) {
  const out = [];
  for (const c of (me.ix && me.ix.ports) || []) {
    const members = nets.filter((n) => n.asn !== me.asn && n.ix && (n.ix.ports || []).includes(c)).map((n) => {
      const p = pair(me, n), q = pair(n, me), pol = policyOf(n);
      return { asn: n.asn, name: n.name, pol: pol.pol, min: pol.min, fee: pol.fee, rs: (n.ix.rs || []).includes(c), up: p.up && q.up, why: p.up && q.up ? '' : (p.why || q.why || '') };
    });
    out.push({ ix: c, name: (me.ix.names && me.ix.names[c]) || c, rs: (me.ix.rs || []).includes(c), members });
  }
  return out;
}

module.exports = { POLICIES, DEFAULT_POLICY, policyOf, accepts, pair, computePeers, exchangeView };
