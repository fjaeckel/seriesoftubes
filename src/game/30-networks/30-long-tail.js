/* The long tail: odd little networks with a sliver of traffic each, on one or two exchanges. */
const TAIL=[
 ['Grandma’s Basement Hosting','cdn',['fra'],tr('long_tail.three_servers_one_dehumidifier_and_a')],
 ['Hamster Wheel Networks','eye',['ams'],tr('long_tail.powered_by_renewable_rodents_uptime')],
 ['Fjordnet Kooperativ','eye',['osl'],tr('long_tail.a_fiber_co_op_for_one')],
 ['Kebab-Link','eye',['ber','fra'],tr('long_tail.an_isp_run_from_the_back')],
 ['Mesh Collective e.V.','eye',['ber','fra'],tr('long_tail.volunteers_with_rooftop_antennas_and')],
 ['Village Fibre Co-op','eye',['lon'],tr('long_tail.dug_the_trench_themselves_one_field')],
 ['Tiny Swiss Bank Shield','cdn',['zrh'],tr('long_tail.hosts_exactly_one_website_and_three')],
 ['Clockwork ISP','eye',['zrh'],tr('long_tail.packets_leave_on_time_to_the')],
 ['LAN-Party Federation','cdn',['ams','fra'],tr('long_tail.game_servers_energy_drinks_and_a')],
 ['Former Church Datacenter','cdn',['ams'],tr('long_tail.racks_in_the_nave_cooling_in')],
 ['WISP on a Silo','eye',['dal','chi'],tr('long_tail.wireless_internet_from_the_top_of')],
 ['Cornfield Broadband','eye',['chi'],tr('long_tail.rural_fiber_that_follows_the_tractor')],
 ['Moose Lake Telephone Co-op','eye',['tor','mtl'],tr('long_tail.has_served_the_lake_since_1912')],
 ['Surf Shop Networks','cdn',['lax'],tr('long_tail.hosting_for_surfboard_shops_closed')],
 ['Ski Lift Fiber','eye',['den','zrh'],tr('long_tail.fiber_strung_along_the_chairlifts')],
 ['Tumbleweed Telecom','eye',['phx','dal'],tr('long_tail.covers_a_lot_of_empty_ground')],
 ['Crypto Bro Colo','cdn',['ash','mia'],tr('long_tail.ten_thousand_gpus_and_a_podcast')],
 ['Ye Olde University Network','eye',['bos','lon'],tr('long_tail.has_had_a_8_since_before')],
 ['Mom & Pop Packet Shop','eye',['nyc'],tr('long_tail.family_run_since_dial_up_still')],
 ['Space Cowboy Broadband','eye',['hou','dal'],tr('long_tail.yee_haw_and_low_earth_orbit')],
 ['Fry Sauce Fibre','eye',['slc'],tr('long_tail.utah_s_dipping_sauce_of_an')],
 ['Sauna Uplink Oy','cdn',['hel','sto'],tr('long_tail.servers_cooled_by_the_lake_then')],
 ['Reindeer Relay','eye',['sto','osl','hel'],tr('long_tail.wireless_links_across_the_tundra')],
 ['Pierogi Hosting','cdn',['waw'],tr('long_tail.cheap_filling_hosting_ask_for_the')],
 ['Sunflower Uplink','eye',['kyv','waw'],tr('long_tail.kept_the_lights_on_in_its')],
 ['Tram Line Telecom','eye',['prg','vie'],tr('long_tail.fiber_laid_under_the_tram_tracks')],
 ['Paprika Peering','eye',['bud'],tr('long_tail.spicy_pricing_mild_latency')],
 ['Dracula Datacenter','cdn',['buh'],tr('long_tail.only_comes_online_at_night')],
 ['Bosphorus Ferry Net','eye',['ist'],tr('long_tail.wi_fi_on_every_ferry_backhaul')],
 ['Gondola Gigabit','eye',['mil','rom'],tr('long_tail.started_in_venice_upgraded_to_land')],
 ['Nonna’s Pasta Pipes','cdn',['rom','pmo'],tr('long_tail.hosting_for_every_family_restaurant')],
 ['Tram 28 Telecom','eye',['lis'],tr('long_tail.slow_on_the_hills_fast_on')],
 ['Olive Grove Online','eye',['ath'],tr('long_tail.rural_broadband_for_the_islands_one')],
 ['Siesta Server Hotel','cdn',['mad'],tr('long_tail.down_from_2_to_5_p')],
 ['Bouillabaisse Bits','cdn',['mrs','par'],tr('long_tail.a_rich_mix_of_everything_the')],
 ['Baguette Bandwidth Associés','eye',['par'],tr('long_tail.delivered_fresh_every_morning')],
 ['Pub Quiz Internet','eye',['dub','lon'],tr('long_tail.founded_after_a_pub_quiz_by')],
 ['Gaming Café Net','eye',['lag'],tr('long_tail.internet_cafe_turned_isp_the_gamers')],
 ['Matatu Mobile Mesh','eye',['nbo'],tr('long_tail.wi_fi_on_minibuses_and_the')],
 ['Load-Shedding Survivors','eye',['jnb','cpt'],tr('long_tail.has_more_batteries_than_customers')],
 ['Bollywood Buffer','cdn',['bom','del'],tr('long_tail.three_hour_films_zero_second_start')],
 ['Hawker Centre Hosting','cdn',['sin','kul'],tr('long_tail.cheap_fast_and_open_late')],
 ['Karaoke Box Networks','cdn',['tok','osa','icn'],tr('long_tail.lyrics_servers_low_latency_high')],
 ['Night Market Net','eye',['tpe','hkg'],tr('long_tail.comes_alive_after_dark')],
 ['Kangaroo Courier','eye',['syd','mel','bne'],tr('long_tail.packets_hop_sometimes_backwards')],
 ['Hobbit Hole Hosting','cdn',['akl'],tr('long_tail.cosy_racks_under_a_hill_second')],
 ['Capybara Connect','eye',['sao','poa','bue'],tr('long_tail.gets_along_with_every_other_network')],
 ['Llama Link','eye',['lim','scl','bog'],tr('long_tail.mountain_wireless_will_spit_at_bad')],
 ['Supercar Hosting','cdn',['dxb'],tr('long_tail.gold_plated_servers_valet_parking')],
 ['Tango Transit Co-op','eye',['bue','cor'],tr('long_tail.it_takes_two_to_peer')],
 ['Bánh Mì Broadband','eye',['sgn'],tr('long_tail.crispy_on_the_outside_cheap_on')],
 ['Jeepney Jumpnet','eye',['mnl'],tr('long_tail.colourful_crowded_and_gets_you_there')],
 ['Game Server Gremlins','cdn',['fra','ams','lon','nyc','sjc'],tr('long_tail.hosts_every_game_you_play_at'),0.003],
 ['Discord-ant Voice Relay','cdn',['ams','fra','ash'],tr('long_tail.voice_chat_for_millions_of_gamers'),0.003],
 ['Mastodon Instance Herd','cdn',['ber','ams','par'],tr('long_tail.a_thousand_tiny_social_networks_on')],
 ['Dutch Bike Fibre','eye',['ams'],tr('long_tail.fiber_laid_along_the_bike_lanes')],
 ['Chip Fab Cleanroom Net','cdn',['tpe','phx'],tr('long_tail.bunny_suits_mandatory_in_the_server')],
 ['Volunteer Fire Brigade Wi-Fi','eye',['vie','zrh'],tr('long_tail.runs_the_village_network_between')],
 ['Peach State Hosting','cdn',['atn'],tr('long_tail.sweet_fuzzy_and_surprisingly')],
 ['Chowder Hosting','cdn',['bos'],tr('long_tail.thick_comforting_and_very_new')],
];
/* Who the long tail buys transit from (#85): small networks almost always buy it from a big carrier where they sit,
   usually the cheapest Tier 1 in town or two of them. One or two of the founding five Tier 1s with a PoP in their home
   cities, picked by name so it never changes; where none sits (Auckland), a carrier there that buys from them. */
