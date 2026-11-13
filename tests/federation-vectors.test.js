// The game against every shared federation vector (federation/vectors/, docs/FEDERATION-PROTOCOL.md): the same files
// the Go relay runs. Every folder must be known here: a new area fails until it is run (or listed below with a reason).
// The game's own functions run inside the page; inputs go in as JSON, results come back as JSON.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./harness');

const DIR = path.join(__dirname, '..', 'federation', 'vectors');
// Areas the client does not compute, and why. Everything else runs, every case.
const SKIP = {
  rank: 'the server answers rank requests (9.5); the game merges answers (tests/federation-slices.test.js)',
  autosync: 'which servers connect to which (10.9) is for relays; a game never dials another server',
};
const hexB64 = (h) => Buffer.from(h, 'hex').toString('base64url');

// Each area: (ev, input) -> the result to compare with expect.
const AREA = {
  canonical: (run, i) => run(`(()=>{const t=i.hex!==undefined?fedUtf8Text(new Uint8Array(i.hex.match(/../g).map(x=>parseInt(x,16)))):i.text;
    if(t==null)return {error:'bad_json'};const p=fedParse(t);return p.e?{error:p.e}:{canonical:fedCanon(p.v)};})()`, i),
  signing: async (run, i) => {
    if (!i.unsigned) return run(`(async()=>{const keys={};for(const [n,h] of Object.entries(i.seeds))keys[n]=(await fedSigner(h)).pub;return {keys};})()`,
      { seeds: Object.fromEntries(Object.entries(i.seeds).map(([n, h]) => [n, hexB64(h)])) });
    const seeds = i.seed ? [hexB64(i.seed)] : Object.values(i.seeds).map(hexB64);
    return run(`(async()=>{const u=i.unsigned,text=fedCanon(u);let rec;
      if(FED_KIND[u.kind][2]){rec=u;for(const s of i.seeds)rec=await fedCosign(s,rec);}else rec={...u,sig:await fedSignText(i.seeds[0],text)};
      const o={signed_text:text,id:await fedId(rec),record:rec};if(rec.sigs)o.sigs=rec.sigs;else o.sig=rec.sig;return o;})()`, { unsigned: i.unsigned, seeds });
  },
  asn: (run, i) => run(`fedAsn(i.key).then(asn=>({asn}))`, i),
  records: (run, i) => run(`fedCheck(i.text!==undefined?i.text:i.record,i.now,i.as==='state'?{kinds:FED_STATE}:{}).then(r=>r.ok?{ok:true,kind:r.kind,id:r.id}:r)`, i),
  receipts: (run, i) => run(`(async()=>{const c=await fedCheck(i.record,i.now);if(!c.ok)return {ok:false,error:'record '+c.error};
    const e=await fedRcptErr(i.receipt,c.rec,c.id,i.server,i.nodes,i.now);return e?{ok:false,error:e}:{ok:true};})()`, i),
  proofs: (run, i) => run(`fedProofErr(i.proof,i.nonce,i.server,i.node,i.now).then(e=>e?{ok:false,error:e}:{ok:true})`, i),
  auth: (run, i) => run(`(()=>{const r=fedFrame(JSON.stringify(i.auth),'client','ready',[1]);if(r.error)return {ok:false,error:'frame '+r.error};
    return fedAuthErr(r.f,i.node,i.server,i.now).then(e=>e?{ok:false,error:e}:{ok:true});})()`, i),
  operators: (run, i) => run(`(async()=>{const g=await fedCheck(i.genesis,i.now);const ps=[];
    for(const r of i.records){const c=await fedCheck(r,i.now);if(c.ok)ps.push(c);}
    const ch=fedChain(g.rec,g.id,ps,i.now);
    if(!i.server)return {head:ch.head,operators:ch.ops,nodes:ch.nodes,pending:ch.pending};
    const s=await fedCheck(i.server,i.now);if(!s.ok)return {ok:false,error:s.error};
    const e=fedServerErr(s.rec,ch);return e?{ok:false,error:e}:{ok:true};})()`, i),
  registry: (run, i) => {
    const text = (f) => (f.text !== undefined ? f.text : JSON.stringify(f));
    const files = Object.fromEntries(Object.entries(i.files).map(([n, f]) => [n, text(f)]));
    const now = Math.floor(Date.now() / 1000);
    if (!i.check) return run(`fedServersJson(i.files,i.now).then(servers_json=>({servers_json}))`, { files, now });
    return run(`fedRegCheck(i.files,i.check,i.base,i.now).then(e=>e?{ok:false,error:e}:{ok:true})`, { files, check: i.check, base: i.base ? text(i.base) : null, now });
  },
  dedupe: (run, i) => run(`(async()=>{const st=new Map(),results=[];for(const a of i.arrivals)results.push(await fedStoreRec(st,a.text!==undefined?a.text:a.record,i.now));
    const stored=[...st.entries()].sort((a,b)=>fedByStr(a[0],b[0])).map(([id,r])=>r.sigs?{id,sigs:r.sigs.map(x=>x.key)}:{id});return {stored,results};})()`, i),
  slots: (run, i) => run(`(()=>{if(i.t!==undefined&&!i.receipts)return {slot:fedSlot(i.t)};if(i.receipts)return {slot:fedBoardSlot(i.receipts)};
    if(i.now!==undefined){const w=fedWindows(i.now);return {current:w.current,previous:w.previous};}
    const by=fedByKey(i.records.map(r=>({...r,body:{mode:r.mode}}))),out=[];
    for(const s of i.queries){const w=by.get(i.records[0].key)||[],e=fedEffs(w,s,s)[0];out.push({s,eff:e?e.id:null,value:fedHas(e)});}
    return {results:out};})()`, i),
  // The relay ranks; a game works out one network's value to check a row (fedRankOne): every key of a vector, ranked.
  boards: (run, i) => run(`({rows:(()=>{const rows=[];for(const k of new Set(i.records.map(r=>r.key))){const x=fedRankOne({...i,filters:{}},k,i.records,null,i.states);
    if(x.listed&&x.kept)rows.push({key:k,value:x.value});}return rows.sort((a,b)=>b.value-a.value||fedByStr(a.key,b.key));})()})`, i),
  // Boards of now (10.13): fedNowOne for every key of a vector, ranked.
  now: (run, i) => run(`({rows:(()=>{const rows=[];for(const k of new Set(i.states.map(r=>r.key))){const x=fedNowOne({...i,filters:{}},k,i.states,null,null);
    if(x.listed&&x.kept)rows.push({key:k,value:x.value});}return rows.sort((a,b)=>b.value-a.value||fedByStr(a.key,b.key));})()})`, i),
  quiet: (run, i) => run(`fedQuiet(i.now,i.lastHeard)`, i),
  shun: (run, i) => run(`(()=>{const r=fedShun(i.registry,i.records,i.target,i.now);return r;})()`, i),
  catalog: (run, i) => run(`i.entry?fedGossipIn(i.entry,i.self,i.now):{servers:fedCatalogMerge(i.registry,i.gossip,i.now)}`, i),
  deals: (run, i) => run(`(()=>{const r=fedDeal(i.announces,i.offer,i.accept||null,i.renews||null);return r;})()`, i),
  majority: (run, i) => run(`({majority:fedMaj(Array.from({length:i.operators},(_,n)=>'o'+n),Array.from({length:i.signers},(_,n)=>'o'+n))})`, i),
  sync: (run, i) => run(`i.same!==undefined?{sync:fedSyncOk(i.a,i.b,i.same)}:fedVersion(i.a,i.b)`, i),
  // Sealed deals (§5.3): the box key from a seed, sealing (with the vector's nonce), opening, what an opened one holds.
  box: (run, i) => run(`(async()=>{
    if(i.kind)return (i.kind==='decline'?FED_REASON(i.body):FED_OFFER(i.body,{rec:{key:i.author}}))?{ok:false,error:i.kind==='decline'?FED_REASON(i.body):FED_OFFER(i.body,{rec:{key:i.author}})}:{ok:true};
    const seed=i.seed,me=(await fedSigner(seed)).pub;
    if(i.envelope){const s=fedSubtle(),pk=await s.importKey('raw',fedBin(i.peerBox,32),{name:'X25519'},false,[]);
      const sh=new Uint8Array(await s.deriveBits({name:'X25519',public:pk},(await fedBoxKey(seed)).key,256)),[a,b]=[me,i.peer].sort(fedByStr),salt=new Uint8Array(64);
      salt.set(fedBin(a,32));salt.set(fedBin(b,32),32);const key=[...await fedHkdf(sh,salt,'tubes-fed v1 '+i.envelope.kind)].map(x=>x.toString(16).padStart(2,'0')).join('');
      return {aad:new TextDecoder().decode(fedBoxAad(i.envelope)),key,enc:await fedSeal(seed,me,i.peer,i.peerBox,i.envelope,i.plain,i.nonce)};}
    if(i.record){const p=await fedOpen(seed,me,i.peer,i.peerBox,i.record);return p?{ok:true,plain:p}:{ok:false};}
    return {box:await fedBoxPub(seed)};})()`, { ...i, seed: i.seed ? hexB64(i.seed) : undefined }),
  wire: (run, i) => run(`(()=>{const r=fedFrame(i.frame,i.role,i.state,i.speaks);return r.error?{error:r.error}:{ok:true};})()`, i),
  impl: (run, i) => run(`'welcome' in i?{impl:fedImpl(i.welcome)}:{impl:fedImpls(i.entry,i.nodes.map(key=>({key})))}`, i),
};

