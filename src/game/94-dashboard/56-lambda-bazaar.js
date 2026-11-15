/* ---------- Lambda Bazaar: the capacity market's window (a wide modal, a bottom sheet on phones) ----------
   Tabs on the NOC dashboard's pattern: the overview (what you earn, what needs you), your routes (a card each, one
   unfolded at a time, with that route's own rules), the products (what the broker sells everywhere), the news, and the
   routes a Cable broker could build. Only the open tab is drawn, and the routes come a page at a time. The clock stands
   still while a modal is open, so the window is redrawn by its own actions only (bazRefresh()). View state is on UI:
   bazTab, bazSort, bazFilt, bazOpen (the unfolded route), bazN (routes shown), bazHelp (the unfolded "?"), bazAsk (the
   unfolded question of a one-tap fix). */
const BAZ_TABS=['home','routes','prod','news','scout'],BAZ_SORT=['mo','held','val','heat','name'],BAZ_FILT=['all','bad','hot','off'],BAZ_KIND=['floor','room','optic'],BAZ_PG=12;
const bazIsOpen=()=>!$('modal').hidden&&$('modal').className==='baz';
function bazRefresh(){if(S&&bazIsOpen())bazModal();}
// The way in from the NOC tab: only once there is dark fiber to trade on.
function bazNocBtn(){if(!S.links.some(l=>l.kind==='df'))return '';return btn(`🛒 ${tr('market.open')}`,'marketOpen',{},'');}
const bazSel=(act,args,opts,cur,lab)=>`<select class="bz-s" data-chg="${act}" data-args="${esc(JSON.stringify(args))}" aria-label="${esc(lab)}">${opts.map(([v,l])=>`<option value="${v}"${v===cur?' selected':''}>${esc(l)}</option>`).join('')}</select>`;
const bazChips=(act,vals,cur,L)=>vals.map(v=>`<button class="bz-chip${v===cur?' on':''}" data-act="${act}" data-args='{"v":"${v}"}' aria-pressed="${v===cur}">${L[v]}</button>`).join('');
function bazModal(){if(!S||pzOn())return;const card=$('modalCard'),was=bazIsOpen(),top=was?card.scrollTop:0,T=UI.bazTab=BAZ_TABS.includes(UI.bazTab)?UI.bazTab:'home',D=bazData();
  const L={home:tr('common.overview'),routes:tr('market.tab_routes'),prod:tr('market.tab_prod'),news:tr('market.tab_news'),scout:tr('market.tab_scout')};
  let h=`<div class="dtitle"><div class="eyebrow">${tr('market.tab')}</div><h2>${tr('market.title')}</h2></div><div class="dhead"><nav class="dtabs" role="tablist">${BAZ_TABS.map(k=>`<button class="${T===k?'on':''}" role="tab" aria-selected="${T===k}" data-act="bazTab" data-args='{"t":"${k}"}'>${L[k]}${k==='routes'&&D.bad?`<span class="cnt red">${D.bad}</span>`:k==='scout'&&!D.bk?' 🔒':''}</button>`).join('')}</nav><button class="x" data-act="closeModal" aria-label="${tr('common.close')}">×</button></div>`;
  h+=`<div class="bz-body">${bazTabHtml(T,D)}</div>`;
  openModal(h,'baz');if(was&&UI._bazT===T)card.scrollTop=top;UI._bazT=T;}
// One tab's markup. all: every route, each unfolded (what the fuzz harness and the tests read).
function bazTabHtml(T,D,all){return T==='routes'?bazRoutes(D,all):T==='prod'?bazProducts(D):T==='news'?bazNews(D):T==='scout'?bazScout(D):bazHome(D);}
// ---------- Routes ----------
const bazHot=x=>x.H>=1.15;
function bazRows(D){const f=UI.bazFilt||'all',so=UI.bazSort||'mo';
  const rs=D.rows.filter(x=>f==='bad'?x.bad:f==='hot'?bazHot(x):f==='off'?x.off:BAZ_KIND.includes(f)?x.ps.some(q=>q.st===f):true);
  return rs.sort((x,y)=>(so==='name'?0:so==='heat'?y.H-x.H:so==='held'?y.w-x.w:so==='val'?y.val-x.val:y.mo-x.mo)||cmRouteName(x.r).localeCompare(cmRouteName(y.r))||(x.k<y.k?-1:1));}
