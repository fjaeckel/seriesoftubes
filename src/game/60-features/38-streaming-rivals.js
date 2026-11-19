/* ---------- Rival streamers: a Streaming service is not alone on the sofa (37-streaming.js) ----------
   Four rivals share every country's evenings. Each is in a country or not (a hash of the game and the country, plus the
   countries it launched in since, rv.in) and has a picture of its own (q). Viewers compare: your picture against the best
   rival's sets your ceiling and your growth there, and the more rivals, the more places to flee to when you buffer
   (CNT_MUL pot / grow / churn).
   They bid for the live events on offer: a bid raises the price and shortens the wait, and an offer you pass on or let
   lapse goes to a rival. A rival's big night can buffer (r.buf in a hundred, or certainly while it is down): for RV_SW
   days its viewers there switch easily (a window, rv.sw), and ads saying you don't buffer bring them over, if you don't.
   A clean night keeps them put for a while instead. Now and then one moves (rv.next): it launches in a country of yours,
   starts a price war on a continent (match it and earn less there, or hold and watch subscribers drift), or has an
   embarrassing outage (a window too). Nothing moves in a network's first RV_START days or below level RV_LV. Every roll
   is a hash, so the game's random stream is untouched. */
const RIV=[{id:'nfx',net:'nfx',q:0.96,w:1,p:90,bid:3,buf:25,k:0},
 {id:'ggl',net:'ggl',q:0.92,w:0.8,p:75,bid:2,buf:35,k:1},
 {id:'dzy',n:'Dizzy+',col:'#1F3C88',q:0.9,w:0.6,p:45,bid:2,buf:40,k:0},
 {id:'hul',n:'Hullabaloo',col:'#1CA35B',q:0.85,w:0.5,p:20,home:'AM',bid:1,buf:65,k:2}];
const RIV_ID=Object.fromEntries(RIV.map(r=>[r.id,r]));
const RV_START=60,RV_LV=2,RV_EVERY=18,RV_SW=7,RV_SMUG=4,RV_BID=5,RV_PW=30,RV_PW_CUT=0.85,RV_BLEED=0.997,RV_KINDS=['launch','pw','out'];
const RV_OUT=[N_('streaming_rivals.out_intern'),N_('streaming_rivals.out_cert'),N_('streaming_rivals.out_dns'),N_('streaming_rivals.out_squirrel'),N_('streaming_rivals.out_bgp')];
const RV_BUF=[N_('streaming_rivals.buf_wheel'),N_('streaming_rivals.buf_status'),N_('streaming_rivals.buf_144p'),N_('streaming_rivals.buf_demand')];
const rvOn=()=>content()&&!!S.cnt&&!!S.cnt.rv;
const rvName=r=>r.net&&NET[r.net]?NET[r.net].name:r.n;
const rvLogo=r=>logo(r.net&&NET[r.net]?NET[r.net]:{name:r.n,col:r.col});
// Is a rival in a country: where it launched since, or (a hash) where it always was. Never where foreign streaming is kept out.
function rvHas(r,cc){const I=ccInfo(cc);if(!I||I.cn||!S.cnt)return false;const L=S.cnt.rv&&S.cnt.rv.in[r.id];if(L&&L.includes(cc))return true;
  return hstr(S.asn+'|rv|'+r.id+'|'+cc)%100<(r.home===I.reg?85:r.p);}
const rvIn=cc=>RIV.filter(r=>rvHas(r,cc));
const rvDown=(r,reg)=>{const o=S.cnt.rv.out;return !!o&&o.r===r.id&&(o.reg==='ALL'||o.reg===reg)&&S.day<o.until;};
const rvQ=(r,reg)=>rvDown(r,reg)?r.q*0.3:r.q;
const rvPw=cc=>{const p=S.cnt.rv.pw;return p&&S.day<p.until&&ccInfo(cc).reg===p.reg&&rvHas(RIV_ID[p.r],cc)?p:null;};
const rvSw=cc=>{const w=S.cnt.rv.sw[cc];return w&&S.day<w.until?w:null;};
/* Your picture against the best rival's tonight (no rival: a head start). W weighs the rivals that are up: where viewers
   go when you buffer. An open window (k 1) is a crowd looking for a new service; a rival's clean night (k -1) slows you. */
