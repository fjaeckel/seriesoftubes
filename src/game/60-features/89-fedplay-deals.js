/* ================= MULTIPLAYER GAMEPLAY: deals with other players =================
   Peering, transit, PNIs, ports on an exchange a player runs, capacity swaps, consortium cables and waves (§5.3, §10.10;
   waves in 89-fedplay-waves.js).
   A request is an offer signed on the other side's published terms (its announce is the basis): with `auto` it binds at
   once in the requester's game, with `review` it waits for the other player's accept, shown in their NOC dashboard.
   Running deals are kept in S.fed.deals, self-contained: {id (the offer's id), deal, key, name, asn, start, end, terms,
   role (buy, sell or peer: who pays), st (wait, run, over), on (running now: compute() reads only this), rep (Mbps the
   buyer reported, for a seller's books), why (how it ended), ai}. Prices change only at renewal; a decline ends a deal
   (depeering only costs a detour through transit). Nothing here runs in the day loop except fedPlayDay (swaps). */
const FEDP_PNI_G=10,FEDP_CONS_NAMES=['Brine Line','Deep Blue Tube','Salty Spaghetti','Kraken Express','Tidal Tube','Mermaid Mainline','Barnacle Backbone','Seaweed Skein'];
const fedMe=(s=S)=>s&&s.fed&&s.fed.key?s.fed.key.pub:null;
const fedRoleOf=(deal,mine)=>deal==='peering'||deal==='swap'?'peer':mine?'buy':'sell';
// A deal as the save keeps it, from an offer and when it starts (null: waiting for the accept).
function fedDealMk(rec,id,res,mine){const b=rec.body,k=mine?b.to:rec.key,n=fedNetOf(k);
  return {id,deal:b.deal,key:k,name:n?n.name:'AS?',asn:n?n.asn:0,start:res.start,end:res.end,terms:JSON.parse(JSON.stringify(b.terms)),role:fedRoleOf(b.deal,mine),
    st:res.start===null?'wait':'run',on:false,rep:0,why:'',ai:!!(n&&n.ai),renews:fedOwn(b,'renews')?b.renews:null};}
// The waiting or running deal that renews deal id, or null: a deal is renewed once.
const fedRenewal=(f,id)=>f.deals.find(d=>d.renews===id&&d.st!=='over')||null;
/* When a renewal of deal id (with key) bound at t starts (§10.10): when the deal it renews ends, or t when later, as
   fedDeal() has it, so the old and the new deal never run (and bill) together. Not a renewal: t. */
function fedRenStart(f,id,key,t){const o=id?f.deals.find(d=>d.id===id&&d.key===key):null;return o?Math.max(o.end??t,t):t;}
// A wave renewal takes over the room of the running wave it renews (same route, at least as big): it needs no more.
const fedWaveRen=(s,b,from)=>!!b.renews&&s.fed.deals.some(d=>d.id===b.renews&&d.key===from&&d.deal==='wave'&&d.role==='sell'&&d.st==='run'&&d.terms.a===b.terms.a&&d.terms.b===b.terms.b&&d.terms.gbps>=b.terms.gbps);
// A deal starts: one-off fees (a PNI's setup) move in this game only, the buyer pays and the seller earns.
function fedDealGo(d){if(d.deal==='pni'){const v=d.terms.setup||0;if(d.role==='buy')S.cash-=v;else if(d.role==='sell')S.cash+=v;}}
// Running now, by the clock (unix seconds): the flag compute() reads. Deals past their end are over.
function fedDealsOn(s,now){let ch=false;if(!s.fed)return false;
  for(const d of s.fed.deals){if(d.st!=='run'){if(d.on){d.on=false;ch=true;}continue;}
    // Renew is for the side that asks for deals (fpRenew), and only while no renewal follows.
    if(d.end!==null&&now>=d.end){d.st='over';d.on=false;d.why='term';ch=true;
      toast(tr('fedplay.deal_ran_out',{net:esc(d.name),deal:fedDealName(d.deal)}),'',d.role!=='sell'&&!fedRenewal(s.fed,d.id)?[{l:tr('fedplay.renew'),act:'fpRenew',args:{id:d.id}}]:[]);continue;}
    const on=d.start!==null&&d.start<=now&&!!fedNetOf(d.key);if(on!==d.on){d.on=on;ch=true;}}
  // Waves sold come off the seller's fiber (mwG() caches by CM_V); waves bought are links.
  if(ch)CM_V++;return fedWaveLinks(s)||ch;}
