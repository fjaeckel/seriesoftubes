/* ---------- The Hyperscaler and the law: data residency (37-hyper.js) ----------
   Some countries pin their users' data to a region inside the country (HS_SOV: real data localisation laws, from
   Russia's 2015 personal data law to India's payment data rules, Indonesia's, Vietnam's, Nigeria's, Saudi Arabia's and
   Turkey's, and China's Cybersecurity Law), and EU members to a region anywhere in the EU (HS_EU). hsFlows homes such users only in a matching region
   (gameplay rule M13): none built yet, and they wait at the size they launched with, neither growing nor leaving (the
   card and the Cloud tab say why). A failover never breaks the law either: a region whose replica sits outside the bloc
   leaves those users without service while it is down. Very Sovereign Cloud tenants (Ministries and central banks)
   live only in a region in their own country; if theirs fails with nowhere at home to go, they leave at once.
   Unless the country has room for one region only (Singapore, Hong Kong, Taipei...): a second one at home can never be
   built, so its users and sovereign tenants may fail over to the replica abroad, as the regulators there accept (#451). */
const HS_SOV=['CN','ID','IN','NG','RU','SA','TR','VN'];
const HS_EU=['AT','BE','BG','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HR','HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK'];
// 'cc' (in the country), 'eu' (in the bloc) or '' (anywhere). A country's own new law counts too (hsRegRes,
// 38-hyper-regulation.js): from the day it is in force, its users are pinned like the countries above.
const hsResOf=cc=>HS_SOV.includes(cc)?'cc':HS_EU.includes(cc)?'eu':hsRegRes(cc);
// May users of country cc be homed in the region in city r?
function hsResOk(cc,r){if(!!(CITY[r]&&CITY[r].cn)!==(cc==='CN'))return false;const k=hsResOf(cc);if(!k)return true;const rc=CITY[r]&&CITY[r].cc;return k==='cc'?rc===cc:HS_EU.includes(rc);}
// A region they may use is built (live or not): until then they are held at their launch size.
function hsResMet(cc){const H=S.hs;if(!H||!hsResOf(cc))return true;return Object.keys(H.rg).some(r=>H.rg[r].ready<=S.day&&hsResOk(cc,r));}
// Could such a region ever be built in the country (or bloc)? A country with no data-center metro is out of luck.
const hsResSite=cc=>hsResOf(cc)==='eu'||CITIES.some(C=>C.cc===cc&&!C.off&&(C.id===S.home||hsMetro(C.id)));
// A tenant's products p in city c, served from region r: Very Sovereign Cloud stays in the country.
const hsTenResOk=(p,c,r)=>!hsWall(c,r)&&(!Array.isArray(p)||!p.includes('sov')||CITY[r].cc===CITY[c].cc);
// A country with at most one possible region site (your home counts): in a failover, the law lets its users go abroad.
const hsOneSite=cc=>CITIES.filter(C=>C.cc===cc&&!C.off&&(C.id===S.home||hsMetro(C.id))).length<2;
// The same tests for a failover into replica r (38-hyper-failover.js): the wall still holds.
const hsResFoOk=(cc,r)=>hsResOk(cc,r)||hsResOf(cc)==='cc'&&!!CITY[r]&&!CITY[r].cn===(cc!=='CN')&&hsOneSite(cc);
const hsTenFoOk=(p,c,r)=>hsTenResOk(p,c,r)||!hsWall(c,r)&&hsOneSite(CITY[c].cc);
/* Homing (hsFlows): a country's users may go to region r if the law allows it and, when their home region is out
   tonight (fo: out region -> replica, 38-hyper-failover.js), only to its replica. */
function hsHomeOk(cc,r,fo){const x=S.hs.cc[cc],h=x&&x.home;if(h&&fo&&own(fo,h))return fo[h]===r&&hsResFoOk(cc,r);return hsResOk(cc,r);}
// Why a country's users cannot grow, in words, or ''.
function hsResWhy(cc){const k=hsResOf(cc);if(!k||hsResMet(cc))return '';const v={country:esc(ccName(cc))};
  if(!hsResSite(cc))return tr('hyper_law.no_site',v);return k==='cc'?tr('hyper_law.held_cc',v):tr('hyper_law.held_eu',v);}
// The law in one short line, for the Cloud tab.
const hsResLine=cc=>{const k=hsResOf(cc),v={country:esc(ccName(cc))};return k==='cc'?tr('hyper_law.rule_cc',v):k==='eu'?tr('hyper_law.rule_eu',v):'';};
/* A day: sovereign tenants whose region failed, with no region at home to take them, leave at once (a drill is
   planned with them, so it never counts). */
function hsResDay(d){const H=S.hs;if(!H||!hyper())return;const o=R.hs;if(!o)return;
  for(const b of hsTen().slice()){if(!Array.isArray(b.p)||!b.p.includes('sov')||!b.rg||!hsOut(b.rg)||H.dx&&H.dx.c===b.rg)continue;
    const T=o.ten[b.id];if(T&&T.r)continue;S.biz=S.biz.filter(x=>x!==b);
    toast(tr('hyper_law.sov_left',{name:esc(b.name),country:esc(ccName(CITY[b.city].cc)),city:esc(CITY[b.rg].name)}),'bad');sfx('err');}}
CX_DAY.push(hsResDay);
