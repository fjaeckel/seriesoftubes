/* ---------- Pie in the Sky: patchy-sky customers (docs/plans/pie-in-the-sky.md) ----------
   Before a crust carries anything (under PIE_RAW, rule O2), a few customers already pay for a sky with gaps: buoys, ships'
   mail, cattle tags and weather stations that store their data and send it when a pie passes. They need no routed capacity,
   so they are a revenue line in pieMoney(), never a flow: routing is unchanged, and so is every game without pies.
   A crust earns PIE_PATCHY_MO (scaled by its size, Shortcrust's g as 1) x a share that grows from PIE_PATCHY_LO to PIE_RAW
   coverage, with at least one working pie dish under it. From PIE_RAW they hand over to the real orbit customers: the
   line shrinks as pieCarry() grows and is gone at PIE_BAKED, so the two are never paid for the same sky in full. */
const PIE_PATCHY_MO=30e6,PIE_PATCHY_LO=0.1;
// The Dishes tab's hint shows while every crust is under PIE_DISH_WAIT; the Launch tab nudges for a pad past PIE_PACE_SLOW days.
const PIE_DISH_WAIT=0.3,PIE_PACE_SLOW=720;
// Names for the Traffic tab, shown as more of the sky fills (puns, never real companies).
const PIE_PATCHY_NAMES=['Store and Forward Thinking','Buoy Meets Girl Telemetry','Ship Happens Mail','Moo-ving Target Cattle Tags','Whale Hello There Research','Weather or Not Stations','Better Late Than Never Post','Tide Me Over Buoys'];
// The share of PIE_PATCHY_MO crust id earns today (0..1): a ramp up to PIE_RAW, then handed over to pieCarry().
function piePatchyShare(id){return clamp((pieCov(id)-PIE_PATCHY_LO)/(PIE_RAW-PIE_PATCHY_LO),0,1)*(1-pieCarry(id));}
// $/mo from patchy-sky customers, per crust and in total: {mo, cr:{id:$}}. ds: pieDishes() of this compute.
function piePatchy(ds){const P=S.pie,o={mo:0,cr:{}};if(!P||P.safe||!ds.length)return o;
  for(const id in CRUSTS){if(P.crusts[id].down>S.day)continue;const f=piePatchyShare(id);if(!(f>0)||!ds.some(d=>pieCovers(id,d.city)))continue;
    const v=Math.round(PIE_PATCHY_MO*CRUSTS[id].g/CRUSTS.short.g*f);o.cr[id]=v;o.mo+=v;}
  return o;}
// How many of the names to show for mo $/mo: one per few $M, at least one.
const piePatchyN=mo=>clamp(Math.ceil(mo/4e6),1,PIE_PATCHY_NAMES.length);
