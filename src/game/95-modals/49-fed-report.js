/* ---------- MULTIPLAYER: reporting a network, and the reports an operator gets ----------
   A player reports a network to the operators of servers it joined (60-features/88-fed-report.js): a pre-made reason,
   which servers, and whether to mute it too. Nothing else is asked or sent. An operator's panel lists what players
   reported about networks on that server, as counts, with the reporters' network names only on demand. */
// The report sheet's choices: {key, reason, srvs (ids), mute}; servers default to where the network was seen.
function fuRepSel(){const key=UI.fu.key,R=FU.rep;let P=UI.fu.rp;
  if(!P||P.key!==key){P=UI.fu.rp={key,reason:null,srvs:null,mute:false};}
  if(P.srvs===null&&R&&R.key===key){const on=R.srvs.filter(s=>s.conn),seen=on.filter(s=>s.seen);P.srvs=(seen.length?seen:on).map(s=>s.id);}
  return P;}
// The joined servers (id, name, connected now, whether the network was seen there) and when this network reported it.
async function fuRepLoad(key){const f=S&&S.fed,n=FU.nets.get(key),seen=new Set(n&&n.srv||[]),srvs=[];
  for(const u of f?f.servers:[]){const s=fuSrvOf(u);if(!s||srvs.some(x=>x.id===s.id))continue;srvs.push({id:s.id,name:s.name,conn:!!fedConnTo(s.id),seen:seen.has(s.id)});}
  FU.rep={key,srvs,done:await fedReportedOf(key)};}
const fuRepBack=()=>UI.fu.back==='deals'?{act:'fuRepBack'}:{v:UI.fu.back||'net'};
function fuRepHtml(){const key=UI.fu.key,f=S&&S.fed,R=FU.rep&&FU.rep.key===key?FU.rep:null;
  let h=fuHead('🚩 '+tr('fedui.report'),fuName(key),fuRepBack())+fuMsg();
  h+=`<p class="tagline">${tr('fedui.report_tells_the_operators')}</p>`;
  if(!f||!f.on||!f.key||!fedHasPriv(f)||f.key.pub===key)return h+`<p class="note">${tr('fedui.report_join_first')}</p>`;
  if(!R)return h+`<p class="meta">${tr('fedui.loading')}</p>`;
  const P=fuRepSel(),pick=P.srvs.filter(id=>R.srvs.some(s=>s.id===id&&s.conn));
  h+=`<h3 class="sub4">${tr('fedui.report_why')}</h3><div class="fu-chips wrap" role="group">${FED_REPORT_WHY.map(r=>`<button class="fu-chip${P.reason===r?' on':''}" aria-pressed="${P.reason===r}" data-act="fuRepPick" data-args="${esc(JSON.stringify({k:'reason',v:r}))}">${fuReason(r)}</button>`).join('')}</div>`;
  h+=`<h3 class="sub4">${tr('fedui.report_to_the_operators_of')}</h3><div class="fu-list">${R.srvs.map(s=>{const on=pick.includes(s.id),was=R.done.get(s.id);
    return `<label class="fu-item" style="cursor:pointer"><input type="checkbox" data-act="fuRepPick" data-args="${esc(JSON.stringify({k:'srv',v:s.id}))}"${on?' checked':''}${s.conn?'':' disabled'}><span class="fed-dot ${s.conn?'connected':'offline'}" aria-hidden="true"></span><span class="grow fu-txt"><b>${esc(s.name)}</b><span class="meta">${s.conn?s.seen?tr('fedui.report_seen_there'):tr('fedui.connected'):tr('fedui.offline')}${was?' · '+tr('fedui.you_reported_it_time',{time:fuWhen(was)}):''}</span></span></label>`;}).join('')}</div>`;
  if(!R.srvs.some(s=>s.conn))h+=`<p class="note">${tr('fedui.not_connected_to_this_server_now')}</p>`;
  const muted=f.muted.includes(key);
  if(!muted)h+=`<label class="setline" style="cursor:pointer"><span><input type="checkbox" data-act="fuRepPick" data-args="${esc(JSON.stringify({k:'mute'}))}"${P.mute?' checked':''}> ${tr('fedui.report_also_mute')}</span></label>`;
  h+=`<div class="btns">${btn(tr('fedui.report_send'),'fuRepGo',{},'pink',FU.busy||!P.reason||!pick.length)}</div><p class="meta">${tr('fedui.report_only_the_operators_see')}</p>`;
  return h;}

/* ---------- the operator panel: reports about networks on this server ---------- */
function fuOpReports(s){const L=FU.reports&&FU.reports.srv===s.id?FU.reports.list:null,c=fedConnTo(s.id),hd=FU.reports&&FU.reports.hide;
  let h=`<h4 class="fu-h4">🚩 ${tr('fedui.reports_from_players')}</h4><p class="meta">${tr('fedui.only_this_server_s_operators_see_reports')}</p>`;
  if(!L)return h+`<p class="meta">${tr('fedui.loading')}</p>`;if(!L.length)return h+`<p class="meta">${tr('fedui.no_reports')}</p>`;
  const dis=!c||FU.busy;
  h+=`<ul class="fu-list">${L.slice(0,100).map(x=>{const key=x.target,hidden=!!hd&&hd.hide.includes(key),why=Object.entries(x.reasons).sort((a,b)=>b[1]-a[1]||fedByStr(a[0],b[0])),top=why[0][0],
      mine=FU.votes.filter(v=>v.rec.body.server===s.id&&v.rec.body.target===key).sort((a,b)=>b.rec.t-a.rec.t)[0],voted=!!mine&&mine.rec.kind==='shun',who=UI.fu.rw===key;
    return `<li class="fu-vote"><span><button class="lnk" data-act="fuOpen" data-args="${esc(JSON.stringify({v:'net',key,back:'server'}))}"><b>${fuName(key)}</b></button>${hidden?` <span class="fu-tag">${tr('fedui.hidden_here')}</span>`:''}${voted?` <span class="fu-tag on">${tr('fedui.voted_to_shun')}</span>`:''}</span>
      <span class="meta">${why.map(([r,n])=>`${fuReason(r)} ${n}`).join(' · ')} · ${trn('fedui.n_players_reported_it',x.reporters.length)} · ${fuWhen(x.t)}</span>
      ${who?`<span class="meta">${tr('fedui.reported_by_list',{list:x.reporters.map(fuName).join(', ')})}</span>`:''}
      <span class="btns">${btn(who?tr('fedui.hide_who_reported'):tr('fedui.who_reported'),'fuRepWho',{key:who?null:key},'ghost sm')}${hidden?'':btn(tr('fedui.hide_from_boards'),'fuOpHide',{srv:s.id,key,list:'hide',on:true},'ghost sm',dis)}${voted?'':btn(tr('fedui.vote_to_shun_reason',{reason:fuReason(top)}),'fuOpShun',{srv:s.id,key,reason:top},'ghost sm red',dis)}</span></li>`;}).join('')}</ul>`;
  if(L.length>100)h+=`<p class="meta">${trn('fedui.n_more_networks',L.length-100)}</p>`;
  return h;}
// What the panel shows of one server's reports (and its hide lists, to say what is hidden already).
async function fuOpReportsLoad(id){FU.reports={srv:id,list:await fedReportsFor(id),hide:await fedHideOf(id)};}
