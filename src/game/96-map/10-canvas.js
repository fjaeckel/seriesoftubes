/* ================= CANVAS ================= */
// ctx is the 2D context draw() paints with: the map's own (CTX0), or with WebGL on the overlay above the card (56-webgl.js).
const cv=$('map'),CTX0=cv.getContext('2d');let ctx=CTX0;
const cam={x:1050,y:330,z:0.8};
let CW=0,CH=0,DPR=1;
/* Installed on an iPhone home screen with a translucent status bar, iOS can report a viewport one status bar
   shorter than the screen while drawing from the very top, leaving an empty strip under the tab bar.
   Measure the screen instead, on standalone iPhones only. It must not depend on the gap it fixes: once
   the page is sized to the screen, iOS reports a full viewport, and switching back would bring the strip back. */
function fixStandaloneHeight(){const R0=document.documentElement;
  const sa=window.navigator.standalone===true||!!(window.matchMedia&&matchMedia('(display-mode: standalone)').matches);
  const sh=screen&&screen.width&&screen.height?(innerWidth>innerHeight?Math.min(screen.width,screen.height):Math.max(screen.width,screen.height)):0,gap=sh-innerHeight;
  const on=sa&&/iPhone|iPod/.test(navigator.userAgent)&&sh>0&&gap>=0&&gap<=80;
  R0.classList.toggle('iosfix',on);if(on)R0.style.setProperty('--app-h',sh+'px');else R0.style.removeProperty('--app-h');return on?sh:0;}
function resize(){const ah=fixStandaloneHeight();DPR=Math.min(2,window.devicePixelRatio||1);CW=innerWidth;CH=ah||innerHeight;cv.width=CW*DPR;cv.height=CH*DPR;}
addEventListener('resize',()=>{resize();WL.key=null;renderLeft();fitHud();});resize();
// Viewport readout for debugging phone layouts: open the game once with ?vp in the address (or the start URL).
function vpDebug(){let el=document.getElementById('vpdbg');if(!el){el=document.createElement('pre');el.id='vpdbg';el.style.cssText='position:fixed;left:8px;bottom:calc(var(--tabbar,0px) + 8px);z-index:99;margin:0;padding:6px 8px;background:rgba(30,38,64,.85);color:#7CFFB2;font:11px/1.35 ui-monospace,monospace;border-radius:8px;pointer-events:none';document.body.appendChild(el);
    const pr=document.createElement('div');pr.id='vpprobe';pr.style.cssText='position:fixed;visibility:hidden;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)';document.body.appendChild(pr);}
  const pr=document.getElementById('vpprobe'),cs=getComputedStyle(pr),vv=window.visualViewport,de=document.documentElement,tb=document.getElementById('tabbar').getBoundingClientRect();
  el.textContent=`inner ${innerWidth}×${innerHeight} · screen ${screen.width}×${screen.height}\nvv ${vv?Math.round(vv.width)+'×'+Math.round(vv.height)+' top '+Math.round(vv.offsetTop):'-'} · client ${de.clientHeight}\nsafe top ${cs.paddingTop} bottom ${cs.paddingBottom}\nstandalone ${navigator.standalone===true||!!(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)} · iosfix ${de.classList.contains('iosfix')} · CH ${CH}\nbody ${Math.round(document.body.getBoundingClientRect().height)} · tabbar ${Math.round(tb.top)}–${Math.round(tb.bottom)}`;}
let VP_T=null;const vpOn=on=>{clearInterval(VP_T);VP_T=null;const el=document.getElementById('vpdbg');if(el)el.remove();if(on){VP_T=setInterval(vpDebug,500);vpDebug();}try{on?localStorage.setItem('sot-vp','1'):localStorage.removeItem('sot-vp');}catch(e){}};
if(/[?&]vp\b/.test(location.search))vpOn(true);else if(/[?&]novp\b/.test(location.search))vpOn(false);
try{if(localStorage.getItem('sot-vp')==='1')vpOn(true);}catch(e){}
// Inside an installed app there is no address bar: five quick taps on the date toggle the readout.
{let taps=[];document.getElementById('hDate').closest('.chip,div').addEventListener('click',()=>{const t=performance.now();taps=taps.filter(x=>t-x<1500).concat(t);if(taps.length>=5){taps=[];vpOn(!VP_T);}});}
// iOS settles the standalone viewport a moment after launch and after rotating.
for(const t of [300,1000])setTimeout(()=>{resize();WL.key=null;},t);addEventListener('pageshow',()=>{resize();WL.key=null;});
