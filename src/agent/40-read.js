/* ================= AGENT API: reading the game =================
   Every function takes and returns plain JSON and only reads the game. */
/* Dotted subtrees, no wildcards. An array walks by index (`biz.3`) or by entity id (`links[#id]`). */
function apiPath(o,p){
  if(p===undefined||p===null||p==='')return o;
  let v=o;
  for(const k of String(p).split('.')){
    if(v==null)return undefined;
    if(Array.isArray(v)){const i=Number(k);
      v=(Number.isInteger(i)&&String(i)===k&&i>=0&&i<v.length)?v[i]:v.find(x=>x&&typeof x==='object'&&x.id===k);}
    else if(v instanceof Set)v=[...v];
    else if(v instanceof Map)v=Object.fromEntries(v);
    else if(typeof v==='object')v=v[k];
    else return undefined;}
  return v;}

function apiJson(v){
  if(v instanceof Set)return [...v].map(apiJson);
  if(v instanceof Map)return apiJson(Object.fromEntries(v));
  if(v&&typeof v==='object')return Array.isArray(v)?v.map(apiJson):Object.fromEntries(Object.entries(v).map(([k,x])=>[k,apiJson(x)]));
  if(typeof v==='function')return undefined;
  return v;}

/* The tables the argument domains point at. Everything is a static reference except three,
   each computed for a reason: BADGES hides unearned secrets like the badge wall; conferences
   carries the keys confGo/confSponsor need, which exist in no field of S; TE_RECIPES renders
   each recipe's script, because the source is a function and some read the live network. The
   recipes' relevance score is not exposed: judging which one fits is the agent's job. */
const API_TABLES={ROCKETS,CRUSTS,PIE_RD,PIE_SPAT_DEF,SALES,CITIES,NETS,CABLES,XIX,PORT,LT,NNI,VXC,RG,OPT,DF_SYS,FAB,SCRUB_TIERS,BIZ_T,LEVELS,GOALS,BROKER_GOALS,SCN,BANKS,REQS,NSH,MET,PREF,RT,PPOL,CONFS,LAG_MAX,PNI_LAG_MAX,PNI_LAG_RT,RMAX,REGEN_MAX,START_CASH,CONF_COST,CONF_SP,CAP_COST,CAP_LV,CONF_DAYS,SUB_UPGRADES,SEA_DESIGNS,TE_COST,TE_MO,MYIX_COST,CN_LIC,SITE2_COST,MYIX_FAB,INTERNS,OPSK,CHARTERS,SEAT_N,CORE_LV,CORE_COST,CORE_REQ,CORE_LAB,INTERN_MO,PZ_TIERS,AR_TIERS,PZ_RG};
const API_MADE={
  BADGES:()=>!S?[]:BADGES.map(b=>{const on=S.ach&&S.ach[b.id]!==undefined,ever=!!hof()[b.id];
    return b.secret&&!on&&!ever?{id:b.id,i:'❔',t:'???',d:tr('badges.a_secret_badge'),r:b.r,secret:true}:{...b,ever};}),
  conferences:()=>!S?[]:upcomingConfs(75).map(cf=>({key:cf.key,name:cf.n,city:cf.c,day:cf.day,capacity:!!cf.cap,cost:confCost(cf),sponsorCost:confSp(cf)?CONF_SP:null})),
  TE_RECIPES:()=>!S?[]:TE_RECIPES.map(r=>({id:r.id,name:tr(r.n),description:tr(r.d),script:r.src().join('\n')})),
};
function API_CATALOG_TABLE(name){return name in API_MADE?API_MADE[name]():API_TABLES[name];}

/* UI minus the render caches and pointer scratch, which are inputs to nothing.
   Everything a command binds (pending, route, via, dfSrc, dfSys, seaDesign, cnPrem, decom,
   teDraft, confirm) stays, so an agent can see what it was given. */
const API_UI_HIDDEN={_lh:1,_ph:1,_tb:1,_layer:1,layerAt:1,hover:1,drag:1,snap:1};

