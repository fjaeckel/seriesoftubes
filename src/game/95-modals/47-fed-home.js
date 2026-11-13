/* ================= MULTIPLAYER: the sheets =================
   The interface of the federation core (60-features/8x-fed-*.js, docs/FEDERATION-CLIENT.md): joining, the multiplayer
   settings, the quiet status dot, the leaderboards (48-fed-boards.js) and the looking glass with the operator panel
   (49-fed-glass.js). Every sheet is a modal, so on phones it is a bottom sheet. Nothing here runs in the game loop:
   sheets load what they show from the browser's cache when they open, and the core's events refresh them.
   Without WebCrypto Ed25519 nothing about multiplayer is shown at all. Names other people typed (networks, servers)
   are always escaped as text. */
// Data the open sheet shows (memory only); UI.fu is which sheet and its choices.
const FU={can:null,canP:null,srvs:[],gossip:[],nets:new Map(),votes:[],opKey:null,shun:null,asn:null,chain:null,slice:null,facets:null,hideNames:new Set(),busy:false,loading:null,loadNext:null,msg:null,netInfo:null};
// Sheets that work with no game open (from the title screen's Settings).
const FU_NOS=['fuOpen','fuClose','fuQ','fuFilt','fuOpKeyGo','fuOpKeyDel','fuOpSign','fuOpHide','fuOpShun','fuJoinTyped','fuJoin'];
const FU_14D=14*86400;
// The page's own invite link (#join=<node URL>): taken out of the address bar at once, like a transfer link.
const FU_INVITE=(()=>{try{const h=location.hash||'';if(!h.startsWith('#join='))return null;history.replaceState(null,'',location.pathname+location.search);
  const u=decodeURIComponent(h.slice(6));return FdUrl(u)?null:u;}catch(e){return null;}})();

/* ---------- small helpers ---------- */
// Multiplayer is offered only where the browser has Ed25519; asked once, the first time a sheet or menu wants to know.
function fuCan(){if(S&&S.fed&&S.fed.on)return true;if(FU.can===null&&!FU.canP)FU.canP=fedCan().then(v=>{FU.can=!!v;refreshSettings();fsPaint();},()=>{FU.can=false;});return FU.can===true;}
const fuShown=()=>!$('modal').hidden&&!!$('modalCard').querySelector('.fedui');
const fuShort=k=>typeof k==='string'?k.slice(0,6)+'…'+k.slice(-4):'';
const fuNow=()=>FED.now();
// A time the player reads: the clock for today, the date and clock otherwise.
function fuWhen(t){if(!Number.isFinite(t))return '—';const d=new Date(t*1000),n=new Date(fuNow()*1000);
  try{return d.toDateString()===n.toDateString()?d.toLocaleTimeString(LANG,{hour:'2-digit',minute:'2-digit'}):d.toLocaleString(LANG,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});}
  catch(e){return d.toISOString().slice(0,16).replace('T',' ');}}
