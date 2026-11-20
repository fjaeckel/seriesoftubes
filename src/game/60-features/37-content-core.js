/* ---------- The content core: what a charter with its own users needs ----------
   Plumbing for a charter whose users sit in countries and are served from its own sites (the Hyperscaler, 37-hyper.js):
   countries (ccInfo, ccName), users by country and their growth (cxGrow), sites with tiers that are built and upgraded
   without going dark (siteLive, siteUpDay, siteFix), the front door nearest a country (cxPop), the cold-potato haul
   that compute() carries over your backbone before IP routing (cxFlows, cxPost), a change freeze (chFrozen) and a level
   ladder a charter may tell its own way (LV_X). In a classic game every list below is empty or answers as before.

   Extension points: files after this one push functions here at the top level.
   CX_MUL.grow/.pot/.churn/.rev: multipliers per country code (growth, ceiling, cancellations, revenue), multiplied (cxMul).
   CX_NEW(o): fields of a charter's new state (cxNew).    CX_SAN(o0,o,s): repair those fields on load (cxSan).
   CX_DAY(d): once a day, after routing.                   CX_CARD(): extra HTML for the charter card.
   CX_CITY(c): extra HTML for a city's charter tab.        CX_ORG(c): a multiplier on what the site in c serves tonight.
   CX_COST(r): extra monthly cost, given the routing being built.
   CX_FLOW(R2,flow,DEMTO,X): in compute(), adds the charter's flows and returns haul jobs [{o,v,x,lo,hi}] or null. X:
     reach(a,b) (b's backbone reaches a), ms(a,b) (one-way latency of the backbone path from a to b), nf() (flows so far).
   CX_POST(R2,jobs): after routing; each job has got (what arrived at v) and ms (its path's latency).
   CX_BULK(R2,X): after IP routing, bulk circuits carved like L2 ones on what interactive traffic left. X: edges, adj,
     SPD, SPP, HAS, NRES, nodeTake, carry, NN, routes(A,B,b) (the L2 path choice), te() (Auto-TE's circuit router, or null).
     f.on(), if the hook has one, says whether it has anything to carve today.
   CX_MONEY(R2,V,C): adds to the month's revenue (V) and costs (C).
   CX_FREEZE(): {show, until} while the network must not be touched (chFrozen), or null.
   FREEZE_ACTS: action names the freeze blocks (90-actions/99-change-freeze.js wraps them after every action file).
   LV_X: a charter's own ladder, {on(), places(), need(i), regions(), levels, title(lv), eyebrow(lv), toast(lv), next(nx),
     label()}; the first whose on() is true tells the levels, otherwise the classic ladder does. */
const CX_MUL={grow:[],pot:[],churn:[],rev:[]},CX_NEW=[],CX_SAN=[],CX_DAY=[],CX_CARD=[],CX_CITY=[],CX_ORG=[],CX_COST=[],CX_FLOW=[],CX_POST=[],CX_BULK=[],CX_MONEY=[],CX_FREEZE=[],FREEZE_ACTS=[],LV_X=[];
const cxMul=(k,cc)=>{let m=1;for(const f of CX_MUL[k])m*=f(cc);return m;};
const cxNew=o=>{for(const f of CX_NEW)f(o);return o;};
const cxSan=(o0,o,s)=>{for(const f of CX_SAN)f(o0,o,s);return o;};
const cxHtml=(L,...a)=>L.map(f=>f(...a)).join('');
/* Countries, built once: their eyeball weight, biggest city (where the users are said to be), continent and the
   networks that sell to homes there with their shares (W2 promises at least two). */
let CC_I=null;
function ccInfo(cc){if(!CC_I){CC_I=new Map();for(const C of CITIES){if(C.off)continue;let o=CC_I.get(C.cc);if(!o)CC_I.set(C.cc,o={cc:C.cc,P:0,main:C.id,mp:0,reg:C.reg,cn:!!C.cn,nets:[]});o.P+=C.P;if(C.P>o.mp){o.mp=C.P;o.main=C.id;o.reg=C.reg;}if(C.cn)o.cn=true;}
    const L=locNets();for(let j=0;j<NETS.length;j++){const h=L[j];if(!h)continue;for(const k of h.cc){const o=CC_I.get(k);if(o)o.nets.push([j,NETS[j].share||0.001]);}}
    for(const o of CC_I.values()){const t=o.nets.reduce((a,x)=>a+x[1],0)||1;o.nets=o.nets.map(([j,w])=>[j,w/t]);}}
  return CC_I.get(cc)||null;}
// The country's own name in the player's language (Intl, as the pie's landing rights do).
const ccName=cc=>pieLicCountry(cc);
// Every country users can live in, biggest first.
const ccAll=()=>{ccInfo('');return [...CC_I.values()].sort((a,b)=>b.P-a.P||(a.cc<b.cc?-1:1)).map(o=>o.cc);};
/* Users: an evening peak in Gbps per country that grows toward its ceiling P while served well (q at least CX_GOOD) and
   shrinks a little each day while not. */
const CX_GOOD=0.9;
function cxGrow(x,q,P,g,cc){if(q>=CX_GOOD)x.d+=g*q*x.d*Math.max(0,1-x.d/(P||1))*cxMul('grow',cc);else x.d=Math.max(1,x.d*(1-(CX_GOOD-q)*0.05*cxMul('churn',cc)));}
/* Sites (regions, origins): {t tier, ready day, up {t, ready} while a bigger one is built}. The old tier serves all along
   (upgrade without downtime). Good sites are where data centers cluster: metros of at least minP. */
