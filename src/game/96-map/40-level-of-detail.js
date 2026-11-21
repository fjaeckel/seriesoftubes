/* Level of detail (#37): zoomed out the map turns into a network map, with dots for cities, small
   router pills for your POPs and thinner links. Phones switch a little earlier, the screen is small. */
const lodFar=()=>cam.z<(innerWidth<=760?0.95:0.72);
// One native call draws the same rounded box where the browser has it and the corners fit (hundreds per frame).
function rr(x,y,w,h,r){ctx.beginPath();if(ctx.roundRect&&2*r<=w&&2*r<=h){ctx.roundRect(x,y,w,h,r);return;}ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
// Enough world copies to cover any screen width at any zoom (the map wraps horizontally).
function visibleKs(x0=0,x1=W){const ks=[];for(let k=-5;k<=5;k++){const a=toS(x0,0,k)[0],b=toS(x1,0,k)[0];if(b>-200&&a<CW+200)ks.push(k);}return ks;}
/* A line is drawn from its first city's copy and takes the short way round, so it can run up to half a world past that
   copy's edge (Seattle to Singapore over the Pacific). Its far end shows only through a copy whose own world is off
   screen (#446): lines get the copies their x span [x0,x1] reaches, not just the copies whose world shows. */
const spanKs=b=>visibleKs(Math.min(0,b[0]),Math.max(W,b[1]));
// Markers that ride on such lines (ships, the monkey): any copy within half a world. They skip themselves off screen.
const wideKs=()=>visibleKs(-W/2,W*1.5);
const GEO=new Map();
