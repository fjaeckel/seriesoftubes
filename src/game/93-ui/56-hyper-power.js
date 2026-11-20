/* ---------- The Hyperscaler's power in the interface (38-hyper-power.js) ----------
   Parts of the charter card (55-hyper-panel.js puts them together): a line of what your regions draw against what their
   metros can give and the bill; alerts for a grid cut, a protest, a heatwave or a price spike; in its details the
   tightest metro and the utility letters due. And the power section of the city panel's Cloud tab: the grid, the town,
   you, the utility queue, goodwill, a protest with its answers, and your own generation. */
const hsPwRow=(...b)=>hsBtns(...b);
// The card: a line of what your regions draw against what their metros can give, and the bill.
function hsPwStat(){const H=S.hs;if(!H||!H.pw)return '';const cs=Object.keys(H.rg).sort();if(!cs.length)return '';
  let used=0,max=0,bill=0;for(const c of cs){used+=hsMwUsed(c);max+=hsSupply(c)-hsTown(c);bill+=hsPwBill(c);}
  return `<div class="meta">⚡ ${tr('hyper_power.card_line',{used:Math.round(used),max:Math.round(max),bill:fmt$(bill)})}</div>`;}
// What needs you: a grid that cannot feed a region (1), a protest (1), a heatwave or a price spike (2).
function hsPwAlerts(){const H=S.hs,out=[];if(!H||!H.pw)return out;
  for(const c of Object.keys(H.rg).sort()){const f=hsCut(c);if(f<1)out.push({lv:1,h:`⚡ ${tr('hyper_power.card_cut',{city:esc(CITY[c].name),p:pct(f)})}`});}
  for(const c of Object.keys(H.prot).sort()){const p=hsProt(c);if(p)out.push({lv:1,h:`📣 ${tr('hyper_power.card_prot',{grp:tr(HS_GRP[p.g]),city:esc(CITY[c].name)})} ${btn(tr('hyper_power.answer'),'popGo',{city:c},'sm')}`});}
  for(const e of H.pev)if(e.until>S.day)out.push({lv:2,h:e.k==='heat'?'🔥 '+tr('hyper_power.card_heat',{reg:WAVE_NAME[e.reg],date:dateStr(e.until)}):'💸 '+tr('hyper_power.card_crunch',{reg:WAVE_NAME[e.reg],date:dateStr(e.until)})});
  return out;}
// The card's details: the tightest metro, and letters due from the utilities.
function hsPwMore(){const H=S.hs;if(!H||!H.pw)return '';let h='';const cs=Object.keys(H.rg).sort();
  const tight=cs.filter(c=>hsMwFree(c)<HS_T[1].mw).sort((a,b)=>hsMwFree(a)-hsMwFree(b))[0];
  if(tight&&hsCut(tight)>=1)h+=`<div class="meta">${tr('hyper_power.card_tight',{city:esc(CITY[tight].name),mw:Math.max(0,Math.floor(hsMwFree(tight)))})}</div>`;
  for(const c of Object.keys(H.pw).sort()){const q=H.pw[c].q;if(q)h+=`<div class="meta">⏳ ${tr('hyper_power.card_queue',{util:tr(hsUtil(c)),mw:q.mw,city:esc(CITY[c].name),date:dateStr(q.ready)})}</div>`;}
  return h;}
// The Cloud tab's power section: a summary (free megawatts, goodwill) and flags for a protest, a cut or an event.
function hsPwSpec(c){const H=S.hs;if(!H||!hsSite(c))return null;const P=hsPw(c),d=H.rg[c],fl=[];
  if(hsProt(c))fl.push(hsFlag('restrictive',tr('hyper_ui.f_protest')));if(d&&hsCut(c)<1)fl.push(hsFlag('restrictive',tr('hyper_ui.f_cut')));
  if(hsEv(c).length)fl.push(hsFlag('selective',tr('hyper_ui.f_event')));
  return {t:'⚡ '+tr('hyper_power.power'),sum:tr('hyper_ui.sum_power',{mw:Math.max(0,Math.floor(hsMwFree(c))),gw:P.gw}),flags:fl,body:()=>hsPwBody(c)};}
