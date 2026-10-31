// The last 29 days plus today. Once dayTick() has written today into t.hist (S.hist then ends on today too), that
// sample is today's own: leave it out, or every recompute later that day counts today twice and drops a day.
const histToday=()=>{const H=S.hist,l=H&&H[H.length-1];return !!l&&l.d===S.day;};
function p95(t,cur,today=histToday()){const a=t.hist||[],n=Math.max(0,a.length-(today&&a.length?1:0)),h=a.slice(Math.max(0,n-29),n).concat([cur]).sort((a,b)=>a-b);return h[Math.max(0,Math.ceil(.95*h.length)-1)];}
function linkDown(l){return l.cut>S.day||(S.ev.runet>S.day&&ruCity(l.a)!==ruCity(l.b))||(S.ev.gulf>S.day&&((CITY[l.a].qa&&(CITY[l.b].gcc||CITY[l.b].uae))||(CITY[l.b].qa&&(CITY[l.a].gcc||CITY[l.a].uae))))||(l.kind==='vxc'&&!!S.ev.fab&&S.ev.fab[l.prov]>S.day)||(l.kind==='df'&&dfCap(l)<=0);}
function remoteCities(){return [...new Set(S.links.filter(l=>l.kind==='vxc').flatMap(l=>[l.a,l.b]))].filter(c=>!S.pops[c]);}
function nniUsed(c,prov){return S.links.filter(l=>l.kind==='vxc'&&l.prov===prov&&(l.a===c||l.b===c)).reduce((a,l)=>a+VXC[l.vt].g,0)+S.biz.filter(b=>BIZ_T[b.type].nni&&b.prov===prov&&b.city===c).reduce((a,b)=>a+b.bw,0);}
// Monthly price of one connection; compute() sums these, the connections overview lists them.
function transitMo(t,q){const n=t.n||1;return Math.max(q,PORT[t.tier].g*n*0.2)*transitPerG(NET[t.net],t.city,premOn(t))*S.priceMul+PORT[t.tier].tmo*n+(t.clean?cleanMo(t):0)+krFee(t,q);}
// Sender pays (Gangnam Style Peering): on top of the price, every Gbps delivered into Korea (95th percentile).
const krFee=(t,q)=>CITY[t.city].kr&&scnRule('sender')?Math.round(q*KR_FEE):0;
function pniMo(p,use){if(!pniOn(p))return 0;return (p.g1?Math.round(PORT[0].pni/2):PORT[p.tier].pni)*(p.n||1)+(NET[p.net].pol==='paid'&&!paidFree(NET[p.net])?NET[p.net].paidFee:0)+(NET[p.net].perG?Math.round(NET[p.net].perG*use):0);}
function ixMo(c){return S.myIx[c]?Math.round(myFab(c).mo*((S.ixSite||{})[c]==='ab'?1.5:1)):ixPortMo(c,S.ixp[c])*((S.ixn||{})[c]||1)+dkAddonMo(c);}
function nniPort(c,prov){return (S.nni||[]).find(x=>x.city===c&&x.prov===prov);}
function repayCost(l,B){return B.equity?Math.round(l.amount*3):Math.round(Math.max(l.bal,B.crypto&&l.got?l.got:0)*1.02);}
