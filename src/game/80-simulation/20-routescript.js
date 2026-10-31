/* ---------- RouteScript: a tiny, safe rule language for the Auto-TE controller ----------
   Player scripts are parsed into plain data and never executed, so a shared or imported
   save can't run code. One rule per line, # for comments. */
const TE_KINDS={pni:'p',ix:'ix',transit:'t'};
const TE_EXAMPLE=`# RouteScript for your Auto-TE controller. One rule per line.
# Keep Cogentle at its 20 Gbps commit; overflow goes elsewhere
cap transit cogentle at 20 gbps
# Goggle should come over peering, not transit
avoid transit for goggle
# Move traffic before links are completely full
spill at 85%
# Local-pref: use the cheap upstream first, the pricey one last
# prefer transit cogentle
# avoid transit level tree
# AS-path prepending: ask the world to send less via one upstream (a hint, not an order)
# prepend transit drizzle electric 2
# Business customers first when links are congested; home users get what is left
# protect customers
# Maintenance window? Drain a POP's exits, or steer around a link
# drain paris
# avoid link frankfurt-amsterdam
# Under DDoS: drop the junk at the edge (takes some real traffic with it)
# blackhole ddos`;
function lev(a,b){const m=a.length,n=b.length,d=Array.from({length:m+1},(_,i)=>[i]);for(let j=1;j<=n;j++)d[0][j]=j;for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return d[m][n];}
function teFind(word,list,label){const w=slug(word);if(!w)return {err:tr('routescript.missing_what',{what:label})};
  for(const x of list)if(x.id===w||slug(x.name)===w)return {v:x.id};
  const pre=list.filter(x=>w.length>=3&&slug(x.name).startsWith(w));if(pre.length===1)return {v:pre[0].id};
  const best=list.map(x=>({x,d:Math.min(lev(w,slug(x.name)),lev(w,x.id))})).sort((a,b)=>a.d-b.d)[0];
  return {err:tr('routescript.unknown_what_word',{what:label,word})+(best&&best.d<=3?tr('routescript.did_you_mean_name',{name:best.x.name}):'')};}
