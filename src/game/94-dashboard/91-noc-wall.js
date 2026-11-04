/* ---------- The NOC window's wallboard ----------
   The first thing the window shows: a dark board to glance at from across the room. Everything is drawn from the copy of S
   and R (90-noc-window.js) with the game's own helpers, and the upgrade buttons are the dashboard's (connUp), so prices
   and rules cannot drift. Each section is patched with morph(): a flow on the map keeps running and a button stays put.
   Only the window runs any of this. */
const NOCW={view:'wall',city:'',built:false,sum:{bad:0,warn:0}};
const NW_HOT=0.9,NW_WARM=0.65,NW_FLOWS=40,NW_PORTS=8;
const NW_COL={ok:'#2DD4A7',warn:'#FFB547',bad:'#FF5C6C',idle:'#5A6B94'};
const nwCol=u=>u>=NW_HOT?NW_COL.bad:u>=NW_WARM?NW_COL.warn:NW_COL.ok;
const nwG=v=>v>=1000?(+(v/1000).toFixed(1))+'T':(v>=10||v===0?Math.round(v):+v.toFixed(1))+'G';
// ---------- the land: built once, it never changes ----------
const nwMapBox=()=>{let y0=Infinity,y1=-Infinity;for(const p of COAST){const b=polyBox(p);if(ringArea(p)>=600){y0=Math.min(y0,b[1]);y1=Math.max(y1,b[3]);}}return [0,Math.floor(y0),W,Math.ceil(y1-y0)];};
function nwLand(){let d='';for(const p of COAST){if(ringArea(p)<600&&!CITIES.some(c=>inPoly(c.x,c.y,p)))continue;d+='M'+p.map(q=>Math.round(q[0])+' '+Math.round(q[1])).join('L')+'Z';}return d;}
// ---------- charts ----------
function nwChart(rows,stack,lines,fmtY,CW=900,CH=260,L=62,id=''){if(rows.length<2)return `<p class="nw-empty">${tr('link_panels.collecting_data_check_back_in_a')}</p>`;
  const B=22,T=8,Rr=8;let ymax=1;for(const r of rows){let s=0;for(const k of stack)s+=r[k]||0;ymax=Math.max(ymax,s);for(const ln of lines)ymax=Math.max(ymax,r[ln.k]||0);}ymax*=1.1;
  const x=i=>+(L+(CW-L-Rr)*i/(rows.length-1)).toFixed(1),y=v=>+(T+(CH-T-B)*(1-v/ymax)).toFixed(1);let g='';
  for(let j=0;j<=4;j++){const v=ymax*j/4,yy=y(v);g+=`<line class="nw-grid" x1="${L}" x2="${CW-Rr}" y1="${yy}" y2="${yy}"/><text class="nw-ax" x="${L-6}" y="${yy+3}" text-anchor="end">${esc(fmtY(v))}</text>`;}
  const base=rows.map(()=>0);
  for(const k of stack){const top=rows.map((r,i)=>base[i]+(r[k]||0));let d=`M${x(0)},${y(top[0])}`,e=d;for(let i=1;i<rows.length;i++){d+=`L${x(i)},${y(top[i])}`;e+=`L${x(i)},${y(top[i])}`;}for(let i=rows.length-1;i>=0;i--)d+=`L${x(i)},${y(base[i])}`;
    g+=`<path d="${d}Z" fill="${EGC[k][1]}" fill-opacity=".55"/><path d="${e}" fill="none" stroke="${EGC[k][1]}" stroke-width="1.5"/>`;top.forEach((v,i)=>base[i]=v);}
  for(const ln of lines){let d='';rows.forEach((r,i)=>{d+=(i?'L':'M')+x(i)+','+y(r[ln.k]||0);});g+=`<path d="${d}" fill="none" stroke="${ln.col}" stroke-width="2" ${ln.dash?'stroke-dasharray="5 4"':''} stroke-linejoin="round"/><circle cx="${x(rows.length-1)}" cy="${y(rows[rows.length-1][ln.k]||0)}" r="3.5" fill="${ln.col}"/>`;}
  g+=`<text class="nw-ax" x="${L}" y="${CH-6}">${esc(dateStr(rows[0].d))}</text><text class="nw-ax" x="${CW-Rr}" y="${CH-6}" text-anchor="end">${esc(dateStr(rows[rows.length-1].d))}</text>`;
  return `<svg class="nw-chart" viewBox="0 0 ${CW} ${CH}" role="img"${id?` data-ch="${id}" data-box="${CW},${CH},${L},${T},${B},${Rr}"`:''}>${g}</svg>`;}
