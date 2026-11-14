// WorldBuilder: one call places a mesh part AND (optionally) its collider. At finish() static parts
// are merged per material+chunk, and lamp bounce light + contact occlusion are baked per vertex.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CollisionWorld, Solid } from '../physics/collision';
import { Materials, MatKey } from '../render/materials';
import { TIER_Y, CABINET } from '../config';

export type V3 = [number, number, number];

export interface PartOpts {
  mat: MatKey;
  color?: THREE.ColorRepresentation;
  rot?: V3;
  uvRect?: [number, number, number, number];
  collide?: boolean | 'noCamera';
  tag?: string;
  noBake?: boolean;
  /** extra vertical extent for the collider (e.g. invisible rails) */
  colliderPad?: number;
  segs?: number;
}

export interface Lamp {
  pos: THREE.Vector3;
  color: THREE.Color;
  intensity: number;
  range: number;
  bake: number;
  flicker?: number;
  /** district tag for activation (lamps can be switched by repairs) */
  tag?: string;
  on: boolean;
}

interface Piece {
  geom: THREE.BufferGeometry;
  noBake: boolean;
}

/** Patch a standard material so a per-vertex 'bakeLight' attribute adds baked light. */
export function patchBaked(mat: THREE.Material): void {
  if ((mat as any).__baked) return;
  (mat as any).__baked = true;
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 bakeLight;\nvarying vec3 vBake;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBake = bakeLight;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBake;\nuniform float uBakeScale;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vBake * uBakeScale;');
    shader.uniforms.uBakeScale = bakeScaleUniform;
  };
  mat.customProgramCacheKey = () => 'baked';
}

/** Global multiplier for baked light (dimmed during the giant's shadow). */
export const bakeScaleUniform = { value: 1 };

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpC = new THREE.Color();

export class WorldBuilder {
  private buckets = new Map<string, Piece[]>();
  chunk = 'base';
  lamps: Lamp[] = [];
  private groupStack: { group: THREE.Group; buckets: Map<string, Piece[]> }[] = [];

  constructor(
    public scene: THREE.Scene,
    public mats: Materials,
    public col: CollisionWorld,
  ) {}

  // ---------- groups (for moving / toggleable assemblies) ----------
  beginGroup(name: string): void {
    const group = new THREE.Group();
    group.name = name;
    this.groupStack.push({ group, buckets: new Map() });
  }

  /** Ends a group; its pieces are merged relative to `origin` and returned positioned there. */
  endGroup(origin: V3 = [0, 0, 0]): THREE.Group {
    const g = this.groupStack.pop()!;
    const off = new THREE.Matrix4().makeTranslation(-origin[0], -origin[1], -origin[2]);
    for (const [key, pieces] of g.buckets) {
      for (const p of pieces) p.geom.applyMatrix4(off);
      const mesh = this.mergeBucket(key, pieces, true, origin);
      if (mesh) g.group.add(mesh);
    }
    g.group.position.set(origin[0], origin[1], origin[2]);
    this.scene.add(g.group);
    return g.group;
  }

  private target(): Map<string, Piece[]> {
    return this.groupStack.length ? this.groupStack[this.groupStack.length - 1].buckets : this.buckets;
  }

