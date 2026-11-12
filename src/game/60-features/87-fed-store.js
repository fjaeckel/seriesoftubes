/* ================= FEDERATION: what the browser keeps for every save =================
   Copies of other people's data live in IndexedDB (database sot-fed, shared by every slot), never in a save: other
   players' announcements with when each was last heard (ann), and small documents (kv): the server registry and gossip
   (catalog), leaderboard records per server, shun votes, hide lists, sync cursors. The operator key has its own store
   (op): never in a save or an export. Every access is wrapped: with IndexedDB missing, blocked or failing (some private
   windows), the same calls work from memory for this tab, and the game plays on. */
const FED_DB_NAME='sot-fed',FED_STORES=['ann','kv','op'],FED_ANN_MAX=5000,FED_FORGET=15552000,FED_BOARD_MAX=20000,FED_VOTES_MAX=4096;
const FEDDB={p:null,mem:null};
function fedMem(){if(!FEDDB.mem)FEDDB.mem=Object.fromEntries(FED_STORES.map(s=>[s,new Map()]));return FEDDB.mem;}
function fedDb(){if(FEDDB.p)return FEDDB.p;
  return FEDDB.p=new Promise(res=>{let f=null;try{f=FED.idb();}catch(e){}if(!f){res(null);return;}
    const t=FED.set(()=>res(null),5000);let rq;
    try{rq=f.open(FED_DB_NAME,1);}catch(e){FED.clear(t);res(null);return;}
    rq.onupgradeneeded=()=>{try{const d=rq.result;for(const s of FED_STORES)if(!d.objectStoreNames.contains(s))d.createObjectStore(s);}catch(e){}};
    rq.onsuccess=()=>{FED.clear(t);res(rq.result);};rq.onerror=rq.onblocked=()=>{FED.clear(t);res(null);};}).catch(()=>null);}
// One request in its own transaction; null (and memory from then on) if anything goes wrong.
function fedReq(store,mode,f){return fedDb().then(d=>{if(!d)return {mem:true};return new Promise(res=>{
  let r;try{const tx=d.transaction(store,mode);r=f(tx.objectStore(store));tx.oncomplete=()=>res({v:r.result});tx.onerror=tx.onabort=()=>res({mem:true});}catch(e){res({mem:true});}});})
  .catch(()=>({mem:true}));}
async function fedGet(store,key){const r=await fedReq(store,'readonly',o=>o.get(key));if(!r.mem)return r.v===undefined?null:r.v;FEDDB.p=Promise.resolve(null);
  const v=fedMem()[store].get(key);return v===undefined?null:v;}
async function fedPut(store,key,val){const r=await fedReq(store,'readwrite',o=>o.put(val,key));if(r.mem){FEDDB.p=Promise.resolve(null);fedMem()[store].set(key,val);}}
async function fedDel(store,key){const r=await fedReq(store,'readwrite',o=>o.delete(key));if(r.mem){FEDDB.p=Promise.resolve(null);fedMem()[store].delete(key);}}
// Every [key, value] of a store.
async function fedAll(store){const d=await fedDb();
  if(d){const r=await new Promise(res=>{try{const tx=d.transaction(store,'readonly'),o=tx.objectStore(store),ks=o.getAllKeys(),vs=o.getAll();
      tx.oncomplete=()=>res(ks.result.map((k,i)=>[k,vs.result[i]]));tx.onerror=tx.onabort=()=>res(null);}catch(e){res(null);}});
    if(r)return r;FEDDB.p=Promise.resolve(null);}
  return [...fedMem()[store].entries()];}

/* ---------- other players' networks: their newest announce and when they were last heard ---------- */
// Keeps an announce ({rec, id}, checked) if it is the newest of its key; heard: its board slot (or when we got it).
async function fedAnnPut(c,heard,srv){const k=c.rec.key,o=await fedGet('ann',k);
  if(o&&o.left&&c.rec.t<=o.left)return false;
  const n={rec:c.rec,id:c.id,heard:Math.max(heard,o?o.heard:0),srv:[...new Set([...(o&&o.srv||[]),srv].filter(Boolean))].slice(0,16)};
  if(o&&o.rec&&!fedNewer({rec:c.rec,id:c.id},{rec:o.rec,id:o.id})){if(n.heard===o.heard&&n.srv.length===o.srv.length)return false;n.rec=o.rec;n.id=o.id;}
  await fedPut('ann',k,n);await fedAnnCap();return true;}
// Any record of a key heard: its network is not quiet.
async function fedHeard(key,heard){const o=await fedGet('ann',key);if(o&&heard>o.heard){o.heard=heard;await fedPut('ann',key,o);}}
// A leave (§5.9): every record of that key at or before it is dropped, and it leaves the maps at once.
async function fedLeft(key,t){const o=await fedGet('ann',key);if(o&&o.rec&&o.rec.t>t)return;await fedPut('ann',key,{rec:null,id:null,heard:o?o.heard:0,left:t,srv:[]});}
async function fedAnnCap(){const all=await fedAll('ann');if(all.length<=FED_ANN_MAX)return;
  all.sort((a,b)=>a[1].heard-b[1].heard);for(const [k] of all.slice(0,all.length-FED_ANN_MAX))await fedDel('ann',k);}
/* Other players' networks as the game knows them: [{key, rec (the announce), heard, quiet {state, factor}}].
   Forgets those silent for 180 days (§10.6), and leaves out keys that left. */
async function fedNetworks(now=fedNow()){const out=[];
  for(const [k,o] of await fedAll('ann')){if(!o||now-o.heard>=FED_FORGET){await fedDel('ann',k);continue;}
    if(o.rec)out.push({key:k,rec:o.rec,id:o.id,heard:o.heard,quiet:fedQuiet(now,o.heard)});}
  return out;}

/* ---------- small documents ---------- */
// Shun and unshun votes ({rec, id}), kept until they expire; the tally reads them with the registry.
async function fedVotesAdd(cs){const l=(await fedGet('kv','votes'))||[];let ch=false;
  for(const c of cs)if(!l.some(x=>x.id===c.id)){l.push({id:c.id,rec:c.rec});ch=true;}
  if(!ch)return;const now=fedNow();l.sort((a,b)=>b.rec.t-a.rec.t);await fedPut('kv','votes',l.filter(x=>now-x.rec.t<=7776000+FED_CARRY).slice(0,FED_VOTES_MAX));}
// The leaderboard records last fetched from a server: {at, items [{id, key, slot, t, body, cc}]}.
async function fedBoardPut(server,items){items=items.slice().sort((a,b)=>b.slot-a.slot).slice(0,FED_BOARD_MAX);await fedPut('kv','board:'+server,{at:fedNow(),items});}
const fedBoardGet=server=>fedGet('kv','board:'+server);
// The operator key (an operator's own device only): {seed, pub}. Never in a save, never exported with one.
async function fedOpKey(){const o=await fedGet('op','key');return o&&fedBin(o.seed,32)&&!FdK(o.pub)?o:null;}
async function fedOpKeySet(seed){if(!fedBin(seed,32)||!await fedCan())return false;const k=await fedSigner(seed);await fedPut('op','key',{seed,pub:k.pub});return true;}
const fedOpKeyDel=()=>fedDel('op','key');
// Signs an operator record (hide, shun, unshun, operators, server) with the operator key; null without one.
async function fedOpSign(kind,body){const k=await fedOpKey();if(!k)return null;
  if(FED_KIND[kind]&&FED_KIND[kind][2])return fedCosign(k.seed,{v:1,kind,key:k.pub,t:fedNow(),body});
  return fedSignRec(k.seed,kind,body,fedNow());}
