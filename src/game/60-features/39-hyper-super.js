/* ---------- Superclusters: AI training across regions and continents (38-hyper-traffic.js) ----------
   AI has left the single data center: frontier models are trained across sites hundreds or thousands of km apart, linked
   by dedicated optical networks, and the gradients they swap must arrive in step. Here a supercluster run spans three
   regions on at least two continents, as two legs (a chain, a–b and c–b or c–a), each carrying g Gbps between its
   regions on your own backbone. Every leg has a latency limit (HS_CL.lim): a direct path meets it, a detour does not, and
   a leg over it stalls (no progress that day). The run moves on only as its slowest leg does, and pays (or ships) when
   every leg is done.
   Tenant runs: from level HS_CL.lv an AI lab may offer one (S.hs.jo, cl:1); taken, its legs join S.hs.jobs (grp), paid
   half as the data moves and the rest on time, like any run; late, half. Your own frontier model: from level
   HS_CL.flv, once at a time; its legs join S.hs.own (grp); it ships with the biggest lift there is, or flops if fed
   badly. S.hs.cl: [{id, n, k 'job'|'own', fee, due, start, legs [ids], paid}]. S.hs.fm: frontier models shipped. */
const HS_CL={lv:9,flv:11,odds:0.03,g:[6400,12800,19200,25600],wk:[4,6],prem:1.8,lim:[1.35,2],frontier:{g:12800,wk:6,f:0.5,d:365}};
const HS_FRONTIER=['Omniscient Toaster','The Last Autocomplete','Galaxy Brain Ultra','Infinite Context Lasagna'];
// A leg's latency limit, ms one way: the straight line at HS_CL.lim[0] of light in fibre, plus HS_CL.lim[1].
const hsClLim=(a,b)=>Math.round((kmBetween(a,b)*HS_CL.lim[0]/200+HS_CL.lim[1])*10)/10;
/* Three live regions on two continents or more: the two nearest regions on different continents (a, b), and the region
   nearest either of them (c), joined to whichever is nearer. null when there is no such trio. */
function hsClPick(rs){let best=null;for(const a of rs)for(const b of rs){if(a>=b||CITY[a].reg===CITY[b].reg||hsWall(a,b))continue;const k=kmBetween(a,b);if(!best||k<best.k)best={a,b,k};}
  if(!best)return null;const{a,b}=best;let c=null,cj=null,ck=Infinity;for(const x of rs){if(x===a||x===b)continue;for(const y of [a,b]){const k=kmBetween(x,y);if(k<ck||k===ck&&x<c){ck=k;c=x;cj=y;}}}
  return c?{legs:[[a,b],[c,cj]],rgs:[a,b,c]}:null;}
// Why a supercluster of g Gbps a leg cannot start on these legs, or ''. Each leg needs slots and power at both ends.
function hsClWhy(P,g){if(!P)return tr('hyper_super.need_trio');for(const [a,b] of P.legs){const w=hsTrainWhy(a,b,g);if(w)return w;}return '';}
const hsClOf=j=>j&&j.grp?(S.hs.cl||[]).find(G=>G.id===j.grp):null;
const hsClLegs=G=>{const H=S.hs,ids=new Set(G.legs);return (G.k==='own'?H.own:H.jobs).filter(j=>ids.has(j.id));};
// A leg tonight: whether it met its limit (R.hs.jobs[id].ms against j.lim).
const hsClSlow=j=>{const x=R.hs&&R.hs.jobs&&R.hs.jobs[j.id];return !!x&&x.got>1e-9&&x.ms>j.lim;};
/* A leg's day (from hsTrafficDay): it moves only within its limit; a tenant's legs pay their share of half the fee as
   their data moves. */
function hsClLeg(j,x){const G=hsClOf(j);if(!G||!x)return;if(x.ms>j.lim){j.slow=1;return;}j.slow=0;const mv=Math.min(j.tb-j.done,x.got*TB_DAY);j.done+=mv;
  if(G.k==='job'){const half=Math.round(G.fee/2),p=Math.min(Math.max(0,half-(G.paid|0)),Math.round(half*mv/(j.tb*G.legs.length)));if(p>0){S.cash+=p;G.paid=(G.paid|0)+p;}}}
// Groups after the legs: done, late, given up, or (your own) shipped at the deadline.
function hsClDay(d){const H=S.hs;if(!H.cl)return;for(const G of H.cl.slice()){const L=hsClLegs(G),fed=L.length?Math.min(...L.map(j=>j.done/j.tb)):0,done=L.length===G.legs.length&&fed>=1-1e-6;
  const drop=()=>{const ids=new Set(G.legs);if(G.k==='own')H.own=H.own.filter(j=>!ids.has(j.id));else H.jobs=H.jobs.filter(j=>!ids.has(j.id));H.cl.splice(H.cl.indexOf(G),1);};
  if(G.k==='own'){if(done||d>=G.due){drop();hsFrontierShip(G,clamp(fed,0,1),d);}continue;}
  if(done){const late=d>G.due,fee=late?Math.round(G.fee/2):G.fee,rest=Math.max(0,fee-(G.paid|0));S.cash+=rest;drop();if(!late){H.jd=(H.jd|0)+1;H.cld=(H.cld|0)+1;}
    toast(late?tr('hyper_traffic.job_late_paid',{lab:esc(G.n),fee:fmt$(fee)}):tr('hyper_super.paid',{lab:esc(G.n),fee:fmt$(fee)}),late?'':'goal');sfx('coin');}
  else if(d>G.due+HS_GIVEUP){drop();toast(tr('hyper_traffic.job_gave_up_kept',{lab:esc(G.n),paid:fmt$(G.paid|0)}),'bad');sfx('err');}
  else if(d===G.due+1)toast(tr('hyper_traffic.job_late',{lab:esc(G.n),p:pct(fed)}),'bad');}}
