#!/usr/bin/env node
// npm start: one process serves the game and the multiplayer API.
'use strict';
const { createApp } = require('./app');

const port = +(process.env.PORT || 8080);
const hostname = process.env.HOST || '127.0.0.1';
const app = createApp();
app.listen(port, hostname).then((a) => {
  const shown = hostname === '0.0.0.0' || hostname === '::' ? 'localhost' : hostname;
  console.log(`Series of Tubes ${require('../package.json').version} is up on http://${shown}:${a.port}`);
  console.log(`  game        http://${shown}:${a.port}/`);
  console.log(`  data dir    ${app.cfg.dataDir}`);
  if (app.cfg.registration === 'open' && !app.cfg.serverCode) console.log('  sign-ups are open: set SERVER_CODE=... to require an invite code, or REGISTRATION=closed');
}).catch((e) => { console.error(e.message); process.exit(1); });

let closing = false;
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { if (closing) return; closing = true; console.log('Saving games…'); await app.close(); process.exit(0); });
