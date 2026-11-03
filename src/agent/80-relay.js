/* ================= AGENT RELAY: the in-page transport =================
   With agent mode on (75-mode.js), the page dials the agent relay (scripts/agent/relay.js, which npm run dev hosts on
   its own port) and answers tool calls from connected tools (the MCP server, node scripts/mcp.js --browser) through
   TUBES.call, so a human follows along on the real UI: toasts fire, panels render, the map moves.

   No endpoint to configure and no token: the relay rides the server that served the page, same port, path
   API_RELAY_PATH, so the endpoint is where the page already is. The relay refuses a page from any other origin and a
   Host that is a name, so no website can reach it through the player's browser; who else can reach it is the
   operator's choice of bind address. No eval ever: a message is JSON with a tool name from TUBES.tools, a fixed list,
   answered as the relay (ctx.relay): the player's game, clock, windows and settings stay theirs, and the dice stay
   hidden. Nothing dials or polls while the switch is off.

   API_RELAY_HOST is a var because tests point it at their relay (under __TUBES_TEST__ nothing dials unless the test
   opts in with __AGENT_RELAY_TEST__): a jsdom page is not loaded from the relay's server. */
var API_RELAY_HOST='';                   // tests: '127.0.0.1:<port>'; live pages use their own host
const API_RELAY={ws:null,on:false,timer:null,tries:0,said:false,tools:0,host:null,queue:null};
const API_RELAY_PATH='/agent';
const apiRelayUrl=()=>`ws://${API_RELAY_HOST||location.host}${API_RELAY_PATH}`;

/* The relay reports tool presence on every connect and disconnect: the clock holds while no tool is connected and
   runs again the moment one arrives. A missing relay (dial failed, retry backoff) holds it too. */
function apiRelayPresence(tools){
  API_RELAY.tools=tools|0;
  if(!UI.clockLocked||!API_RELAY.on)return;
  const run=apiAgentSpeed();
  if(run!==UI.speed){UI.speed=run;renderHUD();}}

function apiRelaySync(){
  const want=!RW_IN&&UI.clockLocked&&(!window.__TUBES_TEST__||!!window.__AGENT_RELAY_TEST__);
  // Nothing to do when the switch and the endpoint stand: tearing a healthy dial down for nothing drops the calls in
  // flight and holds the clock for no reason.
  if(API_RELAY_HOST===API_RELAY.host&&API_RELAY.on===want&&(want?!!(API_RELAY.ws||API_RELAY.timer):true))return;
  clearTimeout(API_RELAY.timer);API_RELAY.timer=null;API_RELAY.tries=0;
  if(API_RELAY.ws){const w=API_RELAY.ws;API_RELAY.ws=null;try{w.close();}catch(e){}}
  API_RELAY.on=want;API_RELAY.host=API_RELAY_HOST;
  apiRelayPresence(0);                      // off the relay: nobody driving, the clock holds
  if(want)apiRelayDial();}

// Dev reloads and relay restarts heal on their own, without a spinning reconnect.
function apiRelayRetry(){
  if(!API_RELAY.on)return;
  const wait=Math.min(15000,500*Math.pow(2,Math.min(API_RELAY.tries++,5)));
  API_RELAY.timer=setTimeout(()=>{API_RELAY.timer=null;apiRelayDial();},wait);}

/* One call, answered in order: calls queue behind each other, so a move sent while days are still running waits for
   them, as the tool sent it. A promise (days the player watches) is awaited; a throw is the tool's error. */
function apiRelayAnswer(ws,m){
  const dayBefore=S?S.day:null,send=o=>{if(API_RELAY.ws===ws)ws.send(JSON.stringify({kind:'result',id:m.id,dayBefore,dayAfter:S?S.day:null,...o}));};
  const run=()=>Promise.resolve().then(()=>TUBES.call(m.tool,m.args||{},{relay:true}))
    .then(value=>send({value}),er=>send({error:String(er&&er.message||er)}));
  API_RELAY.queue=(API_RELAY.queue||Promise.resolve()).then(run);}

function apiRelayDial(){
  if(!API_RELAY.on)return;
  let ws;
  try{ws=new WebSocket(apiRelayUrl());}catch(e){return apiRelayRetry();}
  API_RELAY.ws=ws;
  ws.onopen=()=>{
    if(API_RELAY.ws!==ws)return;
    ws.send(JSON.stringify({kind:'auth',role:'page'}));
    API_RELAY.tries=0;
    if(!API_RELAY.said){API_RELAY.said=true;toast(tr('settings.agent_relay_connected'),'good');}};
  ws.onmessage=e=>{
    if(API_RELAY.ws!==ws)return;
    let m;try{m=JSON.parse(e.data);}catch(_){return;}
    if(!m||typeof m!=='object')return;
    if(m.kind==='presence'){apiRelayPresence(m.tools);return;}
    if(m.kind!=='call'||m.id===undefined)return;
    // A call this page cannot make sense of is answered, never ignored: a silent drop would hang the tool that sent it.
    if(typeof m.tool!=='string'||!TUBES.tools.includes(m.tool)){ws.send(JSON.stringify({kind:'result',id:m.id,error:`no tool "${m.tool}" here`}));return;}
    apiRelayAnswer(ws,m);};
  // Replaced (4000): another tab took the relay, so this one yields instead of fighting it: redialing would just
  // replace the new tab back, forever. Toggling agent mode dials again.
  ws.onclose=e=>{if(API_RELAY.ws!==ws)return;API_RELAY.ws=null;
    apiRelayPresence(0);                                   // off the relay: the clock holds
    if(e&&e.code===4000)API_RELAY.on=false;else apiRelayRetry();};
  ws.onerror=()=>{};}
