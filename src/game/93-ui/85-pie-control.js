// Pie Control: a wide modal (a bottom sheet on phones) for the rocket company. Reached from the NOC tab (pieNocBtn()).
let PIE_CCN=null;
function pieLicCountry(cc){try{PIE_CCN=PIE_CCN&&PIE_CCN.l===LANG?PIE_CCN:{l:LANG,d:new Intl.DisplayNames([LANG],{type:'region'})};return PIE_CCN.d.of(cc)||cc;}catch(e){return cc;}}
// Pie Control sits in the NOC tab's top row once the rocket company is unlocked; a spat waiting for an answer keeps its own card lower down.
function pieNocBtn(){if(!pieOn())return '';return btn(`🥧 ${tr('pie.open_pie_control')}`,'pieOpen',{},'');}
/* Tabs on the NOC dashboard's pattern, one per thing you own and two that cut across: the overview, the bottlenecks, the
   crusts (pies, traffic, launches), the ground (dishes, their load, landing rights), the customers and the company
   (factory, R&D, pads, books). Wide on a desktop, a bottom sheet on phones. */
const PIE_TABS=['home','fix','crust','dish','cust','co'];
// The tab UI.pieTab names, or the one that took its place: Gov moved to the bank, the Founder's feed into Company.
// Older names land where their content went: launches and pies in Crusts, production and the books in Company.
const pieTabOf=t=>PIE_TABS.includes(t)?t:t==='pies'||t==='fly'?'crust':t==='prod'||t==='book'||t==='founder'?'co':'home';
const PIE_FEED_TOP=3;
const pieTag=(t,on)=>`<span class="tag ${on?'open':'selective'}">${t}</span>`;
// Why a build button is off, said next to it: not Tier 1, not enough cash, or the reason given.
function pieOff(cost,why){if(why)return why;if(!pieCanBuild())return tr('pie.off_t1');if(cost>0&&!pieSand()&&S.cash<cost)return tr('pie.off_cash');return '';}
const pieBtn=(label,act,args,cls,cost,why,title)=>{const w=pieOff(cost,why);return `<span class="pie-bw">${btn(label,act,args,cls,!!w,w||title||'')}${w?`<small class="why">${w}</small>`:''}</span>`;};
const pieTile=(l,v,sub)=>`<div class="tile"><div class="lbl">${l}</div><div class="val">${v}</div>${sub?`<div class="sub">${sub}</div>`:''}</div>`;
// The tabs that show the globe beside their content (on phones above it): what flies, and where.
const PIE_GLOBE_TABS=['home','cust','dish'];
function pieModal(){if(!S||!pieOn())return;const P=S.pie||pieBlank(S.day),can=pieCanBuild(),T=UI.pieTab=pieTabOf(UI.pieTab);
  let h=`<div style="display:flex;align-items:center;gap:10px"><div class="grow"><div class="eyebrow">${tr('pie.pie_in_the_sky')}</div><h2 style="font-size:26px">${P.co?esc(pieCoName()):tr('pie.pie_control')}</h2></div><button class="x" data-act="closeModal" aria-label="${tr('common.close')}">×</button></div>`;
  if(!can)h+=`<p class="why">${tr('pie.why_not_t1')}</p>`;
  if(pieSand())h+=`<p class="note">${tr('pie.sandbox_note',{amt:fmt$(P.book.wouldHave)})}</p>`;
  if(!P.co){h+=`<p class="lead">${tr('pie.found_pitch')}</p><div class="btns">${btn(tr('pie.found_price',{price:fmt$(piePrice(PIE_CO)),mo:fmt$(PIE_CO_MO)}),'pieFound',{},'pink',!can)}</div>`;openModal(h,'pie');return;}
  const Q=R&&R.pie,nfx=Q&&Q.flows?pieFixes(Q).length:0,L={home:tr('common.overview'),fix:tr('pie_fix.title'),crust:tr('pie_traffic.crusts'),dish:tr('pie.tab_dishes'),cust:tr('common.customers'),co:tr('pie.tab_company')};
  h+=`<nav class="dtabs pie-tabs">${PIE_TABS.map(k=>`<button class="${T===k?'on':''}" data-act="pieTab" data-args='{"t":"${k}"}' aria-pressed="${T===k}">${L[k]}${k==='fix'&&nfx?`<span class="cnt red">${nfx}</span>`:''}</button>`).join('')}</nav>`;
  let body='';
  if(T==='home')body=pieHomeHtml(P,Q);
  else if(T==='fix')body=Q&&Q.flows?pieFixTab(Q):`<p class="meta">${tr('pie_traffic.no_data')}</p>`;
  else if(T==='crust')body=pieCrustTab(P,can);
  else if(T==='dish')body=pieGroundHtml(P,can);
  else if(T==='cust')body=pieCustHtml();
  else if(T==='co')body=pieProdHtml(P,can)+`<h3 class="pie-sec">${tr('pie.tab_company')}</h3>`+pieCoHtml(P);
  h+=PIE_GLOBE_TABS.includes(T)?`<div class="pie-cols"><div class="pie-side">${pieGlobeHtml()}${T==='home'?pieQueueHtml(P,8):''}<div class="btns">${btn(UI.pieNoSats?tr('pie.sats_show'):tr('pie.sats_hide'),'pieNoSats',{},'ghost sm')}</div>${T==='dish'?`<p class="meta">${tr('pie.globe_pick')}</p>`:''}</div><div class="pie-main">${body}</div></div>`:body;
  openModal(h,'pie');{const cv=document.querySelector('#modal .pgcv');if(cv)pieGlobeOpen(cv,pieGlobeData);}}
