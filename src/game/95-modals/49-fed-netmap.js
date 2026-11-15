/* ---------- MULTIPLAYER: another player's network on a small map, in its card, with its traffic live ----------
   Read-only. Where it is comes from its newest announce (§5.1): POPs, the exchanges it is at and those it runs (ports,
   members), the wave routes it sells; POPs in cities where you have one too are your pink, the others teal. What it does now comes from its live
   state (fedLiveOf, 89-fedplay-live.js), asked every FNM_EVERY ms while the card is open and the page visible.
   The map pans (drag), zooms (wheel, pinch, ± buttons) and picks a POP on a tap; one rAF loop at most 30 frames a
   second while the canvas is on the page, painting only when something changed (or POPs pulse with live traffic).
   Nothing is saved; nothing runs once the card is closed. */
// POPs in cities where you have one too (your pink, as on the world map), and the others.
const FNM_MINE='#FF4F9A',FNM_THEIRS='#14A88C',FNM_EVERY=15000,FNM_HIST=120,FNM_FPS=30;
const FNM={key:null,sel:null,peers:false,view:null,fit:null,live:null,asked:false,hist:new Map(),t:null,cv:null,raf:0,last:0,dirty:true,land:null,ptr:new Map(),pinch:null,drag:null,pts:[]};
// What the map shows, from a FU.nets entry, or null. Cities this game version does not know are left out.
function fnmOf(key){const n=FU.nets.get(key);if(!n)return null;const b=n.rec.body,r=b.rates||{},ok=c=>!!CITY[c];
  const pops=b.pops.filter(ok);if(!pops.length)return null;
  const mem=new Map();for(const x of r.ix&&Array.isArray(r.ix.members)?r.ix.members:[])if(x&&ok(x.at))mem.set(x.at,x);
  return {pops,ix:new Set(b.ix.filter(ok)),run:new Set((r.ix&&Array.isArray(r.ix.at)?r.ix.at:[]).filter(ok)),
    ixr:r.ix||null,mem,wave:r.wave||null,
    waves:(r.wave&&Array.isArray(r.wave.routes)?r.wave.routes:[]).filter(w=>ok(w.a)&&ok(w.b)).map(w=>[w.a,w.b]),
    tr:b.traffic||{in:0,out:0},heard:n.heard,col:FEDP_COL[hstr(key)%FEDP_COL.length]};}
const fnmMbps=v=>v<1000?Math.round(v)+' Mbps':fmtG(v/1000);
// A card for another network: a new key starts from its whole footprint, nothing picked, nothing live yet.
function fnmFor(key){if(FNM.key===key)return;FNM.key=key;FNM.sel=null;FNM.view=null;FNM.fit=null;FNM.live=null;FNM.asked=false;FNM.dirty=true;
  if(FNM.t&&FNM.t!==true)FED.clear(FNM.t);FNM.t=null;}
function fnmHtml(key){const m=fnmOf(key);if(!m)return '';fnmFor(key);const both=S?m.pops.filter(c=>S.pops[c]).length:0;
  const lg=[`<span class="fnm-k"><b>${trn('fedplay.n_pops',m.pops.length)}</b></span>`];
  if(both)lg.push(`<span class="fnm-k"><i class="fnm-pop" style="background:${FNM_MINE}"></i>${trn('netmap.n_cities_where_you_are_too',both)}</span>`);
  if(m.pops.length>both)lg.push(`<span class="fnm-k"><i class="fnm-pop" style="background:${FNM_THEIRS}"></i>${trn('netmap.n_cities_where_you_are_not',m.pops.length-both)}</span>`);
  if(m.ix.size)lg.push(`<span class="fnm-k"><i class="fnm-ix">IX</i>${trn('netmap.at_n_exchanges',m.ix.size)}</span>`);
  if(m.run.size)lg.push(`<span class="fnm-k"><i class="fnm-ix">★</i>${trn('netmap.runs_n_exchanges',m.run.size)}</span>`);
  if(m.waves.length)lg.push(`<span class="fnm-k"><i class="fnm-wave" style="border-color:${m.col}"></i>${trn('netmap.n_wave_routes',m.waves.length)}</span>`);
  const z=(d,l,t)=>`<button class="b sm ghost" data-act="fnmZoom" data-args='{"d":${d}}' aria-label="${esc(l)}" title="${esc(l)}">${t}</button>`;
  return `<figure class="fnm"><div class="fnm-map"><canvas id="fnmCv" role="img" aria-label="${esc(tr('netmap.map_of_this_network'))}"></canvas>`+
    `<div class="fnm-zoom">${z(1,tr('pie_globe.zoom_in'),'+')}${z(-1,tr('pie_globe.zoom_out'),'−')}${z(0,tr('netmap.show_the_whole_network'),'⤢')}</div></div>`+
    `<figcaption class="fnm-lg">${lg.join('')}</figcaption></figure>${fnmSelHtml(m)}${fnmLiveHtml(m,key)}`;}
