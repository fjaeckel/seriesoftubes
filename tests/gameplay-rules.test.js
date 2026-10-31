// The game's design rules (.claude/skills/gameplay-rules/SKILL.md): one test per rule id, on the live data.
// A rule may only be broken by an entry in EXCEPTIONS below, with its reason. Never delete a check to make it pass.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { load } = require('./harness');

// Every exception names what breaks the rule and why. One per line, sorted within each rule.
const EXCEPTIONS = {
  // W2: countries with fewer than two consumer networks of their own, because real life has fewer.
  W2: {
    CU: 'Cuba has one state operator (ETECSA); Cubacel is its own mobile brand',
    DJ: 'Djibouti Telecom is the monopoly for homes and phones',
    MH: 'the Marshall Islands have one telco (NTA)',
    PN: 'Pitcairn has no network at all: land your own cable (#124)',
    SH: 'St Helena has one operator (Sure South Atlantic)',
  },
  // W3: cities nobody sells transit in.
  W3: {
    ivc: 'Invercargill waits for its AI campus; nobody sells transit there yet',
    pcn: 'Pitcairn: no cable, no network, land your own (#124)',
    prr: 'Prince Rupert is a remote town with no carrier in it',
    stg: 'Stuttgart is the Only Spätzle-IX scenario city: peering only, by design (#114)',
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
    dtk: 'transit-free incumbent',
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
    ert: 'Russia: buys from Rostelecomedy (#70)',
    opt: 'Australian, buys from SingTell (#148)',
    pnt: 'Australian (#148)',
    rtc: 'Russia (#70)',
    sgt: 'a transit-free Tier 2',
    skb: 'Korea: sender pays',
    spc: 'transit-free incumbent',
    stb: 'satellite: peers for its own reach',
    stc: 'transit-free in Saudi Arabia',
    teg: 'owns the land crossing; transit-free',
    tim: 'buys from Sparkly Seabone, a Tier 1 only for games since 1.12',
    tmt: 'buys from Sparkly Seabone, a Tier 1 only for games since 1.12',
    tmx: 'transit-free in Mexico',
    tmy: 'Malaysian incumbent, peers for its own reach',
    tng: 'a transit-free Tier 2',
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
  'AT&T', 'BICS', 'Cogent', 'GTT', 'Hurricane Electric', 'Level 3', 'Level3', 'Liquid', 'Liquid Intelligent Technologies', 'Lumen', 'NTT', 'Orange', 'PCCW', 'Seacom', 'Singtel', 'Sparkle', 'Tata', 'Tata Communications', 'Telia', 'Telxius', 'Vodafone', 'Zayo',
  // content and clouds
  'Akamai', 'Alibaba Cloud', 'Amazon', 'Amazon Web Services', 'AWS', 'Baidu', 'ByteDance', 'Cloudflare', 'Facebook', 'Fastly', 'Google', 'Mercado Libre', 'Meta', 'Microsoft', 'Netflix', 'Tencent', 'TikTok', 'VK', 'VKontakte', 'Yandex',
  // eyeballs and incumbents
  'A1', 'A1 Telekom Austria', 'AIS', 'Airtel', 'Algérie Télécom', 'Altibox', 'Altice', 'America Movil', 'Angola Cables', 'Antel', 'ASTCA', 'Aussie Broadband', 'Bell', 'Bell Canada', 'Belong', 'Bemobile', 'Brisanet', 'BT', 'BTC', 'Cable & Wireless', 'Cable Bahamas', "CAN'L", 'Canal+', 'CANTV', 'CelcomDigi', 'China Mobile', 'China Telecom', 'China Unicom', 'Chunghwa Telecom', 'Citymesh', 'Claro', 'Comcast', 'Cosmote', 'Cox', 'CV Telecom', 'Deutsche Telekom', 'Dhiraagu', 'Dialog', 'Digi', 'Digicel', 'Djezzy', 'Djibouti Telecom', 'DNA', 'Docomo', 'Docomo Pacific', 'Dodo', 'du', 'Eastlink', 'Elisa', 'Emtel', 'Entel', 'ER-Telecom', 'Etisalat', 'ETECSA', 'Ethio Telecom', 'Exetel', 'Far EasTone', 'Fastweb', 'FINTEL', 'Flow', 'Free', 'Frontier', 'GCI', 'Globe', 'Google Fiber', 'Grameenphone', 'GSL Networks', 'GTA', 'Hawaiian Telcom', 'HKBN', 'HKT', 'iiNet', 'Jazz', 'Jio', 'KDDI', 'KPN', 'KT', 'Kyivstar', 'Launtel', 'Leaptel', 'LG U+', 'Liberty Latin America', 'lifecell', 'LMT', 'Magyar Telekom', 'Maroc Telecom', 'Mascom', 'Mauritius Telecom', 'MegaFon', 'MEO', 'Mobily', 'Movicel', 'Movistar', 'Movitel', 'MTC', 'MTN', 'mts', 'Neptune', 'Netvigator', 'Norlys', 'NOS', 'Nova', 'NTA', 'NTT Docomo', 'Oi', 'Omantel', 'One Communications', 'One NZ', 'Ooredoo', 'OPT', 'Optimum', 'Optus', 'Palau Mobile', 'Paradise Mobile', 'Pentanet', 'PLDT', 'PNCC', 'POST', 'Proximus', 'PTCL', 'Reliance Jio', 'Robi', 'Rogers', 'Rostelecom', 'Safaricom', 'SFR', 'Síminn', 'SK Broadband', 'Sky', 'SLT', 'Sonic', 'Spark', 'Spectrum', 'Spintel', 'Starlink', 'StarHub', 'STC', 'Superloop', 'Sure', 'Swisscom', 'T-Mobile', 'Tango', 'TCC', 'TDC', 'Tele2', 'Telecel', 'Telecom Argentina', 'Telecom Egypt', 'Telecom Fiji', 'Telecom Namibia', 'Telekom Malaysia', 'Telekom Srbija', 'Telenet', 'Telenor', 'Telikom PNG', 'Telkomsel', 'Telma', 'Telmex', 'TelOne', 'Telstra', 'Telus', 'Tet', 'TIM', 'Tigo', 'TPG', 'True', 'True Move', 'TSTT', 'Turk Telekom', 'Unitel', 'UPC', 'Verizon', 'Viettel', 'Vini', 'Virgin Media', 'Vivacom', 'Vivo', 'VNPT', 'Vocus', 'Yas', 'Yettel', 'YouSee', 'Zeop',
  // exchanges and data centers
  'AMS-IX', 'Any2', 'BCIX', 'CoreSite', 'DE-CIX', 'Digital Realty', 'Equinix', 'France-IX', 'Interxion', 'IX.br', 'JPIX', 'LINX', 'NAPAfrica', 'NetIX', 'NIX', 'NL-ix', 'SIX', 'Telehouse',
  // cables
  '2Africa', 'Amitié', 'Dunant', 'EllaLink', 'Equiano', 'Grace Hopper', 'Hibernia Express', 'Jupiter', 'MAREA', 'PEACE', 'SEA-ME-WE 6',
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
  // eyeballs, and the Tier 2 incumbents that sell to homes and phones in their home markets.
  const rows = J(`(()=>{const cs={};for(const c of CITIES)if(!c.off)(cs[c.cc]=cs[c.cc]||[]).push(c.id);
    return Object.keys(cs).sort().map(cc=>[cc,NETS.filter(n=>(n.type==='eye'||n.type==='t2')&&[].concat(n.cc||[]).includes(cc)&&n.pops.some(p=>CITY[p].cc===cc)).map(n=>n.name)]);})()`);
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

test('N2: names are puns: no network, cable, exchange, data center, router or optic carries a real name', () => {
  const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim();
  const real = new Set(REAL_NAMES.map(norm));
  const names = J(`[...NETS.map(n=>['network',n.name]),...CABLES.map(c=>['cable',c.name]),...XIX.map(x=>['exchange',x.name]),
    ...CITIES.flatMap(c=>[['exchange',c.ix],['data center',c.dc],['data center',c.dc2]]),...RG.map(r=>['router',r.n]),...Object.values(OPT).map(o=>['optic',o.n]),...Object.values(SEAT_ROUTES).flat().map(r=>['cable',r[2]])].filter(x=>x[1])`);
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

// ---------- Modes and rules ----------

test('M1: On-call is the classic game: the default rules, and what old saves load as', () => {
  assert.deepEqual(J("(({preset,mods,...r})=>r)(makeRules('oncall'))"), J("(({mods,...r})=>r)(RULE_DEF)"), 'M1: On-call is RULE_DEF');
  assert.equal(ev("(()=>{const o=S.rules;delete S.rules;const p=rulePreset();S.rules=o;return p;})()"), 'oncall', 'M1: no rules means On-call');
  // the seeded On-call games are the rest of the suite (tests/game.test.js, tests/rules.test.js); they must stay green
});

test('M2: presets are ordered: Change Freeze never harsher than On-call, BGP at 3 a.m. never gentler', () => {
  const P = J('PRESETS'), C = J('CHAOS'), lead = { quick: 0, real: 1 };
  assert.ok(C[P.freeze.chaos].m <= C[P.oncall.chaos].m && C[P.oncall.chaos].m <= C[P.bgp.chaos].m, 'M2: chaos');
  assert.ok(lead[P.freeze.lead] <= lead[P.oncall.lead] && lead[P.oncall.lead] <= lead[P.bgp.lead], 'M2: lead times');
  assert.ok(!P.freeze.market || P.oncall.market, 'M2: market');
  assert.ok(P.bgp.market && P.bgp.money === 'normal' && P.bgp.gates === 'ladder', 'M2: BGP keeps every hardship');
  // seeded: the same network for a year under each preset
  const n = {};
  for (const p of ['freeze', 'oncall', 'bgp']) {
    const g = load();
    g.ev(`beginGame('Order','fra',${JSON.stringify({ mode: 'normal', preset: p })});if(UI.pendGame)ACT.pitchSkip();S.cash=1e9;ACT.launchBB({city:'fra'});ACT.buyTransit({city:'fra',net:'cog',tier:1});__reseed(4242);for(let i=0;i<360;i++)dayTick()`);
    n[p] = g.ev('S.inc.length+S.stats.survived+(S.stats.incidents||0)');
    assert.deepEqual(g.errors, []);
  }
  assert.ok(n.freeze <= n.oncall && n.oncall <= n.bgp, `M2: incidents in a year: freeze ${n.freeze}, on-call ${n.oncall}, bgp ${n.bgp}`);
});

test('M3: every subsystem that can annoy the player reads a rule', () => {
  // [function, what it must read]
  const reads = [['dayTick', 'chaosMul()'], ['fireEvent', "rule('market')"], ['ddosTick', 'ddosOff()'],
    ['soldOut', "rule('market')"], ['hwMul', "rule('market')"], ['leadDays', "rule('lead')"], ['pniLead', 'leadDays'],
    ['dfBuildDays', 'leadDays'], ['dayTick', "rule('clock')"], ['snub', "rule('market')"]];
  fail('M3', reads.filter(([f, r]) => !ev(`typeof ${f}==='function'&&${f}.toString().includes(${JSON.stringify(r)})`)).map(([f, r]) => `${f}() does not read ${r}`), 'gate it on the ruleset (src/game/40-progress/30-rules.js)');
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
  g.ev('for(let d=0;d<1500;d++){brTick();if(d%7===0)spawnOffer();}for(const o of S.offers.filter(o=>o.link===\'f\'))ACT.accept({id:o.id})');
  assert.ok(g.ev("brSold('jed','gdx')") <= g.ev("brMarket('jed','gdx')"), 'F5: no more than the route wants');
  assert.deepEqual(g.errors, []);
});

test('no page errors while checking the rules', () => {
  assert.deepEqual(errors, []);
});
