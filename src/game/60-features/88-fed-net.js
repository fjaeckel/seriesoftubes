/* ================= FEDERATION: connecting and syncing =================
   The browser's own WebSocket to the nodes of the servers this save joined (§9). Never inside dayTick(), after() or
   drawing: the connection runs on its own timers, and only while a joined save is open. A save that never joined
   costs nothing: no socket, no timer, no listener. A dead server is a normal state, not an error: no modal, no toast,
   a status the interface may show ("offline since …"). Everything a node sends is checked before it is used.
   FED holds the runtime (memory only). Its clock, sockets, timers, randomness, visibility, fetch and IndexedDB are
   functions, so tests replace them; randomness never comes from Math.random (seeded games own it). */
const FED={
  now:()=>Math.floor(Date.now()/1000),WS:url=>new WebSocket(url,FED_PROTO),set:(f,ms)=>setTimeout(f,ms),clear:t=>clearTimeout(t),
  rand:()=>{try{const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]/4294967296;}catch(e){return 0.5;}},
  visible:()=>{try{return document.visibilityState!=='hidden';}catch(e){return true;}},
  fetch:(u,o)=>fetch(u,o),idb:()=>indexedDB,registry:'federation/servers.json',
  // ms: opening a socket, a request's answer, ping when idle, give up when silent, the idle check, stats, back-off;
  // live states (§5.11): the check, the keepalive when nothing changed, the least time between two (s: statsMax, stateMin).
  T:{open:15000,req:20000,idle:60000,dead:120000,tick:30000,stats:300000,statsMax:3600,first:5000,base:2000,cap:1800000,fetch:10000,state:10000,stateKeep:180000,stateMin:5},
  hooks:{stats:null,deal:null},vgen:0,shun:null,xgen:0,ex:null,live:null,st:{},ev:{},soon:false,listening:false,sent:new Map(),ids:new WeakMap(),dpend:[],
  // Server id -> the newest relay its node told this device's operator about (§9.3 update), memory only.
  upd:{}};

/* ---------- events for the interface and the gameplay ---------- */
// fedOn(name, fn) gives a function that stops listening. Names: status, records, excluded, deal, catalog, mute, untrusted, update.
function fedOn(name,fn){(FED.ev[name]||(FED.ev[name]=new Set())).add(fn);return ()=>FED.ev[name].delete(fn);}
function fedEmit(name,data){const s=FED.ev[name];if(s)for(const fn of [...s])try{fn(data);}catch(e){console.error('[tubes] federation listener',e);}}

/* ---------- the session: one per open joined save ---------- */
const fedWorker=()=>{try{return !!globalThis.__TUBES_WORKER__;}catch(e){return false;}};
function fedSoon(){if(FED.soon||fedWorker())return;FED.soon=true;FED.set(()=>{FED.soon=false;fedWake();},0);}
const fedCur=()=>S&&S.fed&&S.fed.on&&fedHasPriv(S.fed)&&S.fed.servers.length&&fedEligible()?S.fed:null;
const fedMine=M=>!!M&&FED.live===M&&fedCur()===M.fed;
// Starts, adjusts or stops the session to match the save now open. Safe to call any time; cheap when nothing joined.
function fedWake(){if(fedWorker())return;const f=fedCur();if(FED.live&&FED.live.fed!==f)fedStop();if(!f)return;
  let M=FED.live;
  if(!M){M=FED.live={fed:f,conns:new Map(),statsT:null,body:'',bodyAt:0};fedListen();M.cat=fedCatalogLoad().catch(()=>false);M.cat.then(()=>fedLearnAll(M));
    M.statsT=FED.set(()=>fedStatsTick(M),FED.T.first);M.stateT=FED.set(()=>fedStateTick(M),FED.T.first);fedVotesTidy();fedDpendLoad(M);if(fwOn())fwStart();}
  for(const u of f.servers)if(!M.conns.has(u))fedConnect(M,u);
  for(const [u,c] of M.conns)if(!f.servers.includes(u)){M.conns.delete(u);fedHang(c);delete FED.st[u];}
  fedEmit('status',fedStatus());}
function fedStop(){const M=FED.live;if(!M)return;FED.live=null;FED.dpend=[];FED.clear(M.statsT);FED.clear(M.stateT);for(const c of M.conns.values())fedHang(c);FED.st={};fedEmit('status',fedStatus());}
function fedListen(){if(FED.listening)return;FED.listening=true;
  const go=()=>{const M=FED.live;if(!M||!FED.visible())return;if(!fedMine(M)){fedWake();return;}
    for(const c of M.conns.values())if(c.state==='waiting'||c.state==='offline'&&c.tries&&!(c.calm>fedNow()))fedDial(c);};
  try{document.addEventListener('visibilitychange',go);addEventListener('online',go);}catch(e){}}

/* ---------- status ---------- */
// The status the interface shows: {state: 'off', 'connecting', 'connected' or 'offline', since (unix s), servers:
// [{url, state, since, server, node}]}. Offline since the first moment no node of a server answered.
function fedStatus(){const l=Object.entries(FED.st).map(([url,x])=>({url,...x}));
  if(!FED.live)return {state:'off',since:null,servers:[]};
  const on=l.filter(x=>x.state==='connected');if(on.length)return {state:'connected',since:Math.min(...on.map(x=>x.since)),servers:l};
  const st=l.some(x=>x.state==='offline'||x.state==='waiting')?'offline':'connecting';
  return {state:st,since:l.length?Math.min(...l.map(x=>x.since)):null,servers:l};}
function fedSt(c,state){const o=FED.st[c.url],up=state==='connected',was=!!o&&o.state==='connected';c.state=state;
  FED.st[c.url]={state,since:o&&up===was?o.since:fedNow(),server:c.srv,node:c.node,impl:c.impl||null};
  if(!o||o.state!==state)fedEmit('status',fedStatus());}

/* ---------- one connection per joined server, failing over between its nodes ---------- */
function fedConnect(M,url){const c={M,url,nodes:[url],ni:0,ws:null,state:'idle',tries:0,t:null,tick:null,rq:new Map(),nid:0,srv:null,node:null,nodeKey:null,lastIn:0,lastOut:0,sub:0,phase:''};
  M.conns.set(url,c);fedDial(c);}
const fedLive=c=>{if(fedMine(c.M)&&c.M.conns.get(c.url)===c)return true;if(FED.live===c.M&&!fedMine(c.M))fedWake();return false;};
// Closes a socket without its handlers firing back, and answers every pending request with null.
function fedHang(c){FED.clear(c.t);FED.clear(c.tick);c.t=c.tick=null;const ws=c.ws;c.ws=null;c.phase='';
  if(ws){ws.onopen=ws.onmessage=ws.onerror=ws.onclose=null;try{ws.close();}catch(e){}}
  for(const r of c.rq.values()){FED.clear(r.t);r.res(null);}c.rq.clear();c.sub=c.vsub=c.rsub=0;c.op=c.me=c.exBuf=c.impl=c.feats=c.stTxt=null;c.stAt=0;FED.clear(c.subT);c.subT=null;c.subQ=null;}
