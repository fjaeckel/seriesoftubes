/* ---------- The Hyperscaler between regions in the interface (38-hyper-traffic.js) ----------
   Parts of the charter card (55-hyper-panel.js): replication against what it wanted and the backlog, AI runs and when
   the next is due, a model in training or its boost (lines), and AI labs' offers to take or decline (the offers fold).
   In the Cloud tab of a region's city: its replica, what replication got tonight, the backlog it owes, how the pair's
   bulk travels, the runs touching it and your own model. */
// A supercluster's leg goes by its run's name (39-hyper-super.js).
const hsRunName=j=>{const G=hsClOf(j);return G?G.n:j.k!==undefined?HS_MODELS[j.n]:j.n;};
// A supercluster leg over its latency limit tonight (#475): its data moves, none of it counts. The way it goes, and how slow.
function hsClStallWhy(j,x){if(!hsClOf(j)||!x||!(x.got>1e-9)||!(x.ms>j.lim))return '';const p=(x.paths||[]).slice().sort((a,b)=>b.share-a.share)[0];
  return tr('hyper_super.leg_stalled',{ms:Math.round(x.ms*10)/10,lim:j.lim,via:p?p.ns.map(c=>esc(CITY[c].name)).join(' → '):'',a:esc(CITY[j.a].name),b:esc(CITY[j.b].name)});}
function hsRunRow(j,c){const x=R.hs&&R.hs.jobs&&R.hs.jobs[j.id],own=j.k!==undefined,late=S.day>j.due,f=j.tb>0?j.done/j.tb:0,G=hsClOf(j),fee=G?G.fee:j.fee,st=hsClStallWhy(j,x);
  return `<div class="row"><div class="grow"><div class="nm">${own?'🧠':'🤖'} ${esc(hsRunName(j))}</div>
    <div class="meta">${tr('hyper_traffic.run_line',{a:esc(CITY[j.a].name),b:esc(CITY[j.b].name),g:fmtG(x?x.got:0),want:fmtG(x?x.want:j.g)})}</div>${hsBar(f,late)}
    <div class="meta"${late?' style="color:var(--bad)"':''}>${tr('hyper_traffic.run_done',{done:hsTb(j.done),tb:hsTb(j.tb),date:dateStr(j.due)})}${own?'':' · '+tr('hyper_traffic.pays',{fee:fmt$(late?Math.round(fee/2):fee)})}</div>
    ${st?`<div class="why">${st}</div>`:''}${x&&x.want>1e-9&&x.got<x.want*0.999?`<div class="why">${tr('hyper_traffic.run_short',{g:fmtG(x.want-x.got)})}</div>`:''}</div></div>`;}
/* What a run costs while it runs (GPUs and power in both regions, hsTrainCost) and about how much in all, next to what it
   pays: half as the data moves, the rest at the end. Red when the cost of the whole run is more than the cash at hand. */
function hsOfferCost(o){const mo=2*hsTrainMw(o)*HS_MW_MO*(o.legs?o.legs.length:1),all=Math.round(mo*o.wk*7/30.4);
  return `<div class="meta"${all>S.cash?' style="color:var(--bad)"':''}>${tr('hyper_traffic.offer_cost',{mo:fmt$(mo),all:fmt$(all)})}</div>`;}
function hsOfferRow(o){const why=o.cl?hsClWhy({legs:o.legs},o.g):hsTrainWhy(o.a,o.b,o.g);
  return `<div class="meta">🤖 ${o.cl?hsClOfferLine(o):tr('hyper_traffic.offer_line',{lab:esc(o.n),g:fmtG(o.g),a:esc(CITY[o.a].name),b:esc(CITY[o.b].name),n:o.wk,fee:fmt$(o.fee)})}</div>${hsOfferCost(o)}${hsRvJobNote(o)}
    ${why?`<div class="why">${why}</div>`:''}<div class="btns">${btn(tr('hyper_traffic.take_job'),'hsJobTake',{id:o.id},'pink sm',!!why)}${btn(tr('hyper_traffic.decline'),'hsJobNo',{id:o.id},'ghost sm')}</div>`;}
function hsTrafficStat(){const H=S.hs;if(!H||!H.jobs)return '';const o=R.hs,rep=o&&o.rep?Object.values(o.rep):[];let h='';
  if(rep.length){let g=0,w=0;for(const x of rep){g+=x.got;w+=x.want;}const lag=Object.values(H.lag).reduce((a,v)=>a+v,0);
    h+=`<div class="meta"${lag>0?' style="color:var(--bad)"':''}>🔁 ${tr('hyper_traffic.card_rep',{g:fmtG(g),want:fmtG(w)})}${lag>0?' · '+tr('hyper_traffic.card_lag',{tb:hsTb(lag)}):''}</div>`;}
  // Supercluster legs have their own lines (hsClStat).
  const JB=H.jobs.filter(j=>!j.grp);if(JB.length){const nx=JB.reduce((a,j)=>j.due<a.due?j:a);h+=`<div class="meta"${S.day>nx.due?' style="color:var(--bad)"':''}>🤖 ${trn('hyper_traffic.card_jobs',JB.length,{date:dateStr(nx.due)})}</div>`;}
  for(const m of H.own.filter(m=>!m.grp))h+=`<div class="meta">🧠 ${tr('hyper_traffic.card_own',{name:HS_MODELS[m.n],p:pct(m.done/m.tb),date:dateStr(m.due)})}</div>`;
  const f=hsBoostF();if(f)h+=`<div class="meta"${f<0?' style="color:var(--bad)"':''}>${f>0?'✨ '+tr('hyper_traffic.card_boost',{p:pct(f),date:dateStr(H.boost.until)}):tr('hyper_traffic.card_flop',{date:dateStr(H.boost.until)})}</div>`;
  return h;}
