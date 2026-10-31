/* ================= BUSINESSES ================= */
const BIZ_T={
 dia:{l:tr('common.enterprise_dia'),opts:[1,2,5,10],rate:600},
 game:{l:tr('common.game_servers'),gaming:true,opts:[5,10,20,40],rate:120},
 host:{l:tr('common.hosting'),opts:[10,20,40,80],rate:60},
 isp:{l:tr('businesses.downstream_isp_buys_transit'),opts:[100,200,400,800],rate:15,lv:2},
 l2vpn:{l:tr('common.l2vpn_circuit'),opts:[1,10,40,100],rate:0,l2:true,km:1,lv:1},
 fabip:{l:tr('businesses.customer_on_a_fabric_transit_over'),opts:[1,5,10,25],rate:110,nni:true,lv:2},
 fabl2:{l:tr('businesses.fabric_circuit_to_one_of_your'),opts:[1,5,10],rate:0,l2:true,nni:true,km:0.8,lv:2},
 stream:{l:tr('common.streaming_startup'),opts:[50,100,200],rate:80,lv:2},
 edu:{l:tr('common.university_network'),opts:[20,50,100],rate:90,lv:2},
 gpu:{l:tr('businesses.ai_gpu_data_center'),opts:[200,400,800],rate:70,lv:3,names:['Neural Noodles AI','GPUs R Us','Hallucination Labs','Transformers & Sons','Token Burners Inc.','Very Large Language Co.','Prompt Engineering Ltd','DeepThought Farms','Parameter Pastures','Gradient Descent Diner','Attention Is All We Need LLC','Overfit Analytics']},
 onramp:{l:tr('businesses.cloud_on_ramp'),opts:[100,200,400],rate:0,l2:true,km:0.7,lv:3,names:["Amazin' Web Services on-ramp","Microsnoft Azzure on-ramp",'Goggle Cloud on-ramp','AliBubble Cloud on-ramp','Miracle Cloud on-ramp']},
 ai:{l:tr('businesses.ai_training_interconnect'),opts:[400,800,1600],rate:0,l2:true,div:true,km:0.9,lv:4,names:['Skynot Compute','Galaxy Brain Training Run','Megawatt Minds','The Big Model Co.','Infinite Context Corp','Sentient Spreadsheet Inc.']},
 hyper:{l:tr('common.hyperscaler_dci'),opts:[1600,3200,6400],rate:0,l2:true,div:true,km:0.5,lv:4,names:["Amazin' Web Services DCI","Microsnoft Azzure DCI",'Goggle Cloud DCI','Faceplant Infra DCI','AliBubble Cloud DCI']},
 hft:{l:tr('businesses.high_frequency_trading_link'),opts:[1,5,10],rate:0,l2:true,lat:true,km:6,lv:2,names:['Flash Boys Capital','Nanosecond Nancy Trading','Speed of Light Securities','Arbitrage & Sons','Front-Run Fund','Microwave Tower Capital','Tick-Tock Quant','Low Latency Larry LLC']},
 bulk:{l:tr('businesses.bulk_backup_transfer_latency_does'),opts:[100,200,400],rate:0,l2:true,scenic:true,km:0.1,lv:2,names:['Glacier Slow Storage','Tape Backup Tortoise','Scenic Route Archives','Cold Storage Cold Cuts','Sloth Sync','Eventually Consistent Inc.','Snail Mail Data Co.']},
 event:{l:tr('common.event_network'),opts:[100,200,400,800,1600,3200],rate:0,event:true,lv:2,names:['Carnaval Parade','Diwali Streaming Night','The Big Football Final','NANOG 99','Burning Router Festival','Euro-Pop Song Contest','Formula Ping Grand Prix','The Big Game','Olympic Pings','A Pop Megastar Stadium Tour','LAN Party of the Century','The Keynote (One More Thing)','Gamer-Con Expo','Oktoberfest Livestream']},
 sdwan:{l:tr('businesses.sd_wan_for_a_chain'),opts:[1,2,5,10],rate:0,l2:true,sdwan:true,km:0,lv:2,names:['Kebab Kingdom','Pretzel Palace','Burger Router Inc.','Café Latte-ncy','Hardware Hut Stores','Pharma-See Pharmacies','Bank of Tiny Branches','Supermarket Superhighway','Fitness Pings Gyms','Hotel Hops Group','Doughnut Data Diners']},
 wwave:{l:tr('common.wholesale_wave'),opts:[1],rate:0,fiber:true,lv:2,names:['Zay-No Fiber','Loomin’ Technologies','Clown Castle Fiber','G&T (Gin and Transit)','A Hyperscaler Who Shall Not Be Named','Megapork','youNetworks']},
 dfpair:{l:tr('businesses.dark_fiber_pair_lease'),opts:[1],rate:0,fiber:true,lv:3,names:['A Hyperscaler Who Shall Not Be Named','Goggle Fiber Division','Faceplant Infra','Amazin’ Backbone Team','A Very Secretive Trading Firm']},
 scrub:{l:tr('businesses.ddos_protection_dia'),opts:[1,5,10,20],rate:900},
 aiwan:{l:tr('businesses.ai_wan_between_two_ai_factories'),opts:[3200,6400,12800],rate:0,l2:true,div:true,mega:true,km:0.45,lv:4,names:['Fairweather AI WAN','Planet-Scale Superfactory Link','Two Brains One Model Inc.','Distributed Godlike Compute','The Gigawatt Handshake']},
 mtrain:{l:tr('businesses.multi_site_training_run'),opts:[1600,3200,6400],rate:0,l2:true,sdwan:true,mega:true,lv:4,names:['Gem-in-Eye Ultra Training Run','Frontier Model 9000','The Very Big Model','Checkpoint-Free Training Co.','Model Too Big For One Building']},
 ingest:{l:tr('businesses.dataset_ingest_elephant_flow'),opts:[1600,3200,6400],rate:0,event:true,mega:true,lv:3,names:['Scrape-the-Whole-Web Ingest','Checkpoint Sync Storm','Video Dataset Firehose','Every Book Ever (allegedly licensed)','Synthetic Data Tsunami']},
 pairs:{l:tr('businesses.hundreds_of_fiber_pairs'),opts:[1],rate:0,fiber:true,mega:true,lv:4,names:['A Hyperscaler Who Shall Not Be Named','Planet-Scale AI WAN Team','The Fiber-Hungry Giant','Project Very Long Glass']},
 esport:{l:tr('businesses.esports_world_final'),opts:[400,800,1600,3200],rate:0,event:true,lv:5,names:['League of Lag Finals','Counter-Ping Major','Fortnightly World Cup','Dota Two Many Viewers','Rocket Leak Championship','Street Frighter Evo']},
 sov:{l:tr('businesses.sovereign_cloud_region'),opts:[400,800,1600],rate:0,l2:true,div:true,km:0.6,lv:6,names:['Gaia-Ex Sovereign Cloud','Bundeswolke (Very Secure)','Le Cloud Souverain','Datenschutz Deluxe','Your Data Stays Here, Probably','A Cloud With a Flag on It','Data Residency Is a State of Mind']},
 cgame:{l:tr('businesses.cloud_gaming_platform'),gaming:true,opts:[800,1600,3200],rate:45,lv:8,names:['Stadia-ium (Back Again)','GeForce Later','Ping Station Now','Luna-tick Gaming','Shadow of a Doubt Cloud PC','Input Lag Arcade','Bufferbloat Bros. Streaming']},
 metav:{l:tr('common.metaverse_platform'),opts:[1600,3200,6400],rate:35,lv:9,names:['Meh-taverse','Second Second Life','Horizon Worlds Apart','The Oasis (Ready Player Done)','Legs Finally Shipped Inc.','Decentra-landlocked']},
 agi:{l:tr('businesses.agi_lab_allegedly'),opts:[12800,25600],rate:0,l2:true,div:true,mega:true,km:0.4,lv:11,names:['Almost General Intelligence Inc.','Superintelligence Pending','The Lab That Said Two More Years','Paperclip Maximizer Labs','Deep Thought Two','Benevolent Overlord Research']},
 mars:{l:tr('businesses.mars_mission_ground_station'),opts:[100,200,400],rate:0,l2:true,lat:true,km:4,lv:13,names:['Red Planet Relay','Ares Ground Segment','Olympus Mons Uplink','Mars or Bust Mission Control','Interplanetary Ping Society','Light-Minute Logistics','RFC 1149 Avian Carriers (Mars Division)']},
 provedor:{l:tr('businesses.provedor_small_regional_isp'),opts:[5,10,20,40],rate:20,br:true,names:['Provedor Capivara Net','Fibra do Sertão','Rapidinho Telecom','Net Jabuticaba','Caipirinha Online','Wi-Fi do Zé','Pão de Queijo Fibra','Açaí Net','Tucano Telecom','Forró Fibra','Saci Net','Brigadeiro Banda Larga','Mandioca Online','Churrasco Connect']},
};
const LEVELS=[
 {n:tr('common.local_isp'),q:tr('businesses.your_network_diagram_is_a_photo'),req:tr('common.start_here'),unlock:tr('businesses.enterprises_game_servers_hosting')},
 {n:tr('common.regional_player'),q:tr('businesses.you_now_have_a_change_freeze'),req:tr('businesses.peak_200_gbps_and_3_pops'),unlock:tr('businesses.downstream_isps_streaming_startups')},
 {n:tr('common.serious_backbone'),q:tr('businesses.it_s_not_dns_there_s'),req:tr('businesses.peak_1_tbps_and_6_pops'),unlock:tr('businesses.ai_gpu_data_centers_and_cloud')},
 {n:tr('common.big_league'),q:tr('businesses.your_mtu_is_9000_on_every'),req:tr('businesses.peak_3_tbps_10_pops_3'),unlock:tr('businesses.ai_training_interconnects_and')},
 {n:tr('common.continental_carrier'),q:tr('businesses.your_noc_has_a_chat_channel'),req:tr('businesses.peak_6_tbps_15_pops_4'),era:1.15,unlock:tr('businesses.esports_world_finals_and_the_4k')},
 {n:tr('common.transcontinental'),q:tr('businesses.you_joined_the_outages_mailing_list'),req:tr('businesses.peak_9_tbps_and_20_pops'),unlock:tr('businesses.sovereign_cloud_regions_and_a_free')},
 {n:tr('common.global_backbone'),q:tr('businesses.your_asn_now_shows_up_in'),req:tr('businesses.peak_12_tbps_25_pops_5'),unlock:tr('businesses.a_free_pni_with_voda_phony')},
 {n:tr('common.packet_empire'),q:tr('businesses.your_maintenance_window_is_2_a'),req:tr('businesses.peak_16_tbps_and_32_pops'),era:1.15,unlock:tr('businesses.cloud_gaming_platforms_and_the_cloud')},
 {n:tr('businesses.six_continent_carrier'),q:tr('businesses.somewhere_on_every_continent_a'),req:tr('businesses.peak_21_tbps_40_pops_6'),unlock:tr('businesses.metaverse_platforms_it_finally_took')},
 {n:tr('businesses.backbone_of_backbones'),q:tr('businesses.your_routing_table_needs_its_own'),req:tr('businesses.peak_26_tbps_and_50_pops'),era:1.2,unlock:tr('businesses.the_vr_era_eyeballs_want_20')},
 {n:tr('businesses.internet_weather_system'),q:tr('businesses.when_your_bgp_sneezes_a_small'),req:tr('businesses.peak_33_tbps_and_60_pops'),unlock:tr('businesses.agi_labs_allegedly_wanting_ai_wans')},
 {n:tr('businesses.too_big_to_route'),q:tr('businesses.your_last_fat_fingered_route_leak'),req:tr('businesses.peak_40_tbps_and_70_pops'),era:1.25,unlock:tr('businesses.the_ai_agent_era_eyeballs_want')},
 {n:tr('common.the_internet'),q:tr('businesses.people_phone_you_to_ask_if'),req:tr('businesses.peak_50_tbps_and_80_pops'),unlock:tr('businesses.mars_mission_ground_stations_gear')},
];
// What each level asks for (peak Gbps, POPs, continents). Continents carry over to the levels above.
const LV_REQ=[null,{pk:200,pops:3},{pk:1000,pops:6},{pk:3000,pops:10,reg:3},{pk:6000,pops:15,reg:4},{pk:9000,pops:20},{pk:12000,pops:25,reg:5},{pk:16000,pops:32},{pk:21000,pops:40,reg:6},{pk:26000,pops:50},{pk:33000,pops:60},{pk:40000,pops:70},{pk:50000,pops:80}];
const lvReg=i=>Math.max(0,...LV_REQ.slice(1,i+1).map(q=>q.reg||0));
// Open gates (sandbox, puzzles): every level's unlocks are there from the start.
const lvl=()=>S&&S.rules&&S.rules.gates==='open'?LEVELS.length:(S&&S.lvl)||1;
// Lower-case just the first word for mid-sentence use, so names like Tel-Mess or AGI keep their capitals.
const lc1=t=>/^[A-Z][a-z]/.test(t)?t[0].toLowerCase()+t.slice(1):t;
function custLevel(){const pops=Object.keys(S.pops).length,pk=S.stats.peak,rc=regionsCount();let lv=1;for(let i=1;i<LV_REQ.length;i++){const q=LV_REQ[i];if(pk>=q.pk&&pops>=q.pops&&rc>=lvReg(i))lv=i+1;else break;}return lv;}
// Traffic eras: some levels bring a new reason to watch more video, and every city's eyeballs grow toward more.
const eraMul=()=>LEVELS.slice(0,lvl()).reduce((a,L)=>a*(L.era||1),1);
const eyeP=c=>CITY[c].P*eraMul();
// New broadband starts small, but never above what the town can grow to (St Helena has 4,500 people).
const bbStart=c=>Math.min(eyeP(c),Math.max(8,CITY[c].P*0.03));
const BIZ_N=['Byte-Size Bakery','Hamster Wheel Power Co.','Llama Logistics','Cloud Nine Hosting','Rural Rabbit Broadband','Tiny Telco','Pixel Pirates Games','Moo-Moo Dairy Corp','Snack Overflow','Git Happens Ltd','Kernel Sanders Fried Code','Lag-Free Llamas','404 Bistro','Ping Pong Sports','Null Pointer Pets','Buffer Bloat Boats','Packet Pizza','Latency Lattes','Ctrl-Alt-Deli','Sudo Sandwiches','Cache Me Outside','Hertz So Good Radio','Jitterbug Dance Hall','Bit Barn Hosting','Fiber Optimists','The Daily Ping','Squirrel Mesh Wireless','Spam & Eggs Diner','Router Rooter Plumbing','Kilobyte Kebab','Gigglebit Studios','Uptime Funk Records','Ohm Sweet Ohm','Dial-Up Nostalgia Club','Two-Factor Tacos'];

