/* ================= FEDERATION: rules both sides compute (§10) =================
   Integer arithmetic only. Slots and windows, the boards (totals, growth, divisions, regions), quiet networks, the shun
   tally and deal terms. The relay computes the same from the same records; federation/vectors/ holds both to it. */
// The windows at `now` (§10.1): c is the running slot; current and previous are 288 complete slots each.
function fedWindows(now){const c=fedSlot(now);return {c,current:{from:c-FED_WIN*FED_SLOT,to:c-FED_SLOT},previous:{from:c-2*FED_WIN*FED_SLOT,to:c-(FED_WIN+1)*FED_SLOT}};}
// A record's board slot (§10.1): the earliest t among its valid receipts.
const fedBoardSlot=ts=>ts.length?Math.min(...ts):null;
/* Board records ({id, key, slot, t, body}) by key, one per slot: the greatest author t, then the lowest id (§10.2).
   Records seen twice (several servers) count once. */
function fedByKey(recs){const seen=new Set(),by=new Map();
  for(const r of recs){if(!r||seen.has(r.id))continue;seen.add(r.id);let a=by.get(r.key);if(!a)by.set(r.key,a=[]);a.push(r);}
  for(const [k,a] of by){a.sort((x,y)=>x.slot-y.slot||x.t-y.t||fedByStr(y.id,x.id));const w=[];
    for(const r of a){if(w.length&&w[w.length-1].slot===r.slot)w[w.length-1]=r;else w.push(r);}by.set(k,w);}
  return by;}
// eff(X, s) for the slots from..to (§10.2): per slot the effective record, null when none or older than 7 days.
function fedEffs(w,from,to){const out=[];let i=-1;
  for(let s=from;s<=to;s+=FED_SLOT){while(i+1<w.length&&w[i+1].slot<=s)i++;const r=i>=0?w[i]:null;out.push(r&&s-r.slot<FED_CARRY?r:null);}
  return out;}
const fedHas=r=>!!r&&r.body.mode==='normal';
// p95 of the busier direction (§10.4): with n values sorted, k = div(n * 5, 100) highest do not count.
const fedP95=a=>{if(!a.length)return 0;a.sort((x,y)=>x-y);return a[a.length-1-fedDiv(a.length*5,100)];};
const fedPops=(r,cities)=>{let n=0;for(const c of Object.keys(r.body.pops))if(!cities||cities.has(c))n+=r.body.pops[c];return n;};
const FED_FLOOR={pops:10,pies:100,traffic:1000};
/* A board (§10.3 to §10.5). q: {now, board ('pops', 'pies', 'traffic'), measure ('total', 'growth'), division ('all',
   'human', 'ai'), exclude (keys: shunned, hidden, muted), cities (a region filter, or null), records}. Gives rows
   [{key, value}] in board order. With a region, the traffic board counts only traffic with networks that have a POP
   there at that slot (the vectors only use regions on the POPs board, where the spec defines them). */
function fedBoard(q){const W=fedWindows(q.now),from=W.previous.from,last=W.current.to,N=2*FED_WIN,by=fedByKey(q.records),
    ex=new Set(q.exclude||[]),cities=q.cities?new Set(q.cities):null,E=new Map(),eff=k=>{let e=E.get(k);if(!e)E.set(k,e=by.has(k)?fedEffs(by.get(k),from,last):[]);return e;};
  const reports=new WeakMap(),rep=(r,k)=>{let m=reports.get(r);if(!m)reports.set(r,m=new Map(r.body.traffic.map(x=>[x.key,x])));return m.get(k);};
  const total=(X,a,b)=>{const e=eff(X);let lo=null;const IN=[],OUT=[];
    for(let i=a;i<b;i++){const r=e[i];if(!fedHas(r))continue;
      if(q.board==='traffic'){let ti=0,to=0;
        for(const y of r.body.traffic){if(ex.has(y.key))continue;const ry=eff(y.key)[i];
          if(cities&&!(fedHas(ry)&&fedPops(ry,cities)>0))continue;
          if(fedHas(ry)){const z=rep(ry,X);ti+=Math.min(y.in,z?z.out:0);to+=Math.min(y.out,z?z.in:0);}
          else if(!ry){ti+=y.in;to+=y.out;}}
        IN.push(ti);OUT.push(to);}
      else{const v=q.board==='pies'?r.body.pies||0:fedPops(r,cities);if(lo===null||v<lo)lo=v;}}
    return q.board==='traffic'?Math.max(fedP95(IN),fedP95(OUT)):lo||0;};
  const rows=[];
  for(const X of by.keys()){if(ex.has(X))continue;const e=eff(X),r=e[N-1];if(!fedHas(r))continue;
    if(q.board==='pies'&&!fedOwn(r.body,'pies'))continue;if(cities&&fedPops(r,cities)===0)continue;
    const ai=fedOwn(r.body,'ai');if(q.division==='ai'&&!ai||q.division==='human'&&ai)continue;
    const cur=total(X,FED_WIN,N);if(q.measure!=='growth'){rows.push({key:X,value:cur});continue;}
    if(!fedHas(e[0]))continue;const prev=total(X,0,FED_WIN);
    rows.push({key:X,value:fedDiv((cur-prev)*10000,Math.max(prev,FED_FLOOR[q.board]))});}
  return rows.sort((a,b)=>b.value-a.value||fedByStr(a.key,b.key));}
// Networks that go quiet (§10.6): state and the demand factor in per mille.
function fedQuiet(now,heard){const age=now-heard;
  if(age<FED_CARRY)return {state:'active',factor:1000};
  if(age<3196800)return {state:'fading',factor:1000-fedDiv((age-FED_CARRY)*1000,2592000)};
  return {state:age<15552000?'dark':'forgotten',factor:0};}
/* The shun tally (§10.7). reg: {asOf, servers:[{id, operators, listed?, answered?}]}; records: shun and unshun votes as
   {id, kind, key, t, server, target, reason?}. Gives {voters, need, votes, shunned, reasons} (votes, reasons at now). */
function fedShun(reg,records,target,now){const asOf=reg.asOf,V=reg.servers.filter(s=>Number.isSafeInteger(s.listed)&&Number.isSafeInteger(s.answered)&&s.listed<=asOf-2592000&&s.answered>=asOf-1209600);
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
