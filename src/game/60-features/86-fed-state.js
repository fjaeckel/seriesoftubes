/* ================= FEDERATION: what the save holds =================
   S.fed (plan, "State and saves") is null in every save that never joined. Once made:
   {on (joined), key {pub, priv} (priv: the Ed25519 seed; stripped from every ordinary export), servers [node URL],
    ai null|{model, harness} (written only by src/agent/), out [signed records waiting to be sent], muted [keys],
    deals [self-contained deals with other players], share (let servers attach my country), joined (real day of joining),
    last (slot of the last stats sent)}.
   Joining is per save and only in normal games: never a sandbox or open gates, a puzzle, a scenario or the weekly. */
const FED_MAX_SERVERS=4,FED_OUT_MAX=64,FED_OUT_BYTES=131072,FED_MUTED_MAX=512,FED_DEALS_MAX=256,FED_CLIENT_KINDS=['announce','stats','offer','accept','decline','leave'];
// The mode a stats record declares (§5.2); only 'normal' is ranked, and only a normal game may join.
function fedMode(s){if(!s)return 'normal';if(s.mode==='puzzle'||s.pz)return s.ar?'architect':'puzzle';
  if(s.scn)return s.scn.id==='weekly'?'weekly':'scenario';if(s.mode==='sandbox')return 'sandbox';
  return s.rules&&s.rules.gates==='open'?'open_gates':'normal';}
const fedEligible=(s=S)=>!!s&&!s.lost&&fedMode(s)==='normal';
const fedKeyOk=k=>!!k&&typeof k==='object'&&!FdK(k.pub);
const fedHasPriv=f=>!!f&&fedKeyOk(f.key)&&!!fedBin(f.key.priv,32);
// Plain-text labels (§5 Label(64)): what an agent declared, or nothing.
const fedLabel=v=>typeof v==='string'&&!FdText(1,64)(v)?v:null;
function fedNewState(){return {on:false,key:null,servers:[],ai:null,out:[],muted:[],deals:[],share:true,joined:0,last:0};}
/* Checks and repairs S.fed of a save from storage or a file (called by sanitize()). Anything malformed is dropped,
   every list is capped, and a broken key turns multiplayer off without deleting the rest (deals, muted networks). */
function fedSanitize(s){const f=s.fed;if(!f||typeof f!=='object'||Array.isArray(f)){s.fed=null;if(FED.live)fedSoon();return;}
  const o=fedNewState(),int=(v,hi)=>Number.isSafeInteger(v)&&v>=0&&v<=hi?v:0;
  if(fedKeyOk(f.key)){o.key={pub:f.key.pub};if(fedBin(f.key.priv,32))o.key.priv=f.key.priv;}
  if(Array.isArray(f.servers))for(const u of f.servers)if(!FdUrl(u)&&!o.servers.includes(u)&&o.servers.length<FED_MAX_SERVERS)o.servers.push(u);
  if(f.ai&&typeof f.ai==='object'){const m=fedLabel(f.ai.model),h=fedLabel(f.ai.harness);if(m&&h)o.ai={model:m,harness:h};}
  if(Array.isArray(f.muted))for(const k of f.muted)if(!FdK(k)&&!o.muted.includes(k)&&o.muted.length<FED_MUTED_MAX)o.muted.push(k);
  if(Array.isArray(f.deals)){const ids=new Set();for(const d of f.deals){const x=fedDealClean(d);if(x&&!ids.has(x.id)){ids.add(x.id);o.deals.push(x);}}o.deals=fedDealsCap(o.deals);}
  o.share=f.share!==false;o.joined=int(f.joined,1e6);o.last=int(f.last,1e10);
  // Queued records are this network's own, signed: only kept with the key that signed them.
  if(o.key&&o.key.priv&&Array.isArray(f.out))o.out=fedOutClean(f.out,o.key.pub);
  o.on=f.on===true&&!!(o.key&&o.key.priv)&&o.servers.length>0&&fedEligible(s);
  s.fed=o;
  // A joined save starts its session once loaded; any other save loaded in this tab ends the one running.
  if(o.on||FED.live)fedSoon();}
// A queued record, checked as far as can be without its signature (that is checked by every node that takes it).
// The newest stats and the newest announce are kept apart from the cap (each replaces the one before, fedQueue).
const FED_OUT_ONE=['stats','announce'];
function fedOutClean(list,pub){let bytes=0;const out=[],one={};
  for(const r of list){if(!r||typeof r!=='object'||Array.isArray(r)||fedValues(r)||fedEnv(r,FED_REC)||!FED_CLIENT_KINDS.includes(r.kind)||r.key!==pub)continue;
    const n=fedSize(fedCanon(r));if(n>FED_KIND[r.kind][0]||FED_BODY[r.kind](r.body,{rec:r,asn:r.body.asn}))continue;
    if(FED_OUT_ONE.includes(r.kind)){if(!one[r.kind]||r.t>=one[r.kind].t)one[r.kind]=r;continue;}
    if(out.length>=FED_OUT_MAX||bytes+n>FED_OUT_BYTES)continue;bytes+=n;out.push(r);}
  for(const k of FED_OUT_ONE)if(one[k])out.push(one[k]);return out;}
