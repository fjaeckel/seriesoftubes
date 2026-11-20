/* ---------- Rival clouds: the Hyperscaler's competition (37-hyper.js) ----------
   Five rival clouds already in the game (Amazin' Web Services, Microsnoft Azzure, Goggle Cloud, AliBubble Cloud, Miracle
   Cloud) compete for your tenants and AI runs. Each is strong on some continents (HS_RIVALS[].s). Every roll is a hash of
   the AS number and what it is about (hsRvU), never Math.random, so it is the same game every time and easy to read:
   - Bids. A rival may bid on a new tenant offer (S.hs.rv.of[offer id]: w the rival, bid its price per Gbps a month, d
     the day the tenant decides). You win at your own price when you fit better (hsRvFit: a region nearby, a front door
     and an edge stack in the tenant's city, against the rival's strength there); otherwise signing matches the rival's
     price. Wait past d and the rival signs them.
   - Renewals. A tenant whose term ends within HS_RV_WARN days and whose happiness is under HS_RV_POACH is courted (a
     warning first); still under it two days before the end, the rival poaches it.
   - Price wars. Now and then a rival undercuts in a continent where you have tenants (rv.pw: w, reg, from, until, f the
     cut, m 1 while you match). Matching costs f of those tenants' bills until it ends; ignoring it, tenants renewing
     there ask for the rival's price, and those under HS_RV_POACH_WAR happiness leave for it.
   - AI runs you let wait. A rival takes an AI lab's offered run (S.hs.jo) on day rv.jo[id].d unless you take it first.
   - Outages. Now and then a rival's region goes down (rv.dn: w, reg, until): it bids on nothing, and its tenants call
     you: a flash of new offers, at your price, no rival in sight.
   rv also keeps nw and nd (the earliest day of the next price war and outage), wn and pc (tenant id: the term already
   warned about and decided at renewal), lt and bt (tenants lost to rivals, contested ones won). */
const HS_RIVALS=[{n:"Amazin' Web Services",s:{AF:0.4,AM:0.85,AS:0.6,EU:0.75,OC:0.6,SA:0.55}},
 {n:'Microsnoft Azzure',s:{AF:0.5,AM:0.8,AS:0.55,EU:0.8,OC:0.55,SA:0.45}},
 {n:'Goggle Cloud',s:{AF:0.35,AM:0.8,AS:0.7,EU:0.7,OC:0.5,SA:0.5}},
 {n:'AliBubble Cloud',s:{AF:0.35,AM:0.3,AS:0.85,EU:0.4,OC:0.5,SA:0.3}},
 {n:'Miracle Cloud',s:{AF:0.3,AM:0.6,AS:0.4,EU:0.55,OC:0.35,SA:0.5}}];
const HS_RV_BID=0.6,HS_RV_JOB=0.5,HS_RV_WARN=30,HS_RV_POACH=65,HS_RV_POACH_WAR=80,HS_RV_KM=3000;
// Headlines: a rival signs a tenant you kept waiting, poaches one at renewal, takes a run, starts a price war, goes down.
const HS_RV_WIN=[N_('hyper_rivals.win_donuts'),N_('hyper_rivals.win_credits'),N_('hyper_rivals.win_slides'),N_('hyper_rivals.win_golf')];
const HS_RV_POACHED=[N_('hyper_rivals.poach_hoodie'),N_('hyper_rivals.poach_credits'),N_('hyper_rivals.poach_keynote'),N_('hyper_rivals.poach_free_egress')];
const HS_RV_JOBS=[N_('hyper_rivals.job_thinking'),N_('hyper_rivals.job_gpus'),N_('hyper_rivals.job_coupon')];
const HS_RV_WARS=[N_('hyper_rivals.war_credits'),N_('hyper_rivals.war_free_tier'),N_('hyper_rivals.war_blog')];
const HS_RV_DOWN=[N_('hyper_rivals.down_typo'),N_('hyper_rivals.down_status'),N_('hyper_rivals.down_dns'),N_('hyper_rivals.down_cert')];
const hsRvU=q=>hstr(((S&&S.asn)||0)+'|rv|'+q)%100000/100000;
const hsRvN=w=>HS_RIVALS[w]?HS_RIVALS[w].n:'';
const hsRvAt=(w,reg)=>(HS_RIVALS[w]&&HS_RIVALS[w].s[reg])||0.3;
const hsRvHead=(L,q,x)=>tr(L[Math.floor(hsRvU(q)*L.length)],x);
const hsRvDown=w=>{const D=S.hs.rv.dn;return !!D&&D.w===w&&D.until>S.day;};
// A price war is on in a continent: the war, or null. Ignored: on and not matched.
const hsRvWar=reg=>{const P=S.hs&&S.hs.rv&&S.hs.rv.pw;return P&&P.reg===reg&&P.from<=S.day&&P.until>S.day?P:null;};
const hsRvIgnored=reg=>{const P=hsRvWar(reg);return !!P&&!P.m;};
// Which rival is after something in a continent: weighted by how strong each is there, seeded on q. Not one that is down.
function hsRvWho(reg,q){const ws=HS_RIVALS.map((R0,w)=>hsRvDown(w)?0:Math.pow(hsRvAt(w,reg),2)),t=ws.reduce((a,x)=>a+x,0);if(!(t>0))return -1;
  let u=hsRvU(q)*t;for(let w=0;w<ws.length;w++){u-=ws[w];if(u<0&&ws[w]>0)return w;}return ws.findIndex(x=>x>0);}
