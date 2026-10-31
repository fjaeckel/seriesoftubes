// Architect runs (prototype). Named pz* like the puzzle actions, so a puzzle lets them through.
Object.assign(ACT,{
 pzArStart:({id})=>{const r=arRunDef(id);if(r)arBegin(r);},
 pzArGo:()=>{if(arOn())arShowStart();},
 pzArSkip:()=>{if(arOn())arShowSkip();},
 pzArNext:()=>{if(arOn())arNext();},
 pzArAll:()=>{if(!arOn())return;UI.arAll=!UI.arAll;if(!UI.arAll&&UI.sel&&UI.sel.type==='city'&&!arKind(UI.sel.id))UI.sel=null;sfx('click');renderAll();},
});
