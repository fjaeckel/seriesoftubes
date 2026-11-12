/* ================= FEDERATION: rules both sides compute (§10) =================
   Integer arithmetic only. Slots and windows, the boards (totals, growth, divisions, regions), quiet networks, the shun
   tally and deal terms. The relay computes the same from the same records; federation/vectors/ holds both to it. */
// The windows at `now` (§10.1): c is the running slot; current and previous are 288 complete slots each.
function fedWindows(now){const c=fedSlot(now);return {c,current:{from:c-FED_WIN*FED_SLOT,to:c-FED_SLOT},previous:{from:c-2*FED_WIN*FED_SLOT,to:c-(FED_WIN+1)*FED_SLOT}};}
// A record's board slot (§10.1): the earliest t among its valid receipts.
const fedBoardSlot=ts=>ts.length?Math.min(...ts):null;
/* Results kept per records array (by identity, so new data is new work): fedByKey and the board rows. The boards are
   sliced many times over the same cached records (every chip a player taps); each slice then costs a lookup. */
const FED_MEMO=new WeakMap();
const fedMemo=(o,k,f)=>{let m=FED_MEMO.get(o);if(!m)FED_MEMO.set(o,m=new Map());if(!m.has(k))m.set(k,f());return m.get(k);};
/* Board records ({id, key, slot, t, body}) by key, one per slot: the greatest author t, then the lowest id (§10.2).
   Records seen twice (several servers) count once. */
const fedByKey=recs=>fedMemo(recs,'by',()=>fedByKeyRun(recs));
function fedByKeyRun(recs){const seen=new Set(),by=new Map();
  for(const r of recs){if(!r||seen.has(r.id))continue;seen.add(r.id);let a=by.get(r.key);if(!a)by.set(r.key,a=[]);a.push(r);}
  for(const [k,a] of by){a.sort((x,y)=>x.slot-y.slot||x.t-y.t||fedByStr(y.id,x.id));const w=[];
    for(const r of a){if(w.length&&w[w.length-1].slot===r.slot)w[w.length-1]=r;else w.push(r);}by.set(k,w);}
  return by;}
// eff(X, s) for the slots from..to (§10.2): per slot the effective record, null when none or older than 7 days.
function fedEffs(w,from,to){const out=[];let i=-1;
  for(let s=from;s<=to;s+=FED_SLOT){while(i+1<w.length&&w[i+1].slot<=s)i++;const r=i>=0?w[i]:null;out.push(r&&s-r.slot<FED_CARRY?r:null);}
  return out;}
/* The same as changes: [[slot index, record or null], ...] where eff(X, from + index slots) changes, over N slots. A
   record counts from its slot until the next one or for 7 days, whichever comes first. */
function fedEffEvents(w,from,N){const ev=[],ix=s=>Math.ceil((s-from)/FED_SLOT);
  for(let j=0;j<w.length;j++){const r=w[j],nx=j+1<w.length?w[j+1].slot:Infinity,end=Math.min(nx,r.slot+FED_CARRY),a=Math.max(0,ix(r.slot)),b=Math.min(N,ix(end));
    if(a>=b)continue;ev.push([a,r]);if(end<nx&&b<N)ev.push([b,null]);}
  return ev;}
const fedHas=r=>!!r&&r.body.mode==='normal';
// p95 of the busier direction (§10.4): with n values sorted, k = div(n * 5, 100) highest do not count.
const fedP95=a=>{if(!a.length)return 0;a.sort((x,y)=>x-y);return a[a.length-1-fedDiv(a.length*5,100)];};
// The same over runs of equal values: [[value, slots], ...].
const fedP95Runs=a=>{let n=0;for(const x of a)n+=x[1];if(!n)return 0;const k=fedDiv(n*5,100);a.sort((x,y)=>y[0]-x[0]);let c=0;for(const x of a){c+=x[1];if(c>k)return x[0];}return 0;};
const fedPops=(r,cities)=>{let n=0;for(const c of Object.keys(r.body.pops))if(!cities||cities.has(c))n+=r.body.pops[c];return n;};
const FED_FLOOR={pops:10,pies:100,traffic:1000,total:1000};
/* A board (§10.3 to §10.5). q: {now, board ('pops', 'pies', 'traffic', 'total'), measure ('total', 'growth'), division ('all',
   'human', 'ai'), exclude (keys: shunned, hidden, muted), cities (a region filter, or null), records}. Gives rows
   [{key, value}] in board order. With a region, the traffic board counts only traffic with networks that have a POP
   there at that slot; the total board keeps the whole value (§10.3).
   Kept per records array and slot: each call gives a fresh array of the same rows. */
