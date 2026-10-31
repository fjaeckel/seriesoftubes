const OPS_TPL_L={bb:N_('ops.tpl_bb'),transit:N_('ops.tpl_transit'),ix:N_('ops.tpl_ix'),kit:N_('ops.tpl_kit')};
// The Ops panel: the intern, their shift log, and the standing orders with their dials. A bottom sheet on phones.
function opsCard(){if(!S)return '';const last=opsHired()&&S.ops.log[0];
  return `<div class="ops-card"><div class="nm">${opsHired()?`${INTERNS[S.ops.intern].i} ${esc(tr('ops.ops_name',{name:opsName(true)}))}`:`🧑‍💻 ${tr('ops.standing_orders')}`}</div>
    <div class="meta">${opsHired()?esc(last?opsEntry(last):tr('ops.l_quiet',{name:opsName()})):opsCanHire()?tr('ops.hire_pitch_short'):tr('ops.locked',{lv:2})}</div>
    <div class="btns">${btn(opsHired()?tr('ops.standing_orders'):tr('ops.hire_an_intern'),'opsOpen',{},opsHired()?'sm':'pink sm',!opsHired()&&!opsCanHire())}</div></div>`;}
const opsEntry=e=>(e.f!==undefined?opsFFLine(e)+' ':'')+(e.r.length||e.f===undefined?opsLine(e):'');
function opsVal(k,p){const P=OPSK[k].p[p],v=opsP(k,p);return p==='prov'?(v==='cheap'?tr('ops.cheapest'):NET[v].name):P.f(v);}
function opsOrderHtml(d){const k=d.k,on=S.ops.on[k],cap=d.cap?opsCap(k):0,sp=S.ops.spent[k]||0,am=Math.round(S.ops.addMo[k]||0);
  return `<div class="ops-o${on?' on':''}"><div class="ops-h"><span class="ops-i" aria-hidden="true">${d.i}</span><div class="grow"><div class="nm">${tr(d.t)}</div><div class="meta">${tr(d.d)}${k==='caches'?' '+tr('ops.caches_rent',{price:fmt$(CACHE_MO)}):''}</div></div>
    <button class="b sm ${on?'green':'ghost'}" data-act="opsToggle" data-args='{"k":"${k}"}' aria-pressed="${on}" aria-label="${esc(tr(d.t))}">${on?tr('common.on'):tr('ops.paused')}</button></div>
    ${on?`<div class="ops-p">${Object.keys(d.p).map(p=>btn(`${tr(d.p[p].l)}: <b>${esc(opsVal(k,p))}</b>`,'opsParam',{k,p},'ghost sm')).join('')}
    ${d.cap?btn(`${d.mo?tr('ops.budget_running'):tr('ops.budget')}: <b>${cap?tr('common.price_mo',{price:(d.mo?'+':'')+fmt$(cap)}):tr('ops.no_cap')}</b>`,'opsCap',{k},'ghost sm'):''}</div>
    ${sp||am?`<div class="meta">${tr('ops.spent_and_mo',{price:fmt$(sp),mo:opsMo$(am)})}</div>`:''}
    ${k==='ix'&&ppol()!=='open'?`<p class="why">${tr('link_panels.off_while_your_peering_policy_is',{pol:tr(PPOL_N[ppol()])})}</p>`:''}`:''}</div>`;}
