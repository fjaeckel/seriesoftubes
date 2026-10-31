/* ================= SAVE SLOTS =================
   Several networks per browser, one per window. Each network (a slot) is its own key, sot-save-v1:<id>, plain JSON or
   gzipped exactly like the old single save. A small index (sot-slots) describes them for the title screen, so listing
   them never reads a save. A write goes to the slot first and to the index after, so the index never points at a save
   that is not there yet; each write carries a sequence number (in the save and in its index entry), and a window never
   writes over a newer one that another window saved. Each tab keeps its slot in sessionStorage: a reload continues it.
   Only one window plays a slot at a time: a Web Lock where the browser has them, else a heartbeat key, sot-open:<id>. */
const SLOT_K='sot-save-v1:',SLOT_IX='sot-slots',SLOT_OLD='sot-save-v1',SLOT_HB='sot-open:',SLOT_SS='sot-slot',SLOT_MAIN='main';
const SLOT={sq:{},top:{},rel:new Set(),no:new Set(),locks:new Map(),gzQ:new Map(),idle:[],wait:null,html:''};
function slotRid(){try{const a=new Uint32Array(2);crypto.getRandomValues(a);return (a[0].toString(36)+a[1].toString(36)).slice(0,10);}catch(e){return (Date.now().toString(36)+(uidN++).toString(36)).slice(-10);}}
const WIN=slotRid();// this page load; a reload is a new window that takes its tab's slot back
const lsGet=k=>{try{return localStorage.getItem(k);}catch(e){return null;}};
const lsDel=k=>{try{localStorage.removeItem(k);}catch(e){}};
const ssGet=k=>{try{return sessionStorage.getItem(k);}catch(e){return null;}};
const ssSet=(k,v)=>{try{if(v==null)sessionStorage.removeItem(k);else sessionStorage.setItem(k,v);}catch(e){}};
const slotOkId=id=>typeof id==='string'&&/^[a-z0-9]{1,24}$/.test(id);
const slotRaw=id=>slotOkId(id)?lsGet(SLOT_K+id)??(id===SLOT_MAIN?lsGet(SLOT_OLD):null):null;
// ---------- the index: read like a save, never trusted ----------
function slotClean(e){if(!e||typeof e!=='object'||!slotOkId(e.id))return null;
  return {id:e.id,name:String(e.name==null?'':e.name).slice(0,24),asn:int(e.asn,0,4294967294,0),mode:['normal','sandbox','scenario'].includes(e.mode)?e.mode:'normal',
    preset:typeof e.preset==='string'&&own(PRESETS,e.preset)?e.preset:'oncall',scn:typeof e.scn==='string'?e.scn.slice(0,60):null,day:int(e.day,0,1e7,0),
    tier:['Tier 1','Tier 2','Tier 3'].includes(e.tier)?e.tier:null,cash:num(e.cash,0),at:num(e.at,0),size:int(e.size,0,1e10,0),seq:int(e.seq,0,1e15,0),gz:!!e.gz,broken:!!e.broken};}
const slotMeta=(s,tier)=>({name:s.name,asn:s.asn,mode:s.mode,preset:s.rules&&s.rules.preset,scn:s.scn&&s.scn.name||null,day:s.day,cash:s.cash,tier});
function slotKeys(){const out=[];try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k===SLOT_OLD)out.old=true;else if(k&&k.startsWith(SLOT_K)&&slotOkId(k.slice(SLOT_K.length)))out.push(k.slice(SLOT_K.length));}}catch(e){}return out;}
// An index entry rebuilt from the save itself. A compressed one can only be read in the background: slotFix() fills it in.
function slotFromKey(id){const raw=slotRaw(id)||'';if(raw.startsWith(GZ))return slotClean({id,gz:true,size:raw.length});
  try{const s=JSON.parse(raw);if(s&&s.v===1&&typeof s.day==='number')return slotClean({id,...slotMeta(s,null),seq:s.sv&&s.sv.seq,at:s.sv&&s.sv.at,size:raw.length});}catch(e){}
  return slotClean({id,size:raw.length,broken:true});}