const fedBoardKey=q=>'board|'+[fedSlot(q.now),q.board,q.measure,q.division,(q.exclude||[]).slice().sort().join(),q.cities?q.cities.slice().sort().join():'*'].join('|');
function fedBoard(q){return fedMemo(q.records,fedBoardKey(q),()=>{const g=fedBoardGen(q);let x;do x=g.next();while(!x.done);return x.value;}).slice();}
/* The same, worked out in slices of a few milliseconds between which the page goes on (a huge board on a phone), then
   kept for fedBoard. Resolves (with the number of pauses) when fedBoard(q) is ready. A pause is a real one (not FED.set,
   whose clock tests move by hand): it only lets the page draw. */
async function fedBoardWarm(q,ms=8){const m=FED_MEMO.get(q.records),k=fedBoardKey(q);if(m&&m.has(k))return 0;
  const g=fedBoardGen(q),now=()=>typeof performance!=='undefined'?performance.now():Date.now();let x,n=0;
  for(;;){const t=now();do x=g.next();while(!x.done&&now()-t<ms);if(x.done)break;n++;await new Promise(r=>setTimeout(r,0));}
  fedMemo(q.records,k,()=>x.value);return n;}
// Keys as small numbers, and per stats record its partners as numbers sorted for lookups (both kept while records live).
// The table starts over (and every record's numbers with it) only when no board is being worked out, past a million keys.
const FED_KID={m:new Map(),v:0,busy:0},FED_RI=new WeakMap();
const fedKid=k=>{const M=FED_KID.m;let i=M.get(k);if(i===undefined)M.set(k,i=M.size);return i;};
// o.ids: the partners in list order; o.s: (number * M + index) sorted, for fedRecAt.
function fedRecIds(r){let o=FED_RI.get(r);if(o&&o.v===FED_KID.v)return o;const L=r.body.traffic,n=L.length,M=Math.max(256,n),ids=[],s=new Float64Array(n);
  for(let j=0;j<n;j++){const x=fedKid(L[j].key);ids.push(x);s[j]=x*M+j;}s.sort();o={v:FED_KID.v,ids,s,M};FED_RI.set(r,o);return o;}
// The index of key number x in a record's list, or -1.
const fedRecAt=(o,x)=>{const s=o.s,M=o.M,t=x*M;let lo=0,hi=s.length-1;while(lo<=hi){const m=(lo+hi)>>1,v=s[m];if(v>=t&&v<t+M)return v-t;if(v<t)lo=m+1;else hi=m-1;}return -1;};
/* One walk over the 576 slots, stopping only where some network's effective record changes, keeping each ranked
   network's traffic sums current: its own new record recounts its list, a partner's new record updates only that
   partner's share. Each network gets runs of equal per-slot values, which give its p95 (or its minimum). Yields now
   and then (fedBoardWarm). */
function* fedBoardGen(q){if(!FED_KID.busy&&FED_KID.m.size>=1e6){FED_KID.m.clear();FED_KID.v++;}FED_KID.busy++;
  try{return yield* fedBoardSteps(q);}finally{FED_KID.busy--;}}
