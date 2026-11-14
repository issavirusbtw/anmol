// The display cabinet shell, its glass, and the alien bedroom beyond.
import * as THREE from 'three';
import { Rng } from '../core/rng';
import { WorldBuilder } from './builder';
import { CABINET as C, TIER_Y } from '../config';
import { Materials } from '../render/materials';
import { fingerprints } from '../render/textures';

export interface Hole {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** Shelf slab with rectangular holes, built as a grid of boxes so colliders match. */
function shelf(b: WorldBuilder, y: number, holes: Hole[], glassX?: [number, number]): void {
  const t = C.shelfThickness;
  const xs = new Set<number>([C.minX, C.maxX]);
  const zs = new Set<number>([C.minZ, C.shelfFrontZ]);
  for (const h of holes) {
    xs.add(h.x0);
    xs.add(h.x1);
    zs.add(h.z0);
    zs.add(h.z1);
  }
  if (glassX) {
    xs.add(glassX[0]);
    xs.add(glassX[1]);
  }
  const X = [...xs].sort((a, b) => a - b);
  const Z = [...zs].sort((a, b) => a - b);
  for (let i = 0; i < X.length - 1; i++)
    for (let j = 0; j < Z.length - 1; j++) {
      const cx = (X[i] + X[i + 1]) / 2, cz = (Z[j] + Z[j + 1]) / 2;
      if (holes.some((h) => cx > h.x0 && cx < h.x1 && cz > h.z0 && cz < h.z1)) continue;
      const glass = glassX && cx > glassX[0] && cx < glassX[1];
      b.box(X[i + 1] - X[i], t, Z[j + 1] - Z[j], [cx, y - t / 2, cz], {
        mat: glass ? 'glassShelf' : 'cabinetWood',
        color: glass ? 0xd8f0ec : 0xffffff,
        collide: true,
        noBake: glass,
      });
    }
  // front lip and edge highlight
  b.box(C.maxX - C.minX, t + 0.3, 0.3, [0, y - t / 2 - 0.15, C.shelfFrontZ + 0.15], { mat: 'cabinetWood', color: 0xe8d8c8 });
  b.box(C.maxX - C.minX, 0.05, 0.05, [0, y + 0.02, C.shelfFrontZ + 0.28], { mat: 'brass', color: 0xffffff, noBake: true });
}

export function buildCabinet(b: WorldBuilder, holesByTier: Hole[][], glassShelf: Map<number, [number, number]>): void {
  b.chunk = 'cabinet';
  const H = C.top;
  // back panel, sides, top, base
  b.box(C.maxX - C.minX + 2.4, H + 2, 1.2, [0, H / 2, C.minZ - 0.6], { mat: 'cabinetWood', collide: true });
  for (const s of [-1, 1]) b.box(1.2, H + 2, C.glassZ - C.minZ + 1.6, [s * (C.maxX + 0.6), H / 2, (C.minZ + C.glassZ) / 2], { mat: 'cabinetWood', collide: true });
  b.box(C.maxX - C.minX + 2.4, 1.6, C.glassZ - C.minZ + 1.6, [0, H + 0.8, (C.minZ + C.glassZ) / 2], { mat: 'cabinetWood' });
  b.box(C.maxX - C.minX + 2.4, 20, C.glassZ - C.minZ + 2, [0, -10, (C.minZ + C.glassZ) / 2], { mat: 'cabinetWood', collide: true });
  for (let i = 1; i < TIER_Y.length; i++) shelf(b, TIER_Y[i], holesByTier[i] ?? [], glassShelf.get(i));
  // shelf-pin brackets on the back
  for (let i = 1; i < TIER_Y.length; i++)
    for (const x of [-60, -22, 22, 60]) b.box(0.6, 0.6, 0.6, [x, TIER_Y[i] - C.shelfThickness - 0.3, C.minZ + 0.3], { mat: 'brass', color: 0xffffff });
  // front pilasters at the bay boundaries
  for (const x of [-C.dividerX, C.dividerX]) b.box(1.4, H, 1.6, [x, H / 2, C.glassZ - 0.9], { mat: 'cabinetWood', collide: true });
  // glass door frame
  for (const x of [C.minX - 0.4, 0, C.maxX + 0.4]) b.box(x === 0 ? 0.8 : 1.4, H + 1, 0.8, [x, H / 2, C.glassZ + 0.2], { mat: 'cabinetWood' });
  b.box(C.maxX - C.minX + 2, 1.2, 0.8, [0, H + 0.2, C.glassZ + 0.2], { mat: 'cabinetWood' });
  // brass handle + keyhole on the doors
  for (const s of [-1, 1]) {
    b.box(0.3, 9, 0.5, [s * 1.4, 64, C.glassZ + 0.75], { mat: 'brass', color: 0xffffff });
  }
  // glass collider for the whole front
  b.col.add({ x: 0, z: C.glassZ + 0.1, w: C.maxX - C.minX, d: 0.3, minY: -1, maxY: H, tag: 'glass' });
}

/** Glass panes (separate meshes: they are transparent and must sort after the city). */
export function buildGlass(scene: THREE.Scene, mats: Materials, rng: Rng): THREE.Mesh[] {
  const prints = fingerprints(1024, rng.fork('prints'));
  prints.repeat.set(2, 2);
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xdff4ef,
    roughness: 0.04,
    metalness: 0,
    transparent: true,
    opacity: 0.07,
    envMapIntensity: 0.7,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const smudge = new THREE.MeshBasicMaterial({ color: 0xf2f6ff, transparent: true, opacity: 0.1, alphaMap: prints, depthWrite: false, side: THREE.DoubleSide });
  const out: THREE.Mesh[] = [];
  // night haze just beyond the glass keeps the bedroom a soft suggestion rather than a second set
  const haze = new THREE.Mesh(
    new THREE.PlaneGeometry(C.maxX - C.minX + 400, C.top + 200),
    new THREE.MeshBasicMaterial({ color: 0x182030, transparent: true, opacity: 0.5, depthWrite: false, fog: false, side: THREE.DoubleSide }),
  );
  haze.position.set(0, C.top / 2, C.glassZ + 3);
  haze.renderOrder = 9;
  haze.name = 'glassHaze';
  // only seen from inside the cabinet; from the bedroom the city should glow through clearly
  haze.onBeforeRender = (_r, _s, cam) => {
    (haze.material as THREE.MeshBasicMaterial).opacity = cam.position.z < C.glassZ ? 0.5 : 0;
  };
  scene.add(haze);
  for (const s of [-1, 1]) {
    const w = (C.maxX - C.minX) / 2 - 0.8;
    const pane = new THREE.Mesh(new THREE.BoxGeometry(w, C.top, 0.25), glass);
    pane.position.set(s * (w / 2 + 0.4), C.top / 2, C.glassZ);
    pane.renderOrder = 10;
    scene.add(pane);
    out.push(pane);
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(w, C.top), smudge);
    sm.position.set(s * (w / 2 + 0.4), C.top / 2, C.glassZ + 0.14);
    sm.renderOrder = 11;
    scene.add(sm);
    // greenish edge highlight where the glass thickness shows
    const edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.85, 0.75), transparent: true, opacity: 0.5 });
    for (const ex of [-w / 2, w / 2]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.12, C.top, 0.26), edgeMat);
      e.position.set(s * (w / 2 + 0.4) + ex, C.top / 2, C.glassZ);
      scene.add(e);
    }
  }
  void mats;
  return out;
}

