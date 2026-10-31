const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const isCity=c=>typeof c==='string'&&own(CITY,c),isIx=x=>typeof x==='string'&&(own(CITY,x)||own(XIXM,x)),isNet=n=>typeof n==='string'&&own(NET,n);
const num=(v,d=0)=>{v=+v;return Number.isFinite(v)?v:d;},int=(v,lo,hi,d)=>{v=Math.round(num(v,d));return Math.min(hi,Math.max(lo,v));};
/* Saves come from localStorage or from imported files, so treat them as untrusted: fill in anything
   missing, drop references to cities, networks or types that do not exist, and force numbers to be numbers. */
function sanitize(s){
  // A puzzle is never saved; a save that says otherwise is played as a normal game.
  if(s.mode==='puzzle')s.mode='normal';delete s.pz;
  const arr=k=>{if(!Array.isArray(s[k]))s[k]=[];},obj=k=>{if(!s[k]||typeof s[k]!=='object'||Array.isArray(s[k]))s[k]={};};
  ['links','nni','transit','pni','caches','biz','offers','inc','usedNames','loans','loanOffers','hist','log'].forEach(arr);
  ['pops','ixp','rs','peers','myIx','done','ev','stats','ixn','ixPref','ixSite','confReg','ach','pairMet'].forEach(obj);
  s.v=1;s.name=String(s.name==null?'Packet Pals':s.name).slice(0,24);s.day=int(s.day,0,1e7,0);s.cash=num(s.cash,0);s.asn=int(s.asn,1,4294967294,200000);
  s.priceMul=num(s.priceMul,1);s.nextFail=num(s.nextFail,s.day+45);s.nextEvent=num(s.nextEvent,s.day+40);s.lvl=int(s.lvl,1,LEVELS.length,1);s.neg=int(s.neg,0,1e7,0);s.loanStrikes=int(s.loanStrikes,0,1e3,0);
  for(const k of Object.keys(s.stats)){const v=s.stats[k];if(k==='by'||k==='f'){if(!v||typeof v!=='object')s.stats[k]={};else for(const j of Object.keys(v))v[j]=num(v[j],0);}else if(typeof v!=='boolean')s.stats[k]=num(v,0);}
  for(const k of ['survived','incidents','peak'])s.stats[k]=num(s.stats[k],0);
  // The chaos monkey (2.0): saves without one get their first visit scheduled on the next day tick.
  {const m=s.monkey&&typeof s.monkey==='object'&&!Array.isArray(s.monkey)?s.monkey:{},on=m.on?1:0,o={next:m.next==null?null:int(m.next,0,1e7,s.day+90),on};
   if(on){o.start=int(m.start,0,s.day,s.day);o.until=int(m.until,o.start,o.start+400,s.day+30);o.snip=int(m.snip,0,1e7,s.day+3);o.n=int(m.n,0,1e4,0);o.hurt=int(m.hurt,0,o.n,0);o.c=isCity(m.c)?m.c:isCity(s.home)?s.home:null;}
   s.monkey=o;}
  for(const c of Object.keys(s.pops)){const p=s.pops[c];if(!isCity(c)||!p||typeof p!=='object'){delete s.pops[c];continue;}p.routers=int(p.routers,1,RMAX,1);if(p.rupDay!==undefined)p.rupDay=num(p.rupDay,-1);if(p.rgen!==undefined)p.rgen=int(p.rgen,0,RG.length-1,0);p.down=num(p.down,0);if(p.bb&&typeof p.bb==='object')p.bb.d=num(p.bb.d,0);else p.bb=null;}
  if(!isCity(s.home))s.home=Object.keys(s.pops)[0]||'fra';
  opsSanitize(s);
  const tier=v=>int(v,0,PORT.length-1,0),lag=v=>int(v,1,LAG_MAX,1),sid=v=>String(v==null?uid():v).slice(0,40);
  s.links=s.links.filter(l=>l&&isCity(l.a)&&isCity(l.b)&&l.a!==l.b).map(l=>{l.id=sid(l.id);if(l.list!==undefined){const L=l.list;if(l.kind==='df'&&L&&typeof L==='object'&&!Array.isArray(L)){const w=int(L.w,0,256,0),p=int(L.p,0,2,0);if(w||p)l.list={w,p};else delete l.list;}else delete l.list;}l.km=num(l.km,kmBetween(l.a,l.b));l.mo=num(l.mo,0);l.cut=num(l.cut,0);if(l.pairs!==undefined)l.pairs=Math.min(l.sub?SUB_PAIRS_MAX:s.lvl>=PAIRS_LV?PAIRS_BIG:PAIRS_MAX,Math.max(1,Math.floor(+l.pairs)||1));if(l.kind!=='df'&&l.kind!=='vxc')l.kind='wave';if(l.kind==='wave')l.tier=int(l.tier,0,LT.length-1,0);if(l.cable&&!own(CAB,l.cable))l.cable=null;if(l.kind==='vxc'&&!own(VXC,l.vt))l.vt=0;if(l.kind==='df'){if(!own(DF_SYS,l.sys))l.sys='lite';l.ch=Array.isArray(l.ch)?l.ch.filter(o=>own(OPT,o)):[];l.ready=num(l.ready,0);for(const k of Object.keys(SUB_UPGRADES)){const f='sub'+k;if(l[f]!==undefined){if(l.own&&l.sub&&Number.isFinite(l[f])&&l[f]>=0)l[f]=Math.round(l[f]);else delete l[f];}}if(l.seaPath!==undefined){if(l.own&&l.sub&&Array.isArray(l.seaPath)&&l.seaPath.length>=2&&l.seaPath.length<=2048&&l.seaPath.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90))l.seaPath=l.seaPath.map(p=>p.slice());else delete l.seaPath;}if(l.paid!==undefined){if(l.own&&l.sub&&Number.isFinite(l.paid)&&l.paid>=0)l.paid=Math.round(l.paid);else delete l.paid;}if(l.own&&l.sub&&!own(SEA_DESIGNS,l.seaDesign))l.seaDesign='standard';l.regen=int(l.regen,0,REGEN_MAX,0);}const deg=v=>v&&typeof v==='object'?{until:num(v.until,0),f:Math.min(1,Math.max(0,num(v.f,1)))}:null;if(l.loss)l.loss=deg(l.loss);return l;});
  for(const l of s.links)repairSubUpgradeDates(l,s.day);
  /* Metrics moved from each link to its city pair (#122). Older saves routed a pair at the lowest metric of its
     links, with all of them carrying traffic, so the pair keeps that metric and nothing goes on standby. */
  {const pm=s.pairMet,lo={};for(const l of s.links){if(l.metric!==undefined){const k=edgeKey(l),m=own(MET,l.metric)?l.metric:'normal';if(!lo[k]||MET[m].f<MET[lo[k]].f)lo[k]=m;}if(l.standby!==true)delete l.standby;}
   for(const l of s.links){const k=edgeKey(l);if(lo[k]&&l.metric===undefined)lo[k]='normal';delete l.metric;}
   for(const k in lo)pm[k]=lo[k];const ks=new Set(s.links.map(edgeKey));for(const k of Object.keys(pm)){const v=pm[k];
     if(v&&typeof v==='object'&&ks.has(k)){const mk=v.k==='w'?'w':'f';pm[k]={k:mk,v:clampM(mk,num(v.v,mk==='w'?60:1))};continue;}
     if(!ks.has(k)||typeof v!=='string'||!own(MET,v)||v==='normal')delete pm[k];}}
  const degO=v=>v&&typeof v==='object'?{until:num(v.until,0),f:Math.min(1,Math.max(0,num(v.f,1)))}:null;
  s.transit=s.transit.filter(t=>t&&isCity(t.city)&&isNet(t.net)).map(t=>(t.lacp=degO(t.lacp),t.site=['a','b','ab'].includes(t.site)?t.site:'a',t.id=sid(t.id),t.tier=tier(t.tier),t.n=lag(t.n),t.down=num(t.down,0),t.clean=!!t.clean,t.premium=premOnlyAt(NET[t.net],t.city)||!!t.premium&&premCity(NET[t.net],t.city),t));
  s.pni=s.pni.filter(x=>x&&isCity(x.city)&&isNet(x.net)).map(x=>(x.lacp=degO(x.lacp),x.site=['a','b','ab'].includes(x.site)?x.site:'a',x.id=sid(x.id),x.tier=tier(x.tier),x.n=lag(x.n),x.sacrif=!!x.sacrif,x));
  // PNIs on order (#…): delivery day, a pending augment, and 1G for the one network that sells it
  for(const x of s.pni){if(x.ready!==undefined)x.ready=num(x.ready,0);if(x.g1)x.g1=x.tier===0&&x.net==='dtk'?true:undefined;else delete x.g1;if(x.up){const u=x.up;x.up=u&&typeof u==='object'?{tier:tier(u.tier),n:lag(u.n),ready:num(u.ready,0),g1:!!u.g1&&x.net==='dtk'&&tier(u.tier)===0,...(u.site==='ab'?{site:'ab'}:{})}:undefined;if(!x.up)delete x.up;}}
  // Supply chain: a shortage and a price lock, both optional.
  {const H=s.hw&&typeof s.hw==='object'&&!Array.isArray(s.hw)?s.hw:{},o={};const sh=H.shock,lk=H.lock;
   if(sh&&typeof sh==='object'&&own(HW_SHOCK,sh.k))o.shock={k:sh.k,until:num(sh.until,0),mul:clamp(num(sh.mul,1),1,2)};
   if(lk&&typeof lk==='object')o.lock={until:num(lk.until,0),mul:clamp(num(lk.mul,1),1,HW_CAP)};s.hw=o;}
  // 2.0 replaced the peering inbox with the peering desk: keep the policy, drop the mail, max-prefix state and the AI.
  {const I=s.inbox&&typeof s.inbox==='object'&&!Array.isArray(s.inbox)?s.inbox:{},pol=s.ppol!==undefined?s.ppol:I.pol;s.ppol=PPOL.includes(pol)?pol:'open';delete s.inbox;
   const wk=(x,rep)=>{if(!x||typeof x!=='object'||Array.isArray(x))return null;const o={w:int(x.w,0,1e7,0),a:int(x.a,0,1e5,0),d:int(x.d,0,1e5,0),ix:[...new Set((Array.isArray(x.ix)?x.ix:[]).filter(isIx))].slice(0,PDESK_IX)};if(rep)o.p=PPOL.includes(x.p)?x.p:'open';return o;};
   s.pdesk=wk(s.pdesk);s.pdeskRep=wk(s.pdeskRep,1);}
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
  // The backbone's technology: a save from before it with Auto-TE bought keeps the old rules on RSVP-TE (legacy).
  {const c=s.core&&typeof s.core==='object'?s.core:null,lv=c?int(c.lv,0,4,0):(s.te?2:0);s.core={lv,run:c?int(c.run,0,lv,lv):lv};if(c?c.legacy===true:!!s.te)s.core.legacy=true;if(c&&c.lab===true)s.core.lab=true;if(c&&c.since!==undefined)s.core.since=num(c.since,0);}
  s.capDeal=s.capDeal&&typeof s.capDeal==='object'&&own(CAP_ROUTES,s.capDeal.c)?{at:num(s.capDeal.at,0),c:s.capDeal.c}:null;
  s.inc=s.inc.filter(i=>i&&typeof i.type==='string').map(i=>(i.type==='maxpfx'&&(i.type='ixloop'),i.id=sid(i.id),i.until=num(i.until,s.day),i.cost=num(i.cost,0),i.msg=String(i.msg||'').slice(0,400),i.fix=i.fix==null?undefined:String(i.fix).slice(0,60),i));
  s.loans=s.loans.filter(l=>l&&own(BANKS,l.bank));for(const l of s.loans){if(l.model!==undefined&&!['balloon','storm','transit','astro'].includes(l.model))delete l.model;for(const k of ['apr0','cut','share'])if(l[k]!==undefined&&!isFinite(+l[k]))delete l[k];if(!Array.isArray(l.covs))l.covs=[];l.covs=l.covs.filter(c=>own(COVS,c));}s.loanOffers=s.loanOffers.filter(l=>l&&own(BANKS,l.bank));
  s.usedNames=[...new Set(s.usedNames.filter(x=>typeof x==='string'))];s.log=s.log.filter(e=>e&&typeof e.t==='string').slice(0,LOG_KEEP).map(e=>{const o=e.o&&typeof e.o==='object'&&e.o.a==='inbox'?{a:'tab',v:'nets'}:e&&e.o&&typeof e.o==='object'&&LOG_OPEN.includes(e.o.a)?(e.o.a==='bank'||e.o.a==='ops'?{a:e.o.a}:typeof e.o.v==='string'&&e.o.v.length<=64&&(e.o.a!=='city'||isCity(e.o.v))&&(e.o.a!=='tab'||LOG_TABS.includes(e.o.v))?{a:e.o.a,v:e.o.v}:null):null;
    return {id:typeof e.id==='string'&&e.id.length<=40?e.id:uid(),d:num(e.d,0),t:e.t.slice(0,600),h:typeof e.h==='string'?e.h.slice(0,200):'',k:LOG_KINDS.includes(e.k)?e.k:'',at:Number.isFinite(+e.at)?+e.at:0,o,n:int(e.n,1,9999,1)};});
  // One scrubbing center became a list (#117): older saves carry theirs over.
  if(!Array.isArray(s.scrubs))s.scrubs=s.scrubAt&&isCity(s.scrubAt)?[{city:s.scrubAt,tier:s.scrubTier}]:[];delete s.scrubAt;delete s.scrubTier;
  {const seen=new Set();s.scrubs=s.scrubs.filter(x=>x&&typeof x==='object'&&isCity(x.city)&&s.pops[x.city]&&!seen.has(x.city)&&seen.add(x.city)).map(x=>({city:x.city,tier:int(x.tier,0,SCRUB_TIERS.length-1,0)}));}
  s.scrubMode=s.scrubMode==='ondemand'?'ondemand':'always';
  // Keep the legacy primary attack so old saves and imports remain compatible; additional floods overlap it.
  const repairAttack=a=>{if(!a||typeof a!=='object'||!isCity(a.city)||!s.pops[a.city]||!own(DDOS_VEC,a.vec))return null;
    a.id=sid(a.id);a.gbps=Math.max(0,num(a.gbps,2));a.until=num(a.until,s.day);a.bh=!!a.bh;a.ixbh=!!a.ixbh;a.start=Math.max(0,Math.min(s.day,num(a.start,s.day)));a.until=Math.min(a.until,a.start+Math.ceil(7*SPICY_LONG));
    delete a.entries; // 2.0 betas spread attacks over every ingress port; they arrive on one again
    if(a.who!==undefined&&!FLOOD_WHO.includes(a.who))delete a.who; // a label from the list, never text from the file
    a.sla=Array.isArray(a.sla)?a.sla.filter(x=>typeof x==='string').slice(0,s.biz.length):[];
    if(!a.entry||typeof a.entry!=='object'||!['t','ix','p','edge'].includes(a.entry.k))a.entry={k:'edge',lab:''};else{a.entry.lab=String(a.entry.lab||'').slice(0,60);a.entry.id=a.entry.id==null?undefined:String(a.entry.id).slice(0,40);}return a;};
  const attacks=[s.ev.ddos,...(Array.isArray(s.ev.ddosMore)?s.ev.ddosMore:[])].map(repairAttack).filter(Boolean).slice(0,14);
  if(attacks.length)s.ev.ddos=attacks[0];else delete s.ev.ddos;s.ev.ddosMore=attacks.slice(1);
  s.ddosStarts=(Array.isArray(s.ddosStarts)?s.ddosStarts:attacks.map(a=>a.start)).filter(d=>typeof d==='number'||typeof d==='string').map(Number).filter(d=>Number.isFinite(d)&&d>s.day-7&&d<=s.day).sort((a,b)=>a-b).slice(-14);
  s.auV=s.auV===1?1:0;if(s.auNews!==true)delete s.auNews;
  // Badges: S.ach[id] is the day it was earned (any save); S.achP[id] the variant (2.0). A missing variant is the standard one.
  for(const k of Object.keys(s.ach))s.ach[k]=num(s.ach[k],0);
  {const p=s.achP&&typeof s.achP==='object'&&!Array.isArray(s.achP)?s.achP:{};s.achP={};for(const k of Object.keys(s.ach))s.achP[k]=typeof p[k]==='string'&&own(BVAR,p[k])?p[k]:'oncall';}
  if(s.merged){const o={};if(typeof s.merged==='object')for(const m of MERGERS)if(isFinite(s.merged[m.id]))o[m.id]=+s.merged[m.id];s.merged=Object.keys(o).length?o:undefined;}
  /* The rules (2.0) follow from the mode, as the doors set them, and nothing else: a save without them is the classic
     game, On-call. Scenarios and the weekly run on On-call; a sandbox keeps only its chaos; a Normal game one of the
     three Normal presets, unchanged (its validated mods kept). So an edited or imported save cannot stop the clock or print money. */
  {const r=s.rules&&typeof s.rules==='object'&&!Array.isArray(s.rules)?s.rules:{};
   const m={mods:r.mods};s.rules=s.scn&&typeof s.scn==='object'?makeRules('oncall',m):s.mode==='sandbox'?makeRules('sandbox',{...m,chaos:r.chaos}):makeRules(NORMAL_PRESETS.includes(r.preset)?r.preset:'oncall',m);}
  specSanitize(s);
  if(s.te){if(typeof s.te!=='object')s.te=null;else{s.te.on=!!s.te.on;s.te.script=typeof s.te.script==='string'?s.te.script.slice(0,4000):'';}}
  return s;}