/* The list of networks. scan also looks at the keys themselves (cheap: no save is read unless its entry is missing):
   a save whose index write failed is added back, an entry whose save is gone is dropped. A damaged index is rebuilt. */
function slotIdx(scan){const raw=lsGet(SLOT_IX);let list=null;
  // The same text as last time (every autosave): no need to parse and check it again.
  if(!scan&&raw!=null&&raw===SLOT.ixRaw)return SLOT.ixList.map(e=>({...e}));
  if(raw!=null)try{const j=JSON.parse(raw);if(j&&Array.isArray(j.slots))list=j.slots.map(slotClean).filter(Boolean);}catch(e){}
  const bad=raw!=null&&!list;if(!list)list=[];{const seen=new Set();list=list.filter(e=>!seen.has(e.id)&&seen.add(e.id));}
  if(scan||bad){const ks=slotKeys(),keys=new Set(ks);let ch=bad;const n=list.length;
    if(ks.old&&list.some(e=>e.id===SLOT_MAIN))keys.add(SLOT_MAIN);
    list=list.filter(e=>keys.has(e.id));if(list.length!==n)ch=true;
    for(const id of keys)if(!list.some(e=>e.id===id)){list.push(slotFromKey(id));ch=true;}
    if(ch)slotIdxPut(list);if(list.some(e=>e.gz&&!e.name&&!e.broken))slotFix(list);}
  else if(raw!=null&&list.length){SLOT.ixRaw=raw;SLOT.ixList=list.map(e=>({...e}));}
  return list;}
function slotIdxPut(list){const t=JSON.stringify({v:1,slots:list});try{localStorage.setItem(SLOT_IX,t);SLOT.ixRaw=t;SLOT.ixList=list.map(e=>({...e}));return true;}catch(e){SLOT.ixRaw=null;return false;}}
function slotFix(list){for(const e of list)if(e.gz&&!e.name&&!e.broken&&!SLOT['fix'+e.id]){SLOT['fix'+e.id]=1;const raw=slotRaw(e.id);
  gunzip(raw).then(t=>{const s=JSON.parse(t);return s&&s.v===1?slotMeta(s,null):null;},()=>null).then(m=>{const l=slotIdx(),x=l.find(y=>y.id===e.id);if(!x)return;
    if(m)Object.assign(x,slotClean({...x,...m}));else x.broken=true;slotIdxPut(l);slotRefresh();});}}
const slotByAt=l=>l.slice().sort((a,b)=>b.at-a.at);
// ---------- one writer per slot ----------
// The heartbeat: who has a slot open, refreshed every few seconds. A hidden tab's timers can be slowed to once a
// minute, so it counts for longer. Tabs remove theirs when they close; a crashed one goes stale.
function slotHb(id){try{const h=JSON.parse(lsGet(SLOT_HB+id));return h&&typeof h.w==='string'&&isFinite(h.t)?h:null;}catch(e){return null;}}
const slotBusy=id=>{const h=slotHb(id);return !!h&&h.w!==WIN&&Date.now()-h.t<(h.h?180000:20000);};
function slotBeat(){const id=UI.slot;if(!id)return;const h=slotHb(id);
  // Without Web Locks the heartbeat is the lock: a fresh one from another window means it took over.
  if(h&&h.w!==WIN&&!SLOT.locks.has(id)&&Date.now()-h.t<20000){slotLost(id,'take');return;}
  try{localStorage.setItem(SLOT_HB+id,JSON.stringify({w:WIN,t:Date.now(),h:document.visibilityState==='hidden'?1:0}));}catch(e){}}
