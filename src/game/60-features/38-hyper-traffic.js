/* ---------- The Hyperscaler between regions: replication, backlog and AI training (37-hyper.js) ----------
   Traffic classes. Interactive traffic (the hauls from regions to front doors, then IP routing) goes first; after it,
   compute() carves the bulk classes region to region like L2 circuits on what it left (CX_BULK, 37-content-core.js):
   first replication, then training, never pushing interactive traffic aside (gameplay rule M8). Paths follow the L2
   choice (shortest, or scenic), diverse halves when the pair asks for them (S.hs.pp), and Auto-TE's circuit router
   when the player runs Auto-TE.
   Replication: each region copies HS_REP of what its users ask for, plus its tenants' copies between two regions
   (databases, clusters; the archive's night copy at HS_NIGHT of its size at the evening peak) to its replica region
   (S.hs.rep, chosen by the player; the nearest live region by backbone latency until then). What cannot be sent today
   joins that pair's backlog (S.hs.lag, TB) and is sent on top of the day's copies when there is room: backlog is data at
   risk if a region fails (38-hyper-failover.js reads hsLagAt()).
   AI training. Tenant jobs (GPUs by the Hour (Rationed), S.hs.jobs): an AI lab offers a run between two of your regions
   (S.hs.jo), for weeks, needing compute slots and megawatts in both; accepted, it moves its terabytes as bulk and pays
   on completion, half if late; a lab gives up HS_GIVEUP days after its deadline. Your own models (S.hs.own) take the
   same slots, power and backbone; one that ships lifts your users' growth and revenue for a while (S.hs.boost), sells
   inference (Azzure ClosedAI Service) to your users while fresh and unlocks it for tenants (S.hs.ai); one fed badly may
   flop in public.
   R.hs.rep[region]: {b replica, base (today's copies, Gbps), drain (backlog sent on top), want, got, f (share of base
   sent), ms, mode, te (Auto-TE placed it), paths [{ns, share}], lag (TB before today), u, bt, nt}. R.hs.jobs[id]: {k job
   or own, a, b, want, got, ms, mode, te, paths, due}. R.hs.btw: everything between regions tonight, Gbps; R.hs.aiw: the
   AI share of it (training and the data lake); R.hs.ai is inference revenue (hsAiMoney), not traffic. */
const HS_REP=0.3,HS_NIGHT=0.25,HS_GIVEUP=30,HS_TB_FEE=2.6,HS_MW_T=2.5,HS_MW_MO=25000,HS_SLOT_G=800,HS_AI_RATE=60,HS_BOOST_D=180,HS_JOB_ODDS=0.05,HS_SLACK=1.25;
// Your own models' names (proper names, like tenants'), and their sizes: g Gbps between two regions, wk weeks, f the lift.
const HS_MODELS=['Large Lasagna Model','Stochastic Parrot Pro','AutoComplete Supreme','Hallucinator 9000','Clippy\'s Revenge'];
const HS_OWN=[{n:N_('hyper_traffic.own_s'),g:1600,wk:4,f:0.15},{n:N_('hyper_traffic.own_m'),g:3200,wk:5,f:0.25},{n:N_('hyper_traffic.own_l'),g:6400,wk:6,f:0.35}];
// A tenant run's sizes in Gbps (3.2 to 12.8 Tbps) and the headlines of a model that hallucinates in public.
const HS_JOB_G=[3200,6400,9600,12800];
const HS_FLOPS=[N_('hyper_traffic.flop_glue'),N_('hyper_traffic.flop_ceo'),N_('hyper_traffic.flop_lawyer'),N_('hyper_traffic.flop_poem')];
const HS_PATHS=['scenic','diverse'];
const hsPk=(a,b)=>a<b?a+'|'+b:b+'|'+a;
const hsLk=(a,b)=>a+'>'+b;
const hsTb=tb=>tb>=1e6?tr('hyper_traffic.n_eb',{n:(tb/1e6).toFixed(1)}):tb>=1000?tr('hyper_traffic.n_pb',{n:(tb/1000).toFixed(1)}):tr('hyper_traffic.n_tb',{n:Math.round(tb)});
// The archive's night copy, as a share of a bundle's traffic.
function hsNightBt(p){let w=0,n=0;for(const id of p){const P=CLOUD_PRODUCTS[id];if(!P)continue;w+=P.w;if(id==='arc')n+=P.w*P.bt;}return w?n/w:0;}
/* The replica: the player's choice while it is a live region, otherwise the nearest live one (by backbone latency in
   compute(), ms; by distance elsewhere). rgs: the live regions. */
