/* ---------- Pie in the Sky: government money (docs/plans/pie-in-the-sky.md) ----------
   Two state programmes for a rocket company, kept in S.pie.gov (pieBlank(), repaired by pieGovFix()):
   - The Rural Digital Pie Fund: reverse auctions for support of a remote town that only orbit reaches (a cut-off POP on
     backhaul, or a town of your terminal customers with no POP of yours). The lowest ask wins; a rival bids too. A win
     pays a monthly subsidy (V.gov in compute()) for PIE_RDF_TERM days, while the town's service, averaged over each
     month, stays at PIE_RDF_NEED from the deadline on. A month below it is a warning; two in a row revoke the award, and
     PIE_RDF_CLAW of the last year's support goes back.
   - The Ex-Im Pie Bank: a cheap state loan sized to the constellation (a BANKS entry, so it bills and shows like any
     loan), with space covenants: launch n pies by a day, keep a pie dish in the lending country. A breach is a loan
     breach (the bank's penalty), plus tighter terms (PIE_EXIM_PEN on the rate, the launch target rescheduled) and, with
     chaos on (rule O5), a geopolitical spat in the lending country.
   Pitcairn's satellite tier of the UK grant is in 85-pitcairn.js. Subsidies count in the orbit's books (book.earned). */
const PIE_RDF_MO=5e6,PIE_RDF_P=30,PIE_RDF_TERM=1800,PIE_RDF_DUE=90,PIE_RDF_NEED=0.7,PIE_RDF_CLAW=0.5,PIE_RDF_MAX=6,
  PIE_RDF_DAYS=20,PIE_RDF_RATE=1/45,PIE_RDF_FAR=60,PIE_RDF_BIDS=[0.9,0.7,0.5],PIE_RDF_RIV=0.4,
  PIE_EXIM_SHARE=0.5,PIE_EXIM_MIN=250e6,PIE_EXIM_CAPF=0.2,PIE_EXIM_APR=0.015,PIE_EXIM_TERM=60,PIE_EXIM_BY=360,PIE_EXIM_PEN=0.03,
  PIE_EXIM_RESCHED=180,PIE_EXIM_EVERY=90;
// Rival bidders: the old satellite crowd and the local co-op.
const PIE_RIVALS=[N_('pie_gov.rival_viasad'),N_('pie_gov.rival_hugsnet'),N_('pie_gov.rival_coop')];
const pieGovBlank=()=>({auc:[],aw:[],ex:null,told:0});
// A town's service today, from the last compute: a POP's share of its demand served (orbit's latency is accepted: the
// fund pays for coverage), or the share its terminal customers get.
function pieRdfSrv(c){if(!R||!R.pie)return 0;if(S.pops[c]){const d=R.cityDem[c]||0;return d>1e-6?clamp((R.citySrv[c]||0)/d,0,1):0;}
  let w=0,g=0;for(const b of S.biz)if(b.city===c&&BIZ_T[b.type].orbit){w+=b.bw;g+=b.bw*Math.min(1,R.pie.sf[b.id]||0);}return w>0?g/w:0;}
// Towns the fund will auction: cut-off POPs with home broadband on backhaul, and small towns with no POP of yours where
// your terminals are, that are not up for auction or awarded already.
function pieRdfCands(){if(!R||!R.pie||!R.pie.hubs.length)return [];const G=S.pie.gov,busy=new Set([...G.auc,...G.aw].map(x=>x.city)),o=new Set();
  for(const b of R.pie.bh)if(b.land&&S.pops[b.city]&&S.pops[b.city].bb)o.add(b.city);
  for(const b of S.biz)if(BIZ_T[b.type].orbit&&!S.pops[b.city]&&CITY[b.city].P<=PIE_RDF_FAR)o.add(b.city);
  return [...o].filter(c=>!busy.has(c)&&!CITY[c].cn).sort();}
