/* ---------- Buy what a customer asks for, on signing (#241) ----------
   Some requirements are hardware at a POP you already have: a backup generator, a second router, a second building.
   An offer that asks for them gets a second button that buys exactly what is missing and signs, with the price on it.
   Never silent: the player presses it, and nothing is bought unless the deal can be signed right after. */
const REQ_FIX=['gen','routers','metro'];
// What is missing for this offer, priced as the Infra tab's own buttons price it: [{k, city, cost, mo}], with totals.
function reqFix(o){if(!o||!bHas(o)||pzOn())return null;const items=[],cs=[o.city,o.city2].filter(Boolean);
  for(const k of o.reqs||[]){if(!REQ_FIX.includes(k)||!REQS[k]||REQS[k].ok(o))continue;
    for(const c of k==='routers'?[o.city]:cs){const p=S.pops[c];if(!p||items.some(x=>x.k===k&&x.city===c))continue;
      if(k==='gen'&&!p.gen)items.push({k,city:c,cost:GEN_COST,mo:GEN_MO});
      else if(k==='metro'&&!p.site2)items.push({k,city:c,cost:SITE2_COST,mo:SITE2_MO});
      else if(k==='routers'&&(p.routers||1)<2){const g=p.rgen||0;items.push({k,city:c,cost:routerCost(g,p.routers||1),mo:routerMo(g)});}}}
  if(!items.length)return null;return {items,cost:items.reduce((a,x)=>a+x.cost,0),mo:items.reduce((a,x)=>a+x.mo,0)};}
// Whether accept() would sign this offer now: the same checks, so money is never spent on a deal that then refuses.
const reqFixCanSign=o=>bHas(o)&&!(BIZ_T[o.type].event&&S.day>=o.start);
const REQ_FIX_L={gen:N_('req_fix.generator_in_city'),routers:N_('req_fix.second_router_in_city'),metro:N_('req_fix.second_site_in_city')};
// The button and one line saying what it buys. sm: the button size the list around it uses.
function reqFixHtml(o){const q=reqFix(o);if(!q||!reqFixCanSign(o))return '';
  return `<div class="meta">${tr('req_fix.buys_list',{list:q.items.map(x=>tr(REQ_FIX_L[x.k],{city:CITY[x.city].name})).join(', '),cost:fmt$(q.cost),mo:fmt$(q.mo)})}</div>
    <div class="btns">${btn(tr('req_fix.buy_and_sign',{cost:fmt$(q.cost)}),'acceptFix',{id:o.id,cost:q.cost},'pink sm',S.cash<q.cost)}</div>`;}
