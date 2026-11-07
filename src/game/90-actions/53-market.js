// The capacity market (37-fiber-market.js): its tab, and the settings the broker sells by.
Object.assign(ACT,{
 marketOpen:()=>{if(!S||pzOn())return;UI.dtab='market';$('dash').hidden=false;renderDash();},
 mktHold:({v})=>{if(!CM_HOLD.includes(v))return;S.cm.hold=v;cmRelist();sfx('click');after();},
 // Switching a product off takes what the broker listed of it off the market; what it already sold stays sold.
 mktCfg:({p,k,v})=>{const c=CM_P.includes(p)&&S.cm.p[p];if(!c)return;
   if(k==='on'){c.on=!!v;if(!c.on)for(const l of S.links)if(l.list&&l.list[CM_L[p]])l.list[CM_L[p]]=0;}
   else if(k==='min'&&CM_MIN[p].includes(v))c.min=v;else if(k==='floor'&&CM_FLOOR.includes(v))c.floor=v;else return;
   cmRelist();sfx('click');after();},
 // A route the broker leaves alone keeps nothing listed by the thresholds.
 mktRoute:({k})=>{const r=typeof k==='string'&&cmRoutes().get(k);if(!r)return;if(S.cm.off[k]){delete S.cm.off[k];}else{S.cm.off[k]=1;
     for(const l of r.ls)if(l.list)for(const p of CM_P)if(S.cm.p[p].on)l.list[CM_L[p]]=0;}
   cmRelist();sfx('click');after();},
});
