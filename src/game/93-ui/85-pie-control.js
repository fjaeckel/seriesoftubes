// Pie Control: a plain modal (a bottom sheet on phones) for the rocket company. Reached from the NOC tab (pieCard()).
let PIE_CCN=null;
function pieLicCountry(cc){try{PIE_CCN=PIE_CCN&&PIE_CCN.l===LANG?PIE_CCN:{l:LANG,d:new Intl.DisplayNames([LANG],{type:'region'})};return PIE_CCN.d.of(cc)||cc;}catch(e){return cc;}}
function pieCard(){if(!pieOn())return '';const P=S.pie;
  return `<div class="ops-card pie-card"><div class="nm">🥧 ${tr('pie.pie_in_the_sky')}</div><div class="meta">${P&&P.co?esc(pieCoName())+' · '+tr('pie.card_live',{n:Object.keys(CRUSTS).reduce((a,id)=>a+pieLive(id),0),q:P.q.length}):tr('pie.card_pitch')}</div>
    ${pieSpatCard()}<div class="btns">${btn(tr('pie.open_pie_control'),'pieOpen',{},P&&P.co?'sm':'pink sm')}</div></div>`;}
const pieTag=(t,on)=>`<span class="tag ${on?'open':'selective'}">${t}</span>`;
function pieModal(){if(!S||!pieOn())return;const P=S.pie||pieBlank(S.day),can=pieCanBuild(),T=['co','fly','dish','book'].includes(UI.pieTab)?UI.pieTab:'co';
  let h=`<div style="display:flex;align-items:center"><div class="grow"><div class="eyebrow">${tr('pie.pie_in_the_sky')}</div><h2 style="font-size:24px">${P.co?esc(pieCoName()):tr('pie.pie_control')}</h2></div><button class="x" data-act="closeModal" aria-label="${tr('common.close')}">×</button></div>`;
  if(!can)h+=`<p class="why">${tr('pie.why_not_t1')}</p>`;
  if(pieSand())h+=`<p class="note">${tr('pie.sandbox_note',{amt:fmt$(P.book.wouldHave)})}</p>`;
  if(!P.co){h+=`<p class="lead">${tr('pie.found_pitch')}</p><div class="btns">${btn(tr('pie.found_price',{price:fmt$(piePrice(PIE_CO)),mo:fmt$(PIE_CO_MO)}),'pieFound',{},'pink',!can)}</div>`;openModal(h,'pie');return;}
  const tab=(k,l)=>`<button class="b sm ${T===k?'pink':'ghost'}" data-act="pieTab" data-args='{"t":"${k}"}' aria-pressed="${T===k}">${l}</button>`;
  h+=pieGlobeHtml()+pieSpatCard();
  h+=`<div class="seg" style="margin:6px 0 10px">${tab('co',tr('pie.tab_company'))}${tab('fly',tr('pie.tab_launch'))}${tab('dish',tr('pie.tab_dishes'))}${tab('book',tr('pie.tab_founder'))}</div>`;
  const cities=Object.keys(S.pops).sort((a,b)=>CITY[a].name.localeCompare(CITY[b].name)),c=S.pops[UI.pieCity]?UI.pieCity:cities[0];
  const sel=`<div class="trsel"><label>${tr('common.your_pop')}<select data-chg="pieCity">${cities.map(x=>`<option value="${x}"${x===c?' selected':''}>${esc(CITY[x].name)}</option>`).join('')}</select></label></div>`;
  if(T==='co'){
    h+=`<div class="kv"><span>${tr('pie.running_costs')}</span><b>${tr('common.price_mo',{price:fmt$(pieMo())})}</b></div>`;
    h+=`<div class="ops-o${P.fac?' on':''}"><div class="nm">🏭 ${tr('pie.factory')}</div><div class="meta">${P.fac?tr('pie.factory_stock',{n:Math.floor(P.stock),m:PIE_FAC_MONTH}):tr('pie.factory_pitch',{m:PIE_FAC_MONTH,mo:fmt$(PIE_FAC_MO)})}</div>${P.fac?'':`<div class="btns">${btn(tr('pie.build_price',{price:fmt$(piePrice(PIE_FAC))}),'pieFactory',{},'pink sm',!can)}</div>`}</div>`;
    h+=`<div class="ops-o"><div class="nm">🧪 ${tr('pie.rd')}</div>${Object.keys(PIE_RD).map(k=>`<div class="kv"><span>${tr(PIE_RD[k].n)}</span>${P.rd[k]?`<b>✓</b>`:btn(fmt$(piePrice(PIE_RD[k].cost)),'pieRd',{k},'ghost sm',!can)}</div>`).join('')}
      ${P.rd.heavy?`<p class="meta">${tr('pie.heavy_tests',{n:P.rd.heavyTests,max:PIE_HEAVY_TESTS})}</p>`:''}</div>`;
    h+=`<div class="ops-o"><div class="nm">🚀 ${tr('pie.pads')}</div>${P.pads.map(p=>`<div class="kv"><span>${esc(CITY[p.city].name)} · −${pct(pieEq(p.city))}</span><b>${p.next>S.day?tr('pie.pad_busy',{d:dateStr(p.next)}):tr('pie.pad_free')}${p.boosters.length?' · '+trn('pie.n_boosters',p.boosters.length):''}</b></div>`).join('')||`<p class="meta">${tr('pie.no_pads')}</p>`}
      ${sel}<div class="btns">${btn(tr('pie.build_pad_price',{city:esc(CITY[c].name),price:fmt$(piePrice(PIE_PAD))}),'piePad',{city:c},'ghost sm',!can||!pieCoast(c)||P.pads.some(p=>p.city===c)||P.pads.length>=PIE_PAD_MAX)}</div>${pieCoast(c)?'':`<p class="why">${tr('pie.why_pad_city')}</p>`}</div>`;
    h+=`<div class="ops-o"><div class="nm">🏷️ ${tr('pie.name')}</div><div class="btns">${btn(tr('pie.next_name'),'pieName',{},'ghost sm')}</div>
      <div class="network-name" style="margin-top:6px"><input class="t" id="pieNm" maxlength="40" value="${esc(pieCoName())}" autocomplete="off" aria-label="${esc(tr('pie.name'))}"></div><div class="btns">${btn(tr('slots.rename'),'pieRename',{},'ghost sm')}</div></div>`;
    h+=`<div class="btns">${btn(P.safe?tr('pie.safe_on'):tr('pie.safe_off'),'pieSafe',{},P.safe?'red sm':'ghost sm')}</div><p class="meta">${tr('pie.safe_note')}</p>`;
  }else if(T==='fly'){
    h+=Object.keys(CRUSTS).map(id=>{const C=CRUSTS[id],cv=pieCov(id);return `<div class="ops-o${pieUp(id)?' on':''}"><div class="nm">${tr(C.n)} ${pieTag(pieBaked(id)?tr('pie.baked'):tr('pie.half_baked'),pieBaked(id))}</div>
      <div class="meta">${tr('pie.crust_line',{alt:C.alt,n:pieLive(id),full:C.full,q:P.crusts[id].queued,p:pct(cv)})}</div><div class="bar ${cv>=PIE_BAKED?'':'warn'}"><i style="width:${Math.round(cv*100)}%"></i></div>
      <div class="ops-p">${Object.keys(ROCKETS).filter(pieRkOk).map(rk=>{const q=pieQuote(rk,id,{ins:!!UI.pieIns,las:!!UI.pieLas});return btn(`${tr(ROCKETS[rk].n)} <small>${q.ok?(q.test?tr('pie.test_flight')+' · ':'')+fmt$(q.cost):esc(q.why)}</small>`,'pieLaunch',{rk,cr:id},'ghost sm',!q.ok);}).join('')}</div></div>`;}).join('');
    h+=`<div class="ops-p">${btn(UI.pieIns?tr('pie.ins_on'):tr('pie.ins_off'),'pieIns',{},UI.pieIns?'green sm':'ghost sm')}${btn(UI.pieLas?tr('pie.las_on'):tr('pie.las_off'),'pieLas',{},UI.pieLas?'green sm':'ghost sm')}</div>`;
    h+=`<p class="meta">${tr('pie.stock_line',{n:Math.floor(P.stock)})}</p>`;
    if(P.q.length)h+=`<h3 style="font-size:15px;margin:10px 0 4px">${tr('pie.queue')}</h3>`+P.q.slice().sort((a,b)=>a.day-b.day).map(L=>`<div class="kv"><span>${esc(tr(ROCKETS[L.rk].n))} → ${esc(tr(CRUSTS[L.cr].n))}</span><b>${L.test?tr('pie.test_flight'):L.n} · ${esc(CITY[L.pad].name)} · ${dateStr(L.day)}</b></div>`).join('');
  }else if(T==='dish'){
    h+=`<p class="meta">${tr('pie.dish_note')}</p>`+P.dishes.map(x=>{const cc=CITY[x.city].cc,ok=pieLicOk(cc);return `<div class="kv"><span>📡 ${esc(CITY[x.city].name)} · ${trn('pie.n_antennas',x.ant)}${ok?'':' · '+tr('pie.no_rights')}</span>${btn(tr('pie.add_antenna',{price:fmt$(piePrice(PIE_ANT))}),'pieAnt',{id:x.id},'ghost sm',!can||x.ant>=PIE_ANT_MAX)}</div>`;}).join('');
    h+=sel+`<div class="btns">${btn(tr('pie.build_dish_price',{city:esc(CITY[c].name),price:fmt$(piePrice(PIE_DISH+PIE_ANT))}),'pieDish',{city:c},'ghost sm',!can||P.dishes.some(x=>x.city===c))}</div>`;
    const ccs=[...new Set([...P.dishes.map(x=>CITY[x.city].cc),CITY[c].cc,...Object.keys(P.lic)])];
    h+=`<h3 style="font-size:15px;margin:10px 0 4px">${tr('pie.landing_rights')}</h3>`+ccs.map(cc=>{const l=P.lic[cc],ok=pieLicOk(cc);
      return `<div class="kv"><span>${esc(pieLicCountry(cc))}${ok?' · '+tr('pie.lic_until',{d:dateStr(l.until)}):l&&l.state!=='ok'&&l.until>S.day?' · '+tr('pie.lic_refused'):''}</span>${btn((ok?tr('pie.renew'):tr('pie.buy'))+' '+fmt$(pieLicPrice(cc)),'pieLic',{cc},'ghost sm')}</div>`;}).join('');
  }else{
    const F=P.founder;h+=`<div class="kv"><span>${tr('pie.promises')}</span><b>${tr('pie.promises_line',{n:F.promises,b:F.broken})}</b></div>`;
    h+=`<div class="kv"><span>${tr('pie.spent')}</span><b>${fmt$(P.book.spent)}</b></div><div class="kv"><span>${tr('pie.earned')}</span><b>${fmt$(P.book.earned)}</b></div>`;
    if(R&&R.pie)h+=`<p class="meta">${tr('pie.earned_mo',{amt:fmt$(R.pie.rev),n:R.pie.isl.length})}</p>`;
    if(pieSand())h+=`<div class="kv"><span>${tr('pie.would_have')}</span><b>${fmt$(P.book.wouldHave)}</b></div>`;
    h+=`<h3 style="font-size:15px;margin:10px 0 4px">${tr('pie.founder_feed')}</h3>`+(F.posts.length?F.posts.map(p=>`<div class="ops-rep"><div class="eyebrow">${esc(dateStr(p.d))}</div><div>${esc(pieFpText(p))}</div></div>`).join(''):`<p class="meta">${tr('pie.feed_empty')}</p>`);
  }
  openModal(h,'pie');{const cv=document.querySelector('#modal .pgcv');if(cv)pieGlobeOpen(cv,pieGlobeData);}}