/* Development only (§9.1): a page loaded from a loopback host dials a *.localhost node over plain ws://, so a relay on
   the same machine needs no certificate. The page players load is never on a loopback host. */
const FED_LOOP=/^(localhost|127\.0\.0\.1|\[::1\]|[a-z0-9.-]+\.localhost)$/;
const fedSock=(u,h=typeof location!=='undefined'?location.hostname:'')=>FED_LOOP.test(h)&&/^wss:\/\/[a-z0-9.-]+\.localhost(?=[:/]|$)/.test(u)?'ws'+u.slice(3):u;
function fedDial(c){if(!fedLive(c))return;fedHang(c);
  if(!FED.visible()){fedSt(c,'waiting');return;}
  const url=c.nodes[c.ni%c.nodes.length];let ws;c.node=url;
  try{ws=FED.WS(fedSock(url));}catch(e){fedDrop(c,'open');return;}
  c.ws=ws;c.phase='open';fedSt(c,c.state==='offline'||c.state==='waiting'?'offline':'connecting');
  c.t=FED.set(()=>fedDrop(c,'timeout'),FED.T.open);
  ws.onopen=()=>{if(c.ws!==ws)return;c.phase='hello';fedSend(c,{m:'hello',vers:FED_VERS,role:'client'});};
  ws.onmessage=e=>{if(c.ws===ws)fedIn(c,e.data);};
  ws.onerror=()=>{};// a close follows
  ws.onclose=()=>{if(c.ws===ws)fedDrop(c,'closed');};}
/* The connection is gone: try the server's next node at once, and after a full round of them wait, longer each time
   (2 s doubling, at most 30 min, with jitter), and only while the tab is visible. The back-off starts again only after
   a connection stayed ready for FED_STEADY seconds: a node that hangs up right after the sub is not redialled every
   2 s. min: seconds to wait at least (a node's rate_limited retry). */
const FED_STEADY=60;
function fedDrop(c,why,min=0){fedErrLog(c.node,c.srv,why);fedHang(c);if(c.readyAt&&fedNow()-c.readyAt>=FED_STEADY)c.tries=0;c.readyAt=0;if(!fedLive(c))return;c.ni++;
  if(c.ni%c.nodes.length===0)c.tries++;
  fedSt(c,'offline');
  c.calm=min?fedNow()+min:0;
  const wait=c.wait=Math.max(min*1000,c.ni%c.nodes.length?250:Math.min(FED.T.cap,FED.T.base*2**Math.min(20,Math.max(0,c.tries-1)))*(0.5+FED.rand()/2));
  c.t=FED.set(()=>fedDial(c),wait);}
// The nodes of a connection's server, from the catalog: the joined URL first, then the others, for failing over.
async function fedLearn(c,srvs){const e=c.srv&&(srvs||await fedServers()).find(x=>x.id===c.srv);if(!e||!fedLive(c))return null;
  const cur=c.nodes[c.ni%c.nodes.length];c.nodes=[c.url,...e.nodes.map(n=>n.url).filter(u=>u!==c.url)];c.ni=Math.max(0,c.nodes.indexOf(cur));return e;}
async function fedLearnAll(M){if(!fedMine(M))return;const s=await fedServers();for(const c of M.conns.values())await fedLearn(c,s);}
function fedSend(c,m){const t=JSON.stringify(m);if(!c.ws||fedSize(t)>FED_FRAME)return false;try{c.ws.send(t);c.lastOut=fedNow();return true;}catch(e){return false;}}
// A request: resolves with the answer frame, or null on timeout or a lost connection. many: answers come as several
// recs (or catalog) frames ending with more:false, gathered into one. The promise carries the request's id (.id), which
// an unsub names.
function fedAsk(c,m,many){let id=0;const p=new Promise(res=>{if(c.phase!=='ready'&&c.phase!=='check'){res(null);return;}id=c.nid=c.nid%2147483646+1;
  const r={res,many,items:[],n:0,t:FED.set(()=>{c.rq.delete(id);res(null);},FED.T.req)};c.rq.set(id,r);
  if(!fedSend(c,{...m,id})){FED.clear(r.t);c.rq.delete(id);res(null);}});p.id=id;return p;}
/* Waits a rate_limited answer's retry (seconds, 1 to 60, plus up to a second at random so requests refused together do
   not come back together) when the connection is still there; false when not worth it. */
const fedRetryIn=(c,a)=>new Promise(res=>{if(!a||a.m!=='err'||a.code!=='rate_limited'||!fedLive(c)){res(false);return;}
  FED.set(()=>res(fedLive(c)&&c.phase==='ready'),(Math.min(60,Math.max(1,Number.isSafeInteger(a.retry)?a.retry:1))+FED.rand())*1000);});
// A request answered rate_limited is asked again after the retry the node gave (five times at most).
async function fedAskRetry(c,m,many){for(let i=0;;i++){const a=await fedAsk(c,m,many);if(i>=5||!(await fedRetryIn(c,a)))return a;}}

