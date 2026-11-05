// The sales desk in Deals, and its sheet: the three kinds of salesperson, who is at the desk, and what they cost.
function salesCard(){if(!S||!rule('clock'))return '';const p=slP(),L=S.sales||{};
  return `<div class="ops-card"><div class="nm">${p?`${SALES[p].i} ${esc(tr('sales.at_desk',{name:slCap()}))}`:`💼 ${tr('sales.desk')}`}</div>
    <div class="meta">${p?(L.vp?tr('sales.vp_coming',{n:Math.max(0,L.vp-S.day)}):tr(SALES[p].d)):salesCanHire()?tr('sales.pitch'):tr('sales.locked',{lv:SALES_LV})}</div>
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
      <div class="meta">${tr(P.d)}</div>${here&&id!=='ceo'?`<div class="meta">${tr('ops.salary',{price:fmt$(P.mo),d:dateStr(L.hired||0)})}</div>`:''}${act?`<div class="btns">${act}</div>`:''}</div></div></div>`;}).join('');
  if(p&&p!=='ceo')h+=`<p class="note">${tr('sales.one_at_a_time')}</p>`;
  openModal(h,'ops');}
