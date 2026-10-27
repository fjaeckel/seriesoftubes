function showTitle(){
  const sv=loadSave();
  if(UI.nm==null)UI.nm=randomNetworkName();
  const starts=[['fra',tr('title.crossroads_of_europe_de_kicks_ix')],['nyc',tr('title.huge_eyeball_market_pricey')],['sin',tr('title.asia_hub_great_peering_far_from')],['sao',tr('title.big_hungry_market_few_providers')],['syd',tr('title.hard_mode_everything_overseas_costs')]];
  openModal(`<div class="title-art"><svg width="74" height="74" viewBox="0 0 74 74" aria-hidden="true"><path d="M10 60V40c0-14 10-24 24-24h18" fill="none" stroke="#1E2640" stroke-width="16" stroke-linecap="round"/><path d="M10 60V40c0-14 10-24 24-24h18" fill="none" stroke="#FFD23F" stroke-width="9" stroke-linecap="round"/><circle cx="58" cy="16" r="11" fill="#FF4F9A" stroke="#1E2640" stroke-width="4"/><circle cx="21" cy="44" r="3" fill="#fff"/><circle cx="30" cy="27" r="3" fill="#fff"/></svg>
  <h1>Series<br>of <span>Tubes</span></h1></div>
  <p class="tagline">${tr('title.build_an_internet_lay_fiber_between')}</p>${plugHtml(false)}${isPhone()?installRow():''}
  ${sv?`<div class="btns" style="margin-bottom:6px">${btn(tr('title.continue_name_date',{name:esc(sv.name),date:dateStr(sv.day)}),'cont',{},'pink big')}</div>`:''}
  <label class="f" for="nmIn">${tr('title.name_your_network')}</label><div class="network-name"><input class="t" id="nmIn" maxlength="24" value="${esc(UI.nm)}" autocomplete="off">${btn(tr('common.another_one'),'randomName',{},'ghost sm')}</div>
  <label class="f" for="asnIn">${tr('title.custom_asn')}</label><div class="network-name"><input class="t" id="asnIn" type="number" min="64512" max="65534" maxlength="5" placeholder="auto" autocomplete="off"><span style="margin-left:8px;color:#55608A;font-size:13px">${tr('title.custom_asn_hint')}</span></div>
  <label class="f">${tr('title.pick_your_home_city')}</label><div class="starts">${starts.map(([c,d])=>`<button class="start ${UI.startCity===c?'on':''}" data-city="${c}" data-act="pickStart" data-args='{"city":"${c}"}'><b>${CITY[c].name}</b><span>${d}</span></button>`).join('')}</div>
  <label class="f">${tr('common.mode')}</label><div class="btns">${[['normal',tr('common.normal')],['sandbox',tr('common.sandbox')]].map(([m,l])=>`<button class="b sm modeb ${(UI.mode||'normal')===m?'pink':'ghost'}" data-m="${m}" data-act="modeSet" data-args='{"m":"${m}"}'>${l}</button>`).join('')}${btn(tr('title.scenarios_amp_weekly_challenge'),'scenarios',{},'sm')}</div>
  <label class="f">${tr('common.language')}</label><div class="btns">${segBtns('langSet',LANG,Object.entries(LANGS))}</div>
  <div class="btns cta" style="margin-top:16px;justify-content:space-between;align-items:center">${btn(sv?tr('common.start_a_new_network'):tr('common.start_building'),'start',{},'big')}${btn(tr('common.how_to_play'),'help',{},'ghost')}${btn(tr('common.import_a_save'),'importPick',{},'ghost sm')}${btn(tr('common.settings'),'settings',{},'ghost sm')}</div><p class="ver">v${APP_VERSION} · <a href="https://github.com/fjaeckel/seriesoftubes" target="_blank" rel="noopener">${tr('title.source_on_github')}</a> · <a href="${SIGNAL}" target="_blank" rel="noopener">${tr('title.chat_on_signal')}</a> · ${tr('title.cookieless_stats_no_tracking')}</p>`);
  $('nmIn').addEventListener('input',e=>{UI.nm=e.target.value;});
  if(sv){S=migrate(sv);compute();}
}
// "What's new": shown once to returning players after an update, or on demand.
function whatsNew(returning,force){
  if(IS_DEV||!RELEASE_NOTES.length)return false;let seen=null;
  try{seen=localStorage.getItem('sot-seen-version');localStorage.setItem('sot-seen-version',APP_VERSION);}catch(e){}
  if(!force&&(!returning||seen===APP_VERSION))return false;
  openModal(`<div style="display:flex;align-items:center"><div><div class="eyebrow">${tr('common.release_notes')}</div><h2 style="font-size:28px">${tr('title.new_in_series_of_tubes_v',{v:esc(APP_VERSION)})}</h2></div><button class="x" data-act="${UI.started?'closeModal':'helpClose'}" aria-label="${tr('common.close')}">×</button></div>
  ${notesHtml(RELEASE_NOTES,APP_VERSION)}
  ${returning&&S?`<p class="note">${tr('title.your_network_name_was_saved_and',{name:esc(S.name)})}</p>`:''}
  <div class="btns" style="margin-top:12px">${btn(UI.started?tr('title.back_to_my_network'):tr('common.got_it'),UI.started?'closeModal':'helpClose',{},'pink big')}${notesLong(RELEASE_NOTES)?'':`<a class="b ghost" href="https://github.com/fjaeckel/seriesoftubes/blob/main/CHANGELOG.md" target="_blank" rel="noopener">${tr('common.full_changelog')}</a>`}</div>`);
  return true;}