function teParse(src){const out={spill:null,cap:{},net:{},up:{},prep:{},protect:false,drain:new Set(),avoid:new Set(),blackhole:false,errors:[],n:0};
  const lines=String(src||'').split('\n').slice(0,60);
  lines.forEach((raw,i)=>{const line=raw.replace(/#.*/,'').trim().toLowerCase();if(!line)return;const L=i+1;let m;
    if(m=line.match(/^spill\s+at\s+(\d{1,3})\s*%$/)){const v=+m[1];if(v<20||v>100)out.errors.push(tr('routescript.line_n_spill_must_be_between',{n:L}));else{out.spill=v/100;out.n++;}return;}
    if(m=line.match(/^(prefer|avoid)\s+(pni|ix|transit)\s+for\s+(.+)$/)){const r=teFind(m[3],NETS,tr('common.network'));if(r.err){out.errors.push(tr('routescript.line_n_err',{n:L,err:r.err}));return;}const o=out.net[r.v]=out.net[r.v]||{};o[m[1]]=TE_KINDS[m[2]];out.n++;return;}
    if(m=line.match(/^cap\s+transit\s+(.+?)\s+at\s+(\d+(?:\.\d+)?)\s*(gbps|tbps|g|t)$/)){const r=teFind(m[1],NETS.filter(n=>n.price),tr('common.transit_provider'));if(r.err){out.errors.push(tr('routescript.line_n_err',{n:L,err:r.err}));return;}out.cap[r.v]=+m[2]*(m[3][0]==='t'?1000:1);out.n++;return;}
    if(m=line.match(/^(prefer|avoid)\s+transit\s+(?!for\s)(.+)$/)){const r=teFind(m[2],NETS.filter(n=>n.price),tr('common.transit_provider'));if(r.err){out.errors.push(tr('routescript.line_n_err',{n:L,err:r.err}));return;}out.up[r.v]=m[1];out.n++;return;}
    if(m=line.match(/^prepend\s+transit\s+(.+?)\s+(\d+)$/)){const v=+m[2];if(v<1||v>3){out.errors.push(tr('routescript.line_n_prepend_1_to_3',{n:L}));return;}const r=teFind(m[1],NETS.filter(n=>n.price),tr('common.transit_provider'));if(r.err){out.errors.push(tr('routescript.line_n_err',{n:L,err:r.err}));return;}out.prep[r.v]=v;out.n++;return;}
    if(line==='protect customers'){out.protect=true;out.n++;return;}
    if(m=line.match(/^drain\s+(.+)$/)){const r=teFind(m[1],CITIES,tr('common.city'));if(r.err){out.errors.push(tr('routescript.line_n_err',{n:L,err:r.err}));return;}out.drain.add(r.v);out.n++;return;}
    if(m=line.match(/^avoid\s+link\s+(.+?)\s*(?:-|\bto\b|→)\s*(.+)$/)){const a=teFind(m[1],CITIES,tr('common.city')),b=teFind(m[2],CITIES,tr('common.city'));if(a.err||b.err){out.errors.push(tr('routescript.line_n_err',{n:L,err:a.err||b.err}));return;}out.avoid.add(a.v<b.v?a.v+'|'+b.v:b.v+'|'+a.v);out.n++;return;}
    if(line==='blackhole ddos'){out.blackhole=true;out.n++;return;}
    out.errors.push(tr('routescript.line_n_i_don_t_understand',{n:L,text:raw.trim().slice(0,40)}));});
  return out;}
// Share of an upstream's traffic that moves away for each prepend: prepending is a hint, not an order.
const PREPEND_F=[0,0.35,0.6,0.75];
function teOptimize(){const L=[tr('routescript.suggested_by_the_optimizer_from_live'),'spill at 85%'];
  // Protecting customers costs a second routing pass: only worth it where IP customers would get unhappy (under 95% served).
  if(S.biz.some(b=>!BIZ_T[b.type].l2&&!BIZ_T[b.type].fiber&&!BIZ_T[b.type].event&&sfOf(R,b.city)<0.95))L.push('protect customers');
  const ups=[...new Set(S.transit.map(t=>t.net))].map(n=>({n,p:Math.min(...S.transit.filter(t=>t.net===n).map(t=>NET[n].price*netMult(NET[n],t.city)))})).sort((a,b)=>a.p-b.p);
  if(ups.length>1){L.push('prefer transit '+NET[ups[0].n].name.toLowerCase());L.push('avoid transit '+NET[ups[ups.length-1].n].name.toLowerCase());}
  const tips=[];
  for(const n of NETS){const g=(R.netEg[n.id]||{}).t||0;if(g<1)continue;// The exchange where it is a member and you have no port yet, in a city where you have a POP.
    let at=null;for(const c of Object.keys(S.pops)){at=ixIdsIn(c).find(x=>S.ixp[x]===undefined&&ixMembers(x).includes(n.id));if(at)break;}
    if(at){const v={net:n.name,g:fmtG(g),ix:ixName(at),city:CITY[ixCity(at)].name};tips.push([g,ixNamesCity(at)?tr('routescript.net_g_over_transit_but_it',v):tr('routescript.net_g_over_transit_but_it_e707',v)]);}}
  for(const n of NETS){const g=(R.netEg[n.id]||{}).ix||0;if(g>=50&&!S.pni.some(p=>p.net===n.id))tips.push([g,tr('routescript.net_g_over_the_ix_a',{net:n.name,g:fmtG(g)})]);}
  tips.sort((a,b)=>b[0]-a[0]).slice(0,5).forEach(x=>L.push(x[1]));
  return L.join('\n');}
// Ready-made RouteScripts, filled in from the live network. Players load them from the help; the AI button picks them too.
const teUps=()=>[...new Set(S.transit.map(t=>t.net))].map(n=>({n,p:Math.min(...S.transit.filter(t=>t.net===n).map(t=>NET[n].price*netMult(NET[n],t.city)))})).sort((a,b)=>a.p-b.p);
const teNm=n=>NET[n].name.toLowerCase(),teAtk=()=>ddosAll().length>0;
const teSad=()=>S.biz.some(b=>!BIZ_T[b.type].l2&&!BIZ_T[b.type].fiber&&!BIZ_T[b.type].event&&sfOf(R,b.city)<0.95);
const TE_RECIPES=[
 {id:'shield',n:N_('common.shields_up'),d:N_('routescript.for_a_ddos_drop_the_junk'),fit:()=>teAtk()?9:0.3,
  src:()=>[tr('routescript.shields_up_for_the_length_of'),'blackhole ddos','protect customers','spill at 80%']},
 {id:'care',n:N_('common.customer_care'),d:N_('routescript.business_customers_first_when_links'),fit:()=>teSad()?5:0.5,
  src:()=>[tr('routescript.customer_care_the_people_who_pay'),'protect customers','spill at 75%']},
 {id:'peer',n:N_('common.peering_first'),d:N_('routescript.big_networks_you_can_reach_over'),fit:()=>S.pni.length||Object.keys(S.ixp).length?3:0,
  src:()=>{const L=[tr('routescript.peering_first_free_paths_before_paid'),'spill at 85%'],seen=new Set(),ix=new Set(),eg=n=>(R.netEg[n]||{}).t||0;
   for(const p of S.pni)if(!seen.has(p.net)){seen.add(p.net);L.push('prefer pni for '+teNm(p.net));}
   for(const c in S.ixp)for(const n of ixSessions(c))ix.add(n);
   NETS.filter(n=>!seen.has(n.id)&&ix.has(n.id)&&eg(n.id)>=1).sort((a,b)=>eg(b.id)-eg(a.id)).slice(0,4).forEach(n=>L.push('prefer ix for '+teNm(n.id)));
   if(L.length===2)L.push(tr('routescript.nothing_to_move_yet_get_an'));return L.slice(0,12);}},
 {id:'pinch',n:N_('common.penny_pincher'),d:N_('routescript.cheapest_upstream_first_priciest'),fit:()=>teUps().length>1?2+(R.cost.transit||0)/1e5:0,
  src:()=>{const u=teUps(),L=[tr('routescript.penny_pincher_cheapest_upstream'),'spill at 85%'];
   if(u.length>1)L.push('prefer transit '+teNm(u[0].n),'avoid transit '+teNm(u[u.length-1].n));else L.push(tr('routescript.buy_transit_from_a_second_upstream'));return L;}},
 {id:'diet',n:N_('common.prepend_diet'),d:N_('routescript.ask_the_rest_of_the_internet'),fit:()=>teUps().length>1?1.5:0,
  src:()=>{const u=teUps();return [tr('routescript.prepend_diet_a_hint_to_the'),'spill at 85%',...(u.length>1?['prepend transit '+teNm(u[u.length-1].n)+' 2']:[tr('routescript.prepending_needs_two_upstreams_to')])];}},
 {id:'maint',n:N_('common.maintenance_window'),d:N_('routescript.drain_a_pop_and_steer_around'),fit:()=>0.2,
  src:()=>{const l=S.links.find(x=>!linkDown(x)),c=l?CITY[l.a].name.toLowerCase():'paris';return [tr('routescript.maintenance_window_change_the_names'),'drain '+c,...(l?['avoid link '+c+'-'+CITY[l.b].name.toLowerCase()]:[]),'spill at 80%'];}},
 {id:'calm',n:N_('common.keep_calm'),d:N_('routescript.one_rule_move_traffic_before_links'),fit:()=>1,
  src:()=>[tr('routescript.keep_calm_one_rule_hard_to'),'spill at 85%']}];
// The AI button: the two recipes that fit best, merged, with an AI's confidence on top.
const AI_NAMES=['Large Latency Model','Stochastic Parrot Pro','Co-Pilot Error','Autocomplete Ultra','Hallucinet 4o','Artificial Ignorance'];
const AI_SAY=[N_('routescript.great_question_here_is_a_production'),N_('routescript.as_a_large_language_model_i'),N_('routescript.i_have_optimised_your_network_you'),N_('routescript.done_i_vibe_checked_your_bgp'),N_('routescript.here_you_go_i_was_trained'),N_('routescript.i_asked_myself_to_review_my')];
function aiSlop(bad){const ai=pick(AI_NAMES),fits=TE_RECIPES.map(r=>({r,f:r.fit()})).filter(x=>x.f>0).sort((a,b)=>b.f-a.f).map(x=>x.r);
  // It really does dry-run its three favourite ideas (and one merge) against live traffic, and keeps the best.
  const merge=rs=>{const L=[],seen=new Set();for(const r of rs)for(const x of r.src()){const k=/^spill/.test(x)?'spill':x;if(!seen.has(k)){seen.add(k);L.push(x);}}return L;};
  const cands=fits.slice(0,3).map(r=>merge([r])).concat([merge(fits.slice(0,2))]),val=x=>x.served*EYE_RATE-x.tc;
  const keep=S.te&&S.te.script,on=S.te&&S.te.on;if(!S.te)S.te={on:false,day:S.day,tmp:1};let best=null,bv=-Infinity;
  for(const L of cands){if(teParse(L.join('\n')).errors.length)continue;S.te.script=L.join('\n');S.te.on=true;compute();const v=val({served:R.served,tc:R.cost.transit||0});if(v>bv){bv=v;best=L;}}
  if(S.te.tmp)delete S.te;else{S.te.script=keep;S.te.on=on;}compute();
  const L=[tr('routescript.written_by_ai_prompt_make_my',{ai})].concat(best||merge([TE_RECIPES.find(r=>r.id==='calm')]));
  // Very occasionally it is just as sure of itself and completely wrong. Nothing says so.
  const u=teUps();if(bad&&u.length)L.splice(2,0,tr('routescript.a_cap_of_0_gbps_means'),...u.map(x=>'cap transit '+teNm(x.n)+' at 0 gbps'));
  L.push(tr('common.confidence_100'));return {src:L.join('\n'),ai,say:pick(AI_SAY)};}
function teHelpModal(){const rule=(code,what)=>`<dt><code>${code}</code></dt><dd>${what}</dd>`;
  openModal(`<div style="display:flex;align-items:center"><div><div class="eyebrow">${tr('routescript.auto_te_controller')}</div><h2 style="font-size:26px">${tr('routescript.how_routescript_works')}</h2></div><button class="x" data-act="teBack" aria-label="${tr('common.close')}">×</button></div>
  <div class="tehelp"><p class="tagline">${tr('routescript.every_gigabit_leaving_your_network')}</p>
  <h3>${tr('routescript.writing_a_script')}</h3><ul>
  <li>${tr('routescript.one_rule_per_line_a_starts')}</li>
  <li>${tr('routescript.networks_providers_and_cities_go_by')}</li>
  <li>${tr('routescript.check_dry_run_replays_today_s')}</li>
  <li>${tr('routescript.deploy_makes_it_live_for_the')}</li></ul>
  <h3>${tr('common.rules')}</h3><dl>
  ${rule('spill at 85%',tr('routescript.move_traffic_to_the_next_exit'))}
  ${rule('prefer pni for goggle',tr('routescript.send_one_network_s_traffic_over'))}
  ${rule('avoid transit for netchill',tr('routescript.use_that_kind_of_exit_for'))}
  ${rule('cap transit cogentle at 20 gbps',tr('routescript.a_ceiling_on_one_provider_so'))}
  ${rule('prefer transit cogentle',tr('routescript.rank_your_upstreams_preferred_ones'))}
  ${rule('prepend transit drizzle electric 2',tr('routescript.as_path_prepending_1_to_3'))}
  ${rule('protect customers',tr('routescript.when_links_are_congested_business'))}
  ${rule('drain paris',tr('routescript.move_traffic_off_a_pop_s'))}
  ${rule('avoid link frankfurt-amsterdam',tr('routescript.steer_traffic_around_one_link_unless'))}
  ${rule('blackhole ddos',tr('routescript.during_an_attack_drop_the_flood'))}
  </dl><h3>${tr('routescript.ready_made_scripts')}</h3><p class="meta">${tr('routescript.filled_in_from_your_network_as')}</p>
  ${TE_RECIPES.map(r=>`<div class="terec"><div><b>${tr(r.n)}</b><div class="meta">${tr(r.d)}</div></div>${btn(tr('common.load'),'teRecipe',{id:r.id},'sm')}</div>`).join('')}</div>
  <div class="btns" style="margin-top:12px">${btn(tr('routescript.back_to_the_editor'),'teBack',{},'big')}</div>`);}
let TE_CACHE={src:null,p:null};
function teRules(){if(!S||!S.te||!S.te.on||!S.te.script||!coreTE())return null;if(TE_CACHE.src!==S.te.script)TE_CACHE={src:S.te.script,p:teParse(S.te.script)};return TE_CACHE.p.errors.length?null:TE_CACHE.p;}
function teModal(msg){const src=UI.teDraft!==undefined?UI.teDraft:(S.te.script||TE_EXAMPLE);
  openModal(`<div style="display:flex;align-items:center"><div><div class="eyebrow">${tr('routescript.auto_te_controller')}</div><h2 style="font-size:26px">RouteScript</h2></div><button class="x" data-act="teClose" aria-label="${tr('common.close')}">×</button></div>
  <p class="tagline">${tr('routescript.write_rules_check_them_against_live')}</p>
  <textarea id="teSrc" class="tecode" spellcheck="false" autocapitalize="off" autocomplete="off" rows="12">${esc(src)}</textarea>
  ${msg||''}<div class="btns" style="margin-top:8px">${btn(tr('routescript.check_dry_run'),'teCheck',{},'')}${btn(tr('common.deploy'),'teDeploy',{},'pink')}${S.te.script?btn(tr('common.remove_script'),'teClear',{},'ghost sm'):''}${btn(tr('common.optimize'),'teOpt',{},'ghost sm')}${btn(tr('routescript.reset_to_example'),'teExample',{},'ghost sm')}</div><div class="btns" style="margin-top:6px">${btn('✨ '+tr('routescript.slop_it_with_ai'),'teSlop',{},'aibtn')}${btn(tr('routescript.help_and_ready_made_scripts'),'teHelp',{},'ghost sm')}</div>
  <p class="meta" style="margin-top:8px"><b>${tr('common.rules_7b18')}</b> <code>spill at 80%</code> · <code>prefer pni|ix|transit for NETWORK</code> · <code>avoid pni|ix|transit for NETWORK</code> · <code>cap transit PROVIDER at 20 gbps</code> · <code>prefer|avoid transit PROVIDER</code> · <code>prepend transit PROVIDER 1-3</code> · <code>protect customers</code> · <code>drain CITY</code> · <code>avoid link CITY-CITY</code> · <code>blackhole ddos</code></p>
  ${S.te.script?`<p class="meta">${tr('routescript.live_state_rules',{state:S.te.on?tr('common.deployed'):tr('routescript.controller_is_off'),rules:teRules()?tr('routescript.n_rules_active',{n:teRules().n}):tr('common.not_active')})}</p>`:''}`);}
function teTrial(src){const keep=S.te.script,on=S.te.on,before={served:R.served,tc:R.cost.transit||0,moved:R.teMoved||0};
  S.te.script=src;S.te.on=true;compute();const after={served:R.served,tc:R.cost.transit||0,moved:R.teMoved||0,bh:R.teBlack||0};
  S.te.script=keep;S.te.on=on;compute();return {before,after};}
