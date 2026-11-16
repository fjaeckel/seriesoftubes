// Pie in the Sky (60-features/99-pie-in-the-sky.js): every action checks pieCanBuild() for anything new.
const pieRe=()=>{after();if(!$('modal').hidden&&$('modal').className==='pie')pieModal();if(!$('bankBox').hidden)renderBank();};
const pieNo=why=>{toast(why,'bad');sfx('err');pieRe();};
/* Dish changes shared by the buttons and the dish optimizer (93-ui/87-pie-plan.js): true when done, false when the money
   was refused (spend() said so), a reason to show, or '' when there is nothing to do. */
function pieDishAdd(city){const P=S.pie;if(!pieCanBuild())return tr('pie.why_not_t1');if(!S.pops[city])return tr('pie.why_dish_city');
  if(P.dishes.some(x=>x.city===city)||P.dishes.length>=PIE_DISH_MAX)return '';if(!pieSpend(pieDishPrice()))return false;
  P.dishes.push({id:uid(),city,ant:1,down:0,band:pieBandMax()});if(P.dishes.length===1)pieFounder(N_('pie.fp_dish'));return true;}
function pieAntAdd(x,n){n=Math.min(n|0,pieAntLeft(x));if(n<1)return '';if(!pieCanBuild())return tr('pie.why_not_t1');if(!pieSpend(n*pieAntPrice(x.band)))return false;x.ant+=n;return true;}
function pieBandUp(x){const v=pieBandCost(x);if(!v)return '';if(!pieCanBuild())return tr('pie.why_not_t1');if(!pieSpend(v))return false;x.band=pieBandMax();return true;}
// Takes a dish down for its salvage, which it returns; asking first is the caller's job.
function pieDishTake(x){const v=pieDishSalvage(x);S.pie.dishes=S.pie.dishes.filter(d=>d!==x);pieRefund(v);return v;}
const pieDone=(r,ok)=>{if(r===true){if(ok)ok();pieRe();}else if(r)pieNo(r);else if(r===false)pieRe();};
// Launch options live in the save, so they stay as the player left them.
const pieOpt=k=>{const P=pieGet();if(!P)return;P.opt[k]=!P.opt[k];sfx('click');pieRe();};
// A paid launch onto the queue, at the pad its quote picked.
function pieQueue(rk,cr,q,o){const P=S.pie,pad=P.pads.find(p=>p.city===q.pad),pn=pad.next;pad.next=q.day+piePadGap(pad,rk);if(rk==='again'&&!pad.boosters.length)pad.boosters.push({id:uid(),flights:0});
  P.stock=Math.max(0,P.stock-q.n);P.crusts[cr].queued+=q.n;P.q.push({id:uid(),rk,cr,pad:q.pad,n:q.n,day:q.day,cost:q.ins?q.insured:0,ins:q.ins,las:o.las&&!q.test,test:q.test,paid:q.cost,at:S.day,pn});pieGrabUse(q);}
/* Calling off a queued launch (#365), before its day: the pies go back on the shelf (as far as it holds them), and the money
   comes back in full the day it was booked (a misclick), or half later (the launch provider keeps the rest). The pad's
   slot frees up when it was the last launch queued there. */
const pieCxBack=L=>Math.round((L.paid||0)*(L.at===S.day?1:0.5));
function pieCancel(L){const P=S.pie,pad=P.pads.find(p=>p.city===L.pad),v=pieCxBack(L);P.q=P.q.filter(x=>x!==L);
  P.crusts[L.cr].queued=Math.max(0,P.crusts[L.cr].queued-L.n);P.stock=Math.min(pieStockMax(),P.stock+L.n);pieRefund(v);
  // Launches queued after it on the pad inherit the slot the pad had before it, so calling off every one frees the pad.
  for(const x of P.q)if(x.pad===L.pad&&x.day>L.day)x.pn=Math.min(x.pn??S.day,L.pn??S.day);
  if(pad){const rest=P.q.filter(x=>x.pad===pad.city);pad.next=rest.length?Math.max(...rest.map(x=>x.day+piePadGap(pad,x.rk))):Math.max(S.day,Math.min(pad.next,L.pn??S.day));}
  return v;}
