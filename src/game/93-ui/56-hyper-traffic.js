/* ---------- The Hyperscaler between regions in the interface (38-hyper-traffic.js) ----------
   Parts of the charter card (55-hyper-panel.js): replication against what it wanted and the backlog, AI runs and when
   the next is due, a model in training or its boost (lines), and AI labs' offers to take or decline (the offers fold).
   In the Cloud tab of a region's city: its replica, what replication got tonight, the backlog it owes, how the pair's
   bulk travels, the runs touching it and your own model. */
const hsRunName=j=>j.k!==undefined?HS_MODELS[j.n]:j.n;
function hsRunRow(j,c){const x=R.hs&&R.hs.jobs&&R.hs.jobs[j.id],own=j.k!==undefined,late=S.day>j.due,f=j.tb>0?j.done/j.tb:0;
  return `<div class="row"><div class="grow"><div class="nm">${own?'🧠':'🤖'} ${esc(hsRunName(j))}</div>
    <div class="meta">${tr('hyper_traffic.run_line',{a:esc(CITY[j.a].name),b:esc(CITY[j.b].name),g:fmtG(x?x.got:0),want:fmtG(x?x.want:j.g)})}</div>${hsBar(f,late)}
    <div class="meta"${late?' style="color:var(--bad)"':''}>${tr('hyper_traffic.run_done',{done:hsTb(j.done),tb:hsTb(j.tb),date:dateStr(j.due)})}${own?'':' · '+tr('hyper_traffic.pays',{fee:fmt$(late?Math.round(j.fee/2):j.fee)})}</div>
    ${x&&x.want>1e-9&&x.got<x.want*0.999?`<div class="why">${tr('hyper_traffic.run_short',{g:fmtG(x.want-x.got)})}</div>`:''}</div></div>`;}
function hsOfferRow(o){const why=hsTrainWhy(o.a,o.b,o.g);
  return `<div class="meta">🤖 ${tr('hyper_traffic.offer_line',{lab:esc(o.n),g:fmtG(o.g),a:esc(CITY[o.a].name),b:esc(CITY[o.b].name),n:o.wk,fee:fmt$(o.fee)})}</div>${hsRvJobNote(o)}
    ${why?`<div class="why">${why}</div>`:''}<div class="btns">${btn(tr('hyper_traffic.take_job'),'hsJobTake',{id:o.id},'pink sm',!!why)}${btn(tr('hyper_traffic.decline'),'hsJobNo',{id:o.id},'ghost sm')}</div>`;}
function hsTrafficStat(){const H=S.hs;if(!H||!H.jobs)return '';const o=R.hs,rep=o&&o.rep?Object.values(o.rep):[];let h='';
  if(rep.length){let g=0,w=0;for(const x of rep){g+=x.got;w+=x.want;}const lag=Object.values(H.lag).reduce((a,v)=>a+v,0);
    h+=`<div class="meta"${lag>0?' style="color:var(--bad)"':''}>🔁 ${tr('hyper_traffic.card_rep',{g:fmtG(g),want:fmtG(w)})}${lag>0?' · '+tr('hyper_traffic.card_lag',{tb:hsTb(lag)}):''}</div>`;}
  if(H.jobs.length){const nx=H.jobs.reduce((a,j)=>j.due<a.due?j:a);h+=`<div class="meta"${S.day>nx.due?' style="color:var(--bad)"':''}>🤖 ${trn('hyper_traffic.card_jobs',H.jobs.length,{date:dateStr(nx.due)})}</div>`;}
  for(const m of H.own)h+=`<div class="meta">🧠 ${tr('hyper_traffic.card_own',{name:HS_MODELS[m.n],p:pct(m.done/m.tb),date:dateStr(m.due)})}</div>`;
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
  const others=hsRgs().filter(r=>r!==c);if(!others.length)return `<p class="lead">${tr('hyper_traffic.second_region_lead')}</p>`;
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
