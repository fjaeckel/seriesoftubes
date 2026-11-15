/* ================= MULTIPLAYER: another player's network, live =================
   What a network is doing now, for its card: a rankwhy on the board of now for traffic (§9.5) answers with its live
   state (§5.11: total traffic, traffic with each player, POPs, pies) and those of the players it lists, each signed by
   its author. Checked in the federation worker like any record; nothing is kept but in memory. */
// Items of a rankwhy answer: the live states still live at now and the newest announce of each key, checked.
async function fedLiveRun(items,now){const st=new Map(),an=new Map();
  for(const it of Array.isArray(items)?items:[]){if(!it||!it.rec||typeof it.rec!=='object')continue;
    if(it.rec.kind==='state'){const c=await fedCheck(it.rec,now,{kinds:FED_STATE});if(!c.ok)continue;const o=st.get(c.rec.key);
      if(!o||c.rec.t>o.t)st.set(c.rec.key,{key:c.rec.key,t:c.rec.t,body:c.rec.body});continue;}
    if(it.rec.kind!=='announce')continue;const c=await fedCheck(it.rec,now);if(!c.ok)continue;const o=an.get(c.rec.key);
    if(!o||c.rec.t>o.t)an.set(c.rec.key,{key:c.rec.key,t:c.rec.t,body:c.rec.body});}
  return {states:[...st.values()],anns:[...an.values()]};}
FW_OPS.live=a=>fedLiveRun(a.items,a.now);
/* The network's live state and its partners', from the first joined server that ranks boards of now and answers:
   {state, partners: Map key -> state, anns: Map key -> announce body, srv, at} (state null: not live there), or null
   when no server could be asked. */
async function fedLiveOf(key){const f=S&&S.fed;if(!f||!f.key||FdK(key))return null;
  for(const u of f.servers){const c=fedReadyConn(u);if(!c||!fedFeat(c,'state'))continue;
    const w=await fedAskRetry(c,{m:'rankwhy',board:'traffic',measure:'now',division:'all',filters:{},key},true);
    if(!w||w.m!=='recs'||!fedLive(c))continue;const now=fedNow(),r=await fwDo('live',{items:w.items||[],now});
    const st=new Map(r.states.map(s=>[s.key,s]));
    return {state:st.get(key)||null,partners:st,anns:new Map(r.anns.map(a=>[a.key,a.body])),srv:c.srv,at:Number.isSafeInteger(w.at)?w.at:now};}
  return null;}
