// A node:test reporter that writes how long each test file took, as JSON {"tests/x.test.js": seconds}, to its
// destination. scripts/test.js adds it next to the usual output with --timings FILE; CI merges the parts' files
// into tests/durations.json, which the next run splits its parts by.
const path = require('node:path');

module.exports = async function* timings(source) {
  const sec = {};
  for await (const { type, data } of source) {
    // Top-level tests only: their durations include their subtests.
    if ((type === 'test:pass' || type === 'test:fail') && data.nesting === 0 && data.file && data.details) {
      const f = path.relative(process.cwd(), data.file).split(path.sep).join('/');
      sec[f] = (sec[f] || 0) + (data.details.duration_ms || 0) / 1000;
    }
  }
  const out = {};
  for (const f of Object.keys(sec).sort()) out[f] = Math.round(sec[f] * 10) / 10;
  yield JSON.stringify(out, null, 1) + '\n';
};
