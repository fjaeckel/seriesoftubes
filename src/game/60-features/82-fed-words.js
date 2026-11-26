/* ---------- Multimode: names nobody should have to read ----------
   Players name their own networks (and servers, consortiums), and other players see those names. A name with a slur or
   an obscenity in it shows as "AS?" instead, like an empty one; reports, mutes, hidden names and seriesoftub.es's bans
   (83-fed-authority.js) remain the way to deal with everything else. Names are folded the way fedLook() folds them
   (case, accents, look-alike letters and digits, anything between the letters), so "N.1-g g e r" is caught too.
   Two lists: what is never innocent inside a longer word, and what only counts as a word of its own ("Scunthorpe",
   "Hancock", "Penistone" and "Nazionale" are fine). Keep both sorted; folding happens once, on first use. A word that
   folds onto an innocent one cannot be listed: "heil" folds to "hell" (i reads as l). tests/fed-names-filter.test.js
   checks every name the game itself uses. */
const FED_BAD_IN=['arschloch','buceta','caralho','cazzo','connard','encule','faggot','fotze','fuck','hitler','hurensohn','maricon','mierda','motherf','nigga','nigger','pendejo','pornhub','putain','salope','scheisse','shit','stronzo','vaffanculo','vagina','wichser','개새끼','병신','씨발','キチガイ'];
const FED_BAD_WORD=['ass','asshole','assholes','bitch','bitches','cabron','cock','cocks','coon','coons','cum','cunt','cunts','dick','dicks','fag','fags','foda','frocio','hoe','hoes','kike','kikes','kkk','merde','nazi','nazis','penis','porn','porno','porra','pussy','puta','putas','puto','rape','rapist','retard','retards','slut','sluts','spic','spics','tits','tranny','twat','viado','whore','whores'];
let fedBadF=null;
function fedBadName(v){
  if(!fedBadF)fedBadF={in:FED_BAD_IN.map(fedLook).filter(Boolean),word:new Set(FED_BAD_WORD.map(fedLook).filter(Boolean))};
  const all=fedLook(v);if(fedBadF.in.some(w=>all.includes(w)))return true;
  return String(v).normalize('NFKD').split(/[^\p{L}\p{N}]+/u).some(w=>w&&fedBadF.word.has(fedLook(w)));}
// A server's description (free text, up to 280 characters) with such a word in it is not shown at all.
const fedSafeDesc=v=>{const s=fedSafeText(v);return fedBadName(s)?'':s;};
