/* ---------- The Hyperscaler's forecasts in the interface (38-hyper-forecast.js) ----------
   The plan in the NOC's Cloud tab: what runs out first, soonest first, each with its fix, how long the fix takes against
   the time left (red "order now" when it takes longer), and buttons for the fix and the city. The calendar: dates
   already known, in one list (the next two also in the charter card's details). The card's next step (hsNext) takes
   the most urgent forecast when nothing is on fire. In the city panel's Cloud tab, the region and front door sections
   say when they are full, the region's grid what the next tier needs, the users' section why growth is capped. */
const hpDays=n=>n===null||n===undefined?tr('hyper_plan.not_within_year'):n<=0?tr('hyper_plan.now'):trn('hyper_plan.days',n);
const hpLead=n=>trn('hyper_plan.lead_days',Math.max(0,n|0));
const hpCity=c=>esc(CITY[c].name);
const hpFc=()=>{const h=hp();return h?h.F:null;};
// What runs out, in words.
function hpWhat(x){const v={city:hpCity(x.c),d:hpDays(x.d)};
  if(x.k==='rg')return x.d>0?tr('hyper_plan.rg_full',v):tr('hyper_plan.rg_full_now',v);
  if(x.k==='colo'){const w={city:hpCity(x.b),d:v.d};return x.d>0?tr('hyper_plan.rg_full',w):tr('hyper_plan.rg_full_now',w);}
  if(x.k==='az')return x.o>=2?trn('hyper_plan.az_outages',x.o,{city:v.city}):tr('hyper_plan.az_one',{city:v.city});
  if(x.k==='grid')return tr('hyper_plan.grid_full',{city:v.city,mw:Math.max(0,Math.floor(hsMwFree(x.c)*10)/10)});
  if(x.k==='door')return x.d>0?tr('hyper_plan.door_full',v):tr('hyper_plan.door_full_now',v);
  const ab={a:hpCity(x.c),b:hpCity(x.b),d:v.d,n:HS_RISK};
  if(x.k==='lag')return x.d>0?tr('hyper_plan.lag_risk',ab):tr('hyper_plan.lag_risk_now',ab);
  if(x.k==='rep')return tr('hyper_plan.rep_outgrows',ab);
  const j=hsRuns().find(j=>j.id===x.id),run=j?esc(hsRunName(j)):'';
  return x.eta===null?tr('hyper_plan.run_stalled',{run,date:dateStr(S.day+x.d)}):tr('hyper_plan.run_late',{run,d:hpDays(x.eta),date:dateStr(S.day+x.d)});}
// The fix, in words.
function hpFix(x){const c=x.c,util=x.c?tr(hsUtil(c)):'',T=x.t!==undefined?HS_T[x.t]:null,N=T?tr(T.n):'';
  switch(x.fix){
    case 'coming':return tr('hyper_plan.fix_coming',{name:N,date:dateStr(S.day+x.lead)});
    case 'up':return tr('hyper_plan.fix_up',{name:N,lead:hpLead(x.lead)});
    case 'new':return tr('hyper_plan.fix_new',{name:N,lead:hpLead(x.lead)});
    case 'lvl':return tr('hyper_plan.fix_lvl',{n:hsRgMax()});
    case 'mor':return tr('hyper_plan.fix_mor',{city:hpCity(c)});
    case 'pw':return tr('hyper_plan.fix_pw',{util,mw:HS_Q_MW,q:hpLead(x.q),name:N,lead:hpLead(x.lead-x.q)});
    case 'pwq':return T?tr('hyper_plan.fix_pwq',{util,date:dateStr(S.day+x.q),name:N,lead:hpLead(x.lead-x.q)}):tr('hyper_plan.fix_pwq_grid',{util,date:dateStr(S.day+x.lead)});
    case 'util':return tr('hyper_plan.fix_util',{util,mw:HS_Q_MW,lead:hpLead(x.lead)});
    case 'port':return tr('hyper_plan.fix_port');
    case 'move':return tr('hyper_plan.fix_move',{name:N,lead:hpLead(x.lead)});
    case 'colo':return tr('hyper_plan.fix_colo',{prov:tr(hsColoP(c)),city:hpCity(c),lead:hpLead(x.lead),mo:fmt$(HS_T[HS_CAGE].mo)});
    case 'zone':return tr('hyper_plan.fix_zone',{cost:fmt$(hsAzCost(c)),lead:hpLead(x.lead)});
    default:return tr('hyper_plan.fix_wave',{a:hpCity(c),b:hpCity(x.b)});}}
