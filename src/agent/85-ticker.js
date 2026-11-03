/* ================= AGENT MODE: the clock where frames do not run =================
   A paced clock runs through the game's own loop (UI.speed is the pace, runClock() the days), but frames stop in a
   hidden tab, and the frame runs no days behind an open window. Agent mode keeps time in both: a hidden tab is the
   normal place for an agent to drive while the player does something else, and an agent that deliberates over a
   window pays for it in days. This ticker covers exactly those moments, under the frame's other conditions, and
   leaves every other moment to the frame. Hidden-tab timers are throttled (to 1 Hz, after five minutes to once a
   minute in Chrome), so an unthrottled worker posts the ticks; a plain interval is the fallback without Worker.
   The agent's clock (pace 0) needs no ticks: its days run when the agent asks. Never under __TUBES_TEST__: tests call
   apiAgentTick() by hand. */
const API_TICKER={on:false,worker:null,interval:null,last:0};
// Days for the time since the last tick, if the frame is not running them now.
function apiAgentTick(now=performance.now()){
  const dt=API_TICKER.last?Math.max(0,Math.min(1000,now-API_TICKER.last)):0;API_TICKER.last=now;
  const behind=document.visibilityState==='hidden'||!$('modal').hidden;
  if(behind&&UI.clockLocked&&S&&!S.lost&&UI.speed&&!pzOn())runClock(dt);}
function apiTickerSync(){
  const want=UI.clockLocked&&apiAgentMs()>0&&!window.__TUBES_TEST__;
  if(want===API_TICKER.on)return;API_TICKER.on=want;API_TICKER.last=0;
  if(!want){if(API_TICKER.worker){try{API_TICKER.worker.terminate();}catch(e){}API_TICKER.worker=null;}
    if(API_TICKER.interval){clearInterval(API_TICKER.interval);API_TICKER.interval=null;}return;}
  try{const url=URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),250)'],{type:'text/javascript'}));
    API_TICKER.worker=new Worker(url);URL.revokeObjectURL(url);
    API_TICKER.worker.onmessage=()=>apiAgentTick();}
  catch(e){API_TICKER.interval=setInterval(()=>apiAgentTick(),250);}}
