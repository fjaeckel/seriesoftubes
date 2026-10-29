# Changelog

All notable changes to this project are documented here. The project follows
[Semantic Versioning](https://semver.org/). Each release is deployed to
[seriesoftub.es](https://seriesoftub.es).

## [Unreleased]

- Upgrading an existing wave now respects sold-out route capacity (#201). When a wave size is sold out on a route, upgrading a smaller wave to that size is disabled until capacity frees up.

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
