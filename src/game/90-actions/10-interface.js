/* ================= ACTIONS ================= */
function spend(c){if(S.cash<c){toast(tr('interface.not_enough_cash_wait_for_revenue'),'bad');sfx('err');return false;}S.cash-=c;sfx('build');return true;}
const ACT={
 linkCheck:({id})=>{const l=S.links.find(x=>x.id===id);if(!l||linkDown(l))return;linkCheckModal(l);},
 speed:({v})=>{v=+v;if(pzOn())return;if(![0,0.5,1,2,4,8].includes(v)||(S&&!rule('clock')&&v))return;if(v)UI.lastSpeed=v;UI.speed=v;renderHUD();},
 help:()=>showHelp(),
 dash:()=>{if(!S||pzOn())return;const d=$('dash');d.hidden=!d.hidden;if(!d.hidden)renderDash();},
 dashClose:()=>{$('dash').hidden=true;},
 dashTab:({k})=>{if(!DTABS.includes(k))return;UI.dtab=k;renderDash();const d=$('dash');if(d)d.scrollTop=0;},
 dashSort:({k})=>{if(!['name','asn','type','traffic','cost','lost'].includes(k))return;if(UI.dashSort===k)UI.dashDir=-(UI.dashDir||-1);else{UI.dashSort=k;UI.dashDir=k==='name'||k==='type'||k==='asn'?1:-1;}renderDash();},
 bank:()=>{if(!S||pzOn())return;UI.confirm=null;$('dash').hidden=true;const b=$('bankBox');b.hidden=false;UI._bh=null;renderBank();},
 bankClose:()=>{UI.confirm=null;$('bankBox').hidden=true;},
 takeLoan:({id})=>{const o=S.loanOffers.find(x=>x.id===id);if(!o)return;S.stats.loans=(S.stats.loans||0)+1;const B=BANKS[o.bank];let got=o.amount,note='';
   if(B.crypto){const f=0.55+Math.random()*0.8;got=Math.round(o.amount*f);note=' '+(f>=1?tr('interface.tubecoin_moved_up_p_on_the',{p:Math.round(Math.abs(f-1)*100)}):tr('interface.tubecoin_moved_down_p_on_the',{p:Math.round(Math.abs(f-1)*100)}));}
   S.cash+=got;S.loanOffers=S.loanOffers.filter(x=>x!==o);
   S.loans.push({id:o.id,bank:o.bank,start:S.day,amount:o.amount,got,bal:o.model==='transit'?o.owe:o.amount,apr:o.apr||0,apr0:o.apr||0,pay:o.pay||0,left:o.term||0,term:o.term||0,share:o.share||0,model:o.model,cut:o.cut,covs:o.covs,base:{sub:S.links.filter(x=>x.sub).length}});
   track('loan_taken');toast(`<b>${tr('interface.amt_from_bank_has_landed',{amt:fmt$(got),bank:esc(B.name)})}</b><br>${B.equity?tr('interface.they_now_own_p_of_your',{p:pct(o.share)}):loanSummary(o)}${note}`,'good');sfx('coin');after();renderBank();},
 declineLoan:({id})=>{S.loanOffers=S.loanOffers.filter(x=>x.id!==id);sfx('click');renderBank();renderHUD();save();},
 repayLoan:({id})=>{const l=S.loans.find(x=>x.id===id);if(!l)return;const B=BANKS[l.bank];const cost=repayCost(l,B);
   if(UI.confirm!==id){UI.confirm=id;renderBank();return;}UI.confirm=null;if(!spend(cost)){renderBank();return;}S.loans=S.loans.filter(x=>x!==l);track('loan_repaid');
   toast(B.equity?tr('interface.you_bought_out_bank_they_flew',{bank:esc(B.name)}):tr('interface.loan_from_bank_repaid_early',{bank:esc(B.name)}),'good');after();renderBank();},
 leaseSwap:({a,b,src})=>{if(!S.pops[a]||!S.pops[b]||a===b)return;$('dash').hidden=true;UI.lmode='df';UI.dfSrc=['lease','build','cable'].includes(src)?src:isSub(a,b)?'cable':'build';UI.dfSys=lvl()>=3?'roadm':'lite';openLinkModal(a,b);},
 dashLink:({id})=>{$('dash').hidden=true;selectLink(id);},
 animSet:({v})=>{if(!['auto','on','off'].includes(v))return;UI.anim=v;try{localStorage.setItem('sot-anim',v);}catch(e){}applyAnim();refreshSettings();},
 soundSet:({v})=>{UI.muted=v==='off';try{localStorage.setItem('sot-mute',UI.muted?'1':'0');}catch(e){}renderHUD();refreshSettings();},
 langSet:({v})=>{if(!Object.hasOwn(LANGS,v)||v===LANG)return;try{localStorage.setItem('sot-lang',v);}catch(e){}save(true);location.reload();},
 mute:()=>{UI.muted=!UI.muted;try{localStorage.setItem('sot-mute',UI.muted?'1':'0');}catch(e){}renderHUD();},
 closePanel:()=>{UI.sel=null;UI.confirm=null;renderPanel();renderLeft();},
 closeModal:()=>closeModal(),
 tab:({t})=>{UI.tab=t;UI.confirm=null;renderPanel();},
 leftTab:({t})=>{UI.left=t;UI.leftOpen=true;renderLeft();},
 netFocus:({id})=>{if(!NET[id])return;$('dash').hidden=true;UI.netFocus=id;UI.nf='all';UI.left='nets';UI.leftOpen=true;UI.sel=null;renderPanel();renderLeft();const b=$('leftBody');if(b)b.scrollTop=0;},
 netFilter:({f})=>{UI.nf=f==='out'?'out':'all';listReset('nets');UI.netFocus=null;$('dash').hidden=true;UI.left='nets';UI.leftOpen=true;UI.sel=null;renderPanel();renderLeft();const b=$('leftBody');if(b)b.scrollTop=0;},
 meetGo:({city})=>{if(!isCity(city))return;$('dash').hidden=true;ACT.focusCity({city});if(S.pops[city]){UI.tab='peer';renderPanel();}},
 toggleLeft:()=>{UI.leftOpen=!UI.leftOpen;renderLeft();},
 phoneTab:({t})=>{if(!['goals','deals','noc','nets'].includes(t))return;if($('modal').classList.contains('link-check'))closeModal();haptic(8);if(UI.leftOpen&&UI.left===t&&!UI.sel){UI.leftOpen=false;}else{UI.left=t;UI.leftOpen=true;UI.sel=null;renderPanel();}$('left').classList.remove('full');renderLeft();},
 phonePlay:()=>{if(pzOn())return;if(S&&!rule('clock'))return;haptic(10);if(UI.speed){UI.lastSpeed=UI.speed;UI.speed=0;}else UI.speed=UI.lastSpeed||1;renderHUD();},
 phoneSpeed:()=>{if(pzOn())return;if(S&&!rule('clock'))return;haptic(8);const cur=UI.speed||UI.lastSpeed||1,i=SPEEDS.indexOf(cur),n=SPEEDS[(i+1)%SPEEDS.length];UI.speed=n;UI.lastSpeed=n;renderHUD();},
 install:()=>{if(installEvt){installEvt.prompt();installEvt.userChoice.finally(()=>{installEvt=null;});return;}
   openModal(pitchHtml(false));},
 pitchSkip:()=>{const p=UI.pendGame;UI.pendGame=null;UI.pitched=true;if(p)beginGame(...p);else closeModal();},
 logOpen:({id})=>{const e=(S.log||[]).find(x=>x.id===id),o=e&&e.o;if(!o)return;$('dash').hidden=true;closeModal();
  if(o.a==='city'&&isCity(o.v)){ACT.focusCity({city:o.v});return;}
  if(o.a==='link'){if(S.links.some(l=>l.id===o.v)){ACT.selLink({id:o.v});return;}toast(tr('interface.that_link_is_gone_it_was'),'');return;}
  if(o.a==='cust'){if(S.biz.some(b=>b.id===o.v)){ACT.custGo({id:o.v});return;}toast(tr('interface.that_customer_is_gone_the_contract'),'');return;}
  if(o.a==='bank'){ACT.bank({});return;}if(o.a==='ops'){ACT.opsOpen();return;}if(o.a==='tab'&&LOG_TABS.includes(o.v))ACT.leftTab({t:o.v});},
 logAll:()=>{UI.logAll=!UI.logAll;renderLeft();},
 focusCity:({city})=>{selectCity(city);const C=CITY[city];cam.x=C.x;cam.y=C.y;cam.z=Math.max(cam.z,1.2);if(innerWidth<760)UI.leftOpen=false;renderLeft();},
 selLink:({id})=>selectLink(id),
};
