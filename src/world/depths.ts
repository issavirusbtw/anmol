// THE DEPTHS — the cabinet floor. Also the art benchmark passage ("Drip Row").
import * as THREE from 'three';
import { Rng } from '../core/rng';
import { WorldBuilder } from './builder';
import { Frame } from './frame';
import { WorldData } from './worldData';
import { PAL, awning, bottleCap, crate, fairyLights, hangingLamp, litter, paperSheet, railing, signBoard, spool, stairs, tape, toothpick, battery, threadWrap, button } from './props';
import { apartmentStack, buildLift, matchboxHome, scrapHeap, stall, waterPoint } from './structures';
import { TIER_Y } from '../config';
import { buildFarm } from './farm';
import { beerBottle, candyWrapper, crownCap, crumbs, dustDrift, foilGutter, foilRidge, gritLine, lintFibres, pencilRamp, sardineTin, standingBattery, sugarTrail } from './landmarks';

export const DEPTHS_CEIL = TIER_Y[1] - 1.3;

export function buildDepths(b: WorldBuilder, wd: WorldData, rng0: Rng): void {
  b.chunk = 'depths';
  const rng = rng0.fork('depths');
  const F = new Frame(0, 0, 0);

  // ---------- ground surfaces ----------
  paperSheet(b, F, -8, -1.2, 0.01, 30, 6.5, rng, 0xb8a990);
  paperSheet(b, F, 8, -0.8, 0.015, 22, 5.5, rng, 0xa89c88);
  b.box(44, 0.06, 4, [0, 0.03, -12], { mat: 'cardboard', color: 0xa8865e });
  litter(b, F, -21, -4, 21, 13, 140, rng);

  // ---------- boundary barricades (junk walls) ----------
  for (const s of [-1, 1]) {
    const x = s * 22.4;
    for (let z = -13; z < 13; z += 2.6) {
      if (s < 0 && z > -10 && z < 1) continue; // keep the stairs clear
      if (s < 0 && z > 4.5 && z < 10) continue; // keep the Sump gate clear
      if (s > 0 && z > -2 && z < 5) continue; // the sardine tin goes through here
      const h = rng.range(2, 4.5);
      crate(b, F, x + rng.range(-0.3, 0.3), z, 0, 1.6, h, 2.4, rng, { open: false });
      if (rng.chance(0.5)) crate(b, F, x, z + 0.4, h, 1.4, rng.range(1, 2.2), 1.8, rng, { open: true });
    }
  }
  // east wall: open only through the sardine tin (its rims close the gap) into the Lint Flats farm yard
  b.col.add({ x: 22.6, z: -8.25, w: 1.4, d: 13.5, minY: 0, maxY: DEPTHS_CEIL, tag: 'bound' });
  b.col.add({ x: 22.6, z: 9.45, w: 1.4, d: 11.1, minY: 0, maxY: DEPTHS_CEIL, tag: 'bound' });
  sardineTin(b, new Frame(23.4, 0, 1.2), rng.fork('tin'));
  // farm yard limits: the Lint Flats back stack and a fence line at x 44 (the wild half beyond is scenery)
  b.col.add({ x: 33.3, z: -11.5, w: 21.4, d: 5, minY: 0, maxY: DEPTHS_CEIL, tag: 'bound' });
  b.col.add({ x: 44.2, z: 0, w: 0.6, d: 30, minY: 0, maxY: DEPTHS_CEIL, tag: 'bound' });
  buildFarm(b, rng.fork('farm'));
  // west wall has a gate to the Sump Ward at z 6.5..9, barred until Ines's lift job
  b.col.add({ x: -22.6, z: -4.25, w: 1.4, d: 21.5, minY: 0, maxY: DEPTHS_CEIL, tag: 'bound' });
  b.col.add({ x: -22.6, z: 12, w: 1.4, d: 6, minY: 0, maxY: DEPTHS_CEIL, tag: 'bound' });
  wd.barriers.set('sumpGate', [b.col.add({ x: -22.6, z: 7.75, w: 1.4, d: 2.5, minY: 0, maxY: DEPTHS_CEIL, tag: 'sumpGate' })]);
  b.beginGroup('sumpGateBlock');
  crate(b, F, -22.4, 7.0, 0, 1.4, 2.4, 1.2, rng, { open: false });
  crate(b, F, -22.4, 8.4, 0, 1.4, 1.8, 1.2, rng, { open: false });
  b.box(0.05, 1.0, 2.6, [-21.6, 1.4, 7.75], { mat: 'sign', uvRect: b.mats.signRect('noEntry'), rot: [0, Math.PI / 2, 0] });
  // ruler crossbar lashed across the crates, tick marks every 0.2
  b.box(0.07, 0.4, 3.6, [-21.62, 2.2, 7.75], { mat: 'painted', color: 0xe3c552 });
  for (let k = 0; k <= 17; k++) b.box(0.02, k % 5 === 0 ? 0.2 : 0.11, 0.03, [-21.57, 2.2 + (k % 5 === 0 ? 0.1 : 0.145), 6.05 + k * 0.2], { mat: 'matte', color: 0x2a2418, noBake: true });
  for (const z of [6.7, 8.8]) {
    b.cyl(0.19, 0.19, 0.07, [-21.58, 2.2, z], { mat: 'metal', color: 0xb8bcc2, rot: [0, 0, Math.PI / 2], seg: 12 });
    threadWrap(b, F, -21.6, 2.2, z, 0.12, 0xc0392b);
  }
  wd.groups.set('sumpGateBlock', b.endGroup([0, 0, 0]));

  // ---------- back cliff of apartments ----------
  apartmentStack(b, new Frame(-11, 2.9, -11), rng.fork('stackL'), 22, 6, 5, { wealth: 0, lit: 0.55 });
  apartmentStack(b, new Frame(11, 0, -12.5), rng.fork('stackR'), 22, 3, 6, { wealth: 0, lit: 0.5 });
  b.col.add({ x: -11, z: -11, w: 22, d: 6, minY: 2.9, maxY: DEPTHS_CEIL, tag: 'stack' });
  b.col.add({ x: 11, z: -12.6, w: 22, d: 2.8, minY: 0, maxY: DEPTHS_CEIL, tag: 'stack' });

  // ---------- row of matchbox homes ----------
  const homes: { x: number; name: string; label: number; paint: number | null; lit: boolean }[] = [
    { x: -17.8, name: 'mara', label: 0, paint: 0x3f6e8c, lit: true },
    { x: -12.0, name: 'juno', label: 2, paint: null, lit: true },
    { x: -7.8, name: 'player', label: 1, paint: 0xb5523b, lit: false },
    { x: -2.0, name: 'tamsin', label: 3, paint: 0x5d7f4a, lit: true },
  ];
  for (const h of homes) {
    const f = new Frame(h.x, 0, -7.5);
    matchboxHome(b, f, rng.fork(h.name), { label: h.label, paint: h.paint, lit: h.lit, enterable: true, tag: `home-${h.name}`, window: true });
  }
  // the player's home interior: two states (broken / repaired), toggled by the repair quest
  const pf = new Frame(-7.8, 0, -7.5);
  b.beginGroup('homeBroken');
  b.box(2.2, 0.3, 1.4, pf.p(0.6, 0.23, -1.9), { mat: 'rubber', color: 0xd9c25a }); // torn sponge
  b.box(0.9, 0.3, 1.2, pf.p(-0.8, 0.23, -2.2), { mat: 'rubber', color: 0xcfb650, rot: pf.r(0, 0.6, 0.2) });
  for (let k = 0; k < 5; k++) b.quad(0.6, 0.5, pf.p(rng.range(-1.5, 1.5), 0.1 + k * 0.002, rng.range(-2.5, 1.5)), { mat: 'paper', rot: pf.r(-Math.PI / 2, rng.range(0, 6), 0) });
  b.box(1.2, 0.05, 0.8, pf.p(-1.3, 2.88, 0.8), { mat: 'cardboard', color: 0x2a2018 }); // hole patch missing look
  b.endGroup([0, 0, 0]);
  b.beginGroup('homeFixed');
  b.box(2.6, 0.35, 1.6, pf.p(0.4, 0.26, -2.0), { mat: 'rubber', color: 0xe3cc62 });
  b.box(2.5, 0.08, 1.5, pf.p(0.45, 0.48, -1.95), { mat: 'fabric', color: 0x9b3b3b });
  b.sphere(0.4, pf.p(-0.55, 0.62, -2.3), { mat: 'fabric', color: 0xf3efe6, scale: [1.3, 0.6, 0.9] });
  b.box(1.6, 0.03, 1.2, pf.p(-0.4, 0.09, 0.6), { mat: 'fabric', color: 0x3f6e8c });
  spool(b, pf, 1.3, 0.8, 0.08, 0.45, 0.9, 0x6a994e, false);
  bottleCap(b, pf, 1.3, 0.98, 0.8, 0.35, 0xb03a2e, { flip: true });
  b.sphere(0.12, pf.p(1.3, 1.25, 0.8), { mat: 'glow', color: 0xffc070 });
  b.box(1.2, 0.04, 0.8, pf.p(-1.3, 2.86, 0.8), { mat: 'tape', color: 0xffffff });
  b.endGroup([0, 0, 0]);
  wd.groups.set('homeBroken', b.scene.getObjectByName('homeBroken')!);
  wd.groups.set('homeFixed', b.scene.getObjectByName('homeFixed')!);
  b.lamp(pf.p(1.3, 1.6, 0.8), 0xffb46a, 1.0, 5, 0, 'home-player-fixed');
  // home upgrade tiers, each a visible set piece toggled when built
  b.beginGroup('homeTier1'); // stash tin: a mint tin with a printed lid
  b.box(1.2, 0.45, 0.75, pf.p(-1.35, 0.3, -2.25), { mat: 'metal', color: 0x7fb7a4 });
  b.quad(1.0, 0.55, pf.p(-1.35, 0.53, -2.25), { mat: 'label', uvRect: [0.5, 0, 1, 0.5], rot: pf.r(-Math.PI / 2, 0, 0) });
  wd.groups.set('homeTier1', b.endGroup([0, 0, 0]));
  b.beginGroup('homeTier2'); // tealight stove with a bottle-cap pot
  b.cyl(0.5, 0.5, 0.32, pf.p(-1.4, 0.16, 1.7), { mat: 'metal', color: 0xd0d0d0, seg: 18 });
  b.sphere(0.09, pf.p(-1.4, 0.42, 1.7), { mat: 'glow', color: 0xffa040, scale: [1, 1.8, 1] });
  bottleCap(b, pf, -1.4, 0.62, 1.7, 0.42, 0x7a7f86, { flip: true });
  wd.groups.set('homeTier2', b.endGroup([0, 0, 0]));
  b.lamp(pf.p(-1.4, 0.7, 1.7), 0xff8a30, 0.9, 4, 0, 'home-stove');
  b.beginGroup('homeTier3'); // drip barrel: a thimble under a thread line from the roof seam
  b.cyl(0.42, 0.48, 0.85, pf.p(1.45, 0.43, 1.9), { mat: 'metal', color: 0xc9c2b2, seg: 16 });
  b.cyl(0.38, 0.38, 0.03, pf.p(1.45, 0.82, 1.9), { mat: 'water', seg: 16 });
  b.rod(pf.p(1.45, 2.85, 1.9), pf.p(1.45, 0.9, 1.9), 0.015, { mat: 'thread', color: 0xe8e8ec });
  wd.groups.set('homeTier3', b.endGroup([0, 0, 0]));
  b.beginGroup('homeTier4'); // fang wall: a card board of mounted hopper fangs
  b.box(2.2, 0.9, 0.05, pf.p(-0.3, 1.95, -2.86), { mat: 'cardboard', color: 0x8a6a4a });
  for (let k = 0; k < 7; k++) b.cyl(0, 0.07, 0.35, pf.p(-1.2 + k * 0.3, 1.95, -2.8), { mat: 'plasticGloss', color: 0xf2efe6, rot: pf.r(Math.PI / 2, 0, 0), seg: 6 });
  wd.groups.set('homeTier4', b.endGroup([0, 0, 0]));

  // roof gallery: planks over the alleys, railing, stairs + landing
  for (const ax of [-14.9, -4.9]) {
    for (let k = 0; k < 6; k++) b.box(2.2, 0.09, 0.56, [ax + rng.range(-0.05, 0.05), 2.95, -7.8 + k * 0.6], { mat: 'wood', color: rng.pick([0xe5c995, 0xdcbd85]), rot: [0, rng.range(-0.04, 0.04), 0] });
    b.col.add({ x: ax, z: -6.3, w: 2.2, d: 3.6, minY: 2.8, maxY: 2.99, tag: 'plank' });
  }
  b.box(2.1, 0.15, 3.5, [-20.95, 2.825, -6.25], { mat: 'wood', color: 0xd9b98a, collide: true });
  for (const x of [-21.8, -20.1]) toothpick(b, F, x, -6.25, 0, 2.8, { wrapColor: 0xc0392b, collide: true });
  stairs(b, new Frame(-21, 0, -0.6, Math.PI), 0, 0, 0, 1.4, 3.9, 2.9, 'wood', true);
  railing(b, [-19.9, 2.9, -4.4], [0.1, 2.9, -4.4], rng);
  railing(b, [0.1, 2.9, -4.4], [0.1, 2.9, -8.0], rng);
  // gallery life: laundry, tea pot, chairs
  b.rod([-16, 5.2, -8.2], [-9, 5.0, -8.2], 0.015, { mat: 'thread', color: 0xe8e0d0 });
  for (let k = 0; k < 5; k++) b.box(0.5, 0.65, 0.02, [-15.2 + k * 1.4, 4.75, -8.2], { mat: 'fabric', color: rng.pick(PAL.thread), rot: [0, 0, rng.range(-0.08, 0.08)] });
  signBoard(b, F, 'tea', -2.2, 4.2, -8.0, 1.8, [0, 0, 0.04], 'card');
  bottleCap(b, F, -3, 2.9, -6.5, 0.5, 0x2e6a8a, { flip: true });
  b.cyl(0.25, 0.3, 0.45, [-3, 3.2, -6.5], { mat: 'metal', color: 0xb9b3a6, seg: 12 });
  wd.steam.push(new THREE.Vector3(-3, 3.6, -6.5));
  signBoard(b, F, 'dripRow', -20.95, 4.4, -4.4, 2.2, [0, 0, -0.05], 'plank');

  // ---------- The Common Table kitchen ----------
  const kf = new Frame(7.5, 0, -7);
  // big jar-lid roof on pencil-thick dowel posts
  for (const [px, pz] of [
    [-4.4, -2.8],
    [4.4, -2.8],
    [-4.4, 2.8],
    [4.4, 2.8],
  ]) {
    b.cyl(0.18, 0.18, 4.6, kf.p(px, 2.3, pz), { mat: 'wood', color: 0xd6b47e, seg: 8, collide: true });
    threadWrap(b, kf, px, 4.2, pz, 0.18, 0xc0392b);
    tape(b, kf, px, 4.45, pz + 0.2, 0.4, 0.3);
  }
  const lid = new THREE.CylinderGeometry(5.6, 5.6, 0.9, 48, 1, true);
  b.add(lid, kf.p(0, 5.0, 0), { mat: 'metal', color: 0xc9a24a, rot: kf.r(Math.PI, 0, 0) }, [1, 1, 0.72]);
  b.cyl(5.55, 5.55, 0.08, kf.p(0, 5.42, 0), { mat: 'painted', color: 0xe8d9b0, seg: 48 });
  b.box(11.4, 0.06, 0.06, kf.p(0, 4.62, 3.1), { mat: 'brass', color: 0xffffff });
  signBoard(b, kf, 'commonTable', 0, 4.1, 3.9, 3.4, [0.08, 0, 0], 'card');
  // long table of popsicle sticks on spools, matchbox benches
  for (let k = 0; k < 6; k++) b.box(1.1, 0.09, 2.0, kf.p(-3.0 + k * 1.15, 1.05, 1.2), { mat: 'wood', color: rng.pick([0xe5c995, 0xdcbd85, 0xe9d2a3]) });
  for (const x of [-2.6, 2.6]) spool(b, kf, x, 1.2, 0, 0.45, 1.0, rng.pick(PAL.thread), false);
  b.colliderFor(7, 1.1, 2, kf.p(0, 0.55, 1.2), { collide: true });
  for (const z of [-0.2, 2.6]) {
    b.box(6.6, 0.5, 0.6, kf.p(0, 0.25, z), { mat: 'painted', color: rng.pick(PAL.paint), collide: true });
  }
  // bowls and crumbs on the table
  for (let k = 0; k < 5; k++) {
    bottleCap(b, kf, -2.5 + k * 1.25, 1.1, 1.2 + rng.range(-0.4, 0.4), 0.32, rng.pick([0xc0392b, 0x2e86ab, 0xe1b12c, 0x666666]), { flip: true });
    b.sphere(0.14, kf.p(-2.5 + k * 1.25, 1.32, 1.2), { mat: 'crumb', color: 0xd9a35c, seg: 7 });
  }
  // stove: tealight with a bottle-cap pot, steam
  const sx = 3.2, sz = -1.9;
  b.cyl(0.95, 0.95, 0.75, kf.p(sx, 0.375, sz), { mat: 'metal', color: 0xd0d0d0, seg: 24, collide: true });
  b.cyl(0.88, 0.88, 0.05, kf.p(sx, 0.72, sz), { mat: 'matte', color: 0xf2efe6, seg: 24 });
  b.sphere(0.13, kf.p(sx, 0.92, sz), { mat: 'glow', color: 0xffa040, scale: [1, 1.8, 1] });
  for (const a of [0, 2.1, 4.2]) b.rod(kf.p(sx + Math.cos(a) * 0.9, 0.75, sz + Math.sin(a) * 0.9), kf.p(sx + Math.cos(a) * 0.7, 1.4, sz + Math.sin(a) * 0.7), 0.05, { mat: 'metal', color: 0x777777 });
  bottleCap(b, kf, sx, 1.35, sz, 0.85, 0x7a7f86, { flip: true });
  b.cyl(0.75, 0.75, 0.04, kf.p(sx, 1.7, sz), { mat: 'crumb', color: 0xc99a4a, seg: 20 });
  b.lamp(kf.p(sx, 1.1, sz), 0xff8a30, 1.6, 6, 0.8, 'stove', 0.5);
  wd.steam.push(new THREE.Vector3(...kf.p(sx, 1.9, sz)));
  // pantry crates and a sack (folded fabric) at the back
  crate(b, kf, -3.2, -2.2, 0, 1.4, 1.1, 1.2, rng, { contents: 0xd9a35c, collide: true });
  crate(b, kf, -1.6, -2.4, 0, 1.2, 0.9, 1.0, rng, { contents: 0xb57a3a, collide: true });
  b.sphere(0.7, kf.p(0, 0.55, -2.4), { mat: 'fabric', color: 0xcbb38a, scale: [1, 0.8, 0.8] });
  hangingLamp(b, kf.p(-2, 4.6, 0.6), 1.2, 0xffb055, 'foil', 2.6, 11, 'kitchen');
  hangingLamp(b, kf.p(2.4, 4.6, 0.8), 1.0, 0xffb055, 'cap', 2.2, 9, 'kitchen');

  // ---------- the lift up to Threadmarket (broken at the start) ----------
  const lift = buildLift(b, wd, 'depths', 18, -6.5, 0, TIER_Y[1], rng, { working: false, doorZ: 1 });
  void lift;
  battery(b, F, 20.4, 0, -10.6, 0, 0xc0392b);
  battery(b, F, 19.2, 0, -10.6, 0, 0x2e86ab);
  b.sag([20.4, 1.0, -8.8], [19.6, 3.5, -7.8], 0.3, 0.04, { mat: 'thread', color: 0xb03a2e });
  signBoard(b, F, 'lift', 18, 3.7, -4.6, 2.6, [0, 0, 0], 'card');
  hangingLamp(b, [15.6, DEPTHS_CEIL, -4.4], 13.4, 0xfff0d0, 'cap', 1.6, 8);

  // ---------- south side: the Spill (scavenging) ----------
  const spillHeaps: [number, number][] = [
    [-19.2, 5.2],
    [-15.6, 4.4],
    [-19.8, 9.8],
    [-15.8, 10.8],
    [-13.2, 7.6],
  ];
  spillHeaps.forEach(([x, z], i) => {
    scrapHeap(b, F, x, z, 1.3, rng.fork(`heap${i}`));
    wd.hot(`heap${i}`, 'scavenge', [x, 0, z], 2.2, { loot: i % 2 ? ['scrap', 'fabric'] : ['scrap', 'metal', 'electronics'] });
  });
  // the gutter yard: a fallen longneck across the Spill, its mouth propped on a battery; walk under the neck,
  // or climb the crown cap -> pencil -> spine. Foil crumpled against its base carries the drip's overflow.
  beerBottle(b, -2.6, 12.5, [-0.9, -0.44], 0.145, rng.fork('bottle'));
  standingBattery(b, -16.55, 5.7, 0x2e2e2e);
  crownCap(b, -20.8, 11.8, 0.9, 0xc0392b, rng);
  pencilRamp(b, [-21.5, 0.95, 12.6], [-10.6, 5.4, 9.0], 0.5, 0xe1b12c, 1.05);
  foilRidge(b, [-3, 0, 5], [-3.41, 4.47, 11.43], 3.6, rng.fork('foil'));
  foilGutter(b, [[-4.6, 0.06, 7.6], [-1.1, 0.04, 8.6], [-1.1, 0.03, 13.6]], 0.9, rng);
  // branch straw: carries the drip east along the glass toward the Lint Flats farm
  b.rod([-1.1, 0.22, 13.8], [21.2, 0.22, 13.8], 0.21, { mat: 'plasticGloss', color: 0xf4f4f4, seg: 12 });
  for (let x = 0.2; x < 21; x += 1.6) b.cyl(0.215, 0.215, 0.3, [x, 0.22, 13.8], { mat: 'plasticGloss', color: 0xc0392b, rot: [0, 0, Math.PI / 2], seg: 12 });
  b.col.add({ x: 10.05, z: 13.8, w: 22.3, d: 0.45, minY: 0, maxY: 0.43 });
  // a giant's teaspoon leaning against the west junk wall (no collider)
  {
    const th = 0.354;
    b.box(0.12, 4.9, 0.55, [-21.15, 3.7, 13.7], { mat: 'brass', color: 0xe4e6ea, rot: [0, 0, th] });
    b.sphere(0.36, [-22.0, 6.1, 13.7], { mat: 'brass', color: 0xe4e6ea, scale: [0.4, 1.0, 1.5], rot: [0, 0, th], seg: 10 });
    b.sphere(1.1, [-19.9, 1.25, 13.7], { mat: 'brass', color: 0xf0f1f4, scale: [1.15, 0.42, 0.8], rot: [0, 0, th - 0.1], seg: 16 });
  }
  // dirt where it collects: grit in the floor joint, lint under the door rail, a polished track on the daily route
  b.box(43, 0.012, 0.07, [0, 0.012, 9.2], { mat: 'matte', color: 0x4a3a28, noBake: true });
  gritLine(b, [-21, 0, 9.2], [21, 0, 9.2], 140, rng);
  lintFibres(b, -21, 21, 14.0, 14.45, 46, rng);
  dustDrift(b, -21.2, 21.2, 14.3, 0.4, rng);

  // ---------- the Backs: the midden behind the homes, kept by the ants ----------
  const candy = candyWrapper(b, new Frame(-5.2, 0, -12.2), rng.fork('wrapper'));
  sugarTrail(b, [new THREE.Vector3(candy.x - 0.9, 0, candy.z), new THREE.Vector3(-10.5, 0, -12.6), new THREE.Vector3(-12.5, 0, -13.1)], 70, rng);
  dustDrift(b, -21.4, -0.4, -13.8, 0.4, rng);
  crumbs(b, -11, -12.4, 1.6, 18, rng);
  b.sphere(0.45, [-19.5, 0.05, -13.85], { mat: 'crumb', color: 0x4a3a28, scale: [1.4, 0.35, 0.8], seg: 9, noBake: true }); // nest mound at the seam
  wd.ants.push({
    trail: [new THREE.Vector3(-19.5, 0, -13.75), new THREE.Vector3(-17, 0, -13.3), new THREE.Vector3(-14, 0, -13.45), new THREE.Vector3(-11.5, 0, -13.1), new THREE.Vector3(candy.x - 1.05, 0, candy.z - 0.1)],
    count: 40,
  });
  signBoard(b, F, 'spill', -17, 2.4, 2.4, 2.2, [0, 0.2, 0], 'plank');
  toothpick(b, F, -17.9, 2.3, 0, 2.0);
  toothpick(b, F, -16.1, 2.3, 0, 2.0);

  // ---------- water point ----------
  waterPoint(b, wd, F, -6, 6.4, DEPTHS_CEIL, rng);
  wd.hot('water-depths', 'water', [-6, 0, 6.4], 2.4, { name: 'the drip' });
  signBoard(b, F, 'water', -6, 2.6, 4.9, 1.6, [0, 0, 0.05], 'card');
  signBoard(b, F, 'mind', -4.4, 1.2, 7.6, 1.2, [0, -0.8, 0], 'card');

  // ---------- Pell's Pantry (food stall) ----------
  const pellPos = stall(b, new Frame(1.6, 0, 6.8, Math.PI), rng.fork('pell'), 'crumbs', 'pells', 3.6, 2.4, 3);
  wd.hot('vendor-pell', 'vendor', pellPos, 2.0, { vendor: 'pell' });

  // ---------- Salvage Union workshop ----------
  const wf = new Frame(14, 0, 9);
  b.box(12, 4.5, 0.15, wf.p(0, 2.25, 3.2), { mat: 'corrugated', color: 0xb48a5c, collide: true });
  for (const s of [-1, 1]) b.box(0.15, 4.5, 7, wf.p(s * 6, 2.25, -0.3), { mat: 'corrugated', color: 0xb48a5c, rot: wf.r(), collide: true });
  b.box(12.6, 0.12, 8, wf.p(0, 4.9, -0.2), { mat: 'cardboard', color: 0xa8845a, rot: wf.r(-0.12, 0, 0) });
  b.box(12.6, 0.14, 0.12, wf.p(0, 4.42, -4.15), { mat: 'corrugated', color: 0xa8845a });
  for (const x of [-5.6, 5.6]) toothpick(b, wf, x, -3.8, 0, 4.3, { wrapColor: 0xe1b12c, collide: true });
  // workbench: eraser top on matchbox legs, tools
  b.box(8, 0.35, 1.6, wf.p(0, 1.15, 2.2), { mat: 'rubber', color: 0xe08f8f, collide: true });
  for (const x of [-3.4, 3.4]) b.box(1.2, 0.98, 1.4, wf.p(x, 0.49, 2.2), { mat: 'painted', color: 0x3f6e8c });
  b.colliderFor(8, 1.3, 1.6, wf.p(0, 0.65, 2.2), { collide: true });
  // binder clip vise
  b.box(1.2, 0.8, 0.9, wf.p(-2.4, 1.73, 2.2), { mat: 'plasticGloss', color: 0x1b1b1b, rot: wf.r(0, 0, 0.0) });
  for (const s of [-1, 1]) b.rod(wf.p(-2.4 + s * 0.4, 2.1, 2.2), wf.p(-2.4 + s * 0.6, 2.9, 1.7), 0.05, { mat: 'metal', color: 0xcfcfcf });
  // toy motor + coil of copper wire + needle
  b.cyl(0.4, 0.4, 0.9, wf.p(0.4, 1.73, 2.2), { mat: 'metal', color: 0x9aa0a6, rot: wf.r(0, 0, Math.PI / 2), seg: 16 });
  for (let k = 0; k < 6; k++) b.cyl(0.42, 0.42, 0.06, wf.p(2.3, 1.36 + k * 0.07, 2.4), { mat: 'metal', color: 0xc77b30, seg: 16, open: true });
  b.rod(wf.p(-1.0, 1.36, 1.8), wf.p(2.8, 1.36, 1.6), 0.045, { mat: 'metal', color: 0xdedede });
  // tool rack on the back wall
  for (let k = 0; k < 5; k++) b.rod(wf.p(-4 + k * 0.9, 3.6, 3.08), wf.p(-4 + k * 0.9 + 0.1, 2.3, 3.08), 0.05, { mat: 'metal', color: rng.pick([0xbfbfbf, 0xc77b30, 0x8a8a8a]) });
  // scrap bins
  crate(b, wf, -4.6, 0.2, 0, 1.4, 1.2, 1.4, rng, { collide: true });
  crate(b, wf, 4.6, 0.6, 0, 1.4, 1.0, 1.4, rng, { collide: true });
  button(b, wf, 4.6, 1.1, 0.6, 0.35, 0x8c2f39);
  signBoard(b, wf, 'salvage', 0, 3.9, -4.2, 3.6, [0, Math.PI, 0], 'plank');
  signBoard(b, wf, 'workshop', -3.2, 2.9, 3.0, 2.0, [0, Math.PI, 0], 'card');
  hangingLamp(b, wf.p(0, 4.6, 1.0), 1.4, 0xe8f0ff, 'foil', 2.6, 10, 'workshop');
  wd.hot('craft-depths', 'craft', wf.p(1.2, 0, 0.6), 2.2, {});
  wd.hot('vendor-rook', 'vendor', wf.p(-3.8, 0, -2.2), 2.0, { vendor: 'rook' });

  // ---------- front of the cabinet: the window bench ----------
  b.box(6, 0.4, 1.0, [2.5, 0.6, 12.4], { mat: 'wood', color: 0xe3c58f, collide: true });
  for (const x of [-0.1, 5.1]) spool(b, F, x, 12.4, 0, 0.4, 0.4, 0x6a994e, false);
  crate(b, F, 7.2, 12.6, 0, 1.2, 0.8, 1.0, rng, { collide: true });

  // ---------- lighting ----------
  // fairy lights from the cliff across Drip Row to tall dowel poles on the south side
  const poles = [-14, -2.5, 6.2];
  for (const x of poles) {
    b.cyl(0.13, 0.13, 6.6, [x, 3.3, 3.2], { mat: 'wood', color: 0xd6b47e, seg: 8, collide: true });
    threadWrap(b, F, x, 6.2, 3.2, 0.13, 0xe1b12c);
  }
  const warm = [0xffb35c, 0xffc47a, 0xff9f45, 0xffd08a];
  fairyLights(b, [-20, 6.4, -8.6], [-14, 6.4, 3.2], 1.2, 7, warm, rng, 0.45, 1.0);
  fairyLights(b, [-14, 6.4, 3.2], [-2.5, 6.4, 3.2], 1.0, 9, warm, rng, 0.45, 1.0);
  fairyLights(b, [-2.5, 6.4, 3.2], [6.2, 6.4, 3.2], 0.9, 7, warm.concat([0xe86a5c, 0x7fc7c0]), rng, 0.4, 1.0);
  fairyLights(b, [-8, 6.4, -8.6], [-2.5, 6.4, 3.2], 1.4, 8, warm, rng, 0.4, 0.9);
  fairyLights(b, [6.2, 6.4, 3.2], [13, 6.6, -8.8], 1.2, 7, warm, rng, 0.4, 0.9);
  // spill: a single sad bulb
  hangingLamp(b, [-17, DEPTHS_CEIL, 7.5], 13.5, 0xffa860, 'none', 1.3, 9);
  // a warm bulb just east of the Sump gate so the way out reads from the dark
  hangingLamp(b, [-20.5, DEPTHS_CEIL, 7.75], 13.8, 0xffb86a, 'cap', 1.2, 8);
  // an LED puck stuck under the shelf: cool light that rakes the underside, and the moth's lamp
  b.cyl(0.95, 0.95, 0.22, [-12, DEPTHS_CEIL - 0.11, 9], { mat: 'plasticGloss', color: 0xe8e8e8, seg: 24 });
  b.cyl(0.7, 0.7, 0.03, [-12, DEPTHS_CEIL - 0.235, 9], { mat: 'glow', color: 0xfff3dc, seg: 24 });
  b.sag([-12.9, DEPTHS_CEIL - 0.05, 9], [-21.5, DEPTHS_CEIL - 0.05, 9.4], 0.6, 0.03, { mat: 'thread', color: 0x222222 });
  b.lamp([-12, DEPTHS_CEIL - 0.6, 9], 0xfff0d8, 2.0, 16, 0.6, 'ledPuck');
  wd.moths.push({
    light: new THREE.Vector3(-12, DEPTHS_CEIL - 1.2, 9),
    range: 4.5,
    rests: [
      { pos: new THREE.Vector3(-14, 6.5, 14.6), normal: new THREE.Vector3(0, 0, -1) },
      { pos: new THREE.Vector3(-9, 8, 14.6), normal: new THREE.Vector3(0, 0, -1) },
    ],
  });

  // ---------- gameplay registry ----------
  wd.hot('npc-mara', 'npc', [-18.3, 0, -2.9], 2.0, { npc: 'mara' });
  wd.hot('bed-player', 'bed', pf.p(0.4, 0, -1.4), 1.8, {});
  wd.hot('kitchen-depths', 'kitchen', kf.p(0, 0, 3.4), 2.6, {});
  wd.hot('lift-depths', 'lift', [18, 0, -3.9], 2.3, { lift: 'depths', level: 0 });
  wd.hot('repair-lift', 'repair', [15.8, 0, -3.6], 2.0, { target: 'lift-depths' });
  // you wake inside your own empty matchbox, facing the doorway
  wd.districtSpawn.set('depths', { pos: new THREE.Vector3(-8.1, 0, -7.4), yaw: 0 });

  // nav graph
  const N = (id: string, p: [number, number, number], tags: string[] = []) => wd.node(id, p, 'depths', tags);
  N('d.L0', [-19, 0, -1.6], ['lane']);
  N('d.L1', [-14.9, 0, -1.6], ['lane']);
  N('d.L2', [-10.5, 0, -1.6], ['lane']);
  N('d.L3', [-7.8, 0, -1.6], ['lane']);
  N('d.L4', [-4.9, 0, -1.6], ['lane']);
  N('d.L5', [-1.5, 0, -1.6], ['lane']);
  N('d.L6', [3.5, 0, -1.2], ['lane']);
  N('d.L7', [7.5, 0, -2.6], ['lane', 'kitchenFront']);
  N('d.L8', [12.5, 0, -1.4], ['lane']);
  N('d.L9', [17.0, 0, -2.4], ['lane', 'liftFront']);
  N('d.doorMara', [-18.3, 0, -3.5], ['door']);
  N('d.doorJuno', [-12.5, 0, -3.5], ['door']);
  N('d.doorPlayer', [-8.3, 0, -3.5], ['door']);
  N('d.inPlayer', [-8.0, 0, -6.6], ['home']);
  N('d.doorTamsin', [-2.5, 0, -3.5], ['door']);
  N('d.inMara', [-18.0, 0, -6.8], ['home']);
  N('d.inJuno', [-12.2, 0, -6.8], ['home']);
  N('d.inTamsin', [-2.2, 0, -6.8], ['home']);
  N('d.K0', [4.6, 0, -3.6], ['kitchen', 'sit']);
  N('d.K1', [10.4, 0, -3.6], ['kitchen', 'sit']);
  N('d.K2', [9.4, 0, -8.4], ['stove']);
  N('d.K3', [6.0, 0, -8.4], ['pantry']);
  N('d.KW', [2.4, 0, -8.3], []);
  N('d.KE', [12.8, 0, -6.4], []);
  N('d.S0', [-17.4, 0, 2.6], ['spill']);
  N('d.H0', [-17.6, 0, 6.6], ['heap']);
  N('d.H1', [-14.2, 0, 9.4], ['heap']);
  N('d.W0', [-7.8, 0, 4.4], ['water']);
  N('d.P0', [1.6, 0, 3.8], ['stallFront']);
  N('d.P1', [1.6, 0, 6.95], ['stallBack']);
  N('d.Ps0', [3.9, 0, 5.0], []);
  N('d.Ps1', [3.9, 0, 6.95], []);
  N('d.HB', [-14.4, 0, 6.6], ['heap']);
  N('d.WS0', [11.0, 0, 5.0], ['workshop']);
  N('d.WS1', [14.0, 0, 9.4], ['bench']);
  N('d.F0', [2.5, 0, 11.2], ['window', 'sit']);
  N('d.F1', [5.4, 0, 11.0], ['window']);
  N('d.SB', [-21.0, 0, -0.2], ['stairs']);
  N('d.ST', [-21.0, 2.9, -4.9], ['stairs']);
  N('d.G0', [-20.9, 2.9, -6.3], ['gallery']);
  N('d.G1', [-17.8, 2.9, -6.3], ['gallery']);
  N('d.G2', [-12.0, 2.9, -6.3], ['gallery']);
  N('d.G3', [-7.8, 2.9, -6.3], ['gallery', 'talk']);
  N('d.G4', [-2.0, 2.9, -6.3], ['gallery', 'tea']);
  N('d.LIFT', [18, 0, -6.5], ['liftCar']);
  wd.link('d.L0', 'd.L1', 'd.L2', 'd.L3', 'd.L4', 'd.L5', 'd.L6', 'd.L7', 'd.L8', 'd.L9');
  wd.link('d.L0', 'd.doorMara', 'd.inMara');
  wd.link('d.L2', 'd.doorJuno', 'd.inJuno');
  wd.link('d.L3', 'd.doorPlayer', 'd.inPlayer');
  wd.link('d.L5', 'd.doorTamsin', 'd.inTamsin');
  wd.link('d.L6', 'd.K0', 'd.KW', 'd.K3', 'd.K2', 'd.KE', 'd.K1', 'd.L8');
  wd.link('d.L7', 'd.K0');
  wd.link('d.L7', 'd.K1');
  wd.link('d.L0', 'd.S0', 'd.H0', 'd.H1', 'd.HB', 'd.W0', 'd.L4');
  wd.link('d.S0', 'd.L1');
  wd.link('d.W0', 'd.P0', 'd.L6');
  wd.link('d.P0', 'd.Ps0', 'd.Ps1', 'd.P1');
  wd.link('d.Ps1', 'd.F1', 'd.F0');
  wd.link('d.P0', 'd.WS0', 'd.WS1');
  wd.link('d.WS0', 'd.L8');
  wd.link('d.L0', 'd.SB', 'd.ST', 'd.G0', 'd.G1', 'd.G2', 'd.G3', 'd.G4');
  wd.link('d.L9', 'd.LIFT');
}
