// The reference player for weekly scenarios (scripts/weekly-scenario.js). It plays inside the real game, headless,
// through the game's own actions (ACT.*, openLinkModal + buildLink), as a careful human would: broadband, transit and
// an exchange port at home on day 0, a NOC intern on standing orders for transit and routers, then the generator's
// plan one step at a time whenever the bank allows it, upgrading any wave that runs hot. It never reads the goal, so the
// same seed and plan always play the same game, and the generator can calibrate a goal from what it reached.
const BOT = String.raw`(()=>{
const B=window.__wsBot={};
const cheapNet=(c,avoid)=>NETS.filter(n=>n.price&&sellsAt(n,c)&&!avoid.includes(n.id)&&!S.transit.some(t=>t.city===c&&t.net===n.id)).sort((a,b)=>a.price*netMult(a,c)-b.price*netMult(b,c))[0];
const reserve=()=>Math.max(60000,1.5*(R.costMo||0));
const can=x=>S.cash>=x+reserve();
const quiet=f=>{const t=window.toast;window.toast=()=>{};try{f();}finally{window.toast=t;}};
function link(a,b,tier,via){UI.via=via||null;UI.route=null;openLinkModal(a,b);ACT.buildLink({tier});closeModal();return S.links.some(l=>(l.a===a&&l.b===b)||(l.a===b&&l.b===a));}
function ix(c){if(!S.pops[c])return;for(const x of (B.plan&&B.plan.allIx?ixIdsIn(c):[c])){if(!ixName(x)||S.ixp[x]!==undefined)continue;ACT.buyIx({city:x,tier:1,signed:true});if(S.ixp[x]!==undefined&&!S.rs[x])ACT.rs({city:x});}}
// Before a big event: transit enough for the event on top of the usual peak, and routers that can take it.
function prep(E){const c=E.city,need=(S.stats.peak||R.served||0)*1.2+E.g*1.15;let cap=()=>S.transit.filter(t=>t.city===c).reduce((a,t)=>a+PORT[t.tier].g*(t.n||1),0);
  for(let k=0;k<12&&cap()<need;k++){const t=S.transit.filter(t=>t.city===c).sort((a,b)=>PORT[a.tier].g*(a.n||1)-PORT[b.tier].g*(b.n||1))[0];if(!t)break;const c0=cap();
    if(t.tier<PORT.length-1&&PORT[t.tier+1].g>=need/4&&portOk(c,t.tier+1))ACT.buyTransit({city:c,net:t.net,tier:t.tier+1});else ACT.lagT({id:t.id,d:1});if(cap()===c0)break;}
  for(let k=0;k<4;k++){const p=S.pops[c];if(!p||(p.routers||1)>=RMAX)break;const r0=p.routers||1;ACT.addRouter({city:c});if((p.routers||1)===r0)break;}}
B.start=(plan)=>{B.plan=plan;B.i=0;const c=S.scn.home||plan.home;quiet(()=>{
  ACT.launchBB({city:c});
  if(!scnRule('noTransit')){const n=cheapNet(c,plan.avoid||[]);if(n)ACT.buyTransit({city:c,net:n.id,tier:1});if(plan.tr2){const m=cheapNet(c,plan.avoid||[]);if(m)ACT.buyTransit({city:c,net:m.id,tier:1});}}
  ix(c);if(plan.scrub)ACT.buildScrub({city:c,tier:plan.scrub});});};
B.day=()=>{const P=B.plan,d=S.day;if(!P)return;quiet(()=>{
  // A month in, with the first bills paid: the intern keeps transit and routers ahead of the traffic.
  if(d===30&&opsCanHire()&&!opsHired()&&rule('clock')){ACT.opsHire({id:'kevin'});closeModal();if(opsHired())for(const k of ['transit','routers','repair'])if(!S.ops.on[k])ACT.opsToggle({k});closeModal();}
  if(d%7===0)for(const l of S.links){if(l.kind!=='wave'||l.tier>=LT.length-1||(R.load[l.id]||0)<LT[l.tier].g*0.7)continue;const nm=Math.round(waveMo(l.km,l.sub,l.tier+1)*(l.mult||1));if(can(nm))ACT.upLink({id:l.id,tier:l.tier+1});}
  if(P.event&&d>=P.event.day-21&&d<P.event.day&&d%7===0)prep(P.event);
  const s=P.steps[B.i];if(!s)return;
  if(s.k==='hop'){const [a,b,t,via]=s.v;if(!S.pops[a])return;const est=(S.pops[b]?0:popCost(b))+waveMo(kmBetween(a,b),isSub(a,b),t)*2+(P.bb?bbCost(b):0);if(!can(est))return;
    // Big waves need big routers at both ends: the POP first, then the routers, then the wave.
    if(!waveOk(a,b,t)){if(!S.pops[b])ACT.buildPop({city:b});for(const c of [a,b])for(let k=0;k<4&&S.pops[c]&&!waveOk(a,b,t);k++){const g0=S.pops[c].rgen||0;ACT.upRouter({city:c});if((S.pops[c].rgen||0)===g0)break;}}
    if(!link(a,b,t,via)){B.i++;return;}if(P.bb&&!S.pops[b].bb)ACT.launchBB({city:b});if(P.ix)ix(b);B.i++;}
  else if(s.k==='ix'){if(can(30000)){ix(s.v);B.i++;}}
  else if(s.k==='tr'){if(can(40000)&&!scnRule('noTransit')){const n=cheapNet(s.v,P.avoid||[]);if(n)ACT.buyTransit({city:s.v,net:n.id,tier:1});B.i++;}}
  else B.i++;});};
})()`;

const install = (ev) => { if (!ev('!!window.__wsBot')) ev(BOT); };

// Plays a weekly scenario file from day 0: the plan steps once a day, until the goal is met (when stop) or the days
// run out. Returns the day the goal was first met (or null), what the goal measure read each day, and the end state.
function play(ev, file, plan, { days, stop = true, measure = 'wsMeasure()' } = {}) {
  install(ev);
  ev(`localStorage.removeItem('sot-wkscn');wsBegin(${JSON.stringify(file)},'Ref');if(UI.pendGame)ACT.pitchSkip();UI.speed=0;closeModal()`);
  if (ev('!!(S.scn&&S.scn.wk)') !== true) throw new Error('the game would not start this scenario');
  ev(`__wsBot.start(${JSON.stringify(plan)})`);
  const won0 = ev('wsOk()'), n = days || ev('S.scn.days');
  // Each day: the bot moves, the day ticks (scnTick records a win), and we note the measure.
  const out = JSON.parse(ev(`(()=>{const m=[];let won=null;for(let i=0;i<${n};i++){__wsBot.day();dayTick();closeModal();m.push(+(${measure}).toFixed(3));if(won===null&&S.scn.done)won=S.scn.done;if(won!==null&&${stop})break;if(S.lost)break;}return JSON.stringify({won,m,lost:!!S.lost,day:S.day,cash:Math.round(S.cash)});})()`));
  return { won0, ...out };
}

module.exports = { BOT, install, play };