/* ---------- frames from a node ---------- */
function fedIn(c,text){c.lastIn=fedNow();const r=fedFrame(text,'node');if(r.skip)return;if(r.error){fedDrop(c,r.error);return;}const f=r.f;
  if(f.m==='welcome'){if(c.phase!=='hello'||f.ver!==1||c.srv&&f.server!==c.srv){fedDrop(c,'welcome');return;}
    FED.clear(c.t);c.t=null;c.srv=f.server;c.nodeKey=f.node;c.impl=fedImpl(f.impl);c.phase='check';
    // The optional messages the node takes (§9.3 feats): live states and the boards of now only where it lists them.
    c.feats=Array.isArray(f.feats)?f.feats.slice(0,16).filter(x=>typeof x==='string'):[];
    c.tick=FED.set(function tk(){if(!fedLive(c)||!c.ws)return;const n=fedNow();
      if(n-c.lastIn>=FED.T.dead/1000){fedDrop(c,'silent');return;}
      if(n-c.lastOut>=FED.T.idle/1000)fedSend(c,{m:'ping',id:c.nid=c.nid%2147483646+1});c.tick=FED.set(tk,FED.T.tick);},FED.T.tick);
    fedReady(c).catch(e=>{console.error('[tubes] federation sync',e);});return;}
  // A connection-level error (no id): the node is done with this connection; rate_limited says how long to stay away.
  if(f.m==='err'&&f.id===undefined){fedDrop(c,f.code,f.code==='rate_limited'?Math.min(3600,Math.max(1,Number.isSafeInteger(f.retry)?f.retry:1)):0);return;}
  if(c.phase!=='ready'&&c.phase!=='check'){fedDrop(c,'not_ready');return;}
  if(f.m==='ping'){fedSend(c,{m:'pong',id:f.id,now:fedNow()});return;}
  /* A page of the subscription: pages are handled one after another, and its cursor is kept only once every record of
     it was handled, so a connection lost in the middle resumes from the last whole page and skips nothing (§9.3). */
  if(f.m==='recs'&&c.sub&&f.id===c.sub){const q=c.subQ||Promise.resolve(),k=fedCursorKey(c);
    c.subQ=q.then(()=>fedRecs(c,f.items)).then(done=>{if(done&&fedCursorOk(f.cursor))return fedPut('kv',k,f.cursor);}).catch(()=>{});return;}
  // The operators' own subscription to the votes (§9.3: only a session that proved an operator key gets them).
  if(f.m==='recs'&&c.vsub&&f.id===c.vsub){const q=c.subQ||Promise.resolve(),k=fedVcKey(c);
    c.subQ=q.then(()=>fedRecs(c,f.items)).then(done=>{if(done&&fedCursorOk(f.cursor))return fedVoteCursor(k,f.cursor);}).catch(()=>{});return;}
  if(f.m==='err'&&c.vsub&&f.id===c.vsub){c.vsub=0;return;}
  // Players' reports, for an operator of this server only (§5.10), from their own cursor.
  if(f.m==='recs'&&c.rsub&&f.id===c.rsub){const q=c.subQ||Promise.resolve(),k=fedVcKey(c);
    c.subQ=q.then(()=>fedRecs(c,f.items)).then(done=>{if(done&&fedCursorOk(f.cursor))return fedVoteCursor(k,f.cursor,'rcursors');}).catch(()=>{});return;}
  if(f.m==='err'&&c.rsub&&f.id===c.rsub){c.rsub=0;return;}
  if(f.m==='excluded'&&f.id===undefined){fedExclIn(c,f);return;}
  // A newer relay is out: a node tells sessions that proved an operator key of its server, no one else.
  if(f.m==='update'&&f.id===undefined){const u=fedUpdOf(f);if(u&&c.srv){FED.upd[c.srv]=u;fedEmit('update',{srv:c.srv,...u});}return;}
  // The node refused the subscription for now (rate_limited, internal): subscribe again after its retry.
  if(f.m==='err'&&c.sub&&f.id===c.sub){c.sub=0;if(f.code==='rate_limited'||f.code==='internal')c.subT=FED.set(()=>{c.subT=null;if(fedLive(c)&&c.phase==='ready'&&!c.sub)fedSub(c);},Math.min(60,Math.max(1,Number.isSafeInteger(f.retry)?f.retry:5))*1000);return;}
  if(f.m==='catalog'&&f.id===undefined){fedGossip(f.entries,c.srv).catch(()=>{});return;}
  const q=f.id!==undefined&&c.rq.get(f.id);
  if(!q)return;
  // A long answer (§9.3): recs items or catalog entries gathered over the frames until more is not true.
  const L=q.many&&{recs:'items',catalog:'entries'}[f.m];
  if(L){q.items.push(...f[L]);if(f.more===true&&++q.n<512&&q.items.length<200000){FED.clear(q.t);q.t=FED.set(()=>{c.rq.delete(f.id);q.res(null);},FED.T.req);return;}}
  FED.clear(q.t);c.rq.delete(f.id);q.res(L?{...f,[L]:q.items}:f);}
/* Just connected: make sure the node is one of its server's (when the catalog knows the server: the registry is asked
   first, for at most FED.T.fetch), then send what waits and follow the news. */
async function fedReady(c){await c.M.cat;if(!fedLive(c)||c.phase!=='check')return;const e=await fedLearn(c);
  if(e){const keys=e.nodes.map(n=>n.key);if(!keys.includes(c.nodeKey)){fedDrop(c,'not_node');return;}
    const nonce=fedB64(fedNonce()),p=await fedAsk(c,{m:'challenge',nonce});if(!fedLive(c)||c.phase!=='check')return;if(!p||p.m!=='proof'){fedDrop(c,'bad_challenge');return;}
    if(await fedProofErr(p.proof,nonce,c.srv,c.nodeKey,fedNow())){fedDrop(c,'bad_challenge');return;}}
  if(!fedLive(c)||c.phase!=='check')return;await fedAuth(c);
  if(!fedLive(c)||c.phase!=='check')return;
  // What a sub gives depends on the key proved (deals only to their parties): without it, no sub and no cursor.
  if(!c.me){fedDrop(c,'auth');return;}
  c.phase='ready';c.readyAt=fedNow();fedSt(c,'connected');fedFlush(c);
  await fedSub(c);if(!fedLive(c)||c.phase!=='ready')return;if(c.op)await fedVoteSub(c);if(!fedLive(c)||c.phase!=='ready')return;
  if(c.op)await fedRepSub(c);if(!fedLive(c)||c.phase!=='ready')return;
  const cat=await fedAskRetry(c,{m:'servers'},true);if(cat&&cat.m==='catalog')await fedGossip(cat.entries,c.srv);}
/* Follows the news from the last cursor kept for this node and this network: IndexedDB is shared by every save slot,
   and what a sub gives depends on the key proved, so another network's cursor would skip this one's deals. */
const fedCursorKey=c=>'cursor:'+c.node+'#'+c.M.fed.key.pub,fedVcKey=c=>c.node+'#'+c.M.fed.key.pub;
async function fedSub(c){const since=(await fedGet('kv',fedCursorKey(c)))||'';if(!fedLive(c)||c.phase!=='ready'||c.sub)return;
  c.sub=c.nid=c.nid%2147483646+1;fedSend(c,{m:'sub',id:c.sub,kinds:['announce','offer','accept','decline','leave','hide'],since:typeof since==='string'?since:''});}
const fedCursorOk=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(x);
/* Proves this network's key to the node (§9.3 auth), so it is told the reasons if the federation excluded it, then the
   operator key when this device has one of this server's: only then does the node send the shun votes. */
async function fedAuth(c){const f=c.M.fed;c.me=null;if(!c.srv||!c.nodeKey)return;
  const a=await fedAsk(c,{...await fedAuthMake(f.key.priv,c.nodeKey,c.srv,fedNow())});if(!fedLive(c))return;
  c.me=a&&a.m==='ack'?f.key.pub:null;await fedAuthOp(c);}
async function fedAuthOp(c){const k=await fedOpKey();if(!k||!fedLive(c)||c.op===k.pub||!fedOpOf(await fedServers(),c.srv,k.pub))return;
  const a=await fedAsk(c,{...await fedAuthMake(k.seed,c.nodeKey,c.srv,fedNow())});if(!fedLive(c))return;
  if(a&&a.m==='ack'&&a.op===true){c.op=k.pub;if(c.phase==='ready'){await fedVoteSub(c);await fedRepSub(c);}}}
// The votes, for an operator: their own subscription, from their own cursor, so votes from before it are not skipped.
async function fedVoteSub(c){const cur=(await fedGet('kv','vcursors'))||{},since=fedOwn(cur,fedVcKey(c))?cur[fedVcKey(c)]:'';if(!fedLive(c)||c.phase!=='ready'||c.vsub||!c.op)return;
  c.vsub=c.nid=c.nid%2147483646+1;fedSend(c,{m:'sub',id:c.vsub,kinds:['shun','unshun'],since:fedCursorOk(since)?since:''});}
