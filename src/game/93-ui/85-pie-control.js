// Pie Control: a plain modal (a bottom sheet on phones) for the rocket company. Reached from the NOC tab (pieNocBtn()).
let PIE_CCN=null;
function pieLicCountry(cc){try{PIE_CCN=PIE_CCN&&PIE_CCN.l===LANG?PIE_CCN:{l:LANG,d:new Intl.DisplayNames([LANG],{type:'region'})};return PIE_CCN.d.of(cc)||cc;}catch(e){return cc;}}
// Pie Control sits in the NOC tab's top row once the rocket company is unlocked; a spat waiting for an answer keeps its own card lower down.
function pieNocBtn(){if(!pieOn())return '';return btn(`🥧 ${tr('pie.open_pie_control')}`,'pieOpen',{},'');}
const PIE_TABS=['traffic','co','fly','dish'];
// The tab UI.pieTab names, or the one that took its place: Gov moved to the bank, the Founder's feed into Company.
const pieTabOf=t=>PIE_TABS.includes(t)?t:t==='book'||t==='founder'?'co':'traffic';
const PIE_FEED_TOP=3;
const pieTag=(t,on)=>`<span class="tag ${on?'open':'selective'}">${t}</span>`;
function pieModal(){if(!S||!pieOn())return;const P=S.pie||pieBlank(S.day),can=pieCanBuild(),T=UI.pieTab=pieTabOf(UI.pieTab);
  let h=`<div style="display:flex;align-items:center"><div class="grow"><div class="eyebrow">${tr('pie.pie_in_the_sky')}</div><h2 style="font-size:24px">${P.co?esc(pieCoName()):tr('pie.pie_control')}</h2></div><button class="x" data-act="closeModal" aria-label="${tr('common.close')}">×</button></div>`;
  if(!can)h+=`<p class="why">${tr('pie.why_not_t1')}</p>`;
  if(pieSand())h+=`<p class="note">${tr('pie.sandbox_note',{amt:fmt$(P.book.wouldHave)})}</p>`;
  if(!P.co){h+=`<p class="lead">${tr('pie.found_pitch')}</p><div class="btns">${btn(tr('pie.found_price',{price:fmt$(piePrice(PIE_CO)),mo:fmt$(PIE_CO_MO)}),'pieFound',{},'pink',!can)}</div>`;openModal(h,'pie');return;}
  const tab=(k,l)=>`<button class="${T===k?'on':''}" data-act="pieTab" data-args='{"t":"${k}"}' aria-pressed="${T===k}">${l}</button>`;
  h+=pieGlobeHtml()+pieSpatCard();
  h+=`<div class="segc pie-tabs">${tab('traffic',tr('pie_traffic.tab'))}${tab('co',tr('pie.tab_company'))}${tab('fly',tr('pie.tab_launch'))}${tab('dish',tr('pie.tab_dishes'))}</div>`;
  const cities=Object.keys(S.pops).sort((a,b)=>CITY[a].name.localeCompare(CITY[b].name)),c=S.pops[UI.pieCity]?UI.pieCity:cities[0];
  const sel=`<div class="trsel"><label>${tr('common.your_pop')}<select data-chg="pieCity">${cities.map(x=>`<option value="${x}"${x===c?' selected':''}>${esc(CITY[x].name)}</option>`).join('')}</select></label></div>`;
  if(T==='traffic')h+=pieTrafficHtml();
  else if(T==='co'){
    h+=`<div class="kv"><span>${tr('pie.running_costs')}</span><b>${tr('common.price_mo',{price:fmt$(pieMo())})}</b></div>`;
    h+=`<div class="kv"><span>${tr('pie.spent')}</span><b>${fmt$(P.book.spent)}</b></div><div class="kv"><span>${tr('pie.earned')}</span><b>${fmt$(P.book.earned)}</b></div>`;
    if(R&&R.pie)h+=`<p class="meta">${tr('pie.earned_mo',{amt:fmt$(R.pie.rev),n:R.pie.isl.length})}</p>`;
    if(pieSand())h+=`<div class="kv"><span>${tr('pie.would_have')}</span><b>${fmt$(P.book.wouldHave)}</b></div>`;
    h+=`<div class="ops-o${P.fac?' on':''}"><div class="nm">🏭 ${tr('pie.factory')}</div><div class="meta">${P.fac?tr('pie.factory_stock',{n:Math.floor(P.stock),m:PIE_FAC_MONTH}):tr('pie.factory_pitch',{m:PIE_FAC_MONTH,mo:fmt$(PIE_FAC_MO)})}</div>${P.fac?'':`<div class="btns">${btn(tr('pie.build_price',{price:fmt$(piePrice(PIE_FAC))}),'pieFactory',{},'pink sm',!can)}</div>`}</div>`;
    h+=`<div class="ops-o"><div class="nm">🧪 ${tr('pie.rd')}</div>${Object.keys(PIE_RD).map(k=>`<div class="kv"><span>${tr(PIE_RD[k].n)}</span>${P.rd[k]?`<b>✓</b>`:btn(fmt$(piePrice(PIE_RD[k].cost)),'pieRd',{k},'ghost sm',!can)}</div>`).join('')}
      ${P.rd.heavy?`<p class="meta">${tr('pie.heavy_tests',{n:P.rd.heavyTests,max:PIE_HEAVY_TESTS})}</p>`:''}</div>`;
    h+=`<div class="ops-o"><div class="nm">🚀 ${tr('pie.pads')}</div>${P.pads.map(p=>`<div class="kv"><span>${esc(CITY[p.city].name)} · −${pct(pieEq(p.city))}</span><b>${p.next>S.day?tr('pie.pad_busy',{d:dateStr(p.next)}):tr('pie.pad_free')}${p.boosters.length?' · '+trn('pie.n_boosters',p.boosters.length):''}</b></div>`).join('')||`<p class="meta">${tr('pie.no_pads')}</p>`}
      ${sel}<div class="btns">${btn(tr('pie.build_pad_price',{city:esc(CITY[c].name),price:fmt$(piePrice(PIE_PAD))}),'piePad',{city:c},'ghost sm',!can||!pieCoast(c)||P.pads.some(p=>p.city===c)||P.pads.length>=PIE_PAD_MAX)}</div>${pieCoast(c)?'':`<p class="why">${tr('pie.why_pad_city')}</p>`}</div>`;
    h+=`<div class="ops-o"><div class="nm">🏷️ ${tr('pie.name')}</div><div class="btns">${btn(tr('pie.next_name'),'pieName',{},'ghost sm')}</div>
      <div class="network-name" style="margin-top:6px"><input class="t" id="pieNm" maxlength="40" value="${esc(pieCoName())}" autocomplete="off" aria-label="${esc(tr('pie.name'))}"></div><div class="btns">${btn(tr('slots.rename'),'pieRename',{},'ghost sm')}</div></div>`;
    h+=`<div class="btns">${btn(P.safe?tr('pie.safe_on'):tr('pie.safe_off'),'pieSafe',{},P.safe?'red sm':'ghost sm')}</div><p class="meta">${tr('pie.safe_note')}</p>`;
    h+=pieFeedHtml(P.founder);
  }else if(T==='fly'){
    let nudge=false;
    h+=Object.keys(CRUSTS).map(id=>{const C=CRUSTS[id],cv=pieCov(id);return `<div class="ops-o${pieUp(id)?' on':''}"><div class="nm">${tr(C.n)} ${pieTag(pieBaked(id)?tr('pie.baked'):tr('pie.half_baked'),pieBaked(id))}</div>
      <div class="meta">${tr('pie.crust_line',{alt:C.alt,n:pieLive(id),full:C.full,q:P.crusts[id].queued,p:pct(cv)})}</div><div class="bar ${cv>=PIE_BAKED?'':'warn'}"><i style="width:${Math.round(cv*100)}%"></i></div>
      ${(()=>{const f=pieLive(id)+P.crusts[id].queued>0&&pieLive(id)<C.full?piePace(id):null;if(!f)return '';
        const m=Math.max(1,Math.round(f.days/30)),t=m<=24?trn('pie.pace_months',m,{mo:f.mo}):trn('pie.pace_years',Math.round(f.days/360),{mo:f.mo});
        let x=`<p class="meta pie-pace">${t}</p>`;
        if(!nudge&&f.pad&&f.days>PIE_PACE_SLOW&&P.pads.length<PIE_PAD_MAX){nudge=true;const c=piePadTip(id);
          x+=c?`<p class="note pie-nudge">${tr('pie.pace_pad',{city:esc(CITY[c].name),p:pct(pieEq(c))})}</p><div class="btns">${btn(tr('pie.build_pad_price',{city:esc(CITY[c].name),price:fmt$(piePrice(PIE_PAD))}),'piePad',{city:c},'ghost sm',!can)}</div>`
            :`<p class="note pie-nudge">${tr('pie.pace_pad_none')}</p>`;}
        return x;})()}
      <div class="ops-p">${Object.keys(ROCKETS).filter(pieRkOk).map(rk=>{const q=pieQuote(rk,id,{ins:!!UI.pieIns,las:!!UI.pieLas});return btn(`${tr(ROCKETS[rk].n)} <small>${q.ok?(q.test?tr('pie.test_flight')+' · ':'')+fmt$(q.cost):esc(q.why)}</small>`,'pieLaunch',{rk,cr:id},'ghost sm',!q.ok);}).join('')}</div></div>`;}).join('');
    h+=`<div class="ops-p">${btn(UI.pieIns?tr('pie.ins_on_p',{p:pct(PIE_INS*pieInsMul())}):tr('pie.ins_off'),'pieIns',{},UI.pieIns?'green sm':'ghost sm')}${btn(UI.pieLas?tr('pie.las_on'):tr('pie.las_off'),'pieLas',{},UI.pieLas?'green sm':'ghost sm')}</div>`;
    h+=`<p class="meta">${tr('pie.stock_line',{n:Math.floor(P.stock)})}</p>`;
    if(P.q.length)h+=`<h3 style="font-size:15px;margin:10px 0 4px">${tr('pie.queue')}</h3>`+P.q.slice().sort((a,b)=>a.day-b.day).map(L=>`<div class="kv"><span>${esc(tr(ROCKETS[L.rk].n))} → ${esc(tr(CRUSTS[L.cr].n))}</span><b>${L.test?tr('pie.test_flight'):L.n} · ${esc(CITY[L.pad].name)} · ${dateStr(L.day)}</b></div>`).join('');
  }else if(T==='dish'){
    h+=`<p class="meta">${tr('pie.dish_note')}</p>`;
    // A gentle hint while the sky is nearly empty: dishes cost money every month and earn nothing yet. Building stays open.
    {const top=Math.max(...Object.keys(CRUSTS).map(pieCov));if(top<PIE_DISH_WAIT)h+=`<p class="note pie-wait">${tr('pie.dish_wait',{min:pct(PIE_RAW),p:pct(top),mo:fmt$(PIE_DISH_MO),lo:pct(PIE_PATCHY_LO)})}</p>`;}
    h+=P.dishes.map(x=>{const cc=CITY[x.city].cc,ok=pieLicOk(cc);return `<div class="kv"><span>📡 ${esc(CITY[x.city].name)} · ${trn('pie.n_antennas',x.ant)}${ok?'':' · '+tr('pie.no_rights')}</span>${btn(tr('pie.add_antenna',{price:fmt$(piePrice(PIE_ANT))}),'pieAnt',{id:x.id},'ghost sm',!can||x.ant>=PIE_ANT_MAX)}</div>`;}).join('');
    h+=sel+`<div class="btns">${btn(tr('pie.build_dish_price',{city:esc(CITY[c].name),price:fmt$(piePrice(PIE_DISH+PIE_ANT))}),'pieDish',{city:c},'ghost sm',!can||P.dishes.some(x=>x.city===c))}</div>`;
    const ccs=[...new Set([...P.dishes.map(x=>CITY[x.city].cc),CITY[c].cc,...Object.keys(P.lic)])];
    h+=`<h3 style="font-size:15px;margin:10px 0 4px">${tr('pie.landing_rights')}</h3>`+ccs.map(cc=>{const l=P.lic[cc],ok=pieLicOk(cc);
      return `<div class="kv"><span>${esc(pieLicCountry(cc))}${ok?' · '+tr('pie.lic_until',{d:dateStr(l.until)}):l&&l.state!=='ok'&&l.until>S.day?' · '+tr('pie.lic_refused'):''}</span>${btn((ok?tr('pie.renew'):tr('pie.buy'))+' '+fmt$(pieLicPrice(cc)),'pieLic',{cc},'ghost sm')}</div>`;}).join('');
  }
  openModal(h,'pie');{const cv=document.querySelector('#modal .pgcv');if(cv)pieGlobeOpen(cv,pieGlobeData);}}
// The Founder's posts are flavour: the newest few at the bottom of the Company tab, the older ones folded away.
function pieFeedHtml(F){const post=p=>`<div class="ops-rep"><div class="eyebrow">${esc(dateStr(p.d))}</div><div>${esc(pieFpText(p))}</div></div>`,top=F.posts.slice(0,PIE_FEED_TOP),more=F.posts.slice(PIE_FEED_TOP);
  return `<div class="pie-feed"><h3>${tr('pie.founder_feed')}</h3><div class="kv"><span>${tr('pie.promises')}</span><b>${tr('pie.promises_line',{n:F.promises,b:F.broken})}</b></div>`+pieJitHtml(F)
    +(top.length?top.map(post).join(''):`<p class="meta">${tr('pie.feed_empty')}</p>`)
    +(more.length?`<details><summary>${trn('pie.feed_older',more.length)}</summary>${more.map(post).join('')}</details>`:'')+'</div>';}
