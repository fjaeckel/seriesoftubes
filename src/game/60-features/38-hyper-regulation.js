/* ---------- Regulators discover the Hyperscaler (37-hyper.js) ----------
   Laws arrive over time, each announced ahead by a minister with a pun for a name, after real ones, exaggerated:
   - Data localisation (law.cc[cc]): a country where you have users passes a law (Russia 2015, India, Indonesia,
     Vietnam, Nigeria...): from its day on, its users' data must live in a region in the country. 38-hyper-residency.js
     reads it through hsRegRes() as if the country had always been on its list (rule M13): no region there, and its users
     wait, neither growing nor leaving. The notice is long enough to build a Server Barn.
   - A moratorium on new data centers (law.mor[city]): a metro pauses new grid connections for months, as Amsterdam
     (2019), Singapore (2019 to 2022) and Dublin (EirGrid, 2022 to 2028) did: no new region or upgrade there and no
     utility request; a request already queued waits until it ends. Your own generation is still allowed, and what it
     makes and you do not use yet can power a new region or an upgrade there (hsMorFree, #474); never a zone (M14).
   - Energy efficiency (law.pue[continent]): PUE and heat reporting, as the EU's Energy Efficiency Directive (2023) asks:
     every region there that wastes its heat pays HS_PUE_MO per megawatt a month; heat reuse (hsHeat) is exempt.
   - The EU tightens (law.eu): copying EU users' data out of the EU needs lawyers and transfer assessments (after the
     Schrems II ruling): HS_EU_MO a month for every EU region whose replica sits outside the EU and the countries it trusts (HS_EU_SAFE).
   - Egress fees (law.egr): "Hotel California" pricing gets investigated (the UK's cloud market investigation found
     egress fees hurt switching; the EU Data Act ends switching charges): cut them by HS_EGR_CUT for a year, or pay a
     fine; ignore it and the fine is set higher at the deadline.
   New laws need the market rule (rule M3) and wait for day HS_LAW_FROM and level HS_LAW_LV; one at a time, at least
   HS_LAW_GAP days apart. Rolls are hashes of the AS number and the day, never Math.random. */
const HS_LAW_FROM=60,HS_LAW_LV=HS_DIR_LV.law,HS_LAW_GAP=60,HS_LAW_ODDS=0.05,HS_LAW_MAX=3,HS_MOR_AHEAD=30,HS_MOR_MAX=2,HS_PUE_AHEAD=90,HS_PUE_MO=400,HS_EU_AHEAD=60,HS_EU_MO=40000;
const HS_EGR_LV=4,HS_EGR_DL=45,HS_EGR_CUT=0.15,HS_EGR_DAYS=365,HS_EGR_X=3,HS_EGR_MIN=100000,HS_EGR_LATE=1.25;
// The ministers (proper names, as tenants' are): one list per kind of law, an index kept in the save.
const HS_MIN={cc:['Minister Ada Localova','Minister Sov E. Reign','Minister Data Stayput','Minister Petra Byte'],
 mor:['Councillor Grid Lockhart','Councillor Watts Moratorio','Alderwoman Kay Pacity'],
 pue:['Undersecretary Pue Ritan','Secretary Wattson Kilojoule'],
 eu:['Commissioner Gee Dee Pierre','Commissioner Ann Adequacy'],
 egr:['Commissioner Ingrid Egress','Inspector Hotel Californo']};
