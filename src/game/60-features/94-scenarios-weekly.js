/* ================= THE PUBLISHED WEEKLY SCENARIO =================
   The twin of the weekly puzzle: the same weeks (Sunday 06:00 Berlin, pzWeekKey), one themed scenario per week,
   published by a GitHub workflow as scenarios/weekly/<key>.json (scripts/weekly-scenario.js) and fetched only when the
   Scenarios list opens. The file is data only: a theme, a start, rules from the scenario vocabulary, and a goal TYPE
   with its parameters; every goal type is implemented once here, with its progress card. Missing, offline or wrong,
   the in-browser weekly() stands in. Like every scenario it runs On-call plus its own rules (M4). */
// What a {placeholder} holds: c a city, r a region, n a whole number, k a cable id.
const WS_P={a:'c',b:'c',city:'c',reg:'r',n:'n',g:'n',day:'n',ms:'n',cab:'k'};
const WS_THEMES={
 budget:{i:'🪙',names:[N_('wkscn.name_shoestring_backbone'),N_('wkscn.name_ramen_profitable')],descs:[N_('wkscn.desc_city_on_a_shoestring'),N_('wkscn.desc_start_in_city_with_pocket')]},
 cable:{i:'✂️',names:[N_('wkscn.name_suez_you_later'),N_('wkscn.name_cut_and_run')],descs:[N_('wkscn.desc_cab_is_cut_for_the'),N_('wkscn.desc_a_ship_dragged_its_anchor')]},
 event:{i:'🎉',names:[N_('wkscn.name_party_like_its_1999'),N_('wkscn.name_stream_team')],descs:[N_('wkscn.desc_a_g_event_comes_to'),N_('wkscn.desc_the_whole_city_is_watching')]},
 flood:{i:'🌊',names:[N_('wkscn.name_flood_week'),N_('wkscn.name_packet_monsoon')],descs:[N_('wkscn.desc_city_hosts_the_internets_favourite'),N_('wkscn.desc_booters_picked_city_for_their')]},
 island:{i:'🏝️',names:[N_('wkscn.name_island_hopper'),N_('wkscn.name_sea_you_soon')],descs:[N_('wkscn.desc_start_on_city_and_string'),N_('wkscn.desc_city_is_surrounded_by_water')]},
 latency:{i:'⚡',names:[N_('wkscn.name_ludicrous_speed'),N_('wkscn.name_light_speed_please')],descs:[N_('wkscn.desc_a_trading_firm_needs_a'),N_('wkscn.desc_every_millisecond_between_a_and')]},
 region:{i:'🗺️',names:[N_('wkscn.name_continental_breakfast'),N_('wkscn.name_planting_flags')],descs:[N_('wkscn.desc_city_is_just_the_start'),N_('wkscn.desc_every_exchange_in_reg_wants')]},
 spat:{i:'🙊',names:[N_('wkscn.name_not_on_speaking_terms'),N_('wkscn.name_peering_pressure')],descs:[N_('wkscn.desc_cogentle_and_goggle_stopped_talking'),N_('wkscn.desc_two_giants_de_peered_over')]},
};
const wsRun=()=>S.scn.run|0;
const wsIxN=reg=>Object.keys(S.ixp).filter(c=>isIx(c)&&CITY[ixCity(c)]&&CITY[ixCity(c)].reg===reg).length;
const wsCs=p=>p.cs.map(c=>CITY[c].name).join(', ');
// The goal types. p: each parameter's kind and range ([kind,lo,hi]); ok(p) won; m(p) a number the generator calibrates
// against (and the progress bar reads); daily: the goal counts days in a row; prog(p) the card's rows.
const WS_GOALS={
 served:{p:{g:['n',5,50000]},l:N_('wkscn.goal_serve_g'),ok:p=>R.served>=p.g,m:()=>R.served,prog:p=>[pSrv(p.g)]},
 reach:{p:{r:['n',50,99],g:['n',1,50000]},l:N_('wkscn.goal_reach_r_and_serve_g'),ok:p=>R.reach>=p.r/100&&R.served>=p.g,m:()=>R.served,prog:p=>[{l:tr('common.reach'),v:R.reach,max:p.r/100,txt:`${pct(R.reach)} / ${p.r}%`},pSrv(p.g)]},
 path:{p:{a:['c'],b:['c'],g:['n',10,12800],n:['n',1,120]},daily:p=>fastPath(p.a,p.b,p.g),l:N_('wkscn.goal_g_on_every_hop_from'),ok:p=>wsRun()>=p.n,m:()=>wsRun(),
  prog:p=>[pChk(tr('wkscn.p_path_g_a_b',{g:fmtG(p.g),a:CITY[p.a].name,b:CITY[p.b].name}),fastPath(p.a,p.b,p.g)),{l:tr('wkscn.p_days_in_a_row'),v:wsRun(),max:p.n,txt:`${wsRun()} / ${p.n}`}]},
 ix:{p:{reg:['r'],n:['n',2,60]},l:N_('wkscn.goal_ports_on_n_exchanges_in'),ok:p=>wsIxN(p.reg)>=p.n,m:p=>wsIxN(p.reg),prog:p=>{const n=wsIxN(p.reg);return [{l:tr('wkscn.p_exchange_ports_in_reg',{reg:WAVE_NAME[p.reg]}),v:n,max:p.n,txt:`${n} / ${p.n}`}];}},
 pops:{p:{cs:['cs',1,8]},l:N_('wkscn.goal_a_connected_pop_in_list'),ok:p=>p.cs.every(c=>pathExists(S.scn.home,c)),m:p=>p.cs.filter(c=>pathExists(S.scn.home,c)).length,prog:p=>p.cs.map(c=>pChk(tr('progress.city_on_your_network',{city:CITY[c].name}),pathExists(S.scn.home,c)))},
 event:{p:{city:['c'],g:['n',10,6400],day:['n',20,360],dur:['n',1,10]},l:N_('wkscn.goal_deliver_the_event_in_city'),ok:()=>(S.stats.evFull||0)>=1,m:()=>S.stats.evFull||0,
  setup:p=>S.biz.push({id:uid(),scripted:true,city:p.city,city2:null,reqs:[],name:tr('wkscn.event_name_city',{city:CITY[p.city].name}),type:'event',bw:p.g,rate:0,mood:100,since:0,start:p.day,dur:p.dur,fee:p.g*p.dur*70}),
  prog:p=>[pChk(tr('wkscn.p_event_delivered_in_full'),(S.stats.evFull||0)>=1),{l:tr('common.traffic_served'),v:0,max:0,txt:tr('wkscn.p_g_on_day_d',{g:fmtG(p.g),d:p.day})}]},
 floods:{p:{n:['n',1,60],big:['n',0,20]},l:N_('wkscn.goal_hold_n_floods_big_of'),ok:p=>(S.stats.ddosOk||0)>=p.n&&(S.stats.ddosOkBig||0)>=p.big,m:()=>S.stats.ddosOk||0,
  prog:p=>[{l:tr('common.floods_held'),v:S.stats.ddosOk||0,max:p.n,txt:`${S.stats.ddosOk||0} / ${p.n}`},...(p.big?[{l:tr('progress.terabit_floods_held'),v:S.stats.ddosOkBig||0,max:p.big,txt:`${S.stats.ddosOkBig||0} / ${p.big}`}]:[])]},
 lat:{p:{a:['c'],b:['c'],ms:['n',1,400],n:['n',1,120]},daily:p=>bestLat(p.a,p.b)<=p.ms,l:N_('wkscn.goal_a_to_b_under_ms'),ok:p=>wsRun()>=p.n,m:()=>wsRun(),
  prog:p=>{const v=bestLat(p.a,p.b);return [pChk(tr('wkscn.p_a_b_now',{a:CITY[p.a].name,b:CITY[p.b].name,ms:isFinite(v)?v.toFixed(1)+' ms':tr('common.no_path')}),v<=p.ms),{l:tr('wkscn.p_days_in_a_row'),v:wsRun(),max:p.n,txt:`${wsRun()} / ${p.n}`}];}},
};
// Filled-in text: a label from the file and its typed parameters, in the player's language.
const wsVal=(k,x)=>{const t=WS_P[k];return t==='c'?CITY[x].name:t==='r'?WAVE_NAME[x]:t==='k'?CAB[x].name:k==='g'?fmtG(x):x;};
const wsTxt=o=>{const v={};for(const k in o.p)v[k]=wsVal(k,o.p[k]);return tr(o.l,v);};
function wsGoalTxt(j){const G=j.goal,p=G.p,v={};for(const k in p)v[k]=k==='cs'?wsCs(p):WS_P[k]?wsVal(k,p[k]):p[k];return tr(G.t==='floods'&&!p.big?N_('wkscn.goal_hold_n_floods'):WS_GOALS[G.t].l,v);}
// ---------- the file: never trusted ----------
const WS_FIELDS=['v','key','theme','city','cash','days','lvl','rules','mods','goal','name','desc','seed','par','ref','rev'];
const WS_V=1,WS_RULES=['anchors','banCities','banPairs','ddos','spat'];
const wsPairOk=s=>typeof s==='string'&&CABLE_PAIRS.some(c=>s===`${c.cid}:${c.a}-${c.b}`);
function wsLab(o,list){if(!pzObj(o)||typeof o.l!=='string'||!list.includes(o.l))return null;const p=o.p==null?{}:o.p;if(!pzObj(p))return null;
  const need=[...new Set([...String(EN[o.l]).matchAll(/\{(\w+)\}/g)].map(m=>m[1]))],out={};if(Object.keys(p).length!==need.length)return null;
  for(const k of need){const t=WS_P[k],v=own(p,k)?p[k]:undefined;
    if(t==='c'&&pzCityOk(v)||t==='r'&&typeof v==='string'&&own(WAVE_NAME,v)||t==='k'&&typeof v==='string'&&own(CAB,v)||t==='n'&&Number.isInteger(v)&&v>0&&v<1e6)out[k]=v;else return null;}
  return {l:o.l,p:out};}
