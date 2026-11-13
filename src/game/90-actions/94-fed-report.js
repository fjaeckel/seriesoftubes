// Reporting a network to the operators of joined servers (95-modals/49-fed-report.js), and an operator's report list.
Object.assign(ACT,{
 // From the looking glass (back to it) or a player network's deals sheet (from: 'deals', back to that sheet).
 fuReport:({key,from}={})=>{if(!S||!S.fed||FdK(key))return;UI.fpOpen=null;if(UI.fu)UI.fu.rp=null;ACT.fuOpen({v:'report',key,back:from==='deals'?'deals':'net'});},
 fuRepBack:()=>{const key=UI.fu&&UI.fu.key;if(UI.fu&&UI.fu.back==='deals'){UI.fu=null;FU.msg=null;ACT.fpNet({key});return;}ACT.fuOpen({v:'net'});},
 fuRepPick:({k,v}={})=>{if(!UI.fu||UI.fu.v!=='report')return;const P=fuRepSel();
   if(k==='reason'&&FED_REPORT_WHY.includes(v))P.reason=v;
   else if(k==='srv'&&typeof v==='string')P.srvs=P.srvs.includes(v)?P.srvs.filter(x=>x!==v):[...P.srvs,v];
   else if(k==='mute')P.mute=!P.mute;else return;
   fuRender();},
 fuRepGo:async()=>{if(!UI.fu||UI.fu.v!=='report'||FU.busy)return;const key=UI.fu.key,P=fuRepSel();if(!P.reason)return;
   const r=await fuDo(fedReport(key,P.reason,P.srvs));if(!r||r.error){fuRender();return;}
   if(!r.ok.length){FU.msg={bad:true,html:fuErrText(r.failed.length?r.failed[0].error:'offline')};fuRender();return;}
   if(P.mute)fedMute(key,true);
   toast(tr('fedui.reported_to_the_operators_of',{servers:r.ok.map(fuSrvName).join(', ')}),'good');
   if(r.failed.length)toast(tr('fedui.report_not_sent_to',{servers:r.failed.map(x=>fuSrvName(x.srv)).join(', ')}),'bad');
   UI.fu.rp=null;FU.msg=null;ACT.fuRepBack();},
 fuRepWho:({key}={})=>{if(!UI.fu)return;UI.fu.rw=typeof key==='string'?key:null;fuRender();},
});
