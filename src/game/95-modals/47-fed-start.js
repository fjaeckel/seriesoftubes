/* ================= MULTIPLAYER: starting a new game on a server =================
   The title screen's "Play with others" switch, under the Normal door only (multiplayer is Normal only: fedEligible)
   and only where the browser signs and seals (fuCan). Off by default; on when an invite link is waiting, or when this
   device started its last new game that way (remembered in localStorage, a convenience, never forced).
   Multiplayer is picked online only: offline the switch is shown off and disabled, and follows the online/offline
   events while the title is up (an invite or the remembered choice comes back with the connection).
   The registry is fetched only when the player turns the switch on. Switched on by itself (an invite, the remembered
   choice) the picker reads the catalog this browser already has, so drawing the title never adds a request.
   The switch stays on only with something to join: a listed server, the invite, or a valid typed address. A list
   that cannot be fetched or lists nobody turns it back off with a note, and typing a valid address turns it on again
   (private servers). So Start never meets "on but no server" and is never blocked by it.
   The chosen node URL rides with the new game (beginGame o.fed -> UI.fedGo); once the charter is signed (fuInviteGo)
   the game joins it without opening the join sheet, and starts solo with a toast when that is refused. */
const FS={srvs:null,busy:false,fetched:false,failed:false,want:false};
FU_NOS.push('fsSet','fsPick');// they work on the title screen, before any game
// The remembered choice for the next new game on this device: {on, url}.
function fsMem(v){if(v){try{localStorage.setItem('sot-fed-start',JSON.stringify(v));}catch(e){}return v;}
  let o=null;try{o=JSON.parse(localStorage.getItem('sot-fed-start')||'null');}catch(e){}
  return {on:!!o&&o.on===true,url:!!o&&typeof o.url==='string'&&!FdUrl(o.url)?o.url:null};}
const fsCan=()=>{fuCan();return FU.can===true;};
const fsOnline=()=>typeof navigator==='undefined'||navigator.onLine!==false;
// This title screen's switch: made once, from an invite or the remembered choice. note: why it fell back off.
function fsUI(){if(!UI.fs){const inv=fuInv()||null,m=fsMem();UI.fs={on:inv?true:m.on,url:inv||m.url,typed:'',inv,note:null};}return UI.fs;}
const fsNode=s=>s&&s.nodes&&s.nodes[0]&&s.nodes[0].url||null;
const fsOf=url=>(FS.srvs||[]).find(s=>(s.nodes||[]).some(n=>n.url===url))||null;
const fsSel=()=>UI.fs?UI.fs.typed.trim()||UI.fs.url:null;
const fsTyped=()=>{const t=UI.fs?UI.fs.typed.trim():'';return t&&!FdUrl(t)?t:null;};
// A server's name for a toast: from the catalog (the session's own load of it first, when one runs), else the address.
async function fsName(url){try{await (FED.live&&FED.live.cat);FS.srvs=await fedServers();}catch(e){}const s=fsOf(url);return s?esc(s.name):esc(url);}
/* Nothing picked yet: the open registry server whose node answered the registry's liveness check most recently (then
   by name), else any registry server the same way, else one only heard of through gossip. */
function fsDefault(L){const by=(a,b)=>(b.answered||0)-(a.answered||0)||a.name.localeCompare(b.name),reg=L.filter(s=>s.source==='registry'&&fsNode(s));
  return fsNode(reg.filter(s=>s.sync==='open').sort(by)[0]||reg.sort(by)[0]||L.find(fsNode));}
// The rows: an address the catalog does not know (the invite first), the invited server, then registry servers by name.
function fsRows(){const f=UI.fs,L=(FS.srvs||[]).filter(fsNode).sort((a,b)=>(a.source==='registry'?0:1)-(b.source==='registry'?0:1)||a.name.localeCompare(b.name)),inv=f.inv&&fsOf(f.inv);
  if(inv){L.splice(L.indexOf(inv),1);L.unshift(inv);}
  const at=s=>[f.url,f.inv].find(u=>u&&(s.nodes||[]).some(n=>n.url===u))||fsNode(s);
  return [f.inv,f.url].filter((u,i,a)=>u&&a.indexOf(u)===i&&!fsOf(u)).map(url=>({url,s:null})).concat(L.map(s=>({url:at(s),s})));}