const FEDP_DN={peering:N_('fedplay.d_peering'),transit:N_('fedplay.d_transit'),pni:N_('fedplay.d_pni'),swap:N_('fedplay.d_swap'),consortium:N_('fedplay.d_consortium'),port:N_('fedplay.d_port'),wave:N_('fedplay.d_wave')};
const fedDealName=k=>tr(FEDP_DN[k]||FEDP_DN.peering);
// Ends a running or waiting deal here and tells the other side (a signed decline; queued, sent when online).
function fedEnd(s,d,why,reason){d.st='over';d.on=false;d.why=why;const f=s.fed;CM_V++;fedWaveLinks(s);
  (async()=>{try{const r=await fedSignMine('decline',{offer:d.id,to:d.key,reason},f);if(S===s)fedQueue(r,f);}catch(e){}})();}
// The other side's answer to an offer of theirs, signed and queued.
async function fedAnswer(s,rec,id,reason){try{const r=await fedSignMine('decline',{offer:id,to:rec.key,reason},s.fed);if(S===s)fedQueue(r,s.fed);}catch(e){}}

/* ---------- what can be asked of a player network, and what is missing ---------- */
// City pairs of this network's own links where the other player also has POPs at both ends (what a swap can back up).
function fedSwapPairs(n){const P=n.fpops||[];return [...new Set(S.links.filter(l=>!l.fsw&&P.includes(l.a)&&P.includes(l.b)).map(l=>l.a<l.b?l.a+'|'+l.b:l.b+'|'+l.a))];}
/* An offer to player network `key` on its published terms. o: {via, at, mbps, term} picks among them. Gives {miss: [{l,
   n}], terms} where something is missing, or {miss: [], terms, body, a} ready to sign. */
function fedOffer(key,deal,o={}){const n=fedNetOf(key),a=FEDN.ann.get(key);if(!n||!a||!a.rec)return {miss:[{l:'quiet'}]};
  // Listed by a joined server: no new deals with it (running ones go on until the exclusion is confirmed).
  if(fedExcl1(key))return {miss:[{l:'excluded'}]};
  // Without a box key (an announce from before sealed deals) nothing can be sealed for it: wait for a newer announce.
  if(n.fst==='dark'||FdK(a.rec.body.box))return {miss:[{l:'quiet'}]};
  const B=a.rec.body,R0=B.rates||{},p=fedPair(n),miss=[];let terms=null;
  if(!FEDP_DEALS.includes(deal)||deal==='consortium')return {miss:[{l:'terms'}]};
  if(!B.auto[deal]||B.auto[deal]==='decline')return {miss:[{l:'declines'}]};
  const term=r=>Math.max(r,fedInt(o.term,1,3650,0)),mb=fedInt(o.mbps,1,1e9,0);
  if(deal==='peering'){const via=o.via==='pni'?'pni':'ix';
    const at=via==='ix'?(o.at?[o.at].filter(c=>p.ix.includes(c)):p.ix.slice(0,16)):(o.at&&p.pops.includes(o.at)?[o.at]:p.pops.slice(0,1));
    if(!at.length)miss.push({l:via==='ix'?'ix':'pop'});if(B.policy==='selective')miss.push(...fedCondMiss(B.cond,fedMeFor(n)));terms={at,via};}
  else if(deal==='transit'){const r=R0.transit;if(!r)return {miss:[{l:'terms'}]};const at=o.at&&p.pops.includes(o.at)?o.at:p.pops[0];if(!at)miss.push({l:'pop'});
    const mbps=mb||(r.commit[0]?r.commit[0].mbps:1000);let off=0;for(const c of r.commit)if(c.mbps<=mbps)off=c.off;
    terms={mbps,perGbps:fedDiv(r.perGbps*(1000-off),1000),term:term(r.term),at:at?[at]:[]};}
  else if(deal==='pni'){const r=R0.pni;if(!r)return {miss:[{l:'terms'}]};const at=o.at&&p.pops.includes(o.at)?o.at:p.pops[0];if(!at)miss.push({l:'pop'});
    const port=r.ports.find(x=>x.mbps===mb)||r.ports[0];terms={at,mbps:port.mbps,setup:r.setup,monthly:port.monthly,term:term(r.term)};}
  else if(deal==='port'){const r=R0.ix;if(!r)return {miss:[{l:'terms'}]};const at=o.at&&r.at.includes(o.at)&&S.pops[o.at]?o.at:r.at.find(c=>S.pops[c]);if(!at)miss.push({l:'pop'});
    const port=r.ports.find(x=>x.mbps===mb)||r.ports[0];terms={at,mbps:port.mbps,monthly:port.monthly,term:term(30)};}
  else if(deal==='swap'){const prs=fedSwapPairs(n),pk=o.at&&prs.includes(o.at)?o.at:prs[0];if(!pk)miss.push({l:'link'});const [x,y]=(pk||'|').split('|'),mbps=mb||10000;
    terms={give:{a:x,b:y,mbps},take:{a:x,b:y,mbps},term:term(90)};}
  else if(deal==='wave'){const r=R0.wave;if(!r)return {miss:[{l:'terms'}]};
    // o.at: the route as "a|b"; o.mbps: the size (Mbps, as the other deals count).
    const rt=r.routes.find(x=>x.a+'|'+x.b===o.at)||r.routes.find(x=>S.pops[x.a]&&S.pops[x.b])||r.routes[0],sz=r.sizes.find(x=>x.gbps*1000===mb)||r.sizes[0],tier=fedWaveT(sz.gbps);
    if(!S.pops[rt.a]||!S.pops[rt.b])miss.push({l:'ends'});else if(tier<0||!waveOk(rt.a,rt.b,tier))miss.push({l:'gear',n:fmtCap(sz.gbps)});
    terms={a:rt.a,b:rt.b,gbps:sz.gbps,monthly:sz.monthly,term:term(r.term)};}
  if(B.policy!=='selective'&&B.cond&&!B.cond.ai&&S.fed.ai)miss.push({l:'ai'});
  // A newcomer buying from an established network pays the newcomer price (§10.10, 89-fedplay-mentor.js).
  terms=fedNewTerms(deal,terms,B,fedNow());
  if(miss.length)return {miss,terms};
  return {miss:[],terms,a,body:{to:key,deal,basis:a.id,terms}};}
