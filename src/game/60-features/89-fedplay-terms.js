/* ================= MULTIPLAYER GAMEPLAY: published policies, rate cards and the announce =================
   docs/plans/federation.md, "Published policies and rate cards". Every player publishes their terms in their announce
   (§5.1): a peering policy and its conditions, a rate card (transit, PNIs, ports on an exchange they run) and how each
   kind of request is handled (auto, review, decline). Requests are checked against those terms, so deals happen while
   the other player is asleep. Computer-run transit is the price ceiling; money never moves between saves.
   S.fedp = null | {pol, cond, rates, auto, rpki (this network filters routes with RPKI), mine (its last announces:
   [{id, t, body}], to judge offers made on them), annH/annAt/annTr (what was last announced), rq (offers waiting for
   review: [{id, rec}]), cons (consortium projects seen), str (players whose traffic reaches you without a deal),
   leakD (real day of the last shared-leak look), help (times a swap partner carried your traffic), ment and heard (the
   mentor dividend, 89-fedplay-mentor.js)}. */
const FEDP_DEALS=['peering','transit','pni','swap','consortium','port','wave'],FEDP_WG=[100,400,800,1600],FEDP_TERMS=[30,90,180,365],FEDP_RATIO=[100,200,300,500,1000,100000],
  FEDP_RPKI_MO=1500,FEDP_RQ_MAX=32,FEDP_CONS_MAX=24,FEDP_STR_MAX=8,FEDP_LEAK=12,FEDP_SPEEDS=[1000,10000,100000],
  // Business traffic that is content going out (hosting, streaming, games, clouds); the rest is enterprise.
  FEDP_CONTENT=['host','stream','game','cgame','esport','metav','ingest','onramp','gpu','ai','hyper','mtrain','agi'];
function fedPNew(){return {pol:'open',cond:{minMbps:0,maxRatio:300,minShared:1,rpki:false,tier1:false,ai:true},rates:{},
  auto:{peering:'auto',transit:'review',pni:'review',swap:'review',consortium:'review',port:'review',wave:'review'},rpki:false,mine:[],annH:0,annAt:0,annTr:0,rq:[],cons:[],str:[],leakD:0,help:0,ment:[],heard:[]};}
const fedP=(s=S)=>s.fedp||(s.fedp=fedPNew());
const fedInt=(v,lo,hi,d)=>Number.isSafeInteger(v)&&v>=lo&&v<=hi?v:d;
// A rate card checked part by part (the same limits as §5.1): what does not check is left out.
function fedRatesClean(r){const o={};if(!r||typeof r!=='object')return o;const M=v=>fedInt(v,0,1e12,null),D=v=>fedInt(v,1,3650,null);
  const ports=l=>{if(!Array.isArray(l))return null;const p=l.filter(x=>x&&fedInt(x.mbps,1,1e9,0)&&M(x.monthly)!==null).map(x=>({mbps:x.mbps,monthly:x.monthly})).sort((a,b)=>a.mbps-b.mbps);
    const u=p.filter((x,i)=>!i||x.mbps>p[i-1].mbps).slice(0,8);return u.length?u:null;};
  const t=r.transit;if(t&&M(t.perGbps)!==null&&D(t.term)){const c=(Array.isArray(t.commit)?t.commit:[]).filter(x=>x&&fedInt(x.mbps,1,1e9,0)&&fedInt(x.off,0,900,null)!==null).map(x=>({mbps:x.mbps,off:x.off})).sort((a,b)=>a.mbps-b.mbps);
    o.transit={perGbps:t.perGbps,commit:c.filter((x,i)=>!i||x.mbps>c[i-1].mbps).slice(0,8),term:t.term};}
  const p=r.pni;if(p&&M(p.setup)!==null&&D(p.term)&&ports(p.ports))o.pni={setup:p.setup,ports:ports(p.ports),term:p.term};
  const x=r.ix;if(x&&ports(x.ports)&&['anyone','selective','approval'].includes(x.join))o.ix={ports:ports(x.ports),join:x.join};
  // Waves: routes once each, cities in byte order (a < b), at most 32; sizes the four wave sizes, ascending.
  const w=r.wave;if(w&&D(w.term)&&Array.isArray(w.routes)&&Array.isArray(w.sizes)){
    const rs=[...new Set(w.routes.filter(x=>x&&fedCityOk(x.a)&&fedCityOk(x.b)&&x.a<x.b).map(x=>x.a+'|'+x.b))].sort().slice(0,32).map(k=>{const [a,b]=k.split('|');return {a,b};});
    const sz=FEDP_WG.map(g=>w.sizes.find(x=>x&&x.gbps===g&&M(x.monthly)!==null)).filter(Boolean).map(x=>({gbps:x.gbps,monthly:x.monthly}));
    if(rs.length&&sz.length)o.wave={routes:rs,sizes:sz,term:w.term};}
  return o;}
