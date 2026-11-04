/* A frame meter for measuring the map on a real device: open the game once with ?fps (?nofps hides it again).
   Frames per second, the slowest frames, the time draw() takes, and which renderer and graphics card draw the map. */
const FPSM={on:false,el:null,fr:[],dr:[],last:0,shown:0,dms:-1};
try{const q=location.search;if(/[?&]fps\b/.test(q))localStorage.setItem('sot-fps','1');else if(/[?&]nofps\b/.test(q))localStorage.removeItem('sot-fps');
  FPSM.on=localStorage.getItem('sot-fps')==='1';}catch(e){}
function fpsNote(now){const M=FPSM;if(M.last)M.fr.push(now-M.last);M.last=now;if(M.dms>=0){M.dr.push(M.dms);M.dms=-1;}
  if(now-M.shown<500)return;M.shown=now;
  if(!M.el){M.el=document.createElement('pre');M.el.id='fpsm';M.el.style.cssText='position:fixed;right:8px;bottom:calc(var(--tabbar,0px) + 8px);z-index:99;margin:0;padding:6px 8px;background:rgba(30,38,64,.85);color:#7CFFB2;font:11px/1.35 ui-monospace,monospace;border-radius:8px;pointer-events:none;white-space:pre';document.body.appendChild(M.el);}
  const f=M.fr.splice(0),d=M.dr.splice(0),s=f.slice().sort((a,b)=>a-b),sum=f.reduce((a,x)=>a+x,0),q=x=>s.length?s[Math.min(s.length-1,Math.floor(s.length*x))].toFixed(0):'-';
  const gl=GLX.shown&&!GLX.dead;
  M.el.textContent=`${sum?(f.length*1000/sum).toFixed(0):0} fps · p95 ${q(.95)} ms · max ${q(1)} ms\ndraw ${d.length?(d.reduce((a,x)=>a+x,0)/d.length).toFixed(1):'-'} ms · ${gl?'WebGL':'2D'} · x${UI.speed||0}`+(gl?`\n${GLX.nSeg} segments · ${GLX.nPk} packets\n${GLX.gpu.slice(0,60)}`:'');}
