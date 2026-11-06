/* ---------- The sales desk answers renewal haggles ----------
   A customer near the end of its term may ask for a discount (#178, 75-customer-lifecycle.js). With S.slAuto.ren on,
   whoever runs sales answers it SL_REN_WAIT days after it opens, so the player can still answer first. Each in their way:
   - the engineer talks technology, not price: nerdy customers get an afternoon with the network diagrams and renew at
     the market price, now and then halfway; everyone else gets the discount they asked for. Nobody leaves.
   - the shark gives nothing away: most renew at the old price, often with a fresh promise, and he bills a month of what
     he saved you. Some walk, nerdy ones most of all.
   - the CEO settles it on the golf course: a deeper discount than asked for a contract twice as long, a quick yes, or
     a fight that ends with the customer gone.
   Each answer is a hash of the contract (clR), so no random numbers are drawn. */
const SL_REN_WAIT=3;
const slRenOn=()=>!!(S&&S.slAuto&&S.slAuto.ren&&slP());
// The day the desk answers this haggle: a few days after it opened (30 days before the term ends), today at the earliest.
const slRenAt=b=>b.hag.until-30+SL_REN_WAIT;
// A step of the day (dayPost()): its yield is the routing after a price changed. slRenDay() is the same all at once.
function slRenDay(d){runNow(slRenRun(d));}
function* slRenRun(d){if(!slRenOn())return;const p=slP();let any=false;
  for(const b of S.biz.slice())if(b.hag&&d>=slRenAt(b)&&d<b.hag.until){slRenOne(b,p);any=true;}
  if(any)yield;}
// One haggle: returns what happened (for the tests): 'tech', 'mid', 'cave', 'hold', 'walk', 'golf', 'yes', 'fight'.
function slRenOne(b,p){const ask=b.hag.rate,was=b.rate,mid=clMid(b),nerd=SALES_NERDS.includes(b.type),r=clR(b,'sl|'+p);
  const v=x=>({name:esc(slCap()),cust:esc(b.name),...x}),bill=rate=>fmt$(clBill(b,rate));
  const keep=(rate,how,key,x,s)=>{clRenew(b,rate);clNote('ren');toast(tr(key,v({price:bill(b.rate),...x})),s===undefined?'good':s,[{l:tr('common.show_me'),act:'custGo',args:{id:b.id}}]);return how;};
  const gone=(how,key)=>{clGone(b,'cheap');toast(tr(key,v({})),'bad');sfx('err');return how;};
  if(p==='eng'){if(!nerd)return keep(ask,'cave',N_('sales.ren_eng_cave'));
    return r<0.7?keep(Math.max(ask,Math.min(was,clFair(b))),'tech',N_('sales.ren_eng_tech')):keep(mid,'mid',N_('sales.ren_mid'));}
  if(p==='shark'){const walk=nerd?0.4:0.12;if(r<walk)return gone('walk',N_('sales.ren_shark_walk'));
    if(r<walk+0.5){const fee=Math.round(clBill(b,was-ask)),k=clR(b,'slp')<0.5?salesPromise(b):null;
      if(k)b.reqs=(b.reqs||[]).concat(k);S.cash-=fee;
      const req=k?' '+tr('sales.ceo_promised',{req:esc(typeof REQS[k].l==='function'?REQS[k].l(b):REQS[k].l)}):'';
      clRenew(b,was);clNote('ren');toast(tr('sales.ren_shark_hold',v({price:bill(b.rate),fee:fmt$(fee)}))+req,'',[{l:tr('common.show_me'),act:'custGo',args:{id:b.id}}]);return 'hold';}
    return keep(mid,'mid',N_('sales.ren_mid'));}
  if(r<0.25)return gone('fight',N_('sales.ren_ceo_fight'));
  if(r<0.6){clRenew(b,Math.round(ask*0.9));b.te=clTerm(b,b.te);clNote('ren');
    toast(tr('sales.ren_ceo_golf',v({price:bill(b.rate),date:dateStr(b.te)})),'',[{l:tr('common.show_me'),act:'custGo',args:{id:b.id}}]);return 'golf';}
  return keep(ask,'yes',N_('sales.ren_ceo_yes'),{},'');}
// Under a haggle in Deals: when the desk will answer it.
const slRenRow=b=>slRenOn()&&b.hag.until>S.day?`<div class="meta">${tr('sales.ren_when',{name:esc(slCap()),date:dateStr(Math.max(S.day+1,slRenAt(b)))})}</div>`:'';
