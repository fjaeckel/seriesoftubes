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
// iOS settles the standalone viewport a moment after launch and after rotating.
for(const t of [300,1000])setTimeout(()=>{resize();WL.key=null;},t);addEventListener('pageshow',()=>{resize();WL.key=null;});