const fuDate=day=>{try{return new Date(day*86400000).toLocaleDateString(LANG,{year:'numeric',month:'short',day:'numeric'});}catch(e){return String(day);}};
const fuHead=(eyebrow,title,back)=>`<div style="display:flex;align-items:center;gap:8px">${back?`<button class="x fu-back" data-act="${back.act||'fuOpen'}" data-args="${esc(JSON.stringify(back.act?{}:back))}" aria-label="${tr('common.back')}">‹</button>`:''}<div class="grow" style="min-width:0">${eyebrow?`<div class="eyebrow">${eyebrow}</div>`:''}<h2 style="font-size:24px">${title}</h2></div><button class="x" data-act="fuClose" aria-label="${tr('common.close')}">×</button></div>`;
// Multimode's own icon: an orange tube in the logo's style (orange like OM1/OM2 multimode fiber jackets). A constant.
const FU_ICON='<svg class="mm-ico" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M5 26V20C5 13 10 9 17 9H23" fill="none" stroke="#1E2640" stroke-width="9" stroke-linecap="round"/><path d="M5 26V20C5 13 10 9 17 9H23" fill="none" stroke="#FF8C2E" stroke-width="5" stroke-linecap="round"/><circle cx="25" cy="9" r="4.6" fill="#C9541A" stroke="#1E2640" stroke-width="2.2"/><circle cx="5" cy="21" r="1.4" fill="#fff"/><circle cx="14.5" cy="9.4" r="1.4" fill="#fff"/></svg>';
const fuIcon=()=>FU_ICON;
const fuAi=()=>`<span class="fu-bot" role="img" aria-label="${tr('fedui.ai_player')}" title="${tr('fedui.ai_player')}">🤖</span>`;
// A network's name as others see it: as typed (escaped), or only its ASN where a server hides the name.
function fuName(key){const a=FU.nets.get(key),b=a&&a.rec&&a.rec.body;if(!b)return esc(fuShort(key));if(FU.hideNames.has(key))return 'AS'+b.asn;return esc(b.name);}
const fuSrvName=id=>{const s=FU.srvs.find(x=>x.id===id);return s?esc(s.name):esc(fuShort(id));};
// The server a joined node URL belongs to (from the status, or the catalog's node lists).
function fuSrvOf(url){const st=FED.st[url];if(st&&st.server)return FU.srvs.find(x=>x.id===st.server)||{id:st.server,name:fuShort(st.server),nodes:[],operators:[],source:'gossip'};
  return FU.srvs.find(s=>(s.nodes||[]).some(n=>n.url===url))||null;}
// Server ids of the joined servers, known now or from the catalog (the boards are cached per server, also offline).
function fuSrvIds(){const f=S&&S.fed;if(!f)return [];return [...new Set(f.servers.map(u=>{const s=fuSrvOf(u);return s&&s.id;}).filter(Boolean))];}
function fuWhyMode(){if(!S||!UI.started)return tr('fedui.open_a_normal_network_first');if(S.lost)return tr('fedui.this_network_s_game_is_over');
  const m=fedMode(S);return m==='sandbox'||m==='open_gates'?tr('fedui.sandbox_and_open_gates_networks_play'):tr('fedui.puzzles_scenarios_and_the_weekly_challenge');}
const fuPolicy=s=>s.sync==='open'?tr('fedui.policy_open'):s.sync==='selective'?tr('fedui.policy_selective'):s.sync==='standalone'?tr('fedui.policy_standalone'):tr('fedui.policy_unknown');
const fuErrText=code=>({mode:fuWhyMode(),url:tr('fedui.that_is_not_a_server_address'),full:tr('fedui.you_are_on_four_servers_already'),crypto:tr('fedui.this_browser_cannot_sign'),
  offline:tr('fedui.not_connected_to_this_server_now'),timeout:tr('fedui.the_server_did_not_answer_in'),no_key:tr('fedui.no_operator_key_on_this_device'),
  not_operator:tr('fedui.the_server_says_this_key_is'),no_majority:tr('fedui.needs_more_operators_signatures'),too_many:tr('fedui.report_enough_for_today')}[code]||tr('fedui.the_server_said_no_code',{code:esc(code)}));
// Queued actions (offers and answers) say they are queued; stats and announcements are not the player's actions.
const fuQueued=()=>S&&S.fed?S.fed.out.filter(r=>r.kind!=='stats'&&r.kind!=='announce').length:0;

/* ---------- the status dot: quiet, never a modal or a red toast ---------- */
function fuStatusText(st=fedStatus()){
  if(st.state==='connected')return tr('fedui.connected');if(st.state==='connecting')return tr('fedui.connecting');
  if(st.state==='offline')return st.since?tr('fedui.offline_since_time',{time:fuWhen(st.since)}):tr('fedui.offline');return tr('fedui.not_joined');}
function fuDot(){fuRankChip();const el=$('hFed');if(!el)return;const st=fedStatus(),on=st.state!=='off'&&!!(S&&S.fed&&S.fed.on);el.hidden=!on;if(!on)return;
  el.className='fed-dot '+st.state;const q=fuQueued(),t=tr('fedui.multiplayer')+': '+fuStatusText(st)+(q&&st.state!=='connected'?' · '+trn('fedui.n_actions_queued',q):'');
  el.title=t;el.setAttribute('aria-label',t);}
