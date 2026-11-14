// Household-scrap prop kit. Every prop shows its construction: thickness, tape, thread ties, wear.
import * as THREE from 'three';
import { Rng } from '../core/rng';
import { WorldBuilder, V3, normalize } from './builder';
import { Frame } from './frame';
import { quadRect } from '../render/materials';

export const PAL = {
  card: [0xc9a477, 0xbf9868, 0xd2b183, 0xb48a5c, 0xc2a07a],
  paint: [0xb5523b, 0x3f6e8c, 0xd2a13a, 0x5d7f4a, 0x8a4f78, 0xc77c3a, 0x4f8f88, 0xa3473f],
  wrapper: [0, 1, 2, 3],
  thread: [0xc0392b, 0x2e86ab, 0xe1b12c, 0x6a994e, 0x8e44ad, 0xf2efe6],
  warm: 0xffb45e,
  amber: 0xff9a3c,
  cool: 0x9cc8ff,
};

// ---------- small joinery ----------

export function tape(b: WorldBuilder, f: Frame, lx: number, ly: number, lz: number, w: number, h: number, rot: V3 = [0, 0, 0]): void {
  b.box(w, h, 0.025, f.p(lx, ly, lz), { mat: 'tape', rot: f.r(rot[0], rot[1], rot[2]), noBake: true });
}

export function threadWrap(b: WorldBuilder, f: Frame, lx: number, ly: number, lz: number, r: number, color: number): void {
  b.cyl(r + 0.03, r + 0.03, 0.12, f.p(lx, ly, lz), { mat: 'thread', color, seg: 8 });
  b.cyl(r + 0.035, r + 0.035, 0.03, f.p(lx, ly + 0.03, lz), { mat: 'thread', color, seg: 8 });
}

/** Toothpick post with pointed tip and optional thread wrap. */
export function toothpick(b: WorldBuilder, f: Frame, lx: number, lz: number, y0: number, h: number, opts: { collide?: boolean; wrapColor?: number } = {}): void {
  b.cyl(0.075, 0.075, h, f.p(lx, y0 + h / 2, lz), { mat: 'wood', color: 0xe6cfa3, seg: 7, collide: opts.collide });
  b.cyl(0, 0.075, 0.28, f.p(lx, y0 + h + 0.14, lz), { mat: 'wood', color: 0xe6cfa3, seg: 7 });
  if (opts.wrapColor !== undefined) threadWrap(b, f, lx, y0 + h - 0.25, lz, 0.075, opts.wrapColor);
}

export function matchstick(b: WorldBuilder, f: Frame, a: V3, c: V3, burnt = false): void {
  const fa = f.p(...a), fc = f.p(...c);
  b.rod(fa, fc, 0.085, { mat: 'wood', color: 0xe9d3a8, seg: 4 });
  b.sphere(0.13, fc, { mat: 'rubber', color: burnt ? 0x2a2420 : 0xb22b22, scale: [1, 1.3, 1], seg: 8 });
}

/** Crimped bottle cap. Upside-down caps make roofs and bowls. */
export function bottleCap(b: WorldBuilder, f: Frame, lx: number, ly: number, lz: number, r: number, color: number, opts: { flip?: boolean; collide?: boolean; liner?: number } = {}): void {
  const h = r * 0.42;
  const g = new THREE.CylinderGeometry(r, r * 1.02, h, 42, 2, true);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + Math.cos(a * 21) * 0.035;
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  g.computeVertexNormals();
  const p = f.p(lx, ly + h / 2, lz);
  b.add(g, p, { mat: 'metal', color, rot: f.r(opts.flip ? Math.PI : 0, 0, 0) });
  // disc top (printed side)
  const topY = opts.flip ? ly : ly + h;
  b.cyl(r * 0.99, r * 0.99, 0.04, f.p(lx, topY + (opts.flip ? 0.02 : -0.02), lz), { mat: 'metal', color, seg: 32 });
  if (opts.liner !== undefined) b.cyl(r * 0.9, r * 0.9, 0.03, f.p(lx, opts.flip ? ly + 0.05 : ly + 0.05, lz), { mat: 'plastic', color: opts.liner, seg: 24 });
  if (opts.collide) b.colliderFor(r * 1.8, h, r * 1.8, p, { collide: true });
}