async function fedVoteCursor(k,x,store='vcursors'){const cur=(await fedGet('kv',store))||{};cur[k]=x;await fedPut('kv',store,cur);}
// The reports players sent to this server (§5.10), for its operator: a third subscription with its own cursors.
async function fedRepSub(c){const cur=(await fedGet('kv','rcursors'))||{},since=fedOwn(cur,fedVcKey(c))?cur[fedVcKey(c)]:'';if(!fedLive(c)||c.phase!=='ready'||c.rsub||!c.op)return;
  c.rsub=c.nid=c.nid%2147483646+1;fedSend(c,{m:'sub',id:c.rsub,kinds:['report'],since:fedCursorOk(since)?since:''});}
/* The operator key changed on this device: prove the new one to every connected server it operates, or stop following
   the votes and forget them when it was removed (votes are kept only on an operator's device). */
async function fedOpChanged(){const M=FED.live,k=await fedOpKey();
  if(M)for(const c of M.conns.values()){if(!fedLive(c)||c.phase!=='ready')continue;
    if(k)await fedAuthOp(c);else if(c.op){for(const x of [c.vsub,c.rsub])if(x)fedSend(c,{m:'unsub',id:x});c.vsub=c.rsub=0;c.op=null;}}
  await fedVotesTidy();}
/* The networks a server excludes (§9.3 excluded): pages joined until more is not true, then kept per joined server with
   when it came (and the reasons, which are for this network only). Kept while offline; a new list replaces it. */
const FED_EXCL_MAX=50000,FED_REASONS=['cheating','offensive_name','spam','abuse'];
// Per joined URL and per network: IndexedDB is shared by every save slot, and the reasons are for one network only.
const fedExclKey=(url,pub)=>'excl:'+url+'#'+pub;
function fedExclIn(c,f){const b=c.exBuf||(c.exBuf={keys:new Set(),reasons:new Set()});
  for(const k of f.keys.slice(0,8192))if(typeof k==='string'&&!FdK(k)&&b.keys.size<FED_EXCL_MAX)b.keys.add(k);
  if(Array.isArray(f.reasons))for(const r of f.reasons.slice(0,8))if(FED_REASONS.includes(r))b.reasons.add(r);
  if(f.more===true)return;c.exBuf=null;
  const o={at:fedNow(),srv:c.srv,keys:[...b.keys].sort(fedByStr),me:c.me,reasons:c.me?[...b.reasons].sort():[]},kk=fedExclKey(c.url,c.M.fed.key.pub);
  FED.exQ=(FED.exQ||Promise.resolve()).then(()=>fedPut('kv',kk,o)).then(()=>{FED.xgen++;fedEmit('excluded',{server:o.srv,n:o.keys.length});}).catch(()=>{});}
function fedNonce(){const a=new Uint8Array(32);try{crypto.getRandomValues(a);}catch(e){for(let i=0;i<32;i++)a[i]=FED.rand()*256|0;}return a;}

/* ---------- sending what waits in the save ---------- */
async function fedRid(r){let id=FED.ids.get(r);if(!id){id=await fedId(r);FED.ids.set(r,id);}return id;}
function fedFlushSoon(){const M=FED.live;if(M&&fedMine(M))for(const c of M.conns.values())if(c.phase==='ready')fedFlush(c);}
// Puts every queued record this server has not taken yet; a record leaves the queue once every joined server took it
// (or refused it for good). Rate limits and failures leave it for later.
// A record queued while a flush runs goes out with one more pass right after it.
function fedFlush(c){if(c.flushP){c.more=true;return c.flushP;}return c.flushP=fedFlushRun(c).finally(()=>{c.flushP=null;if(c.more){c.more=false;if(fedLive(c)&&c.phase==='ready')fedFlush(c);}});}
async function fedFlushRun(c){const f=c.M.fed;let ch=false;
  {for(const r of f.out.slice()){if(!fedLive(c)||c.phase!=='ready')break;const id=await fedRid(r),done=FED.sent.get(id)||new Set();
      // Taken here before: it may be waiting only for a server this save has left since.
      if(done.has(c.url)){if(f.servers.every(u=>done.has(u))){f.out=f.out.filter(x=>x!==r);FED.sent.delete(id);ch=true;}continue;}
      const a=await fedAsk(c,{m:'put',rec:r});if(!a)break;
      if(a.m==='err'&&(a.code==='rate_limited'||a.code==='internal')){if(a.code==='rate_limited'&&Number.isSafeInteger(a.retry))FED.set(()=>{if(fedLive(c))fedFlush(c);},Math.min(3600,Math.max(1,a.retry))*1000);break;}
      done.add(c.url);FED.sent.set(id,done);
      if(f.servers.every(u=>done.has(u))){f.out=f.out.filter(x=>x!==r);FED.sent.delete(id);ch=true;}}}
  if(ch&&fedMine(c.M))fedSaved();}
// Sends records now and waits (a few seconds at most) for every connected server to take them: for leaving.
async function fedSendNow(recs,f){for(const r of recs)fedQueue(r,f);const M=FED.live;if(!M||M.fed!==f)return;
  const all=[...M.conns.values()].filter(c=>c.phase==='ready').map(c=>fedFlush(c).then(()=>fedFlush(c)));
  await Promise.race([Promise.all(all),new Promise(r=>FED.set(r,5000))]);}

/* ---------- stats: at most one per slot, only when something changed or an hour went by ---------- */
async function fedStatsTick(M){if(!fedMine(M))return;M.statsT=FED.set(()=>fedStatsTick(M),FED.T.stats);
  const f=M.fed,now=fedNow(),slot=fedSlot(now);if(slot===f.last)return;
  let body;try{body=fedStatsBody();}catch(e){return;}const txt=fedCanon(body);
  if(txt===M.body&&now-M.bodyAt<FED.T.statsMax)return;
  const r=await fedSignRec(f.key.priv,'stats',body,now);if(!fedMine(M))return;
  M.body=txt;M.bodyAt=now;f.last=slot;fedQueue(r,f);fedSaved();}

/* ---------- live states (§5.11): this network's current numbers, for the boards of now ----------
   Every FED.T.state while the tab is visible and a joined server that takes them (feats) is connected: the same body as
   stats, signed as a state, sent only when it changed since the last one that server took, or after FED.T.stateKeep so
   the network stays on the boards of now; never twice within FED.T.stateMin seconds. Nothing is queued or saved: a
   state missed (offline, hidden, rate limited) is simply replaced by the next. FED.stCost counts the work it took here. */