// How well you fit a tenant in city c (0 to 1): a region nearby, a front door and an edge stack there; and what is missing.
function hsRvYou(c){const r=hsRgFor(c),km=r?kmBetween(r,c):Infinity,near=clamp(1-km/HS_RV_KM,0,1),door=hsDoor(c)?1:0,edge=S.hs.edge[c]?1:0,miss=[];
  if(near<0.8)miss.push(tr('hyper_rivals.miss_region'));if(!door)miss.push(tr('hyper_rivals.miss_door'));else if(!edge)miss.push(tr('hyper_rivals.miss_edge'));
  return {v:0.55*near+0.25*door+0.2*edge,miss,r,km};}
// You against the rival bidding on offer o: {you, them, win, miss}. A price war the rival wages there, ignored, adds to it.
function hsRvFit(o,x){const reg=CITY[o.city].reg,Y=hsRvYou(o.city),P=hsRvWar(reg),them=hsRvAt(x.w,reg)*(0.85+0.15*hsRvU('fit|'+o.name+'|'+o.city))+(P&&P.w===x.w&&!P.m?0.1:0);
  return {you:Y.v,them,win:Y.v>=them,miss:Y.miss};}
// The rival's bid on a tenant offer, decided once (no bid: w -1). Offers from a rival's outage get none.
function hsRvBid(o){const V=S.hs.rv;if(own(V.of,o.id))return V.of[o.id];const q=o.name+'|'+o.city,reg=CITY[o.city].reg;let x={w:-1};
  // Rival clouds notice you at their level (38-hyper-director.js): before that, nobody bids.
  if(hsDirOn('rv')&&hsRvU('bid|'+q)<HS_RV_BID){const w=hsRvWho(reg,'who|'+q);if(w>=0){const P=hsRvWar(reg),cut=P&&P.w===w?1-P.f:1;
    x={w,bid:Math.max(1,Math.round(o.rate*(0.8+0.12*hsRvU('price|'+q))*cut)),d:Math.min(o.exp-1,S.day+7+Math.floor(hsRvU('d|'+q)*8))};}}
  V.of[o.id]=x;return x;}
