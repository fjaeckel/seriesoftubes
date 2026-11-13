/* ---------- MULTIPLAYER: the looking glass, and the operator panel ----------
   Public and read-only, like a router's looking glass: the servers this browser knows (in the registry, or only heard
   of through gossip), their policies, which sync with which, how many players each one is seen with, how many
   operators each has. Per network a read-only status: excluded by the federation or not. Shun votes (who voted, when,
   why) and the tally are for operators only (§12): with an operator key imported, the votes its nodes sent show here,
   and a server it operates gets the operator panel: proposals to sign, hide and shun with pre-made reasons only, node
   status and recent errors. */
async function fuGlassLoad(){const players=new Map(),syncs=new Map(),add=(a,b)=>{if(a===b)return;(syncs.get(a)||syncs.set(a,new Set()).get(a)).add(b);(syncs.get(b)||syncs.set(b,new Set()).get(b)).add(a);};
  for(const s of FU.srvs){let n=0;for(const x of FU.nets.values())if((x.srv||[]).includes(s.id))n++;players.set(s.id,n);}
  for(const g of FU.gossip)if(Array.isArray(g.path))for(let i=0;i+1<g.path.length;i++)add(g.path[i],g.path[i+1]);
  FU.players=players;FU.syncs=syncs;}
// The server an operator key operates, or null.
const fuOpOf=id=>{const s=FU.srvs.find(x=>x.id===id);return s&&FU.opKey&&(s.operators||[]).includes(FU.opKey.pub)?s:null;};
const fuVoteLine=v=>{const r=v.rec,b=r.body,x={server:`<b>${fuSrvName(b.server)}</b>`,network:`<b>${fuName(b.target)}</b>`};return `<li class="fu-vote"><span>${r.kind==='shun'?tr('fedui.server_voted_to_shun_network',x):tr('fedui.server_withdrew_its_vote_on_network',x)}${r.kind==='shun'?' · '+fuReason(b.reason):''}</span><span class="meta">${fuWhen(r.t)}</span></li>`;};
function fuGlassHtml(){const srvs=FU.srvs.slice().sort((a,b)=>(a.source==='registry'?0:1)-(b.source==='registry'?0:1)||a.name.localeCompare(b.name)),nets=[...FU.nets.values()].filter(n=>FU.opKey||!(FU.excl&&FU.excl.has(n.key))).sort((a,b)=>a.rec.body.name.localeCompare(b.rec.body.name));
  let h=fuHead('🔭 '+tr('fedui.looking_glass'),FU.opKey?tr('fedui.the_federation_as_this_browser_sees'):tr('fedui.servers_and_networks'),{v:'home'});
  h+=`<p class="tagline">${tr('fedui.public_and_read_only')}</p>`;
  h+=`<h3 class="sub4">${trn('fedui.n_servers_known',srvs.length)}</h3>`+(srvs.length?`<ul class="fu-list">${srvs.map(s=>{const sy=FU.syncs&&FU.syncs.get(s.id);
    return `<li class="fu-item"><div class="grow fu-txt"><button class="lnk" data-act="fuOpen" data-args="${esc(JSON.stringify({v:'server',id:s.id,back:'glass'}))}"><b>${esc(s.name)}</b></button> ${s.source==='registry'?`<span class="fu-tag reg">${tr('fedui.in_the_registry')}</span>`:`<span class="fu-tag">${tr('fedui.only_heard_of')}</span>`}${fuOpOf(s.id)?` <span class="fu-tag on">${tr('fedui.yours')}</span>`:''}
    <span class="meta">${fuPolShort(s)} · ${trn('fedui.n_players',FU.players?FU.players.get(s.id)||0:0)} · ${trn('fedui.n_operators',(s.operators||[]).length)}${sy&&sy.size?' · '+tr('fedui.syncs_with_list',{list:[...sy].map(fuSrvName).join(', ')}):''}</span></div></li>`;}).join('')}</ul>`:`<p class="meta">${tr('fedui.no_servers_known_yet')}</p>`);
  h+=`<h3 class="sub4">${trn('fedui.n_networks_known',nets.length)}</h3>`+(nets.length?`<ul class="fu-list">${nets.slice(0,300).map(n=>`<li class="fu-item"><div class="grow fu-txt"><button class="lnk" data-act="fuOpen" data-args="${esc(JSON.stringify({v:'net',key:n.key,back:'glass'}))}"><b>${fuName(n.key)}</b></button> <span class="meta">AS${n.rec.body.asn} · ${fuQuietName(n.quiet.state)}</span></div></li>`).join('')}</ul>`:`<p class="meta">${tr('fedui.no_other_networks_yet')}</p>`);
  if(!FU.opKey)return h;const votes=FU.votes.slice().sort((a,b)=>b.rec.t-a.rec.t);
  h+=`<h3 class="sub4">${tr('fedui.shun_votes')}</h3><p class="meta">${tr('fedui.only_server_operators_see_votes')}</p>`+(votes.length?`<ul class="fu-list">${votes.slice(0,200).map(fuVoteLine).join('')}</ul>`:`<p class="meta">${tr('fedui.no_votes')}</p>`);
  return h;}
