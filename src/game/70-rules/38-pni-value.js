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
  return PNIX={R,fl:{},ix,pn};}
// One POP's flows by network, added up the first time that POP is asked about.
function pniFlows(c){const X=pniIdx();let m=X.fl[c];if(m)return m;m=X.fl[c]={};
  for(const f of R.fl||[]){if(f.junk||f.c!==c)continue;let o=m[f.n];if(!o)o=m[f.n]={t:0,ix:0,p:0,h:0,u:0,T:{},I:{}};
    o.u+=f.rem;o.t+=f.gt;o.ix+=f.gi;o.p+=f.gp;o.h+=f.gh;if(f.gt)o.T[f.ti]=(o.T[f.ti]||0)+f.gt;if(f.gi)o.I[f.ii]=(o.I[f.ii]||0)+f.gi;}
  return m;}
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
function pniVal(id,c){const o=pniFlows(c)[id]||{t:0,ix:0,p:0,h:0,u:0,T:{},I:{}},want=o.t+o.ix+o.p+o.u;
  const lo=pniMin(id);let tier=-1;for(let i=lo;i<PORT.length;i++)if(portShown(i)){tier=i;if(PORT[i].g*0.8>=want)break;}
  if(tier<0)tier=lo;const g=Math.min(want,PORT[tier].g),gt=Math.min(o.t,g);let saved=0;
  if(gt>0)for(const tid in o.T){const t=S.transit.find(x=>x.id===tid);if(!t)continue;const q=R.p95[tid]??(R.useT[tid]||0),x=gt*o.T[tid]/o.t;saved+=transitMo(t,q)-transitMo(t,Math.max(0,q-x));}
  const cost=pniMo({net:id,tier,n:1},g);
  // Then what you drop today for want of room, then a hot exchange port's share.
  const drop=Math.min(o.u,g-gt);let ixLeft=g-gt-drop,hot=0;for(const x in o.I){if(ixLeft<=0)break;const m=Math.min(ixLeft,o.I[x]);ixLeft-=m;const cp=S.ixp[x]!==undefined?ixCap(x):0;if(cp>0&&(R.useIx[x]||0)>=PNI_HOT*cp)hot+=m;}
  const val=saved-cost,worth=g>=1&&(val>0||hot>=1||drop>=1);
  return {...o,want,g,tier,saved,cost,val,hot,drop,worth};}
