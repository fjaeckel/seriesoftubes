// The city and link panels: another page of a long list, and folding or unfolding a block (93-ui/48-panel-folds.js).
Object.assign(ACT,{
 panelMore:({k,n})=>{if(!S||!UI.sel)return;k=String(k??'').slice(0,40);pnState().n[k]=clamp(n|0,0,5000)+PN_STEP;renderPanel();},
 // o says which way (a section that opened by itself has no state yet to flip).
 panelFold:({k,o})=>{if(!S||!UI.sel)return;k=String(k??'').slice(0,40);pnSet(k,o===undefined?!pnOpen(k):!!o);renderPanel();},
 // Layout is read here, on a tap, never while rendering.
 // A chip that jumps to a folded section unfolds it first.
 panelJump:({k})=>{let sc=$('panelBody').querySelector('.scroll');const f=sc&&/^[a-z]+$/.test(k)&&sc.querySelector('.psec[data-sec="'+k+'"]:not(.on)');if(f){pnSet('s:'+k,true);renderPanel();sc=$('panelBody').querySelector('.scroll');}const el=sc&&/^[a-z]+$/.test(k)&&sc.querySelector('[data-sec="'+k+'"]'),bar=sc&&sc.querySelector('.pnjump');if(el)sc.scrollTop=Math.max(0,el.offsetTop-sc.offsetTop-(bar?bar.offsetHeight:0));},
});
