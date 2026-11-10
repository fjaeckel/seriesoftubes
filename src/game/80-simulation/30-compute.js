// tr() with one placeholder, remembered: compute() labels every port, PNI and cache on every run.
const LABS=new Map();function labOf(s,k,v){const key=s+'|'+v;let o=LABS.get(key);if(o===undefined)LABS.set(key,o=tr(s,{[k]:v}));return o;}
// Who carries a network reached only through a cone (kept out of compute(), whose size the JIT is sensitive to).
function coneBy(L,id){let by=null;for(const e of L){if(e.k==='p')return e.net;if(!by&&e.k==='ix'&&e.dir)by=ANC[id].find(u=>e.dir.has(u))||null;}return by||1;}
// Scratch columns compute() gathers its flows in, kept between calls: it copies out what it keeps, so no R shares them.
const FLB={n:0,cap:0,rem:null,ci:null,nj:null,ca:null,bz:null};
function flbGrow(){const c=Math.max(4096,FLB.cap*2),g=(A,o)=>{const a=new A(c);if(o)a.set(o);return a;};
  FLB.rem=g(Float64Array,FLB.rem);FLB.ci=g(Int32Array,FLB.ci);FLB.nj=g(Int32Array,FLB.nj);FLB.ca=g(Uint8Array,FLB.ca);FLB.bz=g(Uint8Array,FLB.bz);FLB.cap=c;}
// R.efg[link]: what each egress put on that link, read by scenic routing the next day (t.g gives each egress its slot in t.v).
class EgSums{constructor(t){this.t=t;}get(k){const s=this.t.g.get(k);return s===undefined?undefined:this.t.v[s];}}
/* R.ef and R.efg from what routing added up per edge (L: [link id, edge index, its sums t]), and R.fl from the flow
   columns (c). Also how a route worker's answer is put back together (28-route-worker.js): getters do not cross
   threads, so it sends these plain pieces (R.efp, R.flc) and the page rebuilds the same lazy R. */
function efBuild(R2,L,ACN,ACD,NKN,NC,NN){const efg={};for(const [id,i,t] of L){let rec=null;efg[id]=new EgSums(t);
    Object.defineProperty(R2.ef,id,{enumerable:true,configurable:true,get(){if(!rec){rec={eg:{},net:{},dst:{}};for(const [k,s] of t.g)rec.eg[k]=t.v[s];
      for(const j of t.n)rec.net[j<NN?NETS[j].id:j===NN?'junk':j===NN+1?'l2vpn':'scrub']=ACN[i*NKN+j];for(const ci of t.d)rec.dst[CITIES[ci].id]=ACD[i*NC+ci];}return rec;}});}
  Object.defineProperty(R2,'efg',{value:efg});Object.defineProperty(R2,'efp',{value:{L,ACN,ACD,NKN,NC,NN}});}
// R.fl: the flows as objects, made only when something asks (38-pni-value.js). E: the exits FTI and FII point into.
function flDefine(R2,c){const {NF,FREM,FCI,FNJ,FCA,FBZ,FGT,FGI,FGP,FGH,FTI,FII,E,CNB,NCN}=c;let fl=null;Object.defineProperty(R2,'flc',{value:c});
  Object.defineProperty(R2,'fl',{get(){if(!fl){fl=new Array(NF);for(let i=0;i<NF;i++){const ci=FCI[i],j=FNJ[i];
    fl[i]={c:CITIES[ci].id,n:NET_IDS[j],rem:FREM[i],cache:FCA[i]===1,junk:false,bz:FBZ[i]===1,ci,cn:CNB[ci],ncn:NCN[j],nj:j,nr:j,gt:FGT[i],gi:FGI[i],gp:FGP[i],gh:FGH[i],ti:FTI[i]<0?null:E[FTI[i]].id,ii:FII[i]<0?null:E[FII[i]].id};}}return fl;}});}
/* Every exit has the same fields in the same order, whatever its kind, so the routing loop reads them from one object shape
   (exits of six shapes made each property read there a slow lookup). */
function mkEx(k,id,city,cap,rank,pref,lab,ok,nets,net){return {k,net,id,city,lab,cap,used:0,rank,pref,ok,nets,dir:null,clean:false,prem:false,carry:false,prep:false,sac:false,pnc:false,
  ek:'',J:0,byC:null,desc:null,dup:false,told:false,hp:1,dt:0,ci:0,cn:false,ts:-1,xi:0,kx:EXK.indexOf(k),fac:undefined};}
