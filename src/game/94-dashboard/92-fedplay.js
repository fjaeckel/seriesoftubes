/* ================= MULTIPLAYER GAMEPLAY: the players card, a player's sheet, your terms, the review queue =================
   Phones first: everything opens as a sheet (openModal is a bottom sheet on phones, a card on desktop), lists are rows,
   choices are selects. Player-typed names are shown as typed (escaped), AI players with the robot badge. */
const FEDP_POL={open:N_('fedplay.pol_open'),selective:N_('fedplay.pol_selective'),restrictive:N_('fedplay.pol_restrictive')};
const FEDP_AUTO={auto:N_('fedplay.auto_auto'),review:N_('fedplay.auto_review'),decline:N_('fedplay.auto_decline')};
const FEDP_STL={fading:N_('fedplay.st_fading'),dark:N_('fedplay.st_dark')};
const FEDP_WHY={term:N_('fedplay.why_term'),quiet:N_('fedplay.why_quiet'),excluded:N_('fedplay.why_excluded'),muted:N_('fedplay.why_muted'),ratio:N_('fedplay.why_ratio'),mine:N_('fedplay.why_mine'),
  depeer:N_('fedplay.why_depeer'),declined:N_('fedplay.why_declined'),conditions:N_('fedplay.why_conditions')};
const fpCity=c=>CITY[c]?CITY[c].name:c,fpSpeed=m=>fmtG(m/1000);
const fpSel=(lab,f,vals,cur)=>`<label>${lab} <select data-chg="fpPick" data-args="${esc(JSON.stringify({f}))}">${vals.map(([v,t])=>`<option value="${esc(v)}"${String(v)===String(cur)?' selected':''}>${esc(t)}</option>`).join('')}</select></label>`;
// The terms of a deal in a few words.
function fedTermsText(deal,T){if(!T)return '';
  if(deal==='peering')return tr('fedplay.t_peering',{at:T.at.map(fpCity).join(', '),via:T.via==='pni'?'PNI':'IX'});
  if(deal==='transit')return tr('fedplay.t_transit',{g:fpSpeed(T.mbps),price:fmt$(T.perGbps),n:T.term,at:T.at.map(fpCity).join(', ')});
  if(deal==='pni')return tr('fedplay.t_pni',{port:fpSpeed(T.mbps),at:fpCity(T.at),setup:fmt$(T.setup),price:fmt$(T.monthly),n:T.term});
  if(deal==='port')return tr('fedplay.t_port',{port:fpSpeed(T.mbps),at:fpCity(T.at),price:fmt$(T.monthly),n:T.term});
  if(deal==='swap')return tr('fedplay.t_swap',{a:fpCity(T.take.a),b:fpCity(T.take.b),g:fpSpeed(T.take.mbps),n:T.term});
  return '';}
function fedDealState(d){const now=fedNow();
  if(d.st==='wait')return tr('fedplay.s_wait');
  if(d.st==='over')return tr(FEDP_WHY[d.why]||FEDP_WHY.depeer);
  if(d.start>now)return trn('fedplay.s_from',Math.ceil((d.start-now)/FED_DAY));
  return d.end===null?tr('fedplay.s_open'):trn('fedplay.s_left',Math.max(0,Math.ceil((d.end-now)/FED_DAY)));}
function fedDealRow(d){const now=fedNow(),soon=d.st==='run'&&d.end!==null&&d.end-now<7*FED_DAY,renew=d.role!=='sell'&&(soon||d.st==='over'&&d.why!=='excluded'&&d.why!=='muted');
  return `<div class="row"><div class="grow"><div class="nm">${fedDealName(d.deal)}${d.role==='sell'?` <span class="meta">${tr('fedplay.you_sell')}</span>`:''}</div><div class="meta">${esc(fedTermsText(d.deal,d.terms))}</div><div class="meta">${esc(fedDealState(d))}</div></div>
    ${renew?btn(tr('fedplay.renew'),'fpRenew',{id:d.id},'sm'):''}${d.st!=='over'?btn(d.deal==='peering'?tr('fedplay.depeer'):tr('fedplay.end'),'fpEnd',{id:d.id},'ghost sm'):''}</div>`;}