function slotUnbeat(id){const h=slotHb(id);if(h&&h.w===WIN)lsDel(SLOT_HB+id);}
const LOCKS=()=>{try{const l=navigator.locks;return l&&typeof l.request==='function'?l:null;}catch(e){return null;}};
// cb(true) when this window may play the slot, cb(false) when another window has it. steal takes it over.
function slotClaim(id,steal,cb,n=4){const once=v=>{try{cb(v);}catch(e){console.error('[tubes] opening a network failed',e);}};
  if(SLOT.locks.has(id)){slotBeatFor(id);once(true);return;}
  const L=LOCKS();
  if(L){let got=false;
    L.request('sot-slot:'+id,steal?{steal:true}:{ifAvailable:true},lock=>{if(!lock){if(n>0&&(SLOT.rel.has(id)||!slotBusy(id)))setTimeout(()=>slotClaim(id,steal,cb,n-1),120);else once(false);return;}got=true;SLOT.rel.delete(id);
      return new Promise(r=>{SLOT.locks.set(id,r);slotBeatFor(id);once(true);});})
     .catch(()=>{SLOT.locks.delete(id);if(got)slotLost(id,'take');});// stolen: another window took over
    return;}
  if(!steal&&slotBusy(id)){once(false);return;}
  slotBeatFor(id);once(true);}
function slotBeatFor(id){try{localStorage.setItem(SLOT_HB+id,JSON.stringify({w:WIN,t:Date.now(),h:0}));}catch(e){}}
function slotFree(id){if(UI.slot===id)return;slotUnbeat(id);const r=SLOT.locks.get(id);SLOT.locks.delete(id);if(r){SLOT.rel.add(id);r();}}
// Saves still compressing land before a slot is handed back.
function whenIdle(f){if(!UI.gzBusy&&!SLOT.gzQ.size)f();else SLOT.idle.push(f);}
function slotIdle(){if(UI.gzBusy||SLOT.gzQ.size)return;const l=SLOT.idle.splice(0);for(const f of l)try{f();}catch(e){console.error(e);}}
// ---------- writing ----------
// The sequence number rides along in the save, appended to the text (no second stringify).
const slotStamp=(txt,seq)=>txt.slice(0,-1)+',"sv":{"seq":'+seq+',"at":'+Date.now()+'}}';
// Throws when the browser refuses (quota): save() reports it. Returns false when it must not write.
function slotWrite(j,data){const id=j.id;if(SLOT.no.has(id))return false;
  const list=slotIdx(),ent=list.find(e=>e.id===id);
  if(ent&&ent.seq>(SLOT.sq[id]||0)){slotLost(id,'newer');return false;}
  let k=SLOT_K+id;
  try{localStorage.setItem(k,data);}
  catch(e){// A migrated save the browser has no room to copy keeps living in the old key, as it always did.
    if(id!==SLOT_MAIN||lsGet(SLOT_OLD)==null)throw e;localStorage.setItem(SLOT_OLD,data);lsDel(k);k=SLOT_OLD;}
  if(id===SLOT_MAIN&&k!==SLOT_OLD)lsDel(SLOT_OLD);// the new key has a newer save now: the old one is no longer needed
  SLOT.sq[id]=Math.max(SLOT.sq[id]||0,j.seq);
  const e=ent||{id};if(!ent)list.push(e);Object.assign(e,slotClean({...e,...j.meta,tier:j.meta.tier||e.tier,seq:j.seq,at:Date.now(),size:data.length,gz:data.startsWith(GZ),broken:false}));
  slotIdxPut(list);return true;}
function slotPut(j,data){try{if(slotWrite(j,data))UI.saveFail=null;}catch(e){saveErr(e,j.s);}}
// ---------- opening, leaving, losing ----------
function slotIn(id,sv){const e=slotIdx().find(x=>x.id===id);UI.slot=id;ssSet(SLOT_SS,id);SLOT.no.delete(id);SLOT.top[id]=0;
  SLOT.sq[id]=Math.max(sv&&isFinite(sv.seq)?+sv.seq:0,e?e.seq:0);}
