/* ---------- The Hyperscaler's failures: regions that go down, failover and drills (37-hyper.js) ----------
   A region can fail: an incident of its own (failureRun's 'region' kind, 85-incidents/20-failures.js), its POP going
   dark (a router crash, a power cut), its metro's grid tripping (a deep cut or a heatwave, 38-hyper-power.js), or the
   chaos monkey's big cousin, Chaos Kong, evacuating it on purpose (40-chaos-monkey.js). S.hs.down[city] is the day a
   failed region is back. While a region is out, hsFlows homes the users and tenants it served only in its replica
   region (S.hs.rep, 38-hyper-traffic.js), as far as the replica has room and the backbone carries them: a failover never
   invents capacity (gameplay rule M12). Backlog the region still owed its replica (S.hs.lag) over HS_RISK TB at the
   moment of failure is lost data: HS_LOSS of the users homed there leave, a fine, a headline. An outage the users came
   through without data loss and served well (S.hs.out tracks it) counts as survived (S.hs.fsv).
   Drills: the player drains a region into its replica on purpose for a day (hsDrill, HS_DRILL). It passes if every
   country homed there was served at HS_DRILL_Q or better and the backlog was under HS_RISK; S.hs.drill['a|b'] keeps
   the day a pair passed. S.hs.dx is the drill under way. Real underneath: cloud regions fail as a whole now and then,
   and the operators that cope run region evacuation drills; real chaos tooling once named a region-killer Chaos Kong. */
const HS_RISK=50,HS_LOSS=0.2,HS_LOSS_FEE=250000,HS_LOSS_TB=1000,HS_LOSS_MAX=2000000,HS_LOSS_MO=1,HS_DRILL=20000,HS_DRILL_Q=0.9,HS_FAIL_W=2,HS_FAIL_FIX=40000;
const HS_FAIL_MSG=[N_('hyper_fail.msg_squirrel'),N_('hyper_fail.msg_cert'),N_('hyper_fail.msg_cooling'),N_('hyper_fail.msg_dns'),N_('hyper_fail.msg_tag'),N_('hyper_fail.msg_ups')];
const HS_LOSS_NEWS=[N_('hyper_fail.news_cats'),N_('hyper_fail.news_spreadsheet'),N_('hyper_fail.news_wedding'),N_('hyper_fail.news_save')];
// A failed region (until S.hs.down says), and a region out of play tonight for any reason (failed or drained).
function hsDownAt(c){const H=S&&S.hs;return !!H&&!!H.down&&H.down[c]>S.day;}
function hsOff(c){const H=S&&S.hs;return !!H&&(hsDownAt(c)||!!H.dx&&H.dx.c===c);}
// A built region that is not serving tonight: failed, drained, or its POP is dark. Its users go to its replica.
function hsOut(c){const H=S&&S.hs,d=H&&H.rg&&H.rg[c];return !!d&&d.ready<=S.day&&!!S.pops[c]&&!hsLive(c);}
// The region a tenant is served from tonight (hsFlows): its own, its replica while it is out, or a new one.
function hsTenRg(b,fo){if(hsLive(b.rg))return b.rg;if(fo&&b.rg&&own(fo,b.rg)){const r=fo[b.rg];return r&&hsTenFoOk(b.p,b.city,r)?r:null;}return hsRgFor(b.city,null,b.p);}
// Countries whose users call region c home.
const hsHomedAt=c=>Object.keys(S.hs.cc).filter(k=>S.hs.cc[k].home===c).sort();
/* Failover readiness (the NOC, the Cloud tab, read-only): could replica b take region a's users and tenants tonight?
   need: what a serves at the evening peak; room: what b has left; bw: the widest spare path between them on your
   backbone (parallel links added up); law: countries (and sovereign tenants) that may not move to b. */
function hsWide(a,b){if(a===b)return Infinity;const sp={},LK=(R.hs&&R.hs.lakeL)||{};for(const l of S.links){if(linkDown(l))continue;const k=l.a<l.b?l.a+'|'+l.b:l.b+'|'+l.a;sp[k]=(sp[k]||0)+Math.max(0,capOf(l)-((R.load&&R.load[l.id])||0));}
  // The data lake pauses in a failover (38-hyper-traffic.js): its share of each link is free for it.
  for(const k in sp)if(LK[k])sp[k]+=LK[k];
  const adj={};for(const k in sp){const [x,y]=k.split('|');(adj[x]||(adj[x]=[])).push([y,sp[k]]);(adj[y]||(adj[y]=[])).push([x,sp[k]]);}
  const best={[a]:Infinity},done=new Set();for(;;){let u=null,bv=0;for(const k in best)if(!done.has(k)&&best[k]>bv){bv=best[k];u=k;}if(u===null)return 0;if(u===b)return bv;done.add(u);
    for(const [v,w] of adj[u]||[]){const m=Math.min(bv,w);if(m>(best[v]||0))best[v]=m;}}}
