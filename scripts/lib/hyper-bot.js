// The reference player for the Hyperscaler charter (tests/hyper-bot.test.js, tests/hyper-pace.test.js). It plays inside
// the real game, headless, through the game's own actions (ACT.*, openLinkModal + buildLink, the own-cable order), as a
// good human would: a launch at home with transit and an exchange port on day 0, an edge stack at the front door as soon
// as it pays, a NOC intern on standing orders for transit, routers and repairs, then a plan of regions continent by
// continent, each with a front door, waves to the last one and the next countries launched once it is live. It borrows
// from a bank with sane terms when a region is waiting on money, and grows the regions it has while the next one waits
// on a level. Every day it signs the cloud tenants and AI runs it has room, power and backbone for, trains a model of its
// own when the backbone between two regions can feed one, answers protests with a community fund (or heat reuse), asks
// the utility when a region needs power, grows regions and waves that run hot, pins each region's replica, drills every
// pair once its failover would hold, leases a colo cage for a region while a Server Barn is more than it has (and moves
// out into one later), adds availability zones to regions that run hot or met local outages, answers the regulators and lays its own cable across the Atlantic once it may. It
// never reads the goals, so the same seed always plays the same game. play() returns what it reached day by day.
// lazy (play({lazy:true})): a player who launches at home, opens a front door and then only signs what calls.
const BOT = String.raw`(()=>{
const B=window.__hsBot={log:[]};
// The plan: regions in order, each with the city its waves come from and the countries launched once it is live. A
// step with pop:1 only opens a front door there (London, the way across the Atlantic); its region comes later. Every
// continent gets two regions a short land hop apart, so each replicates and fails over next door instead of across
// an ocean of leased waves.
const PLAN=[
 {c:'fra',cc:['DE','AT','CH','CZ','DK','PL']},
 {c:'par',from:'fra',cc:['FR','BE','NL','LU','ES','IT','PT']},
 {c:'lon',from:'par',pop:1},
 {c:'nyc',from:'lon',cc:['US','CA','MX']},
 {c:'chi',from:'nyc',cc:[]},
 {c:'lon',from:'par',cc:['GB','IE','SE','NO','FI']},
 {c:'sao',from:'nyc',cc:['BR','AR','CL','CO']},
 {c:'rio',from:'sao',cc:[]},
 {c:'mrs',from:'par',pop:1},
 {c:'sin',from:'mrs',cc:['SG','MY','TH','PH','JP','KR','AU']},
 {c:'kul',from:'sin',cc:[]},
 {c:'jnb',from:'mrs',cc:['ZA','KE','EG','NG']},
 {c:'nbo',from:'jnb',cc:[]},
];
const H=()=>S.hs;
const cheapNet=c=>NETS.filter(n=>n.price&&sellsAt(n,c)&&!S.transit.some(t=>t.city===c&&t.net===n.id)).sort((a,b)=>a.price*netMult(a,c)-b.price*netMult(b,c)||(a.id<b.id?-1:1))[0];
const reserve=()=>Math.max(60000,0.5*(R.costMo||0));
const can=x=>S.cash>=x+reserve();
const net=()=>(R.revMo||0)-(R.costMo||0);
const quiet=f=>{const t=window.toast;window.toast=(...a)=>{B.toasts=(B.toasts||0)+1;};try{f();}finally{window.toast=t;}};
const pairOf=(a,b)=>S.links.filter(l=>(l.a===a&&l.b===b)||(l.a===b&&l.b===a));
// What the waves between a and b could still carry tonight.
const spare=(a,b)=>pairOf(a,b).filter(l=>!linkDown(l)).reduce((s,l)=>s+Math.max(0,capOf(l)-(R.load[l.id]||0)),0);
// A wave between a and b, over the cheapest cable the modal offers (the overland detour can cost 45 times as much).
function link(a,b,tier){UI.via=null;UI.route=null;openLinkModal(a,b);
  const vs=[...document.querySelectorAll('#modalCard [data-act="via"]')].map(x=>{const m=x.textContent.match(/([0-9.]+)×/);return [m?+m[1]:99,JSON.parse(x.dataset.args).v];}).sort((p,q)=>p[0]-q[0]);
  if(vs.length>1){UI.via=vs[0][1];openLinkModal(a,b);}const n=S.links.length;ACT.buildLink({tier});closeModal();return S.links.length>n;}
// A front door: transit and an exchange port with its route server.
function door(c){if(!S.pops[c])return;if(!S.transit.some(t=>t.city===c)){const n=cheapNet(c);if(n)ACT.buyTransit({city:c,net:n.id,tier:1});}
  for(const x of ixIdsIn(c)){if(S.ixp[x]!==undefined)break;if(!ixName(x))continue;ACT.buyIx({city:x,tier:1,signed:true});closeModal();if(S.ixp[x]!==undefined&&!S.rs[x])ACT.rs({city:x});break;}}
// Routers big enough for a wave of tier t between a and b.
function routersFor(a,b,t){for(const c of [a,b])for(let k=0;k<4&&S.pops[c]&&!waveOk(a,b,t);k++){const g0=S.pops[c].rgen||0,g=mainRG(RG[g0].cls+1);if(!RG[g]||!can(swapCost(c,g)+waveMo(kmBetween(a,b),isSub(a,b),t)*2))return false;ACT.upRouter({city:c});closeModal();if((S.pops[c].rgen||0)===g0)break;}return waveOk(a,b,t);}
B.start=()=>{quiet(()=>{const cc=CITY[S.home].cc;ACT.hsLaunch({cc});door(S.home);});B.i=0;};
// Room the regions have (and will have once what is being built opens).
function room(){let cap=0;for(const c in H().rg)cap+=H().rg[c].up?HS_T[H().rg[c].up.t].g:hsRgG(c);
  // With two regions or more, room for the biggest to fail over (N+1); alone, as full as it gets (the edge stack helps).
  const big=Math.max(...Object.values(H().rg).map(d=>HS_T[d.t].g));return Object.keys(H().rg).length>1?cap-big*0.5:cap*1.3;}
// Launch the next country of the live regions' lists, one a week, while what is launched could still fit.
function launches(){if(S.day<(B.nl||0))return;const rs=hsRgs(),rm=room();
  const pot=Object.keys(H().cc).reduce((a,k)=>a+hsPot(k),0);if(pot>rm*1.5||hsUsers()>rm*0.7)return;
  for(const P of PLAN){if(P.pop||!rs.includes(P.c))continue;for(const cc of P.cc){if(H().cc[cc]||hsWhy(cc)||!ccInfo(cc))continue;if(!can(hsLic(cc)*2))return;ACT.hsLaunch({cc});B.nl=S.day+7;return;}}}
// Transit that runs hot: a bigger port, or a second one beside it.
function transit(){for(const t of S.transit.slice()){const cap=PORT[t.tier].g*(t.n||1);if((R.useT[t.id]||0)<cap*0.8||S.transit.filter(x=>x.city===t.city).reduce((a,x)=>a+PORT[x.tier].g*(x.n||1),0)>2*hsUsers()+100)continue;
  const N=PORT[t.tier+1];if(N&&N.g<=4*cap&&portOk(t.city,t.tier+1)){if(can(N.setup*(t.n||1)*2))ACT.buyTransit({city:t.city,net:t.net,tier:t.tier+1});}else if(can(PORT[t.tier].setup*2))ACT.lagT({id:t.id,d:1});}}
// A leased cage instead of a Server Barn: when the Barn is more than the cash, the level allows a cage and the month
// can carry its lease (38-hyper-zones.js). It moves out into a Barn later (grow).
// One cage at a time, and only while the regions there are fill up: the next one waits for the move out of the last.
const cages=()=>Object.keys(H().rg).filter(c=>H().rg[c].t===HS_CAGE&&!H().rg[c].up);
const busy=()=>{const o=R.hs;if(!o)return 0;let g=0,l=0;for(const c in o.rg){g+=o.rg[c].g;l+=o.rg[c].load;}return g>0?(l+o.short)/g:0;};
const cageOk=()=>HS_T[HS_CAGE].lv<=lvl()&&!can(HS_T[1].cost)&&net()>HS_T[HS_CAGE].mo*1.2&&!cages().length&&busy()>=0.7;
const rgCost=()=>cageOk()?HS_T[HS_CAGE].cost+HS_T[HS_CAGE].mo*2:HS_T[1].cost;
// The plan's next step: a POP joined by a wave, a front door, then the region itself. B.save: saving up for it;
// B.wait: it waits on a level (more regions than the level allows), so growing the regions there are is the way on.
function expand(){const P=PLAN[B.i];B.save=false;B.wait=false;if(!P)return;const c=P.c;
  if(P.from){if(!hsRgs().includes(P.from)&&!S.pops[P.from])return;
    if(!S.pops[c]){const est=popCost(c)+waveMo(kmBetween(P.from,c),isSub(P.from,c),1)*3+40000;if(!P.pop&&hsRgN()>=hsRgMax()){B.wait=true;return;}if(!can(est+(P.pop?0:rgCost()))){B.save=true;return;}ACT.buildPop({city:c});closeModal();}
    if(!S.pops[c])return;if(!pairOf(P.from,c).length){if(!link(P.from,c,1))return;}
    door(c);}
  if(P.pop){if(hsDoor(c))B.i++;return;}
  if(!H().rg[c]&&hsRgN()<hsRgMax()&&cageOk()&&!hsColoWhy(c)&&can(rgCost())){ACT.hsColo({city:c});if(!H().rg[c])return;}
  if(!H().rg[c]){if(hsRgN()>=hsRgMax()){B.wait=true;return;}if(!can(HS_T[1].cost)){B.save=true;return;}if(hsMwFree(c)<HS_T[1].mw){if(!hsPw(c).q&&can(HS_Q_FEE))ACT.hsUtil({city:c});return;}ACT.hsRegion({city:c});if(!H().rg[c])return;}
  if(H().rg[c].ready<=S.day)B.i++;}
// Regions that run hot grow a tier; the utility is asked first when the metro has no megawatts for it.
function grow(){
  // A cage running hot moves out into a Server Barn once the money is there (the utility first if the metro is short),
  // before the next step of the plan: the lease is the dearest room it has.
  for(const c of cages()){const d=H().rg[c],x=R.hs&&R.hs.rg[c];if(!x||d.ready>S.day||x.load<x.g*0.75&&hsSlotsUsed(c)<hsSlots(c))continue;
    if(hsMwFree(c)<HS_T[1].mw){if(!hsPw(c).q&&can(HS_Q_FEE))ACT.hsUtil({city:c});continue;}if(can(HS_T[1].cost)){ACT.hsColoOut({city:c});return;}B.out=true;}
  if(B.save&&!B.wait&&!((R.hs&&R.hs.short)>200))return;for(const c of Object.keys(H().rg).sort()){const d=H().rg[c],x=R.hs&&R.hs.rg[c];if(!x||d.up||d.ready>S.day||d.t===HS_CAGE)continue;
  // A zone: room and slots for a fifth of the tier, and a bad day survived. Where the region runs hot or has met local outages.
  if(!hsAzWhy(c)&&(x.load>=x.g*0.7||(H().azo&&H().azo[c])>=1)&&hsMwFree(c)>=hsAzMw1(c)&&can(hsAzCost(c)*2)){ACT.hsZone({city:c});continue;}
  const N=hsTNext(d);if(!N||N.lv>lvl())continue;
  if(x.load<x.g*(hsRgs().length>1?0.6:0.8)&&hsSlotsUsed(c)<hsSlots(c)-1)continue;const need=N.mw-HS_T[d.t].mw;
  if(hsMwFree(c)<need){if(!hsPw(c).q&&can(HS_Q_FEE))ACT.hsUtil({city:c});continue;}if(hsProt(c)&&hsProt(c).kind==='block')continue;if(can(N.cost))ACT.hsRegion({city:c});}}
// Waves that run hot (70% or more between two cities): more of them, as widen() picks, while a Gbps of wave costs
// less than half of what a Gbps of users pays (a long subsea wave rarely does: a region there grows instead).
function waves(){const seen=new Set();for(const l of S.links.slice()){if(l.kind!=='wave'||linkDown(l))continue;const k=hsPk(l.a,l.b);if(seen.has(k))continue;seen.add(k);
  const ls=pairOf(l.a,l.b).filter(x=>x.kind==='wave'&&!linkDown(x)),cap=ls.reduce((s,x)=>s+capOf(x),0),ld=ls.reduce((s,x)=>s+(R.load[x.id]||0),0);if(ld<cap*0.7)continue;widen(l.a,l.b,ld-cap*0.6,0.1*(R.revMo||0),HS_RATE/2);}}
// Waves a pair no longer fills (under half of what is left without its dearest one) go back, dearest first, once a
// week: a training run or a backlog that needed them is over. Never on a pair a run is using or that is down.
function prune(){const busy=new Set();for(const j of H().jobs.concat(H().own))for(const [x,y] of hops(j.a,j.b))busy.add(hsPk(x,y));
  const rp=R.hs&&R.hs.rep||{};for(const c in rp)if(rp[c].f<0.97||hsLagAt(c)>1)for(const [x,y] of hops(c,rp[c].b))busy.add(hsPk(x,y));const seen=new Set();
  for(const l of S.links.slice()){if(l.kind!=='wave')continue;const k=hsPk(l.a,l.b);if(seen.has(k)||busy.has(k))continue;seen.add(k);const ls=pairOf(l.a,l.b).filter(x=>x.kind==='wave');
    if(ls.length<2||ls.some(linkDown))continue;const top=ls.slice().sort((x,y)=>(y.mo||0)-(x.mo||0))[0],cap=ls.reduce((s,x)=>s+capOf(x),0),ld=ls.reduce((s,x)=>s+(R.load[x.id]||0),0);
    if(ld<0.5*(cap-capOf(top))){ACT.rmLink({id:top.id});closeModal();return;}}}
// More backbone between a and b, for g Gbps more: one more wave beside the ones there at the size the routers already
// take (cheap and quick), else the smallest a tier up; max and perG cap what a wave may cost (a month, and a Gbps of it)
// until three years of it are small change (new routers only when they cost less than a good month). True if ordered.
function widen(a,b,g,max,perG){max=max||Infinity;perG=perG||Infinity;const rich=x=>S.cash>x*36;if(pairOf(a,b).some(linkDown))return false;const ls=pairOf(a,b).filter(l=>l.kind==='wave');if(!ls.length)return false;const t=Math.max(...ls.map(l=>l.tier)),mo=x=>Math.round(waveMo(ls[0].km,ls[0].sub,x));
  const cheap=mo(t)/LT[t].g<30;if(ls.length<(cheap?12:6)&&(cheap||LT[t].g>=g*0.5||ls.length<3)&&waveOk(a,b,t)){if(!rich(mo(t))&&(mo(t)>max||mo(t)/LT[t].g>perG))return false;if(!can(mo(t)*3)){B.poor=true;return false;}return link(a,b,t);}
  for(const l of ls.sort((x,y)=>x.tier-y.tier)){if(l.tier>=LT.length-1)continue;const T=l.tier+1;
    if(!waveOk(a,b,T)){const up=[a,b].reduce((s,c)=>{const g0=S.pops[c].rgen||0;if(T<=RG[g0].maxLT)return s;const n=mainRG(RG[g0].cls+1);return s+(RG[n]?swapCost(c,n):1e12);},0);if(up>Math.max(0,net()))continue;if(!routersFor(a,b,T))continue;}
    if(!rich(mo(T))&&(mo(T)-mo(l.tier)>max||(mo(T)-mo(l.tier))/(LT[T].g-LT[l.tier].g)>perG))continue;if(!can(mo(T)*3)){B.poor=true;return false;}ACT.upLink({id:l.id,tier:T});return true;}
  return false;}
// Replication that does not get through (a backlog growing: data at risk) gets more wave first, then a pair whose
// failover the backbone could not carry.
// The hops between a and b by waves (fewest first), as city pairs.
function hops(a,b){const prev={[a]:null},q=[a];while(q.length){const c=q.shift();if(c===b)break;for(const l of S.links){if(l.kind!=='wave'||linkDown(l))continue;const o=l.a===c?l.b:l.b===c?l.a:null;if(o&&!(o in prev)){prev[o]=c;q.push(o);}}}
  if(!(b in prev))return [];const out=[];for(let c=b;prev[c]!==null;c=prev[c])out.push([prev[c],c]);return out;}
// Each hop between a and b whose waves are full gets more.
function widenPath(a,b,g,max,perG){let did=false;for(const [x,y] of hops(a,b))if(spare(x,y)<g){if(!widen(x,y,g-spare(x,y),max,perG))return did;did=true;}return did;}
// B.risk: a backlog it could fix but cannot pay for yet, so the next region waits (data at risk comes first).
function failWaves(){const x=R.hs&&R.hs.rep;B.poor=false;B.risk=false;if(x)for(const c of Object.keys(x).sort()){const r=x[c];if(r.f<0.97||hsLagAt(c)>HS_RISK*0.4){const ok=widenPath(c,r.b,Math.max(r.want-r.got,100),0.1*(R.revMo||0),HS_RATE);B.risk=B.poor;if(ok)return;}}
  for(const c of hsRgs()){const I=hsFailInfo(c);if(!I.b||I.bw>=I.need||I.room<I.need)continue;if(widenPath(c,I.b,I.need-I.bw,0.02*(R.revMo||0),HS_RATE/2))return;}}
// Replicas: each region with the nearest other (inside the EU for EU regions), pinned; then a drill for every pair
// whose failover would hold tonight.
function replicas(){const rs=hsRgs();if(rs.length<2||H().dx||Object.keys(H().out).length)return;
  for(const c of rs){const cur=H().rep[c];const eu=HS_EU.includes(CITY[c].cc),L0=rs.filter(r=>r!==c&&hops(c,r).length),L1=L0.filter(r=>!eu||HS_EU.includes(CITY[r].cc)),L=L1.length?L1:L0;
    const b=L.sort((x,y)=>hops(c,x).length-hops(c,y).length||kmBetween(c,x)-kmBetween(c,y)||(x<y?-1:1))[0];
    // A closer region than the pinned replica (a sibling built next door) takes over, once what is owed is sent.
    if(b&&b!==cur&&(!cur||!H().rg[cur]||hops(c,b).length<hops(c,cur).length&&hsLagAt(c)<1))ACT.hsReplica({city:c,v:b});}
  if(H().dx||!can(HS_DRILL))return;for(const k of hsPairsUndrilled()){const [a,b]=k.split('|'),c=hsRepOf(a)===b?a:b;if(hsLive(c)&&hsFailReady(c)&&hsLagAt(c)<HS_RISK){ACT.hsDrill({city:c});return;}}}
// A bank loan with sane terms, while a region waits on money: no equity, no sharks, a rate it can carry (or a balloon or
// a slice of the transit bill, due in a year or more, when it will be bigger), and no condition that would stop the plan
// (no new subsea links, generators everywhere, an exchange it does not need).
const SAFE=['golf','fax','logo','app','nephew','yacht','pizza','forms','rural','nochina'];
const BAD=['oddpops','nosub','gen','spaetzle','tier3','hodl','blitz','continents2','peer30','reach99'];
function loans(){if(!B.save||S.loans.length>=2)return;for(const o of S.loanOffers.slice()){const K=BANKS[o.bank];if(!K||K.equity||K.shark||K.crypto||o.share)continue;
  const later=(o.model==='transit'||o.model==='balloon')&&o.term>=12;if(!later&&!(o.apr<=0.17&&o.pay<=0.5*Math.max(0,net())))continue;
  // A broken condition turns a balloon into monthly payments: those only with conditions that cannot break.
  if((o.covs||[]).some(k=>BAD.includes(k)||later&&!SAFE.includes(k)))continue;ACT.takeLoan({id:o.id});closeModal();return;}}
// Tenants and AI runs it has room, power and backbone for; protests answered with a community fund or heat reuse.
function deals(){for(const o of S.offers.slice()){if(o.type!=='cloud')continue;ACT.accept({id:o.id});}
  // An AI run between two regions whose path is cheap to widen pays millions on time: widen first, then take it.
  for(const o of H().jo.slice())if(!hsTrainWhy(o.a,o.b,o.g)&&H().jobs.length+H().own.length<2){const sp=spare(o.a,o.b)||spare(...(hops(o.a,o.b)[0]||[o.a,o.b]));if(sp>=o.g*0.6)ACT.hsJobTake({id:o.id});else widenPath(o.a,o.b,o.g-sp,0.05*(R.revMo||0),30);}
  for(const j of H().jobs){const x=R.hs&&R.hs.jobs&&R.hs.jobs[j.id];if(x&&x.got<x.want*0.9)widenPath(j.a,j.b,x.want-x.got,0.05*(R.revMo||0),30);}
  for(const c of Object.keys(H().prot)){const p=hsProt(c);if(!p)continue;if(!hsPw(c).heat&&hsLive(c)&&can(HS_HEAT))ACT.hsHeat({city:c});else if(hsPw(c).gw<HS_GW_WIN&&can(HS_FUND))ACT.hsFund({city:c});}
  // Edge stacks at every front door users come in through, the busiest first.
  const vs=R.hs?[...new Set(Object.values(R.hs.cc).map(o=>o.v).filter(Boolean))].sort():[];for(const c of vs)if(!H().edge[c]&&hsDoor(c)&&can(HS_EDGE_COST*1.5)){ACT.hsEdge({city:c});break;}
  // The regulators: Hotel California checks out; a price war in a continent with tenants is matched.
  const L=hsLaw();if(L&&L.egr&&L.egr.st==='open')ACT.hsEgress({v:'cut'});
  const W=H().rv&&H().rv.pw;if(W&&W.from<=S.day&&W.until>S.day&&!W.m)ACT.hsRvMatch({on:1});}
// A model of its own, when two regions have the slots and power and the backbone between them could feed it.
function model(){if(H().own.length||H().jobs.length||lvl()<3||S.day<(B.nm||0))return;const rs=hsRgs();if(rs.length<2)return;
  for(const k of [2,1,0]){const P=HS_OWN[k];for(const a of rs){const b=hsRepOf(a);if(!b||hsTrainWhy(a,b,P.g))continue;if(spare(a,b)<P.g*0.9)continue;
    const cost=2*hsTrainMw(P)*HS_MW_MO*(P.wk/4)*1.5;if(!can(cost)||net()<cost/4)continue;ACT.hsTrain({city:a,k,to:b});B.nm=S.day+60;return;}}}
// Its own cable across an ocean, once the level allows it: the cheapest of a few that join two continents (the
// Atlantic it already pays waves on, or a short hop from Europe to Africa), lit with what the optics team picks.
const CABS=[['lon','nyc'],['lis','tun'],['bde','cas'],['mia','baq']];
function cable(){const o=S.seatOff;if(o&&o.exp>S.day&&!S.links.some(l=>l.seat)){const c=seatCost(o.km,1)+[o.a,o.b].filter(x=>!S.pops[x]).reduce((a,x)=>a+popCost(x),0);if(can(c))ACT.seatBuy({n:1});}
  if(B.cab||!cabOpen()||S.day<(B.nc||0))return;B.nc=S.day+7;let best=null;
  for(const [a,b] of CABS){if(!isCity(a)||!isCity(b)||ownCabWhy(a,b))continue;const q=seaQuote(a,b,'standard'),c=q.cost+[a,b].filter(x=>!S.pops[x]).reduce((s,x)=>s+popCost(x),0);if(!best||c<best.c)best={a,b,c};}
  if(!best||!can(best.c*1.05))return;if(!S.pops[best.a]){ACT.buildPop({city:best.a});closeModal();if(!S.pops[best.a])return;}
  UI.pending={a:best.a,b:best.b};UI.seaDesign='standard';ACT.orderCable();UI.pending=null;B.cab=S.links.some(l=>l.kind==='df'&&l.own&&!l.seat&&l.sub);}
B.day=()=>{const d=S.day;quiet(()=>{
  if(!opsHired()&&opsCanHire()&&rule('clock')&&can(INTERN_MO)){ACT.opsHire({id:'kevin'});closeModal();if(opsHired())for(const k of ['transit','routers','repair'])if(!S.ops.on[k])ACT.opsToggle({k});closeModal();}
  deals();failWaves();B.out=false;if(d%3===0)grow();if(!B.risk&&!B.out)expand();loans();launches();transit();if(d%3===0){waves();model();}if(d%7===0)prune();replicas();cable();});};
// The lazy player: home, a front door, and whatever calls.
B.lazy=()=>{quiet(()=>{for(const o of S.offers.slice())if(o.type==='cloud')ACT.accept({id:o.id});});};
})()`;

