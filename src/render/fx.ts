// Small-scale life: water drips, steam, lit dust motes, impact dust, and the objective marker.
import * as THREE from 'three';
import { Rng } from '../core/rng';

function softDot(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

interface Particle {
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  max: number;
  size: number;
}

export class Fx {
  private drops: { mesh: THREE.Mesh; src: THREE.Vector3; t: number; period: number; floor: number }[] = [];
  private steamSrc: THREE.Vector3[] = [];
  private puffs: Particle[] = [];
  private dust: Particle[] = [];
  private steamPts: THREE.Points;
  private dustPts: THREE.Points;
  private burstPts: THREE.Points;
  marker: THREE.Group;
  private rng: Rng;

  constructor(
    private scene: THREE.Scene,
    seed: number,
    drips: THREE.Vector3[],
    steam: THREE.Vector3[],
    groundAt: (x: number, z: number, y: number) => number,
  ) {
    this.rng = new Rng(seed).fork('fx');
    const dropMat = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.8, envMapIntensity: 3 });
    const dropGeo = new THREE.SphereGeometry(0.09, 10, 8);
    for (const d of drips) {
      const m = new THREE.Mesh(dropGeo, dropMat);
      m.scale.set(1, 1.6, 1);
      scene.add(m);
      const floor = groundAt(d.x, d.z, d.y - 0.1);
      this.drops.push({ mesh: m, src: d.clone(), t: this.rng.range(0, 1), period: this.rng.range(1.1, 1.8), floor: isFinite(floor) ? floor : d.y - 3 });
    }
    this.steamSrc = steam;
    const dot = softDot();
    const mk = (n: number, color: number, size: number, blending: THREE.Blending, opacity: number) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const pts = new THREE.Points(g, new THREE.PointsMaterial({ color, size, map: dot, transparent: true, depthWrite: false, blending, opacity, sizeAttenuation: true }));
      pts.frustumCulled = false;
      scene.add(pts);
      return pts;
    };
    this.steamPts = mk(160, 0xe8e4dc, 0.9, THREE.NormalBlending, 0.22);
    this.dustPts = mk(260, 0xffe2b0, 0.07, THREE.AdditiveBlending, 0.8);
    this.burstPts = mk(220, 0xd8c8a8, 1.2, THREE.NormalBlending, 0.45);
    for (let i = 0; i < 260; i++) this.dust.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 1, size: 1 });
    // objective marker: a hand-cut paper diamond
    this.marker = new THREE.Group();
    const dia = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.6, 0.6) }));
    dia.scale.set(0.8, 1.3, 0.8);
    this.marker.add(dia);
    this.marker.visible = false;
    scene.add(this.marker);
  }

  burst(at: THREE.Vector3, n = 120): void {
    for (let i = 0; i < n; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const sp = this.rng.range(1.5, 6);
      this.puffs.push({
        p: at.clone().add(new THREE.Vector3(Math.cos(a) * 1.2, 0.2, Math.sin(a) * 1.2)),
        v: new THREE.Vector3(Math.cos(a) * sp, this.rng.range(0.5, 3.5), Math.sin(a) * sp),
        life: 0,
        max: this.rng.range(1.2, 2.6),
        size: 1,
      });
    }
  }

  update(dt: number, time: number, cam: THREE.Vector3, markerAt: THREE.Vector3 | null): void {
    // drips: fall, splash, repeat
    for (const d of this.drops) {
      d.t += dt / d.period;
      if (d.t > 1) d.t -= 1;
      const fallT = Math.max(0, (d.t - 0.6) / 0.4);
      const y = d.src.y - fallT * fallT * (d.src.y - d.floor);
      d.mesh.position.set(d.src.x, y, d.src.z);
      d.mesh.scale.setScalar(d.t < 0.6 ? 0.4 + d.t : 1);
      d.mesh.scale.y = d.t < 0.6 ? 0.8 + d.t : 1.8;
    }
    // steam puffs + burst dust share the update loop
    if (this.steamSrc.length && this.rng.chance(dt * 18)) {
      const s = this.rng.pick(this.steamSrc);
      if (s.distanceToSquared(cam) < 60 * 60)
        this.puffs.push({ p: s.clone().add(new THREE.Vector3(this.rng.range(-0.2, 0.2), 0, this.rng.range(-0.2, 0.2))), v: new THREE.Vector3(this.rng.range(-0.1, 0.1), 0.7, this.rng.range(-0.1, 0.1)), life: 0, max: 2.4, size: 0.6 });
    }
    const steamPos = this.steamPts.geometry.getAttribute('position') as THREE.BufferAttribute;
    const burstPos = this.burstPts.geometry.getAttribute('position') as THREE.BufferAttribute;
    let si = 0, bi = 0;
    this.puffs = this.puffs.filter((p) => {
      p.life += dt;
      if (p.life > p.max) return false;
      p.v.multiplyScalar(Math.exp(-dt * 1.5));
      p.p.addScaledVector(p.v, dt);
      if (p.size < 1) {
        if (si < steamPos.count) steamPos.setXYZ(si++, p.p.x, p.p.y, p.p.z);
      } else if (bi < burstPos.count) burstPos.setXYZ(bi++, p.p.x, p.p.y, p.p.z);
      return true;
    });
    for (let i = si; i < steamPos.count; i++) steamPos.setXYZ(i, 0, -9999, 0);
    for (let i = bi; i < burstPos.count; i++) burstPos.setXYZ(i, 0, -9999, 0);
    steamPos.needsUpdate = true;
    burstPos.needsUpdate = true;
    // dust motes drifting around the camera, catching the light
    const dp = this.dustPts.geometry.getAttribute('position') as THREE.BufferAttribute;
    this.dust.forEach((d, i) => {
      d.life -= dt;
      if (d.life <= 0 || d.p.distanceToSquared(cam) > 14 * 14) {
        d.p.set(cam.x + this.rng.range(-12, 12), cam.y + this.rng.range(-4, 6), cam.z + this.rng.range(-12, 12));
        d.v.set(this.rng.range(-0.05, 0.05), this.rng.range(-0.02, 0.04), this.rng.range(-0.05, 0.05));
        d.life = this.rng.range(4, 10);
      }
      d.p.x += (d.v.x + Math.sin(time * 0.3 + i) * 0.02) * dt;
      d.p.y += d.v.y * dt;
      d.p.z += (d.v.z + Math.cos(time * 0.27 + i) * 0.02) * dt;
      dp.setXYZ(i, d.p.x, d.p.y, d.p.z);
    });
    dp.needsUpdate = true;
    // marker bob
    if (markerAt) {
      this.marker.visible = true;
      this.marker.position.set(markerAt.x, markerAt.y + 2.6 + Math.sin(time * 2.5) * 0.15, markerAt.z);
      this.marker.rotation.y = time * 1.6;
    } else this.marker.visible = false;
  }
}