// When this network last reached a server (per device, outside the save): for the one suggestion after 14 days.
function fuSeen(pub,patch){let m={};try{m=JSON.parse(localStorage.getItem('sot-fed-seen')||'{}')||{};}catch(e){}
  const o=m[pub]&&typeof m[pub]==='object'?m[pub]:{t:0,told:0};if(!patch)return o;m[pub]={...o,...patch};
  try{localStorage.setItem('sot-fed-seen',JSON.stringify(m));}catch(e){}return m[pub];}
// Unreachable for 14 days (counted from the last connection, or from joining): one gentle suggestion, then quiet.
function fuLongGone(){const f=S&&S.fed;if(!f||!f.on||!f.key||fedStatus().state==='connected')return false;const o=fuSeen(f.key.pub),from=o&&o.t?o.t:f.joined*86400;
  return !!from&&fuNow()-from>=FU_14D;}
function fuOnStatus(st){fuDot();const f=S&&S.fed;if(f&&f.key&&st.state==='connected')fuSeen(f.key.pub,{t:fuNow(),told:0});
  if(fuLongGone()&&!fuSeen(f.key.pub).told){fuSeen(f.key.pub,{told:1});
    toast(tr('fedui.your_server_has_not_answered_for'),'',[{l:tr('fedui.see_other_servers'),act:'fuOpen',args:{v:'join'}}]);}
  if(fuShown()&&['home','join','boards','server'].includes(UI.fu&&UI.fu.v))fuRender();}
// After boot: listen (memory only: no socket, no timer), and an invite link opens the join sheet.
function fuBoot(){fuCan();// the capability check is async: start it now, so the menu has its tile from the first look
  fedOn('status',fuOnStatus);fedOn('catalog',()=>{if(fuShown())fuLoad();});fedOn('excluded',()=>{if(fuShown())fuLoad();});fedOn('mute',()=>{if(fuShown())fuRender();});
  fedOn('board',()=>{if(fuShown()&&UI.fu.v==='boards')fuLoad();});fedOn('update',()=>{if(fuShown()&&UI.fu.v==='server')fuRender();});fuRankBoot();fuDot();
  if(FU_INVITE){UI.fedInvite=FU_INVITE;if(S&&UI.started&&fedEligible())ACT.fuOpen({v:'join'});}}
/* The title screen mentions a waiting invite in one line (it is drawn before fuBoot, so the link itself counts until
   then); a new game started from it opens the join sheet once its charter is signed (fuInviteGo). */
const fuInv=()=>UI.fedInvite!==undefined?UI.fedInvite:FU_INVITE;
const fuInviteNote=()=>fuInv()&&!(S&&UI.started)?`<p class="note fu-invite">${fuIcon()} ${tr('fedui.you_were_invited_to_server',{url:`<b>${esc(fuInv())}</b>`})}</p>`:'';
// A game started with the title's switch shown joins its pick (47-fed-start.js), or, switched off, opens nothing.
function fuInviteGo(){const g=UI.fedGo;if(g&&g.s===S){UI.fedGo=null;if(g.url&&fedEligible()&&!(S.fed&&S.fed.on))fsJoin(g.url);return;}
  if(UI.fedInvite&&S&&UI.started&&fedEligible()&&!(S.fed&&S.fed.on))ACT.fuOpen({v:'join'});}
// A line in Settings, and a tile in the network menu, only where multiplayer can work.
function fuSettingsRow(){if(!fuCan())return '';const f=S&&S.fed,st=f&&f.on?fuStatusText():tr('fedui.not_joined');
  return `<h3 class="sub4">${fuIcon()} ${tr('fedui.multiplayer')}</h3><div class="setline"><span class="fu-st">${st}</span>${btn(tr('fedui.open_multiplayer'),'fuOpen',{v:'home'},'ghost sm')}</div><p class="meta" style="margin:0 0 6px">${tr('fedui.join_a_server_to_meet_other')}</p>`;}
