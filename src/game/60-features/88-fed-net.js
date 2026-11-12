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
  // ms: opening a socket, a request's answer, ping when idle, give up when silent, the idle check, stats, back-off.
  T:{open:15000,req:20000,idle:60000,dead:120000,tick:30000,stats:300000,statsMax:3600,first:5000,base:2000,cap:1800000,fetch:10000},
  hooks:{stats:null,deal:null},bgen:0,bd:null,vgen:0,shun:null,live:null,st:{},ev:{},soon:false,listening:false,sent:new Map(),ids:new WeakMap()};

/* ---------- events for the interface and the gameplay ---------- */
// fedOn(name, fn) gives a function that stops listening. Names: status, records, deal, board, catalog, mute.
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
    M.statsT=FED.set(()=>fedStatsTick(M),FED.T.first);}
  for(const u of f.servers)if(!M.conns.has(u))fedConnect(M,u);
  for(const [u,c] of M.conns)if(!f.servers.includes(u)){M.conns.delete(u);fedHang(c);delete FED.st[u];}
  fedEmit('status',fedStatus());}
function fedStop(){const M=FED.live;if(!M)return;FED.live=null;FED.clear(M.statsT);for(const c of M.conns.values())fedHang(c);FED.st={};fedEmit('status',fedStatus());}
function fedListen(){if(FED.listening)return;FED.listening=true;
  const go=()=>{const M=FED.live;if(!M||!FED.visible())return;if(!fedMine(M)){fedWake();return;}
    for(const c of M.conns.values())if(c.state==='waiting'||c.state==='offline'&&c.tries)fedDial(c);};
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
  FED.st[c.url]={state,since:o&&up===was?o.since:fedNow(),server:c.srv,node:c.node};
  if(!o||o.state!==state)fedEmit('status',fedStatus());}

/* ---------- one connection per joined server, failing over between its nodes ---------- */
function fedConnect(M,url){const c={M,url,nodes:[url],ni:0,ws:null,state:'idle',tries:0,t:null,tick:null,rq:new Map(),nid:0,srv:null,node:null,nodeKey:null,lastIn:0,lastOut:0,sub:0,phase:''};
  M.conns.set(url,c);fedDial(c);}
const fedLive=c=>{if(fedMine(c.M)&&c.M.conns.get(c.url)===c)return true;if(FED.live===c.M&&!fedMine(c.M))fedWake();return false;};
// Closes a socket without its handlers firing back, and answers every pending request with null.
function fedHang(c){FED.clear(c.t);FED.clear(c.tick);c.t=c.tick=null;const ws=c.ws;c.ws=null;c.phase='';
  if(ws){ws.onopen=ws.onmessage=ws.onerror=ws.onclose=null;try{ws.close();}catch(e){}}
  for(const r of c.rq.values()){FED.clear(r.t);r.res(null);}c.rq.clear();c.sub=0;}
function fedDial(c){if(!fedLive(c))return;fedHang(c);
  if(!FED.visible()){fedSt(c,'waiting');return;}
  const url=c.nodes[c.ni%c.nodes.length];let ws;c.node=url;
  try{ws=FED.WS(url);}catch(e){fedDrop(c,'open');return;}
  c.ws=ws;c.phase='open';fedSt(c,c.state==='offline'||c.state==='waiting'?'offline':'connecting');
  c.t=FED.set(()=>fedDrop(c,'timeout'),FED.T.open);
  ws.onopen=()=>{if(c.ws!==ws)return;c.phase='hello';fedSend(c,{m:'hello',vers:FED_VERS,role:'client'});};
  ws.onmessage=e=>{if(c.ws===ws)fedIn(c,e.data);};
  ws.onerror=()=>{};// a close follows
  ws.onclose=()=>{if(c.ws===ws)fedDrop(c,'closed');};}
/* The connection is gone: try the server's next node at once, and after a full round of them wait, longer each time
   (2 s doubling, at most 30 min, with jitter), and only while the tab is visible. */
