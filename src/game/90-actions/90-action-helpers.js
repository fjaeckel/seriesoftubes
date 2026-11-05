// Overland routes already dug between two cities, in the order they were built (#77). The first is the
// main route; every other one was a diverse route and keeps that price when you add waves to it.
function landTrenches(a,b){const out=[];for(const l of pairLinks(a,b)){if(l.kind==='vxc'||l.cable||l.sub)continue;const k=l.trench||l.id;let t=out.find(x=>x.k===k);if(!t)out.push(t={k,n:0,caps:[]});t.n++;t.caps.push(capName(l));}return out;}
// Which route a new wave joins: null = a new diverse route. 'same' is the old two-way choice (the main route).
function routeJoin(a,b){const ts=landTrenches(a,b),r=UI.route||'';if(r==='same')return ts[0]||null;if(r.startsWith('t:'))return ts.find(t=>t.k===r.slice(2))||null;return null;}
function pairLinks(a,b){return S.links.filter(l=>(l.a===a&&l.b===b)||(l.a===b&&l.b===a));}
// A city pair's metric goes with its last link, so a new link between the same cities starts on normal.
function prunePairMet(){const m=S.pairMet;if(!m)return;const k=new Set(S.links.map(edgeKey));for(const x of Object.keys(m))if(!k.has(x))delete m[x];}
// Short, busy subsea routes (London–Amsterdam, London–Paris) sell dark fiber pairs too.
function subDfCable(a,b){return cablesOk(a,b).filter(c=>CAB[c.cid].df).sort((x,y)=>x.km-y.km)[0]||null;}
function dfAllowed(a,b){if(noTalk(a,b))return false;if(isSub(a,b))return !!subDfCable(a,b);return cnCity(a)===cnCity(b)&&!uaePair(a,b)&&!landX(a,b);}
// A link starts at one of your POPs. The map only drags one from a POP, but a typed order (the agent API) names both ends.
function linkFromWhy(a){return S.pops[a]?'':tr('action_helpers.you_have_no_pop_in_city',{city:CITY[a].name});}
function linkFromOk(a){const w=linkFromWhy(a);if(w){toast(w,'bad');sfx('err');}return !w;}
// ...and ends at a city you could build a POP in (#203): a typed order can name one the map does not show.
function linkToOk(b){if(S.pops[b]||cityOn(b))return true;toast(popOffWhy(b),'bad');sfx('err');return false;}
// A retired small city (off: true) takes no new POP; the nearest open city in its country stands in for it.
function popOffWhy(c){const C=CITY[c],near=CITIES.filter(o=>!o.off&&o.cc===C.cc).sort((x,y)=>kmBetween(c,x.id)-kmBetween(c,y.id))[0];
  return tr('action_helpers.city_is_off_the_map_small',{city:C.name,near:near?near.name:''});}
// Why a city takes no exchange of your own. The reasons a POP would not fix come first.
function foundIxWhy(c){const C=CITY[c];if(C.cn)return tr('link_panels.running_an_exchange_in_mainland');
  if(S.myIx[c])return tr('action_helpers.you_already_run_ix_in_city',{ix:esc(S.myIx[c].name),city:C.name});
  if(C.ix)return tr('action_helpers.city_already_has_an_exchange_ix',{city:C.name,ix:esc(C.ix)});
  return S.pops[c]?'':tr('action_helpers.you_have_no_pop_in_city_build',{city:C.name});}
/* Optics you unplug go on a spares shelf instead of in the bin (#45): the next channel of that type uses a spare
   for free (only the regen sites' transponders are new), or you sell it on eBuy for part of the price. */
const SPARE_RESALE=0.4,spareN=o=>(S&&S.spares&&S.spares[o])|0,spareValue=o=>Math.round(optCost(o)*SPARE_RESALE);
// A fiber given up (a cancelled IRU, a cable called off, a decommissioned POP) keeps its optics: they go on the shelf too (#229).
const chBack=links=>{let n=0;for(const l of links)for(const o of (l&&l.ch)||[])if(OPT[o]){S.spares=S.spares||{};S.spares[o]=(S.spares[o]||0)+1;n++;}return n;};
function chCost(l,o){const r=REGEN_CH*(l.regen|0);return Math.round(optCost(o)*(spareN(o)>0?r:1+r));}
function optCost(o){return Math.round(OPT[o].cost*techMul(OPT[o].lvl)*hwMul('opt')*(S&&S.ev&&S.ev.tariff>S.day?1.4:1));}
// Line systems upgrade in place: Rainbow → ROADMaster → C+L. Every lit pair gets the new gear.
const sysNext=l=>l.sys==='lite'?'roadm':l.sys==='roadm'?'cl':null,sysUpCost=l=>{const t=sysNext(l);return t?sysCost(t)*(t==='cl'&&l.own?Math.max(1,l.pairs|0):1):0;};
function pairBtn(l){if(!l.own||!isRdm(l.sys)||l.ready>S.day)return '';const n=Math.max(1,l.pairs|0);if(n>=pairsMax(l))return `<span class="meta" style="align-self:center">${tr('action_helpers.n_fiber_pairs_lit_the_trench',{n})}</span>`;
  const full=(l.ch||[]).length+soldSlots(l)>=chMax(l),c=pairCost(l);return btn(l.sub?tr('action_helpers.light_fiber_pair_n_price',{n:n+1,price:fmt$(c)}):tr('action_helpers.light_fiber_pair_n_price_mo',{n:n+1,price:fmt$(c),mo:fmt$(ampCount(l.km)*AMP_MO)}),'addPair',{id:l.id},full?'pink sm':'ghost sm',!full||S.cash<c);}
