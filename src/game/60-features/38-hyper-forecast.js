/* ---------- The Hyperscaler's forecasts: what runs out, and when (37-hyper.js) ----------
   Good play is growing ahead of demand, so the game says what fills up before it does. Worked out from today's routing
   (R.hs) and kept until tomorrow or until the player changes what it depends on (a region grows, a port is bought):
   never per frame, never inside compute(). Plain numbers with a "~": they assume today's growth holds.
   - Regions: when the users homed there outgrow its room. Each country's users go forward day by day as cxGrow grows
     them while served as well as tonight (hpTraj); tenants stay as they are. The last HP_LH days of each region's
     demand (load plus users it turned away) are kept in S.hs.lh, and a second guess from them (hd) shows how sure the
     first is.
   - Grid headroom: megawatts free in the metro against what the next tier needs.
   - Front doors: when what their countries ask outgrows the ports out there (transit, exchange ports, PNIs).
   - Region pairs: the backlog grows or drains by so many TB a day; when it reaches HS_RISK; when a replica's copies
     outgrow the spare backbone between the pair (hsWide).
   - Countries: why their growth is capped (region full, residency, front door full, backbone, no door).
   - AI runs: when they finish at tonight's rate, against their deadline.
   The plan (hpPlan): every one of those that runs out, soonest first (a leased cage where a region's own fix is far
   off, a zone where a region runs in one building), with the fix, how long the fix takes (lead) and
   whether that is longer than the time left (red: order now). The calendar (hpCal): dates already known. */
const HP_H=365,HP_LH=14,HP_SOON=30,HP_UTIL=180;
// A region's demand tonight: what it served plus the users homed there it had no room for.
function hpDemand(c){const o=R&&R.hs,x=o&&o.rg[c];if(!x)return 0;let d=x.load;
  for(const cc in o.cc){const y=o.cc[cc],h=y.home||(S.hs.cc[cc]&&S.hs.cc[cc].home);if(h===c&&!y.blk)d+=y.short;}return d;}
// A day: each live region's demand joins its history (HP_LH days at most).
function hpDay(){const H=S.hs;if(!H||!hyper()||!R||!R.hs)return;if(!H.lh)H.lh={};
  for(const c of Object.keys(H.lh))if(!H.rg[c])delete H.lh[c];
  for(const c of Object.keys(R.hs.rg)){const L=H.lh[c]||(H.lh[c]=[]);L.push(Math.round(hpDemand(c)*10)/10);if(L.length>HP_LH)L.splice(0,L.length-HP_LH);}}
CX_DAY.push(hpDay);
CX_NEW.push(o=>{o.lh={};});
CX_SAN.push((h0,o)=>{o.lh={};const L0=h0.lh;if(!L0||typeof L0!=='object'||Array.isArray(L0))return;
  for(const k of Object.keys(L0))if(own(o.rg,k)&&Array.isArray(L0[k]))o.lh[k]=L0[k].slice(-HP_LH).map(v=>clamp(Number.isFinite(+v)?+v:0,0,1e7));});
// A country's users from tonight on, day by day, as cxGrow grows them while served as well as tonight.
function hpTraj(cc,D0,n){const q=hsQ(R,cc),P=hsPot(cc)||1,on=q>=CX_GOOD&&hsResMet(cc),m=on?cxMul('grow',cc):0,out=new Float64Array(n+1);let d=D0;out[0]=d;
  for(let i=1;i<=n;i++){if(on)d+=HS_GROW*q*d*Math.max(0,1-d/P)*m;out[i]=d;}return out;}
// The first day (1..HP_H) on which base plus what the countries in L add reaches cap; L: [[trajectory, share]].
function hpWhen(base,cap,L){if(base>=cap-0.5)return 0;for(let k=1;k<=HP_H;k++){let a=base;for(const [t,f] of L)a+=(t[k]-t[0])*f;if(a>=cap-0.5)return k;}return null;}
const hpRate=L=>L.reduce((a,[t,f])=>a+(t[1]-t[0])*f,0);
// The second guess, from the history: days until cap at the history's average daily growth, or null.
function hpHist(c,cap,now){const L=S.hs.lh&&S.hs.lh[c];if(!L||L.length<4||!(L[0]>0.5))return null;const r=Math.pow(L[L.length-1]/L[0],1/(L.length-1))-1;
  if(!(r>1e-4))return null;if(now>=cap-0.5)return 0;const d=Math.ceil(Math.log(cap/Math.max(now,0.1))/Math.log(1+r));return d>HP_H?null:d;}
