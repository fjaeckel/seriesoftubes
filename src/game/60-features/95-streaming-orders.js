/* ---------- The NOC intern at a Streaming service (37-streaming.js, 95-standing-orders.js) ----------
   Three orders only a Streaming service sees, run like every other order (through the player's own clicks, muted, within
   a monthly budget): Binge Boxes where the ISPs take them and they pay their way, and another where they run full;
   pre-filling the boxes before a series premiere; origins that run full, which the intern only reports unless told to
   build, under a budget whose list has no "no limit" (an origin is a multi-million build). The carrier order with nothing
   to do here (free caches for your eyeballs: a streaming service has none) is hidden. During a change freeze
   (cntFrozen()) the intern touches nothing at all and says so, once, in the week's report (opsStill()). */
const OPS_DC_CAPS=[1e6,3e6,10e6];
OPS.push(
 {k:'boxes',i:'📼',pop:1,cap:250000,show:()=>content(),t:N_('ops_streaming.o_boxes'),d:N_('ops_streaming.o_boxes_d'),p:{
   pay:{d:12,v:[3,6,12,24,0],l:N_('ops_streaming.p_pay'),f:v=>v?trn('ops_streaming.n_months',v):tr('ops_streaming.pay_any')},
   at:{d:80,v:[60,70,80,90],l:N_('ops_streaming.p_full'),f:v=>v+'%'},
   free:{d:false,v:[false,true],l:N_('ops_streaming.p_free'),f:v=>v?tr('common.on'):tr('common.off')}}},
 {k:'prefill',i:'🍿',cap:50000,show:()=>content(),t:N_('ops_streaming.o_prefill'),d:N_('ops_streaming.o_prefill_d'),p:{
   days:{d:3,v:[1,3,7,14],l:N_('ops_streaming.p_days'),f:v=>trn('ops_streaming.n_days_ahead',v)}}},
 {k:'origin',i:'🏭',cap:1e6,caps:OPS_DC_CAPS,show:()=>content(),t:N_('ops_streaming.o_origin'),d:N_('ops_streaming.o_origin_d'),p:{
   at:{d:90,v:[80,90,95],l:N_('ops.p_at'),f:v=>v+'%'},
   grow:{d:false,v:[false,true],l:N_('ops_streaming.p_grow'),f:v=>v?tr('ops_streaming.grow_build'):tr('ops_streaming.grow_warn')}}});
for(const o of OPS.slice(-3))OPSK[o.k]=o;
OPS_POP.push('boxes');
Object.assign(OPS_SAY,{boxes:N_('ops_streaming.l_boxes'),boxmore:N_('ops_streaming.l_boxmore'),prefill:N_('ops_streaming.l_prefill'),origin:N_('ops_streaming.l_origin'),
 dcfull:N_('ops_streaming.l_dcfull'),freeze:N_('ops_streaming.l_freeze')});
OPS_ORDER.splice(OPS_ORDER.indexOf('caches')+1,0,'origin','boxes','prefill');
// Free caches serve your own eyeballs; a streaming service has no eyeballs to serve.
OPSK.caches.show=()=>!content();
/* Boxes are pooled by country and network, as compute() pools them: the first one decides how much of that network's
   viewers are served from inside it, more only add room. So: a first box where the ISP takes one and it pays for itself
   within the chosen months (the transit it saves, plus the viewers who would otherwise buffer or go unserved), then
   another next to them once they run full. Best first, while the budget lasts. */
