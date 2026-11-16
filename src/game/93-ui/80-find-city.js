/* ---------- Find (#218): a search box that jumps the map to a city, and to everything else ----------
   Matches the city's name, its country (in the player's language and in English) and its exchange and data center
   names, so "Deutschland", "Germany" or "DE-CIX" all find Frankfurt. Press / anywhere, or the 🔍 chip in the HUD. */
const FIND_N=8;
const fold=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
// Country names, built once per page: they never change while playing.
let FIND_IX=null;
function findIndex(){if(FIND_IX)return FIND_IX;let dn=null,en=null;try{dn=new Intl.DisplayNames([LANG],{type:'region'});en=new Intl.DisplayNames(['en'],{type:'region'});}catch(e){}
  const cn=(d,cc)=>{try{return d?d.of(cc)||'':'';}catch(e){return '';}};
  FIND_IX=Object.values(CITY).map(C=>{const land=cn(dn,C.cc)||C.cc||'';return {id:C.id,name:fold(C.name),land,ctry:fold(land+' '+cn(en,C.cc)+' '+(C.cc||'')),xtra:fold((C.ix||'')+' '+(C.dc||''))};});return FIND_IX;}
// Best matches first: the name starts with it, a word of the name does, the name has it, then country, then exchange or DC.
// With from (#343, a link from that POP), only cities a link could end in: not from itself, and only those the map shows.
function findCities(q,from){q=fold(q);const mine=c=>S&&S.pops&&S.pops[c]?0:1,ok=c=>!from||(c!==from&&cityOn(c));
  if(!q){const m=S&&S.pops?Object.keys(S.pops).filter(c=>isCity(c)&&ok(c)).sort((a,b)=>CITY[a].name.localeCompare(CITY[b].name)).slice(0,FIND_N):[];
    // A new link from a POP: your other POPs, then the nearest cities, so a first link needs no idea where anything is.
    if(!from||m.length>=FIND_N)return m;
    return m.concat(CITIES.filter(C=>!S.pops[C.id]&&ok(C.id)).map(C=>[kmBetween(from,C.id),C.id]).sort((a,b)=>a[0]-b[0]).slice(0,FIND_N-m.length).map(r=>r[1]));}
  const out=[];for(const e of findIndex()){const n=e.name;if(!ok(e.id))continue;
    const s=n.startsWith(q)?0:n.split(/[\s\-.'()]+/).some(w=>w.startsWith(q))?1:n.includes(q)?2:e.ctry.includes(q)?3:e.xtra.includes(q)?4:-1;
    if(s>=0)out.push([s,mine(e.id),-(CITY[e.id].P||0),e.id]);}
  return out.sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]).slice(0,FIND_N).map(r=>r[3]);}
/* Find anything: the same box also finds networks (by name or AS number), your customers and open offers, your links
   (by the cities at their ends: "fra ams") and the game's screens. Everything but cities is indexed once when the box
   opens (UI.findIx), with lower-case keys, so a keystroke is plain string matching over a few hundred short entries. */