/* ---------- the players card, at the top of the networks tab ---------- */
function fedPlayCard(){const f=S.fed,P=S.fedp,nets=S.fedn?S.fedn.nets:[];
  let h=`<section class="fp-card"><div class="fp-h"><h3>${tr('fedplay.players')}</h3><span class="grow"></span>${btn(tr('fedplay.your_terms'),'fpTerms',{},'ghost sm')}${btn(tr('fedplay.d_consortium'),'fpCons',{},'ghost sm')}</div>`;
  if(P&&P.rq.length)h+=`<div class="btns">${btn(trn('fedplay.n_to_review',P.rq.length),'fpQueue',{},'pink sm')}</div>`;
  if(!nets.length)h+=`<p class="empty">${f.on?tr('fedplay.no_players_yet'):tr('fedplay.join_to_meet')}</p>`;
  for(const s of nets){const n=fedNetOf(s.k);if(!n)continue;const ds=f.deals.filter(d=>d.key===s.k&&d.st!=='over'),p=fedPair(n);
    h+=`<div class="row fp-${s.st}">${logo(n)}<div class="grow"><div class="nm">${fedBot(n)}${esc(n.name)} <span class="meta">AS${n.asn}</span></div>
      <div class="meta"><span class="tag ${s.pol}">${tr(FEDP_POL[s.pol])}</span>${FEDP_STL[s.st]?` <span class="tag fp-q">${tr(FEDP_STL[s.st])}</span>`:''} · ${trn('fedplay.n_pops',s.pops.length)} · ${fmtG(s.tr/1000)}${p.ix.length?' · '+tr('fedplay.meet_at',{at:p.ix.slice(0,3).map(fpCity).join(', ')}):''}</div>
      ${ds.length?`<div class="meta">${ds.map(d=>`<span class="tag fp-d">${fedDealName(d.deal)}</span>`).join(' ')}</div>`:''}</div>${btn(tr('fedplay.deals'),'fpNet',{key:s.k},'ghost sm')}</div>`;}
  if(P&&P.str.length){h+=`<h3 class="fp-sub">${tr('fedplay.strangers')}</h3><p class="meta">${tr('fedplay.strangers_note')}</p>`;
    for(const x of P.str){const n=fedNetOf(x.k);if(!n)continue;h+=`<div class="row"><div class="grow"><div class="nm">${fedBot(n)}${esc(n.name)}</div><div class="meta">${fmtG(x.mbps/1000)}</div></div>${btn(tr('fedplay.d_peering'),'fpNet',{key:x.k},'sm')}</div>`;}}
  const open=P?P.cons.filter(c=>c.st==='open'):[];
  if(open.length){h+=`<h3 class="fp-sub">${tr('fedplay.cons_projects')}</h3>`;for(const c of open)h+=fedConsRow(c);}
  return h+'</section>';}
function fedConsRow(c){return `<div class="row"><div class="grow"><div class="nm">🚢 ${esc(c.name)}</div><div class="meta">${tr('fedplay.cons_meta',{a:fpCity(c.a),b:fpCity(c.b),n:c.sg.length,m:c.m,pairs:c.pr,share:fmt$(c.sh)})}</div></div>
  ${c.me?`<span class="meta">${tr('fedplay.cons_in')}</span>`:btn(tr('fedplay.cons_join'),'fpConsJoin',{id:c.id},'sm',S.cash<c.sh||!S.fed.on)}</div>`;}