// What the ports out at a front door can carry (transit, exchange ports, PNIs that are up).
function hpDoorCap(v){let g=0;for(const t of S.transit)if(t.city===v&&!(t.down>S.day))g+=liveCap(PORT[t.tier].g,t.city,t.site,t.n)*lagF(t);
  for(const x of ixIdsIn(v))if(S.ixp[x]!==undefined)g+=ixCap(x);
  for(const p of S.pni)if(p.city===v&&pniOn(p))g+=liveCap(pniG(p),p.city,p.site,p.n)*lagF(p);return g;}
/* All the forecasts, from today's routing: {rg: {city: {cap, now, d days to full (0 now, null not within HP_H), hd the
   history's guess, rate Gbps a day, free MW, need MW for the next tier}}, door: {city: {cap, now, d, rate}}, pair:
   {'a>b': {a, b, lag TB, tb TB a day (+ grows, - drains), risk days to HS_RISK, empty days to empty, start days until
   the copies outgrow the spare backbone}}, cc: {cc: [reasons growth is capped]}, run: {id: {eta days, late}}}. */
function hpMake(){const H=S.hs,o=R.hs,F={rg:{},door:{},pair:{},cc:{},run:{}};if(!o)return F;const T={};
  for(const cc in o.cc){const y=o.cc[cc];if(y.D>1e-9&&S.hs.cc[cc])T[cc]=hpTraj(cc,y.D,HP_H);}
  for(const c of Object.keys(o.rg).sort()){const x=o.rg[c],L=[];
    for(const cc in T){const y=o.cc[cc],h=y.home||H.cc[cc].home;if(h!==c||y.blk)continue;L.push([T[cc],clamp((y.D-y.st-(y.nd||0))/y.D,0,1)]);}
    const now=hpDemand(c),d=hpWhen(now,x.g,L),rg=H.rg[c],N=hsTNext(rg);
    F.rg[c]={cap:x.g,now,d,hd:hpHist(c,x.g,now),rate:hpRate(L),free:hsMwFree(c),need:N?N.mw-HS_T[rg.up?rg.up.t:rg.t].mw:0};}
  const dv=new Set();for(const cc in o.cc)if(o.cc[cc].v)dv.add(o.cc[cc].v);
  for(const v of [...dv].sort()){const cap=hpDoorCap(v),now=(R.cityDem&&R.cityDem[v])||0,sf=sfOf(R,v),L=[];
    for(const cc in T)if(o.cc[cc].v===v)L.push([T[cc],1]);
    // Served in full though more than the ports here: the rest leaves elsewhere over the backbone, no limit known.
    if(sf>=0.95&&now>cap+0.5){F.door[v]={cap,now,d:null,rate:hpRate(L),far:1};continue;}
    F.door[v]={cap,now,d:sf<0.95?0:hpWhen(now,cap,L),rate:hpRate(L)};}
  if(o.rep)for(const a of Object.keys(o.rep).sort()){const x=o.rep[a],k=hsLk(a,x.b),lag=H.lag[k]||0,tb=(x.base-x.got)*TB_DAY,P={a,b:x.b,lag,tb,risk:null,empty:null,start:null};
    if(tb>0.05)P.risk=lag>=HS_RISK?0:Math.ceil((HS_RISK-lag)/tb);
    else if(lag>0.05)P.empty=Math.ceil(lag/Math.max(0.05,-tb));
    else{// Copies grow with the users homed at a: when do they outgrow what the backbone between the pair has spare?
      const sp=hsWide(a,x.b),L=[];for(const cc in T){const y=o.cc[cc];if((y.home||H.cc[cc].home)===a&&!y.blk)L.push([T[cc],HS_REP*clamp((y.D-y.st-(y.nd||0))/y.D,0,1)]);}
      if(sp<Infinity&&L.length)P.start=hpWhen(0,Math.max(0.5,sp),L)||null;}
    F.pair[k]=P;}
  for(const cc in o.cc){const y=o.cc[cc],w=[];if(!y.v)w.push('nodoor');if(y.blk||!hsResMet(cc))w.push('law');if(y.short>0.5&&!y.blk)w.push('room');
    if(y.v&&sfOf(R,y.v)<0.95)w.push('door');if(y.want-y.got>0.5)w.push('haul');if(w.length)F.cc[cc]=w;}
  for(const j of hsRuns()){const x=o.jobs&&o.jobs[j.id],left=Math.max(0,j.tb-j.done),r=x?x.got*TB_DAY:0,eta=left<=1e-6?0:r>1e-9?Math.ceil(left/r):null;
    F.run[j.id]={eta,late:eta===null||S.day+eta>j.due};}
  return F;}
/* The plan: what runs out, soonest first. An item: {k kind, c the city it is about, d days left (0 now), lead days the fix
   takes (null: no fix you can order today), red (the fix takes longer than the time left), fix kind, and what the
   interface needs to say it (x)}. */