// The POP picked on the map: what its announce says is there, and whether you are there too.
function fnmSelHtml(m){const c=FNM.sel;if(!c||!m.pops.includes(c))return `<p class="meta fnm-tip">${tr('netmap.tap_a_pop_to_see_what_is_there')}</p>`;
  const C=CITY[c],li=[];
  if(m.run.has(c)&&m.ixr){const ports=Array.isArray(m.ixr.ports)?m.ixr.ports:[],lo=ports.reduce((a,p)=>Math.min(a,p.monthly),Infinity),x=m.mem.get(c);
    li.push(`★ ${tr('netmap.runs_the_exchange_here')}${isFinite(lo)?' · '+tr('netmap.ports_from_price_mo',{price:fmt$(lo)}):''}`);
    if(x){const nm=(x.nets||[]).map(id=>NET[id]?NET[id].name:null).filter(Boolean);
      const n=trn('netmap.n_members',nm.length+(x.players||0));li.push(nm.length?tr('netmap.members_list',{members:n,list:esc(nm.slice(0,6).join(', '))+(nm.length>6?'…':'')}):n);}}
  else if(m.ix.has(c))li.push(`IX · ${tr('netmap.at_the_exchange_here')}${ixName(c)?' ('+esc(ixName(c))+')':''}`);
  const ws=m.waves.filter(([a,b])=>a===c||b===c).map(([a,b])=>CITY[a===c?b:a].name);
  if(ws.length){const sz=m.wave&&Array.isArray(m.wave.sizes)?m.wave.sizes:[],lo=sz.reduce((a,s)=>Math.min(a,s.monthly),Infinity);
    li.push(tr('netmap.waves_to_list',{list:esc(ws.join(', '))})+(isFinite(lo)?' · '+tr('netmap.from_price_mo',{price:fmt$(lo)}):''));}
  const mine=S&&S.pops[c];li.push(mine?(hasIxAt(c)&&m.ix.has(c)?tr('netmap.you_are_here_too_and_at_its_exchange'):tr('netmap.you_have_a_pop_here_too')):tr('netmap.you_have_no_pop_here'));
  return `<div class="fnm-sel"><b>${esc(C.name)}</b> <span class="meta">${esc(pieLicCountry(C.cc))}</span><ul>${li.map(x=>`<li>${x}</li>`).join('')}</ul></div>`;}