const TAIL_UP=['cog','lvl','tly','ntt','tat','drz'];
function tailUp(name,home){const h=hstr(name+'|up'),t1=TAIL_UP.filter(id=>{const n=NETS.find(x=>x.id===id);return home.some(c=>n.pops.includes(c));});
  if(!t1.length)return NETS.filter(n=>n.price&&n.up&&n.up.some(u=>TAIL_UP.includes(u))&&home.some(c=>n.pops.includes(c))).map(n=>n.id).slice(0,1);
  const a=t1[h%t1.length],b=t1[(h>>>8)%t1.length];return t1.length>1&&(h>>>16)%100<50&&b!==a?[a,b]:[a];}
function ixStatic(c){const o=[];if(CITY[c]&&CITY[c].ix)o.push(c);for(const x of XIX)if(x.c===c)o.push(x.id);return o;}
TAIL.forEach(([name,type,home,blurb,sh],i)=>{const h=hstr(name),cand=home.flatMap(ixStatic),ix=[];
  if(cand.length){ix.push(cand[h%cand.length]);if(cand.length>1&&(h>>>8)%100<40){const o=cand[(h>>>12)%cand.length];if(!ix.includes(o))ix.push(o);}}
  const sel=(h>>>4)%10>=8;
  NETS.push({id:'tail'+i,name,asn:200000+(h%190000),type,tail:true,up:tailUp(name,home),pol:sel?'selective':'open',...(sel?{minIx:1+(h>>>16)%3,minPni:6+(h>>>18)%8}:{}),share:sh||+(0.0006+((h>>>20)%15)*0.0001).toFixed(4),col:`hsl(${h%360} 55% 46%)`,pops:home.slice(),ix,blurb});});
