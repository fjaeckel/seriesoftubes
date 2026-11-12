/* ================= AGENT API: the facade =================
   window.TUBES.call(tool, args) is the whole surface: one tool from API_TOOLS by name, with the MCP tool's own
   arguments, answered as plain JSON (or a promise of it, for days that run where the player can watch). Nothing here
   listens, polls or runs on the day loop: toast() is only listened to while a call runs.
   ctx.relay: the call came over the relay into the player's tab (80-relay.js), where the player owns the game, its
   clock and their windows, and the dice stay hidden. */
let API_CTX={relay:false};
const API_TOASTS={depth:0,list:[],real:null};
function apiTake(){const t=API_TOASTS.list;API_TOASTS.list=[];return t;}
const apiToastLines=t=>t.map(x=>(x.kind?x.kind+': ':'')+x.text);
// toast() is a top-level function, so the game reaches it by its global name and this stands in for it.
function apiListen(on){
  if(on){if(API_TOASTS.depth++)return;const real=API_TOASTS.real=window.toast;API_TOASTS.list=[];
    window.toast=function(h,kind){API_TOASTS.list.push({kind:kind||'',text:apiText(String(h),600)});return real.apply(this,arguments);};}
  else if(!--API_TOASTS.depth){window.toast=API_TOASTS.real;API_TOASTS.real=null;API_TOASTS.list=[];}}

const API_TOOLS={
  status:()=>apiStatus(),
  network:a=>apiNetwork(a.network),
  city:a=>apiCity(a.city),
  find:a=>apiFind(a.query,a.kind),
  traceroute:a=>apiTrace(a.from,a.to),
  peering_check:a=>apiPeering(a.network,a.city,a.via),
  hot_spots:a=>apiHotSpots(a.limit||10),
  schema:a=>apiSchema(a.section),
  catalog:a=>apiCatalog(a.name),
  state:a=>apiState(a.path),
  results:a=>apiResults(a.path),
  ui:()=>apiUi(),
  actions:()=>apiActions(),
  classes:()=>apiClasses(),
  act:a=>{const name=a.action||a.command;if(!name)apiFail('Give action, e.g. {"action":"buildPop","args":{"city":"ams"}}.');
    return apiRun(name,a.args||{},{dryRun:!!a.dryRun});},
  screen:a=>apiScreen(a.where,a.offset),
  panel:a=>apiPanel(a),
  click:a=>apiClick(a.button,a.value),
  open_link:a=>apiOpenLink(a.from,a.to),
  advance:a=>API_CTX.relay?apiAdvanceLive(a.days):apiAdvance(a.days),
  clock:()=>apiClock(),
  since:a=>apiSince(a),
};
function apiCall(tool,args,ctx){
  if(typeof tool!=='string'||!own(API_TOOLS,tool))apiFail(`No tool "${tool}".`);
  if(!S&&!['schema','catalog','classes','actions','clock'].includes(tool))apiFail('No game is running.');
  apiFedMark();// a joined save played through tools is AI-played (77-fed.js)
  const was=API_CTX;API_CTX={relay:!!(ctx&&ctx.relay)};
  apiListen(true);
  let out;
  try{out=API_TOOLS[tool](args&&typeof args==='object'&&!Array.isArray(args)?args:{});}
  catch(e){apiListen(false);throw e;}
  finally{API_CTX=was;}
  if(out&&typeof out.then==='function')return out.finally(()=>apiListen(false));
  apiListen(false);
  return out;}
window.TUBES={version:1,tools:Object.keys(API_TOOLS),call:apiCall};
