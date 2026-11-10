// Moving a network to another device (#263): codes and a link out, a pasted link in.
Object.assign(ACT,{
 xfer:({id}={})=>{const sid=slotOkId(id)?id:UI.slot;if(!sid||!slotIdx().some(e=>e.id===sid))return;
   if(!gzOk()){toast(tr('transfer.this_browser_cannot_pack_networks_into'),'bad');return;}
   xferPack(sid).then(x=>{UI.xfer={...x,id:sid,i:0};openModal(xferHtml());track('xfer_open');},()=>toast(tr('loop.your_saved_game_could_not_be'),'bad'));},
 xferPage:({i})=>{const x=UI.xfer;if(!x||!(i>=0&&i<x.parts.length))return;x.i=i;openModal(xferHtml());},
 xferLink:()=>{const x=UI.xfer;if(!x)return;const t=x.link,no=()=>toast(tr('transfer.could_not_copy_the_link_here'),'bad');
   if(navigator.share&&isPhone()){navigator.share({title:'Series of Tubes',url:t}).catch(()=>{});return;}
   try{navigator.clipboard.writeText(t).then(()=>toast(tr('transfer.link_copied_open_it_on_your'),'good'),no);}catch(e){no();}},
 xferFile:()=>{const x=UI.xfer;if(x)exportSlot(x.id);},
 xferRecv:()=>openModal(xferRecvHtml()),
 xferPaste:()=>{const el=$('xferIn');if(el)xferTake(el.value.trim());},
 xferReset:()=>{xferClear();ACT.helpClose();},
});
