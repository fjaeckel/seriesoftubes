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
function dfAllowed(a,b){if(isSub(a,b))return !!subDfCable(a,b);return cnCity(a)===cnCity(b)&&!uaePair(a,b)&&!landX(a,b);}
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
function chWhy(l,o){const O=OPT[o];if(!techOk('opt',o,O.lvl))return tr('action_helpers.unlocks_at_customer_level_n',{n:O.lvl});if(O.sys==='roadm'&&!isRdm(l.sys))return tr('action_helpers.needs_a_roadmaster_9000_line_system');if(!optMode(o,l)){const mx=optModes(o,l).at(-1)[1];if(l.sub&&l.own&&!l.seat)return tr('action_helpers.this_channel_reaches_max_km_on',{max:mx.toLocaleString(),span:spanKm(l).toLocaleString()});return tr('action_helpers.too_far_even_at_its_slowest',{span:spanKm(l).toLocaleString(),max:mx.toLocaleString()});}
  if((l.ch||[]).length+soldSlots(l)>=chMax(l))return soldSlots(l)?tr('action_helpers.sys_is_full_max_channels_sold',{sys:DF_SYS[l.sys].n,max:chMax(l),sold:soldSlots(l)}):tr('action_helpers.sys_is_full_max_channels',{sys:DF_SYS[l.sys].n,max:chMax(l)});
  for(const c of [l.a,l.b]){const p=S.pops[c];if(p&&RG[p.rgen||0].cls<O.rg)return tr('action_helpers.needs_routers_with_pn_ports_or',{pn:RG[mainRG(O.rg)].pn,city:CITY[c].name});}return '';}
function bbCost(c){return 15000+CITY[c].P*20;}
function after(){if(pzOn()){pzAfter();return;}if(S)purgeInc();compute();checkGoals();renderAll();if(S&&!$('dash').hidden)renderDash();save();}
const isTablet=()=>innerWidth>760&&innerWidth<=1200;
function selectLink(id){UI.sel={type:'link',id};UI.confirm=null;if(isTablet()||isPhone())UI.leftOpen=false;$('panel').classList.remove('full');renderPanel();renderLeft();}
function selectCity(c){UI.sel={type:'city',id:c};UI.confirm=null;if(isTablet()||isPhone())UI.leftOpen=false;const P=$('panel');if(P)P.classList.remove('full');if(!S.pops[c])UI.tab='cust';renderPanel();}

