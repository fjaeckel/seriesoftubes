function loanSummary(o){return o.model==='transit'?tr('bank.you_pay_pct_of_your_transit',{pct:pct(o.cut||0.3),price:fmt$(o.owe||o.amount)}):o.model==='balloon'?tr('bank.nothing_to_pay_for_n_months',{n:o.term}):tr('bank.pay_mo_for_n_months',{pay:fmt$(o.pay),n:o.term})+(o.share?' '+tr('bank.plus_pct_of_your_revenue_until',{pct:pct(o.share)}):'');}
function loanLine(l){const sh=l.share?' · '+tr('bank.plus_pct_of_revenue',{pct:pct(l.share)}):'',fee=loanFees(l)?' · '+tr('bank.price_mo_in_extras',{price:fmt$(loanFees(l))}):'';
  if(l.model==='transit')return tr('bank.pct_of_your_transit_bill_n',{pct:pct(l.cut||0.3),n:l.left})+sh+fee;
  if(l.model==='balloon')return tr('bank.nothing_to_pay_until_the_end',{n:l.left,apr:(l.apr*100).toFixed(1)})+sh+fee;
  return tr('bank.pay_mo_n_months_left_apr',{pay:fmt$(l.pay),n:l.left,apr:(l.apr*100).toFixed(1)})+(l.model==='storm'?' · '+tr('bank.2_per_open_incident'):l.model==='astro'?' · '+tr('bank.rate_set_by_the_stars_each'):'')+sh+fee;}
/* The bank: offers as cards you can compare at a glance (amount, monthly, what it costs on top, term, the catch), the
   cheapest marked; running loans with how far along they are. What folds (the rating's reasons, conditions you keep)
   is view state in UI.bankOpen. */
// What an offer costs on top of the money, over its whole term (null: a share of revenue forever, no total).
function offerCost(o){const B=BANKS[o.bank];if(B.equity)return null;const fees=loanFees(o)*(o.term||0);
  if(o.model==='transit')return Math.round((o.owe||o.amount)-o.amount+fees);
  if(o.model==='balloon')return Math.round(o.amount*Math.pow(1+o.apr/12,o.term)-o.amount+fees);
  return Math.round((o.pay||0)*(o.term||0)-o.amount+fees);}
const bankOpen=k=>!!(UI.bankOpen&&UI.bankOpen[k]);
// Why the rating is what it is: the same steps rating() adds up, each with a tick or a cross.
function ratingWhy(){const rev=R.revMo||0,pay=(R.cost&&R.cost.loans)||0,st=S.loanStrikes||0,steps=[1e5,5e5,2e6].filter(x=>rev>x).length;
  const li=(ok,t)=>`<div class="meta"><b style="color:${ok?'var(--eye)':'var(--bad)'}">${ok?'✓':'✗'}</b> ${t}</div>`;
  return `<div class="bwhy">${li(steps>0,tr('bank.rt_revenue',{rev:fmt$(rev),n:steps}))}${li(R.revMo>R.costMo,tr('bank.rt_profit'))}${li(rev&&(R.revMo-R.costMo)/rev>=0.25,tr('bank.rt_margin'))}${li(S.cash>=0,tr('bank.rt_cash'))}${li(!rev||pay/rev<=0.3,tr('bank.rt_loans'))}${li(!st,trn('bank.rt_strikes',st))}<p class="meta">${tr('bank.rt_lead')}</p></div>`;}
