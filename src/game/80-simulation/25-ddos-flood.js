/* ---------- where a flood goes (compute() calls these) ----------
   A flood comes from botnets everywhere, so it reaches you over every network that reaches you, on the exits that
   network would use: private peering first, then the exchanges, then transit, spread by port size. Each tool then
   acts where it does in a real network: RTBH and clean pipes upstream, before your port; the port carries what fits
   and everyone on it loses the same share; Flowspec drops matching junk on each ingress router, within that router's
   rule budget; what is left rides the backbone to the target. An engaged scrubbing center takes the flood on its own
   ingress instead (magnet) and cleans up to its tier (sponge); what it cannot take hurts only the target. */
// Does this private peer honour blackhole communities? About half do, the same ones in every game.
function pniHonours(n){let h=0;for(let i=0;i<n.length;i++)h=(h*31+n.charCodeAt(i))|0;return (h&2)===0;}
const ddRank=e=>e.k==='p'?1:e.k==='ix'?2:e.k==='t'?3:9;
// Adds to `out` (exit -> Gbps) the share of g that reaches you on each exit, before upstream tools.
function ddosSpread(g,E,okBy,out){if(g<=0)return;let tot=0;const pick=[];
  for(const n of NETS){const s=NSH[n.id]||0,L=okBy[n.id];if(s<=0||!L||!L.length)continue;let best=9,sac=false;
    for(const e of L){if(e.id==='~grace')continue;const r=ddRank(e);if(r<best)best=r;}
    if(best===9)continue;if(best===1)for(const e of L)if(e.k==='p'&&e.sac)sac=true;
    let cap=0;for(const e of L)if(ddRank(e)===best&&e.id!=='~grace'&&(!sac||e.sac))cap+=e.cap;
    if(cap<=0)continue;tot+=s;pick.push(s,L,best,sac,cap);}
  if(tot<=0)return;
  for(let k=0;k<pick.length;k+=5){const s=pick[k],L=pick[k+1],best=pick[k+2],sac=pick[k+3],cap=pick[k+4],w=g*s/tot;
    for(const e of L)if(ddRank(e)===best&&e.id!=='~grace'&&(!sac||e.sac))out.set(e,(out.get(e)||0)+w*e.cap/cap);}}
// How much of a scrubbing center is engaged for this attack: 0, half on the first day of on-demand diversion, or all.
function scrubEng(a){if(!hasScrub()||a.bh)return 0;if(S.scrubMode!=='ondemand')return 1;
  const from=S.ddosAuto&&S.ddosAuto.scrub===false?a.eng:(a.eng??a.start);if(from===undefined||from===null)return 0;return S.day<=from?0.5:1;}
// One POP's Flowspec rule budget: its routers' TCAM.
const fsCap=c=>{const p=S.pops[c];return p?(RG[p.rgen||0].fsN||0):0;};
// The bandwidth the target itself uses: a customer's port, or a city's broadband subscribers.
function ddosTb(a,R2){if(a.tgt&&a.tgt.startsWith('bb:'))return Math.max(1,(R2.cityEye||{})[a.city]||1);const b=S.biz.find(x=>x.id===a.tgt);return b?Math.max(0.1,b.bw):1;}
/* Before routing: spread each live attack, clip it at the ports, filter it on the routers and load what is left onto
   the backbone ahead of everyone's traffic. X.haul(A,B,g,ek) moves up to g from city A to city B and returns what fit. */
