/* ---------- MULTIPLAYER: the leaderboards ----------
   One view: the board picked from a native select (it is the sheet's subtitle), measure and division as two small
   segmented controls, every other slicing dimension behind "More filters", a second sheet. Nothing scrolls sideways.
   The player's own row is highlighted in place, or kept in sight at the bottom of the sheet when it is not shown. The
   servers rank (fedRankView: the top 50 and this network's row); the last answers are kept, so the boards work
   offline, "as of". The sheet may re-render often (live values): morph() keeps its nodes, scroll and focus. */
const FU_BOARDS=['traffic','total','pops','pies','cone'];
// The measures, in the order shown; the first, live "now", is the default.
const FU_MEASURES=['now','total','growth'];
const fuDefQ=()=>({board:'traffic',measure:FU_MEASURES[0],division:'all'});
const fuQ=()=>UI.fu.q||(UI.fu.q=fuDefQ());
const fuBoardName=b=>b==='traffic'?tr('fedui.traffic_with_players'):b==='total'?tr('fedui.total_traffic'):b==='pops'?tr('fedui.pops_in_service'):b==='cone'?tr('fedui.customer_cone'):tr('fedui.pies_in_the_sky');
// Boards whose 24 h measure is the 95th percentile, like transit billing (POPs and Pies count what is there now).
const FU_P95=['traffic','total','cone'];
const fuMeasureName=(m,b)=>m==='now'?tr('fedui.now'):m==='growth'?tr('fedui.growth'):FU_P95.includes(b)?tr('fedui.p95_24_h'):tr('fedui.24_h');
// What a board counts: one label per board (and per measure where it differs), so a rule change is one label.
const fuBoardNote=(b,m)=>(m==='total'&&FU_P95.includes(b)?tr('fedui.p95_over_the_last_24_hours')+' ':'')+(b==='traffic'?tr('fedui.traffic_board_note'):b==='total'?tr('fedui.total_board_note'):b==='cone'?tr('fedui.cone_board_note'):b==='pops'?tr('fedui.pops_board_note'):tr('fedui.pies_board_note'));
/* A board value as players read it: traffic in Mbps below 1 Gbps (records count Mbps; 32 Mbps must not read as
   "0.0 Gbps"), Gbps and up from there, counts as they are, growth in per cent. */
function fuVal(q,v){if(q.measure==='growth')return (v>=0?'+':'')+(v/100).toFixed(1)+'%';return q.board==='traffic'||q.board==='total'?(v<1000?Math.round(v)+' Mbps':fmtG(v/1000)):String(v);}
// The region the slice counts: one of continent, country or city.
const fuRegion=q=>q.city?{city:q.city}:q.country?{country:q.country}:q.continent?{continent:q.continent}:null;
// The joined URLs a view asks: all of them, or those of the one server chosen.
const fuRankUrls=q=>{const f=S&&S.fed;if(!f)return [];return q.server?f.servers.filter(u=>{const s=fuSrvOf(u);return s&&s.id===q.server;}):f.servers.slice();};
// Asks the servers for the slice on screen (and, for the filter sheet, the values it offers). Only the newest ask shows.
// The default slice's answer also feeds the HUD's rank chip.
async function fuBoardsLoad(){const q=fuQ(),v=fuSliceQ(q),n=FU.rankN=(FU.rankN||0)+1,urls=fuRankUrls(q),f=S&&S.fed;
  if(UI.fu&&UI.fu.v==='filters'&&!FU.facets)FU.facets=await fedFacets(urls);
  if(FU.asn==null&&f&&f.key)FU.asn=await fedAsn(f.key.pub).catch(()=>null);
  const sl=await fedRankView(v,urls);if(FU.rankN===n)FU.slice=sl;
  if(fuIsDef(q))fuMyRankSet(sl&&sl.me);
  if(UI.fu&&UI.fu.v==='boards')fuBoardsTick();}
/* The open board refreshes every 30 s, whatever the measure: only while the page is visible and a server connected,
   never two asks at once (a tick with one in flight is skipped), and the sheet re-renders only when the answer changed
   (morph() keeps unchanged rows as they are, with the scroll and the sticky own row). Closing the sheet stops it. */
