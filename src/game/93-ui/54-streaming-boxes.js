/* ---------- Binge Boxes without a POP and on exchanges, in the Streaming tab (38-streaming-boxes.js) ----------
   boxSection() (54-streaming-panel.js) explains a box inside an ISP where you have no POP and says how it fills;
   xboxSection() lists the exchanges in a city with the boxes you have on each, for POP cities and remote members alike. */
const boxInLead=()=>`<p class="note">${tr('streaming_boxes.inside_lead')}</p>`;
const boxInFill=id=>{const r=boxFillRate(id,boxPeers());return r===FILL_NET?tr('streaming_boxes.fills_over_peering'):r?tr('streaming_boxes.fills_over_transit'):`<b style="color:var(--bad)">${tr('streaming_boxes.cannot_fill')}</b>`;};
function xboxSection(c){const ids=ixIdsIn(c);if(!ids.length)return '';const C=S.cnt;
  let h=`<section><h3>${tr('streaming_boxes.exchange_boxes')}</h3><p class="lead">${tr('streaming_boxes.xbox_lead',{country:esc(ccName(CITY[c].cc)),p:pct(XBOX_F)})}</p>`;
  for(const x of ids){const have=C.xbox.filter(b=>b.ix===x),why=xboxWhy(x),on=S.ixp[x]!==undefined,nets=on?xbNets(x):[],use=have.reduce((a,b)=>a+(R.useCache[b.id]||0),0),f=have.length?have.reduce((a,b)=>a+b.f,0)/have.length:1;
    h+=`<div class="row"><span class="logo" style="--c:#7B61FF">IX</span><div class="grow"><div class="nm">${esc(ixName(x))}</div><div class="meta">${have.length?`${trn('common.n_box',have.length)} · ${tr('city_panel.serving_v',{v:fmtG(use)})} · ${tr('streaming.hit_p',{p:pct(boxHit(c)*XBOX_F*f)})}${f<1?' · '+tr('streaming.filling_p',{p:pct(f)}):''} · `:''}${trn('streaming_boxes.n_isps',nets.length)}</div>
    ${have.length&&!xbLive(x)?`<div class="why">${tr('streaming_boxes.port_idle',{ix:esc(ixName(x))})}</div>`:why&&!have.length?`<div class="why">${why}</div>`:''}</div>
    <div class="btns">${btn(tr('streaming_boxes.add_box_cost_mo',{cost:fmt$(XBOX_COST),mo:fmt$(XBOX_MO)}),'cntXbox',{ix:x,d:1},'sm',!!why||S.cash<XBOX_COST)}${have.length?btn(tr('streaming.remove_box'),'cntXbox',{ix:x,d:-1},'ghost sm'):''}</div></div>`;}
  return h+`</section>`;}
