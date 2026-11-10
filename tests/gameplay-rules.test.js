// The game's design rules (.claude/skills/gameplay-rules/SKILL.md): one test per rule id, on the live data.
// A rule may only be broken by an entry in EXCEPTIONS below, with its reason. Never delete a check to make it pass.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { load } = require('./harness');
const { lit } = require('../scripts/lib/js-literal');

// Every exception names what breaks the rule and why. One per line, sorted within each rule.
const EXCEPTIONS = {
  // W2: countries with fewer than two consumer networks of their own, because real life has fewer.
  W2: {
    AD: 'Andorra Telecom is by law the only telecom operator',
    BN: "Since 2019 the state's UNN owns every network in Brunei; the retail brands have none of their own",
    CU: 'Cuba has one state operator (ETECSA); Cubacel is its own mobile brand',
    DJ: 'Djibouti Telecom is the monopoly for homes and phones',
    ER: "EriTel, the state's, is the only network in Eritrea",
    FM: 'FSM Telecom is the only operator on Pohnpei',
    GL: 'Greenland has one operator (Tusass), for homes, phones and the cables',
    KP: 'Star JV is the only network in North Korea',
    MC: "Monaco Telecom is the principality's only fixed and mobile operator",
    MH: 'the Marshall Islands have one telco (NTA)',
    PN: 'Pitcairn has no network at all: land your own cable (#124)',
    SH: 'St Helena has one operator (Sure South Atlantic)',
    TM: 'Turkmentelecom is the state gateway, and TMCell the state mobile operator behind it',
    TV: 'Tuvalu Telecommunications Corporation is the only telco',
    YE: "In Sanaa, YemenNet is the only internet gateway; the mobile operators' data goes through it",
  },
  // W3: cities nobody sells transit in.
  W3: {
    ivc: 'Invercargill waits for its AI campus; nobody sells transit there yet',
    jub: 'Nobody sells transit in Juba: MTN and Zain haul it in from abroad',
    pcn: 'Pitcairn: no cable, no network, land your own (#124), or reach it with a pie dish (backhaul through orbit)',
    prr: 'Prince Rupert is a remote town with no carrier in it',
    smr: 'San Marino buys its transit from Italian carriers in Bologna and Rimini; nobody sells it in the town',
    sre: "Sucre has no exchange or carrier facility: Bolivia's transit is bought in La Paz",
    stg: 'Stuttgart is the Only Spätzle-IX scenario city: peering only, by design (#114)',
    yfb: 'Iqaluit has no fiber, only satellite: land your own cable (the real plan runs from Nuuk)',
    yyj: 'Victoria buys from Telus and Rogers, consumer networks only in the game: link it from Vancouver',
  },
  // N3: networks in no founding Tier 1's customer cone. Old saves need PNIs with the founding five for Tier 1,
  // so anyone outside their cones has to be peered with directly.
  N3: {
    abb: 'Australians buy only from Australian carriers (#148)',
    atl: 'transit-free in India',
    bcd: 'transit-free in Canada',
    blg: 'Australian, buys from Telstraya (#148)',
    btt: 'transit-free incumbent',
    cht: 'transit-free in Taiwan',
    clr: 'America Movil, transit-free across Latin America',
    cmb: 'China (#59): reached through the Chinese carriers',
    cmc: 'transit-free incumbent',
    cos: 'Greek incumbent, peers for its own reach',
    ctc: 'China (#59)',
    cun: 'China (#59)',
    cxc: 'buys from Spectre-um, which is transit-free',
    drz: 'a transit-free Tier 2',
    ert: 'Russia: buys from Rostelecomedy (#70)',
    etc: 'Cuba: buys from Sparkly Seabone, a Tier 1 only for games since 1.12',
    ets: 'transit-free in the Gulf',
    ftr: 'buys from Very-Zone, which is transit-free',
    inp: 'Australian, buys from Toilet Paper Group (#148)',
    jio: 'transit-free in India',
    kdi: 'transit-free in Japan',
    ktt: 'Korea: sender pays, peer with it yourself',
    lgu: 'Korea: sender pays',
    lnt: 'Australian (#148)',
    lpt: 'Australian (#148)',
    meo: 'Portuguese incumbent, peers for its own reach',
    mgf: 'Russia: buys from Rostelecomedy (#70)',
    npt: 'Australian (#148)',
    opt: 'Australian, buys from SingTell (#148)',
    pnt: 'Australian (#148)',
    rtc: 'Russia (#70)',
    sgt: 'a transit-free Tier 2',
    skb: 'Korea: sender pays',
    spc: 'transit-free incumbent',
    stb: 'satellite: peers for its own reach',
    stc: 'transit-free in Saudi Arabia',
    stj: 'North Korea’s only links are China Unicorn and Rostelecomedy',
    teg: 'owns the land crossing; transit-free',
    tim: 'buys from Sparkly Seabone, a Tier 1 only for games since 1.12',
    tmt: 'buys from Sparkly Seabone, a Tier 1 only for games since 1.12',
    tmx: 'transit-free in Mexico',
    tmy: 'Malaysian incumbent, peers for its own reach',
    tpr: 'Australian (#148)',
    tsf: 'Indonesian incumbent, peers for its own reach',
    tsy: 'Australian, transit-free (#148)',
    ttk: 'transit-free in Turkey',
    ups: 'European cable group, peers for its own reach',
    vdp: 'a transit-free Tier 2',
    viv: 'transit-free in Brazil',
    vzn: 'transit-free incumbent',
  },
  // N7: an exchange port where the network has no PoP.
  N7: {
    'spl:hba': 'Speedyloop reaches Hobart’s exchange over its own backhaul but sells no transit there',
  },
  // M3: subsystems that annoy the player but read no rule.
  M3: {},
};