// The reserve grows with the town, up to a small one's worth: the fund is for the last mile, not for cities.
const pieRdfAsk=c=>Math.round(PIE_RDF_MO*(1+Math.min(CITY[c].P,PIE_RDF_FAR)/PIE_RDF_P)/1e5)*1e5;
function pieRdfOpen(c){const G=S.pie.gov,a={id:uid(),city:c,ask:pieRdfAsk(c),close:S.day+PIE_RDF_DAYS,riv:+(PIE_RDF_RIV+(1-PIE_RDF_RIV)*Math.random()).toFixed(3),rv:Math.floor(Math.random()*PIE_RIVALS.length)%PIE_RIVALS.length,bid:0};
  G.auc.push(a);toast(`<b>🏛️ ${tr('pie_gov.t_auction_title')}</b><br>${tr('pie_gov.t_auction',{city:esc(CITY[c].name),mo:fmt$(a.ask),y:PIE_RDF_TERM/360,d:dateStr(a.close)})}`,'goal',[{l:tr('pie_gov.bid'),act:'pieGovOpen',args:{}}]);}
// Bids close: the lower ask wins. Silent when you did not bid.
function pieRdfClose(a){const G=S.pie.gov,c=esc(CITY[a.city].name);if(!a.bid)return;
  if(a.bid<=a.riv&&G.aw.length<PIE_RDF_MAX){const d=S.day,w={id:a.id,city:a.city,mo:Math.round(a.ask*a.bid),start:d,due:d+PIE_RDF_DUE,end:d+PIE_RDF_TERM,s:0,n:0,k:0,paid:0};G.aw.push(w);
    S.stats.pieRdf=(S.stats.pieRdf||0)+1;toast(tr('pie_gov.t_won',{city:c,mo:fmt$(w.mo),p:pct(PIE_RDF_NEED),d:dateStr(w.due)}),'goal',[{l:tr('pie_gov.open'),act:'pieGovOpen',args:{}}]);sfx('coin');}
  else toast(tr('pie_gov.t_lost',{city:c,rival:tr(PIE_RIVALS[a.rv]),mo:fmt$(Math.round(a.ask*a.riv))}),'bad');}
// Revoked: the award ends and part of what it paid goes back (the sandbox only keeps count).
function pieRdfRevoke(w,avg){const P=S.pie,G=P.gov,claw=Math.round(Math.min(w.paid,12*w.mo)*PIE_RDF_CLAW);G.aw=G.aw.filter(x=>x!==w);
  if(!pieSand())S.cash-=claw;P.book.earned=Math.max(0,P.book.earned-claw);S.stats.pieRdfLost=(S.stats.pieRdfLost||0)+1;
  toast(tr('pie_gov.t_revoked',{city:esc(CITY[w.city].name),p:pct(avg),need:pct(PIE_RDF_NEED),amt:fmt$(claw)}),'bad',[{l:tr('pie_gov.open'),act:'pieGovOpen',args:{}}]);sfx('err');}
// What the fund pays this month: every award in force (compute()).
function pieGovMo(){const G=S.pie&&S.pie.gov;if(!G)return 0;let v=0;for(const w of G.aw)v+=w.mo;return v;}
/* ---- The Ex-Im Pie Bank ---- */
// What a pie in orbit is worth to a lender: the pie, its laser and its seat on the cheapest rocket.
const pieEximUnit=()=>piePrice(PIE_PIE+PIE_LAS)+piePrice(ROCKETS.falcon.cost)/ROCKETS.falcon.pies;
// The most it lends: a share of the cheapest full Shortcrust (rule O7 counts it).
const pieEximCap=()=>Math.round(pieFullCost('short')*PIE_EXIM_CAPF/50e6)*50e6;
// Sized to the constellation: half the value of the pies flying and booked, between PIE_EXIM_MIN and the cap.
function pieEximAmt(){const P=S.pie;let n=pieLiveAll();for(const id in CRUSTS)n+=P.crusts[id].queued;return clamp(Math.round(n*pieEximUnit()*PIE_EXIM_SHARE/50e6)*50e6,PIE_EXIM_MIN,pieEximCap());}
const pieEximLoan=()=>(S.loans||[]).find(l=>l.bank==='exim')||null;
// The covenants (COVS.pielaunch / COVS.piedish, 10-banks.js).
function pieEximLaunchOk(l){const q=l&&l.pie;return !q||S.day<q.by||q.flown>=q.n;}
function pieEximDishOk(l){const q=l&&l.pie;return !q||!!S.pie&&S.pie.dishes.some(x=>S.pops[x.city]&&CITY[x.city].cc===q.cc);}
// A fresh offer every PIE_EXIM_EVERY days, from a country you have a POP in, while you have a factory and no Ex-Im loan.
function pieEximOffer(d){const P=S.pie,G=P.gov;if(!P.fac||pieEximLoan()||!pieCanBuild()){if(G.ex&&pieEximLoan())G.ex=null;return;}if(G.ex&&G.ex.exp>d)return;
  const ccs=piePopCc();if(!ccs.length)return;const amt=pieEximAmt();
  G.ex={cc:pick(ccs),amt,apr:+(PIE_EXIM_APR+0.01*Math.random()).toFixed(3),term:PIE_EXIM_TERM,n:Math.ceil(amt/pieEximUnit()/20)*20,exp:d+PIE_EXIM_EVERY};
  if(!G.told){G.told=1;toast(`<b>🏦 ${tr('pie_gov.t_exim_title')}</b><br>${tr('pie_gov.t_exim',{amt:fmt$(amt),a:esc(pieLicCountry(G.ex.cc))})}`,'goal',[{l:tr('pie_gov.open'),act:'pieGovOpen',args:{}}]);}}
