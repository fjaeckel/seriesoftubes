/* ---------- the authority: seriesoftub.es's bans and the oldest relay allowed (§11.5, ADR 0006) ----------
   federation/authority.json, signed by a key pinned here (federation/authority-keys.json; a test checks they match).
   It is no record: checked only as that file, never stored or sent as one. */
const FED_AUTH_KEYS=["o33GTaxLRt9klJJZrctakB4SUHtiipWdLijGmjsHQV8"];
const FED_AUTH_MAX=524288,FED_AUTH_NAME='tubes-relay',FED_BAN_REASONS=['cheating','offensive_name','spam','abuse','legal'];
FED_KIND.authority=[FED_AUTH_MAX,0];
const FdBanWhy=FdOne(...FED_BAN_REASONS);
FED_BODY.authority=FdObj([['relayMin',v=>typeof v==='string'&&v.length<=40&&/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(v)?null:FdBF,1],
  ['relayMinFrom',FdInt(FED_EPOCH,Number.MAX_SAFE_INTEGER),1],
  ['nets',FdList(FdObj([['key',FdK],['reason',FdBanWhy]]),{max:4096,set:1,asc:1,by:x=>x.key})],
  ['servers',FdList(FdObj([['id',FdId],['reason',FdBanWhy]]),{max:1024,set:1,asc:1,by:x=>x.id})]],
  b=>fedOwn(b,'relayMin')&&!fedOwn(b,'relayMinFrom')?FdMF:!fedOwn(b,'relayMin')&&fedOwn(b,'relayMinFrom')?FdBF:null);
/* Checks the file's text against the pinned keys (keys: for the vectors) at now: {ok:true, a} with a = {t, relayMin,
   from, nets (Map key -> reason), servers (Map id -> reason)}, or {ok:false, error}. not_authority comes before the
   signature. */
async function fedAuthCheck(text,now,keys=FED_AUTH_KEYS){if(typeof text!=='string'||fedSize(text)>FED_AUTH_MAX)return fedNo('too_big');
  const p=fedParse(text);if(p.e)return fedNo(p.e);const v=p.v;
  let e=fedEnv(v,{authority:1});if(e)return fedNo(e);if(fedSize(fedCanon(v))>FED_AUTH_MAX)return fedNo('too_big');
  e=FED_BODY.authority(v.body,{rec:v});if(e)return fedNo(e);
  if(!keys.includes(v.key))return fedNo('not_authority');
  e=await fedSigsOk(v);if(e)return fedNo(e);e=fedTimeOk(v.t,now,0);if(e)return fedNo(e);
  const b=v.body;return {ok:true,a:{t:v.t,relayMin:b.relayMin||null,from:fedOwn(b,'relayMinFrom')?b.relayMinFrom:null,
    nets:new Map(b.nets.map(x=>[x.key,x.reason])),servers:new Map(b.servers.map(x=>[x.id,x.reason])),text}};}
// Semantic versions (semver.org 2.0, build metadata dropped): [major, minor, patch, pre-release parts] or null.
function fedSemver(s){if(typeof s!=='string'||s.length>40)return null;
  const m=/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(s);
  return m?[BigInt(m[1]),BigInt(m[2]),BigInt(m[3]),m[4]?m[4].split('.'):[]]:null;}
// -1, 0 or 1 by semver precedence: a pre-release sorts before its release.
function fedSemverCmp(a,b){for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]<b[i]?-1:1;
  const p=a[3],q=b[3];if(!p.length||!q.length)return p.length===q.length?0:p.length?-1:1;
  for(let i=0;i<p.length&&i<q.length;i++){const x=p[i],y=q[i],nx=/^[0-9]+$/.test(x),ny=/^[0-9]+$/.test(y);
    if(x===y)continue;if(nx&&ny)return BigInt(x)<BigInt(y)?-1:1;if(nx!==ny)return nx?-1:1;return x<y?-1:1;}
  return p.length===q.length?0:p.length<q.length?-1:1;}
/* Out of date at now (§11.5): relayMin set and due, and the node's impl absent, another implementation, or a version
   that is not semver or is lower. a: {relayMin, from}. */
function fedOutdated(a,impl,now){if(!a||!a.relayMin||!(now>=a.from))return false;
  if(!impl||impl.name!==FED_AUTH_NAME)return true;const v=fedSemver(impl.version);return !v||fedSemverCmp(v,fedSemver(a.relayMin))<0;}

/* The file this game holds: the newest it verified (greatest t), kept in the store so a ban outlasts the site being
   unreachable. Fetched while multiplayer is on: when it starts and at most once an hour after that. */
async function fedAuthority(){if(FED.auth!==undefined)return FED.auth;const o=await fedGet('kv','authority');let a=null;
  if(o&&typeof o.text==='string'){const r=await fedAuthCheck(o.text,fedNow());if(r.ok)a=r.a;}
  return FED.auth=a;}
async function fedAuthLoad(){const now=fedNow();if(FED.authAt&&now-FED.authAt<3600)return false;FED.authAt=now;let txt=null;
  try{const ac=typeof AbortController==='function'?new AbortController():null,t=FED.set(()=>ac&&ac.abort(),FED.T.fetch);
    const r=await FED.fetch(FED.authUrl,ac?{signal:ac.signal,cache:'no-cache'}:{});FED.clear(t);if(r&&r.ok)txt=await r.text();}catch(e){}
  if(txt==null)return false;const r=await fedAuthCheck(txt,fedNow());if(!r.ok)return false;
  const held=await fedAuthority();if(held&&r.a.t<=held.t)return false;
  await fedPut('kv','authority',{text:txt,t:r.a.t});FED.auth=r.a;FED.xgen++;fedEmit('authority',{t:r.a.t});fedEmit('excluded',{server:'',n:r.a.nets.size});fedAuthEnforce();return true;}
// A server or network the authority bans, and why ('' when it does not).
const fedAuthBansSrv=(a,id)=>a&&a.servers.get(id)||'',fedAuthBansNet=(a,key)=>a&&a.nets.get(key)||'';
/* Whether a node may be joined, after its welcome: '' or the code to close with (banned, outdated). A node dialled at a
   local address (a LAN or development relay) is never out of date. */
function fedAuthRefuse(a,c){if(fedAuthBansSrv(a,c.srv))return 'banned';
  if(!fedPublicUrl(c.url))return '';return fedOutdated(a,c.impl,fedNow())?'outdated':'';}
// A newer file came in: connections it refuses now close (and wait an hour before trying again).
function fedAuthEnforce(){const a=FED.auth,M=FED.live;if(!a||!M)return;
  for(const c of M.conns.values()){if(!c.srv||!fedLive(c))continue;const why=fedAuthRefuse(a,c);if(why){fedDrop(c,why,3600);const st=FED.st[c.url];if(st)st.cut=why;}}}
// The servers a player may pick: the catalog without those the authority bans.
async function fedServersAllowed(){const [l,a]=await Promise.all([fedServers(),fedAuthority()]);return l.filter(s=>!fedAuthBansSrv(a,s.id));}
