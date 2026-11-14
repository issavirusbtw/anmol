// Wild insects that live in the cabinet regardless of the story: an ant colony working a trail between its
// nest in a wood seam and a food source, and moths drawn to the cabinet light. Purely ambient: they never
// block paths, take part in conversations, or touch NPC routes.
import * as THREE from 'three';
import { Rng } from '../core/rng';

type GroundAt = (x: number, z: number, maxY: number) => number;

export interface AntTrailSpec {
  /** polyline from the nest (first point) to the food (last point), y = ground height */
  trail: THREE.Vector3[];
  count: number;
}
export interface MothSpec {
  /** the lamp it circles */
  light: THREE.Vector3;
  /** how far from the lamp it wanders */
  range: number;
  /** resting spots on a surface: position + outward normal (the side the moth's back faces) */
  rests: { pos: THREE.Vector3; normal: THREE.Vector3 }[];
}

/** ants are drawn ~1.5x a real 4 mm worker so they read at chase-camera distance */
const ANT = 1.5;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();

interface Ant {
  s: number;
  dir: 1 | -1;
  off: number;
  speed: number;
  pos: THREE.Vector3;
  yaw: number;
  mode: 'walk' | 'pause' | 'pick' | 'scatter' | 'home';
  timer: number;
  carrying: boolean;
  vel: THREE.Vector3;
  gait: number;
  seed: number;
}

class AntColony {
  private pts: THREE.Vector3[];
  private cum: number[] = [0];
  readonly length: number;
  ants: Ant[] = [];
  constructor(spec: AntTrailSpec, private rng: Rng) {
    this.pts = spec.trail.map((p) => p.clone());
    for (let i = 1; i < this.pts.length; i++) this.cum.push(this.cum[i - 1] + this.pts[i].distanceTo(this.pts[i - 1]));
    this.length = this.cum[this.cum.length - 1];
    for (let i = 0; i < spec.count; i++) {
      const s = rng.range(0, this.length);
      const a: Ant = {
        s,
        dir: rng.chance(0.5) ? 1 : -1,
        off: rng.range(-0.16, 0.16),
        speed: rng.range(0.85, 1.35),
        pos: new THREE.Vector3(),
        yaw: 0,
        mode: 'walk',
        timer: 0,
        carrying: false,
        vel: new THREE.Vector3(),
        gait: rng.range(0, 10),
        seed: rng.range(0, 100),
      };
      a.carrying = a.dir < 0 && rng.chance(0.7);
      this.at(a.s, a.off, a.pos);
      this.ants.push(a);
    }
  }

  /** point on the trail at arc length s, pushed sideways by `off` */
  at(s: number, off: number, out: THREE.Vector3): THREE.Vector3 {
    const c = this.cum;
    s = Math.max(0, Math.min(this.length, s));
    let i = 1;
    while (i < c.length - 1 && c[i] < s) i++;
    const a = this.pts[i - 1], b = this.pts[i];
    const t = (s - c[i - 1]) / Math.max(1e-6, c[i] - c[i - 1]);
    out.lerpVectors(a, b, t);
    const dx = b.x - a.x, dz = b.z - a.z, n = Math.hypot(dx, dz) || 1;
    // ants spread wider mid-trail and bunch up at the nest mouth and the food
    const spread = Math.min(1, Math.min(s, this.length - s) / 1.5);
    out.x += (-dz / n) * off * spread;
    out.z += (dx / n) * off * spread;
    return out;
  }