NETS.push(
 {id:'ktt',name:'Kay-Tea',asn:4766,type:'t2',price:9,cc:'KR',pol:'paid',paidFee:5000,perG:90,kr:true,up:['lvl','tly','cog','drz','vzn','ctc'],homeOnly:true,share:0.012,col:'#E4002B',pops:['hkg','icn','lax','pdx','pus','sea','sin','sjc','tok'],ix:['hkg','pdx','sea','sin','sjc','tok'],blurb:tr('long_tail.korea_s_incumbent_sender_pays_every')},
 {id:'skb',name:'SK Broadbandit',asn:9318,type:'eye',cc:'KR',pol:'paid',paidFee:4000,perG:110,kr:true,up:['tly','ntt','drz','pcw','glc','vzn','ctc'],share:0.01,col:'#EA002C',pops:['fra','hkg','icn','lax','osa','pus','sea','sin','sjc','tok'],ix:['fra','hkg','osa','sea','sin','tok'],blurb:tr('long_tail.took_a_streaming_giant_to_court')},
 {id:'lgu',name:'LG You-Pay-Plus',asn:3786,type:'eye',cc:'KR',pol:'paid',paidFee:3000,perG:80,kr:true,up:['lvl','tly','cog','ntt','tat','pcw','glc','tsi','gtt','drz'],share:0.008,col:'#E6007E',pops:['fra','hkg','icn','lax','mrs','osa','pus','sea','sjc','tok'],ix:['fra','hkg','icn','lax','mrs','osa','sea','sjc','tok'],blurb:tr('long_tail.the_plus_is_a_usage_fee')});
