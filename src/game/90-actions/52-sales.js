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
 // Signing for you (39-sales-auto.js): on or off, and the minimum under which offers are declined.
 salesAuto:()=>{if(!slP())return;const A=S.slAuto||(S.slAuto=slAutoNew());A.on=!A.on;sfx('click');after();salesModal();},
 salesRen:()=>{if(!slP())return;const A=S.slAuto||(S.slAuto=slAutoNew());if(A.ren)delete A.ren;else A.ren=true;sfx('click');after();salesModal();},
 salesMin:()=>{if(!slP())return;const A=S.slAuto||(S.slAuto=slAutoNew());A.min=opsCycle(SL_MINS,A.min);sfx('click');after();salesModal();},
 // Which kinds of deal the desk may sign (#497): All or Custom, a whole category, one kind, and a category's fold.
 salesKinds:({m})=>{if(!slP())return;if(m==='all'){if(S.slAuto)delete S.slAuto.no;UI.slCust=null;UI.slCat=null;}else if(m==='custom')UI.slCust=S;else return;sfx('click');after();salesModal();},
 salesCat:({c})=>{if(!slP()||!SL_CATS.includes(c))return;const A=S.slAuto||(S.slAuto=slAutoNew()),ks=Object.keys(BIZ_T).filter(t=>slCat(t)===c),vis=slKinds().filter(t=>slCat(t)===c);
   // A category with any kind on goes off whole (kinds the level brings later too); one that is all off comes back whole.
   const no=new Set(A.no||[]),off=vis.length&&vis.every(t=>no.has(t));for(const t of ks)if(off)no.delete(t);else no.add(t);
   UI.slCust=S;if(no.size)A.no=[...no].sort();else delete A.no;sfx('click');after();salesModal();},
 salesKind:({t})=>{if(!slP()||!own(BIZ_T,t))return;const A=S.slAuto||(S.slAuto=slAutoNew()),no=new Set(A.no||[]);if(no.has(t))no.delete(t);else no.add(t);
   UI.slCust=S;if(no.size)A.no=[...no].sort();else delete A.no;sfx('click');after();salesModal();},
 salesCatOpen:({c})=>{UI.slCat=UI.slCat===c?null:c;if(S)salesModal();},
 salesVp:()=>{if(slP()!=='ceo'||S.sales.vp)return;if(!spend(SALES_VP))return;S.sales.vp=S.day+SALES_VP_DAYS;toast(tr('sales.vp_asked',{n:SALES_VP_DAYS}),'');after();salesModal();},
});
