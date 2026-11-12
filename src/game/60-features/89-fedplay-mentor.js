/* ================= MULTIPLAYER GAMEPLAY: newcomers and their mentors =================
   docs/plans/federation.md, "Newcomers". A network is a newcomer for its first 30 real days after joining (its announce's
   founded, §10.10). Deals help it twice:
   - The newcomer price: buying from an established network in those 30 days, every price is 25% off (§10.10). The offer
     says so (terms.founded) and both games check it with the same rule, so they agree on the price.
   - The mentor dividend: an established network with a deal running with a newcomer, started while it was new, earns a
     one-off bonus in its own game when the newcomer, within 60 days of the deal's start, reaches 10 POPs, becomes a
     Tier 2 or wins a transit customer of its own. Read from the newcomer's newest stats as the servers report them (§9.5
     nets). Never ranked; money never moves between saves.
   Anti-farming (Frederic, 2026-11-12): a milestone pays only once the newcomer has been heard (a stats record with a
   receipt slot, as this game saw it in nets answers) on 3 distinct UTC days; milestones met when this game first looks
   at a newcomer never pay; each (newcomer, milestone) pays once; at most 5 distinct newcomers pay in any 14 days, and a
   milestone of a 6th in that window is used up, not kept for later.
   S.fedp.ment: [{k, n (name), m ('seen', 'pops', 't2', 'cust'), v (paid; 0: none), t, cap (true: refused by the cap)}];
   S.fedp.heard: [{k, d: [UTC days, ascending, at most 3]}]. */
const FEDM_DAYS=60,FEDM_HEARD=3,FEDM_CAP=5,FEDM_WIN=14,FEDM_MAX=512,FEDM_MS=['pops','t2','cust'];
// What each milestone pays: a share of this network's monthly revenue, within bounds (like the chaos monkey's bonus).
const FEDM_PAY={pops:[0.25,10000,1e6],t2:[0.5,25000,2e6],cust:[0.5,25000,2e6]};
const FEDM_NAME={pops:N_('fedplay.ms_pops'),t2:N_('fedplay.ms_t2'),cust:N_('fedplay.ms_cust')};
const fedMentorPay=m=>{const [f,lo,hi]=FEDM_PAY[m];return Math.round(Math.min(hi,Math.max(lo,((R&&R.revMo)||0)*f))/1000)*1000;};
// This network's founded day as its announce says it (§5.1).
const fedMyFounded=(s,now)=>Math.min(s.fed.joined||0,fedDiv(now,FED_DAY));
// Whether a stats entry (nets answer: {pops, tier2, cust}) meets a milestone.
const fedMsMet=(m,st)=>m==='pops'?st.pops>=10:m==='t2'?!!st.tier2:st.cust>=1;
/* The newcomers this network mentors now: key -> name, from deals running with them that started while they were new
   and this network was not, less than 60 days ago. founded: key -> the newcomer's announce founded. */
function fedMentees(s,now,founded){const out=new Map(),mine=fedMyFounded(s,now);
  for(const d of s.fed.deals){if(d.st!=='run'||!d.on||d.start===null||now>=d.start+FEDM_DAYS*FED_DAY)continue;
    if(fedDiv(d.start,FED_DAY)-mine<FED_NEWCOMER||!fedIsNew(founded(d.key),d.start))continue;out.set(d.key,d.name);}
  return out;}
/* The hourly look (fedPlayRun): stats is fedNetsStats's map (key -> {pops, tier2, cust, slot, ...}). Gives true when
   the save changed. */