function opsModal(){if(!S)return;const hired=opsHired();let h=`<div style="display:flex;align-items:center"><div><div class="eyebrow">${tr('ops.ops')}</div><h2 style="font-size:26px">${tr('ops.standing_orders')}</h2></div><button class="x" data-act="closeModal" aria-label="${tr('common.close')}">×</button></div>`;
  if(!hired){h+=`<p class="tagline">${tr('ops.hire_pitch_weekly')}</p>`;
    if(!rule('clock'))h+=`<p class="why">${tr('ops.no_clock')}</p>`;else if(!opsCanHire())h+=`<p class="why">${tr('ops.locked',{lv:2})}</p>`;
    else h+=Object.entries(INTERNS).map(([id,I])=>`<div class="ops-o"><div class="ops-h"><span class="ops-i" aria-hidden="true">${I.i}</span><div class="grow"><div class="nm">${tr(I.n)}</div><div class="meta">${tr(I.d)}</div></div>
      ${btn(tr('ops.hire_mo',{price:fmt$(INTERN_MO)}),'opsHire',{id},'pink sm',S.cash<INTERN_MO)}</div></div>`).join('');
    openModal(h+opsOnceHtml(),'ops');return;}
  const O=S.ops,I=INTERNS[O.intern];
  h+=`<div class="ops-o on"><div class="ops-h"><span class="ops-i" aria-hidden="true">${I.i}</span><div class="grow"><div class="nm">${tr(I.n)}</div><div class="meta">${tr('ops.salary',{price:fmt$(INTERN_MO),d:dateStr(O.hired)})}</div></div>
    ${btn(UI.confirm==='opsFire'?tr('ops.really_fire'):tr('ops.fire'),'opsFire',{},'ghost sm')}</div>
    <p class="ops-mood">${esc(opsMood())}</p>${opsReportHtml()}
    ${O.log.length?`<pre class="term ops-log">${O.log.slice(0,6).map(e=>esc(tr('ops.day_d',{d:e.d})+': '+opsEntry(e))).join('\n')}</pre>`:''}
    <div class="ops-p">${btn(`${tr('ops.floor')}: <b>${O.floor?fmt$(O.floor):tr('ops.no_cap')}</b>`,'opsFloor',{},'ghost sm')}</div></div>`;
  h+=`<p class="note">${tr('ops.how_it_works',{name:opsName()})}</p>`+OPS.map(opsOrderHtml).join('');
  // Per POP: switch single orders off where the player wants to decide by hand.
  const cities=Object.keys(S.pops).sort((a,b)=>CITY[a].name.localeCompare(CITY[b].name)),c=S.pops[UI.opsCity]?UI.opsCity:cities[0];
  if(c)h+=`<section><h3>${tr('ops.per_pop')}</h3><div class="trsel"><label>${tr('common.your_pop')}<select data-chg="opsCity">${cities.map(x=>`<option value="${x}"${x===c?' selected':''}>${esc(CITY[x].name)}</option>`).join('')}</select></label></div>
    <div class="ops-p">${OPS_POP.map(k=>{const here=opsHere(k,c);return `<button class="b sm ${here?'green':'ghost'}" data-act="opsPop" data-args="${esc(JSON.stringify({k,city:c}))}" aria-pressed="${here}">${OPSK[k].i} ${tr(OPSK[k].t)}</button>`;}).join('')}</div>
    <p class="meta">${tr('ops.per_pop_note')}</p></section>`;
  h+=`<section><h3>${tr('ops.template')}</h3><p class="meta">${tr('ops.template_note',{name:opsName()})}</p><div class="ops-p">${OPS_TPL.map(k=>`<button class="b sm ${O.tpl[k]?'green':'ghost'}" data-act="opsTpl" data-args='{"k":"${k}"}' aria-pressed="${O.tpl[k]}">${tr(OPS_TPL_L[k])}</button>`).join('')}</div></section>`;
  h+=opsOnceHtml();openModal(h,'ops');}
// The shift report: last week in one paragraph, and this week so far. The daily lines below are the detail.
function opsReportHtml(){const O=S.ops,w=Math.floor(S.day/7),cur=O.wk&&O.wk.w===w&&opsWkAny(O.wk)?O.wk:null,rep=O.rep&&O.rep.w===w-1?O.rep:null;if(!cur&&!rep)return '';
  const row=(t,x)=>`<div class="ops-rep"><div class="eyebrow">${t}</div><div>${esc(opsWeekLine(x))}</div></div>`;
  return (rep?row(tr('ops.report_last'),rep):'')+(cur?row(tr('ops.report_now'),cur):'');}
// The big one-off batches (#181, #192) live here now, next to the orders that run them every week.
const opsOnceHtml=()=>`<section><h3>${tr('ops.by_hand')}</h3><p class="meta">${tr('ops.by_hand_note')}</p><div class="btns">${btn(tr('utilities.title'),'utilities',{},'sm')}${btn(tr('pni_all.peer_all_networks'),'pniAllOpen',{net:null},'sm')}</div></section>`;
// On a city without a POP: open it from the template in one tap.
function opsTplHtml(c){if(!opsHired())return '';const q=opsTplQuote(c);if(!q)return '';
  return `<section><h3>${tr('ops.template')}</h3><p class="meta">${esc(tr('ops.tpl_offer',{name:opsName(),list:[tr('ops.tpl_pop'),...q.parts].join(', ')}))}</p><div class="btns">${btn(tr('ops.tpl_open',{cost:fmt$(q.cost)}),'opsNewPop',{city:c},'pink',S.cash<q.cost)}</div></section>`;}