/* Sends a request (§10.10): null when sent, or {miss} with what is missing, or a code ('off', 'quiet', 'dup', 'full',
   'mode' or the rule's error). With automatic acceptance it runs at once here. renews: the running deal it renews. */
async function fedRequest(key,deal,o={},renews=null){const s=S,f=s&&s.fed;if(!f||!f.on||!fedHasPriv(f)||!fedEligible(s))return 'off';
  if(!FEDN.ann.has(key))await fedPlayRefresh();if(S!==s)return 'mode';
  const x=fedOffer(key,deal,o);if(x.miss.length)return {miss:x.miss};
  if(!renews&&f.deals.some(d=>d.key===key&&d.deal===deal&&d.st!=='over'&&JSON.stringify(d.terms)===JSON.stringify(x.terms)))return 'dup';
  if(renews&&fedRenewal(f,renews.id))return 'dup';
  const body=x.body;if(renews)body.renews=renews.id;
  let r;try{r=await fedSignMine('offer',body,f);}catch(e){return {miss:[{l:'quiet'}]};}const id=await fedId(r);if(S!==s)return 'mode';
  const res=fedDeal([{id:x.a.id,kind:'announce',key,t:x.a.rec.t,body:x.a.rec.body}],{id,key:f.key.pub,t:r.t,body},null,renews?{id:renews.id,start:renews.start,end:renews.end??r.t}:null);
  if(!res.ok)return res.error;
  // Checked again: two taps on Renew sign two offers while WebCrypto works.
  if(renews&&fedRenewal(f,renews.id))return 'dup';
  if(!fedQueue(r,f))return 'full';
  // The record went out sealed; the deal is kept from the offer in clear.
  const d=fedDealAdd(f,fedDealMk({...r,body},id,res,true));if(d.st==='run')fedDealGo(d);fedDealsOn(s,fedNow());
  toast(d.st==='run'?tr('fedplay.deal_started',{net:esc(d.name),deal:fedDealName(deal)}):tr('fedplay.request_sent',{net:esc(d.name),deal:fedDealName(deal)}),d.st==='run'?'good':'');
  after();return null;}

/* ---------- offers, accepts and declines from other players (the core's deal events) ---------- */
// The conditions this network published, checked against a network asking (what this game knows of it).
function fedTheirMiss(s,b,from){const P=fedP(s),n=fedNetOf(from),T=b.terms,miss=[];
  if(b.deal==='peering'){const where=T.via==='ix'?fedMyIx():Object.keys(s.pops);if(!T.at.every(c=>where.includes(c)))miss.push({l:T.via==='ix'?'ix':'pop'});
    if(P.pol==='selective'){if(!n)return null;const p=fedPair(n);miss.push(...fedCondMiss(P.cond,{mbps:p.mbps,ratio:p.ratio,shared:p.shared,rpki:true,tier1:!!n.t1,ai:!!n.ai}));}}
  else if(b.deal==='transit'){if(!T.at.every(c=>s.pops[c]))miss.push({l:'pop'});}
  else if(b.deal==='pni'){if(!s.pops[T.at])miss.push({l:'pop'});}
  else if(b.deal==='port'){if(!s.myIx[T.at])miss.push({l:'myix'});}
  else if(b.deal==='swap'){if(!s.pops[T.take.a]||!s.pops[T.take.b])miss.push({l:'pop'});}
  else if(b.deal==='wave'){if(!fedWaveRen(s,b,from)&&!fedWaveRoom(T.a,T.b,T.gbps))miss.push({l:'room'});}
  if(n&&n.ai&&P.pol==='selective'&&!P.cond.ai)miss.push({l:'ai'});
  // The newcomer price claims the day the buyer joined: it must be the one its announce says, when this game has it.
  if(fedOwn(T,'founded')){const a=FEDN.ann.get(from);if(a&&a.rec&&a.rec.body.founded!==T.founded)miss.push({l:'newcomer'});}
  return miss;}
