/* ---------- Reselling your own fiber, on the side: the resale desk (37-hyper.js) ----------
   A Hyperscaler sells cloud products, nothing else, with one exception: spare glass on fiber it built itself (its own
   dark fiber builds and cables, l.own; never fiber it leases, never someone else's waves). Real hyperscalers do this
   with spare pairs and spectrum on the cables they fund. Two products, to carriers only, through rare offers at the
   resale desk, Glass Half Full Wholesale (S.hs.rs.o):
   - a spare fiber pair as an IRU: a pair in the trench you are not lighting, for a 10 to 20 year term, a sum up front
     (about two years of what leasing that pair would cost) and then a small monthly fee for operations and maintenance,
     as real IRUs are priced. A pair sold is never lit by you (addPair refuses it).
   - a managed wave on your own line system, carved out of capacity you lit: it comes off what your own replication and
     training get on that fiber, as the fiber panel's "Sold as managed waves" (mwG()).
   Both become carrier customers (dfpair, mwave) that renew, and that pay well below what the same capacity earns
   carrying tenants. They never count toward levels, goals or Cloud Nine (which count users, regions and traffic between
   regions), and never are IP transit or an L2VPN. The capacity market of the other charters (cmDay) does not trade a
   Hyperscaler's fiber: this desk does. Other players still buy waves, swaps and consortium seats through the deals.
   S.hs.rs: o (offers: id, l the fiber, k iru|w, g wave Gbps, n the carrier, up paid at signing, mo a month, exp),
   nx (the earliest day of the next offer), mo (the month the intern last asked about your Spare Pair Affair). */
const HSR_DESK='Glass Half Full Wholesale',HSR_CUT=0.9,HSR_EXP=21;
const HSR_ASK=[N_('hyper_resale.ask_sure'),N_('hyper_resale.ask_forever'),N_('hyper_resale.ask_photons'),N_('hyper_resale.ask_mum')];
// Carriers only: never a cloud, never a tenant.
const hsrBuyers=()=>WAVECO.concat(BIZ_T.mwave.names);
const hsrOwn=l=>!!l&&l.kind==='df'&&!!l.own&&l.ready<=S.day;
const hsrIru=l=>S.biz.filter(b=>b.type==='dfpair'&&b.link===l.id).length;
// Pairs in the trench you do not light and have not sold (a pair already leased out counts as gone too).
const hsrPairs=l=>hsrOwn(l)&&!(l.cut>S.day)&&pairFree(l)?Math.max(0,pairsMax(l)-Math.max(1,l.pairs|0)-hsrIru(l)):0;
// Wave sizes this fiber can carve out tonight: an optic that big, and that much lit capacity your traffic is not using.
const hsrWaveG=l=>hsrOwn(l)&&!(l.cut>S.day)&&!(l.eqDown>S.day)?CM_W.map(p=>CM_G[p]).filter(g=>cmOptG(l)>=g&&cmFreeG(l,0)>=g):[];
// What a carrier pays: the capacity market's list price for the route today, less the desk's cut.
function hsrPrice(l,k,g){const r=cmRoute(l.a,l.b,[l]),m=mkt()*HSR_CUT;
  return k==='iru'?{up:Math.round(cmUpList(r)*m),mo:Math.max(1,Math.round(cmList(r,'iru')*m))}:{up:0,mo:Math.max(1,Math.round(cmList(r,cmWP(g))*m))};}
const hsrWhat=o=>{const l=S.links.find(x=>x.id===o.l);return l?(o.k==='iru'?cmWhat(l,'iru',1):cmWhat(l,cmWP(o.g),1)):'';};
// Whether an offer can still be signed: '' or why not.
function hsrWhy(o){const l=S.links.find(x=>x.id===o.l);if(!hsrOwn(l))return tr('hyper_resale.not_yours');
  if(o.k==='iru')return hsrPairs(l)>0?'':tr('hyper_resale.no_spare_pair');return hsrWaveG(l).includes(o.g)?'':tr('hyper_resale.no_room_wave',{g:fmtCap(o.g)});}
