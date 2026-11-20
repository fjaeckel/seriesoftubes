/* ---------- The Hyperscaler charter ----------
   Users come to you. You launch in countries; each country's users peak in the evening (S.hs.cc[cc].d, Gbps) and grow
   while service is good. They enter at the front door nearest them: any POP of yours with a way out (transit, an
   exchange port or a PNI) that your backbone joins to a live region. An edge stack there serves the static quarter
   (HS_EDGE) on the spot; everything else is dynamic and comes from their home region over your backbone, carried before
   IP routing (the haul, 37-content-core.js). What the backbone cannot carry, users lose. Quality is the share served
   times a latency factor from the real path latency, front door to region (hsLatF), plus the users' own way to the
   door. Regions are campuses at your POPs in big metros, in tiers (HS_T) with Gbps, compute slots and megawatts; the
   starter Rack Shack at home is free. Tenants (S.biz of type cloud, 41-cloud-products.js) buy bundles of cloud
   products, placed at their home city and served from a region (b.rg). A Hyperscaler never sells transit and never
   sells to homes: its offers are cloud bundles only. Its own goals (HYPER_GOALS); levels count peak traffic, regions
   and continents with a region (LV_X). The win, Cloud Nine, comes later (phase 4). */
const HS_RATE=220,HS_POT=0.4,HS_GROW=0.05,HS_START=0.08,HS_EDGE=0.25,HS_EDGE_COST=150000,HS_EDGE_MO=3000,HS_MIN_P=300;
// Latency users feel, one way: none up to HS_MS[0] ms, the factor falling to HS_MS[2] at HS_MS[1] ms and beyond.
const HS_MS=[15,120,0.6];
// Region tiers: index 0 is the starter every Hyperscaler gets at home; the rest are built (lv: the level that allows it).
const HS_T=[{n:N_('hyper.t_shack'),g:400,mw:5,slots:4,cost:0,mo:3000,lv:1,days:0},
 {n:N_('hyper.t_barn'),g:1500,mw:20,slots:12,cost:400000,mo:15000,lv:1,days:60},
 {n:N_('hyper.t_campus'),g:5000,mw:60,slots:40,cost:2500000,mo:45000,lv:4,days:90},
 {n:N_('hyper.t_gulch'),g:15000,mw:200,slots:120,cost:8000000,mo:120000,lv:8,days:120},
 // HS_CAGE: a leased colo cage in someone else's data center (38-hyper-zones.js). Not a step on the ladder above: it is
 // never grown in place (hsTNext), only moved out of into a Server Barn; cost is the setup fee, mo the lease, and its
 // megawatts are the provider's (mw 0: none from your grid budget; the provider passes the power bill on).
 {n:N_('hyper_colo.t_cage'),g:600,mw:0,slots:3,cost:40000,mo:30000,lv:2,days:14}];