NETS.push(
 {id:'btt',name:'Bee-Tee',asn:2856,type:'t2',price:7,cc:'GB',pol:'selective',minIx:10,minPni:30,up:['lvl','tly','ntt','tsi','edg'],homeOnly:true,share:0.012,col:'#5514B4',pops:['bde','edi','gla','lba','lon','man'],ix:['lon','man'],blurb:tr('long_tail.the_uk_s_incumbent_buzzes_politely')},
 {id:'sky',name:'Sky-High Broadband',asn:5607,type:'eye',cc:['GB','IE'],pol:'selective',minIx:6,minPni:25,share:0.008,up:['lvl','gtt','tly','ntt','tat','zay','skl','pcw','tsi','sgt','atl','cbb','att','voc','tsy','tsf','tpr','ets','tcl','tmy','edg','stc','drz','cmi','flag','cht','cog','jio'],col:'#0072C9',pops:['dub','edi','gla','lba','lon','man'],ix:['dub','edi','lon','man'],blurb:tr('long_tail.football_films_and_a_router_that')},
 {id:'vmo',name:'Virgin Mediocre',asn:5089,type:'eye',cc:'GB',pol:'restrictive',minIx:6,minPni:25,share:0.007,up:['tlx','ups'],col:'#E10A0A',pops:['edi','gla','lba','lon','man'],ix:['lon','man'],blurb:tr('long_tail.cable_broadband_for_half_of_britain')},
 {id:'tnr',name:'Tele-Nor-Way',asn:2119,type:'eye',cc:['DK','NO','SE'],pol:'selective',minIx:5,minPni:20,share:0.006,up:['lvl','tly','dtk','tsf'],col:'#00A9E0',pops:['ams','cph','fra','got','krs','lon','osl','sto','svg'],ix:['ams','fra','got','lon','osl','sto','svg'],blurb:tr('long_tail.norway_s_incumbent_neither_yes_nor')});
NETS.push(
 {id:'hwt',name:'Hawaiian Telecombo',asn:36149,type:'eye',cc:'US',pol:'restrictive',share:0.004,up:['lvl','cog','drz'],col:'#5B2A86',pops:['hnl','lax','sea'],ix:['hnl','sea'],blurb:tr('long_tail.hawaii_s_incumbent_every_plan_comes')},
 {id:'gtg',name:'Grand Theft Teleguam',asn:9246,type:'t2',cc:'GU',pol:'open',homeOnly:true,share:0.002,price:8,up:['lvl','cog','tsi','gtt','tly','drz'],col:'#0072CE',pops:['gum','hnl','lax','maj','ror','sea','tok'],ix:['gum','hnl','sea','tok'],blurb:tr('long_tail.guam_s_incumbent_and_the_way')},
 {id:'dcp',name:'Docomoco Pacific',asn:3605,type:'eye',cc:'GU',pol:'selective',minIx:2,minPni:10,share:0.002,up:['lvl','ntt','iij','ctc'],col:'#E4002B',pops:['gum','lax','ror','sin','sjc','tok'],ix:['gum','sin','sjc','tok'],blurb:tr('long_tail.guam_s_mobile_network_rice_a')},
 {id:'dsp',name:'Digi-Sell Pacific',asn:45355,type:'t2',cc:['FJ','PG','TO','WS'],pol:'open',homeOnly:true,share:0.005,price:9,up:['tsi','vfi','cog','tpr','spk','fnt'],col:'#E2001A',pops:['apw','pom','suv','syd','tbu'],ix:['suv'],blurb:tr('long_tail.phones_on_every_island_from_papua')},
 {id:'fnt',name:'FINTEL-ligent',asn:9241,type:'t2',pol:'open',share:0.002,price:8,up:['cog','drz','spk'],col:'#00A3AD',pops:['apw','hnl','ppg','suv','syd','tbu'],ix:['suv'],blurb:tr('long_tail.fiji_s_international_gateway_very')},
 {id:'pft',name:'Postes et Télé-Croissant',asn:18200,type:'t2',cc:'NC',pol:'selective',minIx:3,minPni:15,homeOnly:true,share:0.003,price:10,up:['cog','spl'],col:'#F7B500',pops:['lax','nou','ppt','syd'],ix:['nou','syd'],blurb:tr('long_tail.runs_the_post_the_phones_and')},
 {id:'tkp',name:'Telly-Kom PNG',asn:38009,type:'eye',cc:'PG',pol:'selective',minIx:2,minPni:10,share:0.003,up:['pngd'],col:'#C8102E',pops:['pom'],ix:[],blurb:tr('long_tail.papua_new_guinea_s_state_telco')},
 {id:'otk',name:'Ours-Truly Telekom',asn:45891,type:'eye',cc:'SB',pol:'selective',minIx:1,minPni:8,share:0.001,up:['hgc','mora','ptc','pld','ntt','tat','pcw','ord','lvl','cog','tpr','tsi'],col:'#00843D',pops:['hir'],ix:['hir'],blurb:tr('long_tail.the_solomon_islands_incumbent_yours')},
 {id:'tcc',name:'Tongue-in-Cheek Comms',asn:38201,type:'eye',cc:'TO',pol:'selective',minIx:1,minPni:8,share:0.001,up:['hgc','mora','ptc','pld','ntt','tat','pcw','ord','lvl','cog','tpr','fnt','drz'],col:'#C10230',pops:['tbu'],ix:[],blurb:tr('long_tail.tonga_s_own_telco_lived_through')},
 {id:'bsk',name:'Blue-Sky-Pie Samoa',asn:17993,type:'eye',cc:['WS','AS'],pol:'selective',minIx:1,minPni:8,share:0.001,up:['cog','fnt'],col:'#0096D6',pops:['apw','ppg','syd'],ix:['syd'],blurb:tr('long_tail.samoa_s_broadband_promised_with_a')},
 {id:'pnc',name:'PNC-See',asn:17893,type:'t2',cc:'PW',pol:'selective',minIx:1,minPni:8,price:20,homeOnly:true,share:0.0005,up:['cog','tly','ntt','tsi','cmi','tsy','tpr','ctc','lvl','tat','clr','ktt','wio','liq'],col:'#1B75BB',pops:['gum','ror','tok'],ix:['tok'],blurb:tr('long_tail.palau_s_telco_snorkel_down_and')},
 {id:'nta',name:'Never Too Atoll',asn:24439,type:'t2',cc:'MH',pol:'selective',minIx:1,minPni:8,price:20,homeOnly:true,share:0.0005,up:['tat'],col:'#2E8B57',pops:['maj'],ix:[],blurb:tr('long_tail.the_marshall_islands_telco_two')});
