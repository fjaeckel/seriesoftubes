// The reference player for the handmade scenarios (tests/scenarios-playtest.test.js), the sibling of scenario-bot.js
// (which plays the weekly ones). It plays inside the real game, headless, through the game's own actions, one plan
// step at a time whenever the bank allows it, plus the upkeep a careful human does every week: hot waves a size up, hot
// transit and exchange ports a LAG member, new peers at every exchange, routers before they fill.
//
// A plan is a list of steps, each [op, ...args]:
//   ['bb', c]  POP and broadband        ['tr', c, tier]  the cheapest transit there      ['ix', c, tier]  every exchange
//   ['pop', c]  a POP only               ['link', a, b, tier, cable]  a wave (routers upgraded first, a swap a day)
//   ['hire', orders, params]  the NOC intern on standing orders, as soon as the level allows
//   ['wait', day]  until that day        ['served', g]  until g Gbps are served           ['prep', c, g]  capacity for an event
//   ['scrub', c, tier]  a scrubbing center                    ['pnis']  a PNI with every unreached network that takes one
//   ['pni', c, net, tier]  one PNI with that network there   ['last', c]  transit there only as a last resort
//   ['loans']  take every loan the banks offer, from now on (the cheese plans)
const REF = String.raw`(()=>{
const Q=window.__ref={log:[]};
const quiet=f=>{const t=window.toast;window.toast=()=>{};try{return f();}finally{window.toast=t;}};
Q.reserve=()=>Math.max(40000,1.3*(R.costMo||0));
Q.can=x=>S.cash>=x+Q.reserve();
Q.cheap=c=>NETS.filter(n=>n.price&&sellsAt(n,c)&&!(Q.avoid||[]).includes(n.id)&&!S.transit.some(t=>t.city===c&&t.net===n.id)).sort((a,b)=>a.price*netMult(a,c)-b.price*netMult(b,c))[0];
Q.pop=c=>{if(!S.pops[c])ACT.buildPop({city:c});return !!S.pops[c];};
Q.bb=c=>{Q.pop(c);if(S.pops[c]&&!S.pops[c].bb)ACT.launchBB({city:c});return !!(S.pops[c]&&S.pops[c].bb);};
Q.tr=(c,tier=1)=>{Q.pop(c);const n=Q.cheap(c);if(!n)return true;ACT.buyTransit({city:c,net:n.id,tier});return true;};
Q.last=c=>{for(const t of S.transit)if(t.city===c)ACT.setPref({kind:'t',id:t.id,v:'low'});return true;};
Q.ix=(c,tier=1)=>{if(!S.pops[c])return false;for(const x of ixIdsIn(c)){if(!ixName(x))continue;if(S.ixp[x]===undefined)ACT.buyIx({city:x,tier,signed:true});if(S.ixp[x]===undefined)continue;if(!S.rs[x])ACT.rs({city:x});ACT.peerAll({city:x});}return true;};
// A wave: big waves need big routers at both ends, and a router swap takes a day, so the step waits (null) until they fit.
Q.link=(a,b,tier=1,via)=>{for(const c of [a,b])Q.pop(c);if(!S.pops[a]||!S.pops[b])return false;
  for(const c of [a,b])for(let k=0;k<4&&!waveOk(a,b,tier);k++){const g0=S.pops[c].rgen||0;ACT.upRouter({city:c});if((S.pops[c].rgen||0)===g0)break;}
  if(!waveOk(a,b,tier))return null;const n0=S.links.length;UI.via=via||null;UI.route=null;openLinkModal(a,b);ACT.buildLink({tier});closeModal();return S.links.length>n0;};
Q.hire=(orders,par)=>{Q.wantHire=[orders||['transit','routers','repair'],par||{}];return true;};
Q.hire0=(orders,par)=>{if(!opsCanHire()||!Q.can(20000))return false;if(!opsHired()){ACT.opsHire({id:'kevin'});closeModal();}if(!opsHired())return false;
  for(const k of orders)if(!S.ops.on[k])ACT.opsToggle({k});for(const k in par)for(const [p,v] of Object.entries(par[k]))for(let i=0;i<8&&opsP(k,p)!==v;i++)ACT.opsParam({k,p});closeModal();return true;};
Q.pnis=(tier=0)=>{for(const n of NETS.filter(n=>!R.reachable[n.id]).sort((a,b)=>NSH[b.id]-NSH[a.id])){const b=pniBatch(n.id,tier);if(!b||!b.orders.length||!Q.can(b.cost))continue;ACT.pniAll({net:n.id,tier});}return true;};
Q.pni=(c,net,tier=0)=>{if(!S.pni.some(p=>p.city===c&&p.net===net))ACT.pni({city:c,net,tier});closeModal();return S.pni.some(p=>p.city===c&&p.net===net);};
Q.scrub=(c,tier=0)=>{ACT.buildScrub({city:c,tier});return true;};
Q.loans=()=>{Q.loan=true;return true;};
Q.served=g=>R.served>=g||null;
Q.wait=d=>S.day>=d||null;
// Before an event: transit for the event on top of the usual peak, and routers that can take it.
Q.prep=(c,g)=>{const need=(S.stats.peak||R.served||0)*1.2+g*1.15,cap=()=>S.transit.filter(t=>t.city===c).reduce((a,t)=>a+PORT[t.tier].g*(t.n||1),0);
  for(let k=0;k<12&&cap()<need;k++){const t=S.transit.filter(t=>t.city===c).sort((a,b)=>PORT[a.tier].g*(a.n||1)-PORT[b.tier].g*(b.n||1))[0];if(!t)break;const c0=cap();
    if(t.tier<PORT.length-1&&PORT[t.tier+1].g>=need/4&&portOk(c,t.tier+1))ACT.buyTransit({city:c,net:t.net,tier:t.tier+1});else ACT.lagT({id:t.id,d:1});
    if(cap()===c0){if(t.tier<PORT.length-1&&!portOk(c,t.tier+1))ACT.upRouter({city:c});else break;}}
  for(let k=0;k<4;k++){const p=S.pops[c];if(!p||(p.routers||1)>=RMAX)break;const r0=p.routers||1;ACT.addRouter({city:c});if((p.routers||1)===r0)break;}return true;};
Q.est={pop:c=>S.pops[c]?0:popCost(c),bb:c=>(S.pops[c]?0:popCost(c))+bbCost(c),tr:()=>20000,pni:()=>20000,ix:()=>25000,hire:()=>0,scrub:(c,t)=>SCRUB_TIERS[t||0].cost,
  link:(a,b,t)=>(S.pops[a]?0:popCost(a))+(S.pops[b]?0:popCost(b))+waveMo(kmBetween(a,b),isSub(a,b),t)*2+20000};
Q.upkeep=()=>{
  for(const l of S.links){if(l.kind!=='wave'||l.tier>=LT.length-1||linkDown(l)||(R.load[l.id]||0)<LT[l.tier].g*0.75)continue;
    if(!waveOk(l.a,l.b,l.tier+1))for(const c of [l.a,l.b])if(!waveOk(l.a,l.b,l.tier+1)&&Q.can(80000))ACT.upRouter({city:c});
    if(Q.can(Math.round(waveMo(l.km,l.sub,l.tier+1)*(l.mult||1))*2))ACT.upLink({id:l.id,tier:l.tier+1});}
  for(const x in S.ixp)if(!(S.myIx&&S.myIx[x]))ACT.peerAll({city:x});
  if(!(opsHired()&&S.ops.on.transit))for(const t of S.transit.slice()){const u=(R.useT&&R.useT[t.id])||0,cap=lagCap(PORT[t.tier].g,t.n);if(u<cap*0.75)continue;
    if((t.n||1)<2||t.tier>=PORT.length-1||!portOk(t.city,t.tier+1)){if(Q.can(PORT[t.tier].setup+20000))ACT.lagT({id:t.id,d:1});if(lagCap(PORT[t.tier].g,t.n)===cap&&Q.can(80000))ACT.upRouter({city:t.city});}
    else if(Q.can(PORT[t.tier+1].setup+30000))ACT.buyTransit({city:t.city,net:t.net,tier:t.tier+1});}
  for(const x in S.ixp){if(S.myIx&&S.myIx[x])continue;const u=(R.useIx&&R.useIx[x])||0;if(u>=lagCap(PORT[S.ixp[x]].g,(S.ixn||{})[x])*0.75&&Q.can(30000))ACT.lagIx({city:x,d:1});}
  if(!(opsHired()&&S.ops.on.routers))for(const c in S.pops){if((R.nodeLoad[c]||0)/(R.nodeCap[c]||nodeCap(c)||1)>0.8&&Q.can(80000)){if((S.pops[c].routers||1)<2)ACT.addRouter({city:c});else ACT.upRouter({city:c});}}};
Q.step=()=>{for(let k=0;k<6;k++){const s=Q.steps[Q.i];if(!s)return;const [op,...a]=s;
  if(Q.est[op]&&!Q.can(Q.est[op](...a)))return;const ok=Q[op](...a);if(ok===null)return;Q.log.push(S.day+' '+op+' '+a.join(',')+(ok?'':' (failed)'));Q.i++;}};
Q.day=()=>quiet(()=>{if(Q.wantHire&&Q.hire0(...Q.wantHire)){Q.log.push(S.day+' hired');Q.wantHire=null;}
  if(Q.loan)for(const o of (S.loanOffers||[]).slice())ACT.takeLoan({id:o.id});closeModal();
  Q.step();if(S.day%7===0)Q.upkeep();});
Q.start=(steps,o={})=>quiet(()=>{Q.steps=steps;Q.i=0;Q.avoid=o.avoid||[];Q.step();});
})()`;

// Starts scenario `id` (with `seed`, or its own), plays `plan` for up to `days` days (default: the scenario's), and
// returns the day it was won (or null), whether the network went broke, and the end state.
function play(ev, id, plan, { seed, days, avoid } = {}) {
  ev(`localStorage.removeItem('sot-scn');beginGame('Ref',SCN.find(x=>x.id==='${id}').city,{scn:SCN.find(x=>x.id==='${id}')${seed ? ',seed:' + seed : ''}});if(UI.pendGame)ACT.pitchSkip();UI.speed=0;closeModal()`);
  if (ev('typeof __ref') === 'undefined') ev(REF);
  ev(`__ref.start(${JSON.stringify(plan)},${JSON.stringify({ avoid })})`);
  const n = days || ev('S.scn.days');
  return JSON.parse(ev(`(()=>{let won=null;for(let i=0;i<${n};i++){__ref.day();dayTick();closeModal();if(S.scn.done){won=S.scn.done;break;}if(S.lost||S.scn.failed)break;}
    return JSON.stringify({won,lost:!!S.lost,day:S.day,limit:S.scn.days,cash:Math.round(S.cash),served:Math.round(R.served)});})()`));
}

module.exports = { REF, play };
