/* Glowball Sakura Lager: a Tier 2 that buys transit from three Tier 1s and resells it, with open peering wherever it
   is. Its PoPs are the real network's (Netify, Oct 2026: 38 cities in 17 countries) that are on our map: Asia-Pacific
   and New Zealand, the US and a handful of European hubs, and nothing in Africa or South America. It sits in four
   Australian cities and peers on their big exchanges, but is not one of the AU_SELLERS: like the Pacific carriers it
   sells Australians nothing, so Australia stays as hard as it was. Far from its US and European core it costs more
   (far), so it never undercuts the locals there. Sits before 40-traffic-shares.js, which indexes NETS. */
const GSL_POPS=['adl','akl','ams','bne','bom','chi','dal','fra','hkg','icn','ist','jkt','lax','lon','mel','mia','mil','mnl','nyc','osa','par','per','phx','sin','syd','tok','waw'];
NETS.push(
 {id:'gsl',name:'Glowball Sakura Lager',asn:137409,type:'t2',pol:'open',up:['lvl','cog','ntt'],share:.02,price:5,far:{AS:1.6,OC:2},col:'#C94F7C',auIx:['syd','mel','bne','per'],pops:GSL_POPS,ix:GSL_POPS.filter(c=>CITY[c].ix),blurb:tr('glowball_sakura_lager.on_tap_in_the_big_hubs')});
/* Its downstreams: networks that buy their transit from it, so a PNI with it reaches them too. Only where it has
   PoPs itself, and no Australians: a PNI with it is no back door into Australia. One per line, sorted within each. */
const GSL_DOWN=[
 // Asia
 'dhr', // Dhiraa-goo
 'ptc', // PTC-hell
 'tru', // Mostly-True Move
 'vtl', // Viet-tell
 // Europe
 'cms', // CityMess
 'dgi', // Digi-tally Cheap
 'fwb', // Fast-Webby
 'nos', // NOS-y Neighbour
 // North America
 'dgc', // Digi-Sell Caribbean
 'pes', // Pessimum
 'snc', // Sonic Boomer
 'wnt', // Whirled Net
 // New Zealand
 'spk', // Spark-le
];
for(const id of GSL_DOWN){const n=NETS.find(x=>x.id===id);n.up=(n.up||[]).concat('gsl');}
