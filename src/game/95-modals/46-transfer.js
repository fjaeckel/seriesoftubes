/* Moving a network to another device (#263): the save file through the share sheet, or the link; on the other side,
   where to open it. */
function xferHtml(){const x=UI.xfer,nm=esc(x.name||tr('common.unnamed_network'));
  return `<div style="display:flex;align-items:center"><div class="grow"><div class="eyebrow">📲 ${tr('transfer.send_to_another_device')}</div><h2 style="font-size:26px">${nm}</h2></div><button class="x" data-act="helpClose" aria-label="${tr('common.close')}">×</button></div>
  <p class="tagline">${x.file?tr('transfer.send_the_save_file_to_your'):tr('transfer.download_the_save_file_and_send')}</p>
  <div class="btns" style="margin-top:10px">${x.file?btn(tr('transfer.send_the_save_file'),'xferShare',{},'pink big'):btn(tr('common.export_save'),'xferFile',{},'pink big')}${x.link?btn(tr('transfer.copy_the_link'),'xferLink',{},''):''}</div>
  ${x.link?`<p class="note">${tr('transfer.or_copy_the_link_and_paste')}</p>`:''}<p class="note">${tr('transfer.nothing_is_uploaded_anywhere_the_file')}</p>`;}
function xferRecvHtml(){return `<div style="display:flex;align-items:center"><div class="grow"><div class="eyebrow">📲 ${tr('transfer.from_another_device')}</div><h2 style="font-size:26px">${tr('transfer.moving_a_network_here')}</h2></div><button class="x" data-act="helpClose" aria-label="${tr('common.close')}">×</button></div>
  <p class="tagline">${tr('transfer.on_the_device_with_your_network')}</p>
  <div class="btns" style="margin-top:10px">${btn(tr('common.import_a_save'),'importPick',{},'pink big')}</div>
  <label class="f" for="xferIn">${tr('transfer.or_paste_a_transfer_link')}</label><textarea class="t xfer-in" id="xferIn" rows="3" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea>
  <div class="btns" style="margin-top:10px">${btn(tr('common.open'),'xferPaste',{},'')}</div>`;}
