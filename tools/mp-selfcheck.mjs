// Self-check for the hand-rolled WebSocket codec: node tools/mp-selfcheck.mjs
import assert from 'node:assert/strict';
import { decodeFrames, encodeFrame } from './mp-server.mjs';

// client frames are masked: build one the way a browser would
function clientFrame(payload, op = 1) {
  const mask = Buffer.from([0x12, 0x34, 0x56, 0x78]);
  const len = payload.length;
  const head = len < 126 ? Buffer.from([0x80 | op, 0x80 | len]) : len < 65536 ? Buffer.from([0x80 | op, 0x80 | 126, len >> 8, len & 255]) : null;
  const body = Buffer.from(payload);
  for (let i = 0; i < len; i++) body[i] ^= mask[i & 3];
  return Buffer.concat([head, mask, body]);
}

for (const n of [0, 1, 125, 126, 127, 4000]) {
  const payload = Buffer.alloc(n, 'a');
  const wire = Buffer.concat([clientFrame(payload), clientFrame(Buffer.from('{"t":"s"}'))]);
  // feed it split at every possible point: half frames must wait, never mis-parse
  for (const cut of [1, 2, 5, Math.floor(wire.length / 2), wire.length - 1]) {
    let buf = Buffer.alloc(0);
    const got = [];
    for (const chunk of [wire.subarray(0, cut), wire.subarray(cut)]) {
      buf = Buffer.concat([buf, chunk]);
      const r = decodeFrames(buf);
      assert.ok(r, `protocol error at n=${n} cut=${cut}`);
      got.push(...r.frames);
      buf = Buffer.from(r.rest);
    }
    assert.equal(got.length, 2, `n=${n} cut=${cut}`);
    assert.equal(got[0].data.length, n);
    assert.ok(got[0].data.every((b) => b === 97));
    assert.equal(got[1].data.toString(), '{"t":"s"}');
    assert.equal(buf.length, 0);
  }
}
// oversize frames are refused rather than buffered forever
assert.equal(decodeFrames(clientFrame(Buffer.alloc(5000))), null);
// server encoding round-trips through the decoder (unmasked) at all three length forms
for (const n of [125, 126, 65536]) {
  const r = decodeFrames(encodeFrame(1, Buffer.alloc(n, 'b')));
  if (n > 4096) assert.equal(r, null);
  else assert.equal(r.frames[0].data.length, n);
}
console.log('mp codec self-check: ok');

// ---------- public-internet limits, against a real server on a random port ----------
import http from 'node:http';
import crypto from 'node:crypto';
import { attachMp } from './mp-server.mjs';
process.env.TRUST_PROXY = '1'; // lets each fake client claim its own address
const srv = http.createServer();
attachMp(srv);
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const port = srv.address().port;

/** Raw upgrade as client `ip`. Resolves { status, sock, frames() } where frames() waits for the socket to close. */
function join(room, ip) {
  return new Promise((ok) => {
    const req = http.request({ port, host: '127.0.0.1', path: `/mp?room=${room}`, headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'), 'x-forwarded-for': ip } });
    req.on('response', (res) => ok({ status: res.statusCode }));
    req.on('upgrade', (res, sock, head) => {
      let buf = Buffer.from(head);
      sock.on('data', (c) => (buf = Buffer.concat([buf, c])));
      const closed = new Promise((done) => sock.on('close', done));
      ok({ status: 101, sock, closed, frames: async () => (await closed, decodeFrames(buf).frames.filter((f) => f.op === 1).map((f) => JSON.parse(f.data))) });
    });
    req.end();
  });
}
const tick = () => new Promise((r) => setTimeout(r, 50));

// per-address cap: six tabs fine, the seventh refused, and a slot frees up when one closes
const six = [];
for (let i = 0; i < 6; i++) six.push(await join('a', '10.0.0.1'));
assert.ok(six.every((c) => c.status === 101));
assert.equal((await join('a', '10.0.0.1')).status, 503);
six[0].sock.destroy();
await tick();
const again = await join('a', '10.0.0.1');
assert.equal(again.status, 101, 'a closed socket must release its per-address slot');
for (const c of [...six.slice(1), again]) c.sock.destroy();

// room cap: the 17th player is told the room is full and disconnected
const sixteen = [];
for (let i = 0; i < 16; i++) sixteen.push(await join('busy', `10.1.0.${i}`));
assert.ok(sixteen.every((c) => c.status === 101));
const late = await join('busy', '10.2.0.1');
assert.equal(late.status, 101);
assert.deepEqual(await late.frames(), [{ t: 'full', size: 16 }]);
for (const c of sixteen) c.sock.destroy();

// message flood: a client sending far over the rate is cut off
const spam = await join('b', '10.3.0.1');
spam.sock.write(Buffer.concat(Array.from({ length: 100 }, () => clientFrame(Buffer.from('{"t":"noop"}')))));
await Promise.race([spam.closed, new Promise((_, no) => setTimeout(() => no(new Error('flooding client was not disconnected')), 2000))]);

// hello is sanitised before anyone else sees it: control characters and unknown look fields are dropped
const a = await join('c', '10.4.0.1'), b = await join('c', '10.4.0.2');
b.sock.write(clientFrame(Buffer.from(JSON.stringify({ t: 'hello', name: 'B' })))); // broadcasts only reach players who said hello
await tick();
a.sock.write(clientFrame(Buffer.from(JSON.stringify({ t: 'hello', name: 'Wr\u0007en\n', look: { shirt: 0x336699, evil: '<img>', hairStyle: 'x'.repeat(40) } }))));
await tick();
b.sock.destroy();
const seen = (await b.frames()).find((m) => m.t === 'join');
assert.deepEqual({ name: seen.name, look: seen.look }, { name: 'Wren', look: { shirt: 0x336699 } });
a.sock.destroy();
srv.close();
console.log('mp limits self-check: ok');
