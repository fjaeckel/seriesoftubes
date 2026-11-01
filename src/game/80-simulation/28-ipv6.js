function ipv6Reach(E,okBy,comp,count,out){
  out.reach4=out.reach;out.v6Gap={};let worst=0;
  for(let k=0;k<count;k++){const missing=[];let lost=0;
    for(const id in V6_SIDE){const exits=okBy[id].filter(e=>e.rank>0&&comp[e.ci]===k);
      if(exits.length&&!exits.some(e=>!v6Blocked(e,id))){missing.push(id);lost+=NSH[id];}}
    if(missing.length)for(const c in S.pops)if(comp[CIDX[c]]===k)out.v6Gap[c]=missing;
    worst=Math.max(worst,lost);}
  out.reach6=Math.max(0,out.reach4-worst);out.reach=out.reach6;
}
