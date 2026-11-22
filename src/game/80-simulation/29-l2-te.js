/* Opt-in circuit TE: reserve each circuit before IP traffic as before, but let its overflow use live residual
   capacity. Pins and paths through orbit keep their own routing. Nothing is built while the option is off. */
function l2TePath(adj,src,dst,skip,reach,lim,fast){
  const weight=e=>e.w,latency=e=>e.lat+0.05;
  const d=dijkstraTo(adj,src,fast?latency:weight,skip,dst);if(d===Infinity||(fast?d>lim:d>reach))return null;
  const r=walkI(DJ.P,src,dst);
  if(r.path.reduce((s,e)=>s+e.w,0)<=reach&&r.path.reduce((s,e)=>s+latency(e),0)<=lim)return r;
  // The cheapest path may miss the SLA while another fits it. Keep non-dominated cost/latency labels only
  // on this constrained fallback; ordinary circuits take the single Dijkstra above.
  const first={i:src,w:0,ms:0,prev:null,e:null,dead:false},at=new Array(adj.length),q=[first];at[src]=[first];
  while(q.length){let k=0;for(let j=1;j<q.length;j++)if((fast?q[j].ms:q[j].w)<(fast?q[k].ms:q[k].w))k=j;
    const u=q[k];q.splice(k,1);if(u.dead)continue;
    if(u.i===dst){const path=[],ni=[dst];let p=u;while(p.prev){path.push(p.e);p=p.prev;ni.push(p.i);}return {path,ni};}
    for(const [i,e] of adj[u.i]||[]){if(skip(i,e))continue;const w=u.w+e.w,ms=u.ms+latency(e);if(w>reach||ms>lim)continue;
      const labels=at[i]||(at[i]=[]);if(labels.some(p=>p.w<=w&&p.ms<=ms))continue;
      for(let j=labels.length-1;j>=0;j--)if(w<=labels[j].w&&ms<=labels[j].ms){labels[j].dead=true;labels.splice(j,1);}
      const p={i,w,ms,prev:u,e,dead:false};labels.push(p);q.push(p);}}
  return null;
}
function l2TeRouter({adj,HAS,NRES,CORE,OUT,TR,REACH,SPD,nodeTake,carry,NN,R2}){
  const latency=e=>e.lat+0.05,spill=TR&&TR.spill||1,tiers=TR?TR.tiers:[];
  // put(r,a), when given, carries a on path r itself (the charter's hauls carry each flow's own network) and nothing is
  // recorded as a circuit's route.
  return (A,B,b,routes,put)=>{
    const src=CIDX[A],dst=CIDX[B],ek='l2:'+b.id,placed=new Map();let left=b.bw,maxLat=0;
    const ms=r=>r.path.reduce((s,e)=>s+latency(e),0),baseMs=Math.min(...routes.map(ms)),reach=SPD[A][dst]*REACH+60;
    const preferred=new Set(routes.map(r=>r.path.map(e=>e.id).join(',')));
    const push=(r,want,keep,detour)=>{let a=Math.min(left,want);for(const e of r.path)a=Math.min(a,e.res-e.cap*keep);
      for(const i of r.ni)if(HAS[i])a=Math.min(a,NRES[i]);if(!(a>1e-6))return 0;
      for(const i of r.ni)if(HAS[i])nodeTake(i,a);
      if(put){for(const e of r.path){e.res-=a;e.ld+=a;}put(r,a);}else for(const e of r.path){e.res-=a;e.ld+=a;carry(e,ek,NN+1,dst,a);}left-=a;maxLat=Math.max(maxLat,ms(r));
      const key=r.path.map(e=>e.id).join(','),old=placed.get(key);if(old)old.g+=a;else placed.set(key,{r,g:a});
      if(detour&&!preferred.has(key))R2.teMoved=(R2.teMoved||0)+a;return a;};
    const fill=(keep,lim,byLatency)=>{
      for(const r of routes){const old=placed.get(r.path.map(e=>e.id).join(','));push(r,b.bw*r.share-(old?old.g:0),keep,false);}
      while(left>1e-6){const skip=(v,e)=>e.w===Infinity||e.res<=e.cap*keep+1e-3||(HAS[v]&&NRES[v]<=1e-3)||(CORE&&OUT[v]&&v!==dst);
        // As for IP TE, latency tiers use their explicit budget instead of the ordinary metric reach.
        const r=l2TePath(adj,src,dst,skip,byLatency?Infinity:reach,Math.min(lim,b.latMax>0?b.latMax:Infinity),byLatency||b.route==='fast');if(!r)break;
        if(!(push(r,left,keep,true)>1e-6))break;}
    };
    for(const t of tiers){if(left<=1e-6)break;fill(1-t.at,baseMs+t.ms,true);}
    if(left>1e-6&&spill<1)fill(1-spill,Infinity,false);
    if(left>1e-6)fill(0,Infinity,false);
    if(put)return {amt:b.bw-left,lat:maxLat||baseMs};
    const key=b.id+'>'+A+'>'+B;
    R2.l2route[key]=[...placed.values()].map(({r,g})=>({keys:r.path.map(e=>e.id),ns:r.ni.map(i=>CITIES[i].id),share:g/b.bw,te:true}));
    if(placed.size>1)R2.l2split[b.id]=Math.max(R2.l2split[b.id]||0,placed.size);
    return {amt:b.bw-left,lat:maxLat||baseMs};
  };
}
