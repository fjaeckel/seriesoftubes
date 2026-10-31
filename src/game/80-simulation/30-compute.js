// tr() with one placeholder, remembered: compute() labels every port, PNI and cache on every run.
const LABS=new Map();function labOf(s,k,v){const key=s+'|'+v;let o=LABS.get(key);if(o===undefined)LABS.set(key,o=tr(s,{[k]:v}));return o;}
// Who carries a network reached only through a cone (kept out of compute(), whose size the JIT is sensitive to).
function coneBy(L,id){let by=null;for(const e of L){if(e.k==='p')return e.net;if(!by&&e.k==='ix'&&e.dir)by=ANC[id].find(u=>e.dir.has(u))||null;}return by||1;}
function compute(){
  const day=S.day, R2=emptyR(), pops=Object.keys(S.pops).filter(popUp), NC=CITIES.length;
  // The graph works on city indices: adj[i] lists [neighbour, edge] in S.links order.
  const remote=remoteCities(),adj=new Array(NC); pops.concat(remote).forEach(p=>adj[CIDX[p]]=[]);
  const edges={},TRX=teRules(),live=[];let NE=0;R2.bizDem={};R2.bizSrv={};
  for(const l of S.links){const ai=CIDX[l.a],bi=CIDX[l.b];if(linkDown(l)||!adj[ai]||!adj[bi])continue;live.push(l);const key=l.a<l.b?l.a+'|'+l.b:l.b+'|'+l.a;let e=edges[key];
    // The metric belongs to the city pair (a preset or a custom one); links on standby add capacity that fills only after the others (#122).
    if(!e){e=edges[key]={id:key,a:l.a,b:l.b,ai,bi,i:NE++,km:l.km,cap:0,scap:0,w:Infinity,lat:Infinity,slat:Infinity,links:[],res:0,ld:0,tr:null,pl:0,f:TRX&&TRX.avoid.has(key)?60:1};adj[ai].push([bi,e]);adj[bi].push([ai,e]);}
    const c=capOf(l),lt=linkLat(l);e.cap+=c;e.links.push(l);e.w=Math.min(e.w,pairW(key,l.km)*e.f);if(l.standby){e.scap+=c;e.slat=Math.min(e.slat,lt);}else e.lat=Math.min(e.lat,lt);}
  for(const k in edges){const e=edges[k];if(e.lat===Infinity)e.lat=e.slat;}
  // Shortest paths from every POP: SPD[pop] the distance to each city index (Infinity: no path), SPP[pop] the edge it arrives by.
  // ALONE[i]: no other city lies within 1e-6 of POP i (so only its own exits can be at distance 0 from it).
  const SPD={},SPP={},SDi=[],SPi=[],ALONE=new Uint8Array(NC),wW=e=>e.w,wLat=e=>e.lat+0.05;
  for(const s of pops){const i=CIDX[s],r=dijkstra(adj,i,wW);SDi[i]=SPD[s]=r.D;SPi[i]=SPP[s]=r.P;ALONE[i]=1;for(let x=0;x<NC;x++)if(x!==i&&r.D[x]<1e-6)ALONE[i]=0;}
  // COMP[i]: the island city i is on (-1: no POP reaches it). Links run both ways, so reaching is mutual.
  const COMP=new Int32Array(NC).fill(-1);let NCOMP=0;for(const s of pops){const i=CIDX[s];if(COMP[i]>=0)continue;const D=SDi[i],k=NCOMP++;for(let x=0;x<NC;x++)if(D[x]<Infinity)COMP[x]=k;}
  const E=[], ev=S.ev;
  const depeer=ev.depeer>day||scnRule('spat'), leak=ev.leak&&ev.leak.until>day?ev.leak.net:null;
  // Sender pays (Gangnam Style Peering): no carrier hands traffic to the Korean incumbents for you, only a paid PNI does.
  const snd=scnRule('sender');
  for(const t of S.transit){if(!popUp(t.city)||t.down>day||!liveN(t.city,t.site,t.n))continue;
    // AS-path prepending (#96) moves part of the port to a last-resort exit of its own.
    const cap=Math.min(liveCap(PORT[t.tier].g,t.city,t.site,t.n)*lagF(t),TRX&&TRX.cap[t.net]!==undefined?TRX.cap[t.net]:Infinity),pf=TRX&&TRX.prep[t.net]?PREPEND_F[TRX.prep[t.net]]:0;
    const ex={k:'t',net:t.net,prem:premOn(t),pref:t.pref||'normal',lab:labOf(N_('common.net_transit'),'net',NET[t.net].name),id:t.id,city:t.city,cap:cap*(1-pf),used:0,rank:3,ok:n=>!(depeer&&t.net==='cog'&&n==='ggl')&&n!==leak&&!(snd&&NET[n].kr)};
    E.push(ex);if(pf)E.push({...ex,cap:cap*pf,prep:true});}
  // `nets`: every network ok() can say yes to, so it need not be asked about the other hundred.
  for(const c in S.ixp){const ct=ixCity(c);if(!(popUp(ct)||remote.includes(ct))||(S.ev.ixdown&&S.ev.ixdown[c]>day)||!(S.myIx[c]?myIxLive(c):liveN(ct,(S.ixSite||{})[c],(S.ixn||{})[c])))continue;const set=ixSessions(c);R2.sessions+=set.size;
    // A peer announces its customers too (#85): the session reaches its cone, after the networks peering directly.
    let all=set;for(const id of set)if(DOWN[id].length){if(all===set)all=new Set(set);for(const x of DOWN[id])all.add(x);}
    E.push({k:'ix',pref:(S.ixPref&&S.ixPref[c])||'normal',lab:labOf(N_('common.ix_peering'),'ix',ixName(c)),id:c,city:ct,cap:ixCap(c),used:0,rank:2,ok:n=>all.has(n),nets:all,dir:all===set?null:set});}
  for(const p of S.pni){if(!pniOn(p)||!popUp(p.city)||!liveN(p.city,p.site,p.n))continue;R2.sessions++;E.push({k:'p',pnc:!!NET[p.net].cn,pref:p.pref||'normal',lab:labOf(N_('common.pni_with_net'),'net',NET[p.net].name),id:p.id,city:p.city,cap:liveCap(pniG(p),p.city,p.site,p.n)*lagF(p)*(p.sacrif?0.5:1),used:0,rank:1,net:p.net,ok:n=>CONE_S[p.net].has(n),nets:CONE[p.net]});}
  for(const c of S.caches){if(!popUp(c.city)||siteDown(c.city,c.site==='b'?'b':'a'))continue;E.push({k:'c',pref:'normal',lab:labOf(N_('common.name_cache'),'name',NET[c.net].cache.name),id:c.id,city:c.city,cap:CACHE_CAP,used:0,rank:0,ok:n=>n===c.net,nets:[c.net]});}
  // After an update adds networks, a free courtesy route reaches the new ones you have no other way to (#46).
  R2.graceNets=0;if(S.grace&&S.grace.until>day){const gs=new Set(S.grace.nets.filter(n=>NET[n]&&!E.some(e=>e.k!=='c'&&e.ok(n)))),hc=popUp(S.home)?S.home:pops.find(popUp);
    R2.graceNets=gs.size;if(gs.size&&hc)E.push({k:'ix',pref:'normal',lab:tr('compute.courtesy_route_to_new_networks'),id:'~grace',city:hc,cap:1e9,used:0,rank:2,ok:n=>gs.has(n),nets:gs});}
  {const rp=ev.rpki&&ev.rpki.until>day?new Set(ev.rpki.nets):null;if(rp)for(const e of E){if(e.k==='c')continue;const o=e.ok;e.ok=n=>!rp.has(n)&&o(n);}}
  // coneOf: does exit e reach network n only through a peer's customer cone (#85)?
  const coneOf=(e,n)=>e.k==='p'?e.net!==n:!!e.dir&&!e.dir.has(n);
  // ok() cannot change during one compute, so ask each exit once per network, not once per flow and rank.
  // okBy[net] lists the exits that reach it in E's order, like E.filter(e=>e.ok(net)).
  const okBy={};for(const id of NET_IDS)okBy[id]=[];
  const ekN={};for(const e of E){e.ek=e.k+':'+e.id;ekN[e.ek]=(ekN[e.ek]||0)+1;}
  // dup: shares its key with another exit (a hand-edited save), so R.egDesc shows whichever pushed last.
  for(const e of E){e.desc={lab:e.lab,city:e.city,k:e.k};e.dup=ekN[e.ek]>1;e.told=false;e.hp=e.pref==='high'?0:1;e.ci=CIDX[e.city];e.cn=cnCity(e.city);e.vis=0;for(const n of e.nets||NET_IDS){const L=okBy[n];if(L&&L[L.length-1]!==e&&e.ok(n))L.push(e);}}
  for(const n of NETS){R2.reachable[n.id]=okBy[n.id].some(e=>e.rank>0);if(R2.reachable[n.id])R2.reach+=NSH[n.id];if(okBy[n.id].some(e=>e.rank>0&&e.k!=='t')){R2.nt[n.id]=1;R2.reachNT+=NSH[n.id];
    // Reached without transit only through the customers of networks you peer with (#85). R.cone[id]: the peer that
    // carries it, the first PNI's network or else the nearest upstream that is a member of an exchange you are on.
    if(!okBy[n.id].some(e=>(e.k==='p'||e.k==='ix')&&!coneOf(e,n.id)))R2.cone[n.id]=coneBy(okBy[n.id],n.id);}}
  const cacheNets=new Set(S.caches.filter(c=>popUp(c.city)).map(c=>c.net));
  const viral=(ev.viral>day?1.25:1)*(ev.php&&ev.php>day?0.7:1);
  // Every flow has the same shape and carries what routing asks about it again and again (nj: its network's index).
  const NN=NETS.length,flows=[],flow=(c,ci,cn,j,rem,cache,junk,bz=false)=>{const n=NETS[j],f={c,n:n.id,rem,cache,junk,bz,ci,cn,ncn:!!n.cn,nj:j,nr:junk?NN:j,gt:0,gi:0,gp:0,gh:0,ti:null,ii:null};flows.push(f);return f;};
  // Customer demand per city, added up in S.biz order (what filtering S.biz for each city would give).
  const bizBw={};for(const b of S.biz){const T=BIZ_T[b.type];if(!T.l2&&!T.fiber&&(!T.event||eventLive(b))){const v=bizBw[b.city];bizBw[b.city]=(v===undefined?0:v)+b.bw;}}
  // Traffic shares by network index, and their sums, for each share table (and with Russia's throttle).
  const shArr=new Map(),shSum=new Map(),DEMTO=new Float64Array(NN),loc=scnRule('local'),scrubRoom={},junkGroups=[],bhCities=new Set(ddosAll().filter(a=>a.bh).map(a=>a.city));R2.haul=[];R2.ddos=[];
  const VIC={};for(const a of ddosAll())(VIC[a.city]||(VIC[a.city]=[])).push(a);
  for(const c of Object.keys(S.pops)){
    const p=S.pops[c],ci=CIDX[c],cn=cnCity(c),SH=cn?NSH_CN:ruCity(c)?NSH_RU:CITY[c].kr&&S.krExit?NSH_KRX:NSH;const eye=(p.bb?p.bb.d:0)*viral*(cn&&ev.golden>day?1.4:1);const biz=bizBw[c]??0;const d0=eye+biz;
    // Goggle video is throttled in Russia (#70): people there get half of it, so they ask for half. It is not
    // traffic you failed to deliver, and it does not cross your links only to be thrown away.
    const ru=ruCity(c),thr=n=>n==='ggl'&&ru?0.5:1;let sa=shArr.get(SH),sm=shSum.get(SH);if(!sa){shArr.set(SH,sa=NETS.map(n=>SH[n.id]||0));shSum.set(SH,sm=[]);}
    const tt=sm[+ru]||(sm[+ru]=[NETS.reduce((t,n,j)=>t+sa[j]*thr(n.id),0),NETS.reduce((t,n,j)=>t+sa[j],0)]),lf=loc?NETS.reduce((t,n,j)=>t+(R2.reachable[n.id]?sa[j]*thr(n.id):0),0)/(tt[0]||1):1,d=d0*tt[0]/(tt[1]||1)*lf;
    R2.cityEye[c]=eye;R2.cityDem[c]=d;R2.citySrv[c]=0;R2.demand+=d;
    for(let j=0;j<NN;j++)DEMTO[j]=(DEMTO[j]||0)+d0*sa[j]*thr(NETS[j].id);
    // A shaped attack: `rtbh` is the player pulling the plug on the victim IP (junk gone, customer dark too);
    // `edge` is the crude RouteScript `blackhole ddos` filter (junk gone, 10% of real traffic with it). Flowspec
    // (a standing licence) and a scrubbing center each knock the flood down before it reaches the sim.
    const attacks=VIC[c]||[],rtbh=bhCities.has(c),edge=!!(attacks.length&&TRX&&TRX.blackhole&&!rtbh);
    // The junk heads for the victim over its usual exits, spread like its traffic. How much is left after the edge
    // tools and scrubbing is only known once hauls to remote centers are routed, so the flows are sized after that.
    for(const atk of attacks){const m=ddosMitigation(atk,{},rtbh,false),group={m,flows:[]};R2.ddos.push(m);junkGroups.push(group);if(!popUp(c)){m.offline=true;continue;}
      for(let j=0;j<NN;j++)group.flows.push({f:flow(c,ci,cn,j,0,false,true),share:NSH[NETS[j].id]});}
    if(!popUp(c))continue;
    const bh=rtbh||edge;
    if(edge)R2.teBlack+=attacks.reduce((n,a)=>n+a.gbps,0)+d*0.1;if(rtbh)R2.teBlack+=attacks.reduce((n,a)=>n+a.gbps,0)+d;
    R2.cityBlocked=R2.cityBlocked||{};
    const mtuH=ev.pmtud&&ev.pmtud.until>day?ev.pmtud:null,kr=CITY[c].kr;
    for(let j=0;j<NN;j++){const n=NETS[j],a=(loc&&!R2.reachable[n.id]?0:d0)*sa[j]*thr(n.id)*(rtbh?0:edge?0.9:1)*(mtuH&&mtuH.net===n.id?mtuH.f:1)*(kr&&ev.krroute>day&&n.id==='fbk'?0.8:1);if(a<=0)continue;
      // With `protect customers`, the business part first, then the rest (no arrays: this runs per city and network).
      const bf=d0>0?biz/d0:0,sp=!!(TRX&&TRX.protect&&bf>0),cn2=cacheNets.has(n.id);
      for(let q=0;q<(sp?2:1);q++){const x=sp?(q?a*(1-bf):a*bf):a,bz=sp&&!q;if(x<=0)continue;if(cn2){flow(c,ci,cn,j,x*0.85,true,false,bz);flow(c,ci,cn,j,x*0.15,false,false,bz);}
      else flow(c,ci,cn,j,x,false,false,bz);}}
    R2.bizDem[c]=biz*d/(d0||1);R2.bizSrv[c]=0;
  }
  if(Object.keys(S.pops).length)for(let j=0;j<NN;j++)R2.demTo[NETS[j].id]=DEMTO[j];
  /* While routing, each edge keeps its own room (res) and load (ld). Routers only exist in POPs (HAS): their room,
     load and served traffic are kept per city index. What crosses each edge (R.ef) is added up by egress, and in
     arrays by network (then 'junk' and 'l2vpn') and by source city, each key in the order it first got traffic. */
  const LATP=new Float64Array(NC),FARL=[],NRES=new Float64Array(NC),HAS=new Uint8Array(NC),NLOAD=new Float64Array(NC),NSEEN=new Uint8Array(NC),NORD=[],SRV=new Float64Array(NC),PASS=new Float64Array(NC).fill(1),OUT=new Uint8Array(NC);
  for(const k in edges)edges[k].res=edges[k].cap;for(const c of pops){const i=CIDX[c];NRES[i]=nodeCap(c);HAS[i]=1;R2.nodeCap[c]=NRES[i];}
  // The core (backbone technology): what passing-through traffic costs each router, and which POPs TE must avoid.
  const CORE=coreOn()&&S.core.run>=1;if(CORE)for(const c of pops){const i=CIDX[c];PASS[i]=corePass(c);OUT[i]=inCore(c)?0:1;}
  const nodeTake=(i,a)=>{NRES[i]-=a;if(!NSEEN[i]){NSEEN[i]=1;NORD.push(i);}NLOAD[i]=(NLOAD[i]||0)+a;};
  const NKN=NN+2,ACN=new Float64Array(NE*NKN),SEN=new Uint8Array(NE*NKN),ACD=new Float64Array(NE*NC),SED=new Uint8Array(NE*NC),EL=[];
  const carry=(l,eg,nr,ci,a)=>{let t=l.tr;if(!t){t=l.tr={g:new Map(),n:[],d:[]};EL.push(l);}t.g.set(eg,(t.g.get(eg)||0)+a);
    let k=l.i*NKN+nr;if(!SEN[k]){SEN[k]=1;t.n.push(nr);}ACN[k]=(ACN[k]||0)+a;k=l.i*NC+ci;if(!SED[k]){SED[k]=1;t.d.push(ci);}ACD[k]=(ACD[k]||0)+a;};
  R2.l2route={};R2.l2split={};
  /* compute() reads only S, except here: scenic circuits remember yesterday's path in R.l2route and R.efg (deliberate
     hysteresis, so they do not flap). A second call can still move one; the third gives the same answer as the second. */
  /* Scenic routing (#28). "Busy" is judged without the customer's own traffic, or it flees its own load and
     flips paths every day. Two paths that are about as quiet share the load, and yesterday's choice is kept
     unless today's is clearly better. */
  const fastSP={},divMemo={},cityIds=ni=>ni.map(i=>CITIES[i].id);
  // disjointRoutes() over today's live links, on city indices: the links are listed per city once, not twice per customer.
  const LA=[];for(const l of live){const ai=CIDX[l.a],bi=CIDX[l.b];(LA[ai]||(LA[ai]=[])).push([bi,l]);(LA[bi]||(LA[bi]=[])).push([ai,l]);}
  const srlg=l=>l.kind==='vxc'?'fab:'+l.prov:(l.trench||l.id);
  const bfsI=(a,b,skip)=>{const prev=[],seen=new Uint8Array(NC),q=[a];seen[a]=1;
    for(let h=0;h<q.length;){const u=q[h++];if(u===b)break;for(const [v,l] of LA[u]||[])if(!seen[v]&&!(skip&&skip.has(srlg(l)))){seen[v]=1;prev[v]=l;q.push(v);}}
    if(!seen[b])return null;const path=[];let v=b;while(v!==a){const l=prev[v];path.push(l);v=CIDX[l.a]===v?CIDX[l.b]:CIDX[l.a];}return path;};
  const disjointI=(A,B)=>{const a=CIDX[A],b=CIDX[B],p1=bfsI(a,b,null);return !!p1&&!!bfsI(a,b,new Set(p1.map(srlg)));};
  for(const k in edges){const e=edges[k];let ld=0;for(const l of e.links)ld+=(R.load&&R.load[l.id])||0;e.pl=ld;}
  const l2Routes=(A,B,b)=>{const m=b.route||'normal',Ai=CIDX[A],Bi=CIDX[B];
    if(m!=='scenic')return [{...walkI(m==='fast'?(fastSP[A]||(fastSP[A]=dijkstra(adj,Ai,wLat))).P:SPP[A],Ai,Bi),share:1}];
    const ek='l2:'+b.id,own=e=>(R.efg&&R.efg[e.id]&&R.efg[e.id].get(ek))||0;
    const wf=e=>e.w*(1+10*(e.cap?Math.max(0,e.pl-own(e))/e.cap:0));
    const cost=r=>r.path.reduce((x,e)=>x+wf(e),0)*r.share;
    const s1=dijkstra(adj,Ai,wf,null,Bi);if(s1.D[Bi]===Infinity)return [{...walkI(SPP[A],Ai,Bi),share:1}];
    const p1=walkI(s1.P,Ai,Bi),c1=cost({path:p1.path,share:1}),used=new Set(p1.path.map(e=>e.id));let pick2=[{...p1,share:1}];
    const s2=dijkstra(adj,Ai,wf,(v,e)=>used.has(e.id),Bi);
    if(s2.D[Bi]!==Infinity){const p2=walkI(s2.P,Ai,Bi);if(cost({path:p2.path,share:1})<=c1*1.15)pick2=[{...p1,share:0.5},{...p2,share:0.5}];}
    const key=b.id+'>'+A+'>'+B,old=R.l2route&&R.l2route[key];let out=pick2;
    if(old&&old.every(r=>r.keys.every(k=>edges[k]))){const prev=old.map(r=>{const path=r.keys.map(k=>edges[k]);return {path,ni:r.ns.map(c=>CIDX[c]),share:r.share};});
      if(prev.reduce((x,r)=>x+cost(r),0)<=pick2.reduce((x,r)=>x+cost(r),0)*1.1)out=prev;}
    R2.l2route[key]=out.map(r=>({keys:r.path.map(e=>e.id),ns:cityIds(r.ni),share:r.share}));return out;};
  for(const b of S.biz){if(!BIZ_T[b.type].l2)continue;
    // An SD-WAN is hub-and-spoke: one circuit from the first site to each of the others.
    const pairs=b.sites?b.sites.slice(1).map(x=>[b.sites[0],x]):[[b.city,b.city2]];let minF=1,maxLat=0,tot=0,noPath=false;
    for(const [A,B] of pairs){let amt=0;
    if(popUp(A)&&popUp(B)&&SPD[A]&&SPD[A][CIDX[B]]<Infinity){
      const ek='l2:'+b.id;R2.egDesc[ek]={lab:labOf(b.sites?N_('compute.sd_wan_for_name'):N_('compute.l2vpn_for_name'),'name',b.name),city:A,k:'l2'};
      const routes=l2Routes(A,B,b);if(routes.length>1)R2.l2split[b.id]=routes.length;
      for(const {path,ni,share} of routes){let a=b.bw*share;for(const l of path)a=Math.min(a,l.res);for(const i of ni)if(HAS[i])a=Math.min(a,NRES[i]);a=Math.max(0,a);amt+=a;maxLat=Math.max(maxLat,path.reduce((x,e)=>x+e.lat,0)+path.length*0.05);
        for(const i of ni)if(HAS[i])nodeTake(i,a);
        for(const l of path){l.res-=a;l.ld+=a;carry(l,ek,NN+1,CIDX[B],a);}}}
    else noPath=true;
    minF=Math.min(minF,amt/b.bw);tot+=amt;}
    R2.l2lat[b.id]=noPath?Infinity:maxLat;R2.l2[b.id]=b.bw*minF;R2.egT.l2=(R2.egT.l2||0)+tot;
    // Same answer as diversePaths(), which would rebuild today's live links for every customer.
    if((b.reqs||[]).includes('diverse')){const k=b.city+'>'+b.city2;R2.div[b.id]=divMemo[k]??(divMemo[k]=disjointI(b.city,b.city2));}}
  /* A flood for a scrubbing center elsewhere rides the backbone there, with the victim's own traffic (#117).
     What the links cannot carry is not scrubbed and lands on the city after all. */
  const scrubNear=new Map();
  for(const m of R2.ddos){const atk=m.attack,A=atk.city,Ai=CIDX[A];
    m.sp=!m.offline&&m.leak>0?scrubPlan(atk,m.leak,scrubRoom,(x,want)=>{const B=x.city,Bi=CIDX[B];if(A===B)return want;let h=0,ms=null;
      if(popUp(A)&&popUp(B)&&SPD[A]&&SPD[A][Bi]<Infinity){const {path,ni}=walkI(SPP[A],Ai,Bi);let room=Infinity;for(const l of path)room=Math.min(room,l.res);for(const i of ni)if(HAS[i])room=Math.min(room,NRES[i]);
        const v=R2.cityDem[A]*0.1*want/Math.max(m.leak,1)/VIC[A].length,total=want+v,take=Math.max(0,Math.min(total,room));h=total>0?want*take/total:0;ms=path.reduce((n,e)=>n+e.lat,0)*2;
        // Sources sharing a center need separate labels in link breakdowns and map highlights.
        const ek='scrub:'+A+'>'+B;R2.egDesc[ek]={lab:labOf(N_('compute.attack_hauled_to_scrubbing_in_city'),'city',CITY[B].name),city:A,k:'l2'};
        for(const i of ni)if(HAS[i])nodeTake(i,take);for(const l of path){l.res-=take;l.ld+=take;carry(l,ek,NN,Ai,take);}}
      R2.haul.push({city:A,to:B,tier:x.tier||0,a:want,h,ms,attack:atk.id});return h;}):null;
    if(m.sp){m.leak=m.sp.leak;
      // The card describes the victim's nearest center.
      const c=atk.city;let near=scrubNear.get(c);if(near===undefined){near=null;
        for(const x of S.scrubs)if(popUp(x.city)&&SPD[c]&&SPD[c][CIDX[x.city]]<Infinity){const ms=c===x.city?0:walkI(SPP[c],CIDX[c],CIDX[x.city]).path.reduce((n,e)=>n+e.lat,0);if(!near||ms<near.ms)near={city:x.city,ms};}
        scrubNear.set(c,near);}m.near=near;}}
  for(const group of junkGroups)for(const q of group.flows)q.f.rem=group.m.offline?0:group.m.leak*q.share;
  const TE=!!(S.te&&S.te.on)&&coreTE(),TR=TE?teRules():null,REACH=coreTeReach();R2.teMoved=0;const teCache=new Map(),SPILL=TR&&TR.spill?TR.spill:1;
  const altPath=(src,dst,base)=>{const key=src*NC+dst,c0=teCache.get(key);
    if(c0===false)return null;if(c0&&c0.path.every(l=>l.res>1e-3)&&c0.ni.every(i=>!HAS[i]||NRES[i]>1e-3))return c0;
    const {D,P}=dijkstra(adj,src,wW,(v,e)=>e.res<=1e-3||(HAS[v]&&NRES[v]<=1e-3)||(CORE&&OUT[v]&&v!==dst),dst);
    if(D[dst]===Infinity||D[dst]>REACH*base+60){teCache.set(key,false);return null;}
    const Q=walkI(P,src,dst);teCache.set(key,Q);return Q;};
  /* A network in a peer's customer cone, reached through that peer (#85): after every network you peer with directly
     (its AS path is one hop longer) and before transit. */
  const base=(e,n)=>e.pref==='low'?4:e.rank>0&&e.rank<3&&coneOf(e,n)?CONE_RANK:e.rank;
  // LOCAL_PREF on an upstream moves it ahead of or behind the other transits, never ahead of peering (#96).
  const eff=(e,n)=>{let r=base(e,n);if(TR){if(e.k==='t'&&TR.up[e.net])r=TR.up[e.net]==='prefer'?2.9:3.5;if(e.prep)r=4.4;if(e.k!=='c'&&TR.drain.has(e.city))r=4.6;const o=TR.net[n];if(o){if(o.prefer===e.k)r=0.5;else if(o.avoid===e.k)r=4.5;}}return r;};
  const RANKS=TR?[0,0.5,1,2,CONE_RANK,2.9,3,3.5,4,4.4,4.5,4.6]:[0,1,2,CONE_RANK,3,4];
  // With `protect customers`, business flows take every rank first; home users get what is left.
  const PASSES=TR&&TR.protect?[x=>x.bz,x=>!x.bz]:null;
  // Each network's exits by the rank they route at (RouteScript can move an exit per network), in E's order.
  // Each list also knows whether it holds a preferred exit (hi) and its exits by city (at), in list order.
  // With several islands (POPs no backbone joins), each list is split by island: a flow only scans exits it can reach.
  const idx=L=>{L.hi=L.some(e=>e.hp===0);L.at=new Map();for(const e of L){const h=L.at.get(e.ci);if(h)h.push(e);else L.at.set(e.ci,[e]);}};
  // Networks with the same exits at a rank share one list (LIST, by content), so what one flow learns serves them all.
  const LIST=new Map();for(let i=0;i<E.length;i++)E[i].xi=i;
  const byRank={},RSET=new Set();for(const id of NET_IDS){const m=byRank[id]={};for(const e of okBy[id]){const r=TR?eff(e,id):base(e,id);RSET.add(r);(m[r]||(m[r]=[])).push(e);}
    for(const r in m){const L=m[r],key=L.map(e=>e.xi).join(','),o=LIST.get(key);if(o){m[r]=o;continue;}
      let V=L;if(NCOMP>1){const cs=[];for(const e of L){const k=COMP[e.ci];if(k>=0)(cs[k]||(cs[k]=[])).push(e);}for(const s of cs)if(s)idx(s);V={cs};}else idx(L);LIST.set(key,V);m[r]=V;}}
  // The flow being routed, and from its POP: distances, arriving edges and the paths walked so far, by city index.
  let f=null,Dv=null,Pv=null,PP=null,vis=0;const walked=[],G=[],REST=[],NEG=[];
  // An exit the flow can still try: not visited yet, not full when the flow started, reachable, and not on a saturated path.
  const usable=e=>e.vis!==vis&&e.used<e.cap&&Dv[e.ci]<Infinity&&!gone(e),byDist=(a,b)=>a.hp-b.hp||Dv[a.ci]-Dv[b.ci];
  // Push up to `want` along one path to exit e; returns what fitted. Capacity only shrinks while routing, so a
  // path with one full link or node fits nothing for the rest of this pass: mark it, and later tries cost nothing
  // (most tries are into paths that filled up earlier).
  const push=(e,P,want,keep=0)=>{if(P.dead)return 0;const path=P.path,ni=P.ni;let amt=want;
    for(const l of path){const r=l.res;if(r<=1e-6){P.dead=1;return 0;}amt=Math.min(amt,r-l.cap*keep);}
    const last=ni.length-1;
    for(let k=0;k<=last;k++){const i=ni[k];if(!HAS[i])continue;const r=NRES[i];if(r<=1e-6){P.dead=1;return 0;}const w=k&&k<last?PASS[i]:1;amt=Math.min(amt,r/w);}
    if(amt<=1e-6)return 0;
    for(let k=0;k<=last;k++){const i=ni[k];if(HAS[i])nodeTake(i,k&&k<last?amt*PASS[i]:amt);}
    const ek=e.ek,nr=f.nr,ci=f.ci;if(!e.told||e.dup){R2.egDesc[ek]=e.desc;e.told=true;}
    for(const l of path){l.res-=amt;l.ld+=amt;carry(l,ek,nr,ci,amt);}
    e.used+=amt;f.rem-=amt;
    if(!f.junk){let ok=amt;const cf=f.cn,ce=e.cn,cn=f.ncn;
      if(cf!==ce||(cf&&!cn)||(!cf&&cn&&e.k==='t')){const prem=(e.k==='t'&&e.prem)||(e.k==='p'&&e.pnc)||path.some(x=>x.links&&x.links.some(y=>y.premium));const loss=prem?0.03:(ev.gfw>day?0.35:0.2);R2.gfwLost+=amt*loss;R2.gfwCross+=amt;ok=amt*(1-loss);}
      SRV[f.ci]+=ok;R2.served+=ok;if(f.bz)R2.bizSrv[f.c]+=ok;if(e.rank<=2)R2.peered+=ok;if(e.k==='t'){const m=R2.tNet[e.id]||(R2.tNet[e.id]={});m[f.n]=(m[f.n]||0)+ok;}
        // Backhaul to transit: users notice the round trip to the exit. Up to 20 ms (about 1,500 km) is free, then
        // it gets worse, and past 50 ms broadband and internet services count as bad service (#…). Under sender pays,
        // Korean users notice any exit far away, transit or not, and much sooner.
        if(path.length&&(e.k==='t'||snd&&CITIES[f.ci].kr)){let ms=P.ms;if(ms===undefined){ms=0;for(const l of path)ms+=l.lat;P.ms=ms;}const rtt=2*ms,kl=snd&&CITIES[f.ci].kr;
          if(rtt>(kl?KR_LAT_OK:LAT_OK)){LATP[f.ci]+=ok*(kl?krLatLoss(rtt):latLoss(rtt));if(!P.fg){P.fg=0;FARL.push(P,f.ci,e.ci);}P.fg+=ok;}}R2.egT[e.k]=(R2.egT[e.k]||0)+ok;const ne=NEG[f.nj]||(NEG[f.nj]=R2.netEg[f.n]={c:0,p:0,ix:0,t:0});ne[e.k]+=ok;
      // Where each flow left (the PNI list asks what a PNI here would take over, #175).
      if(e.k==='t'){f.gt+=ok;f.ti=e.id;}else if(e.k==='ix'){f.gi+=ok;f.ii=e.id;}else if(e.k==='p'){if(e.net===f.n&&e.city===f.c)f.gh+=ok;else f.gp+=ok;}}
    return amt;
  };
  // Shortest path first. With Auto-TE, whatever does not fit spills onto up to two alternate paths
  // with free capacity, as long as they are no more than twice as long.
  const send=(e,want)=>{
    let room=Math.min(want,f.rem,e.cap-e.used);if(room<=1e-6)return;
    const P=PP[e.ci]||(PP[e.ci]=walkI(Pv,f.ci,e.ci));if(!P.dead)room-=push(e,P,room,TE&&SPILL<1?1-SPILL:0);
    if(TE&&room>1e-6&&f.rem>1e-6&&e.used<e.cap&&e.city!==f.c)for(let k=0;k<2&&room>1e-6;k++){const P=altPath(f.ci,e.ci,Dv[e.ci]);if(!P)break;const m=push(e,P,Math.min(room,e.cap-e.used));if(m<=1e-6)break;room-=m;R2.teMoved+=m;}
  };
  // Exits with the same preference and the same IGP distance form an ECMP group: spread the flow over
  // them by free capacity (like several transits in one city), then top up in order if one fills.
  // The group is g[i0..i1): plain loops and one scratch array, since this runs for most flows (same sums, same order).
  // Without Auto-TE an exit whose path from here is full takes nothing: skip the call (and the numbers it boxes).
  const gone=e=>{if(TE)return false;const P=PP[e.ci];return !!P&&P.dead===1;};
  const ROOM=[],sendGroup=(g,i0=0,i1=g.length)=>{for(let k=i0;k<i1;k++)g[k].vis=vis;
    if(i1-i0>1){let tot=0;for(let k=i0;k<i1;k++){const e=g[k],r=Math.max(0,e.cap-e.used);ROOM[k-i0]=r;tot+=r;}const want=f.rem;if(tot>1e-6)for(let k=i0;k<i1;k++)if(!gone(g[k]))send(g[k],want*ROOM[k-i0]/tot);}
    for(let k=i0;k<i1;k++){if(f.rem<=1e-6)break;if(!gone(g[k]))send(g[k],f.rem);}};
  // Stable, in place: short lists by insertion (no garbage), long ones by the built-in sort. Both are stable with the
  // same comparison, so the order is the same either way.
  const sortD=a=>{const n=a.length;if(n>24){a.sort(byDist);return;}for(let i=1;i<n;i++){const x=a[i];let j=i-1;while(j>=0&&byDist(a[j],x)>0){a[j+1]=a[j];j--;}a[j+1]=x;}};
  for(const pass of PASSES||[null])for(const rank of RANKS){
    if(!RSET.has(rank))continue;
    // Index loops in here: plain for…of allocates an iterator per loop until V8 has optimised compute().
    for(let fi=0,FN=flows.length;fi<FN;fi++){f=flows[fi];
      if(f.rem<=1e-6||(rank===0&&!f.cache)||(pass&&!pass(f)))continue;
      Dv=SDi[f.ci];Pv=SPi[f.ci];PP=walked[f.ci]||(walked[f.ci]=[]);vis++;
      let lst=byRank[f.n][rank];if(!lst)continue;if(lst.cs){lst=lst.cs[COMP[f.ci]];if(!lst)continue;}
      /* Groups are tried nearest first, preferred exits before the rest, in the order a stable sort of the usable
         exits gives. Exits only fill up once tried, so the usable ones stay the same until then. Nearly every flow
         fits in its first group: find that one with a scan (nothing is visited yet), and sort only what is left
         when it does not fit. Most often the group is the POP's own exits: with no preferred exit on the list
         and no other city at distance 0, the usable ones here are exactly the first group, already in order. */
      G.length=0;
      if(!lst.hi&&ALONE[f.ci]){const here=lst.at.get(f.ci);if(here)for(const e of here)if(e.used<e.cap&&!gone(e))G.push(e);}
      if(!G.length){
        // One scan: the best (preference, distance) so far and, in list order, the exits within 1e-6 of it. The best
        // distance only goes down, so dropping the ones it leaves behind gives exactly the exits a second scan would.
        // Exits that are full stay full for this pass: when a quarter of a list is, it is rewritten without them.
        /* gc[ci]: the first group this list gave a flow from city ci. Exits only fill up during routing, so while all of
           them still have room no other exit can have become better, and the scan would find the same group (an
           empty one, no usable exit, stays empty). */
        const gc=lst.gc||(lst.gc=[]),c=gc[f.ci];
        if(c!==undefined&&c.every(e=>e.used<e.cap&&!gone(e))){if(!c.length)continue;for(let k=0;k<c.length;k++)G.push(c[k]);}else{
        let bh=2,bd=Infinity,full=0;
        for(let li=0,LN=lst.length;li<LN;li++){const e=lst[li];if(e.used>=e.cap||gone(e)){full++;continue;}const d=Dv[e.ci];if(d===Infinity)continue;const h=e.hp;
          if(h<bh){bh=h;bd=d;G.length=0;G.push(e);}
          else if(h===bh){if(d<bd){bd=d;let k=0;for(let gi=0;gi<G.length;gi++){const x=G[gi];if(Dv[x.ci]-d<1e-6)G[k++]=x;}G.length=k;G.push(e);}else if(d-bd<1e-6)G.push(e);}}
        if(full*4>=lst.length&&full){let k=0;for(let li=0;li<lst.length;li++){const e=lst[li];if(e.used<e.cap)lst[k++]=e;}lst.length=k;}
        if(bh>1){gc[f.ci]=[];continue;}
        if(G.length>1)sortD(G);gc[f.ci]=G.slice();}}
      sendGroup(G,0,G.length);
      if(f.rem<=1e-6)continue;
      REST.length=0;for(let li=0;li<lst.length;li++)if(usable(lst[li]))REST.push(lst[li]);sortD(REST);
      for(let i=0;i<REST.length&&f.rem>1e-6;){
        let j=i+1;while(j<REST.length&&REST[j].hp===REST[i].hp&&Math.abs(Dv[REST[j].ci]-Dv[REST[i].ci])<1e-6)j++;
        sendGroup(REST,i,j);i=j;
      }
    }
  }
  for(const i of NORD)R2.nodeLoad[CITIES[i].id]=NLOAD[i];
  for(const c of Object.keys(S.pops)){const i=CIDX[c];R2.citySrv[c]=SRV[i];
    if(LATP[i]>0&&SRV[i]>0)R2.latF[c]=clamp(1-LATP[i]/SRV[i],0,1);}
  // Each city's slowest big exit: (path, source, exit) triples, one per path that went far, in the order they first did.
  {const G=new Map();for(let k=0;k<FARL.length;k+=3){const P=FARL[k],src=FARL[k+1],to=FARL[k+2],key=src*NC+to,o=G.get(key);if(o){o.g+=P.fg;o.ms=Math.max(o.ms,2*P.ms);}else G.set(key,{src,to,g:P.fg,ms:2*P.ms});}
   for(const o of G.values()){const c=CITIES[o.src].id,cur=R2.latFar[c];if(!cur||o.g>cur.g)R2.latFar[c]={to:CITIES[o.to].id,g:o.g,ms:o.ms,share:SRV[o.src]>0?o.g/SRV[o.src]:0};}}
  // R.ef is read for the link you inspect: each edge's record is put together the first time it is asked for. Scenic
  // routing only needs the egress amounts, so R.efg keeps those as they are (not listed, so R reads the same).
  {const efg={};for(const l of EL){const t=l.tr,i=l.i;let rec=null;efg[l.id]=t.g;
    Object.defineProperty(R2.ef,l.id,{enumerable:true,configurable:true,get(){if(!rec){rec={eg:{},net:{},dst:{}};for(const [k,v] of t.g)rec.eg[k]=v;
      for(const j of t.n)rec.net[j<NN?NETS[j].id:j===NN?'junk':'l2vpn']=ACN[i*NKN+j];for(const ci of t.d)rec.dst[CITIES[ci].id]=ACD[i*NC+ci];}return rec;}});}
   Object.defineProperty(R2,'efg',{value:efg});}
  // Active links fill first, by capacity; standby links take what is left over.
  for(const k in edges){const e=edges[k],ld=e.ld||0,ac=e.cap-e.scap,a=Math.min(ld,ac),sp=ld-a;for(const l of e.links){const c=capOf(l);R2.load[l.id]=l.standby?(e.scap>0?sp*c/e.scap:0):(ac>0?a*c/ac:0);}}
  R2.peerShare=R2.served>0?R2.peered/R2.served:0;
  for(const e of E){if(e.k==='t')R2.useT[e.id]=(R2.useT[e.id]||0)+e.used;else if(e.k==='ix')R2.useIx[e.id]=e.used;else if(e.k==='p')R2.usePni[e.id]=e.used;else R2.useCache[e.id]=e.used;}
  // money
  const C=R2.cost,V=R2.rev,pm=S.priceMul;
  C.pops=Object.entries(S.pops).reduce((a,[c,p])=>a+popMo(c)+((p.routers||1)-1)*ROUTER_MO+cageMo(p.routers)+(p.routers||1)*RG[p.rgen||0].mo+(p.gen?GEN_MO:0),0);
  C.optical=S.links.filter(l=>l.kind==='df').reduce((a,l)=>a+(l.ready>S.day?0:ampCount(l.km)*AMP_MO*(l.own&&isRdm(l.sys)&&!l.sub?Math.max(1,l.pairs|0):1)+(l.regen|0)*REGEN_MO)+(l.spares?Math.round(150+(l.ch||[]).length*80):0),0);
  C.links=S.links.reduce((a,l)=>a+(l.mo||0),0);
  C.nni=(S.nni||[]).reduce((a,x)=>a+NNI[x.tier].mo,0);
  const htd=histToday();C.transit=S.transit.reduce((a,t)=>{const q=p95(t,R2.useT[t.id]||0,htd);R2.p95[t.id]=q;return a+transitMo(t,q);},0);
  C.ix=Object.keys(S.ixp).reduce((a,c)=>a+ixMo(c),0);
  C.pni=S.pni.reduce((a,p)=>a+pniMo(p,R2.usePni[p.id]||0),0);
  C.caches=S.caches.length*CACHE_MO;
  C.loans=(S.loans||[]).reduce((a,l)=>a+(BANKS[l.bank].equity?0:l.model==='transit'?Math.round((C.transit||0)*(l.cut||0.3)):l.pay)+loanFees(l),0);
  C.extras=(S.cnLic&&S.cnLic.state==='ok'?CN_JV_MO:0)+scrubMo()+Object.keys(S.pops).filter(ruCity).length*RU_BOX_MO+Object.values(S.pops).filter(p=>p.site2).length*SITE2_MO+(S.te?TE_MO:0)+(S.ops&&S.ops.intern?INTERN_MO:0);
  V.eyeballs=0;V.business=0;V.ix=0;V.grant=grantOn(R2)?GRANT_MO:0;
  C.wholesale=0;C.levy=0;const lev=scnRule('levy');for(const c in S.pops){const sf=sfOf(R2,c),v=R2.cityEye[c]*sf*EYE_RATE*arpuOf(c);V.eyeballs+=v;if(CITY[c].au){if(lev)C.levy+=v*AU_LEVY;else C.wholesale+=v*AU_WHOLESALE;}}
  const ids=linkIds();for(const b of S.biz){if(capPend(b))continue;const sf=BIZ_T[b.type].fiber?(fiberOk(b,ids)?1:0):BIZ_T[b.type].l2?clamp((R2.l2[b.id]||0)/b.bw,0,1):sfOf(R2,b.city);V.business+=b.bw*b.rate*Math.min(1,sf/0.95);}
  for(const c in S.myIx)V.ix+=S.myIx[c].members.length*MYIX_FEE;
  C.revshare=(S.loans||[]).reduce((a,l)=>a+(BANKS[l.bank].equity||l.bal>0?l.share||0:0),0)*(V.eyeballs+V.business+V.ix);
  R2.costMo=Object.values(C).reduce((a,b)=>a+b,0);
  R2.revMo=V.eyeballs+V.business+V.ix+V.grant;
  Object.defineProperty(R2,'fl',{value:flows});R=R2;UI.hotMap=hotByCity();
}
