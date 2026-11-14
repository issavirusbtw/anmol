// Larger assemblies: matchbox homes, apartment stacks, market stalls, scrap heaps, lifts.
import * as THREE from 'three';
import { Rng } from '../core/rng';
import { WorldBuilder, V3 } from './builder';
import { Frame } from './frame';
import { PAL, tape, toothpick, awning, bottleCap, signBoard, crate, matchstick, threadWrap, hangingLamp, button } from './props';
import { quadRect } from '../render/materials';
import { WorldData, Lift } from './worldData';

const T = 0.1; // cardboard wall thickness

export interface HomeOpts {
  w?: number;
  h?: number;
  d?: number;
  label?: number;
  paint?: number | null;
  door?: boolean;
  enterable?: boolean;
  window?: boolean;
  lit?: boolean;
  curtain?: number;
  tag?: string;
}

/**
 * Matchbox home lying on its back, door on the +z face. Frame y = floor.
 * Enterable homes get real wall colliders with a doorway and a walkable roof.
 */
export function matchboxHome(b: WorldBuilder, f: Frame, rng: Rng, o: HomeOpts = {}): { interior: Frame; door: V3 } {
  const w = o.w ?? 4.2, h = o.h ?? 2.9, d = o.d ?? 6;
  const paint = o.paint === undefined ? (rng.chance(0.6) ? rng.pick(PAL.paint) : null) : o.paint;
  const outer = paint !== null ? 'painted' : 'cardboard';
  const oc = paint ?? rng.pick(PAL.card);
  const col = o.enterable ? true : true;
  // floor (tray)
  b.box(w, 0.08, d, f.p(0, 0.04, 0), { mat: 'cardboard', color: 0xb99a72, rot: f.r(), collide: o.enterable });
  // left wall solid
  b.box(T, h, d, f.p(-w / 2 + T / 2, h / 2, 0), { mat: outer, color: oc, rot: f.r(), collide: col });
  // right wall with window opening
  const winY0 = 1.0, winY1 = 2.0, winZ0 = -1.4, winZ1 = 0.2;
  if (o.window !== false) {
    const rx = w / 2 - T / 2;
    b.box(T, winY0, d, f.p(rx, winY0 / 2, 0), { mat: outer, color: oc, rot: f.r(), collide: col });
    b.box(T, h - winY1, d, f.p(rx, (h + winY1) / 2, 0), { mat: outer, color: oc, rot: f.r(), collide: col });
    b.box(T, winY1 - winY0, winZ0 + d / 2, f.p(rx, (winY0 + winY1) / 2, (winZ0 - d / 2) / 2), { mat: outer, color: oc, rot: f.r(), collide: col });
    b.box(T, winY1 - winY0, d / 2 - winZ1, f.p(rx, (winY0 + winY1) / 2, (winZ1 + d / 2) / 2), { mat: outer, color: oc, rot: f.r(), collide: col });
    // matchstick window frame + taped plastic glazing
    const wf = f.sub(rx + 0.07, 0, 0);
    matchstick(b, wf, [0, winY0, winZ0], [0, winY0, winZ1]);
    matchstick(b, wf, [0, winY1, winZ1], [0, winY1, winZ0]);
    b.box(0.02, winY1 - winY0, winZ1 - winZ0, wf.p(-0.05, (winY0 + winY1) / 2, (winZ0 + winZ1) / 2), {
      mat: o.lit ? 'glowSoft' : 'plasticClear',
      color: o.lit ? 0xffc27a : 0xdfe8e8,
      rot: f.r(),
      noBake: true,
    });
    tape(b, wf, 0.03, winY1 - 0.1, winZ0 + 0.2, 0.3, 0.2, [0, Math.PI / 2, 0.6]);
  } else b.box(T, h, d, f.p(w / 2 - T / 2, h / 2, 0), { mat: outer, color: oc, rot: f.r(), collide: col });
  // back wall (drawer end)
  b.box(w, h, T, f.p(0, h / 2, -d / 2 + T / 2), { mat: 'cardboard', color: rng.pick(PAL.card), rot: f.r(), collide: col });
  // roof (walkable) + label + striker strips
  b.box(w, T, d, f.p(0, h - T / 2, 0), { mat: outer, color: oc, rot: f.r(), collide: col });
  b.quad(w * 0.8, d * 0.62, f.p(0, h + 0.006, 0.2), { mat: 'label', uvRect: quadRect(o.label ?? rng.int(0, 3)), rot: f.r(-Math.PI / 2, 0, 0) });
  for (const s of [-1, 1]) b.box(0.03, 0.6, d * 0.9, f.p(s * (w / 2 + 0.015), h - 0.5, 0), { mat: 'crumb', color: 0x4a3226, rot: f.r() });
  // exposed cardboard thickness on the front edges
  b.box(w, 0.04, 0.05, f.p(0, h - 0.02, d / 2 + 0.01), { mat: 'corrugated', color: 0xc9a477, rot: f.r() });
  // front wall with doorway
  const dw = 1.25, dh = 2.15, dx = o.door === false ? 0 : -0.5;
  if (o.door === false) b.box(w, h, T, f.p(0, h / 2, d / 2 - T / 2), { mat: outer, color: oc, rot: f.r(), collide: col });
  else {
    const lw = w / 2 + dx - dw / 2, rw = w / 2 - dx - dw / 2;
    b.box(lw, h, T, f.p(-w / 2 + lw / 2, h / 2, d / 2 - T / 2), { mat: outer, color: oc, rot: f.r(), collide: col });
    b.box(rw, h, T, f.p(w / 2 - rw / 2, h / 2, d / 2 - T / 2), { mat: outer, color: oc, rot: f.r(), collide: col });
    b.box(dw, h - dh, T, f.p(dx, (h + dh) / 2, d / 2 - T / 2), { mat: outer, color: oc, rot: f.r(), collide: col });
    // door curtain of fabric, half drawn, tied with thread
    const cc = o.curtain ?? rng.pick([0xa83a32, 0x2f6a8a, 0xc79a3a, 0x5b7a3e, 0x7a4b7a]);
    b.box(dw * 0.5, dh - 0.1, 0.03, f.p(dx - dw * 0.25, dh / 2 + 0.05, d / 2 + 0.03), { mat: 'fabric', color: cc, rot: f.r(0, 0, 0.04) });
    threadWrap(b, f, dx - dw * 0.38, 1.1, d / 2 + 0.05, 0.08, 0xe8dcc0);
    toothpick(b, f, dx, d / 2 + 0.05, dh + 0.02, 0.0); // rod stub
    b.rod(f.p(dx - dw / 2, dh, d / 2 + 0.05), f.p(dx + dw / 2, dh, d / 2 + 0.05), 0.03, { mat: 'wood', color: 0xe6cfa3 });
    // doorstep: a coin-like button
    button(b, f, dx, 0.03, d / 2 + 0.45, 0.45, rng.pick([0x6b4a2b, 0x2e4057, 0x8c2f39]));
  }
  // wear: tape patches, paint chips
  for (let k = 0; k < rng.int(1, 3); k++) tape(b, f, rng.range(-w / 3, w / 3), rng.range(0.4, h - 0.4), d / 2 + 0.03, rng.range(0.3, 0.7), rng.range(0.15, 0.3), [0, 0, rng.range(-0.6, 0.6)]);
  if (o.lit) b.lamp(f.p(0, h - 0.6, 0.6), 0xffb46a, 1.2, 6, 0.6, o.tag);
  return { interior: f, door: f.p(dx, 0, d / 2 + 0.8) };
}