const HS_LAW_KS=['cc','mor','pue','eu','egr'];
const hsLawU=q=>hstr(((S&&S.asn)||0)+'|law|'+q)%100000/100000;
const hsMin=(k,m)=>HS_MIN[k][m]||HS_MIN[k][0];
const hsLaw=()=>S&&S.hs&&S.hs.law||null;
// Hooks the other Hyperscaler files call (function declarations: they run after every file has loaded).
// 38-hyper-residency.js: a country whose own localisation law is in force pins its users like the built-in list does.
function hsRegRes(cc){const L=hsLaw(),x=L&&L.cc[cc];return x&&x.f<=S.day?'cc':'';}
// A moratorium in force in this metro, or null.
function hsMorAt(c){const L=hsLaw(),x=L&&L.mor[c];return x&&x.f<=S.day&&S.day<x.u?x:null;}
// What a build may take in c under a moratorium: only megawatts your own running generation adds, as far as they are free.
const hsMorFree=c=>Math.min(hsGenMw(c),hsMwFree(c));
// The megawatts a region build or upgrade in c takes (a cage holds none of your grid, so moving out takes a Barn's).
const hsRgNeed=c=>{const d=S.hs.rg[c];if(!d||d.t===HS_CAGE&&!d.up)return HS_T[1].mw;const N=hsTNext(d);return N?N.mw-HS_T[d.up?d.up.t:d.t].mw:0;};
const hsPueOn=reg=>{const L=hsLaw(),x=L&&L.pue[reg];return !!x&&x.f<=S.day;};
const hsEuOn=()=>{const L=hsLaw();return !!L&&!!L.eu&&L.eu.f<=S.day;};
// Regions the energy rule bills: in a continent with the rule in force, live, not heating anything.
const hsPueRgs=()=>Object.keys(S.hs.rg).filter(c=>hsPueOn(CITY[c].reg)&&hsLive(c)&&!(hsPw(c).heat)).sort();
const hsPueFee=c=>Math.round(hsMwUsed(c)*HS_PUE_MO);
// EU regions copying to a replica outside the EU.
const hsEuRgs=()=>hsRgs().filter(c=>HS_EU.includes(CITY[c].cc)&&(r=>!!r&&!HS_EU_SAFE.includes(CITY[r].cc))(hsRepOf(c)));
// Tenants that pay egress (Snack Storage, CloudFrontal Lobe), and what they pay a month at today's service.
const hsEgrTen=()=>hsTen().filter(b=>Array.isArray(b.p)&&(b.p.includes('obj')||b.p.includes('cdn')));
const hsEgrRev=r=>hsEgrTen().reduce((a,b)=>a+b.bw*b.rate*Math.min(1,hsTenQ(r,b)/0.95),0);
const hsEgrCut=()=>{const L=hsLaw(),x=L&&L.egr;return !!x&&x.st==='cut'&&x.u>S.day;};
CX_COST.push(()=>{if(!hsLaw()||!hyper())return 0;let m=0;for(const c of hsPueRgs())m+=hsPueFee(c);if(hsEuOn())m+=hsEuRgs().length*HS_EU_MO;return m;});
// The egress cut: a share of what egress tenants pay comes off the bill while it lasts.
CX_MONEY.push((R2,V)=>{if(!hsLaw()||!hyper()||!R2.hs||!hsEgrCut())return;V.business-=hsEgrRev(R2)*HS_EGR_CUT;});
const hsLawGo=c=>c?[{l:tr('common.open'),act:'popGo',args:{city:c}}]:[];
/* What can be announced today: each kind with its candidates (a country, a metro, a continent), seeded among the best. */
function hsLawPick(d){const H=S.hs,L=H.law,out=[];
  if(Object.keys(L.cc).length<HS_LAW_MAX){const cs=Object.keys(H.cc).filter(cc=>!hsResOf(cc)&&!L.cc[cc]&&!hsResMet0(cc)&&hsResSiteCc(cc)).sort((a,b)=>H.cc[b].d-H.cc[a].d||(a<b?-1:1)).slice(0,3);
    if(cs.length)out.push(['cc',cs[Math.floor(hsLawU('ccp|'+d)*cs.length)]]);}
  if(Object.keys(L.mor).filter(c=>L.mor[c].u>d).length<HS_MOR_MAX){const cs=Object.keys(S.pops).filter(c=>c!==S.home&&hsSite(c)&&!L.mor[c]&&CITY[c].dc).sort((a,b)=>(!!H.rg[b])-(!!H.rg[a])||CITY[b].P-CITY[a].P||(a<b?-1:1)).slice(0,3);
    if(cs.length)out.push(['mor',cs[Math.floor(hsLawU('morp|'+d)*cs.length)]]);}
  const regs=[...new Set(Object.keys(H.rg).map(c=>CITY[c].reg))].filter(g=>!L.pue[g]).sort((a,b)=>(b==='EU')-(a==='EU')||(a<b?-1:1));if(regs.length)out.push(['pue',regs[0]]);
  if(!L.eu&&Object.keys(H.rg).some(c=>HS_EU.includes(CITY[c].cc)))out.push(['eu','']);
  if(!L.egr&&lvl()>=HS_EGR_LV&&hsEgrTen().length)out.push(['egr','']);
  return out;}
