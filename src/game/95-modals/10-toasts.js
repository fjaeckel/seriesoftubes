/* ---------- toasts & modals ---------- */
/* A busy network says a lot at once. Only the newest few toasts show (two on a phone, one with a sheet up or on its side,
   three on a bigger screen); the ones pushed off are counted in a "+N" pill that opens the NOC log, where every notice is kept anyway.
   The same notice again bumps a count on the toast already showing instead of stacking a copy, trouble and anything with a
   button stays up longer than chatter and is the last to be pushed off, and a toast whose notice points somewhere goes there
   when tapped (the same place its line in the NOC log opens). */
const toastMax=()=>innerHeight<=500&&innerWidth>innerHeight?1:innerWidth<760?(innerHeight>innerWidth&&document.body.classList.contains('sheet-open')?1:2):3;
const toastKey=h=>String(h).replace(/<[^>]*>/g,' ').replace(/[\d.,]+/g,'#').replace(/\s+/g,' ').trim();
function toast(html,kind='',actions=[],open=null){
  const e=S?logNote(html,kind,actions,open):null;
  // Quiet notifications: what the day announces pops up only for trouble and milestones; the rest stays in the NOC log.
  if(UI.tick&&kind!=='bad'&&kind!=='goal'&&quietOn())return;
  toastShow(html,kind,actions,e);}
// Once you have made Tier 1, conference news (#101) and de-peerings are routine: they are kept in the NOC log like any
// notice, and nothing pops up. Says whether it popped up, for the sound that goes with it.
const t1Quiet=()=>!!(S&&S.done&&S.done.t1!==undefined);
function toastT1(html,kind='',actions=[],open=null){if(!t1Quiet()){toast(html,kind,actions,open);return true;}if(S)logNote(html,kind,actions,open);return false;}
// The toast itself, for a notice already in the log (e) or one that is not logged at all (Undo).
function toastShow(html,kind='',actions=[],e=null,ms=0){
  const box=$('toasts'),key=kind+'|'+toastKey(html),imp=kind==='bad'||actions.length>0;
  let el=[...box.querySelectorAll('.toast')].find(t=>t.dataset.key===key);const n=el?(+el.dataset.n||1)+1:1;
  if(!el){el=document.createElement('div');el.dataset.key=key;}
  el.className='toast '+kind+(imp?' imp':'');el.dataset.n=n;
  // #toasts reads new toasts aloud (aria-live): the same notice again only bumps its ×N, silently.
  if(n>1)el.setAttribute('aria-live','off');else el.removeAttribute('aria-live');el.dataset.lid=e&&e.id?e.id:'';el.dataset.born=performance.now();el.style.opacity='';el.style.transition='';
  el.innerHTML=`<div class="tx">${n>1?`<span class="tag st tn">×${n}</span> `:''}${html}</div>${actions.map(a=>btn(a.l,a.act,a.args,'sm')).join('')}`;
  const go=e&&e.o&&!(e.o.a==='tab'&&e.o.v==='noc');el.classList.toggle('tgo',!!go);
  if(go){el.dataset.act='toastGo';el.dataset.args=JSON.stringify({id:e.id});el.setAttribute('role','button');}else{delete el.dataset.act;delete el.dataset.args;el.removeAttribute('role');}
  box.prepend(el);clearTimeout(el._t);el._t=setTimeout(()=>toastFade(el),ms||(imp?9000:kind==='goal'?6500:4500));
  toastTrim(box);return el;
}
function toastFade(el){el.style.transition='opacity .4s';el.style.opacity=0;el._t=setTimeout(()=>{el.remove();if(el.classList.contains('undo'))UI.undo=null;toastPill();},400);}
// Too many at once: chatter goes first, oldest first; what was pushed off is counted on the pill.
// The pill counts the log's lines that were pushed off (ids in UI.toastOff), so it never promises more than the log holds.
function toastOut(t){t.remove();clearTimeout(t._t);if(t.dataset.lid)(UI.toastOff=UI.toastOff||new Set()).add(t.dataset.lid);}
// An Undo toast is never pushed off (its few seconds are the point); it takes one of the places while it shows.
function toastTrim(box){const q=()=>[...box.querySelectorAll('.toast:not(.undo)')],ts=q(),max=Math.max(0,toastMax()-box.querySelectorAll('.toast.undo').length);let over=ts.length-max;
  for(const t of ts.slice().reverse()){if(over<=0)break;if(!t.classList.contains('imp')&&t!==ts[0]){toastOut(t);over--;}}
  for(const t of q().slice(max))toastOut(t);
  toastPill();}
function toastPill(){const box=$('toasts');if(!box)return;let p=box.querySelector('.tmore');
  if(!box.querySelector('.toast'))UI.toastOff=null;const off=UI.toastOff,n=S&&off?(S.log||[]).filter(e=>off.has(e.id)).length:0;
  if(!n){if(p)p.remove();return;}
  if(!p){p=document.createElement('button');p.className='tmore';p.dataset.act='toastsMore';p.setAttribute('aria-live','off');}
  p.textContent=trn('toasts.n_more_in_the_noc_log',n);box.appendChild(p);}
