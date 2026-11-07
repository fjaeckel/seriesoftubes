/* ---------- Traffic carried: the network's odometer ----------
   S.vol counts the petabytes the network has carried in this game: every day adds a day of what it served. R.served
   is in Gbps, so a day of 1 Gbps is 86,400 gigabits, 10.8 terabytes, 0.0108 PB. Badges ride on it (20-badges.js),
   from the first petabyte to a zettabyte, the whole internet's traffic in a year around 2016. */
const PB_DAY=86400/8/1e6;
function volDay(){S.vol=(S.vol||0)+(R.served>0?R.served*PB_DAY:0);}
// A volume of traffic, from the petabytes it is stored in: TB, PB, EB, ZB.
const fmtVol=pb=>pb>=1e6?(pb/1e6).toFixed(pb>=1e7?1:2)+' ZB':pb>=1000?(pb/1000).toFixed(pb>=1e4?1:2)+' EB':pb>=1?pb.toFixed(pb>=10?0:1)+' PB':(pb*1000).toFixed(pb>=0.01?0:1)+' TB';
// Saves: a number of petabytes. A save from before the odometer starts from the days its history still holds (the
// last 180), so an old network gets most of the credit it earned.
function volFix(s){if(typeof s.vol==='number'&&Number.isFinite(s.vol)&&s.vol>=0)return;
  s.vol=(Array.isArray(s.hist)?s.hist:[]).reduce((a,h)=>a+(h&&typeof h.srv==='number'&&h.srv>0&&Number.isFinite(h.srv)?h.srv:0),0)*PB_DAY;}