/** Non-enterable apartment pod for stacks (cheaper): painted box with lit window, door, balcony. */
export function pod(b: WorldBuilder, f0: Frame, rng: Rng, w: number, h: number, d: number, wealth = 0, lit = 0.6): void {
  const rich = wealth > 0.6;
  // hand-built: nothing sits perfectly square
  const f = f0.sub(rng.range(-0.08, 0.08), 0, rng.range(-0.25, 0.15), rng.range(-0.04, 0.04));
  const kind = rich ? 'plasticGloss' : rng.pick(['painted', 'painted', 'cardboard', 'cardboard', 'foil', 'corrugated'] as const);
  const col = rich
    ? rng.pick([0xf4e9dc, 0xdcebe6, 0xeadcea, 0xe4eedb, 0xf2e2c4])
    : kind === 'painted'
      ? rng.pick(PAL.paint)
      : kind === 'foil'
        ? 0xcfcfcf
        : rng.pick(PAL.card);
  b.box(w, h, d, f.p(0, h / 2, 0), { mat: kind, color: col, rot: f.r() });
  // roof: label on matchbox lids, a corrugated or gold eave along the front
  if (!rich && rng.chance(0.6)) b.quad(w * 0.7, Math.min(d, 3) * 0.6, f.p(0, h + 0.01, 0), { mat: 'label', uvRect: quadRect(rng.int(0, 3)), rot: f.r(-Math.PI / 2, 0, 0) });
  b.box(w + 0.2, 0.12, 0.35, f.p(0, h + 0.02, d / 2 + 0.08), { mat: rich ? 'gold' : 'corrugated', color: rich ? 0xffffff : rng.pick(PAL.card), rot: f.r(-0.25, 0, 0) });
  // windows with matchstick frames; unlit ones show a curtain, not a black hole
  const nWin = Math.max(1, Math.floor(w / 1.8));
  for (let i = 0; i < nWin; i++) {
    const x = -w / 2 + (i + 0.5) * (w / nWin);
    if (i === 0 && h > 2.2) {
      // doorway with a frame and a scrap of cloth
      b.quad(0.9, 1.8, f.p(x, 0.95, d / 2 + 0.012), { mat: 'cardboard', color: 0x2e241b, rot: f.r() });
      b.box(1.06, 0.08, 0.1, f.p(x, 1.88, d / 2 + 0.05), { mat: 'wood', color: 0xe5cfa0, rot: f.r() });
      if (rng.chance(0.6)) b.box(0.44, 1.5, 0.02, f.p(x - 0.22, 1.05, d / 2 + 0.04), { mat: 'fabric', color: rng.pick(PAL.thread), rot: f.r(0, 0, 0.03) });
      if (!rich && rng.chance(0.35)) awning(b, f, x, 2.15, d / 2 + 0.45, 1.3, 0.9, rng.int(0, 3), rng, 0.45, false);
      continue;
    }
    const on = rng.chance(lit);
    const wy = h * 0.58;
    b.quad(0.9, 0.75, f.p(x, wy, d / 2 + 0.012), { mat: on ? 'glowSoft' : 'fabric', color: on ? rng.pick([0xffc47a, 0xffd59a, 0xffb36b, 0xfff0d0]) : rng.pick([0x5a3a3a, 0x3a4a5a, 0x5a5236, 0x463a52]), rot: f.r(), noBake: on });
    for (const s of [-1, 1]) b.box(0.07, 0.86, 0.07, f.p(x + s * 0.48, wy, d / 2 + 0.04), { mat: 'wood', color: 0xe5cfa0, rot: f.r() });
    b.box(1.05, 0.07, 0.1, f.p(x, wy - 0.42, d / 2 + 0.05), { mat: 'wood', color: 0xe5cfa0, rot: f.r() });
    b.box(1.0, 0.06, 0.08, f.p(x, wy + 0.42, d / 2 + 0.04), { mat: 'wood', color: 0xd9bf8f, rot: f.r() });
    if (rich && rng.chance(0.5)) b.box(0.9, 0.18, 0.25, f.p(x, wy - 0.52, d / 2 + 0.15), { mat: 'moss', color: 0xffffff, rot: f.r() });
    if (on && rng.chance(0.25)) b.lamp(f.p(x, wy, d / 2 + 0.5), rich ? 0xffe8c8 : 0xffb46a, 0.6, 4, rich ? 0.5 : 0.35);
  }
  if (!rich && rng.chance(0.5)) tape(b, f, rng.range(-w / 3, w / 3), rng.range(0.3, h - 0.3), d / 2 + 0.02, 0.5, 0.2, [0, 0, rng.range(-0.5, 0.5)]);
  if (!rich && rng.chance(0.25)) b.box(rng.range(0.6, 1.2), rng.range(0.4, 0.9), 0.03, f.p(rng.range(-w / 3, w / 3), rng.range(0.4, h - 0.6), d / 2 + 0.03), { mat: 'foil', color: 0xd8d8d8, rot: f.r(0, 0, rng.range(-0.3, 0.3)) });
  if (rng.chance(0.35)) {
    // popsicle-stick balcony with a thread rail
    b.box(w * 0.7, 0.08, 0.8, f.p(0, 0.02, d / 2 + 0.4), { mat: rich ? 'plasticGloss' : 'wood', color: rich ? 0xf5efe6 : 0xe3c58f, rot: f.r() });
    b.rod(f.p(-w * 0.35, 0.6, d / 2 + 0.8), f.p(w * 0.35, 0.6, d / 2 + 0.8), 0.025, { mat: rich ? 'gold' : 'thread', color: 0xd9ccb0 });
  }
}

