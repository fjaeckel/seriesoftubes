// The sales desk in Deals, and its sheet: the three kinds of salesperson, who is at the desk, and what they cost.
function salesCard(){if(!S||!rule('clock'))return '';const p=slP(),L=S.sales||{};
  return `<div class="ops-card"><div class="nm">${p?`${SALES[p].i} ${esc(tr('sales.at_desk',{name:slCap()}))}`:`💼 ${tr('sales.desk')}`}</div>
    <div class="meta">${p?(L.vp?tr('sales.vp_coming',{n:Math.max(0,L.vp-S.day)}):slCardLine()||tr(SALES[p].d)):salesCanHire()?tr('sales.pitch'):tr('sales.locked',{lv:SALES_LV})}</div>
    <div class="btns">${btn(p?tr('sales.desk'):tr('sales.hire_sales'),'salesOpen',{},p?'sm':'pink sm',!p&&!salesCanHire())}</div></div>`;}
function salesModal(){if(!S)return;const p=slP(),L=S.sales||{};
  let h=`<div style="display:flex;align-items:center"><div><div class="eyebrow">${tr('common.deals')}</div><h2 style="font-size:26px">${tr('sales.desk')}</h2></div><button class="x" data-act="closeModal" aria-label="${tr('common.close')}">×</button></div>`;
  h+=`<p class="tagline">${tr('sales.intro')}</p>`;
  if(!rule('clock'))h+=`<p class="why">${tr('ops.no_clock')}</p>`;else if(!salesCanHire()&&!p)h+=`<p class="why">${tr('sales.locked',{lv:SALES_LV})}</p>`;
  h+=Object.entries(SALES).map(([id,P])=>{const here=p===id;
    const act=here?(id==='ceo'?(L.vp?`<span class="tag st on">${tr('sales.vp_coming',{n:Math.max(0,L.vp-S.day)})}</span>`:btn(tr('sales.ask_vp',{cost:fmt$(SALES_VP)}),'salesVp',{},'ghost sm',S.cash<SALES_VP))
      :btn(UI.confirm==='salesFire'?tr('ops.really_fire'):tr('ops.fire'),'salesFire',{},'ghost sm'))
      :p?'':btn(id==='ceo'?tr('sales.let_ceo'):tr('ops.hire_mo',{price:fmt$(P.mo)}),'salesHire',{id},'pink sm',!salesCanHire()||!rule('clock')||S.cash<P.mo);
    return `<div class="ops-o${here?' on':''}"><div class="ops-h"><span class="ops-i" aria-hidden="true">${P.i}</span><div class="grow"><div class="nm">${tr(P.n)}</div>
      <div class="meta">${tr(P.d)}</div>${pieOn()?`<div class="meta">🥧 ${tr(SL_SKY[id])}</div>`:''}${here&&id!=='ceo'?`<div class="meta">${tr('ops.salary',{price:fmt$(P.mo),d:dateStr(L.hired||0)})}</div>`:''}${act?`<div class="btns">${act}</div>`:''}</div></div></div>`;}).join('');
  if(p&&p!=='ceo')h+=`<p class="note">${tr('sales.one_at_a_time')}</p>`;
  h+=p?slAutoHtml(p):rule('clock')?`<p class="note">${tr('sales.by_hand')}</p>`:'';
  openModal(h,'ops');}
// What each of them does in orbit, shown once there is a rocket company to sell for (99-pie-sales.js).
const SL_SKY={eng:N_('sales.eng_sky'),shark:N_('sales.shark_sky'),ceo:N_('sales.ceo_sky')};
const SL_AUTO={eng:N_('sales.auto_eng'),shark:N_('sales.auto_shark'),ceo:N_('sales.auto_ceo')};
const SL_REN={eng:N_('sales.ren_eng'),shark:N_('sales.ren_shark'),ceo:N_('sales.ren_ceo')};
// Signing for you (39-sales-auto.js): the switch, the minimum, and this week's and last week's tally.
function slAutoHtml(p){const A=S.slAuto||slAutoNew(),w=Math.floor(S.day/7),cur=A.wk&&A.wk.w===w&&slWkAny(A.wk)?A.wk:null,rep=A.rep&&A.rep.w===w-1?A.rep:null;
  const row=(x,last)=>`<div class="ops-rep">${esc(slWeekLine(x,last))}</div>`;
  return `<section class="sl-auto"><h3>${tr('sales.auto')}</h3><p class="meta">${tr(SL_AUTO[p],{name:esc(slCap())})}</p>
    <div class="ops-p"><button class="b sm ${A.on?'green':'ghost'}" data-act="salesAuto" data-args='{}' aria-pressed="${A.on}">${tr('sales.p_sign')}: <b>${A.on?tr('common.on'):tr('common.off')}</b></button>
    ${btn(`${tr('sales.decline_below')}: <b>${A.min?tr('common.price_mo',{price:fmt$(A.min)}):tr('sales.never')}</b>`,'salesMin',{},'ghost sm')}</div>
    ${rep?row(rep,true):''}${cur?row(cur,false):''}</section>
    <section class="sl-auto"><h3>${tr('sales.ren')}</h3><p class="meta">${tr(SL_REN[p],{name:esc(slCap())})}</p>
    <div class="ops-p"><button class="b sm ${A.ren?'green':'ghost'}" data-act="salesRen" data-args='{}' aria-pressed="${!!A.ren}">${tr('sales.p_ren')}: <b>${A.ren?tr('common.on'):tr('common.off')}</b></button></div></section>`;}
// On the card in Deals: this week's tally, once there is one.
function slCardLine(){if(!slAutoOn())return '';const A=S.slAuto,x=A.wk&&A.wk.w===Math.floor(S.day/7)&&slWkAny(A.wk)?A.wk:null;return x?esc(slWeekLine(x,false)):'';}
