/* ---------- cable ships ----------
   About sixty ships in the world can lay or repair a subsea cable, and only a few dozen do mostly repairs. Cable owners
   pay a yearly fee per km to a regional maintenance club, which keeps ships on standby in fixed ports, ready to sail
   within a day. When every club ship is out, the next cut waits. A private charter jumps the queue, for millions.
   The game keeps one or two ships at the real clubs' bases (Cornwall, Curaçao, Cape Town, the French Riviera,
   Vancouver Island, Yokohama, Subic Bay, Singapore) and two private operators. Names are puns, as everywhere. */
const SHIP_CLUBS={atl:{n:'Atlantic Splice Society'},med:{n:'Mediterranean Mending Club'},naz:{n:'North Pacific Patch Pact'},prv:{n:''},sea:{n:'SEA-IO Fix-It Club'},yok:{n:'Knot-a-hama Zone'}};
const SHIPS=[
 {id:'buoy',n:'Buoy Oh Buoy',club:'naz',home:'van'},
 {id:'cguy',n:'Cable Guy',club:'atl',home:'cpt'},
 {id:'grap',n:'Grapnel Grandma',club:'sea',home:'mnl'},
 {id:'hook',n:'Hook, Line & Splicer',club:'sea',home:'sin'},
 {id:'joint',n:'Jointly Liable',club:'sea',home:'sin'},
 {id:'junk',n:'Junk Bond',club:'prv',home:'sha'},
 {id:'knot',n:'Knot Again',club:'atl',home:'bde'},
 {id:'loose',n:'Loose Ends',club:'yok',home:'tok'},
 {id:'mend',n:'Mend & Tonic',club:'med',home:'mrs'},
 {id:'reel',n:'Reel Deal',club:'atl',home:'cur'},
 {id:'saw',n:'Sea-Saw',club:'prv',home:'fuj'},
 {id:'splice',n:'Splice Girl',club:'atl',home:'bde'},
 {id:'spool',n:'Spool of Thought',club:'yok',home:'tok'},
 {id:'tea',n:'Spliced Tea',club:'med',home:'mrs'},
];
const SHIP=Object.fromEntries(SHIPS.map(s=>[s.id,s]));
// The installation fleet lays new cables (not the repair ships above): your own cable gets one, and a second can be booked.
const LAY_SHIPS=['HMS Unplugged','Knot Today','Lay-Z Susan','Long Haul Lass','Reel Estate','Seas the Day','Spoolhardy','Wet Willy'];
/* Real numbers, rounded: a cable ship cruises at 10 to 12 knots (about 500 km a day) and leaves within a day of the
   call; a repair takes 3 to 5 days on site in shallow water and a week or two in deep water; most faults (anchors and
   fishing gear) are in shallow water near the shore; some countries take weeks to grant a repair permit in their
   waters. A repair costs $0.5M to $1M; jumping the queue with a private charter costs more. A lay ship lays a
   transoceanic cable at roughly 150 km a day. */
const SHIP_KMD=500,SHIP_MOB_D=1,SHIP_SHALLOW=300,LAY_KMD=150;
const SHIP_FIX=1000000,SHIP_FIX_KM=200,SHIP_MOB=3000000,LAY_DAY=150000;
// Days to get a repair permit in a country's waters, [fewest, most]; anywhere else the ship just goes.
const SHIP_PERMIT={CN:[14,28],EG:[7,21],ID:[21,42],IN:[21,42],VN:[14,28]};
