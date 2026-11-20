// The reference player for the Hyperscaler charter (tests/hyper-bot.test.js). It plays inside the real game, headless,
// through the game's own actions (ACT.*, openLinkModal + buildLink, the own-cable order), as a careful human would: a
// launch at home with transit and an exchange port on day 0, a NOC intern on standing orders for transit, routers and
// repairs, then a plan of regions continent by continent, each with a front door, waves to the last one and the next
// countries launched once it is live. Every day it signs the cloud tenants and AI runs it has room for, answers
// protests with a community fund, asks the utility when a region needs power, grows regions and waves that run hot,
// pins each region's replica and drills every pair once its failover would hold. It never reads the goals, so the same
// seed always plays the same game. play() returns what it reached day by day.
const BOT = String.raw`(()=>{
const B=window.__hsBot={log:[]};
// The plan: regions in order, each with the city its waves come from and the countries launched once it is live.
const PLAN=[
 {c:'fra',cc:['DE','AT','CH','CZ','DK','PL']},
 {c:'par',from:'fra',cc:['FR','BE','NL','LU']},
 {c:'lon',from:'par',cc:['GB','IE','ES','IT','PT','SE']},
 {c:'nyc',from:'lon',cc:['US','CA','MX']},
 {c:'sao',from:'nyc',cc:['BR','AR','CL','CO']},
 {c:'sin',from:'lon',cc:['SG','MY','TH','PH','JP','KR','AU']},
 {c:'jnb',from:'lon',cc:['ZA','KE','EG']},
];
const H=()=>S.hs;
const cheapNet=c=>NETS.filter(n=>n.price&&sellsAt(n,c)&&!S.transit.some(t=>t.city===c&&t.net===n.id)).sort((a,b)=>a.price*netMult(a,c)-b.price*netMult(b,c)||(a.id<b.id?-1:1))[0];
const reserve=()=>Math.max(80000,1.2*(R.costMo||0));
const can=x=>S.cash>=x+reserve();
const quiet=f=>{const t=window.toast;window.toast=(...a)=>{B.toasts=(B.toasts||0)+1;};try{f();}finally{window.toast=t;}};
const pairOf=(a,b)=>S.links.filter(l=>(l.a===a&&l.b===b)||(l.a===b&&l.b===a));
function link(a,b,tier){UI.via=null;UI.route=null;openLinkModal(a,b);ACT.buildLink({tier});closeModal();return pairOf(a,b).length>0;}
// A front door: transit and an exchange port with its route server.
function door(c){if(!S.pops[c])return;if(!S.transit.some(t=>t.city===c)){const n=cheapNet(c);if(n)ACT.buyTransit({city:c,net:n.id,tier:1});}
  for(const x of ixIdsIn(c)){if(S.ixp[x]!==undefined)break;if(!ixName(x))continue;ACT.buyIx({city:x,tier:1,signed:true});closeModal();if(S.ixp[x]!==undefined&&!S.rs[x])ACT.rs({city:x});break;}}
// Routers big enough for a wave of tier t between a and b.
function routersFor(a,b,t){for(const c of [a,b])for(let k=0;k<4&&S.pops[c]&&!waveOk(a,b,t);k++){const g0=S.pops[c].rgen||0;ACT.upRouter({city:c});closeModal();if((S.pops[c].rgen||0)===g0)break;}return waveOk(a,b,t);}
B.start=()=>{quiet(()=>{const cc=CITY[S.home].cc;ACT.hsLaunch({cc});door(S.home);});B.i=0;};
// Launch the next country of the live regions' lists, one a week, while what is launched could still fit the regions
// (and the ones being built) a little over.
function launches(){if(S.day<(B.nl||0))return;const rs=hsRgs();let cap=0;for(const c in H().rg)cap+=HS_T[H().rg[c].up?H().rg[c].up.t:H().rg[c].t].g;
  // With two regions or more, room for the biggest to fail over (N+1); alone, as full as it gets.
  const big=Math.max(...Object.values(H().rg).map(d=>HS_T[d.t].g)),room=Object.keys(H().rg).length>1?cap-big:cap*1.3;
  const pot=Object.keys(H().cc).reduce((a,k)=>a+hsPot(k),0);if(pot>room||hsUsers()>room*0.6)return;
  for(const P of PLAN){if(!rs.includes(P.c))continue;for(const cc of P.cc){if(H().cc[cc]||hsWhy(cc)||!ccInfo(cc))continue;if(!can(hsLic(cc)*2))return;ACT.hsLaunch({cc});B.nl=S.day+7;return;}}}
// Transit that runs hot: a bigger port, or a second one beside it.
function transit(){for(const t of S.transit.slice()){const cap=PORT[t.tier].g*(t.n||1);if((R.useT[t.id]||0)<cap*0.8||S.transit.filter(x=>x.city===t.city).reduce((a,x)=>a+PORT[x.tier].g*(x.n||1),0)>2*hsUsers()+100)continue;
  const N=PORT[t.tier+1];if(N&&N.g<=4*cap&&portOk(t.city,t.tier+1)){if(can(N.setup*(t.n||1)*2))ACT.buyTransit({city:t.city,net:t.net,tier:t.tier+1});}else if(can(PORT[t.tier].setup*2))ACT.lagT({id:t.id,d:1});}}
// The plan's next region: a POP joined by a wave, a front door, then the region itself.
function expand(){const P=PLAN[B.i];B.save=false;if(!P)return;const c=P.c;
  if(P.from){if(!hsRgs().includes(P.from))return;
    if(!S.pops[c]){const est=popCost(c)+waveMo(kmBetween(P.from,c),isSub(P.from,c),2)*3;if(hsRgN()>=hsRgMax())return;if(!can(est+HS_T[1].cost)){B.save=true;return;}ACT.buildPop({city:c});closeModal();}
    if(!S.pops[c])return;if(!pairOf(P.from,c).length){const t=routersFor(P.from,c,2)?2:1;if(!link(P.from,c,t))return;}
    door(c);}
  if(!H().rg[c]){if(hsRgN()>=hsRgMax())return;if(!can(HS_T[1].cost)){B.save=true;return;}if(hsMwFree(c)<HS_T[1].mw){if(!hsPw(c).q&&can(HS_Q_FEE))ACT.hsUtil({city:c});return;}ACT.hsRegion({city:c});if(!H().rg[c])return;}
  if(H().rg[c].ready<=S.day)B.i++;}
// Regions that run hot grow a tier; the utility is asked first when the metro has no megawatts for it.
function grow(){if(B.save)return;for(const c of Object.keys(H().rg).sort()){const d=H().rg[c],x=R.hs&&R.hs.rg[c];if(!x||d.up||d.ready>S.day)continue;const N=HS_T[d.t+1];if(!N||N.lv>lvl())continue;
  if(x.load<x.g*(hsRgs().length>1?0.55:0.8)&&hsSlotsUsed(c)<hsSlots(c)-1)continue;const need=N.mw-HS_T[d.t].mw;
  if(hsMwFree(c)<need){if(!hsPw(c).q&&can(HS_Q_FEE))ACT.hsUtil({city:c});continue;}if(hsProt(c)&&hsProt(c).kind==='block')continue;if(can(N.cost))ACT.hsRegion({city:c});}}
// Waves that run hot: a tier up (routers first), or a second wave beside it.
function waves(){for(const l of S.links.slice()){if(l.kind!=='wave'||linkDown(l))continue;const u=(R.load[l.id]||0)/capOf(l);if(u<0.7)continue;
  if(l.tier<LT.length-1&&routersFor(l.a,l.b,l.tier+1)){const nm=Math.round(waveMo(l.km,l.sub,l.tier+1)*(l.mult||1));if(can(nm*2))ACT.upLink({id:l.id,tier:l.tier+1});}
  else if(pairOf(l.a,l.b).length<3&&can(Math.round(waveMo(l.km,l.sub,l.tier)*3)))link(l.a,l.b,l.tier);}}
// A pair whose failover the backbone could not carry gets another wave beside the ones it has.
function failWaves(){for(const c of hsRgs()){const I=hsFailInfo(c);if(!I.b||I.bw>=I.need||I.room<I.need)continue;const ls=pairOf(c,I.b).filter(l=>l.kind==='wave');if(!ls.length||ls.length>=4)continue;
  const t=Math.max(...ls.map(l=>l.tier));if(can(Math.round(waveMo(ls[0].km,ls[0].sub,t)*3))){link(c,I.b,t);return;}}}
// Replicas: each region with the nearest other, pinned; then a drill for every pair whose failover would hold tonight.
function replicas(){const rs=hsRgs();if(rs.length<2||H().dx||Object.keys(H().out).length)return;for(const c of rs){if(H().rep[c]&&H().rg[H().rep[c]])continue;const b=hsRepSuggest(c,rs);if(b)ACT.hsReplica({city:c,v:b});}
  if(H().dx||!can(HS_DRILL))return;for(const k of hsPairsUndrilled()){const [a,b]=k.split('|'),c=hsRepOf(a)===b?a:b;if(hsLive(c)&&hsFailReady(c)&&hsLagAt(c)<HS_RISK){ACT.hsDrill({city:c});return;}}}
// Tenants and AI runs it has room and power for; protests answered with a community fund.
function deals(){for(const o of S.offers.slice()){if(o.type!=='cloud')continue;ACT.accept({id:o.id});}
  for(const o of H().jo.slice())if(!hsTrainWhy(o.a,o.b,o.g)&&H().jobs.length<2)ACT.hsJobTake({id:o.id});
  for(const c of Object.keys(H().prot)){const p=hsProt(c);if(p&&hsPw(c).gw<HS_GW_WIN&&can(HS_FUND))ACT.hsFund({city:c});}
  for(const c of hsRgs())if(!H().edge[c]&&hsDoor(c)&&can(HS_EDGE_COST*2))ACT.hsEdge({city:c});}
// Its own cable across the Atlantic, once the level allows it, lit with what the optics team picks.
function cable(){const o=S.seatOff;if(o&&o.exp>S.day&&!S.links.some(l=>l.seat)){const c=seatCost(o.km,1)+[o.a,o.b].filter(x=>!S.pops[x]).reduce((a,x)=>a+popCost(x),0);if(can(c))ACT.seatBuy({n:1});}
  if(B.cab||!cabOpen()||!S.pops.lon||!S.pops.nyc)return;const why=ownCabWhy('lon','nyc');if(why)return;const q=seaQuote('lon','nyc','standard');if(!can(q.cost*1.2))return;
  UI.pending={a:'lon',b:'nyc'};UI.seaDesign='standard';ACT.orderCable();UI.pending=null;B.cab=S.links.some(l=>l.kind==='df'&&l.own&&l.sub);}
B.day=()=>{const d=S.day;quiet(()=>{
  if(!opsHired()&&opsCanHire()&&rule('clock')&&can(INTERN_MO)){ACT.opsHire({id:'kevin'});closeModal();if(opsHired())for(const k of ['transit','routers','repair'])if(!S.ops.on[k])ACT.opsToggle({k});closeModal();}
  deals();expand();launches();transit();if(d%3===0){grow();waves();failWaves();}replicas();cable();});};
})()`;

