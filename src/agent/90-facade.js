/* ================= AGENT API: the facade =================
   window.TUBES.call(tool, args) is the whole surface: one tool from API_TOOLS by name, with the MCP tool's own
   arguments, answered as plain JSON. Nothing here listens, polls or runs on the day loop: toast() is only listened to
   while a call runs. */
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
  advance:a=>apiAdvance(a.days),
};
function apiCall(tool,args){
  if(typeof tool!=='string'||!own(API_TOOLS,tool))apiFail(`No tool "${tool}".`);
  if(!S&&!['schema','catalog','classes','actions'].includes(tool))apiFail('No game is running.');
  apiListen(true);
  try{return API_TOOLS[tool](args&&typeof args==='object'&&!Array.isArray(args)?args:{});}
  finally{apiListen(false);}}
window.TUBES={version:1,tools:Object.keys(API_TOOLS),call:apiCall};
