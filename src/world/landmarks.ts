// The big human leftovers that structure the floor: each is built at real scale (1 cm = 0.7 u) with forgiving,
// stepped colliders so every climb uses only walk/jump and the camera never ends up inside them.
import * as THREE from 'three';
import { Rng } from '../core/rng';
import { V3, WorldBuilder } from './builder';
import { Frame } from './frame';
import { quadRect } from '../render/materials';

const remap = (g: THREE.BufferGeometry, r: [number, number, number, number]): THREE.BufferGeometry => {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, r[0] + uv.getX(i) * (r[2] - r[0]), r[1] + uv.getY(i) * (r[3] - r[1]));
  return g;
};

/** A walkable ramp between two points, split into `n` pieces. With `under`, each piece floats that far below its
 * low end so people can walk beneath the high part (pieces never float lower than the floor). */
export function rampCollider(b: WorldBuilder, a: V3, c: V3, width: number, n = 1, under?: number, noCamera = false): void {
  const dx = c[0] - a[0], dz = c[2] - a[2];
  const ang = Math.atan2(-dz, dx);
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const y0 = a[1] + (c[1] - a[1]) * t0, y1 = a[1] + (c[1] - a[1]) * t1;
    const len = Math.hypot(dx, dz) / n;
    const minY = under === undefined ? 0 : Math.max(0, Math.min(y0, y1) - under);
    b.col.add({
      x: a[0] + dx * (t0 + t1) * 0.5,
      z: a[2] + dz * (t0 + t1) * 0.5,
      w: len + 0.02,
      d: width,
      minY: minY < 0.6 ? 0 : minY,
      maxY: Math.max(y0, y1),
      rotY: ang,
      ramp: { axis: 0, y0, y1 },
      noCamera,
    });
  }
}

// ---------------------------------------------------------------- beer bottle
export interface BottleInfo {
  /** world point on the axis at distance s from the base */
  axis(s: number): THREE.Vector3;
  /** outer radius at s */
  radius(s: number): number;
  /** walkable top at s */
  top(s: number): number;
  frame: Frame;
}