const HS_CAGE=4;
// The tier a region grows into next, or null (the top of the ladder, or a cage).
const hsTNext=d=>d&&d.t+1<HS_CAGE?HS_T[d.t+1]:null;
// What each level asks of a Hyperscaler (index i: to reach level i+1): its own peak (Gbps), regions, and continents with a
// region. A cloud's peak is what its regions can serve, a few Tbps the first year, not a carrier's whole network: the
// classic ladder (LV_REQ) asks 6 Tbps for level 5, which a cloud with a Rack Shack and two Server Barns cannot reach.
const HS_LV_PK=[0,150,600,1200,2000,3500,5000,7000,9500,12500,16000,20000,25000];
const HS_LV_RG=[0,1,2,2,3,4,5,6,7,8,9,10,12],HS_LV_CT=[0,0,0,1,2,2,3,3,4,4,5,5,5];
function hsNew(){return cxNew({cc:{},rg:{[S.home]:{t:0,ready:0,mw:HS_T[0].mw}},edge:{},t1:0,won:0});}
// Countries: how many users they could ever have, what launching costs, and why not.
const hsPot=cc=>{const I=ccInfo(cc);return I?I.P*HS_POT*eraMul()*cxMul('pot',cc):0;};
const hsLic=cc=>{const I=ccInfo(cc);return I?Math.round((8000+I.P*6)/1000)*1000:0;};
const hsWhy=cc=>{const I=ccInfo(cc);if(!I||!I.nets.length)return tr('hyper.nobody_online_here');if(I.cn)return tr('hyper.great_firewall');return '';};
const hsUsers=()=>S.hs?Object.values(S.hs.cc).reduce((a,x)=>a+x.d,0):0;
// Regions: where they may go, how many your level allows, which are live.
const hsSite=c=>c===S.home||siteOk(c,HS_MIN_P);
const hsRgMax=()=>HS_LV_RG[Math.min(lvl(),HS_LV_RG.length-1)]+1;
// Regions held against the level's limit: built or building, at a POP you still have.
const hsRgN=()=>Object.keys(S.hs.rg).filter(c=>!!S.pops[c]).length;
// A region that failed or is drained by a drill is not live (38-hyper-failover.js).
const hsLive=c=>!!S.hs&&siteLive(S.hs.rg,c)&&popUp(c)&&!hsOff(c);
const hsRgs=()=>S.hs?Object.keys(S.hs.rg).filter(hsLive).sort():[];
const hsSlots=c=>HS_T[S.hs.rg[c].t].slots+hsAzSlots(c);
const hsTen=()=>S.biz.filter(b=>b.type==='cloud');
const hsSlotsUsed=c=>hsTen().filter(b=>b.rg===c).length+hsTrainSlotsAt(c);
const hsSlotFree=()=>hsRgs().some(r=>hsSlotsUsed(r)<hsSlots(r));
// The grid a metro has for everyone, town included (seeded, 40 to 600 MW; power itself comes later).
const hsGrid=c=>Math.round(clamp(40+CITY[c].P*0.25+hstr('grid|'+c)%120,40,600));
// The region a tenant in city c is served from: the nearest live one with a free compute slot, else the nearest. p: its
// products; Very Sovereign Cloud only ever lives in its own country (38-hyper-residency.js).
function hsRgFor(c,skip,p){const rs=hsRgs().filter(r=>hsTenResOk(p,c,r)).sort((a,b)=>kmBetween(a,c)-kmBetween(b,c)||(a<b?-1:1));return rs.find(r=>r!==skip&&hsSlotsUsed(r)<hsSlots(r))||rs[0]||null;}
// Front doors: POPs with a way out. hsDoor(c): this one is (and its TLS certificate has not expired, 71-hyper-incidents.js).
const hsDoor=c=>!!S.pops[c]&&popUp(c)&&cxOut(c)&&!hsCertOut(c);
const hsLatF=ms=>ms<=HS_MS[0]?1:ms>=HS_MS[1]?HS_MS[2]:1-(1-HS_MS[2])*(ms-HS_MS[0])/(HS_MS[1]-HS_MS[0]);
// The users' own way to the door, in ms (light in fiber, a little detour).
const hsAcc=(v,m)=>kmBetween(v,m)*1.25/200;
/* compute(): the evening, as flows (CX_FLOW). Tenants first (they have contracts), then every country's users, each
   placed in the live regions nearest by backbone latency to its front door, as far as each region has room. A part
   served from another region than the door is a haul job the backbone carries before routing; the edge stack's static
   quarter starts at the door and is never hauled. R.hs: cc (per country: D demand, v front door, st served by the edge
   stack, parts [door, Gbps, ms, region], home region, want and got of the haul, short), rg (g room, load), door (per
   front door: g hauled to it, got), hl (per region and door 'r>v': [wanted, got]), ten (per tenant: r region, v door, want, f share placed, ms, r2 second region,
   got), short (users no region had room for). */
