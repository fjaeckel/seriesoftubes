/* ================= SAVE ================= */
/* A network too big for the browser's storage fails to save every time, and turning it into text takes a
   moment on huge saves, every 5 seconds and after every click. After a failure the autosave waits before trying
   again (1 minute, then 2, 4, at most 5); leaving the page, exporting or another game (a new S) still try at once. */
/* One game, one tab (#200): every tab writes the same save, so a forgotten tab with an older game overwrote a
   newer one every 5 seconds. A tab claims the save when it opens; once another tab has claimed it, this one
   stops saving and asks which game to keep. */
const TAB=(self.crypto&&crypto.randomUUID?crypto.randomUUID():'')+Date.now().toString(36)+performance.now();
const saveMine=()=>{try{const t=localStorage.getItem('sot-save-tab');return !t||t===TAB;}catch(e){return true;}};
function claimSave(){UI.otherTab=false;try{localStorage.setItem('sot-save-tab',TAB);}catch(e){}}
function otherTab(){UI.otherTab=true;if(!$('modal').hidden)return;
  openModal(`<h2 style="font-size:26px">${tr('save.this_game_is_open_in_another')}</h2><p class="tagline">${tr('save.another_tab_saved_this_game_more')}</p><div class="btns">${btn(tr('save.load_the_newer_save'),'tabReload',{},'pink big')}${btn(tr('save.keep_playing_here'),'tabTakeOver',{},'ghost big')}</div>`);}
function save(force){if(!S||S.lost)return;
  if(UI.otherTab||!saveMine()){UI.lastSave=performance.now();otherTab();return;}
  S.uiSpeed=UI.speed;S.cam={x:cam.x,y:cam.y,z:cam.z};const f=UI.saveFail;
  if(!force&&f&&f.s===S&&performance.now()-f.at<f.wait){UI.lastSave=performance.now();return;}
  const txt=JSON.stringify(packSave(S));
  const seq=UI.saveSeq=(UI.saveSeq||0)+1;
  if(txt.length>=GZ_MIN&&gzOk())gzSave(S,txt,seq);
  else try{localStorage.setItem('sot-save-v1',txt);UI.saveFail=null;}catch(e){saveErr(e,S);}
  UI.lastSave=performance.now();}
function saveErr(e,s){const f=UI.saveFail,again=f&&f.s===s;UI.saveFail={s,at:performance.now(),wait:again?Math.min(300000,f.wait*2):60000,full:saveFull(e)};
  // Say so once per game (#176): a save that silently fails loses everything since the last one that worked.
  if(!again&&s===S)toast(saveFailMsg(),'bad',[{l:tr('common.export_save'),act:'exportSave',args:{}}]);}
/* Saves of huge networks are gzipped by the browser (#176): about ten times smaller, so they fit in its storage.
   Compressing runs in the background, one at a time, and the newest save wins; one that a newer save or another
   game has overtaken meanwhile is dropped. Small saves stay plain JSON, written at once, as before. */
const GZ='gz:',GZ_MIN=1e6,gzOk=()=>typeof CompressionStream==='function'&&typeof DecompressionStream==='function';
async function gzPipe(bytes,stream){const w=stream.writable.getWriter(),no=()=>{};w.write(bytes).catch(no);w.close().catch(no);// a bad stream is reported by read() below
  const r=stream.readable.getReader(),parts=[];let n=0;
  for(;;){const {done,value}=await r.read();if(done)break;parts.push(value);n+=value.length;}
  const out=new Uint8Array(n);let o=0;for(const p of parts){out.set(p,o);o+=p.length;}return out;}
const b64=u=>{let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s);};
const unb64=t=>{const s=atob(t),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u;};
const gzip=async txt=>GZ+b64(await gzPipe(new TextEncoder().encode(txt),new CompressionStream('gzip')));
const gunzip=async raw=>new TextDecoder().decode(await gzPipe(unb64(raw.slice(GZ.length)),new DecompressionStream('gzip')));
function gzSave(s,txt,seq){if(UI.gzBusy){UI.gzNext={s,txt,seq};return;}UI.gzBusy=true;
  gzip(txt).then(v=>{if(s!==S||seq!==UI.saveSeq||!saveMine())return;try{localStorage.setItem('sot-save-v1',v);UI.saveFail=null;}catch(e){saveErr(e,s);}})
    .catch(e=>{console.error('[tubes] compressing the save failed',e);})
    .finally(()=>{UI.gzBusy=false;const n=UI.gzNext;UI.gzNext=null;if(n&&n.s===S)gzSave(n.s,n.txt,n.seq);});}
// A compressed save is unpacked before the game boots, so loadSave() stays synchronous for everything else.
async function gzBoot(go){let raw=null;try{raw=localStorage.getItem('sot-save-v1');}catch(e){}
  if(raw&&raw.startsWith(GZ)){try{UI.gzRaw=raw;UI.gzText=await gunzip(raw);}catch(e){console.error('[tubes] unpacking the save failed',e);UI.gzRaw=UI.gzText=null;
    try{localStorage.setItem('sot-save-broken',raw);localStorage.removeItem('sot-save-v1');}catch(e2){}UI.gzBroken=true;}}
  go();}
