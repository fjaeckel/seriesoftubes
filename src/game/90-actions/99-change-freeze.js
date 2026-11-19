/* ---------- The change freeze (38-streaming-events.js) ----------
   While a big live event streams, a Streaming service touches nothing: every action that changes the network refuses,
   the intern's included. Wrapped here, after every action file, so each keeps its own code. */
const FREEZE_ACTS=['buildPop','buyTransit','lagT','lagP','lagIx','cancelTransit','buyIx','cancelIx','rs','downIx','downT','downP','teDeploy','buyTE','teToggle','teL2Toggle',
 'addSite','rmSite','siteSet','peer','unpeer','peerAll','pni','pniAll','cancelPni','cache','rmCache','upLink','decomGo','rmLink','buildLink','buyNni','lagNni','rmNni','buyVxc','upVxc','cancelVxc',
 'setMetric','metricSet','setCarry','setStandby','setRoute','addParallel','coreUp','coreSet','addRouter','rmRouter','upRouter','orderCable','orderDf','regen','addCh','rmCh','addPair','upSys',
 'addGen','cntDc','cntBox','cntXbox','utilityKit','utilityKitAll','utilityCaches','utilityRouteServers','ptApply','ptAll','opsNewPop','setChCount','foundIx','myIxUp','buildScrub','scrubUp','rmScrub'];
for(const k of FREEZE_ACTS){const f=ACT[k];if(typeof f!=='function')continue;
  ACT[k]=a=>{const z=cntFrozen();if(z){toast(tr('streaming.frozen_why',{show:z.show,date:dateStr(z.until)}),'bad');sfx('err');return;}return f(a);};}
