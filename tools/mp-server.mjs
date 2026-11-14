// Tiny multiplayer relay for THE WALL, attached to the Vite dev/preview HTTP server at /mp (no extra dependency).
// Clients own their own movement and health; the server relays state, range-checks and rate-limits hit claims,
// and owns the loot bags dropped on knockdown so only one player can pick each one up.
import crypto from 'node:crypto';

const MAX_FRAME = 4096;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
// public-internet limits: one abusive client can't fill the server, a room, or the relay
const MAX_CONNS = 400; // whole server
const MAX_PER_IP = 6; // tabs/devices behind one address
const MAX_ROOMS = 100;
const ROOM_SIZE = 16;
const MAX_MSGS_PER_SEC = 60; // state is sent at 12 Hz
const IDLE_MS = 120_000;
const DROP_EVERY_MS = 4000;

// ---------- RFC 6455 framing ----------
/** Pull complete frames out of `buf`. Returns { frames: [{op, data}], rest } or null on a protocol error. */
export function decodeFrames(buf) {
  const frames = [];
  let off = 0;
  for (;;) {
    if (buf.length - off < 2) break;
    const b0 = buf[off], b1 = buf[off + 1];
    const op = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let p = off + 2;
    if (len === 126) {
      if (buf.length - p < 2) break;
      len = buf.readUInt16BE(p);
      p += 2;
    } else if (len === 127) {
      if (buf.length - p < 8) break;
      const hi = buf.readUInt32BE(p);
      len = hi * 2 ** 32 + buf.readUInt32BE(p + 4);
      p += 8;
    }
    if (len > MAX_FRAME) return null;
    const mlen = masked ? 4 : 0;
    if (buf.length - p < mlen + len) break;
    const data = Buffer.from(buf.subarray(p + mlen, p + mlen + len));
    if (masked) for (let i = 0; i < len; i++) data[i] ^= buf[p + (i & 3)];
    frames.push({ op, fin: (b0 & 0x80) !== 0, data });
    off = p + mlen + len;
  }
  return { frames, rest: buf.subarray(off) };
}

/** Encode one unmasked server frame. */
export function encodeFrame(op, data) {
  const len = data.length;
  const head = len < 126 ? Buffer.from([0x80 | op, len]) : len < 65536 ? Buffer.alloc(4) : Buffer.alloc(10);
  if (len >= 126 && len < 65536) {
    head[0] = 0x80 | op;
    head[1] = 126;
    head.writeUInt16BE(len, 2);
  } else if (len >= 65536) {
    head[0] = 0x80 | op;
    head[1] = 127;
    head.writeUInt32BE(Math.floor(len / 2 ** 32), 2);
    head.writeUInt32BE(len >>> 0, 6);
  }
  return Buffer.concat([head, data]);
}

// ---------- validation helpers ----------
const fin = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const STATES = new Set(['idle', 'walk', 'run', 'jump', 'fall', 'jab', 'draw', 'hurt', 'down', 'collect', 'carry', 'sit']);
const HELD = new Set(['pick', 'sling']);
const ITEM_RE = /^[a-zA-Z]{1,20}$/;
const LOOK_KEYS = ['shirt', 'pants', 'hair', 'skin', 'hairStyle'];
/** Only the known look fields, as short primitives (clients validate again before use). */
function cleanLook(l) {
  const out = {};
  if (!l || typeof l !== 'object') return out;
  for (const k of LOOK_KEYS) {
    const v = l[k];
    if (fin(v, 0, 0xffffff) || (typeof v === 'string' && v.length <= 16)) out[k] = v;
  }
  return out;
}
/** Printable name, no control characters, never empty. */
const cleanName = (n) => String(n ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim().slice(0, 24) || 'Newcomer';

// ---------- rooms ----------
const rooms = new Map(); // room -> { players: Map<id, P>, bags: Map<id, Bag>, nextBag }
let nextId = 1;

function room(name) {
  let r = rooms.get(name);
  if (!r) rooms.set(name, (r = { players: new Map(), bags: new Map(), nextBag: 1 }));
  return r;
}

function send(p, msg) {
  if (p.sock.destroyed) return;
  p.sock.write(encodeFrame(1, Buffer.from(JSON.stringify(msg))));
}
function broadcast(r, msg, except) {
  for (const p of r.players.values()) if (p !== except && p.hello) send(p, msg);
}

function handle(r, p, msg) {
  const now = Date.now();
  switch (msg.t) {
    case 'hello': {
      if (p.hello) return;
      p.hello = true;
      p.name = cleanName(msg.name);
      p.look = cleanLook(msg.look);
      send(p, { t: 'welcome', id: p.id, bags: [...r.bags.values()] });
      for (const o of r.players.values()) if (o !== p && o.hello) send(p, { t: 'join', id: o.id, name: o.name, look: o.look });
      broadcast(r, { t: 'join', id: p.id, name: p.name, look: p.look }, p);
      return;
    }
    case 's': {
      if (!p.hello || !fin(msg.x, -1e4, 1e4) || !fin(msg.y, -1e4, 1e4) || !fin(msg.z, -1e4, 1e4) || !fin(msg.yaw, -100, 100)) return;
      p.pos = { x: msg.x, y: msg.y, z: msg.z };
      p.seen = now;
      p.safe = msg.safe === true;
      const st = STATES.has(msg.st) ? msg.st : 'idle';
      const held = HELD.has(msg.held) ? msg.held : null;
      const hp = fin(msg.hp, 0, 200) ? msg.hp : 100;
      broadcast(r, { t: 's', id: p.id, x: msg.x, y: msg.y, z: msg.z, yaw: msg.yaw, st, held, hp }, p);
      return;
    }
    case 'hit': {
      // attacker claims, server sanity-checks, victim applies
      const v = r.players.get(msg.to);
      if (!v || v === p || !p.pos || !v.pos || !fin(msg.dmg, 1, 100)) return;
      if (now - v.seen > 1000 || now - p.seen > 1000 || v.safe || p.safe) return;
      const shot = msg.kind === 'shot';
      const d = Math.hypot(v.pos.x - p.pos.x, v.pos.y - p.pos.y, v.pos.z - p.pos.z);
      if (d > (shot ? 45 : 3.6)) return;
      p.hits = (p.hits ?? []).filter((t) => now - t < 1000);
      if (p.hits.length >= 5) return;
      p.hits.push(now);
      const dmg = Math.min(shot ? 22 : 24, Math.round(msg.dmg));
      const dx = v.pos.x - p.pos.x, dz = v.pos.z - p.pos.z, n = Math.hypot(dx, dz) || 1;
      send(v, { t: 'hit', from: p.id, dmg, px: dx / n, pz: dz / n });
      return;
    }
    case 'drop': {
      // a knocked-down player spills part of their pack
      if (!p.pos || !Array.isArray(msg.items) || now - (p.lastDrop ?? 0) < DROP_EVERY_MS) return;
      p.lastDrop = now;
      for (const it of msg.items.slice(0, 6)) {
        if (!Array.isArray(it) || !ITEM_RE.test(it[0]) || !fin(it[1], 1, 20)) continue;
        if (r.bags.size >= 40) r.bags.delete(r.bags.keys().next().value);
        const a = Math.random() * Math.PI * 2;
        const bag = { id: r.nextBag++, item: it[0], qty: Math.floor(it[1]), x: p.pos.x + Math.cos(a) * 0.8, y: p.pos.y + 1.2, z: p.pos.z + Math.sin(a) * 0.8 };
        r.bags.set(bag.id, bag);
        broadcast(r, { t: 'bag', ...bag });
      }
      return;
    }
    case 'take': {
      const bag = r.bags.get(msg.bag);
      if (!bag || !p.pos || Math.hypot(bag.x - p.pos.x, bag.z - p.pos.z) > 4) return;
      r.bags.delete(bag.id);
      send(p, { t: 'got', bag: bag.id, item: bag.item, qty: bag.qty });
      broadcast(r, { t: 'gone', bag: bag.id });
      return;
    }
  }
}

const perIp = new Map(); // ip -> open sockets
let conns = 0;

/** Client address. Behind a hosting proxy (TRUST_PROXY=1) every socket comes from the proxy, so use its header. */
function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (process.env.TRUST_PROXY && typeof xff === 'string') return xff.split(',')[0].trim();
  return req.socket.remoteAddress ?? '?';
}

