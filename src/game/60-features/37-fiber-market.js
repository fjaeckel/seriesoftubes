/* ---------- the capacity market: what carriers want on each route, today and tomorrow ----------
   Every route you hold dark fiber on has buyers for spectrum (an alien wave, the buyer brings the optics), managed
   100G, 400G, 800G and 1.6T waves (carved out of capacity you lit yourself), and dark pairs on fiber you dug (an IRU: a
   big sum up front, then a little upkeep a month). How much each route wants moves all the time, as it does in real
   life: a slow cycle of its own, weeks of noise, and news (a cable cut next door, a hyperscaler breaking ground, a rival
   lighting new glass). Underneath, it grows: carriers want more every year, and bigger waves as the years go by (100G
   gives way to 400G, then 800G and 1.6T), and carriers already on your glass ask to move up a size. Hot routes pay more
   and fill faster; a short, straight route sells waves at a premium, and a long one costs more because its fiber does. The broker keeps 10% (3% for a Cable broker, who also sees where
   each route is heading). S.cm: hold (share kept for your own traffic), p (per product: auto on, min demand, price
   floor), off (routes left alone), sh (shocks), news, seen (incidents already turned into news). */
const CM_P=['spec','w100','w400','w800','w1600','iru'],CM_W=['w100','w400','w800','w1600'];
const CM_L={spec:'w',w100:'m1',w400:'m4',w800:'m8',w1600:'m16',iru:'p'},CM_G={w100:100,w400:400,w800:800,w1600:1600};
const CM_HOLD=[0,10,25,50],CM_FLOOR=[60,80,100,120],CM_MIN={spec:[1,2,4,8],w100:[1,4,8,16],w400:[1,2,4,8],w800:[1,2,4,8],w1600:[1,2,4],iru:[1,2]};
const CM_DEF={spec:{on:false,min:2,floor:80},w100:{on:false,min:4,floor:80},w400:{on:false,min:2,floor:80},w800:{on:false,min:1,floor:80},w1600:{on:false,min:1,floor:80},iru:{on:false,min:1,floor:100}};
// A wave's price against a 100G one, on land and on subsea: 2.7x and 3.8x for 400G (real markets in 2025), and the
// price of a bit keeps falling as waves grow.
const CM_X={w100:[1,1],w400:[2.7,3.8],w800:[4.6,6.6],w1600:[7.8,11]};
// Cities where trading firms sit: a short route between two of them pays the most for a fast wave.
const CM_FIN=['nyc','chi','lon','fra','tok','sin','hkg','ams','ash'];
const CM_HMAX=2.5;
const cmNew=()=>({hold:25,p:JSON.parse(JSON.stringify(CM_DEF)),off:{},sh:[],news:[],seen:[]});
const cmCut=()=>broker()?0.97:0.9;
/* A fiber's listing, l.list: {w: spectrum slots, p: pairs} as it always was, plus m1/m4/m8/m16 (managed 100G to 1.6T
   waves) when any are listed, and hw/hp: how many of w/p you listed by hand, which the broker's thresholds never take
   back (#340). cmClean() checks one (a save, or after a day of sales) and returns null when nothing is left. */
const cmLs=l=>l.list||(l.list={w:0,p:0});
const CM_HAND={w:'hw',p:'hp'};
function cmClean(L){if(!L||typeof L!=='object'||Array.isArray(L))return null;const x={w:int(L.w,0,256,0),p:int(L.p,0,2,0)};let any=x.w||x.p;
  for(const k in CM_HAND){const v=Math.min(x[k],int(L[CM_HAND[k]],0,256,0));if(v)x[CM_HAND[k]]=v;}
  for(const p of CM_W){const v=int(L[CM_L[p]],0,256,0);if(v){x[CM_L[p]]=v;any=1;}}return any?x:null;}
// What you listed by hand of a product on a fiber (only alien waves and pairs can be).
const cmHand=(l,lk)=>(CM_HAND[lk]&&l.list&&l.list[CM_HAND[lk]])||0;
// A stable number in [0,1) for a route and a question, different in every game.
const cmU=(k,q)=>hstr(k+'|'+q+'|'+((S&&S.asn)||0))%100000/100000;
/* How hot a route is (1 = its usual self). Its own slow cycle (two waves of 4 to 10 and 1.5 to 3 months) is what a
   forecast can see; the weeks of noise on top and news nobody has heard yet are not. */