// Taking it: a loan like any other, plus its space covenants.
function pieEximTake(){const P=S.pie,o=P.gov.ex;if(!o||pieEximLoan())return false;const pay=Math.round(annuity(o.amt,o.apr,o.term));
  S.cash+=o.amt;S.stats.loans=(S.stats.loans||0)+1;
  S.loans.push({id:uid(),bank:'exim',start:S.day,amount:o.amt,got:o.amt,bal:o.amt,apr:o.apr,apr0:o.apr,pay,left:o.term,term:o.term,share:0,covs:['pielaunch','piedish'],base:{sub:S.links.filter(x=>x.sub).length},
    pie:{cc:o.cc,n:o.n,by:S.day+PIE_EXIM_BY,flown:0,br:0}});
  P.gov.ex=null;track('loan_taken');return true;}
// A breach (loanTick(), after the bank's own penalty): tighter terms, the launch target rescheduled, and a spat.
function pieEximBreach(l,broken){const q=l.pie;if(!q)return;q.br=(q.br||0)+1;l.apr=+(l.apr+PIE_EXIM_PEN).toFixed(3);l.pay=Math.round(annuity(l.bal,l.apr,Math.max(1,l.left)));
  if(broken.includes('pielaunch'))q.by=S.day+PIE_EXIM_RESCHED;
  let sp='';if(S.pie&&pieChaos()){const ids=broken.includes('piedish')?['home','lic']:['lic','home'];for(const id of ids)if(!S.pie.spat[id]&&pieSpatStart(id,q.cc)){sp=id;break;}}
  toast(tr('pie_gov.t_breach',{a:esc(pieLicCountry(q.cc)),apr:(l.apr*100).toFixed(1)})+(sp?' '+tr('pie_gov.t_breach_spat'):''),'bad');}
/* ---- The day ---- */
function pieGovDay(d){const P=S.pie;if(!P.co)return;const G=P.gov;
  if(G.auc.length)for(const a of G.auc.slice())if(d>=a.close){G.auc=G.auc.filter(x=>x!==a);pieRdfClose(a);}
  for(const w of G.aw.slice()){if(w.start===d)continue;if(d>=w.end){G.aw=G.aw.filter(x=>x!==w);toast(tr('pie_gov.t_done',{city:esc(CITY[w.city].name),amt:fmt$(w.paid)}),'good');continue;}
    w.paid+=w.mo/30;w.s+=pieRdfSrv(w.city);w.n++;
    if(w.n>=30){const avg=w.s/w.n;w.s=0;w.n=0;if(d<w.due||avg>=PIE_RDF_NEED){w.k=0;continue;}
      if(w.k){pieRdfRevoke(w,avg);continue;}w.k=1;toast(tr('pie_gov.t_warn',{city:esc(CITY[w.city].name),p:pct(avg),need:pct(PIE_RDF_NEED)}),'bad',[{l:tr('pie_gov.open'),act:'pieGovOpen',args:{}}]);}}
  if(!G.auc.length&&G.aw.length<PIE_RDF_MAX&&Math.random()<PIE_RDF_RATE){const cs=pieRdfCands();if(cs.length)pieRdfOpen(pick(cs));}
  pieEximOffer(d);
  // The books: the fund and Pitcairn's satellite grant, as compute() counted them.
  if(R&&R.pie&&R.pie.gov){const v=R.pie.gov.rdf+R.pie.gov.sky;if(v>0)P.book.earned+=v/30;}}
