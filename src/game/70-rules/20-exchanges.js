/* Australian exchanges follow PeeringDB (every Australian exchange's member list, Oct 2026): networks that sit on
   every IX elsewhere list the Australian cities they really peer in as auIx, and the big incumbents peer only privately. */
/* Transit in Australia is sold only by carriers with an Australian site and at least ten Australian networks buying
   from them (RIPEstat, Oct 2026): Telstraya, Hocus Pocus, Speedyloop, SingTell, Drizzle Electric, Cogentle,
   Not That Telecom and Level Tree (whose real-world network lists no sites in PeeringDB at all, but sells in Sydney). Others can sit in
   an Australian city, like the Pacific carriers backhauling to Sydney (or Glowball Sakura Lager), but reach Australian
   customers only from overseas. */
const AU_SELLERS=['tsy','voc','spl','sgt','drz','cog','ntt','lvl'],sellsAt=(n,c)=>!!n.price&&(n.pops.includes(c)||!!n.premOnly&&n.premOnly.includes(c))&&(!CITY[c].au||AU_SELLERS.includes(n.id))&&!noTransitIn(c);
// A scenario city where nobody sells transit (Anchors Away: Tallinn's internet is across the water).
const noTransitIn=c=>{const x=S&&S.scn&&S.scn.rules&&S.scn.rules.noTransitIn;return Array.isArray(x)&&x.includes(c);};
/* China Telecomet's premium crossing into China (CN-Too) is sold where its border routes start: Hong Kong, and Moscow
   (#195), where it rides the land route east and nothing else of theirs is on offer (premOnly). It costs the same
   wherever you buy it: the Hong Kong price. */
const premCity=(n,c)=>!!n.premium&&!!n.premAt&&n.premAt.includes(c),premOnlyAt=(n,c)=>!!n.premOnly&&n.premOnly.includes(c);
const premOn=t=>!!t.premium&&!!NET[t.net]&&premCity(NET[t.net],t.city);
// What a port costs per Gbps and month before the commit: the premium crossing at Hong Kong prices, anything else at the city's.
const transitPerG=(n,c,prem)=>prem&&premCity(n,c)?n.price*n.premium*netMult(n,'hkg'):n.price*netMult(n,c);
const onIx=(n,c)=>CITY[c].au&&n.auIx?n.auIx.includes(c):n.ix==='ALL'||Array.isArray(n.ix)&&n.ix.includes(c);
function ixMembers(c){if(XIXM[c])return XIXM[c].members.slice();if(S.myIx[c])return S.myIx[c].members.slice();if(!CITY[c].ix)return [];return NETS.filter(n=>onIx(n,c)).map(n=>n.id);}
// LAG: several identical ports bundled into one logical link. Flow hashing is never perfectly even, so a bundle carries ~95% of the sum.
const LAG_MAX=8;
function lagCap(g,n){n=n||1;return g*n*(n>1?0.95:1);}
function lagName(tier,n){return (n||1)>1?`${n}×${PORT[tier].n} LAG`:tr('common.port_port',{port:PORT[tier].n});}
function ixCap(c){return ixLagF(c)*(S.myIx[c]?myFab(c).g*(myIxLive(c)?1:0):liveCap(PORT[S.ixp[c]].g,ixCity(c),(S.ixSite||{})[c],(S.ixn||{})[c])*(isRemote(c)?REMOTE_CAP:1));}
function ixSessions(c){
  const s=new Set(); if(S.ixp[c]===undefined)return s;
  for(const id of ixMembers(c)){const n=NET[id];
    if(S.peers[id+'@'+c]&&!snub(id,c)&&!(isRemote(c)&&noRemote(id)))s.add(id);
    else if(S.rs[c]&&n.pol==='open'&&ppol()==='open')s.add(id);
    else if(S.myIx[c]&&(n.pol==='open'||n.pol==='selective'))s.add(id);}
  return s;
}
function t1Club(){
  const miss=[];const pops=Object.keys(S.pops).length;
  if(regionsCount()<3)miss.push(tr('exchanges.pops_on_3_continents'));
  if(pops<10)miss.push(tr('exchanges.10_pops_n',{n:pops}));
  if(R.served<1500)miss.push(tr('exchanges.serve_1_5_tbps_v',{v:fmtG(R.served)}));
  if(R.sessions<20)miss.push(tr('exchanges.20_peering_sessions_n',{n:R.sessions}));
  return {ok:!miss.length,missing:miss};
}