/* ---------- one player's sheet: their terms, your deals with them, what you can ask for ---------- */
function fedNetModal(key){const n=fedNetOf(key);if(!n){closeModal();return;}UI.fpOpen={k:'net',key};const a=FEDN.ann.get(key),B=a&&a.rec?a.rec.body:null,p=fedPair(n),sel=UI.fpSel||{},me=fedMeFor(n);
  let h=`<div style="display:flex;align-items:center"><div><div class="eyebrow">${tr('fedplay.player_network')} · AS${n.asn}${n.home?' · '+esc(n.home):''}</div><h2 style="font-size:24px">${fedBot(n)}${esc(n.name)}</h2></div><button class="x" data-act="closeModal" aria-label="${tr('common.close')}">×</button></div>`;
  h+=`<div class="facts"><span class="fact">${tr(FEDP_POL[n.fpol]||FEDP_POL.open)}</span><span class="fact">${trn('fedplay.n_pops',n.fpops.length)}</span><span class="fact">${trn('fedplay.n_exchanges',n.fix.length)}</span><span class="fact">${fmtG((n.ftr||0)/1000)}</span>${n.ai?`<span class="fact">🤖 ${tr('fedplay.ai_player')}</span>`:''}</div>`;
  if(n.fst==='fading')h+=`<p class="note">${tr('fedplay.fading_note')}</p>`;else if(n.fst==='dark')h+=`<p class="note">${tr('fedplay.dark_note')}</p>`;
  h+=`<p class="meta">${tr('fedplay.you_and_them',{in:fmtG(p.in/1000),out:fmtG(p.out/1000),ix:p.ix.length,pops:p.pops.length})}</p>`;
  const ds=S.fed.deals.filter(d=>d.key===key&&(d.st!=='over'||fedNow()-(d.end||d.start||0)<30*FED_DAY));
  if(ds.length)h+=`<h3 class="fp-sub">${tr('fedplay.your_deals')}</h3>`+ds.map(fedDealRow).join('');
  if(!B){h+=`<p class="empty">${tr('fedplay.no_terms_yet')}</p>`;openModal(h);return;}
  // Their published terms, and what this network still misses.
  h+=`<h3 class="fp-sub">${tr('fedplay.their_terms')}</h3>`;
  if(B.policy==='selective'&&B.cond){const c=B.cond,miss=fedCondMiss(c,me);h+=`<p class="meta">${tr('fedplay.cond_line',{mbps:fpSpeed(c.minMbps),r:c.maxRatio>=100000?'∞':Math.round(c.maxRatio/100),n:c.minShared})}${c.rpki?' · RPKI':''}${c.tier1?' · '+tr('common.tier_1'):''}${c.ai?'':' · '+tr('fedplay.no_ai')}</p>${miss.length?`<p class="why">${esc(fedMissText(miss))}</p>`:''}`;}
  const R0=B.rates||{};
  if(R0.transit)h+=`<p class="meta">${tr('fedplay.rate_transit',{price:fmt$(R0.transit.perGbps),n:R0.transit.term})}${R0.transit.commit.map(x=>` · ${fpSpeed(x.mbps)} −${x.off/10}%`).join('')}</p>`;
  if(R0.pni)h+=`<p class="meta">${tr('fedplay.rate_pni',{setup:fmt$(R0.pni.setup),n:R0.pni.term})} ${R0.pni.ports.map(x=>`${fpSpeed(x.mbps)} ${tr('common.price_mo',{price:fmt$(x.monthly)})}`).join(' · ')}</p>`;
  if(R0.ix)h+=`<p class="meta">${tr('fedplay.rate_ix',{at:R0.ix.at.map(fpCity).join(', ')})} ${R0.ix.ports.map(x=>`${fpSpeed(x.mbps)} ${tr('common.price_mo',{price:fmt$(x.monthly)})}`).join(' · ')}</p>`;
  if(!R0.transit&&!R0.pni&&!R0.ix)h+=`<p class="meta">${tr('fedplay.sells_nothing')}</p>`;
  // What you can ask for.
  h+=`<h3 class="fp-sub">${tr('fedplay.ask_for')}</h3>`;
  const ask=(deal,o,fields,extra='')=>{const x=fedOffer(key,deal,o),mode=B.auto[deal];
    return `<div class="fp-ask"><div class="nm">${fedDealName(deal)} <span class="meta">${tr(FEDP_AUTO[mode]||FEDP_AUTO.review)}</span></div>${fields?`<div class="trsel">${fields}</div>`:''}${x.terms&&!x.miss.length?`<p class="meta">${esc(fedTermsText(deal,x.terms))}</p>`:''}${extra}
      ${x.miss.length?`<p class="why">${esc(fedMissText(x.miss))}</p>`:''}<div class="btns">${btn(tr('common.request'),'fpReq',{key,deal,...o},'sm',!!x.miss.length||!S.fed.on)}</div></div>`;};
  {const o=sel['peering.via']==='pni'?{via:'pni',at:sel['peering.at']}:{via:'ix',at:sel['peering.at']},cs=o.via==='pni'?p.pops:p.ix;
    h+=ask('peering',o,fpSel(tr('fedplay.via'),'peering.via',[['ix','IX'],['pni','PNI']],o.via)+(cs.length?fpSel(tr('fedplay.where'),'peering.at',(o.via==='ix'?[['',tr('fedplay.everywhere')]]:[]).concat(cs.map(c=>[c,fpCity(c)])),o.at||''):''));}
  if(R0.transit){const o={at:sel['transit.at']||p.pops[0],mbps:+sel['transit.mbps']||(R0.transit.commit[0]?R0.transit.commit[0].mbps:1000),term:+sel['transit.term']||R0.transit.term},ce=o.at?fedCeil(o.at):Infinity,x=fedOffer(key,'transit',o);
    const tiers=[...new Set([1000,...R0.transit.commit.map(c=>c.mbps)])].sort((a,b)=>a-b);
    h+=ask('transit',o,(p.pops.length?fpSel(tr('fedplay.where'),'transit.at',p.pops.map(c=>[c,fpCity(c)]),o.at):'')+fpSel(tr('fedplay.commit'),'transit.mbps',tiers.map(m=>[m,fpSpeed(m)]),o.mbps)+fpSel(tr('fedplay.term'),'transit.term',FEDP_TERMS.filter(t=>t>=R0.transit.term).concat(R0.transit.term).filter((t,i,l)=>l.indexOf(t)===i).sort((a,b)=>a-b).map(t=>[t,trn('fedplay.n_days',t)]),o.term),
      x.terms&&ce<Infinity?`<p class="meta">${x.terms.perGbps>ce?tr('fedplay.dearer_than_computer',{price:fmt$(ce)}):tr('fedplay.cheaper_than_computer',{price:fmt$(ce)})}</p>`:'');}
  if(R0.pni){const o={at:sel['pni.at']||p.pops[0],mbps:+sel['pni.mbps']||R0.pni.ports[0].mbps};
    h+=ask('pni',o,(p.pops.length?fpSel(tr('fedplay.where'),'pni.at',p.pops.map(c=>[c,fpCity(c)]),o.at):'')+fpSel(tr('fedplay.port'),'pni.mbps',R0.pni.ports.map(x=>[x.mbps,fpSpeed(x.mbps)]),o.mbps));}
  if(R0.ix){const cs=R0.ix.at.filter(c=>S.pops[c]),o={at:sel['port.at']||cs[0],mbps:+sel['port.mbps']||R0.ix.ports[0].mbps};
    h+=ask('port',o,(cs.length?fpSel(tr('fedplay.where'),'port.at',cs.map(c=>[c,fpCity(c)]),o.at):'')+fpSel(tr('fedplay.port'),'port.mbps',R0.ix.ports.map(x=>[x.mbps,fpSpeed(x.mbps)]),o.mbps));}
  {const prs=fedSwapPairs(n),o={at:sel['swap.at']||prs[0],mbps:+sel['swap.mbps']||10000};
    h+=ask('swap',o,(prs.length?fpSel(tr('fedplay.route'),'swap.at',prs.map(k=>[k,k.split('|').map(fpCity).join('–')]),o.at):'')+fpSel(tr('fedplay.capacity'),'swap.mbps',[[10000,'10G'],[100000,'100G'],[400000,'400G']],o.mbps),`<p class="meta">${tr('fedplay.swap_note')}</p>`);}
  h+=`<div class="btns" style="margin-top:10px">${btn(tr('fedplay.mute'),'fedMute',{key,on:true},'ghost sm')}</div>`;
  openModal(h);}