// A joined save also gets the leaderboards, next to Multimode.
const fuMenuTile=()=>fuCan()?[[fuIcon(),tr('fedui.multiplayer'),'fuOpen'],...(fuRankOn()?[['🏆',tr('fedui.leaderboards'),'fuBoards']]:[])]:[];

/* ---------- loading what a sheet shows, then drawing it ---------- */
/* Loads run one after another: events (status, catalog, board) and buttons ask for loads that overlap, and an older
   one finishing last would draw what it read before the newer one (an empty catalog, no operator key). A request while
   one runs queues a single next load, which reads everything afresh. */
function fuLoad(){if(FU.loadNext)return FU.loadNext;
  const p=FU.loadNext=(FU.loading||Promise.resolve()).then(()=>{FU.loadNext=null;return fuLoadRun();}).finally(()=>{if(FU.loading===p)FU.loading=null;});FU.loading=p;return p;}
async function fuLoadRun(){const v=UI.fu&&UI.fu.v;if(!v)return;
  try{FU.srvs=await fedServers();FU.opKey=await fedOpKey();
    if(v==='glass'||v==='server'||v==='net'||v==='home'||v==='boards'||v==='filters'||v==='report'){FU.gossip=(await fedGet('kv','gossip'))||[];FU.votes=FU.opKey?(await fedGet('kv','votes'))||[]:(await fedVotesTidy(),[]);
      FU.nets=new Map((await fedNetworks()).map(n=>[n.key,n]));FU.hideNames=new Set();FU.excl=new Set(await fedShunned());
      for(const s of FU.srvs){const h=await fedHides(s.id,FU.srvs);if(h)for(const k of h.rec.body.names)FU.hideNames.add(k);}}
    if(v==='home'){const f=S&&S.fed;FU.shun=f&&f.key?await fedExclInfo(f.key.pub):null;FU.asn=f&&f.key?await fedAsn(f.key.pub):null;}
    if(v==='glass'||v==='server')await fuGlassLoad();
    if(v==='server'&&UI.fu.id&&FU.opKey&&fuOpOf(UI.fu.id)){await fuOpReportsLoad(UI.fu.id);FU.chain=await fedOpChain(UI.fu.id);}
    if(v==='report'&&UI.fu.key)await fuRepLoad(UI.fu.key);
    if(v==='net'&&UI.fu.key)await fuNetLoad(UI.fu.key);
    if(v==='boards'||v==='filters')await fuBoardsLoad();}
  catch(e){console.error('[tubes] multiplayer sheet',e);}
  if(UI.fu&&UI.fu.v===v)fuRender();}
function fuRender(){if(!UI.fu)return;const h=`<div class="fedui" data-fu="${UI.fu.v}">${fuHtml()}</div>`;
  if(fuShown())morph($('modalCard'),h);else openModal(h);}
function fuHtml(){const v=UI.fu.v;
  if(v==='join')return fuJoinHtml();if(v==='move')return fuMoveHtml();if(v==='quit')return fuQuitHtml();if(v==='opkey')return fuOpKeyHtml();
  if(v==='boards')return fuBoardsHtml();if(v==='filters')return fuFiltersHtml();if(v==='glass')return fuGlassHtml();
  if(v==='server')return fuServerHtml();if(v==='net')return fuNetHtml();if(v==='report')return fuRepHtml();return fuHomeHtml();}
const fuMsg=()=>FU.msg?`<p class="${FU.msg.bad?'why':'note'} fu-msg" role="status">${FU.msg.html}</p>`:'';

