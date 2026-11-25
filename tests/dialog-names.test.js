const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

test('every window is a dialog with a name: its own title', () => {
  const { ev, errors } = load();
  assert.equal(ev("$('modalCard').getAttribute('aria-label')"), 'Series of Tubes', 'the start screen is named by its title');
  ev("ACT.start({});S.nextFail=1e9;S.nextEvent=1e9;ACT.help()");
  const help = ev("$('modalCard').getAttribute('aria-label')");
  assert.ok(help && help === ev("$('modalCard').querySelector('h1,h2,h3,.eyebrow,.mhead').textContent.replace(/\\s+/g,' ').trim()"), `help is named after its heading (${help})`);
  ev("openModal('<p>no title here</p>')");
  assert.equal(ev("$('modalCard').hasAttribute('aria-label')"), false, 'an untitled window drops the old name instead of keeping a wrong one');
  assert.deepEqual(errors, []);
});