function cmCycle(k,d){const p1=120+180*cmU(k,'p1'),p2=40+50*cmU(k,'p2');return 1+0.25*Math.sin(2*Math.PI*(d/p1+cmU(k,'f1')))+0.15*Math.sin(2*Math.PI*(d/p2+cmU(k,'f2')));}
function cmNoise(k,d){const i=Math.floor(d/15),t=(d-i*15)/15,u=t*t*(3-2*t),v=j=>0.85+0.3*cmU(k,'n'+j);return v(i)*(1-u)+v(i+1)*u;}
// News: a shock ramps up over a week, holds, and fades over the last 40% of its time.
const cmShockF=(x,d)=>d<x.from||d>=x.until?0:Math.max(0,Math.min(1,(d-x.from+1)/7,(x.until-d)/Math.max(1,(x.until-x.from)*0.4)));
const cmHits=(x,r)=>x.k?x.k===r.k:x.c?x.c===r.a||x.c===r.b:!!x.sub&&r.sub;
function cmShock(r,p,d){let m=1;for(const x of S.cm.sh)if(cmHits(x,r)&&(!x.p||x.p.includes(p))){const f=cmShockF(x,d);if(f)m*=1+(x.m-1)*f;}return m;}
function cmHeat(r,p,d,fc){return clamp(cmCycle(r.k,d)*(fc?1:cmNoise(r.k,d))*cmShock(r,p,d),0.3,CM_HMAX);}
// What a route is: its cities, its fiber (yours, if any), how far and how fast. Without fiber, as you could dig it
// (straight, at your own fiber's 1.1 path factor).
function cmRoute(a,b,ls=[]){const k=a<b?a+'|'+b:b+'|'+a,km=ls.length?Math.min(...ls.map(l=>l.km)):kmBetween(a,b),sub=ls.length?ls.some(l=>l.sub):isSub(a,b);
  const lat=ls.length?Math.min(...ls.map(linkLat)):kmBetween(a,b)*1.1/200,gc=kmBetween(a,b)/200,st=gc>0?lat/gc:2,fin=CM_FIN.includes(a)&&CM_FIN.includes(b);
  // Latency is dominated by the length of the route: a short, straight one sells fast waves at a premium (up to +50%,
  // +80% between two trading cities).
  const lp=1+0.5*clamp((1.5-st)/0.4,0,1)*(fin?1.6:1);
  return {k,a,b,ls,km,sub,lat,st,lp,fin,dc:MEGA.some(m=>m.c===a||m.c===b)};}
// The routes you hold ready dark fiber on.
function cmRoutes(){const by=new Map();for(const l of S.links)if(l.kind==='df'&&l.ready<=S.day){const k=edgeKey(l);(by.get(k)||by.set(k,[]).get(k)).push(l);}
  const rs=new Map();for(const [k,ls] of by){const [a,b]=k.split('|');rs.set(k,cmRoute(a,b,ls));}return rs;}
/* Growth: carriers want about 15% more every year (non-AI traffic grows about that fast, AI traffic faster), up to 8
   times what they wanted at the start. */
const cmGrowth=d=>Math.min(8,Math.pow(1.15,Math.max(0,d)/365));
/* Which wave sizes buyers want: each size catches on along an S-curve over game years plus the network era, and takes
   over from the one before (100G, then 400G, 800G from about year 5, 1.6T from about year 9; a later network era
   brings each a little sooner). */
const CM_ADOPT={w400:1.5,w800:5,w1600:9};
const cmA=(p,d)=>1/(1+Math.exp(-(Math.max(0,d)/365+0.15*lvl()-CM_ADOPT[p])/1.3));
function cmShare(p,d){const a4=cmA('w400',d),a8=cmA('w800',d),a16=cmA('w1600',d);return p==='w100'?1-a4:p==='w400'?a4-a8:p==='w800'?a8-a16:a16;}
/* What a route wants of a product, in units: spectrum slots, waves of that size, dark pairs. The size comes from the
   eyeballs at both ends (brMarket(), as before) and growth; managed waves split by the sizes buyers want now, fast
   waves from latency, the big ones and dark pairs from data centers at either end; dark pairs are mostly bought for
   shorter hauls. */
function cmDem(r,p,d,fc){const M=brMarket(r.a,r.b),H=cmHeat(r,p,d,fc),g=cmGrowth(d);
  if(p==='spec')return M*0.5*Math.pow(g,0.7)*H;
  if(p==='iru')return Math.min(2,M/12*(r.dc?2:1)*clamp(900/r.km,0.35,1.5))*Math.sqrt(g)*H;
  const dc=r.dc&&p!=='w100'?(p==='w400'?1.3:1.6):1;return M*160*Math.sqrt(r.lp)*g*cmShare(p,d)*dc*H/CM_G[p];}
