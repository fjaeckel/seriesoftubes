// Find a network at a POP (#199): view state only.
Object.assign(ACT,{
 netFind:({q})=>{UI.netQ=String(q??'').slice(0,40);pnSecReset();listReset('pni');renderPanel();},
 netOnly:()=>{UI.netOnly=!UI.netOnly;pnSecReset();listReset('pni');renderPanel();},
 netClear:()=>{UI.netQ='';UI.netOnly=false;pnSecReset();listReset('pni');renderPanel();},
});
