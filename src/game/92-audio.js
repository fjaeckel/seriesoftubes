/* ================= AUDIO ================= */
let AC=null;
function audioInit(){if(AC)return;try{AC=new (window.AudioContext||window.webkitAudioContext)();}catch(e){}}
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

