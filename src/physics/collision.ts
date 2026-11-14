// Character collision against oriented boxes (rotation about Y only) and ramps.
// Kept deliberately simple: a vertical cylinder vs boxes, with step-up, slope snapping
// and moving-platform carry. Meshes, colliders and nav graphs come from the same district data.
import * as THREE from 'three';

export interface Solid {
  id: number;
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  minY: number;
  maxY: number;
  cos: number;
  sin: number;
  ramp?: { axis: 0 | 1; y0: number; y1: number };
  dynamic?: boolean;
  enabled: boolean;
  tag?: string;
  noCamera?: boolean;
  /** movement during the last tick (moving platforms) */
  dx: number;
  dy: number;
  dz: number;
}

export interface Body {
  pos: THREE.Vector3; // feet position
  vel: THREE.Vector3;
  radius: number;
  height: number;
  grounded: boolean;
  ground: Solid | null;
}

const CELL = 4;

export class CollisionWorld {
  solids: Solid[] = [];
  private dynamics: Solid[] = [];
  private grid = new Map<number, Solid[]>();
  private stamp = new Map<Solid, number>();
  private queryId = 0;
  private nextId = 1;
  gravity = 28;

  add(o: {
    x: number;
    z: number;
    w: number;
    d: number;
    minY: number;
    maxY: number;
    rotY?: number;
    ramp?: { axis: 0 | 1; y0: number; y1: number };
    dynamic?: boolean;
    tag?: string;
    noCamera?: boolean;
  }): Solid {
    const r = o.rotY ?? 0;
    const s: Solid = {
      id: this.nextId++,
      cx: o.x,
      cz: o.z,
      hx: o.w / 2,
      hz: o.d / 2,
      minY: o.minY,
      maxY: o.maxY,
      cos: Math.cos(r),
      sin: Math.sin(r),
      ramp: o.ramp,
      dynamic: o.dynamic,
      enabled: true,
      tag: o.tag,
      noCamera: o.noCamera,
      dx: 0,
      dy: 0,
      dz: 0,
    };
    this.solids.push(s);
    if (s.dynamic) this.dynamics.push(s);
    else this.insert(s);
    return s;
  }

  private key(ix: number, iz: number): number {
    return (ix + 512) * 4096 + (iz + 512);
  }

  private insert(s: Solid): void {
    const ex = Math.abs(s.hx * s.cos) + Math.abs(s.hz * s.sin);
    const ez = Math.abs(s.hx * s.sin) + Math.abs(s.hz * s.cos);
    const x0 = Math.floor((s.cx - ex) / CELL), x1 = Math.floor((s.cx + ex) / CELL);
    const z0 = Math.floor((s.cz - ez) / CELL), z1 = Math.floor((s.cz + ez) / CELL);
    for (let ix = x0; ix <= x1; ix++)
      for (let iz = z0; iz <= z1; iz++) {
        const k = this.key(ix, iz);
        let arr = this.grid.get(k);
        if (!arr) this.grid.set(k, (arr = []));
        arr.push(s);
      }
  }

  query(x: number, z: number, r: number, out: Solid[] = []): Solid[] {
    out.length = 0;
    const q = ++this.queryId;
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
    for (let ix = x0; ix <= x1; ix++)
      for (let iz = z0; iz <= z1; iz++) {
        const arr = this.grid.get(this.key(ix, iz));
        if (!arr) continue;
        for (const s of arr) {
          if (this.stamp.get(s) === q) continue;
          this.stamp.set(s, q);
          if (s.enabled) out.push(s);
        }
      }
    for (const s of this.dynamics) if (s.enabled) out.push(s);
    return out;
  }

  /** Move a dynamic solid, recording its delta for platform carry. */
  moveDynamic(s: Solid, x: number, y: number, z: number): void {
    const h = s.maxY - s.minY;
    s.dx = x - s.cx;
    s.dy = y - s.maxY;
    s.dz = z - s.cz;
    s.cx = x;
    s.cz = z;
    s.maxY = y;
    s.minY = y - h;
  }

