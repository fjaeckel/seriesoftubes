/* ================= AGENT API: time =================
   Two clocks, in the MCP server's own page and in the player's tab alike. The agent's clock: nothing moves until a tool
   asks for days with advance. A running clock: days pass at a fixed pace whatever the tool does, and the tool can only
   wait and react. In the player's tab the player picks one in Settings (apiAgentMs(), 0 for the agent's clock); the MCP
   server's own page is told by the server (API_CLK). */
let API_CLK={mode:'agent',paceMs:0,running:false};
const apiClockNow=()=>API_CTX.relay?(apiAgentMs()>0?{mode:'realtime',paceMs:apiAgentMs(),running:!!UI.speed}:{mode:'agent',paceMs:0,running:false}):API_CLK;
function apiMode(){const c=apiClockNow();
  return {backend:API_CTX.relay?'browser':'headless',clock:c.mode,...(c.mode==='realtime'?{paceMs:c.paceMs}:{}),
    ...(API_CTX.relay?{withheld:API_WITHHELD,playerOwns:Object.keys(API_PLAYER_OWNS)}:{})};}
function apiClockDoc(){const c=apiClockNow();
  return c.mode==='agent'?'Time moves only with advance: one dayTick() per simulated day, as the game loop runs it. Nothing runs between calls.'
    :`The clock runs on its own: one simulated day every ${apiR1(c.paceMs/1000)} s of real time, behind open windows too, and no tool can stop it${API_CTX.relay?' (it holds while no tool is connected)':''}. advance is not available; wait returns once days have passed.`;}
function apiClock(){const c=apiClockNow();
  return {mode:c.mode,paceMs:c.paceMs||undefined,running:c.mode==='realtime'?!!c.running:false,
    day:S?S.day:null,date:S?dateStr(S.day):null,cash:S?S.cash:null,lost:!!(S&&S.lost),incidents:S?S.inc.map(i=>i.id):[],question:!!apiDecision()};}

// What happened since a moment (the start of an advance, or a clock reading before wait): the log, new incidents, cash.
// The log keeps what mattered; toasts that only repeat a log line are left out.
function apiSince({day=0,cash=0,inc=[]}={},toasts=[]){
  const seen=new Set(inc),entries=(S.log||[]).filter(e=>e.d>day).slice(-60),logged=entries.map(e=>apiNorm(apiText(e.t,400)));
  const d=apiDecision();
  return {from:dateStr(day),to:dateStr(S.day),daysRun:S.day-day,cash:Math.round(S.cash),cashChange:Math.round(S.cash-cash),
    newIncidents:S.inc.filter(i=>!seen.has(i.id)).map(apiIncText),
    log:entries.map(e=>`${dateStr(e.d)}: ${apiText(e.t,400)}`),
    toasts:[...new Set(apiToastLines(toasts))].filter(t=>{const f=apiNorm(t.replace(/^\w+: /,'').split('\n')[0]);return !logged.some(l=>l.startsWith(f));}).slice(-40),
    ...(d?{decision:d,screen:apiScreen()}:{})};}

function apiAdvanceStart(days){
  if(!S)apiFail('No game is running.');
  const c=apiClockNow();
  if(c.mode!=='agent')apiFail(`The clock runs on its own here, one day every ${apiR1(c.paceMs/1000)} s: use wait to let days pass.`);
  if(apiModalOpen()&&!apiPlayerWin())apiFail('A window is open. Answer it first (screen, click, or act closeModal), the game does not run days behind it.');
  API_SHEET=null;
  apiTake();
  return {days:Math.max(1,Math.min(3650,Math.floor(+days)||1)),start:S.day,cash:S.cash,inc:S.inc.map(i=>i.id),times:[],ran:0,stop:null};}
// One day of the run; false once it is over.
function apiAdvanceDay(a){
  if(a.ran>=a.days)return false;
  if(S.lost){a.stop='bankrupt';return false;}
  const t=performance.now();
  dayTick();
  a.times.push({day:S.day,ms:apiR1(performance.now()-t)});a.ran++;
  if(apiModalOpen()&&!apiPlayerWin()){a.stop='a window opened';return false;}
  return a.ran<a.days;}
function apiAdvanceEnd(a){
  renderAll();
  const total=a.times.reduce((x,t)=>x+t.ms,0),out=apiSince({day:a.start,cash:a.cash,inc:a.inc},apiTake());
  if(a.stop!=='a window opened'){delete out.decision;delete out.screen;}
  return {from:out.from,to:out.to,daysRun:a.ran,stoppedBecause:a.stop,cash:out.cash,cashChange:out.cashChange,newIncidents:out.newIncidents,log:out.log,toasts:out.toasts,
    timing:{totalMs:apiR1(total),perDayMs:apiR1(total/(a.ran||1)),slowestDays:a.times.slice().sort((x,y)=>y.ms-x.ms).slice(0,5).map(x=>({date:dateStr(x.day),ms:x.ms}))},
    ...(out.decision?{decision:out.decision,screen:out.screen}:{})};}
function apiAdvance(days){const a=apiAdvanceStart(days);while(apiAdvanceDay(a));return apiAdvanceEnd(a);}
/* In the player's tab the days run where the player can watch them: a frame's worth of days, then the page draws.
   A hidden tab draws nothing (and its timers are throttled), so there they run straight through. A day the route
   worker is still routing finishes first. */
const apiSleep=ms=>new Promise(r=>setTimeout(r,ms));
async function apiAdvanceLive(days){
  const a=apiAdvanceStart(days);let t=performance.now();
  for(;;){
    while(RW.job)await apiSleep(20);
    if(!apiAdvanceDay(a))break;
    if(document.visibilityState!=='hidden'&&performance.now()-t>30){renderHUD();UI.panelsDue=true;await apiSleep(0);t=performance.now();}}
  return apiAdvanceEnd(a);}

// One day of a running clock in the MCP server's own page (the server keeps the time); the player's tab runs its own loop.
function apiTick(){if(!S||S.lost||pzOn()||!rule('clock'))return false;dayTick();renderAll();return true;}
