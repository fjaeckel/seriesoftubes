/* ---------- failures & events ---------- */
// A few badges read the incident text: callers whose message mentions a shark, anchor, crocodile or llama pass its English as en.
function addInc(o,en=o.msg||''){if(S.loans&&S.loans.some(l=>(l.covs||[]).includes('pizza'))){S.cash-=COVS.pizza.each;S.stats.pizza=(S.stats.pizza||0)+1;}o.id=uid();o.start=S.day;S.inc.push(o);S.stats.incidents++;S.stats.by=S.stats.by||{};S.stats.by[o.type]=(S.stats.by[o.type]||0)+1;if(/shark/i.test(en))S.stats.sharks=(S.stats.sharks||0)+1;const f=S.stats.f=S.stats.f||{};if(/anchor/i.test(en))f.anchor=1;if(/crocodile/i.test(en))f.croc=1;if(/beaver/i.test(en))f.beaver=1;if(/llama/i.test(en))f.llama=1;if(S.rules&&S.rules.chaos==='spicy')stretchInc(o);}
const HARMLESS=[
 [tr('common.certificate_expired'),tr('incidents_and_ddos.the_tls_certificate_on_your_noc')],
 [tr('incidents_and_ddos.it_was_dns'),tr('incidents_and_ddos.someone_deleted_the_dns_record_for')],
 [tr('common.leap_second'),tr('incidents_and_ddos.a_leap_second_convinced_one_of')],
 [tr('common.change_freeze'),tr('incidents_and_ddos.management_declared_a_change_freeze')],
 [tr('incidents_and_ddos.ticket_of_the_week'),tr('incidents_and_ddos.a_customer_opened_a_p1_ticket')],
 [tr('common.monitoring'),tr('incidents_and_ddos.your_monitoring_system_went_down_you')],
 [tr('incidents_and_ddos.load_bearing_typo'),tr('incidents_and_ddos.someone_named_a_vlan_prodcution_it')],
 [tr('common.ipv6_milestone'),tr('incidents_and_ddos.your_ipv6_traffic_grew_400_from')],
 [tr('common.mystery_link'),tr('incidents_and_ddos.you_found_a_10g_link_in')],
 [tr('common.spreadsheet_ipam'),tr('incidents_and_ddos.your_ip_address_spreadsheet_hit_1')],
  [tr('common.goose_incident'),tr('incidents_and_ddos.a_goose_attacked_the_technician_on')],
 [tr('common.latency_test'),tr('incidents_and_ddos.a_carrier_pigeon_beat_one_of')],
 [tr('common.zombie_route'),tr('incidents_and_ddos.a_route_you_withdrew_in_year')],
 [tr('common.auditor_visit'),tr('incidents_and_ddos.an_auditor_asked_for_a_network')],
 [tr('incidents_and_ddos.open_to_work'),tr('incidents_and_ddos.your_peering_coordinator_updated')],
 [tr('common.hold_music'),tr('incidents_and_ddos.your_upstream_support_line_plays_the')],
 [tr('common.naming_committee'),tr('incidents_and_ddos.a_two_hour_meeting_about_router')],
 [tr('common.vendor_tac'),tr('incidents_and_ddos.vendor_support_asked_you_to_try')],
];
function lagsN(){const o=[];for(const t of S.transit)if((t.n||1)>=2&&!(t.down>S.day))o.push({k:'t',id:t.id,o:t,n:t.n,lab:tr('incidents_and_ddos.name_transit_lag_in_city',{name:NET[t.net].name,city:CITY[t.city].name})});
  for(const p of S.pni)if((p.n||1)>=2)o.push({k:'p',id:p.id,o:p,n:p.n,lab:tr('incidents_and_ddos.pni_lag_with_name_in_city',{name:NET[p.net].name,city:CITY[p.city].name})});
  for(const x in S.ixp){const n=(S.ixn||{})[x]||1;if(n>=2&&!S.myIx[x])o.push({k:'ix',id:x,n,lab:ixNamesCity(x)?tr('incidents_and_ddos.ix_lag',{ix:ixName(x)}):tr('incidents_and_ddos.ix_lag_in_city',{ix:ixName(x),city:CITY[ixCity(x)].name})});}return o;}
