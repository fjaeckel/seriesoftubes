/* ---------- click delegation ---------- */
let pressing=false;
document.addEventListener('pointerdown',e=>{if(e.target.closest('#panel,#left,#dash,#bankBox,#modal,#tabbar,#toasts,#pzBox'))pressing=true;});
addEventListener('pointerup',()=>setTimeout(()=>pressing=false,0));
addEventListener('pointercancel',()=>{pressing=false;});addEventListener('blur',()=>{pressing=false;});
document.addEventListener('change',e=>{const el=e.target.closest('[data-chg]');if(!el||(!S&&!['langSet','pickHome'].includes(el.dataset.chg)))return;const fn=ACT[el.dataset.chg];if(fn)fn({v:el.value});});
/* Taps that land on the wrong thing (#44): a real tap only fires the button it went down on, never something that
   appeared or moved under the finger, nothing behind a menu that opened or closed mid-tap, and no toast button in
   the first half second after the toast popped up. Synthetic clicks (keyboard, tests) are not affected. */
let PD={t:0,b:null};
document.addEventListener('pointerdown',e=>{PD={t:performance.now(),b:e.target.closest('[data-act]')};},true);
function tapOk(e,b){if(!e.isTrusted||!PD.t||e.detail===0)return true;const now=performance.now();if(now-PD.t>4000)return true;
  if(PD.b!==b)return false;if((UI.layerAt||0)>PD.t)return false;const ts=b.closest('.toast');if(ts&&PD.t-(+ts.dataset.born||0)<500)return false;return true;}
document.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b||b.disabled)return;if(!$('modal').hidden&&!b.closest('#modal'))return;if(!tapOk(e,b))return;audioInit();const fn=ACT[b.dataset.act];if(!fn)return;if(!S&&!['start','randomName','pickStart','cont','help','helpClose','newgame','mute','animSet','soundSet','langSet','closeModal','speed','bankClose','whatsNewShow','updateNow','updateLater','importPick','importGo','modeSet','presetSet','chaosSet','puzzleDoor','puzzleMenu','pzStart','pzArStart','pzWeekly','scenarios','startScn','startWeekly','settings','settingsClose','prefSet','vpSet','install','pitchSkip','slotMenu','slotExport','slotDel','slotDelGo','slotBack','slotSwitch','slotTake','slotSpace','toTitle'].includes(b.dataset.act))return;let a={};try{a=JSON.parse(b.dataset.args||'{}');}catch(_){}fn(a);});

