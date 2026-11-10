/* ---------- Find a network at a POP (#199) ----------
   The Transit and Peering tabs list every network that sells or peers there: dozens in a big city. One search box and a
   "connected only" switch filter all of them (transit, exchange members, PNIs, caches). View state only, never saved;
   it stays while you hop between POPs, and a Clear button says it is on. */
const netQ=()=>(UI.netQ||'').trim().toLowerCase();
const netFiltered=()=>!!netQ()||!!UI.netOnly;
// on: connected to that network in this list (a transit port, a session, a PNI, a cache box). A number finds an AS.
function netKeep(n,on){const q=netQ();if(q&&!n.name.toLowerCase().includes(q)&&!(n.asn&&String(n.asn).startsWith(q)))return false;return !UI.netOnly||!!on;}
function netFilterHtml(){return `<div class="netf"><input type="search" id="netQ" class="t" value="${esc(UI.netQ||'')}" maxlength="40" autocomplete="off" placeholder="${esc(tr('net_filter.find_a_network'))}" aria-label="${esc(tr('net_filter.find_a_network'))}">
  <div class="btns">${btn(tr('net_filter.connected_only'),'netOnly',{},UI.netOnly?'green sm':'ghost sm')}${netFiltered()?btn(tr('net_filter.clear'),'netClear',{},'ghost sm'):''}</div></div>`;}
const netNone=()=>`<p class="empty">${tr('pni_list.nothing_matches')}</p>`;
// Typing redraws the panel. The morph swaps an input whose value changed, so the new box gets the focus and the caret back.
document.addEventListener('input',e=>{if(e.target.id!=='netQ'||!S)return;const at=e.target.selectionStart;ACT.netFind({q:e.target.value});
  const n=$('netQ');if(n&&n!==e.target){n.focus();try{n.setSelectionRange(at,at);}catch(err){}}});