const fedFeat=(c,x)=>!!c&&Array.isArray(c.feats)&&c.feats.includes(x);
async function fedStateTick(M){if(!fedMine(M))return;FED.clear(M.stateT);M.stateT=FED.set(()=>fedStateTick(M),FED.T.state);
  if(!FED.visible())return;const now=fedNow(),cs=[...M.conns.values()].filter(c=>c.phase==='ready'&&fedFeat(c,'state'));if(!cs.length)return;
  const t0=fedPerf();let body;try{body=fedStatsBody();}catch(e){return;}const txt=fedCanon(body);
  const need=cs.filter(c=>now-(c.stAt||0)>=FED.T.stateMin&&(c.stTxt!==txt||now-(c.stAt||0)>=FED.T.stateKeep/1000));
  if(!need.length){FED.stCost.idle+=fedPerf()-t0;return;}
  const r=await fedSignRec(M.fed.key.priv,'state',body,now);FED.stCost.n++;FED.stCost.ms+=fedPerf()-t0;if(!fedMine(M))return;
  await Promise.all(need.map(async c=>{const a=await fedAsk(c,{m:'state',rec:r});if(a&&a.m==='ack'){c.stTxt=txt;c.stAt=now;}}));}
const fedPerf=()=>{try{return performance.now();}catch(e){return Date.now();}};
FED.stCost={n:0,ms:0,idle:0};

/* ---------- records from a node: checked, then kept where they belong ---------- */
// Receipts: the earliest valid one gives the board slot (§10.1), and its country (a shared stats record only).
async function fedPlace(c,chk,rcpts,now,srvs){let slot=null,cc=null;
  for(const rc of Array.isArray(rcpts)?rcpts.slice(0,16):[]){const sid=rc&&rc.body&&rc.body.server;if(typeof sid!=='string')continue;
    const e=srvs.find(x=>x.id===sid),nodes=e?e.nodes.map(n=>n.key):sid===c.srv&&c.nodeKey?[c.nodeKey]:null;if(!nodes)continue;
    if(await fedRcptErr(rc,chk.rec,chk.id,sid,nodes,now))continue;if(slot===null||rc.t<slot){slot=rc.t;cc=rc.body.cc||null;}}
  return {slot,cc};}
/* Items [{rec, rcpt}] from a sub or a fetch. Gives true when every item was looked at. Calls run one after another,
   across connections: what they keep is read, changed and written back (votes, a network's servers), and two at once
   would lose one's change (five votes arriving together counted as fewer). Leaderboards never pass through here: the
   server ranks them (§9.5). */
function fedRecs(c,items){const p=(FED.recQ||Promise.resolve()).then(()=>fedRecsRun(c,items));FED.recQ=p.catch(()=>false);return p;}
// The page's records are checked in one batch (the federation worker, 88-fed-worker.js), then kept here one by one.
async function fedRecsRun(c,items){const now=fedNow(),me=c.M.fed.key.pub,votes=[],reps=[],srvs=await fedServers(),L=Array.isArray(items)?items:[];let n=0,voters=null;
  const ck=L.length&&fedLive(c)?await fedCheckItems(L,now,c,srvs):[];
  for(let i=0;i<L.length;i++){if(!fedLive(c))return false;const chk=ck[i];if(!chk||!chk.ok)continue;n++;const r=chk.rec,heard=chk.slot??fedSlot(now);
    if(['announce','stats','offer','accept','decline'].includes(r.kind))await fedHeard(r.key,heard);
    if(r.kind==='announce')await fedAnnPut(chk,heard,c.srv);
    else if(r.kind==='leave')await fedLeft(r.key,r.t);
    // Votes only from an operator of a voting registry server, hide lists only from an operator of their server.
    else if(r.kind==='shun'||r.kind==='unshun'){if(c.op&&!voters)voters=await fedVoters();if(c.op&&fedVoteOk(voters,r))votes.push(chk);}
    // Reports only for an operator of the server they name, from that server's own node (§5.10).
    else if(r.kind==='report'){if(c.op&&r.body.server===c.srv&&fedOpOf(srvs,c.srv,c.op))reps.push({id:chk.id,rec:r});}
    else if(r.kind==='hide'){if(fedOpOf(srvs,r.body.server,r.key)){const o=await fedGet('kv','hide:'+r.body.server);if(!o||!o.rec||fedNewer(chk,o))await fedPut('kv','hide:'+r.body.server,{rec:r,id:chk.id});}}
    else if((r.kind==='offer'||r.kind==='accept'||r.kind==='decline')&&(r.body.to===me||r.key===me||!!FED.hooks.deal&&FED.hooks.deal(r)))await fedDealIn(c.M.fed,{rec:r,id:chk.id,slot:heard,server:c.srv});}
  if(FED.dpend.length&&Array.isArray(items)&&items.some(it=>it&&it.rec&&it.rec.kind==='announce'))await fedDealRetry(c.M.fed);
  if(votes.length)await fedVotesAdd(votes,voters);
  if(reps.length)await fedReportsAdd(reps);
  if(n)fedEmit('records',{server:c.srv,n});return true;}
/* A deal record for this network goes to the gameplay opened (§5.3): sealed ones only once opened, so it reads them
   in clear. One whose sender's box is not known yet (its announce has not come) waits for the next announces, kept
   per network in IndexedDB (kv 'dpend#<key>'), since the sync cursor moves past it: at most FED_DPEND (the oldest go)
   and FED_DPEND_AGE seconds. One that does not open is dropped. */
const FED_DPEND=256,FED_DPEND_AGE=2592000,fedDpKey=f=>'dpend#'+f.key.pub;
async function fedDealIn(f,e,keep=true){const v=await fedOpenRec(f,e.rec),x={rec:e.rec,id:e.id,slot:e.slot,server:e.server};
  if(v===undefined){if(!FED.dpend.some(y=>y.id===e.id)){FED.dpend.push({...x,at:Number.isSafeInteger(e.at)?e.at:fedNow()});if(FED.dpend.length>FED_DPEND)FED.dpend.shift();}if(keep)await fedDpendSave(f);return;}
  if(v)fedEmit('deal',{...x,rec:v});}
async function fedDealRetry(f){const now=fedNow(),l=FED.dpend.filter(e=>now-e.at<FED_DPEND_AGE);FED.dpend=[];for(const e of l)await fedDealIn(f,e,false);await fedDpendSave(f);}
const fedDpendSave=f=>fedPut('kv',fedDpKey(f),FED.dpend.slice());
// A session starts: the deals this network had waiting come back, and are tried at once (an announce may have come).
function fedDpendLoad(M){const p=(FED.recQ||Promise.resolve()).then(async()=>{const o=await fedGet('kv',fedDpKey(M.fed));if(!fedMine(M))return;
    for(const e of Array.isArray(o)?o:[])if(e&&e.rec&&typeof e.rec==='object'&&!FdId(e.id)&&Number.isSafeInteger(e.at)&&!FED.dpend.some(x=>x.id===e.id))FED.dpend.push(e);
    FED.dpend.sort((a,b)=>a.at-b.at);FED.dpend=FED.dpend.slice(-FED_DPEND);if(FED.dpend.length||Array.isArray(o)&&o.length)await fedDealRetry(M.fed);});
  FED.recQ=p.catch(()=>false);return p;}
