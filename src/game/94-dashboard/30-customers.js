/* ---------- customers overview (#13, #14, #15) ---------- */
const bizMo=b=>{const T=BIZ_T[b.type];return T.event?0:T.fiber?b.rate:b.bw*b.rate;};
// Why a customer is unhappy, in the same terms the daily mood update uses.
function bizWhy(b){const T=BIZ_T[b.type],out=[];if(T.event&&!eventLive(b))return out;if(capPend(b))return capWhy(b);
  const sf=bizSf(b);if(sf<0.95)out.push(T.fiber?tr('customers.their_fiber_is_down'):tr('customers.getting_only_p_of_the_bandwidth',{p:pct(sf)}));
  if(!(T.l2||T.fiber)&&R.reach<=0.99&&!scnRule('local'))out.push(tr('customers.you_cannot_reach_the_whole_internet',{p:pct(R.reach)}));
  if(b.type==='scrub'&&!hasScrub())out.push(tr('common.needs_a_scrubbing_center'));
  {const q=b.type==='scrub'&&scrubFar(b.city);if(q)out.push(tr('customers.attacks_on_city_are_hauled_to',{city:CITY[b.city].name,to:CITY[q.to].name,ms:Math.round(q.ms)}));}
  for(const k of b.reqs||[])if(REQS[k]&&!REQS[k].ok(b))out.push(typeof REQS[k].l==='function'?REQS[k].l(b):REQS[k].l);
  return out;}
const moodCls=m=>m<30?'bad':m<60?'warn':'';
const custStats=()=>{const bz=S.biz.filter(b=>!BIZ_T[b.type].event),mo=bz.reduce((a,b)=>a+bizMo(b),0);
  return {n:bz.length,unhappy:bz.filter(b=>b.mood<60).length,furious:bz.filter(b=>b.mood<30).length,avg:bz.length?(mo>0?bz.reduce((a,b)=>a+b.mood*bizMo(b),0)/mo:bz.reduce((a,b)=>a+b.mood,0)/bz.length):100,risk:bz.filter(b=>b.mood<60).reduce((a,b)=>a+bizMo(b),0)};};
// Long lists show their first rows and grow on request: a thousand rows of buttons take the browser a long time to
// lay out again every day, worst of all on a phone. Filters, sorting and totals still cover every row.
const LIST_PAGE=100,listN=k=>(UI.listN&&UI.listN[k])||LIST_PAGE,listReset=k=>{if(UI.listN)delete UI.listN[k];};
const listMore=(k,n,lab)=>n>listN(k)?`<div class="btns" style="margin-top:6px">${btn(lab(Math.min(LIST_PAGE,n-listN(k))),'listMore',{k},'ghost sm')}</div>`:'';
function custSection(){const F=UI.kf||{};let h=`<div class="panel2" id="custSec" style="margin-top:12px"><h3>${tr('common.customers')}</h3>`;
  if(!S.biz.length)return h+`<p class="empty">${tr('customers.no_customers_yet_offers_show_up')}</p></div>`;
  const st=custStats();
  h+=`<p class="note" style="margin-top:0">${tr('customers.everyone_who_pays_you_happiest_last')}</p>`;
  h+=`<div class="dgrid" style="margin:0 0 8px"><div class="tile"><div class="lbl">${tr('common.happiness')}</div><div class="val" style="color:${st.avg<60?'var(--bad)':'inherit'}">${Math.round(st.avg)}%</div><div class="sub">${tr('customers.weighted_by_what_they_pay')}</div></div><div class="tile"><div class="lbl">${tr('common.unhappy')}</div><div class="val" style="color:${st.unhappy?'var(--bad)':'inherit'}">${st.unhappy}</div><div class="sub">${trn('customers.n_furious',st.furious)}</div></div><div class="tile"><div class="lbl">${tr('common.at_risk')}</div><div class="val">${tr('common.price_mo',{price:fmt$(st.risk)})}</div><div class="sub">${tr('customers.from_unhappy_customers')}</div></div></div>`;
  const cities=[...new Set(S.biz.map(b=>b.city))].sort((a,b)=>CITY[a].name.localeCompare(CITY[b].name));
  h+=`<div class="trsel" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px"><div class="seg">${btn(tr('dashboard.all_n',{n:S.biz.length}),'custF',{v:''},!F.f?'pink sm':'ghost sm')}${btn(tr('customers.unhappy_n',{n:S.biz.filter(b=>b.mood<60).length}),'custF',{v:'sad'},F.f==='sad'?'pink sm':'ghost sm')}</div><label>${tr('common.city_906b')} <select data-chg="custCity"><option value="">${tr('common.all_cities')}</option>${cities.map(c=>`<option value="${c}"${F.city===c?' selected':''}>${esc(CITY[c].name)}</option>`).join('')}</select></label></div>`;
  const rows=S.biz.filter(b=>(!F.f||b.mood<60)&&(!F.city||b.city===F.city||b.city2===F.city||(b.sites||[]).includes(F.city)));
  const sk=UI.custSort||'mood',dir=UI.custDir||1,val=b=>sk==='name'?b.name.toLowerCase():sk==='city'?CITY[b.city].name:sk==='mo'?bizMo(b):b.mood;
  rows.sort((a,b)=>{const A=val(a),B=val(b);return (A<B?-1:A>B?1:0)*dir||a.mood-b.mood;});
  if(!rows.length)return h+`<p class="empty">${F.f?tr('customers.nobody_is_unhappy_enjoy_it_while'):tr('customers.no_customers_here')}</p></div>`;
  const where=b=>b.sites?b.sites.map(c=>CITY[c].name).join(', '):b.city2?`${CITY[b.city].name} ⇄ ${CITY[b.city2].name}`:CITY[b.city].name;
  const trend=b=>b.pm===undefined||Math.abs(b.mood-b.pm)<0.05?'':b.mood>b.pm?' <span style="color:var(--eye)">▲</span>':' <span style="color:var(--bad)">▼</span>';
  const sorts=[['mood',tr('common.happiness')],['mo',tr('common.per_month')],['name',tr('common.name')],['city',tr('common.where')]];
  h+=`<div class="seg" style="margin-bottom:4px">${sorts.map(([k,l])=>btn(l+(sk===k?(dir>0?' ▲':' ▼'):''),'custSort',{k},sk===k?'pink sm':'ghost sm')).join('')}</div>`;
  h+=rows.slice(0,listN('cust')).map(b=>{const why=bizWhy(b),grace=S.day-(b.since||0)<15;return `<div class="row"><div class="grow"><div class="nm">${esc(b.name)} <span class="meta">${esc(BIZ_T[b.type].l)}</span></div><div class="meta">${esc(where(b))} · ${BIZ_T[b.type].event?esc(bTerms(b)):tr('common.price_mo',{price:fmt$(bizMo(b))})}${grace?` · ${tr('common.provisioning_n_d_grace',{n:15-(S.day-(b.since||0))})}`:''}</div>${bRisk(b)}${why.length?`<div class="why">${why.map(esc).join(' · ')}</div>`:''}<div class="bar ${moodCls(b.mood)}"><i style="width:${b.mood}%"></i></div><div class="meta">${tr('common.happiness_p',{p:Math.round(b.mood)})}${trend(b)}</div></div>${btn(tr('common.open'),'custGo',{id:b.id},'ghost sm')}</div>`;}).join('');
  return h+listMore('cust',rows.length,n=>trn('customers.n_more_customer',n))+`</div>`;}
