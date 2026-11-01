/* A carrier's own transit port beats other transit ports for traffic bound for that carrier (tier 1) or for a network
   that buys transit from it (tier 2): the shorter AS path. A port set to carry pulls that traffic from every POP; any
   other only takes it at the POP it sits in. These ranks come after RouteScript's `prefer transit` (2.9) and before plain
   transit (3), and each port stays in the plain transit list too, so POPs far from it can still use it.
   DIRECT_RANK[tier] = [carries, this POP only]. compute() and traceroute() share this. */
const DIRECT_RANK=[null,[2.92,2.93],[2.94,2.95]];
const directTier=(carrier,dest)=>carrier===dest?1:(NET[dest].up&&NET[dest].up.includes(carrier))?2:0;
// What compute() needs of the rule, built once per call and kept out of compute(), whose size the JIT is sensitive to.
// prefc[ci]: 1 where a Prefer-marked transit port has the say, so the rule is off for flows from that POP.
// dirOf(id): the carriers you buy from that are direct for network id (itself: tier 1; one of its upstreams: tier 2), or null.
function directSetup(E,NC){const cars=new Set(),prefc=new Uint8Array(NC);
  for(const e of E)if(e.k==='t'){cars.add(e.net);if(e.pref==='high')prefc[e.ci]=1;}
  const dirOf=id=>{let m=null;if(cars.has(id))(m=new Map()).set(id,1);const up=NET[id].up;if(up)for(const u of up)if(cars.has(u)&&!(m&&m.has(u)))(m||(m=new Map())).set(u,2);return m;};
  return {prefc,dirOf};}
