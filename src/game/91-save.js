/* ================= SAVE ================= */
/* A network too big for the browser's storage fails to save every time, and turning it into text takes a
   moment on huge saves, every 5 seconds and after every click. After a failure the autosave waits before trying
   again (1 minute, then 2, 4, at most 5); leaving the page, exporting or another game (a new S) still try at once. */
/* A puzzle is never saved: only its stars are, under their own key (sot-puzzles). While one runs, the network it set
   aside (UI.pzKeep) is the one saved, to its own slot, so closing the tab mid-puzzle loses nothing. */
function save(force,st){if(!st)st=pzOn()?UI.pzKeep:S;const id=UI.slot;
  if(!st||st.lost||st.mode==='puzzle'||!id||SLOT.no.has(id))return;
  if(st===S){S.uiSpeed=UI.speed;S.cam={x:cam.x,y:cam.y,z:cam.z};}const f=UI.saveFail,failed=f&&f.s===st;
  if(!force&&failed&&performance.now()-f.at<f.wait){UI.lastSave=performance.now();return;}
  UI.lastSave=performance.now();
  // Set aside for a puzzle, it cannot change: once its save has landed (or is still compressing), there is nothing to do.
  if(st!==S&&!failed&&(SLOT.top[id]||0)>0)return;
  const txt=JSON.stringify(packSave(st));
  let tier=null;if(st===S)try{tier=tierLabel();}catch(e){}
  const seq=SLOT.top[id]=Math.max(SLOT.top[id]||0,SLOT.sq[id]||0)+1,j={id,s:st,txt,seq,meta:slotMeta(st,tier)};
  if(txt.length>=GZ_MIN&&gzOk())gzSave(j);else slotPut(j,slotStamp(txt,seq));}
function saveErr(e,s){const f=UI.saveFail,again=f&&f.s===s;UI.saveFail={s,at:performance.now(),wait:again?Math.min(300000,f.wait*2):60000,full:saveFull(e)};
  // Say so once per game (#176): a save that silently fails loses everything since the last one that worked.
  if(!again&&(s===S||s===UI.pzKeep))toast(saveFailMsg(),'bad',[{l:tr('common.export_save'),act:'exportSave',args:{}},...(UI.saveFail.full&&slotOthers().length?[{l:tr('slots.free_up_space'),act:'slotSpace',args:{}}]:[])]);}
/* Saves of huge networks are gzipped by the browser (#176): about ten times smaller, so they fit in its storage.
   Compressing runs in the background, one at a time, and the newest save of each network wins; one that a newer save
   of the same network has overtaken meanwhile is dropped. Small saves stay plain JSON, written at once, as before. */
const GZ='gz:',GZ_MIN=1e6,gzOk=()=>typeof CompressionStream==='function'&&typeof DecompressionStream==='function';
async function gzPipe(bytes,stream){const w=stream.writable.getWriter(),no=()=>{};w.write(bytes).catch(no);w.close().catch(no);// a bad stream is reported by read() below
  const r=stream.readable.getReader(),parts=[];let n=0;
  for(;;){const {done,value}=await r.read();if(done)break;parts.push(value);n+=value.length;}
  const out=new Uint8Array(n);let o=0;for(const p of parts){out.set(p,o);o+=p.length;}return out;}
const b64=u=>{let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s);};
const unb64=t=>{const s=atob(t),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u;};
const gzip=async txt=>GZ+b64(await gzPipe(new TextEncoder().encode(txt),new CompressionStream('gzip')));
const gunzip=async raw=>new TextDecoder().decode(await gzPipe(unb64(raw.slice(GZ.length)),new DecompressionStream('gzip')));
// Jobs carry their slot, not the game object: a save still compressing lands in its own network whatever S is by then.
function gzSave(j){if(UI.gzBusy){SLOT.gzQ.set(j.id,j);return;}UI.gzBusy=true;
  gzip(slotStamp(j.txt,j.seq)).then(v=>{if(j.seq===SLOT.top[j.id])slotPut(j,v);})
    .catch(e=>{console.error('[tubes] compressing the save failed',e);})
    .finally(()=>{UI.gzBusy=false;const n=SLOT.gzQ.values().next().value;if(n){SLOT.gzQ.delete(n.id);gzSave(n);}else slotIdle();});}
/* Big networks are mostly customers, and most of a customer record was defaults (#176): no second city, no
   requirements, the normal route, no warnings yet. The save leaves defaults out and sanitize() puts them back, so
   the game after loading is the same; older versions read a missing field as its default too. An alien wave's
   description is rebuilt from its fiber. */
const BIZ_DEF={city2:null,latMax:null,route:'normal',sites:null,slots:0,warned:false,warn60:false};
function packBiz(b){const o={};for(const k in b){const v=b[k];if(v===undefined||BIZ_DEF[k]===v||(k==='reqs'&&Array.isArray(v)&&!v.length)||(k==='pm'&&v===b.mood)||(k==='what'&&b.type==='wwave'&&b.link))continue;o[k]=v;}return o;}
function unpackBiz(b,links){for(const k in BIZ_DEF)if(!(k in b))b[k]=BIZ_DEF[k];if(!('pm' in b)&&b.mood!==undefined)b.pm=b.mood;if(!Array.isArray(b.reqs))b.reqs=[];
  if(b.type==='wwave'&&b.what===undefined){const l=links.get(b.link);b.what=l?wwWhat(l,b.slots||1):'';}return b;}
