/* ---------- Keyboard shortcuts: [ ] step through your POPs, - = zoom, n (then a letter) the NOC, ? lists every key ----------
   Space, 0–4 and Escape live with the map's input (96-map/90-input.js), / with Find a city. */
// Your POPs in the order Find a city lists them, so [ and ] walk the same list.
const popOrder=()=>S&&S.pops?Object.keys(S.pops).filter(isCity).sort((a,b)=>CITY[a].name.localeCompare(CITY[b].name)):[];
// n opens the NOC dashboard, and a letter within KEY_LEAD ms of it picks a tab (n c: Connections). n never closes the
// dashboard, so n c switches tabs without it flashing shut; Escape closes it.
const DASH_KEYS={o:'overview',u:'cust',c:'conn',t:'traffic',r:'infra',l:'lease'},KEY_LEAD=1000;let keyLead=0;
function showKeys(){const k=s=>`<span class="kbd">${s}</span>`,TN={overview:tr('common.overview'),cust:tr('common.customers'),conn:tr('common.connections'),traffic:tr('common.traffic'),infra:tr('common.links_routers'),lease:tr('common.leased_lines')};
  const tabs=Object.entries(DASH_KEYS).map(([l,t])=>`<span class="keytab">${k(l)} ${TN[t]}</span>`).join(' ');
  const rows=[[k(tr('keys.space')),tr('keys.pause_or_play')],[k('0')+' – '+k('4'),tr('keys.game_speed')],[k('/'),tr('find.find_a_city')],[k('[')+' '+k(']'),tr('keys.previous_or_next_of_your')],[k('-')+' '+k('='),tr('keys.zoom_the_map_out_or')],[k('n'),`${tr('keys.noc_dashboard_a_letter_right')}<br>${tabs}`],[k(tr('keys.esc')),tr('keys.close_a_window_or_deselect')],[k('?'),tr('keys.show_this_list')]];
  openModal(`<div style="display:flex;align-items:center"><h2 style="font-size:28px">⌨️ ${tr('keys.keyboard_shortcuts')}</h2><button class="x" data-act="helpClose" aria-label="${tr('common.close')}">×</button></div>
  <dl class="keylist">${rows.map(([a,b])=>`<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl><div class="btns" style="margin-top:14px">${btn(UI.started?tr('common.back_to_the_map'):tr('common.got_it'),'helpClose',{},'big')}</div>`,'keys');}
document.addEventListener('keydown',e=>{
  // Many layouts type [ and ] with Option or AltGr held, so Alt alone is fine; Ctrl or Cmd belongs to the browser.
  if(e.key==='Shift'||e.metaKey||(e.ctrlKey&&!e.altKey)||(e.target.closest&&e.target.closest('input,textarea,select,[contenteditable]')))return;
  const k=e.key.length===1?e.key.toLowerCase():e.key,step={'[':-1,']':1}[k],zoom={'-':-1,'_':-1,'=':1,'+':1}[k];
  const lead=Date.now()-keyLead<KEY_LEAD;keyLead=0;
  if(lead&&DASH_KEYS[k]&&!$('dash').hidden){e.preventDefault();ACT.dashTab({k:DASH_KEYS[k]});return;}
  if(k==='n'){if(!S||!UI.started||!$('modal').hidden)return;e.preventDefault();if($('dash').hidden)ACT.dash();if(!$('dash').hidden)keyLead=Date.now();return;}
  if(k==='?'){if(e.repeat)return;if($('modal').hidden){if(S&&UI.started){e.preventDefault();ACT.keys();}}else if($('modal').className==='keys'){e.preventDefault();ACT.helpClose();}return;}
  if(!(step||zoom)||!S||!UI.started||!$('modal').hidden)return;
  e.preventDefault();if(step)ACT.popStep({d:step});else ACT.zoomStep({d:zoom});});
