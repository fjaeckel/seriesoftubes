/* ---------- The Hyperscaler's availability zones and leased colo cages (37-hyper.js) ----------
   Two middle steps between one Rack Shack and a whole second region, as real clouds take them.
   Zones (S.hs.az[city]: [{r ready day, n name}]): a region adds a second building, and from level HS_AZ_LV[1] a third,
   in the same metro on its own grid feed a few kilometres away. Each adds HS_AZ_G of its tier's Gbps, compute slots and
   megawatts (from the same metro grid, through HS_MW_X), for about a fifth of the tier's price and a shorter build.
   What a zone really buys is a bad day survived: a local failure (a router crash, a power cut, a fat finger, the
   cleaner, one feed's grid trouble, a squirrel, an expired certificate or a dead battery room in one building) takes
   one zone out instead of the region (an 'hsaz' incident) and the region serves on minus a zone's worth of room
   (hsAzLossF): no failover, no data at risk, users barely notice. What hits the whole metro, the whole region or the
   law a zone cannot help: a heatwave or an energy crunch, a grid trip, a moratorium, a residency law, a change pushed
   to every building (DNS, a tag), Chaos Kong, and the backlog lost with them, which still needs a replica region
   (gameplay rule M14). Zones protect you from a bad day; regions protect you from a bad year. S.hs.azo[city] counts the
   local outages a region met (the plan and the intern suggest a zone from it).
   Cages (HS_T[HS_CAGE]: a region with t HS_CAGE): rented space at a wholesale colo provider in another metro, live in
   about two weeks for a small setup fee and a high monthly lease. Its megawatts are the provider's (never your grid
   budget, never cut by your grid, and allowed under a moratorium on new connections), passed on at the metro's price
   plus HS_COLO_MARK. It is a live region for everything (replication, failover, drills, levels and Cloud Nine: a real
   cloud may well open a region in leased space), but it cannot grow in place and takes no zones: you move out
   (hsColoOut) into your own Server Barn in the same metro, built while the cage serves; users and tenants stay where
   they are, and the lease ends the day the Barn opens.
   Real underneath: an availability zone is one or more separate data centers with their own power, cooling and
   network, kilometres apart in one metro and joined by low-latency fiber; clouds lease wholesale colocation to enter a
   market fast and build their own campuses later. */