/* A deal with another player, as the save keeps it: self-contained, so it works with no other data. The gameplay
   builds them: {id (the offer's id), deal, key, name, asn, start, end (null: no end), terms (as offered, checked like
   an offer's), role (who pays: peer for peering and swaps, else buy or sell), st (wait, run, over), on, rep, why, ai,
   renews (the id of the deal it renews, or null)}.
   Only those fields are kept; a deal whose terms, role or state do not check is dropped (compute() reads its terms). */
const FED_DEAL_ST=['wait','run','over'];
/* At most FED_DEALS_MAX deals: waiting and running ones always stay (they bill and route), ended ones only as room is
   left, the newest (last added) first. The order stays as it was. */
function fedDealsCap(L){if(L.length<=FED_DEALS_MAX)return L;const keep=new Set();let room=FED_DEALS_MAX;
  for(const d of L)if(d.st!=='over'&&room>0){keep.add(d);room--;}
  for(let i=L.length-1;i>=0&&room>0;i--)if(L[i].st==='over'){keep.add(L[i]);room--;}
  return L.filter(d=>keep.has(d));}
// Adds a deal to the save, letting the oldest ended ones go past the cap.
function fedDealAdd(f,d){f.deals.push(d);f.deals=fedDealsCap(f.deals);return d;}
function fedDealClean(d){if(!d||typeof d!=='object'||Array.isArray(d)||FdId(d.id)||!FED_DEALS.includes(d.deal)||FdK(d.key))return null;
  const T=d.terms;if(!T||typeof T!=='object'||Array.isArray(T)||fedValues(T)||fedSize(fedCanon(T))>8192||FED_TERMS[d.deal](T))return null;
  const t=v=>Number.isSafeInteger(v)&&v>=0&&v<=1e11?v:null,start=t(d.start),end=t(d.end),peer=d.deal==='peering'||d.deal==='swap';
  // A deal without role or state (the first saves) gets them as the gameplay makes them; a wrong one drops the deal.
  const role=d.role===undefined&&peer?'peer':d.role,st=d.st===undefined?start===null?'wait':'run':d.st;
  if(peer?role!=='peer':role!=='buy'&&role!=='sell')return null;if(!FED_DEAL_ST.includes(st)||st==='run'&&start===null)return null;
  return {id:d.id,deal:d.deal,key:d.key,name:typeof d.name==='string'&&!FdName(d.name.slice(0,40))?fedSafeName(d.name.slice(0,40)):'AS?',
    asn:Number.isSafeInteger(d.asn)&&d.asn>=0&&d.asn<=4294967295?d.asn:0,start,end,terms:JSON.parse(fedCanon(T)),role,st,
    on:d.on===true&&st==='run',rep:Number.isSafeInteger(d.rep)&&d.rep>=0&&d.rep<=2e9?d.rep:0,why:typeof d.why==='string'?d.why.slice(0,16):'',ai:d.ai===true,renews:FdId(d.renews)?null:d.renews};}

/* ---------- shared saves and bug reports never carry a way to act as the network ---------- */
// The save with its private key, its queued records and any operator key taken out (a copy; s is untouched).
function fedPublic(s){if(!s||!s.fed||typeof s.fed!=='object')return s;const f={...s.fed,out:[]};
  if(f.key&&typeof f.key==='object')f.key={pub:f.key.pub};delete f.op;return {...s,fed:f};}
// Save text stripped the same way; only parsed when it has a fed object at all, so other saves cost nothing.
function fedPublicText(t){if(typeof t!=='string'||t.indexOf('"fed":{')<0)return t;try{return JSON.stringify(fedPublic(JSON.parse(t)));}catch(e){return t;}}
// An imported save that is not a move file: detached from its network (joining makes a new identity).
function fedDetach(s){if(s&&s.fed&&typeof s.fed==='object'){const p=fedPublic(s).fed;p.on=false;s.fed=p;}return s;}
const fedMoveName=nm=>saveFileName(nm).replace(/\.json$/,'-move-PRIVATE.json');
// "Move to another device": the one export that keeps the key (and the queue), behind the UI's warning.
function fedExportMove(){if(!S||pzOn()||!S.fed)return false;save(true);
  saveDl(JSON.stringify({app:'series-of-tubes',version:APP_VERSION,exported:new Date().toISOString(),move:true,S:packSave(S)},null,1),S.name,fedMoveName(S.name));
  return true;}