/** A fallen 23 cm longneck lying along `dir` from its base, mouth end raised by `rise` per unit length. */
export function beerBottle(b: WorldBuilder, bx: number, bz: number, dir: [number, number], rise: number, rng: Rng): BottleInfo {
  const R = 2.15, NECK = 0.9, L = 16;
  const len = Math.hypot(dir[0], dir[1]);
  const dx = dir[0] / len, dz = dir[1] / len;
  const f = new Frame(bx, R, bz, Math.atan2(-dz, dx));
  const tilt = Math.atan(rise);
  const radius = (s: number): number => {
    if (s < 0.45) return 1.6 + (R - 1.6) * Math.sqrt(Math.max(0, s / 0.45));
    if (s < 9.5) return R;
    if (s < 12) return NECK + (R - NECK) * (1 + Math.cos(((s - 9.5) / 2.5) * Math.PI)) * 0.5;
    if (s < 15.4) return NECK - 0.06 * ((s - 12) / 3.4);
    return 1.0;
  };
  const axis = (s: number) => new THREE.Vector3(...f.p(s * Math.cos(tilt), s * Math.sin(tilt), 0));
  const top = (s: number) => axis(s).y + radius(s);

  // thick glass: outer skin up to the lip, then back down the inside
  const outer: THREE.Vector2[] = [new THREE.Vector2(0.02, 0.32)];
  for (let s = 0; s <= 15.95; s += s < 0.5 ? 0.15 : s > 9 && s < 12.5 ? 0.35 : 0.9) outer.push(new THREE.Vector2(radius(s), s));
  outer.push(new THREE.Vector2(1.02, 15.7), new THREE.Vector2(0.98, 16), new THREE.Vector2(0.62, 16), new THREE.Vector2(0.6, 15.5));
  const inner: THREE.Vector2[] = [];
  for (let s = 15.2; s >= 0.7; s -= s > 9 && s < 12.5 ? 0.35 : 0.9) inner.push(new THREE.Vector2(Math.max(0.55, radius(s) - 0.2), s));
  inner.push(new THREE.Vector2(1.4, 0.55), new THREE.Vector2(0.02, 1.0)); // the punt
  const lathe = new THREE.LatheGeometry(outer.concat(inner), 30);
  lathe.rotateZ(-Math.PI / 2);
  b.add(lathe, f.p(0, 0, 0), { mat: 'amberGlass', rot: f.r(0, 0, tilt), noBake: true });
  // dregs: a dark amber film pooled along the low inside
  const dregs = new THREE.CylinderGeometry(R - 0.25, R - 0.25, 8.6, 20, 1, true, Math.PI * 0.25, Math.PI * 0.5);
  dregs.translate(0, 4.9, 0);
  dregs.rotateZ(-Math.PI / 2);
  b.add(dregs, f.p(0, 0, 0), { mat: 'water', color: 0x8a4a12, rot: f.r(0, 0, tilt), noBake: true });
  // worn paper label on s 3..8, torn open across the top on the glass side
  const lab = new THREE.CylinderGeometry(R + 0.03, R + 0.03, 5, 30, 1, true, Math.PI * 1.62, Math.PI * 1.38);
  remap(lab, quadRect(1));
  lab.translate(0, 5.5, 0);
  lab.rotateZ(-Math.PI / 2);
  b.add(lab, f.p(0, 0, 0), { mat: 'landmark', rot: f.r(0, 0, tilt) });
  // neck foil collar remnant
  const col = new THREE.CylinderGeometry(NECK + 0.04, NECK + 0.04, 1.6, 20, 1, true, 0, Math.PI * 1.7);
  col.translate(0, 13.6, 0);
  col.rotateZ(-Math.PI / 2);
  b.add(col, f.p(0, 0, 0), { mat: 'foil', color: 0xd8c27a, rot: f.r(0, 0, tilt) });

  // colliders: the low body is solid from the floor (with a narrow raised spine on top); the shoulder and neck
  // float so you can walk underneath them
  const seg = 1.8;
  for (let s = 0; s < 10.8; s += seg) {
    const s1 = Math.min(10.8, s + seg), m = (s + s1) / 2;
    const a = axis(m);
    b.col.add({ x: a.x, z: a.z, w: s1 - s, d: radius(m) * 1.8, minY: 0, maxY: a.y, rotY: f.ry });
    // spine 2.0 wide: the glass is only ~0.2 below the crest at its edge, and a narrower one is too easy to drift off
    b.col.add({ x: a.x, z: a.z, w: s1 - s, d: 2.0, minY: 0, maxY: top(s1 > 9.5 ? m : s1), rotY: f.ry });
    // shoulder band: where the glass curves away (lateral 0.7..1.6) — step off the spine onto it, not into the bottle
    b.col.add({ x: a.x, z: a.z, w: s1 - s, d: 3.2, minY: 0, maxY: a.y + radius(m) * 0.67, rotY: f.ry });
  }
  for (let s = 10.8; s < 15.95; s += 1.3) {
    const s1 = Math.min(16, s + 1.3), m = (s + s1) / 2;
    const a = axis(m);
    const r = radius(m);
    b.col.add({ x: a.x, z: a.z, w: s1 - s, d: Math.max(1.2, r * 1.6), minY: Math.max(2.25, a.y - r), maxY: top(m), rotY: f.ry, noCamera: true });
  }
  void rng;
  return { axis, radius, top, frame: f };
}

/** Upright AA battery used as a prop stand. */
export function standingBattery(b: WorldBuilder, x: number, z: number, color: number): void {
  b.cyl(0.5, 0.5, 3.35, [x, 1.675, z], { mat: 'plasticGloss', color, seg: 20, collide: true });
  b.cyl(0.51, 0.51, 0.9, [x, 2.9, z], { mat: 'metal', color: 0xc8c8c8, seg: 20 });
  b.cyl(0.18, 0.18, 0.15, [x, 3.42, z], { mat: 'metal', color: 0xdddddd, seg: 12 });
}

