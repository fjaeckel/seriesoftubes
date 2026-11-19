/* ---------- The Streaming service charter ----------
   You are the content. Subscribers in the countries you launch in watch at night, and every byte leaves your network for
   the eyeball networks they live in. Traffic starts at your origin data centers (big, slow, expensive builds in the big
   carrier-hotel metros), each serving the countries nearest it up to its size, and an origin's POP needs its own transit,
   exchange or PNI ports: an origin nobody can reach serves nobody. Far viewers get worse pictures (CNT_FAR), so a world
   audience needs origins on several continents. Binge Boxes are the mirror of the boxes NetChill and Goggle put in your
   POPs: your cache inside an eyeball network, a rank-0 exit for that network, filled from the origin. What a box holds
   (its hit ratio) is served from the box's city; the misses come from the origin like everything else.
   Season premieres are planned flash crowds; eyeball networks that charge for peering pick fights with big senders
   (disputes). The win is Must-Carry: the eyeball networks host your boxes for free in MC_CC countries on MC_REG
   continents, a global premiere went without buffering, and most of your traffic leaves on-net. Never Tier 1: a
   streaming service sells no transit. */
const CNT_RATE=220,CNT_SUBS=800,CNT_POT=0.4,CNT_GROW=0.03,CNT_START=0.02,CNT_FAR=[1500,9000,0.8];
// Origins: index 0 is the starter cage every streaming service gets at home; the rest are built.
const DC_T=[{n:N_('streaming.dc_starter'),g:400,cost:0,mo:3000,lv:1,days:0},{n:N_('streaming.dc_hall'),g:1500,cost:600000,mo:15000,lv:1,days:60},
 {n:N_('streaming.dc_campus'),g:5000,cost:2500000,mo:45000,lv:4,days:90},{n:N_('streaming.dc_hyper'),g:15000,cost:8000000,mo:120000,lv:8,days:120}];
// Origins go where data centers cluster: metros of at least this size.
const DC_MIN_P=300;
const BOX_G=100,BOX_COST=40000,BOX_MO=500,BOX_MAX=8,BOX_HIT=0.62,BOX_NEAR=0.12;
// The catalogue: more shows bring more subscribers and keep them, and spread what a box must hold.
const CAT_T=[{n:N_('streaming.cat_indie'),cost:0,mo:0,lv:1,grow:1,pot:1},{n:N_('streaming.cat_hits'),cost:250000,mo:10000,lv:3,grow:1.3,pot:1.15},
 {n:N_('streaming.cat_originals'),cost:1000000,mo:40000,lv:6,grow:1.6,pot:1.3},{n:N_('streaming.cat_everything'),cost:3000000,mo:100000,lv:9,grow:2,pot:1.5}];
const PREM_LV=3,PREM_MUL=2.2,PREM_DAYS=3,PREM_WARN=21,PREM_OK=0.95,PREM_ALL_LV=11;
// Live events (from LIVE_LV): no box can hold a show that has not happened yet, so they hit the origins and the backbone.
const LIVE_LV=6,LIVE_MUL=3,LIVE_HIT=0.35;
// Boxes fill overnight from the origins (FILL_NET over your backbone, FILL_T over transit only); new titles empty them a little.
const FILL_NEW=0.25,FILL_NET=0.25,FILL_T=0.1;
// A dispute freezes the ports: what you have with that network carries less every evening (DISP_DROP a day, down to
// DISP_CUT) and comes back DISP_HEAL a day after it ends. A paid deal runs DEAL_DAYS; traffic still flowing after that
// counts as taking their new price (DEAL_UP).
const DISP_LV=5,DISP_MIN=40,DISP_ODDS=90,DISP_CAMP=50000,DISP_CAMP_DAYS=10,DISP_CUT=0.5,DISP_DROP=0.025,DISP_HEAL=0.1,DEAL_DAYS=365,DEAL_UP=1.1;
const MC_CC=10,MC_REG=5,MC_ON=0.8;
const LIVE_NAMES=[N_('streaming.live_fight'),N_('streaming.live_final'),N_('streaming.live_concert')];
const premShow=p=>tr(p.live?LIVE_NAMES[p.n%LIVE_NAMES.length]:PREM_NAMES[p.n]);
const PREM_NAMES=[N_('streaming.prem_dragons'),N_('streaming.prem_baking'),N_('streaming.prem_heist'),N_('streaming.prem_space'),N_('streaming.prem_crime'),N_('streaming.prem_reality')];
/* Extension points, so each part of the Streaming service lives in its own file (38-streaming-*.js and others): files
   after this one push functions here at the top level.
   CNT_MUL.grow / .pot / .churn / .rev: multipliers per country code (growth speed, ceiling, cancellations when the
   picture is poor, revenue per subscriber), multiplied together. CNT_NEW(o): fields of a new S.cnt. CNT_SAN(c0,o,s):
   repair those fields on load (c0 the saved S.cnt, o the clean one being built). CNT_DAY(d): once a day, after
   routing. CNT_CARD(): extra HTML for the charter card. CNT_CITY(c): extra HTML for a city's Streaming tab. CNT_CC(cc):
   extra HTML inside a launched country's block. CNT_ADD(r,cc): revenue a country earns on top of its subscriptions.
   CNT_COST(): monthly costs on top. */
