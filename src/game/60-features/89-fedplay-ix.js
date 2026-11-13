/* ================= MULTIPLAYER GAMEPLAY: exchanges players run =================
   An exchange you founded (S.myIx) grows with players too. Every running port deal you sell on it, and every
   co-founder, is a player member: shown in its member list, and each makes computer-run networks join faster (they come
   for the players), FEDX_JOIN more per player, at most FEDX_PL of them counted. Player members take no computer member
   slot (the fabric's max stays theirs).
   With feature ix2 (every joined server lists it in feats, §9.3) your announce lists who is on your exchanges
   (rates.ix.members: the computer-run networks and how many players), so a player's port there reaches them too, and
   your announce says how you take co-founding (auto.cofound). Co-founding (deal cofound, §5.3): the founder offers a
   share of an exchange, at most FEDX_CO co-founders each; the co-founder pays its share of the founding cost once and of
   the fabric's monthly cost, gets a port, and earns its share of the members' fees. Each game books only its own side.
   Discovery: the exchanges players run (from their announces) and where founding one would gather players. Worked out
   when a sheet draws them, cached per announce set and routing result; nothing here runs in the day loop but fedIxNext. */
const FEDX_JOIN=0.25,FEDX_PL=8,FEDX_CO=2,FEDX_SHARES=[100,200,250,333,500],FEDX_TERMS=[90,180,365],FEDX_NETS=48,FEDX_LIST=8;
let FEDX=null,FEDXF=null;
/* Every joined server lists ix2 in its welcome (remembered per node URL, in memory, from the last welcome): only then
   does the announce carry members and auto.cofound, and are co-founding offers made. */
const fedIx2=(s=S)=>{const f=s&&s.fed,m=FED.ix2||{};return !!f&&f.servers.length>0&&f.servers.every(u=>m[u]===true);};
// The player members of your exchange at c: running port and co-founding deals you sell there, one per player.
function fedIxPl(c,s=S){const f=s&&s.fed;if(!f)return [];const seen=new Set(),out=[];
  for(const d of f.deals)if(d.on&&d.role==='sell'&&(d.deal==='port'||d.deal==='cofound')&&d.terms.at===c&&!seen.has(d.key)){seen.add(d.key);out.push(d);}
  return out;}
// Days until the next computer-run network looks at your exchange: players draw them in sooner.
const fedIxNext=(c,days)=>Math.max(1,Math.round(days/(1+FEDX_JOIN*Math.min(FEDX_PL,fedIxPl(c).length))));
// Co-founding deals of your exchange at c that wait or run.
const fedCofounders=c=>S.fed?S.fed.deals.filter(d=>d.deal==='cofound'&&d.role==='sell'&&d.terms.at===c&&d.st!=='over'):[];
// A co-founder's share of founding (setup) and of the fabric's monthly cost, in per mille.
const fedCofoundPrice=(c,share)=>({setup:fedDiv(MYIX_COST*share,1000),monthly:fedDiv(myFab(c).mo*share,1000)});
// Most a co-founder pays for a share: of the founding cost and of the biggest fabric (what its game accepts).
const fedCofoundFair=T=>T.setup<=fedDiv(MYIX_COST*T.share,1000)&&T.monthly<=fedDiv(MYIX_FAB[MYIX_FAB.length-1].mo*T.share,1000);
/* A co-founder's share of member fees a month: members counted in its own game, the founder's own exchange for the
   founder, the founder's newest announce (the snapshot) for the co-founder. */
function fedCofoundFee(d){const T=d.terms;let n=0;
  if(d.role==='sell')n=S.myIx[T.at]?S.myIx[T.at].members.length:0;else{const N=fedNetOf(d.key),x=N&&N.fxm&&N.fxm[T.at];n=x?x.n.length:0;}
  return fedDiv(n*MYIX_FEE*T.share,1000);}
// rates.ix.members as published (ix2): per exchange sold on, the computer-run members and the players with a port.
const fedIxMembersOut=at=>at.filter(c=>S.myIx[c]).map(c=>({at:c,nets:[...new Set(S.myIx[c].members.filter(id=>NET[id]&&!NET[id].fed&&fedCityOk(id)))].slice(0,FEDX_NETS),players:Math.min(64,fedIxPl(c).length)}));
// The members part of the snapshot (fedNetSnap) from an announce: {city: {n: [computer-run ids], p: players}}.
function fedIxSnap(b){const r=b.rates&&b.rates.ix,o={};if(!r||!Array.isArray(r.members))return o;
  for(const m of r.members)if(own(CITY,m.at)&&r.at.includes(m.at))o[m.at]={n:m.nets.filter(id=>own(NET,id)&&!NET[id].fed).slice(0,FEDX_NETS),p:m.players};
  return o;}
