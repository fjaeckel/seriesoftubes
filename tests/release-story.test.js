// A big release can open with a story: shown in full in "What's new", and on GitHub above every change.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { load } = require('./harness');

const RN = path.join(__dirname, '..', 'scripts', 'release-notes.js');
const run = (...a) => JSON.parse(execFileSync(process.execPath, [RN, ...a], { encoding: 'utf8' }));

test('the release notes script reads a story and the bullets apart', () => {
  const story = run('2.0.0', '--story'), notes = run('2.0.0');
  assert.ok(story.length >= 5, 'the 2.0 story has its paragraphs');
  assert.match(story[0], /one game, four doors/);
  for (const w of ['Normal', 'Sandbox', 'Puzzles', 'Architect runs', 'Scenarios', 'chaos monkey']) assert.ok(story.some((p) => p.includes(w)), `the story introduces ${w}`);
  assert.ok(story.every((p) => !p.startsWith('- ') && !p.startsWith('#')), 'no bullets or headings in the story');
  assert.ok(notes.length >= 50, 'every change is still a bullet');
  assert.ok(notes.every((n) => !n.startsWith('**')), 'no story paragraph among the bullets');
  assert.deepEqual(run('1.37.0', '--story'), [], 'most releases have none');
});

test('"What\'s new" tells the story in full, with every change one tap away', () => {
  const { ev, errors } = load();
  const story = run('2.0.0', '--story');
  ev(`RELEASE_STORY.splice(0,0,...${JSON.stringify(story)});RELEASE_NOTES.splice(0,0,...${JSON.stringify(run('2.0.0'))})`);
  ev('openModal(notesHtml(RELEASE_NOTES,APP_VERSION))');
  const html = ev("document.getElementById('modalCard').innerHTML"), text = ev("document.getElementById('modalCard').textContent");
  assert.equal(ev("document.querySelectorAll('#modalCard .story p').length"), story.length, 'every paragraph, no "and N more"');
  assert.match(html, /<b>Normal<\/b>/, 'bold leads');
  assert.doesNotMatch(text, /\*\*/);
  assert.equal(ev("document.querySelectorAll('#modalCard ul.notes').length"), 0, 'no clipped bullet list under it');
  assert.match(html, /releases\/tag\/v/, 'and the full notes on GitHub');
  assert.deepEqual(errors, []);
});
