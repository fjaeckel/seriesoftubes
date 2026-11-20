/* ================= MULTIPLAYER GAMEPLAY: a Hyperscaler among players (37-hyper.js) =================
   A Hyperscaler depends on other networks for reach, so in multiplayer the other players are its partners. Everything
   here rides the deal machinery of 89-fedplay-deals.js (§5.3, §10.10): published terms, requests that bind at once or
   wait for review, deals in S.fed.deals, money that never moves between saves.

   Its published policy (hsfPDef): open peering, free PNIs from 10G per site on 100G ports, automatic peering and PNIs,
   on-ramp ports sold into its regions, and never transit: no card, every transit request declined (hsfNoTransit and
   the checks in fedPlayDeal, fedTheirMiss, fedAcceptRq). Its traffic is fairly balanced (hsfMix: a little content, the
   rest tenants and replication both ways), so ratio-minded players take it. It can buy transit like anyone.

   Two deals of feature cloud (every joined server must list it, fedCloud; older servers never see these terms):
   - edge: front-door servers inside a home-ISP player's network, in a city it sells broadband in, on the host's card
     (rates.edge: free or a fee per node, a cap per city). Host's game: a rank-0 exit for the Hyperscaler's network, like an
     embedded cache: the static share (HS_EDGE) of what its customers ask of the Hyperscaler leaves there instead of
     over transit. Hyperscaler's game: the users behind that host in that country get their static share served in the
     host's network (no haul, no front door) and their connections end at the node (hsfEdgeCut).
   - onramp: a private port into one of the Hyperscaler's regions (rates.onramp). Buyer's game: an exit to the
     Hyperscaler at that region, and its own on-ramp customers that end there pay a cloud premium (hsfRampPrem); new
     ones call for it (hsfRampDay). Hyperscaler's game: earns the port, and counts the buyer's cities as reached for
     Indirect Connect tenants (hsfRamp).
   Both sides compute each deal from the published terms (fedDeal); the buyer reports what crossed (stats traffic,
   hsfRep), which the seller keeps as the deal's rep.

   Users behind player home ISPs (hsfPlayers, hsfNets): a player whose traffic is mostly eyeballs takes a share of the
   users of its home country (and of each country it hosts an edge node in), from its published mix, so peering, PNIs
   and edge nodes with it carry real users.

   Solo stand-ins: computer-run home ISPs host edge nodes on fixed terms (S.hs.ne, the Cloud tab: HSF_NPC_MO a node, ready
   in HSF_NPC_DAYS days, HSF_NPC_CAP per city and ISP); waves come from computer-run carriers (leased waves on any
   link), consortium seats from the seat offers. Players are cheaper (a host's fee is capped at HSF_NPC_MO) and faster
   (automatic deals bind at once); never required. A Hyperscaler cannot buy anyone's network: no deal hands one over. */
const HSF_EDGE_G=100,HSF_NPC_MO=1500,HSF_NPC_DAYS=30,HSF_NPC_CAP=2,HSF_NE_MAX=64,HSF_HOST_MAX=0.5,HSF_RAMP_PREM=0.25,HSF_RAMP_ODDS=12,HSF_RAMP_MAX=3;
// A save that signed the Hyperscaler charter (as charter() reads it, for any save, not only the open one).
const hsfIs=s=>!!s&&s.charter==='hyper'&&s.mode==='normal'&&!s.scn;
// Every joined server takes cloud records (§9.3 feats): only then do terms and requests of these two deals go out.
const fedCloud=(s=S)=>{const f=s&&s.fed,m=FED.cloud||{};return !!f&&f.servers.length>0&&f.servers.every(u=>m[u]===true);};

/* ---------- the published policy ---------- */
function hsfPDef(o){o.pol='open';
  o.rates={pni:{setup:0,ports:[{mbps:10000,monthly:0},{mbps:100000,monthly:0}],term:365},onramp:{ports:[{mbps:10000,monthly:2500},{mbps:100000,monthly:15000}],term:90}};
  Object.assign(o.auto,{peering:'auto',transit:'decline',pni:'auto',swap:'review',consortium:'review',port:'review',wave:'review',cofound:'review',edge:'decline',onramp:'auto'});return o;}
