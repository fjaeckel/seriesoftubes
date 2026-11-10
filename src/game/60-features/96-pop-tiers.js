/* ---------- POP standards: micro, medium, regional hub (#315) ----------
   Real networks build a few kinds of POP, not one: a small edge site, a medium one, a regional hub. The player saves a
   POP's routers as one of three standards and marks POPs as that kind; a POP is brought up to its standard with one
   button, and every POP of a kind with one more once the standard grows (a new model unlocked, more routers). Which POP
   is which stays the player's choice, so growth stays selective. Never a step down: a POP with a bigger model keeps it.
   The standard for brand-new POPs (#240, 96-pop-standard.js) is a separate thing. From customer level 2, like the intern. */
const POP_TIERS=['micro','medium','hub'];
const POP_TIER_L={micro:N_('pop_tiers.micro'),medium:N_('pop_tiers.medium'),hub:N_('pop_tiers.hub')};
const ptNew=()=>({def:{micro:null,medium:null,hub:null},at:{}});
const ptOn=()=>!!S&&opsCanHire()&&!pzOn();
const ptO=()=>S.popTiers||(S.popTiers=ptNew());
// Saves are untrusted: known kinds, router models that exist, POPs that still exist.
function ptSanitize(s){const o=s.popTiers&&typeof s.popTiers==='object'&&!Array.isArray(s.popTiers)?s.popTiers:{},n=ptNew(),d=o.def&&typeof o.def==='object'?o.def:{},at=o.at&&typeof o.at==='object'&&!Array.isArray(o.at)?o.at:{};
  for(const k of POP_TIERS){const x=d[k];if(x&&typeof x==='object'&&Number.isInteger(x.g)&&RG[x.g])n.def[k]={g:x.g,rt:int(x.rt,1,RMAX,1)};}
  for(const c of Object.keys(at))if(isCity(c)&&own(s.pops,c)&&POP_TIERS.includes(at[c]))n.at[c]=at[c];
  s.popTiers=n;}
// The clicks that bring a POP up to a standard, in order, priced as each click prices it: a second router first where a
// lone router carries traffic (so the swap is a rolling upgrade, not a maintenance window), the bigger model, the rest of
// the routers. null when the POP already meets it. why: what stops it today.
function ptPlan(c,k){const p=S.pops[c],d=S.popTiers&&S.popTiers.def[k];if(!p||!d)return null;
  const g0=p.rgen||0,rt0=p.routers||1,up=d.g!==g0&&RG[d.g].cap>RG[g0].cap,steps=[];let rt=rt0,cost=0;
  if(up&&rt===1&&d.rt>=2&&!popIdle(c)){cost+=routerCost(g0,1);steps.push('add');rt=2;}
  if(up){cost+=Math.max(0,Math.round(RG[d.g].cost*rt*hwMul('rt')*techMul(RG[d.g].lvl))-tradeIn(g0,rt));steps.push('swap');}
  const g=up?d.g:g0;while(rt<d.rt){cost+=routerCost(g,rt);steps.push('add');rt++;}
  if(!steps.length)return null;
  const mo=n=>(n-1)*ROUTER_MO+cageMo(n),why=up?(!techOk('rg',d.g,RG[d.g].lvl)?tr('pop_tiers.model_locked',{model:esc(RG[d.g].n),lv:RG[d.g].lvl}):modelFits(c,d.g)||(p.rupDay===S.day?tr('pop_tiers.swapped_today'):'')):'';
  return {steps,cost,g:d.g,mo:mo(rt)+rt*RG[g].mo-mo(rt0)-rt0*RG[g0].mo,why};}
// Run the plan through the Infra tab's own actions, quietly. True when every click went through.
function ptRun(c,q){let ok=true;opsQuiet(()=>{for(const s of q.steps){const p=S.pops[c],rt=p.routers||1,g=p.rgen||0;
    if(s==='add')ACT.addRouter({city:c});else ACT.upRouter({city:c,g:q.g});if((p.routers||1)===rt&&(p.rgen||0)===g){ok=false;break;}}});return ok;}
// The POPs of one kind, the busiest first, with their plans.
function ptAll(k){const at=S.popTiers?S.popTiers.at:{},cs=Object.keys(at).filter(c=>at[c]===k&&S.pops[c]).sort((a,b)=>(R.nodeLoad[b]||0)-(R.nodeLoad[a]||0)||a.localeCompare(b));
  const todo=[],stuck=[];for(const c of cs){const q=ptPlan(c,k);if(!q)continue;(q.why?stuck:todo).push({c,q});}
  return {cs,todo,stuck,cost:todo.reduce((a,x)=>a+x.q.cost,0)};}
const ptName=k=>tr(POP_TIER_L[k]),ptDesc=d=>d?`${d.rt} × ${esc(RG[d.g].n)}`:tr('pop_tiers.not_set');
// In a POP's router section: the three standards, what this POP is, and one button each.
function popTierHtml(c){if(!ptOn()||!S.pops[c])return '';const T=ptO(),p=S.pops[c],mine=T.at[c];
  return `<div class="ptier"><div class="kv"><span>${tr('pop_tiers.title')}</span><b>${mine?tr('pop_tiers.this_pop_is',{kind:ptName(mine)}):tr('pop_tiers.no_kind')}</b></div>
    ${POP_TIERS.map(k=>{const d=T.def[k],q=d?ptPlan(c,k):null,same=d&&d.g===(p.rgen||0)&&d.rt===(p.routers||1);
      const main=!d?'':q?btn(tr('pop_tiers.apply_cost',{cost:fmt$(q.cost)}),'ptApply',{city:c,k,cost:q.cost},mine===k?'pink sm':'sm',!!q.why||S.cash<q.cost):mine!==k?btn(tr('pop_tiers.mark'),'ptApply',{city:c,k,cost:0},'sm'):`<span class="tag st on">✓ ${tr('pop_tiers.meets_it')}</span>`;
      return `<div class="row"><div class="grow"><div class="nm">${ptName(k)} <span class="meta">${ptDesc(d)}</span></div>${q&&q.why?`<div class="why">${esc(q.why)}</div>`:''}
        <div class="btns">${main}${same?'':btn(tr('pop_tiers.save_here'),'ptSave',{city:c,k},'ghost sm')}</div></div></div>`;}).join('')}
    <p class="note">${tr('pop_tiers.note')}</p></div>`;}
// In Utilities: every kind with its POPs, and one button that brings them all up to their standard.
function popTierAllHtml(city){if(!ptOn())return '';const T=ptO();if(!POP_TIERS.some(k=>T.def[k]))return '';
  return `<section><h3>${tr('pop_tiers.title')}</h3><p class="lead">${tr('pop_tiers.bulk_note')}</p>
    ${POP_TIERS.filter(k=>T.def[k]).map(k=>{const A=ptAll(k);return `<div class="row"><div class="grow"><div class="nm">${ptName(k)} <span class="meta">${ptDesc(T.def[k])}</span></div>
      <div class="meta">${trn('pop_tiers.n_pops',A.cs.length)}${A.todo.length?' · '+trn('pop_tiers.n_below',A.todo.length):''}${A.stuck.length?' · '+trn('pop_tiers.n_stuck',A.stuck.length):''}</div>
      ${A.todo.length?`<div class="btns">${btn(trn('pop_tiers.bring_up_n',A.todo.length,{cost:fmt$(A.cost)}),'ptAll',{k,cost:A.cost,city},'pink sm',S.cash<A.cost)}</div>`:''}</div></div>`;}).join('')}</section>`;}
