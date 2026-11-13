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
const FED_FLOOR={pops:10,pies:100,traffic:1000,total:1000,cone:10},FED_NEWCOMER=30;
/* One network's place on a board (§10.3 to §10.5, §10.12), worked out from records alone: how a game checks a row a
   server ranked (§9.5 rankwhy). q: {now, board, measure, division, exclude (keys the server leaves off), cities (a region,
   or null), filters (as in a rank request), founded (the cone board: key -> founded of its newest announce)}; recs: stats
   records [{id, key, slot, t, body, cc}] (the key's and, on the traffic board, its partners', on the cone board those of
   every network its cone can reach); ann: the key's newest announce body, or null; states: the live states held at
   q.now (§10.13: the running slot ends the current window; the key's and those rankwhy adds), or none. Gives {listed (on
   the board), kept (also in the slice), value}. A pure function of its arguments (it may move to a worker). */
function fedRankOne(q,key,recs,ann,states){const W=fedWindows(q.now),from=W.previous.from,last=W.current.to,by=fedByKey(recs),ex=new Set(q.exclude||[]),
    cs=q.cities?new Set(q.cities):null,F=q.filters||{},w=by.get(key),pops=r=>{let n=0;for(const c of Object.keys(r.body.pops))if(!cs||cs.has(c))n+=r.body.pops[c];return n;};
  const no={listed:false,kept:false,value:0},l=fedEffAt(w,last);
  if(ex.has(key)||!fedHas(l)||q.board==='pies'&&!fedOwn(l.body,'pies')||cs&&pops(l)===0||q.measure==='growth'&&!fedHas(fedEffAt(w,from)))return no;
  const traffic=(r,s)=>{let i=0,o=0;for(const e of r.body.traffic){if(ex.has(e.key))continue;const y=fedEffAt(by.get(e.key),s);
      if(cs&&!(fedHas(y)&&pops(y)>0))continue;if(!y){i+=e.in;o+=e.out;}else if(fedHas(y)){const z=y.body.traffic.find(x=>x.key===key);if(z){i+=Math.min(e.in,z.out);o+=Math.min(e.out,z.in);}}}
    return [i,o];};
  /* The customer cone at slot s (§10.4): networks reachable over counted transit edges. X -> Y counts when both have a
     value (heard in the 7 days before), neither is excluded, X lists Y in cust and Y lists X in up, each reports traffic
     with the other both ways, and Y joined at least 30 days before s. */
  const fd=q.founded||{},both=(r,k)=>{const z=r.body.traffic.find(x=>x.key===k);return !!z&&z.in>0&&z.out>0;};
  const cone=(s,at=k=>fedEffAt(by.get(k),s))=>{const seen=new Set([key]),todo=[key];
    while(todo.length){const z=todo.pop(),r=at(z);
      for(const y of r.body.cust||[]){if(seen.has(y)||ex.has(y)||!fedOwn(fd,y)||fedDiv(s,FED_DAY)-fd[y]<FED_NEWCOMER)continue;const ye=at(y);
        if(!fedHas(ye)||!(ye.body.up||[]).includes(z)||!both(r,y)||!both(ye,z))continue;seen.add(y);todo.push(y);}}
    return seen.size-1;};
  // POPs and pies: the value at the latest slot of the window with one (slots run in order: the last wins).
  /* The running slot c (§10.13): a key whose live state is in normal mode has one more sample there, the latest of the
     current window. Partners and cone members report there with their live state, else their effective record at c. */
  const c=fedSlot(q.now),L=fedLatest(q.now,states||[]),run=k=>{const s=L.get(k);return s?{body:s.body}:fedEffAt(by.get(k),c);};
  const smp=(()=>{const s=L.get(key);if(!s||s.body.mode!=='normal')return null;const r={body:s.body};
    if(q.board==='pops')return [pops(r),0];if(q.board==='pies')return [r.body.pies||0,0];if(q.board==='total')return [r.body.total||0,0];
    if(q.board==='cone')return [cone(c,run),0];
    let i=0,o=0;for(const e of r.body.traffic){if(ex.has(e.key))continue;const y=run(e.key);
      if(cs&&!(fedHas(y)&&pops(y)>0))continue;if(!y){i+=e.in;o+=e.out;}else if(fedHas(y)){const z=y.body.traffic.find(x=>x.key===key);if(z){i+=Math.min(e.in,z.out);o+=Math.min(e.out,z.in);}}}
    return [i,o];})();
  const total=(a,b,x)=>{const IN=[],OUT=[];let lo=null;
    for(let k=a;k<b;k++){const s=from+k*FED_SLOT,r=fedEffAt(w,s);if(!fedHas(r))continue;
      if(q.board==='traffic'){const [i,o]=traffic(r,s);IN.push(i);OUT.push(o);}else if(q.board==='total')IN.push(r.body.total||0);else if(q.board==='cone')IN.push(cone(s));
      else lo=q.board==='pies'?r.body.pies||0:pops(r);}
    if(x){if(q.board==='traffic'){IN.push(x[0]);OUT.push(x[1]);}else if(q.board==='total'||q.board==='cone')IN.push(x[0]);else lo=x[0];}
    return q.board==='traffic'?Math.max(fedP95(IN),fedP95(OUT)):q.board==='total'||q.board==='cone'?fedP95(IN):lo||0;};
  let value=total(FED_WIN,2*FED_WIN,smp);
  if(q.measure==='growth'){const prev=total(0,FED_WIN);value=fedDiv((value-prev)*10000,Math.max(prev,FED_FLOOR[q.board]));}
  return {listed:true,kept:fedKept(q,key,l,ann,fedDiv(q.now,FED_DAY)),value};}