function hsfNoTransit(P){delete P.rates.transit;delete P.rates.edge;P.auto.transit='decline';P.auto.edge='decline';return P;}
// The card as published: a host lists the cities it sells broadband in, a Hyperscaler its live regions; never transit.
function hsfRatesOut(r){const hy=hyper(),cl=fedCloud();if(hy){delete r.transit;delete r.edge;}else delete r.onramp;
  if(r.edge){const at=cl?Object.keys(S.pops).filter(c=>S.pops[c].bb&&fedCityOk(c)).sort().slice(0,64):[];if(at.length)r.edge={at,...r.edge};else delete r.edge;}
  if(r.onramp){const at=cl?hsRgs().filter(fedCityOk).slice(0,16):[];if(at.length)r.onramp={at,...r.onramp};else delete r.onramp;}}
/* Some content (what users fetch), the rest tenants, replication and ingest going both ways: within 3:1 of a pure
   eyeball network (the ratio fedPair reads from the two mixes), so a ratio-minded home ISP peers with it. */
const hsfMix=()=>({content:150,eyeball:0,enterprise:850});

/* ---------- users behind player home ISPs ---------- */
// The share of a country's users a player's eyeball network has: 5% plus up to a quarter, by its published mix.
const hsfHostSh=N=>N&&N.fmix&&N.fmix[1]>=300?0.05+0.25*N.fmix[1]/1000:0;
// Player home ISPs by country: Map cc -> [[NETS index, share]]. Its home country, and each one it hosts an edge node in.
function hsfPlayers(){const M=new Map();if(!S.fed||!FEDN.ids.length)return M;
  const edge=new Map();for(const d of S.fed.deals)if(d.on&&d.deal==='edge'&&d.role==='buy'&&CITY[d.terms.at]){const s=edge.get(d.key)||new Set();s.add(CITY[d.terms.at].cc);edge.set(d.key,s);}
  for(let j=0;j<NETS.length;j++){const N=NETS[j];if(!N.fed||N.fst==='dark')continue;const sh=hsfHostSh(N);if(!sh)continue;
    for(const cc of new Set([N.home,...(edge.get(N.fed)||[])])){if(!M.has(cc))M.set(cc,[]);M.get(cc).push([j,sh]);}}
  return M;}
// A country's home ISPs with the players in: the players take their shares (at most HSF_HOST_MAX together), the rest shrink.
function hsfNets(I,PN){const pl=PN.get(I.cc);if(!pl)return I.nets;const t=pl.reduce((a,x)=>a+x[1],0),k=Math.min(1,HSF_HOST_MAX/t),f=1-t*k;
  return I.nets.map(([j,w])=>[j,w*f]).concat(pl.map(([j,sh])=>[j,sh*k]));}

/* ---------- edge nodes in the Hyperscaler's game ---------- */
/* What edge nodes in partner networks serve of a country's users tonight (D Gbps): the users behind each host (its share
   in nets) get their static share served at its nodes, up to the nodes' capacity. Gives {st (Gbps served there), u (users
   behind hosts with nodes), parts (for quality: served in full, at the users' own way to the node)} or null; out.fe
   keeps what each deal (and each computer-run host, 'npc:<city>|<net>') served. */