// Overview: the numbers that matter, then the worst bottlenecks.
function pieHomeHtml(P,Q){const best=Object.keys(CRUSTS).sort((a,b)=>pieCov(b)-pieCov(a))[0],cr=Q&&Q.crust||[],cc=cr.reduce((a,c)=>a+c.cap,0),cu=cr.reduce((a,c)=>a+c.used,0);
  const ds=Q&&Q.dish||[],dc=ds.reduce((a,d)=>a+d.cap,0),du=ds.reduce((a,d)=>a+Math.min(d.used,d.cap),0),nx=P.q.slice().sort((a,b)=>a.day-b.day)[0];
  const term=S.biz.filter(b=>BIZ_T[b.type].orbit).length,circ=Q&&Q.flows?Q.flows.filter(f=>f.k==='c'&&f.g>0).length:0,ask=pieSpatCard();
  let h=(ask?`<div class="panel2 pie-ask"><h3>🌍 ${tr('pie.req_title')}</h3>${ask}</div>`:'')+pieSkyHead(Q)+`<div class="dgrid pie-tiles">${pieTile(tr('common.customers'),term+circ,tr('pie.t_cust',{t:term,c:circ}))}${pieTile(tr('pie.t_cov'),pct(pieCov(best)),esc(tr(CRUSTS[best].n)))}${pieTile(tr('pie.t_crcap'),fmtG(cu),tr('pie.t_of',{cap:fmtG(cc)}))}${pieTile(tr('pie.t_dishcap'),fmtG(du),tr('pie.t_of',{cap:fmtG(dc)}))}`
    +`${pieTile(tr('pie.t_rev'),fmt$(Q?Q.rev:0),tr('pie.t_costs',{mo:fmt$(pieMo())}))}${pieTile(tr('pie.t_ground'),P.dishes.length,'📡 '+P.dishes.reduce((a,x)=>a+x.ant,0))}`
    +`${pieTile(tr('pie.queue'),P.q.length,nx?dateStr(nx.day):tr('pie.t_none'))}${pieTile(tr('pie.t_stock'),Math.floor(P.stock),tr('pie.t_per_mo',{n:P.fac?pieFacMonth():0}))}</div>`;
  // The crusts at a glance: how far each is from full, and the pies it still lacks.
  h+=`<div class="panel2 pie-crl"><h3>${tr('pie_traffic.crusts')}</h3>`+Object.keys(CRUSTS).map(id=>{const C=CRUSTS[id],n=pieLive(id),q=P.crusts[id].queued,cv=pieCov(id),gap=Math.max(0,C.full-n-q);
    const qc=cr.find(x=>x.id===id),u=qc&&qc.cap>0?qc.used/qc.cap:null;
    return `<div class="pie-crr"><span class="nm" title="${esc(tr(C.n))}">${esc(tr(C.n).replace(/\s*\(.*\)$/,''))}</span><div class="bar ${cv>=PIE_BAKED?'':'warn'}"><i style="width:${Math.round(cv*100)}%"></i></div><span class="n">${n.toLocaleString()}/${C.full.toLocaleString()}${q?` <small>+${q}</small>`:''}</span><span class="${gap?'gap':'ok'}">${!n?'':gap?trn('pie.t_gap',gap):'✓'}</span><span class="tu ${u===null?'':pieLoadCls(u)}">${!n?'':u===null?tr('pie.t_noflow'):tr('pie.t_load',{p:pct(u)})+(u>=PIE_FULL?' · '+tr('pie.t_full'):'')}</span></div>`;}).join('')
    +`<div class="btns">${btn(tr('pie_traffic.a_launch'),'pieTab',{t:'crust'},'ghost sm')}</div></div>`;
  // The worst bottlenecks, just above the market's nerves.
  h+=pieHomeFix(Q);
  // The market's nerves (the Founder's antics, 99-pie-jitters.js); his posts are on the Company tab.
  h+=`<div class="panel2" style="margin-top:10px"><h3>${tr('pie.home_nerves')}</h3>${pieJitHtml(P.founder)}<div class="btns">${btn(tr('pie.see_feed'),'pieTab',{t:'co'},'ghost sm')}</div></div>`;
  return h;}