function fedDrop(c,why){fedErrLog(c.node,c.srv,why);fedHang(c);if(!fedLive(c))return;c.ni++;
  if(c.ni%c.nodes.length===0)c.tries++;
  fedSt(c,'offline');
  const wait=c.wait=c.ni%c.nodes.length?250:Math.min(FED.T.cap,FED.T.base*2**Math.min(20,c.tries-1))*(0.5+FED.rand()/2);
  c.t=FED.set(()=>fedDial(c),wait);}
// The nodes of a connection's server, from the catalog: the joined URL first, then the others, for failing over.
async function fedLearn(c,srvs){const e=c.srv&&(srvs||await fedServers()).find(x=>x.id===c.srv);if(!e||!fedLive(c))return null;
  const cur=c.nodes[c.ni%c.nodes.length];c.nodes=[c.url,...e.nodes.map(n=>n.url).filter(u=>u!==c.url)];c.ni=Math.max(0,c.nodes.indexOf(cur));return e;}
async function fedLearnAll(M){if(!fedMine(M))return;const s=await fedServers();for(const c of M.conns.values())await fedLearn(c,s);}
function fedSend(c,m){const t=JSON.stringify(m);if(!c.ws||fedSize(t)>FED_FRAME)return false;try{c.ws.send(t);c.lastOut=fedNow();return true;}catch(e){return false;}}
// A request: resolves with the answer frame, or null on timeout or a lost connection. many: answers come as several
// recs frames ending with more:false, gathered into one.
function fedAsk(c,m,many){return new Promise(res=>{if(c.phase!=='ready'&&c.phase!=='check'){res(null);return;}const id=c.nid=c.nid%2147483646+1;
  const r={res,many,items:[],n:0,t:FED.set(()=>{c.rq.delete(id);res(null);},FED.T.req)};c.rq.set(id,r);
  if(!fedSend(c,{...m,id})){FED.clear(r.t);c.rq.delete(id);res(null);}});}

/* ---------- frames from a node ---------- */
function fedIn(c,text){c.lastIn=fedNow();const r=fedFrame(text,'node');if(r.error){fedDrop(c,r.error);return;}const f=r.f;
  if(f.m==='welcome'){if(c.phase!=='hello'||f.ver!==1||c.srv&&f.server!==c.srv){fedDrop(c,'welcome');return;}
    FED.clear(c.t);c.t=null;c.srv=f.server;c.nodeKey=f.node;c.phase='check';
    c.tick=FED.set(function tk(){if(!fedLive(c)||!c.ws)return;const n=fedNow();
      if(n-c.lastIn>=FED.T.dead/1000){fedDrop(c,'silent');return;}
      if(n-c.lastOut>=FED.T.idle/1000)fedSend(c,{m:'ping',id:c.nid=c.nid%2147483646+1});c.tick=FED.set(tk,FED.T.tick);},FED.T.tick);
    fedReady(c).catch(e=>{console.error('[tubes] federation sync',e);});return;}
  if(c.phase!=='ready'&&c.phase!=='check'){fedDrop(c,'not_ready');return;}
  if(f.m==='ping'){fedSend(c,{m:'pong',id:f.id,now:fedNow()});return;}
  if(f.m==='recs'&&c.sub&&f.id===c.sub){fedRecs(c,f.items,null,null).then(()=>{if(typeof f.cursor==='string'&&/^[A-Za-z0-9_-]{0,64}$/.test(f.cursor))return fedPut('kv','cursor:'+c.node,f.cursor);}).catch(()=>{});return;}
  if(f.m==='catalog'&&f.id===undefined){fedGossip(f.entries).catch(()=>{});return;}
  const q=f.id!==undefined&&c.rq.get(f.id);
  if(!q){if(f.m==='err'&&f.id===undefined)fedDrop(c,f.code);return;}
  if(q.many&&f.m==='recs'){q.items.push(...f.items);if(f.more===true&&++q.n<512&&q.items.length<200000)return;}
  FED.clear(q.t);c.rq.delete(f.id);q.res(q.many&&f.m==='recs'?{...f,items:q.items}:f);}