function hpRgFix(c){const H=S.hs,rg=H.rg[c],N=hsTNext(rg),P=hsPw(c);
  if(rg.up)return {fix:'coming',lead:Math.max(0,rg.up.ready-S.day),t:rg.up.t};
  // A cage never grows in place: you move out into your own Server Barn there (38-hyper-zones.js), power permitting.
  if(rg.t===HS_CAGE){const B=HS_T[1];if(B.mw<=hsMwFree(c)+1e-9)return {fix:'move',lead:leadDays(B.days),t:1};if(P.q)return {fix:'pwq',lead:Math.max(0,P.q.ready-S.day)+leadDays(B.days),t:1,q:Math.max(0,P.q.ready-S.day)};
    if(hsMorAt(c))return {fix:'mor',lead:null,t:1};return {fix:'pw',lead:leadDays(HP_UTIL)+leadDays(B.days),t:1,q:leadDays(HP_UTIL)};}
  if(!N||N.lv>lvl())return hsRgN()<hsRgMax()?{fix:'new',lead:leadDays(HS_T[1].days),t:1}:{fix:'lvl',lead:null};
  const need=N.mw-HS_T[rg.t].mw;if(need<=hsMwFree(c)+1e-9)return {fix:'up',lead:leadDays(N.days),t:rg.t+1};
  if(P.q)return {fix:'pwq',lead:Math.max(0,P.q.ready-S.day)+leadDays(N.days),t:rg.t+1,q:Math.max(0,P.q.ready-S.day)};
  if(hsMorAt(c))return {fix:'mor',lead:null,t:rg.t+1};
  return {fix:'pw',lead:leadDays(HP_UTIL)+leadDays(N.days),t:rg.t+1,q:leadDays(HP_UTIL)};}
function hpPlanMake(F){const H=S.hs,out=[],add=x=>{x.red=x.lead===null||x.lead>=x.d;out.push(x);};
  for(const c in F.rg){const f=F.rg[c];if(f.d===null||!hsLive(c))continue;add({k:'rg',c,d:f.d,...hpRgFix(c)});}
  // The region filling first whose own fix is far off (slower than the time left, waiting on power or the law, or more
  // than the cash): a leased cage nearby is a region in two weeks (38-hyper-zones.js). Its region's row steps aside.
  if(HS_T[HS_CAGE].lv<=lvl()&&hsRgN()<hsRgMax()){const x=out.filter(x=>x.k==='rg'&&x.fix!=='coming'&&(x.red||['pw','pwq','mor'].includes(x.fix)||['up','new','move'].includes(x.fix)&&S.cash<HS_T[x.t].cost)).sort((a,b)=>a.d-b.d||(a.c<b.c?-1:1))[0];
    const at=x&&hsColoAt(x.c);if(at){x.alt=1;add({k:'colo',c:at,b:x.c,d:x.d,fix:'colo',lead:leadDays(HS_T[HS_CAGE].days)});}}
  // Zones: a region of yours with none yet once the level allows one, or with local outages behind it (advice: never
  // urgent, listed last).
  if(hsAzMax()>0)for(const c of Object.keys(H.rg).sort()){if(!hsLive(c)||!hsAzOk(c))continue;const n=hsAzL(c).length,o=(H.azo&&H.azo[c])|0;
    if(n<hsAzMax()&&(n===0||o>=2))add({k:'az',c,d:HP_H,o,fix:'zone',lead:leadDays(hsAzDays(c))});}
  // A grid with no room left for another tenant.
  for(const c of Object.keys(H.rg).sort())if(hsLive(c)&&hsMwFree(c)<HS_MW_SLOT){const P=hsPw(c);add({k:'grid',c,d:0,fix:P.q?'pwq':'util',lead:P.q?Math.max(0,P.q.ready-S.day):leadDays(HP_UTIL)});}
  for(const v in F.door){const f=F.door[v];if(f.d!==null)add({k:'door',c:v,d:f.d,fix:'port',lead:1});}
  // Autarky (no leased waves): the fix between regions is glass you dig, and that takes a dig's time, not a day.
  const wl=(a,b)=>modeOn('autarky')?dfBuildDays(kmBetween(a,b)):1;
  for(const k in F.pair){const p=F.pair[k];if(p.risk!==null)add({k:'lag',c:p.a,b:p.b,d:p.risk,fix:'wave',lead:wl(p.a,p.b)});else if(p.start!==null)add({k:'rep',c:p.a,b:p.b,d:p.start,fix:'wave',lead:wl(p.a,p.b)});}
  for(const j of hsRuns()){const r=F.run[j.id];if(!r||!r.late||j.due<S.day)continue;add({k:'run',c:j.a,b:j.b,id:j.id,d:Math.max(0,j.due-S.day),eta:r.eta,fix:'wave',lead:wl(j.a,j.b)});}
  const kk=['rg','colo','grid','door','lag','rep','run','az'];
  return out.sort((x,y)=>x.d-y.d||(y.red?1:0)-(x.red?1:0)||kk.indexOf(x.k)-kk.indexOf(y.k)||(x.c<y.c?-1:x.c>y.c?1:0));}
