/* ================= FEDERATION: sealed deals =================
   Offers to someone and declines travel sealed (§5.3): the relay sees who and when, never the deal, its terms or the
   reason. Each network's box key (§5.1, X25519) comes from its identity seed, so saves and the move file carry nothing
   new. Between two networks: X25519, then HKDF-SHA256 (salt: both identity keys in byte order, info: the record kind),
   then AES-256-GCM over the canonical plaintext, bound to the record (author, t, kind, to) through the additional
   data. All through WebCrypto; a browser without X25519 does not offer multiplayer (fedCan). */
const FED_XPKCS8=[0x30,0x2e,0x02,0x01,0x00,0x30,0x05,0x06,0x03,0x2b,0x65,0x6e,0x04,0x22,0x04,0x20],
  // What stays in clear of a sealed record, by kind; the rest of the body is sealed.
  FED_CLEAR={offer:['to'],decline:['offer','to']},FED_BOXES=new Map(),FED_DKEYS=new Map(),
  // A stand-in box (32 zero bytes) for checking this network's own announces kept from before sealed deals.
  FED_NOBOX='A'.repeat(43);
async function fedHkdf(ikm,salt,info){const s=fedSubtle(),k=await s.importKey('raw',ikm,'HKDF',false,['deriveBits']);
  return new Uint8Array(await s.deriveBits({name:'HKDF',hash:'SHA-256',salt,info:fedUtf8(info)},k,256));}
// The box key of a seed: {key (X25519 CryptoKey), pub}. HKDF over the seed, clamped (RFC 7748).
async function fedBoxKey(seed){let k=FED_BOXES.get(seed);if(k)return k;const s=fedSubtle(),b=fedBin(seed,32);if(!s||!b)throw new Error('no key');
  const d=await fedHkdf(b,new Uint8Array(0),'tubes-fed v1 box');d[0]&=248;d[31]&=127;d[31]|=64;
  const der=new Uint8Array(48);der.set(FED_XPKCS8);der.set(d,16);
  const key=await s.importKey('pkcs8',der,{name:'X25519'},true,['deriveBits']),jwk=await s.exportKey('jwk',key);
  k={key,pub:jwk.x};if(FED_BOXES.size>8)FED_BOXES.clear();FED_BOXES.set(seed,k);return k;}
const fedBoxPub=async seed=>(await fedBoxKey(seed)).pub;
// The AES-GCM key between this seed's network (me) and peer, whose box is peerBox, for one kind; null if none.
async function fedDealKey(seed,me,peer,peerBox,kind){const s=fedSubtle(),pb=fedBin(peerBox,32),id=seed+peer+peerBox+kind;if(!s||!pb||FdK(me)||FdK(peer))return null;
  let k=FED_DKEYS.get(id);if(k)return k;
  try{const pk=await s.importKey('raw',pb,{name:'X25519'},false,[]),sh=new Uint8Array(await s.deriveBits({name:'X25519',public:pk},(await fedBoxKey(seed)).key,256));
    if(sh.every(x=>!x))return null;
    const [a,b]=[me,peer].sort(fedByStr),salt=new Uint8Array(64);salt.set(fedBin(a,32));salt.set(fedBin(b,32),32);
    k=await s.importKey('raw',await fedHkdf(sh,salt,'tubes-fed v1 '+kind),{name:'AES-GCM'},false,['encrypt','decrypt']);}catch(e){return null;}
  if(FED_DKEYS.size>64)FED_DKEYS.clear();FED_DKEYS.set(id,k);return k;}
// The additional data: the record without sig and without body.enc, as canonical JSON.
const fedBoxAad=r=>{const e={};for(const k of Object.keys(r))if(k!=='sig')e[k]=r[k];const b={};for(const k of Object.keys(r.body))if(k!=='enc')b[k]=r.body[k];e.body=b;return fedUtf8(fedCanon(e));};
// AES-GCM nonce: from the browser's secure random source only. A repeated nonce under one key would leak the plaintext,
// so without it nothing is sealed (the deal fails instead of going out weak).
function fedNonce12(){const a=new Uint8Array(12);crypto.getRandomValues(a);return a;}
/* Seals plain (a value) inside env (the record without sig and enc) for peer: {n, c}. n: a fixed nonce (vectors). */
async function fedSeal(seed,me,peer,peerBox,env,plain,n){const k=await fedDealKey(seed,me,peer,peerBox,env.kind);if(!k)throw new Error('box');
  const iv=n?fedBin(n,12):fedNonce12();
  return {n:fedB64(iv),c:fedB64(new Uint8Array(await fedSubtle().encrypt({name:'AES-GCM',iv,additionalData:fedBoxAad(env)},k,fedUtf8(fedCanon(plain)))))};}
// Opens a sealed record with this seed's key and the other party's (peer, peerBox): the plain value, or null.
async function fedOpen(seed,me,peer,peerBox,rec){const e=rec&&rec.body&&rec.body.enc,n=e&&fedBin(e.n,12),c=e&&fedUnb64(e.c);if(!n||!c)return null;
  const k=await fedDealKey(seed,me,peer,peerBox,rec.kind);if(!k)return null;
  try{const t=fedUtf8Text(new Uint8Array(await fedSubtle().decrypt({name:'AES-GCM',iv:n,additionalData:fedBoxAad(rec)},k,c)));
    const p=t==null?{e:1}:fedParse(t);return p.e?null:p.v;}catch(err){return null;}}
// A network's box from its newest announce here, or null.
async function fedBoxOf(key){const o=await fedGet('ann',key),b=o&&o.rec&&o.rec.body&&o.rec.body.box;return FdK(b)?null:b;}
/* Signs a record of this network, sealing what §5.3 seals: an offer to someone and a decline go out with only
   FED_CLEAR in clear. body is the record as the game thinks of it (in clear). Throws 'nobox' when the other network's
   box is not known here (no announce of it). */
async function fedSealMine(kind,body,f){const cl=FED_CLEAR[kind];if(!cl||kind==='offer'&&!fedOwn(body,'to'))return fedSignRec(f.key.priv,kind,body,fedNow());
  const box=await fedBoxOf(body.to);if(!box)throw new Error('nobox');
  const clear={},plain={},t=fedNow();for(const k of Object.keys(body))(cl.includes(k)?clear:plain)[k]=body[k];
  const enc=await fedSeal(f.key.priv,f.key.pub,body.to,box,{v:1,kind,key:f.key.pub,t,body:clear},plain);
  return fedSignRec(f.key.priv,kind,{...clear,enc},t);}
/* A deal record received, as the game reads it: in clear as it came (accepts, open consortium projects), opened (a
   sealed one to or from this network: the body in clear, checked like an offer or a reason), null when it cannot be
   read (not for this network, tampered, malformed), or undefined when the other network's box is not known yet. */
async function fedOpenRec(f,r){if(!fedOwn(r.body,'enc'))return r;const me=f.key.pub,peer=r.key===me?r.body.to:r.key;
  if(r.key!==me&&r.body.to!==me)return null;const box=await fedBoxOf(peer);if(!box)return undefined;
  const p=await fedOpen(f.key.priv,me,peer,box,r);if(!p||typeof p!=='object'||Array.isArray(p))return null;
  const cl=FED_CLEAR[r.kind]||[];if(Object.keys(p).some(k=>cl.includes(k)||k==='enc'))return null;
  const body={};for(const k of Object.keys(r.body))if(k!=='enc')body[k]=r.body[k];Object.assign(body,p);
  if(r.kind==='offer'?FED_OFFER(body,{rec:r}):FED_REASON(p))return null;
  return {...r,body};}