const FU_BOARD_EVERY=30;
const fuBoardsOpen=()=>!!(UI.fu&&UI.fu.v==='boards'&&fuShown());
async function fuBoardsRefresh(){if(FU.bBusy||!fuBoardsOpen())return;FU.bBusy=true;const was=JSON.stringify(FU.slice);
  try{await fuBoardsLoad();}catch(e){console.error('[tubes] boards refresh',e);}finally{FU.bBusy=false;}
  if(fuBoardsOpen()&&JSON.stringify(FU.slice)!==was)fuRender();}
function fuBoardsTick(){if(FU.bt)return;FU.bt=FED.set(()=>{FU.bt=null;if(!fuBoardsOpen())return;
  if(FED.visible()&&fedStatus().state==='connected')fuBoardsRefresh();fuBoardsTick();},FU_BOARD_EVERY*1000);}
const fuIsDef=q=>JSON.stringify(fuSliceQ(q))===JSON.stringify(fuSliceQ(fuDefQ()));
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
// The view fedRankReq takes, from the choices on screen.
function fuSliceQ(q){const o={board:q.board,measure:q.measure,division:q.division};
  for(const k of ['model','harness','home','from','tier1','policy','server'])if(q[k]!=null&&q[k]!=='')o[k]=q[k];if(q.peers)o.peers=true;
  if(q.age&&FU_AGES[q.age]){o.ageMin=FU_AGES[q.age][0];if(FU_AGES[q.age][1]!=null)o.ageMax=FU_AGES[q.age][1];}
  if(q.gday&&FU_GDAYS[q.gday]){o.dayMin=FU_GDAYS[q.gday][0];if(FU_GDAYS[q.gday][1]!=null)o.dayMax=FU_GDAYS[q.gday][1];}
  o.region=fuRegion(q);return o;}
const fuChip=(label,act,args,on,cls='')=>`<button class="fu-chip${on?' on':''} ${cls}" data-act="${act}" data-args="${esc(JSON.stringify(args))}" aria-pressed="${!!on}">${label}</button>`;
// A small segmented control (Pie Control's .segc, compact): one choice of k from opts [[value,label]].
const fuSeg=(k,opts,cur,aria)=>`<div class="segc fu-seg" role="group" aria-label="${aria}">${opts.map(([v,l])=>`<button class="${cur===v?'on':''}" data-act="fuQ" data-args="${esc(JSON.stringify({k,v}))}" aria-pressed="${cur===v}">${l}</button>`).join('')}</div>`;
// A row's name: as this browser knows the network, else as the server sent it (hidden names come without one).
const fuRowName=r=>FU.nets.has(r.key)?fuName(r.key):r.name?esc(fedSafeName(r.name)):'AS'+r.asn;
// Rank, the name over a small line (AS, home country, robot), and the value in a fixed right-hand column.
function fuRow(r,q,me){const sub=(r.ai?fuAi()+' ':'')+[r.asn?'AS'+r.asn:'',r.home?esc(pieLicCountry(r.home)):''].filter(Boolean).join(' · ');
  const who=me?`<div class="fu-who"><b class="fu-nm">${esc(S?S.name:'')}</b><span class="fu-sub"><span class="fu-tag on">${tr('fedui.you')}</span> ${sub}</span></div>`
    :`<button class="fu-who" data-act="fuOpen" data-args="${esc(JSON.stringify({v:'net',key:r.key,back:'boards'}))}"><b class="fu-nm">${fuRowName(r)}</b><span class="fu-sub">${sub}</span></button>`;
  return `<li class="fu-row${me?' fu-me':''}${r.rank&&r.rank<=3?' top'+r.rank:''}"><span class="fu-rank num">${r.rank||'—'}</span>${who}<span class="fu-v num">${fuVal(q,r.value)}</span></li>`;}