/** Wrapper awning: a crinkled, sagging sheet on toothpicks, tied with thread and patched with tape. */
export function awning(b: WorldBuilder, f: Frame, lx: number, ly: number, lz: number, w: number, d: number, variant: number, rng: Rng, slope = 0.35, posts = true): void {
  const g = new THREE.PlaneGeometry(w, d, 12, 8);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const u = x / w + 0.5, v = y / d + 0.5;
    const sag = Math.sin(u * Math.PI) * 0.18 + Math.sin(v * Math.PI) * 0.08;
    const crinkle = (rng.next() - 0.5) * 0.05;
    pos.setZ(i, -sag + crinkle + v * 0); // z becomes -y after rotation
  }
  g.computeVertexNormals();
  const rect = quadRect(variant);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, rect[0] + uv.getX(i) * (rect[2] - rect[0]), rect[1] + uv.getY(i) * (rect[3] - rect[1]));
  b.add(g, f.p(lx, ly, lz), { mat: 'wrapper', rot: f.r(-Math.PI / 2 + slope, 0, 0) });
  // high, thin collider: people walk underneath, the camera can't pass through the sheet
  b.colliderFor(w, 0.25, d * 0.9, f.p(lx, ly - 0.1, lz), { collide: true, rot: f.r() });
  // scalloped crimp edge at the front
  const fy = ly - Math.sin(slope) * d * 0.5, fz = lz + Math.cos(slope) * d * 0.5;
  for (let k = 0; k < Math.floor(w / 0.35); k++) {
    const x = lx - w / 2 + 0.175 + k * 0.35;
    b.box(0.3, 0.16, 0.02, f.p(x, fy - 0.1, fz), { mat: 'wrapper', uvRect: rect, rot: f.r(0.15, 0, 0) });
  }
  if (posts) {
    const back = ly + Math.sin(slope) * d * 0.5;
    // front posts down to the floor (frame y is the floor)
    toothpick(b, f, lx - w / 2 + 0.12, fz - 0.06, 0, fy - 0.3, { wrapColor: rng.pick(PAL.thread), collide: true });
    toothpick(b, f, lx + w / 2 - 0.12, fz - 0.06, 0, fy - 0.3, { wrapColor: rng.pick(PAL.thread), collide: true });
    // thread guy-lines back to the wall
    b.rod(f.p(lx - w / 2 + 0.1, back, lz - d * 0.5), f.p(lx - w / 2 + 0.1, back + 0.6, lz - d * 0.5 - 0.3), 0.02, { mat: 'thread', color: 0xe8e0d0 });
    b.rod(f.p(lx + w / 2 - 0.1, back, lz - d * 0.5), f.p(lx + w / 2 - 0.1, back + 0.6, lz - d * 0.5 - 0.3), 0.02, { mat: 'thread', color: 0xe8e0d0 });
  }
  // a tape patch over a tear
  if (rng.chance(0.7)) tape(b, f, lx + rng.range(-w / 3, w / 3), ly + 0.06, lz + rng.range(-d / 4, d / 4), 0.5, 0.35, [-Math.PI / 2 + slope, 0, rng.range(-0.4, 0.4)]);
}