// The real names the puns are based on. No network, cable, exchange, data center, router or optic may be called one.
const REAL_NAMES = [
  // Tier 1s and carriers
  'AT&T', 'Bell Aliant', 'BICS', 'Cogent', 'GlobalConnect', 'GTT', 'Hurricane Electric', 'Level 3', 'Level3', 'Liquid', 'Liquid Intelligent Technologies', 'Lumen', 'Northwestel', 'NTT', 'Orange', 'PCCW', 'SaskTel', 'Seacom', 'Singtel', 'Sparkle', 'Tata', 'Tata Communications', 'Telia', 'Telxius', 'Tusass', 'Vodafone', 'Zayo',
  // content and clouds
  'Akamai', 'Alibaba Cloud', 'Amazon', 'Amazon Web Services', 'AWS', 'Baidu', 'ByteDance', 'Cloudflare', 'Facebook', 'Fastly', 'Google', 'Mercado Libre', 'Meta', 'Microsoft', 'Netflix', 'OVH', 'OVHcloud', 'Scaleway', 'Tencent', 'TikTok', 'VK', 'VKontakte', 'Yandex',
  // eyeballs and incumbents
  ', ', 'A1', 'A1 Telekom Austria', 'Afghan Telecom', 'Africell', 'Airtel', 'AIS', 'Algérie Télécom', 'Altibox', 'Altice', 'America Movil', 'Andorra Telecom', 'Angola Cables', 'Antel', 'Areeba', 'ASTCA', 'ATH Kiribati', 'Aussie Broadband', 'AWCC', 'Azercell', 'Aztelekom', 'Batelco', 'Belize Telemedia', 'Bell', 'Bell Canada', 'Belong', 'Beltelecom', 'Bemobile', 'Bezeq International', 'BH Telecom', 'Bhutan Telecom', 'Bitė', 'Bouygues', 'Bouygues Telecom', 'Brisanet', 'BT', 'BTC', 'Cable & Wireless', 'Cable Bahamas', 'Cablenet', 'Celtiis', 'Cenpac', 'Comores Telecom', 'Congo Telecom', 'Crnogorski Telekom', 'CST', 'Cyta', 'Earthlink', 'Econet', 'EPTC', 'EriTel', 'FL1', 'Free', 'FSM Telecommunications Corporation', 'Gabon Telecom', 'Gamtel', 'GETESA', 'GO', 'Guyana Telephone & Telegraph', 'Hoi Internet', 'Hormuud', 'Hrvatski Telekom', 'Kazakhtelecom', 'Kcell', 'Kyrgyztelecom', 'L", ', 'Lao Telecom', 'Libyana', 'LTT', 'Magticom', 'Mattel', 'Mauritel', 'MCI', 'Melita', 'MobiCom', 'Moldtelecom', 'Monaco Telecom', 'MPT', 'Muni', 'Natcom', 'Ncell', 'Nepal Telecom', 'Niger Telecoms', 'O!', 'Ocean Link', 'Ogero', 'One Albania', 'Partner', 'SAFITEL', 'SBIN', 'SFR', 'Silknet', 'Slovak Telekom', 'SMART', 'Smart Axiata', 'Somtel', 'Speednet', 'Star JV', 'Sudani', 'Sudatel', 'Syrian Telecom', 'Syriatel', 'Tashi InfoComm', 'TashiCell', 'TCI', 'Team Telecom Armenia', 'Telecel', 'Telecom Liechtenstein', 'Telecom Vanuatu', 'Telekom Slovenije', 'Telenet San Marino', 'Telesur', 'Telia Lietuva', 'Timor Telecom', 'TNM', 'Togocom', 'Tojiktelecom', 'touch', 'Turkmentelecom', 'Tuvalu Telecommunications Corporation', 'Ucom', 'Unified National Networks', 'Unitel', 'Univision', 'UNN', 'Uztelecom', 'YemenNet', 'Zain',
  // exchanges and data centers
  'AMS-IX', 'ANIX', 'Any2', 'ArmIX', 'BALT-IX', 'BCIX', 'BENIN-IX', 'BFIX', 'BHNIX', 'Borneo-IX', 'btIX', 'BY-IX', 'CAMIX', 'CIX', 'CNX', 'CoreSite', 'CyIX', 'DANIX', 'DE-CIX', 'DigiCo', 'Digital Realty', 'Equinix', 'France-IX', 'GABIX', 'GREX', 'HIX', 'Interxion', 'IRAQ-IXP', 'iseek', 'IX.br', 'ix.kw', 'IXP-GUINEE', 'IXP-HN', 'IXP.ge', 'IXP.mk', 'IXPN', 'JPIX', 'KAZ-GOV-IX', 'KG-IX', 'KIVIX', 'LebIX', 'LINX', 'LIONEX1', 'Manama IX', 'MD-IX', 'Michcom-IX', 'MISPA-IXP', 'MIXP', 'MLIX', 'NAPAfrica', 'NetIX', 'NEXTDC', 'NIX', 'NIX.SK', 'NIXA', 'NL-ix', 'npIX', 'RegPEX', 'SIX', 'SIX.SK', 'SIXP', 'SKNIX', 'SNS-IX', 'SUR-IX', 'SVGIX', 'Tehran IX', 'Telehouse', 'TGIX', 'TIX', 'TJ-IX', 'VIX.VU', 'VNIX-HN', 'WIX-NZ', 'WLG-IX',
  // cables
  '2Africa', 'Amitié', 'BDSNi', 'CADMOS', 'CARCIP', 'Ceiba-1', 'Ceiba-2', 'DARE1', 'Darwin-Jakarta-Singapore Cable', 'Deep Blue One', 'Dunant', 'East Micronesia Cable', 'Eastern Caribbean Fiber System', 'EllaLink', 'Epic Malta-Sicily Cable System', 'Equiano', 'FALCON', 'Fibralink', 'GO-1', 'Grace Hopper', 'Greenland Connect', 'Greenland Connect North', 'Hibernia Express', 'ICN1', 'Interchange Cable Network 1', 'Jupiter', 'MAREA', 'MedNautilus', 'Melita 1', 'North West Cable System', 'PEACE', 'SEA-ME-WE 6', 'SG-SCS', 'Southern Caribbean Fiber', 'TLSSC', 'Tuvalu Vaka Cable', 'UGARIT', 'Vaka', 'X-Link',
  // cable ships, their operators and maintenance clubs
  'ACMA', 'ASEAN Explorer', 'ASEAN Protector', 'ASEAN Restorer', 'Cable Innovator', 'Cable Retriever', 'Global Marine', 'Léon Thévenin', 'MECMA', 'Orange Marine', 'Pierre de Fermat', 'René Descartes', 'SEAIOCMA', 'Sophie Germain', 'Sovereign', 'Wave Sentinel', 'Yokohama Zone',
  // rockets and satellite networks (Pie in the Sky)
  'Blue Origin', 'Falcon 9', 'Falcon Heavy', 'Iridium', 'Kuiper', 'OneWeb', 'Project Kuiper', 'SpaceX', 'Starship', 'Starlink',
  // vendors
  'Arista', 'Brocade', 'Ciena', 'Cisco', 'Extreme Networks', 'Huawei', 'Infinera', 'Juniper', 'MikroTik', 'Nokia',
];

const { ev, errors } = load();
ev('ACT.start({})');
const J = (s) => JSON.parse(ev(`JSON.stringify(${s})`));
const country = (cc) => { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(cc); } catch (e) { return cc; } };
const fail = (id, bad, fix) => assert.deepEqual(bad, [], `${id}: ${bad.join('; ')}. ${fix}`);
const ex = (id, k) => Object.prototype.hasOwnProperty.call(EXCEPTIONS[id] || {}, k);

// ---------- World ----------

test('W1: every city has a country code, a region and real coordinates', () => {
  const bad = J(`CITIES.filter(c=>!/^[A-Z]{2}$/.test(c.cc||'')||!['AM','SA','EU','AS','OC','AF'].includes(c.reg)||!(Math.abs(c.lat)<=90&&Math.abs(c.lon)<=180&&CITY_LL[c.id])||!c.land).map(c=>c.id+' ('+c.name+')')`);
  fail('W1', bad, 'give it cc (ISO 3166-1 alpha-2; territories have their own), reg, land and an entry in CITY_LL');
});

test('W2: every country on the map has at least two consumer networks of its own', () => {
  // "Own": the network names the country in its home markets (cc) and has a PoP there. Consumer networks are the
  // eyeballs, and the Tier 1 and Tier 2 incumbents (Doitsche, Tangerine) that sell to homes and phones there.
  const rows = J(`(()=>{const cs={};for(const c of CITIES)if(!c.off)(cs[c.cc]=cs[c.cc]||[]).push(c.id);
    return Object.keys(cs).sort().map(cc=>[cc,NETS.filter(n=>n.type!=='cdn'&&[].concat(n.cc||[]).includes(cc)&&n.pops.some(p=>CITY[p].cc===cc)).map(n=>n.name)]);})()`);
  const bad = rows.filter(([cc, own]) => own.length < 2 && !ex('W2', cc))
    .map(([cc, own]) => `${country(cc)} (${cc}) has ${own.length} own eyeball network${own.length === 1 ? '' : 's'}${own.length ? ': ' + own.join(', ') : ''}`);
  fail('W2', bad, 'add a real operator of that country (src/game/30-networks/32-homegrown-eyeballs.js) or list it in EXCEPTIONS with a reason');
  const stale = Object.keys(EXCEPTIONS.W2).filter((cc) => (rows.find((r) => r[0] === cc) || [cc, [1, 2]])[1].length >= 2);
  assert.deepEqual(stale, [], 'W2: these exceptions are no longer needed; remove them');
  // a network's home markets are places it really is
  const homeless = J(`NETS.filter(n=>n.cc).flatMap(n=>[].concat(n.cc).filter(cc=>!n.pops.some(p=>CITY[p].cc===cc)).map(cc=>n.name+' has no PoP in '+cc))`);
  fail('W2', homeless, 'a home market (cc) needs a PoP in that country');
});

test('W3: every city can buy transit from someone, or is a documented exception', () => {
  const bad = J(`CITIES.filter(c=>!c.off&&!NETS.some(n=>sellsAt(n,c.id))).map(c=>c.id)`).filter((c) => !ex('W3', c));
  fail('W3', bad, 'give a carrier a PoP there (with a price) or list the city in EXCEPTIONS with a reason');
});

test('W4: cables are consistent: real cities, two distinct ends, a length and unique ids', () => {
  const bad = J(`CABLE_PAIRS.filter(p=>!CITY[p.a]||!CITY[p.b]||p.a===p.b||!(p.km>0)||!CAB[p.cid]).map(p=>p.cid+':'+p.a+'-'+p.b)`);
  fail('W4', bad, 'fix the cable pair in src/game/20-world/60-cables.js');
  const ids = J('CABLES.map(c=>c.id)');
  assert.equal(new Set(ids).size, ids.length, 'W4: cable ids are unique');
  fail('W4', J("CABLES.filter(c=>!c.name||!c.pairs||!c.pairs.length).map(c=>c.id)"), 'every cable has a name and at least one landing pair');
});

test('W5: every island city can be reached: it shares its land, has a cable, or a beach to land one', () => {
  const bad = J(`CITIES.filter(c=>!c.off&&!CITIES.some(o=>o!==c&&!o.off&&(o.land===c.land||o.land2===c.land||c.land2===o.land))&&!landing(c.id)).map(c=>c.id)`);
  fail('W5', bad, 'land a cable there or give it beach:true');
});

// ---------- Networks ----------

test('N1: network ids and ASNs are unique, ASNs are valid', () => {
  const ids = J('NETS.map(n=>n.id)'), asns = J('NETS.map(n=>n.asn)');
  fail('N1', ids.filter((x, i) => ids.indexOf(x) !== i), 'network ids must be unique');
  fail('N1', asns.filter((x, i) => asns.indexOf(x) !== i).map(String), 'ASNs must be unique');
  fail('N1', J("NETS.filter(n=>!Number.isInteger(n.asn)||n.asn<1||n.asn>4294967294||n.asn>=64512&&n.asn<=65534).map(n=>n.id)"), 'use the real, public ASN');
});