function renderBank(){
  if(!S||$('bankBox').hidden)return;const rt=rating(),net=R.revMo-R.costMo;
  const tag=(t,c='st')=>`<span class="tag ${c}">${t}</span>`;
  // The catch: whatever comes with the money besides the rate.
  const catches=(o)=>{const B=BANKS[o.bank],c=[];if(o.share&&!B.equity)c.push(tr('bank.plus_pct_of_revenue_until_repaid',{pct:pct(o.share)}));
    if(B.equity)c.push(tr('common.no_repayments'),tr('bank.pct_of_revenue_forever',{pct:pct(o.share)}));if(o.model==='transit')c.push(tr('bank.pct_of_your_transit_bill',{pct:pct(o.cut||0.3)}),tr('bank.price_to_repay',{price:fmt$(o.owe||o.amount)}),tr('bank.the_rest_is_due_at_the'));if(o.model==='balloon')c.push(tr('bank.nothing_to_pay_until_the_end_2a38'),tr('bank.then_about_price_at_once',{price:fmt$(o.amount*Math.pow(1+o.apr/12,o.term))}));
    if(o.model==='storm')c.push(tr('bank.2_per_open_incident'));if(o.model==='astro')c.push(tr('bank.rate_set_by_the_stars_each'));if(B.crypto)c.push(tr('bank.paid_in_tubecoin'));if(B.equity)c.push(tr('bank.buy_out_price',{price:fmt$(o.amount*3)}));
    return c.map(t=>tag(t,'selective')).join('');};
  const fact=(l,v)=>`<div class="bf"><span>${l}</span><b>${v}</b></div>`;
  const covList=(l)=>l.covs.length?l.covs.map(c=>{const ok=COVS[c].ok(l);return `<div class="meta bcov"><b style="color:${ok?'var(--eye)':'var(--bad)'}">${ok?'✓':'✗'}</b> ${esc(covLabel(c,l))}</div>`;}).join(''):'<div class="meta">'+tr('bank.no_conditions_that_is_the_scary')+'</div>';
  const why=bankOpen('rt');
  let h=`<div style="display:flex;align-items:center;gap:12px"><div><div class="eyebrow">AS${S.asn} · ${esc(S.name)}</div><h2 style="font-size:28px">${tr('common.bank')}</h2></div><button class="x" data-act="bankClose" aria-label="${tr('common.close')}">×</button></div>
  <div class="dgrid btiles"><div class="tile"><div class="lbl">${tr('common.cash')}</div><div class="val" style="color:${S.cash<0?'var(--bad)':'inherit'}">${fmt$(S.cash)}</div><div class="sub">${S.cash<0?tr('bank.bankrupt_at_100k'):tr('bank.in_the_vault')}</div></div>
  <div class="tile"><div class="lbl">${tr('dashboard.monthly_p_l')}</div><div class="val" style="color:${net>=0?'var(--eye)':'var(--bad)'}">${net>=0?'+':''}${fmt$(net)}</div><div class="sub">${tr('bank.after_loan_payments')}</div></div>
  <div class="tile"><div class="lbl">${tr('common.credit_rating')} <button class="hb${why?' on':''}" data-act="bankFold" data-args='{"k":"rt"}' aria-expanded="${why}" aria-label="${esc(tr('panel_folds.what_is_this'))}" title="${esc(tr('panel_folds.what_is_this'))}">?</button></div><div class="val">${rt}</div><div class="sub">${rIdx(rt)>=5?tr('bank.bankers_return_your_calls'):rIdx(rt)>=3?tr('bank.bankers_return_your_emails'):tr('bank.bankers_pretend_to_be_out')}</div></div>
  <div class="tile"><div class="lbl">${tr('common.debt')}</div><div class="val">${fmt$(loanDebt())}</div><div class="sub">${trn('bank.n_loan',S.loans.length)}</div></div></div>${why?ratingWhy():''}`;
  const CT=CALL_TERMS[rt];
  // Calling the bank is for AA and up; below that, one line says so instead of a whole section.
  if(S.cash<RICH_NO_LOANS){const lim=CT?callLimit(CT):0;
    h+=CT?`<h3 class="bh3">${tr('bank.call_the_bank')}</h3><div class="meta">${tr('bank.bank_picks_up_apr_apr_over',{bank:esc(BANKS[CT.bank].name),apr:(CT.apr*100).toFixed(1),n:CALL_MONTHS,limit:fmt$(lim)})}</div><div class="btns" style="margin-top:6px">${CALL_AMTS.map(a=>btn(fmt$(a),'callBank',{amount:a},'sm',a>lim)).join('')}</div>`:`<p class="meta bcall">📞 ${tr('bank.get_to_an_aa_rating_and')}</p>`;}
  // Offers, cheapest for what they lend first; a share of revenue forever has no total and goes last.
  const rel=o=>{const c=offerCost(o);return c===null?Infinity:c/Math.max(1,o.amount);},offers=S.loanOffers.slice().sort((a,b)=>rel(a)-rel(b)),badN=o=>o.covs.filter(k=>COVS[k]&&!COVS[k].ok({covs:o.covs,start:S.day,base:{sub:S.links.filter(x=>x.sub).length}})).length,
    // The one to mark: the cheapest whose conditions you already keep (a broken one costs penalties ten days in).
    fit=offers.filter(o=>!badN(o)&&rel(o)<Infinity),best=offers.length>1&&fit.length?fit[0].id:null;
  h+=`<h3 class="bh3">${tr('common.offers')}</h3>`;
  if(!offers.length)h+=`<p class="empty">${S.cash>=RICH_NO_LOANS?tr('banks.the_banks_have_stopped_calling_you',{cash:fmt$(RICH_NO_LOANS)}):tr('bank.no_offers_banks_call_about')}</p>`;
  for(const o of offers){const B=BANKS[o.bank],c=offerCost(o),bad=badN(o);
    const mo=B.equity?pct(o.share):o.model==='transit'?pct(o.cut||0.3):fmt$(o.pay||0);
    h+=`<div class="loan boffer${o.id===best?' best':''}"><span class="logo" style="--c:${B.col}">${initials(B)}</span><div class="grow">
    <div class="bhd"><div class="nm">${esc(B.name)}</div><b class="bamt">${fmt$(o.amount)}</b></div>
    <div class="meta bblurb" title="${esc(B.blurb)}">${o.id===best?tag('★ '+tr('bank.best_deal'),'st on')+' ':''}${bad?tag('✗ '+trn('bank.n_broken_now',bad),'paid')+' ':''}${tr('bank.offer_ends_in_n_d',{n:o.exp-S.day})} · ${esc(B.blurb)}</div>
    <div class="bfacts">${fact(tr('common.monthly'),mo)}${fact(tr('common.cost'),c===null?'∞':'+'+fmt$(c))}${fact(tr('bank.term'),B.equity?'∞':tr('bank.n_mo',{n:o.term}))}${B.equity?'':fact(tr('bank.rate'),o.model==='transit'?'—':(o.apr*100).toFixed(1)+'%')}</div>
    ${covList({covs:o.covs,start:S.day,base:{sub:S.links.filter(x=>x.sub).length}})}
    <div class="bfoot">${catches(o)?`<div class="terms">${catches(o)}</div>`:''}<div class="btns">${btn(tr('bank.take_the_money'),'takeLoan',{id:o.id},'pink sm')}${btn(tr('common.no_thanks'),'declineLoan',{id:o.id},'ghost sm')}</div></div></div></div>`;}
  h+=`<h3 class="bh3">${tr('common.your_loans')}</h3>`;
  if(!S.loans.length)h+=`<p class="empty">${tr('bank.debt_free_your_accountant_is')}</p>`;
  for(const l of S.loans){const B=BANKS[l.bank],cost=repayCost(l,B),k='l:'+l.id,bad=l.covs.filter(c=>COVS[c]&&!COVS[c].ok(l)),open=bankOpen(k)||bad.length>0||!l.covs.length,done=B.equity?0:Math.min(100,Math.max(0,(1-l.bal/Math.max(1,l.amount))*100));
    h+=`<div class="loan bloan"><span class="logo" style="--c:${B.col}">${initials(B)}</span><div class="grow"><div class="nm">${esc(B.name)} · ${fmt$(l.amount)}</div>
    ${B.equity?`<div class="meta">${tr('bank.taking_pct_of_your_revenue_every',{pct:pct(l.share)})}</div>`:`<div class="bprog"><div class="bar me"><i style="width:${done}%"></i></div><span class="meta">${tr('bank.pct_repaid',{pct:Math.round(done)+'%'})}</span></div><div class="meta">${tr('common.still_owed')} ${fmt$(l.bal)} · ${loanLine(l)}</div>`}
    ${bad.length||!l.covs.length?'':`<button class="lnk bcovs" data-act="bankFold" data-args='${JSON.stringify({k})}' aria-expanded="${!!open}">${open?'▾':'▸'} ✓ ${trn('bank.n_conditions_kept',l.covs.length)}</button>`}${open?covList(l):''}${l.breach>=1?`<div class="why">${trn('bank.condition_broken_for_n_day',l.breach)} ${l.breach<10?tr('bank.penalty_in_n_days',{n:10-l.breach}):tr('bank.penalties_are_running')}</div>`:''}
    <div class="btns" style="margin-top:6px">${btn(UI.confirm===l.id?tr('bank.really_pay_price',{price:fmt$(cost)}):B.equity?tr('bank.buy_them_out_price',{price:fmt$(cost)}):tr('bank.repay_early_price_incl_2_fee',{price:fmt$(cost)}),'repayLoan',{id:l.id},UI.confirm===l.id?'red sm':'sm',S.cash<cost)}</div></div></div>`;}
  h+=pieGovBank();
  if(h!==UI._bh){UI._bh=h;$('bankCard').innerHTML=h;}
}