// Several attacks can be live at once: the primary slot keeps older saves compatible, the rest overlap it.
function ddosAll(s=S,live=true){return [s.ev.ddos,...(s.ev.ddosMore||[])].filter(a=>a&&(!live||a.until>s.day));}
const ddosFind=id=>ddosAll().find(a=>id===undefined||a.id===id);
function ddosDrop(a){const left=ddosAll(S,false).filter(x=>x!==a);S.ev.ddos=left[0]||null;S.ev.ddosMore=left.slice(1);}
const ddosBb=a=>!a.tgt||a.tgt.startsWith('bb:');
const ddosBiz=a=>ddosBb(a)?null:S.biz.find(b=>b.id===a.tgt)||null;
// An attack ends on its day, when its city is gone, or when its target is no longer your customer.
function ddosExpire(){for(const a of ddosAll(S,false))if(a.until<=S.day||!S.pops[a.city]||(!ddosBb(a)&&!ddosBiz(a))){ddosDone(a);ddosDrop(a);}}
function ddosReport(a){return (R.ddos||[]).find(m=>m.attack===a)||null;}
// How well the target is doing: what reached it, times how its city is doing.
function ddosSf(a){const m=ddosReport(a),tf=m?m.tf:1;if(ddosBb(a))return Math.min(tf,sfOf(R,a.city));return tf*bizSfOf(R,a.city);}
// What the attack costs everyone else, as a share of all your traffic.
const ddosCol=a=>{const m=ddosReport(a);return m&&R.demand>0?m.col/R.demand:0;};
// Who is under attack, in words.
function ddosWho(a){const b=ddosBiz(a);return b?tr('ddos.who_customer',{name:b.name,what:BIZ_T[b.type].l,city:CITY[a.city].name}):tr('ddos.who_subscribers',{city:CITY[a.city].name});}
// Flowspec capability of a POP's router: 0 none, 1 basic, 2 full (its rule budget is fsCap).
const fsAt=c=>{const p=S.pops[c];return p?(RG[p.rgen||0].fs||0):0;};
// A DDoS-protection customer whose attacks ride far to be cleaned (#117).
const scrubFar=c=>{for(const a of ddosAll())if(a.city===c){const q=(R.haul||[]).find(q=>q.attack===a.id&&q.city===c&&q.ms!==null&&q.ms>=SCRUB_FAR_MS);if(q)return q;}return null;};
/* ---------- who gets attacked, how hard and how often ----------
   Most real floods are small and short; the giant ones are rare (Cloudflare, H1 2026: 96.6% under 500 Mbps; the record
   is 31.4 Tbps). Sizes come from that world, never from how big your network is. Gamers and hosting attract them. */
const DD_W={cgame:8,game:5,esport:5,host:3,metav:3,scrub:2},DD_REC=31000;
const ddGame=t=>{const b=t&&S.biz.find(x=>x.id===t);return !!b&&(!!BIZ_T[b.type].gaming||b.type==='esport');};
const ddAttract=()=>S.biz.reduce((n,b)=>n+(b.type==='cgame'?2:BIZ_T[b.type].gaming||b.type==='esport'?1:b.type==='host'?0.25:0),0);
const ddosOff=()=>{const c=rule('chaos');return c==='calm'||c==='none'||S.mode==='sandbox'||S.mode==='puzzle';};
const ddosSpicy=()=>!ddosOff()&&rule('chaos')==='spicy';
// Expected attacks a day: one in 40, one more in 40 per attractive customer, at most one in 5; BGP at 3 a.m. doubles it.
const ddosRate=()=>Math.min(1/5,(1+ddAttract())/40)*(ddosSpicy()?2:1);
const ddosVectors=gm=>Object.keys(DDOS_VEC).filter(k=>!DDOS_VEC[k].gaming||gm);
function ddosTargets(){const o=[];for(const b of S.biz){const T=BIZ_T[b.type];if(!T||T.l2||T.fiber||!S.pops[b.city]||(T.event&&!eventLive(b)))continue;o.push([b.id,b.city,DD_W[b.type]||1]);}
  for(const c in S.pops)if(S.pops[c].bb&&S.pops[c].bb.d>0)o.push(['bb:'+c,c,1]);return o;}