// The worst three bottlenecks, each on one line, and the way to the full list.
function pieHomeFix(Q){if(!Q||!Q.flows)return '';let h='';
  {const fx=pieFixes(Q);h+=`<div class="panel2" style="margin-top:10px"><h3>${tr('pie_fix.title')}</h3>`+(fx.length?`<div class="pie-fxm-l">${fx.slice(0,3).map(x=>`<div class="pie-fxm"><span aria-hidden="true">${x.ic}</span><b>${x.t}</b><span class="n">${x.lack>0?'−'+fmtG(x.lack):''}</span></div>`).join('')}</div><div class="btns">${btn(trn('pie_fix.see_all',fx.length),'pieTab',{t:'fix'},'ghost sm')}</div>`:`<p class="meta">✅ ${tr('pie_fix.none')}</p>`)+'</div>';}
  return h;}
// Crusts: the launch options (kept in the save), the rockets folded away, then a card per crust: its pies, lasers and wear,
// its traffic, the pace and the launch buttons; the queue last.
function pieCrustTab(P,can){let nudge=false;const o=P.opt,Q=R&&R.pie;
  const tg=(k,on,l,d)=>`<button class="pie-tg${on?' on':''}" data-act="${k}" data-args="{}" aria-pressed="${on}"><span class="pie-tg-b" aria-hidden="true">${on?'✓':''}</span><span><b>${l}</b><small>${d}</small></span></button>`;
  let h=`<div class="pie-tgs">`
    +tg('pieIns',o.ins,o.ins?tr('pie.ins_on_p',{p:pct(PIE_INS*pieInsMul())}):tr('pie.ins_off'),tr('pie.opt_ins_d',{p:pct(PIE_INS*pieInsMul())}))
    +tg('pieAll',o.all,o.all?tr('pie.all_on'):tr('pie.all_off'),tr('pie.opt_all_d'))+`</div>`
    // Lasers are research now: once done, every pie launched has them.
    +`<p class="meta pie-lasr">🔦 ${P.rd.las?tr('pie.las_rd_on',{km:PIE_BENT.toLocaleString()}):tr('pie.las_rd_off',{km:PIE_BENT.toLocaleString()})}${P.rd.las?'':' '+pieBtn(`${tr(PIE_RD.las.n)} <small>${fmt$(piePrice(PIE_RD.las.cost))}</small>`,'pieRd',{k:'las'},'ghost sm',piePrice(PIE_RD.las.cost))}</p>`;
  h+=`<details class="pie-rkd"${UI.pieRk?' open':''}><summary data-act="pieRkd">${tr('pie.rk_fold')}</summary><div class="tscroll"><table class="tbl pie-rk"><thead><tr><th>${tr('pie.rk_col')}</th><th class="r">${tr('pie.rk_pies')}</th><th class="r">${tr('pie.rk_cost')}</th><th class="r">${tr('pie.rk_gap')}</th><th class="r">${tr('pie.rk_fail')}</th><th>${tr('pie.rk_note')}</th></tr></thead><tbody>`
    +Object.keys(ROCKETS).map(rk=>{const R0=ROCKETS[rk],ok=pieRkOk(rk),note=rk==='again'?tr('pie.rk_n_reuse',{p:pct(R0.land)}):rk==='heavy'?tr('pie.rk_n_heavy',{n:PIE_HEAVY_TESTS}):tr('pie.rk_n_medium');
      return `<tr class="${ok?'':'pie-off'}"><td><b>${tr(R0.d)}</b> <small>“${tr(R0.n)}”</small></td><td class="r">${R0.pies}</td><td class="r">${fmt$(piePrice(R0.cost))}</td><td class="r">${trn('pie.n_days',leadDays(R0.gap))}</td><td class="r">${pct(R0.fail)}</td><td><small>${note}${ok?'':' · '+tr('pie.why_no_rd',{rd:tr(PIE_RD[R0.rd].n)})}</small></td></tr>`;}).join('')
    +`</tbody></table></div></details>`;
  h+=`<p class="meta">${tr('pie.stock_line',{n:Math.floor(P.stock)})}${P.q.length>=PIE_Q_MAX*0.8?' · '+tr('pie.queue_room',{n:P.q.length,max:PIE_Q_MAX}):''}</p>`;
  h+=`<div class="pie-cgrid">`+Object.keys(CRUSTS).map(id=>{const C=CRUSTS[id],cv=pieCov(id),live=pieLive(id),qd=P.crusts[id].queued,max=Math.floor(C.full*PIE_SPARE),room=Math.max(0,max-live-qd);
    return `<div class="ops-o pie-cc2${pieUp(id)?' on':''}"><div class="nm">${tr(C.n)} ${live?pieTag(pieBaked(id)?tr('pie.baked'):tr('pie.half_baked'),pieBaked(id)):''} ${C.polar?'':`<small class="meta">≤${C.inc}°</small>`}</div>
    <div class="bar ${cv>=PIE_BAKED?'':'warn'}"><i style="width:${Math.round(cv*100)}%"></i></div>
    <div class="meta">${tr('pie.crust_stats',{n:live.toLocaleString(),full:C.full.toLocaleString(),q:qd,room})}</div>${pieLasLine(id)}${pieCrustLoad(id,Q)}${live?(()=>{const w=pieWear(id);return `<div class="meta">${tr('pie.pp_wear')} · ${tr('pie.pp_wear_v',{n:w.soon,a:w.age.toFixed(1)})}</div>`;})():''}
    ${(()=>{const f=live+qd>0&&live<C.full?piePace(id):null;if(!f)return '';
      const m=Math.max(1,Math.round(f.days/30)),t=m<=24?trn('pie.pace_months',m,{mo:f.mo}):trn('pie.pace_years',Math.round(f.days/360),{mo:f.mo});
      let x=`<p class="meta pie-pace">${t}</p>`;
      if(!nudge&&f.pad&&f.days>PIE_PACE_SLOW&&P.pads.length<PIE_PAD_MAX){nudge=true;const c=piePadTip(id);
        x+=c?`<p class="note pie-nudge">${tr('pie.pace_pad',{city:esc(CITY[c].name),p:pct(pieEq(c))})}</p><div class="btns">${btn(tr('pie.build_pad_price',{city:esc(CITY[c].name),price:fmt$(piePrice(PIE_PAD))}),'piePad',{city:c},'ghost sm',!can)}</div>`
          :`<p class="note pie-nudge">${tr('pie.pace_pad_none')}</p>`;}
      return x;})()}
    <div class="ops-p">${Object.keys(ROCKETS).filter(pieRkOk).map(rk=>{const q=pieQuote(rk,id,{ins:o.ins,las:P.rd.las}),k=o.all&&q.ok&&!q.test?pieSlots(id):1;
      return `<span class="pie-bw">${btn(`🚀 ${tr(ROCKETS[rk].d)}${k>1?' ×'+k:''} <small>${q.ok?(q.test?tr('pie.test_flight'):trn('pie.n_pies',q.n))+' · '+fmt$(q.cost)+(k>1?' '+tr('pie.each'):''):''}</small>`,'pieLaunch',{rk,cr:id},'ghost sm',!q.ok,q.ok?'':q.why)}${q.ok?'':`<small class="why">${esc(q.why)}</small>`}</span>`;}).join('')}</div>${P.rd.las&&live?(nl=>nl?`<p class="meta pie-swap">🔄 ${tr('pie.swap_line',{n:nl.toLocaleString()})}</p>`:'')(pieNoLas(id)):''}</div>`;}).join('')+`</div>`;
  h+=pieQueueHtml(P);
  return h;}
