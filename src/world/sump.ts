// THE SUMP WARD — the unlit hunting ground west of the Spill, where the giant's lost things fall.
// Duke Tallow holds the Fall Franchise here; his Tallymen haul to a sardine-tin cart.
import * as THREE from 'three';
import { Rng } from '../core/rng';
import { WorldBuilder } from './builder';
import { Frame } from './frame';
import { WorldData } from './worldData';
import { crate, hangingLamp, litter, signBoard, toothpick, button, bottleCap, threadWrap, tape } from './props';
import { scrapHeap } from './structures';
import { TIER_Y } from '../config';

export const SUMP_X = -22.6; // west of this, at tier 0, you are in the Sump

export function buildSump(b: WorldBuilder, wd: WorldData, rng0: Rng): void {
  b.chunk = 'sump';
  const rng = rng0.fork('sump');
  const F = new Frame(0, 0, 0);
  const ceil = TIER_Y[1] - 1.3;

  // bounds: the back stack, a junk wall to the west, the glass in front is already solid
  b.col.add({ x: -44, z: -11.5, w: 44, d: 5, minY: 0, maxY: ceil, tag: 'stack' });
  for (let z = -8; z < 14; z += 2.4) crate(b, F, -50.6, z, 0, 1.6, rng.range(2.5, 5), 2.2, rng, { open: rng.chance(0.4) });
  b.col.add({ x: -50.8, z: 3, w: 1.4, d: 24, minY: 0, maxY: ceil, tag: 'bound' });

  // dust, scraps and a damp floor
  litter(b, F, -49, -8, -24, 12, 110, rng);
  b.cyl(2.6, 2.6, 0.02, [-28, 0.012, 2], { mat: 'water', seg: 28 });
  for (let i = 0; i < 18; i++) b.sphere(rng.range(0.3, 0.9), [rng.range(-49, -26), 0.05, rng.range(-8, 12)], { mat: 'fabric', color: 0x8f8a80, scale: [1.4, 0.25, 1.2], seg: 8 });

  // gate + claims table
  for (const z of [6.4, 9.1]) toothpick(b, F, -23.2, z, 0, 3.2, { wrapColor: 0xd9a441, collide: true });
  // gate joinery: thread lashings, bottle-cap washers, a safety-pin hinge
  for (const z of [6.4, 9.1]) {
    for (const y of [0.55, 1.3, 2.2]) threadWrap(b, F, -23.2, y, z, 0.075, y > 2 ? 0xd9a441 : 0xc0392b);
    for (const y of [0.9, 1.75]) {
      b.cyl(0.24, 0.24, 0.05, [-23.2, y, z], { mat: 'metal', color: 0xb8bcc2, seg: 14 });
      b.cyl(0.09, 0.09, 0.07, [-23.2, y, z], { mat: 'metal', color: 0x4a4e54, seg: 8 });
    }
  }
  b.rod([-23.05, 1.95, 6.55], [-22.55, 1.95, 7.0], 0.03, { mat: 'metal', color: 0xd4d6da });
  b.rod([-23.05, 1.8, 6.55], [-22.55, 1.8, 7.0], 0.03, { mat: 'metal', color: 0xd4d6da });
  b.sphere(0.1, [-23.05, 1.875, 6.5], { mat: 'metal', color: 0xd4d6da, scale: [1, 1.2, 1], seg: 8 });
  b.rod([-23.2, 0.9, 9.0], [-22.6, 0.95, 8.5], 0.03, { mat: 'metal', color: 0xd4d6da });
  tape(b, F, -23.3, 2.8, 6.4, 0.3, 0.5, [0, Math.PI / 2, 0.3]);

  // landing basin: a jar-lid rim, cloth lining, a skin of water, discarded plastic
  {
    const [bx, bz] = [-31.5, 11.6];
    const rimOut = new THREE.CylinderGeometry(2.3, 2.3, 0.35, 32, 1, true);
    const rimIn = new THREE.CylinderGeometry(2.22, 2.22, 0.35, 32, 1, true);
    const ix = rimIn.index!.array as Uint16Array | Uint32Array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    const nrm = rimIn.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
    b.add(rimOut, [bx, 0.175, bz], { mat: 'metal', color: 0xa9a28c });
    b.add(rimIn, [bx, 0.175, bz], { mat: 'metal', color: 0x8a8470 });
    b.cyl(2.42, 2.42, 0.06, [bx, 0.34, bz], { mat: 'metal', color: 0xb8b09a, seg: 32, open: true });
    b.cyl(2.0, 2.0, 0.025, [bx, 0.045, bz], { mat: 'water', seg: 32 });
    b.cyl(2.2, 2.2, 0.04, [bx, 0.02, bz], { mat: 'fabric', color: 0xa7b6c6, seg: 32 });
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + 0.2;
      b.sphere(0.5, [bx + Math.cos(a) * 1.95, 0.2, bz + Math.sin(a) * 1.95], { mat: 'fabric', color: k % 2 ? 0xb9c4d0 : 0x93a5b8, scale: [1.3, 0.34, 0.85], rot: [0, -a, 0], seg: 8 });
    }
    // flannel corner slung over the rim
    b.sphere(0.6, [bx + 2.25, 0.3, bz - 0.5], { mat: 'fabric', color: 0xc4a3a3, scale: [0.8, 0.4, 1.3], seg: 8 });
    // discarded plastic: bottle cap, cracked blister-pack shard, cling-film blob
    bottleCap(b, F, bx + 3.1, 0.02, bz - 1.1, 0.6, 0x2e86ab);
    b.box(1.0, 0.04, 0.7, [bx - 2.9, 0.03, bz + 1.4], { mat: 'plasticClear', color: 0xcfe6f0, rot: [0, 0.6, 0.05] });
    b.box(0.5, 0.04, 0.4, [bx - 3.3, 0.03, bz + 0.5], { mat: 'plasticClear', color: 0xcfe6f0, rot: [0.04, -0.4, 0] });
    for (const [dx, dz] of [[-3.0, 1.3], [-2.75, 1.55]]) b.sphere(0.13, [bx + dx, 0.09, bz + dz], { mat: 'plasticClear', color: 0xe8f0f4, scale: [1, 0.6, 1], seg: 8 });
    b.sphere(0.55, [bx + 0.6, 0.22, bz + 3.0], { mat: 'plasticClear', color: 0xdfeaf0, scale: [1.3, 0.55, 0.9], seg: 9 });
    b.sphere(0.35, [bx + 1.3, 0.14, bz + 3.3], { mat: 'plasticClear', color: 0xdfeaf0, scale: [1.2, 0.5, 1], seg: 8 });
  }

  // wooden clothes peg clamped upright: a watch-post just west of the gate
  {
    const [px, pz] = [-25, 4.5];
    for (const s of [-1, 1]) {
      b.box(0.6, 1.9, 0.9, [px + s * 0.34, 0.95, pz], { mat: 'wood', color: 0xe0bf85, rot: [0, 0, s * -0.03], collide: true });
      b.box(0.62, 2.7, 1.3, [px + s * 0.34, 3.2, pz], { mat: 'wood', color: 0xd9b479, collide: true });
    }
    b.cyl(0.25, 0.25, 1.7, [px, 2.0, pz], { mat: 'metal', color: 0xb0b4ba, rot: [Math.PI / 2, 0, 0], seg: 10 });
    for (let k = -2; k <= 2; k++) b.cyl(0.27, 0.27, 0.04, [px, 2.0, pz + k * 0.3], { mat: 'metal', color: 0x8e9298, rot: [Math.PI / 2, 0, 0], seg: 10 });
    b.box(2.9, 0.14, 2.2, [px, 4.62, pz], { mat: 'wood', color: 0xe7c88f, rot: [0, 0.08, 0] });
    for (const s of [-1, 1]) toothpick(b, F, px + s * 1.3, pz - 0.95, 4.65, 0.9);
    b.rod([px - 1.3, 5.3, pz - 0.95], [px + 1.3, 5.3, pz - 0.95], 0.025, { mat: 'thread', color: 0xc0392b });
    threadWrap(b, F, px, 3.4, pz + 0.7, 0.3, 0xe1b12c);
  }

  signBoard(b, F, 'sumpWard', -23.4, 3.9, 7.75, 2.4, [0, -Math.PI / 2, 0], 'plank');
  b.box(2.8, 0.25, 1.1, [-26.5, 1.0, 9.9], { mat: 'rubber', color: 0xb0a090, collide: true });
  for (const x of [-27.6, -25.4]) b.box(0.6, 0.88, 0.8, [x, 0.44, 9.9], { mat: 'painted', color: 0x3a3226 });
  b.box(0.9, 0.08, 0.6, [-26.9, 1.17, 9.9], { mat: 'painted', color: 0x6a1f2d }); // the ledger
  signBoard(b, F, 'claims', -26.5, 2.5, 11.5, 2.0, [0, Math.PI, 0], 'card');
  hangingLamp(b, [-26.5, ceil, 9.5], 13.5, 0xffb060, 'cap', 1.6, 9, 'sump');

  // the Wet Shelf: two heaps worth digging
  scrapHeap(b, F, -29, 6, 1.2, rng.fork('sh0'));
  scrapHeap(b, F, -31, -3, 1.2, rng.fork('sh1'));
  wd.hot('sumpHeap0', 'scavenge', [-29, 0, 6], 2.2, { loot: ['scrap', 'metal', 'foil'] });
  wd.hot('sumpHeap1', 'scavenge', [-31, 0, -3], 2.2, { loot: ['scrap', 'fabric', 'grit'] });

  // the Drop Field: giant lost things as cover
  // domino on its side
  b.box(0.7, 2.8, 5.4, [-35, 1.4, -0.5], { mat: 'plasticGloss', color: 0x161616, collide: true });
  for (const [y, z] of [[2.2, -1.8], [0.6, -1.8], [1.4, 0.8], [2.2, 1.6], [0.6, 1.6]]) b.cyl(0.22, 0.22, 0.05, [-34.63, y, z], { mat: 'plasticGloss', color: 0xf2efe6, rot: [0, 0, Math.PI / 2], seg: 12 });
  // a die
  b.box(1.7, 1.7, 1.7, [-39, 0.85, 6], { mat: 'plasticGloss', color: 0xe9e2d6, rot: [0, 0.4, 0], collide: true });
  for (let k = 0; k < 3; k++) b.sphere(0.16, [-39 + 0.33 * (k - 1) * Math.cos(0.4), 1.72, 6 - 0.33 * (k - 1) * Math.sin(0.4)], { mat: 'matte', color: 0x1a1a1a, scale: [1, 0.3, 1], seg: 8 });
  // a coin standing on edge
  b.cyl(1.7, 1.7, 0.26, [-42.6, 1.7, 2.5], { mat: 'brass', color: 0xffffff, rot: [Math.PI / 2, 0.5, 0], seg: 32 });
  b.colliderFor(3.4, 3.4, 0.6, [-42.6, 1.7, 2.5], { collide: true, rot: [0, 0.5, 0] });
  // a marble
  b.sphere(1.2, [-38.5, 1.2, -6], { mat: 'plasticClear', color: 0x9fd6e8, seg: 24 });
  b.sphere(0.5, [-38.5, 1.2, -6], { mat: 'plasticGloss', color: 0xd9822b, scale: [1.6, 0.3, 0.6] });
  b.colliderFor(2.2, 2.4, 2.2, [-38.5, 1.2, -6], { collide: true });
  button(b, F, -46, 0.05, -1, 0.9, 0x2e4057);

  // Webworks: threads strung from the back stack, a cocoon
  for (let k = 0; k < 14; k++) {
    const x = rng.range(-50, -42), z = -8.8;
    b.rod([x, rng.range(3, 9), z], [x + rng.range(-3, 3), 0.05, rng.range(-7, -2)], 0.012, { mat: 'thread', color: 0xe8e8ec, noBake: true });
  }
  b.sphere(0.7, [-47.5, 2.2, -6.5], { mat: 'fabric', color: 0xeeeef2, scale: [0.8, 1.5, 0.8] });
  b.rod([-47.5, 3.2, -6.5], [-47.5, ceil, -6.5], 0.02, { mat: 'thread', color: 0xeeeef2, noBake: true });

  // the Cart: a sardine-tin sled
  b.box(3.6, 0.7, 2.2, [-46, 0.35, 10], { mat: 'metal', color: 0xc9c2b2, collide: true });
  b.cyl(0.3, 0.3, 2.3, [-44.1, 0.9, 10], { mat: 'metal', color: 0xb0a890, rot: [Math.PI / 2, 0, 0], seg: 12 });
  for (let k = 0; k < 5; k++) crate(b, F, -46.8 + k * 0.4, 9.6 + (k % 2) * 0.6, 0.7, 0.6, 0.5, 0.6, rng, { open: false });
  wd.hot('cart', 'cart', [-46, 0, 8.2], 2.4, {});
  hangingLamp(b, [-41, ceil, 4], 14.5, 0xffa050, 'none', 0.9, 8, 'sump');

  // gameplay data
  wd.sump = {
    sites: [new THREE.Vector3(-36, 0, 4.5), new THREE.Vector3(-41.5, 0, -2.5), new THREE.Vector3(-45, 0, 5.5)],
    spiderHomes: [new THREE.Vector3(-37, 0, 1.5), new THREE.Vector3(-43, 0, -4.5), new THREE.Vector3(-46.5, 0, 2), new THREE.Vector3(-33, 0, -6)],
    cart: new THREE.Vector3(-46, 0, 8.2),
    gate: new THREE.Vector3(-24.5, 0, 7.75),
    basin: new THREE.Vector3(-31.5, 0, 11.6),
  };
  wd.node('s.GATE', [-26.5, 0, 10.9], 'depths', ['claims']);
  wd.districtSpawn.set('sump', { pos: new THREE.Vector3(-24.5, 0, 7.75), yaw: -Math.PI / 2 });
}