/* ---------- text as a player reads it ---------- */
const API_BLOCK=/^(DIV|P|H1|H2|H3|H4|SECTION|LI|UL|OL|TR|TABLE|NAV|HEADER|FOOTER|BUTTON|LABEL|DETAILS|SUMMARY)$/,API_MAX_TEXT=8000;
// One line per block, no runs of spaces. jsdom has no innerText, so this walks the nodes itself.
function apiFullText(x){
  let el=x;
  if(typeof x==='string'){el=document.createElement('div');el.innerHTML=x;}
  if(!el)return '';
  const out=[];
  const walk=n=>{
    if(n.nodeType===3){out.push(n.nodeValue);return;}
    if(n.nodeType!==1||n.hidden||/^(SCRIPT|STYLE|SVG|CANVAS)$/i.test(n.tagName))return;
    if(n.tagName==='BR'){out.push('\n');return;}
    // A dropdown reads as its choice: hundreds of options would crowd out the rest (the catalog lists them).
    if(n.tagName==='SELECT'){const o=n.options[n.selectedIndex];out.push(' ',o?o.text:'',' ');return;}
    // Blocks get their own line; inline tags a space, so "Revenue<b>$2k</b>" does not read as one word.
    const sep=API_BLOCK.test(n.tagName)?'\n':' ';
    out.push(sep);for(const c of n.childNodes)walk(c);out.push(sep);};
  walk(el);
  return out.join('').split('\n').map(l=>l.replace(/\s+/g,' ').replace(/ ([.,;:!?)])/g,'$1').replace(/\( /g,'(').trim()).filter(Boolean).join('\n');}
const apiText=(x,max=API_MAX_TEXT)=>{const s=apiFullText(x);return s.length>max?s.slice(0,max)+'\n…':s;};
const apiR1=v=>typeof v==='number'&&isFinite(v)?Math.round(v*10)/10:v;
const apiFail=msg=>{throw new Error(msg);};
const apiNorm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const apiParse=s=>{try{return JSON.parse(s||'{}');}catch(e){return {};}};

/* ---------- finding things by id or by name ---------- */
function apiBest(list,q,keys){const n=apiNorm(q);if(!n)return null;
  for(const test of [v=>v===n,v=>v.startsWith(n),v=>v.includes(n)]){const hit=list.find(x=>keys(x).some(k=>test(apiNorm(k))));if(hit)return hit;}
  return null;}
const apiNetOf=q=>NET[q]||apiBest(NETS,q,n=>[n.id,n.name,'as'+n.asn,String(n.asn)])||apiFail(`No network matches "${q}". Try find.`);
const apiCityOf=q=>CITY[q]||apiBest(CITIES,q,c=>[c.id,c.name])||apiFail(`No city matches "${q}". Try find.`);
function apiAllIx(){const o=[];for(const c of CITIES)for(const x of ixStatic(c.id))o.push(x);for(const c of Object.keys(S.myIx||{}))if(!o.includes(c))o.push(c);return o;}
const apiCityName=c=>CITY[c]?CITY[c].name:c;
const apiIncText=i=>apiText(i.msg||incTitle(i),400);
const apiMyPops=()=>Object.keys(S.pops).map(apiCityName).join(', ');

/* ---------- the network at a glance, and the world ---------- */
function apiStatus(){
  const goal=goals().find(g=>S.done[g.id]===undefined),t1=isTier1(),k=o=>Object.fromEntries(Object.entries(o||{}).map(([a,v])=>[a,Math.round(v)]).filter(([,v])=>v));
  return {
    name:S.name,asn:S.asn,home:apiCityName(S.home),mode:S.mode,rules:S.rules&&S.rules.preset,
    day:S.day,date:dateStr(S.day),cash:Math.round(S.cash),level:S.lvl||0,
    tier:tierLabel(),whyNotTier1:t1?null:apiText(t1Why()),
    goal:goal?{title:apiText(goal.t),what:apiText(goal.d)}:null,
    monthly:{revenue:Math.round(R.revMo),cost:Math.round(R.costMo),profit:Math.round(R.revMo-R.costMo),revenueBy:k(R.rev),costBy:k(R.cost)},
    traffic:{demandGbps:apiR1(R.demand),servedGbps:apiR1(R.served),reach:apiR1((R.reach||0)*100)+'%',peeringSessions:R.sessions},
    counts:{pops:Object.keys(S.pops).length,links:S.links.length,transitPorts:S.transit.length,exchangePorts:Object.keys(S.ixp).length,
      pnis:S.pni.length,cacheBoxes:S.caches.length,customers:S.biz.length,offers:S.offers.length},
    pops:Object.keys(S.pops).map(apiCityName),
    incidents:S.inc.map(i=>({id:i.id,type:i.type,what:apiIncText(i),until:i.until!==undefined?dateStr(i.until):undefined,rushRepairCost:i.cost||undefined})),
    lost:!!S.lost,won:!!S.won,
  };}