const install = (ev) => { if (!ev('!!window.__hsBot')) ev(BOT); };

// A Hyperscaler game from day 0 (On-call unless rules say otherwise), the bot moving once a day for days days. Returns a
// row a month (day, level, cash, users Gbps, peak, regions, continents, tenants), the end state and the day each level
// and Cloud Nine came (lv[n], c9). stop: stop at Cloud Nine.
function play(ev, { home = 'fra', days = 365, preset = 'oncall', every = 30, lazy = false, stop = false } = {}) {
  install(ev);
  ev(`beginGame('Cloud Bot',${JSON.stringify(home)},{mode:'normal',preset:${JSON.stringify(preset)}});if(UI.pendGame)ACT.pitchSkip();ACT.charter({k:'hyper'});UI.speed=0;closeModal();__hsBot.start()`);
  return JSON.parse(ev(`(()=>{const rows=[],lv={};let c9=0;for(let i=0;i<${days};i++){${lazy ? '__hsBot.lazy()' : '__hsBot.day()'};dayTick();closeModal();if(S.lost)break;
    const l=S.lvl||1;if(!lv[l])lv[l]=S.day;if(S.hs.won&&!c9){c9=S.hs.won;if(${stop})break;}
    if(S.day%${every}===0)rows.push({day:S.day,lv:l,cash:Math.round(S.cash),users:Math.round(hsUsers()),peak:Math.round(S.stats.peak),rg:hsRgs().length,ct:hsCont(),ten:hsTen().length,cc:Object.keys(S.hs.cc).length,btw:Math.round(S.hs.bpk||0)});}
    return JSON.stringify({rows,lost:!!S.lost,day:S.day,lv,c9});})()`));
}

module.exports = { BOT, install, play };
