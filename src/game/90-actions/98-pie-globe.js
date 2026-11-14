// The Pie Control globe's day/night switch (96-map/89-pie-globe.js). Display only: nothing in the save changes.
Object.assign(ACT,{
 pieGlobeNight:()=>{pieGlobeNight(!PG.night);},
 // The Traffic tab has no globe: the overview's shows the city.
 pieLook:({city})=>{if(!isCity(city))return;if(!PG.cv&&S&&S.pie){UI.pieTab='home';pieModal();}if(!PG.cv)return;sfx('click');if(UI.pieTab==='dish'){UI.pieFocus=city;for(const r of document.querySelectorAll('#modal [data-dish]'))r.classList.toggle('pie-focus',r.dataset.dish===city);PG.dAt=-1e9;}pieGlobeLook([city]);},
 pieGlobeZoom:({d})=>{pieGlobeZoom(PG.zoom*(d>0?1.5:1/1.5));},
});