function nwSpark(vals,col){if(vals.length<2)return '';let a=Infinity,b=-Infinity;for(const v of vals){if(v<a)a=v;if(v>b)b=v;}const sp=b-a||1;
  const pts=vals.map((v,i)=>(100*i/(vals.length-1)).toFixed(1)+','+(26-22*(v-a)/sp).toFixed(1)).join(' ');
  return `<svg class="nw-spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;}
// ---------- what is wrong ----------
function nwAlarms(){const A=[];
  for(const a of ddosAll()){const t=tr('noc.under_attack',{who:ddosWho(a),g:fmtG(a.gbps)});A.push({k:'bad',t:esc(t.charAt(0).toUpperCase()+t.slice(1)),m:''});}
  for(const i of S.inc)if(i.type!=='ddos'&&i.until>S.day)A.push({k:'bad',t:incTitle(i.type),m:esc(i.msg||''),s:shipSea(i)?'🚢 '+esc(shipStatus(i)):esc(trn('hud_and_panels.auto_fix_in_n_day',i.until-S.day))});
  const hot=hotPorts().filter(h=>h.k==='t'||h.k==='p'||h.k==='ix').length,sad=custStats().unhappy;
  if(hot)A.push({k:'warn',t:esc(trn('noc.n_ports_over_90_full',hot)),m:''});
  if(sad)A.push({k:'warn',t:esc(trn('noc.n_unhappy_customers',sad)),m:''});
  return A;}
// ---------- sections ----------
function nwTiles(){const H=(S.hist||[]).slice(-60),last30=(S.hist||[]).slice(-30),net=R.revMo-R.costMo;
  const up=last30.length?last30.reduce((a,r)=>a+(r.dem?Math.min(1,r.srv/r.dem):1),0)/last30.length:1;
  const tile=(l,v,sub,sp,cls='')=>`<div class="nw-tile ${cls}"><div class="nw-l">${l}</div><div class="nw-v num">${v}</div><div class="nw-s">${sub||'&nbsp;'}</div>${sp||''}</div>`;
  return tile(tr('common.traffic_now'),esc(fmtG(R.served)),esc(tr('dashboard.of_g_wanted',{g:fmtG(R.demand)})),nwSpark(H.map(r=>r.srv),NW_COL.ok))
    +tile(tr('dashboard.delivered_30_days'),(up*100).toFixed(1)+'%','',nwSpark(H.map(r=>r.dem?Math.min(1,r.srv/r.dem):1),NW_COL.ok),up<0.99?'warn':'')
    +tile(tr('common.peering_ratio'),pct(R.peerShare||0),'',nwSpark(H.map(r=>r.srv?(r.c+r.p+r.ix)/r.srv:0),'#7B8CFF'))
    +tile(tr('noc.net_per_month'),esc(fmt$(net)),'',nwSpark(H.map(r=>r.rev-r.cost),net<0?NW_COL.bad:NW_COL.ok),net<0?'bad':'')
    +tile(tr('common.peak'),esc(fmtG(S.stats.peak)),esc(tr('common.reach'))+' '+reachPct(R.reach||0))
    +tile(tr('common.bgp_sessions'),String(R.sessions||0),esc(tr('noc.n_pops_n_links',{pops:Object.keys(S.pops).length,links:S.links.length})));}
// Parallel links between two cities are one line on so small a map: their load over their capacity, down only when all are.
function nwMap(){const by=new Map();
  for(const l of S.links){const k=edgeKey(l);let e=by.get(k);if(!e)by.set(k,e={k,a:l.a,b:l.b,load:0,cap:0,up:0});if(!linkDown(l)&&!l.standby){e.up++;e.load+=(R.load&&R.load[l.id])||0;e.cap+=capOf(l)||0;}}
  const E=[...by.values()],fl=new Set(E.filter(e=>e.load>0&&e.up).sort((a,b)=>b.load-a.load).slice(0,NW_FLOWS).map(e=>e.k));let g='';
  for(const e of E){const A=CITY[e.a],B=CITY[e.b],dx=wrapDx(A.x,B.x),bx=A.x+dx,u=e.cap>0?e.load/e.cap:0,len=Math.hypot(dx,B.y-A.y);
    const arc=o=>`M${Math.round(A.x+o)} ${Math.round(A.y)}Q${Math.round(A.x+o+dx/2)} ${Math.round((A.y+B.y)/2-len*0.09)} ${Math.round(bx+o)} ${Math.round(B.y)}`;
    const d=arc(0)+(bx<0?arc(W):bx>W?arc(-W):''),col=e.up?nwCol(u):NW_COL.bad,wd=e.up?(1.5+Math.min(4,Math.log10(1+e.cap)*0.9)).toFixed(1):'2.5';
    g+=`<path class="nw-link${e.up?'':' down'}" d="${d}" stroke="${col}" stroke-width="${wd}"/>`;
    if(fl.has(e.k))g+=`<path class="nw-flow" d="${d}" stroke-width="${wd}"/>`;}
  const inc=new Set();for(const i of S.inc)if(i.until>S.day&&isCity(i.ref))inc.add(i.ref);for(const a of ddosAll())inc.add(a.city);
  let dots='',labs='';
  for(const c of Object.keys(S.pops)){const C=CITY[c],up=popUp(c),u=(R.nodeLoad[c]||0)/(R.nodeCap[c]||1),on=NOCW.city===c,alarm=!up||inc.has(c),col=!up?NW_COL.bad:nwCol(u);
    dots+=`<g class="nw-pop${alarm?' alarm':''}${on?' on':''}" data-nc="pop:${c}"><title>${esc(CITY[c].name)} · ${pct(u)}</title><circle class="nw-hit" cx="${Math.round(C.x)}" cy="${Math.round(C.y)}" r="24"/>${alarm?`<circle class="nw-ring" cx="${Math.round(C.x)}" cy="${Math.round(C.y)}" r="14" stroke="${NW_COL.bad}"/>`:''}${on?`<circle class="nw-sel" cx="${Math.round(C.x)}" cy="${Math.round(C.y)}" r="17"/>`:''}<circle class="nw-dot" cx="${Math.round(C.x)}" cy="${Math.round(C.y)}" r="${on?10:8}" fill="${col}"/></g>`;
    if(on||alarm||u>=NW_HOT)labs+=`<text class="nw-lab" x="${Math.round(C.x+14)}" y="${Math.round(C.y+9)}">${esc(CITY[c].name)}</text>`;}
  const v=NOCW.box.join(' ');return `<svg class="nw-over" viewBox="${v}" role="img" aria-label="${esc(tr('noc.your_network'))}">${g}${dots}${labs}</svg>`;}
// An exchange port's row only knows about the exchange: its POP going dark takes it down as well. A remote port has no POP here.
const nwDown=r=>r.down||(!!S.pops[r.city]&&!popUp(r.city));
function nwPorts(){const all=conns().filter(r=>r.k==='t'||r.k==='p'||r.k==='ix'),city=NOCW.city&&all.some(r=>r.city===NOCW.city)||S.pops[NOCW.city]?NOCW.city:'';NOCW.city=city;
  const cities=[...new Set(all.map(r=>r.city))].sort((a,b)=>CITY[a].name.localeCompare(CITY[b].name));
  const sel=`<label class="nw-pick"><span class="sr-only">${tr('common.your_pop')}</span><select data-nc-city="1"><option value="">${esc(tr('noc.all_pops'))}</option>${cities.map(c=>`<option value="${c}"${c===city?' selected':''}>${esc(CITY[c].name)}</option>`).join('')}</select></label>`;
  const rows=all.filter(r=>city?r.city===city:!nwDown(r)).map(r=>({r,u:r.cap>0?r.use/r.cap:0})).sort((a,b)=>(nwDown(b.r)?1:0)-(nwDown(a.r)?1:0)||b.u-a.u).slice(0,city?60:NW_PORTS);
  const row=({r,u})=>`<div class="nw-port"><span class="nw-k" style="background:${CONN_COL[r.k]}">${esc(tr(CONN_K[r.k]))}</span><div class="nw-pm"><div class="nw-pt"><b>${esc(CITY[r.city].name)}</b> ${esc(r.name)}</div><div class="nw-bar"><i style="width:${Math.min(100,u*100).toFixed(1)}%;background:${nwDown(r)?NW_COL.bad:nwCol(u)}"></i></div><div class="nw-s num">${esc(fmtG(r.use))} / ${esc(r.port)}</div></div><b class="nw-pc num" style="color:${nwDown(r)?NW_COL.bad:nwCol(u)}">${nwDown(r)?esc(tr('noc.legend_down')):pct(u)}</b><div class="nw-btns">${connUp(r)}${btn(tr('common.open'),'goConn',{city:r.city,k:r.k},'ghost sm')}</div></div>`;
  return `<div class="nw-h"><h3>${esc(tr('noc.hottest_ports'))}</h3>${sel}</div>${rows.length?rows.map(row).join(''):`<p class="nw-empty">${esc(tr('noc.no_ports_here'))}</p>`}`;}
function nwAlarmsHtml(A){return `<div class="nw-h"><h3>${esc(tr('noc.alarms'))}</h3></div>`+(A.length?A.map(a=>`<div class="nw-al ${a.k}"><b>${a.t}</b>${a.m?`<div class="nw-s">${a.m}</div>`:''}${a.s?`<div class="nw-s">${a.s}</div>`:''}</div>`).join(''):`<p class="nw-quiet">${esc(tr('noc.nothing_on_fire'))}</p>`);}
const nwBars=(title,rows)=>`<div class="nw-h"><h3>${esc(title)}</h3></div>`+rows.map(([n,m,u])=>`<div class="nw-row"><div class="nw-pm"><div class="nw-pt"><b>${esc(n)}</b> <span class="nw-s">${esc(m)}</span></div><div class="nw-bar"><i style="width:${Math.min(100,u*100).toFixed(1)}%;background:${nwCol(u)}"></i></div></div><b class="nw-pc num" style="color:${nwCol(u)}">${pct(u)}</b></div>`).join('');
function nwBuild(){const w=$('nocWall');NOCW.box=nwMapBox();
  w.innerHTML=`<div class="nw-tiles" id="nwTiles"></div>
  <div class="nw-col"><section class="nw-panel nw-map"><div class="nw-h"><h3>${esc(tr('noc.your_network'))}</h3><div class="nw-legend"><span><i style="background:${NW_COL.ok}"></i>${esc(tr('noc.legend_ok'))}</span><span><i style="background:${NW_COL.warn}"></i>${esc(tr('noc.legend_warm'))}</span><span><i style="background:${NW_COL.bad}"></i>${esc(tr('noc.legend_hot'))}</span></div></div>
    <div class="nw-world" style="aspect-ratio:${NOCW.box[2]}/${NOCW.box[3]}"><svg class="nw-land" viewBox="${NOCW.box.join(' ')}" aria-hidden="true"><path d="${nwLand()}"/></svg><div id="nwOver"></div></div></section>
  <section class="nw-panel" id="nwTraffic"></section></div>
  <div class="nw-col"><section class="nw-panel nw-alarms" id="nwAlarms"></section>
  <section class="nw-panel" id="nwPorts"></section></div>
  <div class="nw-low"><section class="nw-panel" id="nwRouters"></section><section class="nw-panel" id="nwLinks"></section><section class="nw-panel" id="nwMoney"></section></div>`;NOCW.built=true;}
function nocWall(){if(!NOCW.built)nwBuild();const rows=(S.hist||[]).slice(-90),A=nwAlarms();
  NOCW.sum={bad:A.filter(a=>a.k==='bad').length,warn:A.filter(a=>a.k==='warn').length};
  const put=(id,h)=>{const e=$(id);if(e._h!==h){e._h=h;morph(e,h);}};
  put('nwTiles',nwTiles());put('nwOver',nwMap());put('nwAlarms',nwAlarmsHtml(A));
  put('nwTraffic',`<div class="nw-h"><h3>${esc(tr('dashboard.traffic_by_way_out'))}</h3><div class="nw-legend">${Object.keys(EGC).filter(k=>(R.egT[k]||0)>0.01||rows.some(r=>(r[k]||0)>0)).map(k=>`<span><i style="background:${EGC[k][1]}"></i>${esc(EGC[k][0])} <b class="num">${esc(fmtG(R.egT[k]||0))}</b></span>`).join('')}<span><i class="dash"></i>${esc(tr('common.demand'))}</span></div></div>${nwChart(rows,['c','p','ix','t','l2'],[{k:'dem',col:'#E8EEFA',dash:true}],nwG,900,260,62,'traffic')}`);
  put('nwPorts',nwPorts());
  put('nwRouters',nwBars(tr('common.router_load'),Object.keys(S.pops).map(c=>[CITY[c].name,`${S.pops[c].routers||1} × ${RG[S.pops[c].rgen||0].n}`,(R.nodeLoad[c]||0)/(R.nodeCap[c]||1)]).sort((a,b)=>b[2]-a[2]).slice(0,6)));
  put('nwLinks',nwBars(tr('common.busiest_links'),S.links.filter(l=>capOf(l)>0).map(l=>[`${CITY[l.a].name} ⇄ ${CITY[l.b].name}`,capName(l),(R.load[l.id]||0)/capOf(l)]).sort((a,b)=>b[2]-a[2]).slice(0,6)));
  put('nwMoney',`<div class="nw-h"><h3>${esc(tr('dashboard.money_per_month'))}</h3><div class="nw-legend"><span><i style="background:${NW_COL.ok}"></i>${esc(tr('common.revenue'))}</span><span><i style="background:${NW_COL.bad}"></i>${esc(tr('common.costs'))}</span></div></div>${nwChart(rows,[],[{k:'rev',col:NW_COL.ok},{k:'cost',col:NW_COL.bad}],fmt$,520,220,74,'money')}`);}
// The window's own controls never reach the game: they change what this screen shows.
function nocUiClick(e){const b=e.target.closest&&e.target.closest('[data-nc]');if(!b)return;const v=b.getAttribute('data-nc');
  if(v==='wall'||v==='details')nocView(v);
  else if(v==='fs'){try{if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen();}catch(err){}}
  else if(v.startsWith('pop:')){const c=v.slice(4);NOCW.city=NOCW.city===c?'':c;nocRender();}}
function nocView(v){NOCW.view=v;$('dash').hidden=v==='wall';$('nocWall').hidden=v!=='wall';UI._dh=null;nocRender();try{scrollTo(0,0);}catch(e){}}