function hsfEdgeCut(cc,D,nets,out){const H=S.hs,by=new Map(),put=(id,c,key,g)=>{let h=by.get(id);if(!h)by.set(id,h={c,cap:0,keys:[]});h.cap+=g;h.keys.push([key,g]);};
  for(const x of H.ne)if(x.ready<=S.day&&CITY[x.c]&&CITY[x.c].cc===cc&&NET[x.net])put(x.net,x.c,'npc:'+x.c+'|'+x.net,HSF_EDGE_G);
  if(S.fed)for(const d of S.fed.deals){if(!d.on||d.deal!=='edge'||d.role!=='buy'||!CITY[d.terms.at]||CITY[d.terms.at].cc!==cc)continue;const n=fedNetOf(d.key);if(!n||n.fst==='dark')continue;put(n.id,d.terms.at,d.id,d.terms.nodes*HSF_EDGE_G);}
  if(!by.size)return null;const W=new Map();for(const [j,w] of nets)W.set(NETS[j].id,(W.get(NETS[j].id)||0)+w);
  const I=ccInfo(cc),o={st:0,u:0,parts:[]};out.fe=out.fe||{};
  for(const [id,h] of [...by].sort((a,b)=>a[0]<b[0]?-1:1)){const w=W.get(id)||0;if(w<=0)continue;const U=D*w,x=Math.min(U*HS_EDGE,h.cap);if(x<=1e-9)continue;o.st+=x;o.u+=U;
    o.parts.push([h.c,x,hsAcc(h.c,I.main),null,1]);for(const [k,g] of h.keys)out.fe[k]=(out.fe[k]||0)+x*g/h.cap;}
  return o.parts.length?o:null;}
// Computer-run edge nodes cost every month (CX_COST).
const hsfNpcCost=()=>S.hs&&S.hs.ne?S.hs.ne.length*HSF_NPC_MO:0;

/* ---------- on-ramps ---------- */
// The Hyperscaler's game: a player bought an on-ramp into a live region and has a POP in city c (Indirect Connect
// tenants there count as reached).
function hsfRamp(c){const f=S.fed;if(!f)return false;
  for(const d of f.deals){if(!d.on||d.deal!=='onramp'||d.role!=='sell'||!hsLive(d.terms.at))continue;const n=fedNetOf(d.key);if(n&&n.fst!=='dark'&&(n.fpops||[]).includes(c))return true;}return false;}
// The buyer's game: its on-ramp customers that end at the port's city, as much of them as the port carries.
function hsfRampUse(d){const T=d.terms,cap=T.mbps/1000,out=[];let g=0;
  for(const b of S.biz){if(b.type!=='onramp'||b.city!==T.at&&b.city2!==T.at||g>=cap)continue;const t=Math.min(b.bw,cap-g);g+=t;out.push([b,t]);}return {g,bs:out};}
// What they pay on top a month: the cloud premium on what goes through the port.
function hsfRampPrem(d){let v=0;for(const [b,t] of hsfRampUse(d).bs)v+=bizMo(b)*t/(b.bw||1)*HSF_RAMP_PREM;return Math.round(v);}
// Mbps this game reports of its edge nodes and on-ramp ports with player key k (the buyer reports, §10).
function hsfRep(k){let m=0;if(!S.fed)return 0;const fe=R&&R.hs&&R.hs.fe;
  for(const d of S.fed.deals){if(!d.on||d.key!==k||d.role!=='buy')continue;if(d.deal==='edge'&&fe)m+=(fe[d.id]||0)*1000;else if(d.deal==='onramp')m+=hsfRampUse(d).g*1000;}
  return Math.round(m);}
/* The day (from fedPlayDay): an on-ramp bought makes its own customers call. Now and then one of them wants a circuit to
   the port's city, named after the Hyperscaler, while there are fewer than HSF_RAMP_MAX such offers. */
function hsfRampDay(){const f=S.fed;if(!f||hyper())return;
  for(const d of f.deals){if(!d.on||d.deal!=='onramp'||d.role!=='buy'||!popUp(d.terms.at))continue;const n=fedNetOf(d.key);if(!n)continue;
    if(hstr(d.id+'|ramp|'+S.day)%HSF_RAMP_ODDS!==0||S.offers.filter(o=>o.type==='onramp'&&o.city2===d.terms.at).length>=HSF_RAMP_MAX)continue;
    const from=Object.keys(S.pops).filter(c=>c!==d.terms.at&&popUp(c)&&bizCity(c)).sort();if(!from.length)continue;
    const T=BIZ_T.onramp,city=from[hstr(d.id+S.day)%from.length],bw=Math.min(T.opts[0],d.terms.mbps/1000);
    S.offers.push({id:uid(),city,city2:d.terms.at,name:tr('hyper_fed.ramp_name',{net:n.name}),type:'onramp',bw,rate:Math.round((150+kmBetween(city,d.terms.at)*0.08)*T.km),reqs:[],exp:S.day+40});
    toast(tr('hyper_fed.ramp_call',{net:esc(n.name),city:esc(CITY[city].name)}),'goal');}}

