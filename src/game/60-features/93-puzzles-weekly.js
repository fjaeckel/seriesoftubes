/* ================= THE PUBLISHED WEEKLY PUZZLE =================
   A puzzle week runs from Sunday 06:00 Berlin time to the next Sunday 06:00. Its key is the ISO week of its Monday
   (the week starting Sunday 1 Nov 2026 is 2026-W45), so keys look like the old ISO-week keys and old streaks carry on.
   Every Sunday a GitHub workflow publishes puzzles/weekly/<key>.json (scripts/weekly-puzzle.js): a static file next to
   the page, fetched only when the player opens Puzzles. It is checked field by field; when it is missing, offline or
   wrong, the seeded weekly in 92-puzzles.js stands in, so the weekly puzzle never breaks. */
// Europe/Berlin is UTC+1, and UTC+2 from the last Sunday of March to the last Sunday of October, 01:00 UTC both times.
const pzLastSun=(y,m)=>{const d=new Date(Date.UTC(y,m+1,0));return Date.UTC(y,m,d.getUTCDate()-d.getUTCDay(),1);};
const pzBerlinOff=t=>{const y=new Date(t).getUTCFullYear();return t>=pzLastSun(y,2)&&t<pzLastSun(y,9)?2:1;};
// 06:00 Berlin on the Sunday at UTC midnight `sun`; the clocks change at 01:00 UTC, well before.
const pzSunStart=sun=>sun+(6-pzBerlinOff(sun+4*3600e3))*3600e3;
function pzIso(t){const d=new Date(t);d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));const y=d.getUTCFullYear();return `${y}-W${String(Math.ceil(((d-Date.UTC(y,0,1))/864e5+1)/7)).padStart(2,'0')}`;}
// The key of the puzzle week holding this moment.
function pzWeekKey(dt){const t=+dt,d=new Date(t);let sun=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())-d.getUTCDay()*864e5;
  if(t<pzSunStart(sun))sun-=7*864e5;return pzIso(sun+864e5);}
// When a week starts (UTC ms), or null for a key that is not a real week.
function pzWeekStart(key){const m=/^(\d{4})-W(\d{2})$/.exec(String(key));if(!m)return null;const j4=Date.UTC(+m[1],0,4),mon=j4-((new Date(j4).getUTCDay()+6)%7)*864e5+(+m[2]-1)*7*864e5;
  const t=pzSunStart(mon-864e5);return pzWeekKey(t)===key?t:null;}
