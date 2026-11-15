/* ---------- Orbit customers seen from three places: the NOC's customer list, Pie Control and the POP they land at ----------
   Each place links to the other two (pieXLinks). A terminal customer's POP is the dish it lands on (R.pie.gs, last compute);
   a sky circuit runs between two POPs of yours, so it has no POP of its own here. */
// The orbit flow of customer id in the last compute, or null.
function pieFlowOf(id){const Q=R&&R.pie;if(!Q||!Q.flows)return null;let M=Q._fl;if(!M){M=new Map();for(const f of Q.flows)if(f.k!=='b')M.set(f.id,f);Object.defineProperty(Q,'_fl',{value:M});}return M.get(id)||null;}
// Pie Control lists it: every terminal, and circuits that fly through orbit today.
const pieInSky=b=>pieOn()&&!!S.pie&&!!S.pie.co&&(!!BIZ_T[b.type].orbit||(f=>!!f&&f.k==='c'&&f.g>0)(pieFlowOf(b.id)));
const pieLandOf=b=>BIZ_T[b.type].orbit&&R&&R.pie&&R.pie.gs?R.pie.gs[b.id]||null:null;
// Buttons to the other two views; from: 'noc', 'pie' or 'pop' (the one on screen; here: that POP's city).
function pieXLinks(b,from,here){if(!pieInSky(b))return '';const L=pieLandOf(b);let h='';
  if(from!=='noc')h+=btn(`📊 ${tr('pie_x.in_noc')}`,'custNoc',{id:b.id},'ghost sm');
  if(from!=='pie')h+=btn(`🥧 ${tr('pie.open_pie_control')}`,'pieCust',{id:b.id},'ghost sm');
  if(L&&L!==here)h+=btn(`📍 ${tr('pie_x.pop',{city:CITY[L].name})}`,'piePop',{city:L},'ghost sm');
  return h;}
// One line for where a terminal comes down, or that it does not.
function pieLandTxt(b){if(!BIZ_T[b.type].orbit||!R||!R.pie)return '';const L=pieLandOf(b);return L?tr('pie_x.lands_at',{city:esc(CITY[L].name)}):tr('pie_x.no_dish');}
// The city panel of a dish POP: terminals from elsewhere that come down here (its own city's customers are listed above).
function pieLandHere(c){if(!S.pie||!R||!R.pie||!R.pie.gs)return '';const gs=R.pie.gs,bz=S.biz.filter(b=>gs[b.id]===c&&b.city!==c);if(!bz.length)return '';
  return `<section><h3>🥧 ${tr('pie_x.here_h')}</h3><p class="lead">${trn('pie_x.here_lead',bz.length)}</p>`+
    bz.slice(0,PIE_ROWS).map(b=>`<div class="row"><div class="grow"><div class="nm">${pieIcon(b.type)} ${esc(b.name)}</div><div class="meta">${esc(BIZ_T[b.type].l)} · ${esc(CITY[b.city].name)} · ${bTerms(b)}</div><div class="bar ${moodCls(b.mood)}"><i style="width:${b.mood}%"></i></div><div class="meta">${tr('common.happiness_p',{p:Math.round(b.mood)})}</div><div class="btns">${pieXLinks(b,'pop',c)}</div></div></div>`).join('')+
    (bz.length>PIE_ROWS?`<p class="meta">${trn('pie_traffic.n_more',bz.length-PIE_ROWS)}</p>`:'')+`</section>`;}
// Pie Control's row actions, shown under the highlighted row: the other views and dropping the customer.
function pieRowActs(b){return `<div class="pft-acts btns">${pieXLinks(b,'pie')}${btn(UI.confirm===b.id?tr('common.really_drop'):tr('common.drop'),'pieDrop',{id:b.id},UI.confirm===b.id?'red sm':'ghost sm')}</div>`;}
