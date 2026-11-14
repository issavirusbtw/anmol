// Distant compartments: the rest of the cabinet, built cheaply but densely, with simplified crowds.
import * as THREE from 'three';
import { Rng } from '../core/rng';
import { WorldBuilder } from './builder';
import { Frame } from './frame';
import { PAL, awning, bottleCap, crate, fairyLights, spool, toothpick } from './props';
import { apartmentStack, pod } from './structures';
import { TIER_Y, CABINET } from '../config';

import { dressDistrict } from './districts';
export interface Compartment {
  x0: number;
  x1: number;
  tier: number;
  wealth: number;
  name: string;
}

export interface CrowdWalker {
  a: THREE.Vector3;
  b: THREE.Vector3;
  speed: number;
  standing: boolean;
}

export function compartments(): Compartment[] {
  const D = CABINET.dividerX;
  const L = CABINET.minX, R = CABINET.maxX;
  const list: Compartment[] = [
    { x0: L, x1: -D, tier: 0, wealth: 0.0, name: 'Sump Ward' },
    { x0: D, x1: R, tier: 0, wealth: 0.05, name: 'Lint Flats' },
    { x0: L, x1: -D, tier: 1, wealth: 0.25, name: 'Button Row' },
    { x0: D, x1: R, tier: 1, wealth: 0.3, name: 'Wickside' },
    { x0: L, x1: -D, tier: 2, wealth: 0.6, name: 'Lacquer Court' },
    { x0: 0, x1: D, tier: 2, wealth: 0.7, name: 'Pearl Terrace' },
    { x0: D, x1: R, tier: 2, wealth: 0.65, name: 'Velvet Mews' },
  ];
  for (let t = 3; t < 6; t++)
    for (const [x0, x1] of [
      [L, -D],
      [-D, D],
      [D, R],
    ])
      list.push({ x0, x1, tier: t, wealth: 0.75 + (t - 3) * 0.1, name: t === 5 ? 'The Crown' : 'Upper Shelves' });
  return list;
}

