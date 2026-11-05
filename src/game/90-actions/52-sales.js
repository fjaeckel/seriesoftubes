// The sales desk (38-sales-desk.js): hiring one salesperson, letting them go, and asking the board for a VP of Sales
// when the CEO has taken over.
Object.assign(ACT,{
 salesOpen:()=>{if(S)salesModal();},
 salesHire:({id})=>{if(!S||!own(SALES,id)||slP()||!salesCanHire()||!rule('clock'))return;const P=SALES[id];if(P.mo&&!spend(P.mo))return;
   S.sales=Object.assign(S.sales||{},{p:id,hired:S.day,vp:null,golf:null,say:null});UI.confirm=null;
   toast(id==='ceo'?tr('sales.ceo_took_over',{name:esc(slCap())}):tr('sales.hired',{name:esc(slCap())}),'good');sfx('coin');after();salesModal();},
 salesFire:()=>{const p=slP();if(!p||p==='ceo')return;if(UI.confirm!=='salesFire'){UI.confirm='salesFire';salesModal();return;}UI.confirm=null;const nm=slCap();S.sales.p=null;
   toast(tr('sales.fired',{name:esc(nm)}),'');after();salesModal();},
 // The CEO cannot be fired. A board meeting (and its catering) can get you a VP of Sales, who takes over a month later.
 salesVp:()=>{if(slP()!=='ceo'||S.sales.vp)return;if(!spend(SALES_VP))return;S.sales.vp=S.day+SALES_VP_DAYS;toast(tr('sales.vp_asked',{n:SALES_VP_DAYS}),'');after();salesModal();},
});
