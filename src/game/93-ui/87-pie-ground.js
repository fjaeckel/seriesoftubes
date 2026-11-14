/* ---------- Pie Control's Dishes tab: the ground segment by country ----------
   One row per country (region, then name), folded open with pieCc: its landing rights (years at a time), each POP's dish
   and antennas. Filters: UI.pieGf ('' all, 'dish', 'none' no dish yet, 'lic' rights missing or ending within a year),
   UI.pieGr a region, UI.pieGs the order (PIE_GSORT). Bulk buttons top up every dish and cover every country for 1, 5 or 10 years. */
const PIE_LIC_SOON=360;
// Orders for the countries: region then name, name, most antennas, busiest dishes (last compute), rights ending first, most POPs without a dish.
const PIE_GSORT=['reg','name','ant','load','lic','free'];
function pieGroundHtml(P,can){const f=UI.pieGf||'',rg=own(REG,UI.pieGr||'')?UI.pieGr:'',open=UI.pieCcs||new Set(),dp=pieDishPrice();
  const by={};for(const c of Object.keys(S.pops)){const cc=CITY[c].cc;(by[cc]||(by[cc]={cc,reg:CITY[c].reg,pops:[]})).pops.push(c);}
  const left=cc=>{const l=P.lic[cc];return pieLicOk(cc)?l.until-S.day:0;},dish=c=>P.dishes.find(x=>x.city===c);
  const keep=g=>(!rg||g.reg===rg)&&(f===''||(f==='dish'?g.pops.some(dish):f==='none'?g.pops.some(c=>!dish(c)):g.pops.some(dish)&&left(g.cc)<PIE_LIC_SOON));
  const so=PIE_GSORT.includes(UI.pieGs)?UI.pieGs:'reg',ld=R&&R.pie&&R.pie.load||{},nm=g=>pieLicCountry(g.cc),ri=g=>Object.keys(REG).indexOf(g.reg);
  const key={reg:()=>0,name:()=>0,ant:g=>-g.pops.reduce((a,c)=>a+(dish(c)?dish(c).ant:0),0),load:g=>-Math.max(0,...g.pops.filter(dish).map(c=>ld[c]||0)),
    lic:g=>g.pops.some(dish)?left(g.cc):1e9,free:g=>-g.pops.filter(c=>!dish(c)).length}[so];
  const gs=Object.values(by).filter(keep).map(g=>[g,key(g)]).sort((a,b)=>a[1]-b[1]||(so==='reg'?ri(a[0])-ri(b[0]):0)||nm(a[0]).localeCompare(nm(b[0]))).map(x=>x[0]);
  const nAnt=P.dishes.reduce((a,x)=>a+x.ant,0),soon=pieDishCc().filter(cc=>left(cc)<PIE_LIC_SOON).length;
  const dv=UI.pieDv==='load'?'load':'cc',seg=`<div class="segc pie-dv">${[['cc',tr('pie.dv_cc')],['load',tr('pie.dv_load')]].map(([k,l])=>`<button class="${dv===k?'on':''}" data-act="pieDv" data-args='{"v":"${k}"}' aria-pressed="${dv===k}">${l}</button>`).join('')}</div>`;
  if(dv==='load')return seg+pieLoadHtml(R&&R.pie);
  let h=seg+`<p class="meta">${tr('pie.dish_note')}</p>`;
  {const top=Math.max(...Object.keys(CRUSTS).map(pieCov));if(top<PIE_DISH_WAIT)h+=`<p class="note pie-wait">${tr('pie.dish_wait',{min:pct(PIE_RAW),p:pct(top),mo:fmt$(PIE_DISH_MO),lo:pct(PIE_PATCHY_LO)})}</p>`;}
  h+=`<p class="meta pie-gsum">${tr('pie.ground_sum',{d:P.dishes.length,max:PIE_DISH_MAX,a:nAnt})}${soon?' · <b>'+trn('pie.ground_soon',soon)+'</b>':''}</p>`;
  {const v=pieAntAllCost(),ys=PIE_LIC_YEARS.map(y=>[y,pieLicAllQuote(y)]);
    const bv=P.dishes.reduce((a,x)=>a+pieBandCost(x),0);
    h+=`<div class="ops-p">${(v?pieBtn(tr('pie.ant_all',{price:fmt$(v)}),'pieAntAll',{},'ghost sm',v):'')}${bv?pieBtn(tr('pie.band_all',{b:PIE_BAND_N[pieBandMax()],price:fmt$(bv)}),'pieBandAll',{},'ghost sm',bv):''}</div>`;
    h+=`<div class="pie-yrs"><span>${tr('pie.lic_all')}</span>${ys.map(([y,q])=>btn(`${trn('pie.n_years',y)} <small>${q.list.length?fmt$(q.cost):'✓'}</small>`,'pieLicAll',{y},'ghost sm',!q.list.length)).join('')}</div>`;}
  const o=(v,l,cur)=>`<option value="${v}"${v===cur?' selected':''}>${esc(l)}</option>`;
  h+=`<div class="trsel pie-gf"><label>${tr('pie.ground_show')}<select data-chg="pieGf">${o('',tr('dashboard.fs_all'),f)}${o('dish',tr('pie.gf_dish'),f)}${o('none',tr('pie.gf_none'),f)}${o('lic',tr('pie.gf_lic'),f)}</select></label>
    <label>${tr('unbuilt_pops.region')}<select data-chg="pieGr">${o('',tr('unbuilt_pops.all_regions'),rg)}${Object.keys(REG).map(r=>o(r,REG[r],rg)).join('')}</select></label>
    <label>${tr('pie.gs_sort')}<select data-chg="pieGs">${(L=>PIE_GSORT.map(k=>o(k,L[k],so)).join(''))({reg:tr('pie.gs_reg'),name:tr('pie.gs_name'),ant:tr('pie.gs_ant'),load:tr('pie.gs_load'),lic:tr('pie.gs_lic'),free:tr('pie.gs_free')})}</select></label></div>`;
  if(!gs.length)return h+`<p class="meta">${tr('pie.ground_none')}</p>`;
  h+=gs.map(g=>{const cc=g.cc,l=P.lic[cc],ok=pieLicOk(cc),free=pieFree(cc),ds=g.pops.filter(dish),a=ds.reduce((s,c)=>s+dish(c).ant,0),isO=open.has(cc);
    const st=ok?(left(cc)<PIE_LIC_SOON?`<span class="tag selective">${tr('pie.lic_until',{d:dateStr(l.until)})}</span>`:`<span class="tag open">${tr('pie.lic_until',{d:dateStr(l.until)})}</span>`)
      :!free?`<span class="tag restrictive">${tr('pie.lic_refused')}</span>`:ds.length?`<span class="tag restrictive">${tr('pie.no_rights')}</span>`:'';
    let x=`<button class="pie-cc${isO?' on':''}" data-act="pieCc" data-args='{"cc":"${cc}"}' aria-expanded="${isO}"><span class="grow"><b>${esc(pieLicCountry(cc))}</b> <small>${tr('pie.cc_line',{d:ds.length,p:g.pops.length,a})}</small></span>${st}<span aria-hidden="true">${isO?'▾':'▸'}</span></button>`;
    if(!isO)return x;
    x+=`<div class="pie-ccb">`;
    if(free)x+=`<div class="pie-yrs"><span>${tr('pie.landing_rights')} · ${fmt$(pieLicPrice(cc))}/${tr('pie.yr')}</span>${PIE_LIC_YEARS.map(y=>{const n=pieLicYears(cc,y);return btn(`${trn('pie.n_years',y)} <small>${n?fmt$(n*pieLicPrice(cc)):'✓'}</small>`,'pieLic',{cc,y},'ghost sm',!n);}).join('')}</div>`;
    else x+=`<p class="why">${tr('pie.why_lic_refused')}</p>`;
    x+=g.pops.sort((p,q)=>CITY[p].name.localeCompare(CITY[q].name)).map(c=>{const d=dish(c);
      if(!d)return `<div class="kv${UI.pieFocus===c?' pie-focus':''}" data-dish="${c}"><span>${btn('📍','pieLook',{city:c},'ghost sm pie-loc',false,tr('pie_traffic.a_look'))} ${esc(CITY[c].name)} <i class="pie-ant off">${tr('pie.no_dish')}</i></span>${pieBtn(tr('pie.build_price',{price:fmt$(dp)}),'pieDish',{city:c},'ghost sm',dp,P.dishes.length>=PIE_DISH_MAX?tr('pie.off_dish_max',{n:PIE_DISH_MAX}):'')}</div>`;
      const n=pieAntLeft(d),ant=pieAntPrice(d.band),bc=pieBandCost(d),L=R&&R.pie&&R.pie.dish?R.pie.dish.find(y=>y.city===c):null;return `<div class="kv${UI.pieFocus===c?' pie-focus':''}" data-dish="${c}"><span>${btn('📍','pieLook',{city:c},'ghost sm pie-loc',false,tr('pie_traffic.a_look'))} ${esc(CITY[c].name)} <span class="pie-ant">📡 ${d.ant}/${PIE_ANT_MAX}</span> <span class="tag st pie-band">${PIE_BAND_N[d.band||0]}</span>${L&&L.cap>0?` <span class="pie-dl ${pieLoadCls(L.u)}">${pct(L.u)}</span>`:''}${L&&L.st!=='ok'&&L.st!=='idle'?` <small class="pft-st">${pieDishWhy(L)}</small>`:''}</span><span class="pie-ab">${bc?pieBtn(`⬆ ${PIE_BAND_N[pieBandMax()]} <small>${fmt$(bc)}</small>`,'pieBand',{id:d.id},'ghost sm',bc):''}${n?pieBtn(`+1 <small>${fmt$(ant)}</small>`,'pieAnt',{id:d.id},'ghost sm',ant)+pieBtn(`${tr('pie.max')} <small>${fmt$(n*ant)}</small>`,'pieAntMax',{id:d.id},'ghost sm',n*ant):`<b>✓</b>`}</span></div>`;}).join('');
    {const k=Math.min(pieDishFree(cc).length,PIE_DISH_MAX-P.dishes.length);if(k>1)x+=`<div class="btns">${pieBtn(tr('pie.dish_all',{n:k,price:fmt$(k*dp)}),'pieDishAll',{cc},'ghost sm',k*dp)}</div>`;}
    return x+'</div>';}).join('');
  return h;}
