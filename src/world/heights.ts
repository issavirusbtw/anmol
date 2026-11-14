// THE HEIGHTS — tier 2, left half of the centre bay. Polished plastic, moss, pearls, bright and spacious.
import * as THREE from 'three';
import { Rng } from '../core/rng';
import { WorldBuilder } from './builder';
import { Frame } from './frame';
import { WorldData } from './worldData';
import { bottleCap, hangingLamp, railing, signBoard, toothpick } from './props';
import { TIER_Y, CABINET } from '../config';

export const HEIGHTS_Y = TIER_Y[2];
export const HEIGHTS_CEIL = TIER_Y[3] - 1.3;

function beadLamp(b: WorldBuilder, x: number, z: number, y: number, h = 3.2): void {
  b.cyl(0.07, 0.09, h, [x, y + h / 2, z], { mat: 'gold', seg: 8, collide: true });
  for (let k = 0; k < 4; k++) b.sphere(0.16, [x, y + 0.4 + k * 0.5, z], { mat: 'pearl', color: 0xf6efe6, seg: 10 });
  b.sphere(0.3, [x, y + h + 0.2, z], { mat: 'glow', color: 0x80786a, seg: 12 });
  b.cyl(0.36, 0.2, 0.18, [x, y + h + 0.48, z], { mat: 'gold', seg: 12 });
  b.lamp([x, y + h + 0.2, z], 0xfff0d8, 1.6, 9, 0.5);
}

function mossCap(b: WorldBuilder, x: number, z: number, y: number, r: number, rng: Rng): void {
  bottleCap(b, new Frame(0, 0, 0), x, y, z, r, rng.pick([0xc9a24a, 0xe8e2d4, 0x6f8fa8]), { collide: true });
  b.cyl(r * 0.95, r * 0.95, 0.12, [x, y + r * 0.42, z], { mat: 'moss', color: 0xffffff, seg: 24 });
  for (let k = 0; k < 5; k++) {
    const a = rng.range(0, Math.PI * 2), rr = rng.range(0, r * 0.7);
    const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
    if (rng.chance(0.5)) {
      // a tiny tree: toothpick trunk + moss crown
      b.cyl(0.05, 0.06, 1.4, [px, y + r * 0.42 + 0.7, pz], { mat: 'wood', color: 0xa07a4a, seg: 6 });
      b.sphere(rng.range(0.4, 0.65), [px, y + r * 0.42 + 1.55, pz], { mat: 'moss', color: 0xffffff, seg: 10 });
    } else b.sphere(0.13, [px, y + r * 0.42 + 0.15, pz], { mat: 'pearl', color: rng.pick([0xffd1dc, 0xfff3c4, 0xd8f0ff]), seg: 8 });
  }
}

