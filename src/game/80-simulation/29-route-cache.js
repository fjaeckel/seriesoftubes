/* What compute() works out from the network's shape alone, kept from one call to the next: most days only demand moves,
   and on a big network these are a third of the work. Each part has a key made of everything it is built from, and any
   other key rebuilds it, so it is never stale:
   - the graph (RC.gk): the POPs, the remote cities and every edge with its ends and weight, in the order compute() made
     them. Kept: the shortest-path tables from every POP, ALONE and the islands (COMP).
   - the exits (RC.xk): the graph key, RouteScript, the events that change who reaches whom, and every exit in order with
     its kind, id, network, city, preference, rank, carry and prepend marks and what it can reach. Kept: okBy, what is
     reachable, and each network's exit lists by rank (BRJ, with the lists networks share) with DSEL and RSET.
   Only numbers are kept (exit and edge indices): compute() makes fresh exits, lists and paths from them every call,
   since routing writes on those. RC.on=false (the equivalence tests) always rebuilds. */
const RC={on:true,gk:null,g:null,xk:null,x:null};
// The graph key: EA lists the edges in the order compute() made them (so adj, and the order Dijkstra settles ties, follow).
function rcGraphKey(pops,remote,EA){let k=pops.join(',')+'|'+remote.join(',');for(let i=0;i<EA.length;i++){const e=EA[i];k+='|'+e.ai+','+e.bi+','+e.w;}return k;}
// Shortest paths from every POP, from the cache or worked out (and kept when key is not null). P arrays hold today's edges.
function rcGraph(key,pops,adj,EA,NC,wW){const SPD={},SPP={},SDi=[],SPi=[],G=key!==null&&RC.gk===key?RC.g:null;
  if(G){for(const s of pops){const i=CIDX[s],PI=G.PI[i],P=new Array(NC);for(let x=0;x<NC;x++){const k=PI[x];if(k>=0)P[x]=EA[k];}SDi[i]=SPD[s]=G.D[i];SPi[i]=SPP[s]=P;}
    return {SPD,SPP,SDi,SPi,ALONE:G.ALONE,COMP:G.COMP,NCOMP:G.NCOMP};}
  // ALONE[i]: no other city lies within 1e-6 of POP i (so only its own exits can be at distance 0 from it).
  const ALONE=new Uint8Array(NC),PIs=[];
  for(const s of pops){const i=CIDX[s],r=dijkstra(adj,i,wW);SDi[i]=SPD[s]=r.D;SPi[i]=SPP[s]=r.P;ALONE[i]=1;for(let x=0;x<NC;x++)if(x!==i&&r.D[x]<1e-6)ALONE[i]=0;
    if(key!==null){const PI=PIs[i]=new Int32Array(NC).fill(-1);for(let x=0;x<NC;x++)if(r.P[x])PI[x]=r.P[x].i;}}
  // COMP[i]: the island city i is on (-1: no POP reaches it). Links run both ways, so reaching is mutual.
  const COMP=new Int32Array(NC).fill(-1);let NCOMP=0;for(const s of pops){const i=CIDX[s];if(COMP[i]>=0)continue;const D=SDi[i],k=NCOMP++;for(let x=0;x<NC;x++)if(D[x]<Infinity)COMP[x]=k;}
  if(key!==null){RC.gk=key;RC.g={D:SDi.slice(),PI:PIs,ALONE,COMP,NCOMP};RC.xk=null;RC.x=null;}
  return {SPD,SPP,SDi,SPi,ALONE,COMP,NCOMP};}
/* The exits key. What an exit reaches: a transit port every network its flags allow (the flags are in the key), a PNI its
   network's cone (fixed at load), a cache its network, an exchange (or the courtesy route) its sessions with their cones,
   each marked when it is reached only through a cone (^). */
function rcExitKey(gk,E,flags){let k=gk+'#'+flags;
  for(let i=0;i<E.length;i++){const e=E[i];k+='\n'+e.k+'|'+e.id+'|'+e.net+'|'+e.city+'|'+e.pref+'|'+e.rank+'|'+(e.carry?1:0)+(e.prep?1:0)+'|';
    if(e.k==='ix'){const d=e.dir;e.nets.forEach(n=>{k+=n+(d&&!d.has(n)?'^,':',');});}else if(e.k==='c')k+=e.nets[0];}
  return k;}
