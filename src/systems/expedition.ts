// The first expedition outside the cabinet: the tin spider and its web, loose silk, the wrapped beetle, the climbing
// line and the cargo line up to Lacquer Court. Everything runs on sim time; progress lives in story flags (saved).
import * as THREE from 'three';
import type { Game } from '../game';
import type { Body } from '../physics/collision';
import type { Hotspot } from '../world/worldData';
import { CLIMB, FLOOR_Y, WEB, outside } from '../world/outside';

type SpiderState = 'hub' | 'feed' | 'investigate' | 'climb' | 'descend' | 'hunt' | 'rear' | 'crouch' | 'leap' | 'recover' | 'retreat' | 'dead';

const MAX_HP = 80;
const LEASH = 18;
const BUNDLE = new THREE.Vector3(WEB.x, FLOOR_Y + 3.2, -26.2);
const WEB_FOOT = new THREE.Vector3(WEB.x - 0.8, FLOOR_Y, -31);
const ON_WEB: SpiderState[] = ['hub', 'feed', 'investigate', 'climb', 'descend'];

export class Expedition {
  state: SpiderState = 'hub';
  hp = MAX_HP;
  t = 0;
  /** where it is: on the web this is set directly; on the floor it follows `body` */
  pos = WEB.hub.clone();
  body: Body = { pos: WEB_FOOT.clone(), vel: new THREE.Vector3(), radius: 1.0, height: 1.2, grounded: false, ground: null };
  private webTarget = WEB.hub.clone();
  private yaw = 0;
  private gait = 0;
  private flash = 0;
  private hit = false;
  private recoverFor = 0.9;
  private leapCd = 0;
  private respawnAt = 0;
  private shakeCd = 0;
  private silkReady: Record<string, number> = {};
  private beetleTaken = false;
  private climb: { from: THREE.Vector3; to: THREE.Vector3; t: number } | null = null;
  private group = new THREE.Group();
  private legs: THREE.Mesh[] = [];
  private bodyMat: THREE.MeshStandardMaterial;

