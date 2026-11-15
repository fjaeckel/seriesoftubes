// The city and link panels: another page of a long list, and folding or unfolding a block (93-ui/48-panel-folds.js).
Object.assign(ACT,{
 panelMore:({k,n})=>{if(!S||!UI.sel)return;k=String(k??'').slice(0,40);pnState().n[k]=clamp(n|0,0,5000)+PN_STEP;renderPanel();},
 panelFold:({k})=>{if(!S||!UI.sel)return;k=String(k??'').slice(0,40);const P=pnState();P.open[k]=!P.open[k];renderPanel();},
 // Layout is read here, on a tap, never while rendering.
 panelJump:({k})=>{const sc=$('panelBody').querySelector('.scroll'),el=sc&&/^[a-z]+$/.test(k)&&sc.querySelector('[data-sec="'+k+'"]'),bar=sc&&sc.querySelector('.pnjump');if(el)sc.scrollTop=Math.max(0,el.offsetTop-sc.offsetTop-(bar?bar.offsetHeight:0));},
});