function wsGoal(o){if(!pzObj(o)||typeof o.t!=='string'||!own(WS_GOALS,o.t)||!pzObj(o.p))return null;const G=WS_GOALS[o.t],out={};
  if(Object.keys(o.p).length!==Object.keys(G.p).length)return null;
  for(const k in G.p){const [t,lo,hi]=G.p[k],v=o.p[k];
    if(t==='c'){if(!pzCityOk(v))return null;}else if(t==='r'){if(typeof v!=='string'||!own(WAVE_NAME,v))return null;}
    else if(t==='cs'){if(!Array.isArray(v)||v.length<lo||v.length>hi||!v.every(pzCityOk)||new Set(v).size!==v.length)return null;}
    else if(!Number.isInteger(v)||v<lo||v>hi)return null;
    out[k]=Array.isArray(v)?v.slice():v;}
  if(out.a&&out.a===out.b)return null;return {t:o.t,p:out};}
// A checked copy of the file, or null. The copy is what a game stores and reloads (sanitize() checks it again).
function wsValid(j,key){if(!pzObj(j)||Object.keys(j).some(k=>!WS_FIELDS.includes(k))||j.v!==WS_V||j.key!==key||pzWeekStart(key)==null||typeof j.theme!=='string'||!own(WS_THEMES,j.theme))return null;
  const T=WS_THEMES[j.theme],I=(v,lo,hi)=>Number.isInteger(v)&&v>=lo&&v<=hi;
  if(!pzCityOk(j.city)||!I(j.cash,50000,2e7)||!I(j.days,60,400)||!I(j.lvl,1,4)||!I(j.seed,1,2**31-1)||!I(j.par,1,j.days))return null;
  if(j.rev!==undefined&&!I(j.rev,2,999))return null;if(j.ref!==undefined&&!pzObj(j.ref))return null;
  const r=j.rules==null?{}:j.rules;if(!pzObj(r)||Object.keys(r).some(k=>!WS_RULES.includes(k)))return null;const rules={};
  for(const k in r){const v=r[k];
    if(k==='spat'||k==='ddos'){if(v!==true)return null;rules[k]=true;}
    else if(k==='anchors'){if(!I(v,1,5))return null;rules[k]=v;}
    else if(k==='banCities'){if(!Array.isArray(v)||v.length>6||!v.every(isCity)||v.includes(j.city))return null;rules[k]=v.slice();}
    else{if(!Array.isArray(v)||v.length<1||v.length>40||!v.every(wsPairOk))return null;rules[k]=v.slice();}}
  const mods=j.mods==null?[]:j.mods;if(!Array.isArray(mods)||mods.length>2||new Set(mods).size!==mods.length||!mods.every(m=>WEEK_MODS.some(x=>x.id===m)))return null;
  const goal=wsGoal(j.goal);if(!goal)return null;
  // A city the goal needs is never one the rules ban.
  if(rules.banCities&&Object.values(goal.p).flat().some(c=>rules.banCities.includes(c)))return null;
  if(goal.t==='event'&&goal.p.day+goal.p.dur>=j.days||goal.t==='floods'&&!rules.ddos)return null;
  const name=wsLab(j.name,T.names),desc=wsLab(j.desc,T.descs);if(!name||!desc)return null;
  const o={v:WS_V,key,theme:j.theme,city:j.city,cash:j.cash,days:j.days,lvl:j.lvl,rules,mods:mods.slice(),goal,name,desc,seed:j.seed,par:j.par};if(j.rev)o.rev=j.rev;return o;}
