/* ---------- the capacity broker: a listing that sells as the market wants (#203) ----------
   You list some alien waves (and, on your own build, spare pairs) on a dark fiber; the broker keeps the listing and
   sells it off over the months, as carriers between those two cities want capacity. A route's market is how many 400G
   waves other carriers want there, sized by the eyeballs at both ends (a landing town counts the big city it serves),
   and everything you already rent out between those cities fills it: a busy route sells in days, a road to nowhere
   maybe once. The broker keeps 10% of the monthly price, as before. l.list = {w: waves left to sell, p: pairs}. */
const BR_DIV=40,BR_MAX=48,BR_PAIR=8,BR_NEAR=350;
// What a city weighs for the market: its own eyeballs, or half of a big city's within reach of its backhaul.
const BR_W=new Map();
function brWeight(c){let b=BR_W.get(c);if(b===undefined){const C=CITY[c];b=C.P;
    for(const D of CITIES)if(D.id!==c&&!D.off&&D.land===C.land&&kmBetween(c,D.id)<=BR_NEAR)b=Math.max(b,D.P*0.5);BR_W.set(c,b);}
  return b*eraMul();}
// 400G waves carriers want between two cities, and how many of them you already rent out there (a pair counts as 8).
const brMarket=(a,b)=>clamp(Math.round(Math.sqrt(brWeight(a)*brWeight(b))/BR_DIV),1,BR_MAX);
function brSold(a,b){const k=edgeKey({a,b});let n=0;const ls=new Set(S.links.filter(l=>l.kind==='df'&&edgeKey(l)===k).map(l=>l.id));
  for(const x of S.biz)if(ls.has(x.link))n+=x.type==='wwave'?(x.slots||0):x.type==='dfpair'?BR_PAIR:0;return n;}
const brFree=l=>Math.max(0,brMarket(l.a,l.b)-brSold(l.a,l.b));
/* What a carrier pays for one alien wave (#203): a share of what the fiber itself costs a month (lease plus amplifiers),
   since a buyer would not pay more than leasing and lighting it. Each wave sold between the two cities makes the next
   one cheaper, down to 40% of the first once the route's market is full: a full route earns a few times its lease. */
const WW_SHARE=0.3,WW_FALL=0.6;
function wwRate(l,n,cut=1){const F=dfLeaseMo(l.km)+ampCount(l.km)*AMP_MO,M=brMarket(l.a,l.b),s=brSold(l.a,l.b);let r=0;
  for(let i=0;i<n;i++)r+=F*WW_SHARE*(1-WW_FALL*Math.min(1,(s+i)/M));return Math.round(r*cut);}
// The listings sell in the capacity market now (cmDay(), 37-fiber-market.js), with prices and demand that move.
const brTick=()=>cmDay(S.day);
