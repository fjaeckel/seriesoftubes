/* ================= AGENT API: argument domains =================
   The agent facade (window.TUBES, this folder) is how tools play the game: the MCP server (scripts/mcp.js) calls it in
   its own jsdom page, or in the player's tab through the agent relay (80-relay.js). It is part of the development page
   only (<!-- @include-dev agent -->): the page players get has none of it, so nothing in src/game/ may name anything
   defined here; the game offers HOOKS instead. Nothing here runs until a tool calls it or the player switches agent
   mode on: these files define tables and functions, and 99-start.js wires agent mode in.
   A domain is what an argument may be: an id in a catalog table, a key, an index, a small fixed list, or a check. */
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
  salesPersona:{table:'SALES',kind:'key'},
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
  callAmount:{kind:'enum',values:()=>CALL_AMTS.slice()},
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
  listPage:{kind:'enum',values:['conn','cust','nets','pni','pops']},
  popsSortKey:{kind:'enum',values:['eye','cost','name']},
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
