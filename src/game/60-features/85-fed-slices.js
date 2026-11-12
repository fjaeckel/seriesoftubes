/* ================= FEDERATION: slicing the boards =================
   One leaderboard view, sliced by every dimension the records carry (plan, "Slicing the boards"). Filtering runs on
   the client from the records it fetched: the server needs no query language. */
// The cities of a region: {continent: 'EU'} (a CITIES reg), {country: 'DE'}, {city: 'fra'}; null for the world.
function fedRegion(g){if(!g)return null;if(g.city)return [g.city];
  return CITIES.filter(c=>g.country?c.cc===g.country:c.reg===g.continent).map(c=>c.id);}
/* A slice. v: {board, measure, division ('all', 'human', 'ai'), model, harness (AI setup), region ({continent|country|
   city}), home (CC: home market), from (CC: players from), ageMin/ageMax (real days since founded), dayMin/dayMax (game
   days), tier1 (true/false), policy, peers (only networks I have a deal with), server (a server id, or null for all
   joined servers merged)}; any left out does not filter. d: {now, records [{id, key, slot, t, body, cc, srv: [server
   ids]}], announces (Map key -> announce record), exclude (keys), deals (S.fed.deals), me (own key)}.
   Gives {rows: [{key, value, rank, ai}], me: own row (pinned whatever is selected; rank null when the slice hides it)}. */
// The board query under a slice (one server's records kept per data, so slicing again reuses its board).
function fedSliceBoardQ(v,d){const recs=v.server?fedMemo(d.records,'srv|'+v.server,()=>d.records.filter(r=>(r.srv||[]).includes(v.server))):d.records;
  return {now:d.now,board:v.board||'pops',measure:v.measure||'total',division:'all',exclude:d.exclude||[],cities:fedRegion(v.region),records:recs};}
// Works out a slice's board in short steps (fedBoardWarm), so fedSlice(v, d) is then a lookup.
const fedSliceWarm=(v,d)=>fedBoardWarm(fedSliceBoardQ(v,d));
function fedSlice(v,d){const q=fedSliceBoardQ(v,d),recs=q.records,rows=fedBoard(q);
  const W=fedWindows(d.now),by=fedByKey(recs),LR=fedMemo(recs,'last|'+W.current.to,()=>new Map()),
    lastRec=k=>{let e=LR.get(k);if(e===undefined)LR.set(k,e=fedEffs(by.get(k)||[],W.current.to,W.current.to)[0]);return e;};
  const ann=k=>d.announces&&d.announces.get(k),day=fedDiv(d.now,FED_DAY),peers=new Set((d.deals||[]).map(x=>x.key));
  const keep=row=>{const r=lastRec(row.key),b=r.body,a=ann(row.key),ab=a&&a.body,ai=b.ai;
    if(v.division==='ai'&&!ai||v.division==='human'&&ai)return false;
    if(v.model!=null&&(!ai||ai.model!==v.model)||v.harness!=null&&(!ai||ai.harness!==v.harness))return false;
    if(v.tier1!=null&&b.tier1!==v.tier1)return false;if(v.from!=null&&r.cc!==v.from)return false;
    if(v.home!=null&&(!ab||ab.home!==v.home)||v.policy!=null&&(!ab||ab.policy!==v.policy))return false;
    if((v.ageMin!=null||v.ageMax!=null)&&(!ab||day-ab.founded<(v.ageMin??0)||day-ab.founded>(v.ageMax??Infinity)))return false;
    if((v.dayMin!=null||v.dayMax!=null)&&(!ab||ab.day<(v.dayMin??0)||ab.day>(v.dayMax??Infinity)))return false;
    return !v.peers||peers.has(row.key);};
  const out=rows.filter(keep).map((r,i)=>({key:r.key,value:r.value,rank:i+1,ai:!!lastRec(r.key).body.ai}));
  let me=d.me?out.find(r=>r.key===d.me)||null:null;
  if(d.me&&!me){const r=rows.find(x=>x.key===d.me);if(r)me={key:r.key,value:r.value,rank:null,ai:!!lastRec(r.key).body.ai};}
  return {rows:out,me};}
