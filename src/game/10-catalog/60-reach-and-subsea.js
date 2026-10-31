/* Reach (#17, #30). Coherent optics trade speed for distance: past full-rate reach they drop to a
   slower, more robust modulation, and a bigger optic can always fall back to anything a smaller one does (#107). Regeneration sites go further: each one turns the light back into
   bits and sends it on fresh, so every optical span is shorter. Each site needs a regen card per channel. */
const REGEN_COST=30000,REGEN_MO=900,REGEN_CH=0.5,REGEN_MAX=8;
const spanKm=l=>Math.ceil(l.km/((l.regen|0)+1));
/* Subsea glass is engineered end to end for one route: ultra-low-loss, large-area fiber and a repeater every
   ~70 km, no regens in the middle of the sea (#66, #68). A consortium cable lands in several countries on its way, so a
   seat on one can regenerate in those landing stations; your own point-to-point cable cannot. Optics reach about half as far again as on land, and the same physics caps
   every wave on a cable, leased or your own: transatlantic gets 1.6T, transpacific 800G. */
const SUB_REACH=1.5,reachOn=(r,sub)=>sub?Math.round(r*SUB_REACH):r;
const SUB_MAXKM=()=>subReach(1,1);
// Upgrades improve long-haul modes, not the nominal 1.6T/3.2T rate.
const SUB_UPGRADES={terminal:{n:N_('reach_and_subsea.premium_submarine_terminals'),cost:5000000,days:30},engineering:{n:N_('common.optical_engineering'),cost:12000000,days:180}};
const subUpgradeReady=(l,k)=>l.kind==='df'&&l.sub&&l.own&&Number.isFinite(l['sub'+k])&&l['sub'+k]<=S.day;
const subUpgradeCost=(l,k)=>SUB_UPGRADES[k].cost+(k==='engineering'?Math.round(l.km*1000):0);
// Pending transmission work follows the construction schedule. Keep the actual
// shift (the last crew purchase can save fewer than 30 days) and completed work.
function setCableReady(l,ready,day=S.day){const shift=ready-l.ready;
  if(l.kind==='df'&&l.own&&l.sub)for(const k of Object.keys(SUB_UPGRADES)){
    const f='sub'+k;if(Number.isFinite(l[f])&&l[f]>day)l[f]=Math.max(day+1,l[f]+shift);
  }l.ready=ready;
}
const crewCost=l=>Math.round(15000+l.km*6);
const crewSteps=l=>Math.max(0,Math.ceil((l.ready-S.day-1)/30));
// Old saves lack purchase dates. Only shorten dates beyond any valid remaining
// commissioning window. Credit elapsed time since the actual cable finish;
// recent purchases and installed upgrades stay untouched.
function repairSubUpgradeDates(l,day){if(l.kind!=='df'||!l.own||!l.sub)return;
  for(const [k,U] of Object.entries(SUB_UPGRADES)){const f='sub'+k;
    if(Number.isFinite(l[f])&&l[f]>Math.max(day,l.ready)+U.days)l[f]=l.ready+U.days;
  }
}
function optModes(o,l){return (OPT[o].modes||[[OPT[o].g,OPT[o].reach]]).map(([g,r])=>{
  let reach=reachOn(r,l.sub);
  if(l.sub&&['tp16','tp32'].includes(o)&&g<=1200){
    if(subUpgradeReady(l,'terminal'))reach=Math.max(reach,({1200:9000,800:13500,400:20000})[g]||reach);
    if(subUpgradeReady(l,'engineering'))reach=Math.round(reach*1.25);
  }
  return [g,reach];});}
function optMode(o,l){const km=spanKm(l);for(const [g,r] of optModes(o,l))if(km<=r)return {g,reach:r,full:g===OPT[o].g};return null;}
// The longest subsea span any optic lights with these upgrades in service, and the cheapest upgrades a length needs
// (null: nothing can light it). The length limit, the order screen and refunds all use these, so they agree.
const SUBR=[],subReach=(t,e)=>SUBR[(t?1:0)+(e?2:0)]??(SUBR[(t?1:0)+(e?2:0)]=Math.max(...Object.keys(OPT).flatMap(o=>optModes(o,{kind:'df',own:true,sub:true,subterminal:t?0:undefined,subengineering:e?0:undefined}).map(m=>m[1])))),
  subNeed=km=>km<=subReach(0,0)?[]:km<=subReach(1,0)?['terminal']:km<=subReach(0,1)?['engineering']:km<=subReach(1,1)?['terminal','engineering']:null;
