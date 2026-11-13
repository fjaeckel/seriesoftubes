// Multiplayer sheets (95-modals/47-49-fed-*.js): opening them, joining and leaving, the boards' filters, operators.
// The core's own actions (93-fed.js) stay what the agent and tests call; these are the buttons around them.
// Runs one async step with the sheet's buttons disabled, then shows its result in the sheet.
async function fuDo(p,okHtml){FU.busy=true;FU.msg=null;fuRender();let r;try{r=await p;}catch(e){r={error:'internal'};}FU.busy=false;
  if(r&&r.error)FU.msg={bad:true,html:fuErrText(r.error)};else if(okHtml)FU.msg={html:okHtml};return r;}
Object.assign(ACT,{
 fuOpen:({v='home',id,key,back}={})=>{if(!['home','join','move','quit','opkey','boards','filters','glass','server','net','report'].includes(v))return;
   const was=UI.fu&&UI.fu.v;if(!UI.fu)UI.fu={};if(v!==was)FU.msg=null;if(v==='boards'&&was!=='filters')FU.facets=null;
   UI.fu.v=v;if(id!==undefined)UI.fu.id=id;if(key!==undefined)UI.fu.key=key;UI.fu.back=back||null;if(v==='server'&&id!==undefined)FU.chain=null;
   fuRender();fuLoad();if(v==='join')fedCatalogLoad().catch(()=>false);},
 fuClose:()=>{UI.fu=null;FU.msg=null;if(UI.setOpen){if(!S||!UI.started)showTitle();else ACT.settings();return;}if(!S||!UI.started)showTitle();else closeModal();},
 fuJoin:async({url}={})=>{if(FU.busy)return;const r=await fuDo(fedJoin(url).then(code=>code?{error:code}:{ok:true}));
   if(r&&r.ok){if(UI.fedInvite===url)UI.fedInvite=null;const s=fuSrvOf(url);FU.msg={html:tr('fedui.joined_server',{server:s?esc(s.name):esc(url)})};UI.fu.v='home';track('fed_join');fuDot();fuLoad();return;}
   fuRender();},
 fuJoinTyped:()=>{const el=$('fuUrl');if(!el)return;const u=el.value.trim();UI.fu.url=u;ACT.fuJoin({url:u});},
 fuLeave:({url}={})=>{if(typeof url!=='string')return;fedLeave(url);FU.msg=null;fuDot();fuRender();},
 fuQuit:async()=>{if(FU.busy)return;await fuDo(fedQuit().then(ok=>ok?{ok:true}:{error:'no_key'}));UI.fu.v='home';fuDot();fuLoad();},
 fuShare:({on}={})=>{fedShare(on!==false);fuRender();},
 fuMute:({key,on}={})=>{fedMute(key,on!==false);fuRender();},
 fuMoveGo:()=>{if(fedExportMove())track('fed_move');ACT.fuOpen({v:'home'});},
 fuOpKeyGo:async()=>{const el=$('fuOpIn'),seed=el?el.value.trim():'';if(FU.busy)return;
   const r=await fuDo(fedOpKeySet(seed).then(ok=>ok?{ok:true}:{error:'bad_key'}));
   if(r&&r.ok){ACT.fuOpen({v:'home'});FU.msg={html:tr('fedui.operator_key_imported')};fuRender();}else{FU.msg={bad:true,html:tr('fedui.that_is_not_an_operator_key')};fuRender();}},
 fuOpKeyDel:async()=>{await fedOpKeyDel();FU.opKey=null;FU.msg={html:tr('fedui.operator_key_removed')};fuLoad();},
 // Board chips: one dimension each; null clears it. A wider region clears the narrower ones.
 // The HUD's rank chip and the menu tile.
 fuBoards:()=>{if(fuRankOn())ACT.fuOpen({v:'boards'});},
 // The board's note: one line, or all of it.
 fuNote:()=>{if(!UI.fu)return;UI.fu.note=!UI.fu.note;fuRender();},
 fuQ:({k,v}={})=>{const q=fuQ(),ok={board:FU_BOARDS,measure:FU_MEASURES,division:['all','human','ai']};
   if(ok[k]){if(!ok[k].includes(v))return;q[k]=v;}
   else if(['model','harness','home','from','continent','country','city','age','gday','tier1','policy','peers','server'].includes(k)){
     if(v===null||v===undefined||v==='')delete q[k];else q[k]=v;
     if(k==='continent'){delete q.country;delete q.city;}if(k==='country')delete q.city;}
   else return;
   fuBoardsLoad().then(()=>{if(UI.fu&&(UI.fu.v==='boards'||UI.fu.v==='filters'))fuRender();});},
 fuFilt:({k,v}={})=>ACT.fuQ({k,v:v===''?null:v}),
 fuOpSign:async({srv,id}={})=>{const p=FU.chain&&FU.chain.pending.find(x=>x.id===id);if(!p||FU.busy)return;
   const r=await fuDo(fedOpCosign(srv,p),tr('fedui.signed'));if(r&&r.ok)FU.chain=await fedOpChain(srv);fuRender();},
 fuOpHide:async({srv,key,list,on}={})=>{if(FU.busy)return;await fuDo(fedOpHide(srv,key,list,!!on),tr('fedui.done'));fuLoad();},
 fuOpShun:async({srv,key,reason}={})=>{if(FU.busy)return;await fuDo(fedOpShun(srv,key,reason||null),tr('fedui.done'));fuLoad();},
});