function fedMentorTick(s,now,stats,founded){const P=fedP(s),ms=fedMentees(s,now,founded);let ch=false;if(!ms.size)return false;
  for(const [k,name] of ms){const st=stats.get(k);if(!st||!st.seen)continue;
    // Heard on distinct UTC days (the receipt slot of its newest stats, each look).
    if(Number.isSafeInteger(st.slot)&&st.slot>0){let h=P.heard.find(x=>x.k===k);
      if(!h&&P.heard.length<FEDM_MAX){h={k,d:[]};P.heard.push(h);ch=true;}
      const day=fedDiv(st.slot,FED_DAY);if(h&&h.d.length<FEDM_HEARD&&!h.d.includes(day)){h.d.push(day);h.d.sort((a,b)=>a-b);ch=true;}}
    const mine=P.ment.filter(x=>x.k===k);
    // The first look: what it already has never pays.
    if(!mine.length){if(P.ment.length>=FEDM_MAX)continue;P.ment.push({k,n:name,m:'seen',v:0,t:now});
      for(const m of FEDM_MS)if(fedMsMet(m,st))P.ment.push({k,n:name,m,v:0,t:now});ch=true;continue;}
    const h=P.heard.find(x=>x.k===k);if(!h||h.d.length<FEDM_HEARD)continue;
    for(const m of FEDM_MS){if(mine.some(x=>x.m===m)||!fedMsMet(m,st))continue;
      const paid=new Set(P.ment.filter(x=>x.v>0&&now-x.t<FEDM_WIN*FED_DAY).map(x=>x.k));
      if(!paid.has(k)&&paid.size>=FEDM_CAP){P.ment.push({k,n:name,m,v:0,t:now,cap:true});ch=true;continue;}
      const v=fedMentorPay(m);s.cash+=v;P.ment.push({k,n:name,m,v,t:now});ch=true;
      if(S===s){toast(tr('fedplay.mentor_bonus',{net:esc(name),what:tr(FEDM_NAME[m]),cash:fmt$(v)}),'goal');sfx('coin');}}}
  return ch;}
// The bonuses paid, newest first: for the players card.
const fedMentorPaid=s=>s.fedp?s.fedp.ment.filter(x=>x.v>0).sort((a,b)=>b.t-a.t):[];
// Repairs the mentor lists from a save (fedpSanitize): o is the clean S.fedp, v what the save held.
function fedMentorClean(o,v){const int=(x,lo,hi)=>Number.isSafeInteger(x)&&x>=lo&&x<=hi;
  o.ment=Array.isArray(v.ment)?v.ment.filter(x=>x&&!FdK(x.k)&&['seen',...FEDM_MS].includes(x.m)&&int(x.v,0,1e12)&&int(x.t,0,1e11)).slice(-FEDM_MAX)
    .map(x=>({k:x.k,n:typeof x.n==='string'&&!FdName(x.n)?fedSafeName(x.n):'AS?',m:x.m,v:x.v,t:x.t,...(x.cap===true?{cap:true}:{})})):[];
  o.heard=Array.isArray(v.heard)?v.heard.filter(x=>x&&!FdK(x.k)&&Array.isArray(x.d)).slice(-FEDM_MAX)
    .map(x=>({k:x.k,d:[...new Set(x.d.filter(d=>int(d,0,1e7)))].sort((a,b)=>a-b).slice(0,FEDM_HEARD)})):[];}
/* Transit customers and upstreams this network publishes (§5.2 cust, up): the other side of every running transit
   deal. The cone board counts an edge only when both sides list it. */
function fedTransitLists(s){const c=new Set(),u=new Set();
  for(const d of s.fed.deals)if(d.deal==='transit'&&d.st==='run'&&d.on)(d.role==='sell'?c:u).add(d.key);
  return {cust:[...c].sort(fedByStr).slice(0,FED_CUST_MAX),up:[...u].sort(fedByStr).slice(0,FED_UP_MAX)};}
/* The newcomer price for an offer this network makes (fedOffer): terms with founded and every price 25% off when this
   network is new and the seller (announce body B) is not; the terms unchanged otherwise. */
function fedNewTerms(deal,terms,B,now){const f=S.fed,mine=fedMyFounded(S,now);
  if(!terms||!['transit','pni','port','wave'].includes(deal)||!fedIsNew(mine,now)||!Number.isSafeInteger(B.founded)||fedDiv(now,FED_DAY)-B.founded<FED_NEWCOMER||!f)return terms;
  const t={...terms,founded:mine};
  if(deal==='transit')t.perGbps=fedNewPrice(t.perGbps);else if(deal==='pni'){t.setup=fedNewPrice(t.setup);t.monthly=fedNewPrice(t.monthly);}else t.monthly=fedNewPrice(t.monthly);
  return t;}