function chWhy(l,o){const O=OPT[o];if(!techOk('opt',o,O.lvl))return tr('action_helpers.unlocks_at_customer_level_n',{n:O.lvl});if(O.sys==='roadm'&&!isRdm(l.sys))return tr('action_helpers.needs_a_roadmaster_9000_line_system');if(!optMode(o,l)){const mx=optModes(o,l).at(-1)[1];if(l.sub&&l.own&&!l.seat){const v={max:mx.toLocaleString(),span:spanKm(l).toLocaleString()};
    // Terminals and engineering only stretch the long-haul transponders: where they cannot help this optic, say what reaches instead.
    if(!optMode(o,withSubUps(l))){const alt=Object.keys(OPT).filter(x=>(OPT[x].sys!=='roadm'||isRdm(l.sys))&&optMode(x,withSubUps(l))).map(x=>OPT[x].n);if(alt.length)return tr('action_helpers.upgrades_cannot_stretch_this_optic',{...v,optics:alt.join(', ')});}
    return tr('action_helpers.this_channel_reaches_max_km_on',v);}return tr('action_helpers.too_far_even_at_its_slowest',{span:spanKm(l).toLocaleString(),max:mx.toLocaleString()});}
  if((l.ch||[]).length+soldSlots(l)>=chMax(l))return soldSlots(l)?tr('action_helpers.sys_is_full_max_channels_sold',{sys:DF_SYS[l.sys].n,max:chMax(l),sold:soldSlots(l)}):tr('action_helpers.sys_is_full_max_channels',{sys:DF_SYS[l.sys].n,max:chMax(l)});
  for(const c of [l.a,l.b]){const p=S.pops[c];if(p&&RG[p.rgen||0].cls<O.rg)return tr('action_helpers.needs_routers_with_pn_ports_or',{pn:RG[mainRG(O.rg)].pn,city:CITY[c].name});}return '';}
function bbCost(c){return 15000+CITY[c].P*20;}
/* A click that changes nothing routing reads (the log, offers, cash, names, settings…) keeps the routing it has:
   compute() gives the same R again for the same state (tests/compute-idempotent), so it is skipped. The key is the save
   without the fields routing never reads (tests/route-skip checks each one); any other change routes again. */
const RK_SKIP=new Set(['name','log','offers','usedNames','stats','cash','seen','tut','ach','achP','won','loanOffers','loanStrikes','uiSpeed','cam','richTold','demo','nextEvent','nextFail','done','confReg','auNews','calV','solWon','seatOff','chartSet','t1Now','ltv','capDeal','auV','pdeskRep','sv']);
function routeKey(){const o={};for(const k in S)if(!RK_SKIP.has(k))o[k]=S[k];return JSON.stringify(o);}
function routeIfChanged(){const k=S&&!pzOn()?routeKey():null;if(k&&k===UI.rk&&R===UI.rkR)return false;compute();UI.rk=k;UI.rkR=R;return true;}
function after(){if(pzOn()){pzAfter();return;}NOC.dirty=true;if(S)purgeInc();routeIfChanged();checkGoals();renderAll();if(S&&!$('dash').hidden)renderDash();save();}
const isTablet=()=>innerWidth>760&&innerWidth<=1200;
function selectLink(id){UI.sel={type:'link',id};UI.confirm=null;if(isTablet()||isPhone())UI.leftOpen=false;$('panel').classList.remove('full');renderPanel();renderLeft();}
// Frame the whole drawn line (cables bend far from the straight one) in the part of the map the panel leaves free:
// above a phone's bottom sheet, left of the side panel. Long links zoom out to fit; short ones zoom in like a city.
// A puzzle keeps its own framing beside the puzzle card (pzCam).
function focusLink(id){if(pzOn())return;const l=S.links.find(x=>x.id===id);if(!l||!CITY[l.a]||!CITY[l.b])return;const pts=linkGeom(l).pts;
  let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;for(const [x,y] of pts){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
  const P=$('panel'),r=P&&!P.hidden&&P.getBoundingClientRect();let fl=0,fr=CW,ft=70,fb=CH;
  if(r&&r.width>0){if(r.width>CW*0.6)fb=Math.min(fb,r.top);else fr=Math.min(fr,r.left);}
  // Phones leave a thin strip above the sheet: a fixed margin would eat most of it.
  const m=(a,b)=>Math.max(40,b-a-Math.min(100,(b-a)*0.3)),fw=m(fl,fr),fh=m(ft,fb),z=clamp(Math.min(fw/Math.max(1,x1-x0),fh/Math.max(1,y1-y0),Math.max(cam.z,1.2)),ZMIN,ZMAX);
  cam.z=z;cam.x=(x0+x1)/2-((fl+fr)/2-CW/2)/z;cam.y=(y0+y1)/2-((ft+fb)/2-CH/2)/z;wrapCam();}
function selectCity(c){UI.sel={type:'city',id:c};UI.confirm=null;UI.offerAt=null;if(isTablet()||isPhone())UI.leftOpen=false;const P=$('panel');if(P)P.classList.remove('full');if(!S.pops[c])UI.tab='cust';renderPanel();}