/* Just connected: make sure the node is one of its server's (when the catalog knows the server: the registry is asked
   first, for at most FED.T.fetch), then send what waits and follow the news. */
async function fedReady(c){await c.M.cat;if(!fedLive(c)||c.phase!=='check')return;const e=await fedLearn(c);
  if(e){const keys=e.nodes.map(n=>n.key);if(!keys.includes(c.nodeKey)){fedDrop(c,'not_node');return;}
    const nonce=fedB64(fedNonce()),p=await fedAsk(c,{m:'challenge',nonce});if(!fedLive(c)||c.phase!=='check')return;if(!p||p.m!=='proof'){fedDrop(c,'bad_challenge');return;}
    if(await fedProofErr(p.proof,nonce,c.srv,c.nodeKey,fedNow())){fedDrop(c,'bad_challenge');return;}}
  if(!fedLive(c)||c.phase!=='check')return;c.phase='ready';c.tries=0;fedSt(c,'connected');fedFlush(c);
  const since=(await fedGet('kv','cursor:'+c.node))||'';if(!fedLive(c)||c.phase!=='ready')return;
  c.sub=c.nid=c.nid%2147483646+1;fedSend(c,{m:'sub',id:c.sub,kinds:['announce','offer','accept','decline','leave','hide','shun','unshun'],since:typeof since==='string'?since:''});
  const cat=await fedAsk(c,{m:'servers'});if(cat&&cat.m==='catalog')await fedGossip(cat.entries);}
function fedNonce(){const a=new Uint8Array(32);try{crypto.getRandomValues(a);}catch(e){for(let i=0;i<32;i++)a[i]=FED.rand()*256|0;}return a;}

