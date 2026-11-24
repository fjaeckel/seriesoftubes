/* ---------- The Hyperscaler in the NOC dashboard (37-hyper.js and the 38-hyper-*.js files) ----------
   Only a Hyperscaler gets this tab ('cloud', right after the overview), so the classic dashboard keeps exactly its tabs.
   Tiles for the whole cloud, then four lists: every country it is live in, worst served first unless the player picks
   another order, with its front door and home region; every region with its load, power and the backlog it owes; the
   hauls from regions to front doors (got against wanted), fullest first; and every region pair: replication and AI
   training got against wanted, the backlog, and failover readiness (green when the replica has room and the backbone
   can carry the failover: hsFailInfo). All of it is read from S.hs and today's R.hs; the failover checks (a widest-path
   search each) are kept for the day's routing. A tap on a row flies to its city's Cloud tab. Above the lists, the plan
   (what runs out first, with its fix) and the calendar (93-ui/58-hyper-plan.js). */
Object.assign(LIST_PG,{hscc:[20,40],hsrg:[12,30],hshl:[12,30],hspr:[12,30]});
// The tab is in DTABS only while a Hyperscaler is open.
function hsDtabSync(){const i=DTABS.indexOf('cloud'),on=!!(S&&S.hs&&hyper());
  if(on&&i<0)DTABS.splice(1,0,'cloud');else if(!on&&i>=0)DTABS.splice(i,1);if(!on&&UI.dtab==='cloud')UI.dtab='overview';}
// Sort keys of the country list, each with its first direction: worst first, biggest first, richest first, A to Z.
const HNOC_SORT={q:1,users:-1,rev:-1,name:1};
const hnocSortOf=()=>{const o=UI.hnocSort||{},k=own(HNOC_SORT,o.k)?o.k:'q';return {k,d:o.d||HNOC_SORT[k]};};
const hnocTag=(cls,t)=>`<span class="tag ${cls}">${t}</span>`;
const hnocMore=(k,n)=>n>listN(k)?`<div class="btns" style="margin-top:6px">${btn(trn('hyper_noc.show_n_more',Math.min(listPg(k),n-listN(k))),'hsNocMore',{k},'ghost sm')}</div>`:'';
const hnocRow=(city,body,pc,bad)=>`<div class="row ihit hnocrow" data-act="hsNocGo" data-args='${JSON.stringify({city})}'><div class="grow">${body}</div>${pc===null?'':`<b class="num lpct"${bad?' style="color:var(--bad)"':''}>${pc}</b>`}</div>`;
const hnocFlags=f=>f.length?`<div class="hnocf">${f.join(' ')}</div>`:'';
// Failover per region to its replica, worked out once per routing (R) and day.
const HNOC_FO={R:null,day:-1,m:new Map()};
function hnocFail(a,b){if(HNOC_FO.R!==R||HNOC_FO.day!==S.day){HNOC_FO.R=R;HNOC_FO.day=S.day;HNOC_FO.m=new Map();}
  const k=a+'>'+b;let v=HNOC_FO.m.get(k);if(!v){v=hsLive(a)&&R.hs?hsFailInfo(a,b):null;HNOC_FO.m.set(k,v);}return v;}
function hnocCountries(){const H=S.hs;return Object.keys(H.cc).map(cc=>{const I=ccInfo(cc),q=hsQ(R,cc),o=R.hs&&R.hs.cc[cc];
  return {cc,I,nm:ccName(cc),d:H.cc[cc].d,q,rev:hsRev(R,cc),o,ms:o&&o.parts.length?Math.max(...o.parts.map(p=>p[2])):0};}).filter(r=>r.I);}
