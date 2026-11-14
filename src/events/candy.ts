// The signature event: a giant's shadow, an alien hand through the glass, candy from the sky.
// Runs on sim time through shared systems (population, economy, hotspots, fx, audio) — not a cutscene.
import * as THREE from 'three';
import { Rng } from '../core/rng';
import { Bus } from '../core/bus';
import { CABINET } from '../config';

export type CandyPhase = 'idle' | 'shadow' | 'reach' | 'release' | 'fall' | 'rush' | 'resolve';

export interface CandyVariant {
  name: string;
  colors: number[];
  scale: [number, number, number];
}

const VARIANTS: CandyVariant[] = [
  { name: 'boiled sweet', colors: [0xe84a5f, 0xffd166], scale: [1.25, 0.85, 1.0] },
  { name: 'gumdrop', colors: [0x7bd389, 0x3fa34d], scale: [1.1, 1.0, 1.1] },
  { name: 'mint', colors: [0xf5f5f5, 0xd62839], scale: [1.3, 0.55, 1.3] },
  { name: 'toffee', colors: [0xd9822b, 0xa0522d], scale: [1.3, 0.75, 0.95] },
];

export interface Shard {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  taken: boolean;
  id: number;
}

export function buildHand(): { root: THREE.Group; fingers: THREE.Group[][]; holdPoint: THREE.Object3D } {
  const skin = new THREE.MeshStandardMaterial({ color: 0x6fae55, roughness: 0.55, metalness: 0 });
  const band = new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 0.6 });
  const nail = new THREE.MeshStandardMaterial({ color: 0xe8f2d8, roughness: 0.25 });
  const knitA = new THREE.MeshStandardMaterial({ color: 0x2f7f7a, roughness: 1 });
  const knitB = new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 1 });
  const root = new THREE.Group();
  root.name = 'alienHand';
  const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), skin);
  palm.scale.set(3.6, 1.3, 3.2);
  palm.castShadow = true;
  root.add(palm);
  // knit sleeve trailing out toward the room
  for (let i = 0; i < 14; i++) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.1, 2.4, 24), i % 2 ? knitA : knitB);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 0.4, 4.6 + i * 2.4);
    ring.castShadow = true;
    root.add(ring);
  }
  const fingers: THREE.Group[][] = [];
  // three long fingers and two opposable thumbs
  const defs = [
    { x: -2.0, z: -2.6, ry: 0.15, len: 2.3 },
    { x: 0, z: -3.0, ry: 0, len: 2.6 },
    { x: 2.0, z: -2.6, ry: -0.15, len: 2.3 },
    { x: -3.2, z: 0.6, ry: 1.2, len: 1.8 },
    { x: 3.2, z: 0.6, ry: -1.2, len: 1.8 },
  ];
  for (const d of defs) {
    const chain: THREE.Group[] = [];
    let parent: THREE.Object3D = root;
    const base = new THREE.Group();
    base.position.set(d.x, -0.1, d.z);
    base.rotation.y = d.ry;
    root.add(base);
    parent = base;
    for (let s = 0; s < 3; s++) {
      const joint = new THREE.Group();
      if (s > 0) joint.position.set(0, 0, -d.len);
      parent.add(joint);
      const seg = new THREE.Mesh(new THREE.CapsuleGeometry(0.62 - s * 0.08, d.len - 0.6, 6, 12), skin);
      seg.rotation.x = Math.PI / 2;
      seg.position.z = -d.len / 2;
      seg.castShadow = true;
      joint.add(seg);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6 - s * 0.08, 0.08, 6, 18), band);
      ring.position.z = -0.1;
      joint.add(ring);
      if (s === 2) {
        const n = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), nail);
        n.scale.set(1, 0.4, 1.2);
        n.position.set(0, 0.3, -d.len + 0.3);
        joint.add(n);
      }
      chain.push(joint);
      parent = joint;
    }
    fingers.push(chain);
  }
  const holdPoint = new THREE.Object3D();
  holdPoint.position.set(0, -2.6, -1.4);
  root.add(holdPoint);
  root.visible = false;
  return { root, fingers, holdPoint };
}

export class CandyEvent {
  phase: CandyPhase = 'idle';
  t = 0;
  count = 0;
  nextAt = Infinity;
  landing = new THREE.Vector3();
  district = 'market';
  variant: CandyVariant = VARIANTS[0];
  hand: ReturnType<typeof buildHand>;
  candy: THREE.Mesh;
  shadow: THREE.Mesh;
  shards: Shard[] = [];
  private candyVel = 0;
  private handFrom = new THREE.Vector3();
  private handTo = new THREE.Vector3();
  private shardMat: THREE.MeshPhysicalMaterial;
  communityShards = 0;
  authorityShards = 0;
  playerShards = 0;
  /** camera shake amount */
  shake = 0;
  /** 0..1 how open the right glass pane is */
  doorOpen = 0;
  impactAt = 0;
  onImpact: ((p: THREE.Vector3) => void) | null = null;
  onPhase: ((p: CandyPhase) => void) | null = null;