function rvEdge(cc){const reg=ccInfo(cc).reg,rs=rvIn(cc),q=ccQ(R,cc);let best=null,bq=0,W=0;
  for(const r of rs){const x=rvQ(r,reg);if(x>bq){bq=x;best=r;}if(x>0.5)W+=r.w;}
  const e=best?q-bq:0.1,pw=rvPw(cc),sw=rvSw(cc),un=pw&&!pw.m;
  return {q,best,bq,W,pw,sw,pot:clamp(1+2*e-0.08*Math.max(0,W-1.5),0.6,1.3)*(sw&&sw.k>0?1.1:1),
    grow:clamp(1+3*e,0.5,1.6)*(sw?sw.k>0?2.5:0.6:1)*(un?0.5:1),churn:(1+0.3*W)*(un?1.5:1)};}
CNT_MUL.pot.push(cc=>rvOn()?rvEdge(cc).pot:1);
CNT_MUL.grow.push(cc=>rvOn()?rvEdge(cc).grow:1);
CNT_MUL.churn.push(cc=>rvOn()?rvEdge(cc).churn:1);
CNT_MUL.rev.push(cc=>{const p=rvOn()&&rvPw(cc);return p&&p.m?RV_PW_CUT:1;});
// A rival with viewers on that continent among your countries (anywhere, for the world), picked by how deep its pockets are.
function rvFor(reg,h){const ks=Object.keys(S.cnt.cc).filter(k=>reg==='ALL'||ccInfo(k).reg===reg),rs=RIV.filter(r=>ks.some(k=>rvHas(r,k)));
  const t=rs.reduce((a,r)=>a+r.bid,0);if(!t)return null;let x=h%t;for(const r of rs){if(x<r.bid)return r;x-=r.bid;}return null;}
const rvShow=()=>[{l:tr('common.show_me'),act:'leftTab',args:{t:'goals'}}];
function rvDay(d){if(!rvOn())return;const C=S.cnt,V=C.rv,mine=Object.keys(C.cc);
  for(const k of Object.keys(V.sw))if(V.sw[k].until<=d)delete V.sw[k];
  if(V.pw&&V.pw.until<=d){toast(tr('streaming_rivals.pw_over',{rival:esc(rvName(RIV_ID[V.pw.r]))}),'good');V.pw=null;}
  if(V.out&&V.out.until<=d)V.out=null;
  rvBids(d);rvEvents(d);
  for(const k of mine){const p=rvPw(k);if(p&&!p.m)C.cc[k].d=Math.max(1,C.cc[k].d*RV_BLEED);}
  if(lvl()>=RV_LV&&mine.length&&d>=V.next){const h=hstr(S.asn+'|rvmove|'+d);V.next=d+RV_EVERY+h%17;rvMove(d,h);}}
CNT_DAY.push(rvDay);
/* Rights: every offer is noted (rv.bid). Each day without a bid a rival may make one: the price goes up and the offer
   ends in RV_BID days. An offer gone without you buying it goes to its bidder, or to a rival with viewers there. */
function rvBids(d){const C=S.cnt,V=C.rv;
  for(const o of C.roff){const b=V.bid[o.id]||(V.bid[o.id]={r:'',n:o.n,reg:o.reg,day:o.day});
    if(b.r||hstr(S.asn+'|rvbid|'+o.n+'|'+o.day+'|'+d)%7)continue;const r=rvFor(o.reg,hstr(S.asn+'|rvwho|'+o.n+'|'+d));if(!r)continue;
    b.r=r.id;o.fee=Math.round(o.fee*(1.2+0.1*(hstr(S.asn+'|rvfee|'+o.n+'|'+d)%3))/1000)*1000;o.exp=Math.min(o.exp,d+RV_BID);
    toast(tr('streaming_rivals.bid_toast',{rival:esc(rvName(r)),show:tr(EV_NAMES[o.n]),fee:fmt$(o.fee),date:dateStr(o.exp)}),'bad',rvShow());}
  for(const id of Object.keys(V.bid)){if(C.roff.some(o=>o.id===id))continue;const b=V.bid[id];delete V.bid[id];
    if(C.evs.some(e=>e.id===id)){if(b.r)toast(tr('streaming_rivals.outbid_toast',{rival:esc(rvName(RIV_ID[b.r])),show:tr(EV_NAMES[b.n])}),'goal');continue;}
    const r=RIV_ID[b.r]||rvFor(b.reg,hstr(S.asn+'|rvtake|'+b.n+'|'+d));if(!r||b.day<=d)continue;
    V.evs.push({id,r:r.id,n:b.n,reg:b.reg,day:b.day,b:0});if(V.evs.length>8)V.evs.shift();
    toast(tr('streaming_rivals.snatched_toast',{rival:esc(rvName(r)),show:tr(EV_NAMES[b.n]),where:evWhere(b),date:dateStr(b.day)}),'bad');}}
