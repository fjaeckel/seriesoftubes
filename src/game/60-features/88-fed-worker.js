/* ================= FEDERATION: the worker =================
   Checking what nodes send is the demanding part of multiplayer: every record is turned into canonical JSON three
   times, walked by every schema rule and verified with Ed25519, which Chromium does on the thread that asks. On a
   phone, one backlog page of 256 records held the page for a quarter of a second, a ranking spot check for most of a
   second. So that work runs in a worker of its own, made like the route worker (rwWorker(), 28-route-worker.js): this
   page's script once more from a Blob URL, nothing fetched, nothing new served.
   The worker is pure: records, receipts and registry entries go in, verdicts come out (fedItemsRun, fedWhyRun,
   fedRegRun, below). It holds no key or seed (sealed deals are opened on the page), never touches IndexedDB, the save
   or S. What is kept and every change of state happen on the page, in the order they always did: one batch per sub
   page or answer, awaited in its place in FED.recQ, so pages, cursors, votes and announces keep their order.
   Not the route worker: a big network's day of routing and a long spot check would each wait for the other.
   It starts with a joined save's session (fedWake), so a save that never joins never makes it. Without Worker (tests,
   __TUBES_TEST__), or once it failed, the same functions run here on the page instead: same answers, same order. */
const FW_WAIT=60000;
const FW={w:null,dead:false,seq:0,q:new Map(),force:false,make:()=>rwWorker('\n;self.onmessage=e=>fwServe(e.data);'),stat:{n:0,items:0,local:0}};
// force: a test's fake Worker (FW.make) stands in where __TUBES_TEST__ would keep everything on the page.
function fwOn(){return !fedWorker()&&!FW.dead&&(FW.force||!window.__TUBES_TEST__&&!window.__TUBES_SYNC__&&typeof Worker==='function'&&!!RW_EL);}
function fwStart(){if(FW.w)return FW.w;
  try{const w=FW.w=FW.make();w.onmessage=e=>fwMsg(e.data);w.onerror=w.onmessageerror=e=>{console.error('[tubes] federation worker failed',e&&e.message||e);fwKill();};}
  catch(e){console.error('[tubes] no federation worker',e);fwKill();}
  return FW.w;}
// Gone for good this session: what it was working on is done here, and so is everything after.
function fwKill(){FW.dead=true;const w=FW.w;FW.w=null;if(w)try{w.terminate();}catch(e){}
  const q=[...FW.q.values()];FW.q.clear();for(const x of q){clearTimeout(x.t);x.rej(new Error('federation worker lost'));}}
function fwMsg(m){const x=m&&FW.q.get(m.fw);if(!x)return;FW.q.delete(m.fw);clearTimeout(x.t);if(m.err)x.rej(new Error(m.err));else x.res(m.r);}
const FW_OPS={items:a=>fedItemsRun(a.items,a.now,a.at,a.srvs),why:a=>fedWhyRun(a.items,a.now,a.at,a.srvs,a.key,a.q),reg:a=>fedRegRun(a.entries,a.now)};
/* One batch (op: items, why or reg) in the worker, or here when there is none. A worker that answers nothing for a
   minute is given up (a batch takes well under a second). */
async function fwDo(op,a){const w=fwOn()&&fwStart();
  if(w){try{const r=await new Promise((res,rej)=>{const k=++FW.seq,x={res,rej,t:setTimeout(()=>{console.error('[tubes] federation worker silent');fwKill();},FW_WAIT)};
        FW.q.set(k,x);try{w.postMessage({fw:k,op,a});}catch(e){console.error('[tubes] federation worker post',e);fwKill();}});
      FW.stat.n++;FW.stat.items+=Array.isArray(a.items)?a.items.length:Array.isArray(a.entries)?a.entries.length:0;return r;}
    catch(e){if(!FW.dead)console.error('[tubes] federation worker',e);}}
  FW.stat.local++;return FW_OPS[op](a);}
// In the worker: one batch, answered with its result or the error.
function fwServe(m){Promise.resolve().then(()=>FW_OPS[m.op](m.a)).then(r=>postMessage({fw:m.fw,r}),e=>postMessage({fw:m.fw,err:String(e&&e.stack||e)}));}
// The catalog as the worker needs it: which node keys each server has.
const fwSrvs=srvs=>srvs.map(e=>({id:e.id,nodes:(e.nodes||[]).map(n=>({key:n.key}))}));