const HS_AZ_G=0.25,HS_AZ_LV=[2,5],HS_AZ_MIN=60000,HS_AZ_MO=2000,HS_AZ_DAYS=[20,20,30,40],HS_COLO_MW=4,HS_COLO_MARK=1.4;
const HS_AZ_NAMES=[N_('hyper_az.z_comfort'),N_('hyper_az.z_twilight'),N_('hyper_az.z_friend'),N_('hyper_az.z_end'),N_('hyper_az.z_drop'),N_('hyper_az.z_ozone')];
const HS_COLO_P=[N_('hyper_colo.p_equinox'),N_('hyper_colo.p_reality'),N_('hyper_colo.p_machine'),N_('hyper_colo.p_transylvania')];
// A region failure (38-hyper-failover.js) by its message's index in HS_FAIL_MSG, when a zone takes it instead: the
// squirrel, the certificate, the cooling and the battery room are one building's trouble; DNS pushed everywhere and
// the cleanup script are the whole region's (null).
const HS_AZ_HIT=[N_('hyper_az.hit_squirrel'),N_('hyper_az.hit_cert'),N_('hyper_az.hit_cooling'),null,null,N_('hyper_az.hit_ups')];
// The classic outages at a region's POP that one zone takes instead of the region: one router, one building's power,
// one fat finger, one vacuum cleaner. A government shutdown is the law, not a bad day.
const HS_AZ_SOFT=['crash','power','oops','cleaner'];
const hsAzL=c=>{const H=S&&S.hs;return H&&H.az&&Array.isArray(H.az[c])?H.az[c]:[];};
// A region that can have zones: built by you (a cage is one rented room in someone else's building).
const hsAzOk=c=>{const d=S&&S.hs&&S.hs.rg[c];return !!d&&d.t!==HS_CAGE;};
function hsAzN(c){if(!S||!S.hs||!hsAzOk(c))return 0;let n=0;for(const z of hsAzL(c))if(z.r<=S.day)n++;return n;}
// Zones your level allows per region.
const hsAzMax=()=>lvl()>=HS_AZ_LV[1]?2:lvl()>=HS_AZ_LV[0]?1:0;
const hsAzT=c=>HS_T[S.hs.rg[c].t];
// A region's room on a good day: its tier, and HS_AZ_G more for every live zone.
function hsRgG(c){return HS_T[S.hs.rg[c].t].g*(1+HS_AZ_G*hsAzN(c));}
function hsAzSlots(c){const n=hsAzN(c);return n?n*Math.ceil(hsAzT(c).slots*HS_AZ_G):0;}
const hsAzMw1=c=>hsAzT(c).mw*HS_AZ_G;
// Megawatts zones being built already hold (hsMwRes); live ones draw through HS_MW_X below.
function hsAzMwB(c){if(!S||!S.hs||!hsAzOk(c))return 0;let n=0;for(const z of hsAzL(c))if(z.r>S.day)n++;return n*hsAzMw1(c);}
const hsAzCost=c=>Math.max(HS_AZ_MIN,Math.round(hsAzT(c).cost/5000)*1000);
const hsAzMo=c=>Math.max(HS_AZ_MO,Math.round(hsAzT(c).mo/5));
const hsAzDays=c=>HS_AZ_DAYS[Math.min(S.hs.rg[c].t,HS_AZ_DAYS.length-1)];
// A zone's name: its letter (the region's first building is A) and its pun.
const HS_AZ_ABC=['B','C'];
const hsAzName=(c,i)=>{const z=hsAzL(c)[i];return tr('hyper_az.zone_n',{l:HS_AZ_ABC[i]||'?',name:z?tr(HS_AZ_NAMES[z.n]):''});};
// Why a zone cannot be added in c now, or ''.
function hsAzWhy(c){const H=S.hs,d=H&&H.rg[c];if(!d)return tr('hyper_az.why_no_region');if(d.t===HS_CAGE)return tr('hyper_az.why_cage');
  if(d.ready>S.day)return tr('hyper_az.why_building');const n=hsAzL(c).length,m=hsAzMax();
  if(n>=2)return tr('hyper_az.why_max');if(n>=m)return tr('hyper_az.why_level',{lv:HS_AZ_LV[Math.min(n,1)]});
  const p=hsProt(c);if(p&&p.kind==='block')return tr('hyper_az.why_blocked',{grp:tr(HS_GRP[p.g])});return '';}
/* Zone outages: an 'hsaz' incident at the region's city takes one building out; the others carry on. */
const hsAzDown=c=>S.inc.length?S.inc.find(i=>i.type==='hsaz'&&i.ref===c&&i.until>S.day)||null:null;
// Whether a local failure in c can be taken by a zone now (one zone out at a time).
const hsAzHold=c=>hsAzN(c)>0&&!hsAzDown(c);
// What a region serves with one of its buildings out: a zone's worth less (with one zone, the tier's own room).
const hsAzLossF=c=>{const k=hsAzN(c);return k?(1+HS_AZ_G*(k-1))/(1+HS_AZ_G*k):1;};
// What one feed's grid trouble (71-hyper-incidents.js hspow) leaves: a zone's worth less with zones, else HI_POW.
const hsAzPowF=c=>hsAzHold(c)?hsAzLossF(c):HI_POW;
// Which building a local failure strikes, seeded on the day: 'Zone A' (the first) or a zone's name.
function hsAzWho(c){const k=hsAzN(c),i=hstr(S.asn+'|azw|'+c+'|'+S.day)%(k+1);return i?hsAzName(c,i-1):tr('hyper_az.zone_a');}
function hsAzLocal(c){const H=S.hs;if(!H.azo)H.azo={};H.azo[c]=Math.min(1e6,(H.azo[c]|0)+1);}
// A local region failure a zone takes: the incident (with its rush repair), and the count.
function hsAzHit(c,until,msg,cost,fix){addInc({type:'hsaz',ref:c,until,msg,cost,fix});return S.inc[S.inc.length-1];}
/* A classic outage at a region's POP (85-incidents/20-failures.js, 30-events.js, through hsSoloSoft): with a zone to
   take it, the POP stays up and the outage becomes one zone out, with the same repair. Counted either way. */
