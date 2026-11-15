/* ---------- Pie in the Sky: the intern books launches (standing order 'pie') ----------
   Keeps the crusts at a chosen coverage as old pies wear out, through the Crusts tab's own quote and queue (pieQuote,
   pieQueue): pies from the shelf, the first free pad, within the order's monthly budget. Never a heavy test flight, and
   only launches that fly within leadDays(PIE_PREP+PIE_OPS_AHEAD), so money is not locked up months ahead. */
const PIE_OPS_AHEAD=30,PIE_OPS_MAX=12,PIE_OPS_CAPS=[100e6,250e6,1e9,5e9,0];
OPS.push({k:'pie',i:'🚀',cap:250e6,caps:PIE_OPS_CAPS,t:N_('ops.o_pie'),d:N_('ops.o_pie_d'),show:()=>!!S.pie&&!!S.pie.co,
  p:{cr:{d:'all',v:['all',...Object.keys(CRUSTS)],l:N_('ops.p_cr'),f:v=>v==='all'?tr('ops.cr_all'):tr(CRUSTS[v].n)},
    goal:{d:100,v:[60,80,100],l:N_('ops.p_goal'),f:v=>v+'%'},
    rk:{d:'cheap',v:['cheap',...Object.keys(ROCKETS)],l:N_('ops.p_rk'),f:v=>v==='cheap'?tr('ops.cheapest'):tr(ROCKETS[v].d)}}});
OPSK.pie=OPS.at(-1);OPS_SAY.pie=N_('ops.l_pie');OPS_ORDER.splice(OPS_ORDER.indexOf('decom'),0,'pie');
// "Every crust in use": the ones with pies up there or on the way.
const pieOpsCrusts=()=>{const c=opsP('pie','cr');return c==='all'?Object.keys(CRUSTS).filter(id=>pieLive(id)+S.pie.crusts[id].queued>0):[c];};
OPS_RUN.pie=function*(X){const P=S.pie;if(!P||!P.co||!P.fac||!P.pads.length||!pieCanBuild())return;
  const goal=opsP('pie','goal')/100,pick=opsP('pie','rk'),o={ins:P.opt.ins,las:P.rd.las},due=S.day+leadDays(PIE_PREP+PIE_OPS_AHEAD);
  for(const cr of pieOpsCrusts())for(let i=0;i<PIE_OPS_MAX&&pieLive(cr)+P.crusts[cr].queued<CRUSTS[cr].full*goal;i++){
    // The cheapest per pie among the rockets that can fly it now.
    const b=(pick==='cheap'?Object.keys(ROCKETS):[pick]).map(rk=>({rk,q:pieQuote(rk,cr,o)})).filter(x=>x.q.ok&&!x.q.test&&x.q.day<=due).sort((a,b)=>a.q.cost/a.q.n-b.q.cost/b.q.n)[0];
    if(!b||!X.can('pie',b.q.cost)||!X.pay('pie',()=>{if(!pieSpend(b.q.cost))return false;pieQueue(b.rk,cr,b.q,o);return true;}))break;
    // A booked launch changes no route: no recompute for it.
    const dt=X.dirty;X.did('pie',cr);X.dirty=dt;yield;}};
