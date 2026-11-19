/* ---------- Streaming money: price plans, an ad tier and licensing territories (37-streaming.js) ----------
   Price: each country has a plan (PRICE_T). What a plan costs is the same everywhere; what a home can pay is not
   (arpuOf), so a plan's stretch prA = price / local wallet sets how many homes sign up (pot), how fast (grow) and how
   fast they leave when it buffers (churn). Revenue per subscriber peaks near the plan that suits the wallet; cheaper
   plans bring traffic (levels), dearer ones bring cash per Gbps. Raising a price loses some viewers at once (the
   backlash); above the new ceiling the rest drift off at renewal (PR_DRIFT, for countries in C.drift: only what a
   plan, the ads or a licence took away drifts, so a premiere's gains stay).
   Ads: a cheaper plan with ad breaks: more homes, each paying AD_SUB of the plan, plus ad money that only pays for ads
   that played (q cubed: a spinner in the ad break is a refund) and pays most on premiere and live-event nights.
   Licensing: catalogue shows above the indie tier are only cleared at home. Elsewhere a continent gets the catalogue's
   pull only with a regional licence, bought outright (LIC_BUY months of rent) or rented monthly; priced on the
   countries you are live in there when you sign, so buying early and growing later pays. */
const PRICE_T=[{n:N_('streaming_money.budget'),r:0.6},{n:N_('streaming_money.standard'),r:1},{n:N_('streaming_money.premium'),r:1.5}];
const AD_SUB=0.6,AD_RATE=0.4,AD_POT=1.3,AD_GROW=1.25,AD_CHURN=1.3,AD_CPM_PREM=2,AD_CPM_LIVE=3;
const PR_SHOCK=0.15,PR_DRIFT=0.03,LIC_K=0.3,LIC_BUY=18;
const AD_BRANDS=[N_('streaming_money.brand_chips'),N_('streaming_money.brand_cola'),N_('streaming_money.brand_mattress'),N_('streaming_money.brand_air'),
 N_('streaming_money.brand_insure'),N_('streaming_money.brand_vitamins'),N_('streaming_money.brand_climb')];
const LIC_HOLDERS=[N_('streaming_money.holder_territorial'),N_('streaming_money.holder_geoblock'),N_('streaming_money.holder_uncle'),
 N_('streaming_money.holder_window'),N_('streaming_money.holder_century'),N_('streaming_money.holder_lock')];
const PR_BACKLASH=[N_('streaming_money.backlash_live'),N_('streaming_money.backlash_grandma'),N_('streaming_money.backlash_library'),N_('streaming_money.backlash_password')];
// A country's wallet (its biggest city's ARPU), the plan that suits it, and the plan it has.
const ccArpu=cc=>{const I=ccInfo(cc);return I?arpuOf(I.main):1;};
const prFit=cc=>{const a=ccArpu(cc);let b=0;PRICE_T.forEach((p,i)=>{if(Math.abs(p.r-a)<Math.abs(PRICE_T[b].r-a))b=i;});return b;};
const prOf=cc=>{const v=S.cnt&&S.cnt.pr&&S.cnt.pr[cc];return v!=null?v:prFit(cc);};
const prA=cc=>PRICE_T[prOf(cc)].r/ccArpu(cc);
const adsOn=cc=>!!(S.cnt&&S.cnt.ads&&S.cnt.ads[cc]);
// Licences: the catalogue tier a continent actually gets.
const licT=reg=>{const C=S.cnt;if(!C)return 0;if(reg===CITY[S.home].reg)return C.cat;const l=C.lic&&C.lic[reg];return Math.min(C.cat,l?l.t:0);};
const licEff=cc=>{const I=ccInfo(cc);return I?licT(I.reg):S.cnt?S.cnt.cat:0;};
const licPot=cc=>S.cnt?CAT_T[licEff(cc)].pot/CAT_T[S.cnt.cat].pot:1;
const licHolder=reg=>LIC_HOLDERS[hstr('lic|'+reg)%LIC_HOLDERS.length];
function licMo(reg,t){let g=0;for(const k in S.cnt.cc){const I=ccInfo(k);if(I&&I.reg===reg)g+=I.P*CNT_POT*eraMul();}return Math.max(3000,Math.round(g*(CAT_T[t].pot-1)*CNT_RATE*LIC_K/500)*500);}
// Buying outright: the full price, or the top-up from the tier you already own.
const licBuy=reg=>{const C=S.cnt,l=C.lic[reg];return licMo(reg,C.cat)*LIC_BUY-(l&&!l.mo?licMo(reg,l.t)*LIC_BUY:0);};
// Ads: what a country's ad breaks earn (monthly rate) tonight; advertisers pay more on big nights.
const adCpm=reg=>{const p=premLive();let m=p&&premIn(p,reg)?(p.live?AD_CPM_LIVE:AD_CPM_PREM):1;if(evLiveAt(reg))m=Math.max(m,AD_CPM_LIVE);return m;};
const adPlayed=(r,cc)=>ccQ(r,cc)**3;
function adRev(r,cc){if(!adsOn(cc))return 0;const I=ccInfo(cc),o=r&&r.cnt&&r.cnt.cc[cc],D=o?o.D:S.cnt.cc[cc].d;return D*adPlayed(r,cc)*AD_RATE*CNT_RATE*ccArpu(cc)*adCpm(I.reg);}
const adBrand=(cc,d)=>AD_BRANDS[hstr(cc+'|ad|'+d)%AD_BRANDS.length];
CNT_MUL.pot.push(cc=>clamp(Math.exp(1-prA(cc)),0.15,1.6)*(adsOn(cc)?AD_POT:1)*licPot(cc));
CNT_MUL.grow.push(cc=>clamp(Math.exp(0.8*(1-prA(cc))),0.3,1.5)*(adsOn(cc)?AD_GROW:1)*(S.cnt?CAT_T[licEff(cc)].grow/CAT_T[S.cnt.cat].grow:1));
CNT_MUL.churn.push(cc=>clamp(prA(cc),0.6,2)*(adsOn(cc)?AD_CHURN:1));
CNT_MUL.rev.push(cc=>PRICE_T[prOf(cc)].r*(adsOn(cc)?AD_SUB:1));
CNT_ADD.push(adRev);
CNT_COST.push(()=>{let m=0;for(const k in S.cnt.lic)m+=S.cnt.lic[k].mo||0;return m;});
CNT_NEW.push(o=>{o.pr={};o.ads={};o.lic={};o.drift={};o.adEv={v:0,q:1};});
CNT_SAN.push((c0,o)=>{const n=(v,d)=>Number.isFinite(+v)?+v:d,ob=x=>x&&typeof x==='object'?x:{};
  o.pr={};for(const k of Object.keys(ob(c0.pr)))if(o.cc[k])o.pr[k]=clamp(Math.round(n(c0.pr[k],1)),0,PRICE_T.length-1);
  o.ads={};for(const k of Object.keys(ob(c0.ads)))if(o.cc[k]&&c0.ads[k])o.ads[k]=1;
  o.drift={};for(const k of Object.keys(ob(c0.drift)))if(o.cc[k]&&c0.drift[k])o.drift[k]=1;
  o.lic={};for(const k of Object.keys(ob(c0.lic))){const x=c0.lic[k];if(own(REG,k)&&x&&typeof x==='object')o.lic[k]={t:clamp(Math.round(n(x.t,0)),0,CAT_T.length-1),mo:clamp(Math.round(n(x.mo,0)),0,1e8)};}
  const e=ob(c0.adEv);o.adEv={v:clamp(n(e.v,0),0,1e12),q:clamp(n(e.q,1),0,1)};});
