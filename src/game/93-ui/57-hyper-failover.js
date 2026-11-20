/* ---------- The Hyperscaler's failures, the law and the win in the interface ----------
   Parts of the charter card (55-hyper-panel.js): alerts for regions that are down (and where their users went) and for
   countries held by residency; a line for a drill under way or the next pair to drill, with its button; Cloud Nine's
   four conditions. In the Cloud tab of a region's city: failover to its replica (room, backbone, the law), its drills and
   the drill button; in any city of a country with a residency law, what the law asks and why growth waits (with the
   country's users). */
const hsOkTxt=(ok,txt)=>`${ok?'✅':'▫️'} ${txt}`;
function hsFailAlerts(){const H=S.hs,out=[];if(!H||!H.down)return out;
  for(const c of Object.keys(H.rg).filter(c=>hsOut(c)&&!(H.dx&&H.dx.c===c)).sort()){const b=R.hs&&R.hs.fo&&R.hs.fo[c],v={city:esc(CITY[c].name),b:b?esc(CITY[b].name):'',date:dateStr(H.down[c]||S.day+1)};
    out.push({lv:0,h:`🔥 ${b?tr('hyper_fail.card_down',v):tr('hyper_fail.card_down_alone',v)}`});}
  // A grid trip announced for tomorrow (38-hyper-director.js), with its answer.
  const w=H.dir&&H.dir.w;if(w&&!w.ok&&H.rg[w.c]){const k=hsChillCost(w.c);out.push({lv:0,h:`⚡ ${tr('hyper_dir.card_trip',{city:esc(CITY[w.c].name)})}<div class="btns">${btn(w.k==='heat'?tr('hyper_dir.chill_btn',{cost:fmt$(k)}):tr('hyper_dir.gen_btn',{cost:fmt$(k)}),'hsPrecool',{city:w.c},'red sm',S.cash<k)}</div>`});}
  const held=Object.keys(H.cc).filter(k=>!hsResMet(k)).sort();
  if(held.length)out.push({lv:2,h:`🔒 ${tr('hyper_law.card_held',{list:held.slice(0,4).map(k=>esc(ccName(k))).join(', ')})}`});
  return out;}
// A drill under way, or the next pair to drill with its button and whether it would pass today.
function hsDrillStat(){const H=S.hs;if(!H||!H.down)return '';
  if(H.dx)return `<div class="meta">🧯 ${tr('hyper_fail.card_drill',{a:esc(CITY[H.dx.c].name),b:esc(CITY[H.dx.b].name),date:dateStr(H.dx.d)})}</div>`;
  const k=hsPairsUndrilled()[0];if(!k)return '';const [a,b]=k.split('|'),c=hsRepOf(a)===b?a:b,w=hsDrillWhy(c);
  return `<div class="meta">🧯 ${tr('hyper_fail.card_undrilled',{a:esc(CITY[c].name),b:esc(CITY[hsRepOf(c)||b].name)})}${hsLive(c)?' · '+(hsFailReady(c)?tr('hyper_fail.ready'):tr('hyper_fail.not_ready')):''}</div>${hsBtns(btn(tr('hyper_fail.drill_cost',{cost:fmt$(HS_DRILL)}),'hsDrill',{city:c},'sm',!!w||S.cash<HS_DRILL),btn(tr('common.open'),'popGo',{city:c},'ghost sm'))}`;}
function hsC9Card(){const H=S.hs;if(!H)return '';
  if(H.won)return `<div class="meta"><b>☁️ ${tr('hyper_win.won_on',{date:dateStr(H.won)})}</b></div>`;
  // Four short conditions, two to a row where there is room (one under the other on a narrow phone).
  const x=hsC9(),c=(ok,t)=>`<div class="meta${ok?' ok':''}">${hsOkTxt(ok,t)}</div>`;return `<div class="hsc-c9"><div class="meta"><b>☁️ ${tr('hyper_win.cloud_nine')}</b></div><div class="hsc-c9g">`
   +c(x.ct>=HS_C9_CT,tr('hyper_win.c9_cont',{n:Math.min(x.ct,HS_C9_CT),max:HS_C9_CT}))
   +c(x.ps>0&&x.dr===x.ps,tr('hyper_win.c9_drills',{n:x.dr,max:x.ps}))
   +c(x.cab,tr('hyper_win.c9_cable'))
   +c(x.btw>=HS_C9_BTW-LV_EPS,tr('hyper_win.c9_btw',{g:fmtG(x.btw),max:fmtG(HS_C9_BTW)}))+`</div>`+hsBar(x.btw/HS_C9_BTW)+`</div>`;}
