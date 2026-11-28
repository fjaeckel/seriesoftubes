/* ---------- toasts & modals ---------- */
/* One toast at a time (#498). A busy network says a lot at once, and stacks of one, two or three toasts covered the
   map on a phone. Now one place shows the current notice and the rest wait behind it, counted on it (1/3 ›: a tap
   shows the next). Trouble and anything with a button go ahead of chatter; chatter moves on sooner while others wait;
   when too many wait, the oldest chatter is left to the NOC log, which keeps every notice anyway. The same notice
   again bumps a count instead of queueing a copy, and a toast whose notice points somewhere goes there when tapped
   (the same place its line in the NOC log opens). */
const TOAST_WAIT=8;
const toastKey=h=>String(h).replace(/<[^>]*>/g,' ').replace(/[\d.,]+/g,'#').replace(/\s+/g,' ').trim();
// Says the toast it showed, or null when the notice only went to the NOC log.
function toast(html,kind='',actions=[],open=null){
  // What the day announces goes by its topic's setting (NCAT, 30-settings.js); replies to the player's taps always show.
  const c=UI.tick?(NCAT||'other'):null;let paused=false;
  if(c&&kind==='bad'&&ncPause(c)&&autoPause()){paused=true;html+=`<br><b>${tr('common.game_paused')}</b>`;actions=actions.concat([resumeAct()]);}
  const e=S?logNote(html,kind,actions,open):null;
  if(c&&!paused){const lv=ncLevel(c);if(lv===0||(lv===1&&kind!=='bad'&&kind!=='goal'))return null;}
  // A Hyperscaler's day pops up only decisions (a button) and milestones (38-hyper-director.js).
  if(kind!=='goal'&&!actions.length&&hsQuiet())return null;
  // The answer to the player's own tap (a full port, no money) shows at once, ahead of the day's queue (#505).
  return toastShow(html,kind,actions,e,0,c,paused||(!c&&!!UI.tap));}
