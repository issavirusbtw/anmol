// LINT FLATS FARM â€” the west yard past the sardine tin (x 24..44, z -9..14). Water arrives by the branch straw along
// the glass into a teacup cistern; cress grows in an egg-carton seed tray and on wet paper pads; mould is cultured on a
// bread crust. The lane along z -1.5..1.5 (out of the tin toward the fence) stays clear.
import * as THREE from 'three';
import { Rng } from '../core/rng';
import { WorldBuilder } from './builder';

const SOIL = 0x4a3324, CRESS = [0xa6d65e, 0xb8e070, 0x94c84e], PULP = 0xb4aea2;

/** A clump of cress seedlings: thin stems, two leaf blobs each. */
function cress(b: WorldBuilder, x: number, y: number, z: number, r: number, n: number, rng: Rng): void {
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2), d = Math.sqrt(rng.next()) * r;
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, h = rng.range(0.35, 0.75), lean = rng.range(-0.25, 0.25);
    b.cyl(0.02, 0.03, h, [px, y + h / 2, pz], { mat: 'matte', color: 0xdde8c0, rot: [lean, 0, rng.range(-0.25, 0.25)], seg: 4 });
    const c = rng.pick(CRESS), ry = rng.range(0, 3);
    // two seed leaves splayed up in a V
    b.sphere(0.075, [px - 0.06, y + h + 0.02, pz], { mat: 'matte', color: c, scale: [1.5, 0.35, 0.9], rot: [0, ry, 0.5], seg: 6 });
    b.sphere(0.075, [px + 0.06, y + h + 0.02, pz], { mat: 'matte', color: c, scale: [1.5, 0.35, 0.9], rot: [0, ry, -0.5], seg: 6 });
  }
}

export function buildFarm(b: WorldBuilder, rng: Rng): void {
  // floor: damp, darker card with a faint green bloom around the wet end
  b.box(19.5, 0.03, 22, [34, 0.07, 2.5], { mat: 'cardboard', color: 0x9c8462 });
  for (let i = 0; i < 14; i++) b.cyl(rng.range(0.6, 1.6), rng.range(0.6, 1.6), 0.02, [rng.range(31, 41), 0.095, rng.range(5, 13)], { mat: 'matte', color: 0x857a58, seg: 14 });

  // egg-carton seed tray (2 x 5 cups) against the back stack
  {
    const x0 = 31.2, z0 = -7.6, cw = 2.05, H = 1.5;
    b.box(cw * 5 + 0.5, 0.25, cw * 2 + 0.5, [x0 + cw * 2, 0.125, z0 + cw / 2], { mat: 'matte', color: PULP });
    for (let i = 0; i < 5; i++)
      for (let j = 0; j < 2; j++) {
        const cx = x0 + i * cw, cz = z0 + j * cw;
        b.cyl(0.98, 0.7, H, [cx, H / 2, cz], { mat: 'matte', color: 0xc2bcb0, seg: 10, open: true });
        b.cyl(0.9, 0.9, 0.08, [cx, H - 0.25, cz], { mat: 'crumb', color: SOIL, seg: 10 });
        if ((i + j) % 4 !== 3) cress(b, cx, H - 0.21, cz, 0.6, 9, rng);
      }
    // pulp cones between the cups
    for (let i = 0; i < 4; i++) b.cyl(0.08, 0.35, 1.9, [x0 + (i + 0.5) * cw, 0.95, z0 + cw / 2], { mat: 'matte', color: PULP, seg: 8 });
    b.col.add({ x: x0 + cw * 2, z: z0 + cw / 2, w: cw * 5 + 0.5, d: cw * 2 + 0.5, minY: 0, maxY: H });
  }

  // teacup cistern, fed by the straw that comes through the wall along the glass
  {
    const cx = 36.5, cz = 9.6;
    b.cyl(2.7, 1.9, 3.2, [cx, 1.6, cz], { mat: 'plasticGloss', color: 0xf3efe6, seg: 32, collide: true });
    b.cyl(2.74, 2.74, 0.25, [cx, 2.9, cz], { mat: 'plasticGloss', color: 0x3d6fa8, seg: 32, open: true });
    b.cyl(2.5, 2.5, 0.04, [cx, 2.85, cz], { mat: 'water', color: 0x6c8a7a, seg: 32, noBake: true });
    b.cyl(2.2, 2.2, 0.3, [cx, 0.15, cz], { mat: 'plasticGloss', color: 0xe8e2d6, seg: 28 });
    const handle = new THREE.TorusGeometry(0.85, 0.18, 8, 18, Math.PI * 1.2);
    b.add(handle, [cx + 2.75, 1.7, cz], { mat: 'plasticGloss', color: 0xf3efe6, rot: [0, 0, -Math.PI * 0.6] });
    b.rod([22.4, 0.3, 13.6], [cx - 1.6, 3.3, cz + 1.4], 0.21, { mat: 'plasticGloss', color: 0xf4f4f4, seg: 12 });
    // overflow wicks: cotton thread from the rim down to the cress pads
    b.rod([cx - 2.4, 3.0, cz - 1.0], [33.2, 0.1, 5.6], 0.06, { mat: 'thread', color: 0xd8d2c4, seg: 5 });
    b.rod([cx + 0.6, 3.0, cz - 2.6], [39.4, 0.1, 5.2], 0.06, { mat: 'thread', color: 0xd8d2c4, seg: 5 });
  }

  // cress pads: wet paper towel squares, walk-through
  for (const [px, pz, rot] of [[32.6, 5.0, 0.2], [39.6, 4.6, -0.15]] as const) {
    b.box(3.4, 0.06, 2.8, [px, 0.12, pz], { mat: 'matte', color: 0xe6eae0, rot: [0, rot, 0] });
    cress(b, px, 0.15, pz, 1.3, 40, rng);
  }

  // bread-crust mould bed by the wall
  {
    const cx = 28.6, cz = 8.4;
    b.box(4.8, 0.85, 3.2, [cx, 0.425, cz], { mat: 'crumb', color: 0xc9a46a, collide: true });
    b.box(5.0, 0.95, 0.35, [cx, 0.475, cz - 1.7], { mat: 'crumb', color: 0x8a5428 });
    b.box(5.0, 0.95, 0.35, [cx, 0.475, cz + 1.7], { mat: 'crumb', color: 0x8a5428 });
    for (let i = 0; i < 26; i++)
      b.sphere(rng.range(0.15, 0.45), [cx + rng.range(-2.2, 2.2), 0.85, cz + rng.range(-1.4, 1.4)], {
        mat: 'moss', color: rng.pick([0x7d9a5c, 0x5f7f6a, 0xc9d6c2, 0x9fb3a0]), scale: [1, 0.5, 1], seg: 8,
      });
    b.box(1.2, 0.42, 1.0, [cx, 0.21, cz - 2.4], { mat: 'crumb', color: 0xb98a52, collide: true }); // crumb step
  }

  // grow light: a pink LED strip under the shelf, the farm's own colour
  b.box(14, 0.08, 0.3, [35, 18.55, 4], { mat: 'glowSoft', color: 0xffb0d8 });
  b.lamp([31, 16.5, 4], 0xff9ccc, 1.3, 14, 0.6);
  b.lamp([39, 16.5, 4], 0xff9ccc, 1.3, 14, 0.6);
}