/** Pressed crown cap lying teeth-down, a low step. */
export function crownCap(b: WorldBuilder, x: number, z: number, r: number, color: number, rng: Rng): void {
  const h = r * 0.5;
  const g = new THREE.CylinderGeometry(r * 0.94, r * 1.08, h, 42, 1, true);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getZ(i), pos.getX(i));
    const k = 1 + 0.06 * Math.cos(a * 21);
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i), pos.getZ(i) * k);
  }
  b.add(g, [x, h / 2, z], { mat: 'metal', color: 0xc9c2b2, rot: [0, rng.range(0, 6), 0] });
  b.cyl(r * 0.94, r * 0.94, 0.04, [x, h, z], { mat: 'plasticGloss', color, seg: 32 });
  b.cyl(r * 0.5, r * 0.5, 0.045, [x, h + 0.005, z], { mat: 'matte', color: 0xf0e2b8, seg: 24 });
  b.col.add({ x, z, w: r * 1.8, d: r * 1.8, minY: 0, maxY: h });
}

// ---------------------------------------------------------------- pencil ramp
/** A hexagonal pencil lying from a (top surface height a[1]) up to c; sharpened at the high end. */
export function pencilRamp(b: WorldBuilder, a: V3, c: V3, r: number, color: number, under?: number): void {
  const va = new THREE.Vector3(a[0], a[1] - r, a[2]), vc = new THREE.Vector3(c[0], c[1] - r, c[2]);
  const d = vc.clone().sub(va);
  const len = d.length();
  const body = len - 1.6;
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  const put = (g: THREE.BufferGeometry, along: number, mat: 'painted' | 'wood' | 'matte' | 'metal' | 'rubber', col: number) => {
    g.applyQuaternion(q);
    const p = va.clone().addScaledVector(d, along / len);
    b.add(g, [p.x, p.y, p.z], { mat, color: col });
  };
  put(new THREE.CylinderGeometry(r, r, body - 0.9, 6, 4), (body - 0.9) / 2 + 0.9, 'painted', color);
  put(new THREE.CylinderGeometry(r * 1.02, r * 1.02, 0.5, 12), 0.65, 'metal', 0xc9b26a); // ferrule
  put(new THREE.CylinderGeometry(r * 0.96, r * 0.96, 0.4, 12), 0.2, 'rubber', 0xd88a8a); // eraser
  put(new THREE.CylinderGeometry(0.12, r, 1.3, 6), body + 0.65, 'wood', 0xe6c9a0);
  put(new THREE.CylinderGeometry(0.0, 0.12, 0.3, 6), body + 1.45, 'matte', 0x2a2a2a);
  rampCollider(b, a, c, r * 2.4, under === undefined ? 1 : 4, under);
}

// ---------------------------------------------------------------- foil
/** A crumpled sheet of foil draped as a ridge from a ground point up to a high point (walkable along its crest). */
export function foilRidge(b: WorldBuilder, a: V3, c: V3, width: number, rng: Rng): void {
  const dx = c[0] - a[0], dz = c[2] - a[2];
  const L = Math.hypot(dx, dz);
  const f = new Frame(a[0], 0, a[2], Math.atan2(-dz, dx));
  const g = new THREE.PlaneGeometry(L + 1.2, width, 26, 12);
  g.rotateX(-Math.PI / 2);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + L / 2, z = pos.getZ(i);
    const t = Math.max(0, Math.min(1, x / L));
    const crest = a[1] + (c[1] - a[1]) * t; // linear: the crest is what you walk on
    const across = Math.abs(z) / (width / 2);
    // a sheet slumped over a fold: rounded shoulders, flat hems, crinkles that grow with height
    const h = crest * Math.max(0, 1 - across * across) ** 1.3 + rng.range(-0.1, 0.1) * (0.5 + crest * 0.12);
    pos.setXYZ(i, x + rng.range(-0.1, 0.1), Math.max(0.02, h), z + rng.range(-0.12, 0.12));
  }
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  // dull grey underside showing at the lifted hems (cloned first: b.add transforms its geometry in place)
  const under = flat.clone();
  b.add(flat, f.p(0, 0, 0), { mat: 'foil', color: 0xc4c6ca, rot: f.r() });
  under.scale(1, 0.96, 1);
  under.translate(0, -0.04, 0);
  const idx = under.getAttribute('position');
  void idx;
  b.add(under, f.p(0, 0, 0), { mat: 'metal', color: 0x8d9094, rot: f.r() });
  rampCollider(b, a, c, 1.3, 3);
  // the shoulders of the tent: a wider, lower ramp so you can't walk through the sides
  rampCollider(b, a, [c[0], c[1] * 0.55, c[2]], width * 0.72, 3);
}