/** A cliff of stacked pods with ladders and laundry, against a wall. Frame faces +z. */
export function apartmentStack(b: WorldBuilder, f: Frame, rng: Rng, width: number, depth: number, floors: number, opts: { wealth?: number; lit?: number; floorH?: number; startY?: number } = {}): void {
  const fh = opts.floorH ?? 2.9;
  const startY = opts.startY ?? 0;
  for (let lvl = 0; lvl < floors; lvl++) {
    let x = -width / 2;
    const setback = Math.min(depth * 0.45, rng.range(0, 1.2) + lvl * 0.4);
    while (x < width / 2 - 1) {
      const w = Math.min(rng.range(2.6, 4.6), width / 2 - x);
      const h = fh * rng.range(0.85, 1.0);
      const dd = Math.max(1.2, depth - setback - rng.range(0, 0.6));
      pod(b, f.sub(x + w / 2, startY + lvl * fh, -depth / 2 + dd / 2, 0), rng, w - 0.08, h, dd, opts.wealth ?? 0, opts.lit ?? 0.6);
      // ladder between some floors
      if (lvl > 0 && rng.chance(0.25)) {
        const lz = -depth / 2 + dd + 0.25;
        const lf = f.sub(x + w * 0.8, startY + (lvl - 1) * fh, lz);
        b.rod(lf.p(-0.3, 0, 0), lf.p(-0.3, fh + 0.3, 0), 0.05, { mat: 'wood', color: 0xe6cfa3 });
        b.rod(lf.p(0.3, 0, 0), lf.p(0.3, fh + 0.3, 0), 0.05, { mat: 'wood', color: 0xe6cfa3 });
        for (let r = 0.3; r < fh; r += 0.45) b.rod(lf.p(-0.3, r, 0), lf.p(0.3, r, 0), 0.04, { mat: 'wood', color: 0xd9b98a });
      }
      // laundry line across the face
      if (rng.chance(0.2)) {
        const y = startY + lvl * fh + fh * 0.92;
        const z = -depth / 2 + dd + 0.6;
        const a = f.p(x + 0.2, y, z), c = f.p(x + w - 0.2, y, z);
        b.rod(a, c, 0.015, { mat: 'thread', color: 0xe8e0d0 });
        for (let k = 0; k < 3; k++) {
          const t = (k + 0.5) / 3;
          b.box(0.45, 0.55, 0.02, [a[0] + (c[0] - a[0]) * t, a[1] - 0.3, a[2] + (c[2] - a[2]) * t], { mat: 'fabric', color: rng.pick(PAL.thread), rot: f.r(0, 0, rng.range(-0.1, 0.1)) });
        }
      }
      x += w;
    }
  }
}

