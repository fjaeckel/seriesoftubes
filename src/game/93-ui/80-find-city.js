/* ---------- Find a city (#218): a search box that jumps the map there ----------
   Matches the city's name, its country (in the player's language and in English) and its exchange and data center
   names, so "Deutschland", "Germany" or "DE-CIX" all find Frankfurt. Press / anywhere, or the 🔍 chip in the HUD. */
const FIND_N=8;
const fold=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
// Country names, built once per page: they never change while playing.
let FIND_IX=null;
function findIndex(){if(FIND_IX)return FIND_IX;let dn=null,en=null;try{dn=new Intl.DisplayNames([LANG],{type:'region'});en=new Intl.DisplayNames(['en'],{type:'region'});}catch(e){}
  const cn=(d,cc)=>{try{return d?d.of(cc)||'':'';}catch(e){return '';}};
  FIND_IX=Object.values(CITY).map(C=>{const land=cn(dn,C.cc)||C.cc||'';return {id:C.id,name:fold(C.name),land,ctry:fold(land+' '+cn(en,C.cc)+' '+(C.cc||'')),xtra:fold((C.ix||'')+' '+(C.dc||''))};});return FIND_IX;}
// Best matches first: the name starts with it, a word of the name does, the name has it, then country, then exchange or DC.
function findCities(q){q=fold(q);const mine=c=>S&&S.pops&&S.pops[c]?0:1;
  if(!q)return S&&S.pops?Object.keys(S.pops).filter(isCity).sort((a,b)=>CITY[a].name.localeCompare(CITY[b].name)).slice(0,FIND_N):[];
  const out=[];for(const e of findIndex()){const n=e.name;
    const s=n.startsWith(q)?0:n.split(/[\s\-.'()]+/).some(w=>w.startsWith(q))?1:n.includes(q)?2:e.ctry.includes(q)?3:e.xtra.includes(q)?4:-1;
    if(s>=0)out.push([s,mine(e.id),-(CITY[e.id].P||0),e.id]);}
  return out.sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]).slice(0,FIND_N).map(r=>r[3]);}
function findRows(q){const ids=findCities(q),land=c=>(findIndex().find(e=>e.id===c)||{}).land||'';
  if(!ids.length)return `<p class="meta" style="margin:10px 0">${q.trim()?tr('find.no_city_matches_q',{q:esc(q.trim())}):tr('find.type_a_city_a_country')}</p>`;
  return ids.map((c,i)=>{const C=CITY[c],p=S&&S.pops&&S.pops[c];
    return `<button class="row findrow${i?'':' on'}" data-act="findGo" data-args="${esc(JSON.stringify({city:c}))}"><span class="grow"><span class="nm">${p?'📍 ':''}${esc(C.name)}</span><span class="meta">${esc([land(c),C.ix].filter(Boolean).join(' · '))}${p?' · '+tr('find.your_pop'):''}</span></span><span aria-hidden="true">›</span></button>`;}).join('');}
function findOpen(){if(!S||!UI.started)return;
  openModal(`<h2 style="font-size:24px;margin:0 0 10px">🔍 ${tr('find.find_a_city')}</h2><input class="t" id="findIn" type="search" enterkeyhint="go" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(tr('find.city_country_or_exchange'))}" aria-label="${esc(tr('find.find_a_city'))}" aria-controls="findList">
    <div id="findList" class="findlist" role="list">${findRows('')}</div>${isPhone()?'':`<p class="meta" style="margin:8px 0 0">${tr('find.press_slash_to_search_from')}</p>`}`,'find');
  const el=$('findIn');if(el)el.focus();}
document.addEventListener('input',e=>{if(e.target.id!=='findIn')return;const L=$('findList');if(L)L.innerHTML=findRows(e.target.value);});
document.addEventListener('keydown',e=>{
  if(e.target.id==='findIn'){if(e.key==='Escape'){closeModal();return;}if(e.key==='Enter'){e.preventDefault();const c=findCities(e.target.value)[0];if(c)ACT.findGo({city:c});}return;}
  if(e.key!=='/'||e.ctrlKey||e.metaKey||e.altKey||(e.target.closest&&e.target.closest('input,textarea,select,[contenteditable]')))return;
  if(!S||!UI.started||!$('modal').hidden)return;e.preventDefault();findOpen();});