function hsFlows(R2,flow,DEMTO,X){const H=S.hs;if(!H||!hyper())return null;
  const out={cc:{},rg:{},door:{},ten:{},short:0},jobs=[];R2.hs=out;const rgs=hsRgs(),room={};
  for(const r of rgs){room[r]=siteRoom(hsRgG(r),r);out.rg[r]={g:room[r],load:0,u:0,bt:0,nt:0};}
  const MS=new Map(),ms=(a,b)=>{const k=a+'>'+b;let v=MS.get(k);if(v===undefined)MS.set(k,v=X.ms(a,b));return v;};
  // Each region's replica (38-hyper-traffic.js): where its copies go tonight.
  for(const r of rgs)out.rg[r].rep=hsRepOf(r,rgs,ms);
  // Users homed in a region that is out tonight may only go to its replica (38-hyper-failover.js); residency pins
  // others to their country or bloc (38-hyper-residency.js). fo: each region out tonight and the replica that takes over.
  const fo=out.fo={};for(const c in H.rg)if(hsOut(c))fo[c]=hsRepOf(c,rgs,ms);out.blk=0;
  // Front doors your backbone joins to at least one live region.
  const doors=Object.keys(S.pops).filter(hsDoor).sort().filter(d=>rgs.some(r=>ms(r,d)<Infinity));
  const add=(c,j,x,bz)=>{if(x<=1e-9)return;flow(CIDX[c],j,x,false,bz);R2.cityDem[c]=(R2.cityDem[c]||0)+x;R2.demand+=x;DEMTO[j]+=x;};
  const job=(o,v,x,lo,k,id)=>{if(o!==v&&x>1e-9)jobs.push({o,v,x,lo,hi:X.nf(),k,id});};
  // Users behind player home ISPs and edge nodes in partner networks (89-fedplay-hyper.js).
  const PN=hsfPlayers();
  for(const b of S.biz){if(b.type!=='cloud'||!Array.isArray(b.p))continue;const I=ccInfo(CITY[b.city].cc);if(!I)continue;const nets=hsfNets(I,PN);
    const r=hsTenRg(b,fo),T={r,v:null,want:0,f:0,ms:Infinity,r2:null,got:0,hw:0};out.ten[b.id]=T;if(!r)continue;
    const v=doors.includes(b.city)&&ms(r,b.city)<Infinity?b.city:doors.filter(d=>ms(r,d)<Infinity).sort((a,c)=>kmBetween(a,b.city)-kmBetween(c,b.city)||(a<c?-1:1))[0];if(!v)continue;
    // A game studio's launch day multiplies its traffic (hsSpike, 38-hyper-freeze.js).
    const bw=b.bw*hsSpike(b),sh=cloudShape(b.p),es=H.edge[v]?bw*sh.eo:0,dyn=bw*sh.out-es,inn=bw*sh.in,want=dyn+inn,f=want>1e-9?Math.min(1,room[r]/want):1;
    room[r]-=want*f;out.rg[r].load+=want*f;T.v=v;T.want=want;T.f=f;T.ms=ms(r,v)*(H.edge[v]?0.5:1)+hsAcc(v,b.city);T.es=es;
    for(const [j,w] of nets)add(v,j,es*w,true);
    let lo=X.nf();for(const [j,w] of nets)add(v,j,dyn*f*w,true);job(r,v,dyn*f,lo,'out',b.id);if(r!==v)T.hw+=dyn*f;
    // Ingest rides the same path the other way. Copies between two regions (databases, clusters, the archive's night
    // copy) go to the region's replica as bulk replication (38-hyper-traffic.js), after every interactive flow.
    lo=X.nf();job(r,v,inn*f,lo,'in',b.id);if(r!==v)T.hw+=inn*f;
    const r2=out.rg[r].rep;T.r2=r2;T.bt=0;T.btg=0;
    if(r2&&sh.bt>0){const nt=hsNightBt(b.p)*bw*f;T.bt=bw*sh.bt*f;out.rg[r].bt+=T.bt-nt;out.rg[r].nt+=nt;}}
  const pairs=[],left={};
  const NT={},FH={};
  for(const cc of Object.keys(H.cc).sort()){const I=ccInfo(cc);if(!I)continue;const D=H.cc[cc].d,o={D,v:null,st:0,parts:[],home:null,want:0,got:0,short:0,nd:0};out.cc[cc]=o;
    // Edge nodes in partner networks serve the static share of the users behind them; their connections end there.
    const nets=NT[cc]=hsfNets(I,PN),E=rgs.length?hsfEdgeCut(cc,D,nets,out):null,xs=E?E.st:0,xu=E?E.u:0;FH[cc]=D>0?xu/D:0;if(E){o.nd=xs;o.parts.push(...E.parts);}
    const v=cxPop(cc,doors);if(!v){left[cc]=D-xs;continue;}o.v=v;
    if(H.edge[v]){o.st=(D-xu)*HS_EDGE+Math.max(0,xu*HS_EDGE-xs);for(const [j,w] of nets)add(v,j,o.st*w,false);o.parts.push([v,o.st,hsAcc(v,I.main),null]);}
    left[cc]=D-o.st-xs;let ok=false;for(const r of rgs){if(!hsHomeOk(cc,r,fo))continue;ok=true;const m=ms(r,v);if(m<Infinity)pairs.push([m,cc,r]);}if(!ok)o.blk=1;}
  pairs.sort((a,b)=>a[0]-b[0]||(a[1]<b[1]?-1:a[1]>b[1]?1:0)||(a[2]<b[2]?-1:1));
  for(const [m,cc,r] of pairs){const take=Math.min(left[cc],room[r]);if(take<=1e-9)continue;left[cc]-=take;room[r]-=take;out.rg[r].load+=take;out.rg[r].u+=take;
    const o=out.cc[cc],I=ccInfo(cc);if(!o.home)o.home=r;const lo=X.nf();for(const [j,w] of NT[cc])add(o.v,j,take*w,false);
    o.parts.push([o.v,take,hsAcc(o.v,I.main)+(H.edge[o.v]?m*0.5:m*(1-0.5*FH[cc])),r]);if(r!==o.v){job(r,o.v,take,lo,'u',cc);o.want+=take;}}
  // Users with nowhere they may be homed are not short of room: they wait for a region they may use (blk).
  for(const cc in out.cc){const s=left[cc]||0;if(s>1e-9){const o=out.cc[cc];o.short=s;if(o.blk)out.blk+=s;else out.short+=s;R2.demand+=s;}}
  return jobs;}
