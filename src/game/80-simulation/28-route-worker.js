/* Routing off the main thread. The worker is this page's own game script run a second time
   from a Blob URL: nothing is fetched, so GitHub Pages still serves one page. In the worker, DOM globals are inert
   stand-ins and boot() never runs; the catalogs (cities, networks, cones) are rebuilt from the same code.
   Only the day uses it: the day is a generator (dayRun(), 10-day-tick.js) whose every yield is a routing it needs.
   Each one goes to the worker with S, the day waits (no next day starts) and goes on when R is back, so a day sees
   exactly the routing it would have had in one go. An action in between routes synchronously as always (compute()
   bumps RW.gen); then the worker's answer is stale and the action's R stands.
   Tests (no Worker in jsdom, __TUBES_TEST__) and any worker failure take the synchronous path. */
const RW_IN=!!self.__TUBES_WORKER__;
const RW_EL=!RW_IN&&typeof document!=='undefined'?document.currentScript:null;
const RW={w:null,dead:false,seq:0,gen:0,job:null,budget:8,later:f=>rwLater(f),stat:{n:0,post:0,de:0,apply:0,wait:0,work:0}};
function rwOn(){return !RW_IN&&!RW.dead&&!window.__TUBES_TEST__&&!window.__TUBES_SYNC__&&typeof Worker==='function'&&!!RW_EL;}
function rwStart(){if(RW.w)return RW.w;
  try{const L=LANG,dict=L!=='en'&&window.I18N[L]?JSON.stringify(window.I18N[L]):'null';
    const pre=`'use strict';self.__TUBES_WORKER__=1;self.window=self;
const _n=new Proxy(function(){},{get:(t,k)=>k===Symbol.toPrimitive?()=>0:k==='then'?undefined:_n,apply:()=>_n,construct:()=>_n,set:()=>true});
const _st={getItem:()=>null,setItem(){},removeItem(){},key:()=>null,length:0};
Object.assign(self,{document:_n,localStorage:_st,sessionStorage:_st,requestAnimationFrame:()=>0,cancelAnimationFrame(){},innerWidth:1280,innerHeight:800,devicePixelRatio:1,
  matchMedia:()=>({matches:false,addEventListener(){},addListener(){}}),Image:_n,Audio:_n,screen:_n,visualViewport:_n,history:_n,getComputedStyle:_n,ResizeObserver:_n,MutationObserver:_n,IntersectionObserver:_n,Path2D:_n,scrollTo(){},SOT_LANG:${JSON.stringify(L)},SOT_LANGS:{},I18N:{}});
if(${dict})self.I18N[${JSON.stringify(L)}]=${dict};
`;
    const url=URL.createObjectURL(new Blob([pre,RW_EL.textContent,'\n;self.onmessage=e=>rwServe(e.data);'],{type:'text/javascript'}));
    const w=RW.w=new Worker(url);URL.revokeObjectURL(url);
    w.onmessage=e=>{const t=performance.now(),m=e.data;RW.stat.de+=performance.now()-t;rwDone(m,t);};w.onerror=w.onmessageerror=e=>{console.error('[tubes] route worker failed',e.message||e);rwKill();};
  }catch(e){console.error('[tubes] no route worker',e);rwKill();}
  return RW.w;}
// Gone for good this session: the routing in flight is done here instead, and the day goes on without the worker.
// (A day resting between steps goes on by itself, on the page from then on.)
function rwKill(){RW.dead=true;if(RW.w)try{RW.w.terminate();}catch(e){}RW.w=null;const j=RW.job;if(!j||j.rest)return;RW.job=null;
  if(j.state!==S){rwDayDone();return;}let v;try{if(j.tr)v=dayAgain(j.tr);else compute();}catch(e){tickErr(e);}rwGo(j.g,v);}
// One day in play (dayRun(), 10-day-tick.js): its steps run here, every routing it asks for runs in the worker.
function rwDay(){rwGo(dayRun());}
// Runs the day's steps up to the next routing, posts it, and returns: rwDone() picks the day up when R is back. At a
// DAY_REST, a day that has run RW.budget ms already goes on after the next frame (RW.later), so a phone gets its frames
// between the steps of a big network's day. The day is still in flight meanwhile: no next day starts, nothing saves.
// v: what the step it resumes asked for (a sales trial's or the intern's fiber test's answer, dayAnswer()).
function rwGo(g,v){const t0=performance.now();for(;;){let s;try{s=dayStep(g,v);}catch(e){tickErr(e);s={done:true};}v=undefined;
  if(s.done){rwDayDone();return;}
  if(s.value===DAY_REST){if(performance.now()-t0<RW.budget)continue;rwRest(g);return;}
  // A routing, or a test (a sales trial, the intern's fiber test): the worker routes the game it is sent with the offer
  // added or the fiber dark, and says yes or no.
  const tr=dayAsk(s.value)?s.value:null,here=()=>{if(tr)v=dayAnswer(tr);else compute();};
  const w=rwOn()&&rwStart();if(!w){try{here();}catch(e){tickErr(e);rwDayDone();return;}continue;}
  const t=performance.now(),seq=++RW.seq;
  // The worker also needs what compute() reads from yesterday's R: link loads, and the scenic circuits' paths.
  try{w.postMessage({seq,S,load:R.load,l2route:R.l2route,efg:rwEfgOut(R.efg),...(tr?{trial:tr.dark?{dark:tr.dark,s0:tr.s0,L0:tr.L0}:{b:tr.trial,hx:tr.hx}}:{})});}
  catch(e){console.error('[tubes] route worker post',e);rwKill();try{here();}catch(e){tickErr(e);rwDayDone();return;}continue;}
  const t1=performance.now();RW.stat.post+=t1-t;RW.job={seq,g,gen:RW.gen,t:t1,state:S,tr};return;}}
