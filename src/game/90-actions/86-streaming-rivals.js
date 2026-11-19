/* ---------- Rival streamers' actions (38-streaming-rivals.js) ---------- */
Object.assign(ACT,{
 // Ads while a rival's viewers are looking around: they come over where your picture holds, and laugh where it does not.
 rvAd:()=>{if(!rvOn())return;const C=S.cnt,A=rvAdPlan();if(!A.ks.length||!spend(A.cost))return;let g=0,l=0;
   for(const k of A.ks){const x=C.cc[k];C.rv.sw[k].ad=1;if(ccQ(R,k)>=0.9){const a=rvAdGain(k);x.d+=a;g+=a;}else{const b=x.d*0.04;x.d=Math.max(1,x.d-b);l+=b;}}
   if(g>0)toast(tr('streaming_rivals.ad_done',{subs:fmtSubs(g)}),'good');if(l>0)toast(tr('streaming_rivals.ad_flop',{subs:fmtSubs(l)}),'bad');sfx(l>0?'err':'coin');after();},
 // A price war: match it (earn less on that continent) or hold (subscribers there drift to the cheaper one).
 rvMatch:({m})=>{if(!rvOn())return;const P=S.cnt.rv.pw;if(!P||S.day>=P.until)return;P.m=m?1:0;
   const v={rival:esc(rvName(RIV_ID[P.r])),where:REG[P.reg]};if(P.m)toast(tr('streaming_rivals.matched_toast',v),'good');else toast(tr('streaming_rivals.held_toast',v));after();},
});
