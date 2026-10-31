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
// Once a day, each listing may find a buyer: the more room the route has left, the sooner.
function brTick(){for(const l of S.links){const L=l.list;if(!L||l.kind!=='df'||!fiberOk({link:l.id,type:'wwave'}))continue;
    const free=brFree(l);if(!free)continue;
    if(L.w>0&&freeCh(l)>=1&&Math.random()<Math.min(0.3,free/45)){const n=Math.max(1,Math.min(L.w,freeCh(l),free,1+Math.floor(Math.random()*4)));brSell(l,'wwave',n);L.w-=n;}
    else if(L.p>0&&pairFree(l)&&free>=BR_PAIR&&Math.random()<1/90){brSell(l,'dfpair',1);L.p--;}
    if(!(L.w>0)&&!(L.p>0))delete l.list;}}
// A sale: a new carrier on this fiber, or more waves for one that already rents here.
function brSell(l,t,n){const T=BIZ_T[t],nm=()=>{const list=T.names.filter(x=>!S.usedNames.includes(x)),x=list.length?pick(list):pick(T.names);useName(x);return x;};
  const o=fiberOffer(t,l,nm,0.9);if(t==='wwave'){o.slots=n;o.rate=Math.round(waveMo(l.km,false,2)*0.55*n*0.9);o.what=wwWhat(l,n);}
  const more=t==='wwave'&&S.biz.find(b=>b.type==='wwave'&&b.link===l.id&&b.name===o.name);
  if(more){more.slots=(more.slots||0)+n;more.rate+=o.rate;more.what=wwWhat(l,more.slots);}else S.biz.push(offerCustomer(o));
  toast(tr('broker.sold',{name:esc(o.name),what:esc(t==='wwave'?wwWhat(l,n):o.what),price:fmt$(o.rate)}),'good');
  floater((CITY[l.a].x+CITY[l.b].x)/2,(CITY[l.a].y+CITY[l.b].y)/2-20,tr('common.signed'),'#16A866');}
