// Standing orders: hiring the intern, the switches and dials, and a new POP from the template.
const opsCycle=(a,v)=>a[(a.indexOf(v)+1)%a.length];
// A pick from a list (v: its position, as the sheet's dropdown sends it), or without v the next value (the MCP tools step).
const opsPick=(a,cur,v)=>{if(v===undefined)return opsCycle(a,cur);const i=Number(v);return Number.isInteger(i)&&i>=0&&i<a.length?a[i]:undefined;};
// The sheet is drawn again after a pick: keep the keyboard on the list that was used.
const opsRedraw=(act,args)=>{opsModal();const j=JSON.stringify(args);for(const el of $('modalCard').querySelectorAll(`[data-chg="${act}"]`))if(el.dataset.args===j){el.focus();break;}};
Object.assign(ACT,{
 opsOpen:()=>{if(S)opsModal();},
 opsHire:({id})=>{if(!S||opsHired()||!own(INTERNS,id)||!opsCanHire()||!rule('clock'))return;if(!spend(INTERN_MO))return;const O=opsO(),m=monthIdx(S.day);O.intern=id;O.hired=S.day;O.wk=null;
   // A new hire starts on a fresh month's budget, whatever the last one spent.
   if(m!==O.mon){O.mon=m;for(const k in O.spent)O.spent[k]=0;O.addMo={};}
   O.log.unshift({d:S.day,i:id,r:[]});toast(esc(tr('ops.hired',{name:opsName(true)})),'good',[{l:tr('ops.ops'),act:'opsOpen',args:{}}]);after();opsModal();},
 opsFire:()=>{if(!opsHired())return;if(UI.confirm!=='opsFire'){UI.confirm='opsFire';opsModal();return;}UI.confirm=null;const nm=opsName();S.ops.intern=null;
   toast(esc(tr('ops.fired',{name:nm})),'');after();opsModal();},
 opsToggle:({k})=>{if(!opsHired()||!own(OPSK,k))return;S.ops.on[k]=!S.ops.on[k];sfx('click');after();opsModal();},
 opsParam:({k,p,v})=>{if(!opsHired()||!own(OPSK,k)||!own(OPSK[k].p,p))return;const P=OPSK[k].p[p],x=opsPick(opsOpts(k,p),opsP(k,p),v);if(x===undefined||!(P.ok?P.ok(x):P.v.includes(x)))return;
   (S.ops.p[k]||(S.ops.p[k]={}))[p]=x;sfx('click');after();opsRedraw('opsParam',{k,p});},
 opsCap:({k,v})=>{if(!opsHired()||!own(OPSK,k)||!OPSK[k].cap)return;const x=opsPick(opsCaps(k),opsCap(k),v);if(x===undefined)return;S.ops.cap[k]=x;sfx('click');after();opsRedraw('opsCap',{k});},
 opsFloor:({v})=>{if(!opsHired())return;const x=opsPick(OPS_FLOORS,S.ops.floor,v);if(x===undefined)return;S.ops.floor=x;sfx('click');after();opsRedraw('opsFloor',{});},
 opsCity:({v})=>{if(!S||!S.pops[v])return;UI.opsCity=v;opsModal();},
 opsPop:({k,city})=>{if(!opsHired()||!OPS_POP.includes(k)||!S.pops[city])return;const sk=S.ops.skip,a=sk[city]||[];sk[city]=a.includes(k)?a.filter(x=>x!==k):[...a,k];if(!sk[city].length)delete sk[city];
   UI.opsCity=city;sfx('click');after();opsModal();},
 opsTpl:({k})=>{if(!opsHired()||!OPS_TPL.includes(k))return;S.ops.tpl[k]=!S.ops.tpl[k];sfx('click');after();opsModal();},
 // One tap, a whole POP: the same clicks in the same order, all or nothing on the price.
 opsNewPop:({city})=>{if(!opsHired())return;const q=opsTplQuote(city);if(!q)return;if(S.cash<q.cost){toast(tr('interface.not_enough_cash_wait_for_revenue'),'bad');sfx('err');return;}
   opsQuiet(()=>{ACT.buildPop({city});if(!S.pops[city])return;if(S.ops.tpl.bb)ACT.launchBB({city});if(q.net)ACT.buyTransit({city,net:q.net,tier:0});if(q.ix)ACT.buyIx({city:q.ix,tier:0});
     if(q.kit){const k=utilityKit(city);if(k&&k.cost&&S.cash>=k.cost)ACT.utilityKit({city,cost:k.cost});}});
   if(!S.pops[city])return;UI.tab='links';floater(CITY[city].x,CITY[city].y-30,tr('common.new_pop'),'#FF4F9A');sfx('build');
   toast(esc(tr('ops.tpl_done',{name:opsName(),city:CITY[city].name,list:q.parts.join(', ')||tr('ops.tpl_just_pop')})),'good',[],{a:'city',v:city});after();},
});
