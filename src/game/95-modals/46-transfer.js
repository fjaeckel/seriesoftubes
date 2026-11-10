/* Moving a network to another device (#263): the codes to scan and the link, and on the other side, where to paste it. */
function xferHtml(){const x=UI.xfer,n=x.parts.length,i=Math.min(x.i,n-1),nm=esc(x.name||tr('common.unnamed_network'));
  const q=n?qrEncode(new TextEncoder().encode(x.parts[i])):null;
  return `<div style="display:flex;align-items:center"><div class="grow"><div class="eyebrow">📲 ${tr('transfer.send_to_another_device')}</div><h2 style="font-size:26px">${nm}</h2></div><button class="x" data-act="helpClose" aria-label="${tr('common.close')}">×</button></div>
  ${q?`<p class="tagline">${n>1?tr('transfer.on_your_other_device_open_the_many'):tr('transfer.on_your_other_device_open_the')}</p>${qrSvg(q,tr('transfer.qr_code_i_of_n',{i:i+1,n}))}
  ${n>1?`<div class="xfer-nav">${btn('‹','xferPage',{i:i-1},'ghost',i===0)}<b>${tr('transfer.code_i_of_n',{i:i+1,n})}</b>${btn(tr('transfer.next_code'),'xferPage',{i:i+1},'pink',i===n-1)}</div>`:''}`
  :`<p class="tagline">${tr('transfer.this_network_is_too_big_for')}</p>`}
  <div class="btns" style="margin-top:10px">${btn(navigator.share&&isPhone()?tr('transfer.send_the_link'):tr('transfer.copy_the_link'),'xferLink',{},n?'':'pink')}${btn(tr('common.export_save'),'xferFile',{},'ghost')}</div>
  <p class="note">${n?tr('transfer.the_codes_leave_out_your_charts')+' ':''}${tr('transfer.nothing_is_uploaded_anywhere_the_codes')}</p>`;}
function xferRecvHtml(){return `<div style="display:flex;align-items:center"><div class="grow"><div class="eyebrow">📲 ${tr('transfer.from_another_device')}</div><h2 style="font-size:26px">${tr('transfer.moving_a_network_here')}</h2></div><button class="x" data-act="helpClose" aria-label="${tr('common.close')}">×</button></div>
  <p class="tagline">${tr('transfer.on_the_other_device_open_the')}</p>
  <label class="f" for="xferIn">${tr('transfer.paste_a_transfer_link')}</label><textarea class="t xfer-in" id="xferIn" rows="3" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea>
  <div class="btns" style="margin-top:10px">${btn(tr('common.open'),'xferPaste',{},'pink big')}${btn(tr('common.import_a_save'),'importPick',{},'ghost')}</div>`;}
function xferWaitHtml(s){const have=Object.keys(s.p).length;
  return `<div id="xferWait" class="eyebrow">📲 ${tr('transfer.moving_a_network_here')}</div><h2 style="font-size:26px">${tr('transfer.have_of_n_codes_are_here',{have,n:s.n})}</h2>
  <div class="xfer-dots" aria-hidden="true">${Array.from({length:s.n},(_,k)=>`<i${s.p[k]!==undefined?' class="on"':''}></i>`).join('')}</div>
  <p class="tagline">${tr('transfer.scan_the_next_code_on_your')}</p><div class="btns">${btn(tr('common.close'),'helpClose',{},'pink big')}${btn(tr('transfer.start_over'),'xferReset',{},'ghost')}</div>`;}