// Whether a listed network passes a slice's division and filters (§10.12): l {body, cc}, a its newest announce body.
function fedKept(q,key,l,a,day){const F=q.filters||{},ai=l.body.ai,keys=F.keys?new Set(F.keys):null;
  return !(q.division==='ai'&&!ai||q.division==='human'&&ai||F.model!=null&&(!ai||ai.model!==F.model)||F.harness!=null&&(!ai||ai.harness!==F.harness)||
    F.tier1!=null&&l.body.tier1!==F.tier1||F.from!=null&&l.cc!==F.from||F.home!=null&&(!a||a.home!==F.home)||F.policy!=null&&(!a||a.policy!==F.policy)||
    (F.ageMin!=null||F.ageMax!=null)&&(!a||day-a.founded<(F.ageMin??0)||F.ageMax!=null&&day-a.founded>F.ageMax)||
    (F.dayMin!=null||F.dayMax!=null)&&(!a||a.day<(F.dayMin??0)||F.dayMax!=null&&a.day>F.dayMax)||keys&&!keys.has(key));}
/* Each key's live state at now (§10.13): the newest (greatest t, then lowest id) less than 900 s old. states: [{id, key, t,
   body}]. Gives Map key -> state. */
function fedLatest(now,states){const m=new Map();
  for(const s of states){if(!s||now-s.t>=FED_STATE_LIFE)continue;const o=m.get(s.key);if(!o||s.t>o.t||s.t===o.t&&fedByStr(s.id,o.id)<0)m.set(s.key,s);}
  return m;}
/* One network's place on a board of now (§10.13), from live states alone: how a game checks a row of now. q: {now (the
   snapshot's time, the ranks answer's at), board, division, exclude, cities, filters, founded (the cone board)}; states:
   live states [{id, key, t, body}] (the key's and those rankwhy adds); ann: the key's newest announce body or null; cc:
   the country of its newest stats record (the from filter), or null. Gives {listed, kept, value}. */