test('N2: names are puns: no network, cable, exchange, data center, router, optic or cable ship carries a real name', () => {
  const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim();
  const real = new Set(REAL_NAMES.map(norm));
  const names = J(`[...NETS.map(n=>['network',n.name]),...CABLES.map(c=>['cable',c.name]),...XIX.map(x=>['exchange',x.name]),
    ...CITIES.flatMap(c=>[['exchange',c.ix],['data center',c.dc],['data center',c.dc2]]),...RG.map(r=>['router',r.n]),...Object.values(OPT).map(o=>['optic',o.n]),...Object.values(SEAT_ROUTES).flat().map(r=>['cable',r[2]]),...SHIPS.map(x=>['cable ship',x.n]),...LAY_SHIPS.map(n=>['cable ship',n]),...Object.values(SHIP_CLUBS).map(c=>['maintenance club',c.n]),...PIE_NAMES.map(n=>['rocket company',tr(n)]),...Object.values(ROCKETS).map(r=>['rocket',tr(r.n)]),...Object.values(CRUSTS).map(c=>['constellation',tr(c.n)])].filter(x=>x[1])`);
  fail('N2', names.filter(([, n]) => real.has(norm(n))).map(([k, n]) => `${k} “${n}” is a real name`), 'find a pun');
  fail('N2', names.filter(([, n]) => /-ish\b/i.test(n)).map(([k, n]) => `${k} “${n}”`), 'no lazy -ish names: find a real pun, or keep the plain word');
});

test('N3: every network sits in a founding Tier 1’s customer cone, or is a documented island', () => {
  // The founding five (t1Need() of the oldest saves): every save can reach a network in their cones by peering with them.
  const out = J(`NETS.filter(n=>n.type!=='t1'&&n.type!=='cdn'&&!['lvl','ntt','tly','cog','tat'].some(t=>CONE_S[t].has(n.id))).map(n=>n.id)`);
  fail('N3', out.filter((id) => !ex('N3', id)).map((id) => `${id} (${ev(`NET.${id}.name`)})`), 'give it a realistic upstream (up) in a founding Tier 1’s cone, or list it in EXCEPTIONS with a reason');
  fail('N3', Object.keys(EXCEPTIONS.N3).filter((id) => !out.includes(id)), 'these exceptions are no longer needed; remove them');
  fail('N3', J("NETS.filter(n=>(n.up||[]).some(u=>!NET[u]||NET[u].type==='cdn'||u===n.id)).map(n=>n.id)"), 'an upstream is another network that exists and sells transit, never content');
});

test('N4: no upstream cycles', () => {
  const bad = J(`(()=>{const o=[];for(const n of NETS){const seen=new Set(),q=(n.up||[]).slice();while(q.length){const u=q.pop();if(u===n.id){o.push(n.id);break;}if(seen.has(u))continue;seen.add(u);q.push(...((NET[u]||{}).up||[]));}}return o;})()`);
  fail('N4', bad, 'a network cannot buy transit from its own customers');
});

test('N5: traffic shares are sane', () => {
  fail('N5', J("NETS.filter(n=>!(n.share>0&&n.share<0.2)).map(n=>n.id)"), 'every share is positive and below 20%');
  for (const t of ['NSH', 'NSH_CN', 'NSH_RU', 'NSH_KRX']) {
    assert.ok(Math.abs(ev(`Object.values(${t}).reduce((a,b)=>a+b,0)`) - 1) < 1e-9, `N5: ${t} sums to 1`);
    fail('N5', J(`Object.entries(${t}).filter(([k,v])=>!NET[k]||!(v>=0)).map(([k])=>k)`), `${t} only holds real networks, never negative`);
  }
  // the content giants carry the traffic, eyeballs mostly ask for it
  assert.ok(ev("NETS.filter(n=>n.type==='cdn').reduce((a,n)=>a+NSH[n.id],0)") > 0.3, 'N5: content is at least 30% of traffic');
});

test('N6: every network has a type, a peering policy and a translated blurb', () => {
  fail('N6', J(`NETS.filter(n=>!['t1','t2','cdn','eye'].includes(n.type)||!['open','selective','restrictive','paid'].includes(n.pol)||!n.blurb||!n.col).map(n=>n.id)`), 'set type, pol, col and blurb:tr(...)');
  fail('N6', J("NETS.filter(n=>n.pol==='selective'&&!(n.minIx>=1&&n.minPni>=1)).map(n=>n.id)"), 'selective networks state minIx and minPni');
  fail('N6', J("NETS.filter(n=>n.type==='t1'||n.type==='t2'?!(n.price>0):false).map(n=>n.id)"), 'carriers have a transit price');
});

test('N7: presence is real: PoPs are cities, exchange ports only where the network is', () => {
  fail('N7', J("NETS.filter(n=>!n.pops.length||n.pops.some(c=>!CITY[c])||new Set(n.pops).size!==n.pops.length).map(n=>n.id)"), 'PoPs are real, distinct city ids');
  const bad = J(`NETS.filter(n=>Array.isArray(n.ix)).flatMap(n=>n.ix.filter(c=>!XIXM[c]&&(!CITY[c]||!CITY[c].ix||!n.pops.includes(c))).map(c=>n.id+':'+c))`).filter((k) => !ex('N7', k));
  fail('N7', bad, 'an exchange port needs an exchange in that city and a PoP there');
});

test('N8: a POP\'s traffic to the networks that sell to homes goes mostly to those whose users live near it (#48)', () => {
  // Every city keeps its total and content keeps its share: only the split between home networks follows geography.
  const bad = J(`CITIES.filter(c=>{const a=locSh(NSH,c.id);let t=0;for(let j=0;j<NETS.length;j++){t+=a[j];if(!NETS[j].cc&&Math.abs(a[j]-(NSH[NETS[j].id]||0))>1e-12)return true;}return Math.abs(t-1)>1e-9;}).map(c=>c.id)`);
  fail('N8', bad, 'locSh() must keep a city\'s total and every share of a network without home markets');
  // At home a network's share is above its world share, far away below it.
  const far = J(`NETS.filter(n=>n.cc&&NSH[n.id]>0).flatMap(n=>{const cc=[].concat(n.cc),home=CITIES.find(c=>cc.includes(c.cc)),away=CITIES.find(c=>!locNets()[LOC_NIX.get(n.id)].reg.has(c.reg));
    const j=LOC_NIX.get(n.id),out=[];if(home&&!(locSh(NSH,home.id)[j]>NSH[n.id]))out.push(n.id+'@home');if(away&&!(locSh(NSH,away.id)[j]<NSH[n.id]))out.push(n.id+'@away');return out;})`);
  fail('N8', far, 'LOC_HOME > LOC_REG > LOC_FAR, and home markets (cc) are where the users are');
});

// ---------- Modes and rules ----------

test('M1: On-call is the classic game: the default rules, and what old saves load as', () => {
  assert.deepEqual(J("(({preset,mods,...r})=>r)(makeRules('oncall'))"), J("(({mods,...r})=>{for(const k of RULE_LATE)delete r[k];return r;})(RULE_DEF)"), 'M1: On-call is RULE_DEF');
  assert.deepEqual(J("(()=>{const o=S.rules;S.rules=makeRules('oncall');const v=Object.keys(RULE_OK).map(rule);S.rules=o;return v;})()"), J("Object.keys(RULE_OK).map(k=>RULE_DEF[k])"), 'M1: and plays as RULE_DEF');
  assert.equal(ev("(()=>{const o=S.rules;delete S.rules;const p=rulePreset();S.rules=o;return p;})()"), 'oncall', 'M1: no rules means On-call');
  // the seeded On-call games are the rest of the suite (tests/game.test.js, tests/rules.test.js); they must stay green
});

test('M2: presets are ordered: Best Effort never harsher than Change Freeze, Change Freeze never harsher than On-call, BGP at 3 a.m. never gentler', () => {
  const P = J('PRESETS'), C = J('CHAOS'), D = J('RULE_DEF'), lead = { quick: 0, real: 1 }, v = (p, k) => P[p][k] !== undefined ? P[p][k] : D[k];
  assert.ok(C[P.soft.chaos].m <= C[P.freeze.chaos].m && C[P.freeze.chaos].m <= C[P.oncall.chaos].m && C[P.oncall.chaos].m <= C[P.bgp.chaos].m, 'M2: chaos');
  assert.ok(lead[P.soft.lead] <= lead[P.freeze.lead] && lead[P.freeze.lead] <= lead[P.oncall.lead] && lead[P.oncall.lead] <= lead[P.bgp.lead], 'M2: lead times');
  assert.ok((!P.soft.market || P.freeze.market) && (!P.freeze.market || P.oncall.market), 'M2: market');
  // The softenings only Best Effort has: every other Normal preset keeps the classic game's.
  for (const k of ['sea', 'confs', 'broke', 'moods', 'pnis']) for (const p of ['freeze', 'oncall', 'bgp']) assert.equal(v(p, k), D[k], `M2: ${p} keeps ${k}`);
  assert.deepEqual(['sea', 'confs', 'broke', 'moods', 'pnis'].map((k) => v('soft', k)), ['timer', false, 'rescue', 'patient', 'instant'], 'M2: Best Effort softens them all');
  assert.ok(P.bgp.market && P.bgp.money === 'normal' && P.bgp.gates === 'ladder', 'M2: BGP keeps every hardship');
  // seeded: the same network for a year under each preset
  const n = {};
  for (const p of ['soft', 'freeze', 'oncall', 'bgp']) {
    const g = load();
    g.ev(`beginGame('Order','fra',${lit({ mode: 'normal', preset: p })});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});__reseed(4242);for(let i=0;i<360;i++)dayTick()`);
    n[p] = g.ev('S.inc.length+S.stats.survived+(S.stats.incidents||0)');
    assert.deepEqual(g.errors, []);
  }
  assert.ok(n.soft <= n.freeze && n.freeze <= n.oncall && n.oncall <= n.bgp, `M2: incidents in a year: soft ${n.soft}, freeze ${n.freeze}, on-call ${n.oncall}, bgp ${n.bgp}`);
});

