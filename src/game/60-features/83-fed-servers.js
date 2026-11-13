/* ================= FEDERATION: servers =================
   A server is its operator list (§8): the chain of majority-signed proposals from its genesis, its server record, its
   registry file (§11) and catalog gossip (§10.8). Plus the sync policies and versions (§9.2, §10.9) and the frames a
   node takes from a client (§9.1, §9.3). Pure functions: inputs in, results out. */
const fedMaj=(ops,keys)=>keys.filter(k=>ops.includes(k)).length*2>ops.length;
const fedSortKeys=a=>a.slice().sort(fedByStr),fedSortNodes=a=>a.slice().sort((x,y)=>fedByStr(x.key,y.key));
function fedApplicable(b,ops,nodes){const has=nodes.some(n=>n.key===b.target);
  return b.action==='add_operator'?!ops.includes(b.target)&&ops.length<16:b.action==='remove_operator'?ops.includes(b.target)&&ops.length>=2:
    b.action==='set_node'?has||nodes.length<16:has&&nodes.length>=2;}
function fedApply(b,st){const ops=st.ops,nodes=st.nodes;
  if(b.action==='add_operator')return {ops:fedSortKeys(ops.concat([b.target])),nodes};
  if(b.action==='remove_operator')return {ops:ops.filter(k=>k!==b.target),nodes};
  if(b.action==='set_node')return {ops,nodes:fedSortNodes(nodes.filter(n=>n.key!==b.target).concat([{key:b.target,url:b.url}]))};
  return {ops,nodes:nodes.filter(n=>n.key!==b.target)};}
/* The chain (§8.1) from a genesis and every operators record known (each {rec, id}, already checked): gives
   {id (the server identity), head, ops, nodes, at (head -> lists), applied (ids in order), pending (ids, sorted)}.
   Depends only on the set of records, never their order or the clock (except which proposals are still pending). */
function fedChain(gen,gid,props,now){let st={ops:[gen.key],nodes:[gen.body.node]},head=gid;const at=new Map([[head,st]]),applied=[];
  const mine=props.filter(p=>p.rec.kind==='operators'&&p.rec.body.server===gid),sigs=p=>p.rec.sigs.map(x=>x.key);
  for(;;){const c=mine.filter(p=>p.rec.body.prev===head&&st.ops.includes(p.rec.key)&&fedApplicable(p.rec.body,st.ops,st.nodes)&&fedMaj(st.ops,sigs(p)))
      .sort((a,b)=>fedByStr(a.id,b.id))[0];
    if(!c)break;st=fedApply(c.rec.body,st);head=c.id;at.set(head,st);applied.push(c.id);}
  const pending=mine.filter(p=>p.rec.body.prev===head&&st.ops.includes(p.rec.key)&&fedApplicable(p.rec.body,st.ops,st.nodes)&&!fedMaj(st.ops,sigs(p))&&now<p.rec.t+1209600)
    .map(p=>p.id).sort(fedByStr);
  return {id:gid,head,ops:st.ops,nodes:st.nodes,at,applied,pending};}
// A server record against a chain (§8.2): null when valid, else bad_chain or no_majority.
function fedServerErr(srv,chain){const b=srv.body,st=chain.at.get(b.head);
  if(b.server!==chain.id||!st||fedCanon(b.nodes)!==fedCanon(st.nodes)||fedCanon(b.operators)!==fedCanon(st.ops))return 'bad_chain';
  return fedMaj(st.ops,srv.sigs.map(x=>x.key))?null:'no_majority';}
/* Storing a record (§10.11) in store (a Map id -> record): gives 'stored', 'duplicate', 'merged' (new signatures of a
   multi-signer record joined the stored ones) or the error code; an invalid copy never changes what is stored. */
async function fedStoreRec(store,x,now){const c=await fedCheck(x,now);if(!c.ok)return c.error;const o=store.get(c.id);
  if(!o){store.set(c.id,c.rec);return 'stored';}if(!c.rec.sigs)return 'duplicate';
  const add=c.rec.sigs.filter(s=>!o.sigs.some(y=>y.key===s.key));if(!add.length)return 'duplicate';
  store.set(c.id,{...o,sigs:o.sigs.concat(add).sort((a,b)=>fedByStr(a.key,b.key))});return 'merged';}
// The newest of records (greatest t, then lowest id): the rule for announce, hide and server records.
const fedNewer=(a,b)=>a.rec.t!==b.rec.t?a.rec.t>b.rec.t:a.id<b.id;

