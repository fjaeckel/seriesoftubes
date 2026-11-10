// Moving a network to another device (#263): the save file through the share sheet, or a link to paste.
Object.assign(ACT,{
 xfer:({id}={})=>{const sid=slotOkId(id)?id:UI.slot;if(!sid||!slotIdx().some(e=>e.id===sid))return;
   xferPack(sid).then(x=>{UI.xfer=x;openModal(xferHtml());track('xfer_open');},()=>toast(tr('loop.your_saved_game_could_not_be'),'bad'));},
 // Straight from the tap: a share sheet only opens on a user's gesture.
 xferShare:()=>{const x=UI.xfer;if(!x||!x.file)return;
   try{navigator.share({files:[x.file],title:'Series of Tubes'}).then(()=>track('xfer_share'),e=>{if(e&&e.name!=='AbortError')exportSlot(x.id);});}catch(e){exportSlot(x.id);}},
 xferLink:()=>{const x=UI.xfer;if(!x||!x.link)return;const no=()=>toast(tr('transfer.could_not_copy_the_link_here'),'bad');
   try{navigator.clipboard.writeText(x.link).then(()=>toast(tr('transfer.link_copied_paste_it_on_your'),'good'),no);}catch(e){no();}},
 xferFile:()=>{const x=UI.xfer;if(x)exportSlot(x.id);},
 xferRecv:()=>openModal(xferRecvHtml()),
 xferPaste:()=>{const el=$('xferIn');if(el)xferTake(el.value.trim());},
});
