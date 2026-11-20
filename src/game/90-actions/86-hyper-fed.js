/* ---------- A Hyperscaler's computer-run partners (89-fedplay-hyper.js) ----------
   Edge nodes at computer-run home ISPs: fixed terms, HSF_NPC_MO a node a month, ready in HSF_NPC_DAYS days, at most
   HSF_NPC_CAP per city and ISP. Players host them cheaper and at once (an edge deal); these always answer. */
Object.assign(ACT,{
 hsfNpcEdge:({city,net}={})=>{if(!hyper()||!S.hs||!isCity(city)||typeof net!=='string')return;const cc=CITY[city].cc;
   if(!S.hs.cc[cc]){toast(tr('hyper_fed.launch_first',{country:esc(ccName(cc))}),'bad');sfx('err');return;}
   if(!hsfNpcHosts(city).some(x=>x[0]===net)||S.hs.ne.length>=HSF_NE_MAX)return;
   if(hsfNpcN(city,net)>=HSF_NPC_CAP){toast(tr('hyper_fed.npc_full',{n:HSF_NPC_CAP}),'bad');sfx('err');return;}
   if(!spend(HSF_NPC_MO))return;// the first month up front, the rest with the bills
   const ready=S.day+leadDays(HSF_NPC_DAYS);S.hs.ne.push({c:city,net,ready});
   toast(tr('hyper_fed.npc_ordered',{net:esc(NET[net].name),city:esc(CITY[city].name),date:dateStr(ready)}),'good');sfx('build');after();},
 hsfNpcEdgeOff:({city,net}={})=>{if(!hyper()||!S.hs||!isCity(city)||typeof net!=='string')return;
   let i=-1;S.hs.ne.forEach((x,k)=>{if(x.c===city&&x.net===net)i=k;});if(i<0)return;S.hs.ne.splice(i,1);
   toast(tr('hyper_fed.npc_removed',{net:esc(NET[net].name),city:esc(CITY[city].name)}),'');after();},
});
