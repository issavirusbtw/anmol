// The Underfall: weapons (Pick, Snapband), Dust Hoppers, Duke Tallow's Tallymen, Falls and the cart.
// Everything here runs on sim time and real input; tests drive it through keys/clicks.
import * as THREE from 'three';
import type { Game } from '../game';
import { Body } from '../physics/collision';
import { Figure } from '../characters/figure';
import { Item, ITEMS } from './state';
import { S } from './story';
import { Rng } from '../core/rng';
import { SUMP_X } from '../world/sump';

interface Spider {
  body: Body;
  hp: number;
  home: THREE.Vector3;
  state: 'lurk' | 'stalk' | 'rear' | 'lunge' | 'recover' | 'return';
  t: number;
  yaw: number;
  alive: boolean;
  respawnAt: number;
  hit: boolean;
  flash: number;
  gait: number;
}

interface Tallyman {
  fig: Figure;
  body: Body;
  hp: number;
  state: 'patrol' | 'race' | 'haul' | 'fight' | 'down';
  t: number;
  wp: number;
  carry: Item[];
  target: Pickup | null;
  strikeAt: number;
  windup: number;
  provokedUntil: number;
}

interface Pickup {
  id: number;
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  item: Item;
  qty: number;
  taken: boolean;
  /** set for a multiplayer loot bag: the server decides who gets it */
  netBag?: number;
}

interface Shot {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  dmg: number;
  life: number;
}

const FALLS: { name: string; w: number; items: [Item, number][] }[] = [
  { name: 'A crumb fall', w: 40, items: [['food', 1]] },
  { name: 'A wrapper fall', w: 25, items: [['foil', 1]] },
  { name: 'A pin spill', w: 20, items: [['metal', 1], ['grit', 4]] },
  { name: 'A button cell!', w: 8, items: [['electronics', 1]] },
  { name: 'A stray sweet!', w: 7, items: [['candy', 1]] },
];

const PATROL = [new THREE.Vector3(-28.5, 0, 9.6), new THREE.Vector3(-36, 0, 10.6), new THREE.Vector3(-44, 0, 8.0)];
const DOWN_TIME = 20;
const CLAIMS = new THREE.Vector3(-26.5, 0, 9.9);
const WARN = 5;

export class Underfall {
  spiders: Spider[] = [];
  tallymen: Tallyman[] = [];
  pickups: Pickup[] = [];
  shots: Shot[] = [];
  cart: Partial<Record<Item, number>> = {};
  dukeTally = 0;
  playerTally = 0;
  paused = false;
  forceGateOpen = false;
  nextFall = Infinity;
  fallAt = Infinity;
  fallName = '';
  drawing = false;
  charge = 0;
  private lastAttack = -9;
  private combo = 0;
  private actionUntil = 0;
  private nextId = 1;
  private rng: Rng;
  private bodyIM: THREE.InstancedMesh;
  private legIM: THREE.InstancedMesh;
  private crosshair: HTMLDivElement;
  private ledger: HTMLDivElement;
  private ring: THREE.Mesh;
  private site = new THREE.Vector3();
  private bellDone = false;
  private dukeRefusalUntil = -1;
  private shotGeo = new THREE.SphereGeometry(0.09, 8, 6);
  private shotMat = new THREE.MeshStandardMaterial({ color: 0x8a8070, roughness: 1 });
  private pickupMat: Record<string, THREE.Material> = {};