// sv (the slot's save stamp) is added when the text is written, never carried in the game.
const packSave=s=>({...s,sv:undefined,biz:s.biz.map(packBiz)});
// Out of room (quota) or not allowed to store at all (private window, blocked site data): different advice.
const saveFull=e=>!!e&&(e.name==='QuotaExceededError'||e.name==='NS_ERROR_DOM_QUOTA_REACHED'||e.code===22||e.code===1014);
const saveFailing=()=>!!(UI.saveFail&&UI.saveFail.s===S);
const saveFailMsg=()=>UI.saveFail&&UI.saveFail.full?tr('save.your_network_is_too_big_to'):tr('save.this_browser_is_not_letting_the');
// Save whenever the player might be leaving: tab hidden, page closing or reloading.
addEventListener('pagehide',()=>save(true));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')save(true);else checkUpdate();});
/* Export / import: move a network to another device or keep a backup. The file is the same
   object the autosave writes, wrapped with a little metadata. */
function saveFileName(nm){const d=new Date().toISOString().slice(0,10),n=String(nm||'network').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'network';return `series-of-tubes-${n}-${d}.json`;}
function saveDl(txt,nm){const blob=new Blob([txt],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=saveFileName(nm);document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);
  toast(tr('save.save_exported_file_is_in_your',{file:esc(saveFileName(nm))}),'good');}
function exportSave(){if(!S||S.mode==='puzzle')return;save(true);saveDl(JSON.stringify({app:'series-of-tubes',version:APP_VERSION,exported:new Date().toISOString(),S:packSave(S)},null,1),S.name);}
// Any network on this device, straight from storage: the file wraps the saved text as it is, without loading it.
function exportSlot(id){const e=slotIdx().find(x=>x.id===id),raw=slotRaw(id);if(!e||raw==null)return;
  if(id===UI.slot&&S&&!pzOn()){exportSave();return;}
  (raw.startsWith(GZ)?gunzip(raw):Promise.resolve(raw)).then(t=>saveDl(`{"app":"series-of-tubes","version":${JSON.stringify(APP_VERSION)},"exported":"${new Date().toISOString()}","S":${t}}`,e.name),()=>toast(tr('loop.your_saved_game_could_not_be'),'bad'));}
function parseSave(txt){if(typeof txt!=='string')return {err:tr('save.that_file_is_not_valid_json')};let j;try{j=JSON.parse(txt);}catch(e){return {err:tr('save.that_file_is_not_valid_json')};}
  const s=j&&j.app==='series-of-tubes'&&j.S?j.S:j;
  if(!s||typeof s!=='object'||s.v!==1||typeof s.day!=='number'||typeof s.cash!=='number'||!s.pops||typeof s.pops!=='object'||!Array.isArray(s.links))return {err:tr('save.that_does_not_look_like_a')};
  if(s.lost)return {err:tr('save.that_network_went_bankrupt_it_cannot')};
  for(const c of Object.keys(s.pops))if(!isCity(c))return {err:tr('save.that_save_has_a_pop_in',{city:esc(String(c).slice(0,12))})};
  return {s,ver:j.version||'?',name:String(s.name||tr('common.unnamed_network'))};}
function importFile(file){if(!file)return;if(file.size>8e6){toast(tr('save.that_file_is_too_big_to'),'bad');return;}
  const rd=new FileReader();rd.onload=()=>{const r=parseSave(String(rd.result));if(r.err){toast(tr('save.import_failed_err',{err:esc(r.err)}),'bad');sfx('err');return;}
    UI.importing=r.s;openModal(`<div class="eyebrow">${tr('common.import_a_save')}</div><h2 style="font-size:26px">${tr('save.load_name',{name:esc(r.name)})}</h2><p class="tagline">${esc(dateStr(r.s.day))} · ${tr('save.cash_in_the_bank',{cash:fmt$(r.s.cash)})} · ${trn('save.n_pop',Object.keys(r.s.pops).length)} · ${tr('save.saved_by_v_ver',{ver:esc(r.ver)})}</p><p class="note">${tr('slots.it_joins_your_networks_on_this')}</p><div class="btns">${btn(tr('save.load_this_network'),'importGo',{},'pink big')}${btn(tr('common.cancel'),UI.started?'closeModal':'helpClose',{},'ghost big')}</div>`);};
  rd.readAsText(file);}
// This window's network, read synchronously (a compressed one was unpacked before boot). UI.loadBad: there, but unreadable.
function loadSave(){UI.loadBad=false;const raw=slotRaw(UI.slot);if(raw==null)return null;
  try{const t=raw.startsWith(GZ)?raw===UI.gzRaw?UI.gzText:null:raw;if(t){const s=JSON.parse(t);if(s&&s.v===1){if(!s.lost)return s;return null;}}}catch(e){}
  UI.loadBad=true;return null;}
