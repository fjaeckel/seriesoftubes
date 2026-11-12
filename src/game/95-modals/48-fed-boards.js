/* ---------- MULTIPLAYER: the leaderboards ----------
   One view, three boards, total or growth, the divisions All / Humans / AI as chips in the same view, and every
   slicing dimension of the plan's table as combinable chips; on phones the rest sits behind "More filters", a second
   sheet. The player's own row is pinned whatever is selected, with its rank in the current slice. Computed here from
   the records cached per server (fedSlice), so the boards work offline, "as of" the last fetch. */
const FU_BOARDS=['traffic','pops','pies'],FU_ROWS=100;
const fuQ=()=>UI.fu.q||(UI.fu.q={board:'traffic',measure:'total',division:'all'});
const fuBoardName=b=>b==='traffic'?tr('fedui.traffic_with_players'):b==='pops'?tr('fedui.pops_in_service'):tr('fedui.pies_in_the_sky');
// A board value as players read it: traffic in Gbps (records count Mbps), counts as they are, growth in per cent.
function fuVal(q,v){if(q.measure==='growth')return (v>=0?'+':'')+(v/100).toFixed(1)+'%';return q.board==='traffic'?fmtG(v/1000):String(v);}
// The region the slice counts: one of continent, country or city.
const fuRegion=q=>q.city?{city:q.city}:q.country?{country:q.country}:q.continent?{continent:q.continent}:null;
async function fuBoardsLoad(){const q=fuQ(),ids=q.server?[q.server]:fuSrvIds();
  // Fresh records from every connected joined server, once per opening (a request each; offline the cache stays).
  if(!FU.fetched&&S&&S.fed&&S.fed.on){FU.fetched=1;for(const u of S.fed.servers)if(FED.st[u]&&FED.st[u].state==='connected')fedBoardFetch(u).catch(()=>null);}
  const d=await fedBoardData(ids.length?ids:null);FU.bd=d;FU.boardAt=d.at;
  FU.slice=fedSlice(fuSliceQ(q),d);}
// Active filters beyond board, measure and division: each a chip that removes itself.
function fuActive(q){const a=[],cc=c=>esc(pieLicCountry(c));
  if(q.model!=null)a.push(['model',tr('fedui.model_x',{x:esc(q.model)})]);if(q.harness!=null)a.push(['harness',tr('fedui.harness_x',{x:esc(q.harness)})]);
  if(q.continent)a.push(['continent',esc(REG[q.continent]||q.continent)]);if(q.country)a.push(['country',cc(q.country)]);if(q.city)a.push(['city',esc(CITY[q.city]?CITY[q.city].name:q.city)]);
  if(q.home)a.push(['home',tr('fedui.home_market_x',{x:cc(q.home)})]);if(q.from)a.push(['from',tr('fedui.players_from_x',{x:cc(q.from)})]);
  if(q.age)a.push(['age',fuAgeName(q.age)]);if(q.gday)a.push(['gday',fuDayName(q.gday)]);
  if(q.tier1!=null)a.push(['tier1',q.tier1?tr('fedui.tier_1_only'):tr('fedui.not_tier_1')]);if(q.policy)a.push(['policy',fuPolName(q.policy)]);
  if(q.peers)a.push(['peers',tr('fedui.peers_with_me')]);if(q.server)a.push(['server',tr('fedui.as_seen_from_server',{server:fuSrvName(q.server)})]);
  return a;}
const FU_AGES={new:[0,6],month:[7,30],season:[31,90],old:[91,null]},FU_GDAYS={early:[0,364],mid:[365,999],late:[1000,null]};
const fuAgeName=k=>({new:tr('fedui.joined_this_week'),month:tr('fedui.joined_7_to_30_days_ago'),season:tr('fedui.joined_1_to_3_months_ago'),old:tr('fedui.joined_over_3_months_ago')}[k]||'');
const fuDayName=k=>({early:tr('fedui.game_year_1'),mid:tr('fedui.game_days_365_to_999'),late:tr('fedui.game_day_1000_and_later')}[k]||'');
const fuPolName=p=>({open:tr('fedui.peering_open'),selective:tr('fedui.peering_selective'),restrictive:tr('fedui.peering_restrictive')}[p]||'');
// The query fedSlice takes, from the choices on screen.
function fuSliceQ(q){const o={board:q.board,measure:q.measure,division:q.division};
  for(const k of ['model','harness','home','from','tier1','policy','server'])if(q[k]!=null&&q[k]!=='')o[k]=q[k];if(q.peers)o.peers=true;
  if(q.age&&FU_AGES[q.age]){o.ageMin=FU_AGES[q.age][0];if(FU_AGES[q.age][1]!=null)o.ageMax=FU_AGES[q.age][1];}
  if(q.gday&&FU_GDAYS[q.gday]){o.dayMin=FU_GDAYS[q.gday][0];if(FU_GDAYS[q.gday][1]!=null)o.dayMax=FU_GDAYS[q.gday][1];}
  o.region=fuRegion(q);return o;}