const CNT_MUL={grow:[],pot:[],churn:[],rev:[]},CNT_NEW=[],CNT_SAN=[],CNT_DAY=[],CNT_CARD=[],CNT_CITY=[],CNT_CC=[],CNT_ADD=[],CNT_COST=[];
const cntMul=(k,cc)=>{let m=1;for(const f of CNT_MUL[k])m*=f(cc);return m;};
function cntNew(){const o=cntNew0();for(const f of CNT_NEW)f(o);return o;}
function cntNew0(){return {cc:{},dc:{[S.home]:{t:0,ready:0}},box:[],cat:0,prem:null,premNext:S.day+60,premN:0,premOk:0,premAll:0,disp:null,heal:{},free:{},paid:{},boff:[],bund:[],bnext:S.day+90,roff:[],evs:[],rnext:S.day+EV_EVERY,evOk:0,wins:0,won:0};}
/* Countries, built once: their eyeball weight, biggest city (where the viewers are said to be), continent and the
   networks that sell to homes there with their shares (W2 promises at least two). */
let CC_I=null;
function ccInfo(cc){if(!CC_I){CC_I=new Map();for(const C of CITIES){if(C.off)continue;let o=CC_I.get(C.cc);if(!o)CC_I.set(C.cc,o={cc:C.cc,P:0,main:C.id,mp:0,reg:C.reg,cn:!!C.cn,nets:[]});o.P+=C.P;if(C.P>o.mp){o.mp=C.P;o.main=C.id;o.reg=C.reg;}if(C.cn)o.cn=true;}
    const L=locNets();for(let j=0;j<NETS.length;j++){const h=L[j];if(!h)continue;for(const k of h.cc){const o=CC_I.get(k);if(o)o.nets.push([j,NETS[j].share||0.001]);}}
    for(const o of CC_I.values()){const t=o.nets.reduce((a,x)=>a+x[1],0)||1;o.nets=o.nets.map(([j,w])=>[j,w/t]);}}
  return CC_I.get(cc)||null;}