/** A foil gutter: a shallow folded channel along the given points carrying a thin stream. */
export function foilGutter(b: WorldBuilder, pts: V3[], width: number, rng: Rng): void {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], c = pts[i + 1];
    const dx = c[0] - a[0], dz = c[2] - a[2];
    const L = Math.hypot(dx, dz);
    const f = new Frame((a[0] + c[0]) / 2, 0, (a[2] + c[2]) / 2, Math.atan2(-dz, dx));
    const g = new THREE.PlaneGeometry(L + 0.3, width, 8, 6);
    g.rotateX(-Math.PI / 2);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) {
      const t = (pos.getX(k) + L / 2) / L;
      const base = a[1] + (c[1] - a[1]) * t;
      const zz = pos.getZ(k) / (width / 2);
      pos.setY(k, base + 0.32 * zz * zz + rng.range(-0.03, 0.03));
    }
    const flat = g.toNonIndexed();
    flat.computeVertexNormals();
    b.add(flat, f.p(0, 0, 0), { mat: 'foil', color: 0xdcdde0, rot: f.r() });
    b.box(L + 0.3, 0.02, width * 0.28, f.p(0, (a[1] + c[1]) / 2 + 0.04, 0), { mat: 'water', rot: f.r(0, 0, Math.atan2(c[1] - a[1], L)), noBake: true });
  }
}

// ---------------------------------------------------------------- candy wrapper
/** Torn candy wrapper along local x: the candy half out of the torn west end, twisted east end. Returns the candy. */
export function candyWrapper(b: WorldBuilder, f: Frame, rng: Rng): THREE.Vector3 {
  const L = 5.2, W = 3.4;
  const g = new THREE.PlaneGeometry(L, W, 26, 14);
  remap(g, quadRect(2));
  g.rotateX(-Math.PI / 2);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const u = (x + L / 2) / L; // 0 torn end .. 1 twisted end
    const pinch = 1 - 0.75 * Math.pow(Math.max(0, (u - 0.75) / 0.25), 1.5);
    const seam = Math.exp(-(((z - W * 0.32) / 0.25) ** 2)) * 0.22; // the folded seam
    const bulge = Math.max(0, 1 - (z / (W / 2)) ** 2) * 0.55 * Math.sin(Math.min(1, u * 1.4) * Math.PI) * (u < 0.15 ? 0.4 : 1);
    const torn = u < 0.03 ? rng.range(-0.25, 0.1) : 0;
    pos.setXYZ(i, x + torn, 0.03 + bulge + seam + rng.range(0, 0.07), z * pinch);
  }
  g.computeVertexNormals();
  b.add(g, f.p(0, 0, 0), { mat: 'landmarkGloss', rot: f.r() });
  // twisted end: a cone whose rings spiral
  const tw = new THREE.ConeGeometry(0.75, 1.9, 12, 8, true);
  const tp = tw.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i), a = (y + 0.95) * 2.4;
    const x = tp.getX(i), z = tp.getZ(i);
    tp.setXYZ(i, x * Math.cos(a) - z * Math.sin(a), y, x * Math.sin(a) + z * Math.cos(a));
  }
  remap(tw, quadRect(2));
  tw.computeVertexNormals();
  b.add(tw, f.p(L / 2 + 0.75, 0.42, 0), { mat: 'landmarkGloss', rot: f.r(0, 0, -Math.PI / 2) });
  b.cyl(0.16, 0.28, 0.9, f.p(L / 2 + 1.9, 0.4, 0.05), { mat: 'landmarkGloss', rot: f.r(0, 0.3, -Math.PI / 2), seg: 8 });
  b.col.add({ x: f.x, z: f.z, w: L, d: W, minY: 0, maxY: 0.32, rotY: f.ry });
  // the candy: a glossy cherry drop, half out of the tear, sitting in a sticky pink smear
  const cp = f.p(-L / 2 - 0.25, 0.62, 0.2);
  b.sphere(1.0, cp, { mat: 'candy', color: 0xd21e34, scale: [1.05, 0.66, 0.85], seg: 20, rot: f.r(0, 0.3, 0.1) });
  b.cyl(1.7, 1.7, 0.02, f.p(-L / 2 - 0.4, 0.012, 0.2), { mat: 'water', color: 0xe07a8a, seg: 22, noBake: true });
  b.col.add({ x: cp[0], z: cp[2], w: 1.9, d: 1.6, minY: 0, maxY: 1.2, rotY: f.ry });
  return new THREE.Vector3(...cp);
}