/* ---------- sending what waits in the save ---------- */
async function fedRid(r){let id=FED.ids.get(r);if(!id){id=await fedId(r);FED.ids.set(r,id);}return id;}
function fedFlushSoon(){const M=FED.live;if(M&&fedMine(M))for(const c of M.conns.values())if(c.phase==='ready')fedFlush(c);}
// Puts every queued record this server has not taken yet; a record leaves the queue once every joined server took it
// (or refused it for good). Rate limits and failures leave it for later.
// A record queued while a flush runs goes out with one more pass right after it.
function fedFlush(c){if(c.flushP){c.more=true;return c.flushP;}return c.flushP=fedFlushRun(c).finally(()=>{c.flushP=null;if(c.more){c.more=false;if(fedLive(c)&&c.phase==='ready')fedFlush(c);}});}
async function fedFlushRun(c){const f=c.M.fed;let ch=false;
  {for(const r of f.out.slice()){if(!fedLive(c)||c.phase!=='ready')break;const id=await fedRid(r),done=FED.sent.get(id)||new Set();if(done.has(c.url))continue;
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

/* ---------- records from a node: checked, then kept where they belong ---------- */
// Receipts: the earliest valid one gives the board slot (§10.1), and its country (a shared stats record only).
async function fedPlace(c,chk,rcpts,now,srvs){let slot=null,cc=null;
  for(const rc of Array.isArray(rcpts)?rcpts.slice(0,16):[]){const sid=rc&&rc.body&&rc.body.server;if(typeof sid!=='string')continue;
    const e=srvs.find(x=>x.id===sid),nodes=e?e.nodes.map(n=>n.key):sid===c.srv&&c.nodeKey?[c.nodeKey]:null;if(!nodes)continue;
    if(await fedRcptErr(rc,chk.rec,chk.id,sid,nodes,now))continue;if(slot===null||rc.t<slot){slot=rc.t;cc=rc.body.cc||null;}}
  return {slot,cc};}
/* Items [{rec, rcpt}] from a sub or a board answer. board: a Map id -> board item to fill, or null; known: board
   items already checked (by id), which are not checked again. */
async function fedRecs(c,items,board,known){const now=fedNow(),me=c.M.fed.key.pub,votes=[],srvs=await fedServers();let n=0,voters=null;
  for(const it of Array.isArray(items)?items:[]){if(!fedLive(c))return;if(!it||typeof it!=='object')continue;
    if(known&&it.rec&&it.rec.kind==='stats'&&!fedValues(it.rec)&&!fedEnv(it.rec,FED_REC)){const o=known.get(await fedId(it.rec));if(o){board.set(o.id,o);continue;}}
    const chk=await fedCheck(it.rec,now);if(!chk.ok)continue;n++;const r=chk.rec,pl=await fedPlace(c,chk,it.rcpt,now,srvs),heard=pl.slot??fedSlot(now);
    if(['announce','stats','offer','accept','decline'].includes(r.kind))await fedHeard(r.key,heard);
    if(r.kind==='announce')await fedAnnPut(chk,heard,c.srv);
    else if(r.kind==='leave')await fedLeft(r.key,r.t);
    // Votes only from an operator of a voting registry server, hide lists only from an operator of their server.
    else if(r.kind==='shun'||r.kind==='unshun'){if(!voters)voters=await fedVoters();if(fedVoteOk(voters,r))votes.push(chk);}
    else if(r.kind==='hide'){if(fedOpOf(srvs,r.body.server,r.key)){const o=await fedGet('kv','hide:'+r.body.server);if(!o||!o.rec||fedNewer(chk,o))await fedPut('kv','hide:'+r.body.server,{rec:r,id:chk.id});}}
    else if(r.kind==='stats'&&board&&pl.slot!==null)board.set(chk.id,{id:chk.id,key:r.key,slot:pl.slot,t:r.t,body:r.body,cc:pl.cc,srv:[c.srv]});
    else if((r.kind==='offer'||r.kind==='accept'||r.kind==='decline')&&(r.body.to===me||r.key===me||!!FED.hooks.deal&&FED.hooks.deal(r)))fedEmit('deal',{rec:r,id:chk.id,slot:heard,server:c.srv});}
  if(votes.length)await fedVotesAdd(votes,voters);
  if(n)fedEmit('records',{server:c.srv,n});}
/* Fetches a joined server's board records (§9.5) and keeps them for offline viewing. Gives the number of records, or
   null when that server is not connected now (the cached ones stay). */
async function fedBoardFetch(url){const M=FED.live,c=M&&M.conns.get(url);if(!c||c.phase!=='ready'||!c.srv)return null;
  const old=await fedBoardGet(c.srv),known=new Map((old&&old.items||[]).map(x=>[x.id,x]));
  const a=await fedAsk(c,{m:'board'},true);if(!a||a.m!=='recs')return null;
  const board=new Map();await fedRecs(c,a.items,board,known);
  if(!fedLive(c))return null;await fedBoardPut(c.srv,[...board.values()]);fedEmit('board',{server:c.srv,n:board.size});return board.size;}
/* Everything the boards are computed from, from the cache (works offline): {records (merged over the joined servers,
   or one server's), announces (Map key -> announce), exclude (muted, hidden by those servers, shunned), at (oldest
   fetch time, for "as of …")}. */
async function fedBoardData(server=null){const f=S&&S.fed,ids=[...new Set(Array.isArray(server)?server:server?[server]:Object.values(FED.st).map(x=>x.server).filter(Boolean))],now=fedNow(),me=f&&f.key?f.key.pub:null;
  const {records,at}=await fedBoardRecs(ids,now,me),anns=new Map((await fedNetworks(now)).map(n=>[n.key,n.rec])),ex=new Set(f?f.muted:[]);
  const srvs=ids.length?await fedServers():[];for(const id of ids){const h=await fedHides(id,srvs);if(h)for(const k of h.rec.body.hide)ex.add(k);}
  for(const k of await fedShunned(now))ex.add(k);
  return {now,records,announces:anns,exclude:[...ex],deals:f?f.deals:[],me,at};}
/* The board records of these servers merged, at most FED_BOARD_MAX (the newest) from at most FED_BOARD_KEYS networks
   (the most recently heard, and this one). The same array again until a server's records change here (FED.bgen) or a
   slot went by, so the boards over it are computed once (fedBoard keeps them per array). */
async function fedBoardRecs(ids,now,me){const k=ids.join(' ')+'|'+me,o=FED.bd;if(o&&o.k===k&&o.g===FED.bgen&&now-o.made<FED_SLOT)return o;
  const g=FED.bgen,by=new Map();let at=null;
  for(const id of ids){const b=await fedBoardGet(id);if(!b||!Array.isArray(b.items))continue;at=at===null?b.at:Math.min(at,b.at);
    for(const x of b.items){const o=by.get(x.id);if(o)o.srv=[...new Set([...o.srv,id])];else by.set(x.id,{...x,srv:[id]});}}
  let records=[...by.values()];if(records.length>FED_BOARD_MAX){records.sort((a,b)=>b.slot-a.slot);records.length=FED_BOARD_MAX;}
  const newest=new Map();for(const r of records)if(!(newest.get(r.key)>=r.slot))newest.set(r.key,r.slot);
  if(newest.size>FED_BOARD_KEYS){const keep=new Set([...newest].sort((a,b)=>b[1]-a[1]||fedByStr(a[0],b[0])).slice(0,FED_BOARD_KEYS).map(x=>x[0]));
    if(me)keep.add(me);records=records.filter(r=>keep.has(r.key));}
  return FED.bd={k,g,made:now,records,at};}
// A board slice, ready to show (fedSlice over fedBoardData).
async function fedBoardView(v){const d=await fedBoardData(v.server||null);return {...fedSlice(v,d),at:d.at};}

/* ---------- the catalog: the registry on the site, gossip from nodes, cached ---------- */
// Fetches the registry (same origin, a static file on the site) and keeps what checks; the cache stays when it fails.
async function fedCatalogLoad(){let txt=null;
  try{const ac=typeof AbortController==='function'?new AbortController():null,t=FED.set(()=>ac&&ac.abort(),FED.T.fetch);
    const r=await FED.fetch(FED.registry,ac?{signal:ac.signal,cache:'no-cache'}:{});FED.clear(t);if(r&&r.ok)txt=await r.text();}catch(e){}
  if(txt==null||fedSize(txt)>8e6)return false;/* the cache stays */let j;try{j=JSON.parse(txt);}catch(e){return false;}
  if(!j||j.v!==1||!Array.isArray(j.servers)||!Number.isSafeInteger(j.asOf))return false;const now=fedNow(),out=[];
  for(const e of j.servers.slice(0,2000)){if(!e||typeof e!=='object')continue;const r=await fedRegEntry(e,now);if(!r.ok||r.id!==e.id)continue;
    out.push({...fedSum(r),listed:Number.isSafeInteger(e.listed)?e.listed:null,answered:Number.isSafeInteger(e.answered)?e.answered:null});}
  await fedPut('kv','registry',{asOf:j.asOf,at:now,servers:out});fedEmit('catalog',{source:'registry'});return true;}
const fedSum=r=>({id:r.id,rid:r.srvId,t:r.srv.t,name:r.name,nodes:r.nodes,operators:r.ops,sync:r.sync,noLogs:r.noLogs,langs:r.srv.body.langs,desc:r.srv.body.desc});
// Gossip entries from a node ({genesis, chain, server, path, seen}): checked, then kept (a few per server).
async function fedGossip(entries){if(!Array.isArray(entries))return;const now=fedNow(),g=(await fedGet('kv','gossip'))||[];let ch=false;
  for(const e of entries.slice(0,256)){if(!e||typeof e!=='object')continue;const r=await fedRegEntry(e,now);if(!r.ok)continue;
    const x=fedGossipIn({id:r.id,path:e.path,seen:e.seen},null,now);if(x.action!=='store')continue;
    g.push({id:r.id,server:fedSum(r),path:e.path,seen:e.seen});ch=true;}
  if(!ch)return;const keep=[],per=new Map();
  for(const e of g.sort((a,b)=>b.seen-a.seen)){const n=per.get(e.id)||0;if(now<e.seen+FED_CARRY&&n<4&&keep.length<4000){keep.push(e);per.set(e.id,n+1);}}
  await fedPut('kv','gossip',keep);fedEmit('catalog',{source:'gossip'});}
/* The servers this browser knows (§10.8 merge, registry first): [{id, source ('registry' or 'gossip'), name, nodes
   [{key, url}], operators, sync, noLogs, langs, desc, seen, path, listed, answered}], sorted by id. */
async function fedServers(){const reg=(await fedGet('kv','registry'))||{servers:[]},gos=(await fedGet('kv','gossip'))||[],now=fedNow();
  const info=new Map();for(const g of gos)if(!info.has(g.id)||g.server.t>info.get(g.id).t)info.set(g.id,g.server);for(const r of reg.servers)info.set(r.id,r);
  return fedCatalogMerge(reg.servers.map(s=>({id:s.id,server:s})),gos,now).map(row=>{const i=info.get(row.id)||{};
    return {...row,sync:i.sync,noLogs:i.noLogs,langs:i.langs||[],desc:i.desc||'',listed:i.listed??null,answered:i.answered??null};});}
/* Who may vote and hide, at the head of each server's chain as the catalog has it. fedVoters: the voting registry
   servers (§10.7) as Map id -> operator keys; fedOpOf: whether key operates server id. */
async function fedVoters(){const reg=await fedGet('kv','registry'),m=new Map();if(!reg||!Array.isArray(reg.servers))return m;
  for(const s of reg.servers)if(fedVoter(s,reg.asOf)&&Array.isArray(s.operators))m.set(s.id,new Set(s.operators));return m;}
const fedVoteOk=(voters,r)=>{const o=r&&r.body&&voters.get(r.body.server);return !!o&&o.has(r.key);};
const fedOpOf=(srvs,id,key)=>{const e=srvs.find(x=>x.id===id);return !!e&&Array.isArray(e.operators)&&e.operators.includes(key);};
// A server's hide record ({rec, id}) when an operator of that server signed it, else null.
async function fedHides(id,srvs){const h=await fedGet('kv','hide:'+id);if(!h||!h.rec)return null;return fedOpOf(srvs||await fedServers(),id,h.rec.key)?h:null;}
/* The shun tally of every target, from the registry snapshot and the votes this browser has: {targets: Map target ->
   its votes}, the tally per target counted on demand and kept until the votes, the registry or the slot change. */
async function fedShunTally(now){const reg=await fedGet('kv','registry'),k=FED.vgen+'|'+(reg?reg.at+'/'+reg.asOf:'')+'|'+fedSlot(now);
  if(FED.shun&&FED.shun.k===k)return FED.shun;const v=(await fedGet('kv','votes'))||[],targets=new Map();
  const R={asOf:reg?reg.asOf:0,servers:reg?reg.servers.map(s=>({id:s.id,operators:s.operators,listed:s.listed,answered:s.answered})):[]};
  for(const x of v){const b=x.rec.body,l=targets.get(b.target);const r={id:x.id,kind:x.rec.kind,key:x.rec.key,t:x.rec.t,server:b.server,target:b.target,reason:b.reason};if(l)l.push(r);else targets.set(b.target,[r]);}
  return FED.shun={k,R,reg:!!reg,targets,res:new Map(),now};}
const fedShunOf=(T,key,now)=>{if(T.now!==now){T.now=now;T.res=new Map();}let x=T.res.get(key);if(!x)T.res.set(key,x=fedShun(T.R,T.targets.get(key)||[],key,now));return x;};
// Keys the federation shuns now (§10.7).
async function fedShunned(now=fedNow()){const T=await fedShunTally(now);if(!T.reg)return [];return [...T.targets.keys()].filter(k=>fedShunOf(T,k,now).shunned);}
// The tally about one network (its own game tells the player why it can no longer reach others, with the reasons).
async function fedShunInfo(key,now=fedNow()){return fedShunOf(await fedShunTally(now),key,now);}
