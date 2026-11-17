/* ---------- the DDoS tab ----------
   Attacks under way, each the NOC tab's card with its rows and buttons (ddosOne); the game's totals; then every finished
   attack from S.ddosLog, newest first, filtered by outcome: a card each on a phone, a table row on a wide screen. */
Object.assign(LIST_PG,{ddos:[20,40]});
const ddosLive=()=>S?ddosAll().filter(a=>S.pops[a.city]):[];
// Outcome: its label and tag colour.
const DDO={h:[N_('ddos_dash.o_held'),'open'],s:[N_('ddos_dash.o_sac'),'selective'],l:[N_('ddos_dash.o_lost'),'restrictive']};
const ddoTag=e=>`<span class="tag ${DDO[e.o][1]}">${tr(DDO[e.o][0])}</span>`;
// Who it hit, as a name and what and where.
const ddLogNm=e=>e.t&&BIZ_T[e.t]?esc(e.n||BIZ_T[e.t].l):tr('ddos_dash.subscribers'),ddLogWhat=e=>(e.t&&BIZ_T[e.t]?BIZ_T[e.t].l+' · ':'')+CITY[e.c].name;
// What the target got, and what it cost everyone else when that was anything.
const ddLogRes=e=>e.o==='s'?tr('ddos_dash.target_dark'):tr('ddos_dash.target_got',{p:pct(e.w)})+(e.x>=0.01?' · '+tr('ddos_dash.others_lost',{p:pct(e.x)}):'');
const ddLogHow=e=>[e.bh===2?tr('ddos_dash.tag_auto'):e.bh?'RTBH':'',e.sc?tr('ddos_dash.tag_scrub'):'',e.hk?tr('ddos_dash.tag_hack'):''].filter(Boolean).map(x=>`<span class="tag st">${x}</span>`).join(' ');
function ddosTiles(){const st=S.stats,held=st.ddosHeld||st.ddosOk||0,sac=st.ddosSac||0,lost=st.ddosLost||0,tile=(l,v,sub,bad)=>`<div class="tile"><div class="lbl">${l}</div><div class="val"${bad?' style="color:var(--bad)"':''}>${v}</div>${sub?`<div class="sub">${sub}</div>`:''}</div>`;
  return `<div class="dgrid ddtiles">${tile(tr('ddos_dash.t_attacks'),held+sac+lost,st.ddosMax?tr('ddos_dash.biggest_g',{g:fmtG(st.ddosMax)}):'')}${tile(tr('common.floods_held'),held,st.ddosOkBig?trn('ddos_dash.n_terabit',st.ddosOkBig):'')}${tile(tr('ddos_dash.t_sacrificed'),sac,st.rtbh?trn('ddos_dash.rtbh_used',st.rtbh):'')}${tile(tr('progress.floods_that_got_through'),lost,st.ddosCol?trn('ddos_dash.n_hurt_others',st.ddosCol):'',lost>0)}${st.hackback?tile(tr('ddos_dash.t_hackback'),st.hackback,tr('ddos_dash.n_worked',{n:st.hackWin||0})):''}</div>`;}
function ddosTab(){const live=ddosLive(),L=S.ddosLog||[],F=DDOS_O.includes(UI.ddF)&&L.some(e=>e.o===UI.ddF)?UI.ddF:'',rows=F?L.filter(e=>e.o===F):L,ph=isPhone();
  // The settings open in the game window, like the Ops sheet from the Traffic tab.
  const set=`<div class="btns">${btn(`⚙️ ${tr('routing.routing_and_ddos')}`,'routingOpen',{},'ghost sm')}</div>`;
  let h=`<div class="panel2 ddlive" id="ddosLive" style="margin-top:12px"><h3>${tr('progress.under_attack_now')}</h3>`;
  h+=live.length?live.map(a=>ddosOne(a,true)).join(''):`<p class="empty">${tr('ddos_dash.none_live')}</p>`;
  h+=set+`</div>`+ddosTiles();
  h+=`<div class="panel2" id="ddosSec" style="margin-top:12px"><h3>${tr('ddos_dash.past_attacks')}${L.length?` <span class="meta">${rows.length} / ${L.length}</span>`:''}</h3>`;
  if(!L.length)return h+`<p class="empty">${(S.stats.ddosHeld||S.stats.ddosOk||S.stats.ddosSac||S.stats.ddosLost)?tr('ddos_dash.history_starts'):tr('ddos_dash.never')}</p></div>`;
  const cnt=o=>L.filter(e=>e.o===o).length;
  if(DDOS_O.filter(cnt).length>1)h+=`<div class="seg" style="margin-bottom:6px">${segB(tr('dashboard.all_n',{n:L.length}),'ddosF',{v:''},!F)}${DDOS_O.filter(cnt).map(o=>segB(`${tr(DDO[o][0])} (${cnt(o)})`,'ddosF',{v:o},F===o)).join('')}</div>`;
  const page=rows.slice(0,listN('ddos'));
  if(ph)h+=`<div class="ilist">`+page.map(e=>`<div class="row ddrow"><div class="grow"><div class="nm">${ddLogNm(e)} ${ddoTag(e)}</div><div class="meta">${esc(ddLogWhat(e))}</div><div class="meta"><b>${fmtG(e.g)}</b> ${esc(DDOS_VEC[e.v].n)} · ${dateStr(e.d)}</div><div class="meta">${ddLogRes(e)}</div>${ddLogHow(e)?`<div class="ddhow">${ddLogHow(e)}</div>`:''}</div></div>`).join('')+`</div>`;
  else h+=`<div class="tscroll"><table class="tbl ddtbl"><thead><tr><th>${tr('ddos_dash.h_ended')}</th><th>${tr('ddos_dash.h_target')}</th><th class="r">${tr('ddos_dash.h_size')}</th><th>${tr('ddos_dash.h_vector')}</th><th>${tr('ddos_dash.h_outcome')}</th><th>${tr('ddos_dash.h_result')}</th><th>${tr('ddos_dash.h_how')}</th></tr></thead><tbody>`+
    page.map(e=>`<tr><td class="nw">${dateStr(e.d)}</td><td><b>${ddLogNm(e)}</b> <span class="meta">${esc(ddLogWhat(e))}</span></td><td class="r nw"><b>${fmtG(e.g)}</b></td><td>${esc(DDOS_VEC[e.v].n)}</td><td>${ddoTag(e)}</td><td>${ddLogRes(e)}</td><td><div class="ddhow">${ddLogHow(e)||'—'}</div></td></tr>`).join('')+`</tbody></table></div>`;
  return h+listMore('ddos',rows.length,n=>trn('ddos_dash.n_more',n))+`</div>`;}