/** Sugar crystals scattered along a polyline (the ants' road). */
export function sugarTrail(b: WorldBuilder, pts: THREE.Vector3[], n: number, rng: Rng): void {
  for (let i = 0; i < n; i++) {
    const t = Math.pow(rng.next(), 1.8); // dense near the candy (first point)
    const k = Math.min(pts.length - 2, Math.floor(t * (pts.length - 1)));
    const u = t * (pts.length - 1) - k;
    const p = pts[k].clone().lerp(pts[k + 1], u);
    const s = rng.range(0.07, 0.16);
    b.box(s, s, s, [p.x + rng.range(-0.5, 0.5), s / 2 + 0.01, p.z + rng.range(-0.45, 0.45)], { mat: 'plasticClear', color: 0xffffff, rot: [rng.range(0, 1), rng.range(0, 3), rng.range(0, 1)], noBake: true });
  }
}

// ---------------------------------------------------------------- sardine tin
/** Opened sardine tin along local x (7.3 x 5.2 x 1.75): lid rolled onto a key coil at the east end, a pull ring,
 * faded label, oily seams. In over the west rim by a stick ramp; out up the lid tongue and down the pull-tab ramp. */
export function sardineTin(b: WorldBuilder, f: Frame, rng: Rng): { inA: V3; outB: V3 } {
  const L = 7.3, W = 5.2, H = 1.75, t = 0.12, rc = 0.55;
  const tin = 0xc9ccd0, gold = 0xd6b56a;
  b.box(L, 0.1, W, f.p(0, 0.05, 0), { mat: 'metal', color: gold, rot: f.r(), collide: true });
  for (const s of [-1, 1]) {
    b.box(L - 2 * rc, H, t, f.p(0, H / 2, s * (W / 2 - t / 2)), { mat: 'metal', color: tin, rot: f.r() });
    b.box(t, H, W - 2 * rc, f.p(s * (L / 2 - t / 2), H / 2, 0), { mat: 'metal', color: tin, rot: f.r() });
    for (const s2 of [-1, 1]) b.cyl(rc, rc, H, f.p(s * (L / 2 - rc), H / 2, s2 * (W / 2 - rc)), { mat: 'metal', color: tin, seg: 12, open: true });
  }
  // rolled rim + crimped base seam
  for (const s of [-1, 1]) {
    b.rod(f.p(-L / 2 + rc, H, s * W / 2), f.p(L / 2 - rc, H, s * W / 2), 0.08, { mat: 'metal', color: 0xe2e4e6 });
    b.rod(f.p(s * L / 2, H, -W / 2 + rc), f.p(s * L / 2, H, W / 2 - rc), 0.08, { mat: 'metal', color: 0xe2e4e6 });
    b.rod(f.p(-L / 2 + rc, 0.08, s * (W / 2 + 0.02)), f.p(L / 2 - rc, 0.08, s * (W / 2 + 0.02)), 0.07, { mat: 'metal', color: 0x9a9da2 });
  }
  // faded label on both long sides
  for (const s of [-1, 1]) b.quad(L - 1.4, H - 0.45, f.p(0, H / 2, s * (W / 2 + 0.01)), { mat: 'landmark', uvRect: quadRect(0), rot: f.r(0, s > 0 ? 0 : Math.PI, 0) });
  // oily seams inside and a slick of oil, a fish spine left behind
  for (const s of [-1, 1]) b.box(L - 0.9, 0.03, 0.22, f.p(0, 0.115, s * (W / 2 - t - 0.11)), { mat: 'plasticGloss', color: 0x5a4618, rot: f.r(), noBake: true });
  b.cyl(1.4, 1.4, 0.02, f.p(-0.8, 0.11, -0.6), { mat: 'water', color: 0xc9a040, seg: 20, noBake: true });
  b.rod(f.p(-2.4, 0.22, 0.9), f.p(1.4, 0.22, 0.5), 0.05, { mat: 'paper', color: 0xede3c8 });
  for (let k = 0; k < 11; k++) {
    const u = k / 10, x = -2.2 + u * 3.4, z = 0.88 - u * 0.36;
    for (const s of [-1, 1]) b.rod(f.p(x, 0.22, z), f.p(x - 0.15, 0.16, z + s * (0.45 - u * 0.2)), 0.02, { mat: 'paper', color: 0xede3c8 });
  }
  // rim colliders: wide and forgiving (a 0.9 ridge all the way round)
  for (const s of [-1, 1]) {
    b.colliderFor(L, H, 0.9, f.p(0, H / 2, s * (W / 2 - 0.3)), { collide: true, rot: f.r() });
    b.colliderFor(0.9, H, W, f.p(s * (L / 2 - 0.3), H / 2, 0), { collide: true, rot: f.r() });
  }
  // the lid: still attached along the east end, peeled back west-to-east and rolled into a coil on the key
  const coilX = L / 2 - 1.1, CR = 0.6, coilTop = H + 2 * CR;
  b.cyl(CR, CR, W + 0.15, f.p(coilX, H + CR, 0), { mat: 'metal', color: gold, rot: f.r(Math.PI / 2, 0, 0), seg: 20 });
  for (const s of [-1, 1]) {
    b.cyl(CR * 0.7, CR * 0.7, 0.04, f.p(coilX, H + CR, s * (W / 2 + 0.09)), { mat: 'metal', color: 0x9a8a5a, rot: f.r(Math.PI / 2, 0, 0), seg: 16 });
    b.cyl(0.18, 0.18, 0.05, f.p(coilX, H + CR, s * (W / 2 + 0.1)), { mat: 'matte', color: 0x2a241a, rot: f.r(Math.PI / 2, 0, 0), seg: 10 });
  }
  b.colliderFor(2 * CR, 2 * CR, W, f.p(coilX, H + CR, 0), { collide: true, rot: f.r() });
  // the lid tongue: a curled strip from the inside floor up onto the coil (porters' ramp, slope ~0.67)
  const tz = -1.25, tx0 = -2.3, tx1 = coilX - CR;
  const tongueA: V3 = f.p(tx0, 0.12, tz), tongueC: V3 = f.p(tx1, coilTop, tz);
  b.box(Math.hypot(tx1 - tx0, coilTop - 0.12) + 0.2, 0.06, 1.2, f.p((tx0 + tx1) / 2, (coilTop + 0.12) / 2, tz), { mat: 'metal', color: gold, rot: f.r(0, 0, Math.atan2(coilTop - 0.12, tx1 - tx0)) });
  rampCollider(b, tongueA, tongueC, 1.2, 3);
  // the pull ring stands up off the coil's south end; its bent tab is the ramp down outside
  b.add(new THREE.TorusGeometry(0.55, 0.09, 8, 24), f.p(coilX + 0.3, coilTop - 0.2, W / 2 + 0.35), { mat: 'metal', color: 0xd9dcdf, rot: f.r(0.4, 0.2, 0) });
  const ox0 = coilX + CR, ox1 = L / 2 + 3.9;
  const outA: V3 = f.p(ox0, coilTop, 0), outB: V3 = f.p(ox1, 0, 0);
  b.box(Math.hypot(ox1 - ox0, coilTop) + 0.2, 0.07, 1.3, f.p((ox0 + ox1) / 2, coilTop / 2, 0), { mat: 'metal', color: 0xd9dcdf, rot: f.r(0, 0, -Math.atan2(coilTop, ox1 - ox0)) });
  rampCollider(b, outA, outB, 1.3, 3);
  // in: a lolly stick laid against the west rim, then crumb steps down inside
  const inA: V3 = f.p(-L / 2 - 2.8, 0, 0), inC: V3 = f.p(-L / 2 + 0.2, H + 0.05, 0);
  b.box(Math.hypot(3.0, H) + 0.3, 0.14, 1.1, f.p(-L / 2 - 1.3, H / 2, 0), { mat: 'wood', color: 0xe3c995, rot: f.r(0, 0, Math.atan2(H, 3.0)) });
  rampCollider(b, inA, inC, 1.2, 2);
  for (const [k, h] of [[0, 1.25], [1, 0.8], [2, 0.4]] as const) {
    const p = f.p(-L / 2 + 1.05 + k * 0.85, h / 2, 0);
    b.box(0.85, h, 1.2, p, { mat: 'crumb', color: 0xd9a35c, rot: f.r(0, rng.range(-0.1, 0.1), 0), collide: true });
  }
  return { inA, outB };
}