// What carriers already rent on a route, by product, in the same units.
const cmWP=g=>CM_W.find(p=>CM_G[p]===g)||'w100';
function cmSold(rs){const m=new Map(),ids=new Map();for(const r of rs.values()){m.set(r.k,Object.fromEntries(CM_P.map(p=>[p,0])));for(const l of r.ls)ids.set(l.id,r.k);}
  for(const b of S.biz){const k=b.link&&ids.get(b.link);if(!k)continue;const s=m.get(k);
    if(b.type==='wwave')s.spec+=b.slots||0;else if(b.type==='mwave')s[cmWP(b.g)]+=b.slots||0;else if(b.type==='dfpair')s.iru++;}
  return m;}
/* List prices, before the market index (mkt()) and the broker's cut: spectrum is 30% of what the fiber costs a month
   (as before, #203); a managed 100G wave 30% of that times the latency premium, bigger ones by CM_X; a dark pair two
   years of its lease up front, then 15% of it a month. */
const cmF=r=>dfLeaseMo(r.km)+ampCount(r.km)*AMP_MO;
function cmList(r,p){return p==='spec'?cmF(r)*WW_SHARE:p==='iru'?dfLeaseMo(r.km)*0.15:cmF(r)*WW_SHARE*0.3*r.lp*CM_X[p][r.sub?1:0];}
const cmUpList=r=>dfLeaseMo(r.km)*0.9*24;
/* The price of the i-th unit from now, as a share of list: heat pushes it up or down (hot routes pay off), and each
   unit sold on the route makes the next one cheaper, down to 40% once its market is full. */
function cmIdx(r,p,s,i,d,fc){const D=cmDem(r,p,d,fc),H=cmHeat(r,p,d,fc);return clamp(Math.pow(H,0.6),0.7,1.35)*(1-WW_FALL*Math.min(1,D>0?(s+i)/D:1));}
// Managed waves sold on a fiber, in Gbps: they come off what your own traffic gets (dfCap0()).
let CM_MW=null,CM_V=0;
function mwG(l){if(!S||!S.biz)return 0;if(!CM_MW||CM_MW.b!==S.biz||CM_MW.n!==S.biz.length||CM_MW.v!==CM_V){const m=new Map();
    for(const b of S.biz)if(b.type==='mwave'&&b.link)m.set(b.link,(m.get(b.link)||0)+(b.slots||0)*(b.g||100));CM_MW={b:S.biz,n:S.biz.length,v:CM_V,m};}
  return CM_MW.m.get(l.id)||0;}
// How much of a product a fiber has spare, after the share kept back for your own traffic (spectrum slots, or lit
// capacity your traffic is not using). A wave rides one channel, so an 800G or 1.6T one needs an optic that big. A pair
// is never kept back: it is glass you are not lighting.
const cmFreeG=(l,hold=S.cm.hold)=>dfCap0(l)-(R.load[l.id]||0)*1.05-hold/100*dfLit(l);
const cmOptG=l=>Math.max(0,...(l.ch||[]).map(c=>optG(c,l)));
function cmSpare(l,p,hold=S.cm.hold){
  if(p==='spec')return Math.max(0,freeCh(l)-Math.ceil(hold/100*chMax(l)));
  if(p==='iru')return l.own&&pairFree(l)&&!(l.cut>S.day)?1:0;
  return cmOptG(l)<CM_G[p]?0:Math.max(0,Math.floor(cmFreeG(l,hold)/CM_G[p]));}