// The launches waiting on the pads, soonest first: under the Crusts tab, and the first few under the overview's globe.
function pieQueueHtml(P,max){if(!P.q.length)return '';const q=P.q.slice().sort((a,b)=>a.day-b.day),sh=max?q.slice(0,max):q,cr=id=>esc(tr(CRUSTS[id].n).replace(/\s*\(.*\)$/,''));
  return `<div class="pie-queue${max?' side':''}"><h3>${tr('pie.queue')} <span class="meta">${q.length}</span></h3>`+sh.map(L=>`<div class="pie-ql"><span class="d">${dateStr(L.day)}</span><span>🚀 ${esc(tr(ROCKETS[L.rk].d))} → ${cr(L.cr)}</span><span class="m">${L.test?tr('pie.test_flight'):trn('pie.n_pies',L.n)} · ${esc(CITY[L.pad].name)}</span></div>`).join('')
    +(max&&q.length>max?`<div class="btns">${btn(trn('pie.pad_more',q.length-max),'pieTab',{t:'crust'},'ghost sm')}</div>`:'')+`</div>`;}
// Production: the factory and its lines, R&D, the pads and their towers, and where the next pad could go.
function pieProdHtml(P,can){let h=`<div class="dcols"><div>`;
  h+=`<div class="panel2${P.fac?' on':''}"><h3>🏭 ${tr('pie.factory')}</h3><div class="meta">${P.fac?tr('pie.factory_lines',{n:Math.floor(P.stock),max:pieStockMax(),m:pieFacMonth(),l:P.lines,lmax:PIE_LINE_MAX}):tr('pie.factory_pitch',{m:PIE_FAC_MONTH,mo:fmt$(PIE_FAC_MO)})}</div>`
    +(P.fac?`<div class="bar"><i style="width:${Math.round(P.lines/PIE_LINE_MAX*100)}%"></i></div><div class="btns">${P.lines<PIE_LINE_MAX?pieBtn(tr('pie.add_line',{price:fmt$(piePrice(PIE_LINE)),m:PIE_FAC_MONTH,mo:fmt$(PIE_LINE_MO)}),'pieLine',{},'ghost sm',piePrice(PIE_LINE)):''}${P.lines>1?btn(tr('pie.del_line',{amt:fmt$(Math.round(piePrice(PIE_LINE)*PIE_SALVAGE)),mo:fmt$(PIE_LINE_MO)}),'pieLineDel',{},'ghost sm'):''}</div>`:`<div class="btns">${pieBtn(tr('pie.build_price',{price:fmt$(piePrice(PIE_FAC))}),'pieFactory',{},'pink sm',piePrice(PIE_FAC))}</div>`)+`</div>`;
  h+=`</div><div><div class="panel2"><h3>🧪 ${tr('pie.rd')}</h3>${Object.keys(PIE_RD).map(k=>`<div class="kv"><span>${tr(PIE_RD[k].n)}</span>${P.rd[k]?`<b>✓</b>`:pieBtn(fmt$(piePrice(PIE_RD[k].cost)),'pieRd',{k},'ghost sm',piePrice(PIE_RD[k].cost))}</div>`).join('')}
    ${P.rd.heavy?`<p class="meta">${tr('pie.heavy_tests',{n:P.rd.heavyTests,max:PIE_HEAVY_TESTS})}</p>`:''}</div></div></div>`;
  h+=`<div class="panel2" style="margin-top:12px"><h3>🚀 ${tr('pie.pads')} <span class="meta">${P.pads.length}/${PIE_PAD_MAX}</span></h3>${P.pads.map(p=>piePadRow(P,p)).join('')||`<p class="meta">${tr('pie.no_pads')}</p>`}
    ${P.pads.length?`<p class="meta">${tr('pie.tower_note',{mo:fmt$(PIE_TOWER_MO)})}</p>`:''}
    ${P.pads.length<PIE_PAD_MAX?`<div class="btns">${btn((UI.piePadNew?'▾ ':'▸ ')+tr('pie.pad_new_btn'),'piePadNew',{},UI.piePadNew||!P.pads.length?'ghost sm on':'pink sm')}</div>${UI.piePadNew||!P.pads.length?piePadPick(P,can):''}`:''}</div>`;
  return h;}