/* ---------- the registry (§11): one file per server, and servers.json built from them ---------- */
const FED_REGF=['v','genesis','chain','server','listed','answered'];
/* A registry entry {genesis, chain, server} as in a file or servers.json, checked at `now` (§11.2 steps 2, 4 and 5):
   {ok:true, id, name, sync, noLogs, ops, nodes, srv (the server record), chain} or {ok:false, error}. */
async function fedRegEntry(j,now){
  const g=await fedCheck(j.genesis,now,{kinds:{genesis:1}});if(!g.ok)return g;
  if(!Array.isArray(j.chain))return fedNo(FdBF);if(j.chain.length>64)return fedNo('too_many');
  const ch=[];for(const r of j.chain){const c=await fedCheck(r,now,{kinds:{operators:1}});if(!c.ok)return c;ch.push(c);}
  const s=await fedCheck(j.server,now,{kinds:{server:1}});if(!s.ok)return s;
  let st={ops:[g.rec.key],nodes:[g.rec.body.node]},head=g.id;const at=new Map([[head,st]]),no=error=>({ok:false,error,id:g.id});
  for(const c of ch){const b=c.rec.body;
    if(b.prev!==head||b.server!==g.id||!st.ops.includes(c.rec.key)||!fedApplicable(b,st.ops,st.nodes))return no('bad_chain');
    if(!fedMaj(st.ops,c.rec.sigs.map(x=>x.key)))return no('no_majority');
    st=fedApply(b,st);head=c.id;at.set(head,st);}
  const chain={id:g.id,head,ops:st.ops,nodes:st.nodes,at,applied:ch.map(c=>c.id),pending:[]};
  if(s.rec.body.head!==head)return no('bad_chain');
  const e=fedServerErr(s.rec,chain);if(e)return no(e);
  const b=s.rec.body;return {ok:true,id:g.id,name:b.name,sync:b.sync,noLogs:b.noLogs,ops:st.ops,nodes:st.nodes,srv:s.rec,srvId:s.id,chain};}
const fedFold=s=>s.replace(/[A-Z]/g,c=>c.toLowerCase());
// A registry file's shape (§11.2 step 1, after size and JSON).
function fedRegShape(j){if(!j||typeof j!=='object'||Array.isArray(j))return FdBF;
  for(const k of Object.keys(j))if(!FED_REGF.includes(k))return 'unknown_field';
  for(const k of FED_REGF.slice(0,4))if(!fedOwn(j,k))return FdMF;
  if(j.v!==1)return FdBF;
  for(const k of ['listed','answered'])if(fedOwn(j,k)&&!(Number.isSafeInteger(j[k])&&j[k]>=0&&j[k]%FED_DAY===0))return FdBF;
  return null;}
/* relay check-registry (§11.2 steps 1 to 8; step 9, a node answering, needs the network and is the relay's): files is
   {file name: text}, name the file to check, base its text on the base branch (or null). Gives null or the error. */
async function fedRegCheck(files,name,base,now){const txt=files[name];if(fedSize(txt)>65536)return 'too_big';
  let j;try{j=JSON.parse(txt);}catch(e){return 'bad_json';}
  let e=fedRegShape(j);if(e)return e;
  const r=await fedRegEntry(j,now);
  if(!r.ok){if(['bad_chain','no_majority'].includes(r.error))return name===r.id+'.json'?r.error:'id_mismatch';return r.error;}
  if(name!==r.id+'.json')return 'id_mismatch';
  if(r.noLogs!==true)return 'no_logs';
  {const n=j.genesis&&j.genesis.body&&j.genesis.body.node,u=[n&&n.url,...j.chain.map(p=>p&&p.body&&p.body.url).filter(x=>x!==undefined),...(j.server.body.nodes||[]).map(x=>x&&x.url)];if(u.some(x=>!fedPublicUrl(x)))return 'local_url';}
  for(const [n,t] of Object.entries(files)){if(n===name)continue;let o=null;try{o=JSON.parse(t);}catch(x){}
    const nm=o&&o.server&&o.server.body&&o.server.body.name;if(typeof nm==='string'&&fedFold(nm)===fedFold(r.name))return 'name_taken';}
  if(base!=null){let b=null;try{b=JSON.parse(base);}catch(x){}if(b&&(b.listed!==j.listed||b.answered!==j.answered))return FdBF;}
  return null;}
// What the build publishes as servers.json (§11.3) from the same folder.
async function fedServersJson(files,now){const servers=[];let asOf=0;
  for(const n of Object.keys(files).filter(n=>n.endsWith('.json')).sort()){if(await fedRegCheck(files,n,null,now))continue;
    const j=JSON.parse(files[n]),o={id:n.slice(0,-5),genesis:j.genesis,chain:j.chain,server:j.server};
    for(const k of ['listed','answered'])if(fedOwn(j,k))o[k]=j[k];if(o.answered>asOf)asOf=o.answered;servers.push(o);}
  servers.sort((a,b)=>fedByStr(a.id,b.id));return {v:1,asOf,servers};}

