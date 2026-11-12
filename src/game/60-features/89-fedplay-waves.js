/* ================= MULTIPLAYER GAMEPLAY: waves sold between players =================
   A player sells managed waves (100G to 1.6T) on routes it has lit in its own game, from a published rate card
   (rates.wave, §5.1): {routes: [{a, b}], sizes: [{gbps, monthly}], term}. A running deal is a wave link A–B in the
   buyer's game, like one leased from a computer-run vendor, billed monthly (fedMoney); in the seller's game it earns
   the price and takes its Gbps off the lit route, counted like a managed wave sold to a computer-run carrier (mwG()).
   Each game simulates its own world: the seller's fiber being cut changes nothing in the buyer's game.
   The ceiling (what a computer-run vendor charges for that wave, waveMo) is the seller's own limit when it publishes;
   the shared rule (fedDeal, §10.10) checks only that an offer takes the published card. */
const fedWaveT=g=>LT.findIndex(x=>x.g===g);
// What a computer-run vendor charges a month for a wave of g Gbps between two cities.
const fedWaveCeil=(a,b,g)=>waveMo(kmBetween(a,b),isSub(a,b),Math.max(0,fedWaveT(g)));
// The highest price for a size on a card: the cheapest route's computer-run price (Infinity without routes).
const fedWaveCeilCard=(routes,g)=>routes.reduce((m,r)=>Math.min(m,fedWaveCeil(r.a,r.b,g)),Infinity);
// Routes this network can sell waves on: its own ready fiber with optics lit, "a|b" with a < b.
function fedWaveLit(){const out=new Set();for(const l of S.links)if(l.kind==='df'&&l.ready<=S.day&&(l.ch||[]).length&&fedCityOk(l.a)&&fedCityOk(l.b))out.add(edgeKey(l));
  return [...out].sort().slice(0,32);}
// A card to start from: the first lit route, 100G and 400G a little under the computer-run price, 90 days.
function fedWaveDef(){const k=fedWaveLit()[0],routes=k?[{a:k.split('|')[0],b:k.split('|')[1]}]:[];
  return {routes,sizes:[100,400].map(g=>({gbps:g,monthly:routes.length?Math.max(1,Math.round(fedWaveCeilCard(routes,g)*0.9)):1000})),term:90};}
// Prices never above the computer-run ceiling of the card's routes.
function fedWaveCap(w){if(!w)return;for(const x of w.sizes){const c=fedWaveCeilCard(w.routes,x.gbps);if(c<Infinity)x.monthly=Math.min(x.monthly,c);}}
/* Room for one more wave of g Gbps on the route a|b in this game: a lit fiber whose optics carry a channel that big and
   whose spare capacity (lit, less managed waves sold and this network's own traffic) takes it. */
function fedWaveRoom(a,b,g){const k=a<b?a+'|'+b:b+'|'+a;
  return S.links.some(l=>l.kind==='df'&&edgeKey(l)===k&&l.ready<=S.day&&!(l.cut>S.day)&&cmOptG(l)>=g&&dfCap0(l)-((R&&R.load&&R.load[l.id])||0)*1.05>=g);}
// Waves this network sells to players, by fiber (mwG()'s map, Gbps): each on the first fiber of its route with room.
function fedWaveSold(m){const f=S.fed;if(!f||!f.deals.length)return;
  for(const d of f.deals){if(!d.on||d.deal!=='wave'||d.role!=='sell')continue;const T=d.terms,k=T.a+'|'+T.b;
    const ls=S.links.filter(l=>l.kind==='df'&&l.ready<=S.day&&edgeKey(l)===k);if(!ls.length)continue;
    const l=ls.find(x=>dfLit(x)-(m.get(x.id)||0)>=T.gbps)||ls[0];m.set(l.id,(m.get(l.id)||0)+T.gbps);}}
/* The buyer's links: a wave link for each running wave it buys with POPs at both ends, none for any other. Gives true
   when one came or went. */
function fedWaveLinks(s){const f=s.fed;if(!f)return false;const want=new Map();
  for(const d of f.deals)if(d.on&&d.deal==='wave'&&d.role==='buy'&&s.pops[d.terms.a]&&s.pops[d.terms.b])want.set(d.id,d);
  let ch=false;const n0=s.links.length;s.links=s.links.filter(l=>!l.fwv||want.has(l.fwv));if(s.links.length!==n0)ch=true;
  for(const [id,d] of want){if(s.links.some(l=>l.fwv===id))continue;const T=d.terms,tier=fedWaveT(T.gbps);if(tier<0)continue;
    s.links.push({id:uid(),a:T.a,b:T.b,kind:'wave',border:false,premium:false,tier,km:kmBetween(T.a,T.b),sub:false,cable:null,mo:0,mult:1,trench:'fwv:'+id,cut:0,day:s.day,fwv:id});ch=true;}
  if(ch)CM_V++;return ch;}
// The deal behind a wave link bought from a player (the link panel).
const fedWaveDeal=l=>l&&l.fwv&&S.fed?S.fed.deals.find(d=>d.id===l.fwv)||null:null;