function bazRoutes(D,all){if(!D.rows.length)return bazEmpty();const f=UI.bazFilt||'all',so=UI.bazSort||'mo',rs=all?D.rows:bazRows(D),n=all?rs.length:Math.max(BAZ_PG,UI.bazN||0),kind=BAZ_KIND.includes(f);
  const FL={all:tr('dashboard.fs_all'),bad:tr('market.f_bad'),hot:tr('market.f_hot'),off:tr('market.f_off'),floor:tr('market.f_floor'),room:tr('market.f_room'),optic:tr('market.f_optic')};
  let h=`<div class="bz-bar2"><div class="bz-cg"><span class="bz-cl">${tr('common.show')}</span>${bazChips('bazFilt',kind?[...BAZ_FILT,f]:BAZ_FILT,f,FL)}</div>`
    +`<div class="bz-cg"><span class="bz-cl">${tr('pie.gs_sort')}</span>${bazChips('bazSort',BAZ_SORT,so,{mo:tr('market.so_mo'),held:tr('market.so_held'),val:tr('common.demand'),heat:tr('market.so_heat'),name:tr('common.name')})}</div></div>`;
  h+=`<div class="bz-lg" aria-hidden="true"><span>${tr('market.lg_chips')}</span><span class="bz-ch ok">${tr('market.selling')}</span><span class="bz-ch bad">⚠ ${tr('market.f_bad')}</span><span class="bz-ch idle">${tr('market.lg_idle')}</span><span class="bz-ch off">${tr('market.not_selling')}</span></div>`;
  if(!rs.length)return h+`<p class="empty">${tr('market.none_match')}</p>`;
  h+=`<div class="bz-rl">${rs.slice(0,n).map(x=>bazCard(x,D,all||UI.bazOpen===x.k)).join('')}</div>`;
  if(rs.length>n)h+=`<div class="btns bz-more">${btn(trn('market.n_more_routes',Math.min(BAZ_PG,rs.length-n)),'bazMore',{},'ghost sm')}</div>`;
  return h;}
const BAZ_CH={sell:'ok',full:'ok',floor:'bad',room:'bad',optic:'bad',idle:'idle'};
/* A route's card: its cities, what it earns and a chip per product that matters (sold of wanted, coloured by state).
   Unfolded: each product with its bar, price and blocker, then the route's own rules. */
function bazCard(x,D,open){const r=x.r,sh=x.ps.filter(q=>q.show),ka=esc(JSON.stringify({k:x.k}));
  let h=`<div class="bz-r${open?' open':''}${x.off?' off':''}" data-route="${x.k}"><button class="bz-rh" data-act="bazRow" data-args="${ka}" aria-expanded="${!!open}">`
    +`<span class="bz-rn"><b>${cmRouteName(r)}</b> <span class="tag st">${r.sub?tr('common.subsea'):tr('common.land')}</span>${bazHot(x)||x.H<=0.85?' '+cmHeatTag(r):''}${x.off?` <span class="tag selective">${tr('market.f_off')}</span>`:''}${x.o?` <span class="tag st on">${tr('market.own_rules')}</span>`:''}${x.w>0?` <span class="bz-hu">⚠ ${tr('market.held_mo',{v:fmt$(x.w)})}</span>`:''}</span>`
    +`<span class="bz-rm">${tr('common.price_mo',{price:fmt$(x.mo)})}</span><span class="bz-car" aria-hidden="true">${open?'▾':'▸'}</span>`
    +`<span class="bz-chs">${sh.map(q=>`<span class="bz-ch ${BAZ_CH[q.st]||'off'}">${BAZ_BAD.includes(q.st)?'⚠ ':''}${cmShort(q.p)} <b>${q.s}/${cmN(q.D)}</b></span>`).join('')}</span></button>`;
  if(open)h+=bazCardBody(x,D,sh);
  return h+`</div>`;}