// ---------- fetching it: when the Scenarios list opens, never on page load ----------
function wsEnsure(){const key=pzWeekKey(new Date()),w=UI.wsWk;
  if(w&&w.key===key&&(w.st!=='fb'||Date.now()-w.at<5*60e3))return;
  const st=UI.wsWk={key,st:w&&w.key===key&&w.def?'ok':'load',def:w&&w.key===key?w.def:null,at:Date.now()};
  let done=false;const fin=def=>{if(done)return;done=true;clearTimeout(to);if(UI.wsWk!==st)return;if(def){st.def=def;st.st='ok';}else if(!st.def)st.st='fb';st.at=Date.now();wsRefresh();};
  const ac=window.AbortController?new AbortController():null,to=setTimeout(()=>{if(ac)ac.abort();fin(null);},5000);
  if(!window.fetch||location.protocol==='file:'){fin(null);return;}
  try{fetch(`scenarios/weekly/${key}.json`,ac?{signal:ac.signal}:{}).then(r=>r.ok?r.json():null).then(j=>wsValid(j,key),()=>null).then(fin,()=>fin(null));}catch(e){fin(null);}}
const wsDef=()=>{const key=pzWeekKey(new Date()),w=UI.wsWk;return w&&w.key===key&&w.def?w.def:null;};
const wsLoading=()=>{const w=UI.wsWk;return !!w&&w.st==='load'&&w.key===pzWeekKey(new Date());};
function wsRefresh(){const el=$('wsRow');if(el)el.outerHTML=wsRow();}
// ---------- the player's record: started weeks (for the badge), wins and the streak ----------
function wsLoad(){let j=null;try{j=JSON.parse(localStorage.getItem('sot-wkscn')||'null');}catch(e){}const o={go:{},w:{},streak:{last:null,n:0,best:0}};if(!pzObj(j))return o;
  const K=/^\d{4}-W\d{2}$/;if(pzObj(j.go))for(const k in j.go)if(K.test(k))o.go[k]=1;
  if(pzObj(j.w))for(const k in j.w){const x=j.w[k];if(K.test(k)&&pzObj(x)&&Number.isInteger(x.d)&&x.d>0)o.w[k]={d:x.d,rv:Number.isInteger(x.rv)?x.rv:1};}
  const s=j.streak;if(pzObj(s)){o.streak.last=typeof s.last==='string'&&K.test(s.last)?s.last:null;for(const k of ['n','best'])o.streak[k]=Number.isInteger(s[k])&&s[k]>=0?s[k]:0;}return o;}