const hnocQLine=q=>q>=0.97?tr('hyper_noc.q_crisp'):q>=CX_GOOD?tr('hyper_noc.q_fine'):q>=0.75?tr('hyper_noc.q_soft'):tr('hyper_noc.q_bad');
function hnocTiles(rows,pr){const tile=(l,v,sub,bad)=>`<div class="tile"><div class="lbl">${l}</div><div class="val"${bad?' style="color:var(--bad)"':''}>${v}</div>${sub?`<div class="sub">${sub}</div>`:''}</div>`;
  const H=S.hs,o=R.hs,all=rows.reduce((a,r)=>a+r.d,0),q=hsServed(R),rs=Object.keys(H.rg);let used=0,max=0;for(const c of rs){used+=hsMwUsed(c);max+=hsSupply(c)-hsTown(c);}
  let bg=0,bw=0;if(o&&o.rep)for(const x of Object.values(o.rep)){bg+=x.got;bw+=x.want;}if(o&&o.jobs)for(const x of Object.values(o.jobs)){bg+=x.got;bw+=x.want;}
  const lag=Object.values(H.lag).reduce((a,v)=>a+v,0),fp=pr.filter(p=>p.fo.length),fr=fp.filter(p=>p.fo.every(x=>x.I&&x.I.ok)).length;
  return `<div class="dgrid hnoctiles">${tile(tr('hyper.users'),fmtG(all),trn('hyper_noc.in_n_countries',rows.length))}${tile(tr('hyper.quality'),pct(q),rows.length?hnocQLine(q):'',q<CX_GOOD)}`
    +`${tile(tr('hyper_noc.t_regions'),`${hsRgs().length}/${hsRgMax()}`,rs.length>hsRgs().length?tr('hyper_noc.n_not_live',{n:rs.length-hsRgs().length}):'')}${tile(tr('hyper_power.power'),tr('hyper_power.n_mw',{mw:Math.round(used)}),tr('hyper_noc.of_mw',{mw:Math.round(max)}),used>max)}`
    +`${tile(tr('hyper_traffic.between_regions'),fmtG(bg),tr('hyper_noc.of_g_wanted',{g:fmtG(bw)}),bg<bw*0.999)}${tile(tr('hyper_traffic.backlog'),hsTb(lag),lag>0?tr('hyper_noc.lag_risk'):tr('hyper_noc.lag_none'),lag>HS_RISK)}`
    +`${fp.length?tile(tr('hyper_noc.t_failover'),`${fr}/${fp.length}`,tr('hyper_noc.pairs_ready'),fr<fp.length):''}</div>`;}
function hnocCcSection(rows){const {k,d}=hnocSortOf(),val=r=>k==='name'?r.nm.toLowerCase():k==='users'?r.d:k==='rev'?r.rev:r.q;
  rows.sort((a,b)=>{const A=val(a),B=val(b);return (A<B?-1:A>B?1:0)*d||b.d-a.d||(a.cc<b.cc?-1:1);});
  let h=`<div class="panel2" id="hnocCc" style="margin-top:12px"><h3>${tr('hyper_noc.h_countries')} <span class="meta">${rows.length}</span></h3>`;
  if(!rows.length)return h+`<p class="empty">${tr('hyper_noc.e_countries')}</p></div>`;
  h+=listIntro(rows.length,tr('hyper_noc.intro'));
  h+=`<div class="seg" style="margin-bottom:6px">${[['q',tr('hyper_noc.sort_worst')],['users',tr('hyper.users')],['rev',tr('common.revenue')],['name',tr('common.name')]].map(([s,l])=>segB(l+(k===s?(d>0?' ▲':' ▼'):''),'hsNocSort',{k:s},k===s)).join('')}</div>`;
  h+=`<div class="ilist">`+rows.slice(0,listN('hscc')).map(r=>{const o=r.o,f=[],bad=r.q<CX_GOOD;
    f.push(hnocTag(bad?'restrictive':'open',bad?tr('hyper_noc.f_poor'):tr('hyper_noc.f_good')));
    if(o&&o.short>0.5)f.push(hnocTag('restrictive',tr('hyper_noc.f_no_room',{g:fmtG(o.short)})));
    if(o&&o.want-o.got>0.5)f.push(hnocTag('restrictive',tr('hyper_noc.f_haul',{g:fmtG(o.want-o.got)})));
    if(r.ms>HS_MS[0])f.push(hnocTag('selective',tr('hyper_noc.f_far',{ms:Math.round(r.ms)})));
    if(!hsResMet(r.cc))f.push(hnocTag('selective',tr('hyper_noc.f_law')));
    if(o&&o.v&&S.hs.edge[o.v])f.push(hnocTag('st',tr('hyper_noc.f_edge')));
    const way=o&&o.v?tr('hyper_noc.door_home',{door:esc(CITY[o.v].name),home:o.home?esc(CITY[o.home].name):'—'}):`<span class="hnoc-bad">${tr('hyper.no_door_yet')}</span>`;
    return hnocRow(r.I.main,`<div class="nm">${esc(r.nm)} <span class="meta">${esc(REG[r.I.reg]||'')}</span></div>
      <div class="meta">${tr('city_panel.a_of_b',{a:fmtG(r.d),b:fmtG(hsPot(r.cc))})} · ${tr('common.price_mo',{price:fmt$(r.rev)})}</div><div class="meta">${way}</div>
      ${hsBar(r.q,bad)}${hnocFlags(f)}`,pct(r.q),bad);}).join('')+`</div>`;
  return h+hnocMore('hscc',rows.length)+`</div>`;}
