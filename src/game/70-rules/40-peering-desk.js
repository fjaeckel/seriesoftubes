/* ---------- The peering desk ----------
   Every exchange port brings peering requests. Nobody answers them by hand any more: your peering policy does.
   Open accepts everyone, Selective accepts the networks worth peering with and quietly declines the rest, Closed
   declines them all. Once a week the NOC log gets one folded line about it. */
const PPOL=['open','selective','closed'],ppol=()=>(S&&PPOL.includes(S.ppol))?S.ppol:'open';
const PPOL_N={open:N_('peering_desk.open_to_all'),selective:N_('common.selective'),closed:N_('common.closed')};
const PPOL_D={open:N_('peering_desk.open_desc'),selective:N_('peering_desk.selective_desc'),closed:N_('peering_desk.closed_desc')};
// How often someone asks, against Open: a selective or closed network gets fewer requests.
const PDESK_ASK={open:1,selective:0.7,closed:0.5},PDESK_IX=12;
const pdeskNew=w=>({w,a:0,d:0,ix:[]});
// Who is worth it: a real small network on the exchange, or a newcomer whose PeeringDB is up to date.
const pdeskWant=(p,net,fresh)=>p==='open'||(p==='selective'&&(!!net||fresh));
function peeringDeskDay(d){const w=Math.floor(d/7);let D=S.pdesk;
  // A new week: last week's tally becomes one line in the NOC log.
  if(!D||D.w!==w){if(D&&D.w<w&&(D.a||D.d)){S.pdeskRep={...D,p:ppol()};logNote(esc(pdeskLine(S.pdeskRep)),'',[],{a:'tab',v:'nets'});}D=S.pdesk=pdeskNew(w);}
  const ixs=Object.keys(S.ixp),p=ppol();
  if(!ixs.length||Math.random()>=Math.min(0.9,0.15*ixs.length)*PDESK_ASK[p])return;
  const c=pick(ixs),real=ixMembers(c).filter(id=>{const n=NET[id];return !S.peers[id+'@'+c]&&!merged(id)&&n.type!=='t1'&&n.type!=='cdn'&&n.pol!=='paid'&&n.share<=0.006;});
  const net=real.length&&Math.random()<0.4?pick(real):null,fresh=Math.random()>=0.6;
  if(!pdeskWant(p,net,fresh)){D.d++;return;}
  if(net)S.peers[net+'@'+c]=true;D.a++;if(!D.ix.includes(c)&&D.ix.length<PDESK_IX)D.ix.push(c);}
// "Peering desk: 7 new sessions at DE-KICKS and LINX, 3 declined (Selective)."
function pdeskLine(x){const pol=tr(PPOL_N[x.p]||PPOL_N.open);if(!x.a)return trn('peering_desk.n_requests_declined',x.d,{pol});
  const nm=x.ix.slice(0,x.ix.length>4?3:4).map(ixName);if(x.ix.length>4)nm.push(trn('peering_desk.n_more_exchanges',x.ix.length-3));
  let ix;try{ix=new Intl.ListFormat(LANG,{type:'conjunction'}).format(nm);}catch(e){ix=nm.join(', ');}
  return x.d?trn('peering_desk.n_new_sessions_at_ix_declined',x.a,{ix,d:x.d,pol}):trn('peering_desk.n_new_sessions_at_ix',x.a,{ix,pol});}
// The policy picker, in the Networks tab.
function pdeskCard(){const p=ppol(),r=S.pdeskRep;
  return `<div class="ibx ibxcard"><div class="nm">🤝 ${tr('common.peering_policy')}: ${tr(PPOL_N[p])}</div><div class="seg">${PPOL.map(x=>btn(tr(PPOL_N[x]),'peerPol',{p:x},p===x?'sm':'ghost sm')).join('')}</div>
  <p class="meta">${tr(PPOL_D[p])}</p>${r&&r.w>=Math.floor(S.day/7)-1&&(r.a||r.d)?`<p class="meta">${esc(pdeskLine(r))}</p>`:''}</div>`;}
