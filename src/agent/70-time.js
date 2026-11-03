/* ================= AGENT API: time =================
   The agent's clock: nothing moves until a tool asks for days with advance, one dayTick() per simulated day. */
const apiClockDoc=()=>'Time moves only with advance: one dayTick() per simulated day, as the game loop runs it. Nothing runs between calls.';

// What happened since a moment (the start of an advance): the log, new incidents, cash.
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
  if(apiModalOpen())apiFail('A window is open. Answer it first (screen, click, or act closeModal), the game does not run days behind it.');
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
  if(apiModalOpen()){a.stop='a window opened';return false;}
  return a.ran<a.days;}
function apiAdvanceEnd(a){
  renderAll();
  const total=a.times.reduce((x,t)=>x+t.ms,0),out=apiSince({day:a.start,cash:a.cash,inc:a.inc},apiTake());
  if(a.stop!=='a window opened'){delete out.decision;delete out.screen;}
  return {from:out.from,to:out.to,daysRun:a.ran,stoppedBecause:a.stop,cash:out.cash,cashChange:out.cashChange,newIncidents:out.newIncidents,log:out.log,toasts:out.toasts,
    timing:{totalMs:apiR1(total),perDayMs:apiR1(total/(a.ran||1)),slowestDays:a.times.slice().sort((x,y)=>y.ms-x.ms).slice(0,5).map(x=>({date:dateStr(x.day),ms:x.ms}))},
    ...(out.decision?{decision:out.decision,screen:out.screen}:{})};}
function apiAdvance(days){const a=apiAdvanceStart(days);while(apiAdvanceDay(a));return apiAdvanceEnd(a);}