// The fix's button (or ''), and the city's.
function hpFixBtn(x,cls){const c=x.c;cls=cls||'sm';
  if(x.fix==='up'){const N=HS_T[x.t];return btn(tr('hyper_plan.b_grow',{name:tr(N.n),cost:fmt$(hsCost(x.t))}),'hsRegion',{city:c},cls,S.cash<hsCost(x.t)||chFrozen()!==null);}
  if(x.fix==='pw'||x.fix==='util')return btn(tr('hyper_plan.b_util',{mw:HS_Q_MW,cost:fmt$(HS_Q_FEE)}),'hsUtil',{city:c},cls,S.cash<HS_Q_FEE);
  if(x.fix==='port')return btn(tr('hyper_plan.b_port'),'hsPlanGo',{city:c,k:'up'},cls);
  if(x.fix==='move'){const N=HS_T[1];return btn(tr('hyper_colo.move_cost',{cost:fmt$(hsCost(1))}),'hsColoOut',{city:c},cls,S.cash<hsCost(1)||chFrozen()!==null);}
  if(x.fix==='colo'){const T=HS_T[HS_CAGE];return S.pops[c]?btn(tr('hyper_colo.lease_cost',{cost:fmt$(T.cost)}),'hsColo',{city:c},cls,S.cash<T.cost||chFrozen()!==null||!!hsColoWhy(c)):'';}
  if(x.fix==='zone'){const k=hsAzCost(c);return btn(tr('hyper_az.add_cost',{cost:fmt$(k)}),'hsZone',{city:c},cls,S.cash<k||chFrozen()!==null||!!hsAzWhy(c));}
  if(x.fix==='wave')return btn(modeOn('autarky')?tr('hyper_plan.b_dig'):tr('hyper_plan.b_wave'),'hsPlanGo',{city:c,k:'links'},cls);
  if(x.fix==='new')return btn(tr('hyper_plan.b_new'),'hsPlanGo',{city:c,k:'cust'},cls);
  return '';}
const hpOpenBtn=x=>btn(tr('common.open'),'hsPlanGo',{city:x.c,k:'cust'},'ghost sm');
const hpIcon={rg:'🏢',colo:'🔐',grid:'⚡',door:'🚪',lag:'🔁',rep:'🔁',run:'🤖',az:'🧱'};
// Time left against the fix's lead time.
function hpTags(x){if(x.k==='az')return hnocFlags([hnocTag('st',tr('hyper_plan.t_takes',{d:hpLead(x.lead)})),hnocTag('open',tr('hyper_plan.t_az'))]);const t=[hnocTag('st',x.d>0?tr('hyper_plan.t_left',{d:hpDays(x.d)}):tr('hyper_plan.t_out_now'))];if(x.lead!==null)t.push(hnocTag('st',tr('hyper_plan.t_takes',{d:hpLead(x.lead)})));
  t.push(x.red?hnocTag('restrictive',x.lead===null?tr('hyper_plan.t_no_fix'):tr('hyper_plan.t_order_now')):hnocTag('open',tr('hyper_plan.t_in_time')));return hnocFlags(t);}
const HP_ROWS=12;
function hpPlanSection(){const h=hp();if(!h)return '';const P=h.P;
  let s=`<div class="panel2" id="hpPlan" style="margin-top:12px"><h3>${tr('hyper_plan.h_plan')} <span class="meta">${P.length}</span></h3>`;
  if(!P.length)return s+`<p class="empty">${tr('hyper_plan.e_plan')}</p></div>`;
  s+=`<p class="note" style="margin-top:0">${tr('hyper_plan.plan_lead')}</p><div class="ilist">`+P.slice(0,HP_ROWS).map(x=>`<div class="row hprow${x.red?' red':''}"><div class="grow">
    <div class="nm">${hpIcon[x.k]} ${hpWhat(x)}</div><div class="meta">${hpFix(x)}</div>${hpTags(x)}${hsBtns(hpFixBtn(x,x.red?'pink sm':'sm'),hpOpenBtn(x))}</div></div>`).join('')+`</div>`;
  if(P.length>HP_ROWS)s+=`<p class="note">${trn('hyper_plan.n_more',P.length-HP_ROWS)}</p>`;
  return s+`</div>`;}
