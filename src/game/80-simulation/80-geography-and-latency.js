function cnOk(){return S.cnLic&&S.cnLic.state==='ok';}
// Few networks in the building means few transit sellers to haggle with: up to 1.8× where almost nobody is present.
// Hand-set markets (Korea, Australia, Belgian red tape) keep their own price.
const txComp=c=>{const q=CITY_PDB[c];return q?clamp((1000/Math.max(q[1],10))**0.15,1,1.8):1;};
// No neutral data center means building your own room: POPs cost more to build and to run.
const colo=c=>{const q=CITY_PDB[c];return !q?1:q[0]===0?1.5:q[0]<=2?1.25:1;};
const popMo=c=>Math.round(POP_MO*colo(c));
function regionMult(c){const C=CITY[c];if(!C||C.cn)return 1;if(C.kr)return KR_TRANSIT;if(C.au)return AU_TRANSIT;if(C.ph)return PH_TRANSIT;if(C.tape)return 1.5;const base=C.reg==='AS'?2.5:C.reg==='AF'?2:C.reg==='OC'?1.8:C.reg==='SA'?1.6:1;return Math.round(base*txComp(c)*10)/10;}
// A network's own markup on top of that, where it is far from home (Glowball Sakura Lager in Asia and New Zealand).
// What a home pays, against the usual bill.
const arpuOf=c=>CITY[c].arpu||(CITY[c].kr&&scnRule('sender')?KR_ARPU:1);
const netMult=(n,c)=>regionMult(c)*((n&&n.far&&CITY[c]&&n.far[CITY[c].reg])||1);
// Pairs nobody sells a circuit between, whoever builds it: two cities, or two countries (codes in capitals).
const NO_TALK=[['kyv','mos',N_('link_modal.nobody_sells_capacity_between_kyiv')],['KP','KR',N_('link_modal.no_circuit_crosses_between_north_and')]];
const noTalk=(a,b)=>{const A=[a,CITY[a].cc],B=[b,CITY[b].cc],t=NO_TALK.find(([x,y])=>A.includes(x)&&B.includes(y)||A.includes(y)&&B.includes(x));return t?t[2]:'';};
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
// Overland between continents is dear and DIY is out, except inside one country (Moscow–Vladivostok, Istanbul–Ankara).
const LAND_X=45,landX=(a,b)=>!isSub(a,b)&&CITY[a].reg!==CITY[b].reg&&CITY[a].cc!==CITY[b].cc;
function landMult(a,b){if(isSub(a,b))return 1;if(uaePair(a,b))return 3;return (landX(a,b)?LAND_X:1)*(andesPair(a,b)?2:1)*(nullPair(a,b)?NULLARBOR:1)*(rainPair(a,b)?2:1)*(borderPair(a,b)?2:1);}
function landWhy(a,b){if(isSub(a,b))return '';if(uaePair(a,b))return tr('geography_and_latency.inside_the_uae_only_the_two');
  const r=[];if(landX(a,b))r.push(tr('geography_and_latency.overland_between_continents_crosses',{x:LAND_X}));if(andesPair(a,b))r.push(tr('geography_and_latency.this_route_crosses_the_andes_2'));if(nullPair(a,b))r.push(tr('geography_and_latency.this_route_crosses_the_nullarbor_x',{x:NULLARBOR}));if(borderPair(a,b))r.push(tr('geography_and_latency.this_route_crosses_a_border_in'));if(rainPair(a,b))r.push(tr('geography_and_latency.this_route_goes_into_the_amazon'));return r.join(' ');}
function linkLat(l){const f=l.kind==='df'?(l.own?(l.sub?seaLatencyFactor(l):1.1):1.25):l.kind==='vxc'?1.4:l.cable?(CAB[l.cable].lat||1):1.3;return l.km*f/200;}
/* Wave prices differ a lot by market (TeleGeography): Europe's dense, competitive metro and
   long-haul routes are cheap (Frankfurt–London 100G ≈ $1,150/mo), the US costs more, and
   routes into Africa are several times dearer (Africa–Europe ≈ 5.9× London–New York).
   Each route also gets its own market mood, and new leases get cheaper every year (~8%). */