const cmWhat=(l,p,n)=>p==='spec'?wwWhat(l,n):p==='iru'?tr('requirements.a_spare_fiber_pair_in_your',{a:CITY[l.a].name,b:CITY[l.b].name}):trn('market.n_g_wave_on',n,{g:fmtCap(CM_G[p]),a:CITY[l.a].name,b:CITY[l.b].name});
// A sale: a new carrier on this fiber, or more of the same product for one that already rents here.
function cmSell(l,p,n,rate,up){const t=p==='spec'?'wwave':p==='iru'?'dfpair':'mwave',T=BIZ_T[t],nm=()=>{const list=T.names.filter(x=>!S.usedNames.includes(x)),x=list.length?pick(list):pick(T.names);useName(x);return x;};
  const g=CM_G[p],name=nm(),more=t!=='dfpair'&&S.biz.find(b=>b.type===t&&b.link===l.id&&b.name===name&&(t!=='mwave'||b.g===g));
  if(more){more.slots=(more.slots||0)+n;more.rate+=rate;more.what=cmWhat(l,p,more.slots);}
  else{const o={id:uid(),city:l.a,city2:l.b,link:l.id,slots:t==='dfpair'?0:n,what:cmWhat(l,p,n),name,type:t,bw:1,rate,reqs:[],exp:S.day+30};const b=clSign(offerCustomer(o));if(g)b.g=g;S.biz.push(b);}
  CM_V++;if(up)S.cash+=up;S.stats.cmSold=(S.stats.cmSold||0)+1;
  toast(up?tr('market.sold_pair',{name:esc(name),what:esc(cmWhat(l,p,n)),up:fmt$(up),price:fmt$(rate)}):tr('broker.sold',{name:esc(name),what:esc(cmWhat(l,p,n)),price:fmt$(rate)}),'good');
  floater((CITY[l.a].x+CITY[l.b].x)/2,(CITY[l.a].y+CITY[l.b].y)/2-20,tr('common.signed'),'#16A866');}
// What one fiber can still sell of a product right now, whatever is listed: free spectrum, lit capacity your traffic
// is not using, a free pair.
function cmCan(l,p){if(!fiberOk({link:l.id,type:p==='iru'?'dfpair':'wwave'}))return 0;return p==='spec'?Math.max(0,freeCh(l)):p==='iru'?cmSpare(l,'iru'):cmSpare(l,p,0);}
/* News: incidents that cut glass become news the next morning, and every so often something happens on its own.
   Each one is a shock on a route, around a city, or on every subsea route, for some products, for a while. */
const CM_NEWS={
  cut:{m:1.6,days:45,p:null,t:N_('market.news_cut')},redsea:{m:1.8,days:90,p:null,t:N_('market.news_redsea')},
  dc:{m:2,days:150,p:['w400','w800','w1600','iru'],t:N_('market.news_dc_big')},ai:{m:2.5,days:70,p:['w400','w800','w1600'],t:N_('market.news_ai_big')},
  glut:{m:0.6,days:120,p:null,t:N_('market.news_glut')},exch:{m:1.7,days:60,p:CM_W,t:N_('market.news_exch')},
  merge:{m:0.75,days:90,p:null,t:N_('market.news_merge')},boom:{m:1.4,days:60,p:['spec','w100'],t:N_('market.news_boom')}};
function cmNews(why,x,d){const N=CM_NEWS[why],s={why,from:d,until:d+N.days,m:N.m,...x};if(N.p)s.p=N.p.slice();S.cm.sh.push(s);
  S.cm.news.unshift({d,why,a:x.a||x.c||null,b:x.b||null});S.cm.news.length=Math.min(S.cm.news.length,8);
  const rs=cmRoutes();if([...rs.values()].some(r=>cmHits(s,r)))toast(cmNewsText(S.cm.news[0]),N.m>1?'info':'warn',[{l:tr('market.open'),act:'marketOpen',args:{}}]);}
const cmNewsText=n=>tr(CM_NEWS[n.why].t,{a:n.a?CITY[n.a].name:'',b:n.b?CITY[n.b].name:''});
function cmShocks(d){const C=S.cm;C.sh=C.sh.filter(x=>x.until>d);
  for(const i of S.inc)if(LINKCUT_TR.includes(i.type)&&!C.seen.includes(i.id)){C.seen.push(i.id);if(C.seen.length>40)C.seen.shift();
    if(i.type==='redsea'){cmNews('redsea',{sub:1},d);continue;}
    const l=S.links.find(x=>x.id===i.ref||x.trench===i.ref);if(l)cmNews('cut',{c:hstr(String(i.id))%2?l.a:l.b,a:l.a,b:l.b},d);}
  // Without dark fiber there is no market to move, and no random number is drawn (the rest of the day stays as it was).
  const rs=[...cmRoutes().values()],cs=[...new Set(rs.flatMap(r=>[r.a,r.b]))];if(!rs.length||Math.random()>=1/10)return;
  const why=pick(['dc','ai','glut','exch','merge','boom','boom','dc']),r=pick(rs),c=pick(cs);
  if(why==='dc'||why==='boom')cmNews(why,{c},d);
  else if(why==='exch'){const f=cs.filter(x=>CM_FIN.includes(x));if(f.length){const x=pick(f);cmNews(why,{c:x},d);}}
  else cmNews(why,{k:r.k,a:r.a,b:r.b},d);}