const wsStore=o=>{try{localStorage.setItem('sot-wkscn',JSON.stringify(o));}catch(e){}};
// A win counts for its revision: when a week is regenerated (rev), last week's result for it no longer shows.
const wsWin=(o,d)=>{const x=d&&o.w[d.key];return x&&x.rv===(d.rev||1)?x:null;};
function wsNew(){try{return !wsLoad().go[pzWeekKey(new Date())];}catch(e){return false;}}
const wsStreak=(o,key)=>{const s=o.streak;return s.last===key||s.last===pzPrevKey(key)?s.n:0;};
// ---------- playing it ----------
function wsBegin(j,nm){const d=wsValid(j,j&&j.key);if(!d)return false;const G=WS_GOALS[d.goal.t];
  const o=wsLoad();o.go[d.key]=1;wsStore(o);
  beginGame(nm||UI.nm||(S&&S.name)||randomNetworkName(),d.city,{seed:d.seed,scn:{id:'weekly',key:d.key,n:wsTxt(d.name),days:d.days,cash:d.cash,rules:JSON.parse(JSON.stringify(d.rules)),
    mods:d.mods.map(m=>WEEK_MODS.find(x=>x.id===m)),goal:wsGoalTxt(d),setup:()=>{S.scn.wk=d;S.scn.home=d.city;S.scn.run=0;S.lvl=Math.max(S.lvl||1,d.lvl);if(G.setup)G.setup(d.goal.p);}}});
  return true;}
