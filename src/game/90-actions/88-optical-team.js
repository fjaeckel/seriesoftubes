// The optical engineering team: hiring and sizing it, how it builds, and the routes it puts in front of you.
Object.assign(ACT,{
 optxOpen:()=>{if(S)optxModal();},
 // The first month is paid up front, as the intern's. A new team starts on this year's budget as it stands.
 optxHire:({size})=>{if(!S||optxOn()||!own(OPTX,size)||!optxCanHire())return;if(!spend(OPTX[size].mo))return;const T=S.optx||(S.optx=optxNew());T.size=size;T.hired=S.day;T.yr=Math.floor(S.day/365);
   toast(esc(tr('optx.hired',{team:tr(OPTX[size].n)})),'good',[{l:tr('optx.title'),act:'optxOpen',args:{}}]);after();optxModal();},
 optxSize:({size})=>{if(!optxOn()||!own(OPTX,size)||size===S.optx.size)return;S.optx.size=size;toast(esc(tr('optx.resized',{team:tr(OPTX[size].n)})),'good');after();optxModal();},
 // Builds already under way go on (they are contracts); the routes waiting for you go with the team.
 optxFire:()=>{if(!optxOn())return;if(UI.confirm!=='optxFire'){UI.confirm='optxFire';optxModal();return;}UI.confirm=null;S.optx.size=null;S.optx.prop=[];S.optx.jobs=[];
   toast(tr('optx.fired'),'');after();optxModal();},
 optxMode:({v})=>{if(!optxOn()||(v!=='ask'&&v!=='auto'))return;S.optx.mode=v;sfx('click');after();optxModal();},
 optxBud:({v})=>{if(!optxOn())return;const x=opsPick(OPTX_BUD,S.optx.bud,v);if(x===undefined)return;S.optx.bud=x;sfx('click');after();opsRedraw('optxBud',{});},
 optxPay:({v})=>{if(!optxOn())return;const x=opsPick(OPTX_PAY,S.optx.pay,v);if(x===undefined)return;S.optx.pay=x;sfx('click');after();opsRedraw('optxPay',{});},
 // Your yes: priced again now (the market and your network have moved since the plan), then the same order a click places.
 optxBuild:({i})=>{if(!optxOn())return;const p=S.optx.prop[+i];if(!p)return;if(optxBusy()){toast(tr('optx.busy'),'bad');sfx('err');return;}
   const q=optxQuote(p.a,p.b);if(!q){S.optx.prop.splice(+i,1);toast(tr('optx.gone'),'bad');sfx('err');after();optxModal();return;}
   if(S.cash<q.cost){toast(tr('interface.not_enough_cash_wait_for_revenue'),'bad');sfx('err');return;}
   if(!optxBuild(q))return;S.optx.prop=S.optx.prop.filter(x=>x.k!==p.k);toast(esc(tr('optx.building',{route:cmRouteName(q),n:q.days})),'goal');sfx('build');after();optxModal();},
 optxDrop:({i})=>{if(!optxOn()||!S.optx.prop[+i])return;S.optx.prop.splice(+i,1);sfx('click');after();optxModal();},
});