PIE_ON.day.push(pieGovDay);
// Pies launched count towards the Ex-Im target.
PIE_ON.launch.push((L,ok)=>{const l=ok&&!L.test&&pieEximLoan();if(l&&l.pie)l.pie.flown+=L.n;});
/* ---- The save gate ---- */
function pieGovFix(g,s){const o=pieGovBlank(),day=s.day,ob=x=>x&&typeof x==='object'&&!Array.isArray(x);if(!ob(g))return o;
  const ccs=new Set(CITIES.map(c=>c.cc)),seen=new Set(),one=x=>isCity(x.city)&&!seen.has(x.city)&&seen.add(x.city),mx=PIE_RDF_MO*20;
  o.auc=(Array.isArray(g.auc)?g.auc:[]).filter(a=>ob(a)&&one(a)).slice(0,1).map(a=>({id:sid0(a.id),city:a.city,ask:clamp(num(a.ask,0),0,mx),close:int(a.close,0,day+PIE_RDF_DAYS,day),
    riv:clamp(num(a.riv,1),PIE_RDF_RIV,1),rv:int(a.rv,0,PIE_RIVALS.length-1,0),bid:PIE_RDF_BIDS.includes(a.bid)?a.bid:0}));
  o.aw=(Array.isArray(g.aw)?g.aw:[]).filter(w=>ob(w)&&one(w)).slice(0,PIE_RDF_MAX).map(w=>{const st=int(w.start,0,day,day);
    return {id:sid0(w.id),city:w.city,mo:clamp(num(w.mo,0),0,mx),start:st,due:int(w.due,st,st+PIE_RDF_DUE,st+PIE_RDF_DUE),end:int(w.end,st,st+PIE_RDF_TERM,st+PIE_RDF_TERM),
      s:clamp(num(w.s,0),0,30),n:int(w.n,0,29,0),k:w.k?1:0,paid:clamp(num(w.paid,0),0,mx*PIE_RDF_TERM/30)};}).map(w=>(w.s=Math.min(w.s,w.n),w));
  if(ob(g.ex)&&ccs.has(g.ex.cc)){const x=g.ex;o.ex={cc:x.cc,amt:clamp(num(x.amt,PIE_EXIM_MIN),0,pieEximCap()),apr:clamp(num(x.apr,PIE_EXIM_APR),0,0.2),term:PIE_EXIM_TERM,n:int(x.n,0,1e5,0),exp:int(x.exp,0,day+PIE_EXIM_EVERY,day)};}
  o.told=g.told?1:0;return o;}
// Ex-Im loans live in S.loans (sanitized there); their covenants' numbers are repaired here, or reset when unreadable.
function pieEximFix(s){const ccs=new Set(CITIES.map(c=>c.cc)),home=isCity(s.home)?CITY[s.home].cc:CITIES[0].cc;
  for(const l of s.loans||[]){if(l.bank!=='exim')continue;const q=l.pie&&typeof l.pie==='object'?l.pie:{};
    l.pie={cc:ccs.has(q.cc)?q.cc:home,n:int(q.n,0,1e5,0),by:int(q.by,0,s.day+PIE_EXIM_BY,0),flown:int(q.flown,0,1e6,0),br:int(q.br,0,1e4,0)};l.covs=['pielaunch','piedish'];}}