// A carrier calls the desk: a spare pair now and then, a wave more often, on one of your own fibers.
function hsrSpawn(d){const H=S.hs,ls=S.links.filter(l=>hsrOwn(l)&&!H.rs.o.some(o=>o.l===l.id)).sort((a,b)=>a.id<b.id?-1:1),q='rs|'+d;
  const cand=ls.map(l=>({l,p:hsrPairs(l),g:hsrWaveG(l)})).filter(x=>x.p>0||x.g.length);if(!cand.length)return false;
  const x=cand[Math.floor(hsRvU(q+'|l')*cand.length)],iru=x.p>0&&(!x.g.length||hsRvU(q+'|k')<0.35),g=iru?0:x.g[Math.floor(hsRvU(q+'|g')*Math.min(2,x.g.length))];
  const used=new Set(S.biz.filter(b=>b.link===x.l.id).map(b=>b.name)),names=hsrBuyers().filter(n=>!used.has(n)),n=names[Math.floor(hsRvU(q+'|n')*names.length)]||hsrBuyers()[0];
  const P=hsrPrice(x.l,iru?'iru':'w',g),o={id:uid(),l:x.l.id,k:iru?'iru':'w',g,n,up:P.up,mo:P.mo,exp:d+HSR_EXP};H.rs.o.push(o);
  toast(`🥂 ${tr('hyper_resale.offer',{desk:HSR_DESK,name:esc(n),what:esc(hsrWhat(o)),price:fmt$(o.mo)})}${o.up?' '+tr('hyper_resale.offer_up',{up:fmt$(o.up)}):''}`,'',[{l:tr('common.open'),act:'selLink',args:{id:x.l.id}}]);return true;}
// Signing: the carrier becomes a customer on that fiber (a dark pair, or a managed wave off your lit capacity).
function hsrSell(o){const l=S.links.find(x=>x.id===o.l),t=o.k==='iru'?'dfpair':'mwave';
  const b=clSign(offerCustomer({id:uid(),city:l.a,city2:l.b,link:l.id,slots:t==='mwave'?1:0,what:hsrWhat(o),name:o.n,type:t,bw:1,rate:o.mo,reqs:[],exp:S.day+1}));
  if(t==='mwave')b.g=o.g;b.gh=1;S.biz.push(b);CM_V++;if(o.up)S.cash+=o.up;S.hs.rs.o=S.hs.rs.o.filter(x=>x!==o);return b;}
/* A day: offers expire, now and then a carrier calls, and once a month the intern asks about your Spare Pair Affair. */
function hsrDay(d){const H=S.hs;if(!H||!H.rs)return;const V=H.rs;V.o=V.o.filter(o=>o.exp>d&&S.links.some(l=>l.id===o.l));
  if(d>=V.nx&&V.o.length<2&&hsDirAsk('resale')){hsrSpawn(d);V.nx=d+45+Math.floor(hsRvU('rsn|'+d)*45);}
  const m=monthIdx(d);if(V.mo!==m){V.mo=m;const b=S.biz.find(x=>x.type==='dfpair'&&x.gh),o=V.o.find(x=>x.k==='iru');
    if(b||o){const l=S.links.find(x=>x.id===(b?b.link:o.l));if(l)toast(`🧑‍💼 ${tr(HSR_ASK[m%HSR_ASK.length],{name:esc(b?b.name:o.n),a:CITY[l.a].name,b:CITY[l.b].name})}`,'');}}}
// The money resold glass brings in a month (the card), and how much of a fiber's capacity is sold as waves.
const hsrIncome=()=>S.biz.filter(b=>b.gh&&(b.type==='dfpair'||b.type==='mwave')).reduce((a,b)=>a+(b.rate||0),0);
CX_DAY.push(hsrDay);
CX_NEW.push(o=>{o.rs={o:[],nx:S.day+60,mo:-1};});
CX_SAN.push((h0,o,s)=>{const n=(v,d)=>Number.isFinite(+v)?+v:d,I=v=>Math.round(n(v,0)),obj=v=>v&&typeof v==='object'&&!Array.isArray(v),V=obj(h0.rs)?h0.rs:{},ids=new Set();
  const r={o:[],nx:V.nx===undefined?I(s.day)+60:I(V.nx),mo:Math.round(n(V.mo,-1))};
  if(Array.isArray(V.o))for(const x of V.o.slice(0,4)){if(!obj(x)||typeof x.id!=='string'||!x.id||ids.has(x.id))continue;const l=(s.links||[]).find(y=>y.id===x.l);if(!l||l.kind!=='df'||!l.own)continue;
    const k=x.k==='iru'?'iru':'w',g=k==='iru'?0:CM_W.map(p=>CM_G[p]).includes(+x.g)?+x.g:100;ids.add(x.id);
    r.o.push({id:x.id.slice(0,40),l:x.l,k,g,n:typeof x.n==='string'&&x.n?x.n.slice(0,60):WAVECO[0],up:Math.max(0,I(x.up)),mo:Math.max(1,I(x.mo)),exp:I(x.exp)});}
  o.rs=r;for(const b of s.biz||[])if(b&&b.gh!==undefined){if(b.gh&&(b.type==='dfpair'||b.type==='mwave'))b.gh=1;else delete b.gh;}});