// A rival's event night: buffering opens a window where it has viewers among your countries; a clean night shuts one.
function rvEvents(d){const C=S.cnt,V=C.rv;
  for(const e of V.evs){if(e.b||d<e.day)continue;const r=RIV_ID[e.r],ks=Object.keys(C.cc).filter(k=>(e.reg==='ALL'||ccInfo(k).reg===e.reg)&&rvHas(r,k));
    const buf=rvDown(r,e.reg==='ALL'?(V.out&&V.out.reg):e.reg)||hstr(S.asn+'|rvbuf|'+e.n+'|'+e.day+'|'+r.id)%100<r.buf;e.b=buf?1:-1;if(!ks.length)continue;
    for(const k of ks)if(buf||!rvSw(k))V.sw[k]={r:r.id,until:d+(buf?RV_SW:RV_SMUG),k:buf?1:-1,ad:0};
    const v={rival:esc(rvName(r)),show:tr(EV_NAMES[e.n]),where:evWhere(e)};
    if(buf){toast(`<b>📰 ${tr(RV_BUF[hstr(S.asn+'|rvhead|'+d)%RV_BUF.length],v)}</b><br>${tr('streaming_rivals.window_line',{where:v.where,n:RV_SW})}`,'goal',rvShow());sfx('coin');}
    else toast(tr('streaming_rivals.clean_toast',v),'bad');}
  V.evs=V.evs.filter(e=>d<e.day+EV_DAYS);}
// A move: rivals in a hashed order, each trying what it likes doing first (k), then anything it can.
function rvMove(d,h){const mine=Object.keys(S.cnt.cc).filter(k=>!ccWhy(k)).sort();
  for(let i=0;i<RIV.length;i++){const r=RIV[(i+(h>>>4))%RIV.length],want=h%2?RV_KINDS[r.k]:RV_KINDS[(h>>>2)%3];
    for(const kind of [want,...RV_KINDS.filter(x=>x!==want)])if(rvDo(kind,r,d,h,mine))return;}}
function rvDo(kind,r,d,h,mine){const V=S.cnt.rv,has=mine.filter(k=>rvHas(r,k)),nm=esc(rvName(r));
  if(kind==='launch'){const ks=mine.filter(k=>!rvHas(r,k));if(!ks.length)return false;const k=ks[(h>>>6)%ks.length];(V.in[r.id]=V.in[r.id]||[]).push(k);
    toast(tr('streaming_rivals.launch_toast',{rival:nm,country:esc(ccName(k))}),'bad',[],{a:'city',v:ccInfo(k).main});return true;}
  if(!has.length)return false;const reg=ccInfo(has[(h>>>6)%has.length]).reg;
  if(kind==='pw'){if(V.pw||!rule('market'))return false;V.pw={r:r.id,reg,until:d+RV_PW,m:0};
    toast(tr('streaming_rivals.pw_toast',{rival:nm,where:REG[reg]}),'bad',rvShow());return true;}
  if(V.out)return false;const c=(h>>>9)%RV_OUT.length;V.out={r:r.id,reg,until:d+3+(h>>>12)%3,c};
  for(const k of has)if(ccInfo(k).reg===reg)V.sw[k]={r:r.id,until:V.out.until+3,k:1,ad:0};
  toast(`<b>📰 ${tr('streaming_rivals.out_toast',{rival:nm,where:REG[reg]})}</b><br>${tr(RV_OUT[c])}<br>${tr('streaming_rivals.window_line',{where:REG[reg],n:V.out.until+3-d})}`,'goal',rvShow());sfx('coin');return true;}