function bazCardBody(x,D,sh){const r=x.r,C=S.cm,o=x.o||{},m=mkt()*cmCut(),k=x.k,rest=CM_P.filter(p=>!sh.some(q=>q.p===p)),fib=btn(tr('lease_swaps.open_your_fiber'),'bazLink',{id:r.ls[0].id},'ghost sm');
  const ST={sell:tr('market.selling'),full:tr('market.st_full'),floor:tr('market.f_floor'),room:tr('market.f_room'),optic:tr('market.f_optic'),idle:tr('market.not_selling'),off:tr('market.not_selling'),quiet:tr('market.st_quiet'),nopair:tr('market.st_nopair')};
  const why=q=>{const p=q.p;
    if(q.st==='floor'){const v=CM_FLOOR.filter(f=>f<=q.pc).pop();return tr('market.why_floor',{pct:q.pc,floor:q.fl})+(v?`<span class="btns">${btn(tr('market.fix_floor_here',{n:v}),'mktRt',{k,f:'floor',v},'sm')}</span>`:'');}
    if(q.st==='room')return tr('market.why_room')+`<span class="btns">${cmHold(k)>0&&r.ls.some(l=>cmSpare(l,p,0)>0)?btn(tr('market.fix_hold_here'),'mktRt',{k,f:'hold',v:0},'sm'):''}${fib}</span>`;
    if(q.st==='optic')return tr('market.why_optic',{g:fmtCap(CM_G[p])})+`<span class="btns">${fib}</span>`;
    if(q.st==='idle')return tr('market.why_idle')+(x.off?'':`<span class="btns">${btn(tr('market.fix_sell_here'),'mktRt',{k,f:p,v:1},'sm')}</span>`);
    return q.st==='quiet'?tr('market.why_quiet',{n:q.min}):q.st==='full'?tr('market.why_full'):q.st==='nopair'?tr('market.why_nopair'):'';};
  let h=`<div class="bz-rb"><div class="meta">${tr('market.route_meta',{km:Math.round(r.km).toLocaleString(),ms:r.lat.toFixed(1),n:Math.round((r.lp-1)*100)})}</div>`;
  h+=sh.map(q=>{const p=q.p,i=q.pc/100,w=q.D>0?Math.min(100,100*q.s/q.D):q.s?100:0,y=why(q),ov=o.p&&o.p[p]!==undefined?String(o.p[p]):'';
    const price=p==='iru'?tr('market.price_pair',{up:fmt$(Math.round(cmUpList(r)*i*m)),price:fmt$(Math.round(cmList(r,p)*m)),pct:q.pc}):tr('market.price',{price:fmt$(Math.round(cmList(r,p)*i*m)),pct:q.pc});
    return `<div class="bz-p ${BAZ_CH[q.st]||'off'}"><div class="bz-ph"><b>${tr(CM_NAME[p])}</b><span class="bz-st">${ST[q.st]}</span></div>
      <label class="bz-f bz-pf"><span>${tr('market.on_route')}</span>${bazSel('mktRt',{k,f:p},[['',tr('market.as_all_v',{v:C.p[p].on?tr('market.selling'):tr('market.not_selling')})],['1',tr('market.sell_here')],['0',tr('market.not_here')]],ov,tr(CM_NAME[p]))}</label>
      <div class="bz-bar" role="img" aria-label="${esc(tr('market.sold_of_plain',{sold:q.s,want:cmN(q.D)}))}"><i style="width:${w.toFixed(1)}%"></i></div>
      <div class="bz-pl"><span>${tr('market.sold_of',{sold:q.s,want:cmN(q.D),listed:q.L})}</span><span>${price}</span></div>${D.bk?`<div class="meta">${tr('market.forecast',{a:cmN(cmFc(r,p,30)),b:cmN(cmFc(r,p,90))})}</div>`:''}
      ${y?`<div class="bz-why">${y}</div>`:''}</div>`;}).join('');
  if(rest.length)h+=`<div class="meta bz-ny">${tr('market.not_yet',{list:rest.map(p=>tr(CM_NAME[p])).join(', ')})}</div>`;
  h+=`<div class="bz-ctl"><h4>${tr('market.rules_t')}</h4><div class="bz-fs"><label class="bz-f"><span>${tr('market.hold_s')}</span>${bazSel('mktRt',{k,f:'hold'},[['',tr('market.as_all_v',{v:C.hold+'%'})],...CM_HOLD.map(v=>[String(v),v+'%'])],o.hold!==undefined?String(o.hold):'',tr('market.hold_s'))}</label>`
    +`<label class="bz-f"><span>${tr('market.floor')}</span>${bazSel('mktRt',{k,f:'floor'},[['',tr('market.as_all')],...CM_FLOOR.map(v=>[String(v),tr('market.floor_v',{n:v})])],o.floor!==undefined?String(o.floor):'',tr('market.floor'))}</label></div>`
    +`<div class="btns">${btn(x.off?tr('market.route_off'):tr('market.route_on'),'mktRoute',{k},x.off?'ghost sm':'pink sm')}${x.o?btn(tr('market.reset_route'),'mktRtReset',{k},'ghost sm'):''}${fib}</div></div></div>`;
  return h;}
