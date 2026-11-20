/* ---------- The Hyperscaler's win, Cloud Nine, and its side achievement, Tier 1 (37-hyper.js) ----------
   Cloud Nine: regions on HS_C9_CT continents, a passed failover drill for every region pair in use (each region and its
   replica, 38-hyper-failover.js), your own subsea cable between two continents, and HS_C9_BTW Gbps between regions at
   peak (the highest R.hs.btw seen, S.hs.bpk). Its goal (cloud9 in HYPER_GOALS) sets S.hs.won. Tier 1 (transit-free and
   peering with every Tier 1, isTier1()) is never the win here: hsDay records S.hs.t1 with a toast, and the badge
   Transit? Never Heard of Her follows. A Hyperscaler never sells transit, Tier 1 or not. */
const HS_C9_CT=5,HS_C9_BTW=10000,HS_C9_KM=2000;
// Regions that are built (an outage does not unbuild them).
const hsRgBuilt=()=>S.hs?Object.keys(S.hs.rg).filter(c=>S.hs.rg[c].ready<=S.day).sort():[];
const hsC9Cont=()=>new Set(hsRgBuilt().map(c=>CITY[c].reg)).size;
// Region pairs in use: each built region with its replica, as "a|b".
function hsPairs(){const s=new Set();for(const c of hsRgBuilt()){const b=hsRepOf(c);if(b)s.add(hsPk(c,b));}return [...s].sort();}
const hsPairsUndrilled=()=>hsPairs().filter(k=>!(S.hs.drill&&S.hs.drill[k]));
// Your own cable across an ocean: subsea glass you laid yourself, between two continents.
const hsOcean=l=>ownGlassL(l)&&l.sub&&CITY[l.a].reg!==CITY[l.b].reg&&l.km>=HS_C9_KM;
const hsC9=()=>{const ps=hsPairs();return {ct:hsC9Cont(),dr:ps.length-hsPairsUndrilled().length,ps:ps.length,cab:S.links.some(hsOcean),btw:(S.hs&&S.hs.bpk)||0};};
function hsC9Ok(){if(!S.hs)return false;const x=hsC9();return x.ct>=HS_C9_CT&&x.ps>0&&x.dr===x.ps&&x.cab&&x.btw>=HS_C9_BTW-LV_EPS;}
function hsWin(){const H=S.hs;if(!H||H.won)return;H.won=S.day||1;track('win_cloud9');checkBadges();
  toast(`<b>☁️ ${tr('hyper_win.cloud_nine')}</b><br>${tr('hyper_win.won',{name:esc(S.name),n:HS_C9_CT,g:fmtG(H.bpk)})}`,'goal',[{l:tr('help.share_my_network'),act:'share',args:{}}]);sfx('coin');}
// A day: the peak between regions.
CX_DAY.push(()=>{const H=S.hs;if(H&&R.hs&&R.hs.btw>(H.bpk||0))H.bpk=R.hs.btw;});
CX_NEW.push(o=>{o.bpk=0;});
CX_SAN.push((h0,o)=>{o.bpk=clamp(Number.isFinite(+h0.bpk)?+h0.bpk:0,0,1e9);});
