/* Puzzle map: the puzzle's cities stand out (goals with a pulsing ring and a badge for what they send or ask for,
   stepping stones with a dashed one, cities to avoid crossed out); every other city is on the map as usual, open to
   build in but not emphasised. */
function pzBadge(c){const P=S.pz;if(S.ar)return c===S.ar.hq?'🏠':S.ar.gold.includes(c)?'🚨':'';return P.src.includes(c)?'🗄️':P.dem.some(f=>f.t==='eye'&&f.a===c)?'👀':P.dem.some(f=>f.t==='l2'&&(f.a===c||f.b===c))?'🔗':'';}
function pzDrawCity(v,sc,now){const k=pzKind(v.C.id);
  if(!k||k==='off'){drawCity(v.C,v.sx,v.sy,sc,now,v.ly===null?undefined:v.ly,v.dem);return;}
  const r=(CM.far?16:34)*sc,y=v.sy-(CM.far?0:6*sc),p=S.pops[v.C.id];
  ctx.save();ctx.lineWidth=3;
  if(k==='avoid'){ctx.strokeStyle='#FF4D5E';ctx.beginPath();ctx.arc(v.sx,y,r,0,7);ctx.moveTo(v.sx-r*.7,y-r*.7);ctx.lineTo(v.sx+r*.7,y+r*.7);ctx.stroke();}
  else{const a=animOn()?.55+.35*Math.sin(now/300):.8,gold=S.ar&&S.ar.gold.includes(v.C.id),dk=S.ar&&arDarkNow(v.C.id);ctx.strokeStyle=dk?`rgba(255,77,94,${a})`:gold?`rgba(224,160,0,${p?1:a})`:k==='goal'?`rgba(255,79,154,${p?1:a})`:'rgba(30,38,64,.7)';if(gold||dk)ctx.lineWidth=5;if(k==='via')ctx.setLineDash([5,5]);
    ctx.fillStyle=k==='goal'&&!p?'rgba(255,210,63,.35)':'rgba(255,255,255,.25)';ctx.beginPath();ctx.arc(v.sx,y,r,0,7);ctx.fill();ctx.stroke();ctx.setLineDash([]);}
  ctx.restore();drawCity(v.C,v.sx,v.sy,sc,now,v.ly===null?undefined:v.ly,v.dem);
  const b=k==='goal'&&!CM.far?pzBadge(v.C.id):'';if(b){ctx.font=`${Math.round(15*sc)}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(b,v.sx-r*.75,y-r*.75);}} // top left: the IX badge has the top right
// In a puzzle every line says what it is ("2×100G · 70%"), and a selected POP lights up every pair it has links on.
function pzLinkLab(grp,up,load,cap){if(S.ar)return groupLabel(grp,up)+(cap?` · ${Math.round(load/cap*100)}%`:'');return groupLabel(grp,up)+(cap?` · ${Math.round(load/cap*100)}%`:'');}
const pzLinkHot=grp=>!!(UI.sel&&UI.sel.type==='city'&&grp.some(x=>x.a===UI.sel.id||x.b===UI.sel.id));
// The goal being worked on, marked where it is: a red ring round each city it is about, and on a cut that would hurt,
// a pulsing ✂ on the link (pzGoals sets UI.pzMark; the monkey's own show has the map while it runs).
function pzDrawMarks(ks,now){const m=UI.pzMark;if(!m||UI.pzMk)return;const a=animOn()?.6+.4*Math.sin(now/260):1,sc=CM.far?.6:1;
  ctx.save();ctx.lineWidth=3;ctx.strokeStyle=`rgba(255,77,94,${a})`;ctx.setLineDash([7,6]);ctx.lineDashOffset=animOn()?-now/45:0;
  for(const c of m.cities||[]){const C=CITY[c];if(!C)continue;for(const k of ks){const [x,y]=toS(C.x,C.y,k);ctx.beginPath();ctx.arc(x,y-6*sc,46*sc,0,7);ctx.stroke();}}
  ctx.setLineDash([]);const l=m.link&&S.links.find(q=>q.id===m.link);
  if(l){const pts=linkGeom(l).pts,q=pts[Math.floor(pts.length/2)];
    for(const k of ks){const [x,y]=toS(q[0],q[1],k);if(x<-30||x>CW+30||y<-30||y>CH+30)continue;const r=15+2*a;
      ctx.fillStyle='#FF4D5E';ctx.strokeStyle='#1E2640';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fill();ctx.stroke();
      ctx.fillStyle='#fff';ctx.font='900 17px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('✂',x,y+1);}}
  ctx.restore();}