// ---------- Products ----------
/* What the broker sells everywhere: three quick setups, the share kept back, then a row per product with its switch
   and, while it is on, the demand it lists from and its floor. The "?" unfolds what the product is. */
function bazProducts(D){const C=S.cm,q=k=>`<button class="bz-q${UI.bazHelp===k?' on':''}" data-act="bazHelp" data-args='{"p":"${k}"}' aria-expanded="${UI.bazHelp===k}" aria-label="${esc(tr('market.what'))}" title="${esc(tr('market.what'))}">?</button>`;
  const pre=(v,l,d,cls)=>`<button class="bz-pre ${cls}" data-act="mktPreset" data-args='{"v":"${v}"}'><b>${l}</b><small>${d}</small></button>`;
  let h=`<div class="bz-pres">${pre('all',tr('market.pre_all'),tr('market.pre_all_d'),'go')}${pre('careful',tr('market.pre_careful'),tr('market.pre_careful_d'),'')}${pre('stop',tr('market.pre_stop'),tr('market.pre_stop_d'),'stop')}</div>`;
  h+=`<div class="bz-pr hold"><div class="bz-pn"><b>${tr('market.hold')}</b>${q('hold')}</div><label class="bz-f"><span>${tr('market.hold_s')}</span>${bazSel('mktHold',{},CM_HOLD.map(v=>[String(v),v+'%']),String(C.hold),tr('market.hold'))}</label>${UI.bazHelp==='hold'?`<p class="bz-pd">${tr('market.hold_d')}</p>`:''}</div>`;
  h+=CM_P.map(p=>{const c=C.p[p],sold=D.rows.reduce((a,x)=>a+x.ps.find(y=>y.p===p).s,0),want=D.rows.filter(x=>{const y=x.ps.find(z=>z.p===p);return y.D>=c.min&&Math.round(y.D-y.s)>=1;}).length;
    return `<div class="bz-pr${c.on?' on':''}"><div class="bz-pn"><b>${tr(CM_NAME[p])}</b>${q(p)}<div class="meta">${tr('market.prod_meta',{sold,n:want,of:D.rows.length})}</div></div>`
      +(c.on?`<label class="bz-f"><span>${tr('market.from')}</span>${bazSel('mktCfg',{p,k:'min'},CM_MIN[p].map(v=>[String(v),tr('market.min_v',{n:v})]),String(c.min),tr('market.min'))}</label><label class="bz-f"><span>${tr('market.floor_s')}</span>${bazSel('mktCfg',{p,k:'floor'},CM_FLOOR.map(v=>[String(v),tr('market.floor_v',{n:v})]),String(c.floor),tr('market.floor'))}</label>`:'')
      +`<button class="bz-sw${c.on?' on':''}" role="switch" aria-checked="${c.on}" data-act="mktCfg" data-args="${esc(JSON.stringify({p,k:'on',v:c.on?0:1}))}" aria-label="${esc(tr(CM_NAME[p]))}"><span class="bz-swt">${c.on?tr('market.selling'):tr('market.not_selling')}</span><span class="bz-swk" aria-hidden="true"></span></button>`
      +(UI.bazHelp===p?`<p class="bz-pd">${tr(CM_DESC[p])} ${tr('market.how_thresholds')}</p>`:'')+`</div>`;}).join('');
  return h;}
