/* ---------- The Hyperscaler's power: grids, the utility queue, protests and goodwill, own generation ----------
   Power is how a hyperscaler scales, and there is never enough of it. Every metro has a grid (S.hs.pw[c].cap, seeded
   40 to 600 MW by hsGrid, more in big metros) that its town draws on first (hsTown, a seeded share that a heatwave
   raises). What is left is yours: region tiers, tenants in compute slots, and whatever else pushes into HS_MW_X (AI
   training runs, phase 3). A build or an upgrade needs the megawatts free (hsPwGate); without them, the utility queue.
   Real underneath: large loads join an interconnection queue with a deposit and a study, wait one to several years,
   and are often offered less, later or curtailable service; the game shrinks years to 90 to 360 days and keeps the
   lack of a promise. Builds past HS_PROT_MW roll a local reaction (hsProtRoll, seeded on the AS number and the day):
   nothing, a delayed permit, a special tariff on your power, or a blocked site. Goodwill (pw.gw, 0 to 100) bought
   with a community fund or by heating the town pool with your waste heat (real: data centers heat pools and district
   heating networks) wins a protest at HS_GW_WIN. Later levels build their own generation (HS_GEN). Power has a price
   per MW a month by country and continent, swung by events (S.hs.pev: heatwaves, energy crunches), billed with the
   regions through CX_COST. A region that draws more than its metro can give tonight serves less (CX_ORG). */
const HS_PW_MO=500,HS_PW_FREE=5,HS_MW_SLOT=0.5,HS_Q_MW=100,HS_Q_FEE=1000000,HS_GW_WIN=70,HS_FUND=250000,HS_FUND_GW=20,HS_HEAT=400000,HS_HEAT_GW=35,HS_PROT_MW=20;
const HS_UTIL=[N_('hyper_power.u_watt'),N_('hyper_power.u_ohm'),N_('hyper_power.u_kowboys'),N_('hyper_power.u_joule')];
const HS_GRP=[N_('hyper_power.g_nimby'),N_('hyper_power.g_grannies'),N_('hyper_power.g_cows'),N_('hyper_power.g_truthers')];
const HS_GRP_SAY=[N_('hyper_power.say_nimby'),N_('hyper_power.say_grannies'),N_('hyper_power.say_cows'),N_('hyper_power.say_truthers')];
// Own generation: MW it adds, cost, build days, the level it needs, how many per metro, and the share of the grid price
// the MW it makes cost you (a substation brings more grid in, so its MW cost what the grid's do).
const HS_GEN={sol:{n:N_('hyper_power.gen_sol'),mw:40,cost:2000000,days:120,lv:3,max:2,f:0.4},
 sub:{n:N_('hyper_power.gen_sub'),mw:150,cost:5000000,days:180,lv:5,max:1,f:1},
 smr:{n:N_('hyper_power.gen_smr'),mw:300,cost:20000000,days:360,lv:9,max:1,f:0.5}};
