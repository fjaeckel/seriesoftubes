const GRACE_DAYS=60;
const REQS={
 lat:{only:true,l2:true,bonus:0,l:o=>tr('requirements.one_way_latency_within_max_ms',{max:o.latMax,best:(()=>{const v=R.l2lat[o.id]!==undefined?R.l2lat[o.id]:bestLat(o.city,o.city2);return isFinite(v)?v.toFixed(1)+' ms':tr('common.no_path')})()}),ok:b=>(R.l2lat[b.id]!==undefined?R.l2lat[b.id]:bestLat(b.city,b.city2))<=b.latMax},
 nni:{only:true,bonus:0,l:o=>tr('requirements.comes_in_over_fab_needs_your',{fab:FAB[o.prov]?FAB[o.prov].name:'?',city:CITY[o.city].name,bw:fmtG(o.bw)}),ok:b=>{const pt=nniPort(b.city,b.prov);return !!pt&&nniUsed(b.city,b.prov)<=NNI[pt.tier].g+1e-9;}},
 diverse:{l:tr('requirements.two_paths_that_share_no_trench'),bonus:.25,l2:true,can:(b,s=S)=>diversityPossible(b.city,b.city2,s),ok:b=>R.div[b.id]!==undefined?!!R.div[b.id]:diversePaths(b.city,b.city2)},
 sharks:{l:tr('requirements.afraid_of_sharks_needs_a_path'),bonus:.2,l2:true,ok:b=>terrestrialPath(b.city,b.city2),can:b=>!!b.city2&&!isSub(b.city,b.city2)},
 nocog:{l:tr('requirements.refuses_cogentle_transit_anywhere_on'),bonus:.15,ok:()=>!S.transit.some(t=>t.net==='cog')},
 ipv6:{l:tr('requirements.ipv6_or_bust_you_must_peer'),bonus:.1,ok:()=>Object.keys(S.ixp).some(c=>ixSessions(c).has('drz'))||S.pni.some(p=>p.net==='drz'&&pniOn(p))},
 netchill:{l:tr('requirements.wants_netchill_on_net_a_cache'),bonus:.15,ok:()=>S.caches.some(c=>c.net==='nfx')||S.pni.some(p=>p.net==='nfx'&&pniOn(p))},
 gen:{l:tr('requirements.backup_generator_in_every_city_they'),bonus:.15,ok:b=>[b.city,b.city2].filter(Boolean).every(c=>S.pops[c]&&S.pops[c].gen)},
 routers:{l:tr('requirements.insists_on_two_routers_in_their'),bonus:.15,ok:b=>((S.pops[b.city]&&S.pops[b.city].routers)||1)>=2},
 local:{l:tr('requirements.local_breakout_transit_or_an_ix'),bonus:.2,ip:true,ok:b=>S.transit.some(t=>t.city===b.city)||hasIxAt(b.city)||(isTier1()&&S.pni.some(p=>p.city===b.city))},
 metro:{l:tr('requirements.two_data_centers_in_every_metro'),bonus:.2,only:true,ok:b=>[b.city,b.city2].filter(Boolean).every(c=>S.pops[c]&&S.pops[c].site2)},
 twoup:{l:tr('requirements.wants_two_different_transit'),bonus:.15,ip:true,ok:()=>new Set(S.transit.map(t=>t.net)).size>=2||S.transit.length===0},
 china:{l:tr('requirements.needs_low_loss_reach_into_china'),bonus:.3,ip:true,ok:()=>S.transit.some(premOn)||S.links.some(l=>l.premium)||S.pni.some(p=>NET[p.net].cn&&pniOn(p))},
 scrubbed:{l:tr('requirements.will_only_sign_with_a_network'),bonus:.15,ok:()=>hasScrub()},
 scrubnear:{l:tr('requirements.wants_a_scrubbing_center_on_its'),bonus:.15,ip:true,ok:b=>S.scrubs.some(x=>CITY[x.city].reg===CITY[b.city].reg)},
 puns:{l:tr('requirements.their_ceo_hates_puns_please_do'),bonus:.05,ok:()=>true},
};
function terrestrialPath(a,b){const ls=S.links.filter(l=>!linkDown(l)&&!l.sub);const adj={};for(const l of ls){(adj[l.a]=adj[l.a]||[]).push(l.b);(adj[l.b]=adj[l.b]||[]).push(l.a);}const seen=new Set([a]),q=[a];while(q.length){const u=q.shift();if(u===b)return true;for(const v of adj[u]||[])if(!seen.has(v)){seen.add(v);q.push(v);}}return false;}
const reqOk=b=>(b.reqs||[]).every(k=>REQS[k]&&REQS[k].ok(b));
// Some requirements only make sense for some customers: nobody can reach another continent without getting wet.
const reqCan=(k,b)=>!REQS[k].can||REQS[k].can(b);
function reqList(o){return (o.reqs||[]).map(k=>{const ok=REQS[k].ok(o),lab=typeof REQS[k].l==='function'?REQS[k].l(o):REQS[k].l;return `<div class="meta"><b style="color:${ok?'var(--eye)':'var(--bad)'}">${ok?'✓':'✗'}</b> ${esc(lab)}</div>`;}).join('');}
function diversePaths(a,b){
  const rem=remoteCities(),ok=c=>popUp(c)||rem.includes(c);
  return disjointRoutes(a,b,S.links.filter(l=>!linkDown(l)&&ok(l.a)&&ok(l.b)));}