Object.assign(ACT,{
 pieOpen:()=>{if(!S||pzOn()||!pieOn())return;UI.confirm=null;pieModal();},
 pieFound:()=>{const P=pieGet();if(!P||P.co)return;if(!pieCanBuild())return pieNo(tr('pie.why_not_t1'));if(!pieSpend(piePrice(PIE_CO)))return pieRe();
   P.co={name:PIE_NAMES[0]};P.born=Math.min(P.born,S.day);pieFounder(N_('pie.fp_found'));piePromise();track('pie_found');toast(tr('pie.t_found',{co:esc(pieCoName())}),'goal');pieRe();},
 pieFactory:()=>{const P=pieGet();if(!P||!P.co||P.fac)return;if(!pieCanBuild())return pieNo(tr('pie.why_not_t1'));if(!pieSpend(piePrice(PIE_FAC)))return pieRe();
   P.fac=true;toast(tr('pie.t_factory',{n:PIE_FAC_MONTH}),'good');pieRe();},
 piePad:({city})=>{const P=pieGet();if(!P||!P.co||!isCity(city))return;if(!pieCanBuild())return pieNo(tr('pie.why_not_t1'));
   if(!S.pops[city]||!pieCoast(city))return pieNo(tr('pie.why_pad_city'));if(P.pads.some(p=>p.city===city)||P.pads.length>=PIE_PAD_MAX)return;
   if(!pieSpend(piePrice(PIE_PAD)))return pieRe();P.pads.push({city,next:S.day,t:1,boosters:[]});toast(tr('pie.t_pad',{city:CITY[city].name,p:pct(pieEq(city))}),'good');pieRe();},
 pieRd:({k})=>{const P=pieGet();if(!P||!P.co||!own(PIE_RD,k)||P.rd[k])return;if(PIE_RD[k].need&&!P.rd[PIE_RD[k].need])return pieNo(tr('pie.why_no_rd',{rd:tr(PIE_RD[PIE_RD[k].need].n)}));if(!pieCanBuild())return pieNo(tr('pie.why_not_t1'));if(!pieSpend(piePrice(PIE_RD[k].cost)))return pieRe();
   P.rd[k]=true;toast(tr('pie.t_rd',{rd:tr(PIE_RD[k].n)}),'good');if(k==='heavy')piePromise();pieRe();},
 pieLaunch:({rk,cr})=>{const P=pieGet();if(!P)return;const o={ins:P.opt.ins,las:P.rd.las};
   // "Every pad": one launch per tower that reaches the crust, until one cannot be quoted or paid.
   if(P.opt.all&&own(CRUSTS,cr)){const N=pieSlots(cr);let k=0,why=null,cost=0;for(let i=0;i<N;i++){const q=pieQuote(rk,cr,o);if(!q.ok){why=q.why;break;}if(!pieSpend(q.cost)){why='';break;}pieQueue(rk,cr,q,o);k++;cost+=q.cost;}
     if(!k)return why?pieNo(why):pieRe();toast(tr('pie.t_queued_all',{n:k,crust:tr(CRUSTS[cr].n),price:fmt$(cost)}),'good');return pieRe();}
   const q=pieQuote(rk,cr,o);if(!q.ok)return pieNo(q.why);if(!pieSpend(q.cost))return pieRe();pieQueue(rk,cr,q,o);
   {const v={n:q.n,crust:tr(CRUSTS[cr].n),city:CITY[q.pad].name,d:dateStr(q.day)};toast(q.test?tr('pie.t_queued_test',v):tr('pie.t_queued',v),'good');}pieRe();},
 pieAll:()=>pieOpt('all'),
 // Calling off a queued launch: asked once (what comes back), then for good.
 pieCx:({id,ok})=>{const P=pieGet();const L=P&&P.q.find(x=>x.id===id);if(!L)return;if(L.day<=S.day)return pieNo(tr('pie.cx_too_late'));
   if(!ok){UI.pieCxAsk=id;sfx('click');return pieModal();}UI.pieCxAsk=null;const v=pieCancel(L);
   toast(tr('pie.t_cancelled',{crust:tr(CRUSTS[L.cr].n),amt:fmt$(v)}),'good');pieRe();},
 pieCxKeep:()=>{UI.pieCxAsk=null;sfx('click');pieModal();},
 // Scaling up (60-features/99-pie-scale.js).
 pieLine:()=>{const P=pieGet();if(!P||!P.fac||P.lines>=PIE_LINE_MAX)return;if(!pieCanBuild())return pieNo(tr('pie.why_not_t1'));if(!pieSpend(piePrice(PIE_LINE)))return pieRe();
   P.lines++;toast(tr('pie.t_line',{n:P.lines,m:pieFacMonth()}),'good');pieRe();},
 // A production line less: a quarter of its price back, its running cost gone; the shelf shrinks with it.
 pieLineDel:()=>{const P=pieGet();if(!P||!P.fac||P.lines<=1)return;P.lines--;P.stock=Math.min(P.stock,pieStockMax());const v=Math.round(piePrice(PIE_LINE)*PIE_SALVAGE);pieRefund(v);toast(tr('pie.t_line_del',{n:P.lines,amt:fmt$(v)}),'good');pieRe();},
 pieTower:({city})=>{const P=pieGet();const p=P&&P.pads.find(x=>x.city===city);if(!p||p.t>=PIE_TOWER_MAX)return;if(!pieCanBuild())return pieNo(tr('pie.why_not_t1'));if(!pieSpend(piePrice(PIE_TOWER)))return pieRe();
   p.t++;toast(tr('pie.t_tower',{city:CITY[city].name,n:p.t}),'good');pieRe();},
 pieAntMax:({id})=>{const P=pieGet();const x=P&&P.dishes.find(d=>d.id===id);if(!x)return;pieDone(pieAntAdd(x,pieAntLeft(x)));},
 pieAntAll:()=>{const P=pieGet();if(!P||!P.co)return;const v=pieAntAllCost();if(!v)return;if(!pieCanBuild())return pieNo(tr('pie.why_not_t1'));if(!pieSpend(v))return pieRe();
   for(const x of P.dishes)x.ant=PIE_ANT_MAX;toast(tr('pie.t_ant_all',{n:P.dishes.length}),'good');pieRe();},
 pieDishAll:({cc})=>{const P=pieGet();if(!P||!P.co||typeof cc!=='string')return;if(!pieCanBuild())return pieNo(tr('pie.why_not_t1'));
   const cs=pieDishFree(cc).slice(0,PIE_DISH_MAX-P.dishes.length);if(!cs.length)return;if(!pieSpend(cs.length*pieDishPrice()))return pieRe();
   const first=!P.dishes.length;for(const city of cs)P.dishes.push({id:uid(),city,ant:1,down:0,band:pieBandMax()});if(first)pieFounder(N_('pie.fp_dish'));toast(tr('pie.t_dish_all',{n:cs.length,country:pieLicCountry(cc)}),'good');pieRe();},
 // Every country with a dish or rights, covered for y years from today.
 pieLicAll:({y})=>{const P=pieGet();y=+y;if(!P||!P.co||!PIE_LIC_YEARS.includes(y))return;const Q=pieLicAllQuote(y);if(!Q.list.length)return;if(!pieSpend(Q.cost))return pieRe();
   for(const [cc,n] of Q.list)pieLicAdd(cc,n);toast(tr('pie.t_lic_all',{n:Q.list.length,y}),'good');pieRe();},
 pieGf:({v})=>{UI.pieGf=['','dish','none','lic'].includes(v)?v:'';pieModal();},
 pieDs:({v})=>{UI.pieDs=PIE_DS.includes(v)?v:'u';pieModal();},
 pieDAll:()=>{UI.pieDAll=!UI.pieDAll;sfx('click');pieModal();},
 // From a traffic row or a bottleneck to that dish in the Dishes tab: its country unfolded, the filters cleared, the row in view.
 pieDishGo:({city})=>{if(!S||!S.pie||!isCity(city))return;const o=UI.pieCcs||(UI.pieCcs=new Set());o.add(CITY[city].cc);UI.pieGf='';UI.pieGr='';UI.pieFocus=city;UI.pieTab='dish';UI.pieDv='cc';sfx('click');pieModal();
   const el=document.querySelector(`#modal [data-dish="${city}"]`);if(el&&el.scrollIntoView)el.scrollIntoView({block:'center'});if(PG.cv)pieGlobeLook([city]);},
 pieDv:({v})=>{UI.pieDv=v==='load'?'load':'cc';sfx('click');pieModal();},
 pieRkd:()=>{UI.pieRk=!UI.pieRk;pieModal();},
 pieNoSats:()=>{UI.pieNoSats=!UI.pieNoSats;sfx('click');pieModal();},
 pieCk:({v})=>{UI.pieCk=PIE_CK.includes(v)?v:'';pieModal();},
 pieCs:({v})=>{UI.pieCs=PIE_CS.includes(v)?v:'g';pieModal();},
 pieFk:({v})=>{UI.pieFk=PIE_FKS.includes(v)?v:'';pieModal();},
 pieFs:({v})=>{UI.pieFs=PIE_FSORT.includes(v)?v:'sev';pieModal();},
 pieGs:({v})=>{UI.pieGs=PIE_GSORT.includes(v)?v:'reg';pieModal();},
 pieGr:({v})=>{UI.pieGr=own(REG,v)?v:'';pieModal();},
 pieCc:({cc})=>{if(typeof cc!=='string')return;const o=UI.pieCcs||(UI.pieCcs=new Set());if(o.has(cc))o.delete(cc);else o.add(cc);sfx('click');pieModal();},
 pieIns:()=>pieOpt('ins'),
 // A dish's antennas moved up to the best band researched, priced antenna by antenna; or every dish at once.
 pieBand:({id})=>{const P=pieGet();const x=P&&P.dishes.find(d=>d.id===id);if(!x)return;pieDone(pieBandUp(x),()=>toast(tr('pie.t_band',{city:CITY[x.city].name,b:PIE_BAND_N[x.band]}),'good'));},
 pieBandAll:()=>{const P=pieGet();if(!P||!P.co)return;const v=P.dishes.reduce((a,x)=>a+pieBandCost(x),0);if(!v)return;if(!pieCanBuild())return pieNo(tr('pie.why_not_t1'));if(!pieSpend(v))return pieRe();for(const x of P.dishes)x.band=pieBandMax();toast(tr('pie.t_band_all',{n:P.dishes.length,b:PIE_BAND_N[pieBandMax()]}),'good');pieRe();},
 // Closing a pad: asked once, then for good, with a quarter of its build cost back. Not while launches wait on it.
 piePadNew:()=>{UI.piePadNew=!UI.piePadNew;sfx('click');pieModal();},
 piePadKeep:()=>{UI.piePadAsk=null;sfx('click');pieModal();},
 piePadClose:({city,ok})=>{const P=pieGet();const p=P&&P.pads.find(x=>x.city===city);if(!p)return;if(P.q.some(L=>L.pad===city))return pieNo(tr('pie.pad_close_q'));
   if(!ok){UI.piePadAsk=city;sfx('click');return pieModal();}UI.piePadAsk=null;const v=piePadSalvage(p);P.pads=P.pads.filter(x=>x!==p);pieRefund(v);toast(tr('pie.t_pad_closed',{city:CITY[city].name,amt:fmt$(v)}),'good');pieRe();},
 pieDish:({city})=>{const P=pieGet();if(!P||!P.co||!isCity(city))return;pieDone(pieDishAdd(city),()=>toast(tr('pie.t_dish',{city:CITY[city].name}),'good'));},
 // Taking a dish down (with its antennas): asked once, a quarter of its price back. Its terminals land elsewhere next compute.
 pieDishKeep:()=>{UI.pieDishAsk=null;sfx('click');pieModal();},
 pieDishClose:({city,ok})=>{const P=pieGet();const x=P&&P.dishes.find(d=>d.city===city);if(!x)return;
   if(!ok){UI.pieDishAsk=city;sfx('click');return pieModal();}UI.pieDishAsk=null;const v=pieDishTake(x);toast(tr('pie.t_dish_closed',{city:CITY[city].name,amt:fmt$(v)}),'good');pieRe();},
 pieAnt:({id})=>{const P=pieGet();const x=P&&P.dishes.find(d=>d.id===id);if(!x)return;pieDone(pieAntAdd(x,1));},
 // Landing rights: bought for a year, renewed for another from whenever they run out.
 pieLic:({cc,y})=>{const P=pieGet();if(!P||!P.co||typeof cc!=='string'||!CITIES.some(c=>c.cc===cc))return;if(!pieFree(cc))return pieNo(tr('pie.why_lic_refused'));
   // Without y: one more year from whenever they run out. With y: whole years so they run at least y years from today.
   const n=y===undefined?Math.min(1,pieLicRoom(cc)):PIE_LIC_YEARS.includes(+y)?pieLicYears(cc,+y):0;if(!n)return;
   if(!pieSpend(n*pieLicPrice(cc)))return pieRe();pieLicAdd(cc,n);toast(n>1?tr('pie.t_lic_years',{n:pieLicCountry(cc),y:n}):tr('pie.t_lic',{n:pieLicCountry(cc)}),'good');pieRe();},
 pieSafe:()=>{const P=pieGet();if(!P||!P.co)return;P.safe=!P.safe;sfx('click');pieRe();},
 pieName:()=>{const P=pieGet();if(!P||!P.co)return;const i=PIE_NAMES.indexOf(P.co.name);P.co.name=PIE_NAMES[(i+1)%PIE_NAMES.length];pieFounder(N_('pie.fp_rename'));pieRe();},
 pieRename:()=>{const P=pieGet(),el=$('pieNm');if(!P||!P.co||!el)return;const v=el.value.replace(/\s+/g,' ').trim().slice(0,40);if(!v)return;P.co.name=v;pieFounder(N_('pie.fp_rename'));pieRe();},
 // Government money (60-features/99-pie-subsidies.js): its section in the bank, a bid, the Ex-Im loan. It was Pie Control's Gov tab; the name stays for old toasts.
 pieGovOpen:()=>{if(!S||pzOn()||!pieOn())return;if(!$('modal').hidden)closeModal();ACT.bank();const g=$('bankGov');if(g&&g.scrollIntoView)g.scrollIntoView({block:'start'});},
 pieBid:({id,f})=>{const P=pieGet();f=+f;const a=P&&P.gov.auc.find(x=>x.id===id);if(!a||!PIE_RDF_BIDS.includes(f))return;if(!pieCanBuild())return pieNo(tr('pie.why_not_t1'));
   a.bid=f;toast(tr('pie_gov.t_bid',{city:esc(CITY[a.city].name),mo:fmt$(Math.round(a.ask*f)),d:dateStr(a.close)}),'good');sfx('click');pieRe();},
 pieExim:()=>{const P=pieGet();if(!P||!P.co)return;if(!pieCanBuild())return pieNo(tr('pie.why_not_t1'));if(!pieEximTake())return pieRe();
   const l=pieEximLoan();toast(`<b>${tr('interface.amt_from_bank_has_landed',{amt:fmt$(l.amount),bank:esc(BANKS.exim.name)})}</b><br>${loanSummary(l)}`,'good');sfx('coin');pieRe();},
 pieTab:({t})=>{if(t==='gov')return ACT.pieGovOpen();if(typeof t!=='string')return;const n=pieTabOf(t);
  // A highlight or picked dish belongs to its tab: a new tab gets the whole globe back.
  if(n!==UI.pieTab){if((UI.pieHi||UI.pieFocus)&&PG.cv)PG.goal={yaw:PG.yaw,tilt:PG.tilt,z:1};UI.pieHi=null;UI.pieFocus=null;}
  UI.pieTab=n;pieModal();},
 pieHi:({id})=>{if(typeof id!=='string')return;sfx('click');pieHiSet(id);},
 piePadAll:()=>{UI.piePadAll=!UI.piePadAll;sfx('click');pieModal();},
 pieGo:({city})=>{if(!S||!isCity(city))return;closeModal();ACT.focusCity({city});},
});
