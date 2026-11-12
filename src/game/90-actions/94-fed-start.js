// The title screen's "Play with others" switch and its server picker (95-modals/47-fed-start.js).
Object.assign(ACT,{
 // Turning it on is what fetches the registry: nothing is requested before the player asks.
 fsSet:({on}={})=>{if(!fsCan())return;fsUI().on=on===true;if(UI.fs.on)fsLoad(true);fsPaint();},
 fsPick:({url}={})=>{if(typeof url!=='string'||!UI.fs)return;UI.fs.url=url;UI.fs.typed='';fsPaint();},
});
