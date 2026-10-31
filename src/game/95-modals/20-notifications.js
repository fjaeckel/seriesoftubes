/* ---------- notifications: the NOC keeps the last ten minutes, readable and openable ---------- */
const LOG_KEEP=60,LOG_MS=10*60*1000,LOG_KINDS=['','good','bad','goal'],LOG_OPEN=['city','link','cust','bank','tab','ops'],LOG_TABS=['goals','deals','noc','nets'];
// What a notification is about, from the button it came with: the same place its own button would take you.
function openOf(actions){for(const a of actions||[]){const g=a.args||{};
  if(a.act==='focusCity'&&isCity(g.city))return {a:'city',v:g.city};if(a.act==='selLink'&&g.id)return {a:'link',v:String(g.id)};
  if(a.act==='custGo'&&g.id)return {a:'cust',v:String(g.id)};if(a.act==='bank')return {a:'bank'};if(a.act==='leftTab'&&LOG_TABS.includes(g.t))return {a:'tab',v:g.t};}return null;}
// Otherwise from the text: a link between two of your cities it names, or the first of your cities it names.
function openFromText(t){const cs=Object.keys(S.pops).map(c=>[c,t.indexOf(CITY[c].name)]).filter(([,i])=>i>=0).sort((a,b)=>a[1]-b[1]).map(([c])=>c);
  if(cs.length>=2){const l=S.links.find(l=>(l.a===cs[0]&&l.b===cs[1])||(l.a===cs[1]&&l.b===cs[0]));if(l)return {a:'link',v:l.id};}return cs.length?{a:'city',v:cs[0]}:null;}
// An incident points at a link, a trench, a city, or a port in a city.
function incOpen(i){const r=i&&i.ref;if(typeof r!=='string')return null;const l=S.links.find(l=>l.id===r||l.trench===r);if(l)return {a:'link',v:l.id};
  if(isCity(r))return {a:'city',v:r};const x=S.transit.find(t=>t.id===r)||S.pni.find(t=>t.id===r);if(x)return {a:'city',v:x.city};if(isIx(r)&&isCity(ixCity(r)))return {a:'city',v:ixCity(r)};return null;}
function logNote(html,kind,actions,open){S.log=S.log||[];const tmp=document.createElement('div');tmp.innerHTML=html.replace(/<br>/g,' ');const t=tmp.textContent.trim();
  const b=tmp.firstElementChild&&tmp.firstElementChild.tagName==='B'&&html.startsWith('<b>')?tmp.firstElementChild.textContent.trim():'';
  const o=open||openOf(actions)||openFromText(t),now=Date.now(),key=(b||t).replace(/[\d.,]+/g,'#'),last=S.log[0];
  // The same notice again within a minute folds into the last one, with a count: twenty "new sessions" read as one line.
  if(last&&last.at&&now-last.at<60000&&last.k===kind&&(last.h||last.t).replace(/[\d.,]+/g,'#')===key&&JSON.stringify(last.o||null)===JSON.stringify(o)){last.n=(last.n||1)+1;last.t=t;last.h=b;last.at=now;last.d=S.day;return;}
  S.log.unshift({id:uid(),d:S.day,t,h:b,k:kind,at:now,o,n:1});if(S.log.length>LOG_KEEP)S.log.length=LOG_KEEP;}
const logRecent=()=>{const now=Date.now();return (S.log||[]).filter(e=>e.at&&now-e.at<LOG_MS);};
const logUnread=()=>logRecent().filter(e=>e.at>(UI.logSeen||0)).length;
const agoStr=at=>{const m=Math.floor((Date.now()-at)/60000);return m<1?tr('common.just_now'):trn('notifications.n_min_ago',m);};
// The list is the NOC tab: a notice that would open the NOC gets no Open button, since it would do nothing (#226).
function logSection(){const L=logRecent(),MAX=5,all=UI.logAll,sh=all?L:L.slice(0,MAX);
  let h=`<h3 style="font-size:15px;margin:10px 0 4px">${tr('common.notifications')} <span class="meta">${tr('notifications.last_10_minutes')}</span></h3>`;
  if(!L.length)return h+`<p class="empty">${tr('notifications.nothing_in_the_last_10_minutes')}</p>`;
  h+=sh.map(e=>{const body=e.h&&e.t.startsWith(e.h)?e.t.slice(e.h.length).trim():e.t;
    return `<div class="row note ${e.k||'info'}"><span class="ndot" aria-hidden="true"></span><div class="grow">${e.h?`<div class="nm">${esc(e.h)}${e.n>1?` <span class="tag st">×${e.n}</span>`:''}</div>`:''}${body?`<div class="meta nbody">${esc(body)}${!e.h&&e.n>1?` <span class="tag st">×${e.n}</span>`:''}</div>`:''}<div class="meta">${agoStr(e.at)} · ${dateStr(e.d)}</div></div>${e.o&&!(e.o.a==='tab'&&e.o.v==='noc')?btn(tr('common.open'),'logOpen',{id:e.id},'ghost sm'):''}</div>`;}).join('');
  if(L.length>MAX)h+=`<div class="btns">${btn(all?tr('common.show_fewer'):tr('notifications.show_all_n',{n:L.length}),'logAll',{},'ghost sm')}</div>`;
  return h;}
const markLayer=()=>{UI.layerAt=performance.now();};
// Which layers are open: when that changes (a sheet, the dashboard, the bank, a selection), taps in flight are void.
function checkLayer(){const q=id=>{const e=$(id);return e?(e.hidden?0:1):0;},sig=[q('modal'),q('dash'),q('bankBox'),UI.leftOpen?1:0,UI.left||'',UI.sel?UI.sel.type+UI.sel.id:'',UI.tab||''].join('|');if(sig!==UI._layer){UI._layer=sig;markLayer();}}