const hsTrafficOffers=()=>S.hs&&S.hs.jo?S.hs.jo.map(hsOfferRow).join(''):'';
const hsSel=(act,args,opts)=>`<select data-chg="${act}" data-args="${esc(JSON.stringify(args))}" style="max-width:100%">${opts.map(([v,l,s])=>`<option value="${esc(v)}"${s?' selected':''}>${esc(l)}</option>`).join('')}</select>`;
// The Cloud tab's section: a summary (to which replica, got of wanted) and flags for a backlog or a run short.
function hsBtSpec(c){const H=S.hs;if(!H||!H.jobs||!H.rg[c])return null;const x=R.hs&&R.hs.rep&&R.hs.rep[c],fl=[];let sum='';
  if(x){sum=tr('hyper_ui.sum_rep',{city:esc(CITY[x.b].name),got:fmtG(x.got),want:fmtG(x.want)});if(x.got<x.want*0.999)fl.push(hsFlag('selective',tr('hyper_ui.f_short')));}
  if(hsLagAt(c)>0)fl.push(hsFlag('restrictive',tr('hyper_ui.f_backlog')));
  const rx=R.hs&&R.hs.jobs||{};if(hsRuns().some(j=>(j.a===c||j.b===c)&&rx[j.id]&&rx[j.id].got<rx[j.id].want*0.999))fl.push(hsFlag('selective',tr('hyper_ui.f_run_short')));
  if(H.jo.some(o=>o.a===c||o.b===c))fl.push(hsFlag('st on',tr('hyper_ui.f_offer')));
  return {t:tr('hyper_traffic.between_regions'),sum,flags:fl,open:hsLive(c)&&hsRgs().length>1,body:()=>hsBtBody(c)};}
const hsBtSection=c=>hsSec('bt',hsBtSpec(c));
function hsBtBody(c){const H=S.hs;let h='';
  if(!hsLive(c))return `<p class="meta">${tr('hyper_traffic.not_live_yet')}</p>`;
  const others=hsRgs().filter(r=>r!==c&&!hsWall(c,r));if(!others.length)return `<p class="lead">${tr('hyper_traffic.second_region_lead')}</p>`;
  const x=R.hs&&R.hs.rep&&R.hs.rep[c],b=x?x.b:hsRepOf(c),set=H.rep[c]===b,lag=hsLagAt(c);
  h+=`<p class="lead">${tr('hyper_traffic.rep_lead',{p:pct(HS_REP)})}</p>`;
  h+=`<div class="trsel"><label>${tr('hyper_traffic.replica')} ${hsSel('hsReplica',{city:c},(set?[]:[['',tr('hyper_traffic.suggested',{city:CITY[b].name}),true]]).concat(others.map(r=>[r,CITY[r].name,set&&r===b])))}</label></div>`;
  if(x){h+=hsKv(tr('hyper_traffic.replication'),tr('city_panel.a_of_b',{a:fmtG(x.got),b:fmtG(x.want)}))+hsBar(x.want>1e-9?x.got/x.want:1,x.got<x.want*0.999);
    if(x.got>1e-9)h+=`<p class="meta">${tr('hyper_traffic.rep_path',{ms:Math.round(x.ms),n:x.paths.length})}${x.te?' · '+tr('hyper_traffic.by_te'):''}</p>`;}
  h+=hsKv(tr('hyper_traffic.backlog'),hsTb(lag),lag>0?'color:var(--bad)':'');
  if(lag>0)h+=`<p class="why">${tr('hyper_traffic.backlog_risk')}</p>`;
  const pm=H.pp[hsPk(c,b)]||'';
  h+=`<div class="trsel"><label>${tr('hyper_traffic.paths')} ${hsSel('hsPath',{a:c,b},[['',tr('hyper_traffic.path_short'),!pm],['scenic',tr('hyper_traffic.path_scenic'),pm==='scenic'],['diverse',tr('hyper_traffic.path_diverse'),pm==='diverse']])}</label></div>`;
  const runs=hsRuns().filter(j=>j.a===c||j.b===c);for(const j of runs)h+=hsRunRow(j,c);
  for(const o of H.jo.filter(o=>o.a===c||o.b===c))h+=hsOfferRow(o);
  const f=hsBoostF();if(f>0)h+=`<p class="meta">✨ ${tr('hyper_traffic.card_boost',{p:pct(f),date:dateStr(H.boost.until)})}</p>`;
  if(!H.own.length){h+=`<p class="meta">${tr('hyper_traffic.own_lead',{b:esc(CITY[b].name)})}</p>`;const bs=HS_OWN.map((P,k)=>{const w=hsTrainWhy(c,b,P.g);return [btn(tr('hyper_traffic.train_size',{size:tr(P.n),g:fmtG(P.g),n:P.wk}),'hsTrain',{city:c,k,to:b},k?'sm':'pink sm',!!w),w];});
    h+=hsBtns(...bs.map(x=>x[0]));const w=bs.find(x=>x[1]);if(w&&bs.every(x=>x[1]))h+=`<p class="why">${w[1]}</p>`;}
  return h;}
