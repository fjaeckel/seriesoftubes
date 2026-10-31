/* Ports are finite. Every transit, IX, PNI and cache port, every wave and every fibre channel
   takes a router port. 10G ports ride a breakout cable, four to a port. */
const PORT_SLOT=i=>i===0?0.25:1;
function portsUsed(c){let u=0;
  for(const l of S.links){if(l.a!==c&&l.b!==c||l.kind==='vxc')continue;u+=l.kind==='df'?(l.ch||[]).length:1;}
  // A puzzle's content origin (t.pz) hands off on a port of its own: it takes none of yours.
  for(const t of S.transit)if(t.city===c&&!t.pz)u+=PORT_SLOT(t.tier)*(t.n||1);
  for(const x of S.pni)if(x.city===c)u+=PORT_SLOT(x.tier)*(x.n||1);
  for(const x of ixIdsIn(c))if(S.ixp[x]!==undefined&&!S.myIx[x])u+=PORT_SLOT(S.ixp[x])*((S.ixn||{})[x]||1);
  if(S.myIx[c])u+=1;
  u+=S.caches.filter(x=>x.city===c).length+(S.nni||[]).filter(x=>x.city===c).length;
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
  if(portsUsed(c)>portsMax(c,g))return tr('ports.you_use_u_ports_here_and',{u:fmtPorts(portsUsed(c)),r:p.routers||1,model:G.n,max:portsMax(c,g)});return '';}