NETS.push(
 {id:'onc',name:'One Commotion',asn:3855,type:'eye',cc:'BM',pol:'selective',minIx:1,minPni:8,share:0.001,up:['cog','tat','vzn'],col:'#E4007C',pops:['bda','hfx','lon','mia','nyc','tor'],ix:[],blurb:tr('long_tail.bermuda_s_phones_tv_and_internet')},
 {id:'cvt',name:'Curriculum Vitae Telecom',asn:37517,type:'t2',cc:'CV',pol:'open',homeOnly:true,share:0.002,price:8,up:['tly','glc','agc'],col:'#004B87',pops:['dkr','for','lag','lis','lon','rai'],ix:['lis','rai'],blurb:tr('long_tail.cape_verde_s_incumbent_and_the')},
 {id:'pss',name:'Pretty Sure South Atlantic',asn:210841,type:'t2',cc:'SH',pol:'selective',homeOnly:true,minIx:4,minPni:15,share:0.0005,price:12,up:['wio','lvl','ntt'],col:'#7D2B8B',pops:['cpt','jam'],ix:[],blurb:tr('long_tail.the_telco_for_st_helena_ascension')},
 {id:'bst',name:'Beastlink',asn:11260,type:'eye',cc:'CA',pol:'selective',minIx:2,minPni:10,share:0.002,up:['lvl','gtt','tly','cog','ntt','tat','zay','skl'],col:'#EE3124',pops:['ash','bos','cal','chi','hfx','lon','mtl','nyc','sea','tor','van','yeg','ywg','yxe','yyt'],ix:['cal','chi','hfx','lon','mtl','nyc','sea','tor','van'],blurb:tr('long_tail.atlantic_canada_s_cable_company')});
