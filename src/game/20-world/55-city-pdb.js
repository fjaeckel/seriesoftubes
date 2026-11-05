/* Real-world calibration, pulled 2026-10-25 (Pacific islands 2026-10-26). Per city: [carrier-neutral facilities, network presences across them,
   ASNs registered in its country]. Facilities and presences are PeeringDB facilities within 50 km or in the same city
   (peeringdb.com/api/fac, net_count summed); ASNs per country are from bgp.he.net/report/world.
   Cities PeeringDB barely knows (added 2026-10-28) are marked: est. is an estimate from what is known to be there, with
   the country's ASN count. A city missing here keeps the plain regional price. One entry per line, sorted by id. */
const CITY_PDB={
 aas:[0,0,2], // est.
 abj:[5,11,32],
 abv:[3,20,274],
 acc:[7,78,124],
 add:[2,3,10],
 adl:[6,70,3196], // est.
 aju:[4,3,9693],
 akl:[27,398,755],
 ala:[1,2,3], // est.
 alb:[3,12,33300], // est.
 alg:[0,0,16],
 amm:[2,5,58],
 ams:[69,2731,1827],
 anc:[3,12,33300], // est.
 anp:[0,0,33300], // est.
 anu:[1,1,20],
 apw:[0,0,11],
 asb:[1,2,9], // est.
 ash:[86,1010,33300],
 ask:[0,0,142], // est.
 asm:[0,0,1], // est.
 asp:[0,0,3196], // est.: no carrier-neutral facility, the incumbent's exchange
 asu:[3,8,124],
 ath:[6,108,307],
 atn:[42,589,33300],
 aug:[0,0,33300], // est.
 auh:[4,1,231],
 aus:[9,55,33300], // est.
 bah:[8,8,28],
 bas:[0,3,9], // est.
 bcn:[13,159,1341],
 bcv:[0,1,38], // est.
 bda:[2,8,25], // est.
 bde:[0,0,4027],
 beg:[7,49,227],
 bel:[3,7,9693],
 ber:[22,351,3705],
 bet:[16,174,152],
 bey:[2,1,191],
 bgf:[0,0,5], // est.
 bgi:[1,5,20], // est.
 bgw:[3,2,222],
 bhz:[13,40,9693],
 bio:[1,8,1341], // pulled 2026-11-01: PeeringDB lists Telxius Derio DC alone (8 networks); ASNs are Spain's
 bis:[0,0,33300], // est.
 bjl:[1,1,12],
 bkk:[32,397,675],
 bko:[2,2,11],
 blr:[14,104,6412],
 bna:[7,35,33300], // est.
 bne:[21,277,3196],
 bog:[16,195,598],
 boi:[3,12,33300], // est.
 bom:[59,1050,6412],
 bos:[31,209,33300],
 brn:[7,29,1209],
 bru:[33,328,443],
 brw:[0,0,33300], // est.
 bsb:[14,108,9693],
 btr:[2,6,33300], // est.
 bts:[4,97,199],
 bud:[6,146,369],
 bue:[28,372,1357],
 buh:[23,289,1424],
 bvb:[3,6,9693],
 bwn:[3,2,11],
 bzv:[1,4,9], // est.
 cac:[4,6,9693],
 cae:[2,5,33300], // est.
 cai:[5,28,97],
 cal:[15,127,2595],
 cas:[2,2,39],
 cau:[2,2,9693],
 cbo:[1,0,33],
 cbr:[5,60,3196], // est.
 ccs:[6,32,296],
 ceb:[4,25,750], // est.
 cgb:[4,5,9693],
 cgr:[4,4,9693],
 chc:[4,30,755], // est.
 chi:[64,809,33300],
 cky:[1,5,20],
 cmh:[9,50,33300], // est.
 con:[0,0,33300], // est.
 cor:[2,29,1357],
 cph:[30,290,529],
 cpq:[19,65,9693],
 cpt:[6,267,879],
 cpv:[4,12,9693],
 crw:[1,3,33300], // est.
 csn:[0,0,33300], // est.
 cur:[3,20,25], // est.
 cwb:[11,79,9693],
 cxj:[2,3,9693],
 cys:[1,2,33300], // est.
 dac:[30,107,2105],
 dal:[59,969,33300],
 dam:[0,0,15], // est.
 dar:[9,67,124],
 del:[31,479,6412],
 den:[28,310,33300],
 dil:[1,0,21], // est.
 dkr:[2,4,23],
 dks:[0,0,6683], // est.
 dla:[3,14,34],
 dod:[1,4,90],
 doh:[6,29,31],
 dom:[0,2,8], // est.
 dov:[0,0,33300], // est.
 drw:[3,15,3196],
 dsm:[3,10,33300], // est.
 dub:[21,277,350],
 dur:[4,137,879],
 dus:[13,350,3705], // 14 listed, one closed; Digital Realty DUS1-3 alone has 141 networks
 dut:[0,0,33300], // est.
 dvo:[2,10,750], // est.
 dxb:[8,135,231],
 dyr:[0,0,6683], // est.
 dyu:[1,3,45],
 ebj:[1,5,529], // est.
 edi:[4,46,4027],
 esb:[8,24,1295],
 evn:[7,6,161],
 fdf:[1,5,10], // est.
 fec:[5,4,9693],
 fft:[0,0,33300], // est.
 fih:[7,19,57],
 fln:[5,23,9693],
 fna:[2,10,22],
 fnj:[0,0,1], // est.
 for:[16,362,9693],
 fra:[56,2450,3705],
 fru:[2,3,78],
 fuj:[1,49,231],
 fuk:[5,50,1330], // QTnet QD3 has 14 networks, BBIX Fukuoka is there; the rest est.
 fun:[1,0,3], // est.
 gbe:[1,2,39],
 gdl:[4,22,814],
 gdx:[1,2,6683], // est.
 geo:[0,2,8], // est.
 gid:[0,0,9], // est.
 gnd:[0,2,11], // est.
 got:[8,45,1011], // est.
 gua:[5,16,103],
 gum:[6,28,11],
 gyd:[7,15,131],
 gyn:[5,28,9693],
 hah:[0,0,4], // est.
 ham:[26,228,3705],
 han:[7,19,1029],
 har:[2,6,33300], // est.
 hav:[0,0,8], // est.: no neutral data center
 hba:[2,10,3196], // est.
 hel:[23,232,427],
 hfd:[3,12,33300], // est.
 hfx:[3,20,2595], // est.
 hir:[1,0,11],
 hkg:[57,1107,1514],
 hln:[0,0,33300], // est.
 hnl:[7,33,33300],
 hou:[21,173,33300],
 hpa:[0,2,1011], // est.
 hre:[1,0,37],
 hyd:[17,152,6412],
 icn:[37,201,1197],
 igu:[5,26,124],
 ind:[8,45,33300], // est.
 inu:[1,0,5], // est.
 isb:[3,4,488],
 ist:[28,334,1290],
 ivc:[1,2,755], // est.
 jam:[0,0,2], // est.
 jan:[1,3,33300], // est.
 jed:[5,25,220],
 jef:[0,0,33300], // est.
 jer:[2,10,454], // est.
 jib:[3,19,5],
 jkt:[98,3015,4108],
 jnb:[14,561,879],
 jnu:[1,2,33300], // est.
 jpa:[4,18,9693],
 jub:[1,0,23],
 kbl:[1,5,84], // est.
 kcy:[22,313,33300],
 kgl:[5,14,34],
 khi:[7,15,488],
 kin:[2,10,30], // est.
 kiv:[5,12,132],
 kla:[2,18,71],
 krs:[3,15,448], // est.
 krt:[2,4,13],
 ktm:[8,4,223],
 kul:[20,210,434],
 kwi:[3,2,91],
 kyv:[33,506,2342],
 lad:[8,27,79],
 lag:[13,279,304],
 lan:[1,3,33300], // est.
 lax:[44,939,33300],
 lbv:[4,11,12],
 ldb:[3,7,9693],
 lfw:[1,4,11],
 lim:[12,156,267],
 lis:[9,129,187],
 lit:[2,6,33300], // est.
 ljd:[1,2,9693],
 lju:[9,34,270],
 llw:[0,5,36], // est.
 lnk:[1,3,33300], // est.
 lon:[100,2588,4027],
 lpb:[1,2,71],
 lun:[4,3,24],
 maa:[20,374,6412],
 mad:[31,578,1341],
 maj:[0,0,12],
 man:[29,353,4027],
 mao:[7,15,9693],
 mba:[4,176,274],
 mco:[1,3,4], // est.
 mcp:[2,0,9693],
 mct:[3,25,45], // Equinix MC1 and WCS; presences est.
 mcz:[1,5,9693],
 mde:[2,18,598],
 mel:[20,395,3196],
 mex:[18,122,814],
 mga:[1,2,35], // est.
 mgf:[4,9,9693],
 mgm:[1,4,33300], // est.
 mgq:[1,0,24],
 mia:[27,553,33300],
 mil:[29,728,1534],
 mla:[3,10,43], // est.
 mle:[1,3,15], // est.
 mmk:[2,4,6683], // est.
 mmx:[4,18,1011], // est.
 mnl:[17,352,750],
 mos:[49,632,6683],
 mpm:[7,20,36],
 mpv:[0,0,33300], // est.
 mrs:[8,273,2249],
 mru:[3,20,60], // est.
 msn:[3,15,33300], // est.
 msq:[2,7,107],
 msu:[0,3,11], // est.
 mtl:[35,283,2595],
 mty:[5,27,814],
 muc:[22,230,3705],
 mvd:[1,2,53],
 nas:[1,4,20], // est.
 nat:[1,3,9693],
 nbo:[9,283,274],
 ndj:[1,1,18],
 nic:[1,3,139],
 nim:[1,3,10], // est.
 nkc:[1,3,10], // est.
 nou:[2,2,19],
 nqz:[2,3,284],
 nsi:[3,6,61],
 nuk:[0,0,2], // est.
 nyc:[96,1322,33300],
 nyt:[0,0,173], // est.
 okc:[4,18,33300], // est.
 olm:[0,0,33300], // est.
 ome:[0,0,33300], // est.
 oos:[5,22,443],
 osa:[19,229,1330],
 osl:[20,209,448],
 ott:[6,21,2595],
 oua:[3,8,33],
 oxb:[1,2,2], // est.
 pan:[8,26,158],
 pap:[0,3,14], // est.
 par:[77,1528,2249],
 pbh:[3,2,43],
 pbm:[2,8,7],
 pcn:[0,0,0], // est.: no network of its own
 pdl:[1,3,187], // est.
 pek:[10,15,6717],
 per:[12,248,3196],
 phe:[1,3,3196], // est.: one carrier-neutral facility
 phx:[26,279,33300],
 pir:[0,0,33300], // est.
 pkc:[1,2,6683], // est.
 pmo:[3,46,1534],
 pmw:[3,8,9693],
 pnh:[9,18,160],
 pni:[1,0,6], // est.
 poa:[22,120,9693],
 pom:[2,0,46],
 pos:[2,10,35], // est.
 ppg:[0,0,2],
 ppt:[0,0,6],
 prg:[24,336,775],
 prr:[0,0,2595], // est.
 pry:[8,102,1600],
 pto:[1,1,20],
 pvd:[3,10,33300], // est.
 pvh:[3,4,9693],
 pvs:[0,0,6683], // est.
 qaq:[0,0,2], // est.
 qmn:[0,0,13], // est.
 qro:[11,144,814],
 rai:[1,3,8], // est.
 rao:[6,3,9693],
 rba:[2,2,98],
 rbr:[0,0,9693],
 rdu:[6,30,33300], // est.
 rec:[6,31,9693],
 rek:[15,51,93],
 ria:[2,2,9693],
 ric:[5,25,33300], // est.
 rio:[33,577,9693],
 rix:[8,60,330], // 8 listed, Perses 2 has 19 networks; presences est.
 rob:[1,2,18],
 rom:[12,213,1534],
 ror:[0,0,4],
 ruh:[8,29,220],
 run:[3,15,15], // est.
 sac:[6,30,33300], // est.
 saf:[0,0,33300], // est.
 sah:[1,0,6],
 sal:[1,2,56], // est.
 sao:[70,1875,9693],
 scl:[36,274,450],
 sdq:[4,25,90], // est.
 sea:[37,539,33300],
 sez:[1,4,20], // est.
 sgn:[6,36,1068],
 sha:[11,27,6717],
 sin:[58,1271,782],
 sis:[0,0,2], // est.
 sjc:[57,1048,33300],
 sjj:[1,2,46],
 sjo:[8,6,128],
 sjp:[2,4,9693],
 sju:[5,40,60], // est.
 skp:[4,8,60],
 slc:[22,202,33300],
 sle:[1,2,33300], // est.
 slu:[0,2,8], // est.
 slz:[1,6,9693],
 smr:[1,3,10], // est.
 sof:[15,451,889],
 spi:[1,2,33300], // est.
 sre:[0,0,71], // est.
 ssa:[13,44,9693],
 ssg:[1,1,7],
 stg:[18,63,3705],
 sto:[31,539,1011],
 stp:[10,90,33300], // est.
 suv:[0,0,23],
 svd:[0,2,6], // est.
 svg:[2,14,448],
 syd:[40,979,3196],
 tas:[7,3,140],
 tbs:[4,15,185],
 tbu:[0,0,5],
 tci:[3,30,1341], // est.
 tgd:[2,4,21], // est.
 tgu:[1,4,126], // est.
 the:[2,1,9693],
 thr:[2,2,950],
 tia:[6,22,124],
 tik:[0,0,6683], // est.
 tip:[0,0,34], // est.
 tlh:[1,3,33300], // est.
 tll:[7,80,256],
 tms:[0,0,2], // est.
 tnr:[1,4,25], // est.
 tok:[58,917,1330],
 top:[1,2,33300], // est.
 tor:[46,509,2595],
 tpe:[15,274,500],
 trw:[1,0,6], // est.
 tsv:[1,2,3196], // est.
 ttn:[1,3,33300], // est.
 tun:[2,0,30],
 uio:[9,16,287],
 uln:[3,20,82], // est.
 uus:[1,3,6683], // est.
 van:[13,214,2595],
 vdz:[4,7,25],
 vie:[30,377,860],
 vix:[6,30,9693],
 vli:[1,2,15],
 vno:[11,52,190],
 vte:[3,1,45],
 vvo:[5,25,6683], // est.
 was:[3,20,33300], // est.
 waw:[25,855,2743],
 wdh:[1,2,22],
 wlg:[13,80,755],
 yeg:[5,15,2595],
 yfb:[0,0,2595], // est.
 yfc:[0,0,2595], // est.
 yqb:[1,6,2595],
 yqr:[2,4,2595],
 ywg:[8,48,2595],
 yxe:[4,18,2595],
 yxy:[0,0,2595], // est.
 yyg:[1,1,2595],
 yyj:[1,1,2595],
 yyt:[0,0,2595], // est.
 yzf:[0,0,2595], // est.
 zag:[6,59,147],
 zrh:[38,535,1209],
};
