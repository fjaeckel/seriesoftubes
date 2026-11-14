/* ---------- Pie in the Sky: incidents in orbit (docs/plans/pie-in-the-sky.md) ----------
   Rule O5: only with chaos on (chaosMul() reads rule('chaos')), never in the first 90 days after the unlock, so a quiet
   ruleset (and a sandbox without chaos) has a quiet sky. Each one is an ordinary S.inc entry: the NOC list, fixInc
   (paying for a fix ends it), the day tick's "resolved", spicy stretching and standing orders all work as for cables.
   What an incident does is read back from S.inc, so nothing else has to be undone. A booster that tips over on the drone
   ship is in pieFly(); the astronomers ask a question, so they live with the spats (65-pie-spats.js). */
const PIE_INC=['piedig','piefood','pielaser','pierain','piestorm'],PIE_TROPIC=23.5,PIE_ROOMBA=120e6,PIE_FOOD_MUL=0.25,PIE_INC_RATE=1/40,
  PIE_DIG_FIX=300000,PIE_RAIN=0.3,PIE_ASTRO_N=200,PIE_HIT=0.1;
// PIE_HIT: the most of a crust one incident may take (a storm 2 to 10% over its week, a food fight 5 to 10%), so a bad
// week hurts but never empties the sky.
FOUNDER_POSTS.push(N_('pie.fp_3am'),N_('pie.fp_astro'),N_('pie.fp_debris'),N_('pie.fp_spat'),N_('pie.fp_storm'));
// Chaos on, a company to annoy, and the 90 quiet days are over.
function pieChaos(){const P=S&&S.pie;return !!P&&!!P.co&&chaosMul()>0&&S.day-P.born>=PIE_QUIET;}
const pieIncOf=(t,r)=>S.inc.find(i=>i.type===t&&i.ref===r&&i.until>S.day)||null;
const pieLiveAll=()=>Object.keys(CRUSTS).reduce((a,id)=>a+pieLive(id),0);
// Read by pieDishes(), pieQuote() and pieLiveLas() in 60-features/99-pie-in-the-sky.js.
function pieDishMul(x){let m=1;for(const i of S.inc)if(i.type==='pierain'&&i.ref===x.city&&i.until>S.day)m=PIE_RAIN**(1+0.5*(x.band||0));return m*pieSpatDishMul(x);}
function pieCrMul(cr){return 1+(pieIncOf('piefood',cr)?PIE_FOOD_MUL:0)+pieGrabMul();}
function pieLasCut(id){return !!S.inc.length&&!!pieIncOf('pielaser',id);}
function pieIncTitle(t){return {piedig:tr('pie_inc.t_dig'),piefood:tr('pie_inc.t_food'),pielaser:tr('pie_inc.t_laser'),pierain:tr('pie_inc.t_rain'),piestorm:tr('pie_inc.t_storm')}[t]||'';}
// clearInc(): a dish dug up comes back when no other backhoe still holds it.
function pieIncClear(i){if(i.type!=='piedig'||!S.pie)return;const x=S.pie.dishes.find(d=>d.city===i.ref);if(x)x.down=remainUntil(o=>o.type==='piedig'&&o.ref===i.ref);}
// sanitize(): orbit incidents point at a crust or a city, and go when the company does.
function pieIncFix(s){const ok=!!s.pie;s.inc=s.inc.filter(i=>{if(!PIE_INC.includes(i.type))return true;if(!ok)return false;
  if(['piefood','pielaser','piestorm'].includes(i.type)?!own(CRUSTS,i.ref):!isCity(i.ref))return false;
  i.start=int(i.start,0,s.day,s.day);i.until=int(i.until,0,s.day+400,s.day);if(i.type==='piestorm')i.f=clamp(num(i.f,0),0,PIE_HIT);return true;});}
// One day of a storm (its first is the day it starts; the day tick resolves it on its last).
function pieStormBite(i){if(!own(CRUSTS,i.ref))return;const n=Math.max(1,i.until-i.start),q=(1-Math.pow(1-i.f,1/n))*(S.pie.safe?0.25:1);i.lost=(i.lost|0)+pieLose(i.ref,q);}
// Pies lost from every cohort of a crust alike (counted as they fly: a worn cohort loses its worn share).
function pieLose(cr,q){const c=S.pie.crusts[cr],life=CRUSTS[cr].life;let lost=0;for(const k of c.cohorts){const x=Math.min(k.n,Math.round(k.n*q));lost+=x?pieAlive(k,life)*x/k.n:0;k.n-=x;}c.cohorts=c.cohorts.filter(k=>k.n>=1);return Math.round(lost);}
function pieIncToast(i,press,acts=[]){toast(`<b>🛰️ ${pieIncTitle(i.type)}</b><br>${esc(i.msg)}<br><i>${esc(press)}</i>`,'bad',(i.cost?[{l:`${i.fix||tr('common.rush_repair')} ${fmt$(i.cost)}`,act:'fixInc',args:{id:i.id}}]:[]).concat(acts),incOpen(i));sfx('alert');}
const pieAdd=o=>{addInc(o);return S.inc[S.inc.length-1];};
function pieIncDay(d){
  // A storm drags pies down a little every day; safe mode saves three quarters of them, and carries nothing meanwhile.
  for(const i of S.inc){if(i.type==='piestorm'&&i.until>d&&d>i.start)pieStormBite(i);
    // spicy chaos stretches an incident (stretchInc); the dish it holds down follows it
    else if(i.type==='piedig'&&i.until>d){const x=S.pie.dishes.find(o=>o.city===i.ref);if(x&&!(x.down>=i.until))x.down=i.until;}}
  if(!pieChaos())return;
  // Rule F4: while the chaos monkey visits, it snips laser links too.
  if(mkOn()&&Math.random()<1/20)pieIncFire('laser');
  if(Math.random()<PIE_INC_RATE*chaosMul())pieIncFire();}