function ddosPickTgt(){const o=ddosTargets();if(!o.length){const c=pick(Object.keys(S.pops));return ['bb:'+c,c];}
  let t=o.reduce((n,x)=>n+x[2],0)*Math.random();for(const x of o){t-=x[2];if(t<=0)return x;}return o[o.length-1];}
// The biggest port you have to the outside world.
function ddMaxPort(){let g=10;for(const t of S.transit)g=Math.max(g,PORT[t.tier].g*(t.n||1));for(const p of S.pni)g=Math.max(g,pniG(p)*(p.n||1));for(const x in S.ixp)g=Math.max(g,ixCap(x));return g;}
const ddEraMax=()=>LEVELS.reduce((a,L)=>a*(L.era||1),1);
/* 4 Gbps × the era × a heavy tail: a median near 9 G, one in ten over 50 G, one in a hundred over 650 G, at most the
   era's record. A gaming target doubles it. For the first 180 days, and with one POP, never more than twice your
   biggest port: the first lesson is a full port, not a dead company. Flood Season: a third are 0.8 to 3.4 T monsters
   that grow through the year, the rest eight times the usual. One draw picks the size. */
function ddosSize(a){const fl=scnRule('ddos'),r=Math.random(),cap=DD_REC*eraMul()/ddEraMax();
  if(fl&&r<1/3)return Math.round(Math.min(cap,(800+7800*r)*(1+S.day/365)));
  const u=fl?(r-1/3)*1.5:r,base=4*eraMul()*(ddGame(a.tgt)?2:1)*(fl?8:1);let g=Math.min(cap,base*Math.pow(Math.max(u,1e-9),-1/0.9));
  if(!fl&&(S.day<180||Object.keys(S.pops).length<2))g=Math.min(g,2*ddMaxPort());
  return Math.max(0.1,Math.round(g*10)/10);}
// Flood Season: 3 to 7 days apart, shrinking with age, level and gamers when attacks are spicy.
const floodGap=()=>!ddosSpicy()&&!ddAttract()?3+Math.floor(Math.random()*5):Math.max(0.05,(3+Math.random()*5)/(Math.sqrt(1+S.day/180)*(1+ddAttract()/10+Math.max(0,(S.lvl||1)-1)/12)));
function ddosTick(){if(scnRule('ddos')){if(S.mode==='sandbox')return;let next=+S.scn.nextDdos||3,n=0;
    // Unless spicy, floods take turns: the next one waits until the last is over.
    if(!ddosSpicy()&&ddosAll().length)return;
    while(S.day>=next&&n++<2){ddosAttack(false);next+=floodGap();}S.scn.nextDdos=next<S.day?S.day+floodGap():next;return;}
  if(ddosOff()||S.day<=40)return;if(ddosAll().length>=(ddosSpicy()?3:2))return;if(Math.random()<ddosRate())ddosAttack(false);}