// The pad picker: coastal POPs without a pad as cards, nearest the equator first (the cheapest launches): a latitude gauge,
// the discount, the crusts each one reaches, and its own Build button. The best few show; the rest unfold.
const PIE_PAD_SHOW=4;
function piePadPick(P,can){const cs=Object.keys(S.pops).filter(c=>pieCoast(c)&&!P.pads.some(p=>p.city===c)).sort((a,b)=>Math.abs(CITY[a].lat)-Math.abs(CITY[b].lat));
  if(!cs.length)return `<p class="meta">${tr('pie.pad_none_left')}</p>`;
  const all=!!UI.piePadAll,show=all?cs:cs.slice(0,PIE_PAD_SHOW),price=fmt$(piePrice(PIE_PAD)),full=P.pads.length>=PIE_PAD_MAX;
  const card=c=>{const la=CITY[c].lat,eq=pieEq(c);
    return `<div class="pie-site"><div class="pie-site-h"><b>${esc(CITY[c].name)}</b><span class="tag ${eq>0?'open':'st'}">${eq>0?'−'+pct(eq):tr('pie.pad_no_discount')}</span></div><small class="pie-site-cc">${esc(pieLicCountry(CITY[c].cc))}</small>
      <div class="pie-lat" role="img" aria-label="${esc(tr('pie.pad_lat',{lat:Math.abs(Math.round(la)),h:la<0?'S':'N'}))}"><span class="pie-lat-g"><i style="left:${Math.round(clamp(Math.abs(la)/70,0,1)*100)}%"></i></span><small>${Math.abs(Math.round(la))}°${la<0?'S':'N'}</small></div>
      <div class="pie-crs">${Object.keys(CRUSTS).every(id=>piePadOk(c,id))?`<span class="pie-cr on">✓ ${tr('pie.pad_all_crusts')}</span>`:Object.keys(CRUSTS).map(id=>{const ok=piePadOk(c,id);return `<span class="pie-cr${ok?' on':''}" title="${esc(tr(CRUSTS[id].n))}">${ok?'✓':'✕'} ${esc(tr(CRUSTS[id].n).replace(/\s*\(.*\)$/,''))}</span>`;}).join('')}</div>
      <div class="btns">${pieBtn(tr('pie.build_price',{price}),'piePad',{city:c},'ghost sm',piePrice(PIE_PAD),full?tr('pie.off_pad_max',{n:PIE_PAD_MAX}):'')}</div></div>`;};
  return `<p class="meta pie-site-hd">${tr('pie.pad_site')}</p><div class="pie-sites">${show.map(card).join('')}</div>`
    +(cs.length>PIE_PAD_SHOW?`<div class="btns">${btn(all?tr('pie.pad_less'):trn('pie.pad_more',cs.length-PIE_PAD_SHOW),'piePadAll',{},'ghost sm')}</div>`:'');}
// A tap on a dish or a POP on the globe: that city in the Dishes tab, its country open and its row in view.
function pieGlobePick(city){if(!S||!S.pie||!isCity(city))return;ACT.pieDishGo({city});}
