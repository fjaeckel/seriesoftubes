/* ================= SIMULATION ================= */
// Binary-heap Dijkstra over city indices: adj[i] lists [neighbour, edge]. wf(edge) gives the weight, skip(v,edge) can
// rule edges out, and the search stops early once `stop` is settled. D is the distance to each city (Infinity: no
// path) and P the edge it was reached by. The heap lives in two typed arrays, and equal distances always settle in the
// same order, so routes do not flip between runs.
function dijkstra(adj,src,wf,skip,stop){const n=adj.length,D=new Float64Array(n).fill(Infinity),P=new Array(n),done=new Uint8Array(n);
  let cap=64,hd=new Float64Array(cap),hu=new Int32Array(cap),m=0;
  const put=(d,u)=>{if(m===cap){cap*=2;const a=new Float64Array(cap),b=new Int32Array(cap);a.set(hd);b.set(hu);hd=a;hu=b;}
    let i=m++;hd[i]=d;hu[i]=u;while(i>0){const p=(i-1)>>1;if(hd[p]<=hd[i])break;const td=hd[p],tu=hu[p];hd[p]=hd[i];hu[p]=hu[i];hd[i]=td;hu[i]=tu;i=p;}};
  D[src]=0;put(0,src);
  while(m){const d=hd[0],u=hu[0];m--;
    if(m){hd[0]=hd[m];hu[0]=hu[m];let i=0;for(;;){const l=2*i+1,r=l+1;let k=i;if(l<m&&hd[l]<hd[k])k=l;if(r<m&&hd[r]<hd[k])k=r;if(k===i)break;const td=hd[k],tu=hu[k];hd[k]=hd[i];hu[k]=hu[i];hd[i]=td;hu[i]=tu;i=k;}}
    if(done[u]||d>D[u])continue;done[u]=1;if(u===stop)break;
    for(const [v,e] of adj[u]||[]){if(skip&&skip(v,e))continue;const nd=d+wf(e);if(nd<D[v]){D[v]=nd;P[v]=e;put(nd,v);}}}
  return {D,P};}
// The edges of a dijkstra() path back from city index B to A, and the cities on it (B first), as indices.
function walkI(P,A,B){const path=[],ni=[B];let v=B;while(v!==A){const l=P[v];path.push(l);v=l.ai===v?l.bi:l.ai;ni.push(v);}return {path,ni};}
// The same for compute()'s sender, with the marks it keeps on a path (full, its latency, its far-exit traffic) there from the start: one object shape.
function walkP(P,A,B){const path=[],ni=[B];let v=B;while(v!==A){const l=P[v];path.push(l);v=l.ai===v?l.bi:l.ai;ni.push(v);}return {path,ni,dead:0,ms:-1,fg:0};}
