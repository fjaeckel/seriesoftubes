/* Puzzles: one entry per line, in play order. A puzzle is data:
   id, pack, n (name), j (one-line joke), src (the content origins: eyeballs pull from the nearest), dem (the traffic:
   {t:'eye',a,g} eyeballs in city a want g Gbps; {t:'l2',a,b,g,ms} a circuit of g Gbps between a and b, under ms
   milliseconds one way; be:1 marks a flow best effort, which may drop when something is cut), via (suggested stepping
   stones), budget (setup + a year of monthly, 0 = no budget star to chase: it is given), and at most a twist:
   noSub (no subsea cables), ring (one ring through every POP), avoid (cities you may not build in).
   Each pack teaches one idea; the budgets sit a little above the cheapest 3-star build found (tests/puzzles.test.js). */
const PZ_PACKS=[
 {id:'hello',n:tr('puzzles.fat_pipes'),d:tr('puzzles.capacity_first_every_link_has_a'),need:0},
 {id:'rodeo',n:tr('puzzles.router_rodeo'),d:tr('puzzles.routers_have_ports_and_a_limit'),need:10},
 {id:'cops',n:tr('puzzles.traffic_cops'),d:tr('puzzles.your_routers_pick_the_path'),need:18},
 {id:'n1',n:tr('puzzles.n_1_club'),d:tr('puzzles.survive_any_single_cut_with_the'),need:26},
 {id:'final',n:tr('puzzles.grand_tour'),d:tr('puzzles.everything_at_once_across_oceans'),need:36},
];
const PZ=[
 {id:'hello',pack:'hello',n:tr('puzzles.hello_world'),j:tr('puzzles.every_internet_starts_with_one_tube'),src:['nyc'],dem:[{t:'eye',a:'lon',g:8}],budget:0},
 {id:'eurotrip',pack:'hello',n:tr('puzzles.euro_trip'),j:tr('puzzles.three_cities_two_currencies_one_very'),src:['ams'],dem:[{t:'eye',a:'lon',g:30},{t:'eye',a:'fra',g:60}],budget:0},
 {id:'bigboat',pack:'hello',n:tr('puzzles.a_bigger_boat'),j:tr('puzzles.paris_wants_150g_one_100g_wave'),src:['fra'],dem:[{t:'eye',a:'par',g:150}],budget:175000},
 {id:'shining',pack:'hello',n:tr('puzzles.sea_to_shining_sea'),j:tr('puzzles.four_cities_one_continent_and_a'),src:['nyc'],dem:[{t:'eye',a:'chi',g:40},{t:'eye',a:'dal',g:30},{t:'eye',a:'sjc',g:60}],budget:715000},
 {id:'downunder',pack:'hello',n:tr('puzzles.down_under_up_and_running'),j:tr('puzzles.one_very_big_island_and_a'),src:['syd'],dem:[{t:'eye',a:'mel',g:50},{t:'eye',a:'bne',g:30},{t:'eye',a:'adl',g:20}],budget:585000},
 {id:'edgelord',pack:'rodeo',n:tr('puzzles.edge_lord'),j:tr('puzzles.london_wants_half_a_terabit_your'),src:['ams'],dem:[{t:'eye',a:'lon',g:500}],budget:240000},
 {id:'hubcap',pack:'rodeo',n:tr('puzzles.hub_cap'),j:tr('puzzles.all_of_europe_s_cat_videos'),src:['lon'],dem:[{t:'eye',a:'ams',g:150},{t:'eye',a:'par',g:150},{t:'eye',a:'fra',g:120}],budget:455000},
 {id:'ports',pack:'rodeo',n:tr('puzzles.port_authority'),j:tr('puzzles.six_cities_a_few_gigs_each'),src:['zrh'],dem:[{t:'eye',a:'mil',g:12},{t:'eye',a:'muc',g:12},{t:'eye',a:'fra',g:12},{t:'eye',a:'par',g:12},{t:'eye',a:'vie',g:12},{t:'eye',a:'prg',g:12}],budget:470000},
 {id:'flash',pack:'cops',n:tr('puzzles.flash_boys'),j:tr('puzzles.traders_paid_millions_to_shave_milliseconds'),src:['nyc'],dem:[{t:'l2',a:'nyc',b:'lon',g:10,ms:26},{t:'eye',a:'lon',g:80,be:1}],budget:660000},
 {id:'baltic',pack:'cops',n:tr('puzzles.baltic_shortcut'),j:tr('puzzles.the_road_to_tallinn_is_short'),src:['fra'],dem:[{t:'eye',a:'tll',g:60},{t:'l2',a:'fra',b:'tll',g:10,ms:8.8}],via:['hel'],budget:285000},
 {id:'fjord',pack:'cops',n:tr('puzzles.fjord_focus'),j:tr('puzzles.the_oil_rigs_want_their_numbers'),src:['par'],dem:[{t:'eye',a:'svg',g:30},{t:'l2',a:'par',b:'svg',g:10,ms:7.2}],via:['lon'],budget:265000},
 {id:'braces',pack:'n1',n:tr('puzzles.belt_and_braces'),j:tr('puzzles.two_cables_across_the_atlantic_because'),src:['nyc'],dem:[{t:'eye',a:'lon',g:60},{t:'eye',a:'dub',g:40}],budget:840000},
 {id:'sharks',pack:'n1',n:tr('puzzles.the_shark_tank'),j:tr('puzzles.the_sharks_have_been_biting_again'),src:['lis'],dem:[{t:'eye',a:'mad',g:40},{t:'eye',a:'par',g:60},{t:'eye',a:'mil',g:30}],via:['bcn','mrs'],noSub:true,budget:450000},
 {id:'nofra',pack:'n1',n:tr('puzzles.not_through_frankfurt'),j:tr('puzzles.de_kicks_sales_has_your_number'),src:['ams'],dem:[{t:'eye',a:'ber',g:50},{t:'eye',a:'muc',g:50},{t:'eye',a:'zrh',g:40}],via:['ham','dus'],avoid:['fra'],budget:390000},
 {id:'fire',pack:'n1',n:tr('puzzles.ring_of_fire'),j:tr('puzzles.four_cities_four_cables_one_ring'),src:['tok'],dem:[{t:'eye',a:'hkg',g:20},{t:'eye',a:'sin',g:20},{t:'eye',a:'syd',g:10}],ring:true,budget:4070000},
 {id:'suez',pack:'final',n:tr('puzzles.suez_you_later'),j:tr('puzzles.frankfurt_to_singapore_the_short_way'),src:['fra'],dem:[{t:'l2',a:'fra',b:'sin',g:10,ms:68},{t:'eye',a:'sin',g:30,be:1}],via:['mrs','bom'],budget:1790000},
 {id:'kiwi',pack:'final',n:tr('puzzles.kiwi_fruit_salad'),j:tr('puzzles.new_zealand_is_far_from_everything'),src:['sea'],dem:[{t:'eye',a:'akl',g:20},{t:'eye',a:'syd',g:40}],via:['hnl','suv','lax'],budget:4200000},
 {id:'samba',pack:'final',n:tr('puzzles.samba_sprint'),j:tr('puzzles.sao_paulo_to_miami_before_the'),src:['mia'],dem:[{t:'l2',a:'sao',b:'mia',g:10,ms:45},{t:'eye',a:'sao',g:40},{t:'eye',a:'rio',g:20,be:1}],via:['for'],budget:2655000},
];
// Weekly puzzle pools: each is one landmass and one region, so every pair has an overland route.
const PZ_WEEK_POOLS=[
 ['fra','ams','par','mad','mil','ber','waw','vie','sto','cph','prg','zrh','bcn','mrs','muc','bud'],
 ['nyc','chi','dal','sea','sjc','lax','mia','ash','atn','den','bos','hou','phx','tor','mtl'],
 ['sao','rio','bsb','bhz','cwb','poa','ssa','rec','for','cpq'],
 ['syd','mel','bne','adl','cbr','per'],
 ['bom','del','maa','blr','hyd'],
];
