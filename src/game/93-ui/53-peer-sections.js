/* ---------- The Peering tab, in sections ----------
   A big POP has several exchanges, a dozen or two PNIs and a shelf of caches: pages of scrolling on a phone. So the tab
   is three sections (48-panel-folds.js), each a heading with a one-line summary: how much you have there, how much it
   carries, and a flag for what needs you (a port running hot, peers that would say yes, a PNI worth ordering, a cache
   to ask for). Inside, every exchange, PNI and cache you have is one short row with its controls behind "Change". */
const ixBare=h=>h.replace(/^<section><h3>.*?<\/h3>/,'').replace(/<\/section>$/,'');
function peerIx(c){const ids=ixIdsIn(c),v=pnVet(),multi=ids.length>1;
  if(!ids.length||!ixName(ids[0]))return {sum:tr('common.none'),tot:0,body:()=>ixBare(ixBlock(c,false))};
  const X=ids.map(x=>{const on=S.ixp[x]!==undefined,mine=!!S.myIx[x],u=on?R.useIx[x]||0:0,cap=on?ixCap(x):0,set=on?ixSessions(x):null,ms=ixMembers(x),down=!!(on&&S.ev.ixdown&&S.ev.ixdown[x]>S.day),
    ask=on&&!mine?ms.filter(id=>!set.has(id)&&peerOk(id,'ix',x).ok).length:0,hot=on&&cap>0&&u/cap>=0.9;
    return {x,on,mine,u,cap,set,ms,down,ask:ask>1?ask:0,hot,flag:hot||down||ask>1,match:!netFiltered()||ms.some(id=>netKeep(NET[id],!!set&&set.has(id)))};});
  const J=X.filter(i=>i.on),hot=J.filter(i=>i.hot).length,ask=J.reduce((a,i)=>a+i.ask,0),flags=[];
  if(J.some(i=>i.down))flags.push(['restrictive',tr('common.outage')]);
  if(hot)flags.push(['restrictive',tr('peer_sections.n_running_hot',{n:hot})]);
  if(ask)flags.push(['worth',trn('peer_sections.n_peer_to_ask',ask)]);
  const tag=x=>multi?` <span class="tag st">${XIXM[x]?tr('common.challenger'):tr('common.incumbent')}</span>`:'';
  const row=i=>{const x=i.x,o=pnOpen('x:'+x)||(netFiltered()&&i.on),nm=`<div class="nm">${esc(ixName(x))}${tag(x)}`;
    if(!i.on)return `<div class="row crow"><div class="grow">${nm}</div><div class="meta">${trn('peer_sections.n_member',i.ms.length)}</div></div>${foldB(tr('fedplay.ix_get_port'),'panelFold',{k:'x:'+x},o,o?'ghost sm':'sm')}</div>${o?`<div class="xbody">${ixBare(ixBlock(x,true))}</div>`:''}`;
    const n=(S.ixn||{})[x]||1;
    return `<div class="row crow"><div class="grow">${nm} <small>${i.mine?esc(myFab(x).n):(n>1?n+'×':'')+PORT[S.ixp[x]].n}</small>${i.down?` <span class="tag restrictive">${tr('common.outage')}</span>`:''}</div>${o?'':pnUse(i.u,i.cap)+`<div class="meta">${trn('connections.n_peering_session',i.set.size)}</div>${i.ask?`<div class="btns">${btn(tr('link_panels.request_all_n_willing_peers',{n:i.ask}),'peerAll',{city:x},'pink sm')}</div>`:''}`}</div>${pnChg('x:'+x,o,ixName(x))}</div>${o?`<div class="xbody">${ixBare(ixBlock(x,true))}</div>`:''}`;};
  return {sum:tr('peer_sections.a_of_b_joined',{a:J.length,b:X.length})+(J.length?' · '+fmtG(J.reduce((a,i)=>a+i.u,0)):''),flags,tot:X.length,hit:X.filter(i=>i.match&&(!UI.netOnly||i.on)).length,
    lead:multi?`<p class="lead">${tr('link_panels.n_exchanges_compete_in_city_members',{n:ids.length,city:esc(CITY[c].name)})}</p>`:'',
    body:m=>{if(!v)return multi?ids.map(x=>ixBlock(x,true)).join(''):ixBare(ixBlock(c,false));
      const sh=X.filter(i=>i.match&&(m>1||i.flag)&&(!UI.netOnly||i.on));return sh.length?sh.map(row).join(''):netNone();}};}