// The data lake on the cloud card: where it is, what arrives, and what stale data costs.
function hsLakeStat(){const k=R.hs&&R.hs.lake;if(!k||!k.c||!(k.want>1e-9))return '';const f=hsFresh(R),loss=HS_LAKE_REV*(1-f);
  return `<div class="meta${f<0.9?' why':''}">🗄️ ${tr('hyper_traffic.lake_line',{city:esc(CITY[k.c].name),got:fmtG(k.got),want:fmtG(k.want),p:pct(f)})}${loss>=0.005?' '+tr('hyper_traffic.lake_stale',{p:pct(loss)}):''}</div>`;}
// Tubular on the cloud card: the offer from its level on, then its audience and how much of it the edge serves.
function hsVidStat(){const H=S.hs;if(!H)return '';
  if(!H.vid){if(lvl()<HS_VID.lv)return '';const w=hsVidWhy();return `<div class="meta">📺 ${tr('hyper_video.offer',{x:HS_VID.max,p:pct(HS_VID.edge),r:pct(HS_VID.rate)})}</div>${hsBtns(btn(tr('hyper_video.launch_cost',{cost:fmt$(HS_VID.cost)}),'hsVidLaunch',{},'pink sm',!!w||S.cash<HS_VID.cost))}`;}
  const o=R.hs;let D=0,st=0;if(o)for(const cc in o.cc){D+=o.cc[cc].D;st+=o.cc[cc].st+(o.cc[cc].nd||0);}const v=hsVidF(),vd=D*v/(1+v),ve=Math.min(vd,st*(v*HS_VID.edge/(HS_EDGE+v*HS_VID.edge)||0));
  return `<div class="meta${vd>1&&ve<vd*0.5?' why':''}">📺 ${tr('hyper_video.live',{g:fmtG(vd),p:pct(v/HS_VID.max),e:pct(vd>1e-9?ve/vd:0)})}</div>`;}
// A supercluster offer: its three regions, the Gbps on each leg, each leg's latency limit, and the fee.
function hsClOfferLine(o){const r=[...new Set(o.legs.flat())],lim=o.legs.map(([a,b])=>hsClLim(a,b)+' ms').join(' / ');
  return tr('hyper_super.offer_line',{lab:esc(o.n),a:esc(CITY[r[0]].name),b:esc(CITY[r[1]].name),c:esc(CITY[r[2]].name),g:fmtG(o.g),n:o.wk,lim,fee:fmt$(o.fee)});}
// Superclusters running on the card (each leg's latency against its limit, a stalled one in red), and from level
// HS_CL.flv the frontier model's button.
function hsClStat(){const H=S.hs;if(!H)return '';let h='';
  for(const G of H.cl||[]){const L=hsClLegs(G),fed=L.length?Math.min(...L.map(j=>j.done/j.tb)):0,x=id=>R.hs&&R.hs.jobs&&R.hs.jobs[id];
    const legs=L.map(j=>{const v=x(j.id),ms=v&&v.got>1e-9?v.ms:0,slow=ms>j.lim;return `<span${slow?' style="color:var(--bad)"':''}>${esc(CITY[j.a].name)}–${esc(CITY[j.b].name)} ${ms?Math.round(ms*10)/10:'–'}/${j.lim} ms${slow?' ⚠️':''}</span>`;}).join(' · ');
    h+=`<div class="meta${L.some(j=>hsClSlow(j))?' why':''}">🧠 ${tr(G.k==='own'?N_('hyper_super.frontier_running'):N_('hyper_super.running'),{name:esc(G.n),p:pct(fed),date:dateStr(G.due)})}<br>${legs}</div>`;}
  if(lvl()>=HS_CL.flv&&!(H.cl||[]).some(G=>G.k==='own')){const P=hsClPick(hsRgs()),w=hsFrontierWhy(),F=HS_CL.frontier;
    if(P)h+=`<div class="meta">🧠 ${tr('hyper_super.frontier_offer',{a:esc(CITY[P.rgs[0]].name),b:esc(CITY[P.rgs[1]].name),c:esc(CITY[P.rgs[2]].name),g:fmtG(F.g),n:F.wk,mo:fmt$(2*2*hsTrainMw({g:F.g})*HS_MW_MO)})}</div>${w?`<div class="why">${w}</div>`:''}${hsBtns(btn(tr('hyper_super.frontier_go'),'hsFrontier',{},'pink sm',!!w))}`;}
  return h;}
