function fireEvent(){
  const opts=['viral','price','grant'];
  if(S.day>50)opts.push('sanction','tariff','hijack','landban','shutdown','redsea','baltic');
  if(S.day>HW_FREE&&!hwShock())opts.push('hwshock');
  if(S.day>90&&S.links.filter(l=>l.kind==='wave'&&!l.sub).length>=3)opts.push('ctrlplane');
  if(Object.keys(S.pops).some(ruCity))opts.push('runet','runet');
  if(S.pops.doh&&Object.keys(S.pops).some(c=>CITY[c].gcc||CITY[c].uae)&&!(S.ev.gulf>S.day))opts.push('gulf');
  if(Object.keys(S.pops).some(c=>CITY[c].saudi))opts.push('mega');
  if(['mnl','ceb','hkg','tok','icn','sha','jkt'].some(c=>S.pops[c]))opts.push('typhoon');
  if(S.pops.icn&&!S.krExit)opts.push('krexit');if(S.pops.icn&&!(S.ev.krroute>S.day))opts.push('krroute');
  if(Object.keys(S.pops).some(cnCity)||R.gfwCross>1)opts.push('golden','gfw');
  if(S.transit.some(t=>t.net==='cog'))opts.push('depeer','depeer');
  if(Object.keys(S.peers).some(k=>k.startsWith('drz@'))||Object.keys(S.rs).length)opts.push('cake');
  const e=pick(opts);
  if(e==='gulf'){const dur=60+Math.floor(Math.random()*60);S.ev.gulf=S.day+dur;toast(tr('events.the_neighbours_have_fallen_out_a',{n:dur}),'bad');sfx('alert');}
  /* A wave supplier pushes one bad update to its optical control plane, and every wave it sells you in a
     region goes dark for a day or two. Your own dark fiber, subsea waves and fabric circuits keep working. */
  if(e==='ctrlplane'){const by={};for(const l of S.links)if(l.kind==='wave'&&!l.sub&&!(l.cut>S.day)){const r=CITY[l.a].reg;(by[r]=by[r]||[]).push(l);}
    const reg=Object.keys(by).sort((a,b)=>by[b].length-by[a].length)[0];if(!reg)return;const hit=by[reg],until=S.day+2;
    for(const l of hit)l.cut=Math.max(l.cut||0,until);
    const RN={EU:tr('common.europe'),AM:tr('common.north_america'),SA:tr('common.south_america'),AS:tr('common.asia'),OC:tr('common.oceania'),AF:tr('common.africa')};
    addInc({type:'ctrlplane',ref:'reg:'+reg,links:hit.map(l=>l.id),until,msg:tr('events.your_wave_supplier_pushed_one',{n:hit.length,reg:RN[reg]||reg}),cost:Math.round(hit.reduce((a,l)=>a+l.mo,0)*0.3),fix:tr('events.escalate_to_their_cto')},'ctrlplane');
    toast(tr('events.optical_control_plane_meltdown_every',{reg:RN[reg]||reg}),'bad');sfx('alert');return;}
  if(e==='krexit'){S.krExit=S.day+1;S.stats.incidents++;S.stats.survived++;
    toast(tr('events.glitch_is_leaving_korea_the_game'),'bad');sfx('alert');return;}
  if(e==='krroute'){S.ev.krroute=S.day+20;addInc({type:'krroute',ref:'icn',until:S.day+20,msg:tr('events.faceplant_got_tired_of_korean_usage'),cost:0},'krroute');
    toast(tr('events.faceplant_rerouted_korea_via_hong'),'bad');sfx('alert');return;}
  if(e==='mega'){const c=pick(Object.keys(S.pops).filter(x=>CITY[x].saudi)),bw=pick([800,1600,3200]),start=S.day+15;S.offers.push({id:uid(),city:c,city2:null,name:tr('events.a_futuristic_city_that_is_not',{city:CITY[c].name}),type:'event',bw,rate:0,reqs:[],start,dur:4,fee:bw*4*90,exp:start-2});toast(tr('events.a_gigaproject_wants_a_demo_bw',{bw:fmtG(bw),city:CITY[c].name}),'goal');}
  if(e==='sanction'){S.ev.sanction=S.day+60;toast(tr('events.sanctions_the_republic_of'),'bad');sfx('alert');return;}
  if(e==='hwshock'){hwShockStart();return;}
  if(e==='tariff'){S.ev.tariff=S.day+90;toast(tr('events.trade_war_on_optics_two_governments'),'bad');sfx('alert');return;}
  if(e==='hijack'){const nh=NETS.map(n=>n.id).filter(()=>Math.random()<0.6),old=S.ev.rpki&&S.ev.rpki.until>S.day?S.ev.rpki:null;S.ev.rpki=old?{until:Math.max(old.until,S.day+1),nets:[...new Set(old.nets.concat(nh))]}:{until:S.day+1,nets:nh};addInc({type:'hijack',ref:'rpki',until:S.day+1,msg:tr('events.a_state_owned_isp_accidentally'),cost:1500,fix:tr('events.call_everyone_you_know')});toast(tr('events.bgp_hijack_someone_else_is'),'bad');sfx('alert');return;}
  if(e==='landban'){const lc=[...new Set(CABLE_PAIRS.flatMap(c=>[c.a,c.b]))];const c=pick(lc);S.ev.landban={city:c,until:S.day+45};toast(tr('events.landing_permit_dispute_in_city_two',{city:CITY[c].name}),'bad');return;}
  if(e==='shutdown'){const ps=Object.keys(S.pops).filter(c=>c!==S.home);if(!ps.length)return;const c=pick(ps);S.pops[c].down=Math.max(S.pops[c].down||0,S.day+1);addInc({type:'shutdown',ref:c,until:S.day+1,msg:tr('events.regulators_ordered_every_network_in',{city:CITY[c].name}),cost:0});toast(tr('events.ordered_offline_in_city_a_government',{city:CITY[c].name}),'bad');sfx('alert');return;}
  if(e==='typhoon'){const c=pick(['mnl','ceb','hkg','tok','icn','sha','jkt'].filter(x=>S.pops[x])),p=S.pops[c],nm=pick([tr('common.typhoon_bandwidth'),tr('common.typhoon_latency'),tr('common.typhoon_jitter'),tr('events.typhoon_packet_loss')]);
    if(p.gen){S.stats.survived++;toast(tr('events.name_hits_city_the_grid_is',{name:nm,city:CITY[c].name}),'good');sfx('alert');return;}
    p.down=Math.max(p.down||0,S.day+2);addInc({type:'power',ref:c,until:p.down,msg:tr('events.name_knocked_out_power_in_city',{name:nm,city:CITY[c].name}),cost:7000,fix:tr('incidents.rent_a_generator')});toast(tr('events.name_hits_city_power_is_out',{name:nm,city:CITY[c].name}),'bad');sfx('alert');compute();return;}
  if(e==='runet'){S.ev.runet=S.day+1;toast(tr('events.sovereign_internet_drill_moscow'),'bad');sfx('alert');compute();return;}
  if(e==='baltic'){const BAL=['clion','havf','danice'];const hit=S.links.filter(l=>l.cable&&BAL.includes(l.cable)&&!(l.cut>S.day));
    if(!hit.length){toast(tr('events.baltic_cable_damaged_a_cargo_ship'),'goal');return;}
    const dur=15+Math.floor(Math.random()*15),en=N_('events.a_cargo_ship_dragged_its_anchor');for(const tk of new Set(hit.map(l=>l.trench||l.id))){S.links.filter(l=>(l.trench||l.id)===tk).forEach(l=>l.cut=Math.max(l.cut||0,S.day+dur));addInc({type:'redsea',ref:tk,until:S.day+dur,msg:tr(en),cost:0},en);}
    toast(tr('events.baltic_cable_damaged_n_of_your',{n:hit.length,d:dur}),'bad');sfx('alert');compute();return;}
  if(e==='redsea'){const RED=['twoaf','smw6','peace','aae','eig','eassy'];const hit=S.links.filter(l=>l.cable&&RED.includes(l.cable)&&!(l.cut>S.day));
    if(!hit.length){toast(tr('events.cables_cut_in_the_red_sea'),'goal');return;}
    const dur=20+Math.floor(Math.random()*15),en=N_('events.a_ship_drifting_without_power');for(const tk of new Set(hit.map(l=>l.trench||l.id))){S.links.filter(l=>(l.trench||l.id)===tk).forEach(l=>l.cut=Math.max(l.cut||0,S.day+dur));addInc({type:'redsea',ref:tk,until:S.day+dur,msg:tr(en),cost:0},en);}
    toast(tr('events.cables_cut_in_the_red_sea_03e8',{n:hit.length,d:dur}),'bad');sfx('alert');compute();return;}
  if(e==='golden'){S.ev.golden=S.day+7;toast(tr('events.golden_week_demand_in_mainland_china'),'goal');return;}
  if(e==='gfw'){S.ev.gfw=S.day+10;toast(tr('events.the_border_got_stricter_cross_border'),'bad');sfx('alert');return;}
  if(e==='viral'){S.ev.viral=S.day+8;toast(tr('events.new_season_of_stranger_pings_just'),'goal');}
  else if(e==='price'){S.priceMul*=0.92;toast(tr('events.transit_prices_fell_8_they_do'),'good');}
  else if(e==='grant'){S.cash+=30000;toast(tr('events.rural_broadband_grant_30k_the'),'good');sfx('coin');}
  else if(e==='depeer'){S.ev.depeer=S.day+20;addInc({type:'depeer',ref:'cog',until:S.day+20,msg:tr('events.cogentle_and_goggle_are_in_a'),cost:0});toast(tr('events.peering_spat_cogentle_de_peered'),'bad');sfx('alert');}
  else if(e==='cake'){S.cash+=8000;toast(tr('events.drizzle_electric_sent_you_an_ipv6'),'good');sfx('coin');}
}