  // ---------- primitives ----------
  add(geom: THREE.BufferGeometry, pos: V3, o: PartOpts, scale?: V3): void {
    const g = normalize(geom);
    tmpE.set(o.rot?.[0] ?? 0, o.rot?.[1] ?? 0, o.rot?.[2] ?? 0, 'YXZ');
    tmpQ.setFromEuler(tmpE);
    tmpM.compose(new THREE.Vector3(...pos), tmpQ, new THREE.Vector3(...(scale ?? [1, 1, 1])));
    g.applyMatrix4(tmpM);
    if (import.meta.env.DEV) {
      const a = g.getAttribute('position').array;
      for (let i = 0; i < a.length; i++)
        if (Number.isNaN(a[i])) {
          console.warn('[builder] NaN geometry', o.mat, pos, new Error().stack);
          break;
        }
    }
    tmpC.set(o.color ?? 0xffffff);
    const colors = g.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < colors.count; i++) colors.setXYZ(i, tmpC.r, tmpC.g, tmpC.b);
    const key = `${o.mat}|${this.groupStack.length ? 'grp' : this.chunk}`;
    const t = this.target();
    let arr = t.get(key);
    if (!arr) t.set(key, (arr = []));
    arr.push({ geom: g, noBake: !!o.noBake });
  }

  box(w: number, h: number, d: number, pos: V3, o: PartOpts): Solid | null {
    const info = this.mats.get(o.mat);
    const tw = info.texWorld;
    const big = !o.noBake && Math.max(w, h, d) > 2.5;
    const sx = o.segs ?? (big ? Math.max(1, Math.min(20, Math.ceil(w / 1.6))) : 1);
    const sy = o.segs ?? (big ? Math.max(1, Math.min(20, Math.ceil(h / 1.6))) : 1);
    const sz = o.segs ?? (big ? Math.max(1, Math.min(20, Math.ceil(d / 1.6))) : 1);
    const g = new THREE.BoxGeometry(w, h, d, sx, sy, sz);
    if (o.uvRect) remapUV(g, o.uvRect);
    else if (tw > 0) {
      scaleBoxUV(g, w, h, d, tw);
      // per-part texture offset so repeated boxes never show the same patch of print/stain
      const hsh = Math.sin(pos[0] * 12.9898 + pos[1] * 37.719 + pos[2] * 78.233) * 43758.5453;
      const ou = hsh - Math.floor(hsh), ov = (hsh * 7.31) % 1;
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + ou, uv.getY(i) + Math.abs(ov));
    }
    this.add(g, pos, o);
    if (o.collide) return this.colliderFor(w, h, d, pos, o);
    return null;
  }

  colliderFor(w: number, h: number, d: number, pos: V3, o: { rot?: V3; collide?: boolean | 'noCamera'; tag?: string; colliderPad?: number }): Solid {
    const rx = o.rot?.[0] ?? 0, rz = o.rot?.[2] ?? 0;
    const ry = o.rot?.[1] ?? 0;
    let hw = w / 2, hh = h / 2, hd = d / 2;
    if (Math.abs(rx) > 1e-3 || Math.abs(rz) > 1e-3) {
      // conservative AABB in the yaw frame
      const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, 0, rz, 'YXZ'));
      const e = m.elements;
      const nw = Math.abs(e[0]) * hw + Math.abs(e[4]) * hh + Math.abs(e[8]) * hd;
      const nh = Math.abs(e[1]) * hw + Math.abs(e[5]) * hh + Math.abs(e[9]) * hd;
      const nd = Math.abs(e[2]) * hw + Math.abs(e[6]) * hh + Math.abs(e[10]) * hd;
      hw = nw;
      hh = nh;
      hd = nd;
    }
    return this.col.add({
      x: pos[0],
      z: pos[2],
      w: hw * 2,
      d: hd * 2,
      minY: pos[1] - hh,
      maxY: pos[1] + hh + (o.colliderPad ?? 0),
      rotY: ry,
      tag: o.tag,
      noCamera: o.collide === 'noCamera',
    });
  }

  cyl(rt: number, rb: number, h: number, pos: V3, o: PartOpts & { seg?: number; open?: boolean }): Solid | null {
    const seg = o.seg ?? 16;
    const g = new THREE.CylinderGeometry(rt, rb, h, seg, Math.max(1, Math.min(8, Math.ceil(h / 2))), o.open);
    const tw = this.mats.get(o.mat).texWorld;
    if (tw > 0) {
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      const circ = Math.PI * 2 * Math.max(rt, rb);
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * circ) / tw, (uv.getY(i) * h) / tw);
    }
    this.add(g, pos, o);
    if (o.collide) {
      const r = Math.max(rt, rb) * 0.9;
      return this.colliderFor(r * 2, h, r * 2, pos, o);
    }
    return null;
  }

  sphere(r: number, pos: V3, o: PartOpts & { scale?: V3; seg?: number }): void {
    const seg = o.seg ?? 14;
    const g = new THREE.SphereGeometry(r, seg, Math.max(6, Math.floor(seg * 0.7)));
    this.add(g, pos, o, o.scale);
  }

  /** Flat quad (e.g. signs, labels, paper scraps). Faces +Z before rotation. */
  quad(w: number, h: number, pos: V3, o: PartOpts): void {
    const g = new THREE.PlaneGeometry(w, h, Math.max(1, Math.ceil(w / 2)), Math.max(1, Math.ceil(h / 2)));
    if (o.uvRect) remapUV(g, o.uvRect);
    else {
      const tw = this.mats.get(o.mat).texWorld;
      if (tw > 0) {
        const uv = g.getAttribute('uv') as THREE.BufferAttribute;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tw, (uv.getY(i) * h) / tw);
      }
    }
    this.add(g, pos, o);
  }

  /** A thin cylinder between two points (thread, wire, poles). */
  rod(a: V3, b: V3, r: number, o: PartOpts & { seg?: number }): void {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const len = va.distanceTo(vb);
    if (len < 1e-4) return;
    const g = normalize(new THREE.CylinderGeometry(r, r, len, o.seg ?? 6, 1, true));
    const mid = va.clone().add(vb).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    g.applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
    this.add(g, [0, 0, 0], { ...o, rot: undefined });
  }

  /** A sagging catenary-ish string between two points; returns sample points along it. */
  sag(a: V3, b: V3, drop: number, r: number, o: PartOpts, n = 10): THREE.Vector3[] {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push(
        new THREE.Vector3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * drop, a[2] + (b[2] - a[2]) * t),
      );
    }
    for (let i = 0; i < n; i++) this.rod(pts[i].toArray() as V3, pts[i + 1].toArray() as V3, r, o);
    return pts;
  }

  lamp(pos: V3, color: THREE.ColorRepresentation, intensity: number, range: number, bake = 0.5, tag?: string, flicker = 0): Lamp {
    const l: Lamp = { pos: new THREE.Vector3(...pos), color: new THREE.Color(color), intensity, range, bake, tag, on: true, flicker };
    this.lamps.push(l);
    return l;
  }

  // ---------- finishing ----------
  finish(): void {
    for (const [key, pieces] of this.buckets) {
      const mesh = this.mergeBucket(key, pieces, false);
      if (mesh) this.scene.add(mesh);
    }
    this.buckets.clear();
  }

  private mergeBucket(key: string, pieces: Piece[], inGroup: boolean, origin?: V3): THREE.Mesh | null {
    if (!pieces.length) return null;
    const matKey = key.split('|')[0] as MatKey;
    const info = this.mats.get(matKey);
    const offset = origin ? new THREE.Vector3(...origin) : new THREE.Vector3();
    for (const p of pieces) this.bake(p, offset);
    const merged = mergeGeometries(pieces.map((p) => p.geom), false);
    if (!merged) return null;
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    const isStd = info.mat instanceof THREE.MeshStandardMaterial;
    if (isStd) patchBaked(info.mat);
    const mesh = new THREE.Mesh(merged, info.mat);
    mesh.castShadow = info.castShadow;
    mesh.receiveShadow = info.receiveShadow;
    mesh.name = key;
    if (info.transparent) mesh.renderOrder = 2;
    mesh.matrixAutoUpdate = inGroup;
    if (!inGroup) mesh.updateMatrix();
    return mesh;
  }

  private lampGrid: Map<number, Lamp[]> | null = null;

  private bake(p: Piece, offset: THREE.Vector3): void {
    const g = p.geom;
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const nor = g.getAttribute('normal') as THREE.BufferAttribute;
    const col = g.getAttribute('color') as THREE.BufferAttribute;
    const bake = new Float32Array(pos.count * 3);
    if (!p.noBake) {
      if (!this.lampGrid) this.buildLampGrid();
      const v = new THREE.Vector3();
      const n = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.set(pos.getX(i) + offset.x, pos.getY(i) + offset.y, pos.getZ(i) + offset.z);
        n.set(nor.getX(i), nor.getY(i), nor.getZ(i));
        // contact occlusion near each tier floor, inside the cabinet
        let ao = 1;
        if (Math.abs(v.x) < CABINET.maxX + 1 && v.z < CABINET.glassZ) {
          let floor = 0;
          for (const ty of TIER_Y) if (ty <= v.y + 0.02) floor = ty;
          const hf = v.y - floor;
          ao = 0.5 + 0.5 * smooth(0, 1.4, hf);
          // the back of each compartment is deeper in shadow
          ao *= 0.78 + 0.22 * smooth(CABINET.minZ, CABINET.minZ + 9, v.z);
          // undersides read darker
          if (n.y < -0.5) ao *= 0.7;
        }
        col.setXYZ(i, col.getX(i) * ao, col.getY(i) * ao, col.getZ(i) * ao);
        // lamp bounce (indirect only; the live light pool supplies direct light)
        let r = 0, gg = 0, b = 0;
        const cell = lampKey(Math.floor(v.x / 8), Math.floor(v.y / 8), Math.floor(v.z / 8));
        void cell;
        for (let dx = -1; dx <= 1; dx++)
          for (let dy = -1; dy <= 1; dy++)
            for (let dz = -1; dz <= 1; dz++) {
              const arr = this.lampGrid!.get(lampKey(Math.floor(v.x / 8) + dx, Math.floor(v.y / 8) + dy, Math.floor(v.z / 8) + dz));
              if (!arr) continue;
              for (const l of arr) {
                const lx = l.pos.x - v.x, ly = l.pos.y - v.y, lz = l.pos.z - v.z;
                const d = Math.sqrt(lx * lx + ly * ly + lz * lz);
                const R = l.range;
                if (d > R) continue;
                const ndl = Math.max(0.15, (n.x * lx + n.y * ly + n.z * lz) / (d + 1e-6));
                const f = (1 - d / R) ** 2 * ndl * l.bake;
                r += l.color.r * f;
                gg += l.color.g * f;
                b += l.color.b * f;
              }
            }
        bake[i * 3] = r * ao;
        bake[i * 3 + 1] = gg * ao;
        bake[i * 3 + 2] = b * ao;
      }
    }
    g.setAttribute('bakeLight', new THREE.BufferAttribute(bake, 3));
  }

  private buildLampGrid(): void {
    this.lampGrid = new Map();
    for (const l of this.lamps) {
      if (l.bake <= 0) continue;
      const k = lampKey(Math.floor(l.pos.x / 8), Math.floor(l.pos.y / 8), Math.floor(l.pos.z / 8));
      let arr = this.lampGrid.get(k);
      if (!arr) this.lampGrid.set(k, (arr = []));
      arr.push(l);
    }
  }
}