// ---------- News ----------
// Each piece of news with its age, how long it still moves the market, and which of your routes it touches.
function bazNews(D){const C=S.cm;if(!C.news.length)return `<p class="empty">${tr('market.no_news')}</p>`;
  return `<div class="bz-news">`+C.news.map(n=>{const x=C.sh.find(s=>s.why===n.why&&s.from===n.d&&(s.a?s.a===n.a&&(s.b||null)===n.b:s.c?s.c===n.a:true)),left=x?x.until-S.day:0,hit=x&&left>0?D.rows.filter(y=>cmHits(x,y.r)):[],up=CM_NEWS[n.why].m>1;
    return `<div class="bz-nw ${up?'up':'down'}"><span class="bz-ni" aria-hidden="true">${up?'🔥':'❄️'}</span><div class="grow"><div>${cmNewsText(n)}</div><div class="meta">${cmAgo(n)} · ${left>0?trn('market.news_left',left):tr('market.news_over')}</div>`
      +(left>0?`<div class="bz-nh">${hit.length?`<span class="meta">${tr('market.news_hits')}</span>`+hit.slice(0,4).map(y=>`<button class="bz-chip bz-rlk" data-act="marketOpen" data-args="${esc(JSON.stringify({k:y.k}))}">${cmRouteName(y.r)}</button>`).join('')+(hit.length>4?`<span class="meta">${tr('dashboard.n_more',{n:hit.length-4})}</span>`:''):`<span class="meta">${tr('market.news_none')}</span>`}</div>`:'')+`</div></div>`;}).join('')+`</div>`;}
// ---------- Routes to build ----------
function bazScout(D){if(!D.bk)return `<div class="bz-empty"><div class="bz-ei" aria-hidden="true">🔒</div><h3>${tr('market.scout')}</h3><p>${tr('market.scout_lock')}</p></div>`;
  const sc=cmScout();return `<p class="meta" style="margin-top:0">${tr('market.scout_d')}</p>`+(sc.length?sc.map(r=>{const v=CM_P.reduce((a,p)=>a+cmDem(r,p,S.day)*cmList(r,p),0)*mkt()*cmCut();
    return `<div class="row"><div class="grow"><div class="nm">${cmRouteName(r)} <span class="tag st">${r.sub?tr('common.subsea'):tr('common.land')}</span> ${cmHeatTag(r)}</div>
      <div class="meta">${tr('market.scout_spend',{km:Math.round(r.km).toLocaleString(),v:fmt$(Math.round(v))})}</div>${CM_P.filter(p=>cmDem(r,p,S.day)>=0.3||cmFc(r,p,90)>=0.3).map(p=>`<div class="meta"><b>${tr(CM_NAME[p])}</b> · ${tr('market.forecast_now',{n:cmN(cmDem(r,p,S.day)),a:cmN(cmFc(r,p,30)),b:cmN(cmFc(r,p,90))})}</div>`).join('')}</div></div>`;}).join(''):`<p class="empty">${tr('market.scout_none')}</p>`);}
