/* ---------- Short panels: a first page of every long list, explanations behind a "?" ----------
   The city and link panels are where most of the game is played, and on a phone they are a sheet a few hundred
   pixels tall. So a long list (members of an exchange, transit sellers, PNIs, links) shows a short first page with
   "+N more", and once you run a real network the paragraphs that explain a section fold behind a "?" next to its
   heading. What is unfolded is view state for the panel on screen: another city, link or tab starts short again. */
const PN_STEP=20;
function pnState(){const s=UI.sel,at=s?s.type+':'+s.id+(s.type==='city'?':'+UI.tab:''):'';if(!UI.pn||UI.pn.at!==at)UI.pn={at,n:{},open:{}};return UI.pn;}
// How many rows of list k to show out of tot: the first page, or all of them when "more" would hide only one or two.
const pnN=(k,tot,first=6)=>tot<=first+2?tot:pnState().n[k]||first;
const pnMore=(k,tot,lab,first=6)=>tot>pnN(k,tot,first)?`<div class="btns pnmore">${btn(lab(tot-pnN(k,tot,first)),'panelMore',{k,n:pnN(k,tot,first)},'ghost sm')}</div>`:'';
const pnOpen=k=>!!pnState().open[k];
// Past the early game: four POPs. Puzzles and the architect keep every explanation.
const pnVet=()=>!!S&&!pzOn()&&!S.ar&&Object.keys(S.pops).length>=4;
// A section heading and its explanation. `lead` is the finished HTML of the paragraph(s).
const pnQ=k=>{const o=pnOpen('h:'+k);return `<button class="hb${o?' on':''}" data-act="panelFold" data-args='{"k":"h:${k}"}' aria-expanded="${o}" aria-label="${esc(tr('panel_folds.what_is_this'))}" title="${esc(tr('panel_folds.what_is_this'))}">?</button>`;};
function pnHead(k,title,lead){const v=pnVet(),o=v&&pnOpen('h:'+k);
  return `<h3>${title}${v?pnQ(k):''}</h3>${!v||o?lead:''}`;}
// A paragraph that only explains: shown early on, and with its section's "?" afterwards.
const pnNote=(k,html)=>!pnVet()||pnOpen('h:'+k)?html:'';
// Long tabs get a row of chips that jump to a section; it stays pinned while the tab scrolls.
const pnJump=list=>`<div class="pnjump">${list.map(([k,l])=>btn(l,'panelJump',{k},'ghost sm')).join('')}</div>`;
const pnAnchor=k=>`<div data-sec="${k}"></div>`;
// A folded block with its own toggle; `body` is a function, so a folded block costs nothing to render.
function pnFold(k,label,body){const o=pnOpen(k);return `<div class="btns pnfold">${foldB(label,'panelFold',{k},o)}</div>${o?body():''}`;}
/* A tab in sections (the Peering tab, the back half of Infra): each one is a heading with a one-line summary that
   unfolds it. Mode 0 is folded, 1 shows only what needs you (a hot port, something worth ordering), 2 all of it.
   Early in the game every section is open; later a section opens by itself only for what needs you, and a tap on the
   heading folds or unfolds it for as long as this panel stays on screen. A search opens the sections it finds
   something in (hit: how many it finds; a section without hit ignores the search) and folds the others.
   s: {sum, flags:[[class,text]], tot, hit, lead, body(mode)}; body is only called for an open section. */
const pnSecMode=(k,flag,hit)=>{const v=pnState().open['s:'+k];return v!==undefined?(v?2:0):hit!==undefined&&netFiltered()?(hit?2:0):!pnVet()?2:flag?1:0;};
// A new search starts from what it finds, not from what was folded by hand before.
const pnSecReset=()=>{if(!UI.pn)return;for(const k in UI.pn.open)if(k.startsWith('s:'))delete UI.pn.open[k];};
function pnSec(k,title,s){const fl=s.flags||[],m=pnSecMode(k,fl.length>0,s.hit),v=pnVet();
  return `<section class="psec${m?' on':''}" data-sec="${k}"><div class="psh"><button class="psb" data-act="panelFold" data-args='{"k":"s:${k}","o":${m?0:1}}' aria-expanded="${!!m}"><span class="psa">${m?'▾':'▸'}</span><span class="pst">${title}</span><span class="pss">${s.sum||''}</span>${fl.map(([c,t])=>`<span class="tag psf ${c}">${t}</span>`).join('')}</button>${m&&v&&s.lead?pnQ(k):''}</div>${m?(s.lead&&(!v||pnOpen('h:'+k))?s.lead:'')+s.body(m)+(m===1?`<div class="btns pnmore">${btn(tr('notifications.show_all_n',{n:s.tot}),'panelFold',{k:'s:'+k,o:1},'ghost sm',false,'',' aria-expanded="false"')}</div>`:''):''}</section>`;}
// A use bar and its number on one line: what a folded port shows.
const pnUse=(u,cap)=>`<div class="cuse"><div class="bar ${barCls(cap?u/cap:0)}"><i style="width:${cap?Math.min(100,u/cap*100):0}%"></i></div><b>${fmtG(u)}</b></div>`;
// nm: what it changes, so a screen reader hears "Change: Level Tree" and not a row of "Change".
const pnChg=(k,o,nm)=>foldB(tr('connections.change'),'panelFold',{k},o,'ghost sm',nm?tr('common.change_name',{name:nm}):'');