function migrate(s){sanitize(s);
  // Older saves have one contract per broker sale: fold a carrier's alien waves on one fiber into one contract.
  {const one=new Map();s.biz=s.biz.filter(b=>{if(b.type!=='wwave')return true;const k=b.link+'|'+b.name,a=one.get(k);if(!a){one.set(k,b);return true;}
    a.slots=(a.slots||0)+(b.slots||0);a.rate=(a.rate||0)+(b.rate||0);a.since=Math.min(a.since??0,b.since??0);a.mood=Math.min(a.mood??100,b.mood??100);a.folded=true;return false;});
   for(const a of one.values())if(a.folded){delete a.folded;const l=s.links.find(x=>x.id===a.link);if(l)a.what=wwWhat(l,a.slots);}}if(s.scn&&s.scn.id==='stg'&&s.scn.rules&&typeof s.scn.rules==='object')s.scn.rules.local=true;if(s.scn&&s.scn.id==='gangnam'&&s.scn.rules&&typeof s.scn.rules==='object')s.scn.rules.sender=true;
  // A published weekly scenario keeps its file in the save: checked again here; a bad one plays on as the in-browser weekly.
  if(s.scn&&typeof s.scn==='object'&&s.scn.wk!==undefined){const d=wsValid(s.scn.wk,s.scn.key);if(d){s.scn.wk=d;s.scn.home=d.city;s.scn.run=Number.isInteger(s.scn.run)&&s.scn.run>=0?s.scn.run:0;}else{delete s.scn.wk;delete s.scn.home;delete s.scn.run;}}
  for(const b of [...s.biz,...s.offers])if(Array.isArray(b.reqs))b.reqs=b.reqs.filter(k=>!REQS[k]||!REQS[k].can||(isCity(b.city)&&(!b.city2||isCity(b.city2))&&REQS[k].can(b,s)));if(s.ltv!==2){for(const l of s.links)if(l.kind==='wave'&&l.tier>=3)l.tier=Math.min(LT.length-1,l.tier+1);s.ltv=2;}if(s.dk){s.dk.m=s.dk.m||{};s.dk.add=s.dk.add||{};s.dk.ret=s.dk.ret||{};s.dk.retUsed=s.dk.retUsed||{};}s.hist=s.hist||[];s.loans=s.loans||[];s.loanOffers=s.loanOffers||[];s.loanStrikes=s.loanStrikes||0;for(const l of s.links||[])if(!l.kind)l.kind='wave';
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