function hsRepSuggest(c,rgs,ms){const L=(rgs||hsRgs()).filter(r=>r!==c&&!hsWall(c,r));if(!L.length)return null;
  if(ms){const ok=L.filter(r=>ms(c,r)<Infinity);if(ok.length)return ok.sort((a,b)=>ms(c,a)-ms(c,b)||(a<b?-1:1))[0];}
  return L.sort((a,b)=>kmBetween(c,a)-kmBetween(c,b)||(a<b?-1:1))[0];}
function hsRepOf(c,rgs,ms){const H=S.hs,L=rgs||hsRgs(),x=H&&H.rep?H.rep[c]:undefined;return x&&x!==c&&L.includes(x)&&!hsWall(c,x)?x:hsRepSuggest(c,L,ms);}
// Backlog at risk in a region: what it still owes its replica, TB (the failover reads it).
function hsLagAt(c){const H=S.hs;if(!H||!H.lag)return 0;let t=0;const p=c+'>';for(const k in H.lag)if(k.startsWith(p))t+=H.lag[k];return t;}
// Training runs (tenant jobs and your own models): compute slots and megawatts in each of their two regions.
const hsRuns=()=>S.hs?(S.hs.jobs||[]).concat(S.hs.own||[]):[];
const hsTrainSlots=g=>Math.ceil(g/HS_SLOT_G);
const hsTrainMw=j=>Math.round(j.g/1000*HS_MW_T);
function hsTrainSlotsAt(c){let n=0;for(const j of hsRuns())if(j.a===c||j.b===c)n+=hsTrainSlots(j.g);return n;}
function hsTrainMwAt(c){let n=0;for(const j of hsRuns())if(j.a===c||j.b===c)n+=hsTrainMw(j);return n;}
/* Megawatts a metro has left for a new run: hsMwFree() (38-hyper-power.js). Runs draw in both their regions, pushed
   into HS_MW_X, so they count in the grid gate, the cut and the power bill. */
HS_MW_X.push(hsTrainMwAt);
function hsMwLeft(c){if(typeof hsMwFree==='function')return hsMwFree(c);const d=S.hs.rg[c];return hsGrid(c)-(d?d.mw:0)-hsTrainMwAt(c);}
// Why a run of g Gbps between a and b cannot start, or ''.
function hsTrainWhy(a,b,g){if(!a||!b||a===b||!hsLive(a)||!hsLive(b))return tr('hyper_traffic.need_two_regions');
  for(const c of [a,b]){const n=hsTrainSlots(g);if(hsSlots(c)-hsSlotsUsed(c)<n)return tr('hyper_traffic.no_slots_in',{city:CITY[c].name,n});}
  for(const c of [a,b]){const mw=hsTrainMw({g});if(hsMwLeft(c)<mw)return tr('hyper_traffic.no_power_in',{city:CITY[c].name,mw});}
  return '';}
const hsBoostF=()=>{const B=S&&S.hs&&S.hs.boost;return B&&B.until>S.day?B.f:0;};
const hsAiOn=()=>!!S&&!!S.hs&&(S.hs.ai|0)>0;
// The flop: a seeded roll (from the run itself, not the clock) against odds that grow the worse the model was fed.
const hsFlopP=fed=>0.08+0.85*Math.pow(1-clamp(fed,0,1),1.5);
const hsFlopRoll=m=>(hstr(m.a+'>'+m.b+'|'+m.start+'|'+m.n+'|'+m.k)%1000)/1000;
/* compute(), after IP routing (CX_BULK): replication for every live region, then training by deadline. */
// A path's cities from A on.
const hsFrom=(ns,A)=>ns[0]===A?ns:ns.slice().reverse();
function hsDiverse(X,Ai,Bi){const p1=walkI(X.SPP[CITIES[Ai].id],Ai,Bi),used=new Set(p1.path.map(e=>e.id));
  const s2=dijkstra(X.adj,Ai,e=>e.w,(v,e)=>used.has(e.id)||e.w===Infinity||!!e.sky,Bi);
  return s2.D[Bi]===Infinity?[{...p1,share:1}]:[{...p1,share:0.5},{...walkI(s2.P,Ai,Bi),share:0.5}];}