async function fedPlayDeal(e){const s=S,f=s&&s.fed;if(!f||!f.key||!fedEligible(s))return;const me=f.key.pub,r=e.rec,b=r.body,P=fedP(s);
  if(r.key===me)return;// this network's own records, echoed back
  if(r.kind==='offer'){
    if(b.deal==='consortium'&&!fedOwn(b,'to')){if(fedConsSeen(s,r,e.id))after();return;}
    if(b.to!==me||f.deals.some(d=>d.id===e.id)||P.rq.some(q=>q.id===e.id)||f.muted.includes(r.key))return;
    if((await fedShunned()).includes(r.key)){await fedAnswer(s,r,e.id,'excluded');return;}
    // A deal is renewed once: a second renewal of it (booked or waiting for review) is declined.
    if(b.renews&&(fedRenewal(f,b.renews)||P.rq.some(q=>q.rec.body.renews===b.renews))){await fedAnswer(s,r,e.id,'conditions');return;}
    const mine=P.mine.map(x=>({id:x.id,kind:'announce',key:me,t:x.t,body:x.body})),ren=b.renews?f.deals.find(d=>d.id===b.renews&&d.key===r.key):null;
    const res=fedDeal(mine,{id:e.id,key:r.key,t:r.t,body:b},null,ren?{id:ren.id,start:ren.start,end:ren.end??r.t}:null);
    if(!res.ok){if(res.error!=='not_found')await fedAnswer(s,r,e.id,res.error==='declined'?'declined':'conditions');return;}
    const miss=fedTheirMiss(s,b,r.key);if(S!==s)return;
    if(res.auto&&miss&&!miss.length){const d=fedDealAdd(f,fedDealMk(r,e.id,res,false));fedDealGo(d);fedDealsOn(s,fedNow());
      toast(tr('fedplay.they_started',{net:esc(d.name),deal:fedDealName(d.deal)}),'good');after();return;}
    if(res.auto&&miss&&miss.length){await fedAnswer(s,r,e.id,'conditions');return;}
    /* A full queue lets its oldest offer go with a decline, so that requester is not left waiting: the newest stay (a
       flood of offers cannot keep new ones out, and what waits longest is the least likely to be wanted). */
    const old=P.rq.length>=FEDP_RQ_MAX?P.rq.shift():null;P.rq.push({id:e.id,rec:r});const n=fedNetOf(r.key);
    toast(tr('fedplay.review_waiting',{net:esc(n?n.name:'AS?'),deal:fedDealName(b.deal)}),'goal',[{l:tr('fedplay.review'),act:'fpQueue',args:{}}]);after();
    if(old)await fedAnswer(s,old.rec,old.id,'declined');return;}
  if(r.kind==='accept'){const c=P.cons.find(x=>x.id===b.offer);if(c){if(fedConsSign(s,c,r.key))after();return;}
    const d=f.deals.find(x=>x.id===b.offer&&x.key===r.key&&x.st==='wait');if(!d||b.to!==me)return;
    const term=d.terms.term,st=fedRenStart(f,d.renews,d.key,r.t);d.start=st;d.end=term?st+term*FED_DAY:null;d.st='run';fedDealGo(d);fedDealsOn(s,fedNow());
    toast(tr('fedplay.accepted',{net:esc(d.name),deal:fedDealName(d.deal)}),'good');after();return;}
  if(r.kind==='decline'){const i=P.rq.findIndex(q=>q.id===b.offer&&q.rec.key===r.key);if(i>=0){P.rq.splice(i,1);after();return;}
    const d=f.deals.find(x=>x.id===b.offer&&x.key===r.key&&x.st!=='over');if(!d)return;const was=d.st;d.st='over';d.on=false;d.why=b.reason;CM_V++;fedWaveLinks(s);
    toast(was==='wait'?tr('fedplay.declined',{net:esc(d.name),deal:fedDealName(d.deal)}):b.reason==='depeer'?tr('fedplay.depeered',{net:esc(d.name)}):tr('fedplay.ended_by',{net:esc(d.name),deal:fedDealName(d.deal)}),'bad');after();}}