test('M3: every subsystem that can annoy the player reads a rule', () => {
  // [function, what it must read]
  const reads = [['dayPost', 'chaosMul()'], ['fireEvent', "rule('market')"], ['ddosTick', 'ddosOff()'],
    ['soldOut', "rule('market')"], ['hwMul', "rule('market')"], ['leadDays', "rule('lead')"], ['pniLead', 'leadDays'],
    ['dfBuildDays', 'leadDays'], ['dayPreRun', "rule('clock')"], ['snub', "rule('market')"], ['failureRun', 'shipsOn()'],
    ['upcomingConfs', 'confsOn()'], ['pniLead', 'pniNow()'], ['dayPost', "rule('broke')"], ['dayPost', "rule('moods')"], ['toast', 'quietOn()']];
  fail('M3', reads.filter(([f, r]) => !ev(`typeof ${f}==='function'&&${f}.toString().includes(${lit(r)})`)).map(([f, r]) => `${f}() does not read ${r}`), 'gate it on the ruleset (src/game/40-progress/30-rules.js)');
  // and in play: no chaos and no market means a quiet year
  const g = load();
  g.ev("beginGame('Quiet','fra',{mode:'normal',preset:'oncall'});if(UI.pendGame)ACT.pitchSkip();S.rules=makeRules('oncall',{chaos:'none',market:false});S.cash=1e9;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});ACT.buyIx({city:'fra',tier:1,signed:true});for(let i=0;i<360;i++)dayTick()");
  assert.equal(g.ev('S.inc.length+(S.stats.incidents||0)'), 0, 'M3: nothing breaks without chaos');
  assert.equal(g.ev("hwMul('rt')"), 1, 'M3: no hardware inflation without the market');
  assert.equal(g.ev("CITIES.slice(0,40).some(c=>soldOut('fra',c.id,1))"), false, 'M3: no sold-out routes without the market');
  assert.deepEqual(g.errors, []);
  assert.ok(Object.keys(EXCEPTIONS.M3).every((f) => ev(`typeof ${f}==='function'`)), 'M3: exceptions name real functions');
});

test('M4: scenarios and the weekly challenge always run On-call', () => {
  const g = load();
  const bad = [];
  for (const id of g.ev('JSON.stringify(SCN.map(x=>x.id))') && JSON.parse(g.ev('JSON.stringify(SCN.map(x=>x.id))'))) {
    g.ev(`beginGame('S','${id}'==='weekly'?'fra':SCN.find(x=>x.id==='${id}').city,{mode:'normal',preset:'bgp',rules:{chaos:'spicy'},scn:SCN.find(x=>x.id==='${id}')});if(UI.pendGame)ACT.pitchSkip()`);
    if (g.ev('S.rules.preset') !== 'oncall' || g.ev("rule('chaos')") !== 'normal') bad.push(id);
  }
  g.ev("ACT.startWeekly({sure:1});if(UI.pendGame)ACT.pitchSkip()");
  if (g.ev('S.scn&&S.scn.id') !== 'weekly' || g.ev('S.rules.preset') !== 'oncall') bad.push('weekly');
  fail('M4', bad, 'beginGame() must give scenarios On-call plus their own S.scn.rules');
  assert.deepEqual(g.errors, []);
});

test('M5: Sandbox has no locked feature', () => {
  const g = load();
  g.ev("beginGame('Box','fra',{mode:'sandbox'});if(UI.pendGame)ACT.pitchSkip()");
  assert.equal(g.ev('gatesOpen()'), true, 'M5: gates open');
  assert.equal(g.ev('lvl()'), g.ev('LEVELS.length'), 'M5: every level unlocked');
  assert.equal(g.ev('cabOpen()'), true, 'M5: own subsea cables');
  assert.equal(g.ev("rule('money')"), 'infinite', 'M5: money');
  assert.deepEqual(g.errors, []);
});

test('M6: a charter changes what you set out to do, never what things cost', () => {
  const bad = [];
  const g = load();
  g.ev("beginGame('Charter','fra',{mode:'normal',preset:'oncall'});if(UI.pendGame)ACT.pitchSkip()");
  if (!g.ev('charterDue()')) bad.push('a new Normal game does not ask for its charter');
  g.ev("ACT.charter({k:'broker'});S.lvl=1");
  const glass = (x) => g.ev(`JSON.stringify({opt:Object.keys(OPT).map(o=>optCost(o)),sys:Object.keys(DF_SYS).map(sysCost),dig:digCost(500),cab:ownCabCost(5000),rt:RG.map((r,i)=>routerCost(i,1))})`);
  const b = JSON.parse(glass());
  g.ev("S.charter='global';S.lvl=LEVELS.length");
  const c = JSON.parse(glass());
  for (const k of Object.keys(b)) if (JSON.stringify(b[k]) !== JSON.stringify(c[k])) bad.push(`a broker at level 1 pays other prices for ${k} than a backbone at the top level`);
  g.ev("S.charter='broker';S.lvl=1");
  if (g.ev('S.te') || (g.ev('ACT.buyTE()'), g.ev('S.te'))) bad.push('a broker skips the levels for something that is not glass (Auto-TE)');
  for (const o of ["{mode:'sandbox'}", "{mode:'puzzle'}", '{scn:SCN[0]}']) {
    const h = load();
    h.ev(`beginGame('X','fra',${o});if(UI.pendGame)ACT.pitchSkip()`);
    if (h.ev('charterDue()')) bad.push(`${o} asks for a charter`);
  }
  fail('M6', bad, 'the broker gets glass early, not cheaper; charters belong to Normal games only');
  assert.deepEqual(g.errors, []);
});

// ---------- Content ----------

test('C1: every scenario has a goal its card checks, and none is won on day 0', () => {
  const g = load();
  const ids = JSON.parse(g.ev('JSON.stringify(SCN.map(x=>x.id))'));
  assert.equal(new Set(ids).size, ids.length, 'C1: scenario ids are unique');
  const bad = [];
  for (const id of ids) {
    g.ev(`ACT.startScn({id:'${id}',sure:1});if(UI.pendGame)ACT.pitchSkip()`);
    const def = `SCN.find(x=>x.id==='${id}')`;
    if (!g.ev(`!!(${def}.n&&${def}.d&&${def}.goal&&typeof ${def}.ok==='function'&&${def}.days>0&&CITY[${def}.city])`)) bad.push(id + ': incomplete definition');
    if (g.ev(`(()=>{try{return !!${def}.ok();}catch(e){return false;}})()`)) bad.push(id + ': won on day 0');
    if (!g.ev(`typeof SCN_PROG['${id}']==='function'&&scnProg().items.length>0`)) bad.push(id + ': no progress card (SCN_PROG)');
  }
  // The published weekly scenarios too: each committed week starts, has its goal type's card, and needs play.
  const wdir = path.join(__dirname, '..', 'site', 'scenarios', 'weekly');
  for (const f of fs.readdirSync(wdir).filter((x) => /^\d{4}-W\d{2}\.json$/.test(x))) {
    const j = fs.readFileSync(path.join(wdir, f), 'utf8'), id = 'weekly ' + f.slice(0, -5);
    if (!g.ev(`wsBegin(${j},'S')`)) { bad.push(id + ': the game rejects it'); continue; }
    g.ev('if(UI.pendGame)ACT.pitchSkip();closeModal();compute()');
    if (g.ev('wsOk()')) bad.push(id + ': won on day 0');
    if (!g.ev('scnProg().items.length>0&&!!scnName()&&!!wsGoalTxt(S.scn.wk)')) bad.push(id + ': no progress card or goal');
    if (g.ev('S.rules.preset') !== 'oncall') bad.push(id + ': not On-call (M4)');
  }
  fail('C1', bad, 'give it n, d, goal, ok(), days, a city and a SCN_PROG entry; its goal must need play');
  assert.deepEqual(g.errors, []);
});

test('C2: every puzzle has a 1-star and a 3-star reference solution (tests/puzzles.test.js)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'puzzles.test.js'), 'utf8');
  const refs = [...src.matchAll(/^\s{2}([a-z0-9]+): \{ one: .*three: /gm)].map((m) => m[1]);
  fail('C2', J('PZ.map(p=>p.id)').filter((id) => !refs.includes(id)), 'add its reference solutions to REF in tests/puzzles.test.js (that suite builds and scores them)');
});

test('C3: every player-facing string is translated in every language', () => {
  const out = execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'i18n-check.js')], { encoding: 'utf8' });
  assert.match(out, /en\.js: \d+ labels, 0 problems/, 'C3: ' + out);
  const langs = out.split('\n').filter((l) => /^[a-z]{2}\.js: \d+ missing/.test(l));
  assert.ok(langs.length >= 5, 'C3: every language is checked');
  fail('C3', langs.filter((l) => !/0 missing, 0 unused, 0 broken/.test(l)), 'run node scripts/i18n-add.js (add-strings skill)');
});