// A country with users and no localisation law yet can only get one if a region could be built there.
const hsResSiteCc=cc=>CITIES.some(C=>C.cc===cc&&!C.off&&(C.id===S.home||hsMetro(C.id)));
// Whether a region in the country is already built or being built (the law would then change nothing worth announcing),
// and whether one is ready (the law is met).
const hsResMet0=cc=>Object.keys(S.hs.rg).some(r=>CITY[r].cc===cc);
const hsLawMet=cc=>Object.keys(S.hs.rg).some(r=>CITY[r].cc===cc&&S.hs.rg[r].ready<=S.day);
function hsLawStart(k,x,d){const L=S.hs.law,m=Math.floor(hsLawU(k+'|m|'+d)*HS_MIN[k].length),min=hsMin(k,m);
  if(k==='cc'){const f=d+150+Math.floor(hsLawU('ccf|'+d)*61);L.cc[x]={a:d,f,m};
    toast(`🏛️ ${tr('hyper_reg.cc_ann',{min,country:esc(ccName(x)),date:dateStr(f)})}`,'warn',hsLawGo(ccInfo(x)&&S.pops[ccInfo(x).main]?ccInfo(x).main:''));}
  else if(k==='mor'){const f=d+HS_MOR_AHEAD,u=f+180+Math.floor(hsLawU('moru|'+d)*181);L.mor[x]={a:d,f,u,m};
    toast(`🔌 ${tr('hyper_reg.mor_ann',{min,city:esc(CITY[x].name),date:dateStr(f),until:dateStr(u)})}`,'warn',hsLawGo(x));}
  else if(k==='pue'){const f=d+HS_PUE_AHEAD;L.pue[x]={a:d,f,m};toast(`🌡️ ${tr('hyper_reg.pue_ann',{min,reg:WAVE_NAME[x],date:dateStr(f),fee:fmt$(HS_PUE_MO)})}`,'warn');}
  else if(k==='eu'){const f=d+HS_EU_AHEAD;L.eu={a:d,f,m};toast(`🇪🇺 ${tr('hyper_reg.eu_ann_safe',{min,date:dateStr(f),fee:fmt$(HS_EU_MO)})}`,'warn');}
  else{const fee=Math.max(HS_EGR_MIN,Math.round(hsEgrRev(R)*HS_EGR_X/1000)*1000);L.egr={a:d,dl:d+HS_EGR_DL,st:'open',u:0,fee,m};
    toast(`🏨 ${tr('hyper_reg.egr_ann',{min,p:pct(HS_EGR_CUT),fee:fmt$(fee),date:dateStr(d+HS_EGR_DL)})}`,'warn',[{l:tr('common.show_me'),act:'leftTab',args:{t:'goals'}}]);}
  sfx('alert');}
/* A day: laws come into force, moratoria start and end, the egress deadline passes; now and then a new law. */
function hsLawDay(d){const H=S.hs;if(!H||!H.law||!hyper())return;const L=H.law;
  for(const cc of Object.keys(L.cc).sort()){const x=L.cc[cc];if(x.f!==d)continue;const v={min:hsMin('cc',x.m),country:esc(ccName(cc))};
    toast(`🏛️ ${hsLawMet(cc)?tr('hyper_reg.cc_live_ok',v):tr('hyper_reg.cc_live',v)}`,hsLawMet(cc)?'good':'bad');}
  for(const c of Object.keys(L.mor).sort()){const x=L.mor[c],v={min:hsMin('mor',x.m),city:esc(CITY[c].name),until:dateStr(x.u)};
    if(x.f===d){const P=H.pw[c];if(P&&P.q&&P.q.ready<x.u)P.q.ready=x.u+30;toast(`🔌 ${tr('hyper_reg.mor_live',v)}`,'bad',hsLawGo(c));}
    else if(x.u===d)toast(`🔌 ${tr('hyper_reg.mor_over',v)}`,'good',hsLawGo(c));
    // An old moratorium is forgotten a year after it ended: the metro may pause again later.
    else if(d>=x.u+365)delete L.mor[c];}
  for(const g of Object.keys(L.pue).sort())if(L.pue[g].f===d){const n=hsPueRgs().length;toast(`🌡️ ${tr('hyper_reg.pue_live',{min:hsMin('pue',L.pue[g].m),reg:WAVE_NAME[g]})} ${trn('hyper_reg.pue_n',n,{fee:fmt$(HS_PUE_MO)})}`,n?'bad':'good');}
  if(L.eu&&L.eu.f===d){const n=hsEuRgs().length;toast(`🇪🇺 ${tr('hyper_reg.eu_live',{min:hsMin('eu',L.eu.m)})} ${trn('hyper_reg.eu_n_unsafe',n,{fee:fmt$(HS_EU_MO)})}`,n?'bad':'good');}
  const E=L.egr;if(E&&E.st==='open'&&d>=E.dl){E.st='fined';E.fee=Math.round(E.fee*HS_EGR_LATE);S.cash-=E.fee;toast(`🏨 ${tr('hyper_reg.egr_fined',{min:hsMin('egr',E.m),fee:fmt$(E.fee)})}`,'bad');sfx('err');}
  if(E&&E.st==='cut'&&E.u===d)toast(`🏨 ${tr('hyper_reg.egr_cut_over')}`,'good');
  if(!rule('market')||d<HS_LAW_FROM||lvl()<HS_LAW_LV||d<L.nx||hsLawU('roll|'+d)>=HS_LAW_ODDS)return;
  // A new law is a crisis: the director (38-hyper-director.js) says when.
  const ks=hsLawPick(d);if(!ks.length)return;const [k,x]=ks[Math.floor(hsLawU('kind|'+d)*ks.length)];if(!hsDirAsk('law',1,x))return;L.nx=d+HS_LAW_GAP;L.n++;hsLawStart(k,x,d);}