const wsOk=()=>{const sc=S&&S.scn;if(!sc||!sc.wk)return false;const G=sc.wk.goal;try{return !!WS_GOALS[G.t].ok(G.p);}catch(e){return false;}};
const wsMeasure=()=>{const G=S.scn.wk.goal;try{return +WS_GOALS[G.t].m(G.p)||0;}catch(e){return 0;}};
function wsShareText(){const sc=S.scn,d=sc.wk;return tr('wkscn.share_line',{key:sc.key,name:wsTxt(d.name),d:sc.done,par:d.par});}
// Called by scnTick once a day for a published weekly scenario.
function wsTick(d){const sc=S.scn,w=sc.wk,G=WS_GOALS[w.goal.t];
  if(G.daily){let on=false;try{on=!!G.daily(w.goal.p);}catch(e){}sc.run=on?(sc.run|0)+1:0;}
  if(wsOk()){sc.done=d;const o=wsLoad(),x=wsWin(o,w);if(!x||x.d>d)o.w[w.key]={d,rv:w.rev||1};const s=o.streak;if(s.last!==w.key){s.n=s.last===pzPrevKey(w.key)?s.n+1:1;s.last=w.key;s.best=Math.max(s.best,s.n);}wsStore(o);track('wkscn_won');
    openModal(`<div class="eyebrow">${T_WS(w)} ${tr('wkscn.weekly_scenario_key',{key:esc(w.key)})}</div><h2 style="font-size:30px">${tr('wkscn.won_on_day_d',{d})}</h2><p class="tagline">${esc(wsGoalTxt(w))}. ${d<=w.par?tr('wkscn.under_par_par',{par:w.par}):tr('wkscn.par_was_day_par',{par:w.par})}</p><p class="meta">${esc(wsShareText())}</p><div class="btns">${btn(tr('wkscn.copy_my_result'),'wsShare',{},'pink big')}${btn(tr('common.keep_playing'),'closeModal',{},'ghost big')}</div>`);sfx('coin');}
  else if(d>=sc.days){sc.failed=d;openModal(`<div class="eyebrow">${tr('common.scenario_over')}</div><h2 style="font-size:30px">${tr('common.time_s_up')}</h2><p class="tagline">${tr('scenario_progress.goal_was_not_reached_in_d',{goal:esc(wsGoalTxt(w)),d:sc.days})}</p><div class="btns">${btn(tr('common.try_again'),'startWeekly',{},'pink big')}${btn(tr('common.keep_playing'),'closeModal',{},'ghost big')}</div>`);}}
