/* ---------- Undo instead of "are you sure?" ----------
   A removal that costs nothing and can be put back exactly (cancelling a transit port or a PNI: no fee, no refund, no
   customer lost, nothing that waits for a day) acts on the first tap, and a toast offers Undo for a few seconds. The
   snapshot is the few parts of S the action changes, as shallow copies taken before it (a removal does not change the
   objects in them); Undo puts them back while nothing else has changed them and the day has not moved on. A removal that
   finished a goal or a badge, or moved money, gets no Undo. Nothing of it is saved: it lives in UI.undo, and a new day,
   another network or the toast going away ends it. Anything that costs money, pays a penalty, loses a customer or cannot
   be put back exactly keeps its two taps (UI.confirm). */
const UNDO_ACTS=new Set(['cancelTransit','cancelPni']),UNDO_MS=6000;
const undoCopy=v=>Array.isArray(v)?v.slice():v&&typeof v==='object'?{...v}:v;
const undoSame=(x,y)=>{if(Array.isArray(x))return Array.isArray(y)&&x.length===y.length&&x.every((v,i)=>v===y[i]);
  if(x&&typeof x==='object'){if(!y||typeof y!=='object')return false;const a=Object.keys(x);return a.length===Object.keys(y).length&&a.every(k=>x[k]===y[k]);}return x===y;};
const undoMarks=()=>Object.keys(S.done||{}).length+':'+Object.keys(S.ach||{}).length+':'+S.cash+':'+(S.won?1:0);
const undoLive=u=>!!u&&!!S&&u.S===S&&u.day===S.day&&u.keys.every((k,i)=>undoSame(S[k],u.a[i]));
// Run fn (the removal), then offer Undo with html as the toast's text.
function undoDo(fn,keys,html){if(!S)return fn();const u={S,day:S.day,keys,b:keys.map(k=>undoCopy(S[k])),g:undoMarks()};fn();
  if(!S||S!==u.S||S.day!==u.day||undoMarks()!==u.g)return;
  u.a=keys.map(k=>undoCopy(S[k]));if(u.a.every((v,i)=>undoSame(v,u.b[i])))return;
  undoEnd();UI.undo=u;const el=toastShow(html,'',[{l:'↶ '+tr('puzzles.undo'),act:'undo',args:{}}],null,UNDO_MS);if(el)el.classList.add('undo','imp');
  // The day moving on (or another network) ends it at once, toast and all.
  u.w=setInterval(()=>{if(UI.undo!==u||!undoLive(u))undoEnd(u);},300);}
function undoEnd(u=UI.undo){if(!u)return;clearInterval(u.w);if(UI.undo===u)UI.undo=null;for(const t of document.querySelectorAll('#toasts .toast.undo'))t.remove();toastPill();}
Object.assign(ACT,{
 undo:()=>{const u=UI.undo;if(!u)return;const ok=undoLive(u);undoEnd(u);if(!ok){toast(tr('undo.too_late'),'');return;}
   u.keys.forEach((k,i)=>{S[k]=undoCopy(u.b[i]);});sfx('click');after();},
 // A toast that points somewhere: tapping it goes there, as its line in the NOC log would, and puts it away.
 toastGo:({id})=>{if(!S)return;for(const t of document.querySelectorAll('#toasts .toast.tgo'))if(t.dataset.args===JSON.stringify({id}))t.remove();toastPill();ACT.logOpen({id});},
 // The "+N" pill: every notice is in the NOC log; open it there, all of it.
 toastsMore:()=>{if(!S)return;UI.toastOff=null;for(const t of document.querySelectorAll('#toasts .toast:not(.undo)'))t.remove();toastPill();$('dash').hidden=true;closeModal();
   UI.logAll=true;if(isPhone()){UI.sel=null;renderPanel();}ACT.leftTab({t:'noc'});const h=$('noteLog');if(h&&h.scrollIntoView)h.scrollIntoView({block:'start'});},
});