const WAVE_LAND={EU:0.65,AM:1,SA:1.6,AS:1.4,OC:1.2,AF:2.2},WAVE_SUB={EU:0.8,AM:1,SA:2,AS:1.5,OC:1.5,AF:4.5};
const WAVE_NAME={EU:tr('common.europe'),AM:tr('common.north_america'),SA:tr('common.south_america'),AS:tr('common.asia'),OC:tr('common.oceania'),AF:tr('common.africa')};
function waveMarket(a,b,sub){const ra=CITY[a].reg,rb=CITY[b].reg,T=sub?WAVE_SUB:WAVE_LAND,au=sub?AU_WAVE.sub:AU_WAVE.land;
  const fa=CITY[a].au?au:(T[ra]||1),fb=CITY[b].au?au:(T[rb]||1),reg=sub&&nullPair(a,b)?AU_WAVE.ew:sub&&CITY[a].ph&&CITY[b].ph?PH_WAVE:sub?Math.max(fa,fb):(fa+fb)/2;
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
/* bestLat(a,b,f): the lowest one-way latency over the live links (f: only those), +0.05 ms a hop. latGraph() numbers the
   cities with a live link (ix) and lists each one's links once, in S.links order, with their latency (off/nb/w). latRun() is
   the search itself: the next city is the closest found so far, the first found among equals, and the sums are the same
   (d + latency + 0.05), so the same answers. Stopped at b, or run whole (no b): distances by city number, which is what
   asking from a for several cities takes (latAt(): solRoutes(), spots0(), opsDecomSafe()). */
function latGraph(f){const ix=new Map(),deg=[],E=[],id=c=>{let i=ix.get(c);if(i===undefined){ix.set(c,i=deg.length);deg.push(0);}return i;};
  for(const l of S.links){if(linkDown(l)||f&&!f(l))continue;const u=id(l.a),v=id(l.b);E.push(u,v,linkLat(l));deg[u]++;if(v!==u)deg[v]++;}
  const n=deg.length,off=new Int32Array(n+1);for(let i=0;i<n;i++)off[i+1]=off[i]+deg[i];const at=off.slice(0,n),nb=new Int32Array(off[n]),w=new Float64Array(off[n]);
  for(let k=0;k<E.length;k+=3){const u=E[k],v=E[k+1];nb[at[u]]=v;w[at[u]++]=E[k+2];if(v!==u){nb[at[v]]=u;w[at[v]++]=E[k+2];}}return {ix,n,off,nb,w};}
function latRun(g,a,b){const s=g.ix.get(a),all=b===undefined;if(s===undefined)return all?null:a===b?0:Infinity;const t=all?-1:g.ix.get(b);if(t===undefined)return Infinity;
  const {n,off,nb,w}=g,d=new Float64Array(n).fill(Infinity),seen=new Int32Array(n),done=new Uint8Array(n);let m=1;seen[0]=s;d[s]=0;
  for(;;){let u=-1,ud=Infinity;for(let i=0;i<m;i++){const k=seen[i];if(!done[k]&&d[k]<ud){u=k;ud=d[k];}}if(u<0)break;if(u===t)return ud;done[u]=1;
    for(let e=off[u];e<off[u+1];e++){const v=nb[e],nd=ud+w[e]+0.05;if(nd<d[v]){if(d[v]===Infinity)seen[m++]=v;d[v]=nd;}}}return all?d:Infinity;}
// From a whole run d out of a: the latency to b.
const latAt=(g,d,a,b)=>{if(a===b)return 0;const k=g.ix.get(b);return d&&k!==undefined?d[k]:Infinity;};
function bestLat(a,b,f){return latRun(latGraph(f),a,b);}
// From each of these cities to the ones after it in the list: [[a,b,ms]…], one search per city.
function latPairs(f,g){const G=latGraph(g),o=[];for(let i=0;i<f.length-1;i++){const d=latRun(G,f[i]);for(let j=i+1;j<f.length;j++)o.push([f[i],f[j],latAt(G,d,f[i],f[j])]);}return o;}
// The lowest one-way latency anything you could build gets between two cities (#273), the way bestLat() adds it up:
// your own fiber over land (×1.1, wherever isSub() allows it), or the route of a cable that lands at both ends (your own cable in the low-latency
// design follows it at 0.9 or better). A sea route that no cable takes needs a survey, so it does not count.
// Built from the map alone, so it is worked out once per city.
const LATF=new Map();let LATC=null;
function latFloor(a,b){let D=LATF.get(a);if(!D){if(LATW&&LATW.a===a){for(;;){const s=LATW.g.next();if(s.done){D=s.value;break;}}LATW=null;}else D=latFloor0(a);LATF.set(a,D);}return D[CIDX[b]];}
function latFloor0(a){const g=latFloorRun(a);for(;;){const s=g.next();if(s.done)return s.value;}}
/* Each city's floor follows from the catalog alone, and costs a few milliseconds: idle frames work them out ahead, a
   few cities at a time (latWarm()), your POPs' first, then the financial centres latency customers ask about. */
let LATW=null;const LAT_FIN=['nyc','chi','lon','fra','tok','sin','hkg','ams','ash'];
function latWarm(ms){if(!S||!S.pops)return;const t=performance.now();
  for(;;){if(!LATW){const a=Object.keys(S.pops).concat(LAT_FIN).find(c=>CITY[c]&&!LATF.has(c));if(!a)return;LATW={a,g:latFloorRun(a)};}
    const s=LATW.g.next();if(s.done){if(!LATF.has(LATW.a))LATF.set(LATW.a,s.value);LATW=null;}if(performance.now()-t>ms)return;}}
function* latFloorRun(a){const n=CITIES.length,D=new Float64Array(n).fill(Infinity),done=new Uint8Array(n);let k=0;
  if(!LATC){LATC=new Map();for(const c of CABLE_PAIRS){const k=Math.min(CIDX[c.a],CIDX[c.b])*4096+Math.max(CIDX[c.a],CIDX[c.b]),w=c.km*Math.min(0.9,CAB[c.cid].lat||1);if(!(LATC.get(k)<=w))LATC.set(k,w);}}
  D[CIDX[a]]=0;for(;;){if((++k&15)===0)yield;let u=-1,ud=Infinity;for(let i=0;i<n;i++)if(!done[i]&&D[i]<ud){u=i;ud=D[i];}if(u<0)break;done[u]=1;const U=CITIES[u];
    for(let i=0;i<n;i++){if(done[i])continue;const V=CITIES[i],cw=LATC.get(Math.min(u,i)*4096+Math.max(u,i));
      let w=overland(U,V)&&!noTalk(U.id,V.id)?kmBetween(U.id,V.id)*1.1:Infinity;if(cw<w)w=cw;if(w<Infinity){const d=ud+w/200+0.05;if(d<D[i])D[i]=d;}}}
  return D;}
