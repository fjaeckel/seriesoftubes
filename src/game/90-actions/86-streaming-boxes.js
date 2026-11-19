/* ---------- Exchange boxes (38-streaming-boxes.js) ---------- */
Object.assign(ACT,{
 // A Binge Box on an exchange you have a port on (d:1), or one taken off it (d:-1).
 cntXbox:({ix,d})=>{if(!content()||!isIx(ix))return;d=+d;const C=S.cnt;
   if(d===-1){const i=C.xbox.findIndex(b=>b.ix===ix);if(i<0)return;C.xbox.splice(i,1);after();return;}
   if(d!==1)return;const why=xboxWhy(ix);if(why){toast(why,'bad');sfx('err');return;}if(!spend(XBOX_COST))return;
   C.xbox.push({id:uid(),ix,day:S.day,f:FILL_NEW});toast(tr('streaming_boxes.xbox_up',{ix:esc(ixName(ix))}),'good');sfx('build');after();},
});
