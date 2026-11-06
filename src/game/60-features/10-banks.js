/* ================= BANKS & LOANS =================
   Lenders make offers now and then (more often when you are broke). Each loan
   is a fixed monthly payment that shows up in your costs; conditions are checked
   daily and breaking one costs a penalty. */
const BANKS={
 gs:{name:'Goldman Sacks',col:'#6F8FAF',min:'AA',apr:[.07,.11],amt:[4,9],term:[24,48],covs:['peer30','continents2','golf','yacht'],blurb:tr('banks.only_lends_to_people_who_do')},
 db:{name:'Deutsche Bankrupt',col:'#0018A8',min:'A',apr:[.08,.13],amt:[3,7],term:[18,36],covs:['nocog','gen','fax'],blurb:tr('banks.very_solid_mostly')},
 jpm:{name:'JP Morgain',col:'#5B4636',min:'A',apr:[.09,.14],amt:[3,6],term:[12,36],covs:['uptime','logo','nephew'],blurb:tr('banks.lends_you_money_and_also_a')},
 cs:{name:'Credit Sweaty',col:'#7A9CC6',min:'BBB',apr:[.11,.17],amt:[2,5],term:[12,30],covs:['cash50','nochina'],blurb:tr('banks.nervous_but_enthusiastic')},
 wf:{name:'Wells Far-Gone',col:'#D71E28',min:'BB',apr:[.12,.18],amt:[2,4],term:[12,24],covs:['nosub','logo','reach99'],blurb:tr('banks.opened_three_accounts_for_you_while')},
 spk:{name:'Spätzle-Sparkasse',col:'#E30613',min:'B',apr:[.05,.08],amt:[1,3],term:[24,60],covs:['spaetzle','kehrwoche'],blurb:tr('banks.cheap_patient_and_very_particular')},
 rev:{name:'Revoloot',col:'#191C1F',min:'B',apr:[.13,.2],amt:[1,3],term:[6,18],covs:['app'],blurb:tr('banks.instant_approval_instant_regret')},
 gov:{name:'Ministry of Tubes',col:'#2E7D32',min:'CCC',apr:[.01,.02],amt:[1,2],term:[36,60],covs:['rural','forms'],blurb:tr('banks.cheap_state_money_for_connecting_the')},
 crypto:{name:'Crypto Bros Capital',col:'#F7931A',min:'CCC',apr:[.15,.25],amt:[2,6],term:[6,18],covs:['hodl','tier3'],crypto:true,blurb:tr('banks.pays_out_in_tubecoin_value_may')},
 vult:{name:'Venture Vultures',col:'#8E44AD',min:'CCC',amt:[6,12],share:[.1,.15],covs:['blitz'],equity:true,blurb:tr('banks.no_repayments_ever_just_a_slice')},
 balloon:{name:'Ballooney Brothers',col:'#E91E63',min:'B',apr:[.1,.15],amt:[2,6],term:[12,24],covs:['oddpops'],model:'balloon',blurb:tr('banks.no_payments_at_all_until_the')},
 storm:{name:'Stormy Weather Lending',col:'#546E7A',min:'BB',apr:[.04,.06],amt:[2,5],term:[12,36],covs:['nogen'],model:'storm',blurb:tr('banks.cheap_while_the_sun_shines_every')},
 ppp:{name:'Peer Pressure Partners',col:'#00897B',min:'B',amt:[2,5],term:[24,36],covs:['nocache'],model:'transit',blurb:tr('banks.you_repay_with_30_of_your')},
 astro:{name:'Horoscope Holdings',col:'#5E35B1',min:'CCC',apr:[.02,.3],amt:[1,4],term:[12,24],covs:['friday','nobude'],model:'astro',blurb:tr('banks.your_rate_is_set_by_the')},
 pizza:{name:'Papa Pizza Capital',col:'#FF7043',min:'BB',apr:[.03,.05],amt:[1,3],term:[12,24],covs:['pizza'],blurb:tr('banks.the_cheapest_money_in_town_there')},
 // The rocket company's state lender: never calls on its own, offered in Pie Control (99-pie-subsidies.js), sized there.
 exim:{name:'Ex-Im Pie Bank',col:'#1565C0',min:'C',apr:[.015,.025],amt:[0,0],term:[60,60],covs:['pielaunch','piedish'],pie:true,blurb:tr('banks.exim_blurb')},
 shark:{name:'Loan Shark Telecom Finance',col:'#37474F',min:'C',apr:[.6,.9],amt:[1,2],term:[4,8],covs:[],shark:true,blurb:tr('banks.always_open_ask_no_questions_do')},
};
const RATINGS=['C','CCC','B','BB','BBB','A','AA','AAA'];
const COVS={
 peer30:{l:tr('banks.keep_your_peering_ratio_above_30'),ok:()=>(R.peerShare||0)>=0.3},
 continents2:{l:tr('banks.keep_pops_on_at_least_2'),ok:()=>regionsCount()>=2},
 golf:{l:tr('banks.your_ceo_plays_golf_with_our'),ok:()=>true},
 nocog:{l:tr('banks.no_cogentle_transit_anywhere_our_ceo'),ok:()=>!S.transit.some(t=>t.net==='cog')},
 gen:{l:tr('banks.every_pop_needs_a_backup_generator'),ok:()=>Object.values(S.pops).every(p=>p.gen)},
 fax:{l:tr('banks.send_us_your_monthly_report_by'),ok:()=>true},
 uptime:{l:tr('banks.deliver_at_least_95_of_what'),ok:()=>!R.demand||R.served/R.demand>=0.95},
 logo:{l:tr('banks.our_logo_goes_on_every_router'),ok:()=>true},
 cash50:{l:tr('banks.never_let_cash_drop_below_50k'),ok:()=>S.cash>=50000},
 nochina:{l:tr('banks.stay_out_of_mainland_china'),ok:()=>!Object.keys(S.pops).some(cnCity)},
 nosub:{l:tr('banks.no_new_subsea_links_while_this'),ok:l=>S.links.filter(x=>x.sub).length<=(l.base&&l.base.sub||0)},
 spaetzle:{l:tr('banks.peer_at_the_spatzle_ix_in'),ok:()=>S.ixp.stg!==undefined},
 kehrwoche:{l:tr('banks.do_the_kehrwoche_keep_your_noc'),ok:()=>!S.inc.some(i=>S.day-i.start>7)},
 app:{l:tr('banks.download_our_app_and_enable_all'),ok:()=>true},
 rural:{l:tr('banks.run_home_broadband_somewhere'),ok:()=>Object.keys(S.pops).some(c=>S.pops[c].bb&&['AS','AF','OC','SA'].includes(CITY[c].reg))},
 forms:{l:tr('banks.fill_in_form_t_17b_in'),ok:()=>true},
 hodl:{l:tr('banks.never_sell_your_tubecoin_diamond'),ok:()=>true},
 oddpops:{l:tr('banks.always_run_an_odd_number_of'),ok:()=>Object.keys(S.pops).length%2===1},
 nobude:{l:tr('banks.never_build_in_bude_the_loan'),ok:()=>!S.pops.bde},
 nogen:{l:tr('banks.no_diesel_generators_anywhere_our'),ok:()=>!Object.values(S.pops).some(p=>p.gen)},
 friday:{l:tr('banks.no_new_links_on_a_friday'),ok:l=>!S.links.some(x=>(x.day||0)>=l.start&&(x.day||0)%7===4)},
 nocache:{l:tr('banks.no_goggle_cache_boxes_our_chairman'),ok:()=>!S.caches.some(c=>c.net==='ggl')},
 reach99:{l:tr('banks.reach_99_of_the_internet_at'),ok:()=>(R.reach||0)>=0.99},
 tier3:{l:tr('banks.stay_tier_3_number_go_up'),ok:()=>tierLabel()==='Tier 3'},
 nephew:{l:tr('banks.give_our_ceo_s_nephew_a'),fee:3000,ok:()=>true},
 yacht:{l:tr('banks.our_chairman_needs_a_yacht_for'),fee:8000,ok:()=>true},
 pizza:{l:tr('banks.pizza_for_the_whole_noc_after'),each:400,ok:()=>true},
 // The Ex-Im Pie Bank's space covenants: their numbers live on the loan (l.pie).
 pielaunch:{l:l=>l&&l.pie?tr('banks.exim_launch_n_pies_by',{n:l.pie.n,d:dateStr(l.pie.by),f:Math.min(l.pie.flown,l.pie.n)}):tr('banks.exim_launch_pies'),ok:l=>pieEximLaunchOk(l)},
 piedish:{l:l=>tr('banks.exim_keep_a_dish_in',{a:l&&l.pie?pieLicCountry(l.pie.cc):'?'}),ok:l=>pieEximDishOk(l)},
 blitz:{l:tr('banks.open_a_new_pop_at_least'),ok:l=>S.day-Math.max(l.start,...Object.values(S.pops).map(p=>p.day||0))<=90},
};
// Conditions read with their price filled in; some cost money every month, one costs money per incident.
const covLabel=(c,l)=>{const C=COVS[c];return !C?c:typeof C.l==='function'?C.l(l):C.l.replace('{price}',fmt$(C.fee||C.each||0));};
const loanFees=l=>(l.covs||[]).reduce((a,c)=>a+((COVS[c]&&COVS[c].fee)||0),0);
// Good terms are for good credit: every notch below AAA adds to the rate.
const RATE_PREM={AAA:0,AA:.005,A:.01,BBB:.02,BB:.04,B:.07,CCC:.12,C:.2};
// A loan worth more than this many months of revenue also wants a slice of revenue until it is repaid.
const BIG_LOAN=5;
const STAR_SIGNS=[N_('common.mercury'),N_('common.saturn'),N_('common.venus'),N_('banks.your_rising_sign'),N_('common.the_moon'),N_('banks.pluto_which_is_not_even_a')];
function niceAmt(v){const m=Math.pow(10,Math.floor(Math.log10(Math.max(1,v)))-1);return Math.max(50000,Math.round(v/m)*m);}
function rating(){if(!S)return 'BB';const rev=R.revMo||0,pay=(R.cost&&R.cost.loans)||0;let sc=2;
  if(rev>100000)sc++;if(rev>500000)sc++;if(rev>2000000)sc++;if(R.revMo>R.costMo)sc++;else sc--;if(rev&&(R.revMo-R.costMo)/rev>=0.25)sc++;
  if(S.cash<0)sc-=2;if(rev&&pay/rev>0.3)sc--;if(rev&&pay/rev>0.6)sc--;sc-=Math.min(3,S.loanStrikes||0);
  return RATINGS[clamp(sc,0,RATINGS.length-1)];}