// Price: a factor per continent, a few countries known for cheap or dear power, and a seeded nudge for the rest.
const HS_PW_REG={AF:1,AM:0.8,AS:1.1,EU:1.3,OC:1.2,SA:0.9},HS_PW_CC={CA:0.7,DE:1.6,DK:1.5,FI:0.8,GB:1.4,IE:1.5,IS:0.5,JP:1.4,NO:0.6,SE:0.7,SG:1.5,US:0.85};
const HS_PEV={heat:{town:1.2,cool:1.1,price:1.3},crunch:{town:1,cool:1,price:2}};
// Other loads in a metro, beyond the region's tier and its tenants: functions (c)=>MW. Phase 3 pushes its AI training
// runs here, so they count in hsMwUsed/hsMwFree, the bill and the grid cut.
const HS_MW_X=[];
const hsUtil=c=>HS_UTIL[hstr('util|'+c)%HS_UTIL.length];
const hsGrpOf=(c,d)=>hstr('grp|'+c+'|'+d)%4;
function hsPwDef(c){return {cap:hsGrid(c),q:null,gw:25+hstr('gw|'+c)%26,own:[]};}
const hsPw=c=>(S.hs&&S.hs.pw&&S.hs.pw[c])||hsPwDef(c);
const hsPwMk=c=>S.hs.pw[c]||(S.hs.pw[c]=hsPwDef(c));
// Events in force on c's continent.
const hsEv=c=>{const H=S.hs,g=CITY[c]&&CITY[c].reg;return H&&Array.isArray(H.pev)?H.pev.filter(e=>e.reg===g&&e.until>S.day):[];};
const hsEvF=(c,k)=>hsEv(c).reduce((a,e)=>a*HS_PEV[e.k][k],1);
// The town's own draw, MW: half to seven tenths of the grid it started with, more in a heatwave (air conditioning).
const hsTown=c=>Math.round(hsGrid(c)*(0.5+hstr('town|'+c)%21/100)*hsEvF(c,'town'));
// What the metro can give: the grid plus your own generation that runs.
const hsGenMw=c=>hsPw(c).own.reduce((a,x)=>a+(x.ready<=S.day?HS_GEN[x.k].mw:0),0);
const hsSupply=c=>hsPw(c).cap+hsGenMw(c);
const hsMwX=c=>HS_MW_X.reduce((a,f)=>a+(+f(c)||0),0);
// Tenants in a leased cage draw on the provider's power, not your grid (38-hyper-zones.js).
const hsMwTen=c=>S.hs&&S.hs.rg[c]&&S.hs.rg[c].t!==HS_CAGE?hsTen().filter(b=>b.rg===c).length*HS_MW_SLOT:0;
/* ===== The API phase 3 calls (AI training runs and anything else that wants megawatts) =====
   hsMwUsed(c): the MW you draw in metro c right now: the live region tier, its tenants, HS_MW_X loads, plus the
     cooling a heatwave adds.
   hsMwRes(c): the MW you hold there: like hsMwUsed, but a region being built or upgraded counts at its new tier.
   hsMwFree(c): what is left for you in c (grid plus own generation, minus the town, minus the larger of the two
     above); may be negative when a heatwave or a cut squeezes the metro. Check it before starting a training run.
   hsCut(c): the share of what the region in c can serve tonight (1 unless it draws more than the metro gives). */
function hsMwUsed(c){const H=S.hs;if(!H)return 0;const d=H.rg[c];if(d&&d.t===HS_CAGE)return 0;const live=d&&d.ready<=S.day?HS_T[d.t].mw:0;return (live+hsMwTen(c)+hsMwX(c))*hsEvF(c,'cool');}
// A cage holds nothing of your grid until you move out of it; zones being built hold theirs (38-hyper-zones.js).
function hsMwRes(c){const H=S.hs;if(!H)return 0;const d=H.rg[c];if(d&&d.t===HS_CAGE&&!d.up)return 0;return (d?HS_T[d.up?d.up.t:d.t].mw:0)+hsMwTen(c)+hsMwX(c)+hsAzMwB(c);}
function hsMwFree(c){if(!S.hs)return 0;return hsSupply(c)-hsTown(c)-Math.max(hsMwRes(c),hsMwUsed(c));}
function hsCut(c){if(!S.hs)return 1;const u=hsMwUsed(c),a=hsSupply(c)-hsTown(c);return u<=a+1e-9?1:clamp(a/u,0,1);}
// Price of a MW for a month in c, and the month's bill there (your own cheap generation first; the starter's MW free).
const hsPwF=c=>{const cc=CITY[c].cc;return own(HS_PW_CC,cc)?HS_PW_CC[cc]:(HS_PW_REG[CITY[c].reg]||1)*(0.9+hstr('pwp|'+cc)%21/100);};
const hsProt=c=>{const p=S.hs&&S.hs.prot&&S.hs.prot[c];return p&&p.until>S.day?p:null;};
const hsPwPrice=c=>Math.round(HS_PW_MO*hsPwF(c)*hsEvF(c,'price')*(hsProt(c)&&hsProt(c).kind==='cost'?1.5:1));
function hsPwBill(c){const u=Math.max(0,hsMwUsed(c)-(c===S.home?HS_PW_FREE:0)),p=hsPwPrice(c);let cheap=0,left=u;
  for(const x of hsPw(c).own){if(x.ready>S.day||HS_GEN[x.k].f>=1||left<=0)continue;const m=Math.min(left,HS_GEN[x.k].mw);cheap+=m*p*HS_GEN[x.k].f;left-=m;}
  return cheap+left*p;}