function hsBulk(R2,X){const H=S.hs,out=R2.hs;if(!out)return;const rep={},jobs={};out.rep=rep;out.jobs=jobs;out.btw=0;
  const rgs=Object.keys(out.rg);let TER;const te=()=>TER===undefined?(TER=X.te()):TER;
  // The data lake's load by link pair (a|b): it pauses in a failover, so the failover's headroom counts it free (hsWide).
  const LK=out.lakeL={};
  const carve=(A,B,id,want,mode,lab)=>{const r={got:0,ms:0,paths:[],te:false};const Ai=CIDX[A],Bi=CIDX[B];
    if(!(want>1e-9)||A===B||!X.SPD[A]||!(X.SPD[A][Bi]<Infinity))return r;
    const b={id,bw:want,route:mode==='scenic'?'scenic':'normal',latMax:0},routes=mode==='diverse'?hsDiverse(X,Ai,Bi):X.routes(A,B,b),ek='l2:'+id;
    if(!R2.egDesc[ek])R2.egDesc[ek]={lab,city:A,k:'l2'};
    const T=routes.every(x=>x.path.every(e=>e.w!==Infinity))?te():null;
    if(T){const x=T(A,B,b,routes);r.got=x.amt;r.ms=x.amt>1e-9?x.lat:0;r.te=true;r.paths=(R2.l2route[id+'>'+A+'>'+B]||[]).map(p=>({ns:hsFrom(p.ns,A),share:p.share}));return r;}
    let left=want;const got=new Map();
    // Each path takes its share first, then whatever is still wanted where room is left.
    for(const pass of [0,1])for(const x of routes){let a=pass?left:Math.min(left,want*x.share);for(const e of x.path)a=Math.min(a,e.res);for(const i of x.ni)if(X.HAS[i])a=Math.min(a,X.NRES[i]);
      if(!(a>1e-9))continue;for(const i of x.ni)if(X.HAS[i])X.nodeTake(i,a);for(const e of x.path){e.res-=a;e.ld+=a;X.carry(e,ek,X.NN+1,Bi,a);}left-=a;got.set(x,(got.get(x)||0)+a);
      if(LK&&id.startsWith('hs:lake'))for(let i=1;i<x.ni.length;i++){const p=CITIES[x.ni[i-1]].id,q=CITIES[x.ni[i]].id,k=p<q?p+'|'+q:q+'|'+p;LK[k]=(LK[k]||0)+a;}}
    for(const [x,a] of got){r.paths.push({ns:hsFrom(x.ni.map(i=>CITIES[i].id),A),share:a/want});r.ms=Math.max(r.ms,x.path.reduce((s,e)=>s+e.lat,0)+x.path.length*0.05);}
    r.got=want-left;return r;};
  // Replication, region by region.
  for(const a of rgs){const g=out.rg[a],b=g.rep||null,base=((HS_REP+HS_VID.rep*hsVidF()/(1+hsVidF()))*(g.u||0)+(g.bt||0)+HS_NIGHT*(g.nt||0))*hsRepX(a);if(!b)continue;
    const lag=H.lag[hsLk(a,b)]||0,drain=lag/TB_DAY,mode=H.pp[hsPk(a,b)]||'',x=carve(a,b,'hs:'+hsLk(a,b),base+drain,mode,labOf(N_('hyper_traffic.ek_rep'),'city',CITY[b].name));
    rep[a]={b,base,drain,want:base+drain,got:x.got,f:base>1e-9?Math.min(1,x.got/base):1,ms:x.ms,mode,te:x.te,paths:x.paths,lag,u:g.u||0,bt:g.bt||0,nt:g.nt||0};out.btw+=x.got;}
  for(const id in out.ten){const T=out.ten[id];if(T.bt>0&&T.r&&rep[T.r])T.btg=T.bt*rep[T.r].f;}
  // Training, earliest deadline first: tenants' jobs and your own models alike.
  const runs=H.jobs.map(j=>['job',j]).concat(H.own.map(m=>['own',m])).sort((x,y)=>x[1].due-y[1].due||(x[1].id<y[1].id?-1:1));
  for(const [k,j] of runs){const live=rgs.includes(j.a)&&rgs.includes(j.b),want=live?Math.min(j.g,Math.max(0,j.tb-j.done)/TB_DAY):0,mode=H.pp[hsPk(j.a,j.b)]||'';
    const x=live?carve(j.a,j.b,'hs:'+j.id,want,mode,labOf(N_('hyper_traffic.ek_train'),'city',CITY[j.b].name)):{got:0,ms:0,paths:[],te:false};
    jobs[j.id]={k,a:j.a,b:j.b,want,got:x.got,ms:x.ms,mode,te:x.te,paths:x.paths,due:j.due};out.btw+=x.got;}
  // The data lake, last of the bulk classes: every other region ships its logs, analytics and training data there (none from behind the wall).
  const L=hsLakeAt(rgs),lf=hsLakeF(),lk=out.lake={c:L,want:0,got:0,rg:{}};
  // Bulk analytics wait while a region is failed over: everything the backbone has goes to the failover.
  if(L&&lf>0&&!Object.keys(out.fo||{}).length)for(const a of rgs){if(a===L||hsWall(a,L))continue;const want=(out.rg[a].u||0)*lf;if(!(want>1e-9))continue;
    const x=carve(a,L,'hs:lake>'+a,want,H.pp[hsPk(a,L)]||'',labOf(N_('hyper_traffic.ek_lake'),'city',CITY[L].name));
    lk.rg[a]={want,got:x.got,ms:x.ms,paths:x.paths};lk.want+=want;lk.got+=x.got;out.btw+=x.got;}
  // AI traffic between regions tonight: training runs and the lake (the level bar's measure, S.hs.apk).
  out.aiw=lk.got;for(const id in jobs)out.aiw+=jobs[id].got;}
