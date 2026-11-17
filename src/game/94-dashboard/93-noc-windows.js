/* ---------- The wallboard's windows: move them, resize them ----------
   Every panel of the NOC window's wallboard (the strip of numbers on top stays put) is a window on a grid of NW_NCOL columns by
   NW_ROW px rows: [x,y,w,h] in cells, so the layout follows the width of the window and a reload puts it back. A window dropped
   on another sends that one below it, then everything falls as far up as it can: never an overlap, never a gap, so nothing is
   covered, off the screen or lost. Only where the wallboard is wide (45-noc-window.css); narrower, the windows stack as they
   always did and a layout made earlier waits in storage. It is view state of this browser, kept like 48-panel-folds.js keeps
   what you unfolded and read once, validated: nothing here touches S or a save. Mouse, touch and keys all end in nwSettle(). */
const NW_KEY='sot-noc-win',NW_NCOL=24,NW_ROW=20,NW_GAP=10,NW_MINW=7,NW_MINH=8,NW_MAXH=120,NW_FREE=1000;
const NW_DEF=[['map',0,0,14,20],['traffic',0,20,14,15],['alarms',14,0,10,12],['ports',14,12,10,23],['routers',0,35,8,12],['links',8,35,8,12],['money',16,35,8,12]];
const NW_RZ=['n','s','e','w','ne','nw','se','sw'];
const nwDef=()=>NW_DEF.map(([id,x,y,w,h])=>({id,x,y,w,h}));
const nwClone=L=>L.map(i=>({...i}));
const nwFree=()=>innerWidth>NW_FREE;
const nwHit=(a,b)=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h;
const nwOk=(a,lo,hi)=>Number.isInteger(a)&&a>=lo&&a<=hi;
// What is stored must be whole cells inside the grid; a window that is not, or is not there, gets its own place.
function nwRead(){let o=null;try{o=JSON.parse(localStorage.getItem(NW_KEY));}catch(e){}
  const m=o&&o.v===1&&o.w&&typeof o.w==='object'?o.w:{},D=nwDef();
  const good=d=>{const a=m[d.id];return Array.isArray(a)&&a.length===4&&nwOk(a[2],NW_MINW,NW_NCOL)&&nwOk(a[3],NW_MINH,NW_MAXH)&&nwOk(a[0],0,NW_NCOL-a[2])&&nwOk(a[1],0,400);};
  const have=D.filter(good).map(d=>({id:d.id,x:m[d.id][0],y:m[d.id][1],w:m[d.id][2],h:m[d.id][3]}));
  // Stored windows go first, so where one meets a default one they keep their place and the default one makes way.
  const L=nwSettle([...have,...D.filter(d=>!good(d))]);return D.map(d=>L.find(i=>i.id===d.id));}
function nwSave(){try{const w={};for(const i of NOCW.lay)w[i.id]=[i.x,i.y,i.w,i.h];localStorage.setItem(NW_KEY,JSON.stringify({v:1,w}));}catch(e){}}
// The moved window keeps where it lands, except that it goes under a window whose middle is above its top; whatever it lands on goes below it
// (and what that lands on below that); then every window falls up as far as it can. With no moved window it just tidies up.
function nwSettle(L,id){const mv=L.find(i=>i.id===id);
  if(mv){for(let n=0;n<L.length;n++){const b=L.find(i=>i!==mv&&i.y+i.h/2<mv.y&&nwHit(mv,i));if(!b)break;mv.y=b.y+b.h;}
    const q=[mv];for(let n=0;q.length&&n<99;n++){const a=q.shift();for(const b of L)if(b!==mv&&b!==a&&nwHit(a,b)){b.y=a.y+a.h;q.push(b);}}}
  const out=[];for(const c of [...L].sort((a,b)=>a.y-b.y||a.x-b.x)){while(out.some(o=>nwHit(c,o)))c.y++;while(c.y>0&&!out.some(o=>nwHit({...c,y:c.y-1},o)))c.y--;out.push(c);}
  return L;}
// Window m after dragging: d is 'm' (move) or the edges held ('e', 'sw'…), du columns and dv rows from where the drag began.
function nwEdit(m,d,du,dv){const r=m.x+m.w,b=m.y+m.h;
  if(d==='m'){m.x=Math.max(0,Math.min(NW_NCOL-m.w,m.x+du));m.y=Math.max(0,m.y+dv);return m;}
  if(d.includes('e'))m.w=Math.max(NW_MINW,Math.min(NW_NCOL-m.x,m.w+du));
  if(d.includes('w')){m.x=Math.max(0,Math.min(r-NW_MINW,m.x+du));m.w=r-m.x;}
  if(d.includes('s'))m.h=Math.max(NW_MINH,Math.min(NW_MAXH,m.h+dv));
  if(d.includes('n')){m.y=Math.max(0,b-NW_MAXH,Math.min(b-NW_MINH,m.y+dv));m.h=b-m.y;}
  return m;}
// Up and down from the keyboard step over the next window in these columns (a drag is how you put one in between).
function nwHop(L,id,dir){const m=L.find(i=>i.id===id),col=L.filter(o=>o!==m&&o.x<m.x+m.w&&m.x<o.x+o.w);
  const b=dir>0?col.filter(o=>o.y>=m.y+m.h).sort((p,q)=>p.y-q.y)[0]:col.filter(o=>o.y+o.h<=m.y).sort((p,q)=>q.y-p.y)[0];
  if(!b)return false;m.y=dir>0?b.y+b.h:b.y;return true;}
