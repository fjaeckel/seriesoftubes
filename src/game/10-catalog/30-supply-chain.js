/* ---------- Supply chain: hardware gets dearer over the years, with shortages that come and go ----------
   Transit keeps getting cheaper (it really does), but routers, optics and new builds drift the other way: free for
   the first six months, then +4% a year, capped at +30%. Only new purchases pay it; what you own costs what it cost.
   Now and then a shortage hits one kind of hardware for a month or two. Spares on the shelf and a yearly price lock
   with your vendor are the ways around it. */
const HW_YR=0.04,HW_CAP=1.3,HW_FREE=180,HW_LOCK_DAYS=365;
const HW_SHOCK={opt:{mul:1.5,n:N_('common.optics'),msg:N_('supply_chain.laser_shortage_the_factory_that')},
 rt:{mul:1.4,n:N_('common.routers'),msg:N_('supply_chain.chip_shortage_every_router_vendor_is')},
 build:{mul:1.3,n:N_('supply_chain.new_fiber_and_cable_builds'),msg:N_('supply_chain.every_cable_ship_is_booked')}};
const hwTrend=d=>Math.min(HW_CAP,1+HW_YR*Math.max(0,(d-HW_FREE)/365));
const hwShock=()=>{const s=S&&S.hw&&S.hw.shock;return s&&s.until>S.day?s:null;},hwLock=()=>{const l=S&&S.hw&&S.hw.lock;return l&&l.until>S.day?l:null;};
function hwMul(k){if(!S||!rule('market'))return 1;const l=hwLock();if(l)return l.mul;const s=hwShock();return hwTrend(S.day)*(s&&s.k===k?s.mul:1);}
// A lock costs a little more for a bigger network, and twice as much in the middle of a shortage.
const hwLockCost=()=>Math.round((80000+30000*Object.keys(S.pops).length)*(hwShock()?2:1)/1000)*1000;
function hwShockStart(){const k=pick(Object.keys(HW_SHOCK)),n=45+Math.floor(Math.random()*31);S.hw=S.hw||{};S.hw.shock={k,until:S.day+n,mul:HW_SHOCK[k].mul};
  toast(tr(HW_SHOCK[k].msg,{n})+(hwLock()?'<br>'+tr('supply_chain.your_price_lock_covers_you_until',{date:dateStr(hwLock().until)}):''),hwLock()?'':'bad');sfx('alert');}
function hwCard(){if(!S||!rule('market')||(S.day<=HW_FREE&&!hwShock()&&!hwLock()))return '';const t=hwTrend(S.day),s=hwShock(),l=hwLock();
  return `<div class="ibx"><div class="nm">📦 ${tr('common.supply_chain')}</div>
  <div class="kv"><span>${tr('common.hardware_prices')}</span><b>${t>1.005?tr('supply_chain.p_since_you_started',{p:pct(t-1)}):tr('supply_chain.as_when_you_started')}</b></div>
  ${s?`<div class="kv"><span>${tr('common.shortage')}</span><b>${tr('supply_chain.what_p_n_days_left',{what:tr(HW_SHOCK[s.k].n),p:pct(s.mul-1),n:s.until-S.day})}</b></div>`:''}
  ${l?`<div class="kv"><span>${tr('common.price_lock')}</span><b>${tr('supply_chain.until_date_at_p',{date:dateStr(l.until),p:pct(l.mul-1)})}</b></div>`
   :`<p class="meta">${tr('supply_chain.routers_optics_and_new_builds_at')}</p><div class="btns">${btn(tr('supply_chain.lock_prices_for_a_year_cost',{cost:fmt$(hwLockCost())}),'hwLock',{},'sm',S.cash<hwLockCost())}</div>`}</div>`;}
// Routers past the standard cage (#157) need a cage extension: pricier to install, and rent on top.
const RCAGE=6,CAGE_MUL=1.5,CAGE_MO=2000;
const routerCost=(g,rt)=>Math.round((ROUTER_COST+RG[g].cost*0.8)*((rt||1)>=RCAGE?CAGE_MUL:1)*hwMul('rt')*techMul(RG[g].lvl));
const routerMo=g=>ROUTER_MO+RG[g].mo,cageMo=rt=>Math.max(0,(rt||1)-RCAGE)*CAGE_MO;
// Old routers go on eBuy when you swap models or remove one (#82), like spare optics (#45). Chassis age faster.
const ROUTER_RESALE=0.3,tradeIn=(g,n)=>Math.round(RG[g].cost*n*ROUTER_RESALE),swapCost=(c,g)=>{const p=S.pops[c],rt=p.routers||1;return Math.max(0,Math.round(RG[g].cost*rt*hwMul('rt')*techMul(RG[g].lvl))-tradeIn(p.rgen||0,rt));};
const RMAX=16;
// The plain, badge-less model of each class is the default upgrade path; the others are side-grades.
const mainRG=k=>RG.findIndex(r=>r.cls===k&&!r.badge);
// Ports and waves beyond 1.6T / 6.4T only show once a router that takes them is unlocked.
const portShown=i=>i<=4||RG.some(r=>r.lvl<=lvl()&&r.maxP>=i),waveShown=i=>i<=5||RG.some(r=>r.lvl<=lvl()&&r.maxLT>=i);
