/* ================= AGENT API: what is on screen =================
   The surfaces a player can read, as text with numbered buttons, by the name screen takes. The left drawer has tabs
   (goals, deals, noc, nets). */
const API_ROOT={modal:'modal',bank:'bankBox',dash:'dash',panel:'panel',left:'leftBody',puzzle:'pzBox'};
const apiShown=w=>{const el=$(API_ROOT[w]);return !!el&&!el.hidden;};
const apiModalOpen=()=>apiShown('modal');
// A window the player opened by hand (API_MODAL.hand, 75-mode.js) is theirs: a tool reads it but never answers,
// closes or replaces it, and it is never a question the game is waiting on.
const apiPlayerWin=()=>apiModalOpen()&&API_MODAL.hand;
// The buttons of the last screen a tool read, for click. Set by apiScreen.
let API_LAST=[];
function apiControls(root,player){
  const out=[];
  for(const b of root.querySelectorAll('[data-act],select[data-chg]')){
    const o=b.dataset.act?{label:apiText(b,200).replace(/\n/g,' ')||b.getAttribute('aria-label')||b.dataset.act,act:b.dataset.act,args:apiParse(b.dataset.args),disabled:!!b.disabled}
      // A list the game acts on when its value changes (the change handler in 96-map/95-clicks.js): click it with a value.
      :{label:b.getAttribute('aria-label')||(b.closest('label')&&apiText(b.closest('label'),120).split('\n')[0])||b.dataset.chg,
        select:b.dataset.chg,value:b.value,options:[...b.options].map(o=>({value:o.value,label:o.textContent.trim()})),disabled:!!b.disabled};
    if(player)o.player=true;
    out.push(o);}
  return out;}
function apiScreen(where,offset=0){
  if(where===null)where=undefined;
  if(where!==undefined&&!API_ROOT[where])apiFail(`where is one of ${Object.keys(API_ROOT).join(', ')}.`);
  const open=Object.keys(API_ROOT).filter(w=>w!=='left'&&apiShown(w));
  const w=where||['modal','bank','dash','panel','puzzle'].find(apiShown)||'panel';
  const root=$(API_ROOT[w]),player=w==='modal'&&apiPlayerWin();
  API_LAST=root?apiControls(root,player):[];
  const all=root?apiFullText(root):'',from=Math.max(0,Math.floor(+offset)||0),more=all.length-from-API_MAX_TEXT;
  const out={where:w,open,selected:UI.sel,tab:UI.tab};
  if(w==='left')out.leftTab=UI.left||'goals';
  if(w==='modal'){out.question=!!apiDecision();if(player)out.playerWindow='the player opened this window: read it, but its buttons are theirs to press';}
  out.text=all.slice(from,from+API_MAX_TEXT);
  if(from)out.textFrom=from;
  if(more>0)out.textMore=`${more} more characters: call screen with where "${w}" and offset ${from+API_MAX_TEXT}`;
  out.buttons=API_LAST.map((b,i)=>({n:i,...b}));
  return out;}

/* ---------- windows: the tool's own sheets, and the game's questions ----------
   A window the tool opened itself (a view, a draft, the link window, a sheet it clicked inside) is something to read
   and click through. A window the game opened in answer to a game command, or during a day, is a question when one
   of its buttons runs a game command other than closeModal (a De-Kicks quote, a retention offer); then other game
   commands wait until it is answered or closed, as clicks outside an open window do in the game. */
let API_SHEET=null;
const apiCard=()=>$('modalCard').firstChild;
const apiMarkSheet=()=>{API_SHEET=apiModalOpen()&&!apiPlayerWin()?apiCard():null;};
const apiIsSheet=()=>apiModalOpen()&&!!API_SHEET&&apiCard()===API_SHEET;
function apiDecision(){
  if(!apiModalOpen()||apiIsSheet()||apiPlayerWin())return null;
  const b=[...$('modal').querySelectorAll('[data-act]')].filter(x=>x.dataset.act!=='closeModal'&&API_CMD[x.dataset.act]);
  if(!b.length)return null;
  return {text:apiText($('modal'),1500),options:b.map(x=>({command:x.dataset.act,args:apiParse(x.dataset.args),label:apiText(x,120).replace(/\n/g,' ')}))};}

/* A player's window stays where it is: its very nodes are set aside while a tool's command runs, and put back after,
   so typed text survives. Only a question the game asks in answer to the tool's move takes the screen, as it would
   after a click. */
function apiHold(){const m=$('modal'),c=$('modalCard');
  return {nodes:[...c.childNodes],cls:m.className,aria:c.getAttribute('aria-modal'),setOpen:UI.setOpen,pending:UI.pending};}
function apiRestore(h){const m=$('modal'),c=$('modalCard');
  if(!m.hidden&&m.className===h.cls&&c.childNodes.length===h.nodes.length&&h.nodes.every((n,i)=>c.childNodes[i]===n)){API_MODAL.hand=true;return;}
  m.className=h.cls;if(h.aria!==null)c.setAttribute('aria-modal',h.aria);c.replaceChildren(...h.nodes);
  if(m.hidden)markLayer();m.hidden=false;UI.setOpen=h.setOpen;UI.pending=h.pending;API_MODAL.hand=true;API_SHEET=null;}

function apiPanel({city:c,link,network:q,tab,left}={}){
  if(left!==undefined){if(!['goals','deals','noc','nets'].includes(left))apiFail('left is one of goals, deals, noc, nets.');ACT.leftTab({t:left});return apiScreen('left');}
  if(c)UI.sel={type:'city',id:apiCityOf(c).id};
  else if(link){if(!S.links.some(l=>l.id===link))apiFail(`No link ${link}. See status or hot_spots for link ids.`);UI.sel={type:'link',id:link};}
  else if(q)ACT.netFocus({id:apiNetOf(q).id});
  if(tab)UI.tab=tab;
  renderAll();
  return apiScreen(q?'left':'panel');}
function apiOpenLink(a,b){
  const x=apiCityOf(a).id,y=apiCityOf(b).id;
  if(!S.pops[x])apiFail(`A link starts at one of your POPs: ${apiMyPops()}.`);
  if(apiPlayerWin())apiFail('The player has a window open, and the link window would replace it. Use act buildLink, orderDf or orderCable, or wait until it is closed.');
  apiTake();
  openLinkModal(x,y);
  apiMarkSheet();
  return {toasts:apiToastLines(apiTake()),screen:apiScreen()};}
