/* ================= FEDERATION: what the browser keeps for every save =================
   Copies of other people's data live in IndexedDB (database sot-fed, shared by every slot), never in a save: other
   players' announcements with when each was last heard (ann), and small documents (kv): the server registry and gossip
   (catalog), the last leaderboard answers per server and slice, the networks each joined server excludes, hide lists,
   sync cursors, and
   on an operator's device only, shun votes. The operator key has its own store
   (op): never in a save or an export. Every access is wrapped: with IndexedDB missing, blocked or failing (some private
   windows), the same calls work from memory for this tab, and the game plays on. */
const FED_DB_NAME='sot-fed',FED_STORES=['ann','kv','op'],FED_ANN_MAX=5000,FED_FORGET=15552000,FED_VOTES_MAX=4096,FED_RANKS_MAX=48;
const FEDDB={p:null,mem:null,annN:null};
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
// How many entries a store has.
async function fedCount(store){const r=await fedReq(store,'readonly',o=>o.count());if(!r.mem&&Number.isSafeInteger(r.v))return r.v;FEDDB.p=Promise.resolve(null);return fedMem()[store].size;}
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
  await fedPut('ann',k,n);if(!o)await fedAnnGrew();return true;}
// Any record of a key heard: its network is not quiet.
async function fedHeard(key,heard){const o=await fedGet('ann',key);if(o&&heard>o.heard){o.heard=heard;await fedPut('ann',key,o);}}
// A leave (§5.9): every record of that key at or before it is dropped, and it leaves the maps at once.
async function fedLeft(key,t){const o=await fedGet('ann',key);if(o&&o.rec&&o.rec.t>t)return;await fedPut('ann',key,{rec:null,id:null,heard:o?o.heard:0,left:t,srv:[]});if(!o)await fedAnnGrew();}
/* The store holds at most FED_ANN_MAX keys, the least recently heard going first. A count is kept (read once), and the
   store is read whole only when it is a tenth over, so a first sync of thousands of networks does not read it each time. */
async function fedAnnGrew(){if(FEDDB.annN===null)FEDDB.annN=await fedCount('ann');else FEDDB.annN++;
  if(FEDDB.annN>FED_ANN_MAX+(FED_ANN_MAX/10|0))await fedAnnCap();}
async function fedAnnCap(){const all=await fedAll('ann');FEDDB.annN=all.length;if(all.length<=FED_ANN_MAX)return;
  all.sort((a,b)=>a[1].heard-b[1].heard);for(const [k] of all.slice(0,all.length-FED_ANN_MAX))await fedDel('ann',k);FEDDB.annN=FED_ANN_MAX;}
/* Other players' networks as the game knows them: [{key, rec (the announce), heard, quiet {state, factor}}].
   Forgets those silent for 180 days (§10.6), and leaves out keys that left. */
async function fedNetworks(now=fedNow()){const out=[],all=await fedAll('ann');FEDDB.annN=all.length;
  for(const [k,o] of all){if(!o||now-o.heard>=FED_FORGET){await fedDel('ann',k);FEDDB.annN--;continue;}
    if(o.rec)out.push({key:k,rec:o.rec,id:o.id,heard:o.heard,quiet:fedQuiet(now,o.heard),srv:o.srv||[]});}
  return out;}

/* ---------- small documents ---------- */
/* Shun and unshun votes ({rec, id}), kept until they expire, and only on a device with an operator key (§12: nodes send
   votes to operators only); the operator panel's tally reads them with the registry. voters (fedVoters): only votes
   signed by an operator of a voting server are kept, the stored ones checked again with them. */
// One at a time (the operator's own vote and votes from nodes can arrive together).
function fedVotesAdd(cs,voters){const p=(FEDDB.vq||Promise.resolve()).then(()=>fedVotesRun(cs,voters));FEDDB.vq=p.catch(()=>{});return p;}
async function fedVotesRun(cs,voters){if(!await fedOpKey())return;voters=voters||await fedVoters();const l=(await fedGet('kv','votes'))||[],ids=new Set(l.map(x=>x.id));let ch=false;
  for(const c of cs)if(!ids.has(c.id)&&fedVoteOk(voters,c.rec)){ids.add(c.id);l.push({id:c.id,rec:c.rec});ch=true;}
  if(!ch)return;const now=fedNow();l.sort((a,b)=>b.rec.t-a.rec.t);
  // The tally's cache key moves only once the votes are written: a tally read in between would keep the old ones.
  await fedPut('kv','votes',l.filter(x=>now-x.rec.t<=7776000+FED_CARRY&&fedVoteOk(voters,x.rec)).slice(0,FED_VOTES_MAX));FED.vgen++;}
// Without an operator key no vote is kept: any left from one removed (or from before votes were for operators) go.
async function fedVotesTidy(){if(await fedOpKey())return;if(await fedGet('kv','votes')){await fedDel('kv','votes');FED.vgen++;}await fedDel('kv','vcursors');
  // Players' reports too (§5.10): kept only on an operator's device.
  if(await fedGet('kv','reports'))await fedDel('kv','reports');await fedDel('kv','rcursors');}
/* The last ranks answer of each joined URL, network and slice, for offline viewing "as of" (§9.5): kv 'ranks',
   {entries: {"<url> <key> <slice>": {at, a}}}, at most FED_RANKS_MAX (the oldest go). One write at a time. Keyed by
   the network too: the answer's own row (me) is the row of the key proved, and the store is shared by every slot. */
function fedRanksPut(url,pub,k,a){const p=(FEDDB.rq||Promise.resolve()).then(async()=>{const o=(await fedGet('kv','ranks'))||{entries:{}},e=o.entries||{};
    e[url+' '+pub+' '+k]={at:fedNow(),a};const ks=Object.keys(e).sort((x,y)=>e[y].at-e[x].at);for(const x of ks.slice(FED_RANKS_MAX))delete e[x];
    await fedPut('kv','ranks',{entries:e});});FEDDB.rq=p.catch(()=>{});return p;}
async function fedRanksGet(url,pub,k){const o=await fedGet('kv','ranks'),i=url+' '+pub+' '+k,x=o&&o.entries&&fedOwn(o.entries,i)&&o.entries[i];return x&&fedRanksOk({m:'ranks',...x.a})?{at:x.at,a:fedRanksOk({m:'ranks',...x.a})}:null;}
// The operator key (an operator's own device only): {seed, pub}. Never in a save, never exported with one.
async function fedOpKey(){const o=await fedGet('op','key');return o&&fedBin(o.seed,32)&&!FdK(o.pub)?o:null;}
async function fedOpKeySet(seed){if(!fedBin(seed,32)||!await fedCan())return false;const k=await fedSigner(seed);await fedPut('op','key',{seed,pub:k.pub});
  fedOpChanged().catch(()=>{});return true;}
async function fedOpKeyDel(){await fedDel('op','key');await fedOpChanged();}
// Signs an operator record (hide, shun, unshun, operators, server) with the operator key; null without one.
async function fedOpSign(kind,body){const k=await fedOpKey();if(!k)return null;
  if(FED_KIND[kind]&&FED_KIND[kind][2])return fedCosign(k.seed,{v:1,kind,key:k.pub,t:fedNow(),body});
  return fedSignRec(k.seed,kind,body,fedNow());}
