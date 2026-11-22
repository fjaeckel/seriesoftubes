/* ---------- The NOC intern at a Hyperscaler (37-hyper.js, 95-standing-orders.js) ----------
   Four orders only a Hyperscaler sees, run like every other order: through the player's own clicks (ACT.*), muted,
   within a monthly budget, never during a change freeze (a launch freeze stops the whole shift, opsStill()).
   - hsrg: regions running at or above a share of their tier. Told to grow, the next tier up where the level, the
     metro's megawatts and the law allow it; where power is short, the utility is asked early (one request a metro);
     otherwise a note, once a week per region. Its budget list has no "no limit": a campus is a multi-million build.
   - hswave: a region pair whose replication backlog grows (today's copies did not all get through and the backlog is
     over a mark) gets a leased wave between the two regions, the smallest that carries what was missing.
   - hsdrill: a failover drill for a region whose pair was never drilled, or not for a while; only one at a time, only
     where the NOC calls the failover ready if told so, and never right before a launch freeze.
   - hsfund: a protest that a few community funds would win is answered with them, up to a price per protest.
   - hsaz: a region that met local outages (S.hs.azo, 38-hyper-zones.js) gets another availability zone, where the level,
     the megawatts and the law allow it: one a shift.
   What the intern may do grows with the level: each order unlocks at its level (HS_OPS_LV), its budget has a ceiling
   that rises with the level (capMax), and the intern never grows a region to a tier you reached less than two levels
   ago, nor more than one region a month. Waves and region growth never take the month into a loss: their monthly
   price counts against what the cloud earns, not only against the budget.
   The classic order with nothing to do here (free caches for your eyeballs: a Hyperscaler has no eyeballs) is hidden.
   The orders are registered by hsOpsReg() at the end of 95-standing-orders.js, which loads after this file. */