function fedCondClean(c){const d=fedPNew().cond;if(!c||typeof c!=='object')return d;
  return {minMbps:fedInt(c.minMbps,0,1e9,0),maxRatio:fedInt(c.maxRatio,100,100000,300),minShared:fedInt(c.minShared,0,64,0),rpki:c.rpki===true,tier1:c.tier1===true,ai:c.ai!==false};}
function fedAutoClean(a,pol){const o={};for(const k of FEDP_DEALS)o[k]=a&&['auto','review','decline'].includes(a[k])?a[k]:fedPNew().auto[k];
  // A restrictive network chooses its peers itself: peering requests always wait for review.
  if(pol==='restrictive'&&o.peering==='auto')o.peering='review';return o;}
// Repairs S.fedp from a save (sanitize). Null stays null: only a save that joined has terms.
function fedpSanitize(s){
  s.fedn=s.fedn==null?null:fednClean(s.fedn);
  const v=s.fedp;if(v==null||typeof v!=='object'||Array.isArray(v)){s.fedp=null;fedpLinks(s);return;}
  const o=fedPNew();o.pol=['open','selective','restrictive'].includes(v.pol)?v.pol:'open';o.cond=fedCondClean(v.cond);o.rates=fedRatesClean(v.rates);o.auto=fedAutoClean(v.auto,o.pol);
  o.rpki=v.rpki===true;o.annH=fedInt(v.annH,0,4294967295,0);o.annAt=fedInt(v.annAt,0,1e11,0);o.annTr=fedInt(v.annTr,0,4e9,0);o.leakD=fedInt(v.leakD,0,1e7,0);o.help=fedInt(v.help,0,1e6,0);
  if(Array.isArray(v.mine))o.mine=v.mine.filter(x=>x&&!FdId(x.id)&&fedInt(x.t,0,1e11,null)!==null&&x.body&&typeof x.body==='object'&&!fedValues(x.body)&&fedSize(fedCanon(x.body))<=16384&&!FED_BODY.announce(fedOwn(x.body,'box')?x.body:{...x.body,box:FED_NOBOX},{rec:{t:x.t},asn:x.body.asn})).slice(0,3);
  if(Array.isArray(v.rq))o.rq=v.rq.filter(x=>x&&!FdId(x.id)&&x.rec&&typeof x.rec==='object'&&!fedValues(x.rec)&&!fedEnv(x.rec,{offer:1})&&!FED_OFFER(x.rec.body,{rec:x.rec})).slice(0,FEDP_RQ_MAX).map(x=>({id:x.id,rec:x.rec}));
  if(Array.isArray(v.cons))o.cons=v.cons.filter(x=>x&&!FdId(x.id)&&!FdK(x.k)&&!FdName(x.name)&&own(CITY,x.a)&&own(CITY,x.b)&&x.a!==x.b&&fedInt(x.m,2,16,0)&&fedInt(x.sh,0,1e12,null)!==null&&fedInt(x.pr,1,16,0)&&Array.isArray(x.sg)&&fedInt(x.t,0,1e11,null)!==null)
    .slice(0,FEDP_CONS_MAX).map(x=>({id:x.id,k:x.k,name:fedSafeName(x.name),a:x.a,b:x.b,m:x.m,sh:x.sh,pr:x.pr,sg:[...new Set(x.sg.filter(k=>!FdK(k)))].slice(0,16),t:x.t,st:['open','funded','gone'].includes(x.st)?x.st:'open',me:x.me===true}));
  if(Array.isArray(v.str))o.str=v.str.filter(x=>x&&!FdK(x.k)&&fedInt(x.mbps,0,2e9,null)!==null).slice(0,FEDP_STR_MAX).map(x=>({k:x.k,mbps:x.mbps}));
  fedMentorClean(o,v);
  s.fedp=o;fedpLinks(s);}
// Deals keep only what this file reads, as plain values (the common part is checked by fedSanitize); links that come
// from deals stay only while their deal runs: a swap partner's restoration wave, a wave bought from a player.
function fedpLinks(s){
  if(s.fed&&Array.isArray(s.fed.deals))for(const d of s.fed.deals){if(!['wait','run','over'].includes(d.st))d.st=d.start===null?'wait':'run';
    if(!['buy','sell','peer'].includes(d.role))d.role='peer';d.on=d.on===true&&d.st==='run';d.rep=fedInt(d.rep,0,2e9,0);if(typeof d.why!=='string')d.why='';}
  const on=(id,k)=>!!(s.fed&&Array.isArray(s.fed.deals)&&s.fed.deals.some(d=>d.id===id&&d.on&&(!k||d.deal===k&&d.role==='buy')));
  s.links=s.links.filter(l=>(!l.fsw||on(l.fsw))&&(!l.fwv||on(l.fwv,'wave')));}

