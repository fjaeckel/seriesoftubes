/* ---------- Is a PNI worth it? (#175, #172) ----------
   How you reach each network today, and what a PNI at one POP would take over: the traffic your users there send
   to that network over transit, an exchange or a PNI elsewhere, priced with the real billing functions. Information
   only: nothing here changes routing or billing. Built once per routing result (R.fl), not per row. */
const PNI_HOT=0.8;
let PNIX=null;
function pniIdx(){if(PNIX&&PNIX.R===R)return PNIX;
  const ix={},pn={};
  for(const c in S.ixp){const nm=ixName(c);for(const id of ixSessions(c)){const a=ix[id]||(ix[id]=[]);if(!a.includes(nm))a.push(nm);}}
  for(const p of S.pni)(pn[p.net]||(pn[p.net]=[])).push(p);
  return PNIX={R,fl:{},all:false,ix,pn};}
// One POP's flows by network, added up the first time that POP is asked about.
// Every POP at once, in one pass over the flows: the intern's weekly PNI round asks about all of them, and one POP at a
// time was a pass per POP. The flows are read straight from routing's columns (R.flc), not made into the objects of R.fl
// (tens of thousands on a big network); each POP's sums still add up its flows in their order.
function pniFlows(c){const X=pniIdx();if(!X.all){X.all=true;const F=X.fl,C=R.flc;
  const add=(c,n,rem,gt,gi,gp,gh,ti,ii)=>{const m=F[c]||(F[c]={});let o=m[n];if(!o)o=m[n]={t:0,ix:0,p:0,h:0,u:0,T:{},I:{}};
    o.u+=rem;o.t+=gt;o.ix+=gi;o.p+=gp;o.h+=gh;if(gt)o.T[ti]=(o.T[ti]||0)+gt;if(gi)o.I[ii]=(o.I[ii]||0)+gi;};
  if(C){const {NF,FREM,FCI,FNJ,FGT,FGI,FGP,FGH,FTI,FII,E}=C;
    for(let i=0;i<NF;i++)add(CITIES[FCI[i]].id,NET_IDS[FNJ[i]],FREM[i],FGT[i],FGI[i],FGP[i],FGH[i],FTI[i]<0?null:E[FTI[i]].id,FII[i]<0?null:E[FII[i]].id);}
  else for(const f of R.fl||[])if(!f.junk)add(f.c,f.n,f.rem,f.gt,f.gi,f.gp,f.gh,f.ti,f.ii);}
  return X.fl[c]||(X.fl[c]={});}
// One status, most direct first. c: the POP you are looking at (null: anywhere).
function pniStat(id,c){const X=pniIdx(),ps=X.pn[id]||[],h=c?ps.find(p=>p.city===c):null;
  if(h)return {k:'here',p:h};
  const el=[...new Set(ps.filter(p=>pniOn(p)).map(p=>p.city))];if(el.length)return {k:'else',cities:el};
  if(X.ix[id])return {k:'ix',ixs:X.ix[id]};
  if(R.cone[id])return {k:'cone',by:NET[R.cone[id]]||coneVia(id)};
  return {k:R.reachable[id]?'t':'none'};}
const pniList=a=>a.length>2?tr('pni_list.list_more',{list:a.slice(0,2).join(', '),n:a.length-2}):a.join(', ');
const PNI_ICON={here:'🔗',else:'🔗',ix:'🤝',cone:'🧺',t:'💸',none:'🚫'};
function pniChip(id,c){const s=pniStat(id,c);let t;
  if(s.k==='here'){const p=s.p;t=!pniOn(p)?tr('pni_list.chip_pni_here_on_order'):tr('pni_list.chip_pni_here',{port:((p.n||1)>1?p.n+'×':'')+pniPN(p),p:pct(Math.min(1,(R.usePni[p.id]||0)/lagCap(pniG(p),p.n)))});}
  else if(s.k==='else'){const l=pniList(s.cities.map(x=>CITY[x].name));t=c?tr('pni_list.chip_pni_elsewhere',{list:l}):tr('pni_list.chip_pni_at',{list:l});}
  else if(s.k==='ix')t=tr('pni_list.chip_peers_at',{list:pniList(s.ixs)});
  else if(s.k==='cone')t=s.by?tr('pni_list.chip_via_cone',{net:s.by.name}):tr('pni_list.chip_via_a_cone');
  else t=s.k==='t'?tr('pni_list.chip_via_transit'):tr('pni_list.chip_not_reached');
  return `<span class="pchip pk-${s.k}">${PNI_ICON[s.k]} ${esc(t)}</span>`;}