/* ---------- your published terms ---------- */
const fpDraft=()=>UI.fpDraft||(UI.fpDraft=JSON.parse(JSON.stringify({pol:fedP().pol,cond:fedP().cond,rates:fedP().rates,auto:fedP().auto})));
const FEDP_DEF={transit:()=>({perGbps:Math.max(1,Math.round(fedCeilMine()*0.8)),commit:[{mbps:10000,off:100},{mbps:100000,off:250}],term:90}),
  pni:()=>({setup:5000,ports:[{mbps:10000,monthly:1500},{mbps:100000,monthly:9000}],term:180}),ix:()=>({ports:[{mbps:10000,monthly:800},{mbps:100000,monthly:4000}],join:'anyone'})};
// One field of the draft, from the editor's inputs (a value as typed: checked here and again when saved).
function fedTermsEdit(f,v){const D=fpDraft(),n=x=>{const k=Math.round(+x);return Number.isFinite(k)?Math.max(0,k):0;},on=v==='1'||v===true||v==='true';f=String(f);
  if(f==='pol'&&FEDP_POL[v]){D.pol=v;if(v==='restrictive'&&D.auto.peering==='auto')D.auto.peering='review';}
  else if(f==='c.minMbps')D.cond.minMbps=Math.min(1e9,n(v)*1000);else if(f==='c.maxRatio'&&FEDP_RATIO.includes(+v))D.cond.maxRatio=+v;else if(f==='c.minShared')D.cond.minShared=Math.min(64,n(v));
  else if(['c.rpki','c.tier1','c.ai'].includes(f))D.cond[f.slice(2)]=on;
  else if(f.startsWith('a.')&&FEDP_DEALS.includes(f.slice(2))&&FEDP_AUTO[v])D.auto[f.slice(2)]=D.pol==='restrictive'&&f==='a.peering'&&v==='auto'?'review':v;
  else if(f==='tr.on'){if(on)D.rates.transit=D.rates.transit||FEDP_DEF.transit();else delete D.rates.transit;}
  else if(f==='tr.price'&&D.rates.transit)D.rates.transit.perGbps=Math.min(fedCeilMine(),Math.max(1,n(v)));else if(f==='tr.term'&&D.rates.transit&&FEDP_TERMS.includes(+v))D.rates.transit.term=+v;
  else if(f==='pni.on'){if(on)D.rates.pni=D.rates.pni||FEDP_DEF.pni();else delete D.rates.pni;}
  else if(f==='pni.setup'&&D.rates.pni)D.rates.pni.setup=Math.min(1e9,n(v));else if(f==='pni.term'&&D.rates.pni&&FEDP_TERMS.includes(+v))D.rates.pni.term=+v;
  else if(/^pni\.m[01]$/.test(f)&&D.rates.pni){const p=D.rates.pni.ports[+f.slice(-1)];if(p)p.monthly=Math.min(1e9,n(v));}
  else if(f==='ix.on'){if(on)D.rates.ix=D.rates.ix||FEDP_DEF.ix();else delete D.rates.ix;}
  else if(f==='ix.join'&&D.rates.ix&&['anyone','selective','approval'].includes(v))D.rates.ix.join=v;
  else if(/^ix\.m[01]$/.test(f)&&D.rates.ix){const p=D.rates.ix.ports[+f.slice(-1)];if(p)p.monthly=Math.min(1e9,n(v));}}