OPS_RUN.boxes=function*(X){const C=S.cnt;if(!content()||!C||!R.cnt)return;const pay=opsP('boxes','pay'),at=opsP('boxes','at')/100,free=opsP('boxes','free'),ahead=opsAhead();
  const by=new Map(),pops=new Map(),pg=new Map(),jobs=[],short=R.cnt.short||0;
  for(const b of C.box){const k=CITY[b.city].cc+'|'+b.net;(by.get(k)||by.set(k,[]).get(k)).push(b);}
  for(const c of opsPops('boxes')){const cc=CITY[c].cc;if(C.cc[cc])(pops.get(cc)||pops.set(cc,[]).get(cc)).push(c);}
  const perG=c=>{let v=pg.get(c);if(v===undefined){const n=cheapestTransit(c);pg.set(c,v=n?transitPerG(n,c,premOnlyAt(n,c))*S.priceMul:0);}return v;};
  for(const [cc,cs] of pops){const I=ccInfo(cc);if(!I)continue;const D=C.cc[cc].d,o=R.cnt.cc[cc],lost=Math.max(1-ccQ(R,cc),o&&o.D>0?(o.short||0)/o.D:0);
    for(const [j,w] of I.nets){const n=NETS[j];if(free&&!boxFree(n))continue;const bs=by.get(cc+'|'+n.id);
      if(bs){const cap=bs.reduce((a,b)=>a+BOX_G*cntCut(b.net),0),use=bs.reduce((a,b)=>a+(R.useCache[b.id]||0),0);if(!(cap>0)||use*ahead<cap*at)continue;
        const c=bs.map(b=>b.city).find(c=>opsHere('boxes',c)&&!boxWhy(c,n.id));if(c)jobs.push({c,n,v:1e12+use/cap,more:1});continue;}
      const c=cs.filter(c=>(n.pops||[]).includes(c)&&!boxWhy(c,n.id)).sort((a,b)=>CITY[b].P-CITY[a].P||(a<b?-1:1))[0];if(!c)continue;
      const g=Math.min(BOX_G*cntCut(n.id),D*w*boxHit(c)*ahead),m=BOX_MO+boxHost(n),
        val=g*(perG(c)+CNT_RATE*lost)+(short>0&&!(o&&o.short>0)?Math.min(g,short)*CNT_RATE:0);
      if(pay&&!(val>m&&BOX_COST/(val-m)<=pay))continue;jobs.push({c,n,v:val-m});}}
  for(const J of jobs.sort((a,b)=>b.v-a.v||(a.c<b.c?-1:a.c>b.c?1:0)||(a.n.id<b.n.id?-1:1))){if(boxWhy(J.c,J.n.id))continue;const m=BOX_MO+boxHost(J.n);if(!X.can('boxes',BOX_COST,m))break;
    const k=C.box.length;if(!X.pay('boxes',()=>{ACT.cntBox({city:J.c,net:J.n.id,d:1});return C.box.length>k;}))continue;
    // Box rent is not in opsMoNow() (it is the charter's own bill): booked here.
    X.book('boxes',0,m);X.did(J.more?'boxmore':'boxes',J.c+' '+J.n.id);yield;}};
// The premiere's pre-fill, the same click as the charter card's, once it is close enough. Never for a live show: nothing to pre-fill.
OPS_RUN.prefill=function*(X){const C=S.cnt;if(!content()||!C)return;const p=C.prem;if(!p||p.pf||p.live||S.day>=p.day||p.day-S.day>opsP('prefill','days')||!C.box.length)return;
  if(!X.can('prefill',prefillCost()))return;if(X.pay('prefill',()=>{ACT.cntPrefill();return !!p.pf;})){X.did('prefill');yield;}};
/* An origin serving at or above the setting. Told to build, the next size up, if the level allows it and the budget covers
   it; otherwise (or when it cannot) a note, once a week per origin, which changes nothing on the network. */
OPS_RUN.origin=function*(X){const C=S.cnt;if(!content()||!C||!R.cnt)return;const at=opsP('origin','at')/100,grow=opsP('origin','grow'),W=S.ops.wk;
  for(const c of Object.keys(C.dc).sort()){const x=C.dc[c];if(!dcLive(c)||x.up)continue;const g=dcG(c);if((R.cnt.org[c]||0)*opsAhead()<g*at)continue;
    const N=DC_T[x.t+1];
    if(grow&&N&&N.lv<=lvl()&&X.can('origin',N.cost)&&X.pay('origin',()=>{ACT.cntDc({city:c});return !!x.up;})){X.book('origin',0,N.mo-DC_T[x.t].mo);X.did('origin',c);yield;continue;}
    if(!(W&&(W.wh.dcfull||[]).includes(c))){const dt=X.dirty;X.did('dcfull',c);X.dirty=dt;}}};
// A frozen day (opsRun()): no order runs, nothing is bought, no fat fingers. One line in the log, one count for the week.
function opsStill(d){if(!content()||!cntFrozen())return false;const O=S.ops;O.log.unshift({d,i:O.intern,r:[['freeze',1,[]]]});O.log.length=Math.min(O.log.length,OPS_LOG);
  if(O.wk)O.wk.n.freeze=(O.wk.n.freeze||0)+1;return true;}
// The intern's mood at a Streaming service (opsMood()): frozen always shows; a premiere or a dispute on an ordinary day.
function opsMoodX(k){if(!content()||!S.cnt)return '';const z=cntFrozen(),name=opsName();if(z)return tr('ops_streaming.mood_frozen',{name,show:z.show});
  if(k!=='quiet'&&k!==S.ops.intern)return '';const p=S.cnt.prem,D=S.cnt.disp;
  if(p&&S.day<p.day&&p.day-S.day<=7){const v={name,show:premShow(p),n:p.day-S.day};return p.live?tr('ops_streaming.mood_live',v):tr('ops_streaming.mood_premiere',v);}
  if(D&&NET[D.net])return tr('ops_streaming.mood_dispute',{name,net:NET[D.net].name});return '';}
