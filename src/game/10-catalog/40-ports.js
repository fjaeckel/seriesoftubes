/* Ports are finite. Every transit, IX, PNI and cache port, every wave and every fibre channel
   takes a router port. 10G ports ride a breakout cable, four to a port. */
const PORT_SLOT=i=>i===0?0.25:1;
// Cache boxes sit behind an aggregation switch: one router port carries as many 100G boxes as its speed holds
// (a 3.2T port takes 32), per site (#252).
const portG=g=>{const s=RG[g].pn;return parseFloat(s)*(s.endsWith('T')?1000:1);};
const cachePerPort=(c,g)=>{const p=S.pops[c];return p?Math.max(1,Math.floor(portG(g===undefined?(p.rgen||0):g)/CACHE_CAP)):1;};
// Boxes come in 100G and, behind 400G or faster router ports, 400G: cheaper per Gbps.
const cacheG=x=>x.g===CACHE_BIG?CACHE_BIG:CACHE_CAP,cacheMo=x=>x.g===CACHE_BIG?CACHE_BIG_MO:CACHE_MO,cachesMo=()=>S.caches.reduce((a,x)=>a+cacheMo(x),0);
const cacheBox=c=>{const p=S.pops[c];return p&&portG(p.rgen||0)>=CACHE_BIG?{g:CACHE_BIG}:{};};
function cachePorts(c,extra=[],g){const n={a:0,b:0};for(const x of S.caches)if(x.city===c)n[x.site==='b'?'b':'a']+=cacheG(x);for(const x of extra)n[x.site==='b'?'b':'a']+=cacheG(x);
  const p=S.pops[c],k=p?portG(g===undefined?(p.rgen||0):g):CACHE_CAP;return Math.ceil(n.a/k-1e-9)+Math.ceil(n.b/k-1e-9);}
const cachePortsAdd=(c,adds)=>cachePorts(c,adds)-cachePorts(c);
/* A dark fiber channel takes as many router ports at each end as the optic's speed needs (#256): a pluggable sits
   in one port, but a 1.6T transponder shelf hands off to an 800G router as two 800G clients. */
const chPorts=(o,c,g)=>{const p=S.pops[c];return p&&OPT[o]?Math.max(1,Math.ceil(OPT[o].g/portG(g===undefined?(p.rgen||0):g)-1e-9)):1;};
function portsUsed(c,g){let u=0;
  for(const l of S.links){if(l.a!==c&&l.b!==c||l.kind==='vxc')continue;if(l.kind!=='df'){u++;continue;}for(const o of l.ch||[])u+=chPorts(o,c,g);}
  // A puzzle's content origin (t.pz) hands off on a port of its own: it takes none of yours.
  for(const t of S.transit)if(t.city===c&&!t.pz)u+=PORT_SLOT(t.tier)*(t.n||1);
  for(const x of S.pni)if(x.city===c)u+=PORT_SLOT(x.tier)*(x.n||1);
  for(const x of ixIdsIn(c))if(S.ixp[x]!==undefined&&!S.myIx[x])u+=PORT_SLOT(S.ixp[x])*((S.ixn||{})[x]||1);
  if(S.myIx[c])u+=1;
  u+=cachePorts(c,[],g)+(S.nni||[]).filter(x=>x.city===c).length;
  return u;}
function portsMax(c,g,rt){const p=S.pops[c];if(!p)return 0;return RG[g===undefined?(p.rgen||0):g].ports*(rt||p.routers||1);}
function portGate(c,add){if(!S.pops[c]||add<=0)return true;const u=portsUsed(c),m=portsMax(c);if(u+add<=m+1e-9)return true;
  toast(tr('ports.no_free_router_ports_in_city',{city:esc(CITY[c].name),u:fmtPorts(u),m}),'bad');sfx('err');return false;}
// Nothing depends on this POP yet: no broadband, nothing plugged in, no customer. Work here bothers nobody (#105).
const popIdle=c=>{const p=S.pops[c];return !!p&&!p.bb&&portsUsed(c)===0&&!S.biz.some(b=>b.city===c||b.city2===c||(b.sites||[]).includes(c));};
const fmtPorts=u=>Number.isInteger(u)?String(u):u.toFixed(2).replace(/0+$/,'');
function modelFits(c,g){const G=RG[g],p=S.pops[c];if(!p)return '';
  if(S.links.some(l=>(l.a===c||l.b===c)&&l.kind==='wave'&&l.tier>G.maxLT))return tr('ports.a_wave_here_is_faster_than',{pn:G.pn});
  if([...S.transit,...S.pni].some(t=>t.city===c&&!t.pz&&t.tier>G.maxP)||ixIdsIn(c).some(x=>S.ixp[x]!==undefined&&!S.myIx[x]&&S.ixp[x]>G.maxP))return tr('ports.a_port_here_is_bigger_than',{pn:G.pn});
  if(S.links.some(l=>(l.a===c||l.b===c)&&l.kind==='df'&&(l.ch||[]).some(o=>OPT[o]&&OPT[o].rg>G.cls)))return tr('ports.a_fibre_here_uses_optics_this');
  if(portsUsed(c,g)>portsMax(c,g))return tr('ports.you_use_u_ports_here_and',{u:fmtPorts(portsUsed(c,g)),r:p.routers||1,model:G.n,max:portsMax(c,g)});return '';}
