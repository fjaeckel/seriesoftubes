/* ================= FEDERATION: slicing the boards =================
   One leaderboard view, sliced by every dimension the plan lists. The server ranks (§9.5, §10.12): a game asks for the
   top rows of a slice and its own row, never for the records. */
// The cities of a region: {continent: 'EU'} (a CITIES reg), {country: 'DE'}, {city: 'fra'}; null for the world.
function fedRegion(g){if(!g)return null;if(g.city)return [g.city];
  return CITIES.filter(c=>g.country?c.cc===g.country:c.reg===g.continent).map(c=>c.id);}
/* The rank request (§9.3) for a view v: {board, measure, division ('all', 'human', 'ai'), model, harness (AI setup), region
   ({continent|country|city}), home (CC: home market), from (CC: players from), ageMin/ageMax (real days since founded),
   dayMin/dayMax (game days), tier1 (true/false), policy, peers (only networks this save has a deal with: deals, its
   S.fed.deals)}; any left out does not filter. n: the rows asked for (1 to 100). */
function fedRankReq(v,deals,n=50){const f={},cs=fedRegion(v.region);if(cs)f.cities=[...new Set(cs)].sort().slice(0,512);
  for(const k of ['model','harness','home','from','policy','tier1','ageMin','ageMax','dayMin','dayMax'])if(v[k]!=null)f[k]=v[k];
  if(v.peers)f.keys=[...new Set((deals||[]).map(d=>d.key))].sort().slice(0,256);
  return {m:'rank',board:v.board||'pops',measure:v.measure||'total',division:v.division||'all',filters:f,n:Math.max(1,Math.min(100,n))};}
const fedRankKey=req=>fedCanon({board:req.board,measure:req.measure,division:req.division,filters:req.filters});
// A ranks answer (§9.5) checked: {slot, n, rows, me} with every row well formed, or null.
const FdRow=r=>!r||typeof r!=='object'||!Number.isSafeInteger(r.rank)||r.rank<1||!!FdK(r.key)||!Number.isSafeInteger(r.value)||!Number.isSafeInteger(r.asn)||
  typeof r.ai!=='boolean'||r.name!==undefined&&(typeof r.name!=='string'||!!FdName(r.name))||r.home!==undefined&&!!FdCC(r.home)||r.cc!==undefined&&!!FdCC(r.cc);
function fedRanksOk(a){if(!a||a.m!=='ranks'||!Number.isSafeInteger(a.slot)||!Number.isSafeInteger(a.n)||a.n<0||!Array.isArray(a.rows)||a.rows.length>100||a.rows.some(FdRow))return null;
  const me=a.me;if(me!==null&&me!==undefined&&(typeof me!=='object'||!Number.isSafeInteger(me.value)||me.rank!==null&&!(Number.isSafeInteger(me.rank)&&me.rank>=1)))return null;
  // at: the time of the snapshot of live states a ranking of now is for (§9.5).
  if(a.at!==undefined&&!Number.isSafeInteger(a.at))return null;
  return {slot:a.slot,...(a.at!==undefined?{at:a.at}:{}),n:a.n,rows:a.rows.map(r=>({rank:r.rank,key:r.key,value:r.value,asn:r.asn,ai:r.ai,name:r.name,home:r.home,cc:r.cc})),me:me?{rank:me.rank,value:me.value}:null};}
/* Several servers' answers as one ("All your servers, merged"): rows joined by key (a key on two servers takes the
   higher value), those in drop (muted by this player, hidden by a joined server, excluded) left out, sorted again
   (value, then key) and ranked by position, top n. The own row (me: this network's key): its merged position when it is
   among the rows, else as the first answer that has one gives it. n: the most rows any server counted. */
function fedRankMerge(answers,me,drop,n=50){const by=new Map();let N=0;
  for(const a of answers){if(!a)continue;N=Math.max(N,a.n);for(const r of a.rows){if(drop&&drop.has(r.key)&&r.key!==me)continue;const o=by.get(r.key);if(!o||r.value>o.value)by.set(r.key,r);}}
  const rows=[...by.values()].sort((a,b)=>b.value-a.value||fedByStr(a.key,b.key)).slice(0,n).map((r,i)=>({...r,rank:i+1}));
  let m=null;for(const a of answers)if(a&&a.me){m={...a.me};break;}
  const i=me?rows.findIndex(r=>r.key===me):-1;if(i>=0)m={rank:i+1,value:rows[i].value};
  return {rows,me:m,n:Math.max(N,rows.length)};}
