/* ---------- why "two paths that share no trench" fails ---------- */
/* A red ✗ alone does not say where to dig. Under it: what every path between the two cities runs through (a trench,
   a cable, a fabric), and the down links (a closed border, a cut, fiber still being built) that would pass it again.
   The same graph and search as diversePaths(), so the answer matches the ✗. Worked out only for a customer that
   fails, once per routing (a new R). */
let DIVWHY=null;
const DIVWHY_MAX=3;
const divRiskName=l=>l.kind==='vxc'?(FAB[l.prov]?FAB[l.prov].name:l.prov):l.cable&&CAB[l.cable]?CAB[l.cable].name:l.cname||`${CITY[l.a].name} – ${CITY[l.b].name}`;
// Why a link is down, with the days left where there is an end in sight.
function divDownTxt(l){const n=d=>Math.max(1,d-S.day),w=borderShut(l),name=esc(divRiskName(l));
  if(w)return trn('diverse_why.link_border',n(w==='gulf'?S.ev.gulf:S.ev.runet),{link:name});
  if(l.cut>S.day)return trn('diverse_why.link_cut',n(l.cut),{link:name});
  if(l.kind==='vxc'&&S.ev.fab&&S.ev.fab[l.prov]>S.day)return trn('diverse_why.link_fabric',n(S.ev.fab[l.prov]),{link:name});
  if(l.ready>S.day)return trn('diverse_why.link_building',n(l.ready),{link:name});
  if(l.eqDown>S.day)return trn('diverse_why.link_equipment',n(l.eqDown),{link:name});
  return tr('diverse_why.link_dark',{link:name});}
function divWhyOf(a,b){const rem=remoteCities(),ok=c=>popUp(c)||rem.includes(c),adj=new Map(),down=[],dn=new Set();
  // Every link between live cities, in list order; a down one is skipped unless it is the one counted as back (x), so a
  // link that comes back sits where divGraph() would list it and the search breaks ties the same way.
  for(const l of S.links){if(!ok(l.a)||!ok(l.b))continue;if(linkDown(l)){down.push(l);dn.add(l);}
    for(const [u,v] of [[l.a,l.b],[l.b,l.a]]){let L=adj.get(u);if(!L)adj.set(u,L=[]);L.push([v,l]);}}
  // Breadth first in list order, as disjointOn() walks; x: one down link counted as up.
  const walk=(skip,x)=>{const prev=new Map([[a,null]]),q=[a];for(let h=0;h<q.length;h++){const u=q[h];if(u===b)break;
      for(const [v,l] of adj.get(u)||[])if(!prev.has(v)&&(l===x||!dn.has(l))&&!(skip&&skip.has(srlgOf(l)))){prev.set(v,l);q.push(v);}}
    if(!prev.has(b))return null;const p=[];for(let v=b;v!==a;){const l=prev.get(v);p.push(l);v=l.a===v?l.b:l.a;}return p;};
  const two=x=>{const p=walk(null,x);return !!p&&!!walk(new Set(p.map(srlgOf)),x);};
  const p1=walk(null),spof=[],seen=new Set();
  if(p1)for(const l of p1){const r=srlgOf(l);if(seen.has(r))continue;seen.add(r);if(!walk(new Set([r])))spof.push(esc(divRiskName(l)));}
  const back=[],said=new Set();for(const l of down){if(back.length>=DIVWHY_MAX)break;if(!two(l))continue;const t=divDownTxt(l);if(!said.has(t)){said.add(t);back.push(t);}}
  return {path:!!p1,spof,back};}
// The lines under the ✗ in a customer's or an offer's requirements.
function divWhy(o){if(!o||!o.city2||!CITY[o.city]||!CITY[o.city2])return '';
  if(!DIVWHY||DIVWHY.R!==R||DIVWHY.S!==S||DIVWHY.d!==S.day)DIVWHY={R,S,d:S.day,m:new Map()};
  const k=o.city+'|'+o.city2;let w=DIVWHY.m.get(k);if(!w)DIVWHY.m.set(k,w=divWhyOf(o.city,o.city2));
  const a=esc(CITY[o.city].name),b=esc(CITY[o.city2].name),out=[];
  if(!w.path)out.push(tr('diverse_why.no_path',{a,b}));
  else if(w.spof.length)out.push(tr('diverse_why.every_path_runs_through',{a,b,list:w.spof.slice(0,DIVWHY_MAX).join(', ')}));
  else out.push(tr('diverse_why.second_path_shares'));
  if(w.back.length)out.push(trn('diverse_why.passes_again_once_back',w.back.length,{list:w.back.join(', ')}));
  return out.map(x=>`<div class="meta" style="padding-left:1.2em">${x}</div>`).join('');}
