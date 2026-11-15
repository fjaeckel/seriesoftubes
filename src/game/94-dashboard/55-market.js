/* ---------- the capacity market, Lambda Bazaar (37-fiber-market.js): what both of its views share ----------
   The market has a window of its own (56-lambda-bazaar.js); the dashboard's tab is its overview and the way in. Both
   read bazData(): every route you hold dark fiber on, per product what is wanted, sold and listed, today's price and
   what state it is in (selling, sold out, waiting, or blocked and why). Markup is deterministic (the NOC window copies it). */
const CM_NAME={spec:N_('market.p_spec'),w100:N_('market.p_w100'),w400:N_('market.p_w400'),w800:N_('market.p_w800'),w1600:N_('market.p_w1600'),iru:N_('market.p_iru')};
const CM_DESC={spec:N_('market.p_spec_d'),w100:N_('market.p_w100_d'),w400:N_('market.p_w400_d'),w800:N_('market.p_w800_d'),w1600:N_('market.p_w1600_d'),iru:N_('market.p_iru_d')};
const cmN=v=>v>=10?String(Math.round(v)):v.toFixed(1).replace(/\.0$/,'');
// A product in a few letters, for a chip: 100G, 400G…, Spectrum, Dark pair.
const cmShort=p=>CM_G[p]?fmtCap(CM_G[p]):p==='spec'?tr('market.p_spec'):tr('market.s_iru');
const cmRouteName=r=>`${CITY[r.a].name} ⇄ ${CITY[r.b].name}`;
function cmHeatTag(r){const H=cmHeat(r,'spec',S.day);return H>=1.15?`<span class="tag cmhot">${tr('market.hot',{x:H.toFixed(1)})}</span>`:H<=0.85?`<span class="tag cmcool">${tr('market.cool',{x:H.toFixed(1)})}</span>`:`<span class="tag st">${tr('market.steady')}</span>`;}
const cmAgo=n=>S.day-n.d<1?tr('market.today'):trn('market.days_ago',S.day-n.d);
/* A product on a route is in one state: sell (listed, or a pair that waits for its buyer), full (buyers there have all
   they want), quiet (fewer wanted than your minimum), off, idle (off, though carriers want it and a fiber could carry
   it), nopair (no pair to spare), or blocked: floor (buyers pay less than your floor), room (nothing left after what
   you keep back), optic (no optic that big on the route). The blocked ones are what "Needs you" counts. */
const BAZ_BAD=['floor','room','optic'];
function bazData(){const C=S.cm,d=S.day,rm=cmRoutes(),sold=cmSold(rm),ids=new Map(),bk=broker(),by=new Map();
  const rows=[...rm.values()].map(r=>{for(const l of r.ls)ids.set(l.id,r.k);const s=sold.get(r.k),off=!!C.off[r.k];let val=0;
    const ps=CM_P.map(p=>{const D=cmDem(r,p,d),lk=CM_L[p],L=r.ls.reduce((a,l)=>a+((l.list&&l.list[lk])||0),0),pc=Math.round(cmIdx(r,p,s[p],0,d)*100),on=cmOn(r.k,p)&&!off,min=C.p[p].min,fl=cmFloor(r.k,p),room=Math.round(D-s[p]);
      val+=D*cmList(r,p);
      const st=!on?(D>=min&&room>=1&&r.ls.some(l=>cmCan(l,p)>0)?'idle':'off'):room<1?'full':pc<fl?'floor':D<min?'quiet':L?'sell':p==='iru'?'nopair':!r.ls.some(l=>cmOptG(l)>=CM_G[p])&&CM_G[p]?'optic':'room';
      return {p,D,L,s:s[p],pc,on,min,fl,st,show:s[p]>0||L>0||D>=0.3||bk&&cmFc(r,p,90)>=0.3};});
    const x={r,k:r.k,off,o:cmRt(r.k),ps,mo:0,val,H:cmHeat(r,'spec',d),bad:ps.some(q=>BAZ_BAD.includes(q.st)),on:ps.some(q=>q.on)};by.set(r.k,x);return x;});
  let mo=0,buyers=0;for(const b of S.biz){if(b.type!=='wwave'&&b.type!=='mwave'&&b.type!=='dfpair')continue;const v=bizMo(b);mo+=v;buyers++;const x=by.get(ids.get(b.link));if(x)x.mo+=v;}
  const kind=k=>rows.filter(x=>x.ps.some(q=>q.st===k)).length;
  // Products that are off everywhere, though carriers want them where a fiber could carry them.
  const idle=CM_P.filter(p=>!C.p[p].on).map(p=>({p,n:rows.filter(x=>!x.off&&x.ps.some(q=>q.p===p&&q.st==='idle')).length})).filter(x=>x.n);
  return {rows,by,mo,buyers,bk,idle,floor:kind('floor'),room:kind('room'),optic:kind('optic'),
    low:rows.some(x=>x.ps.some(q=>q.st==='floor'&&q.fl>CM_FLOOR[0])),bad:rows.filter(x=>x.bad).length,
    sold:rows.reduce((a,x)=>a+x.ps.reduce((b,q)=>b+q.s,0),0),listed:rows.reduce((a,x)=>a+x.ps.reduce((b,q)=>b+q.L,0),0)};}