/* ---------- this network as others see it ---------- */
// The share of this network's traffic that is content, eyeballs and enterprise (per mille, summing to 1000).
function fedMyMix(){if(FEDN.mixR===R&&FEDN.mixS===S&&FEDN.mix)return FEDN.mix;FEDN.mixR=R;FEDN.mixS=S;return FEDN.mix=fedMixNow();}
function fedMixNow(){const e=Object.values((R&&R.cityEye)||{}).reduce((a,b)=>a+b,0);let c=0,b=0;
  for(const x of S.biz){const T=BIZ_T[x.type];if(!T||T.l2||T.fiber)continue;if(FEDP_CONTENT.includes(x.type))c+=x.bw;else b+=x.bw;}
  const t=e+c+b;if(!(t>0))return {content:0,eyeball:1000,enterprise:0};
  const content=Math.round(c*1000/t),eyeball=Math.min(1000-content,Math.round(e*1000/t));return {content,eyeball,enterprise:1000-content-eyeball};}
const fedMyIx=()=>[...new Set(Object.keys(S.ixp).map(ixCity))].filter(c=>S.pops[c]);
const fedCityOk=c=>/^[a-z0-9]{2,8}$/.test(c);
// The rate card as published: the exchange part only while this network runs one (its cities).
function fedRatesOut(P){const r=JSON.parse(JSON.stringify(P.rates||{}));const my=Object.keys(S.myIx).filter(fedCityOk).slice(0,16);
  if(r.ix){if(my.length)r.ix.at=my;else delete r.ix;}
  // Waves only on routes still lit today.
  if(r.wave){const lit=new Set(fedWaveLit());r.wave.routes=r.wave.routes.filter(x=>lit.has(x.a+'|'+x.b));if(!r.wave.routes.length)delete r.wave;}
  return r;}
// This network's announce body (§5.1) now.
async function fedAnnBody(s=S){const f=s.fed,P=fedP(s),pops=Object.keys(s.pops).filter(fedCityOk).slice(0,512),m=fedMyMix(),inM=Math.min(1e9,Math.round(((R&&R.served)||0)*1000));
  const nm=String(s.name||'').replace(/[‪-‮⁦-⁩\u0000-\u001f]/g,'').slice(0,40);
  const b={name:/[^ ]/.test(nm)?nm:'AS'+(await fedAsn(f.key.pub)),asn:await fedAsn(f.key.pub),box:await fedBoxPub(f.key.priv),home:CITY[s.home]?CITY[s.home].cc:'ZZ',day:Math.min(1e7,s.day),founded:Math.min(f.joined,fedDiv(fedNow(),FED_DAY)),
    pops,ix:fedMyIx().filter(c=>pops.includes(c)),cust:Math.min(1e7,s.biz.length),mix:m,
    traffic:{in:inM,out:Math.min(1e9,Math.round(inM*(m.content+m.enterprise*0.5+m.eyeball*0.15)/1000))},policy:P.pol,rates:fedRatesOut(P),auto:fedAutoClean(P.auto,P.pol)};
  if(P.pol==='selective')b.cond=fedCondClean(P.cond);
  return b;}
/* Announces this network when it changed (its shape: POPs, exchanges, terms), when its traffic moved by a fifth and an
   hour went by, or as a daily heartbeat; force: the terms were just saved. Keeps its last three announces to judge
   offers made on them. */
async function fedAnnounceMaybe(force){const s=S,f=s&&s.fed;if(!f||!f.on||!fedHasPriv(f)||!fedEligible(s))return false;
  const b=await fedAnnBody(s);if(S!==s)return false;const P=fedP(s),now=fedNow(),tr=b.traffic.in+b.traffic.out;
  const shape=hstr(fedCanon({...b,day:0,cust:0,founded:0,traffic:{in:0,out:0}})),big=Math.abs(tr-P.annTr)>0.2*Math.max(1000,P.annTr);
  if(!force&&shape===P.annH&&!(big&&now-P.annAt>=3600)&&now-P.annAt<FED_DAY)return false;
  const r=await fedSignMine('announce',b,f),id=await fedId(r);if(S!==s)return false;
  fedQueue(r,f);P.annH=shape;P.annAt=r.t;P.annTr=Math.min(4e9,tr);P.mine=[{id,t:r.t,body:b},...P.mine.filter(x=>x.id!==id)].slice(0,3);fedSaved();return true;}

/* ---------- conditions: what a deal still misses ---------- */
/* How this network and player network n get on today: traffic exchanged (Mbps: what my customers ask of it, and the
   other way by the two mixes), the ratio (×100, as cond.maxRatio), shared exchanges, and where both have POPs. */