function fedNowOne(q,key,states,ann,cc){const L=fedLatest(q.now,states),ex=new Set(q.exclude||[]),cs=q.cities?new Set(q.cities):null;
  const has=k=>{const s=L.get(k);return s&&s.body.mode==='normal'&&!ex.has(k)?s:null;},pops=b=>{let n=0;for(const c of Object.keys(b.pops))if(!cs||cs.has(c))n+=b.pops[c];return n;};
  const inR=s=>!cs||pops(s.body)>0,l=has(key);
  if(!l||!inR(l)||q.board==='pies'&&!fedOwn(l.body,'pies'))return {listed:false,kept:false,value:0};
  const b=l.body,day=fedDiv(q.now,FED_DAY);let value=0;
  if(q.board==='pops')value=pops(b);else if(q.board==='pies')value=b.pies;else if(q.board==='total')value=b.total||0;
  else if(q.board==='traffic'){let i=0,o=0;
    // min() of both live states; a partner without one (or not normal, excluded, outside the region) counts 0.
    for(const e of b.traffic){const y=has(e.key);if(!y||!inR(y))continue;const z=y.body.traffic.find(x=>x.key===key);if(z){i+=Math.min(e.in,z.out);o+=Math.min(e.out,z.in);}}
    value=Math.max(i,o);}
  else if(q.board==='cone'){const fd=q.founded||{},both=(r,k)=>{const z=r.body.traffic.find(x=>x.key===k);return !!z&&z.in>0&&z.out>0;},seen=new Set([key]),todo=[key];
    while(todo.length){const z=todo.pop(),r=has(z);
      for(const y of r.body.cust||[]){const ye=has(y);if(seen.has(y)||!ye||!fedOwn(fd,y)||day-fd[y]<FED_NEWCOMER)continue;
        if(!(ye.body.up||[]).includes(z)||!both(r,y)||!both(ye,z))continue;seen.add(y);todo.push(y);}}
    value=seen.size-1;}
  return {listed:true,kept:fedKept(q,key,{body:b,cc:cc||null},ann,day),value};}
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
// What a newcomer pays of a card price (§10.10): 750 per mille, rounded down.
const fedNewPrice=v=>fedDiv(v*750,1000);
// Whether a network that joined on real day `founded` is a newcomer at unix time t (§10.10).
const fedIsNew=(founded,t)=>Number.isSafeInteger(founded)&&fedDiv(t,FED_DAY)-founded>=0&&fedDiv(t,FED_DAY)-founded<FED_NEWCOMER;
/* Deal terms (§10.10). anns: the counterparty's announces known ({id, kind, key, t, body}); offer {id, key, t, body};
   accept {t} or null; renews (the running deal it renews, {id, start, end}) or null.
   Gives {ok:true, auto, start, end} (start null while a review waits for its accept) or {ok:false, error}. */
function fedDeal(anns,offer,accept,renews){const b=offer.body,no=fedNo;let mode='review';
  if(fedOwn(b,'basis')){const basis=anns.find(a=>a.id===b.basis);if(!basis)return no('not_found');
    if(basis.kind!=='announce'||basis.key!==b.to||basis.t>offer.t)return no(FdBF);
    const next=anns.filter(a=>a.kind==='announce'&&a.key===b.to&&a.t>basis.t).sort((x,y)=>x.t-y.t)[0];
    if(next&&!(next.t>offer.t-FED_DAY))return no('stale_terms');
    mode=basis.body.auto[b.deal];if(mode==='decline'||mode===undefined)return no('declined');
    const R=basis.body.rates||{},T=b.terms;let P=v=>v;
    // The newcomer price: the buyer joined less than 30 days before the offer, the seller did not; every price 25% off.
    if(fedOwn(T,'founded')){const d=fedDiv(offer.t,FED_DAY),bf=basis.body.founded;
      if(d-T.founded<0||d-T.founded>=FED_NEWCOMER||!Number.isSafeInteger(bf)||d-bf<FED_NEWCOMER)return no('bad_terms');P=fedNewPrice;}
    if(b.deal==='transit'){const r=R.transit;if(!r)return no('no_terms');let off=0;for(const c of r.commit)if(c.mbps<=T.mbps)off=c.off;
      if(T.perGbps!==P(fedDiv(r.perGbps*(1000-off),1000))||T.term<r.term)return no('bad_terms');}
    else if(b.deal==='pni'){const r=R.pni;if(!r)return no('no_terms');const p=r.ports.find(x=>x.mbps===T.mbps);
      if(!p||T.setup!==P(r.setup)||T.monthly!==P(p.monthly)||T.term<r.term)return no('bad_terms');}
    else if(b.deal==='port'){const r=R.ix;if(!r)return no('no_terms');const p=r.ports.find(x=>x.mbps===T.mbps);
      if(!r.at.includes(T.at)||!p||T.monthly!==P(p.monthly)||T.term<30)return no('bad_terms');}
    else if(b.deal==='wave'){const r=R.wave;if(!r)return no('no_terms');const p=r.sizes.find(x=>x.gbps===T.gbps);
      if(!r.routes.some(x=>x.a===T.a&&x.b===T.b)||!p||T.monthly!==P(p.monthly)||T.term<r.term)return no('bad_terms');}}
  const auto=mode==='auto';let start=auto?offer.t:accept?accept.t:null;
  if(start!==null&&renews)start=Math.max(renews.end,start);
  const term=b.terms.term;return {ok:true,auto,start,end:start!==null&&term?start+term*FED_DAY:null};}
