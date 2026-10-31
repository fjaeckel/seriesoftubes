/* Router models, by index: saves keep a POP's model as its index, so new models go at the end. bb is the highest
   core each one can run (cr, CORE_LV: 0 plain IGP, 1 LDP, 2 RSVP-TE, 3 SR-MPLS, 4 SRv6) and it runs every one below
   that too, except noMpls (SRv6 natively, no label stack). v is the vendor: mixing vendors is where interop fails. */
const RG=[
 {n:'Rusty Router 9000',cr:0,v:'rusty',pn:'100G',cap:400,cost:0,mo:0,maxLT:1,maxP:1,ports:8,cls:0,lvl:1,boot:6,slowP:10,fs:0,chip:tr('routers.a_mystery_asic'),blurb:tr('routers.bought_used_on_ebuy_the_fans')},
 {n:'Edge Lord 400',cr:0,v:'edge',pn:'400G',cap:3200,cost:30000,mo:1000,maxLT:2,maxP:2,ports:24,cls:1,lvl:2,boot:11,slowP:20,fs:1,chip:tr('common.merchant_silicon'),blurb:tr('routers.sharp_edgy_and_finally_speaks_400g')},
 {n:'Chonk 800',cr:2,v:'junipurr',pn:'800G',cap:12800,cost:90000,mo:3000,maxLT:3,maxP:3,ports:36,cls:2,lvl:3,boot:25,slowP:45,fs:2,chip:'Junipurr PacketOinker™',blurb:tr('routers.an_absolute_unit_with_800g_ports')},
 {n:'Absolute Unit 1.6T',cr:3,v:'junipurr',pn:'1.6T',cap:51200,cost:250000,mo:8000,maxLT:5,maxP:4,ports:40,cls:3,lvl:4,boot:40,slowP:60,fs:2,chip:tr('routers.packetoinker2_two_pigs_one_chassis'),blurb:tr('routers.1_6t_ports_its_own_weather')},
 {n:'Mikrowtik CCR',cr:1,v:'mikrowtik',pn:'100G',cap:300,cost:4000,mo:150,maxLT:1,maxP:1,ports:16,cls:0,lvl:1,boot:2,slowP:5,badge:'M',fs:1,chip:tr('routers.a_few_dozen_arm_cores'),blurb:tr('routers.costs_less_than_lunch_and_has')},
 {n:'Sonic the Whitebox 32',cr:0,v:'whitebox',pn:'400G',cap:3200,cost:14000,mo:400,maxLT:2,maxP:2,ports:32,cls:1,lvl:2,boot:9,slowP:25,flaky:true,badge:'W',fs:1,chip:tr('routers.tomahack_merchant_silicon'),blurb:tr('routers.a_bare_metal_switch_running_open')},
 {n:'Arrrhipster 7280R',cr:3,v:'arrrhipster',pn:'400G',cap:4800,cost:42000,mo:1300,maxLT:2,maxP:2,ports:48,cls:1,lvl:2,boot:3,slowP:2,badge:'A',fs:2,chip:tr('routers.jerry_cho_deep_buffer_silicon'),blurb:tr('routers.fixed_config_deep_buffers_a_well')},
 {n:'Arrrhipster 7800R',cr:3,v:'arrrhipster',pn:'800G',cap:16000,cost:130000,mo:4200,maxLT:3,maxP:3,ports:96,cls:2,lvl:3,boot:7,slowP:4,badge:'A',fs:2,chip:tr('routers.jerry_cho3_deep_buffer_silicon'),blurb:tr('routers.the_modular_one_ninety_six_800g')},
 {n:'Disco 8K',cr:4,v:'disco',pn:'800G',cap:12800,cost:80000,mo:4800,maxLT:3,maxP:3,ports:64,cls:2,lvl:3,boot:20,slowP:35,badge:'D',fs:2,chip:'Silly-con One',blurb:tr('routers.cheap_to_buy_expensive_to_own')},
 {n:'Knockia 7750',cr:4,v:'knockia',pn:'1.6T',cap:40000,cost:200000,mo:7000,maxLT:5,maxP:4,ports:56,cls:3,lvl:4,boot:30,slowP:15,badge:'K',fs:2,chip:tr('routers.fin_p_network_processor'),blurb:tr('routers.finnish_engineering_indestructible')},
 {n:'Sonic the Whitebox 64',cr:4,v:'whitebox',noMpls:true,pn:'1.6T',cap:25600,cost:60000,mo:1500,maxLT:5,maxP:4,ports:64,cls:3,lvl:5,boot:9,slowP:25,flaky:true,badge:'W',fs:1,chip:tr('routers.tomahack_5_merchant_silicon'),blurb:tr('routers.sixty_four_1_6t_ports_on')},
 {n:'Disco 8K Ultra',cr:4,v:'disco',pn:'1.6T',cap:51200,cost:140000,mo:11000,maxLT:5,maxP:4,ports:72,cls:3,lvl:6,boot:22,slowP:35,badge:'D',fs:2,chip:'Silly-con One G3',blurb:tr('routers.cheap_chassis_eternal_subscription')},
 {n:'Absolute Unit 3.2T',cr:4,v:'junipurr',pn:'3.2T',cap:204800,cost:600000,mo:18000,maxLT:6,maxP:5,ports:48,cls:4,lvl:7,boot:50,slowP:60,fs:2,chip:tr('routers.packetoinker3_a_whole_litter'),blurb:tr('routers.3_2t_ports_and_12_8t')},
 {n:'Arrrhipster 7800R5',cr:3,v:'arrrhipster',pn:'3.2T',cap:160000,cost:450000,mo:14000,maxLT:6,maxP:5,ports:144,cls:4,lvl:9,boot:8,slowP:4,badge:'A',fs:2,chip:tr('routers.jerry_cho5_deep_buffer_silicon'),blurb:tr('routers.a_hundred_and_forty_four_3')},
 {n:'Knockia 7950 XRS',cr:4,v:'knockia',pn:'3.2T',cap:180000,cost:520000,mo:15000,maxLT:6,maxP:5,ports:96,cls:4,lvl:10,boot:32,slowP:15,badge:'K',fs:2,chip:tr('routers.fin_p6_network_processor'),blurb:tr('routers.built_like_a_sauna_door_heavy')},
 {n:'Mikrowtik CCR 3.2T',cr:1,v:'mikrowtik',pn:'3.2T',cap:51200,cost:45000,mo:900,maxLT:6,maxP:5,ports:32,cls:4,lvl:11,boot:3,slowP:5,flaky:true,badge:'M',fs:1,chip:tr('routers.several_hundred_arm_cores_and_a'),blurb:tr('routers.a_3_2t_router_for_the')},
 {n:'The Router at the End of the Universe',cr:4,v:'universe',pn:'3.2T',cap:819200,cost:3000000,mo:60000,maxLT:6,maxP:5,ports:256,cls:4,lvl:13,boot:42,slowP:42,badge:'U',fs:2,chip:tr('routers.forty_two_of_them'),blurb:tr('routers.two_hundred_and_fifty_six_3')},
 {n:'Brocadabra MLX-16',cr:2,v:'brocadabra',pn:'400G',cap:4000,cost:26000,mo:900,maxLT:2,maxP:2,ports:32,cls:1,lvl:2,boot:14,slowP:20,flaky:true,badge:'B',fs:1,noPz:true,chip:tr('routers.a_refurbished_network_processor'),blurb:tr('routers.pulls_rsvp_tunnels_out_of_a')},
 {n:'Extremely Networks SLX 9740',cr:2,v:'extremely',pn:'1.6T',cap:36000,cost:170000,mo:5500,maxLT:5,maxP:4,ports:48,cls:3,lvl:4,boot:18,slowP:15,badge:'X',fs:2,noPz:true,chip:tr('routers.tridont_merchant_silicon'),blurb:tr('routers.bought_the_magician_s_hat')}
];
// The biggest model, which is no longer simply the last one.
const RG_TOP=RG.reduce((b,r,i)=>r.cap>RG[b].cap?i:b,0);
/* Some routers take forever to boot. Each POP's chassis has a personality per model: most come
   back in minutes, a few sit through every line card self-test known to the vendor. */
const SLOW_BOOT=[tr('routers.is_oinking_through_the_self_test'),tr('routers.is_running_fsck_on_a_compact'),tr('routers.found_a_newer_firmware_on_the'),tr('routers.is_counting_to_2_million_routes'),tr('routers.is_waiting_for_the_line_cards'),tr('routers.booted_panicked_about_a_missing_fan'),tr('routers.is_synchronising_the_routing_engines')];
function slowBoot(c){const p=S.pops[c];if(!p)return false;const g=p.rgen||0;return hstr(c+'|boot|'+g+'|'+S.asn)%100<RG[g].slowP;}
function bootMin(c){const p=S.pops[c],G=RG[(p&&p.rgen)||0];return slowBoot(c)?G.boot*9+40:G.boot;}