  static topAt(s: Solid, lx: number, lz: number): number {
    if (!s.ramp) return s.maxY;
    const h = s.ramp.axis === 0 ? s.hx : s.hz;
    const l = s.ramp.axis === 0 ? lx : lz;
    const t = Math.max(0, Math.min(1, (l + h) / (2 * h)));
    return s.ramp.y0 + (s.ramp.y1 - s.ramp.y0) * t;
  }

  /** Height of the highest walkable surface at (x,z) not above maxY. */
  groundAt(x: number, z: number, maxY: number, radius = 0.2): number {
    const near = this.query(x, z, radius + 0.5, tmpList);
    let best = -Infinity;
    for (const s of near) {
      const dx = x - s.cx, dz = z - s.cz;
      const lx = dx * s.cos - dz * s.sin;
      const lz = dx * s.sin + dz * s.cos;
      const qx = Math.max(-s.hx, Math.min(s.hx, lx));
      const qz = Math.max(-s.hz, Math.min(s.hz, lz));
      if ((lx - qx) ** 2 + (lz - qz) ** 2 > radius * radius) continue;
      const top = CollisionWorld.topAt(s, qx, qz);
      if (top <= maxY && top > best) best = top;
    }
    return best;
  }

  moveBody(b: Body, dt: number, stepHeight = 0.55, stepDown = 0.45): void {
    // platform carry
    if (b.grounded && b.ground && b.ground.dynamic) {
      b.pos.x += b.ground.dx;
      b.pos.z += b.ground.dz;
      b.pos.y += b.ground.dy;
    }
    const r = b.radius;
    b.pos.x += b.vel.x * dt;
    b.pos.z += b.vel.z * dt;
    const feet = b.pos.y;
    for (let iter = 0; iter < 3; iter++) {
      const near = this.query(b.pos.x, b.pos.z, r + 0.5, tmpList);
      let moved = false;
      for (const s of near) {
        if (s.minY >= feet + b.height - 0.05) continue;
        if (s.maxY < feet - 0.01 && !s.ramp) continue;
        const dx = b.pos.x - s.cx, dz = b.pos.z - s.cz;
        const lx = dx * s.cos - dz * s.sin;
        const lz = dx * s.sin + dz * s.cos;
        const qx = Math.max(-s.hx, Math.min(s.hx, lx));
        const qz = Math.max(-s.hz, Math.min(s.hz, lz));
        const ddx = lx - qx, ddz = lz - qz;
        const d2 = ddx * ddx + ddz * ddz;
        if (d2 >= r * r) continue;
        const top = CollisionWorld.topAt(s, qx, qz);
        if (top <= feet + stepHeight) continue; // steppable / walkable
        let px = 0, pz = 0;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          px = (ddx / d) * (r - d);
          pz = (ddz / d) * (r - d);
        } else {
          const ox = s.hx - Math.abs(lx), oz = s.hz - Math.abs(lz);
          if (ox < oz) px = Math.sign(lx || 1) * (ox + r);
          else pz = Math.sign(lz || 1) * (oz + r);
        }
        const wx = px * s.cos + pz * s.sin;
        const wz = -px * s.sin + pz * s.cos;
        b.pos.x += wx;
        b.pos.z += wz;
        const len = Math.hypot(wx, wz);
        if (len > 1e-9) {
          const nx = wx / len, nz = wz / len;
          const vn = b.vel.x * nx + b.vel.z * nz;
          if (vn < 0) {
            b.vel.x -= vn * nx;
            b.vel.z -= vn * nz;
          }
        }
        moved = true;
      }
      if (!moved) break;
    }

