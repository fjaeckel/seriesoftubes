/* ---------- router pictures: one cartoon per model in RG, same order ----------
   Drawn as SVG from a small kit in the map's style (navy outlines, candy colours), each with its model's joke. Built
   only when a panel shows one, then cached; the kit lives in its own scope. */
const RG_ART=(()=>{
const O='#1E2640',W=4;
const st=(f,w=W)=>`fill="${f}" stroke="${O}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const P=(d,f='none',w=W)=>`<path d="${d}" ${st(f,w)}/>`;
const R=(x,y,w,h,f,r=10,sw=W)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ${st(f,sw)}/>`;
const C=(x,y,r,f,sw=W)=>`<circle cx="${x}" cy="${y}" r="${r}" ${st(f,sw)}/>`;
const E=(x,y,rx,ry,f,sw=W,rot=0)=>`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" ${st(f,sw)}${rot?` transform="rotate(${rot} ${x} ${y})"`:''}/>`;
const T=(x,y,t,s=10,f=O)=>`<text x="${x}" y="${y}" font-family="'Baloo 2',Nunito,sans-serif" font-weight="800" font-size="${s}" fill="${f}" text-anchor="middle">${t}</text>`;
const sh=(w=70,x=100,y=146)=>`<ellipse cx="${x}" cy="${y}" rx="${w}" ry="8" fill="${O}" opacity=".18"/>`;
const bob=s=>`<g class="bob">${s}</g>`;
const ports=(x,y,w,n,c='#7FD8EE')=>{let s=R(x,y,w,16,O,4,2);const g=(w-8)/n;for(let i=0;i<n;i++)s+=`<rect x="${x+4+i*g+1}" y="${y+4}" width="${(g-3).toFixed(1)}" height="8" rx="1.5" fill="${c}"/>`;return s;};
const leds=(x,y,cs,r=4)=>cs.map((c,i)=>C(x+i*(r*3),y,r,c,2)).join('');
// faces: eyes at (x,y), d apart from the middle
const glint=(x,y)=>`<path d="M${x-3} ${y-2} l3 -1.5" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>`;
const EY={
 happy:(x,y,d=14)=>P(`M${x-d-6} ${y} q6 -8 12 0 M${x+d-6} ${y} q6 -8 12 0`),
 sleepy:(x,y,d=14)=>P(`M${x-d-6} ${y} q6 6 12 0 M${x+d-6} ${y} q6 6 12 0`),
 dots:(x,y,d=14)=>`<circle cx="${x-d}" cy="${y}" r="4.5" fill="${O}"/><circle cx="${x+d}" cy="${y}" r="4.5" fill="${O}"/><circle cx="${x-d+1.6}" cy="${y-1.6}" r="1.4" fill="#fff"/><circle cx="${x+d+1.6}" cy="${y-1.6}" r="1.4" fill="#fff"/>`,
 angry:(x,y,d=14)=>P(`M${x-d-9} ${y-8} L${x-d+7} ${y-3} M${x+d+9} ${y-8} L${x+d-7} ${y-3}`,'none',5)+`<path d="M${x-d-8} ${y} L${x-d+7} ${y+2} L${x-d-8} ${y+6}Z M${x+d+8} ${y} L${x+d-7} ${y+2} L${x+d+8} ${y+6}Z" ${st('#FF4D5E',2)}/>`,
 shades:(x,y,d=14)=>`<path d="M${x-d-11} ${y-5} h22 v5 q0 8 -11 8 q-11 0 -11 -8z M${x+d-11} ${y-5} h22 v5 q0 8 -11 8 q-11 0 -11 -8z" ${st(O,2.5)}/>`+P(`M${x-d+11} ${y-3} H${x+d-11}`,'none',3)+glint(x-d,y)+glint(x+d,y),
 sad:(x,y,d=14)=>EY.dots(x,y+2,d)+P(`M${x-d-7} ${y-9} L${x-d+5} ${y-6} M${x+d+7} ${y-9} L${x+d-5} ${y-6}`,'none',3),
 dizzy:(x,y,d=14)=>P(`M${x-d-5} ${y-5} l10 10 m0 -10 l-10 10 M${x+d-5} ${y-5} l10 10 m0 -10 l-10 10`,'none',3.5),
 worried:(x,y,d=14)=>EY.dots(x,y,d)+P(`M${x-d-6} ${y-10} L${x-d+6} ${y-12} M${x+d+6} ${y-10} L${x+d-6} ${y-12}`,'none',3),
};
EY.wink=(x,y,d=14)=>`<circle cx="${x-d}" cy="${y}" r="4.5" fill="${O}"/><circle cx="${x-d+1.6}" cy="${y-1.6}" r="1.4" fill="#fff"/>`+P(`M${x+d-6} ${y} q6 -8 12 0`);
const MO={
 smile:(x,y,w=9)=>P(`M${x-w} ${y} q${w} ${w*.8} ${2*w} 0`),
 grin:(x,y,w=10)=>P(`M${x-w} ${y} q${w} ${w*1.2} ${2*w} 0z`,'#7A2633',3),
 flat:(x,y,w=8)=>P(`M${x-w} ${y} h${2*w}`),
 frown:(x,y,w=8)=>P(`M${x-w} ${y+4} q${w} ${-w*.8} ${2*w} 0`),
 o:(x,y)=>E(x,y+2,4,5,'#7A2633',3),
 smirk:(x,y,w=9)=>P(`M${x-w} ${y+1} q${w*1.2} ${w*.5} ${2*w} -4`),
 w:(x,y)=>P(`M${x-8} ${y} q4 5 8 0 q4 5 8 0`),
 teeth:(x,y,w=12)=>R(x-w,y-4,2*w,9,'#fff',3,3)+P(`M${x-w/3} ${y-4} v9 M${x+w/3} ${y-4} v9`,'none',2),
};
const face=(x,y,e,m,d=14,my=14)=>EY[e](x,y,d)+(m?MO[m](x,y+my):'');
const cheeks=(x,y,d=26)=>`<ellipse cx="${x-d}" cy="${y}" rx="7" ry="4.5" fill="#FF4F9A" opacity=".55"/><ellipse cx="${x+d}" cy="${y}" rx="7" ry="4.5" fill="#FF4F9A" opacity=".55"/>`;
// props
const antenna=(x,y,dx,dy,tip='#FFD23F')=>P(`M${x} ${y} l${dx} ${dy}`)+C(x+dx,y+dy,5,tip,3);
const bent=(x,y)=>P(`M${x} ${y} q4 -14 18 -22 q6 4 2 10`);
const tapeX=(x,y,w,h)=>P(`M${x} ${y} L${x+w} ${y+h} M${x+w} ${y} L${x} ${y+h}`,'none',13).replace(`stroke="${O}"`,'stroke="#C9D1E6"')+P(`M${x} ${y} L${x+w} ${y+h} M${x+w} ${y} L${x} ${y+h}`,'none',2).replace('stroke-linecap','stroke-dasharray="2 5" stroke-linecap');
const cobweb=(x,y)=>P(`M${x} ${y} q10 -10 20 0 M${x+6} ${y} q4 -6 8 0 M${x+10} ${y} v-9`,'none',1.5);
const sticker=(x,y,w,h,t,f='#fff',s=8)=>P(`M${x} ${y} h${w} l3 ${h} h${-w}z`,f,2.5)+T(x+w/2+1.5,y+h/2+3,t,s);
const spots=(a)=>a.map(([x,y,s])=>P(`M${x} ${y} q${s} ${-s*.6} ${s*1.8} ${s*.2} q${-s*.2} ${s} ${-s*1.2} ${s*.8}z`,'#9A5226',3)).join('');
const flames=(x,y,s=1)=>P(`M${x} ${y} q${-14*s} ${-6*s} ${-6*s} ${-24*s} q${4*s} ${8*s} ${10*s} ${8*s} q${-2*s} ${-12*s} ${8*s} ${-20*s} q${2*s} ${14*s} ${10*s} ${16*s} q${2*s} ${-6*s} ${-2*s} ${-12*s} q${14*s} ${8*s} ${8*s} ${32*s}z`,'#FF8A3D',3)+P(`M${x+2*s} ${y-2*s} q${-6*s} ${-4*s} ${-1*s} ${-12*s} q${4*s} ${6*s} ${8*s} ${4*s} q${2*s} ${6*s} ${-1*s} ${8*s}z`,'#FFD23F',2);
const feet=(xs,y,f)=>xs.map(x=>P(`M${x-8} ${y} q-2 10 8 10 h6 q8 0 4 -10`,f)).join('');
const legs=(xs,y,f='#1E2640',h=12)=>xs.map(x=>P(`M${x} ${y} v${h} h8`,'none',5)).join('');
const cloud=(x,y,s=1,f='#fff')=>P(`M${x-22*s} ${y} q-8 -14 8 -14 q4 -12 18 -6 q12 -8 18 6 q14 0 8 14z`,f,3);
const rain=(x,y)=>P(`M${x-14} ${y+6} l-3 8 M${x} ${y+6} l-3 8 M${x+14} ${y+6} l-3 8`,'none',3).replace(`stroke="${O}"`,'stroke="#2F8CFF"');
const sun=(x,y,r=10)=>C(x,y,r,'#FFD23F',3)+P(`M${x} ${y-r-4} v-6 M${x} ${y+r+4} v6 M${x-r-4} ${y} h-6 M${x+r+4} ${y} h6 M${x-r} ${y-r} l-4 -4 M${x+r} ${y+r} l4 4 M${x+r} ${y-r} l4 -4 M${x-r} ${y+r} l-4 4`,'none',3);
const bolt=(x,y,s=1,f='#FFD23F')=>P(`M${x} ${y} l${-10*s} ${18*s} h${8*s} l${-6*s} ${18*s} l${18*s} ${-24*s} h${-9*s} l${7*s} ${-12*s}z`,f,3);
const smoke=(x,y)=>C(x,y,6,'#C9D1E6',2.5)+C(x+8,y-10,8,'#C9D1E6',2.5)+C(x+2,y-24,10,'#E8EDF7',2.5);
const steam=(x,y)=>P(`M${x} ${y} q-6 -8 0 -16 q6 -8 0 -16 M${x+12} ${y} q-6 -8 0 -16 q6 -8 0 -16`,'none',3).replace(`stroke="${O}"`,'stroke="#fff"').replace('stroke-width="3"','stroke-width="4"');
const speed=(x,y)=>P(`M${x} ${y} h-26 M${x-6} ${y+14} h-30 M${x} ${y+28} h-22`,'none',4).replace(`stroke="${O}"`,'stroke="#fff"');
const tag=(x,y,l1,l2)=>P(`M${x-24} ${y-20} q-12 2 -12 14`,'none',2.5)+R(x-12,y-6,30,26,'#FFD23F',4,3)+T(x+3,y+5,l1,8)+(l2?T(x+3,y+15,l2,8):'');
const disco=(x,y,r=16)=>P(`M${x} ${y-r-12} v12`)+C(x,y,r,'#C9D1E6')+P(`M${x-r+2} ${y-6} h${2*r-4} M${x-r} ${y+2} h${2*r} M${x-r+3} ${y+9} h${2*r-6} M${x} ${y-r} v${2*r} M${x-9} ${y-r+3} q-4 ${r-3} 0 ${2*r-6} M${x+9} ${y-r+3} q4 ${r-3} 0 ${2*r-6}`,'none',2);
const beams=(x,y)=>`<path d="M${x} ${y} L${x-60} ${y-30} M${x} ${y} L${x+60} ${y-30} M${x} ${y} L${x-80} ${y+6}" stroke="#FFD23F" stroke-width="7" opacity=".55" stroke-linecap="round"/>`;
const coinslot=(x,y)=>R(x,y,24,10,'#FFD23F',3,3)+R(x+6,y+3,12,3,O,1,1);
const coins=(x,y,n)=>Array.from({length:n},(_,i)=>E(x,y-i*6,12,5,'#FFD23F',3)).join('');
const eyepatch=(x,y)=>C(x,y,8,O,2)+P(`M${x-24} ${y-16} L${x+30} ${y+6}`,'none',2.5);
const beanie=(x,y,w,f='#FF8A3D')=>P(`M${x-w/2} ${y} q0 ${-w*.5} ${w/2} ${-w*.5} q${w/2} 0 ${w/2} ${w*.5}z`,f)+R(x-w/2-3,y-6,w+6,12,f,5,3)+C(x,y-w*.5-5,6,f,3);
const beard=(x,y,w=30,f='#8A4B22')=>P(`M${x-w/2} ${y} q${w/2} ${w*.9} ${w} 0 q-6 6 ${-w/2} 6 q${-w/2+6} 0 ${-w/2} -6z`,f,3);
const capHat=(x,y,w=70)=>P(`M${x-w/2} ${y} q${w/2} -40 ${w} 0 q${-w/2} 12 ${-w} 0z`,'#1E2640',3)+C(x,y-14,5,'#FFD23F',2)+P(`M${x-5} ${y-14} l10 0`,'none',2).replace(`stroke="${O}"`,'stroke="#FFF"');
const bandana=(x,y,w)=>P(`M${x-w/2} ${y} q${w/2} -26 ${w} 0z`,'#FF4D5E',3)+P(`M${x+w/2} ${y-2} l14 4 l-6 8z`,'#FF4D5E',3)+`<circle cx="${x-10}" cy="${y-8}" r="2.5" fill="#fff"/><circle cx="${x+8}" cy="${y-10}" r="2.5" fill="#fff"/>`;
const parrot=(x,y)=>E(x,y,10,14,'#22C47A',3)+C(x+2,y-14,8,'#22C47A',3)+P(`M${x+9} ${y-15} q8 2 2 8z`,'#FFD23F',2.5)+`<circle cx="${x+4}" cy="${y-16}" r="1.8" fill="${O}"/>`+P(`M${x-6} ${y+10} l-8 10 M${x+2} ${y+12} l2 8`,'none',3).replace(`stroke="${O}"`,'stroke="#FF4D5E"');
const chest=(x,y)=>R(x,y,40,26,'#C9B27C',4,3)+P(`M${x} ${y} q20 -18 40 0`,'#C9B27C',3)+R(x+16,y-2,8,8,'#FFD23F',2,2)+coins(x+20,y-12,1);
const mast=(x,y,h=70)=>P(`M${x} ${y} v${-h}`)+P(`M${x} ${y-h+4} l34 10 l-34 14z`,'#1E2640',3)+C(x+14,y-h+15,4,'#fff',1.5);
const wheel=(x,y,r=16)=>C(x,y,r,'#C9B27C',3)+C(x,y,5,'#FFD23F',2.5)+P(`M${x-r-6} ${y} h${2*r+12} M${x} ${y-r-6} v${2*r+12} M${x-r} ${y-r} l${2*r} ${2*r} M${x+r} ${y-r} l${-2*r} ${2*r}`,'none',3);
const anchor=(x,y)=>P(`M${x} ${y} v26 M${x-12} ${y+18} q12 16 24 0 M${x-6} ${y+6} h12`,'none',4)+C(x,y-4,4,'#fff',3);
const rivets=(x,y,w,h)=>[[x+8,y+8],[x+w-8,y+8],[x+8,y+h-8],[x+w-8,y+h-8]].map(([a,b])=>C(a,b,3,'#E8EDF7',2)).join('');
const pine=(x,y,w,h)=>{let s='';for(let i=1;i<6;i++)s+=P(`M${x+i*w/6} ${y+4} v${h-8}`,'none',2);return s;};
const thermo=(x,y,f='#FF4D5E')=>R(x-4,y-26,8,30,'#fff',4,2.5)+C(x,y+6,7,f,2.5)+`<rect x="${x-1.5}" y="${y-18}" width="3" height="22" fill="${f}"/>`;
const stars=(pts)=>pts.map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r}" fill="#FFD23F"/>`).join('');
const planet=(x,y,r,f,ring)=>C(x,y,r,f,3)+(ring?E(x,y,r+8,4,'none',3,-20):'');
const towel=(x,y)=>P(`M${x} ${y} q22 -6 20 26 l-8 36 q-4 -28 -12 -40z`,'#FFD23F',3)+P(`M${x+8} ${y+6} l6 40 M${x+16} ${y+10} l2 20`,'none',3).replace(`stroke="${O}"`,'stroke="#FF4F9A"');
const screen=(x,y,w,h,t,s=20)=>R(x,y,w,h,'#0B0F1C',4,3).replace(`stroke="${O}"`,'stroke="#7FD8EE"')+T(x+w/2,y+h/2+s*.35,t,s,'#7FD8EE');
const bricks=(x,y,n)=>Array.from({length:n},(_,i)=>R(x+i*36,y,34,16,'#E07A5F',2,3)).join('');
const bandaid=(x,y,rot=-30)=>`<g transform="rotate(${rot} ${x} ${y})">${R(x-14,y-5,28,10,'#F4CFA0',4,2.5)}<rect x="${x-5}" y="${y-3}" width="10" height="6" fill="#E3B27E"/></g>`;
const knob=(x,y)=>C(x,y,8,'#C9B27C',3)+P(`M${x} ${y} l4 -5`,'none',3);
const mustache=(x,y)=>P(`M${x} ${y} q-8 -6 -18 2 q8 2 18 -2 q8 -6 18 2 q-8 2 -18 -2z`,'#8A4B22',2.5);
const hood=(x,y,w,h)=>P(`M${x} ${y+h} V${y+24} q0 -30 ${w/2} -30 q${w/2} 0 ${w/2} 30 V${y+h}`,'#3A4266');
const katana=(x1,y1,x2,y2)=>P(`M${x1} ${y1} L${x2} ${y2}`,'none',7).replace(`stroke="${O}"`,'stroke="#C9D1E6"')+P(`M${x1} ${y1} L${x2} ${y2}`,'none',2)+P(`M${x2} ${y2} l10 -10`,'none',6).replace(`stroke="${O}"`,'stroke="#7A2633"');
const ears=(x,y,d,f)=>P(`M${x-d-14} ${y} l8 -22 l16 16z M${x+d+14} ${y} l-8 -22 l-16 16z`,f);
const tail=(x,y,f)=>P(`M${x} ${y} q30 -6 22 -34 q-2 -8 -8 -4`,'none',9).replace(`stroke="${O}"`,`stroke="${O}"`)+P(`M${x} ${y} q30 -6 22 -34 q-2 -8 -8 -4`,'none',5).replace(`stroke="${O}"`,`stroke="${f}"`);
const sweat=(x,y)=>P(`M${x} ${y} q-6 8 0 10 q6 -2 0 -10z`,'#7FD8EE',2.5);
const arm=(x,y,s)=>P(`M${x} ${y} q${s*22} 4 ${s*26} -18 q${s*-2} -10 ${s*-12} -6`,'none',10)+P(`M${x} ${y} q${s*22} 4 ${s*26} -18 q${s*-2} -10 ${s*-12} -6`,'none',6).replace(`stroke="${O}"`,'stroke="#FF8FBE"')+C(x+s*22,y-8,7,'#FF8FBE',3);
const dumbbell=(y)=>P(`M30 ${y} H170`,'none',5)+R(18,y-14,12,28,'#5D6788',3,3)+R(170,y-14,12,28,'#5D6788',3,3)+R(8,y-10,10,20,'#5D6788',3,3)+R(182,y-10,10,20,'#5D6788',3,3);
const headband=(x,y,w)=>R(x,y,w,10,'#FF4D5E',3,3);
const notes=(x,y)=>P(`M${x} ${y} v-14 l10 -3 v14`,'none',3)+C(x-3,y,3.5,O,0)+C(x+7,y-3,3.5,O,0);
const tiles=(y)=>{const cs=['#FF4F9A','#FFD23F','#22C47A','#7FD8EE','#7B61FF'];let s='';for(let i=0;i<8;i++)s+=P(`M${20+i*20} ${y} h20 l-4 14 h-20z`,cs[i%5],2.5);return s;};
const headphones=(x,y,w)=>P(`M${x-w/2} ${y} q0 ${-w*.55} ${w/2} ${-w*.55} q${w/2} 0 ${w/2} ${w*.55}`,'none',5)+R(x-w/2-8,y-6,12,18,'#FF4F9A',4,3)+R(x+w/2-4,y-6,12,18,'#FF4F9A',4,3);
const afro=(x,y,w)=>{let s='';for(let i=0;i<7;i++){const a=Math.PI*(i/6),r=w/2;s+=C(x-Math.cos(a)*r*.9,y-Math.sin(a)*r*.6,14,'#3A2A20',3);}return s+E(x,y-10,w/2,18,'#3A2A20',0);};
const bells=(xs,y)=>xs.map(x=>P(`M${x-5} ${y} l-6 18 h18 l-6 -18z`,'#FF8A3D',3)).join('');
const hammer=(x,y)=>P(`M${x} ${y} l26 -8`,'none',6).replace(`stroke="${O}"`,'stroke="#C9B27C"')+P(`M${x} ${y} l26 -8`,'none',2)+R(x+32,y-30,12,22,'#9AA3BE',2,3)+P(`M${x+30} ${y-6} l4 -4 M${x+28} ${y-12} l4 2`,'none',2);
const anvil=(x,y)=>P(`M${x-24} ${y} h48 l-6 8 h-10 l4 12 h-24 l4 -12 h-10z M${x-24} ${y} q-14 0 -16 -6 h16z`,'#5D6788',3);
const dizzyStars=(x,y)=>stars([[x-12,y,3],[x,y-6,3.5],[x+12,y,3]])+P(`M${x-18} ${y+4} q18 -14 36 0`,'none',2);
const icicles=(x,y,w)=>{let s='';for(let i=0;i<5;i++)s+=P(`M${x+i*w/5+4} ${y} l4 ${10+(i%2)*6} l4 ${-10-(i%2)*6}`,'#E8F6FF',2);return s;};
const snowcap=(x,y,w)=>P(`M${x-4} ${y+4} q${w/4} -14 ${w/2} -4 q${w/4} -12 ${w/2+8} 4 q-6 8 -14 2 q-10 8 -20 0 q-12 8 -24 0 q-10 8 ${-w/2+22} -2z`,'#fff',3);
const racing=(x,y,w)=>`<rect x="${x}" y="${y}" width="${w}" height="7" fill="#FF4D5E"/><rect x="${x}" y="${y+10}" width="${w}" height="7" fill="#2F8CFF"/>`;
const roundel=(x,y,t)=>C(x,y,15,'#fff',3)+T(x,y+6,t,16);
const fire=(x,y)=>flames(x,y,.55);
const extinguisher=(x,y)=>R(x,y,14,34,'#FF4D5E',6,3)+P(`M${x+4} ${y} v-6 h10 l6 6`,'none',3)+P(`M${x-2} ${y+12} h18`,'none',6).replace(`stroke="${O}"`,'stroke="#C9D1E6"');
const rope=(x1,x2,y)=>R(x1-4,y-34,8,40,'#FFD23F',3,3)+R(x2-4,y-34,8,40,'#FFD23F',3,3)+P(`M${x1} ${y-26} q${(x2-x1)/2} 18 ${x2-x1} 0`,'none',6).replace(`stroke="${O}"`,'stroke="#C0154F"');
const receipt=(x,y)=>P(`M${x} ${y} h18 v34 q-2 10 14 12 h40 v10 h-56 q-16 0 -16 -14z`,'#fff',3)+P(`M${x+4} ${y+8} h10 M${x+4} ${y+16} h10 M${x+4} ${y+24} h10 M${x+26} ${y+52} h30`,'none',2)+T(x+9,y+-2,'€',10);
const piglet=(x,y)=>C(x,y,10,'#FF8FBE',3)+E(x,y+3,5,3.5,'#FF4F9A',2)+`<circle cx="${x-4}" cy="${y-3}" r="1.6" fill="${O}"/><circle cx="${x+4}" cy="${y-3}" r="1.6" fill="${O}"/>`+P(`M${x-9} ${y-7} l-3 -6 l6 3 M${x+9} ${y-7} l3 -6 l-6 3`,'#FF8FBE',2);
const ladder=(x,y,h)=>P(`M${x} ${y} l10 ${-h} M${x+16} ${y} l10 ${-h}`,'none',3)+Array.from({length:Math.floor(h/12)},(_,i)=>P(`M${x+2+i*1.2*10/h*12} ${y-8-i*12} h16`,'none',2.5)).join('');
const rainbow=(x,y,r)=>['#FF4D5E','#FF8A3D','#FFD23F','#22C47A','#2F8CFF'].map((c,i)=>`<path d="M${x-r+i*6} ${y} a${r-i*6} ${r-i*6} 0 0 1 ${2*(r-i*6)} 0" fill="none" stroke="${c}" stroke-width="6"/>`).join('');
const nest=(x,y)=>P(`M${x-18} ${y} h36 l-4 14 h-28z`,'#C9B27C',3)+P(`M${x} ${y+14} v24`,'none',4);
const scope=(x,y)=>P(`M${x} ${y} l26 -10`,'none',8)+P(`M${x} ${y} l26 -10`,'none',4).replace(`stroke="${O}"`,'stroke="#FFD23F"');
const bench=(y)=>R(24,y,152,12,'#C9B27C',3,3)+P(`M40 ${y+12} v14 M160 ${y+12} v14`,'none',5);
const vihta=(x,y)=>P(`M${x} ${y} l-6 30`,'none',4).replace(`stroke="${O}"`,'stroke="#8A4B22"')+[[0,0],[-8,6],[8,6],[-4,14],[6,14],[0,-8]].map(([a,b])=>E(x+a,y+b-6,6,9,'#22C47A',2,a*4)).join('');
const bucket=(x,y)=>P(`M${x-16} ${y-22} h32 l-4 26 h-24z`,'#C9B27C',3)+P(`M${x-16} ${y-14} h32 M${x-16} ${y-4} h32`,'none',2)+P(`M${x+10} ${y-24} q12 -24 28 -18`,'none',4)+E(x+40,y-40,7,4,'#C9B27C',2.5);
const rocks=(x,y)=>[[0,0,9],[14,2,8],[-14,3,7],[6,-9,7],[-6,-8,6]].map(([a,b,r])=>C(x+a,y+b,r,'#9AA3BE',2.5)).join('');
const springs=(x,y,dir)=>P(`M${x} ${y} l${8*dir} -6 l${-6*dir} -6 l${8*dir} -6 l${-6*dir} -6 l${8*dir} -6`,'none',3)+R(x+dir*6-5,y-38,10,8,'#FFD23F',2,2.5);
const propeller=(x,y)=>beanie(x,y,40,'#22C47A')+P(`M${x} ${y-26} v-8`,'none',3)+E(x-14,y-36,14,4,'#FF4F9A',2.5)+E(x+14,y-36,14,4,'#FFD23F',2.5);
const band=(x,y,w,h)=>P(`M${x+w*.3} ${y-2} v${h+4}`,'none',6).replace(`stroke="${O}"`,'stroke="#C0154F"');
const awning=(x,y,w)=>{let s='';const n=6,g=w/n;for(let i=0;i<n;i++)s+=P(`M${x+i*g} ${y} h${g} v12 q${-g/2} 8 ${-g} 0z`,i%2?'#fff':'#FF4F9A',2.5);return s;};
const table=(x,y)=>E(x,y,18,5,'#fff',3)+P(`M${x} ${y+4} v20 M${x-10} ${y+24} h20`,'none',3)+R(x-2,y-14,4,10,'#fff',1,2)+P(`M${x} ${y-14} q-3 -4 0 -8 q3 4 0 8z`,'#FFD23F',1.5)+P(`M${x-34} ${y+24} v-26 h10 v10 M${x+34} ${y+24} v-26 h-10 v10`,'none',3);
const swirl=(x,y)=>`<g fill="none" stroke-linecap="round">${[56,42,28,14].map((r,i)=>`<path d="M${x+r} ${y} A${r} ${r*.45} 0 1 1 ${x-r*.6} ${y-r*.3}" stroke="${['#7B61FF','#FF4F9A','#FFD23F','#fff'][i]}" stroke-width="${5-i*.5}" opacity=".9"/>`).join('')}<ellipse cx="${x}" cy="${y}" rx="10" ry="5" fill="#0B0F1C"/></g>`;
const box=(x,y,w,h,f,r=10)=>R(x,y,w,h,f,r);
const tower=(x,y,w,h,f)=>R(x,y,w,h,f,10);
const raft=(y)=>{let s='';for(let i=0;i<6;i++)s+=R(28+i*24,y,24,12,'#C9B27C',3,3);return s+P(`M14 ${y+18} q14 -8 28 0 q14 8 28 0 q14 -8 28 0 q14 8 28 0 q14 -8 28 0 q14 8 28 0`,'none',4).replace(`stroke="${O}"`,'stroke="#2F8CFF"');};
const sail=(x,y)=>P(`M${x} ${y} v-62`)+P(`M${x+3} ${y-58} q30 20 2 48z`,'#fff',3);
const hook=(x,y)=>P(`M${x} ${y} h14`,'none',6)+P(`M${x+14} ${y} q14 2 10 16 q-4 8 -12 2`,'none',4).replace(`stroke="${O}"`,'stroke="#C9D1E6"');
const glasses=(x,y)=>C(x,y,9,'rgba(255,255,255,.4)',3);
const mug=(x,y)=>R(x,y,20,22,'#fff',4,3)+P(`M${x+20} ${y+6} q10 0 10 6 q0 6 -10 6`,'none',3)+P(`M${x+5} ${y-4} q-3 -6 0 -10 M${x+13} ${y-4} q-3 -6 0 -10`,'none',2).replace(`stroke="${O}"`,'stroke="#9AA3BE"');
const skates=(xs,y)=>xs.map(x=>R(x-14,y,30,10,'#FF4F9A',4,3)+C(x-6,y+14,5,'#FFD23F',2.5)+C(x+8,y+14,5,'#FFD23F',2.5)).join('');
const tray=(y)=>R(18,y,164,12,'#C9D1E6',4,3);
const juice=(x,y)=>R(x,y,18,28,'#FFD23F',2,3)+P(`M${x+12} ${y} l6 -14`,'none',3)+T(x+9,y+18,'OJ',8);
const apple=(x,y)=>C(x,y,10,'#FF4D5E',3)+P(`M${x} ${y-10} q2 -6 6 -6`,'none',3)+E(x+6,y-12,4,2,'#22C47A',1.5,-20);
const sandwich=(x,y)=>P(`M${x} ${y} h50 l-10 -24 q-15 -10 -30 0z`,'#F4CFA0',4)+P(`M${x+4} ${y-12} q10 -6 20 0 q10 6 22 0`,'none',5).replace(`stroke="${O}"`,'stroke="#22C47A"')+P(`M${x+8} ${y-4} h36`,'none',5).replace(`stroke="${O}"`,'stroke="#FF4D5E"');
const handle=(x,y,w)=>P(`M${x} ${y} q0 -22 ${w/2} -22 q${w/2} 0 ${w/2} 22`,'none',7);
const stickers=(pts)=>pts.map(([x,y,f,k])=>k?R(x-8,y-6,16,12,f,3,2):C(x,y,7,f,2)).join('');
const wood=(x,y,w,h)=>{let s='';for(let i=1;i<4;i++)s+=P(`M${x+6} ${y+i*h/4} q${w/2} -4 ${w-12} 0`,'none',1.5);return s;};
// magic and extreme sports (Brocadabra, Extremely Networks)
const tophat=(x,y,w=56,h=34,band='#FF4F9A')=>R(x-w/2,y-h,w,h,O,4,3)+R(x-w/2-12,y-4,w+24,9,O,4,3)+`<rect x="${x-w/2+2}" y="${y-14}" width="${w-4}" height="7" fill="${band}"/>`;
const rabbit=(x,y,f='#fff')=>E(x-7,y-22,5,14,f,3,-8)+E(x+7,y-22,5,14,f,3,8)+E(x-7,y-21,1.8,8,'#FF8FBE',0,-8)+E(x+7,y-21,1.8,8,'#FF8FBE',0,8)+C(x,y,13,f,3)+`<circle cx="${x-5}" cy="${y-2}" r="2" fill="${O}"/><circle cx="${x+5}" cy="${y-2}" r="2" fill="${O}"/>`+E(x,y+4,2.5,2,'#FF4F9A',0);
const wand=(x,y,dx=34,dy=-24)=>P(`M${x} ${y} l${dx} ${dy}`,'none',6)+P(`M${x+dx*.8} ${y+dy*.8} l${dx*.2} ${dy*.2}`,'none',6).replace(`stroke="${O}"`,'stroke="#fff"');
const sparkle=(x,y,s=7,f='#FFD23F')=>P(`M${x} ${y-s} q${s*.25} ${s*.75} ${s} ${s} q${-s*.75} ${s*.25} ${-s} ${s} q${-s*.25} ${-s*.75} ${-s} ${-s} q${s*.75} ${-s*.25} ${s} ${-s}z`,f,2);
const cape=(x,y,w,h,f='#C0154F')=>P(`M${x} ${y} q${-18} ${h*.6} ${-8} ${h} h${w+16} q10 ${-h*.4} ${-8} ${-h}z`,f,3);
const helmet=(x,y,w,f='#FF8A3D')=>P(`M${x-w/2} ${y} q0 ${-w*.44} ${w/2} ${-w*.44} q${w/2} 0 ${w/2} ${w*.44}z`,f,3)+P(`M${x-w*.18} ${y-w*.4} v${w*.34} M${x+w*.18} ${y-w*.4} v${w*.34}`,'none',2.5)+R(x-w/2-4,y-4,w+8,9,f,4,3);
const goggles=(x,y,d=16)=>R(x-d-12,y-8,24,16,'#7FD8EE',8,3)+R(x+d-12,y-8,24,16,'#7FD8EE',8,3)+P(`M${x-d+12} ${y} H${x+d-12}`,'none',3)+glint(x-d,y-1)+glint(x+d,y-1);
const can=(x,y)=>R(x,y,18,32,'#7B61FF',4,3)+R(x+2,y-4,14,6,'#C9D1E6',2,2)+bolt(x+12,y+5,.45,'#FFD23F');
const bungee=(x,y1,y2)=>P(`M${x} ${y1} q10 ${(y2-y1)*.25} 0 ${(y2-y1)*.5} q-10 ${(y2-y1)*.25} 0 ${(y2-y1)*.5}`,'none',5).replace(`stroke="${O}"`,'stroke="#22C47A"');
  return [
   /* rusty: Vintage set */ ()=>sh()+bob(P('M84 58 L62 18 M116 58 L138 18')+C(62,18,5,'#C9D1E6',3)+C(138,18,5,'#C9D1E6',3)+box(32,56,136,78,'#E8D9B0',14)+wood(32,56,136,78)+R(46,68,72,46,'#5D6788',8,3)+face(82,86,'dots',null,12)+mustache(82,104)+knob(140,78)+knob(140,106)+cobweb(146,56)),
   /* edgelord: All spikes */ ()=>sh(72)+bob(P('M26 128 L40 52 L58 36 L70 50 L86 30 L100 48 L114 28 L130 48 L144 34 L160 52 L174 128Z','#2E3550')+face(100,80,'angry',null,22)+ports(54,100,92,6,'#FF4D5E')+legs([46,146],128)),
   /* chonk: Round and content */ ()=>sh(76)+bob(feet([68,128],132,'#FF8FBE')+E(100,82,78,56,'#FF8FBE')+P('M30 92 Q100 116 170 92 L168 108 Q100 128 32 108Z','#1E2640',3)+leds(56,106,['#FFD23F','#FFD23F','#FFD23F','#FFD23F','#FFD23F','#FFD23F','#FFD23F'],3)+face(100,62,'happy','smile',18,14)+cheeks(100,76,34)+C(164,40,3,'#C9B27C',2)+C(172,50,2,'#C9B27C',2)),
   /* unit16: Flexing */ ()=>sh(78)+bob(arm(46,88,-1)+arm(154,88,1)+box(46,46,108,88,'#FF8FBE',12)+face(100,72,'dots','grin',18,16)+ports(58,108,84,6)+cloud(150,26,.8,'#E8EDF7')+rain(146,26)),
   /* mikro: Lunchbox */ ()=>sh(74)+bob(handle(64,72,44)+box(40,70,92,64,'#22C47A')+ports(50,104,72,6)+leds(58,86,['#FFD23F'])+T(96,92,'CCR',11)+sandwich(136,128)),
   /* wb32: Roller skates */ ()=>sh(66)+speed(36,74)+bob(box(46,56,108,64,'#F4F6FB')+face(100,80,'wink','grin',16,14)+ports(58,98,84,7)+skates([70,130],120)),
   /* ar7280: Flat white */ ()=>sh()+bob(box(40,54,108,80,'#2F8CFF')+beanie(94,56,84,'#22C47A')+eyepatch(78,84)+glasses(112,84)+`<circle cx="112" cy="84" r="3" fill="${O}"/>`+MO.smirk(94,104)+ports(50,116,88,7)+mug(150,96)),
   /* ar7800: The captain */ ()=>sh(70)+bob(box(46,46,108,90,'#2F8CFF',8)+capHat(100,48,96)+face(100,66,'dots','smirk',16,10)+[86,100,114].map(y=>R(56,y,88,10,'#1E2640',3,2)+[0,1,2,3,4].map(i=>C(68+i*16,y+5,3,'#FFD23F',0)).join('')).join('')),
   /* disco8k: Disco ball */ ()=>sh()+beams(100,38)+bob(disco(100,38)+box(34,60,132,74,'#7B61FF')+leds(54,80,['#FF4F9A','#FFD23F','#22C47A','#7FD8EE','#FF8A3D'],5)+ports(46,98,108,8,'#fff')+tag(178,104,'€/mo','∞')),
   /* knockia7750: Minus forty */ ()=>sh()+bob(box(38,58,124,76,'#9AA3BE',6)+snowcap(38,58,124)+icicles(44,134,112)+face(96,86,'dots','smile',14,12)+thermo(144,108,'#2F8CFF')+ports(48,108,80,6))+R(140,30,42,18,'#fff',5,2.5)+T(161,43,'−40°',11,'#2F8CFF'),
   /* wb64: Race car */ ()=>sh(84)+bob(box(26,62,148,62,'#F4F6FB',14)+racing(26,70,148)+roundel(60,104,'64')+face(124,100,'shades',null,14)+ports(88,108,30,2)+smoke(178,96)),
   /* disco8ku: Double disco */ ()=>sh()+beams(70,36)+bob(disco(70,36,13)+disco(130,36,13)+box(30,56,140,78,'#7B61FF')+coinslot(88,72)+ports(42,102,116,9,'#fff')+tag(180,108,'€/mo','∞∞')),
   /* unit32: Litter of pigs */ ()=>sh(84)+bob(box(24,36,152,100,'#FF8FBE',14)+face(100,64,'happy','smile',22,14)+R(38,90,124,30,'#1E2640',6,3)+piglet(58,105)+piglet(100,105)+piglet(142,105)),
   /* ar7800r5: Ship of the line */ ()=>sh(84)+bob(mast(100,72,62)+P('M20 72 H180 L164 132 H36Z','#2F8CFF')+[0,1,2,3,4,5,6,7].map(i=>C(44+i*16,92,5,'#1E2640',2)+`<circle cx="${44+i*16}" cy="92" r="2" fill="#FFD23F"/>`).join('')+ports(48,108,104,8)),
   /* knockia7950: Sauna door */ ()=>sh()+steam(70,46)+bob(box(40,50,120,86,'#E6C48E',8)+pine(40,50,120,86)+thermo(68,98)+R(132,78,8,26,'#8A4B22',3,2.5)+face(100,74,'sleepy',null,12))+ports(52,116,96,7),
   /* mikro32: Propeller hat */ ()=>sh(66)+bob(propeller(100,64)+box(50,66,100,66,'#22C47A')+face(100,88,'happy','grin',16,14)+sweat(154,78)+ports(60,112,80,6,'#FF4F9A')),
   /* universe: 42 and a towel */ ()=>bob(tower(62,12,76,132,'#1E2640')+stars([[76,28,1.8],[122,40,1.5],[90,112,1.6],[126,96,2],[72,88,1.3],[110,128,1.4]])+screen(74,44,52,30,'42',20)+P('M74 84 H126 M74 92 H126 M74 100 H126','none',2).replace(`stroke="${O}"`,'stroke="#7FD8EE"')+towel(138,30))+`<ellipse cx="100" cy="78" rx="96" ry="22" fill="none" stroke="#FF4F9A" stroke-width="3" stroke-dasharray="1 9" stroke-linecap="round" transform="rotate(-12 100 78)"/>`+planet(22,100,11,'#FF8A3D',1)+planet(178,52,7,'#22C47A')
,
   /* brocadabra: Rabbit out of the hat */ ()=>sh()+bob(box(38,76,124,60,'#2F8CFF')+face(100,98,'happy','smile',16,12)+ports(48,116,104,7)+rabbit(100,46)+tophat(100,76,58,28)+wand(150,104))+sparkle(170,60)+sparkle(30,52,5)+sparkle(176,32,4),
   /* extremely: Energy drink */ ()=>sh()+bob(box(40,56,120,78,'#FF8A3D')+helmet(100,58,104,'#7B61FF')+goggles(100,80,18)+MO.teeth(100,104,12)+ports(50,118,100,7)+can(160,86))+bolt(28,40,.8)+sweat(42,64)
  ];})();
const RG_ART_C=[];
// The picture for model g, as inline SVG ('' for a model without one).
function rgArt(g){const f=RG_ART[g];if(!f)return '';return RG_ART_C[g]||(RG_ART_C[g]=`<svg class="rgart" viewBox="0 0 200 160" aria-hidden="true">${f()}</svg>`);}
