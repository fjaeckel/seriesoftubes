/* ---------- capacity deals and sponsored conferences (#168) ---------- */
// A capacity conference ends with carriers asking for bulk: waves, subsea capacity or whole fiber pairs on a route.
// You sign first and build afterwards, like a real pre-sale: it pays nothing until it is delivered, and missing
// the date costs a penalty and the deal.
Object.assign(BIZ_T,{
 capw:{l:tr('capacity_deals.wholesale_waves'),opts:[8,16,32],rate:0,l2:true,cap:true,km:0.45,lv:CAP_LV,names:['Lambda Llama Carriers','Wavelength Wholesalers','Big Pipe Partners','Rainbow Lambda Ltd','Tera Firma Networks']},
 capsub:{l:tr('capacity_deals.subsea_capacity'),opts:[1600,3200,6400],rate:0,l2:true,cap:true,km:0.35,lv:CAP_LV,names:['Seven Seas Capacity Co.','Petabyte Pirates','Deep Blue Bandwidth','Cable Guy Consortium','Kraken Transit Holdings']},
 capfib:{l:tr('capacity_deals.fiber_pairs'),opts:[2,4,8],rate:0,fiber:true,cap:true,lv:CAP_LV,names:['Glass Half Full Fiber','Hyperscale Hydra','A Hyperscaler Who Shall Not Be Named','Strand Theft Auto','Pair-a-Dice Networks']},
});
// The routes each capacity conference talks about. PTC is a Pacific crowd; Capacity Europe is the Atlantic and Europe.
const CAP_ROUTES={
 hnl:[['syd','lax','capsub'],['tok','sea','capsub'],['hnl','lax','capsub'],['sin','hkg','capsub'],['syd','per','capw'],['dal','ash','capw'],['syd','akl','capfib'],['lax','sea','capfib']],
 lon:[['bde','nyc','capsub'],['lis','for','capsub'],['mrs','sin','capsub'],['lon','fra','capw'],['chi','ash','capw'],['fra','ams','capw'],['chi','ash','capfib'],['mad','mrs','capfib']],
};
const SP_OFFERS=1.8,SP_REGION=0.6,CAP_PEN=2;
const confSpOn=()=>!!(S.conf&&S.conf.sp&&S.conf.until>S.day);
// While a sponsored glow lasts, most new customers come from that region.
function spMine(mine){if(!confSpOn()||Math.random()>=SP_REGION)return mine;const r=mine.filter(c=>CITY[c].reg===S.conf.reg);return r.length?r:mine;}
const capPend=b=>!!(BIZ_T[b.type]&&BIZ_T[b.type].cap&&b.due!==undefined&&!b.live);
const capN=b=>b.type==='capw'?Math.round(b.bw/400):b.type==='capfib'?(b.slots||1):0;
function capWhat(o){return o.type==='capw'?trn('capacity_deals.n_400g_waves',capN(o)):o.type==='capfib'?trn('capacity_deals.n_fiber_pairs',capN(o)):tr('capacity_deals.bw_of_subsea_capacity',{bw:fmtG(o.bw)});}
function capTerms(o){const price=fmt$(bizMo(o)),what=capWhat(o);
  if(o.due===undefined)return tr('capacity_deals.what_price_mo_deliver_within_n',{what,price,n:o.win});
  return o.live?tr('capacity_deals.what_price_mo',{what,price}):tr('capacity_deals.what_price_mo_due_date',{what,price,date:dateStr(o.due)});}
function capOffer(a,b,t,nm){const T=BIZ_T[t],km=kmBetween(a,b),n=pick(T.opts),o={id:uid(),city:a,city2:b,name:nm(),type:t,reqs:[],exp:S.day+30};
  if(t==='capfib'){o.bw=1;o.slots=n;o.rate=Math.round(dfLeaseMo(km)*n*1.5);o.win=dfBuildDays(km)+150;}
  else{o.bw=t==='capw'?n*400:n;o.rate=Math.round((150+km*0.08)*T.km);o.win=t==='capsub'?300+Math.floor(Math.random()*121):180+Math.floor(Math.random()*91);}
  return o;}
function capDealTick(d){const q=S.capDeal;if(!q||q.at!==d)return;S.capDeal=null;seatConf(q.c);const pool=(CAP_ROUTES[q.c]||[]).filter(r=>isCity(r[0])&&isCity(r[1])).slice(),out=[];
  while(out.length<3&&pool.length){const [a,b,t]=pool.splice(Math.floor(Math.random()*pool.length),1)[0],T=BIZ_T[t];
    const nm=()=>{const list=T.names.filter(n=>!S.usedNames.includes(n)),n=list.length?pick(list):pick(T.names);useName(n);return n;};out.push(capOffer(a,b,t,nm));}
  if(!out.length)return;S.offers.push(...out);
  toast(trn('capacity_deals.n_carriers_from_the_conference',out.length),'goal',[{l:tr('common.show_me'),act:'leftTab',args:{t:'deals'}}]);sfx('coin');}
// A signed deal waits for its route. Fiber pairs need a fiber of your own between the two cities.
function capFibLink(b){return S.links.find(l=>l.kind==='df'&&l.own&&l.ready<=S.day&&!(l.cut>S.day)&&((l.a===b.city&&l.b===b.city2)||(l.a===b.city2&&l.b===b.city))&&!S.biz.some(x=>x!==b&&(x.type==='pairs'||x.type==='capfib'||x.type==='dfpair')&&x.link===l.id));}
function capPendTick(b,d){if(!capPend(b))return false;
  if(b.type==='capfib'){const l=capFibLink(b);if(l)b.link=l.id;}
  if(bizSf(b)>=0.95&&reqOk(b)){b.live=true;b.since=d;b.mood=100;S.stats.capDone=(S.stats.capDone||0)+1;
    toast(tr('capacity_deals.delivered_name_now_pays_price_mo',{name:esc(b.name),price:fmt$(bizMo(b))}),'goal');sfx('coin');return true;}
  if(b.type==='capfib'&&b.link&&!capFibLink(b))b.link=undefined;
  if(d>=b.due){const pen=Math.round(bizMo(b)*CAP_PEN);S.cash-=pen;S.biz=S.biz.filter(x=>x!==b);
    toast(tr('capacity_deals.name_walked_away_you_missed_the',{name:esc(b.name),pen:fmt$(pen)}),'bad');sfx('err');return true;}
  if(b.due-d===30)toast(tr('capacity_deals.name_is_due_in_30_days',{name:esc(b.name),what:capWhat(b),a:CITY[b.city].name,b:CITY[b.city2].name}),'bad',[{l:tr('common.show_me'),act:'custGo',args:{id:b.id}}]);
  return true;}
// What a pending deal still needs, for the customer list.
function capWhy(b){if(!capPend(b))return [];const left=b.due-S.day;
  if(b.type==='capfib')return [tr('capacity_deals.build_your_own_fiber_a_b',{a:CITY[b.city].name,b:CITY[b.city2].name,n:left})];
  return [tr('capacity_deals.carrying_p_of_it_n_days',{p:pct(bizSf(b)),n:left})];}
