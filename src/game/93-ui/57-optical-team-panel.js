// The optical team's sheet (a bottom sheet on phones, like the intern's): the team, how it builds, the routes waiting
// for you, its log, and the optical orders it now runs. Its card sits under the intern's in the NOC tab.
function optxCard(){if(!S||(!optxOn()&&!optxCanHire()))return '';const T=S.optx,P=optxOn()?OPTX[T.size]:null,last=P&&T.log[0];
  return `<div class="ops-card"><div class="nm">${P?`${P.i} ${tr(P.n)}`:`🔭 ${tr('optx.title')}`}${P&&T.prop.length?` <span class="cnt">${T.prop.length}</span>`:''}</div>
    <div class="meta">${P?esc(last?optxLine(last):tr('optx.l_quiet')):tr('optx.pitch_short')}</div>
    <div class="btns">${btn(P?tr('optx.title'):tr('optx.hire_team'),'optxOpen',{},P?'sm':'pink sm')}</div></div>`;}
const optxYr=v=>tr('optx.per_year',{price:fmt$(v*12)});
const optxBudName=v=>v?tr('optx.bud_v',{price:fmt$(v)}):tr('ops.no_cap');
// A route waiting for the player: where, what it costs and brings, and one tap to build it.
function optxPropHtml(p,i){const busy=optxBusy(),why=busy?tr('optx.busy'):S.cash<p.cost?tr('interface.not_enough_cash_wait_for_revenue'):'';
  return `<div class="ops-o"><div class="ops-h"><span class="ops-i" aria-hidden="true">${p.sub?'🚢':'🚜'}</span><div class="grow"><div class="nm">${esc(cmRouteName(p))} <span class="tag st">${p.sub?tr('common.subsea'):tr('common.land')}</span></div>
    <div class="meta">${tr('optx.prop_meta',{km:p.km.toLocaleString(),cost:fmt$(p.cost),n:p.days,mo:fmt$(p.mo),pb:p.pb})}</div>${why?`<p class="why">${why}</p>`:''}</div></div>
    <div class="btns">${btn(tr('optx.build',{cost:fmt$(p.cost)}),'optxBuild',{i},'pink sm',!!why)}${btn(tr('optx.drop'),'optxDrop',{i},'ghost sm')}</div></div>`;}
function optxModal(){if(!S)return;const T=S.optx;let h=`<div style="display:flex;align-items:center"><div><div class="eyebrow">${tr('ops.ops')}</div><h2 style="font-size:26px">${tr('optx.title')}</h2></div><button class="x" data-act="closeModal" aria-label="${tr('common.close')}">×</button></div>`;
  const sizes=(cur)=>Object.entries(OPTX).map(([id,P])=>`<div class="ops-o${id===cur?' on':''}"><div class="ops-h"><span class="ops-i" aria-hidden="true">${P.i}</span><div class="grow"><div class="nm">${tr(P.n)}</div><div class="meta">${tr(P.d)}</div>
      <div class="ops-good">${tr('optx.size_meta',{price:fmt$(P.mo),yr:optxYr(P.mo),n:P.proj,err:P.err})}</div></div>
      ${id===cur?'':btn(cur?tr('optx.resize'):tr('ops.hire_mo',{price:fmt$(P.mo)}),cur?'optxSize':'optxHire',{size:id},cur?'sm':'pink sm',!cur&&S.cash<P.mo)}</div></div>`).join('');
  if(!optxOn()){h+=`<p class="tagline">${tr('optx.pitch')}</p>`;
    if(!rule('clock'))h+=`<p class="why">${tr('ops.no_clock')}</p>`;else if(glassLvl()<OPTX_LV)h+=`<p class="why">${tr('optx.locked',{lv:OPTX_LV})}</p>`;else h+=sizes(null);
    openModal(h,'optx');return;}
  const P=OPTX[T.size],jobs=optxJobs();
  h+=`<div class="ops-o on"><div class="ops-h"><span class="ops-i" aria-hidden="true">${P.i}</span><div class="grow"><div class="nm">${tr(P.n)}</div><div class="meta">${tr('optx.salary',{price:fmt$(P.mo),yr:optxYr(P.mo),d:dateStr(T.hired)})}</div>
      <div class="ops-good">${trn('optx.jobs',jobs.length,{max:P.proj})}</div></div>${btn(UI.confirm==='optxFire'?tr('optx.really_fire'):tr('optx.fire'),'optxFire',{},'ghost sm')}</div>
    ${T.log.length?`<pre class="term ops-log">${T.log.slice(0,6).map(e=>esc(tr('ops.day_d',{d:e.d})+': '+optxLine(e))).join('\n')}</pre>`:''}</div>`;
  // How they build: ask or on their own, a year's budget, how long a route may take to pay back.
  h+=`<section><h3>${tr('optx.routes')}</h3><p class="meta">${tr('optx.routes_note')}</p>
    <div class="ops-p"><button class="b sm ${T.mode==='ask'?'green':'ghost'}" data-act="optxMode" data-args='{"v":"ask"}' aria-pressed="${T.mode==='ask'}">${tr('optx.mode_ask')}</button><button class="b sm ${T.mode==='auto'?'green':'ghost'}" data-act="optxMode" data-args='{"v":"auto"}' aria-pressed="${T.mode==='auto'}">${tr('optx.mode_auto')}</button></div>
    <div class="ops-p">${opsSel(tr('optx.bud'),'optxBud',{},OPTX_BUD,T.bud,optxBudName)}${opsSel(tr('optx.pay'),'optxPay',{},OPTX_PAY,T.pay,v=>tr('optx.pay_v',{n:v}))}${opsSel(tr('ops.floor'),'opsFloor',{},OPS_FLOORS,S.ops.floor,v=>v?fmt$(v):tr('ops.no_cap'))}</div>
    <div class="meta">${tr('optx.spent',{price:fmt$(Math.round(T.spent))})}</div>
    ${T.mode==='ask'?(T.prop.length?T.prop.map(optxPropHtml).join(''):`<p class="empty">${tr('optx.no_props')}</p>`):''}</section>`;
  h+=`<section><h3>${tr('optx.orders')}</h3><p class="meta">${tr('optx.orders_note')}</p>${OPS.filter(d=>d.team&&opsShow(d)).map(opsOrderHtml).join('')}</section>`;
  h+=`<section><h3>${tr('optx.size')}</h3>${sizes(T.size)}</section>`;
  openModal(h,'optx');}