export function buildHeights(b: WorldBuilder, wd: WorldData, rng0: Rng): void {
  b.chunk = 'heights';
  const rng = rng0.fork('heights');
  const Y = HEIGHTS_Y;
  const F = new Frame(0, Y, 0);

  // polished tile islands over the glass shelf
  for (let x = -21; x < -1.5; x += 1.5)
    for (let z = -8; z < 12; z += 1.5) {
      const onPath = (z > 1 && z < 7.5) || (z > 8.8 && z < 12) || (x > -13 && x < -8.5);
      if (!onPath) continue;
      b.box(1.44, 0.06, 1.44, [x + 0.75, Y + 0.03, z + 0.75], { mat: 'plasticGloss', color: (Math.floor(x / 1.5) + Math.floor(z / 1.5)) % 2 ? 0xf3efe6 : 0xe2dccd, noBake: false });
    }
  // bounds
  b.col.add({ x: -22.6, z: 0, w: 1.4, d: 30, minY: Y, maxY: HEIGHTS_CEIL, tag: 'bound' });
  b.col.add({ x: -0.6, z: 0, w: 1.2, d: 30, minY: Y, maxY: HEIGHTS_CEIL, tag: 'bound' });
  for (let z = -13; z < 12; z += 1.2) b.sphere(0.8, [-0.8, Y + 0.7, z], { mat: 'moss', color: 0xffffff, scale: [0.8, 1, 1], seg: 10 });
  b.col.add({ x: -11, z: CABINET.shelfFrontZ - 0.2, w: 22, d: 0.3, minY: Y, maxY: Y + 3, tag: 'edge', noCamera: true });
  railing(b, [-21.5, Y, CABINET.shelfFrontZ - 0.3], [-1.5, Y, CABINET.shelfFrontZ - 0.3], rng, 'chain');

  // translucent townhouses (mint-box towers on lipstick columns)
  for (let i = 0; i < 4; i++) {
    const x = -20 + i * 2.6;
    const h = rng.range(6, 9);
    for (const sx of [-0.9, 0.9]) b.cyl(0.25, 0.25, 1.6, [x + sx, Y + 0.8, -9.5], { mat: 'plasticGloss', color: rng.pick([0xb0303a, 0xd4a017, 0x7a2f3b]), seg: 12 });
    b.box(2.3, h, 3.2, [x, Y + 1.6 + h / 2, -11], { mat: 'plasticClear', color: rng.pick([0xe9f4f2, 0xf4e9f2, 0xf2f2e6]) });
    // lit rooms seen through the translucent mint-box walls: floors, warm windows, a silhouette or two
    const floors = Math.floor(h / 2.2);
    for (let k = 0; k < floors; k++) {
      const fy = Y + 1.6 + k * 2.2;
      b.box(2.1, 0.1, 3.0, [x, fy + 0.05, -11], { mat: 'gold' });
      b.box(1.8, 1.4, 0.05, [x, fy + 1.0, -9.62], { mat: 'glowSoft', color: rng.pick([0xc89a62, 0xd8a868, 0xb88a5a]), noBake: true });
      b.box(1.8, 1.6, 2.6, [x, fy + 0.9, -11.2], { mat: 'velvet', color: rng.pick([0x7a1f3d, 0x2f4f6f, 0x3d6b48]) });
      b.lamp([x, fy + 1.4, -10], 0xffe2b8, 0.8, 5, 0.6);
    }
    b.box(2.4, 0.15, 3.3, [x, Y + 1.6 + h + 0.07, -11], { mat: 'gold' });
  }
  b.col.add({ x: -15.6, z: -11, w: 11, d: 3.6, minY: Y, maxY: HEIGHTS_CEIL, tag: 'houses' });

  // the Registry of the Shelf: a lacquered jewellery box with its lid propped open
  const rf = new Frame(-10, Y, -9.6);
  b.box(8, 4.2, 5.4, rf.p(0, 2.1, 0), { mat: 'plasticGloss', color: 0x283a4c, collide: true });
  b.box(8.1, 0.18, 5.5, rf.p(0, 4.25, 0), { mat: 'gold' });
  b.box(8, 0.5, 5.4, rf.p(0, 6.6, -3.3), { mat: 'plasticGloss', color: 0x283a4c, rot: rf.r(-1.2, 0, 0) });
  b.box(7.6, 0.06, 5.0, rf.p(0, 6.55, -3.0), { mat: 'velvet', color: 0x7a1f3d, rot: rf.r(-1.2, 0, 0) });
  // the clerk's counter set into the box front: velvet top, gold edge
  b.box(4.4, 1.2, 1.2, rf.p(0, 0.6, 3.3), { mat: 'plasticGloss', color: 0x1f2d3d, collide: true });
  b.box(4.5, 0.08, 1.3, rf.p(0, 1.24, 3.3), { mat: 'velvet', color: 0x7a1f3d });
  b.box(4.6, 0.05, 0.05, rf.p(0, 1.28, 3.95), { mat: 'gold' });
  signBoard(b, rf, 'registry', 0, 3.3, 2.75, 4.2, [0, 0, 0], 'brass');
  // a stack of ledgers and a pearl inkwell
  for (let k = 0; k < 3; k++) b.box(0.8, 0.12, 0.6, rf.p(-1.4, 1.34 + k * 0.13, 3.2), { mat: 'painted', color: [0x7a2f3b, 0x2f4f6f, 0x3d6b48][k], rot: rf.r(0, k * 0.1, 0) });
  b.sphere(0.2, rf.p(1.4, 1.45, 3.2), { mat: 'pearl', color: 0xf6efe6 });
  wd.hot('office', 'office', rf.p(0, 0, 4.6), 2.4, {});

  // Glasshouse Reserve: preserved fruit under a glass dome
  const gf = new Frame(-3.6, Y, -8.0);
  b.cyl(1.9, 2.1, 0.5, gf.p(0, 0.25, 0), { mat: 'gold', seg: 32, collide: true });
  b.sphere(1.9, gf.p(0, 0.5, 0), { mat: 'plasticClear', color: 0xeef6f4, seg: 24, scale: [1, 1.2, 1] });
  for (let k = 0; k < 16; k++) b.sphere(rng.range(0.22, 0.4), gf.p(rng.range(-1.1, 1.1), 0.8 + rng.range(0, 1.2), rng.range(-1.1, 1.1)), { mat: 'candy', color: rng.pick([0xe84a5f, 0xffd166, 0x7bd389, 0xc77dff, 0xff8c42]), seg: 10 });
  b.colliderFor(3.8, 4.5, 3.8, gf.p(0, 2.2, 0), { collide: true });
  b.box(3.4, 1.1, 1.0, gf.p(0, 0.55, 2.8), { mat: 'plasticGloss', color: 0xf5efe6, collide: true });
  signBoard(b, gf, 'reserve', 0, 4.9, -0.6, 3.2, [0, 0, 0], 'brass');
  wd.hot('vendor-marrow', 'vendor', gf.p(0, 0, 4.0), 2.0, { vendor: 'marrow' });

  // the Reservoir: a clean, full water basin (what the Depths' petition is about)
  const wx = -16.4, wz = -2.4;
  b.cyl(2.6, 2.7, 1.2, [wx, Y + 0.6, wz], { mat: 'plasticGloss', color: 0xdfe9ef, seg: 40, collide: true });
  b.cyl(2.45, 2.45, 0.05, [wx, Y + 1.15, wz], { mat: 'water', seg: 40 });
  b.cyl(0.18, 0.18, 2.2, [wx, Y + 2.2, wz], { mat: 'gold', seg: 10 });
  b.sphere(0.35, [wx, Y + 3.3, wz], { mat: 'pearl', color: 0xd8f0ff });
  wd.drips.push(new THREE.Vector3(wx + 0.3, Y + 3.1, wz));
  wd.drips.push(new THREE.Vector3(wx - 0.3, Y + 3.1, wz));

  // gardens
  const caps: [number, number, number][] = [
    [-12.5, 4.2, 1.6],
    [-6.2, 4.6, 1.3],
    [-3.2, 1.8, 1.0],
    [-13.6, 8.8, 1.1],
    [-5.0, 10.4, 1.2],
  ];
  for (const [x, z, r] of caps) mossCap(b, x, z, Y, r, rng);
  // promenade benches + telescope (a pen cap on a tripod)
  for (const x of [-17, -10]) {
    b.box(2.4, 0.18, 0.7, [x, Y + 0.7, 10.6], { mat: 'plasticGloss', color: 0xf5efe6 });
    for (const sx of [-1, 1]) b.cyl(0.08, 0.08, 0.7, [x + sx, Y + 0.35, 10.6], { mat: 'gold', seg: 6 });
    b.colliderFor(2.4, 0.8, 0.7, [x, Y + 0.4, 10.6], { collide: true });
  }
  const tf = new Frame(-6.6, Y, 11.4);
  for (const a of [0, 2.1, 4.2]) b.rod(tf.p(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5), tf.p(0, 1.6, 0), 0.04, { mat: 'gold' });
  b.cyl(0.18, 0.24, 1.5, tf.p(0, 1.8, 0.3), { mat: 'plasticGloss', color: 0x1b2a3a, rot: tf.r(1.1, 0, 0), seg: 14 });
  signBoard(b, F, 'heights', -15.2, 3.2, 7.8, 3.2, [0, 0.3, 0], 'brass');
  toothpick(b, F, -16.6, 7.5, 0, 2.6);
  toothpick(b, F, -13.8, 8.2, 0, 2.6);

  // inner gate where the lift arrives (gold chain posts) and a guard post
  railing(b, [-21.8, Y, 6.0], [-16.4, Y, 6.0], rng, 'chain');
  railing(b, [-14.2, Y, 6.0], [-13.0, Y, 6.0], rng, 'chain');

  // bright, soft lighting: bead lamps + a warm LED strip under the shelf above
  for (const [x, z] of [
    [-20, 8],
    [-13, 0],
    [-8, 7.6],
    [-2.6, 4],
    [-19, -5],
    [-7, -3],
    [-2.4, 10.6],
  ] as [number, number][])
    beadLamp(b, x, z, Y);
  b.box(21, 0.08, 0.3, [-11, HEIGHTS_CEIL - 0.05, 9], { mat: 'glowSoft', color: 0xffe9c8 });
  for (const x of [-19, -13, -7, -2]) b.lamp([x, HEIGHTS_CEIL - 1, 9], 0xfff1dc, 2.4, 22, 0.7);
  hangingLamp(b, [-10, HEIGHTS_CEIL, -3.4], 12.6, 0xfff4e4, 'cap', 2.4, 12);

  // registry
  wd.hot('lift-heights-top', 'lift', [-18, Y, 4.2], 1.6, { lift: 'heights', level: 1 });
  wd.districtSpawn.set('heights', { pos: new THREE.Vector3(-18, Y, 5.0), yaw: 0 });
  const N = (id: string, p: [number, number, number], tags: string[] = []) => wd.node(id, [p[0], p[1] + Y, p[2]], 'heights', tags);
  N('h.A0', [-18, 0, 5.0], ['arrival']);
  N('h.AG', [-15.3, 0, 4.8], ['gate']);
  N('h.A1', [-15.3, 0, 7.2], ['gate']);
  N('h.P0', [-10.6, 0, 6.6], ['plaza']);
  N('h.P1', [-9.4, 0, 2.2], ['plaza', 'talk']);
  N('h.P2', [-4.6, 0, 6.8], ['plaza']);
  N('h.R0', [-10, 0, -4.2], ['registryFront']);
  N('h.R1', [-12.9, 0, -6.0], ['clerk']);
  N('h.M0', [-3.6, 0, -4.2], ['reserveFront']);
  N('h.M1', [-5.9, 0, -5.0], ['marrow']);
  N('h.W0', [-16.4, 0, 1.2], ['reservoir']);
  N('h.F0', [-18, 0, 10.4], ['promenade', 'sit']);
  N('h.F1', [-10.6, 0, 9.8], ['promenade', 'sit']);
  N('h.F2', [-6.0, 0, 10.2], ['promenade', 'view']);
  N('h.F3', [-2.4, 0, 9.0], ['promenade']);
  N('h.LIFT', [-18, 0, 2.0], ['liftCar']);
  wd.link('h.LIFT', 'h.A0', 'h.AG', 'h.A1', 'h.P0', 'h.P1', 'h.R0', 'h.R1');
  wd.link('h.P1', 'h.M0', 'h.M1');
  wd.link('h.P0', 'h.P2', 'h.F3', 'h.F2', 'h.F1', 'h.F0', 'h.A1');
  wd.link('h.P1', 'h.W0');
  wd.link('h.F1', 'h.P0');
  wd.link('h.P2', 'h.M0');
}
