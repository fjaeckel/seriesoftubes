/* How many of a crust's pies wear out within a year (pieAlive counts a cohort less over the last PIE_WEAR of its life),
   and their average age in years, for the crust cards. */
function pieWear(id){const c=S.pie.crusts[id],life=CRUSTS[id].life;let soon=0,age=0,n=0;
  for(const k of c.cohorts){const a=pieAlive(k,life);if(!(a>0))continue;n+=a;age+=a*(S.day-k.day);if(life-(S.day-k.day)<=360)soon+=a;}
  return {soon:Math.round(soon),age:n?age/n/360:0};}
