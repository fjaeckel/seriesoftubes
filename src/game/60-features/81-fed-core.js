/* ================= FEDERATION: the core =================
   Multiplayer through relay servers players run (ADR 0005, docs/plans/federation.md). The wire format and every rule
   are in docs/FEDERATION-PROTOCOL.md (the spec, cited as §n below); the API the rest of the game uses is described in
   docs/FEDERATION-CLIENT.md. This file: constants, base64url, UTF-8, canonical JSON (§2), SHA-256, Ed25519 through
   WebCrypto, record ids and ASNs (§3). Nothing here runs at load beyond defining tables, and nothing here may use
   Math.random (seeded games replace it: federation must never move their dice). */
const FED_PROTO='tubes-fed.1',FED_VERS=[1],FED_EPOCH=1735689600,FED_SKEW=600,FED_SLOT=300,FED_WIN=288,FED_CARRY=604800,
  FED_DAY=86400,FED_FRAME=65536,FED_NAME=/^[A-Za-z0-9_]{1,32}$/,FED_B64A='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',
  FED_PKCS8=[0x30,0x2e,0x02,0x01,0x00,0x30,0x05,0x06,0x03,0x2b,0x65,0x70,0x04,0x22,0x04,0x20],
  // Kinds (§13.2): max canonical bytes, max age in seconds (0: none), multi-signer.
  FED_KIND={announce:[16384,0],stats:[40960,777600],offer:[4096,2592000],accept:[1024,2592000],decline:[1024,2592000],
    genesis:[2048,0],operators:[8192,0,1],server:[16384,0,1],hide:[32768,0],shun:[1024,7776000],unshun:[1024,7776000],leave:[512,0],report:[1024,2592000],
    // A live state (§5.11) is no record: never stored, only sent while playing; checked where one is expected.
    state:[40960,900]};
const FED_STATE_LIFE=900;
const fedOwn=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
// Floor division, exact for safe integers (§1).
const fedDiv=(a,b)=>{const r=((a%b)+b)%b;return (a-r)/b;};
const fedSlot=x=>x-((x%FED_SLOT)+FED_SLOT)%FED_SLOT;
const fedByStr=(a,b)=>a<b?-1:a>b?1:0;

/* ---------- base64url without padding (§3.1): only text that round-trips is accepted ---------- */
function fedB64(u){const A=FED_B64A;let s='',i=0;
  for(;i+2<u.length;i+=3){const n=u[i]<<16|u[i+1]<<8|u[i+2];s+=A[n>>18&63]+A[n>>12&63]+A[n>>6&63]+A[n&63];}
  if(u.length-i===1){const n=u[i]<<16;s+=A[n>>18&63]+A[n>>12&63];}
  else if(u.length-i===2){const n=u[i]<<16|u[i+1]<<8;s+=A[n>>18&63]+A[n>>12&63]+A[n>>6&63];}
  return s;}
function fedUnb64(s){if(typeof s!=='string'||s.length%4===1||!/^[A-Za-z0-9_-]*$/.test(s))return null;
  const out=new Uint8Array(s.length*3>>2);let acc=0,bits=0,o=0;
  for(let i=0;i<s.length;i++){acc=(acc<<6|FED_B64A.indexOf(s[i]))&0xffffff;bits+=6;if(bits>=8){bits-=8;out[o++]=acc>>bits&255;}}
  return fedB64(out)===s?out:null;}
// The bytes of a Key, Sig, Id or Nonce, or null when it is not exactly n bytes in canonical form.
const fedBin=(s,n)=>{const u=typeof s==='string'&&s.length===Math.ceil(n*4/3)?fedUnb64(s):null;return u&&u.length===n?u:null;};

