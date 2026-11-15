/* Dark mode (#80): light by default; dark, or following the device, only when the player picks it in Settings. Per
   device (localStorage 'sot-theme'), like the animations. The panels switch through CSS (:root.dark, 98-dark.css and the
   generated 99-dark-auto.css); the map's sea, land and clouds through MAPC, which the 2D map and the card both paint
   with. Tubes, cities and icons keep their colours: they are drawn with their own dark outlines. */
const MAP_PAL={
  light:{k:'l',sea0:'#62CBEA',sea1:'#43AED6',wave:'rgba(255,255,255,.45)',cloud:'rgba(255,255,255,.55)',shadow:'rgba(20,90,130,.35)',sand:'#F8E6A8',grass:'#9BDA6C',hill:'#86CB5B',shine:'rgba(255,255,255,.18)',bar:'#57C4E5'},
  dark:{k:'d',sea0:'#1D3C5F',sea1:'#13294A',wave:'rgba(170,205,255,.22)',cloud:'rgba(210,222,245,.10)',shadow:'rgba(0,0,0,.40)',sand:'#6E6650',grass:'#3F6B3B',hill:'#365F32',shine:'rgba(255,255,255,.06)',bar:'#13294A'}};
let MAPC=MAP_PAL.light;
const THEMES=['light','dark','auto'];
function themeDark(){const t=UI.theme||'light';if(t==='dark')return true;if(t!=='auto')return false;try{return matchMedia('(prefers-color-scheme: dark)').matches;}catch(e){return false;}}
function applyTheme(){const d=themeDark(),r=document.documentElement;r.classList.toggle('dark',d);MAPC=d?MAP_PAL.dark:MAP_PAL.light;
  const m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',MAPC.bar);
  // The land is painted once into caches (the 2D world layer, the card's geometry): their keys carry MAPC.k.
  if(typeof WL!=='undefined')WL.key=null;}
// Read once at boot; "Auto" follows the device when it switches (at dusk, say).
function themeBoot(){try{const t=localStorage.getItem('sot-theme');UI.theme=THEMES.includes(t)?t:'light';}catch(e){UI.theme='light';}applyTheme();
  try{matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(UI.theme==='auto')applyTheme();});}catch(e){}}