// n weeks on (or back). Weeks are 7 days plus or minus the hour the clocks change, so aim 3 hours into the week.
const pzKeyAdd=(key,n)=>{const t=pzWeekStart(key);return t==null?null:pzWeekKey(t+n*7*864e5+3*3600e3);};
const pzPrevKey=key=>pzKeyAdd(key,-1);
// ---------- themes and their text: labels, so the file names a label and the player reads their language ----------
// A file may only use these labels (N_: kept whole in the shipped page, since the file names them in full).
const PZ_WK_THEMES={
 detour:{i:'🚧',t:N_('puzzles_weekly.detour'),names:[N_('puzzles_weekly.name_anywhere_but_hub'),N_('puzzles_weekly.name_who_needs_hub')],jokes:[N_('puzzles_weekly.joke_hub_is_having_a_very'),N_('puzzles_weekly.joke_the_obvious_path_goes_through')]},
 islands:{i:'🏝️',t:N_('puzzles_weekly.island_hopping'),names:[N_('puzzles_weekly.name_hop_skip_and_a_cable'),N_('puzzles_weekly.name_sun_sea_and_subsea')],jokes:[N_('puzzles_weekly.joke_every_hop_is_a_cable'),N_('puzzles_weekly.joke_the_cheapest_way_between_two')]},
 ocean:{i:'🌊',t:N_('puzzles_weekly.ocean_crossing'),names:[N_('puzzles_weekly.name_sea_you_in_b'),N_('puzzles_weekly.name_across_the_big_blue')],jokes:[N_('puzzles_weekly.joke_the_ocean_is_big_and'),N_('puzzles_weekly.joke_somewhere_between_a_and_b')]},
 ring:{i:'💍',t:N_('puzzles_weekly.ring'),names:[N_('puzzles_weekly.name_one_ring_to_rule_reg'),N_('puzzles_weekly.name_ring_around_reg')],jokes:[N_('puzzles_weekly.joke_one_ring_through_every_pop'),N_('puzzles_weekly.joke_a_ring_survives_one_cut')]},
 sprint:{i:'⚡',t:N_('puzzles_weekly.latency_sprint'),names:[N_('puzzles_weekly.name_race_to_b'),N_('puzzles_weekly.name_ms_ms_or_bust')],jokes:[N_('puzzles_weekly.joke_a_to_b_under_ms'),N_('puzzles_weekly.joke_the_speed_of_light_is')]},
 tour:{i:'🗺️',t:N_('puzzles_weekly.region_tour'),names:[N_('puzzles_weekly.name_tour_de_reg'),N_('puzzles_weekly.name_are_we_there_yet_a')],jokes:[N_('puzzles_weekly.joke_n_cities_one_landmass_and'),N_('puzzles_weekly.joke_a_road_trip_for_photons')]},
};
// What each {placeholder} in those labels holds: c a city id, r a region code, n a whole number.
const PZ_WK_P={a:'c',b:'c',hub:'c',reg:'r',ms:'n',n:'n'};
const pzCityOk=c=>isCity(c)&&!CITY[c].off&&!CITY[c].cn;
const pzTxt=o=>{const v={};for(const k in o.p){const x=o.p[k],t=PZ_WK_P[k];v[k]=t==='c'?CITY[x].name:t==='r'?WAVE_NAME[x]:x;}return tr(o.l,v);};
// ---------- the file: never trusted. Only known fields, known cities, known labels and sane numbers get through ----------
const pzObj=o=>!!o&&typeof o==='object'&&!Array.isArray(o);
function pzWkTxt(o,list){if(!pzObj(o)||typeof o.l!=='string'||!list.includes(o.l))return null;const p=o.p==null?{}:o.p;if(!pzObj(p))return null;
  const need=[...new Set([...String(EN[o.l]).matchAll(/\{(\w+)\}/g)].map(m=>m[1]))],out={};
  if(Object.keys(p).length!==need.length)return null;
  for(const k of need){const t=PZ_WK_P[k],v=own(p,k)?p[k]:undefined;
    if(t==='c'&&pzCityOk(v))out[k]=v;else if(t==='r'&&typeof v==='string'&&own(WAVE_NAME,v))out[k]=v;else if(t==='n'&&Number.isInteger(v)&&v>0&&v<1000)out[k]=v;else return null;}
  return {l:o.l,p:out};}
// rev: the file's revision, from 2 when a release's new prices made the week regenerate (scripts/weekly-puzzle.js).
const PZ_WK_FIELDS=['v','key','theme','cities','src','dem','via','avoid','budget','twist','name','joke','ref','rev'];
// Schema 2 (puzzles with traffic): `src` the content origins, `dem` the flows ({t:'eye',a,g} eyeballs in a; {t:'l2',a,b,g,ms}
// a circuit, ms its latency cap; be:true best effort), `cities` exactly the cities they touch. Older files are refused.
const PZ_WK_V=2;
function pzWkDem(a){if(!Array.isArray(a)||a.length<1||a.length>6)return null;const out=[],eye=new Set();
  for(const f of a){if(!pzObj(f)||Object.keys(f).some(k=>!['t','a','b','g','ms','be'].includes(k))||!pzCityOk(f.a)||!Number.isInteger(f.g)||f.g<1||f.g>2000)return null;
    if(own(f,'be')&&f.be!==true)return null;
    if(f.t==='eye'){if(own(f,'b')||own(f,'ms')||eye.has(f.a))return null;eye.add(f.a);out.push({t:'eye',a:f.a,g:f.g,be:!!f.be});}
    else if(f.t==='l2'){if(!pzCityOk(f.b)||f.b===f.a||(own(f,'ms')&&!(typeof f.ms==='number'&&isFinite(f.ms)&&f.ms>=1&&f.ms<=500)))return null;out.push({t:'l2',a:f.a,b:f.b,g:f.g,ms:f.ms||0,be:!!f.be});}
    else return null;}
  return out;}