/* ---------- catalog gossip (§10.8) ---------- */
// Receiving an entry ({id, path, seen}, its records already checked) as server `self` (null for a client, which never
// passes anything on): {action:'store', forward}, {action:'drop', why} or {action:'refuse', error}.
function fedGossipIn(e,self,now){const p=e.path,no=error=>({action:'refuse',error});
  if(!Array.isArray(p)||!p.length||p[0]!==e.id)return no(FdBF);if(p.length>16)return no('too_many');
  if(new Set(p).size!==p.length)return no('duplicate');if(!Number.isSafeInteger(e.seen)||e.seen>now+FED_SKEW)return no('too_new');
  if(self!=null&&p.includes(self))return {action:'drop',why:'loop'};if(now>=e.seen+FED_CARRY)return {action:'drop',why:'expired'};
  return {action:'store',forward:self==null||p.length>=16?null:p.concat([self])};}
const fedPathLess=(a,b)=>{if(a.length!==b.length)return a.length<b.length;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]<b[i];return false;};
/* Merging the registry with gossip (§10.8), clients and relays alike. registry: [{id, server:{rid, t, name, nodes,
   operators}}]; gossip: [{id, server, path, seen}]. Gives the servers sorted by id: {id, source, rid, name, nodes,
   operators, seen, path}. The registry wins on records; gossip only adds when it was last seen and by which path. */
function fedCatalogMerge(registry,gossip,now){const live=gossip.filter(g=>now<g.seen+FED_CARRY),out=new Map();
  const best=list=>list.reduce((a,g)=>!a||g.seen>a.seen||g.seen===a.seen&&fedPathLess(g.path,a.path)?g:a,null);
  const row=(id,source,s,b)=>({id,source,rid:s.rid,name:s.name,nodes:s.nodes,operators:s.operators,seen:b?b.seen:null,path:b?b.path:null});
  for(const r of registry)out.set(r.id,row(r.id,'registry',r.server,best(live.filter(g=>g.id===r.id))));
  for(const id of new Set(live.map(g=>g.id))){if(out.has(id))continue;const mine=live.filter(g=>g.id===id);
    const s=mine.reduce((a,g)=>!a||g.server.t>a.t||g.server.t===a.t&&g.server.rid<a.rid?g.server:a,null);
    out.set(id,row(id,'gossip',s,best(mine)));}
  return [...out.values()].sort((a,b)=>fedByStr(a.id,b.id));}

/* ---------- sessions: versions, sync policies, frames ---------- */
const fedVersOk=v=>Array.isArray(v)&&v.length>0&&v.every((x,i)=>Number.isSafeInteger(x)&&x>0&&(i===0||x>v[i-1]));
// The version two sides speak (§9.2): {ver} or {error}.
function fedVersion(a,b){if(!fedVersOk(a)||!fedVersOk(b))return {error:'bad_frame'};const c=a.filter(x=>b.includes(x));return c.length?{ver:c[c.length-1]}:{error:'unsupported'};}
// Whether two servers may sync (§10.9): a and b are {id, sync, list}; same: nodes of one server.
function fedSyncOk(a,b,same){if(same)return true;const ok=(x,y)=>x.sync==='open'?y.sync!=='standalone':x.sync==='selective'&&x.list.includes(y.id);return ok(a,b)&&ok(b,a);}
// Frames between client and node (§9.3): the fields each message must carry, by type ('id' is a request id).
const FED_FID=v=>Number.isSafeInteger(v)&&v>=1&&v<=2147483647;
const FED_MSG={
  hello:{vers:Array.isArray,role:v=>typeof v==='string'},welcome:{ver:Number.isSafeInteger,server:v=>!FdId(v),node:v=>!FdK(v),now:Number.isSafeInteger},
  challenge:{id:FED_FID,nonce:v=>!FdId(v)},state:{id:v=>v===undefined||FED_FID(v),rec:v=>v!==undefined},proof:{id:FED_FID,proof:v=>!!v&&typeof v==='object'},put:{id:FED_FID,rec:v=>v!==undefined},
  ack:{id:FED_FID,rid:v=>v===undefined||typeof v==='string'},cosign:{id:FED_FID,rid:v=>typeof v==='string',key:v=>typeof v==='string',sig:v=>typeof v==='string'},
  sub:{id:FED_FID,kinds:Array.isArray,since:v=>typeof v==='string'},unsub:{id:FED_FID},fetch:{id:FED_FID,ids:v=>Array.isArray(v)&&v.length<=256},
  rank:{id:FED_FID,board:v=>typeof v==='string',measure:v=>typeof v==='string',division:v=>typeof v==='string'},
  rankwhy:{id:FED_FID,board:v=>typeof v==='string',measure:v=>typeof v==='string',division:v=>typeof v==='string',key:v=>typeof v==='string'},
  ranks:{id:FED_FID,rows:Array.isArray},facets:{id:FED_FID},nets:{id:FED_FID,keys:v=>Array.isArray(v)&&v.length<=64},netstats:{id:FED_FID,nets:Array.isArray,reports:Array.isArray},
  servers:{id:FED_FID},recs:{items:v=>Array.isArray(v)&&v.length<=256},catalog:{entries:Array.isArray},
  err:{code:v=>typeof v==='string'},ping:{id:FED_FID},pong:{id:FED_FID},
  auth:{id:FED_FID,key:v=>typeof v==='string',t:Number.isSafeInteger,sig:v=>typeof v==='string'},excluded:{keys:Array.isArray},update:{version:v=>typeof v==='string'}};