// ---------- Fun and fairness ----------

test('F1: new players get a gentle start: nothing breaks for 45 days, no sold-out routes for 90, no hardware inflation for 180', () => {
  const g = load();
  g.ev("beginGame('New','fra',{mode:'normal',preset:'oncall'});if(UI.pendGame)ACT.pitchSkip()");
  assert.ok(g.ev('S.nextFail') >= 45 && g.ev('S.nextEvent') >= 40, 'F1: first outage after day 45, first event after day 40');
  // the first events are only good news or harmless (a viral hit, a price change, a grant)
  const opts = JSON.parse(g.ev(`(()=>{let o=null;const f=eval('('+fireEvent.toString().replace('const e=pick(opts);','o=opts.slice();return;')+')');S.day=45;f();return JSON.stringify(o);})()`));
  fail('F1', opts.filter((e) => !['viral', 'price', 'grant'].includes(e)), 'no bad events before day 50');
  assert.equal(g.ev("(()=>{for(let d=0;d<90;d++){S.day=d;if(CITIES.some(c=>soldOut('fra',c.id,1)))return true;}return false;})()"), false, 'F1: nothing sold out in the first 90 days');
  assert.equal(g.ev("(()=>{S.day=180;return hwMul('rt');})()"), 1, 'F1: hardware prices hold for 180 days');
  // customers get 15 days before a bad day costs them mood
  g.ev("S.day=10;S.biz=[{id:'b1',city:'fra',city2:null,reqs:[],name:'X',type:'host',bw:5,rate:100,mood:80,since:5}];compute();dayTick()");
  assert.ok(g.ev("(S.biz[0]||{mood:0}).mood") >= 80, 'F1: no mood loss in a customer’s first 15 days');
  assert.deepEqual(g.errors, []);
});

test('F2: a simple build in a start city makes money within three months on On-call', () => {
  // Reference build: launch broadband, the cheapest 100G transit in town, and a port with a route server where there is an exchange.
  const bad = [];
  for (const city of ['fra', 'nyc', 'sin', 'jnb']) {
    const g = load();
    g.ev(`beginGame('Ref','${city}',{mode:'normal',preset:'oncall'});if(UI.pendGame)ACT.pitchSkip()`);
    g.ev(`(()=>{const c='${city}',n=NETS.filter(n=>sellsAt(n,c)).sort((a,b)=>a.price*netMult(a,c)-b.price*netMult(b,c))[0];
      ACT.launchBB({city:c});ACT.buyTransit({city:c,net:n.id,tier:1});if(ixName(c)){ACT.buyIx({city:c,tier:1,signed:true});ACT.rs({city:c});}})()`);
    let month = 0;
    for (let m = 1; m <= 3 && !month; m++) { g.ev('for(let i=0;i<30;i++)dayTick()'); if (g.ev('R.revMo-R.costMo') > 0) month = m; }
    if (!month || g.ev('S.lost')) bad.push(`${city}: still losing money after 3 months (${Math.round(g.ev('R.revMo-R.costMo'))}/mo)`);
    assert.deepEqual(g.errors, []);
  }
  fail('F2', bad, 'a balance change made the start too hard; fix the balance, or argue for a new N in the gameplay-rules skill');
});

test('F3: a specialist path only brings customers you can already serve', () => {
  const g = load();
  g.ev("ACT.start({});S.cash=1e9;S.lvl=1;for(const c of ['nyc','chi','ash'])S.pops[c]=S.pops[c]||{day:0,bb:null,boost:0,down:0,routers:1,gen:false,rgen:0}");
  g.ev("S.links.push({id:'w',a:'nyc',b:'chi',kind:'wave',tier:2,km:kmBetween('nyc','chi'),cut:0,mo:0},{id:'d',a:'chi',b:'ash',kind:'df',own:true,sys:'roadm',ch:['zr4','zr4','zr4','zr4'],km:kmBetween('chi','ash'),sub:false,cable:null,mo:0,trench:'d',cut:0,day:0,ready:0,spares:false},{id:'e',a:'nyc',b:'ash',kind:'df',own:true,sys:'roadm',ch:['zr4'],km:kmBetween('nyc','ash'),sub:false,cable:null,mo:0,trench:'e',cut:0,day:0,ready:0,spares:false});compute()");
  const Jg = (x) => JSON.parse(g.ev(`JSON.stringify(${x})`));
  const sp = Jg('spots()');
  assert.ok(sp.length > 0, 'F3: the reference network is spotted');
  const bad = [];
  for (const s of sp) {
    const T = Jg(`BIZ_T.${s.t}`);
    if (!(T.lv > 1)) bad.push(`${s.t} needs no spotting at level 1`);
    if (![s.a, s.b].filter(Boolean).every((c) => g.ev(`!!S.pops['${c}']`))) bad.push(`${s.t} names a city without a POP`);
    if (s.k === 'lat' && !(g.ev(`bestLat('${s.a}','${s.b}')<=latMaxOf('${s.a}','${s.b}')`))) bad.push(`${s.t} ${s.a}–${s.b} is too slow`);
    if (s.k === 'df' && !(s.n >= T.opts[0] * 0.75)) bad.push(`${s.t} ${s.a}–${s.b} asks for far more than the fiber carries`);
  }
  fail('F3', bad, 'spots0() must only name what the network can serve, or nearly');
  assert.deepEqual(g.errors, []);
});

test('F4: the chaos monkey only visits On-call and BGP at 3 a.m., late, for 120 to 240 days, instead of the ordinary failures', () => {
  for (const preset of ['freeze', 'oncall', 'bgp']) {
    const g = load();
    g.ev(`beginGame('Monkey','fra',{mode:'normal',preset:'${preset}'});if(UI.pendGame)ACT.pitchSkip()`);
    g.ev("S.cash=1e9;S.lvl=4;for(const c of ['ams','lon','par'])ACT.buildPop({city:c});for(const [a,b] of [['fra','ams'],['ams','lon'],['lon','par'],['par','fra']]){UI.pending={a,b};ACT.buildLink({tier:1});}closeModal()");
    g.ev('for(let i=0;i<2;i++)dayTick()');
    if (preset === 'freeze') { assert.equal(g.ev('mkElig()'), false, 'F4: never in Change Freeze'); continue; }
    assert.ok(g.ev('S.monkey.next') >= 180, 'F4: not before day 180');
    g.ev('S.monkey.next=S.day;dayTick();S.nextFail=S.day');
    const len = g.ev('S.monkey.until-S.monkey.start');
    assert.ok(len >= 120 && len <= 240, `F4: a visit of ${len} days`);
    g.ev('for(let i=0;i<40;i++)dayTick()');
    assert.ok(g.ev('S.nextFail') <= g.ev('S.day'), 'F4: no ordinary failure fired during the visit');
    assert.ok(g.ev("S.inc.filter(i=>i.type==='cut').every(i=>i.until-i.start<=(rule('chaos')==='spicy'?11:7))"), 'F4: snips heal within a week (spicy stretches by half)');
    assert.deepEqual(g.errors, []);
  }
  const g = load();
  g.ev("beginGame('Monkey','fra',{mode:'normal',preset:'oncall'});if(UI.pendGame)ACT.pitchSkip();S.mode='sandbox'");
  assert.equal(g.ev('mkElig()'), false, 'F4: never in Sandbox');
});

test('F5: rented capacity never outgrows the route\'s market (#203)', () => {
  const g = load();
  g.ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;S.lvl=4;S.biz=[];S.offers=[];for(const c of ['jed','gdx'])ACT.buildPop({city:c})");
  g.ev("S.links.push({id:'f',a:'jed',b:'gdx',kind:'df',own:true,sys:'roadm',ch:[],km:9089,ready:0,day:0,cut:0,mo:1,trench:'own:f',pairs:1});compute();__reseed(5);ACT.listFiber({id:'f',w:120,p:1})");
  g.ev('for(let d=0;d<1500;d++){S.day++;brTick();if(d%7===0)spawnOffer();}for(const o of S.offers.filter(o=>o.link===\'f\'))ACT.accept({id:o.id})');
  // The market moves and grows (37-fiber-market.js): never more than the route wants at its hottest, today.
  const most = g.ev("Math.max(brMarket('jed','gdx'),Math.round(brMarket('jed','gdx')*0.5*CM_HMAX*Math.pow(cmGrowth(S.day),0.7)))");
  assert.ok(g.ev("brSold('jed','gdx')") <= most, `F5: no more than the route wants (${g.ev("brSold('jed','gdx')")} of ${most})`);
  assert.ok(g.ev("brSold('jed','gdx')") <= 3, 'a road to nowhere still sells only a little');
  assert.deepEqual(g.errors, []);
});