function hsFailInfo(a,b){const H=S.hs,o=R.hs;b=b===undefined?hsRepOf(a):b;const xa=o&&o.rg[a],xb=b&&o&&o.rg[b];
  const law=b?hsHomedAt(a).filter(k=>!hsResFoOk(k,b)).map(k=>ccName(k)).concat(hsTen().filter(t=>t.rg===a&&!hsTenFoOk(t.p,t.city,b)).map(t=>t.name)):[];
  const need=xa?xa.load:0,room=xb?Math.max(0,xb.g-xb.load):0,bw=b?hsWide(a,b):0;
  return {b,need,room,bw,law,ok:!!b&&!!xb&&room>=need-0.5&&bw>=need-0.5&&!law.length};}
const hsFailReady=(a,b)=>!!S.hs&&!!R.hs&&hsLive(a)&&hsFailInfo(a,b).ok;
/* A region fails for dur days: an incident like any other (rush repair: HS_FAIL_FIX), and the failover starts. */
function hsRegionFail(c,dur,msg,cost){const H=S.hs;H.down[c]=Math.max(H.down[c]||0,S.day+dur);
  addInc({type:'region',ref:c,until:H.down[c],msg,cost:cost===undefined?HS_FAIL_FIX:cost,fix:tr('hyper_fail.fix')});hsFailStart(c);}
// failureRun's region kind: a live region out of several (one region down is a plain outage, not a failover).
// Only once whole-region failures are on (38-hyper-director.js: two live regions, the level, past day HS_DIR_BIG).
const hsFailOn=()=>hyper()&&!!S.hs&&hsRgs().length>=2&&hsDirOn('fail');
// One building's trouble (a squirrel, a certificate...) in a region with a zone to spare takes only that zone (hsAzFail,
// 38-hyper-zones.js); a change pushed to every building takes the region. The dice roll as they always did.
function hsFailFire(){const rs=hsRgs();if(rs.length<2)return false;const c=pick(rs),dur=1+Math.floor(Math.random()*3),k=Math.floor(Math.random()*HS_FAIL_MSG.length);
  if(hsAzFail(c,dur,k))return true;hsRegionFail(c,dur,tr(HS_FAIL_MSG[k],{city:CITY[c].name}));return true;}
// The fine for lost data: a base and a price per TB lost, at most HS_LOSS_MAX, and never more than HS_LOSS_MO months of
// revenue, and never more than leaves you $50k in the red (a young cloud's lost cat photos make the news, not a
// bankruptcy court: the users who leave are the real price).
const hsLossFee=lag=>Math.round(Math.min(HS_LOSS_MAX,HS_LOSS_FEE+lag*HS_LOSS_TB,HS_LOSS_MO*(R.revMo||0),Math.max(0,S.cash+50000)));
/* The moment of failure: what the region still owed its replica is checked now. Over HS_RISK TB it is gone, and so are
   HS_LOSS of the users homed there. */
function hsFailStart(c){const H=S.hs;if(H.out[c])return;const lag=hsLagAt(c),lost=lag>HS_RISK,cc=hsHomedAt(c),b=hsRepOf(c);
  H.out[c]={d:S.day,lost:lost?1:0,q:1,n:cc.length+hsTen().filter(t=>t.rg===c).length};
  if(!lost)return toast(b?tr('hyper_fail.failover',{city:esc(CITY[c].name),b:esc(CITY[b].name)}):tr('hyper_fail.no_replica',{city:esc(CITY[c].name)}),b?'':'bad',[],{a:'city',v:c});
  let gone=0;for(const k of cc){const x=H.cc[k],l=x.d*HS_LOSS;x.d=Math.max(1,x.d-l);gone+=l;}
  for(const k of Object.keys(H.lag))if(k.startsWith(c+'>'))delete H.lag[k];
  for(const t of hsTen())if(t.rg===c)t.mood=Math.max(0,t.mood-25);
  const fee=hsLossFee(lag);S.cash-=fee;H.flost=(H.flost|0)+1;S.stats.hsLost=(S.stats.hsLost||0)+1;
  toast(`<b>📰 ${tr(HS_LOSS_NEWS[hstr(S.asn+'|news|'+c+'|'+S.day)%HS_LOSS_NEWS.length],{city:esc(CITY[c].name)})}</b><br>`+tr('hyper_fail.data_lost',{tb:hsTb(lag),city:esc(CITY[c].name),g:fmtG(gone),fee:fmt$(fee)}),'bad',[],{a:'city',v:c});sfx('err');track('hs_data_loss');}