/* ---------- the leaderboards: the server ranks (§9.5) ---------- */
// The joined URLs whose connection is ready now.
const fedReadyConn=url=>{const M=FED.live,c=M&&M.conns.get(url);return c&&c.phase==='ready'&&c.srv?c:null;};
/* A slice view (fedRankReq) from joined servers (urls; all joined ones when left out): each connected one is asked, the
   others give their last answer kept here (offline: all of them, "as of"). The answers are merged (fedRankMerge),
   leaving out networks this player muted, a joined server hides and the federation excludes. Muted rows are asked for
   on top of the 50, so the list stays full. Gives {rows, me, n, at (the oldest kept answer used; null when every
   answer is fresh), slot}. */
async function fedRankView(v,urls){const f=S&&S.fed;if(!f||!f.key)return {rows:[],me:null,n:0,at:null,slot:null,untrusted:[]};urls=urls||f.servers.slice();
  const muted=f.muted||[],req=fedRankReq(v,f.deals,50+Math.min(50,muted.length)),k=fedRankKey(req),me=f.key.pub;let at=null,slot=null;
  // A server caught sending a ranking its records do not give is left out (others are preferred) for a day.
  const bad=await fedUntrusted(),untrusted=urls.filter(u=>bad[u]).map(u=>bad[u].srv||u);urls=urls.filter(u=>!bad[u]);
  // The boards of now are asked only of servers that take live states (feats); others give their kept answer, if any.
  const got=await Promise.all(urls.map(async u=>{const c0=fedReadyConn(u),c=req.measure!=='now'||fedFeat(c0,'state')?c0:null;
    if(c){const a=fedRanksOk(await fedAskRetry(c,req));if(a){fedRanksPut(u,me,k,a).catch(()=>{});fedRankCheckSoon(c,req,a);return {a,srv:c.srv};}}
    const o=await fedRanksGet(u,me,k);if(!o)return null;at=at===null?o.at:Math.min(at,o.at);return {a:o.a,srv:FED.st[u]&&FED.st[u].server};}));
  // snap: the newest snapshot of live states among the answers of a board of now (null for other measures).
  let snap=null;for(const g of got)if(g&&Number.isSafeInteger(g.a.at))snap=Math.max(snap||0,g.a.at);
  const drop=new Set([...muted,...await fedShunned()]),srvs=await fedServers();
  for(const g of got)if(g&&g.srv){slot=Math.max(slot||0,g.a.slot);const h=await fedHides(g.srv,srvs);if(h)for(const x of h.rec.body.hide)drop.add(x);}
  return {...fedRankMerge(got.map(g=>g&&g.a),me,drop,50),at,slot,snap,untrusted};}
/* ---------- checking a server's ranking (§9.5 rankwhy) ----------
   After each fresh ranks answer, in the background: this network's own row and one row picked at random are worked out
   again from the signed records the server shows for them (fedRankOne). A row that does not match, twice (a record may
   have arrived in between), marks the server untrusted for this session and a day. Spot checks deter; they do not prove. */
const FED_UNTRUST=86400;
async function fedUntrusted(){const now=fedNow();if(!FED.bad){const o=(await fedGet('kv','untrusted'))||{};FED.bad={};for(const [u,x] of Object.entries(o))if(x&&Number.isSafeInteger(x.until))FED.bad[u]=x;}
  for(const u of Object.keys(FED.bad))if(FED.bad[u].until<=now)delete FED.bad[u];return FED.bad;}
async function fedDistrust(c){const bad=await fedUntrusted();bad[c.url]={until:fedNow()+FED_UNTRUST,srv:c.srv};await fedPut('kv','untrusted',bad);fedErrLog(c.node,c.srv,'ranking');fedEmit('untrusted',{server:c.srv,url:c.url});}
// At most one check at a time per server, and each slice once per slot.
function fedRankCheckSoon(c,req,a){const k=c.url+' '+fedRankKey(req)+' '+a.slot;FED.vd=FED.vd||new Set();FED.vb=FED.vb||new Set();
  if(FED.vd.has(k)||FED.vb.has(c.url))return;if(FED.vd.size>256)FED.vd.clear();FED.vd.add(k);FED.vb.add(c.url);
  fedRankCheck(c,req,a).catch(e=>console.error('[tubes] ranking check',e)).finally(()=>FED.vb.delete(c.url));}
/* Checks a ranks answer a of connection c for request req: gives true (it matches), false (it does not, twice: the
   server is then untrusted) or null (could not be checked: offline, a slot went by, a record from a server unknown here). */
async function fedRankCheck(c,req,a){const f=c.M.fed,me=f.key.pub,rows=a.rows.filter(r=>r.key!==me);
  const picks=[{key:me,own:true}];if(rows.length)picks.push({key:rows[Math.min(rows.length-1,Math.floor(FED.rand()*rows.length))].key});
  for(const p of picks){let r=await fedRankRow(c,req,a,p);
    if(r===false){const a2=fedRanksOk(await fedAskRetry(c,req));if(!a2||!fedLive(c))return null;r=await fedRankRow(c,req,a2,p);}
    if(r===false){await fedDistrust(c);return false;}}
  return true;}
// One row (p: {key, own}) of an answer against the records rankwhy shows for it.
// The live states of the snapshot the answer used (at: a board of now, and the running slot of the others, §10.13);
// another snapshot cannot check it. An answer without at (an older relay) is checked against its slot alone.
async function fedRankRow(c,req,a,p){const has=a.at!==undefined,m={m:'rankwhy',board:req.board,measure:req.measure,division:req.division,filters:req.filters,key:p.key};
  if(has)m.at=a.at;const w=await fedAskRetry(c,m,true);
  if(!w||w.m!=='recs'||w.slot!==a.slot||has&&w.at!==a.at||!fedLive(c))return null;const now=fedNow(),srvs=await fedServers();
  const ex=new Set(await fedServerExcl(c)),q={now:has?a.at:a.slot,board:req.board,measure:req.measure,division:req.division,exclude:[...ex],cities:req.filters.cities||null,filters:req.filters};
  // The records checked and worked out in the federation worker (fedWhyRun): null when a receipt comes from a server
  // this browser does not know, which cannot be checked, and then neither can the row.
  const x=await fwDo('why',{items:w.items,now,at:{srv:c.srv,nodeKey:c.nodeKey},srvs:fwSrvs(srvs),key:p.key,q});if(!x)return null;
  if(p.own){const m=a.me;return m?x.listed&&x.value===m.value&&(m.rank===null?!x.kept:x.kept):!x.listed;}
  const row=a.rows.find(r=>r.key===p.key);return !!row&&x.kept&&x.value===row.value;}
