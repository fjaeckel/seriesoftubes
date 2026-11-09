/* ---------- moving a customer to another path between the same two POPs ---------- */
/* Fiber customers (an alien wave, leased pairs) sit on one fiber, b.link, so they move to a parallel one. Circuits have
   no link of their own: routing picks their path every day. Moving one pins it to a list of cities, b.pin. While a link
   on the pin is down it follows routing, as a protected wave would, and it comes back by itself. */
const PATH_ALT=3,PATH_FAR=1000;
const pathKind=b=>{const T=BIZ_T[b.type];if(pzOn()||!T||capPend(b)||!b.city2)return '';return T.fiber?(b.link?'fiber':''):T.l2&&!b.sites?'circuit':'';};
const trenchOf=l=>l.kind==='vxc'?'fab:'+l.prov:(l.trench||l.id);
const pathCity=c=>CITY[c].name,pathStr=p=>p.map(pathCity).join(' → ');
const samePair=(l,a,b)=>(l.a===a&&l.b===b)||(l.a===b&&l.b===a);
const fibLab=l=>tr('customer_paths.fiber_label',{name:l.cname?esc(l.cname):capName(l),km:Math.round(l.km).toLocaleString()});
// Why this fiber cannot take this customer, in the same terms as the market that sold it: waves only where the broker
// could sell them, after the share kept back for your own traffic.
function fiberNo(b,l){const n=b.slots||1,hold=S.cm.hold;
  if(b.type==='wwave'){const free=freeCh(l),spare=cmSpare(l,'spec');return spare>=n?'':free<n?tr('customer_paths.not_enough_free_channels',{free:Math.max(0,free),n}):tr('customer_paths.not_enough_spare_channels',{free:spare,n,hold});}
  // A managed wave rides one channel of your lit capacity, so it needs an optic that big and that many Gbps spare.
  if(b.type==='mwave'){const g=b.g||100,free=Math.max(0,cmFreeG(l));if(cmOptG(l)<g)return tr('customer_paths.needs_a_g_channel',{g:fmtCap(g)});
    return free>=n*g?'':tr('customer_paths.not_enough_spare_capacity',{free:fmtCap(free),g:fmtCap(n*g),hold});}
  if(!l.own)return tr('customer_paths.only_your_own_fiber_rents_pairs');
  if(b.type==='dfpair')return pairFree(l)?'':tr('customer_paths.its_spare_pairs_are_taken');
  return S.biz.some(x=>x!==b&&x.link===l.id&&['pairs','capfib','dfpair'].includes(x.type))?tr('customer_paths.its_spare_pairs_are_taken'):'';}
// The working fibers it could go to, those on another trench first.
function fiberTargets(b){const cur=S.links.find(l=>l.id===b.link),t=cur?trenchOf(cur):'';
  return S.links.filter(l=>l.kind==='df'&&l.id!==b.link&&samePair(l,b.city,b.city2)&&l.ready<=S.day&&!(l.cut>S.day)&&!(l.eqDown>S.day))
    .map(l=>({l,diverse:trenchOf(l)!==t,no:fiberNo(b,l)})).sort((x,y)=>(y.diverse-x.diverse)||(!!x.no-!!y.no)||x.l.km-y.l.km);}
// The live backbone by city pair, as compute() sees it: every link of a pair is one edge.
function pathEdges(){const E={},N={};for(const l of S.links){if(linkDown(l)||!popUp(l.a)||!popUp(l.b))continue;const k=edgeKey(l);let e=E[k];
    if(!e){e=E[k]={k,a:l.a,b:l.b,w:Infinity,km:Infinity,lat:Infinity,cap:0,load:0,ts:new Set()};(N[l.a]=N[l.a]||[]).push(e);(N[l.b]=N[l.b]||[]).push(e);}
    e.w=Math.min(e.w,pairW(k,l.km));e.km=Math.min(e.km,l.km);e.lat=Math.min(e.lat,linkLat(l));e.cap+=capOf(l);e.load+=(R.load&&R.load[l.id])||0;e.ts.add(trenchOf(l));}
  return {E,N};}
const hopKey=(a,b)=>a<b?a+'|'+b:b+'|'+a;
// The cheapest path from a to b, as a list of cities.
function pathWalk(G,a,b,cost){const dist={[a]:0},prev={},done=new Set();for(;;){let u=null,ud=Infinity;for(const k in dist)if(!done.has(k)&&dist[k]<ud){u=k;ud=dist[k];}if(u===null||u===b)break;done.add(u);
    for(const e of G.N[u]||[]){const v=e.a===u?e.b:e.a,nd=ud+cost(e);if(nd<(dist[v]??Infinity)){dist[v]=nd;prev[v]=u;}}}
  if(dist[b]===undefined)return null;const p=[b];while(p[0]!==a)p.unshift(prev[p[0]]);return p;}
const pathHops=(G,p)=>{const o=[];for(let i=1;i<p.length;i++){const e=G.E[hopKey(p[i-1],p[i])];if(!e)return null;o.push(e);}return o;};
// The panels ask for every pinned customer: one graph per routing (a new R), not one per customer.
let PIN_G=null;
const pinG=()=>{const c=PIN_G;if(!c||c.R!==R||c.S!==S||c.d!==S.day||c.n!==S.links.length)PIN_G={R,S,d:S.day,n:S.links.length,G:pathEdges()};return PIN_G.G;};
const pinUp=b=>!!pathHops(pinG(),b.pin);
// Where the circuit runs today. Scenic circuits remember it; the others take the shortest path of their kind.
function pathNow(b,G){if(b.pin&&pathHops(G,b.pin))return b.pin;
  const r=R.l2route&&R.l2route[b.id+'>'+b.city+'>'+b.city2];if(r&&r[0]){const p=r[0].ns.slice();if(p[0]!==b.city)p.reverse();if(pathHops(G,p))return p;}
  return pathWalk(G,b.city,b.city2,b.route==='fast'?e=>e.lat+0.05:e=>e.w);}