// Each region: load against its room, power against its grid, the slots, and the backlog it owes its replica.
function hnocRgSection(){const H=S.hs,o=R.hs,u=c=>{const x=o&&o.rg[c];return x&&x.g>0?x.load/x.g:0;};
  const cs=Object.keys(H.rg).sort((a,b)=>(hsOut(b)?1:0)-(hsOut(a)?1:0)||u(b)-u(a)||(a<b?-1:1));
  let h=`<div class="panel2" id="hnocRg" style="margin-top:12px"><h3>${tr('hyper_noc.h_regions')} <span class="meta">${hsRgN()}/${hsRgMax()}</span></h3><div class="ilist">`;
  for(const c of cs.slice(0,listN('hsrg'))){const d=H.rg[c],T=HS_T[d.t],x=o&&o.rg[c],live=hsLive(c),f=[],v=u(c),lag=hsLagAt(c),rep=hsRepOf(c),free=hsMwFree(c);
    if(d.ready>S.day)f.push(hnocTag('st',tr('hyper_ui.sum_building',{name:tr(T.n),date:dateStr(d.ready)})));
    if(H.dx&&H.dx.c===c)f.push(hnocTag('st on',tr('hyper_ui.f_drill')));else if(hsOut(c))f.push(hnocTag('restrictive',tr('hyper_ui.f_down')));
    if(live&&v>=0.95)f.push(hnocTag('restrictive',tr('hyper_ui.f_full')));
    if(hsCut(c)<1)f.push(hnocTag('restrictive',tr('hyper_ui.f_cut')));if(hsProt(c))f.push(hnocTag('restrictive',tr('hyper_ui.f_protest')));
    if(d.up)f.push(hnocTag('st',tr('hyper_ui.sum_building',{name:tr(HS_T[d.up.t].n),date:dateStr(d.up.ready)})));
    if(lag>HS_RISK)f.push(hnocTag('restrictive',tr('hyper_ui.f_backlog')));
    h+=hnocRow(c,`<div class="nm">🏢 ${esc(CITY[c].name)} <span class="meta">${tr(T.n)}</span></div>
      ${x?`<div class="meta">${tr('city_panel.a_of_b',{a:fmtG(x.load),b:fmtG(x.g)})} · ${tr('hyper.slots')} ${tr('city_panel.a_of_b',{a:hsSlotsUsed(c),b:hsSlots(c)})}</div>${hsBar(v,v>=0.95)}`:''}
      <div class="meta">⚡ ${tr('hyper_noc.power_line',{mw:+hsMwUsed(c).toFixed(1),grid:hsSupply(c),free:Math.floor(free)})}</div>
      ${rep?`<div class="meta${lag>0?' hnoc-bad':''}">🔁 ${tr('hyper_noc.backlog_to',{city:esc(CITY[rep].name),tb:hsTb(lag)})}</div>`:''}${hnocFlags(f)}`,live&&x?pct(v):null,v>=0.95);}
  return h+`</div>`+hnocMore('hsrg',cs.length)+`</div>`;}
// The hauls: what each front door was sent from each region, got against wanted, the fullest first.
function hnocHaulSection(){const o=R.hs,hl=(o&&o.hl)||{},rows=Object.keys(hl).map(k=>{const [r,v]=k.split('>');return {r,v,w:hl[k][0],g:hl[k][1]};}).filter(x=>x.w>0.01&&CITY[x.r]&&CITY[x.v]);
  rows.sort((a,b)=>(b.w-b.g)-(a.w-a.g)||b.w-a.w||(a.r+a.v<b.r+b.v?-1:1));
  let h=`<div class="panel2" id="hnocHl" style="margin-top:12px"><h3>${tr('hyper_noc.h_hauls')} <span class="meta">${rows.length}</span></h3>`;
  if(!rows.length)return h+`<p class="empty">${tr('hyper_noc.e_hauls')}</p></div>`;
  h+=`<div class="ilist">`+rows.slice(0,listN('hshl')).map(x=>{const short=x.w-x.g>0.5,f=x.w>0?x.g/x.w:1;
    return hnocRow(x.v,`<div class="nm">${esc(CITY[x.r].name)} → ${esc(CITY[x.v].name)}</div><div class="meta">${tr('city_panel.a_of_b',{a:fmtG(x.g),b:fmtG(x.w)})}${short?` · <span class="hnoc-bad">${tr('hyper.haul_short',{g:fmtG(x.w-x.g)})}</span>`:''}</div>${hsBar(f,short)}`,pct(f),short);}).join('')+`</div>`;
  return h+hnocMore('hshl',rows.length)+`</div>`;}
/* Region pairs: each pair a replica or a run joins. rep: replication each way that uses it, runs: training between them,
   fo: failover each way where one is the other's replica ({a, b, I}). */
