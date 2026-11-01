/* Reusing a day's routing (prototype). Demand grows a little every day, but on most days nothing else that routing
   depends on changes. Then the last full compute()'s placement (each push of a flow onto a path to an exit) is scaled to
   today's demand per city instead of routing every flow again. Any change to the network, an incident, an event or a
   DDoS changes the signature and routes in full; so does a base older than maxAge days, or a scaled load that no longer
   fits a link, router or exit that had room (one that was already full keeps its load: clamp). */
const REUSE={on:true,maxAge:7,clamp:true,maxLoss:0.005,maxK:0.1,sig:null,st:{fast:0,full:0,nobase:0,age:0,sig:0,dd:0,over:0,flows:0}};
let RB=null;
// Everything compute() reads besides demand: the network as saved (minus what only days, moods or bills use) and what
// the day makes of it (cuts, outages, events, ports coming up). Customers other than circuits only add to their city's
// demand, which the reuse scales, so they are left out: one cancelling does not force a full routing.
const SIG_SKIP=new Set(['hist','mood','pm','warned','warn60','slaFor','bb','boost','since','name','log','sla']);
function routeSig(){const day=S.day,raw=(k,v)=>SIG_SKIP.has(k)?undefined:v,evm=(k,v)=>typeof v==='number'?(v>day?'+':'-')+v:v,o=[];
  for(const l of S.links)o.push(linkDown(l)?0:capOf(l));
  for(const c in S.pops)o.push(popUp(c)?nodeCap(c):-1,siteDown(c,'a')?1:0,siteDown(c,'b')?1:0);
  for(const t of S.transit)o.push(t.down>day?1:0,lagF(t),premOn(t)?1:0);
  for(const p of S.pni)o.push(pniOn(p)?1:0,lagF(p));
  for(const c in S.ixp)o.push(ixCap(c),S.ev.ixdown&&S.ev.ixdown[c]>day?1:0);
  o.push(S.grace&&S.grace.until>day?1:0,teRules()?1:0,coreOn()?1:0,NETS.length);
  return JSON.stringify([S.links,S.transit,S.pni,S.caches,S.ixp,S.ixPref,S.ixSite,S.ixn,S.myIx,S.peers,S.rs,S.inc,S.te,S.core,S.grace,S.scn,S.mode,S.krExit,S.home,S.merged,S.cnLic,S.scrubs,S.nni,S.pairMet,S.pops,S.biz.filter(b=>BIZ_T[b.type].l2)],raw)+JSON.stringify(S.ev,evm)+o.join(',');}
// What the circuits had taken before the flows were routed.
function reuseSnap(edges,EL,ACN,ACD,SEN,SED,NRES,NLOAD,NSEEN,NORD){const es=Object.values(edges);
  return {ld:Float64Array.from(es,e=>e.ld),tr:EL.map(l=>[l,new Map(l.tr.g),l.tr.n.slice(),l.tr.d.slice()]),ACN:ACN.slice(),ACD:ACD.slice(),SEN:SEN.slice(),SED:SED.slice(),NRES:NRES.slice(),NLOAD:NLOAD.slice(),NSEEN:NSEEN.slice(),NORD:NORD.slice()};}
// The day's routing: reused when it can be, else compute().
function routeDay(){const st=REUSE.st,B=RB;
  if(!REUSE.on||!B){st.nobase++;st.full++;compute();return false;}
  if(S.day-B.day>=REUSE.maxAge){st.age++;st.full++;compute();return false;}
  if(ddosAll().length){st.dd++;st.full++;compute();return false;}
  const sig=routeSig();if(sig!==B.sig){st.sig++;st.full++;REUSE.sig=sig;compute();return false;}
  if(!reuseRoute(B)){st.over++;st.full++;compute();return false;}
  st.fast++;return true;}
