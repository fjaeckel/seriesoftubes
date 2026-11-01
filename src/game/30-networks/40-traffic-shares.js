const NET=Object.fromEntries(NETS.map(n=>[n.id,n])),NET_IDS=NETS.map(n=>n.id);
const NIDX=Object.fromEntries(NET_IDS.map((id,i)=>[id,i])),NET_J=NET_IDS.map((id,i)=>i);
/* Customer cones (#85): a network announces to its peers itself and everyone who buys transit from it, and their
   customers in turn. So a PNI or a session with a network reaches its whole cone, and peering with every Tier 1 brings
   their customers along. Built once at load: CONE[id] lists the network first, then its cone; CONE_S is the same as a
   Set, and DOWN[id] holds the cone without the network itself (empty for most). */
// Observed provider relationships, with regional ASNs folded into the represented operator.
const CONE={},CONE_S={},DOWN={};
{const dn={};for(const n of NETS)for(const u of n.up||[])(dn[u]||(dn[u]=[])).push(n.id);
 for(const n of NETS){const s=new Set([n.id]),q=[n.id];while(q.length){for(const y of dn[q.pop()]||[])if(!s.has(y)){s.add(y);q.push(y);}}
   CONE[n.id]=[...s];CONE_S[n.id]=s;DOWN[n.id]=CONE[n.id].slice(1);}}
// ANC[id]: every network whose cone holds it, nearest upstream first (who brings it along, for the panels).
const CONE_I=Object.fromEntries(NET_IDS.map(id=>[id,CONE[id].map(n=>NIDX[n])]));
const ANC={};for(const n of NETS){const o=[],seen=new Set(),q=(n.up||[]).slice();for(let i=0;i<q.length;i++){const u=q[i];if(seen.has(u)||!NET[u])continue;seen.add(u);o.push(u);q.push(...(NET[u].up||[]));}ANC[n.id]=o;}
// The networks a PNI with each network reaches: its customer cone. CONE_RANK: where routing tries a peer's cone.
const PNI_NETS=CONE,CONE_RANK=2.5;
for(const X of XIX){X.members=NETS.filter(n=>Array.isArray(n.ix)&&n.ix.includes(X.id)||!n.tail&&(X.core?X.core.includes(n.id):(n.ix==='ALL'&&n.pops.includes(X.c)||Array.isArray(n.ix)&&n.ix.includes(X.c))&&hstr(n.id+'|'+X.id)%100<(n.ix==='ALL'?72:X.take*100))).map(n=>n.id);}
// Wholesale traffic belongs to customer cones. Move its old direct-demand estimate to content, keeping the access budget.
const NSH={}; {const wh=NETS.reduce((a,n)=>a+(n.wholesale?n.share:0),0),cdn=NETS.reduce((a,n)=>a+(n.type==='cdn'?n.share:0),0);
  const w=n=>n.wholesale?0:n.share*(n.type==='cdn'?1+wh/cdn:1),t=NETS.reduce((a,n)=>a+w(n),0);NETS.forEach(n=>NSH[n.id]=w(n)/t);}
// Keep content and smaller-network budgets. Each country assigns the access budget to its observed operators.
function eyeMix(base,eyes){const out={},scale=Object.values(base).reduce((a,b)=>a+b,0)||1;let budget=0,total=0;for(const n of NETS){const w=(base[n.id]||0)/scale,local=!!n.cc||eyes[n.id]!==undefined;if(local)budget+=w;else out[n.id]=w;}for(const id in eyes)total+=eyes[id];
  if(!total)return base;for(const id in eyes)out[id]=budget*eyes[id]/total;return out;}
{const mix=eyeMix(NSH,GLOBAL_EYES);for(const id in NSH)NSH[id]=mix[id]||0;}
const NSH_CC=Object.fromEntries(Object.entries(COUNTRY_EYES).map(([cc,eyes])=>[cc,eyeMix(NSH,eyes)]));
// After Glitch leaves Korea, Seoul viewers watch half as much of it and the rest moves to everyone else.
const NSH_KRX={}; {const b=NSH_CC.KR||NSH,w=id=>(b[id]||0)*(id==='amz'?0.5:1),t=NETS.reduce((a,n)=>a+w(n.id),0); NETS.forEach(n=>NSH_KRX[n.id]=w(n.id)/t);}
const CN_W={ctc:.2,cun:.14,cmb:.08,tcs:.23,abc:.14,byd:.08,bdc:.08,akm:.02,msf:.02,amz:.01};
const RU_W={ydx:.29,vkl:.12,rtc:.14,ggl:.12,bdc:.08,akm:.05,cfl:.06,msf:.04,amz:.03};
const NSH_RU=eyeMix(RU_W,COUNTRY_EYES.RU);
const NSH_CN=eyeMix(CN_W,COUNTRY_EYES.CN);
const CN_BLOCKED=NETS.filter(n=>!CN_W[n.id]&&n.type==='cdn').map(n=>n.name);
const TYPE_L={t1:tr('common.tier_1'),t2:tr('common.tier_2'),cdn:tr('common.cdn_content'),eye:tr('common.eyeballs')};
const netTier=n=>n.t1v6?tr('common.tier_1_ipv6'):TYPE_L[n.type];
const initials=n=>n.name.replace(/[^A-Za-z ]/g,'').split(' ').filter(Boolean).map(w=>w[0]).join('').slice(0,3).toUpperCase();