/* ---- The bank's Government money section (it was Pie Control's Gov tab) ---- */
// Shown once there is a rocket company, or anything of the fund's or the Ex-Im bank's to show.
function pieGovShow(){const P=S&&S.pie;return !!(P&&pieOn()&&(P.co||P.gov.auc.length||P.gov.aw.length||P.gov.ex||pieEximLoan()));}
function pieGovBank(){return pieGovShow()?`<section class="bank-gov"><h3 id="bankGov" style="font-size:18px;margin-top:14px">🏛️ ${tr('pie_gov.section')}</h3><p class="meta">${tr('pie_gov.section_note')}</p>${pieGovHtml()}</section>`:'';}
function pieGovHtml(){const P=S.pie,G=P.gov,can=pieCanBuild();let h=`<div class="ops-o"><div class="nm">🏛️ ${tr('pie_gov.rdf')}</div><p class="meta">${tr('pie_gov.rdf_note',{y:PIE_RDF_TERM/360,p:pct(PIE_RDF_NEED),c:pct(PIE_RDF_CLAW)})}</p>`;
  for(const a of G.auc)h+=`<div class="kv"><span>${esc(CITY[a.city].name)} · ${tr('pie_gov.up_to',{mo:fmt$(a.ask)})}</span><b>${tr('pie_gov.closes',{d:dateStr(a.close)})}</b></div>
    <div class="ops-p">${PIE_RDF_BIDS.map(f=>btn(tr('pie_gov.ask',{mo:fmt$(Math.round(a.ask*f))}),'pieBid',{id:a.id,f},a.bid===f?'pink sm':'ghost sm',!can)).join('')}</div>`;
  if(!G.auc.length)h+=`<p class="meta">${tr('pie_gov.no_auction')}</p>`;
  for(const w of G.aw){const s=pieRdfSrv(w.city),ok=s>=PIE_RDF_NEED;
    h+=`<div class="kv"><span>${esc(CITY[w.city].name)} · ${tr('common.price_mo',{price:fmt$(w.mo)})}</span><b style="color:${ok?'var(--eye)':'var(--bad)'}">${tr('pie_gov.served',{p:pct(s)})}</b></div>
    <div class="meta">${S.day<w.due?tr('pie_gov.due',{p:pct(PIE_RDF_NEED),d:dateStr(w.due)}):tr('pie_gov.until',{d:dateStr(w.end)})}${w.k?' · <b style="color:var(--bad)">'+tr('pie_gov.warned')+'</b>':''}</div>`;}
  h+=`</div><div class="ops-o"><div class="nm">🇵🇳 ${tr('pie_gov.pitcairn')}</div><p class="meta">${tr('pie_gov.pitcairn_note',{mo:fmt$(GRANT_MO),sky:fmt$(GRANT_SKY_MO)})}</p>${grantFact('pcn')}</div>`;
  const l=pieEximLoan(),o=G.ex;h+=`<div class="ops-o"><div class="nm">🏦 ${tr('pie_gov.exim')}</div>`;
  if(l){const q=l.pie;h+=`<div class="kv"><span>${tr('common.still_owed')}</span><b>${fmt$(l.bal)}</b></div><div class="meta">${loanLine(l)}</div>
    <div class="meta"><b style="color:${pieEximLaunchOk(l)?'var(--eye)':'var(--bad)'}">${pieEximLaunchOk(l)?'✓':'✗'}</b> ${esc(covLabel('pielaunch',l))}</div>
    <div class="meta"><b style="color:${pieEximDishOk(l)?'var(--eye)':'var(--bad)'}">${pieEximDishOk(l)?'✓':'✗'}</b> ${esc(covLabel('piedish',l))}</div>`;}
  else if(o){const pay=Math.round(annuity(o.amt,o.apr,o.term));h+=`<p class="meta">${tr('pie_gov.exim_offer',{amt:fmt$(o.amt),apr:(o.apr*100).toFixed(1),n:o.term,pay:fmt$(pay)})}</p>
    <div class="meta">• ${tr('pie_gov.cov_launch',{n:o.n,d:dateStr(S.day+PIE_EXIM_BY)})}</div><div class="meta">• ${tr('pie_gov.cov_dish',{a:esc(pieLicCountry(o.cc))})}</div>
    <p class="meta">${tr('pie_gov.exim_breach',{apr:(PIE_EXIM_PEN*100).toFixed(0)})}</p><div class="btns">${btn(tr('bank.take_the_money'),'pieExim',{},'pink sm',!can)}</div>`;}
  else h+=`<p class="meta">${tr('pie_gov.exim_none')}</p>`;
  return h+'</div>';}
