/* ---------- The Hyperscaler's failover drills and the law: actions (38-hyper-failover.js, 38-hyper-residency.js) ---------- */
// Why a drill of region c cannot start now, or ''.
function hsDrillWhy(c){const H=S.hs;if(!H||!H.rg[c])return tr('hyper_fail.drill_no_region');if(H.dx)return tr('hyper_fail.drill_busy',{city:CITY[H.dx.c].name});
  if(!hsLive(c))return tr('hyper_fail.drill_not_live',{city:CITY[c].name});if(!hsRepOf(c))return tr('hyper_fail.drill_no_replica');return '';}
Object.assign(ACT,{
 // A failover drill: drain the region into its replica for a day, on purpose, and see who notices.
 hsHold:({city})=>{const H=hyper()&&S.hs;if(!H||!H.rg[city])return;if(H.hold[city])delete H.hold[city];else H.hold[city]=1;sfx('click');after();},
 hsDrill:({city})=>{if(!hyper()||!S.hs||!isCity(city))return;const w=hsDrillWhy(city);if(w){toast(w,'bad');sfx('err');return;}if(!spend(HS_DRILL))return;
   const b=hsRepOf(city);S.hs.dx={c:city,b,d:S.day+1};toast(tr('hyper_fail.drill_started',{a:esc(CITY[city].name),b:esc(CITY[b].name)}),'good',[],{a:'city',v:city});sfx('build');after();},
 // The answer to a grid trip announced for tomorrow (38-hyper-director.js): rented chillers or generators for the night.
 hsPrecool:({city})=>{if(!hyper()||!S.hs||!isCity(city))return;const w=S.hs.dir&&S.hs.dir.w;
   if(!w||w.c!==city||w.ok){toast(tr('hyper_dir.precool_none',{city:esc(CITY[city].name)}),'bad');sfx('err');return;}
   if(!spend(hsChillCost(city)))return;w.ok=1;toast(tr('hyper_dir.precool_done',{city:esc(CITY[city].name)}),'good',[],{a:'city',v:city});sfx('build');after();},
});
FREEZE_ACTS.push('hsDrill');
// Very Sovereign Cloud signs only with a live region in the tenant's own country.
{const f=ACT.accept;ACT.accept=a=>{const o=hyper()&&S.hs&&a&&S.offers.find(x=>x.id===a.id);
  if(o&&o.type==='cloud'&&Array.isArray(o.p)&&o.p.includes('sov')&&!hsRgs().some(r=>CITY[r].cc===CITY[o.city].cc)){toast(tr('hyper_law.sov_needs_region',{name:esc(o.name),country:esc(ccName(CITY[o.city].cc))}),'bad');sfx('err');return;}
  f(a);};}
