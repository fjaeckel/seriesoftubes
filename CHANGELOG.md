# Changelog

All notable changes to this project are documented here. The project follows
[Semantic Versioning](https://semver.org/). Each release is deployed to
[seriesoftub.es](https://seriesoftub.es).

## [Unreleased]

- Manila gets real exchanges: GotchaFIX Manila, the free community Bayanihan-IX and In-Vitro-IX, run by PLDTea Time. Diverge, Smarty Pants, Ditto and RISE & Shine join as Philippine networks, and PLDTea Time and Globe-Trotter Telecom now sell transit.
- Cebu joins the map on its own island, with GotchaFIX Cebu and two domestic cables from Manila: the Pan de Sal Cable Network and the Philippines Long Distance Relationship. PLDTea Time, Globe-Trotter Telecom, Diverge and RISE & Shine reach Cebu, and typhoons can hit it too.
- Davao joins the map on Mindanao, with GotchaFIX Davao. Bi-Frosted and SEA-US Later now land in Davao, as the real cables do, instead of Manila; a link you already run on their old Manila landings keeps working as a plain subsea link. Three domestic cables reach Davao from Cebu: the Pan de Sal Cable Network, the Philippines Long Distance Relationship and the new Diverge VisMin Express. RISE & Shine peers at GotchaFIX Davao. The Pan de Sal Cable Network also runs straight from Manila to Davao.
- Transit in the Philippines now costs about twice the Asian rate, as it really does, and Philippine homes pay less for broadband. GotchaFIX ports cost what the real exchange charges, about $700 a month for 10G and $2,800 for 100G. In-Vitro-IX charges about double that.
- Waves between Philippine islands now cost more than waves out of the country: Manila to Cebu costs about twice Manila to Hong Kong.
- Manila, Cebu and Davao have more people online, in line with their real populations.
- Cable names on the map no longer pile on top of each other when you zoom in. Where short cables crowd together, a name that would cover another is left out, and selecting a city shows the names of all its cables.

## [2.2.0] — 2026-10-31

- DDoS attacks are realistic now: most are small, the big ones are rare, and their size no longer grows with your network, so a big network is no longer hit by floods larger than the internet's record. Attacks go after one customer (gamers and hosting attract the most) or one city's subscribers, last one to three days, and On-call sees about one a month (#242).
- A flood now arrives on every port the internet reaches you on, so more POPs and more exits spread it thinner, and a port it fills slows every customer on it. Flowspec and scrubbing behind a full port can no longer empty it (#242).
- RTBH now blackholes only the customer under attack, upstream at your transits, most exchanges and about half your private peers: everyone else is saved and the target goes dark until you withdraw it. The IX blackhole button is part of RTBH now, and RouteScript's `blackhole ddos` does the same.
- Find any city with the new 🔍 button in the top bar, or press / on a keyboard (#218). Type a city, a country (in your language or in English) or an exchange, and the map jumps there.
- Cities on the map now show how big they are: zoomed out, bigger cities are bigger dots and megacities glow; zoomed in, a city's skyline grows from a hut to a megacity's towers. When cities crowd together, the smaller ones step back to a dot until you zoom in, so the map stays readable, and exchanges you haven't joined are quieter tags.
- An engaged scrubbing center now pulls the whole flood onto its own ingress and cleans up to its size, so your ports stay clear and only the target suffers if the center is too small. On-demand scrubbing takes half the flood on its first day instead of nothing for two days.
- Each router holds a limited number of Flowspec rules, shown in its POP: every attack takes one rule on each router it enters (a carpet bomb takes four), and when they run out, junk passes that router unfiltered. Bigger routers hold more.
- The NOC's attack card reads like the flood's path: who is hit, which ports are full, what Flowspec and scrubbing do, the result and the one thing to do now. Optional Auto-RTBH and auto-engaged scrubbing switches sit in the NOC, full ports pulse on the map, and Sandbox can send a test flood.
- Flood Season starts at customer level 4, so a 10T scrubbing center is within reach for the terabit floods; a flood you blackhole to save everyone else no longer counts as held.
- The intern's transit order has a new provider choice, Already connected: it only grows the transit you already buy at each POP, the smallest port first, and never signs a new provider, so several upstreams grow together and no customer's "no Cogentle" gets a surprise (#227).
- The intern's PNI order now counts the traffic the PNI list shows at each POP, so it no longer orders a PNI where a network's own cache boxes already serve most of its traffic (#244).
## [2.1.0] — 2026-10-31

- Your backbone now runs a technology you choose: plain IGP, LDP/MPLS, RSVP-TE, SR-MPLS or SRv6. Each step up costs plenty and uses less router CPU: label switching makes traffic that only passes through a POP cheaper for its router, and Auto-TE and RouteScript now need RSVP-TE or higher. Routers only run what they support, so a POP with an older router stays outside the backbone, and mixing vendors at the very top of what their routers can do brings interop failures. Networks that already have Auto-TE keep it exactly as it is.
- An upgraded backbone brings new customers: L3VPNs for enterprises from LDP/MPLS, flex-algo low-latency links from SR-MPLS and network slices from SRv6.
- A seat on a consortium cable can be lit with the optics you have: add regen sites in the landing stations along the cable. Before, a seat bought at level 2 or 3 stayed dark until long-haul transponders arrived at level 4.
- List spare capacity with a capacity broker as a standing listing: pick how many alien waves (or your spare pair) to sell, and the broker sells them off over time as carriers on that route want capacity. Each route's market is sized by the eyeballs at both ends, and a busy route sells in days while a road to nowhere sells maybe once, so renting out long empty fibers is no longer a money machine (#203).
- Two new routers for RSVP-TE backbones: the refurbished Brocadabra MLX-16 with 400G ports, and the Extremely Networks SLX 9740 with 1.6T ports.
- From RSVP-TE up, fast reroute has backup paths ready, so customers lose only half as much happiness while a link is cut.
- An interop lab in the NOC tests your vendors against each other first and cuts interop incidents by 60%.
- Four new badges for your backbone: Label switcher, Bleeding edge, Single-vendor shop and Vendor zoo.
- The chaos monkey's notice in the NOC no longer has an Open button that did nothing; the monkey's own card is right above it (#226).
- The puzzle list counts each section's own stars: architect runs show theirs next to their title, and the pack total now sits right above the packs, the stars that unlock the next one (#231).
- The intern's notes now name the exchanges it peered at: a city's first exchange showed as the city, so "Apfelwein-IX, London" really meant Apfelwein-IX and LYNX (#228).
- Cancelling an IRU, giving up your own fiber or decommissioning a POP now puts the optics on its fibers back on the spares shelf, instead of throwing them away (#229).
- Big networks freeze for less on every game day and every click: working out where traffic goes skips exits whose route is already full, so a game day takes about 40% less time (#210). Traffic goes exactly where it went before.
- Premium submarine terminals and Optical engineering can no longer be bought on a cable where they would change nothing (#198). The button now says so, and an upgrade that only helps together with the other one stays available.
- A wave size that is sold out on a route can no longer be reached by upgrading a smaller wave on it (#201). The upgrade button says how long it is sold out, just like when buying.
- Choosing Both for a PNI with one member now really splits it: the second member arrives in the other building when the augment lands, instead of joining the first (#219).
- The Open button next to your intern's weekly shift report in the NOC now opens the Standing orders sheet, where the whole week is laid out (#226). Before, it did nothing.

## [2.0.0] — 2026-10-30

**Series of Tubes 2.0: one game, four doors.** Some of you wanted a calmer game, some a harder one, some a quick puzzle over coffee and some a playground where nothing can go wrong. So now every network starts behind a door, and the rules you pick stay with that network for good. Your saved games carry on exactly as they were.

**Normal** comes in three flavours. Change Freeze is the calm one: a third of the outages, no DDoS floods, and deliveries in days instead of months. On-call is the game you know. BGP at 3 a.m. is for people whose pager is a personality: more outages, longer ones, more attacks, and fiery badges to prove you survived. In your first month you also pick a charter: a global backbone, or a low-latency boutique racing the speed of light.

**Sandbox** is a real sandbox now: everything unlocked from day one, money that never runs out, and a chaos dial from nothing ever breaks to spicy.

**Puzzles** are small networks that carry real traffic, routed exactly like the big game. Deliver every flow for the first star, stay on budget for the second, and survive any single cut for the third. When your build earns a star, the chaos monkey runs round the map snipping every trench and cable to prove it. A new puzzle arrives every Sunday morning, the same for everyone.

**Architect runs** grow one network brief by brief. New sites sign up, some become mission-critical, a city closes, traffic outgrows its tubes, and the chaos monkey reviews every brief before the next customer signs. Three handmade runs to start, and a fresh one every Sunday with its HQ somewhere new.

**Scenarios** are themed crises against the clock: a cut cable, a peering spat, a flood week, a race for low latency. A new one comes out every Sunday too.

And in On-call and BGP at 3 a.m., a **chaos monkey** sometimes moves into your network for a few months and snips tubes on purpose, the ones without a backup path first. Outlast it without a customer noticing and it pays; throw it a banana if you have had enough.

**Also new:** Tier 1 works like the real thing, so peering with the big club brings their customers along. A NOC intern carries out your standing orders. Customers call when your network can serve them, not only when your level says so. You can buy a seat on a consortium subsea cable, see at a glance whether a PNI is worth it, keep several networks and play two side by side, and every router model has its own face.

### One game, four doors

- A new start screen with four doors: Puzzles, Sandbox, Normal, and Scenarios & weekly. Every network now picks its rules when it starts, and they stay locked for that network; your saved games carry on exactly as before.
- Normal comes in three flavours. Change Freeze has a third of the outages and no DDoS floods, delivers PNIs, cross-connects and builds in days instead of months (#151), and skips hardware shortages, sold-out routes and de-peering at exchanges. On-call is the classic game. BGP at 3 a.m. brings almost twice the outages, lasting half as long again, and twice the DDoS. The HUD and the share card show which one you picked.
- Sandbox is a real sandbox now (#188): everything is unlocked from day one, your own subsea cable included, money never runs out, deliveries are quick, and you pick how much chaos you want, from none to spicy.
- Pick a charter in your first month of a Normal game: Global backbone (the game as you know it, and the default) or Low-latency boutique (#187). The boutique gets more trading firms, pays them 40% more and has its own win, Speed of Light: beat the fastest leased latency on three finance routes with your own glass while two latency customers pay you. It comes with a badge and shows on your share card.
- Badges now come in variants: games under the Change Freeze rules earn frosted Freeze-dried badges, and games under BGP at 3 a.m. earn fiery ones worth bragging about. Earning a badge under harder rules than before upgrades it in your collection on this device, and the badge list counts how many of each kind you have. On-call games earn the standard badges; Sandbox and puzzles earn none.
- Keep several networks on one device, and play two of them side by side in two browser windows. The title screen lists your networks, newest first, with their day, tier, cash and when you last played; tap one to continue it, or use ⋯ to export or delete it. Starting a scenario, the weekly challenge or a new network, or importing a save, now adds a network instead of replacing the one you have, and you can rename a network from the menu. Each window remembers its own network when you reload it. If a network is already open in another window, you can switch to it or take it over, and the other window steps aside instead of both saving over each other. Your existing save carries on as your first network.
- A tidier start screen: language first, then your network's name, the doors, three compact difficulty buttons with the chosen one explained below, and one drop-down for your home city with the five suggested homes at the top.
- Pick your own AS number next to your network's name when you start (#135). Leave it empty and the game picks one, and the round green arrow in the name box suggests another name.

### Puzzles

- Puzzles: small networks that carry real traffic, routed exactly like the main game (#190). Each puzzle has flows to deliver (eyeballs pulling from a content origin, circuits between two cities with a latency cap, best-effort traffic that may drop), and the map shows every link's load as it fills. Earn up to three stars: everything delivered, under budget, and still delivered when any single trench or cable is cut. Build with the real tools: link sizes from 10G to 800G, parallel links in the same trench or on a diverse route (also from the link panel), routers with real ports and limits, routing metrics, standby, lowest-latency paths for circuits, and the redundancy check. The whole world is open: any city can get a POP if it helps. Parallel links show their count and sizes, and selecting a city lights up every path it has. Eighteen puzzles in five packs, each teaching one idea: Fat Pipes, Router Rodeo, Traffic Cops, N-1 Club and Grand Tour. No clock, no bills, nothing breaks, and your main game is never touched.
- A new weekly puzzle every Sunday morning, the same for everyone: a themed puzzle with its own traffic, such as an ocean crossing, a ring, a latency sprint, island hopping or a detour around a busy hub, with its own name and a budget tuned so three stars take a smart design. The Puzzles door says "New this Sunday!" until you have played it, the list counts down to the next one, and your streak and share line use the week's name. A new puzzle week starts on Sunday at 06:00 Berlin time; offline, the game still has a weekly puzzle of its own.
- Every puzzle now has the chaos monkey: when your build earns a new star, it runs round the map snipping each trench and cable in turn, and the cities that lose traffic say how much. Let it loose again whenever you like, or skip straight to the stars.
- In puzzles, the map now shows whether the tubes between two cities share one trench or take separate paths, at any zoom: one trench is drawn as a bundle with a "2× one trench" tag, separate paths bow apart with a "2 paths" tag.
- When a new release changes prices so that this week's or a coming week's puzzle no longer adds up, that puzzle gets a fair new budget, and only its stars start again. Weeks that are over keep theirs.

### Architect runs

- Architect runs, under Puzzles: grow one network brief by brief, from a single tube to a ring that shrugs off any cut. Your build carries over between briefs, mission-critical sites must survive any single trench or cable cut with room on the detour, and a chaos monkey runs round the map snipping tubes before the next customer signs. Three runs to start: Euro Run, Coast to Coast and Pacific Rim.
- A new Architect run every week: every Sunday a fresh HQ somewhere in the world and six or seven briefs, each built around the network you already have, with its own stars. Sites can outgrow their tubes, so some briefs are about making room. Later briefs stay a surprise in every Architect run: their cities only appear when they come.

### Scenarios

- A new weekly scenario every Sunday morning too, the same for everyone: a themed crisis such as a cut cable, a peering spat, a big event, a flood week, island hopping, a race for low latency, a push across a continent or a shoestring budget, in about a year of game days. It sits at the top of Scenarios & weekly with a countdown and a "New this Sunday!" badge, has its own goal and progress card, a par to beat, a weekly streak and a result line to share. Offline, the classic weekly challenge stands in.
- Scenario tuning: every handmade scenario now asks for what its story is about, with shorter clocks where it was won in a tenth of the time. Mind the Gap, Cape to Cairo and Order and Progress count cities and IX.brrr ports only when your network joins them up; Fibre to the Basement also wants 500 Gbps served; in Anchors Away nobody sells transit in Tallinn and ships really do drag their anchors over the Baltic links, while the Great Firewall's losses no longer break your 99.5% streak; in the Cogentle Spat, Goggle wants a lot more of your traffic before it peers; Flood Season's terabit floods count when your scrubbing or Flowspec took them; Stepping Stones and Mid-Atlantic Accent start with 5M, enough to light the whole 1.6T chain. Gangnam Style Peering is now really about sender pays: Seoul transit carries a fee on every Gbps, the three incumbents only peer over a paid PNI, and Korean users notice every millisecond, so you win by hauling cheap Tokyo transit while keeping Seoul fast and in profit.

### The chaos monkey

- A chaos monkey now and then moves into your network in On-call and BGP at 3 a.m., and snips a tube every couple of weeks for 120 to 240 days, tubes with no backup path first. Its snips replace the usual random outages while it is here; get through the visit without a customer noticing for a resilience bonus and a new badge, or throw it a banana to send it home early. The "Met the Backhoe" badge is now "Met the Chaos Monkey", earned on its first visit; badges you already have stay yours.

### Build your network your way

- Customers now call when your network can already serve them, not only when your level says so (#187). A fast path between two finance cities brings trading firms, lit dark fiber brings AI interconnects, two diverse paths in one country bring sovereign clouds and broadband in a big city brings cloud gaming, each at its smallest size and with a note on what they spotted; your level still makes them bigger and more frequent.
- Routers, line systems and optics one level above yours can be had early as a vendor demo unit (#187). Ask the vendor, wait about two weeks, then pay 60% over list until your level catches up; and you can dig your own dark fiber from level 2 as a pioneer, at 60% more than the level 3 price.
- Take a seat on a new consortium subsea cable (#173). Capacity conferences offer them, and now and then a consortium calls from level 2: pay your share of the build, wait for the ship, then own one, two or four fiber pairs and light them with your own optics, your way onto your own subsea glass before Tier 1. A cut on that cable cuts your pairs too.
- Hire a NOC intern and give them standing orders: from customer level 2, Kevin from the night shift, Anycast Annie or Tracy Route runs your rules once a game day and pays exactly what your own clicks would. Keep transit above a multiple of its peak, add or swap routers above a load, take free caches, peer at every IX and PNI with the big networks every week, sign ready customers and decline tiny ones, rush repairs, light more fiber and retire small parallel waves. Each order has a pause switch, its own settings, a monthly budget and per-POP exceptions, never breaks a customer's or a bank's transit requirement, and shows what it adds to your monthly bill. The Ops sheet opens with the intern's mood and a weekly shift report, which is also the one notice a week the intern leaves in the NOC (#98, #100, #102, #181, #185, #192, #177).
- The intern only signs a customer after a trial run shows the network can carry them without hurting anyone else, and rushes every repair that has a price, while the budget lasts (#185). The bulk peering and PNI batches live in the Ops sheet, next to the orders that repeat them (#181, #192).
- Open a new city from a template in one tap: POP, broadband, transit, an IX port and the redundancy kit, priced up front, with your standing orders taking it from there (#98, #192).
- Utilities join route servers and request eligible peers across every joined IX, install missing PoP redundancy hardware and balance caches between sites, and request a cache from each eligible provider at each site. A POP's Infra tab shows the redundancy kit as one line with its price, above the rows it fills in.
- Order PNIs with one network or every network at all shared POPs from the Ops sheet: choose a port size, review the total cost, and add missing connections or upgrade smaller ones in one go. Each network keeps its own smallest PNI size and delivery time.
- Set the number of each optic model directly on land and subsea fiber links. Apply a whole change at once, with its total price shown before buying; removed optics return to the spares shelf.
- Every router model has its own picture: open one of your POPs and its router sits next to the city's name.

### Peering and Tier 1

- Tier 1 now works like the real thing: peer with the Tier 1 club and their customers come along for free (#85). A PNI or an exchange session reaches the networks you peer with and everyone who buys transit from them, so you no longer chase every tiny ISP for the win; only networks that buy transit from nobody, like the content giants and the big incumbents, still need peering of their own. Small networks and more real eyeball ISPs now buy transit from real-world upstreams, a peer's customers are tried after your direct peers and before transit (so peering widely still pays), the traceroute shows the hand-off, and the Road to Tier 1 card counts who already comes along. Games already won stay won.
- The peering inbox is gone: your peering policy now answers every peering request for you. Open accepts everyone, Selective accepts small networks on the exchange and newcomers with an up-to-date PeeringDB and quietly declines the rest, and Closed declines them all; once a week the NOC log sums it up, like "Peering desk: 7 new sessions at DE-KICKS and HAMS-IX, 3 declined (Selective)". Max-prefix alerts, the button that raised every limit at once, max-prefix outages at exchanges, your peering reputation and the Large Peering Model are gone too. The policy picker sits in the Networks tab, saved games keep their policy, and a game that hired the AI simply stops paying for it.
- Every network in a POP's PNI list now shows how you reach it today and whether a PNI there is worth the cross-connect (#175, #172). A chip says PNI here (with size and load), PNI elsewhere, which exchanges you peer at, whose customer cone carries it, transit only or not reached; a value line shows how much of its traffic leaves from that POP over transit, exchanges or other PNIs, and what a PNI there would save or cost a month. The best candidates get a ⭐ Worth it tag, the list sorts them first, filters to All, Via transit, Worth it or Already PNI, and groups networks by type, with idle groups folded. The same chip shows in the Networks tab and in the bulk PNI preview.
- Only Spätzle-IX now asks for 50% reach instead of 45%, since peering with the Tier 1 club brings their customers along. Two Tier 1 PNIs and the exchange are no longer quite enough (#114).
- Every country on the map now has at least two homegrown eyeball networks. Sixty-three real consumer ISPs and mobile operators join, from Angola and Bangladesh to Iceland, Japan and Zimbabwe, each with its real AS number and a pun name. They buy transit from the big carriers, so peering with the Tier 1 club reaches them too, and saved games get the usual courtesy route to them for their first 60 days.
- Palau's and the Marshall Islands' main networks now show their real AS numbers instead of ones borrowed from networks elsewhere.

### Prices, routing and money

- Prices now follow how connected each city really is, based on public peering and routing data. Every city on the map now has it, from Düsseldorf and Riga to Malé, the Caribbean and the Russian Arctic. Transit costs up to 1.8× more in cities where few networks are present, a POP costs 1.25× to 1.5× where there is little or no carrier-neutral data center, and countries with thousands of networks, like Brazil and the US, bring more ISP customers. Big hubs such as Frankfurt, Amsterdam, New York and São Paulo keep their prices.
- Every city now knows its country. Long-distance waves cost double only where they cross a border inside Africa, as they always meant to; a few northern routes, such as Kristiansand to Esbjerg and Anchorage to Halifax, lose a surcharge they picked up by mistake.
- Transit bills no longer change when you click something later in the day. After each day, the 95th percentile counted that day twice and dropped the oldest day, so building or changing anything could nudge your transit bill (and the bank's view of it) until the next day came round.
- Links can now use a custom routing metric, set either as a multiplier or as an exact cost. Pick Custom under Routing metric to fine-tune where your traffic goes; it explains how a link's cost is worked out and what each preset comes to on that link.
- Check a selected link’s redundancy against current demand: see disconnected endpoints, additional service loss and full fallback links without changing the live network.

### Attacks

- Attacks are more varied: sizes and lengths change from one attack to the next, and several can hit at once, each with its own controls in the NOC. Hosting game servers or cloud gaming makes attacks more frequent, as it does in real life (#153).
- Hosting game servers or cloud gaming brings RackNet and TeamSpooked attacks. Both bypass Flowspec and require dedicated mitigation (#153).
- Attacks can now use Memcached amplification or an ACK flood. Flowspec catches the former; the latter need mitigation (#153).
- Game server and cloud gaming customers now carry a “Gaming attracts attacks” note on their offers and customer lists, so you can see the DDoS risk before signing them (#153).
- Each live attack in the NOC now shows incoming bandwidth, upstream scrubbing, edge filtering, scrubbing-center use and any traffic still leaking through (#153).
- DDoS bandwidth now adds up: upstream scrubbing, edge filters and scrubbing centers work in sequence. The NOC uses the same figures as traffic routing, including floods that cannot reach a remote center (#153).
- Live attacks now show how much traffic Flowspec actually drops. Routers without TCAM no longer claim to filter attacks, and Flowspec drops are counted separately from other edge filters (#153).
- Live attacks now show one scrubbing detour from the attacked city to its nearest active scrubbing center, using the links' one-way latency (#153).
- The link traffic breakdown now shows the correct source city for scrubbing traffic. Cities using the same center no longer overwrite each other's labels (#153).
- Flood Season keeps sending ever larger attacks when you keep playing after winning or running out of time. Finishing the challenge no longer switches the floods off (#153).
- Flood Season escalates again: ordinary floods mixed with terabit monsters, all growing through the year, and floods go for the POPs that serve customers, so empty POPs no longer hold them for free.

### Smoother and safer

- Big networks load faster: on a phone, the map of a late-game network now appears about a second and a half sooner.
- The Networks list shows 100 networks at a time, with a button for the rest, so it opens quickly now that every country has its own networks.
- When your browser's storage is full, the warning now lists your other networks by size so you can export or delete one to make room. Closing the tab in the middle of a puzzle no longer loses recent progress on the network you set aside.
- The China licence follows quick lead times: about 5 days instead of 45 under Change Freeze and in Sandbox.
- Imported saves can no longer change a network's rules or slip HTML into a Flood Season attacker's name.

## [1.37.0] — 2026-10-28

- Series of Tubes now speaks German. The game follows your browser's language the first time, and you can switch to German under Settings or on the title screen. Networking terms like Peering and Transit stay in English, the way network engineers say them.
- Glowball Sakura Lager joins the map: a Tier 2 carrier in the big hubs of the US, Europe and Asia-Pacific that sells transit, takes PNIs and peers openly wherever it is. It is not a Tier 1, so it buys its own transit from three of them, while 13 smaller networks in its regions buy theirs from it, and one PNI with it reaches about 3% of all traffic. Far from home, in Asia and New Zealand, it charges more than the locals, and it sells no transit in Australia.
- China Telecomet now sells its CN-Too premium crossing in Moscow too, at the same price as in Hong Kong (#195). Haul your European traffic to Moscow and it reaches China with about 3% loss; nothing else of theirs is on offer there.

## [1.36.0] — 2026-10-28

- You can put a link on standby, so one of two links between the same cities sits idle as a backup (#122). It carries traffic only when the other links are full or down, so its capacity is never wasted, and the map draws it dashed while it waits. The routing metric still applies to every link between the two cities.
- Start anywhere: the new game screen lists the five suggested home cities as a compact stack, and the last entry lets you pick any city on the map that sells transit, grouped by continent. Below the big start button, How to play, Import a save and Settings are now the same size.
- Language is now a dropdown on the title screen and in Settings, with each language named in itself. On phones it opens the system picker.
- Every new network starts at ½ speed, so you can find your feet before the bills arrive (#186). Saved games still continue at the speed you left them.

## [1.35.1] — 2026-10-28

- Subsea cables stay at sea: Pacific cables no longer draw a line across the whole world where the map wraps round (#183), and over 170 cable routes that cut across Africa, Arabia, India, Brazil and other coasts now follow the sea. Cables into inland cities like Paris, Dublin and Hong Kong come ashore at the nearest coast.
- Found a bug or have an idea? The menu and How to play now link straight to the forms on GitHub, where every report is tracked. The Signal group stays for chatting.

## [1.35.0] — 2026-10-27

- Series of Tubes now speaks Spanish. The game follows your browser's language the first time, and you can switch to Spanish under Settings or on the title screen.
- The Caribbean joins the map: San Juan, Santo Domingo, Kingston, Havana, Nassau, Port of Spain, Bridgetown, Fort-de-France and Willemstad, with their real cables, exchanges and island networks (#125).
- Alaska, northern British Columbia and Russia's Arctic and Pacific coasts arrive, from Nome and Utqiaġvik to Petropavlovsk and Vladivostok (#145). Towns with no road in are only reachable by sea, and the towns Russia's Arctic cable never reached have a beach for your own.
- Capacity conferences arrive: PTC in Honolulu and Capacity Europe in London, once a year from customer level 3. Attend, and carriers ask for huge deals (waves, subsea capacity, whole fiber pairs) that you sign first and build afterwards, with months to deliver and a penalty if you miss the date (#168).
- Seven more American networks, from AT&Tease to GFibber (#155). New games need a PNI with AT&Tease to become a Tier 1, Spectre-um swallows Coax a year in, and a year later Final Frontear goes to Very-Zone, which charges for peering.
- More real cables in the North Sea and the Baltic, with Kristiansand, Esbjerg and Riga as new landings. The Baltic ones get cut by dragging anchors more often than most, as they do in real life.
- More real cables across the Indian Ocean and Asia-Pacific, from SJC2: Electric Boogaloo to FLAG-pole Europe-Asia, with Muscat, Malé and Fukuoka as new landings. Older cables gain the landings they were missing.
- Yellow progress bars are slim again, like the green and red ones, instead of padded boxes.
- Réunion, Mauritius, Madagascar and the Seychelles join the map in the Indian Ocean, on SAFE and the island cables, with Réunion's exchange as Rougail SAUCIX (#152).
- Pitcairn is on the map with no cable at all. Land your own, launch broadband, and the UK pays a monthly grant while the islanders are online (#124).
- Five more Australian networks, with Neptoon on every exchange in the mainland capitals (#154). Musklink now also shows up in the US.
- São Paulo's exchange is now called IX.brrr São Paulo, like every other Brazilian exchange (#166).
- Sponsor a conference: some peering meetings sell sponsorships, and while the glow lasts more customers from that region come knocking (#168).
- Big POPs can now run up to 16 routers (#157). The standard cage still holds six: each router past that costs half again to install and adds rent for a cage extension.
- Huge networks stop stuttering every few seconds when their save is too big for the browser to keep: after a failed save the game waits a minute before trying again, then longer, instead of retrying every 5 seconds and after every click. Leaving the page, exporting and new games still save at once.
- Saves of long games are much smaller: the list of customer names already used kept growing by the same names every day (half of a late-game save). Older saves shrink when loaded.
- Maps with more than a thousand lines on screen draw about twice as fast: they leave out the link labels and the dots on lit fiber, which nobody could read in such a tangle. Zoom in and they come back; the selected link keeps its label.
- The map of a huge network spends less time working out fiber capacities on every frame, and skips links above or below the screen.
- Big networks with thousands of fiber customers no longer stall: each game day and each action is about two to three times faster, and new alien-wave offers no longer freeze the game for a moment.
- The game now tells you when it cannot save: a network too big for the browser's storage, or a browser that blocks it, used to stop saving without a word (#176). Export a save from the warning to keep a backup.
- Big networks take about 40% less space to save: saves leave out customer details the game can work out again when loading (#176).
- Huge networks fit in the browser again: saves over a million characters are compressed, about ten times smaller (#176).

## [1.34.1] — 2026-10-27

- The game starts faster in Italian, Portuguese and French: their translations are about 40% smaller to download.

## [1.34.0] — 2026-10-27

- Choose your peering policy: Open to all, Selective or Closed. Open accepts everyone and keeps the route servers, Selective means fewer requests but you ask peers yourself, and Closed scares customers away.
- One button now raises every max-prefix limit at once. Leaks included.
- Brazil is slimmer: 15 small cities next to bigger ones are gone from new games. Saved games keep their POPs there, and Order and Progress now needs 15 IX.brrr ports.

## [1.33.0] — 2026-10-27

- Australia arrives: start in Sydney on hard mode. Expensive transit, a national network that keeps 45% of every broadband bill, real Australian exchanges and carriers, Adelaide, Canberra, Hobart and the South Island of New Zealand, new cables, very Australian outages and a new scenario, Fibre to the Basement. Older saves with Australian POPs are told once what changed.
- Hardware gets dearer over the years, and shortages come and go. Routers, optics and new builds cost about 4% more each year after your first six months (up to 30%), and laser, chip or cable-ship shortages add 30 to 50% for a month or two. Stock spare optics, or lock a year of prices from the NOC tab.
- Routes can sell out of a wave size for a while. The link window shows which sizes and for how long; never in your first 90 days.
- PNIs with the big networks are quicker again: usually about a month. About one order in seven still gets stuck for 6 to 12 months.
- Crowdflare offers free Rackstar cache boxes once you send it 10 Gbps.
- Smaller fixes: one button hires enough crews to finish a build in a day, and extra crews stop once they save no time (#103). Subsea upgrades move with the cable's finish date. Alien waves from the same carrier grow one contract, keeping big saves small. The broadband panel shows what homes really pay. Crowded POP names hide until you zoom in. Exchanges named after their city no longer repeat it (#134).

## [1.32.0] — 2026-10-27

- Six Atlantic stops join the map: Halifax, Bermuda, the Azores, Tenerife, Cape Verde and St Helena (#120). The cables across the Atlantic now stop where they really land, and a POP on an island splits a crossing that is just too long for 1.6T into hops that each carry 1.6T or more: Miami to Madrid via Bermuda and the Azores, Atlanta to Lisbon via Bermuda, Lisbon and London to Lagos via Tenerife, and Fortaleza to Europe via Cape Verde. Halifax sits at the start of the shortest line to England. Three new cables, Sol Survivor, Atlantis-2: The Sequel and Canary in the Cable Mine, link the islands, and older ones gain island stops. Exchanges only where one runs today, in Praia and Halifax. New island networks from One Commotion to Pretty Sure South Atlantic, cables that go quiet in the Bermuda Triangle, and a new scenario, Mid-Atlantic Accent, asks you to cross at 1.6T hop by hop. Broadband in a very small town no longer starts above what the town can use.
- Backhauling users to transit far away now makes their internet slow, and slow is bad service. Users feel the round trip to wherever their traffic leaves for transit: up to 20 ms (about 1,500 km) is fine, beyond that service suffers, and past 50 ms broadband and internet services count as bad service, which costs revenue and customers. Traffic over your own peering, PNIs and caches is not penalised. Slow cities show a 🐢 in their panel, a warning in the Transit tab and a list in the NOC.
- The NOC now keeps every notification from the last 10 minutes near the top of its tab, newest first, so nothing that popped up while you looked away is lost. Each one shows its title, a short text and how long ago it happened, repeats fold into one line with a count, and an Open button takes you to the city, link, customer, bank or goal it is about. The NOC button in the top bar and the NOC tab on phones count the ones you have not read yet. Resolved incidents now say what was fixed and where.
- Peering now comes with an inbox: every IX port brings peering requests from networks you have never heard of, and sessions drop when someone blows past the max-prefix limit their PeeringDB promised. Answer requests, decide whether a max-prefix alert is growth or a route leak, and keep your reputation up, because selective networks hear when you never answer. For $20M a year the Large Peering Model AI answers it all for you, quickly and often wrongly.
- PNIs take time: a cross-connect with a small network takes a few weeks, and the big content networks, Tier 1s and big eyeball networks quote 6 to 12 months for a new PNI or an augment. The content networks and Tier 1s no longer do 10G PNIs (100G and up), Doitsche Telekomm still sells 1G, and Microsnoft has no capacity on the US east coast at all.
- Backhauling users to transit far away now makes their internet slow, and slow is bad service. Users feel the round trip to wherever their traffic leaves for transit: up to 20 ms (about 1,500 km) is fine, beyond that service suffers, and past 50 ms broadband and internet services count as bad service, which costs revenue and customers. Traffic over your own peering, PNIs and caches is not penalised. Slow cities show a 🐢 in their panel, a warning in the Transit tab and a list in the NOC.
- RouteScript has a new “Slop it with AI” button: an AI reads your live traffic, writes you a script and tells you how great it is. A new help page explains what every rule does and how real routers do the same, with seven ready-made scripts (Penny Pincher, Peering First, Shields Up and more) filled in from your own network and loaded with one tap.
- New player-built subsea cables follow surveyed sea routes around land (#133). Their map paths, prices, optical reach and latency use the same distance, and premium designs are consistently faster. Like real cables, routes between Europe and Asia cross Egypt beside the Suez Canal and routes between the Caribbean and the Pacific cross Panama, except during the Red Sea Crisis, which shuts the canal. The low-latency design is still as fast as the fastest cable on the map: it can follow that cable’s corridor, or land a little further off and run to an inland city over land. Quotes change with the real sea distance, cheaper on some routes and dearer on others. Existing cables keep their saved characteristics.
- You can zoom in much further on the map, and a short link between two close cities can now be picked (#126). Dense regions like southern Brazil spread out properly when you zoom in, and tapping right on a link next to a city opens the link instead of the city.
- The NOC now keeps every notification from the last 10 minutes near the top of its tab, newest first, so nothing that popped up while you looked away is lost. Each one shows its title, a short text and how long ago it happened, repeats fold into one line with a count, and an Open button takes you to the city, link, customer, bank or goal it is about. The NOC button in the top bar and the NOC tab on phones count the ones you have not read yet. Resolved incidents now say what was fixed and where.

## [1.31.0] — 2026-10-26

- Series of Tubes now speaks French. The game follows your browser's language the first time, and you can switch to Français under Settings or on the title screen.
- Your own subsea cables now come in three designs, from the budget route to one as fast as the fastest cable on the map, and two upgrades carry faster channels further (#65). Each design shows its latency, price and build time before you order: optimized costs three times as much and low latency seven times, and both take months longer. Premium terminals and optical engineering light longer routes at higher speeds, so a cable as long as New York to Sydney can now carry traffic, and the order screen tells you which upgrade a route needs. Calling off a cable while it is being laid refunds what you actually paid for it.
- A new Road to Tier 1 card in Goals shows what still stands between you and Tier 1 (#111, #121, #12). It counts the transit ports left to cancel, names the Tier 1s you still need a PNI with and what they want from you first, and shows how much of the internet you would still reach without transit. The Networks tab can list just the networks you reach only through transit, biggest first, each with why it is not peering with you yet and where to meet it: the cities for a PNI and the exchanges it sits on, your POPs first, then the nearest. Who your transit carries, in the NOC, names the nearest city when a network is not in yours and takes you straight to it.
- You can now run a scrubbing center in every POP, not just one (#117). An attack goes to the nearest working center and spills to the next when it is full. A center in another city means the flood rides your backbone there and back: it fills your links, adds latency, and whatever your links cannot carry is not scrubbed. DDoS protection customers mind when their attacks are hauled across an ocean, some new customers ask for a center on their own continent, and the NOC shows where each attack is being cleaned.
- Düsseldorf joins the map with the Altbier-IX (#108). It is Germany's second carrier hub, an hour from the Dutch border, and the networks you meet there are the ones really present: Voda-Phony's home market, Doitsche Telekomm, the big Tier 1s and the clouds.
- Spare capacity on your dark fiber is now easy to sell (#51). Each fiber shows its free channels and who rents alien waves or a spare pair on it, and a capacity broker can list it for you: an offer turns up at once, and the broker keeps 10%.
- Red Sea Crisis now asks you to keep 80 Gbps flowing between Asia and the rest of your network for 30 days in a row, instead of 300 Gbps served anywhere, which broadband alone could reach on day 0 (#113). The scenario card shows today's traffic to and from Asia and how many days in a row you have held it.
- Only Spätzle-IX can now be won with peering alone (#114). The goal is now 45% reach and 300 Gbps served, and the scenario card shows your reach as well as your traffic.
- PNI buttons now show the monthly port fee next to the one-off setup cost, so a $1.8k cross-connect no longer looks like a monthly bill (#110). Upgrading a PNI shows what the bigger port costs per month too.
- Luxembourg gets its own eyeball network, Poste Restante, at LU-SICK in Bettembourg, so there is a reason to peer there (#84).

## [1.30.0] — 2026-10-26

- Twelve Pacific islands join the map: Honolulu, Guam, Koror, Majuro, Port Moresby, Honiara, Nouméa, Suva, Nuku’alofa, Apia, Pago Pago and Papeete. The cables across the Pacific now stop where they really land, and a POP on an island splits a long crossing into shorter hops that each carry more: California to Sydney goes from 400G to 1.6T per wave via Honolulu and Suva, Hong Kong and Manila to Los Angeles from 400G to 800G via Guam, and Santiago to Sydney from 400G to 800G via Tahiti. Twelve new cables, among them SEA-US Later, Echo-Chamber and Coral Sea Shanty, link the islands, and the old ones gain island stops. Only islands with a real exchange today get one: Honolulu, Guam, Suva, Nouméa and Honiara. Island telcos from Hawaiian Telecombo to Never Too Atoll join the networks, PacNOG meets in Suva every December, Guam, Port Moresby and Honiara have unreliable power, Tonga’s cable has a volcano for a neighbour, and a new scenario, Stepping Stones, asks you to hop the Pacific at 1.6T.
- Big networks are snappier again: working out each day's traffic takes about a third less time on phones and half on desktops, so game days and clicks pause for less. Traffic goes exactly where it went before, and the game makes far less garbage for the browser to clean up.
- Your own subsea cable can no longer be longer than any optic can light (#88). New York to Sydney now says so before you pay, instead of after the ship comes home. Calling off a cable while it is still being laid returns most of the price of the part not laid yet, and an unusable cable from an older save goes back for a full refund.
- Your own IX can now live in either building of a two-site metro, or in both with a second switch, so a dark building no longer takes your exchange down (#36). The LAG buttons that did nothing on your own IX are gone.
- Upgrading the only router in a POP that has nothing plugged in yet no longer opens a maintenance window or a NOC warning (#105).
- Declining a loan offer clears the bank badge right away, even while the game is paused (#104).
- The 3.2T transponder now falls back to 1.2T between 4,000 and 5,500 km (6,000 to 8,250 km subsea), like the 1.6T one, instead of dropping to 800G (#107). A bigger optic now carries at least as much as a smaller one at every distance.
- Parallel waves of different sizes now show each size on the map, like 800G + 400G, instead of a misleading 2 × 1.2T (#56).
- Picking a subsea route from a city without a cable landing, like Oslo, now names the nearest landing station instead of saying its cables reach "nowhere" (#50).
## [1.29.0] — 2026-10-26

- Big networks lag a lot less: on a network with a hundred POPs and a thousand peering ports, the NOC dashboard opens six times faster, the side panels three times faster, and each game day takes about a third less time. The map needs about a third fewer drawing steps per frame, and open panels only update what changed, which keeps them smooth and lets the traffic bars glide to their new values. The connection and customer lists in the NOC dashboard show 100 rows at a time, with a button for more. While the game is paused or animations are off, the map is only redrawn when something on it changes, which saves a lot of battery on phones. On a phone, the map also rests while the NOC dashboard fills the screen, so scrolling it stays smooth.
- Africa grows from five cities to twenty-six, across nineteen countries, and a new scenario, Cape to Cairo, asks you to cross it. New: Dakar, Abidjan, Accra, Douala, Kinshasa, Luanda, Casablanca, Algiers, Tunis, Djibouti, Addis Ababa, Mombasa, Dar es Salaam, Kampala, Kigali, Maputo, Durban, Windhoek, Lusaka, Harare and Gaborone, each with its own IX. Overland fiber across an African border costs twice as much, and Kinshasa, Lusaka and Harare have unreliable power.
- Brazil now has all forty IX.brrr locations, from Manaus to Lajeado, so you can build a real national network. Fiber into the Amazon costs twice as much and its repair crews go by boat, Oi Oi, TIM-TIM Mobile and Brisanada join Brazil's networks, and a new scenario, Order and Progress, asks you to peer on 20 IX.brrr exchanges.
- Series of Tubes now speaks Portuguese (Brazil). The game follows your browser's language the first time, and you can switch to Português under Settings or on the title screen.
- Come chat with other players in the new Series of Tubes Signal group. It's linked from the title screen, the menu and How to play: share screenshots, report bugs and argue about peering policy.
- RouteScript speaks more BGP. `prefer transit` and `avoid transit` set which upstream goes first, like local-pref, `prepend transit PROVIDER 1-3` moves part of an upstream's traffic away, the way AS-path prepending nudges the rest of the internet, and `protect customers` routes business traffic first when links are congested, so home users take the hit instead of your SLAs. A new Optimize button drafts a script from live traffic and points out networks you could reach over an IX or a PNI instead of transit.
- Twelve more Latin American cities: Montevideo, Asunción, Córdoba, La Paz, Quito, Medellín, Caracas, Guatemala City, San José, Querétaro, Monterrey and Guadalajara. Moviestar, Liberty Latte America, Antelope and Tiger Mobile join them, and Salvador and Montevideo get cable landings.
- Seven new cables around Africa (ACE of Spades, SAT-3-Legged Stool, MainOne-Track Mind, Mint Tea West Africa, Set SAIL, Sea-Comedy Hour and Dare-Devil-1), and the existing ones now stop in the new cities. Set SAIL and SACS-y Cable link Brazil to Cameroon and Angola, and Sea-Comedy Hour links Djibouti to Mumbai. Liquid Lunch Networks, Sea-Comedy Networks, Angle-a Cables, Djibouti Calling, Empty-N, Air-Tell Africa, Ethio-Tele-Calm and Atlas Shrugged Telecom join the networks.
- Hamburg and Munich join the map, with the Moin-IX and the Brezn-IX. Stuttgart and Frankfurt are back where they belong on the map, with Stuttgart between Frankfurt and Zurich instead of halfway to Prague.
- Swapping router models now sells the old ones on eBuy for 30% of their price, and removing a router does too (#82). A POP takes one swap a day, so a double click no longer buys two upgrades, and optics and waves now say which port speed they need instead of naming one model.
- Fiber between nearby cities bends gently again instead of looping wide around the neighbourhood, so dense regions like Toronto, Ottawa and Montreal stay readable.
- The game no longer gets slower after a long pause. The money that floats up from your cities on payday kept piling up off-screen instead of fading, hundreds of them on a big network.

## [1.28.0] — 2026-10-25

- Belgium and Luxembourg join the map: Brussels, Oostkamp and Bettembourg (#79). Belgian POPs and transit cost more, and Belgian homes stay with their two big ISPs unless you run an ad campaign there. Telenyet, Proxyminus, B.I.G.S., Citrus Belgium and CityMess join the networks, a new cable connects London to Oostkamp through some very busy fishing grounds, and Bettembourg's cooling depends on a steady supply of waste wood.
- Four new cities in North America: Kansas City, Calgary, Vancouver and Ottawa (#76). Canada gets two more big networks, Tell Us and Bodgers Communications, which you also reach through the Tier 1s they buy transit from. Ottawa's power grid is about as reliable as you would expect, and Canadian fiber has a new natural enemy.
- New waves can join any route you already have between two cities, so two waves can run on the main route and two on the diverse one (#77). Each extra route shows up as its own choice, priced like the route it joins.
- Embedded caches can now sit in either building of a two-site metro (#69). A new box goes to the building with fewer of them, you can move boxes between A and B in the Peering tab, and a dark building only takes out the boxes inside it.
- Reach in the top bar no longer rounds up to 100% when it is just short, and the Goals tab now says why you are not Tier 1 right now (#73). Tier 1 needs more than 99.9% reach, so one small network out of reach is enough to lose the title.
- Customers in Russian cities no longer get unhappy because of Goggle's throttling (#70). People there simply get, and ask for, half as much Goggle video, so a well-built network serves the whole city again and the throttled half no longer fills your links.
- Incidents now come first in the NOC, with the ones you can fix in one click at the top (#63). No more scrolling past hot ports and congested links to replace a broken optic.
- Opening a link from the NOC on mobile now closes the NOC sheet so the link details are visible.

## [1.27.0] — 2026-10-25

- New "Leased lines" tab in the NOC dashboard shows which leased waves, fabric circuits and dark fiber IRUs between your POPs you could replace with cheaper capacity: leased dark fiber, your own fiber or your own subsea cable. Each option lists the up-front cost, the monthly cost, how much you would save and when it pays for itself, with a button to plan the build.
- You can now upgrade, grow and cancel transit, PNIs, IX ports, cache boxes and fabric ports straight from the Connections tab of the NOC dashboard. Each row offers the next port size and another LAG member at the same prices as the POP panel, and cancelling asks you to confirm first.
- DKNOG in Copenhagen joins the conference calendar every March.
- A PNI in the customer’s city now meets their local-breakout requirement while your network is Tier 1 (#20).
- Customers no longer ask for independent routes where the available cables cannot provide them. Impossible diversity requirements in older saves are removed.
- A deal’s “Go there” button takes you to a required city without a POP, instead of returning to a city you already serve.

## [1.26.1] — 2026-10-25

- Subsea cables no longer disappear when you zoom in on the map (#49).

## [1.26.0] — 2026-10-25

- Customer levels now go up to 13 instead of 4. Every new level asks for more peak traffic, POPs and continents, ending at 50 Tbps and 80 POPs on six continents, and each one unlocks new customers, gear or deals. Reaching level 13 earns a new legendary badge.
- Seven new router models arrive between levels 5 and 13, including the first 3.2T routers with 3.2T ports and 12.8T waves. The Absolute Unit 3.2T is the main upgrade; whitebox, licensed, deep-buffer, Finnish and budget side-grades sit next to it.
- Paid-peering giants now give you a free PNI once you are big enough. Doitsche Telekomm gives in at level 6, then Voda-Phony, Tel-Mess, Etis-a-lot, China Moble, Du-opoly and Ooh-redoo.
- Loans got stranger, and good ones got harder to get. Your credit rating now adds a
  risk premium to the interest rate, the big banks only lend to strong ratings, and a
  loan worth more than five months of revenue also takes 2–8% of your revenue until
  it is repaid.
- Your own subsea cables now run much faster optics over long distances (#66). Subsea fiber is built for its whole route, so optics reach about half as far again as on land: Paris–Ashburn gets 1.2T per channel instead of 400G, and the 1.6T transponder gains a 1.2T long-haul setting on land too.
- Leased subsea waves now follow the same physics as your own cables (#68). A wave can only be as fast as its cable's length allows: transatlantic still takes 6.4T, the longest transpacific cables top out at 400G or 800G. Waves you already have keep running.
- You can lay your own subsea cable between two landing stations that also share a landmass, like Marseille–Singapore or Cairo–Palermo (#67).
- Declined PNI requests no longer repeat over and over behind an open window such as a DE-KICKS quote. Buttons hidden behind a window can no longer be pressed with the keyboard, and a declined PNI now shows why straight away instead of leaving its button there.
- New customers at the higher levels: esports world finals, sovereign cloud regions, cloud gaming platforms, metaverse platforms, AGI labs and Mars mission ground stations.
- Traffic keeps growing as you level up. Levels 5, 8, 10 and 12 each start a new era (4K everywhere, cloud gaming, VR, AI agents) that raises how many eyeballs every city wants.
- New optical gear for big networks: ROADMaster 9000 C+L line systems with 128 channels, Sienna WaveMagic 3.2T transponders, and eight fiber pairs in your own land trenches. Your own exchange gets a 102.4T fabric and scrubbing goes up to 100T.
- The "Next level" hint keeps names like Edge Lord 400 readable instead of lower-casing them.
- Your own subsea cable now runs beside the existing cable on its route instead of looping far out to sea (#64). Leased and own fiber next to a busy trench no longer swing out in giant loops either, on any route.
- New lenders: Ballooney Brothers (nothing to pay until it all comes due at once),
  Stormy Weather Lending (every open incident adds 2% to your rate), Peer Pressure
  Partners (you repay with 30% of your transit bill), Horoscope Holdings (the stars set
  your rate each month) and Papa Pizza Capital (cheap, but every incident means pizza
  for the NOC).
- New loan conditions: an odd number of POPs, no building in Bude, no diesel
  generators, no new links on a Friday, no Goggle caches, a job for the CEO's nephew
  and a yacht for the chairman.
- The in-app "What's new" is shorter: the first sentence of each change, at most
  five, with a link to the full release notes on GitHub.

## [1.25.2] — 2026-10-25

- Tier 1 networks can lay their own subsea cable (#22). Pick two cities with a
  cable landing station, pay a frankly rude amount of money, wait while a cable
  ship crosses the ocean, and own up to eight fiber pairs outright. It pays for
  itself in a few years if it replaces enough leased waves. Whales may cause
  delays.

## [1.25.1] — 2026-10-25

- Once you have half a billion in the bank, the banks stop sending loan offers
  (#52). They come back if your cash drops below that again.

## [1.25.0] — 2026-10-25

- Your own trench can carry more than one fiber pair (#35). Once a ROADMaster
  9000 has all 64 channels lit, light the next pair: another ROADMaster and
  another chain of amplifiers for 64 more channels, up to four pairs.

## [1.24.0] — 2026-10-25

- New scenario: Flood Season. Amsterdam in peak botnet season: a DDoS flood
  every few days, a third of them in the terabits and growing all year, on
  top of everything else that breaks. Hold 20 floods, 5 of them over 1 Tbps,
  with the city under attack still getting 97% of its traffic. Expect smart
  toasters, sentient fridges and one very determined printer.
- Fixed: when a DDoS attack started while another was still running, the
  first one ending could wipe out the new one early.

## [1.23.0] — 2026-10-25

- Fixed: on a phone, a first-time player could not get past the "Play it as an
  app" screen in the browser, and the Install button on the title screen did
  nothing. Settings now also opens from the title screen, as promised in 1.20.0.
- Taps land where you meant them (#44): a tap only presses the button it started
  on, nothing behind a menu that opened or closed mid-tap counts, a toast that
  pops up under your thumb ignores taps for half a second, and panels no longer
  redraw under your finger.
- The world map draws much lighter (#43). The detailed coastline is now painted
  once into an image and reused, also when zoomed in, instead of being redrawn
  every frame. This should fix the garbled map on Firefox for Android, and makes
  zooming smoother on every phone.
- Cairo now reaches the Middle East overland across the Sinai, like Istanbul
  does across the Bosporus (#47), at the same intercontinental price.
- The Tier 1 label shows what you are now (#46): buy transit again or lose a
  Tier 1 PNI and it drops, with a message saying why. Your Tier 1 badge stays.
- When an update adds new networks, you get a free 60-day courtesy route to
  the ones you cannot reach yet (#46), so your reach no longer drops overnight.
  Saves from before this version get it too.
- Unplugged optics go on a spares shelf instead of in the bin (#45): the next
  channel of that type uses a spare for free, or you can sell spares on eBuy
  for 40% of their price.

## [1.22.0] — 2026-10-25

- Scenarios show their goal and your progress at all times (#34): a card at the
  top of the Goals tab breaks the goal into steps with progress bars and shows the
  days left. The top bar on desktop, and the Goals tab on phones, show how far you
  are.
- Your customer level is always visible too: a card in the Goals tab shows what
  the next level unlocks and how close you are to it, and the Rank box shows
  your level.
- The NOC dashboard has tabs: Overview, Customers, Connections, Traffic and
  Links & routers, so you no longer scroll through everything at once.
- The share card draws links that cross the Pacific on both edges of the map
  (#42).

## [1.21.0] — 2026-10-25

- The world map now has real coastlines (#41, thanks @aulmaru). Greenland, the
  Arctic, Indonesia, the Philippines, Japan, Madagascar, Tasmania and New
  Zealand show up properly, and the Mediterranean, Black Sea, Red Sea, Gulf and
  Baltic have their real shapes. Zoomed out, the tiniest islands are left off so
  the map stays readable.

## [1.20.0] — 2026-10-25

- A proper Settings screen, from the menu or the title screen: alerts, animations,
  sound and language in one place, saved on your device.
- The game can pause when a customer turns furious, so you no longer lose
  customers to a notification you missed at 8× speed (#13). It is on by
  default and can be switched off in Settings, where you can also choose to
  pause on outages that cost you real traffic.
- Customer happiness is easier to keep an eye on (#15). You get an early warning
  when a customer drops below 60%, with the reason. A Customers box in the top bar
  (on phones, a red count on Deals) shows how happy they are overall.
- A Customers list in the NOC dashboard shows everyone who pays you, unhappiest
  first, with what they pay, whether they are getting happier or angrier, and
  exactly what is wrong. Filter it to the unhappy ones or by city, and tap Open
  to go to them (#14).

## [1.19.0] — 2026-10-25

- See all your connections in one place (#31, #33, #38): a new Connections list
  in the NOC dashboard shows every transit port, PNI, IX port, cache and fabric
  port, with where it is, how full it is and what it costs each month. Filter it
  by type, city or network, and tap Open to go straight to it. In the Networks
  tab, each network now shows where you connect to it, one tap away.
- On a phone, the game now explains why it is better installed as an app before
  you start a new network: full screen, offline, and on iPhone a save that
  Safari won't clear. It shows exactly how to add it to your home screen,
  and warns that on iPhone a game started in the browser stays there. You can
  still play in the browser.

## [1.18.4] — 2026-10-25

- The iPhone home-screen fix from 1.18.3 now stays in place. Before, it worked
  at launch and then the empty strip under the tab bar came back.

## [1.18.3] — 2026-10-25

- Installed on an iPhone home screen, the game now fills the whole screen. Before,
  the tab bar floated above an empty strip at the bottom.

## [1.18.2] — 2026-10-25

- A new legendary badge, A Petabit a Second, for serving a full petabit per
  second (a thousand terabits) of happy traffic.

## [1.18.1] — 2026-10-25

- New goal and badges for DDoS defence: a goal to stand up your first
  scrubbing center, and badges for weathering an attack, holding a
  multi-terabit flood, running a clean-pipe or a sacrificial PNI, blackholing
  your own city, and landing a HackBack that actually works.

## [1.18.0] — 2026-10-25

- Overland waves between continents (Europe to the Middle East and Asia) now cost
  45× the normal price, about ten times the subsea route or more, as in real life.
  Dark fiber pairs aren't sold on those routes at all (#40). Links you already
  lease keep their price.
- No more limit of four cache boxes per CDN in a POP: each box takes a router
  port, and free ports are now the only limit (#39).
- Scrubbing centers now come in tiers — 100G, 1T and 10T of clean bandwidth.
  A center cleans an attack only up to its capacity; a bigger flood leaks the
  rest past. Centers can run always-on, or cheaper on-demand, which takes a
  couple of days to engage once an attack starts.
- Transit clean-pipe add-on. Turn it on for a transit port and the provider
  scrubs a flood entering there before it ever reaches you, for a monthly fee
  per port.
- Sacrificial PNI. Mark a Chinese PNI as a deliberate choke point: a flood
  arriving over it dies on the small port instead of flooding your core, but
  legitimate traffic across it runs at half capacity.
- IX blackhole. A new mitigation on the live attack panel: announce the
  victim to the exchange and about half the members drop the junk — the
  customer stays up, unlike a full RTBH.
- Selling DDoS protection now carries an SLA: if a protected customer's city
  is hit and still goes down, you pay out an SLA credit and they get unhappy.

## [1.17.1] — 2026-10-25

- Flowspec is now a property of your router, not a licence you buy once. The
  drop rules live in hardware (TCAM), and the budget differs by model: the
  used Rusty Router can't do it at all, merchant-silicon and whitebox models
  filter a known flood part-way, and the big chassis knock it right down. The
  NOC shows how many of your POPs are Flowspec-capable, and the live attack
  panel names the router doing (or not doing) the filtering.

## [1.17.0] — 2026-10-25

- DDoS attacks now have a shape: a vector (DNS reflection, NTP or CLDAP
  amplification, SYN or HTTP flood), a size from a few Gbps up to a
  multi-terabit "botnet of toasters" monster, a target POP, a duration, and
  an entry point among that city's uplinks. Most are modest spikes; the big
  ones are rare.
- A DDoS toolbox in the NOC. A live attack panel shows the vector, size,
  entry and what each mitigation is doing right now:
  - **RTBH** — free and instant, but it blackholes the victim, so the
    attack and the customer both go dark. Earns the Collateral Damage badge.
  - **Flowspec** — a one-time licence that drops known UDP floods (DNS, NTP,
    CLDAP, SYN) at your edge. Precise, but useless against an HTTP flood, and
    the junk still fills the port it enters.
  - **Scrubbing center** — cleans attacks network-wide, as before, and still
    risks the GRE/MSS black hole.
  - **HackBack 3000™ by Skynot AI** — a tempting red button. Sometimes it
    ends the attack; more often it flattens an innocent and earns you a
    regulator fine and the Vigilante badge. Hack-back is illegal in reality.

## [1.16.0] — 2026-10-25

- Customers on interconnection fabrics. Companies already on Megapork,
  PocketFabric or Consolation Connect ask to buy transit from you over the
  fabric, or for a circuit from the fabric to one of your POPs. Both come in
  through your NNI port in that city, so you need a port there with room for
  them.

## [1.15.0] — 2026-10-25

- The map gets cleaner as you zoom out (#37): cities turn into dots, your POPs
  into small router pills, links get thinner, and only your own cities keep
  their labels. Up close, a POP shows your router instead of the skyline,
  and a city with a second building shows a small router B on its metro
  ring, so dual-site POPs stand out.
- Parallel waves on the same cable or in the same trench draw as one line
  with a combined label, like "8×6.4T · 7/8 up" (#19).
- Decommission POPs, one at a time or several at once, from the Infra tab.
  Everything in them goes, and customers who depended on them are let go
  with three months of their contract as an early-termination penalty.
- Dark fiber panels now list the other links between the two cities and can
  add a parallel link, like waves already could.
- NLNOG Day joins the conference calendar, in Amsterdam every September (#32).

## [1.14.0] — 2026-10-24

- More of Britain and Norway: Manchester, Edinburgh, the cable town of Bude
  in Cornwall, and Stavanger, with British and Norwegian eyeball networks
  (Bee-Tee, Sky-High Broadband, Virgin Mediocre, Tele-Nor-Way).
- Nine new cables: NO-UK-Way across the North Sea (with dark fiber for
  sale), Celtic Norsemen from Ireland to Norway, Havhingsten Hoofbeat from
  Blackpool to Denmark, the Shefa Sheep Line to Iceland via the Faroes, Oil
  Rig Wi-Fi from Stavanger to the Netherlands, Pas de Câble under the
  Channel, and Apollo 13, Yellow Brick Road and Glo-in-the-Dark into Bude.

## [1.13.2] — 2026-10-24

- On phones, the "new version is out" notice is a small card above the tab
  bar again instead of filling the whole screen.

## [1.13.1] — 2026-10-24

- New home-screen icons. On iPhone and on Android's round and squircle
  icons, the tube now sits on a full sky-blue background instead of a frame
  inside a frame.

## [1.13.0] — 2026-10-24

- Made for phones. A one-row status strip at the top, a tab bar at the
  bottom (play, speed, goals, deals, NOC, networks), and bottom sheets you
  drag up, down or away; on a phone held sideways they slide in from the
  side. Notifications tap away, dialogs open as sheets, and the start button
  stays in reach.
- Install it like an app: Series of Tubes now works offline and can be added
  to your home screen on Android and iOS (look for "Install" on the title
  screen or in Settings). It opens full screen and still updates itself.

## [1.12.0] — 2026-10-24

- Korea's "sender pays" market. Transit into Seoul costs four times the
  usual price, and the three incumbents, Kay-Tea, SK Broadbandit and LG
  You-Pay-Plus, only peer over paid PNIs billed per gigabit you send them.
  Glitch may quit Korea over the fees, Faceplant may quietly reroute Korean
  users via Hong Kong, and the new Gangnam Style Peering scenario starts you
  in Seoul. Collect all three PNIs for the Sender Pays badge.
- Sparkly Seabone is a Tier 1 now (#23), with a backbone across the
  Mediterranean, Europe and the Americas. New games need a PNI with all six
  Tier 1s to go transit-free; saves from before this release keep the five.
- Optical control plane meltdown: one bad update at your wave supplier, and
  every wave you lease from it in a region goes dark at once. Your own dark
  fiber carries on.
- New ways for things to go subtly wrong: LACP trouble (hash polarisation,
  timer mismatches, a member in the wrong switch, min-links set a little too
  keen), partial packet loss from dirty connectors, CRC errors and
  microbursts (deep-buffer routers shrug those off), and PMTUD black holes
  where pages to one network load halfway and stop.
- The top bar fits itself to the screen in every language: when labels get
  long, the less important readouts step aside instead of wrapping over the
  side panels.

- Series of Tubes now speaks Italian. The game follows your browser's
  language the first time, and you can switch between English and Italian
  under Settings or on the title screen; the choice is remembered (#26, thanks @daniloctdev).
- Want the real thing? The title screen, the help page and the victory screen
  now point to How the Internet Works by Thomas Kjær Aabo, an interactive,
  zoomable guide to how your packets actually travel.

## [1.11.0] — 2026-10-24

- Very long dark fiber works now (#17, #30). Optics drop to a slower, longer-
  reaching setting past their full-rate reach: the 1.6T transponder runs at
  800G to 7,000 km and 400G to 12,000 km, and ZR+ optics halve their speed
  to double their reach. Regeneration sites go further: each one turns the
  light back into bits and sends it on fresh, so optics only have to reach
  the next site. Existing long fibers light up without changes.
- "Quietest links" routing no longer flips between two paths every day. It
  judges how busy a link is without the customer's own traffic, splits the
  circuit over two paths that are about as quiet, and keeps yesterday's
  choice unless a new one is clearly better (#28).
- Fewer "-ish" names. Conferences and the RIPE NCC use their real names,
  data centers are named after their streets and districts, and cables,
  carriers and routers got proper puns instead (Concerto in Sea Minor,
  Circe du Soleil, Strait Outta Taipei, Jeddah-i Express, Kyiv Superstar,
  Du-opoly and friends).
- Customers who are afraid of sharks only ask for routes that can stay on
  land. No more Americas-to-Eurasia requests without a subsea cable, and
  impossible asks in existing saves are dropped (#16).
- The game no longer freezes when a peer drops you at a rival exchange
  (#24, thanks @daniloctdev), or when a route leak melts down one. The
  messages now name the exchange and its city.
- One failing day no longer freezes the whole game: the error is caught,
  you get a heads-up, and time keeps running.
- Barcelona joins the map with Catnip-IX, local transit and peering, and the
  Medusa Stare cable along the coast to Lisbon and Marseille (#18, thanks
  @NickBouwhuis).
- Community exchanges: FRIES-IX, Paella-NIX, KleyWrecks, LO-NAPS, JINXED-IX,
  IX Strayla and Bento-IX have their own, smaller member lists and cheaper
  ports. FRIES-IX 10G and 100G ports and LAG members are free.
- New networks get a random name, from Shinternet to Bogon Voyage. Click
  "Another one" for more questionable branding, or type your own (#27,
  thanks @NickBouwhuis).

## [1.10.0] — 2026-10-24

- Router ports are finite. Every transit, IX, PNI and cache port, every wave
  and every fibre channel takes a router port; 10G ports ride a breakout,
  four to a port. The Infra tab shows how many are left, and plugging in more
  than you have is refused.
- More routers: up to six per POP, and six new models to swap in from the
  Infra tab: Mikrowtik CCR-ish, Sonic the Whitebox 32 (cheap, crashes more),
  Arrrhipster 7280R-ish and 7800R-ish (lots of ports, deep buffers, boots in
  minutes), Disco 8K-ish (licence keys for everything) and Knockia 7750-ish.
  A swap that would not fit what is already plugged in is refused.
- New cities: Milan, Rome, Palermo, Lisbon and Athens in Europe; Atlanta,
  Denver, Phoenix, Boston, Houston and Salt Lake City in the US. New cables
  land with them (Lisbon to Brazil, Africa and the US Southeast; Genoa to
  Sicily and Athens; Palermo to Marseille and Alexandria; Athens to Istanbul;
  Boston to Dublin), along with local networks to peer with.
- Rival exchanges: 25 big metros now have a second (sometimes third) IX.
  Challengers are cheaper and share many members with the incumbent, but not
  all of them. Each IX is its own port, LAG and route server.
- The long tail: 60 small, odd networks with a sliver of traffic each, spread
  over random exchanges. "Request all willing peers" signs them up in one go,
  and they fold into one row in the network lists.
- Europe's peering market is competitive: IX ports there cost 20% less, and
  price wars between rival exchanges cut your port bill further. DE-KICKS
  responds with a webinar.
- Voda-Phony has ended settlement-free peering. It now peers only over a paid
  PNI, through its interconnection partner.
- New US eyeballs Spectre-um Cable and Very-Zone (paid peering only).
- Pausing now freezes the map too: packet dots, waves and clouds stop
  moving until you press play again (#11).
- Ports in both buildings: with a second site, any transit port, PNI or IX
  port can now be set to "Both". That splits it into a LAG with members in
  each building (adding a member if needed), so a dark building only takes
  out half the port instead of all of it (#8).
- The top bar no longer wraps onto a second row and covers the side panels
  on laptop-sized screens.
- Routers make sense now: the Chonk 800 takes 800G waves and ports (a new
  800G wave sits between 400G and 1.6T), and only the Absolute Unit has 1.6T
  ports and takes 6.4T waves, handed off as 4×1.6T. Existing waves keep
  their size.
- London–Amsterdam is everywhere: three more cheap North Sea cables, and dark
  fiber you can lease on them (and on the Channel), since you can't dig under
  the sea.
- Your own IX can grow (#10): upgrade its fabric from 400G to 1.6T, 6.4T and
  25.6T. Bigger fabrics carry more and have room for more members.
- Wave prices follow real markets: Europe is cheap, North America average,
  Asia and South America pricier, and anything into Africa several times the
  price. Every route has its own going rate, and new leases get about 8%
  cheaper each year. The link planner tells you how a route compares.
- Cairo–Dubai over the Red Sea, plus I-ME-WE-Us to Fujairah and Mumbai.
- The Gulf: Jeddah, Riyadh and Doha. Saudi POPs need a local telecom licence,
  gigaprojects want enormous demo networks, and now and then the neighbours
  fall out and every link between Qatar and Saudi Arabia or the UAE goes dark
  for months. Qatar is on the map as a peninsula now, too.
- Tablets in landscape: slimmer side panels, bigger touch targets, and the
  left panel tucks away while a city is open (tap "Goals & NOC" to bring it
  back).

## [1.9.0] — 2026-10-23

- RouteScript: program your Auto-TE controller from the NOC tab with a tiny
  rule language: `spill at 80%`, `prefer pni for goggle`, `avoid transit for
  netchill`, `cap transit cogentle at 20 gbps`, `drain paris`, `avoid link
  fra-ams` and `blackhole ddos`. Check runs a dry run against live traffic
  and shows what would change; Deploy makes it real. Typos get a "did you
  mean". Two new badges: Script Kiddie and Fat Finger.
- Zoom in twice as far as before, handy for crowded spots like the UAE,
  Singapore or Central Europe.
- Half speed: a new ½× button, or press 0.
- NOC dashboard: a legend explains the colours in "How it arrives", the
  network table sorts by any column (traffic, transit cost, loss, name), and a
  new "Who your transit carries" list shows the networks you pay transit to
  reach, with the cheapest way to move each one to peering (#7).
- The Transit tab shows the top destinations on each transit port, with the
  same hint, so you can see who to peer with in that city (#7).
- A full code review, and about 40 fixes from it:
  - Saves and imported files are checked and repaired before use, so a
    damaged or hand-edited save can no longer break the game or inject
    anything into the page.
  - Loophole fixes: flipping crypto loans for profit, free repairs of
    geopolitical cable cuts, re-rolling DE-KICKS quotes, walking out of a
    failing event, and selling the same trench twice.
  - The Red Sea scenario really cuts the Red Sea now, the weekly challenge
    gives everyone the same world, and its "pricey" and "poor" twists work.
  - China Telecomet and China Unicorn no longer act like Tier 1s.
  - Metro ring cuts now alert you, overlapping site outages no longer cancel
    each other, and alien waves work on unlit fiber.
  - Routing is several times faster on big networks.
  - The map fills wide screens at any zoom, pinch zoom goes as far as the
    mouse wheel, and touch scrolling and cancelled touches behave.
  - Starting a scenario from a running game asks first, and Space no longer
    pauses when you meant to press a button.
- Settings for animations and sound, in the menu and on the help screen.
  Animations can follow your device's reduce-motion setting (the default),
  or be forced on or off. Off freezes the map: no moving packets, pulses or
  floating text.

## [1.8.0] — 2026-10-23

- Traceroute and looking glass: tap 🔍 Traceroute on any of your cities, or
  open it from the NOC tab. See the exact path to any network or POP, hop by
  hop, with latency, the exit it leaves through and the AS path, plus why
  that exit won.
- Share card: an image of your network with a mini map, your stats and your
  rarest badges, ready to post. Find it in the menu, after winning and after
  a scenario.
- Scenarios: six hand-built challenges with a goal and a deadline (Only
  Spätzle-IX, Red Sea Crisis, The Cogentle Spat, Carnaval, Mind the Gap and
  Anchors Away), plus a weekly challenge where everyone gets the same world,
  the same start city and the same two twists for a week.
- Sandbox mode: a billion dollars, every unlock and nothing ever breaks.
  No badges, though.
- Conference season: NANOG-ish, RIPE-ish, DENOG-ish, APRICOT-ish and more
  come round every year. Register in the Deals tab and selective networks in
  that region need half the usual traffic to peer with you for 45 days.
- A guided first game for new players, step by step, with a skip button.
- Kyiv, with Varenyky-IX and KyivStar-ish. Blackouts are frequent, so bring
  a generator. Nobody sells capacity between Kyiv and Moscow.
- 7 more badges for scenarios, the weekly challenge and conferences.

## [1.7.0] — 2026-10-23

- Auto-TE: from customer level 3 you can install a traffic-engineering
  controller in the NOC tab. When the shortest path is full, the overflow
  spills onto up to two alternate paths with free capacity instead of being
  dropped. Without it, traffic still reroutes around failures, but a full
  link stays full, just like a real IGP.
- 16 more badges, mostly rare, epic and legendary: Traffic Whisperer, Same
  Street, Anchors Aweigh, Samba Peering, DE-KICKS Bingo, Ring of Fire, Iron
  Curtain Call, Island Hopper, Through the Wall, Darwin Award, Unbreakable,
  Gigawatt Landlord, Blitz, Hundred Terabits and a few more, one of them
  secret. That makes 46.

## [1.6.0] — 2026-10-23

- South America is on the map properly: Fortaleza, Rio de Janeiro, Buenos
  Aires, Santiago, Lima, Bogotá and Panama City, with new cables including a
  ring round Cape Horn, a direct São Paulo–New York cable and the first
  cable from Chile to Sydney. Nothing crosses the Darién Gap by land, transit
  is pricier because so much traffic hairpins through Miami, and fiber over
  the Andes costs double and breaks often. IX.brrr is run by a nonprofit
  with cheap public prices, and small Brazilian provedores now buy transit
  from you.
- More India: Delhi, Chennai, Bengaluru and Hyderabad, with east-coast cables
  to Singapore and a lot of road widening.
- Taiwan: Taipei, with cables to Tokyo, Hong Kong, Los Angeles, Seattle and
  Shanghai, and ships that keep dragging their anchors over them.
- The UAE: Abu Dhabi and Fujairah join Dubai. Only the licensed duopoly may
  run fiber inside the country, so there is no dark fiber, waves cost 3×, and
  POPs need a free-zone license. Most cables land in Fujairah.
- Cape Town, with Atlantic cables up the west coast of Africa and load
  shedding: bring a generator.
- New local networks: Clarovision, Vivo-ish, Mercado Livre-ly, Jio-graphy,
  Airtel-tale, Chunghwa Tele-calm and do-ish.
- Metro diversity: add a second data center in any POP's metro from the
  Infra tab, joined by your own metro ring. A power cut, cleaner or A/C
  failure then only takes out half the city. You choose which site each
  transit, PNI and IX port plugs into, and metro ring cuts can cut site B
  off. Some hyperscaler and AI customers now insist on two sites.
- More Asia-Pacific: Melbourne, Brisbane, Darwin, Osaka, Kuala Lumpur,
  Bangkok, Ho Chi Minh City, Karachi, Dhaka and Colombo, with cables to match.
  Vietnam's cables break a lot, and Darwin has crocodiles.
- Central and Eastern Europe: Warsaw, Prague, Vienna, Budapest, Bucharest,
  Tallinn and Istanbul. Baltic cables meet a lot of anchors.
- The giants: at customer levels 3 and 4, hyperscalers and AI clouds bring
  deals only they would ask for. Terabit AI WANs between gigawatt campuses,
  training runs spread over three or four sites, week-long dataset ingests,
  and hundreds of fiber pairs in a trench you dug yourself. Their campuses,
  from Star-Gait Abilene to the Johor-ish Overflow, show up in each city's
  "Who's here".
- Dark fiber pairs you lease out now earn even before you light your own
  channels on that fiber.
- More local networks: KD-DIY, Opt-Out-Us, Mostly-True Move, Viet-tell,
  PTC-hell, Telekom Ma-lazy-sia, Türk Tele-komik, Digi-tally Cheap and
  UPC-You-Later.
- Badges: 30 achievements from common to legendary, shown under your goals.
  Some take luck (Shark Bait), some take years (Five Nines, Speedrun), and a
  couple are secret. Badges from earlier games stay on this device in a hall
  of fame.
- Five new goals between Tier 2 and Tier 1: light your own dark fiber, be in
  two buildings at once, five continents, sign a giant, and serve 10 Tbps.
- Tap your network's name in the top left for a menu to export or import a
  save, or start a new network.

## [1.5.0] — 2026-10-23

- Several transits in the same city now share the load instead of filling one
  after the other. The same goes for any exits that are equally close: traffic
  is spread by free capacity, and local exits still win over far ones (#4).
- Export your save to a file and import it on another device, from the help
  screen or the title screen (#5).
- Full transit ports, IX ports, PNIs, caches and routers are now easy to spot.
  They get red badges on the map (T, P, C, R), the IX hexagon blinks red when
  its port is full, and the NOC lists everything running hot with a hint on
  what to do (#6).
- Some routers take forever to boot. The Infra tab shows each chassis's boot
  time and its forwarding chip, including the Junipurr PacketOinker™ in the
  Chonk 800 and two of them in the Absolute Unit. On a slow booter, crashes
  last a few days longer, a rush repair still needs a day of booting, and
  swapping the only router takes three days. Bigger chassis are slow more
  often. A second router hides all of it.

## [1.4.0] — 2026-10-23

- Big peers have moods now. In some cities, large selective networks refuse
  new peering for a few months, or only take PNIs there, each with a reason
  ("the peering coordinator is on sabbatical", "a new VP wants to monetise
  interconnection"). Now and then they also tear down a session you already
  had, and traffic falls back to your next best path. Try another city or a
  PNI, and ask again later.
- Remote peering is still on offer, but it is now a last resort. Ports come
  through a reseller at 1.5× the price and only 80% of the port is really
  yours. Goggle, Faceplant, Comecast and several other selective networks
  refuse remote members outright. The route server still gets you every open
  network, and building a real POP removes all of this.
- DE-KICKS Group (Frankfurt, Madrid, Marseille, Dubai, Mumbai and New York)
  really hates open pricing. There is no price list, only a personalised
  quote that grows with how big you look. Haggling can get you a discount,
  raise the price "after consulting with management", or stall for a week
  behind an NDA. Prices are "harmonised" upwards once a year. Add-ons like
  Route Server Gold and Premium Port LEDs appear on your invoice until you opt
  out, which takes two clicks. Trying to leave gets you a retention discount
  that ends with a loyalty fee.

## [1.3.0] — 2026-10-23

- Event networks: festivals, trade fairs and big games book a fat temporary
  pipe in a city weeks ahead. Nothing is paid up front; deliver the bandwidth
  for the whole event and you get the full fee, fall short and the organisers
  pay less, fail badly and you pay them.
- SD-WAN for chains: kebab empires, coffee franchises and furniture giants
  want every shop wired back to their head office. Each site needs a path to
  the hub, and one dead spoke takes the whole contract down until it is fixed.
- Wholesale waves: once you light your own dark fiber, other carriers ask to
  rent spare spectrum on it as alien waves. Every slot you sell is one fewer
  channel for you.
- Dark fiber pair leases: fiber you built yourself can be leased out pair by
  pair to others for steady monthly money.

## [1.2.0] — 2026-10-23

- A bank: tap your cash to open it. Lenders (Goldman Sacks, Deutsche Bankrupt,
  Spätzle-Sparkasse, the Ministry of Tubes, Crypto Bros Capital, Venture
  Vultures, the Loan Shark and more) make offers with odd conditions. Offers
  come faster when you are in the red, so a bad hour no longer has to end in
  bankruptcy. Credit ratings, penalties for broken conditions, early repayment.
- Your game now saves every few seconds and whenever you leave the page, and a
  reload drops you straight back into your network.
- Release announcements: a "What's new" card after an update, and a banner with
  a one-click reload when a new version comes out while you are playing.
- Start a new network any time from the help screen.

## [1.1.0] — 2026-10-23

- Stuttgart, home of the Spätzle-IX.

## [1.0.0] — 2026-10-23

First public release.

- Cartoon world map with real-ish geography, magnified Europe and East Asia,
  about 50 cities and around 40 named subsea cable systems.
- POPs, home broadband, business customers with escalating customer levels
  (up to AI training interconnects and hyperscaler DCI) and quirky requirements.
- IP transit on 95th-percentile billing, IXs with route servers, peering
  policies, PNIs, embedded caches, NNI fabrics and remote peering.
- Leased waves, parallel links in shared or diverse trenches, dark fiber
  (lease or build) with DWDM line systems, amplifiers and ZR+/transponder optics.
- Router generations from 100G to 1.6T ports, extra routers and generators for
  redundancy.
- LAGs: bundle up to 8 identical ports to the same transit provider, IX or PNI.
- Traffic engineering: per-link traffic breakdown, link metrics, egress
  preferences, latency-aware and scenic routing.
- Mainland China (licenses, the Great Firewall, premium routes via Hong Kong),
  Russia (government boxes, throttling, sovereign internet drills) and an
  underserved Asian market.
- Dozens of failure types and geopolitical events, a NOC with an event log, and
  a NOC dashboard with traffic, money and per-ASN graphs.
- Cookieless Ridiculytics analytics on the live site only.