// A new attack. With recompute, its outcome is worked out and announced now; otherwise after the day's routing.
function ddosAttack(recompute=true){const fl=scnRule('ddos');ddosExpire();
  S.ddosStarts=(S.ddosStarts||[]).filter(d=>d>S.day-7&&d<=S.day);if(S.ddosStarts.length>=14||!Object.keys(S.pops).length)return null;S.ddosStarts.push(S.day);
  const [tgt,c]=ddosPickTgt(),vec=pick(ddosVectors(ddGame(tgt))),r=Math.random(),dur=r<0.7?1:r<0.95?2:3;
  const a={id:uid(),city:c,tgt,vec,gbps:0,until:S.day+dur,bh:false,start:S.day,carpet:Math.random()<0.2,fresh:1};a.gbps=ddosSize(a);
  if(fl)a.who=pick(FLOOD_WHO);
  if(!S.ev.ddos)S.ev.ddos=a;else(S.ev.ddosMore||(S.ev.ddosMore=[])).push(a);
  addInc({type:'ddos',ref:c,atk:a.id,until:a.until,msg:tr('ddos.started',{g:fmtG(a.gbps),vec:DDOS_VEC[vec].n,who:ddosWho(a)}),cost:0});
  if(recompute){compute();ddosNews();}
  return a;}
/* After the day's routing: announce new attacks with what they are doing, pull the plug when Auto-RTBH says so, and
   teach each lesson once. */
function ddosNews(){let again=false;const auto=S.ddosAuto&&S.ddosAuto.rtbh;
  for(const a of ddosAll()){const m=ddosReport(a);if(!m)continue;
    if(auto&&!a.bh&&m.full>0&&ddosCol(a)>=0.01){a.bh=true;a.sac=1;S.stats.rtbh=(S.stats.rtbh||0)+1;ddosRtbhMood(a);again=true;
      toast(tr('ddos.auto_rtbh',{who:esc(ddosWho(a))}),'bad',[{l:tr('common.open_noc'),act:'leftTab',args:{t:'noc'}}],{a:'city',v:a.city});}}
  if(again)compute();
  const T=S.stats.ddT||(S.stats.ddT={});
  for(const a of ddosAll()){const m=ddosReport(a);if(!m)continue;
    if(a.fresh){delete a.fresh;const fl=scnRule('ddos'),col=ddosCol(a),sf=ddosSf(a),bad=col>=0.01||sf<0.97;
      const how=a.bh?tr('ddos.news_rtbh'):col>=0.01?tr('ddos.news_ports',{n:m.full,k:m.slowed}):sf<0.97?tr('ddos.news_target',{p:pct(sf)}):tr('ddos.news_held');
      toast(`<b>${incTitle('ddos')}: ${esc(ddosWho(a))}</b><br>${esc(tr('ddos.started',{g:fmtG(a.gbps),vec:DDOS_VEC[a.vec].n,who:ddosWho(a)}))} ${esc(how)}${fl&&a.who?`<br><i>${esc(tr('failures.attacker_who',{who:tr(a.who)}))}</i>`:''}`,bad?'bad':'good',[{l:tr('common.open_noc'),act:'leftTab',args:{t:'noc'}}],{a:'city',v:a.city});
      if(bad)sfx('alert');}
    // Lessons, once a game each.
    if(!T.port&&m.full>0&&!a.bh){T.port=1;toast(tr('ddos.learn_port'),'',[],{a:'tab',v:'noc'});}
    if(!T.fs&&m.fsFull.length){T.fs=1;toast(tr('ddos.learn_fs',{city:CITY[m.fsFull[0]].name}),'',[],{a:'city',v:m.fsFull[0]});}}}
// What the day did to each live attack's score: the worst the target got, the most it cost everyone else.
function ddosTrack(list=ddosAll()){for(const a of list)if(S.pops[a.city]){a.worst=Math.min(a.worst??1,ddosSf(a));a.colMax=Math.max(a.colMax||0,ddosCol(a));}}
// RTBH costs the target: its service is gone while it lasts, and it remembers.
function ddosRtbhMood(a){const b=ddosBiz(a);if(b)b.mood=Math.max(0,b.mood-25);}
/* When an attack is over. Held: the target got 97% and nobody else lost more than 1%. Sacrificed: you blackholed the
   target and saved everyone else. Anything else got through. */