const hsRvOf=o=>{const x=S.hs&&S.hs.rv&&S.hs.rv.of[o.id];return x&&x.w>=0?x:null;};
// The rival courting a tenant at renewal: the one waging a price war there, or the strongest, seeded on the tenant.
const hsRvFor=b=>{const reg=CITY[b.city].reg,P=hsRvWar(reg);return P?P.w:hsRvWho(reg,'ren|'+b.name);};
const hsRvThr=b=>hsRvIgnored(CITY[b.city].reg)?HS_RV_POACH_WAR:HS_RV_POACH;
/* A day: bids decided and lost, AI runs taken, tenants courted and poached, price wars and outages come and go. */
function hsRvDay(d){const H=S.hs;if(!H||!H.rv)return;const V=H.rv;
  // Tenant offers: a bid on each new one; past its day, the rival signs the tenant.
  const ids=new Set(S.offers.map(o=>o.id));for(const k of Object.keys(V.of))if(!ids.has(k))delete V.of[k];
  for(const o of S.offers.slice()){if(o.type!=='cloud')continue;const x=hsRvBid(o);if(x.w<0||d<x.d)continue;
    S.offers=S.offers.filter(y=>y!==o);delete V.of[o.id];V.lt++;
    toast(`🥊 ${hsRvHead(HS_RV_WIN,'won|'+o.name,{rival:esc(hsRvN(x.w)),name:esc(o.name)})}`,'bad');}
  // AI runs on offer: a rival takes some of them if you wait.
  const jo=new Set(H.jo.map(x=>x.id));for(const k of Object.keys(V.jo))if(!jo.has(k))delete V.jo[k];
  for(const o of H.jo.slice()){if(!own(V.jo,o.id)){const q=o.n+'|'+o.a+'|'+o.b+'|'+o.exp,reg=CITY[o.a].reg,w=hsDirOn('rv')&&hsRvU('job|'+q)<HS_RV_JOB?hsRvWho(reg,'jw|'+q):-1;
      V.jo[o.id]=w<0?{w:-1}:{w,d:Math.min(o.exp-1,d+6+Math.floor(hsRvU('jd|'+q)*6))};}
    const x=V.jo[o.id];if(x.w<0||d<x.d||hsRvDown(x.w))continue;H.jo=H.jo.filter(y=>y!==o);delete V.jo[o.id];
    toast(`🥊 ${hsRvHead(HS_RV_JOBS,'job|'+o.n+'|'+o.exp,{rival:esc(hsRvN(x.w)),lab:esc(o.n)})}`,'bad');}
  // Renewals: courted under HS_RV_POACH (more in an ignored price war), poached two days before the term ends.
  for(const k of Object.keys(V.wn))if(!S.biz.some(b=>b.id===k))delete V.wn[k];for(const k of Object.keys(V.pc))if(!S.biz.some(b=>b.id===k))delete V.pc[k];
  for(const b of hsTen()){const te=b.te;if(!(te>d)||te-d>HS_RV_WARN||!hsDirOn('rv'))continue;const w=hsRvFor(b),thr=hsRvThr(b),reg=CITY[b.city].reg;if(w<0)continue;
    if(V.wn[b.id]!==te&&b.mood<thr){V.wn[b.id]=te;toast(tr('hyper_rivals.courting',{rival:esc(hsRvN(w)),name:esc(b.name),date:dateStr(te),p:thr}),'warn',[{l:tr('common.show_me'),act:'custGo',args:{id:b.id}}]);}
    if(te-d<=2&&V.pc[b.id]!==te){V.pc[b.id]=te;
      if(b.mood<thr){clGone(b,'cheap');V.lt++;toast(`🥊 ${hsRvHead(HS_RV_POACHED,'poach|'+b.name+'|'+te,{rival:esc(hsRvN(w)),name:esc(b.name)})}`,'bad');sfx('err');}
      else if(hsRvIgnored(reg)){const P=hsRvWar(reg);b.rate=Math.max(1,Math.round(b.rate*(1-P.f)));toast(tr('hyper_rivals.renewed_cheaper',{rival:esc(hsRvN(w)),name:esc(b.name),p:pct(P.f)}),'warn');}
      else V.bt++;}}
  // A price war ends, or starts where your tenants are.
  if(V.pw&&V.pw.until<=d){if(V.pw.m)S.stats.hsWar=(S.stats.hsWar||0)+1;toast(tr('hyper_rivals.war_over',{rival:esc(hsRvN(V.pw.w)),reg:REG[V.pw.reg]}),'good');delete V.pw;}
  // A price war is a crisis: the director (38-hyper-director.js) says when; asked again tomorrow if not now.
  const ts=hsTen();if(!V.pw&&d>=V.nw&&ts.length>=2){const regs=[...new Set(ts.map(b=>CITY[b.city].reg))].sort(),reg=regs[Math.floor(hsRvU('wr|'+d)*regs.length)],w=hsRvWho(reg,'ww|'+d);
    if(w>=0&&hsDirAsk('war',1,reg)){const f=Math.round((0.15+0.1*hsRvU('wf|'+d))*100)/100,until=d+45+Math.floor(hsRvU('wu|'+d)*30);V.pw={w,reg,from:d,until,f,m:0};V.nw=until+90+Math.floor(hsRvU('wn|'+d)*90);
      toast(`📉 ${hsRvHead(HS_RV_WARS,'wh|'+d,{rival:esc(hsRvN(w)),reg:REG[reg],p:pct(f)})}<br>${tr('hyper_rivals.war_choice',{p:pct(f),date:dateStr(until)})}`,'warn',[{l:tr('hyper_rivals.match'),act:'hsRvMatch',args:{on:1}}]);}}
  // A rival's region goes down: its tenants call you.
  if(V.dn&&V.dn.until<=d)delete V.dn;
  if(!V.dn&&d>=V.nd&&ts.length&&hsDirOn('rv')){const mine=Object.keys(S.pops).filter(c=>popUp(c)&&bizCity(c)).sort();if(mine.length){const regs=[...new Set(mine.map(c=>CITY[c].reg))].sort(),reg=regs[Math.floor(hsRvU('dr|'+d)*regs.length)],w=hsRvWho(reg,'dw|'+d);
    if(w>=0){const until=d+1+Math.floor(hsRvU('du|'+d)*3);V.dn={w,reg,until};V.nd=until+150+Math.floor(hsRvU('dn|'+d)*150);hsRvRefugees(d,reg,mine);}}}}
