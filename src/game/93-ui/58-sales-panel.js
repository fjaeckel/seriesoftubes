// The sales desk's sheet (its line in Deals is in 43-deals-tab.js): the three kinds of salesperson, who is at the desk, and what they cost.
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
    ${slKindsHtml(A)}${rep?row(rep,true):''}${cur?row(cur,false):''}</section>
    <section class="sl-auto"><h3>${tr('sales.ren')}</h3><p class="meta">${tr(SL_REN[p],{name:esc(slCap())})}</p>
    <div class="ops-p"><button class="b sm ${A.ren?'green':'ghost'}" data-act="salesRen" data-args='{}' aria-pressed="${!!A.ren}">${tr('sales.p_ren')}: <b>${A.ren?tr('common.on'):tr('common.off')}</b></button></div></section>`;}
// Which kinds of deal the desk may sign (#497): All or Custom; Custom lists the categories your level has, each with one
// switch for the whole category (green: all on, white: some or none) and a fold with its kinds.
const SL_CAT_N={net:N_('sales.cat_net'),circ:N_('sales.cat_circ'),game:N_('sales.cat_game'),event:N_('sales.cat_event'),cap:N_('sales.cat_cap'),orbit:N_('sales.cat_orbit')};
function slKindsHtml(A){const cu=slCustom(),seg=(m,on,l)=>`<button class="b sm ${on?'green':'ghost'}" data-act="salesKinds" data-args='{"m":"${m}"}' aria-pressed="${on}">${l}</button>`;
  let h=`<div class="sl-kinds"><div class="ops-p sl-seg"><span class="sl-k">${tr('sales.kinds')}</span>${seg('all',!cu,tr('sales.kinds_all'))}${seg('custom',cu,tr('sales.kinds_custom'))}</div>`;
  if(!cu)return h+'</div>';
  const ks=slKinds();h+=`<p class="meta">${tr('sales.kinds_help',{name:esc(slCap())})}</p>`;
  for(const c of SL_CATS){const in_=ks.filter(t=>slCat(t)===c);if(!in_.length)continue;const on=in_.filter(t=>!slNo(t)).length,op=UI.slCat===c;
    const st=on===in_.length?tr('sales.cat_all'):on?tr('sales.cat_some',{n:on,m:in_.length}):tr('sales.cat_none');
    h+=`<div class="sl-cat"><div class="ops-p"><button class="b sm ${on===in_.length?'green':'ghost'}" data-act="salesCat" data-args='{"c":"${c}"}' aria-pressed="${on===in_.length}">${tr(SL_CAT_N[c])}: <b>${st}</b></button>`
      +`<button class="b sm ghost" data-act="salesCatOpen" data-args='{"c":"${c}"}' aria-expanded="${op}">${op?'▾':'▸'} ${trn('sales.cat_kinds',in_.length)}</button></div>`
      +(op?`<div class="ops-p sl-ks">${in_.map(t=>{const y=!slNo(t);return `<button class="b sm ${y?'green':'ghost'}" data-act="salesKind" data-args='${JSON.stringify({t})}' aria-pressed="${y}">${esc(BIZ_T[t].l)}</button>`;}).join('')}</div>`:'')+'</div>';}
  return h+'</div>';}
// On the card in Deals: this week's tally, once there is one.
function slCardLine(){if(!slAutoOn())return '';const A=S.slAuto,x=A.wk&&A.wk.w===Math.floor(S.day/7)&&slWkAny(A.wk)?A.wk:null;return x?esc(slWeekLine(x,false)):'';}