function disjointRoutes(a,b,live){const srlg=l=>l.kind==='vxc'?'fab:'+l.prov:(l.trench||l.id);
  const bfs=ls=>{const adj={};for(const l of ls){(adj[l.a]=adj[l.a]||[]).push([l.b,l]);(adj[l.b]=adj[l.b]||[]).push([l.a,l]);}
    const prev={[a]:null},q=[a];while(q.length){const u=q.shift();if(u===b)break;for(const [v,l] of adj[u]||[])if(!(v in prev)){prev[v]=l;q.push(v);}}
    if(!(b in prev))return null;const path=[];let v=b;while(v!==a){const l=prev[v];path.push(l);v=l.a===v?l.b:l.a;}return path;};
  const p1=bfs(live);if(!p1)return false;const used=new Set(p1.map(srlg));return !!bfs(live.filter(l=>!used.has(srlg(l))));}
// Check buildable geography, not today's POPs, capacity or outages. Parallel land
// routes can use separate trenches; all segments of one cable share its risk.
let diversityMap=null;
function diversityPossible(a,b,state=S){
  if(!CITY[a]||!CITY[b]||a===b)return false;
  const rules=state.scn&&state.scn.rules||{},key=JSON.stringify([!!state.won,rules]);
  if(!diversityMap||diversityMap.key!==key){
    /* Built once per ruleset, over every city pair, so it runs on the first load of every save: on city indices, with
       the cables between each pair from a table. A link is the number of its risk: each land trench and your own cable
       on its own, every segment of one cable (or one fabric) the same; adj[i] lists [neighbour, risk] in the order the
       links were added, as a graph built from a list of them would. */
    const cities=CITIES.filter(c=>!(rules.banCities||[]).includes(c.id)).map(c=>c.id),N=cities.length,ix=new Map(cities.map((c,i)=>[c,i]));
    const cab=new Map();for(const c of CABLE_PAIRS){const k=c.a<c.b?c.a+'|'+c.b:c.b+'|'+c.a;let L=cab.get(k);if(!L)cab.set(k,L=[]);L.push(c);}
    const LS=cities.map(c=>lands(CITY[c])),land=cities.map(landing),cn=cities.map(cnCity),fab=cities.map(c=>FABS.filter(f=>f.cities.includes(c))),ban=rules.banPairs||[];
    const adj=cities.map(()=>[]),grp=new Map();let n=0,k=0;const add=(i,j,g)=>{let r;if(g===undefined)r=k++;else{r=grp.get(g);if(r===undefined)grp.set(g,r=k++);}adj[i].push(j,r);adj[j].push(i,r);n++;};
    for(let i=0;i<N;i++)for(let j=i+1;j<N;j++){
      const a=cities[i],b=cities[j],cs=cab.get(a<b?a+'|'+b:b+'|'+a),sub=!LS[i].some(x=>LS[j].includes(x));
      if(!sub){add(i,j);add(i,j);}
      if(cs)for(const c of cs)if(!ban.some(p=>p===c.cid+':'+a+'-'+b||p===c.cid+':'+b+'-'+a))add(i,j,'cab:'+c.cid);
      if(state.won&&land[i]&&land[j]&&(sub||cs)&&!cn[i]&&!cn[j])add(i,j);
      if(fab[i].length&&fab[j].length)for(const f of FABS)if(fab[i].includes(f)&&fab[j].includes(f))add(i,j,'fab:'+f.id);
    }
    diversityMap={key,ix,adj,links:n,answers:{}};
  }
  const pair=[a,b].sort().join(':'),M=diversityMap;
  return M.answers[pair]??(M.answers[pair]=M.ix.has(a)&&M.ix.has(b)&&disjointOn(M.adj,M.ix.get(a),M.ix.get(b)));
}
// disjointRoutes() on such a graph: a shortest path by hops, then another one that shares none of its risks.
function disjointOn(adj,a,b){const N=adj.length,bfs=skip=>{const prev=new Int32Array(N).fill(-1),pl=new Int32Array(N),q=[a];prev[a]=a;
    for(let h=0;h<q.length;h++){const u=q[h];if(u===b)break;const L=adj[u];for(let k=0;k<L.length;k+=2){const v=L[k];if(prev[v]<0&&!(skip&&skip.has(L[k+1]))){prev[v]=u;pl[v]=L[k+1];q.push(v);}}}
    if(prev[b]<0)return null;const used=new Set();for(let v=b;v!==a;v=prev[v])used.add(pl[v]);return used;};
  const p1=bfs(null);return !!p1&&!!bfs(p1);}
