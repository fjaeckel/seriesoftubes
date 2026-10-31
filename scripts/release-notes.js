#!/usr/bin/env node
// Prints the CHANGELOG.md bullets for one version as a JSON array of strings.
// Usage: node scripts/release-notes.js 1.2.0
//        node scripts/release-notes.js 2.0.0 --story   the release's story instead: the paragraphs of prose between
//                                                      its heading and its first bullet or ### heading (often none)
const fs = require('node:fs');
const path = require('node:path');

const version = process.argv[2], story = process.argv.includes('--story');
const text = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
const lines = text.split('\n');
const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
const notes = [];
if (start >= 0) {
  for (let i = start + 1; i < lines.length && !lines[i].startsWith('## ['); i++) {
    const l = lines[i];
    if (/^\s*-\s+/.test(l)) notes.push(l.replace(/^\s*-\s+/, '').trim());
    else if (/^\s{2,}\S/.test(l) && notes.length) notes[notes.length - 1] += ' ' + l.trim();
  }
}
if (story) {
  const paras = [];
  if (start >= 0) {
    let cur = [];
    for (let i = start + 1; i < lines.length && !lines[i].startsWith('## [') && !/^\s*-\s+/.test(lines[i]) && !lines[i].startsWith('###'); i++) {
      const l = lines[i].trim();
      if (l) cur.push(l); else if (cur.length) { paras.push(cur.join(' ')); cur = []; }
    }
    if (cur.length) paras.push(cur.join(' '));
  }
  process.stdout.write(JSON.stringify(paras));
} else process.stdout.write(JSON.stringify(notes));