/* ---------- the multiplayer sheet (settings) ---------- */
function fuHomeHtml(){const f=S&&S.fed,ok=S&&UI.started&&fedEligible(),on=!!(f&&f.on),st=fedStatus();
  let h=fuHead(fuIcon()+' '+tr('fedui.multiplayer'),tr('fedui.playing_with_others'));
  h+=`<p class="tagline">${tr('fedui.other_players_networks_become_places_to')}</p>${fuMsg()}`;
  // Joined: the leaderboards come first, as a card with this network's rank.
  if(ok&&on){const m=fuMyRank();h+=`<button class="plug fu-lb" data-act="fuOpen" data-args='{"v":"boards"}'><span class="pi" aria-hidden="true">🏆</span><span class="grow"><b>${tr('fedui.leaderboards')}</b><span class="meta">${m?'#'+m.rank+' · ':''}${fuBoardName(fuDefQ().board)}</span></span><span class="go" aria-hidden="true">›</span></button>`;}
  if(!ok)h+=`<p class="note fu-why">${fuWhyMode()}</p>`;
  // Excluded by the federation: why, and that solo play goes on.
  if(on&&FU.shun&&FU.shun.shunned)h+=`<div class="fu-box bad"><b>${tr('fedui.the_federation_excluded_your_network')}</b><p class="meta">${FU.shun.reasons.length?tr('fedui.enough_servers_voted_to_shun_it'):tr('fedui.enough_servers_voted_to_exclude_it')}</p>${FU.shun.reasons.length?`<ul class="fu-reasons">${FU.shun.reasons.map(r=>`<li>${fuReason(r)}</li>`).join('')}</ul>`:''}${FU.shun.servers&&FU.shun.servers.length?`<p class="meta">${tr('fedui.listed_by_servers',{servers:[...new Set(FU.shun.servers.map(x=>FU.srvs.some(s=>s.id===x.srv)?fuSrvName(x.srv):esc(fedUrlHost(x.url))))].join(', ')})}</p>`:''}<p class="meta">${tr('fedui.your_game_plays_on_as_always')}</p></div>`;
  if(on){h+=`<div class="fu-status ${st.state}"><span class="fed-dot ${st.state}" aria-hidden="true"></span><span>${fuStatusText(st)}</span></div>`;
    const q=fuQueued();if(q&&st.state!=='connected')h+=`<p class="note">${trn('fedui.n_actions_queued_they_go_out',q)}</p>`;
    if(fuLongGone())h+=`<div class="fu-box"><p>${tr('fedui.your_server_has_not_answered_for')}</p>${btn(tr('fedui.see_other_servers'),'fuOpen',{v:'join'},'ghost sm')}</div>`;}
  if(on&&f.key)h+=`<p class="meta fu-id">${tr('fedui.you_are_asn_to_everyone',{asn:FU.asn?'AS'+FU.asn:'AS…',name:esc(S.name)})}</p>`;
  // Joined servers.
  if(f&&f.servers.length){h+=`<h3 class="sub4">${tr('fedui.your_servers')}</h3><div class="fu-list">${f.servers.map(u=>{const s=fuSrvOf(u),x=FED.st[u];
      return `<div class="fu-item"><span class="fed-dot ${x?x.state:'offline'}" aria-hidden="true"></span><div class="grow fu-txt"><b>${s?esc(s.name):esc(u)}</b><span class="meta">${s?fuPolicy(s):esc(u)}</span></div>${btn(tr('fedui.leave'),'fuLeave',{url:u},'ghost sm')}</div>`;}).join('')}</div>`;}
  if(ok){const full=f&&f.servers.length>=FED_MAX_SERVERS;h+=`<div class="btns">${btn(f&&f.servers.length?tr('fedui.join_another_server'):tr('fedui.join_a_server'),'fuOpen',{v:'join'},'pink',full)}${btn(tr('fedui.looking_glass'),'fuOpen',{v:'glass'},'ghost')}</div>`;
    if(full)h+=`<p class="meta">${tr('fedui.you_are_on_four_servers_already')}</p>`;}
  else h+=`<div class="btns">${btn(tr('fedui.looking_glass'),'fuOpen',{v:'glass'},'ghost')}</div>`;
  h+=`<div class="btns fu-info">${btn(tr('mphelp.how_multiplayer_works'),'helpMp',{from:'fed'},'ghost sm')}${btn(tr('fedui.privacy'),'privacy',{from:'fed'},'ghost sm')}</div>`;
  if(f){h+=`<h3 class="sub4">${tr('fedui.privacy')}</h3><div class="setline"><span>${tr('fedui.share_my_country')}</span><div class="seg">${btn(tr('common.on'),'fuShare',{on:true},f.share?'pink sm':'ghost sm')}${btn(tr('common.off'),'fuShare',{on:false},f.share?'ghost sm':'pink sm')}</div></div><p class="meta" style="margin:0 0 6px">${tr('fedui.only_your_country_never_anything_finer')}</p>`;
    h+=`<h3 class="sub4">${tr('fedui.muted_networks')}</h3>`+(f.muted.length?`<div class="fu-list">${f.muted.map(k=>`<div class="fu-item"><div class="grow fu-txt"><b>${fuName(k)}</b></div>${btn(tr('fedui.unmute'),'fuMute',{key:k,on:false},'ghost sm')}</div>`).join('')}</div>`:`<p class="meta">${tr('fedui.none_muted_networks_vanish_from_your')}</p>`);
    if(fedHasPriv(f)){h+=`<h3 class="sub4">${tr('fedui.move_to_another_device')}</h3><p class="meta">${tr('fedui.carry_this_network_s_identity_over')}</p><div class="btns">${btn(tr('fedui.move_to_another_device'),'fuOpen',{v:'move'},'ghost sm')}${btn(tr('common.import_a_save'),'importPick',{},'ghost sm')}</div>`;}}
  // The operator key belongs to the device, not to a save.
  h+=`<h3 class="sub4">${tr('fedui.operating_a_server')}</h3>`+(FU.opKey?`<div class="fu-item"><div class="grow fu-txt"><b>${tr('fedui.operator_key_on_this_device')}</b><span class="meta mono">${esc(fuShort(FU.opKey.pub))}</span></div>${btn(tr('fedui.remove'),'fuOpKeyDel',{},'ghost sm')}</div>`
    :`<p class="meta">${tr('fedui.run_a_relay_import_your_operator')}</p><div class="btns">${btn(tr('fedui.import_operator_key'),'fuOpen',{v:'opkey'},'ghost sm')}</div>`);
  if(f&&fedHasPriv(f))h+=`<h3 class="sub4">${tr('fedui.leave_for_good')}</h3><p class="meta">${tr('fedui.says_goodbye_to_every_server')}</p><div class="btns">${btn(tr('fedui.quit_multiplayer'),'fuOpen',{v:'quit'},'ghost sm red')}</div>`;
  return h;}