/* ---------- this network's records ---------- */
const fedNow=()=>FED.now();
/* Signs a record of this save's network: needs the key (S.fed.key.priv). body is in clear; an offer to someone and a
   decline go out sealed for the other network (§5.3, fedSealMine), which throws when its box is not known here. */
async function fedSignMine(kind,body,f=S&&S.fed){if(!fedHasPriv(f))throw new Error('no key');return fedSealMine(kind,body,f);}
/* Queues a signed record of this network to be sent to every joined server. Gives false when the queue is full (only
   offers and answers are refused then; an older stats or announce is simply replaced by the newer one, outside the cap,
   so a full queue never loses this network's terms). */
function fedQueue(r,f=S&&S.fed){if(!f||!r)return false;
  if(FED_OUT_ONE.includes(r.kind)){for(const x of f.out)if(x.kind===r.kind){const id=FED.ids.get(x);if(id)FED.sent.delete(id);}f.out=f.out.filter(x=>x.kind!==r.kind);}
  else{const n=fedSize(fedCanon(r)),others=f.out.filter(x=>!FED_OUT_ONE.includes(x.kind));
    if(others.length>=FED_OUT_MAX||others.reduce((a,x)=>a+fedSize(fedCanon(x)),0)+n>FED_OUT_BYTES)return false;}
  f.out.push(r);fedFlushSoon();return true;}
// What the boards rank about this game now (§5.2). The gameplay may replace parts through FED.hooks.stats(body).
function fedStatsBody(s=S){const pops={};for(const c of Object.keys(s.pops)){const p=s.pops[c];if(p&&!(p.down>s.day))pops[c]=1;}
  const b={mode:fedMode(s),pops,traffic:[],tier1:(()=>{try{return tierLabel()==='Tier 1';}catch(e){return false;}})(),shareCountry:s.fed.share!==false};
  if(s.pie)try{b.pies=Math.max(0,Math.min(1e7,Math.round(pieLiveAll())));}catch(e){}
  if(s.fed.ai)b.ai={model:s.fed.ai.model,harness:s.fed.ai.harness};
  return FED.hooks.stats?FED.hooks.stats(b)||b:b;}

/* ---------- joining and leaving ---------- */
// Why this save cannot join now, or null: 'mode' (not a normal game), 'crypto' (no WebCrypto Ed25519), 'url', 'full'.
async function fedJoinWhy(url){if(!fedEligible())return 'mode';if(FdUrl(url))return 'url';
  if(S.fed&&!S.fed.servers.includes(url)&&S.fed.servers.length>=FED_MAX_SERVERS)return 'full';
  return await fedCan()?null:'crypto';}
/* Joins this save to a server (a node URL). The first join makes the key pair; a save without its private key (an
   imported one) gets a new identity. Gives null or why not (fedJoinWhy). */
async function fedJoin(url){const why=await fedJoinWhy(url);if(why)return why;const s=S;
  if(!s.fed)s.fed=fedNewState();const f=s.fed;
  if(!fedHasPriv(f)){const k=await fedNewKey();if(S!==s)return 'mode';f.key=k;f.out=[];f.deals=[];f.joined=0;}
  if(!f.servers.includes(url))f.servers.push(url);f.on=true;if(!f.joined)f.joined=fedDiv(fedNow(),FED_DAY);
  fedSaved();fedWake();return null;}
// Leaves one server (or all with no url). Multiplayer is off once no server is left; the identity stays in the save.
function fedLeave(url){const f=S&&S.fed;if(!f)return;const pub=f.key?f.key.pub:'';
  // The excluded lists of servers left go (a rejoin starts from what the server says then).
  for(const u of f.servers)if(pub&&(!url||u===url))fedDel('kv',fedExclKey(u,pub)).catch(()=>{});
  f.servers=url?f.servers.filter(u=>u!==url):[];if(!f.servers.length)f.on=false;fedSaved();fedWake();}
// Leaves the federation for good (§5.9): a signed leave goes out, then multiplayer turns off and the identity is dropped.
async function fedQuit(){const f=S&&S.fed;if(!fedHasPriv(f))return false;
  const r=await fedSignMine('leave',{},f);await fedSendNow([r],f);for(const u of f.servers)fedDel('kv',fedExclKey(u,f.key.pub)).catch(()=>{});f.on=false;f.out=[];f.key=null;f.servers=[];fedSaved();fedWake();return true;}
function fedMute(key,on){const f=S&&S.fed;if(!f||FdK(key))return;f.muted=f.muted.filter(k=>k!==key);if(on&&f.muted.length<FED_MUTED_MAX)f.muted.push(key);fedSaved();fedEmit('mute',{key,on:!!on});}
function fedShare(on){const f=S&&S.fed;if(!f)return;f.share=!!on;fedSaved();}
function fedSaved(){try{if(S)save(true);}catch(e){}}
