// Known customer paths come first. Other routes follow upstreams to the transit-free mesh.
const AS_HOPS={},AS_MESH={},V6_SIDE={cog:1,drz:2};
{const dn={};for(const n of NETS)for(const u of n.up||[])(dn[u]||(dn[u]=[])).push(n.id);
 for(const n of NETS)if(n.price){const h=AS_HOPS[n.id]={[n.id]:0},q=[n.id];for(let i=0;i<q.length;i++)for(const id of dn[q[i]]||[])if(h[id]===undefined){h[id]=h[q[i]]+1;q.push(id);}}
 let changed=true;while(changed){changed=false;for(const n of NETS)if(!V6_SIDE[n.id]&&n.up?.length){const side=V6_SIDE[n.up[0]];if(side&&n.up.every(id=>V6_SIDE[id]===side)){V6_SIDE[n.id]=side;changed=true;}}}}
{const roots=NETS.filter(n=>n.type==='t1'&&!n.t1v6),mesh=AS_MESH;for(const id of NET_IDS)mesh[id]=1+Math.min(...roots.map(n=>AS_HOPS[n.id]?.[id]??2));
 const hops=(net,id,seen)=>{const h=AS_HOPS[net];if(h[id]!==undefined)return h[id];if(seen.has(net))return mesh[id];const n=NET[net];seen.add(net);
   const up=(n.up||[]).filter(u=>AS_HOPS[u]);return h[id]=up.length?1+Math.min(...up.map(u=>hops(u,id,new Set(seen)))):mesh[id];};
 for(const n of NETS)if(n.price)for(const id of NET_IDS)hops(n.id,id,new Set());}
const transitHops=(net,id,specific=true)=>specific?AS_HOPS[net][id]:AS_MESH[id];
// Multi-homed customers keep IPv6 reach through their other upstreams.
const v6Blocked=(e,id)=>e.k==='t'&&V6_SIDE[e.net]&&V6_SIDE[id]&&V6_SIDE[e.net]!==V6_SIDE[id];
