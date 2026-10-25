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
    this.cityCount = this.ev('CITIES.length');
    this.version = this.ev('typeof APP_VERSION==="string"?APP_VERSION:""');
  }
  q(s) { return JSON.stringify(String(s)); }
  asnCheck(v) { return this.j(`asnCheck(${this.q(v)})`); }
  city(id) { return this.j(`CITY[${this.q(id)}]?{id:CITY[${this.q(id)}].id,name:CITY[${this.q(id)}].name,cc:CITY[${this.q(id)}].cc||'',country:countryName(CITY[${this.q(id)}].cc),P:CITY[${this.q(id)}].P,ix:CITY[${this.q(id)}].ix||'',sellers:sellersAt(${this.q(id)}).length}:null`); }
  cityCard(id) { return this.ev(`startCard(${this.q(id)})`); }
}

module.exports = { World };