  constructor(
    private scene: THREE.Scene,
    private bus: Bus,
    private rng: Rng,
  ) {
    this.hand = buildHand();
    scene.add(this.hand.root);
    this.candy = new THREE.Mesh(
      new THREE.SphereGeometry(1.6, 32, 20),
      new THREE.MeshPhysicalMaterial({ color: 0xe84a5f, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, emissive: new THREE.Color(0.2, 0.03, 0.05), transmission: 0, sheen: 0 }),
    );
    this.candy.castShadow = true;
    this.candy.visible = false;
    scene.add(this.candy);
    // stripes on the candy
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.18, 8, 40), new THREE.MeshPhysicalMaterial({ color: 0xffd166, roughness: 0.12, clearcoat: 1 }));
    stripe.rotation.x = Math.PI / 2;
    this.candy.add(stripe);
    const stripe2 = stripe.clone();
    stripe2.rotation.y = Math.PI / 2;
    this.candy.add(stripe2);
    this.shardMat = new THREE.MeshPhysicalMaterial({ color: 0xe84a5f, roughness: 0.1, clearcoat: 1, emissive: new THREE.Color(0.25, 0.05, 0.07) });
    // the giant's shadow: a huge soft dark disc gliding past the glass
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128);
    grad.addColorStop(0, 'rgba(0,0,0,0.92)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.6)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(160, 200), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    this.shadow.position.set(-200, 60, CABINET.glassZ + 1.5);
    this.shadow.renderOrder = 12;
    scene.add(this.shadow);
  }

  /** Begin an event after `delay` seconds of sim time. */
  trigger(now: number, delay: number, landing: THREE.Vector3, district: string): void {
    if (this.phase !== 'idle') return;
    this.nextAt = now + delay;
    this.landing.copy(landing);
    this.district = district;
  }

  scheduleNext(now: number): void {
    this.nextAt = now + this.rng.range(300, 420);
  }

  private setPhase(p: CandyPhase): void {
    this.phase = p;
    this.t = 0;
    this.bus.emit({ type: 'candy', phase: p });
    this.onPhase?.(p);
  }

  update(dt: number, now: number): void {
    this.shake *= Math.exp(-dt * 5);
    if (this.phase === 'idle') {
      if (now >= this.nextAt) {
        this.variant = VARIANTS[this.count % VARIANTS.length];
        this.applyVariant();
        this.setPhase('shadow');
        this.bus.emit({ type: 'sfx', name: 'rumble' });
      }
      return;
    }
    this.t += dt;
    const L = this.landing;
    switch (this.phase) {
      case 'shadow': {
        const k = this.t / 3.5;
        this.shadow.position.set(-180 + k * 330, L.y + 30, CABINET.glassZ + 1.5);
        if (this.t > 3.5) {
          this.setPhase('reach');
          this.hand.root.visible = true;
          this.candy.visible = true;
          this.handFrom.set(L.x + 18, L.y + 15, CABINET.glassZ + 40);
          this.handTo.set(L.x, L.y + 12.5, L.z + 3.2);
          this.bus.emit({ type: 'sfx', name: 'whoosh' });
        }
        break;
      }
      case 'reach': {
        this.doorOpen = Math.min(1, this.t / 1.2);
        const k = Math.max(0, Math.min(1, (this.t - 0.6) / 3.0));
        const e = k * k * (3 - 2 * k);
        this.hand.root.position.lerpVectors(this.handFrom, this.handTo, e);
        this.hand.root.rotation.set(-0.15 + Math.sin(this.t * 1.3) * 0.03, 0.2 * (1 - e), Math.sin(this.t * 0.9) * 0.04);
        this.curl(0.9);
        this.holdCandy();
        if (this.t > 3.8) this.setPhase('release');
        break;
      }
      case 'release': {
        this.curl(0.9 - Math.min(1, this.t / 0.6) * 0.95);
        if (this.t < 0.35) this.holdCandy();
        if (this.t >= 0.35 && this.candyVel === 0) {
          this.candyVel = -0.01;
          this.setPhase('fall');
        }
        break;
      }
      case 'fall': {
        this.candyVel -= 30 * dt;
        this.candy.position.y += this.candyVel * dt;
        this.candy.rotation.x += dt * 2;
        this.candy.rotation.z += dt * 1.3;
        this.withdraw(dt);
        const floor = L.y + 1.6 * this.variant.scale[1] * 0.8;
        if (this.candy.position.y <= floor) {
          this.candy.position.y = floor;
          this.candyVel = 0;
          this.impact(now);
          this.setPhase('rush');
        }
        break;
      }
      case 'rush': {
        this.withdraw(dt);
        // shard ballistics
        for (const s of this.shards) {
          if (s.taken) continue;
          if (s.vel.lengthSq() > 1e-4 || s.pos.y > L.y + 0.31) {
            s.vel.y -= 30 * dt;
            s.pos.addScaledVector(s.vel, dt);
            if (s.pos.y < L.y + 0.3) {
              s.pos.y = L.y + 0.3;
              s.vel.y *= -0.35;
              s.vel.x *= 0.6;
              s.vel.z *= 0.6;
              if (Math.abs(s.vel.y) < 0.6) s.vel.set(0, 0, 0);
            }
          }
          s.mesh.position.copy(s.pos);
          s.mesh.rotation.y += dt * 0.8;
        }
        const left = this.shards.filter((s) => !s.taken).length;
        if (this.t > 45 || left === 0) {
          this.resolve(now);
        }
        break;
      }
      case 'resolve': {
        this.withdraw(dt);
        if (this.t > 2) {
          this.setPhase('idle');
          this.scheduleNext(now);
        }
        break;
      }
    }
  }

  private holdCandy(): void {
    this.hand.root.updateMatrixWorld(true);
    this.hand.holdPoint.getWorldPosition(this.candy.position);
  }

  private curl(k: number): void {
    for (const [i, chain] of this.hand.fingers.entries()) {
      const thumb = i >= 3;
      chain.forEach((j, s) => {
        j.rotation.x = -(thumb ? 0.5 : 0.75) * k * (s === 0 ? 0.8 : 1.1);
      });
    }
  }

  private withdraw(dt: number): void {
    if (!this.hand.root.visible) {
      this.doorOpen = Math.max(0, this.doorOpen - dt * 0.8);
      return;
    }
    this.hand.root.position.lerp(this.handFrom, Math.min(1, dt * 0.9));
    this.curl(0.1);
    if (this.hand.root.position.distanceTo(this.handFrom) < 4) this.hand.root.visible = false;
  }

  private impact(now: number): void {
    this.impactAt = now;
    this.shake = 1;
    this.bus.emit({ type: 'sfx', name: 'impact', x: this.landing.x, y: this.landing.y, z: this.landing.z, vol: 1 });
    // the sweet cracks: a heavy core stays, shards scatter
    this.candy.scale.multiplyScalar(0.72);
    const n = 10 + (this.count % 3) * 2;
    const r = this.rng.fork(`shards${this.count}`);
    for (let i = 0; i < n; i++) {
      const g = new THREE.IcosahedronGeometry(r.range(0.28, 0.42), 0);
      const m = new THREE.Mesh(g, this.shardMat);
      m.castShadow = true;
      const a = (i / n) * Math.PI * 2 + r.range(-0.2, 0.2);
      const sp = r.range(2.5, 5.5);
      const s: Shard = {
        mesh: m,
        pos: this.candy.position.clone().add(new THREE.Vector3(Math.cos(a) * 1.4, 0.2, Math.sin(a) * 1.4)),
        vel: new THREE.Vector3(Math.cos(a) * sp, r.range(4, 8), Math.sin(a) * sp),
        taken: false,
        id: i,
      };
      // keep shards inside safe gameplay space
      this.scene.add(m);
      this.shards.push(s);
    }
    this.count++;
    this.onImpact?.(this.candy.position.clone());
  }

  takeShard(i: number): boolean {
    const s = this.shards[i];
    if (!s || s.taken) return false;
    s.taken = true;
    s.mesh.visible = false;
    return true;
  }

  private resolve(now: number): void {
    // whatever is left is claimed by the Authority porters
    let claimed = 0;
    for (const s of this.shards) {
      if (!s.taken) {
        s.taken = true;
        claimed++;
      }
      this.scene.remove(s.mesh);
      s.mesh.geometry.dispose();
    }
    this.authorityShards += claimed;
    this.shards = [];
    this.candy.visible = false;
    this.candy.scale.set(...this.variant.scale);
    if (claimed > 0) this.bus.emit({ type: 'toast', text: `Authority porters claimed ${claimed} shard${claimed === 1 ? '' : 's'} and the core for the Granary.`, kind: 'info' });
    else this.bus.emit({ type: 'toast', text: 'The Authority hauls the candy core to the Granary.', kind: 'info' });
    this.setPhase('resolve');
    void now;
  }

  private applyVariant(): void {
    const v = this.variant;
    (this.candy.material as THREE.MeshPhysicalMaterial).color.setHex(v.colors[0]);
    for (const ch of this.candy.children) ((ch as THREE.Mesh).material as THREE.MeshPhysicalMaterial).color.setHex(v.colors[1]);
    this.shardMat.color.setHex(v.colors[0]);
    this.candy.scale.set(...v.scale);
    this.candy.rotation.set(0, 0, 0);
  }

  /** Data for saving: only the schedule (an event in progress restarts cleanly). */
  serialize() {
    return { count: this.count, nextAt: this.nextAt, community: this.communityShards, authority: this.authorityShards };
  }
}