// Saves terms and announces them at once. Running deals keep the terms they were made on (prices change at renewal).
function fedTermsApply(t){const P=fedP();t=t&&typeof t==='object'?t:{};P.pol=FEDP_POL[t.pol]?t.pol:P.pol;P.cond=fedCondClean(t.cond);P.rates=fedRatesClean(t.rates);
  if(P.rates.transit)P.rates.transit.perGbps=Math.min(fedCeilMine(),P.rates.transit.perGbps);
  P.auto=fedAutoClean(t.auto,P.pol);if(P.rates.ix)P.auto.port=P.rates.ix.join==='approval'?'review':P.auto.port==='decline'?'decline':'auto';
  return fedAnnounceMaybe(true).then(()=>null);}
function fedTermsModal(){UI.fpOpen={k:'terms'};const D=fpDraft(),c=D.cond,r=D.rates,inp=(f,v,w=7)=>`<input type="number" min="0" inputmode="numeric" size="${w}" value="${esc(v)}" data-chg="fpEdit" data-args="${esc(JSON.stringify({f}))}">`;
  const sel=(f,vals,cur)=>`<select data-chg="fpEdit" data-args="${esc(JSON.stringify({f}))}">${vals.map(([v,t])=>`<option value="${esc(v)}"${String(v)===String(cur)?' selected':''}>${esc(t)}</option>`).join('')}</select>`;
  const yn=(f,on)=>sel(f,[['1',tr('common.on')],['0',tr('common.off')]],on?'1':'0'),terms=FEDP_TERMS.map(t=>[t,trn('fedplay.n_days',t)]);
  let h=`<div style="display:flex;align-items:center"><div><div class="eyebrow">${tr('fedplay.players')}</div><h2 style="font-size:24px">${tr('fedplay.your_terms')}</h2></div><button class="x" data-act="closeModal" aria-label="${tr('common.close')}">×</button></div>
  <p class="meta">${tr('fedplay.terms_note')}</p>
  <h3 class="fp-sub">${tr('fedplay.peering_policy')}</h3><div class="trsel"><label>${sel('pol',Object.keys(FEDP_POL).map(k=>[k,tr(FEDP_POL[k])]),D.pol)}</label></div>`;
  if(D.pol==='selective')h+=`<div class="trsel fp-grid"><label>${tr('fedplay.min_traffic')} ${inp('c.minMbps',Math.round(c.minMbps/1000),5)}</label>
    <label>${tr('fedplay.max_ratio')} ${sel('c.maxRatio',FEDP_RATIO.map(x=>[x,x>=100000?'∞':Math.round(x/100)+':1']),c.maxRatio)}</label>
    <label>${tr('fedplay.min_shared')} ${inp('c.minShared',c.minShared,3)}</label><label>RPKI ${yn('c.rpki',c.rpki)}</label><label>${tr('common.tier_1')} ${yn('c.tier1',c.tier1)}</label><label>🤖 ${tr('fedplay.ai_ok')} ${yn('c.ai',c.ai)}</label></div>`;
  h+=`<h3 class="fp-sub">${tr('fedplay.d_transit')}</h3><div class="trsel fp-grid"><label>${tr('fedplay.sell')} ${yn('tr.on',!!r.transit)}</label>`;
  if(r.transit)h+=`<label>${tr('fedplay.per_gbps')} ${inp('tr.price',r.transit.perGbps,5)}</label><label>${tr('fedplay.term')} ${sel('tr.term',terms,r.transit.term)}</label>`;
  h+=`</div>${r.transit?`<p class="meta">${tr('fedplay.ceiling_note',{price:fmt$(fedCeilMine())})}</p>`:''}<h3 class="fp-sub">${tr('fedplay.d_pni')}</h3><div class="trsel fp-grid"><label>${tr('fedplay.sell')} ${yn('pni.on',!!r.pni)}</label>`;
  if(r.pni)h+=`<label>${tr('fedplay.setup')} ${inp('pni.setup',r.pni.setup)}</label>${r.pni.ports.slice(0,2).map((x,i)=>`<label>${fpSpeed(x.mbps)}/${tr('fedplay.month')} ${inp('pni.m'+i,x.monthly)}</label>`).join('')}<label>${tr('fedplay.term')} ${sel('pni.term',terms,r.pni.term)}</label>`;
  h+=`</div>`;
  if(Object.keys(S.myIx).length){h+=`<h3 class="fp-sub">${tr('fedplay.your_exchange')}</h3><div class="trsel fp-grid"><label>${tr('fedplay.sell')} ${yn('ix.on',!!r.ix)}</label>`;
    if(r.ix)h+=`${r.ix.ports.slice(0,2).map((x,i)=>`<label>${fpSpeed(x.mbps)}/${tr('fedplay.month')} ${inp('ix.m'+i,x.monthly)}</label>`).join('')}<label>${tr('fedplay.who_joins')} ${sel('ix.join',[['anyone',tr('fedplay.join_anyone')],['selective',tr('fedplay.join_selective')],['approval',tr('fedplay.join_approval')]],r.ix.join)}</label>`;
    h+=`</div>`;}
  h+=`<h3 class="fp-sub">${tr('fedplay.requests')}</h3><div class="trsel fp-grid">${FEDP_DEALS.map(k=>`<label>${fedDealName(k)} ${sel('a.'+k,Object.keys(FEDP_AUTO).map(m=>[m,tr(FEDP_AUTO[m])]),D.auto[k])}</label>`).join('')}</div>
  <h3 class="fp-sub">RPKI</h3><div class="row"><div class="grow"><div class="meta">${tr('fedplay.rpki_note',{price:fmt$(FEDP_RPKI_MO)})}</div></div>${btn(fedP().rpki?tr('common.on'):tr('common.off'),'fpRpki',{on:!fedP().rpki},fedP().rpki?'green sm':'ghost sm')}</div>
  <div class="btns cta">${btn(tr('fedplay.save'),'fpTermsSave',{},'pink')}${btn(tr('common.cancel'),'closeModal',{},'ghost')}</div>`;
  openModal(h);}

