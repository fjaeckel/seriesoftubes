// dark fiber & optical gear
const DF_SYS={
 lite:{n:'Rainbow-in-a-Box DWDM',max:16,cost:25000,lvl:2,blurb:tr('dark_fiber.fixed_mux_plus_amplifiers_up_to')},
 roadm:{n:'ROADMaster 9000',max:64,cost:60000,lvl:3,blurb:tr('dark_fiber.full_c_band_remotely_reconfigurable')},
 cl:{n:'ROADMaster 9000 C+L',max:128,cost:140000,lvl:6,blurb:tr('dark_fiber.lights_the_l_band_as_well')},
};
const AMP_EVERY=100, AMP_COST=8000, AMP_MO=300;
/* Your own trench holds more than one fiber pair (#35). Once a ROADMaster is full you can light the next pair:
   another ROADMaster and another chain of amplifiers, 64 more channels. Regen huts are shared. */
const isRdm=y=>y==='roadm'||y==='cl';
const PAIRS_MAX=4,PAIRS_BIG=8,PAIRS_LV=12,SUB_PAIRS_MAX=8,SUB_PAIR_UP=1500000,pairsMax=l=>l.seat?Math.max(1,l.pairs|0):l.sub?SUB_PAIRS_MAX:lvl()>=PAIRS_LV?PAIRS_BIG:PAIRS_MAX,chMax=l=>DF_SYS[l.sys].max*(isRdm(l.sys)&&l.own?Math.max(1,l.pairs|0):1),
  pairCost=l=>DF_SYS[isRdm(l.sys)?l.sys:'roadm'].cost+(l.sub?SUB_PAIR_UP:ampCount(l.km)*AMP_COST);
const OPT={
 zr4:{n:'Ackackia 400ZR+',g:400,cost:12000,reach:1500,modes:[[400,1500],[200,3000]],rg:1,lvl:2,sys:'lite',blurb:tr('dark_fiber.coherent_pluggable_in_the_router_no')},
 zr8:{n:'Sizzle 800ZR+',g:800,cost:22000,reach:900,modes:[[800,900],[400,1800],[200,3600]],rg:2,lvl:3,sys:'lite',blurb:tr('dark_fiber.twice_the_speed_shorter_reach')},
 tp16:{n:'Sienna WaveMagic 1.6T',g:1600,cost:70000,reach:4000,modes:[[1600,4000],[1200,5500],[800,7000],[400,12000]],rg:2,lvl:4,sys:'roadm',blurb:tr('dark_fiber.big_shelf_big_reach_big_invoice')},
 tp32:{n:'Sienna WaveMagic 3.2T',g:3200,cost:130000,reach:1500,modes:[[3200,1500],[1600,4000],[1200,5500],[800,7000],[400,12000]],rg:4,lvl:8,sys:'roadm',blurb:tr('dark_fiber.twice_the_wavemagic_full_speed_only')},
};
const dfLeaseMo=km=>Math.round(400+km*1.0);
const dfBuildCost=km=>Math.round((25000+km*120)*hwMul('build'));
const dfBuildDays=km=>leadDays(Math.round(120+km*0.25)),IRU_DAYS=30;
const ampCount=km=>Math.max(0,Math.floor(km/AMP_EVERY));
const fmtCap=g=>g>=1000?(+(g/1000).toFixed(1))+'T':g+'G';
const WAVECO=['Zay-No Fiber','Loomin’ Technologies','Clown Castle Fiber','Bolt Technology','youNetworks','G&T (Gin and Transit)'];
const MONTHS=[tr('common.jan'),tr('common.feb'),tr('common.mar'),tr('common.apr'),tr('common.may'),tr('common.jun'),tr('common.jul'),tr('common.aug'),tr('common.sep'),tr('common.oct'),tr('common.nov'),tr('common.dec')];
const REG={AM:tr('common.americas'),SA:tr('common.south_america'),EU:tr('common.europe'),AF:tr('common.africa'),AS:tr('common.asia'),OC:tr('common.oceania')};
const waveMo=(km,sub,tier)=>Math.round((300+km*1.2)*LT[tier].m*(sub?1.8:1));
const FABS=[
 {id:'mgp',name:'Megapork',col:'#FF5A1F',cities:['mel','bne','per','adl','icn','sea','sjc','dal','chi','ash','nyc','mia','lon','ams','fra','par','mrs','sto','mad','sin','hkg','tok','syd','jnb'],blurb:tr('dark_fiber.elastic_interconnection_now_with')},
 {id:'pkf',name:'PocketFabric',col:'#00A896',cities:['sea','sjc','dal','chi','ash','nyc','mia','sao','lon','ams','fra'],blurb:tr('dark_fiber.a_whole_network_fabric_that_fits')},
 {id:'ccn',name:'Consolation Connect',col:'#8E44AD',cities:['icn','lon','fra','ams','mrs','bom','sin','hkg','tok','syd','lag','jnb'],blurb:tr('dark_fiber.strong_in_asia_and_africa_every')},
];
const FAB=Object.fromEntries(FABS.map(f=>[f.id,f]));
const NNI=[{n:'10G',g:10,mo:500},{n:'100G',g:100,mo:1200}];
const VXC=[{n:'10G',g:10,m:1},{n:'50G',g:50,m:2.4},{n:'100G',g:100,m:3.6}];
const vxcMo=(km,sub,t)=>Math.round((150+km*0.12)*VXC[t].m*(sub?2:1));
const MET={prefer:{l:tr('common.prefer'),f:0.5},normal:{l:tr('common.normal'),f:1},avoid:{l:tr('common.avoid'),f:4},backup:{l:tr('common.backup_only'),f:60}};
// Custom metrics: a multiplier on the distance cost (f) or an absolute IGP cost (w), capped like an OSPF metric.
const MET_LIM={f:[0.1,100],w:[1,65535]};
const clampM=(k,v)=>{const [lo,hi]=MET_LIM[k];v=Math.min(hi,Math.max(lo,v));return k==='w'?Math.round(v):Math.round(v*100)/100;};
const PREF={high:tr('common.prefer'),normal:tr('common.normal'),low:tr('common.backup_only')};
const edgeKey=l=>l.a<l.b?l.a+'|'+l.b:l.b+'|'+l.a;
// The routing metric of a city pair (edgeKey), set for every link between the two cities.
// A custom metric is stored as {k:'f'|'w',v}: a multiplier, or an exact cost whatever the distance.
function pairMet(k){const m=S.pairMet&&S.pairMet[k];return m?(typeof m==='object'?'custom':m):'normal';}
function pairCm(k){const m=S.pairMet&&S.pairMet[k];return m&&typeof m==='object'?m:null;}
// The cost of one link of km on the pair k, as Dijkstra sees it.
function pairW(k,km){const m=S.pairMet&&S.pairMet[k];return m&&typeof m==='object'?(m.k==='w'?m.v:(km+60)*m.v):(km+60)*MET[m||'normal'].f;}