/* Chaos Kong (40-chaos-monkey.js): on about one snip in four, when there is a region to fail over from, the monkey's
   big cousin evacuates a whole region for two days instead. Seeded on the day, so the dice roll as they would. */
const hsKong=()=>hyper()&&!!S.hs&&hsRgs().length>=2&&hsDirOn('fail')&&hstr(S.asn+'|kong|'+S.day)%4===0;
function* hsKongRun(){const M=S.monkey,rs=hsRgs(),c=rs[hstr(S.asn+'|kongc|'+S.day)%rs.length],before=R.served,v={city:CITY[c].name};M.n++;M.c=c;
  hsRegionFail(c,2,tr('hyper_fail.kong',v),0);const i=S.inc[S.inc.length-1];yield;const imp=Math.max(0,before-R.served);if(i)i.impact=imp;
  const felt=before>1&&imp>=before*0.03;if(felt)M.hurt++;else S.stats.survived++;
  toast(felt?`<b>🦍 ${incTitle('region')}</b><br>${esc(i?i.msg:'')}`:tr('hyper_fail.kong_ok',v),felt?'bad':'good',[],{a:'city',v:c});sfx(felt?'err':'alert');}
/* A day: outages begin (a dark POP, a tripped grid) and end, a drill is judged. Grid trips read the chaos rule. */
function hsFailDay(d){const H=S.hs;if(!H||!hyper())return;const o=R.hs,drain=H.dx&&H.dx.c;
  for(const c of Object.keys(H.down))if(!(H.down[c]>d)||!H.rg[c])delete H.down[c];
  if(chaosMul()>0)hsTripDay(d);
  for(const c of Object.keys(H.rg)){if(!hsOut(c)||c===drain)continue;if(!H.out[c])hsFailStart(c);const x=H.out[c];
    for(const k of hsHomedAt(c))x.q=Math.min(x.q,hsQ(R,k));}
  for(const c of Object.keys(H.out)){if(H.rg[c]&&hsOut(c)&&c!==drain)continue;const x=H.out[c];delete H.out[c];if(!H.rg[c])continue;
    const ok=!x.lost&&x.n>0&&x.q>=CX_GOOD,v={city:esc(CITY[c].name),p:pct(x.q)};if(ok)H.fsv=(H.fsv|0)+1;
    toast(ok?tr('hyper_fail.back_ok',v):x.lost?tr('hyper_fail.back_lost',v):x.n?tr('hyper_fail.back_poor',v):tr('hyper_fail.back_empty',v),ok?'goal':'',[],{a:'city',v:c});}
  if(H.dx&&d>=H.dx.d)hsDrillJudge(d);}
/* Grid trips (a metro squeezed under half of what the region draws, or a heatwave on its continent) take a whole region
   down, so they are a region failure: only with two live regions (hsFailOn), and announced a day ahead (S.hs.dir.w,
   38-hyper-director.js) with an answer: rent chillers or generators for the night (hsPrecool), or move load away. With
   one region the squeeze alone serves less (hsCut), and nothing trips. */