// One line per pad: name and latitude, the launch discount, its towers as dots, a readiness bar (green when free, amber
// filling up to its next slot), what is queued there, its boosters, then the buttons. The confirm opens underneath.
function piePadRow(P,p){const la=CITY[p.city].lat,left=Math.max(0,p.next-S.day),gap=piePadGap(p,'falcon'),q=P.q.filter(L=>L.pad===p.city).length,eq=pieEq(p.city);
  const r=left?Math.max(0.05,1-left/Math.max(gap,left)):1;
  return `<div class="pie-padr"><span class="nm"><b>🚀 ${esc(CITY[p.city].name)}</b> <small>${esc(pieLicCountry(CITY[p.city].cc))} · ${Math.abs(Math.round(la))}°${la<0?'S':'N'}</small></span>
    <span class="tag ${eq>0?'open':'st'}">${eq>0?'−'+pct(eq):tr('pie.pad_no_discount')}</span>
    <span class="pie-tw" title="${esc(trn('pie.n_towers',p.t))}">${'●'.repeat(p.t)}${'○'.repeat(PIE_TOWER_MAX-p.t)}</span>
    <span class="pie-rdy ${left?'busy':'ok'}"${left?` title="${esc(tr('pie.pad_busy',{d:dateStr(p.next)}))}"`:''}><span class="bar"><i style="width:${Math.round(r*100)}%"></i></span><small>${left?trn('pie.pad_in',left):tr('pie.pad_free')}</small></span>
    <span class="pie-pq">${q?`<span title="${esc(trn('pie.pad_close_n',q))}">⏳×${q}</span>`:''}${p.boosters.length?` <span title="${esc(trn('pie.n_boosters',p.boosters.length))}">🚀×${p.boosters.length}</span>`:''}</span>
    <span class="pie-ab">${p.t<PIE_TOWER_MAX?pieBtn(tr('pie.add_tower',{price:fmt$(piePrice(PIE_TOWER))}),'pieTower',{city:p.city},'ghost sm',piePrice(PIE_TOWER)):''}${piePadCloseBtn(P,p)}</span></div>${UI.piePadAsk===p.city?piePadConfirm(p):''}`;}
