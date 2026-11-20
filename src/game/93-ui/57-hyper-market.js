/* ---------- Rivals, resale and launch freezes in the interface (38-hyper-rivals.js, 38-hyper-resale.js, 38-hyper-freeze.js) ----------
   Parts of the charter card (55-hyper-panel.js): alerts for a game launch coming (and the freeze it brings), a price war
   to match or ignore and a rival down; the Market line (offers contested, the tally) and what the resale desk sold; the
   resale desk's offers in the offers fold. Under a tenant offer: the rival's bid and who
   fits better; under an AI run offer: the day a rival takes it. On a fiber's panel: what the resale desk can sell. */
function hsRvNote(o){const x=S.hs&&S.hs.rv&&S.offers.some(y=>y.id===o.id)?hsRvOf(o):null;if(!x)return '';const F=hsRvFit(o,x);
  return `<div class="meta">🥊 ${tr('hyper_rivals.also_bid',{rival:esc(hsRvN(x.w)),price:fmt$(x.bid*o.bw),date:dateStr(x.d)})}</div>`
    +(F.win?`<div class="meta">✅ ${tr('hyper_rivals.you_fit')}</div>`:`<div class="why">${tr('hyper_rivals.they_fit',{rival:esc(hsRvN(x.w)),list:esc(F.miss.join(', ')||tr('hyper_rivals.miss_region'))})}</div>`);}
function hsRvJobNote(o){const x=S.hs&&S.hs.rv&&S.hs.rv.jo[o.id];return x&&x.w>=0?`<div class="why">🥊 ${tr('hyper_rivals.job_wait',{rival:esc(hsRvN(x.w)),date:dateStr(x.d)})}</div>`:'';}
function hsRvAlerts(){const H=S.hs,out=[];if(!H||!H.rv)return out;const V=H.rv,P=V.pw&&V.pw.from<=S.day&&V.pw.until>S.day?V.pw:null,D=V.dn&&V.dn.until>S.day?V.dn:null;
  if(P)out.push({lv:P.m?3:2,h:`📉 ${tr('hyper_rivals.card_war',{rival:esc(hsRvN(P.w)),reg:REG[P.reg],p:pct(P.f),date:dateStr(P.until)})} · ${P.m?tr('hyper_rivals.matching',{price:fmt$((R.hs&&R.hs.pwc)||0)}):tr('hyper_rivals.ignoring')}
    ${hsBtns(P.m?btn(tr('hyper_rivals.stop_matching'),'hsRvMatch',{on:0},'ghost sm'):btn(tr('hyper_rivals.match'),'hsRvMatch',{on:1},'sm'))}`});
  if(D)out.push({lv:3,h:`🔥 ${tr('hyper_rivals.card_down',{rival:esc(hsRvN(D.w)),reg:REG[D.reg],date:dateStr(D.until)})}`});
  return out;}
function hsMarketStat(){const H=S.hs;if(!H||!H.rv)return hsrSold();const V=H.rv,n=S.offers.filter(o=>o.type==='cloud'&&hsRvOf(o)).length;
  const bits=[n?trn('hyper_rivals.card_contested',n):'',V.lt||V.bt?tr('hyper_rivals.card_tally',{lt:V.lt,bt:V.bt}):''].filter(Boolean);
  return `<div class="meta">📈 ${tr('hyper_rivals.market')} ${bits.length?bits.join(' · '):tr('hyper_rivals.card_calm')}</div>`+hsrSold();}
// A resale offer: what, who, the price, and Accept / Decline.
function hsrRow(o){const why=hsrWhy(o);return `<div class="meta">🥂 ${tr('hyper_resale.offer_line',{name:esc(o.n),what:esc(hsrWhat(o)),price:fmt$(o.mo)})}${o.up?' '+tr('hyper_resale.offer_up',{up:fmt$(o.up)}):''} · ${tr('ui.n_d_left',{n:o.exp-S.day})}</div>
  ${why?`<div class="why">${why}</div>`:''}<div class="btns">${btn(tr('common.accept'),'hsrTake',{id:o.id},'sm',!!why)}${btn(tr('common.decline'),'hsrNo',{id:o.id},'ghost sm')}</div>`;}
function hsrSold(){const H=S.hs;if(!H||!H.rs)return '';const sold=S.biz.filter(b=>b.gh).length;
  return sold?`<div class="meta">🥂 ${trn('hyper_resale.card_sold',sold,{desk:HSR_DESK,price:fmt$(hsrIncome())})}</div>`:'';}
const hsrOffers=()=>S.hs&&S.hs.rs?S.hs.rs.o.map(hsrRow).join(''):'';
// The launch coming, or under way (the freeze banner itself is the card's, from chFrozen()).
function hsLfAlerts(){const L=hsLf();if(!L)return [];const b=S.biz.find(x=>x.id===L.id);if(!b)return [];const v={name:esc(b.name),game:HS_GAMES[L.g],f:L.f};
  if(S.day<L.from-1)return [{lv:2,h:`🚀 ${tr('hyper_freeze.card_soon',{...v,date:dateStr(L.from),a:dateStr(L.from-1),z:dateStr(L.until)})}`}];
  if(hsLfOn(L))return [{lv:1,h:`🚀 ${tr('hyper_freeze.card_live',{...v,p:pct(L.k?L.q/L.k:hsLfServed(R,b)),ok:pct(HS_LF_OK)})}`}];
  return [{lv:1,h:`🚀 ${tr('hyper_freeze.card_eve',{...v,date:dateStr(L.from)})}`}];}
// A fiber's panel: the resale desk instead of the capacity market.
function hsrLink(l){let h=`<section><h3>${tr('hyper_resale.title',{desk:HSR_DESK})}</h3>`;
  if(!l.own)return h+`<p class="meta">${tr('hyper_resale.leased_lead')}</p></section>`;
  const sold=S.biz.filter(b=>b.link===l.id&&(b.type==='dfpair'||b.type==='mwave'));h+=`<p class="lead">${tr('hyper_resale.lead')}</p>`;
  h+=hsKv(tr('hyper_resale.spare_pairs'),hsrPairs(l))+hsKv(tr('link_panels.sold_as_managed_waves'),fmtCap(mwG(l)));
  for(const b of sold)h+=`<div class="row"><div class="grow"><div class="nm">${esc(b.name)}</div><div class="meta">${esc(b.what||BIZ_T[b.type].l)} · ${tr('common.price_mo',{price:fmt$(b.rate)})}</div></div></div>`;
  for(const o of S.hs.rs.o.filter(o=>o.l===l.id))h+=hsrRow(o);
  return h+`<p class="note">${tr('hyper_resale.not_levels')}</p></section>`;}