/** A string of small bulbs on a sagging wire. Registers baked lamps and returns bulb positions. */
export function fairyLights(b: WorldBuilder, a: V3, c: V3, drop: number, n: number, colors: number[], rng: Rng, bake = 0.35, intensity = 0.9, tag?: string): THREE.Vector3[] {
  const pts = b.sag(a, c, drop, 0.025, { mat: 'thread', color: 0x2e3a2a, noBake: true }, n * 2);
  const bulbs: THREE.Vector3[] = [];
  for (let i = 1; i < pts.length - 1; i += 2) {
    const p = pts[i];
    const col = rng.pick(colors);
    b.cyl(0.06, 0.06, 0.12, [p.x, p.y - 0.06, p.z], { mat: 'plastic', color: 0x2c3a26, seg: 6, noBake: true });
    b.sphere(0.11, [p.x, p.y - 0.2, p.z], { mat: 'glow', color: col, scale: [1, 1.5, 1], seg: 8 });
    const lp = new THREE.Vector3(p.x, p.y - 0.25, p.z);
    bulbs.push(lp);
    b.lamp([lp.x, lp.y, lp.z], col, intensity, 7, bake, tag, rng.chance(0.15) ? 0.4 : 0);
  }
  return bulbs;
}

/** Hanging practical lamp: a bead-chain cord and a bulb in a foil or bottle-cap shade. */
export function hangingLamp(b: WorldBuilder, top: V3, len: number, color: number, shade: 'foil' | 'cap' | 'none', intensity = 2.2, range = 9, tag?: string): THREE.Vector3 {
  const bottom: V3 = [top[0], top[1] - len, top[2]];
  b.rod(top, bottom, 0.02, { mat: 'thread', color: 0x222222, noBake: true });
  if (shade === 'foil') b.cyl(0.08, 0.42, 0.32, [bottom[0], bottom[1] - 0.12, bottom[2]], { mat: 'foil', color: 0xdddddd, seg: 12, open: true });
  if (shade === 'cap') b.cyl(0.55, 0.55, 0.22, [bottom[0], bottom[1] - 0.05, bottom[2]], { mat: 'metal', color: 0xb03a2e, seg: 20, open: true });
  b.sphere(0.16, [bottom[0], bottom[1] - 0.3, bottom[2]], { mat: 'glow', color, scale: [1, 1.25, 1], seg: 10 });
  const p = new THREE.Vector3(bottom[0], bottom[1] - 0.35, bottom[2]);
  b.lamp([p.x, p.y, p.z], color, intensity, range, 0.55, tag);
  return p;
}

/** Bendy-straw plumbing along a polyline, with accordion joints at corners. Returns end point. */
export function strawPipe(b: WorldBuilder, pts: V3[], r: number, color: number, stripe: number): void {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = new THREE.Vector3(...pts[i]), c = new THREE.Vector3(...pts[i + 1]);
    const len = a.distanceTo(c);
    const dir = c.clone().sub(a).normalize();
    const nSeg = Math.max(1, Math.round(len / 0.8));
    for (let k = 0; k < nSeg; k++) {
      const p0 = a.clone().addScaledVector(dir, (k / nSeg) * len);
      const p1 = a.clone().addScaledVector(dir, ((k + 1) / nSeg) * len);
      b.rod(p0.toArray() as V3, p1.toArray() as V3, r, { mat: 'plasticGloss', color: k % 2 ? color : stripe, seg: 12 });
    }
    if (i > 0) {
      // accordion joint
      for (let k = -2; k <= 2; k++) {
        const p = a.clone().addScaledVector(dir, k * 0.06);
        b.sphere(r * 1.12, p.toArray() as V3, { mat: 'plasticGloss', color, seg: 10, scale: [1, 0.5, 1] });
      }
      tape(b, new Frame(0, 0, 0), a.x, a.y, a.z + r, r * 3, r * 2.2);
    }
  }
}