// Accepts an offer waiting for review: the deal starts at the accept's time (a renewal: when the deal it renews ends).
async function fedAcceptRq(id){const s=S,f=s&&s.fed,P=s&&s.fedp;if(!f||!P||!fedHasPriv(f))return 'off';const q=P.rq.find(x=>x.id===id);if(!q)return 'gone';
  const b=q.rec.body;if((await fedShunned()).includes(q.rec.key))return {miss:[{l:'excluded'}]};
  if(b.renews&&fedRenewal(f,b.renews))return 'dup';
  // A wave needs room on the route when it starts, not only when it was asked for (a renewal takes over its own).
  if(b.deal==='wave'){const T=b.terms;if(!fedWaveRen(s,b,q.rec.key)&&!fedWaveRoom(T.a,T.b,T.gbps))return {miss:[{l:'room'}]};}
  const r=await fedSignMine('accept',{offer:id,to:q.rec.key},f);if(S!==s)return 'mode';if(!fedQueue(r,f))return 'full';
  const term=b.terms.term,st=fedRenStart(f,b.renews,q.rec.key,r.t),d=fedDealMk(q.rec,id,{start:st,end:term?st+term*FED_DAY:null},false);
  P.rq=P.rq.filter(x=>x!==q);fedDealAdd(f,d);fedDealGo(d);fedDealsOn(s,fedNow());toast(tr('fedplay.deal_started',{net:esc(d.name),deal:fedDealName(d.deal)}),'good');after();return null;}
async function fedDeclineRq(id){const s=S,P=s&&s.fedp;if(!P)return 'off';const q=P.rq.find(x=>x.id===id);if(!q)return 'gone';P.rq=P.rq.filter(x=>x!==q);await fedAnswer(s,q.rec,id,'declined');after();return null;}

/* ---------- the hourly walk over running deals ---------- */
// Quiet (dark), shunned and muted networks end their deals with a NOC notice, never a bill; sellers learn what buyers report.
function fedDealsTick(s,now,shun,muted,stats){const f=s.fed,me=fedMe(s);let ch=false;if(!f)return false;
  for(const d of f.deals){if(d.st==='over')continue;const n=s.fedn&&s.fedn.nets.find(x=>x.k===d.key);
    if(muted.has(d.key)){fedEnd(s,d,'muted','depeer');ch=true;continue;}
    if(shun.has(d.key)){fedEnd(s,d,'excluded','excluded');ch=true;toast(tr('fedplay.ended_excluded',{net:esc(d.name)}),'bad');continue;}
    if(!n||n.st==='dark'){fedEnd(s,d,'quiet','quiet');ch=true;toast(tr('fedplay.ended_quiet',{net:esc(d.name)}),'bad');continue;}
    if(n.name!==d.name){d.name=n.name;ch=true;}if(!!n.ai!==d.ai){d.ai=!!n.ai;ch=true;}
    if(d.deal==='transit'&&d.role==='sell'){const st=stats.get(d.key),t=st&&Array.isArray(st.traffic)?st.traffic.find(x=>x.key===me):null,v=t?Math.max(t.in,t.out):0;if(v!==d.rep){d.rep=v;ch=true;}}}
  const P=s.fedp;if(P)for(const c of P.cons)if(c.st==='open'&&now-c.t>2592000){c.st='gone';ch=true;}
  return fedDealsOn(s,now)||ch;}
// Players whose traffic reaches this network with no deal between you: how peers are discovered.
function fedStrangers(s,stats){const me=fedMe(s),P=s.fedp;if(!P)return false;const out=[];
  for(const [k,b] of stats){if(k===me||!Array.isArray(b.traffic))continue;const t=b.traffic.find(x=>x.key===me);if(!t)continue;
    if(s.fed.deals.some(d=>d.key===k&&d.st!=='over'))continue;out.push({k,mbps:Math.max(t.in,t.out)});}
  out.sort((a,b)=>b.mbps-a.mbps||fedByStr(a.k,b.k));const v=out.slice(0,FEDP_STR_MAX);if(JSON.stringify(v)===JSON.stringify(P.str))return false;P.str=v;return true;}
// Depeering when the ratio drifts past this network's own conditions (half again over, so it does not flap).
async function fedDepeerDrift(s){const P=s.fedp,f=s.fed;if(!P||!f||P.pol!=='selective'||P.auto.peering!=='auto')return;let ch=false;
  for(const d of f.deals){if(!d.on||d.deal!=='peering')continue;const n=fedNetOf(d.key);if(!n)continue;const p=fedPair(n);
    if(p.mbps>=1000&&p.ratio>P.cond.maxRatio*1.5){fedEnd(s,d,'ratio','depeer');ch=true;toast(tr('fedplay.you_depeered',{net:esc(d.name),r:Math.round(p.ratio/100)}),'bad');}}
  if(ch)after();}

