// The capacity market (37-fiber-market.js): its window (Lambda Bazaar, 94-dashboard/56-lambda-bazaar.js), the settings the
// broker sells by everywhere, and a route's own rules.
// After a setting changed: the game as after any action, and the window if it is open.
const cmAfter=()=>{cmRelist();sfx('click');after();bazRefresh();};
const bazView=()=>{sfx('click');bazModal();};
// A product no longer sold on these fibers: what the broker listed of it comes off the market (what you listed by hand
// stays); what it already sold stays sold.
const cmUnlist=(ls,p)=>{for(const l of ls)if(l.list&&l.list[CM_L[p]]&&!cmOn(edgeKey(l),p))l.list[CM_L[p]]=cmHand(l,CM_L[p]);};
// The quick setups of the Products tab: every product's switch, minimum and floor at once.
const CM_PRESET={all:p=>({on:true,min:CM_MIN[p][0],floor:CM_DEF[p].floor}),careful:p=>({on:true,min:CM_MIN[p][Math.min(2,CM_MIN[p].length-1)],floor:p==='iru'?120:100}),stop:p=>({...S.cm.p[p],on:false})};
Object.assign(ACT,{
 /* Opens the window: on a tab (t), on the routes with a filter (f), or on one route's card, unfolded (k). */
 marketOpen:({t,f,k}={})=>{if(!S||pzOn()||hyper())return;UI.confirm=null;
   if(typeof k==='string'&&cmRoutes().has(k)){UI.bazTab='routes';UI.bazFilt='all';UI.bazOpen=k;const D=bazData(),i=bazRows(D).findIndex(x=>x.k===k);UI.bazN=Math.max(UI.bazN||0,BAZ_PG*Math.ceil((i+1)/BAZ_PG));}
   else if(BAZ_TABS.includes(t)){UI.bazTab=t;if(t==='routes'&&(BAZ_FILT.includes(f)||BAZ_KIND.includes(f))){UI.bazFilt=f;UI.bazN=0;}}
   UI._bazT=null;UI.bazAsk=null;bazModal();
   if(typeof k==='string'){const el=document.querySelector(`#modal [data-route="${k.replace(/[^a-z0-9|]/g,'')}"]`);if(el&&el.scrollIntoView)el.scrollIntoView({block:'start'});}},
 bazTab:({t})=>{if(!BAZ_TABS.includes(t))return;UI.bazTab=t;UI.bazAsk=null;bazView();},
 bazSort:({v})=>{UI.bazSort=BAZ_SORT.includes(v)?v:'mo';bazView();},
 bazFilt:({v})=>{UI.bazFilt=BAZ_FILT.includes(v)||BAZ_KIND.includes(v)?v:'all';UI.bazN=0;bazView();},
 bazRow:({k})=>{UI.bazOpen=UI.bazOpen===k?null:k;bazView();},
 bazMore:()=>{UI.bazN=Math.max(BAZ_PG,UI.bazN||0)+BAZ_PG;bazView();},
 bazHelp:({p})=>{UI.bazHelp=UI.bazHelp===p?null:p;bazView();},
 // From a route's card to its fiber on the map.
 bazLink:({id})=>{if(!S.links.some(l=>l.id===id))return;closeModal();$('dash').hidden=true;selectLink(id);focusLink(id);},
 mktHold:({v})=>{v=+v;if(!CM_HOLD.includes(v))return;S.cm.hold=v;cmAfter();},
 mktCfg:({p,k,v})=>{const c=CM_P.includes(p)&&S.cm.p[p];if(!c)return;v=+v;
   if(k==='on'){c.on=!!v;if(!c.on)cmUnlist(S.links,p);}
   else if(k==='min'&&CM_MIN[p].includes(v))c.min=v;else if(k==='floor'&&CM_FLOOR.includes(v))c.floor=v;else return;
   cmAfter();},
 // A route the broker leaves alone keeps nothing listed by the thresholds, only what you listed by hand.
 mktRoute:({k})=>{const r=typeof k==='string'&&cmRoutes().get(k);if(!r)return;if(S.cm.off[k]){delete S.cm.off[k];}else{S.cm.off[k]=1;
     for(const l of r.ls)if(l.list)for(const p of CM_P)if(cmOn(k,p))l.list[CM_L[p]]=cmHand(l,CM_L[p]);}
   cmAfter();},
 /* A route's own rules: f is hold, floor or a product, v one of the allowed values, or nothing for "as everywhere".
    Rules that say nothing are not kept. */
 mktRt:({k,f,v})=>{const r=typeof k==='string'&&cmRoutes().get(k);if(!r)return;const rt=S.cm.rt||{},o={...rt[k]},un=v===''||v===null||v===undefined,was=CM_P.filter(p=>cmOn(k,p));v=+v;
   if(f==='hold'){if(un)delete o.hold;else if(CM_HOLD.includes(v))o.hold=v;else return;}
   else if(f==='floor'){if(un)delete o.floor;else if(CM_FLOOR.includes(v))o.floor=v;else return;}
   else if(CM_P.includes(f)){const q=o.p||{};if(un)delete q[f];else if(v===0||v===1)q[f]=v;else return;if(Object.keys(q).length)o.p=q;else delete o.p;}
   else return;
   if(Object.keys(o).length)rt[k]=o;else delete rt[k];if(Object.keys(rt).length)S.cm.rt=rt;else delete S.cm.rt;
   for(const p of was)cmUnlist(r.ls,p);cmAfter();},
 mktRtReset:({k})=>{const r=typeof k==='string'&&cmRoutes().get(k);if(!r||!S.cm.rt||!S.cm.rt[k])return;const was=CM_P.filter(p=>cmOn(k,p));delete S.cm.rt[k];if(!Object.keys(S.cm.rt).length)delete S.cm.rt;for(const p of was)cmUnlist(r.ls,p);cmAfter();},
 // Every product at once (the Products tab's quick setups).
 mktPreset:({v})=>{if(!own(CM_PRESET,v))return;for(const p of CM_P){const was=S.cm.p[p].on;S.cm.p[p]=CM_PRESET[v](p);if(was&&!S.cm.p[p].on)cmUnlist(S.links,p);}
   toast(v==='all'?tr('market.t_pre_all'):v==='careful'?tr('market.t_pre_careful'):tr('market.t_pre_stop'),'good');cmAfter();},
 /* Wherever buyers pay less than your floor but at least the lowest one: that floor. w 'here' sets it as those routes'
    own rule; otherwise everywhere, for the products it holds up (on a route's own rule where it has one). Routes where
    buyers pay less still are left as they are: no floor would sell there. */
 mktFloorLow:({w}={})=>{const F0=CM_FLOOR[0],D=bazData();UI.bazAsk=null;if(!D.fx.length)return;
   if(w==='here'){const rt=S.cm.rt||{};for(const x of D.fx)rt[x.k]={...rt[x.k],floor:F0};S.cm.rt=rt;toast(trn('market.t_floor_here',D.fx.length,{f:F0}),'good');}
   else{for(const x of D.fx)for(const q of x.fix){const o=cmRt(x.k);if(o&&o.floor!==undefined)o.floor=F0;else S.cm.p[q.p].floor=F0;}
     toast(tr('market.t_floor_all',{f:F0,list:D.fxP.map(p=>tr(CM_NAME[p])).join(', ')}),'good');}
   cmAfter();},
 bazAsk:({v})=>{UI.bazAsk=UI.bazAsk===v||v!=='floor'?null:v;bazView();},
});