/** Cardboard crate with open flaps and tape. */
export function crate(b: WorldBuilder, f: Frame, lx: number, lz: number, y0: number, w: number, h: number, d: number, rng: Rng, opts: { collide?: boolean; open?: boolean; contents?: number } = {}): void {
  const col = rng.pick(PAL.card);
  const t = 0.07;
  b.box(w, t, d, f.p(lx, y0 + t / 2, lz), { mat: 'cardboard', color: col });
  b.box(t, h, d, f.p(lx - w / 2 + t / 2, y0 + h / 2, lz), { mat: 'cardboard', color: col, rot: f.r() });
  b.box(t, h, d, f.p(lx + w / 2 - t / 2, y0 + h / 2, lz), { mat: 'cardboard', color: col, rot: f.r() });
  b.box(w, h, t, f.p(lx, y0 + h / 2, lz - d / 2 + t / 2), { mat: 'cardboard', color: col, rot: f.r() });
  b.box(w, h, t, f.p(lx, y0 + h / 2, lz + d / 2 - t / 2), { mat: 'cardboard', color: col, rot: f.r() });
  // exposed corrugation on the cut edges
  b.box(w, 0.05, t + 0.01, f.p(lx, y0 + h, lz + d / 2 - t / 2), { mat: 'corrugated', color: col, rot: f.r() });
  b.box(w, 0.05, t + 0.01, f.p(lx, y0 + h, lz - d / 2 + t / 2), { mat: 'corrugated', color: col, rot: f.r() });
  if (opts.open !== false) {
    b.box(w * 0.96, 0.05, d * 0.45, f.p(lx, y0 + h + 0.12, lz + d / 2 + d * 0.18), { mat: 'cardboard', color: col, rot: f.r(-0.5, 0, 0) });
    b.box(w * 0.96, 0.05, d * 0.45, f.p(lx, y0 + h + 0.1, lz - d / 2 - d * 0.16), { mat: 'cardboard', color: col, rot: f.r(0.6, 0, 0) });
  } else {
    b.box(w, t, d, f.p(lx, y0 + h - t / 2, lz), { mat: 'cardboard', color: col });
  }
  tape(b, f, lx, y0 + h * 0.6, lz + d / 2 + 0.01, 0.35, h * 0.8);
  if (opts.contents !== undefined) {
    for (let k = 0; k < 6; k++) b.sphere(rng.range(0.15, 0.28), f.p(lx + rng.range(-w / 3, w / 3), y0 + h - 0.15, lz + rng.range(-d / 3, d / 3)), { mat: 'crumb', color: opts.contents });
  }
  if (opts.collide) b.colliderFor(w, h, d, f.p(lx, y0 + h / 2, lz), { collide: true, rot: f.r() });
}