// ---------------------------------------------------------------- the door hinge
/** Butt hinge on a vertical edge: leaf A on a face pointing +x, leaf B on the door's inner face (pointing -z). */
export function doorHinge(b: WorldBuilder, kx: number, kz: number, y0: number, y1: number, side: 1 | -1): void {
  const h = y1 - y0, ym = (y0 + y1) / 2;
  const brass = 0xc7a259;
  // knuckle: five barrels with a pin cap
  for (let k = 0; k < 5; k++) b.cyl(0.3, 0.3, h / 5 - 0.04, [kx, y0 + (k + 0.5) * (h / 5), kz], { mat: 'brass', color: brass, seg: 16 });
  b.cyl(0.33, 0.33, 0.12, [kx, y1 + 0.06, kz], { mat: 'brass', color: brass, seg: 16 });
  b.sphere(0.2, [kx, y1 + 0.16, kz], { mat: 'brass', color: brass, scale: [1, 0.6, 1], seg: 10 });
  // leaf A on the pilaster face, leaf B on the door
  b.box(0.06, h, 1.4, [kx - side * 0.03, ym, kz - 0.75], { mat: 'brass', color: brass, collide: 'noCamera' });
  b.box(1.4, h, 0.06, [kx + side * 0.75, ym, kz + 0.03], { mat: 'brass', color: brass });
  for (const y of [y0 + h * 0.16, ym, y1 - h * 0.16]) {
    const screw = (p: V3, rot: V3, slot: V3) => {
      b.cyl(0.35, 0.33, 0.12, p, { mat: 'brass', color: 0xb8924a, rot, seg: 18 });
      b.box(0.62, 0.07, 0.07, slot, { mat: 'matte', color: 0x3a2c18, rot: [rot[0], rot[1], rot[2] + 0.6], noBake: true });
    };
    screw([kx + side * 0.06, y, kz - 0.8], [0, 0, Math.PI / 2], [kx + side * 0.13, y, kz - 0.8]);
    screw([kx + side * 0.8, y, kz - 0.06], [Math.PI / 2, 0, 0], [kx + side * 0.8, y, kz - 0.13]);
  }
}

