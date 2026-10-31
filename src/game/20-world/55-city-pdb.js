/* Real-world calibration, pulled 2026-10-25 (Pacific islands 2026-10-26). Per city: [carrier-neutral facilities, network presences across them,
   ASNs registered in its country]. Facilities and presences are PeeringDB facilities within 50 km or in the same city
   (peeringdb.com/api/fac, net_count summed); ASNs per country are from bgp.he.net/report/world.
   Cities PeeringDB barely knows (added 2026-10-28) are marked: est. is an estimate from what is known to be there, with
   the country's ASN count. A city missing here keeps the plain regional price. One entry per line, sorted by id. */
const CITY_PDB={
 abj:[5,11,32],
 acc:[7,78,124],
 add:[2,3,10],
 adl:[6,70,3196], // est.
 aju:[4,3,9693],
 akl:[27,398,755],
 alg:[0,0,16],
 ams:[69,2731,1827],
 anc:[3,12,33300], // est.
 apw:[0,0,11],
 ash:[86,1010,33300],
 asu:[3,8,124],
 ath:[6,108,307],
 atn:[42,589,33300],
 auh:[4,1,231],
 bcn:[13,159,1341],
 bda:[2,8,25], // est.
 bde:[0,0,4027],
 beg:[7,49,227],
 bel:[3,7,9693],
 ber:[22,351,3705],
 bet:[16,174,152],
 bgi:[1,5,20], // est.
 bhz:[13,40,9693],
 bkk:[32,397,675],
 blr:[14,104,6412],
 bne:[21,277,3196],
 bog:[16,195,598],
 bom:[59,1050,6412],
 bos:[31,209,33300],
 bru:[33,328,443],
 brw:[0,0,33300], // est.
 bsb:[14,108,9693],
 bud:[6,146,369],
 bue:[28,372,1357],
 buh:[23,289,1424],
 bvb:[3,6,9693],
 cac:[4,6,9693],
 cai:[5,28,97],
 cal:[15,127,2595],
 cas:[2,2,39],
 cau:[2,2,9693],
 cbo:[1,0,33],
 cbr:[5,60,3196], // est.
 ccs:[6,32,296],
 cgb:[4,5,9693],
 cgr:[4,4,9693],
 chc:[4,30,755], // est.
 chi:[64,809,33300],
 cor:[2,29,1357],
 cph:[30,290,529],
 cpq:[19,65,9693],
 cpt:[6,267,879],
 cpv:[4,12,9693],
 cur:[3,20,25], // est.
 cwb:[11,79,9693],
 cxj:[2,3,9693],
 dac:[30,107,2105],
 dal:[59,969,33300],
 dar:[9,67,124],
 del:[31,479,6412],
 den:[28,310,33300],
 dkr:[2,4,23],
 dks:[0,0,6683], // est.
 dla:[3,14,34],
 doh:[6,29,31],
 drw:[3,15,3196],
 dub:[21,277,350],
 dur:[4,137,879],
 dus:[13,350,3705], // 14 listed, one closed; Digital Realty DUS1-3 alone has 141 networks
 dut:[0,0,33300], // est.
 dxb:[8,135,231],
 dyr:[0,0,6683], // est.
 ebj:[1,5,529], // est.
 edi:[4,46,4027],
 fdf:[1,5,10], // est.
 fec:[5,4,9693],
 fih:[7,19,57],
 fln:[5,23,9693],
 for:[16,362,9693],
 fra:[56,2450,3705],
 fuj:[1,49,231],
 fuk:[5,50,1330], // QTnet QD3 has 14 networks, BBIX Fukuoka is there; the rest est.
 gbe:[1,2,39],
 gdl:[4,22,814],
 gdx:[1,2,6683], // est.
 gua:[5,16,103],
 gum:[6,28,11],
 gyn:[5,28,9693],
 ham:[26,228,3705],
 hav:[0,0,8], // est.: no neutral data center
 hba:[2,10,3196], // est.
 hel:[23,232,427],
 hfx:[3,20,2595], // est.
 hir:[1,0,11],
 hkg:[57,1107,1514],
 hnl:[7,33,33300],
 hou:[21,173,33300],
 hre:[1,0,37],
 hyd:[17,152,6412],
 icn:[37,201,1197],
 igu:[5,26,124],
 ist:[28,334,1290],
 ivc:[1,2,755], // est.
 jam:[0,0,2], // est.
 jed:[5,25,220],
 jib:[3,19,5],
 jkt:[98,3015,4108],
 jnb:[14,561,879],
 jnu:[1,2,33300], // est.
 jpa:[4,18,9693],
 kcy:[22,313,33300],
 kgl:[5,14,34],
 khi:[7,15,488],
 kin:[2,10,30], // est.
 kla:[2,18,71],
 krs:[3,15,448], // est.
 kul:[20,210,434],
 kyv:[33,506,2342],
 lad:[8,27,79],
 lag:[13,279,304],
 lax:[44,939,33300],
 ldb:[3,7,9693],
 lim:[12,156,267],
 lis:[9,129,187],
 ljd:[1,2,9693],
 lon:[100,2588,4027],
 lpb:[1,2,71],
 lun:[4,3,24],
 maa:[20,374,6412],
 mad:[31,578,1341],
 maj:[0,0,12],
 man:[29,353,4027],
 mao:[7,15,9693],
 mba:[4,176,274],
 mcp:[2,0,9693],
 mct:[3,25,45], // Equinix MC1 and WCS; presences est.
 mcz:[1,5,9693],
 mde:[2,18,598],
 mel:[20,395,3196],
 mex:[18,122,814],
 mgf:[4,9,9693],
 mia:[27,553,33300],
 mil:[29,728,1534],
 mle:[1,3,15], // est.
 mmk:[2,4,6683], // est.
 mnl:[17,352,750],
 mos:[49,632,6683],
 mpm:[7,20,36],
 mrs:[8,273,2249],
 mru:[3,20,60], // est.
 mtl:[35,283,2595],
 mty:[5,27,814],
 muc:[22,230,3705],
 mvd:[1,2,53],
 nas:[1,4,20], // est.
 nat:[1,3,9693],
 nbo:[9,283,274],
 nou:[2,2,19],
 nyc:[96,1322,33300],
 ome:[0,0,33300], // est.
 oos:[5,22,443],
 osa:[19,229,1330],
 osl:[20,209,448],
 ott:[6,21,2595],
 pan:[8,26,158],
 par:[77,1528,2249],
 pcn:[0,0,0], // est.: no network of its own
 pdl:[1,3,187], // est.
 pek:[10,15,6717],
 per:[12,248,3196],
 phx:[26,279,33300],
 pkc:[1,2,6683], // est.
 pmo:[3,46,1534],
 pmw:[3,8,9693],
 poa:[22,120,9693],
 pom:[2,0,46],
 pos:[2,10,35], // est.
 ppg:[0,0,2],
 ppt:[0,0,6],
 prg:[24,336,775],
 prr:[0,0,2595], // est.
 pvh:[3,4,9693],
 pvs:[0,0,6683], // est.
 qro:[11,144,814],
 rai:[1,3,8], // est.
 rao:[6,3,9693],
 rbr:[0,0,9693],
 rec:[6,31,9693],
 rek:[15,51,93],
 ria:[2,2,9693],
 rio:[33,577,9693],
 rix:[8,60,330], // 8 listed, Perses 2 has 19 networks; presences est.
 rom:[12,213,1534],
 ror:[0,0,4],
 ruh:[8,29,220],
 run:[3,15,15], // est.
 sao:[70,1875,9693],
 scl:[36,274,450],
 sdq:[4,25,90], // est.
 sea:[37,539,33300],
 sez:[1,4,20], // est.
 sgn:[6,36,1068],
 sha:[11,27,6717],
 sin:[58,1271,782],
 sjc:[57,1048,33300],
 sjo:[8,6,128],
 sjp:[2,4,9693],
 sju:[5,40,60], // est.
 slc:[22,202,33300],
 slz:[1,6,9693],
 sof:[15,451,889],
 ssa:[13,44,9693],
 stg:[18,63,3705],
 sto:[31,539,1011],
 suv:[0,0,23],
 svg:[2,14,448],
 syd:[40,979,3196],
 tbu:[0,0,5],
 tci:[3,30,1341], // est.
 the:[2,1,9693],
 tik:[0,0,6683], // est.
 tll:[7,80,256],
 tnr:[1,4,25], // est.
 tok:[58,917,1330],
 tor:[46,509,2595],
 tpe:[15,274,500],
 tun:[2,0,30],
 uio:[9,16,287],
 uus:[1,3,6683], // est.
 van:[13,214,2595],
 vie:[30,377,860],
 vix:[6,30,9693],
 vvo:[5,25,6683], // est.
 waw:[25,855,2743],
 wdh:[1,2,22],
 zrh:[38,535,1209],
};