/* ---------- consortium cables ---------- */
function fedConsModal(){UI.fpOpen={k:'cons'};const sel=UI.fpSel||{},pops=Object.keys(S.pops).sort((x,y)=>fpCity(x).localeCompare(fpCity(y))),a=sel['cons.a']&&S.pops[sel['cons.a']]?sel['cons.a']:pops[0],
    b=sel['cons.b']&&S.pops[sel['cons.b']]&&sel['cons.b']!==a?sel['cons.b']:pops.find(c=>c!==a),pairs=+sel['cons.pairs']||2,members=+sel['cons.members']||3,P=fedP();
  let h=`<div style="display:flex;align-items:center"><div><div class="eyebrow">${tr('fedplay.players')}</div><h2 style="font-size:24px">🚢 ${tr('fedplay.cons_title')}</h2></div><button class="x" data-act="closeModal" aria-label="${tr('common.close')}">×</button></div>
  <p class="meta">${tr('fedplay.cons_note')}</p>`;
  const open=P.cons.filter(c=>c.st==='open');if(open.length)h+=`<h3 class="fp-sub">${tr('fedplay.cons_projects')}</h3>`+open.map(fedConsRow).join('');
  const done=P.cons.filter(c=>c.st==='funded'&&c.me);if(done.length)h+=done.map(c=>`<p class="meta">✅ ${esc(c.name)} · ${tr('fedplay.cons_meta',{a:fpCity(c.a),b:fpCity(c.b),n:c.sg.length,m:c.m,pairs:c.pr,share:fmt$(c.sh)})}</p>`).join('');
  h+=`<h3 class="fp-sub">${tr('fedplay.cons_start')}</h3>`;
  if(!b)h+=`<p class="empty">${tr('fedplay.cons_need_pops')}</p>`;
  else{const share=fedConsShare(a,b,pairs);
    h+=`<div class="trsel fp-grid">${fpSel(tr('common.from'),'cons.a',pops.map(c=>[c,fpCity(c)]),a)}${fpSel(tr('common.to'),'cons.b',pops.filter(c=>c!==a).map(c=>[c,fpCity(c)]),b)}
      ${fpSel(tr('fedplay.pairs'),'cons.pairs',[1,2,4,8].map(n=>[n,String(n)]),pairs)}${fpSel(tr('fedplay.members'),'cons.members',[2,3,4,5,6,8].map(n=>[n,String(n)]),members)}</div>
      <p class="meta">${tr('fedplay.cons_share',{share:fmt$(share),km:seatKm(a,b).toLocaleString(),n:seatDays(seatKm(a,b))})}</p>
      <div class="btns">${btn(tr('fedplay.cons_open_btn'),'fpConsNew',{a,b,pairs,members},'pink sm',S.cash<share||!S.fed.on)}</div>`;}
  openModal(h);}

