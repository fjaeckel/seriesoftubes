/* ---------- QR codes (#263) ----------
   A small QR encoder: byte mode, error correction L or M, versions 1 to 40, the standard mask penalty. The game has no
   dependencies and no server, so moving a network to a phone is codes the phone's own camera app can open.
   Follows ISO/IEC 18004 (and Project Nayuki's reference implementation, MIT). */
const QR_ECC={L:[1,[7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28,28,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],[1,1,1,1,1,2,2,2,2,4,4,4,4,4,6,6,6,6,7,8,8,9,9,10,12,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25]],
  M:[0,[10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28],[1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49]]};
const qrRaw=v=>{let r=(16*v+128)*v+64;if(v>=2){const n=Math.floor(v/7)+2;r-=(25*n-10)*n-55;if(v>=7)r-=36;}return r;};
const qrDataCw=(v,e)=>Math.floor(qrRaw(v)/8)-QR_ECC[e][1][v-1]*QR_ECC[e][2][v-1];
// The most bytes one code of this version holds (byte mode).
const qrCap=(v,e='L')=>qrDataCw(v,e)-(v<10?2:3);
function qrMul(x,y){let z=0;for(let i=7;i>=0;i--){z=(z<<1)^((z>>>7)*0x11D);z^=((y>>>i)&1)*x;}return z;}
function qrRs(data,n){const d=new Array(n).fill(0);d[n-1]=1;let root=1;
  for(let i=0;i<n;i++){for(let j=0;j<n;j++){d[j]=qrMul(d[j],root);if(j+1<n)d[j]^=d[j+1];}root=qrMul(root,2);}
  const r=new Array(n).fill(0);for(const b of data){const f=b^r.shift();r.push(0);for(let i=0;i<n;i++)r[i]^=qrMul(d[i],f);}return r;}
const qrAlign=v=>{if(v===1)return [];const n=Math.floor(v/7)+2,step=v===32?26:Math.ceil((v*4+4)/(n*2-2))*2,r=[6];
  for(let p=v*4+10;r.length<n;p-=step)r.splice(1,0,p);return r;};
const QR_MASK=[(x,y)=>(x+y)%2===0,(x,y)=>y%2===0,(x,y)=>x%3===0,(x,y)=>(x+y)%3===0,(x,y)=>(Math.floor(x/3)+Math.floor(y/2))%2===0,
  (x,y)=>x*y%2+x*y%3===0,(x,y)=>(x*y%2+x*y%3)%2===0,(x,y)=>((x+y)%2+x*y%3)%2===0];
/* bytes (Uint8Array or array) → {size, m: rows of booleans (true = dark)}, or null when it does not fit in version 40.
   o.ecc 'L' (default) or 'M'; o.mask 0-7 to force one (tests); o.min/o.max bound the version. */
