/* ---------- The Streaming service in the NOC dashboard (37-streaming.js) ----------
   Only a Streaming service gets this tab ('stream', right after the overview): every country it is live in, worst picture
   first unless the player picks another order, with where its viewers are served from; each origin with its load and the
   hauls it sends over your backbone (got against wanted); every Binge Box, emptiest first. All of it is read from S.cnt
   and today's R.cnt: nothing here routes or works out what compute() already did. A tap on a row flies to its city. */
Object.assign(LIST_PG,{cntcc:[20,40],cntbox:[15,30]});
// The tab is in DTABS only while a Streaming service is open, so the classic dashboard keeps exactly its tabs.
function dtabSync(){const i=DTABS.indexOf('stream'),on=!!(S&&S.cnt&&content());
  if(on&&i<0)DTABS.splice(1,0,'stream');else if(!on&&i>=0)DTABS.splice(i,1);if(!on&&UI.dtab==='stream')UI.dtab='overview';}
// Sort keys of the country list, each with its first direction: worst picture first, biggest first, A to Z.
const CNOC_SORT={q:1,subs:-1,rev:-1,name:1};
const cnocSortOf=()=>{const o=UI.cnocSort||{};return {k:own(CNOC_SORT,o.k)?o.k:'q',d:o.d||CNOC_SORT[own(CNOC_SORT,o.k)?o.k:'q']};};
// What one country pays this month: as cntRev(), for one country (bundled subscribers pay the ISP's wholesale price).
const ccRevOf=(cc,q)=>{const d=S.cnt.cc[cc].d;return (d-Math.min(d,bundG(cc))*bundCut(cc))*q*CNT_RATE*cntMul('rev',cc);};
const cqTag=q=>q>=0.9?'open':q>=0.75?'selective':'restrictive';
// A country's sources tonight, biggest first: [city, Gbps, km to its viewers, kind] where kind is box, origin or pop
// (a POP of yours an origin handed the traffic to, cold potato).
function ccSrc(cc){const o=R.cnt&&R.cnt.cc[cc];if(!o)return [];const m=new Map();
  for(const [c,g,km,ko] of o.parts){const x=m.get(c);if(x){x[1]+=g;continue;}m.set(c,[c,g,km,!ko&&!S.cnt.dc[c]?'box':S.cnt.dc[c]?'origin':'pop']);}
  return [...m.values()].sort((a,b)=>b[1]-a[1]||(a[0]<b[0]?-1:1));}
const SRC_ICO={box:'📦',origin:'🏛️',pop:'📡'};
function cnocRows(){const C=S.cnt,pr=premLive(),D=C.disp;return Object.keys(C.cc).map(cc=>{const I=ccInfo(cc),q=ccQ(R,cc),o=R.cnt&&R.cnt.cc[cc],src=ccSrc(cc);
  return {cc,I,nm:ccName(cc),d:C.cc[cc].d,q,rev:ccRevOf(cc,q),src,short:o?o.short:0,km:src.length?Math.min(...src.map(s=>s[2])):0,
    disp:D&&I.nets.some(([j])=>NETS[j].id===D.net)?NET[D.net]:null,prem:pr&&premIn(pr,I.reg)?pr:null,ev:evLiveAt(I.reg)};});}
// A funny word on the overall picture, from crisp to the spinning wheel.
const cnocQLine=q=>q>=0.97?tr('streaming_noc.q_crisp'):q>=0.9?tr('streaming_noc.q_fine'):q>=0.75?tr('streaming_noc.q_soft'):tr('streaming_noc.q_bad');
function cnocTiles(rows){const tile=(l,v,sub,bad)=>`<div class="tile"><div class="lbl">${l}</div><div class="val"${bad?' style="color:var(--bad)"':''}>${v}</div>${sub?`<div class="sub">${sub}</div>`:''}</div>`;
  const all=rows.reduce((a,r)=>a+r.d,0),q=all>0?rows.reduce((a,r)=>a+r.d*r.q,0)/all:1,sh=(R.cnt&&R.cnt.short)||0,rev=rows.reduce((a,r)=>a+r.rev,0);
  return `<div class="dgrid cnoctiles">${tile(tr('streaming.subscribers'),fmtSubs(all),trn('streaming_noc.in_n_countries',rows.length))}${tile(tr('streaming_noc.t_picture'),pct(q),rows.length?cnocQLine(q):'',q<0.9)}${tile(tr('common.revenue'),tr('common.price_mo',{price:fmt$(rev)}))}${tile(tr('streaming_noc.t_onnet'),pct(onNet(R)),tr('streaming_noc.onnet_sub'))}${tile(tr('streaming_noc.t_short'),fmtG(sh),sh>0.5?tr('streaming_noc.short_bad'):tr('streaming_noc.short_ok'),sh>0.5)}</div>`;}
