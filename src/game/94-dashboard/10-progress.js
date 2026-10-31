/* ---------- scenario and level progress (#34) ---------- */
// Red Sea Crisis (#113): traffic your links carry into and out of Asia, and how long it has stayed above the goal.
const RS_G=80,RS_DAYS=30,asiaG=()=>S.links.reduce((a,l)=>a+((CITY[l.a].reg==='AS')!==(CITY[l.b].reg==='AS')?(R.load[l.id]||0):0),0);
const pSrv=g=>({l:tr('common.traffic_served'),v:R.served,max:g,txt:`${fmtG(R.served)} / ${fmtG(g)}`});
const pReach=()=>({l:tr('common.reach'),v:R.reach,max:0.99,txt:`${pct(R.reach)} / 99%`});
const pChk=(l,ok)=>({l,v:ok?1:0,max:1,txt:ok?'✓':'—'});
const SCN_PROG={stg:()=>[{l:tr('common.reach'),v:R.reach,max:0.5,txt:`${pct(R.reach)} / 50%`},pSrv(300)],redsea:()=>{const g=asiaG(),n=S.stats.asiaRun||0;return [pChk(tr('progress.a_path_from_marseille_to_singapore'),pathExists('mrs','sin')),{l:tr('progress.your_traffic_to_and_from_asia'),v:Math.min(g,RS_G),max:RS_G,txt:`${fmtG(g)} / ${fmtG(RS_G)}`},{l:tr('progress.days_in_a_row_at_g',{g:fmtG(RS_G)}),v:n,max:RS_DAYS,txt:`${n} / ${RS_DAYS}`}];},spat:()=>[pReach(),pSrv(150)],
  carnaval:()=>[pChk(tr('progress.carnaval_delivered_in_full'),(S.stats.evFull||0)>=1)],ixbr:()=>{const n=brIxN();return [{l:tr('progress.ix_brrr_ports_on_your_backbone'),v:n,max:15,txt:`${n} / 15`},pChk(tr('progress.a_port_on_ix_brrr_manaus'),S.ixp.mao!==undefined),pSrv(200)];},
  c2c:()=>[pChk(tr('progress.a_path_from_cape_town_to'),pathExists('cpt','cai')),...['lag','nbo'].map(c=>pChk(tr('progress.city_on_your_network',{city:CITY[c].name}),pathExists('cpt',c))),pSrv(150)],
  pac:()=>[pChk(tr('progress.1_6t_on_every_hop_from'),fastPath('lax','syd',1600)),pChk(tr('progress.a_path_from_los_angeles_to'),pathExists('lax','tok')),pSrv(150)],
  atl:()=>[pChk(tr('progress.1_6t_on_every_hop_from_a90b'),fastPath('mia','mad',1600)),pChk(tr('progress.1_6t_on_every_hop_from_da01'),fastPath('lis','lag',1600)),pSrv(100)],
  darien:()=>[...['bog','lim','scl','sao'].map(c=>pChk(tr('progress.city_on_your_network',{city:CITY[c].name}),pathExists('pan',c))),pSrv(150)],
  gangnam:()=>{const sf=S.pops.icn?sfOf(R,'icn'):0,pr=R.revMo-R.costMo;return [pReach(),pSrv(GN_G),{l:tr('progress.seoul_served_well'),v:sf,max:GN_Q,txt:`${pct(sf)} / ${pct(GN_Q)}`},{l:tr('progress.monthly_profit'),v:R.costMo>0?Math.min(1,R.revMo/R.costMo):1,max:1,txt:fmt$(Math.round(pr))}];},
  fttb:()=>[...AU_BB.map(c=>pChk(tr('progress.broadband_in_city',{city:CITY[c].name}),!!(S.pops[c]&&S.pops[c].bb))),{l:tr('common.cables_overseas'),v:Math.min(2,auExits()),max:2,txt:`${auExits()} / 2`},pSrv(FTTB_G)],
  flood:()=>{const ok=S.stats.ddosOk||0,big=S.stats.ddosOkBig||0,attacks=ddosAll();
    return [{l:tr('common.floods_held'),v:ok,max:20,txt:`${ok} / 20`},{l:tr('progress.terabit_floods_held'),v:big,max:5,txt:`${big} / 5`},{l:tr('progress.floods_that_got_through'),v:0,max:0,txt:String(S.stats.ddosLost||0)}].concat(attacks.map(a=>({l:tr('progress.under_attack_now'),v:0,max:0,txt:`${fmtG(a.gbps)} · ${CITY[a.city].name} · ${pct(a.worst===undefined?1:a.worst)}`})));},baltic:()=>[{l:tr('progress.days_in_a_row_with_99'),v:S.stats.clean||0,max:90,txt:tr('progress.n_of_m',{n:S.stats.clean||0,m:90})}]};
