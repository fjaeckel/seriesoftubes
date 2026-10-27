Object.assign(ACT,{
 randomName:()=>{const input=$('nmIn');if(input)input.value=UI.nm=randomNetworkName(input.value);},
 start:()=>{const nm=(($('nmIn')&&$('nmIn').value)||randomNetworkName()).slice(0,24);const ai=$('asnIn');let asn=0;if(ai){const v=parseInt(ai.value,10);if(v>=64512&&v<=65534)asn=v;}beginGame(nm,UI.startCity,{mode:UI.mode==='sandbox'?'sandbox':'normal',asn});},
 modeSet:({m})=>{UI.mode=m;document.querySelectorAll('.modeb').forEach(b=>b.classList.toggle('pink',b.dataset.m===m));document.querySelectorAll('.modeb').forEach(b=>b.classList.toggle('ghost',b.dataset.m!==m));},
 scenarios:()=>{UI.nm=(($('nmIn')&&$('nmIn').value)||UI.nm||(S&&S.name)||randomNetworkName()).slice(0,24);scenarioModal();},
 startScn:({id,sure})=>{const sc=SCN.find(x=>x.id===id);if(!sc)return;if(!sure&&S&&UI.started&&!S.lost&&!(S.scn&&(S.scn.done||S.scn.failed))){openModal(`<h2 style="font-size:26px">${tr('game_and_settings.start_name',{name:esc(sc.n)})}</h2><p class="tagline">${tr('game_and_settings.name_will_be_replaced_export_it',{name:esc(S.name)})}</p><div class="btns">${btn(tr('game_and_settings.start_the_scenario'),'startScn',{id,sure:1},'pink big')}${btn(tr('common.keep_playing'),'closeModal',{},'ghost big')}</div>`);return;}beginGame(UI.nm||(S&&S.name)||randomNetworkName(),sc.city,{scn:sc});},
 startWeekly:({sure}={})=>{if(!sure&&S&&UI.started&&!S.lost&&!(S.scn&&(S.scn.done||S.scn.failed))){openModal(`<h2 style="font-size:26px">${tr('game_and_settings.start_the_weekly_challenge')}</h2><p class="tagline">${tr('game_and_settings.name_will_be_replaced_export_it',{name:esc(S.name)})}</p><div class="btns">${btn(tr('game_and_settings.start_the_challenge'),'startWeekly',{sure:1},'pink big')}${btn(tr('common.keep_playing'),'closeModal',{},'ghost big')}</div>`);return;}const wk=weekly();beginGame(UI.nm||(S&&S.name)||randomNetworkName(),wk.city,{scn:wk,seed:wk.seed});},
 pickStart:({city})=>{UI.startCity=city;document.querySelectorAll('.start').forEach(b=>b.classList.toggle('on',b.dataset.city===city));},
 cont:()=>{migrate(S);track('game_continue',true);UI.started=true;closeModal();renderAll();},
 newgame:()=>{try{localStorage.removeItem('sot-save-v1');}catch(e){}S=null;UI.started=false;UI.sel=null;UI.nm=null;$('dash').hidden=true;$('bankBox').hidden=true;renderAll();showTitle();},
 keepPlaying:()=>{closeModal();},
 exportSave:()=>exportSave(),
 importPick:()=>{let f=$('importIn');if(!f){f=document.createElement('input');f.type='file';f.accept='.json,application/json';f.id='importIn';f.hidden=true;document.body.appendChild(f);f.addEventListener('change',()=>{importFile(f.files[0]);f.value='';});}f.click();},
 importGo:()=>{const s0=UI.importing;if(!s0)return;UI.importing=null;const prev=S;try{S=migrate(JSON.parse(JSON.stringify(s0)));compute();checkGoals();renderAll();}catch(e){S=prev;if(S)compute();renderAll();toast(tr('game_and_settings.import_failed_that_save_is_damaged'),'bad');sfx('err');return;}UI.confirm=null;$('bankBox').hidden=true;$('dash').hidden=true;UI.started=true;UI.sel=null;UI.speed=S.uiSpeed===undefined?1:S.uiSpeed;if(S.cam&&isFinite(S.cam.x))Object.assign(cam,S.cam);else{const h=CITY[S.home];if(h){cam.x=h.x;cam.y=h.y;}}closeModal();$('modal').hidden=true;compute();renderAll();save();toast(tr('game_and_settings.welcome_back_name_imported_and_saved',{name:esc(S.name)}),'good');sfx('coin');track('game_import');},
 menu:()=>{if(!S||!UI.started){showTitle();return;}openModal(`<div style="display:flex;align-items:center"><div><div class="eyebrow">AS${S.asn} · ${esc(dateStr(S.day))} · ${tierLabel()}</div><h2 style="font-size:28px">${esc(S.name)}</h2></div><button class="x" data-act="closeModal" aria-label="${tr('common.close')}">×</button></div>
  <p class="tagline">${tr('game_and_settings.your_game_saves_itself_every_few')}</p>${isPhone()?installRow():''}
  <div class="menu-list">
   ${btn(tr('common.back_to_the_map'),'closeModal',{},'pink big')}
   ${btn(tr('game_and_settings.export_save_download_a_file'),'exportSave',{},'')}
   ${btn(tr('game_and_settings.import_a_save_from_a_file'),'importPick',{},'')}
   ${btn(tr('game_and_settings.share_your_network_image_card'),'share',{},'')}
   ${btn(tr('game_and_settings.scenarios_amp_weekly_challenge'),'scenarios',{},'ghost')}
   ${btn(tr('common.how_to_play'),'help',{},'ghost')}
   ${RELEASE_NOTES.length?btn(tr('common.what_s_new_in_v',{v:esc(APP_VERSION)}),'whatsNewShow',{},'ghost'):''}
   ${btn(tr('common.settings'),'settings',{},'ghost')}
   ${btn(tr('common.start_a_new_network'),'resetAsk',{},'red')}
  </div>${chatHtml()}`);},
 settings:()=>{UI.setOpen=true;openModal(settingsHtml());},
 settingsClose:()=>{UI.setOpen=false;if(!S||!UI.started)showTitle();else closeModal();},
 prefSet:({v})=>{const [k,b]=String(v).split(':');if(!own(PREF_DEF,k))return;setPref(k,b==='1');sfx('click');refreshSettings();},
 vpSet:({v})=>{vpOn(v==='on');refreshSettings();},
 resetAsk:()=>openModal(`<h2 style="font-size:26px">${tr('game_and_settings.start_a_new_network')}</h2><p class="tagline">${tr('game_and_settings.name_and_everything_it_owns_will',{name:esc(S?S.name:tr('common.your_network'))})}</p><div class="btns">${btn(tr('game_and_settings.delete_and_start_over'),'newgame',{},'red big')}${btn(tr('common.keep_playing'),'closeModal',{},'ghost big')}</div>`),
 whatsNewShow:()=>whatsNew(true,true),
 updateNow:()=>{save();location.reload();},
 updateLater:()=>{$('update').hidden=true;UI.updLater=Date.now();},
 helpClose:()=>{if(UI.started)closeModal();else showTitle();},
});
