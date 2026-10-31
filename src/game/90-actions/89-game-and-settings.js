Object.assign(ACT,{
 randomName:()=>{const input=$('nmIn');if(input)input.value=UI.nm=randomNetworkName(input.value);},
 start:()=>{if(UI.asnTxt&&!asnOk(+UI.asnTxt)){toast(tr('title.asn_not_usable'),'bad');const i=$('asnIn');if(i){i.classList.add('bad');i.focus();}return;}const nm=(($('nmIn')&&$('nmIn').value)||randomNetworkName()).slice(0,24),sb=UI.mode==='sandbox';
   beginGame(nm,homeOk(UI.startCity)?UI.startCity:'fra',sb?{mode:'sandbox',rules:{chaos:own(CHAOS,UI.sbChaos)?UI.sbChaos:'none'}}:{mode:'normal',preset:NORMAL_PRESETS.includes(UI.preset)?UI.preset:'oncall'});},
 // Title-screen doors and their options toggle in place, so the name being typed and the city stay as they are.
 modeSet:({m})=>{if(m!=='sandbox'&&m!=='normal')return;UI.mode=m;document.querySelectorAll('.door').forEach(b=>b.classList.toggle('on',b.dataset.door===m));const n=$('doorNormal'),x=$('doorSandbox');if(n)n.hidden=m!=='normal';if(x)x.hidden=m!=='sandbox';},
 presetSet:({p})=>{if(!NORMAL_PRESETS.includes(p))return;UI.preset=p;ACT.modeSet({m:'normal'});document.querySelectorAll('.preset').forEach(b=>{b.classList.toggle('on',b.dataset.preset===p);b.setAttribute('aria-pressed',b.dataset.preset===p);});const w=$('presetWhat');if(w)w.innerHTML=presetWhat(p);},
 chaosSet:({c})=>{if(!own(CHAOS,c))return;UI.sbChaos=c;ACT.modeSet({m:'sandbox'});document.querySelectorAll('.chs').forEach(b=>b.classList.toggle('on',b.dataset.chaos===c));},
 // Puzzles live in their own module; until it ships, the door says so.
 puzzleDoor:()=>{UI.nm=(($('nmIn')&&$('nmIn').value)||UI.nm||randomNetworkName()).slice(0,24);if(typeof ACT.puzzleMenu==='function')ACT.puzzleMenu();else toast(tr('title.puzzles_are_coming_soon'),'goal');},
 scenarios:()=>{UI.nm=(($('nmIn')&&$('nmIn').value)||UI.nm||(S&&S.name)||randomNetworkName()).slice(0,24);scenarioModal();},
 startScn:({id})=>{const sc=SCN.find(x=>x.id===id);if(!sc)return;beginGame(UI.nm||(S&&S.name)||randomNetworkName(),sc.city,{scn:sc});},
 // The published weekly scenario when it came, else the in-browser one.
 wsShare:()=>{if(!S||!S.scn||!S.scn.wk||!S.scn.done)return;const t=wsShareText(),copied=()=>toast(tr('puzzles.copied_paste_it_anywhere',{t:esc(t)}),'good');
   if(navigator.share&&isPhone()){navigator.share({text:t}).catch(()=>{});return;}try{navigator.clipboard.writeText(t).then(copied,()=>toast(esc(t),''));}catch(e){toast(esc(t),'');}track('wkscn_share');},
 startWeekly:()=>{const nm=UI.nm||(S&&S.name)||randomNetworkName();if(wsBegin(wsDef(),nm))return;const o=wsLoad();o.go[pzWeekKey(new Date())]=1;wsStore(o);const wk=weekly();beginGame(UI.nm||(S&&S.name)||randomNetworkName(),wk.city,{scn:wk,seed:wk.seed});},
 pickStart:({city})=>{if(!homeOk(city))return;UI.startCity=city;const s=$('homeSel');if(s)s.value=city;const w=$('homeWhat');if(w)w.innerHTML=homeWhat();},
 pickHome:({v})=>{if(v)ACT.pickStart({city:v});else ACT.pickStart({city:'fra'});},
 // Delete this window's network and go back to the title (the other networks stay).
 newgame:()=>{if(pzOn())pzLeave();const id=UI.slot;if(id){slotDrop(id);slotFree(id);}gameClear();showTitle();},
 keepPlaying:()=>{closeModal();},
 exportSave:()=>exportSave(),
 importPick:()=>{let f=$('importIn');if(!f){f=document.createElement('input');f.type='file';f.accept='.json,application/json';f.id='importIn';f.hidden=true;document.body.appendChild(f);f.addEventListener('change',()=>{importFile(f.files[0]);f.value='';});}f.click();},
 importGo:()=>{const s0=UI.importing;if(!s0)return;UI.importing=null;const prev=S;let nx;try{nx=migrate(JSON.parse(JSON.stringify(s0)));}catch(e){nx=null;}if(nx&&pzOn())pzLeave();const was=S;
   // An import is a new network next to the others: the one playing here is saved and kept.
   try{if(!nx)throw 0;S=nx;compute();checkGoals();}catch(e){S=was;if(S)compute();renderAll();toast(tr('game_and_settings.import_failed_that_save_is_damaged'),'bad');sfx('err');return;}UI.confirm=null;$('bankBox').hidden=true;$('dash').hidden=true;UI.started=true;UI.sel=null;UI.speed=S.uiSpeed===undefined?1:S.uiSpeed;if(S.cam&&isFinite(S.cam.x))Object.assign(cam,S.cam);else{const h=CITY[S.home];if(h){cam.x=h.x;cam.y=h.y;}}closeModal();$('modal').hidden=true;{const im=S;S=was;slotLeave();S=im;}slotNew();delete S.sv;compute();renderAll();save(true);toast(tr('game_and_settings.welcome_back_name_imported_and_saved',{name:esc(S.name)}),'good');sfx('coin');track('game_import');},
 menu:()=>{if(!S||!UI.started){showTitle();return;}if(pzOn()){pzMenu();return;}openModal(`<div style="display:flex;align-items:center"><div><div class="eyebrow">AS${S.asn} · ${esc(dateStr(S.day))} · ${tierLabel()}</div><h2 style="font-size:28px">${esc(S.name)} <button class="thb rn" data-act="rename" aria-label="${tr('slots.rename_your_network')}">✏️</button></h2></div><button class="x" data-act="closeModal" aria-label="${tr('common.close')}">×</button></div>
  ${saveFailing()?`<p class="why">${saveFailMsg()}</p>`:`<p class="tagline">${tr('game_and_settings.your_game_saves_itself_every_few')}</p>`}
  <div class="menu-list">
   ${btn(tr('common.back_to_the_map'),'closeModal',{},'pink big')}${saveFailing()?btn(tr('common.export_save'),'exportSave',{},'pink'):''}${saveFailing()&&UI.saveFail.full&&slotOthers().length?btn(tr('slots.free_up_space'),'slotSpace',{},'pink'):''}
  </div>
  <div class="menu-tiles">${[['🗂️',tr('slots.your_networks'),'toTitle'],['🧩',tr('puzzles.puzzles'),'puzzleMenu'],['🏆',tr('common.scenarios'),'scenarios'],['🧑‍💻',tr('ops.standing_orders'),'opsOpen'],['📸',tr('common.share'),'share'],['⚙️',tr('common.settings'),'settings']].map(([i,l,a])=>`<button class="mtile" data-act="${a}"><i aria-hidden="true">${i}</i><span>${l}</span></button>`).join('')}</div>
  <p class="menu-links">${[saveFailing()?null:[tr('common.export_save'),'exportSave'],[tr('common.import_a_save'),'importPick'],[tr('common.how_to_play'),'help'],RELEASE_NOTES.length?[tr('common.what_s_new_in_v',{v:esc(APP_VERSION)}),'whatsNewShow']:null,[tr('common.start_a_new_network'),'resetAsk']].filter(Boolean).map(([l,a])=>`<button class="lnk" data-act="${a}">${l}</button>`).join(' · ')}</p>
  </div><div class="menu-plugs"><a class="mplug" href="${SIGNAL}" target="_blank" rel="noopener">💬 ${tr('modal_and_names.join_the_noc_chat')} →</a><a class="mplug" href="${ISSUES}" target="_blank" rel="noopener">🐛 ${tr('modal_and_names.found_a_bug_or_have_an')} →</a></div>`);},
 settings:()=>{UI.setOpen=true;openModal(settingsHtml());},
 settingsClose:()=>{UI.setOpen=false;if(!S||!UI.started)showTitle();else closeModal();},
 prefSet:({v})=>{const [k,b]=String(v).split(':');if(!own(PREF_DEF,k))return;setPref(k,b==='1');sfx('click');refreshSettings();},
 vpSet:({v})=>{vpOn(v==='on');refreshSettings();},
 resetAsk:()=>openModal(`<h2 style="font-size:26px">${tr('game_and_settings.start_a_new_network')}</h2><p class="tagline">${tr('game_and_settings.name_and_everything_it_owns_will',{name:esc(S?S.name:tr('common.your_network'))})}</p><div class="btns">${btn(tr('game_and_settings.delete_and_start_over'),'newgame',{},'red big')}${btn(tr('common.keep_playing'),'closeModal',{},'ghost big')}</div>`),
 whatsNewShow:()=>whatsNew(true,true),
 updateNow:()=>{save(true);location.reload();},
 updateLater:()=>{$('update').hidden=true;UI.updLater=Date.now();},
 helpClose:()=>{if(UI.started)closeModal();else showTitle();},
});