/* Ads while a window is open: the countries not advertised in yet, priced by their audience. Where your picture holds,
   switchers come over; where you buffer too, the ad is a joke at your expense. */
const rvAdGain=k=>{const x=S.cnt.cc[k],P=ccPot(k);return Math.max(0,Math.min(x.d*0.15+P*0.02,P-x.d));};
function rvAdPlan(){const C=S.cnt,ks=Object.keys(C.rv.sw).filter(k=>{const w=rvSw(k);return C.cc[k]&&w&&w.k>0&&!w.ad;}).sort();
  return {ks,cost:Math.max(5000,Math.round((3000+ks.reduce((a,k)=>a+C.cc[k].d,0)*CNT_RATE*1.5)/1000)*1000)};}
// The charter card: who you are up against, what they are up to, and the decisions it asks for.
function rvCard(){if(!rvOn())return '';const C=S.cnt,V=C.rv,mine=Object.keys(C.cc);if(!mine.length)return '';let h='';
  const n=RIV.map(r=>[r,mine.filter(k=>rvHas(r,k)).length]).filter(x=>x[1]);
  if(n.length)h+=`<div class="meta">⚔️ ${tr('streaming_rivals.card_rivals',{list:n.map(([r,x])=>`${esc(rvName(r))} (${x})`).join(', ')})}</div>`;
  const O=V.out;if(O&&S.day<O.until)h+=`<div class="meta">💥 ${tr('streaming_rivals.card_out',{rival:esc(rvName(RIV_ID[O.r])),where:REG[O.reg],date:dateStr(O.until)})}</div>`;
  for(const id in V.bid){const b=V.bid[id],o=b.r&&C.roff.find(x=>x.id===id);if(o)h+=`<div class="meta" style="color:var(--bad)">🎟️ ${tr('streaming_rivals.card_bid',{rival:esc(rvName(RIV_ID[b.r])),show:tr(EV_NAMES[o.n]),fee:fmt$(o.fee),date:dateStr(o.exp)})}</div>`;}
  for(const e of V.evs)if(S.day<e.day)h+=`<div class="meta">📺 ${tr('streaming_rivals.card_ev',{rival:esc(rvName(RIV_ID[e.r])),show:tr(EV_NAMES[e.n]),where:evWhere(e),n:e.day-S.day})}</div>`;
  const P=V.pw;if(P&&S.day<P.until)h+=`<div class="meta" style="color:var(--bad)">💸 ${tr('streaming_rivals.card_pw',{rival:esc(rvName(RIV_ID[P.r])),where:REG[P.reg],date:dateStr(P.until)})}</div><div class="btns">${P.m?`<span class="tag st on">${tr('streaming_rivals.matching_p',{p:pct(1-RV_PW_CUT)})}</span>${btn(tr('streaming_rivals.hold'),'rvMatch',{m:0},'ghost sm')}`:`${btn(tr('streaming_rivals.match_p',{p:pct(1-RV_PW_CUT)}),'rvMatch',{m:1},'pink sm')}`}</div>`;
  const A=rvAdPlan();if(A.ks.length)h+=`<div class="meta">📉 ${tr('streaming_rivals.card_window',{list:A.ks.slice(0,5).map(k=>esc(ccName(k))).join(', ')})}</div><div class="btns">${btn(tr('streaming_rivals.ad_cost',{cost:fmt$(A.cost)}),'rvAd',{},'pink sm',S.cash<A.cost)}</div>`;
  return h;}
