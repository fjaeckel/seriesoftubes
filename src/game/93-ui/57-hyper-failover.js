/* ---------- The Hyperscaler's failures, the law and the win in the interface ----------
   On the charter card: regions that are down and where their users went, a drill under way, the next pair to drill,
   countries held by residency, and Cloud Nine's four conditions. In the Cloud tab of a region's city: failover to its
   replica (room, backbone, the law), its drills and the drill button; in any city of a country with a residency law,
   what the law asks and why growth waits. */
const hsOkTxt=(ok,txt)=>`${ok?'✅':'▫️'} ${txt}`;
function hsFailCard(){const H=S.hs;if(!H||!H.down)return '';let h='';
  for(const c of Object.keys(H.rg).filter(c=>hsOut(c)&&!(H.dx&&H.dx.c===c)).sort()){const b=R.hs&&R.hs.fo&&R.hs.fo[c],v={city:esc(CITY[c].name),b:b?esc(CITY[b].name):'',date:dateStr(H.down[c]||S.day+1)};
    h+=`<div class="meta" style="color:var(--bad)">🔥 ${b?tr('hyper_fail.card_down',v):tr('hyper_fail.card_down_alone',v)}</div>`;}
  if(H.dx)h+=`<div class="meta">🧯 ${tr('hyper_fail.card_drill',{a:esc(CITY[H.dx.c].name),b:esc(CITY[H.dx.b].name),date:dateStr(H.dx.d)})}</div>`;
  else{const k=hsPairsUndrilled()[0];if(k){const [a,b]=k.split('|'),c=hsRepOf(a)===b?a:b,w=hsDrillWhy(c);
    h+=`<div class="meta">🧯 ${tr('hyper_fail.card_undrilled',{a:esc(CITY[c].name),b:esc(CITY[hsRepOf(c)||b].name)})}${hsLive(c)?' · '+(hsFailReady(c)?tr('hyper_fail.ready'):tr('hyper_fail.not_ready')):''}</div><div class="btns">${btn(tr('hyper_fail.drill_cost',{cost:fmt$(HS_DRILL)}),'hsDrill',{city:c},'sm',!!w||S.cash<HS_DRILL)}${btn(tr('common.open'),'popGo',{city:c},'ghost sm')}</div>`;}}
  const held=Object.keys(H.cc).filter(k=>!hsResMet(k)).sort();
  if(held.length)h+=`<div class="meta" style="color:var(--bad)">🔒 ${tr('hyper_law.card_held',{list:held.slice(0,4).map(k=>esc(ccName(k))).join(', ')})}</div>`;
  return h;}
function hsC9Card(){const H=S.hs;if(!H)return '';
  if(H.won)return `<div class="meta"><b>☁️ ${tr('hyper_win.won_on',{date:dateStr(H.won)})}</b></div>`;
  const x=hsC9();return `<div class="meta"><b>☁️ ${tr('hyper_win.cloud_nine')}</b></div>`
   +`<div class="meta">${hsOkTxt(x.ct>=HS_C9_CT,tr('hyper_win.c9_cont',{n:Math.min(x.ct,HS_C9_CT),max:HS_C9_CT}))}</div>`
   +`<div class="meta">${hsOkTxt(x.ps>0&&x.dr===x.ps,tr('hyper_win.c9_drills',{n:x.dr,max:x.ps}))}</div>`
   +`<div class="meta">${hsOkTxt(x.cab,tr('hyper_win.c9_cable'))}</div>`
   +`<div class="meta">${hsOkTxt(x.btw>=HS_C9_BTW-LV_EPS,tr('hyper_win.c9_btw',{g:fmtG(x.btw),max:fmtG(HS_C9_BTW)}))}</div>`+hsBar(x.btw/HS_C9_BTW);}
// The region here: is it up, where its users would go, and the drill.
function hsFailSection(c){const H=S.hs;if(!H||!H.down||!H.rg[c]||H.rg[c].ready>S.day)return '';let h=`<section><h3>🧯 ${tr('hyper_fail.failover_title')}</h3>`;
  const drain=H.dx&&H.dx.c===c,b=hsRepOf(c),v={city:esc(CITY[c].name),b:b?esc(CITY[b].name):'',date:dateStr(H.down[c]||S.day+1)};
  if(drain)h+=`<p class="meta">🧯 ${tr('hyper_fail.drained_here',{b:esc(CITY[H.dx.b].name),date:dateStr(H.dx.d)})}</p>`;
  else if(hsOut(c))h+=`<p class="why">🔥 ${b?tr('hyper_fail.card_down',v):tr('hyper_fail.card_down_alone',v)}</p>`;
  if(!b)return h+`<p class="note">${tr('hyper_fail.need_replica')}</p></section>`;
  if(hsLive(c)){const I=hsFailInfo(c,b);h+=`<p class="lead">${tr('hyper_fail.lead',{b:esc(CITY[b].name)})}</p>`
    +hsKv(tr('hyper_fail.need'),fmtG(I.need))+hsKv(tr('hyper_fail.room_there',{city:esc(CITY[b].name)}),fmtG(I.room),I.room<I.need-0.5?'color:var(--bad)':'')+hsKv(tr('hyper_fail.backbone'),fmtG(I.bw),I.bw<I.need-0.5?'color:var(--bad)':'');
    if(I.law.length)h+=`<p class="why">🔒 ${tr('hyper_fail.law_blocks',{list:esc(I.law.slice(0,4).join(', ')),b:esc(CITY[b].name)})}</p>`;
    h+=`<p class="meta">${I.ok?'✅ '+tr('hyper_fail.ready'):'⚠️ '+tr('hyper_fail.not_ready')}</p>`;}
  const lag=hsLagAt(c);h+=hsKv(tr('hyper_fail.at_risk'),tr('hyper_fail.tb_of',{tb:hsTb(lag),n:HS_RISK}),lag>HS_RISK?'color:var(--bad)':'');
  const dd=H.drill[hsPk(c,b)];h+=`<p class="meta">${dd?tr('hyper_fail.drilled_on',{date:dateStr(dd)}):tr('hyper_fail.never_drilled')}</p>`;
  const w=hsDrillWhy(c);h+=`<p class="note">${tr('hyper_fail.drill_terms',{b:esc(CITY[b].name),p:pct(HS_DRILL_Q),n:HS_RISK})}</p><div class="btns">${btn(tr('hyper_fail.drill_cost',{cost:fmt$(HS_DRILL)}),'hsDrill',{city:c},'pink sm',!!w||S.cash<HS_DRILL)}</div>`;
  if(w&&!drain)h+=`<p class="why">${w}</p>`;
  return h+`</section>`;}
// The country's residency law, and why its users wait.
function hsLawSection(c){const H=S.hs,cc=CITY[c].cc;if(!H||!hsResOf(cc))return '';const why=H.cc[cc]?hsResWhy(cc):'';
  return `<section><h3>🔒 ${tr('hyper_law.residency')}</h3><p class="meta">${hsResLine(cc)}</p>${why?`<p class="why">${why}</p>`:H.cc[cc]?`<p class="meta">✅ ${tr('hyper_law.met')}</p>`:''}</section>`;}
CX_CARD.push(()=>hyper()?hsFailCard()+hsC9Card():'');
CX_CITY.push(c=>hyper()?hsLawSection(c)+hsFailSection(c):'');
