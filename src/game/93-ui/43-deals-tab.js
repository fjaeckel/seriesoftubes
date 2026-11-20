/* ---------- The Deals tab ----------
   What needs you comes first: renewal haggles and unhappy customers (money at stake, with a deadline), then the open
   offers, the ones you can sign today first, each a short card whose fine print unfolds. The rest (a consortium seat,
   conferences, the sales desk, your customer level) is one line each that unfolds. Folds and the offer filter are view
   state (UI.dl), never saved. */
const DL_PG=5,DL_SOON=5,DL_SECS=['seat','conf','lvl','cloud'];
function dlState(){if(!UI.dl)UI.dl={f:'all',n:DL_PG,open:{}};return UI.dl;}
const dlOpen=k=>!!dlState().open[k];
// An offer's state: 2 ready to sign as it is, 1 signable but a requirement is not met yet, 0 needs a POP first.
// (an orbit offer the sky cannot deliver yet can be signed, but it is not ready: it needs work in orbit first)
const dlSt=o=>!bHas(o)?0:reqOk(o)&&!pieOfferWhy(o)?2:1;
// What the tab bar counts, worked out once per routing and day (requirements can walk the network): offers you can sign
// today and haggles waiting for an answer; red while customers are unhappy.
function dealsBadge(){let m=UI._dlb;const hg=clHags(),red=custStats().unhappy>0;
  if(!m||m.S!==S||m.R!==R||m.d!==S.day||m.n!==S.offers.length)m=UI._dlb={S,R,d:S.day,n:S.offers.length,rd:S.offers.filter(o=>dlSt(o)===2).length};
  return {c:m.rd+hg,red};}
// A heading that unfolds, as the city panel's sections do (pnSec): title, one-line summary, flags.
function dlSec(k,title,sum,flags,body){const o=dlOpen(k);
  return `<section class="psec dl-sec${o?' on':''}"><div class="psh"><button class="psb" data-act="dealsFold" data-args='{"k":"${k}","o":${o?0:1}}' aria-expanded="${o}"><span class="psa">${o?'▾':'▸'}</span><span class="pst">${title}</span><span class="pss">${sum||''}</span>${flags||''}</button></div>${o?body():''}</section>`;}
// A heading that does not unfold but opens something: the same line with a button at its end.
const dlLine=(title,sum,b)=>`<section class="psec dl-sec"><div class="psh"><div class="psb dl-ln"><span class="psa"></span><span class="pst">${title}</span><span class="pss">${sum||''}</span></div>${b}</div></section>`;
function dlCust(st){return `<div class="row dl-cust"><div class="grow"><div class="nm">${tr('common.your_customers')} <span class="meta">${st.n} · ${tr('hud_and_panels.happiness_p',{p:Math.round(st.avg)})}</span></div><div class="bar ${moodCls(st.avg)}"><i style="width:${st.avg}%"></i></div>${st.unhappy?`<div class="why">${trn('hud_and_panels.n_unhappy_customer_price_mo_at',st.unhappy,{price:fmt$(st.risk)})}</div>`:''}</div>${btn(st.unhappy?tr('common.see_who'):tr('common.all_customers'),'custOpen',{sad:st.unhappy?1:0},st.unhappy?'pink sm':'ghost sm')}</div>`;}
// One offer: name and a countdown, what and where, one line of state, and the buttons. Unmet requirements, the buy-and-sign
// button and risks stay in sight; the rest (who referred them, why they called, requirements already met) is a tap away.
function dlOffer(o,s){const k='o:'+o.id,op=dlOpen(k),left=o.exp-S.day,n=(o.reqs||[]).length,miss=bCities(o).filter(x=>!S.pops[x]);
  const sky=pieOfferWhy(o),un=(o.reqs||[]).filter(q=>REQS[q]&&!REQS[q].ok(o)).length;
  const more=(o.refN?`<div class="meta">${tr('lifecycle.referred_by',{name:esc(o.refN)})}</div>`:'')+spotWhy(o)+(s===2?reqList(o):'');
  const tog=lab=>`<button class="dl-tg${s===2?' dl-st ok':' b ghost sm'}" data-act="dealsFold" data-args="${esc(JSON.stringify({k,o:op?0:1}))}" aria-expanded="${op}">${op?'▾':'▸'} ${lab}</button>`;
  // Ready: the state sits next to the buttons, and is what unfolds the fine print.
  const st=s===2?`✓ ${tr('deals.ready_to_sign')}${n?` · ${trn('hud_and_panels.n_special_requirement',n)}`:''}`:'';
  const line=s===0?`<div class="dl-st bad">${tr('hud_and_panels.needs_a_pop_in_cities',{cities:miss.map(x=>CITY[x].name).join(', ')})}</div>`
    :s===1&&un?`<div class="dl-st warn">${trn('deals.n_requirements_not_met',un)}</div>${reqList(o)}${reqFixHtml(o)}`:'';
  return `<div class="row dl-o"><div class="grow"><div class="nm">${esc(o.name)} <span class="dl-d${left<=DL_SOON?' soon':''}">${tr('ui.n_d_left',{n:left})}</span></div>
    <div class="meta">${esc(BIZ_T[o.type].l)} · ${CITY[o.city].name}${o.city2?' ⇄ '+CITY[o.city2].name:''} · <b>${bTerms(o)}</b></div>${line}${sky}${bRisk(o)}${op?more:''}
    <div class="btns">${s?btn(tr('common.accept'),'accept',{id:o.id},sky?'ghost sm':'green sm'):btn(tr('common.go_there'),'focusCity',{city:miss[0]},'ghost sm')}${btn(tr('common.decline'),'decline',{id:o.id},'ghost sm')}${s===2?(more?tog(st):`<span class="dl-st ok">${st}</span>`):more?tog(tr('noc.details')):''}</div></div></div>`;}