/* ---------- the NOC dashboard: requests waiting for review, and what deals with players cost and earn ---------- */
function fedPlayDash(){const P=S.fedp,f=S.fed;if(!P&&!f.deals.length)return '';const run=f.deals.filter(d=>d.on);
  let h=`<div class="panel2 fp-dash" style="margin-top:12px"><h3>${tr('fedplay.players')}</h3><p class="meta">${tr('fedplay.dash_line',{n:run.length,cost:fmt$((R.cost&&R.cost.fed)||0),earn:fmt$((R.rev&&R.rev.fed)||0)})}${P&&P.help?' · '+trn('fedplay.n_helped',P.help):''}</p>`;
  const rq=P?P.rq:[];if(!rq.length)h+=`<p class="empty">${tr('fedplay.nothing_to_review')}</p>`;
  for(const q of rq){const n=fedNetOf(q.rec.key),b=q.rec.body;
    h+=`<div class="row"><div class="grow"><div class="nm">${n?fedBot(n)+esc(n.name):'AS?'} · ${fedDealName(b.deal)}</div><div class="meta">${esc(fedTermsText(b.deal,b.terms))}</div></div>${btn(tr('common.accept'),'fpAccept',{id:q.id},'sm')}${btn(tr('common.decline'),'fpDecline',{id:q.id},'ghost sm')}</div>`;}
  return h+'</div>';}