// The country's own name in the player's language (Intl, as the pie's landing rights do).
const ccName=cc=>pieLicCountry(cc);
const ccPot=cc=>{const I=ccInfo(cc);return I?I.P*CNT_POT*eraMul()*CAT_T[S.cnt?S.cnt.cat:0].pot*cntMul('pot',cc):0;};
const ccLic=cc=>{const I=ccInfo(cc);return I?Math.round((8000+I.P*6)/1000)*1000:0;};
const ccWhy=cc=>{const I=ccInfo(cc);if(!I||!I.nets.length)return tr('streaming.nobody_sells_to_homes_here');if(I.cn)return tr('streaming.china_keeps_foreign_streaming_out');return '';};
const subsOf=g=>Math.round(g*CNT_SUBS);
const fmtSubs=g=>{const n=subsOf(g);return n>=1e6?(n/1e6).toFixed(n>=1e7?0:1)+'M':n>=1e3?Math.round(n/1e3)+'k':String(n);};
// Origins.
const dcSite=c=>!!(CITY[c]&&CITY[c].dc&&CITY[c].P>=DC_MIN_P&&!CITY[c].cn);
const dcLive=c=>{const d=S.cnt&&S.cnt.dc[c];return !!d&&d.ready<=S.day&&!!S.pops[c];};
const dcG=c=>DC_T[S.cnt.dc[c].t].g;
const dcMax=()=>1+Math.floor(lvl()/3);
const dcN=()=>Object.keys(S.cnt.dc).length;
const farF=km=>km<=CNT_FAR[0]?1:km>=CNT_FAR[1]?CNT_FAR[2]:1-(1-CNT_FAR[2])*(km-CNT_FAR[0])/(CNT_FAR[1]-CNT_FAR[0]);
// Boxes: who takes one, how much traffic they want to see first, and when they charge to host it.
const eyeNet=n=>!!n&&!!n.cc&&!n.fed;
const homeOf=n=>new Set(Array.isArray(n.cc)?n.cc:[n.cc]);
const boxMin=n=>n.pol==='open'?5:n.pol==='selective'?10:n.pol==='paid'?15:25;
const boxLv=n=>n.pol==='paid'?5:n.pol==='restrictive'?8:3;
// Free on its own terms (Must-Carry counts these), or for as long as a bundle with it runs (38-streaming-bundles.js).
const boxFreeOwn=n=>n.pol!=='paid'||paidFree(n)||!!(S.cnt&&S.cnt.free[n.id]);
const boxFree=n=>boxFreeOwn(n)||bundWith(n.id);
const boxHost=n=>boxFree(n)?0:Math.round((n.paidFee||8000)/4);
const boxNets=c=>{const C=CITY[c];return NETS.filter(n=>eyeNet(n)&&homeOf(n).has(C.cc)&&(n.pops||[]).includes(c));};
function boxWhy(c,id){const n=NET[id];if(!content()||!n||!eyeNet(n))return tr('streaming.not_an_eyeball_network');if(!S.pops[c])return tr('link_panels.build_a_pop_here_first');
  if(!homeOf(n).has(CITY[c].cc)||!(n.pops||[]).includes(c))return tr('streaming.net_has_no_homes_here',{net:esc(n.name)});
  if(lvl()<boxLv(n))return tr('streaming.net_takes_boxes_from_level_lv',{net:esc(n.name),lv:boxLv(n)});
  const D=S.cnt.disp;if(D&&D.net===id)return tr('streaming.not_while_you_are_in_a_dispute');
  if(S.cnt.box.filter(b=>b.city===c&&b.net===id).length>=BOX_MAX)return tr('streaming.that_s_as_many_as_they_have_room_for');
  if((R.demTo[id]||0)<boxMin(n))return tr('streaming.net_says_send_us_min_first',{net:esc(n.name),min:fmtG(boxMin(n))});return '';}
// What a box holds: less with a bigger catalogue, more with an origin on its continent, much more pre-filled for a premiere.
function boxHit(c){const C=S.cnt,reg=CITY[c].reg,near=Object.keys(C.dc).some(o=>dcLive(o)&&CITY[o].reg===reg),pr=premLive();
  return clamp(BOX_HIT+(near?BOX_NEAR:0)-0.03*C.cat+(pr&&pr.pf&&!pr.live?0.15:0),0.4,0.95);}
// What the box in a city actually holds tonight: its ceiling times how full it is, far less during a live event.
const boxHeld=(c,bs)=>{const pr=premLive(),f=bs.reduce((a,b)=>a+b.f,0)/bs.length,reg=CITY[c].reg;return boxHit(c)*f*(pr&&pr.live&&premIn(pr,reg)||evLiveAt(reg)?LIVE_HIT:1);};
// A dispute's grip, or its after-effects, on one network.
const cntCut=id=>{const C=S.cnt;if(!C)return 1;if(C.disp&&C.disp.net===id)return C.disp.cut;const h=C.heal&&C.heal[id];return h?h:1;};
// Premieres: live on their three nights, for one continent or the whole world.
const premLive=()=>{const p=S.cnt&&S.cnt.prem;return p&&S.day>=p.day&&S.day<p.day+PREM_DAYS?p:null;};
const premMul=p=>p.live?LIVE_MUL:PREM_MUL;
const premIn=(p,reg)=>!!p&&(p.reg==='ALL'||p.reg===reg);
/* compute(): the subscribers' evening, as flows. Each country's demand splits over its eyeball networks; the part a box of
   that network in that country holds starts at the box's city, the rest is shared out over the live origins nearest first,
   each up to its size. What no origin has room for is asked for and lost (R.cnt.short).
   Cold potato, as content networks run: what an origin serves rides your own backbone to your POP nearest the viewers
   (cntPop) and leaves the network there. The flows start at that POP; the haul from the origin is returned as jobs that
   compute() carries over the backbone before routing (cntHaul), and what the backbone has no room for is lost. A POP your
   backbone does not reach cannot take it: then it leaves at the origin, the long way round. */