const HS_OPS_RG_CAPS=[1e6,3e6,1e7,25e6],HS_OPS_WAVE_CAPS=[25000,100000,250000,1e6,5e6,0];
// The level each order unlocks at (the intern itself comes at level 2), and the budget ceilings by level: [from level, ceiling].
const HS_OPS_LV={hsdrill:2,hsfund:2,hswave:3,hsrg:4,hsaz:5};
const hsOpsShow=k=>()=>hyper()&&!!S.hs&&lvl()>=HS_OPS_LV[k];
const hsOpsCeil=steps=>()=>{let m=steps[0][1];for(const [lv,v] of steps)if(lvl()>=lv)m=v;return m;};
const HS_OPS_CEIL=hsOpsCeil([[0,250000],[5,1e6],[8,5e6],[11,Infinity]]);
// The intern grows a region to a tier only two levels after you may build it yourself.
const HS_OPS_TLV=2;
// What the cloud earns in a month after a new monthly price mo: never below zero for the intern's own choices.
const hsOpsAfford=mo=>!R||!Number.isFinite(R.revMo)||R.revMo-R.costMo-mo>=0;
// Flavour for the intern's mood on an ordinary day at a cloud (one a day, the same day always the same).
const HS_OPS_MOOD=[N_('hyper_ops.mood_cat'),N_('hyper_ops.mood_serverless'),N_('hyper_ops.mood_whiteboard'),N_('hyper_ops.mood_cert'),N_('hyper_ops.mood_bill')];
function hsOpsReg(){
  OPS.push(
   {k:'hsrg',i:'🏭',pop:1,cap:3e6,caps:HS_OPS_RG_CAPS,capMax:hsOpsCeil([[0,3e6],[6,1e7],[9,25e6]]),show:hsOpsShow('hsrg'),t:N_('hyper_ops.o_rg'),d:N_('hyper_ops.o_rg_desc'),p:{
     at:{d:85,v:[70,80,85,90,95],l:N_('ops.p_at'),f:v=>v+'%'},
     how:{d:'grow',v:['grow','ask','warn'],l:N_('hyper_ops.p_how'),f:v=>v==='grow'?tr('hyper_ops.how_grow'):v==='ask'?tr('hyper_ops.how_ask'):tr('hyper_ops.how_warn')}}},
   {k:'hswave',i:'🌊',cap:100000,mo:1,caps:HS_OPS_WAVE_CAPS,capMax:hsOpsCeil([[0,100000],[5,250000],[8,1e6],[10,5e6],[12,Infinity]]),show:hsOpsShow('hswave'),t:N_('hyper_ops.o_wave'),d:N_('hyper_ops.o_wave_desc'),p:{
     tb:{d:50,v:[10,50,100,500],l:N_('hyper_ops.p_tb'),f:v=>hsTb(v)}}},
   {k:'hsdrill',i:'🧯',cap:50000,capMax:HS_OPS_CEIL,show:hsOpsShow('hsdrill'),t:N_('hyper_ops.o_drill'),d:N_('hyper_ops.o_drill_d'),p:{
     days:{d:180,v:[90,180,365],l:N_('hyper_ops.p_days'),f:v=>trn('hyper_ops.n_days',v)},
     ready:{d:true,v:[true,false],l:N_('hyper_ops.p_ready'),f:v=>v?tr('common.on'):tr('common.off')}}},
   {k:'hsfund',i:'📣',cap:1e6,capMax:HS_OPS_CEIL,show:hsOpsShow('hsfund'),t:N_('hyper_ops.o_fund'),d:N_('hyper_ops.o_fund_d'),p:{
     max:{d:500000,v:[250000,500000,1000000],l:N_('hyper_ops.p_max'),f:v=>fmt$(v)}}},
   {k:'hsaz',i:'🧱',cap:250000,capMax:HS_OPS_CEIL,show:hsOpsShow('hsaz'),t:N_('hyper_ops.o_az'),d:N_('hyper_ops.o_az_d'),p:{
     out:{d:2,v:[1,2,3,5],l:N_('hyper_ops.p_out'),f:v=>trn('hyper_ops.n_outages',v)}}});
  // lockLv: the level the sheet names for an order not open yet.
  for(const o of OPS.slice(-5)){OPSK[o.k]=o;o.lockLv=()=>hyper()&&!!S.hs?HS_OPS_LV[o.k]:0;}
  OPS_POP.push('hsrg');
  Object.assign(OPS_SAY,{hsrg:N_('hyper_ops.l_rg'),hsutil:N_('hyper_ops.l_util'),rgfull:N_('hyper_ops.l_full'),hswave:N_('hyper_ops.l_wave'),hsloss:N_('hyper_ops.l_loss'),hsdrill:N_('hyper_ops.l_drill'),hsfund:N_('hyper_ops.l_fund'),hsaz:N_('hyper_ops.l_az')});
  OPS_ORDER.splice(OPS_ORDER.indexOf('repair')+1,0,'hsfund','hsrg','hsaz');
  OPS_ORDER.splice(OPS_ORDER.indexOf('waveup')+1,0,'hswave','hsdrill');
  // Free caches serve your own eyeballs; a Hyperscaler has none.
  {const s=OPSK.caches.show;OPSK.caches.show=()=>!hyper()&&(!s||s());}
  Object.assign(OPS_RUN,{hsrg:hsOpsRg,hswave:hsOpsWave,hsdrill:hsOpsDrill,hsfund:hsOpsFund,hsaz:hsOpsAz});}
const hsOpsOn=()=>hyper()&&!!S.hs&&!!R.hs;
// A note that changes nothing on the network (the weekly "running full"): no routing for it.
function hsOpsNote(X,k,w){const W=S.ops.wk;if(W&&(W.wh[k]||[]).includes(w))return;const dt=X.dirty;X.did(k,w);X.dirty=dt;}
// Regions at or over the mark: the next tier up, the utility, or a note. Busiest first.
function* hsOpsRg(X){if(!hsOpsOn())return;const H=S.hs,at=opsP('hsrg','at')/100,how=opsP('hsrg','how'),ld=c=>R.hs.rg[c]?R.hs.rg[c].load/hsRgG(c):0;
  for(const c of hsRgs().filter(c=>opsHere('hsrg',c)&&R.hs.rg[c]).sort((a,b)=>ld(b)-ld(a)||(a<b?-1:1))){const d=H.rg[c];if(d.up||d.ready>S.day||ld(c)*opsAhead()<at)continue;
    const N=hsTNext(d),P=hsPw(c),pr=hsProt(c),mor=hsMorAt(c),need=N?N.mw-HS_T[d.t].mw:0;
    const grown=(S.ops.addMo.hsrg||0)>0;
    if(how==='grow'&&N&&!grown&&N.lv+HS_OPS_TLV<=lvl()&&hsOpsAfford(N.mo-HS_T[d.t].mo)&&!mor&&!(pr&&pr.kind==='block')&&need<=hsMwFree(c)+1e-9&&X.can('hsrg',hsCost(d.t+1))
      &&X.pay('hsrg',()=>{ACT.hsRegion({city:c});return !!d.up;})){X.book('hsrg',0,N.mo-HS_T[d.t].mo);X.did('hsrg',c+' ⇧');yield;continue;}
    // Short of megawatts for the next tier (or the top tier, and still full): ask the utility early, once per metro.
    if(how!=='warn'&&!mor&&!P.q&&(!N||need>hsMwFree(c))&&X.can('hsrg',HS_Q_FEE)&&X.pay('hsrg',()=>{ACT.hsUtil({city:c});return !!hsPw(c).q;})){const dt=X.dirty;X.did('hsutil',c);X.dirty=dt;yield;continue;}
    hsOpsNote(X,'rgfull',c);}}
