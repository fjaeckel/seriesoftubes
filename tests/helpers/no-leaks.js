// Loaded into every test file's process by scripts/test.js (--require). The runner ends a file's process as soon as its
// tests are done (--test-force-exit), so a server, socket, child process or worker a test forgot to close would no
// longer show up as a file that hangs. This fails the file instead, and says where each one was opened.
// The page's own timers (a toast fading in 6.5 s) are not leaks: they die with the process, as a closed tab's would.
const { createHook } = require('node:async_hooks');
const { after } = require('node:test');

// The handle types that are a test's own resources. Plain pipes are left out: the process's own stdout and stderr are
// pipes, and a child's pipes go with its PROCESSWRAP, which is checked.
const KINDS = new Set(['TCPSERVERWRAP', 'TCPWRAP', 'PIPESERVERWRAP', 'PROCESSWRAP', 'UDPWRAP', 'WORKER']);
const open = new Map();
createHook({
  init(id, type, trigger, res) {
    if (!KINDS.has(type)) return;
    const e = {};
    Error.captureStackTrace(e);
    open.set(id, { type, res, stack: e.stack.split('\n').filter((l) => !/\(?node:|no-leaks\.js|^Error$/.test(l)).slice(0, 6).join('\n') });
  },
  destroy(id) { open.delete(id); },
}).enable();

// Still open and keeping the process alive (an unref()'d handle does not).
const live = () => [...open.values()].filter((h) => {
  const r = h.res;
  if (typeof r.hasRef === 'function') return r.hasRef();
  return r.ref !== undefined || r.terminate !== undefined;
});

// Where it is, for a handle Node opened later (a server listening after a lookup) whose stack has no test line in it.
const where = (r) => {
  try { const a = {}, b = {};
    if (typeof r.getsockname === 'function' && !r.getsockname(a) && a.port) return ` on ${a.address}:${a.port}`
      + (typeof r.getpeername === 'function' && !r.getpeername(b) && b.port ? ` to ${b.address}:${b.port}` : '');
    if (r.pid) return ` pid ${r.pid}`;
  } catch (e) { /* closed meanwhile */ }
  return '';
};

after(async () => {
  // Closing is asynchronous: give handles a test has just closed a moment to go (as long as a busy CI machine needs).
  const t = Date.now();
  while (live().length && Date.now() - t < 5000) await new Promise((r) => setTimeout(r, 20).unref());
  const left = live();
  if (left.length) throw new Error(`${left.length} still open after the tests: close what a test opens (server.close(), kill(child), ws.close())\n\n`
    + left.map((h) => `${h.type}${where(h.res)} opened\n${h.stack || '    (by Node, later: no test line)'}`).join('\n\n'));
});
