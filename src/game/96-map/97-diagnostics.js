/* Settings › Diagnostic info: one readout in a corner, for bug reports. What the screen tells the game (for phone
   layouts), how the map is drawn (the graphics card or 2D, and why), and how fast: frames per second, the slowest
   frames, the time draw() takes. It is also opened with ?vp or ?fps in the address (?novp, ?nofps close it), and,
   inside an installed app where there is no address bar, with five quick taps on the date. Its words are technical on
   purpose and stay in English: they are pasted into bug reports. */
const DIAG={on:false,el:null,t:null,fr:[],dr:[],last:0,dms:-1};
// One frame of the loop (99-loop.js): its interval, and the time draw() took if the map was drawn.
function diagFrame(now){const D=DIAG;if(D.last)D.fr.push(now-D.last);D.last=now;if(D.dms>=0){D.dr.push(D.dms);D.dms=-1;}
  if(D.fr.length>600)D.fr.splice(0,300);if(D.dr.length>600)D.dr.splice(0,300);}
// What draws the map, and why it is the 2D canvas when it is.
function diagMap(){if(!S)return 'map: none (title screen)';if(pzOn())return 'map: 2D (puzzle)';if(!GLX.want)return 'map: 2D (Always 2D)';
  if(GLX.dead)return 'map: 2D ('+(GLX.why||'no WebGL2')+')';if(GLX.lost)return 'map: 2D (graphics context lost, waiting for it back)';return GLX.gl&&GLX.shown?'map: WebGL2 · '+(GLX.gpu||'unknown GPU'):'map: WebGL2 (starting)';}
// Frames since the last readout: per second, the 95th percentile and the slowest, and draw()'s mean. The loop runs at
// the screen's rate even when a still map is not drawn again (mapStill()), so how often it was drawn is shown too.
function diagPerf(){const f=DIAG.fr.splice(0),d=DIAG.dr.splice(0),s=f.slice().sort((a,b)=>a-b),sum=f.reduce((a,x)=>a+x,0),
    q=x=>s.length?s[Math.min(s.length-1,Math.floor(s.length*x))].toFixed(0):'-',gl=GLX.shown&&!GLX.dead;
  return `${sum?(f.length*1000/sum).toFixed(0):'-'} fps · map drawn ${sum?(d.length*1000/sum).toFixed(0):'-'}/s · p95 ${q(.95)} ms · max ${q(1)} ms\ndraw ${d.length?(d.reduce((a,x)=>a+x,0)/d.length).toFixed(1):'-'} ms · x${UI.speed||0} · zoom ${cam.z.toFixed(2)}`+
    (gl?` · ${GLX.nSeg} segments · ${GLX.nPk} packets`:'');}
function diagShow(){const D=DIAG;let el=D.el;
  if(!el){el=D.el=document.createElement('pre');el.id='diag';el.style.cssText='position:fixed;left:8px;bottom:calc(var(--tabbar,0px) + 8px);z-index:99;margin:0;padding:6px 8px;max-width:calc(100vw - 32px);background:rgba(30,38,64,.85);color:#7CFFB2;font:11px/1.35 ui-monospace,monospace;border-radius:8px;pointer-events:none;white-space:pre-wrap;overflow-wrap:anywhere';
    // A hidden probe reads the safe areas (the notch, the home bar) as CSS gives them.
    const pr=document.createElement('div');pr.id='diagprobe';pr.style.cssText='position:fixed;visibility:hidden;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)';el.appendChild(pr);
    D.txt=document.createTextNode('');el.appendChild(D.txt);document.body.appendChild(el);}
  const cs=getComputedStyle(document.getElementById('diagprobe')),vv=window.visualViewport,de=document.documentElement,tb=document.getElementById('tabbar').getBoundingClientRect(),
    sa=navigator.standalone===true||!!(window.matchMedia&&matchMedia('(display-mode: standalone)').matches);
  D.txt.data=`Series of Tubes ${APP_VERSION} · ${LANG}\n`+
    `inner ${innerWidth}×${innerHeight} · screen ${screen.width}×${screen.height} · dpr ${window.devicePixelRatio||1}\n`+
    `vv ${vv?Math.round(vv.width)+'×'+Math.round(vv.height)+' top '+Math.round(vv.offsetTop):'-'} · client ${de.clientHeight}\nsafe top ${cs.paddingTop} bottom ${cs.paddingBottom}\n`+
    `standalone ${sa} · iosfix ${de.classList.contains('iosfix')} · CH ${CH}\nbody ${Math.round(document.body.getBoundingClientRect().height)} · tabbar ${Math.round(tb.top)}–${Math.round(tb.bottom)}\n`+
    diagMap()+'\n'+diagPerf();}
// Shows or hides the readout, and remembers it on this device.
function diagOn(on){const D=DIAG;clearInterval(D.t);D.t=null;if(D.el){D.el.remove();D.el=null;}D.on=!!on;D.fr.length=D.dr.length=0;D.last=0;D.dms=-1;
  if(on){D.t=setInterval(diagShow,500);diagShow();}
  try{on?localStorage.setItem('sot-vp','1'):localStorage.removeItem('sot-vp');}catch(e){}}
{const q=location.search;let on=false;try{on=localStorage.getItem('sot-vp')==='1';}catch(e){}
  if(/[?&](vp|fps)\b/.test(q))on=true;else if(/[?&]no(vp|fps)\b/.test(q))on=false;diagOn(on);}
{let taps=[];document.getElementById('hDate').closest('.chip,div').addEventListener('click',()=>{const t=performance.now();taps=taps.filter(x=>t-x<1500).concat(t);if(taps.length>=5){taps=[];diagOn(!DIAG.on);}});}