CX_DAY.push(hsLawDay);
CX_NEW.push(o=>{o.law={cc:{},mor:{},pue:{},eu:null,egr:null,nx:0,n:0};});
// Saves: every law repaired; countries, metros and continents checked; unknown kinds dropped.
CX_SAN.push((h0,o,s)=>{const n=(v,d)=>Number.isFinite(+v)?+v:d,I=v=>Math.round(n(v,0)),obj=v=>v&&typeof v==='object'&&!Array.isArray(v),L0=obj(h0.law)?h0.law:{},M=(k,v)=>clamp(I(v),0,HS_MIN[k].length-1);
  const L={cc:{},mor:{},pue:{},eu:null,egr:null,nx:Math.max(0,I(L0.nx)),n:clamp(I(L0.n),0,1000)};
  if(obj(L0.cc))for(const k of Object.keys(L0.cc).slice(0,HS_LAW_MAX*2)){const x=L0.cc[k];if(typeof k==='string'&&ccInfo(k)&&!HS_SOV.includes(k)&&!HS_EU.includes(k)&&obj(x)&&Object.keys(L.cc).length<HS_LAW_MAX)L.cc[k]={a:I(x.a),f:I(x.f),m:M('cc',x.m)};}
  if(obj(L0.mor))for(const k of Object.keys(L0.mor).slice(0,20)){const x=L0.mor[k];if(isCity(k)&&obj(x)){const f=I(x.f);L.mor[k]={a:I(x.a),f,u:Math.max(f,I(x.u)),m:M('mor',x.m)};}}
  if(obj(L0.pue))for(const k of Object.keys(L0.pue))if(own(WAVE_NAME,k)&&obj(L0.pue[k]))L.pue[k]={a:I(L0.pue[k].a),f:I(L0.pue[k].f),m:M('pue',L0.pue[k].m)};
  if(obj(L0.eu))L.eu={a:I(L0.eu.a),f:I(L0.eu.f),m:M('eu',L0.eu.m)};
  const E=L0.egr;if(obj(E)&&['open','cut','paid','fined'].includes(E.st))L.egr={a:I(E.a),dl:I(E.dl),st:E.st,u:Math.max(0,I(E.u)),fee:clamp(I(E.fee),0,1e9),m:M('egr',E.m)};
  o.law=L;});
/* The charter card (55-hyper-panel.js): what a law asks of you now goes in the ranked alert list (hsLawAlerts: lv 1 a law
   in force that holds users or the egress answer due, lv 2 a fee or a law coming that you have not met), what is
   merely so in the stat lines (hsLawStat). */
