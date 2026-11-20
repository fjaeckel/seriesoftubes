function renderHint(){
  const hn=$('hint');if(!S||UI.hintOff||(S.tut!==undefined&&S.tut!==null)||hsGuideUp()||(innerWidth<760&&(UI.sel||UI.leftOpen)&&!(UI.drag&&UI.drag.mode==='link'))){hn.hidden=true;return;}
  let t='';
  if(pzOn()){t=UI.drag&&UI.drag.mode==='link'?(UI.snap?tr('hint.release_to_plan_a_link'):tr('hint.drag_onto_another_city')):!Object.keys(S.pops).length?tr('puzzles.tap_a_goal_city_to_open'):!S.links.length?(S.ar?tr('architect.drag_from_your_hq'):tr('puzzles.drag_from_a_pink_pop_to')):'';hn.textContent=t;hn.hidden=!t;return;}
  if(UI.drag&&UI.drag.mode==='link')t=UI.snap?tr('hint.release_to_plan_a_link'):tr('hint.drag_onto_another_city');
  // From the network itself, not S.done: a goal met on day 0 is stored as 0, and a charter or mode may not have the goal.
  else if(!S.links.length&&(S.transit.length||S.done.tr!==undefined))t=tr('hint.tip_drag_from_your_pink_router');
  // A Hyperscaler sells no broadband: its charter card says what to do first (55-hyper-panel.js).
  else if(!hyper()&&S.done.bb===undefined&&!Object.values(S.pops).some(p=>p.bb))t=tr('hint.tap_your_city_then_launch_broadband');
  hn.textContent=t;hn.hidden=!t;
}

