// Outside the cabinet: the crack in the back panel opens onto a stack of books, a metre rule leans down to the
// carpet, and the strip of room floor runs under and behind the cabinet to a biscuit tin with a web behind it.
import * as THREE from 'three';
import { Rng } from '../core/rng';
import { V3, WorldBuilder } from './builder';
import { WorldData } from './worldData';
import { CABINET as C, TIER_Y } from '../config';
import { buildLift } from './structures';

export const FLOOR_Y = -20;
export const BACK_Z = -40; // the room's back wall
export const TIN = { x: 34, z: -29, r: 8.75, h: 6.3 };
/** an orb web strung between the tin and the skirting, in the plane x = WEB.x */
export const WEB = { x: 47, z0: -39.4, z1: -22.5, y0: FLOOR_Y, y1: -9, hub: new THREE.Vector3(47, -14.5, -31) };
/** the cargo line hangs off the back of the cabinet from the Lacquer ledge down to the book ledge */
export const CARGO = { x: -29, z: -19.5 };
/** gaps in the back panel (sorted by x): the Backs crack at floor level, the Lacquer crack at tier 2 */
export const BACK_CRACKS = [
  { x0: -29.8, x1: -28.2, y: TIER_Y[2] },
  { x0: -16.9, x1: -15.3, y: 0 },
];
/** the skirting mouse: its hole in the skirting and the crumb pile its run goes to */
export const MOUSE = { hole: new THREE.Vector3(18, FLOOR_Y, -37.6), crumbs: new THREE.Vector3(21, FLOOR_Y, -26) };
/** the climbing line hangs off the south edge of the book ledge */
export const CLIMB = { x: -24, top: new THREE.Vector3(-24, 0, -29.6), foot: new THREE.Vector3(-24, FLOOR_Y, -34.2) };

/** is p out of the cabinet (behind the back panel or on the room floor)? */
export function outside(p: THREE.Vector3): boolean {
  return p.z < C.minZ - 1.2 || p.y < -1;
}

/** Lacquer Court: the west end of tier 2, reached only by the cargo line */
export function inLacquer(p: THREE.Vector3): boolean {
  return !outside(p) && p.x < -22.6 && p.y > TIER_Y[2] - 1.5 && p.y < TIER_Y[3] - 1.5;
}