/* ---------- the deals: exits, requests, the other side's checks ---------- */
// Exits a running deal gives (fedDealExits): the host's node (rank 0), the on-ramp port on both sides.
function hsfExit(d,n,out,k,one){const T=d.terms;
  if(d.deal==='edge'){if(d.role==='sell')out.push({k:'c',id:k,city:T.at,cap:T.nodes*HSF_EDGE_G,lab:labOf(N_('hyper_fed.ex_edge'),'net',n.name),net:n.id,set:one});}
  else out.push({k:'p',id:k,city:T.at,cap:T.mbps/1000,lab:labOf(d.role==='buy'?N_('hyper_fed.ex_ramp'):N_('hyper_fed.ex_ramp_sold'),'net',n.name),net:n.id,set:one});}
// The host's game: networks whose static share may leave at an edge node it hosts (compute()): NET id -> share. Null: none.
function hsfEdgeNets(){let M=null;for(const d of S.fed.deals){if(!d.on||d.deal!=='edge'||d.role!=='sell'||!popUp(d.terms.at))continue;const n=fedNetOf(d.key);if(!n||n.fst==='dark')continue;(M||(M=new Map())).set(n.id,HS_EDGE);}return M;}
// Edge nodes already placed (or asked for) with host key at city c.
const hsfNodes=(key,c,role)=>S.fed?S.fed.deals.filter(d=>d.deal==='edge'&&d.key===key&&d.terms.at===c&&d.st!=='over'&&d.role===role).reduce((a,d)=>a+d.terms.nodes,0):0;
/* An edge or on-ramp request on player n's card R0 (fedOffer). o: {at, nodes (edge), mbps (on-ramp), term}. Gives
   {terms, miss} or {miss} alone when there is nothing to ask for. */
function hsfOffer(deal,n,R0,o){const miss=[];if(!fedCloud())miss.push({l:'cloud'});
  if(deal==='edge'){const r=R0.edge;if(!r||!hyper())return {miss:[{l:'terms'}]};
    const at=o.at&&r.at.includes(o.at)?o.at:r.at.find(c=>CITY[c]&&S.hs.cc[CITY[c].cc])||r.at[0],nodes=fedInt(+o.nodes,1,16,1);
    if(!CITY[at]||!S.hs.cc[CITY[at].cc])miss.push({l:'launch'});if(!hsRgs().length)miss.push({l:'region'});
    if(hsfNodes(n.fed,at,'buy')+nodes>r.cap)miss.push({l:'cap',n:r.cap});
    return {miss,terms:{at,nodes,monthly:r.monthly,term:Math.max(r.term,fedInt(o.term,1,3650,0))}};}
  const r=R0.onramp;if(!r||hyper())return {miss:[{l:'terms'}]};
  const at=o.at&&r.at.includes(o.at)?o.at:r.at.find(c=>S.pops[c])||r.at[0],port=r.ports.find(x=>x.mbps===fedInt(o.mbps,1,1e9,0))||r.ports[0];
  if(!S.pops[at])miss.push({l:'pop'});
  return {miss,terms:{at,mbps:port.mbps,monthly:port.monthly,term:Math.max(r.term,fedInt(o.term,1,3650,0))}};}