// A wave for a region pair whose backlog grows: the smallest size that carries what replication missed today.
function* hsOpsWave(X){if(!hsOpsOn()||!R.hs.rep)return;const H=S.hs,tb=opsP('hswave','tb'),rep=R.hs.rep,short=a=>rep[a].base-rep[a].got;
  for(const a of Object.keys(rep).filter(a=>short(a)>0.5).sort((x,y)=>short(y)-short(x)||(x<y?-1:1))){const b=rep[a].b,k=hsLk(a,b);
    if(!b||(H.lag[k]||0)<tb||!S.pops[a]||!S.pops[b])continue;
    // A wave added lately gets a week to drain the backlog before another one comes.
    if(S.links.some(l=>l.kind==='wave'&&edgeKey(l)===hsPk(a,b)&&(l.day|0)>=S.day-7))continue;
    const q=hsOpsWaveQuote(a,b,(short(a)+(H.lag[k]||0)/TB_DAY/7)*opsAhead());if(!q)continue;
    // Its monthly price counts: against the order's running budget, and against what the cloud earns.
    if(!hsOpsAfford(q.cost)){hsOpsNote(X,'hsloss',hsPk(a,b));continue;}if(!X.can('hswave',q.cost,q.cost))continue;
    // One wave a shift: the backlog gets the evening to show what it did.
    const n=S.links.length;if(X.pay('hswave',()=>hsOpsLease(a,b,q.t)&&S.links.length>n)){X.did('hswave',hsPk(a,b)+' '+LT[q.t].n);yield;return;}}}
// The wave the order would lease between a and b: the smallest size over need that can be had, else the biggest.
function hsOpsWaveQuote(a,b,need){if(noTalk(a,b))return null;const ui=UI.via,cp=UI.cnPrem;UI.via='';UI.cnPrem=false;
  try{const border=cnCity(a)!==cnCity(b),sib=pairLinks(a,b).filter(l=>l.kind!=='vxc'),jn=sib.length?routeJoin(a,b):null,mult=(sib.length&&!(jn&&jn.k===(landTrenches(a,b)[0]||{}).k)?DIVERSE:1)*(border?3:1),wr=waveRoute(a,b,mult,border);if(!wr)return null;
    const ok=LT.map((x,t)=>t).filter(t=>waveOk(a,b,t)&&!subWaveWhy(t,wr.km,wr.sub)&&!soldOut(a,b,t,wr.cab));if(!ok.length)return null;
    const t=ok.find(t=>LT[t].g>=need)??ok.at(-1);return {t,cost:Math.round(waveMo(wr.km,wr.sub,t)*wr.wm)};}finally{UI.via=ui;UI.cnPrem=cp;}}
// The player's own click: pick the two cities, then the wave size (the link sheet's flow).
function hsOpsLease(a,b,t){const ui={p:UI.pending,v:UI.via,c:UI.cnPrem,r:UI.route};UI.pending={a,b};UI.via='';UI.cnPrem=false;UI.route='';
  try{ACT.buildLink({tier:t});return true;}finally{UI.pending=ui.p;UI.via=ui.v;UI.cnPrem=ui.c;UI.route=ui.r;}}
