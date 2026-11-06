// Pie in the Sky (60-features/99-pie-in-the-sky.js): every action checks pieCanBuild() for anything new.
const pieRe=()=>{after();if(!$('modal').hidden&&$('modal').className==='pie')pieModal();if(!$('bankBox').hidden)renderBank();};
const pieNo=why=>{toast(why,'bad');sfx('err');pieRe();};
Object.assign(ACT,{
 pieOpen:()=>{if(!S||pzOn()||!pieOn())return;UI.confirm=null;pieModal();},
 pieFound:()=>{const P=pieGet();if(!P||P.co)return;if(!pieCanBuild())return pieNo(tr('pie.why_not_t1'));if(!pieSpend(piePrice(PIE_CO)))return pieRe();
   P.co={name:PIE_NAMES[0]};P.born=Math.min(P.born,S.day);pieFounder(N_('pie.fp_found'));piePromise();track('pie_found');toast(tr('pie.t_found',{co:esc(pieCoName())}),'goal');pieRe();},
 pieFactory:()=>{const P=pieGet();if(!P||!P.co||P.fac)return;if(!pieCanBuild())return pieNo(tr('pie.why_not_t1'));if(!pieSpend(piePrice(PIE_FAC)))return pieRe();
   P.fac=true;toast(tr('pie.t_factory',{n:PIE_FAC_MONTH}),'good');pieRe();},
 piePad:({city})=>{const P=pieGet();if(!P||!P.co||!isCity(city))return;if(!pieCanBuild())return pieNo(tr('pie.why_not_t1'));
   if(!S.pops[city]||!pieCoast(city))return pieNo(tr('pie.why_pad_city'));if(P.pads.some(p=>p.city===city)||P.pads.length>=PIE_PAD_MAX)return;
   if(!pieSpend(piePrice(PIE_PAD)))return pieRe();P.pads.push({city,next:S.day,boosters:[]});toast(tr('pie.t_pad',{city:CITY[city].name,p:pct(pieEq(city))}),'good');pieRe();},
 pieRd:({k})=>{const P=pieGet();if(!P||!P.co||!own(PIE_RD,k)||P.rd[k])return;if(!pieCanBuild())return pieNo(tr('pie.why_not_t1'));if(!pieSpend(piePrice(PIE_RD[k].cost)))return pieRe();
   P.rd[k]=true;toast(tr('pie.t_rd',{rd:tr(PIE_RD[k].n)}),'good');if(k==='heavy')piePromise();pieRe();},
 pieLaunch:({rk,cr})=>{const P=pieGet();if(!P)return;const o={ins:!!UI.pieIns,las:!!UI.pieLas},q=pieQuote(rk,cr,o);if(!q.ok)return pieNo(q.why);if(!pieSpend(q.cost))return pieRe();
   const pad=P.pads.find(p=>p.city===q.pad);pad.next=q.day+leadDays(ROCKETS[rk].gap);if(rk==='again'&&!pad.boosters.length)pad.boosters.push({id:uid(),flights:0});
   P.stock=Math.max(0,P.stock-q.n);P.crusts[cr].queued+=q.n;P.q.push({id:uid(),rk,cr,pad:q.pad,n:q.n,day:q.day,cost:q.ins?q.insured:0,ins:q.ins,las:o.las&&!q.test,test:q.test});pieGrabUse(q);
   {const v={n:q.n,crust:tr(CRUSTS[cr].n),city:CITY[q.pad].name,d:dateStr(q.day)};toast(q.test?tr('pie.t_queued_test',v):tr('pie.t_queued',v),'good');}pieRe();},
 pieIns:()=>{UI.pieIns=!UI.pieIns;sfx('click');pieModal();},
 pieLas:()=>{UI.pieLas=!UI.pieLas;sfx('click');pieModal();},
 pieDish:({city})=>{const P=pieGet();if(!P||!P.co||!isCity(city))return;if(!pieCanBuild())return pieNo(tr('pie.why_not_t1'));if(!S.pops[city])return pieNo(tr('pie.why_dish_city'));
   if(P.dishes.some(x=>x.city===city)||P.dishes.length>=PIE_DISH_MAX)return;if(!pieSpend(piePrice(PIE_DISH+PIE_ANT)))return pieRe();
   P.dishes.push({id:uid(),city,ant:1,down:0});if(P.dishes.length===1)pieFounder(N_('pie.fp_dish'));toast(tr('pie.t_dish',{city:CITY[city].name}),'good');pieRe();},
 pieAnt:({id})=>{const P=pieGet();const x=P&&P.dishes.find(d=>d.id===id);if(!x||x.ant>=PIE_ANT_MAX)return;if(!pieCanBuild())return pieNo(tr('pie.why_not_t1'));if(!pieSpend(piePrice(PIE_ANT)))return pieRe();x.ant++;pieRe();},
 // Landing rights: bought for a year, renewed for another from whenever they run out.
 pieLic:({cc})=>{const P=pieGet();if(!P||!P.co||typeof cc!=='string'||!CITIES.some(c=>c.cc===cc))return;const l=P.lic[cc];if(l&&l.state!=='ok'&&l.until>S.day)return pieNo(tr('pie.why_lic_refused'));
   if(!pieSpend(pieLicPrice(cc)))return pieRe();P.lic[cc]={state:'ok',until:Math.max(S.day,l&&l.state==='ok'?l.until:0)+PIE_LIC_DAYS};toast(tr('pie.t_lic',{n:pieLicCountry(cc)}),'good');pieRe();},
 pieSafe:()=>{const P=pieGet();if(!P||!P.co)return;P.safe=!P.safe;sfx('click');pieRe();},
 pieName:()=>{const P=pieGet();if(!P||!P.co)return;const i=PIE_NAMES.indexOf(P.co.name);P.co.name=PIE_NAMES[(i+1)%PIE_NAMES.length];pieFounder(N_('pie.fp_rename'));pieRe();},
 pieRename:()=>{const P=pieGet(),el=$('pieNm');if(!P||!P.co||!el)return;const v=el.value.replace(/\s+/g,' ').trim().slice(0,40);if(!v)return;P.co.name=v;pieFounder(N_('pie.fp_rename'));pieRe();},
 // Government money (60-features/99-pie-subsidies.js): its section in the bank, a bid, the Ex-Im loan. It was Pie Control's Gov tab; the name stays for old toasts.
 pieGovOpen:()=>{if(!S||pzOn()||!pieOn())return;if(!$('modal').hidden)closeModal();ACT.bank();const g=$('bankGov');if(g&&g.scrollIntoView)g.scrollIntoView({block:'start'});},
 pieBid:({id,f})=>{const P=pieGet();f=+f;const a=P&&P.gov.auc.find(x=>x.id===id);if(!a||!PIE_RDF_BIDS.includes(f))return;if(!pieCanBuild())return pieNo(tr('pie.why_not_t1'));
   a.bid=f;toast(tr('pie_gov.t_bid',{city:esc(CITY[a.city].name),mo:fmt$(Math.round(a.ask*f)),d:dateStr(a.close)}),'good');sfx('click');pieRe();},
 pieExim:()=>{const P=pieGet();if(!P||!P.co)return;if(!pieCanBuild())return pieNo(tr('pie.why_not_t1'));if(!pieEximTake())return pieRe();
   const l=pieEximLoan();toast(`<b>${tr('interface.amt_from_bank_has_landed',{amt:fmt$(l.amount),bank:esc(BANKS.exim.name)})}</b><br>${loanSummary(l)}`,'good');sfx('coin');pieRe();},
 pieTab:({t})=>{if(t==='gov')return ACT.pieGovOpen();if(!PIE_TABS.includes(t)&&t!=='book'&&t!=='founder')return;UI.pieTab=pieTabOf(t);pieModal();},
 pieHi:({id})=>{if(typeof id!=='string')return;sfx('click');pieHiSet(id);},
 pieCity:({v})=>{if(!S||!S.pops[v])return;UI.pieCity=v;pieModal();},
});