// The exit kinds by number (mkEx's kx), for what routing adds up per kind in typed arrays.
const EXK=['t','ix','p','c'];
function compute(){RW.gen++;
  const day=S.day, R2=emptyR(), pops=Object.keys(S.pops).filter(popUp), NC=CITIES.length;
  // The graph works on city indices: adj[i] lists [neighbour, edge] in S.links order.
  const remote=remoteCities(),adj=new Array(NC); pops.concat(remote).forEach(p=>adj[CIDX[p]]=[]);
  const edges={},EA=[],TRX=teRules(),live=[];let NE=0;R2.bizDem={};R2.bizSrv={};
  for(const l of S.links){const ai=CIDX[l.a],bi=CIDX[l.b];if(linkDown(l)||!adj[ai]||!adj[bi])continue;live.push(l);const key=l.a<l.b?l.a+'|'+l.b:l.b+'|'+l.a;let e=edges[key];
    // The metric belongs to the city pair (a preset or a custom one); links on standby add capacity that fills only after the others (#122).
    if(!e){e=edges[key]={id:key,a:l.a,b:l.b,ai,bi,i:NE++,km:l.km,cap:0,scap:0,w:Infinity,lat:Infinity,slat:Infinity,links:[],res:0,ld:0,tr:null,pl:0,jk:0,f:TRX&&TRX.avoid.has(key)?60:1};EA.push(e);adj[ai].push([bi,e]);adj[bi].push([ai,e]);}
    const c=capOf(l),lt=linkLat(l);e.cap+=c;e.links.push(l);e.w=Math.min(e.w,pairW(key,l.km)*e.f);if(l.standby){e.scap+=c;e.slat=Math.min(e.slat,lt);}else e.lat=Math.min(e.lat,lt);}
  for(const k in edges){const e=edges[k];if(e.lat===Infinity)e.lat=e.slat;}
  // Shortest paths from every POP: SPD[pop] the distance to each city index (Infinity: no path), SPP[pop] the edge it arrives by;
  // ALONE and the islands (COMP). Kept between calls while the graph is the same (29-route-cache.js).
  const wW=e=>e.w,wLat=e=>e.lat+0.05,RCON=RC.on,GK=RCON?rcGraphKey(pops,remote,EA):null,
    G0=rcGraph(GK,pops,adj,EA,NC,wW),{SPD,SPP,SDi,SPi,ALONE,NCOMP}=G0;let COMP=G0.COMP;
  // Orbit (35-pie-paths.js): sky nodes and edges, after the IGP paths, which never use them; a POP cut off from the backbone
  // that backhauls through a dish gets its paths again with that edge (pieRelink, on copies: the cached graph stays as it was).
  const PX=S.pie?pieGraph(adj,edges,COMP,pops,NE):null;if(PX){NE=PX.ne;if(PX.bh.length)COMP=pieRelink(PX,SPD,SPP,SDi,SPi,COMP);}
  const ev=S.ev;
  const depeer=ev.depeer>day||scnRule('spat'), leak=ev.leak&&ev.leak.until>day?ev.leak.net:null;
  // Sender pays (Gangnam Style Peering): no carrier hands traffic to the Korean incumbents for you, only a paid PNI does.
  const snd=scnRule('sender');
  // Stages with loops run as functions of their own (see rankPass below), here the exits.
  const E=(()=>{const E=[];
  for(const t of S.transit){if(!popUp(t.city)||t.down>day||!liveN(t.city,t.site,t.n))continue;
    // AS-path prepending (#96) moves part of the port to a last-resort exit of its own.
    const cap=Math.min(liveCap(PORT[t.tier].g,t.city,t.site,t.n)*lagF(t),TRX&&TRX.cap[t.net]!==undefined?TRX.cap[t.net]:Infinity),pf=TRX&&TRX.prep[t.net]?PREPEND_F[TRX.prep[t.net]]:0;
    const ex=mkEx('t',t.id,t.city,cap*(1-pf),3,t.pref||'normal',labOf(N_('common.net_transit'),'net',NET[t.net].name),n=>!(depeer&&t.net==='cog'&&n==='ggl')&&n!==leak&&!(snd&&NET[n].kr),null,t.net);
    ex.clean=!!t.clean;ex.prem=premOn(t);ex.carry=!!t.carry;E.push(ex);if(pf){const x=Object.assign(mkEx(),ex);x.cap=cap*pf;x.prep=true;E.push(x);}}
  // `nets`: every network ok() can say yes to, so it need not be asked about the other hundred.
  for(const c in S.ixp){const ct=ixCity(c);if(!(popUp(ct)||remote.includes(ct))||(S.ev.ixdown&&S.ev.ixdown[c]>day)||!(S.myIx[c]?myIxLive(c):liveN(ct,(S.ixSite||{})[c],(S.ixn||{})[c])))continue;const set=ixSessions(c);R2.sessions+=set.size;
    // A peer announces its customers too (#85): the session reaches its cone, after the networks peering directly.
    let all=set;for(const id of set)if(DOWN[id].length){if(all===set)all=new Set(set);for(const x of DOWN[id])all.add(x);}
    const x=mkEx('ix',c,ct,ixCap(c),2,(S.ixPref&&S.ixPref[c])||'normal',labOf(N_('common.ix_peering'),'ix',ixName(c)),n=>all.has(n),all);x.dir=all===set?null:set;E.push(x);}
  for(const p of S.pni){if(!pniOn(p)||!popUp(p.city)||!liveN(p.city,p.site,p.n))continue;R2.sessions++;
    const x=mkEx('p',p.id,p.city,liveCap(pniG(p),p.city,p.site,p.n)*lagF(p)*(p.sacrif?0.5:1),2,p.pref||'normal',labOf(N_('common.pni_with_net'),'net',NET[p.net].name),n=>CONE_S[p.net].has(n),CONE[p.net],p.net);x.sac=!!p.sacrif;x.pnc=!!NET[p.net].cn;E.push(x);}
  for(const c of S.caches){if(!popUp(c.city)||siteDown(c.city,c.site==='b'?'b':'a'))continue;E.push(mkEx('c',c.id,c.city,cacheG(c),0,'normal',labOf(N_('common.name_cache'),'name',NET[c.net].cache.name),n=>n===c.net,[c.net]));}
  // After an update adds networks, a free courtesy route reaches the new ones you have no other way to (#46).
  R2.graceNets=0;if(S.grace&&S.grace.until>day){const gs=new Set(S.grace.nets.filter(n=>NET[n]&&!E.some(e=>e.k!=='c'&&e.ok(n)))),hc=popUp(S.home)?S.home:pops.find(popUp);
    R2.graceNets=gs.size;if(gs.size&&hc)E.push(mkEx('ix','~grace',hc,1e9,2,'normal',tr('compute.courtesy_route_to_new_networks'),n=>gs.has(n),gs));}
  return E;})();
  const rp=ev.rpki&&ev.rpki.until>day?new Set(ev.rpki.nets):null;if(rp)for(const e of E){if(e.k==='c')continue;const o=e.ok;e.ok=n=>!rp.has(n)&&o(n);}
  // Who reaches whom and each network's exit lists, kept while the exits are the same (XC, 29-route-cache.js).
  // A backhaul through a dish changes a cut-off POP's distances: lists kept in order (29-route-cache.js) only for the same one.
  const BHK=PX&&PX.bh.length?PX.bh.map(e=>e.bh.city+'>'+e.bh.land).join(','):'';
  const XK=RCON?rcExitKey(GK,E,(depeer?1:0)+'|'+leak+'|'+(snd?1:0)+'|'+(rp?ev.rpki.nets.join(','):'')+'|'+(TRX?S.te.script:'')+'|'+BHK):null,XC=XK!==null&&RC.xk===XK?RC.x:null;
  // coneOf: does exit e reach network n only through a peer's customer cone (#85)?
  const coneOf=(e,n)=>e.k==='p'?e.net!==n:!!e.dir&&!e.dir.has(n);
  // ok() cannot change during one compute, so ask each exit once per network, not once per flow and rank.
  // okBy[net] lists the exits that reach it in E's order, like E.filter(e=>e.ok(net)).
  const okBy=XC?rcOkBy(XC,E):{};if(!XC)for(const id of NET_IDS)okBy[id]=[];
  const okAdd=(e,n)=>{const L=okBy[n];if(L&&L[L.length-1]!==e&&e.ok(n))L.push(e);};
  // TSL: a slot per transit port id, for what it carries to each network (R.tNet, added up in TNA).
  const ekN={},TSL=new Map();(()=>{for(const e of E){e.ek=e.k+':'+e.id;ekN[e.ek]=(ekN[e.ek]||0)+1;}
  // dup: shares its key with another exit (a hand-edited save), so R.egDesc shows whichever pushed last.
  for(let i=0;i<E.length;i++){const e=E[i];e.xi=i;e.J=0;e.byC=null;e.desc=null;e.dup=ekN[e.ek]>1;e.told=false;e.hp=e.pref==='high'?0:1;e.dt=e.k==='ix'?PNI_TIE:0;e.ci=CIDX[e.city];e.cn=cnCity(e.city);e.ts=-1;if(e.k==='t'){let t=TSL.get(e.id);if(t===undefined)TSL.set(e.id,t=TSL.size);e.ts=t;}
    if(XC)continue;
    // Index loops or forEach (same order): for…of here made an iterator result per exit and network.
    const ns=e.nets||NET_IDS;if(Array.isArray(ns)){for(let q=0;q<ns.length;q++)okAdd(e,ns[q]);}else ns.forEach(n=>okAdd(e,n));}
  if(XC)rcReachPut(XC,R2);else for(const n of NETS){let any=false,nt=false;for(const e of okBy[n.id])if(e.rank>0){any=true;if(e.k!=='t'){nt=true;break;}}R2.reachable[n.id]=any;if(any)R2.reach+=NSH[n.id];if(nt){R2.nt[n.id]=1;R2.reachNT+=NSH[n.id];
    // Reached without transit only through the customers of networks you peer with (#85). R.cone[id]: the peer that
    // carries it, the first PNI's network or else the nearest upstream that is a member of an exchange you are on.
    if(!okBy[n.id].some(e=>(e.k==='p'||e.k==='ix')&&!coneOf(e,n.id)))R2.cone[n.id]=coneBy(okBy[n.id],n.id);}}})();
  const RCH=XK!==null&&!XC?rcReachTake(R2):null;
  const cacheNets=new Set(S.caches.filter(c=>popUp(c.city)).map(c=>c.net));
  const viral=(ev.viral>day?1.25:1)*(ev.php&&ev.php>day?0.7:1);
  /* Flows are columns, not objects (tens of thousands of them on a big network): flow F starts in city FCI[F] for network
     index FNJ[F] and has FREM[F] left to place. Gathered in FLB here, then copied into this call's own columns below. */
  FLB.n=0;const NN=NETS.length,CNB=[],NCN=NETS.map(n=>!!n.cn),flow=(ci,j,rem,cache,bz)=>{const k=FLB.n;if(k===FLB.cap)flbGrow();FLB.rem[k]=rem;FLB.ci[k]=ci;FLB.nj[k]=j;FLB.ca[k]=cache?1:0;FLB.bz[k]=bz?1:0;FLB.n=k+1;};
  // Customer demand per city, added up in S.biz order (what filtering S.biz for each city would give).
  const bizBw={};for(const b of S.biz){const T=BIZ_T[b.type];if(!T.l2&&!T.fiber&&(!T.event||eventLive(b))){if(T.orbit){const g=PX&&PX.gs[b.id];if(g)bizBw[g]=(bizBw[g]||0)+PX.term[b.id];continue;}const v=bizBw[b.city];bizBw[b.city]=(v===undefined?0:v)+b.bw;}}
  // Traffic shares by network index, and their sums, for each share table (and with Russia's throttle).
  const shArr=new Map(),shSum=new Map(),DEMTO=new Float64Array(NN),loc=scnRule('local');
  (()=>{for(const c of Object.keys(S.pops)){
    const p=S.pops[c],ci=CIDX[c],cn=cnCity(c),SH=cn?NSH_CN:ruCity(c)?NSH_RU:CITY[c].kr&&S.krExit?NSH_KRX:NSH;const eye=(p.bb?p.bb.d:0)*viral*(cn&&ev.golden>day?1.4:1);const biz=bizBw[c]??0;const d0=eye+biz;
    // Goggle video is throttled in Russia (#70): people there get half of it, so they ask for half. It is not
    // traffic you failed to deliver, and it does not cross your links only to be thrown away.
    const ru=ruCity(c),thr=n=>n==='ggl'&&ru?0.5:1;let sa=shArr.get(SH),sm=shSum.get(SH);if(!sa){shArr.set(SH,sa=NETS.map(n=>SH[n.id]||0));shSum.set(SH,sm=[]);}
    // This city's own split: its traffic to networks that sell to homes goes mostly to the ones whose users are near (#48).
    const ls=cityShares(SH,c);
    const tt=sm[+ru]||(sm[+ru]=[NETS.reduce((t,n,j)=>t+sa[j]*thr(n.id),0),NETS.reduce((t,n,j)=>t+sa[j],0)]),lf=loc?NETS.reduce((t,n,j)=>t+(R2.reachable[n.id]?ls[j]*thr(n.id):0),0)/(tt[0]||1):1,d=d0*tt[0]/(tt[1]||1)*lf;
    R2.cityEye[c]=eye;R2.cityDem[c]=d;R2.citySrv[c]=0;R2.demand+=d;
    for(let j=0;j<NN;j++)DEMTO[j]=(DEMTO[j]||0)+d0*ls[j]*thr(NETS[j].id);
    if(!popUp(c))continue;CNB[ci]=cn;
    R2.cityBlocked=R2.cityBlocked||{};
    const mtuH=ev.pmtud&&ev.pmtud.until>day?ev.pmtud:null,kr=CITY[c].kr;
    for(let j=0;j<NN;j++){const n=NETS[j],a=(loc&&!R2.reachable[n.id]?0:d0)*ls[j]*thr(n.id)*(mtuH&&mtuH.net===n.id?mtuH.f:1)*(kr&&ev.krroute>day&&n.id==='fbk'?0.8:1);if(a<=0)continue;
      // With `protect customers`, the business part first, then the rest (no arrays: this runs per city and network).
      const bf=d0>0?biz/d0:0,sp=!!(TRX&&TRX.protect&&bf>0),cn2=cacheNets.has(n.id);
      for(let q=0;q<(sp?2:1);q++){const x=sp?(q?a*(1-bf):a*bf):a,bz=sp&&!q;if(x<=0)continue;if(cn2){flow(ci,j,x*0.85,true,bz);flow(ci,j,x*0.15,false,bz);}
      else flow(ci,j,x,false,bz);}}
    R2.bizDem[c]=biz*d/(d0||1);R2.bizSrv[c]=0;
  }})();
  if(Object.keys(S.pops).length)for(let j=0;j<NN;j++)R2.demTo[NETS[j].id]=DEMTO[j];
  // What each flow got by kind of exit (FGT transit, FGI exchange, FGP PNI elsewhere, FGH PNI with that network here) and
  // the last transit and exchange exit it used (FTI, FII: an index into E, -1 for none). Fresh each call: R.fl reads them.
  const NF=FLB.n,FREM=FLB.rem?FLB.rem.slice(0,NF):new Float64Array(0),FCI=FLB.ci?FLB.ci.slice(0,NF):new Int32Array(0),FNJ=FLB.nj?FLB.nj.slice(0,NF):new Int32Array(0),FCA=FLB.ca?FLB.ca.slice(0,NF):new Uint8Array(0),FBZ=FLB.bz?FLB.bz.slice(0,NF):new Uint8Array(0),
    FGT=new Float64Array(NF),FGI=new Float64Array(NF),FGP=new Float64Array(NF),FGH=new Float64Array(NF),FTI=new Int32Array(NF).fill(-1),FII=new Int32Array(NF).fill(-1);
  /* While routing, each edge keeps its own room (res) and load (ld). Routers only exist in POPs (HAS): their room,
     load and served traffic are kept per city index. What crosses each edge (R.ef) is added up by egress, and in
     arrays by network (then 'junk', 'l2vpn' and 'scrub') and by source city, each key in the order it first got traffic. */
  const LATP=new Float64Array(NC),FARL=[],NRES=new Float64Array(NC),HAS=new Uint8Array(NC),NLOAD=new Float64Array(NC),NSEEN=new Uint8Array(NC),NORD=[],SRV=new Float64Array(NC),PASS=new Float64Array(NC).fill(1),OUT=new Uint8Array(NC);
  for(const k in edges)edges[k].res=edges[k].cap;for(const c of pops){const i=CIDX[c];NRES[i]=nodeCap(c);HAS[i]=1;R2.nodeCap[c]=NRES[i];}
  // The core (backbone technology): what passing-through traffic costs each router, and which POPs TE must avoid.
  const CORE=coreOn()&&S.core.run>=1;if(CORE)for(const c of pops){const i=CIDX[c];PASS[i]=corePass(c);OUT[i]=inCore(c)?0:1;}
  const TNA=new Float64Array(TSL.size*NN),TNS=new Uint8Array(TSL.size*NN),TNK=[],TORD=[];
  const NKN=NN+3,ACN=new Float64Array(NE*NKN),SEN=new Uint8Array(NE*NKN),ACD=new Float64Array(NE*NC),SED=new Uint8Array(NE*NC),EL=[];
  // The routing core (29-route-core.js) adds up what floods and circuits carry too.
  ROUTE.nodes({NRES,NSEEN,NORD,NLOAD,EL,NKN,SEN,ACN,NC,SED,ACD});const nodeTake=ROUTE.nodeTake,carry=ROUTE.carry;
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
  const l2Routes=(A,B,b)=>{if(b.pin){const r=pinRoute(b.pin,edges);if(r)return [r];}const m=b.route||'normal',Ai=CIDX[A],Bi=CIDX[B];
    if(PX&&m==='fast')return pieFast(PX,fastSP,A,B,b,wLat);
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
  (()=>{for(const b of S.biz){if(!BIZ_T[b.type].l2)continue;
    // An SD-WAN is hub-and-spoke: one circuit from the first site to each of the others.
    const pairs=b.sites?b.sites.slice(1).map(x=>[b.sites[0],x]):[[b.city,b.city2]];let minF=1,maxLat=0,tot=0,noPath=false;
    for(let [A,B] of pairs){let amt=0;
    // A circuit to a POP that reaches the backbone only by its own backhaul starts there (only its paths cross that edge).
    if(PX&&PX.bh.length&&SPD[B]&&!(SPD[A]&&SPD[A][CIDX[B]]<Infinity))[A,B]=[B,A];
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
    if((b.reqs||[]).includes('diverse')){const k=b.city+'>'+b.city2;R2.div[b.id]=divMemo[k]??(divMemo[k]=disjointI(b.city,b.city2));}}})();
  /* Floods ride the backbone ahead of everyone's traffic (25-ddos-flood.js). haul: up to g from city A to POP B over the
     shortest path, as far as links and routers have room. What a scrubbing center sends back is the target's own clean
     traffic, counted apart from the junk (#289). */
  const msOf=(A,B)=>{const Bi=CIDX[B],Ai=CIDX[A];return SPD[B]&&SPD[B][Ai]<Infinity?walkI(SPP[B],Bi,Ai).path.reduce((n,e)=>n+e.lat,0):0;};
  let JK=0;const haul=(A,B,g,ek,from,clean)=>{if(!(g>0))return 0;const Ai=CIDX[A],Bi=CIDX[B];if(!SPD[B]||!(SPD[B][Ai]<Infinity))return 0;
    const {path,ni}=walkI(SPP[B],Bi,Ai);let amt=g;for(const l of path)amt=Math.min(amt,l.res);for(const i of ni)if(HAS[i])amt=Math.min(amt,NRES[i]);amt=Math.max(0,amt);if(amt<=1e-9)return 0;
    if(!R2.egDesc[ek])R2.egDesc[ek]={lab:clean?labOf(N_('compute.scrubbed_traffic_from_city'),'city',CITY[A].name):labOf(N_('compute.attack_entering_in_city'),'city',CITY[from].name),city:B,k:'l2'};
    for(const i of ni)if(HAS[i])nodeTake(i,amt);for(const l of path){l.res-=amt;l.ld+=amt;if(!clean){l.jk=(l.jk||0)+amt;JK=1;}carry(l,ek,clean?NN+2:NN,Bi,amt);}return amt;};
  const DD=ddosLoad({E,okBy,R2,autoBh:!!(TRX&&TRX.blackhole),haul,ms:msOf});
  const TE=!!(S.te&&S.te.on)&&coreTE(),TR=TE?teRules():null,REACH=coreTeReach();R2.teMoved=0;const teCache=new Map(),SPILL=TR&&TR.spill?TR.spill:1,TT=TR&&TR.tiers.length?TR.tiers:null;
  /* A network in a peer's customer cone, reached through that peer (#85): after every network you peer with directly
     (its AS path is one hop longer) and before transit. */
  const base=(e,n)=>e.pref==='low'?4:e.rank>0&&e.rank<3&&coneOf(e,n)?CONE_RANK:e.rank;
  // LOCAL_PREF on an upstream moves it ahead of or behind the other transits, never ahead of peering (#96).
  const eff=(e,n)=>{let r=base(e,n);if(TR){if(e.k==='t'&&TR.up[e.net])r=TR.up[e.net]==='prefer'?2.9:3.5;if(e.prep)r=4.4;if(e.k!=='c'&&TR.drain.has(e.city))r=4.6;const o=TR.net[n];if(o){if(o.prefer===e.k)r=0.5;else if(o.avoid===e.k)r=4.5;}}return r;};
  // A carrier's own port for traffic bound for it or for its customers (25-direct-egress.js): tried before plain transit, but
  // never over RouteScript or a port set to backup, which keep the say they had, and not from a POP with a Prefer-marked
  // transit port (PREFC), where Prefer keeps it. Such a port is also an ordinary transit exit (rank 3), so POPs without one of
  // its own can still use it. DSEL: for each direct rank, the networks that have an exit there.
  const DIR=directSetup(E,NC),PREFC=DIR.prefc,dirOf=DIR.dirOf,DSEL=new Map();
  const RANKS=TR?[0,0.5,1,2,CONE_RANK,2.9,2.92,2.93,2.94,2.95,3,3.5,4,4.4,4.5,4.6]:[0,1,2,CONE_RANK,2.92,2.93,2.94,2.95,3,4];
  // With `protect customers`, business flows take every rank first; home users get what is left.
  // Passes by FBZ: 0 every flow, 1 business only, 2 the rest.
  const PASSES=TR&&TR.protect?[1,2]:[0];
  // Each network's exits by the rank they route at (RouteScript can move an exit per network), in E's order.
  // Each list also knows whether it holds a preferred exit (hi) and its exits by city (at), in list order.
  // With several islands (POPs no backbone joins), each list is split by island: a flow only scans exits it can reach.
  // Networks with the same exits at a rank share one list (LIST, by content), so what one flow learns serves them all.
  // A kept build (XC) gives the same lists, made fresh for today's exits.
  const LIST=new Map(),idx=exIdx,byRank={},BRJ=[],RSET=new Set();if(XC)rcExitLists(XC,E,BRJ,DSEL,RSET);else(()=>{for(let j=0;j<NET_IDS.length;j++){const id=NET_IDS[j],m=BRJ[j]=byRank[id]={},dm=dirOf(id);for(const e of okBy[id]){const r=TR?eff(e,id):base(e,id);RSET.add(r);(m[r]||(m[r]=[])).push(e);
      if(dm&&r===3&&e.k==='t'){const t=dm.get(e.net);if(t){const d=DIRECT_RANK[t][e.carry?0:1];let ds=DSEL.get(d);if(!ds)DSEL.set(d,ds=new Uint8Array(NET_IDS.length));ds[j]=1;RSET.add(d);(m[d]||(m[d]=[])).push(e);}}}
    for(const r in m){const L=m[r],key=L.map(e=>e.xi).join(','),o=LIST.get(key);if(o){m[r]=o;continue;}
      let V=L;if(NCOMP>1){const cs=[];for(const e of L){const k=COMP[e.ci];if(k>=0)(cs[k]||(cs[k]=[])).push(e);}for(const s of cs)if(s)idx(s);V={cs};}else idx(L);LIST.set(key,V);m[r]=V;}}
    if(RCH)rcExitKeep(XK,E,okBy,RCH,LIST,BRJ,DSEL,RSET,BHK);})();
  /* What each kind of exit served, in all (EGT) and per network (NEA, by network index and kind): numbers in typed arrays,
     where a sum by key would box every new value. EGO and NEO keep the order each first got traffic, which is the order
     R.egT and R.netEg list them in; both are written back after routing. NEG: each network's R.netEg record. */
  const EGT=new Float64Array(4),EGO=[],NEA=new Float64Array(NN*4),NEO=[],NEG=[];
  ROUTE.run({E,HAS,PASS,R2,FREM,FNJ,FCI,FCA,FBZ,NF,CNB,NCN,ev,day,SRV,TNS,NN,TNK,TORD,TNA,snd,LATP,FARL,EGT,EGO,NEG,NEO,NEA,FGT,FTI,FGI,FII,FGH,FGP,
    TE,SPILL,TT,teCache,adj,CORE,OUT,REACH,DSEL,PREFC,BRJ,COMP,SDi,SPi,ALONE,TR,base,eff},PASSES,RANKS,RSET);
  for(const i of NORD)R2.nodeLoad[CITIES[i].id]=NLOAD[i];
  for(const k of EGO)R2.egT[EXK[k]]=EGT[k];for(const j of NEO){const ne=NEG[j];for(let k=0;k<4;k++)ne[EXK[k]]=NEA[j*4+k];}
  (()=>{
  if(DD){let rem=0,jf=0;for(let i=0;i<NF;i++)if(FREM[i]>1e-6)rem+=FREM[i];if(JK)for(const k in edges){const e=edges[k];if(e.res<=1e-6&&e.jk)jf+=e.jk;}
    ddosAfter(DD,{E,R2,squeeze:Math.min(rem,jf),
      lost:(ci,x,y,e)=>{SRV[ci]-=x;R2.served-=x;const c=CITIES[ci].id;if(y)R2.bizSrv[c]-=y;R2.egT[e.k]-=x;if(e.rank<=2)R2.peered-=x;}});}
  for(const c of Object.keys(S.pops)){const i=CIDX[c];R2.citySrv[c]=SRV[i];
    if(LATP[i]>0&&SRV[i]>0)R2.latF[c]=clamp(1-LATP[i]/SRV[i],0,1);}
  // Each city's slowest big exit: (path, source, exit) triples, one per path that went far, in the order they first did.
  {const G=new Map();for(let k=0;k<FARL.length;k+=3){const P=FARL[k],src=FARL[k+1],to=FARL[k+2],key=src*NC+to,o=G.get(key);if(o){o.g+=P.fg;o.ms=Math.max(o.ms,2*P.ms);}else G.set(key,{src,to,g:P.fg,ms:2*P.ms});}
   for(const o of G.values()){const c=CITIES[o.src].id,cur=R2.latFar[c];if(!cur||o.g>cur.g)R2.latFar[c]={to:CITIES[o.to].id,g:o.g,ms:o.ms,share:SRV[o.src]>0?o.g/SRV[o.src]:0};}}
  // R.ef is read for the link you inspect: each edge's record is put together the first time it is asked for. Scenic
  // routing only needs the egress amounts, so R.efg keeps those as they are (not listed, so R reads the same).
  efBuild(R2,EL.map(l=>[l.id,l.i,l.tr]),ACN,ACD,NKN,NC,NN);
  // Active links fill first, by capacity; standby links take what is left over.
  for(const k in edges){const e=edges[k],ld=e.ld||0,ac=e.cap-e.scap,a=Math.min(ld,ac),sp=ld-a;for(const l of e.links){const c=capOf(l);R2.load[l.id]=l.standby?(e.scap>0?sp*c/e.scap:0):(ac>0?a*c/ac:0);}}
  for(const e of TORD){const m=R2.tNet[e.id]={},b=e.ts*NN;for(const j of TNK[e.ts])m[NET_IDS[j]]=TNA[b+j];}
  R2.peerShare=R2.served>0?R2.peered/R2.served:0;
  for(const e of E){if(e.k==='t')R2.useT[e.id]=(R2.useT[e.id]||0)+e.used;else if(e.k==='ix')R2.useIx[e.id]=e.used;else if(e.k==='p')R2.usePni[e.id]=e.used;else R2.useCache[e.id]=e.used;}})();
  computeMoney(R2,PX);
  // R.fl: from this call's own columns, made into objects only when something asks.
  flDefine(R2,{NF,FREM,FCI,FNJ,FCA,FBZ,FGT,FGI,FGP,FGH,FTI,FII,E,CNB,NCN});
  R=R2;UI.hotMap=hotByCity();
}
// What the network costs and earns per month, from what compute() routed.
function computeMoney(R2,PX=null){
  const C=R2.cost,V=R2.rev,pm=S.priceMul;
  C.pops=Object.entries(S.pops).reduce((a,[c,p])=>a+popMo(c)+((p.routers||1)-1)*ROUTER_MO+cageMo(p.routers)+(p.routers||1)*RG[p.rgen||0].mo+(p.gen?GEN_MO:0),0);
  C.optical=S.links.filter(l=>l.kind==='df').reduce((a,l)=>a+(l.ready>S.day?0:ampCount(l.km)*AMP_MO*(l.own&&isRdm(l.sys)&&!l.sub?Math.max(1,l.pairs|0):1)+(l.regen|0)*REGEN_MO)+(l.spares?Math.round(150+(l.ch||[]).length*80):0),0);
  C.links=S.links.reduce((a,l)=>a+(l.mo||0),0);
  C.nni=(S.nni||[]).reduce((a,x)=>a+nniMo(x),0);
  const htd=histToday();C.transit=S.transit.reduce((a,t)=>{const q=p95(t,R2.useT[t.id]||0,htd);R2.p95[t.id]=q;return a+transitMo(t,q);},0);
  C.ix=Object.keys(S.ixp).reduce((a,c)=>a+ixMo(c),0);
  C.pni=S.pni.reduce((a,p)=>a+pniMo(p,R2.usePni[p.id]||0),0);
  C.caches=cachesMo();
  C.loans=(S.loans||[]).reduce((a,l)=>a+(BANKS[l.bank].equity?0:l.model==='transit'?Math.round((C.transit||0)*(l.cut||0.3)):l.pay)+loanFees(l),0);
  C.extras=(S.cnLic&&S.cnLic.state==='ok'?CN_JV_MO:0)+scrubMo()+Object.keys(S.pops).filter(ruCity).length*RU_BOX_MO+Object.values(S.pops).filter(p=>p.site2).length*SITE2_MO+(S.te?TE_MO:0)+(S.ops&&S.ops.intern?INTERN_MO:0)+salesMo();
  if(S.pie&&S.mode!=='sandbox')C.pie=pieMo();
  V.eyeballs=0;V.business=0;V.ix=0;
  C.wholesale=0;C.levy=0;const lev=scnRule('levy');for(const c in S.pops){const sf=sfOf(R2,c)*(R2.bbF[c]??1),v=R2.cityEye[c]*sf*EYE_RATE*arpuOf(c);V.eyeballs+=v;if(CITY[c].au){if(lev)C.levy+=v*AU_LEVY;else C.wholesale+=v*AU_WHOLESALE;}}
  const ids=linkIds();for(const b of S.biz){if(capPend(b)||BIZ_T[b.type].orbit)continue;const sf=BIZ_T[b.type].fiber?(fiberOk(b,ids)?1:0):BIZ_T[b.type].l2?clamp((R2.l2[b.id]||0)/b.bw,0,1):sfOf(R2,b.city)*(R2.tgtF[b.id]??1);V.business+=b.bw*b.rate*Math.min(1,sf/0.95);}
  for(const c in S.myIx)V.ix+=S.myIx[c].members.length*MYIX_FEE;
  if(PX)pieMoney(PX,R2,V);
  // The UK grant for Pitcairn, its satellite tier once orbit is known; the Rural Digital Pie Fund (99-pie-subsidies.js).
  {const on=grantOn(R2),sky=!on&&!!PX&&grantSky(R2);V.grant=on?GRANT_MO:sky?GRANT_SKY_MO:0;if(PX)V.gov=pieGovMo();if(PX)R2.pie.gov={rdf:V.gov||0,sky:sky?GRANT_SKY_MO:0};}
  C.revshare=(S.loans||[]).reduce((a,l)=>a+(BANKS[l.bank].equity||l.bal>0?l.share||0:0),0)*(V.eyeballs+V.business+V.ix+(V.orbit||0));
  R2.costMo=Object.values(C).reduce((a,b)=>a+b,0);
  R2.revMo=V.eyeballs+V.business+V.ix+V.grant+(V.gov||0)+(V.orbit||0);
}