/** Attach the /mp WebSocket endpoint to an http server. Every other upgrade (Vite HMR) is left alone. */
export function attachMp(httpServer) {
  httpServer.on('upgrade', (req, sock) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname !== '/mp') return;
    const key = req.headers['sec-websocket-key'];
    if (typeof key !== 'string' || String(req.headers.upgrade).toLowerCase() !== 'websocket') return sock.destroy();
    const ip = clientIp(req);
    const name = (url.searchParams.get('room') ?? 'main').replace(/[^\w-]/g, '').slice(0, 32) || 'main';
    if (conns >= MAX_CONNS || (perIp.get(ip) ?? 0) >= MAX_PER_IP || (!rooms.has(name) && rooms.size >= MAX_ROOMS)) {
      sock.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
      return;
    }
    const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
    sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    sock.setNoDelay(true);
    const r = room(name);
    if (r.players.size >= ROOM_SIZE) {
      // tell the client why, so it backs off instead of hammering the door
      sock.end(Buffer.concat([encodeFrame(1, Buffer.from(JSON.stringify({ t: 'full', size: ROOM_SIZE }))), encodeFrame(8, Buffer.alloc(0))]));
      if (!r.players.size) rooms.delete(name);
      return;
    }
    conns++;
    perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
    const p = { id: nextId++, sock, hello: false, pos: null, seen: 0 };
    r.players.set(p.id, p);
    let buf = Buffer.alloc(0);
    let windowStart = Date.now(), msgs = 0;
    const close = () => {
      if (!r.players.delete(p.id)) return;
      conns--;
      const n = (perIp.get(ip) ?? 1) - 1;
      if (n > 0) perIp.set(ip, n);
      else perIp.delete(ip);
      broadcast(r, { t: 'leave', id: p.id });
      if (!r.players.size) rooms.delete(name);
      sock.destroy();
    };
    sock.setTimeout(IDLE_MS, close);
    sock.on('data', (chunk) => {
      const now = Date.now();
      if (now - windowStart >= 1000) (windowStart = now), (msgs = 0);
      buf = Buffer.concat([buf, chunk]);
      if (buf.length > MAX_FRAME * 4) return close();
      const res = decodeFrames(buf);
      if (!res) return close();
      buf = Buffer.from(res.rest);
      for (const f of res.frames) {
        if (++msgs > MAX_MSGS_PER_SEC) return close();
        if (f.op === 8) return close();
        if (f.op === 9) sock.write(encodeFrame(10, f.data));
        if (f.op !== 1 || !f.fin) continue;
        let msg;
        try {
          msg = JSON.parse(f.data.toString('utf8'));
        } catch {
          continue;
        }
        if (msg && typeof msg === 'object') handle(r, p, msg);
      }
    });
    sock.on('close', close);
    // http servers allow half-open sockets, so a client hanging up sends 'end' and never 'close' on its own
    sock.on('end', close);
    sock.on('error', close);
  });
}