// Heat reuse: pw.heat is its monthly sum, negative when the town pays you for the heat.
const hsHeatMo=c=>{const s=hstr('heat|'+c)%100;return s<65?-(2000+s*60):1500+(s-65)*80;};
CX_COST.push(()=>{const H=S.hs;if(!H||!H.pw)return 0;let m=0;for(const c in H.rg){m+=hsPwBill(c);const p=H.pw[c];if(p&&p.heat&&hsLive(c))m+=p.heat;}return m;});
CX_ORG.push(c=>S.hs&&hyper()?hsCut(c):1);
/* The build gate (called by hsRegion in 86-hyper.js): t the tier the build or upgrade goes to. Says why not, with the
   utility queue on the toast. */
function hsPwGate(c,t){const p=hsProt(c);if(p&&p.kind==='block'){toast(tr('hyper_power.site_blocked',{grp:tr(HS_GRP[p.g]),city:esc(CITY[c].name),date:dateStr(p.until)}),'bad',[{l:tr('common.open'),act:'popGo',args:{city:c}}]);sfx('err');return false;}
  const d=S.hs.rg[c],need=HS_T[t].mw-(d?HS_T[d.up?d.up.t:d.t].mw:0),free=hsMwFree(c);if(need<=free+1e-9)return true;
  const P=hsPw(c);toast(tr('hyper_power.no_power',{name:tr(HS_T[t].n),city:esc(CITY[c].name),need:Math.ceil(need),free:Math.max(0,Math.floor(free)),util:tr(hsUtil(c))}),'bad',
    P.q?[]:[{l:tr('hyper_power.ask_util',{mw:HS_Q_MW,cost:fmt$(HS_Q_FEE)}),act:'hsUtil',args:{city:c}}]);sfx('err');return false;}
/* Protests. A build that takes your draw in c to HS_PROT_MW or more rolls one: the chance grows with your MW against
   the town's and falls with goodwill. on: 'rg' (the region build there) or 'smr' (the reactor, which always gets one). */
// A Server Barn in a big town rarely gets more than a letter to the editor; a campus that doubles the town's draw does.
function hsProtP(c,mw){return clamp(0.05+0.9*mw/Math.max(1,hsTown(c))-(hsPw(c).gw-40)/100,0.05,0.9);}
function hsProtRoll(c,on){const H=S.hs;if(!H||hsProt(c))return null;const P=hsPwMk(c),mw=hsMwRes(c);if(on==='rg'&&mw<HS_PROT_MW)return null;
  const p=on==='smr'?1:hsProtP(c,mw),r=hstr(S.asn+'|'+S.day+'|'+c+'|prot')%1000/1000;if(r>=p)return null;
  // The director (38-hyper-director.js) lets one crisis happen at a time; the reactor you chose always gets its protest.
  if(on!=='smr'&&!hsDirAsk('prot',1,c))return null;
  // A young cloud's first protests are small: a delayed permit, never a tariff or a blocked site, before level 3.
  const small=on!=='smr'&&lvl()<3,u=r/p,g=on==='smr'?3:hsGrpOf(c,S.day),kind=small?'delay':u<(on==='smr'?0.4:p>=0.4?0.15:0)?'block':on!=='smr'&&u<0.45?'cost':'delay',h=hstr(S.asn+'|'+c+'|'+S.day+'|len');
  const len=kind==='delay'?(small?20+h%21:20+h%41):kind==='cost'?120:150+h%151,x={until:S.day+len,kind,g,on};H.prot[c]=x;P.gw=Math.max(0,P.gw-5);
  if(kind==='delay')hsProtShift(c,on,len);
  const v={grp:tr(HS_GRP[g]),city:esc(CITY[c].name),n:len};
  toast((kind==='block'?tr('hyper_power.prot_block',v):kind==='cost'?tr('hyper_power.prot_cost',v):tr('hyper_power.prot_delay',v))+`<br><i>${tr(HS_GRP_SAY[g])}</i>`,'bad',[{l:tr('hyper_power.answer'),act:'popGo',args:{city:c}}]);sfx('err');return x;}