function lampKey(x: number, y: number, z: number): number {
  return ((x + 100) * 400 + (y + 100)) * 400 + (z + 100);
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Keep only position/normal/uv, add colour, ensure indexed so everything merges. */
export function normalize(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  if (!g.index) {
    const n = g.getAttribute('position').count;
    const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  const n = g.getAttribute('position').count;
  if (!g.getAttribute('color')) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  g.clearGroups();
  return g;
}

function scaleBoxUV(g: THREE.BoxGeometry, w: number, h: number, d: number, tw: number): void {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  // BoxGeometry groups in order: px, nx, py, ny, pz, nz
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (const [gi, grp] of g.groups.entries()) {
    const [du, dv] = dims[gi];
    const idx = g.index!;
    const seen = new Set<number>();
    for (let k = grp.start; k < grp.start + grp.count; k++) {
      const vi = idx.getX(k);
      if (seen.has(vi)) continue;
      seen.add(vi);
      uv.setXY(vi, (uv.getX(vi) * du) / tw, (uv.getY(vi) * dv) / tw);
    }
  }
}

function remapUV(g: THREE.BufferGeometry, r: [number, number, number, number]): void {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, r[0] + uv.getX(i) * (r[2] - r[0]), r[1] + uv.getY(i) * (r[3] - r[1]));
}