// What one server leaves off its boards, as it told this game: its excluded list, and its hide list's hidden and refused.
async function fedServerExcl(c){const o=await fedGet('kv',fedExclKey(c.url,c.M.fed.key.pub)),out=new Set(o&&Array.isArray(o.keys)?o.keys:[]);
  const h=await fedHides(c.srv);if(h){for(const k of h.rec.body.hide)out.add(k);for(const k of h.rec.body.refuse)out.add(k);}return [...out];}
/* The values the filter sheet offers (§9.5 facets), from every joined server (connected: asked; else the last kept):
   {models, harnesses, from, homes}, each sorted. */
async function fedFacets(urls){const f=S&&S.fed,sets={models:new Set(),harnesses:new Set(),from:new Set(),homes:new Set()};if(!f)return {models:[],harnesses:[],from:[],homes:[]};
  for(const u of urls||f.servers){const c=fedReadyConn(u);let a=null;
    if(c){const x=await fedAskRetry(c,{m:'facets'});if(x&&x.m==='facets'){a=x;await fedPut('kv','facets:'+u,{at:fedNow(),a:{models:x.models,harnesses:x.harnesses,from:x.from,homes:x.homes}});}}
    if(!a){const o=await fedGet('kv','facets:'+u);a=o&&o.a;}
    if(a)for(const [k,ok] of [['models',v=>!FdText(1,64)(v)],['harnesses',v=>!FdText(1,64)(v)],['from',v=>!FdCC(v)],['homes',v=>!FdCC(v)]])
      if(Array.isArray(a[k]))for(const v of a[k].slice(0,256))if(ok(v))sets[k].add(v);}
  return Object.fromEntries(Object.entries(sets).map(([k,s])=>[k,[...s].sort()]));}
/* For the gameplay (§9.5 nets): of the networks keys (at most 64), whether each is an AI and Tier 1, and what other
   networks report about traffic with this one, from each connected joined server; kept per server for offline. */
async function fedNetsFetch(keys){const f=S&&S.fed;if(!f)return;keys=[...new Set(keys)].filter(k=>!FdK(k)).slice(0,64);
  for(const u of f.servers){const c=fedReadyConn(u);if(!c)continue;const a=await fedAskRetry(c,{m:'nets',keys});if(!a||a.m!=='netstats')continue;
    // tier2, pops, cust and slot (when it was heard): what a mentor's game reads of a newcomer (absent: older relays).
    const ni=(v,hi)=>Number.isSafeInteger(v)&&v>=0&&v<=hi?v:0;
    const nets=a.nets.filter(x=>x&&!FdK(x.key)&&typeof x.ai==='boolean'&&typeof x.tier1==='boolean').slice(0,64)
      .map(x=>({key:x.key,ai:x.ai,tier1:x.tier1,tier2:x.tier2===true,pops:ni(x.pops,512000),cust:ni(x.cust,FED_CUST_MAX),slot:ni(x.slot,1e11)}));
    const reports=a.reports.filter(x=>x&&!FdK(x.key)&&Number.isSafeInteger(x.in)&&x.in>=0&&Number.isSafeInteger(x.out)&&x.out>=0).slice(0,256).map(x=>({key:x.key,in:x.in,out:x.out}));
    await fedPut('kv','nets:'+u,{at:fedNow(),me:f.key.pub,nets,reports});}
  FED.netsAt=fedNow();}
/* What the gameplay knows of other networks' stats, from the kept nets answers of the joined servers: Map key -> {ai,
   tier1, tier2, pops, cust, slot, traffic: [{key: this network, in, out}] (what that network reports about traffic with
   this one)}. */
async function fedNetsStats(){const f=S&&S.fed,m=new Map();if(!f||!f.key)return m;const me=f.key.pub;
  const get=k=>{let o=m.get(k);if(!o)m.set(k,o={ai:false,tier1:false,tier2:false,pops:0,cust:0,slot:0,traffic:[]});return o;};
  for(const u of f.servers){const o=await fedGet('kv','nets:'+u);if(!o||o.me!==me)continue;
    for(const x of o.nets||[])if(!m.has(x.key)||!m.get(x.key).seen){const e=get(x.key);e.ai=x.ai;e.tier1=x.tier1;e.tier2=!!x.tier2;e.pops=x.pops||0;e.cust=x.cust||0;e.slot=x.slot||0;e.seen=true;}
    for(const x of o.reports||[]){const e=get(x.key);if(!e.traffic.length)e.traffic.push({key:me,in:x.in,out:x.out});}}
  return m;}

/* ---------- the catalog: the registry on the site, gossip from nodes, cached ---------- */
// Fetches the registry (same origin, a static file on the site) and keeps what checks; the cache stays when it fails.
async function fedCatalogLoad(){let txt=null;
  try{const ac=typeof AbortController==='function'?new AbortController():null,t=FED.set(()=>ac&&ac.abort(),FED.T.fetch);
    const r=await FED.fetch(FED.registry,ac?{signal:ac.signal,cache:'no-cache'}:{});FED.clear(t);if(r&&r.ok)txt=await r.text();}catch(e){}
  if(txt==null||fedSize(txt)>8e6)return false;/* the cache stays */let j;try{j=JSON.parse(txt);}catch(e){return false;}
  if(!j||j.v!==1||!Array.isArray(j.servers)||!Number.isSafeInteger(j.asOf))return false;const now=fedNow(),out=[],L=j.servers.slice(0,2000),rs=await fwDo('reg',{entries:L,now});
  for(let i=0;i<L.length;i++){const e=L[i],r=rs[i];if(!r||r.id!==e.id)continue;
    out.push({...r.sum,listed:Number.isSafeInteger(e.listed)?e.listed:null,answered:Number.isSafeInteger(e.answered)?e.answered:null});}
  await fedPut('kv','registry',{asOf:j.asOf,at:now,servers:out});fedEmit('catalog',{source:'registry'});return true;}
const fedSum=r=>({id:r.id,rid:r.srvId,t:r.srv.t,name:r.name,nodes:r.nodes,operators:r.ops,sync:r.sync,noLogs:r.noLogs,langs:r.srv.body.langs,desc:r.srv.body.desc});
// Gossip entries from a node ({genesis, chain, server, path, seen}): checked, then kept (a few per server).
/* via: the server whose node sent the entries. A node gives clients an entry with the path it came by, which ends
   before that node's own server (§10.8 adds it only when passing on to servers): the game adds it, so the looking
   glass sees that the sending server syncs with the one before it on the path. */
async function fedGossip(entries,via){if(!Array.isArray(entries))return;const now=fedNow(),g=(await fedGet('kv','gossip'))||[],L=entries.slice(0,256),rs=L.length?await fwDo('reg',{entries:L,now}):[];let ch=false;
  for(let i=0;i<L.length;i++){const e=L[i],r=rs[i];if(!r)continue;
    const x=fedGossipIn({id:r.id,path:e.path,seen:e.seen},null,now);if(x.action!=='store')continue;
    const path=typeof via==='string'&&!FdId(via)&&!e.path.includes(via)&&e.path.length<16?[...e.path,via]:e.path;
    g.push({id:r.id,server:r.sum,path,seen:e.seen,impl:fedImpls(e.impl,r.sum.nodes)});ch=true;}
  if(!ch)return;const keep=[],per=new Map();
  for(const e of g.sort((a,b)=>b.seen-a.seen)){const n=per.get(e.id)||0;if(now<e.seen+FED_CARRY&&n<4&&keep.length<4000){keep.push(e);per.set(e.id,n+1);}}
  await fedPut('kv','gossip',keep);fedEmit('catalog',{source:'gossip'});}
