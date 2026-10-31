function cnOk(){return S.cnLic&&S.cnLic.state==='ok';}
// Few networks in the building means few transit sellers to haggle with: up to 1.8× where almost nobody is present.
// Hand-set markets (Korea, Australia, Belgian red tape) keep their own price.
const txComp=c=>{const q=CITY_PDB[c];return q?clamp((1000/Math.max(q[1],10))**0.15,1,1.8):1;};
// No neutral data center means building your own room: POPs cost more to build and to run.
const colo=c=>{const q=CITY_PDB[c];return !q?1:q[0]===0?1.5:q[0]<=2?1.25:1;};
const popMo=c=>Math.round(POP_MO*colo(c));
function regionMult(c){const C=CITY[c];if(!C||C.cn)return 1;if(C.kr)return KR_TRANSIT;if(C.au)return AU_TRANSIT;if(C.tape)return 1.5;const base=C.reg==='AS'?2.5:C.reg==='AF'?2:C.reg==='OC'?1.8:C.reg==='SA'?1.6:1;return Math.round(base*txComp(c)*10)/10;}
// A network's own markup on top of that, where it is far from home (Glowball Sakura Lager in Asia and New Zealand).
// What a home pays, against the usual bill.
const arpuOf=c=>CITY[c].arpu||(CITY[c].kr&&scnRule('sender')?KR_ARPU:1);
const netMult=(n,c)=>regionMult(c)*((n&&n.far&&CITY[c]&&n.far[CITY[c].reg])||1);
const uaePair=(a,b)=>!!CITY[a].uae&&!!CITY[b].uae;
const rainPair=(a,b)=>!!(CITY[a].rain||CITY[b].rain);
// Every city has a country (cc), but the border toll is Africa's: elsewhere a wave crosses borders at the plain price.
const borderPair=(a,b)=>CITY[a].reg==='AF'&&CITY[b].reg==='AF'&&CITY[a].cc!==CITY[b].cc;
// Perth to the east coast: the sea route round the south coast is domestic (AU_WAVE.ew), and the Nullarbor
// fiber costs a little more again because the incumbents own it.
const NULLARBOR=1.7,nullPair=(a,b)=>!!CITY[a].au&&!!CITY[b].au&&(a==='per')!==(b==='per');
const andesPair=(a,b)=>!!CITY[a].andes&&!!CITY[b].andes&&CITY[a].andes!==CITY[b].andes;
// A pair an anchor-prone cable serves (the Baltic): the map calls it overland, but the fibre lies on the seabed (Anchors Away).
let ANCHOR_P=null;const anchorPair=l=>(ANCHOR_P||(ANCHOR_P=new Set(CABLE_PAIRS.filter(p=>CAB[p.cid]&&CAB[p.cid].anchor).map(p=>edgeKey(p))))).has(edgeKey(l));
/* Overland between continents (Europe to the Middle East and Asia) crosses a dozen borders and as many
   carriers, each taking a cut: in real life it costs ten times the subsea route or more (#40). */
const LAND_X=45,landX=(a,b)=>!isSub(a,b)&&CITY[a].reg!==CITY[b].reg;
function landMult(a,b){if(isSub(a,b))return 1;if(uaePair(a,b))return 3;return (landX(a,b)?LAND_X:1)*(andesPair(a,b)?2:1)*(nullPair(a,b)?NULLARBOR:1)*(rainPair(a,b)?2:1)*(borderPair(a,b)?2:1);}
function landWhy(a,b){if(isSub(a,b))return '';if(uaePair(a,b))return tr('geography_and_latency.inside_the_uae_only_the_two');
  const r=[];if(CITY[a].reg!==CITY[b].reg)r.push(tr('geography_and_latency.overland_between_continents_crosses',{x:LAND_X}));if(andesPair(a,b))r.push(tr('geography_and_latency.this_route_crosses_the_andes_2'));if(nullPair(a,b))r.push(tr('geography_and_latency.this_route_crosses_the_nullarbor_x',{x:NULLARBOR}));if(borderPair(a,b))r.push(tr('geography_and_latency.this_route_crosses_a_border_in'));if(rainPair(a,b))r.push(tr('geography_and_latency.this_route_goes_into_the_amazon'));return r.join(' ');}
function linkLat(l){const f=l.kind==='df'?(l.own?(l.sub?seaLatencyFactor(l):1.1):1.25):l.kind==='vxc'?1.4:l.cable?(CAB[l.cable].lat||1):1.3;return l.km*f/200;}
/* Wave prices differ a lot by market (TeleGeography): Europe's dense, competitive metro and
   long-haul routes are cheap (Frankfurt–London 100G ≈ $1,150/mo), the US costs more, and
   routes into Africa are several times dearer (Africa–Europe ≈ 5.9× London–New York).
   Each route also gets its own market mood, and new leases get cheaper every year (~8%). */