NETS.push(
 {id:'dgc',name:'Digi-Sell Caribbean',asn:40786,type:'eye',cc:['BB','BM','CW','GD','GY','HT','JM','MQ','SR','TT'],pol:'open',share:0.002,up:['gtt','zay'],col:'#E2001A',pops:['bda','bgi','cur','fdf','geo','gnd','kin','mia','nyc','pap','par','pbm','pos'],ix:['gnd','kin','pbm'],blurb:tr('long_tail.the_same_phone_company_as_in')},
 {id:'wnt',name:'Whirled Net',asn:11367,type:'eye',cc:'PR',pol:'open',share:0.0005,up:['tlx','clr'],col:'#1F6FB2',pops:['sju'],ix:['sju'],blurb:tr('long_tail.puerto_rico_s_own_business_isp')},
 {id:'cbh',name:'Cable Bahamamama',asn:15146,type:'eye',cc:'BS',pol:'selective',minIx:2,minPni:10,share:0.0008,up:['gtt','tly','drz','llt'],col:'#00A3AD',pops:['mia','nas'],ix:['mia'],blurb:tr('long_tail.cable_tv_and_broadband_for_the')},
 {id:'etc',name:'Etecs-ah',asn:27725,type:'eye',cc:'CU',pol:'open',share:0.002,up:['skl','tng','llt'],col:'#0055A4',pops:['hav'],ix:[],blurb:tr('long_tail.cuba_s_state_telco_and_only')},
 {id:'tst',name:'TSTT (This Should Take Time)',asn:5639,type:'eye',cc:'TT',pol:'selective',minIx:2,minPni:10,share:0.001,up:['cog','llt'],col:'#C8102E',pops:['mia','pos'],ix:['mia','pos'],blurb:tr('long_tail.trinidad_and_tobago_s_incumbent_your')},
 {id:'cwt',name:'Curaçao Teal-ecom',asn:27660,type:'eye',cc:'CW',pol:'selective',minIx:4,minPni:15,share:0.0004,up:['dgc'],col:'#00A6A6',pops:['cur'],ix:['cur'],blurb:tr('long_tail.the_island_s_own_telco_the')},
 {id:'cnp',name:'Canal Minus',asn:21351,type:'eye',cc:['MQ','RE'],pol:'selective',minIx:2,minPni:8,share:0.0006,up:['tly','ntt','skl','tlx','liq','tmy','isd','cog'],col:'#111111',pops:['ash','dur','fdf','jnb','mia','mru','par','run','sju','syd'],ix:['ash','dur','jnb','mia','par','run','syd'],blurb:tr('long_tail.french_pay_tv_that_also_runs')},
 {id:'zeo',name:'Zealot',asn:37002,type:'eye',cc:'RE',pol:'open',share:0.0005,up:['cog','vdp','tmy','work'],col:'#7A1FA2',pops:['cpt','dur','jnb','par','run'],ix:['cpt','dur','jnb','par','run'],blurb:tr('long_tail.r_union_s_fiber_challenger_very')},
 {id:'srr',name:'Signal Frequently Ruined',asn:49902,type:'eye',cc:'RE',pol:'selective',minIx:1,minPni:8,share:0.0005,up:['bgs','dol','sfr'],col:'#E2001A',pops:['jnb','run'],ix:['jnb','run'],blurb:tr('long_tail.mobile_and_broadband_on_r_union')},
 {id:'mtc',name:'Dodo Telecom',asn:23889,type:'t2',cc:'MU',pol:'open',homeOnly:true,share:0.001,price:9,up:['lvl','ntt','tat','glc','tng','agc','scm','isd'],col:'#D52B1E',pops:['jnb','lon','mrs','mru','run','sin','tnr'],ix:['jnb','lon','mrs','mru','sin'],blurb:tr('long_tail.the_island_s_incumbent_and_a')},
 {id:'emt',name:'Em-Tell',asn:30999,type:'eye',cc:'MU',pol:'open',share:0.0004,up:['tat','zay','glc','agc','scm','tmy','isd'],col:'#00953B',pops:['dur','jnb','mba','mrs','mru','sin'],ix:['dur','jnb','mrs','mru','sin'],blurb:tr('long_tail.mauritius_number_two_telling_everyone')},
 {id:'tlm',name:'Telmaybe',asn:37054,type:'t2',cc:'MG',pol:'open',homeOnly:true,share:0.0015,price:10,up:['cog','skl','tng','agc','djt'],col:'#FFCC00',pops:['jnb','lon','mru','par','run','tnr'],ix:['jnb','lon','par','tnr'],blurb:tr('long_tail.madagascar_s_incumbent_and_the_only')},
 {id:'cws',name:'Cable & Witless Seychelles',asn:36958,type:'t2',cc:'SC',pol:'open',homeOnly:true,share:0.0003,price:12,up:['drz','wio','liq'],col:'#E4007C',pops:['fuj','jnb','mba','mrs','sez'],ix:['jnb','mba','mrs'],blurb:tr('long_tail.the_seychelles_old_telco_open_to')},
 {id:'acs',name:'Alaska Commotions',asn:7782,type:'eye',cc:'US',pol:'open',share:0.0008,up:['drz','zay'],col:'#0072CE',pops:['anc','jnu','pdx','sea'],ix:['anc','pdx','sea'],blurb:tr('long_tail.alaska_s_old_phone_company_and')},
 {id:'gci',name:'Glacier Comms Inc.',asn:8047,type:'t2',cc:'US',pol:'open',homeOnly:true,share:0.0015,price:11,up:['ntt','cmc','gtt','tly','cog','drz'],col:'#00467F',pops:['anc','brw','dut','jnu','ome','sea','sjc'],ix:['sea'],blurb:tr('long_tail.alaska_s_biggest_network_from_anchorage')},
 {id:'mgf',name:'MegaPhone',asn:31133,type:'eye',cc:'RU',pol:'selective',minIx:4,minPni:15,share:0.003,up:['tly','skl','rrt','ctc'],col:'#00B956',pops:['ams','fra','gdx','goj','hel','hkg','ikt','khv','kja','kuf','kzn','led','lon','mmk','mos','mrs','nyc','oms','ovb','pee','pkc','rov','sto','svx','ufa','uus','vvo','waw'],ix:['ams','fra','hel','kuf','kzn','mos','mrs','nyc','ovb','rov','sto','vvo'],blurb:tr('long_tail.one_of_russia_s_big_mobile')},
 {id:'ert',name:'Er-Um Telecom',asn:9049,type:'eye',cc:'RU',pol:'selective',minIx:4,minPni:15,share:0.002,up:['tly','skl','rtn','rtc','rrt'],col:'#E30613',pops:['ams','fra','goj','hel','ikt','khv','kja','kuf','kzn','led','mos','oms','ovb','pee','rov','sto','svx','ufa','vvo'],ix:['ams','kja','kuf','mos','oms','ovb','rov','vvo'],blurb:tr('long_tail.broadband_in_dozens_of_russian_cities')});