// What a request for an edge node or an on-ramp from player `from` misses in this game (the seller's).
function hsfTheirMiss(s,b,from){const T=b.terms,P=fedP(s),miss=[];
  if(b.deal==='edge'){const r=P.rates.edge;if(!r||hsfIs(s))return [{l:'terms'}];if(!s.pops[T.at]||!s.pops[T.at].bb)miss.push({l:'bb'});
    const have=s.fed.deals.filter(d=>d.deal==='edge'&&d.key===from&&d.terms.at===T.at&&d.st!=='over'&&d.role==='sell').reduce((a,d)=>a+d.terms.nodes,0);
    if(have+T.nodes>r.cap)miss.push({l:'cap',n:r.cap});}
  else{if(!hsfIs(s)||!s.hs||!s.hs.rg[T.at]||!(s.hs.rg[T.at].ready<=s.day)||!s.pops[T.at])miss.push({l:'region'});}
  return miss;}

/* ---------- computer-run stand-ins: edge nodes at computer-run home ISPs ---------- */
// The computer-run home ISPs of city c's country (biggest first), where an edge node can go: [[net id, share]].
const hsfNpcHosts=c=>{const I=CITY[c]&&ccInfo(CITY[c].cc);return I?I.nets.filter(([j])=>!NETS[j].fed).sort((a,b)=>b[1]-a[1]||(NETS[a[0]].id<NETS[b[0]].id?-1:1)).slice(0,3).map(([j,w])=>[NETS[j].id,w]):[];};
const hsfNpcN=(c,net)=>S.hs.ne.filter(x=>x.c===c&&x.net===net).length;
// A day (CX_DAY): computer-run nodes switch on; on-ramp customers call.
function hsfDay(d){for(const x of S.hs.ne)if(x.ready===d&&NET[x.net])toast(tr('hyper_fed.npc_live',{net:esc(NET[x.net].name),city:esc(CITY[x.c].name)}),'good',[],{a:'city',v:x.c});}
CX_NEW.push(o=>{o.ne=[];});
// Saves: every computer-run node a real city and a computer-run home ISP of its country, at most the cap each.
CX_SAN.push((h0,o)=>{o.ne=[];const L=Array.isArray(h0.ne)?h0.ne:[];
  for(const x of L.slice(0,HSF_NE_MAX)){if(!x||typeof x!=='object'||!isCity(x.c)||typeof x.net!=='string'||!NET[x.net]||NET[x.net].fed)continue;const I=ccInfo(CITY[x.c].cc);
    if(!I||!I.nets.some(([j])=>NETS[j].id===x.net)||o.ne.filter(y=>y.c===x.c&&y.net===x.net).length>=HSF_NPC_CAP)continue;
    o.ne.push({c:x.c,net:x.net,ready:Number.isFinite(+x.ready)?Math.max(0,Math.round(+x.ready)):0});}});
CX_COST.push(hsfNpcCost);CX_DAY.push(hsfDay);

/* ---------- the interface ---------- */
// The terms of an edge or on-ramp deal in a few words (fedTermsText).
function hsfTermsText(deal,T){if(deal==='edge')return trn('hyper_fed.t_edge',T.nodes,{at:fpCity(T.at),price:T.monthly?fmt$(T.monthly):tr('hyper_fed.free'),d:T.term});
  return tr('hyper_fed.t_onramp',{port:fpSpeed(T.mbps),at:fpCity(T.at),price:fmt$(T.monthly),n:T.term});}
// A deal's row, what the buyer reported, for the seller's books.
const hsfRepLine=d=>(d.deal==='edge'||d.deal==='onramp')&&d.role==='sell'&&d.st==='run'?`<div class="meta">${tr('hyper_fed.they_report',{g:fmtG((d.rep||0)/1000)})}</div>`:'';
// A player's published edge and on-ramp cards (fedNetModal).
function hsfCardLines(R0){let h='';const e=R0.edge,o=R0.onramp;
  if(e)h+=`<p class="meta">${tr('hyper_fed.rate_edge',{price:e.monthly?fmt$(e.monthly):tr('hyper_fed.free'),cap:e.cap,n:e.term,at:e.at.slice(0,4).map(fpCity).join(', ')+(e.at.length>4?' …':'')})}</p>`;
  if(o)h+=`<p class="meta">${tr('hyper_fed.rate_onramp',{at:o.at.map(fpCity).join(', '),n:o.term})} ${o.ports.map(x=>`${fpSpeed(x.mbps)} ${tr('common.price_mo',{price:fmt$(x.monthly)})}`).join(' · ')}</p>`;
  return h;}