// Close a pad: the first tap asks (with what comes back), the second closes it. Not while launches wait on it.
function piePadCloseBtn(P,p){const n=P.q.filter(L=>L.pad===p.city).length;if(n)return btn(tr('pie.pad_close'),'piePadClose',{city:p.city},'ghost sm',true,trn('pie.pad_close_n',n));
  return btn(tr('pie.pad_close'),'piePadClose',{city:p.city},'ghost sm',UI.piePadAsk===p.city);}
// The confirm takes a full line under the pad, so it fits however narrow the column is.
const piePadConfirm=p=>`<div class="pie-confirm"><span>${tr('pie.pad_close_q2',{city:esc(CITY[p.city].name),amt:fmt$(piePadSalvage(p))})}</span><div class="btns">${btn(tr('pie.pad_close_yes'),'piePadClose',{city:p.city,ok:true},'red sm')}${btn(tr('common.cancel'),'piePadKeep',{},'ghost sm')}</div></div>`;
function pieCoHtml(P){let h=`<div class="dgrid">${pieTile(tr('pie.running_costs'),tr('common.price_mo',{price:fmt$(pieMo())}))}${pieTile(tr('pie.spent'),fmt$(P.book.spent))}${pieTile(tr('pie.earned'),fmt$(P.book.earned))}${pieSand()?pieTile(tr('pie.would_have'),fmt$(P.book.wouldHave)):''}</div>`;
  if(R&&R.pie)h+=`<p class="meta">${tr('pie.earned_mo',{amt:fmt$(R.pie.rev),n:R.pie.isl.length})}</p>`;
  h+=`<div class="ops-o"><div class="nm">🏷️ ${tr('pie.name')}</div><div class="btns">${btn(tr('pie.next_name'),'pieName',{},'ghost sm')}</div>
    <div class="network-name" style="margin-top:6px"><input class="t" id="pieNm" maxlength="40" value="${esc(pieCoName())}" autocomplete="off" aria-label="${esc(tr('pie.name'))}"></div><div class="btns">${btn(tr('slots.rename'),'pieRename',{},'ghost sm')}</div></div>`;
  h+=`<div class="btns">${btn(P.safe?tr('pie.safe_on'):tr('pie.safe_off'),'pieSafe',{},P.safe?'red sm':'ghost sm')}</div><p class="meta">${tr('pie.safe_note')}</p>`;
  return h+pieFeedHtml(P.founder);}
// The Founder's posts are flavour: the newest few at the bottom of the Company tab, the older ones folded away.
function pieFeedHtml(F){const post=p=>`<div class="ops-rep"><div class="eyebrow">${esc(dateStr(p.d))}</div><div>${esc(pieFpText(p))}</div></div>`,top=F.posts.slice(0,PIE_FEED_TOP),more=F.posts.slice(PIE_FEED_TOP);
  return `<div class="pie-feed"><h3>${tr('pie.founder_feed')}</h3><div class="kv"><span>${tr('pie.promises')}</span><b>${tr('pie.promises_line',{n:F.promises,b:F.broken})}</b></div>`+pieJitHtml(F)
    +(top.length?top.map(post).join(''):`<p class="meta">${tr('pie.feed_empty')}</p>`)
    +(more.length?`<details><summary>${trn('pie.feed_older',more.length)}</summary>${more.map(post).join('')}</details>`:'')+'</div>';}
