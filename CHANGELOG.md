# Changelog

All notable changes to this project are documented here. The project follows
[Semantic Versioning](https://semver.org/). Each release is deployed to
[seriesoftub.es](https://seriesoftub.es).

## [Unreleased]

- Pie Control's Dishes tab is sorted by country: each one shows its landing rights, every POP with or without a pie dish and its antennas, with filters by region, by dish and by rights that end within a year, and sorting by country, antennas, load, rights or POPs still without a dish. A globe beside the list shows your dishes and the POPs that could take one, with the satellites hidden if you like; tap a city on it to find it in the list. Landing rights can be bought 1, 5 or 10 years ahead, for one country or every country at once, and antennas and dishes can be added in bulk.
- Rocket companies can grow: the pie factory takes up to six production lines (which can be closed again), and a launch pad up to three towers that each fly their own rocket. A new toggle queues one launch per free tower in a single tap, and the pad picker shows coastal POPs as cards, nearest the equator first, with their latitude, launch discount and the orbits each one reaches.
- Pie Control is wider and laid out like the NOC dashboard, with one tab per thing you run: an overview, bottlenecks, crusts (pies, lasers, wear, traffic and launches), dishes (by country or by load), customers and the company (factory, research, pads, books).
- Orbit customers have their own tab in Pie Control: tap one and the globe turns to its link while the other satellites fade.
- The launch options are explained and now stay set in your save: insurance and launching from every pad. Each rocket is described in plain words, and each crust says how many more pies it can take, how many have lasers and how many wear out within a year.
- Lasers are now research: once done, every pie you launch has them, and launches past a crust's size replace its pies without lasers. Games that already flew lasered pies keep the research.
- Two new research projects move pie dishes to the V band and then the E band, doubling and doubling again what each antenna carries; the dishes are upgraded antenna by antenna, and rain hurts higher bands more.
- Launch pads can be demolished, for a quarter of what they and their towers cost, to build somewhere better.
- A new Bottlenecks tab lists everything that is full in orbit, with the button that fixes it: a full dish, a crust that needs more pies or another crust, fiber where orbit traffic gets stuck, customers with no dish in reach. You can filter it by kind and sort it, and a greyed button says why underneath.

## [4.1.3] — 2026-11-14

- Joining a Multimode server no longer costs you Tier 1, and with it Pie in the Sky: other players' networks, including players who are Tier 1 themselves, no longer count towards the reach Tier 1 needs. The same goes for your customers and offers, which need 99% reach: other players you cannot reach no longer take it from you.
- Multimode has a third server to play on: (BE) UNITIX - AS211184, in English, joins the server list (#364).
- A Multimode server that shuts down now waits for its sessions with other servers and its first server-list download to end, instead of leaving them running behind it.

## [4.1.2] — 2026-11-14

- Multimode servers and games now accept traffic figures above 1 Pbps, the first step to ranking the biggest networks properly: today everyone past 1 Pbps shows exactly 1.00 Pbps on the leaderboards. Games keep reporting at most 1 Pbps until servers have updated; a later version lifts that.

## [4.1.1] — 2026-11-14

- Multimode has a second server to play on: charon.clucas.fr, in English and French, joins the server list (#361).
- The relay downloads for OpenBSD and NetBSD are back: 4.1.0 could not be built for them. On those systems the relay does not watch free disk space.

## [4.1.0] — 2026-11-14

- Exchanges you found grow with other players: every player with a port on yours is listed as a member and draws computer-run networks in faster, Multimode lists the exchanges players run and where a port would save you transit, and suggests founding one where two or more players already are. On up-to-date servers a port on a player's exchange also reaches every network on it, and you can invite up to two players to co-found an exchange: they pay their share of its cost, get a port and earn their share of the members' fees.
- The NOC dashboard has separate Links and Routers tabs that list every link and every POP, sorted by load, capacity or name and filtered by load, by city, or by kind of link: leased waves, IRU dark fiber, or fiber you built over land or under the sea. A link's row shows what is used and, on dark fiber, how many channels are lit, sold as alien waves or free and what is sold as managed waves, with buttons to add or remove optics, light another fiber pair or order a bigger wave. The Routers tab shows Your AS first, then a table of every POP's router type and count, capacity, forwarding load, router ports and Flowspec rules in use, filtered by region, city or Flowspec and sorted from its header, with buttons to add a router or swap to the next model as the NOC intern would. Tapping a row picks it in the side panel behind the dashboard, so a stray tap never leaves the NOC (#354).
- Multimode shows who is worth peering with: the players you reach over transit, what peering would save on your transit bill and where you can meet them, in the Multimode sheet and the NOC dashboard. Once you peer with a player directly, your customers send each other more traffic, up to twice as much after 30 days, and it works the same way in their game.
- Once you sell managed waves on a dark fiber, its panel shows what your traffic uses, how much is left for it and everything the fiber lights (#357).
- A wave into mainland China now says in its panel whether it is a premium or a regular border crossing, and how much it loses at the border. Premium ones are tagged in the city's list of links and among the other links in a link's panel (#358).
- Your running Multimode deals no longer end because someone floods the game with thousands of new networks: the players you deal with, wait on or pinned always stay in your game, and a deal only ends for silence when that player has really gone quiet.
- Only the player a Multimode deal is with can renew it: someone else can no longer book a "renewal" of your deal and block the real one.
- Transit you sell to another player is billed on what your network can really carry: a buyer can no longer commit to far more than your rate card offers or report traffic that inflates your books, and saves holding such deals are corrected when they load.
- A Multimode network's founding day can no longer change once it is announced: games and servers ignore an announce that claims another one, so nobody gets the newcomer price by pretending to be new.
- One player can no longer fill your list of open consortium projects or your review queue: each player keeps at most two open projects and four waiting requests there, and your other players' requests stay.
- The shared route leak of the day is picked only among networks that have been around for at least 30 days, in a way no one can arrange in advance, and co-founding offers must use the listed shares and terms.
- The customer cone check of a Multimode leaderboard row is many times faster on big federations.
- In Multimode, look-alike names are easier to tell apart: networks and servers whose names read the same are marked "same name as…", every ASN on the boards, in the looking glass and in deal sheets comes with a short key fingerprint, and hidden characters no longer show in any name or server description.
- In the Multimode looking glass, an AI-played network now shows as an AI player instead of "undefined · undefined".
- In Multimode a server can no longer keep your game busy checking signatures without end: each connection gets a generous budget per minute, and a server that asks for more is left alone for a while.
- In Multimode, error messages from a server are shown only as the short codes the game knows; anything else shows as an unknown error.
- In Multimode your game trusts a server's name only after one of its nodes proved who it is, so a node pretending to be another server can no longer put an update notice, errors or an excluded list under that server's name, or send your game to that server's other nodes.
- Your game now only proves your network to a Multimode server at the address that server really lists, and drops a server that floods it with more updates than it can handle instead of slowing down or running out of memory.
- When your game proves your network to an up-to-date Multimode server, the proof now only works on that connection to that server, so no other server can reuse it. Server operators can refuse the older kind of proof with the new `legacyAuth` setting; it stays allowed for now so older games keep working.
- Multimode games and servers now refuse a handful of malformed network keys that could let anyone sign in that network's name.
- Multimode games refuse deal offers that carry hidden fields meant to slip past their checks.
- Sealed Multimode deals are now padded, so the servers carrying them can no longer guess what kind of deal it is from its size; older games still open them.
- A network moved to another device with its Multimode file now arrives offline: the import names the servers it played on, and you join them again from Multimode, so a file or link from someone else can never connect your game to servers you did not choose.
- Multimode servers can no longer point your game at addresses inside your own network: other nodes a server lists, and servers you only heard of from other servers, are only dialled at public addresses, unless you joined a server on your local network yourself, so LAN parties work as before.
- The privacy page and the in-game privacy sheet now list everything Multimode sends: the traffic you exchange with each player's network, your traffic mix, the game day and the day you joined, your Tier 1 or Tier 2 standing, the AI model when an agent plays, and that reports you send go to the server's operators. They also say that Share my country is on until you turn it off.
- Other players' network names in Multimode now show without hidden characters: invisible marks that could reorder or disguise a name are removed.
- When the game's server list is not there yet, Play with others now suggests the game's own first server rather than one it only heard about from other servers.
- The game page's security policy is tighter: besides scripts and connections it now also limits where styles, fonts and images may come from, and allows no frames and no form submissions.
- The game page now has a Content Security Policy: only its own code, its dictionaries and the visit counter may run, and it may only connect to the site itself, Multimode servers and the counter, which keeps your Multimode key out of reach of anything slipped into the page.
- In Multimode your game keeps a smaller list of the servers it hears about and reads it again only when it changes, which keeps busy sessions smooth, and only the servers you joined can hide other players' names in your game.
- Multimode servers can now carry the member lists of players' exchanges and co-founding offers, to the games and servers that understand them only, so older servers and games keep working; servers should upgrade before players can use them.
- The relay's test-only setting for trusting a test certificate no longer also lets it dial internal addresses; that now takes its own test-only setting, with a warning at start. Replacing a registry file over a damaged one reports an error instead of crashing.
- Multimode servers count new networks from an IPv6 site by its larger address blocks too, as they already did for connections, and never let data through uncounted when they are very busy.
- Multimode servers no longer write whatever error text another server sends into their log at full length.
- Multimode servers also refuse to dial other servers at IPv6 addresses that lead to an internal IPv4 address.
- Multimode servers keep connection slots for the servers in the public list: servers that are not listed, and any one address, can only take a few of them.
- Multimode server operators can now see how many games still sign in the older way (a new metric and an hourly log line), to know when the older way can be switched off; a configuration reload no longer races with players' connections.
- Reports to a Multimode server's operators can no longer be crowded out by newly made networks: room is kept for players the server has known for a while, and reports are also limited per address.
- Multimode servers answer another server's request for their whole inventory once per connection, so it cannot be repeated to keep a server busy.
- Multimode servers keep room in their list of other servers for the servers in the public list: made-up servers can no longer fill it.
- Multimode servers no longer let anyone pass as a node of a server that is in the public list or is known to be up to date. Servers in the public list must run this version to keep syncing with up-to-date servers.
- Multimode servers no longer refuse a neighbour's own players because of what that neighbour passed on from elsewhere: servers outside the public list share one budget, and records held back by a budget are fetched again once it refills.
- Multimode servers keep the moderation lists only of their own server and of servers in the public list, one per server, and count them like other new data, so made-up servers can no longer fill other servers' memory with them.
- Multimode servers can no longer be filled up by someone making new networks by the thousand: new networks and the data they bring are counted per connection, address and server each hour, and a nearly full server keeps serving the players it knows. The defaults leave plenty of room for players running many games or AI agents at once.
- The live boards of "now" keep their places for real players: when they are full, networks that were made up and never announced make way first.
- A Multimode server sends each new record to a game once, even if the game follows it more than once.
- Multimode servers bound the list of other servers they learn from each other by size, not only by count, and send it to a new neighbour a piece at a time, so one server with oversized entries can no longer stop servers from syncing. They also no longer pass the same server's entry on again and again when it is replayed to them.
- Multimode servers check more carefully that the other servers and nodes they sync with are who they say they are. Every node of one server must run this version together: an upgraded node no longer syncs with a sibling that has not been upgraded, while syncing with other servers keeps working.
- The Multimode server list only accepts a change to a listed server that moves it forward: an older signed copy of its entry, from before an operator or node was removed, can no longer be put back.
- Multimode servers and games keep the operator history they already know for each server: a key that used to run a server can no longer rewrite that history to add nodes of its own, and the server list shows the newest description from its current operators.
- Multimode servers now only take a server's description (its name, sync policy and logging promise) from its current operators: a key that was removed from a server can no longer sign one that replaces the real one.
- Multimode leaderboards only take the time a record arrived from servers in the public list or the server that received it, and never a time before the record was made, so nobody can place stats in the past or push other players off the boards.
- Server names in the public Multimode list now use plain letters, digits and simple punctuation only, so no server can be listed under a look-alike of another's name.
- Multimode servers now ignore stray files in their data folder whose names are not a day, instead of reading them as a wrong day, and refuse to store a record under a day out of range.
- Multimode servers no longer follow redirects when they connect to other servers, and connect to servers they learned of from the registry only on public internet addresses, never on addresses inside the operator's own network.
- A Multimode server started with `relay up` (the container default) now restarts without its operator key in the data folder, so operators can keep that key only on their own computer, as the hosting guide now recommends.
- `relay lan` really contacts nothing on the internet now: a relay without a registry no longer checks GitHub for new releases.
- `relay lan` now answers only devices on the local network, even where the machine also has a public address.
- `relay backup` always writes a fresh file readable only by the relay's user, and backups kept in the data folder (in its new `backups/` folder) are no longer copied into later backups.
- The relay's container image no longer turns on metrics for every network by itself: the Compose file that wants them sets them, and the hosting guide warns that ports Docker publishes get past the host's firewall.
- The relay's Compose file now runs a pinned relay version by default (following every release is opt-in), drops the privileges its containers do not need, and published container images come with signed build provenance.
- On Windows, the relay now warns at start when its data folder is outside your user profile, where other users of the machine may be able to read its keys.
- Multimode servers no longer turn away players and AI agents that connect in large numbers from one address: a hundred at once are fine by default, while one address can no longer take all of a server's connections. Server operators can tune the new limits (`openPerAddr`, `connBurst`, `connsPerSec`); older config files keep working.
- Multimode servers close idle web connections after a minute and only accept connections from the game's own pages, pages on your own machine or LAN, and apps and agents, so other websites cannot make their visitors' browsers use up a server's connections.
- AI agents playing through the MCP server are now told about every piece of text other players or server operators wrote in a tool result (names, server descriptions, AI setup names, server error codes), in every kind of result and also before joining.
- For developers: the agent relay of `npm run dev`, which lets AI agents play in your browser tab, now needs a key made for each run, which the dev page and the MCP server pick up on their own, and `npm run dev -- --https` stays on your own machine unless you add `--host`.
- For developers: the certificate authority `npm run dev -- --https` asks a phone to trust can now only vouch for local names and private addresses, and lasts 180 days; an older one is replaced on the next start, so trust the new one on your phone once more.

## [4.0.0] — 2026-11-13

- New Multimode: play alongside other players on servers that players run themselves. Switch on Play with others when you start a new game from the title screen, or join later from Multimode in the menu or in Settings. Other players' networks then show up in your game as places your customers want to reach. Multimode is per save and entirely optional, nothing changes for a save that never joins, and if a server is down your game simply plays on. How to play has a new page that explains it all.
- In Multimode you can do business with other players: peering, transit, PNIs, exchange ports, waves, capacity swaps and consortium cables. You can peer at exchanges where they are listed, and buy waves on fiber they have lit. Every network publishes its peering policy, conditions and prices, and requests that meet them are accepted even while the other player is away. Deals are private between the two players: they travel sealed, so the servers carrying them cannot read them. Newcomers buy at 25% off for their first 30 days, and an established network earns a one-off mentor bonus when a newcomer it does business with grows.
- Multimode leaderboards show where you stand right now: traffic with other players, total traffic, POPs, pies in the sky and customer cone, updated every 30 seconds. A 🏆 in the top bar shows your rank and opens them, and they fit a phone without scrolling sideways. Switch to the 95th percentile over the last 24 hours, the way transit is billed, or to growth; boards never show money. Your server ranks them and your game spot-checks a row now and then against what players signed. Humans and AI players rank together or apart, and every board can be filtered by region, home market, network age, peering policy and more.
- Server operators can hide a network on their server and vote to exclude it from Multimode everywhere. Votes stay between operators: other players only see which networks are excluded, and an excluded player sees why, then plays on solo. Any player can report a network to their server's operators, and mute a network in their own game.
- Anyone can run a Multimode server: a small program with its own documentation, listed in the game by a pull request to the repository. The first one, SeriesOfTubes Server 1, is open now. Servers tell their operators when an update is out. They never keep players' IP addresses or any location finer than a country, and sharing your country can be switched off. A new privacy page, in Settings and on the website, says exactly what the game keeps and sends.
- A flood now goes to your nearest scrubbing center first, and only what it cannot clean spills to the next nearest. Floods used to be shared between all your centers by size, so even with a center in the same city, part of every attack crossed the ocean and back and annoyed your DDoS protection customers (#345).

## [3.5.0] — 2026-11-11

- Alien waves you list on a fiber yourself now stay listed. With the capacity market selling for you, the broker used to cut your listing down to what its settings allowed the next day, or take it off altogether when the route's demand was below your minimum. Your own listing now stays put, and the broker adds what its settings allow on top (#340).
- The Connections list in the NOC dashboard no longer stays blank when you sort it by load or show only NNI ports while a fabric port runs at 400G. A 400G fabric port is the fastest there is, so the list now offers it one more LAG member instead of a faster port that does not exist. (#342)
- You can now start a link by typing where it goes: open one of your POPs, go to Infra and tap Link to a city, then type a city, country or exchange and pick it. You get the same link window as dragging between the two on the map, which is much easier on a crowded phone screen (#343).
- The Connections tab of the NOC dashboard can now shrink connections as well as grow them. Next to the upgrades, transit ports, PNIs and exchange ports get a downgrade to the next smaller port and a button to drop one LAG member, and a PNI that is still on order can be chased from the list, just like from the POP panel (#336).
- Once you have made Tier 1, conferences stop sending notifications. No more 30-day reminders, reports from the hallway track or notes from your sales engineer about bookings; you can still register and sponsor from the Deals tab, and everything a conference does works as before (#101).

## [3.4.0] — 2026-11-10

- A PNI can now grow past eight ports: each router at the POP takes eight members of a PNI, up to 32, so a busier interconnect costs another router and its ports. Saves keep every LAG they have, and a router a PNI still needs stays until the PNI shrinks (#323).
- Your traffic to home internet providers now starts where their customers live: a New York POP talks a lot to Comecast and little to Doitsche Telekomm, Frankfurt the other way round. Peering with a big eyeball network in the cities its users are in now takes that traffic off your backbone, while peering in only two cities means hauling it there from everywhere else (#48).
- Giant AI circuits now come from campuses in more than 30 metros, from Oregon and Wyoming to Atlanta, Querétaro and Québec, and less often from cities already crowded with them. Ashburn stays a little busier than the rest, but no longer has to carry the whole late game with four other cities (#61).
- RouteScript can spill early onto detours within a latency budget: `spill at 80% within 10 ms` keeps a hot link at 80% and moves the rest onto the fastest detour that adds at most 10 ms and is itself under 80%. Stack them (`spill at 90% within 20 ms`) to spill further as links get hotter (#136).
- You can now send a network to another device straight from the game: open the menu, pick Send to another device, and send the save file with AirDrop, Quick Share, a chat with yourself or email, then open it there with Import a save. You can also copy a link that carries the whole network and paste it on the other device under From another device. Nothing is uploaded anywhere (#263).
- From customer level 7, low-latency wholesale routes call: 1.6 or 3.2 Tbps between two of your cities with a strict latency limit, paying about three times what a hyperscaler pays per Gbps on the same route. Every day over the limit (after the first 15) you pay back a day's fee as an SLA credit and they lose patience twice as fast as a trading link over its limit, so keep a fast path and a fast backup. They never grow past 3.2 Tbps, so one contract cannot carry a whole level (#137).
- From customer level 2, you can save up to three POP standards (micro POP, medium POP, regional hub), each a router model and a number of routers, and mark which POP is which. One button in a POP's Infra tab brings it up to its standard, and Utilities brings every POP of a kind up at once with the price shown first. A POP is never stepped down to a smaller model, and a busy POP with one router gets its second router before the swap, so the upgrade rolls instead of taking the POP down (#315).
- Utilities can now install the redundancy kit at every POP still missing part of it in one go, at one price shown on the button, from customer level 2. With a NOC intern you can also put the kit in the intern's new-POP template from there (#317).
- A customer asking for a backup generator, a second router or a second site at POPs you already have now shows what is missing and what it costs, with a button that buys exactly that and signs the deal. Nothing is bought unless you press it (#241).
- The NOC intern's "Light more fiber" order can now leave new fiber dark, so a fiber handed over in the night no longer pulls in traffic before you are ready for it. Fiber you light yourself still gets more optics when it runs hot (#316).
- The Transit and Peering tabs of a POP have a search box for a network's name or AS number and a "Connected only" switch, so you can find the one network you need in a long list, on phones too (#199).
- Decommissioning one of several links between the same two cities keeps the link panel open on the next one, so you can hand back a row of waves without reopening it each time (#119).
- A link that a closed border has taken down, like Doha to Dubai or Abu Dhabi while the neighbours have fallen out, now says so in its panel, with the days until it comes back, instead of showing nothing wrong. Leasing a new wave or fiber pair across that border during the spat warns you first that it will stay dark (#329).
- A customer asking for a discount at renewal now shows how much traffic they book and get, the price per Gbps now and asked, and any latency limit or path terms they signed for, each ticked or crossed as your network stands today (#292).
- The two city names at the top of a wave, dark fiber or virtual circuit panel now open that city, for example to upgrade the router there before a bigger link (#196).

## [3.3.0] — 2026-11-09

- You can now move a customer to another path between the same two POPs, with the most diverse options listed first. Waves and leased fiber pairs move to another fiber with room for them, leaving alone what you keep back for your own traffic, and circuits can be pinned to a path of your choice, falling back to normal routing while a link on it is down.
- Routing a big network's day takes about half the work, with exactly the same results: on a network of 390 POPs with Auto-TE, a day's routing went from about 0.7 to 0.3 seconds on a computer.
- Big networks no longer freeze for a moment at every new game day, above all with a NOC intern on duty. The intern now plans cache boxes, router ports and PNIs for every POP in one pass. On a network of 190 POPs the intern's shift held the page for about a tenth of a second on a computer and half a second on a phone; it now takes a few thousandths, and a whole day holds the page a quarter as long. The game plays exactly as before.
- At ×8 a big network's autosave no longer holds the page: the game is packed, turned into text and compressed in the background, and less of each day's routing has to travel back to the page. The game plays exactly as before.
- While nothing moves on the map but its animations (packets, waves, clouds), it is drawn 30 times a second instead of at the screen's full rate, half the work on most screens and a quarter on 120 Hz phones. Moving the map, pointing at something or anything changing on the network still gets every frame, and the animations keep their speed.
- Linking to a coast where no subsea cable lands yet, like Iqaluit, now says how you can get there (overland, or with a cable of your own) instead of listing no cities to hop through (#321).
- A delay while your own subsea cable is being laid now holds the lay ship where it is, instead of sending it back to port and starting the laying over. The cable already on the seabed stays there, the build simply finishes later, and there is nothing to pay twice (#322).
- A paused game no longer rewrites its save every 5 seconds when nothing has changed. On a big network each of those writes held the page for 20 to 30 milliseconds.
- A low-latency boutique with a lot of its own fiber no longer stalls every day while it times its finance routes. On a big fiber network that check held the page for about a third of a second and now takes a few hundredths; checking customers who want a path without subsea or under a latency limit got quicker too. The game plays exactly as before.
- The NOC intern no longer holds a big network for more than half a second each time it weighs taking out a spare wave. Before it decides, it checks every customer promised diverse paths, no subsea or a latency limit, and on a network of 390 POPs that check now takes a few hundredths of a second. Spotting new sovereign cloud and trading offers is about ten times quicker too, and the game plays exactly as before.

## [3.2.0] — 2026-11-07

- New badges for traffic: serve 1 Tbps and 10 Tbps on the way to the 100 Tbps and petabit ones, and carry a petabyte, 100 petabytes, an exabyte and a zettabyte in one game. The dashboard shows how much traffic your network has carried so far, and only the top step of each ladder is legendary: Hundred Terabits is now epic.
- Lambda Bazaar, a capacity market for your dark fiber, is a new tab in the NOC dashboard. Sell spectrum, managed 100G, 400G, 800G and 1.6T waves, and dark pair IRUs on every route you hold fiber on, and choose how much to keep back for your own traffic, from what demand the broker lists, and the price it never sells below. What each route wants moves all the time and grows every year: hot routes pay more, a fiber cut next door or a hyperscaler breaking ground sends demand up, buyers move from 100G to bigger waves over the years, and carriers already on your glass ask to move up a size. Short, straight routes earn more for fast waves. A Cable broker pays the broker 3% instead of 10%, and sees where each route is heading and which routes between its POPs are worth building.

## [3.1.0] — 2026-11-07

- Whoever runs sales can now answer renewal haggles for you, each in their own way: switch it on at the sales desk. The engineer keeps nerdy customers at the market price and gives everyone else their discount, the shark refuses discounts and some customers walk, and the CEO settles it on the golf course, for better or worse.
- The three interns now each have something they are best at: Anycast Annie peers every day and orders PNIs twice a week, Kevin from the night shift swaps two line systems a night and never fat-fingers anything, and Tracy Route buys capacity as if traffic were already 10% higher. They run the same orders at the same salary.
- Your intern can upgrade optical transport: a new standing order moves full, busy fiber to a bigger line system, or trades its smallest channels for bigger optics. Pick a line system, and every fiber on a smaller one is moved up to it. A line system swap takes the fiber down for a day, so the intern only does it where the traffic gets around it and no customer rides it, one a night.
- Your intern can standardize your routers on a model you choose: pick it in Keep routers ahead, and every POP on a smaller model is swapped to it, the busiest first, within the monthly budget. Every setting in the Standing orders sheet is now a list to pick from instead of a button to tap through.
- France gets seven more cities: Lyon, Toulouse, Lille, Bordeaux, Strasbourg, Rennes and Nantes, all but Nantes with an exchange of their own (#288). SF-Error Telecom and Boy-Egg Telecom bring home broadband and mobile, Ov-Hatch Cloud and Scale-Away bring French clouds, Tangerine Telecom and Free as in Beer reach the new cities, Cogentle reaches Toulouse, Lille, Bordeaux and Strasbourg, and Andorable Telecom comes up to Toulouse. The Atlantic cables now come ashore where they really do: Ami-Tea at Bordeaux and Dunno-ant at Nantes, and Dunno-ant starts at Virginia Beach.
- Big networks at ×8 no longer stop for a moment when a day reroutes, after a failure, an event, the intern's shift or the sales desk's signing. Every routing a day needs now runs in the background like the day's own, a long day lets the map draw between its steps, and the check for customers afraid of sharks no longer walks every land fiber for each of them. Quiet notifications now also apply while the game is running.

## [3.0.0] — 2026-11-06

**Series of Tubes 3.0: Pie in the Sky.** You have wired up the planet with fiber, cables and routers. Now take your network to orbit: start your own rocket company, fill the sky with satellites (we call them pies) and sell internet to everyone your cables will never reach.

**How to get there.** Become Tier 1 in a game started with 3.0, whatever your charter, and Pie Control opens from the NOC tab, right next to the NOC dashboard. Want to look around first? In Sandbox the rocket company is yours from day one. Games you started before 3.0 keep the rules they began with.

**Rockets, pies and crusts.** Build a pie factory and a launch pad on the coast (the closer to the equator, the cheaper each launch), then fly rockets that carry pies into four orbital shells, the crusts. Once a crust is 40% full it starts carrying traffic: pie dishes at your POPs land it on your backbone, and homes and boats in the remotest places, airlines, cruise lines and even a Mars mission sign up. A town no cable reaches can join your network through orbit. You watch it all on a spinning cartoon globe, launches and fireballs included.

**Space is not quiet.** Solar storms, food fights in orbit, failed launches and spats with governments over landing rights keep you busy, and the Founder of your rocket company does something daft every few months, so the markets get the jitters until it wears off. Governments pay for space too, in a new Government money section of the bank. Run it well and a full constellation pays for itself in about seven years.

**Three charters.** A new game now starts by asking what you are building. **Global backbone** is the classic game: grow everywhere and become Tier 1. **Low-latency boutique** lives on speed: trading firms call more often and pay more, and you win Speed of Light by beating the fastest leased latency on finance routes with your own glass. **Cable broker** is new: lay fiber on land and cables under the sea from day one, light them and sell the capacity to other carriers, and win Glass Baron when your own cables land on five continents while carriers pay you $1M a month. Every charter can still become Tier 1, and so reach orbit.

**Sales runs the deals.** Your salesperson can now sign deals for you, orbit customers included, each in their own style, while the NOC intern sticks to running the network.

- Pie in the Sky: become Tier 1 and you can start your own rocket company, putting your network in orbit. Win Tier 1 in a game started from this version (any charter), and Pie Control opens from the NOC tab, next to the NOC dashboard; in Sandbox it is there from day one. Build a pie factory and a launch pad on the coast (near the equator, launches are cheaper), fly rockets that carry satellites ("pies") into four orbital shells ("crusts"), and watch it all on a spinning cartoon globe with a night side, laser links between pies and launches that either spill their pies into orbit or end in a fireball.
- A new game now starts by asking what you are building, with three charters to choose from (#300). Global backbone is the classic game: grow everywhere and become Tier 1. Low-latency boutique: trading firms and other latency customers call more often and pay more, and you win Speed of Light by beating the fastest leased latency on finance routes with your own glass. Cable broker is new: lay fiber on land and cables under the sea from day one, light them and sell the capacity to other carriers, with ten goals of its own and the Glass Baron win when your own cables land on five continents while carriers pay you $1M a month. Every charter can still become Tier 1, and with it reach Pie in the Sky.
- Your pies carry real traffic and earn money once a crust is 40% full. Pie dishes (ground stations) at your POPs land the traffic on your backbone, with landing rights bought country by country. Homes and boats in the remotest places (Pitcairn, the Arctic, the outer islands), airlines, cruise lines and even a Mars mission sign up, and a town no cable reaches can join your network through orbit. Before a crust carries anything, buoys and sensors that live with gaps in the sky pay a little; when it starts carrying traffic, a grand opening brings a month of daily calls.
- Space is not quiet, and neither is your Founder. Solar storms, food fights in orbit, rain over tropical dishes, failed launches and geopolitical spats over data and landing rights keep you busy, and the Founder of your rocket company does something daft every few months, so markets get the jitters until it wears off. A full constellation pays for itself in about seven years if you run it well.
- Deals belong to Sales now: your salesperson can sign deals for you, orbit customers included. The NOC intern sticks to the network. The engineer, the shark and the CEO each sign in their own style, and each sells orbit their own way, from careful deals where a pie dish has room to Mars missions agreed with the Founder on the golf course.
- Governments pay for space too, in a new Government money section of the bank (Cash · Bank): the Rural Digital Pie Fund auctions support for remote towns only your satellites reach, the Export-Import Pie Bank lends against launches with strings attached, and the UK pays a grant when Pitcairn is served from orbit.
- Pie Control helps you plan: the Launch tab says how long each crust takes to fill at your current pace and points to a better pad when your pads are the bottleneck, the Dishes tab tells you when dishes are worth building, and the Traffic tab shows who rides your satellites, how full each crust and dish is, and why a sky is still empty. Traceroute follows packets through orbit too.
- The NOC tab is tidier: Pie Control sits in its top row next to the NOC dashboard, traceroute moved into Routing & DDoS, and All connections lives in the NOC dashboard.
- From customer level 9 you can lay your own subsea cable without being Tier 1 first (#300).
- Traffic now leaves your network at the nearest peering, so a PNI in London no longer pulls New York's traffic across the Atlantic when the New York IX reaches the same network (#298). Where a PNI and an IX port reach a network in the same city, the PNI still goes first, and RouteScript's `prefer pni` still hauls everything to your PNIs.
- Fabric (NNI) ports now grow like your other ports: buy them at 10G, 100G or 400G (as fast as your router takes), and bundle up to eight into a LAG when one is not enough (#140). A fabric customer is no longer accepted, by hand or automatically, when its bandwidth would not fit on the port as well (#307).
- Pressing Space to play again after a pause now picks up at the speed you were playing, not always at 1× (#299).
- Your own subsea cables now land right on the city's dot, also in Fujairah, Dubai, Karachi, Barcelona, Osaka and other cities the map shifts slightly so they do not overlap (#305).
- Starting a new network no longer leaves the last one's "New POP!" and money pop-ups frozen all over the map until a reload.

## [2.10.1] — 2026-11-05

- "Meet halfway" on a renewal now offers the price halfway between what the customer pays and what they ask, and the button shows it before you press (#293).
- Fujairah sits on the UAE's east coast again, where its cables land, instead of on top of Muscat (#295).
- Puzzles on phones no longer scroll. A bar at the top shows the stars, the money and the one thing to do next, with a chip for every flow that turns green once it all arrives; tap a chip to jump to its city. A city or a link opens a short card at the bottom, split into tabs (links, router, traffic; size, traffic, routing), so every button is on screen at once. Architect runs get the same bar, and Reset is in the ☰ menu on phones.

## [2.10.0] — 2026-11-05

**The map now runs on your graphics card.** Panning, zooming and fast play stay smooth even on huge networks. If something looks wrong or your phone gets warm, switch back to the old map in **Settings › Map drawing › Always 2D**. Older browsers stay in 2D on their own, and Settings › Diagnostic info shows which one you have.

**Customers sign contracts now.** When one ends they renew, grow, haggle or leave, and bandwidth gets cheaper every year. To bring in more deals, hire someone to run sales: an engineer who goes to every NOG, a shark who oversells, or the CEO, who thinks he sells best.

**Also new:** a "No POP yet" tab on the dashboard, clearer puzzles on phones, Gothenburg, Malmö, Haparanda and Bilbao on the map, and tooltips on the NOC charts.

- The map is now drawn by your graphics card, so panning, zooming and fast play stay smooth on big networks (#281). If it looks wrong or your device runs hot, go back to the old drawing in Settings › Map drawing › Always 2D. Browsers without WebGL2 stay in 2D on their own, and Settings › Diagnostic info shows which one you are on.
- Customers sign contracts, and when one ends they renew, grow, haggle or leave (#178). Bandwidth prices fall over the years and rise when hardware is short, and the dashboard shows who you won and lost each month.
- You can hire one person to run sales: an engineer, a shark or the CEO himself. Each brings different deals and leaves their mark on the customers they sign.
- The NOC dashboard has a "No POP yet" tab listing every city you could still expand to.
- Puzzles explain their goals in plain words, with a Show me button and marks on the map, and fit phones better.
- Sweden gets Gothenburg, Malmö and Haparanda (#206).
- Bilbao joins the map, where the transatlantic cables really land; Columbus III-and-a-half now lands near Cádiz.
- NOC charts have tooltips, and their legend can hide a series.
- Leasing dark fiber costs more, alien waves are priced against the fiber, and extra crews can only halve a land build (#203).
- Clean traffic sent back by a scrubbing center no longer shows as DDoS junk on your links (#289).
- In Firefox on a computer, the 2D map is up to three times as fast when zoomed in.
- Fixes: a link ordered by the AI tools can no longer end in a city the map does not show, and names from a save file always show as plain text.

## [2.9.1] — 2026-11-04

- Jokes in the game now poke fun at networks, cables and routers, never at people, countries or beliefs. A few networks have new names (Atlas Hold-the-Line Telecom, Star-Blink, Telekom Malay-tency, Oh Yas Sénégal, Afghan Tele-Pass, Island-Hop Micronesia, Tel-One-derful, Tango Two-Step), so do three of the names for your own cables, and about forty descriptions of networks, cities, cables and events were rewritten.
- A network operators' meeting that hires you for its event network now meets only where it really does: NANOG in the United States, APRICOT in Asia Pacific and Oceania (not mainland China or Hong Kong), DENOG in Germany, UKNOF in the UK, RIPE in Europe, the Middle East and Africa, and DKNOG in Copenhagen.
- North Korea now moves well under 1 Gbps, and no customer of any kind calls from there.

## [2.9.0] — 2026-11-04

- In Architect runs, a diverse second tube now takes the cheapest other route, as a new tube does, so the Euro Run's plain plan fits its budget again. A failed review also says that every site still connected after a cut needs room for its traffic, not only the mission-critical ones (#282).
- A new button next to the speed controls opens a NOC screen in a window of its own, to keep on a second display beside the map. It is a dark wallboard with a live world map of your links and POPs, traffic and money graphs, alarms, and your hottest ports with their upgrade buttons, which work on the running game; click a POP to see its ports. Details has the full dashboard, and Full screen fills the display. The new window only shows and sends clicks: your network is still played and saved in the game window. Phones do not show the button.
- Cities of one country on one piece of land can be joined by fiber over land, even where there is no road: Pevek to Anadyr or Moscow, Juneau to Seattle, Nuuk to Sisimiut. Inside one country, crossing from Europe into Asia (Moscow–Vladivostok, Istanbul–Ankara) is no longer priced as a crossing between continents.
- No circuit of any kind can be built between North and South Korea, and nothing leaves South Korea over land: every way out is a subsea cable.
- The map zooms in twice as far, for crowded regions like New England or around Washington.
- Cable ships at anchor sit a little further out from their port, and a tap on a city picks the city even with a ship close by.
- With a credit rating of AA or better you can now call a bank from the Bank window and ask for the amount you need. The better your rating, the lower the rate and the more they will lend, up to a limit based on your revenue and what you already owe, but weird conditions always apply. (#251)
- Agents playing through the Agent API can no longer start a link in a city where you have no POP, just as on the map. Before, an agent could sign a dark fiber IRU, lease a wave or lay a cable from such a city; now it is told why, and so is its dry run.
- Build POP in a small city that is off the map now says why it can't, and names a city nearby to build in instead. Founding your own exchange where you can't (mainland China, a city that already has one, a city with no POP) says why too. Before, both did nothing without a word, and an agent's dry run quoted a price.

## [2.8.0] — 2026-11-04

- Every capital of the world is now on the map, with Africa's 33 capitals completing the set. They run from Porto-Novo, Bamako and Niamey to Khartoum, Juba, Mogadishu, Brazzaville, Tripoli, Rabat and Pretoria. Each country brings its real telcos, Nigeria gets its wholesale backbone up to Abuja, and the island capitals of the Comoros, São Tomé and Equatorial Guinea sit on their real cables.
- The NOC intern has a new order, Keep peering headroom, that adds capacity to your PNI and IX ports before they fill up (#234). A single port at a POP with several routers gets a second port in a LAG; any other port moves up to the smallest size that fits. It has the same Headroom and Budget dials as the transit order, and it waits out DDoS floods, link faults and PNI augments already on order. The monthly figure in the intern's log now counts IX ports too.
- An exchange port, a transit port or a PNI can now be stepped down one size from its panel, so shrinking a port no longer means leaving and rejoining (a PNI cannot while an augment is on order).
- The traceroute can follow the metrics, the lowest latency or the quietest links, like a customer circuit.
- Money now shows billions ($1.20B) and bandwidth shows petabits (1.00 Pbps) instead of running on in millions and terabits, including on the NOC graph and the fiber labels on the map.
- Latency customers only ask for a ceiling something you can build meets. Before, a Mars ground station could ask for 4.3 ms between Pevek and Anadyr, where the only sea route takes 7.7 ms at best. (#273)
- DE-Kicks ports stop getting dearer once they cost four times the list price. Before, the yearly price harmonisation kept compounding, so a long game ended up paying $100k a month for one port at Frankfurt or Mumbai.
- Your own subsea cable from Buenos Aires to Santiago now earns The Long Way Round, like a wave leased on the old ring round Cape Horn. (#272)
- Every capital in South, East and Southeast Asia and the Pacific is on the map: Thimphu, Kathmandu, Bandar Seri Begawan, Phnom Penh, Vientiane, Ulaanbaatar, Naypyidaw, Pyongyang, Dili, Hanoi and Wellington, with the island capitals Tarawa, Palikir, Yaren, Funafuti and Port Vila. Each country brings its real telcos, North Korea reaches the world only through China and Russia, and the islands hang on their real cables.
- Every capital in the Middle East, the Caucasus and Central Asia is on the map, from Yerevan and Baku to Kabul, Tehran, Baghdad, Jerusalem, Amman, Kuwait City, Beirut, Damascus, Sanaa and Manama, with Ankara and Islamabad. Each country brings its real telcos, and Bahrain is an island on the Gulf's cables.
- Every capital in Europe is on the map: Tirana, Andorra la Vella, Minsk, Sarajevo, Zagreb, Nicosia, Vaduz, Vilnius, Valletta, Chișinău, Monaco, Podgorica, Skopje, San Marino, Bratislava, Ljubljana and Bern. Each country brings its real telcos, exchanges sit only where real ones do, and Malta and Cyprus are islands on the real PEACE, MedNautilus and Blue cables.
- Every capital in the Americas is on the map: the eastern Caribbean islands, Central America, Haiti, Guyana, Suriname and Bolivia's constitutional capital Sucre. The islands land the real cables (ECFS and Southern Caribbean Fiber), Flow and Digicel serve all of them, and Belize, Guyana, Suriname and Haiti get their own national telcos.
- Every US state capital and Washington, DC are on the map, with every Canadian provincial and territorial capital and Greenland. Greenland's capital Nuuk and three towns up the coast hang on the real Greenland Connect cables; Iqaluit has only satellites, so land your own cable there. New carriers sell transit in the north and the Canadian provinces, and exchanges sit only where real ones do.
- If you run the game on your own computer, an AI agent can now play it in your browser while you watch. Turn the Agent API on in Settings (the section only appears in a copy of the game you run with npm run dev, never on seriesoftub.es) and point an AI client at the game's MCP server: every move happens live on your screen, and docs/MCP.md in the repository explains the setup. You choose the clock: a pace from one simulated day every 30 seconds to 5 minutes, which nobody can pause and which waits while no agent is connected, or the agent moves time itself. Your game, your settings and the windows you open stay yours.
## [2.7.0] — 2026-11-03

- Three new cities in northern Australia: Port Hedland, Townsville and Alice Springs (#255). Port Hedland lands a new cable up the coast to Darwin and a branch of Darwin's cable out to Singapore; Alice Springs has no sea at all. In the wet season, November to April, fiber cuts in the tropical north, Darwin included, take twice as long to reach.
- New keyboard shortcuts: the arrow keys and W A S D move the map, [ and ] step through your POPs, $ through the open offers, - and = zoom out and in, n opens the NOC dashboard, and ? lists every shortcut. A letter right after n opens one of the dashboard's tabs, such as n c for Connections, and Help links to the list too.
- You can pay to hurry the survey, permits and factory of your own subsea cable, 30 days at a time (#258). Money only goes so far: the cable still has to be made, about two months plus a day for every 80 km, before the lay ships sail.
- Traceroute no longer shows an "embedded cache in your rack" hop on paths that leave over transit, an exchange or a PNI. Only traffic that really ends at one of your cache boxes shows it now.

## [2.6.0] — 2026-11-03

- New Best Effort mode, the gentlest way to play: rare outages, no DDoS, no chaos monkey, no conferences and no cable ships, with sea cuts that mend on their own. PNIs are up the moment you order them, customers are more patient, a rescue loan from the Ministry of Tubes replaces game over, builds take days and prices never spike. A new Quiet notifications setting, on by default in Best Effort and available in every mode, only pops up trouble and milestones; everything else goes into the NOC log.
- Backbone, Auto-TE and DDoS settings now open from a Routing & DDoS button at the top of the NOC tab. They used to sit at the very bottom, below every notification; a red dot on the button says when Auto-TE is paused.
- The Build POP button now shows the whole price of a new POP, including the routers of your standard POP (#261). Before, it showed only the site, although the standard routers were paid for on top; a note under the button now lists them, and the intern's one-tap template prices them in as well. POPs that come with a new wave, dark fiber, your own subsea cable or a consortium seat now get the standard routers too, and those offers show the price with them.
- The intern's "Light more fiber" order has a new Optics setting: light new fiber with the biggest optic it can afford, to save channels for later (#262). Once a fiber is lit, the intern still adds more of the same optic and never swaps what is in there.
- Networks you reach through an exchange's route server now stay "via RS" (#265). With an Open peering policy, the peering desk used to turn some of them into separate sessions of their own.
- The tabs above the left panel no longer run off its edge on smaller screens and tablets. Counts such as finished goals now sit on the corner of their tab.
- Gaming customers no longer warn that they attract attacks in modes without DDoS attacks, such as Change Freeze.

## [2.5.0] — 2026-11-02

**Mostly a performance release.** Big networks route their traffic on about half the processor time, days no longer freeze the game, and clicks that change nothing about your traffic answer at once, so phones last longer. Same routes, same results, just faster.

- Big networks use about half the battery they did: each day's routing takes half the processor time, and reuses what it worked out the day before when only demand has changed. Where traffic goes does not change.
- The game no longer freezes while it routes each day's traffic on big networks. A background thread of the game does the routing, so the map, panels and buttons keep responding while days go by; what the day brings is exactly what it was before. Clicks that change your network still route right away.
- On big networks, clicks that change nothing about your traffic now answer at once: dismissing an offer or renaming your network no longer works out every route again, which also saves battery on phones.
- The calendar is real now: months have 28 to 31 days and every fourth year has a 29 February (#257). Monthly prices, loan statements, the intern's budget and paydays follow calendar months, and conferences fall on the 10th of their month.
- Cache boxes are sized for the traffic each city really sends (#260): Russian and Chinese cities get boxes for the networks people there actually use, and none for networks they cannot reach. Boxes already installed stay; remove idle ones from the POP.
- A 1.6T transponder on routers with 800G ports now takes two ports at each end, one for each 800G it hands over, and the optics list says so (#256). Before, a full 1.6T fit into a single 800G port. On 1.6T routers it still takes one.
- A plug-in optic that is too short for your subsea cable no longer sends you to submarine terminals and optical engineering, which cannot stretch it (#253). The hint now names the optics that do reach, such as the Sienna WaveMagic 1.6T for Perth to Cape Town. Optics the upgrades can stretch still get the advice.

## [2.4.0] — 2026-11-01

- Cable ships now sail out to fix your subsea cables, and you can watch them on the map. A cut at sea calls the nearest free ship of its region's repair club, from ports such as Cornwall, Curaçao, Cape Town, Marseille, Vancouver, Tokyo, Manila and Singapore. The cut lasts while the ship sails out (about 500 km a day), splices for 3 to 5 days in shallow water or a week or two in the deep, and in some countries waits weeks for a repair permit. A ship is busy until it is home again.
- Doitsche Telekomm and Tangerine Telecom are now Tier 1s, as in real life (#194). In new games, going transit-free means a PNI with both of them too; games you already started keep the Tier 1s they were playing for. Doitsche now sells transit at the highest price in Europe and still charges for peering, and like the other Tier 1s, Tangerine now starts its PNIs at 100G.
- Cache boxes now share router ports through an aggregation switch: one port carries as many 100G boxes as its speed holds, so 32 fit on a 3.2T port (#252). Each site gets its own.
- Pick a standard POP: in any POP's Infra tab, make its routers the standard, and every new POP gets that model and number of routers right away, while it is still empty (#240).
- Big networks run faster: the map skips links off screen without working out their shape, and the Networks tab and the zoomed-in map draw faster. Where traffic goes does not change.
- A network the game once failed to load is no longer stuck as damaged: the next version of the game tries it again, and its menu has a Try again button. Before, it could only be exported or deleted, even after the cause was fixed.
- Save files of very large networks import again: the limit went from 8 MB to 64 MB.
- 400G cache boxes: a POP whose routers have 400G or faster ports now gets 400G boxes, at $1,000 a month instead of $400 for 100G, so big caches need fewer boxes and cost less per Gbps. Boxes you already have stay as they are.
- Clarovision now peers only over paid PNIs, like the real carrier, and free only with networks at customer level 11 or above (#213). A PNI you already have with it starts paying the fee.
- Opening a link from a list now moves the map to it, zoomed so the whole line fits beside the open panel.
- Traffic for a carrier now leaves through that carrier's own transit port at the same POP, instead of being shared with every other transit port there. Networks that buy transit from the carrier get the same treatment, and a new switch on each transit port, Carry here, pulls that traffic across your network from POPs that have no port of that carrier. Prefer, Backup only and RouteScript still win, and Prefer only does so at the POP where you set it.
- When every ship of a region's club is out, a subsea cut waits for the first one back. A private charter of the quickest free ship anywhere jumps the queue for $1M plus $200 per km it sails; the NOC intern's rush-repair order can pay it within its budget.
- Building your own subsea cable now shows the survey, permits and cable factory first, then a lay ship laying about 150 km a day. Crews can no longer speed up a cable at sea: book a second lay ship before laying starts instead, for $3M plus $150k a day, and it lays from the other end to halve that part.
- Tap a cable ship on the map to see its name, its club and what it is doing.

## [2.3.0] — 2026-10-31

- Clicking a city without a POP works again while the intern's transit order is set to Already connected (#249). Before, the city panel failed to open and the map stuck to the mouse.
- The intern's Accept free caches order, and the Request caches button, now add more cache boxes as demand to a network outgrows the ones you have (#248). Before, they stopped at one box per site.
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
- Seven new cables around Africa (ACE of Spades, SAT-3-Legged Stool, MainOne-Track Mind, Mint Tea West Africa, Set SAIL, Sea-Comedy Hour and Dare-Devil-1), and the existing ones now stop in the new cities. Set SAIL and SACS-y Cable link Brazil to Cameroon and Angola, and Sea-Comedy Hour links Djibouti to Mumbai. Liquid Lunch Networks, Sea-Comedy Networks, Angle-a Cables, Djibouti Calling, Empty-N, Air-Tell Africa, Ethio-Tele-Calm and Atlas Hold-the-Line Telecom join the networks.
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