/* Something to join: a valid typed address or the invite always; otherwise a row, but not after the list the player
   asked for could not be fetched (an older cached list does not count then). */
const fsUsable=()=>!!UI.fs&&(!!fsTyped()||!!UI.fs.inv||!(FS.fetched&&FS.failed)&&fsRows().length>0);
// On with nothing to join falls back off: with a note when the player asked for the list (said), silently otherwise.
function fsCheck(said){const f=UI.fs;if(!f||FS.busy)return;
  if(f.on&&!fsUsable()){f.on=false;f.note=said?(FS.failed?'fail':'empty'):null;}
  else if(!f.on&&f.note&&fsOnline()&&fsTyped()){f.on=true;f.note=null;}}
const fsRow=(r,on)=>`<button class="fs-srv${on?' on':''}" role="radio" aria-checked="${on}" data-url="${esc(r.url)}" data-act="fsPick" data-args="${esc(JSON.stringify({url:r.url}))}"><b>${r.s?esc(r.s.name):`<span class="mono">${esc(r.url)}</span>`}${r.url===UI.fs.inv?` <span class="fu-tag on">${tr('fedui.you_were_invited')}</span>`:''}</b><span class="meta">${r.s?fuPolicy(r.s):tr('fedui.policy_unknown')}</span></button>`;
function fsList(){const rows=fsRows(),sel=UI.fs.typed.trim()?null:UI.fs.url;
  return rows.length?`<div class="fs-list" role="radiogroup" aria-labelledby="fsLbl">${rows.map(r=>fsRow(r,r.url===sel)).join('')}</div>`:`<p class="meta">${FS.busy?tr('fedui.looking_for_servers'):tr('fedui.no_servers_known_yet')}</p>`;}
const fsNote=f=>!fsOnline()?tr('fedui.multiplayer_needs_a_connection'):f.note==='fail'?tr('fedui.couldn_t_reach_the_server_list'):f.note==='empty'?tr('fedui.no_servers_listed_yet'):'';
const fsTog=on=>{const b=$('fsTog');if(b){b.setAttribute('aria-checked',on);b.dataset.args=JSON.stringify({on:!on});}const x=b&&b.closest('.fstart');if(x)x.classList.toggle('on',on);};
function fsHtml(){if(!fsCan())return '';const f=fsUI(),net=fsOnline(),on=f.on&&net,note=fsNote(f);
  return `<div class="fstart${on?' on':''}"><div class="fs-head"><label class="f" id="fsLbl" for="fsTog">${fuIcon()} ${tr('fedui.play_with_others')}</label><button class="fs-tog" id="fsTog" role="switch" aria-checked="${on}"${net?'':' disabled'} data-act="fsSet" data-args='{"on":${!on}}'><span aria-hidden="true"></span></button></div>
  ${note?`<p class="meta fs-note" id="fsNote" role="status">${note}</p>`:''}${on?`<p class="meta">${tr('fedui.your_network_joins_once_its_charter')} ${tr('fedui.names_are_public')}</p><div id="fsList">${fsList()}</div>`:''}
  ${on||net&&f.note?`<label class="f" for="fsUrl">${tr('fedui.or_type_a_server_address')}</label><input class="t" id="fsUrl" type="url" inputmode="url" placeholder="wss://…" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(f.typed)}">`:''}</div>`;}
// Redraws the switch in place (the name being typed stays); only the list while the address field has focus.
function fsPaint(){const b=$('fsBox');if(!b)return;const l=$('fsList'),t=$('fsTog'),typing=document.activeElement&&document.activeElement.id==='fsUrl';
  if(l&&typing&&t&&t.getAttribute('aria-checked')===String(!!(UI.fs&&UI.fs.on&&fsOnline()))){l.innerHTML=fsList();return;}
  b.innerHTML=fsHtml();fsBind();const i=typing&&$('fsUrl');if(i)i.focus();}