const WAVE_LAND={EU:0.65,AM:1,SA:1.6,AS:1.4,OC:1.2,AF:2.2},WAVE_SUB={EU:0.8,AM:1,SA:2,AS:1.5,OC:1.5,AF:4.5};
const WAVE_NAME={EU:tr('common.europe'),AM:tr('common.north_america'),SA:tr('common.south_america'),AS:tr('common.asia'),OC:tr('common.oceania'),AF:tr('common.africa')};
function waveMarket(a,b,sub){const ra=CITY[a].reg,rb=CITY[b].reg,T=sub?WAVE_SUB:WAVE_LAND,au=sub?AU_WAVE.sub:AU_WAVE.land;
  const fa=CITY[a].au?au:(T[ra]||1),fb=CITY[b].au?au:(T[rb]||1),reg=sub&&nullPair(a,b)?AU_WAVE.ew:sub?Math.max(fa,fb):(fa+fb)/2;
  const key=a<b?a+b:b+a,mood=0.85+(hstr(key+'|mood')%31)/100;
  const ero=Math.max(0.55,Math.pow(0.92,Math.floor((S?S.day:0)/360)));
  return {m:reg*mood*ero,reg,mood,ero};}
function marketNote(a,b,sub){const k=waveMarket(a,b,sub),ra=CITY[a].reg,rb=CITY[b].reg;const where=ra===rb?WAVE_NAME[ra]:tr('geography_and_latency.a_to_b',{a:WAVE_NAME[ra],b:WAVE_NAME[rb]});
  const lvl=k.reg<0.9?tr('geography_and_latency.cheap_lots_of_competing_fiber'):k.reg<=1.05?tr('common.about_average'):k.reg<2?tr('geography_and_latency.pricey_fewer_carriers'):tr('geography_and_latency.expensive_scarce_capacity');const since=k.ero<1?tr('geography_and_latency.and_prices_have_fallen_p_since',{p:Math.round((1-k.ero)*100)}):'';
  return k.mood<0.97?tr('geography_and_latency.where_lvl_this_route_is_p',{where,lvl,p:Math.round((1-k.mood)*100),since}):k.mood>1.03?tr('geography_and_latency.where_lvl_this_route_is_p_0196',{where,lvl,p:Math.round((k.mood-1)*100),since}):tr('geography_and_latency.where_lvl_this_route_is_right',{where,lvl,since});}
function waveRoute(a,b,mult,border){const cabs=cablesOk(a,b),sub=isSub(a,b);let via=UI.via;
  if(!cabs.find(c=>c.cid===via))via=sub?(cabs[0]?cabs[0].cid:null):(via==='land'||!via?'land':'land');
  if(!via)return null;const bf=border?3*(UI.cnPrem&&(a==='hkg'||b==='hkg')?1.6:1):1;
  if(via==='land')return {via,cabs,cab:null,km:kmBetween(a,b),sub:false,wm:mult*landMult(a,b)*waveMarket(a,b,false).m};
  const c=cabs.find(x=>x.cid===via);return {via,cabs,cab:via,km:c.km,sub:true,wm:bf*CAB[via].price*waveMarket(a,b,true).m};}
function viaSeg(a,b){const cabs=cablesOk(a,b),sub=isSub(a,b);if(!cabs.length)return landMult(a,b)>1?`<p class="note">${landWhy(a,b)}</p>`:'';const wr=waveRoute(a,b,1,false);
  const opts=(sub?[]:[{v:'land',l:`${tr('common.overland')} <small>${landMult(a,b)>1?landMult(a,b)+'× · ':''}${(kmBetween(a,b)*1.3/200).toFixed(1)} ms</small>`}]).concat(cabs.map(c=>({v:c.cid,l:`${esc(CAB[c.cid].name)} <small>${CAB[c.cid].price}× · ${(c.km*(CAB[c.cid].lat||1)/200).toFixed(1)} ms${CAB[c.cid].age==='old'?' · '+tr('geography_and_latency.old_cuts_often'):''}</small>`})));
  return `<h4 class="sub4">${tr('common.route')}</h4><div class="seg">${opts.map(o=>btn(o.l,'via',{v:o.v},wr&&wr.via===o.v?'pink':'ghost')).join('')}</div>${wr&&wr.cab?`<p class="note">${esc(CAB[wr.cab].blurb)} ${tr('geography_and_latency.all_your_waves_on_one_cable')}</p>`:''}`;}
function bestLat(a,b,f){const ls=S.links.filter(l=>!linkDown(l)&&(!f||f(l)));const dist={[a]:0},done=new Set();for(;;){let u=null,ud=Infinity;for(const k in dist)if(!done.has(k)&&dist[k]<ud){u=k;ud=dist[k];}if(u===null)break;if(u===b)return ud;done.add(u);for(const l of ls){if(l.a!==u&&l.b!==u)continue;const v=l.a===u?l.b:l.a,nd=ud+linkLat(l)+0.05;if(nd<(dist[v]??Infinity))dist[v]=nd;}}return Infinity;}