  constructor(private g: Game) {
    this.bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.6, emissive: new THREE.Color(0x000000) });
    const legMat = new THREE.MeshStandardMaterial({ color: 0x2a1e16, roughness: 0.8 });
    const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 12), this.bodyMat);
    abdomen.scale.set(1, 0.85, 1.35);
    abdomen.position.set(0, 0.1, -0.9);
    const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 10), this.bodyMat);
    thorax.position.set(0, 0, 0.15);
    // pale chevrons on the abdomen and a cluster of eyes: its own markings, not a real species
    const mark = new THREE.MeshStandardMaterial({ color: 0xc9b48a, roughness: 0.7 });
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.7 - i * 0.15, 0.05, 0.12), mark);
      m.position.set(0, 0.8, -0.55 - i * 0.35);
      this.group.add(m);
    }
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: new THREE.Color(0x401010), roughness: 0.2 });
    for (const [x, y] of [[-0.12, 0.25], [0.12, 0.25], [-0.25, 0.15], [0.25, 0.15]]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), eyeMat);
      e.position.set(x, y, 0.55);
      this.group.add(e);
    }
    this.group.add(abdomen, thorax);
    const seg = new THREE.CylinderGeometry(0.06, 0.05, 1, 6);
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(seg, legMat);
      m.castShadow = true;
      this.legs.push(m);
      this.group.add(m);
    }
    abdomen.castShadow = thorax.castShadow = true;
    g.scene.add(this.group);
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }
  private get onWeb(): boolean {
    return ON_WEB.includes(this.state);
  }
  private set(s: SpiderState): void {
    this.state = s;
    this.t = 0;
  }

  /** something shook the web at `at`. While it feeds it only notices when you are close. */
  shake(at: THREE.Vector3, lure = false): void {
    if (!this.alive) return;
    const p = this.g.player.body.pos;
    // busy feeding, or already off chasing a pluck: a quiet cut far away goes unnoticed
    if ((this.state === 'feed' || this.state === 'investigate') && !lure && this.pos.distanceTo(p) > 6) return;
    if (this.state === 'hub' || this.state === 'feed' || this.state === 'climb' || this.state === 'investigate') {
      this.webTarget.set(WEB.x, Math.max(at.y, FLOOR_Y + 1.2), Math.min(WEB.z1 - 1, Math.max(WEB.z0 + 1, at.z)));
      this.set('investigate');
      this.g.bus.emit({ type: 'sfx', name: 'skitter', vol: 0.7 });
    }
  }

  /** the spider as a target for jabs and sling shots */
  targets(): { c: THREE.Vector3; r: number; assist: boolean; hurt: (n: number, push: THREE.Vector3) => void }[] {
    if (!this.alive) return [];
    return [{ c: this.pos.clone().add(new THREE.Vector3(0, this.onWeb ? 0 : 0.6, 0)), r: 1.1, assist: true, hurt: (n, push) => this.hurt(n, push) }];
  }

  private hurt(n: number, push: THREE.Vector3): void {
    const g = this.g;
    // caught recovering from a bite or a missed leap: double damage
    this.hp -= this.state === 'recover' ? n * 2 : n;
    this.flash = 0.15;
    if (this.hp <= 0) {
      this.set('dead');
      this.respawnAt = g.simTime + 300;
      g.state.add('silk', 4, true);
      g.state.add('fang', 1, true);
      g.bus.emit({ type: 'toast', text: 'The tin spider folds its legs. You cut 4 silk from its spinnerets, and take a fang.', kind: 'good' });
      return;
    }
    if (this.onWeb) {
      // shot off its web: it drops to deal with you
      this.body.pos.copy(this.pos);
      this.set('descend');
    } else this.body.vel.add(push.clone().multiplyScalar(0.4));
  }

  // ---------- hotspots ----------
  labels(h: Hotspot): [string | null, string | null] {
    const g = this.g;
    const flags = g.story.flags;
    switch (h.data.what) {
      case 'silk': {
        const wait = (this.silkReady[h.id] ?? 0) - g.simTime;
        return [wait > 0 ? `Cut clean (${Math.ceil(wait)}s)` : 'Cut loose silk', 'Pluck the thread (lure)'];
      }
      case 'beetle':
        return [this.beetleTaken ? 'Picked clean' : this.state === 'feed' ? 'The spider is feeding on it' : 'Cut down the wrapped beetle', null];
      case 'climb':
        if (h.data.end === 'foot') return [flags.has('climbRigged') ? 'Climb the line' : null, null];
        return [flags.has('climbRigged') ? 'Climb down the line' : g.state.count('rope') ? 'Rig the climbing line' : 'A pin for a line (make one at a bench)', null];
      case 'cargo':
        return [g.state.count('cable') ? 'String the cargo cable' : 'The cargo line: its cable has rotted through', null];
      case 'ruins':
        return ['Read the fallen sign', null];
    }
    return [null, null];
  }

  act(h: Hotspot, key: 'E' | 'F'): void {
    const g = this.g;
    const st = g.state;
    const toast = (text: string, kind: 'info' | 'good' | 'bad' = 'info') => g.bus.emit({ type: 'toast', text, kind });
    switch (h.data.what) {
      case 'silk': {
        if (key === 'F') {
          toast('You pluck the anchor thread. The whole web hums.');
          this.shake(h.pos.clone().setY(FLOOR_Y + 2), true);
          return;
        }
        if ((this.silkReady[h.id] ?? 0) > g.simTime) return toast('Nothing loose left here yet.');
        g.player.startAction('dig', h.pos, () => {
          if (st.add('silk', 2) === 0) return toast('Your pack is full.', 'bad');
          this.silkReady[h.id] = g.simTime + 90;
          toast('You saw through two strands of silk. The web jerks.', 'good');
          this.shake(h.pos.clone().setY(FLOOR_Y + 2));
        });
        return;
      }
      case 'beetle': {
        if (this.beetleTaken) return toast('Only the husk is left.');
        if (this.state === 'feed') {
          this.shake(BUNDLE, true);
          return toast('It turns from its meal toward you.', 'bad');
        }
        g.player.startAction('dig', h.pos, () => {
          this.beetleTaken = true;
          st.add('meat', 1, true);
          st.add('shell', 1, true);
          st.add('silk', 1, true);
          toast('You cut the bundle down: beetle meat, a shell plate, a strand of silk.', 'good');
          this.shake(BUNDLE);
        });
        return;
      }
      case 'climb': {
        const rigged = g.story.flags.has('climbRigged');
        if (!rigged) {
          if (h.data.end !== 'top') return;
          if (!st.remove('rope', 1)) return toast('You need a climbing line. Silk and fabric, at a bench.', 'bad');
          g.story.flags.add('climbRigged');
          g.bus.emit({ type: 'sfx', name: 'repair' });
          toast('You knot the line around the pin and drop it over the edge.', 'good');
          g.save();
          return;
        }
        const up = h.data.end === 'foot';
        this.climb = { from: g.player.body.pos.clone(), to: (up ? CLIMB.top : CLIMB.foot).clone(), t: 0 };
        g.bus.emit({ type: 'sfx', name: 'whoosh', vol: 0.6 });
        return;
      }
      case 'cargo': {
        if (g.story.flags.has('cargoFixed')) return;
        if (!st.remove('cable', 1)) return toast('The old cable is mush. Twist 4 silk into cable at a bench.', 'bad');
        g.story.flags.add('cargoFixed');
        g.wd.lifts.get('cargo')!.working = true;
        g.bus.emit({ type: 'sfx', name: 'repair' });
        toast('You thread the new cable over the spool. The cargo line creaks awake.', 'good');
        g.save();
        return;
      }
      case 'ruins':
        g.ui.showCard('Lacquer Court', 'A gold-leaf sign, face down in the dust: LACQUER COURT · RESIDENTS ONLY. When the shelf tipped, the townhouses slid into the back panel and the Authority sealed the street from the Heights side. Nobody came back for what was left.');
        return;
    }
  }

  // ---------- per tick ----------
  update(dt: number): void {
    const g = this.g;
    const now = g.simTime;
    const flags = g.story.flags;
    // hotspots that only make sense once something is built
    const fixed = flags.has('cargoFixed');
    for (const id of ['lift-cargo-low', 'lift-cargo-top']) g.wd.hotspots.get(id)!.enabled = fixed;
    g.wd.hotspots.get('cargo-fit')!.enabled = !fixed;
    const climbG = g.wd.groups.get('climbLine');
    if (climbG) climbG.visible = flags.has('climbRigged');
    if (!flags.has('ruinsSeen') && g.district === 'lacquer') {
      flags.add('ruinsSeen');
      g.bus.emit({ type: 'toast', text: 'Lacquer Court. Nobody has lived here since the shelf tipped.', kind: 'info' });
    }

    // climbing tween (overrides the player's own movement for its duration)
    if (this.climb) {
      const c = this.climb;
      c.t = Math.min(1, c.t + dt / 2.2);
      const b = g.player.body;
      b.pos.lerpVectors(c.from, c.to, c.t);
      b.vel.set(0, 0, 0);
      g.player.fig.state = 'idle';
      if (c.t >= 1) {
        g.player.place(c.to.clone().add(new THREE.Vector3(0, 0.05, 0)), g.player.fig.yaw);
        this.climb = null;
      }
    }

    // walking into the web shakes it
    const pp = g.player.body.pos;
    this.shakeCd -= dt;
    if (this.shakeCd <= 0 && Math.abs(pp.x - WEB.x) < 0.8 && pp.z > WEB.z0 && pp.z < WEB.z1 && pp.y < WEB.y1) {
      this.shakeCd = 1.5;
      g.bus.emit({ type: 'toast', text: 'You blunder into the web. It shivers all the way up.', kind: 'bad' });
      this.shake(pp.clone().setY(pp.y + 1), true);
    }
    this.updateSpider(dt, now);
    this.render(now);
  }

  private updateSpider(dt: number, now: number): void {
    const g = this.g;
    const pp = g.player.body.pos;
    if (this.state === 'dead') {
      if (now > this.respawnAt && (pp.distanceTo(WEB.hub) > 30 || !outside(pp))) {
        this.hp = MAX_HP;
        this.beetleTaken = false;
        this.pos.copy(WEB.hub);
        this.set('hub');
      }
      return;
    }
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.leapCd -= dt;
    const playerOut = outside(pp) && g.mode === 'play';
    const dHub = Math.hypot(pp.x - WEB.hub.x, pp.z - WEB.hub.z);
    const d3 = this.pos.distanceTo(pp);
    const webMove = (to: THREE.Vector3, speed: number): boolean => {
      const step = speed * dt;
      const d = this.pos.distanceTo(to);
      if (d <= step) {
        this.pos.copy(to);
        return true;
      }
      this.pos.lerp(to, step / d);
      this.gait += step * 3;
      return false;
    };
    const b = this.body;
    const steer = (tx: number, tz: number, speed: number) => {
      const sx = tx - b.pos.x, sz = tz - b.pos.z;
      const l = Math.hypot(sx, sz) || 1;
      b.vel.x += ((sx / l) * speed - b.vel.x) * Math.min(1, dt * 8);
      b.vel.z += ((sz / l) * speed - b.vel.z) * Math.min(1, dt * 8);
      this.yaw = Math.atan2(sx, sz);
    };
    const stop = () => {
      b.vel.x *= Math.exp(-dt * 10);
      b.vel.z *= Math.exp(-dt * 10);
    };
    const face = () => (this.yaw = Math.atan2(pp.x - b.pos.x, pp.z - b.pos.z));
    const wantsOut = !playerOut || dHub > LEASH || this.hp < MAX_HP * 0.3;

    switch (this.state) {
      case 'hub':
        webMove(WEB.hub, 4);
        this.hp = Math.min(MAX_HP, this.hp + 4 * dt);
        if (this.t > 20) this.set('feed');
        else if (playerOut && d3 < 5) this.drop();
        break;
      case 'feed':
        webMove(BUNDLE, 4);
        if (this.t > 25) this.set('climb');
        else if (playerOut && d3 < 3) this.drop();
        break;
      case 'investigate': {
        // it freezes to feel where the pull came from, then runs along the threads
        if (this.t < 0.8) break;
        const there = webMove(this.webTarget, 7);
        if (there && playerOut && !wantsOut && d3 < 8 && pp.y < FLOOR_Y + 1) this.drop();
        else if (this.t > 8) this.set('climb');
        break;
      }
      case 'climb':
        if (webMove(WEB.hub, 5)) this.set('hub');
        break;
      case 'descend':
        if (webMove(new THREE.Vector3(WEB_FOOT.x, FLOOR_Y, this.pos.z), 9)) {
          b.pos.copy(this.pos);
          b.vel.set(0, 0, 0);
          this.set('hunt');
        }
        break;
      case 'hunt': {
        if (wantsOut) {
          this.set('retreat');
          break;
        }
        const d = Math.hypot(pp.x - b.pos.x, pp.z - b.pos.z);
        steer(pp.x, pp.z, 5);
        if (d < 2.4) this.set('rear');
        else if (d > 4 && d < 8 && this.leapCd <= 0 && this.t > 0.6) this.set('crouch');
        break;
      }
      case 'rear':
        // tell: it rears up and spreads its front legs; then bites
        stop();
        face();
        if (this.t > 0.5) {
          if (Math.hypot(pp.x - b.pos.x, pp.z - b.pos.z) < 2.2 && Math.abs(pp.y - b.pos.y) < 1.5) g.underfall.hurtPlayer(14);
          g.bus.emit({ type: 'sfx', name: 'jab', vol: 0.8 });
          this.recoverFor = 0.9;
          this.set('recover');
        }
        break;
      case 'crouch':
        // tell: it sinks low and goes still; then leaps at where you stood
        stop();
        face();
        if (this.t > 0.7) {
          const dx = pp.x - b.pos.x, dz = pp.z - b.pos.z, d = Math.hypot(dx, dz) || 1;
          const v = Math.max(8, Math.min(15, d * 2.2));
          b.vel.set((dx / d) * v, 6, (dz / d) * v);
          b.grounded = false;
          this.hit = false;
          this.leapCd = 4;
          this.set('leap');
          g.bus.emit({ type: 'sfx', name: 'skitter' });
        }
        break;
      case 'leap':
        if (!this.hit && b.pos.distanceTo(pp) < 1.7) {
          this.hit = true;
          g.underfall.hurtPlayer(16);
        }
        if (b.grounded && this.t > 0.2) {
          this.recoverFor = this.hit ? 0.6 : 1.2;
          this.set('recover');
        }
        break;
      case 'recover':
        stop();
        if (this.t > this.recoverFor) this.set('hunt');
        break;
      case 'retreat':
        steer(WEB_FOOT.x, WEB_FOOT.z, 5.5);
        if (Math.hypot(b.pos.x - WEB_FOOT.x, b.pos.z - WEB_FOOT.z) < 1.2) {
          this.pos.copy(b.pos);
          this.set('climb');
        }
        // you came back at it before it got home
        else if (!wantsOut && this.t > 2) this.set('hunt');
        break;
    }
    if (!this.onWeb) {
      const before = b.pos.clone();
      g.col.moveBody(b, dt, 0.5);
      this.gait += before.distanceTo(b.pos) * 3;
      this.pos.copy(b.pos);
    }
  }

  private drop(): void {
    this.body.pos.copy(this.pos);
    this.set('descend');
    this.g.bus.emit({ type: 'sfx', name: 'skitter' });
  }

  private render(now: number): void {
    const gp = this.group;
    gp.visible = this.alive;
    if (!this.alive) return;
    const web = this.onWeb && this.state !== 'descend';
    // on the web it hangs head-down with its back to the room; on the floor it stands on its legs
    const up = web ? new THREE.Vector3(-1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const fwd = web ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3().crossVectors(up, fwd);
    gp.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, fwd));
    const low = this.state === 'crouch' ? -0.35 : this.state === 'rear' ? 0.35 : 0;
    gp.position.copy(this.pos).addScaledVector(up, 0.7 + low);
    this.bodyMat.emissive.setRGB(this.flash * 4, this.flash * 2, this.flash);
    const rear = this.state === 'rear';
    const yUp = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();
    for (let k = 0; k < 8; k++) {
      const side = k < 4 ? 1 : -1, i = k % 4;
      const along = (1.5 - i) * 0.45;
      const swing = Math.sin(this.gait + k * 1.7) * 0.35;
      const lift = rear && i === 0 ? 1.4 : 0;
      const hip = new THREE.Vector3(side * 0.3, 0, 0.15 + along * 0.3);
      const foot = new THREE.Vector3(side * 2.1, -0.7 - low + lift, along * 1.7 + swing + (rear && i === 0 ? 0.8 : 0));
      const knee = hip.clone().lerp(foot, 0.45).add(new THREE.Vector3(side * 0.1, 0.9, 0));
      for (const [s, a, c] of [[k * 2, hip, knee], [k * 2 + 1, knee, foot]] as const) {
        const m = this.legs[s], v = c.clone().sub(a);
        m.position.copy(a).add(c).multiplyScalar(0.5);
        m.quaternion.copy(q.setFromUnitVectors(yUp, v.clone().normalize()));
        m.scale.set(1, v.length(), 1);
      }
    }
    void now;
  }

  /** test/debug view of the spider */
  debug(): { state: SpiderState; hp: number; pos: number[] } {
    return { state: this.state, hp: Math.round(this.hp), pos: this.pos.toArray().map((v) => +v.toFixed(2)) };
  }
}
