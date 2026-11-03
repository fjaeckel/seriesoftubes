// Runs inside the game page before scripts/lib/mcp-page.js, in the game's own global scope: the typed command
// tables the MCP server's act tool dispatches through. Data and small helpers only, no state.
//
// Every action in ACT is in exactly one class (tests/mcp-commands.test.js fails otherwise, so a new action forces a
// decision): CMD, a game command with typed arguments; VIEW, which changes only what is on screen; BOUND, which only
// drafts an input another command reads; SESSION, which starts, retries or leaves a game or dismisses a coaching
// screen; or the server's DENY list (scripts/lib/mcp-page.js). CMD fields: args [name, domain|'string'|'boolean'|'integer', required]; bind(args) writes the UI
// a panel would set (bindsUI: the UI keys it touches, restored after a dry run); open/dom: the window an input lives
// in and the fields that must exist before dispatch; pass(args) reshapes the args for the action (confirmations);
// confirm 'arg' (passed through) or 'double' (the game arms a button first); decides (may end in a question); reads
// 'modal' (the window's text is the report); watch (extra fingerprint paths, #name filled from args); quote (the dry
// run, priced with the game's own helpers); doc.
window.__mcpCmds = (() => {
const API_DOMAINS={
  // Tables from the catalog: an id in a list, a key in an object, or an index into a list.
  cityId:{table:'CITIES',kind:'id'},
  netId:{table:'NETS',kind:'id'},
  cableId:{table:'CABLES',kind:'id'},
  fabId:{table:'FAB',kind:'key'},
  opticId:{table:'OPT',kind:'key'},
  systemId:{table:'DF_SYS',kind:'key'},
  designId:{table:'SEA_DESIGNS',kind:'key'},
  upgradeId:{table:'SUB_UPGRADES',kind:'key'},
  bizTypeId:{table:'BIZ_T',kind:'key'},
  portTier:{table:'PORT',kind:'index'},
  linkTier:{table:'LT',kind:'index'},
  nniTier:{table:'NNI',kind:'index'},
  vxcTier:{table:'VXC',kind:'index'},
  routerModel:{table:'RG',kind:'index'},
  scrubTier:{table:'SCRUB_TIERS',kind:'index'},
  // Small fixed vocabularies the game itself checks by list membership.
  // The link metric presets, plus "custom" for a hand-tuned number (ACT.setMetric).
  metric:{kind:'enum',values:()=>[...Object.keys(MET),'custom']},
  egress:{table:'PREF',kind:'key'},
  routeMode:{table:'RT',kind:'key'},
  site:{kind:'enum',values:['a','b','ab']},
  step:{kind:'enum',values:[1,-1]},
  connKind:{kind:'enum',values:['t','p','ix','c','nni']},
  egressKind:{kind:'enum',values:['t','p','ix','c','nni','l2']},
  peerPolicy:{table:'PPOL',kind:'enum'},
  // The intern, their orders and the new-POP template (opsHire, opsToggle, opsParam…).
  internId:{table:'INTERNS',kind:'key'},
  opsKey:{table:'OPSK',kind:'key'},
  opsPopKind:{kind:'enum',values:()=>OPS_POP.slice()},
  opsTplKey:{kind:'enum',values:()=>OPS_TPL.slice()},
  // The specialist's offers: a seat on a consortium cable, the charter, a vendor demo.
  seatPairs:{kind:'enum',values:()=>SEAT_N.slice()},
  charterKey:{table:'CHARTERS',kind:'key'},
  // The link metric editor: a factor or an exact weight (metricMode, metricSet).
  metricKind:{kind:'enum',values:['f','w']},
  // The NOC's auto-mitigation switches (ddosAuto).
  ddosKey:{kind:'enum',values:['rtbh','scrub']},
  // Puzzle and architect builds: the tiers a puzzle may light, the router models it offers.
  pztTier:{kind:'fn',ok:v=>PZ_TIERS.includes(+v)||AR_TIERS.includes(+v)},
  pzRouterModel:{table:'PZ_RG',kind:'index'},
  pzRouteMode:{kind:'enum',values:['normal','fast']},
  // The bulk PNI order takes one network or null for every network at every shared POP (ACT.pniAll).
  pniAllNet:{kind:'fn',ok:v=>v===null||(typeof v==='string'&&!!NET[v])},
  dashTab:{kind:'enum',values:()=>DTABS.slice()},
  dashSortKey:{kind:'enum',values:['name','asn','type','traffic','cost','lost']},
  leftTab:{kind:'enum',values:['goals','deals','noc','nets']},
  netFilter:{kind:'enum',values:['all','out']},
  pniFilter:{kind:'enum',values:['all','t','worth','pni']},
  listPage:{kind:'enum',values:['conn','cust','nets','pni']},
  custSortKey:{kind:'enum',values:['mood','mo','name','city']},
  connFilter:{kind:'enum',values:['all','k']},
  connSortKey:{kind:'enum',values:['k','city','name','use','mo']},
  dfSource:{kind:'enum',values:['lease','build','cable']},
  cityIdArray:{kind:'array',of:'cityId'},
  // Anything a panel can reach: an exchange city, a rival exchange id, one of your own exchanges.
  ixId:{kind:'fn',ok:v=>isIx(v)},
  // A PNI also takes tier:-1, the 1G courtesy port a network may offer (ACT.pni).
  pniTier:{kind:'fn',ok:v=>v===-1||(Number.isInteger(v)&&v>=0&&v<PORT.length)},
  // Keys are built at render time by confKey(), so they can only be resolved against the calendar.
  confKey:{kind:'fn',ok:v=>typeof v==='string'&&upcomingConfs(75).some(c=>c.key===v)},
  // traceroute goes to your own POPs and to networks; traceModal parses a net:/city: prefix.
  traceTo:{kind:'fn',ok:v=>typeof v==='string'&&(NET[v]||isCity(v))},
  // Entity ids (uid()) cannot be validated against a table: shape only. A wrong id is the game's
  // to answer, honestly, with no_effect — never a refusal invented on this side of the wall.
  entityId:{kind:'string'},
  scnId:{table:'SCN',kind:'id'},
  // A traceroute target in the modal's own terms.
};

/* Type names an arg can take instead of a domain: 'string' | 'boolean' | 'integer'. */

function apiDomCheck(dom,v){
  const d=API_DOMAINS[dom];
  // The game's own buttons ship truthiness as 0 and 1 (custOpen's {"sad":0}); accept the game's dialect.
  if(dom==='boolean')return {ok:v===true||v===false||v===0||v===1};
  if(!d)return {ok:dom==='integer'?Number.isInteger(v):typeof v===dom}; // 'string' | 'integer'
  if(d.kind==='array')return {ok:Array.isArray(v)&&v.every(x=>apiDomCheck(d.of,x).ok)};
  const t=d.table?API_CATALOG_TABLE(d.table):null;
  if(d.kind==='id')return {ok:!!t&&t.some(x=>x&&x.id===v)};
  if(d.kind==='string')return {ok:typeof v==='string'};
  if(d.kind==='key'||d.kind==='enum'){
    const vs=d.kind==='key'?Object.keys(t||{}):(t||(typeof d.values==='function'?d.values():d.values)||[]);
    return {ok:vs.includes(v)};}
  if(d.kind==='index')return {ok:Number.isInteger(v)&&v>=0&&v<(t?t.length:0)};
  return {ok:!!d.ok&&d.ok(v)};
}
function apiDomValues(dom){
  const d=API_DOMAINS[dom];if(!d)return null;
  const t=d.table?API_CATALOG_TABLE(d.table):null;
  if(d.kind==='array')return {of:d.of};
  if(d.kind==='id')return t?t.map(x=>x.id):[];
  if(d.kind==='key')return t?Object.keys(t):[];
  if(d.kind==='enum')return t||(typeof d.values==='function'?d.values():d.values)||[];
  if(d.kind==='index')return {from:0,to:(t?t.length:1)-1};
  return null;
}

const API_CMD={
/* ---------- footprint: buildings, routers, POPs ---------- */
 buildPop:{args:[['city','cityId']],
  quote:a=>({setup:popCost(a.city),blocked:cnCity(a.city)&&!cnOk()?[tr('pops_transit_ix.you_need_a_license_first_foreign')]:[]}),
  doc:'Open a POP in a city you do not have one in. Costs popCost(city).'},
 launchBB:{args:[['city','cityId']],watch:['pops.#city'],
  quote:a=>({setup:bbCost(a.city)}),
  doc:'Launch broadband to the eyeballs of a city you have a POP in. The core revenue source; one per POP.'},
 ad:{args:[['city','cityId']],watch:['pops.#city'],
  quote:a=>({setup:8000}),
  doc:'A 30-day ad campaign that boosts eyeball growth in a broadband city.'},
 addRouter:{args:[['city','cityId']],watch:['pops.#city'],
  quote:a=>{const p=S.pops[a.city];return {setup:p?routerCost(p.rgen||0,p.routers||1):0};},
  doc:'Add a router to a POP, up to RMAX. Cost rises with the model and the count.'},
 rmRouter:{args:[['city','cityId']],watch:['pops.#city'],
  quote:a=>{const p=S.pops[a.city];return {setup:-((p&&tradeIn(p.rgen||0,1))||0),blocked:p&&portsUsed(a.city)>portsMax(a.city,undefined,p.routers-1)?[tr('routing_and_routers.unplug_something_first_used_ports',{used:fmtPorts(portsUsed(a.city)),max:portsMax(a.city,undefined,p.routers-1)})]:[]};},
  doc:'Remove a router and sell it on eBuy for a trade-in. Refused while the rest cannot carry the ports.'},
 upRouter:{args:[['city','cityId'],['g','routerModel',false]],watch:['pops.#city'],
  quote:a=>{const p=S.pops[a.city];if(!p)return {};const g=a.g===undefined?mainRG(RG[p.rgen||0].cls+1):+a.g;
   return {setup:swapCost(a.city,g),blocked:[(!RG[g]||g===(p.rgen||0))?'no such model':modelFits(a.city,g)||''].filter(Boolean)};},
  doc:'Swap every router in a city for another model. Omit g for the next class up. One swap per day per city.'},
 addGen:{args:[['city','cityId']],watch:['pops.#city'],quote:a=>({setup:GEN_COST,monthly:GEN_MO}),
  doc:'Install a generator, so a power cut does not take the POP out.'},
 addSite:{args:[['city','cityId']],watch:['pops.#city'],quote:a=>({setup:SITE2_COST,monthly:SITE2_MO}),
  doc:'Add a second building in the city, so one dark data centre does not take everything down.'},
 rmSite:{args:[['city','cityId']],confirm:'double',watch:['pops.#city'],
  doc:'Remove the second building. Every port, PNI and cache there moves back to site A.'},
 decomGo:{args:[['cities','cityIdArray']],bindsUI:['decom'],bind:a=>{UI.decom=new Set((a.cities||[]).filter(c=>S.pops[c]));},
  doc:'Close POPs: cancels their ports, links, peerings and customers. Refuses to close every POP you have. Irreversible.'},
/* ---------- upstream (transit) ---------- */
 buyTransit:{args:[['city','cityId'],['net','netId'],['tier','portTier']],
  quote:a=>({setup:PORT[a.tier].setup,monthly:PORT[a.tier].tmo}),
  doc:'Order a transit port from a network that sells in that city. Billed monthly on the 95th percentile. A higher tier on an existing port upgrades it.'},
 lagT:{args:[['id','entityId'],['d','step']],watch:['transit.#id'],
  quote:a=>{const t=S.transit.find(x=>x.id===a.id);return {setup:a.d>0&&t?PORT[t.tier].setup:0};},
  doc:'Add or remove one LAG member on a transit port, up to LAG_MAX. Adding charges another port setup.'},
 cancelTransit:{args:[['id','entityId']],confirm:'arg',pass:a=>({id:a.id,ok:1}),
  doc:'Cancel a transit port.'},
 togglePrem:{args:[['id','entityId']],watch:['transit.#id'],
  doc:'Turn the premium upstream product on or off, where the network sells one in that city.'},
 cleanPipe:{args:[['id','entityId']],watch:['transit.#id'],
  quote:a=>{const t=S.transit.find(x=>x.id===a.id);return t?{monthly:cleanMo(t)}:{};},
  doc:'Add or remove the upstream DDoS-scrubbing add-on. Monthly.'},
/* ---------- exchanges ---------- */
 buyIx:{args:[['city','ixId'],['tier','portTier'],['signed','boolean',false]],decides:true,
  quote:a=>({setup:ixPortMo(a.city,a.tier),monthly:ixPortMo(a.city,a.tier),blocked:[portOk(ixCity(a.city),a.tier)?'':tr('actions.your_router_can_t_take_a',{port:PORT[a.tier].n})].filter(Boolean)}),
  doc:'Take a port on an internet exchange. Monthly. At a De-Kicks exchange the first order returns a personalised quote to answer. A remote port (no POP) is possible at 10G over a fabric.'},
 lagIx:{args:[['city','ixId'],['d','step']],watch:['ixn'],
  doc:'Add or remove one LAG member on an IX port. Not on your own exchange.'},
 cancelIx:{args:[['city','ixId']],confirm:'arg',pass:a=>({city:a.city,ok:1}),decides:true,
  doc:'Leave an exchange; drops every peering session there. De-Kicks may answer with a retention offer.'},
 rs:{args:[['city','ixId']],watch:['rs'],
  doc:'Toggle the route-server session, which peers you with everyone on the server at once.'},
 foundIx:{args:[['city','cityId']],watch:['myIx.#city'],quote:a=>({setup:MYIX_COST,monthly:MYIX_MO}),
  doc:'Found your own exchange in a city with no IX. Networks join over the following days.'},
 myIxUp:{args:[['city','cityId']],watch:['myIx.#city'],
  quote:a=>{const m=S.myIx[a.city];const f=m?(m.fab|0)+1:0,N=f<MYIX_FAB.length?MYIX_FAB[f]:null;return N?{setup:N.cost,monthly:N.mo}:{};},
  doc:'Upgrade your own exchange\'s switch fabric. Each step has a level gate.'},
/* ---------- peering and PNIs ---------- */
 peer:{args:[['city','ixId'],['net','netId']],
  doc:'Ask one network at an exchange for a session. Rejected with the network\'s own reason if its policy says no.'},
 unpeer:{args:[['city','ixId'],['net','netId']],
  doc:'Drop a peering session.'},
 peerAll:{args:[['city','ixId']],
  doc:'Ask everyone at that exchange who would say yes. No effect if there is nobody new.'},
 pni:{args:[['city','cityId'],['net','netId'],['tier','pniTier']],
  quote:a=>{const t=a.tier===-1?0:a.tier,ex=S.pni.find(p=>p.city===a.city&&p.net===a.net),r=peerOk(a.net,'pni',a.city);
   return {setup:a.tier===-1?PNI_G1_COST:(1500+PORT[t].setup/2)*((ex&&ex.n)||1),monthly:(a.tier===-1?Math.round(PORT[0].pni/2):PORT[t].pni)*((ex&&ex.n)||1),days:pniLead(a.net),
     blocked:[r.ok?'':r.why,portOk(a.city,t)?'':tr('actions.your_router_can_t_take_a',{port:PORT[t].n}),
       a.tier!==-1&&a.tier<pniMin(a.net)?tr('sites_peering_caches.net_does_not_do_port_pnis',{net:NET[a.net].name,port:PORT[t].n}):''].filter(Boolean)};},
  doc:'Order a private interconnect. tier:-1 asks for the 1G courtesy PNI where a network offers one. Takes weeks to months; an existing PNI is augmented instead.'},
 pniChase:{args:[['id','entityId']],watch:['pni.#id'],
  doc:'Chase the provisioning ticket. 15% pulls the date in by 30 days; otherwise an excuse.'},
 cancelPni:{args:[['id','entityId']],confirm:'arg',pass:a=>({id:a.id,ok:1}),
  doc:'Cancel a PNI or its pending augment.'},
 lagP:{args:[['id','entityId'],['d','step']],watch:['pni.#id'],
  doc:'Add or remove a LAG member on a PNI. Adding is an augment with a lead time.'},
 sacrif:{args:[['id','entityId']],watch:['pni.#id'],
  doc:'Mark a PNI sacrificial, so attack traffic is steered into it.'},
 peerPol:{args:[['p','peerPolicy']],watch:['ppol'],
   doc:'Set your published peering policy: open, selective or closed. It answers every peering request for you: open accepts everyone, selective takes small networks on the exchange and newcomers with an up-to-date PeeringDB, closed declines them all. The NOC log sums the week up.'},
/* ---------- caches ---------- */
 cache:{args:[['city','cityId'],['net','netId']],
  quote:a=>{const n=NET[a.net];return {monthly:n&&n.cache?CACHE_MO:0,
   blocked:n&&n.cache&&(R.demTo[a.net]||0)<n.cache.min?[tr('sites_peering_caches.net_says_not_yet_send_them',{net:n.name,min:n.cache.min})]:[]};},
  doc:'Ask a CDN to ship you a cache. Monthly. Rejected until you send that network enough traffic.'},
 rmCache:{args:[['id','entityId']],
  doc:'Send a cache box back.'},
 cacheSite:{args:[['city','cityId'],['net','netId'],['s','site']],watch:['caches'],
  doc:'Move one of that CDN\'s boxes to the other building.'},
/* ---------- backbone links ---------- */
 buildLink:{args:[['a','cityId'],['b','cityId'],['tier','linkTier'],['cable','cableId',false],['route','string',false],['premiumCrossing','boolean',false]],
  bindsUI:['pending','route','via','cnPrem'],
  bind:a=>{UI.pending={a:a.a,b:a.b};UI.route=a.route||'';UI.via=a.cable||'';UI.cnPrem=!!a.premiumCrossing;},
  pass:a=>({tier:a.tier}),
  quote:a=>{const A=a.a,B=a.b,tier=a.tier;
   if(!waveOk(A,B,tier))return {blocked:[tr('links.a_wave_wave_needs_need_at',{wave:LT[tier].n,need:waveNeed(tier)})]};
   const sib=pairLinks(A,B).filter(l=>l.kind!=='vxc'),jn=sib.length?routeJoin(A,B):null,border=cnCity(A)!==cnCity(B);
   const mult=(sib.length&&!(jn&&jn.k===(landTrenches(A,B)[0]||{}).k)?DIVERSE:1)*(border?3*((a.premiumCrossing&&(A==='hkg'||B==='hkg'))?1.6:1):1);
   const wr=waveRoute(A,B,mult,border);if(!wr)return {blocked:[tr('links.no_cable_available_for_that_route')]};
   const blocked=[],so=soldOut(A,B,tier,wr.cab);
   if(so)blocked.push(tr('links.no_wave_capacity_on_this_route',{wave:LT[tier].n,why:tr(so.why),n:Math.max(1,so.until-S.day)}));
   const w=subWaveWhy(tier,wr.km,wr.sub);if(w)blocked.push(tr('links.no_wave_waves_on_this_cable',{wave:LT[tier].n,why:w}));
   return {setup:Math.round(waveMo(wr.km,wr.sub,tier)*wr.wm)+(S.pops[B]?0:popCost(B)),monthly:Math.round(waveMo(wr.km,wr.sub,tier)*wr.wm),blocked};},
  doc:'Lease a wave between two cities; opens a POP in b if there is none. A second wave on a pair costs 1.4x unless it joins an existing trench; cross-border into mainland China costs 3x. premiumCrossing applies only via Hong Kong.'},
 upLink:{args:[['id','entityId'],['tier','linkTier']],watch:['links.#id'],
  quote:a=>{const l=S.links.find(x=>x.id===a.id);if(!l)return {};
   const blocked=[waveOk(l.a,l.b,a.tier)?'':tr('links.a_wave_wave_needs_need_at',{wave:LT[a.tier].n,need:waveNeed(a.tier)})];
   const w=subWaveWhy(a.tier,l.km,l.sub);if(w)blocked.push(tr('links.no_wave_waves_on_this_cable',{wave:LT[a.tier].n,why:w}));
   return {monthly:Math.round(waveMo(l.km,l.sub,a.tier)*(l.mult||1)),blocked:blocked.filter(Boolean)};},
  doc:'Upgrade a leased wave in place. Upward only, and only if the span and cable support it.'},
 rmLink:{args:[['id','entityId']],confirm:'double',
  quote:a=>{const l=S.links.find(x=>x.id===a.id);return {setup:-((l&&cabBack(l))||0)};},
  doc:'Decommission a link. A cancelled own-cable build refunds part of the money. Irreversible.'},
 setMetric:{args:[['id','entityId'],['v','metric']],watch:['pairMet'],
   doc:'Routing preference for the city pair this link belongs to (not the link): prefer, normal, avoid, backup, or custom (then metricMode and metricSet tune the number).'},
 setCarry:{args:[['id','entityId'],['on','boolean']],watch:['transit.#id'],
   doc:'Turn a transit port\'s Carry here on or off: it pulls that carrier\'s traffic (and its customers\') across your network from POPs that have no port of that carrier. Prefer, Backup only and RouteScript still win.'},
 setStandby:{args:[['id','entityId'],['on','boolean']],watch:['links.#id'],
  doc:'Hold a link in reserve: its capacity fills last.'},
/* ---------- fabrics and VXCs ---------- */
 buyNni:{args:[['city','cityId'],['prov','fabId'],['tier','nniTier']],
  quote:a=>({setup:NNI[a.tier]?NNI[a.tier].mo:undefined,monthly:NNI[a.tier]?NNI[a.tier].mo:undefined}),
  doc:'Take a port on an interconnection fabric. Monthly. A higher tier upgrades unless the circuits on it already exceed the smaller port.'},
 rmNni:{args:[['city','cityId'],['prov','fabId']],
  doc:'Give the fabric port back. Rejected while circuits still use it.'},
 buyVxc:{args:[['a','cityId'],['b','cityId'],['prov','fabId'],['t','vxcTier']],
  quote:a=>({monthly:vxcMo(kmBetween(a.a,a.b),isSub(a.a,a.b),a.t)}),
  doc:'Buy a virtual circuit between two fabric ports. Up in 59 seconds, which is the joke.'},
 upVxc:{args:[['id','entityId'],['t','vxcTier']],watch:['links.#id'],
  quote:a=>{const l=S.links.find(x=>x.id===a.id);return l&&l.kind==='vxc'?{monthly:vxcMo(l.km,l.sub,a.t)}:{};},
  doc:'Grow a circuit. Needs headroom at both ends.'},
 cancelVxc:{args:[['id','entityId']],confirm:'double',
  doc:'Cancel a circuit; any remote IX ports it reached go with it.'},
 setPref:{args:[['kind','connKind'],['id','entityId'],['v','egress']],watch:['transit.#id','pni.#id'],
  doc:'Egress preference for one exit: high sends more traffic that way, low keeps it for backup.'},
 siteSet:{args:[['k','connKind'],['id','entityId'],['s','site']],watch:['transit.#id','pni.#id'],
  doc:'Put a transit port, PNI or IX port in building A, B or both. Choosing both with a single member adds a LAG member first, and charges for it.'},
/* ---------- dark fiber and own cable ---------- */
 orderDf:{args:[['a','cityId'],['b','cityId'],['source','dfSource'],['system','systemId']],
  bindsUI:['pending','dfSrc','dfSys'],bind:a=>{UI.pending={a:a.a,b:a.b};UI.dfSrc=a.source;UI.dfSys=a.system;},
  quote:a=>{const A=a.a,B=a.b,sc=isSub(A,B)?subDfCable(A,B):null,km=sc?sc.km:kmBetween(A,B);
   const building=a.source==='build'&&lvl()>=3&&!sc,sys=DF_SYS[a.system]&&DF_SYS[a.system].lvl<=lvl()?a.system:'lite';
   const amps=ampCount(km),blocked=[];
   if(isSub(A,B)&&!sc)blocked.push(tr('fiber_modals.nobody_sells_dark_fiber_on_a'));
   else if(uaePair(A,B))blocked.push(tr('fiber_modals.no_dark_fiber_inside_the_uae'));
   else if(landX(A,B)&&cnCity(A)===cnCity(B))blocked.push(tr('fiber_modals.nobody_sells_one_fiber_pair_across'));
   else if(!dfAllowed(A,B))blocked.push(tr('fiber_modals.dark_fiber_across_the_chinese_border'));
   if(lvl()<2)blocked.push(tr('fiber_modals.dark_fiber_unlocks_at_customer_level'));
   return {setup:(building?dfBuildCost(km):0)+DF_SYS[sys].cost+amps*AMP_COST+(S.pops[B]?0:popCost(B)),
     monthly:(building?Math.round(km*0.15):dfLeaseMo(km))+amps*AMP_MO,days:building?dfBuildDays(km):30,blocked};},
  doc:'Get dark fiber: lease an IRU, dig your own (level 3+), or take a pair on a subsea cable. Then light it with a line system.'},
 orderCable:{args:[['a','cityId'],['b','cityId'],['design','designId',false],['terminal','boolean',false],['engineering','boolean',false]],
  bindsUI:['pending','seaDesign','seaterminal','seaengineering'],
  bind:a=>{UI.pending={a:a.a,b:a.b};UI.seaDesign=a.design||'standard';UI.seaterminal=!!a.terminal;UI.seaengineering=!!a.engineering;},
  quote:a=>{const why=ownCabWhy(a.a,a.b);if(why)return {blocked:[why]};
   const design=own(SEA_DESIGNS,a.design)?a.design:'standard',up={terminal:!!a.terminal,engineering:!!a.engineering};
   const q=seaQuote(a.a,a.b,design,up),lack=seaLack(q.km,up);
   return {setup:q.cost+(S.pops[a.b]?0:popCost(a.b)),monthly:ownCabMo(q.km),days:q.days,
     blocked:lack.map(k=>k==='design'?tr('own_cable.this_design_s_route_is_km',{km:q.km.toLocaleString()})
       :tr('own_cable.km_km_is_too_far_for',{km:q.km.toLocaleString(),what:lack.length>1?tr('own_cable.a_and_b',{a:tr(SUB_UPGRADES[lack[0]].n),b:tr(SUB_UPGRADES[lack[1]].n)}):tr(SUB_UPGRADES[lack[0]].n)}))};},
  doc:'Commission your own submarine cable. A ship sails; it takes months. The most expensive thing in the game.'},
 subUpgrade:{args:[['id','entityId'],['k','upgradeId']],watch:['links.#id'],
  quote:a=>{const l=S.links.find(x=>x.id===a.id);return l?{setup:subUpgradeCost(l,a.k),days:SUB_UPGRADES[a.k].days}:{};},
  doc:'Add premium submarine terminals or extra optical engineering to your own subsea cable. Level 4+, once each.'},
 crews:{args:[['id','entityId'],['all','boolean',false]],watch:['links.#id'],
  quote:a=>{const l=S.links.find(x=>x.id===a.id);if(!l)return {};const n=a.all?crewSteps(l):1;return {setup:n*crewCost(l),days:30*n};},
  doc:'Pay for more crews on a cable build: 30 days off per step. Only while more than a day of construction remains.'},
 addCh:{args:[['id','entityId'],['o','opticId']],watch:['links.#id'],
  quote:a=>{const l=S.links.find(x=>x.id===a.id);return l?{setup:chCost(l,a.o),blocked:[chWhy(l,a.o)].filter(Boolean)}:{};},
  doc:'Light one channel on a dark-fiber span with a given optic; uses a spare from the shelf if you have one.'},
 rmCh:{args:[['id','entityId'],['o','opticId']],watch:['links.#id'],
  doc:'Unplug a channel; the optic goes on the spares shelf.'},
 addPair:{args:[['id','entityId']],watch:['links.#id'],
  quote:a=>{const l=S.links.find(x=>x.id===a.id);return l?{setup:pairCost(l)}:{};},
  doc:'Light another fiber pair on your own cable. ROADM system, finished construction, current pair full.'},
 upSys:{args:[['id','entityId']],watch:['links.#id'],
  quote:a=>{const l=S.links.find(x=>x.id===a.id);return l?{setup:sysUpCost(l)}:{};},
  doc:'Upgrade the line system: Rainbow to ROADMaster to C+L. Every channel goes down for a day.'},
 regen:{args:[['id','entityId'],['d','step']],watch:['links.#id'],
  quote:a=>{const l=S.links.find(x=>x.id===a.id);return l&&a.d>0?{setup:REGEN_COST+Math.round((l.ch||[]).reduce((x,c)=>x+optCost(c),0)*REGEN_CH)}:{setup:0};},
  doc:'Add or remove a regeneration site on a terrestrial span, up to REGEN_MAX. Removing is refused if the optics then cannot reach.'},
 spares:{args:[['id','entityId']],watch:['links.#id'],
  doc:'Toggle keeping spare optics on site for this span, so a card failure is fixed in hours instead of days.'},
/* ---------- hardware ---------- */
 hwLock:{args:[],quote:a=>({setup:hwLockCost()}),
  doc:'Lock router, optic and build prices for a year, shortages included. Costs twice as much while a shortage runs.'},
 buySpare:{args:[['o','opticId']],
  quote:a=>({setup:optCost(a.o),blocked:[OPT[a.o]&&OPT[a.o].lvl>lvl()?tr('action_helpers.unlocks_at_customer_level_n',{n:OPT[a.o].lvl}):''].filter(Boolean)}),
  doc:'Buy a spare optic for the shelf, up to 64 of a kind. The next channel of that type is then free of optic cost.'},
 sellSpare:{args:[['o','opticId']],quote:a=>({setup:-spareValue(a.o)}),
  doc:'Sell a spare on eBuy for 40% of list.'},
 /* ---------- capacity broker ---------- */
 listFiber:{args:[['id','entityId'],['w','integer'],['p','integer',false]],watch:['links.#id'],
   doc:'List spare capacity on a dark-fiber span with a capacity broker as a standing listing: w alien waves, and p (own cables only) your spare fiber pair. The broker sells them off over time as carriers on that route want capacity; a busy route sells in days, a road to nowhere maybe once.'},
 unlistFiber:{args:[['id','entityId']],watch:['links.#id'],
   doc:'Take the listing down. What the broker already sold stays sold.'},
 setChCount:{args:[['id','entityId'],['o','opticId'],['n','integer']],watch:['links.#id'],
   quote:a=>{const l=S.links.find(x=>x.id===a.id);return l?{setup:opticCountCost(l,a.o,a.n)}:{};},
   doc:'Set how many channels of one optic model a dark-fiber span carries, in one change. Added optics come from the spares shelf when you have them (regen cards still cost their share); removed ones go back to the shelf.'},
 /* ---------- customers ---------- */
 accept:{args:[['id','entityId']],
  doc:'Sign a pending offer. Rejected without a POP in every city it needs, without free channels for a wave sale, or after an event\'s start date. Extra waves for a carrier you already serve grow that contract.'},
 decline:{args:[['id','entityId']],
  doc:'Throw an offer away.'},
 dropBiz:{args:[['id','entityId']],confirm:'double',
  doc:'Terminate a signed customer. Rejected once an event contract\'s event has started.'},
 setRoute:{args:[['id','entityId'],['m','routeMode']],watch:['biz.#id'],
  doc:'How a customer\'s traffic is routed: normal follows metrics, fast takes the lowest latency, scenic the quietest links.'},
/* ---------- traffic engineering ---------- */
 buyTE:{args:[],quote:a=>({setup:TE_COST,monthly:TE_MO,blocked:coreTE()||(S&&S.te)?[]:[tr('core.auto_te_needs_an_rsvp_te_or')]}),
   doc:'Buy the Auto-TE controller, which spills overflow onto alternate paths. Level 3+, and it needs an RSVP-TE-or-higher backbone.'},
 teToggle:{args:[],watch:['te'],
  doc:'Turn Auto-TE on or off.'},
 teCheck:{args:[['script','string']],open:'teEdit',dom:['teSrc'],reads:'modal',
  bind:a=>{$('teSrc').value=String(a.script);},
  doc:'Parse and dry-run a RouteScript without deploying it. The parse errors, or served traffic and transit cost before and after, come back as the report. No state change.'},
 teDeploy:{args:[['script','string']],open:'teEdit',dom:['teSrc'],watch:['te'],
  bind:a=>{$('teSrc').value=String(a.script).slice(0,4000);},
  quote:a=>({setup:0}),
  doc:'Deploy a RouteScript, up to 4000 characters. Rejected with the parse errors. A deploy that cuts traffic by more than 10% says so in messages.'},
 teClear:{args:[],watch:['te'],
  doc:'Delete the script and fall back to plain Auto-TE.'},
 traceRun:{args:[['from','cityId'],['to','traceTo']],open:'trace',dom:['trFrom','trTo'],reads:'modal',
  bind:a=>{$('trFrom').value=a.from;$('trTo').value=(NET[a.to]?'net:':'city:')+a.to;},
  doc:'Run a traceroute to a network or one of your own POPs. The hops come back as report text; they are not stored in the game state.'},
/* ---------- money ---------- */
 takeLoan:{args:[['id','entityId']],
  doc:'Accept a loan offer. Terms vary wildly by bank; the crypto one pays out 55-135% of face value. Equity banks take a share of the company.'},
 declineLoan:{args:[['id','entityId']],
  doc:'Throw a loan offer away.'},
 repayLoan:{args:[['id','entityId']],confirm:'double',
  quote:a=>{const l=S.loans.find(x=>x.id===a.id);return l?{setup:repayCost(l,BANKS[l.bank])}:{};},
  doc:'Repay a loan early, or buy an equity investor out.'},
/* ---------- security, China, incidents ---------- */
 buildScrub:{args:[['city','cityId'],['tier','scrubTier',false]],watch:['scrubs'],
  quote:a=>{const T=SCRUB_TIERS[a.tier||0];return {setup:T?T.cost:undefined,monthly:T?T.mo:undefined};},
  doc:'Build a scrubbing centre: 100G, 1T, 10T or 100T. Level-gated per tier; one per city.'},
 scrubUp:{args:[['city','cityId'],['tier','scrubTier']],watch:['scrubs'],
  quote:a=>({setup:Math.round(SCRUB_TIERS[a.tier].cost*0.6)}),
  doc:'Upgrade a scrubbing centre, at 60% of the tier price. Upward only.'},
 rmScrub:{args:[['city','cityId']],confirm:'double',watch:['scrubs'],
  doc:'Tear a scrubbing centre down.'},
 scrubMode:{args:[],watch:['scrubMode'],
  doc:'Switch scrubbing between always-on and on-demand.'},
 rtbh:{args:[['id','entityId',false]],watch:['ev'],
   doc:'Announce a remote-triggered blackhole for the target under attack: it goes dark at your transits, most exchanges and about half your private peers, and everyone else is saved. Withdraw with unrtbh.'},
 unrtbh:{args:[['id','entityId',false]],watch:['ev'],
   doc:'Withdraw the blackhole.'},
 ddosEngage:{args:[['id','entityId',false]],watch:['ev'],
   doc:'Engage on-demand scrubbing now: start the diversion to the nearest active scrubbing centre instead of waiting for it to engage by itself.'},
 ddosAuto:{args:[['k','ddosKey']],watch:['ddosAuto'],
   doc:'Flip a NOC auto-mitigation switch: rtbh blackholes the target of a flood on its own, scrub engages on-demand scrubbing.'},
 ddosTest:{args:[],watch:['ev'],
   doc:'Sandbox only: send yourself a test flood, to try the tools on.'},
 hackback:{args:[['id','entityId',false]],watch:['ev'],quote:a=>({setup:20000}),
   doc:'Fire the Hackback 3000(tm) at the botnet. 35% it ends the attack; otherwise a fine and a story.'},
 applyCn:{args:[],watch:['cnLic'],quote:a=>({setup:CN_LIC,days:45}),
  doc:'File for a mainland China licence through a local partner. Required before a POP in mainland China. 45 days.'},
 fixInc:{args:[['id','entityId']],watch:['inc'],
  quote:a=>{const i=S.inc.find(x=>x.id===a.id);return i&&i.cost>0?{setup:i.cost}:{};},
  doc:'Pay to rush a repair. A slow router reboot is cut to one day; anything else clears immediately.'},
/* ---------- conferences ---------- */
 confGo:{args:[['key','confKey']],watch:['confReg'],
  quote:a=>{const cf=upcomingConfs(75).find(x=>x.key===a.key);return cf?{setup:confCost(cf)}:{};},
  doc:'Register for an upcoming conference. Keys come from catalog(\'conferences\'). Peering gets easier in that region for 45 days. Capacity conferences need level 3.'},
 confSponsor:{args:[['key','confKey']],watch:['confReg'],
  quote:a=>{const cf=upcomingConfs(75).find(x=>x.key===a.key);return cf&&confSp(cf)?{setup:CONF_SP-(S.confReg&&S.confReg[a.key]?CONF_COST:0)}:{};},
  doc:'Sponsor it instead: your logo on every lanyard, a bigger effect, a bigger bill. Only where sponsorships are offered; upgrades an existing registration for the difference.'},
/* ---------- the NOC intern (standing orders) ---------- */
 opsHire:{args:[['id','internId']],quote:a=>({setup:INTERN_MO}),watch:['ops'],
   doc:'Hire the NOC intern. They run your standing orders once a game day and cost a salary a month. Level 2+, and only in a game with a clock.'},
 opsFire:{args:[],confirm:'double',watch:['ops'],
   doc:'Let the intern go. The standing orders stop; the rest of the month\'s salary is lost.'},
 opsToggle:{args:[['k','opsKey']],watch:['ops'],
   doc:'Pause or resume one standing order. Keys come from catalog(\'OPSK\'); the sheet in the game shows what each one does.'},
 opsParam:{args:[['k','opsKey'],['p','string']],watch:['ops'],
   doc:'Step one of a standing order\'s settings to its next value (the provider to prefer, the port size to order, the load ceiling…). The sheet steps the same way.'},
 opsCap:{args:[['k','opsKey']],watch:['ops'],
   doc:'Step the monthly budget of an order that has one: 10k, 25k, 50k, 100k, 250k, no limit.'},
 opsFloor:{args:[],watch:['ops'],
   doc:'Step the floor under your cash that the intern keeps clear when signing customers: 0, 50k, 250k, 1M, 5M.'},
 opsPop:{args:[['k','opsPopKind'],['city','cityId']],watch:['ops'],
   doc:'Add or remove one POP as an exception to an order: the intern never touches the POPs you except.'},
 opsTpl:{args:[['k','opsTplKey']],watch:['ops'],
   doc:'Toggle a piece of the one-tap new-POP template: broadband, a transit port, an IX port, the redundancy kit.'},
 opsNewPop:{args:[['city','cityId']],watch:['pops.#city'],
   quote:a=>{const q=S&&S.ops?opsTplQuote(a.city):null;return q?{setup:q.cost}:{};},
   doc:'Open a city from the template in one go: the POP, then broadband, transit, an IX port and the redundancy kit as the template says — all or nothing on the price.'},
/* ---------- the bulk PNI order ---------- */
 pniAll:{args:[['net','pniAllNet'],['tier','pniTier']],
   quote:a=>{const b=pniBatch(a.net,a.tier);return b?{setup:b.cost,monthly:b.mo,blocked:(b.blocked||[]).map(q=>q.why).filter(Boolean)}:{};},
   watch:['pni'],
   doc:'Order PNIs with one network (net) or every network (net:null) at all shared POPs: missing connections are added, smaller ones upgraded, each at its own minimum size. The quote is the batch total, lead times as for one PNI.'},
/* ---------- backbone technology ---------- */
 coreUp:{args:[],watch:['core'],
   quote:a=>{const n=S&&S.core?S.core.lv+1:1;return n<=4?{setup:CORE_COST[n],blocked:[(lvl()||1)<CORE_REQ[n]?tr('core.needs_customer_level_n',{n:CORE_REQ[n]}):''].filter(Boolean)}:{};},
   doc:'Buy the next backbone technology: IGP, LDP/MPLS, RSVP-TE, SR-MPLS, SRv6. One step at a time, level-gated; each step passes transit through a POP cheaper and RSVP-TE or higher unlocks Auto-TE.'},
 coreLab:{args:[],watch:['core'],quote:a=>({setup:CORE_LAB}),
   doc:'Build the interop lab in the NOC: it tests your vendors against each other first and cuts interop incidents by 60%.'},
 coreSet:{args:[['v','integer']],watch:['core'],
   doc:'Run the backbone at any level already paid for, 0 up to the highest bought.'},
/* ---------- the specialist's offers ---------- */
 demoAsk:{args:[['k','string'],['id','string']],watch:['demo'],
   doc:'Ask a vendor for a demo unit: a router, line system or optic one level above yours, delivered in about two weeks, at 60% over list until your level catches up. k and id name the thing (as the game\'s buttons pass them).'},
 seatBuy:{args:[['n','seatPairs']],decides:true,watch:['seatOff','links'],
   quote:a=>{const o=S&&S.seatOff;if(!o||!SEAT_N.includes(a.n))return {};const miss=[o.a,o.b].filter(c=>!S.pops[c]);
     return {setup:seatCost(o.km,a.n)+miss.reduce((x,c)=>x+popCost(c),0),days:seatDays(o.km)};},
   doc:'Take the consortium cable offer: own 1, 2 or 4 fiber pairs on a new subsea cable for your share of the build, and light them with your own optics. POPs open at both landings if you have none.'},
 seatNo:{args:[],watch:['seatOff'],
   doc:'Decline the consortium cable offer.'},
 charter:{args:[['k','charterKey']],watch:['charter'],
   doc:'Sign your first-month charter: global backbone (the classic game) or low-latency boutique (trading firms pay 40% more, and it has its own win). One choice per network, normal games only.'},
 mkBanana:{args:[],watch:['monkey'],
   quote:a=>({setup:mkBananaCost()}),
   doc:'Throw the chaos monkey a banana and it leaves early. Only while it is in your network; the price scales with your revenue.'},
/* ---------- link tools ---------- */
 metricMode:{args:[['id','entityId'],['k','metricKind']],watch:['pairMet'],
   doc:'Set the custom routing metric of a link\'s city pair as a factor (k:"f", the preset way) or an exact cost weight (k:"w"). Starts from the current preset\'s value; edit the number with metricSet.'},
 metricSet:{args:[['id','entityId'],['v','string']],dom:['metIn'],watch:['pairMet'],
   bind:a=>{$('metIn').value=String(a.v);},
   doc:'Write the custom metric\'s number for the link\'s city pair, in the mode metricMode set. Select the link first (view.selLink), so the panel is showing the input.'},
 seaRush:{args:[['id','entityId'],['all','boolean',false]],watch:['links.#id'],
   quote:a=>{const l=S.links.find(x=>x.id===a.id);if(!l)return {};const k=prepSteps(l),n=a.all?k:Math.min(1,k);return {setup:n*prepCost(l),days:Math.min(n*PREP_STEP,Math.max(0,l.ready-prepFloor(l)))};},
   doc:'Hurry the survey, permits and factory of your own subsea cable before laying starts: 30 days sooner per step (all: as fast as money goes), never sooner than the factory can make the cable.'},
 layShip:{args:[['id','entityId']],watch:['links.#id'],
   quote:a=>{const l=S.links.find(x=>x.id===a.id),q=l&&layQuote(l);return q?{setup:q.cost}:{};},
   doc:'Book a second lay ship on your own cable before laying starts: it lays from the other end and halves that part of the build.'},
/* ---------- standard POPs ---------- */
 popStdSet:{args:[['city','cityId']],watch:['popStd'],
   doc:'Make a POP\'s routers the standard: every new POP starts with that model and that number of routers while it is still empty.'},
 popStdClear:{args:[],watch:['popStd'],
   doc:'Stop setting a standard; new POPs go back to one basic router.'},
/* ---------- utilities ---------- */
 utilityRouteServers:{args:[['city','cityId',false]],watch:['rs'],
   doc:'Join the route server at every IX you have a port at. One call does what the button does.'},
 utilityKit:{args:[['city','cityId'],['cost','integer',false]],watch:['pops.#city','caches'],
   quote:a=>{const q=S?utilityKit(a.city):null;return q?{setup:q.cost,monthly:q.mo}:{};},
   pass:a=>({city:a.city,cost:a.cost??((utilityKit(a.city)||{}).cost)}),
   doc:'Install the POP redundancy kit in one go: generator, second building, a second router, and the cache boxes balanced between sites. Pass the quoted setup as cost; the game checks it still matches. Nothing to do reads as no_effect.'},
 utilityCaches:{args:[['city','cityId'],['quote','string',false]],watch:['caches'],
   quote:a=>{const q=S?utilityCaches(a.city):null;return q?{key:q.key}:{};},
   pass:a=>({city:a.city,quote:a.quote??((utilityCaches(a.city)||{}).key)}),
   doc:'Request a cache from each eligible provider at each site of the city, as many as demand asks for. Pass the quote\'s key back; the game checks the list has not moved under it.'},
 utilityPeers:{args:[['city','cityId',false]],watch:['peers'],
   doc:'Request peering with every eligible peer across every IX you have joined.'},
/* ---------- renaming ---------- */
 renameGo:{args:[['name','string']],open:'rename',dom:['rnIn'],watch:['name'],
   bind:a=>{$('rnIn').value=String(a.name).slice(0,24);},
   doc:'Rename your network. act opens the menu\'s rename sheet and types the name in; it is trimmed to 24 characters.'},
/* ---------- puzzles and architect runs ---------- */
 pzLinkTo:{args:[['a','cityId'],['b','cityId']],bindsUI:['pending'],decides:true,watch:['links'],
   bind:a=>{UI.pending={a:a.a,b:a.b};},
   doc:'Puzzles only: open the link picker between two cities. Answer the decision with pzLink.'},
 pzLink:{args:[['tier','pztTier']],watch:['links'],
   doc:'Puzzles only: light the pending link (from pzLinkTo) at a tier, on the picked route, in the picked trench.'},
 pzTier:{args:[['id','entityId'],['tier','pztTier']],watch:['links.#id'],
   doc:'Puzzles only: change a link\'s wave size.'},
 pzRmLink:{args:[['id','entityId']],watch:['links.#id'],
   doc:'Puzzles only: tear a link down.'},
 pzPop:{args:[['city','cityId']],watch:['pops.#city'],
   doc:'Puzzles only: open a POP in a puzzle city.'},
 pzRmPop:{args:[['city','cityId']],watch:['pops.#city'],
   doc:'Puzzles only: close a POP and the links that reach it.'},
 pzRtAdd:{args:[['city','cityId']],watch:['pops.#city'],
   doc:'Puzzles only: add a router to a POP, up to RMAX.'},
 pzRtRm:{args:[['city','cityId']],watch:['pops.#city'],
   doc:'Puzzles only: remove a router, if the ports still fit.'},
 pzRtModel:{args:[['city','cityId'],['g','pzRouterModel']],watch:['pops.#city'],
   doc:'Puzzles only: swap every router in a POP for another model.'},
 pzRoute:{args:[['i','integer'],['m','pzRouteMode']],watch:['biz'],
   doc:'Puzzles only: send one flow (index i, as state(\'biz\') lists them) along the metrics or the lowest-latency path.'},
 pzUndo:{args:[],watch:['pops','links','pairMet'],
   doc:'Puzzles only: undo the last build step, up to sixty of them.'},
 pzReset:{args:[],watch:['pops','links','pairMet'],
   doc:'Puzzles only: clear the whole build and start the puzzle over.'},
 pzArGo:{args:[],watch:['ar'],
   doc:'Architect runs only: run the chaos monkey\'s review of this brief, every tube snipped in turn.'},
 pzArSkip:{args:[],watch:['ar'],
   doc:'Architect runs only: fast-forward the review to the first cut that hurts.'},
 pzArNext:{args:[],watch:['ar'],
   doc:'Architect runs only: pass the review and sign the next brief. Rejected while the current one does not pass.'},

/* ---------- answering decisions ---------- */
 dkAccept:{args:[],watch:['dk'],
  doc:'Take the De-Kicks quote as offered and order the port.'},
 dkHaggle:{args:[],watch:['dk'],
  doc:'Haggle. 45% a better price, 30% a worse one, 25% sales stops returning your calls for a few days. Three attempts.'},
 dkWalk:{args:[],watch:['dk'],
  doc:'Walk away; the quote is remembered for 90 days.'},
 dkStay:{args:[['city','ixId']],watch:['dk'],
  doc:'Take the retention discount instead of leaving: 40% off for six months.'},
 dkOptOut:{args:[['city','ixId'],['n','string']],confirm:'double',watch:['dk'],
  doc:'Opt out of an add-on De-Kicks slipped onto the bill.'},
 closeModal:{args:[],
  doc:'Close the open window, answering nothing. Always available, so you are never stuck in front of one.'},
};

const API_VIEW={
 help:{args:[],doc:'Open the how-to-play modal.'},
 dash:{args:[],doc:'Open the NOC dashboard.'},
 dashClose:{args:[],doc:'Close the NOC dashboard.'},
 dashTab:{args:[['k','dashTab']],doc:'Switch the NOC dashboard tab.'},
 dashSort:{args:[['k','dashSortKey']],doc:'Flip a dashboard column\'s sort.'},
 dashLink:{args:[['id','entityId']],doc:'Jump from the dashboard to a link\'s panel.'},
 bank:{args:[],doc:'Open the bank.'},
 bankClose:{args:[],doc:'Close the bank.'},
 closePanel:{args:[],doc:'Close the selection panel.'},
 tab:{args:[['t','string']],doc:'Switch the city panel\'s tab.'},
 leftTab:{args:[['t','leftTab']],doc:'Switch the left drawer and open it.'},
 toggleLeft:{args:[],doc:'Open or close the left drawer.'},
 netFocus:{args:[['id','netId']],doc:'Focus one network in the left drawer.'},
 netFilter:{args:[['f','netFilter']],doc:'All networks, or only the out-of-reach ones.'},
 meetGo:{args:[['city','cityId']],doc:'Go to a city and open where to meet networks there.'},
 phoneTab:{args:[['t','leftTab']],doc:'Phone tab bar: switch bottom-sheet tab.'},
 logOpen:{args:[['id','entityId']],doc:'Open the thing a notification refers to.'},
 logAll:{args:[],doc:'Show every notification in the drawer.'},
 focusCity:{args:[['city','cityId']],doc:'Select and centre a city.'},
 selLink:{args:[['id','entityId']],doc:'Select a link.'},
 custGo:{args:[['id','entityId']],doc:'Jump from the dashboard to a customer.'},
 listMore:{args:[['k','listPage']],doc:'Show another page of the dashboard list.'},
 custF:{args:[['v','string']],doc:'Filter the customers list.'},
 custCity:{args:[['v','string']],doc:'Filter the customers list by city.'},
 custSort:{args:[['k','custSortKey']],doc:'Flip the customers list sort.'},
 custOpen:{args:[['sad','boolean',false]],doc:'Open the customers dashboard tab.'},
 goConn:{args:[['city','cityId'],['k','connKind']],doc:'Open a city\'s connections tab.'},
 goEgress:{args:[['city','cityId'],['k','egressKind']],doc:'Open a city\'s connections tab (l2 for the customer list).'},
 connOpen:{args:[],doc:'Open the connections dashboard tab.'},
 connF:{args:[['f','connFilter'],['v','string',false]],doc:'Filter the connections list.'},
 connCity:{args:[['v','string']],doc:'Filter the connections list by city.'},
 connNet:{args:[['v','string']],doc:'Filter the connections list by network.'},
 connSort:{args:[['k','connSortKey']],doc:'Flip the connections list sort.'},
 connFor:{args:[['net','netId']],doc:'Open the connections of one network.'},
 linkCheck:{args:[['id','entityId']],doc:'Open the redundancy check for a link: what a single cut would drop, without changing anything.'},
 findOpen:{args:[],doc:'Open the city finder (the 🔍 in the top bar).'},
 findGo:{args:[['city','cityId']],doc:'Close the finder and jump to a city.'},
 popStep:{args:[['d','integer']],doc:'Select and centre the previous (d<0) or next (d>0) of your POPs, by name: the [ and ] keys.'},
 offerStep:{args:[],doc:'Select the next open offer (soonest to expire first), centre its city and mark it under Offers here: the $ key.'},
 zoomStep:{args:[['d','integer']],doc:'Zoom the map out (d<0) or in (d>0) around its middle: the - and = keys.'},
 keys:{args:[],doc:'Open the list of keyboard shortcuts (the ? key).'},
 routingOpen:{args:[],doc:'Open the Routing & DDoS window: backbone, Auto-TE and DDoS settings (the button at the top of the NOC tab).'},
 opsOpen:{args:[],doc:'Open the Ops sheet: the NOC intern\'s mood, weekly shift report and standing orders.'},
 opsCity:{args:[['v','cityId',false]],doc:'Show one POP\'s standing-order exceptions in the Ops sheet.'},
 utilities:{args:[['city','cityId',false]],doc:'Open the utilities sheet: route servers, the redundancy kit, caches and bulk peering, for one city or the whole network.'},
 pniAllOpen:{args:[['net','pniAllNet']],doc:'Open the bulk PNI order sheet for one network (or every network with null).'},
 pniFilter:{args:[['f','pniFilter']],doc:'Filter the PNI list: all, via transit, worth it, already PNI.'},
 pniGrp:{args:[['g','string'],['o','boolean',false]],doc:'Fold or unfold one group of the PNI list.'},
 pniSort:{args:[],doc:'Flip the PNI list sort between A-Z and worth-it-first.'},
 puzzleMenu:{args:[],doc:'Open the puzzle list.'},
 puzzleDoor:{args:[],doc:'From the title screen: open the puzzle list (keeps the typed name).'},
 pzFinish:{args:[],doc:'Puzzles only: run the star count and show the results sheet.'},
 pzMonkey:{args:[],doc:'Puzzles only: send the chaos monkey round the build to prove the N-1 star.'},
 pzMkSkip:{args:[],doc:'Puzzles only: skip the monkey\'s tour to the verdict.'},
 pzArAll:{args:[],doc:'Architect runs only: show every city on the map, not just the run\'s own.'},
 tailTog:{args:[],doc:'Show or hide the long tail of small networks.'},
 teEdit:{args:[],doc:'Open the RouteScript editor.'},
 teClose:{args:[],doc:'Close the RouteScript editor.'},
 teHelp:{args:[],doc:'Open the RouteScript reference.'},
 teBack:{args:[],doc:'Back to the RouteScript editor.'},
 models:{args:[],doc:'Open the router catalogue.'},
 decomOpen:{args:[['city','cityId',false]],doc:'Open the decommissioning sheet.'},
 scenarios:{args:[],doc:'Open the scenario picker. Start one with startScn.'},
 helpClose:{args:[],doc:'Close the help modal.'},
 whatsNewShow:{args:[],doc:'Open the release notes.'},
};

const API_BOUND={
 leaseSwap:{command:'orderDf',note:'presets the dark-fiber modal on a leased pair'},
 teOpt:{command:'teDeploy',arg:'script',note:'the optimiser drafts a script'},
 teSlop:{command:'teDeploy',arg:'script',note:'the AI drafts a script'},
 teExample:{command:'teDeploy',arg:'script',note:'the worked example'},
 teRecipe:{command:'teDeploy',arg:'script',note:'a recipe from catalog(\'TE_RECIPES\')'},
 trace:{command:'traceRun',arg:'from'},
 decomToggle:{command:'decomGo',arg:'cities'},
 openVxc:{command:'buyVxc',note:'opens the circuit picker from a fabric port ({from, prov}); buyVxc takes a, b, prov and t itself'},
 connCancel:{command:'cancelTransit',note:'the connections list\'s cancel button: it arms, then dispatches cancelTransit, cancelPni, cancelIx, rmCache or rmNni'},
 cnPrem:{command:'buildLink',arg:'premiumCrossing'},
 addParallel:{command:'buildLink',note:'opens the link modal on the same pair',arg:'a/b'},
 via:{command:'buildLink',arg:'cable'},
 route:{command:'buildLink',arg:'route'},
 dfMode:{command:'orderDf',note:'opens the dark-fiber modal',arg:'a/b'},
 dfSrc:{command:'orderDf',arg:'source'},
 dfSys:{command:'orderDf',arg:'system'},
 seaDesign:{command:'orderCable',arg:'design'},
 seaPackage:{command:'orderCable',arg:'terminal/engineering'},
 ownCab:{command:'orderCable',note:'presets the own-cable flow'},
 randomName:{command:'start',note:'drafts the title-screen name; new_game starts games'},
 pickStart:{command:'start',note:'drafts the home city; new_game starts games'},
 pickHome:{command:'start',note:'drafts the home city; new_game starts games'},
 modeSet:{command:'start',note:'drafts the game mode; new_game starts games'},
 presetSet:{command:'start',note:'drafts the difficulty preset; new_game starts games'},
 chaosSet:{command:'start',note:'drafts the sandbox chaos dial; new_game starts games'},
 rename:{command:'renameGo',note:'opens the rename sheet; renameGo opens it itself'},
 pniAllSize:{command:'pniAll',arg:'tier',note:'steps the port size in the bulk sheet'},
 utilityPick:{command:'utilities',note:'the sheet\'s city picker; pass city to utilities itself'},
 pzAddPar:{command:'pzLink',note:'opens the puzzle picker on the same pair',arg:'tier'},
 pzVia:{command:'pzLink',note:'picks the route (cable or land) for the pending link'},
 pzDiv:{command:'pzLink',note:'same trench or a diverse one for the pending link'},
};

/* Starting, retrying and leaving scenarios, puzzles and architect runs, and the screens a player dismisses. They run
   as their buttons run them; new_game, load_save and export_save are the other half of the session (mcp-page.js). */
const API_SESSION={
 startScn:{args:[['id','scnId']],doc:'Start a scenario (ids from catalog SCN), replacing the current game.'},
 startWeekly:{args:[],doc:'Start this week\'s weekly scenario, replacing the current game. The week follows the real date.'},
 pzStart:{args:[['id','string']],doc:'Start a puzzle by id (the puzzle list, view.puzzleMenu, shows them), replacing the current game.'},
 pzWeekly:{args:[],doc:'Start this week\'s weekly puzzle, replacing the current game.'},
 pzArStart:{args:[['id','string']],doc:'Start an architect run by id (view.puzzleMenu lists them), replacing the current game.'},
 pzRetry:{args:[],doc:'Puzzles and architect runs: start the same one over from scratch.'},
 pzLeave:{args:[],doc:'Leave the running puzzle or architect run.'},
 keepPlaying:{args:[],doc:'Dismiss the win screen and keep playing.'},
 pitchSkip:{args:[],doc:'Skip the opening pitch; a game waiting behind it starts.'},
 tutSkip:{args:[],doc:'Skip the tutorial coaching.'},
};

const API_STATE_DOC={
 v:{type:'integer',doc:'Save format version.'},
 name:{type:'string',doc:'Your network\'s name.'},
 asn:{type:'integer',doc:'Your AS number.'},
 home:{type:'string',doc:'The city you started in.'},
 day:{type:'integer',doc:'Days since the company was founded.'},
 cash:{type:'number',doc:'Cash on hand. Goes negative into the red; -100k is bankruptcy.'},
 priceMul:{type:'number',doc:'Multiplier on transit prices (weekly modifier).'},
 mode:{type:'string',doc:'normal | sandbox | scenario | puzzle.'},
 rules:{type:'map',doc:'The rules this network locked in at its door: preset (soft, freeze, oncall, bgp, sandbox or puzzle), the chaos dial, lead times, the market, and the Best Effort extras (sea, confs, broke, moods, pnis), which are only written where they differ from the classic game. They stay for the network\'s whole life.'},
 charter:{type:'string',doc:'The charter picked in the first month of a normal game: global | boutique.'},
 chartSet:{type:'boolean',doc:'The charter has been picked; false while the choice is still open.'},
 solWon:{type:'integer',doc:'The day the Speed of Light win landed (boutique charter), or 0.'},
 lvl:{type:'integer',doc:'Customer level (unlocks customer types).'},
 ltv:{type:'integer',doc:'Level at which Tier 1 vendors were visible (title-screen pick).'},
 t1v:{type:'integer',doc:'Level at which Tier 1 transit was offered.'},
 auV:{type:'integer',doc:'Australia content level gate.'},
 seen:{type:'array',doc:'Network ids the deals panel has already shown. Vestigial: written by newGame, read nowhere.'},
 pops:{type:'map',doc:'Your POPs by city id: day opened, broadband (bb), ad boost, downtime, routers, generator, second site.'},
 links:{type:'array',doc:'Your links: waves, dark fiber (df), own cables and fabric circuits (vxc), each with an entity id.'},
 transit:{type:'array',doc:'Transit ports: city, net, tier, LAG members, port history for 95th-percentile billing.'},
 ixp:{type:'map',doc:'IX ports by exchange city; tier per port (may exceed 1 with LAG members in ixn).'},
 rs:{type:'map',doc:'Route-server sessions by exchange city.'},
 ixn:{type:'map',doc:'LAG members on IX ports by exchange city.'},
 ixSite:{type:'map',doc:'Which building each IX port sits in (a, b or ab).'},
 ixPref:{type:'map',doc:'Egress preference per IX port.'},
 myIx:{type:'map',doc:'Exchanges you founded: name, members, join schedule, fabric step.'},
 peers:{type:'map',doc:'Peering sessions, keyed "net@ix".'},
 pairMet:{type:'map',doc:'Routing metric per city pair (prefer/avoid/backup/normal), keyed by pair.'},
 pni:{type:'array',doc:'Private interconnects: city, net, tier, ready day, augments (up), LAG, sacrificial flag.'},
 caches:{type:'array',doc:'CDN cache boxes: city, net, building.'},
 nni:{type:'array',doc:'Fabric ports: city, provider, tier.'},
 biz:{type:'array',doc:'Signed customers: type, cities, bandwidth, rate, mood, contract dates.'},
 offers:{type:'array',doc:'Pending customer offers, each expiring on a day.'},
 done:{type:'map',doc:'Goals landed, by goal id → day.'},
 ach:{type:'map',doc:'Badges earned this game, by badge id → day.'},
 inc:{type:'array',doc:'Open incidents: type, what they hit, until when, optional rush-repair price.'},
 ddosStarts:{type:'array',doc:'The days the attacks of the last week started; at most 14 a week.'},
 ev:{type:'map',doc:'Live world events: the running DDoS, route leaks, fabric failures, price shocks.'},
 stats:{type:'map',doc:'Counters: incidents survived, loans taken, sharks, conferences attended, peak traffic…'},
 log:{type:'array',doc:'The NOC notification feed, newest first, capped at 60; identical notices within a minute fold with a count.'},
 nextFail:{type:'integer',doc:'The day the next failure fires.'},
 nextEvent:{type:'integer',doc:'The day the next world event fires.'},
 rng:{type:'integer',doc:'The scenario seed; it predicts every future random draw.'},
 usedNames:{type:'array',doc:'Customer names already handed out.'},
 spares:{type:'map',doc:'Spare optics on the shelf, by optic id.'},
 scrubs:{type:'array',doc:'Scrubbing centres: city and tier.'},
 scrubMode:{type:'string',doc:'always | ondemand.'},
 cnLic:{type:'map',doc:'Mainland China licence: none | pending (with ready day) | ok.'},
 ppol:{type:'string',doc:'Your published peering policy: open | selective | closed.'},
 pdesk:{type:'map',doc:'This week\'s peering desk summary: sessions accepted and declined at which exchanges.'},
 pdeskRep:{type:'map',doc:'Last week\'s peering desk summary, as the NOC log reported it.'},
 ops:{type:'map',doc:'The NOC intern: who is hired, each standing order\'s on/off switch and settings, the monthly budget and what it spent, per-POP exceptions, the new-POP template and the weekly log.'},
 core:{type:'map',doc:'Your backbone technology: lv bought, the level it runs at, the interop lab.'},
 ddosAuto:{type:'map',doc:'The NOC\'s auto-mitigation switches: rtbh and scrub.'},
 popStd:{type:'map',doc:'The standard POP: router model and count new POPs start with, or null for none.'},
 demo:{type:'map',doc:'Vendor demo units on order, by "kind:id" → ready day.'},
 seatOff:{type:'map',doc:'The pending consortium-cable seat offer: landings, km, name, expiry day.'},
 monkey:{type:'map',doc:'The chaos monkey: next visit day, whether it is in your network now, days left, whether anyone noticed.'},
 fleet:{type:'map',doc:'Cable-ship voyages by ship id: the cut it sails to, when it arrives, splices and comes home.'},
 achP:{type:'map',doc:'Which rule set each badge was earned under (oncall, freeze, bgp), by badge id.'},
 calV:{type:'integer',doc:'Calendar save-format marker: 1 once the real calendar (28-31-day months) applies.'},
 pz:{type:'map',doc:'The running puzzle: its id, cities, flows to deliver, budget and stars.'},
 ar:{type:'map',doc:'The running architect run: its HQ, brief index, gold sites, spend and the build it started from.'},
 loans:{type:'array',doc:'Active loans: bank, balance, APR, term, share (equity banks).'},
 loanOffers:{type:'array',doc:'Pending loan offers.'},
 loanStrikes:{type:'integer',doc:'How many loan offers you have let lapse.'},
 confReg:{type:'map',doc:'Conferences registered for, by key; "sp" when sponsoring.'},
 hw:{type:'map',doc:'Hardware market: price shocks and any price lock.'},
 capDeal:{type:'map',doc:'The pending capacity deal from a capacity conference.'},
 cam:{type:'map',doc:'Map camera position. View state that save() happens to store inside S.'},
 uiSpeed:{type:'number',doc:'The speed you left the game at. View state that save() stores inside S.'},
 won:{type:'boolean',doc:'You reached Tier 1.'},
 t1Now:{type:'boolean',doc:'Tier 1 right now, as of the last day; falling out of it is announced.'},
 lost:{type:'boolean',doc:'The bank repossessed the routers.'},
 neg:{type:'integer',doc:'Days in the red in a row.'},
 hist:{type:'array',doc:'Daily history for the graphs: demand, served, exit split, revenue, cost, cash.'},
 scn:{type:'map',doc:'The running scenario: id, rules, day limit, done/failed, and the day of the next scripted attack (nextDdos).'},
 dk:{type:'map',doc:'De-Kicks state: per-exchange multipliers, add-ons, retention, the live quote (q) and the remembered one (lastQ).'},
 grace:{type:'map',doc:'Courtesy transit after a merger wave, until a day.'},
 merged:{type:'map',doc:'Networks merged into others this game.'},
 tut:{type:'map',doc:'Tutorial progress.'},
 conf:{type:'map',doc:'The conference glow: region and until when; sp when you sponsored.'},
 phpDone:{type:'boolean',doc:'One-shot flag.'},
 krExit:{type:'map',doc:'Korea exit state.'},
 auNews:{type:'boolean',doc:'One-shot flag: the Australia news toast.'},
 richTold:{type:'boolean',doc:'One-shot flag: the cash milestone toast.'},
};

const API_RESULTS_DOC={
 nt:{type:'map',doc:'Traffic per network through transit, by net id.'},
 tNet:{type:'map',doc:'Traffic per network you hand to each upstream, by "net@upstream".'},
 reachNT:{type:'number',doc:'Networks reachable without transit.'},
 teBlack:{type:'number',doc:'Traffic blackholed by RouteScript rules.'},
 teMoved:{type:'number',doc:'Traffic Auto-TE spilled onto alternate paths.'},
 egT:{type:'map',doc:'Egress split by exit kind (c/p/ix/t/l2) in Gbps.'},
 egDesc:{type:'map',doc:'RouteScript drains per exit.'},
 netEg:{type:'map',doc:'Per-network egress split: which exit carries which network.'},
 ef:{type:'map',doc:'LAZY per-link exit breakdown: what crosses each link, per network, built only when a panel asks. What is in here depends on which panels have rendered.'},
 l2:{type:'map',doc:'Layer-2 traffic per customer (L2VPN, SD-WAN, waves).'},
 l2lat:{type:'map',doc:'Latency per L2 customer.'},
 l2route:{type:'map',doc:'Which path an L2 customer\'s traffic takes.'},
 l2split:{type:'map',doc:'L2 traffic split per path.'},
 nodeLoad:{type:'map',doc:'Router forwarding load per city.'},
 nodeCap:{type:'map',doc:'Router forwarding capacity per city.'},
 div:{type:'map',doc:'Traffic diversity per customer (how split their paths are).'},
 gfwLost:{type:'number',doc:'Traffic lost to the Great Firewall.'},
 gfwCross:{type:'number',doc:'Traffic crossing into mainland China.'},
 p95:{type:'map',doc:'95th-percentile transit readings per port.'},
 peered:{type:'number',doc:'Share of traffic that stays on peering.'},
 peerShare:{type:'number',doc:'Fraction of traffic served by peers (mood driver).'},
 load:{type:'map',doc:'Load per link in Gbps.'},
 useT:{type:'map',doc:'Transit use per port id.'},
 useIx:{type:'map',doc:'IX use per exchange city.'},
 usePni:{type:'map',doc:'PNI use per port id.'},
 useCache:{type:'map',doc:'Cache use per box id.'},
 cityDem:{type:'map',doc:'Eyeball + customer demand per city.'},
 citySrv:{type:'map',doc:'Traffic served per city.'},
 cityEye:{type:'map',doc:'Eyeballs online per city.'},
 latF:{type:'map',doc:'Fraction of each city\'s traffic that goes far (over a threshold latency).'},
 latFar:{type:'map',doc:'The far exit each slow city sends traffic through.'},
 demTo:{type:'map',doc:'Your traffic destined to each network, in Gbps. The number CDN caches ask about.'},
 served:{type:'number',doc:'Total traffic served, in Gbps.'},
 demand:{type:'number',doc:'Total traffic demanded, in Gbps.'},
 reach:{type:'number',doc:'Fraction of the internet you can reach (0..1).'},
 sessions:{type:'number',doc:'Peering sessions up.'},
 revMo:{type:'number',doc:'Revenue per month.'},
 costMo:{type:'number',doc:'Cost per month.'},
 cost:{type:'map',doc:'Monthly cost by category (transit, pni, ix, links…).'},
 rev:{type:'map',doc:'Monthly revenue by source.'},
 reachable:{type:'map',doc:'Networks reachable per net id.'},
 cone:{type:'map',doc:'Which peer\'s customer cone carries each network you reach without transit of your own, by net id.'},
 ddos:{type:'array',doc:'Per live attack: the target, its size, which ports it fills, what Flowspec and each scrubbing centre cleaned, and what reaches the target.'},
 haul:{type:'array',doc:'Scrubbing detours: from the attacked city to each centre, one-way latency and how much they carry.'},
 tgtF:{type:'map',doc:'The share of a targeted customer\'s traffic that survives the attack, by customer id.'},
 bbF:{type:'map',doc:'The share of a city\'s broadband subscribers that survive an attack on them, by city id.'},
 fsUse:{type:'map',doc:'Flowspec rules in use per city: used of the routers\' rule capacity.'},
 bizDem:{type:'map',doc:'Business customers\' share of each city\'s demand, in Gbps (what RouteScript\'s protect customers serves first).'},
 bizSrv:{type:'map',doc:'Of that business demand, what was served, per city.'},
 graceNets:{type:'number',doc:'Networks reached over the courtesy route after a merger wave.'},
 cityBlocked:{type:'map',doc:'Set up per city by the traffic computation; nothing fills it at present.'},
 ddosHot:{type:'map',doc:'Cities whose ports a flood is filling, for the map\'s pulse. Keyed by city id.'},
};

/* One arg of a spec as the schema states it: the domain when there is one (catalog() resolves
   it), the bare type otherwise, and the concrete value list or range where it is fixed. */
function apiArgSpec([name,dom,req]){
  const a={name,required:req!==false};
  if(API_DOMAINS[dom])a.domain=dom;else a.type=dom;
  const v=apiDomValues(dom);
  if(Array.isArray(v))a.values=v;else if(v&&v.from!==undefined)a.range=v;
  return a;}

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
const API_TABLES={CITIES,NETS,CABLES,XIX,PORT,LT,NNI,VXC,RG,OPT,DF_SYS,FAB,SCRUB_TIERS,BIZ_T,LEVELS,GOALS,SCN,BANKS,REQS,NSH,MET,PREF,RT,PPOL,CONFS,LAG_MAX,RMAX,REGEN_MAX,START_CASH,CONF_COST,CONF_SP,CAP_COST,CAP_LV,CONF_DAYS,SUB_UPGRADES,SEA_DESIGNS,TE_COST,TE_MO,MYIX_COST,CN_LIC,SITE2_COST,MYIX_FAB,INTERNS,OPSK,CHARTERS,SEAT_N,CORE_LV,CORE_COST,CORE_REQ,CORE_LAB,INTERN_MO,PZ_TIERS,AR_TIERS,PZ_RG};
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

return {API_DOMAINS,API_CMD,API_VIEW,API_BOUND,API_SESSION,API_STATE_DOC,API_RESULTS_DOC,API_TABLES,API_MADE,API_UI_HIDDEN,
  apiDomCheck,apiDomValues,apiArgSpec,apiPath,apiJson};
})();
