/* ---------- the pace of days, as measured ----------
   How fast days really come with the route worker, for Settings › Diagnostic info: the speed asked, the speed held
   (from the starts of the last 12 days), how long a day takes from its start to its end, and the slowest of them.
   Measured only: a clock that started days on a steady beat was tried, and on big networks it cost a sixth of the
   speed without making the days any more regular (their spread comes from the long days themselves, a second routing
   for the intern's jobs or a failure, which no beat can hide). */
const PACE={s:null,sp:0,st:[],d:[],t0:0};
// A day starts (runClock(), 99-loop.js) / has ended (rwDayDone(), 28-route-worker.js). A new speed or another game:
// the measure starts again.
function paceStart(now){const P=PACE;if(P.s!==S||P.sp!==UI.speed){P.s=S;P.sp=UI.speed;P.st.length=0;P.d.length=0;}
  P.st.push(now);if(P.st.length>13)P.st.shift();P.t0=now;}
function paceEnd(now){const P=PACE;if(!P.t0)return;P.d.push(now-P.t0);if(P.d.length>12)P.d.shift();P.t0=0;}
function diagPace(){const P=PACE;if(!S||!UI.speed)return 'days: paused';if(P.s!==S||P.sp!==UI.speed||P.st.length<3)return `days: x${UI.speed} asked · measuring`;
  const gap=(P.st[P.st.length-1]-P.st[0])/(P.st.length-1),d=P.d.length?P.d.reduce((a,x)=>a+x,0)/P.d.length:0;
  return `days: x${UI.speed} asked · x${(DAY_MS/gap).toFixed(1)} held (one every ${Math.round(gap)} ms)`+(d?` · a day takes ${Math.round(d)} ms, slowest ${Math.round(Math.max(...P.d))}`:'');}