// The address field: typing deselects the rows; a valid address turns a fallen-back switch on, clearing it off again.
function fsBind(){const i=$('fsUrl');if(i)i.addEventListener('input',e=>{const f=UI.fs,was=f.on;f.typed=e.target.value;const sel=f.typed.trim()?null:f.url;
    document.querySelectorAll('.fs-srv').forEach(x=>{const on=x.dataset.url===sel;x.classList.toggle('on',on);x.setAttribute('aria-checked',on);});
    if(!was&&f.note||was&&!fsUsable()){fsCheck(true);if(f.on!==was){fsTog(f.on);const n=$('fsNote'),t=fsNote(f);if(n)n.textContent=t;else if(t)i.insertAdjacentHTML('beforebegin',`<p class="meta fs-note" id="fsNote" role="status">${t}</p>`);if(n&&!t)n.remove();}}});
  if(UI.fs&&UI.fs.on&&fsOnline()&&FS.srvs===null&&!FS.busy)fsLoad(false);}
// Online and offline while the title is up: the switch follows (the remembered choice is never written by this).
function fsNet(){const b=$('fsBox');if(!b||!UI.fs)return;b.innerHTML=fsHtml();fsBind();}
try{addEventListener('online',fsNet);addEventListener('offline',fsNet);}catch(e){}
/* The cached catalog at once, then (when the player asked: net) the registry fetched afresh, once per page unless that
   failed. Asked for while a load runs, the fetch follows it. */
async function fsLoad(net){if(net)FS.want=true;if(FS.busy)return;FS.busy=true;let said=false;
  try{FS.srvs=await fedServers();fsPick0();fsPaint();
    while(FS.want){FS.want=false;if(FS.fetched&&!FS.failed)continue;said=true;FS.fetched=true;
      FS.failed=!(await fedCatalogLoad().catch(()=>false));FS.srvs=await fedServers();}}
  catch(e){FS.srvs=FS.srvs||[];}
  FS.busy=false;fsPick0();fsCheck(said);fsPaint();}
const fsPick0=()=>{if(UI.fs&&!UI.fs.url)UI.fs.url=fsDefault(FS.srvs||[]);};
/* What the switch says for the game being started (and remembered for the next one): a node URL, false (shown and off,
   or offline) or undefined (not shown: another door, no crypto, no title). Never a reason not to start. Offline the
   remembered choice is left as it was. */
function fsChoice(){if(UI.mode==='sandbox'||!UI.fs||!fsCan()||!$('fsTog')||$('modal').hidden)return undefined;const f=UI.fs,url=f.on&&fsSel()||null;UI.fs=null;
  if(!fsOnline())return false;fsMem({on:f.on,url:url||f.url||null});return url||false;}
/* After the charter: joins, then waits for the first word from the server. Connected: a toast and the dot. Refused
   (bad address, crypto, full): solo, with a toast to the join sheet. Offline or no answer in time: still joined, the
   offline dot and a toast. A hidden tab ('waiting') stays joined and connects when it is seen. */
async function fsJoin(url){const s=S,code=await fedJoin(url).catch(()=>'internal');if(S!==s)return;
  if(code){fsFail(code,url);return;}if(UI.fedInvite===url)UI.fedInvite=null;track('fed_join');fuDot();
  let done=false,off=null,t=null;
  const end=ok=>{if(done)return;done=true;if(off)off();FED.clear(t);if(S!==s||!(s.fed&&s.fed.servers.includes(url)))return;
    // Not answering (yet): the game stays joined with the offline dot and connects when the server does; what the
    // player does meanwhile waits in the queue. Only a refused join (bad address, crypto, full) starts solo.
    if(ok)fsName(url).then(n=>{if(S===s)toast(tr('fedui.joined_server',{server:n}),'good');});else fsName(url).then(n=>{if(S===s)toast(tr('fedui.server_not_answering_yet',{server:n}),'',[{l:tr('fedui.see_other_servers'),act:'fuOpen',args:{v:'join'}}]);});fuDot();};
  const look=()=>{const x=FED.st[url];if(x&&x.state==='connected')end(true);else if(x&&x.state==='offline')end(false);};
  off=fedOn('status',look);t=FED.set(()=>{const x=FED.st[url];if(x&&x.state==='waiting'){done=true;off();}else end(false);},FED.T.open*2);look();}
async function fsFail(code,url){const s=S,m=tr('fedui.your_network_starts_solo_why',{why:fuErrText(code)});
  if(S===s)toast(m,'bad',[{l:tr('fedui.join_a_server'),act:'fuOpen',args:{v:'join'}}]);}