test('F6: an alien wave is priced against its fiber, and a full route earns a few times its lease (#203)', () => {
  const g = load();
  g.ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;S.lvl=6;S.biz=[];S.offers=[]");
  for (const [a, b] of [['lon', 'par'], ['lon', 'nyc'], ['fra', 'sin'], ['nyc', 'sjc'], ['jed', 'gdx']]) {
    const r = JSON.parse(g.ev(`(()=>{const l={id:'f6${a}${b}',a:'${a}',b:'${b}',kind:'df',own:true,sys:'cl',ch:[],km:Math.round(kmBetween('${a}','${b}')),ready:0,day:0,cut:0,mo:1,pairs:2};S.links.push(l);
      const F=dfLeaseMo(l.km)+ampCount(l.km)*AMP_MO,M=brMarket(l.a,l.b),rs=[];
      for(let i=0;i<M;i++){const r=wwRate(l,1);rs.push(r);S.biz.push({id:uid(),type:'wwave',link:l.id,slots:1,rate:r,city:l.a,city2:l.b,name:'n'+i,bw:1,mood:80,since:0,reqs:[]});}
      return JSON.stringify({F,rs});})()`));
    assert.ok(r.rs[0] <= 0.3 * r.F + 1, `F6: ${a}-${b} first wave ${r.rs[0]} vs fiber ${r.F}`);
    for (let i = 1; i < r.rs.length; i++) assert.ok(r.rs[i] <= r.rs[i - 1], `F6: ${a}-${b} never dearer than the one before`);
    const full = r.rs.reduce((x, y) => x + y, 0);
    assert.ok(full < 8 * r.F, `F6: ${a}-${b} full route ${(full / r.F).toFixed(1)}× its lease`);
  }
  assert.deepEqual(g.errors, []);
});

test('F7: extra crews cut a build on land to half its planned time at most (#203)', () => {
  const g = load();
  g.ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e11;S.lvl=4;for(const c of ['fra','mad'])if(!S.pops[c])ACT.buildPop({city:c})");
  const km = Math.round(g.ev("kmBetween('fra','mad')")), days = g.ev(`dfBuildDays(${km})`), d0 = g.ev('S.day');
  g.ev(`S.links.push({id:'f7',a:'fra',b:'mad',kind:'df',own:true,sys:'roadm',ch:[],km:${km},ready:S.day+${days},day:S.day,cut:0,mo:1,trench:'own:f7',pairs:1});ACT.crews({id:'f7',all:1});for(let i=0;i<50;i++)ACT.crews({id:'f7'})`);
  assert.ok(g.ev("S.links.find(l=>l.id==='f7').ready") - d0 >= days / 2, 'F7: never under half the planned build');
  assert.deepEqual(g.errors, []);
});

test('F8: a managed wave costs your own capacity, rides one optic, and is priced against its fiber', () => {
  const g = load();
  g.ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;S.lvl=6;S.biz=[];S.offers=[];for(const c of ['fra','ams'])if(!S.pops[c])ACT.buildPop({city:c})");
  g.ev("S.links.push({id:'f',a:'fra',b:'ams',kind:'df',own:true,sys:'cl',ch:['zr4','zr4'],km:400,ready:0,day:0,cut:0,mo:1,trench:'own:f',pairs:1});compute()");
  const r = "cmRoutes().get('ams|fra')";
  for (const [p, land, sea] of [['w400', 2.7, 3.8], ['w800', 4.6, 6.6], ['w1600', 7.8, 11]]) {
    assert.ok(Math.abs(g.ev(`cmList(${r},'${p}')/cmList(${r},'w100')`) - land) < 1e-9, `F8: ${p} on land`);
    assert.ok(Math.abs(g.ev(`(()=>{const x={...${r},sub:true};return cmList(x,'${p}')/cmList(x,'w100')})()`) - sea) < 1e-9, `F8: ${p} on subsea`);
  }
  for (let i = 1; i < 4; i++) assert.ok(g.ev(`cmList(${r},CM_W[${i}])/CM_G[CM_W[${i}]]<cmList(${r},CM_W[${i - 1}])/CM_G[CM_W[${i - 1}]]`), 'F8: cheaper per bit');
  assert.ok(Math.abs(g.ev(`cmList(${r},'spec')/(dfLeaseMo(400)+ampCount(400)*AMP_MO)`) - 0.3) < 1e-9, 'F8: spectrum lists at 30%');
  for (let d = 0; d < 720; d += 9) { const x = g.ev(`cmIdx(${r},'spec',0,0,${d})`); assert.ok(x >= 0.7 - 1e-9 && x <= 1.35 + 1e-9, `F8: heat moves a price by ${x}`); }
  assert.equal(g.ev("cmSpare(S.links[S.links.length-1],'w800',0)"), 0, 'F8: no 800G wave on 400G optics');
  g.ev("cmSell(S.links[S.links.length-1],'w400',1,100,0);compute()");
  assert.equal(g.ev("dfLit(S.links[S.links.length-1])-dfCap(S.links[S.links.length-1])"), 400, 'F8: it comes out of your own capacity');
  g.ev("S.links[S.links.length-1].ch=[]");
  assert.equal(g.ev("fiberOk(S.biz.find(b=>b.type==='mwave'))"), false, 'F8: unlit, its customer is down');
  assert.deepEqual(g.errors, []);
});

test('F9: a latency contract is late, capped, achievable, paid for its latency and credited when over it (#137)', () => {
  const T = J('BIZ_T.lowlat');
  assert.ok(T.lv >= 7, `F9: from customer level 7, not ${T.lv}`);
  assert.ok(T.l2 && T.lat && T.sla, 'F9: a circuit with a latency limit and an SLA');
  assert.ok(Math.min(...T.opts) >= 1600 && Math.max(...T.opts) <= T.max && T.max <= 3200, 'F9: 1.6T and up, never past 3.2T');
  assert.equal(ev("(()=>{const x={type:'lowlat',bw:BIZ_T.lowlat.max};return clGrow(x)||x.bw!==BIZ_T.lowlat.max;})()"), false, 'F9: never grows past its most');
  // Per Gbps on the same route, the bare contract beats any other big circuit with every extra it can ask for.
  const best = ev("Math.max(...['hyper','ai','aiwan'].map(t=>BIZ_T[t].km))*(1+REQS.diverse.bonus+REQS.metro.bonus+REQS.sharks.bonus+REQS.gen.bonus)");
  assert.ok(T.km > best, `F9: ${T.km} per km-unit against the best other big circuit's ${best}`);
  const g = load();
  g.ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;S.lvl=BIZ_T.lowlat.lv-1;S.biz=[];S.offers=[];for(const c of ['nyc','chi','lon','fra','tok','sin'])if(!S.pops[c])ACT.buildPop({city:c});compute()");
  const spawn = (n) => g.ev(`(()=>{const out=[];for(let i=0;i<${n};i++){S.offers=[];spawnOffer();out.push(...S.offers.filter(o=>o.type==='lowlat'));}S.offers=[];return JSON.stringify(out);})()`);
  assert.deepEqual(JSON.parse(spawn(400)), [], 'F9: none below its level');
  g.ev('S.lvl=BIZ_T.lowlat.lv');
  const os = JSON.parse(spawn(400));
  assert.ok(os.length > 0, 'F9: offered at its level');
  for (const o of os) assert.ok(g.ev(`Math.min(latFloor('${o.city}','${o.city2}'),bestLat('${o.city}','${o.city2}'))<=${o.latMax}`), `F9: ${o.city}–${o.city2} in ${o.latMax} ms can be built`);
  g.ev("S.biz.push({id:'x',type:'lowlat',name:'X',city:'nyc',city2:'chi',bw:1600,rate:100,reqs:['lat'],latMax:0.1,mood:100,since:S.day-30});compute()");
  const cash = g.ev('S.cash');
  assert.equal(g.ev("lcBreach(S.biz.find(b=>b.id==='x'),S.day)"), g.ev('LC_MOOD'), 'F9: over its limit, it loses patience');
  assert.equal(Math.round(cash - g.ev('S.cash')), g.ev('Math.round(1600*100/monLen(S.day))'), "F9: and a day's fee comes back as a credit");
  assert.deepEqual(g.errors, []);
});

// D1–D4: DDoS as networks see it (#242). tests/ddos-model.test.js plays each one in detail.
const ddFra = (ev) => ev("ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;S.lvl=4;S.nextFail=1e9;S.nextEvent=1e9;ACT.launchBB({city:'fra'});S.pops.fra.bb.d=40;ACT.buyTransit({city:'fra',net:'cog',tier:1});S.pops.fra.rgen=RG.findIndex(r=>r.fsN===8);S.biz.push({id:'g',type:'game',name:'G',city:'fra',bw:10,rate:1,mood:80,since:0,reqs:[]},{id:'d',type:'dia',name:'D',city:'fra',bw:5,rate:1,mood:80,since:0,reqs:[]});compute()");
const ddHit = (ev, g) => ev(`S.ev.ddos={id:'x',city:'fra',tgt:'g',vec:'dns',gbps:${g},start:S.day,until:S.day+2,bh:false};compute()`);
test('F10: growth goes sideways, plus one paid way up (#61, #323)', () => {
  // A PNI bundles eight members per router at its POP, up to 32; every other LAG stays at eight.
  assert.equal(ev('LAG_MAX'), 8, 'F10: transit, exchange and fabric LAGs hold eight members');
  const lim = J("[1,2,3,4,5,16].map(r=>{const o=S.pops.fra;S.pops.fra={routers:r};const m=pniLagMax('fra');if(o)S.pops.fra=o;else delete S.pops.fra;return m;})");
  assert.deepEqual(lim, [8, 16, 24, 32, 32, 32], 'F10: a PNI grows by eight members per router, up to 32');
  // Giant AI circuits land at campuses spread over many metros, no city more than two.
  const per = J("MEGA.reduce((m,x)=>(m[x.c]=(m[x.c]||0)+1,m),{})");
  assert.ok(Object.keys(per).length >= 30, `F10: campuses in at least 30 metros (${Object.keys(per).length})`);
  fail('F10', Object.entries(per).filter(([, n]) => n > 2).map(([c]) => c), 'no metro holds more than two campuses');
  fail('F10', J("MEGA.filter(m=>!CITY[m.c]).map(m=>m.c)"), 'campuses sit in real cities');
});