/* ---------- routing: the exits deals give (compute() and traceroute) ---------- */
// Exits for running deals, added to compute()'s list. Peering at an exchange joins that exchange's sessions instead.
function fedExits(E){const f=S.fed;if(!f||!f.deals.length)return;const lk=S.ev.leak&&S.ev.leak.until>S.day?S.ev.leak.net:null;
  for(const x of fedDealExits())E.push(x.k==='t'?mkEx('t',x.id,x.city,x.cap,3,'normal',x.lab,n=>n!==lk,null,x.net):mkEx('p',x.id,x.city,x.cap,2,'normal',x.lab,n=>x.set.has(n),[...x.set],x.net));}
// The same exits as plain descriptions: {k ('t' transit, 'p' private), id, city, cap (Gbps), lab, net (the player), set (reached)}.
function fedDealExits(){const out=[],f=S.fed;if(!f)return out;
  for(const d of f.deals){if(!d.on)continue;const n=fedNetOf(d.key);if(!n||n.fst==='dark')continue;const T=d.terms,id=n.id,one=new Set([id]),k='fed:'+d.id;
    if(d.deal==='peering'&&T.via==='pni'){for(const c of T.at)if(popUp(c))out.push({k:'p',id:k+':'+c,city:c,cap:FEDP_PNI_G,lab:labOf(N_('common.pni_with_net'),'net',n.name),net:id,set:one});}
    else if(d.deal==='pni'){if(popUp(T.at))out.push({k:'p',id:k,city:T.at,cap:T.mbps/1000,lab:labOf(N_('common.pni_with_net'),'net',n.name),net:id,set:one});}
    else if(d.deal==='transit'){for(const c of T.at)if(popUp(c))out.push(d.role==='buy'?{k:'t',id:k+':'+c,city:c,cap:Math.max(1,T.mbps/1000*2),lab:labOf(N_('common.net_transit'),'net',n.name),net:id,set:null}
      :{k:'p',id:k+':'+c,city:c,cap:Math.max(1,T.mbps/1000*2),lab:labOf(N_('fedplay.ex_customer'),'net',n.name),net:id,set:one});}
    else if(d.deal==='port'&&popUp(T.at)){let set=one;if(d.role==='buy'){set=new Set([id]);for(const m of NETS)if(m.fed&&m.fst!=='dark'&&m.fpol==='open'&&(m.fix||[]).includes(T.at))set.add(m.id);}
      out.push({k:'p',id:k,city:T.at,cap:T.mbps/1000,lab:labOf(d.role==='buy'?N_('fedplay.ex_port'):N_('fedplay.ex_member'),'net',n.name),net:id,set});}}
  return out;}
// Peering sessions at an exchange (ixSessions): players you peer with there.
function fedIxSes(c,set){const f=S.fed;if(!f)return;for(const d of f.deals)if(d.on&&d.deal==='peering'&&d.terms.via==='ix'&&d.terms.at.includes(c)){const n=fedNetOf(d.key);if(n&&n.fst!=='dark')set.add(n.id);}}
// The same exits for the traceroute (trExits).
function fedTrExits(net,out){if(!S.fed)return;const lk=S.ev.leak&&S.ev.leak.until>S.day?S.ev.leak.net:null;
  for(const x of fedDealExits()){if(x.k==='t'){if(net!==lk)out.push({k:'t',rank:3,city:x.city,pref:'normal',carry:false,lab:x.lab,tnet:x.net,used:R.useT[x.id]||0,cap:x.cap});}
    else if(x.set.has(net))out.push({k:'p',rank:2,via:x.net===net?null:x.net,city:x.city,pref:'normal',lab:x.lab,used:R.usePni[x.id]||0,cap:x.cap});}}
// Where a network is, for the traceroute's far end: a player network's own POPs.
const trPops=N=>N.fpops&&N.fpops.length?N.fpops:N.pops;

/* ---------- stats: traffic with each player network (§5.2), for the traffic board ---------- */
/* Reported traffic (Mbps) in steps of about 20% (1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8 per decade): a stats record goes
   out whenever its body changes (fedStatsTick), and exact figures change every slot, which would send a record every
   5 minutes per player instead of about hourly, swelling relays and every board download for no ranking gain. */
