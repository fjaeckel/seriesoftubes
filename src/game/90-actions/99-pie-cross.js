/* Moving an orbit customer between the NOC's list, Pie Control and its POP (93-ui/90-pie-cross.js), and dropping it from Pie Control. */
Object.assign(ACT,{
 pieCust:({id})=>{const b=S&&S.biz.find(x=>x.id===id);if(!b||pzOn()||!pieOn()||!S.pie||!S.pie.co)return;sfx('click');$('dash').hidden=true;
  if(UI.pieTab!=='cust'&&PG.cv)PG.goal={yaw:PG.yaw,tilt:PG.tilt,z:1};
  const f=pieFlowOf(id);UI.pieTab='cust';UI.pieFocus=null;UI.confirm=null;UI.pieHi=f?id:null;if(f&&UI.pieCk&&UI.pieCk!==f.k)UI.pieCk='';
  pieModal();pieHiShow();const r=[...document.querySelectorAll('#modal .pft-row')].find(x=>x.dataset.fid===id);if(r&&r.scrollIntoView)r.scrollIntoView({block:'center'});},
 // The NOC's customer list, narrowed to the customer's city, with its row in view.
 custNoc:({id})=>{const b=S&&S.biz.find(x=>x.id===id);if(!b||pzOn())return;sfx('click');if(!$('modal').hidden)closeModal();
  UI.kf={city:b.city};listReset('cust');UI.dtab='cust';UI.custHi=id;const d=$('dash');d.hidden=false;renderDash();
  const r=[...d.querySelectorAll('[data-cid]')].find(x=>x.dataset.cid===id);if(r&&r.scrollIntoView)r.scrollIntoView({block:'center'});else d.scrollTop=0;},
 piePop:({city})=>{if(!S||!isCity(city)||!S.pops[city])return;sfx('click');if(!$('modal').hidden)closeModal();$('dash').hidden=true;UI.tab='cust';ACT.focusCity({city});},
 pieDrop:({id})=>{const b=S&&S.biz.find(x=>x.id===id);if(!b)return;
  if(UI.confirm!==id){UI.confirm=id;sfx('click');pieModal(true);return;}
  ACT.dropBiz({id});UI.pieHi=null;if(!$('modal').hidden&&$('modal').className==='pie')pieModal(true);},
});