// The same from a save (fednClean): anything malformed is dropped.
function fedIxSnapClean(x){const o={};if(!x||typeof x!=='object'||Array.isArray(x))return o;
  for(const c of Object.keys(x).slice(0,16)){const m=x[c];if(!own(CITY,c)||!m||!Array.isArray(m.n))continue;
    o[c]={n:[...new Set(m.n.filter(id=>typeof id==='string'&&own(NET,id)&&!NET[id].fed))].slice(0,FEDX_NETS),p:Number.isSafeInteger(m.p)&&m.p>=0&&m.p<=64?m.p:0};}
  return o;}

/* ---------- discovery: exchanges run by players ---------- */
/* From the networks known (fedNetworks' list as a Map, the sheet's FU.nets): [{k, name, ai, at, players (null: the
   announce does not say), price (cheapest port a month), pop (you have a POP there), mine (you have a port there)}],
   where you have a POP first, then the busiest. Dark, excluded and muted networks, and your own, are left out. */
function fedIxList(nets){if(!nets)return [];const me=fedMe(),f=S&&S.fed;const ver=(f?f.deals.length:0)+'|'+(S?Object.keys(S.pops).length:0);if(FEDX&&FEDX.nets===nets&&FEDX.s===S&&FEDX.v===ver)return FEDX.l;
  const out=[],muted=new Set(f?f.muted:[]);
  for(const [k,o] of nets){const b=o&&o.rec&&o.rec.body,r=b&&b.rates&&b.rates.ix;if(!r||k===me||muted.has(k)||fedExcl1(k)||!o.quiet||o.quiet.state==='dark'||o.quiet.state==='forgotten')continue;
    const N=fedNetOf(k),ms=Array.isArray(r.members)?r.members:[];
    for(const c of r.at){if(!own(CITY,c))continue;const m=ms.find(x=>x.at===c);
      out.push({k,name:fedSafeName(b.name),ai:!!(N&&N.ai),at:c,players:m?m.players:null,price:Math.min(...r.ports.map(p=>p.monthly)),pop:!!(S&&S.pops[c]),
        mine:!!f&&f.deals.some(d=>d.key===k&&(d.deal==='port'||d.deal==='cofound')&&d.terms.at===c&&d.st!=='over'),auto:b.auto?b.auto.port:'decline'});}}
  out.sort((a,b)=>b.pop-a.pop||(b.players||0)-(a.players||0)||a.price-b.price||fedByStr(a.k,b.k)||(a.at<b.at?-1:1));
  FEDX={nets,s:S,v:ver,l:out};return out;}
// The list as rows: max rows, with a button where a game could ask for a port.
function fedIxListHtml(nets,max=FEDX_LIST){const l=fedIxList(nets);if(!l.length)return '';const can=!!(S&&S.fed&&S.fed.on&&UI.started);
  return `<div class="fp-ixs"><h3 class="fp-sub">${tr('fedplay.ix_run_by_players')}</h3><p class="meta">${tr('fedplay.ix_run_note')}</p>`+l.slice(0,max).map(x=>{
    const who=`${x.ai?'🤖 ':''}${esc(x.name)}`,meta=[esc(fpCity(x.at)),x.players===null?'':trn('fedplay.ix_n_players',x.players),tr('fedplay.ix_ports_from',{price:fmt$(x.price)})].filter(Boolean).join(' · ');
    const act=!can?'':x.mine?`<span class="tag st on">${tr('fedplay.ix_your_port')}</span>`:x.pop?btn(tr('fedplay.ix_get_port'),'fpNet',{key:x.k,at:x.at,deal:'port'},'sm',x.auto==='decline'):`<span class="meta">${tr('fedplay.ix_pop_first')}</span>`;
    return `<div class="row"><div class="grow"><div class="nm">${who}</div><div class="meta">${meta}</div></div>${act}</div>`;}).join('')+'</div>';}

/* ---------- a nudge to found one ---------- */
/* Cities where you have a POP and no exchange of your own, founding is allowed (no exchange there yet), no player runs
   one, and at least two other players have POPs: [{c, n (players there)}], most players first, at most three. */