/* The servers this browser knows (§10.8 merge, registry first): [{id, source ('registry' or 'gossip'), name, nodes
   [{key, url}], operators, sync, noLogs, langs, desc, seen, path, listed, answered}], sorted by id. */
async function fedServers(){const reg=(await fedGet('kv','registry'))||{servers:[]},gos=(await fedGet('kv','gossip'))||[],now=fedNow();
  const info=new Map();for(const g of gos)if(!info.has(g.id)||g.server.t>info.get(g.id).t)info.set(g.id,g.server);for(const r of reg.servers)info.set(r.id,r);
  // What its nodes run, from the freshest entry that said (informational, set by the server itself).
  const rel=new Map();for(const g of gos)if(g.impl&&typeof g.impl==='object'&&Object.keys(g.impl).length&&now<g.seen+FED_CARRY&&(!rel.has(g.id)||g.seen>rel.get(g.id).seen))rel.set(g.id,g);
  return fedCatalogMerge(reg.servers.map(s=>({id:s.id,server:s})),gos,now).map(row=>{const i=info.get(row.id)||{};
    return {...row,sync:i.sync,noLogs:i.noLogs,langs:i.langs||[],desc:i.desc||'',listed:i.listed??null,answered:i.answered??null,relays:rel.has(row.id)?rel.get(row.id).impl:{}};});}
/* Who may vote and hide, at the head of each server's chain as the catalog has it. fedVoters: the voting registry
   servers (§10.7) as Map id -> operator keys; fedOpOf: whether key operates server id. */
async function fedVoters(){const reg=await fedGet('kv','registry'),m=new Map();if(!reg||!Array.isArray(reg.servers))return m;
  for(const s of reg.servers)if(fedVoter(s,reg.asOf)&&Array.isArray(s.operators))m.set(s.id,new Set(s.operators));return m;}
const fedVoteOk=(voters,r)=>{const o=r&&r.body&&voters.get(r.body.server);return !!o&&o.has(r.key);};
const fedOpOf=(srvs,id,key)=>{const e=srvs.find(x=>x.id===id);return !!e&&Array.isArray(e.operators)&&e.operators.includes(key);};
// A server's hide record ({rec, id}) when an operator of that server signed it, else null.
async function fedHides(id,srvs){const h=await fedGet('kv','hide:'+id);if(!h||!h.rec)return null;return fedOpOf(srvs||await fedServers(),id,h.rec.key)?h:null;}
/* What every game knows of shunning (§10.7, §10.7): the excluded lists of the servers this save joined, as each last
   sent them: {keys (Set: listed by any of them), ok (Set: confirmed), by (Map key -> [{srv, url}] that list it), n
   (joined servers that sent a list), why (Map key -> Set of reasons, for this network only)}. One server alone cannot
   end anyone's deals: a listed network is hidden and gets no new deals, but its running deals end only once the
   exclusion is confirmed, listed by a strict majority of the servers that sent a list and by at least two. Read again
   only when a list came in or the joined servers changed. */
async function fedExcl(){const f=S&&S.fed,pub=f&&f.key?f.key.pub:'',urls=f?f.servers.slice():[],k=FED.xgen+'|'+pub+'|'+urls.join(' ');if(FED.ex&&FED.ex.k===k)return FED.ex;
  const keys=new Set(),why=new Map(),by=new Map(),ok=new Set();let n=0;
  for(const u of urls){const o=await fedGet('kv',fedExclKey(u,pub));if(!o||!Array.isArray(o.keys))continue;n++;
    for(const x of o.keys){keys.add(x);const l=by.get(x);if(l)l.push({srv:o.srv,url:u});else by.set(x,[{srv:o.srv,url:u}]);}
    if(typeof o.me==='string'&&Array.isArray(o.reasons)){const w=why.get(o.me)||new Set();for(const r of o.reasons)if(FED_REASONS.includes(r))w.add(r);why.set(o.me,w);}}
  for(const [x,l] of by)if(fedExclConfirmed(l.length,n))ok.add(x);
  return FED.ex={k,keys,ok,by,n,why};}
// Confirmed: listed by m of the n joined servers that sent a list, a strict majority and at least two (§10.7).
const fedExclConfirmed=(m,n)=>m>=2&&2*m>n;
// Keys listed as excluded by any joined server: hidden, and no new deals with them.
async function fedShunned(){return [...(await fedExcl()).keys];}
// Keys whose exclusion is confirmed: running deals with them end.
async function fedConfirmed(){return [...(await fedExcl()).ok];}
/* Whether a network is excluded (by any joined server), whether that is confirmed, the servers that list it ({srv,
   url}), and for this network itself which reasons were given (never counts or voters). */
async function fedExclInfo(key){const X=await fedExcl(),on=X.keys.has(key);
  return {shunned:on,confirmed:X.ok.has(key),servers:on?X.by.get(key).slice():[],reasons:on?[...(X.why.get(key)||[])].sort():[]};}
/* Operators only: the shun tally of every target, from the registry snapshot and the votes their nodes sent them
   ({targets: Map target -> its votes}), counted on demand and kept until the votes, the registry or the slot change. */
async function fedShunTally(now){const reg=await fedGet('kv','registry'),k=FED.vgen+'|'+(reg?reg.at+'/'+reg.asOf:'')+'|'+fedSlot(now);
  if(FED.shun&&FED.shun.k===k)return FED.shun;const v=(await fedGet('kv','votes'))||[],targets=new Map();
  const R={asOf:reg?reg.asOf:0,servers:reg?reg.servers.map(s=>({id:s.id,operators:s.operators,listed:s.listed,answered:s.answered})):[]};
  for(const x of v){const b=x.rec.body,l=targets.get(b.target);const r={id:x.id,kind:x.rec.kind,key:x.rec.key,t:x.rec.t,server:b.server,target:b.target,reason:b.reason};if(l)l.push(r);else targets.set(b.target,[r]);}
  return FED.shun={k,R,reg:!!reg,targets,res:new Map(),now};}
const fedShunOf=(T,key,now)=>{if(T.now!==now){T.now=now;T.res=new Map();}let x=T.res.get(key);if(!x)T.res.set(key,x=fedShun(T.R,T.targets.get(key)||[],key,now));return x;};
// The tally about one network, for an operator's looking glass: votes, threshold, reasons with counts.
async function fedShunInfo(key,now=fedNow()){return fedShunOf(await fedShunTally(now),key,now);}