function qrEncode(bytes,o={}){const e=o.ecc||'L',len=bytes.length;let v=o.min||1;
  while(v<=(o.max||40)&&len>qrCap(v,e))v++;if(v>(o.max||40))return null;
  const cap=qrDataCw(v,e),bits=[],put=(x,n)=>{for(let i=n-1;i>=0;i--)bits.push((x>>>i)&1);};
  put(4,4);put(len,v<10?8:16);for(const b of bytes)put(b,8);
  put(0,Math.min(4,cap*8-bits.length));put(0,(8-bits.length%8)%8);for(let p=0xEC;bits.length<cap*8;p^=0xEC^0x11)put(p,8);
  const data=[];for(let i=0;i<bits.length;i+=8){let b=0;for(let j=0;j<8;j++)b=b<<1|bits[i+j];data.push(b);}
  // Split into blocks, add Reed-Solomon to each, interleave.
  const nb=QR_ECC[e][2][v-1],ne=QR_ECC[e][1][v-1],raw=Math.floor(qrRaw(v)/8),ns=nb-raw%nb,sl=Math.floor(raw/nb),blocks=[];
  for(let i=0,k=0;i<nb;i++){const d=data.slice(k,k+sl-ne+(i<ns?0:1));k+=d.length;const ec=qrRs(d,ne);if(i<ns)d.push(0);blocks.push(d.concat(ec));}
  const cw=[];for(let i=0;i<blocks[0].length;i++)for(let j=0;j<nb;j++)if(i!==sl-ne||j>=ns)cw.push(blocks[j][i]);
  const n=v*4+17,m=[],fn=[];for(let y=0;y<n;y++){m.push(new Array(n).fill(false));fn.push(new Array(n).fill(false));}
  const set=(x,y,d)=>{m[y][x]=d;fn[y][x]=true;};
  for(let i=0;i<n;i++){set(6,i,i%2===0);set(i,6,i%2===0);}
  for(const [cx,cy] of [[3,3],[n-4,3],[3,n-4]])for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const x=cx+dx,y=cy+dy,d=Math.max(Math.abs(dx),Math.abs(dy));if(x>=0&&x<n&&y>=0&&y<n)set(x,y,d!==2&&d!==4);}
  const al=qrAlign(v);for(let i=0;i<al.length;i++)for(let j=0;j<al.length;j++){if(i===0&&j===0||i===0&&j===al.length-1||i===al.length-1&&j===0)continue;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)set(al[i]+dx,al[j]+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1);}
  const fmt=mk=>{const d=QR_ECC[e][0]<<3|mk;let r=d;for(let i=0;i<10;i++)r=(r<<1)^((r>>>9)*0x537);const b=(d<<10|r)^0x5412,bit=i=>((b>>>i)&1)===1;
    for(let i=0;i<=5;i++)set(8,i,bit(i));set(8,7,bit(6));set(8,8,bit(7));set(7,8,bit(8));for(let i=9;i<15;i++)set(14-i,8,bit(i));
    for(let i=0;i<8;i++)set(n-1-i,8,bit(i));for(let i=8;i<15;i++)set(8,n-15+i,bit(i));set(8,n-8,true);};
  fmt(0);
  if(v>=7){let r=v;for(let i=0;i<12;i++)r=(r<<1)^((r>>>11)*0x1F25);const b=v<<12|r;for(let i=0;i<18;i++){const d=((b>>>i)&1)===1,a=n-11+i%3,c=Math.floor(i/3);set(a,c,d);set(c,a,d);}}
  for(let i=0,r=n-1;r>=1;r-=2){if(r===6)r=5;for(let vt=0;vt<n;vt++)for(let j=0;j<2;j++){const x=r-j,up=((r+1)&2)===0,y=up?n-1-vt:vt;
    if(!fn[y][x]&&i<cw.length*8){m[y][x]=((cw[i>>>3]>>>(7-(i&7)))&1)===1;i++;}}}
  const flip=mk=>{const f=QR_MASK[mk];for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(!fn[y][x]&&f(x,y))m[y][x]=!m[y][x];};
  let mask=o.mask;
  if(mask===undefined){let best=Infinity;for(let k=0;k<8;k++){flip(k);fmt(k);const p=qrPenalty(m);if(p<best){best=p;mask=k;}flip(k);}}
  flip(mask);fmt(mask);return {size:n,m,v,mask};}
// The standard penalty (N1 runs, N2 blocks, N3 finder-like patterns, N4 balance): the mask with the least scans best.
function qrPenalty(m){const n=m.length;let p=0,dark=0;const at=(a,b,row)=>row?m[a][b]:m[b][a];
  for(const row of [true,false])for(let a=0;a<n;a++){let run=1;
    for(let b=1;b<=n;b++){if(b<n&&at(a,b,row)===at(a,b-1,row))run++;else{if(run>=5)p+=run-2;run=1;}}
    for(let b=0;b+7<=n;b++){let hit=true;for(let k=0;k<7;k++)if(at(a,b+k,row)!==(k!==1&&k!==5)){hit=false;break;}if(!hit)continue;
      let l=true,r=true;for(let k=1;k<=4;k++){if(b-k>=0&&at(a,b-k,row))l=false;if(b+6+k<n&&at(a,b+6+k,row))r=false;}if(l||r)p+=40;}}
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){const d=m[y][x];if(d)dark++;if(x<n-1&&y<n-1&&d===m[y][x+1]&&d===m[y+1][x]&&d===m[y+1][x+1])p+=3;}
  return p+(Math.ceil(Math.abs(dark*20-n*n*10)/(n*n))-1)*10;}
// A code as SVG: one path of dark runs, with the four-module quiet zone scanners need. Always dark on white.
function qrSvg(q,label){const n=q.size,z=4;let d='';
  for(let y=0;y<n;y++)for(let x=0;x<n;){if(!q.m[y][x]){x++;continue;}let w=1;while(x+w<n&&q.m[y][x+w])w++;d+=`M${x+z} ${y+z}h${w}v1h-${w}z`;x+=w;}
  return `<svg class="qr" viewBox="0 0 ${n+2*z} ${n+2*z}" role="img" aria-label="${label}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;}
