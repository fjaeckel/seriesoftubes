/* ---------- Binge Boxes the way real embedded caches work (37-streaming.js) ----------
   A streamer does not build a POP in every town: the ISP racks the cache in its own building and the streamer fills it
   overnight over a PNI or an exchange session with that ISP (or, slowly, over transit). So a box can go into an eyeball
   ISP in any city where it sells homes (boxNets). With a POP of yours there it is a rank-0 exit as it always was; without
   one it sits inside the ISP: its hits are served right there, never touch your backbone and take no router port.
   For the long tail of small ISPs, a box at an exchange where you have a port (S.cnt.xbox: {id,ix,day,f}) serves every
   member you have a session with (route server or bilateral), for their viewers in that country, at XBOX_F of an
   embedded box's hit ratio, and only ISPs with no embedded box of yours in that country.
   Neither kind is routed. cntFlows asks boxInStart() what each one serves (that much is demand, served, and kept out of
   the flows), and compute() adds it to R after routing (cntInPost): served, peered, egT (c inside an ISP, ix at an
   exchange), netEg and R.useCache. Its part in R.cnt.cc[cc].parts has a fifth field, 1, which ccQ() counts as served in
   full: no citySrv of a city you have no POP in. */
const XBOX_F=0.6,XBOX_COST=30000,XBOX_MO=1200,XBOX_LV=4;
CNT_NEW.push(o=>{o.xbox=[];});
// The ISP serves homes in this city's country and has a building here: it can rack a box.
const boxHosts=(c,id)=>{const n=NET[id];return !!n&&!!CITY[c]&&homeOf(n).has(CITY[c].cc)&&(n.pops||[]).includes(c);};
// Every box, inside ISPs and at exchanges (premieres, catalogues and pre-fills empty or fill them all).
const boxAll=()=>S.cnt?S.cnt.box.concat(S.cnt.xbox||[]):[];
const xboxMo=()=>((S.cnt&&S.cnt.xbox)||[]).length*XBOX_MO;
// Networks you can fill a box over without transit: a live PNI, or a session on any exchange you are on.
function boxPeers(){const s=new Set();for(const p of S.pni)if(pniOn(p))s.add(p.net);for(const x in S.ixp)for(const id of ixSessions(x))s.add(id);return s;}
const boxFillRate=(id,P)=>P.has(id)?FILL_NET:S.transit.length?FILL_T:0;
// Why a box cannot go into this ISP in a city with no POP of yours ('' when it can): it would never fill.
const boxInWhy=id=>boxFillRate(id,boxPeers())?'':tr('streaming_boxes.no_way_to_fill',{net:esc(NET[id].name)});
// An exchange box serves while its port is up (an exchange outage silences it too).
const xbLive=x=>S.ixp[x]!==undefined&&!(S.ev.ixdown&&S.ev.ixdown[x]>S.day)&&(popUp(ixCity(x))||isRemote(x));
// The home ISPs of the exchange's country you have a session with there.
const xbNets=x=>{const I=ccInfo(CITY[ixCity(x)].cc),s=ixSessions(x);return I?I.nets.map(([j])=>NETS[j]).filter(n=>s.has(n.id)):[];};
function xboxWhy(x){if(!content()||!isIx(x))return tr('streaming.not_a_streaming_service');if(S.ixp[x]===undefined)return tr('streaming_boxes.get_a_port_first',{ix:esc(ixName(x))});
  if(lvl()<XBOX_LV)return tr('streaming_boxes.from_level_lv',{lv:XBOX_LV});
  if(S.cnt.xbox.filter(b=>b.ix===x).length>=BOX_MAX)return tr('streaming.that_s_as_many_as_they_have_room_for');
  if(!xbNets(x).length)return tr('streaming_boxes.nobody_takes_your_routes_here');return '';}
/* compute(), from cntFlows: what boxes outside routing serve tonight. box() for a box inside an ISP with no POP of yours
   (up to its size, less in a dispute; returns what it served, the rest is a miss), ix() for a network's part of a country
   that the exchange boxes there hold. Each adds to the demand and to DEMTO as a flow would. */