const fuPolShort=s=>s.sync==='open'?tr('fedui.sync_open'):s.sync==='selective'?tr('fedui.sync_selective'):s.sync==='standalone'?tr('fedui.sync_standalone'):'?';
const fuQuietName=s=>({active:tr('fedui.quiet_active'),fading:tr('fedui.quiet_fading'),dark:tr('fedui.quiet_dark'),forgotten:tr('fedui.quiet_dark')}[s]||'');

/* ---------- one server ---------- */
function fuServerHtml(){const id=UI.fu.id,s=FU.srvs.find(x=>x.id===id),back={v:UI.fu.back||'glass'};
  if(!s)return fuHead('🔭 '+tr('fedui.looking_glass'),'—',back)+`<p class="meta">${tr('fedui.this_server_is_not_known_here')}</p>`;
  const f=S&&S.fed,sy=FU.syncs&&FU.syncs.get(id),joined=!!f&&f.servers.some(u=>(s.nodes||[]).some(n=>n.url===u)),ok=S&&UI.started&&fedEligible();
  let h=fuHead('🔭 '+tr('fedui.looking_glass'),esc(s.name),back)+fuMsg();
  h+=`<p class="fu-pol">${fuPolicy(s)}</p>${s.desc?`<p class="tagline">${esc(s.desc)}</p>`:''}`;
  h+=`<dl class="fu-dl"><dt>${tr('fedui.listed')}</dt><dd>${s.source==='registry'?tr('fedui.in_the_registry')+(s.listed?' · '+tr('fedui.since_date',{date:fuDate(s.listed/86400)}):''):tr('fedui.only_heard_of')}</dd>
  ${s.answered?`<dt>${tr('fedui.last_answered')}</dt><dd>${fuDate(s.answered/86400)}</dd>`:''}${s.seen?`<dt>${tr('fedui.last_seen')}</dt><dd>${fuWhen(s.seen)}</dd>`:''}
  <dt>${tr('fedui.players')}</dt><dd>${FU.players?FU.players.get(id)||0:0}</dd><dt>${tr('fedui.operators')}</dt><dd>${(s.operators||[]).length}</dd><dt>${tr('fedui.nodes')}</dt><dd>${(s.nodes||[]).length}</dd>${fuRelaysDl(s)}
  <dt>${tr('fedui.syncs_with')}</dt><dd>${sy&&sy.size?[...sy].map(fuSrvName).join(', '):'—'}</dd>${s.langs&&s.langs.length?`<dt>${tr('common.language')}</dt><dd>${esc(s.langs.join(', '))}</dd>`:''}
  <dt>${tr('fedui.address_logs')}</dt><dd>${s.noLogs?tr('fedui.operators_declare_no_address_logs'):'—'}</dd></dl>`;
  if(ok&&!joined&&s.nodes&&s.nodes[0])h+=`<div class="btns">${btn(tr('fedui.join'),'fuJoin',{url:s.nodes[0].url},'pink sm',FU.busy)}</div>`;
  const votes=FU.votes.filter(v=>v.rec.body.server===id).sort((a,b)=>b.rec.t-a.rec.t);
  if(FU.opKey)h+=`<h3 class="sub4">${tr('fedui.votes_cast_by_this_server')}</h3>`+(votes.length?`<ul class="fu-list">${votes.map(fuVoteLine).join('')}</ul>`:`<p class="meta">${tr('fedui.no_votes')}</p>`);
  if(fuOpOf(id))h+=fuOpPanel(s);
  return h;}