const T_WS=w=>(WS_THEMES[w.theme]||{}).i||'📅';
// The top row of the Scenarios list.
function wsRow(){const d=wsDef(),o=wsLoad(),key=pzWeekKey(new Date()),st=wsStreak(o,key),badge=o.go[key]?'':` <span class="pznew">${tr('puzzles.new_this_sunday')}</span>`,cd=`<div class="meta pzcd">⏳ ${wsNext(Date.now())}</div>`;
  if(!d){const wk=weekly();let best=null;try{best=JSON.parse(localStorage.getItem('sot-weekly')||'{}')[wk.key];}catch(e){}
    return `<div class="scn wk" id="wsRow"><div class="grow"><div class="eyebrow">📅 ${tr('wkscn.weekly_scenario_key',{key:esc(wk.key)})}${badge}</div><div class="nm">${wsLoading()?tr('wkscn.loading_this_week_s_scenario'):tr('features.weekly_challenge_key',{key:esc(wk.key)})}</div><div class="meta">${tr('scenario_progress.start_in_city_mods_one_year',{city:esc(CITY[wk.city].name),mods:wk.mods.map(m=>esc(m.n)).join(' · ')})}${best?' '+tr('scenario_progress.your_best_best',{best:fmtG(best)}):''}</div>${cd}</div>${btn(tr('common.play'),'startWeekly',{},'pink',wsLoading())}</div>`;}
  const x=wsWin(o,d),mods=d.mods.map(m=>esc(WEEK_MODS.find(y=>y.id===m).n));
  return `<div class="scn wk" id="wsRow"><div class="grow"><div class="eyebrow">📅 ${tr('wkscn.weekly_scenario_key',{key:esc(d.key)})}${badge}</div>
  <div class="nm">${T_WS(d)} ${esc(wsTxt(d.name))} ${x?`<span class="tag open">${tr('wkscn.won_day_d_par_par',{d:x.d,par:d.par})}</span>`:''}</div><div class="meta">${esc(wsTxt(d.desc))}</div>
  <div class="meta">🎯 ${esc(wsGoalTxt(d))}</div><div class="meta">${tr('wkscn.start_in_city_d_days_cash',{city:esc(CITY[d.city].name),d:d.days,cash:fmt$(d.cash)})}${mods.length?' · '+mods.join(' · '):''} · ${tr('wkscn.par_day_par',{par:d.par})}</div>
  <div class="meta">${tr('wkscn.same_scenario_for_everyone_this_week')}${st?' · 🔥 '+trn('puzzles.n_week_streak',st):''}</div>${cd}</div>${btn(tr('common.play'),'startWeekly',{},x?'ghost':'pink')}</div>`;}
function wsNext(now){const key=pzWeekKey(now),t=pzWeekStart(pzKeyAdd(key,1))-now,m=Math.max(1,Math.ceil(t/60e3)),d=Math.floor(m/1440),h=Math.floor(m%1440/60);
  return d?tr('wkscn.next_weekly_in_d_h',{d,h}):tr('wkscn.next_weekly_in_h_m',{h,m:m%60});}
