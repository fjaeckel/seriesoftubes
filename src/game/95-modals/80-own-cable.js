/* Your own subsea cable (#22). Tier 1 networks lay their own: very expensive, slow to build, and it pays for
   itself after a few years if it replaces enough leased waves. Both ends need a cable landing station. You own
   up to eight fiber pairs; the first comes lit with a ROADMaster, the repeaters are powered from shore. */
const SEA_DELAYS=[N_('own_cable.a_whale_has_parked_on_the'),N_('own_cable.the_cable_ship_s_coffee_machine'),N_('own_cable.a_fishing_fleet_is_trawling_exactly'),N_('own_cable.the_seabed_survey_found_an_old'),N_('own_cable.storm_season_the_ship_is_sheltering'),N_('own_cable.the_crew_fished_out_somebody_else')];
const OWNCAB_LAND=3000000,OWNCAB_KM=6000,OWNCAB_OM=25;
const OWNCAB_NAMES=['Big Wet Tube','Davy Jones’ Backhaul','Kraken-1','Mariana Trench Coat','The Wet Ethernet','Sea-ya Later','Deep Pockets Express','Salty Sausage','Poseidon’s Patch Cable','Neptune Neutrality','Moby Disk','Fibre Nemo','The Long Wet Thing','Bermuda Triangle Routing','Seabed & Breakfast','Atlantis Backhaul'];
const OWNCAB_SHIPS=['MV Cable Guy','Spool of Thought','Wet Willy','Reel Deal','Splice Girl','Knot Today','Seas the Day','HMS Unplugged'];
const landing=c=>!!CITY[c].beach||CABLE_PAIRS.some(p=>p.a===c||p.b===c);
const nearLanding=c=>CITIES.filter(x=>x.id!==c&&landing(x.id)).sort((x,y)=>kmBetween(c,x.id)-kmBetween(c,y.id))[0].id;
const ownCabKm=(a,b)=>seaRoutes(a,b)[0]?.km||Infinity;
const ownCabCost=km=>Math.round((2*OWNCAB_LAND+km*OWNCAB_KM+DF_SYS.roadm.cost)*hwMul('build'));
const ownCabMo=km=>Math.round(km*OWNCAB_OM)+ampCount(km)*AMP_MO;
const ownCabDays=km=>leadDays(Math.round(300+km*0.05));
// Marine routing uses the same coastline as the map, in geographic coordinates.
// A quarter-degree grid keeps narrow passages open; edges are checked against
// coastline segments as well as water cells, so diagonal steps cannot cut land.
// Nothing is built until an order is quoted; topology and finished routes are reused.
const SEA_NAV={step:0.25,nx:1440,ny:641,rows:new Map(),edges:null,tiles:new Map(),fine:new Set(),routes:new Map(),ports:new Map(),pass:null,closed:new Set()};
// Real Europe–Asia cables land at Port Said and cross Egypt beside the canal to Suez; PAN AM crosses Panama by land.
// Each is an overland edge between two sea cells, priced as the distance it covers.
const SEA_PASS=[{id:'suez',a:[32.30,31.30],b:[32.58,29.85]},{id:'panama',a:[-79.90,9.40],b:[-79.50,8.85]}];
function seaSnap(p){const cx=Math.round((seaLon(p[0])+180)/SEA_NAV.step)%SEA_NAV.nx,cy=Math.round((p[1]+80)/SEA_NAV.step);let best=null;
  for(let r=0;r<=16&&!best;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;const x=(cx+dx+SEA_NAV.nx)%SEA_NAV.nx,y=cy+dy;if(!seaWater(x,y)||!seaNode(x,y))continue;const id=y*SEA_NAV.nx+x;if(!seaOpen(id))continue;const d=hav(...p,...seaPoint(id));if(!best||d<best.d)best={id,d};}
  return best&&best.id;}
function seaPasses(){if(!SEA_NAV.pass){SEA_NAV.pass=new Map();for(const P of SEA_PASS){const a=seaSnap(P.a),b=seaSnap(P.b);if(a==null||b==null||a===b)continue;const km=hav(...seaPoint(a),...seaPoint(b));
  for(const [u,v] of [[a,b],[b,a]]){let L=SEA_NAV.pass.get(u);if(!L)SEA_NAV.pass.set(u,L=[]);L.push({to:v,km,id:P.id});}}}return SEA_NAV.pass;}