const CNT_POP={k:'',m:new Map()};
function cntPop(cc,pops){const k=pops.join();if(CNT_POP.k!==k){CNT_POP.k=k;CNT_POP.m=new Map();}let v=CNT_POP.m.get(cc);
  if(v===undefined){const I=ccInfo(cc);v=null;let b=Infinity;for(const p of pops){const km=kmBetween(p,I.main);if(km<b||km===b&&p<v){b=km;v=p;}}CNT_POP.m.set(cc,v);}return v;}
const farO=km=>1-0.1*clamp((km-2000)/8000,0,1);
function cntFlows(R2,flow,DEMTO,reach,NF0){const C=S.cnt;if(!C)return null;const out={cc:{},short:0,org:{},haul:{}};R2.cnt=out;const jobs=[],pops=Object.keys(S.pops).filter(popUp).sort();
  const pr=premLive(),org=Object.keys(C.dc).filter(c=>dcLive(c)&&popUp(c)),room={};for(const o of org){room[o]=dcG(o);out.org[o]=0;}
  const bx={};for(const b of C.box){if(!popUp(b.city))continue;const k=CITY[b.city].cc+'|'+b.net;(bx[k]=bx[k]||[]).push(b);}
  const add=(c,j,x,ca)=>{if(x<=1e-9)return;flow(CIDX[c],j,x,ca,false);R2.cityDem[c]=(R2.cityDem[c]||0)+x;R2.demand+=x;DEMTO[j]+=x;};
  const need=[],pairs=[];
  for(const cc in C.cc){const I=ccInfo(cc);if(!I)continue;const D=C.cc[cc].d*Math.max(premIn(pr,I.reg)?premMul(pr):1,evMulAt(I.reg)),o={D,parts:[],short:0,miss:[]};out.cc[cc]=o;let rest=0;
    for(const [j,w] of I.nets){const x=D*w,bs=bx[cc+'|'+NETS[j].id];if(bs){const h=x*boxHeld(bs[0].city,bs),each=h/bs.length;for(const {city:c} of bs){add(c,j,each,true);o.parts.push([c,each,kmBetween(c,I.main),0]);}o.miss.push([j,x-h]);rest+=x-h;}
      else{o.miss.push([j,x]);rest+=x;}}
    o.rest=rest;need.push(cc);for(const og of org)pairs.push([kmBetween(og,I.main),cc,og]);}
  pairs.sort((a,b)=>a[0]-b[0]||(a[1]<b[1]?-1:a[1]>b[1]?1:0)||(a[2]<b[2]?-1:1));
  const left={};for(const cc of need)left[cc]=out.cc[cc].rest;
  for(const [km,cc,og] of pairs){const take=Math.min(left[cc],room[og]);if(take<=1e-9)continue;left[cc]-=take;room[og]-=take;out.org[og]+=take;const o=out.cc[cc],f=take/(o.rest||1);
    let v=cntPop(cc,pops);if(!v||v===og||!reach(og,v))v=og;const lo=NF0();
    for(const [j,x] of o.miss)add(v,j,x*f,false);o.parts.push([v,take,kmBetween(v,ccInfo(cc).main),km]);
    if(v!==og){jobs.push({o:og,v,x:take,lo,hi:NF0()});const h=out.haul[v]||(out.haul[v]={g:0,got:0});h.g+=take;}}
  for(const cc of need){const s=left[cc];if(s>1e-9){out.cc[cc].short=s;out.short+=s;R2.demand+=s;}delete out.cc[cc].miss;}
  return jobs;}
// How well a country is served: what reached it from each source, times how far that source is from its viewers.
// Where it leaves your network counts most; a far origin costs a little more start-up time on top.
function ccQ(r,cc){const o=r&&r.cnt&&r.cnt.cc[cc];if(!o||o.D<=1e-9)return 1;let q=0;for(const [c,x,km,ko] of o.parts)q+=x*sfOf(r,c)*farF(km)*farO(ko||0);return clamp(q/o.D,0,1);}
// Bundled subscribers pay the ISP's wholesale price: their share of a country earns the bundle's discount less.
function ccRev(r,cc){const d=S.cnt.cc[cc].d;let v=(d-Math.min(d,bundG(cc))*bundCut(cc))*ccQ(r,cc)*CNT_RATE*cntMul('rev',cc);for(const f of CNT_ADD)v+=f(r,cc);return v;}
function cntRev(r){const C=S.cnt;if(!C)return 0;let v=0;for(const cc in C.cc)v+=ccRev(r,cc);return v;}
function cntCost(){const C=S.cnt;if(!C)return 0;let m=CAT_T[C.cat].mo;for(const c in C.dc)m+=DC_T[C.dc[c].t].mo;
  for(const b of C.box){const n=NET[b.net];m+=BOX_MO+(n?boxHost(n):0);}for(const k in C.paid)m+=C.paid[k].fee;for(const f of CNT_COST)m+=f();return m;}
