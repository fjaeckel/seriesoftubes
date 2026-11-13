/* ================= FEDERATION: reporting a network to a server's operators =================
   A player reports a network (§5.10) to the operators of servers it joined: one of the four shun reasons, no text,
   signed with the network's key and put to a node of each server picked, never queued for every server (a report is
   for one server only). Operators get the reports their nodes send them (88-fed-net.js) and count them here. */
const FED_REPORT_DAY=10,FED_REPORTS_MAX=4096,FED_REPORT_KEPT=2592000,FED_REPORT_WHY=['cheating','offensive_name','spam','abuse'];
// What this network reported lately (per device, IndexedDB, never in a save): [{target, srv, t}] of the last 30 days.
const fedRepKey=pub=>'reported#'+pub;
async function fedReported(){const f=S&&S.fed;if(!f||!f.key)return [];const l=await fedGet('kv',fedRepKey(f.key.pub)),now=fedNow();
  return Array.isArray(l)?l.filter(x=>x&&!FdK(x.target)&&Number.isSafeInteger(x.t)&&now-x.t<FED_REPORT_KEPT):[];}
/* Reports a network to the operators of the servers srvs (ids of joined servers, connected now): gives {ok:[ids],
   failed:[{srv, error}]} or {error}. At most FED_REPORT_DAY networks a day from one network (the nodes allow more). */
async function fedReport(target,reason,srvs){const f=S&&S.fed;if(!f||!f.key||!fedHasPriv(f))return {error:'off'};
  if(FdK(target)||target===f.key.pub||!FED_REPORT_WHY.includes(reason))return {error:'bad_field'};
  srvs=[...new Set(Array.isArray(srvs)?srvs:[])].filter(id=>typeof id==='string'&&!FdId(id));if(!srvs.length)return {error:'offline'};
  const past=await fedReported(),now=fedNow(),day=new Set(past.filter(x=>now-x.t<FED_DAY&&x.target!==target).map(x=>x.target));
  if(day.size>=FED_REPORT_DAY)return {error:'too_many'};
  const ok=[],failed=[];
  for(const srv of srvs){const c=fedConnTo(srv);if(!c){failed.push({srv,error:'offline'});continue;}
    const r=await fedSignRec(f.key.priv,'report',{server:srv,target,reason},fedNow()),a=await fedAsk(c,{m:'put',rec:r});
    if(!a)failed.push({srv,error:'timeout'});else if(a.m==='err'){fedErrLog(c.node,srv,a.code);failed.push({srv,error:a.code});}else ok.push(srv);}
  if(ok.length){const l=(await fedReported()).filter(x=>!(x.target===target&&ok.includes(x.srv)));for(const srv of ok)l.push({target,srv,t:now});
    await fedPut('kv',fedRepKey(f.key.pub),l.slice(-512));}
  return {ok,failed};}
// When this network last reported target to each server: Map srv -> t.
async function fedReportedOf(target){const m=new Map();for(const x of await fedReported())if(x.target===target)m.set(x.srv,Math.max(m.get(x.srv)||0,x.t));return m;}

/* ---------- operators: the reports their nodes sent ---------- */
/* Kept as [{id, rec}] (kv 'reports'), only on a device with an operator key, only from a server it operates: the
   newest per server, reporter and network, for 30 days, at most FED_REPORTS_MAX. One write at a time. */
function fedReportsAdd(cs){const p=(FEDDB.pq||Promise.resolve()).then(()=>fedReportsRun(cs));FEDDB.pq=p.catch(()=>{});return p;}
async function fedReportsRun(cs){const k=await fedOpKey();if(!k)return;const srvs=await fedServers(),now=fedNow(),by=new Map();
  const key=r=>r.body.server+' '+r.key+' '+r.body.target,keep=x=>!!x&&!!x.rec&&fedOpOf(srvs,x.rec.body.server,k.pub)&&now-x.rec.t<=FED_REPORT_KEPT;
  for(const x of [...((await fedGet('kv','reports'))||[]),...cs])if(keep(x)){const o=by.get(key(x.rec));if(!o||fedNewer(x,o))by.set(key(x.rec),{id:x.id,rec:x.rec});}
  const l=[...by.values()].sort((a,b)=>b.rec.t-a.rec.t).slice(0,FED_REPORTS_MAX);FED.rgen=(FED.rgen||0)+1;await fedPut('kv','reports',l);
  fedEmit('reports',{n:l.length});}
/* The reports about networks on one server, newest first: [{target, reasons {reason: count}, reporters [keys], t (the
   newest)}]. Reporters are network keys, shown as counts and, on demand, as network names. */
async function fedReportsFor(srv){if(!await fedOpKey())return [];const m=new Map();
  for(const x of (await fedGet('kv','reports'))||[]){const b=x.rec.body;if(b.server!==srv)continue;let o=m.get(b.target);
    if(!o)m.set(b.target,o={target:b.target,reasons:{},reporters:[],t:0});
    o.reasons[b.reason]=(o.reasons[b.reason]||0)+1;if(!o.reporters.includes(x.rec.key))o.reporters.push(x.rec.key);o.t=Math.max(o.t,x.rec.t);}
  return [...m.values()].sort((a,b)=>b.t-a.t||fedByStr(a.target,b.target));}