// Live: traffic now with a line of what it did while the card was open, and the players it exchanges traffic with.
function fnmLiveHtml(m,key){const L=FNM.live,h=`<h3 class="sub4">📡 ${tr('netmap.live')}</h3>`;
  if(!L||!L.state){const why=!FNM.asked?tr('netmap.asking_for_live_traffic'):tr('netmap.not_live_last_announced',{traffic:fnmMbps(Math.max(m.tr.in||0,m.tr.out||0)),when:fuWhen(m.heard)});
    return `<section class="fnm-live">${h}<p class="meta">${why}</p></section>`;}
  const b=L.state.body,tot=b.total||0,hs=FNM.hist.get(key)||[],me=S&&S.fed&&S.fed.key?S.fed.key.pub:null,drop=new Set(S&&S.fed?S.fed.muted||[]:[]);
  let o=`<section class="fnm-live">${h}<div class="fnm-now"><b class="num">${fnmMbps(tot)}</b><span class="meta">${tr('netmap.traffic_now')} · ${tr('netmap.updated_n_s_ago',{n:Math.max(0,fedNow()-L.state.t)})}</span></div>`;
  if(hs.length>1){const mx=Math.max(1,...hs.map(x=>x.v)),pts=hs.map((x,i)=>`${(i/(hs.length-1)*100).toFixed(1)},${(28-x.v/mx*26).toFixed(1)}`).join(' ');
    o+=`<svg class="fnm-spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${m.col}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;}
  // Traffic with other players: the total on one line, each player behind a button (FNM.peers).
  const all=(b.traffic||[]).filter(x=>!drop.has(x.key)),pr=all.slice().sort((a,c)=>(c.in+c.out)-(a.in+a.out)).slice(0,8);
  if(all.length){const mx=Math.max(1,...pr.map(x=>x.in+x.out)),si=all.reduce((a,x)=>a+x.in,0),so=all.reduce((a,x)=>a+x.out,0),op=!!FNM.peers;
    o+=`<div class="fnm-with"><span class="meta">${tr('netmap.traffic_with_other_players',{traffic:`<span class="num">↓${fnmMbps(si)} ↑${fnmMbps(so)}</span>`})} · ${trn('netmap.n_players',all.length)}</span>`+
      `<button class="b sm ghost" data-act="fnmPeers" aria-expanded="${op}">${op?tr('netmap.fold'):tr('netmap.details')} ${op?'▴':'▾'}</button></div>`;
    if(op)o+=`<ul class="fnm-peers">${pr.map(x=>{const a=L.anns.get(x.key),known=FU.nets.has(x.key),you=x.key===me;
      const nm=you?`<b>${tr('fedui.you')}</b>`:known?fuName(x.key):a?esc(fedSafeName(a.name)):esc(fuShort(x.key));
      const who=!you&&known?`<button class="lnk" data-act="fuOpen" data-args="${esc(JSON.stringify({v:'net',key:x.key,back:UI.fu&&UI.fu.back||'glass'}))}">${nm}</button>`:nm;
      return `<li${you?' class="you"':''}><span class="fnm-pn">${who}</span><span class="num meta">↓${fnmMbps(x.in)} ↑${fnmMbps(x.out)}</span><i class="fnm-bar" style="width:${Math.max(2,Math.round((x.in+x.out)/mx*100))}%;background:${m.col}"></i></li>`;}).join('')}</ul>`;}
  return o+'</section>';}
// Asks for the live state now, then every FNM_EVERY while this card shows (and the page is visible).
function fnmLiveTick(){if(FNM.t||!fnmOpen())return;const key=FNM.key;
  // FNM.t is true while an ask runs, so a render in between (fnmDraw) starts no second loop.
  const go=async()=>{if(FNM.key!==key)return;FNM.t=true;if(!fnmOpen()){FNM.t=null;return;}
    if(FED.visible()){let L=null;try{L=await fedLiveOf(key);}catch(e){console.error('[tubes] live',e);}
      if(FNM.key!==key)return;FNM.asked=true;FNM.live=L;
      if(L&&L.state){const h=FNM.hist.get(key)||[];if(!h.length||h[h.length-1].t!==L.state.t)h.push({t:L.state.t,v:L.state.body.total||0});if(h.length>FNM_HIST)h.splice(0,h.length-FNM_HIST);
        FNM.hist.delete(key);FNM.hist.set(key,h);if(FNM.hist.size>24)FNM.hist.delete(FNM.hist.keys().next().value);}
      FNM.dirty=true;if(fnmOpen())fuRender();}
    FNM.t=fnmOpen()?FED.set(go,FNM_EVERY):null;};
  FNM.t=FED.set(go,0);}
const fnmOpen=()=>!!(UI.fu&&UI.fu.v==='net'&&UI.fu.key===FNM.key&&fuShown()&&$('fnmCv'));

/* ---------- the map ---------- */
// The view that shows every POP (the world wraps: x is taken near the first), with room around a lone one.
function fnmFit(m,w,h){const A=CITY[m.pops[0]];let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
  for(const c of m.pops){const x=A.x+wrapDx(A.x,CITY[c].x),y=CITY[c].y;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
  return {cx:(x0+x1)/2,cy:(y0+y1)/2,z:Math.min((w-56)/Math.max(160,x1-x0),(h-56)/Math.max(100,y1-y0),3)};}
const fnmZmin=()=>FNM.fit?Math.max(0.05,FNM.fit.z*0.4):0.1,fnmZmax=()=>FNM.fit?Math.max(8,FNM.fit.z*10):8;
// Zooms by factor f about (sx, sy) on the canvas (its middle by default).
function fnmZoomAt(f,sx,sy){const v=FNM.view,cv=FNM.cv;if(!v||!cv)return;const w=cv.clientWidth,h=cv.clientHeight;if(sx==null){sx=w/2;sy=h/2;}
  const z=clamp(v.z*f,fnmZmin(),fnmZmax()),wx=v.cx+(sx-w/2)/v.z,wy=v.cy+(sy-h/2)/v.z;
  v.cx=wx-(sx-w/2)/z;v.cy=clamp(wy-(sy-h/2)/z,0,H);v.z=z;fnmKick();}
// Called after each render of the card (fuRender): wires the canvas once, starts the loop and the live asks.
function fnmDraw(){const cv=$('fnmCv');if(!cv||!UI.fu||UI.fu.v!=='net')return;if(!fnmOf(UI.fu.key))return;fnmFor(UI.fu.key);
  if(FNM.cv!==cv){FNM.cv=cv;FNM.land=null;FNM.ptr=new Map();FNM.pinch=null;FNM.drag=null;
    cv.addEventListener('pointerdown',fnmDown);cv.addEventListener('pointermove',fnmMove);for(const e of ['pointerup','pointercancel','lostpointercapture'])cv.addEventListener(e,fnmUp);
    cv.addEventListener('wheel',e=>{e.preventDefault();const r=cv.getBoundingClientRect();fnmZoomAt(Math.exp(-e.deltaY*0.0015),e.clientX-r.left,e.clientY-r.top);},{passive:false});}
  fnmPaint(performance.now());if(fnmPulse())fnmKick();fnmLiveTick();}
// The loop runs only while something moves (a pan, a zoom, POPs pulsing with live traffic); fnmKick() wakes it.
// Not in tests: an endless animation would keep the test run from ending.
const fnmPulse=()=>!!(!window.__TUBES_TEST__&&animOn()&&FNM.live&&FNM.live.state&&(FNM.live.state.body.total||0)>0&&fuShown());
function fnmKick(){FNM.dirty=true;if(!FNM.raf&&FNM.cv)FNM.raf=requestAnimationFrame(fnmLoop);}
function fnmLoop(now){FNM.raf=0;const cv=FNM.cv;if(!cv||!cv.isConnected){FNM.cv=null;FNM.land=null;return;}
  const pulse=fnmPulse();if(!FNM.dirty&&!pulse)return;
  if(now-FNM.last>=1000/FNM_FPS&&!document.hidden){FNM.last=now;fnmPaint(now);}
  FNM.raf=requestAnimationFrame(fnmLoop);}
function fnmPaint(now){const cv=FNM.cv,m=cv&&UI.fu&&fnmOf(UI.fu.key);if(!m)return;FNM.dirty=false;
  const w=cv.clientWidth||320,h=cv.clientHeight||200,dpr=Math.min(2,window.devicePixelRatio||1),pw=Math.round(w*dpr),ph=Math.round(h*dpr);
  if(cv.width!==pw)cv.width=pw;if(cv.height!==ph)cv.height=ph;
  // A software canvas where the screen's garbles big paths (Firefox on Android, #43), as for the world layer.
  const g=cv.getContext('2d',SOFT_CANVAS?{willReadFrequently:true}:undefined);if(!g)return;
  if(!FNM.fit||FNM.fit.w!==w||FNM.fit.h!==h){FNM.fit={...fnmFit(m,w,h),w,h};if(!FNM.view)FNM.view={cx:FNM.fit.cx,cy:FNM.fit.cy,z:FNM.fit.z};}
  const v=FNM.view,z=v.z,near=x=>x+W*Math.round((v.cx-x)/W),P=(x,y)=>[(near(x)-v.cx)*z+w/2,(y-v.cy)*z+h/2];
  // Land into its own layer, painted again only when the view, size or theme changes.
  const lk=[pw,ph,v.cx.toFixed(2),v.cy.toFixed(2),z.toFixed(4),MAPC.k].join('|');
  if(!FNM.land||FNM.land.k!==lk){const L=FNM.land&&FNM.land.cv||document.createElement('canvas');L.width=pw;L.height=ph;
    const lg=L.getContext('2d',SOFT_CANVAS?{willReadFrequently:true}:undefined);
    if(lg){lg.setTransform(dpr,0,0,dpr,0,0);lg.fillStyle=MAPC.sea0;lg.fillRect(0,0,w,h);const base=W*Math.round(v.cx/W);
      for(const o of [base-W,base,base+W]){if((o+W-v.cx)*z+w/2<0||(o-v.cx)*z+w/2>w)continue;
        lg.setTransform(dpr*z,0,0,dpr*z,dpr*((o-v.cx)*z+w/2),dpr*((-v.cy)*z+h/2));
        lg.fillStyle=MAPC.grass;for(const p of LANDP_FAR)lg.fill(p);lg.strokeStyle='rgba(30,38,64,.45)';lg.lineWidth=1.2/z;for(const p of LANDP_FAR)lg.stroke(p);}}
    FNM.land={k:lk,cv:L};}
  g.setTransform(1,0,0,1,0,0);g.drawImage(FNM.land.cv,0,0);g.setTransform(dpr,0,0,dpr,0,0);g.lineCap='round';
  for(const [a,b] of m.waves){const ax=near(CITY[a].x),bx=ax+wrapDx(ax,CITY[b].x),[x0,y0]=[(ax-v.cx)*z+w/2,(CITY[a].y-v.cy)*z+h/2],[x1,y1]=[(bx-v.cx)*z+w/2,(CITY[b].y-v.cy)*z+h/2];
    g.strokeStyle='#1E2640';g.lineWidth=4;g.setLineDash([]);g.beginPath();g.moveTo(x0,y0);g.lineTo(x1,y1);g.stroke();
    g.strokeStyle=m.col;g.lineWidth=2.5;g.setLineDash([5,4]);g.stroke();g.setLineDash([]);}
  const L=FNM.live&&FNM.live.state,tot=L?L.body.total||0:0,ph0=(now/1000*(0.5+Math.min(2,Math.log10(1+tot/1000))/2))%1;
  FNM.pts=m.pops.map(c=>{const [x,y]=P(CITY[c].x,CITY[c].y);return {c,x,y,P:CITY[c].P||0};}).sort((a,b)=>(b.c===FNM.sel)-(a.c===FNM.sel)||b.P-a.P);
  const boxes=[],R=z>4?8:6;
  for(const q of FNM.pts.slice().reverse()){if(q.x<-20||q.x>w+20||q.y<-20||q.y>h+20)continue;
    if(tot>0&&animOn()){g.strokeStyle=m.col;g.globalAlpha=0.6*(1-ph0);g.lineWidth=2;g.beginPath();g.arc(q.x,q.y,R+2+ph0*12,0,7);g.stroke();g.globalAlpha=1;}
    if(q.c===FNM.sel){g.strokeStyle='#1E2640';g.lineWidth=2;g.setLineDash([3,3]);g.beginPath();g.arc(q.x,q.y,R+8,0,7);g.stroke();g.setLineDash([]);}
    g.fillStyle=S&&S.pops[q.c]?FNM_MINE:FNM_THEIRS;g.strokeStyle='#1E2640';g.lineWidth=2;g.beginPath();g.arc(q.x,q.y,R,0,7);g.fill();g.stroke();
    const t=m.run.has(q.c)?'★':m.ix.has(q.c)?'IX':'';
    if(t){g.fillStyle='#fff';g.font=`900 ${(t==='IX'?7:9)*R/6}px Nunito, sans-serif`;g.textAlign='center';g.textBaseline='middle';g.fillText(t,q.x,q.y+0.5);}
    boxes.push({x:q.x-R-5,y:q.y-R-5,w:2*R+10,h:2*R+10});}
  // Names where they fit: the POP picked first, then the biggest cities.
  g.font='800 11px "Baloo 2", sans-serif';g.textAlign='center';g.textBaseline='middle';g.lineJoin='round';
  for(const q of FNM.pts){const t=CITY[q.c].name,tw=g.measureText(t).width+6,d=R+13;
    for(const y of [q.y+d,q.y-d]){const r={x:q.x-tw/2,y:y-7,w:tw,h:14};
      if(r.x<0||r.x+r.w>w||r.y<0||r.y+r.h>h||boxes.some(b=>r.x<b.x+b.w&&b.x<r.x+r.w&&r.y<b.y+b.h&&b.y<r.y+r.h))continue;
      boxes.push(r);g.lineWidth=3;g.strokeStyle='#fff';g.strokeText(t,q.x,y);g.fillStyle='#1E2640';g.fillText(t,q.x,y);break;}}}
// The POP nearest a tap (within 18 px), or null.
function fnmHit(x,y){let best=null,bd=18;for(const q of FNM.pts){const d=Math.hypot(q.x-x,q.y-y);if(d<bd){bd=d;best=q.c;}}return best;}
function fnmPick(c){FNM.sel=c||null;FNM.dirty=true;fuRender();}
function fnmXY(e){const r=FNM.cv.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];}
function fnmDown(e){if(!FNM.cv)return;try{FNM.cv.setPointerCapture(e.pointerId);}catch(_){}const [x,y]=fnmXY(e);FNM.ptr.set(e.pointerId,{x,y});
  if(FNM.ptr.size===2){const [a,b]=[...FNM.ptr.values()];FNM.pinch={d:Math.hypot(a.x-b.x,a.y-b.y)||1};FNM.drag=null;}
  else if(FNM.ptr.size===1)FNM.drag={x,y,x0:x,y0:y,moved:false};}
function fnmMove(e){const p=FNM.ptr.get(e.pointerId);if(!p||!FNM.view)return;const [x,y]=fnmXY(e);p.x=x;p.y=y;
  if(FNM.pinch&&FNM.ptr.size>=2){const [a,b]=[...FNM.ptr.values()],d=Math.hypot(a.x-b.x,a.y-b.y)||1;fnmZoomAt(d/FNM.pinch.d,(a.x+b.x)/2,(a.y+b.y)/2);FNM.pinch.d=d;return;}
  const g=FNM.drag;if(!g)return;if(!g.moved&&Math.hypot(x-g.x0,y-g.y0)>5)g.moved=true;
  if(g.moved){FNM.view.cx-=(x-g.x)/FNM.view.z;FNM.view.cy=clamp(FNM.view.cy-(y-g.y)/FNM.view.z,0,H);fnmKick();}g.x=x;g.y=y;}
function fnmUp(e){if(!FNM.ptr.has(e.pointerId))return;FNM.ptr.delete(e.pointerId);const g=FNM.drag;
  if(FNM.ptr.size<2)FNM.pinch=null;if(!FNM.ptr.size){FNM.drag=null;if(g&&!g.moved&&e.type==='pointerup'){const [x,y]=fnmXY(e);fnmPick(fnmHit(x,y));}}}
