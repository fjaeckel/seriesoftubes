/* ---------- The Hyperscaler in mainland China (37-hyper-sites.js) ----------
   No foreign cloud runs mainland regions itself: AWS's are operated by licensed local partners (Sinnet in Beijing, NWCD
   in Ningxia) and Azure's by 21Vianet, each walled off from the rest of its cloud, its customers signed with the partner.
   So here: from level HS_CN.lv, file with a local partner (S.cnLic, the licence the Tubular game's joint venture uses,
   granted after its wait). Then Beijing, Shanghai and the campus towns may hold regions, Chinese users may be launched,
   and the partner keeps HS_CN.share of what they pay. Nothing crosses the wall (hsWall): Chinese users only in Chinese
   regions (38-hyper-residency.js), those regions for no one else, and no replica, lake or training run across. */
const HS_CN={lv:7,lic:2000000,share:0.35,days:45};
CX_MUL.rev.push(cc=>cc==='CN'&&hyper()?1-HS_CN.share:1);
// Why a licence cannot be filed now, or ''.
const hsCnWhy=()=>!S||!S.hs?'':S.cnLic&&S.cnLic.state!=='none'?tr('hyper_cn.filed_already'):lvl()<HS_CN.lv?tr('hyper_cn.need_lv',{lv:HS_CN.lv}):'';
// The licence on the China cards: where it stands, and the button to file.
function hsCnHtml(){const st=S.cnLic?S.cnLic.state:'none',v={p:Math.round(HS_CN.share*100)};
  if(st==='ok')return `<p class="meta">${tr('hyper_cn.ok',v)}</p>`;
  if(st==='pending')return `<p class="note">${tr('hyper_cn.pending',{n:Math.max(0,S.cnLic.ready-S.day)})}</p>`;
  const w=hsCnWhy();return `<p class="lead">${tr('hyper_cn.lead',v)}</p>`+(w?`<p class="why">${w}</p>`:hsBtns(btn(tr('hyper_cn.apply',{cost:fmt$(HS_CN.lic)}),'hsCnApply',{},'pink',S.cash<HS_CN.lic)));}