const FED_STEPS=[1,1.2,1.5,2,2.5,3,4,5,6,8,10];
const fedStep=v=>{if(!(v>0))return 0;const e=10**Math.floor(Math.log10(v)),m=v/e;let b=1;for(const x of FED_STEPS)if(Math.abs(x-m)<Math.abs(b-m))b=x;return Math.min(1e9,Math.round(b*e));};
function fedTrafficList(){const out=[],me=fedMe();if(!R||!S.fedn||!me)return out;const m=fedMyMix();
  for(const n of S.fedn.nets){if(n.k===me)continue;const N=fedNetOf(n.k);if(!N)continue;const e=R.netEg[N.id];let inM=e?Math.round(((e.p||0)+(e.ix||0))*1000):0;
    for(const d of S.fed.deals)if(d.on&&d.key===n.k&&d.deal==='transit')inM+=d.role==='buy'?Math.round(fedExUse(d)*1000):(d.rep||0);
    if(inM<=0)continue;const outM=Math.round(inM*(m.content+100)/(n.mix[0]+100));out.push({key:n.k,in:fedStep(inM),out:fedStep(outM)});}
  return out.sort((a,b)=>Math.max(b.in,b.out)-Math.max(a.in,a.out)||fedByStr(a.key,b.key)).slice(0,256);}
// total: the network's whole traffic, what the HUD shows as traffic served (Gbps), in Mbps (§5.2).
// cust, up: the transit deals running (the cone board counts an edge both sides list); tier2: Tier 2 or better.
FED.hooks.stats=b=>{try{if(S&&S.fed){b.traffic=fedTrafficList();b.total=fedStep(((R&&R.served)||0)*1000);
  const l=fedTransitLists(S);if(l.cust.length)b.cust=l.cust;if(l.up.length)b.up=l.up;b.tier2=b.tier1||isTier2();}}catch(e){}return b;};
// Offers and accepts the core passes on besides those to or from this network: open consortium projects and their signers.
FED.hooks.deal=r=>r.kind==='offer'&&r.body.deal==='consortium'&&!fedOwn(r.body,'to')||r.kind==='accept'&&!!(S&&S.fedp&&S.fedp.cons.some(c=>c.id===r.body.offer));

/* ---------- consortium cables: a project lists its signers; once funded every member gets fibre pairs ---------- */
/* A project's share is what its author's game asked; it is never under the honest price in this game (a share of 0
   would be a free cable), so it shows and costs at least that (fedConsShare, which moves with this game's market). */
function fedConsSeen(s,r,id){const P=fedP(s),T=r.body.terms;if(P.cons.some(c=>c.id===id)||!own(CITY,T.a)||!own(CITY,T.b)||T.a===T.b)return false;
  if(P.cons.length>=FEDP_CONS_MAX){const i=P.cons.findIndex(c=>c.st!=='open');if(i<0)return false;P.cons.splice(i,1);}
  P.cons.push({id,k:r.key,name:fedSafeName(T.name),a:T.a,b:T.b,m:T.members,sh:Math.max(T.share,fedConsShare(T.a,T.b,T.pairs)),pr:T.pairs,sg:[r.key],t:r.t,st:'open',me:r.key===fedMe(s)});return true;}
function fedConsSign(s,c,key){if(c.st!=='open'||c.sg.includes(key)||c.sg.length>=16)return false;c.sg.push(key);fedConsCheck(s,c);return true;}
// Funded once enough have signed: each member's game lays its own fibre pairs and pays its own share.
function fedConsCheck(s,c){if(c.st!=='open'||c.sg.length<c.m)return;c.st='funded';if(!c.me)return;
  const km=seatKm(c.a,c.b),id=uid();c.sh=Math.max(c.sh,fedConsShare(c.a,c.b,c.pr));
  s.links.push({id,a:c.a,b:c.b,kind:'df',own:true,sub:true,seat:true,seaDesign:'standard',sys:'roadm',ch:[],km,cable:null,cname:c.name,mo:seatMo(km,c.pr),trench:'seat:'+id,cut:0,day:s.day,ready:s.day+seatDays(km),spares:false,pairs:c.pr,paid:c.sh});
  s.cash-=c.sh;toast(tr('fedplay.cons_funded',{name:esc(c.name),n:c.sg.length,a:CITY[c.a].name,b:CITY[c.b].name}),'goal');}
const fedConsShare=(a,b,pairs)=>Math.round(seatCost(seatKm(a,b),pairs)*0.8);
async function fedConsNew(a,b,pairs,members){const s=S,f=s&&s.fed;if(!f||!f.on||!fedHasPriv(f))return 'off';
  if(!own(CITY,a)||!own(CITY,b)||a===b||!s.pops[a]||!s.pops[b])return 'city';pairs=clamp(pairs|0,1,16);members=clamp(members|0,2,16);
  const share=fedConsShare(a,b,pairs);if(s.cash<share)return 'cash';
  const name=`${FEDP_CONS_NAMES[hstr(a+b+s.day)%FEDP_CONS_NAMES.length]} ${a.toUpperCase()}–${b.toUpperCase()}`;
  const r=await fedSignMine('offer',{deal:'consortium',terms:{name,a,b,members,share,pairs}},f),id=await fedId(r);if(S!==s)return 'mode';if(!fedQueue(r,f))return 'full';
  fedConsSeen(s,r,id);toast(tr('fedplay.cons_open',{name:esc(name),n:members}),'good');after();return null;}
