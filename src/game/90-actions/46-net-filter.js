// Find a network at a POP (#199): view state only.
Object.assign(ACT,{
 netFind:({q})=>{UI.netQ=String(q??'').slice(0,40);listReset('pni');renderPanel();},
 netOnly:()=>{UI.netOnly=!UI.netOnly;listReset('pni');renderPanel();},
 netClear:()=>{UI.netQ='';UI.netOnly=false;listReset('pni');renderPanel();},
});