// What can be asked of player key: an edge node (a Hyperscaler, of a host), an on-ramp (anyone else, of a Hyperscaler).
function hsfAsks(key,R0,sel,ask){
  if(R0.edge&&hyper()){const E=R0.edge,o={at:sel['edge.at']||E.at.find(c=>CITY[c]&&S.hs.cc[CITY[c].cc])||E.at[0],nodes:+sel['edge.nodes']||1};
    ask('edge',o,fpSel(tr('fedplay.where'),'edge.at',E.at.map(c=>[c,fpCity(c)]),o.at)+fpSel(tr('hyper_fed.nodes'),'edge.nodes',Array.from({length:E.cap},(_,i)=>[i+1,String(i+1)]),o.nodes),
      `<p class="meta">${tr('hyper_fed.edge_ask_note',{p:pct(HS_EDGE),g:fmtG(HSF_EDGE_G),npc:fmt$(HSF_NPC_MO)})}</p>`);}
  if(R0.onramp&&!hyper()){const Q=R0.onramp,o={at:sel['onramp.at']||Q.at.find(c=>S.pops[c])||Q.at[0],mbps:+sel['onramp.mbps']||Q.ports[0].mbps};
    ask('onramp',o,fpSel(tr('hyper_fed.region'),'onramp.at',Q.at.map(c=>[c,fpCity(c)]),o.at)+fpSel(tr('fedplay.port'),'onramp.mbps',Q.ports.map(x=>[x.mbps,fpSpeed(x.mbps)]),o.mbps),
      `<p class="meta">${tr('hyper_fed.onramp_ask_note',{p:pct(HSF_RAMP_PREM)})}</p>`);}}
/* Your terms: hosting edge nodes (a home ISP) or the on-ramp card (a Hyperscaler, who never sells transit). Fields
   ed.on, ed.price, ed.cap, ed.term; or.on, or.m0, or.m1, or.term. Gives true when it was one of these. */
function hsfTermsEdit(D,f,v,on,n){const hy=hyper();
  if(f==='ed.on'&&!hy){if(on)D.rates.edge=D.rates.edge||{monthly:0,cap:2,term:90};else delete D.rates.edge;return true;}
  if(f==='ed.price'&&D.rates.edge){D.rates.edge.monthly=Math.min(HSF_NPC_MO,n(v));return true;}
  if(f==='ed.cap'&&D.rates.edge){D.rates.edge.cap=clamp(n(v),1,16);return true;}
  if(f==='ed.term'&&D.rates.edge&&FEDP_TERMS.includes(+v)){D.rates.edge.term=+v;return true;}
  if(f==='or.on'&&hy){if(on)D.rates.onramp=D.rates.onramp||hsfPDef(fedPNew()).rates.onramp;else delete D.rates.onramp;return true;}
  if(/^or\.m[01]$/.test(f)&&D.rates.onramp){const p=D.rates.onramp.ports[+f.slice(-1)];if(p)p.monthly=Math.min(1e9,n(v));return true;}
  if(f==='or.term'&&D.rates.onramp&&FEDP_TERMS.includes(+v)){D.rates.onramp.term=+v;return true;}
  return f==='tr.on'&&hy;}
