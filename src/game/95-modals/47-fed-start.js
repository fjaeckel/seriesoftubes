/* ================= MULTIPLAYER: starting a new game on a server =================
   The title screen's "Play with others" switch, under the Normal door only (multiplayer is Normal only: fedEligible)
   and only where the browser signs and seals (fuCan). Off by default; on when an invite link is waiting, or when this
   device started its last new game that way (remembered in localStorage, a convenience, never forced).
   The registry is fetched only when the player turns the switch on. Switched on by itself (an invite, the remembered
   choice) the picker reads the catalog this browser already has, so drawing the title never adds a request.
   The chosen node URL rides with the new game (beginGame o.fed -> UI.fedGo); once the charter is signed (fuInviteGo)
   the game joins it without opening the join sheet, and starts solo with a toast when that fails. */
const FS={srvs:null,busy:false,fetched:false};
FU_NOS.push('fsSet','fsPick');// they work on the title screen, before any game
// The remembered choice for the next new game on this device: {on, url}.
function fsMem(v){if(v){try{localStorage.setItem('sot-fed-start',JSON.stringify(v));}catch(e){}return v;}
  let o=null;try{o=JSON.parse(localStorage.getItem('sot-fed-start')||'null');}catch(e){}
  return {on:!!o&&o.on===true,url:!!o&&typeof o.url==='string'&&!FdUrl(o.url)?o.url:null};}
const fsCan=()=>{fuCan();return FU.can===true;};
// This title screen's switch: made once, from an invite or the remembered choice.
function fsUI(){if(!UI.fs){const inv=fuInv()||null,m=fsMem();UI.fs={on:inv?true:m.on,url:inv||m.url,typed:'',inv};}return UI.fs;}
const fsNode=s=>s&&s.nodes&&s.nodes[0]&&s.nodes[0].url||null;
const fsOf=url=>(FS.srvs||[]).find(s=>(s.nodes||[]).some(n=>n.url===url))||null;
const fsSel=()=>UI.fs?UI.fs.typed.trim()||UI.fs.url:null;
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
const fsRow=(r,on)=>`<button class="fs-srv${on?' on':''}" role="radio" aria-checked="${on}" data-url="${esc(r.url)}" data-act="fsPick" data-args="${esc(JSON.stringify({url:r.url}))}"><b>${r.s?esc(r.s.name):`<span class="mono">${esc(r.url)}</span>`}${r.url===UI.fs.inv?` <span class="fu-tag on">${tr('fedui.you_were_invited')}</span>`:''}</b><span class="meta">${r.s?fuPolicy(r.s):tr('fedui.policy_unknown')}</span></button>`;
function fsList(){const rows=fsRows(),sel=UI.fs.typed.trim()?null:UI.fs.url;
  return rows.length?`<div class="fs-list" role="radiogroup" aria-labelledby="fsLbl">${rows.map(r=>fsRow(r,r.url===sel)).join('')}</div>`:`<p class="meta">${FS.busy?tr('fedui.looking_for_servers'):tr('fedui.no_servers_known_yet')}</p>`;}
function fsHtml(){if(!fsCan())return '';const f=fsUI();
  return `<div class="fstart${f.on?' on':''}"><div class="fs-head"><label class="f" id="fsLbl" for="fsTog">🌐 ${tr('fedui.play_with_others')}</label><button class="fs-tog" id="fsTog" role="switch" aria-checked="${f.on}" data-act="fsSet" data-args='{"on":${!f.on}}'><span aria-hidden="true"></span></button></div>
  ${f.on?`<p class="meta">${tr('fedui.your_network_joins_once_its_charter')} ${tr('fedui.names_are_public')}</p><div id="fsList">${fsList()}</div>
  <label class="f" for="fsUrl">${tr('fedui.or_type_a_server_address')}</label><input class="t" id="fsUrl" type="url" inputmode="url" placeholder="wss://…" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(f.typed)}">`:''}</div>`;}
// Redraws the switch in place (the name being typed stays); only the list while the address field has focus.
function fsPaint(){const b=$('fsBox');if(!b)return;const l=$('fsList');
  if(l&&document.activeElement&&document.activeElement.id==='fsUrl'){l.innerHTML=fsList();return;}b.innerHTML=fsHtml();fsBind();}
function fsBind(){const i=$('fsUrl');if(i)i.addEventListener('input',e=>{UI.fs.typed=e.target.value;const sel=UI.fs.typed.trim()?null:UI.fs.url;
    document.querySelectorAll('.fs-srv').forEach(x=>{const on=x.dataset.url===sel;x.classList.toggle('on',on);x.setAttribute('aria-checked',on);});});
  if(UI.fs&&UI.fs.on&&FS.srvs===null&&!FS.busy)fsLoad(false);}
// The cached catalog at once, then (when the player asked: net) the registry fetched afresh, once per page.
async function fsLoad(net){if(FS.busy)return;FS.busy=true;
  try{FS.srvs=await fedServers();fsPick0();fsPaint();
    if(net&&!FS.fetched){FS.fetched=true;await fedCatalogLoad().catch(()=>false);FS.srvs=await fedServers();}}
  catch(e){FS.srvs=FS.srvs||[];}
  FS.busy=false;fsPick0();fsPaint();}
const fsPick0=()=>{if(UI.fs&&!UI.fs.url)UI.fs.url=fsDefault(FS.srvs||[]);};
/* What the switch says for the game being started (and remembered for the next one): a node URL, false (shown and
   off), undefined (not shown: another door, no crypto, no title) or null (on, but no server picked or typed). */
function fsChoice(){if(UI.mode==='sandbox'||!UI.fs||!fsCan()||!$('fsTog')||$('modal').hidden)return undefined;const f=UI.fs,url=fsSel()||null;
  if(f.on&&!url)return null;fsMem({on:f.on,url:url||f.url||null});UI.fs=null;return f.on?url:false;}
/* After the charter: joins, then waits for the first word from the server. Connected: a toast and the dot. Offline,
   refused or no answer in time: back to solo (fedLeave), and a toast with the way to the join sheet. A hidden tab
   ('waiting') stays joined and connects when it is seen. */
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