function hsLawAlerts(){const L=hsLaw();if(!L||!hyper())return [];const out=[],A=(lv,h)=>out.push({lv,h});
  for(const cc of Object.keys(L.cc).sort()){const x=L.cc[cc],v={country:esc(ccName(cc)),date:dateStr(x.f)},met=hsLawMet(cc);if(met)continue;
    if(x.f>S.day)A(2,`🏛️ ${tr('hyper_reg.card_cc_soon',v)}`);else if(S.hs.cc[cc])A(1,`🏛️ ${tr('hyper_reg.card_cc_held',v)}`);}
  for(const g of Object.keys(L.pue).sort()){const x=L.pue[g];if(x.f>S.day)continue;const rs=hsPueRgs().filter(c=>CITY[c].reg===g);
    if(rs.length)A(2,`🌡️ ${tr('hyper_reg.card_pue',{reg:WAVE_NAME[g],fee:fmt$(rs.reduce((a,c)=>a+hsPueFee(c),0)),list:rs.slice(0,3).map(c=>esc(CITY[c].name)).join(', ')})} ${btn(tr('common.open'),'popGo',{city:rs[0]},'ghost sm')}`);}
  if(L.eu&&L.eu.f<=S.day){const rs=hsEuRgs();if(rs.length)A(2,`🇪🇺 ${trn('hyper_reg.card_eu_unsafe',rs.length,{fee:fmt$(rs.length*HS_EU_MO)})} ${btn(tr('common.open'),'popGo',{city:rs[0]},'ghost sm')}`);}
  const E=L.egr;if(E&&E.st==='open')A(1,`🏨 ${tr('hyper_reg.card_egr',{date:dateStr(E.dl),fee:fmt$(E.fee)})}<div class="btns">${btn(tr('hyper_reg.egr_cut_btn',{p:pct(HS_EGR_CUT)}),'hsEgress',{v:'cut'},'sm')}${btn(tr('hyper_reg.egr_pay_btn',{fee:fmt$(E.fee)}),'hsEgress',{v:'pay'},'pink sm',S.cash<E.fee)}</div>`);
  return out;}
function hsLawStat(){const L=hsLaw();if(!L||!hyper())return '';let h='';const meta=t=>`<div class="meta">${t}</div>`;
  for(const cc of Object.keys(L.cc).sort()){const x=L.cc[cc];if(x.f>S.day&&hsLawMet(cc))h+=meta(`🏛️ ${tr('hyper_reg.card_cc_ok',{country:esc(ccName(cc)),date:dateStr(x.f)})}`);}
  for(const c of Object.keys(L.mor).sort()){const x=L.mor[c];if(x.u<=S.day)continue;const v={city:esc(CITY[c].name),date:dateStr(x.f),until:dateStr(x.u)};h+=meta(`🔌 ${x.f>S.day?tr('hyper_reg.card_mor_soon',v):tr('hyper_reg.card_mor',v)}`);}
  for(const g of Object.keys(L.pue).sort())if(L.pue[g].f>S.day)h+=meta(`🌡️ ${tr('hyper_reg.card_pue_soon',{reg:WAVE_NAME[g],date:dateStr(L.pue[g].f)})}`);
  if(L.eu&&L.eu.f>S.day)h+=meta(`🇪🇺 ${tr('hyper_reg.card_eu_soon_safe',{date:dateStr(L.eu.f)})}`);
  if(hsEgrCut())h+=meta(`🏨 ${tr('hyper_reg.card_egr_cut',{p:pct(HS_EGR_CUT),date:dateStr(L.egr.u)})}`);
  return h;}
// The Cloud tab of a city: a folding section (55-hyper-panel.js) for a law coming for its country, a moratorium in its
// metro, the energy rule or the EU fee on its region; flagged when it costs you or holds users.
function hsLawSpec(c){const L=hsLaw();if(!L||!hyper())return null;const cc=CITY[c].cc,x=L.cc[cc],M=L.mor[c],H=S.hs;let h='',bad=0;const P=(w,t)=>{if(w)bad++;h+=`<p class="${w?'why':'meta'}">${t}</p>`;};
  if(x)P(!hsLawMet(cc)&&(x.f>S.day||!!H.cc[cc]),`🏛️ ${tr('hyper_reg.city_cc',{min:esc(hsMin('cc',x.m)),country:esc(ccName(cc)),date:dateStr(x.f)})}`);
  if(M&&M.u>S.day)P(M.f<=S.day,`🔌 ${tr('hyper_reg.city_mor',{min:esc(hsMin('mor',M.m)),date:dateStr(M.f),until:dateStr(M.u)})}`);
  if(H.rg[c]&&hsPueRgs().includes(c))P(1,`🌡️ ${tr('hyper_reg.city_pue',{fee:fmt$(hsPueFee(c))})}`);
  if(H.rg[c]&&hsEuOn()&&hsEuRgs().includes(c))P(1,`🇪🇺 ${tr('hyper_reg.city_eu_unsafe',{fee:fmt$(HS_EU_MO),b:esc(CITY[hsRepOf(c)].name)})}`);
  if(!h)return null;return {t:`🏛️ ${tr('hyper_reg.title')}`,sum:'',flags:bad?[['selective',tr('hyper_ui.f_law')]]:[],body:()=>h};}