hsBulk.on=()=>!!S.hs&&hyper();
/* East-west traffic, as real clouds have it: more moves between their own data centers than out to users (Google's B4
   carries more than its internet-facing B2; Meta split its data-center-to-data-center traffic onto the Express
   Backbone). Besides replication, every region ships HS_LAKE of its users' traffic, growing with the level, to the
   data lake: the biggest region (most room, then id). What does not arrive makes recommendations and ads stale:
   revenue falls by up to HS_LAKE_REV with the share missing (hsFreshF). */
const HS_LAKE=[3,0.2,0.06,0.8],HS_LAKE_REV=0.1;
const hsLakeF=()=>{const lv=lvl();return lv<HS_LAKE[0]?0:Math.min(HS_LAKE[3],HS_LAKE[1]+(lv-HS_LAKE[0])*HS_LAKE[2]);};
const hsLakeAt=rgs=>(rgs=rgs.filter(r=>!CITY[r].cn)).length<2?null:rgs.slice().sort((a,b)=>hsRgG(b)-hsRgG(a)||(a<b?-1:1))[0];
// Data freshness, 0..1, and what it does to revenue.
const hsFresh=r=>{const k=r&&r.hs&&r.hs.lake;return k&&k.want>1e-9?clamp(k.got/k.want,0,1):1;};
const hsFreshF=r=>1-HS_LAKE_REV*(1-hsFresh(r));
// Money: training draws megawatts (a monthly cost); a fresh model of yours sells inference to your users.
// The GPUs, their cooling and the people who watch the loss curve; the megawatts themselves are on the power bill.
const hsTrainCost=()=>{let mw=0;for(const j of hsRuns())mw+=2*hsTrainMw(j);return mw*HS_MW_MO;};
function hsAiMoney(R2,V){if(!R2.hs||!S.hs)return;const f=hsBoostF();let v=0;if(f>0){for(const cc in R2.hs.cc){const o=R2.hs.cc[cc];v+=o.D*hsQ(R2,cc);}v*=HS_AI_RATE;}R2.hs.ai=v;V.eyeballs+=v;}
/* A day: bytes booked (1 Gbps for a day is 10.8 TB), backlogs grow or drain, runs progress, finish, pay or give up, and
   now and then an AI lab calls. */
