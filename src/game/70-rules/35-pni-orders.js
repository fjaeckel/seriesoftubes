/* Single and bulk orders share the same checks, prices and provisioning. */
// at: for a batch, where to look up the PNI there already is and the ports in use, which the batch itself never changes.
function pniQuote(city,net,tier,reserved=0,at=null){tier=+tier;const g1=tier===-1;if(g1)tier=0;
  if(!S||!S.pops[city]||!isNet(net)||!NET[net].pops.includes(city)||!Number.isInteger(tier)||!PORT[tier]||(g1&&!pniG1(net)))return null;
  const ex=at?at.ex(city,net):S.pni.find(p=>p.city===city&&p.net===net),used=at?at.used:portsUsed;
  if(ex&&(g1||!pniOn(ex)||ex.up||(!(ex.g1&&tier===0)&&tier<=ex.tier)))return null;
  const cost=g1?PNI_G1_COST:(1500+PORT[tier].setup/2)*(ex&&ex.n||1),slots=ex?(PORT_SLOT(tier)-PORT_SLOT(ex.tier))*(ex.n||1):PORT_SLOT(tier);
  let why='';if(!portOk(city,tier))why=tr('actions.your_router_can_t_take_a',{port:PORT[tier].n});
  else{const r=peerOk(net,'pni',city);if(!r.ok)why=tr('sites_peering_caches.net_declined_the_pni_why',{net:esc(NET[net].name),why:esc(r.why)});
    else if(!g1&&tier<pniMin(net))why=tr('sites_peering_caches.net_does_not_do_port_pnis',{net:esc(NET[net].name),port:PORT[tier].n});
    else if(slots>0&&used(city)+reserved+slots>portsMax(city)+1e-9)why=tr('ports.no_free_router_ports_in_city',{city:esc(CITY[city].name),u:fmtPorts(used(city)+reserved),m:portsMax(city)});}
  return {city,net,tier,g1,ex,cost,slots,why};}
function pniPlace(q){const {city,net,tier,g1,ex}=q,lead=pniLead(net);
  if(S.conf&&S.conf.until>S.day)S.stats.beerPni=1;
  if(ex){ex.up={tier,n:ex.n||1,ready:S.day+lead,g1:false};if(!lead)pniUpDone(ex);}else S.pni.push({id:uid(),city,net,tier,g1:g1||undefined,ready:S.day+lead});
  return lead;}
// The ports a pending augment will add, and those of every pending augment at a city: what an order there must leave free.
const pniUpSlots=p=>Math.max(0,PORT_SLOT(p.up.tier)*(p.up.n||1)-PORT_SLOT(p.tier)*(p.n||1));
const pniResv=c=>{let r=0;for(const p of S.pni)if(p.up&&p.city===c)r+=pniUpSlots(p);return r;};
// A batch's order quoted again on the game as it is now: null if it no longer stands (ordered by hand meanwhile, say).
// Earlier orders of the batch, placed by now, are in the PNIs themselves: the same ports the batch reserved for them.
const pniRequote=q=>{const n=pniQuote(q.city,q.net,q.g1?-1:q.tier,pniResv(q.city));return n&&!n.why&&n.ex===q.ex?n:null;};
function pniBatch(net,tier){const g=pniBatchRun(net,tier);for(;;){const s=g.next();if(s.done)return s.value;}}
// The same batch with a place to let a frame through every few networks: the intern's weekly round (95-standing-orders.js).
function* pniBatchRun(net,tier){tier=+tier;const all=net===null;if(!S||(!all&&!isNet(net))||!Number.isInteger(tier)||(tier===-1?all||!pniG1(net):!PORT[tier]||!portShown(tier)))return null;
  const shared=[],orders=[],blocked=[],reserved={};let kept=0,cost=0,mo=0,raised=0;
  // Asked of every network at every shared POP: the PNIs by POP and network (the first one, as find() would), and the
  // ports in use, counted for every POP in one pass the first time a quote needs them.
  const exs=new Map();let use=null;for(const p of S.pni){const k=p.city+'|'+p.net;if(!exs.has(k))exs.set(k,p);}
  const at={ex:(c,n)=>exs.get(c+'|'+n),used:c=>(use||(use=portsAt(Object.keys(S.pops)))).get(c)};
  // Pending augments and earlier orders in this batch already own their future ports.
  for(const p of S.pni)if(p.up)reserved[p.city]=(reserved[p.city]||0)+pniUpSlots(p);
  let nn=0;for(const n of all?NETS:[NET[net]]){if(++nn%16===0)yield;for(const city of n.pops){if(!S.pops[city])continue;shared.push(city);
    // Each network at its own minimum: asking everyone for 10G orders 100G from those that start at 100G.
    const q=pniQuote(city,n.id,all&&tier>=0?Math.max(tier,pniMin(n.id)):tier,reserved[city]||0,at);if(!q){kept++;continue;}if(q.why){blocked.push(q);continue;}orders.push(q);if(q.tier>tier&&!q.g1)raised++;cost+=q.cost;reserved[city]=(reserved[city]||0)+q.slots;
    mo+=pniMo({net:n.id,tier:q.tier,g1:q.g1,n:q.ex&&q.ex.n},0)-(q.ex?pniMo(q.ex,0):0);}}
  return {shared,orders,blocked,kept,cost,mo,raised};}