function ddosDone(a){if(!a||a.done)return;a.done=1;if(a.worst===undefined&&S.pops[a.city]&&R)ddosTrack([a]);
  const w=a.worst===undefined?1:a.worst,col=a.colMax||0,held=!a.sac&&w>=0.97&&col<0.01,sac=!!a.sac&&col<0.01;
  if(held){S.stats.ddosOk=(S.stats.ddosOk||0)+1;S.stats.ddosHeld=(S.stats.ddosHeld||0)+1;if(a.gbps>=1000){S.stats.ddosOkBig=(S.stats.ddosOkBig||0)+1;S.stats.ddosMonster=(S.stats.ddosMonster||0)+1;}}
  else if(sac)S.stats.ddosSac=(S.stats.ddosSac||0)+1;
  else{S.stats.ddosLost=(S.stats.ddosLost||0)+1;if(col>=0.01)S.stats.ddosCol=(S.stats.ddosCol||0)+1;}
  if(scnRule('ddos')){const w2=tr(FLOOD_WHO.includes(a.who)?a.who:FLOOD_WHO[0]),who=esc(w2.charAt(0).toUpperCase()+w2.slice(1));
    toast(held?tr('failures.flood_held_g_who_gave_up',{g:fmtG(a.gbps),who}):sac?tr('ddos.flood_sacrificed',{g:fmtG(a.gbps),who:esc(ddosWho(a))}):tr('failures.that_one_got_through_g_city',{g:fmtG(a.gbps),city:esc(CITY[a.city]?CITY[a.city].name:tr('common.your_network')),p:pct(w),who:esc(w2)}),held||sac?'goal':'bad');}}
/* ---------- the NOC card: the flood's path, top to bottom, and the one thing to do now ---------- */
function ddosPanel(){return S?ddosAll().filter(a=>S.pops[a.city]).map(ddosOne).join(''):'';}
const ddCities=l=>{const u=[...new Set(l)];return u.slice(0,3).map(c=>CITY[c].name).join(', ')+(u.length>3?' +'+(u.length-3):'');};
function ddosOne(a){const V=DDOS_VEC[a.vec]||{n:'?',fs:false},m=ddosReport(a),row=(ok,t)=>`<div class="meta">${ok===true?'✓':ok===false?'~':'—'} ${t}</div>`;
  let h=`<div class="inc ddos" style="background:#FFE2E6;border:1px solid #FF8A9A"><div class="nm">🚨 ${tr('ddos.card_title',{g:fmtG(a.gbps),vec:esc(V.n)})}</div>
    <div class="meta"><b>${esc(ddosWho(a))}</b> · ${tr('ui.n_d_left',{n:Math.max(1,a.until-S.day)})}${a.carpet?' · '+tr('ddos.carpet'):''}</div>`;
  if(!m)return h+'</div>';
  const engIdle=hasScrub()&&!a.bh&&m.eng<1&&S.scrubMode==='ondemand'&&S.ddosAuto&&S.ddosAuto.scrub===false&&a.eng===undefined;
  // 1. Upstream and the ports.
  if(a.bh)h+=row(true,tr('ddos.row_rtbh',{g:fmtG(m.up)}));
  if(m.portList&&m.portList.length){const full=m.portList.filter(p=>p.fac<0.97);
    h+=row(full.length?false:true,full.length?trn('ddos.row_ports_full',m.portList.length,{k:full.length,labs:esc(full.slice(0,2).map(p=>p.lab+' ('+CITY[p.city].name+')').join(', '))+(full.length>2?' +'+(full.length-2):'')}):trn('ddos.row_ports_ok',m.portList.length));
    if(m.slowed)h+=row(false,trn('ddos.row_slowed',m.slowed));}
  // 2. Inside: Flowspec and scrubbing.
  if(!a.bh){if(!V.fs)h+=row(null,tr('ddos.row_fs_none',{vec:esc(V.n)}));
    else if(m.fs>1e-6)h+=row(true,tr('ddos.row_fs',{g:fmtG(m.fs),n:m.fsAt.length}))+(m.fsFull.length?row(false,tr('ddos.row_fs_full',{cities:esc(ddCities(m.fsFull))})):'');
    else if(m.fsFull.length)h+=row(false,tr('ddos.row_fs_full',{cities:esc(ddCities(m.fsFull))}));
    else if(m.portList&&m.portList.length)h+=row(null,tr('ddos.row_fs_no_router'));
    if(m.pulled>0)h+=row(m.over>1e-6?false:true,tr('ddos.row_scrub',{g:fmtG(m.pulled),c:fmtG(m.cleaned),cities:esc(ddCities(m.parts.map(x=>x.city)))}));
    else if(engIdle)h+=row(null,tr('ddos.row_scrub_idle'));
    else if(!hasScrub())h+=row(null,tr('ddos.row_scrub_none'));
    const far=(R.haul||[]).filter(q=>q.attack===a.id&&q.ms>0).sort((x,y)=>y.ms-x.ms)[0];if(far)h+=row(null,tr('ddos.row_detour',{ms:far.ms.toFixed(0),city:esc(CITY[far.to].name)}));}
  // 3. The result.
  const sf=ddosSf(a),col=ddosCol(a);
  h+=`<div class="meta"><b>${a.bh?tr('ddos.res_rtbh',{who:esc(ddosBiz(a)?ddosBiz(a).name:CITY[a.city].name)}):col>=0.01?tr('ddos.res_col',{p:pct(sf),g:fmtG(m.col)}):sf<0.97?tr('ddos.res_target',{p:pct(sf)}):tr('ddos.res_held')}</b></div>`;
  // The one thing to do now, and the rest behind "More".
  const rt=btn(tr('ddos.btn_rtbh'),'rtbh',{id:a.id},'red sm'),un=btn(tr('common.stop_blackholing'),'unrtbh',{id:a.id},'ghost sm'),eng=btn(tr('ddos.btn_engage'),'ddosEngage',{id:a.id},'green sm'),hb=btn(tr('incidents_and_ddos.hackback_3000tm_20k'),'hackback',{id:a.id},'sm',S.cash<20000);
  const main=a.bh?un:engIdle?eng:m.full>0&&col>=0.01?rt:'',more=[a.bh||main===rt?'':rt,hb].filter(Boolean).join('');
  h+=`<div class="btns">${main}</div><details class="more"><summary>${tr('ddos.more')}</summary><div class="btns">${more}</div><p class="meta">${tr('ddos.rtbh_help')}</p></details></div>`;
  return h;}