// On-net: what leaves through your boxes and over PNIs, of everything served.
const onNet=r=>r&&r.served>1e-6?((r.egT.c||0)+(r.egT.p||0))/r.served:0;
// Levels count the countries a streaming service is live in where a carrier counts POPs, and their continents.
const lvPlaces=()=>content()&&S.cnt?Object.keys(S.cnt.cc).length:Object.keys(S.pops).length;
/* What each level asks. A streaming service counts countries, and grows at home first: a second continent from level 6,
   the world only late (CNT_LV_REG), where a carrier needs three continents for level 4. */
const CNT_LV_CC=[0,2,4,6,9,12,15,19,24,30,36,42,48],CNT_LV_REG=[0,0,0,0,0,0,2,2,3,3,4,4,5];
const lvNeed=i=>{const q=LV_REQ[i];return content()?{pk:q.pk,pops:CNT_LV_CC[i],reg:CNT_LV_REG[i]}:{pk:q.pk,pops:q.pops,reg:lvReg(i)};};
const lvRegions=()=>content()&&S.cnt?new Set(Object.keys(S.cnt.cc).map(k=>ccInfo(k).reg)).size:regionsCount();
const subsAll=()=>S.cnt?Object.values(S.cnt.cc).reduce((a,x)=>a+x.d,0):0;
// Must-Carry: countries and continents where an eyeball network hosts your box for free.
function mcFree(){const cc=new Set(),reg=new Set();for(const b of S.cnt.box){const n=NET[b.net];if(!n||!boxFreeOwn(n)||!S.pops[b.city])continue;cc.add(CITY[b.city].cc);reg.add(CITY[b.city].reg);}return {cc:cc.size,reg:reg.size};}
const mustCarry=()=>{if(!content())return false;const f=mcFree();return f.cc>=MC_CC&&f.reg>=MC_REG&&!!S.cnt.premAll&&onNet(R)>=MC_ON;};
const disputeNet=()=>{const D=S.cnt&&S.cnt.disp;return D?D.net:null;};
// A day, after its routing (R is today's): subscribers come and go, origins open, premieres and disputes play out.
function cntDay(d){const C=S.cnt;if(!content()||!C)return;
  // An origin opens, or a bigger one takes over from the old (which served all along).
  for(const c in C.dc){const x=C.dc[c];if(x.up&&x.up.ready<=d){x.t=x.up.t;delete x.up;}else if(x.ready!==d||!x.t)continue;toast(tr('streaming.origin_in_city_is_live',{city:CITY[c].name,g:fmtG(DC_T[x.t].g)}),'goal',[],{a:'city',v:c});sfx('coin');}
  const G=CAT_T[C.cat].grow;
  for(const cc in C.cc){const x=C.cc[cc],q=ccQ(R,cc),P=ccPot(cc);
    if(q>=0.9)x.d+=CNT_GROW*G*q*x.d*Math.max(0,1-x.d/P)*cntMul('grow',cc);else x.d=Math.max(1,x.d*(1-(0.9-q)*0.05*cntMul('churn',cc)));}
  cntFillDay(d);cntPremDay(d);evDay(d);cntDispDay(d);cntDealDay(d);bundDay(d);for(const f of CNT_DAY)f(d);
  if(!C.won&&mustCarry()){C.won=d;track('win_mustcarry');toast(`<b>📺 ${tr('streaming.must_carry')}</b><br>${tr('streaming.no_network_can_drop_you_now')}`,'goal');sfx('coin');checkBadges();}}
