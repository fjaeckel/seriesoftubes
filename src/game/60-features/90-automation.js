/* The sales engine of #185: would this offer work if signed now? The intern's sales order runs it once a day.
   It trials the new demand on a copy of the game, so a failed trial leaves the live game untouched. */
function offerCustomer(o){return {id:o.id,city:o.city,city2:o.city2||null,reqs:o.reqs||[],latMax:o.latMax||null,route:BIZ_T[o.type].scenic?'scenic':BIZ_T[o.type].lat?'fast':'normal',name:o.name,type:o.type,bw:o.bw,rate:o.rate,mood:100,since:S.day,sites:o.sites||null,start:o.start,dur:o.dur,fee:o.fee,link:o.link,slots:o.slots||0,what:o.what,prov:o.prov,due:BIZ_T[o.type].cap?S.day+o.win:undefined};}
function autoOffer(o){if(!o||!own(BIZ_T,o.type)||!(o.exp>S.day)||!(o.bw>0)||o.rate<0||!bCities(o).length||!bCities(o).every(popUp)||!reqOk(o))return null;
  const T=BIZ_T[o.type],b=offerCustomer(o);if(T.event&&(!(o.start>S.day)||!(o.dur>0)))return null;
  if(o.type==='capfib'&&S.biz.some(x=>x.type==='capfib'&&capPend(x)&&!x.link&&((x.city===o.city&&x.city2===o.city2)||(x.city===o.city2&&x.city2===o.city))))return null;
  if(T.fiber){const l=o.type==='capfib'?capFibLink(b):S.links.find(x=>x.id===o.link);if(!l)return null;b.link=l.id;
    if(!fiberOk(b)||(o.type==='wwave'&&(!(o.slots>0)||freeCh(l)<o.slots))||(o.type==='dfpair'&&!pairFree(l))||
      (o.type==='pairs'&&(!l.own||S.biz.some(x=>x.link===l.id&&['pairs','capfib','dfpair'].includes(x.type)))))return null;}
  const state=S,result=R,hot=UI.hotMap,future=S.biz.some(x=>BIZ_T[x.type].event&&x.start>S.day);
  // Trial the added demand before signing; failed trials leave the live game untouched.
  try{S={...S,biz:S.biz};
    // shortcut: future events reserve capacity together; use per-date trials if separate bookings must share capacity.
    if(future){S.biz=S.biz.map(x=>BIZ_T[x.type].event&&x.start>S.day?{...x,start:S.day}:x);
      /* Signed if the offer works and nobody who works without it breaks. compute() reads the last result only for
         scenic circuits, so without them the pass with the offer can go first: when the offer fails, or nobody is
         unhappy with it, the pass without it cannot change the answer and is skipped. */
      const fut=S.biz,all=fut.concat(b);
      if(!all.some(x=>x.route==='scenic')){if(T.event)b.start=S.day;if(T.cap)b.live=true;S.biz=all;compute();if(bizWhy(b).length)return null;
        const bad=fut.filter(x=>bizWhy(x).length);if(!bad.length)return b;S.biz=fut;compute();return bad.every(x=>bizWhy(x).length)?b:null;}
      compute();}
    const healthy=S.biz.filter(x=>!bizWhy(x).length);if(T.event)b.start=S.day;if(T.cap)b.live=true;S.biz=S.biz.concat(b);compute();
    return !bizWhy(b).length&&healthy.every(x=>!bizWhy(x).length)?b:null;
  }finally{S=state;R=result;UI.hotMap=hot;b.start=o.start;if(T.cap)delete b.live;}}
