// Multiplayer gameplay (60-features/89-fedplay-*.js): published terms, requests and deals with other players.
// Requests wait on WebCrypto, so these answer with a promise; what they did shows in the sheet and the NOC log.
const fpSay=r=>{if(r===null||r===undefined)return;if(r&&r.miss){toast(tr('fedplay.still_missing',{what:esc(fedMissText(r.miss))}),'bad');return;}
  toast(tr({full:N_('fedplay.err_full'),cash:N_('fedplay.err_cash'),dup:N_('fedplay.err_dup'),quiet:N_('fedplay.miss_quiet'),gone:N_('fedplay.err_gone')}[r]||N_('fedplay.err_off')),'bad');};
// The gameplay sheet on screen, by its header's data-fp ("net:<key>", "terms", "cons"), or ''. UI.fpOpen is only the last
// one opened (× does not clear it), so an answer redraws what is shown: that sheet, or the Multimode sheet's list.
const fpShown=()=>{const e=!$('modal').hidden&&$('modalCard').firstElementChild;return e&&e.dataset.fp||'';};
const fpRe=()=>{const s=fpShown();if(s.startsWith('net:'))fedNetModal(s.slice(4));else if(s==='terms')fedTermsModal();else if(s==='cons')fedConsModal();else if(fuShown())fuRender();};
const fpDo=p=>Promise.resolve(p).then(r=>{fpSay(r);fpRe();return r;},e=>{console.error('[tubes] federation gameplay',e);});
Object.assign(ACT,{
 fpTerms:()=>{if(!S||!S.fed)return;UI.fpDraft=null;fedTermsModal();},
 // To the players card (the Networks tab), where players you cannot reach can be peered with.
 fpLost:()=>{if(!S||!S.fed)return;if(!$('modal').hidden)closeModal();$('dash').hidden=true;UI.nf='all';UI.netFocus=null;UI.sel=null;renderPanel();if(!isPhone())ACT.leftTab({t:'nets'});else if(!(UI.leftOpen&&UI.left==='nets'))ACT.phoneTab({t:'nets'});const c=document.querySelector('#leftBody .fp-card');if(c&&c.scrollIntoView)c.scrollIntoView({block:'start'});},
 fpEdit:({f,v}={})=>{if(!S||!S.fed)return;fedTermsEdit(f,v);fedTermsModal();},
 fpTermsSave:()=>{if(!S||!S.fed||!UI.fpDraft)return;const r=fedTermsApply(UI.fpDraft);UI.fpDraft=null;closeModal();toast(tr('fedplay.terms_saved'),'good');after();return fpDo(r);},
 fpTermsSet:({terms}={})=>{if(!S||!S.fed)return;let t;try{t=JSON.parse(String(terms));}catch(e){toast(tr('fedplay.err_off'),'bad');return;}after();return fpDo(fedTermsApply(t));},
 fpRpki:({on}={})=>{if(!S||!S.fed)return;fedP().rpki=on!==false;after();return fpDo(fedAnnounceMaybe(true).then(()=>null));},
 // A network picked in the looking glass that is not a place in this game yet becomes one first (FEDN.pin, at most 8).
 // at and deal (port or cofound): open it with that request picked and first (exchanges run by players, an exchange's panel).
 // Opened from the Multimode sheet it has a Back to it, where it was (UI.fpBack); rv (a requester in its list, then Next)
 // goes through what waits for review one network after another, in the list's order as it was tapped.
 fpNet:async({key,at,deal,rv}={})=>{if(!S||!S.fed||FdK(key))return;
   const bk=UI.fpBack,b=fuShown()&&UI.fu&&UI.fu.v==='home'?{top:$('modalCard').scrollTop,rv:!!rv,order:rv&&S.fedp?[...new Set(S.fedp.rq.map(q=>q.rec.key))]:[]}:rv&&bk&&bk.rv&&fpShown()==='net:'+bk.key?bk:null;
   if(!fedNetOf(key)){FEDN.pin.delete(key);FEDN.pin.add(key);if(FEDN.pin.size>8)FEDN.pin.delete(FEDN.pin.values().next().value);await fedPlayRefresh();if(!fedNetOf(key))return;}
   const d=['cofound','edge','onramp'].includes(deal)?deal:'port';UI.fpSel=at&&own(CITY,at)?{[d+'.at']:at}:{};UI.fpFocus=at&&own(CITY,at)?d:null;
   UI.fpBack=b?{top:b.top,rv:b.rv,order:b.order,key}:null;fedNetModal(key);$('modalCard').scrollTop=0;},
 fpBack:()=>{const b=UI.fpBack;UI.fpBack=null;if(!S||!S.fed||!b)return;ACT.fuOpen({v:'home'});if(fuShown())$('modalCard').scrollTop=b.top;},
 fpPick:({f,v}={})=>{if(!S||!UI.fpOpen||!/^(peering|transit|pni|port|swap|wave|cons|cofound|edge|onramp)\.(via|at|mbps|term|a|b|pairs|members|share|nodes)$/.test(String(f)))return;UI.fpSel=UI.fpSel||{};UI.fpSel[f]=String(v);fpRe();},
 fpReq:({key,deal,via,at,mbps,term,share,nodes}={})=>{if(!S||!S.fed||typeof key!=='string')return;return fpDo(fedRequest(key,String(deal),{via,at,mbps:mbps==null?0:+mbps,term:term==null?0:+term,share:share==null?0:+share,nodes:nodes==null?0:+nodes}));},
 fpRenew:({id}={})=>{const d=S&&S.fed&&S.fed.deals.find(x=>x.id===id);if(!d||d.role==='sell'||d.deal==='cofound')return;const T=d.terms;
   return fpDo(fedRequest(d.key,d.deal,{via:T.via,at:Array.isArray(T.at)?T.at[0]:T.at||(T.take&&T.take.a+'|'+T.take.b)||(T.gbps&&T.a+'|'+T.b),mbps:T.mbps||(T.take&&T.take.mbps)||(T.gbps&&T.gbps*1000),nodes:T.nodes,term:T.term},d.st==='run'&&d.end!==null?d:null));},
 fpEnd:({id}={})=>{const d=S&&S.fed&&S.fed.deals.find(x=>x.id===id&&x.st!=='over');if(!d)return;fedEnd(S,d,'mine','depeer');toast(tr('fedplay.you_ended',{net:esc(d.name),deal:fedDealName(d.deal)}),'');after();fpRe();},
 fpAccept:({id}={})=>fpDo(fedAcceptRq(id)),
 fpDecline:({id}={})=>fpDo(fedDeclineRq(id)),
 // Requests to review: the Multimode sheet, where what waits for an answer comes first (else the dashboard's list).
 fpQueue:()=>{if(!S||!S.fed)return;if(fuCan()){ACT.fuOpen({v:'home'});return;}const d=$('dash');UI.dtab='overview';if(d.hidden)d.hidden=false;renderDash();},
 // The terms of a request, the rest of a list of players: view state only.
 fpFold:({k}={})=>{if(!S||!S.fed||typeof k!=='string'||k.length>40)return;UI.fpo=UI.fpo||{};UI.fpo[k]=!UI.fpo[k];
   if(fuShown())fuRender();if(!$('dash').hidden)renderDash();renderLeft();},
 fpCons:()=>{if(!S||!S.fed)return;UI.fpSel={};fedConsModal();},
 fpConsNew:({a,b,pairs,members}={})=>fpDo(fedConsNew(a,b,+pairs||1,+members||3)),
 fpConsJoin:({id}={})=>fpDo(fedConsJoin(id)),
});