  constructor(private g: Game) {
    this.rng = new Rng(g.params.seed).fork('underfall');
    const sump = g.wd.sump!;
    // Dust Hoppers: rendered as two instanced meshes (body spheres + leg segments)
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a211b, roughness: 0.55, metalness: 0.1 });
    const legMat = new THREE.MeshStandardMaterial({ color: 0x3a2d22, roughness: 0.8 });
    this.bodyIM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 14, 10), bodyMat, sump.spiderHomes.length * 3);
    this.legIM = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.05, 1, 3, 6), legMat, sump.spiderHomes.length * 16);
    for (const im of [this.bodyIM, this.legIM]) {
      im.frustumCulled = false;
      im.castShadow = true;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      g.scene.add(im);
    }
    for (const h of sump.spiderHomes) this.spiders.push(this.newSpider(h));
    // Tallymen: neighbours on the Duke's wages
    for (let i = 0; i < 2; i++) {
      const fig = g.figs.add({
        skin: [0xc68a60, 0x9a6440][i],
        shirt: 0x6a5a3a,
        pants: 0x3a3226,
        shoes: 0x2a2018,
        hair: 0x2a1d14,
        hairStyle: 'short',
        hat: 'cap',
        hatColor: 0x3a3226,
        apron: 0xc9c9c9,
        longSleeves: true,
        build: 1.1,
        height: 1.02,
      });
      fig.held = 'hook';
      const p = PATROL[i * 2].clone();
      fig.pos.copy(p);
      this.tallymen.push({ fig, body: { pos: p.clone(), vel: new THREE.Vector3(), radius: 0.32, height: 1.7, grounded: false, ground: null }, hp: 70, state: 'patrol', t: 0, wp: i * 2, carry: [], target: null, strikeAt: 0, windup: 0, provokedUntil: -1 });
    }
    const mk = (c: number, rough = 0.6, metal = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal, emissive: new THREE.Color(c).multiplyScalar(0.12) });
    this.pickupMat = { food: mk(0xc98b46, 1), foil: mk(0xd8d8d8, 0.25, 1), metal: mk(0x9aa0a6, 0.3, 1), grit: mk(0x8a8070), electronics: mk(0xc8c8c8, 0.2, 1), candy: mk(0xe84a5f, 0.1) };
    this.crosshair = document.createElement('div');
    this.crosshair.style.cssText = 'position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border:2px solid rgba(243,232,210,.85);border-radius:50%;display:none;pointer-events:none';
    g.uiRoot.appendChild(this.crosshair);
    this.ledger = document.createElement('div');
    this.ledger.style.cssText = 'position:absolute;left:50%;top:56px;transform:translateX(-50%);padding:5px 14px;border-radius:999px;background:rgba(20,16,12,.65);color:#f3e8d2;font:15px sans-serif;white-space:nowrap;display:none;pointer-events:none';
    g.uiRoot.appendChild(this.ledger);
    this.ring = new THREE.Mesh(new THREE.CircleGeometry(2.4, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    g.scene.add(this.ring);
  }

  private newSpider(home: THREE.Vector3): Spider {
    return { body: { pos: home.clone(), vel: new THREE.Vector3(), radius: 0.45, height: 0.6, grounded: false, ground: null }, hp: 45, home: home.clone(), state: 'lurk', t: 0, yaw: 0, alive: true, respawnAt: 0, hit: false, flash: 0, gait: 0 };
  }

  inSump(p = this.g.player.body.pos): boolean {
    return p.x < SUMP_X && p.y < 3;
  }

  /** true for 120 s after the player knocks down a Tallyman */
  dukeRefusesTrade(): boolean {
    return this.g.simTime < this.dukeRefusalUntil;
  }

  private hostile(t: Tallyman): boolean {
    const g = this.g;
    const pp = g.player.body.pos;
    if (Math.hypot(pp.x - CLAIMS.x, pp.z - CLAIMS.z) < 6) return false;
    return g.simTime < t.provokedUntil || (g.story.choice === 'community' && g.state.debt > 0);
  }

  hurtPlayer(n: number): void {
    const g = this.g;
    g.state.hurt(n);
    g.candy.shake = Math.max(g.candy.shake, 0.35);
    this.actionUntil = g.simTime + 0.3;
    g.player.fig.state = 'hurt';
    g.bus.emit({ type: 'sfx', name: 'hit' });
  }

  // ---------- per tick ----------
  update(dt: number, pressed: string[], fFree: boolean): void {
    const g = this.g;
    const now = g.simTime;
    const st = g.state;
    // the gate opens once Ines has given you the lift job
    const stageOpen = g.story.stage >= S.LiftJob;
    const open = this.forceGateOpen || stageOpen;
    for (const s of g.wd.barriers.get('sumpGate') ?? []) s.enabled = !open;
    const blk = g.wd.groups.get('sumpGateBlock');
    if (blk) blk.visible = !open;
    if (this.paused) {
      this.ledger.style.display = 'none';
      this.crosshair.style.display = 'none';
      return;
    }
    if (stageOpen && !isFinite(this.nextFall)) this.nextFall = now + 25;

    // player weapons
    const ui = g.ui.isOpen();
    const fig = g.player.fig;
    fig.held = this.drawing ? 'sling' : st.weapons.pick ? 'pick' : null;
    // with other players around, bare hands can shove: PvP shouldn't wait on crafting a pick
    if (!ui && (st.weapons.pick || g.net.active) && (pressed.includes('Click') || (fFree && pressed.includes('KeyF')))) this.jab();
    const wantDraw = !ui && st.weapons.sling && g.input.isDown('KeyQ') && st.count('grit') > 0;
    if (wantDraw) {
      this.drawing = true;
      this.charge = Math.min(1, this.charge + dt / 0.8);
      fig.yaw = g.cam.yaw + Math.PI;
    } else if (this.drawing) {
      if (this.charge > 0.15) this.fire();
      this.drawing = false;
      this.charge = 0;
    }
    this.crosshair.style.display = this.drawing ? 'block' : 'none';
    this.crosshair.style.transform = `scale(${1.6 - this.charge * 0.7})`;
    if (this.drawing) fig.state = 'draw';
    else if (now < this.actionUntil) fig.state = fig.state === 'hurt' ? 'hurt' : 'jab';

    this.updateShots(dt);
    this.updateSpiders(dt, now);
    this.updateTallymen(dt, now);
    this.updateFalls(dt, now);
    this.updateLedger(stageOpen, now);
    this.renderSpiders(now);
    // pickups as hotspots
    for (const p of this.pickups) {
      const id = `drop-${p.id}`;
      if (p.taken) {
        g.wd.hotspots.delete(id);
        continue;
      }
      const h = g.wd.hotspots.get(id) ?? g.wd.hot(id, 'drop', p.pos, 1.6, { id: p.id });
      h.pos.copy(p.pos).setY(0);
    }
    this.pickups = this.pickups.filter((p) => {
      if (!p.taken) return true;
      g.scene.remove(p.mesh);
      return false;
    });
  }

  private jab(): void {
    const g = this.g;
    const now = g.simTime;
    if (now - this.lastAttack < 0.32 || g.player.stamina < 5) return;
    this.combo = now - this.lastAttack < 0.75 ? this.combo + 1 : 0;
    this.lastAttack = now;
    const lunge = this.combo % 3 === 2;
    g.player.stamina -= lunge ? 10 : 5;
    this.actionUntil = now + 0.25;
    const p = g.player.body.pos;
    // gentle aim assist: turn toward the nearest foe in reach
    const foes = this.targets();
    let near: (typeof foes)[number] | null = null;
    const ax = Math.sin(g.player.fig.yaw), az = Math.cos(g.player.fig.yaw);
    const inCone = (c: THREE.Vector3) => ((c.x - p.x) * ax + (c.z - p.z) * az) / (Math.hypot(c.x - p.x, c.z - p.z) + 1e-6) > Math.cos(Math.PI / 4);
    for (const f of foes) if (f.assist && inCone(f.c) && f.c.distanceTo(p) < 2.8 && (!near || f.c.distanceTo(p) < near.c.distanceTo(p))) near = f;
    if (near) g.player.fig.yaw = Math.atan2(near.c.x - p.x, near.c.z - p.z);
    const fx = Math.sin(g.player.fig.yaw), fz = Math.cos(g.player.fig.yaw);
    let hit = false;
    for (const f of foes) {
      const dx = f.c.x - p.x, dz = f.c.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d - f.r > 1.9 || Math.abs(f.c.y - (p.y + 0.8)) > 1.6) continue;
      if ((dx * fx + dz * fz) / (d + 1e-6) < Math.cos(0.65)) continue;
      const armed = g.state.weapons.pick;
      f.hurt(armed ? (lunge ? 24 : 12) : lunge ? 10 : 6, new THREE.Vector3(dx / (d || 1), 0, dz / (d || 1)).multiplyScalar(lunge ? 6 : 2));
      hit = true;
    }
    g.bus.emit({ type: 'sfx', name: hit ? 'hit' : 'jab' });
  }

  private fire(): void {
    const g = this.g;
    if (g.player.stamina < 6 || !g.state.remove('grit', 1)) return;
    g.player.stamina -= 6;
    const c = this.charge;
    const cam = g.renderer.camera;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    const aim = cam.position.clone().addScaledVector(fwd, 30);
    const from = g.player.body.pos.clone().add(new THREE.Vector3(0, 1.35, 0));
    const dir = aim.sub(from).normalize();
    const mesh = new THREE.Mesh(this.shotGeo, this.shotMat);
    mesh.position.copy(from);
    g.scene.add(mesh);
    this.shots.push({ mesh, pos: from, vel: dir.multiplyScalar(14 + 16 * c), dmg: Math.round(8 + 14 * c), life: 3 });
    if (this.shots.length > 12) this.removeShot(this.shots[0]);
    g.bus.emit({ type: 'sfx', name: 'twang' });
  }

  private removeShot(s: Shot): void {
    this.g.scene.remove(s.mesh);
    s.life = -1;
  }

  /** everything the player can hit, as spheres with a hurt callback */
  private targets(): { c: THREE.Vector3; r: number; assist: boolean; hurt: (n: number, push: THREE.Vector3) => void }[] {
    const out: { c: THREE.Vector3; r: number; assist: boolean; hurt: (n: number, push: THREE.Vector3) => void }[] = [];
    for (const s of this.spiders) if (s.alive) out.push({ c: s.body.pos.clone().setY(s.body.pos.y + 0.35), r: 0.6, assist: true, hurt: (n, push) => this.hurtSpider(s, n, push) });
    for (const t of this.tallymen) if (t.state !== 'down') out.push({ c: t.body.pos.clone().setY(t.body.pos.y + 0.9), r: 0.45, assist: this.hostile(t), hurt: (n, push) => this.hurtTally(t, n, push) });
    out.push(...this.g.net.targets());
    return out;
  }

  private updateShots(dt: number): void {
    const g = this.g;
    const foes = this.targets();
    for (const s of this.shots) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.vel.y -= 6 * dt;
      const step = s.vel.clone().multiplyScalar(dt);
      const len = step.length();
      const dir = step.clone().divideScalar(len || 1);
      let done = false;
      for (const f of foes) {
        // closest point on the segment to the target centre
        const t = Math.max(0, Math.min(len, f.c.clone().sub(s.pos).dot(dir)));
        if (s.pos.clone().addScaledVector(dir, t).distanceTo(f.c) < f.r + 0.1) {
          f.hurt(s.dmg, dir.clone().setY(0).multiplyScalar(3));
          g.bus.emit({ type: 'sfx', name: 'hit' });
          done = true;
          break;
        }
      }
      if (!done && (g.col.raycast(s.pos, dir, len) < len || s.pos.y < -1)) done = true;
      s.pos.add(step);
      s.mesh.position.copy(s.pos);
      if (done || s.life <= 0) this.removeShot(s);
    }
    this.shots = this.shots.filter((s) => s.life > 0);
  }

  // ---------- Dust Hoppers ----------
  private hurtSpider(s: Spider, n: number, push: THREE.Vector3): void {
    const g = this.g;
    s.hp -= s.state === 'recover' ? n * 1.5 : n;
    s.flash = 0.15;
    s.body.vel.add(push);
    if (s.state === 'lurk') s.state = 'stalk';
    if (s.hp > 0) return;
    s.alive = false;
    s.respawnAt = g.simTime + 75;
    const fang = this.rng.chance(0.6);
    g.state.add('silk', 1, true);
    if (fang) g.state.add('fang', 1, true);
    g.bus.emit({ type: 'toast', text: `The spider curls up. Silk${fang ? ' and a fang' : ''}.`, kind: 'good' });
  }

  private updateSpiders(dt: number, now: number): void {
    const g = this.g;
    const pp = g.player.body.pos;
    const playerHere = this.inSump();
    for (const s of this.spiders) {
      if (!s.alive) {
        if (now > s.respawnAt && pp.distanceTo(s.home) > 14) Object.assign(s, this.newSpider(s.home));
        continue;
      }
      s.flash = Math.max(0, s.flash - dt);
      s.t += dt;
      const b = s.body;
      const dx = pp.x - b.pos.x, dz = pp.z - b.pos.z;
      const d = Math.hypot(dx, dz);
      const steer = (tx: number, tz: number, speed: number) => {
        const sx = tx - b.pos.x, sz = tz - b.pos.z;
        const l = Math.hypot(sx, sz) || 1;
        b.vel.x += ((sx / l) * speed - b.vel.x) * Math.min(1, dt * 8);
        b.vel.z += ((sz / l) * speed - b.vel.z) * Math.min(1, dt * 8);
        s.yaw = Math.atan2(sx, sz);
      };
      const stop = () => {
        b.vel.x *= Math.exp(-dt * 10);
        b.vel.z *= Math.exp(-dt * 10);
      };
      if (s.state !== 'lunge' && b.pos.distanceTo(s.home) > 9) s.state = 'return';
      switch (s.state) {
        case 'lurk':
          stop();
          if (playerHere && d < 8) [s.state, s.t] = ['stalk', 0];
          break;
        case 'stalk': {
          if (!playerHere || d > 12) [s.state, s.t] = ['return', 0];
          const ux = -dx / (d || 1), uz = -dz / (d || 1);
          steer(pp.x + ux * 5.5 - uz * 2.5, pp.z + uz * 5.5 + ux * 2.5, 3.2);
          if (s.t > 1.0 && d < 7.5) [s.state, s.t] = ['rear', 0];
          break;
        }
        case 'rear':
          stop();
          s.yaw = Math.atan2(dx, dz);
          if (s.t > 0.7) {
            s.state = 'lunge';
            s.t = 0;
            s.hit = false;
            const v = Math.max(9, Math.min(16, d * 2.4));
            b.vel.set((dx / (d || 1)) * v, 5.5, (dz / (d || 1)) * v);
            b.grounded = false;
            g.bus.emit({ type: 'sfx', name: 'skitter' });
          }
          break;
        case 'lunge':
          if (!s.hit && b.pos.distanceTo(pp.clone().setY(pp.y + 0.4)) < 1.3) {
            s.hit = true;
            this.hurtPlayer(12);
          }
          if (b.grounded && s.t > 0.2) [s.state, s.t] = ['recover', 0];
          break;
        case 'recover':
          stop();
          if (s.t > 0.9) [s.state, s.t] = ['stalk', 0];
          break;
        case 'return':
          steer(s.home.x, s.home.z, 3);
          if (b.pos.distanceTo(s.home) < 1) [s.state, s.t] = ['lurk', 0];
          break;
      }
      const before = b.pos.clone();
      g.col.moveBody(b, dt, 0.4);
      s.gait += before.distanceTo(b.pos) * 6;
    }
  }

  private renderSpiders(now: number): void {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    let bi = 0, li = 0;
    for (const s of this.spiders) {
      if (!s.alive) continue;
      const p = s.body.pos;
      const crouch = s.state === 'rear' ? -0.12 : 0;
      q.setFromAxisAngle(up, s.yaw);
      const flash = 1 + s.flash * 2;
      // abdomen (behind) and head-thorax (front)
      const fwd = new THREE.Vector3(Math.sin(s.yaw), 0, Math.cos(s.yaw));
      m.compose(p.clone().addScaledVector(fwd, -0.35).setY(p.y + 0.5 + crouch), q, sc.set(1.25 * flash, 0.95, 1.4));
      this.bodyIM.setMatrixAt(bi++, m);
      m.compose(p.clone().addScaledVector(fwd, 0.3).setY(p.y + 0.45 + crouch), q, sc.set(0.8, 0.65, 0.8));
      this.bodyIM.setMatrixAt(bi++, m);
      // eight two-segment legs
      for (let k = 0; k < 8; k++) {
        const side = k < 4 ? 1 : -1;
        const a = ((k % 4) - 1.5) * 0.5;
        const swing = Math.sin(s.gait + k * 1.7) * 0.25;
        const dir = new THREE.Vector3(Math.sin(s.yaw + side * (Math.PI / 2) + a + swing), 0, Math.cos(s.yaw + side * (Math.PI / 2) + a + swing));
        const hip = p.clone().addScaledVector(fwd, 0.15).setY(p.y + 0.5 + crouch);
        const knee = hip.clone().addScaledVector(dir, 0.7).setY(p.y + 0.95 + crouch + Math.max(0, swing) * 0.4);
        const foot = hip.clone().addScaledVector(dir, 1.25).setY(p.y + 0.02);
        for (const [a0, a1] of [
          [hip, knee],
          [knee, foot],
        ]) {
          const v = a1.clone().sub(a0);
          q.setFromUnitVectors(up, v.clone().normalize());
          m.compose(a0.clone().add(a1).multiplyScalar(0.5), q, sc.set(1, v.length(), 1));
          this.legIM.setMatrixAt(li++, m);
        }
      }
    }
    this.bodyIM.count = bi;
    this.legIM.count = li;
    this.bodyIM.instanceMatrix.needsUpdate = true;
    this.legIM.instanceMatrix.needsUpdate = true;
    void now;
  }

  // ---------- Tallymen ----------
  private hurtTally(t: Tallyman, n: number, push: THREE.Vector3): void {
    const g = this.g;
    t.hp -= n;
    t.body.vel.add(push);
    t.provokedUntil = g.simTime + 60;
    if (t.hp > 0) {
      if (t.state !== 'fight') [t.state, t.t] = ['fight', 0];
      return;
    }
    t.state = 'down';
    t.t = 0;
    t.fig.carry = null;
    const carrying = t.carry.length > 0;
    // drop the load where he sits; a few tokens fall out of his apron
    for (const it of t.carry) this.spawnPickup(it, 1, t.body.pos.clone().add(new THREE.Vector3(this.rng.range(-1, 1), 1, this.rng.range(-1, 1))));
    t.carry = [];
    const tokens = carrying ? this.rng.int(1, 3) : 0;
    g.state.tokens += tokens;
    this.dukeRefusalUntil = g.simTime + 120;
    g.bus.emit({ type: 'toast', text: `The Tallyman sits down hard. "Fine. Fine."${tokens ? `(+${tokens} tokens from his apron)` : ''} The Duke won't trade with you for a while.`, kind: 'info' });
  }

  private updateTallymen(dt: number, now: number): void {
    const g = this.g;
    const pp = g.player.body.pos;
    const playerHere = this.inSump();
    for (const t of this.tallymen) {
      t.t += dt;
      const b = t.body;
      const f = t.fig;
      const dx = pp.x - b.pos.x, dz = pp.z - b.pos.z;
      const d = Math.hypot(dx, dz);
      let speed = 0;
      let goal: THREE.Vector3 | null = null;
      if (t.state === 'down') {
        f.state = 'down';
        if (t.t > DOWN_TIME) [t.state, t.hp] = ['patrol', 70];
      } else if (this.hostile(t) && playerHere && d < 6) {
        t.state = 'fight';
        if (d > 1.6) {
          goal = pp;
          speed = 3.4;
        }
        if (d > 2.4) t.windup = 0;
        else {
          f.yaw = Math.atan2(dx, dz);
          if (now > t.strikeAt) {
            t.windup += dt;
            f.state = 'point';
            if (t.windup > 0.6) {
              if (d < 2.1) this.hurtPlayer(10);
              t.windup = 0;
              t.strikeAt = now + 1.3;
            }
          } else f.state = 'idle';
        }
      } else {
        if (t.state === 'fight') t.state = t.carry.length ? 'haul' : 'patrol';
        const free = this.pickups.filter((p) => !p.taken && p.vel.lengthSq() < 0.01 && !this.tallymen.some((o) => o !== t && o.target === p));
        if (t.state === 'patrol' && free.length && t.carry.length < 2) t.state = 'race';
        if (t.state === 'race') {
          if (!t.target || t.target.taken) t.target = free.sort((a, c) => a.pos.distanceTo(b.pos) - c.pos.distanceTo(b.pos))[0] ?? null;
          if (!t.target) t.state = t.carry.length ? 'haul' : 'patrol';
          else {
            goal = t.target.pos;
            speed = 3.6;
            if (b.pos.distanceTo(t.target.pos.clone().setY(b.pos.y)) < 0.9) {
              t.target.taken = true;
              t.carry.push(t.target.item);
              t.target = null;
              f.carry = 0xb48a5c;
              if (t.carry.length >= 2) t.state = 'haul';
            }
          }
        }
        if (t.state === 'haul') {
          goal = g.wd.sump!.cart;
          speed = 2.4;
          if (b.pos.distanceTo(goal) < 1.8) {
            // banked for the Duke: it lands on the cart, where a bold player can lift it back
            for (const it of t.carry) this.cart[it] = (this.cart[it] ?? 0) + 1;
            this.dukeTally += t.carry.length;
            t.carry = [];
            f.carry = null;
            t.state = 'patrol';
          }
        }
        if (t.state === 'patrol') {
          goal = PATROL[t.wp];
          speed = 1.3;
          if (b.pos.distanceTo(goal) < 1) t.wp = (t.wp + 1) % PATROL.length;
        }
      }
      if (goal && speed > 0) {
        const sx = goal.x - b.pos.x, sz = goal.z - b.pos.z;
        const l = Math.hypot(sx, sz) || 1;
        b.vel.x = (sx / l) * speed;
        b.vel.z = (sz / l) * speed;
        f.yaw = Math.atan2(sx, sz);
      } else {
        b.vel.x *= Math.exp(-dt * 10);
        b.vel.z *= Math.exp(-dt * 10);
      }
      const before = b.pos.clone();
      g.col.moveBody(b, dt);
      f.pos.copy(b.pos);
      const moved = before.distanceTo(b.pos);
      f.t += dt;
      if (t.state !== 'down' && !(t.state === 'fight' && d <= 2.4)) {
        f.state = moved > 0.002 ? (f.carry !== null ? 'carry' : speed > 3 ? 'run' : 'walk') : 'idle';
        f.stride(moved, speed > 3);
      }
    }
  }

  // ---------- Falls ----------
  /** schedule a Fall in `delay` seconds */
  triggerFall(delay: number): void {
    this.nextFall = this.g.simTime + delay;
  }

  get dimming(): boolean {
    return this.g.simTime < this.fallAt && this.g.simTime > this.fallAt - 2;
  }

  private updateFalls(dt: number, now: number): void {
    const g = this.g;
    if (now >= this.nextFall) {
      this.nextFall = now + this.rng.range(150, 210);
      this.fallAt = now + WARN;
      this.bellDone = false;
      this.site.copy(this.rng.pick(g.wd.sump!.sites));
      this.ring.position.set(this.site.x, this.site.y + 0.05, this.site.z);
      this.ring.visible = true;
      if (this.playerTally + this.dukeTally > 0) g.bus.emit({ type: 'toast', text: `Last Fall: you ${this.playerTally} · the Duke ${this.dukeTally}`, kind: 'info' });
      this.playerTally = 0;
      this.dukeTally = 0;
      this.cart = {};
      const roll = this.rng.range(0, 100);
      let acc = 0;
      const kind = FALLS.find((k) => (acc += k.w) >= roll) ?? FALLS[0];
      this.fallName = kind.name;
      this.pendingKind = kind;
      g.bus.emit({ type: 'sfx', name: 'rumble' });
      if (g.district === 'depths') g.bus.emit({ type: 'toast', text: 'Something rattles down the back of the shelves into the Sump... the spot is marked on the floor.', kind: 'info' });
    }
    if (now >= this.fallAt && this.pendingKind) {
      const kind = this.pendingKind;
      this.pendingKind = null;
      this.fallAt = Infinity;
      this.ring.visible = false;
      const site = this.site;
      const n = this.rng.int(6, 9);
      for (let i = 0; i < n && this.pickups.filter((p) => !p.taken).length < 10; i++) {
        const [item, qty] = kind.items[i % kind.items.length];
        this.spawnPickup(item, qty, site.clone().add(new THREE.Vector3(this.rng.range(-2.5, 2.5), 9 + this.rng.range(0, 3), this.rng.range(-2.5, 2.5))));
      }
      g.bus.emit({ type: 'sfx', name: 'impact', vol: 0.5 });
      if (this.inSump()) g.bus.emit({ type: 'toast', text: `${kind.name} in the Sump. The Tallymen are already moving.`, kind: 'info' });
      // standing under it hurts
      if (this.inSump() && g.player.body.pos.distanceTo(site) < 2.2) this.hurtPlayer(25);
    }
    for (const p of this.pickups) {
      if (p.taken || p.vel.lengthSq() < 1e-4) continue;
      p.vel.y -= 26 * dt;
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0.2) {
        p.pos.y = 0.2;
        p.vel.y *= -0.3;
        p.vel.x *= 0.5;
        p.vel.z *= 0.5;
        if (Math.abs(p.vel.y) < 0.8) p.vel.set(0, 0, 0);
      }
      p.mesh.position.copy(p.pos);
      p.mesh.rotation.y += dt * 3;
    }
  }
  private pendingKind: (typeof FALLS)[number] | null = null;

  private updateLedger(stageOpen: boolean, now: number): void {
    const g = this.g;
    if (stageOpen && isFinite(this.nextFall) && !this.pendingKind && !this.bellDone && this.nextFall - now <= 30) {
      this.bellDone = true;
      g.bus.emit({ type: 'sfx', name: 'door' });
    }
    const show = stageOpen && isFinite(this.nextFall) && g.mode === 'play' && g.district === 'depths';
    this.ledger.style.display = show ? 'block' : 'none';
    if (!show) return;
    const left = Math.max(0, Math.ceil(this.nextFall - now));
    this.ledger.textContent = this.pendingKind ? 'FALL INCOMING' : `Next Fall in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} · You ${this.playerTally} · Duke ${this.dukeTally}`;
  }

  spawnPickup(item: Item, qty: number, at: THREE.Vector3): Pickup {
    const geo = item === 'food' ? new THREE.IcosahedronGeometry(0.28, 1) : item === 'foil' ? new THREE.IcosahedronGeometry(0.3, 0) : item === 'electronics' ? new THREE.CylinderGeometry(0.35, 0.35, 0.15, 16) : new THREE.BoxGeometry(0.4, 0.18, 0.18);
    const mesh = new THREE.Mesh(geo, this.pickupMat[item] ?? this.pickupMat.metal);
    mesh.castShadow = true;
    mesh.position.copy(at);
    this.g.scene.add(mesh);
    const p: Pickup = { id: this.nextId++, mesh, pos: at.clone(), vel: new THREE.Vector3(this.rng.range(-1, 1), -1, this.rng.range(-1, 1)), item, qty, taken: false };
    this.pickups.push(p);
    return p;
  }

  /** E on a dropped pickup */
  pickUp(id: number): void {
    const g = this.g;
    const p = this.pickups.find((q) => q.id === id && !q.taken);
    if (!p) return;
    if (p.netBag !== undefined) {
      if (g.state.canCarry(p.item, p.qty)) g.net.claim(p.netBag);
      else g.bus.emit({ type: 'toast', text: 'Your pack is full.', kind: 'bad' });
      return;
    }
    if (g.state.add(p.item, p.qty) > 0) {
      p.taken = true;
      this.playerTally += p.qty;
      g.player.fig.state = 'collect';
    }
  }

  /** E on the Duke's cart: lift goods back if no Tallyman is watching */
  liftCart(): void {
    const g = this.g;
    const watcher = this.tallymen.find((t) => t.state !== 'down' && t.body.pos.distanceTo(g.player.body.pos) < 6);
    if (watcher) {
      watcher.provokedUntil = g.simTime + 30;
      g.bus.emit({ type: 'toast', text: 'A Tallyman is watching the cart. "Hands off the Third."', kind: 'bad' });
      return;
    }
    let n = 0;
    for (const [it, q] of Object.entries(this.cart) as [Item, number][]) {
      const got = g.state.add(it, q, true);
      n += got;
      this.cart[it] = q - got;
      if (!this.cart[it]) delete this.cart[it];
    }
    g.bus.emit({ type: 'toast', text: n ? `You lift ${n} item${n === 1 ? '' : 's'} off the Duke's cart.` : 'The cart is empty (or your pack is full).', kind: n ? 'good' : 'info' });
  }

  /** Collapsing in the Sump: half of what you carried ends up on the cart. */
  loseHaul(): number {
    const st = this.g.state;
    let n = 0;
    for (const [it, q] of Object.entries(st.inv) as [Item, number][]) {
      if (it === 'parcel') continue;
      const lose = Math.floor(q / 2);
      if (!lose) continue;
      st.remove(it, lose);
      this.cart[it] = (this.cart[it] ?? 0) + lose;
      n += lose;
    }
    return n;
  }

  cartCount(): number {
    return Object.values(this.cart).reduce((a, b) => a + (b ?? 0), 0);
  }

  itemName(i: Item): string {
    return ITEMS[i].name;
  }
}
