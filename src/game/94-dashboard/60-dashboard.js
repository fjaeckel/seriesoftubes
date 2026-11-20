function dashTabs(){hsDtabSync();const u=custStats().unhappy,dd=ddosLive().length,cur=UI.dtab||'overview',L={overview:tr('common.overview'),cust:tr('common.customers'),conn:tr('common.connections'),traffic:tr('common.traffic'),ddos:tr('ddos_dash.tab'),links:tr('common.links'),routers:tr('common.routers'),pops:tr('unbuilt_pops.no_pop_yet'),lease:tr('common.leased_lines'),market:tr('market.tab'),cloud:tr('hyper_noc.tab')};
  return `<nav class="dtabs" role="tablist">${DTABS.filter(k=>k!=='market'||!hyper()).map(k=>`<button class="${cur===k?'on':''}" role="tab" aria-selected="${cur===k}" data-act="dashTab" data-args='{"k":"${k}"}'>${L[k]}${k==='cust'&&u?`<span class="cnt red">${u}</span>`:''}${k==='ddos'&&dd?`<span class="cnt red">${dd}</span>`:''}</button>`).join('')}</nav>`;}
function renderDash(){checkLayer();
  const H=S.hist||[],rows=H.slice(-90),last30=H.slice(-30);
  const up=last30.length?last30.reduce((a,r)=>a+(r.dem?Math.min(1,r.srv/r.dem):1),0)/last30.length:1;
  const net=R.revMo-R.costMo,tot=Object.values(R.egT).reduce((a,b)=>a+b,0)||1;
  const tile=(l,v,sub)=>`<div class="tile"><div class="lbl">${l}</div><div class="val">${v}</div>${sub?`<div class="sub">${sub}</div>`:''}</div>`;
  // The title scrolls away; the tabs and the close button stay pinned (.dhead), so a long list never has to be scrolled back up.
  let h=`<div class="dtitle"><div class="eyebrow">AS${S.asn} · ${esc(S.name)} · ${tierLabel()}</div><h2>${tr('common.noc_dashboard')}</h2></div><div class="dhead">${dashTabs()}<button class="x" data-act="dashClose" aria-label="${tr('common.close')}">×</button></div>`;const DT=UI.dtab||'overview';if(DT==='overview')h+=`
  <div class="dgrid">${tile(tr('common.traffic_now'),fmtG(R.served),tr('dashboard.of_g_wanted',{g:fmtG(R.demand)}))}${tile(tr('common.peak'),fmtG(S.stats.peak))}${tile(tr('dashboard.carried'),fmtVol(S.vol||0),tr('dashboard.carried_sub'))}${tile(tr('dashboard.delivered_30_days'),(up*100).toFixed(1)+'%',up>=0.999?tr('dashboard.five_nines_ish'):up>=0.99?tr('dashboard.two_nines_and_change'):tr('dashboard.customers_are_upset'))}${tile(tr('common.peering_ratio'),pct(R.peerShare||0),tr('dashboard.caches_pnis_and_ix'))}${tile(tr('dashboard.monthly_p_l'),`<span style="color:${net>=0?'var(--eye)':'var(--bad)'}">${net>=0?'+':''}${fmt$(net)}</span>`,tr('dashboard.in_in_out_out',{in:fmt$(R.revMo),out:fmt$(R.costMo)}))}${tile(tr('common.incidents'),S.stats.incidents,tr('dashboard.n_shrugged_off',{n:S.stats.survived}))}</div>
  <div class="dcols"><div class="panel2"><h3>${tr('dashboard.traffic_by_way_out')}</h3>${svgChart(rows,['c','p','ix','t','l2'],[{k:'dem',col:'#1E2640',dash:true}],v=>fmtCap(Math.round(v)),'traffic')}${chartLegend('traffic',k=>k==='dem'?'':' '+pct((R.egT[k]||0)/tot))}</div>
  <div class="panel2"><h3>${tr('dashboard.money_per_month')}</h3>${svgChart(rows,[],[{k:'rev',col:'#16A866'},{k:'cost',col:'#FF4D5E'}],v=>fmt$(v),'money')}${chartLegend('money')}
  <h3 style="margin-top:8px">${tr('dashboard.where_the_money_goes')}</h3>${Object.entries(R.cost).filter(([k,v])=>v>0).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="kv"><span>${{pops:tr('dashboard.pops_and_routers'),links:tr('dashboard.waves_and_fiber'),transit:tr('common.transit'),ix:tr('common.ix_ports'),pni:tr('common.pnis'),caches:tr('common.cache_power'),nni:tr('common.fabric_ports'),optical:tr('dashboard.amp_huts_and_spares'),loans:tr('common.loan_repayments'),revshare:tr('dashboard.investor_revenue_share'),extras:tr('dashboard.licenses_and_scrubbing'),wholesale:tr('dashboard.nearly_broadband_network_wholesale'),levy:tr('dashboard.regional_broadband_levy'),pie:tr('pie.costs_row'),cloud:tr('hyper.cost_row'),fed:tr('fedplay.cost_row')}[k]||k}</span><b>${tr('common.price_mo',{price:fmt$(v)})}</b></div>`).join('')}</div></div>`;
  if(DT==='overview'&&S.fed)h+=fedPlayDash();
  const tT=(R.egT.t||0)||1;
  const offMix=(UI.chartOff&&UI.chartOff.mix)||{},filt=Object.keys(offMix).length>0;
  // The legend above the table picks which ways in count; "lost" still looks at everything the network gets.
  const row=(n,e0,want)=>{const e={};for(const k of ['c','p','ix','t'])e[k]=offMix[k]?0:e0[k];const t=e.c+e.p+e.ix+e.t,all=e0.c+e0.p+e0.ix+e0.t;return {n,e,t,want,cost:(R.cost.transit||0)*e.t/tT,lost:want>0.01?Math.max(0,1-all/want):0};};
  const nets=NETS.filter(n=>!n.tail).map(n=>row(n,R.netEg[n.id]||{c:0,p:0,ix:0,t:0},R.demTo[n.id]||0));
  {const e={c:0,p:0,ix:0,t:0};let w=0;for(const n of NETS)if(n.tail){const x=R.netEg[n.id];if(x)for(const k in e)e[k]+=x[k]||0;w+=R.demTo[n.id]||0;}nets.push(row({id:'_tail',name:tr('dashboard.the_long_tail_n_small_networks',{n:NETS.filter(n=>n.tail).length}),asn:'many',type:'eye',col:'#8A93B8'},e,w));}
  for(let i=nets.length-1;i>=0;i--)if(!(nets[i].t>0.01||(!filt&&nets[i].want>0.01)))nets.splice(i,1);
  {const k=UI.dashSort||'traffic',dir=UI.dashDir||-1,val=x=>k==='name'?x.n.name.toLowerCase():k==='asn'?x.n.asn:k==='type'?x.n.type:k==='cost'?x.cost:k==='lost'?x.lost:x.t;nets.sort((a,b)=>{const A=val(a),B=val(b);return (A<B?-1:A>B?1:0)*dir||b.t-a.t;});}
  if(DT==='cust')h+=custSection()+clPanel();
  if(DT==='conn')h+=connSection();
  if(DT==='traffic')h+=`<div class="btns">${btn(tr('ops.standing_orders'),'opsOpen',{},'sm')}</div>`;
  if(DT==='traffic')h+=trafficTab(nets,tT);
  if(DT==='traffic'){const top=transitTop(S.transit.map(t=>t.id),8);if(top.length)h+=`<div class="panel2" style="margin-top:12px"><h3>${tr('dashboard.who_your_transit_carries')}</h3><p class="note" style="margin-top:0">${tr('dashboard.the_networks_you_pay_transit_to')}</p>${top.map(([id,v])=>`<div class="row">${logo(NET[id])}<div class="grow"><div class="nm">${esc(NET[id].name)} <span class="meta">AS${NET[id].asn} · ${fmtG(v)} · ${tr('dashboard.about_price_mo',{price:fmt$((R.cost.transit||0)*v/tT)})}</span></div><div class="meta">${esc(offTransitHint(id))}</div></div>${btn(tr('common.where_6276'),'netFocus',{id},'ghost sm')}</div>`).join('')}</div>`;}
  if(DT==='ddos')h+=ddosTab();
  if(DT==='links')h+=`<div style="margin-top:12px">${linksTab()}</div>`;
  if(DT==='routers')h+=routersTab();
  if(DT==='pops')h+=popsSection();
  if(DT==='lease')h+=leaseTab();
  if(DT==='market')h+=marketTab();
  if(DT==='cloud')h+=hsNocTab();
  if(h!==UI._dh){UI._dh=h;morph($('dashCard'),h);if(DT==='links'||DT==='routers')fitList();}
  // Where the tabs are one scrolling line (a phone on its side), a newly opened tab is brought into view; once per switch.
  if(UI._dt!==DT){UI._dt=DT;const nav=$('dashCard').querySelector('.dhead .dtabs'),on=nav&&nav.querySelector('.on');if(on&&nav.scrollWidth>nav.clientWidth)nav.scrollLeft=on.offsetLeft-nav.offsetLeft-24;}
}
