/* ---------- The Cable broker (#300) ----------
   A charter for building glass and selling it. Dark fiber, every line system and optic, digging, own subsea cables,
   their upgrades and more pairs are open from day one at the usual prices (glassLvl, rgGlass in 36-specialist.js); the
   rest of the game unlocks by level as always. Carriers call for capacity, the goals are about glass (BROKER_GOALS), and
   the win is Glass Baron: your own cables land on five continents while carriers pay you $1M a month for capacity. */
const BARON_CONT=5,BARON_MO=1000000,BROKER_CALL=120,BROKER_CALL_FROM=60;
// Your own glass: fiber you dug and cables you laid, once ready. A leased IRU is someone else's; so is a consortium seat.
const ownGlassL=l=>l.kind==='df'&&l.own&&!l.seat&&l.ready<=S.day;
const glassKm=()=>S.links.reduce((a,l)=>a+(ownGlassL(l)?l.km:0),0);
// The continents your own subsea cables land on.
function cableConts(){const r=new Set();for(const l of S.links)if(ownGlassL(l)&&l.sub)for(const c of [l.a,l.b])r.add(CITY[c].reg);return r.size;}
// Capacity other carriers buy from you: alien waves, fiber pairs and capacity deals (once delivered).
const CAP_TYPES=['wwave','dfpair','pairs','capw','capsub','capfib'];
const capSold=b=>CAP_TYPES.includes(b.type)&&!capPend(b);
const capSalesMo=()=>S.biz.reduce((a,b)=>a+(capSold(b)?bizMo(b):0),0);
// Lit capacity sold, in Gbps: waves (400G each) and subsea capacity. A dark pair is the buyer's to light.
const capSoldG=()=>S.biz.reduce((a,b)=>a+(!capSold(b)?0:b.type==='wwave'?(b.slots||1)*400:b.type==='capw'||b.type==='capsub'?b.bw:0),0);
// Two hops of your own glass through one city, each lit to at least g.
function glassChain(g){const by={};for(const l of S.links)if(ownGlassL(l)&&dfCap(l)>=g)for(const [c,o] of [[l.a,l.b],[l.b,l.a]])(by[c]=by[c]||new Set()).add(o);
  return Object.values(by).some(s=>s.size>=2);}
const baronOk=()=>cableConts()>=BARON_CONT&&capSalesMo()>=BARON_MO;
// On the goals tab, under the charter: how far Glass Baron is.
function baronCard(){if(S.baronWon)return `<div class="inc" style="background:#EAF7EE"><div class="nm">🌊 ${tr('broker.glass_baron')}</div><div class="meta">${tr('broker.won_on_date',{date:dateStr(S.baronWon)})}</div></div>`;
  return `<div class="inc" style="background:#E6F4FF"><div class="nm">🌊 ${tr('broker.glass_baron')}</div><div class="meta">${tr('broker.progress',{c:Math.min(cableConts(),BARON_CONT),n:BARON_CONT,mo:fmt$(capSalesMo()),m:fmt$(BARON_MO)})}</div></div>`;}
function showBaronWin(){openModal(`<h1 style="font-family:var(--display);font-size:40px;margin:0">🌊 ${tr('broker.glass_baron')}</h1><p class="tagline">${tr('broker.win_text',{name:esc(S.name),asn:S.asn,days:S.day,n:BARON_CONT,mo:fmt$(capSalesMo())})}</p><div class="btns">${btn(tr('help.share_my_network'),'share',{},'pink')}${btn(tr('common.keep_playing'),'closeModal',{},'ghost')}</div>`);}
/* Carriers call the broker now and then (about three times a year, from day 60) with a capacity deal on a route the
   capacity conferences trade: the same deals at the same terms, without the trip. Picked by a hash of the day, so a
   broker's other dice roll as they would. */
function brokerDay(d){if(d<BROKER_CALL_FROM||S.scn||hstr(S.asn+'|capcall|'+d)%BROKER_CALL!==0)return;
  const pool=Object.values(CAP_ROUTES).flat().filter(r=>isCity(r[0])&&isCity(r[1])&&!S.offers.some(o=>o.city===r[0]&&o.city2===r[1]&&o.type===r[2]));if(!pool.length)return;
  const [a,b,t]=pool[hstr(S.asn+'|caproute|'+d)%pool.length],T=BIZ_T[t];
  const nm=()=>{const list=T.names.filter(n=>!S.usedNames.includes(n)),n=list.length?pick(list):pick(T.names);useName(n);return n;};
  const o=capOffer(a,b,t,nm);S.offers.push(o);
  toast(tr('broker.a_carrier_calls',{name:esc(o.name),what:capWhat(o),a:CITY[a].name,b:CITY[b].name}),'goal',[{l:tr('common.show_me'),act:'leftTab',args:{t:'deals'}}]);sfx('coin');}