export function buildDistant(b: WorldBuilder, rng0: Rng, walkers: CrowdWalker[]): void {
  for (const c of compartments()) {
    if (c.name === 'Lacquer Court') continue; // playable ruins, built in outside.ts
    const rng = rng0.fork(`${c.name}-${c.tier}-${c.x0}`);
    b.chunk = `distant-${c.tier}`;
    const y = TIER_Y[c.tier];
    const ceil = (TIER_Y[c.tier + 1] ?? CABINET.top) - CABINET.shelfThickness;
    const h = ceil - y;
    const w = c.x1 - c.x0;
    const cx = (c.x0 + c.x1) / 2;
    const rich = c.wealth > 0.55;
    // floor finish
    b.box(w - 1, 0.05, 20, [cx, y + 0.025, 0], { mat: rich ? 'plasticGloss' : 'cardboard', color: rich ? 0xe8e2d4 : rng.pick(PAL.card) });
    // back stack
    const floors = Math.max(2, Math.floor((h - 3) / 3.1));
    apartmentStack(b, new Frame(cx, y, -11.5), rng.fork('stack'), w - 2, 5, rich ? Math.max(2, floors - 2) : floors, { wealth: c.wealth, lit: rich ? 0.85 : 0.55, floorH: rich ? 3.6 : 3.0 });
    // mid-ground clutter (the Sump Ward is built as a playable zone instead)
    // Lint Flats: the west half is the playable farm (farm.ts); only the wild half past the fence gets clutter
    const playable = c.name === 'Sump Ward';
    const x0 = c.name === 'Lint Flats' ? 46 : c.x0;
    const n = playable || dressDistrict(b, c, x0, y, ceil, rng.fork('dress')) ? 0 : Math.floor((c.x1 - x0) / 7);
    for (let i = 0; i < n; i++) {
      const x = x0 + 3 + (i + 0.5) * ((c.x1 - x0 - 6) / n) + rng.range(-1, 1);
      const z = rng.range(-6, 6);
      const f = new Frame(x, y, z, rng.range(-0.4, 0.4));
      const k = rng.next();
      if (rich) {
        if (k < 0.4) {
          bottleCap(b, f, 0, 0, 0, 1.3, rng.pick([0xc9a24a, 0xe8e2d4]), {});
          b.cyl(1.25, 1.25, 0.12, f.p(0, 0.55, 0), { mat: 'moss', seg: 20 });
          b.sphere(0.7, f.p(0, 1.6, 0), { mat: 'moss', seg: 10 });
          b.cyl(0.06, 0.06, 1.1, f.p(0, 1.0, 0), { mat: 'wood', color: 0xa07a4a, seg: 6 });
        } else if (k < 0.7) {
          b.box(3, rng.range(3, 6), 3, f.p(0, 2, 0), { mat: 'plasticClear', color: rng.pick([0xe9f4f2, 0xf4e9f2]) });
          b.box(2.6, 2.6, 2.6, f.p(0, 1.6, 0), { mat: 'glowSoft', color: 0xfff0d8, noBake: true });
        } else {
          b.cyl(0.07, 0.09, 3, f.p(0, 1.5, 0), { mat: 'gold', seg: 6 });
          b.sphere(0.3, f.p(0, 3.2, 0), { mat: 'glow', color: 0xfff1d6 });
          b.lamp(f.p(0, 3.2, 0), 0xfff0d8, 1.2, 8, 0.6);
        }
      } else {
        if (k < 0.35) {
          pod(b, f, rng, rng.range(3, 4.4), 2.8, rng.range(3, 4), c.wealth, 0.6);
          if (rng.chance(0.4)) pod(b, f.sub(0, 2.8, -0.3), rng, 3, 2.6, 3, c.wealth, 0.6);
        } else if (k < 0.6) {
          crate(b, f, 0, 0, 0, 2, 1.6, 1.8, rng, { contents: 0xd9a35c });
          awning(b, f, 0, 2.6, 0.4, 3, 2.4, rng.int(0, 3), rng, 0.3);
        } else if (k < 0.8) spool(b, f, 0, 0, 0, rng.range(1, 1.8), rng.range(2, 4), rng.pick(PAL.thread), false);
        else {
          toothpick(b, f, 0, 0, 0, 3.6);
          b.sphere(0.18, f.p(0, 3.5, 0), { mat: 'glow', color: 0xffb35c });
          b.lamp(f.p(0, 3.4, 0), 0xffb35c, 1.0, 7, 0.5);
        }
      }
    }
    // strings of lights across the compartment
    const cols = rich ? [0xfff1d6, 0xffe6c0, 0xf6f6ff] : [0xffb35c, 0xffc47a, 0xe86a5c, 0x7fc7c0, 0xffd08a];
    for (let s = 0; s < 2; s++) {
      const za = rng.range(-9, -6), zb = rng.range(6, 11);
      fairyLights(b, [c.x0 + 2 + s * (w / 2), ceil - 1, za], [c.x0 + w / 2 + s * (w / 2) - 2, ceil - 2, zb], rich ? 1.0 : 1.8, 8, cols, rng, rich ? 0.45 : 0.35, 0.8);
    }
    if (rich) {
      // a warm under-shelf strip light and the even, generous light it gives
      b.box(w - 2, 0.08, 0.3, [cx, ceil - 0.05, 8], { mat: 'glowSoft', color: 0xffe9c8 });
      for (let x = c.x0 + 5; x < c.x1 - 2; x += 9) b.lamp([x, ceil - 1.5, 6], 0xffeed8, 1.4, 18, 0.9);
      // greenery along the shelf front
      for (let x = c.x0 + 3; x < c.x1 - 2; x += rng.range(3, 6)) b.sphere(rng.range(0.5, 0.9), [x, y + 0.5, 10.5 + rng.range(-0.6, 0.6)], { mat: 'moss', color: 0xffffff, seg: 10 });
    }
    // crowd lanes
    const nw = playable ? 0 : rich ? 5 : 9;
    for (let i = 0; i < nw; i++) {
      const z = rng.range(-5, 10);
      const xa = rng.range(x0 + 3, c.x1 - 3), xb = rng.range(x0 + 3, c.x1 - 3);
      walkers.push({ a: new THREE.Vector3(xa, y, z), b: new THREE.Vector3(xb, y, z + rng.range(-2, 2)), speed: rng.range(0.8, 1.5), standing: rng.chance(0.3) });
    }
    // front lip railing (visual only)
    for (let x = c.x0 + 1; x < c.x1 - 1; x += 2) b.cyl(0.06, 0.06, 0.9, [x, y + 0.45, CABINET.shelfFrontZ - 0.3], { mat: rich ? 'gold' : 'wood', color: rich ? 0xffffff : 0xe6cfa3, seg: 5 });
    // the Crown: a snow-globe palace on the top shelf centre
    if (c.tier === 5 && c.x0 === -CABINET.dividerX) {
      b.cyl(7, 7.5, 1.5, [0, y + 0.75, -2], { mat: 'gold', seg: 40 });
      b.sphere(7, [0, y + 7.5, -2], { mat: 'plasticClear', color: 0xe8f6ff, seg: 32 });
      b.box(4, 6, 4, [0, y + 4.5, -2], { mat: 'plasticGloss', color: 0xf5efe6 });
      for (const [px, pz] of [
        [-2, -4],
        [2, -4],
        [-2, 0],
        [2, 0],
      ])
        b.cyl(0.6, 0.6, 9, [px, y + 6, pz - 0], { mat: 'plasticGloss', color: 0xe8d9b0, seg: 12 });
      b.sphere(0.9, [0, y + 10.5, -2], { mat: 'glow', color: 0xfff1d6 });
      b.lamp([0, y + 9, -2], 0xfff1d6, 2.0, 16, 0.7);
    }
  }
}