// Refugees from a rival's outage: two or three tenants call at once, near the outage where you can; ten days to sign.
function hsRvRefugees(d,reg,mine){const V=S.hs.rv,D=V.dn,cs=mine.filter(c=>CITY[c].reg===reg),at=cs.length?cs:mine,ks=Object.keys(CLOUD_TENANTS).filter(k=>CLOUD_TENANTS[k].lv<=lvl()),n=hsSlotFree()&&ks.length&&hsDirAsk('refugee')?2+(hsRvU('rn|'+d)<0.5?1:0):0;
  for(let i=0;i<n;i++){const k=ks[Math.floor(hsRvU('rk|'+d+'|'+i)*ks.length)],K=CLOUD_TENANTS[k],c=at[Math.floor(hsRvU('rc|'+d+'|'+i)*at.length)];
    const o=hsOffer(k,c,K.opts[Math.floor(hsRvU('rb|'+d+'|'+i)*K.opts.length)]);o.exp=d+10;S.offers.push(o);V.of[o.id]={w:-1};}
  toast(`🔥 ${hsRvHead(HS_RV_DOWN,'dh|'+d,{rival:esc(hsRvN(D.w)),reg:REG[reg]})}<br>${n?trn('hyper_rivals.refugees',n,{date:dateStr(d+10)}):tr('hyper_rivals.refugees_no_room')}`,n?'goal':'warn');if(n)sfx('coin');}
// Money: matching a price war takes its cut off what those tenants pay (as served this evening).
function hsRvMoney(R2,V){const H=S.hs;if(!H||!H.rv||!R2.hs)return;const P=H.rv.pw;R2.hs.pwc=0;if(!P||!P.m||P.from>S.day||P.until<=S.day)return;let c=0;
  for(const b of hsTen())if(CITY[b.city].reg===P.reg)c+=b.bw*b.rate*Math.min(1,hsTenQ(R2,b)/0.95)*P.f;R2.hs.pwc=c;V.business-=c;}
CX_DAY.push(hsRvDay);CX_MONEY.push(hsRvMoney);
CX_NEW.push(o=>{o.rv={of:{},jo:{},wn:{},pc:{},nw:S.day+90+Math.floor(hsRvU('nw0')*60),nd:S.day+120+Math.floor(hsRvU('nd0')*120),lt:0,bt:0};});
// Saves: every field repaired; bids only on offers and runs that still exist.
CX_SAN.push((h0,o,s)=>{const n=(v,d)=>Number.isFinite(+v)?+v:d,I=v=>Math.round(n(v,0)),obj=v=>v&&typeof v==='object'&&!Array.isArray(v),V=obj(h0.rv)?h0.rv:{},w=v=>clamp(I(v),-1,HS_RIVALS.length-1);
  const r={of:{},jo:{},wn:{},pc:{},nw:V.nw===undefined?I(s.day)+60:I(V.nw),nd:V.nd===undefined?I(s.day)+120:I(V.nd),lt:Math.max(0,I(V.lt)),bt:Math.max(0,I(V.bt))};
  const offs=new Set((s.offers||[]).filter(x=>x&&x.type==='cloud').map(x=>x.id)),jo=new Set((o.jo||[]).map(x=>x.id)),biz=new Set((s.biz||[]).filter(b=>b&&b.type==='cloud').map(b=>b.id));
  if(obj(V.of))for(const k of Object.keys(V.of).slice(0,200)){const x=V.of[k];if(!offs.has(k)||!obj(x))continue;const v=w(x.w);r.of[k]=v<0?{w:-1}:{w:v,bid:Math.max(1,I(x.bid)),d:I(x.d)};}
  if(obj(V.jo))for(const k of Object.keys(V.jo).slice(0,20)){const x=V.jo[k];if(!jo.has(k)||!obj(x))continue;const v=w(x.w);r.jo[k]=v<0?{w:-1}:{w:v,d:I(x.d)};}
  for(const f of ['wn','pc'])if(obj(V[f]))for(const k of Object.keys(V[f]).slice(0,2000))if(biz.has(k))r[f][k]=I(V[f][k]);
  if(obj(V.pw)&&REG[V.pw.reg]){const v=w(V.pw.w);if(v>=0)r.pw={w:v,reg:V.pw.reg,from:I(V.pw.from),until:I(V.pw.until),f:clamp(n(V.pw.f,0.2),0.05,0.5),m:V.pw.m?1:0};}
  if(obj(V.dn)&&REG[V.dn.reg]){const v=w(V.dn.w);if(v>=0)r.dn={w:v,reg:V.dn.reg,until:I(V.dn.until)};}
  o.rv=r;});
