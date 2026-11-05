/* ---------- cities with no POP of yours yet ---------- */
function popsSection(){const F=UI.popF||{},q=popStdQuote(),cost=c=>popCost(c)+(q?q.cost:0),mo=c=>popMo(c)+(q?q.mo:0);
  const all=CITIES.filter(C=>cityOn(C.id)&&!S.pops[C.id]);
  let h=`<div class="panel2" id="popsSec" style="margin-top:12px"><h3>${tr('unbuilt_pops.cities_without_a_pop_n',{n:all.length})}</h3>`;
  if(!all.length)return h+`<p class="empty">${tr('unbuilt_pops.you_have_a_pop_in_every')}</p></div>`;
  h+=`<p class="note" style="margin-top:0">${tr('unbuilt_pops.every_city_where_you_could_still')}</p>`;
  const sk=UI.popSort||'eye',dir=UI.popDir||-1,val=C=>sk==='name'?C.name.toLowerCase():sk==='cost'?cost(C.id):eyeP(C.id);
  h+=`<div class="trsel" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px"><label>${tr('unbuilt_pops.region')} <select data-chg="popsReg"><option value="">${tr('unbuilt_pops.all_regions')}</option>${Object.keys(REG).map(r=>`<option value="${r}"${F.reg===r?' selected':''}>${esc(REG[r])}</option>`).join('')}</select></label></div>`;
  h+=`<div class="seg" style="margin-bottom:4px">${[['eye',tr('common.eyeballs')],['cost',tr('common.cost')],['name',tr('common.name')]].map(([k,l])=>btn(l+(sk===k?(dir>0?' ▲':' ▼'):''),'popsSort',{k},sk===k?'pink sm':'ghost sm')).join('')}</div>`;
  const rows=all.filter(C=>!F.reg||C.reg===F.reg).sort((a,b)=>{const A=val(a),B=val(b);return (A<B?-1:A>B?1:0)*dir||a.name.localeCompare(b.name);});
  if(!rows.length)return h+`<p class="empty">${tr('unbuilt_pops.nothing_left_to_build_in_this')}</p></div>`;
  h+=rows.slice(0,listN('pops')).map(C=>{const ix=ixName(C.id);return `<div class="row"><div class="grow"><div class="nm">${esc(C.name)} <span class="meta">${esc(REG[C.reg])}</span></div><div class="meta">${tr('city_panel.g_of_eyeballs',{g:fmtG(eyeP(C.id))})}${ix?` · ${tr('city_panel.ix_ix',{ix:esc(ix)})}`:''} · ${tr('unbuilt_pops.cost_then_mo',{cost:fmt$(cost(C.id)),mo:fmt$(mo(C.id))})}</div>${C.cn&&!cnOk()?`<div class="why">${tr('unbuilt_pops.needs_a_license_first')}</div>`:''}</div>${btn(tr('common.open'),'popGo',{city:C.id},'ghost sm')}</div>`;}).join('');
  return h+listMore('pops',rows.length,n=>trn('unbuilt_pops.n_more_city',n))+`</div>`;}