function cntPremDay(d){const C=S.cnt,p=C.prem;
  if(!p){if(lvl()>=PREM_LV&&Object.keys(C.cc).length&&d>=C.premNext){const w={};for(const cc in C.cc){const r=ccInfo(cc).reg;w[r]=(w[r]||0)+C.cc[cc].d;}
      const reg=lvl()>=PREM_ALL_LV&&C.premOk%2===1?'ALL':Object.keys(w).sort((a,b)=>w[b]-w[a]||(a<b?-1:1))[0];
      const live=lvl()>=LIVE_LV&&C.premN%2===1;C.premN++;
      C.prem={day:d+leadDays(PREM_WARN),reg,n:hstr(S.asn+'|prem|'+d)%PREM_NAMES.length,pf:0,w:1,live:live?1:0};
      // A new series is new titles: every box has some filling to do before it airs.
      if(!live)for(const b of C.box)b.f=Math.max(FILL_NEW,b.f*0.85);
      if(live)toast(tr('streaming.live_announced',{show:tr(LIVE_NAMES[C.prem.n%LIVE_NAMES.length]),where:reg==='ALL'?tr('streaming.everywhere'):REG[reg],n:C.prem.day-d}),'goal',[{l:tr('common.show_me'),act:'leftTab',args:{t:'goals'}}]);
      else toast(tr('streaming.premiere_announced',{show:tr(PREM_NAMES[C.prem.n]),where:reg==='ALL'?tr('streaming.everywhere'):REG[reg],n:C.prem.day-d}),'goal',[{l:tr('common.show_me'),act:'leftTab',args:{t:'goals'}}]);}
    return;}
  if(d>=p.day&&d<p.day+PREM_DAYS){for(const cc in C.cc)if(premIn(p,ccInfo(cc).reg))p.w=Math.min(p.w,ccQ(R,cc));}
  if(d===p.day+PREM_DAYS-1){const ok=p.w>=PREM_OK,where=p.reg==='ALL'?tr('streaming.everywhere'):REG[p.reg];
    for(const cc in C.cc)if(premIn(p,ccInfo(cc).reg))C.cc[cc].d*=ok?1.06:0.95;
    if(ok){C.premOk++;if(p.reg==='ALL')C.premAll=1;toast(tr('streaming.premiere_went_without_buffering',{show:premShow(p),where}),'goal');sfx('coin');}
    else toast(tr('streaming.premiere_buffered',{show:premShow(p),where,p:pct(p.w)}),'bad');
    C.prem=null;C.premNext=d+45+hstr(S.asn+'|pnext|'+d)%31;}}
/* Disputes: an eyeball network that charges for peering, or a restrictive incumbent, wants paying once you send it a lot.
   Until you pay or win, its ports stop growing and your PNIs and boxes with it carry less each evening (down to DISP_CUT). Telling your viewers works better the
   more of that network's homes watch you. */
function cntLev(id){const n=NET[id];if(!n)return 0;let d=0,p=0;for(const k of homeOf(n)){if(!ccInfo(k))continue;p+=ccPot(k);if(S.cnt.cc[k])d+=S.cnt.cc[k].d;}return p>0?d/p:0;}
function cntDispDay(d){const C=S.cnt,D=C.disp;
  if(!D){if(lvl()<DISP_LV||!rule('market')||Math.random()>=1/DISP_ODDS)return;
    const cs=NETS.filter(n=>eyeNet(n)&&(n.pol==='paid'&&!paidFree(n)||n.pol==='restrictive')&&!C.free[n.id]&&!C.paid[n.id]&&!bundWith(n.id)&&(R.demTo[n.id]||0)>=DISP_MIN);if(!cs.length)return;
    const n=pick(cs);C.disp={net:n.id,fee:Math.max(5000,Math.round((R.demTo[n.id]||0)*60/1000)*1000),day:d,camp:0,cut:1};
    toast(tr('streaming.net_wants_paying2',{net:esc(n.name),fee:fmt$(C.disp.fee)}),'bad',[{l:tr('common.show_me'),act:'leftTab',args:{t:'goals'}}]);sfx('err');return;}
  // The ports stay as they were while your traffic grows: a little worse every evening.
  D.cut=Math.max(DISP_CUT,D.cut-DISP_DROP);
  if(D.camp&&d>=D.camp){const n=NET[D.net],ch=clamp(0.25+cntLev(D.net)*1.5,0.25,0.9);
    if(Math.random()<ch){C.free[D.net]=1;C.wins++;cntEnd();toast(tr('streaming.net_backs_down',{net:esc(n.name)}),'goal');sfx('coin');}
    else{D.camp=0;D.fee=Math.round(D.fee*1.5/1000)*1000;toast(tr('streaming.net_holds_out',{net:esc(n.name),fee:fmt$(D.fee)}),'bad');}}}