/* The calendar. */
const hpCalIcon={util:'⚡',gen:'☀️',rg:'🏗️',up:'🏗️',az:'🧱',link:'🧵',pni:'🔌',law:'🏛️',mor:'🔌',morend:'🔌',pue:'🌡️',eu:'🇪🇺',egr:'🏨',freeze:'🧊',launch:'🚀',run:'🤖',drill:'🧯',prot:'📣',ren:'📝'};
function hpCalText(e){const x=e.x,c=e.c,city=c?hpCity(c):'';
  switch(e.k){
    case 'util':return tr('hyper_plan.cal_util',{util:tr(hsUtil(c)),mw:x.mw,city});
    case 'gen':return tr('hyper_plan.cal_gen',{name:tr(HS_GEN[x.k].n),city});
    case 'rg':return tr('hyper_plan.cal_rg',{name:tr(HS_T[x.t].n),city});
    case 'up':return tr('hyper_plan.cal_up',{name:tr(HS_T[x.t].n),city});
    case 'az':return tr('hyper_plan.cal_az',{zone:hsAzName(c,x.i),city});
    case 'link':return tr('hyper_plan.cal_link',{a:hpCity(x.a),b:hpCity(x.b)});
    case 'pni':return tr('hyper_plan.cal_pni',{net:esc(NET[x.net].name),city});
    case 'law':return tr('hyper_plan.cal_law',{country:esc(ccName(x.cc))});
    case 'mor':return tr('hyper_plan.cal_mor',{city});
    case 'morend':return tr('hyper_plan.cal_mor_end',{city});
    case 'pue':return tr('hyper_plan.cal_pue',{reg:WAVE_NAME[x.reg]});
    case 'eu':return tr('hyper_plan.cal_eu');
    case 'egr':return tr('hyper_plan.cal_egr');
    case 'freeze':return tr('hyper_plan.cal_freeze',{game:HS_GAMES[x.g]});
    case 'launch':{const b=S.biz.find(b=>b.id===x.id);return tr('hyper_plan.cal_launch',{game:HS_GAMES[x.g],name:b?esc(b.name):''});}
    case 'run':{const j=hsRuns().find(j=>j.id===x.id);return tr('hyper_plan.cal_run',{run:j?esc(hsRunName(j)):''});}
    case 'drill':return tr('hyper_plan.cal_drill',{a:city,b:hpCity(x.b)});
    case 'prot':return tr('hyper_plan.cal_prot',{grp:tr(HS_GRP[x.g]),city});
    default:{const b=S.biz.find(b=>b.id===x.id);return tr('hyper_plan.cal_ren',{name:b?esc(b.name):'',mo:b?fmt$(bizMo(b)):''});}}}
const hpIn=d=>d<=S.day?tr('hyper_plan.today'):trn('hyper_plan.in_n_days',d-S.day);
const HP_CAL_ROWS=12;
function hpCalSection(){const h=hp();if(!h)return '';const C=h.C;
  let s=`<div class="panel2" id="hpCal" style="margin-top:12px"><h3>${tr('hyper_plan.h_cal')} <span class="meta">${C.length}</span></h3>`;
  if(!C.length)return s+`<p class="empty">${tr('hyper_plan.e_cal')}</p></div>`;
  s+=`<div class="ilist">`+C.slice(0,HP_CAL_ROWS).map(e=>{const body=`<div class="meta"><b>${dateStr(e.d)}</b> · ${hpIn(e.d)}</div><div class="hpcal">${hpCalIcon[e.k]||'📅'} ${hpCalText(e)}</div>`;
    return e.c?hnocRow(e.c,body,null,false):`<div class="row"><div class="grow">${body}</div></div>`;}).join('')+`</div>`;
  if(C.length>HP_CAL_ROWS)s+=`<p class="note">${trn('hyper_plan.n_more_dates',C.length-HP_CAL_ROWS)}</p>`;
  return s+`</div>`;}
// The card's details: the next two dates.
function hpCalCard(){const h=hp();if(!h||!h.C.length)return '';return h.C.slice(0,2).map(e=>`<div class="meta">📅 ${tr('hyper_plan.cal_card',{date:dateStr(e.d),what:hpCalText(e)})}</div>`).join('');}
/* The card's next step: the most urgent forecast, when nothing is on fire (hsNext asks). */
function hpNextHtml(){const x=hpUrgent();if(!x||x.fix==='coming'&&!x.red||x.lead===null)return '';const n=Math.max(1,x.d),c=x.c,v={city:hpCity(c),n};let t;
  // Out already (a backlog past the mark, a grid with no room): what is wrong, and the fix.
  if(x.d<=0)return `<div class="hsc-nx bad"><b>👉 ${tr('hyper_plan.nx_now',{what:hpWhat(x),fix:hpFix(x)})}</b></div>${hsBtns(hpFixBtn(x,'pink sm'),hpOpenBtn(x))}`;
  if(x.k==='rg'){const N=tr(HS_T[x.t].n);
    t=x.fix==='pw'?tr('hyper_plan.nx_rg_pw',{...v,q:x.q,name:N,lead:x.lead-x.q}):x.fix==='pwq'?tr('hyper_plan.nx_rg_pwq',{...v,date:dateStr(S.day+x.q),name:N})
      :x.fix==='coming'?tr('hyper_plan.nx_rg_coming',{...v,name:N,date:dateStr(S.day+x.lead)}):tr('hyper_plan.nx_rg',{...v,name:N,lead:x.lead});}
  else if(x.k==='colo')t=tr('hyper_plan.nx_colo',{city:hpCity(x.b),n,at:v.city,prov:tr(hsColoP(c)),lead:x.lead});
  else if(x.k==='grid')t=tr('hyper_plan.nx_grid',{city:v.city});
  else if(x.k==='door')t=tr('hyper_plan.nx_door',v);
  else if(x.k==='lag')t=tr('hyper_plan.nx_lag',{a:v.city,b:hpCity(x.b),n,tb:HS_RISK});
  else if(x.k==='rep')t=tr('hyper_plan.nx_rep',{a:v.city,b:hpCity(x.b),n});
  else{const j=hsRuns().find(j=>j.id===x.id);t=tr('hyper_plan.nx_run',{run:j?esc(hsRunName(j)):'',a:v.city,b:hpCity(x.b)});}
  const go=x.fix==='coming'||x.fix==='pwq'?'':x.red?tr('hyper_plan.start_now'):trn('hyper_plan.start_within',Math.max(1,x.d-x.lead));
  return `<div class="hsc-nx${x.red?' bad':''}"><b>👉 ${t}${go?' '+go:''}</b></div>${hsBtns(hpFixBtn(x,'pink sm'),hpOpenBtn(x))}`;}