function fuBoardsHtml(){const q=fuQ(),sl=FU.slice,act=fuActive(q),nf=act.length,open=!!UI.fu.note;
  let h=fuHead('','🏆 '+tr('fedui.leaderboards'),{v:'home'});
  // The board is the subtitle and picks it (a native picker fits any phone and language); the filters beside it.
  h+=`<div class="fu-ctl"><select class="pick fu-bsel" data-chg="fuFilt" data-args='{"k":"board"}' aria-label="${tr('fedui.board')}">${FU_BOARDS.map(b=>`<option value="${b}"${q.board===b?' selected':''}>${fuBoardName(b)}</option>`).join('')}</select>`;
  h+=`<button class="fu-more${nf?' on':''}" data-act="fuOpen" data-args='{"v":"filters"}' aria-label="${tr('fedui.more_filters')}${nf?' ('+nf+')':''}" title="${tr('fedui.more_filters')}"><span aria-hidden="true">⚙️</span><span class="fu-more-l">${tr('fedui.more_filters')}</span>${nf?`<span class="fu-cnt num" aria-hidden="true">${nf}</span>`:''}</button>`;
  // Measure and division: on a line of their own, side by side when they fit, else one under the other (they wrap,
  // never scroll); a phone on its side has all controls on one line.
  h+=`<span class="fu-br" aria-hidden="true"></span>${fuSeg('measure',FU_MEASURES.map(m=>[m,fuMeasureName(m,q.board)]),q.measure,tr('fedui.measure'))}${fuSeg('division',[['all',tr('fedui.all')],['human',tr('fedui.humans')],['ai','🤖 '+tr('fedui.ai')]],q.division,tr('fedui.division'))}</div>`;
  if(nf)h+=`<div class="fu-chips fu-act">${act.map(([k,l])=>fuChip(l+' ×','fuQ',{k,v:null},true,'act')).join('')}</div>`;
  // What the board counts: one line, all of it on a tap.
  h+=`<button class="fu-note${open?' open':''}" data-act="fuNote" aria-expanded="${open}"><span class="fu-i" aria-hidden="true">ⓘ</span><span class="fu-nt">${fuBoardNote(q.board,q.measure)}${q.measure==='growth'?' '+tr('fedui.growth_needs_two_days_of_records'):''}</span></button>`;
  if(!sl)return h+`<p class="meta">${tr('fedui.loading')}</p>`;
  for(const id of sl.untrusted||[])h+=`<p class="note bad">${tr('fedui.ranking_does_not_match',{server:fuSrvName(id)})}</p>`;
  const me=S&&S.fed&&S.fed.key?S.fed.key.pub:null,inList=!!me&&sl.rows.some(r=>r.key===me);
  h+=sl.rows.length?`<ol class="fu-board">${sl.rows.map(r=>fuRow(r,q,r.key===me)).join('')}</ol>`:`<p class="note">${tr('fedui.no_one_on_this_board_yet')}</p>`;
  h+=`<p class="meta fu-foot">${sl.n>sl.rows.length?tr('fedui.top_n_of_m',{n:sl.rows.length,m:sl.n})+' ':''}${q.server?tr('fedui.as_seen_from_server',{server:fuSrvName(q.server)}):tr('fedui.all_your_servers_merged')}${sl.at?' · '+tr('fedui.as_of_time',{time:fuWhen(sl.at)}):''}</p>`;
  // Not among the rows shown: the own row stays in sight at the bottom of the sheet.
  if(sl.me&&!inList)h+=`<div class="fu-mine"><ol class="fu-board">${fuRow({...sl.me,key:me,asn:FU.asn||0},q,true)}</ol>${sl.me.rank?'':`<p class="meta">${tr('fedui.you_are_not_in_this_slice')}</p>`}</div>`;
  return h;}
