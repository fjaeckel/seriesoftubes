/* DE-KICKS Group: runs several big exchanges and really, really hates open pricing.
   No price list, personalised quotes, haggling, yearly "harmonisation", auto-enrolled add-ons
   you have to opt out of, and a retention offer when you try to leave. */
const DK_CITIES=['fra','mad','mrs','dxb','bom','nyc'];
const isDk=c=>(DK_CITIES.includes(c)||scnRule('dkAll'))&&!!CITY[c]&&!!CITY[c].ix&&!S.myIx[c];
const DK_ADDONS=[['Blackholing Plus™',tr('de_kicks.like_blackholing_but_with_a_plus')],['Route Server Gold',tr('de_kicks.the_same_route_server_in_a')],['Premium Port LEDs',tr('de_kicks.your_port_light_now_blinks_in')],['Strategic Peering Insights',tr('de_kicks.a_monthly_pdf_of_your_own')],['GlobePeer Ready™',tr('de_kicks.makes_your_port_ready_for_a')],['Cloud Exchange Readiness Fee',tr('de_kicks.a_fee_for_being_ready_for')],['Account Manager Lunch Fund',tr('de_kicks.your_account_manager_is_hungry')]];
const DK_STALL=[tr('de_kicks.your_account_manager_would_love_to'),tr('de_kicks.pricing_is_reviewed_by_the_global'),tr('de_kicks.they_sent_a_14_page_nda'),tr('de_kicks.your_account_manager_is_at_a')];
// Harmonisation and ended promos raise the personal price, but only up to this multiple of the list price: uncapped, 8-15% a
// year turned a 60-year game into $100k ports. Saves are clamped in sanitize(), remembered quotes too.
const DK_MAX=4;
function dkMult(c){if(!S||!isDk(c)||!S.dk||!S.dk.m[c])return 1;const ret=S.dk.ret[c];return Math.min(S.dk.m[c],DK_MAX)*(ret&&ret>S.day?0.6:1);}
// The rise that actually happened (1 at the ceiling), so a toast never announces more than the bill shows.
function dkRaise(c,f){const dk=S.dk,was=Math.min(dk.m[c],DK_MAX);dk.m[c]=Math.min(DK_MAX,+(dk.m[c]*f).toFixed(3));return dk.m[c]/was;}
function dkAddonMo(c){return S.dk&&S.dk.add[c]?S.dk.add[c].reduce((a,x)=>a+x.mo,0):0;}
function dkState(){S.dk=S.dk||{m:{},add:{},ret:{},retUsed:{},stall:0,q:null};return S.dk;}
function dkQuoteMult(){const pops=Object.keys(S.pops).length,big=Math.min(1.2,pops*0.04+(R.served||0)/20000);return +(0.95+Math.random()*0.45+big).toFixed(2);}
function dkQuoteModal(){const q=S.dk.q,c=q.city,mo=Math.round(PORT[q.tier].ix*(S.pops[c]?1:REMOTE_FEE)*q.m*ixMul(c));
  openModal(`<div class="eyebrow">${tr('de_kicks.de_kicks_group_sales')}</div><h2 style="font-size:26px">${tr('de_kicks.your_personalised_port_quote_for_ix',{port:PORT[q.tier].n,ix:esc(ixName(c))})}</h2>
  <p class="tagline">${tr('de_kicks.thanks_for_your_interest_we_don')}</p>
  <div class="kv"><span>${tr('de_kicks.monthly_price_just_for_you')}</span><b>${tr('common.price_mo',{price:fmt$(mo)})}</b></div>
  <div class="kv"><span>${tr('common.list_price')}</span><b>${tr('common.confidential')}</b></div>
  <div class="kv"><span>${tr('de_kicks.what_others_pay')}</span><b>${tr('de_kicks.covered_by_nda')}</b></div>
  <p class="note">${tr('de_kicks.quotes_go_up_with_how_big')} ${q.h>=3?tr('de_kicks.your_account_manager_has_stopped'):tr('de_kicks.haggles_left_n',{n:3-q.h})}</p>
  <div class="btns">${btn(tr('de_kicks.sign_price_mo',{price:fmt$(mo)}),'dkAccept',{},'pink',S.cash<mo)}${btn(tr('common.haggle'),'dkHaggle',{},'',q.h>=3)}${btn(tr('common.walk_away'),'dkWalk',{},'ghost')}</div>`);}
function dkTick(d){if(!S.dk)return;const dk=S.dk;
  for(const c in S.ixp){if(!isDk(c))continue;
    if(dk.ret[c]&&dk.ret[c]===d){dkRaise(c,1.1);toast(tr('de_kicks.your_ix_promo_ended_price_is',{ix:esc(ixName(c))}),'bad');}
    if(dk.m[c]&&(d+hstr(c)%90)%365===0){const r=dkRaise(c,1.08+Math.random()*0.07),p=Math.round((r-1)*100);if(p>0)toast(tr('de_kicks.de_kicks_has_harmonised_its_prices',{ix:esc(ixName(c)),p}),'bad');}
    const add=dk.add[c]=dk.add[c]||[];
    if(add.length<3&&Math.random()<1/150){const a=DK_ADDONS.filter(x=>!add.some(y=>y.n===x[0]));if(a.length){const [n,blurb]=pick(a),mo=Math.round((300+Math.random()*1200)/50)*50;add.push({n,blurb,mo,day:d});
      toast(tr('de_kicks.good_news_you_ve_been_enrolled',{addon:esc(n),blurb:esc(blurb),price:fmt$(mo),ix:esc(ixName(c))}),'bad');}}}
}

function elephant(){S.phpDone=true;S.ev.php=S.day+4;
  toast(tr('de_kicks.breaking_cve_2026_31337_just_took'),'bad');sfx('alert');renderMega();}