function reuseRoute(B){const no=w=>{REUSE.st[w]=(REUSE.st[w]||0)+1;return false;};
  const day=S.day,ev=S.ev,NN=B.NN,NC=B.NC,NKN=NN+2,BR=B.R,E=B.E,flows=B.flows,rc=B.rc,HAS=B.HAS,PASS=B.PASS,SN=B.snap;
  const R2=emptyR();R2.bizDem={};R2.bizSrv={};
  for(const k of ['nt','cone','reachNT','reach','reachable','sessions','graceNets','cityBlocked','l2route','l2split','l2','l2lat','div','nodeCap','ddos','haul','tgtF','bbF','fsUse','ddosHot','teBlack'])R2[k]=BR[k];
  if(!BR.cityBlocked)delete R2.cityBlocked;R2.teMoved=0;R2.egDesc=Object.assign({},BR.egDesc);if(BR.egT.l2!==undefined)R2.egT.l2=BR.egT.l2;
  // Today's demand, as compute() works it out, and each city's factor against the base.
  const viral=(ev.viral>day?1.25:1)*(ev.php&&ev.php>day?0.7:1),loc=scnRule('local');
  const bizBw={};for(const b of S.biz){const T=BIZ_T[b.type];if(!T.l2&&!T.fiber&&(!T.event||eventLive(b))){const v=bizBw[b.city];bizBw[b.city]=(v===undefined?0:v)+b.bw;}}
  const shArr=new Map(),shSum=new Map(),DEMTO=new Float64Array(NN),KE=new Float64Array(NC),KB=new Float64Array(NC);
  for(const c of Object.keys(S.pops)){
    const p=S.pops[c],ci=CIDX[c],cn=cnCity(c),SH=cn?NSH_CN:ruCity(c)?NSH_RU:CITY[c].kr&&S.krExit?NSH_KRX:NSH;const eye=(p.bb?p.bb.d:0)*viral*(cn&&ev.golden>day?1.4:1);const biz=bizBw[c]??0;const d0=eye+biz;
    const ru=ruCity(c),thr=n=>n==='ggl'&&ru?0.5:1;let sa=shArr.get(SH),sm=shSum.get(SH);if(!sa){shArr.set(SH,sa=NETS.map(n=>SH[n.id]||0));shSum.set(SH,sm=[]);}
    const tt=sm[+ru]||(sm[+ru]=[NETS.reduce((t,n,j)=>t+sa[j]*thr(n.id),0),NETS.reduce((t,n,j)=>t+sa[j],0)]),lf=loc?NETS.reduce((t,n,j)=>t+(R2.reachable[n.id]?sa[j]*thr(n.id):0),0)/(tt[0]||1):1,d=d0*tt[0]/(tt[1]||1)*lf;
    R2.cityEye[c]=eye;R2.cityDem[c]=d;R2.citySrv[c]=0;R2.demand+=d;
    for(let j=0;j<NN;j++)DEMTO[j]=(DEMTO[j]||0)+d0*sa[j]*thr(NETS[j].id);
    R2.bizDem[c]=biz*d/(d0||1);R2.bizSrv[c]=0;
    // The same flows exist only if the same cities (and, protecting customers, the same business parts) have demand.
    const d0b=B.D0B[ci],bzb=B.BZB[ci];if((d0>0)!==(d0b>0))return no('flows');
    if(B.prot){if((biz>0)!==(bzb>0))return no('flows');KB[ci]=bzb>0?biz/bzb:0;KE[ci]=d0b-bzb>0?(d0-biz)/(d0b-bzb):0;}else KE[ci]=KB[ci]=d0b>0?d0/d0b:0;
    // A jump (an event's crowd arriving, a big customer leaving) is not drift: route it in full.
    if(Math.abs(KE[ci]-1)>REUSE.maxK||Math.abs(KB[ci]-1)>REUSE.maxK&&B.prot)return no('jump');}
  if(Object.keys(S.pops).length)for(let j=0;j<NN;j++)R2.demTo[NETS[j].id]=DEMTO[j];
  // Scaled loads, to see that they still fit. A link, router or exit full in the base keeps its load (when clamping).
  const es=B.edges,NE=es.length,NR=rc.a.length,L=Float64Array.from(SN.ld),NL=new Float64Array(NC),U=new Float64Array(E.length),X=new Float64Array(NR);
  for(let r=0;r<NR;r++){const f=flows[rc.f[r]],x=rc.a[r]*(f.bz?KB[f.ci]:KE[f.ci]);X[r]=x;const P=rc.P[r],ni=P.ni,last=ni.length-1;
    for(const l of P.path)L[l.i]+=x;for(let k=0;k<=last;k++){const i=ni[k];if(HAS[i])NL[i]+=k&&k<last?x*PASS[i]:x;}U[rc.x[r]]+=x;}
  const CE=new Float64Array(NE).fill(1),CN=new Float64Array(NC).fill(1),CX=new Float64Array(E.length).fill(1);let clamped=false;
  for(let i=0;i<NE;i++){const e=es[i];if(L[i]<=e.cap+1e-6)continue;if(!REUSE.clamp||B.res[i]>1e-6)return no('link');CE[i]=Math.max(0,e.cap-SN.ld[i])/(L[i]-SN.ld[i]);clamped=true;}
  for(let i=0;i<NC;i++){if(!HAS[i]||!NL[i])continue;const cap=SN.NRES[i];if(NL[i]<=cap+1e-6)continue;if(!REUSE.clamp||B.nres[i]>1e-6)return no('router');CN[i]=Math.max(0,cap)/NL[i];clamped=true;}
  for(let i=0;i<E.length;i++){const e=E[i];if(U[i]<=e.cap+1e-6)continue;if(!REUSE.clamp||e.cap-B.used[i]>1e-6)return no('exit');CX[i]=e.cap/U[i];clamped=true;}
  // Growth a full link sheds would, in a full routing, partly spill elsewhere: past maxLoss of a city's demand, route in full.
  if(clamped){const LOST=new Float64Array(NC);for(let r=0;r<NR;r++){const P=rc.P[r];let c=CX[rc.x[r]];for(const l of P.path)c=Math.min(c,CE[l.i]);for(const i of P.ni)if(HAS[i])c=Math.min(c,CN[i]);if(c<1){const ci=flows[rc.f[r]].ci;LOST[ci]+=X[r]*(1-c);X[r]*=c;}}
    for(let i=0;i<NC;i++)if(LOST[i]>REUSE.maxLoss*(R2.cityDem[CITIES[i].id]||0))return no('loss');}
  // Put it all down again, as push() does.
  const SRV=new Float64Array(NC),LATP=new Float64Array(NC),FARL=[],FG=new Map(),NEG=[],NRES=SN.NRES.slice(),NLOAD=SN.NLOAD.slice(),NSEEN=SN.NSEEN.slice(),NORD=SN.NORD.slice();
  const ACN=SN.ACN.slice(),ACD=SN.ACD.slice(),SEN=SN.SEN.slice(),SED=SN.SED.slice(),EL=[];
  for(let i=0;i<NE;i++){const e=es[i];e.ld=SN.ld[i];e.res=e.cap-e.ld;e.tr=null;}
  for(const [l,g,n,d] of SN.tr){l.tr={g:new Map(g),n:n.slice(),d:d.slice()};EL.push(l);}
  for(const e of E)e.used=0;
  for(const f of flows){f.rem=f.a0*(f.bz?KB[f.ci]:KE[f.ci]);f.gt=f.gi=f.gp=f.gh=0;f.ti=f.ii=null;}
  for(let r=0;r<NR;r++){const amt=X[r];if(amt<=1e-6)continue;const f=flows[rc.f[r]],e=E[rc.x[r]],P=rc.P[r],path=P.path,ni=P.ni,last=ni.length-1;
    for(let k=0;k<=last;k++){const i=ni[k];if(!HAS[i])continue;const a=k&&k<last?amt*PASS[i]:amt;NRES[i]-=a;if(!NSEEN[i]){NSEEN[i]=1;NORD.push(i);}NLOAD[i]=(NLOAD[i]||0)+a;}
    const ek=e.ek,nr=f.nr,ci=f.ci;
    for(const l of path){l.res-=amt;l.ld+=amt;let t=l.tr;if(!t){t=l.tr={g:new Map(),n:[],d:[]};EL.push(l);}t.g.set(ek,(t.g.get(ek)||0)+amt);
      let k=l.i*NKN+nr;if(!SEN[k]){SEN[k]=1;t.n.push(nr);}ACN[k]=(ACN[k]||0)+amt;k=l.i*NC+ci;if(!SED[k]){SED[k]=1;t.d.push(ci);}ACD[k]=(ACD[k]||0)+amt;}
    e.used+=amt;f.rem-=amt;
    if(!f.junk){const rg=rc.ok[r],rl=rc.lt[r];let ok=amt;
      if(rg>0){R2.gfwLost+=amt*rg;R2.gfwCross+=amt;ok=amt*(1-rg);}
      SRV[ci]+=ok;R2.served+=ok;if(f.bz)R2.bizSrv[f.c]+=ok;if(e.rank<=2)R2.peered+=ok;if(e.k==='t'){const m=R2.tNet[e.id]||(R2.tNet[e.id]={});m[f.n]=(m[f.n]||0)+ok;}
      if(rl>=0){LATP[ci]+=ok*rl;let g=FG.get(P);if(g===undefined){g=0;FARL.push(P,ci,e.ci);}FG.set(P,g+ok);}
      R2.egT[e.k]=(R2.egT[e.k]||0)+ok;const ne=NEG[f.nj]||(NEG[f.nj]=R2.netEg[f.n]={c:0,p:0,ix:0,t:0});ne[e.k]+=ok;
      if(e.k==='t'){f.gt+=ok;f.ti=e.id;}else if(e.k==='ix'){f.gi+=ok;f.ii=e.id;}else if(e.k==='p'){if(e.net===f.n&&e.city===f.c)f.gh+=ok;else f.gp+=ok;}}}
  // The rest is compute()'s ending.
  for(const i of NORD)R2.nodeLoad[CITIES[i].id]=NLOAD[i];
  for(const c of Object.keys(S.pops)){const i=CIDX[c];R2.citySrv[c]=SRV[i];if(LATP[i]>0&&SRV[i]>0)R2.latF[c]=clamp(1-LATP[i]/SRV[i],0,1);}
  {const G=new Map();for(let k=0;k<FARL.length;k+=3){const P=FARL[k],src=FARL[k+1],to=FARL[k+2],key=src*NC+to,o=G.get(key),fg=FG.get(P);if(o){o.g+=fg;o.ms=Math.max(o.ms,2*P.ms);}else G.set(key,{src,to,g:fg,ms:2*P.ms});}
   for(const o of G.values()){const c=CITIES[o.src].id,cur=R2.latFar[c];if(!cur||o.g>cur.g)R2.latFar[c]={to:CITIES[o.to].id,g:o.g,ms:o.ms,share:SRV[o.src]>0?o.g/SRV[o.src]:0};}}
  {const efg={};for(const l of EL){const t=l.tr,i=l.i;let rec=null;efg[l.id]=t.g;
    Object.defineProperty(R2.ef,l.id,{enumerable:true,configurable:true,get(){if(!rec){rec={eg:{},net:{},dst:{}};for(const [k,v] of t.g)rec.eg[k]=v;
      for(const j of t.n)rec.net[j<NN?NETS[j].id:j===NN?'junk':'l2vpn']=ACN[i*NKN+j];for(const ci of t.d)rec.dst[CITIES[ci].id]=ACD[i*NC+ci];}return rec;}});}
   Object.defineProperty(R2,'efg',{value:efg});}
  for(const e of es){const ld=e.ld||0,ac=e.cap-e.scap,a=Math.min(ld,ac),sp=ld-a;for(const l of e.links){const c=capOf(l);R2.load[l.id]=l.standby?(e.scap>0?sp*c/e.scap:0):(ac>0?a*c/ac:0);}}
  R2.peerShare=R2.served>0?R2.peered/R2.served:0;
  for(const e of E){if(e.k==='t')R2.useT[e.id]=(R2.useT[e.id]||0)+e.used;else if(e.k==='ix')R2.useIx[e.id]=e.used;else if(e.k==='p')R2.usePni[e.id]=e.used;else R2.useCache[e.id]=e.used;}
  routeMoney(R2);
  Object.defineProperty(R2,'fl',{value:flows});R=R2;UI.hotMap=hotByCity();REUSE.st.flows+=flows.length;
  return true;}