    // vertical
    const wasGrounded = b.grounded;
    b.vel.y -= this.gravity * dt;
    if (b.vel.y < -40) b.vel.y = -40;
    const newY = b.pos.y + b.vel.y * dt;
    const near = this.query(b.pos.x, b.pos.z, r + 0.5, tmpList);
    let ground = -Infinity;
    let gs: Solid | null = null;
    for (const s of near) {
      const dx = b.pos.x - s.cx, dz = b.pos.z - s.cz;
      const lx = dx * s.cos - dz * s.sin;
      const lz = dx * s.sin + dz * s.cos;
      const qx = Math.max(-s.hx, Math.min(s.hx, lx));
      const qz = Math.max(-s.hz, Math.min(s.hz, lz));
      if ((lx - qx) ** 2 + (lz - qz) ** 2 > r * r * 0.36) continue;
      const top = CollisionWorld.topAt(s, qx, qz);
      // on ties prefer moving platforms, so a lift resting flush with the floor still carries you
      if (top <= b.pos.y + stepHeight + 0.01 && (top > ground + 1e-4 || (s.dynamic && top > ground - 1e-4))) {
        ground = top;
        gs = s;
      }
    }
    if (b.vel.y <= 0 && ground > -Infinity && newY <= ground) {
      b.pos.y = ground;
      b.vel.y = 0;
      b.grounded = true;
      b.ground = gs;
    } else if (b.vel.y <= 0 && wasGrounded && ground > -Infinity && newY - ground < stepDown) {
      b.pos.y = ground;
      b.vel.y = 0;
      b.grounded = true;
      b.ground = gs;
    } else {
      let y = newY;
      if (b.vel.y > 0) {
        for (const s of near) {
          const dx = b.pos.x - s.cx, dz = b.pos.z - s.cz;
          const lx = dx * s.cos - dz * s.sin;
          const lz = dx * s.sin + dz * s.cos;
          if (Math.abs(lx) > s.hx + r * 0.6 || Math.abs(lz) > s.hz + r * 0.6) continue;
          if (s.minY >= b.pos.y + b.height - 0.02 && s.minY < y + b.height) {
            y = s.minY - b.height;
            b.vel.y = 0;
          }
        }
      }
      b.pos.y = y;
      b.grounded = false;
      b.ground = null;
    }
  }

  /** Ray cast against solids (used by the camera). Returns hit distance or Infinity. */
  raycast(o: THREE.Vector3, dir: THREE.Vector3, maxDist: number, pad = 0): number {
    let best = maxDist;
    const ex = o.x + dir.x * maxDist, ez = o.z + dir.z * maxDist;
    const cx = (o.x + ex) / 2, cz = (o.z + ez) / 2;
    const rad = Math.hypot(ex - o.x, ez - o.z) / 2 + 1;
    const near = this.query(cx, cz, rad, tmpList2);
    for (const s of near) {
      if (s.noCamera) continue;
      const dx = o.x - s.cx, dz = o.z - s.cz;
      const lox = dx * s.cos - dz * s.sin;
      const loz = dx * s.sin + dz * s.cos;
      const ldx = dir.x * s.cos - dir.z * s.sin;
      const ldz = dir.x * s.sin + dir.z * s.cos;
      let tmin = 0, tmax = best;
      const slab = (p: number, d: number, lo: number, hi: number) => {
        if (Math.abs(d) < 1e-9) return p >= lo && p <= hi;
        let t1 = (lo - p) / d, t2 = (hi - p) / d;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        return tmin <= tmax;
      };
      if (!slab(lox, ldx, -s.hx - pad, s.hx + pad)) continue;
      if (!slab(loz, ldz, -s.hz - pad, s.hz + pad)) continue;
      if (!slab(o.y, dir.y, s.minY - pad, s.maxY + pad)) continue;
      if (tmin > 0 && tmin < best) best = tmin;
    }
    return best;
  }
}

const tmpList: Solid[] = [];
const tmpList2: Solid[] = [];