// After routing (CX_POST): what each haul got, by front door, and by region and door (hl['region>door'] = [wanted, got],
// for the NOC dashboard's Cloud tab).
function hsPost(R2,J){const out=R2.hs;if(!out)return;const hl=out.hl={};for(const x of J){if(!x.k)continue;const d=out.door[x.v]||(out.door[x.v]={g:0,got:0});d.g+=x.x;d.got+=x.got;
  const p=hl[x.o+'>'+x.v]||(hl[x.o+'>'+x.v]=[0,0]);p[0]+=x.x;p[1]+=x.got;
  if(x.k==='u'){const o=out.cc[x.id];if(o)o.got+=x.got;}else{const T=out.ten[x.id];if(T)T.got+=x.got;}}}
// How well a country is served: what reached it from each part, times how its latency feels.
// A part served in a partner's network (an edge node, p[4]) is served in full.
function hsQ(r,cc){const o=r&&r.hs&&r.hs.cc[cc];if(!o||o.D<=1e-9)return 1;let q=0;for(const p of o.parts)q+=p[1]*(p[4]?1:sfOf(r,p[0]))*hsLatF(p[2]);return clamp(q/o.D,0,1);}
const hsRev=(r,cc)=>S.hs.cc[cc].d*hsQ(r,cc)*HS_RATE*cxMul('rev',cc);
/* A tenant's products, each scored on its own need, times what was served; the bundle sits closer to its worst product
   than to the average (one neglected product sours the lot). */
function hsNeedQ(r,b,id){const T=r&&r.hs&&r.hs.ten[b.id],P=CLOUD_PRODUCTS[id];if(!T||!T.v||!P)return 0;const H=S.hs,rg=H.rg[T.r];
  const n=P.need,need=n==='pair'?(T.r2?1:0.8):n==='doors'?(Object.keys(S.pops).filter(hsDoor).length>=2?1:0.9):n==='edge'?(H.edge[T.v]?1:0.8)
    :n==='port'?(T.v===b.city||id==='pc'&&hsfRamp(b.city)?1:0.7):n==='power'?(rg&&rg.t>=2&&rg.t<HS_CAGE?1:0.85):n==='home'?(CITY[T.r].cc===CITY[b.city].cc?1:0.5):n==='model'?(hsAiOn()?1:0.5):1;
  return need*(1-P.lat*(1-hsLatF(T.ms)))*hsIncNeed(id);}