function apiNetwork(q){
  const n=apiNetOf(q),id=n.id,eg=R.netEg&&R.netEg[id];
  return {
    id,name:n.name,asn:n.asn,type:TYPE_L[n.type],policy:n.pol,
    requirements:{minIxGbps:n.minIx,minPniGbps:n.minPni,paidFeePerMonth:n.paidFee,freeFromLevel:n.freeLv},
    trafficShare:apiR1(NSH[id]*100)+'%',transitPerGbps:n.price?apiR1(n.price*S.priceMul):null,
    homeMarkets:n.cc?[].concat(n.cc):[],pops:n.pops.map(apiCityName),
    exchanges:n.ix==='ALL'?'most exchanges where it has a PoP':(n.ix||[]).map(x=>ixName(x)),
    upstreams:(n.up||[]).map(u=>NET[u]?NET[u].name:u),customerCone:(DOWN[id]||[]).length,
    neededForTier1:t1Need().some(x=>x.id===id),mergedInto:merged(id)?(MERGERS.find(m=>m.id===id)||{}).into:undefined,
    about:apiText(n.blurb),
    you:{
      reachable:!!(R.reachable&&R.reachable[id]),demandGbps:apiR1((R.demTo&&R.demTo[id])||0),
      egressGbps:eg?Object.fromEntries(Object.entries(eg).map(([k,v])=>[k,apiR1(v)])):null,
      pnis:S.pni.filter(p=>p.net===id).map(p=>({id:p.id,city:apiCityName(p.city),port:pniPN(p),count:p.n||1,ready:pniOn(p)})),
      exchangeSessions:Object.keys(S.ixp).filter(x=>ixSessions(x).has(id)).map(ixName),
      howToPeer:apiText(offTransitHint(id,S.home)),
    },
  };}

function apiCity(q){
  const C=apiCityOf(q),c=C.id,P=S.pops[c];
  const cab=CABLE_PAIRS.filter(p=>p.a===c||p.b===c).map(p=>({cable:CAB[p.cid]?CAB[p.cid].name:p.cid,to:apiCityName(p.a===c?p.b:p.a),km:p.km}));
  const here=NETS.filter(n=>n.pops.includes(c)&&!n.tail).sort((a,b)=>b.share-a.share);
  return {
    id:c,name:C.name,country:C.cc,region:C.reg,about:C.note?apiText(C.note):undefined,dataCenter:C.dc,
    canBeHome:homeOk(c),
    exchanges:ixIdsIn(c).map(x=>({id:x,name:ixName(x),members:ixMembers(x).length,yourPort:S.ixp[x]!==undefined})),
    transit:NETS.filter(n=>sellsAt(n,c)).map(n=>({id:n.id,name:n.name,type:TYPE_L[n.type],perGbps:apiR1(transitPerG(n,c,false)*S.priceMul)})).sort((a,b)=>a.perGbps-b.perGbps),
    networksHere:here.length,biggestNetworksHere:here.slice(0,15).map(n=>n.name),cables:cab,
    you:P?{demandGbps:apiR1((R.cityDem||{})[c]||0),servedGbps:apiR1((R.citySrv||{})[c]||0),routers:P.routers,down:P.down>S.day?dateStr(P.down):false,
      broadband:!!P.bb,links:S.links.filter(l=>l.a===c||l.b===c).length}:null,
  };}

function apiFind(q,kind){
  const n=apiNorm(q),hit=(...k)=>k.some(v=>apiNorm(v).includes(n)),out={};
  if(!n)apiFail('Give a word to search for.');
  if(!kind||kind==='city')out.cities=CITIES.filter(c=>hit(c.id,c.name)).slice(0,20).map(c=>({id:c.id,name:c.name,country:c.cc}));
  if(!kind||kind==='network')out.networks=NETS.filter(x=>hit(x.id,x.name,String(x.asn))).slice(0,20).map(x=>({id:x.id,name:x.name,asn:x.asn,type:TYPE_L[x.type]}));
  if(!kind||kind==='cable')out.cables=Object.values(CAB).filter(x=>hit(x.id,x.name)).slice(0,20).map(x=>({id:x.id,name:x.name,lands:[...new Set(x.pairs.flatMap(p=>[p[0],p[1]]))].map(apiCityName)}));
  if(!kind||kind==='exchange')out.exchanges=apiAllIx().filter(x=>hit(x,ixName(x))).slice(0,20).map(x=>({id:x,name:ixName(x),city:apiCityName(ixCity(x))}));
  return out;}