const bazTile=(l,v,sub)=>`<div class="tile"><div class="lbl">${l}</div><div class="val">${v}</div>${sub?`<div class="sub">${sub}</div>`:''}</div>`;
// No dark fiber yet: what the market is and how to get into it, and when the first fiber on order arrives.
function bazEmpty(){const next=S.links.filter(l=>l.kind==='df'&&l.ready>S.day).sort((a,b)=>a.ready-b.ready)[0];
  return `<div class="bz-empty"><div class="bz-ei" aria-hidden="true">🕸️</div><h3>${tr('market.empty_t')}</h3><p>${tr('market.empty_d')}</p>${next?`<p class="bz-wait">${tr('market.empty_wait',{a:CITY[next.a].name,b:CITY[next.b].name,date:dateStr(next.ready)})}</p>`:''}</div>`;}
// One line per kind of blocker, with how many routes it holds up and the one tap that fixes it (or shows them).
function bazNeeds(D){const row=(ic,t,b)=>`<div class="bz-need"><span class="bz-ni" aria-hidden="true">${ic}</span><span class="bz-nt">${t}</span><span class="btns">${b}</span></div>`,see=f=>btn(tr('market.see_routes'),'marketOpen',{t:'routes',f},'ghost sm');
  let h='';
  if(D.floor)h+=row('💸',trn('market.n_floor',D.floor),(D.low?btn(tr('market.fix_floor',{n:CM_FLOOR[0]}),'mktFloorLow',{},'sm'):'')+see('floor'));
  if(D.room)h+=row('📦',trn('market.n_room',D.room),see('room'));
  if(D.optic)h+=row('🔦',trn('market.n_optic',D.optic),see('optic'));
  for(const x of D.idle)h+=row('💤',trn('market.n_idle',x.n,{what:tr(CM_NAME[x.p])}),btn(tr('market.start_selling'),'mktCfg',{p:x.p,k:'on',v:1},'sm'));
  return h;}
/* The overview: what you earn, what is sold and listed, how many routes trade and what the broker keeps; then what
   needs you, the hottest routes and the latest news. The dashboard's tab shows the same under a button that opens the window. */
function bazHome(D,dash){if(!D.rows.length)return bazEmpty();const C=S.cm,none=!D.rows.some(x=>x.on),on=D.rows.filter(x=>x.on).length;
  let h=`<div class="dgrid bz-tiles">${bazTile(tr('market.sales'),tr('common.price_mo',{price:fmt$(D.mo)}),trn('market.t_buyers',D.buyers))}${bazTile(tr('market.t_sold'),D.sold,tr('market.t_listed',{n:D.listed}))}`
    +`${bazTile(tr('market.t_routes'),`${on}/${D.rows.length}`,D.bad?`<span class="bz-warn">${trn('market.t_blocked',D.bad)}</span>`:tr('market.t_none_blocked'))}${bazTile(tr('market.fee'),Math.round((1-cmCut())*100)+'%',D.bk?tr('market.fee_broker'):tr('market.t_cut_mo',{v:fmt$(Math.round(D.mo/cmCut()*(1-cmCut())))}))}</div>`;
  if(none)h+=`<div class="panel2 bz-idle"><h3>💤 ${tr('market.idle_t')}</h3><p>${tr('market.idle_d')}</p><div class="btns">${btn(tr('market.sell_all'),'mktPreset',{v:'all'},'pink')}${btn(tr('market.choose'),'marketOpen',{t:'prod'},'ghost')}</div></div>`;
  else{const nd=bazNeeds(D);h+=`<div class="panel2 bz-needs"><h3>${tr('market.needs')}</h3>${nd||`<p class="meta">✅ ${tr('market.needs_none')}</p>`}</div>`;}
  const hot=D.rows.slice().sort((x,y)=>y.H-x.H||y.mo-x.mo||(x.k<y.k?-1:1)).slice(0,3);
  h+=`<div class="dcols bz-two"><div class="panel2"><h3>${tr('market.hottest')}</h3>${hot.map(x=>`<button class="bz-hot" data-act="marketOpen" data-args="${esc(JSON.stringify({k:x.k}))}"><span class="nm">${cmRouteName(x.r)}</span>${cmHeatTag(x.r)}<b>${tr('common.price_mo',{price:fmt$(x.mo)})}</b><span class="bz-car" aria-hidden="true">›</span></button>`).join('')}</div>`
    +`<div class="panel2"><h3>${tr('market.news')}</h3>${C.news.length?C.news.slice(0,2).map(n=>`<div class="bz-nl"><span class="bz-nd">${cmAgo(n)}</span><span>${cmNewsText(n)}</span></div>`).join('')+`<div class="btns">${btn(tr('market.all_news'),'marketOpen',{t:'news'},'ghost sm')}</div>`:`<p class="empty">${tr('market.no_news')}</p>`}</div></div>`;
  return h;}
// The dashboard's tab: the way into the window, and its overview.
function marketTab(){const D=bazData();
  return `<div class="panel2 bz-dash" style="margin-top:12px"><div class="bz-dh"><div class="grow"><h3>${tr('market.title')}</h3><p class="note" style="margin-top:0">${tr('market.lead_short')}</p></div>${btn(tr('market.open_bazaar'),'marketOpen',{},'pink')}</div>${bazHome(D,true)}</div>`;}