  update(dt: number, t: number, player: THREE.Vector3): void {
    const r = this.rng;
    for (const a of this.ants) {
      a.timer -= dt;
      // disturbed: anything big within a body length or two sends nearby workers running
      const pdx = a.pos.x - player.x, pdz = a.pos.z - player.z;
      const pd = Math.hypot(pdx, pdz);
      if (pd < 1.15 && Math.abs(player.y - a.pos.y) < 1.2 && a.mode !== 'scatter' && a.mode !== 'home') {
        a.mode = 'scatter';
        a.timer = r.range(0.9, 1.6);
        const k = 3.2 / Math.max(0.2, pd);
        a.vel.set(pdx * k + r.range(-1, 1), 0, pdz * k + r.range(-1, 1)).clampLength(0, 3.4);
      }
      switch (a.mode) {
        case 'scatter': {
          a.pos.x += a.vel.x * dt;
          a.pos.z += a.vel.z * dt;
          a.vel.multiplyScalar(Math.exp(-dt * 1.8));
          a.gait += a.vel.length() * dt * 16;
          if (a.vel.lengthSq() > 0.01) a.yaw = Math.atan2(a.vel.x, a.vel.z);
          if (a.timer <= 0) a.mode = 'walk';
          continue;
        }
        case 'pause':
          // antennae work the ground; occasionally the ant turns back the way it came
          if (a.timer <= 0) {
            a.mode = 'walk';
            if (r.chance(0.12)) a.dir = (a.dir * -1) as 1 | -1;
          }
          continue;
        case 'pick':
          if (a.timer <= 0) {
            a.mode = 'walk';
            a.carrying = true;
            a.dir = -1;
          }
          continue;
        case 'home':
          // inside the nest for a moment, then out again empty-handed
          if (a.timer <= 0) {
            a.mode = 'walk';
            a.carrying = false;
            a.dir = 1;
            a.off = r.range(-0.16, 0.16);
            this.at(0, 0, a.pos);
          }
          continue;
      }
      // walk: chase the trail point; after a scatter the same rule steers it back onto the trail
      const target = this.at(a.s, a.off + Math.sin(t * 2.3 + a.seed) * 0.05, _p);
      _v.subVectors(target, a.pos);
      _v.y = 0;
      const d = _v.length();
      const step = a.speed * dt;
      if (d > 0.25) {
        _v.multiplyScalar(Math.min(d, step * 1.6) / d);
        a.pos.add(_v);
        a.yaw = lerpAngle(a.yaw, Math.atan2(_v.x, _v.z), Math.min(1, dt * 12));
      } else {
        a.s += step * a.dir;
        a.pos.x = target.x;
        a.pos.z = target.z;
        const ahead = this.at(a.s + 0.2 * a.dir, a.off, _v);
        a.yaw = lerpAngle(a.yaw, Math.atan2(ahead.x - a.pos.x, ahead.z - a.pos.z), Math.min(1, dt * 8));
      }
      a.pos.y = target.y;
      a.gait += step * 34;
      if (a.s >= this.length) {
        a.s = this.length;
        a.mode = 'pick';
        a.timer = r.range(0.7, 1.4);
      } else if (a.s <= 0) {
        a.s = 0;
        a.mode = 'home';
        a.timer = r.range(1, 3.5);
      } else if (r.chance(dt * 0.22)) {
        a.mode = 'pause';
        a.timer = r.range(0.35, 1.2);
      }
    }
  }
}

interface Moth {
  spec: MothSpec;
  group: THREE.Group;
  wings: THREE.Object3D[];
  antennae: THREE.Object3D[];
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  target: THREE.Vector3;
  mode: 'fly' | 'land' | 'rest' | 'takeoff';
  timer: number;
  rest: number;
  flap: number;
  shadow: THREE.Mesh;
}

export class Wildlife {
  private colonies: AntColony[] = [];
  private moths: Moth[] = [];
  private seg: THREE.InstancedMesh;
  private legs: THREE.InstancedMesh;
  private crumbs: THREE.InstancedMesh;
  private rng: Rng;