// Runs what a tap, a typed value or a picked option asked for, so its toasts know they answer the player (#505).
function tapRun(fn){const was=UI.tap;UI.tap=true;try{return fn();}finally{UI.tap=was;}}
// Once you have made Tier 1, conference news (#101) and de-peerings are routine: they are kept in the NOC log like any
// notice, and nothing pops up. Says whether it popped up, for the sound that goes with it.
const t1Quiet=()=>!!(S&&S.done&&S.done.t1!==undefined);
function toastT1(html,kind='',actions=[],open=null){if(!t1Quiet()&&!hsQuiet())return !!toast(html,kind,actions,open);if(S)logNote(html,kind,actions,open);return false;}
const toastCur=(box=$('toasts'))=>box?box.querySelector('.toast:not(.tq)'):null;
const toastWaiting=(box=$('toasts'))=>box?[...box.querySelectorAll('.toast.tq')]:[];
// The toast itself, for a notice already in the log (e) or one that is not logged at all (Undo). ms: a toast that
// matters now and only for a while (Undo, a confirmation) shows at once, for that long. cat: the topic of a notice
// the day sent, which gets a button to only log that topic from now on. now: shows at once (it stopped the clock).
function toastShow(html,kind='',actions=[],e=null,ms=0,cat=null,now=false){
  const box=$('toasts');if(!box)return null;const key=kind+'|'+toastKey(html),imp=kind==='bad'||actions.length>0;
  let el=[...box.querySelectorAll('.toast')].find(t=>t.dataset.key===key);const old=!!el,n=old?(+el.dataset.n||1)+1:1;
  if(!el){el=document.createElement('div');el.dataset.key=key;}
  const keep=['tq','undo','btoast'].filter(k=>el.classList.contains(k));
  el.className='toast '+kind+(imp?' imp':'');for(const k of keep)el.classList.add(k);el.dataset.n=n;el.dataset.ms=ms||'';el.dataset.cat=cat||'';
  // #toasts reads new toasts aloud (aria-live): the same notice again only bumps its ×N, silently.
  if(n>1)el.setAttribute('aria-live','off');else el.removeAttribute('aria-live');el.dataset.lid=e&&e.id?e.id:'';el.style.opacity='';el.style.transition='';
  const mute=cat?`<button class="b sm ghost tmute" data-act="ncSet" data-args='${JSON.stringify({v:'m:'+cat})}' title="${tr('toasts.nc_mute')}" aria-label="${esc(tr('toasts.nc_mute_topic',{topic:ncName(cat)}))}">🔕</button>`:'';
  el.innerHTML=`<div class="tx">${n>1?`<span class="tag st tn">×${n}</span> `:''}${html}</div>${actions.map(a=>btn(a.l,a.act,a.args,'sm')).join('')}${mute}<span class="tnav"></span>`;
  const go=e&&e.o&&!(e.o.a==='tab'&&e.o.v==='noc');el.classList.toggle('tgo',!!go);
  if(go){el.dataset.act='toastGo';el.dataset.args=JSON.stringify({id:e.id});el.setAttribute('role','button');}else{delete el.dataset.act;delete el.dataset.args;el.removeAttribute('role');}
  const cur=toastCur(box);
  if(old&&cur===el)toastUp(el);// showing already: its new count, and its time starts again
  else if(!old||now){
    // Now: nothing showing, a toast that matters only now, or trouble over chatter (which waits again, first in line).
    if(!cur||ms||now||(imp&&!cur.classList.contains('imp')&&!cur.dataset.ms)){if(cur){clearTimeout(cur._t);cur.classList.add('tq');}if(old)box.prepend(el);toastUp(el);}
    else{el.classList.add('tq');const w=toastWaiting(box),after=imp?w.filter(t=>t.classList.contains('imp')).pop()||cur:w[w.length-1]||cur;after.after(el);
      // Too many waiting: the oldest chatter is left to the NOC log.
      const ws=toastWaiting(box);if(ws.length>TOAST_WAIT){const x=ws.find(t=>!t.classList.contains('imp'))||ws[0];x.remove();}
      // Chatter showing moves on soon when something waits behind it.
      if(!cur.classList.contains('imp')&&!cur.dataset.ms&&(cur._end||0)-performance.now()>2000){clearTimeout(cur._t);cur._end=performance.now()+2000;cur._t=setTimeout(()=>toastFade(cur),2000);}}}
  toastNav(box);return el;
}
// Show el now, at the front, for its time.
function toastUp(el){const box=$('toasts');el.classList.remove('tq');el.style.opacity='';el.style.transition='';box.prepend(el);el.dataset.born=performance.now();
  const imp=el.classList.contains('imp'),k=el.classList.contains('goal'),wait=toastWaiting(box).length;let t=+el.dataset.ms||(imp?9000:k?6500:4500);
  if(wait&&!imp&&!el.dataset.ms)t=Math.min(t,3000);
  clearTimeout(el._t);el._end=performance.now()+t;el._t=setTimeout(()=>toastFade(el),t);}
function toastFade(el){el.style.transition='opacity .4s';el.style.opacity=0;clearTimeout(el._t);el._t=setTimeout(()=>toastDrop(el),400);}
// Put a toast away (faded out, tapped, answered): the next one waiting takes its place.
function toastDrop(el){if(!el)return;clearTimeout(el._t);const box=$('toasts'),was=!el.classList.contains('tq');el.remove();if(el.classList.contains('undo'))UI.undo=null;
  if(was&&box){const nx=toastWaiting(box)[0];if(nx)toastUp(nx);}toastNav(box);}
// Every toast away but an Undo in its few seconds (the NOC log has them all).
function toastClear(){const box=$('toasts');if(!box)return;for(const t of box.querySelectorAll('.toast:not(.undo)')){clearTimeout(t._t);t.remove();}
  if(!toastCur(box)){const nx=toastWaiting(box)[0];if(nx)toastUp(nx);}toastNav(box);}
// The counter on the toast showing: where it is among those waiting, and a tap for the next one.
function toastNav(box=$('toasts')){if(!box)return;for(const s of box.querySelectorAll('.toast.tq .tnav'))s.innerHTML='';
  const cur=toastCur(box),n=toastWaiting(box).length;if(!cur)return;const s=cur.querySelector('.tnav');if(!s)return;
  s.innerHTML=n?`<button class="tnext" data-act="toastNext" aria-label="${esc(trn('toasts.n_waiting',n))}">1/${n+1} ›</button>`:'';}