export function buildOutside(b: WorldBuilder, wd: WorldData, rng: Rng): void {
  b.chunk = 'outside';
  const F = FLOOR_Y;
  // ---------- colliders for the room strip ----------
  b.col.add({ x: 0, z: (BACK_Z + 14) / 2, w: 190, d: 14 - BACK_Z, minY: F - 1, maxY: F, tag: 'floor' });
  b.col.add({ x: 0, z: BACK_Z + 0.5, w: 190, d: 1, minY: F, maxY: F + 60, tag: 'wall' });
  for (const s of [-1, 1]) b.col.add({ x: s * 95, z: (BACK_Z + 14) / 2, w: 1, d: 14 - BACK_Z, minY: F, maxY: F + 60, tag: 'bound', noCamera: true });
  // under the cabinet you can look out at the room but not walk off into it
  b.col.add({ x: 0, z: 14, w: 190, d: 1, minY: F, maxY: -2.5, tag: 'bound', noCamera: true });
  // skirting board
  b.box(190, 4, 1, [0, F + 2, BACK_Z + 1], { mat: 'painted', color: 0xd8d2c4 });

  // ---------- the crack: splinters on both faces ----------
  const wood = { mat: 'cabinetWood' as const, color: 0xe2c79c, noBake: true };
  for (const z of [C.minZ + 0.02, C.minZ - 1.22])
    for (let i = 0; i < 7; i++) {
      const y = 0.2 + i * 0.45;
      b.box(0.55 + rng.range(0, 0.5), 0.12, 0.08, [-16.9 + (i % 2 ? 0.1 : -0.1), y, z], { ...wood, rot: [0, 0, rng.range(-0.6, 0.6)] });
      b.box(0.5 + rng.range(0, 0.5), 0.12, 0.08, [-15.3 + (i % 2 ? -0.1 : 0.1), y + 0.2, z], { ...wood, rot: [0, 0, rng.range(-0.6, 0.6)] });
    }
  b.box(1.9, 0.5, 0.1, [-16.1, 2.95, C.minZ - 1.22], { ...wood, rot: [0, 0, 0.12] });
  b.lamp([-16.1, 1.6, -16.5], 0xffd8a8, 0.9, 8, 0.6);

  // ---------- the book ledge: a stack of old hardbacks against the back panel, top flush with the Depths floor ----------
  const books: [number, number, number, number][] = [
    // [height, length(x), depth(z), colour]
    [3.4, 24, 17, 0x5a2e2a],
    [2.6, 23, 16, 0x2f4a5a],
    [3.0, 25, 17.5, 0x6a5a2a],
    [2.2, 22.5, 15.5, 0x3a3a4a],
    [3.2, 24, 16.5, 0x4a2a3a],
    [2.8, 23, 16, 0x2a4a3a],
    [2.8, 22, 15.4, 0x7a3a22],
  ];
  let y = F;
  for (const [h, w, d, col] of books) {
    const cx = -22.5 + rng.range(-0.8, 0.8), cz = C.minZ - 1.2 - d / 2 - rng.range(0, 0.4);
    b.box(w, h, d, [cx, y + h / 2, cz], { mat: 'painted', color: col, rot: [0, rng.range(-0.03, 0.03), 0] });
    // page block on the open side
    b.box(w - 1, h - 0.6, 0.3, [cx, y + h / 2, cz - d / 2 - 0.05], { mat: 'matte', color: 0xe8dfc8 });
    y += h;
  }
  // the top book sits flush with the crack floor
  b.col.add({ x: -22.5, z: C.minZ - 1.2 - 7.7, w: 22, d: 15.4, minY: F, maxY: 0, tag: 'books' });

  // ---------- a wooden metre rule leaning from the books to the carpet ----------
  const a = new THREE.Vector3(-12, 0, -21), c = new THREE.Vector3(28, F, -21);
  const run = c.x - a.x, drop = a.y - c.y;
  const len = Math.hypot(run, drop), ang = Math.atan2(drop, run), th = 0.35;
  const mid: V3 = [(a.x + c.x) / 2 + Math.sin(ang) * th * 0.5, (a.y + c.y) / 2 - Math.cos(ang) * th * 0.5, a.z];
  b.box(len + 2, th, 3, mid, { mat: 'wood', color: 0xd8b070, rot: [0, 0, -ang] });
  for (let k = 0; k <= 40; k++) {
    const t = k / 40, px = a.x + run * t - 1 * Math.cos(ang), py = a.y - drop * t + 0.02;
    b.box(0.05, 0.01, k % 5 === 0 ? 1.2 : 0.6, [px, py, a.z - 1.5 + (k % 5 === 0 ? 0.6 : 0.3)], { mat: 'matte', color: 0x2a2418, noBake: true, rot: [0, 0, -ang] });
  }
  const n = 8;
  for (let i = 0; i < n; i++) {
    const y0 = a.y - (drop * i) / n, y1 = a.y - (drop * (i + 1)) / n;
    b.col.add({ x: a.x + (run * (i + 0.5)) / n, z: a.z, w: run / n + 0.02, d: 3, minY: Math.min(y0, y1) - 1.2, maxY: Math.max(y0, y1), ramp: { axis: 0, y0, y1 }, tag: 'ruler' });
  }

  // ---------- under the cabinet: dust, a lost pen, a dead bulb's glow ----------
  for (let i = 0; i < 14; i++) b.sphere(rng.range(0.6, 1.6), [rng.range(-60, 60), F + 0.2, rng.range(-12, 12)], { mat: 'fabric', color: 0x8a8478, scale: [1.6, 0.35, 1.2], noBake: true });
  b.cyl(0.7, 0.7, 26, [-30, F + 0.7, 4], { mat: 'plasticGloss', color: 0x2a5fb0, rot: [0, 0.3, Math.PI / 2], collide: true });
  b.lamp([0, -4, 0], 0x9fb4d8, 0.8, 34, 0.5);

  // ---------- the biscuit tin ----------
  const T = TIN;
  b.cyl(T.r, T.r, T.h, [T.x, F + T.h / 2, T.z], { mat: 'metal', color: 0x2e5a8a, seg: 40, collide: true });
  b.cyl(T.r + 0.25, T.r + 0.25, 0.6, [T.x, F + T.h + 0.1, T.z], { mat: 'metal', color: 0xc9a24a, seg: 40 });
  for (let i = 0; i < 6; i++) {
    const ang2 = (i / 6) * Math.PI * 2;
    b.box(0.1, 2.4, 3.2, [T.x + Math.cos(ang2) * (T.r + 0.02), F + 3, T.z + Math.sin(ang2) * (T.r + 0.02)], { mat: 'painted', color: 0xe8d8b0, rot: [0, -ang2, 0], noBake: true });
  }
  // crumbs that fell out last time it was opened
  for (let i = 0; i < 8; i++) b.sphere(rng.range(0.3, 0.7), [T.x + rng.range(-12, 12), F + 0.2, T.z + T.r + rng.range(0.5, 5)], { mat: 'crumb', color: 0xc9944a, scale: [1.2, 0.6, 1], noBake: true });
  // the mouse hole: a dark arch gnawed through the skirting, a worn smudge in front, and the crumb pile its run goes to
  b.box(4, 2.6, 0.4, [MOUSE.hole.x, F + 1.3, BACK_Z + 1.35], { mat: 'matte', color: 0x0b0806, noBake: true });
  b.cyl(2, 2, 0.4, [MOUSE.hole.x, F + 2.6, BACK_Z + 1.35], { mat: 'matte', color: 0x0b0806, seg: 16, rot: [Math.PI / 2, 0, 0], noBake: true });
  b.sphere(2.6, [MOUSE.hole.x + 1, F + 0.02, -35], { mat: 'fabric', color: 0x6a5e50, scale: [1.4, 0.02, 1.6], noBake: true });
  for (let i = 0; i < 10; i++) b.sphere(rng.range(0.25, 0.6), [MOUSE.crumbs.x + rng.range(-2, 2), F + 0.2, MOUSE.crumbs.z + rng.range(-2, 2)], { mat: 'crumb', color: 0xc9944a, scale: [1.2, 0.6, 1], noBake: true });
  // a phone charger plugged into the skirting: the only light back here
  b.box(3, 4, 2, [58, F + 6, BACK_Z + 2], { mat: 'plasticGloss', color: 0xeeeeee, collide: true });
  b.sphere(0.25, [58, F + 7, BACK_Z + 3.05], { mat: 'glow', color: 0x7aff9a, noBake: true });
  b.lamp([57, F + 6, BACK_Z + 6], 0x9affc0, 1.5, 30, 0.7);
  b.sag([58, F + 6, BACK_Z + 3], [70, F + 0.3, -10], 2, 0.4, { mat: 'plasticGloss', color: 0xe8e8e8 }, 14);
  b.lamp([20, F + 8, -26], 0xffc890, 1.1, 26, 0.6);

  // ---------- the web: an orb strung from the tin rim to the skirting, plus guy lines ----------
  const W = WEB, hub = W.hub;
  const silk = { mat: 'thread' as const, color: 0xeef0f4, noBake: true };
  const anchors: V3[] = [
    [W.x, W.y1, W.z0], [W.x, F + 0.1, W.z0 + 0.5], [W.x, F + 0.1, W.z1 - 1], [W.x - 4.5, F + T.h + 0.3, W.z1], [W.x, W.y1 + 2, W.z1 + 2],
    [W.x, -11, W.z0 + 0.2], [W.x, F + 3, W.z0 + 0.2], [W.x, F + 0.1, -31],
  ];
  const sp: THREE.Vector3[] = [];
  for (const an of anchors) {
    b.rod([hub.x, hub.y, hub.z], an, 0.03, silk);
    sp.push(new THREE.Vector3(...an));
  }
  // spiral
  const rings = 9;
  for (let r = 1; r <= rings; r++) {
    const f = r / (rings + 1);
    for (let i = 0; i < sp.length; i++) {
      const p0 = hub.clone().lerp(sp[i], f), p1 = hub.clone().lerp(sp[(i + 1) % sp.length], f);
      b.rod([p0.x, p0.y, p0.z], [p1.x, p1.y, p1.z], 0.02, silk);
    }
  }
  // the spider's last catch: a beetle wrapped tight near the bottom of the web
  b.sphere(0.9, [W.x, F + 3.2, -26.2], { mat: 'thread', color: 0xd8d4c8, scale: [1, 1.6, 1], noBake: true });
  b.sphere(0.5, [W.x + 0.3, F + 4.5, -26], { mat: 'matte', color: 0x2a1a10, noBake: true });
  // loose silk you can cut at the lower anchors
  for (const z of [W.z0 + 0.5, W.z1 - 1]) b.sphere(0.6, [W.x, F + 0.4, z], { mat: 'thread', color: 0xf4f4f6, scale: [1.4, 0.6, 1.4], noBake: true });
  b.lamp([W.x - 2, F + 4, -31], 0xcfe0ff, 0.6, 12, 0.3);

  wd.hot('silk-a', 'expedition', [W.x, F, W.z0 + 0.6], 2.2, { what: 'silk' });
  wd.hot('silk-b', 'expedition', [W.x, F, W.z1 - 1.2], 2.2, { what: 'silk' });
  wd.hot('beetle', 'expedition', [W.x - 0.6, F, -26.2], 1.8, { what: 'beetle' });

  // ---------- the climbing line: an anchor on the ledge edge; the rope appears once rigged ----------
  b.cyl(0.25, 0.3, 1.4, [CLIMB.x + 0.8, 0.7, -30.2], { mat: 'metal', color: 0x9aa0a6, seg: 8, collide: true }); // a drawing pin pushed into the top book
  b.beginGroup('climbLine');
  b.rod([CLIMB.x + 0.8, 1.2, -30.2], [CLIMB.x, 0.1, -30.8], 0.09, { mat: 'thread', color: 0xf2f2f4 });
  b.rod([CLIMB.x, 0.1, -30.8], [CLIMB.x, -10, -33.2], 0.09, { mat: 'thread', color: 0xf2f2f4 });
  b.rod([CLIMB.x, -10, -33.2], [CLIMB.x, F, -34], 0.09, { mat: 'thread', color: 0xf2f2f4 });
  for (let yy = F + 1; yy < -10; yy += 1.5) b.sphere(0.16, [CLIMB.x, yy, -33.2 - (0.8 * (-10 - yy)) / 10], { mat: 'thread', color: 0xe8e8ea, scale: [1, 0.6, 1] });
  const climbG = b.endGroup([0, 0, 0]);
  climbG.visible = false;
  wd.groups.set('climbLine', climbG);
  wd.hot('climb-top', 'expedition', CLIMB.top, 1.8, { what: 'climb', end: 'top' });
  wd.hot('climb-foot', 'expedition', CLIMB.foot, 1.8, { what: 'climb', end: 'foot' });

  // ---------- the cargo line: an old service lift bolted to the back of the cabinet, cable rotted through ----------
  const Y2 = TIER_Y[2];
  buildLift(b, wd, 'cargo', CARGO.x, CARGO.z, 0, Y2, rng.fork('cargo'), { working: false, doorZ: 1 });
  // landing bracket at the top: a shelf-pin bracket screwed to the back panel, leading to the Lacquer crack
  b.box(6, 0.6, 2.6, [CARGO.x, Y2 - 0.3, C.minZ - 1.2 - 1.3], { mat: 'brass', color: 0xd8c08a, collide: true });
  for (const s of [-1, 1]) b.col.add({ x: CARGO.x + s * 3.1, z: C.minZ - 2.5, w: 0.3, d: 2.6, minY: Y2, maxY: Y2 + 3, noCamera: true });
  // the rotten cable lying in a heap at the bottom, and a tag on the cage
  b.sag([CARGO.x + 1.2, 0.05, -17.0], [CARGO.x + 2.6, 0.05, -16.0], 0.02, 0.06, { mat: 'thread', color: 0x6a6258 }, 6);
  b.sphere(0.5, [CARGO.x + 2.2, 0.2, -16.4], { mat: 'thread', color: 0x6a6258, scale: [1.4, 0.4, 1.2] });
  b.lamp([CARGO.x, Y2 + 2.5, -16.5], 0xffd8a8, 0.7, 10, 0.5, undefined, 0.2);
  b.lamp([CARGO.x, 2.5, -16.5], 0xffd8a8, 0.7, 10, 0.5);
  wd.hot('cargo-fit', 'expedition', [CARGO.x + 1.6, 0, -16.6], 2.0, { what: 'cargo' });
  wd.hot('lift-cargo-low', 'lift', [CARGO.x, 0, -16.6], 1.8, { lift: 'cargo', level: 0 });
  wd.hot('lift-cargo-top', 'lift', [CARGO.x, Y2, -16.6], 1.8, { lift: 'cargo', level: 1 });

  buildLacquerRuins(b, wd, rng.fork('ruins'));

  wd.districtSpawn.set('outside', { pos: new THREE.Vector3(-16.1, 0, -17), yaw: Math.PI });
  // wildlife: a few moths around the charger light
  wd.moths.push({ light: new THREE.Vector3(57, F + 7, BACK_Z + 4), range: 6, rests: [{ pos: new THREE.Vector3(55, F + 8, BACK_Z + 1.01), normal: new THREE.Vector3(0, 0, 1) }] });
}