// Which passages are shut: the Red Sea Crisis closes Suez. The main page sets this; the survey worker is told.
function seaSync(){if(typeof S==='undefined')return;SEA_NAV.closed=new Set(S&&S.scn&&S.scn.id==='redsea'?['suez']:[]);}
const seaKey=(a,b)=>(a<b?a+'|'+b:b+'|'+a)+(SEA_NAV.closed.size?'|x'+[...SEA_NAV.closed].sort().join(','):'');
const seaLon=x=>((x+180)%360+360)%360-180;
function seaInit(){if(SEA_NAV.edges)return;
  SEA_NAV.edges=Array.from({length:181},()=>[]);
  for(const poly of COAST_LL)for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[j],b=poly[i],e=[a[0],a[1],b[0],b[1]];
    for(let y=Math.floor(Math.min(a[1],b[1]))-1;y<=Math.floor(Math.max(a[1],b[1]))+1;y++)for(let x=Math.floor(Math.min(a[0],b[0]))-1;x<=Math.floor(Math.max(a[0],b[0]))+1;x++)SEA_NAV.fine.add(seaLon(x)+','+y);
    for(let y=Math.max(0,Math.floor(Math.min(a[1],b[1]))+90);y<=Math.min(180,Math.floor(Math.max(a[1],b[1]))+90);y++)SEA_NAV.edges[y].push(e);
    for(let y=Math.floor(Math.min(a[1],b[1])/2);y<=Math.floor(Math.max(a[1],b[1])/2);y++)for(let x=Math.floor(Math.min(a[0],b[0])/2);x<=Math.floor(Math.max(a[0],b[0])/2);x++){
      const k=(((x+90)%180+180)%180)+','+y;let t=SEA_NAV.tiles.get(k);if(!t)SEA_NAV.tiles.set(k,t=[]);t.push(e);
    }
  }
}
function seaLand(lon,lat){seaInit();lon=seaLon(lon);
  const ray=x=>{let inside=false;for(const e of SEA_NAV.edges[clamp(Math.floor(lat)+90,0,180)])if((e[1]>lat)!==(e[3]>lat)&&x<(e[2]-e[0])*(lat-e[1])/(e[3]-e[1])+e[0])inside=!inside;return inside;};
  return ray(lon)||(lon<-170&&ray(lon+360));
}
function seaWater(x,y){if(y<0||y>=SEA_NAV.ny)return false;x=(x+SEA_NAV.nx)%SEA_NAV.nx;
  let row=SEA_NAV.rows.get(y);if(!row){row=new Uint8Array(SEA_NAV.nx);const lat=-80+y*SEA_NAV.step;for(let i=0;i<row.length;i++)row[i]=seaLand(-180+i*SEA_NAV.step,lat)?0:1;SEA_NAV.rows.set(y,row);}return !!row[x];
}
function seaCross(a,b,e){let x=e[0]+360*Math.round((a[0]-e[0])/360),u=e[2]+x-e[0];
  const dx=b[0]-a[0],dy=b[1]-a[1],ex=u-x,ey=e[3]-e[1],den=dx*ey-dy*ex;
  if(Math.abs(den)<1e-12)return false;
  const t=((x-a[0])*ey-(e[1]-a[1])*ex)/den,v=((x-a[0])*dy-(e[1]-a[1])*dx)/den;
  return t>=0&&t<=1&&v>=0&&v<=1;
}
function seaClear(A,B,margin=0){const a=[A[0],A[1]],b=[a[0]+seaLon(B[0]-a[0]),B[1]],n=Math.max(1,Math.ceil(Math.max(Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1]))/0.25));
  const checked=new Set();
  for(let i=0;i<=n;i++){const t=i/n,x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t;
    if(seaLand(x,y))return false;
    if(margin&&[[margin,0],[-margin,0],[0,margin],[0,-margin]].some(([dx,dy])=>seaLand(x+dx,y+dy)))return false;
    const tx=Math.floor(x/2),ty=Math.floor(y/2);
    // Include adjacent tiles so segments touching a tile boundary are checked too.
    for(let v=ty-1;v<=ty+1;v++)for(let u=tx-1;u<=tx+1;u++){const k=(((u+90)%180+180)%180)+','+v;if(checked.has(k))continue;checked.add(k);
      for(const e of SEA_NAV.tiles.get(k)||[])if(seaCross(a,b,e))return false;}
  }return true;
}
const seaPoint=id=>[-180+(id%SEA_NAV.nx)*SEA_NAV.step,-80+Math.floor(id/SEA_NAV.nx)*SEA_NAV.step];
const seaNode=(x,y)=>x%4===0&&y%4===0||SEA_NAV.fine.has(Math.floor(-180+x*SEA_NAV.step)+','+Math.floor(-80+y*SEA_NAV.step));
// A coarse city marker must not snap into a tiny disconnected estuary or lake.
function seaOpen(id){if(!SEA_NAV.connected)SEA_NAV.connected=new Map();if(SEA_NAV.connected.has(id))return SEA_NAV.connected.get(id);
  const seen=new Set([id]),queue=[id];let open=false;
  for(let i=0;i<queue.length;i++){const v=queue[i];if(SEA_NAV.connected.has(v)){open=SEA_NAV.connected.get(v);if(open)break;}
    if(queue.length>256){open=true;break;}const x=v%SEA_NAV.nx,y=Math.floor(v/SEA_NAV.nx);
    for(const stride of (x%4===0&&y%4===0?[4,1]:[1]))for(let sy=-1;sy<=1;sy++)for(let sx=-1;sx<=1;sx++){if(!sx&&!sy)continue;const dx=sx*stride,dy=sy*stride,xx=(x+dx+SEA_NAV.nx)%SEA_NAV.nx,yy=y+dy,n=yy*SEA_NAV.nx+xx;
      if(seen.has(n)||!seaNode(xx,yy)||!seaWater(xx,yy)||!seaStep(v,dx,dy))continue;seen.add(n);queue.push(n);}
  }for(const v of seen)SEA_NAV.connected.set(v,open);return open;
}
function seaPorts(city){if(SEA_NAV.ports.has(city))return SEA_NAV.ports.get(city);
  const c=CITY[city],p=[c.lon,c.lat],cx=Math.round((seaLon(c.lon)+180)/SEA_NAV.step)%SEA_NAV.nx,cy=Math.round((c.lat+80)/SEA_NAV.step),wet=!seaLand(...p),bins=new Map();
  // Inland city markers may reach more than one sea (Cairo, for example).
  // Keep shore approaches in different directions; routing chooses the right sea.
  for(let r=0;r<=16;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
    if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;const x=(cx+dx+SEA_NAV.nx)%SEA_NAV.nx,y=cy+dy;if(!seaWater(x,y)||!seaNode(x,y))continue;
    const id=y*SEA_NAV.nx+x,q=seaPoint(id),d=hav(...p,...q),angle=Math.atan2(q[1]-p[1],seaLon(q[0]-p[0])*Math.cos(c.lat*Math.PI/180)),bin=Math.floor((angle+Math.PI)*8/Math.PI)%16+'|'+Math.floor(d/100);
    if(d>350||bins.has(bin)&&d>=bins.get(bin).d)continue;
    if(wet&&!seaClear(p,q))continue;
    if(!wet){const n=Math.max(2,Math.ceil(d/2));let water=false,ok=true;for(let i=0;i<=n;i++){const t=i/n,pt=[p[0]+seaLon(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t];if(!seaLand(...pt)){water=true;if(!seaClear(pt,q)){ok=false;break;}}else if(water){ok=false;break;}}if(!ok)continue;}
    if(seaOpen(id))bins.set(bin,{id,d,bin});
  }
  // Nearby approaches are the default. A low-latency survey may also land further off and backhaul overland, like real
  // transatlantic systems that land in the west of England and run to London on land.
  const sorted=[...bins.values()].sort((a,b)=>a.d-b.d),limit=sorted.length?(sorted[0].d<30?sorted[0].d+15:sorted[0].d*1.75):0,dir=new Set(),ports=sorted.map(p=>{const k=p.bin.split('|')[0]>>1;const first=!dir.has(k);dir.add(k);return {id:p.id,d:p.d,near:first&&p.d<=limit};});SEA_NAV.ports.set(city,ports);return ports;
}
const seaPort=city=>seaPorts(city)[0]?.id??null,seaNear=ps=>ps.filter(p=>p.near);
// The grid topology is shared by all designs. Test each edge only once.
function seaStep(id,dx,dy){if(!SEA_NAV.known){const n=SEA_NAV.nx*SEA_NAV.ny;SEA_NAV.known=new Uint8Array(n);SEA_NAV.open=new Uint8Array(n);SEA_NAV.knownWide=new Uint8Array(n);SEA_NAV.openWide=new Uint8Array(n);}
  const wide=Math.abs(dx)>1||Math.abs(dy)>1,sx=Math.sign(dx),sy=Math.sign(dy),bit=1<<((sy+1)*3+sx+1-(sy>0||sy===0&&sx>0?1:0)),known=wide?SEA_NAV.knownWide:SEA_NAV.known,open=wide?SEA_NAV.openWide:SEA_NAV.open;
  if(known[id]&bit)return !!(open[id]&bit);known[id]|=bit;
  const a=seaPoint(id),b=[a[0]+dx*SEA_NAV.step,a[1]+dy*SEA_NAV.step];
  for(let y=Math.floor(Math.min(a[1],b[1])/2);y<=Math.floor(Math.max(a[1],b[1])/2);y++)for(let x=Math.floor(Math.min(a[0],b[0])/2);x<=Math.floor(Math.max(a[0],b[0])/2);x++)
    for(const e of SEA_NAV.tiles.get((((x+90)%180+180)%180)+','+y)||[])if(seaCross(a,b,e))return false;
  open[id]|=bit;return true;
}
function seaSearch(starts,ends,target,clearance){const PASS=seaPasses();
  const dist=new Map(),prev=new Map(),done=new Set(),heap=[],goals=new Map(ends.map(p=>[p.id,p.d]));let goal=Infinity,goalEnd=null;
  const put=(id,g)=>{const v={id,g,f:g+(id===-1?0:hav(...seaPoint(id),...target))};let i=heap.length;heap.push(v);while(i){const p=(i-1)>>1;if(heap[p].f<=v.f)break;heap[i]=heap[p];i=p;}heap[i]=v;};
  const take=()=>{const out=heap[0],v=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let j=i*2+1;if(j+1<heap.length&&heap[j+1].f<heap[j].f)j++;if(heap[j].f>=v.f)break;heap[i]=heap[j];i=j;}heap[i]=v;}return out;};
  for(const p of starts){dist.set(p.id,p.d);put(p.id,p.d);}
  while(heap.length){const {id,g}=take();if(id===-1){const path=[];for(let v=goalEnd;v!==undefined;v=prev.get(v))path.push(seaPoint(v));return path.reverse();}if(done.has(id))continue;done.add(id);if(goals.has(id)&&g+goals.get(id)<goal){goal=g+goals.get(id);goalEnd=id;put(-1,goal);}
    const x=id%SEA_NAV.nx,y=Math.floor(id/SEA_NAV.nx),a=seaPoint(id);
    for(const P of PASS.get(id)||[]){if(SEA_NAV.closed.has(P.id)||done.has(P.to))continue;const ng=g+P.km;if(ng<(dist.get(P.to)??Infinity)){dist.set(P.to,ng);prev.set(P.to,id);put(P.to,ng);}}
    for(const stride of (x%4===0&&y%4===0?[4,1]:[1]))for(let sy=-1;sy<=1;sy++)for(let sx=-1;sx<=1;sx++){if(!sx&&!sy)continue;const dx=sx*stride,dy=sy*stride,xx=(x+dx+SEA_NAV.nx)%SEA_NAV.nx,yy=y+dy,v=yy*SEA_NAV.nx+xx;if(done.has(v)||!seaNode(xx,yy)||!seaWater(xx,yy))continue;
      const b=seaPoint(v);if(!seaStep(id,dx,dy))continue;
      const near=clearance&&(!seaWater(xx-2,yy)||!seaWater(xx+2,yy)||!seaWater(xx,yy-2)||!seaWater(xx,yy+2)),ng=g+hav(...a,...b)*(near?1+clearance:1);
      if(ng<(dist.get(v)??Infinity)){dist.set(v,ng);prev.set(v,id);put(v,ng);}
    }
  }return null;
}
function seaSimplify(path,margin){const out=[path[0]];for(let i=0;i<path.length-1;){let j=Math.min(path.length-1,i+64);while(j>i+1&&!seaClear(path[i],path[j],margin))j--;out.push(path[j]);i=j;}return out;}
function seaDensify(path){const out=[path[0].slice()];for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],dx=seaLon(b[0]-a[0]),n=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(b[1]-a[1]))));for(let j=1;j<=n;j++)out.push([seaLon(a[0]+dx*j/n),a[1]+(b[1]-a[1])*j/n]);}return out;}
// Points along the great circle from a to b, about every half degree.
function seaGC(a,b){const r=Math.PI/180,v=([lo,la])=>[Math.cos(la*r)*Math.cos(lo*r),Math.cos(la*r)*Math.sin(lo*r),Math.sin(la*r)],A=v(a),B=v(b),w=Math.acos(Math.min(1,A[0]*B[0]+A[1]*B[1]+A[2]*B[2]));
  const n=Math.max(1,Math.ceil(w/r/0.5)),out=[];if(w<1e-9)return [b.slice()];for(let i=1;i<=n;i++){const t=i/n,f=Math.sin((1-t)*w)/Math.sin(w),g=Math.sin(t*w)/Math.sin(w),x=f*A[0]+g*B[0],y=f*A[1]+g*B[1],z=f*A[2]+g*B[2];out.push([seaLon(Math.atan2(y,x)/r),Math.atan2(z,Math.hypot(x,y))/r]);}return out;}