function scnProg(){const sc=S&&S.scn;if(!sc)return null;
  if(sc.wk){const G=sc.wk.goal;let items=[];try{items=WS_GOALS[G.t].prog(G.p);}catch(e){}const meas=items.filter(x=>x.max);return {goal:wsGoalTxt(sc.wk),items,f:sc.done?1:meas.length?meas.reduce((a,x)=>a+Math.min(1,x.v/x.max),0)/meas.length:0};}
  if(sc.id==='weekly')return {goal:tr('common.serve_as_much_traffic_as_you'),items:[{l:tr('progress.your_score_peak_traffic'),v:0,max:0,txt:fmtG(S.stats.peak||0)}],f:Math.min(1,S.day/sc.days)};
  const def=SCN.find(x=>x.id===sc.id),fn=SCN_PROG[sc.id];if(!def)return null;let items=[];try{items=fn?fn():[];}catch(e){items=[];}
  const meas=items.filter(x=>x.max),f=sc.done?1:meas.length?meas.reduce((a,x)=>a+Math.min(1,x.v/x.max),0)/meas.length:0;return {goal:def.goal,items,f};}
const pRow=x=>`<div class="kv"><span>${esc(x.l)}</span><b>${esc(x.txt)}</b></div>${x.max?`<div class="bar ${x.v>=x.max?'':'warn'}"><i style="width:${Math.min(100,x.max?x.v/x.max*100:0)}%"></i></div>`:''}`;
function scnCard(){const sc=S.scn,P=scnProg();if(!sc||!P)return '';const left=Math.max(0,sc.days-S.day);
  const st=sc.done?`<b style="color:var(--eye)">${tr('progress.done_in_d_days',{d:sc.done})}</b>`:sc.failed?`<b style="color:var(--bad)">${tr('common.time_s_up')}</b>`:tr('common.n_days_left',{n:left});
  return `<div class="pcard"><div class="eyebrow">${tr('common.scenario')} · ${Math.round(P.f*100)}%</div><div class="pt">${esc(sc.name)}</div><div class="meta">🎯 ${esc(P.goal)}</div>${P.items.map(pRow).join('')}<div class="kv"><span>${tr('common.time')}</span><b>${st}</b></div><div class="bar ${!sc.done&&left<sc.days*0.2?'bad':''}"><i style="width:${Math.min(100,S.day/sc.days*100)}%"></i></div></div>`;}
function lvlItems(){const lv=S.lvl||1,pk=S.stats.peak||0,pops=Object.keys(S.pops).length,G=(l,v,max,txt)=>({l,v,max,txt}),q=LV_REQ[lv];if(!q)return [];
  const out=[G(tr('common.peak_traffic'),pk,q.pk,`${fmtG(pk)} / ${fmtG(q.pk)}`),G(tr('common.pops'),pops,q.pops,`${pops} / ${q.pops}`)],rg=lvReg(lv);if(rg)out.push(G(tr('common.continents'),regionsCount(),rg,`${regionsCount()} / ${rg}`));return out;}
// Lost Tier 1 status explains itself where you look for it, not only in a toast you may have missed (#73).
const t1Note=()=>S.won&&!isTier1()?`<p class="why">${tr('progress.not_tier_1_right_now_why',{why:esc(t1Why())})}</p>`:'';
function lvlCard(){const lv=S.lvl||1,nx=LEVELS[lv];
  return `<div class="pcard lv"><div class="eyebrow">${tr('progress.customer_level_lv_of_max',{lv,max:LEVELS.length})}</div><div class="pt">${esc(LEVELS[lv-1].n)}</div><div class="meta"><i>${esc(LEVELS[lv-1].q)}</i></div>${t1Note()}${nx?`<div class="meta">${tr('progress.next_name_unlocks_what',{name:esc(nx.n),what:esc(lc1(nx.unlock))})}</div>${lvlItems().map(pRow).join('')}`:`<div class="meta">${tr('common.every_customer_type_is_unlocked_go')}</div>`}</div>`;}