// ---------------------------------------------------------------- dirt
/** Dust drift: soft grey felt lumps banked along a line. */
export function dustDrift(b: WorldBuilder, x0: number, x1: number, z: number, depth: number, rng: Rng, y = 0): void {
  for (let x = x0; x < x1; x += rng.range(0.4, 0.9)) {
    const s = rng.range(0.25, 0.75);
    b.sphere(s, [x, y + 0.02, z + rng.range(-depth / 2, depth / 2)], { mat: 'fabric', color: rng.pick([0x6e6a62, 0x77726a, 0x5f5b55, 0x847f75]), scale: [1.2, rng.range(0.22, 0.4), 0.9], seg: 7 });
    if (rng.chance(0.18)) b.rod([x, y + 0.15, z], [x + rng.range(-1, 1), y + rng.range(0.2, 0.5), z + rng.range(-1, 1)], 0.012, { mat: 'thread', color: 0xcfc8bb });
  }
}
/** Grit packed into a floor joint. */
export function gritLine(b: WorldBuilder, a: V3, c: V3, n: number, rng: Rng): void {
  for (let i = 0; i < n; i++) {
    const t = rng.next();
    const s = rng.range(0.04, 0.12);
    b.box(s, s * 0.6, s, [a[0] + (c[0] - a[0]) * t + rng.range(-0.08, 0.08), a[1] + s * 0.3, a[2] + (c[2] - a[2]) * t + rng.range(-0.08, 0.08)], { mat: 'crumb', color: rng.pick([0x3a2c1c, 0x4a3a28, 0x2c2218]), rot: [0, rng.range(0, 3), 0], noBake: true });
  }
}
/** Lint fibres: tangled loose threads lying on the floor. */
export function lintFibres(b: WorldBuilder, x0: number, x1: number, z0: number, z1: number, n: number, rng: Rng): void {
  for (let i = 0; i < n; i++) {
    const x = rng.range(x0, x1), z = rng.range(z0, z1);
    const col = rng.pick([0xd8d0c4, 0xc4ccd8, 0xe8e2d6, 0x9aa4b8]);
    let p: V3 = [x, 0.04, z];
    let a = rng.range(0, 6.28);
    for (let k = 0; k < 4; k++) {
      a += rng.range(-0.9, 0.9);
      const q: V3 = [p[0] + Math.cos(a) * 0.6, 0.04 + rng.range(0, 0.06), p[2] + Math.sin(a) * 0.6];
      b.rod(p, q, 0.016, { mat: 'thread', color: col, noBake: true });
      p = q;
    }
  }
}
/** Sticky crumbs scattered round a point. */
export function crumbs(b: WorldBuilder, x: number, z: number, r: number, n: number, rng: Rng): void {
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, 6.28), d = Math.sqrt(rng.next()) * r, s = rng.range(0.08, 0.26);
    b.box(s, s * 0.7, s * 0.9, [x + Math.cos(a) * d, s * 0.35, z + Math.sin(a) * d], { mat: 'crumb', color: rng.pick([0xd9a860, 0xc89048, 0xe4bc7a]), rot: [rng.range(0, 1), rng.range(0, 3), 0], noBake: true });
  }
}
/** A pale worn strip on the floor where feet have polished it. */
export function wornPath(b: WorldBuilder, pts: [number, number][], width: number): void {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [cx, cz] = pts[i + 1];
    const L = Math.hypot(cx - ax, cz - az);
    b.quad(L + width * 0.6, width, [(ax + cx) / 2, 0.022 + i * 0.0005, (az + cz) / 2], { mat: 'matte', color: 0xe9dcc2, rot: [-Math.PI / 2, Math.atan2(-(cz - az), cx - ax), 0], noBake: true });
  }
}