function pzWkValid(j,key){if(!pzObj(j)||Object.keys(j).some(k=>!PZ_WK_FIELDS.includes(k))||j.v!==PZ_WK_V||j.key!==key||pzWeekStart(key)==null||typeof j.theme!=='string'||!own(PZ_WK_THEMES,j.theme))return null;
  const T=PZ_WK_THEMES[j.theme],ids=(a,lo,hi)=>Array.isArray(a)&&a.length>=lo&&a.length<=hi&&a.every(pzCityOk)&&new Set(a).size===a.length?a.slice():null;
  const cities=ids(j.cities,2,6),src=ids(j.src==null?[]:j.src,0,3),via=ids(j.via==null?[]:j.via,0,4),avoid=ids(j.avoid==null?[]:j.avoid,0,2),dem=pzWkDem(j.dem);if(!cities||!src||!via||!avoid||!dem)return null;
  // Eyeballs need somewhere to pull from; an origin is not also a city of eyeballs.
  if(dem.some(f=>f.t==='eye')&&!src.length||dem.some(f=>f.t==='eye'&&src.includes(f.a)))return null;
  const d0={src,dem},cs=pzCities(d0);if(cs.length!==cities.length||!cs.every(c=>cities.includes(c)))return null;
  const all=[...cities,...via,...avoid];if(new Set(all).size!==all.length)return null;
  if(!Number.isInteger(j.budget)||j.budget<50000||j.budget>2e7)return null;
  const tw=j.twist==null?{}:j.twist;if(!pzObj(tw)||Object.keys(tw).some(k=>!['ring','noSub'].includes(k)))return null;
  if(j.rev!==undefined&&!(Number.isInteger(j.rev)&&j.rev>=2&&j.rev<=999))return null;
  const d={id:'weekly',key,theme:j.theme,cities,src,dem,via,avoid,budget:j.budget,noSub:false,ring:false,rev:j.rev||1};
  if(own(tw,'ring')){if(tw.ring!==true)return null;d.ring=true;}
  if(own(tw,'noSub')){if(tw.noSub!==true)return null;d.noSub=true;}
  d.wn=pzWkTxt(j.name,T.names);d.wj=pzWkTxt(j.joke,T.jokes);if(!d.wn||!d.wj)return null;
  return d;}
// ---------- fetching it: when Puzzles opens, never on page load ----------
function pzWkEnsure(){const key=pzWeekKey(new Date()),w=UI.pzWk;
  if(w&&w.key===key&&(w.st!=='fb'||Date.now()-w.at<5*60e3))return;
  const st=UI.pzWk={key,st:w&&w.key===key&&w.def?'ok':'load',def:w&&w.key===key?w.def:null,at:Date.now()};
  let done=false;const fin=def=>{if(done)return;done=true;clearTimeout(to);if(UI.pzWk!==st)return;if(def){st.def=def;st.st='ok';}else if(!st.def)st.st='fb';st.at=Date.now();pzWkRefresh();};
  const ac=window.AbortController?new AbortController():null,to=setTimeout(()=>{if(ac)ac.abort();fin(null);},5000);
  if(!window.fetch||location.protocol==='file:'){fin(null);return;}
  // Relative and same origin; each week has its own file name, so caches never serve last week's.
  try{fetch(`puzzles/weekly/${key}.json`,ac?{signal:ac.signal}:{}).then(r=>r.ok?r.json():null).then(j=>pzWkValid(j,key),()=>null).then(fin,()=>fin(null));}catch(e){fin(null);}}
// This week's puzzle: the published one when it came, else the seeded one.
function pzWkDef(){const key=pzWeekKey(new Date()),w=UI.pzWk;return w&&w.key===key&&w.def?w.def:pzWeekly();}
const pzWkLoading=()=>{const w=UI.pzWk;return !!w&&w.st==='load'&&w.key===pzWeekKey(new Date());};
function pzWkRefresh(){const el=$('pzWk');if(el)el.outerHTML=pzWkRow();}
// "Next weekly puzzle in 2 d 14 h".
function pzWkNext(now){const key=pzWeekKey(now),t=pzWeekStart(pzKeyAdd(key,1))-now,m=Math.max(1,Math.ceil(t/60e3)),d=Math.floor(m/1440),h=Math.floor(m%1440/60);
  return d?tr('puzzles.next_weekly_in_d_h',{d,h}):tr('puzzles.next_weekly_in_h_m',{h,m:m%60});}
// The Puzzles door says so when this week's puzzle has not been played yet.
function pzWkNew(){try{const k=pzWeekKey(new Date()),w=UI.pzWk;return !pzWkRec(pzLoad(),w&&w.key===k&&w.def?w.def:{key:k});}catch(e){return false;}}