// The region here: is it up, where its users would go, and the drill.
function hsFailSpec(c){const H=S.hs;if(!H||!H.down||!H.rg[c]||H.rg[c].ready>S.day)return null;const b=hsRepOf(c),fl=[],drain=H.dx&&H.dx.c===c;let sum='';
  if(drain)fl.push(hsFlag('st on',tr('hyper_ui.f_drill')));else if(hsOut(c))fl.push(hsFlag('restrictive',tr('hyper_ui.f_down')));
  const I=b&&hsLive(c)&&R.hs?hsFailInfo(c,b):null;
  if(b){const ok=!!I&&I.ok;sum=tr('hyper_ui.sum_fail',{b:esc(CITY[b].name)});if(hsLive(c))fl.push(ok?hsFlag('open',tr('hyper_ui.f_ready')):hsFlag('restrictive',tr('hyper_ui.f_not_ready')));
    if(!H.drill[hsPk(c,b)])fl.push(hsFlag('selective',tr('hyper_ui.f_undrilled')));if(hsLagAt(c)>HS_RISK)fl.push(hsFlag('restrictive',tr('hyper_ui.f_backlog')));}
  // Ready and drilled is good news, not a reason to open: only a red or amber flag opens it.
  return {t:'🧯 '+tr('hyper_fail.failover_title'),sum,flags:fl,open:fl.some(f=>f[0]!=='open'),body:()=>hsFailBody(c,I)};}
const hsFailSection=c=>hsSec('fo',hsFailSpec(c));
function hsFailBody(c,I0){const H=S.hs;let h='';
  const drain=H.dx&&H.dx.c===c,b=hsRepOf(c),v={city:esc(CITY[c].name),b:b?esc(CITY[b].name):'',date:dateStr(H.down[c]||S.day+1)};
  if(drain)h+=`<p class="meta">🧯 ${tr('hyper_fail.drained_here',{b:esc(CITY[H.dx.b].name),date:dateStr(H.dx.d)})}</p>`;
  else if(hsOut(c))h+=`<p class="why">🔥 ${b?tr('hyper_fail.card_down',v):tr('hyper_fail.card_down_alone',v)}</p>`;
  if(!b)return h+`<p class="note">${tr('hyper_fail.need_replica')}</p>`;
  if(hsLive(c)){const I=I0||hsFailInfo(c,b);h+=`<p class="lead">${tr('hyper_fail.lead',{b:esc(CITY[b].name)})}</p>`
    +hsKv(tr('hyper_fail.need'),fmtG(I.need))+hsKv(tr('hyper_fail.room_there',{city:esc(CITY[b].name)}),fmtG(I.room),I.room<I.need-0.5?'color:var(--bad)':'')+hsKv(tr('hyper_fail.backbone'),fmtG(I.bw),I.bw<I.need-0.5?'color:var(--bad)':'');
    if(I.law.length)h+=`<p class="why">🔒 ${tr('hyper_fail.law_blocks',{list:esc(I.law.slice(0,4).join(', ')),b:esc(CITY[b].name)})}</p>`;
    h+=`<p class="meta">${I.ok?'✅ '+tr('hyper_fail.ready'):'⚠️ '+tr('hyper_fail.not_ready')}</p>`;}
  const lag=hsLagAt(c);h+=hsKv(tr('hyper_fail.at_risk'),tr('hyper_fail.tb_of',{tb:hsTb(lag),n:HS_RISK}),lag>HS_RISK?'color:var(--bad)':'');
  const dd=H.drill[hsPk(c,b)];h+=`<p class="meta">${dd?tr('hyper_fail.drilled_on',{date:dateStr(dd)}):tr('hyper_fail.never_drilled')}</p>`;
  const w=hsDrillWhy(c);h+=`<p class="note">${tr('hyper_fail.drill_terms',{b:esc(CITY[b].name),p:pct(HS_DRILL_Q),n:HS_RISK})}</p>${hsBtns(btn(tr('hyper_fail.drill_cost',{cost:fmt$(HS_DRILL)}),'hsDrill',{city:c},'pink sm',!!w||S.cash<HS_DRILL))}`;
  if(w&&!drain)h+=`<p class="why">${w}</p>`;
  return h;}
// The country's residency law, and why its users wait.
function hsLawBody(c){const H=S.hs,cc=CITY[c].cc;if(!H||!hsResOf(cc))return '';const why=H.cc[cc]?hsResWhy(cc):'';
  return `<h3 class="sub4">🔒 ${tr('hyper_law.residency')}</h3><p class="meta">${hsResLine(cc)}</p>${why?`<p class="why">${why}</p>`:H.cc[cc]?`<p class="meta">✅ ${tr('hyper_law.met')}</p>`:''}`;}
