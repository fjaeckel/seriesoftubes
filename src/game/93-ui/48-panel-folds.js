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
function pnHead(k,title,lead){const v=pnVet(),o=v&&pnOpen('h:'+k);
  return `<h3>${title}${v?`<button class="hb${o?' on':''}" data-act="panelFold" data-args='{"k":"h:${k}"}' aria-expanded="${o}" aria-label="${esc(tr('panel_folds.what_is_this'))}" title="${esc(tr('panel_folds.what_is_this'))}">?</button>`:''}</h3>${!v||o?lead:''}`;}
// A paragraph that only explains: shown early on, and with its section's "?" afterwards.
const pnNote=(k,html)=>!pnVet()||pnOpen('h:'+k)?html:'';
// Long tabs get a row of chips that jump to a section; it stays pinned while the tab scrolls.
const pnJump=list=>`<div class="pnjump">${list.map(([k,l])=>btn(l,'panelJump',{k},'ghost sm')).join('')}</div>`;
const pnAnchor=k=>`<div data-sec="${k}"></div>`;
// A folded block with its own toggle; `body` is a function, so a folded block costs nothing to render.
function pnFold(k,label,body){const o=pnOpen(k);return `<div class="btns pnfold">${btn(`${o?'▾':'▸'} ${label}`,'panelFold',{k},'ghost sm')}</div>${o?body():''}`;}