function hnocPairs(){const o=R.hs,H=S.hs,m=new Map(),at=(a,b)=>{const k=hsPk(a,b);let p=m.get(k);if(!p)m.set(k,p={k,a:a<b?a:b,b:a<b?b:a,rep:[],runs:[],fo:[]});return p;};
  if(o&&o.rep)for(const a of Object.keys(o.rep).sort()){const x=o.rep[a];at(a,x.b).rep.push({a,...x});}
  if(o&&o.jobs)for(const id of Object.keys(o.jobs).sort()){const x=o.jobs[id];if(x.a&&x.b&&x.a!==x.b)at(x.a,x.b).runs.push({id,...x});}
  for(const p of m.values())for(const r of p.rep)if(H.rg[r.a])p.fo.push({a:r.a,b:r.b,I:hnocFail(r.a,r.b)});
  return [...m.values()];}
function hnocPairSection(pr){const H=S.hs,bad=p=>p.fo.some(x=>!(x.I&&x.I.ok))||p.rep.some(r=>(H.lag[hsLk(r.a,r.b)]||0)>0);
  pr.sort((x,y)=>(bad(y)?1:0)-(bad(x)?1:0)||(x.k<y.k?-1:1));
  let h=`<div class="panel2" id="hnocPr" style="margin-top:12px"><h3>${tr('hyper_noc.h_pairs')} <span class="meta">${pr.length}</span></h3>`;
  if(!pr.length)return h+`<p class="empty">${tr('hyper_noc.e_pairs')}</p></div>`;
  h+=`<p class="note" style="margin-top:0">${tr('hyper_noc.pairs_lead')}</p><div class="ilist">`+pr.slice(0,listN('hspr')).map(p=>{let b='',f=[];
    for(const r of p.rep){const lag=H.lag[hsLk(r.a,r.b)]||0,sh=r.got<r.want*0.999;
      b+=`<div class="meta${sh?' hnoc-bad':''}">🔁 ${tr('hyper_noc.rep_line',{a:esc(CITY[r.a].name),b:esc(CITY[r.b].name),got:fmtG(r.got),want:fmtG(r.want)})}${lag>0?' · '+tr('hyper_traffic.card_lag',{tb:hsTb(lag)}):''}</div>`;
      if(lag>HS_RISK)f.push(hnocTag('restrictive',tr('hyper_ui.f_backlog')));}
    if(p.runs.length){let g=0,w=0;for(const r of p.runs){g+=r.got;w+=r.want;}
      // A supercluster leg over its latency limit moves data that does not count (#475).
      const st=p.runs.map(r=>({r,j:H.jobs.concat(H.own).find(q=>q.id===r.id)})).find(({r,j})=>j&&j.grp&&r.got>1e-9&&r.ms>j.lim);
      b+=`<div class="meta${g<w*0.999||st?' hnoc-bad':''}">🤖 ${trn('hyper_noc.runs_line',p.runs.length,{got:fmtG(g),want:fmtG(w)})}${st?' · ⚠️ '+tr('hyper_super.leg_stalled_short',{ms:Math.round(st.r.ms*10)/10,lim:st.j.lim}):''}</div>`;
      if(st)f.push(hnocTag('restrictive',tr('hyper_super.f_stalled')));}
    for(const x of p.fo){const I=x.I,dd=H.drill[hsPk(x.a,x.b)];
      b+=`<div class="meta">🧯 ${I?(I.ok?`<span class="hnoc-ok">✅ ${tr('hyper_noc.fo_ready',{a:esc(CITY[x.a].name),b:esc(CITY[x.b].name)})}</span>`:`<span class="hnoc-bad">⚠️ ${tr('hyper_noc.fo_not_ready',{a:esc(CITY[x.a].name),b:esc(CITY[x.b].name),need:fmtG(I.need),room:fmtG(I.room),bw:fmtG(I.bw)})}</span>`):tr('hyper_noc.fo_not_live',{a:esc(CITY[x.a].name)})}${dd?' · '+tr('hyper_fail.drilled_on',{date:dateStr(dd)}):''}</div>`;
      f.push(I&&I.ok?hnocTag('open',tr('hyper_ui.f_ready')):hnocTag('restrictive',tr('hyper_ui.f_not_ready')));if(!dd)f.push(hnocTag('selective',tr('hyper_ui.f_undrilled')));}
    return hnocRow(p.a,`<div class="nm">${esc(CITY[p.a].name)} ⇄ ${esc(CITY[p.b].name)}</div>${b}${hnocFlags([...new Set(f)])}`,null,false);}).join('')+`</div>`;
  return h+hnocMore('hspr',pr.length)+`</div>`;}
function hsNocTab(){if(!S.hs||!hyper())return '';const rows=hnocCountries(),pr=hnocPairs();
  return hnocTiles(rows,pr)+`<p class="note">${tr('hyper_noc.map_legend')}</p>`+hpPlanSection()+hpCalSection()+hnocCcSection(rows)+hnocRgSection()+hnocPairSection(pr)+hnocHaulSection();}
