/* ---------- Short panels: a first page of every long list, explanations behind a "?" ----------
   The city and link panels are where most of the game is played, and on a phone they are a sheet a few hundred
   pixels tall. So a long list (members of an exchange, transit sellers, PNIs, links) shows a short first page with
   "+N more", and once you run a real network the paragraphs that explain a section fold behind a "?" next to its
   heading. What is unfolded is view state for the panel on screen: another city, link or tab starts short again,
   except for the kinds of block in PN_KEYS below, which stay open from one POP to the next. */
const PN_STEP=20;
/* Blocks whose open state follows you from POP to POP (and from link to link), so a port in ten POPs in a row is one click each
   instead of three. The choice belongs to the kind of block (every POP's Internet exchange section, the port controls of its
   first exchange: "Get a port" or "Change"), not to the city or link, and lives in this browser like the theme: never in the
   save. A city without the block keeps it for the next one that has it; folding a block forgets it. A port's fold is told
   apart by its place in its city's list, so three exchanges do not all open for one tap. The same goes for the Change of the
   transit ports and PNIs you hold ("t0", "p0": the first of each) and for every "?" ("h:ix"). Link panels have their own
   kinds: the traffic, metric, selling and line-system sections and the folds under the optics. Left out on purpose: a list's
   page ("+N more") and Decommission (a button that shuts a POP down is opened on purpose). From the fourth POP on (pnVet):
   before that every section is open anyway. */
const PN_KEYS=['s:ix','s:pni','s:cache','s:metro','s:power','s:scrub','s:nni','rtc','std','s:traf','s:met','s:sell','s:ls','tr','ox','su','sp'],PN_LS='sot-folds';
// "x0": the port controls of a city's first exchange, "x1" of its second. One kind whether you have joined it ("Change") or not
// ("Get a port"), so what you opened on an exchange you are in is open on the one you have yet to join, and the other way round.
// "t0", "p0": the Change of the first transit port, the first PNI you hold in a city.
const pnKindOk=q=>PN_KEYS.includes(q)||/^[xtp][0-8]$/.test(q)||/^h:[a-z0-9]{1,8}$/.test(q);
const pnKind=k=>{if(k.startsWith('x:')){const x=k.slice(2),c=ixCity(x),i=CITY[c]?ixIdsIn(c).indexOf(x):-1;return i<0||i>8?'':'x'+i;}
  if(/^[tp]:/.test(k)){const L=S&&(k[0]==='t'?S.transit:S.pni)||[],e=L.find(x=>x.id===k.slice(2)),i=e?L.filter(x=>x.city===e.city).indexOf(e):-1;return i<0||i>8?'':k[0]+i;}
  return pnKindOk(k)&&!/^[xtp]\d$/.test(k)?k:'';};
// {kind:1} for the kinds left open: read once from this browser and checked like any stored value.
function pnPrefs(){if(!UI.pnPref){const p={};try{const j=JSON.parse(localStorage.getItem(PN_LS)||'null');for(const q in j)if(pnKindOk(q)&&j[q]===1)p[q]=1;}catch(e){}UI.pnPref=p;}return UI.pnPref;}
function pnState(){const s=UI.sel,at=s?s.type+':'+s.id+(s.type==='city'?':'+UI.tab:''):'';if(!UI.pn||UI.pn.at!==at)UI.pn={at,n:{},open:{}};return UI.pn;}
// Does the kind of block k stay open from the last POP?
const pnStuck=k=>{const q=pnKind(k);return !!q&&pnVet()&&pnPrefs()[q]===1;};
// A fold is set here: this panel shows it now, and the next POP starts from it.
function pnSet(k,v){pnState().open[k]=v;const q=pnKind(k),p=pnPrefs();if(!q||!pnVet()||!!p[q]===v)return;
  if(v)p[q]=1;else delete p[q];try{if(Object.keys(p).length)localStorage.setItem(PN_LS,JSON.stringify(p));else localStorage.removeItem(PN_LS);}catch(e){}}
// How many rows of list k to show out of tot: the first page, or all of them when "more" would hide only one or two.
const pnN=(k,tot,first=6)=>tot<=first+2?tot:pnState().n[k]||first;
const pnMore=(k,tot,lab,first=6)=>tot>pnN(k,tot,first)?`<div class="btns pnmore">${btn(lab(tot-pnN(k,tot,first)),'panelMore',{k,n:pnN(k,tot,first)},'ghost sm')}</div>`:'';
const pnOpen=k=>{const v=pnState().open[k];return v!==undefined?!!v:pnStuck(k);};
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
// A section left open from the last POP opens again, a city with no exchange included: its section is where you found your own.
const pnSecMode=(k,flag,hit)=>{const v=pnState().open['s:'+k];return v!==undefined?(v?2:0):hit!==undefined&&netFiltered()?(hit?2:0):!pnVet()||pnStuck('s:'+k)?2:flag?1:0;};
// A new search starts from what it finds, not from what was folded by hand before.
const pnSecReset=()=>{if(!UI.pn)return;for(const k in UI.pn.open)if(k.startsWith('s:'))delete UI.pn.open[k];};
function pnSec(k,title,s){const fl=s.flags||[],m=pnSecMode(k,fl.length>0,s.hit),v=pnVet();
  return `<section class="psec${m?' on':''}" data-sec="${k}"><div class="psh"><button class="psb" data-act="panelFold" data-args='{"k":"s:${k}","o":${m?0:1}}' aria-expanded="${!!m}"><span class="psa">${m?'▾':'▸'}</span><span class="pst">${title}</span><span class="pss">${s.sum||''}</span>${fl.map(([c,t])=>`<span class="tag psf ${c}">${t}</span>`).join('')}</button>${m&&v&&s.lead?pnQ(k):''}</div>${m?(s.lead&&(!v||pnOpen('h:'+k))?s.lead:'')+s.body(m)+(m===1?`<div class="btns pnmore">${btn(tr('notifications.show_all_n',{n:s.tot}),'panelFold',{k:'s:'+k,o:1},'ghost sm',false,'',' aria-expanded="false"')}</div>`:''):''}</section>`;}
// A use bar and its number on one line: what a folded port shows.
const pnUse=(u,cap)=>`<div class="cuse"><div class="bar ${barCls(cap?u/cap:0)}"><i style="width:${cap?Math.min(100,u/cap*100):0}%"></i></div><b>${fmtG(u)}</b></div>`;
// nm: what it changes, so a screen reader hears "Change: Level Tree" and not a row of "Change".
const pnChg=(k,o,nm)=>foldB(tr('connections.change'),'panelFold',{k},o,'ghost sm',nm?tr('common.change_name',{name:nm}):'');