export type Goods = 'crumbs' | 'water' | 'fabric' | 'salvage' | 'luxury';

/** Furnished market stall: eraser counter, goods in bottle-cap bowls, shelving, awning, sign, lamp. Frame y = floor, faces +z. */
export function stall(b: WorldBuilder, f: Frame, rng: Rng, goods: Goods, sign: string, w = 3.6, d = 2.4, awn = 0): THREE.Vector3 {
  // counter: an eraser block on two matchboxes
  const cy = 1.05;
  b.box(w, 0.32, 0.9, f.p(0, cy, d / 2 - 0.45), { mat: goods === 'luxury' ? 'plasticGloss' : 'rubber', color: goods === 'luxury' ? 0xf5efe6 : rng.pick([0xe7a1a1, 0xd9c3e8, 0xa9d1c9, 0xf0d9a0]), rot: f.r() });
  for (const s of [-1, 1]) b.box(0.9, cy - 0.16, 0.75, f.p(s * (w / 2 - 0.55), (cy - 0.16) / 2, d / 2 - 0.45), { mat: 'painted', color: rng.pick(PAL.paint), rot: f.r() });
  b.colliderFor(w, cy + 0.16, 0.9, f.p(0, (cy + 0.16) / 2, d / 2 - 0.45), { collide: true, rot: f.r() });
  // back shelving of popsicle sticks on toothpicks
  for (const y of [1.0, 1.8]) b.box(w - 0.3, 0.07, 0.6, f.p(0, y, -d / 2 + 0.35), { mat: 'wood', color: 0xe3c58f, rot: f.r() });
  for (const s of [-1, 1]) toothpick(b, f, s * (w / 2 - 0.2), -d / 2 + 0.35, 0, 2.2, { wrapColor: rng.pick(PAL.thread) });
  b.colliderFor(w - 0.2, 2.2, 0.7, f.p(0, 1.1, -d / 2 + 0.35), { collide: true, rot: f.r() });
  // goods
  const put = (lx: number, ly: number, lz: number) => {
    switch (goods) {
      case 'crumbs':
        bottleCap(b, f, lx, ly, lz, 0.38, rng.pick([0xc0392b, 0x2e86ab, 0xe1b12c]), { flip: true });
        for (let k = 0; k < 4; k++) b.sphere(rng.range(0.1, 0.18), f.p(lx + rng.range(-0.15, 0.15), ly + 0.2, lz + rng.range(-0.15, 0.15)), { mat: 'crumb', color: rng.pick([0xe0a65a, 0xc98b46, 0xf0c27b]), seg: 7 });
        break;
      case 'water':
        bottleCap(b, f, lx, ly, lz, 0.36, 0xdedede, { flip: true });
        b.cyl(0.3, 0.3, 0.04, f.p(lx, ly + 0.14, lz), { mat: 'water', seg: 16 });
        break;
      case 'fabric':
        b.box(0.55, 0.12 * rng.int(1, 3), 0.4, f.p(lx, ly + 0.12, lz), { mat: 'fabric', color: rng.pick(PAL.thread), rot: f.r(0, rng.range(-0.2, 0.2), 0) });
        break;
      case 'salvage':
        if (rng.chance(0.5)) b.cyl(0.05, 0.05, 0.6, f.p(lx, ly + 0.05, lz), { mat: 'metal', color: 0xb0b0b0, rot: f.r(Math.PI / 2, rng.range(0, 3), 0), seg: 6 });
        else button(b, f, lx, ly + 0.04, lz, 0.22, rng.pick([0x334455, 0x884422, 0x226644]));
        break;
      case 'luxury':
        b.sphere(0.16, f.p(lx, ly + 0.16, lz), { mat: 'candy', color: rng.pick([0xe84a5f, 0xffd166, 0x7bd389, 0xc77dff]), seg: 10 });
        break;
    }
  };
  for (let i = 0; i < 4; i++) put(-w / 2 + 0.5 + i * ((w - 1) / 3), cy + 0.16, d / 2 - 0.45);
  for (const y of [1.04, 1.84]) for (let i = 0; i < 4; i++) put(-w / 2 + 0.55 + i * ((w - 1.1) / 3), y, -d / 2 + 0.35);
  // stool (thimble)
  b.cyl(0.32, 0.38, 0.75, f.p(w / 2 - 0.5, 0.375, -0.1), { mat: 'metal', color: 0xb9b3a6, seg: 14 });
  // awning, sign, lamp
  awning(b, f, 0, 2.75, 0.1, w + 0.5, d + 0.6, awn, rng, 0.32);
  signBoard(b, f, sign, 0, 3.45, -d / 2 + 0.2, Math.min(w, 3.2), [0, 0, 0]);
  hangingLamp(b, f.p(0.6, 2.75, 0.3), 0.6, 0xffc070, 'foil', 1.4, 7);
  return new THREE.Vector3(...f.p(0, 0, d / 2 + 0.9));
}

