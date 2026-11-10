/* ---------- moving a network to another device (#263) ----------
   No server, no account: the network itself travels, gzipped, in the fragment of a link (#sot1.<id>.<i>.<n>.<data>),
   which browsers never send to any server. One link carries all of it, to copy or share; QR codes carry it in parts a
   phone's own camera app opens one after another. The receiving page collects the parts in its storage, in any order,
   and imports the network like a save file once they are all there. */
const XFER_K='sot-xfer',XFER_RE=/sot1\.([a-z0-9]{3,8})\.(\d{1,3})\.(\d{1,3})\.([A-Za-z0-9_-]+)/,XFER_CHUNK=900,XFER_MAX=200,XFER_DAY=864e5;
// Taken out of the address bar before anything else can read it (the stats counter only loads after this script):
// a network in a link belongs to the player, and a reload must not import it again.
const XFER_HASH=(()=>{try{const h=location.hash||'';if(!h.startsWith('#sot1.'))return '';history.replaceState(null,'',location.pathname+location.search);return h.slice(1);}catch(e){return '';}})();
const b64u=u=>b64(u).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64u=t=>unb64(t.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((t.length+3)%4));
const xferBase=()=>/^https?:$/.test(location.protocol)?location.origin+location.pathname:'https://seriesoftub.es/';
// A network's save text: the one playing now (saved first), or any other straight from storage.
function xferText(id){if(id===UI.slot&&S&&!pzOn()){save(true);return Promise.resolve(JSON.stringify(packSave(S)));}
  const raw=slotRaw(id);if(raw==null)return Promise.reject(new Error('no save'));return raw.startsWith(GZ)?gunzip(raw):Promise.resolve(raw);}
/* The link carries everything. The codes leave out the charts' history and the news log: more than half of a played
   network, and only ever shown, never played with (the traffic odometer keeps its own count). A year-old network
   takes 3 codes instead of 9; its charts start again on the other device, and the import says so. */
const xferGz=async(t,lean)=>b64u(await gzPipe(new TextEncoder().encode(`{"app":"series-of-tubes","version":${JSON.stringify(APP_VERSION)},${lean?'"lean":1,':''}"S":${t}}`),new CompressionStream('gzip')));
async function xferPack(id){const e=slotIdx().find(x=>x.id===id),t=await xferText(id),o=JSON.parse(t);
  const d=await xferGz(t),c=await xferGz(JSON.stringify({...o,hist:[],log:[]}),true);
  const k=Math.floor(Math.random()*36**5).toString(36).padStart(5,'0'),n=Math.ceil(c.length/XFER_CHUNK),base=xferBase()+'#sot1.';
  // Codes and link are two transfers: a code never completes a set with a piece of the link.
  const parts=n>XFER_MAX?[]:Array.from({length:n},(_,i)=>`${base}${k}.${i}.${n}.${c.slice(i*XFER_CHUNK,(i+1)*XFER_CHUNK)}`);
  return {name:e?e.name:o.name,link:`${base}${k}.0.1.${d}`,parts};}
// Parts that arrived so far (one transfer at a time; a day old, they are forgotten).
function xferStore(){let s=null;try{s=JSON.parse(localStorage.getItem(XFER_K)||'null');}catch(e){}
  if(!s||typeof s!=='object'||typeof s.id!=='string'||!(s.n>1&&s.n<=999)||!s.p||typeof s.p!=='object'||!(Date.now()-s.at<XFER_DAY))return null;
  for(const k in s.p)if(!(+k>=0&&+k<s.n)||typeof s.p[k]!=='string')return null;return s;}
function xferClear(){try{localStorage.removeItem(XFER_K);}catch(e){}}
// A link (or just its fragment, or text with one in it): one part, or a whole network.
function xferTake(h){const m=XFER_RE.exec(String(h||''));
  if(!m){toast(tr('transfer.that_is_not_a_transfer_link'),'bad');sfx('err');return false;}
  const id=m[1],i=+m[2],n=+m[3],d=m[4];if(!(n>=1&&i<n)){toast(tr('transfer.that_link_is_incomplete_or_damaged'),'bad');sfx('err');return false;}
  if(n===1){xferOpen(d);return true;}
  let s=xferStore();if(!s||s.id!==id||s.n!==n)s={id,n,p:{},at:Date.now()};s.p[i]=d;
  if(Object.keys(s.p).length===n){xferClear();xferOpen(Array.from({length:n},(_,k)=>s.p[k]).join(''));return true;}
  try{localStorage.setItem(XFER_K,JSON.stringify(s));}catch(e){}
  openModal(xferWaitHtml(s));sfx('click');return true;}
function xferOpen(d){if(!gzOk()){toast(tr('transfer.this_browser_cannot_pack_networks_into'),'bad');return;}
  let u=null;try{u=unb64u(d);}catch(e){}
  const bad=()=>{toast(tr('transfer.that_link_is_incomplete_or_damaged'),'bad');sfx('err');};if(!u){bad();return;}
  gzPipe(u,new DecompressionStream('gzip')).then(b=>{const r=parseSave(new TextDecoder().decode(b));
    if(r.err){toast(tr('save.import_failed_err',{err:esc(r.err)}),'bad');sfx('err');return;}importAsk(r);track('xfer_in');},bad);}
// Another window got a part (or finished): the one showing the progress follows.
addEventListener('storage',e=>{if(e.key!==XFER_K||!$('xferWait'))return;const s=xferStore();if(s)openModal(xferWaitHtml(s));else ACT.helpClose();});
addEventListener('hashchange',()=>{const h=location.hash||'';if(!h.startsWith('#sot1.'))return;try{history.replaceState(null,'',location.pathname+location.search);}catch(e){}xferTake(h.slice(1));});
// After boot: a page opened from a transfer link takes its part.
function xferBoot(){if(XFER_HASH)xferTake(XFER_HASH);}
