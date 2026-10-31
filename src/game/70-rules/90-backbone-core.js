/* ---------- the backbone's technology: plain IGP, LDP, RSVP-TE, SR-MPLS or SRv6 ----------
   S.core.lv is the highest level paid for, S.core.run the one running (at most lv: one step down is safer). A POP
   whose router can't run it stays outside the core: it routes plain IP, TE never steers through it and label
   switching saves it nothing. Each level costs routers some CPU, from LDP's chatter down to SRv6's almost none. Label
   switching makes traffic that only passes through a POP cheaper for its router. TE (Auto-TE, RouteScript) needs
   RSVP-TE or above; RSVP tunnels detour less far than segment routing. Vendors interoperate less the higher you go:
   a core of mixed vendors running at some router's very top level has interop incidents.
   Saves from before this, with Auto-TE already bought, keep the old rules (legacy) until they change level. Puzzles,
   Architect runs and scenarios set TE up themselves and ignore all of this. */
const CORE_LV=[N_('core.plain_igp'),N_('core.ldp_mpls'),N_('core.rsvp_te_mpls'),N_('core.sr_mpls'),N_('core.srv6')];
const CORE_COST=[0,80000,200000,400000,750000],CORE_REQ=[1,2,3,5,7];
const CORE_CPU=[0,.10,.08,.05,.03],CORE_PASS=[1,.6,.6,.6,.6],CORE_TE=[0,0,1.5,2,2],CORE_IOP=[0,.15,.3,.6,1];
// Can model g run level L? Every model runs everything up to its top, except noMpls boxes (SRv6 natively, no labels).
const rgCore=(g,L)=>{const G=RG[g];return !!G&&L<=G.cr&&!(G.noMpls&&L>=1&&L<=3);};
// Do the core rules apply to this game at all?
const coreOn=()=>!!(S&&S.core&&!S.core.legacy&&S.mode!=='puzzle'&&!S.pz&&!S.ar&&!S.scn);
const coreRun=()=>coreOn()?S.core.run:0;
const inCore=c=>{const p=S.pops[c];return !!p&&rgCore(p.rgen||0,coreRun());};
// May Auto-TE and RouteScript run? Legacy saves, puzzles and scenarios: as before.
const coreTE=()=>!coreOn()||S.core.run>=2;
// How far TE may detour, against the shortest path (the old controller: 2×).
const coreTeReach=()=>coreOn()?CORE_TE[S.core.run]:2;
// Share of a router's capacity left after the core's own protocols take their CPU.
const coreCpu=c=>coreOn()&&inCore(c)?1-CORE_CPU[S.core.run]:1;
// What traffic passing through (not starting or ending here) costs this POP's router: less once labels switch it.
const corePass=c=>coreOn()&&S.core.run>=1&&inCore(c)?CORE_PASS[S.core.run]:1;
// Vendors in the core, and whether it runs at the very top of any of its routers: then vendors trip over each other.
function coreVendors(){const v=new Set();for(const c in S.pops)if(inCore(c))v.add(RG[S.pops[c].rgen||0].v);return v;}
function coreEdge(){if(!coreOn()||S.core.run<1)return false;for(const c in S.pops)if(inCore(c)&&RG[S.pops[c].rgen||0].cr===S.core.run)return true;return false;}
// Daily odds of an interop incident: none for one vendor, or below every router's top level.
function coreIopRisk(){if(!coreOn()||S.core.run<1||coreVendors().size<2||!coreEdge())return 0;return CORE_IOP[S.core.run]*(S.core.lab?CORE_LAB_F:1);}
// POPs left out of the core (their router can't run it), for the panel.
const coreOut=()=>coreOn()&&S.core.run>=1?Object.keys(S.pops).filter(c=>!inCore(c)):[];
// Links where the vendors meet: both ends in the core, different vendors.
const coreIopLinks=live=>live.filter(l=>S.pops[l.a]&&S.pops[l.b]&&inCore(l.a)&&inCore(l.b)&&RG[S.pops[l.a].rgen||0].v!==RG[S.pops[l.b].rgen||0].v);
// Vendor names as players see them (Junipurr has no badge, so this is where its name shows).
const RG_V={arrrhipster:'Arrrhipster',brocadabra:'Brocadabra',disco:'Disco',edge:'Edge Lord',extremely:'Extremely Networks',junipurr:'Junipurr',knockia:'Knockia',mikrowtik:'Mikrowtik',rusty:'Rusty',universe:'Universe',whitebox:'Whitebox'};
// One line for a model: its vendor and the highest backbone it runs (SRv6-only boxes say so).
const coreMeta=g=>{const G=RG[g];return tr('core.vendor_v_backbone_up_to_lv',{v:RG_V[G.v],lv:tr(CORE_LV[G.cr])})+(G.noMpls?' · '+tr('core.no_mpls_srv6_only'):'');};
/* ---------- what an upgraded backbone brings (only good things) ----------
   Customers who need it: offers of these appear once the backbone runs their level; a contract already signed keeps
   paying whatever the backbone runs later. Real carriers sell L3VPNs over MPLS, low-latency planes with flex-algo
   over segment routing, and slices over SRv6. */
Object.assign(BIZ_T,{
 l3vpn:{l:tr('core.l3vpn_for_an_enterprise'),opts:[1,2,5,10],rate:0,l2:true,sdwan:true,siteRate:1100,km:0,lv:3,core:1,names:['Branch Office Bonanza','Head Office & Sons','Twelve Tills Retail','Regional Bank of Routes','Chain of Command Pharmacies','Franchise Fiesta']},
 flex:{l:tr('core.flex_algo_low_latency_link'),opts:[5,10,40],rate:0,l2:true,lat:true,km:9,lv:3,core:3,names:['Microsecond Mike Markets','Low-Ping Esports League','Latency Arbitrage Partners','Photon Finish Trading','Lag-Free Ladder Games']},
 slice:{l:tr('core.network_slice'),opts:[100,200,400],rate:0,l2:true,div:true,km:1.2,lv:3,core:4,names:['Fifth Gen Slices Ltd','Pizza-Slice Mobile','Sliced Bread Telecom','GPU Slice & Dice','Thin Crust Wireless']},
});
// The backbone's customer types now on offer (twice each, like the other types' weights).
function coreProducts(mine){if(!coreOn())return [];const run=S.core.run,out=[];
  if(run>=1&&mine.length>=3)out.push('l3vpn','l3vpn');if(run>=3&&mine.length>=2)out.push('flex','flex');if(run>=4&&mine.length>=2)out.push('slice','slice');return out;}
// Fast reroute (RSVP-TE FRR, TI-LFA): backup paths are ready before a cut, so customers barely notice one.
const coreFrr=()=>coreOn()&&S.core.run>=2;
// An interop lab: test the vendors against each other before they meet in production.
const CORE_LAB=150000,CORE_LAB_F=0.4;
const coreLab=()=>!!(S.core&&S.core.lab);