function* fedBoardSteps(q){const W=fedWindows(q.now),from=W.previous.from,N=2*FED_WIN,by=fedByKey(q.records),T=q.board==='traffic',TT=q.board==='total',
    cities=q.cities?new Set(q.cities):null,at=(k,s)=>fedEffs(by.get(k),s,s)[0];
  // Every key and partner gets its number first, so the tables below are plain arrays of one size.
  const exK=(q.exclude||[]).map(fedKid),E=[];for(const k of by.keys())for(const [i,r] of fedEffEvents(by.get(k),from,N)){E.push(fedKid(k),i,r);if(T&&r)fedRecIds(r);}
  const K=FED_KID.m.size,ex=new Uint8Array(K),cand=new Array(K).fill(null),keys=new Array(K).fill(null);for(const x of exK)ex[x]=1;
  for(const X of by.keys()){const x=fedKid(X);keys[x]=X;if(ex[x])continue;const r=at(X,W.current.to);if(!fedHas(r))continue;
    if(q.board==='pies'&&!fedOwn(r.body,'pies'))continue;if(cities&&fedPops(r,cities)===0)continue;
    const ai=fedOwn(r.body,'ai');if(q.division==='ai'&&!ai||q.division==='human'&&ai)continue;
    if(q.measure==='growth'&&!fedHas(at(X,from)))continue;cand[x]={runs:[]};}
  yield;
  const B=new Array(N).fill(null);
  for(let j=0;j<E.length;j+=3){const x=E[j];if(T||cand[x])(B[E[j+1]]||(B[E[j+1]]=[])).push(x,E[j+2]);}
  const inC=new WeakMap(),inCities=r=>{let v=inC.get(r);if(v===undefined)inC.set(r,v=fedPops(r,cities)>0);return v;};
  /* Per key number: its effective record now (cur, curO its partner numbers), and for ranked ones the generation of
     its list (gen), its sums (SI, SO) and per partner its share (CI, CO, at CX: one buffer for all). refs: partner number -> [X, X's gen, index in
     X's list, X's report, ...], entries of an older generation dropped as they are met. pos: where each key sits in
     the list of the partner that just changed (1-based, 0: not there). chS, hitS: the slot (1-based) a key last
     changed or had its sums change. */
  const cur=new Array(K).fill(null),curO=new Array(K).fill(null),refs=new Array(K).fill(null),pos=new Int32Array(K),gen=new Int32Array(K),
    SI=new Float64Array(K),SO=new Float64Array(K),CX=new Int32Array(K),chS=new Int32Array(K),hitS=new Int32Array(K);
  let room=0;if(T)for(let j=0;j<E.length;j+=3)if(cand[E[j]]&&E[j+2])room+=E[j+2].body.traffic.length;
  const CI=new Float64Array(room),CO=new Float64Array(room);let top=0;
  let work=0;
  for(let i=0;i<N;i++){const b=B[i];if(!b)continue;const ch=[],hit=[],I=i+1;
    for(let j=0;j<b.length;j+=2){const x=b[j],r=b[j+1];cur[x]=r;curO[x]=T&&r?fedRecIds(r):null;if(chS[x]!==I){chS[x]=I;ch.push(x);}}
    for(const x of ch){if(!cand[x])continue;if(hitS[x]!==I){hitS[x]=I;hit.push(x);}if(!T)continue;
      gen[x]++;SI[x]=SO[x]=0;const r=cur[x];if(!fedHas(r))continue;
      const L=r.body.traffic,ids=curO[x].ids,g=gen[x],o=CX[x]=top;top+=L.length;let si=0,so=0;
      for(let j=0;j<L.length;j++){const y=ids[j];if(ex[y])continue;const e=L[j];(refs[y]||(refs[y]=[])).push(x,g,j,e);
        const ry=cur[y],h=fedHas(ry);let a=0,c=0;
        if(cities&&!(h&&inCities(ry))){}else if(h){const p=fedRecAt(curO[y],x);if(p>=0){const z=ry.body.traffic[p];a=Math.min(e.in,z.out);c=Math.min(e.out,z.in);}}
        else if(!ry){a=e.in;c=e.out;}
        CI[o+j]=a;CO[o+j]=c;si+=a;so+=c;}
      SI[x]=si;SO[x]=so;if((work+=L.length)>=20000){work=0;yield;}}
    if(T)for(const y of ch){const A=refs[y];if(!A)continue;const ry=cur[y],h=fedHas(ry),RL=h?ry.body.traffic:null,ids=h?curO[y].ids:null,off=!!cities&&!(h&&inCities(ry));let w=0;
      if(h)for(let j=0;j<ids.length;j++)pos[ids[j]]=j+1;
      for(let j=0;j<A.length;j+=4){const x=A[j],g=A[j+1],k=A[j+2],e=A[j+3];if(gen[x]!==g)continue;A[w++]=x;A[w++]=g;A[w++]=k;A[w++]=e;if(chS[x]===I)continue;
        let a=0,c=0;if(off){}else if(h){const p=pos[x];if(p){const z=RL[p-1];a=Math.min(e.in,z.out);c=Math.min(e.out,z.in);}}else if(!ry){a=e.in;c=e.out;}
        const o=CX[x]+k;SI[x]+=a-CI[o];SO[x]+=c-CO[o];CI[o]=a;CO[o]=c;if(hitS[x]!==I){hitS[x]=I;hit.push(x);}}
      if(h)for(let j=0;j<ids.length;j++)pos[ids[j]]=0;
      if(w<A.length)A.length=w;if((work+=w/4+(h?ids.length:0))>=20000){work=0;yield;}}
    for(const x of hit){const r=cur[x];cand[x].runs.push(i,!fedHas(r)?-1:T?SI[x]:TT?r.body.total||0:q.board==='pies'?r.body.pies||0:fedPops(r,cities),T?SO[x]:0);}}
  const total=(st,a,b)=>{const R=st.runs,IN=[],OUT=[];let lo=null;
    for(let j=0;j<R.length;j+=3){const x0=Math.max(a,R[j]),x1=Math.min(b,j+3<R.length?R[j+3]:N);if(x1<=x0||R[j+1]<0)continue;
      if(T||TT){IN.push([R[j+1],x1-x0]);OUT.push([R[j+2],x1-x0]);}else if(lo===null||R[j+1]<lo)lo=R[j+1];}
    return T||TT?Math.max(fedP95Runs(IN),fedP95Runs(OUT)):lo||0;};
  const rows=[];
  cand.forEach((st,x)=>{if(!st)return;const X=keys[x],c=total(st,FED_WIN,N);if(q.measure!=='growth'){rows.push({key:X,value:c});return;}
    const prev=total(st,0,FED_WIN);rows.push({key:X,value:fedDiv((c-prev)*10000,Math.max(prev,FED_FLOOR[q.board]))});});
  return rows.sort((a,b)=>b.value-a.value||fedByStr(a.key,b.key));}
