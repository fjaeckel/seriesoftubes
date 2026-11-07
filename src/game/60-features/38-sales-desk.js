/* ---------- The sales desk: one salesperson, three kinds you meet in this industry ----------
   Next to the NOC intern, you can put one person in charge of sales. Each brings deals in their own way and leaves
   their mark on the customers they sign (b.by), which the contracts (75-customer-lifecycle.js) remember at renewal.
   - The engineer turned salesdroid goes to every network operators' meeting (you pay the ticket), brings plenty of
     small and mid deals and never the huge ones, and only sells what the network can do: their customers stay longer,
     the nerdy ones most of all. They haggle badly.
   - The shark brings the biggest deals at a higher price and takes a commission, but oversells: many come with a
     promise your network does not keep yet. Ignores the nerds: no technical customers, no meetings, and peering desks
     want more traffic from you. Wins most haggles.
   - The CEO runs sales himself, for free: now and then a huge deal signed on the golf course at a discount, with a
     promise nobody checked, the odd declined offer signed anyway, and opinions. He cannot be fired; the board can
     be asked for a VP of Sales instead.
   Every roll is a hash of the day and the deal, so a game without a salesperson keeps its random stream. */
const SALES={
  eng:{i:'🤓',n:N_('sales.eng_n'),s:N_('sales.eng_s'),d:N_('sales.eng_d'),mo:9000},
  shark:{i:'🦈',n:N_('sales.shark_n'),s:N_('sales.shark_s'),d:N_('sales.shark_d'),mo:15000},
  ceo:{i:'👔',n:N_('sales.ceo_n'),s:N_('sales.ceo_s'),d:N_('sales.ceo_d'),mo:0},
};
const SALES_LV=2,SALES_VP=50000,SALES_VP_DAYS=30;
// The ones the engineer never lands, and the nerds the shark never calls back.
const salesBig=t=>{const T=BIZ_T[t];return !!T&&(!!T.mega||(T.lv||1)>=4);};
const SALES_NERDS=['hft','edu','isp','l2vpn','bulk','provedor','fabl2','wwave','mwave','dfpair'];
const SALES_SAY=[N_('sales.ceo_say_synergy'),N_('sales.ceo_say_golf'),N_('sales.ceo_say_blockchain'),N_('sales.ceo_say_napkin'),N_('sales.ceo_say_mbps'),N_('sales.ceo_say_airport')];
const slP=()=>S&&S.sales&&own(SALES,S.sales.p)?S.sales.p:null;
const slName=(long)=>{const p=slP();return p?tr(long?SALES[p].n:SALES[p].s):'';};
// The short name at the start of a sentence: Dave, Chad, The CEO.
const slCap=()=>{const t=slName();return t?t[0].toUpperCase()+t.slice(1):'';};
const slR=q=>(hstr(((S&&S.asn)||0)+'|sales|'+q)%100000)/100000;
// What a deal is, not its id: ids come from the clock, so a roll on them would differ every time the same game is played.
const slKey=o=>[o.type,o.city,o.city2||'',o.name,o.bw,o.exp].join('|');
const salesMo=()=>{const p=slP();return p?SALES[p].mo:0;};
const salesCanHire=()=>lvl()>=SALES_LV;
// How often offers come in: the engineer brings more, half as many again while a meeting's glow lasts.
function salesSpawn(){const p=slP();if(p==='eng')return 1.4*(S.conf&&S.conf.until>S.day?1.5:1);if(p==='shark')return 1.2;return 1;}
// What the salesperson does to the offers that just came in (from index n0): who brought them, which they drop,
// and how the shark dresses them up.
function salesShape(n0){const p=slP();if(!p)return;for(let i=S.offers.length-1;i>=n0;i--){const o=S.offers[i],T=BIZ_T[o.type];if(!T||o.ref)continue;
  if(p==='eng'&&salesBig(o.type)){S.offers.splice(i,1);continue;}
  if(p==='shark'&&SALES_NERDS.includes(o.type)){S.offers.splice(i,1);continue;}
  o.by=p;
  if(p==='shark'&&!T.event&&!T.cap){const up=(T.opts||[]).find(x=>x>o.bw);if(up&&!T.fiber)o.bw=up;o.rate=Math.round(o.rate*1.25);
    if(slR('over|'+slKey(o))<0.5){const k=salesPromise(o);if(k)o.reqs=(o.reqs||[]).concat(k);}}}}
// A promise nobody checked: a requirement this deal can have, that the network does not meet today.
function salesPromise(o){const T=BIZ_T[o.type],pool=Object.keys(REQS).filter(k=>!(o.reqs||[]).includes(k)&&!REQS[k].only&&(!REQS[k].l2||T.l2)&&(!REQS[k].ip||!T.l2)&&reqCan(k,o)).sort();
  const no=pool.filter(k=>{try{return !REQS[k].ok(o);}catch(e){return false;}});return no.length?no[Math.floor(slR('promise|'+slKey(o))*no.length)]:null;}
