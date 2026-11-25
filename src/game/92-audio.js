/* ================= AUDIO ================= */
let AC=null;
/* Making the audio context takes ~40 ms, which made the first tap of every visit slow. It is made ahead, a moment after
   loading, and starts suspended until a tap resumes it (the browsers' autoplay rule). Muted players never get one. */
const acNew=()=>{try{AC=new (window.AudioContext||window.webkitAudioContext)();}catch(e){}};
function audioEarly(){if(!AC&&!UI.muted)acNew();}
// From a tap: make it if it is not there yet, wake it if it is. A touch's pointerdown may not count as a gesture; its click does.
function audioInit(){if(!AC)acNew();if(AC&&AC.state!=='running'&&AC.state!=='closed')try{AC.resume().catch(()=>{});}catch(e){}}
if(!self.__TUBES_WORKER__&&!window.__TUBES_TEST__)setTimeout(audioEarly,2500);
function tone(f,t0,dur,type='square',vol=.05){if(!AC)return;const o=AC.createOscillator(),g=AC.createGain();o.type=type;o.frequency.value=f;g.gain.setValueAtTime(vol,AC.currentTime+t0);g.gain.exponentialRampToValueAtTime(.0001,AC.currentTime+t0+dur);o.connect(g).connect(AC.destination);o.start(AC.currentTime+t0);o.stop(AC.currentTime+t0+dur+.02);}
function sfx(k){if(UI.muted||!AC)return;try{
  if(k==='coin'){tone(988,0,.08);tone(1319,.08,.18);}
  else if(k==='build'){tone(523,0,.07,'triangle',.08);tone(784,.06,.12,'triangle',.08);}
  else if(k==='err'){tone(180,0,.18,'sawtooth',.04);}
  else if(k==='alert'){tone(880,0,.1,'square',.04);tone(660,.12,.1,'square',.04);tone(880,.24,.12,'square',.04);}
  else if(k==='star'){tone(784,0,.09,'triangle',.07);tone(1175,.08,.2,'triangle',.07);}
  else if(k==='fanfare'){tone(523,0,.12,'triangle',.07);tone(659,.12,.12,'triangle',.07);tone(784,.24,.12,'triangle',.07);tone(1047,.36,.35,'triangle',.08);}
  else if(k==='click'){tone(660,0,.04,'triangle',.05);}
}catch(e){}}