/** Scavenge heap: crumpled paper, foil, wire, caps, screws. */
export function scrapHeap(b: WorldBuilder, f: Frame, lx: number, lz: number, r: number, rng: Rng): void {
  for (let i = 0; i < 9; i++) {
    const a = rng.range(0, Math.PI * 2), rr = rng.range(0, r);
    const x = lx + Math.cos(a) * rr, z = lz + Math.sin(a) * rr;
    const k = rng.next();
    const y = (1 - rr / r) * r * 0.5;
    if (k < 0.3) {
      // crumpled paper ball
      const g = new THREE.IcosahedronGeometry(rng.range(0.4, 0.8), 1);
      const p = g.getAttribute('position') as THREE.BufferAttribute;
      for (let v = 0; v < p.count; v++) p.setXYZ(v, p.getX(v) * rng.range(0.75, 1.15), p.getY(v) * rng.range(0.7, 1.1), p.getZ(v) * rng.range(0.75, 1.15));
      g.computeVertexNormals();
      b.add(g, f.p(x, y + 0.3, z), { mat: 'paper', color: rng.pick([0xffffff, 0xf2e6cc, 0xe8eef4]), rot: f.r(rng.range(0, 3), rng.range(0, 3), 0) });
    } else if (k < 0.5) {
      const g = new THREE.IcosahedronGeometry(rng.range(0.25, 0.5), 1);
      const p = g.getAttribute('position') as THREE.BufferAttribute;
      for (let v = 0; v < p.count; v++) p.setXYZ(v, p.getX(v) * rng.range(0.7, 1.2), p.getY(v) * rng.range(0.7, 1.2), p.getZ(v) * rng.range(0.7, 1.2));
      g.computeVertexNormals();
      b.add(g, f.p(x, y + 0.2, z), { mat: 'foil', color: 0xdcdcdc });
    } else if (k < 0.65) bottleCap(b, f, x, y, z, 0.5, rng.pick([0xb03a2e, 0x2e6a8a, 0xd4a017, 0x666666]), { flip: rng.chance(0.5) });
    else if (k < 0.8) b.cyl(0.06, 0.06, rng.range(0.8, 1.6), f.p(x, y + 0.1, z), { mat: 'metal', color: 0xa6a6a6, rot: f.r(Math.PI / 2, rng.range(0, 6), rng.range(-0.3, 0.3)), seg: 6 });
    else if (k < 0.9) b.box(rng.range(0.6, 1.2), 0.08, rng.range(0.4, 0.8), f.p(x, y + 0.06, z), { mat: 'cardboard', color: rng.pick(PAL.card), rot: f.r(rng.range(-0.4, 0.4), rng.range(0, 6), rng.range(-0.4, 0.4)) });
    else b.rod(f.p(x, y + 0.1, z), f.p(x + rng.range(-1, 1), y + 0.3, z + rng.range(-1, 1)), 0.03, { mat: 'metal', color: 0xc77b30 });
  }
}

