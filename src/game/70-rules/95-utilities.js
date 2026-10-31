/* Utilities: plan from live state, then apply a whole batch with one recompute. */
function utilityRouteServers(){return S?Object.keys(S.ixp).filter(ix=>isIx(ix)&&!S.myIx[ix]&&!S.rs[ix]):[];}
function utilityCacheMoves(city){if(!S||!S.pops[city])return [];const groups=new Map(),moves=[];
  for(const c of S.caches)if(c.city===city){let g=groups.get(c.net);if(!g){g={a:[],b:[]};groups.set(c.net,g);}g[c.site==='b'?'b':'a'].push(c);}
  const move=(g,from,n)=>{const to=from==='a'?'b':'a';for(const c of g[from].splice(0,n)){g[to].push(c);moves.push({id:c.id,site:to});}};
  for(const g of groups.values()){const from=g.a.length>g.b.length?'a':'b',to=from==='a'?'b':'a';
    move(g,from,Math.floor((g[from].length-g[to].length)/2));}
  // Spread odd-provider extras too, so the overall site counts also differ by at most one.
  let diff=0;for(const g of groups.values())diff+=g.a.length-g.b.length;
  const from=diff>0?'a':'b',to=from==='a'?'b':'a';let left=Math.floor(Math.abs(diff)/2);
  for(const g of groups.values())if(left&&g[from].length>g[to].length){move(g,from,1);left--;}
  return moves;}
function utilityCaches(city){const p=S&&S.pops[city];if(!p)return null;const sites=p.site2?['a','b']:['a'],add=[],have=new Set();
  for(const c of S.caches)if(c.city===city)have.add(c.net+'@'+(c.site==='b'?'b':'a'));
  for(const n of NETS)if(n.cache&&(R.demTo[n.id]||0)>=n.cache.min)for(const site of sites)if(!have.has(n.id+'@'+site))add.push({net:n.id,site});
  return {add,key:add.map(c=>c.net+'@'+c.site).join(','),mo:add.length*CACHE_MO,free:Math.max(0,portsMax(city)-portsUsed(city))};}
function utilityKit(city){const p=S&&S.pops[city];if(!p)return null;
  const gen=!p.gen,site=!p.site2,router=(p.routers||1)<2,g=p.rgen||0;
  return {gen,site,router,moves:utilityCacheMoves(city),cost:(gen?GEN_COST:0)+(site?SITE2_COST:0)+(router?routerCost(g,1):0),
    mo:(gen?GEN_MO:0)+(site?SITE2_MO:0)+(router?routerMo(g):0)};}
function utilityPeers(){if(!S)return [];return Object.keys(S.ixp).filter(isIx).map(ix=>{
  const sessions=ixSessions(ix),requests=[],blocked=[];let existing=0;
  for(const id of ixMembers(ix)){
    // Existing but temporarily down sessions must not be repeatedly requested.
    if(sessions.has(id)||S.peers[id+'@'+ix]){existing++;continue;}
    const chk=peerOk(id,'ix',ix);if(chk.ok)requests.push(id);else blocked.push({id,why:chk.why});
  }
  return {ix,requests,blocked,existing};
});}
