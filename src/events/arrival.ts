// Chapter Zero: the drop. A short scripted sequence for new games only.
// A: human scale, an alien child's arm and a shrink device. B: tiny, in the giant green palm.
// C: thrown down the cabinet face. D: waking beside the Sump basin.
import * as THREE from 'three';
import type { Game } from '../game';
import { buildHand } from './candy';
import { Figure } from '../characters/figure';
import { CABINET, TIER_Y } from '../config';
import type { Lamp } from '../world/builder';

/** Scene timings (seconds). */
const T = { zap: 3.6, blackA: 5.2, inB: 6.0, throwAt: 11.4, land: 16.0, inD: 17.5, end: 21.6 };
/** The far-away human-scale set (built below the world, never seen from play). */
const ROOM = new THREE.Vector3(0, -500, 0);
/** Where you wake: just south of the basin, facing the gate. */
export const WAKE = new THREE.Vector3(-30.4, 0, 8.2);

const smooth = (a: number, b: number, t: number) => {
  const k = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

export class Arrival {
  t = 0;
  done = false;
  /** 0..1: how far the left glass pane is slid open */
  paneOpen = 0;
  focus = ROOM.clone();
  private room = new THREE.Group();
  private arm = buildHand();
  private giant = buildHand();
  private device = new THREE.Group();
  private beam: THREE.Mesh;
  private you: Figure;
  private watchers: Figure[] = [];
  private lamp: Lamp;
  private overlay: HTMLDivElement;
  private skipBtn: HTMLButtonElement;
  private fired = new Set<string>();
  private throwFrom = new THREE.Vector3();
  private fov = 55;
  private camEnd: { p: THREE.Vector3; q: THREE.Quaternion } | null = null;

  constructor(
    private g: Game,
    private onDone: () => void,
  ) {
    const R = ROOM;
    const mat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z);
      b.castShadow = b.receiveShadow = true;
      this.room.add(b);
      return b;
    };
    // an ordinary room at human scale: floor, wallpaper, door, a night window, table, mug, lamp
    box(8, 0.05, 8, 0, -0.025, 0, mat(0x7a5236));
    box(8, 3, 0.1, 0, 1.5, -2.6, mat(0x3e5a6e));
    box(0.1, 3, 8, -2.8, 1.5, 0, mat(0x46607a));
    box(0.95, 2.05, 0.06, 1.6, 1.025, -2.53, mat(0x8a5a3a));
    box(0.06, 0.06, 0.06, 1.25, 1.0, -2.48, mat(0xd9b25a, { metalness: 1, roughness: 0.3 }));
    box(1.1, 0.8, 0.04, -1.2, 1.6, -2.53, mat(0x203a66, { emissive: 0x2a4a88, emissiveIntensity: 0.9 }));
    box(1.5, 0.06, 0.85, 0, 0.75, 0, mat(0xc9a06a));
    for (const [x, z] of [[-0.68, -0.36], [0.68, -0.36], [-0.68, 0.36], [0.68, 0.36]]) box(0.06, 0.72, 0.06, x, 0.36, z, mat(0x8a6a3a));
    box(0.5, 0.05, 0.5, 0, 0.45, 0.75, mat(0x6b4a2b));
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 16), mat(0xd9822b));
    mug.position.set(0.3, 0.83, 0.15);
    this.room.add(mug);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.18, 20, 1, true), mat(0xffd9a0, { emissive: 0xffb060, emissiveIntensity: 1.6, side: THREE.DoubleSide }));
    shade.position.set(-0.5, 1.12, -0.2);
    this.room.add(shade);
    box(0.02, 0.32, 0.02, -0.5, 0.94, -0.2, mat(0x3a3a3a));
    // the alien child: knit sweater torso (face out of frame), arm, three-fingered green hand
    const knitA = mat(0x2f7f7a, { roughness: 1 });
    const knitB = mat(0xd9a441, { roughness: 1 });
    for (let i = 0; i < 6; i++) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.28, 0.16, 20), i % 2 ? knitA : knitB);
      ring.position.set(-0.05, 0.95 + i * 0.16, -1.15);
      ring.castShadow = true;
      this.room.add(ring);
    }
    this.arm.root.scale.setScalar(0.028);
    this.arm.root.rotation.y = Math.PI;
    this.arm.root.visible = true;
    this.room.add(this.arm.root);
    // the shrink device: a dull grey body with a green emitter, held under the palm
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.3, 8, 12), mat(0x3a3f4a, { metalness: 0.8, roughness: 0.35 }));
    body.rotation.x = Math.PI / 2;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(1.2, 14, 10), mat(0x7dff6a, { emissive: 0x7dff6a, emissiveIntensity: 2.5 }));
    tip.position.z = -4.4;
    const fin = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.25, 6, 18), mat(0x9aa0a6, { metalness: 1, roughness: 0.3 }));
    fin.position.z = -2.6;
    this.device.add(body, tip, fin);
    this.device.position.set(0, -2.2, -2.4);
    this.arm.root.add(this.device);
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 6), new THREE.MeshBasicMaterial({ color: 0xb8ffb0 }));
    this.beam.visible = false;
    this.room.add(this.beam);
    this.room.position.copy(R);
    g.scene.add(this.room);
    // you, at human scale, seated at the table
    this.you = g.figs.add(g.player.fig.look);
    this.you.state = 'sit';
    this.you.pos.set(R.x, R.y, R.z + 0.75);
    this.you.yaw = Math.PI;
    // the warm lamp feeds the real point-light pool
    this.lamp = { pos: new THREE.Vector3(R.x - 0.5, R.y + 1.05, R.z - 0.2), color: new THREE.Color(0xffb060), intensity: 1.4, range: 6, bake: 0, on: true, flicker: 0 } as Lamp;
    g.renderer.lamps.push(this.lamp);
    // the giant hand outside the glass for scene B (full scale, as in the candy drop)
    this.giant.root.visible = false;
    g.scene.add(this.giant.root);
    // residents watching from shelf edges as you fall past
    for (const [x, ti] of [[-28.6, 2], [-34.2, 1]] as [number, number][]) {
      const w = g.figs.add({ ...g.pop.npcs[0].fig.look, shirt: ti === 2 ? 0xd8ead2 : 0x8a5a44, hat: 'none', apron: undefined });
      const y = g.col.groundAt(x, 11.9, TIER_Y[ti] + 4);
      w.pos.set(x, y, 11.9);
      w.yaw = 0;
      w.state = 'point';
      w.visible = false;
      this.watchers.push(w);
    }
    // fade / flash overlay + skip control
    this.overlay = document.createElement('div');
    this.overlay.className = 'arrival-fade';
    this.skipBtn = document.createElement('button');
    this.skipBtn.className = 'btn small interactive arrival-skip';
    this.skipBtn.textContent = 'Skip intro ▸▸ (Esc)';
    this.skipBtn.dataset.testid = 'skip-intro';
    this.skipBtn.onclick = () => this.finish();
    g.uiRoot.append(this.overlay, this.skipBtn);
    this.fov = g.renderer.camera.fov;
    g.renderer.camera.fov = 36;
    g.renderer.camera.updateProjectionMatrix();
    g.player.fig.visible = false;
  }

  private once(id: string, at: number, fn: () => void): void {
    if (this.t >= at && !this.fired.has(id)) {
      this.fired.add(id);
      fn();
    }
  }

  private sfx(name: string): void {
    this.g.bus.emit({ type: 'sfx', name });
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const t = this.t;
    const g = this.g;
    const cam = g.renderer.camera;
    let shake = 0;
    let fade = 0;
    let flash = 0;
    this.you.t += dt;
    if (t < T.blackA) {
      // ---- A: an ordinary evening. The arm comes down from above, the device comes up. ----
      const R = ROOM;
      this.focus.copy(R);
      const down = smooth(0, 2.4, t);
      this.arm.root.position.set(0.32, 1.9 - 0.72 * down, -0.35);
      this.arm.root.rotation.x = -0.5 + 0.55 * smooth(2.4, 3.4, t);
      this.arm.root.position.y += Math.sin(t * 1.7) * 0.01;
      cam.position.set(R.x + 0.42, R.y + 1.22, R.z + 1.45);
      cam.lookAt(R.x - 0.05, R.y + 1.0, R.z - 0.7);
      this.you.state = t > 2.6 ? 'hurt' : 'sit';
      this.once('voiceA', 1.2, () => this.sfx('voice'));
      this.once('zap', T.zap, () => this.sfx('zap'));
      if (t > T.zap && t < T.zap + 0.6) {
        const tip = new THREE.Vector3();
        (this.device.children[1] as THREE.Object3D).getWorldPosition(tip);
        const head = this.you.pos.clone().add(new THREE.Vector3(0, 1.05, 0));
        this.beam.visible = Math.sin(t * 90) > -0.3;
        this.beam.position.copy(tip.clone().add(head).multiplyScalar(0.5).sub(R));
        const jit = 1.5 + Math.sin(t * 173) * 1.2;
        this.beam.scale.set(jit, tip.distanceTo(head), jit);
        this.beam.lookAt(head);
        this.beam.rotateX(Math.PI / 2);
        flash = 1 - (t - T.zap) / 0.6;
        shake = 0.04;
      } else this.beam.visible = false;
      g.canvas.style.filter = t > T.zap && t < T.zap + 0.8 ? `hue-rotate(${Math.round((t - T.zap) * 400)}deg) saturate(2.2) blur(${(Math.sin(t * 60) + 1).toFixed(1)}px)` : '';
      fade = smooth(T.zap + 0.6, T.blackA, t);
    } else if (t < T.throwAt) {
      // ---- B: tiny, in the giant palm, carried to the glass ----
      this.once('toB', T.blackA, () => {
        this.room.visible = false;
        this.you.visible = false;
        g.canvas.style.filter = '';
        cam.fov = 48;
        cam.updateProjectionMatrix();
        this.giant.root.visible = true;
        g.player.fig.visible = true;
        g.renderer.bokeh.enabled = true;
      });
      const k = smooth(T.inB, T.throwAt - 1.2, t);
      const h = this.giant.root;
      h.position.set(-31 + Math.sin(t * 0.7) * 0.4, 96 + Math.sin(t * 1.1) * 0.35, 34 - 17.2 * k);
      const tilt = -0.62 * smooth(T.throwAt - 1.0, T.throwAt, t);
      h.rotation.set(tilt + Math.sin(t * 0.9) * 0.03, 0, Math.sin(t * 0.6) * 0.04);
      const curl = 0.1 + 0.3 * smooth(T.throwAt - 2.2, T.throwAt - 0.8, t);
      for (const [i, chain] of this.giant.fingers.entries()) chain.forEach((j, s) => (j.rotation.x = -(i >= 3 ? 0.5 : 0.75) * curl * (s === 0 ? 0.8 : 1.1)));
      this.paneOpen = smooth(T.inB + 0.8, T.inB + 3.2, t);
      // you sit on the palm, facing the cabinet
      h.updateMatrixWorld(true);
      const seat = new THREE.Vector3(0.2, 1.22, -0.6).applyMatrix4(h.matrixWorld);
      const f = g.player.fig;
      f.pos.copy(seat);
      f.yaw = Math.PI;
      f.state = t > T.throwAt - 1.4 ? 'hurt' : 'sit';
      f.t += dt;
      this.throwFrom.copy(seat);
      const eye = new THREE.Vector3(2.6, 2.1, 2.2).applyMatrix4(h.matrixWorld);
      cam.position.copy(eye);
      cam.lookAt(seat.x - 1.5, seat.y + 0.4, seat.z - 8);
      this.focus.copy(seat);
      (g.renderer.bokeh.uniforms as any).focus.value = eye.distanceTo(seat);
      this.once('voice1', T.inB + 0.6, () => this.sfx('voice'));
      this.once('voice2', T.inB + 2.8, () => this.sfx('voice'));
      shake = (t > T.inB + 0.6 && t < T.inB + 1.8) || (t > T.inB + 2.8 && t < T.inB + 4) ? 0.06 : 0.01;
      fade = 1 - smooth(T.blackA + 0.2, T.inB + 0.8, t);
    } else if (t < T.inD) {
      // ---- C: thrown, falling down the gap between shelf fronts and glass ----
      this.once('toC', T.throwAt, () => {
        this.sfx('whoosh');
        for (const w of this.watchers) w.visible = true;
      });
      const f = g.player.fig;
      const k = Math.min(1, (t - T.throwAt) / (T.land - T.throwAt));
      const basin = g.wd.sump!.basin;
      const yEnd = basin.y + 0.15;
      f.pos.set(
        THREE.MathUtils.lerp(this.throwFrom.x, basin.x, smooth(0.75, 1, k)),
        THREE.MathUtils.lerp(this.throwFrom.y, yEnd, Math.pow(k, 1.7)),
        k < 0.12 ? THREE.MathUtils.lerp(this.throwFrom.z, CABINET.glassZ - 1.1, k / 0.12) : THREE.MathUtils.lerp(CABINET.glassZ - 1.1, basin.z, smooth(0.8, 1, k)),
      );
      f.state = k < 1 ? 'fall' : 'down';
      f.t += dt;
      f.yaw += dt * 1.3 * (1 - k);
      this.giant.root.position.z += dt * 6;
      this.paneOpen = 1 - smooth(T.throwAt + 1, T.land, t);
      for (const w of this.watchers) {
        w.t += dt;
        w.yaw = Math.atan2(f.pos.x - w.pos.x, f.pos.z - w.pos.z);
      }
      if (k < 1) {
        cam.position.set(f.pos.x + 2.6, f.pos.y + 1.6 + 2 * (1 - k), f.pos.z + 4.2);
        cam.lookAt(f.pos.x, f.pos.y - 0.6, f.pos.z - 1);
      }
      this.focus.copy(f.pos);
      (g.renderer.bokeh.uniforms as any).focus.value = cam.position.distanceTo(f.pos);
      this.once('splash', T.land, () => {
        this.sfx('splash');
        g.fx.burst(basin.clone().setY(basin.y + 0.4), 40);
        this.giant.root.visible = false;
      });
      shake = t > T.land && t < T.land + 0.4 ? 0.12 : 0.015;
      fade = smooth(T.land + 0.05, T.land + 0.5, t);
    } else {
      // ---- D: waking beside the basin ----
      this.once('toD', T.inD, () => {
        for (const w of this.watchers) w.visible = false;
        g.renderer.bokeh.enabled = false;
        cam.fov = this.fov;
        cam.updateProjectionMatrix();
        g.player.place(WAKE, Math.PI / 2);
      });
      const f = g.player.fig;
      f.t += dt;
      f.state = t < T.inD + 1.6 ? 'down' : t < T.inD + 3.0 ? 'sit' : 'idle';
      this.once('cough1', T.inD + 0.9, () => this.sfx('cough'));
      this.once('cough2', T.inD + 1.9, () => this.sfx('cough'));
      const close = new THREE.Vector3(WAKE.x + 1.3, WAKE.y + 0.75 + smooth(T.inD + 1.6, T.inD + 3, t) * 0.5, WAKE.z + 1.5);
      const look = WAKE.clone().add(new THREE.Vector3(0, 0.3 + smooth(T.inD + 1.6, T.inD + 3, t) * 0.6, 0));
      cam.position.copy(close);
      cam.lookAt(look);
      // blend into the normal third-person rig over the last second
      if (t > T.end - 1.1) {
        if (!this.camEnd) {
          g.cam.yaw = Math.PI / 2 + Math.PI;
          g.cam.dist = Math.min(g.cam.dist, 4.2);
          g.cam.snap(g.focusPoint());
          this.camEnd = { p: cam.position.clone(), q: cam.quaternion.clone() };
          cam.position.copy(close);
          cam.lookAt(look);
        }
        const b = smooth(T.end - 1.1, T.end, t);
        cam.position.lerp(this.camEnd.p, b);
        cam.quaternion.slerp(this.camEnd.q, b);
      }
      this.focus.copy(WAKE);
      fade = 1 - smooth(T.inD, T.inD + 0.9, t);
      if (t >= T.end) this.finish();
    }
    if (shake > 0) {
      cam.position.x += Math.sin(t * 61) * shake;
      cam.position.y += Math.sin(t * 47 + 1) * shake;
    }
    this.overlay.style.background = flash > fade ? '#f4fff0' : '#000';
    this.overlay.style.opacity = String(Math.max(flash, fade));
  }

  /** End (or skip): everything the sequence would have set up, set up. */
  finish(): void {
    if (this.done) return;
    this.done = true;
    const g = this.g;
    this.g.scene.remove(this.room, this.giant.root);
    for (const root of [this.room, this.giant.root])
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
    g.figs.remove(this.you);
    for (const w of this.watchers) g.figs.remove(w);
    const li = g.renderer.lamps.indexOf(this.lamp);
    if (li >= 0) g.renderer.lamps.splice(li, 1);
    this.overlay.remove();
    this.skipBtn.remove();
    g.canvas.style.filter = '';
    g.renderer.bokeh.enabled = false;
    g.renderer.camera.fov = this.fov;
    g.renderer.camera.updateProjectionMatrix();
    this.paneOpen = 0;
    g.player.fig.visible = true;
    g.player.place(WAKE, Math.PI / 2);
    this.onDone();
  }
}