/* What a new PNI with `id` at `c` would carry and save per month. It takes your users' traffic there that now
   leaves over transit, an exchange or a PNI elsewhere, or does not leave at all for want of room, up to its port; transit is billed on the 95th percentile,
   so the saving is the bill now minus the bill with that much less (commits included). */
/* pniVal()'s want for network n at POP c (what the intern's weekly round sorts by), without the rest pniFlows() keeps
   for the PNI list: the same four sums of the same flows in the same order, in columns by (city, network). One pass,
   no objects; null when routing left no columns (an old R), then pniFlows() it is. */
function pniWant(c,n){const X=pniIdx();if(X.w===undefined){const C=R.flc;X.w=null;
    if(C){const {NF,FREM,FCI,FNJ,FGT,FGI,FGP}=C;let K=1;for(let i=0;i<NF;i++)if(FNJ[i]>=K)K=FNJ[i]+1;
      const n4=CITIES.length*K,U=new Float64Array(n4),T=new Float64Array(n4),I=new Float64Array(n4),P=new Float64Array(n4);
      for(let i=0;i<NF;i++){const k=FCI[i]*K+FNJ[i];U[k]+=FREM[i];T[k]+=FGT[i];I[k]+=FGI[i];P[k]+=FGP[i];}
      X.w={K,U,T,I,P,ni:new Map(NET_IDS.map((id,j)=>[id,j]))};}}
  const W=X.w;if(!W){const o=pniFlows(c)[n];return o?o.t+o.ix+o.p+o.u:0;}
  const ci=CIDX[c],j=W.ni.get(n);if(ci===undefined||j===undefined||j>=W.K)return 0;const k=ci*W.K+j;return W.T[k]+W.I[k]+W.P[k]+W.U[k];}
function pniVal(id,c){const o=pniFlows(c)[id]||{t:0,ix:0,p:0,h:0,u:0,T:{},I:{}},want=o.t+o.ix+o.p+o.u;
  const lo=pniMin(id);let tier=-1;for(let i=lo;i<PORT.length;i++)if(portShown(i)){tier=i;if(PORT[i].g*0.8>=want)break;}
  if(tier<0)tier=lo;const g=Math.min(want,PORT[tier].g),gt=Math.min(o.t,g);let saved=0;
  if(gt>0)for(const tid in o.T){const t=S.transit.find(x=>x.id===tid);if(!t)continue;const q=R.p95[tid]??(R.useT[tid]||0),x=gt*o.T[tid]/o.t;saved+=transitMo(t,q)-transitMo(t,Math.max(0,q-x));}
  const cost=pniMo({net:id,tier,n:1},g);
  // Then what you drop today for want of room, then a hot exchange port's share.
  const drop=Math.min(o.u,g-gt);let ixLeft=g-gt-drop,hot=0;for(const x in o.I){if(ixLeft<=0)break;const m=Math.min(ixLeft,o.I[x]);ixLeft-=m;const cp=S.ixp[x]!==undefined?ixCap(x):0;if(cp>0&&(R.useIx[x]||0)>=PNI_HOT*cp)hot+=m;}
  const val=saved-cost,worth=g>=1&&(val>0||hot>=1||drop>=1);
  return {...o,want,g,tier,saved,cost,val,hot,drop,worth};}
