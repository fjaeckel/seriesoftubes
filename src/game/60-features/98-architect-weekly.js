/* ---------- the published weekly Architect run ----------
   Every Sunday scripts/weekly-architect.js publishes architect/weekly/<key>.json next to the page: an HQ, a budget and
   the briefs, as data. Fetched only when Puzzles opens, checked field by field, and played like the handmade runs
   (AR_RUNS) under the id 'wk-<key>'. A brief's text is written here from what it asks for, in the player's language, so
   the file can never say one thing and want another. When the file is missing, offline or wrong there is simply no
   weekly run that week. */
const AR_WK_V=1,AR_WK_FIELDS=['v','key','hq','budget','name','joke','briefs','ref','rev'],AR_WK_BRIEF=['add','gold','ring','drop','dem','lat','tubes'];
// The labels a file may name (N_: kept whole in the shipped page); their only placeholder is {hq}, a city.
const AR_WK_NAMES=[N_('architect_weekly.name_all_roads_lead_to_hq'),N_('architect_weekly.name_the_hq_job'),N_('architect_weekly.name_hq_and_friends')];
const AR_WK_JOKES=[N_('architect_weekly.joke_hq_signed_the_lease'),N_('architect_weekly.joke_one_network_a_handful')];
const arWkId=key=>'wk-'+key,AR_WK_ID=/^wk-\d{4}-W\d{2}$/;
function arWkTxt(o,list){if(!pzObj(o)||!list.includes(o.l))return null;const p=o.p==null?{}:o.p;if(!pzObj(p))return null;
  const need=[...new Set([...String(EN[o.l]).matchAll(/\{(\w+)\}/g)].map(m=>m[1]))];
  if(Object.keys(p).length!==need.length||!need.every(k=>k==='hq'&&pzCityOk(p[k])))return null;return {l:o.l,p:Object.assign({},p)};}
const arWkSay1=o=>tr(o.l,o.p.hq?{hq:CITY[o.p.hq].name}:{});
// What a brief says, built from what it wants.
function arWkSay(b){const n=c=>CITY[c].name,t=[];
  if(b.drop)t.push(tr('architect_weekly.t_drop',{a:n(b.drop[0])}));
  const ag=b.add&&b.gold&&b.add.length===1&&b.gold.length===1&&b.add[0]===b.gold[0];
  if(ag)t.push(tr('architect_weekly.t_add_gold',{a:n(b.add[0])}));
  else if(b.add)t.push(b.add.length>1?tr('architect_weekly.t_add_two',{a:n(b.add[0]),b:n(b.add[1])}):tr('architect_weekly.t_add_one',{a:n(b.add[0])}));
  if(b.gold&&!ag)t.push(b.gold.length>1?tr('architect_weekly.t_gold_two',{a:n(b.gold[0]),b:n(b.gold[1])}):tr('architect_weekly.t_gold_one',{a:n(b.gold[0])}));
  for(const c of Object.keys(b.dem||{}))if(!(b.add||[]).includes(c))t.push(tr('architect_weekly.t_grow',{a:n(c),g:arG(b.dem[c])}));
  if(b.ring)t.push(tr('architect_weekly.t_ring',{list:b.ring.map(n).join(', ')}));
  if(b.lat)t.push(tr('architect_weekly.t_lat',{a:n(b.lat[0]),b:n(b.lat[1]),ms:+b.lat[2].toFixed(1)}));
  return t.join(' ');}
// The briefs, in order: a site exists from the brief that adds it until one drops it; every brief asks for something.
function arWkBriefs(a,hq){if(!Array.isArray(a)||a.length<3||a.length>7)return null;const sites=new Set([hq]),gone=new Set(),out=[];
  const ids=(x,lo,hi)=>x==null?[]:Array.isArray(x)&&x.length>=lo&&x.length<=hi&&x.every(pzCityOk)&&new Set(x).size===x.length?x.slice():null;
  for(const b of a){if(!pzObj(b)||Object.keys(b).some(k=>!AR_WK_BRIEF.includes(k)))return null;
    const drop=ids(b.drop,1,1),add=ids(b.add,1,2),gold=ids(b.gold,1,2),ring=b.ring==null?[]:ids(b.ring,3,4);if(!drop||!add||!gold||!ring)return null;
    for(const c of drop){if(c===hq||!sites.has(c))return null;sites.delete(c);gone.add(c);}
    for(const c of add){if(sites.has(c)||gone.has(c))return null;sites.add(c);}
    if(![...gold,...ring].every(c=>sites.has(c))||gold.includes(hq))return null;
    const dem={};if(b.dem!=null){if(!pzObj(b.dem))return null;for(const c of Object.keys(b.dem)){const g=b.dem[c];if(!sites.has(c)||c===hq||!Number.isInteger(g)||g<10||g>400)return null;dem[c]=g;}}
    let lat=null;if(b.lat!=null){const l=b.lat;if(!Array.isArray(l)||l.length!==3||!sites.has(l[0])||!sites.has(l[1])||l[0]===l[1]||typeof l[2]!=='number'||!isFinite(l[2])||l[2]<1||l[2]>300)return null;lat=l.slice();}
    if(!Number.isInteger(b.tubes)||b.tubes<0||b.tubes>9)return null;
    if(!add.length&&!gold.length&&!ring.length&&!lat&&!Object.keys(dem).length)return null;
    const o={tubes:b.tubes};if(add.length)o.add=add;if(gold.length)o.gold=gold;if(ring.length)o.ring=ring;if(drop.length)o.drop=drop;if(Object.keys(dem).length)o.dem=dem;if(lat)o.lat=lat;
    o.t=arWkSay(o);out.push(o);}
  return out[0].add?out:null;}