// The NOC's standing DDoS settings: where the scrubbing is, the routers' Flowspec rules, and the two automations.
function ddosSettings(){if(!S)return '';const pops=Object.keys(S.pops),fs=pops.filter(c=>fsCap(c)>0);
  let h=`<div class="kv"><span>${tr('common.ddos_scrubbing')}</span><b>${hasScrub()?tr('hud_and_panels.on_city',{city:S.scrubs.map(x=>CITY[x.city].name).join(', ')}):tr('hud_and_panels.none_build_one_from_a_pop')}</b></div>`;
  h+=`<div class="kv"><span>${tr('ddos.fs_pops')}</span><b>${fs.length}/${pops.length}</b></div>`;
  if(fs.length<pops.length)h+=`<p class="meta" style="margin:2px 0 6px">${tr('ddos.fs_help')}</p>`;
  const A=S.ddosAuto||{};
  h+=`<div class="btns">${btn(A.rtbh?tr('ddos.auto_rtbh_on'):tr('ddos.auto_rtbh_off'),'ddosAuto',{k:'rtbh'},A.rtbh?'green sm':'sm')}${hasScrub()&&S.scrubMode==='ondemand'?btn(A.scrub===false?tr('ddos.auto_scrub_off'):tr('ddos.auto_scrub_on'),'ddosAuto',{k:'scrub'},A.scrub===false?'sm':'green sm'):''}${S.mode==='sandbox'?btn(tr('ddos.test_flood'),'ddosTest',{},'sm'):''}</div>`;
  return h;}
