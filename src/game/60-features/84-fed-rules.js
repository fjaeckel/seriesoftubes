/* ================= FEDERATION: rules both sides compute (§10) =================
   Integer arithmetic only. Slots and windows, quiet networks, the shun tally and deal terms. The relay computes the
   same from the same records; federation/vectors/ holds both to it. The boards are ranked by the server (§9.5). */
// The windows at `now` (§10.1): c is the running slot; current and previous are 288 complete slots each.
function fedWindows(now){const c=fedSlot(now);return {c,current:{from:c-FED_WIN*FED_SLOT,to:c-FED_SLOT},previous:{from:c-2*FED_WIN*FED_SLOT,to:c-(FED_WIN+1)*FED_SLOT}};}
// A record's board slot (§10.1): the earliest t among its valid receipts.
const fedBoardSlot=ts=>ts.length?Math.min(...ts):null;
/* Stats records ({id, key, slot, t, body}) by key, one per slot: the greatest author t, then the lowest id (§10.2).
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
// eff(X, s) by halving: w is fedByKey's list of one key.
function fedEffAt(w,s){if(!w)return null;let lo=0,hi=w.length-1,i=-1;while(lo<=hi){const m=(lo+hi)>>1;if(w[m].slot<=s){i=m;lo=m+1;}else hi=m-1;}
  const r=i>=0?w[i]:null;return r&&s-r.slot<FED_CARRY?r:null;}
// p95 of the busier direction (§10.4): with n values sorted, k = div(n * 5, 100) highest do not count.
const fedP95=a=>{if(!a.length)return 0;a.sort((x,y)=>x-y);return a[a.length-1-fedDiv(a.length*5,100)];};
const FED_FLOOR={pops:10,pies:100,traffic:1000,total:1000};
/* One network's place on a board (§10.3 to §10.5, §10.12), worked out from records alone: how a game checks a row a
   server ranked (§9.5 rankwhy). q: {now, board, measure, division, exclude (keys the server leaves off), cities (a region,
   or null), filters (as in a rank request)}; recs: stats records [{id, key, slot, t, body, cc}] (the key's and, on the
   traffic board, its partners'); ann: the key's newest announce body, or null. Gives {listed (on the board), kept (also
   in the slice), value}. A pure function of its arguments (it may move to a worker). */
function fedRankOne(q,key,recs,ann){const W=fedWindows(q.now),from=W.previous.from,last=W.current.to,by=fedByKey(recs),ex=new Set(q.exclude||[]),
    cs=q.cities?new Set(q.cities):null,F=q.filters||{},w=by.get(key),pops=r=>{let n=0;for(const c of Object.keys(r.body.pops))if(!cs||cs.has(c))n+=r.body.pops[c];return n;};
  const no={listed:false,kept:false,value:0},l=fedEffAt(w,last);
  if(ex.has(key)||!fedHas(l)||q.board==='pies'&&!fedOwn(l.body,'pies')||cs&&pops(l)===0||q.measure==='growth'&&!fedHas(fedEffAt(w,from)))return no;
  const traffic=(r,s)=>{let i=0,o=0;for(const e of r.body.traffic){if(ex.has(e.key))continue;const y=fedEffAt(by.get(e.key),s);
      if(cs&&!(fedHas(y)&&pops(y)>0))continue;if(!y){i+=e.in;o+=e.out;}else if(fedHas(y)){const z=y.body.traffic.find(x=>x.key===key);if(z){i+=Math.min(e.in,z.out);o+=Math.min(e.out,z.in);}}}
    return [i,o];};
  const total=(a,b)=>{const IN=[],OUT=[];let lo=null;
    for(let k=a;k<b;k++){const s=from+k*FED_SLOT,r=fedEffAt(w,s);if(!fedHas(r))continue;
      if(q.board==='traffic'){const [i,o]=traffic(r,s);IN.push(i);OUT.push(o);}else if(q.board==='total')IN.push(r.body.total||0);
      else{const v=q.board==='pies'?r.body.pies||0:pops(r);if(lo===null||v<lo)lo=v;}}
    return q.board==='traffic'?Math.max(fedP95(IN),fedP95(OUT)):q.board==='total'?fedP95(IN):lo||0;};
  let value=total(FED_WIN,2*FED_WIN);
  if(q.measure==='growth'){const prev=total(0,FED_WIN);value=fedDiv((value-prev)*10000,Math.max(prev,FED_FLOOR[q.board]));}
  const ai=l.body.ai,day=fedDiv(q.now,FED_DAY),a=ann,keys=F.keys?new Set(F.keys):null;
  const kept=!(q.division==='ai'&&!ai||q.division==='human'&&ai||F.model!=null&&(!ai||ai.model!==F.model)||F.harness!=null&&(!ai||ai.harness!==F.harness)||
    F.tier1!=null&&l.body.tier1!==F.tier1||F.from!=null&&l.cc!==F.from||F.home!=null&&(!a||a.home!==F.home)||F.policy!=null&&(!a||a.policy!==F.policy)||
    (F.ageMin!=null||F.ageMax!=null)&&(!a||day-a.founded<(F.ageMin??0)||F.ageMax!=null&&day-a.founded>F.ageMax)||
    (F.dayMin!=null||F.dayMax!=null)&&(!a||a.day<(F.dayMin??0)||F.dayMax!=null&&a.day>F.dayMax)||keys&&!keys.has(key));
  return {listed:true,kept,value};}
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
