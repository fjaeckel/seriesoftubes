// Plain BGP choice: scan every live transit and compare the full policy, path and distance score.
module.exports = `const bestTransit=(ci,j,v6,D)=>{const n=NET_IDS[j],candidates=TX.filter(e=>e.cap>0&&D[e.ci]<Infinity&&e.ok(n)&&(!v6||!v6Blocked(e,n)));
  const score=e=>{let rank=TR?eff(e,n):base(e,n);const tier=directTier(e.net,n),specific=e.carry||e.ci===ci;
    if(rank===3&&!PREFC[ci]&&tier&&specific)rank=DIRECT_RANK[tier][e.carry?0:1];
    return [rank,e.hp,transitHops(e.net,n,specific),D[e.ci],NET[e.net].asn];};
  candidates.sort((a,b)=>{const x=score(a),y=score(b);for(let i=0;i<x.length;i++)if(x[i]!==y[i])return x[i]-y[i];return 0;});
  return candidates[0]?.net||'';};\n`;