const hsTripWhy=c=>hsCut(c)<0.5?'cut':hsEv(c).some(e=>e.k==='heat')?'heat':'';
const hsChillCost=c=>Math.max(HS_DIR_CHILL,Math.round(hsPwBill(c)/2000)*1000);
function hsTripDay(d){const D=hsDir(),cm=chaosMul(),w=D.w;
  if(w&&w.d<=d){D.w=null;const c=w.c,v={city:CITY[c].name,util:tr(hsUtil(c))};
    if(!w.ok&&hsLive(c)&&hsTripWhy(c)&&hsFailOn()){hsRegionFail(c,1+hstr(S.asn+'|tripd|'+c+'|'+d)%2,tr('hyper_fail.grid_trip',v));toast(`<b>${incTitle('region')}</b><br>${esc(S.inc[S.inc.length-1].msg)}`,'bad',[{l:tr('common.open'),act:'popGo',args:{city:c}}],{a:'city',v:c});}
    else toast(w.ok?tr('hyper_dir.held',v):tr('hyper_dir.passed',v),'good',[],{a:'city',v:c});}
  if(D.w||!hsFailOn())return;
  for(const c of hsRgs()){const r=hstr(S.asn+'|trip|'+c+'|'+d)%1000,k=hsTripWhy(c);if(!(k==='cut'&&r<250*cm||k==='heat'&&r<4*cm))continue;if(!hsDirAsk('trip',1.5,c))return;
    D.w={c,d:d+1,k,ok:0};const used=hsMwUsed(c),give=Math.max(1,hsSupply(c)-hsTown(c)),v={city:esc(CITY[c].name),util:tr(hsUtil(c)),p:clamp(Math.round(100*used/give),1,99)};
    toast(k==='heat'?tr('hyper_dir.warn_heat',v):tr('hyper_dir.warn_cut',{...v,p:Math.round(100*hsCut(c))}),'bad',
      [{l:k==='heat'?tr('hyper_dir.chill_btn',{cost:fmt$(hsChillCost(c))}):tr('hyper_dir.gen_btn',{cost:fmt$(hsChillCost(c))}),act:'hsPrecool',args:{city:c}},{l:tr('common.open'),act:'popGo',args:{city:c}}],{a:'city',v:c});sfx('alert');return;}}
// The drill's verdict, from tonight's routing: why it failed (the first thing wrong), or a pass.
function hsDrillJudge(d){const H=S.hs,x=H.dx,c=x.c,o=R.hs;H.dx=null;if(!H.rg[c])return;const b=o&&o.fo&&own(o.fo,c)?o.fo[c]:null,cc=hsHomedAt(c).filter(k=>o&&o.cc[k]);
  const q=cc.reduce((m,k)=>Math.min(m,hsQ(R,k)),1),lag=hsLagAt(c),v={a:esc(CITY[c].name),b:b?esc(CITY[b].name):'',p:pct(q),tb:hsTb(lag),n:HS_RISK};
  const why=!b?'none':cc.some(k=>o.cc[k].blk)?'law':cc.some(k=>o.cc[k].short>0.5)?'room':cc.some(k=>o.cc[k].want-o.cc[k].got>0.5)?'haul':q<HS_DRILL_Q?'slow':lag>=HS_RISK?'lag':'';
  if(!why){H.drill[hsPk(c,b)]=d;toast(tr('hyper_fail.drill_pass',v),'goal',[],{a:'city',v:c});sfx('coin');return;}
  const m={none:tr('hyper_fail.drill_none',v),law:tr('hyper_fail.drill_law',v),room:tr('hyper_fail.drill_room',v),haul:tr('hyper_fail.drill_haul',v),slow:tr('hyper_fail.drill_slow',v),lag:tr('hyper_fail.drill_lag',v)}[why];
  toast(`<b>${tr('hyper_fail.drill_failed')}</b><br>${m}`,'bad',[],{a:'city',v:c});sfx('err');}
CX_DAY.push(hsFailDay);
CX_NEW.push(o=>{o.down={};o.drill={};o.dx=null;o.out={};o.fsv=0;o.flost=0;});
// Saves: outages, drills and their records, against the regions the save still has.
CX_SAN.push((h0,o)=>{const n=(v,d)=>Number.isFinite(+v)?+v:d,obj=v=>v&&typeof v==='object'&&!Array.isArray(v),rg=c=>typeof c==='string'&&own(o.rg,c),I=v=>Math.round(n(v,0));
  o.down={};if(obj(h0.down))for(const k of Object.keys(h0.down))if(rg(k)&&I(h0.down[k])>0)o.down[k]=I(h0.down[k]);
  o.drill={};if(obj(h0.drill))for(const k of Object.keys(h0.drill)){const [a,b,x]=k.split('|');if(x===undefined&&rg(a)&&rg(b)&&a<b)o.drill[k]=Math.max(0,I(h0.drill[k]));}
  const x=h0.dx;o.dx=obj(x)&&rg(x.c)&&rg(x.b)&&x.c!==x.b?{c:x.c,b:x.b,d:I(x.d)}:null;
  o.out={};if(obj(h0.out))for(const k of Object.keys(h0.out)){const y=h0.out[k];if(rg(k)&&obj(y))o.out[k]={d:I(y.d),lost:y.lost?1:0,q:clamp(n(y.q,1),0,1),n:Math.max(0,I(y.n))};}
  o.fsv=Math.max(0,I(h0.fsv));o.flost=Math.max(0,I(h0.flost));});
