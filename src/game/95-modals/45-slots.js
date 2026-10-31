/* "Your networks" on the title screen: drawn from the index alone, so it stays instant however big the saves are. */
function slotAgo(t){const m=Math.max(0,Math.round((Date.now()-t)/60000));
  return m<1?tr('slots.just_now'):m<60?trn('notifications.n_min_ago',m):m<1440?trn('slots.n_h_ago',Math.round(m/60)):trn('slots.n_day_ago',Math.round(m/1440));}
const slotIcon=e=>e.broken?'🩹':e.mode==='scenario'?'🏆':e.mode==='sandbox'?'🏖️':(PRESETS[e.preset]||PRESETS.oncall).i;
// The network to continue: the most recent one that is not open in another window (or damaged).
function slotTop(list){return slotByAt(list).find(e=>!e.broken&&!slotBusy(e.id))||null;}
function slotLine(e){if(e.broken)return tr('slots.damaged_export_or_delete');
  const bits=[e.asn?'AS'+e.asn:'',e.name||e.gz?dateStr(e.day):''];if(e.mode==='scenario'&&e.scn)bits.push(esc(e.scn));else if(e.tier)bits.push(e.tier);
  return bits.filter(Boolean).join(' · ');}
function slotRow(e,top){const busy=slotBusy(e.id),nm=esc(e.name||tr('common.unnamed_network'));
  const tag=busy?`<span class="tag">${tr('slots.open_in_another_window')}</span>`:top?`<span class="tag">▶ ${tr('slots.continue')}</span>`:'';
  return `<div class="slot${top?' top':''}${busy?' busy':''}${e.broken?' broken':''}" data-slot="${e.id}"><button class="slot-go" data-act="${e.broken?'slotMenu':'cont'}" data-args='{"id":"${e.id}"}'><i aria-hidden="true">${slotIcon(e)}</i><span class="sn">${tag}<b>${nm}</b><small>${slotLine(e)}</small></span><span class="sm">${e.broken?'':`<em>${fmt$(e.cash)}</em>`}<small>${e.at?slotAgo(e.at):''}</small></span></button><button class="slot-more" data-act="slotMenu" data-args='{"id":"${e.id}"}' aria-label="${tr('slots.more_for_name',{name:nm})}">⋯</button></div>`;}
function slotListHtml(){const list=slotByAt(slotIdx()),top=slotTop(list);
  return list.map(e=>slotRow(e,e===top)).join('');}
function slotsHtml(){const list=slotIdx(true);if(!list.length)return '';
  SLOT.html=slotListHtml();return `<label class="f">${tr('slots.your_networks')}</label><div class="slots" id="slotList">${SLOT.html}</div>`;}
// Another window saved, opened or closed a network: the list follows (only when it is on screen and changed).
function slotRefresh(){const el=$('slotList');if(!el||UI.started)return;const h=slotListHtml();if(h!==SLOT.html){SLOT.html=h;el.innerHTML=h;}}
function slotMenuHtml(id){const e=slotIdx().find(x=>x.id===id);if(!e)return '';const nm=esc(e.name||tr('common.unnamed_network'));
  return `<div style="display:flex;align-items:center"><div class="grow"><div class="eyebrow">${slotIcon(e)} ${slotLine(e)}</div><h2 style="font-size:26px">${nm}</h2></div><button class="x" data-act="slotBack" aria-label="${tr('common.close')}">×</button></div>
  <p class="tagline">${e.at?tr('slots.last_played_ago',{ago:slotAgo(e.at)}):''}${e.size?' · '+tr('slots.size_on_this_device',{size:slotSize(e.size)}):''}</p>
  <div class="menu-list">${e.broken?'':btn(tr('slots.continue_this_network'),'cont',{id},'pink big')}${btn(tr('game_and_settings.export_save_download_a_file'),'slotExport',{id},'')}${btn(tr('slots.delete_this_network'),'slotDel',{id},'red')}${btn(tr('common.back'),'slotBack',{},'ghost')}</div>`;}
const slotSize=n=>n>=1e6?(n/1e6).toFixed(1)+' MB':Math.max(1,Math.round(n/1e3))+' kB';
function slotBusyModal(id){const e=slotIdx().find(x=>x.id===id),nm=esc(e&&e.name||tr('common.unnamed_network'));
  openModal(`<div class="eyebrow">🪟 ${tr('slots.two_windows_one_network')}</div><h2 style="font-size:26px">${tr('slots.name_is_open_in_another_window',{name:nm})}</h2>
  <p class="tagline">${tr('slots.only_one_window_can_play_a')}</p><div class="btns">${btn(tr('slots.switch_to_that_window'),'slotSwitch',{id},'pink big')}${btn(tr('slots.take_over_here'),'slotTake',{id},'big')}${btn(tr('slots.your_networks'),'slotBack',{},'ghost')}</div>`);}
// Shown in the window that stepped aside: calm, and nothing here writes.
function slotLostModal(id,name,why){const nm=esc(name||tr('common.unnamed_network'));
  openModal(`<div class="eyebrow">🪟 ${tr('slots.two_windows_one_network')}</div><h2 style="font-size:26px">${why==='newer'?tr('slots.name_was_saved_in_another_window',{name:nm}):tr('slots.name_opened_in_another_window',{name:nm})}</h2>
  <p class="tagline">${why==='newer'?tr('slots.this_window_stopped_saving_so_it'):tr('slots.this_window_stepped_aside_so_the')}</p><div class="btns">${btn(why==='newer'?tr('slots.load_the_newest_version'):tr('slots.take_it_back_here'),why==='newer'?'cont':'slotTake',{id},'pink big')}${btn(tr('slots.your_networks'),'slotBack',{},'ghost big')}</div>`);}
const slotOthers=()=>slotIdx().filter(e=>e.id!==UI.slot);
// Out of room: which other networks take space, with export and delete right there.
function slotSpaceHtml(){const l=slotOthers().sort((a,b)=>b.size-a.size);
  return `<div style="display:flex;align-items:center"><div class="grow"><div class="eyebrow">💾 ${tr('slots.storage_on_this_device')}</div><h2 style="font-size:26px">${tr('slots.free_up_space')}</h2></div><button class="x" data-act="closeModal" aria-label="${tr('common.close')}">×</button></div>
  <p class="tagline">${tr('slots.your_other_networks_share_this_browser')}</p>
  ${l.length?l.map(e=>`<div class="ibx space"><div class="grow"><b>${slotIcon(e)} ${esc(e.name||tr('common.unnamed_network'))}</b><div class="meta">${slotSize(e.size)}${e.at?' · '+slotAgo(e.at):''}</div></div><div class="btns">${btn(tr('common.export_save'),'slotExport',{id:e.id},'ghost sm')}${btn(tr('slots.delete'),'slotDel',{id:e.id,back:'space'},'red sm')}</div></div>`).join(''):`<p class="note">${tr('slots.no_other_networks_here')}</p>`}
  <div class="btns" style="margin-top:10px">${btn(tr('common.back_to_the_map'),'closeModal',{},'pink big')}</div>`;}