const FIND_CAP=4,FIND_ALL=30,FIND_G=['city','net','cust','link','go'];
// Screens and actions. dt: a NOC dashboard tab, lt: a tab of the left panel, bank; these go through findPick, which
// closes the box first. act: an action that opens its own window, pressed directly. pz: also there in a puzzle.
const FIND_GO=[
 {id:'dash',i:'📊',l:()=>tr('common.noc_dashboard'),dt:'overview'},
 {id:'d-cust',i:'📊',l:()=>tr('common.customers'),dt:'cust'},
 {id:'d-conn',i:'📊',l:()=>tr('common.connections'),dt:'conn'},
 {id:'d-traffic',i:'📊',l:()=>tr('common.traffic'),dt:'traffic'},
 {id:'d-ddos',i:'📊',l:()=>tr('ddos_dash.tab'),dt:'ddos'},
 {id:'d-links',i:'📊',l:()=>tr('common.links'),dt:'links'},
 {id:'d-routers',i:'📊',l:()=>tr('common.routers'),dt:'routers'},
 {id:'d-pops',i:'📊',l:()=>tr('common.pops'),dt:'pops'},
 {id:'d-lease',i:'📊',l:()=>tr('common.leased_lines'),dt:'lease'},
 {id:'d-market',i:'📊',l:()=>tr('market.tab'),dt:'market'},
 {id:'goals',i:'🎯',l:()=>tr('common.goals'),lt:'goals'},
 {id:'deals',i:'🤝',l:()=>tr('common.deals'),lt:'deals'},
 {id:'noc',i:'🚨',l:()=>'NOC',lt:'noc'},
 {id:'nets',i:'🌐',l:()=>tr('common.networks'),lt:'nets'},
 {id:'bank',i:'🏦',l:()=>tr('common.bank'),bank:1},
 {id:'routing',i:'🧭',l:()=>tr('routing.routing_and_ddos'),act:'routingOpen'},
 {id:'ops',i:'🧑‍💻',l:()=>tr('ops.standing_orders'),act:'opsOpen'},
 {id:'boards',i:'🏆',l:()=>tr('fedui.leaderboards'),act:'fuBoards',ok:()=>fuRankOn()},
 {id:'settings',i:'⚙️',l:()=>tr('common.settings'),act:'settings',pz:1},
 {id:'help',i:'❓',l:()=>tr('common.how_to_play'),act:'help',pz:1},
 {id:'keys',i:'⌨️',l:()=>tr('keys.keyboard_shortcuts'),act:'keys',pz:1,ok:()=>!isPhone()},
 {id:'share',i:'📸',l:()=>tr('common.share'),act:'share'},
 {id:'export',i:'💾',l:()=>tr('common.export_save'),act:'exportSave'},
];
const findWords=s=>fold(s).split(/[\s\-.'()&,/]+/).filter(Boolean);
// How well a key matches: 0 the same, 1 starts with it, 2 a word starts with it, 3 has it, -1 not at all.
const findScore=(n,q)=>n===q?0:n.startsWith(q)?1:n.split(/[\s\-.'()&,/]+/).some(w=>w.startsWith(q))?2:n.includes(q)?3:-1;
function findBuild(){const seen=new Set(),cust=[];
  for(const b of S.biz||[]){const u=b.name+'|'+b.city+'|'+b.type;if(!b.name||!isCity(b.city)||seen.has(u))continue;seen.add(u);cust.push({k:'cust',id:b.id,o:b,key:fold(b.name)});}
  for(const o of S.offers||[])if(o.name&&isCity(o.city))cust.push({k:'offer',id:o.id,o,key:fold(o.name)});
  return {net:NETS.map(n=>({k:'net',id:n.id,o:n,key:fold(n.name),asn:String(n.asn)})),cust,
    link:(S.links||[]).filter(l=>isCity(l.a)&&isCity(l.b)).map(l=>({k:'link',id:l.id,o:l,a:[l.a,...findWords(CITY[l.a].name)],b:[l.b,...findWords(CITY[l.b].name)],c:findWords(l.cname)})),
    go:FIND_GO.filter(g=>(g.pz||!pzOn())&&(!g.ok||g.ok())).map(g=>({k:'go',id:g.id,o:g,key:fold(g.l())}))};}
// Every group's matches, best first, as [score,entry]; the groups come back with the best match's group on top.
function findAll(q){q=fold(q);const ix=UI.findIx||(UI.findIx=findBuild()),G={};
  G.city=findCities(q).map(c=>{const s=findScore(fold(CITY[c].name),q);return [s<0?4:s,{k:'city',id:c}];});
  const asn=q.replace(/^as(?=\d)/,''),num=/^\d+$/.test(asn);
  G.net=ix.net.map(e=>[num?(e.asn===asn?0:e.asn.startsWith(asn)?2:-1):findScore(e.key,q),e]).filter(r=>r[0]>=0).sort((a,b)=>a[0]-b[0]||(b[1].o.share||0)-(a[1].o.share||0));
  G.cust=ix.cust.map(e=>[findScore(e.key,q),e]).filter(r=>r[0]>=0).sort((a,b)=>a[0]-b[0]);
  // A link needs every word typed to start a word of one of its ends (or of its cable's name); words for both ends rank first.
  const tk=findWords(q),hit=(w,t)=>w.some(x=>x.startsWith(t));
  G.link=tk.length?ix.link.map(e=>{if(!tk.every(t=>hit(e.a,t)||hit(e.b,t)||hit(e.c,t)))return [-1,e];
    const both=tk.some((t,i)=>hit(e.a,t)&&tk.some((u,j)=>j!==i&&hit(e.b,u)));return [both?0:tk.length===1&&(e.a.includes(tk[0])||e.b.includes(tk[0]))?2:3,e];}).filter(r=>r[0]>=0).sort((a,b)=>a[0]-b[0]):[];
  // Two cities with no link between them ("fra ams"): each of them, so the search still leads somewhere. Every word must be a city.
  if(!G.city.length&&tk.length>1){const cs=tk.map(t=>findCities(t)[0]);if(cs.every(Boolean))G.city=[...new Set(cs)].map(c=>[4,{k:'city',id:c}]);}
  G.go=ix.go.map(e=>[findScore(e.key,q),e]).filter(r=>r[0]>=0).sort((a,b)=>a[0]-b[0]);
  return FIND_G.filter(g=>G[g].length).map(g=>({g,rows:G[g]})).sort((a,b)=>a.rows[0][0]-b.rows[0][0]);}
// A saved shortcut (a recent pick) back to its live thing, or nothing when it is gone.
function findObj(k,id){const o=k==='city'?(isCity(id)?CITY[id]:null):k==='net'?NET[id]:k==='cust'?(S.biz||[]).find(x=>x.id===id):k==='offer'?(S.offers||[]).find(x=>x.id===id):k==='link'?(S.links||[]).find(x=>x.id===id):k==='go'?FIND_GO.find(x=>x.id===id&&(x.pz||!pzOn())&&(!x.ok||x.ok())):null;return o?{k,id,o}:null;}
function findRow(e,on,note){const {k,id}=e,o=e.o||CITY[id];let ic='',nm='',meta='',act='findPick',args={k,id};
  if(k==='city'){const p=S.pops&&S.pops[id],land=(findIndex().find(x=>x.id===id)||{}).land||'';ic=p?'📍':'';nm=o.name;meta=[land,o.ix,p?tr('find.your_pop'):''].filter(Boolean).join(' · ');}
  else if(k==='net'){ic='🌐';nm=o.name;meta=['AS'+o.asn,TYPE_L[o.type]].filter(Boolean).join(' · ');}
  else if(k==='cust'||k==='offer'){ic=k==='offer'?'🤝':'🏢';nm=o.name;meta=[k==='offer'?tr('common.offers'):'',BIZ_T[o.type]&&BIZ_T[o.type].l,CITY[o.city].name].filter(Boolean).join(' · ');}
  else if(k==='link'){ic='🔗';nm=CITY[o.a].name+' ↔ '+CITY[o.b].name;meta=[tr(LK_L[lkOf(o)]),o.cname].filter(Boolean).join(' · ');}
  else{ic=o.i;nm=o.l();meta=o.dt&&o.dt!=='overview'?tr('common.noc_dashboard'):'';if(o.act){act=o.act;args={};}}
  if(note)meta=[note,meta].filter(Boolean).join(' · ');
  return `<button class="row findrow${on?' on':''}" role="listitem" data-act="${act}" data-args="${esc(JSON.stringify(args))}"><span class="grow"><span class="nm">${ic?ic+' ':''}${esc(nm)}</span>${meta?`<span class="meta">${esc(meta)}</span>`:''}</span><span aria-hidden="true">›</span></button>`;}
const FIND_H={city:()=>tr('find.cities'),net:()=>tr('common.networks'),cust:()=>tr('common.customers'),link:()=>tr('common.links'),go:()=>tr('find.screens_and_actions'),recent:()=>tr('find.recent')};
const findHead=g=>`<div class="findh">${FIND_H[g]()}</div>`;
// Nothing typed yet: what you opened last, your home and the cities with trouble, then every screen as a grid of tiles.
function findStart(){const ix=UI.findIx||(UI.findIx=findBuild());let h='',n=0;const row=(e,note)=>findRow(e,!n++,note);
  const rec=(UI.findRecent||[]).map(r=>findObj(r.k,r.id)).filter(Boolean).slice(0,FIND_CAP);
  if(rec.length)h+=findHead('recent')+rec.map(e=>row(e)).join('');
  const hot=new Map();for(const i of S.inc||[])if(isCity(i.ref)&&i.ref!==S.home&&hot.size<FIND_CAP&&!hot.has(i.ref))hot.set(i.ref,incTitle(i.type));
  const cs=(isCity(S.home)?[[S.home,tr('common.home')]]:[]).concat([...hot]);
  if(cs.length)h+=findHead('city')+cs.map(([c,note])=>row({k:'city',id:c},note)).join('');
  if(ix.go.length)h+=findHead('go')+`<div class="findgrid">${ix.go.map(e=>row(e)).join('')}</div>`;
  return h;}
function findRows(q,from){
  if(from){const ids=findCities(q,from);
    if(!ids.length)return `<p class="meta" style="margin:10px 0">${q.trim()?tr('find.no_city_matches_q',{q:esc(q.trim())}):tr('find.type_a_city_a_country')}</p>`;
    return ids.map((c,i)=>{const C=CITY[c],p=S.pops[c],land=(findIndex().find(e=>e.id===c)||{}).land||'';
      return `<button class="row findrow${i?'':' on'}" role="listitem" data-act="linkTo" data-args="${esc(JSON.stringify({a:from,b:c}))}"><span class="grow"><span class="nm">${p?'📍 ':''}${esc(C.name)}</span><span class="meta">${esc([land,C.ix,kmBetween(from,c).toLocaleString()+' km'].filter(Boolean).join(' · '))}${p?' · '+tr('find.your_pop'):''}</span></span><span aria-hidden="true">›</span></button>`;}).join('');}
  if(!fold(q))return findStart();
  const gs=findAll(q);if(!gs.length)return `<p class="meta" style="margin:10px 0">${tr('find.nothing_matches_q',{q:esc(q.trim())})}</p>`;
  let n=0;return gs.map(({g,rows})=>{const cap=UI.findMore===g?FIND_ALL:FIND_CAP,more=Math.min(rows.length,FIND_ALL)-cap;
    return findHead(g)+rows.slice(0,cap).map(r=>findRow(r[1],!n++)).join('')+(more>0?`<button class="row findrow findmore" role="listitem" data-act="findMore" data-args="${esc(JSON.stringify({g}))}"><span class="grow meta">${tr('dashboard.n_more',{n:more})}</span></button>`:'');}).join('');}
// On a phone the sheet hangs from the top and is as tall as what the on-screen keyboard leaves, so results stay in reach.
const findFit=()=>{const v=window.visualViewport;if(v)$('modal').style.setProperty('--findh',Math.round(v.height)+'px');};
if(window.visualViewport)visualViewport.addEventListener('resize',()=>{if(!$('modal').hidden&&$('modal').className==='find')findFit();});
/* The same box picks where a new link from one of your POPs goes (#343): on a crowded phone map, dragging from a POP
   to a city far away is fiddly, so you type the other end and get the link window the drag would have opened. */
function findOpen(from){if(!S||!UI.started)return;from=from&&S.pops[from]?from:null;UI.findFrom=from;UI.findAt=0;UI.findMore=null;UI.findIx=null;UI.findQ='';
  const title=from?tr('find.link_from_city',{city:CITY[from].name}):tr('find.find_anything');findFit();
  openModal(`<div class="findtop"><div style="display:flex;align-items:center"><h2>${from?'🔗':'🔍'} ${esc(title)}</h2><button class="x" data-act="closeModal" aria-label="${tr('common.close')}">×</button></div><input class="t" id="findIn" type="search" enterkeyhint="go" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(from?tr('find.city_country_or_exchange'):tr('find.city_network_customer_link'))}" aria-label="${esc(title)}" aria-controls="findList"></div>
    <div id="findList" class="findlist" role="list">${findRows('',from)}</div>${from?`<p class="meta" style="margin:8px 0 0">${tr('find.pick_where_the_link_goes')}</p>`:isPhone()?'':`<p class="meta" style="margin:8px 0 0">${tr('find.press_slash_or_ctrl_k')}</p>`}`,'find');
  const el=$('findIn');if(el)el.focus();}
function findDraw(){const L=$('findList'),el=$('findIn');UI.findAt=0;if(L&&el){UI.findQ=el.value;L.innerHTML=findRows(el.value,UI.findFrom);L.scrollTop=0;}}
document.addEventListener('input',e=>{if(e.target.id!=='findIn')return;UI.findMore=null;findDraw();});
// Up and Down move the highlight through the results of every group, and Enter takes the highlighted one.
function findMove(d){const L=$('findList'),rows=L?[...L.querySelectorAll('.findrow')]:[];if(!rows.length)return;const i=Math.max(0,Math.min(rows.length-1,(UI.findAt||0)+d));UI.findAt=i;
  rows.forEach((r,j)=>r.classList.toggle('on',j===i));if(rows[i].scrollIntoView)rows[i].scrollIntoView({block:'nearest'});}
document.addEventListener('keydown',e=>{
  if(e.target.id==='findIn'){if(e.key==='Escape'){closeModal();return;}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();findMove(e.key==='ArrowDown'?1:-1);return;}if(e.key==='Enter'){e.preventDefault();if(e.target.value!==UI.findQ)findDraw();const L=$('findList'),r=L&&L.querySelectorAll('.findrow')[UI.findAt||0];if(r)r.click();}return;}
  // / anywhere, or Ctrl+K (Cmd+K on a Mac).
  const k=e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!e.altKey,ck=(e.key==='k'||e.key==='K')&&(e.ctrlKey||e.metaKey)&&!e.altKey&&!e.shiftKey;
  if(!(k||ck)||(e.target.closest&&e.target.closest('input,textarea,select,[contenteditable]')))return;
  if(!S||!UI.started||!$('modal').hidden)return;e.preventDefault();findOpen();});
