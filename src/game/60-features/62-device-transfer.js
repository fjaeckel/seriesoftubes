/* ---------- moving a network to another device (#263) ----------
   No server, no account. The save file goes through the device's own share sheet (AirDrop, Quick Share, a chat with
   yourself, email), whatever its size, and opens on the other device with "Import a save". For copy and paste
   (a synced clipboard, a note to self) the network also fits in a link: gzipped, in the fragment (#sot1.<id>.0.1.<data>),
   which browsers never send to any server. Opening the link, or pasting it, imports the network like a save file. */
const XFER_RE=/sot1\.([a-z0-9]{3,8})\.0\.1\.([A-Za-z0-9_-]+)/;
// Taken out of the address bar before anything else can read it (the stats counter only loads after this script):
// a network in a link belongs to the player, and a reload must not import it again.
const XFER_HASH=(()=>{try{const h=location.hash||'';if(!h.startsWith('#sot1.'))return '';history.replaceState(null,'',location.pathname+location.search);return h.slice(1);}catch(e){return '';}})();
const b64u=u=>b64(u).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64u=t=>unb64(t.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((t.length+3)%4));
const xferBase=()=>/^https?:$/.test(location.protocol)?location.origin+location.pathname:'https://seriesoftub.es/';
// A network's save text: the one playing now (saved first), or any other straight from storage.
// Like every ordinary export, never with the multiplayer private key (fedPublic).
function xferText(id){if(id===UI.slot&&S&&!pzOn()){save(true);return Promise.resolve(JSON.stringify(fedPublic(packSave(S))));}
  const raw=slotRaw(id);if(raw==null)return Promise.reject(new Error('no save'));return (raw.startsWith(GZ)?gunzip(raw):Promise.resolve(raw)).then(fedPublicText);}
/* Everything is ready before the sheet opens: browsers only open a share sheet straight from a tap, not after waiting
   for compression. Chromium shares only some file types, and not .json (Safari does): there the same file is a .txt,
   which "Import a save" takes too. */
async function xferPack(id){const e=slotIdx().find(x=>x.id===id),t=await xferText(id),name=e&&e.name||S&&S.name;
  const w=`{"app":"series-of-tubes","version":${JSON.stringify(APP_VERSION)},"exported":"${new Date().toISOString()}","S":${t}}`;
  let file=null;try{const fn=saveFileName(name),ok=f=>!!navigator.canShare&&navigator.canShare({files:[f]});
    file=new File([w],fn,{type:'application/json'});if(!ok(file)){file=new File([w],fn.replace(/\.json$/,'.txt'),{type:'text/plain'});if(!ok(file))file=null;}}catch(err){file=null;}
  let link=null;if(gzOk()){const k=Math.floor(Math.random()*36**5).toString(36).padStart(5,'0');
    link=`${xferBase()}#sot1.${k}.0.1.${b64u(await gzPipe(new TextEncoder().encode(w),new CompressionStream('gzip')))}`;}
  return {id,name,file,link};}
// A link (or just its fragment, or text with one in it).
function xferTake(h){const m=XFER_RE.exec(String(h||''));
  if(!m){toast(tr('transfer.that_is_not_a_transfer_link'),'bad');sfx('err');return false;}
  xferOpen(m[2]);return true;}
function xferOpen(d){if(!gzOk()){toast(tr('transfer.this_browser_cannot_open_transfer_links'),'bad');return;}
  let u=null;try{u=unb64u(d);}catch(e){}
  const bad=()=>{toast(tr('transfer.that_link_is_incomplete_or_damaged'),'bad');sfx('err');};if(!u){bad();return;}
  gzPipe(u,new DecompressionStream('gzip')).then(b=>{const r=parseSave(new TextDecoder().decode(b));
    if(r.err){toast(tr('save.import_failed_err',{err:esc(r.err)}),'bad');sfx('err');return;}importAsk(r);track('xfer_in');},bad);}
addEventListener('hashchange',()=>{const h=location.hash||'';if(!h.startsWith('#sot1.'))return;try{history.replaceState(null,'',location.pathname+location.search);}catch(e){}xferTake(h.slice(1));});
// After boot: a page opened from a transfer link imports it.
function xferBoot(){if(XFER_HASH)xferTake(XFER_HASH);}