// A straight line on the map is not the shortest way across an ocean. Long legs follow the great circle where it stays at sea.
function seaGreat(path,margin){const out=[path[0]];for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i];
  if(hav(...a,...b)>300){const gc=seaGC(a,b);let ok=true,q=a;for(const p of gc){if(!seaClear(q,p,margin)){ok=false;break;}q=p;}if(ok){out.push(...gc);continue;}}out.push(b);}return out;}
const seaLength=pts=>Math.round(pts.slice(1).reduce((s,p,i)=>s+hav(...pts[i],...p),0));
function seaRoutes(a,b){seaSync();const reverse=a>b,key=seaKey(a,b);let routes=SEA_NAV.routes.get(key);
  if(!routes){const A=reverse?b:a,B=reverse?a:b,PA=seaPorts(A),PB=seaPorts(B);routes=[];
    if(seaNear(PA).length&&seaNear(PB).length)for(const [penalty,margin,all] of [[1,0.5,false],[0.3,0.25,false],[0,0,true]]){
      const raw=seaSearch(all?PA:seaNear(PA),all?PB:seaNear(PB),[CITY[B].lon,CITY[B].lat],penalty);if(!raw)break;
      const pts=seaDensify(seaGreat([[CITY[A].lon,CITY[A].lat],...seaSimplify(raw,margin),[CITY[B].lon,CITY[B].lat]],margin)),r={pts,km:seaLength(pts),shore:[raw[0],raw[raw.length-1]]};
      // A survey can reuse the previous feasible route if its new candidate is longer.
      routes.push(routes.length&&r.km>routes[routes.length-1].km?routes[routes.length-1]:r);
    }SEA_NAV.routes.set(key,routes);
  }
  return reverse?routes.map(r=>({km:r.km,pts:r.pts.slice().reverse(),shore:r.shore.slice().reverse()})):routes;
}
// Surveys run off the UI thread in browsers. Tests and browsers without workers
// use the same deterministic router synchronously. Switching designs uses the cache.
const SEA_SURVEY={worker:null,pending:new Set(),failed:false};
function seaReady(a,b){seaSync();const key=seaKey(a,b);
  if(SEA_NAV.routes.has(key)||typeof Worker==='undefined'||SEA_SURVEY.failed)return true;
  if(SEA_SURVEY.pending.has(key))return false;
  try{
    if(!SEA_SURVEY.worker){
      const helpers=[seaSnap,seaPasses,seaGC,seaGreat,seaNear,seaKey,seaSync,seaLon,seaInit,seaLand,seaWater,seaCross,seaClear,seaPoint,seaNode,seaOpen,seaPorts,seaPort,seaStep,seaSearch,seaSimplify,seaDensify,seaLength,seaRoutes,hav,clamp];
      const code='const SEA_PASS='+JSON.stringify(SEA_PASS)+';const COAST_LL='+JSON.stringify(COAST_LL)+';const CITY='+JSON.stringify(Object.fromEntries(CITIES.map(c=>[c.id,{lon:c.lon,lat:c.lat}])))+';const SEA_NAV={step:0.25,nx:1440,ny:641,rows:new Map(),edges:null,tiles:new Map(),fine:new Set(),routes:new Map(),ports:new Map(),pass:null,closed:new Set()};'+
        helpers.map(f=>'const '+f.name+'='+f.toString()+';').join('')+'onmessage=({data:{a,b,key,closed}})=>{try{SEA_NAV.closed=new Set(closed||[]);postMessage({key,routes:seaRoutes(a,b)});}catch(e){postMessage({key,error:String(e)});}};';
      const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
      try{SEA_SURVEY.worker=new Worker(url);}finally{URL.revokeObjectURL(url);}
      const refresh=key=>{if(!S)return;const survey=$('modalCard').querySelector('[data-sea-survey]');if(UI.pending&&!$('modal').hidden&&survey&&(!key||survey.dataset.seaSurvey===key))openLinkModal(UI.pending.a,UI.pending.b);renderPanel();renderLeft();if(!$('dash').hidden)renderDash();};
      SEA_SURVEY.worker.onmessage=({data})=>{SEA_SURVEY.pending.delete(data.key);if(data.error){SEA_SURVEY.failed=true;SEA_SURVEY.worker.terminate();SEA_SURVEY.worker=null;SEA_SURVEY.pending.clear();}else SEA_NAV.routes.set(data.key,data.routes);refresh(data.error?undefined:data.key);};
      SEA_SURVEY.worker.onerror=()=>{SEA_SURVEY.failed=true;SEA_SURVEY.worker.terminate();SEA_SURVEY.worker=null;SEA_SURVEY.pending.clear();refresh();};
    }
    SEA_SURVEY.pending.add(key);const [from,to]=key.split('|');SEA_SURVEY.worker.postMessage({a:from,b:to,key,closed:[...SEA_NAV.closed]});return false;
  }catch(e){SEA_SURVEY.failed=true;if(SEA_SURVEY.worker)SEA_SURVEY.worker.terminate();SEA_SURVEY.worker=null;SEA_SURVEY.pending.clear();return true;}
}
const seaSurveyAttr=(a,b)=>{seaSync();const k=seaKey(a,b);return SEA_SURVEY.pending.has(k)?`data-sea-survey="${k}"`:'';};
function seaMapPoints(pts){const out=[];for(const p of pts){const q=proj(...p);if(out.length)q[0]+=W*Math.round((out[out.length-1][0]-q[0])/W);out.push(q);}return out;}

