// Deliberately scan all exits for every flow, without byRank, local-city
// shortcuts or first-group selection. Stable sorting preserves E order on ties.
// Without Auto-TE, an exit whose shortest path from this POP is already full fits nothing, so it counts as
// unusable, like a full exit (#210).
module.exports = `
  // A carrier's own port (dr) is also a plain transit exit. A POP with a Prefer-marked transit port keeps what Prefer
  // says, and a port not set to carry only takes its own POP's traffic.
  const PH=new Set(E.filter(x=>x.k==='t'&&x.pref==='high').map(x=>CIDX[x.city]));
  const dr=(e,ci,n)=>{if(e.k!=='t'||PH.has(ci)||eff(e,n)!==3)return 0;const t=directTier(e.net,n);return t?DIRECT_RANK[t][e.carry?0:1]:0;};
  for(const pass of PASSES)for(const rank of RANKS){
    for(F=0;F<NF;F++){fci=FCI[F];fnj=FNJ[F];const n=NET_IDS[fnj];
      if(FREM[F]<=1e-6||(rank===0&&!FCA[F])||(pass===1&&!FBZ[F])||(pass===2&&FBZ[F]))continue;
      Dv=SDi[fci];Pv=SPi[fci];PP=walked[fci]||(walked[fci]=[]);vis++;
      const candidates=E.filter(e=>e.used<e.cap&&e.ok(n)&&
        ((TR?eff(e,n):base(e,n))===rank||(dr(e,fci,n)||-1)===rank)&&
        (rank!==DIRECT_RANK[1][1]&&rank!==DIRECT_RANK[2][1]||CIDX[e.city]===fci)&&Dv[CIDX[e.city]]<Infinity&&!gone(e))
        .sort((a,b)=>(a.pref==='high'?0:1)-(b.pref==='high'?0:1)||Dv[CIDX[a.city]]-Dv[CIDX[b.city]]);
      for(let i=0;i<candidates.length&&FREM[F]>1e-6;){
        let j=i+1;while(j<candidates.length&&(candidates[j].pref==='high')===(candidates[i].pref==='high')&&
          Math.abs(Dv[CIDX[candidates[j].city]]-Dv[CIDX[candidates[i].city]])<1e-6)j++;
        sendGroup(candidates.slice(i,j));i=j;
      }
    }
  }
`;