/* What each node of a server runs: what the node said when this game connected to it, else what its server's own
   catalog entry says (both are the server's word, shown as such). Empty when nothing is known. */
const fuImpl=i=>i.name==='tubes-relay'?tr('fedui.relay_version',{version:esc(i.version)}):esc(i.name+' '+i.version);
const fuHost=u=>String(u).replace(/^wss:\/\//,'').split('/')[0];
function fuRelaysDl(s){const live=Object.values(FED.st),rel=s.relays||{};
  const rows=(s.nodes||[]).map(n=>{const on=live.find(x=>x.server===s.id&&x.node===n.url&&x.impl),i=on?on.impl:rel[n.key];return i?{url:n.url,i}:null;}).filter(Boolean);
  return rows.length?`<dt>${tr('fedui.relay_software')}</dt><dd class="fu-relays">${rows.map(r=>`<span class="mono">${esc(fuHost(r.url))}</span> ${fuImpl(r.i)}`).join('<br>')}</dd>`:'';}
/* A newer relay is out (§9.3 update, only ever sent to an operator's session): louder when it fixes a security issue.
   The notes link is https only (fedUpdOf) and escaped here. */
function fuUpdBanner(id){const u=FED.upd[id];if(!u)return '';
  return `<div class="fu-box fu-upd${u.security?' bad':''}" role="status"><b>${u.security?'⚠️ '+tr('fedui.security_update_available'):'⬆️ '+tr('fedui.update_available')}</b>
    <p>${u.security?tr('fedui.relay_version_fixes_a_security_issue',{version:esc(u.version)}):tr('fedui.relay_version_is_out',{version:esc(u.version)})}${u.github?' '+tr('fedui.from_github_releases'):''}</p>
    ${u.notes?`<p><a href="${esc(u.notes)}" target="_blank" rel="noopener noreferrer">${tr('common.release_notes')}</a></p>`:''}</div>`;}
// The operator panel of a server the imported key operates.
function fuOpPanel(s){const c=fedConnTo(s.id),st=fedStatus(),ch=FU.chain;
  let h=`<section class="fu-op"><h3 class="sub4">🛠️ ${tr('fedui.operator_panel')}</h3>`+fuUpdBanner(s.id);
  if(!c)h+=`<p class="note">${tr('fedui.operator_actions_travel_over_the_game')}</p>`;
  h+=`<h4 class="fu-h4">${tr('fedui.proposals_to_sign')}</h4>`;
  if(!ch)h+=`<p class="meta">${c?tr('fedui.loading'):'—'}</p>`;
  else if(!ch.pending.length)h+=`<p class="meta">${tr('fedui.nothing_waits_for_your_signature')}</p>`;
  else h+=`<ul class="fu-list">${ch.pending.map(p=>{const b=p.rec.body,signed=p.rec.sigs.some(x=>x.key===FU.opKey.pub),n=p.rec.sigs.filter(x=>ch.chain.ops.includes(x.key)).length;
    return `<li class="fu-item"><div class="grow fu-txt"><b>${fuProp(b.action)}</b><span class="meta mono">${esc(fuShort(b.target))}${b.url?' · '+esc(b.url):''}</span><span class="meta">${tr('fedui.n_of_m_signatures',{n,m:ch.chain.ops.length})} · ${fuWhen(p.rec.t)}</span></div>${signed?`<span class="fu-tag on">✓ ${tr('fedui.signed')}</span>`:btn(tr('fedui.sign'),'fuOpSign',{srv:s.id,id:p.id},'pink sm',!c||FU.busy)}</li>`;}).join('')}</ul>`;
  h+=fuOpReports(s);
  h+=`<h4 class="fu-h4">${tr('fedui.node_status')}</h4><ul class="fu-list">${(s.nodes||[]).map(n=>{const on=st.servers.find(x=>x.node===n.url&&x.server===s.id),e=fedErrs(s.id).find(x=>x.node===n.url);
    return `<li class="fu-item"><span class="fed-dot ${on?on.state:'idle'}" aria-hidden="true"></span><div class="grow fu-txt"><span class="mono">${esc(n.url)}</span><span class="meta">${on?fuStatusText({state:on.state,since:on.since}):tr('fedui.not_in_use_by_this_game')}${e?' · '+tr('fedui.last_error_code',{code:esc(e.why)}):''}</span></div></li>`;}).join('')}</ul>`;
  const errs=fedErrs(s.id).slice(0,10);
  h+=`<h4 class="fu-h4">${tr('fedui.recent_errors')}</h4>`+(errs.length?`<ul class="fu-list">${errs.map(e=>`<li class="fu-item"><div class="grow fu-txt"><span class="mono">${esc(e.why)}</span><span class="meta">${fuWhen(e.t)}${e.node?' · '+esc(e.node):''}</span></div></li>`).join('')}</ul>`:`<p class="meta">${tr('fedui.none_this_session')}</p>`);
  h+=`<p class="meta">${tr('fedui.to_hide_or_shun_a_network')}</p></section>`;
  return h;}
const fuProp=a=>({add_operator:tr('fedui.add_an_operator'),remove_operator:tr('fedui.remove_an_operator'),set_node:tr('fedui.add_or_move_a_node'),remove_node:tr('fedui.remove_a_node')}[a]||esc(a));

/* ---------- one network: read-only status (and an operator's hide and shun) ---------- */
async function fuNetLoad(key){const hides=[];for(const s of FU.srvs){const h=await fedHides(s.id,FU.srvs);if(h){const b=h.rec.body;hides.push({id:s.id,hide:b.hide.includes(key),names:b.names.includes(key),refuse:b.refuse.includes(key)});}}
  let ai=false;try{const st=(await fedNetsStats()).get(key);ai=!!(st&&st.ai)||!!(FU.slice&&FU.slice.rows.some(r=>r.key===key&&r.ai));}catch(e){}
  // The tally only for an operator (from the votes its nodes sent); everyone else knows only excluded or not.
  const op=!!FU.opKey;FU.netInfo={key,op,shun:op?await fedShunInfo(key):await fedExclInfo(key),hides,ai};}
function fuNetHtml(){const key=UI.fu.key,n=FU.nets.get(key),I=FU.netInfo&&FU.netInfo.key===key?FU.netInfo:null,back={v:UI.fu.back||'glass'},f=S&&S.fed;
  if(!n)return fuHead('🔭 '+tr('fedui.looking_glass'),esc(fuShort(key)),back)+`<p class="meta">${tr('fedui.this_network_is_not_known_here')}</p>`;
  const b=n.rec.body,muted=!!f&&f.muted.includes(key),me=!!(f&&f.key&&f.key.pub===key);
  let h=fuHead('🔭 '+tr('fedui.looking_glass'),fuName(key)+(I&&I.ai?' '+fuAi():''),back)+fuMsg();
  h+=`<dl class="fu-dl"><dt>ASN</dt><dd>AS${b.asn}</dd><dt>${tr('fedui.home_market')}</dt><dd>${esc(pieLicCountry(b.home))}</dd>
  <dt>${tr('fedui.peering_policy')}</dt><dd>${fuPolName(b.policy)}</dd><dt>${tr('fedui.pops')}</dt><dd>${b.pops.length}</dd><dt>${tr('fedui.customers')}</dt><dd>${b.cust}</dd>
  <dt>${tr('fedui.game_day')}</dt><dd>${b.day}</dd><dt>${tr('fedui.joined_on')}</dt><dd>${b.founded?fuDate(b.founded):'—'}</dd>
  ${I&&I.ai?`<dt>${tr('fedui.ai_setup')}</dt><dd>${esc(I.ai.model)} · ${esc(I.ai.harness)}</dd>`:''}
  <dt>${tr('fedui.last_heard')}</dt><dd>${fuWhen(n.heard)} · ${fuQuietName(n.quiet.state)}</dd><dt>${tr('fedui.seen_on')}</dt><dd>${(n.srv||[]).length?n.srv.map(fuSrvName).join(', '):'—'}</dd></dl>`;
  if(I){const sh=I.shun;
    if(I.op)h+=`<h3 class="sub4">${tr('fedui.shun_votes')}</h3><p class="meta">${sh.shunned?tr('fedui.excluded_by_the_federation'):tr('fedui.n_of_m_votes_needed',{n:sh.votes,m:sh.need})}</p>`+
      (Object.keys(sh.reasons).length?`<ul class="fu-reasons">${Object.entries(sh.reasons).map(([r,c])=>`<li>${fuReason(r)}: ${trn('fedui.n_servers',c)}</li>`).join('')}</ul>`:'');
    else if(sh.shunned)h+=`<p class="why">${tr('fedui.excluded_by_the_federation')}</p>`;
    const hid=I.hides.filter(x=>x.hide||x.names||x.refuse);if(hid.length)h+=`<p class="meta">${tr('fedui.hidden_by_list',{list:hid.map(x=>fuSrvName(x.id)).join(', ')})}</p>`;}
  if(f&&!me)h+=`<div class="btns">${f.on&&!muted&&!['dark','forgotten'].includes(n.quiet.state)?btn(tr('fedplay.deals'),'fpNet',{key},'sm'):''}${btn(muted?tr('fedui.unmute'):tr('fedui.mute'),'fuMute',{key,on:!muted},'ghost sm')}${f.on&&fedHasPriv(f)?btn('🚩 '+tr('fedui.report'),'fuReport',{key},'ghost sm'):''}</div><p class="meta">${tr('fedui.muting_hides_a_network_from_your')}</p>`;
  // Operators: per server they operate, hide and shun with pre-made reasons only.
  const ops=FU.srvs.filter(s=>fuOpOf(s.id));
  if(ops.length&&I)for(const s of ops){const hd=I.hides.find(x=>x.id===s.id)||{},mine=FU.votes.filter(v=>v.rec.body.server===s.id&&v.rec.body.target===key).sort((a,b)=>b.rec.t-a.rec.t)[0],voted=mine&&mine.rec.kind==='shun',dis=!fedConnTo(s.id)||FU.busy;
    h+=`<section class="fu-op"><h3 class="sub4">🛠️ ${tr('fedui.operator_actions_on_server',{server:esc(s.name)})}</h3>${dis&&!FU.busy?`<p class="note">${tr('fedui.operator_actions_travel_over_the_game')}</p>`:''}
    <div class="btns">${btn(hd.hide?tr('fedui.unhide'):tr('fedui.hide_from_boards'),'fuOpHide',{srv:s.id,key,list:'hide',on:!hd.hide},'ghost sm',dis)}${btn(hd.names?tr('fedui.show_name'):tr('fedui.hide_name'),'fuOpHide',{srv:s.id,key,list:'names',on:!hd.names},'ghost sm',dis)}</div>
    <p class="meta">${voted?tr('fedui.this_server_votes_to_shun_reason',{reason:fuReason(mine.rec.body.reason)}):tr('fedui.vote_to_shun_pick_a_reason')}</p>
    <div class="btns">${voted?btn(tr('fedui.withdraw_the_vote'),'fuOpShun',{srv:s.id,key,reason:null},'ghost sm',dis):['cheating','offensive_name','spam','abuse'].map(r=>btn(fuReason(r),'fuOpShun',{srv:s.id,key,reason:r},'ghost sm red',dis)).join('')}</div></section>`;}
  return h;}
