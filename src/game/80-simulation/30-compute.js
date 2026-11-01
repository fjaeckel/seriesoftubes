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
      for(const j of t.n)rec.net[j<NN?NETS[j].id:j===NN?'junk':'l2vpn']=ACN[i*NKN+j];for(const ci of t.d)rec.dst[CITIES[ci].id]=ACD[i*NC+ci];}return rec;}});}
  Object.defineProperty(R2,'efg',{value:efg});Object.defineProperty(R2,'efp',{value:{L,ACN,ACD,NKN,NC,NN}});}
// R.fl: the flows as objects, made only when something asks (38-pni-value.js). E: the exits FTI and FII point into.
function flDefine(R2,c){const {NF,FREM,FCI,FNJ,FCA,FBZ,FGT,FGI,FGP,FGH,FTI,FII,E,CNB,NCN}=c;let fl=null;Object.defineProperty(R2,'flc',{value:c});
  Object.defineProperty(R2,'fl',{get(){if(!fl){fl=new Array(NF);for(let i=0;i<NF;i++){const ci=FCI[i],j=FNJ[i];
    fl[i]={c:CITIES[ci].id,n:NET_IDS[j],rem:FREM[i],cache:FCA[i]===1,junk:false,bz:FBZ[i]===1,ci,cn:CNB[ci],ncn:NCN[j],nj:j,nr:j,gt:FGT[i],gi:FGI[i],gp:FGP[i],gh:FGH[i],ti:FTI[i]<0?null:E[FTI[i]].id,ii:FII[i]<0?null:E[FII[i]].id};}}return fl;}});}
/* Every exit has the same fields in the same order, whatever its kind, so the routing loop reads them from one object shape
   (exits of six shapes made each property read there a slow lookup). */