const rIdx=r=>RATINGS.indexOf(r);
function annuity(P,apr,n){const r=apr/12;return r?P*r/(1-Math.pow(1+r,-n)):P/n;}
function spawnLoanOffer(emergency){
  const rt=rating(),keys=Object.keys(BANKS).filter(k=>rIdx(rt)>=rIdx(BANKS[k].min)&&!S.loanOffers.some(o=>o.bank===k)&&!(BANKS[k].equity&&S.loans.some(l=>l.bank===k))&&!BANKS[k].pie);
  let pool=emergency?keys.filter(k=>['shark','gov','crypto','vult','rev','spk','astro','balloon'].includes(k)):keys.filter(k=>k!=='shark');if(!pool.length)pool=keys;if(!pool.length)return;
  const k=pick(pool),B=BANKS[k],base=Math.max(60000,R.revMo||0),ra=(a)=>a[0]+Math.random()*(a[1]-a[0]);
  const amount=niceAmt(base*ra(B.amt)*(emergency?0.6:1)),o={id:uid(),bank:k,amount,exp:S.day+(emergency?10:25),covs:B.covs.slice()};
  if(B.equity){o.share=+ra(B.share).toFixed(3);}
  else if(B.model==='transit'){o.model='transit';o.cut=0.3;o.term=Math.round(ra(B.term)/6)*6||6;o.owe=Math.round(amount*1.3);o.apr=0;o.pay=0;}
  else{o.apr=+(ra(B.apr)+(RATE_PREM[rt]||0)).toFixed(3);o.term=Math.round(ra(B.term)/6)*6||6;o.pay=B.model==='balloon'?0:Math.round(annuity(amount,o.apr,o.term));if(B.model)o.model=B.model;}
  if(!B.equity&&amount>BIG_LOAN*base)o.share=+Math.min(0.08,0.02+0.01*(amount/base-BIG_LOAN)).toFixed(3);
  S.loanOffers.push(o);
  toast(tr('banks.bank_would_like_to_lend_you',{bank:esc(B.name),amount:fmt$(amount)})+'<br>'+(emergency?tr('banks.they_heard_you_might_be_in'):tr('banks.terms_apply_several_terms')),emergency?'bad':'goal',[{l:tr('common.open_bank'),act:'bank',args:{}}]);
}
/* Good credit can pick up the phone (#251), from AA up. The rate and the limit follow from the rating alone, so calling again
   gets nothing better and rolls no dice. Bankers being bankers, weird conditions apply: this week's quirk (CALL_ODD, turning
   over every 7 days) comes on top of the usual ones. What you owe already uses up the limit, and the limit replaces the
   revenue share of a BIG_LOAN. */