const hsPwSection=c=>hsSec('pw',hsPwSpec(c));
function hsPwBody(c){const H=S.hs;const P=hsPw(c),d=H.rg[c],sup=hsSupply(c),town=hsTown(c),used=hsMwUsed(c),res=hsMwRes(c),free=hsMwFree(c),gen=hsGenMw(c);
  let h=hsKv(tr('hyper_power.grid_of',{util:tr(hsUtil(c))}),gen?tr('hyper_power.mw_plus_own',{mw:P.cap,own:gen}):tr('hyper_power.n_mw',{mw:P.cap}))
   +hsKv(tr('hyper_power.town_draws'),tr('hyper_power.n_mw',{mw:town}))
   +hsKv(tr('hyper_power.you_draw'),res>used+0.05?tr('hyper_power.mw_holding',{mw:+used.toFixed(1),res:+res.toFixed(1)}):tr('hyper_power.n_mw',{mw:+used.toFixed(1)}))
   +hsKv(tr('hyper_power.free'),tr('hyper_power.n_mw',{mw:Math.floor(free)}),free<0?'color:var(--bad)':'')+hsBar((town+Math.max(used,res))/(sup||1),free<HS_MW_SLOT);
  h+=hsKv(tr('hyper_power.price'),tr('hyper_power.price_mw_mo',{price:fmt$(hsPwPrice(c))}))+(d?hsKv(tr('hyper_power.bill'),tr('common.price_mo',{price:fmt$(hsPwBill(c))})):'');
  h+=hsColoPwLine(c);
  for(const e of hsEv(c))h+=`<p class="why">${e.k==='heat'?'🔥 '+tr('hyper_power.ev_heat_here',{date:dateStr(e.until)}):'💸 '+tr('hyper_power.ev_crunch_here',{date:dateStr(e.until)})}</p>`;
  {const f=hsCut(c);if(d&&f<1)h+=`<p class="why">${tr('hyper_power.cut_here',{p:pct(f)})}</p>`;}
  if(!d)h+=`<p class="note">${tr('hyper_power.region_needs',{mw:HS_T[1].mw,free:Math.max(0,Math.floor(free))})}</p>`;
  else{const N=hsTNext(d);if(N&&!d.up&&d.ready<=S.day){const need=N.mw-HS_T[d.t].mw;h+=`<p class="${need>free?'why':'note'}">${tr('hyper_power.next_needs',{name:tr(N.n),mw:need,free:Math.max(0,Math.floor(free))})}</p>`;}}
  // The utility queue.
  h+=P.q?`<p class="meta">⏳ ${tr('hyper_power.queue_pending',{util:tr(hsUtil(c)),mw:P.q.mw,date:dateStr(P.q.ready)})}</p>`
   :`<p class="note">${tr('hyper_power.queue_terms',{util:tr(hsUtil(c))})}</p>${hsPwRow(btn(tr('hyper_power.ask_util',{mw:HS_Q_MW,cost:fmt$(HS_Q_FEE)}),'hsUtil',{city:c},'sm',S.cash<HS_Q_FEE))}`;
  // Goodwill and a protest.
  const p=hsProt(c);h+=hsKv(tr('hyper_power.goodwill'),`${P.gw}/100`)+hsBar(P.gw/100,P.gw<40);
  if(p){const v={grp:tr(HS_GRP[p.g]),date:dateStr(p.until)};h+=`<p class="why">📣 ${p.kind==='block'?tr('hyper_power.prot_is_block',v):p.kind==='cost'?tr('hyper_power.prot_is_cost',v):tr('hyper_power.prot_is_delay',v)}<br><i>${tr(HS_GRP_SAY[p.g])}</i></p>`;
    h+=`<p class="note">${tr('hyper_power.prot_how',{gw:HS_GW_WIN,date:dateStr(p.until)})}</p>`;}
  h+=hsPwRow(btn(tr('hyper_power.fund_cost',{cost:fmt$(HS_FUND),gw:HS_FUND_GW}),'hsFund',{city:c},'sm',P.gw>=100||S.cash<HS_FUND),
    P.heat?'':btn(tr('hyper_power.heat_cost',{cost:fmt$(HS_HEAT),gw:HS_HEAT_GW}),'hsHeat',{city:c},'sm',!hsLive(c)||S.cash<HS_HEAT));
  if(P.heat)h+=`<p class="meta">♨️ ${P.heat<0?tr('hyper_power.heat_on_pays',{mo:fmt$(-P.heat)}):tr('hyper_power.heat_on_costs',{mo:fmt$(P.heat)})}</p>`;
  if(p&&hsProtHeld(c))h+=hsPwRow(p.on==='rg'?btn(tr('hyper_power.smaller'),'hsShrink',{city:c},'sm'):'',btn(tr('hyper_power.another_metro'),'hsMove',{city:c},'sm'));
  // Own generation, next to a region.
  if(d){const L=P.own.map(x=>`<div class="meta">${x.ready<=S.day?'✅ '+tr('hyper_power.gen_runs',{name:tr(HS_GEN[x.k].n),mw:HS_GEN[x.k].mw}):'🏗️ '+tr('hyper_power.gen_building',{name:tr(HS_GEN[x.k].n),date:dateStr(x.ready)})}</div>`).join('');
    const b=k=>{const G=HS_GEN[k];if(P.own.filter(x=>x.k===k).length>=G.max)return '';
      return btn(G.lv>lvl()?tr('hyper_power.gen_needs_level',{name:tr(G.n),lv:G.lv}):tr('hyper_power.gen_buy',{name:tr(G.n),mw:G.mw,cost:fmt$(G.cost)}),'hsGen',{city:c,k},'sm',G.lv>lvl()||S.cash<G.cost);};
    h+=`<h3 class="sub4">${tr('hyper_power.own_gen')}</h3>${L||`<p class="note">${tr('hyper_power.own_gen_lead')}</p>`}${hsPwRow(b('sol'),b('sub'))}${hsPwRow(b('smr'))}`;}
  return h;}
