// The Networks tab of the left panel: search, type chips and the one open row. View state only.
Object.assign(ACT,{
 nlFind:({q})=>{UI.nlQ=String(q??'').slice(0,40);UI.netFocus=null;listReset('nets');renderLeft();},
 nlType:({t})=>{UI.nlT=UI.nlT===t||!TYPE_L[t]?'':t;UI.netFocus=null;listReset('nets');renderLeft();},
 nlClear:()=>{UI.nlQ='';UI.nlT='';listReset('nets');renderLeft();},
 nlOpen:({id})=>{UI.nlOpen=UI.nlOpen===id||!NET[id]?null:id;renderLeft();},
});