// A dispute ends: the ports get their upgrades, and quality comes back over a few days, not at once.
function cntEnd(){const C=S.cnt,D=C.disp;if(!D)return;if(D.cut<1)C.heal[D.net]=D.cut;C.disp=null;}
// Overnight fill: a box reached over your backbone from a live origin fills fast, one fed only by transit slowly, one
// with no way in not at all. Heal: ports freed after a dispute carry more each day.
function cntFillDay(d){const C=S.cnt,org=Object.keys(C.dc).filter(dcLive);
  for(const b of C.box){if(b.f>=1||!S.pops[b.city])continue;const bb=org.some(o=>o===b.city||linked(o,b.city));b.f=Math.min(1,b.f+(bb?FILL_NET:cntOut(b.city)?FILL_T:0));}
  for(const k of Object.keys(C.heal)){C.heal[k]+=DISP_HEAL;if(C.heal[k]>=1)delete C.heal[k];}}
// Two POPs your backbone joins (today's routing knows: the origin's traffic reaches it, or it has a path).
const linked=(a,b)=>!!(R&&R.cnt&&R.cnt.haul&&R.cnt.haul[b]&&R.cnt.haul[b].got>0)||S.links.some(l=>!linkDown(l)&&(l.a===a&&l.b===b||l.a===b&&l.b===a));
/* A paid deal runs a year. When it ends and your traffic still flows to them, they bill their new price: carrying on
   counts as taking it. Take your PNIs and boxes with them out before the end to walk away. */
function cntDealDay(d){const C=S.cnt;for(const id of Object.keys(C.paid)){const x=C.paid[id];if(x.until>d)continue;const n=NET[id];
  if(S.pni.some(p=>p.net===id)||C.box.some(b=>b.net===id)){x.fee=Math.round(x.fee*DEAL_UP/100)*100;x.until=d+DEAL_DAYS;toast(tr('streaming.deal_rolled_over',{net:esc(n.name),fee:fmt$(x.fee)}),'bad');}
  else{delete C.paid[id];toast(tr('streaming.deal_ended',{net:esc(n.name)}),'good');}}}
