/* ---------- where to meet a network (#12, #111, #121) ---------- */
// Static: the cities where a network takes PNIs and the exchanges it sits on. Built once, on first use.
let PLACES=null;
function netPlaces(id){if(!PLACES){PLACES={};for(const n of NETS)PLACES[n.id]={p:n.pops.filter(c=>CITY[c]&&!CITY[c].off),x:[]};
  for(const c of CITIES)if(c.ix&&!c.off)for(const n of NETS)if(n.ix==='ALL'||(Array.isArray(n.ix)&&n.ix.includes(c.id)))PLACES[n.id].x.push(c.id);
  for(const X of XIX)for(const m of X.members)if(PLACES[m])PLACES[m].x.push(X.id);}return PLACES[id];}
// km from each city to your nearest POP, cached until the set of POPs changes.
let NEARK='',NEARM=null;
function popNear(){const ps=Object.keys(S.pops),k=ps.join();if(k!==NEARK||!NEARM){NEARK=k;NEARM={};for(const c of CITIES)NEARM[c.id]=ps.length?Math.min(...ps.map(q=>q===c.id?0:kmBetween(q,c.id))):0;}return NEARM;}
// One entry per city: can you PNI there, which of its exchanges have them. Your POPs first, then nearest.
let SPOTK='',SPOTM={};
function meetSpots(id){const near=popNear();if(SPOTK!==NEARK){SPOTK=NEARK;SPOTM={};}if(SPOTM[id])return SPOTM[id];const P=netPlaces(id),m={};if(!P)return [];
  for(const c of P.p)(m[c]||(m[c]={c,pni:false,ix:[]})).pni=true;
  for(const x of P.x){const c=ixCity(x);if(CITY[c])(m[c]||(m[c]={c,pni:false,ix:[]})).ix.push(x);}
  return SPOTM[id]=Object.values(m).sort((a,b)=>(!!S.pops[b.c]-!!S.pops[a.c])||(near[a.c]-near[b.c])||(a.c<b.c?-1:1));}
function meetLine(n,max){const sp=meetSpots(n.id);if(!sp.length)return '';
  const lab=x=>[x.pni?'PNI':'',...x.ix.map(ixName)].filter(Boolean).join(' · ');
  return `<div class="meta" style="margin-top:4px"><b>${tr('meet_a_network.where_to_meet_them')}</b></div><div class="btns">${sp.slice(0,max).map(x=>btn(`${esc(CITY[x.c].name)} <small>${esc(lab(x))}</small>`,'meetGo',{city:x.c},S.pops[x.c]?'sm':'ghost sm')).join('')}${sp.length>max?btn(tr('dashboard.n_more',{n:sp.length-max}),'netFocus',{id:n.id},'ghost sm'):''}</div>`;}
// The nearest place to meet a network you have no POP for, for one-line hints.
function nearestSpot(id){const x=meetSpots(id)[0];return x&&!S.pops[x.c]?x:null;}
// Networks you reach only through transit, biggest first: what stands between you and Tier 1.
const ntLost=()=>NETS.filter(n=>!R.nt[n.id]).sort((a,b)=>NSH[b.id]-NSH[a.id]);
function t1Card(){const cur=GOALS.find(g=>S.done[g.id]===undefined);if(!((cur&&cur.id==='t1')||S.won)||isTier1())return '';
  const need=t1Need(),miss=need.filter(n=>!S.pni.some(p=>p.net===n.id&&pniOn(p))),club=t1Club(),lost=ntLost(),nb=n=>btn(esc(n.name),'netFocus',{id:n.id},'ghost sm');
  let h=`<div class="pcard"><div class="eyebrow">${tr('common.goal')} · ${tr('common.go_transit_free_tier_1')}</div><div class="pt">${tr('meet_a_network.road_to_tier_1')}</div>`;
  h+=pRow({l:tr('meet_a_network.transit_ports_to_cancel'),v:S.transit.length?0:1,max:1,txt:S.transit.length?String(S.transit.length):'✓'});
  h+=pRow({l:tr('meet_a_network.pnis_with_every_tier_1'),v:need.length-miss.length,max:need.length,txt:`${need.length-miss.length} / ${need.length}`});
  if(miss.length)h+=`<div class="btns">${miss.map(nb).join('')}</div>`+(club.ok?'':`<p class="why">${tr('meet_a_network.tier_1s_only_take_a_pni',{list:club.missing.join(', ')})}</p>`);
  h+=pRow({l:tr('meet_a_network.reach_without_transit'),v:Math.min(R.reachNT,0.999),max:0.999,txt:`${reachPct(R.reachNT)} / 99.9%`});
  // Their customers come along for free (#85): say how many, so the long tail does not look like homework.
  {const nc=Object.keys(R.cone||{}).length;h+=`<p class="why">${nc?trn('meet_a_network.peer_with_the_tier_1_club_n',nc):tr('meet_a_network.peer_with_the_tier_1_club')}</p>`;}
  if(lost.length)h+=`<div class="btns">${lost.slice(0,3).map(nb).join('')}${btn(trn('meet_a_network.all_n_out_of_reach',lost.length),'netFilter',{f:'out'},'pink sm')}</div>`;
  return h+'</div>';}