function boxInStart(out,DEMTO,R2){const C=S.cnt,ins=out.ins={c:0,ix:0,net:{},use:{}},xs={};
  for(const b of C.xbox){if(!xbLive(b.ix))continue;const ct=ixCity(b.ix),L=xs[CITY[ct].cc]||(xs[CITY[ct].cc]=[]);let g=L.find(g=>g.ix===b.ix);
    if(!g)L.push(g={ix:b.ix,city:ct,bs:[],room:0,ses:null,h:-1});g.bs.push(b);g.room+=BOX_G;}
  const put=(k,j,x,o,c,I)=>{ins[k]+=x;const a=ins.net[j]||(ins.net[j]=[0,0]);a[k==='c'?0:1]+=x;DEMTO[j]+=x;R2.demand+=x;o.parts.push([c,x,kmBetween(c,I.main),0,1]);};
  return {
    box:(b,j,want,o,I)=>{const x=Math.min(want,BOX_G*cntCut(b.net));if(!(x>1e-9))return 0;put('c',j,x,o,b.city,I);ins.use[b.id]=(ins.use[b.id]||0)+x;return x;},
    ix:(cc,j,want,o,I)=>{const L=xs[cc];if(!L)return 0;const id=NETS[j].id;let need=-1,got=0;
      for(const g of L){if(g.room<=1e-9)continue;if(!g.ses)g.ses=ixSessions(g.ix);if(!g.ses.has(id))continue;
        if(g.h<0)g.h=boxHeld(g.city,g.bs)*XBOX_F;if(need<0)need=want*g.h*cntCut(id);const t=Math.min(need,g.room);if(!(t>1e-9))continue;
        g.room-=t;need-=t;got+=t;put('ix',j,t,o,g.city,I);for(const b of g.bs)ins.use[b.id]=(ins.use[b.id]||0)+t/g.bs.length;}
      return got;}};}
// After routing: what the boxes outside it served joins R as if it had left through them.
function cntInPost(R2){const ins=R2.cnt&&R2.cnt.ins;if(!ins||!(ins.c+ins.ix>0))return;const g=ins.c+ins.ix;R2.served+=g;R2.peered+=g;
  if(ins.c>0)R2.egT.c=(R2.egT.c||0)+ins.c;if(ins.ix>0)R2.egT.ix=(R2.egT.ix||0)+ins.ix;
  for(const j in ins.net){const id=NET_IDS[+j],a=ins.net[j],ne=R2.netEg[id]||(R2.netEg[id]={c:0,p:0,ix:0,t:0});ne.c+=a[0];ne.ix+=a[1];}
  for(const id in ins.use)R2.useCache[id]=(R2.useCache[id]||0)+ins.use[id];}
// Overnight: boxes inside ISPs without a POP of yours fill over peering or transit; exchange boxes over your backbone or transit.
CNT_DAY.push(()=>{const C=S.cnt,org=Object.keys(C.dc).filter(dcLive);if(!org.length)return;let P=null;
  for(const b of C.box){if(b.f>=1||S.pops[b.city])continue;P=P||boxPeers();b.f=Math.min(1,b.f+boxFillRate(b.net,P));}
  for(const b of C.xbox){if(b.f>=1||!xbLive(b.ix))continue;const ct=ixCity(b.ix);b.f=Math.min(1,b.f+(org.some(o=>o===ct||linked(o,ct))?FILL_NET:FILL_T));}});
CNT_SAN.push((c0,o)=>{o.xbox=[];if(Array.isArray(c0.xbox))for(const b of c0.xbox.slice(0,500))if(b&&isIx(b.ix)&&isCity(ixCity(b.ix)))
  o.xbox.push({id:String(b.id==null?uid():b.id).slice(0,40),ix:b.ix,day:Math.round(Number.isFinite(+b.day)?+b.day:0),f:clamp(Number.isFinite(+b.f)?+b.f:1,0,1)});});