/**
 * A lift: platform (matchbox tray) in a toothpick cage, hung from thread over a spool pulley
 * driven by a small motor. Dynamic platform collider; gates at both ends.
 */
export function buildLift(b: WorldBuilder, wd: WorldData, id: string, x: number, z: number, y0: number, y1: number, rng: Rng, opts: { luxury?: boolean; working?: boolean; permit?: boolean; doorZ?: 1 | -1 } = {}): Lift {
  const size = 3.2;
  const lux = !!opts.luxury;
  // shaft posts (static)
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    b.cyl(0.11, 0.11, y1 - y0 + 3.2, [x + sx * (size / 2 + 0.15), (y0 + y1 + 3.2) / 2, z + sz * (size / 2 + 0.15)], { mat: lux ? 'brass' : 'wood', color: lux ? 0xffffff : 0xdcc08e, seg: 8, collide: true });
  }
  // cross bracing every few units with thread ties
  for (let y = y0 + 3; y < y1; y += 4) {
    for (const s of [-1, 1]) {
      b.rod([x - size / 2 - 0.15, y, z + s * (size / 2 + 0.15)], [x + size / 2 + 0.15, y + 1.5, z + s * (size / 2 + 0.15)], 0.04, { mat: lux ? 'brass' : 'wood', color: 0xd9b98a });
      b.rod([x + s * (size / 2 + 0.15), y + 0.7, z - size / 2 - 0.15], [x + s * (size / 2 + 0.15), y + 2.2, z + size / 2 + 0.15], 0.04, { mat: lux ? 'brass' : 'wood', color: 0xd9b98a });
    }
  }
  // pulley spool + motor at top
  const top = y1 + 3.6;
  b.cyl(0.5, 0.5, 1.8, [x, top, z], { mat: 'wood', color: 0xd8b98a, rot: [0, 0, Math.PI / 2], seg: 18 });
  b.cyl(0.38, 0.38, 1.4, [x, top, z], { mat: 'fabric', color: lux ? 0xc9a24a : 0xc0392b, rot: [0, 0, Math.PI / 2], seg: 18 });
  b.box(size + 0.6, 0.2, 0.3, [x, top + 0.5, z], { mat: lux ? 'brass' : 'wood', color: 0xcaa16b });
  // motor housing (static part), rotor added as group
  b.cyl(0.42, 0.42, 1.0, [x + size / 2 + 0.9, top, z], { mat: 'metal', color: lux ? 0xe8d9a8 : 0x8a8f96, rot: [0, 0, Math.PI / 2], seg: 16 });
  b.rod([x + size / 2 + 0.4, top, z], [x + 0.9, top, z], 0.06, { mat: 'metal', color: 0xcccccc });
  // wires from motor down to a battery bank
  b.sag([x + size / 2 + 1.4, top, z], [x + size / 2 + 1.6, y1 + 0.5, z - 2], 0.4, 0.04, { mat: 'thread', color: 0xb03a2e });
  // platform group (moves)
  b.beginGroup(`lift-${id}`);
  const py = 0;
  b.box(size, 0.22, size, [x, py - 0.11, z], { mat: lux ? 'plasticGloss' : 'cardboard', color: lux ? 0xf2efe8 : 0xc2a07a });
  for (const s of [-1, 1]) {
    b.box(size, 0.6, 0.08, [x, py + 0.3, z + s * (size / 2 - 0.04)], { mat: lux ? 'brass' : 'cardboard', color: lux ? 0xffffff : 0xb48a5c });
    b.box(0.08, 0.6, size, [x + s * (size / 2 - 0.04), py + 0.3, z], { mat: lux ? 'brass' : 'cardboard', color: lux ? 0xffffff : 0xb48a5c });
  }
  // hanger threads to the pulley
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    b.rod([x + sx * 1.4, py + 0.6, z + sz * 1.4], [x, py + 2.6, z], 0.025, { mat: 'thread', color: 0xe8dcc0 });
  b.cyl(0.08, 0.08, 0.5, [x, py + 2.8, z], { mat: 'metal', color: 0xb0b0b0, seg: 8 });
  // control lever + little bulb
  b.box(0.3, 1.1, 0.3, [x + size / 2 - 0.35, py + 0.55, z - size / 2 + 0.35], { mat: lux ? 'brass' : 'painted', color: lux ? 0xffffff : 0xb5523b });
  b.sphere(0.12, [x + size / 2 - 0.35, py + 1.2, z - size / 2 + 0.35], { mat: 'glow', color: 0xffc070 });
  const group = b.endGroup([x, y0, z]);
  // the single long thread above the platform is drawn dynamically by the game (it changes length)
  const solid = b.col.add({ x, z, w: size, d: size, minY: y0 - 0.25, maxY: y0, dynamic: true, tag: `lift-${id}` });
  // side guard colliders on the platform (invisible) except the door side, plus gates at each landing
  const gates: { solid: ReturnType<WorldBuilder['col']['add']>; y: number }[] = [];
  void gates;
  const L: Lift = {
    id,
    x,
    z,
    y0,
    y1,
    t: 0,
    target: 0,
    working: opts.working ?? true,
    permit: !!opts.permit,
    solid,
    group,
    gates: [],
    speed: 3.2,
  };
  // shaft walls (static, both levels) on three sides so you can't walk off mid-ride
  const dz = opts.doorZ ?? 1;
  for (const lvlY of [y0, y1]) {
    b.col.add({ x, z: z - dz * (size / 2 + 0.3), w: size + 0.6, d: 0.3, minY: lvlY, maxY: lvlY + 2.5, noCamera: true, tag: 'liftwall' });
    b.col.add({ x: x - size / 2 - 0.3, z, w: 0.3, d: size + 0.6, minY: lvlY, maxY: lvlY + 2.5, noCamera: true, tag: 'liftwall' });
    b.col.add({ x: x + size / 2 + 0.3, z, w: 0.3, d: size + 0.6, minY: lvlY, maxY: lvlY + 2.5, noCamera: true, tag: 'liftwall' });
  }
  // moving guard walls attached to the platform (door side) — the game repositions them
  const front = b.col.add({ x, z: z + dz * (size / 2 + 0.05), w: size, d: 0.2, minY: y0, maxY: y0 + 1.6, dynamic: true, noCamera: true, tag: 'liftguard' });
  front.enabled = false;
  L.gates.push(front);
  // landing gates: closed whenever the car is not at that landing, so nobody walks into an open shaft
  L.landing = [y0, y1].map((ly) => {
    const s = b.col.add({ x, z: z + dz * (size / 2 + 0.25), w: size, d: 0.25, minY: ly, maxY: ly + 2.2, noCamera: true, tag: 'landing' });
    return s;
  });
  wd.lifts.set(id, L);
  return L;
}