function peerPni(c){const rows=pniRows(c),own=rows.filter(r=>r.pn),hot=own.filter(r=>r.hot),ord=own.filter(r=>r.ord),w=rows.filter(r=>r.v&&r.v.worth),flags=[];
  if(hot.length)flags.push(['restrictive',tr('peer_sections.n_running_hot',{n:hot.length})]);
  if(ord.length)flags.push(['st',tr('peer_sections.n_on_order',{n:ord.length})]);
  if(w.length)flags.push(['worth','⭐ '+tr('peer_sections.n_worth_it',{n:w.length})]);
  return {sum:own.length?`${own.length} · ${fmtG(own.reduce((a,r)=>a+(R.usePni[r.pn.id]||0),0))}`:tr('common.none'),flags,tot:rows.length,hit:rows.length,
    lead:`<p class="lead">${tr('city_panel.a_dedicated_cross_connect_to_one',{dc:esc(siteName(c,'a'))})}</p>`,
    // What needs you: the hot ones, the ones on order, and the three candidates that pay best.
    body:m=>m>1?pniListHtml(c,rows):own.filter(r=>r.hot||r.ord).concat(w.slice().sort((a,b)=>b.v.val-a.v.val).slice(0,3)).map(r=>pniRow(c,r.n,r.pn,r.v,r.chk,true)).join('')};}
function cacheRow(c,n){const have=S.caches.filter(x=>x.city===c&&x.net===n.id),dem=R.demTo[n.id]||0,ok=dem>=n.cache.min;
  return `<div class="row">${logo(n)}<div class="grow"><div class="nm">${esc(n.cache.name)}</div><div class="meta">${tr('common.from_net',{net:esc(n.name)})} · ${have.length?`${trn('common.n_box',have.length)} · ${tr('city_panel.serving_v',{v:fmtG(have.reduce((a,x)=>a+(R.useCache[x.id]||0),0))})}`:tr('city_panel.100g_per_box')}</div>${!ok?`<div class="why">${tr('city_panel.needs_min_gbps_of_traffic_to',{min:n.cache.min,net:esc(n.name),now:dem.toFixed(1)})}</div>`:''}</div>
      ${have.length?btn(tr('common.remove'),'rmCache',{id:(have.find(x=>x.site==='b')||have[0]).id},'ghost sm'):''}${btn(have.length?tr('common.box'):tr('common.request'),'cache',{city:c,net:n.id},'sm',!ok)}</div>${S.pops[c].site2&&have.length?(()=>{const nb=have.filter(x=>x.site==='b').length,na=have.length-nb;return `<div class="seg site"><span class="meta">${tr('city_panel.boxes_a_in_a_b_in',{a:na,b:nb})}</span>${na?btn(tr('city_panel.move_one_to_b'),'cacheSite',{city:c,net:n.id,s:'b'},'ghost sm'):''}${nb?btn(tr('city_panel.move_one_to_a'),'cacheSite',{city:c,net:n.id,s:'a'},'ghost sm'):''}</div>`;})():''}`;}
// Caches you host first, then the ones you could ask for now, then the rest; a short page of those you do not have.
function peerCache(c){const bx=S.caches.filter(x=>x.city===c),cHas=n=>bx.some(x=>x.net===n.id),all=NETS.filter(n=>n.cache&&netKeep(n,cHas(n))),cOk=n=>(R.demTo[n.id]||0)>=n.cache.min,rest=all.filter(n=>!cHas(n)),req=rest.filter(cOk),off=req.concat(rest.filter(n=>!cOk(n)));
  return {sum:bx.length?`${trn('common.n_box',bx.length)} · ${fmtG(bx.reduce((a,x)=>a+(R.useCache[x.id]||0),0))}`:tr('common.none'),flags:req.length?[['worth',tr('peer_sections.n_to_request',{n:req.length})]]:[],tot:all.length,hit:all.length,
    lead:`<p class="lead">${tr('city_panel.cdns_put_free_cache_servers_inside')}</p>`,
    body:m=>m>1?(all.length?all.filter(cHas).concat(off.slice(0,pnN('cache',off.length,4))).map(n=>cacheRow(c,n)).join('')+pnMore('cache',off.length,n=>trn('hud_and_panels.n_more_networks',n),4):netNone()):req.slice(0,3).map(n=>cacheRow(c,n)).join('')};}
// Short titles once the summaries say the rest.
// A search that finds nothing in any section says so above them.
function peerTabHtml(c){const one=ixIdsIn(c).length<2,v=pnVet(),S3=[peerIx(c),peerPni(c),peerCache(c)];
  return netFilterHtml()+(netFiltered()&&S3.every(s=>!s.hit)?netNone():'')+portNote(c)+pnSec('ix',one?tr('common.internet_exchange'):tr('common.internet_exchanges'),S3[0])+pnSec('pni',v?tr('common.pnis'):tr('city_panel.private_interconnects_pni'),S3[1])+pnSec('cache',v?tr('common.caches'):tr('common.embedded_caches'),S3[2]);}
