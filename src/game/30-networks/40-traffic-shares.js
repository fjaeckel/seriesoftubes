const NET=Object.fromEntries(NETS.map(n=>[n.id,n])),NET_IDS=NETS.map(n=>n.id);
/* Customer cones (#85): a network announces to its peers itself and everyone who buys transit from it, and their
   customers in turn. So a PNI or a session with a network reaches its whole cone, and peering with every Tier 1 brings
   their customers along. Built once at load: CONE[id] lists the network first, then its cone; CONE_S is the same as a
   Set, and DOWN[id] holds the cone without the network itself (empty for most). */
/* Who buys from whom follows the real networks' upstreams (bgp.he.net, CAIDA AS Rank, Oct 2026). Added in 2.0: Kyiv
   Superstar (Cogentle, Tell-Ya), Ooh-redoo and Du-opoly (Ta-Ta, Tell-Ya), Safari-Comic (Cogentle, Level Tree, Sea-Comedy),
   PLDTea Time (Not That, Ta-Ta), TIM-Tam (its sibling Sparkly Seabone), Floptus (its parent SingTell), Sky-High and
   Tele-Nor-Way (Tell-Ya, Level Tree), Virgin Mediocre (Level Tree, Not That), and the long tail (tailUp()). The rest stay
   islands because they are too: the content giants, the transit-free incumbents (Doitsche, Comecast, Jio-graphy, Bee-Tee),
   China and Korea, and Australia's big ISPs, which buy only from Australian carriers. Smaller Australians do sit in Tier 1
   cones: Kangaroo Courier buys from Cogentle, Doodoo and Spin2wintel from Hocus Pocus (Not That, Tell-Ya), Lintel from
   Speedyloop (Tell-Ya). */
const CONE={},CONE_S={},DOWN={};
{const dn={};for(const n of NETS)for(const u of n.up||[])(dn[u]||(dn[u]=[])).push(n.id);
 for(const n of NETS){const s=new Set([n.id]),q=[n.id];while(q.length){for(const y of dn[q.pop()]||[])if(!s.has(y)){s.add(y);q.push(y);}}
   CONE[n.id]=[...s];CONE_S[n.id]=s;DOWN[n.id]=CONE[n.id].slice(1);}}
// ANC[id]: every network whose cone holds it, nearest upstream first (who brings it along, for the panels).
const ANC={};for(const n of NETS){const o=[],q=(n.up||[]).slice();while(q.length){const u=q.shift();if(o.includes(u)||!NETS.some(x=>x.id===u))continue;o.push(u);q.push(...(NETS.find(x=>x.id===u).up||[]));}ANC[n.id]=o;}
// The networks a PNI with each network reaches: its customer cone. CONE_RANK: where routing tries a peer's cone.
const PNI_NETS=CONE,CONE_RANK=2.5;
for(const X of XIX){X.members=NETS.filter(n=>Array.isArray(n.ix)&&n.ix.includes(X.id)||!n.tail&&(X.core?X.core.includes(n.id):(n.ix==='ALL'||Array.isArray(n.ix)&&n.ix.includes(X.c))&&hstr(n.id+'|'+X.id)%100<(n.ix==='ALL'?72:X.take*100))).map(n=>n.id);}
const NSH={}; {const t=NETS.reduce((a,n)=>a+n.share,0); NETS.forEach(n=>NSH[n.id]=n.share/t);}
// After Glitch leaves Korea, Seoul viewers watch half as much of it and the rest moves to everyone else.
const NSH_KRX={}; {const w=id=>NSH[id]*(id==='amz'?0.5:1),t=NETS.reduce((a,n)=>a+w(n.id),0); NETS.forEach(n=>NSH_KRX[n.id]=w(n.id)/t);}
const CN_W={ctc:.2,cun:.14,cmb:.08,tcs:.22,abc:.14,byd:.08,bdc:.08,akm:.02,msf:.02,amz:.01,drz:.01};
const RU_W={ydx:.24,vkl:.12,rtc:.14,ggl:.12,bdc:.08,akm:.05,cfl:.06,msf:.04,amz:.03,tly:.02,cog:.02,drz:.01};
const NSH_RU={}; {const t=Object.values(RU_W).reduce((a,b)=>a+b,0); for(const k in RU_W)NSH_RU[k]=RU_W[k]/t;}
const NSH_CN={}; {const t=Object.values(CN_W).reduce((a,b)=>a+b,0); for(const k in CN_W)NSH_CN[k]=CN_W[k]/t;}
const CN_BLOCKED=NETS.filter(n=>!CN_W[n.id]&&n.type==='cdn').map(n=>n.name);
const TYPE_L={t1:tr('common.tier_1'),t2:tr('common.tier_2'),cdn:tr('common.cdn_content'),eye:tr('common.eyeballs')};
const initials=n=>n.name.replace(/[^A-Za-z ]/g,'').split(' ').filter(Boolean).map(w=>w[0]).join('').slice(0,3).toUpperCase();

