/* ---------- toasts & modals ---------- */
function toast(html,kind='',actions=[],open=null){
  if(S)logNote(html,kind,actions,open);
  // Quiet notifications: what the day announces pops up only for trouble and milestones; the rest stays in the NOC log.
  if(UI.tick&&kind!=='bad'&&kind!=='goal'&&quietOn())return;
  const el=document.createElement('div');el.className='toast '+kind;el.dataset.born=performance.now();
  el.innerHTML=`<div class="tx">${html}</div>${actions.map(a=>btn(a.l,a.act,a.args,'sm')).join('')}`;
  const box=$('toasts');box.prepend(el);const max=innerWidth<760?2:3;while(box.children.length>max)box.lastChild.remove();
  setTimeout(()=>{el.style.transition='opacity .4s';el.style.opacity=0;setTimeout(()=>el.remove(),400);},actions.length?8000:4500);
}