/** A coat button: disc with four holes and a raised rim. */
export function button(b: WorldBuilder, f: Frame, lx: number, ly: number, lz: number, r: number, color: number, rot: V3 = [0, 0, 0], collide = false): void {
  b.cyl(r, r, r * 0.22, f.p(lx, ly, lz), { mat: 'plasticGloss', color, rot: f.r(...rot), seg: 24, collide });
  b.cyl(r * 0.8, r * 0.8, r * 0.24, f.p(lx, ly + 0.005, lz), { mat: 'plasticGloss', color: new THREE.Color(color).multiplyScalar(0.8).getHex(), rot: f.r(...rot), seg: 24 });
  for (const [hx, hz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    b.cyl(r * 0.1, r * 0.1, r * 0.26, f.p(lx + hx * r * 0.22, ly + 0.01, lz + hz * r * 0.22), { mat: 'matte', color: 0x111111, rot: f.r(...rot), seg: 8 });
}

/** Thread spool: wooden flanges with wound thread. */
export function spool(b: WorldBuilder, f: Frame, lx: number, lz: number, y0: number, r: number, h: number, threadColor: number, collide = true): void {
  b.cyl(r, r, 0.22, f.p(lx, y0 + 0.11, lz), { mat: 'wood', color: 0xd8b98a, seg: 24, collide });
  b.cyl(r * 0.78, r * 0.78, h - 0.44, f.p(lx, y0 + h / 2, lz), { mat: 'fabric', color: threadColor, seg: 24, collide });
  b.cyl(r, r, 0.22, f.p(lx, y0 + h - 0.11, lz), { mat: 'wood', color: 0xd8b98a, seg: 24, collide });
  if (collide) b.colliderFor(r * 1.8, h, r * 1.8, f.p(lx, y0 + h / 2, lz), { collide: true });
}

/** Sign board on a card or plank backing. Faces +z of the frame. */
export function signBoard(b: WorldBuilder, f: Frame, key: string, lx: number, ly: number, lz: number, w: number, rot: V3 = [0, 0, 0], backing: 'card' | 'plank' | 'brass' = 'card'): void {
  const h = w * (192 / 512);
  const bmat = backing === 'brass' ? 'brass' : backing === 'plank' ? 'wood' : 'cardboard';
  const s = f.sub(lx, ly, lz, rot[1]);
  b.box(w + 0.14, h + 0.14, 0.08, s.p(0, 0, 0), { mat: bmat, color: backing === 'brass' ? 0xffffff : 0xcaa57a, rot: s.r(rot[0], 0, rot[2]) });
  b.quad(w, h, s.p(0, 0, 0.045), { mat: 'sign', uvRect: b.mats.signRect(key), rot: s.r(rot[0], 0, rot[2]) });
}

/** Scattered floor litter: paper scraps, crumbs, a screw, thread offcuts. Purely visual. */
export function litter(b: WorldBuilder, f: Frame, x0: number, z0: number, x1: number, z1: number, n: number, rng: Rng, y = 0): void {
  for (let i = 0; i < n; i++) {
    const x = rng.range(x0, x1), z = rng.range(z0, z1);
    const k = rng.next();
    if (k < 0.35) b.quad(rng.range(0.4, 1.4), rng.range(0.3, 1.0), f.p(x, y + 0.012 + i * 0.0004, z), { mat: 'paper', rot: f.r(-Math.PI / 2, rng.range(0, 6.28), 0), color: rng.pick([0xffffff, 0xf2e6cc, 0xe6eef2]), noBake: false });
    else if (k < 0.65) b.sphere(rng.range(0.06, 0.18), f.p(x, y + 0.05, z), { mat: 'crumb', color: 0xd9a35c, scale: [1, 0.6, 1.2], seg: 6 });
    else if (k < 0.8) b.rod(f.p(x, y + 0.03, z), f.p(x + rng.range(-1, 1), y + 0.03, z + rng.range(-1, 1)), 0.02, { mat: 'thread', color: rng.pick(PAL.thread) });
    else if (k < 0.9) b.cyl(0.05, 0.05, 0.5, f.p(x, y + 0.05, z), { mat: 'metal', color: 0x9a9a9a, rot: f.r(Math.PI / 2, rng.range(0, 6), 0), seg: 6 });
    else b.box(rng.range(0.2, 0.5), 0.03, rng.range(0.2, 0.5), f.p(x, y + 0.015, z), { mat: 'foil', color: 0xd8d8d8, rot: f.r(0, rng.range(0, 6), 0) });
  }
}

/** Stairs: visible treads (popsicle sticks or cardboard), side stringers, ramp collider. Rises along +z of frame. */
export function stairs(b: WorldBuilder, f: Frame, lx: number, lz: number, y0: number, w: number, run: number, rise: number, mat: 'wood' | 'cardboard' = 'wood', rails = true): void {
  const steps = Math.max(2, Math.round(rise / 0.32));
  const sr = rise / steps, sd = run / steps;
  for (let i = 0; i < steps; i++) {
    const y = y0 + sr * (i + 1);
    b.box(w, 0.1, sd * 1.15, f.p(lx, y - 0.05, lz + sd * (i + 0.5)), { mat, color: mat === 'wood' ? 0xe2c48f : 0xc9a477, rot: f.r() });
    // riser glue line
    b.box(w * 0.96, sr, 0.04, f.p(lx, y - sr / 2, lz + sd * i + 0.02), { mat: 'cardboard', color: 0xa88a62, rot: f.r() });
  }
  const ang = Math.atan2(rise, run);
  const len = Math.hypot(rise, run);
  for (const s of [-1, 1]) {
    b.box(0.12, 0.4, len, f.p(lx + s * (w / 2 + 0.06), y0 + rise / 2 - 0.1, lz + run / 2), { mat: 'wood', color: 0xcfae78, rot: f.r(-ang, 0, 0) });
    if (rails) {
      b.rod(f.p(lx + s * (w / 2 + 0.06), y0 + 1.0, lz), f.p(lx + s * (w / 2 + 0.06), y0 + rise + 1.0, lz + run), 0.04, { mat: 'thread', color: 0xd8c9a8 });
      for (let k = 0; k <= 3; k++) {
        const t = k / 3;
        toothpick(b, f, lx + s * (w / 2 + 0.06), lz + run * t, y0 + rise * t, 0.95);
      }
    }
  }
  // ramp collider + side walls (absolute heights: frame y + local y0)
  const Y0 = f.y + y0;
  const rp = f.p(lx, y0 + rise / 2, lz + run / 2);
  b.col.add({ x: rp[0], z: rp[2], w, d: run, minY: Y0 - 0.2, maxY: Y0 + rise, rotY: f.ry, ramp: { axis: 1, y0: Y0, y1: Y0 + rise }, tag: 'stairs' });
  if (rails)
    for (const s of [-1, 1]) {
      const p = f.p(lx + s * (w / 2 + 0.15), y0 + rise / 2 + 0.6, lz + run / 2);
      b.col.add({ x: p[0], z: p[2], w: 0.2, d: run, minY: Y0 + 0.6, maxY: Y0 + rise + 1.4, rotY: f.ry, noCamera: true, tag: 'rail' });
    }
}

/** Popsicle-stick bridge with paper-clip railings between two points at equal height. */
export function bridge(b: WorldBuilder, a: V3, c: V3, w: number, rng: Rng): void {
  const dx = c[0] - a[0], dz = c[2] - a[2];
  const len = Math.hypot(dx, dz);
  const ry = Math.atan2(dx, dz);
  const f = new Frame(a[0], a[1], a[2], ry);
  const sticks = Math.ceil(len / 0.62);
  for (let i = 0; i < sticks; i++) {
    const z = (i + 0.5) * (len / sticks);
    const sagY = -Math.sin((z / len) * Math.PI) * 0.12;
    b.box(w, 0.09, 0.56, f.p(rng.range(-0.04, 0.04), sagY - 0.045, z), { mat: 'wood', color: rng.pick([0xe5c995, 0xdcbd85, 0xe9d2a3]), rot: f.r(0, rng.range(-0.03, 0.03), 0) });
  }
  // stringers
  for (const s of [-1, 1]) b.box(0.1, 0.12, len, f.p(s * (w / 2 - 0.05), -0.16, len / 2), { mat: 'wood', color: 0xcaa16b, rot: f.r() });
  // paper-clip rails: elongated loops of wire
  for (const s of [-1, 1]) {
    const nClips = Math.ceil(len / 2.2);
    for (let k = 0; k < nClips; k++) {
      const z0 = k * (len / nClips), z1 = (k + 1) * (len / nClips);
      const x = s * (w / 2 + 0.02);
      const col = rng.pick([0xb8bec4, 0xc0392b, 0x2e86ab, 0xb8bec4]);
      const yb = 0.25, yt = 1.05;
      b.rod(f.p(x, yb, z0 + 0.1), f.p(x, yt, z0 + 0.1), 0.03, { mat: 'metal', color: col });
      b.rod(f.p(x, yt, z0 + 0.1), f.p(x, yt, z1 - 0.1), 0.03, { mat: 'metal', color: col });
      b.rod(f.p(x, yb, z0 + 0.1), f.p(x, yb, z1 - 0.1), 0.03, { mat: 'metal', color: col });
      b.rod(f.p(x, yb + 0.12, z1 - 0.1), f.p(x, yt - 0.12, z1 - 0.1), 0.03, { mat: 'metal', color: col });
      threadWrap(b, f, x, yt, z1 - 0.05, 0.03, 0xe1b12c);
    }
  }
  const mid = f.p(0, -0.05, len / 2);
  b.col.add({ x: mid[0], z: mid[2], w, d: len, minY: a[1] - 0.25, maxY: a[1], rotY: ry, tag: 'bridge' });
  for (const s of [-1, 1]) {
    const p = f.p(s * (w / 2 + 0.1), 0.7, len / 2);
    b.col.add({ x: p[0], z: p[2], w: 0.16, d: len, minY: a[1] + 0.2, maxY: a[1] + 1.6, rotY: ry, noCamera: true, tag: 'rail' });
  }
}

/** A simple railing along a line with toothpick posts and thread rope; adds an invisible collider. */
export function railing(b: WorldBuilder, a: V3, c: V3, rng: Rng, kind: 'thread' | 'chain' = 'thread'): void {
  const len = Math.hypot(c[0] - a[0], c[2] - a[2]);
  const n = Math.max(1, Math.ceil(len / 1.6));
  const ry = Math.atan2(c[0] - a[0], c[2] - a[2]);
  const f = new Frame(a[0], a[1], a[2], ry);
  for (let i = 0; i <= n; i++) {
    const z = (i / n) * len;
    if (kind === 'chain') b.cyl(0.08, 0.1, 1.0, f.p(0, 0.5, z), { mat: 'gold', seg: 10 });
    else toothpick(b, f, 0, z, 0, 0.95, { wrapColor: rng.pick(PAL.thread) });
  }
  if (kind === 'chain') {
    for (let i = 0; i < n * 6; i++) {
      const z = ((i + 0.5) / (n * 6)) * len;
      const sag = -Math.sin(((i % 6) / 6) * Math.PI) * 0.12;
      b.sphere(0.07, f.p(0, 0.85 + sag, z), { mat: 'gold', scale: [0.6, 1, 1.4], seg: 6 });
    }
  } else b.sag(f.p(0, 0.85, 0), f.p(0, 0.85, len), 0.1, 0.025, { mat: 'thread', color: 0xd9ccb0 }, Math.max(4, n * 3));
  const m = f.p(0, 0.7, len / 2);
  b.col.add({ x: m[0], z: m[2], w: 0.3, d: len, minY: a[1] + 0.1, maxY: a[1] + 1.8, rotY: ry, noCamera: true, tag: 'rail' });
}

/** AA battery lying down: the settlement's electricity. */
export function battery(b: WorldBuilder, f: Frame, lx: number, ly: number, lz: number, ry: number, color: number): void {
  const s = f.sub(lx, ly, lz, ry);
  b.cyl(0.5, 0.5, 3.5, s.p(0, 0.5, 0), { mat: 'plasticGloss', color, rot: s.r(Math.PI / 2, 0, 0), seg: 20 });
  b.colliderFor(1, 1, 3.5, s.p(0, 0.5, 0), { collide: true, rot: s.r() });
  b.cyl(0.18, 0.18, 0.15, s.p(0, 0.5, 1.8), { mat: 'metal', color: 0xdddddd, rot: s.r(Math.PI / 2, 0, 0), seg: 12 });
  b.cyl(0.51, 0.51, 0.9, s.p(0, 0.5, -1.2), { mat: 'plasticGloss', color: 0x1b1b1b, rot: s.r(Math.PI / 2, 0, 0), seg: 20 });
}

/** Large torn paper sheet laid as street surface. */
export function paperSheet(b: WorldBuilder, f: Frame, lx: number, lz: number, y: number, w: number, d: number, rng: Rng, color = 0xf3ead8): void {
  const g = new THREE.PlaneGeometry(w, d, 8, 8);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, rng.range(0, 0.03));
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / 5, (uv.getY(i) * d) / 5);
  b.add(normalize(g), f.p(lx, y, lz), { mat: 'paper', color, rot: f.r(-Math.PI / 2, rng.range(-0.08, 0.08), 0) });
}
