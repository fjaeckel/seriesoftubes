/* ---------- The sales desk signs deals for you ----------
   Deals belong to Sales, not to the NOC intern. With someone at the desk, the player can let them sign offers once a
   game day (S.slAuto.on) and decline the ones that pay less than a minimum (S.slAuto.min). How they sign is who they are:
   - the engineer signs only what the network can serve: #185's trial (autoOffer, a full routing pass), at most
     SL_TRIALS a day, and an offer that did not fit waits SL_RETRY days;
   - the shark signs every offer whose POPs are up the moment it lands, promises and all: no trial, an unkept promise is
     the customer's problem. The commission is paid as on any shark deal, so only while the cash covers it;
   - the CEO signs like the engineer, and a decline is a handshake away (salesOverride: about one in three he signs anyway).
   Orbit offers need no routing pass: the dish they land on (pieServe) must have room, except for the shark.
   Nobody at the desk, nothing automatic: every deal is signed by hand. No random numbers are drawn here. */
const SL_MINS=[0,2000,5000,10000,25000,50000],SL_TRIALS=1,SL_RETRY=7;
const slAutoNew=()=>({on:false,min:0,wk:null,rep:null});
// Is the desk signing or declining anything today?
const slAutoOn=()=>!!(S&&S.slAuto&&slP()&&(S.slAuto.on||S.slAuto.min));
// A week's tally: {w: week, p: who was at the desk, n: signed, rev: what they pay a month, x: declined, y: of those, signed anyway}.
function slWkOk(x){if(!x||typeof x!=='object'||Array.isArray(x)||!own(SALES,x.p))return null;const n=v=>int(v,0,1e6,0);return {w:n(x.w),p:x.p,n:n(x.n),rev:int(x.rev,0,1e10,0),x:n(x.x),y:n(x.y)};}
const slWkAny=x=>!!x&&(x.n>0||x.x>0);
function slAutoFix(s){const a=s.slAuto&&typeof s.slAuto==='object'&&!Array.isArray(s.slAuto)?s.slAuto:{};
  s.slAuto={on:a.on===true,min:SL_MINS.includes(a.min)?a.min:0,wk:slWkOk(a.wk),rep:slWkOk(a.rep)};if(a.ren===true)s.slAuto.ren=true;}
// An old save whose intern ran the sales order: the same switch and minimum, now at the sales desk (they run once someone is there).
function slAutoFrom(s,on,p){if(!on||(s.slAuto&&typeof s.slAuto==='object'))return;s.slAuto={on:p.acc!==false,min:SL_MINS.includes(p.min)?p.min:0,wk:null,rep:null};}
// "This week Dave signed 3 customers (+$41k/mo), declined 17 tiny offers."
function slWeekLine(x,last){const parts=[];if(x.n)parts.push(trn('sales.w_signed',x.n,{rev:opsMo$(x.rev)}));if(x.x)parts.push(trn('sales.w_declined',x.x));if(x.y)parts.push(trn('sales.w_anyway',x.y));
  const v={name:tr(SALES[x.p].s),list:parts.join(', ')};return last?tr('sales.w_last',v):tr('sales.w_now',v);}
// An orbit offer fits where its dish has room for it; used: what this shift already signed on each dish.
function slSkyOk(o,used){const L=pieServe(o.city,o.type);if(!L)return null;const k=L.cr+'|'+L.k;return slP()==='shark'||L.left-(used.get(k)||0)>=o.bw?k:null;}
// Like a day, the desk is a generator: a routing trial is a step the day answers (in play, the route worker does).
const slAutoDay=d=>dayGo(slAutoRun(d),(g,v)=>g.next(v));
function* slAutoRun(d){if(!slAutoOn())return;const A=S.slAuto,p=slP(),w=Math.floor(d/7);
  // A new week: last week's tally becomes the report, and the one notice of the week.
  if(!A.wk||A.wk.w!==w){if(slWkAny(A.wk)&&A.wk.w<w){A.rep=A.wk;logNote(`<b>${esc(tr('sales.desk'))}</b> ${esc(slWeekLine(A.rep,true))}`,A.rep.rev>0?'good':'',[],{a:'tab',v:'deals'});}A.wk={w,p,n:0,rev:0,x:0,y:0};}
  const W=A.wk,used=new Map();W.p=p;let tries=0,dirty=false;
  const tried=UI.slTried&&UI.slTried.s===S?UI.slTried.m:(UI.slTried={s:S,m:new Map()}).m;
  const won=o=>{if(S.offers.includes(o))return false;W.n++;W.rev+=Math.round(bizMo(o));dirty=true;return true;};
  for(const o of S.offers.slice()){
    // What this offer needs, muted: nothing, or a routing trial (b), which the day answers between the two quiet steps.
    let b;const todo=opsQuiet(()=>{if(!S.offers.includes(o))return;const T=BIZ_T[o.type];if(!T||!(o.exp>d))return;const v=T.event?(o.fee||0):bizMo(o);
      if(A.min&&v<A.min){const b0=S.biz.length;ACT.decline({id:o.id});W.x++;if(S.biz.length>b0){W.y++;W.rev+=Math.round(bizMo(o));dirty=true;}return;}
      if(!A.on)return;
      if(T.orbit){const k=slSkyOk(o,used);if(!k||(p==='shark'&&S.cash<bizMo(o)))return;ACT.accept({id:o.id});if(won(o))used.set(k,(used.get(k)||0)+o.bw);return;}
      if(!bCities(o).every(popUp))return;
      if(p==='shark'){if(S.cash<bizMo(o)||(T.event&&!(o.start>d)))return;ACT.accept({id:o.id});won(o);return;}
      // Each trial is a full routing pass: at most SL_TRIALS a day, and an offer that did not fit waits a week.
      if(!reqOk(o)||tries>=SL_TRIALS||tried.get(o.id)>d-SL_RETRY)return;tries++;b=offerTrialOf(o);return true;});
    if(!todo)continue;
    // o: the offer itself, for a trial the page has to run again on the game as it is by then (dayAgain()).
    const got=b?yield {trial:b,hx:offerHealthy(b),o}:null;
    // Signed or declined by hand while the trial routed: it is not the desk's.
    if(!S.offers.includes(o))continue;
    opsQuiet(()=>{OFFER_TRIED={o,b:got};try{ACT.accept({id:o.id,auto:true});}finally{OFFER_TRIED=null;}if(!won(o))tried.set(o.id,d);});}
  if(dirty)yield;}