// Networks that go quiet (§10.6): state and the demand factor in per mille.
function fedQuiet(now,heard){const age=now-heard;
  if(age<FED_CARRY)return {state:'active',factor:1000};
  if(age<3196800)return {state:'fading',factor:1000-fedDiv((age-FED_CARRY)*1000,2592000)};
  return {state:age<15552000?'dark':'forgotten',factor:0};}
/* The shun tally (§10.7). reg: {asOf, servers:[{id, operators, listed?, answered?}]}; records: shun and unshun votes as
   {id, kind, key, t, server, target, reason?}. Gives {voters, need, votes, shunned, reasons} (votes, reasons at now). */
// A registry server that votes (§10.7): listed for 30 days and answering in the last 14, as of the registry's asOf.
const fedVoter=(s,asOf)=>Number.isSafeInteger(s.listed)&&Number.isSafeInteger(s.answered)&&s.listed<=asOf-2592000&&s.answered>=asOf-1209600;
function fedShun(reg,records,target,now){const asOf=reg.asOf,V=reg.servers.filter(s=>fedVoter(s,asOf));
  const need=Math.max(5,fedDiv(V.length+3,4)),mine=V.map(s=>records.filter(r=>r.target===target&&r.server===s.id&&(r.kind==='shun'||r.kind==='unshun')&&s.operators.includes(r.key))
    .sort((a,b)=>a.t-b.t||fedByStr(b.id,a.id)));
  const at=(list,x)=>{let d=null;for(const r of list){if(r.t>x)break;d=r;}return d&&d.kind==='shun'&&x<d.t+7776000?d:null;};
  const votes=x=>mine.reduce((n,l)=>n+(at(l,x)?1:0),0),x0=now-FED_CARRY,xs=new Set([x0]);
  for(const l of mine)for(const r of l)for(const x of [r.t,r.t+7776000])if(x>x0&&x<=now)xs.add(x);
  const reasons={};for(const l of mine){const d=at(l,now);if(d)reasons[d.reason]=(reasons[d.reason]||0)+1;}
  return {voters:V.length,need,votes:votes(now),shunned:[...xs].some(x=>votes(x)>=need),reasons};}
/* Deal terms (§10.10). anns: the counterparty's announces known ({id, kind, key, t, body}); offer {id, key, t, body};
   accept {t} or null; renews (the running deal it renews, {id, start, end}) or null.
   Gives {ok:true, auto, start, end} (start null while a review waits for its accept) or {ok:false, error}. */
function fedDeal(anns,offer,accept,renews){const b=offer.body,no=fedNo;let mode='review';
  if(fedOwn(b,'basis')){const basis=anns.find(a=>a.id===b.basis);if(!basis)return no('not_found');
    if(basis.kind!=='announce'||basis.key!==b.to||basis.t>offer.t)return no(FdBF);
    const next=anns.filter(a=>a.kind==='announce'&&a.key===b.to&&a.t>basis.t).sort((x,y)=>x.t-y.t)[0];
    if(next&&!(next.t>offer.t-FED_DAY))return no('stale_terms');
    mode=basis.body.auto[b.deal];if(mode==='decline')return no('declined');
    const R=basis.body.rates||{},T=b.terms;
    if(b.deal==='transit'){const r=R.transit;if(!r)return no('no_terms');let off=0;for(const c of r.commit)if(c.mbps<=T.mbps)off=c.off;
      if(T.perGbps!==fedDiv(r.perGbps*(1000-off),1000)||T.term<r.term)return no('bad_terms');}
    else if(b.deal==='pni'){const r=R.pni;if(!r)return no('no_terms');const p=r.ports.find(x=>x.mbps===T.mbps);
      if(!p||T.setup!==r.setup||T.monthly!==p.monthly||T.term<r.term)return no('bad_terms');}
    else if(b.deal==='port'){const r=R.ix;if(!r)return no('no_terms');const p=r.ports.find(x=>x.mbps===T.mbps);
      if(!r.at.includes(T.at)||!p||T.monthly!==p.monthly||T.term<30)return no('bad_terms');}}
  const auto=mode==='auto';let start=auto?offer.t:accept?accept.t:null;
  if(start!==null&&renews)start=Math.max(renews.end,start);
  const term=b.terms.term;return {ok:true,auto,start,end:start!==null&&term?start+term*FED_DAY:null};}