// The cells of every window go to the page as custom properties (the stylesheet turns them into pixels), so a re-render
// of what is inside a window never moves it.
function nwPlace(){const d=$('nwDeck');if(!d||!NOCW.lay)return;let rows=0;
  for(const i of NOCW.lay){const e=d.querySelector(`.nw-win[data-w="${i.id}"]`);if(!e)continue;const s=e.style;
    s.setProperty('--x',i.x);s.setProperty('--y',i.y);s.setProperty('--w',i.w);s.setProperty('--h',i.h);rows=Math.max(rows,i.y+i.h);}
  d.style.setProperty('--rows',rows);}
// The charts are drawn again at the new size (nwResized: a key held down is one change, and a drag ends with one).
function nwCommit(L){NOCW.lay=L;nwPlace();nwSave();nwResized();}
function nwReset(){NOCW.lay=nwDef();try{localStorage.removeItem(NW_KEY);}catch(e){}nwPlace();nwResized();}
// ---------- the mouse and the finger ----------
let NWD=null,nwT=0;
// Cells to pixels: a column is a 24th of the deck (and a gap), a row is NW_ROW.
const nwPitch=()=>{const d=$('nwDeck'),W=(d&&d.getBoundingClientRect().width)||1200;return [(W+NW_GAP)/NW_NCOL,NW_ROW];};
// A press while an earlier drag never got its pointer up (released outside the browser) ends that one first.
function nwGrab(e){if(!nwFree()||e.button||e.isPrimary===false||!NOCW.lay)return;if(NWD)nwDrop({type:'pointercancel'});const w=e.target.closest&&e.target.closest('.nw-win');if(!w)return;
  const rz=e.target.closest('.nw-rz');
  // A window moves by its title bar, but the picker and the buttons in it are still theirs.
  if(!rz&&(!e.target.closest('.nw-h,.nw-grip')||e.target.closest('select,input,a,button:not(.nw-grip)')))return;
  NWD={id:w.dataset.w,d:rz?rz.dataset.d:'m',x:e.clientX,y:e.clientY,L:nwClone(NOCW.lay),pid:e.pointerId,w};
  w.classList.add('nw-drag');document.body.classList.add('nw-dragging');
  try{w.setPointerCapture(e.pointerId);}catch(x){}
  addEventListener('pointermove',nwDrag);addEventListener('pointerup',nwDrop);addEventListener('pointercancel',nwDrop);}
// Always from where the drag began, so pulling a window back puts everything else back too.
function nwDrag(e){if(!NWD||(NWD.pid!==undefined&&e.pointerId!==undefined&&e.pointerId!==NWD.pid))return;
  const [cp,rp]=nwPitch(),L=nwClone(NWD.L);
  nwEdit(L.find(i=>i.id===NWD.id),NWD.d,Math.round((e.clientX-NWD.x)/cp),Math.round((e.clientY-NWD.y)/rp));
  nwSettle(L,NWD.id);NOCW.lay=L;nwPlace();}
function nwDrop(e){if(!NWD)return;removeEventListener('pointermove',nwDrag);removeEventListener('pointerup',nwDrop);removeEventListener('pointercancel',nwDrop);
  const was=NWD;NWD=null;was.w.classList.remove('nw-drag');document.body.classList.remove('nw-dragging');
  if(e.type==='pointercancel'){NOCW.lay=was.L;nwPlace();return;}
  if(JSON.stringify(was.L)!==JSON.stringify(NOCW.lay))nwCommit(NOCW.lay);}
// ---------- the keyboard ----------
// Arrows move the window, Shift and arrows resize it from its bottom right corner. Sideways never shoves a neighbour: where it
// would, nothing happens (make the neighbour smaller first), and up and down step over the next window.
function nwKey(e){const g=e.target&&e.target.closest&&e.target.closest('.nw-grip');if(!g||!nwFree()||e.altKey||e.ctrlKey||e.metaKey)return;
  const dx=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0,dy=e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0;if(!dx&&!dy)return;e.preventDefault();
  const id=g.dataset.w,L=nwClone(NOCW.lay),m=L.find(i=>i.id===id);if(!m)return;
  if(dy&&!e.shiftKey){if(!nwHop(L,id,dy))return;}
  else{nwEdit(m,e.shiftKey?'se':'m',dx,dy);if(dx&&L.some(i=>i!==m&&nwHit(m,i)))return;}
  nwSettle(L,id);if(JSON.stringify(L)!==JSON.stringify(NOCW.lay))nwCommit(L);}
// ---------- what is drawn in a window ----------
// A chart drawn at the pixels its window gives it: a bigger window shows more chart, not a bigger one. Null where they stack.
function nwSize(id){const e=$(id);if(!nwFree()||!e||!e.clientWidth||!e.clientHeight)return null;const h=e.querySelector('.nw-h');
  return [Math.max(240,e.clientWidth-24),Math.max(110,e.clientHeight-20-(h?h.offsetHeight+6:40))];}
const nwWin=(id,name,inner)=>`<div class="nw-win" data-w="${id}">${inner}<button class="nw-grip" type="button" data-w="${id}" aria-label="${esc(tr('noc.move_or_resize_name',{name}))}" title="${esc(tr('noc.drag_the_title_to_move_it'))}"><svg viewBox="0 0 10 16" aria-hidden="true">${[3,8,13].map(y=>`<circle cx="2.5" cy="${y}" r="1.4"/><circle cx="7.5" cy="${y}" r="1.4"/>`).join('')}</svg></button>${NW_RZ.map(d=>`<i class="nw-rz" data-d="${d}" aria-hidden="true"></i>`).join('')}</div>`;
// Drawn again once the wallboard or a window has stopped changing size (a key held down is one change).
const nwResized=()=>{clearTimeout(nwT);nwT=setTimeout(()=>{if(NOC.win&&NOCW.view==='wall'&&S)nocRender();},250);};
