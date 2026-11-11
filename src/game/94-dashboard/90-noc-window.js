/* ---------- The NOC window ----------
   The dashboard in a window of its own, for a second display: this page again, at ?noc=<slot>. It never claims the slot,
   saves or runs a day: the game window stays the only writer, sends it a copy of S and R, and runs its clicks.
   The control channel is small messages, always open so a reloaded game finds its window again; the copies go on a channel
   per network, opened once a window says hello, so other games' tabs never unpack them. With no window nothing is sent. */
const NOC_HB=3000,NOC_LOST=10000,NOC_GAP=1000;
// What a click in the window does: changes only its own view, or runs in the game. Every button the dashboard draws is in one list.
const NOC_LOCAL=['chartToggle','connCity','connF','connNet','connSort','custCity','custF','custSort','dashClose','dashSort','dashTab','listMore','popsReg','popsSort'];
const NOC_GO=['buyIx','buyNni','buyTransit','cache','connCancel','custGo','dashLink','downIx','downP','downT','goConn','lagIx','lagNni','lagP','lagT','leaseSwap','mktCfg','mktHold','mktRoute','netFocus','opsOpen','pni','pniAllOpen','pniChase','popGo'];
const NOC={win:false,id:null,ctl:null,st:null,stId:null,peer:false,until:0,dirty:false,sent:0,speed:1,hid:false,yoAt:0,gone:false};
{const id=RW_IN?null:new URLSearchParams(location.search).get('noc');if(slotOkId(id)){NOC.win=true;NOC.id=id;}}
if(!RW_IN)try{if(typeof BroadcastChannel==='function'){NOC.ctl=new BroadcastChannel('sot-noc');NOC.ctl.onmessage=e=>{const m=e.data;if(!m||typeof m!=='object'||!slotOkId(m.id))return;if(NOC.win)nocWinMsg(m);else nocGameMsg(m);};}}catch(e){}
const nocPost=m=>{try{if(NOC.ctl)NOC.ctl.postMessage(m);}catch(e){console.error('[tubes] NOC window',e);}};
const nocHid=()=>document.visibilityState==='hidden';
// ---------- in the game window ----------
// R as plain data: the routing tables are left out (the dashboard does not read them), an attack names its attack in S by id.
const NOC_SKIP={ef:1,fl:1,efp:1,flc:1,efg:1};
function nocR(){const o={};for(const k in R)if(!NOC_SKIP[k])o[k]=k==='ddos'?R.ddos.map(m=>({...m,attack:m.attack?m.attack.id:null,ports:null})):R[k];return o;}
// Half a day (its routing still in the worker) is never sent, like it is never saved: it stays due.
function nocSend(now){if(!NOC.peer||!S||S.lost||pzOn()||RW.job||!UI.slot)return;
  try{if(NOC.stId!==UI.slot){if(NOC.st)NOC.st.close();NOC.stId=UI.slot;NOC.st=new BroadcastChannel('sot-noc:'+UI.slot);}
    NOC.st.postMessage({S,R:nocR(),speed:UI.speed,hid:nocHid()});NOC.dirty=false;NOC.sent=now;}
  catch(e){console.error('[tubes] NOC window',e);NOC.peer=false;}}
// Every frame while a window is connected: at most one copy a second, whatever the game's speed.
function nocPump(now){if(now>NOC.until){NOC.peer=false;return;}if(NOC.dirty&&now-NOC.sent>=NOC_GAP)nocSend(now);}
function nocGameMsg(m){if(m.id!==UI.slot)return;const now=performance.now();
  if(m.t==='hello'||m.t==='hi'){const was=NOC.peer;NOC.peer=true;NOC.until=now+NOC_LOST;nocPost({t:'yo',id:m.id,speed:UI.speed,hid:nocHid()});
    if(m.t==='hello'||!was){NOC.dirty=true;nocSend(now);}}
  else if(m.t==='bye')NOC.peer=false;
  else if(m.t==='act')nocRun(m,now);}
// A click from the window: the same rules as a click here. A window open in the game comes first, like any click outside it.
function nocRun(m,now){const ts=[],t=toast;
  if(!NOC_GO.includes(m.act)||typeof ACT[m.act]!=='function'||!S||S.lost||pzOn())return;
  if(!$('modal').hidden){nocPost({t:'res',id:m.id,ts:[[tr('noc.the_game_has_a_dialog_open'),'bad']]});return;}
  const a=m.args&&typeof m.args==='object'?m.args:{};
  toast=(h,k,x,o)=>{ts.push([h,k]);return t(h,k,x,o);};
  try{if(m.act==='connCancel')UI.confirm='cc:'+a.k+':'+a.id;ACT[m.act](a);}catch(e){console.error('[tubes] NOC window action',m.act,e);}finally{toast=t;}
  NOC.dirty=true;nocSend(now);nocPost({t:'res',id:m.id,ts});}
// ---------- in the NOC window ----------
function nocWinMsg(m){if(m.id!==NOC.id)return;
  if(m.t==='yo'){NOC.yoAt=performance.now();NOC.gone=false;NOC.speed=m.speed;NOC.hid=!!m.hid;nocBar();}
  else if(m.t==='bye'){NOC.gone=true;nocBar();}
  else if(m.t==='focus'){try{window.focus();}catch(e){}}
  else if(m.t==='res')for(const [h,k] of m.ts||[])toast(h,k);}
