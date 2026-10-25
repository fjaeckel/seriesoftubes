// Loads site/index.html in jsdom with the animation loop disabled, so tests can
// drive the simulation directly through the game's globals (ACT, S, R, dayTick…).
const headless = require('../server/headless');
// Pacing (the POP gate) is off unless a test asks for it, so tests can build whatever they need on day 0.
const load = (opts = {}) => headless.load({ noPacing: true, ...opts });

// Deterministic Math.random so failures are reproducible.
function seed(ev, n) {
  ev(`if(window.__reseed)__reseed(${n});else Math.random=(()=>{let s=${n};return()=>{s=(s*16807)%2147483647;return s/2147483647;};})();`);
}

module.exports = { load, seed };