/* The calendar: dates already known, soonest first, from today on: {d day, k kind, c city or null, x what to say}. */
const HP_BIG=5;
function hpCalMake(){const H=S.hs,out=[],d0=S.day,add=(d,k,c,x)=>{if(d>=d0)out.push({d,k,c:c||null,x:x||{}});};
  for(const c of Object.keys(H.pw||{}).sort()){const q=H.pw[c].q;if(q)add(q.ready,'util',c,{mw:q.mw});for(const g of H.pw[c].own)if(g.ready>d0)add(g.ready,'gen',c,{k:g.k});}
  for(const c of Object.keys(H.rg).sort()){const r=H.rg[c];if(r.ready>d0)add(r.ready,'rg',c,{t:r.t});if(r.up)add(r.up.ready,'up',c,{t:r.up.t});hsAzL(c).forEach((z,i)=>{if(z.r>d0)add(z.r,'az',c,{i});});}
  for(const l of S.links)if(l.ready>d0&&CITY[l.a]&&CITY[l.b])add(l.ready,'link',l.a,{a:l.a,b:l.b});
  for(const p of S.pni)if(p.ready>d0&&NET[p.net])add(p.ready,'pni',p.city,{net:p.net});
  const L=H.law;if(L){for(const cc of Object.keys(L.cc).sort())if(ccInfo(cc))add(L.cc[cc].f,'law',null,{cc});
    for(const c of Object.keys(L.mor).sort()){add(L.mor[c].f,'mor',c);add(L.mor[c].u,'morend',c);}
    for(const g of Object.keys(L.pue).sort())add(L.pue[g].f,'pue',null,{reg:g});
    if(L.eu)add(L.eu.f,'eu');if(L.egr&&L.egr.st==='open')add(L.egr.dl,'egr');}
  const lf=H.lf;if(lf){add(lf.from-1,'freeze',null,{g:lf.g});add(lf.from,'launch',null,{g:lf.g,id:lf.id});}
  for(const j of hsRuns())add(j.due,'run',j.a,{id:j.id});
  if(H.dx)add(H.dx.d,'drill',H.dx.c,{b:H.dx.b});
  for(const c of Object.keys(H.prot||{}).sort()){const p=H.prot[c];if(p.until>d0)add(p.until,'prot',c,{g:p.g});}
  // The biggest tenants' contract ends (renewal or goodbye).
  for(const b of hsTen().filter(b=>b.te>d0).sort((a,b)=>bizMo(b)-bizMo(a)||(a.id<b.id?-1:1)).slice(0,HP_BIG))add(b.te,'ren',b.city,{id:b.id});
  const kk=['util','rg','up','az','gen','link','pni','law','mor','morend','pue','eu','egr','freeze','launch','run','drill','prot','ren'];
  return out.sort((x,y)=>x.d-y.d||kk.indexOf(x.k)-kk.indexOf(y.k)||((x.c||'')<(y.c||'')?-1:1));}
/* Kept until the day turns or something the forecasts read changes (a region, the grid queue, ports, links, runs):
   hp() is what the interface calls, as often as it likes. */
const HP={S:null,k:'',F:null,P:null,C:null,ms:0};
function hpKey(){const H=S.hs;let k=S.day+'|'+(R&&R.hs?1:0);for(const c in H.rg){const r=H.rg[c];k+='|'+c+r.t+(r.up?'u'+r.up.t:'')+(hsLive(c)?'':'x');}
  for(const c in H.pw)k+=H.pw[c].q?'q'+c:'';for(const c in H.az||{})k+='|z'+c+hsAzL(c).map(z=>z.r).join(',');return k+'|'+S.transit.reduce((a,t)=>a+t.tier*7+(t.n||1),0)+'|'+Object.keys(S.ixp).length+'|'+S.pni.length+'|'+S.links.length+'|'+hsRuns().length+'|'+S.biz.length+'|'+Object.keys(H.cc).length;}
function hp(){if(!S||!S.hs||!hyper()||!R||!R.hs)return null;const k=hpKey();
  if(HP.S!==S||HP.k!==k){const t0=performance.now();HP.S=S;HP.k=k;HP.F=hpMake();HP.P=hpPlanMake(HP.F);HP.C=hpCalMake();HP.ms=performance.now()-t0;}return HP;}
// The plan item worth the card's next step: red, or one to start within HP_SOON days.
// A row a cage stands in for (alt) leaves the next step to the cage.
const hpUrgent=()=>{const h=hp();return h?h.P.find(x=>!x.alt&&x.d<=HP_H&&(x.red&&x.lead!==null||x.lead!==null&&x.d-x.lead<=HP_SOON))||null:null;};