function hsAzSoft(i){if(!i||!hyper()||!S.hs||!HS_AZ_SOFT.includes(i.type))return false;const c=i.ref,d=S.hs.rg[c];if(!d||d.ready>S.day||!S.pops[c])return false;
  hsAzLocal(c);if(!hsAzHold(c))return false;const p=S.pops[c];p.down=remainUntil(x=>x!==i&&x.ref===c&&POPDOWN.includes(x.type))||0;if(!(p.down>S.day))delete p.down;
  i.type='hsaz';i.msg+=' '+tr('hyper_az.soft',{zone:hsAzWho(c),p:pct(hsAzLossF(c))});return true;}
/* A region failure that is one building's trouble (k: its message's index) with a zone to take it: one zone out
   instead, and true. Otherwise false, and the region fails as before. */
function hsAzFail(c,dur,k){if(!HS_AZ_HIT[k])return false;hsAzLocal(c);if(!hsAzHold(c))return false;
  hsAzHit(c,S.day+dur,tr(HS_AZ_HIT[k],{city:CITY[c].name,zone:hsAzWho(c),p:pct(hsAzLossF(c))}),Math.round(HS_FAIL_FIX/4),tr('hyper_az.fix'));return true;}
CX_ORG.push(c=>S.hs&&hyper()&&S.inc.length&&hsAzDown(c)?hsAzLossF(c):1);
HS_MW_X.push(c=>S.hs&&hsAzOk(c)?hsAzN(c)*hsAzMw1(c):0);
/* Cages. */
const hsColoP=c=>HS_COLO_P[hstr('colo|'+c)%HS_COLO_P.length];
const hsIsCage=c=>{const d=S&&S.hs&&S.hs.rg[c];return !!d&&d.t===HS_CAGE;};
// What the provider's meter reads in a live cage: the cage, its tenants and any training run there.
const hsColoMw=c=>HS_COLO_MW+hsTen().filter(b=>b.rg===c).length*HS_MW_SLOT+hsMwX(c);
const hsColoPrice=c=>Math.round(hsPwPrice(c)*HS_COLO_MARK);
const hsColoPw=c=>{const d=S.hs.rg[c];return d&&d.t===HS_CAGE&&d.ready<=S.day?Math.round(hsColoMw(c)*hsColoPrice(c)):0;};
// Why a cage cannot be leased in c now, or ''. A moratorium does not stop one: the building and its power are there.
function hsColoWhy(c){const H=S.hs,T=HS_T[HS_CAGE];if(!H||!isCity(c))return tr('hyper.not_a_region_metro');if(H.rg[c])return tr('hyper_colo.why_region');
  if(!hsSite(c))return tr('hyper.not_a_region_metro');if(!S.pops[c])return tr('hyper_colo.why_pop',{city:esc(CITY[c].name)});
  if(T.lv>lvl())return tr('hyper.tier_needs_level',{name:tr(T.n),lv:T.lv});if(hsRgN()>=hsRgMax())return tr('hyper.your_level_allows_n_regions',{n:hsRgMax()});return '';}
// Why the cage in c cannot be moved out of now, or ''.
function hsColoOutWhy(c){const d=S.hs&&S.hs.rg[c];if(!d||d.t!==HS_CAGE)return tr('hyper_colo.why_no_cage');if(d.ready>S.day)return tr('hyper_az.why_building');
  if(d.up)return tr('hyper_colo.why_moving',{date:dateStr(d.up.ready)});return '';}