NETS.push(
 {id:'tet',name:'Tet-à-Tête',asn:12578,type:'eye',cc:'LV',pol:'selective',minIx:2,minPni:10,share:0.001,up:['lvl','tly','cog','rtc','eurof','fiord'],col:'#3F2A56',pops:['ams','dus','fra','kyv','rix','sto','tll','waw'],ix:['ams','dus','fra','rix','sto','waw'],blurb:tr('long_tail.latvia_s_incumbent_peers_face_to')},
 {id:'omt',name:'Omantell',asn:28885,type:'t2',cc:'OM',pol:'selective',minIx:3,minPni:12,homeOnly:true,share:0.002,price:9,up:['zoi'],col:'#2F6E3B',pops:['bom','fuj','lon','mct','mrs','sll'],ix:['mct'],blurb:tr('long_tail.oman_s_incumbent_and_owner_of')},
 {id:'dhr',name:'Dhiraa-goo',asn:7642,type:'t2',cc:'MV',pol:'open',homeOnly:true,share:0.0003,price:12,up:['tly','cog','drz','pcw','sgt','duu','tat','dtk','eurof','lvl','ntt','glc','tsi','dlg'],col:'#E2231A',pops:['bom','cbo','lon','mle','sin'],ix:['bom','lon','sin'],blurb:tr('long_tail.the_maldives_telco_on_islands_one')});