/**
 * Lacquer Court, tier 2 west: it was the shelf's richest street until the shelf tipped. The lacquer townhouses slid
 * into a heap against the back panel and nobody moved back. Reached only through the crack at the top of the cargo line.
 */
function buildLacquerRuins(b: WorldBuilder, wd: WorldData, rng: Rng): void {
  b.chunk = 'distant-2';
  const y = TIER_Y[2], ceil = TIER_Y[3] - C.shelfThickness;
  const x0 = C.minX, x1 = -22.6, cx = (x0 + x1) / 2;
  b.box(x1 - x0 - 0.6, 0.05, 26, [cx, y + 0.025, -0.5], { mat: 'matte', color: 0x3a1c18 });
  // keep people on the shelf: a low invisible edge at the front, like the Heights has
  b.col.add({ x: cx, z: C.shelfFrontZ - 0.2, w: x1 - x0, d: 0.3, minY: y, maxY: y + 3, tag: 'edge', noCamera: true });
  for (let x = x0 + 1; x < x1 - 1; x += 2) {
    const broken = rng.chance(0.4);
    b.cyl(0.06, 0.06, broken ? 0.4 : 0.9, [x, y + (broken ? 0.2 : 0.45), C.shelfFrontZ - 0.3], { mat: 'gold', color: 0xffffff, seg: 5 });
  }
  const box = (s: number, h: number, p: V3, ry: number, tip = 0, col = 0x9e1b1b): void => {
    b.box(s, h, s, p, { mat: 'plasticGloss', color: col, rot: [0, ry, tip] });
    b.box(s + 0.1, 0.12, s + 0.1, [p[0], p[1] + h / 2 - 0.02, p[2]], { mat: 'gold', rot: [0, ry, tip] });
    if (!tip) b.colliderFor(s, h, s, p, { collide: true, rot: [0, ry, 0] });
  };
  // the slide: townhouses tumbled against the back panel, a climbable heap with the best salvage on top
  box(4.4, 3.6, [-45, y + 1.8, -10.5], 0.2, 0, 0x7a1414);
  box(3.6, 3.0, [-41.6, y + 1.5, -11], -0.3);
  box(2.2, 1.6, [-45.4, y + 3.6 + 0.8, -10.6], 0.5, 0, 0x1b1b1b);
  box(3.2, 1.6, [-38.6, y + 0.8, -9.6], 0.1, 0, 0x1b1b1b);
  box(2.4, 1.2, [-36.6, y + 0.6, -8.4], 0.6);
  wd.hot('heap-lacquer-top', 'scavenge', [-45.4, y + 5.2, -10.6], 2.0, { loot: ['electronics', 'metal', 'foil', 'fabric'] });
  // a row of townhouses still standing, one on its side, one split open
  for (const [x, z, lv] of [[-60, -4, 2], [-54, 3, 1], [-34, 2, 2]] as const)
    for (let k = 0; k < lv; k++) box(3.4 - k * 0.5, 1.8, [x, y + 0.9 + k * 1.9, z], rng.range(-0.3, 0.3), 0, rng.pick([0x9e1b1b, 0x1b1b1b, 0x7a1414]));
  box(3.4, 1.8, [-48, y + 1.7, 4], 0.4, Math.PI / 2, 0x9e1b1b);
  b.colliderFor(1.8, 3.4, 3.4, [-48, y + 1.7, 4], { collide: true, rot: [0, 0.4, 0] });
  for (let i = 0; i < 6; i++) b.box(rng.range(0.6, 1.6), 0.1, rng.range(0.6, 1.4), [-49 + rng.range(-3, 3), y + 0.06, 6 + rng.range(-1, 2)], { mat: 'plasticGloss', color: 0x9e1b1b, rot: [0, rng.range(0, 3), 0], noBake: true });
  wd.hot('heap-lacquer-open', 'scavenge', [-48, y, 6.5], 2.2, { loot: ['metal', 'foil', 'fabric', 'scrap'] });
  // the chopstick colonnade, half of it down
  for (let x = x0 + 4; x < x1 - 3; x += 3) {
    if (rng.chance(0.45)) b.cyl(0.14, 0.2, 6, [x + rng.range(-0.4, 0.4), y + 0.2, 6.5 + rng.range(-1, 1)], { mat: 'plasticGloss', color: 0x8a1a12, seg: 8, rot: [Math.PI / 2, rng.range(-0.6, 0.6), 0] });
    else b.cyl(0.14, 0.2, 6, [x, y + 3, 6.5], { mat: 'plasticGloss', color: 0x8a1a12, seg: 8 });
  }
  // dust and old cobwebs; a single cracked strip light still flickering
  for (let i = 0; i < 18; i++) b.sphere(rng.range(0.4, 1.2), [rng.range(x0 + 2, x1 - 2), y + 0.1, rng.range(-12, 10)], { mat: 'fabric', color: 0x8a8478, scale: [1.6, 0.3, 1.2], noBake: true });
  for (let i = 0; i < 5; i++) {
    const x = rng.range(x0 + 4, x1 - 4);
    b.sag([x, ceil - 0.1, -13.5], [x + rng.range(-3, 3), ceil - 0.1, rng.range(-6, 4)], rng.range(1, 3), 0.02, { mat: 'thread', color: 0xd8d8dc }, 8);
  }
  b.box(14, 0.08, 0.3, [-40, ceil - 0.05, 8], { mat: 'glowSoft', color: 0xffe9c8 });
  b.lamp([-40, ceil - 1.5, 6], 0xffe2b8, 1.0, 22, 0.6, undefined, 0.35);
  b.lamp([-29, y + 2.5, -12.5], 0xbfd0ff, 0.6, 9, 0.4);
  wd.hot('ruins-sign', 'expedition', [-27, y, -11], 2.6, { what: 'ruins' });
}