// The exits' lists, with a sort key: an exit's index in E.
const rcIx=(L,E)=>{const a=new Int32Array(L.length);for(let i=0;i<L.length;i++)a[i]=L[i].xi;return a;};
const rcEx=(a,E)=>{const L=new Array(a.length);for(let i=0;i<a.length;i++)L[i]=E[a[i]];return L;};
// Each list knows whether it holds a preferred exit (hi) and its exits by city (at), in list order.
function exIdx(L){L.hi=L.some(e=>e.hp===0);L.mx=L.some(e=>e.dt>0)&&L.some(e=>e.dt===0);L.at=new Map();for(const e of L){const h=L.at.get(e.ci);if(h)h.push(e);else L.at.set(e.ci,[e]);}}
// What reaching networks gave R (taken right after compute() worked it out, before anything else adds to R).
function rcReachTake(R2){return {reachable:{...R2.reachable},nt:{...R2.nt},cone:{...R2.cone},reach:R2.reach,reachNT:R2.reachNT};}
function rcReachPut(X,R2){const r=X.reach;Object.assign(R2.reachable,r.reachable);Object.assign(R2.nt,r.nt);Object.assign(R2.cone,r.cone);R2.reach=r.reach;R2.reachNT=r.reachNT;}
// Keep what was built (on a miss): okBy, the exit lists (each shared list once), each network's lists by rank, DSEL, RSET.
/* A list's orders (by source city) follow from its exits in list order, each exit's city and preference, and the graph's
   distances. When the exits change (a PNI comes up, a network leaves an exchange), most lists do not: one with the same
   exits, cities and preferences on the same graph keeps the orders it had, and uses them today already. Only the lists
   that changed start again (scanned today, sorted from tomorrow). */
function rcExitKeep(key,E,okBy,reach,LIST,BRJ,DSEL,RSET,bk=''){const ok=[];for(let j=0;j<NET_IDS.length;j++)ok[j]=rcIx(okBy[NET_IDS[j]],E);
  // An exit's kind counts too: an exchange exit sorts behind a PNI at the same distance (dt).
  const sig=new Int32Array(E.length);for(let i=0;i<E.length;i++)sig[i]=E[i].ci*8+E[i].hp*2+(E[i].dt>0?1:0);
  const P=RC.x&&RC.x.gk===RC.gk&&RC.x.bk===bk&&RC.x.sig?RC.x:null,old=new Map();
  if(P)for(const d of P.lists){if(d.cs){for(let k=0;k<d.cs.length;k++)if(d.cs[k])old.set(k+'/'+d.cs[k].join(','),d.ord[k]);}else old.set(d.a.join(','),d.ord);}
  const same=a=>{for(let i=0;i<a.length;i++){const x=a[i];if(x>=P.sig.length||P.sig[x]!==sig[x])return false;}return true;};
  const kept=(k,a)=>{if(!P)return null;const o=old.get(k);return o&&same(a)?o:null;};
  const id=new Map(),lists=[];for(const V of LIST.values()){id.set(V,lists.length);
    if(V.cs){const cs=[],ord=[];for(let k=0;k<V.cs.length;k++)if(V.cs[k]){cs[k]=rcIx(V.cs[k],E);const o=kept(k+'/'+cs[k].join(','),cs[k]);ord[k]=o||[];if(o)V.cs[k].ord=o;}lists.push({cs,a:null,ord});}
    else{const a=rcIx(V,E),o=kept(a.join(','),a);lists.push({cs:null,a,ord:o||[]});if(o)V.ord=o;}}
  const brj=BRJ.map(m=>{const o=[];for(const r in m)o.push(r,id.get(m[r]));return o;});
  RC.xk=key;RC.x={ok,reach,lists,brj,DSEL,RSET:[...RSET],gk:RC.gk,bk,sig};}
// Fresh lists for today's exits from a kept build.
// Each list also gets the orders kept with it (ord: by source city, the list in the order routing tries it, see xOrder()
// in 30-compute.js), filled in as routing asks for them.
function rcExitLists(X,E,BRJ,DSEL,RSET){const V=X.lists.map(d=>{if(d.cs){const cs={cs:[]};for(let k=0;k<d.cs.length;k++)if(d.cs[k]){const s=rcEx(d.cs[k],E);exIdx(s);s.ord=d.ord[k];cs.cs[k]=s;}return cs;}
    const L=rcEx(d.a,E);exIdx(L);L.ord=d.ord;return L;});
  for(let j=0;j<X.brj.length;j++){const o=X.brj[j],m={};for(let k=0;k<o.length;k+=2)m[o[k]]=V[o[k+1]];BRJ[j]=m;}
  for(const [r,a] of X.DSEL)DSEL.set(r,a);for(const r of X.RSET)RSET.add(r);}
function rcOkBy(X,E){const okBy={};for(let j=0;j<NET_IDS.length;j++)okBy[NET_IDS[j]]=rcEx(X.ok[j],E);return okBy;}