const CONTENT_GOALS=[
 {id:'ct_launch',t:tr('streaming.goal_launch'),d:tr('streaming.goal_launch_d'),r:10000,ok:()=>Object.keys(S.cnt.cc).length>0},
 {id:'ct_ix',t:tr('goals.join_an_internet_exchange'),d:tr('streaming.goal_ix_d'),r:7500,ok:()=>Object.keys(S.ixp).length>0},
 {id:'ct_pni',t:tr('streaming.goal_pni'),d:tr('streaming.goal_pni_d'),r:15000,ok:()=>S.pni.some(p=>pniOn(p)&&eyeNet(NET[p.net]))},
 {id:'ct_box',t:tr('streaming.goal_box'),d:tr('streaming.goal_box_d'),r:25000,ok:()=>S.cnt.box.length>0},
 {id:'ct_dc',t:tr('streaming.goal_dc'),d:tr('streaming.goal_dc_d'),r:100000,ok:()=>Object.keys(S.cnt.dc).some(c=>S.cnt.dc[c].t>0&&dcLive(c))},
 {id:'ct_cc5',t:tr('streaming.goal_cc5b'),d:tr('streaming.goal_cc5b_d'),r:50000,ok:()=>Object.keys(S.cnt.cc).length>=5},
 {id:'ct_prem',t:tr('streaming.goal_prem'),d:tr('streaming.goal_prem_d'),r:75000,ok:()=>S.cnt.premOk>0},
 {id:'ct_event',t:tr('streaming.goal_event'),d:tr('streaming.goal_event_d'),r:100000,ok:()=>S.cnt.evOk>0},
 {id:'ct_on50',t:tr('streaming.goal_on50'),d:tr('streaming.goal_on50_d'),r:100000,ok:()=>R.served>=50&&onNet(R)>=0.5},
 {id:'ct_cont3',t:tr('streaming.goal_cont3'),d:tr('streaming.goal_cont3_d'),r:150000,ok:()=>new Set(Object.keys(S.cnt.cc).filter(k=>ccQ(R,k)>=0.9).map(k=>ccInfo(k).reg)).size>=3},
 {id:'ct_disp',t:tr('streaming.goal_disp'),d:tr('streaming.goal_disp_d'),r:150000,ok:()=>S.cnt.wins>0},
 {id:'ct_mc',t:tr('streaming.must_carry'),d:tr('streaming.goal_mc_d',{cc:MC_CC,reg:MC_REG,p:Math.round(MC_ON*100)+'%'}),r:0,mc:true,ok:()=>mustCarry()},
];
// Saves: only a Streaming service keeps S.cnt, and everything in it is checked here.
function cntSanitize(s){if(s.charter!=='content'){delete s.cnt;return;}const c0=s.cnt&&typeof s.cnt==='object'?s.cnt:{},o={},n=(v,d)=>Number.isFinite(+v)?+v:d;
  o.cc={};if(c0.cc&&typeof c0.cc==='object')for(const k of Object.keys(c0.cc).slice(0,250)){const x=c0.cc[k];if(ccInfo(k)&&!ccWhy(k)&&x&&typeof x==='object')o.cc[k]={d:clamp(n(x.d,1),0,1e6),since:Math.round(n(x.since,0))};}
  o.dc={};if(c0.dc&&typeof c0.dc==='object')for(const k of Object.keys(c0.dc).slice(0,20)){const x=c0.dc[k];if(isCity(k)&&s.pops[k]&&x&&typeof x==='object'&&(k===s.home||dcSite(k)))o.dc[k]={t:clamp(Math.round(n(x.t,0)),0,DC_T.length-1),ready:Math.round(n(x.ready,0))};const u=x.up;if(u&&typeof u==='object'&&o.dc[k].t<DC_T.length-1)o.dc[k].up={t:o.dc[k].t+1,ready:Math.round(n(u.ready,0))};}
  if(s.pops[s.home]&&!o.dc[s.home])o.dc[s.home]={t:0,ready:0};
  o.box=[];if(Array.isArray(c0.box))for(const b of c0.box.slice(0,2000))if(b&&isCity(b.city)&&s.pops[b.city]&&NET[b.net]&&eyeNet(NET[b.net]))o.box.push({id:String(b.id==null?uid():b.id).slice(0,40),city:b.city,net:b.net,day:Math.round(n(b.day,0)),f:clamp(n(b.f,1),0,1)});
  o.cat=clamp(Math.round(n(c0.cat,0)),0,CAT_T.length-1);
  const p=c0.prem;o.prem=p&&typeof p==='object'&&(p.reg==='ALL'||own(REG,p.reg))?{day:Math.round(n(p.day,0)),reg:p.reg,n:clamp(Math.round(n(p.n,0)),0,PREM_NAMES.length-1),pf:p.pf?1:0,w:clamp(n(p.w,1),0,1),live:p.live?1:0}:null;
  o.premNext=Math.round(n(c0.premNext,(s.day||0)+60));o.premOk=Math.max(0,Math.round(n(c0.premOk,0)));o.premAll=c0.premAll?1:0;
  const D=c0.disp;o.disp=D&&typeof D==='object'&&NET[D.net]?{net:D.net,fee:clamp(Math.round(n(D.fee,5000)),0,1e8),day:Math.round(n(D.day,0)),camp:Math.round(n(D.camp,0)),cut:clamp(n(D.cut,DISP_CUT),DISP_CUT,1)}:null;
  o.free={};o.paid={};o.heal={};if(c0.free&&typeof c0.free==='object')for(const id of Object.keys(c0.free).slice(0,400))if(NET[id])o.free[id]=1;
  if(c0.paid&&typeof c0.paid==='object')for(const id of Object.keys(c0.paid).slice(0,400)){if(!NET[id])continue;const x=c0.paid[id],fee=typeof x==='object'&&x?x.fee:x;o.paid[id]={fee:clamp(Math.round(n(fee,0)),0,1e8),until:Math.round(n(x&&x.until,(s.day||0)+DEAL_DAYS))};}
  if(c0.heal&&typeof c0.heal==='object')for(const id of Object.keys(c0.heal).slice(0,400))if(NET[id])o.heal[id]=clamp(n(c0.heal[id],1),DISP_CUT,1);
  o.premN=Math.max(0,Math.round(n(c0.premN,0)));
  o.wins=Math.max(0,Math.round(n(c0.wins,0)));o.won=Math.max(0,Math.round(n(c0.won,0)));bundSanitize(c0,o,s);evSanitize(c0,o,s);for(const f of CNT_SAN)f(c0,o,s);s.cnt=o;}
