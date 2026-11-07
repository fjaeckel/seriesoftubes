/* ---------- the capacity market tab (37-fiber-market.js) ----------
   Your settings (what the broker may sell, from what demand and price, and how much it keeps back), the news, and
   every route you hold dark fiber on: per product what is wanted, sold and listed, as a bar with your threshold on
   it, and today's price against your floor. A Cable broker also sees where each route is heading, and routes it could
   build. Markup is deterministic (the NOC window copies it). */
const CM_NAME={spec:N_('market.p_spec'),w100:N_('market.p_w100'),w400:N_('market.p_w400'),w800:N_('market.p_w800'),w1600:N_('market.p_w1600'),iru:N_('market.p_iru')};
const CM_DESC={spec:N_('market.p_spec_d'),w100:N_('market.p_w100_d'),w400:N_('market.p_w400_d'),w800:N_('market.p_w800_d'),w1600:N_('market.p_w1600_d'),iru:N_('market.p_iru_d')};
const cmN=v=>v>=10?String(Math.round(v)):v.toFixed(1).replace(/\.0$/,'');
// Why nothing is listed although the route wants it and the price is right: no optic that big, or no room left on
// the fiber after what you keep back. Growing means lighting more.
// A bar: sold (green) of what the route wants (the dark line), and your minimum (the pink tick) when the broker lists.
function cmBar(D,sold,min){const top=Math.max(D,sold,min||0,1)*1.15,w=v=>(100*Math.min(1,v/top)).toFixed(1)+'%';
  return `<div class="cmbar"><i style="width:${w(sold)}"></i><b style="left:${w(D)}"></b>${min?`<u style="left:${w(min)}"></u>`:''}</div>`;}
const cmSeg=(vals,cur,act,args,f)=>`<div class="seg">${vals.map(v=>btn(f(v),act,{...args,v},v===cur?'pink sm':'ghost sm')).join('')}</div>`;
function cmHeatTag(r){const H=cmHeat(r,'spec',S.day);return H>=1.15?`<span class="tag cmhot">${tr('market.hot',{x:H.toFixed(1)})}</span>`:H<=0.85?`<span class="tag cmcool">${tr('market.cool',{x:H.toFixed(1)})}</span>`:`<span class="tag st">${tr('market.steady')}</span>`;}
function cmProdLine(r,p,s,L,fc){const C=S.cm.p[p],D=cmDem(r,p,S.day),i=cmIdx(r,p,s,0,S.day),pc=Math.round(i*100),m=mkt()*cmCut();
  const price=p==='iru'?tr('market.price_pair',{up:fmt$(Math.round(cmUpList(r)*i*m)),price:fmt$(Math.round(cmList(r,p)*m)),pct:pc}):tr('market.price',{price:fmt$(Math.round(cmList(r,p)*i*m)),pct:pc});
  return `<div class="cmp"><div class="meta"><b>${tr(CM_NAME[p])}</b> · ${tr('market.row',{want:cmN(D),sold:s,listed:L})} · ${price}${C.on&&pc<C.floor?` <b style="color:var(--bad)">${tr('market.below_floor')}</b>`:C.on&&!L&&D>=C.min&&p!=='iru'&&!S.cm.off[r.k]?` <b style="color:var(--warn)">${CM_G[p]&&!r.ls.some(l=>cmOptG(l)>=CM_G[p])?tr('market.needs_optic',{g:fmtCap(CM_G[p])}):tr('market.no_room')}</b>`:''}</div>
    ${cmBar(D,s,C.on?C.min:0)}${fc?`<div class="meta">${tr('market.forecast',{a:cmN(cmFc(r,p,30)),b:cmN(cmFc(r,p,90))})}</div>`:''}</div>`;}
