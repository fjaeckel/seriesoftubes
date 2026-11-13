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
  if(deal==='wave')return tr('fedplay.t_wave',{g:fmtCap(T.gbps),a:fpCity(T.a),b:fpCity(T.b),price:fmt$(T.monthly),n:T.term});
  return '';}
function fedDealState(d){const now=fedNow();
  if(d.st==='wait')return tr('fedplay.s_wait');
  if(d.st==='over')return tr(fedOwn(FEDP_WHY,d.why)?FEDP_WHY[d.why]:FEDP_WHY.depeer);
  if(d.start>now)return trn('fedplay.s_from',Math.ceil((d.start-now)/FED_DAY));
  return d.end===null?tr('fedplay.s_open'):trn('fedplay.s_left',Math.max(0,Math.ceil((d.end-now)/FED_DAY)));}
function fedDealRow(d){const now=fedNow(),soon=d.st==='run'&&d.end!==null&&d.end-now<7*FED_DAY,renew=d.role!=='sell'&&!fedRenewal(S.fed,d.id)&&(soon||d.st==='over'&&d.why!=='excluded'&&d.why!=='muted');
  return `<div class="row"><div class="grow"><div class="nm">${fedDealName(d.deal)}${d.role==='sell'?` <span class="meta">${tr('fedplay.you_sell')}</span>`:''}${d.terms&&fedOwn(d.terms,'founded')?` <span class="tag fp-new">${tr('fedplay.newcomer_price')}</span>`:''}</div><div class="meta">${esc(fedTermsText(d.deal,d.terms))}</div><div class="meta">${esc(fedDealState(d))}</div></div>
    ${renew?btn(tr('fedplay.renew'),'fpRenew',{id:d.id},'sm'):''}${d.st!=='over'?btn(d.deal==='peering'?tr('fedplay.depeer'):tr('fedplay.end'),'fpEnd',{id:d.id},'ghost sm'):''}</div>`;}

/* ---------- the players card, at the top of the networks tab ---------- */
function fedPlayCard(){const f=S.fed,P=S.fedp,nets=S.fedn?S.fedn.nets:[];
  let h=`<section class="fp-card"><div class="fp-h"><h3>${tr('fedplay.players')}</h3><span class="grow"></span>${btn(tr('fedplay.your_terms'),'fpTerms',{},'ghost sm')}${btn(tr('fedplay.d_consortium'),'fpCons',{},'ghost sm')}</div>`;
  if(P&&P.rq.length)h+=`<div class="btns">${btn(trn('fedplay.n_to_review',P.rq.length),'fpQueue',{},'pink sm')}</div>`;
  if(!nets.length)h+=`<p class="empty">${f.on?tr('fedplay.no_players_yet'):tr('fedplay.join_to_meet')}</p>`;
  for(const s of nets){const n=fedNetOf(s.k);if(!n)continue;const ds=f.deals.filter(d=>d.key===s.k&&d.st!=='over'),p=fedPair(n),a=FEDN.ann.get(s.k),nw=!!a&&a.rec&&fedIsNew(a.rec.body.founded,fedNow());
    h+=`<div class="row fp-${s.st}">${logo(n)}<div class="grow"><div class="nm">${fedBot(n)}${esc(n.name)} <span class="meta">AS${n.asn}</span>${nw?` <span class="tag fp-new">${tr('fedplay.newcomer')}</span>`:''}</div>
      <div class="meta"><span class="tag ${s.pol}">${tr(FEDP_POL[s.pol])}</span>${FEDP_STL[s.st]?` <span class="tag fp-q">${tr(FEDP_STL[s.st])}</span>`:''} · ${trn('fedplay.n_pops',s.pops.length)} · ${fmtG(s.tr/1000)}${p.ix.length?' · '+tr('fedplay.meet_at',{at:p.ix.slice(0,3).map(fpCity).join(', ')}):''}</div>
      ${ds.length?`<div class="meta">${ds.map(d=>`<span class="tag fp-d">${fedDealName(d.deal)}</span>`).join(' ')}</div>`:''}</div>${btn(tr('fedplay.deals'),'fpNet',{key:s.k},'ghost sm')}</div>`;}
  if(P&&P.str.length){h+=`<h3 class="fp-sub">${tr('fedplay.strangers')}</h3><p class="meta">${tr('fedplay.strangers_note')}</p>`;
    for(const x of P.str){const n=fedNetOf(x.k);if(!n)continue;h+=`<div class="row"><div class="grow"><div class="nm">${fedBot(n)}${esc(n.name)}</div><div class="meta">${fmtG(x.mbps/1000)}</div></div>${btn(tr('fedplay.d_peering'),'fpNet',{key:x.k},'sm')}</div>`;}}
  // Mentor bonuses: newcomers this network dealt with that grew (89-fedplay-mentor.js), the last five.
  const paid=fedMentorPaid(S);
  if(paid.length){h+=`<h3 class="fp-sub">${tr('fedplay.mentor_bonuses')}</h3><p class="meta">${tr('fedplay.mentor_note')}</p>`;
    for(const x of paid.slice(0,5))h+=`<div class="row"><div class="grow"><div class="meta">${tr('fedplay.mentor_bonus',{net:esc(x.n),what:tr(FEDM_NAME[x.m]),cash:fmt$(x.v)})}</div></div></div>`;}
  const open=P?P.cons.filter(c=>c.st==='open'):[];
  if(open.length){h+=`<h3 class="fp-sub">${tr('fedplay.cons_projects')}</h3>`;for(const c of open)h+=fedConsRow(c);}
  return h+'</section>';}