  constructor(
    private scene: THREE.Scene,
    private groundAt: GroundAt,
    seed: number,
    ants: AntTrailSpec[],
    moths: MothSpec[],
  ) {
    this.rng = new Rng(seed ^ 0x51a7);
    for (const spec of ants) this.colonies.push(new AntColony(spec, this.rng.fork(`ants${this.colonies.length}`)));
    const total = this.colonies.reduce((n, c) => n + c.ants.length, 0);
    // three body segments per ant share one instanced sphere; legs and antennae share one thin box
    const chitin = new THREE.MeshStandardMaterial({ color: 0x2a1610, roughness: 0.32, metalness: 0.1 });
    this.seg = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 7), chitin, total * 3);
    this.legs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x24130d, roughness: 0.5 }), total * 8);
    this.crumbs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xf3e6c4, roughness: 0.35, emissive: 0x2a2010 }), Math.max(1, total));
    for (const im of [this.seg, this.legs, this.crumbs]) {
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      im.castShadow = true;
      im.count = 0;
      scene.add(im);
    }
    this.legs.castShadow = false;
    for (const spec of moths) this.moths.push(this.makeMoth(spec));
  }

  /** for tests and the debug overlay */
  get antCount(): number {
    return this.colonies.reduce((n, c) => n + c.ants.length, 0);
  }
  get mothStates(): string[] {
    return this.moths.map((m) => m.mode);
  }
  mothPos(i: number): THREE.Vector3 | null {
    return this.moths[i]?.pos ?? null;
  }
  antsNear(p: THREE.Vector3, r: number): number {
    let n = 0;
    for (const c of this.colonies) for (const a of c.ants) if (a.mode !== 'home' && a.pos.distanceTo(p) < r) n++;
    return n;
  }
  scattering(): number {
    let n = 0;
    for (const c of this.colonies) for (const a of c.ants) if (a.mode === 'scatter') n++;
    return n;
  }

  update(dt: number, t: number, player: THREE.Vector3, cam: THREE.Vector3): void {
    for (const c of this.colonies) c.update(dt, t, player);
    this.drawAnts(t, cam);
    for (const m of this.moths) this.updateMoth(m, dt, t, player);
  }

  private drawAnts(t: number, cam: THREE.Vector3): void {
    let ns = 0, nl = 0, nc = 0;
    const put = (im: THREE.InstancedMesh, i: number, base: THREE.Matrix4, x: number, y: number, z: number, rx: number, ry: number, rz: number, sx: number, sy: number, sz: number) => {
      _q.setFromEuler(_e.set(rx, ry, rz));
      _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
      im.setMatrixAt(i, _m.premultiply(base));
    };
    const base = new THREE.Matrix4();
    for (const c of this.colonies)
      for (const a of c.ants) {
        if (a.mode === 'home') continue;
        const d = a.pos.distanceTo(cam);
        if (d > 70) continue;
        base.compose(a.pos, _q.setFromAxisAngle(_v.set(0, 1, 0), a.yaw), _s.set(ANT, ANT, ANT));
        const k = a.gait;
        const bob = Math.abs(Math.sin(k)) * 0.004;
        put(this.seg, ns++, base, 0, 0.045 + bob, -0.085, 0.25, 0, 0, 0.055, 0.045, 0.075); // gaster
        put(this.seg, ns++, base, 0, 0.05 + bob, 0, -0.1, 0, 0, 0.028, 0.026, 0.05); // thorax
        put(this.seg, ns++, base, 0, 0.055 + bob, 0.065, 0, 0, 0, 0.034, 0.03, 0.036); // head
        if (a.carrying) {
          const cs = 0.045 * ANT;
          _p.set(0, 0.06 * ANT, 0.12 * ANT).applyMatrix4(_m.makeRotationY(a.yaw)).add(a.pos);
          _m.compose(_p, _q.setFromEuler(_e.set(a.seed, a.seed * 2, 0)), _s.set(cs, cs * 0.8, cs));
          this.crumbs.setMatrixAt(nc++, _m);
        }
        if (d > 22) continue; // distant ants: body only
        // tripod gait: legs 0,3,4 swing together against 1,2,5
        for (let l = 0; l < 6; l++) {
          const side = l % 2 ? 1 : -1;
          const row = Math.floor(l / 2) - 1; // front, mid, hind
          const grp = l === 0 || l === 3 || l === 4 ? 0 : Math.PI;
          const swing = Math.sin(k + grp) * 0.45;
          const lift = Math.max(0, Math.cos(k + grp)) * 0.25;
          put(this.legs, nl++, base, side * 0.04, 0.035 + lift * 0.02, row * 0.022, 0, side * (0.9 - row * 0.5) + swing, side * (0.5 + lift), 0.11, 0.006, 0.006);
        }
        // antennae: fast tapping when paused or at the food, a slow sweep when walking
        const busy = a.mode === 'pause' || a.mode === 'pick';
        for (const side of [-1, 1]) {
          const w = Math.sin(t * (busy ? 19 : 6) + a.seed + side) * (busy ? 0.45 : 0.18);
          put(this.legs, nl++, base, side * 0.022, 0.075, 0.1, -0.5 - (busy ? 0.35 : 0) + w * 0.5, side * (0.45 + w), 0, 0.005, 0.005, 0.09);
        }
      }
    this.seg.count = ns;
    this.legs.count = nl;
    this.crumbs.count = nc;
    this.seg.instanceMatrix.needsUpdate = true;
    this.legs.instanceMatrix.needsUpdate = true;
    this.crumbs.instanceMatrix.needsUpdate = true;
  }

  // ---------- moths ----------
  private makeMoth(spec: MothSpec): Moth {
    const g = new THREE.Group();
    const fur = new THREE.MeshStandardMaterial({ color: 0x8a7458, roughness: 0.95 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.62, 4, 10), fur);
    body.rotation.x = Math.PI / 2;
    body.position.z = -0.12;
    const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 9), new THREE.MeshStandardMaterial({ color: 0x9c8466, roughness: 1 }));
    thorax.position.z = 0.22;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), fur);
    head.position.z = 0.42;
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.2 }));
      eye.position.set(s * 0.08, 0.02, 0.47);
      g.add(eye);
    }
    g.add(body, thorax, head);
    const wingTex = mothWingTexture(this.rng.fork('wing'));
    const wm = new THREE.MeshStandardMaterial({ map: wingTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 });
    const wings: THREE.Object3D[] = [];
    // forewing and hindwing per side; pivots at the thorax so they fold and flap from the root
    for (const s of [-1, 1])
      for (const [len, wid, z, back] of [
        [1.25, 0.62, 0.3, 0],
        [0.85, 0.55, 0.12, 1],
      ] as const) {
        const pivot = new THREE.Object3D();
        pivot.position.set(s * 0.12, 0.05, z);
        const geo = new THREE.PlaneGeometry(len, wid);
        geo.translate(len / 2, -wid * (back ? 0.35 : 0.2), 0);
        geo.rotateX(-Math.PI / 2);
        const w = new THREE.Mesh(geo, wm);
        w.scale.x = s;
        w.castShadow = true;
        pivot.add(w);
        pivot.userData = { s, back };
        g.add(pivot);
        wings.push(pivot);
      }
    const antennae: THREE.Object3D[] = [];
    for (const s of [-1, 1]) {
      const a = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.55, 5), new THREE.MeshStandardMaterial({ color: 0x6e5a42, roughness: 1 }));
      a.geometry.translate(0, 0.27, 0);
      a.position.set(s * 0.06, 0.08, 0.5);
      a.rotation.set(1.0, 0, -s * 0.5);
      a.scale.set(1, 1, 0.25);
      g.add(a);
      antennae.push(a);
    }
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
    });
    this.scene.add(g);
    // soft blob shadow on whatever is below: the moth's scale registers when it sweeps over you
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, color: 0x000000, opacity: 0.5 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.renderOrder = 2;
    this.scene.add(shadow);
    const pos = spec.light.clone().add(new THREE.Vector3(1.5, -1, 0));
    return { spec, group: g, wings, antennae, pos, vel: new THREE.Vector3(), target: pos.clone(), mode: 'fly', timer: 4, rest: 0, flap: 0, shadow };
  }

  private updateMoth(m: Moth, dt: number, t: number, player: THREE.Vector3): void {
    const r = this.rng;
    m.timer -= dt;
    const L = m.spec.light;
    const rest = m.spec.rests[m.rest];
    if (m.mode === 'fly' || m.mode === 'takeoff') {
      // irregular orbit: jittery targets near the lamp, the odd hard dart, sometimes a bump against it
      if (m.pos.distanceTo(m.target) < 0.6 || r.chance(dt * 0.9)) {
        const a = r.range(0, Math.PI * 2), rr = r.range(0.6, m.spec.range);
        m.target.set(L.x + Math.cos(a) * rr, L.y + r.range(-m.spec.range * 0.5, m.spec.range * 0.25), L.z + Math.sin(a) * rr * 0.6);
        if (r.chance(0.15)) m.target.copy(L);
      }
      const maxV = m.mode === 'takeoff' ? 7 : 4.2;
      _v.subVectors(m.target, m.pos).normalize().multiplyScalar(maxV);
      m.vel.lerp(_v, Math.min(1, dt * 2.6));
      m.vel.x += r.range(-1, 1) * 22 * dt;
      m.vel.y += r.range(-1, 1) * 18 * dt;
      m.vel.z += r.range(-1, 1) * 22 * dt;
      m.vel.clampLength(0, maxV * 1.3);
      m.pos.addScaledVector(m.vel, dt);
      if (m.mode === 'takeoff' && m.timer <= 0) m.mode = 'fly';
      if (m.mode === 'fly' && m.timer <= 0) {
        m.mode = 'land';
        m.rest = r.int(0, m.spec.rests.length - 1);
      }
      m.flap += dt * (m.mode === 'takeoff' ? 44 : 30);
    } else if (m.mode === 'land') {
      // final approach: slow, fluttering, straight in
      _p.copy(rest.pos).addScaledVector(rest.normal, 0.18);
      _v.subVectors(_p, m.pos);
      const d = _v.length();
      m.vel.lerp(_v.normalize().multiplyScalar(Math.min(3, d * 2 + 0.6)), Math.min(1, dt * 4));
      m.pos.addScaledVector(m.vel, dt);
      m.flap += dt * 30;
      if (d < 0.12) {
        m.mode = 'rest';
        m.pos.copy(_p);
        m.vel.set(0, 0, 0);
        m.timer = r.range(7, 16);
      }
    } else {
      // resting: wings folded flat; only the antennae twitch. Someone close sends it off.
      const pd = m.pos.distanceTo(player);
      if (pd < 4.5 || m.timer <= 0) {
        m.mode = 'takeoff';
        m.timer = r.range(1.2, 2);
        _v.copy(rest.normal).multiplyScalar(5).add(new THREE.Vector3(r.range(-2, 2), 3.5, 0));
        if (pd < 4.5) _v.add(_p.subVectors(m.pos, player).setY(0).normalize().multiplyScalar(2.5));
        m.vel.copy(_v);
        m.target.copy(m.pos).addScaledVector(_v, 0.6);
      }
    }
    const g = m.group;
    g.position.copy(m.pos);
    if (m.mode === 'rest') {
      // back to the room, head up the glass
      _p.copy(m.pos).add(new THREE.Vector3(0, 1, 0));
      g.up.copy(rest.normal);
      g.lookAt(_p);
    } else {
      g.up.set(0, 1, 0);
      _p.copy(m.pos).add(_v.copy(m.vel).setY(m.vel.y * 0.3));
      if (m.vel.lengthSq() > 0.01) g.lookAt(_p);
    }
    const resting = m.mode === 'rest';
    for (const w of m.wings) {
      const { s, back } = w.userData as { s: number; back: number };
      if (resting) {
        // folded: swept back into a delta, flat to the body
        w.rotation.set(0, s * (back ? 1.95 : 2.2) * -1 * -1, 0);
        w.rotation.y = -s * (Math.PI - (back ? 1.2 : 1.0));
        w.rotation.z = 0;
      } else {
        const f = Math.sin(m.flap + (back ? 0.5 : 0));
        w.rotation.set(0, -s * (back ? 0.35 : 0.1), s * f * 1.05);
      }
    }
    for (const [i, a] of m.antennae.entries()) a.rotation.x = 1.0 + Math.sin(t * (resting ? 3 : 9) + i * 1.3) * (resting ? 0.08 : 0.15);
    const gy = this.groundAt(m.pos.x, m.pos.z, m.pos.y - 0.2);
    const h = Math.max(0.1, m.pos.y - gy);
    const sh = m.shadow;
    sh.visible = gy > -50 && !resting;
    sh.position.set(m.pos.x, gy + 0.03, m.pos.z);
    sh.scale.setScalar(1.1 + h * 0.08);
    (sh.material as THREE.MeshBasicMaterial).opacity = Math.max(0.08, 0.55 - h * 0.025);
  }
}