test('D1: attack sizes come from the world, never from your network', () => {
  const g = load();
  ddFra(g.ev);
  g.ev('S.day=400');
  const draw = () => g.ev("__reseed(8);JSON.stringify(Array.from({length:500},()=>ddosSize({tgt:'d'})))");
  const a = draw();
  g.ev('S.pops.fra.bb.d*=10;compute()');
  assert.equal(draw(), a, 'D1: ten times the subscribers, the same attacks');
  assert.ok(Math.max(...JSON.parse(a)) <= g.ev('DD_REC'), 'D1: never past the record');
  g.ev('S.day=10');
  assert.ok(Math.max(...JSON.parse(g.ev("__reseed(8);JSON.stringify(Array.from({length:500},()=>ddosSize({tgt:'d'})))"))) <= 2 * g.ev('ddMaxPort()'), 'D1: early floods stay within twice your biggest port');
  assert.deepEqual(g.errors, []);
});
test('D2: a full port slows everyone on it', () => {
  const g = load();
  ddFra(g.ev);
  ddHit(g.ev, 200);
  assert.equal(g.ev('R.ddos[0].full'), 1, 'D2: the port is full');
  assert.ok(g.ev("bizSf(S.biz.find(b=>b.id==='d'),linkIds())") < 0.9, 'D2: the bystander loses traffic');
  assert.deepEqual(g.errors, []);
});
test('D3: only upstream tools and scrubbing keep a flood off your ports; Flowspec works behind them, within its budget', () => {
  const g = load();
  ddFra(g.ev);
  ddHit(g.ev, 200);
  assert.ok(g.ev('R.ddos[0].fs') > 0 && g.ev('R.ddos[0].full') === 1, 'D3: Flowspec drops what got in, the port stays full');
  assert.deepEqual(JSON.parse(g.ev('JSON.stringify(R.fsUse.fra)')), { used: 1, cap: 8 }, 'D3: one rule of the router\'s own eight');
  g.ev("S.transit[0].clean=true;compute()");
  assert.equal(g.ev('R.ddos[0].full'), 0, 'D3: a clean pipe scrubs upstream');
  g.ev("S.transit[0].clean=false;S.scrubs=[{city:'fra',tier:1}];S.scrubMode='always';compute()");
  assert.equal(g.ev('R.ddos[0].full'), 0, 'D3: an engaged center pulls it off the ports');
  assert.deepEqual(g.errors, []);
});
test('D4: RTBH costs only the target', () => {
  const g = load();
  ddFra(g.ev);
  ddHit(g.ev, 200);
  g.ev("ACT.rtbh({id:'x'})");
  assert.equal(g.ev("bizSf(S.biz.find(b=>b.id==='g'),linkIds())"), 0, 'D4: the target is dark');
  assert.ok(g.ev("bizSf(S.biz.find(b=>b.id==='d'),linkIds())") >= 0.97, 'D4: everyone else is saved');
  g.ev('S.ev.ddos.until=S.day;dayTick()');
  assert.equal(g.ev('S.stats.ddosSac'), 1, 'D4: sacrificed, not held');
  assert.equal(g.ev('S.stats.ddosOk||0'), 0);
  assert.deepEqual(g.errors, []);
});

// ---------- Orbit ----------

// A Tier 1 one step from the win (as in tests/pie-in-the-sky.test.js).
const pieT1 = (g) => {
  g.ev("S.cash=1e11;S.lvl=6;for(const x of GOALS)S.done[x.id]=0;delete S.done.t1;ACT.launchBB({city:'fra'});S.pops.fra.bb.d=500;S.transit=[];S.ixp={};S.peers={};S.pni=[];S.grace=null;S.nextFail=1e9;S.nextEvent=1e9");
  g.ev("for(const n of t1Need())S.pni.push({id:'p'+n.id,net:n.id,city:'fra',tier:2});compute();for(const n of NETS)if(!R.reachable[n.id]){if(!S.pops[n.pops[0]])S.pops[n.pops[0]]={day:0,bb:null,boost:0,down:0,routers:1,gen:false};S.pni.push({id:'i'+n.id,net:n.id,city:n.pops[0],tier:0});}compute()");
};
test('O1: the rocket company unlocks only on a Tier 1 win of its version, or in sandbox', () => {
  const g = load();
  g.ev("beginGame('Pie','fra',{mode:'normal',preset:'oncall'});if(UI.pendGame)ACT.pitchSkip()");
  assert.equal(g.ev('S.pieV'), 1, 'O1: newGame() sets pieV');
  pieT1(g);
  assert.equal(g.ev('pieOn()'), false, 'O1: locked before the win');
  g.ev('checkGoals()');
  assert.equal(g.ev('pieOn()&&pieCanBuild()'), true, 'O1: open on the win');
  g.ev("const o=JSON.parse(JSON.stringify(S));delete o.pieV;delete o.pie;S=migrate(o);compute();checkGoals()");
  assert.equal(g.ev('pieOn()'), false, 'O1: an old won save stays locked');
  g.ev("const o=JSON.parse(JSON.stringify(S));o.pieV=1;o.pie={};o.scn={id:'redsea'};S=migrate(o)");
  assert.equal(g.ev('pieOn()'), false, 'O1: never in a scenario');
  const sb = load();
  sb.ev("ACT.modeSet({m:'sandbox'});ACT.start({});if(UI.pendGame)ACT.pitchSkip()");
  assert.equal(sb.ev('S.day===0&&pieOn()&&pieCanBuild()'), true, 'O1: sandbox from day 0');
  const won = load();
  won.ev("beginGame('Pie','fra',{mode:'normal',preset:'oncall'});if(UI.pendGame)ACT.pitchSkip()");
  pieT1(won);
  won.ev("checkGoals();ACT.buildPop({city:'sin'});S.transit.push({id:'tt',city:'fra',net:'cog',tier:1,n:1,down:0});compute()");
  assert.equal(won.ev('pieCanBuild()'), false, 'O1: no longer Tier 1, nothing new');
  assert.deepEqual([...g.errors, ...sb.errors, ...won.errors], []);
});

// A sandbox with London and New York (a transatlantic wave), Frankfurt, transit, a full dish at each, and a full Shortcrust.
const orbit = (las = true, n = 'CRUSTS.short.full') => { const g = load();
  g.ev("ACT.modeSet({m:'sandbox'});ACT.start({});if(UI.pendGame)ACT.pitchSkip();S.nextFail=1e9;S.nextEvent=1e9;for(const c of ['lon','nyc','fra'])if(!S.pops[c])ACT.buildPop({city:c});S.links=[]");
  g.ev("S.links.push({id:'ln',a:'lon',b:'nyc',kind:'wave',tier:3,km:5818,sub:true,cable:'grace',cut:0,mo:1},{id:'lf',a:'lon',b:'fra',kind:'wave',tier:3,km:640,sub:false,cut:0,mo:1});for(const c of ['lon','nyc','fra'])ACT.buyTransit({city:c,net:'cog',tier:1})");
  g.ev(`ACT.pieFound();for(const c of ['lon','nyc','fra']){ACT.pieDish({city:c});S.pie.lic[CITY[c].cc]={state:'ok',until:1e6};}for(const x of S.pie.dishes)x.ant=PIE_ANT_MAX;S.pie.crusts.short.cohorts=[{n:${n},day:S.day,las:${las}}];compute()`);
  g.c = (id, a, b, t = 'hft', bw = 5) => g.ev(`S.biz.push({id:'${id}',type:'${t}',city:'${a}',city2:${b ? `'${b}'` : 'null'},bw:${bw},rate:1,reqs:[],latMax:null,route:'${b ? 'fast' : 'normal'}',name:'${id}',mood:100,since:0,sites:null});compute()`);
  g.sky = (id) => g.ev(`Object.keys(R.ef).some(k=>k.startsWith('pie:')&&R.ef[k].eg['l2:${id}']>0)`);
  return g; };