// Paths that avoid what is in use: each one is priced as if every trench already used were nearly unusable, so the next
// one is the most diverse there is, sharing a trench only if there is no way round it.
function circuitTargets(b){const G=pathEdges(),now=pathNow(b,G);if(!now)return {now:null,alts:[]};
  const hops=pathHops(G,now)||[],used=new Set(),seen=new Set([now.join()]),own=new Set(hops.map(e=>e.k)),got=R.l2&&R.l2[b.id]||0,alts=[];
  const nowT=new Set();for(const e of hops)for(const t of e.ts){nowT.add(t);used.add(t);}
  for(let i=0;i<PATH_ALT+1&&alts.length<PATH_ALT;i++){const p=pathWalk(G,b.city,b.city2,e=>{for(const t of e.ts)if(used.has(t))return (e.w+1)*PATH_FAR;return e.w+1;});if(!p)break;
    const h=pathHops(G,p);for(const e of h)for(const t of e.ts)used.add(t);if(seen.has(p.join()))continue;seen.add(p.join());
    alts.push({p,shared:h.filter(e=>[...e.ts].some(t=>nowT.has(t))).length,km:h.reduce((a,e)=>a+e.km,0),lat:h.reduce((a,e)=>a+e.lat+0.05,0),
      room:Math.max(0,Math.min(...h.map(e=>e.cap-e.load+(own.has(e.k)?got:0))))});}
  alts.sort((x,y)=>x.shared-y.shared||x.lat-y.lat);return {now,alts};}
// The pin as compute() walks it. Null while a link on it is down, and routing takes over.
function pinRoute(p,edges){const path=[];for(let i=1;i<p.length;i++){const e=edges[hopKey(p[i-1],p[i])];if(!e)return null;path.push(e);}return {path,ni:p.map(x=>CIDX[x]),share:1};}
// Under a customer in the panels.
function pathCtl(b){if(!pathKind(b))return '';
  const pin=b.pin?`<div class="meta">${tr('customer_paths.pinned_to_path',{path:esc(pathStr(b.pin))})}${pinUp(b)?'':` · <b style="color:var(--bad)">${tr('customer_paths.that_path_is_down')}</b>`}</div>`:'';
  return `${pin}<div class="btns">${btn(tr('customer_paths.move_to_another_path'),'pathOpen',{id:b.id},'ghost sm')}</div>`;}
function pathModal(b){const a=pathCity(b.city),z=pathCity(b.city2),k=pathKind(b);let h=`<div style="display:flex;align-items:center"><h2 style="font-size:24px">${tr('customer_paths.move_name',{name:esc(b.name)})}</h2><button class="x" data-act="closeModal" aria-label="${tr('common.close')}">×</button></div>`;
  const row=(nm,meta,tag,button)=>`<div class="row"><div class="grow"><div class="nm">${nm}${tag?` <span class="tag st">${tag}</span>`:''}</div>${meta?`<div class="meta">${meta}</div>`:''}</div>${button}</div>`;
  if(k==='fiber'){const cur=S.links.find(l=>l.id===b.link),T=fiberTargets(b);
    h+=`<p class="lead" style="margin-top:6px">${tr('customer_paths.this_customer_rides_one_fiber',{a,b:z})}</p>`;
    if(cur)h+=`<div class="kv"><span>${tr('customer_paths.now_on')}</span><b>${fibLab(cur)}</b></div>`;
    if(!T.length)h+=`<p class="empty">${tr('customer_paths.no_other_working_fiber',{a,b:z})}</p>`;
    for(const t of T)h+=row(fibLab(t.l),t.no,t.diverse?tr('customer_paths.fully_diverse'):tr('customer_paths.same_trench'),btn(tr('customer_paths.move'),'pathMove',{id:b.id,link:t.l.id},'sm',!!t.no));}
  else{const {now,alts}=circuitTargets(b);
    h+=`<p class="lead" style="margin-top:6px">${tr('customer_paths.routing_chooses_this_circuit',{a,b:z})}</p>`;
    if(now)h+=`<div class="kv"><span>${tr('customer_paths.now_on')}</span><b>${esc(pathStr(now))}</b></div>`;
    if(b.pin)h+=`<div class="btns">${btn(tr('customer_paths.let_routing_choose_again'),'pathAuto',{id:b.id},'ghost sm')}</div>`;
    if(!alts.length)h+=`<p class="empty">${tr('customer_paths.no_other_path',{a,b:z})}</p>`;
    for(const t of alts){const warn=[t.room<b.bw?`<b style="color:var(--bad)">${tr('customer_paths.fits_only_g_of_bw',{g:fmtG(t.room),bw:fmtG(b.bw)})}</b>`:'',b.latMax&&t.lat>b.latMax?`<b style="color:var(--bad)">${tr('customer_paths.over_the_ms_budget',{ms:b.latMax})}</b>`:''].filter(Boolean).join(' · ');
      h+=row(esc(pathStr(t.p)),tr('customer_paths.path_facts',{km:Math.round(t.km).toLocaleString(),ms:t.lat.toFixed(1)})+(warn?' · '+warn:''),t.shared?trn('customer_paths.shares_n_spans',t.shared):tr('customer_paths.fully_diverse'),btn(tr('customer_paths.move'),'pathPin',{id:b.id,via:t.p.join()},'sm'));}}
  openModal(h);}