/* Once a day: news, then on every route the broker lists what your thresholds allow (spare after the share kept back,
   while demand is at least your minimum and the price at least your floor) or takes it off, then each listing may
   find a buyer: the more room the route has left and the hotter it is, the sooner; the fastest fiber sells first. */
function cmList1(r,p,s,d){const c=S.cm.p[p],lk=CM_L[p];if(!c.on||S.cm.off[r.k])return;const ok=cmDem(r,p,d)>=c.min&&cmIdx(r,p,s,0,d)*100>=c.floor;
  // What you listed by hand stays listed on top of what the thresholds allow, up to what the fiber has free.
  for(const l of r.ls){const h=cmHand(l,lk),n=Math.min(ok?cmSpare(l,p)+h:h,h?(p==='spec'?freeCh(l):1):Infinity);if(n>0)cmLs(l)[lk]=n;else if(l.list)l.list[lk]=0;}}
// The listings as the thresholds want them right now (after you change a setting), without selling anything.
function cmRelist(){const rs=cmRoutes(),sold=cmSold(rs);for(const r of rs.values())for(const p of CM_P)cmList1(r,p,sold.get(r.k)[p],S.day);cmTidy();}
const cmTidy=()=>{for(const l of S.links)if(l.list){const L=cmClean(l.list);if(L)l.list=L;else delete l.list;}};
function cmDay(d=S.day){const C=S.cm;cmShocks(d);const rs=cmRoutes(),sold=cmSold(rs);
  for(const r of rs.values()){const s=sold.get(r.k);
    for(const p of CM_P){const lk=CM_L[p];cmList1(r,p,s[p],d);
      // Room rounds to the nearest unit: a road to nowhere that wants about one wave sells one.
      const D=cmDem(r,p,d),room=Math.round(D-s[p]);if(room<1)continue;
      const ls=r.ls.filter(l=>l.list&&l.list[lk]>0&&cmCan(l,p)>0).sort((x,y)=>linkLat(x)-linkLat(y));if(!ls.length)continue;
      if(Math.random()>=Math.min(0.35,0.06+0.25*room/Math.max(1,D))*(p==='iru'?0.08:1)*(p==='spec'?1:Math.sqrt(r.lp)))continue;
      const l=ls[0];let n=p==='iru'?1:Math.max(1,Math.min(l.list[lk],cmCan(l,p),room,1+Math.floor(Math.random()*(p==='spec'||p==='w100'?4:2))));
      // Never below your floor: fewer units, or none.
      while(n>0&&cmIdx(r,p,s[p],n-1,d)*100<C.p[p].floor)n--;if(!n)continue;
      const cut=cmCut()*mkt(),L=cmList(r,p);let rate=0;for(let i=0;i<n;i++)rate+=L*cmIdx(r,p,s[p],i,d);
      const up=p==='iru'?Math.round(cmUpList(r)*cmIdx(r,p,s[p],0,d)*cut):0;
      cmSell(l,p,n,Math.round(rate*cut),up);s[p]+=n;l.list[lk]-=n;
      // Sales take from the broker's share first: what you listed by hand goes only once that is sold.
      if(cmHand(l,lk)>l.list[lk])l.list[CM_HAND[lk]]=l.list[lk];}}
  cmGrow(d);cmTidy();}
/* What the next 30 and 90 days look like on a route, for a Cable broker: the route's own cycle and the news already
   out, but not the noise or news still to come. */
const cmFc=(r,p,t)=>cmDem(r,p,S.day+t,true);
/* Growth inside contracts: once the next size is common (15% of what buyers want), a carrier on a managed wave asks
   now and then to move all its waves up one size. With room on the fiber (after what you keep back) it moves at once
   and pays more (a bigger wave, at a lower price per bit); without, it tells you, at most twice a year. */