function hsTrafficDay(d){const H=S.hs,o=R.hs;if(!H)return;
  if(o&&o.rep){// A region whose replica changed sends what it still owed to the new one.
    for(const k of Object.keys(H.lag)){const [a,b]=k.split('>'),x=o.rep[a];if(!H.rg[a]){delete H.lag[k];continue;}if(x&&x.b!==b){const n=hsLk(a,x.b);H.lag[n]=(H.lag[n]||0)+H.lag[k];delete H.lag[k];}}
    for(const a in o.rep){const x=o.rep[a],k=hsLk(a,x.b),v=(H.lag[k]||0)+(x.base-x.got)*TB_DAY;if(v>0.05)H.lag[k]=Math.min(1e9,v);else delete H.lag[k];}}
  /* The lab pays half the fee as its data moves (j.paid so far) and the rest on time at the end: a run's GPUs and power
     cost every day (hsTrainCost), and a fee paid only at the end could sink a cloud that can easily serve the run.
     Late, the total is half the fee, as it always was; a lab that gives up keeps what it paid. */
  for(const j of H.jobs.slice()){const x=o&&o.jobs&&o.jobs[j.id];if(j.grp){hsClLeg(j,x);continue;}
    if(x){const mv=Math.min(j.tb-j.done,x.got*TB_DAY);j.done+=mv;const half=Math.round(j.fee/2),p=Math.min(Math.max(0,half-(j.paid|0)),Math.round(half*mv/j.tb));if(p>0){S.cash+=p;j.paid=(j.paid|0)+p;}}
    if(j.done>=j.tb-1e-6){const late=d>j.due,fee=late?Math.round(j.fee/2):j.fee,rest=Math.max(0,fee-(j.paid|0));S.cash+=rest;H.jobs.splice(H.jobs.indexOf(j),1);H.jd=(H.jd|0)+(late?0:1);
      toast(late?tr('hyper_traffic.job_late_paid',{lab:esc(j.n),fee:fmt$(fee)}):tr('hyper_traffic.job_paid',{lab:esc(j.n),tb:hsTb(j.tb),fee:fmt$(fee)}),late?'':'goal');sfx('coin');}
    else if(d>j.due+HS_GIVEUP){H.jobs.splice(H.jobs.indexOf(j),1);toast(tr('hyper_traffic.job_gave_up_kept',{lab:esc(j.n),paid:fmt$(j.paid|0)}),'bad');sfx('err');}
    else if(d===j.due+1)toast(tr('hyper_traffic.job_late',{lab:esc(j.n),p:pct(j.done/j.tb)}),'bad');}
  for(const m of H.own.slice()){const x=o&&o.jobs&&o.jobs[m.id];if(m.grp){hsClLeg(m,x);continue;}if(x)m.done=Math.min(m.tb,m.done+x.got*TB_DAY);if(m.done>=m.tb-1e-6||d>=m.due)hsShip(m,d);}
  hsClDay(d);
  if(H.boost.until&&H.boost.until<=d){H.boost={until:0,f:0};}
  H.jo=H.jo.filter(x=>x.exp>d);const rs=hsRgs();
  // AI labs call from their level on (38-hyper-director.js), or once one is a tenant; never while the desk is full of offers.
  if(rs.length>=2&&H.jo.length<2){const labs=hsTen().filter(b=>b.ck==='lab');if((hsDirOn('ai')||labs.length)&&Math.random()<HS_JOB_ODDS*(labs.length?2:1)&&hsDirAsk('job'))hsJobOffer(d,rs,labs);
    // From level HS_CL.lv, now and then a supercluster run across three regions and two continents.
    else if(lvl()>=HS_CL.lv&&H.jo.length<2&&!H.cl.some(G=>G.k==='job')&&Math.random()<HS_CL.odds&&hsDirAsk('job'))hsClOffer(d,rs,labs);}}
