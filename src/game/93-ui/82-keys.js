/* ---------- Keyboard shortcuts: arrows/WASD move, [ ] step through your POPs, $ through the offers, - = zoom, n (then a letter) the NOC, ? lists every key ----------
   Space, 0–4 and Escape live with the map's input (96-map/90-input.js), / with Find a city. */
// Your POPs in the order Find a city lists them, so [ and ] walk the same list.
const popOrder=()=>S&&S.pops?Object.keys(S.pops).filter(isCity).sort((a,b)=>CITY[a].name.localeCompare(CITY[b].name)):[];
// Open offers in the Deals list's order, soonest to expire first, so $ walks the same list.
const offerOrder=()=>S&&S.offers?S.offers.filter(o=>isCity(o.city)).sort((a,b)=>a.exp-b.exp):[];
// n opens the NOC dashboard, and a letter within KEY_LEAD ms of it picks a tab (n c: Connections). n never closes the
// dashboard, so n c switches tabs without it flashing shut; Escape closes it.
const DASH_KEYS={o:'overview',u:'cust',c:'conn',t:'traffic',r:'infra',l:'lease'},KEY_LEAD=1000;let keyLead=0;
// Arrow keys and WASD move the map while held, at a steady speed on screen. Their own frame loop runs only while one is
// down, so the game loop does no extra work; letting go, a window opening or leaving the browser window stops it.
const PAN_KEYS={ArrowUp:[0,-1],w:[0,-1],ArrowDown:[0,1],s:[0,1],ArrowLeft:[-1,0],a:[-1,0],ArrowRight:[1,0],d:[1,0]},PAN_SPEED=700;
const panHeld=new Set();let panAt=null;
function panFrame(t){if(!panHeld.size||!$('modal').hidden||!$('dash').hidden){panHeld.clear();return;}
  // A slow frame (a busy day, a background tab) moves at most 50 ms worth, not a jump across the map.
  const dt=panAt==null?0:Math.min(0.05,(t-panAt)/1000);panAt=t;let dx=0,dy=0;for(const k of panHeld){dx+=PAN_KEYS[k][0];dy+=PAN_KEYS[k][1];}
  cam.x+=dx*PAN_SPEED*dt/cam.z;cam.y+=dy*PAN_SPEED*dt/cam.z;wrapCam();requestAnimationFrame(panFrame);}
function showKeys(){const k=s=>`<span class="kbd">${s}</span>`,TN={overview:tr('common.overview'),cust:tr('common.customers'),conn:tr('common.connections'),traffic:tr('common.traffic'),infra:tr('common.links_routers'),lease:tr('common.leased_lines')};
  const tabs=Object.entries(DASH_KEYS).map(([l,t])=>`<span class="keytab">${k(l)} ${TN[t]}</span>`).join(' ');
  const rows=[[[...'←↑↓→'].map(k).join(' ')+'<br>'+[...'wasd'].map(k).join(' '),tr('keys.move_around_the_map')],[k(tr('keys.space')),tr('keys.pause_or_play')],[k('0')+' – '+k('4'),tr('keys.game_speed')],[k('/'),tr('find.find_a_city')],[k('[')+' '+k(']'),tr('keys.previous_or_next_of_your')],[k('$'),tr('keys.next_open_offer_soonest_to')],[k('-')+' '+k('='),tr('keys.zoom_the_map_out_or')],[k('n'),`${tr('keys.noc_dashboard_a_letter_right')}<br>${tabs}`],[k(tr('keys.esc')),tr('keys.close_a_window_or_deselect')],[k('?'),tr('keys.show_this_list')]];
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
  // Alt with an arrow is the browser's Back and Forward.
  if(!e.altKey&&PAN_KEYS[k]){if(!S||!UI.started||!$('modal').hidden||!$('dash').hidden)return;e.preventDefault();if(!panHeld.size){panAt=null;requestAnimationFrame(panFrame);}panHeld.add(k);return;}
  if(!(step||zoom||k==='$')||!S||!UI.started||!$('modal').hidden)return;
  e.preventDefault();if(step)ACT.popStep({d:step});else if(zoom)ACT.zoomStep({d:zoom});else ACT.offerStep();});
document.addEventListener('keyup',e=>panHeld.delete(e.key.length===1?e.key.toLowerCase():e.key));
addEventListener('blur',()=>panHeld.clear());