const install = (ev) => { if (!ev('!!window.__hsBot')) ev(BOT); };

// A Hyperscaler game from day 0 (On-call unless rules say otherwise), the bot moving once a day for days days. Returns a
// row a month (day, level, cash, users Gbps, peak, regions, continents, tenants) and the end state.
function play(ev, { home = 'fra', days = 365, preset = 'oncall', every = 30 } = {}) {
  install(ev);
  ev(`beginGame('Cloud Bot',${JSON.stringify(home)},{mode:'normal',preset:${JSON.stringify(preset)}});if(UI.pendGame)ACT.pitchSkip();ACT.charter({k:'hyper'});UI.speed=0;closeModal();__hsBot.start()`);
  return JSON.parse(ev(`(()=>{const rows=[];for(let i=0;i<${days};i++){__hsBot.day();dayTick();closeModal();if(S.lost)break;
    if(S.day%${every}===0)rows.push({day:S.day,lv:S.lvl||1,cash:Math.round(S.cash),users:Math.round(hsUsers()),peak:Math.round(S.stats.peak),rg:hsRgs().length,ct:hsCont(),ten:hsTen().length,cc:Object.keys(S.hs.cc).length});}
    return JSON.stringify({rows,lost:!!S.lost,day:S.day});})()`));
}

module.exports = { BOT, install, play };