// Designs pay for progressively tighter surveys; all use a feasible marine path.
const SEA_DESIGNS={standard:{n:N_('common.standard'),cost:1,time:1},optimized:{n:N_('common.optimized'),cost:3,time:1.3},express:{n:N_('common.low_latency'),cost:7,time:1.7}};
function seaReference(a,b,express){
  const cs=cablesFor(a,b).filter(c=>express||(CAB[c.cid].lat||1)>=1);
  return cs.sort((x,y)=>x.km*(express?(CAB[x.cid].lat||1):1)-y.km*(express?(CAB[y.cid].lat||1):1))[0];
}
// Routing asks for link latency often; the cables on a route never change, so the express factor is worked out once.
const SEA_XF=new Map();
function seaLatencyFactor(l){if(l.seaDesign==='optimized')return 1;if(l.seaDesign!=='express')return 1.1;
  const k=CIDX[l.a]*4096+CIDX[l.b];let f=SEA_XF.get(k);if(f===undefined){const c=seaReference(l.a,l.b,true);SEA_XF.set(k,f=Math.min(0.9,c?(CAB[c.cid].lat||1):0.9));}return f;}
// The low-latency survey may also follow the corridor of the fastest cable already on this route, where that is shorter
// (only a cable that is in service: one cut by a crisis proves nothing):
// that cable proves the path, and it keeps the fastest design as fast as the fastest cable on the map.
function seaCorridor(a,b){const c=cablesOk(a,b).sort((x,y)=>x.km*(CAB[x.cid].lat||1)-y.km*(CAB[y.cid].lat||1))[0];if(!c)return null;const P=CAB[c.cid].pairs.find(([x,y])=>x===c.a&&y===c.b);if(!P)return null;
  let ll=[[CITY[c.a].lon,CITY[c.a].lat],...P[2],[CITY[c.b].lon,CITY[c.b].lat]].map(q=>[seaLon(q[0]),q[1]]);if(c.a!==a)ll=ll.reverse();
  const pts=[ll[0]];for(let i=1;i<ll.length;i++)pts.push(...seaGC(ll[i-1],ll[i]));return {km:seaLength(pts),pts,shore:[pts[1],pts[pts.length-2]]};}