const fuReason=r=>({cheating:tr('fedui.reason_cheating'),offensive_name:tr('fedui.reason_offensive_name'),spam:tr('fedui.reason_spam'),abuse:tr('fedui.reason_abuse')}[r]||esc(r));

/* ---------- joining: the catalog, policy first; a typed address; an invite ---------- */
function fuSrvCard(s,f){const joined=!!f&&f.servers.some(u=>(s.nodes||[]).some(n=>n.url===u)),url=s.nodes&&s.nodes[0]&&s.nodes[0].url,ok=S&&UI.started&&fedEligible();
  return `<div class="fu-srv${s.source==='registry'?' reg':''}"><p class="fu-pol">${fuPolicy(s)}</p><div class="fu-srvh"><b>${esc(s.name)}</b>${s.source==='registry'?`<span class="fu-tag reg">${tr('fedui.in_the_registry')}</span>`:`<span class="fu-tag">${tr('fedui.only_heard_of')}</span>`}</div>
  ${s.desc?`<p class="meta">${esc(s.desc)}</p>`:''}<p class="meta">${trn('fedui.n_operators',(s.operators||[]).length)} · ${trn('fedui.n_nodes',(s.nodes||[]).length)}${s.langs&&s.langs.length?' · '+esc(s.langs.join(', ')):''}${s.noLogs?' · '+tr('fedui.no_address_logs'):''}</p>
  <div class="btns">${joined?`<span class="fu-tag on">✓ ${tr('fedui.joined')}</span>`:ok&&url?btn(tr('fedui.join'),'fuJoin',{url},'pink sm',FU.busy):''}${btn(tr('fedui.details'),'fuOpen',{v:'server',id:s.id,back:'join'},'ghost sm')}</div></div>`;}
