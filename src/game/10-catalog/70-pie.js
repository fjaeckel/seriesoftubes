/* ---------- Pie in the Sky: the rocket-company endgame (docs/plans/pie-in-the-sky.md) ----------
   The catalog: rockets, crusts (orbital shells of pies), prices and the small helpers everything else asks.
   Hardware is list price x PIE_MUL x hwMul(); running costs, fees and landing rights are not inflated, like the rest
   of the game. The economy and the daily tick are in 60-features/99-pie-in-the-sky.js. */
const PIE_MUL=1;
const PIE_CO=250e6,PIE_CO_MO=5e6,PIE_FAC=1e9,PIE_FAC_MO=8e6,PIE_FAC_MONTH=120,PIE_STOCK_MAX=480,
  PIE_PIE=0.5e6,PIE_LAS=0.25e6,PIE_PAD=400e6,PIE_PAD_MO=2e6,PIE_PAD_MAX=6,PIE_EQ=0.15,
  PIE_REUSE=500e6,PIE_HEAVY=3e9,PIE_HEAVY_TESTS=3,PIE_BOOST=40e6,PIE_BOOST_MAX=20,PIE_BOOSTERS=6,PIE_INS=0.08,
  PIE_DISH=25e6,PIE_ANT=2e6,PIE_ANT_MAX=16,PIE_ANT_G=20,PIE_DISH_MO=3e5,PIE_DISH_MAX=200,
  PIE_LIC_MIN=10e6,PIE_LIC_MAX=100e6,PIE_LIC_P=12000,PIE_LIC_DAYS=360,PIE_LEOIX=50e6,PIE_LEOIX_MO=1e6,PIE_PARTY=2e6,
  PIE_QUIET=90,PIE_PREP=7,PIE_Q_MAX=120,PIE_COHORTS=240,PIE_POSTS=20,PIE_RAW=0.4,PIE_BAKED=0.6,PIE_SPARE=1.1,PIE_WEAR=0.3;
// Salvage when a pad or a factory line goes: this share of what it cost.
const PIE_SALVAGE=0.25;
// Scaling up (60-features/99-pie-scale.js): more factory lines, more towers per pad, landing rights bought years ahead.
const PIE_LINE=600e6,PIE_LINE_MO=5e6,PIE_LINE_MAX=6,PIE_TOWER=150e6,PIE_TOWER_MO=1e6,PIE_TOWER_MAX=3,PIE_LIC_YEARS=[1,5,10];
// In generation order. fail: chance a launch is lost (x chaos); land: chance a reused booster does not come back.
const ROCKETS={
 falcon:{n:N_('pie.rk_falcon_punch'),d:N_('pie.rk_d_medium'),cost:60e6,pies:20,fail:0.05,gap:14},
 again:{n:N_('pie.rk_falcon_punch_again'),d:N_('pie.rk_d_reuse'),cost:30e6,pies:20,fail:0.04,land:0.06,gap:10,rd:'reuse'},
 heavy:{n:N_('pie.rk_starshipping_and_handling'),d:N_('pie.rk_d_heavy'),cost:100e6,pies:100,fail:0.08,gap:30,rd:'heavy'},
};
// need: the research that must come first. las: every pie launched afterwards has lasers. vband, eband: antennas in a
// higher band carry PIE_BAND times the Gbps (dishes are upgraded antenna by antenna) and suffer more in the rain.
const PIE_RD={reuse:{n:N_('pie.rd_reuse'),cost:PIE_REUSE},heavy:{n:N_('pie.rd_heavy'),cost:PIE_HEAVY},
 las:{n:N_('pie.rd_las'),cost:400e6},vband:{n:N_('pie.rd_vband'),cost:800e6},eband:{n:N_('pie.rd_eband'),cost:2e9,need:'vband'}};