// Once a day: viewers above a lowered ceiling drift off at renewal; ad money from the big nights is counted and reported.
CNT_DAY.push(d=>{const C=S.cnt;
  for(const cc of Object.keys(C.drift)){const x=C.cc[cc],P=ccPot(cc)+bundG(cc);if(x&&x.d>P+1e-6){const v=x.d-(x.d-P)*PR_DRIFT;x.d=Math.max(1,v-P<P*0.005?P:v);}else delete C.drift[cc];}
  let v=0,q=1,big=false;for(const cc in C.cc){if(!adsOn(cc)||adCpm(ccInfo(cc).reg)<=1)continue;big=true;v+=adRev(R,cc)/monLen(d);q=Math.min(q,adPlayed(R,cc));}
  if(big){C.adEv.v+=v;C.adEv.q=Math.min(C.adEv.q,q);}
  else if(C.adEv.v>0){toast(tr('streaming_money.ads_event_toast',{brand:tr(adBrand('ev',d)),cash:fmt$(C.adEv.v),p:pct(C.adEv.q)}),'goal');sfx('coin');C.adEv={v:0,q:1};}});
// A launched country's block in the city panel: the plan, the ad tier, and the licence its continent needs.
CNT_CC.push(cc=>{const C=S.cnt,cur=prOf(cc),fit=prFit(cc),reg=ccInfo(cc).reg,where=REG[reg];
  let h=`<div class="btns">${PRICE_T.map((p,i)=>i===cur?`<span class="tag st on">${tr(p.n)}</span>`:btn(tr(p.n),'cntPrice',{cc,p:i},'ghost sm')).join('')}${btn(adsOn(cc)?tr('streaming_money.ads_drop'):tr('streaming_money.ads_add'),'cntAds',{cc,on:!adsOn(cc)},'ghost sm')}</div>`;
  h+=`<p class="meta">${tr('streaming_money.fits_line',{tier:tr(PRICE_T[fit].n)})}</p>`;
  if(adsOn(cc))h+=`<p class="meta">${tr('streaming_money.ads_line',{brand:tr(adBrand(cc,S.day)),p:pct(adPlayed(R,cc)),v:fmt$(adRev(R,cc))})}</p>`;
  if(C.cat>0&&reg!==CITY[S.home].reg){const l=C.lic[reg],hold=tr(licHolder(reg));
    if(licT(reg)<C.cat){const full=ccPot(cc)/(licPot(cc)||1),buy=licBuy(reg),mo=licMo(reg,C.cat);
      h+=`<p class="why">${tr('streaming_money.lock_line',{cat:tr(CAT_T[C.cat].n),where,holder:hold,max:fmtSubs(ccPot(cc)),full:fmtSubs(full)})}</p><div class="btns">${btn(tr('streaming_money.buy_rights',{cost:fmt$(buy)}),'cntLic',{reg,k:'buy'},'pink sm',S.cash<buy)}${l&&!l.mo?'':btn(tr('streaming_money.rent_rights',{mo:fmt$(mo)}),'cntLic',{reg,k:'rent'},'sm')}</div>`;}
    if(l&&l.mo)h+=`<p class="meta">${tr('streaming_money.rented_line',{holder:hold,mo:fmt$(l.mo),where})}</p><div class="btns">${btn(tr('streaming_money.stop_renting'),'cntLic',{reg,k:'stop'},'ghost sm')}</div>`;}
  return h;});
