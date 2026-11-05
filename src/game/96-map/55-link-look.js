/* How each tube on the map looks today, worked out once for both maps (the 2D canvas in drawFrame() and the card in
   58-webgl-links.js), so they cannot drift apart. */
// Dash patterns, by number: none, cut, virtual circuit, being built, standby; 5 the fiber's dots, 6 an old cable,
// 7 a link being dragged out.
const LDASH=[[],[8,8],[2,7],[10,8],[4,6],[1,6],[6,5],[2,12]];
// A tube is a group of links drawn as one line: its capacity, load and state, its base width, colour and dash.
function linkLook(grp,day){const l=grp[0],many=grp.length>1,up=many?grp.filter(x=>!linkDown(x)):null;
  const cap=many?up.reduce((a,x)=>a+capOf(x),0):capOf(l),load=many?grp.reduce((a,x)=>a+(R.load[x.id]||0),0):(R.load[l.id]||0),u=cap?load/cap:0,df=l.kind==='df',bld=df&&l.ready>day,cut=!bld&&(many?!up.length:linkDown(l))&&!(df&&!(l.ch||[]).length),dark=df&&!bld&&!(l.ch||[]).length,vx=l.kind==='vxc',idle=!cut&&!bld&&load<1e-3&&(many?up.length>0&&up.every(x=>x.standby):!!l.standby);
  return {l,many,up,cap,load,u,df,bld,cut,dark,vx,idle,w0:vx?2.2:(2.5+Math.max(...grp.map(tierW))*1.8+(many?Math.min(1.5,(grp.length-1)*0.5):0)),
    col:bld?'#C9B27C':dark?'#5D6788':cut?'#FF4D5E':idle?'#9AA3BE':vx?FAB[l.prov].col:l.sub?(u>0.001?utilCol(u):'#7FD8EE'):utilCol(u),dash:cut?1:vx?2:bld?3:idle?4:0,
    pk:!cut&&load>0.01?clamp(Math.round(2+u*10),2,12):0};} // packets on the line: more as it fills
// The map's tubes as the picture needs them: the groups, their geometry and how each one looks. It changes with the
// links and with the day's routing (R), not with the camera, so it is kept until one of those changes.
let MLK=null;
function mapLinks(day){const key=[S.links,S.links.length,R,day];
  if(MLK&&key.every((v,i)=>v===MLK.key[i]))return MLK;
  const PI=pairIdx(),LG=linkGroups(),GM=LG.map(g=>linkGeom(g[0],PI.get(edgeKey(g[0]))));
  return MLK={key,PI,LG,GM,looks:LG.map(g=>linkLook(g,day))};}