/* Big networks are mostly customers, and most of a customer record was defaults (#176): no second city, no
   requirements, the normal route, no warnings yet. The save leaves defaults out and sanitize() puts them back, so
   the game after loading is the same; older versions read a missing field as its default too. An alien wave's
   description is rebuilt from its fiber. */
const BIZ_DEF={city2:null,latMax:null,route:'normal',sites:null,slots:0,warned:false,warn60:false};
function packBiz(b){const o={};for(const k in b){const v=b[k];if(v===undefined||BIZ_DEF[k]===v||(k==='reqs'&&Array.isArray(v)&&!v.length)||(k==='pm'&&v===b.mood)||(k==='what'&&b.type==='wwave'&&b.link))continue;o[k]=v;}return o;}
function unpackBiz(b,links){for(const k in BIZ_DEF)if(!(k in b))b[k]=BIZ_DEF[k];if(!('pm' in b)&&b.mood!==undefined)b.pm=b.mood;if(!Array.isArray(b.reqs))b.reqs=[];
  if(b.type==='wwave'&&b.what===undefined){const l=links.get(b.link);b.what=l?wwWhat(l,b.slots||1):'';}return b;}
const packSave=s=>({...s,biz:s.biz.map(packBiz)});
// Out of room (quota) or not allowed to store at all (private window, blocked site data): different advice.
const saveFull=e=>!!e&&(e.name==='QuotaExceededError'||e.name==='NS_ERROR_DOM_QUOTA_REACHED'||e.code===22||e.code===1014);
const saveFailing=()=>!!(UI.saveFail&&UI.saveFail.s===S);
const saveFailMsg=()=>UI.saveFail&&UI.saveFail.full?tr('save.your_network_is_too_big_to'):tr('save.this_browser_is_not_letting_the');
// Save whenever the player might be leaving: tab hidden, page closing or reloading.
addEventListener('pagehide',()=>save(true));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')save(true);else checkUpdate();});
/* Export / import: move a network to another device or keep a backup. The file is the same
   object the autosave writes, wrapped with a little metadata. */
function saveFileName(){const d=new Date().toISOString().slice(0,10),n=(S&&S.name||'network').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'network';return `series-of-tubes-${n}-${d}.json`;}
function exportSave(){if(!S)return;save(true);const blob=new Blob([JSON.stringify({app:'series-of-tubes',version:APP_VERSION,exported:new Date().toISOString(),S:packSave(S)},null,1)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=saveFileName();document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);
  toast(tr('save.save_exported_file_is_in_your',{file:esc(saveFileName())}),'good');}
function parseSave(txt){if(typeof txt!=='string')return {err:tr('save.that_file_is_not_valid_json')};let j;try{j=JSON.parse(txt);}catch(e){return {err:tr('save.that_file_is_not_valid_json')};}
  const s=j&&j.app==='series-of-tubes'&&j.S?j.S:j;
  if(!s||typeof s!=='object'||s.v!==1||typeof s.day!=='number'||typeof s.cash!=='number'||!s.pops||typeof s.pops!=='object'||!Array.isArray(s.links))return {err:tr('save.that_does_not_look_like_a')};
  if(s.lost)return {err:tr('save.that_network_went_bankrupt_it_cannot')};
  for(const c of Object.keys(s.pops))if(!isCity(c))return {err:tr('save.that_save_has_a_pop_in',{city:esc(String(c).slice(0,12))})};
  return {s,ver:j.version||'?',name:String(s.name||tr('common.unnamed_network'))};}
function importFile(file){if(!file)return;if(file.size>8e6){toast(tr('save.that_file_is_too_big_to'),'bad');return;}
  const rd=new FileReader();rd.onload=()=>{const r=parseSave(String(rd.result));if(r.err){toast(tr('save.import_failed_err',{err:esc(r.err)}),'bad');sfx('err');return;}
    UI.importing=r.s;openModal(`<div class="eyebrow">${tr('common.import_a_save')}</div><h2 style="font-size:26px">${tr('save.load_name',{name:esc(r.name)})}</h2><p class="tagline">${esc(dateStr(r.s.day))} · ${tr('save.cash_in_the_bank',{cash:fmt$(r.s.cash)})} · ${trn('save.n_pop',Object.keys(r.s.pops).length)} · ${tr('save.saved_by_v_ver',{ver:esc(r.ver)})}</p>${S&&UI.started&&!S.lost?`<p class="note" style="color:var(--bad)">${tr('save.this_replaces_name_export_it_first',{name:esc(S.name)})}</p>`:''}<div class="btns">${btn(tr('save.load_this_network'),'importGo',{},'pink big')}${btn(tr('common.cancel'),UI.started?'closeModal':'helpClose',{},'ghost big')}</div>`);};
  rd.readAsText(file);}
function loadSave(){try{let t=localStorage.getItem('sot-save-v1');if(t&&t.startsWith(GZ))t=t===UI.gzRaw?UI.gzText:null;if(t){const s=JSON.parse(t);if(s&&s.v===1&&!s.lost)return s;}}catch(e){}return null;}

