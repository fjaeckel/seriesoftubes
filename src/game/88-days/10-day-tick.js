/* ---------- daily tick ---------- */
function dayTick(){
  if(!S||S.lost||!rule('clock'))return; // no clock (puzzles): no days, no bills, nothing fires
  S.day++;
  const d=S.day;
  dkTick(d);ixPriceWar(d);peeringDeskDay(d);pniDay(d);mergerDay(d);
  if(!S.phpDone&&d>45&&Math.random()<1/400)elephant();
  if(R&&R.teMoved)S.stats.teMax=Math.max(S.stats.teMax||0,R.teMoved);
  {const t1=!!S.won&&isTier1();if(S.t1Now&&!t1)toast(tr('day_tick.you_are_no_longer_tier_1',{why:t1Why()}),'bad');S.t1Now=t1;}
  if(S.grace&&S.grace.until===d){toast(tr('day_tick.the_courtesy_route_has_ended_new'),'bad',[{l:tr('common.open_noc'),act:'leftTab',args:{t:'noc'}}]);}
  for(const a of ddosAll(S,false))if(a.until>=d&&R&&S.pops[a.city])a.worst=Math.min(a.worst===undefined?1:a.worst,ddosSf(a));
  ddosExpire();
  ddosTick();
  // What the Great Firewall drops is not your outage: it alone kept Anchors Away's 99.5% out of reach (playtest).
  if(R&&R.demand>0)S.stats.clean=(R.served+(R.gfwLost||0))/R.demand>=0.995?(S.stats.clean||0)+1:0;
  if(S.scn&&S.scn.id==='redsea')S.stats.asiaRun=asiaG()>=RS_G?(S.stats.asiaRun||0)+1:0;
  if(S.ev.php===d)toast(tr('day_tick.the_internet_is_back_half_of'),'good');
  for(const k in S.peers){const [id,c]=k.split('@'),sn=snub(id,c);if(!sn)continue;delete S.peers[k];S.stats.depeered=(S.stats.depeered||0)+1;
    {const v={net:esc(NET[id].name),ix:esc(ixName(c)),city:esc(CITY[ixCity(c)].name),why:esc(sn.why)};toast(ixNamesCity(c)?tr('day_tick.net_de_peered_you_at_ix',v):tr('day_tick.net_de_peered_you_at_ix_caef',v),'bad');}}
  if(S.cnLic&&S.cnLic.state==='pending'&&d>=S.cnLic.ready){S.cnLic.state='ok';toast(tr('day_tick.license_granted_your_joint_venture'),'goal');sfx('coin');}
  // resolve incidents
  for(const i of S.inc.slice())if(i.until<=d){const o=incOpen(i),l=o&&o.a==='link'&&S.links.find(x=>x.id===o.v),where=l?CITY[l.a].name+'–'+CITY[l.b].name:o&&o.a==='city'?CITY[o.v].name:'';clearInc(i);
    toast(where?tr('day_tick.resolved_what_where_is_back_to',{what:incTitle(i.type),where:esc(where)}):tr('day_tick.resolved_what',{what:incTitle(i.type)}),'good',[],o);}
  // eyeball growth / churn uses last computed service
  for(const c in S.pops){const p=S.pops[c];if(!p.bb)continue;const sf=sfOf(R,c),P=eyeP(c);
    if(sf>=0.9){const g=(CITY[c].be&&!(p.boost>d)?0.35:1)*0.025*(scnRule('boom')?1.5:1)*(p.boost>d?2:1)*sf*(0.7+0.6*(R.peerShare||0))*(CITY[c].reg==='AS'&&!CITY[c].cn?1.6:1);p.bb.d+=g*p.bb.d*(1-p.bb.d/P);}
    else p.bb.d=Math.max(Math.min(3,P),p.bb.d*(1-(0.9-sf)*0.04));}
  compute();
  for(const a of ddosAll())a.worst=Math.min(a.worst??1,ddosSf(a));
  for(const t of S.transit){(t.hist=t.hist||[]).push(R.useT[t.id]||0);if(t.hist.length>30)t.hist.shift();}
  S.cash+=(R.revMo-R.costMo)/30;
  S.stats.peak=Math.max(S.stats.peak,R.served);
  S.hist=S.hist||[];S.hist.push({d,dem:+R.demand.toFixed(2),srv:+R.served.toFixed(2),c:+(R.egT.c||0).toFixed(2),p:+(R.egT.p||0).toFixed(2),ix:+(R.egT.ix||0).toFixed(2),t:+(R.egT.t||0).toFixed(2),l2:+(R.egT.l2||0).toFixed(2),rev:Math.round(R.revMo),cost:Math.round(R.costMo),cash:Math.round(S.cash),inc:S.inc.length});if(S.hist.length>180)S.hist.shift();
  {const top=custLevel();if(top>(S.lvl||1)){for(let lv=(S.lvl||1)+1;lv<=top;lv++){track('level_'+lv);toast(tr('day_tick.customer_level_lv_name_new_customers',{lv,name:LEVELS[lv-1].n,unlock:LEVELS[lv-1].unlock})+`<br><i>${esc(LEVELS[lv-1].q)}</i>`,'goal');}S.lvl=top;sfx('coin');}}
  for(const l of S.links){if(l.kind!=='df')continue;
    if(l.ready===d){toast(`<b>${l.own?tr('day_tick.your_fiber_is_finished_a_b',{a:CITY[l.a].name,b:CITY[l.b].name}):tr('day_tick.dark_fiber_handed_over_a_b',{a:CITY[l.a].name,b:CITY[l.b].name})}</b><br>${(l.ch||[]).length?tr('day_tick.channels_are_lighting_up_now'):tr('day_tick.it_is_dark_add_optics_to')}`,'goal',[{l:tr('common.open'),act:'selLink',args:{id:l.id}}]);sfx('coin');}
    if(l.own&&l.ready>d&&Math.random()<0.012){const extra=10+Math.floor(Math.random()*40);setCableReady(l,l.ready+leadDays(extra));toast(tr('day_tick.construction_delay_n_days_why_a',{n:leadDays(extra),why:pick(l.sub?SEA_DELAYS.map(x=>tr(x)):[tr('day_tick.archaeologists_found_a_roman'),tr('day_tick.a_protected_hamster_species_lives'),tr('day_tick.the_railway_changed_its_mind_about'),tr('day_tick.the_drilling_crew_hit_a_granite'),tr('day_tick.a_town_council_wants_a_public'),tr('day_tick.somebody_else_s_gas_main_was'),tr('day_tick.the_permit_office_lost_your_permit')]),a:CITY[l.a].name,b:CITY[l.b].name}),'bad');}}
  // DDoS protection SLA: if a protected customer's own city is hit and still goes down, you pay out (once per attack).
  for(const a of ddosAll()){
    for(const b of S.biz)if(b.type==='scrub'&&b.city===a.city&&!(a.sla||[]).includes(b.id)&&(a.id||b.slaFor!==a.start)&&sfOf(R,b.city)<0.85){
      (a.sla||(a.sla=[])).push(b.id);b.slaFor=a.start;S.cash-=SLA_PEN;b.mood=Math.max(0,b.mood-18);S.stats.sla=(S.stats.sla||0)+1;
      toast(tr('day_tick.sla_breach_name_the_attack_on',{name:esc(b.name),city:CITY[a.city].name,pen:fmt$(SLA_PEN)}),'bad');sfx('err');}}
  // businesses mood
  const ids=linkIds(),frr=coreFrr()&&S.links.some(l=>l.cut)?.5:1;for(const b of S.biz.slice()){if(eventTick(b,d)||capPendTick(b,d))continue;b.pm=b.mood;const sf=bizSf(b,ids),reachOk=BIZ_T[b.type].l2||BIZ_T[b.type].fiber||R.reach>0.99||scnRule('local'),scrubOk=b.type!=='scrub'||(hasScrub()&&!scrubFar(b.city)),divOk=reqOk(b);
    if(sf>=0.95&&reachOk&&scrubOk&&divOk)b.mood=Math.min(100,b.mood+2);
    else if(S.day-(b.since||0)<15){}
    else{b.mood-=frr*(Math.max(0,0.95-sf)*45+(!reachOk?3:0)+(!scrubOk?4:0)+(!divOk?3:0));
      if(b.mood<=0){S.biz=S.biz.filter(x=>x!==b);toast(tr('day_tick.name_cancelled_too_many_outages_and',{name:esc(b.name),city:CITY[b.city].name}),'bad');sfx('err');}
      else if(b.mood<30&&!b.warned){b.warned=b.warn60=true;const why=bizWhy(b)[0],paused=pref('pauseFurious')&&autoPause();
        toast(tr('day_tick.name_is_furious_fix_service_in',{name:esc(b.name),city:CITY[b.city].name})+(why?`<br><i>${esc(why)}</i>`:'')+(paused?`<br><b>${tr('common.game_paused')}</b>`:''),'bad',[{l:tr('common.show_me'),act:'custGo',args:{id:b.id}}].concat(paused?[resumeAct()]:[]));sfx('err');}
      else if(b.mood<60&&!b.warn60&&pref('warnUnhappy')){b.warn60=true;const why=bizWhy(b)[0];toast(tr('day_tick.name_is_getting_unhappy_happiness_p',{name:esc(b.name),p:Math.round(b.mood),city:CITY[b.city].name})+(why?`<br><i>${esc(why)}</i>`:''),'',[{l:tr('common.show_me'),act:'custGo',args:{id:b.id}}]);}}
    if(b.mood>60)b.warned=false;if(b.mood>75)b.warn60=false;}
  // own IX members join
  for(const c in S.myIx){const m=S.myIx[c];if(d>=m.next&&m.members.length<myFab(c).max){
    const cands=NETS.filter(n=>n.type!=='t1'&&!m.members.includes(n.id)&&(n.pops.includes(c)||n.pops.some(p=>CITY[p].reg===CITY[c].reg)));
    if(cands.length){cands.sort((a,b)=>(a.pol==='open'?0:1)-(b.pol==='open'?0:1)||b.share-a.share);const n=Math.random()<.6?cands[0]:pick(cands);m.members.push(n.id);toast(tr('day_tick.net_joined_ix_another_member_paying',{net:esc(n.name),ix:esc(m.name),fee:fmt$(MYIX_FEE)}),'good');sfx('coin');}
    m.next=d+8+Math.floor(Math.random()*10);}}
  loanTick(d);
  if(rule('money')==='infinite'&&S.cash<1e8)S.cash=1e9;
  // offers
  S.offers=S.offers.filter(o=>o.exp>d);
  brTick();
  if(S.offers.length<5&&Math.random()<(0.05+0.01*(S.lvl||1))*(ppol()==='closed'?0.6:1)*(confSpOn()?SP_OFFERS:1))spawnOffer();
  // failures & events
  // Chaos (the rules) scales how often: calm waits about three times as long, spicy comes almost twice as often, none never.
  let dirty=false;const cm=chaosMul();
  // A visiting chaos monkey does the breaking instead (its snips replace these while it is here).
  mkTick(d);
  if(cm&&d>=S.nextFail&&!mkOn()){dirty=true;fireFailure();const size=S.links.length+Object.keys(S.pops).length;S.nextFail=d+Math.round((Math.max(22,50-size*1.5)+Math.floor(Math.random()*25))*(scnRule('chaos')?0.5:1)/cm);}
  // Anchors Away: on top of the usual failures, ships drag anchors over each Baltic seabed link (about three cuts a link-year).
  if(cm&&d>45&&scnRule('anchors')){const n=S.links.filter(l=>l.kind!=='vxc'&&!linkDown(l)&&anchorProne(l)).length;if(n&&Math.random()<Math.min(5,+S.scn.rules.anchors||1)*n/365){dirty=true;fireFailure('cut');}}
  if(cm&&d>=S.nextEvent){dirty=true;fireEvent();S.nextEvent=d+Math.round((45+Math.floor(Math.random()*45))/cm);}
  if(dirty)compute();
  opsDay(d);
  // payday floaters
  if(d%30===0){for(const c in S.pops){let v=(R.cityEye[c]*sfOf(R,c)*EYE_RATE)+S.biz.filter(b=>b.city===c).reduce((a,b)=>a+b.bw*b.rate,0);v=v-R.cityEye[c]*sfOf(R,c)*EYE_RATE*(1-arpuOf(c));if(v>500)floater(CITY[c].x,CITY[c].y-30,'+'+fmt$(v),'#16A866');}sfx('coin');}
  checkGoals();
  scnTick(d);
  confTick(d);
  specDay(d);
  // money trouble
  if(S.cash<0){S.neg++;if(S.neg===1)toast(tr('day_tick.you_are_in_the_red_cancel'),'bad');}
  else S.neg=0;
  if(S.cash<-100000){S.lost=true;track('bankrupt');showLose();return;}
  if(d%360===0&&[1,2,4].includes(d/360))track('game_year_'+(d/360+1),true);
  if(d%10===0)save();
}
function spawnOffer(){
  const mine=spMine(Object.keys(S.pops)),lv=lvl();
  const types=['dia','dia','game','host'];if(mine.length>=2)types.push('l2vpn','l2vpn');if(S.day>60)types.push('scrub');
  if(lv>=2)types.push('isp','stream','edu','host','hft','bulk','event','event');if(mine.length>=3&&lv>=2)types.push('sdwan','sdwan');
  if(S.links.some(l=>l.kind==='df'&&l.ready<=S.day))types.push('wwave','wwave');if(S.links.some(l=>l.kind==='df'&&l.own&&l.ready<=S.day))types.push('dfpair');if(lv>=3)types.push('gpu','gpu','onramp','onramp');if(lv>=4)types.push('ai','ai','hyper','hyper');
  if(lv>=3&&MEGA.some(m=>mine.includes(m.c)))types.push('ingest');if(lv>=4&&MEGA.some(m=>mine.includes(m.c)))types.push('aiwan','aiwan','mtrain');if(lv>=4&&S.links.some(l=>l.kind==='df'&&l.own&&l.ready<=S.day))types.push('pairs');
  if(lv>=5)types.push('esport');if(lv>=6&&mine.length>=2)types.push('sov','sov');if(lv>=8)types.push('cgame','cgame');if(lv>=9)types.push('metav','metav');if(lv>=11&&MEGA.some(m=>mine.includes(m.c)))types.push('agi');if(lv>=13&&mine.length>=2)types.push('mars');
  const br=mine.filter(c=>CITY[c].br);if(br.length)types.push('provedor','provedor','provedor');
  // Countries with thousands of ASNs (Brazil's provedores, US regionals) are full of small ISPs shopping for transit.
  const dense=mine.filter(c=>(CITY_PDB[c]||[])[2]>=2000);if(lv>=2&&dense.length)types.push('isp');
  const fabC=mine.filter(c=>FABS.some(f=>f.cities.includes(c)));if(lv>=2&&fabC.length){types.push('fabip','fabip');if(mine.length>=2)types.push('fabl2');}
  // What your network can already serve calls too, at a lower weight and the smallest size (#187).
  const sp=spots(),spT=[...new Set(sp.map(s=>s.t))],bq=charter()==='boutique';for(const x of spT){types.push(x);if(x==='hft'&&bq)types.push(x,x);}if(bq&&lv>=2)types.push('hft','hft');
  types.push(...coreProducts(mine));
  const t=pick(types),T=BIZ_T[t];
  if(T.lv>lv&&spT.includes(t)){spawnSpot(t,pick(sp.filter(s=>s.t===t)));return;}
  if(T.event||T.sdwan||T.fiber||T.mega){spawnSpecial(t);return;}
  if(T.nni){const city=pick(fabC),prov=pick(FABS.filter(f=>f.cities.includes(city))).id,bw=pick(T.opts),others=mine.filter(c=>c!==city),city2=T.l2&&others.length?pick(others):null;if(T.l2&&!city2)return;
    const base=pick(BIZ_N.filter(n=>!S.usedNames.includes(n)).concat(BIZ_N)).replace(/ (Inc\.|Co\.|Ltd)$/,'');const name=tr('day_tick.name_via_fab',{name:base,fab:FAB[prov].name});useName(base);
    const rate=T.l2?Math.round((150+kmBetween(city,city2)*0.08)*T.km):T.rate;
    S.offers.push({id:uid(),city,city2,prov,name,type:t,bw,rate,reqs:['nni'],exp:S.day+40});return;}
  let city=(Math.random()<0.65&&mine.length)?pick(mine):pick(OFFC.concat(cnOk()?['pek','sha']:[])),city2=null;
  if(T.l2){city=pick(mine);const pool=(Math.random()<(T.lv>=3?0.8:0.6)?mine:OFFC).filter(c=>c!==city);city2=pick(pool.length?pool:OFFC.filter(c=>c!==city));}
  let bw=T.lv>=2?pick(T.opts):pick(T.opts.slice(0,mine.length>=4?4:3));
  const list=(T.names||BIZ_N).filter(n=>!S.usedNames.includes(n));
  let name=list.length?pick(list):(T.names?pick(T.names):'Startup #'+Math.floor(Math.random()*999));
  useName(name);
  if(t==='provedor')city=pick(br);
  if(t==='isp'&&dense.length&&Math.random()<0.5)city=pick(dense);
  if(t==='hft'){const fin=['nyc','chi','lon','fra','tok','sin','hkg','ams','ash'],mf=mine.filter(c=>fin.includes(c));city=mf.length?pick(mf):pick(mine);city2=pick(fin.filter(c=>c!==city));}
  let rate=T.l2?Math.round((150+kmBetween(city,city2)*0.08)*T.km*(T.lat?latPay():1)):T.rate;
  if(CITY[city].au&&!T.l2&&!T.fiber&&!T.event){rate=Math.round(rate*AU_ARPU);bw=Math.min(bw,pick(T.opts.slice(0,2)));}
  if(T.div&&!reqCan('diverse',{city,city2}))return;
  const reqs=T.div?['diverse']:T.lat?['lat']:[];if((t==='hyper'||t==='ai'||t==='gpu')&&Math.random()<0.4)reqs.push('metro');const pool=Object.keys(REQS).filter(k=>!reqs.includes(k)&&!REQS[k].only&&(!REQS[k].l2||T.l2)&&(!REQS[k].ip||!T.l2)&&reqCan(k,{city,city2}));
  if(Math.random()<(T.lv>=3?0.65:0.3))reqs.push(pick(pool));
  if(T.lv>=3&&Math.random()<0.35){const more=pool.filter(k=>!reqs.includes(k));if(more.length)reqs.push(pick(more));}
  const r2=Math.round(rate*(1+reqs.reduce((a,k)=>a+REQS[k].bonus,0)));
  S.offers.push({id:uid(),city,city2,name,type:t,bw,rate:r2,reqs,latMax:T.lat?+(kmBetween(city,city2)/200*1.35).toFixed(1):null,exp:S.day+40});
}
