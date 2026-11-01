/* ================= HELPERS ================= */
const fmt$=v=>{const a=Math.abs(v),s=v<0?'-':'';if(a>=1e6)return s+'$'+(a/1e6).toFixed(a>=1e7?1:2)+'M';if(a>=1e3)return s+'$'+(a/1e3).toFixed(a>=1e5?0:1)+'k';return s+'$'+Math.round(a);};
const fmtG=g=>g>=1000?(g/1000).toFixed(g>=10000?1:2)+' Tbps':(g>=100?g.toFixed(0):g.toFixed(1))+' Gbps';
const pct=x=>Math.round(x*100)+'%';
// Reach never rounds up to 100%: Tier 1 needs more than 99.9%, and 99.6% must not look like a full house (#73).
const reachPct=x=>x>0.999?'100%':x>=0.99?(Math.floor(x*1000)/10).toFixed(1)+'%':pct(x);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const pick=a=>a[Math.floor(Math.random()*a.length)];
// Names already given to customers, each once: only whether a name is in the list counts. Once every name had been
// used, the same names were added again every day (half a million entries, half of a late-game save).
const useName=n=>{if(!S.usedNames.includes(n))S.usedNames.push(n);};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/* A real calendar (#257): months of 28 to 31 days and Gregorian leap years, counted from Y1 (Y4 is a leap year,
   Y100 is not). Day 0 is 1 January Y1. Monthly prices are per calendar month. */
const leapY=y=>y%4===0&&(y%100!==0||y%400===0),MDAYS=[31,28,31,30,31,30,31,31,30,31,30,31],monDays=(y,m)=>m===1&&leapY(y)?29:MDAYS[m];
const yearStart=y=>{const n=y-1;return n*365+Math.floor(n/4)-Math.floor(n/100)+Math.floor(n/400);};
function cal(d){d=Math.max(0,Math.floor(d)||0);let y=1+Math.floor(d/365.2425);while(y>1&&yearStart(y)>d)y--;while(yearStart(y+1)<=d)y++;
  let r=d-yearStart(y),m=0;while(r>=monDays(y,m)){r-=monDays(y,m);m++;}return {y,m,d:r+1};}
const dayOf=(y,m,dd)=>{let n=yearStart(y);for(let i=0;i<m;i++)n+=monDays(y,i);return n+dd-1;};
// Months since the start, to tell one calendar month from the next; and the length of the month d is in.
const monthIdx=d=>{const c=cal(d);return (c.y-1)*12+c.m;},monLen=d=>{const c=cal(d);return monDays(c.y,c.m);};
// A monthly date that started on day s: the same day of the month, or the month's last day when it is shorter.
const monthiversary=(s,d)=>{if(d<=s)return false;const a=cal(s),b=cal(d);return b.d===Math.min(a.d,monDays(b.y,b.m));};
function dateStr(d){const c=cal(d);return tr('helpers.y_y_mon_d',{y:c.y,mon:MONTHS[c.m],d:c.d});}
function wrapDx(a,b){let dx=b-a;if(dx>W/2)dx-=W;if(dx<-W/2)dx+=W;return dx;}
function kmBetween(a,b){const A=CITY[a],B=CITY[b];return Math.max(20,Math.round(hav(A.lon,A.lat,B.lon,B.lat)));}
// Cities on a land bridge belong to two landmasses: Cairo reaches Asia overland across the Sinai, the way
// Istanbul does across the Bosporus (#47). Overland between continents still costs the intercontinental price.
const lands=C=>C.land2?[C.land,C.land2]:[C.land];
const isSub=(a,b)=>{const A=lands(CITY[a]),B=lands(CITY[b]);return !A.some(x=>B.includes(x));};
const popUp=c=>S.pops[c]&&!(S.pops[c].down>S.day);
const regionsCount=()=>new Set(Object.keys(S.pops).map(c=>CITY[c].reg)).size;
const ixCity=x=>String(x).split('~')[0];
function ixIdsIn(c){const o=ixStatic(c);if(S&&S.myIx&&S.myIx[c]&&!o.includes(c))o.unshift(c);return o;}
const hasIxAt=c=>ixIdsIn(c).some(x=>S.ixp[x]!==undefined);
function ixName(c){if(XIXM[c])return XIXM[c].name;return S.myIx[c]?S.myIx[c].name:CITY[c].ix;}
// IX.brrr Campinas already says where it is, so messages skip "in Campinas" (#134)
const ixNamesCity=c=>String(ixName(c)||'').toLowerCase().includes(CITY[ixCity(c)].name.toLowerCase());