function hsfTermsHtml(r,inp,sel,yn,terms){const cl=fedCloud()?'':`<p class="note">${tr('hyper_fed.cloud_wait_servers')}</p>`;
  if(hyper()){let h=`<h3 class="fp-sub">${tr('hyper_fed.your_onramps')}</h3><div class="trsel fp-grid"><label>${tr('fedplay.sell')} ${yn('or.on',!!r.onramp)}</label>`;
    if(r.onramp)h+=`${r.onramp.ports.slice(0,2).map((x,i)=>`<label>${fpSpeed(x.mbps)}/${tr('fedplay.month')} ${inp('or.m'+i,x.monthly)}</label>`).join('')}<label>${tr('fedplay.term')} ${sel('or.term',terms,r.onramp.term)}</label>`;
    return h+`</div><p class="meta">${tr('hyper_fed.onramp_terms_note',{n:hsRgs().length})}</p>${cl}`;}
  let h=`<h3 class="fp-sub">${tr('hyper_fed.host_edge')}</h3><div class="trsel fp-grid"><label>${tr('hyper_fed.host')} ${yn('ed.on',!!r.edge)}</label>`;
  if(r.edge)h+=`<label>${tr('hyper_fed.per_node')} ${inp('ed.price',r.edge.monthly)}</label><label>${tr('hyper_fed.cap_city')} ${sel('ed.cap',[1,2,4,8].map(x=>[x,String(x)]),r.edge.cap)}</label><label>${tr('fedplay.term')} ${sel('ed.term',terms,r.edge.term)}</label>`;
  return h+`</div><p class="meta">${tr('hyper_fed.host_note',{p:pct(HS_EDGE),npc:fmt$(HSF_NPC_MO)})}</p>${cl}`;}
// Request modes in your terms: edge hosting for a home ISP, on-ramps for a Hyperscaler, transit never for a Hyperscaler.
const hsfAutoShown=k=>k==='edge'?fedCloud()&&!hyper():k==='onramp'?fedCloud()&&hyper():k==='transit'?!hyper():true;

/* The city panel's Cloud tab (93-ui/55-hyper-panel.js puts it together): edge nodes in partner networks for this city's
   users, and the on-ramps into the region here. Players first (they are cheaper); computer-run ISPs always answer.
   Each is a section {t, sum, flags, body()} or null. */
function hsfEdgeSpec(c){const H=S.hs,cc=CITY[c].cc;if(!H||!H.cc[cc])return null;const n=H.ne.filter(x=>x.c===c).length,o=R.hs&&R.hs.cc[cc];
  return {t:tr('hyper_fed.edge_partners'),sum:n?trn('hyper_fed.n_nodes',n)+(o&&o.nd>0?' · '+tr('hyper_fed.serving',{g:fmtG(o.nd)}):''):'',flags:[],body:()=>hsfEdgeBody(c)};}
function hsfEdgeBody(c){const H=S.hs,cc=CITY[c].cc;let h=`<p class="lead">${tr('hyper_fed.edge_partners_lead',{p:pct(HS_EDGE)})}</p>`;
    const o=R.hs&&R.hs.cc[cc],fe=R.hs&&R.hs.fe||{};
    // Players that host here: a button to their sheet with the edge request first.
    const pl=S.fed?FEDN.ids.map(id=>NET[id]).filter(n=>n&&n.fst!=='dark'&&(()=>{const a=FEDN.ann.get(n.fed),e=a&&a.rec&&a.rec.body.rates&&a.rec.body.rates.edge;return !!e&&e.at.includes(c);})()):[];
    for(const n of pl){const a=FEDN.ann.get(n.fed).rec.body.rates.edge,have=hsfNodes(n.fed,c,'buy');
      h+=`<div class="row"><div class="grow"><div class="nm">${fedBot(n)}${esc(n.name)} <span class="tag fp-d">${tr('hyper_fed.player')}</span></div><div class="meta">${tr('hyper_fed.player_host_meta',{price:a.monthly?fmt$(a.monthly):tr('hyper_fed.free'),cap:a.cap})}${have?' · '+trn('hyper_fed.n_nodes',have):''}</div></div>${btn(tr('fedplay.deals'),'fpNet',{key:n.fed,at:c,deal:'edge'},'pink sm')}</div>`;}
    for(const [net,w] of hsfNpcHosts(c)){const N=NET[net],n=hsfNpcN(c,net),wait=H.ne.filter(x=>x.c===c&&x.net===net&&x.ready>S.day).length,g=fe['npc:'+c+'|'+net]||0;
      h+=`<div class="row"><div class="grow"><div class="nm">${esc(N.name)}</div><div class="meta">${tr('hyper_fed.npc_meta',{p:pct(w),price:fmt$(HSF_NPC_MO),n:leadDays(HSF_NPC_DAYS)})}</div>${n?`<div class="meta">${trn('hyper_fed.n_nodes',n)}${wait?' · '+trn('hyper_fed.n_coming',wait):''}${g>0?' · '+tr('hyper_fed.serving',{g:fmtG(g)}):''}</div>`:''}</div>
        <div class="btns">${n<HSF_NPC_CAP?btn(tr('hyper_fed.add_node'),'hsfNpcEdge',{city:c,net},'sm',S.cash<HSF_NPC_MO):''}${n?btn(tr('hyper_fed.remove_node'),'hsfNpcEdgeOff',{city:c,net},'ghost sm'):''}</div></div>`;}
    if(o&&o.nd>0)h+=`<p class="meta">✅ ${tr('hyper_fed.nodes_serve',{g:fmtG(o.nd)})}</p>`;
  return h;}
