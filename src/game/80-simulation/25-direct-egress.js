/* A carrier's own transit port beats other transit ports for traffic bound for that carrier (tier 1) or for a network
   that buys transit from it (tier 2): the shorter AS path. A port set to carry pulls that traffic from every POP; any
   other only takes it at the POP it sits in. These ranks come after RouteScript's `prefer transit` (2.9) and before plain
   transit (3), and each port stays in the plain transit list too, so POPs far from it can still use it.
   DIRECT_RANK[tier] = [carries, this POP only]. compute() and traceroute() share this. */
const DIRECT_RANK=[null,[2.92,2.93],[2.94,2.95]];
const directTier=(carrier,dest)=>carrier===dest?1:(NET[dest].up&&NET[dest].up.includes(carrier))?2:0;