function hsTenQ(r,b){const T=r&&r.hs&&r.hs.ten[b.id];if(!T||!T.v||!Array.isArray(b.p)||!b.p.length)return 0;
  const hw=T.hw+(T.bt||0),hauled=hw>1e-9?clamp((T.got+(T.btg||0))/hw,0,1):1,sv=T.f*sfOf(r,T.v)*hauled,q=b.p.map(id=>hsNeedQ(r,b,id)*sv);
  const lo=Math.min(...q),av=q.reduce((a,x)=>a+x,0)/q.length;return clamp(0.7*lo+0.3*av,0,1);}
// Money (CX_MONEY): users pay for what they get; regions and edge stacks cost every month (the Cost Exploder).
function hsMoney(R2,V,C){const H=S.hs;if(!H||!R2.hs)return;for(const cc in H.cc)V.eyeballs+=hsRev(R2,cc);
  let m=0;for(const c in H.rg)m+=HS_T[H.rg[c].t].mo;m+=Object.keys(H.edge).length*HS_EDGE_MO;for(const f of CX_COST)m+=f(R2);C.cloud=m;}
// Users the same evening, for the card: served share of everything asked.
const hsServed=r=>{const o=r&&r.hs;if(!o)return 1;let d=0,q=0;for(const cc in o.cc){d+=o.cc[cc].D;q+=o.cc[cc].D*hsQ(r,cc);}return d>1e-9?q/d:1;};
/* A day, after its routing: regions open, users come and go, tenants keep a live region, offers stay cloud. */
function hsDay(d){const H=S.hs;if(!H||!hyper())return;
  siteUpDay(H.rg,d,(c,x)=>{x.mw=HS_T[x.t].mw;toast(tr('hyper.region_live',{name:tr(HS_T[x.t].n),city:CITY[c].name,g:fmtG(HS_T[x.t].g)}),'goal',[],{a:'city',v:c});sfx('coin');});
  // Users whose data must stay in a country or bloc with no region there yet neither grow nor leave (residency); users
  // of a region that is out keep it as their home until it is back (they are only visiting its replica).
  for(const cc in H.cc){const x=H.cc[cc];if(hsResMet(cc))cxGrow(x,hsQ(R,cc),hsPot(cc),HS_GROW,cc);const o=R.hs&&R.hs.cc[cc];if(o&&o.home&&!(x.home&&hsOut(x.home)))x.home=o.home;}
  for(const b of hsTen())if(!hsLive(b.rg)&&!hsOut(b.rg)){const r=hsRgFor(b.city,null,b.p);if(r)b.rg=r;}
  // Never transit, never homes, never a classic deal: whatever else called today hangs up.
  S.offers=S.offers.filter(o=>o.type==='cloud');for(const o of S.offers)o.reqs=[];
  if(!H.t1&&isTier1()){H.t1=d;toast(tr('hyper.tier1_side'),'goal');sfx('coin');}
  for(const f of CX_DAY)f(d);}
/* Offers: tenants only, of the kinds your level has met, at a POP of yours; the bundle is their usual one, now and then
   with DNS on top. Priced at 1 here; mktPrice() moves it to today's market. */
// Every name taken: the sequel ("Snooze Network 2"), as startups and studios do, so two tenants never share a name.
function hsSeq(n){const taken=new Set(S.biz.concat(S.offers).map(b=>b.name));for(let i=2;i<99;i++){const v=n+' '+i;if(!taken.has(v))return v;}return n;}
function hsOffer(k,city,bw,cheap){const K=CLOUD_TENANTS[k],list=K.names.filter(n=>!S.usedNames.includes(n)),name=list.length?pick(list):hsSeq(pick(K.names));useName(name);
  const p=K.p.slice();if(!p.includes('dns')&&hstr(name+'|'+S.day)%10<3)p.push('dns');
  // Once one of your own models shipped, some want Azzure ClosedAI Service on top (38-hyper-traffic.js).
  if(hsAiOn()&&!p.includes('ai')&&hstr(name+'|ai|'+S.day)%10<4)p.push('ai');
  return {id:uid(),city,city2:null,name,type:'cloud',bw,rate:Math.round(cloudRate(p)*(cheap||1)),reqs:[],p,ck:k,exp:S.day+40};}