const areas = fs.readdirSync(DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();

test('every vector area is run or skipped with a reason', () => {
  for (const a of areas) assert.ok(AREA[a] || SKIP[a], `federation/vectors/${a}: no runner and no reason to skip it`);
});

for (const area of areas) {
  if (!AREA[area]) continue;
  test(`federation vectors: ${area}`, async () => {
    const { ev, errors } = load({ crypto: true });
    const run = async (src, input) => JSON.parse(JSON.stringify(await ev(`(i=>${src})(${JSON.stringify(input)})`)));
    const files = fs.readdirSync(path.join(DIR, area)).filter((f) => f.endsWith('.json')).sort();
    assert.ok(files.length, `${area} has vectors`);
    let n = 0;
    for (const f of files) {
      const v = JSON.parse(fs.readFileSync(path.join(DIR, area, f), 'utf8'));
      const cases = v.cases || [{ input: v.input, expect: v.expect }];
      for (const [k, c] of cases.entries()) {
        let got = await AREA[area](run, c.input);
        // Signing vectors name what they check (the full record only in some): compare those members.
        if (area === 'signing' && got) got = Object.fromEntries(Object.keys(c.expect).map((k) => [k, got[k]]));
        assert.deepEqual(got, c.expect, `${area}/${f}${v.cases ? ` case ${k}` : ''}: ${v.description}`);
        n++;
      }
    }
    assert.ok(n > 0);
    assert.deepEqual(errors, []);
  });
}