test('O2: a crust carries nothing under 40% and a growing share up to 60%; orbit never carries more than the dishes', () => {
  const g = orbit(true, 'Math.floor(CRUSTS.short.full*0.39)');
  g.c('h', 'lon', 'nyc'); g.c('p', 'pcn', null, 'pizza', 50);
  assert.equal(g.sky('h'), false, 'O2: a crust under 40% carried a circuit');
  assert.equal(g.ev('R.pie.sf.p'), 0, 'O2: a crust under 40% served a terminal');
  // from 40% to 60% the share it carries grows from nothing to all of its pies' capacity: a slope, not a cliff
  const cap = (p) => g.ev(`S.pie.crusts.short.cohorts=[{n:Math.round(CRUSTS.short.full*${p}),day:S.day,las:true}];compute();(R.pie.crust.find(c=>c.id==='short')||{cap:0}).cap`);
  const caps = [0.4, 0.45, 0.5, 0.55, 0.6, 0.8].map(cap), G = g.ev('CRUSTS.short.g');
  assert.ok(caps[0] < G * 0.01, `O2: at 40% it carries ${caps[0]} G`);
  for (let i = 1; i < caps.length; i++) assert.ok(caps[i] > caps[i - 1], `O2: more pies, more traffic (${caps.join(', ')})`);
  assert.ok(Math.abs(caps[4] - G * 0.6) < G * 0.01 && Math.abs(caps[5] - G * 0.8) < G * 0.01, 'O2: baked from 60%, all of its coverage carries');
  g.ev("S.pie.crusts.short.cohorts=[{n:CRUSTS.short.full,day:S.day,las:true}];for(let i=0;i<20;i++)S.biz.push({id:'b'+i,type:'boat',city:'pcn',city2:null,bw:800,rate:1,reqs:[],route:'normal',name:'b'+i,mood:100,since:0,sites:null});compute()");
  for (const d of JSON.parse(g.ev('JSON.stringify(pieDishes())'))) assert.ok(g.ev(`R.pie.used.${d.city}`) <= d.g + 1e-6, `O2: the ${d.city} dish carries ${g.ev(`R.pie.used.${d.city}`)} G on ${d.g} G of antennas`);
  assert.deepEqual(g.errors, []);
});

test('O3: a cut-off pie dish carries only its own POP\'s traffic (backhaul) and local terminals, never transit between other cities', () => {
  const g = orbit();
  g.ev("ACT.buildPop({city:'syd'});ACT.pieDish({city:'syd'});S.pie.lic.AU={state:'ok',until:1e6};S.pops.syd.bb={d:5};S.pops.lon.bb={d:20};S.pops.nyc.bb={d:20};compute()");
  assert.ok(g.ev("R.pie.isl.includes('syd')"), 'O3: the island dish is flagged');
  g.c('h', 'lon', 'nyc'); g.c('s', 'lon', 'syd'); g.c('b', 'nyc', 'lon', 'l2vpn', 10); g.c('p', 'cbr', null, 'pizza', 5);
  const syd = g.ev("JSON.stringify(Object.keys(R.ef).filter(k=>k.includes('syd')))");
  assert.deepEqual(JSON.parse(syd), ['pie:bh:syd'], 'O3: the only edge at the island dish is its own backhaul');
  const ef = JSON.parse(g.ev("JSON.stringify(R.ef['pie:bh:syd'])"));
  assert.ok(ef.eg['l2:s'] > 0, "O3: Sydney's own circuit rides its backhaul");
  assert.ok(!ef.eg['l2:h'] && !ef.eg['l2:b'], 'O3: a circuit between two other cities crossed the island dish');
  // IP flows are counted by the POP they come from (and circuits by their far end): only Sydney's own
  assert.deepEqual(Object.keys(ef.dst).filter((c) => c !== 'syd' && !(c === 'lon' && ef.eg['l2:s'] > 0)), [], 'O3: another POP\'s traffic crossed the backhaul');
  assert.ok(ef.dst.syd > 0, "O3: Sydney's eyeballs and its terminal ride the backhaul");
  assert.ok(g.ev("Object.keys(R.ef).filter(k=>k.startsWith('pie:')&&k!=='pie:bh:syd').every(k=>Object.keys(R.ef[k].eg).every(e=>e.startsWith('l2:')))"), 'O3: IP traffic of a POP on the backbone crossed orbit');
  assert.deepEqual(g.errors, []);
});

test('O4: vacuum latency, and orbit never beats fiber under 3,000 km or carries bulk', () => {
  const g = orbit();
  g.c('h', 'lon', 'nyc');
  const km = g.ev("pieKm('lon','nyc')");
  assert.equal(g.sky('h'), true, 'O4: a long latency circuit takes the lasers');
  assert.ok(Math.abs(g.ev('R.l2lat.h') - g.ev(`pieSkyMs(${km},CRUSTS.short.alt)`)) < 1.5, 'O4: priced at c in vacuum along the great circle');
  assert.ok(Math.abs(g.ev('PIE_C') / 200 - 1.47) < 0.05, 'O4: vacuum (km/ms) is ~1.47x the glass the links are priced at (200 km/ms)');
  g.c('n', 'lon', 'fra');
  assert.equal(g.sky('n'), false, 'O4: orbit carried a route under 3,000 km');
  g.c('b', 'lon', 'nyc', 'l2vpn', 10);
  assert.equal(g.sky('b'), false, 'O4: orbit carried a circuit that does not need the latency');
  assert.equal(g.ev("Object.keys(R.ef).filter(k=>k.startsWith('pie:')).every(k=>Object.keys(R.ef[k].eg).every(e=>e.startsWith('l2:')))"), true, 'O4: IP traffic crossed orbit');
  g.ev("S.pie.crusts.short.cohorts=[{n:CRUSTS.short.full,day:S.day,las:false}];compute()");
  assert.equal(g.sky('h'), false, 'O4: no lasers, no space path');
  assert.deepEqual(g.errors, []);
});

test('O5: launches fail only with chaos on, never in the first 90 days after the unlock', () => {
  const fly = (setup, after) => {
    const g = load();
    g.ev(setup);
    if (!g.ev('gatesOpen()')) { pieT1(g); g.ev('checkGoals()'); }
    g.ev("ACT.buildPop({city:'sin'});ACT.pieFound();ACT.pieFactory();ACT.piePad({city:'sin'});S.pie.stock=100");
    g.ev(`S.day=S.pie.born+${after};S.pie.pads[0].next=0;Math.random=()=>0;ACT.pieLaunch({rk:'falcon',cr:'short'});S.pie.q[0].day=S.day;pieDay(S.day)`);
    assert.deepEqual(g.errors, []);
    return g.ev("pieLive('short')");
  };
  const oncall = "beginGame('Pie','fra',{mode:'normal',preset:'oncall'});if(UI.pendGame)ACT.pitchSkip()";
  assert.equal(fly(oncall, 89), 20, 'O5: quiet for 90 days');
  assert.equal(fly(oncall, 90), 0, 'O5: then chaos can take a launch');
  assert.equal(fly("ACT.modeSet({m:'sandbox'});ACT.start({});if(UI.pendGame)ACT.pitchSkip()", 400), 20, 'O5: chaos none, nothing fails');
  // orbit incidents and spats: the same gate
  const g = load();
  g.ev("beginGame('Pie','fra',{mode:'normal',preset:'oncall',rules:{gates:'open'}});if(UI.pendGame)ACT.pitchSkip();S.cash=1e12;ACT.pieFound()");
  assert.ok(g.ev('!!S.pie.co'), 'a company to annoy');
  assert.ok(g.ev("['pieIncDay','pieSpatDayAll'].every(f=>window[f].toString().includes('pieChaos()'))&&pieChaos.toString().includes('chaosMul()')&&pieChaos.toString().includes('PIE_QUIET')"), 'O5: incidents and spats read pieChaos()');
  assert.equal(g.ev('S.day=S.pie.born+89;pieChaos()'), false, 'O5: quiet for 90 days');
  assert.equal(g.ev('S.day=S.pie.born+90;pieChaos()'), true, 'O5: then they may come');
  assert.equal(g.ev("S.rules.chaos='none';pieChaos()"), false, 'O5: never without chaos');
  assert.deepEqual(g.errors, []);
});

test('O7: a fresh Tier 1 cannot afford a full Shortcrust in its first year', () => {
  // Reference: the big-network benchmark save, a won network far larger than a fresh Tier 1. A year of its profit at
  // today's revenue (costs ignored, so generously) plus the largest loan any bank offers (12x monthly revenue), and the
  // most the Ex-Im Pie Bank lends a rocket company on top.
  const g = load();
  const save = fs.readFileSync(path.join(__dirname, 'fixtures', 'big-network.json'), 'utf8');
  g.ev(`S=migrate(JSON.parse(${lit(save)}));compute()`);
  const rev = g.ev('R.revMo'), loan = g.ev('Math.max(...Object.values(BANKS).map(b=>b.amt[1]))') * rev + g.ev('pieEximCap()'), cash = Math.max(0, g.ev('S.cash'));
  const year = 12 * rev + loan + Math.min(cash, 12 * rev);
  const full = g.ev("pieFullCost('short')");
  assert.ok(full > 5e9, `O7: a full Shortcrust costs ${Math.round(full / 1e6)}M`);
  assert.ok(year < full, `O7: ${Math.round(year / 1e6)}M in a year buys a full Shortcrust (${Math.round(full / 1e6)}M); make orbit dearer`);
  assert.deepEqual(g.errors, []);
});

// O7's other half (a full lasered Shortcrust pays back in 5 to 10 years, never sooner) is played through the game loop
// in tests/pie-balance.test.js, so it counts launches, aging, incidents, churn and every running cost.

test('no page errors while checking the rules', () => {
  assert.deepEqual(errors, []);
});