const siteOk=(c,minP)=>!!(CITY[c]&&CITY[c].dc&&CITY[c].P>=minP&&!CITY[c].cn);
const siteLive=(M,c)=>{const d=M&&M[c];return !!d&&d.ready<=S.day&&!!S.pops[c];};
const siteRoom=(g,c)=>{for(const f of CX_ORG)g*=f(c);return g;};
// A day: a site opens, or a bigger one takes over from the old. on(c, x) is told each time.
function siteUpDay(M,d,on){for(const c in M){const x=M[c];if(x.up&&x.up.ready<=d){x.t=x.up.t;delete x.up;on(c,x);}else if(x.ready===d&&d>0)on(c,x);}}
// One saved site, repaired: n the number of tiers.
function siteFix(x,n){const v=(a,d)=>Number.isFinite(+a)?+a:d,o={t:clamp(Math.round(v(x.t,0)),0,n-1),ready:Math.round(v(x.ready,0))};
  const u=x.up;if(u&&typeof u==='object'&&o.t<n-1)o.up={t:o.t+1,ready:Math.round(v(u.ready,0))};return o;}
// Does this POP have a way out (transit, an exchange port or a PNI)? A front door needs one.
// A deal with a player that gives a way out there counts too (a PNI, transit bought, an on-ramp port: 89-fedplay-deals.js).
const cxOut=c=>S.transit.some(t=>t.city===c)||ixIdsIn(c).some(x=>S.ixp[x]!==undefined)||S.pni.some(p=>p.city===c)||!!S.fed&&fedDealExits().some(x=>x.city===c&&x.k!=='c');
// The POP among pops nearest a country's users (its biggest city), remembered while the list is the same.
const CX_POP={k:'',m:new Map()};
function cxPop(cc,pops){const k=pops.join();if(CX_POP.k!==k){CX_POP.k=k;CX_POP.m=new Map();}let v=CX_POP.m.get(cc);
  if(v===undefined){const I=ccInfo(cc);v=null;let b=Infinity;if(I)for(const p of pops){const km=kmBetween(p,I.main);if(km<b||km===b&&p<v){b=km;v=p;}}CX_POP.m.set(cc,v);}return v;}
// compute()'s hooks (see the header).
function cxFlows(R2,flow,DEMTO,X){let J=null;for(const f of CX_FLOW){const j=f(R2,flow,DEMTO,X);if(j&&j.length)J=J?J.concat(j):j;}return J;}
function cxPost(R2,J){for(const f of CX_POST)f(R2,J);}
// A bulk hook may say when it has nothing to do (f.on()), so a classic game builds nothing for it.
const cxBulkOn=()=>CX_BULK.some(f=>!f.on||f.on());
function cxBulk(R2,X){for(const f of CX_BULK)if(!f.on||f.on())f(R2,X);}
// Bytes: one Gbps for a whole day is 10.8 TB.
const TB_DAY=10.8;
// The change freeze: the first charter part that declares one.
function chFrozen(){if(!S)return null;for(const f of CX_FREEZE){const z=f();if(z)return z;}return null;}
/* The level ladder. A carrier counts POPs and continents with a POP; a charter in LV_X counts what it says. A peak within
   LV_EPS (10-businesses.js) of the mark counts. */
const lvX=()=>{if(!S)return null;for(const x of LV_X)if(x.on())return x;return null;};
const lvPlaces=()=>{const x=lvX();return x?x.places():Object.keys(S.pops).length;};
const lvNeed=i=>{const x=lvX();if(x)return x.need(i);const q=LV_REQ[i];return {pk:q.pk,pops:q.pops,reg:lvReg(i)};};
const lvRegions=()=>{const x=lvX();return x?x.regions():regionsCount();};
const lvPlacesLabel=()=>{const x=lvX();return x?x.label():tr('common.pops');};
// Level i (0-based) as this charter tells it: {n, q, unlock}.
const lvInfo=i=>{const x=lvX();return ((x&&x.levels)||LEVELS)[i];};
const lvTitle=lv=>{const x=lvX();return x&&x.title?x.title(lv):tr('hud_and_panels.customer_level_lv_name',{lv,name:lvInfo(lv-1).n});};
const lvEyebrow=lv=>{const x=lvX();return x&&x.eyebrow?x.eyebrow(lv):tr('progress.customer_level_lv_of_max',{lv,max:LEVELS.length});};
const lvToast=lv=>{const x=lvX();if(x&&x.toast)return x.toast(lv);const L=lvInfo(lv-1);return tr('day_tick.customer_level_lv_name_new_customers',{lv,name:L.n,unlock:L.unlock})+`<br><i>${esc(L.q)}</i>`;};
// What the next level brings (nx: lvInfo(lv), or nothing at the top); req: the Deals tab, which also says what it asks.
const lvNext=(nx,req)=>{const x=lvX();if(x&&x.next)return x.next(nx);if(!nx)return tr('common.every_customer_type_is_unlocked_go');
  return req?tr('hud_and_panels.next_req_unlocks_what',{req:nx.req,what:lc1(nx.unlock)}):tr('common.every_customer_type_is_unlocked_go');};
