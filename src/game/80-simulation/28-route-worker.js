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
// RW_SLOW: a frame time (ms) above which the device does not keep up anyway, and a day may take longer slices (99-loop.js).
const RW_SLOW=20;
const RW={w:null,dead:false,seq:0,gz:0,gzq:new Map(),svq:new Map(),gen:0,job:null,desc:null,wR:null,wseq:0,last:null,budget:8,later:f=>rwLater(f),stat:{n:0,post:0,de:0,apply:0,wait:0,work:0}};
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
    w.onmessage=e=>{const t=performance.now(),m=e.data;RW.stat.de+=performance.now()-t;rwMsg(m,t);};w.onerror=w.onmessageerror=e=>{console.error('[tubes] route worker failed',e.message||e);rwKill();};
  }catch(e){console.error('[tubes] no route worker',e);rwKill();}
  return RW.w;}
// Gone for good this session: the routing in flight is done here instead, and the day goes on without the worker.
// (A day resting between steps goes on by itself, on the page from then on.)
function rwKill(){RW.dead=true;if(RW.w)try{RW.w.terminate();}catch(e){}RW.w=null;rwGzBack();rwSaveBack();const j=RW.job;if(!j||j.rest)return;RW.job=null;
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
  // While R is the worker's own last answer (RW.wR), it keeps its R.efg rather than getting it back (efg 0, rwServe()).
  const mine=R===RW.wR;
  try{w.postMessage({seq,S,load:R.load,l2route:R.l2route,efg:mine?0:rwEfgOut(R.efg),wseq:mine?RW.wseq:0,...(tr?{trial:tr.dark?{dark:tr.dark,s0:tr.s0,L0:tr.L0}:{b:tr.trial,hx:tr.hx}}:{})});}
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
// Every answer from the worker, in order.
function rwMsg(m,t0){if(m.gz!==undefined){rwGzDone(m);return;}if(m.sv!==undefined){rwSaveDone(m);return;}if(m.R){const d=m.R.egDesc;if(d===0)m.R.egDesc=RW.desc;else RW.desc=m.R.egDesc=d&&d.dK!==undefined?rwDescIn(d,RW.desc):d;}rwDone(m,t0);}
/* A changed R.egDesc comes as its keys, in order, and only the entries that changed (rwDescOut()): a few among thousands.
   The rest are yesterday's entries, so the page holds the same object, key for key and in the same order. */
// dK 0: the keys are yesterday's, in yesterday's order (most days), so they do not come along either.
function rwDescOut(d,old){if(!old)return d;const K=Object.keys(d),O=Object.keys(old),ch={};
  for(const k of K){const x=d[k],y=old[k];if(!y||x.lab!==y.lab||x.city!==y.city||x.k!==y.k)ch[k]=x;}
  let same=K.length===O.length;for(let i=0;same&&i<K.length;i++)same=K[i]===O[i];return {dK:same?0:K,ch};}
function rwDescIn(m,old){const o={},{ch}=m,K=m.dK||Object.keys(old);for(const k of K)o[k]=Object.prototype.hasOwnProperty.call(ch,k)?ch[k]:old[k];return o;}
function rwDone(m,t0){const j=RW.job;if(!j||m.seq!==j.seq)return;RW.job=null;const t=performance.now();
  // Another network was loaded meanwhile: the rest of that day belongs to nobody.
  if(j.state!==S){rwDayDone();return;}
  let v;
  // A sales trial: the customer it signed off, or null. Something routed here meanwhile (an action), or the worker
  // failed: the trial runs again here, checks included, on the game as it is now (dayAgain()).
  if(j.tr){if(m.err)console.error('[tubes] route worker',m.err);v=m.err||RW.gen!==j.gen?dayAgain(j.tr):j.tr.dark?!!m.ok:m.ok?j.tr.trial:null;}
  else if(m.err){console.error('[tubes] route worker',m.err);compute();}
  // The worker's hotMap was worked out from this R and the game as it was sent, which nothing changed since (same gen).
  else if(RW.gen===j.gen){R=RW.wR=rwUnpack(m.R,m.ef);RW.wseq=m.seq;UI.hotMap=m.hot||hotByCity();}
  const t1=performance.now(),st=RW.stat;st.n++;st.apply+=t1-t;st.wait+=t-j.t;st.work+=m.ms||0;
  // Reading a big answer takes a few ms already: the day goes on after the next frame then, not in the same task.
  if(t0!==undefined&&t1-t0>RW.budget/2)rwRest(j.g,v);else rwGo(j.g,v);}
function rwDayDone(){paceEnd(performance.now());UI.ticking=true;renderHUD();UI.ticking=false;UI.panelsDue=true;if(UI.saveDue){UI.saveDue=false;save();}}
/* A save's compression (91-save.js) runs in the worker too: deflating a big network held the page about as long as
   writing it plain. The text goes over as it is (a string is copied flat, without walking a game), the compressed
   text comes back. In order with the routings, so a save may wait for one. */
function rwGzip(txt){const w=rwOn()&&rwStart();if(!w)return null;const k=++RW.gz;
  return new Promise((res,rej)=>{RW.gzq.set(k,{res,rej,txt});try{w.postMessage({gz:k,txt});}catch(e){RW.gzq.delete(k);rej(e);}});}
function rwGzDone(m){const q=RW.gzq.get(m.gz);if(!q)return;RW.gzq.delete(m.gz);if(m.err)q.rej(new Error(m.err));else q.res(m.data);}
/* A whole save in the worker (save(), 91-save.js): the game as it was when saved (the copy postMessage makes), packed,
   turned into text, stamped and compressed there. Back come the text (the slot keeps it, to spot an unchanged game) and
   what to write. The worker lost meanwhile: that save is gone, so the next frame saves again, here. */
function rwSave(st,seq){const w=rwOn()&&rwStart();if(!w)return null;const k=++RW.gz;
  return new Promise((res,rej)=>{RW.svq.set(k,{res,rej});try{w.postMessage({sv:k,S:st,seq});}catch(e){RW.svq.delete(k);rej(e);}});}
function rwSaveDone(m){const q=RW.svq.get(m.sv);if(!q)return;RW.svq.delete(m.sv);if(m.err)q.rej(new Error(m.err));else q.res({txt:m.txt,data:m.data});}
function rwSaveBack(){const q=[...RW.svq.values()];RW.svq.clear();if(q.length)UI.lastSave=0;for(const x of q)x.rej(new Error('route worker lost'));}
function rwSaveServe(m){let txt;try{txt=JSON.stringify(packSave(m.S));}catch(e){postMessage({sv:m.sv,err:String(e)});return;}
  const st=slotStamp(txt,m.seq);(txt.length>=GZ_BG?gzB64(st).then(b=>GZ+b):Promise.resolve(st)).then(data=>postMessage({sv:m.sv,txt,data}),e=>postMessage({sv:m.sv,err:String(e)}));}
// The worker gone: what it was compressing is compressed here.
function rwGzBack(){const q=[...RW.gzq.values()];RW.gzq.clear();for(const x of q)gzB64(x.txt).then(x.res,x.rej);}
/* R as plain data. R.ef and R.fl are lazy getters, sent as the pieces they are built from (R.efp, R.flc, see efBuild()
   and flDefine() in 30-compute.js), their typed arrays moved, not copied. Exits become their ids (all R.fl reads), and an
   attack record names its attack in S by id. */
const FL_COLS=['FREM','FCI','FNJ','FCA','FBZ','FGT','FGI','FGP','FGH','FTI','FII'];
function rwPack(R){const o={};for(const k in R)o[k]=k==='ef'?0:k==='ddos'?R.ddos.map(m=>({...m,attack:m.attack?m.attack.id:null,ports:null})):R[k];
  const p=R.efp,c={...R.flc,E:R.flc.E.map(e=>e.id)},L=rwLOut(p.L),tr=[p.ACN.buffer,p.ACD.buffer,...L.tr];for(const k of FL_COLS)tr.push(c[k].buffer);
  return {o,p:{...p,L:L.o,flc:c},tr};}
function rwUnpack(o,p){o.ef={};p.flc.E=p.flc.E.map(id=>({id}));efBuild(o,rwLIn(p.L),p.ACN,p.ACD,p.NKN,p.NC,p.NN);flDefine(o,p.flc);
  const as=ddosAll(S,false);for(const m of o.ddos){m.attack=as.find(a=>a.id===m.attack)||null;m.ports=new Map();}return o;}
/* What crossed each link (efp.L: [link id, edge index, t], t = {g: exit key → slot, v: sums by slot, n, d}) is the
   biggest part of R, and as plain objects it took longer to read on the page than all the rest. It crosses as typed
   arrays instead, the exit keys once each, and the page decodes a link's t only when something reads it: the link panel
   (R.ef) or a scenic circuit routed on the page (R.efg). Decoded, it is the same t, Map order included. */
function rwLOut(L){const n=L.length,K=[],ki=new Map(),ID=new Array(n),EI=new Int32Array(n),OG=new Int32Array(n+1),ON=new Int32Array(n+1),OD=new Int32Array(n+1);
  let ng=0,nn=0,nd=0;for(const x of L){const t=x[2];ng+=t.g.size;nn+=t.n.length;nd+=t.d.length;}
  const G=new Int32Array(2*ng),V=new Float64Array(ng),N=new Int32Array(nn),D=new Int32Array(nd);ng=nn=nd=0;
  for(let j=0;j<n;j++){const [id,i,t]=L[j];ID[j]=id;EI[j]=i;
    for(const [k,sl] of t.g){let x=ki.get(k);if(x===undefined){ki.set(k,x=K.length);K.push(k);}G[2*ng]=x;G[2*ng+1]=sl;V[ng]=t.v[sl];ng++;}OG[j+1]=ng;
    for(const v of t.n)N[nn++]=v;ON[j+1]=nn;for(const v of t.d)D[nd++]=v;OD[j+1]=nd;}
  return {o:{K,ID,EI,OG,ON,OD,G,V,N,D},tr:[EI.buffer,OG.buffer,ON.buffer,OD.buffer,G.buffer,V.buffer,N.buffer,D.buffer]};}
function rwLIn(X){const {K,ID,EI,OG,ON,OD,G,V,N,D}=X,L=new Array(ID.length);
  for(let j=0;j<ID.length;j++){let t=null;const T=()=>{if(!t){const g=new Map(),v=[];for(let a=OG[j];a<OG[j+1];a++){g.set(K[G[2*a]],G[2*a+1]);v[G[2*a+1]]=V[a];}
      t={g,v,n:Array.from(N.subarray(ON[j],ON[j+1])),d:Array.from(D.subarray(OD[j],OD[j+1]))};}return t;};
    L[j]=[ID[j],EI[j],{get g(){return T().g;},get v(){return T().v;},get n(){return T().n;},get d(){return T().d;}}];}
  return L;}
// Yesterday's egress sums for scenic routing, as plain data (EgSums is a class; a clone would lose its get()).
const rwEfgOut=efg=>{if(!efg)return null;const o={};for(const k in efg)o[k]=efg[k].t;return o;};
const rwEfgIn=o=>{const efg={};for(const k in o)efg[k]=new EgSums(o[k]);return efg;};
// In the worker: route the state it was sent, answer with R.
/* R.egDesc names every exit that carried traffic (about two thirds of R on a big network) and only changes with the
   network. When it is yesterday's again, key for key, the worker sends 0 and the page keeps the one it has (RW.desc):
   every answer is read in order, the stale ones too, so both sides always hold the same last one. */
function rwSameDesc(a,b){if(!a||!b)return false;const ka=Object.keys(a),kb=Object.keys(b);if(ka.length!==kb.length)return false;
  for(let i=0;i<ka.length;i++){const k=ka[i];if(k!==kb[i])return false;const x=a[k],y=b[k];if(x.lab!==y.lab||x.city!==y.city||x.k!==y.k)return false;}return true;}
// R.efg (what crossed each link, by exit) is about a third of R and only routing reads it, here: the worker keeps the one
// of its last answer, and the page sends it back only when it routed something of its own since (efg 0: keep yours).
function rwServe(m){if(m.gz!==undefined){gzB64(m.txt).then(data=>postMessage({gz:m.gz,data}),e=>postMessage({gz:m.gz,err:String(e)}));return;}
  if(m.sv!==undefined){rwSaveServe(m);return;}
  try{S=m.S;R=emptyR();R.load=m.load||{};R.l2route=m.l2route||{};
    if(m.efg===0){if(!RW.last||RW.last.seq!==m.wseq)throw new Error('route worker: no R.efg for answer '+m.wseq);Object.defineProperty(R,'efg',{value:RW.last.efg});}
    else if(m.efg)Object.defineProperty(R,'efg',{value:rwEfgIn(m.efg)});
    // A sales trial (offerTrial()) or the intern's fiber test (opsDarkTrial()): its answer only. What the worker keeps
    // for the next routing (RW.last, RW.desc) stays.
    if(m.trial){const t=performance.now(),ok=m.trial.dark?opsDarkTrial(m.trial):!!offerTrial(m.trial.b,m.trial.hx);postMessage({seq:m.seq,ok,ms:performance.now()-t});return;}
    const t=performance.now();compute();const ms=performance.now()-t,{o,p,tr}=rwPack(R);RW.last={seq:m.seq,efg:R.efg};
    if(rwSameDesc(RW.desc,o.egDesc))o.egDesc=0;else{const d=o.egDesc;o.egDesc=rwDescOut(d,RW.desc);RW.desc=d;}postMessage({seq:m.seq,R:o,ef:p,hot:UI.hotMap,ms},tr);}
  catch(e){postMessage({seq:m.seq,err:String(e&&e.stack||e)});}}