// Move what the protest holds up by n days (negative gives days back, never to before tomorrow).
function hsProtShift(c,on,n){const H=S.hs,lo=S.day+1;if(on==='smr'){for(const x of hsPw(c).own)if(x.k==='smr'&&x.ready>S.day)x.ready=Math.max(lo,x.ready+n);return;}
  const d=H.rg[c];if(!d)return;if(d.up)d.up.ready=Math.max(lo,d.up.ready+n);else if(d.ready>S.day)d.ready=Math.max(lo,d.ready+n);}
// What a protest holds up is still waiting to be finished (only then do a smaller build or another metro make sense).
function hsProtHeld(c){const p=hsProt(c);if(!p)return false;if(p.on==='smr')return hsPw(c).own.some(x=>x.k==='smr'&&x.ready>S.day);const d=S.hs.rg[c];return !!d&&(!!d.up||d.ready>S.day&&d.t>0);}
// Goodwill reached the mark: the protest is won; a delayed permit gives its remaining days back.
function hsProtWin(c){const p=hsProt(c);if(!p||hsPw(c).gw<HS_GW_WIN)return false;if(p.kind==='delay')hsProtShift(c,p.on,-(p.until-S.day));
  delete S.hs.prot[c];S.stats.hsProt=(S.stats.hsProt||0)+1;toast(tr('hyper_power.prot_won',{grp:tr(HS_GRP[p.g]),city:esc(CITY[c].name)}),'goal');sfx('coin');return true;}
/* A day: blocked sites wait, protests go home, the utility answers, own generation comes online, power events start
   and end. Everything seeded on the AS number and the day. */
function hsPwDay(d){const H=S.hs;if(!H||!hyper())return;
  for(const c of Object.keys(H.prot)){const p=H.prot[c];if(p.until>d){if(p.kind==='block')hsProtShift(c,p.on,1);continue;}
    delete H.prot[c];toast(tr('hyper_power.prot_over',{grp:tr(HS_GRP[p.g]),city:esc(CITY[c].name)}),'good');}
  for(const c of Object.keys(H.pw)){const P=H.pw[c],q=P.q,U=tr(hsUtil(c)),city=esc(CITY[c].name);
    if(q&&q.ready<=d){const r=hstr(S.asn+'|'+d+'|'+c+'|qr')%100;
      if(!q.late&&r<20){q.late=1;q.ready=d+60+hstr(S.asn+'|'+c+'|late')%61;toast(tr('hyper_power.letter_late',{util:U,city,date:dateStr(q.ready)}),'bad',[],{a:'city',v:c});}
      else{const mw=r<45?Math.round(q.mw/2):q.mw;P.cap+=mw;P.q=null;toast(mw<q.mw?tr('hyper_power.letter_less',{util:U,city,mw,ask:q.mw}):tr('hyper_power.letter_full',{util:U,city,mw}),mw<q.mw?'bad':'goal',[],{a:'city',v:c});sfx('coin');}}
    for(const x of P.own)if(x.ready===d)toast(tr('hyper_power.gen_live',{name:tr(HS_GEN[x.k].n),city,mw:HS_GEN[x.k].mw}),'goal',[],{a:'city',v:c});}
  H.pev=H.pev.filter(e=>{if(e.until>d)return true;const v={reg:WAVE_NAME[e.reg]};toast(e.k==='heat'?tr('hyper_power.ev_heat_over',v):tr('hyper_power.ev_crunch_over',v),'good');return false;});
  for(const g of [...new Set(Object.keys(H.rg).map(c=>CITY[c].reg))].sort()){if(H.pev.some(e=>e.reg===g))continue;const r=hstr(S.asn+'|'+d+'|'+g+'|pev')%1000;if(r>=8||!hsDirAsk('pev',1,g))continue;
    const k=r<5?'heat':'crunch',until=d+(k==='heat'?7+r*4:30+(r-5)*20);H.pev.push({k,reg:g,until});
    const cut=Object.keys(H.rg).filter(c=>CITY[c].reg===g&&hsCut(c)<1);
    const v={reg:WAVE_NAME[g],date:dateStr(until)};
    toast((k==='heat'?tr('hyper_power.ev_heat',v):tr('hyper_power.ev_crunch',v))+(cut.length?`<br>${tr('hyper_power.ev_cut',{list:cut.map(c=>esc(CITY[c].name)).join(', ')})}`:''),'bad');}}