function fuJoinHtml(){const f=S&&S.fed,ok=S&&UI.started&&fedEligible(),inv=UI.fedInvite;
  let h=fuHead(fuIcon()+' '+tr('fedui.multiplayer'),tr('fedui.join_a_server'),{v:'home'});
  h+=`<p class="tagline">${tr('fedui.names_are_public')}</p>${fuMsg()}`;
  if(!ok)h+=`<p class="note fu-why">${fuWhyMode()}</p>`;
  if(inv){const s=FU.srvs.find(x=>(x.nodes||[]).some(n=>n.url===inv));
    h+=`<div class="fu-box"><b>${tr('fedui.you_were_invited')}</b>${s?fuSrvCard(s,f):`<p class="fu-pol">${tr('fedui.policy_unknown')}</p><p class="meta mono">${esc(inv)}</p>${ok?`<div class="btns">${btn(tr('fedui.join'),'fuJoin',{url:inv},'pink sm',FU.busy)}</div>`:''}`}</div>`;}
  const list=FU.srvs.slice().sort((a,b)=>(a.source==='registry'?0:1)-(b.source==='registry'?0:1)||a.name.localeCompare(b.name));
  h+=`<h3 class="sub4">${tr('fedui.servers_we_know')}</h3>`+(list.length?`<div class="fu-srvs">${list.map(s=>fuSrvCard(s,f)).join('')}</div>`:`<p class="meta">${tr('fedui.no_servers_known_yet')}</p>`);
  if(ok)h+=`<label class="f" for="fuUrl">${tr('fedui.or_type_a_server_address')}</label><div class="fu-typed"><input class="t" id="fuUrl" type="url" inputmode="url" placeholder="wss://…" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(UI.fu.url||'')}">${btn(tr('fedui.join'),'fuJoinTyped',{},'',FU.busy)}</div><p class="meta">${tr('fedui.a_server_you_type_shows_its')}</p>`;
  return h;}

/* ---------- move, quit, operator key ---------- */
function fuMoveHtml(){return fuHead(fuIcon()+' '+tr('fedui.multiplayer'),tr('fedui.move_to_another_device'),{v:'home'})+
  `<div class="fu-box bad"><b>⚠️ ${tr('fedui.anyone_with_this_file_can_post')}</b><p>${tr('fedui.never_attach_it_to_a_bug')}</p></div>
  <p class="tagline">${tr('fedui.on_the_new_device_use_import')}</p>
  <div class="btns cta">${btn(tr('fedui.i_understand_download_the_file'),'fuMoveGo',{},'pink big')}${btn(tr('common.cancel'),'fuOpen',{v:'home'},'ghost')}</div>`;}
function fuQuitHtml(){return fuHead(fuIcon()+' '+tr('fedui.multiplayer'),tr('fedui.leave_multiplayer_for_good'),{v:'home'})+
  `<p class="tagline">${tr('fedui.your_network_says_goodbye_to_every')}</p><p class="note">${tr('fedui.your_game_plays_on_as_always')}</p>
  <div class="btns cta">${btn(tr('fedui.leave_for_good'),'fuQuit',{},'red big',FU.busy)}${btn(tr('fedui.keep_playing_together'),'fuOpen',{v:'home'},'ghost')}</div>`;}
function fuOpKeyHtml(){return fuHead(fuIcon()+' '+tr('fedui.operating_a_server'),tr('fedui.import_operator_key'),{v:'home'})+
  `<p class="tagline">${tr('fedui.paste_the_private_seed_of_your')}</p>${fuMsg()}
  <label class="f" for="fuOpIn">${tr('fedui.operator_key')}</label><textarea class="t" id="fuOpIn" rows="2" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea>
  <p class="meta">${tr('fedui.kept_only_in_this_browser')}</p><div class="btns cta">${btn(tr('fedui.import_operator_key'),'fuOpKeyGo',{},'pink')}${btn(tr('common.cancel'),'fuOpen',{v:'home'},'ghost')}</div>`;}