// The director (38-hyper-director.js) keeps the offers waiting for an answer to a few at once.
function hsSpawn(){const mine=Object.keys(S.pops).filter(c=>popUp(c)&&bizCity(c));if(!mine.length||!hsSlotFree()||!hsDirAsk('ten'))return;
  const ks=Object.keys(CLOUD_TENANTS).filter(k=>CLOUD_TENANTS[k].lv<=lvl());if(!ks.length)return;const k=pick(ks),K=CLOUD_TENANTS[k];
  // Ministries and central banks call only from a country where you have a region (Very Sovereign Cloud).
  const at=K.p.includes('sov')?mine.filter(c=>hsRgs().some(r=>CITY[r].cc===CITY[c].cc)):mine;if(!at.length)return;
  S.offers.push(hsOffer(k,pick(at),pick(K.opts)));}
// The golf course: the biggest tenant kind your level has met, in your biggest city, at 30% off, signed on the spot.
function hsGolf(d){const mine=Object.keys(S.pops).filter(c=>popUp(c)&&bizCity(c));if(!mine.length||!hsSlotFree())return;
  const k=Object.keys(CLOUD_TENANTS).filter(x=>CLOUD_TENANTS[x].lv<=lvl()).pop(),K=CLOUD_TENANTS[k],at=K.p.includes('sov')?mine.filter(c=>hsRgs().some(r=>CITY[r].cc===CITY[c].cc)):mine;
  const city=at.sort((a,b)=>CITY[b].P-CITY[a].P||(a<b?-1:1))[0];if(!city)return;
  const o=hsOffer(k,city,K.opts[K.opts.length-1],0.7*mkt()),b=offerCustomer(o);b.by='ceo';b.mk=mkt();b.rg=hsRgFor(city,null,o.p);if(!b.rg)return;S.biz.push(clSign(b));
  toast(tr('hyper.ceo_golf',{name:esc(o.name),city:esc(CITY[city].name),list:esc(cloudList(o.p))}),'goal',[{l:tr('common.show_me'),act:'custGo',args:{id:b.id}}]);sfx('coin');}
/* Goals: from launching at home to Cloud Nine (38-hyper-win.js), roughly in the order a cloud meets them. The win is
   its own (cloud9): Tier 1 is only a side achievement here, with a badge, never the win. */
const HYPER_GOALS=[
 {id:'hs_launch',t:tr('hyper.goal_launch'),d:tr('hyper.goal_launch_d'),r:10000,ok:()=>!!S.hs.cc[CITY[S.home].cc]||Object.keys(S.hs.cc).length>0},
 {id:'hs_door',t:tr('hyper.goal_door'),d:tr('hyper.goal_door_d'),r:15000,ok:()=>Object.keys(S.pops).some(c=>popUp(c)&&(ixIdsIn(c).some(x=>S.ixp[x]!==undefined)||S.pni.some(p=>p.city===c&&pniOn(p))))},
 {id:'hs_tenant',t:tr('hyper.goal_tenant'),d:tr('hyper.goal_tenant_d'),r:25000,ok:()=>hsTen().length>0},
 {id:'hs_region',t:tr('hyper.goal_region'),d:tr('hyper.goal_region_d'),r:100000,ok:()=>Object.keys(S.hs.rg).some(c=>S.hs.rg[c].t>0&&hsLive(c))},
 {id:'hs_edge',t:tr('hyper.goal_edge'),d:tr('hyper.goal_edge_d'),r:25000,ok:()=>Object.keys(S.hs.edge).length>0},
 {id:'hs_cc5',t:tr('hyper.goal_cc5'),d:tr('hyper.goal_cc5_d'),r:50000,ok:()=>Object.keys(S.hs.cc).filter(k=>hsQ(R,k)>=CX_GOOD).length>=5},
 {id:'hs_rep',t:tr('hyper_win.goal_rep'),d:tr('hyper_win.goal_rep_d'),r:75000,ok:()=>!!R.hs&&!!R.hs.rep&&Object.values(R.hs.rep).some(x=>x.got>0.5)},
 {id:'hs_cont3',t:tr('hyper.goal_cont3'),d:tr('hyper.goal_cont3_d'),r:150000,ok:()=>new Set(Object.keys(S.hs.cc).filter(k=>hsQ(R,k)>=CX_GOOD).map(k=>ccInfo(k).reg)).size>=3},
 {id:'hs_ai',t:tr('hyper_win.goal_ai'),d:tr('hyper_win.goal_ai_d'),r:150000,ok:()=>(S.hs.jd|0)>0},
 {id:'hs_drill',t:tr('hyper_win.goal_drill'),d:tr('hyper_win.goal_drill_d'),r:100000,ok:()=>Object.keys(S.hs.drill||{}).length>0},
 {id:'hs_cable',t:tr('hyper_win.goal_cable'),d:tr('hyper_win.goal_cable_d'),r:250000,ok:()=>S.links.some(l=>l.kind==='df'&&l.own&&l.sub&&l.ready<=S.day)},
 {id:'hs_survive',t:tr('hyper_win.goal_survive'),d:tr('hyper_win.goal_survive_d'),r:300000,ok:()=>(S.hs.fsv|0)>0},
 {id:'hs_win',t:tr('hyper_win.cloud_nine'),d:tr('hyper_win.goal_win_d'),r:0,win:true,cloud9:true,ok:()=>hsC9Ok()},
];
/* The level ladder (LV_X): peak traffic, live regions, and continents with a live region. Its names, quotes, toast and
   "Next:" line are the Hyperscaler's own story (39-hyper-story.js). */