function fedPair(n){const dem=(R&&R.demTo&&R.demTo[n.id])||0,inM=Math.round(dem*1000),m=fedMyMix(),outM=Math.round(inM*(m.content+100)/((n.fmix?n.fmix[0]:0)+100));
  const ix=fedMyIx().filter(c=>(n.fix||[]).includes(c)),pops=Object.keys(S.pops).filter(c=>(n.fpops||[]).includes(c));
  return {in:inM,out:outM,mbps:Math.max(inM,outM),ratio:Math.min(100000,Math.round(Math.max(inM,outM)*100/Math.max(1,Math.min(inM,outM)))),ix,pops,shared:ix.length};}
/* What published conditions still miss: [{l, n}] (l a kind, n how much more). o: {mbps, ratio, shared, rpki, tier1, ai}
   of the network asking. */
function fedCondMiss(cond,o){const m=[];if(!cond)return m;
  if(o.mbps<cond.minMbps)m.push({l:'mbps',n:cond.minMbps-o.mbps});
  if(o.ratio>cond.maxRatio)m.push({l:'ratio',n:Math.round(cond.maxRatio/100)});
  if(o.shared<cond.minShared)m.push({l:'shared',n:cond.minShared-o.shared});
  if(cond.rpki&&!o.rpki)m.push({l:'rpki'});if(cond.tier1&&!o.tier1)m.push({l:'tier1'});if(!cond.ai&&o.ai)m.push({l:'ai'});
  return m;}
const FEDP_MISS={newcomer:N_('fedplay.miss_newcomer'),mbps:N_('fedplay.miss_mbps'),ratio:N_('fedplay.miss_ratio'),shared:N_('fedplay.miss_shared'),rpki:N_('fedplay.miss_rpki'),tier1:N_('fedplay.miss_tier1'),ai:N_('fedplay.miss_ai'),
  ix:N_('fedplay.miss_ix'),pop:N_('fedplay.miss_pop'),ends:N_('fedplay.miss_ends'),gear:N_('fedplay.miss_gear'),room:N_('fedplay.miss_room'),terms:N_('fedplay.miss_terms'),declines:N_('fedplay.miss_declines'),quiet:N_('fedplay.miss_quiet'),link:N_('fedplay.miss_link'),myix:N_('fedplay.miss_myix'),excluded:N_('fedplay.miss_excluded')};
const fedMissText=m=>m.map(x=>tr(FEDP_MISS[x.l],{n:x.n})).join(' · ');
// What this game knows of itself for someone else's conditions.
const fedMeFor=n=>{const p=fedPair(n);return {mbps:p.mbps,ratio:p.ratio,shared:p.shared,rpki:!!(S.fedp&&S.fedp.rpki),tier1:(()=>{try{return tierLabel()==='Tier 1';}catch(e){return false;}})(),ai:!!S.fed.ai};};

/* ---------- money: each game books only its own side ---------- */
// The cheapest computer-run transit per Gbps and month at a city: the ceiling no player's price should beat.
function fedCeil(c){let lo=Infinity;for(const n of NETS)if(!n.fed&&sellsAt(n,c))lo=Math.min(lo,transitPerG(n,c,false)*S.priceMul);return lo;}
// The highest price this network may publish: the dearest of the cheapest computer-run transit at its POPs.
function fedCeilMine(){let hi=0;for(const c of Object.keys(S.pops)){const v=fedCeil(c);if(v<Infinity)hi=Math.max(hi,v);}return Math.max(1,Math.ceil(hi||10));}
/* What deals with players cost and earn per month (computeMoney): transit at the published price on the committed
   volume or what crossed, whichever is more (a seller counts what the buyer reported, signed); PNIs, exchange ports
   and waves their monthly price; RPKI filtering its upkeep. Setup fees are paid once, when the deal starts. */
function fedMoney(C,V,R2){const f=S.fed;let c=S.fedp&&S.fedp.rpki?FEDP_RPKI_MO:0,v=0;
  if(f)for(const d of f.deals){if(!d.on)continue;const T=d.terms;
    if(d.deal==='transit'){const use=d.role==='buy'?fedExUse(d,R2):(d.rep||0)/1000,g=Math.max((T.mbps||0)/1000,use),m=g*(T.perGbps||0);if(d.role==='buy')c+=m;else v+=m;}
    else if(d.deal==='pni'||d.deal==='port'||d.deal==='wave'){const m=T.monthly||0;if(d.role==='buy')c+=m;else if(d.role==='sell')v+=m;}}
  if(c>0)C.fed=c;if(v>0)V.fed=v;}
// Gbps a deal's own exits carried (R.useT / R.usePni keys 'fed:<deal id>…').
function fedExUse(d,R2=R){let g=0;if(!R2)return 0;const k='fed:'+d.id;for(const T of [R2.useT,R2.usePni])for(const x in T)if(x===k||x.startsWith(k+':'))g+=T[x]||0;return g;}