/* ---------- the batches: pure functions of what they are given ---------- */
/* Items [{rec, rcpt}] from a sub or a fetch, each checked (§7.1) and placed by its receipts (fedPlace): null (not an
   item), {ok:false, error} or {ok:true, kind, id, slot, cc}, plus rec when the checked record is not the item's own
   object (it came as text). at: {srv, nodeKey} of the connection. */
async function fedItemsRun(items,now,at,srvs){const out=[];
  for(const it of items){if(!it||typeof it!=='object'){out.push(null);continue;}const chk=await fedCheck(it.rec,now);
    if(!chk.ok){out.push({ok:false,error:chk.error});continue;}const pl=await fedPlace(at,chk,it.rcpt,now,srvs);
    const x={ok:true,kind:chk.kind,id:chk.id,slot:pl.slot,cc:pl.cc};if(chk.rec!==it.rec)x.rec=chk.rec;out.push(x);}
  return out;}
// The page's side of fedItemsRun: each checked record is the page's own object again.
async function fedCheckItems(items,now,c,srvs){const r=await fwDo('items',{items,now,at:{srv:c.srv,nodeKey:c.nodeKey},srvs:fwSrvs(srvs)});
  return r.map((x,i)=>x&&x.ok&&!x.rec?{...x,rec:items[i].rec}:x);}
/* A rankwhy answer's items worked out into one row (fedRankRow): the key's newest announce and the stats records with
   a valid receipt go to fedRankOne (q: its query, exclusions included; on the cone board every network's newest
   announce gives its founded). null when a receipt names a server this browser does not know: then the row cannot be
   checked. Live states (the running slot of the current window, §10.13; a board of now) are each checked as at the
   snapshot's time (q.now: a state that was live then is never too old for the check); on a board of now they go to
   fedNowOne instead, and the key's newest stats record gives its country (the from filter). */
async function fedWhyRun(items,now,at,srvs,key,q){const recs=[],anns=new Map(),states=[],isNow=q.measure==='now';
  for(const it of items){if(!it||typeof it!=='object')continue;
    if(it.rec&&it.rec.kind==='state'){const c=await fedCheck(it.rec,q.now,{kinds:FED_STATE});if(c.ok)states.push({id:c.id,key:c.rec.key,t:c.rec.t,body:c.rec.body});continue;}
    const chk=await fedCheck(it.rec,now);if(!chk.ok)continue;const r=chk.rec;
    if(r.kind==='announce'){const o=anns.get(r.key);if(!o||r.t>o.t||r.t===o.t&&fedByStr(chk.id,o.id)<0)anns.set(r.key,{t:r.t,id:chk.id,body:r.body});continue;}if(r.kind!=='stats')continue;
    for(const rc of Array.isArray(it.rcpt)?it.rcpt.slice(0,16):[]){const sid=rc&&rc.body&&rc.body.server;if(typeof sid==='string'&&sid!==at.srv&&!srvs.some(x=>x.id===sid))return null;}
    const pl=await fedPlace(at,chk,it.rcpt,now,srvs);if(pl.slot!==null)recs.push({id:chk.id,key:r.key,slot:pl.slot,t:r.t,body:r.body,cc:pl.cc});}
  const a=anns.get(key),founded={};for(const [k,o] of anns)founded[k]=o.body.founded;
  if(isNow){let n=null;for(const r of recs)if(r.key===key&&(!n||r.slot>n.slot||r.slot===n.slot&&(r.t>n.t||r.t===n.t&&fedByStr(r.id,n.id)<0)))n=r;
    return fedNowOne({...q,founded},key,states,a?a.body:null,n&&n.cc);}
  return fedRankOne({...q,founded},key,recs,a?a.body:null,states);}
// Registry or gossip entries (fedRegEntry, a whole chain each): null or {id, sum (fedSum)}.
async function fedRegRun(entries,now){const out=[];
  for(const e of entries){if(!e||typeof e!=='object'){out.push(null);continue;}const r=await fedRegEntry(e,now);out.push(r.ok?{id:r.id,sum:fedSum(r)}:null);}
  return out;}
