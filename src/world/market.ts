// THREADMARKET — tier 1, centre bay. Compact but dense: stall street, boardwalk + bridge, the Commons.
import * as THREE from 'three';
import { Rng } from '../core/rng';
import { WorldBuilder } from './builder';
import { Frame } from './frame';
import { WorldData } from './worldData';
import { PAL, awning, bottleCap, bridge, crate, fairyLights, hangingLamp, litter, paperSheet, railing, signBoard, spool, stairs, tape, toothpick, threadWrap, button, strawPipe } from './props';
import { apartmentStack, buildLift, scrapHeap, stall } from './structures';
import { TIER_Y, CABINET } from '../config';

export const MARKET_Y = TIER_Y[1];
export const MARKET_CEIL = TIER_Y[2] - 1.3;
export const WALK_Y = MARKET_Y + 4.5;

export function buildMarket(b: WorldBuilder, wd: WorldData, rng0: Rng): void {
  b.chunk = 'market';
  const rng = rng0.fork('market');
  const Y = MARKET_Y;
  const F = new Frame(0, Y, 0);

  // ground: a patchwork of fabric rugs and paper over the shelf
  paperSheet(b, F, -4, -3, 0.01, 34, 6, rng, 0xc9b79a);
  b.box(16, 0.05, 11, [2, Y + 0.025, 5.5], { mat: 'fabric', color: 0x8a4b3a });
  b.box(14.4, 0.06, 9.4, [2, Y + 0.03, 5.5], { mat: 'fabric', color: 0xc79a4a });
  for (let k = 0; k < 8; k++) b.box(1.8, 0.065, 0.4, [-5 + k * 2, Y + 0.035, 1.2], { mat: 'fabric', color: rng.pick(PAL.thread) });
  litter(b, F, -21, -5, 21, 12, 120, rng);

  // bounds: left/right junk walls dressed with cloth banners and stacked goods, invisible rail at the shelf front
  for (const s of [-1, 1]) {
    for (let z = -13; z < 12; z += 2.8) {
      const h = rng.range(2.5, 5);
      crate(b, F, s * 22.4, z, 0, 1.6, h, 2.4, rng, { open: rng.chance(0.4) });
      if (rng.chance(0.5)) crate(b, F, s * 22.2, z + 0.3, h, 1.2, rng.range(0.8, 1.6), 1.6, rng, { open: false });
      // hanging cloth banners and drying fabric on the inner face
      if (rng.chance(0.7)) {
        const bz = z + rng.range(-0.6, 0.6);
        b.box(0.03, rng.range(2.2, 4.5), rng.range(1.0, 1.8), [s * 21.55, Y + 6.5 + rng.range(-0.5, 1.5), bz], { mat: 'fabric', color: rng.pick(PAL.thread), rot: [0, 0, s * 0.02] });
        b.rod([s * 21.5, Y + 9.2, bz - 1], [s * 21.5, Y + 9.2, bz + 1], 0.04, { mat: 'wood', color: 0xe6cfa3 });
      }
    }
    b.col.add({ x: s * 22.6, z: 0, w: 1.4, d: 30, minY: Y, maxY: MARKET_CEIL, tag: 'bound' });
  }
  b.col.add({ x: 0, z: CABINET.shelfFrontZ - 0.15, w: 46, d: 0.3, minY: Y, maxY: Y + 3, tag: 'edge', noCamera: true });
  railing(b, [-21.5, Y, CABINET.shelfFrontZ - 0.25], [21.5, Y, CABINET.shelfFrontZ - 0.25], rng);

  // ---------- back cliff + boardwalk ----------
  // ground-floor boxes the boardwalk sits on
  for (let x = -21; x < 13; x += 3.4) {
    const col = rng.pick(PAL.card);
    b.box(3.3, 4.5, 4.4, [x + 1.7, Y + 2.25, -11.8], { mat: rng.chance(0.5) ? 'cardboard' : 'painted', color: rng.chance(0.5) ? col : rng.pick(PAL.paint) });
    b.quad(1.0, 1.9, [x + 1.2, Y + 0.95, -9.58], { mat: 'cardboard', color: 0x3a2a1e });
    b.quad(0.9, 0.7, [x + 2.6, Y + 2.9, -9.58], { mat: 'glowSoft', color: rng.pick([0xffc47a, 0xffd59a, 0xffb36b]), noBake: true });
  }
  b.col.add({ x: -4, z: -11.8, w: 34, d: 4.4, minY: Y, maxY: WALK_Y - 0.15, tag: 'stack' });
  // boardwalk deck of popsicle sticks
  for (let x = -21; x < 13; x += 0.62) b.box(0.56, 0.1, 2.0, [x + 0.3, WALK_Y - 0.05, -8.6], { mat: 'wood', color: rng.pick([0xe5c995, 0xdcbd85, 0xe9d2a3]), rot: [0, rng.range(-0.03, 0.03), 0] });
  b.col.add({ x: -4, z: -8.6, w: 34, d: 2.0, minY: WALK_Y - 0.3, maxY: WALK_Y, tag: 'walk' });
  b.col.add({ x: -4, z: -10.8, w: 34, d: 2.4, minY: WALK_Y - 0.3, maxY: WALK_Y, tag: 'walk' });
  for (let x = -20.5; x < 13; x += 2.6) toothpick(b, F, x, -7.7, 0, 4.4, { wrapColor: rng.pick(PAL.thread) });
  railing(b, [-21, WALK_Y, -7.6], [-7.2, WALK_Y, -7.6], rng);
  railing(b, [-3.4, WALK_Y, -7.6], [7.6, WALK_Y, -7.6], rng);
  railing(b, [12.2, WALK_Y, -7.6], [13, WALK_Y, -7.6], rng);
  railing(b, [13, WALK_Y, -7.6], [13, WALK_Y, -12], rng);
  apartmentStack(b, new Frame(-4, WALK_Y, -12), rng.fork('mstack'), 34, 4, 5, { wealth: 0.25, lit: 0.7, floorH: 3.1 });
  // the pods are up to 4 deep (z -14..-10): block all of it so nobody walks into a façade
  b.col.add({ x: -4, z: -12.0, w: 34, d: 4.0, minY: WALK_Y, maxY: MARKET_CEIL, tag: 'stack' });
  // stairs from the street up to the boardwalk (rising toward the back)
  stairs(b, new Frame(-5.3, Y, -0.8, Math.PI), 0, 0, 0, 1.8, 6.8, 4.5, 'wood', true);

  // ---------- Spool Street stalls ----------
  const stalls: { x: number; goods: 'crumbs' | 'water' | 'fabric' | 'salvage'; sign: string; vendor: string; awn: number }[] = [
    { x: -15.6, goods: 'crumbs', sign: 'crumbs', vendor: 'odo', awn: 0 },
    { x: -10.4, goods: 'water', sign: 'wells', vendor: 'wren', awn: 1 },
    { x: 1.4, goods: 'fabric', sign: 'threads', vendor: 'sela', awn: 2 },
    { x: 7.0, goods: 'salvage', sign: 'scrapyard', vendor: 'tobb', awn: 3 },
  ];
  for (const s of stalls) {
    const p = stall(b, new Frame(s.x, Y, -5.4), rng.fork(s.vendor), s.goods, s.sign, 3.8, 2.4, s.awn);
    wd.hot(`vendor-${s.vendor}`, 'vendor', p, 2.0, { vendor: s.vendor });
  }
  // food storage behind Odo's: crates of crumbs, sacks
  crate(b, F, -19.5, -7.2, 0, 1.6, 1.4, 1.4, rng, { contents: 0xd9a35c, collide: true });
  crate(b, F, -19.4, -5.2, 0, 1.4, 1.1, 1.3, rng, { contents: 0xc98b46, collide: true });
  crate(b, F, -19.6, -5.4, 1.1, 1.2, 0.9, 1.1, rng, { open: false });

  // ---------- the Commons plaza ----------
  wd.candyLanding.set(2, Y, 5.6);
  signBoard(b, F, 'commons', -3.6, 3.4, 10.6, 2.6, [0, 0.35, 0], 'plank');
  toothpick(b, F, -4.6, 10.3, 0, 3.0, { wrapColor: 0xc0392b });
  toothpick(b, F, -2.6, 10.9, 0, 3.0, { wrapColor: 0xc0392b });
  // benches made of matchboxes and a bottle-cap table
  for (const [x, z, r] of [
    [-5.5, 3.6, 0.3],
    [9.2, 2.8, -0.4],
    [-5.0, 8.4, -0.2],
  ] as [number, number, number][]) {
    b.box(2.6, 0.55, 0.9, [x, Y + 0.275, z], { mat: 'painted', color: rng.pick(PAL.paint), rot: [0, r, 0], collide: true });
    b.quad(1.8, 0.55, [x, Y + 0.56, z], { mat: 'label', uvRect: [0, 0.5, 0.5, 1], rot: [-Math.PI / 2, r, 0] });
  }
  // Common Table distribution trestle
  b.box(3.6, 0.12, 1.2, [-8.2, Y + 1.1, 6.2], { mat: 'wood', color: 0xe3c58f, collide: false });
  for (const sx of [-1.5, 1.5]) for (const sz of [-0.45, 0.45]) toothpick(b, F, -8.2 + sx, 6.2 + sz, 0, 1.05);
  b.colliderFor(3.6, 1.2, 1.2, [-8.2, Y + 0.6, 6.2], { collide: true });
  for (let k = 0; k < 3; k++) bottleCap(b, F, -9.3 + k * 1.1, 1.16, 6.2, 0.35, 0x2e6a8a, { flip: true });
  signBoard(b, F, 'commonTable', -8.2, 2.3, 5.5, 2.4, [0, 0, 0], 'card');
  // Threadrunners: a tall spool tower reached by a paper-clip bridge from the boardwalk
  const tx = 10.4, tz = 7.2;
  spool(b, F, tx, tz, 0, 2.3, 4.5, 0xe05a2b, true);
  b.cyl(2.35, 2.35, 0.12, [tx, WALK_Y + 0.06 - 0.12, tz], { mat: 'wood', color: 0xd8b98a, seg: 28 });
  b.col.add({ x: tx, z: tz, w: 4.4, d: 4.4, minY: WALK_Y - 0.3, maxY: WALK_Y, tag: 'tower' });
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + 0.6;
    if (Math.abs(Math.sin(a) + 1) < 0.25) continue; // gap toward the bridge
    toothpick(b, F, tx + Math.cos(a) * 2.1, tz + Math.sin(a) * 2.1, 4.5, 0.95, { wrapColor: 0xe05a2b });
  }
  for (const [x0, z0, x1, z1] of [
    [tx - 2.2, tz - 0.6, tx - 2.2, tz + 2.2],
    [tx + 2.2, tz - 0.6, tx + 2.2, tz + 2.2],
    [tx - 2.2, tz + 2.2, tx + 2.2, tz + 2.2],
  ])
    b.col.add({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: Math.max(0.3, Math.abs(x1 - x0)), d: Math.max(0.3, Math.abs(z1 - z0)), minY: WALK_Y, maxY: WALK_Y + 1.6, noCamera: true, tag: 'rail' });
  bridge(b, [tx, WALK_Y, -7.6], [tx, WALK_Y, tz - 2.3], 1.5, rng);
  signBoard(b, F, 'runners', tx, 6.2, tz + 0.2, 2.6, [0, 0, 0], 'card');
  // a parcel pile and a pennant on the tower
  crate(b, F, tx + 0.8, tz + 0.6, 4.5, 0.9, 0.7, 0.8, rng, { open: false });
  crate(b, F, tx - 0.6, tz + 1.0, 4.5, 0.8, 0.6, 0.7, rng, { open: false });
  b.cyl(0.06, 0.06, 3.0, [tx - 1.2, WALK_Y + 1.5, tz + 1.4], { mat: 'wood', color: 0xe6cfa3, seg: 6 });
  b.box(1.4, 0.8, 0.02, [tx - 0.5, WALK_Y + 2.6, tz + 1.4], { mat: 'fabric', color: 0xe05a2b });
  wd.hot('heap-tower', 'scavenge', [tx + 1.2, WALK_Y, tz + 0.2], 1.6, { loot: ['electronics', 'metal'] });
  scrapHeap(b, F, tx + 1.3, tz - 0.4 + 0.2, 0.6, rng);

  // ---------- repair workshop (Salvage Union) ----------
  const rf = new Frame(17.6, Y, 5.6);
  b.box(0.15, 5, 8, rf.p(3.5, 2.5, 0), { mat: 'corrugated', color: 0xb48a5c, collide: true });
  b.box(7, 5, 0.15, rf.p(0, 2.5, 4), { mat: 'corrugated', color: 0xb48a5c, collide: true });
  b.box(7.4, 0.12, 8.4, rf.p(0, 5.2, 0), { mat: 'cardboard', color: 0xa8845a, rot: rf.r(0, 0, 0.08) });
  for (const z of [-3.8, 3.8]) toothpick(b, rf, -3.4, z, 0, 5, { wrapColor: 0xe1b12c, collide: true });
  b.box(1.4, 1.2, 6, rf.p(2.6, 0.6, 0), { mat: 'rubber', color: 0xe08f8f, collide: true });
  b.cyl(0.5, 0.5, 1.2, rf.p(2.6, 1.6, -1.4), { mat: 'metal', color: 0x9aa0a6, rot: rf.r(0, 0, Math.PI / 2), seg: 16 });
  for (let k = 0; k < 4; k++) b.cyl(0.35, 0.35, 0.3, rf.p(2.6, 1.35, 1.0 + k * 0.5), { mat: 'metal', color: 0xc77b30, seg: 12 });
  button(b, rf, 2.6, 1.24, -0.2, 0.4, 0x2e6a8a);
  signBoard(b, rf, 'repairs', -0.4, 4.4, -3.9, 2.8, [0, Math.PI, 0], 'plank');
  hangingLamp(b, rf.p(0.6, 5.0, 0), 1.3, 0xeaf2ff, 'foil', 2.4, 10);
  wd.hot('npc-dov', 'npc', rf.p(1.2, 0, 0.4), 2.0, { npc: 'dov' });

  // ---------- the Granary: a big jar of crumbs, guarded ----------
  const gx = -12.6, gz = 9.2;
  b.cyl(2.2, 2.2, 5.0, [gx, Y + 2.5, gz], { mat: 'plasticClear', color: 0xe6f2f0, seg: 32, collide: true });
  for (let k = 0; k < 60; k++) b.sphere(rng.range(0.25, 0.45), [gx + rng.range(-1.6, 1.6), Y + rng.range(0.3, 2.6), gz + rng.range(-1.6, 1.6)], { mat: 'crumb', color: rng.pick([0xd9a35c, 0xc98b46, 0xe8b86a]), seg: 7 });
  b.cyl(2.35, 2.35, 0.6, [gx, Y + 5.2, gz], { mat: 'metal', color: 0x2f4f6f, seg: 32 });
  signBoard(b, F, 'granary', gx, 1.4, gz - 2.3, 2.4, [0, Math.PI, 0], 'brass');
  wd.groups.set('granarySpot', new THREE.Object3D());
  wd.hot('npc-calloway', 'npc', [gx + 2.6, Y, gz - 2.4], 2.0, { npc: 'calloway' });

  // ---------- checkpoint + lift to the Heights ----------
  const hl = buildLift(b, wd, 'heights', -18, 2.0, Y, TIER_Y[2], rng, { luxury: true, working: true, permit: true, doorZ: 1 });
  void hl;
  // barrier: a ruler on a hinge, brass posts, a booth made from a tin
  const cy = 5.4;
  b.box(0.3, 1.6, 0.3, [-15.4, Y + 0.8, cy], { mat: 'brass', color: 0xffffff, collide: true });
  b.box(0.3, 1.6, 0.3, [-20.8, Y + 0.8, cy], { mat: 'brass', color: 0xffffff, collide: true });
  b.beginGroup('checkpointBar');
  b.box(5.2, 0.28, 0.12, [-18.1, Y + 1.25, cy], { mat: 'painted', color: 0xe8d27a });
  for (let k = 0; k < 10; k++) b.box(0.03, 0.12, 0.13, [-20.4 + k * 0.5, Y + 1.32, cy], { mat: 'matte', color: 0x222222 });
  const bar = b.endGroup([-15.6, Y + 1.25, cy]);
  wd.groups.set('checkpointBar', bar);
  const barSolid = b.col.add({ x: -18.1, z: cy, w: 5.0, d: 0.4, minY: Y, maxY: Y + 2.4, tag: 'checkpoint' });
  wd.barriers.set('checkpoint', [barSolid]);
  b.box(0.3, 3.0, 4.0, [-21.0, Y + 1.5, 3.4], { mat: 'cabinetWood', collide: true }); // side panel
  b.col.add({ x: -15.2, z: 2.6, w: 0.6, d: 5.6, minY: Y, maxY: Y + 3, tag: 'checkpointWall' });
  b.box(0.5, 2.8, 5.6, [-15.2, Y + 1.4, 2.6], { mat: 'painted', color: 0x1f2d3d });
  b.cyl(1.0, 1.0, 2.6, [-13.4, Y + 1.3, 2.6], { mat: 'metal', color: 0x2f4f6f, seg: 20, collide: true });
  b.quad(0.9, 0.6, [-13.4, Y + 1.9, 3.62], { mat: 'glowSoft', color: 0xfff0c8, noBake: true });
  signBoard(b, F, 'checkpoint', -18.1, 3.6, cy + 0.2, 3.4, [0, 0, 0], 'brass');
  hangingLamp(b, [-16, MARKET_CEIL, 6.6], 15.5, 0xfff4e0, 'cap', 2.4, 10, 'checkpoint');
  wd.hot('checkpoint', 'checkpoint', [-18.1, Y, cy + 1.4], 2.4, {});
  wd.hot('lift-heights-low', 'lift', [-18, Y, 4.2], 1.6, { lift: 'heights', level: 0 });

  // ---------- lift arrival from the Depths + machinery ----------
  wd.hot('lift-depths-top', 'lift', [18, Y, -3.9], 2.3, { lift: 'depths', level: 1 });
  signBoard(b, F, 'threadmarket', 15.2, 4.8, -3.6, 3.6, [0, -0.25, 0], 'plank');
  // a gear train of bottle caps driving a fan, visible machinery
  for (let k = 0; k < 3; k++) bottleCap(b, F, 20.6, 6 + k * 1.6, -11.4 + k * 0.6, 0.9 - k * 0.15, rng.pick([0xb03a2e, 0xd4a017, 0x2e6a8a]), {});
  strawPipe(b, [
    [21, MARKET_CEIL, -2],
    [21, Y + 8, -2],
    [14, Y + 8, -2],
    [14, Y + 6, -2],
  ], 0.22, 0x7fc7c0, 0xffffff);
  wd.drips.push(new THREE.Vector3(14, Y + 5.8, -2));

  // ---------- light canopy ----------
  const cols = [0xffc47a, 0xffb35c, 0xffd08a, 0xe86a5c, 0x7fc7c0, 0xc9a0dc, 0xffe08a];
  const anchors: [number, number][] = [
    [-20, -7],
    [-8, -7],
    [4, -7],
    [16, -7],
  ];
  for (const [ax, az] of anchors) {
    fairyLights(b, [ax, MARKET_CEIL - 1.2, az], [ax + 6, MARKET_CEIL - 2.4, 11.5], 2.2, 9, cols, rng, 0.35, 0.8);
    fairyLights(b, [ax + 6, MARKET_CEIL - 1.2, az], [ax, MARKET_CEIL - 2.4, 11.5], 2.6, 9, cols, rng, 0.35, 0.8);
  }
  fairyLights(b, [-21, MARKET_CEIL - 4, 11.5], [21, MARKET_CEIL - 4, 11.5], 2.0, 16, cols, rng, 0.35, 0.8);
  hangingLamp(b, [2, MARKET_CEIL, 5.6], 11.5, 0xffd9a0, 'foil', 3.0, 14, 'commons');
  hangingLamp(b, [-8.2, MARKET_CEIL, 6.2], 15.0, 0xffb860, 'cap', 1.8, 8);
  // street-level lamps on toothpick posts
  for (const x of [-12.9, -2.5, 4.3, 12]) {
    toothpick(b, F, x, -1.6, 0, 3.8, { wrapColor: rng.pick(PAL.thread) });
    hangingLamp(b, [x, Y + 3.8, -1.6], 0.3, 0xffc070, 'cap', 1.6, 8);
  }
  void tape;
  void threadWrap;
  void awning;

  // ---------- registry ----------
  wd.hot('npc-pip', 'npc', [tx - 0.6, WALK_Y, tz - 0.6], 1.8, { npc: 'pip' });
  wd.hot('npc-bel', 'npc', [-8.2, Y, 7.6], 2.0, { npc: 'bel' });
  wd.districtSpawn.set('market', { pos: new THREE.Vector3(18, Y, -2.6), yaw: 0 });

  const N = (id: string, p: [number, number, number], tags: string[] = []) => wd.node(id, [p[0], p[1] + Y, p[2]], 'market', tags);
  N('m.S0', [-17.5, 0, -1.6], ['street']);
  N('m.S1', [-13, 0, -1.4], ['street', 'shop']);
  N('m.S2', [-7.8, 0, -1.4], ['street', 'shop']);
  N('m.S3', [-2.5, 0, -0.6], ['street']);
  N('m.S23', [-5.3, 0, 0.7], ['street']);
  N('m.S4', [1.4, 0, -1.4], ['street', 'shop']);
  N('m.S5', [7.0, 0, -1.4], ['street', 'shop']);
  N('m.S6', [12.5, 0, -1.4], ['street']);
  N('m.S7', [17.0, 0, -2.6], ['street', 'liftFront']);
  N('m.V0', [-15.6, 0, -3.3], ['vendor:odo']);
  N('m.V1', [-10.4, 0, -3.3], ['vendor:wren']);
  N('m.V2', [1.4, 0, -3.3], ['vendor:sela']);
  N('m.V3', [7.0, 0, -3.3], ['vendor:tobb']);
  N('m.B0', [-15.6, 0, -5.45], ['behind:odo']);
  N('m.B1', [-10.4, 0, -5.45], ['behind:wren']);
  N('m.B2', [1.4, 0, -5.45], ['behind:sela']);
  N('m.B3', [7.0, 0, -5.45], ['behind:tobb']);
  N('m.GA', [-13.0, 0, -5.45], []);
  N('m.GB', [4.2, 0, -5.45], []);
  N('m.S45', [4.2, 0, -1.4], ['street']);
  N('m.P0', [-2.0, 0, 3.0], ['plaza']);
  N('m.P1', [2.0, 0, 2.6], ['plaza', 'talk']);
  N('m.P2', [5.6, 0, 4.2], ['plaza']);
  N('m.P3', [5.0, 0, 9.4], ['plaza', 'talk']);
  N('m.P4', [-1.0, 0, 9.0], ['plaza']);
  N('m.P5', [-5.5, 0, 4.6], ['plaza', 'sit']);
  N('m.CT', [-8.2, 0, 7.6], ['commonTable']);
  N('m.G0', [-10.0, 0, 6.6], ['granary']);
  N('m.CP0', [-17.4, 0, 7.0], ['checkpointFront']);
  N('m.CPa', [-12.6, 0, 5.6], []);
  N('m.CP1', [-18.0, 0, 4.0], ['checkpointInside']);
  N('m.R0', [14.8, 0, 3.8], ['repairFront']);
  N('m.R1', [18.4, 0, 5.4], ['repair']);
  N('m.ST0', [-5.3, 0, -0.4], ['stairs']);
  N('m.ST1', [-5.3, 4.5, -7.9], ['stairs']);
  N('m.W0', [-14, 4.5, -8.7], ['walk']);
  N('m.W1', [-5.3, 4.5, -8.7], ['walk']);
  N('m.W2', [4.0, 4.5, -8.7], ['walk', 'talk']);
  N('m.W3', [10.4, 4.5, -8.7], ['walk']);
  N('m.BR', [10.4, 4.5, 4.9], ['bridgeEnd']);
  N('m.T0', [9.6, 4.5, 6.6], ['tower']);
  N('m.LIFT', [18, 0, -6.5], ['liftCar']);
  N('m.HLIFT', [-18, 0, 2.0], ['liftCar']);
  wd.link('m.S0', 'm.S1', 'm.S2', 'm.S23', 'm.S3', 'm.S4', 'm.S45', 'm.S5', 'm.S6', 'm.S7');
  wd.link('m.S1', 'm.V0');
  wd.link('m.S2', 'm.V1');
  wd.link('m.S4', 'm.V2');
  wd.link('m.S5', 'm.V3');
  wd.link('m.S3', 'm.P0', 'm.P1', 'm.P2', 'm.P3', 'm.P4', 'm.P0');
  wd.link('m.P0', 'm.P5', 'm.CT', 'm.G0', 'm.CPa', 'm.CP0');
  wd.link('m.P2', 'm.R0', 'm.R1');
  wd.link('m.S6', 'm.R0');
  wd.link('m.S23', 'm.ST0', 'm.ST1', 'm.W1', 'm.W0');
  wd.link('m.W1', 'm.W2', 'm.W3', 'm.BR', 'm.T0');
  wd.link('m.S7', 'm.LIFT');
  wd.link('m.CP0', 'm.CP1', 'm.HLIFT');
  // vendors stand behind their counters, reached through the gaps between stalls
  wd.link('m.S1', 'm.GA', 'm.B0');
  wd.link('m.GA', 'm.B1');
  wd.link('m.S45', 'm.GB', 'm.B2');
  wd.link('m.GB', 'm.B3');
}