// Upgrades a cable of this length still needs on top of the chosen ones; ['design'] when nothing can light it.
const seaLack=(km,up)=>{const n=subNeed(km);return n?n.filter(k=>!up[k]):['design'];};
const submarineRate=l=>Math.max(0,...Object.keys(OPT).filter(o=>OPT[o].lvl<=lvl()&&(OPT[o].sys!=='roadm'||isRdm(l.sys||'roadm'))).map(o=>optG(o,l)));
// The fastest single carrier any optic can run over this much subsea cable.
const subCarrier=km=>Math.max(0,...Object.values(OPT).map(O=>{const m=(O.modes||[[O.g,O.reach]]).find(([,r])=>km<=reachOn(r,true));return m?m[0]:0;}));
// A big leased wave is several carriers (6.4T = 4×1.6T), so each carrier has to make it across on its own.
const waveCar=i=>LT[i].car||LT[i].g;
function subWaveWhy(i,km,sub){if(!sub)return '';const c=subCarrier(km);return waveCar(i)>c?tr('common.km_km_of_cable_carries_at',{km:Math.round(km).toLocaleString(),g:fmtCap(c)}):'';}
const subMaxTier=km=>{let t=0;LT.forEach((T,i)=>{if(!subWaveWhy(i,km,true))t=i;});return t;};
// What an optic carries depends only on the optic, the span length and subsea or not; the map and compute() ask a lot.
// Cached per optic, span and cable state: subsea, and which submarine upgrades are in service (#78).
const OPTG={};const optG=(o,l)=>{const km=spanKm(l),fl=l.sub?1+(subUpgradeReady(l,'terminal')?2:0)+(subUpgradeReady(l,'engineering')?4:0):0,c=OPTG[o]||(OPTG[o]=[]),m=c[fl]||(c[fl]=new Map());let g=m.get(km);if(g===undefined){const x=optMode(o,l);m.set(km,g=x?x.g:0);}return g;};
// Whether upgrade k changes what any optic carries on a subsea cable this long (#198). has: the other upgrade is
// already in; otherwise k also counts when it only helps together with the other one.
const subOther=k=>k==='terminal'?'engineering':'terminal',subHelps=(km,k,has)=>{const j=subOther(k),c=(on,o)=>({kind:'df',own:true,sub:true,km,['sub'+k]:on?0:undefined,['sub'+j]:o?0:undefined});
  return (has?[1]:[0,1]).some(o=>Object.keys(OPT).some(x=>optG(x,c(1,o))!==optG(x,c(0,o))));};
const regenNeed=(o,l)=>Math.max(0,Math.ceil(l.km/reachOn(OPT[o].reach,l.sub))-1);
// The map asks for every fiber's capacity several times per frame (width, colour, label, up or down), each time over
// all its channels. Nothing changes while a frame is drawn, so draw() keeps the answers in DFC for that frame.
let DFC=null;
const dfCap=l=>{if(!DFC)return dfCap0(l);let g=DFC.get(l);if(g===undefined)DFC.set(l,g=dfCap0(l));return g;};
const dfCap0=l=>{if(l.ready>S.day||l.eqDown>S.day)return 0;const ch=l.ch||[];let g=0;for(const c of ch)g+=optG(c,l);const f=l.chFail&&l.chFail.until>S.day?l.chFail:null;if(f){const fo=f.o&&ch.includes(f.o)?f.o:ch.slice().sort((a,b)=>optG(a,l)-optG(b,l))[0];if(fo)g-=optG(fo,l);}return Math.max(0,g);};
const capOf=l=>(l.kind==='vxc'?VXC[l.vt].g:l.kind==='df'?dfCap(l):LT[l.tier].g)*(l.deg>S.day?0.5:1)*(l.loss&&l.loss.until>S.day?l.loss.f:1);
// A sick LAG (LACP trouble) keeps only part of its capacity until the incident clears.
const lagF=o=>o&&o.lacp&&o.lacp.until>S.day?o.lacp.f:1,ixLagF=x=>lagF(S.ev&&S.ev.ixlacp&&{lacp:S.ev.ixlacp[x]});
const tierW=l=>{if(l.kind==='wave')return l.tier;if(l.kind==='vxc')return 0;const g=dfCap(l);return g>=6400?4:g>=1600?3:g>=400?2:g>=100?1:0;};
const capName=l=>l.kind==='vxc'?VXC[l.vt].n:l.kind==='df'?(l.ready>S.day?tr('common.building'):(l.ch||[]).length?fmtCap(dfCap(l)||(l.ch||[]).reduce((a,c)=>a+optG(c,l),0))+' DF':tr('common.dark')):LT[l.tier].n;