const hsCont=()=>new Set(hsRgs().map(c=>CITY[c].reg)).size;
const HS_LVX={on:()=>hyper()&&!!S.hs,places:()=>hsRgs().length,need:i=>({pk:HS_LV_PK[i],pops:HS_LV_RG[i],reg:HS_LV_CT[i]}),regions:hsCont,label:()=>tr('hyper.regions')};
LV_X.push(HS_LVX);
CX_FLOW.push(hsFlows);CX_POST.push(hsPost);CX_MONEY.push(hsMoney);
// Saves: only a Hyperscaler keeps S.hs (and cloud tenants), and every field of it is checked here.
function hsSanitize(s){if(s.charter!=='hyper'){delete s.hs;s.biz=s.biz.filter(b=>b.type!=='cloud');s.offers=s.offers.filter(o=>o.type!=='cloud');return;}
  const h0=s.hs&&typeof s.hs==='object'&&!Array.isArray(s.hs)?s.hs:{},o={},n=(v,d)=>Number.isFinite(+v)?+v:d,obj=v=>v&&typeof v==='object'&&!Array.isArray(v);
  o.rg={};if(obj(h0.rg))for(const k of Object.keys(h0.rg).slice(0,40)){const x=h0.rg[k];if(isCity(k)&&s.pops[k]&&obj(x)&&(k===s.home||siteOk(k,HS_MIN_P))){o.rg[k]=siteFix(x,+x.t===HS_CAGE?HS_T.length:HS_CAGE);o.rg[k].mw=HS_T[o.rg[k].t].mw;}}
  if(s.pops[s.home]&&!o.rg[s.home]&&!Object.keys(o.rg).length)o.rg[s.home]={t:0,ready:0,mw:HS_T[0].mw};
  o.cc={};if(obj(h0.cc))for(const k of Object.keys(h0.cc).slice(0,250)){const x=h0.cc[k];if(ccInfo(k)&&!hsWhy(k)&&obj(x)){o.cc[k]={d:clamp(n(x.d,1),0,1e6),since:Math.round(n(x.since,0))};if(isCity(x.home))o.cc[k].home=x.home;}}
  o.edge={};if(obj(h0.edge))for(const k of Object.keys(h0.edge).slice(0,500))if(isCity(k)&&s.pops[k]&&h0.edge[k])o.edge[k]=1;
  o.t1=Math.max(0,Math.round(n(h0.t1,0)));o.won=Math.max(0,Math.round(n(h0.won,0)));
  for(const b of s.biz.concat(s.offers)){if(b.type!=='cloud')continue;if(!own(CLOUD_TENANTS,b.ck))b.ck='startup';if(!Array.isArray(b.p)||!b.p.length)b.p=CLOUD_TENANTS[b.ck].p.slice();if(b.rg!==undefined&&!o.rg[b.rg])delete b.rg;}
  cxSan(h0,o,s);s.hs=o;}