const CALL_AMTS=[1e5,5e5,1e6,5e6,1e7],CALL_MONTHS=36;
const CALL_TERMS={AA:{bank:'gs',apr:.075,x:6,covs:['golf','continents2'],odd:2},AAA:{bank:'gs',apr:.06,x:8,covs:['golf'],odd:1}};
const CALL_ODD=['yacht','oddpops','friday','nephew','nobude','kehrwoche','forms','app'];
const callOdd=T=>{const w=Math.floor(S.day/7)*3;return Array.from({length:T.odd},(_,i)=>CALL_ODD[(w+i)%CALL_ODD.length]);};
const loanDebt=()=>S.loans.reduce((a,l)=>a+(BANKS[l.bank].equity?0:l.bal),0);
const callLimit=T=>Math.max(0,(R.revMo||0)*T.x-loanDebt());
// The new offer replaces an earlier called one; offers that came by themselves stay.
function callOffer(amount){const T=CALL_TERMS[rating()];if(!T||!CALL_AMTS.includes(amount)||S.cash>=RICH_NO_LOANS||amount>callLimit(T))return null;
  const o={id:uid(),bank:T.bank,amount,exp:S.day+25,covs:T.covs.concat(callOdd(T)),apr:T.apr,term:CALL_MONTHS,pay:Math.round(annuity(amount,T.apr,CALL_MONTHS)),call:1};
  S.loanOffers=S.loanOffers.filter(x=>!x.call);S.loanOffers.push(o);return o;}
