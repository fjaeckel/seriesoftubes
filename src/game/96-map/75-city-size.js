/* City size: a city's icon says how many eyeballs live there, in five steps from an outpost to a megacity.
   P is the city's eyeball demand (about 40G per million people), so it stands in for population.
   Zoomed out the dots grow with it; zoomed in the skyline does. Crowded cities give way to bigger ones. */
const CTIER_AT=[15,100,350,800],ctier=P=>{let t=0;while(t<4&&P>=CTIER_AT[t])t++;return t;};
const CTIER=new Map(CITIES.map(C=>[C.id,ctier(C.P)])),cTier=id=>{const t=CTIER.get(id);return t===undefined?ctier((CITY[id]||{}).P||0):t;};
// Near view: each tier's skyline, one [x, height, colour] per 10 px wide building, and a gentle extra scale on top.
const SKY=[
  [[-5,7,'#FFFFFF']],
  [[-10,9,'#FFFFFF'],[0,12,'#FFE7A1']],
  [[-15,11,'#FFFFFF'],[-5,16,'#FFE7A1'],[5,9,'#BDE8FF']],
  [[-20,13,'#BDE8FF'],[-10,20,'#FFFFFF'],[0,16,'#FFE7A1'],[10,10,'#FFFFFF']],
  [[-25,15,'#BDE8FF'],[-15,22,'#FFFFFF'],[-5,31,'#FFE7A1'],[5,20,'#BDE8FF'],[15,13,'#FFFFFF']],
];
const SKY_H=SKY.map(b=>Math.max(...b.map(x=>x[1]))),SKY_W=SKY.map(b=>b.length*10),CSC=[0.8,0.88,0.95,1.03,1.1];
// Far view: the dot's radius per tier. Megacities also glow a little.
const FAR_R=[1.7,2.3,3.1,4.3,6];
// How tall a city's icon stands above its spot, in icon units (×iconScale on screen).
const cityTop=(id,p)=>p?24:SKY_H[cTier(id)]*CSC[cTier(id)]+6;
// Phones show cities a little smaller: the screen is narrow and every city would touch the next (taps stay as big).
const cityScale=sc=>sc*(innerWidth<=760?0.82:1);
// An exchange you have not joined is a quiet tag, and on outposts and towns only once you zoom in close.
const ixQuiet=id=>!S.myIx[id]&&!hasIxAt(id),ixShown=(id,p)=>!!ixName(id)&&(p||!ixQuiet(id)||cTier(id)>=2||cam.z>=1.5);
/* Room on the map (near view only). Cities claim space in order: the selected or hovered city, your POPs, cities with
   an offer, an outage or a part in the puzzle, then the biggest. A city whose skyline would sit on one already placed
   becomes a small dot (v.dem): still there and still tappable, just quiet. */
function cityRoom(vis,sc){
  const sel=UI.sel&&UI.sel.type==='city'?UI.sel.id:null,pz=pzOn();
  const pr=v=>{const id=v.C.id;return id===sel||UI.hover===id?0:S.pops[id]?1:CM.off.has(id)||CM.inc.has(id)||(pz&&pzKind(id)&&pzKind(id)!=='off')?2:3;};
  for(const v of vis)v.pr=pr(v);
  const ord=vis.slice().sort((a,b)=>a.pr-b.pr||b.C.P-a.C.P),cell=64,grid=new Map(),at=(i,j)=>i*8192+j;
  for(const v of ord){const t=cTier(v.C.id),p=S.pops[v.C.id],r=(p?22:(SKY_W[t]/2+3+(ixShown(v.C.id,p)?7:0))*CSC[t])*sc;v.r=r;v.dem=false;
    const i0=Math.floor(v.sx/cell),j0=Math.floor(v.sy/cell);let clash=false;
    if(v.pr>2)for(let i=i0-2;i<=i0+2&&!clash;i++)for(let j=j0-2;j<=j0+2&&!clash;j++){const L=grid.get(at(i,j));if(L)for(const q of L)if(Math.hypot(q.sx-v.sx,q.sy-v.sy)<q.r+r){clash=true;break;}}
    if(clash){v.dem=true;continue;}
    const k=at(i0,j0);let L=grid.get(k);if(!L)grid.set(k,L=[]);L.push(v);}
}