function cmGrow(d){for(const b of S.biz){if(b.type!=='mwave')continue;const i=CM_W.indexOf(cmWP(b.g)),q=CM_W[i+1];if(!q||cmShare(q,d)<0.15||Math.random()>=1/300)continue;
    const l=S.links.find(x=>x.id===b.link);if(!l||!fiberOk(b))continue;const g1=CM_G[q],extra=(g1-b.g)*(b.slots||1),sub=l.sub?1:0,arg={name:esc(b.name),n:b.slots||1,g0:fmtCap(b.g),g1:fmtCap(g1),a:CITY[l.a].name,b:CITY[l.b].name};
    if(cmOptG(l)>=g1&&cmFreeG(l)>=extra){const p0=cmWP(b.g);b.rate=Math.round(b.rate*CM_X[q][sub]/CM_X[p0][sub]*0.85);b.g=g1;b.what=cmWhat(l,q,b.slots||1);CM_V++;
      toast(tr('market.upgraded',{...arg,price:fmt$(b.rate)}),'good');}
    else if(!(b.gw>d-180)){b.gw=d;toast(tr('market.wants_more',arg),'warn',[{l:tr('lease_swaps.open_your_fiber'),act:'dashLink',args:{id:l.id}}]);}}}
// How many more spectrum slots a fiber's route wants today (the fiber panel's market line).
function cmRoomSpec(l){const rs=cmRoutes(),r=rs.get(edgeKey(l));if(!r)return 0;return Math.max(0,Math.round(cmDem(r,'spec',S.day)-cmSold(rs).get(r.k).spec));}
// Routes a Cable broker could build between two of its POPs, the most wanted first.
function cmScout(n=6){const ps=Object.keys(S.pops),have=new Set(S.links.filter(l=>l.kind==='df').map(edgeKey)),out=[];
  for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){const a=ps[i],b=ps[j],k=a<b?a+'|'+b:b+'|'+a;if(have.has(k))continue;
    const sub=isSub(a,b);if(sub?!seaCab(a,b):kmBetween(a,b)>1500||!dfAllowed(a,b))continue;const r=cmRoute(a,b);
    out.push({r,v:CM_P.reduce((s,p)=>s+cmDem(r,p,S.day)*cmList(r,p),0)});}
  return out.sort((x,y)=>y.v-x.v).slice(0,n).map(x=>x.r);}
// Saves: everything checked, old saves get the defaults.
function cmFix(s){const c=s.cm&&typeof s.cm==='object'&&!Array.isArray(s.cm)?s.cm:{},n=cmNew();
  n.hold=CM_HOLD.includes(+c.hold)?+c.hold:25;
  for(const p of CM_P){const x=c.p&&c.p[p]||{};n.p[p]={on:!!x.on,min:CM_MIN[p].includes(+x.min)?+x.min:CM_DEF[p].min,floor:CM_FLOOR.includes(+x.floor)?+x.floor:CM_DEF[p].floor};}
  if(c.off&&typeof c.off==='object')for(const k in c.off){const [a,b]=k.split('|');if(c.off[k]&&isCity(a)&&isCity(b)&&a<b)n.off[k]=1;}
  if(Array.isArray(c.sh))n.sh=c.sh.filter(x=>x&&own(CM_NEWS,x.why)&&(x.k?typeof x.k==='string'&&x.k.split('|').every(isCity):x.c?isCity(x.c):!!x.sub)).slice(-24).map(x=>{
    const y={why:x.why,from:int(x.from,-1e6,1e7,0),until:int(x.until,-1e6,1e7,0),m:clamp(num(x.m,1),0.3,3)};if(x.k)y.k=x.k;else if(x.c)y.c=x.c;else y.sub=1;
    if(isCity(x.a))y.a=x.a;if(isCity(x.b))y.b=x.b;if(Array.isArray(x.p)){const p=x.p.filter(q=>CM_P.includes(q));if(p.length)y.p=p;}return y;});
  if(Array.isArray(c.news))n.news=c.news.filter(x=>x&&own(CM_NEWS,x.why)).slice(0,8).map(x=>({d:int(x.d,-1e6,1e7,0),why:x.why,a:isCity(x.a)?x.a:null,b:isCity(x.b)?x.b:null}));
  if(Array.isArray(c.seen))n.seen=c.seen.filter(x=>typeof x==='string').slice(-40);
  s.cm=n;
  for(const l of s.links){if(l.kind!=='df'||!l.list)continue;const L=cmClean(l.list);if(L)l.list=L;else delete l.list;}
  for(const b of s.biz)if(b.type==='mwave'){b.g=CM_W.some(p=>CM_G[p]===b.g)?b.g:100;b.slots=Math.max(1,Math.round(b.slots||1));if(b.gw!==undefined)b.gw=int(b.gw,-1e6,1e7,0);}}