/* Where a resting day goes on. A frame drawn moments ago leaves time before the next one: the day goes on in a task of
   its own, and the browser draws the next frame between two tasks when it is due. Otherwise the day waits for that
   frame. (Waiting for a frame every time made a day of many short steps take many frames: a slow phone fell behind.) */
const RW_CH=typeof MessageChannel==='function'&&!RW_IN?new MessageChannel():null,RW_TQ=[];
if(RW_CH)RW_CH.port1.onmessage=()=>{const f=RW_TQ.shift();if(f)f();};
function rwLater(f){if(RW_CH&&performance.now()-(RW.lf||-1e9)<(RW.fms||16)*0.75){RW_TQ.push(f);RW_CH.port2.postMessage(0);}
  else requestAnimationFrame(()=>setTimeout(f,0));}
// The day rests: it goes on after the next frame, still in flight meanwhile (no next day, no save).
function rwRest(g,v){const j=RW.job={rest:true,g,state:S};RW.later(()=>{if(RW.job!==j)return;RW.job=null;if(j.state!==S){rwDayDone();return;}rwGo(g,v);});}
function rwDone(m,t0){const j=RW.job;if(!j||m.seq!==j.seq)return;RW.job=null;const t=performance.now();
  // Another network was loaded meanwhile: the rest of that day belongs to nobody.
  if(j.state!==S){rwDayDone();return;}
  let v;
  // A sales trial: the customer it signed off, or null. Something routed here meanwhile (an action), or the worker
  // failed: the trial runs again here, checks included, on the game as it is now (dayAgain()).
  if(j.tr){if(m.err)console.error('[tubes] route worker',m.err);v=m.err||RW.gen!==j.gen?dayAgain(j.tr):j.tr.dark?!!m.ok:m.ok?j.tr.trial:null;}
  else if(m.err){console.error('[tubes] route worker',m.err);compute();}
  else if(RW.gen===j.gen){R=rwUnpack(m.R,m.ef);UI.hotMap=hotByCity();}
  const t1=performance.now(),st=RW.stat;st.n++;st.apply+=t1-t;st.wait+=t-j.t;st.work+=m.ms||0;
  // Reading a big answer takes a few ms already: the day goes on after the next frame then, not in the same task.
  if(t0!==undefined&&t1-t0>RW.budget/2)rwRest(j.g,v);else rwGo(j.g,v);}
function rwDayDone(){UI.ticking=true;renderHUD();UI.ticking=false;UI.panelsDue=true;if(UI.saveDue){UI.saveDue=false;save();}}
/* R as plain data. R.ef and R.fl are lazy getters, sent as the pieces they are built from (R.efp, R.flc, see efBuild()
   and flDefine() in 30-compute.js), their typed arrays moved, not copied. Exits become their ids (all R.fl reads), and an
   attack record names its attack in S by id. */
const FL_COLS=['FREM','FCI','FNJ','FCA','FBZ','FGT','FGI','FGP','FGH','FTI','FII'];
function rwPack(R){const o={};for(const k in R)o[k]=k==='ef'?0:k==='ddos'?R.ddos.map(m=>({...m,attack:m.attack?m.attack.id:null,ports:null})):R[k];
  const p=R.efp,c={...R.flc,E:R.flc.E.map(e=>({id:e.id}))},tr=[p.ACN.buffer,p.ACD.buffer];for(const k of FL_COLS)tr.push(c[k].buffer);
  return {o,p:{...p,flc:c},tr};}
function rwUnpack(o,p){o.ef={};efBuild(o,p.L,p.ACN,p.ACD,p.NKN,p.NC,p.NN);flDefine(o,p.flc);
  const as=ddosAll(S,false);for(const m of o.ddos){m.attack=as.find(a=>a.id===m.attack)||null;m.ports=new Map();}return o;}
// Yesterday's egress sums for scenic routing, as plain data (EgSums is a class; a clone would lose its get()).
const rwEfgOut=efg=>{if(!efg)return null;const o={};for(const k in efg)o[k]=efg[k].t;return o;};
const rwEfgIn=o=>{const efg={};for(const k in o)efg[k]=new EgSums(o[k]);return efg;};
// In the worker: route the state it was sent, answer with R.
function rwServe(m){try{S=m.S;R=emptyR();R.load=m.load||{};R.l2route=m.l2route||{};if(m.efg)Object.defineProperty(R,'efg',{value:rwEfgIn(m.efg)});
    // A sales trial (offerTrial()): its answer only.
    if(m.trial){const t=performance.now(),ok=m.trial.dark?opsDarkTrial(m.trial):!!offerTrial(m.trial.b,m.trial.hx);postMessage({seq:m.seq,ok,ms:performance.now()-t});return;}
    const t=performance.now();compute();const ms=performance.now()-t,{o,p,tr}=rwPack(R);postMessage({seq:m.seq,R:o,ef:p,ms},tr);}
  catch(e){postMessage({seq:m.seq,err:String(e&&e.stack||e)});}}