function nocWinState(d){if(!d||!d.S||!d.R)return;S=d.S;R=Object.assign(emptyR(),d.R);const as=ddosAll(S,false);for(const m of R.ddos||[]){m.attack=as.find(a=>a.id===m.attack)||null;m.ports=new Map();}
  UI.started=true;NOC.speed=d.speed;NOC.hid=!!d.hid;NOC.gone=false;NOC.yoAt=performance.now();document.title=tr('common.noc_dashboard')+' · '+S.name;nocRender();}
// Not under a finger: a button that moves during a press never gets its click.
function nocRender(){if(pressing){setTimeout(nocRender,150);return;}document.body.classList.toggle('noc-still',!NOC.speed||NOC.gone||!animOn());try{if(S){if(NOCW.view==='wall')nocWall();else renderDash();}}catch(e){console.error('[tubes] NOC window render',e);}nocBar();}
function nocBar(){const b=$('nocBar');if(!b)return;
  const why=NOC.gone?tr('noc.the_game_window_is_closed'):!S?tr('noc.waiting_for_the_game_window'):NOC.hid?tr('noc.the_game_window_is_hidden'):!NOC.speed?tr('noc.the_game_is_paused'):'';
  const {bad,warn}=NOCW.sum,tab=(v,l)=>`<button data-nc="${v}" class="${NOCW.view===v?'on':''}" aria-pressed="${NOCW.view===v}">${esc(l)}</button>`;
  const h=`<div class="nb-id">${S?`<span class="nb-as">AS${S.asn} · ${esc(S.name)} · ${esc(tierLabel())}</span>`:''}<div class="nb-title">${esc(tr('common.noc_dashboard'))}</div></div>`
    +(S?`<span class="nb-pill ${bad?'bad':warn?'warn':''}">${esc(bad?trn('noc.n_alarms',bad):warn?trn('noc.n_warnings',warn):tr('common.all_quiet'))}</span><span class="nb-now"><b>${esc(dateStr(S.day))}</b><span>${esc(fmt$(S.cash))}</span><span>${NOC.speed?NOC.speed+'×':'❚❚'}</span></span>`:'')
    +`<div class="nb-tabs">${tab('wall',tr('noc.wallboard'))}${tab('details',tr('noc.details'))}${document.documentElement.requestFullscreen?`<button data-nc="fs">${esc(tr('noc.full_screen'))}</button>`:''}</div>`
    +(why?`<div class="nb-why">${esc(why)}</div>`:'');
  if(b._h!==h){b._h=h;morph(b,h);}}
function nocBeat(now=performance.now()){nocPost({t:'hi',id:NOC.id});if(now-NOC.yoAt>NOC_LOST&&!NOC.gone){NOC.gone=true;nocBar();}}
function nocFwd(act,a){if(NOC_GO.includes(act))nocPost({t:'act',id:NOC.id,act,args:a||{}});}
function nocWinBoot(){i18nDom();document.body.classList.add('noc-window');UI.dtab='conn';try{UI.anim=localStorage.getItem('sot-anim')||'auto';}catch(e){}$('dash').hidden=true;$('dash').insertAdjacentHTML('beforebegin','<div id="nocBoard"><header id="nocBar"></header><main id="nocWall"></main></div>');
  const bd=$('nocBoard');bd.addEventListener('click',nocUiClick);bd.addEventListener('change',e=>{if(e.target.hasAttribute&&e.target.hasAttribute('data-nc-city')){NOCW.city=e.target.value;nocRender();}});bd.addEventListener('pointerdown',e=>{if(e.target.closest('#nocWall'))pressing=true;});
  // The game's keyboard shortcuts are for the map, which is not here. Tab and the browser's own keys still work.
  addEventListener('keydown',e=>e.stopImmediatePropagation(),true);
  for(const k of Object.keys(ACT))if(!NOC_LOCAL.includes(k))ACT[k]=a=>nocFwd(k,a);
  ACT.dashClose=()=>{try{window.close();}catch(e){}};
  ACT.connCancel=a=>{const key='cc:'+a.k+':'+a.id;if(UI.confirm!==key){UI.confirm=key;renderDash();return;}UI.confirm=null;nocFwd('connCancel',a);};
  try{NOC.st=new BroadcastChannel('sot-noc:'+NOC.id);NOC.st.onmessage=e=>nocWinState(e.data);}catch(e){}
  addEventListener('pagehide',()=>nocPost({t:'bye',id:NOC.id}));
  // A hidden window's timers slow right down, so the game stops sending; coming back asks for the latest.
  document.addEventListener('visibilitychange',()=>{if(!nocHid()){NOC.yoAt=performance.now();nocPost({t:'hello',id:NOC.id});}});
  NOC.yoAt=performance.now();nocBar();nocPost({t:'hello',id:NOC.id});if(!window.__TUBES_TEST__)setInterval(nocBeat,NOC_HB);}
addEventListener('pagehide',()=>{if(!NOC.win&&NOC.peer&&UI.slot)nocPost({t:'bye',id:UI.slot});});
Object.assign(ACT,{
 // A second click finds the window that is already there. A blocked pop-up can only be told by its silence (noopener gives no
 // handle): wait as long as a window may go quiet, since a slow machine loading the whole page can take seconds to say hello.
 nocWindow:()=>{if(!S||pzOn()||!UI.slot)return;const id=UI.slot;if(NOC.peer){nocPost({t:'focus',id});return;}
   window.open(location.pathname+'?noc='+id,'_blank','noopener,popup,width=1320,height=860');
   if(!window.__TUBES_TEST__)setTimeout(()=>{if(!NOC.peer&&UI.slot===id)toast(tr('noc.your_browser_blocked_the_window'),'bad');},NOC_LOST);},
});
