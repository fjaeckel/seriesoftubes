function breaksDiverse(remSet){
  if(!remSet||!remSet.size)return [];
  const broken=[];
  const rem=remoteCities(),ok=c=>popUp(c)||rem.includes(c);
  const live=S.links.filter(l=>!remSet.has(l.id)&&!linkDown(l)&&ok(l.a)&&ok(l.b));
  for(const b of S.biz){
    if((b.reqs||[]).includes('diverse')){
      if(!disjointRoutes(b.city,b.city2,live))broken.push(b);
    }
  }
  return broken;
}

function redundModal(){
  const RUI=UI.redund;if(!RUI)return;
  const {a,b}=RUI;
  const pl=pairLinks(a,b);
  if(!pl.length){closeModal();return;}

  const listEl=typeof $ === 'function' ? $('redundList') : null;
  const listScroll=listEl?listEl.scrollTop:0;
  const cardEl=typeof $ === 'function' ? $('modalCard') : null;
  const cardScroll=cardEl?cardEl.scrollTop:0;

  const sel=RUI.sel||(RUI.sel=new Set());
  const isLeased=l=>S.biz.some(x=>x.link===l.id)||S.offers.some(x=>x.link===l.id);

  const eligible=pl.filter(l=>!isLeased(l));
  const allSelected=eligible.length>0&&eligible.every(l=>sel.has(l.id));

  const totCap=pl.reduce((s,l)=>s+capOf(l),0);
  const curLoad=pl.reduce((s,l)=>s+(R.load[l.id]||0),0);
  const remLinks=pl.filter(l=>!sel.has(l.id));
  const remCap=remLinks.reduce((s,l)=>s+capOf(l),0);
  const selLinks=pl.filter(l=>sel.has(l.id));
  const saveMo=selLinks.reduce((s,l)=>s+(l.mo||0),0);

  const breaksDiv=breaksDiverse(sel);
  const wouldCutAll=remLinks.length===0;
  if(!wouldCutAll&&RUI.confirm)RUI.confirm=false;
  const overloaded=remLinks.length>0&&curLoad>remCap+1e-6;
  const dropAmount=overloaded?curLoad-remCap:0;
  const toRemove=pl.filter(l=>sel.has(l.id)&&!isLeased(l));
  const canRemove=toRemove.length>0;
  const goLabel=wouldCutAll&&RUI.confirm?tr('common.are_you_sure'):tr('link_panels.remove_n_links_save_mo',{n:sel.size,mo:fmt$(saveMo)});

  const idleLinks=pl.filter(l=>!isLeased(l)&&((R.load[l.id]||0)<1e-3||l.standby));
  const sortedIdle=idleLinks.slice().sort((x,y)=>capOf(y)-capOf(x)||x.mo-y.mo);
  const targetIdle=idleLinks.length===pl.length?sortedIdle.slice(1):idleLinks;
  const allIdleSelected=targetIdle.length>0&&targetIdle.every(l=>sel.has(l.id));

  const trk=pl[0].trench||pl[0].id;
  const rows=pl.map(l=>{
    const leased=isLeased(l);
    const u=R.load[l.id]||0;
    const c=capOf(l);
    const checked=sel.has(l.id);
    return `<label class="row" style="cursor:${leased?'not-allowed':'pointer'};opacity:${leased?0.6:1}">
      <input type="checkbox" data-act="redundToggle" data-args='${esc(JSON.stringify({id:l.id}))}' ${checked?'checked':''} ${leased?'disabled':''}>
      <div class="grow">
        <div class="nm">${esc(capName(l))} ${l.cut>S.day?`<span class="tag restrictive">${tr('common.cut')}</span>`:''} ${l.standby?`<span class="tag st">${tr('common.standby')}</span>`:''} ${leased?`<span class="tag restrictive">${tr('link_panels.leased_to_customer')}</span>`:''}</div>
        <div class="meta">${(l.trench||l.id)===trk?tr('common.same_trench'):tr('common.diverse_route')} · ${fmtG(u)} / ${fmtG(c)} · ${tr('common.price_mo',{price:fmt$(l.mo)})}</div>
      </div>
    </label>`;
  }).join('');

  openModal(`<div style="display:flex;align-items:center">
    <div>
      <div class="eyebrow">${tr('common.redundancy')}</div>
      <h2 style="font-size:24px">${tr('link_panels.redundancy_title',{a:CITY[a].name,b:CITY[b].name})}</h2>
    </div>
    <button class="x" data-act="closeModal" aria-label="${tr('common.close')}">×</button>
  </div>
  <p class="lead" style="margin-top:6px">${trn('decommission.n_link',pl.length)} · ${fmtG(curLoad)} / ${fmtG(totCap)} ${tr('common.in_use')}</p>
  <div class="btns" style="margin-bottom:8px">
    ${btn(allSelected?tr('link_panels.deselect_all'):tr('link_panels.select_all'),'redundSelectAll',{},'ghost sm',!eligible.length)}
    ${targetIdle.length?btn(allIdleSelected?tr('link_panels.deselect_idle'):tr('link_panels.select_idle_and_standby'),'redundSelectIdle',{},'ghost sm'):''}
  </div>
  <div id="redundList" style="max-height:280px;overflow-y:auto;margin-bottom:8px">${rows}</div>
  <div class="kv"><span>${tr('common.capacity')}</span><b>${fmtG(remCap)} / ${fmtG(totCap)}</b></div>
  ${sel.size?`<div class="kv"><span>${tr('common.per_month')}</span><b style="color:var(--eye)">-${fmt$(saveMo)}/mo</b></div>`:''}
  ${wouldCutAll?`<p class="why">${tr('link_panels.removing_all_links_will_disconnect')}</p>`:overloaded?`<p class="why">${tr('link_panels.traffic_exceeds_remaining_capacity',{load:fmtG(curLoad),cap:fmtG(remCap),drop:fmtG(dropAmount)})}</p>`:remLinks.length?`<p class="note" style="color:var(--eye)">${tr('link_panels.remaining_capacity_sufficient',{cap:fmtG(remCap),load:fmtG(curLoad)})}</p>`:''}
  ${breaksDiv.length?`<p class="why">${breaksDiv.map(cd=>tr('link_panels.breaks_diverse_for',{name:esc(cd.name)})).join('<br>')}</p>`:''}
  <div class="btns" style="margin-top:8px">${btn(goLabel,'redundGo',{},'red sm',!canRemove)}</div>`);

  const restoreScroll=()=>{
    const nextList=typeof $ === 'function' ? $('redundList') : null;
    if(nextList&&listScroll)nextList.scrollTop=listScroll;
    const nextCard=typeof $ === 'function' ? $('modalCard') : null;
    if(nextCard&&cardScroll)nextCard.scrollTop=cardScroll;
  };
  restoreScroll();
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(restoreScroll);
}