function fedConsRow(c){return `<div class="row"><div class="grow"><div class="nm">🚢 ${esc(c.name)}</div><div class="meta">${tr('fedplay.cons_meta',{a:fpCity(c.a),b:fpCity(c.b),n:c.sg.length,m:c.m,pairs:c.pr,share:fmt$(c.sh)})}</div></div>
  ${c.me?`<span class="meta">${tr('fedplay.cons_in')}</span>`:btn(tr('fedplay.cons_join'),'fpConsJoin',{id:c.id},'sm',S.cash<c.sh||!S.fed.on)}</div>`;}

/* ---------- one player's sheet: their terms, your deals with them, what you can ask for ---------- */
function fedNetModal(key){const n=fedNetOf(key);if(!n){closeModal();return;}UI.fpOpen={k:'net',key};const a=FEDN.ann.get(key),B=a&&a.rec?a.rec.body:null,p=fedPair(n),sel=UI.fpSel||{},me=fedMeFor(n);
  let h=`<div style="display:flex;align-items:center"><div><div class="eyebrow">${tr('fedplay.player_network')} · AS${n.asn}${n.home?' · '+esc(n.home):''}</div><h2 style="font-size:24px">${fedBot(n)}${esc(n.name)}</h2></div><button class="x" data-act="closeModal" aria-label="${tr('common.close')}">×</button></div>`;
  h+=`<div class="facts"><span class="fact">${tr(fedOwn(FEDP_POL,n.fpol)?FEDP_POL[n.fpol]:FEDP_POL.open)}</span><span class="fact">${trn('fedplay.n_pops',n.fpops.length)}</span><span class="fact">${trn('fedplay.n_exchanges',n.fix.length)}</span><span class="fact">${fmtG((n.ftr||0)/1000)}</span>${n.ai?`<span class="fact">🤖 ${tr('fedplay.ai_player')}</span>`:''}</div>`;
  // Excluded by a joined server, not confirmed by others: no new deals, running ones continue (§10.7).
  const X=FEDN.ex,xs=X&&X.any.has(key)&&!X.ok.has(key)?(X.by.get(key)||[]).map(esc).join(', '):'';
  if(xs)h+=`<p class="note">${tr(S.fed.deals.some(d=>d.key===key&&d.st==='run')?N_('fedplay.excluded_running'):N_('fedplay.excluded_new'),{servers:xs})}</p>`;
  else if(n.fst==='fading')h+=`<p class="note">${tr('fedplay.fading_note')}</p>`;else if(n.fst==='dark')h+=`<p class="note">${tr('fedplay.dark_note')}</p>`;
  h+=`<p class="meta">${tr('fedplay.you_and_them',{in:fmtG(p.in/1000),out:fmtG(p.out/1000),ix:p.ix.length,pops:p.pops.length})}</p>`;
  const ds=S.fed.deals.filter(d=>d.key===key&&(d.st!=='over'||fedNow()-(d.end||d.start||0)<30*FED_DAY));
  if(ds.length)h+=`<h3 class="fp-sub">${tr('fedplay.your_deals')}</h3>`+ds.map(fedDealRow).join('');
  const rp=btn('🚩 '+tr('fedui.report'),'fuReport',{key,from:'deals'},'ghost sm');
  if(!B){h+=`<p class="empty">${tr('fedplay.no_terms_yet')}</p><div class="btns">${rp}</div>`;openModal(h);return;}
  // Their published terms, and what this network still misses.
  h+=`<h3 class="fp-sub">${tr('fedplay.their_terms')}</h3>`;
  if(B.policy==='selective'&&B.cond){const c=B.cond,miss=fedCondMiss(c,me);h+=`<p class="meta">${tr('fedplay.cond_line',{mbps:fpSpeed(c.minMbps),r:c.maxRatio>=100000?'∞':Math.round(c.maxRatio/100),n:c.minShared})}${c.rpki?' · RPKI':''}${c.tier1?' · '+tr('common.tier_1'):''}${c.ai?'':' · '+tr('fedplay.no_ai')}</p>${miss.length?`<p class="why">${esc(fedMissText(miss))}</p>`:''}`;}
  const R0=B.rates||{};
  if(R0.transit)h+=`<p class="meta">${tr('fedplay.rate_transit',{price:fmt$(R0.transit.perGbps),n:R0.transit.term})}${R0.transit.commit.map(x=>` · ${fpSpeed(x.mbps)} −${x.off/10}%`).join('')}</p>`;
  if(R0.pni)h+=`<p class="meta">${tr('fedplay.rate_pni',{setup:fmt$(R0.pni.setup),n:R0.pni.term})} ${R0.pni.ports.map(x=>`${fpSpeed(x.mbps)} ${tr('common.price_mo',{price:fmt$(x.monthly)})}`).join(' · ')}</p>`;
  if(R0.ix)h+=`<p class="meta">${tr('fedplay.rate_ix',{at:R0.ix.at.map(fpCity).join(', ')})} ${R0.ix.ports.map(x=>`${fpSpeed(x.mbps)} ${tr('common.price_mo',{price:fmt$(x.monthly)})}`).join(' · ')}</p>`;
  if(R0.wave){const rs=R0.wave.routes;h+=`<p class="meta">${tr('fedplay.rate_wave',{routes:rs.slice(0,4).map(x=>fpCity(x.a)+'–'+fpCity(x.b)).join(', ')+(rs.length>4?' …':''),n:R0.wave.term})} ${R0.wave.sizes.map(x=>`${fmtCap(x.gbps)} ${tr('common.price_mo',{price:fmt$(x.monthly)})}`).join(' · ')}</p>`;}
  if(!R0.transit&&!R0.pni&&!R0.ix&&!R0.wave)h+=`<p class="meta">${tr('fedplay.sells_nothing')}</p>`;
  // What you can ask for.
  h+=`<h3 class="fp-sub">${tr('fedplay.ask_for')}</h3>`;
  const ask=(deal,o,fields,extra='')=>{const x=fedOffer(key,deal,o),mode=B.auto[deal];
    return `<div class="fp-ask"><div class="nm">${fedDealName(deal)} <span class="meta">${tr(fedOwn(FEDP_AUTO,mode)?FEDP_AUTO[mode]:FEDP_AUTO.review)}</span></div>${fields?`<div class="trsel">${fields}</div>`:''}${x.terms&&!x.miss.length?`<p class="meta">${esc(fedTermsText(deal,x.terms))}</p>`:''}${extra}
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
  if(R0.wave){const W=R0.wave,rk=x=>x.a+'|'+x.b,o={at:sel['wave.at']||rk(W.routes.find(x=>S.pops[x.a]&&S.pops[x.b])||W.routes[0]),mbps:+sel['wave.mbps']||W.sizes[0].gbps*1000},x=fedOffer(key,'wave',o);
    h+=ask('wave',o,fpSel(tr('fedplay.route'),'wave.at',W.routes.map(r=>[rk(r),fpCity(r.a)+'–'+fpCity(r.b)]),o.at)+fpSel(tr('fedplay.capacity'),'wave.mbps',W.sizes.map(z=>[z.gbps*1000,fmtCap(z.gbps)]),o.mbps),
      x.terms?`<p class="meta">${tr('fedplay.wave_computer',{price:fmt$(fedWaveCeil(x.terms.a,x.terms.b,x.terms.gbps))})}</p>`:'');}
  {const prs=fedSwapPairs(n),o={at:sel['swap.at']||prs[0],mbps:+sel['swap.mbps']||10000};
    h+=ask('swap',o,(prs.length?fpSel(tr('fedplay.route'),'swap.at',prs.map(k=>[k,k.split('|').map(fpCity).join('–')]),o.at):'')+fpSel(tr('fedplay.capacity'),'swap.mbps',[[10000,'10G'],[100000,'100G'],[400000,'400G']],o.mbps),`<p class="meta">${tr('fedplay.swap_note')}</p>`);}
  h+=`<div class="btns" style="margin-top:10px">${btn(tr('fedplay.mute'),'fedMute',{key,on:true},'ghost sm')}${rp}</div>`;
  openModal(h);}

/* ---------- your published terms ---------- */
const fpDraft=()=>UI.fpDraft||(UI.fpDraft=JSON.parse(JSON.stringify({pol:fedP().pol,cond:fedP().cond,rates:fedP().rates,auto:fedP().auto})));
const FEDP_DEF={transit:()=>({perGbps:Math.max(1,Math.round(fedCeilMine()*0.8)),commit:[{mbps:10000,off:100},{mbps:100000,off:250}],term:90}),
  pni:()=>({setup:5000,ports:[{mbps:10000,monthly:1500},{mbps:100000,monthly:9000}],term:180}),wave:()=>fedWaveDef(),ix:()=>({ports:[{mbps:10000,monthly:800},{mbps:100000,monthly:4000}],join:'anyone'})};
// One field of the draft, from the editor's inputs (a value as typed: checked here and again when saved).
function fedTermsEdit(f,v){const D=fpDraft(),n=x=>{const k=Math.round(+x);return Number.isFinite(k)?Math.max(0,k):0;},on=v==='1'||v===true||v==='true';f=String(f);
  if(f==='pol'&&fedOwn(FEDP_POL,v)){D.pol=v;if(v==='restrictive'&&D.auto.peering==='auto')D.auto.peering='review';}
  else if(f==='c.minMbps')D.cond.minMbps=Math.min(1e9,n(v)*1000);else if(f==='c.maxRatio'&&FEDP_RATIO.includes(+v))D.cond.maxRatio=+v;else if(f==='c.minShared')D.cond.minShared=Math.min(64,n(v));
  else if(['c.rpki','c.tier1','c.ai'].includes(f))D.cond[f.slice(2)]=on;
  else if(f.startsWith('a.')&&FEDP_DEALS.includes(f.slice(2))&&fedOwn(FEDP_AUTO,v))D.auto[f.slice(2)]=D.pol==='restrictive'&&f==='a.peering'&&v==='auto'?'review':v;
  else if(f==='tr.on'){if(on)D.rates.transit=D.rates.transit||FEDP_DEF.transit();else delete D.rates.transit;}
  else if(f==='tr.price'&&D.rates.transit)D.rates.transit.perGbps=Math.min(fedCeilMine(),Math.max(1,n(v)));else if(f==='tr.term'&&D.rates.transit&&FEDP_TERMS.includes(+v))D.rates.transit.term=+v;
  else if(f==='pni.on'){if(on)D.rates.pni=D.rates.pni||FEDP_DEF.pni();else delete D.rates.pni;}
  else if(f==='pni.setup'&&D.rates.pni)D.rates.pni.setup=Math.min(1e9,n(v));else if(f==='pni.term'&&D.rates.pni&&FEDP_TERMS.includes(+v))D.rates.pni.term=+v;
  else if(/^pni\.m[01]$/.test(f)&&D.rates.pni){const p=D.rates.pni.ports[+f.slice(-1)];if(p)p.monthly=Math.min(1e9,n(v));}
  else if(f==='ix.on'){if(on)D.rates.ix=D.rates.ix||FEDP_DEF.ix();else delete D.rates.ix;}
  else if(f==='ix.join'&&D.rates.ix&&['anyone','selective','approval'].includes(v))D.rates.ix.join=v;
  else if(/^ix\.m[01]$/.test(f)&&D.rates.ix){const p=D.rates.ix.ports[+f.slice(-1)];if(p)p.monthly=Math.min(1e9,n(v));}
  else if(f==='wv.on'){if(on)D.rates.wave=D.rates.wave||FEDP_DEF.wave();else delete D.rates.wave;}
  else if(D.rates.wave)fedWaveEdit(D.rates.wave,f,v,on,n);}
// One field of the wave card: a route on or off (wv.r, "a|b" of a lit route), a size on or off (wv.s100), its price
// (wv.m100), the term. Prices stay under the computer-run ceiling of the routes.
function fedWaveEdit(W,f,v,on,n){const g=+f.slice(4);
  if(f==='wv.r'&&fedWaveLit().includes(String(v))){const [a,b]=String(v).split('|'),i=W.routes.findIndex(x=>x.a===a&&x.b===b);
    if(i>=0)W.routes.splice(i,1);else if(W.routes.length<32)W.routes.push({a,b});W.routes.sort((x,y)=>x.a+'|'+x.b<y.a+'|'+y.b?-1:1);}
  else if(/^wv\.s\d+$/.test(f)&&FEDP_WG.includes(g)){const i=W.sizes.findIndex(x=>x.gbps===g),c=fedWaveCeilCard(W.routes,g);
    if(on&&i<0){W.sizes.push({gbps:g,monthly:Math.max(1,Math.round(c<Infinity?c*0.9:1000))});W.sizes.sort((x,y)=>x.gbps-y.gbps);}else if(!on&&i>=0&&W.sizes.length>1)W.sizes.splice(i,1);}
  else if(/^wv\.m\d+$/.test(f)){const x=W.sizes.find(y=>y.gbps===g);if(x)x.monthly=Math.min(1e9,Math.max(1,n(v)));}
  else if(f==='wv.term'&&FEDP_TERMS.includes(+v))W.term=+v;
  fedWaveCap(W);}
// Saves terms and announces them at once. Running deals keep the terms they were made on (prices change at renewal).
function fedTermsApply(t){const P=fedP();t=t&&typeof t==='object'?t:{};P.pol=fedOwn(FEDP_POL,t.pol)?t.pol:P.pol;P.cond=fedCondClean(t.cond);P.rates=fedRatesClean(t.rates);
  if(P.rates.transit)P.rates.transit.perGbps=Math.min(fedCeilMine(),P.rates.transit.perGbps);fedWaveCap(P.rates.wave);
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
  h+=`</div>`+fedWaveTerms(r.wave,inp,sel,yn,terms);
  if(Object.keys(S.myIx).length){h+=`<h3 class="fp-sub">${tr('fedplay.your_exchange')}</h3><div class="trsel fp-grid"><label>${tr('fedplay.sell')} ${yn('ix.on',!!r.ix)}</label>`;
    if(r.ix)h+=`${r.ix.ports.slice(0,2).map((x,i)=>`<label>${fpSpeed(x.mbps)}/${tr('fedplay.month')} ${inp('ix.m'+i,x.monthly)}</label>`).join('')}<label>${tr('fedplay.who_joins')} ${sel('ix.join',[['anyone',tr('fedplay.join_anyone')],['selective',tr('fedplay.join_selective')],['approval',tr('fedplay.join_approval')]],r.ix.join)}</label>`;
    h+=`</div>`;}
  h+=`<h3 class="fp-sub">${tr('fedplay.requests')}</h3><div class="trsel fp-grid">${FEDP_DEALS.map(k=>`<label>${fedDealName(k)} ${sel('a.'+k,Object.keys(FEDP_AUTO).map(m=>[m,tr(FEDP_AUTO[m])]),D.auto[k])}</label>`).join('')}</div>
  <h3 class="fp-sub">RPKI</h3><div class="row"><div class="grow"><div class="meta">${tr('fedplay.rpki_note',{price:fmt$(FEDP_RPKI_MO)})}</div></div>${btn(fedP().rpki?tr('common.on'):tr('common.off'),'fpRpki',{on:!fedP().rpki},fedP().rpki?'green sm':'ghost sm')}</div>
  <div class="btns cta">${btn(tr('fedplay.save'),'fpTermsSave',{},'pink')}${btn(tr('common.cancel'),'closeModal',{},'ghost')}</div>`;
  openModal(h);}

// Your terms, "Sell waves": the sizes and prices, the term, and which of your lit routes are on the card.
function fedWaveTerms(W,inp,sel,yn,terms){let h=`<h3 class="fp-sub">${tr('fedplay.sell_waves')}</h3><div class="trsel fp-grid"><label>${tr('fedplay.sell')} ${yn('wv.on',!!W)}</label>`;
  if(!W)return h+'</div>';
  for(const g of FEDP_WG){const x=W.sizes.find(y=>y.gbps===g);h+=`<label>${fmtCap(g)} ${yn('wv.s'+g,!!x)}${x?` ${inp('wv.m'+g,x.monthly)}/${tr('fedplay.month')}`:''}</label>`;}
  h+=`<label>${tr('fedplay.term')} ${sel('wv.term',terms,W.term)}</label></div>`;
  const lit=fedWaveLit();if(!lit.length)return h+`<p class="empty">${tr('fedplay.wave_no_routes')}</p>`;
  h+=`<p class="meta">${tr('fedplay.wave_terms_note')}</p>`;
  for(const k of lit){const [a,b]=k.split('|'),on=W.routes.some(x=>x.a===a&&x.b===b);
    h+=`<div class="row"><div class="grow"><div class="nm">${esc(fpCity(a))}–${esc(fpCity(b))}</div><div class="meta">${W.sizes.map(x=>`${fmtCap(x.gbps)} ≤ ${fmt$(fedWaveCeil(a,b,x.gbps))}`).join(' · ')}</div></div>${btn(on?tr('common.on'):tr('common.off'),'fpEdit',{f:'wv.r',v:k},on?'green sm':'ghost sm')}</div>`;}
  return h;}

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

/* ---------- players at an exchange (the city panel's exchange block) ----------
   Other players' networks whose announce lists this exchange's city, with where peering with them stands and a Peer
   button. Peering with a player is a request (fedRequest): it runs once they accept, at once when their policy says
   so. Nothing for a save that never joined (no player networks in NETS). Challengers share the city's list, so only
   the incumbent's block (or the only one) shows it. */
function fedIxPlayers(c,city){if(XIXM[c]||!S.fed||!S.fed.on||!FEDN.ids.length)return '';
  const ns=FEDN.ids.map(id=>NET[id]).filter(n=>n&&n.fst!=='dark'&&(n.fix||[]).includes(city));if(!ns.length)return '';
  const on=fedMyIx().includes(city),deals=S.fed.deals,rq=S.fedp?S.fedp.rq:[];
  let h=`<h3 class="sub4">${tr('fedplay.ix_players')}</h3><p class="note">${on?tr('fedplay.ix_players_note'):tr('fedplay.ix_join_first')}</p>`;
  for(const n of ns.sort((a,b)=>b.ftr-a.ftr||fedByStr(a.fed,b.fed))){
    const d=deals.find(x=>x.key===n.fed&&x.deal==='peering'&&x.st!=='over'),ask=rq.some(q=>q.rec.key===n.fed&&q.rec.body.deal==='peering'),
      a=FEDN.ann.get(n.fed),auto=a&&a.rec&&a.rec.body.auto?a.rec.body.auto.peering:'';
    const st=d?(d.st==='run'?`<span class="tag st on">${tr('fedplay.ix_peering')}</span>`:`<span class="tag st">${tr('fedplay.s_wait')}</span>`)
      :ask?btn(tr('fedplay.review'),'fpQueue',{},'pink sm')
      :on&&auto!=='decline'?btn(tr('fedplay.ix_peer'),'fpReq',{key:n.fed,deal:'peering',via:'ix',at:city},'pink sm'):'';
    h+=`<div class="row"><div class="grow"><div class="nm">${fedBot(n)}${esc(n.name)}</div><div class="meta"><span class="tag ${n.fpol}">${tr(fedOwn(FEDP_POL,n.fpol)?FEDP_POL[n.fpol]:FEDP_POL.open)}</span>${FEDP_STL[n.fst]?` <span class="tag fp-q">${tr(FEDP_STL[n.fst])}</span>`:''}${fedOwn(FEDP_AUTO,auto)?' · '+tr('fedplay.ix_peering_is',{how:tr(FEDP_AUTO[auto])}):''}</div></div>
      <div class="btns">${st}${btn(tr('fedplay.deals'),'fpNet',{key:n.fed},'ghost sm')}</div></div>`;}
  return h;}
