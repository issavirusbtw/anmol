// New-arrival onboarding: naming, starting pockets, the Duke's collectors, Patch's rescue and his
// five short missions. Saved as stable checkpoints (step + milestones), never as animation frames.
import * as THREE from 'three';
import type { Game } from '../game';
import { Figure, Look } from '../characters/figure';
import { ITEMS, Item, rollPossessions } from './state';
import { S, DialogueNode } from './story';
import type { Npc } from '../npc/npcs';

export type Step = 'name' | 'explore' | 'chase' | 'rescue' | 'follow' | 'meal' | 'home' | 'first' | 'done';
const STEPS: Step[] = ['name', 'explore', 'chase', 'rescue', 'follow', 'meal', 'home', 'first', 'done'];

/** Seconds of active (no menu, no dialogue) play after naming before the collectors come. */
export const EXPLORE_SECONDS = 24;
const GATE = new THREE.Vector3(-22.6, 0, 7.75);
const CART = new THREE.Vector3(-45, 0, 9.4);
const LOOKOUT = new THREE.Vector3(-25, 0, 4.5);

/** Letters, digits, spaces, apostrophes and hyphens; at most 16 characters. */
export function cleanName(raw: unknown): string {
  const s = String(raw ?? '')
    .replace(/[^\p{L}\p{N} '\-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16)
    .trim();
  return s || 'Newcomer';
}

const COLLECTOR: Look = { skin: 0xe0ac84, shirt: 0x5a4a3a, pants: 0x3a3030, shoes: 0x2a2018, hair: 0x2a1d14, hairStyle: 'short', hat: 'helmet', hatColor: 0xb8322a, armour: 0xc8ccd2, longSleeves: true, build: 1.1, height: 1.0 };

interface Dart {
  mesh: THREE.Group;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  hit?: () => void;
  stuck: number;
}

export class Onboarding {
  step: Step = 'done';
  name = 'Newcomer';
  seed = 0;
  done = new Set<string>();
  /** active exploration seconds since naming */
  t = 0;
  private phaseT = 0;
  private collectors: Figure[] = [];
  private lookout: Figure | null = null;
  private darts: Dart[] = [];
  private hook: { mesh: THREE.Mesh; vy: number } | null = null;
  private route: { p: THREE.Vector3; line?: string; hint?: string; mission?: number }[] = [];
  private wp = 0;
  private walkGoal: THREE.Vector3[] = [];
  private stuckT = 0;
  private lastPatchPos = new THREE.Vector3();
  private waitNag = 0;

  constructor(private g: Game) {}

  get active(): boolean {
    return this.step !== 'done';
  }
  private get patch(): Npc {
    return this.g.pop.byId.get('patch')!;
  }
  private say(who: string, text: string): void {
    this.g.ui.say(who, text);
  }

  // ---------- lifecycle ----------
  /** A brand-new game: everything is decided here, once. */
  begin(seed: number): void {
    this.step = 'name';
    this.seed = seed >>> 0;
    this.done.clear();
    this.t = 0;
    this.apply();
  }

  /** The name prompt was answered (or skipped with an empty name). Grants pockets exactly once. */
  named(raw: string): void {
    this.name = cleanName(raw);
    if (!this.done.has('pockets')) {
      this.done.add('pockets');
      const items = rollPossessions(this.seed);
      for (const it of items) this.g.state.add(it, 1, true);
      this.g.bus.emit({
        type: 'toast',
        text: items.length ? `In your pockets: ${items.map((i) => ITEMS[i].name).join(', ')}. Shrunk right along with you.` : 'Your pockets are empty. Whatever you had, the beam missed it.',
        kind: 'info',
      });
    }
    this.go('explore');
  }

  private go(s: Step): void {
    this.step = s;
    this.phaseT = 0;
    this.apply();
    this.g.save();
  }

  /** Make the world match the current step (used on every step change and after loading). */
  apply(): void {
    const g = this.g;
    const before = STEPS.indexOf(this.step) <= STEPS.indexOf('rescue');
    const p = this.patch;
    p.pinned = this.active;
    p.fig.visible = !before;
    p.fig.held = null;
    const duke = g.pop.byId.get('duke');
    if (duke) {
      duke.pinned = this.active;
      duke.fig.visible = !this.active;
    }
    if (!this.active) {
      g.underfall.paused = false;
      g.underfall.forceGateOpen = false;
      this.clearActors();
      return;
    }
    g.underfall.paused = !this.done.has('gateShut');
    for (const t of g.underfall.tallymen) t.fig.visible = !g.underfall.paused;
    if (this.step === 'explore' || this.step === 'chase') this.ensureLookout();
    if (this.step === 'follow') this.startRoute();
    if (this.step === 'meal') {
      if (g.story.stage < S.Eat) g.story.stage = S.Eat;
      this.patchTo('d.L7');
    }
    if (this.step === 'home') this.patchTo('d.doorPlayer');
    if (this.step === 'first') this.patchTo('d.WS0');
  }

  /** After loading a save: resume from the nearest safe checkpoint. */
  resume(): void {
    if (this.step === 'chase' || this.step === 'rescue') {
      this.step = 'explore';
      this.t = EXPLORE_SECONDS - 4;
    }
    this.clearActors();
    if (this.step === 'follow') this.wp = 0;
    this.apply();
    if (this.step === 'name') setTimeout(() => this.g.ui.openNamePrompt((n) => this.named(n)), 200);
  }

  private clearActors(): void {
    for (const c of this.collectors) this.g.figs.remove(c);
    this.collectors = [];
    if (this.lookout) this.g.figs.remove(this.lookout);
    this.lookout = null;
    for (const d of this.darts) this.g.scene.remove(d.mesh);
    this.darts = [];
    if (this.hook) this.g.scene.remove(this.hook.mesh);
    this.hook = null;
  }

  private ensureLookout(): void {
    if (this.lookout) return;
    const f = this.g.figs.add({ ...COLLECTOR, armour: undefined, hat: 'cap', hatColor: 0x2e86ab, shirt: 0x9a7a4a, pants: 0x4a3b30 });
    const y = this.g.col.groundAt(LOOKOUT.x, LOOKOUT.z, 7);
    f.pos.set(LOOKOUT.x, y, LOOKOUT.z);
    f.yaw = Math.atan2(-31 - LOOKOUT.x, 10 - LOOKOUT.z);
    f.state = 'idle';
    this.lookout = f;
  }

  // ---------- per tick ----------
  update(dt: number, uiOpen: boolean): void {
    if (!this.active) return;
    const g = this.g;
    const pp = g.player.body.pos;
    for (const t of g.underfall.tallymen) t.fig.visible = !g.underfall.paused;
    this.updateDarts(dt);
    if (this.lookout) this.lookout.t += dt;
    if (uiOpen) return;
    this.phaseT += dt;
    switch (this.step) {
      case 'explore':
        this.t += dt;
        if (this.t >= EXPLORE_SECONDS) this.startChase();
        break;
      case 'chase':
        this.updateChase(dt, pp);
        break;
      case 'rescue':
        this.updateRescue(dt);
        break;
      case 'follow':
        this.updateFollow(dt, pp);
        break;
      default:
        this.updateMissions(dt, pp);
    }
    for (const c of this.collectors) c.t += dt;
    // shut the gate behind you once you and Patch are both through
    if (!this.done.has('gateShut') && STEPS.indexOf(this.step) >= STEPS.indexOf('follow') && pp.x > -20.4 && this.patch.fig.pos.x > -20.4) {
      this.done.add('gateShut');
      g.underfall.forceGateOpen = false;
      g.underfall.paused = false;
      this.clearActors();
      g.bus.emit({ type: 'sfx', name: 'door' });
      g.bus.emit({ type: 'toast', text: 'Patch drops the bar across the Sump gate behind you.', kind: 'info' });
    }
  }

  private startChase(): void {
    const g = this.g;
    this.ensureLookout();
    this.lookout!.state = 'point';
    this.say('Lookout', 'Fresh drop! Get away from the landing!');
    g.bus.emit({ type: 'sfx', name: 'error' });
    for (let i = 0; i < 3; i++) {
      const f = g.figs.add({ ...COLLECTOR, hat: i === 0 ? 'tall' : 'helmet', hatColor: i === 0 ? 0x2a2018 : 0xb8322a, build: i === 0 ? 1.18 : 1.05, skin: [0xe0ac84, 0x9a6440, 0xc68a60][i] });
      f.pos.set(CART.x + i * 0.9, 0, CART.z - 1.2 + i * 1.1);
      f.held = 'hook';
      f.state = 'walk';
      this.collectors.push(f);
    }
    this.go('chase');
  }

  private updateChase(dt: number, pp: THREE.Vector3): void {
    const T = this.phaseT;
    const has = (i: Item) => this.g.state.count(i) > 0;
    if (T - dt < 1.2 && T >= 1.2) this.say('Collector', 'You there. New arrival. Pockets out.');
    if (T - dt < 4.2 && T >= 4.2) this.say('Second collector', 'Whatever came through with you belongs to His Grace.');
    if (T - dt < 7.2 && T >= 7.2) {
      if (has('watch')) this.say('Collector', 'It still ticks. The Duke likes things that still tick.');
      else if (!['key', 'coin', 'lighter', 'bandage', 'button', 'clip', 'watch', 'phone'].some((i) => has(i as Item))) this.say('Third collector', "Nothing on you? The sky's getting cheap.");
    }
    let near = Infinity;
    this.collectors.forEach((c, i) => {
      // a loose line: never closer than ~2 m, never faster than a walk
      const side = new THREE.Vector3((i - 1) * 1.6, 0, (i - 1) * 0.8);
      const goal = pp.clone().add(side);
      const d = c.pos.distanceTo(pp);
      near = Math.min(near, d);
      const to = goal.sub(c.pos).setY(0);
      const len = to.length();
      if (d > 2.2 && len > 0.05) {
        const step = Math.min(len, dt * 1.75);
        c.pos.addScaledVector(to.normalize(), step);
        c.stride(step, false);
        c.state = 'walk';
      } else c.state = 'guard';
      c.pos.y = this.g.col.groundAt(c.pos.x, c.pos.z, c.pos.y + 1);
      c.yaw = Math.atan2(pp.x - c.pos.x, pp.z - c.pos.z);
    });
    const atGate = pp.distanceTo(GATE) < 4.2;
    if ((near < 3.4 && T > 5) || atGate || T > 20) {
      this.done.add('cornered');
      this.startRescue();
    }
  }

  private startRescue(): void {
    const g = this.g;
    const p = this.patch;
    // go() re-applies the step's defaults (Patch hidden, empty-handed), so stage him after it
    this.go('rescue');
    g.underfall.forceGateOpen = true;
    p.fig.visible = true;
    p.fig.pos.set(GATE.x + 1.4, 0, GATE.z);
    p.fig.yaw = -Math.PI / 2;
    p.fig.held = 'bow';
    p.fig.state = 'draw';
    for (const c of this.collectors) c.state = 'guard';
  }

  private updateRescue(dt: number): void {
    const T = this.phaseT;
    const at = (s: number) => T - dt < s && T >= s;
    const g = this.g;
    const p = this.patch.fig;
    const leader = this.collectors[0];
    p.t += dt;
    if (leader) p.yaw = Math.atan2(leader.pos.x - p.pos.x, leader.pos.z - p.pos.z);
    for (const c of this.collectors) {
      c.yaw = Math.atan2(p.pos.x - c.pos.x, p.pos.z - c.pos.z);
      if (c.state === 'walk') c.state = 'guard';
    }
    if (at(0.6) && leader) {
      // first dart: into the nearest post beside the leader
      const posts = [new THREE.Vector3(-23.2, 1.3, 6.4), new THREE.Vector3(-23.2, 1.3, 9.1), new THREE.Vector3(-25.3, 1.3, 4.5), new THREE.Vector3(-24.7, 1.3, 4.5), new THREE.Vector3(-26.5, 1.0, 9.9)];
      posts.sort((a, b) => a.distanceTo(leader.pos) - b.distanceTo(leader.pos));
      this.fire(posts[0], () => g.bus.emit({ type: 'sfx', name: 'hit' }));
      g.bus.emit({ type: 'sfx', name: 'twang' });
    }
    if (at(1.2)) this.say('Patch', "Three of you for one fresh drop? That's embarrassing.");
    if (at(3.4)) this.say('Collector', "Patch! Stay out of the Duke's business!");
    if (at(4.6) && leader) {
      g.bus.emit({ type: 'sfx', name: 'twang' });
      const hand = leader.pos.clone().add(new THREE.Vector3(0, 1.0, 0));
      this.fire(hand, () => {
        leader.held = null;
        leader.state = 'hurt';
        g.bus.emit({ type: 'sfx', name: 'hit' });
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 0.06), new THREE.MeshStandardMaterial({ color: 0xeef2f6, metalness: 0.9, roughness: 0.25 }));
        m.position.copy(hand);
        m.rotation.z = 0.8;
        g.scene.add(m);
        this.hook = { mesh: m, vy: 3 };
      });
    }
    if (at(5.8)) this.say('Patch', 'Then tell the Duke to stop doing business on my doorstep!');
    if (at(8.2)) {
      this.say('Patch', 'Hey, new one! Unless you fancy losing your pockets, follow me!');
      p.held = null;
      this.done.add('rescued');
      this.go('follow');
    }
  }

  private fire(to: THREE.Vector3, hit: () => void): void {
    const from = this.patch.fig.pos.clone().add(new THREE.Vector3(0, 1.25, 0));
    const mesh = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.55), new THREE.MeshStandardMaterial({ color: 0xe6cfa3, roughness: 0.7 }));
    const flight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.005, 0.1), new THREE.MeshStandardMaterial({ color: 0xb5523b }));
    flight.position.z = -0.24;
    mesh.add(shaft, flight);
    mesh.position.copy(from);
    this.g.scene.add(mesh);
    this.darts.push({ mesh, from, to: to.clone(), t: 0, dur: 0.32, hit, stuck: 0 });
  }

  private updateDarts(dt: number): void {
    for (const d of this.darts) {
      if (d.t < d.dur) {
        d.t += dt;
        const k = Math.min(1, d.t / d.dur);
        d.mesh.position.lerpVectors(d.from, d.to, k).y += Math.sin(k * Math.PI) * 0.25;
        d.mesh.lookAt(d.to);
        if (k >= 1 && d.hit) {
          d.hit();
          d.hit = undefined;
        }
      } else d.stuck += dt;
    }
    if (this.hook) {
      const h = this.hook;
      h.vy -= 14 * dt;
      h.mesh.position.y = Math.max(0.05, h.mesh.position.y + h.vy * dt);
      h.mesh.position.x += dt * 1.2;
      if (h.mesh.position.y > 0.05) h.mesh.rotation.z += dt * 9;
      else h.mesh.rotation.set(0, 0, Math.PI / 2);
    }
    // collectors retreat to the cart once the rescue is over
    if (STEPS.indexOf(this.step) >= STEPS.indexOf('follow')) {
      for (const c of this.collectors) {
        const to = CART.clone().sub(c.pos).setY(0);
        if (to.length() > 0.5) {
          const s = Math.min(to.length(), dt * 2.4);
          c.pos.addScaledVector(to.normalize(), s);
          c.stride(s, true);
          c.state = 'run';
          c.yaw = Math.atan2(to.x, to.z);
        } else c.visible = false;
      }
    }
  }

  // ---------- Mission 1 + 2: follow Patch through the gate, the Spill, the drip, Pell's and the Table ----------
  private startRoute(): void {
    const nav = (id: string, fallback: [number, number, number]) => this.g.wd.nav.get(id)?.pos.clone() ?? new THREE.Vector3(...fallback);
    const lines = this.pocketLine();
    this.route = [
      { p: new THREE.Vector3(-21.0, 0, 7.75), mission: 1, line: 'Stay on my heels. I bar the gate behind us; his licence stops at the posts.', hint: 'WASD to move · hold Shift to sprint' },
      { p: new THREE.Vector3(-17.2, 0, 7.5), line: `Name? ... ${this.name}. Keep it. It's the one thing you landed with that nobody can weigh.` },
      { p: new THREE.Vector3(-13.2, 0, 5.4), line: 'The Spill. Everything that slips through the shelf cracks ends up here. Mind the heaps. Space to hop.', hint: 'Space to jump' },
      { p: nav('d.W0', [-7.8, 0, 4.4]), line: lines ?? "The drip. It's the Heights' runoff. Tastes better if you don't think." },
      { p: nav('d.P0', [1.6, 0, 3.8]), mission: 2, line: "Pell's Pantry. Baked fresh-ish. The prices are honest; the bread is a matter of opinion.", hint: 'E to talk or trade' },
      { p: nav('d.L6', [4, 0, -2.4]), line: "Food comes two ways down here: what the giant drops, and what we dig. Both go upstairs first." },
      { p: nav('d.L7', [7.5, 0, -2.6]), line: "The Common Table feeds anyone who walks in. Nobody keeps a tally. That's why I trust it." },
    ];
    const p = this.patch.fig;
    // resume: start from the waypoint nearest Patch (or the gate)
    if (p.pos.x < -22 || !p.visible) p.pos.copy(this.route[0].p);
    this.wp = this.route.reduce((best, r, i) => (r.p.distanceTo(p.pos) < this.route[best].p.distanceTo(p.pos) ? i : best), 0);
    this.walkGoal = [];
  }

  private pocketLine(): string | null {
    const s = this.g.state;
    if (s.count('phone')) return "Is that a phone? No signal. There never is. Keep it dark; that glow is worth more than you are.";
    if (s.count('lighter')) return "Don't flash that lighter. Fire down here buys a street or burns one.";
    if (s.count('key')) return 'A house key. Keep it. Half the Row still carries theirs.';
    return null;
  }

  private updateFollow(dt: number, pp: THREE.Vector3): void {
    const p = this.patch.fig;
    p.t += dt;
    const r = this.route;
    // the player ran ahead: catch up instead of making them wait
    for (let j = r.length - 1; j > this.wp; j--)
      if (pp.distanceTo(r[j].p) < 3 && p.pos.distanceTo(pp) > 6) {
        this.wp = j;
        p.pos.copy(r[j].p).add(new THREE.Vector3(1.2, 0, 0.6));
        break;
      }
    const cur = r[this.wp];
    const dPlayer = p.pos.distanceTo(pp);
    if (cur.line && !this.done.has(`wp${this.wp}`) && dPlayer < 6) {
      this.done.add(`wp${this.wp}`);
      this.say('Patch', cur.line);
      if (cur.hint) this.g.bus.emit({ type: 'toast', text: cur.hint, kind: 'info' });
    }
    const next = r[this.wp + 1];
    if (!next) {
      if (dPlayer < 5) {
        this.done.add('m1');
        this.done.add('m2');
        this.go('meal');
      } else this.face(p, pp);
      return;
    }
    if (dPlayer > 9) {
      // wait for the player, and say so now and then
      p.state = 'idle';
      this.face(p, pp);
      this.waitNag += dt;
      if (this.waitNag > 12) {
        this.waitNag = 0;
        this.say('Patch', 'This way, new one. Follow the bag with the patches.');
      }
      return;
    }
    this.waitNag = 0;
    if (this.walk(p, next.p, dt, dPlayer < 3.5 ? 2.8 : 2.2)) {
      this.wp++;
      if (r[this.wp].mission === 2) this.done.add('m1');
    }
  }

  /** Move Patch toward a point (no physics, on known-clear routes). Returns true on arrival. */
  private walk(f: Figure, to: THREE.Vector3, dt: number, speed: number): boolean {
    const d = to.clone().sub(f.pos).setY(0);
    const len = d.length();
    if (len < 0.25) {
      f.state = 'idle';
      return true;
    }
    const s = Math.min(len, speed * dt);
    f.pos.addScaledVector(d.normalize(), s);
    f.pos.y = this.g.col.groundAt(f.pos.x, f.pos.z, f.pos.y + 1);
    f.yaw = Math.atan2(d.x, d.z);
    f.stride(s, speed > 2.5);
    f.state = speed > 2.5 ? 'run' : 'walk';
    // stuck recovery: no progress for 2 s means hop to the goal
    if (f.pos.distanceTo(this.lastPatchPos) < 0.02) this.stuckT += dt;
    else this.stuckT = 0;
    this.lastPatchPos.copy(f.pos);
    if (this.stuckT > 2) {
      f.pos.copy(to);
      this.stuckT = 0;
      return true;
    }
    return false;
  }

  private face(f: Figure, at: THREE.Vector3): void {
    f.yaw = Math.atan2(at.x - f.pos.x, at.z - f.pos.z);
  }

  private patchTo(node: string): void {
    const p = this.patch.fig;
    const start = this.g.wd.nearestNode(p.pos, 'depths');
    this.walkGoal = start ? this.g.wd.path(start.id, node).map((n) => n.pos.clone()) : [];
    if (!this.walkGoal.length) {
      const n = this.g.wd.nav.get(node);
      if (n) this.walkGoal = [n.pos.clone()];
    }
  }

  // ---------- Missions 3–5 ----------
  private updateMissions(dt: number, pp: THREE.Vector3): void {
    const g = this.g;
    const p = this.patch.fig;
    p.t += dt;
    if (this.walkGoal.length) {
      if (this.walk(p, this.walkGoal[0], dt, 2.3)) this.walkGoal.shift();
    } else {
      p.state = 'idle';
      if (p.pos.distanceTo(pp) < 6) this.face(p, pp);
    }
    const st = g.state;
    if (this.step === 'meal') {
      if (this.phaseT < dt * 1.5) this.say('Patch', 'Sit. Eat. Then fill a cap at the drip. Nobody here starts anything hungry.');
      if (g.story.stage >= S.Scavenge) {
        this.done.add('m3');
        this.say('Patch', "The red matchbox is empty. Roof leaks, sponge is torn. Yours. Come on.");
        this.go('home');
      }
    } else if (this.step === 'home') {
      const bed = g.wd.hotspots.get('bed-player')?.pos;
      if (bed && pp.distanceTo(bed) < 3 && !this.done.has('homeSeen')) {
        this.done.add('homeSeen');
        if (!st.homeRepaired) this.say('Patch', 'Scrap for the roof, fabric for the bed. The Spill has both. Fix it yourself and nobody can itemise it.');
      }
      if (this.done.has('homeSeen') && st.homeRepaired && this.phaseT > 0 && !this.done.has('repairNoted')) {
        this.done.add('repairNoted');
        this.say('Patch', 'Now sleep. First night is loud. F at the bed opens your box: a stash nobody can take, and room to build.');
      }
      if (this.done.has('slept')) {
        this.done.add('m4');
        this.say('Patch', "Morning. Last thing: dig, then make something at Rook's bench. A tool you made is a tool nobody can take.");
        this.go('first');
      }
    } else if (this.step === 'first') {
      if (this.done.has('crafted')) {
        this.done.add('m5');
        this.say('Patch', "That's you started. I'm at the Spill most days. If a Tallyman's polite, count your pockets.");
        g.bus.emit({ type: 'toast', text: 'Tutorial complete. The Wall is yours to explore.', kind: 'good' });
        this.go('done');
      }
    }
  }

  // ---------- hooks from the game ----------
  onSleep(): void {
    if (this.step === 'home') this.done.add('slept');
  }
  onScavenge(): void {
    if (this.step === 'first') this.done.add('dug');
  }
  onCraft(): void {
    if (this.step === 'first') this.done.add('crafted');
  }

  // ---------- HUD ----------
  objective(): string | null {
    const g = this.g;
    const st = g.state;
    switch (this.step) {
      case 'name':
        return '';
      case 'explore':
        return 'Get your bearings. You landed in a basin at the bottom of the Wall.';
      case 'chase':
      case 'rescue':
        return 'The collectors are closing in. Find a way out!';
      case 'follow':
        return this.done.has('m1') ? "Mission 2/5 · The Crumb Market: stay with Patch past Pell's Pantry to the Common Table" : 'Mission 1/5 · Follow Patch through the gate and into Drip Row';
      case 'meal':
        return `Mission 3/5 · Something to eat: ${g.story.stage <= S.Eat ? 'share a meal at the Common Table' : 'fill a cap with water at the drip'}`;
      case 'home':
        if (!this.done.has('homeSeen')) return 'Mission 4/5 · A place to sleep: find your matchbox (the red one)';
        if (!st.homeRepaired) return `Mission 4/5 · ${st.count('scrap') >= 3 && st.count('fabric') >= 1 ? 'Repair your bed (E at the bed)' : `Dig the Spill for 3 scrap and 1 fabric (${st.count('scrap')}/3, ${st.count('fabric')}/1)`}`;
        return 'Mission 4/5 · Sleep in your bed (E). F at the bed opens storage and upgrades.';
      case 'first':
        return `Mission 5/5 · First steps: ${this.done.has('dug') || st.count('scrap') > 0 ? "make something at Rook's workbench (Grit costs 1 scrap)" : 'dig a heap in the Spill for scrap'}`;
    }
    return null;
  }

  marker(): THREE.Vector3 | null {
    const g = this.g;
    switch (this.step) {
      case 'chase':
      case 'rescue':
        return GATE;
      case 'follow':
        return this.patch.fig.pos;
      case 'meal':
      case 'home':
        if (this.step === 'home' && !this.done.has('homeSeen')) return g.wd.hotspots.get('bed-player')?.pos ?? null;
        return g.story.marker();
      case 'first':
        return this.done.has('dug') || g.state.count('scrap') > 0 ? g.wd.hotspots.get('craft-depths')?.pos ?? null : g.wd.hotspots.get('heap0')?.pos ?? null;
    }
    return null;
  }

  // ---------- Patch, talkable ----------
  talk(): DialogueNode {
    const s = this.g.state;
    const bye = { label: 'Later, Patch.' };
    if (this.active)
      return { speaker: 'Patch', text: this.objective()?.replace(/^Mission \d\/5 · /, 'Next: ') ?? 'Keep moving.', options: [bye] };
    const idle = ['Never trust a man who owns the weather.', "If a Tallyman's polite, count your pockets. If he's friendly, count them twice.", 'The Spill gives. The Spill also takes fingers. Dig with a stick.'];
    const opts: { label: string; run?: () => DialogueNode }[] = [
      {
        label: 'How do the collectors know you?',
        run: () => ({
          speaker: 'Patch',
          text: 'I carried a hook for him once. Then I watched the cart leave full and come back clean. Every hook in that crew is new. Nobody down here makes metal that bright. I stopped asking where it comes from.',
          options: [bye],
        }),
      },
    ];
    if (s.count('watch')) opts.push({ label: 'Show him the watch.', run: () => ({ speaker: 'Patch', text: 'Put that away. It still ticks, and the Duke likes things that still tick.', options: [bye] }) });
    if (s.count('phone')) opts.push({ label: 'Show him the phone.', run: () => ({ speaker: 'Patch', text: "No signal. There never is. Strip it at a bench and you'll eat for a week.", options: [bye] }) });
    opts.push(bye);
    return { speaker: 'Patch', text: `${this.name}. ${idle[Math.floor(this.g.simTime / 30) % idle.length]}`, options: opts };
  }

  // ---------- save ----------
  serialize(): { step: string; name: string; seed: number; done: string[]; t: number } {
    return { step: this.step, name: this.name, seed: this.seed, done: [...this.done], t: this.t };
  }
  load(d: unknown): void {
    const o = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
    // saves from before Chapter Zero have no onboarding: they are finished, and get no new items
    this.step = STEPS.includes(o.step as Step) ? (o.step as Step) : 'done';
    this.name = cleanName(o.name);
    this.seed = Number.isFinite(o.seed) ? (o.seed as number) >>> 0 : 0;
    this.done = new Set(Array.isArray(o.done) ? o.done.filter((x): x is string => typeof x === 'string') : ['pockets']);
    if (!d) this.done.add('pockets');
    this.t = Number.isFinite(o.t) ? (o.t as number) : 0;
    this.resume();
  }
}
