// Themed mid-ground for the non-playable compartments, so each reads as its role in the cabinet economy
// (docs/map-plan.md): Button Row mill, Wickside shrine, Pearl Terrace orchard, Velvet Mews. (Lacquer Court is the
// playable ruins in outside.ts.)
// Returns false for compartments that keep the generic clutter.
import * as THREE from 'three';
import { Rng } from '../core/rng';
import { WorldBuilder } from './builder';

type C = { name: string; x1: number };

export function dressDistrict(b: WorldBuilder, c: C, x0: number, y: number, ceil: number, rng: Rng): boolean {
  const xs = (step: number) => {
    const out: number[] = [];
    for (let x = x0 + 4; x < c.x1 - 3; x += step + rng.range(-1, 1)) out.push(x);
    return out;
  };
  switch (c.name) {
    case 'Button Row': {
      // cloth mill: button millstones on axles, bottle-cap dye vats, a comb loom with warp threads
      for (const [i, x] of xs(9).entries()) {
        const z = rng.range(-5, 4);
        if (i % 3 === 0) {
          for (let k = 0; k < 3; k++)
            b.cyl(2.2 - k * 0.3, 2.2 - k * 0.3, 0.6, [x, y + 0.3 + k * 0.62, z], { mat: 'plasticGloss', color: rng.pick([0x8a5a3a, 0x2f4d6e, 0xd8cfc0]), seg: 28 });
          b.cyl(0.18, 0.18, 6, [x, y + 3, z], { mat: 'wood', color: 0xa07a4a, seg: 8 });
          b.rod([x, y + 5.6, z], [x + 3, y + 5.6, z], 0.12, { mat: 'wood', color: 0xa07a4a, seg: 6 });
        } else if (i % 3 === 1) {
          for (let k = 0; k < 3; k++) {
            const vx = x - 2 + k * 2.1, col = [0xb8322a, 0x2a6fb0, 0xd8a72a][k];
            b.cyl(1.0, 1.0, 0.7, [vx, y + 0.35, z], { mat: 'metal', color: 0xc9c2b2, seg: 20, open: true });
            b.cyl(0.95, 0.95, 0.05, [vx, y + 0.6, z], { mat: 'water', color: col, seg: 20, noBake: true });
            b.sag([vx, y + 3.2, z - 0.6], [vx + 1.4, y + 3.2, z + 0.6], 0.8, 0.05, { mat: 'thread', color: col }, 6);
          }
        } else {
          // comb loom: a comb standing on its spine with threads strung across the teeth
          b.box(6, 0.8, 0.35, [x, y + 0.4, z], { mat: 'plastic', color: 0x2a2a2a });
          for (let t = 0; t < 20; t++) b.box(0.12, 3.4, 0.25, [x - 2.85 + t * 0.3, y + 2.5, z], { mat: 'plastic', color: 0x2a2a2a });
          for (let t = 0; t < 8; t++) b.box(6, 0.04, 0.04, [x, y + 1.3 + t * 0.4, z + 0.2], { mat: 'thread', color: rng.pick([0xe86a5c, 0x7fc7c0, 0xf2e6c8]) });
          b.box(4.5, 0.06, 2.6, [x, y + 0.03, z + 2], { mat: 'fabric', color: rng.pick([0xe86a5c, 0x7fc7c0, 0xd8c27a]) });
        }
      }
      return true;
    }
    case 'Wickside': {
      // shrine: one great pillar candle with a live flame, a porcelain figure in a wax niche, rows of tealights
      const cx = (x0 + c.x1) / 2, z = -3;
      const H = Math.min(10, ceil - y - 3);
      b.cyl(3.2, 3.3, H, [cx, y + H / 2, z], { mat: 'matte', color: 0xf3ead6, seg: 32 });
      for (let k = 0; k < 9; k++) {
        const a = rng.range(0, Math.PI * 2), dl = rng.range(1, 3.5);
        b.cyl(0.18, 0.28, dl, [cx + Math.cos(a) * 3.2, y + H - dl / 2 + 0.1, z + Math.sin(a) * 3.2], { mat: 'matte', color: 0xf6eedc, seg: 8 });
      }
      b.cyl(0.06, 0.06, 0.6, [cx, y + H + 0.3, z], { mat: 'matte', color: 0x222222, seg: 6 });
      b.sphere(0.35, [cx, y + H + 0.9, z], { mat: 'glow', color: 0xffc46a, scale: [0.8, 1.6, 0.8] });
      b.lamp([cx, y + H + 1, z], 0xffb35c, 2.2, 22, 0.7, undefined, 0.25);
      // niche + figure to one side
      const nx = cx + 11;
      b.box(5, 6, 3, [nx, y + 3, z - 1], { mat: 'matte', color: 0xe9dcc0 });
      b.box(3, 4.4, 1, [nx, y + 2.6, z + 0.6], { mat: 'matte', color: 0x6a4a34 });
      b.cyl(0.5, 0.9, 2.2, [nx, y + 1.5, z + 0.9], { mat: 'plasticGloss', color: 0xf8f8f8, seg: 16 });
      b.sphere(0.45, [nx, y + 3.0, z + 0.9], { mat: 'plasticGloss', color: 0xf8f8f8, seg: 14 });
      b.sphere(0.3, [nx, y + 3.4, z + 0.75], { mat: 'gold', seg: 10, scale: [1.6, 0.25, 1.6] });
      // tealight rows facing the candle
      for (let r = 0; r < 3; r++)
        for (let k = -3; k <= 3; k++) {
          const tx = cx + k * 2.2, tz = z + 6 + r * 2.2;
          b.cyl(0.75, 0.75, 0.6, [tx, y + 0.3, tz], { mat: 'metal', color: 0xd4d6da, seg: 16 });
          if ((k + r) % 2 === 0) b.sphere(0.12, [tx, y + 0.8, tz], { mat: 'glow', color: 0xffc46a, scale: [0.8, 1.5, 0.8] });
        }
      b.lamp([cx, y + 2, z + 8], 0xffb35c, 1.2, 12, 0.5, undefined, 0.15);
      // a second, smaller votive stack at the far end
      const vx = cx - 13;
      b.cyl(1.6, 1.7, 4, [vx, y + 2, z + 1], { mat: 'matte', color: 0xd9b48a, seg: 24 });
      b.sphere(0.2, [vx, y + 4.4, z + 1], { mat: 'glow', color: 0xffc46a, scale: [0.8, 1.5, 0.8] });
      return true;
    }
    case 'Pearl Terrace': {
      // orchard: toothpick-and-bead trees under draped pearl strings, a ring-roll for a gate
      for (const x of xs(5)) {
        const z = rng.range(-5, 5), h = rng.range(3.5, 5);
        b.cyl(0.08, 0.1, h, [x, y + h / 2, z], { mat: 'wood', color: 0xd9b98a, seg: 6 });
        for (let k = 0; k < 7; k++)
          b.sphere(rng.range(0.25, 0.45), [x + rng.range(-1, 1), y + h - rng.range(0, 1.5), z + rng.range(-1, 1)], { mat: 'pearl', color: rng.pick([0xfff8ee, 0xf6e7ec, 0xeef2f8]), seg: 12 });
        b.sphere(1.2, [x, y + h - 0.4, z], { mat: 'moss', color: 0x9fbf7a, seg: 10, scale: [1, 0.7, 1] });
      }
      for (let s = 0; s < 3; s++) {
        const pts = b.sag([x0 + 2, ceil - 0.5, -6 + s * 5], [c.x1 - 2, ceil - 0.5, -4 + s * 5], 3, 0.02, { mat: 'thread', color: 0xd8d2c4 }, 16);
        for (const p of pts) b.sphere(0.32, p.toArray() as [number, number, number], { mat: 'pearl', color: 0xfff8ee, seg: 10 });
      }
      const ring = new THREE.TorusGeometry(2.6, 0.35, 10, 32);
      b.add(ring, [x0 + 6, y + 2.6, 6], { mat: 'gold' });
      return true;
    }
    case 'Velvet Mews': {
      // ring boxes for houses, open, velvet-lined; pincushion ottomans
      for (const x of xs(6)) {
        const z = rng.range(-5, 4), col = rng.pick([0x5a1a3a, 0x1f2f5a, 0x2f4a2a]);
        b.box(3.4, 2.2, 3.4, [x, y + 1.1, z], { mat: 'velvet', color: col });
        b.box(3.4, 2.2, 0.3, [x, y + 3.2, z - 1.6], { mat: 'velvet', color: col, rot: [-0.35, 0, 0] });
        b.box(2.8, 0.5, 2.6, [x, y + 2.3, z], { mat: 'velvet', color: 0xe9dcc8 });
        b.sphere(0.9, [x + 3, y + 0.7, z + 2.5], { mat: 'fabric', color: 0xc0392b, scale: [1, 0.75, 1], seg: 14 });
      }
      return true;
    }
  }
  return false;
}