function dlOffers(){const D=dlState(),all=S.offers.map(o=>[o,dlSt(o)]).sort((a,b)=>b[1]-a[1]||a[0].exp-b[0].exp);
  if(!all.length)return `<p class="empty">${S.biz.length?tr('hud_and_panels.no_open_offers_right_now_businesses'):tr('deals.no_offers_yet')}</p>`;
  const rd=all.filter(x=>x[1]===2).length,f=all.length>DL_PG?D.f:'all',rows=f==='ready'?all.filter(x=>x[1]===2):f==='work'?all.filter(x=>x[1]<2):all;
  let h=`<h3 class="sub4 dl-h">${tr('common.offers')} <span class="meta">${all.length}</span></h3>`;
  if(all.length>DL_PG)h+=`<div class="dl-f">${[['all',tr('pni_list.f_all'),all.length],['ready',tr('deals.f_ready'),rd],['work',tr('deals.f_work'),all.length-rd]].map(([v,l,c])=>`<button class="bz-chip${v===f?' on':''}" data-act="dealsF" data-args='{"v":"${v}"}' aria-pressed="${v===f}">${l} ${c}</button>`).join('')}</div>`;
  if(!rows.length)return h+`<p class="empty">${tr('deals.nothing_here')}</p>`;
  // The cut is only worth a button when it hides more than a couple of offers.
  const N=rows.length<=D.n+2?rows.length:D.n;
  return h+rows.slice(0,N).map(([o,s])=>dlOffer(o,s)).join('')+(rows.length>N?`<div class="btns pnmore">${btn(tr('dashboard.n_more',{n:rows.length-N}),'dealsMore',{},'ghost sm')}</div>`:'');}
function dlSeat(){const o=S.seatOff;if(!o||o.exp<=S.day)return '';const left=o.exp-S.day;
  return dlSec('seat',`🚢 ${tr('specialist.consortium_seat_name',{name:esc(o.name)})}`,`${CITY[o.a].name} ⇄ ${CITY[o.b].name}`,`<span class="dl-d${left<=DL_SOON?' soon':''}">${tr('ui.n_d_left',{n:left})}</span>`,()=>seatSection());}
function dlConf(){const up=upcomingConfs(75).slice(0,3),cb=S.conf&&S.conf.until>S.day?S.conf:null;if(!up.length&&!cb)return '';
  const nx=up[0],reg=up.filter(cf=>S.confReg&&S.confReg[cf.key]).length;
  const sum=cb?tr('conferences.name_glow_n_days_left',{name:esc(cb.name),n:cb.until-S.day}):`${up.map(cf=>esc(cf.n)).join(', ')} · ${nx.day===S.day?tr('common.today'):tr('conferences.in_n_days',{n:nx.day-S.day})}`;
  return dlSec('conf',tr('common.conferences'),sum,reg?`<span class="tag st on">${tr('common.registered')}</span>`:'',()=>confSection().replace(/^<h3[^>]*>.*?<\/h3>/,''));}
function dlSales(){if(!S||!rule('clock'))return '';const p=slP(),L=S.sales||{};
  const sum=p?(L.vp?tr('sales.vp_coming',{n:Math.max(0,L.vp-S.day)}):slCardLine()):salesCanHire()?tr('deals.nobody_at_the_desk'):tr('sales.locked',{lv:SALES_LV});
  return dlLine(p?`${SALES[p].i} ${esc(tr('sales.at_desk',{name:slCap()}))}`:`💼 ${tr('sales.desk')}`,sum,btn(p?tr('sales.desk'):tr('sales.hire_sales'),'salesOpen',{},p?'ghost sm':'pink sm',!p&&!salesCanHire()));}
function dlLvl(){const lv=S.lvl||1,nx=lvInfo(lv);
  return dlSec('lvl',lvTitle(lv),'','',()=>`<p class="note dl-lv">${lvNext(nx,true)}</p>`);}
function dealsTab(){const st=custStats();
  // 1. Money at stake with a deadline: unhappy customers, renewals waiting for an answer.
  let h=st.n&&st.unhappy?dlCust(st):'';
  h+=clDealsHtml();
  // 2. Open offers, the ones you can sign first.
  h+=dlOffers();
  // 3. One line each.
  h+=`<div class="dl-rest">${dlSeat()}${hsfDealsSec()}${dlConf()}${dlSales()}${st.n&&!st.unhappy?dlCust(st):''}${dlLvl()}</div>`;
  return h;}
// The desktop tab's count: the same as the phone's.
const dealsCnt=()=>{const d=dealsBadge();return d.c?`<span class="cnt${d.red?' red':''}">${d.c}</span>`:d.red?`<span class="cnt red dot" aria-hidden="true"></span>`:'';};