function mkEx(k,id,city,cap,rank,pref,lab,ok,nets,net){return {k,net,id,city,lab,cap,used:0,rank,pref,ok,nets,dir:null,clean:false,prem:false,carry:false,prep:false,sac:false,pnc:false,
  ek:'',J:0,byC:null,desc:null,dup:false,told:false,hp:1,ci:0,cn:false,vis:0,ts:-1,xi:0,kx:EXK.indexOf(k),fac:undefined};}
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
    {SPD,SPP,SDi,SPi,ALONE,COMP,NCOMP}=rcGraph(GK,pops,adj,EA,NC,wW);
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
    const x=mkEx('p',p.id,p.city,liveCap(pniG(p),p.city,p.site,p.n)*lagF(p)*(p.sacrif?0.5:1),1,p.pref||'normal',labOf(N_('common.pni_with_net'),'net',NET[p.net].name),n=>CONE_S[p.net].has(n),CONE[p.net],p.net);x.sac=!!p.sacrif;x.pnc=!!NET[p.net].cn;E.push(x);}
  for(const c of S.caches){if(!popUp(c.city)||siteDown(c.city,c.site==='b'?'b':'a'))continue;E.push(mkEx('c',c.id,c.city,cacheG(c),0,'normal',labOf(N_('common.name_cache'),'name',NET[c.net].cache.name),n=>n===c.net,[c.net]));}
  // After an update adds networks, a free courtesy route reaches the new ones you have no other way to (#46).
  R2.graceNets=0;if(S.grace&&S.grace.until>day){const gs=new Set(S.grace.nets.filter(n=>NET[n]&&!E.some(e=>e.k!=='c'&&e.ok(n)))),hc=popUp(S.home)?S.home:pops.find(popUp);
    R2.graceNets=gs.size;if(gs.size&&hc)E.push(mkEx('ix','~grace',hc,1e9,2,'normal',tr('compute.courtesy_route_to_new_networks'),n=>gs.has(n),gs));}
  return E;})();
  const rp=ev.rpki&&ev.rpki.until>day?new Set(ev.rpki.nets):null;if(rp)for(const e of E){if(e.k==='c')continue;const o=e.ok;e.ok=n=>!rp.has(n)&&o(n);}
  // Who reaches whom and each network's exit lists, kept while the exits are the same (XC, 29-route-cache.js).
  const XK=RCON?rcExitKey(GK,E,(depeer?1:0)+'|'+leak+'|'+(snd?1:0)+'|'+(rp?ev.rpki.nets.join(','):'')+'|'+(TRX?S.te.script:'')):null,XC=XK!==null&&RC.xk===XK?RC.x:null;
  // coneOf: does exit e reach network n only through a peer's customer cone (#85)?
  const coneOf=(e,n)=>e.k==='p'?e.net!==n:!!e.dir&&!e.dir.has(n);
  // ok() cannot change during one compute, so ask each exit once per network, not once per flow and rank.
  // okBy[net] lists the exits that reach it in E's order, like E.filter(e=>e.ok(net)).
  const okBy=XC?rcOkBy(XC,E):{};if(!XC)for(const id of NET_IDS)okBy[id]=[];
  const okAdd=(e,n)=>{const L=okBy[n];if(L&&L[L.length-1]!==e&&e.ok(n))L.push(e);};
  // TSL: a slot per transit port id, for what it carries to each network (R.tNet, added up in TNA).
  const ekN={},TSL=new Map();(()=>{for(const e of E){e.ek=e.k+':'+e.id;ekN[e.ek]=(ekN[e.ek]||0)+1;}
  // dup: shares its key with another exit (a hand-edited save), so R.egDesc shows whichever pushed last.
  for(let i=0;i<E.length;i++){const e=E[i];e.xi=i;e.J=0;e.byC=null;e.desc=null;e.dup=ekN[e.ek]>1;e.told=false;e.hp=e.pref==='high'?0:1;e.ci=CIDX[e.city];e.cn=cnCity(e.city);e.vis=0;e.ts=-1;if(e.k==='t'){let t=TSL.get(e.id);if(t===undefined)TSL.set(e.id,t=TSL.size);e.ts=t;}
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
  const bizBw={};for(const b of S.biz){const T=BIZ_T[b.type];if(!T.l2&&!T.fiber&&(!T.event||eventLive(b))){const v=bizBw[b.city];bizBw[b.city]=(v===undefined?0:v)+b.bw;}}
  // Traffic shares by network index, and their sums, for each share table (and with Russia's throttle).
  const shArr=new Map(),shSum=new Map(),DEMTO=new Float64Array(NN),loc=scnRule('local');
  (()=>{for(const c of Object.keys(S.pops)){
    const p=S.pops[c],ci=CIDX[c],cn=cnCity(c),SH=cn?NSH_CN:ruCity(c)?NSH_RU:CITY[c].kr&&S.krExit?NSH_KRX:NSH;const eye=(p.bb?p.bb.d:0)*viral*(cn&&ev.golden>day?1.4:1);const biz=bizBw[c]??0;const d0=eye+biz;
    // Goggle video is throttled in Russia (#70): people there get half of it, so they ask for half. It is not
    // traffic you failed to deliver, and it does not cross your links only to be thrown away.
    const ru=ruCity(c),thr=n=>n==='ggl'&&ru?0.5:1;let sa=shArr.get(SH),sm=shSum.get(SH);if(!sa){shArr.set(SH,sa=NETS.map(n=>SH[n.id]||0));shSum.set(SH,sm=[]);}
    const tt=sm[+ru]||(sm[+ru]=[NETS.reduce((t,n,j)=>t+sa[j]*thr(n.id),0),NETS.reduce((t,n,j)=>t+sa[j],0)]),lf=loc?NETS.reduce((t,n,j)=>t+(R2.reachable[n.id]?sa[j]*thr(n.id):0),0)/(tt[0]||1):1,d=d0*tt[0]/(tt[1]||1)*lf;
    R2.cityEye[c]=eye;R2.cityDem[c]=d;R2.citySrv[c]=0;R2.demand+=d;
    for(let j=0;j<NN;j++)DEMTO[j]=(DEMTO[j]||0)+d0*sa[j]*thr(NETS[j].id);
    if(!popUp(c))continue;CNB[ci]=cn;
    R2.cityBlocked=R2.cityBlocked||{};
    const mtuH=ev.pmtud&&ev.pmtud.until>day?ev.pmtud:null,kr=CITY[c].kr;
    for(let j=0;j<NN;j++){const n=NETS[j],a=(loc&&!R2.reachable[n.id]?0:d0)*sa[j]*thr(n.id)*(mtuH&&mtuH.net===n.id?mtuH.f:1)*(kr&&ev.krroute>day&&n.id==='fbk'?0.8:1);if(a<=0)continue;
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
     arrays by network (then 'junk' and 'l2vpn') and by source city, each key in the order it first got traffic. */
  const LATP=new Float64Array(NC),FARL=[],NRES=new Float64Array(NC),HAS=new Uint8Array(NC),NLOAD=new Float64Array(NC),NSEEN=new Uint8Array(NC),NORD=[],SRV=new Float64Array(NC),PASS=new Float64Array(NC).fill(1),OUT=new Uint8Array(NC);
  for(const k in edges)edges[k].res=edges[k].cap;for(const c of pops){const i=CIDX[c];NRES[i]=nodeCap(c);HAS[i]=1;R2.nodeCap[c]=NRES[i];}
  // The core (backbone technology): what passing-through traffic costs each router, and which POPs TE must avoid.
  const CORE=coreOn()&&S.core.run>=1;if(CORE)for(const c of pops){const i=CIDX[c];PASS[i]=corePass(c);OUT[i]=inCore(c)?0:1;}
  const nodeTake=(i,a)=>{NRES[i]-=a;if(!NSEEN[i]){NSEEN[i]=1;NORD.push(i);}NLOAD[i]=(NLOAD[i]||0)+a;};
  const TNA=new Float64Array(TSL.size*NN),TNS=new Uint8Array(TSL.size*NN),TNK=[],TORD=[];
  const NKN=NN+2,ACN=new Float64Array(NE*NKN),SEN=new Uint8Array(NE*NKN),ACD=new Float64Array(NE*NC),SED=new Uint8Array(NE*NC),EL=[];
  // t.g gives each egress a slot in t.v, so adding to it allocates nothing (a Map of numbers boxes every new sum).
  const carry=(l,eg,nr,ci,a)=>{let t=l.tr;if(!t){t=l.tr={g:new Map(),v:[],n:[],d:[]};EL.push(l);}const s=t.g.get(eg);if(s===undefined){t.g.set(eg,t.v.length);t.v.push(0+a);}else t.v[s]+=a;
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
  (()=>{for(const b of S.biz){if(!BIZ_T[b.type].l2)continue;
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
    if((b.reqs||[]).includes('diverse')){const k=b.city+'>'+b.city2;R2.div[b.id]=divMemo[k]??(divMemo[k]=disjointI(b.city,b.city2));}}})();
  /* Floods ride the backbone ahead of everyone's traffic (25-ddos-flood.js). haul: up to g from city A to POP B over the
     shortest path, as far as links and routers have room. */
  const msOf=(A,B)=>{const Bi=CIDX[B],Ai=CIDX[A];return SPD[B]&&SPD[B][Ai]<Infinity?walkI(SPP[B],Bi,Ai).path.reduce((n,e)=>n+e.lat,0):0;};
  let JK=0;const haul=(A,B,g,ek,from,clean)=>{if(!(g>0))return 0;const Ai=CIDX[A],Bi=CIDX[B];if(!SPD[B]||!(SPD[B][Ai]<Infinity))return 0;
    const {path,ni}=walkI(SPP[B],Bi,Ai);let amt=g;for(const l of path)amt=Math.min(amt,l.res);for(const i of ni)if(HAS[i])amt=Math.min(amt,NRES[i]);amt=Math.max(0,amt);if(amt<=1e-9)return 0;
    if(!R2.egDesc[ek])R2.egDesc[ek]={lab:clean?labOf(N_('compute.scrubbed_traffic_from_city'),'city',CITY[A].name):labOf(N_('compute.attack_entering_in_city'),'city',CITY[from].name),city:B,k:'l2'};
    for(const i of ni)if(HAS[i])nodeTake(i,amt);for(const l of path){l.res-=amt;l.ld+=amt;if(!clean){l.jk=(l.jk||0)+amt;JK=1;}carry(l,ek,NN,Bi,amt);}return amt;};
  const DD=ddosLoad({E,okBy,R2,autoBh:!!(TRX&&TRX.blackhole),haul,ms:msOf});
  const TE=!!(S.te&&S.te.on)&&coreTE(),TR=TE?teRules():null,REACH=coreTeReach();R2.teMoved=0;const teCache=new Map(),SPILL=TR&&TR.spill?TR.spill:1;
  const altPath=(src,dst,base)=>{const key=src*NC+dst,c0=teCache.get(key);
    if(c0===false)return null;if(c0&&c0.path.every(l=>l.res>1e-3)&&c0.ni.every(i=>!HAS[i]||NRES[i]>1e-3))return c0;
    const {D,P}=dijkstra(adj,src,wW,(v,e)=>e.res<=1e-3||(HAS[v]&&NRES[v]<=1e-3)||(CORE&&OUT[v]&&v!==dst),dst);
    if(D[dst]===Infinity||D[dst]>REACH*base+60){teCache.set(key,false);return null;}
    const Q=walkP(P,src,dst);teCache.set(key,Q);return Q;};
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
    if(RCH)rcExitKeep(XK,E,okBy,RCH,LIST,BRJ,DSEL,RSET);})();
  // The flow being routed, and from its POP: distances, arriving edges and the paths walked so far, by city index.
  // F: its index; fci, fnj: its city and network index.
  let F=0,fci=0,fnj=0,Dv=null,Pv=null,PP=null,vis=0;const walked=[],G=[],REST=[],NEG=[];let GN=0;
  /* What each kind of exit served, in all (EGT) and per network (NEA, by network index and kind): numbers in typed arrays,
     where a sum by key would box every new value. EGO and NEO keep the order each first got traffic, which is the order
     R.egT and R.netEg list them in; both are written back after routing. */
  const EGT=new Float64Array(4),EGO=[],NEA=new Float64Array(NN*4),NEO=[];
  // An exit the flow can still try: not visited yet, not full when the flow started, reachable, and not on a saturated path.
  const usable=e=>e.vis!==vis&&e.used<e.cap&&Dv[e.ci]<Infinity&&!gone(e),byDist=(a,b)=>a.hp-b.hp||Dv[a.ci]-Dv[b.ci];
  // Push up to `want` along one path to exit e; returns what fitted. Index loops: for…of allocates an iterator until optimised. Capacity only shrinks while routing, so a
  // path with one full link or node fits nothing for the rest of this pass: mark it, and later tries cost nothing
  // (most tries are into paths that filled up earlier).
  const push=(e,P,want,keep=0)=>{if(P.dead)return 0;const path=P.path,ni=P.ni;let amt=want;
    const PN=path.length;for(let k=0;k<PN;k++){const l=path[k],r=l.res;if(r<=1e-6){P.dead=1;return 0;}amt=Math.min(amt,r-l.cap*keep);}
    const last=ni.length-1;
    for(let k=0;k<=last;k++){const i=ni[k];if(!HAS[i])continue;const r=NRES[i];if(r<=1e-6){P.dead=1;return 0;}const w=k&&k<last?PASS[i]:1;amt=Math.min(amt,r/w);}
    if(amt<=1e-6)return 0;
    for(let k=0;k<=last;k++){const i=ni[k];if(HAS[i])nodeTake(i,k&&k<last?amt*PASS[i]:amt);}
    const ek=e.ek,nr=fnj,ci=fci;if(!e.told||e.dup){R2.egDesc[ek]=e.desc||(e.desc={lab:e.lab,city:e.city,k:e.k});e.told=true;}
    for(let k=0;k<PN;k++){const l=path[k];l.res-=amt;l.ld+=amt;carry(l,ek,nr,ci,amt);}
    e.used+=amt;FREM[F]-=amt;
    {let ok=amt;const cf=CNB[ci],ce=e.cn,cn=NCN[nr],bz=FBZ[F]===1;
      if(cf!==ce||(cf&&!cn)||(!cf&&cn&&e.k==='t')){const prem=(e.k==='t'&&e.prem)||(e.k==='p'&&e.pnc)||path.some(x=>x.links&&x.links.some(y=>y.premium));const loss=prem?0.03:(ev.gfw>day?0.35:0.2);R2.gfwLost+=amt*loss;R2.gfwCross+=amt;ok=amt*(1-loss);}
      SRV[ci]+=ok;R2.served+=ok;if(bz)R2.bizSrv[CITIES[ci].id]+=ok;if(e.rank<=2)R2.peered+=ok;if(e.k==='t'){const k=e.ts*NN+nr;if(!TNS[k]){TNS[k]=1;if(!TNK[e.ts]){TNK[e.ts]=[];TORD.push(e);}TNK[e.ts].push(nr);}TNA[k]+=ok;}
        // Backhaul to transit: users notice the round trip to the exit. Up to 20 ms (about 1,500 km) is free, then
        // it gets worse, and past 50 ms broadband and internet services count as bad service (#…). Under sender pays,
        // Korean users notice any exit far away, transit or not, and much sooner.
        if(path.length&&(e.k==='t'||snd&&CITIES[ci].kr)){let ms=P.ms;if(ms<0){ms=0;for(let k=0;k<PN;k++)ms+=path[k].lat;P.ms=ms;}const rtt=2*ms,kl=snd&&CITIES[ci].kr;
          if(rtt>(kl?KR_LAT_OK:LAT_OK)){LATP[ci]+=ok*(kl?krLatLoss(rtt):latLoss(rtt));if(!P.fg){P.fg=0;FARL.push(P,ci,e.ci);}P.fg+=ok;}}const kx=e.kx;if(EGT[kx]===0&&!EGO.includes(kx))EGO.push(kx);EGT[kx]+=ok;if(!NEG[nr]){NEG[nr]=R2.netEg[NET_IDS[nr]]={c:0,p:0,ix:0,t:0};NEO.push(nr);}NEA[nr*4+kx]+=ok;
      // Where each flow left (the PNI list asks what a PNI here would take over, #175).
      if(e.J>0){const m=e.byC||(e.byC=new Map()),v=m.get(ci);if(v){v[0]+=ok;if(bz)v[1]+=ok;}else m.set(ci,[ok,bz?ok:0]);}
      if(e.k==='t'){FGT[F]+=ok;FTI[F]=e.xi;}else if(e.k==='ix'){FGI[F]+=ok;FII[F]=e.xi;}else if(e.k==='p'){if(e.ci===ci&&e.net===NET_IDS[nr])FGH[F]+=ok;else FGP[F]+=ok;}}
    return amt;
  };
  // Shortest path first. With Auto-TE, whatever does not fit spills onto up to two alternate paths
  // with free capacity, as long as they are no more than twice as long.
  const send=(e,want)=>{
    let room=Math.min(want,FREM[F],e.cap-e.used);if(room<=1e-6)return;
    const P=PP[e.ci]||(PP[e.ci]=walkP(Pv,fci,e.ci));if(!P.dead)room-=push(e,P,room,TE&&SPILL<1?1-SPILL:0);
    if(TE&&room>1e-6&&FREM[F]>1e-6&&e.used<e.cap&&e.ci!==fci)for(let k=0;k<2&&room>1e-6;k++){const P=altPath(fci,e.ci,Dv[e.ci]);if(!P)break;const m=push(e,P,Math.min(room,e.cap-e.used));if(m<=1e-6)break;room-=m;R2.teMoved+=m;}
  };
  // Exits with the same preference and the same IGP distance form an ECMP group: spread the flow over
  // them by free capacity (like several transits in one city), then top up in order if one fills.
  // The group is g[i0..i1): plain loops and one scratch array, since this runs for most flows (same sums, same order).
  // Without Auto-TE an exit whose path from here is full takes nothing: skip the call (and the numbers it boxes).
  const gone=e=>{if(TE)return false;const P=PP[e.ci];return !!P&&P.dead===1;};
  // Every exit of a remembered group still has room (a loop, not every(): no closure per flow). NOG: no group.
  const allRoom=c=>{for(let k=0;k<c.length;k++){const e=c[k];if(!(e.used<e.cap)||gone(e))return false;}return true;},NOG=[];
  const ROOM=[],sendGroup=(g,i0=0,i1=g.length)=>{for(let k=i0;k<i1;k++)g[k].vis=vis;
    if(i1-i0>1){let tot=0;for(let k=i0;k<i1;k++){const e=g[k],r=Math.max(0,e.cap-e.used);ROOM[k-i0]=r;tot+=r;}const want=FREM[F];if(tot>1e-6)for(let k=i0;k<i1;k++)if(!gone(g[k]))send(g[k],want*ROOM[k-i0]/tot);}
    for(let k=i0;k<i1;k++){if(FREM[F]<=1e-6)break;if(!gone(g[k]))send(g[k],FREM[F]);}};
  // Stable, in place: short lists by insertion (no garbage), long ones by the built-in sort. Both are stable with the
  // same comparison, so the order is the same either way.
  // n: sort only a[0..n) (the group G holds GN exits).
  const sortD=(a,n=a.length)=>{if(n>24){if(n===a.length)a.sort(byDist);else{const t=a.slice(0,n).sort(byDist);for(let i=0;i<n;i++)a[i]=t[i];}return;}for(let i=1;i<n;i++){const x=a[i];let j=i-1;while(j>=0&&byDist(a[j],x)>0){a[j+1]=a[j];j--;}a[j+1]=x;}};
  // The direct ranks (25-direct-egress.js) have short lists, one carrier's ports, so they take the plain way: the usable exits
  // nearest first, tried in groups of equal distance, as the reference loop in the tests does. A direct rank only concerns the
  // networks that have an exit there, and nothing from a POP where Prefer has the say; a port that is not set to carry only takes
  // its own POP's traffic. Kept in a function of its own so the loop below stays as it was: the JIT is sensitive to its shape.
  const directPass=(rank,pass)=>{const DS=DSEL.get(rank),LOC=rank===DIRECT_RANK[1][1]||rank===DIRECT_RANK[2][1];
    for(F=0;F<NF;F++){fnj=FNJ[F];fci=FCI[F];
      if(FREM[F]<=1e-6||DS[fnj]===0||PREFC[fci]===1||(pass!==0&&FBZ[F]!==(pass===1?1:0)))continue;
      let lst=BRJ[fnj][rank];if(!lst)continue;if(lst.cs){lst=lst.cs[COMP[fci]];if(!lst)continue;}
      Dv=SDi[fci];Pv=SPi[fci];PP=walked[fci]||(walked[fci]=[]);vis++;
      REST.length=0;
      if(LOC){const here=lst.at.get(fci);if(!here)continue;for(let h=0;h<here.length;h++)if(usable(here[h]))REST.push(here[h]);}
      else for(let li=0;li<lst.length;li++)if(usable(lst[li]))REST.push(lst[li]);
      sortD(REST);
      for(let i=0;i<REST.length&&FREM[F]>1e-6;){let j=i+1;while(j<REST.length&&REST[j].hp===REST[i].hp&&Math.abs(Dv[REST[j].ci]-Dv[REST[i].ci])<1e-6)j++;sendGroup(REST,i,j);i=j;}}};
  /* One rank of one pass over every flow. Each hot loop of compute() sits in a function of its own: V8 optimises a small
     function quickly and keeps it, while compute() as a whole is too big to optimise cheaply (it would run unoptimised,
     boxing every number, and be compiled again and again in the background). The tables of a flow's city (distances,
     paths) are set up only once it has an exit list at this rank. */
  const rankPass=(rank,pass)=>{
    for(F=0;F<NF;F++){
      if(FREM[F]<=1e-6||(rank===0&&FCA[F]===0)||(pass!==0&&FBZ[F]!==(pass===1?1:0)))continue;
      fnj=FNJ[F];let lst=BRJ[fnj][rank];if(!lst)continue;fci=FCI[F];if(lst.cs){lst=lst.cs[COMP[fci]];if(!lst)continue;}
      Dv=SDi[fci];Pv=SPi[fci];PP=walked[fci]||(walked[fci]=[]);vis++;
      /* Groups are tried nearest first, preferred exits before the rest, in the order a stable sort of the usable
         exits gives. Exits only fill up once tried, so the usable ones stay the same until then. Nearly every flow
         fits in its first group: find that one with a scan (nothing is visited yet), and sort only what is left
         when it does not fit. Most often the group is the POP's own exits: with no preferred exit on the list
         and no other city at distance 0, the usable ones here are exactly the first group, already in order.
         The group is G[0..GN): emptying an array (length=0) gives back its storage, and the next push allocates it again. */
      GN=0;
      if(!lst.hi&&ALONE[fci]){const here=lst.at.get(fci);if(here)for(let h=0;h<here.length;h++){const e=here[h];if(e.used<e.cap&&!gone(e))G[GN++]=e;}}
      if(!GN){
        // One scan: the best (preference, distance) so far and, in list order, the exits within 1e-6 of it. The best
        // distance only goes down, so dropping the ones it leaves behind gives exactly the exits a second scan would.
        // Exits that are full stay full for this pass: when a quarter of a list is, it is rewritten without them.
        /* gc[ci]: the first group this list gave a flow from city ci. Exits only fill up during routing, so while all of
           them still have room no other exit can have become better, and the scan would find the same group (an
           empty one, no usable exit, stays empty). */
        const gc=lst.gc||(lst.gc=[]),c=gc[fci];
        if(c!==undefined&&allRoom(c)){if(!c.length)continue;for(let k=0;k<c.length;k++)G[GN++]=c[k];}else{
        let bh=2,bd=Infinity,full=0;
        for(let li=0,LN=lst.length;li<LN;li++){const e=lst[li];if(e.used>=e.cap||gone(e)){full++;continue;}const d=Dv[e.ci];if(d===Infinity)continue;const h=e.hp;
          if(h<bh){bh=h;bd=d;GN=0;G[GN++]=e;}
          else if(h===bh){if(d<bd){bd=d;let k=0;for(let gi=0;gi<GN;gi++){const x=G[gi];if(Dv[x.ci]-d<1e-6)G[k++]=x;}GN=k;G[GN++]=e;}else if(d-bd<1e-6)G[GN++]=e;}}
        if(full*4>=lst.length&&full){let k=0;for(let li=0;li<lst.length;li++){const e=lst[li];if(e.used<e.cap)lst[k++]=e;}lst.length=k;}
        if(bh>1){gc[fci]=NOG;continue;}
        if(GN>1)sortD(G,GN);gc[fci]=G.slice(0,GN);}}
      sendGroup(G,0,GN);
      if(FREM[F]<=1e-6)continue;
      REST.length=0;for(let li=0;li<lst.length;li++)if(usable(lst[li]))REST.push(lst[li]);sortD(REST);
      for(let i=0;i<REST.length&&FREM[F]>1e-6;){
        let j=i+1;while(j<REST.length&&REST[j].hp===REST[i].hp&&Math.abs(Dv[REST[j].ci]-Dv[REST[i].ci])<1e-6)j++;
        sendGroup(REST,i,j);i=j;
      }
    }};
  for(const pass of PASSES)for(const rank of RANKS){
    if(!RSET.has(rank))continue;
    if(DSEL.has(rank)){directPass(rank,pass);continue;}
    rankPass(rank,pass);
  }
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
  computeMoney(R2);
  // R.fl: from this call's own columns, made into objects only when something asks.
  flDefine(R2,{NF,FREM,FCI,FNJ,FCA,FBZ,FGT,FGI,FGP,FGH,FTI,FII,E,CNB,NCN});
  R=R2;UI.hotMap=hotByCity();
}
// What the network costs and earns per month, from what compute() routed.
function computeMoney(R2){
  const C=R2.cost,V=R2.rev,pm=S.priceMul;
  C.pops=Object.entries(S.pops).reduce((a,[c,p])=>a+popMo(c)+((p.routers||1)-1)*ROUTER_MO+cageMo(p.routers)+(p.routers||1)*RG[p.rgen||0].mo+(p.gen?GEN_MO:0),0);
  C.optical=S.links.filter(l=>l.kind==='df').reduce((a,l)=>a+(l.ready>S.day?0:ampCount(l.km)*AMP_MO*(l.own&&isRdm(l.sys)&&!l.sub?Math.max(1,l.pairs|0):1)+(l.regen|0)*REGEN_MO)+(l.spares?Math.round(150+(l.ch||[]).length*80):0),0);
  C.links=S.links.reduce((a,l)=>a+(l.mo||0),0);
  C.nni=(S.nni||[]).reduce((a,x)=>a+NNI[x.tier].mo,0);
  const htd=histToday();C.transit=S.transit.reduce((a,t)=>{const q=p95(t,R2.useT[t.id]||0,htd);R2.p95[t.id]=q;return a+transitMo(t,q);},0);
  C.ix=Object.keys(S.ixp).reduce((a,c)=>a+ixMo(c),0);
  C.pni=S.pni.reduce((a,p)=>a+pniMo(p,R2.usePni[p.id]||0),0);
  C.caches=cachesMo();
  C.loans=(S.loans||[]).reduce((a,l)=>a+(BANKS[l.bank].equity?0:l.model==='transit'?Math.round((C.transit||0)*(l.cut||0.3)):l.pay)+loanFees(l),0);
  C.extras=(S.cnLic&&S.cnLic.state==='ok'?CN_JV_MO:0)+scrubMo()+Object.keys(S.pops).filter(ruCity).length*RU_BOX_MO+Object.values(S.pops).filter(p=>p.site2).length*SITE2_MO+(S.te?TE_MO:0)+(S.ops&&S.ops.intern?INTERN_MO:0);
  V.eyeballs=0;V.business=0;V.ix=0;V.grant=grantOn(R2)?GRANT_MO:0;
  C.wholesale=0;C.levy=0;const lev=scnRule('levy');for(const c in S.pops){const sf=sfOf(R2,c)*(R2.bbF[c]??1),v=R2.cityEye[c]*sf*EYE_RATE*arpuOf(c);V.eyeballs+=v;if(CITY[c].au){if(lev)C.levy+=v*AU_LEVY;else C.wholesale+=v*AU_WHOLESALE;}}
  const ids=linkIds();for(const b of S.biz){if(capPend(b))continue;const sf=BIZ_T[b.type].fiber?(fiberOk(b,ids)?1:0):BIZ_T[b.type].l2?clamp((R2.l2[b.id]||0)/b.bw,0,1):sfOf(R2,b.city)*(R2.tgtF[b.id]??1);V.business+=b.bw*b.rate*Math.min(1,sf/0.95);}
  for(const c in S.myIx)V.ix+=S.myIx[c].members.length*MYIX_FEE;
  C.revshare=(S.loans||[]).reduce((a,l)=>a+(BANKS[l.bank].equity||l.bal>0?l.share||0:0),0)*(V.eyeballs+V.business+V.ix);
  R2.costMo=Object.values(C).reduce((a,b)=>a+b,0);
  R2.revMo=V.eyeballs+V.business+V.ix+V.grant;
}
