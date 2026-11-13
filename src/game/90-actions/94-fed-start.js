// The title screen's "Play with others" switch and its server picker (95-modals/47-fed-start.js).
Object.assign(ACT,{
 // Turning it on is what fetches the registry: nothing is requested before the player asks. Offline it stays off.
 fsSet:({on}={})=>{if(!fsCan()||!fsOnline()){fsPaint();return;}const f=fsUI();f.on=on===true;f.note=null;if(f.on)fsLoad(true);fsPaint();},
 fsPick:({url}={})=>{if(typeof url!=='string'||!UI.fs)return;UI.fs.url=url;UI.fs.typed='';fsPaint();},
});
