/* ---------- the lessor takes the address space back ---------- */
// Lair-us leases you the space behind the /31s on your point-to-point links. When it pulls a block, the link
// numbered from it stays dark until its interfaces are renumbered: 7 to 60 days, and short outages are far likelier
// than long ones. It strikes rarely, one link at a time, and not while an earlier revocation is still being renumbered.
const IPS_MIN=7,IPS_MAX=60;
const ipsDays=(u=Math.random())=>IPS_MIN+Math.floor((IPS_MAX-IPS_MIN+1)*u*u);
// Waves and lit fibers carrying traffic now (linkDown also covers a fiber still being built or left dark).
const ipsLinks=()=>S.links.filter(l=>(l.kind==='wave'||l.kind==='df')&&!linkDown(l));
function fireIpSpace(){
  const l=pick(ipsLinks());if(!l)return;
  const before=R.served,dur=ipsDays(),v={a:CITY[l.a].name,b:CITY[l.b].name,d:dur};l.cut=Math.max(l.cut||0,S.day+dur);
  const msg=pick([tr('ip_space.lair_us_who_leases_you_the',v),tr('ip_space.lair_us_reclaimed_unused_address_space',v),tr('ip_space.lair_us_lost_its_own_allocation',v),tr('ip_space.the_republic_of_paperworkistan_froze_lair',v)]);
  addInc({type:'ipspace',ref:l.id,until:l.cut,msg,cost:0});
  compute();
  const inc=S.inc[S.inc.length-1];inc.impact=Math.max(0,before-R.served);
  if(before>1&&inc.impact<before*0.03){S.stats.survived++;toast(`<b>${incTitle('ipspace')}</b><br>${esc(msg)} ${tr('failures.traffic_rerouted_customers_barely')}`,'good',[],incOpen(inc));}
  else toast(`<b>${incTitle('ipspace')}</b><br>${esc(msg)}`,'bad',[],incOpen(inc));
  sfx('alert');}