// A model finishes (fed: the share of its terabytes delivered by its deadline): it ships, or it flops in public.
function hsShip(m,d){const H=S.hs,fed=clamp(m.done/m.tb,0,1),name=HS_MODELS[m.n],flop=hsFlopRoll(m)<hsFlopP(fed);H.own.splice(H.own.indexOf(m),1);
  if(flop){S.stats.hsFlop=(S.stats.hsFlop||0)+1;if(!(hsBoostF()>0))H.boost={until:d+30,f:-0.05};toast(`🦜 ${tr(HS_FLOPS[hstr(name+'|'+m.start)%HS_FLOPS.length],{name})}<br>${tr('hyper_traffic.flop_fed',{p:pct(fed)})}`,'bad');sfx('err');return;}
  const f=HS_OWN[m.k].f*(0.5+0.5*fed);H.boost={until:d+HS_BOOST_D,f:Math.max(f,hsBoostF())};H.ai=(H.ai|0)+1;
  toast(tr('hyper_traffic.model_shipped',{name,p:pct(f),date:dateStr(H.boost.until)}),'goal');sfx('coin');}
// An AI lab asks for a run between two of your live regions (each pair alike).
function hsJobOffer(d,rs,labs){const H=S.hs,g=pick(HS_JOB_G),wk=4+Math.floor(Math.random()*5),tb=Math.round(g*TB_DAY*wk*7),fee=Math.round(tb*HS_TB_FEE/1000)*1000;
  const ps=[];for(let i=0;i<rs.length;i++)for(let k=i+1;k<rs.length;k++)ps.push([rs[i],rs[k]]);const [a,b]=pick(ps),n=labs.length?pick(labs).name:pick(CLOUD_TENANTS.lab.names);
  H.jo.push({id:uid(),n,a,b,g,wk,tb,fee,exp:d+20});const ra=CITY[a].reg,rb=CITY[b].reg;
  toast(ra!==rb&&[ra,rb].includes('EU')&&[ra,rb].includes('AM')?tr('hyper_traffic.offer_atlantic',{lab:esc(n),n:wk}):tr('hyper_traffic.offer',{lab:esc(n),g:fmtG(g),a:CITY[a].name,b:CITY[b].name,n:wk}),'');}
