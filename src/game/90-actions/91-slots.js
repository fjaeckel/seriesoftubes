Object.assign(ACT,{
 // Continue a network from the list (or the newest one).
 cont:({id}={})=>{if(!slotOkId(id)){const t=slotTop(slotIdx(true));if(!t)return;id=t.id;}
   if(id===UI.slot&&S&&!pzOn()){UI.started=true;closeModal();renderAll();return;}
   slotOpen(id,false,()=>track('game_continue',true));},
 // Back to the title with this network kept and saved.
 toTitle:()=>{if(pzOn()){pzLeave();}slotLeave();gameClear();showTitle();},
 slotBack:()=>{if(S&&UI.started)closeModal();else showTitle();},
 slotMenu:({id})=>{const h=slotMenuHtml(id);if(h)openModal(h);},
 slotExport:({id})=>exportSlot(id),
 slotDel:({id,back})=>{const e=slotIdx().find(x=>x.id===id);if(!e)return;
   openModal(`<h2 style="font-size:26px">${tr('slots.delete_name',{name:esc(e.name||tr('common.unnamed_network'))})}</h2><p class="tagline">${tr('game_and_settings.name_and_everything_it_owns_will',{name:esc(e.name||tr('common.unnamed_network'))})}</p>${slotBusy(id)?`<p class="note" style="color:var(--bad)">${tr('slots.it_is_open_in_another_window')}</p>`:''}<div class="btns">${btn(tr('slots.delete_forever'),'slotDelGo',{id,back},'red big')}${btn(tr('slots.keep_it'),back==='space'?'slotSpace':'slotBack',{},'ghost big')}</div>`);},
 slotDelGo:({id,back})=>{if(!slotIdx().some(e=>e.id===id))return;
   if(id===UI.slot){ACT.newgame();return;}
   slotDrop(id);try{BC&&BC.postMessage({t:'gone',id});}catch(e){}sfx('click');
   if(back==='space')openModal(slotSpaceHtml());else showTitle();},
 slotSpace:()=>openModal(slotSpaceHtml()),
 // The other window cannot be brought forward from here; it says hello when the player gets there.
 slotSwitch:({id})=>{try{BC&&BC.postMessage({t:'focus',id});}catch(e){}const e=slotIdx().find(x=>x.id===id);showTitle();toast(tr('slots.name_is_waiting_in_your_other',{name:esc(e&&e.name||'')}),'goal');},
 // Ask the other window to save and step aside, then open it here. Without an answer (it is frozen, or the browser has
 // no BroadcastChannel) it is taken anyway after a moment: the other window stops writing the moment it notices.
 slotTake:({id})=>{if(!slotOkId(id))return;const w=SLOT.wait={id,go:()=>{if(SLOT.wait!==w)return;SLOT.wait=null;clearTimeout(w.t);slotOpen(id,true);}};
   w.t=setTimeout(w.go,BC?1500:0);try{if(BC)BC.postMessage({t:'take',id});}catch(e){w.go();}},
 rename:()=>{if(!S||!UI.started||pzOn())return;openModal(`<h2 style="font-size:26px">${tr('slots.rename_your_network')}</h2><label class="f" for="rnIn">${tr('title.name_your_network')}</label><div class="network-name"><input class="t" id="rnIn" maxlength="24" value="${esc(S.name)}" autocomplete="off"></div><div class="btns" style="margin-top:12px">${btn(tr('slots.rename'),'renameGo',{},'pink big')}${btn(tr('common.cancel'),'menu',{},'ghost big')}</div>`);},
 renameGo:()=>{const el=$('rnIn');if(!S||!el||pzOn())return;const v=el.value.replace(/\s+/g,' ').trim().slice(0,24);if(!v)return;S.name=v;closeModal();after();toast(tr('slots.renamed_to_name',{name:esc(v)}),'good');},
});
// No game on screen: the map stays empty behind the title.
function gameClear(){S=null;R=emptyR();UI.started=false;UI.sel=null;UI.nm=null;UI.confirm=null;$('dash').hidden=true;$('bankBox').hidden=true;renderAll();}
// Back from the title (or a puzzle) into a loaded network.
function gameResume(){UI.started=true;UI.sel=null;UI.confirm=null;$('dash').hidden=true;$('bankBox').hidden=true;UI.speed=[0,0.5,1,2,4,8].includes(S.uiSpeed)?S.uiSpeed:1;
  if(S.cam&&isFinite(S.cam.x))Object.assign(cam,S.cam);else{const h=CITY[S.home];if(h){cam.x=h.x;cam.y=h.y;cam.z=innerWidth<760?1.1:1.4;}}
  closeModal();renderAll();toast(tr('loop.welcome_back_name_your_network_is',{name:esc(S.name),date:dateStr(S.day)}),'good');}
