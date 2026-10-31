/* The land is never drawn as vectors onto the screen canvas: the coastline has thousands of points, and some
   GPU canvas implementations (Firefox on Android) garble big paths (#43). It is painted into an offscreen image
   instead: the whole world when that fits in MAXPX, otherwise the visible area plus a margin, repainted when you
   pan out of it. While a zoom gesture is still moving, the last image is scaled rather than repainted. */
const SOFT_CANVAS=/Firefox\//.test(navigator.userAgent);
function wlCovers(z){if(WL.full)return true;const hw=CW/2/z,hh=CH/2/z,w=WL.cv.width/WL.sc,h=WL.cv.height/WL.sc;
  return cam.x-hw>=WL.ox&&cam.x+hw<=WL.ox+w&&cam.y-hh>=WL.oy&&cam.y+hh<=WL.oy+h;}
function worldLayer(z){
  const now=performance.now();if(z!==WL.lastZ){WL.lastZ=z;WL.zAt=now;}
  const sc=z*DPR,key=sc.toFixed(4)+(arOn()?'a':''),have=!!(WL.cv&&WL.key);
  if(have&&WL.key===key&&wlCovers(z))return WL;
  if(have&&now-WL.zAt<250)return WL; // mid-gesture: scale the last image
  const full=W*sc+2<=MAXPX;let ox=0,oy=0,w=W,h=H;
  if(!full){const mx=Math.min(MAXPX/sc,CW/z*2),my=Math.min(MAXPX/sc,CH/z*2);w=mx;h=my;ox=cam.x-w/2;oy=cam.y-h/2;}
  const cv2=WL.cv||document.createElement('canvas');cv2.width=Math.ceil(w*sc)+2;cv2.height=Math.ceil(h*sc)+2;
  const c=cv2.getContext('2d',SOFT_CANVAS?{willReadFrequently:true}:undefined);if(!c)return null;
  const kk=full?0:Math.floor(cam.x/W)*W;c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,cv2.width,cv2.height);c.setTransform(sc,0,0,sc,-(ox-kk)*sc,-oy*sc);paintWorld(c,z,z<1.7&&!arOn());
  Object.assign(WL,{cv:cv2,key,sc,ox,oy,full,cab:z<1.7&&!arOn()});return WL;
}
// Draw the world image for map copy k (full layers repeat per copy; a crop already holds what is visible).
function drawWorldLayer(wl,k,z,k0){if(!wl.full&&k!==k0)return;const f=z*DPR/wl.sc,ox=(wl.full?k*W:wl.ox);
  ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(wl.cv,Math.round(DPR*((ox-cam.x)*z+CW/2)),Math.round(DPR*((wl.oy-cam.y)*z+CH/2)),wl.cv.width*f,wl.cv.height*f);}
function cableCol(C){return C.price<=0.85?'#14A88C':C.price<=1.1?'#2F7BEA':'#A05AE0';}
function drawBackhoe(x,y,now,sub){
  const b=Math.sin(now/180)*2;ctx.save();ctx.translate(x,y-14+b);
  ctx.strokeStyle='#1E2640';ctx.lineWidth=2.2;
  if(sub){ // shark fin
    ctx.fillStyle='#6B7C99';ctx.beginPath();ctx.moveTo(-12,8);ctx.quadraticCurveTo(-2,-14,10,-12);ctx.quadraticCurveTo(4,-2,12,8);ctx.closePath();ctx.fill();ctx.stroke();
  }else{
    ctx.fillStyle='#FFD23F';rr(-12,-4,18,12,3);ctx.fill();ctx.stroke();rr(-8,-12,10,9,2);ctx.fillStyle='#BDE8FF';ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.moveTo(6,0);ctx.lineTo(14,-10);ctx.lineTo(19,2);ctx.stroke();ctx.fillStyle='#1E2640';ctx.beginPath();ctx.arc(-7,10,3,0,7);ctx.arc(2,10,3,0,7);ctx.fill();
  }
  ctx.restore();
}