function fedFoundHints(){if(!S||!S.fed||!S.fedn)return [];if(FEDXF&&FEDXF.s===S&&FEDXF.h===S.fedn.h&&FEDXF.a===FEDN.ann&&FEDXF.p===Object.keys(S.pops).length&&FEDXF.m===Object.keys(S.myIx).length)return FEDXF.l;
  const run=new Set();for(const o of FEDN.ann.values()){const r=o&&o.rec&&o.rec.body.rates&&o.rec.body.rates.ix;if(r)for(const c of r.at)run.add(c);}
  const out=[];
  for(const c of Object.keys(S.pops)){if(S.myIx[c]||run.has(c)||foundIxWhy(c))continue;
    const n=S.fedn.nets.filter(x=>x.st!=='dark'&&x.pops.includes(c)).length;if(n>=2)out.push({c,n});}
  out.sort((a,b)=>b.n-a.n||(a.c<b.c?-1:1));
  const l=out.slice(0,3);FEDXF={s:S,h:S.fedn.h,a:FEDN.ann,p:Object.keys(S.pops).length,m:Object.keys(S.myIx).length,l};return l;}
function fedFoundHtml(){const l=fedFoundHints();if(!l.length)return '';
  return `<div class="fp-found">${l.map(x=>`<div class="row"><div class="grow"><div class="nm">${tr('fedplay.found_here',{city:esc(fpCity(x.c))})}</div><div class="meta">${trn('fedplay.found_n_could_join',x.n)} · ${tr('fedplay.found_cost',{cost:fmt$(MYIX_COST),mo:fmt$(MYIX_MO)})}</div></div>${btn(tr('fedplay.found_btn'),'foundIx',{city:x.c},'pink sm',S.cash<MYIX_COST)}</div>`).join('')}</div>`;}

/* ---------- your exchange's panel: player members, co-founders, invitations ---------- */
function fedIxMineHtml(c){if(!S.fed||!S.myIx[c])return '';const pl=fedIxPl(c),co=fedCofounders(c),k=pl.length;
  let h=`<div class="kv"><span>${tr('fedplay.ix_player_members')}</span><b>${k?trn('fedplay.ix_join_faster',k,{x:(1+FEDX_JOIN*Math.min(FEDX_PL,k)).toFixed(2).replace(/\.?0+$/,'')}):'0'}</b></div>`;
  for(const d of pl){const n=fedNetOf(d.key);
    h+=`<div class="row"><div class="grow"><div class="nm">${n&&n.ai?'🤖 ':''}${esc(d.name)} <span class="tag st on">${tr('fedplay.ix_player')}</span></div><div class="meta">${d.deal==='cofound'?tr('fedplay.ix_cofounder_meta',{pct:Math.round(d.terms.share/10),price:fmt$(d.terms.monthly)}):tr('fedplay.ix_port_meta',{port:fpSpeed(d.terms.mbps),price:fmt$(d.terms.monthly)})}</div></div>${btn(tr('fedplay.deals'),'fpNet',{key:d.key},'ghost sm')}</div>`;}
  if(!S.fed.on)return h;
  const P=fedP();h+=`<h4 class="fu-h4">${tr('fedplay.cofounders',{n:co.length,m:FEDX_CO})}</h4><p class="note">${tr('fedplay.cofound_note')}</p>`;
  if(!P.rates.ix)return h+`<p class="note">${tr('fedplay.ix_sell_first')}</p><div class="btns">${btn(tr('fedplay.your_terms'),'fpTerms',{},'ghost sm')}</div>`;
  if(!fedIx2())return h+`<p class="note">${tr('fedplay.cofound_wait_servers')}</p>`;
  for(const d of co)if(!pl.includes(d))h+=`<div class="row"><div class="grow"><div class="nm">${esc(d.name)}</div><div class="meta">${esc(fedDealState(d))}</div></div></div>`;
  if(co.length>=FEDX_CO)return h;
  const cand=FEDN.ids.map(id=>NET[id]).filter(n=>n&&n.fst!=='dark'&&(n.fpops||[]).includes(c)&&!co.some(d=>d.key===n.fed)&&!fedExcl1(n.fed));
  if(!cand.length)return h+`<p class="meta">${tr('fedplay.cofound_none_here')}</p>`;
  for(const n of cand.sort((a,b)=>b.ftr-a.ftr||fedByStr(a.fed,b.fed)).slice(0,6))
    h+=`<div class="row"><div class="grow"><div class="nm">${fedBot(n)}${esc(n.name)}</div><div class="meta">${trn('fedplay.n_pops',n.fpops.length)} · ${fmtG((n.ftr||0)/1000)}</div></div>${btn(tr('fedplay.cofound_invite'),'fpNet',{key:n.fed,at:c,deal:'cofound'},'pink sm')}</div>`;
  return h;}