function seaQuote(a,b,design='standard',upgrades={}){
  const D=SEA_DESIGNS[design],routes=seaRoutes(a,b),cor=design==='express'&&routes.length?seaCorridor(a,b):null;let route=routes[Object.keys(SEA_DESIGNS).indexOf(design)];if(cor&&route&&cor.km<route.km)route=cor;
  const base=routes[0]?.km||Infinity,km=route?.km||Infinity;
  // Higher survey and permitting costs dominate any savings from shorter glass.
  let cost=Math.round(ownCabCost(Math.max(base,km))*D.cost),days=Math.round(ownCabDays(Math.max(base,km))*D.time);
  for(const k of Object.keys(SUB_UPGRADES))if(upgrades[k]){cost+=subUpgradeCost({km},k);days+=leadDays(SUB_UPGRADES[k].days);}
  const ms=linkLat({a,b,kind:'df',own:true,sub:true,km,seaDesign:design});
  return {km,cost,days,ms,pts:route?.pts,shore:route?.shore,cor:!!cor&&route===cor};
}
// The picked upgrades that change something on a cable this long (#198): a pick can stop helping when the design
// or the other pick changes. When each makes the other redundant, keep the cheaper terminals.
const seaUps=km=>{const up={terminal:!!UI.seaterminal,engineering:!!UI.seaengineering};
  for(const k of ['engineering','terminal'])if(up[k]&&!subHelps(km,k,up[subOther(k)]))up[k]=false;return up;};
