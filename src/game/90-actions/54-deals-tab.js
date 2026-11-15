// The Deals tab's view: what is unfolded, which offers are shown, how many (43-deals-tab.js). Nothing here is saved.
Object.assign(ACT,{
 // A section (seat, conferences, level) or one offer's fine print. From elsewhere (a toast's "Show me") it opens the tab too.
 dealsFold:({k,o}={})=>{if(!S||typeof k!=='string'||!(DL_SECS.includes(k)||/^o:[\w-]{1,40}$/.test(k)))return;const D=dlState();D.open[k]=o===undefined?!D.open[k]:!!o;
   if(UI.left!=='deals'||!UI.leftOpen){ACT.leftTab({t:'deals'});return;}renderLeft();},
 dealsF:({v}={})=>{if(!['all','ready','work'].includes(v))return;const D=dlState();D.f=D.f===v?'all':v;D.n=DL_PG;renderLeft();},
 dealsMore:()=>{const D=dlState();D.n+=20;renderLeft();},
});