// Their mark at renewal: how much likelier the customers they signed are to leave. The engineer's orbit customers, sold
// only where a dish had room to spare, stay like the nerds do.
function salesLeaveMul(b){if(b.by==='eng')return SALES_NERDS.includes(b.type)||BIZ_T[b.type].orbit?0.5:0.75;if(b.by==='shark')return 1.5;if(b.by==='ceo')return 1.25;return 1;}
// Haggles with whoever is at the desk now: how deep the discount they ask, and how often meeting halfway works.
const salesAsk=()=>slP()==='eng'?0.72:0.8;
const salesMeet=()=>({shark:0.9,eng:0.5,ceo:0.55})[slP()]||0.65;
// Peering desks notice who you send to meetings: with the shark, selective networks want a quarter more traffic.
const salesPeerMul=()=>slP()==='shark'?1.25:1;

/* A day at the sales desk: the engineer books the next meeting (30 days ahead, the same day the invitation comes),
   the CEO plays golf and has opinions, and a VP of Sales takes over from him when the board says so. */
function salesDay(d){const L=S.sales;if(!L)return;
  if(L.vp&&d>=L.vp){L.p=null;L.vp=null;toast(tr('sales.vp_arrived'),'good',[{l:tr('sales.desk'),act:'salesOpen',args:{}}]);return;}
  const p=slP();if(!p)return;
  if(p==='eng')for(const cf of upcomingConfs(30)){if(cf.cap||cf.day-d!==30||(S.confReg||{})[cf.key])continue;
    if(S.cash>=CONF_COST){S.cash-=CONF_COST;(S.confReg=S.confReg||{})[cf.key]=true;toast(tr('sales.eng_booked',{name:esc(slCap()),conf:esc(cf.n),city:esc(CITY[cf.c].name),cost:fmt$(CONF_COST)}),'');}}
  if(p==='ceo'){if(!(L.golf>=d))L.golf=d+50+Math.floor(slR('golf|'+d)*30);else if(d===L.golf){salesGolf(d);L.golf=d+50+Math.floor(slR('golf|'+d)*30);}
    if(!(L.say>=d))L.say=d+20+Math.floor(slR('say|'+d)*15);else if(d===L.say){toast(tr('sales.ceo_says',{say:tr(SALES_SAY[Math.floor(slR('sayl|'+d)*SALES_SAY.length)])}),'');L.say=d+20+Math.floor(slR('say|'+d)*15);}}}
// The golf course: the biggest internet customer this network can take, in its biggest city, at 30% off, signed on the spot.
// With a rocket company, every other game is with the Founder, and in orbit (pieGolf, 99-pie-sales.js).
const SALES_GOLF=['metav','cgame','gpu','stream','isp','edu','host','dia'];
function salesGolf(d){if(pieGolf(d))return;const mine=Object.keys(S.pops).filter(c=>popUp(c)&&bizCity(c));if(!mine.length)return;
  const t=SALES_GOLF.find(x=>(BIZ_T[x].lv||1)<=lvl());if(!t)return;const T=BIZ_T[t],city=mine.sort((a,b)=>CITY[b].P-CITY[a].P||(a<b?-1:1))[0];
  const list=(T.names||BIZ_N).filter(n=>!S.usedNames.includes(n));const name=list.length?list[Math.floor(slR('golfn|'+d)*list.length)]:(T.names||BIZ_N)[0];useName(name);
  const o={id:uid(),city,city2:null,name,type:t,bw:T.opts[T.opts.length-1],rate:Math.round((CITY[city].au?T.rate*AU_ARPU:T.rate)*mkt()*0.7),reqs:[],exp:d+40};
  const k=salesPromise(o);if(k)o.reqs.push(k);const b=offerCustomer(o);b.by='ceo';b.mk=mkt();S.biz.push(clSign(b));
  toast(tr('sales.ceo_golf',{name:esc(name),city:esc(CITY[city].name),bw:fmtG(o.bw),price:fmt$(o.bw*o.rate)})+(k?' '+tr('sales.ceo_promised',{req:esc(typeof REQS[k].l==='function'?REQS[k].l(o):REQS[k].l)}):''),'goal',[{l:tr('common.show_me'),act:'custGo',args:{id:b.id}}]);sfx('coin');}
// Declining an offer the CEO likes: about one in three, he already shook hands on it.
function salesOverride(o){if(slP()!=='ceo'||!o||!bHas(o)||BIZ_T[o.type].event||slR('veto|'+slKey(o))>=0.33)return false;
  const b=offerCustomer(o);if(o.mk)b.mk=o.mk;b.by='ceo';S.offers=S.offers.filter(x=>x!==o);S.biz.push(clSign(b));toast(tr('sales.ceo_override',{name:esc(o.name)}),'');return true;}
// Saves: who is at the desk, the VP on the way, the CEO's calendar; who brought each offer and signed each customer.
function salesFix(s){const L=s.sales&&typeof s.sales==='object'&&!Array.isArray(s.sales)?s.sales:{},n=v=>Number.isInteger(v)&&v>=0&&v<1e7?v:null;
  s.sales={p:own(SALES,L.p)?L.p:null,hired:n(L.hired)||0,vp:L.p==='ceo'?n(L.vp):null,golf:n(L.golf),say:n(L.say)};
  for(const x of [...s.biz,...s.offers])if(x.by!==undefined&&!own(SALES,x.by))delete x.by;slAutoFix(s);}