const cnocTag=(cls,t)=>`<span class="tag ${cls}">${t}</span>`;
function cnocFlags(r){const f=[cnocTag(cqTag(r.q),r.q>=0.9?tr('streaming_noc.f_crisp'):tr('streaming_noc.f_buffering'))];
  if(r.short>0.5)f.push(cnocTag('restrictive',tr('streaming_noc.f_short',{g:fmtG(r.short)})));
  if(r.km>CNT_FAR[0])f.push(cnocTag('selective',tr('streaming_noc.f_far',{km:Math.round(r.km).toLocaleString()})));
  if(r.disp)f.push(cnocTag('restrictive',tr('streaming_noc.f_dispute',{net:esc(r.disp.name)})));
  if(r.prem)f.push(cnocTag('st on',r.prem.live?tr('streaming_noc.f_live'):tr('streaming_noc.f_premiere')));else if(r.ev)f.push(cnocTag('st on',tr('streaming_noc.f_live')));
  return f.join(' ');}
const cnocMore=(k,n)=>n>listN(k)?`<div class="btns" style="margin-top:6px">${btn(trn('streaming_noc.show_n_more',Math.min(listPg(k),n-listN(k))),'cntNocMore',{k},'ghost sm')}</div>`:'';
function cnocCountries(rows){const {k,d}=cnocSortOf(),val=r=>k==='name'?r.nm.toLowerCase():k==='subs'?r.d:k==='rev'?r.rev:r.q;
  rows.sort((a,b)=>{const A=val(a),B=val(b);return (A<B?-1:A>B?1:0)*d||b.d-a.d||(a.cc<b.cc?-1:1);});
  let h=`<div class="panel2" id="cnocCc" style="margin-top:12px"><h3>${tr('streaming_noc.h_countries')} <span class="meta">${rows.length}</span></h3>`;
  if(!rows.length)return h+`<p class="empty">${tr('streaming_noc.e_countries')}</p></div>`;
  h+=listIntro(rows.length,tr('streaming_noc.intro'));
  h+=`<div class="seg" style="margin-bottom:6px">${[['q',tr('streaming_noc.sort_worst')],['subs',tr('streaming.subscribers')],['rev',tr('common.revenue')],['name',tr('common.name')]].map(([s,l])=>segB(l+(k===s?(d>0?' ▲':' ▼'):''),'cntNocSort',{k:s},k===s)).join('')}</div>`;
  h+=`<div class="ilist">`+rows.slice(0,listN('cntcc')).map(r=>{const from=r.src.slice(0,3).map(([c,g,km,kd])=>`${SRC_ICO[kd]} ${esc(CITY[c].name)} ${fmtG(g)} · ${Math.round(km).toLocaleString()} km`).join(', ');
    return `<div class="row ihit cnocrow" data-act="cntNocGo" data-args='{"city":"${r.I.main}"}'><div class="grow"><div class="nm">${esc(r.nm)} <span class="meta">${esc(REG[r.I.reg]||'')}</span></div>
    <div class="meta">${tr('streaming_noc.subs_of_max',{subs:fmtSubs(r.d),max:fmtSubs(ccPot(r.cc))})} · ${tr('common.price_mo',{price:fmt$(r.rev)})}</div>
    <div class="meta">${from?tr('streaming_noc.from_list',{list:from}):`<span style="color:var(--bad)">${tr('streaming_noc.from_nowhere')}</span>`}</div>
    <div class="bar ${r.q<0.9?'bad':''}"><i style="width:${Math.round(r.q*100)}%"></i></div><div class="cnocf">${cnocFlags(r)}</div></div><b class="num lpct"${r.q<0.9?' style="color:var(--bad)"':''}>${pct(r.q)}</b></div>`;}).join('')+`</div>`;
  return h+cnocMore('cntcc',rows.length)+`</div>`;}