CX_DAY.push(hsPwDay);
// A new Hyperscaler: power for the home metro, no protests, no events.
CX_NEW.push(o=>{o.pw={};for(const c in o.rg)o.pw[c]=hsPwDef(c);o.prot={};o.pev=[];});
// Saves: every power field repaired; old Hyperscaler saves get seeded defaults for every region's metro.
CX_SAN.push((h0,o,s)=>{const n=(v,d)=>Number.isFinite(+v)?+v:d,obj=v=>v&&typeof v==='object'&&!Array.isArray(v),okC=k=>isCity(k)&&(k===s.home||siteOk(k,HS_MIN_P));
  o.pw={};if(obj(h0.pw))for(const k of Object.keys(h0.pw).slice(0,200)){const x=h0.pw[k];if(!okC(k)||!obj(x))continue;const D=hsPwDef(k),P=o.pw[k]={cap:clamp(Math.round(n(x.cap,D.cap)),10,5000),q:null,gw:clamp(Math.round(n(x.gw,D.gw)),0,100),own:[]};
    if(obj(x.q))P.q={mw:clamp(Math.round(n(x.q.mw,HS_Q_MW)),1,1000),ready:Math.round(n(x.q.ready,0)),late:x.q.late?1:0};
    if(Array.isArray(x.own))for(const g of x.own.slice(0,8))if(obj(g)&&own(HS_GEN,g.k)&&P.own.filter(y=>y.k===g.k).length<HS_GEN[g.k].max)P.own.push({k:g.k,ready:Math.round(n(g.ready,0))});
    if(Number.isFinite(+x.heat)&&+x.heat)P.heat=clamp(Math.round(+x.heat),-50000,50000);}
  for(const c in o.rg)if(!o.pw[c])o.pw[c]=hsPwDef(c);
  o.prot={};if(obj(h0.prot))for(const k of Object.keys(h0.prot).slice(0,200)){const x=h0.prot[k];if(!okC(k)||!obj(x)||!['delay','cost','block'].includes(x.kind))continue;
    o.prot[k]={until:Math.round(n(x.until,0)),kind:x.kind,g:clamp(Math.round(n(x.g,0)),0,HS_GRP.length-1),on:x.on==='smr'?'smr':'rg'};}
  o.pev=[];if(Array.isArray(h0.pev))for(const e of h0.pev.slice(0,12))if(obj(e)&&own(HS_PEV,e.k)&&own(HS_PW_REG,e.reg)&&!o.pev.some(x=>x.reg===e.reg))o.pev.push({k:e.k,reg:e.reg,until:Math.round(n(e.until,0))});});