function marketTab(){const C=S.cm,rs=[...cmRoutes().values()].sort((x,y)=>brMarket(y.a,y.b)-brMarket(x.a,x.b)),sold=cmSold(new Map(rs.map(r=>[r.k,r]))),bk=broker();
  const mo=S.biz.reduce((a,b)=>a+(['wwave','mwave','dfpair'].includes(b.type)?bizMo(b):0),0),ago=n=>S.day-n.d<1?tr('market.today'):trn('market.days_ago',S.day-n.d);
  let h=`<div class="panel2" style="margin-top:12px"><h3>${tr('market.title')}</h3><p class="note" style="margin-top:0">${tr('market.lead')}</p>
    <div class="kv"><span>${tr('market.sales')}</span><b>${tr('common.price_mo',{price:fmt$(mo)})}</b></div>
    <div class="kv"><span>${tr('market.fee')}</span><b>${Math.round((1-cmCut())*100)}%${bk?` · ${tr('market.fee_broker')}`:''}</b></div>
    <div class="cmset"><div class="nm">${tr('market.hold')}</div><div class="meta">${tr('market.hold_d')}</div>${cmSeg(CM_HOLD,C.hold,'mktHold',{},v=>v+'%')}</div>
    ${CM_P.map(p=>{const c=C.p[p];return `<div class="cmset"><div class="nm">${tr(CM_NAME[p])} ${btn(c.on?tr('market.selling'):tr('market.not_selling'),'mktCfg',{p,k:'on',v:c.on?0:1},c.on?'pink sm':'ghost sm')}</div><div class="meta">${tr(CM_DESC[p])}</div>
      ${c.on?`<div class="meta">${tr('market.min')}</div>${cmSeg(CM_MIN[p],c.min,'mktCfg',{p,k:'min'},v=>'≥ '+v)}<div class="meta">${tr('market.floor')}</div>${cmSeg(CM_FLOOR,c.floor,'mktCfg',{p,k:'floor'},v=>v+'%')}`:''}</div>`;}).join('')}
    <h3 style="margin-top:10px">${tr('market.news')}</h3>${C.news.length?C.news.slice(0,5).map(n=>`<div class="meta">${ago(n)} · ${cmNewsText(n)}</div>`).join(''):`<p class="empty">${tr('market.no_news')}</p>`}</div>`;
  h+=`<div class="panel2" style="margin-top:12px"><h3>${tr('market.routes')}</h3>${rs.length?`<p class="meta" style="margin-top:0">${tr('market.legend')}${bk?'':' '+tr('market.forecast_lock')}</p>`+rs.map(r=>{const s=sold.get(r.k),off=!!C.off[r.k],L=p=>r.ls.reduce((a,l)=>a+((l.list&&l.list[CM_L[p]])||0),0);
      return `<div class="row cmroute"><div class="grow"><div class="nm">${CITY[r.a].name} ⇄ ${CITY[r.b].name} <span class="tag st">${r.sub?tr('common.subsea'):tr('common.land')}</span> ${cmHeatTag(r)}</div>
        <div class="meta">${tr('market.route_meta',{km:Math.round(r.km).toLocaleString(),ms:r.lat.toFixed(1),n:Math.round((r.lp-1)*100)})}</div>
        ${(()=>{const shown=CM_P.filter(p=>s[p]>0||L(p)>0||cmDem(r,p,S.day)>=0.3||bk&&cmFc(r,p,90)>=0.3),rest=CM_P.filter(p=>!shown.includes(p));
          return shown.map(p=>cmProdLine(r,p,s[p],L(p),bk)).join('')+(rest.length?`<div class="meta">${tr('market.not_yet',{list:rest.map(p=>tr(CM_NAME[p])).join(', ')})}</div>`:'');})()}
        <div class="btns">${btn(off?tr('market.route_off'):tr('market.route_on'),'mktRoute',{k:r.k},off?'ghost sm':'pink sm')}${btn(tr('lease_swaps.open_your_fiber'),'dashLink',{id:r.ls[0].id},'ghost sm')}</div></div></div>`;}).join(''):`<p class="empty">${tr('market.no_routes')}</p>`}</div>`;
  if(bk){const sc=cmScout();h+=`<div class="panel2" style="margin-top:12px"><h3>${tr('market.scout')}</h3><p class="meta" style="margin-top:0">${tr('market.scout_d')}</p>${sc.length?sc.map(r=>{const v=CM_P.reduce((a,p)=>a+cmDem(r,p,S.day)*cmList(r,p),0)*mkt()*cmCut();
      return `<div class="row"><div class="grow"><div class="nm">${CITY[r.a].name} ⇄ ${CITY[r.b].name} <span class="tag st">${r.sub?tr('common.subsea'):tr('common.land')}</span> ${cmHeatTag(r)}</div>
        <div class="meta">${tr('market.scout_spend',{km:Math.round(r.km).toLocaleString(),v:fmt$(Math.round(v))})}</div>${CM_P.filter(p=>cmDem(r,p,S.day)>=0.3||cmFc(r,p,90)>=0.3).map(p=>`<div class="meta"><b>${tr(CM_NAME[p])}</b> · ${tr('market.forecast_now',{n:cmN(cmDem(r,p,S.day)),a:cmN(cmFc(r,p,30)),b:cmN(cmFc(r,p,90))})}</div>`).join('')}</div></div>`;}).join(''):`<p class="empty">${tr('market.scout_none')}</p>`}</div>`;}
  return h;}
