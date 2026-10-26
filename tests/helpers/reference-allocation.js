// Deliberately scan all exits for every flow, without byRank, local-city
// shortcuts or first-group selection. Stable sorting preserves E order on ties.
module.exports = `
  for(const pass of PASSES||[null])for(const rank of RANKS){
    for(f of flows){
      if(f.rem<=1e-6||(rank===0&&!f.cache)||(pass&&!pass(f)))continue;
      Dv=SDi[f.ci];Pv=SPi[f.ci];PP=walked[f.ci]||(walked[f.ci]=[]);vis++;
      const candidates=E.filter(e=>e.used<e.cap&&e.ok(f.n)&&
        (TR?eff(e,f.n):base(e))===rank&&Dv[CIDX[e.city]]<Infinity)
        .sort((a,b)=>(a.pref==='high'?0:1)-(b.pref==='high'?0:1)||Dv[CIDX[a.city]]-Dv[CIDX[b.city]]);
      for(let i=0;i<candidates.length&&f.rem>1e-6;){
        let j=i+1;while(j<candidates.length&&(candidates[j].pref==='high')===(candidates[i].pref==='high')&&
          Math.abs(Dv[CIDX[candidates[j].city]]-Dv[CIDX[candidates[i].city]])<1e-6)j++;
        sendGroup(candidates.slice(i,j));i=j;
      }
    }
  }
`;