function hsfRampSpec(c){const H=S.hs;if(!H||!H.rg[c]||!S.fed)return null;const ds=S.fed.deals.filter(d=>d.deal==='onramp'&&d.role==='sell'&&d.terms.at===c&&d.st!=='over');
  return {t:tr('hyper_fed.onramps_here'),sum:ds.length?String(ds.length):'',flags:[],body:()=>ds.length?ds.map(d=>`<div class="row"><div class="grow"><div class="nm">${esc(d.name)}</div><div class="meta">${esc(hsfTermsText('onramp',d.terms))}</div>${hsfRepLine(d)}</div></div>`).join(''):`<p class="empty">${tr('hyper_fed.no_onramps')}</p>`};}
/* The Deals tab (a Hyperscaler): partners at a glance. Players who host edge nodes or deal with you, what the
   computer-run stand-ins offer, and the line that never changes. */
function hsfDealsSec(){if(!hyper()||!S.hs)return '';const pl=S.fed&&S.fed.on?FEDN.ids.map(id=>NET[id]).filter(n=>n&&n.fst!=='dark'):[],run=S.fed?S.fed.deals.filter(d=>d.on).length:0;
  const sum=pl.length?trn('hyper_fed.n_players',pl.length)+(run?' · '+trn('hyper_fed.n_running',run):''):tr('hyper_fed.stand_ins');
  return dlSec('cloud',`🤝 ${tr('hyper_fed.partners')}`,sum,'',()=>{let h=`<p class="note">${tr('hyper_fed.partners_note')}</p>`;
    for(const n of pl.slice(0,8)){const a=FEDN.ann.get(n.fed),e=a&&a.rec&&a.rec.body.rates&&a.rec.body.rates.edge;
      h+=`<div class="row"><div class="grow"><div class="nm">${fedBot(n)}${esc(n.name)}</div><div class="meta">${e?tr('hyper_fed.hosts_edge',{price:e.monthly?fmt$(e.monthly):tr('hyper_fed.free')}):tr('hyper_fed.peer_only')}</div></div>${btn(tr('fedplay.deals'),'fpNet',{key:n.fed,deal:e?'edge':undefined},'ghost sm')}</div>`;}
    h+=`<h3 class="sub4">${tr('hyper_fed.stand_ins')}</h3><p class="meta">🖥️ ${tr('hyper_fed.si_edge',{price:fmt$(HSF_NPC_MO),n:S.hs.ne.length})}</p><p class="meta">〰️ ${tr('hyper_fed.si_waves')}</p><p class="meta">🚢 ${S.seatOff&&S.seatOff.exp>S.day?tr('hyper_fed.si_seat_now',{name:esc(S.seatOff.name)}):tr('hyper_fed.si_seat')}</p>
      <p class="meta">🚫 ${tr('hyper_fed.never_transit')}</p>`;
    return h;});}
