/* ================= CONSTANTS ================= */
const W=2000, H=1000, KM=14;
const POP_COST=20000, POP_MO=1500, EYE_RATE=150, CACHE_CAP=100, CACHE_MO=400;
const DAY_MS=2500, ROUTER_COST=15000, ROUTER_MO=1500, GEN_COST=12000, GEN_MO=600, DIVERSE=1.4;
const RU_BOX=40000, RU_BOX_MO=2000;
const UAE_LIC=15000,KSA_LIC=25000;
// Korea: "sender pays" interconnection makes transit into Seoul about four times the usual price.
const KR_TRANSIT=4;
/* Australia: a long way from everywhere. Every gigabit out of the country rides a long, thin subsea
   cable, so transit and waves cost more than almost anywhere else. IX ports are the exception: a
   nonprofit exchange sells 10G for about AUD 350 a month. Retail broadband is dear, but the national
   wholesale network keeps roughly half of every home bill (about AUD 50 a month per home). */
const AU_TRANSIT=3,AU_WAVE={land:1.8,sub:2.6,ew:1.3},AU_IX=0.8,AU_ARPU=1.8,AU_WHOLESALE=0.45;
// Fibre to the Basement: on your own fibre you skip the wholesale cut, but competing networks pay the
// Regional Broadband Scheme levy instead (about $7 a month on a ~$90 bill).
const AU_LEVY=0.08;
/* The Philippines: few, thin routes out and an incumbent that owns most of them. 100 GigE transit in Manila
   costs about 1.9 times Jakarta's (TeleGeography, 2026: $2.25 against $1.21 per Mbps), so the islands pay
   1.9 times the Asian rate. Homes pay about ₱1,450 (US$25) a month, the incumbent's own figure (PLDT, 2025).
   Between the islands capacity is dearer than out of the country: a Manila–Cebu wave costs about what
   Manila–Singapore does, twice Manila–Hong Kong. */
const PH_TRANSIT=4.7,PH_ARPU=0.7,PH_WAVE=3.7;
const SITE2_COST=45000,SITE2_MO=3000,TE_COST=60000,TE_MO=4000;
const SITE2_N=[tr('economy.the_other_building'),tr('economy.campus_b_the_one_with_parking'),tr('economy.across_the_river_dc'),tr('common.the_annex'),tr('economy.suburban_mega_shed'),tr('economy.the_cheaper_one'),tr('economy.formerly_a_shopping_mall'),tr('common.bunker_two')];
// A city's buildings: '#' becomes a site number from 1 to dcN (dc2N for the second building) that stays put for this network.
const siteNo=(name,n)=>name.replace('#',1+((S&&S.asn)|0)%(n||1));
const siteName=(c,s)=>s==='b'?CITY[c].dc2?siteNo(CITY[c].dc2,CITY[c].dc2N):SITE2_N[hstr(c)%SITE2_N.length]:siteNo(CITY[c].dc,CITY[c].dcN);
const BE_TAPE=30000;
const popCost=c=>POP_COST+(c&&CITY[c]&&CITY[c].tape?BE_TAPE:0)+(c&&CITY[c]&&CITY[c].ru?RU_BOX:0)+(c&&CITY[c]&&CITY[c].uae?UAE_LIC:0)+(c&&CITY[c]&&CITY[c].saudi?KSA_LIC:0);
const CN_LIC=150000, CN_JV_MO=6000;
// Scrubbing centers come in tiers by clean bandwidth. Always-on diverts instantly; on-demand is cheaper
// but takes a couple of days to engage. A clean-pipe add-on on a transit scrubs upstream, per port.
const SCRUB_TIERS=[{n:'100G',g:100,cost:60000,mo:5000,lvl:1},{n:'1T',g:1000,cost:180000,mo:15000,lvl:3},{n:'10T',g:10000,cost:500000,mo:40000,lvl:4},{n:'100T',g:100000,cost:1500000,mo:110000,lvl:10}];
const SCRUB_DELAY=2, SLA_PEN=20000;
const scrubMo1=x=>Math.round(SCRUB_TIERS[x.tier||0].mo*(S.scrubMode==='ondemand'?0.6:1)),scrubMo=()=>S.scrubs.reduce((a,x)=>a+scrubMo1(x),0);
const hasScrub=()=>!!(S&&S.scrubs&&S.scrubs.length),SCRUB_FAR_MS=30;
const cleanMo=t=>Math.round(PORT[t.tier].g*(t.n||1)*5);
// DDoS has a shape now: a vector, a size and an entry point. A vector's `fs` is whether Flowspec can drop
// it at the edge — it catches the known volumetric UDP floods, but an application-layer HTTP flood sails
// through. Whether a POP can run Flowspec at all is a router-model property (`fs` on RG): the rules live in
// hardware TCAM, and the budget differs by platform. FS_RES is the junk left after filtering, by capability
// (0 none → no help · 1 basic merchant/whitebox → 40% leaks · 2 full big iron → 15% leaks).
const FS_RES=[1,0.4,0.15];
const DDOS_VEC={
 dns:{n:tr('common.dns_reflection'),fs:true},
 ntp:{n:tr('common.ntp_amplification'),fs:true},
 cldap:{n:tr('common.cldap_flood'),fs:true},
 syn:{n:tr('common.syn_flood'),fs:true},
 http:{n:tr('common.http_flood'),fs:false},
};
const MYIX_COST=80000, MYIX_MO=3000, MYIX_FEE=1500, START_CASH=200000;
// Your own exchange's switching fabric. Bigger fabrics carry more and attract more members.
const MYIX_FAB=[{n:'400G',g:400,cost:0,mo:3000,max:12},{n:'1.6T',g:1600,cost:60000,mo:6000,max:20,lvl:2},{n:'6.4T',g:6400,cost:200000,mo:12000,max:30,lvl:3},{n:'25.6T',g:25600,cost:600000,mo:25000,max:45,lvl:4},{n:'102.4T',g:102400,cost:1800000,mo:60000,max:60,lvl:9}];
const myFab=c=>MYIX_FAB[Math.min(MYIX_FAB.length-1,Math.max(0,(S.myIx[c]&&S.myIx[c].fab)|0))];
const LT=[{n:'10G',g:10,m:1},{n:'100G',g:100,m:2.8},{n:'400G',g:400,m:6},{n:'800G',g:800,m:9},{n:'1.6T',g:1600,m:13},{n:'6.4T',g:6400,m:28,car:1600,note:tr('economy.handed_off_as_4_1_6t')},{n:'12.8T',g:12800,m:45,car:3200,note:tr('economy.handed_off_as_4_3_2t')}];
const PORT=[{n:'10G',g:10,setup:500,tmo:150,ix:400,pni:200},{n:'100G',g:100,setup:1500,tmo:400,ix:1500,pni:350},{n:'400G',g:400,setup:4000,tmo:900,ix:4000,pni:600},{n:'800G',g:800,setup:8000,tmo:1600,ix:7000,pni:1000},{n:'1.6T',g:1600,setup:16000,tmo:2800,ix:12000,pni:1600},{n:'3.2T',g:3200,setup:32000,tmo:5000,ix:20000,pni:2600}];
