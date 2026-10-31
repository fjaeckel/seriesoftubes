// The PNI list's filter, sort and folded groups (#175, #172): view state only, never saved.
Object.assign(ACT,{
  pniFilter:({f})=>{UI.pniF=['all','t','worth','pni'].includes(f)?f:'all';listReset('pni');renderPanel();},
  pniGrp:({g,o})=>{if(!PNI_GRP.includes(g))return;UI.pniOpen=UI.pniOpen||{};UI.pniOpen[g]=!!o;renderPanel();},
  pniSort:()=>{UI.pniSort=UI.pniSort==='az'?'worth':'az';renderPanel();},
});