function ddosLoad(X){const {E,okBy,R2}=X;R2.ddos=[];R2.haul=[];R2.tgtF={};R2.bbF={};R2.fsUse={};R2.ddosHot={};
  const live=ddosAll().slice().sort((a,b)=>(a.start||0)-(b.start||0)||(a.id<b.id?-1:a.id>b.id?1:0));if(!live.length)return null;
  const recs=[],room={};
  for(const a of live){const c=a.city,m={attack:a,tgt:a.tgt,g:a.gbps,bh:!!(a.bh||X.autoBh),ports:new Map(),up:0,fs:0,fsAt:[],fsFull:[],fsNone:[],deliv:0,pulled:0,cleaned:0,over:0,parts:[],tf:1,col:0,slowed:0,eng:0};
    recs.push(m);R2.ddos.push(m);if(!popUp(c)||!S.pops[c]){m.offline=true;continue;}
    m.eng=m.bh?0:scrubEng(a);const pull=a.gbps*m.eng,sp=new Map();ddosSpread(a.gbps-pull,E,okBy,sp);
    for(const [e,g] of sp){let left=g;
      if(m.bh)left*=e.k==='p'?(pniHonours(e.net)?0:1):RTBH_LEFT[e.k]??1;else if(e.clean)left*=0.1;
      m.up+=g-left;if(left>1e-9){m.ports.set(e,{off:left,in:0});e.J+=left;}}
    if(pull>0){const xs=S.scrubs.filter(x=>popUp(x.city));let tot=0;for(const x of xs)tot+=SCRUB_TIERS[x.tier||0].g;
      for(const x of xs){const cap=SCRUB_TIERS[x.tier||0].g,share=pull*cap/tot,can=Math.max(0,room[x.city]??cap),cl=Math.min(share,can);room[x.city]=can-cl;
        m.parts.push({city:x.city,tier:x.tier||0,a:share,cleaned:cl});m.cleaned+=cl;m.over+=share-cl;}
      m.pulled=pull;}}
  // The ports: each carries what fits, shared out by what each attack offers it.
  for(const m of recs)for(const [e,p] of m.ports)p.in=p.off*Math.min(1,e.cap/e.J);
  // Flowspec, oldest attack first, within each router's rule budget; what is left heads for the target.
  const fsLeft={};
  for(const m of recs){if(m.offline)continue;const a=m.attack,V=DDOS_VEC[a.vec],need=V&&V.fs?(a.carpet?FS_CARPET:1):0,byCity=new Map();
    for(const [e,p] of m.ports)byCity.set(e.city,(byCity.get(e.city)||0)+p.in);
    for(const [city,g] of byCity){let rest=g;
      if(need&&S.pops[city]){const cap=fsCap(city),left=fsLeft[city]??cap;
        if(!cap)m.fsNone.push(city);else if(left>=need){fsLeft[city]=left-need;rest=g*(1-FS_DROP);m.fs+=g-rest;m.fsAt.push(city);}else{fsLeft[city]=left;m.fsFull.push(city);}}
      m.deliv+=X.haul(city,a.city,rest,'ddos:'+city,city);}
    // Clean traffic comes back from each center to the target, the long way round if the center is far.
    const tb=ddosTb(a,R2);
    for(const x of m.parts){const v=tb*x.a/Math.max(m.pulled,1e-9),h=x.city===a.city?v:X.haul(x.city,a.city,v,'scrub:'+a.city+'>'+x.city,null,true);
      R2.haul.push({city:a.city,to:x.city,tier:x.tier,a:x.a,h:v>0?h/v:1,ms:x.city===a.city?0:X.ms(a.city,x.city)*2,attack:a.id});}
    // The target: blackholed, or what its own port and the scrubbing centers let through.
    const fa=Math.min(1,2*tb/(m.deliv+tb)),fsc=m.pulled>0?m.cleaned/m.pulled:1;
    m.tf=m.bh?0:fa*((1-m.eng)+m.eng*fsc);
    if(a.tgt&&a.tgt.startsWith('bb:'))R2.bbF[a.city]=Math.min(R2.bbF[a.city]??1,m.tf);else if(a.tgt)R2.tgtF[a.tgt]=Math.min(R2.tgtF[a.tgt]??1,m.tf);}
  for(const c in S.pops){const cap=fsCap(c);if(fsLeft[c]!==undefined)R2.fsUse[c]={used:cap-fsLeft[c],cap};}
  if(X.autoBh)R2.teBlack=recs.reduce((n,m)=>n+m.up,0);
  return recs;}
/* After routing: a port offered more than it carries drops the same share of everyone's traffic on it. Then what the
   attacks cost everyone else (collateral) and the target. X.lost(ci,g,bz,e) takes served traffic away again. */
function ddosAfter(recs,X){const {E,R2}=X;if(!recs)return;const lostC={};let lost=0;
  for(const e of E){if(!(e.J>0))continue;const L=e.used,fac=Math.min(1,e.cap/(e.J+L));
    if(fac<1&&e.byC)for(const [ci,v] of e.byC){const x=v[0]*(1-fac),y=v[1]*(1-fac);X.lost(ci,x,y,e);lostC[ci]=(lostC[ci]||0)+x;lost+=x;}
    if(fac<0.97){R2.ddosHot[e.city]=1;}
    e.fac=fac;e.used=Math.min(e.cap,L+e.J);}
  const tot=recs.reduce((n,m)=>n+(m.offline?0:m.attack.gbps),0)||1;
  for(const m of recs){if(m.offline)continue;const a=m.attack,ci=CIDX[a.city],tb=ddosTb(a,R2),dem=R2.cityDem[a.city]||0;
    // The target's own traffic lost at the ports is not collateral.
    const own=dem>1e-6?(lostC[ci]||0)*Math.min(1,tb/dem):0;
    m.col=Math.max(0,(lost-own+X.squeeze)*a.gbps/tot);
    m.portList=[...m.ports].map(([e,p])=>({lab:e.lab,city:e.city,k:e.k,off:p.off,cap:e.cap,fac:e.fac??1})).sort((x,y)=>x.fac-y.fac||y.off-x.off);
    m.full=m.portList.filter(p=>p.fac<0.97).length;
    // Customers who felt it: in a city that lost more than 1% to full ports, other than the target.
    let n=0;for(const c in S.pops){const i=CIDX[c],d=R2.cityDem[c]||0;if(d<=1e-6||(lostC[i]||0)/d<0.01)continue;
      for(const b of S.biz)if(b.city===c&&b.id!==a.tgt&&!BIZ_T[b.type].l2&&!BIZ_T[b.type].fiber)n++;if(R2.cityEye[c]>0&&a.tgt!=='bb:'+c)n++;}
    m.slowed=n;}}