/** The alien child's bedroom outside: large, soft, slightly strange. Not baked, separate chunk. */
export function buildRoom(b: WorldBuilder, rng: Rng): void {
  b.chunk = 'room';
  const floorY = -20;
  // carpet
  b.box(700, 1, 600, [0, floorY - 0.5, 200], { mat: 'carpet', color: 0x241d36, noBake: true });
  // walls
  b.box(700, 400, 2, [0, floorY + 200, -40], { mat: 'roomWall', color: 0x1c2a36, noBake: true });
  b.box(2, 400, 600, [-330, floorY + 200, 200], { mat: 'roomWall', color: 0x1e2c37, noBake: true });
  b.box(2, 400, 600, [330, floorY + 200, 200], { mat: 'roomWall', color: 0x1e2c37, noBake: true });
  b.box(700, 400, 2, [0, floorY + 200, 480], { mat: 'roomWall', color: 0x16222c, noBake: true });
  b.box(700, 2, 600, [0, floorY + 330, 200], { mat: 'roomWall', color: 0x121c25, noBake: true });
  // the child's bed: an organic, lumpy shape with a patterned spread
  b.box(170, 40, 260, [-150, floorY + 20, 260], { mat: 'fabric', color: 0x3a2234, noBake: true });
  b.sphere(40, [-150, floorY + 55, 160], { mat: 'fabric', color: 0xd9c27a, scale: [1.6, 0.5, 0.8], noBake: true });
  // window with a two-moon night sky
  b.box(140, 110, 2, [150, floorY + 200, 478], { mat: 'glow', color: 0x0d1c3a, noBake: true });
  b.sphere(12, [120, floorY + 230, 476], { mat: 'glow', color: 0xbfd8ff, noBake: true });
  b.sphere(6, [185, floorY + 205, 476], { mat: 'glow', color: 0xffc9a8, noBake: true });
  for (const x of [80, 150, 220]) b.box(4, 112, 4, [x, floorY + 200, 476], { mat: 'matte', color: 0x1f2a36, noBake: true });
  // desk with a mushroom-shaped lamp (the warm key light from the room)
  b.box(120, 6, 70, [200, floorY + 75, 120], { mat: 'wood', color: 0x8a5a3a, noBake: true });
  b.cyl(3, 4, 60, [230, floorY + 108, 110], { mat: 'plasticGloss', color: 0xd85e3a, noBake: true });
  b.sphere(24, [230, floorY + 140, 110], { mat: 'glow', color: 0xffb26b, scale: [1, 0.55, 1], noBake: true });
  // toys: giant stacked blocks with strange glyphs, a plush creature
  for (let i = 0; i < 5; i++) {
    const s = rng.range(18, 30);
    b.box(s, s, s, [rng.range(-260, -40), floorY + s / 2, rng.range(80, 160)], { mat: 'painted', color: rng.pick([0xc0392b, 0x2e86ab, 0xe1b12c, 0x6a994e]), rot: [0, rng.range(0, 1.5), 0], noBake: true });
  }
  b.sphere(30, [60, floorY + 28, 140], { mat: 'fabric', color: 0x7fb7a4, scale: [1.2, 1, 1], noBake: true });
  b.sphere(12, [72, floorY + 60, 150], { mat: 'fabric', color: 0x3e6a5c, noBake: true });
  // poster on the side wall: planets
  b.box(2, 90, 70, [-328, floorY + 190, 140], { mat: 'painted', color: 0x1c2340, noBake: true });
  for (let i = 0; i < 4; i++) b.sphere(rng.range(5, 12), [-326, floorY + rng.range(160, 220), rng.range(115, 165)], { mat: 'glowSoft', color: rng.pick([0xe07a5f, 0x81b29a, 0xf2cc8f]), scale: [0.2, 1, 1], noBake: true });
  // the cabinet stands on legs
  for (const x of [-60, 60]) for (const z of [-10, 12]) b.box(6, 20, 6, [x, floorY + 10, z], { mat: 'cabinetWood', noBake: true });
}