const fuChip=(label,act,args,on,cls='')=>`<button class="fu-chip${on?' on':''} ${cls}" data-act="${act}" data-args="${esc(JSON.stringify(args))}" aria-pressed="${!!on}">${label}</button>`;
function fuRow(r,q,me){const a=FU.nets.get(r.key),asn=a&&a.rec?a.rec.body.asn:null;
  return `<li class="fu-row${me?' fu-me':''}"><span class="fu-rank">${r.rank?'#'+r.rank:'—'}</span><span class="fu-nm">${me?`<b>${esc(S?S.name:'')}</b> <span class="fu-tag on">${tr('fedui.you')}</span>`:`<button class="lnk" data-act="fuOpen" data-args="${esc(JSON.stringify({v:'net',key:r.key,back:'boards'}))}">${fuName(r.key)}</button>`}${r.ai?' '+fuAi():''}${asn&&!me?` <span class="meta">AS${asn}</span>`:''}</span><span class="fu-v num">${fuVal(q,r.value)}</span></li>`;}
function fuBoardsHtml(){const q=fuQ(),sl=FU.slice,st=fedStatus(),act=fuActive(q);
  let h=fuHead('🏆 '+tr('fedui.leaderboards'),fuBoardName(q.board),{v:'home'});
  // Board, measure and division: one scrollable chip row; then the filters in use and "More filters".
  h+=`<div class="fu-chips" role="group" aria-label="${tr('fedui.board')}">${FU_BOARDS.map(b=>fuChip(fuBoardName(b),'fuQ',{k:'board',v:b},q.board===b)).join('')}</div>`;
  h+=`<div class="fu-chips">${fuChip(tr('fedui.total'),'fuQ',{k:'measure',v:'total'},q.measure==='total')}${fuChip(tr('fedui.growth'),'fuQ',{k:'measure',v:'growth'},q.measure==='growth')}<span class="fu-sep" aria-hidden="true"></span>${[['all',tr('fedui.all')],['human',tr('fedui.humans')],['ai','🤖 '+tr('fedui.ai')]].map(([k,l])=>fuChip(l,'fuQ',{k:'division',v:k},q.division===k)).join('')}</div>`;
  h+=`<div class="fu-chips">${act.map(([k,l])=>fuChip(l+' ×','fuQ',{k,v:null},true,'act')).join('')}${fuChip('⚙️ '+tr('fedui.more_filters'),'fuOpen',{v:'filters'},false,'more')}</div>`;
  h+=`<p class="meta fu-seen">${q.server?tr('fedui.as_seen_from_server',{server:fuSrvName(q.server)}):tr('fedui.all_your_servers_merged')}${st.state!=='connected'&&FU.boardAt?' · '+tr('fedui.as_of_time',{time:fuWhen(FU.boardAt)}):''}</p>`;
  if(q.measure==='growth')h+=`<p class="meta">${tr('fedui.growth_needs_two_days_of_records')}</p>`;
  if(!sl)return h+`<p class="meta">${tr('fedui.loading')}</p>`;
  if(sl.me)h+=`<ol class="fu-board pinned">${fuRow(sl.me,q,true)}</ol>${sl.me.rank?'':`<p class="meta">${tr('fedui.you_are_not_in_this_slice')}</p>`}`;
  const rows=sl.rows.filter(r=>!sl.me||r.key!==sl.me.key).slice(0,FU_ROWS);
  h+=rows.length?`<ol class="fu-board">${rows.map(r=>fuRow(r,q,false)).join('')}</ol>`:`<p class="note">${tr('fedui.no_one_on_this_board_yet')}</p>`;
  if(sl.rows.length>FU_ROWS)h+=`<p class="meta">${tr('fedui.top_n_of_m',{n:FU_ROWS,m:sl.rows.length})}</p>`;
  return h;}