// Best Effort has no game over: deep in the red, the Ministry of Tubes lends what it takes to be back in the black,
// cheap, over five years, no conditions. The repayments are still yours.
const RESCUE_APR=0.02,RESCUE_TERM=60;
function rescueLoan(){const amount=niceAmt(Math.max(250000,-S.cash+Math.max(150000,(R.costMo||0)*2)));
  S.cash+=amount;S.stats.rescues=(S.stats.rescues||0)+1;S.neg=0;
  S.loans.push({id:uid(),bank:'gov',start:S.day,amount,got:amount,bal:amount,apr:RESCUE_APR,apr0:RESCUE_APR,pay:Math.round(annuity(amount,RESCUE_APR,RESCUE_TERM)),left:RESCUE_TERM,term:RESCUE_TERM,share:0,covs:[],base:{sub:S.links.filter(x=>x.sub).length}});
  track('rescue');toast(`<b>${tr('banks.bank_stepped_in',{bank:esc(BANKS.gov.name)})}</b><br>${tr('banks.a_rescue_loan_of_amount_keeps',{amount:fmt$(amount),pay:fmt$(Math.round(annuity(amount,RESCUE_APR,RESCUE_TERM)))})}`,'bad',[{l:tr('common.open_bank'),act:'bank',args:{}}]);sfx('coin');}
