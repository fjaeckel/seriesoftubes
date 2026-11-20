/* ---------- The change freeze (37-content-core.js) ----------
   While a charter declares a freeze (chFrozen(): a big launch, a live night), nobody touches the network: every action
   that changes it refuses, the intern's included. Wrapped here, after every action file, so each keeps its own code;
   a charter adds its own actions to FREEZE_ACTS in its action file. Without a freeze every action runs as before. */
FREEZE_ACTS.push('buildPop','buyTransit','lagT','lagP','lagIx','cancelTransit','buyIx','cancelIx','rs','downIx','downT','downP','teDeploy','buyTE','teToggle','teL2Toggle',
 'addSite','rmSite','siteSet','peer','unpeer','peerAll','pni','pniAll','cancelPni','cache','rmCache','upLink','decomGo','rmLink','buildLink','buyNni','lagNni','rmNni','buyVxc','upVxc','cancelVxc',
 'setMetric','metricSet','setCarry','setStandby','setRoute','addParallel','coreUp','coreSet','addRouter','rmRouter','upRouter','orderCable','orderDf','regen','addCh','rmCh','addPair','upSys',
 'addGen','utilityKit','utilityKitAll','utilityCaches','utilityRouteServers','ptApply','ptAll','opsNewPop','setChCount','foundIx','myIxUp','buildScrub','scrubUp','rmScrub');
for(const k of new Set(FREEZE_ACTS)){const f=ACT[k];if(typeof f!=='function')continue;
  ACT[k]=a=>{const z=chFrozen();if(z){toast(tr('change_freeze.frozen_why',{show:z.show,date:dateStr(z.until)}),'bad');sfx('err');return;}return f(a);};}