function slotNew(){const id=slotRid();UI.slot=id;ssSet(SLOT_SS,id);SLOT.sq[id]=0;SLOT.no.delete(id);slotClaim(id,true,()=>{});return id;}
// Leave this window's network (saved first); the slot is free for other windows once its last save has landed.
function slotLeave(){const id=UI.slot;if(!id)return;save(true);UI.slot=null;UI.pzKeep=null;ssSet(SLOT_SS,null);whenIdle(()=>slotFree(id));}
// Read a slot and play it. A save that cannot be read or loaded is marked damaged and kept, so it can still be exported.
function slotOpen(id,steal,done){if(!slotIdx(true).some(e=>e.id===id)){showTitle();toast(tr('slots.that_network_is_gone'),'bad');return;}
  slotClaim(id,!!steal,ok=>{if(!ok){slotBusyModal(id);return;}
    const go=t=>{let s=null;try{s=JSON.parse(t);}catch(e){}
      if(!s||s.v!==1||s.lost){slotBroke(id);return;}const sv=s.sv;delete s.sv;
      const prev=S;try{S=migrate(s);compute();}catch(e){console.error('[tubes] loading a network failed',e);S=prev;slotBroke(id);return;}
      if(UI.slot&&UI.slot!==id){const nw=S;S=prev;slotLeave();S=nw;}
      slotIn(id,sv);gameResume();if(done)done();};
    const raw=slotRaw(id);if(raw==null){slotFree(id);slotDrop(id);showTitle();toast(tr('slots.that_network_is_gone'),'bad');return;}
    if(raw.startsWith(GZ)){if(raw===UI.gzRaw)go(UI.gzText);else gunzip(raw).then(go,()=>slotBroke(id));}else go(raw);});}
function slotBroke(id){const l=slotIdx(),e=l.find(x=>x.id===id);if(e){e.broken=true;slotIdxPut(l);}
  if(UI.slot===id){UI.slot=null;ssSet(SLOT_SS,null);}slotFree(id);
  S=null;R=emptyR();UI.started=false;UI.sel=null;$('dash').hidden=true;$('bankBox').hidden=true;renderAll();showTitle();toast(tr('loop.your_saved_game_could_not_be'),'bad');}
function slotDrop(id){if(!slotOkId(id))return;SLOT.no.add(id);lsDel(SLOT_K+id);if(id===SLOT_MAIN)lsDel(SLOT_OLD);slotUnbeat(id);
  const l=slotIdx();slotIdxPut(l.filter(e=>e.id!==id));if(UI.slot===id){UI.slot=null;ssSet(SLOT_SS,null);}}
/* Another window took this network over, or saved a newer version of it: this one stops writing and says so calmly. */
function slotLost(id,why){if(UI.slot!==id)return;SLOT.no.add(id);UI.slot=null;ssSet(SLOT_SS,null);SLOT.gzQ.delete(id);if(why==='gone')slotUnbeat(id);
  const r=SLOT.locks.get(id);SLOT.locks.delete(id);if(r)r();
  const s=pzOn()?UI.pzKeep:S,name=s?s.name:'';
  if(pzOn()){UI.pzKeep=null;UI.pzFrom='title';toast(tr('slots.name_moved_to_another_window_toast',{name:esc(name)}),'bad');return;}
  gameClear();if(why==='gone'){showTitle();toast(tr('slots.name_was_deleted_in_another_window',{name:esc(name)}),'bad');}else slotLostModal(id,name,why);}
// ---------- the legacy single save becomes the first slot ----------
/* Read old, write new, read it back, then add it to the index. The old key stays as a fallback until the slot's next
   save lands; if the browser has no room for a copy, the network keeps living in the old key (slotRaw reads it). */