// Each origin: its load against its size, and what it hauls over your backbone to the POPs nearest the viewers.
function cnocOrigins(){const C=S.cnt,hj=(R.cnt&&R.cnt.hj)||[],cs=Object.keys(C.dc).sort((a,b)=>((R.cnt&&R.cnt.org[b])||0)/dcG(b)-((R.cnt&&R.cnt.org[a])||0)/dcG(a)||(a<b?-1:1));
  let h=`<div class="panel2" id="cnocOrg" style="margin-top:12px"><h3>${tr('streaming_noc.h_origins')} <span class="meta">${dcN()}/${dcMax()}</span></h3><div class="ilist">`;
  for(const c of cs){const d=C.dc[c],T=DC_T[d.t],live=dcLive(c),load=(R.cnt&&R.cnt.org[c])||0,u=T.g>0?load/T.g:0,hs=new Map();
    for(const J of hj)if(J.o===c){const x=hs.get(J.v)||[0,0];x[0]+=J.x;x[1]+=J.got||0;hs.set(J.v,x);}
    const hl=[...hs.entries()].sort((a,b)=>(b[1][0]-b[1][1])-(a[1][0]-a[1][1])||b[1][0]-a[1][0]);
    let st='';if(d.ready>S.day)st=`<div class="meta">${tr('streaming.being_built_live_on',{name:tr(T.n),date:dateStr(d.ready)})}</div>`;
    else if(!cntOut(c))st=`<div class="why">${tr('streaming.no_way_out')}</div>`;else if(live&&load<0.01)st=`<div class="meta">${tr('streaming_noc.o_idle')}</div>`;
    if(d.up)st+=`<div class="meta">${tr('streaming.being_built_live_on',{name:tr(DC_T[d.up.t].n),date:dateStr(d.up.ready)})}</div>`;
    const haul=hl.length?`<div class="meta">${tr('streaming_noc.hauls')}: ${hl.slice(0,4).map(([v,[w,g]])=>`<span${w-g>0.5?' style="color:var(--bad)"':''}>→ ${esc(CITY[v].name)} ${tr('city_panel.a_of_b',{a:fmtG(g),b:fmtG(w)})}</span>`).join(' · ')}${hl.length>4?' · '+tr('dashboard.n_more',{n:hl.length-4}):''}</div>`:live&&load>0.01?`<div class="meta">${tr('streaming_noc.haul_none')}</div>`:'';
    const full=hl.some(([,[w,g]])=>w-g>0.5);
    h+=`<div class="row ihit cnocrow" data-act="cntNocGo" data-args='{"city":"${c}"}'><div class="grow"><div class="nm">🏛️ ${esc(CITY[c].name)} <span class="meta">${tr(T.n)}</span></div>
    ${live?`<div class="meta">${tr('city_panel.a_of_b',{a:fmtG(load),b:fmtG(T.g)})}</div><div class="bar ${barCls(u)}"><i style="width:${Math.min(100,Math.round(u*100))}%"></i></div>`:''}${st}${haul}${full||u>=0.95?`<div class="cnocf">${u>=0.95?cnocTag('restrictive',tr('streaming_noc.f_origin_full')):''} ${full?cnocTag('restrictive',tr('streaming_noc.f_backbone_full')):''}</div>`:''}</div>${live?`<b class="num lpct">${pct(u)}</b>`:''}</div>`;}
  return h+`</div></div>`;}
// Binge Boxes, one row per network and city: emptiest first, then the busiest.
function cnocBoxes(){const C=S.cnt,g=new Map();for(const b of C.box){const k=b.city+'|'+b.net;let x=g.get(k);if(!x)g.set(k,x={city:b.city,net:b.net,bs:[]});x.bs.push(b);}
  const rows=[...g.values()].map(x=>({...x,f:x.bs.reduce((a,b)=>a+b.f,0)/x.bs.length,use:x.bs.reduce((a,b)=>a+(R.useCache[b.id]||0),0)}));
  rows.sort((a,b)=>a.f-b.f||b.use-a.use||(a.city+a.net<b.city+b.net?-1:1));
  let h=`<div class="panel2" id="cnocBox" style="margin-top:12px"><h3>${tr('streaming.binge_boxes')} <span class="meta">${C.box.length}</span></h3>`;
  if(!rows.length)return h+`<p class="empty">${tr('streaming_noc.e_boxes')}</p></div>`;
  const D=C.disp;
  h+=`<div class="ilist">`+rows.slice(0,listN('cntbox')).map(r=>{const n=NET[r.net],fee=boxHost(n),hold=boxHit(r.city)*r.f,f=[];
    if(r.f<1)f.push(cnocTag('selective',tr('streaming_noc.f_filling',{p:pct(r.f)})));
    if(r.use<0.01)f.push(cnocTag('restrictive',tr('streaming_noc.f_idle')));
    if(D&&D.net===r.net)f.push(cnocTag('restrictive',tr('streaming_noc.f_dispute',{net:esc(n.name)})));
    return `<div class="row ihit cnocrow" data-act="cntNocGo" data-args='{"city":"${r.city}"}'>${logo(n)}<div class="grow"><div class="nm">${esc(n.name)} <span class="meta">📦 ${esc(CITY[r.city].name)}</span></div>
    <div class="meta">${trn('common.n_box',r.bs.length)} · ${tr('city_panel.serving_v',{v:fmtG(r.use)})} · ${tr('streaming.hit_p',{p:pct(hold)})} · ${fee?tr('streaming.hosting_fee_mo',{fee:fmt$(fee)}):tr('streaming.hosted_free')}</div>
    <div class="bar ${r.f<0.5?'warn':''}"><i style="width:${Math.round(r.f*100)}%"></i></div>${f.length?`<div class="cnocf">${f.join(' ')}</div>`:''}</div><b class="num lpct">${pct(r.f)}</b></div>`;}).join('')+`</div>`;
  return h+cnocMore('cntbox',rows.length)+`</div>`;}
function cntNocTab(){if(!S.cnt||!content())return '';const rows=cnocRows();
  return cnocTiles(rows)+`<p class="note">${tr('streaming_noc.map_legend')}</p>`+cnocCountries(rows)+cnocOrigins()+cnocBoxes();}
