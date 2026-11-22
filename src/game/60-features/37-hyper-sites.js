/* ---------- Where a Hyperscaler may build a region (37-hyper.js) ----------
   Real clouds do not build where people are most numerous: they build where power, land, water and fiber are, in or
   near the metros whose users they serve, and more and more in small towns far from any big city (Boardman, Council
   Bluffs, Luleå, Abilene). So region sites are a list, taken from where the big clouds actually run regions or their
   own campuses, not a population threshold.
   HS_SITES[id]: 'm' a metro region (its grid follows its size, hsGridP), or the megawatts of a campus town's grid (built
   for its data centers; the town itself draws what a town its size does). One entry per line, sorted by id. A city off
   the list keeps any region a save already has there (sanitize), but no new one is built. */
const HS_SITES={
 abi:1200, // Abilene, TX: a gigawatt-scale AI training campus on the West Texas plains
 akl:'m', // Auckland: cloud regions for New Zealand
 ams:'m', // Amsterdam: regions in and around the city
 ash:1200, // Ashburn, VA: the biggest data-center cluster there is
 ath:'m', // Athens: regions announced for Greece
 atn:'m', // Atlanta: regions and AI campuses around the city
 auh:'m', // Abu Dhabi: UAE regions
 bah:'m', // Manama: a Middle East region in Bahrain
 bdm:900, // Boardman, OR: a cloud's whole West Coast region in a farming town on the Columbia
 beg:'m', // Belgrade: for a cloud's Serbian region at Jovanovac, a little to the south
 ber:'m', // Berlin: a region in Berlin-Brandenburg
 bkk:'m', // Bangkok: Thai regions
 bog:'m', // Bogotá: a Colombian region
 bom:'m', // Mumbai: every big cloud's Indian region
 bru:'m', // Brussels: a Belgian region
 cal:'m', // Calgary: a Western Canada region
 cas:'m', // Casablanca: a cloud region for Morocco
 cbf:800, // Council Bluffs, IA: power, land and workers by the Missouri; a central US region
 cbr:'m', // Canberra: government cloud regions
 chi:'m', // Chicago: a North Central US region and campuses out west of the city
 cmh:900, // Columbus, OH: regions and a gigawatt AI campus in New Albany next door
 cph:'m', // Copenhagen: a Danish region
 cpq:'m', // Campinas: a Brazilian region outside São Paulo
 cpt:'m', // Cape Town: African regions
 cys:300, // Cheyenne, WY: cheap wind and cold air; a West Central US region
 dal:'m', // Dallas: regions and campuses across North Texas
 del:'m', // Delhi: a region for North India
 doh:'m', // Doha: Qatari regions
 dsm:500, // Des Moines, IA: a central US region and campuses in the suburbs
 dub:'m', // Dublin: Europe's first cloud regions, campuses all around
 dxb:'m', // Dubai: UAE regions
 ems:500, // Eemshaven: a cloud campus at the end of the Dutch coast, where the wind and subsea power come ashore
 fra:'m', // Frankfurt: regions for Germany
 gvl:400, // Gävle: a Swedish region two hours north of Stockholm
 gya:600, // Gui'an, Guizhou: mountain-cooled campuses where China's phone makers and clouds keep their data
 hel:'m', // Helsinki: a Finnish region
 hkg:'m', // Hong Kong: regions for the city
 hmn:400, // Hamina: an old paper mill turned cloud campus, cooled by the Baltic
 hyd:'m', // Hyderabad: an Indian region
 icn:'m', // Seoul: Korean regions
 inz:500, // Inzai: the data-center town in Chiba that serves Tokyo
 jed:'m', // Jeddah: a Saudi region
 jer:'m', // Jerusalem: an Israeli region (more around Tel Aviv)
 jhb:1000, // Johor Bahru: Southeast Asia's fastest-growing campus market, across the causeway from Singapore
 jkt:'m', // Jakarta: Indonesian regions
 jnb:'m', // Johannesburg: South African regions
 kul:'m', // Kuala Lumpur: Malaysian regions
 lax:'m', // Los Angeles: a region for Southern California
 lla:500, // Luleå: a social network's first campus abroad, by the Arctic Circle on cheap hydro
 lon:'m', // London: every big cloud's UK region, around the city and out along the M4
 maa:'m', // Chennai: a region for South India
 mad:'m', // Madrid: Spanish regions
 mck:600, // Moncks Corner, SC: a big cloud campus in the Lowcountry; an East US region
 mel:'m', // Melbourne: Australian regions
 mil:'m', // Milan: Italian regions
 mrs:'m', // Marseille: a French region where the subsea cables land
 mtl:'m', // Montreal: Canadian regions on hydro power
 mtp:900, // Mount Pleasant, WI: a gigawatt AI campus on former farmland by Lake Michigan
 mty:'m', // Monterrey: a Mexican region
 ncl:1100, // New Carlisle, IN: a 2.2 GW AI campus in the Indiana cornfields
 osa:'m', // Osaka: Japan's second regions
 osl:'m', // Oslo: Norwegian regions
 par:'m', // Paris: French regions
 pek:'m', // Beijing: every cloud's China North region, run by a licensed local partner
 phx:'m', // Phoenix: regions and campuses in the desert
 qcy:700, // Quincy, WA: potato fields and Columbia River hydro; a West US region
 qro:'m', // Querétaro: Mexico's cloud regions
 ric:600, // Richmond, VA: regions and campuses south of Ashburn, where the transatlantic cables land
 rlp:1500, // Richland Parish, LA: a multi-gigawatt AI campus on Louisiana farmland
 ruh:'m', // Riyadh: Saudi regions
 sao:'m', // São Paulo: every big cloud's South American region
 scl:'m', // Santiago: Chilean regions
 sgh:500, // St. Ghislain: a cloud's Belgian region, in a Walloon town on the canal
 sha:'m', // Shanghai: China East regions, run by a licensed local partner
 sin:'m', // Singapore: Southeast Asia's first regions
 sjc:'m', // San Jose: a region for Northern California
 slc:'m', // Salt Lake City: a West US region
 sto:'m', // Stockholm: Swedish regions
 syd:'m', // Sydney: Australian regions
 tok:'m', // Tokyo: Japanese regions
 tor:'m', // Toronto: Canadian regions
 tpe:'m', // Taipei: for Taiwan's region in Changhua
 vie:'m', // Vienna: an Austrian region
 waw:'m', // Warsaw: Polish regions
 yqb:'m', // Quebec City: an East Canada region
 zhy:900, // Zhongwei, Ningxia: desert, cheap coal and wind power, a foreign cloud's China region via its partner
 zjk:900, // Zhangjiakou, Hebei: wind farms and cold air north of Beijing; Alibaba's and Azure's China North campuses
 zrh:'m', // Zurich: Swiss regions
};
/* Mainland China (38-hyper-china.js): a foreign cloud runs regions there only through a licensed local partner (S.cnLic,
   the same licence as the Tubular game's joint venture), and nothing crosses the wall in either direction: Chinese
   users only in Chinese regions, Chinese regions only for them, no replica, lake or training run across (hsWall). */
const hsCnLicOk=(s=S)=>!!s&&!!s.cnLic&&s.cnLic.state==='ok';
const hsWall=(a,b)=>!!(CITY[a]&&CITY[a].cn)!==!!(CITY[b]&&CITY[b].cn);
// A city may hold a new region: it is on the list (behind the wall only with the licence). s: the save it is for.
const hsMetro=(c,s=S)=>!!CITY[c]&&!CITY[c].off&&HS_SITES[c]!==undefined&&(!CITY[c].cn||hsCnLicOk(s));
// A campus town: a grid of its own megawatts, whatever its size.
const hsCampus=c=>typeof HS_SITES[c]==='number';