/* ---------- UTF-8 ---------- */
// Strings handed in here are already checked (§2.1), so every surrogate is paired.
function fedUtf8(s){if(typeof TextEncoder==='function')return new TextEncoder().encode(s);
  const o=[];for(let i=0;i<s.length;i++){let c=s.charCodeAt(i);
    if(c>=0xd800&&c<0xdc00&&i+1<s.length){const d=s.charCodeAt(i+1);if(d>=0xdc00&&d<0xe000){c=0x10000+((c-0xd800)<<10)+(d-0xdc00);i++;}}
    if(c<0x80)o.push(c);else if(c<0x800)o.push(0xc0|c>>6,0x80|c&63);else if(c<0x10000)o.push(0xe0|c>>12,0x80|c>>6&63,0x80|c&63);
    else o.push(0xf0|c>>18,0x80|c>>12&63,0x80|c>>6&63,0x80|c&63);}
  return new Uint8Array(o);}
// Bytes of UTF-8 a string takes, without building them.
function fedSize(s){let n=s.length;for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);if(c>=0x80){n++;if(c>=0x800){if(c>=0xd800&&c<0xdc00)i++;else n++;}}}return n;}
// Raw bytes to text, refusing anything that is not valid UTF-8 (the URI decoder is strict: no overlongs, no surrogates).
function fedUtf8Text(u){let p='';for(let i=0;i<u.length;i++)p+=(u[i]<16?'%0':'%')+u[i].toString(16);try{return decodeURIComponent(p);}catch(e){return null;}}

/* ---------- reading and writing records as JSON (§2) ---------- */
// A string of Unicode scalar values with nothing below U+0020.
function fedStrOk(s){for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);if(c<32)return false;
  if(c>=0xd800&&c<0xe000){if(c>=0xdc00)return false;const d=s.charCodeAt(i+1);if(!(d>=0xdc00&&d<0xe000))return false;i++;}}return true;}
// The first value rule a decoded value breaks (§2.1), or null. d: the depth of v, the record itself being 1.
function fedValues(v,d=1){if(v===null)return 'bad_value';const t=typeof v;
  if(t==='string')return fedStrOk(v)?null:'bad_string';
  if(t==='number')return Number.isSafeInteger(v)&&!Object.is(v,-0)?null:'bad_number';
  if(t==='boolean')return null;
  if(t!=='object')return 'bad_value';
  if(d>8)return 'too_deep';
  if(Array.isArray(v)){for(const x of v){const e=fedValues(x,d+1);if(e)return e;}return null;}
  for(const k of Object.keys(v)){if(!FED_NAME.test(k))return 'bad_name';const e=fedValues(v[k],d+1);if(e)return e;}
  return null;}