/* The second sheet: every other dimension. Values offered are the ones the cached records carry. */
function fuFiltersHtml(){const q=fuQ(),d=FU.bd||{records:[],announces:new Map()},recs=d.records,anns=[...d.announces.values()];
  const uniq=a=>[...new Set(a.filter(x=>x!=null&&x!==''))].sort();
  const sel=(k,label,vals,name,cur)=>`<div class="setline fu-sel"><label for="fuF_${k}">${label}</label><select class="pick" id="fuF_${k}" data-chg="fuFilt" data-args="${esc(JSON.stringify({k}))}"><option value="">${tr('fedui.any')}</option>${vals.map(v=>`<option value="${esc(v)}"${String(cur)===String(v)?' selected':''}>${name(v)}</option>`).join('')}</select></div>`;
  const chips=(k,opts)=>`<div class="fu-chips wrap">${fuChip(tr('fedui.any'),'fuQ',{k,v:null},q[k]==null)}${opts.map(([v,l])=>fuChip(l,'fuQ',{k,v},q[k]===v)).join('')}</div>`;
  const ai=recs.map(r=>r.body.ai).filter(Boolean),ccs=uniq(CITIES.filter(c=>!q.continent||c.reg===q.continent).map(c=>c.cc));
  const cities=q.country||q.continent?CITIES.filter(c=>q.country?c.cc===q.country:c.reg===q.continent):[];
  const srvs=fuSrvIds();
  let h=fuHead('🏆 '+tr('fedui.leaderboards'),tr('fedui.more_filters'),{v:'boards'});
  h+=`<h3 class="sub4">${tr('fedui.ai_setup')}</h3>${sel('model',tr('fedui.model'),uniq(ai.map(x=>x.model)),esc,q.model)}${sel('harness',tr('fedui.harness'),uniq(ai.map(x=>x.harness)),esc,q.harness)}`;
  h+=`<h3 class="sub4">${tr('fedui.region')}</h3><p class="meta">${tr('fedui.a_region_counts_only_what_is')}</p>${sel('continent',tr('fedui.continent'),Object.keys(REG),v=>esc(REG[v]),q.continent)}${sel('country',tr('fedui.country'),ccs,v=>esc(pieLicCountry(v)),q.country)}${cities.length?sel('city',tr('fedui.city'),cities.map(c=>c.id),v=>esc(CITY[v].name),q.city):''}`;
  h+=`<h3 class="sub4">${tr('fedui.where_from')}</h3>${sel('home',tr('fedui.home_market'),uniq(anns.map(a=>a.body.home)),v=>esc(pieLicCountry(v)),q.home)}${sel('from',tr('fedui.players_from'),uniq(recs.map(r=>r.cc)),v=>esc(pieLicCountry(v)),q.from)}<p class="meta">${tr('fedui.players_from_is_the_real_country')}</p>`;
  h+=`<h3 class="sub4">${tr('fedui.network_age')}</h3>${chips('age',Object.keys(FU_AGES).map(k=>[k,fuAgeName(k)]))}${chips('gday',Object.keys(FU_GDAYS).map(k=>[k,fuDayName(k)]))}`;
  h+=`<h3 class="sub4">${tr('fedui.tier_1')}</h3>${chips('tier1',[[true,tr('fedui.tier_1_only')],[false,tr('fedui.not_tier_1')]])}`;
  h+=`<h3 class="sub4">${tr('fedui.peering_policy')}</h3>${chips('policy',['open','selective','restrictive'].map(p=>[p,fuPolName(p)]))}`;
  h+=`<h3 class="sub4">${tr('fedui.peers_with_me')}</h3>${chips('peers',[[true,tr('fedui.only_networks_i_have_a_deal')]])}`;
  if(srvs.length>1)h+=`<h3 class="sub4">${tr('fedui.server')}</h3><div class="fu-chips wrap">${fuChip(tr('fedui.all_your_servers_merged'),'fuQ',{k:'server',v:null},!q.server)}${srvs.map(id=>fuChip(fuSrvName(id),'fuQ',{k:'server',v:id},q.server===id)).join('')}</div>`;
  h+=`<div class="btns cta">${btn(fuShowN(),'fuOpen',{v:'boards'},'pink')}</div>`;
  return h;}
const fuShowN=()=>FU.slice?trn('fedui.show_n_networks',FU.slice.rows.length):tr('fedui.show_the_board');