const FED_FROM={client:['hello','auth','challenge','put','state','cosign','sub','unsub','fetch','rank','rankwhy','facets','nets','servers','err','ping','pong'],
  node:['welcome','proof','ack','recs','catalog','excluded','update','ranks','facets','netstats','err','ping','pong']};
/* Reads one text frame: who: the side that sent it ('client' or 'node'). Gives {f} (the frame) or {error}.
   For a node reading a client's frame, state ('new' or 'ready') and speaks (its versions) apply the handshake rules. */
function fedFrame(text,who,state,speaks){if(typeof text!=='string')return {error:'bad_frame'};if(fedSize(text)>FED_FRAME)return {error:'too_big'};
  let f;try{f=JSON.parse(text);}catch(e){return {error:'bad_json'};}
  if(!f||typeof f!=='object'||Array.isArray(f)||typeof f.m!=='string')return {error:'bad_frame'};
  // A message type this version does not know (a newer relay's) is skipped, never fatal (§9.2): an older game keeps
  // talking to a newer relay instead of reconnecting in a loop.
  if(!fedOwn(FED_MSG,f.m))return who==='node'?{skip:true}:{error:'bad_frame'};if(!FED_FROM[who].includes(f.m))return {error:'bad_frame'};
  if(state==='new'&&f.m!=='hello')return {error:'not_ready'};if(state==='ready'&&f.m==='hello')return {error:'bad_frame'};
  for(const [k,ok] of Object.entries(FED_MSG[f.m]))if(!ok(f[k]))return {error:'bad_frame'};
  if(f.m==='hello'){if(f.role!=='client'&&f.role!=='node')return {error:'bad_frame'};if(speaks){const v=fedVersion(f.vers,speaks);if(v.error)return v;}}
  return {f};}
/* What a relay says it runs (§9.3 welcome impl, §10.8 an entry's impl): shown in the looking glass and never trusted
   for anything else, so a malformed one is just left out. */
const FED_IMPL=/^[0-9A-Za-z][0-9A-Za-z.+_-]{0,39}$/;
const fedImpl=x=>!!x&&typeof x==='object'&&!Array.isArray(x)&&typeof x.name==='string'&&FED_IMPL.test(x.name)&&typeof x.version==='string'&&FED_IMPL.test(x.version)?{name:x.name,version:x.version}:null;
// An entry's impl list ([{node, name, version}], at most 16) as {node key: {name, version}}, for the server's own nodes only.
function fedImpls(list,nodes){const out={};if(!Array.isArray(list)||list.length>16)return out;const keys=new Set((nodes||[]).map(n=>n&&n.key));
  for(const x of list){const i=fedImpl(x);if(i&&typeof x.node==='string'&&keys.has(x.node))out[x.node]=i;}return out;}
/* An operator's update notice (§9.3 update): {version, security, notes, github} or null. The notes link is kept only
   when it is an https:// URL; the interface escapes it anyway. */
function fedUpdOf(f){if(!f||typeof f.version!=='string'||!FED_IMPL.test(f.version))return null;let notes=null;
  if(typeof f.notes==='string'&&f.notes.length<=512)try{const u=new URL(f.notes);if(u.protocol==='https:'&&u.hostname&&!u.username&&!u.password)notes=u.href;}catch(e){}
  return {version:f.version,security:f.security===true,notes,github:f.source==='github'};}