// Big networks have thousands of links and customers: callers that ask about all of them (compute(), the daily mood
// check, new offers) look links up and add up what is sold in one pass (linkIds(), fiberUse()), not once per item.
const linkIds=()=>{const m=new Map();for(const l of S.links)if(!m.has(l.id))m.set(l.id,l);return m;};
function fiberUse(){const sold=new Map(),dfp=new Map(),pairs=new Set();
  for(const b of S.biz){if(b.type==='wwave')sold.set(b.link,(sold.get(b.link)||0)+(b.slots||0));else if(b.type==='dfpair')dfp.set(b.link,(dfp.get(b.link)||0)+1);else if(b.type==='pairs'||b.type==='capfib')pairs.add(b.link);}
  return {sold,dfp,pairs};}
function fiberOk(b,ids){const l=ids?ids.get(b.link):S.links.find(x=>x.id===b.link);if(!l)return false;if(b.type==='dfpair'||b.type==='pairs'||b.type==='capfib')return l.ready<=S.day&&!(l.cut>S.day);return l.ready<=S.day&&!(l.cut>S.day)&&!(l.eqDown>S.day);}
function soldSlots(l,u){return u?u.sold.get(l.id)||0:S.biz.filter(b=>b.type==='wwave'&&b.link===l.id).reduce((a,b)=>a+(b.slots||0),0);}
// Spare capacity other carriers can rent on a dark fiber (#51): free channels for alien waves, and on your own build
// a spare pair in the trench. Random offers and broker listings follow the same rules and the same prices.
const freeCh=(l,u)=>chMax(l)-(l.ch||[]).length-soldSlots(l,u),pairFree=(l,u)=>!!l.own&&(u?u.dfp.get(l.id)||0:S.biz.filter(b=>b.type==='dfpair'&&b.link===l.id).length)<2&&!(u?u.pairs.has(l.id):S.biz.some(b=>(b.type==='pairs'||b.type==='capfib')&&b.link===l.id));
const wwWhat=(l,n)=>trn('requirements.n_400g_alien_wave_on_your',n,{a:CITY[l.a].name,b:CITY[l.b].name});
function fiberOffer(t,l,nm,cut=1){
  if(t==='wwave'){const slots=1+Math.floor(Math.random()*Math.min(4,freeCh(l)));
    return {id:uid(),city:l.a,city2:l.b,link:l.id,slots,what:wwWhat(l,slots),name:nm(),type:t,bw:1,rate:Math.round(waveMo(l.km,false,2)*0.55*slots*cut),reqs:[],exp:S.day+30};}
  return {id:uid(),city:l.a,city2:l.b,link:l.id,what:tr('requirements.a_spare_fiber_pair_in_your',{a:CITY[l.a].name,b:CITY[l.b].name}),name:nm(),type:t,bw:1,rate:Math.round(dfLeaseMo(l.km)*0.9*cut),reqs:[],exp:S.day+30};}
