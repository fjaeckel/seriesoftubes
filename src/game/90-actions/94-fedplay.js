// Multiplayer gameplay (60-features/89-fedplay-*.js): published terms, requests and deals with other players.
// Requests wait on WebCrypto, so these answer with a promise; what they did shows in the sheet and the NOC log.
const fpSay=r=>{if(r===null||r===undefined)return;if(r&&r.miss){toast(tr('fedplay.still_missing',{what:esc(fedMissText(r.miss))}),'bad');return;}
  toast(tr({full:N_('fedplay.err_full'),cash:N_('fedplay.err_cash'),dup:N_('fedplay.err_dup'),quiet:N_('fedplay.miss_quiet'),gone:N_('fedplay.err_gone')}[r]||N_('fedplay.err_off')),'bad');};
const fpRe=()=>{if(!$('modal').hidden&&UI.fpOpen){const o=UI.fpOpen;if(o.k==='net')fedNetModal(o.key);else if(o.k==='terms')fedTermsModal();else if(o.k==='cons')fedConsModal();}};
const fpDo=p=>Promise.resolve(p).then(r=>{fpSay(r);fpRe();return r;},e=>{console.error('[tubes] federation gameplay',e);});
Object.assign(ACT,{
 fpTerms:()=>{if(!S||!S.fed)return;UI.fpDraft=null;fedTermsModal();},
 fpEdit:({f,v}={})=>{if(!S||!S.fed)return;fedTermsEdit(f,v);fedTermsModal();},
 fpTermsSave:()=>{if(!S||!S.fed||!UI.fpDraft)return;const r=fedTermsApply(UI.fpDraft);UI.fpDraft=null;closeModal();toast(tr('fedplay.terms_saved'),'good');after();return fpDo(r);},
 fpTermsSet:({terms}={})=>{if(!S||!S.fed)return;let t;try{t=JSON.parse(String(terms));}catch(e){toast(tr('fedplay.err_off'),'bad');return;}after();return fpDo(fedTermsApply(t));},
 fpRpki:({on}={})=>{if(!S||!S.fed)return;fedP().rpki=on!==false;after();return fpDo(fedAnnounceMaybe(true).then(()=>null));},
 // A network picked in the looking glass that is not a place in this game yet becomes one first (FEDN.pin, at most 8).
 fpNet:async({key}={})=>{if(!S||!S.fed||FdK(key))return;
   if(!fedNetOf(key)){FEDN.pin.delete(key);FEDN.pin.add(key);if(FEDN.pin.size>8)FEDN.pin.delete(FEDN.pin.values().next().value);await fedPlayRefresh();if(!fedNetOf(key))return;}
   UI.fpSel={};fedNetModal(key);},
 fpPick:({f,v}={})=>{if(!S||!UI.fpOpen||!/^(peering|transit|pni|port|swap|wave|cons)\.(via|at|mbps|term|a|b|pairs|members)$/.test(String(f)))return;UI.fpSel=UI.fpSel||{};UI.fpSel[f]=String(v);fpRe();},
 fpReq:({key,deal,via,at,mbps,term}={})=>{if(!S||!S.fed||typeof key!=='string')return;return fpDo(fedRequest(key,String(deal),{via,at,mbps:mbps==null?0:+mbps,term:term==null?0:+term}));},
 fpRenew:({id}={})=>{const d=S&&S.fed&&S.fed.deals.find(x=>x.id===id);if(!d||d.role==='sell')return;const T=d.terms;
   return fpDo(fedRequest(d.key,d.deal,{via:T.via,at:Array.isArray(T.at)?T.at[0]:T.at||(T.take&&T.take.a+'|'+T.take.b)||(T.gbps&&T.a+'|'+T.b),mbps:T.mbps||(T.take&&T.take.mbps)||(T.gbps&&T.gbps*1000),term:T.term},d.st==='run'&&d.end!==null?d:null));},
 fpEnd:({id}={})=>{const d=S&&S.fed&&S.fed.deals.find(x=>x.id===id&&x.st!=='over');if(!d)return;fedEnd(S,d,'mine','depeer');toast(tr('fedplay.you_ended',{net:esc(d.name),deal:fedDealName(d.deal)}),'');after();fpRe();},
 fpAccept:({id}={})=>fpDo(fedAcceptRq(id)),
 fpDecline:({id}={})=>fpDo(fedDeclineRq(id)),
 fpQueue:()=>{if(!S||!S.fed)return;const d=$('dash');UI.dtab='overview';if(d.hidden)d.hidden=false;renderDash();},
 fpCons:()=>{if(!S||!S.fed)return;UI.fpSel={};fedConsModal();},
 fpConsNew:({a,b,pairs,members}={})=>fpDo(fedConsNew(a,b,+pairs||1,+members||3)),
 fpConsJoin:({id}={})=>fpDo(fedConsJoin(id)),
});