// Some pairs share a landmass and still have cables between them (Marseille–Singapore, Cairo–Palermo) (#67).
const seaCab=(a,b)=>isSub(a,b)||(landing(a)&&landing(b)&&cablesFor(a,b).length>0);
// What you get back for giving up your own subsea cable (#88): what you paid for it (design and upgrades included)
// if no optic can light it even with both upgrades,
// one still being laid returns most of the part not laid yet, a working one is yours for good.
const cabBack=l=>{if(!l||l.kind!=='df'||!l.own||!l.sub)return 0;const c=l.paid>0?l.paid:ownCabCost(l.km);if(!subNeed(l.km))return c;
  if(l.ready>S.day){const tot=Math.max(1,l.ready-(l.day||0));return Math.round(c*0.75*Math.min(1,(l.ready-S.day)/tot));}return 0;};
// Your own subsea cable is a Tier 1 privilege, or a sandbox toy (open gates).
const cabOpen=()=>!!S.won||gatesOpen();
function ownCabWhy(a,b){if(!seaCab(a,b))return tr('own_cable.this_route_is_on_land_build');
  if(!cabOpen())return tr('own_cable.laying_your_own_subsea_cable_is');
  for(const c of [a,b])if(!landing(c))return tr('own_cable.city_has_no_cable_landing_station',{city:CITY[c].name});
  if(cnCity(a)||cnCity(b))return tr('own_cable.nobody_gives_a_foreign_network_a');
  if(!seaReady(a,b))return tr('own_cable.surveying_a_sea_route');
  const routes=seaRoutes(a,b);if(!routes.length)return tr('own_cable.no_navigable_sea_route_connects');
  const km=Math.min(...routes.map(r=>r.km));if(!subNeed(km))return tr('own_cable.km_km_is_more_than_any',{km:km.toLocaleString(),max:Math.round(SUB_MAXKM()).toLocaleString()});
  return '';}