function apiTrace(from,to){
  const src=apiCityOf(from).id;
  if(!S.pops[src])apiFail(`You have no POP in ${apiCityName(src)}. Yours: ${apiMyPops()}.`);
  let target=null;
  if(typeof to==='string'&&/^city:/i.test(to))target={city:apiCityOf(to.slice(5)).id};
  else{try{target={net:apiNetOf(to).id};}catch(e){target={city:apiCityOf(to).id};}}
  if(target.city&&!S.pops[target.city])apiFail(`A traceroute to a city goes to one of your POPs: ${apiMyPops()}.`);
  const r=traceroute(src,target);
  return {text:r.text,why:apiText(r.why||''),asPath:r.asPath||null};}

function apiPeering(q,where,via){
  const n=apiNetOf(q),id=n.id,out=[];
  if(!via||via==='pni')for(const c of (where?[apiCityOf(where).id]:Object.keys(S.pops).filter(c=>n.pops.includes(c)))){
    const r=peerOk(id,'pni',c);
    out.push({via:'pni',city:apiCityName(c),ok:!!r.ok,why:r.why?apiText(r.why):undefined,feePerMonth:r.fee,free:r.free,minimumPort:PORT[pniMin(id)].n});}
  if(!via||via==='ix')for(const x of Object.keys(S.ixp).filter(x=>ixMembers(x).includes(id)&&(!where||ixCity(x)===apiCityOf(where).id))){
    const r=peerOk(id,'ix',x);
    out.push({via:'ix',exchange:ixName(x),ok:!!r.ok,why:r.why?apiText(r.why):undefined,session:ixSessions(x).has(id)});}
  return {network:n.name,policy:n.pol,hint:apiText(offTransitHint(id,where?apiCityOf(where).id:S.home)),
    checks:out,note:out.length?undefined:'No POP or exchange port of yours is where this network is. Build one first: see network.'};}

function apiHotSpots(limit=10){
  const top=a=>a.sort((x,y)=>y.util-x.util).slice(0,limit),pct=(u,c)=>c>0?apiR1((u/c)*100):null;
  const links=S.links.map(l=>{const cap=capOf(l),u=(R.load||{})[l.id]||0;return {id:l.id,between:apiCityName(l.a)+' – '+apiCityName(l.b),kind:l.kind,capacity:capName(l),usedGbps:apiR1(u),util:pct(u,cap),down:linkDown(l)};});
  const transit=S.transit.map(t=>{const cap=lagCap(PORT[t.tier].g,t.n),u=(R.useT||{})[t.id]||0,q=(R.p95&&R.p95[t.id])||u;
    return {id:t.id,city:apiCityName(t.city),carrier:NET[t.net].name,port:lagName(t.tier,t.n),usedGbps:apiR1(u),util:pct(u,cap),billPerMonth:Math.round(transitMo(t,q))};});
  const pnis=S.pni.filter(pniOn).map(p=>{const cap=pniG(p)*(p.n||1),u=(R.usePni||{})[p.id]||0;return {id:p.id,network:NET[p.net].name,city:apiCityName(p.city),port:pniPN(p),usedGbps:apiR1(u),util:pct(u,cap)};});
  const viaTransit=NETS.filter(n=>R.netEg&&R.netEg[n.id]&&R.netEg[n.id].t>0.05).sort((a,b)=>R.netEg[b.id].t-R.netEg[a.id].t).slice(0,limit)
    .map(n=>({id:n.id,network:n.name,overTransitGbps:apiR1(R.netEg[n.id].t),howToPeer:apiText(offTransitHint(n.id,S.home))}));
  const bill={};for(const t of transit)bill[t.carrier]=(bill[t.carrier]||0)+t.billPerMonth;
  return {links:top(links),transitPorts:top(transit),pnis:top(pnis),transitBillByCarrier:bill,biggestTrafficStillOnTransit:viaTransit};}

/* ---------- the contract: commands, arguments, reference tables, raw state ---------- */
const apiDenied=name=>own(API_DENY,name)?API_WHY[API_DENY[name]]:null;
const apiKind=name=>API_CMD[name]?'game':API_VIEW[name]?'view':API_BOUND[name]?'draft':API_SESSION[name]?'session':null;
const apiSpec=name=>API_CMD[name]||API_VIEW[name]||API_SESSION[name]||null;
const apiClasses=()=>({game:Object.keys(API_CMD),view:Object.keys(API_VIEW),draft:Object.keys(API_BOUND),session:Object.keys(API_SESSION),denied:Object.keys(API_DENY)});