// JSON text (already a string, so valid UTF-8) to a checked value: {v} or {e: error code}.
function fedParse(text){let v;try{v=JSON.parse(text);}catch(e){return {e:'bad_json'};}const e=fedValues(v);return e?{e}:{v};}
// Canonical JSON (§2.3): members sorted by name, no whitespace, only \ and " escaped.
function fedCanon(v){const t=typeof v;
  if(t==='string')return '"'+v.replace(/[\\"]/g,c=>'\\'+c)+'"';
  if(t==='number'||t==='boolean')return String(v);
  if(Array.isArray(v))return '['+v.map(fedCanon).join(',')+']';
  return '{'+Object.keys(v).sort().map(k=>fedCanon(k)+':'+fedCanon(v[k])).join(',')+'}';}

/* ---------- WebCrypto: SHA-256 and Ed25519 (§3.2) ---------- */
const fedSubtle=()=>{try{return typeof crypto==='object'&&crypto&&crypto.subtle||null;}catch(e){return null;}};
async function fedSha(bytes){return new Uint8Array(await fedSubtle().digest('SHA-256',bytes));}
/* Federation is offered only where the browser signs and verifies Ed25519 and seals deals with X25519 and AES-GCM
   itself (§3.2, §5.3); there is no second algorithm. Checked once, the first time something asks (never at load). */
function fedCan(){if(FED_CAN.p)return FED_CAN.p;
  return FED_CAN.p=(async()=>{const s=fedSubtle();if(!s)return false;
    try{const seed=fedB64(new Uint8Array(32).fill(7)),k=await fedSigner(seed),m=fedUtf8('tubes');
      if(!await fedVerify(k.pub,fedB64(new Uint8Array(await s.sign({name:'Ed25519'},k.key,m))),m))return false;
      // Sealing to itself and opening again proves X25519, HKDF and AES-GCM in one go.
      const box=await fedBoxPub(seed),env={v:1,kind:'decline',key:k.pub,t:FED_EPOCH,body:{to:k.pub}};
      const r={...env,body:{to:k.pub,enc:await fedSeal(seed,k.pub,k.pub,box,env,{reason:'quiet'})}};
      const p=await fedOpen(seed,k.pub,k.pub,box,r);return !!p&&p.reason==='quiet';}catch(e){return false;}})();}
const FED_CAN={p:null},FED_KEYS=new Map(),FED_SIGNERS=new Map();
// A private key is its 32-byte seed (base64url); WebCrypto takes it as PKCS#8. Gives {key (CryptoKey), pub}.
async function fedSigner(seed){let k=FED_SIGNERS.get(seed);if(k)return k;const s=fedSubtle(),b=fedBin(seed,32);if(!s||!b)throw new Error('no key');
  const der=new Uint8Array(48);der.set(FED_PKCS8);der.set(b,16);
  const key=await s.importKey('pkcs8',der,{name:'Ed25519'},true,['sign']),jwk=await s.exportKey('jwk',key);
  k={key,pub:jwk.x};if(FED_SIGNERS.size>8)FED_SIGNERS.clear();FED_SIGNERS.set(seed,k);return k;}
// A new identity: {pub, priv} (priv is the seed).
async function fedNewKey(){const s=fedSubtle(),p=await s.generateKey({name:'Ed25519'},true,['sign','verify']);
  const der=new Uint8Array(await s.exportKey('pkcs8',p.privateKey)),pub=new Uint8Array(await s.exportKey('raw',p.publicKey));
  return {pub:fedB64(pub),priv:fedB64(der.slice(der.length-32))};}
// Verifies with the platform verifier as it is; a key WebCrypto will not import simply fails (§3.2).
async function fedVerify(pub,sig,bytes){const s=fedSubtle(),sb=fedBin(sig,64);if(!s||!sb)return false;
  try{let k=FED_KEYS.get(pub);if(!k){k=await s.importKey('raw',fedBin(pub,32),{name:'Ed25519'},false,['verify']);if(FED_KEYS.size>512)FED_KEYS.clear();FED_KEYS.set(pub,k);}
    return await s.verify({name:'Ed25519'},k,sb,bytes);}catch(e){return false;}}
async function fedSignText(seed,text){const k=await fedSigner(seed);return fedB64(new Uint8Array(await fedSubtle().sign({name:'Ed25519'},k.key,fedUtf8(text))));}
// The envelope without its signature(s): what every signer signs.
const fedUnsigned=r=>{const o={};for(const k of Object.keys(r))if(k!=='sig'&&k!=='sigs')o[k]=r[k];return o;};
// Signs a single-signer record with a seed: {v, kind, key, t, body, sig}.
async function fedSignRec(seed,kind,body,t){const k=await fedSigner(seed),r={v:1,kind,key:k.pub,t,body};r.sig=await fedSignText(seed,fedCanon(r));return r;}
// Adds one signer to a multi-signer record (operators, server), keeping sigs sorted by key.
async function fedCosign(seed,r){const k=await fedSigner(seed),sig=await fedSignText(seed,fedCanon(fedUnsigned(r)));
  const sigs=(r.sigs||[]).filter(x=>x.key!==k.pub).concat([{key:k.pub,sig}]).sort((a,b)=>fedByStr(a.key,b.key));return {...r,sigs};}
// Record id (§3.3): SHA-256 of the canonical record; multi-signer kinds without their sigs.
async function fedId(r){return fedB64(await fedSha(fedUtf8(fedCanon(FED_KIND[r.kind]&&FED_KIND[r.kind][2]?fedUnsigned(r):r))));}
// The ASN the game shows for a key (§3.4): 4200000000 + (first 4 bytes of SHA-256(key) mod 94967295).
async function fedAsn(pub){const h=await fedSha(fedBin(pub,32));return 4200000000+(((h[0]<<24)>>>0)+(h[1]<<16)+(h[2]<<8)+h[3])%94967295;}
