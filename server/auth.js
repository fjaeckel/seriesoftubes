// Password hashing, session tokens and a small rate limiter. Node built-ins only.
'use strict';
const crypto = require('node:crypto');

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, 64, SCRYPT, (e, k) => (e ? rej(e) : res(k))));

async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const k = await scrypt(String(pw), salt);
  return { salt: salt.toString('base64'), hash: k.toString('base64') };
}
async function verifyPassword(pw, rec) {
  if (!rec) { await scrypt(String(pw), Buffer.alloc(16)); return false; } // keep timing similar for unknown users
  const k = await scrypt(String(pw), Buffer.from(rec.salt, 'base64'));
  const want = Buffer.from(rec.hash, 'base64');
  return k.length === want.length && crypto.timingSafeEqual(k, want);
}
const newToken = () => crypto.randomBytes(32).toString('base64url');
const tokenHash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const newCode = (n = 10) => crypto.randomBytes(n).toString('base64url').replace(/[-_]/g, 'x').slice(0, n).toLowerCase();
const id = () => crypto.randomBytes(9).toString('base64url');

/* Sliding-window limiter: allow(key, max, windowMs). */
class Limiter {
  constructor() { this.hits = new Map(); }
  allow(key, max, windowMs, now = Date.now()) {
    const l = (this.hits.get(key) || []).filter((t) => now - t < windowMs);
    if (l.length >= max) { this.hits.set(key, l); return false; }
    l.push(now); this.hits.set(key, l);
    if (this.hits.size > 5000) for (const [k, v] of this.hits) if (!v.length || now - v[v.length - 1] > 3600e3) this.hits.delete(k);
    return true;
  }
}

const USERNAME = /^[a-z0-9][a-z0-9_-]{2,19}$/;
const validUsername = (n) => USERNAME.test(String(n));
const validPassword = (p) => typeof p === 'string' && p.length >= 8 && p.length <= 200;

module.exports = { hashPassword, verifyPassword, newToken, tokenHash, newCode, id, Limiter, validUsername, validPassword };
