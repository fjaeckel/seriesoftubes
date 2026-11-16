/* ---------- the Networks tab of the left panel ----------
   Three hundred networks late in a game: a search box and type chips find one, rows are one compact header each, and
   the blurb, the price and the buttons that jump to your connections show for the one row you opened (or the one
   network in focus). View state only (UI.nlQ, UI.nlT, UI.nlOpen), never saved. */
const nlQ=()=>(UI.nlQ||'').trim().toLowerCase().replace(/^as(?=\d)/,'');
const nlHit=(n,q)=>n.name.toLowerCase().includes(q)||(n.asn&&String(n.asn).startsWith(q));
// Everything about one network below its header: what the old, long rows always showed.
function netMore(n,where,foc,out){const far=foc||out;
  return `<div class="netd">${n.price?`<div class="meta">${tr('hud_and_panels.transit_price_gbps',{price:(n.price*S.priceMul).toFixed(2)})}</div>`:''}<div class="meta">${esc(n.blurb)}</div>${netWhere(n,where)}${!R.nt[n.id]?`<p class="why">${esc(offTransitHint(n.id))}</p>`:''}${coneVia(n.id)&&(R.cone[n.id]||!R.nt[n.id])?`<p class="meta">${R.cone[n.id]?tr('hud_and_panels.reached_through_the_customer_cone_of',{net:esc((NET[R.cone[n.id]]||coneVia(n.id)).name)}):tr('hud_and_panels.buys_transit_from_net_peer_with',{net:esc(coneVia(n.id).name)})}</p>`:''}${meetLine(n,foc?24:4)}</div>`;}
function netRow(n,where,foc,out){const open=!!foc||UI.nlOpen===n.id;
  const head=`${logo(n)}<span class="grow"><span class="nm">${esc(n.name)} <span class="meta">AS${n.asn}</span></span><span class="meta"><span class="tag ${n.type}">${TYPE_L[n.type]}</span> <span class="tag ${n.pol}">${n.pol}</span> · ${tr('hud_and_panels.p_of_traffic',{p:(NSH[n.id]*100).toFixed(1)})}</span><span class="pchips">${pniChip(n.id,null)}</span></span>`;
  return `<div class="row netr${open?' open':''}">${foc?`<div class="neth">${head}</div>`:`<button class="neth" data-act="nlOpen" data-args="${esc(JSON.stringify({id:n.id}))}" aria-expanded="${open}">${head}<span class="nchev" aria-hidden="true">${open?'▾':'▸'}</span></button>`}${open?netMore(n,where,foc,out):''}</div>`;}
function netsTab(){let h='';
  // The introduction is for new players: with a few POPs it only pushes the search box down.
  if(Object.keys(S.pops).length<4)h+=`<p class="lead">${tr('hud_and_panels.every_network_on_the_map_traffic')}</p>`;
  // A new network reaches nobody: a list of red "Not reached" says what, this says how.
  if(!(R.reach>0))h+=`<p class="lead">${tr('hud_and_panels.you_reach_nobody_yet')}</p>`;
  const where=netWhereIdx(),tl=NETS.filter(n=>n.tail),tlOn=tl.filter(n=>where(n.id).some(x=>x[2]==='ix')).length;
  const foc=UI.netFocus&&NET[UI.netFocus]?NET[UI.netFocus]:null,out=!foc&&UI.nf==='out',lostN=ntLost().length;
  const q=foc?'':nlQ(),ty=foc||!TYPE_L[UI.nlT]?'':UI.nlT;
  h+=`<div class="netf nlf"><input type="search" id="nlQ" class="t" value="${esc(UI.nlQ||'')}" maxlength="40" autocomplete="off" placeholder="${esc(tr('net_filter.find_a_network'))}" aria-label="${esc(tr('net_filter.find_a_network'))}">
  <div class="btns">${btn(tr('common.all_networks'),'netFilter',{f:'all'},!foc&&!out?'sm':'ghost sm',false,'',` aria-pressed="${!foc&&!out}"`)}${btn(tr('hud_and_panels.out_of_reach_without_transit_n',{n:lostN}),'netFilter',{f:'out'},out?'sm':'ghost sm',false,'',` aria-pressed="${!!out}"`)}</div>
  <div class="btns nlt">${Object.keys(TYPE_L).map(k=>`<button class="b sm ${ty===k?'green':'ghost'}" data-act="nlType" data-args='{"t":"${k}"}' aria-pressed="${ty===k}">${TYPE_L[k]}</button>`).join('')}${q||ty?btn(tr('net_filter.clear'),'nlClear',{},'ghost sm'):''}</div></div>`;
  // Finding a network comes first; the peering policy is one line under the filters, its choices behind Change.
  if(Object.keys(S.ixp).length||ppol()!=='open')h+=pdeskCard();
  if(S.fed)h+=fedPlayCard();
  {const nc=connsN();if(nc)h+=`<div class="btns" style="margin:6px 0 8px">${btn(tr('hud_and_panels.all_connections_n',{n:nc}),'connOpen',{},'pink sm')}</div>`;}
  // A search looks through the long tail too, open or not. Shown a page at a time: three hundred rows of buttons are slow.
  const nl=(foc?[foc]:out?ntLost():NETS).filter(n=>!n.fed&&(!n.tail||UI.tailOpen||foc||out||q)&&(!ty||n.type===ty)&&(!q||nlHit(n,q)));
  if(!nl.length)h+=q||ty?netNone():out?`<p class="empty">${tr('hud_and_panels.nothing_every_network_is_reachable')}</p>`:'';
  for(const n of nl.slice(0,listN('nets')))h+=netRow(n,where,foc,out);
  h+=listMore('nets',nl.length,n=>trn('hud_and_panels.n_more_networks',n));
  if(!foc&&!out&&!q&&(!ty||tl.some(n=>n.type===ty)))h+=`<div class="row"><div class="grow"><div class="nm">${tr('hud_and_panels.the_long_tail')} <span class="meta">${tr('hud_and_panels.n_small_networks',{n:tl.length})}</span></div><div class="meta">${tr('hud_and_panels.p_of_traffic_between_them_scattered',{p:(tl.reduce((a,n)=>a+NSH[n.id],0)*100).toFixed(1),n:tlOn})}</div></div>${foldB(UI.tailOpen?tr('common.hide'):tr('common.show'),'tailTog',{},UI.tailOpen,'ghost sm',tr('hud_and_panels.the_long_tail'))}</div>`;
  return h;}
// Typing redraws the list. The morph swaps an input whose value changed, so the new box gets the focus and the caret back.
document.addEventListener('input',e=>{if(e.target.id!=='nlQ'||!S)return;const at=e.target.selectionStart;ACT.nlFind({q:e.target.value});
  const n=$('nlQ');if(n&&n!==e.target){n.focus();try{n.setSelectionRange(at,at);}catch(err){}}});