/* The Cloud tab. */
const hpItem=(k,c)=>{const h=hp();return h?h.P.find(x=>x.k===k&&x.c===c)||null:null;};
// The region: when it is full, its grid against the next tier, its backlog's direction, and the fix.
function hpRgLines(c){const F=hpFc(),f=F&&F.rg[c];if(!f)return '';const H=S.hs,rg=H.rg[c],N=hsTNext(rg);let h='';
  const g=fmtG(Math.max(0,f.rate)),diff=f.hd!==null&&f.d!==null&&f.d>0&&Math.abs(f.hd-f.d)>0.25*f.d;
  h+=`<p class="meta hpfc">📈 ${f.d===0?tr('hyper_plan.fc_rg_now'):f.d===null?(f.hd!==null?tr('hyper_plan.fc_rg_never_hist',{g,k:(H.lh[c]||[]).length,h:hpDays(f.hd)}):tr('hyper_plan.fc_rg_never',{g})):diff?tr('hyper_plan.fc_rg_hist',{d:hpDays(f.d),g,k:(H.lh[c]||[]).length,h:hpDays(f.hd)}):tr('hyper_plan.fc_rg',{d:hpDays(f.d),g})}</p>`;
  const free=Math.max(0,Math.floor(f.free));if(rg.t!==HS_CAGE)h+=`<p class="meta hpfc">⚡ ${N&&!rg.up?tr('hyper_plan.fc_grid',{free,need:f.need,name:tr(N.n)}):tr('hyper_plan.fc_grid_top',{free})}</p>`;
  const p=F.pair[hsLk(c,hsRepOf(c)||'')];if(p&&(p.tb>0.05||p.lag>0.05))h+=`<p class="meta hpfc${p.tb>0.05?' hnoc-bad':''}">🔁 ${p.tb>0.05?tr('hyper_plan.fc_lag_grows',{b:hpCity(p.b),tb:hsTb(p.tb)}):tr('hyper_plan.fc_lag_drains',{b:hpCity(p.b),tb:hsTb(-p.tb),d:hpDays(p.empty)})}</p>`;
  const x=hpItem('rg',c);if(x&&x.d<=HP_H)h+=`<p class="${x.red?'why':'note'}">${hpFix(x)}${x.red&&x.lead!==null?' · <b>'+tr('hyper_plan.t_order_now')+'</b>':''}</p>`;
  return h;}
// A flag for the region's section header when it fills within HP_SOON days.
function hpRgFlag(c){const F=hpFc(),f=F&&F.rg[c];return f&&f.d>0&&f.d<=HP_SOON?hsFlag('selective',tr('hyper_plan.f_full_in',{d:hpDays(f.d)})):null;}
function hpDoorLine(c){const F=hpFc(),f=F&&F.door[c];if(!f)return '';const v={d:hpDays(f.d),now:fmtG(f.now),cap:fmtG(f.cap)};
  return `<p class="meta hpfc${f.d===0?' hnoc-bad':''}">📈 ${f.far?tr('hyper_plan.fc_door_far',v):f.d===0?tr('hyper_plan.fc_door_now',v):f.d===null?tr('hyper_plan.fc_door_never',v):tr('hyper_plan.fc_door',v)}</p>`;}
const HP_WHY={nodoor:N_('hyper_plan.why_nodoor'),law:N_('hyper_plan.why_law'),room:N_('hyper_plan.why_room'),door:N_('hyper_plan.why_door'),haul:N_('hyper_plan.why_haul')};
function hpCcLine(cc){const F=hpFc(),w=F&&F.cc[cc];if(!w)return '';return `<p class="why hpfc">${tr('hyper_plan.capped',{why:w.map(k=>tr(HP_WHY[k])).join(' / ')})}</p>`;}