async function fedConsJoin(id){const s=S,f=s&&s.fed,P=s&&s.fedp;if(!f||!f.on||!P||!fedHasPriv(f))return 'off';const c=P.cons.find(x=>x.id===id);
  if(!c||c.st!=='open'||c.me)return 'gone';c.sh=Math.max(c.sh,fedConsShare(c.a,c.b,c.pr));if(s.cash<c.sh)return 'cash';
  const r=await fedSignMine('accept',{offer:id,to:c.k},f);if(S!==s)return 'mode';if(!fedQueue(r,f))return 'full';
  c.me=true;fedConsSign(s,c,f.key.pub);if(c.st==='open')toast(tr('fedplay.cons_signed',{name:esc(c.name),n:c.sg.length,m:c.m}),'good');after();return null;}

/* ---------- capacity swaps: a partner carries your traffic while your cable is cut (from the day, dayPost) ---------- */
// Gives true when a restoration wave came or went (the day routes again).
function fedPlayDay(){const f=S.fed;if(!f)return false;let ch=fedWaveLinks(S);
  for(const d of f.deals){if(d.deal!=='swap')continue;const T=d.terms.take,has=S.links.find(l=>l.fsw===d.id);
    const mine=S.links.filter(l=>!l.fsw&&(l.a===T.a&&l.b===T.b||l.a===T.b&&l.b===T.a)),cut=d.on&&mine.length>0&&mine.every(linkDown);
    if(cut&&!has&&popUp(T.a)&&popUp(T.b)){let tier=LT.findIndex(x=>x.g*1000>=T.mbps);if(tier<0)tier=LT.length-1;
      S.links.push({id:uid(),a:T.a,b:T.b,kind:'wave',border:false,premium:false,tier,km:kmBetween(T.a,T.b),sub:false,cable:null,mo:0,mult:1,trench:'fsw:'+d.id,cut:0,day:S.day,fsw:d.id});
      fedP().help++;ch=true;toast(tr('fedplay.swap_on',{net:esc(d.name),a:CITY[T.a].name,b:CITY[T.b].name}),'good');}
    else if(has&&!cut){S.links=S.links.filter(l=>l!==has);ch=true;toast(tr('fedplay.swap_off',{net:esc(d.name),a:CITY[T.a].name,b:CITY[T.b].name}),'good');}}
  return ch;}

/* ---------- shared incidents: a route leak spreading through the federation ---------- */
/* Every game picks the same leaker on the same real day from the networks it knows (a hash of the day and the keys), on
   about one day in FEDP_LEAK. It reaches the leaker's direct partners and, through player transit that does not filter,
   their customers; a network that filters with RPKI drops it (contained), any other gets the leak incident. */
function fedLeakCheck(s,now){const P=fedP(s),f=s.fed,D=fedDiv(now,FED_DAY);if(P.leakD===D||!f||!f.key)return false;P.leakD=D;
  if(hstr('leak|'+D)%FEDP_LEAK!==0||!s.fedn)return true;const me=f.key.pub,keys=[me,...s.fedn.nets.filter(n=>n.st==='active').map(n=>n.k)];
  const lk=keys.reduce((a,k)=>hstr(D+'|'+k)<hstr(D+'|'+a)?k:a,keys[0]),run=f.deals.filter(d=>d.on);
  if(lk===me){if(run.length){s.cash-=2500;toast(tr('fedplay.leak_mine',{n:run.length}),'bad');}return true;}
  const ln=fedNetOf(lk);if(!ln)return true;
  const hop=run.some(d=>d.key===lk)||run.some(d=>d.deal==='transit'&&d.role==='buy'&&(()=>{const a=FEDN.ann.get(d.key);return !(a&&a.rec&&a.rec.body.cond&&a.rec.body.cond.rpki);})()&&d.key!==lk&&FEDN.ann.has(lk));
  if(!hop)return true;
  if(P.rpki){toast(tr('fedplay.leak_held',{net:esc(ln.name)}),'good');return true;}
  const dst=['nfx','ggl','fbk','amz','msf'][hstr(lk+D)%5];s.ev.leak={net:dst,until:s.day+3};
  addInc({type:'leak',ref:dst,until:s.day+3,msg:tr('fedplay.leak_hit',{net:ln.name,dst:NET[dst].name}),cost:0});toast(tr('fedplay.leak_hit',{net:esc(ln.name),dst:esc(NET[dst].name)}),'bad');return true;}