const PIE_BAND=[1,2,4],PIE_BAND_PRICE=[1,1.75,3],PIE_BAND_N=['Ka','V','E'];
// alt km, full: pies for 100% coverage, inc: the orbit's inclination (a pad can launch to it from |lat| <= inc),
// life in game days (a year is 360), g: Gbps the whole crust carries when full.
const CRUSTS={
 short:{n:N_('pie.cr_shortcrust'),alt:550,full:1584,inc:53,life:1800,g:40000},
 frozen:{n:N_('pie.cr_frozen'),alt:560,full:520,inc:97.6,life:1800,g:10000,polar:true},
 upper:{n:N_('pie.cr_upper'),alt:1100,full:1200,inc:60,life:1800,g:24000},
 flaky:{n:N_('pie.cr_flaky'),alt:340,full:2500,inc:53,life:1080,g:60000,dense:true},
};
// Company names: the first is the default; saves keep the label, or the player's own text after a rename.
const PIE_NAMES=[
 N_('pie.co_mid_life_crisis_aerospace'),
 N_('pie.co_hubris_heavy_industries'),
 N_('pie.co_spacexpensive'),
 N_('pie.co_thrust_issues'),
 N_('pie.co_payload_bearing'),
 N_('pie.co_compensation_dynamics'),
 N_('pie.co_escape_velocity_partners'),
 N_('pie.co_gravity_is_optional'),
];
// What the Founder posts. Saves keep the label and at most a number and a crust id.
const FOUNDER_POSTS=[
 N_('pie.fp_baked'),
 N_('pie.fp_booster'),
 N_('pie.fp_dish'),
 N_('pie.fp_fail'),
 N_('pie.fp_found'),
 N_('pie.fp_launch'),
 N_('pie.fp_promise'),
 N_('pie.fp_rename'),
 N_('pie.fp_slip'),
 N_('pie.fp_test'),
 N_('pie.fp_tour'),
];
const PIE_LIC_STATES=['ok','refused','sus'];
/* Hooks for the parts built later, so they live in their own files: push functions here.
   day: f(d) once a day; launch: f(L,ok) after every launch; fail: f(L) after a lost one.
   PIE_SPATS[id] = {fix:(o,s)=>o|null}: a geopolitical spat kept in S.pie.spat[id], repaired by sanitize. */
const PIE_ON={day:[],launch:[],fail:[]},PIE_SPATS={};
const piePrice=(v,k='build')=>Math.round(v*PIE_MUL*hwMul(k));
// A pad goes on the coast: a beach city, or within 80 km of the drawn coastline (cached; cable hubs inland do not count).
const PIE_COAST=new Map();
function pieCoast(c){if(!isCity(c))return false;if(PIE_COAST.has(c))return PIE_COAST.get(c);const C=CITY[c],cl=Math.cos(C.lat*Math.PI/180);let m=1e9;
  if(!C.beach)for(const p of COAST_LL)for(const q of p){const dx=(q[0]-C.lon)*cl,dy=q[1]-C.lat,d=dx*dx+dy*dy;if(d<m)m=d;}
  const ok=!!C.beach||Math.sqrt(m)*111<=80;PIE_COAST.set(c,ok);return ok;}
// Launching nearer the equator saves fuel: up to 15% off a launch, nothing above 45 degrees.
const pieEq=c=>PIE_EQ*clamp((45-Math.abs(CITY[c].lat))/35,0,1);
// Landing rights by market size: the eyeballs of every city in the country.
const pieLicPrice=cc=>Math.round(clamp(PIE_LIC_MIN+CITIES.reduce((a,c)=>a+(c.cc===cc?c.P:0),0)*PIE_LIC_P,PIE_LIC_MIN,PIE_LIC_MAX)/1e6)*1e6;
// The feature is here: unlocked by becoming Tier 1 in a save of this version, or open gates (sandbox). Never in puzzles,
// the Architect or scenarios.
function pieOn(){return !!S&&!S.scn&&S.mode!=='puzzle'&&(!!S.pie||gatesOpen());}
const pieT1=()=>!!S.won&&isTier1();
// New things (company, factory, pads, R&D, launches, dishes) need you to be Tier 1 now, or a sandbox.
function pieCanBuild(){return pieOn()&&(gatesOpen()||pieT1());}
// Pies wear out over the last PIE_WEAR of their life, a few every day, so a launch month never falls out of the sky at once:
// a cohort counts in full until then, then less every day, and nothing at its life's end (no dice, nothing saved).
function pieAlive(k,life){const left=life-(S.day-k.day),w=life*PIE_WEAR;return left>=w?k.n:left>0?k.n*left/w:0;}
function pieLive(id){const c=S&&S.pie&&S.pie.crusts[id];if(!c)return 0;let n=0;const life=CRUSTS[id].life;for(const k of c.cohorts)n+=pieAlive(k,life);return Math.round(n);}
function pieCov(id){return own(CRUSTS,id)?Math.min(1,pieLive(id)/CRUSTS[id].full):0;}
// A crust is baked from 60%. Under that it is half-baked: from 40% (PIE_RAW) it carries a share of its traffic that grows
// to all of it at 60% (pieCarry), under 40% nothing; too many gaps.
function pieBaked(id){return pieCov(id)>=PIE_BAKED;}
function pieCarry(id){return clamp((pieCov(id)-PIE_RAW)/(PIE_BAKED-PIE_RAW),0,1);}
function pieUp(id){const P=S&&S.pie;return !!P&&!P.safe&&pieCarry(id)>0&&!(P.crusts[id].down>S.day);}
// Gbps a crust carries today: its capacity at its coverage, times the share a half-baked one manages.
const pieCap=id=>CRUSTS[id].g*pieCov(id)*pieCarry(id);
