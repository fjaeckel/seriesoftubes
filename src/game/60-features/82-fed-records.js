/* ================= FEDERATION: checking records =================
   Everything received is untrusted (§7): size, JSON, values, envelope, body, signatures, time, in that order; the first
   failing step gives the error code. Checkers return an error code or null. */
const FdBF='bad_field',FdMF='missing_field';
const fedBidi=s=>/[‪-‮⁦-⁩]/.test(s),fedLen=s=>{let n=0;for(const _ of s)n++;return n;};
const FdK=v=>fedBin(v,32)?null:'bad_key',FdSig=v=>fedBin(v,64)?null:'bad_sig',FdId=v=>fedBin(v,32)?null:FdBF;
const FdText=(lo,hi)=>v=>{if(typeof v!=='string'||fedBidi(v))return FdBF;const n=fedLen(v);return n>=lo&&n<=hi?null:FdBF;};
const FdName=v=>FdText(1,40)(v)||(/[^ ]/.test(v)?null:FdBF);
/* A player-typed name as the game keeps it (NET, deals, consortiums): markup characters swapped for look-alikes, so a
   name is plain text in every place the game shows network names, escaped there or not. Sinks escape as well. */
const FED_SAFE={'<':'‹','>':'›','&':'＆','"':'”',"'":'’','`':'‘'};
const fedSafeName=v=>String(v).replace(/[<>&"'`]/g,c=>FED_SAFE[c]);
const FdCity=v=>typeof v==='string'&&/^[a-z0-9]{2,8}$/.test(v)?null:FdBF,FdCC=v=>typeof v==='string'&&/^[A-Z]{2}$/.test(v)?null:FdBF;
const FdInt=(lo,hi)=>v=>Number.isSafeInteger(v)&&v>=lo&&v<=hi?null:FdBF;
const FdMbps=FdInt(0,1e9),FdMoney=FdInt(0,1e12),FdDays=FdInt(1,3650),FdBool=v=>typeof v==='boolean'?null:FdBF,FdOne=(...a)=>v=>a.includes(v)?null:FdBF;
// A node URL (§5): wss, a lower-case host name with a dot, or a local address (a LAN server), an optional port, a plain path.
function FdUrl(v){if(typeof v!=='string'||v.length>200)return FdBF;const m=/^wss:\/\/([a-z0-9.-]+|\[[0-9a-f:]+\])(?::([1-9][0-9]{0,4}))?(\/[A-Za-z0-9._~\/-]*)?$/.exec(v);
  if(!m||m[2]&&+m[2]>65535)return FdBF;const h=m[1];
  if(h[0]==='[')return fedLocal6(h.slice(1,-1))?null:FdBF;if(/^[0-9.]+$/.test(h))return fedLocal4(h)?null:FdBF;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(h)?null:FdBF;}
// Private or link-local IPv4 and loopback, in plain dotted decimal.
function fedLocal4(h){const p=h.split('.');if(p.length!==4||!p.every(x=>/^(0|[1-9][0-9]{0,2})$/.test(x)&&+x<=255))return false;
  const [a,b]=p.map(Number);return a===10||a===127||a===172&&b>=16&&b<=31||a===192&&b===168||a===169&&b===254;}
// IPv6 unique local (fc00::/7) or ::1, written as RFC 5952 has it (one spelling per address).
function fedLocal6(h){const hv=h.split('::');if(hv.length>2)return false;const pt=s=>s===''?[]:s.split(':');
  const hd=pt(hv[0]),tl=hv.length===2?pt(hv[1]):[];if(![...hd,...tl].every(g=>/^[0-9a-f]{1,4}$/.test(g)))return false;
  const fill=8-hd.length-tl.length;if(hv.length===2?fill<1:fill!==0)return false;
  const g=[...hd,...Array(hv.length===2?fill:0).fill('0'),...tl].map(x=>parseInt(x,16));let at=-1,len=0;
  for(let i=0;i<8;i++){let j=i;while(j<8&&g[j]===0)j++;if(j-i>len&&j-i>=2){at=i;len=j-i;}if(j>i)i=j-1;}
  const x=g.map(n=>n.toString(16)),t=at<0?x.join(':'):x.slice(0,at).join(':')+'::'+x.slice(at+len).join(':');
  return t===h&&((g[0]&0xfe00)===0xfc00||h==='::1');}
// What the registry lists (§11.2 step 6): a host name the internet can look up, not an address or a .local name.
const fedPublicUrl=u=>!FdUrl(u)&&!/^wss:\/\/(\[|[0-9.]+(?:[:\/]|$))/.test(u)&&!/^wss:\/\/[^\/:]+\.local(?:[:\/]|$)/.test(u);
/* A list: o.max (too_many over it), o.min, o.set (entries unique: duplicate), o.asc (strictly ascending: bad_field),
   o.by (what an entry is compared by). */
const FdList=(T,o)=>(v,c)=>{if(!Array.isArray(v))return FdBF;if(v.length>o.max)return 'too_many';if(v.length<(o.min||0))return FdBF;
  for(const x of v){const e=T(x,c);if(e)return e;}
  if(o.set||o.asc){const by=o.by||(x=>x),seen=new Set();let prev;
    for(const x of v){const k=by(x);if(o.set&&seen.has(k))return 'duplicate';seen.add(k);if(o.asc&&prev!==undefined&&!(k>prev))return FdBF;prev=k;}}
  return null;};
const FdKeys=(max,o={})=>FdList(FdK,{max,set:1,...o});
/* An object with exactly these fields (unknown_field otherwise). Fields are [name, checker, optional]; checkers get
   (value, context) and the object's own other fields through context.o. */
const FdObj=(fields,post)=>(v,c={})=>{if(!v||typeof v!=='object'||Array.isArray(v))return FdBF;
  for(const k of Object.keys(v))if(!fields.some(f=>f[0]===k))return 'unknown_field';
  const cc={...c,o:v};for(const [k,T,opt] of fields){if(!fedOwn(v,k)){if(!opt)return FdMF;continue;}const e=T(v[k],cc);if(e)return e;}
  return post?post(v,c):null;};
const FdPorts=FdList(FdObj([['mbps',FdMbps],['monthly',FdMoney]]),{max:8,min:1,asc:1,by:x=>x.mbps});
const FdAt=FdList(FdCity,{max:16,min:1,set:1});
const FED_DEALS=['peering','transit','pni','swap','consortium','port','wave'],FED_AUTO=FdOne('auto','review','decline');
const FdLeg=FdObj([['a',FdCity],['b',FdCity],['mbps',FdMbps]]);
// A wave route is written once, its cities in byte order (a < b), so a route has one spelling.
const FdAB=v=>v.a<v.b?null:FdBF,FdRoute=FdObj([['a',FdCity],['b',FdCity]],FdAB),FdWaveG=FdOne(100,400,800,1600);
const FdWave=FdObj([['routes',FdList(FdRoute,{max:32,min:1,set:1,by:x=>x.a+'|'+x.b})],['sizes',FdList(FdObj([['gbps',FdWaveG],['monthly',FdMoney]]),{max:4,min:1,asc:1,by:x=>x.gbps})],['term',FdDays]]);
// founded (optional on priced deals): the buyer claims the newcomer price (§10.10).
const FdFounded=['founded',FdInt(0,1e7),1],FED_CUST_MAX=128,FED_UP_MAX=16;
const FED_TERMS={
  peering:FdObj([['at',FdAt],['via',FdOne('ix','pni')]]),
  transit:FdObj([['mbps',FdMbps],['perGbps',FdMoney],['term',FdDays],['at',FdAt],FdFounded]),
  pni:FdObj([['at',FdCity],['mbps',FdMbps],['setup',FdMoney],['monthly',FdMoney],['term',FdDays],FdFounded]),
  port:FdObj([['at',FdCity],['mbps',FdMbps],['monthly',FdMoney],['term',FdDays],FdFounded]),
  swap:FdObj([['give',FdLeg],['take',FdLeg],['term',FdDays]]),
  wave:FdObj([['a',FdCity],['b',FdCity],['gbps',FdWaveG],['monthly',FdMoney],['term',FdDays],FdFounded],FdAB),
  consortium:FdObj([['name',FdName],['a',FdCity],['b',FdCity],['members',FdInt(2,16)],['share',FdMoney],['pairs',FdInt(1,16)]])};
const FdNode=FdObj([['key',FdK],['url',FdUrl]]);
// A box (§5.3): a 12-byte nonce and a ciphertext with its 16-byte tag, base64url. Only the deal's two parties open it.
const FdBytes=(lo,hi)=>v=>{if(typeof v!=='string'||v.length>Math.ceil(hi*4/3))return FdBF;const u=fedUnb64(v);return u&&u.length>=lo&&u.length<=hi?null:FdBF;};
const FdEnc=FdObj([['n',FdBytes(12,12)],['c',FdBytes(17,2048)]]);
// An offer in clear (§5.3): an open consortium project as it travels, or a sealed offer once opened (with its to).
const FED_OFFER=FdObj([['to',(v,c)=>FdK(v)||(v===c.rec.key?FdBF:null),1],['deal',FdOne(...FED_DEALS)],
  ['basis',(v,c)=>c.o.deal==='consortium'?FdBF:FdId(v),1],['renews',FdId,1],['terms',(v,c)=>FED_TERMS[c.o.deal](v)]],
  b=>!fedOwn(b,'to')&&b.deal!=='consortium'||!fedOwn(b,'basis')&&['peering','transit','pni','port','wave'].includes(b.deal)?FdMF:null);
// What a sealed decline holds once opened.
const FED_REASON=FdObj([['reason',FdOne('declined','conditions','depeer','excluded','quiet')]]);
// Bodies by kind (§5). c: {rec (the envelope), asn (the key's ASN, for announce)}.
const FED_BODY={
  announce:FdObj([['name',FdName],['asn',(v,c)=>v===c.asn?null:FdBF],['box',FdK],['home',FdCC],['day',FdInt(0,1e7)],
    ['founded',(v,c)=>FdInt(0,fedDiv(c.rec.t,FED_DAY))(v)],['pops',FdList(FdCity,{max:512,set:1})],
    ['ix',(v,c)=>FdList(FdCity,{max:512,set:1})(v)||(Array.isArray(c.o.pops)&&v.every(x=>c.o.pops.includes(x))?null:FdBF)],
    ['cust',FdInt(0,1e7)],['mix',FdObj([['content',FdInt(0,1000)],['eyeball',FdInt(0,1000)],['enterprise',FdInt(0,1000)]],m=>m.content+m.eyeball+m.enterprise===1000?null:FdBF)],
    ['traffic',FdObj([['in',FdMbps],['out',FdMbps]])],['policy',FdOne('open','selective','restrictive')],
    ['cond',(v,c)=>c.o.policy!=='selective'?FdBF:FdObj([['minMbps',FdMbps],['maxRatio',FdInt(100,100000)],['minShared',FdInt(0,64)],['rpki',FdBool],['tier1',FdBool],['ai',FdBool]])(v),1],
    ['rates',FdObj([['transit',FdObj([['perGbps',FdMoney],['commit',FdList(FdObj([['mbps',FdMbps],['off',FdInt(0,900)]]),{max:8,asc:1,by:x=>x.mbps})],['term',FdDays]]),1],
      ['pni',FdObj([['setup',FdMoney],['ports',FdPorts],['term',FdDays]]),1],['ix',FdObj([['ports',FdPorts],['join',FdOne('anyone','selective','approval')],['at',FdAt]]),1],['wave',FdWave,1]])],
    // auto.wave is optional (announces from before wave deals); absent, wave requests are declined.
    ['auto',FdObj(FED_DEALS.map(d=>[d,FED_AUTO,d==='wave'?1:0]))]],b=>b.policy==='selective'&&!fedOwn(b,'cond')?FdMF:null),
  stats:FdObj([['mode',FdOne('normal','sandbox','open_gates','puzzle','scenario','weekly','architect')],
    ['pops',v=>{if(!v||typeof v!=='object'||Array.isArray(v))return FdBF;const ks=Object.keys(v);if(ks.length>512)return 'too_many';
      for(const k of ks){if(FdCity(k)||FdInt(1,1000)(v[k]))return FdBF;}return null;}],
    ['pies',FdInt(0,1e7),1],
    ['traffic',(v,c)=>FdList(FdObj([['key',FdK],['in',FdMbps],['out',FdMbps]]),{max:256,set:1,by:x=>x.key})(v)||(v.some(x=>x.key===c.rec.key)?FdBF:null)],['total',FdMbps,1],
    // Transit customers and upstreams (other player networks, never the author): the cone board (§5.2).
    ['cust',(v,c)=>FdKeys(FED_CUST_MAX)(v)||(v.includes(c.rec.key)?FdBF:null),1],['up',(v,c)=>FdKeys(FED_UP_MAX)(v)||(v.includes(c.rec.key)?FdBF:null),1],
    ['tier1',FdBool],['tier2',FdBool,1],['ai',FdObj([['model',FdText(1,64)],['harness',FdText(1,64)]]),1],['shareCountry',FdBool]]),
  // An offer to someone is sealed: to and the box in clear, nothing else (§5.3). Without to: an open consortium project.
  offer:(v,c)=>v&&typeof v==='object'&&fedOwn(v,'to')?FdObj([['to',(x,cc)=>FdK(x)||(x===cc.rec.key?FdBF:null)],['enc',FdEnc]])(v,c):FED_OFFER(v,c),
  accept:FdObj([['offer',FdId],['to',FdK]]),
  decline:FdObj([['offer',FdId],['to',FdK],['enc',FdEnc]]),
  genesis:FdObj([['name',FdName],['node',FdNode]]),
  operators:FdObj([['server',FdId],['prev',FdId],['action',FdOne('add_operator','remove_operator','set_node','remove_node')],['target',FdK],
    ['url',(v,c)=>c.o.action==='set_node'?FdUrl(v):FdBF,1]],b=>b.action==='set_node'&&!fedOwn(b,'url')?FdMF:null),
  server:FdObj([['server',FdId],['head',FdId],['name',FdName],['nodes',FdList(FdNode,{max:16,min:1,set:1,asc:1,by:x=>x.key})],
    ['operators',FdKeys(16,{min:1,asc:1})],['sync',FdOne('standalone','selective','open')],['noLogs',FdBool],
    ['langs',FdList(v=>typeof v==='string'&&/^[a-z]{2}$/.test(v)?null:FdBF,{max:8,set:1})],['desc',FdText(0,280)]]),
  hide:FdObj([['server',FdId],['hide',FdKeys(512)],['names',FdKeys(512)],['refuse',FdKeys(512)]],b=>b.hide.length+b.names.length+b.refuse.length>512?'too_many':null),
  shun:FdObj([['server',FdId],['target',FdK],['reason',FdOne('cheating','offensive_name','spam','abuse')]]),
  unshun:FdObj([['server',FdId],['target',FdK]]),
  leave:FdObj([]),
  // A player's report to its server's operators (§5.10): a pre-made reason, never about itself.
  report:FdObj([['server',FdId],['target',(v,c)=>FdK(v)||(v===c.rec.key?FdBF:null)],['reason',FdOne('cheating','offensive_name','spam','abuse')]])};
// A live state holds the fields of a stats record (§5.11).
FED_BODY.state=FED_BODY.stats;
// The kinds a record may have (§5); a live state is checked only where one is expected (FED_STATE).
const FED_REC=Object.fromEntries(Object.keys(FED_KIND).filter(k=>k!=='state').map(k=>[k,1])),FED_STATE={state:1};

// The envelope (§4, §7.1 step 4). kinds: the kinds allowed here.
function fedEnv(v,kinds){if(!v||typeof v!=='object'||Array.isArray(v))return FdBF;
  if(!fedOwn(v,'v'))return FdMF;if(v.v!==1)return 'bad_version';
  if(!fedOwn(v,'kind'))return FdMF;if(typeof v.kind!=='string'||!fedOwn(kinds,v.kind))return 'bad_kind';
  const multi=!!(FED_KIND[v.kind]&&FED_KIND[v.kind][2]),need=['v','kind','key','t','body',multi?'sigs':'sig'];
  for(const k of need)if(!fedOwn(v,k))return FdMF;
  for(const k of Object.keys(v))if(!need.includes(k))return 'unknown_field';
  if(FdK(v.key))return 'bad_key';if(!Number.isSafeInteger(v.t))return FdBF;
  if(!v.body||typeof v.body!=='object'||Array.isArray(v.body))return FdBF;
  if(!multi)return FdSig(v.sig);
  const g=v.sigs;if(!Array.isArray(g)||!g.length)return FdBF;if(g.length>16)return 'too_many';
  for(const x of g){if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).length!==2||!fedOwn(x,'key')||!fedOwn(x,'sig'))return FdBF;
    const e=FdK(x.key)||FdSig(x.sig);if(e)return e;}
  for(let i=1;i<g.length;i++){if(g[i].key===g[i-1].key)return 'duplicate';if(g[i].key<g[i-1].key)return FdBF;}
  return null;}
// Signatures (§7.1 step 7): every one must verify, and a multi-signer record's author must be among them.
async function fedSigsOk(v){const text=fedUtf8(fedCanon(fedUnsigned(v)));
  if(!v.sigs)return await fedVerify(v.key,v.sig,text)?null:'bad_sig';
  for(const x of v.sigs)if(!await fedVerify(x.key,x.sig,text))return 'bad_sig';
  return v.sigs.some(x=>x.key===v.key)?null:FdBF;}
function fedTimeOk(t,now,age){if(t<FED_EPOCH)return 'too_old';if(t>now+FED_SKEW)return 'too_new';return age&&now-t>age?'too_old':null;}
const fedNo=error=>({ok:false,error});
/* Checks one record (§7.1 steps 1 to 8): x is JSON text (a frame's worth) or an already parsed value.
   Gives {ok:true, kind, id, rec} or {ok:false, error}. o.kinds narrows the kinds allowed (a registry file's genesis). */
async function fedCheck(x,now,o={}){let v=x;
  if(typeof x==='string'){if(fedSize(x)>(o.frame||FED_FRAME))return fedNo('too_big');const p=fedParse(x);if(p.e)return fedNo(p.e);v=p.v;}
  else{const e=fedValues(v);if(e)return fedNo(e);}
  let e=fedEnv(v,o.kinds||FED_REC);if(e)return fedNo(e);
  const K=FED_KIND[v.kind];if(fedSize(fedCanon(v))>K[0])return fedNo('too_big');
  e=FED_BODY[v.kind](v.body,{rec:v,asn:v.kind==='announce'&&Number.isSafeInteger(v.body.asn)?await fedAsn(v.key):-1});if(e)return fedNo(e);
  e=await fedSigsOk(v);if(e)return fedNo(e);
  e=fedTimeOk(v.t,now,K[1]);if(e)return fedNo(e);
  return {ok:true,kind:v.kind,id:await fedId(v),rec:v};}

/* ---------- receipts and proofs (§6) ---------- */
const FED_RCPT=FdObj([['rec',FdId],['server',FdId],['cc',FdCC,1]]);
/* A node's receipt for a record (already checked, with its id) received by `server`, whose node keys are `nodes`.
   Gives null when valid, else the error code. */
async function fedRcptErr(rc,rec,rid,server,nodes,now){let e=fedValues(rc)||fedEnv(rc,{receipt:1});if(e)return e;
  if(fedSize(fedCanon(rc))>1024)return 'too_big';
  if((e=FED_RCPT(rc.body)))return e;
  if(rc.t%FED_SLOT||rc.body.rec!==rid||rc.body.server!==server)return FdBF;
  if(fedOwn(rc.body,'cc')&&!(rec.kind==='stats'&&rec.body.shareCountry===true))return FdBF;
  if(!nodes.includes(rc.key))return 'not_node';
  if(await fedSigsOk(rc))return 'bad_sig';
  return fedTimeOk(rc.t,now,0);}
// A node's proof that it holds its node key (§6.2), answering our nonce.
async function fedProofErr(p,nonce,server,node,now){const B='bad_challenge';
  if(!p||typeof p!=='object'||p.kind!=='proof'||p.key!==node||!p.body||p.body.server!==server)return B;
  if(fedValues(p)||fedEnv(p,{proof:1})||FdObj([['nonce',FdId],['server',FdId]])(p.body)||fedSize(fedCanon(p))>1024)return B;
  if(await fedSigsOk(p))return 'bad_sig';
  return p.body.nonce!==nonce||Math.abs(p.t-now)>300?B:null;}
/* A client proving a key to one node of one server (§9.3 auth): the signed text has m:'auth' and no kind, so it is
   never a record, and it names the node and server, so it is good for no other. */
const fedAuthText=(key,node,server,t)=>fedCanon({m:'auth',key,node,server,t});
async function fedAuthMake(seed,node,server,t){const k=await fedSigner(seed);return {m:'auth',key:k.pub,t,sig:await fedSignText(seed,fedAuthText(k.pub,node,server,t))};}
// How a node answers an auth frame: null (taken) or the error code, in the spec's order.
async function fedAuthErr(a,node,server,now){if(FdK(a.key))return 'bad_key';if(FdSig(a.sig)||!Number.isSafeInteger(a.t))return 'bad_sig';
  if(!await fedVerify(a.key,a.sig,fedUtf8(fedAuthText(a.key,node,server,a.t))))return 'bad_sig';
  return a.t>now+FED_SKEW?'too_new':a.t<now-FED_SKEW?'too_old':null;}
