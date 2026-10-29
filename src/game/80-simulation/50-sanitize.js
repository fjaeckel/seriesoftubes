const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const isCity=c=>typeof c==='string'&&own(CITY,c),isIx=x=>typeof x==='string'&&(own(CITY,x)||own(XIXM,x)),isNet=n=>typeof n==='string'&&own(NET,n);
const num=(v,d=0)=>{v=+v;return Number.isFinite(v)?v:d;},int=(v,lo,hi,d)=>{v=Math.round(num(v,d));return Math.min(hi,Math.max(lo,v));};
/* Saves come from localStorage or from imported files, so treat them as untrusted: fill in anything
   missing, drop references to cities, networks or types that do not exist, and force numbers to be numbers. */
function sanitize(s){
  const arr=k=>{if(!Array.isArray(s[k]))s[k]=[];},obj=k=>{if(!s[k]||typeof s[k]!=='object'||Array.isArray(s[k]))s[k]={};};
  ['links','nni','transit','pni','caches','biz','offers','inc','usedNames','loans','loanOffers','hist','log'].forEach(arr);
  ['pops','ixp','rs','peers','myIx','done','ev','stats','ixn','ixPref','ixSite','confReg','ach','pairMet'].forEach(obj);
  s.v=1;s.name=String(s.name==null?'Packet Pals':s.name).slice(0,24);s.day=int(s.day,0,1e7,0);s.cash=num(s.cash,0);s.asn=int(s.asn,1,4294967294,200000);
  s.priceMul=num(s.priceMul,1);s.nextFail=num(s.nextFail,s.day+45);s.nextEvent=num(s.nextEvent,s.day+40);s.lvl=int(s.lvl,1,LEVELS.length,1);s.neg=int(s.neg,0,1e7,0);s.loanStrikes=int(s.loanStrikes,0,1e3,0);
  for(const k of Object.keys(s.stats)){const v=s.stats[k];if(k==='by'||k==='f'){if(!v||typeof v!=='object')s.stats[k]={};else for(const j of Object.keys(v))v[j]=num(v[j],0);}else if(typeof v!=='boolean')s.stats[k]=num(v,0);}
  for(const k of ['survived','incidents','peak'])s.stats[k]=num(s.stats[k],0);
  for(const c of Object.keys(s.pops)){const p=s.pops[c];if(!isCity(c)||!p||typeof p!=='object'){delete s.pops[c];continue;}p.routers=int(p.routers,1,RMAX,1);if(p.rupDay!==undefined)p.rupDay=num(p.rupDay,-1);if(p.rgen!==undefined)p.rgen=int(p.rgen,0,RG.length-1,0);p.down=num(p.down,0);if(p.bb&&typeof p.bb==='object')p.bb.d=num(p.bb.d,0);else p.bb=null;}
  if(!isCity(s.home))s.home=Object.keys(s.pops)[0]||'fra';
  const tier=v=>int(v,0,PORT.length-1,0),lag=v=>int(v,1,LAG_MAX,1),sid=v=>String(v==null?uid():v).slice(0,40);
  s.links=s.links.filter(l=>l&&isCity(l.a)&&isCity(l.b)&&l.a!==l.b).map(l=>{l.id=sid(l.id);l.km=num(l.km,kmBetween(l.a,l.b));l.mo=num(l.mo,0);l.cut=num(l.cut,0);if(l.pairs!==undefined)l.pairs=Math.min(l.sub?SUB_PAIRS_MAX:s.lvl>=PAIRS_LV?PAIRS_BIG:PAIRS_MAX,Math.max(1,Math.floor(+l.pairs)||1));if(l.kind!=='df'&&l.kind!=='vxc')l.kind='wave';if(l.kind==='wave')l.tier=int(l.tier,0,LT.length-1,0);if(l.cable&&!own(CAB,l.cable))l.cable=null;if(l.kind==='vxc'&&!own(VXC,l.vt))l.vt=0;if(l.kind==='df'){if(!own(DF_SYS,l.sys))l.sys='lite';l.ch=Array.isArray(l.ch)?l.ch.filter(o=>own(OPT,o)):[];l.ready=num(l.ready,0);for(const k of Object.keys(SUB_UPGRADES)){const f='sub'+k;if(l[f]!==undefined){if(l.own&&l.sub&&Number.isFinite(l[f])&&l[f]>=0)l[f]=Math.round(l[f]);else delete l[f];}}if(l.seaPath!==undefined){if(l.own&&l.sub&&Array.isArray(l.seaPath)&&l.seaPath.length>=2&&l.seaPath.length<=2048&&l.seaPath.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90))l.seaPath=l.seaPath.map(p=>p.slice());else delete l.seaPath;}if(l.paid!==undefined){if(l.own&&l.sub&&Number.isFinite(l.paid)&&l.paid>=0)l.paid=Math.round(l.paid);else delete l.paid;}if(l.own&&l.sub&&!own(SEA_DESIGNS,l.seaDesign))l.seaDesign='standard';l.regen=int(l.regen,0,REGEN_MAX,0);}const deg=v=>v&&typeof v==='object'?{until:num(v.until,0),f:Math.min(1,Math.max(0,num(v.f,1)))}:null;if(l.loss)l.loss=deg(l.loss);return l;});
  for(const l of s.links)repairSubUpgradeDates(l,s.day);
  /* Metrics moved from each link to its city pair (#122). Older saves routed a pair at the lowest metric of its
     links, with all of them carrying traffic, so the pair keeps that metric and nothing goes on standby. */
  {const pm=s.pairMet,lo={};for(const l of s.links){if(l.metric!==undefined){const k=edgeKey(l),m=own(MET,l.metric)?l.metric:'normal';if(!lo[k]||MET[m].f<MET[lo[k]].f)lo[k]=m;}if(l.standby!==true)delete l.standby;}
   for(const l of s.links){const k=edgeKey(l);if(lo[k]&&l.metric===undefined)lo[k]='normal';delete l.metric;}
   for(const k in lo)pm[k]=lo[k];const ks=new Set(s.links.map(edgeKey));for(const k of Object.keys(pm))if(!ks.has(k)||!own(MET,pm[k])||pm[k]==='normal')delete pm[k];}
  const degO=v=>v&&typeof v==='object'?{until:num(v.until,0),f:Math.min(1,Math.max(0,num(v.f,1)))}:null;
  s.transit=s.transit.filter(t=>t&&isCity(t.city)&&isNet(t.net)).map(t=>(t.lacp=degO(t.lacp),t.site=['a','b','ab'].includes(t.site)?t.site:'a',t.id=sid(t.id),t.tier=tier(t.tier),t.n=lag(t.n),t.down=num(t.down,0),t.clean=!!t.clean,t.carry===true||delete t.carry,t.premium=premOnlyAt(NET[t.net],t.city)||!!t.premium&&premCity(NET[t.net],t.city),t));
  s.pni=s.pni.filter(x=>x&&isCity(x.city)&&isNet(x.net)).map(x=>(x.lacp=degO(x.lacp),x.site=['a','b','ab'].includes(x.site)?x.site:'a',x.id=sid(x.id),x.tier=tier(x.tier),x.n=lag(x.n),x.sacrif=!!x.sacrif,x));
  // PNIs on order (#…): delivery day, a pending augment, and 1G for the one network that sells it
  for(const x of s.pni){if(x.ready!==undefined)x.ready=num(x.ready,0);if(x.g1)x.g1=x.tier===0&&x.net==='dtk'?true:undefined;else delete x.g1;if(x.up){const u=x.up;x.up=u&&typeof u==='object'?{tier:tier(u.tier),n:lag(u.n),ready:num(u.ready,0),g1:!!u.g1&&x.net==='dtk'&&tier(u.tier)===0}:undefined;if(!x.up)delete x.up;}}
  // Supply chain: a shortage and a price lock, both optional.
  {const H=s.hw&&typeof s.hw==='object'&&!Array.isArray(s.hw)?s.hw:{},o={};const sh=H.shock,lk=H.lock;
   if(sh&&typeof sh==='object'&&own(HW_SHOCK,sh.k))o.shock={k:sh.k,until:num(sh.until,0),mul:clamp(num(sh.mul,1),1,2)};
   if(lk&&typeof lk==='object')o.lock={until:num(lk.until,0),mul:clamp(num(lk.mul,1),1,HW_CAP)};s.hw=o;}
  {const I=s.inbox&&typeof s.inbox==='object'&&!Array.isArray(s.inbox)?s.inbox:{},o=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{},str=(v,n)=>String(v==null?'':v).slice(0,n);
   const items=(Array.isArray(I.items)?I.items:[]).filter(x=>x&&typeof x==='object'&&(x.k==='req'||x.k==='mp')&&typeof x.ix==='string'&&isIx(x.ix)&&(x.net===undefined||isNet(x.net))&&(x.net!==undefined||typeof x.nm==='string')).slice(0,INBOX_MAX).map(x=>({id:int(x.id,0,1e9,0),k:x.k,ix:x.ix,net:x.net,nm:x.net?undefined:str(x.nm,40),asn:x.net?undefined:int(x.asn,1,4294967294,64512),day:num(x.day,0),stale:!!x.stale,yrs:int(x.yrs,1,30,1),say:int(x.say,0,REQ_SAY.length-1,0),bump:x.bump?1:undefined,key:x.k==='mp'?str(x.key,80):undefined,lim:x.k==='mp'?int(x.lim,1,1e7,100):undefined,got:x.k==='mp'?int(x.got,1,1e7,100):undefined,leak:x.k==='mp'?!!x.leak:undefined}));
   const down={};for(const [k,v] of Object.entries(o(I.down)))if(typeof k==='string'&&k.length<80)down[k]=num(v,0);
   const tiny={};for(const [k,v] of Object.entries(o(I.tiny)).slice(0,200))if(/^\d{1,10}$/.test(k)&&v&&typeof v==='object'&&isIx(v.ix))tiny[k]={nm:str(v.nm,40),ix:v.ix,stale:!!v.stale};
   const log=(Array.isArray(I.log)?I.log:[]).filter(e=>e&&typeof e==='object'&&typeof e.m==='string').slice(0,40).map(e=>{const a={};for(const [k,v] of Object.entries(o(e.a)).slice(0,6))a[str(k,12)]=typeof v==='number'?v:str(v,60);return {d:num(e.d,0),m:str(e.m,200),a};});
   s.inbox={items,down,tiny,rep:clamp(num(I.rep,0),-10,5),bot:!!I.bot,pol:PPOL.includes(I.pol)?I.pol:'open',log,seq:Math.max(int(I.seq,0,1e9,0),...items.map(x=>x.id))};}
  {const sp={};if(s.spares&&typeof s.spares==='object')for(const k in s.spares)if(own(OPT,k)){const v=Math.floor(+s.spares[k]);if(v>0)sp[k]=Math.min(999,v);}s.spares=sp;}
  s.caches=s.caches.filter(x=>x&&isCity(x.city)&&isNet(x.net)&&NET[x.net].cache).map(x=>(x.id=sid(x.id),x.site=x.site==='b'&&s.pops[x.city]&&s.pops[x.city].site2?'b':'a',x));
  for(const c of Object.keys(s.ixp)){if(!isIx(c))delete s.ixp[c];else s.ixp[c]=tier(s.ixp[c]);}
  for(const k of ['rs','ixn','ixPref','ixSite'])for(const c of Object.keys(s[k]))if(!isIx(c))delete s[k][c];if(s.ixCut&&typeof s.ixCut==='object'){for(const c of Object.keys(s.ixCut))if(!isIx(c))delete s.ixCut[c];else s.ixCut[c]=Math.min(1,Math.max(0.6,num(s.ixCut[c],1)));}else delete s.ixCut;
  for(const c of Object.keys(s.ixn))s.ixn[c]=lag(s.ixn[c]);for(const c of Object.keys(s.ixSite))if(!['a','b','ab'].includes(s.ixSite[c]))s.ixSite[c]='a';
  for(const k of Object.keys(s.peers)){const [n,c]=k.split('@');if(!isNet(n)||!isIx(c))delete s.peers[k];}
  for(const c of Object.keys(s.myIx)){const m=s.myIx[c];if(!isCity(c)||!m||typeof m!=='object'){delete s.myIx[c];continue;}m.members=Array.isArray(m.members)?m.members.filter(isNet):[];m.name=String(m.name||tr('common.your_ix')).slice(0,40);m.next=num(m.next,s.day);m.fab=int(m.fab,0,MYIX_FAB.length-1,0);}
  const okBiz=b=>b&&own(BIZ_T,b.type)&&(!BIZ_T[b.type].nni||own(FAB,b.prov))&&isCity(b.city)&&(!b.city2||isCity(b.city2))&&(!b.sites||Array.isArray(b.sites)&&b.sites.every(isCity));
  const fixBiz=b=>{b.id=sid(b.id);b.name=String(b.name||tr('common.customer')).slice(0,80);b.bw=num(b.bw,1);b.rate=num(b.rate,0);if(b.fee!==undefined)b.fee=num(b.fee,0);if(b.start!==undefined)b.start=num(b.start,0);if(b.dur!==undefined)b.dur=num(b.dur,1);if(b.slots!==undefined)b.slots=num(b.slots,0);if(b.what!==undefined)b.what=String(b.what).slice(0,200);if(b.broker!==undefined)b.broker=!!b.broker;if(!Array.isArray(b.reqs))b.reqs=[];b.reqs=b.reqs.filter(r=>own(REQS,r));if(b.mood!==undefined)b.mood=num(b.mood,100);if(b.pm!==undefined)b.pm=num(b.pm,b.mood||100);if(b.exp!==undefined)b.exp=num(b.exp,0);if(b.latMax!=null)b.latMax=num(b.latMax,10);if(b.route&&!own(RT,b.route))b.route='normal';if(b.due!==undefined)b.due=num(b.due,0);if(b.win!==undefined)b.win=num(b.win,180);if(b.live!==undefined)b.live=!!b.live;if(b.link!==undefined&&typeof b.link!=='string')delete b.link;return b;};
  {const ids=new Map(s.links.map(l=>[l.id,l]));s.biz=s.biz.filter(okBiz).map(b=>unpackBiz(fixBiz(b),ids));}s.offers=s.offers.filter(okBiz).map(fixBiz);
  // Sponsorships and capacity conferences (#168): registrations are true or 'sp', the glow and the pending deals are checked.
  for(const k of Object.keys(s.confReg))s.confReg[k]=s.confReg[k]==='sp'?'sp':!!s.confReg[k];
  if(s.conf){const c=s.conf;if(typeof c!=='object'||!own(REG,c.reg))s.conf=null;else s.conf={until:num(c.until,0),reg:c.reg,name:String(c.name||'').slice(0,40),sp:!!c.sp};}
  s.capDeal=s.capDeal&&typeof s.capDeal==='object'&&own(CAP_ROUTES,s.capDeal.c)?{at:num(s.capDeal.at,0),c:s.capDeal.c}:null;
  s.inc=s.inc.filter(i=>i&&typeof i.type==='string').map(i=>(i.id=sid(i.id),i.until=num(i.until,s.day),i.cost=num(i.cost,0),i.msg=String(i.msg||'').slice(0,400),i.fix=i.fix==null?undefined:String(i.fix).slice(0,60),i));
  s.loans=s.loans.filter(l=>l&&own(BANKS,l.bank));for(const l of s.loans){if(l.model!==undefined&&!['balloon','storm','transit','astro'].includes(l.model))delete l.model;for(const k of ['apr0','cut','share'])if(l[k]!==undefined&&!isFinite(+l[k]))delete l[k];if(!Array.isArray(l.covs))l.covs=[];l.covs=l.covs.filter(c=>own(COVS,c));}s.loanOffers=s.loanOffers.filter(l=>l&&own(BANKS,l.bank));
  s.usedNames=[...new Set(s.usedNames.filter(x=>typeof x==='string'))];s.log=s.log.filter(e=>e&&typeof e.t==='string').slice(0,LOG_KEEP).map(e=>{const o=e.o&&typeof e.o==='object'&&LOG_OPEN.includes(e.o.a)?(e.o.a==='bank'||e.o.a==='inbox'?{a:e.o.a}:typeof e.o.v==='string'&&e.o.v.length<=64&&(e.o.a!=='city'||isCity(e.o.v))&&(e.o.a!=='tab'||LOG_TABS.includes(e.o.v))?{a:e.o.a,v:e.o.v}:null):null;
    return {id:typeof e.id==='string'&&e.id.length<=40?e.id:uid(),d:num(e.d,0),t:e.t.slice(0,600),h:typeof e.h==='string'?e.h.slice(0,200):'',k:LOG_KINDS.includes(e.k)?e.k:'',at:Number.isFinite(+e.at)?+e.at:0,o,n:int(e.n,1,9999,1)};});
  // One scrubbing center became a list (#117): older saves carry theirs over.
  if(!Array.isArray(s.scrubs))s.scrubs=s.scrubAt&&isCity(s.scrubAt)?[{city:s.scrubAt,tier:s.scrubTier}]:[];delete s.scrubAt;delete s.scrubTier;
  {const seen=new Set();s.scrubs=s.scrubs.filter(x=>x&&typeof x==='object'&&isCity(x.city)&&s.pops[x.city]&&!seen.has(x.city)&&seen.add(x.city)).map(x=>({city:x.city,tier:int(x.tier,0,SCRUB_TIERS.length-1,0)}));}
  s.scrubMode=s.scrubMode==='ondemand'?'ondemand':'always';
  if(s.ev&&s.ev.ddos){const a=s.ev.ddos;
    if(!a||typeof a!=='object'||!isCity(a.city)||!own(DDOS_VEC,a.vec))delete s.ev.ddos;
    else{a.gbps=num(a.gbps,2);a.until=num(a.until,s.day);a.bh=!!a.bh;a.ixbh=!!a.ixbh;a.start=num(a.start,s.day);
      if(!a.entry||typeof a.entry!=='object')a.entry={k:'edge',lab:''};else{a.entry.lab=String(a.entry.lab||'').slice(0,60);a.entry.id=a.entry.id==null?undefined:String(a.entry.id).slice(0,40);}}}
  s.auV=s.auV===1?1:0;if(s.auNews!==true)delete s.auNews;
  if(s.merged){const o={};if(typeof s.merged==='object')for(const m of MERGERS)if(isFinite(s.merged[m.id]))o[m.id]=+s.merged[m.id];s.merged=Object.keys(o).length?o:undefined;}
  if(s.te){if(typeof s.te!=='object')s.te=null;else{s.te.on=!!s.te.on;s.te.script=typeof s.te.script==='string'?s.te.script.slice(0,4000):'';}}
  return s;}
