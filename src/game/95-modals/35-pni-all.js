function pniAllModal(net,tier=1){const b=pniBatch(net,tier);if(!b)return;UI.pniAll={net,tier};
  const all=net===null,n=NET[net],port=tier===-1?'1G':PORT[tier].n,up=b.orders.filter(q=>q.ex).length,byNet={};
  if(all)for(const q of b.orders)(byNet[q.net]||(byNet[q.net]=[])).push(q.city);
  const controls=`<div class="btns">${btn(all?tr('pni_all.all_at_port',{port}):tr('pni_all.peer_at_port',{port}),'pniAll',{net,tier},'pink',!b.orders.length||S.cash<b.cost)}${btn(tr('common.cancel'),'closeModal',{},'ghost')}</div>`;
  const blocked=b.blocked.map(q=>`<p class="why"><b>${all?esc(NET[q.net].name)+' · ':''}${esc(CITY[q.city].name)}:</b> ${q.why}</p>`).join('');
  openModal(`<div style="display:flex;align-items:center"><div><div class="eyebrow">${all?tr('common.all_networks'):`AS${n.asn} · ${esc(n.name)}`}</div><h2>${all?tr('pni_all.peer_all_networks'):tr('pni_all.peer_on_all_pops')}</h2></div><button class="x" data-act="closeModal" aria-label="${tr('common.close')}">×</button></div>
    <p class="lead">${tr('pni_all.order_missing_and_upgrade_smaller')}</p>
    <div class="trsel"><label>${tr('pni_all.pni_size')}<select data-chg="pniAllSize">${pniG1(net)?`<option value="-1"${tier===-1?' selected':''}>1G</option>`:''}${PORT.map((p,i)=>portShown(i)&&(all||i>=pniMin(net))?`<option value="${i}"${tier===i?' selected':''}>${p.n}</option>`:'').join('')}</select></label></div>
    <div class="kv"><span>${tr('pni_all.new_and_upgrades',{fresh:b.orders.length-up,up})}</span><b>${all?tr('pni_all.n_of_total_connections',{n:b.orders.length,total:b.shared.length}):tr('pni_all.n_of_total_pops',{n:b.orders.length,total:b.shared.length})}</b></div>
    <div class="kv"><span>${tr('pni_all.setup_total')}</span><b>${fmt$(b.cost)}</b></div>
    <div class="kv"><span>${tr('pni_all.additional_per_month')}</span><b>${tr('common.price_mo',{price:fmt$(b.mo)})}</b></div>
    ${b.raised?`<p class="note">${trn('pni_all.n_at_their_minimum_size',b.raised)}</p>`:''}
    ${all?`<p class="note">${tr('pni_all.delivery_and_traffic_charges')}</p>`:n.perG?`<p class="note">${tr('pni_all.traffic_charges_apply',{price:fmt$(n.perG)})}</p>`:''}
    ${S.cash<b.cost?`<p class="why">${tr('interface.not_enough_cash_wait_for_revenue')}</p>`:''}
    ${all?controls:''}
    ${all&&b.orders.length?`<details><summary>${trn('pni_all.n_networks',Object.keys(byNet).length)}</summary>${Object.entries(byNet).map(([id,cities])=>`<div class="kv"><b>${esc(NET[id].name)}</b><span>${trn('save.n_pop',cities.length)}</span></div><div class="pchips">${pniChip(id,null)}</div><p class="meta">${cities.map(c=>esc(CITY[c].name)).join(' · ')}</p>`).join('')}</details>`:b.orders.length?`<div class="pchips">${pniChip(net,null)}</div><p class="meta">${b.orders.map(q=>esc(CITY[q.city].name)).join(' · ')}</p><p class="note">${pniEta(net)}</p>`:''}
    ${b.kept?`<p class="note">${trn('pni_all.n_existing_or_pending_unchanged',b.kept)}</p>`:''}
    ${b.blocked.length?(all?`<details><summary>${trn('pni_all.n_blocked_connections',b.blocked.length)}</summary>${blocked}</details>`:`<h3>${trn('pni_all.n_blocked_pops',b.blocked.length)}</h3>${blocked}`):''}
    ${!b.shared.length?`<p class="why">${all?tr('pni_all.no_shared_locations'):tr('pni_all.no_shared_pops')}</p>`:''}
    ${all?'':controls}`);}