function ownCabTeaser(a,b){const why=ownCabWhy(a,b);return `<div class="btns" style="margin-top:8px">${btn(cabOpen()?tr('modals.lay_your_own_subsea_cable'):tr('modals.your_own_subsea_cable_tier_1'),'ownCab',{},cabOpen()&&!why?'pink':'ghost',!!why)}</div>${why&&cabOpen()?`<p class="note" ${seaSurveyAttr(a,b)}>${esc(why)}</p>`:''}`;}
function ownCabBody(a,b,pop){const why=ownCabWhy(a,b);if(why)return `<p class="lead" style="margin-top:10px" ${seaSurveyAttr(a,b)}>${esc(why)}</p>${btn(tr('common.back'),'dfSrc',{v:'lease'},'ghost sm')}`;
  const design=own(SEA_DESIGNS,UI.seaDesign)?UI.seaDesign:'standard',upgrades=seaUps(seaQuote(a,b,design).km),q=seaQuote(a,b,design,upgrades),{km,cost,days}=q,lack=seaLack(km,upgrades),mo=ownCabMo(km),wt=subMaxTier(km),w=Math.round(waveMo(km,true,wt)*waveMarket(a,b,true).m),save=10*w*LT[4].g/LT[wt].g-mo,pay=save>0?Math.ceil(cost/save):0;
  return `<p class="lead" style="margin-top:8px">${tr('own_cable.your_very_own_subsea_cable_a')}</p>
  <h4 class="sub4">${tr('common.cable_design')}</h4><div class="starts one">${Object.entries(SEA_DESIGNS).map(([v,D])=>{const o=seaQuote(a,b,v,upgrades);return `<button class="start ${design===v?'on':''}" data-act="seaDesign" data-args='{"v":"${v}"}'><b>${tr(D.n)}</b><span>${tr('common.ms_ms_one_way',{ms:o.ms.toFixed(1)})} · ${fmt$(o.cost+pop)} · ${tr('own_cable.about_n_days',{n:o.days})}</span></button>`;}).join('')}</div>
  <h4 class="sub4">${tr('common.submarine_transmission')}</h4>${Object.entries(SUB_UPGRADES).map(([k,U])=>btn(`${tr(U.n)} <small>${upgrades[k]?'✓ · ':''}${fmt$(subUpgradeCost({km},k))} · ${tr('own_cable.n_days',{n:U.days})}</small>`,'seaPackage',{k},upgrades[k]?'green sm':'ghost sm',!upgrades[k]&&!subHelps(km,k,upgrades[subOther(k)]))).join('')}
  ${lack.length?`<p class="why">${lack[0]==='design'?tr('own_cable.this_design_s_route_is_km',{km:km.toLocaleString()}):tr('own_cable.km_km_is_too_far_for',{km:km.toLocaleString(),what:lack.length>1?tr('own_cable.a_and_b',{a:tr(SUB_UPGRADES[lack[0]].n),b:tr(SUB_UPGRADES[lack[1]].n)}):tr(SUB_UPGRADES[lack[0]].n)})}</p>`:`<p class="note">${tr('common.up_to_g_per_channel',{g:fmtG(submarineRate({a,b,km,kind:'df',own:true,sub:true,subterminal:upgrades.terminal?S.day:undefined,subengineering:upgrades.engineering?S.day:undefined}))})} · ${tr('common.better_terminals_and_optical_tuning')}</p>`}
  <div class="kv"><span>${tr('common.estimated_latency')}</span><b>${tr('common.ms_ms_one_way',{ms:q.ms.toFixed(1)})}</b></div>
  <div class="kv"><span>${tr('common.route')}</span><b>${tr('own_cable.km_km_of_seabed',{km:km.toLocaleString()})}</b></div>
  <div class="kv"><span>${tr('common.fiber_pairs')}</span><b>${tr('own_cable.n_in_the_cable_the_first',{n:SUB_PAIRS_MAX})}</b></div>
  <div class="kv"><span>${tr('common.landing_stations')}</span><b>${tr('own_cable.a_and_b',{a:CITY[a].name,b:CITY[b].name})}</b></div>
  <div class="kv"><span>${tr('common.build_time')}</span><b>${tr('own_cable.about_n_days',{n:days})}</b></div>
  <div class="kv" style="margin-top:10px"><span>${tr('common.due_now')}</span><b>${fmt$(cost+pop)}</b></div><div class="kv"><span>${tr('common.monthly')}</span><b>${tr('common.price_mo',{price:fmt$(mo)})}</b></div>
  <p class="note">${subCarrier(km)?`${tr('own_cable.a_leased_wave_wave_on_this',{wave:LT[wt].n,price:fmt$(w)})} ${pay?tr('own_cable.replace_16_tbps_of_them_and',{n:pay}):''} `:''}${tr('own_cable.cuts_still_happen_anchors_and_sharks')}</p>
  <div class="btns" style="margin-top:10px">${btn(tr('own_cable.lay_the_cable_price',{price:fmt$(cost+pop)}),'orderCable',{},'pink big',S.cash<cost+pop||lack.length>0)}${btn(tr('common.back'),'dfSrc',{v:'lease'},'ghost')}</div>`;}
