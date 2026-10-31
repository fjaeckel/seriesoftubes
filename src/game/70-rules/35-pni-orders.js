/* Single and bulk orders share the same checks, prices and provisioning. */
function pniQuote(city,net,tier,reserved=0){tier=+tier;const g1=tier===-1;if(g1)tier=0;
  if(!S||!S.pops[city]||!isNet(net)||!NET[net].pops.includes(city)||!Number.isInteger(tier)||!PORT[tier]||(g1&&!pniG1(net)))return null;
  const ex=S.pni.find(p=>p.city===city&&p.net===net);
  if(ex&&(g1||!pniOn(ex)||ex.up||(!(ex.g1&&tier===0)&&tier<=ex.tier)))return null;
  const cost=g1?PNI_G1_COST:(1500+PORT[tier].setup/2)*(ex&&ex.n||1),slots=ex?(PORT_SLOT(tier)-PORT_SLOT(ex.tier))*(ex.n||1):PORT_SLOT(tier);
  let why='';if(!portOk(city,tier))why=tr('actions.your_router_can_t_take_a',{port:PORT[tier].n});
  else{const r=peerOk(net,'pni',city);if(!r.ok)why=tr('sites_peering_caches.net_declined_the_pni_why',{net:esc(NET[net].name),why:esc(r.why)});
    else if(!g1&&tier<pniMin(net))why=tr('sites_peering_caches.net_does_not_do_port_pnis',{net:esc(NET[net].name),port:PORT[tier].n});
    else if(slots>0&&portsUsed(city)+reserved+slots>portsMax(city)+1e-9)why=tr('ports.no_free_router_ports_in_city',{city:esc(CITY[city].name),u:fmtPorts(portsUsed(city)+reserved),m:portsMax(city)});}
  return {city,net,tier,g1,ex,cost,slots,why};}
function pniPlace(q){const {city,net,tier,g1,ex}=q,lead=pniLead(net);
  if(S.conf&&S.conf.until>S.day)S.stats.beerPni=1;
  if(ex)ex.up={tier,n:ex.n||1,ready:S.day+lead,g1:false};else S.pni.push({id:uid(),city,net,tier,g1:g1||undefined,ready:S.day+lead});
  return lead;}
function pniBatch(net,tier){tier=+tier;const all=net===null;if(!S||(!all&&!isNet(net))||!Number.isInteger(tier)||(tier===-1?all||!pniG1(net):!PORT[tier]||!portShown(tier)))return null;
  const shared=[],orders=[],blocked=[],reserved={};let kept=0,cost=0,mo=0,raised=0;
  // Pending augments and earlier orders in this batch already own their future ports.
  for(const p of S.pni)if(p.up)reserved[p.city]=(reserved[p.city]||0)+Math.max(0,PORT_SLOT(p.up.tier)*(p.up.n||1)-PORT_SLOT(p.tier)*(p.n||1));
  for(const n of all?NETS:[NET[net]])for(const city of n.pops){if(!S.pops[city])continue;shared.push(city);
    // Each network at its own minimum: asking everyone for 10G orders 100G from those that start at 100G.
    const q=pniQuote(city,n.id,all&&tier>=0?Math.max(tier,pniMin(n.id)):tier,reserved[city]||0);if(!q){kept++;continue;}if(q.why){blocked.push(q);continue;}orders.push(q);if(q.tier>tier&&!q.g1)raised++;cost+=q.cost;reserved[city]=(reserved[city]||0)+q.slots;
    mo+=pniMo({net:n.id,tier:q.tier,g1:q.g1,n:q.ex&&q.ex.n},0)-(q.ex?pniMo(q.ex,0):0);}
  return {shared,orders,blocked,kept,cost,mo,raised};}
