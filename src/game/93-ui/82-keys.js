/* ---------- Keyboard shortcuts: [ ] step through your POPs, - = zoom, ? lists every key ----------
   Space, 0–4 and Escape live with the map's input (96-map/90-input.js), / with Find a city. */
// Your POPs in the order Find a city lists them, so [ and ] walk the same list.
const popOrder=()=>S&&S.pops?Object.keys(S.pops).filter(isCity).sort((a,b)=>CITY[a].name.localeCompare(CITY[b].name)):[];
function showKeys(){const k=s=>`<span class="kbd">${s}</span>`;
  const rows=[[k(tr('keys.space')),tr('keys.pause_or_play')],[k('0')+' – '+k('4'),tr('keys.game_speed')],[k('/'),tr('find.find_a_city')],[k('[')+' '+k(']'),tr('keys.previous_or_next_of_your')],[k('-')+' '+k('='),tr('keys.zoom_the_map_out_or')],[k(tr('keys.esc')),tr('keys.close_a_window_or_deselect')],[k('?'),tr('keys.show_this_list')]];
  openModal(`<div style="display:flex;align-items:center"><h2 style="font-size:28px">⌨️ ${tr('keys.keyboard_shortcuts')}</h2><button class="x" data-act="helpClose" aria-label="${tr('common.close')}">×</button></div>
  <dl class="keylist">${rows.map(([a,b])=>`<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl><div class="btns" style="margin-top:14px">${btn(UI.started?tr('common.back_to_the_map'):tr('common.got_it'),'helpClose',{},'big')}</div>`,'keys');}
document.addEventListener('keydown',e=>{
  // Many layouts type [ and ] with Option or AltGr held, so Alt alone is fine; Ctrl or Cmd belongs to the browser.
  if(e.metaKey||(e.ctrlKey&&!e.altKey)||(e.target.closest&&e.target.closest('input,textarea,select,[contenteditable]')))return;
  const k=e.key,step={'[':-1,']':1}[k],zoom={'-':-1,'_':-1,'=':1,'+':1}[k];
  if(k==='?'){if(e.repeat)return;if($('modal').hidden){if(S&&UI.started){e.preventDefault();ACT.keys();}}else if($('modal').className==='keys'){e.preventDefault();closeModal();}return;}
  if(!(step||zoom)||!S||!UI.started||!$('modal').hidden)return;
  e.preventDefault();if(step)ACT.popStep({d:step});else ACT.zoomStep({d:zoom});});
