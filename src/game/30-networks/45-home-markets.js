/* Where each network's users live (#48). A network that sells to homes lists its home markets (cc, see W2), and that is
   where its eyeballs are. People mostly talk to people near them, so a POP's traffic to the networks that sell to homes
   goes mostly to the ones at home: a New York POP sends a lot to Comecast and little to Doitsche Telekomm, Frankfurt
   the other way round. Together those networks keep the share the city's table gives them; only how it splits between
   them follows geography. Content and carriers without home markets are everywhere and keep their shares.
   Routing is unchanged: traffic leaves at the nearest exit (hot potato), so an eyeball peered with in the cities its
   users are in takes that traffic off your backbone where it starts, and one peered with in two cities has it hauled
   there from everywhere else. */
const LOC_HOME=1,LOC_REG=0.3,LOC_FAR=0.08;
const LOC_NIX=new Map(NETS.map((n,j)=>[n.id,j]));
// Per network index: its home countries and the regions they are in, or null (no home market: everywhere).
let LOC_NET=null;
function locNets(){if(LOC_NET)return LOC_NET;const ccReg=new Map();
  for(const c of CITIES){let s=ccReg.get(c.cc);if(!s)ccReg.set(c.cc,s=new Set());s.add(c.reg);}
  LOC_NET=NETS.map(n=>{if(!n.cc)return null;const cc=new Set(Array.isArray(n.cc)?n.cc:[n.cc]),reg=new Set();for(const k of cc)for(const r of ccReg.get(k)||[])reg.add(r);return {cc,reg};});
  return LOC_NET;}
// How near a city is to a network's users: at home, on the same continent, or far away.
const locW=(h,C)=>h.cc.has(C.cc)?LOC_HOME:h.reg.has(C.reg)?LOC_REG:LOC_FAR;
/* A city's shares in table T (by network index), localised. The tables and the map never change after load, so each
   city's array is made once per table and kept. */
const LOC_SH=new Map();
function locSh(T,c){let m=LOC_SH.get(T);if(!m)LOC_SH.set(T,m=new Map());let a=m.get(c);if(a)return a;
  const L=locNets(),C=CITY[c],NN=NETS.length;a=new Float64Array(NN);let g=0,gw=0;
  for(let j=0;j<NN;j++){const s=T[NETS[j].id]||0;if(!s)continue;const h=L[j];if(!h){a[j]=s;continue;}const v=s*locW(h,C);g+=s;gw+=v;a[j]=v;}
  if(gw>0){const f=g/gw;for(let j=0;j<NN;j++)if(L[j]&&a[j])a[j]*=f;}
  m.set(c,a);return a;}
/* Puzzles, Architect runs and scenarios (the weekly one too) are built and scored on the plain world shares: their
   reference builds and committed pars were made with them. There a city's split stays the table's. */
const LOC_PLAIN=new Map(),locOn=()=>!(S&&(S.mode==='puzzle'||S.pz||S.ar||S.scn));
function cityShares(T,c){if(locOn())return locSh(T,c);let a=LOC_PLAIN.get(T);if(!a)LOC_PLAIN.set(T,a=Float64Array.from(NETS,n=>T[n.id]||0));return a;}
