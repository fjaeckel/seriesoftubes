// A read-only copy of the game kept just to answer questions about the world: which AS numbers are taken,
// which cities exist, what a network's real footprint looks like. Same data and rules as the browser.
'use strict';
const { load } = require('./headless');

class World {
  constructor() {
    const g = load({ seed: false, url: 'http://localhost/', server: true });
    this.ev = g.ev;
    this.errors = g.errors;
    const j = (code) => JSON.parse(this.ev(`JSON.stringify(${code})`));
    this.j = j;
    this.nets = j('NETS.map(n=>({id:n.id,name:n.name,asn:n.asn,type:n.type,pol:n.pol,tail:!!n.tail,est:!!n.est}))');
    this.byAsn = new Map(this.nets.map((n) => [n.asn, n]));
    this.cityCount = this.ev('CITIES.length');
    this.version = this.ev('typeof APP_VERSION==="string"?APP_VERSION:""');
  }
  q(s) { return JSON.stringify(String(s)); }
  asnCheck(v) { return this.j(`asnCheck(${this.q(v)})`); }
  city(id) { return this.j(`CITY[${this.q(id)}]?{id:CITY[${this.q(id)}].id,name:CITY[${this.q(id)}].name,cc:CITY[${this.q(id)}].cc||'',country:countryName(CITY[${this.q(id)}].cc),P:CITY[${this.q(id)}].P,ix:CITY[${this.q(id)}].ix||'',sellers:sellersAt(${this.q(id)}).length}:null`); }
  cityCard(id) { return this.ev(`startCard(${this.q(id)})`); }
  cityMatches(q) { return this.j(`cityMatches(${this.q(q)}).map(c=>({id:c.id,name:c.name,cc:c.cc||'',country:countryName(c.cc),sellers:sellersAt(c.id).length}))`); }
  /** What a real network looks like in this world: footprint, exchanges, type, policy. */
  netPage(asn) {
    const n = this.byAsn.get(Number(asn));
    if (!n) return null;
    return this.j(`(()=>{const N=NET[${this.q(n.id)}],f=netFootprint(N);return {id:N.id,asn:N.asn,name:N.name,type:N.type,policy:N.pol,est:!!N.est,tail:!!N.tail,metros:N.pops.length,sample:N.pops.slice(0,40).map(c=>CITY[c]?CITY[c].name:c),exchanges:[...new Set(N.ix.map(x=>XIXM[x]?XIXM[x].name:(CITY[x]&&CITY[x].ix)||x))].slice(0,40)}})()`);
  }
  netsByName(q) {
    q = String(q).toLowerCase();
    return this.nets.filter((n) => !n.tail && (n.name.toLowerCase().includes(q) || String(n.asn) === q)).slice(0, 25);
  }
}

module.exports = { World };
