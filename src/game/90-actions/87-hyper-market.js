/* ---------- Rivals, resale and launch freezes: actions (38-hyper-rivals.js, 38-hyper-resale.js, 38-hyper-freeze.js) ----------
   After 87-fiber-and-hardware.js, so addPair is there to wrap. */
Object.assign(ACT,{
 // Answer a rival's price war: match it (on 1, its cut off those tenants' bills until it ends) or stop matching (on 0).
 hsRvMatch:({on}={})=>{const P=hyper()&&S.hs&&S.hs.rv&&S.hs.rv.pw;if(!P||P.from>S.day||P.until<=S.day)return;P.m=on?1:0;
   toast(P.m?tr('hyper_rivals.matched_war',{rival:esc(hsRvN(P.w)),reg:REG[P.reg],p:pct(P.f),date:dateStr(P.until)}):tr('hyper_rivals.ignored_war',{rival:esc(hsRvN(P.w)),reg:REG[P.reg]}),P.m?'good':'');after();},
 // Sell to a carrier at the resale desk: a spare pair (an IRU, paid up front) or a wave on your own line system.
 hsrTake:({id}={})=>{const H=hyper()&&S.hs,o=H&&H.rs&&H.rs.o.find(x=>x.id===id);if(!o)return;const why=hsrWhy(o);if(why){toast(why,'bad');sfx('err');return;}
   const b=hsrSell(o),l=S.links.find(x=>x.id===o.l);
   const v={name:esc(b.name),a:CITY[l.a].name,b:CITY[l.b].name,g:fmtCap(o.g),up:fmt$(o.up),price:fmt$(o.mo)};
   toast(o.k==='iru'?tr('hyper_resale.sold_pair',v):tr('hyper_resale.sold_wave',v),'good');sfx('coin');after();},
 hsrNo:({id}={})=>{const H=hyper()&&S.hs;if(!H||!H.rs||!H.rs.o.some(x=>x.id===id))return;H.rs.o=H.rs.o.filter(x=>x.id!==id);toast(tr('hyper_resale.declined',{desk:HSR_DESK}),'');after();},
});
// Selling a wave changes the network: no sales during a launch freeze.
FREEZE_ACTS.push('hsrTake');
// A tenant offer a rival bid on: you sign at your price when you fit better, otherwise at the rival's.
{const f=ACT.accept;ACT.accept=a=>{const o=hyper()&&S.hs&&S.hs.rv&&a&&S.offers.find(x=>x.id===a.id),x=o&&o.type==='cloud'?hsRvOf(o):null;if(!x)return f(a);
  const F=hsRvFit(o,x),r0=o.rate,n=S.biz.length;if(!F.win)o.rate=Math.min(o.rate,x.bid);f(a);
  if(S.biz.length>n){delete S.hs.rv.of[o.id];S.hs.rv.bt++;toast(F.win?tr('hyper_rivals.beat',{rival:esc(hsRvN(x.w)),name:esc(o.name)}):tr('hyper_rivals.matched',{rival:esc(hsRvN(x.w)),name:esc(o.name),price:fmt$(o.rate*o.bw)}),'good');}
  else o.rate=r0;};}
// A pair sold as an IRU is the carrier's: you never light it.
{const f=ACT.addPair;ACT.addPair=a=>{const l=hyper()&&a&&S.links.find(x=>x.id===a.id),n=l&&l.kind==='df'?hsrIru(l):0;
  if(n&&Math.max(1,l.pairs|0)+1+n>pairsMax(l)){toast(tr('hyper_resale.pair_sold'),'bad');sfx('err');return;}return f(a);};}
