// Helpers for tests that run servers and sockets. On a busy CI runner (four parts at once, each file in its own
// process) anything can take seconds, so a test waits for a state, never for a fixed time: a fixed sleep is either
// too short (a red build that means nothing) or longer than needed on every run.
const http = require('node:http');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Resolves true as soon as ok() holds, false after ms. Assert on the result, so a timeout fails with your message.
async function until(ok, ms = 20000) {
  const t0 = Date.now();
  while (!(await ok())) { if (Date.now() - t0 > ms) return false; await wait(10); }
  return true;
}

// A port nobody is using on 127.0.0.1, from the OS. A fixed or random one can be taken by another suite, or by
// the OS itself for an outgoing connection (the ephemeral range starts at 32768 on Linux).
const freePort = () => new Promise((res, rej) => {
  const s = http.createServer();
  s.on('error', rej);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
});

// Stops a child process: asks first, then insists, and resolves once it has really gone (so its port is free).
function kill(child, ms = 2000) {
  return new Promise((res) => {
    if (!child || child.exitCode !== null || child.signalCode !== null) return res();
    const t = setTimeout(() => child.kill('SIGKILL'), ms);
    child.once('exit', () => { clearTimeout(t); res(); });
    child.kill('SIGTERM');
  });
}

module.exports = { wait, until, freePort, kill };
