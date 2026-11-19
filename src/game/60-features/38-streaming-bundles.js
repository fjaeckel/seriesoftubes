/* ---------- Bundles: a Streaming service's sales (37-streaming.js, 38-sales-desk.js) ----------
   A home ISP puts your service into its broadband and mobile plans: a burst of subscribers in its home countries where
   you are live, paying its wholesale price (the bundle's discount), and while the bundle runs it hosts your boxes for
   free and picks no fight with you. When it ends, some of those subscribers cancel. Who sells changes the deals:
   - nobody at the desk: an ISP calls now and then (BUND_P.none);
   - the engineer: long bundles at a fair price, whose subscribers mostly stay;
   - the shark: many short bundles at deep discounts, most of whose subscribers leave when they end;
   - the CEO: one big bundle now and then, signed on the golf course with whoever he played with (bundGolf).
   Offers wait BUND_WAIT days. Rolls are hashes of the day, so a game's random stream is untouched. */
const BUND_P={none:{every:90,k:0.15,days:365,cut:0.4,keep:0.6},eng:{every:35,k:0.2,days:730,cut:0.35,keep:0.75},
 shark:{every:20,k:0.4,days:365,cut:0.5,keep:0.3},ceo:{every:60,k:0.6,days:540,cut:0.6,keep:0.5}};
const BUND_WAIT=30,BUND_MAX=3;
const bundSt=()=>BUND_P[slP()||'none'];
const bundWith=id=>!!(S.cnt&&S.cnt.bund&&S.cnt.bund.some(b=>b.net===id));
// How many of a country's subscribers came with a bundle, and the share of their price the ISPs keep.
const bundG=cc=>{const C=S.cnt;if(!C||!C.bund)return 0;let g=0;for(const b of C.bund)g+=b.g[cc]||0;return g;};
const bundCut=cc=>{const C=S.cnt;let g=0,c=0;for(const b of C.bund||[]){const x=b.g[cc]||0;g+=x;c+=x*b.cut;}return g>0?c/g:0;};
const bundAll=b=>Object.values(b.g).reduce((a,x)=>a+x,0);
// An ISP that sells homes where you are live, has none of your bundles yet and is not already on offer.
function bundNets(){const C=S.cnt;return NETS.filter(n=>eyeNet(n)&&!bundWith(n.id)&&!C.boff.some(o=>o.net===n.id)&&[...homeOf(n)].some(k=>C.cc[k]));}
// What a bundle with it brings: in each of its home countries you are live in, a share of what its homes could watch.
function bundOffer(n,st,by,d){const C=S.cnt,g={};
  for(const k of homeOf(n)){if(!C.cc[k])continue;const I=ccInfo(k),w=(I.nets.find(([j])=>NETS[j].id===n.id)||[0,0])[1],x=ccPot(k)*w*st.k;if(x>=0.5)g[k]=Math.round(x*10)/10;}
  return Object.keys(g).length?{id:uid(),net:n.id,g,days:leadDays(st.days),cut:st.cut,keep:st.keep,by,exp:d+BUND_WAIT}:null;}
function bundDay(d){const C=S.cnt;C.boff=C.boff.filter(o=>o.exp>d);
  for(const b of C.bund.slice())if(b.until<=d)bundEnd(b);
  const st=bundSt();if(!Object.keys(C.cc).length||C.boff.length>=BUND_MAX)return;if(d<C.bnext)return;
  C.bnext=d+st.every+hstr(S.asn+'|bnext|'+d)%15;if(slP()==='ceo')return;
  const ns=bundNets();if(!ns.length)return;const n=ns[hstr(S.asn+'|bund|'+d)%ns.length],o=bundOffer(n,st,slP()||'',d);if(!o)return;C.boff.push(o);
  toast(tr('streaming.bundle_offer_toast',{net:esc(n.name),subs:fmtSubs(bundAll(o))}),'goal',[{l:tr('common.show_me'),act:'leftTab',args:{t:'goals'}}]);}
function bundSign(o){const C=S.cnt,n=NET[o.net];for(const k in o.g)if(C.cc[k])C.cc[k].d+=o.g[k];else delete o.g[k];
  C.bund.push({id:o.id,net:o.net,g:o.g,until:S.day+o.days,cut:o.cut,keep:o.keep,by:o.by});C.boff=C.boff.filter(x=>x!==o);
  // A partner does not fight its own shows: a dispute with it ends.
  if(C.disp&&C.disp.net===o.net)cntEnd();
  return n;}
function bundEnd(b){const C=S.cnt;let lost=0;for(const k in b.g){const x=C.cc[k];if(!x)continue;const l=Math.min(x.d-1,b.g[k]*(1-b.keep));if(l>0){x.d-=l;lost+=l;}}
  C.bund=C.bund.filter(x=>x!==b);toast(tr('streaming.bundle_ended',{net:esc(NET[b.net].name),subs:fmtSubs(lost)}),lost>0?'bad':'');}
// The golf course: the biggest home ISP where you are live, signed on the spot.
function bundGolf(d){const ns=bundNets();if(!ns.length)return;const n=ns.slice().sort((a,b)=>(b.share||0)-(a.share||0)||(a.id<b.id?-1:1))[0],o=bundOffer(n,BUND_P.ceo,'ceo',d);if(!o)return;
  S.cnt.boff.push(o);bundSign(o);toast(tr('streaming.ceo_golf_bundle',{net:esc(n.name),subs:fmtSubs(bundAll(o)),p:pct(o.cut)}),'goal');sfx('coin');}
function bundSanitize(c0,o,s){const g=x=>{const r={};if(x&&typeof x==='object')for(const k of Object.keys(x).slice(0,30))if(o.cc[k]&&Number.isFinite(+x[k]))r[k]=clamp(+x[k],0,1e6);return r;},by=v=>own(SALES,v)?v:'';
  const rd=(x,k,d)=>Number.isFinite(+x[k])?+x[k]:d;
  o.boff=Array.isArray(c0.boff)?c0.boff.slice(0,BUND_MAX).filter(x=>x&&NET[x.net]&&eyeNet(NET[x.net])).map(x=>({id:String(x.id==null?uid():x.id).slice(0,40),net:x.net,g:g(x.g),days:Math.round(clamp(rd(x,'days',365),1,3650)),cut:clamp(rd(x,'cut',0.4),0,0.9),keep:clamp(rd(x,'keep',0.6),0,1),by:by(x.by),exp:Math.round(rd(x,'exp',0))})):[];
  o.bund=Array.isArray(c0.bund)?c0.bund.slice(0,200).filter(x=>x&&NET[x.net]&&eyeNet(NET[x.net])).map(x=>({id:String(x.id==null?uid():x.id).slice(0,40),net:x.net,g:g(x.g),until:Math.round(rd(x,'until',(s.day||0)+365)),cut:clamp(rd(x,'cut',0.4),0,0.9),keep:clamp(rd(x,'keep',0.6),0,1),by:by(x.by)})):[];
  o.bnext=Math.round(Number.isFinite(+c0.bnext)?+c0.bnext:(s.day||0)+BUND_P.none.every);}