/** A thimble water basin under a dripping straw. */
export function waterPoint(b: WorldBuilder, wd: WorldData, f: Frame, lx: number, lz: number, ceilingY: number, rng: Rng): void {
  // thimble on a bottle-cap plinth
  bottleCap(b, f, lx, 0, lz, 1.0, 0x6b7f8f, { collide: true });
  const g = new THREE.CylinderGeometry(0.75, 0.85, 1.4, 24, 4, true);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  // dimpled thimble surface
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const k = 1 + Math.sin(a * 18) * Math.sin(p.getY(i) * 14) * 0.012;
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  b.add(g, f.p(lx, 0.42 + 0.7, lz), { mat: 'metal', color: 0xc9c2b2 });
  b.cyl(0.7, 0.7, 0.05, f.p(lx, 1.6, lz), { mat: 'water', seg: 24 });
  b.colliderFor(1.7, 1.85, 1.7, f.p(lx, 0.92, lz), { collide: true });
  // straw coming down from the ceiling with a bend, taped where it leaks
  const top = f.p(lx + 0.6, ceilingY, lz - 1.0);
  const mid = f.p(lx + 0.6, 3.4, lz - 1.0);
  const end = f.p(lx + 0.1, 2.9, lz - 0.2);
  const pts: V3[] = [top, mid, end];
  for (let i = 0; i < pts.length - 1; i++) b.rod(pts[i], pts[i + 1], 0.21, { mat: 'plasticGloss', color: i % 2 ? 0xffffff : 0xf2f2f2, seg: 12 });
  // red spiral stripes on the straw
  for (let y = 3.6; y < ceilingY - 0.3; y += 0.7) b.cyl(0.215, 0.215, 0.18, [top[0], f.y + y, top[2]], { mat: 'plasticGloss', color: 0xc0392b, seg: 12 });
  for (let k = -2; k <= 2; k++) b.sphere(0.24, [mid[0], mid[1] + k * 0.07, mid[2]], { mat: 'plasticGloss', color: 0xffffff, scale: [1, 0.4, 1], seg: 10 });
  tape(b, new Frame(0, 0, 0, f.ry), top[0], f.y + 6.5, top[2] + 0.22, 0.6, 0.45, [0, 0, 0.3]);
  b.sphere(0.12, [top[0], f.y + 6.3, top[2] + 0.2], { mat: 'water', seg: 8 });
  wd.drips.push(new THREE.Vector3(end[0], end[1] - 0.2, end[2]));
  wd.drips.push(new THREE.Vector3(top[0], f.y + 6.25, top[2] + 0.22));
  // puddle on the floor
  b.cyl(1.6, 1.6, 0.02, f.p(lx + 1.2, 0.012, lz + 0.8), { mat: 'water', seg: 24 });
  void rng;
  void crate;
  void signBoard;
  void hangingLamp;
}