/* The second sheet: every other dimension. Values offered are the ones the servers list (fedFacets). */
function fuFiltersHtml(){const q=fuQ(),fc=FU.facets||{models:[],harnesses:[],from:[],homes:[]};
  const sel=(k,label,vals,name,cur)=>`<div class="setline fu-sel"><label for="fuF_${k}">${label}</label><select class="pick" id="fuF_${k}" data-chg="fuFilt" data-args="${esc(JSON.stringify({k}))}"><option value="">${tr('fedui.any')}</option>${vals.map(v=>`<option value="${esc(v)}"${String(cur)===String(v)?' selected':''}>${name(v)}</option>`).join('')}</select></div>`;
  const chips=(k,opts)=>`<div class="fu-chips">${fuChip(tr('fedui.any'),'fuQ',{k,v:null},q[k]==null)}${opts.map(([v,l])=>fuChip(l,'fuQ',{k,v},q[k]===v)).join('')}</div>`;
  const ccs=[...new Set(CITIES.filter(c=>!q.continent||c.reg===q.continent).map(c=>c.cc))].sort();
  const cities=q.country||q.continent?CITIES.filter(c=>q.country?c.cc===q.country:c.reg===q.continent):[];
  const srvs=fuSrvIds();
  let h=fuHead('🏆 '+tr('fedui.leaderboards'),tr('fedui.more_filters'),{v:'boards'});
  h+=`<h3 class="sub4">${tr('fedui.ai_setup')}</h3>${sel('model',tr('fedui.model'),fc.models,esc,q.model)}${sel('harness',tr('fedui.harness'),fc.harnesses,esc,q.harness)}`;
  h+=`<h3 class="sub4">${tr('fedui.region')}</h3><p class="meta">${tr('fedui.a_region_counts_only_what_is')}</p>${sel('continent',tr('fedui.continent'),Object.keys(REG),v=>esc(REG[v]),q.continent)}${sel('country',tr('fedui.country'),ccs,v=>esc(pieLicCountry(v)),q.country)}${cities.length?sel('city',tr('fedui.city'),cities.map(c=>c.id),v=>esc(CITY[v].name),q.city):''}`;
  h+=`<h3 class="sub4">${tr('fedui.where_from')}</h3>${sel('home',tr('fedui.home_market'),fc.homes,v=>esc(pieLicCountry(v)),q.home)}${sel('from',tr('fedui.players_from'),fc.from,v=>esc(pieLicCountry(v)),q.from)}<p class="meta">${tr('fedui.players_from_is_the_real_country')}</p>`;
  h+=`<h3 class="sub4">${tr('fedui.network_age')}</h3>${chips('age',Object.keys(FU_AGES).map(k=>[k,fuAgeName(k)]))}${chips('gday',Object.keys(FU_GDAYS).map(k=>[k,fuDayName(k)]))}`;
  h+=`<h3 class="sub4">${tr('fedui.tier_1')}</h3>${chips('tier1',[[true,tr('fedui.tier_1_only')],[false,tr('fedui.not_tier_1')]])}`;
  h+=`<h3 class="sub4">${tr('fedui.peering_policy')}</h3>${chips('policy',['open','selective','restrictive'].map(p=>[p,fuPolName(p)]))}`;
  h+=`<h3 class="sub4">${tr('fedui.peers_with_me')}</h3>${chips('peers',[[true,tr('fedui.only_networks_i_have_a_deal')]])}`;
  if(srvs.length>1)h+=`<h3 class="sub4">${tr('fedui.server')}</h3><div class="fu-chips">${fuChip(tr('fedui.all_your_servers_merged'),'fuQ',{k:'server',v:null},!q.server)}${srvs.map(id=>fuChip(fuSrvName(id),'fuQ',{k:'server',v:id},q.server===id)).join('')}</div>`;
  h+=`<div class="btns cta">${btn(fuShowN(),'fuOpen',{v:'boards'},'pink')}</div>`;
  return h;}
// A server caught out while the sheet is open: ask again without it.
fedOn('untrusted',()=>{if(UI.fu&&(UI.fu.v==='boards'||UI.fu.v==='filters'))fuBoardsLoad().then(()=>{if(UI.fu&&UI.fu.v==='boards')fuRender();});});
const fuShowN=()=>FU.slice?trn('fedui.show_n_networks',FU.slice.n):tr('fedui.show_the_board');