// One argument as the schema states it. Table domains name their catalog table rather than list every id.
function apiArgDoc([name,dom,req]){
  const a={name,required:req!==false},d=API_DOMAINS[dom];
  if(!d){a.type=dom;return a;}
  a.domain=dom;
  if(d.table)a.from=d.table;
  else{const v=apiDomValues(dom);if(Array.isArray(v))a.values=v;else if(v&&v.from!==undefined)a.range=v;}
  return a;}
function apiSchema(section){
  const cmd=s=>({args:(s.args||[]).map(apiArgDoc),doc:s.doc}),relay=API_CTX.relay;
  const doc={
    mode:apiMode(),
    clock:apiClockDoc(),
    commands:Object.fromEntries(Object.entries(API_CMD).map(([n,s])=>[n,{...cmd(s),dryRun:!!s.quote,
      ...(s.decides?{decides:true}:{}),...(s.confirm?{confirm:s.confirm}:{}),...(s.open?{opens:s.open}:{}),...(s.reads?{report:true}:{})}])),
    view:Object.fromEntries(Object.entries(API_VIEW).map(([n,s])=>[n,cmd(s)])),
    session:Object.fromEntries(Object.entries(API_SESSION).map(([n,s])=>[n,{...cmd(s),...(relay&&API_PLAYER_OWNS[n]?{refused:API_OWN_WHY}:{})}])),
    drafts:API_BOUND,
    denied:Object.fromEntries(Object.keys(API_DENY).sort().map(n=>[n,apiDenied(n)])),
    domains:Object.fromEntries(Object.entries(API_DOMAINS).map(([n,d])=>{const v=apiDomValues(n);
      return [n,{kind:d.kind==='fn'?'custom':d.kind,...(d.table?{from:d.table}:{}),
        ...(!d.table&&Array.isArray(v)?{values:v}:v&&v.from!==undefined?{range:v}:v&&v.of?{of:v.of}:{})}];})),
    state:relay?Object.fromEntries(Object.entries(API_STATE_DOC).map(([k,d])=>[k,API_WITHHELD[k]?{...d,withheld:API_WITHHELD[k]}:d])):API_STATE_DOC,
    results:API_RESULTS_DOC,
  };
  if(section===undefined||section===null||section==='')return doc;
  if(!(section in doc))apiFail(`No section "${section}". Sections: ${Object.keys(doc).join(', ')}.`);
  return doc[section];}
function apiCatalog(name){
  if(name===undefined||name===null||name===''){
    return {tables:[...Object.keys(API_TABLES),...Object.keys(API_MADE)].sort().map(k=>{const t=k in API_MADE?API_MADE[k]():API_TABLES[k];
      return {name:k,n:Array.isArray(t)?t.length:t&&typeof t==='object'?Object.keys(t).length:1};})};}
  if(name in API_MADE)return apiJson(API_MADE[name]());
  if(name in API_TABLES)return apiJson(API_TABLES[name]);
  apiFail(`No table "${name}". Call catalog without a name for the list.`);}
// In the player's tab the dice are held back: a withheld field, or one inside the subtree asked for, is left out.
function apiState(path){
  if(!S)return null;
  const p=path===undefined||path===null?'':String(path),v=apiJson(apiPath(S,p));
  if(v===undefined)return null;
  if(!API_CTX.relay)return v;
  for(const w of Object.keys(API_WITHHELD)){
    if(w===p||p.startsWith(w+'.'))return null;
    if(p&&!w.startsWith(p+'.'))continue;
    const ks=(p?w.slice(p.length+1):w).split('.');let o=v;
    for(let i=0;i<ks.length-1&&o&&typeof o==='object';i++)o=o[ks[i]];
    if(o&&typeof o==='object')delete o[ks[ks.length-1]];}
  return v;}
function apiResults(path){const v=apiJson(apiPath(R,path));return v===undefined?null:v;}
function apiUi(){const o={};for(const k of Object.keys(UI))if(!API_UI_HIDDEN[k])o[k]=apiJson(UI[k]);return o;}
function apiActions(){
  const sig=s=>(s.args||[]).map(a=>a[0]+(a[2]===false?'?':'')).join(','),typed={};
  for(const t of [API_CMD,API_VIEW,API_SESSION])for(const [n,s] of Object.entries(t))typed[n]=sig(s);
  return {typed,drafts:Object.keys(API_BOUND)};}