// Legs of a run: one job (or model) per leg, g Gbps each, tied to the group.
function hsClMake(G,P,g,wk,list){const tb=Math.round(g*TB_DAY*wk*7);for(const [a,b] of P.legs){const id=uid();G.legs.push(id);
  list.push(G.k==='own'?{id,n:0,k:HS_OWN.length-1,a,b,g,tb,done:0,mw:hsTrainMw({g}),start:S.day,due:G.due,grp:G.id,lim:hsClLim(a,b)}:{id,n:G.n,a,b,g,tb,done:0,due:G.due,fee:0,start:S.day,grp:G.id,lim:hsClLim(a,b)});}}
// An AI lab asks for a supercluster run (from level HS_CL.lv, with three live regions on two continents).
function hsClOffer(d,rs,labs){const P=hsClPick(rs);if(!P)return;const H=S.hs,g=pick(HS_CL.g),wk=HS_CL.wk[0]+Math.floor(Math.random()*(HS_CL.wk[1]-HS_CL.wk[0]+1));
  const tb=Math.round(g*TB_DAY*wk*7)*P.legs.length,fee=Math.round(tb*HS_TB_FEE*HS_CL.prem/1000)*1000,n=labs.length?pick(labs).name:pick(CLOUD_TENANTS.lab.names);
  H.jo.push({id:uid(),n,cl:1,legs:P.legs,a:P.legs[0][0],b:P.legs[0][1],g,wk,tb,fee,exp:d+20});
  toast(tr('hyper_super.offer',{lab:esc(n),a:CITY[P.rgs[0]].name,b:CITY[P.rgs[1]].name,c:CITY[P.rgs[2]].name,n:wk}),'');}
// Taking a lab's supercluster offer (from hsJobTake).
function hsClTake(o){const H=S.hs,P={legs:o.legs},w=hsClWhy(P,o.g);if(w){toast(w,'bad');sfx('err');return false;}
  const G={id:o.id,n:o.n,k:'job',fee:o.fee,due:S.day+Math.ceil(o.wk*7*HS_SLACK),start:S.day,legs:[],paid:0};hsClMake(G,P,o.g,o.wk,H.jobs);(H.cl||(H.cl=[])).push(G);return true;}
// Your frontier model ships: the biggest lift there is, for a year, or a very public flop.
function hsFrontierShip(G,fed,d){const H=S.hs,name=G.n,flop=hstr(name+'|'+G.start)%1000/1000<hsFlopP(fed);
  if(flop){S.stats.hsFlop=(S.stats.hsFlop||0)+1;H.boost={until:d+30,f:-0.1};toast(`🦜 ${tr('hyper_super.frontier_flop',{name:esc(name),p:pct(fed)})}`,'bad');sfx('err');return;}
  const F=HS_CL.frontier,f=F.f*(0.5+0.5*fed);H.boost={until:d+F.d,f:Math.max(f,hsBoostF())};H.ai=(H.ai|0)+1;H.fm=(H.fm|0)+1;
  toast(tr('hyper_super.frontier_shipped',{name:esc(name),p:pct(f),date:dateStr(H.boost.until)}),'goal');sfx('coin');}
CX_NEW.push(o=>{o.cl=[];o.fm=0;o.cld=0;});
// Saves: groups whose legs survived the jobs' and models' own checks; legs of a lost group run on as plain ones no more.
CX_SAN.push((h0,o)=>{const I=v=>Math.round(Number.isFinite(+v)?+v:0);o.fm=Math.max(0,I(h0.fm));o.cld=Math.max(0,I(h0.cld));o.cl=[];
  if(Array.isArray(h0.cl))for(const G of h0.cl.slice(0,4)){if(!G||typeof G!=='object'||typeof G.id!=='string'||!Array.isArray(G.legs))continue;const k=G.k==='own'?'own':'job',list=k==='own'?o.own:o.jobs;
    const legs=G.legs.filter(id=>list.some(j=>j.id===id));if(legs.length<2)continue;o.cl.push({id:G.id,n:typeof G.n==='string'?G.n.slice(0,60):'',k,fee:clamp(I(G.fee),0,1e9),due:I(G.due),start:I(G.start),legs,paid:clamp(I(G.paid),0,1e9)});}
  const ok=new Set(o.cl.map(G=>G.id));o.jobs=o.jobs.filter(j=>!j.grp||ok.has(j.grp));o.own=o.own.filter(j=>!j.grp||ok.has(j.grp));});
// Why your frontier model cannot start now, or ''.
function hsFrontierWhy(){const H=S.hs;if(!H)return '';if(lvl()<HS_CL.flv)return tr('hyper_super.frontier_level',{lv:HS_CL.flv});if(H.own.length)return tr('hyper_traffic.one_model_at_a_time');
  return hsClWhy(hsClPick(hsRgs()),HS_CL.frontier.g);}
