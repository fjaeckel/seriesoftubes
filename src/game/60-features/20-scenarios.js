/* Seeded games (scenarios, weekly challenge) draw every random number from S.rng, so the same seed
   gives the same world. Free play keeps using the browser's Math.random. */
const _rand=Math.random;
Math.random=function(){if(S&&typeof S.rng==='number'){let t=(S.rng=(S.rng+0x6D2B79F5)|0);t=Math.imul(t^t>>>15,1|t);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}return _rand();};
const hopG=l=>l.kind==='vxc'?(VXC[l.vt]||VXC[0]).g:l.kind==='df'?Math.max(0,...(l.ch||[]).map(c=>optG(c,l))):LT[l.tier].g;
function fastPath(a,b,g){if(!S.pops[a]||!S.pops[b])return false;const adj={};for(const l of S.links){if(linkDown(l)||hopG(l)<g)continue;(adj[l.a]=adj[l.a]||[]).push(l.b);(adj[l.b]=adj[l.b]||[]).push(l.a);}const seen=new Set([a]),q=[a];while(q.length){const u=q.shift();if(u===b)return true;for(const v of adj[u]||[])if(!seen.has(v)){seen.add(v);q.push(v);}}return false;}
function pathExists(a,b){if(!S.pops[a]||!S.pops[b])return false;const adj={};for(const l of S.links){if(linkDown(l))continue;(adj[l.a]=adj[l.a]||[]).push(l.b);(adj[l.b]=adj[l.b]||[]).push(l.a);}const seen=new Set([a]),q=[a];while(q.length){const u=q.shift();if(u===b)return true;for(const v of adj[u]||[])if(!seen.has(v)){seen.add(v);q.push(v);}}return false;}
// Looked up rather than read from the save, so it follows a language switch mid-scenario.
const scnName=()=>S.scn.wk?wsTxt(S.scn.wk.name):S.scn.id==='weekly'?tr('scenarios.weekly_key',{key:S.scn.key}):SCN.find(x=>x.id===S.scn.id)?.n||S.scn.name;
const AU_BB=['syd','mel','bne','adl','per'],auExits=()=>new Set(S.links.filter(l=>l.sub&&!!CITY[l.a].au!==!!CITY[l.b].au&&!(l.ready>S.day)).map(l=>l.cable||l.id)).size;
// Ports count only on POPs your backbone joins to São Paulo: islands of POPs with a port each skipped the Amazon (playtest).
const FTTB_G=500;
// Gangnam Style Peering: traffic, how well Seoul is served (delivered and fast) and a monthly profit.
const GN_G=700,GN_Q=0.92;
const brIxN=()=>CITIES.filter(c=>c.br&&S.ixp[c.id]!==undefined&&(c.id==='sao'||pathExists('sao',c.id))).length;
// Days and cash were tuned in the 2.0.0 playtest (tests/scenarios-playtest.test.js): a reference player wins each one in
// roughly a fifth to a half of its days, and the obvious shortcut does not win. The 1.6T scenarios start with enough cash to
// build the whole chain on day 0 and still last until the traffic goal.
const SCN=[
 {id:'stg',n:tr('scenarios.only_spatzle_ix'),city:'stg',cash:400000,days:365,rules:{noTransit:true,local:true},d:tr('scenarios.start_in_stuttgart_where_nobody'),goal:tr('scenarios.reach_50_of_the_internet_and'),ok:()=>R.reach>=0.5&&R.served>=300},
 {id:'redsea',n:tr('scenarios.red_sea_crisis'),city:'mrs',cash:2500000,days:365,rules:{banCities:['cai','jed'],banPairs:['eig:dxb-mrs','gbi:fuj-mrs','smw4:khi-mrs','smw6:mrs-bom','smw6:mrs-sin','peace:mrs-sin','aae:mrs-hkg','twoaf:mrs-bom','medn:cai-mrs','medn:ist-mrs','twoaf:jnb-mrs','eassy:nbo-mrs']},d:tr('scenarios.every_cable_through_the_red_sea'),goal:tr('scenarios.a_path_from_marseille_to_singapore'),ok:()=>pathExists('mrs','sin')&&(S.stats.asiaRun||0)>=RS_DAYS},
 {id:'spat',n:tr('scenarios.the_cogentle_spat'),city:'nyc',cash:700000,days:240,rules:{spat:true},d:tr('scenarios.cogentle_and_goggle_are_not_speaking'),goal:tr('scenarios.99_reach_and_150_gbps_served'),ok:()=>R.reach>=0.99&&R.served>=150},
 {id:'carnaval',n:tr('common.carnaval'),city:'rio',cash:600000,days:100,rules:{},setup:()=>{S.biz.push({id:uid(),scripted:true,city:'rio',city2:null,reqs:[],name:'Carnaval Parade in Rio de Janeiro',type:'event',bw:400,rate:0,mood:100,since:0,start:90,dur:5,fee:400*5*70});},d:tr('scenarios.rio_from_scratch_carnaval_starts_in'),goal:tr('scenarios.deliver_carnaval_in_full'),ok:()=>(S.stats.evFull||0)>=1},
 // Connected, not just present: four island POPs with local transit won on day 40 without crossing anything (playtest).
 {id:'darien',n:tr('common.mind_the_gap'),city:'pan',cash:900000,days:180,rules:{},d:tr('scenarios.start_in_panama_city_nothing_crosses'),goal:tr('scenarios.connect_panama_city_to_bogota_lima'),ok:()=>['bog','lim','scl','sao'].every(c=>pathExists('pan',c))&&R.served>=150},
 // Lagos and Nairobi on the network too: one long wave to Cairo plus two empty POPs was not a network across Africa.
 {id:'c2c',n:tr('scenarios.cape_to_cairo'),city:'cpt',cash:2000000,days:365,rules:{},d:tr('scenarios.cape_town_build_a_network_across'),goal:tr('scenarios.a_path_from_cape_town_to_cairo_lagos'),ok:()=>pathExists('cpt','cai')&&pathExists('cpt','lag')&&pathExists('cpt','nbo')&&R.served>=150},
 {id:'ixbr',n:tr('scenarios.order_and_progress'),city:'sao',cash:600000,days:240,rules:{},d:tr('scenarios.sao_paulo_brazil_is_a_continent'),goal:tr('scenarios.ports_on_15_ix_brrr_exchanges_backbone'),ok:()=>brIxN()>=15&&S.ixp.mao!==undefined&&R.served>=200},
  // Sender pays, turned up: with Korea at the usual prices broadband swamped every bill and Seoul alone won on day 73
 // (playtest). Now Seoul transit is dear, the incumbents want a paid PNI and Korean users mind every far exit.
 {id:'gangnam',n:tr('scenarios.gangnam_style_peering'),city:'icn',cash:900000,days:240,rules:{sender:true},d:tr('scenarios.seoul_sender_pays_d'),goal:tr('scenarios.seoul_sender_pays_goal',{g:GN_G,q:Math.round(GN_Q*100)}),ok:()=>R.reach>=0.99&&R.served>=GN_G&&sfOf(R,'icn')>=GN_Q&&R.revMo>=R.costMo},
 {id:'flood',n:tr('common.flood_season'),city:'ams',cash:2000000,days:365,rules:{ddos:true},setup:()=>{S.lvl=Math.max(S.lvl||1,3);},d:tr('scenarios.amsterdam_hosting_capital_of_europe'),goal:tr('scenarios.hold_20_floods_5_of_them'),ok:()=>(S.stats.ddosOk||0)>=20&&(S.stats.ddosOkBig||0)>=5},
 // Traffic served too: broadband in five cities and two cables were bought on day 1 and won on day 2 (playtest).
 {id:'fttb',n:tr('scenarios.fibre_to_the_basement'),city:'syd',cash:1500000,days:365,rules:{levy:true},d:tr('scenarios.sydney_2013_the_toilet_paper_group'),goal:tr('scenarios.broadband_in_sydney_melbourne_served'),ok:()=>AU_BB.every(c=>S.pops[c]&&S.pops[c].bb)&&auExits()>=2&&R.served>=FTTB_G},
 // Nobody sells transit in Tallinn here: with local transit, a network that never crossed the water won (playtest).
 {id:'baltic',n:tr('common.anchors_away'),city:'tll',cash:500000,days:365,rules:{anchors:3,noTransitIn:['tll']},d:tr('scenarios.tallinn_nobody_sells_transit_anchors'),goal:tr('scenarios.90_days_in_a_row_with'),ok:()=>(S.stats.clean||0)>=90},
 {id:'pac',n:tr('common.stepping_stones'),city:'hnl',cash:5000000,days:240,rules:{},setup:()=>{S.lvl=Math.max(S.lvl||1,4);},d:tr('scenarios.honolulu_in_the_middle_of_the'),goal:tr('scenarios.a_path_from_los_angeles_to'),ok:()=>fastPath('lax','syd',1600)&&pathExists('lax','tok')&&R.served>=150},
 {id:'atl',n:tr('scenarios.mid_atlantic_accent'),city:'pdl',cash:5000000,days:240,rules:{},setup:()=>{S.lvl=Math.max(S.lvl||1,4);},d:tr('scenarios.ponta_delgada_azores_lisbon_lagos'),goal:tr('scenarios.1_6t_on_every_hop_from'),ok:()=>fastPath('mia','mad',1600)&&fastPath('lis','lag',1600)&&R.served>=100},
];
const WEEK_CITIES=['fra','ams','lon','nyc','ash','sjc','sin','tok','syd','sao','jnb','bom','waw','ist','scl','hkg'];
const WEEK_MODS=[{id:'pricey',n:tr('scenarios.transit_costs_30_more')},{id:'chaos',n:tr('scenarios.twice_the_failures')},{id:'poor',n:tr('scenarios.start_with_only_100k')},{id:'boom',n:tr('scenarios.eyeballs_grow_50_faster')},{id:'dk',n:tr('scenarios.every_ix_is_run_by_de')},{id:'sharks',n:tr('scenarios.shark_season_subsea_cuts_twice_as')}];
// The in-browser weekly, when no published scenario came: same weeks as the published one (Sunday 06:00 Berlin).
function weekly(){const [y,w]=pzWeekKey(new Date()).split('-W').map(Number);let r=(y*100+w)*2654435761>>>0;const nx=()=>{r=(r*1103515245+12345)>>>0;return r/4294967296;};const city=WEEK_CITIES[Math.floor(nx()*WEEK_CITIES.length)];const mods=[];while(mods.length<2){const m=WEEK_MODS[Math.floor(nx()*WEEK_MODS.length)];if(!mods.includes(m))mods.push(m);}return {id:'weekly',key:`${y}-W${String(w).padStart(2,'0')}`,seed:y*100+w,city,mods,days:365};}
const scnRule=k=>!!(S&&S.scn&&S.scn.rules&&S.scn.rules[k]);
function scnHof(){try{return JSON.parse(localStorage.getItem('sot-scn')||'{}')||{};}catch(e){return {};}}
function beginGame(nm,city,o={}){if(needPitch()&&!UI.pitched){UI.pendGame=[nm,city,o];openModal(pitchHtml(true));return;}if(pzOn())pzLeave();slotLeave();slotNew();newGame(nm,city);{const a=+(UI.asnTxt||UI.asnSug||0);if(asnOk(a))S.asn=a;UI.asnSug=null;}S.mode=o.mode||'normal';
  // The rules are picked here and locked for the life of the network. Scenarios run on On-call plus their own rules.
  {const pr=o.scn?'oncall':S.mode==='sandbox'?'sandbox':S.mode==='puzzle'?'puzzle':own(PRESETS,o.preset)&&o.preset!=='sandbox'&&o.preset!=='puzzle'?o.preset:'oncall';S.rules=makeRules(pr,o.scn?{}:o.rules);}
  if(S.mode==='sandbox'){S.cash=1e9;S.lvl=LEVELS.length;if(!chaosMul()){S.nextFail=1e9;S.nextEvent=1e9;}}
  if(o.scn){const sc=o.scn;S.scn={id:sc.id,rules:sc.rules||{},days:sc.days,name:sc.n||tr('features.weekly_challenge_key',{key:sc.key}),key:sc.key||null,mods:(sc.mods||[]).map(m=>m.id)};S.rng=(o.seed||hstr(sc.id))|0;S.mode='scenario';S.asn=200000+Math.floor(Math.random()*15000);
    if(sc.cash)S.cash=sc.cash;if(sc.setup)sc.setup();
    for(const m of S.scn.mods){if(m==='pricey')S.priceMul=1.3;if(m==='poor')S.cash=100000;if(m==='chaos')S.scn.rules.chaos=true;if(m==='boom')S.scn.rules.boom=true;if(m==='dk')S.scn.rules.dkAll=true;if(m==='sharks')S.scn.rules.sharks=true;}}
  // Every new network starts at ½ speed (#186), whatever the last one ran at: slow enough to look around, but things happen.
  UI.speed=UI.lastSpeed=rule('clock')?0.5:0;UI.resumeSpeed=null;
  track('game_new');UI.started=true;closeModal();compute();cam.x=CITY[city].x;cam.y=CITY[city].y;cam.z=innerWidth<760?1.1:1.4;selectCity(city);
  toast(S.scn?`<b>${esc(S.scn.name)}</b><br>${o.scn.goal?esc(o.scn.goal)+'.':tr('common.serve_as_much_traffic_as_you')} ${tr('scenarios.you_have_n_days',{n:S.scn.days})}`:S.mode==='sandbox'?(chaosMul()?tr('scenarios.sandbox_mode_a_billion_dollars_chaos',{chaos:CHAOS[rule('chaos')].n}):tr('scenarios.sandbox_mode_a_billion_dollars_every')):tr('scenarios.welcome_name_the_ripe_ncc_assigned',{name:esc(nm),asn:S.asn,city:CITY[city].name}),'goal');
  renderAll();save();if(!S.scn&&S.mode!=='sandbox'&&S.mode!=='puzzle')tutorialStart();}