function slotMigrate(cb){const raw=lsGet(SLOT_OLD);
  if(raw==null||slotIdx(true).some(e=>e.id===SLOT_MAIN)){cb();return;}
  const done=s=>{if(s&&s.lost){cb();return;}
    let ok=false;try{localStorage.setItem(SLOT_K+SLOT_MAIN,raw);ok=localStorage.getItem(SLOT_K+SLOT_MAIN)===raw;}catch(e){}
    if(!ok)lsDel(SLOT_K+SLOT_MAIN);
    const l=slotIdx();l.push(slotClean({id:SLOT_MAIN,...(s?slotMeta(s,null):{}),seq:0,at:Date.now(),size:raw.length,gz:raw.startsWith(GZ),broken:!s}));slotIdxPut(l);if(!s)UI.bootBroken=true;cb();};
  if(!raw.startsWith(GZ)){let s=null;try{s=JSON.parse(raw);}catch(e){}done(s&&s.v===1?s:null);return;}
  if(!gzOk()){done(null);return;}
  gunzip(raw).then(t=>{UI.gzRaw=raw;UI.gzText=t;let s=null;try{s=JSON.parse(t);}catch(e){}done(s&&s.v===1?s:null);},()=>done(null));}
/* Before the game boots: migrate, then pick this tab's network. A reload continues the tab's own slot; a new tab with
   exactly one network continues it as before; with more, the title screen lists them. A compressed save is unpacked
   here, so loadSave() stays synchronous for everything else. */
function slotBoot(go){slotMigrate(()=>{const list=slotIdx(true),mine=ssGet(SLOT_SS);
  let id=list.some(e=>e.id===mine&&!e.broken)?mine:null;if(!id&&mine)ssSet(SLOT_SS,null);
  const auto=!id&&list.length===1&&!list[0].broken&&!slotBusy(list[0].id)?list[0].id:null;
  if(!id&&!auto){go();return;}
  slotClaim(id||auto,false,ok=>{const w=id||auto;
    if(!ok){if(id){ssSet(SLOT_SS,null);UI.bootBusy=id;}go();return;}
    UI.slot=w;const raw=slotRaw(w);
    if(raw&&raw.startsWith(GZ)&&raw!==UI.gzRaw){if(!gzOk()){go();return;}gunzip(raw).then(t=>{UI.gzRaw=raw;UI.gzText=t;go();},e=>{console.error('[tubes] unpacking the save failed',e);go();});}
    else go();});});}
// ---------- other windows ----------
const BC=(()=>{try{return typeof BroadcastChannel==='function'?new BroadcastChannel('sot-slots'):null;}catch(e){return null;}})();
if(BC)BC.onmessage=({data:m})=>{if(!m||typeof m!=='object'||!slotOkId(m.id))return;
  if(m.t==='focus'&&UI.slot===m.id){try{window.focus();}catch(e){}toast(tr('slots.here_it_is_name',{name:esc(S?S.name:'')}),'goal');}
  // Asked to hand over: save what we have, wait for it to land, then step aside and say so.
  if(m.t==='take'&&UI.slot===m.id){save(true);whenIdle(()=>{slotLost(m.id,'take');try{BC.postMessage({t:'gave',id:m.id});}catch(e){}});}
  if(m.t==='gave'&&SLOT.wait&&SLOT.wait.id===m.id)SLOT.wait.go();
  if(m.t==='gone')slotLost(m.id,'gone');};
addEventListener('storage',e=>{const k=e.key;if(!k)return;const id=UI.slot;
  if(id&&k===SLOT_HB+id&&e.newValue){let h=null;try{h=JSON.parse(e.newValue);}catch(_){}if(h&&h.w!==WIN)slotLost(id,'take');}
  else if(id&&k===SLOT_K+id&&e.newValue==null)slotLost(id,'gone');// deleted in another window: never written back
  else if(id&&k===SLOT_IX){const x=slotIdx().find(y=>y.id===id);if(x&&x.seq>(SLOT.sq[id]||0))slotLost(id,'newer');}
  if(k===SLOT_IX||k.startsWith(SLOT_HB))slotRefresh();});
addEventListener('pagehide',()=>{if(UI.slot)slotUnbeat(UI.slot);});
addEventListener('pageshow',e=>{if(e.persisted)slotBeat();});
if(!window.__TUBES_TEST__)setInterval(slotBeat,5000);