function migrate(s){sanitize(s);
  // Older saves have one contract per broker sale: fold a carrier's alien waves on one fiber into one contract.
  {const one=new Map();s.biz=s.biz.filter(b=>{if(b.type!=='wwave')return true;const k=b.link+'|'+b.name,a=one.get(k);if(!a){one.set(k,b);return true;}
    a.slots=(a.slots||0)+(b.slots||0);a.rate=(a.rate||0)+(b.rate||0);a.since=Math.min(a.since??0,b.since??0);a.mood=Math.min(a.mood??100,b.mood??100);a.folded=true;return false;});
   for(const a of one.values())if(a.folded){delete a.folded;const l=s.links.find(x=>x.id===a.link);if(l)a.what=wwWhat(l,a.slots);}}if(s.scn&&s.scn.id==='stg'&&s.scn.rules&&typeof s.scn.rules==='object')s.scn.rules.local=true;for(const b of [...s.biz,...s.offers])if(Array.isArray(b.reqs))b.reqs=b.reqs.filter(k=>!REQS[k]||!REQS[k].can||(isCity(b.city)&&(!b.city2||isCity(b.city2))&&REQS[k].can(b,s)));if(s.ltv!==2){for(const l of s.links)if(l.kind==='wave'&&l.tier>=3)l.tier=Math.min(LT.length-1,l.tier+1);s.ltv=2;}if(s.dk){s.dk.m=s.dk.m||{};s.dk.add=s.dk.add||{};s.dk.ret=s.dk.ret||{};s.dk.retUsed=s.dk.retUsed||{};}s.hist=s.hist||[];s.loans=s.loans||[];s.loanOffers=s.loanOffers||[];s.loanStrikes=s.loanStrikes||0;for(const l of s.links||[])if(!l.kind)l.kind='wave';
  for(const c in s.pops){const p=s.pops[c];if(p.rgen===undefined){let g=0;const need=(i,key)=>{const k=RG.findIndex(r=>r[key]>=i);if(k>g)g=k;};
    for(const l of s.links||[])if((l.a===c||l.b===c)&&l.kind==='wave')need(l.tier,'maxLT');
    for(const t of s.transit||[])if(t.city===c)need(t.tier,'maxP');for(const x of s.pni||[])if(x.city===c)need(x.tier,'maxP');if(s.ixp&&s.ixp[c]!==undefined)need(s.ixp[c],'maxP');p.rgen=g;}}for(const b of s.biz||[])if(!b.reqs)b.reqs=BIZ_T[b.type]&&BIZ_T[b.type].div?['diverse']:[];for(const o of s.offers||[])if(!o.reqs)o.reqs=[];if(!s.lvl)s.lvl=1;s.nni=s.nni||[];s.cnLic=s.cnLic||{state:'none'};s.ev=s.ev||{};for(const l of s.links){if(!l.kind)l.kind='wave';if(l.mo===undefined)l.mo=Math.round(waveMo(l.km,l.sub,l.tier)*(l.mult||1));}for(const c in s.pops){if(!s.pops[c].routers)s.pops[c].routers=1;}
  {const all=NETS.map(n=>n.id),seen=Array.isArray(s.seen)?s.seen.filter(x=>typeof x==='string'):null,fresh=seen?all.filter(id=>!seen.includes(id)):all;
    if(fresh.length&&(s.day||0)>0){const g=s.grace&&s.grace.until>s.day?s.grace:{nets:[]};s.grace={until:s.day+GRACE_DAYS,nets:[...new Set(g.nets.concat(fresh))],fresh:seen?fresh.length:0};}
    s.seen=all;}
  // Australian pricing and peering changed in place (#148): a save that was already there gets told once.
  if(s.auV!==1){if((s.day||0)>0&&Object.keys(s.pops).some(c=>CITY[c].au))s.auNews=true;s.auV=1;}
  if(s.grace&&(typeof s.grace!=='object'||!isFinite(s.grace.until)||!Array.isArray(s.grace.nets)))s.grace=null;if(s.grace)s.grace.nets=s.grace.nets.filter(isNet);
  return s;}