CNT_CARD.push(rvCard);
// A city's Streaming tab: the rivals in its country, their picture tonight, and what yours earns against them.
const rvSign=x=>(x>=1?'+':'−')+pct(Math.abs(x-1));
function rvSection(c){if(!rvOn())return '';const cc=CITY[c].cc;if(!ccInfo(cc)||ccWhy(cc))return '';const reg=ccInfo(cc).reg,rs=rvIn(cc);
  let h=`<section><h3>${tr('streaming_rivals.city_h',{country:esc(ccName(cc))})}</h3><p class="lead">${tr('streaming_rivals.city_lead')}</p>`;
  if(!rs.length)return h+`<p class="empty">${tr('streaming_rivals.city_none')}</p></section>`;
  const E=rvEdge(cc),p=E.pw;
  for(const r of rs){const t=[];if(rvDown(r,reg))t.push(tr('streaming_rivals.tag_down'));if(p&&p.r===r.id)t.push(tr('streaming_rivals.tag_pw'));
    h+=`<div class="row">${rvLogo(r)}<div class="grow"><div class="nm">${esc(rvName(r))}</div><div class="meta">${tr('streaming_rivals.picture_p',{p:pct(rvQ(r,reg))})}${t.map(x=>` · <b style="color:var(--bad)">${x}</b>`).join('')}</div></div></div>`;}
  h+=`<div class="kv"><span>${tr('streaming_rivals.your_edge')}</span><b>${tr('streaming_rivals.edge_line',{a:rvSign(E.pot),b:rvSign(E.grow)})}</b></div>`;
  if(E.sw){const v={rival:esc(rvName(RIV_ID[E.sw.r])),date:dateStr(E.sw.until)};h+=E.sw.k>0?`<p class="note">${tr('streaming_rivals.city_window',v)}</p>`:`<p class="why">${tr('streaming_rivals.city_smug',v)}</p>`;}
  return h+`</section>`;}
CNT_CITY.push(rvSection);
CNT_NEW.push(o=>{o.rv={in:{},next:S.day+RV_START,bid:{},evs:[],sw:{},pw:null,out:null};});
// Saves: an old one without rivals gets a quiet start of RV_START days; everything else is checked.
function rvSanitize(c0,o,s){const v=c0.rv&&typeof c0.rv==='object'?c0.rv:{},n=(x,d)=>Number.isFinite(+x)?Math.round(+x):d,reg=r=>r==='ALL'||own(REG,r),rid=x=>typeof x==='string'&&own(RIV_ID,x);
  const V={in:{},next:n(v.next,(s.day||0)+RV_START),bid:{},evs:[],sw:{},pw:null,out:null},ob=x=>x&&typeof x==='object';
  if(ob(v.in))for(const r of RIV){const L=v.in[r.id];if(Array.isArray(L))V.in[r.id]=[...new Set(L.filter(k=>typeof k==='string'&&ccInfo(k)))].slice(0,250);}
  if(ob(v.bid))for(const id of Object.keys(v.bid).slice(0,10)){const b=v.bid[id];if(ob(b)&&reg(b.reg))V.bid[id.slice(0,40)]={r:rid(b.r)?b.r:'',n:clamp(n(b.n,0),0,EV_NAMES.length-1),reg:b.reg,day:n(b.day,0)};}
  if(Array.isArray(v.evs))for(const e of v.evs.slice(0,8))if(ob(e)&&rid(e.r)&&reg(e.reg))V.evs.push({id:String(e.id==null?uid():e.id).slice(0,40),r:e.r,n:clamp(n(e.n,0),0,EV_NAMES.length-1),reg:e.reg,day:n(e.day,0),b:clamp(n(e.b,0),-1,1)});
  if(ob(v.sw))for(const k of Object.keys(v.sw).slice(0,250)){const x=v.sw[k];if(o.cc[k]&&ob(x)&&rid(x.r))V.sw[k]={r:x.r,until:n(x.until,0),k:+x.k<0?-1:1,ad:x.ad?1:0};}
  const p=v.pw;if(ob(p)&&rid(p.r)&&own(REG,p.reg))V.pw={r:p.r,reg:p.reg,until:n(p.until,0),m:p.m?1:0};
  const u=v.out;if(ob(u)&&rid(u.r)&&own(REG,u.reg))V.out={r:u.r,reg:u.reg,until:n(u.until,0),c:clamp(n(u.c,0),0,RV_OUT.length-1)};
  o.rv=V;}
CNT_SAN.push(rvSanitize);
