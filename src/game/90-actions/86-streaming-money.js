/* ---------- Streaming money's actions (60-features/38-streaming-money.js) ---------- */
Object.assign(ACT,{
 // A country's plan. A rise loses some viewers at once, more where wallets are thin; the rest of the gap drifts off.
 cntPrice:({cc,p})=>{if(!content()||typeof cc!=='string')return;const C=S.cnt,x=C.cc[cc];p=+p;if(!x||!Number.isInteger(p)||!PRICE_T[p]||p===prOf(cc))return;
   const old=PRICE_T[prOf(cc)].r;C.pr[cc]=p;const nw=PRICE_T[p].r;
   if(nw>old){const lost=Math.max(0,Math.min(x.d-1,x.d*Math.min(0.3,PR_SHOCK*(nw/old-1)*prA(cc))));x.d-=lost;C.drift[cc]=1;
     toast(tr(PR_BACKLASH[hstr(cc+'|bl|'+S.day)%PR_BACKLASH.length],{country:esc(ccName(cc)),subs:fmtSubs(lost)}),'bad');sfx('err');}
   else{toast(tr('streaming_money.price_cut_toast',{country:esc(ccName(cc))}),'good');sfx('coin');}after();},
 // The ad tier in a country, on or off.
 cntAds:({cc,on})=>{if(!content()||typeof cc!=='string')return;const C=S.cnt;if(!C.cc[cc]||!!on===adsOn(cc))return;
   if(on){C.ads[cc]=1;toast(tr('streaming_money.ads_on_toast',{country:esc(ccName(cc))}),'good');}
   else{delete C.ads[cc];C.drift[cc]=1;toast(tr('streaming_money.ads_off_toast',{country:esc(ccName(cc))}),'');}sfx('build');after();},
 // A continent's licence: buy it outright (or top it up to your catalogue), rent it monthly, or stop renting.
 cntLic:({reg,k})=>{if(!content()||typeof reg!=='string'||!own(REG,reg)||!['buy','rent','stop'].includes(k))return;const C=S.cnt,l=C.lic[reg],where=REG[reg],holder=tr(licHolder(reg));
   if(k==='stop'){if(!l||!l.mo)return;delete C.lic[reg];for(const cc in C.cc)if(ccInfo(cc).reg===reg)C.drift[cc]=1;toast(tr('streaming_money.rights_stopped',{where}),'bad');after();return;}
   if(!C.cat||reg===CITY[S.home].reg||licT(reg)>=C.cat||!Object.keys(C.cc).some(cc=>ccInfo(cc).reg===reg))return;
   if(k==='rent'){if(l&&!l.mo)return;C.lic[reg]={t:C.cat,mo:licMo(reg,C.cat)};toast(tr('streaming_money.rights_rented',{holder,where,mo:fmt$(C.lic[reg].mo)}),'good');sfx('build');after();return;}
   if(!spend(licBuy(reg)))return;C.lic[reg]={t:C.cat,mo:0};toast(tr('streaming_money.rights_bought',{holder,where}),'good');sfx('coin');after();},
});
