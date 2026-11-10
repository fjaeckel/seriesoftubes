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
// A city's traffic to one network, split as routing splits it (#260): China, Russia and Korea's exit rule have their own
// list of networks, and Goggle is throttled to half in Russia. The world shares (NSH) would size boxes for networks the
// city cannot even reach, and too few for the ones it uses most.
const cityShTab=c=>cnCity(c)?NSH_CN:ruCity(c)?NSH_RU:CITY[c].kr&&S.krExit?NSH_KRX:NSH;
const cityNetSh=(c,id)=>{const j=LOC_NIX.get(id);return (j===undefined?0:cityShares(cityShTab(c),c)[j])*(id==='ggl'&&ruCity(c)?0.5:1);};
// A city's total share only depends on its split (its table, localised for the city, #48) and on the Russian throttle,
// and those never change after load: summed once per split, not once per network asked about (that was cities ×
// networks² every shift).
const CSH_SUM=new WeakMap();
function cityShSum(c){const a=cityShares(cityShTab(c),c),k=ruCity(c)?1:0;let m=CSH_SUM.get(a);if(!m)CSH_SUM.set(a,m=[null,null]);
  if(m[k]===null){const T=cityShTab(c);let t=0;for(const id in T)t+=cityNetSh(c,id);m[k]=t;}return m[k];}
function cacheDem(c,id){const t=cityShSum(c);return t>0?((R.cityDem&&R.cityDem[c])||0)*cityNetSh(c,id)/t:0;}
// One box per site first, if the city sends the network anything at all; then more boxes while that demand outgrows them
// (100G each, #248).
// boxes: the city's own boxes in their order, when the caller has them sorted by city already (S.caches otherwise).
function cachePlan(city,boxes=S.caches){const p=S&&S.pops[city];if(!p)return null;const sites=p.site2?['a','b']:['a'],add=[],have={};
  // One pass over the boxes: how many per network and site, and the capacity per network (summed in the same order).
  const capN={};for(const c of boxes)if(c.city===city){const k=c.net+'@'+(c.site==='b'?'b':'a');have[k]=(have[k]||0)+1;capN[c.net]=(capN[c.net]||0)+cacheG(c);}
  for(const n of NETS){if(!n.cache||!((R.demTo[n.id]||0)>=n.cache.min))continue;const dem=cacheDem(city,n.id);if(!(dem>1e-6))continue;const box=sites.map(st=>have[n.id+'@'+st]||0),a0=add.length;
    sites.forEach((site,i)=>{if(!box[i]){add.push({net:n.id,site,...cacheBox(city)});box[i]=1;}});
    const nb=cacheBox(city);
    let cap=(capN[n.id]||0)+(add.length-a0)*cacheG(nb);
    while(cap+1e-9<dem){const i=box.indexOf(Math.min(...box));add.push({net:n.id,site:sites[i],...nb});box[i]++;cap+=cacheG(nb);}}
  return add;}
// The plan with its quote: the ports it takes and those free (counting ports walks the whole network), the monthly rent.
function utilityCaches(city){const add=cachePlan(city);if(!add)return null;
  return {add,ports:cachePortsAdd(city,add),key:add.map(c=>c.net+'@'+c.site).join(','),mo:add.reduce((a,x)=>a+cacheMo(x),0),free:Math.max(0,portsMax(city)-portsUsed(city))};}
function utilityKit(city){const p=S&&S.pops[city];if(!p)return null;
  const gen=!p.gen,site=!p.site2,router=(p.routers||1)<2,g=p.rgen||0;
  return {gen,site,router,moves:utilityCacheMoves(city),cost:(gen?GEN_COST:0)+(site?SITE2_COST:0)+(router?routerCost(g,1):0),
    mo:(gen?GEN_MO:0)+(site?SITE2_MO:0)+(router?routerMo(g):0)};}
// The kit at every POP that lacks part of it (#317): one quote, one button. From customer level 2, like the intern: early
// on, every generator is a choice about money.
const utilityKitAllOn=()=>!!S&&opsCanHire()&&!pzOn();
function utilityKitAll(){if(!utilityKitAllOn())return null;const cities=[];let cost=0,mo=0,moves=0;
  for(const c of Object.keys(S.pops)){const q=utilityKit(c);if(!q||(!q.cost&&!q.moves.length))continue;cities.push(c);cost+=q.cost;mo+=q.mo;moves+=q.moves.length;}
  return {cities,cost,mo,moves};}
function utilityPeers(){if(!S)return [];return Object.keys(S.ixp).filter(isIx).map(ix=>{
  const sessions=ixSessions(ix),requests=[],blocked=[];let existing=0;
  for(const id of ixMembers(ix)){
    // Existing but temporarily down sessions must not be repeatedly requested.
    if(sessions.has(id)||S.peers[id+'@'+ix]){existing++;continue;}
    const chk=peerOk(id,'ix',ix);if(chk.ok)requests.push(id);else blocked.push({id,why:chk.why});
  }
  return {ix,requests,blocked,existing};
});}