function pieIncOpts(){const P=S.pie,o=[],live=id=>pieLive(id),dish=x=>!!S.pops[x.city];
  if(Object.keys(CRUSTS).some(id=>live(id)>0&&!pieIncOf('piestorm',id)))o.push(['storm',2]);
  if(Object.keys(CRUSTS).some(id=>live(id)>=100&&!pieIncOf('piefood',id)))o.push(['food',0.4]);
  if(P.dishes.some(x=>dish(x)&&Math.abs(CITY[x.city].lat)<=PIE_TROPIC&&!pieIncOf('pierain',x.city)))o.push(['rain',3]);
  if(P.dishes.some(x=>dish(x)&&!(x.down>S.day)))o.push(['dig',2]);
  if(pieLiveAll()>=PIE_ASTRO_N&&!P.spat.astro)o.push(['astro',1]);
  o.push(['founder',2]);return o;}
// Fires one orbit incident (k forces which, for tests and the monkey); true when something happened.
function pieIncFire(k){const P=S.pie;if(!P||!P.co)return false;const d=S.day;
  if(!k){const o=pieIncOpts();let r=Math.random()*o.reduce((a,x)=>a+x[1],0);k=o[o.length-1][0];for(const x of o){r-=x[1];if(r<=0){k=x[0];break;}}}
  const crs=f=>Object.keys(CRUSTS).filter(f);
  if(k==='storm'){const c=crs(id=>pieLive(id)>0&&!pieIncOf('piestorm',id));if(!c.length)return false;const cr=pick(c),f=+(PIE_HIT/5+Math.random()*PIE_HIT*4/5).toFixed(3);
    const i=pieAdd({type:'piestorm',ref:cr,until:d+7,f,lost:0,cost:0,msg:tr('pie_inc.storm_msg',{crust:tr(CRUSTS[cr].n),p:pct(f)})});pieFounder(N_('pie.fp_storm'),{c:cr});pieStormBite(i);
    pieIncToast(i,tr('pie_inc.storm_press'),P.safe?[]:[{l:tr('pie_inc.safe_now'),act:'pieSafe',args:{}}]);return true;}
  if(k==='food'){const c=crs(id=>pieLive(id)>=100&&!pieIncOf('piefood',id));if(!c.length)return false;const cr=pick(c),n=pieLose(cr,PIE_HIT/2+Math.random()*PIE_HIT/2);
    const i=pieAdd({type:'piefood',ref:cr,until:d+360,cost:piePrice(PIE_ROOMBA),fix:tr('pie_inc.food_fix'),msg:tr('pie_inc.food_msg',{crust:tr(CRUSTS[cr].n),n,p:pct(PIE_FOOD_MUL)})});
    pieFounder(N_('pie.fp_debris'),{c:cr});pieIncToast(i,tr('pie_inc.food_press'));compute();return true;}
  if(k==='rain'){const c=P.dishes.filter(x=>S.pops[x.city]&&Math.abs(CITY[x.city].lat)<=PIE_TROPIC&&!pieIncOf('pierain',x.city));if(!c.length)return false;const x=pick(c);
    const i=pieAdd({type:'pierain',ref:x.city,until:d+rint(2,4),cost:0,msg:tr('pie_inc.rain_msg',{city:CITY[x.city].name})});pieIncToast(i,tr('pie_inc.rain_press'));compute();return true;}
  if(k==='dig'){const c=P.dishes.filter(x=>S.pops[x.city]&&!(x.down>S.day));if(!c.length)return false;const x=pick(c);
    const i=pieAdd({type:'piedig',ref:x.city,until:d+rint(2,3),cost:PIE_DIG_FIX,msg:tr('pie_inc.dig_msg',{city:CITY[x.city].name})});x.down=Math.max(x.down||0,i.until);
    pieIncToast(i,tr('pie_inc.dig_press'));compute();return true;}
  if(k==='laser'){const c=crs(id=>pieLiveLas(id)>0);if(!c.length)return false;const cr=pick(c);
    const i=pieAdd({type:'pielaser',ref:cr,until:d+rint(3,4),cost:0,msg:tr('pie_inc.laser_msg',{crust:tr(CRUSTS[cr].n)})});i.until=Math.min(i.until,d+7);
    if(S.monkey)S.monkey.n++;pieIncToast(i,tr('pie_inc.laser_press'));compute();return true;}
  if(k==='astro')return pieSpatStart('astro');
  if(k==='founder'){S.stats.incidents++;S.stats.survived++;pieFounder(N_('pie.fp_3am'));
    if(Math.random()<0.5){for(const b of S.biz)b.mood=Math.max(1,b.mood-5);toast(`<b>📱 ${tr('pie_inc.t_founder')}</b><br>${tr('pie_inc.founder_dip')}<br><i>${tr('pie_inc.founder_press')}</i>`,'bad');}
    else{S.ev.viral=Math.max(S.ev.viral||0,d+5);toast(`<b>📱 ${tr('pie_inc.t_founder')}</b><br>${tr('pie_inc.founder_spike')}<br><i>${tr('pie_inc.founder_press')}</i>`,'goal');}
    sfx('alert');return true;}
  return false;}
PIE_ON.day.push(pieIncDay);