// The power line of a cage's city (56-hyper-power.js).
function hsColoPwLine(c){if(!hsIsCage(c))return '';return `<p class="meta">🔌 ${tr('hyper_colo.pw_line',{prov:tr(hsColoP(c)),mw:+hsColoMw(c).toFixed(1),price:fmt$(hsColoPrice(c)),p:Math.round((HS_COLO_MARK-1)*100),mo:fmt$(hsColoPw(c))})}</p>`;}
// Where a cage would go to help region c: your POP nearest it in a region metro without a region, else such a metro.
function hsColoAt(c){const H=S.hs,mine=Object.keys(S.pops).filter(x=>!H.rg[x]&&hsSite(x)),L=mine.length?mine:CITIES.filter(C=>!C.off&&!H.rg[C.id]&&siteOk(C.id,HS_MIN_P)).map(C=>C.id);
  let b=null,bk=Infinity;for(const x of L){const km=kmBetween(c,x);if(km<bk||km===bk&&x<b){bk=km;b=x;}}return b;}
/* A day: zones open (with the lesson), and zones of a region that is gone go with it. */
function hsAzDay(d){const H=S.hs;if(!H||!hyper())return;if(!H.az)H.az={};
  for(const c of Object.keys(H.az)){if(!hsAzOk(c)){delete H.az[c];continue;}hsAzL(c).forEach((z,i)=>{if(z.r!==d||d<=0)return;const T=hsAzT(c);
    toast(tr('hyper_az.live',{zone:hsAzName(c,i),city:esc(CITY[c].name),g:fmtG(T.g*HS_AZ_G),n:Math.ceil(T.slots*HS_AZ_G)})+`<br><i>${tr('hyper_az.lesson')}</i>`,'goal',[],{a:'city',v:c});sfx('coin');});}}
CX_DAY.push(hsAzDay);
// The month: each zone's running cost, and the provider's power bill for each live cage (the lease is the tier's mo).
CX_COST.push(()=>{const H=S.hs;if(!H||!hyper())return 0;let m=0;for(const c in H.az)if(hsAzOk(c))m+=hsAzL(c).length*hsAzMo(c);for(const c in H.rg)m+=hsColoPw(c);return m;});
CX_NEW.push(o=>{o.az={};o.azo={};});
// Saves: zones only on a region of yours that is not a cage, two at most; a cage being moved out of keeps its Barn on
// order (siteFix only knows the ladder), and nothing on the ladder grows into a cage.
CX_SAN.push((h0,o)=>{const n=(v,d)=>Number.isFinite(+v)?+v:d,I=v=>Math.round(n(v,0)),obj=v=>v&&typeof v==='object'&&!Array.isArray(v),r0=obj(h0.rg)?h0.rg:{};
  for(const c in o.rg){const x=o.rg[c],u=obj(r0[c])?r0[c].up:null;if(x.t===HS_CAGE){if(obj(u))x.up={t:1,ready:I(u.ready)};}else if(x.up&&x.up.t>=HS_CAGE)delete x.up;}
  o.az={};if(obj(h0.az))for(const k of Object.keys(h0.az).slice(0,40)){const L=h0.az[k];if(!own(o.rg,k)||o.rg[k].t===HS_CAGE||!Array.isArray(L))continue;
    const zs=L.filter(obj).slice(0,2).map(z=>({r:Math.max(0,I(z.r)),n:clamp(I(z.n),0,HS_AZ_NAMES.length-1)}));if(zs.length)o.az[k]=zs;}
  o.azo={};if(obj(h0.azo))for(const k of Object.keys(h0.azo).slice(0,40))if(own(o.rg,k)){const v=clamp(I(h0.azo[k]),0,1e6);if(v)o.azo[k]=v;}});