// The file, never trusted: a run definition like AR_RUNS's, or null.
function arWkValid(j,key){if(!pzObj(j)||Object.keys(j).some(k=>!AR_WK_FIELDS.includes(k))||j.v!==AR_WK_V||j.key!==key||pzWeekStart(key)==null||!pzCityOk(j.hq))return null;
  if(!Number.isInteger(j.budget)||j.budget<50000||j.budget>2e7)return null;
  if(j.rev!==undefined&&!(Number.isInteger(j.rev)&&j.rev>=2&&j.rev<=999))return null;if(j.ref!==undefined&&!pzObj(j.ref))return null;
  const name=arWkTxt(j.name,AR_WK_NAMES),joke=arWkTxt(j.joke,AR_WK_JOKES),briefs=arWkBriefs(j.briefs,j.hq);if(!name||!joke||!briefs)return null;
  return {id:arWkId(key),key,wk:true,n:arWkSay1(name),j:arWkSay1(joke),hq:j.hq,via:[],budget:j.budget,briefs,rev:j.rev||1};}
// The run behind an id, when it is this week's.
function arWkRun(id){const w=UI.arWk;return w&&w.def&&w.def.id===id?w.def:null;}
// ---------- fetching it: when Puzzles opens, never on page load ----------
function arWkEnsure(){const key=pzWeekKey(new Date()),w=UI.arWk;if(w&&w.key===key&&(w.def||Date.now()-w.at<5*60e3))return;
  const st=UI.arWk={key,def:null,at:Date.now()};let done=false;
  const fin=def=>{if(done)return;done=true;clearTimeout(to);if(UI.arWk!==st)return;st.def=def;st.at=Date.now();const el=$('arWk');if(el)el.outerHTML=arWkRow();};
  const ac=window.AbortController?new AbortController():null,to=setTimeout(()=>{if(ac)ac.abort();fin(null);},5000);
  if(!window.fetch||location.protocol==='file:'){fin(null);return;}
  try{fetch(`architect/weekly/${key}.json`,ac?{signal:ac.signal}:{}).then(r=>r.ok?r.json():null).then(j=>arWkValid(j,key),()=>null).then(fin,()=>fin(null));}catch(e){fin(null);}}
// Its row in the Puzzles menu, above the handmade runs; nothing while there is none.
function arWkRow(){const w=UI.arWk,r=w&&w.key===pzWeekKey(new Date())?w.def:null;if(!r)return '<div id="arWk"></div>';
  const x=arLoad().runs[r.id],ok=x&&(x.rv||1)===r.rev?x:null;
  return `<div class="scn pzwk" id="arWk"><div class="grow"><div class="eyebrow">🗓️ ${tr('architect_weekly.weekly_run')} · ${arWkNext(new Date())}</div><div class="nm">${esc(r.n)} <span class="pzst">${pzStarStr(ok?ok.st:0)}</span></div><div class="meta">${esc(r.j)}</div><div class="meta">${tr('architect.n_briefs',{n:r.briefs.length})} · 🏠 ${esc(CITY[r.hq].name)} · ${tr('puzzles.budget_x',{x:fmt$(r.budget)})}${ok&&ok.sp!=null?' · '+tr('puzzles.best_x',{x:fmt$(ok.sp)}):''}</div></div>${btn(tr('common.play'),'pzArStart',{id:r.id},ok&&ok.st>=3?'ghost':'pink')}</div>`;}
// "New run in 2 d 14 h": when next week's run comes out.
function arWkNext(now){const t=pzWeekStart(pzKeyAdd(pzWeekKey(now),1))-now,m=Math.max(1,Math.ceil(t/60e3)),d=Math.floor(m/1440),h=Math.floor(m%1440/60);
  return d?tr('architect_weekly.next_run_in_d_h',{d,h}):tr('architect_weekly.next_run_in_h_m',{h,m:m%60});}