CX_BULK.push(hsBulk);CX_DAY.push(hsTrafficDay);CX_MONEY.push(hsAiMoney);
// Training runs are their own line in the money breakdown (C.train), not hidden in the Cost Exploder's regions.
CX_MONEY.push((R2,V,C)=>{if(hyper()&&S.hs)C.train=hsTrainCost();});
CX_MUL.grow.push(()=>{const f=hsBoostF();return f>0?1+2*f:1+f;});CX_MUL.rev.push(()=>1+hsBoostF());
CX_DAY.push(()=>{const H=S.hs;if(H&&R.hs&&R.hs.aiw>(H.apk||0))H.apk=R.hs.aiw;});
CX_NEW.push(o=>{o.apk=0;o.hold={};o.rep={};o.lag={};o.jobs=[];o.own=[];o.boost={until:0,f:0};o.jo=[];o.pp={};o.ai=0;o.jd=0;});
// A supercluster leg keeps its group and latency limit (39-hyper-super.js checks the groups afterwards).
const hsLegKeep=(x,j)=>{if(typeof x.grp==='string'&&Number.isFinite(+x.lim)&&+x.lim>0){j.grp=x.grp.slice(0,40);j.lim=+x.lim;}};
// Saves: every field repaired against the regions the save still has.
CX_SAN.push((h0,o)=>{const n=(v,d)=>Number.isFinite(+v)?+v:d,obj=v=>v&&typeof v==='object'&&!Array.isArray(v),rg=c=>typeof c==='string'&&own(o.rg,c),I=v=>Math.round(n(v,0));
  const str=(v,d)=>typeof v==='string'&&v?v.slice(0,40):d;
  o.rep={};if(obj(h0.rep))for(const k of Object.keys(h0.rep))if(rg(k)&&rg(h0.rep[k])&&h0.rep[k]!==k)o.rep[k]=h0.rep[k];
  o.apk=clamp(Number.isFinite(+h0.apk)?+h0.apk:0,0,1e9);
  o.hold={};if(obj(h0.hold))for(const k of Object.keys(h0.hold))if(rg(k)&&h0.hold[k])o.hold[k]=1;
  o.lag={};if(obj(h0.lag))for(const k of Object.keys(h0.lag)){const [a,b,x]=k.split('>'),v=n(h0.lag[k],0);if(x===undefined&&rg(a)&&rg(b)&&a!==b&&v>0)o.lag[k]=Math.min(1e9,v);}
  o.pp={};if(obj(h0.pp))for(const k of Object.keys(h0.pp)){const [a,b,x]=k.split('|');if(x===undefined&&rg(a)&&rg(b)&&a<b&&HS_PATHS.includes(h0.pp[k]))o.pp[k]=h0.pp[k];}
  const runOk=x=>obj(x)&&rg(x.a)&&rg(x.b)&&x.a!==x.b,ids=new Set(),uniq=x=>{const id=str(x.id,'');if(!id||ids.has(id))return '';ids.add(id);return id;};
  o.jobs=[];if(Array.isArray(h0.jobs))for(const x of h0.jobs.slice(0,12)){if(!runOk(x))continue;const id=uniq(x);if(!id)continue;const g=clamp(n(x.g,3200),100,30000),tb=clamp(n(x.tb,g*TB_DAY*28),1,1e9);
    o.jobs.push({id,n:str(x.n,CLOUD_TENANTS.lab.names[0]),a:x.a,b:x.b,g,tb,done:clamp(n(x.done,0),0,tb),due:I(x.due),fee:clamp(Math.round(n(x.fee,0)),0,1e9),start:I(x.start)});const j=o.jobs[o.jobs.length-1],pd=clamp(I(x.paid),0,Math.round(j.fee/2));if(pd>0)j.paid=pd;hsLegKeep(x,j);}
  o.own=[];let plain=0;if(Array.isArray(h0.own))for(const x of h0.own.slice(0,4)){if(!runOk(x))continue;if(!(x&&typeof x.grp==='string')&&plain++)continue;// one plain model at a time; a frontier model's legs besides
    const id=uniq(x);if(!id)continue;const k=clamp(I(x.k),0,HS_OWN.length-1),g=clamp(n(x.g,HS_OWN[k].g),100,30000),tb=clamp(n(x.tb,g*TB_DAY*HS_OWN[k].wk*7),1,1e9);
    o.own.push({id,n:clamp(I(x.n),0,HS_MODELS.length-1),k,a:x.a,b:x.b,g,tb,done:clamp(n(x.done,0),0,tb),mw:hsTrainMw({g}),start:I(x.start),due:I(x.due)});hsLegKeep(x,o.own[o.own.length-1]);}
  o.jo=[];if(Array.isArray(h0.jo))for(const x of h0.jo.slice(0,3)){if(!runOk(x))continue;const id=uniq(x);if(!id)continue;const g=clamp(n(x.g,3200),100,30000),wk=clamp(I(x.wk),4,8);
    o.jo.push({id,n:str(x.n,CLOUD_TENANTS.lab.names[0]),a:x.a,b:x.b,g,wk,tb:clamp(n(x.tb,g*TB_DAY*wk*7),1,1e9),fee:clamp(Math.round(n(x.fee,0)),0,1e9),exp:I(x.exp)});
    // A supercluster offer keeps its two legs, each between two of your regions (39-hyper-super.js).
    if(x.cl&&Array.isArray(x.legs)&&x.legs.length===2&&x.legs.every(L=>Array.isArray(L)&&rg(L[0])&&rg(L[1])&&L[0]!==L[1])){const j=o.jo[o.jo.length-1];j.cl=1;j.legs=x.legs.map(L=>[L[0],L[1]]);}}
  const B=obj(h0.boost)?h0.boost:{};o.boost={until:Math.max(0,I(B.until)),f:clamp(n(B.f,0),-0.5,1)};
  o.ai=Math.max(0,I(h0.ai));o.jd=Math.max(0,I(h0.jd));});