function lerpAngle(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

/** Dusty brown moth wing: darker veins, a pale crossband and an eyespot, alpha-cut outline. */
function mothWingTexture(rng: Rng): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const x = c.getContext('2d')!;
  x.fillStyle = 'rgba(0,0,0,0)';
  x.fillRect(0, 0, 128, 64);
  x.beginPath();
  x.moveTo(0, 30);
  x.quadraticCurveTo(40, 2, 124, 8);
  x.quadraticCurveTo(128, 36, 104, 58);
  x.quadraticCurveTo(50, 64, 0, 40);
  x.closePath();
  const grd = x.createLinearGradient(0, 0, 128, 0);
  grd.addColorStop(0, '#6d5a43');
  grd.addColorStop(0.55, '#a38b6b');
  grd.addColorStop(1, '#8a7457');
  x.fillStyle = grd;
  x.fill();
  x.save();
  x.clip();
  x.strokeStyle = 'rgba(60,45,30,0.55)';
  x.lineWidth = 1.2;
  for (let i = 0; i < 6; i++) {
    x.beginPath();
    x.moveTo(2, 34);
    x.quadraticCurveTo(50, 10 + i * 8, 126, 6 + i * 10);
    x.stroke();
  }
  x.fillStyle = 'rgba(225,210,180,0.55)';
  x.fillRect(66, 0, 9, 64);
  for (let i = 0; i < 400; i++) {
    x.fillStyle = `rgba(${rng.chance(0.5) ? '40,30,20' : '200,185,160'},${rng.range(0.05, 0.25)})`;
    x.fillRect(rng.range(0, 128), rng.range(0, 64), 1.5, 1.5);
  }
  x.fillStyle = '#3a2c1e';
  x.beginPath();
  x.arc(92, 30, 6, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#d8c7a0';
  x.beginPath();
  x.arc(92, 30, 2.4, 0, Math.PI * 2);
  x.fill();
  x.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let blob: THREE.CanvasTexture | null = null;
function blobTexture(): THREE.CanvasTexture {
  if (blob) return blob;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  blob = new THREE.CanvasTexture(c);
  return blob;
}
