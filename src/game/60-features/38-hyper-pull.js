/* ---------- Where users want a region (37-hyper.js) ----------
   Real clouds open a region where demand has gathered: a metro whose users all sit far from every region, or a country
   whose law keeps its users waiting for a region at home. hsPull() is that gauge, per site that could take a new region
   (hsSite, none there yet): every part of tonight's routing served from a region past HS_MS[0] counts towards the site
   nearest its users' zone (one its law allows), weighted by the share of the delay a region there would save (light in
   fibre: HS_PULL.km per ms); users held by residency (38-hyper-residency.js) count in full towards the site in their
   country (or bloc) nearest their main city. Read by the Cloud card, the city's region section and the next step. */
const HS_PULL={km:200,min:1,top:3,next:0.1};
function hsPull(r=R){const o=r&&r.hs;if(!o||!S||!S.hs)return [];if(o.pull)return o.pull;
  const H=S.hs,cand=CITIES.filter(C=>!C.off&&!H.rg[C.id]&&hsSite(C.id)).map(C=>C.id),m=new Map(),memo=new Map();
  const add=(c,g,k)=>{let x=m.get(c);if(!x)m.set(c,x={c,g:0,far:0,law:0});x.g+=g;x[k]+=g;};
  // The candidate nearest city z that users of country cc may be homed in (cached per pair: zones repeat).
  const near=(z,cc)=>{const k=z+'|'+cc;if(memo.has(k))return memo.get(k);let b=null,bk=Infinity;
    for(const s of cand){if(!hsResOk(cc,s))continue;const km=kmBetween(z,s);if(km<bk||km===bk&&s<b){bk=km;b=s;}}
    const v=b?[b,bk]:null;memo.set(k,v);return v;};
  if(cand.length)for(const cc in o.cc){const x=o.cc[cc],I=ccInfo(cc);
    if(hsResWhy(cc)){if(I&&hsResSite(cc)){const n=near(I.main,cc);if(n)add(n[0],x.D,'law');}continue;}
    for(const p of x.parts){const ms=p[2],g=p[1];if(!p[3]||!(ms>HS_MS[0])||!(g>0))continue;const n=near(p[5]||p[0],cc);if(!n)continue;
      const save=ms-n[1]/HS_PULL.km;if(save>0)add(n[0],g*Math.min(1,save/ms),'far');}}
  return o.pull=[...m.values()].filter(x=>x.g>=HS_PULL.min).sort((a,b)=>b.g-a.g||(a.c<b.c?-1:1));}
// The pull on one city, or null.
const hsPullAt=c=>hsPull().find(x=>x.c===c)||null;
// Why, in a few words: far users, the law, or both.
const hsPullWhy=x=>x.law>0&&x.far>0?tr('hyper_pull.why_both'):x.law>0?tr('hyper_pull.why_law'):tr('hyper_pull.why_far');