function loanTick(d){
  // conditions: 15-day grace, then a penalty every 30 days while broken
  for(const l of S.loans){const B=BANKS[l.bank];
    const broken=l.covs.filter(c=>COVS[c]&&!COVS[c].ok(l));
    if(d-l.start<15||!broken.length){l.breach=0;continue;}
    l.breach=(l.breach||0)+1;
    if(l.breach===1)toast(tr('banks.bank_is_unhappy_you_broke_a',{bank:esc(B.name),cond:esc(covLabel(broken[0],l))}),'bad',[{l:tr('common.open_bank'),act:'bank',args:{}}]);
    if(l.breach===10||(l.breach>10&&(l.breach-10)%30===0)){
      if(B.equity){l.share=+(l.share+0.02).toFixed(3);toast(tr('banks.bank_are_circling_they_now_take',{bank:esc(B.name),pct:pct(l.share)}),'bad');}
      else{const fee=Math.round(l.bal*0.05);l.bal+=fee;l.pay=Math.round(annuity(l.bal,l.apr,Math.max(1,l.left)));S.loanStrikes=(S.loanStrikes||0)+1;toast(tr('banks.penalty_from_bank_fee_added_to',{bank:esc(B.name),fee:fmt$(fee),pay:fmt$(l.pay)}),'bad');if(B.pie)pieEximBreach(l,broken);}
      sfx('err');}}
  // monthly statement: payments already leave your cash daily as part of costs
  for(const l of S.loans.slice()){const B0=BANKS[l.bank];if(B0.equity||!monthiversary(l.start,d))continue;
    if(l.model==='transit')l.bal=Math.max(0,l.bal-Math.round(((R.cost&&R.cost.transit)||0)*(l.cut||0.3)));else l.bal=Math.max(0,l.bal*(1+l.apr/12)-l.pay);l.left--;
    // A balloon, or what a transit-free network never paid, is due in one go at the end.
    if(l.left<=0&&l.bal>=1&&(l.model==='balloon'||l.model==='transit')){S.cash-=Math.round(l.bal);toast(tr('banks.bank_the_balloon_popped_the',{bank:esc(B0.name),price:fmt$(l.bal)}),'bad');sfx('err');l.bal=0;}
    if(l.left>0&&l.bal>=1){if(l.model==='storm'){l.apr=+((l.apr0||0)+0.02*S.inc.length).toFixed(3);l.pay=Math.round(annuity(l.bal,l.apr,l.left));}
      else if(l.model==='astro'){const a=+(0.02+Math.random()*0.28).toFixed(3);if(Math.abs(a-l.apr)>=0.08)toast(tr('banks.bank_sign_is_in_retrograde_your',{bank:esc(B0.name),sign:tr(pick(STAR_SIGNS)),apr:(a*100).toFixed(1)}),a>l.apr?'bad':'good');l.apr=a;l.pay=Math.round(annuity(l.bal,l.apr,l.left));}}
    if(l.left<=0||l.bal<1){S.loans=S.loans.filter(x=>x!==l);track('loan_repaid');toast(tr('banks.loan_from_bank_paid_off_they',{bank:esc(BANKS[l.bank].name)}),'good');sfx('coin');}}
  // the shark's collectors come by when you are broke
  if(S.cash<0&&S.loans.some(l=>BANKS[l.bank].shark)&&Math.random()<0.03){const c=pick(Object.keys(S.pops));const p=S.pops[c];p.down=Math.max(p.down||0,d+1);const en=N_('banks.two_very_large_gentlemen_from_loan');addInc({type:'shutdown',ref:c,until:d+1,msg:tr(en,{city:CITY[c].name}),cost:0},en);toast(tr('banks.the_loan_shark_sent_a_reminder',{city:CITY[c].name}),'bad');sfx('alert');}
  // offers: now and then, and much more often when you are in trouble
  S.loanOffers=S.loanOffers.filter(o=>o.exp>d);
  const broke=S.cash<0;
  // With half a billion in the vault, loan offers are just noise (#52): banks stop calling, open offers lapse.
  if(S.cash>=RICH_NO_LOANS){if(S.loanOffers.length||!S.richTold){S.loanOffers=[];if(!S.richTold&&S.mode!=='sandbox'){S.richTold=1;toast(tr('banks.the_banks_have_stopped_calling_you',{cash:fmt$(RICH_NO_LOANS)}),'good');}}return;}
  if(S.loanOffers.length<4&&(broke?Math.random()<0.25:(d>20&&Math.random()<1/40)))spawnLoanOffer(broke);
}
const RICH_NO_LOANS=5e8;