// A drill for the pair drilled longest ago (never first). One at a time, and not into a launch freeze.
function* hsOpsDrill(X){if(!hsOpsOn())return;const H=S.hs,days=opsP('hsdrill','days'),ready=opsP('hsdrill','ready'),L=hsLf();if(H.dx||L&&L.from-1-S.day<=1)return;
  // A region already out of service is a real failover, not a drill.
  if(Object.keys(H.rg).some(hsOut))return;
  const last=c=>{const b=hsRepOf(c);return b?H.drill[hsPk(c,b)]:undefined;},age=c=>{const v=last(c);return v===undefined?-1:v;};
  for(const c of hsRgs().filter(c=>!hsDrillWhy(c)&&(last(c)===undefined||S.day-last(c)>=days)&&(!ready||hsFailReady(c))).sort((a,b)=>age(a)-age(b)||(a<b?-1:1))){
    if(!X.can('hsdrill',HS_DRILL))return;if(X.pay('hsdrill',()=>{ACT.hsDrill({city:c});return !!H.dx;})){X.did('hsdrill',c+'|'+H.dx.b);yield;}return;}}
// Protests that community funds would win at a price under the order's mark: fund until won.
function* hsOpsFund(X){if(!hyper()||!S.hs)return;const H=S.hs,max=opsP('hsfund','max');
  for(const c of Object.keys(H.prot).sort()){const p=hsProt(c);if(!p||!S.pops[c])continue;const n=Math.ceil(Math.max(0,HS_GW_WIN-hsPw(c).gw)/HS_FUND_GW);if(!n||n*HS_FUND>max)continue;
    if(!X.can('hsfund',n*HS_FUND))continue;let paid=0;
    for(let i=0;i<n&&hsProt(c);i++){if(!X.pay('hsfund',()=>{const g=hsPw(c).gw;ACT.hsFund({city:c});return hsPw(c).gw>g;}))break;paid++;}
    // Goodwill moves no traffic: nothing to route again for it.
    if(paid){const dt=X.dirty;X.did('hsfund',c);X.dirty=dt;yield;}}}
// A zone for the region that met the most local outages (at least the order's mark), one a shift.
function* hsOpsAz(X){if(!hsOpsOn())return;const H=S.hs,mark=opsP('hsaz','out'),o=c=>(H.azo&&H.azo[c])|0;
  for(const c of hsRgs().filter(c=>o(c)>=mark&&!hsAzWhy(c)&&!hsMorAt(c)&&hsMwFree(c)>=hsAzMw1(c)).sort((a,b)=>o(b)-o(a)||(a<b?-1:1))){
    const n=hsAzL(c).length,cost=hsAzCost(c);if(!X.can('hsaz',cost))continue;
    if(X.pay('hsaz',()=>{ACT.hsZone({city:c});return hsAzL(c).length>n;})){X.book('hsaz',0,hsAzMo(c));X.did('hsaz',c);yield;return;}}}
// The intern's mood at a cloud (opsMood()): a region down first (in any outage), then on an ordinary day what is going
// on, then flavour.
function hsOpsMood(k){if(!hyper()||!S.hs||!S.ops)return '';if(k!=='quiet'&&k!==S.ops.intern&&k!=='outage')return '';const H=S.hs,name=opsName();
  const dn=Object.keys(H.rg).filter(c=>hsOut(c)&&!(H.dx&&H.dx.c===c)).sort()[0];if(dn)return tr('hyper_ops.mood_down',{name,city:CITY[dn].name});
  if(k==='outage')return '';
  const L=hsLf();if(L&&S.day<L.from&&L.from-S.day<=7)return tr('hyper_ops.mood_launch',{name,game:HS_GAMES[L.g]});
  const lag=Object.keys(H.rg).find(c=>hsLagAt(c)>HS_RISK);if(lag)return tr('hyper_ops.mood_backlog',{name,city:CITY[lag].name});
  const pc=Object.keys(H.prot).sort().find(c=>hsProt(c));if(pc)return tr('hyper_ops.mood_protest',{name,city:CITY[pc].name,grp:tr(HS_GRP[H.prot[pc].g])});
  return tr(HS_OPS_MOOD[hstr(S.asn+'|hsmood|'+S.day)%HS_OPS_MOOD.length],{name});}
