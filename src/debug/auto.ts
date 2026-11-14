// ?auto=1 — an autopilot that plays Chapter 1 through the REAL input path:
// it steers with the virtual stick, presses E/F/Space as key events, and clicks real UI buttons.
import * as THREE from 'three';
import type { Game } from '../game';
import { S } from '../systems/story';

type Gen = Generator<void, void, number>;

export class AutoPilot {
  private it: Gen;
  log: string[] = [];
  done = false;
  step = '';
  private dt = 0;

  constructor(private g: Game) {
    this.it = this.script();
  }

  update(dt: number): void {
    if (this.done) return;
    this.dt = dt;
    const v = this.g.input.virtual;
    v.moveX = 0;
    v.moveZ = 0;
    v.sprint = false;
    v.yawRate = 0;
    const r = this.it.next(dt);
    if (r.done) {
      this.done = true;
      this.note('autopilot complete');
    }
  }

  private note(s: string): void {
    this.log.push(`[${this.g.simTime.toFixed(1)}] ${s}`);
    this.step = s;
    console.log(`[auto] ${s}`);
  }

  private press(code: string): void {
    this.g.input.virtualPressed.push(code);
  }

  private steer(target: THREE.Vector3, sprint: boolean): number {
    const p = this.g.player.body.pos;
    const dx = target.x - p.x, dz = target.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-3) return 0;
    const ux = dx / d, uz = dz / d;
    const yaw = this.g.cam.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const v = this.g.input.virtual;
    v.moveZ = ux * fx + uz * fz;
    v.moveX = ux * rx + uz * rz;
    v.sprint = sprint && d > 4;
    // let the camera swing round behind the walker
    let want = Math.atan2(-dx, -dz) - yaw;
    while (want > Math.PI) want -= Math.PI * 2;
    while (want < -Math.PI) want += Math.PI * 2;
    v.yawRate = Math.max(-2.5, Math.min(2.5, want * 2));
    return d;
  }

  private *wait(sec: number): Gen {
    let t = 0;
    while (t < sec) t += yield;
  }

  private *waitUntil(cond: () => boolean, timeout = 60): Gen {
    let t = 0;
    while (!cond() && t < timeout) t += yield;
  }

  /** Walk to a point using the nav graph for the current district, then approach directly. */
  private *goTo(target: () => THREE.Vector3, within = 0.9): Gen {
    const g = this.g;
    const tgt = target();
    const from = g.wd.nearestNode(g.player.body.pos, g.district);
    const to = g.wd.nearestNode(tgt, g.district);
    const pts: THREE.Vector3[] = [];
    if (from && to) for (const n of g.wd.path(from.id, to.id)) pts.push(n.pos);
    // skip a first node that's behind us
    if (pts.length > 1 && pts[0].distanceTo(g.player.body.pos) < 2.5) pts.shift();
    let i = 0;
    let best = Infinity;
    let stall = 0;
    let t = 0;
    while (t < 90) {
      const dt = yield;
      t += dt;
      const final = i >= pts.length;
      const goal = final ? target() : pts[i];
      const d = this.steer(goal, true);
      if (final && d < within) return;
      if (!final && d < 0.8) {
        i++;
        best = Infinity;
        continue;
      }
      if (d < best - 0.3) {
        best = d;
        stall = 0;
      } else stall += dt;
      if (stall > 1.5 && stall - dt <= 1.5) this.press('Space');
      if (stall > 5) {
        // give up on this waypoint
        i++;
        best = Infinity;
        stall = 0;
      }
    }
    this.note('goTo timed out');
  }

  private *useHotspot(id: string, key = 'KeyE', within?: number): Gen {
    const h = this.g.wd.hotspots.get(id);
    if (!h) {
      this.note(`missing hotspot ${id}`);
      return;
    }
    yield* this.goTo(() => h.pos, within ?? h.radius * 0.72);
    yield* this.wait(0.2);
    this.press(key);
    yield* this.wait(0.4);
  }

  private *talk(npc: string, choices: number[]): Gen {
    const n = this.g.pop.byId.get(npc)!;
    yield* this.goTo(() => n.fig.pos, n.def.role === 'vendor' || n.def.role === 'clerk' ? 1.9 : 1.4);
    yield* this.wait(0.2);
    this.press('KeyE');
    yield* this.waitUntil(() => this.g.ui.panel === 'dialogue', 3);
    for (const c of choices) {
      yield* this.wait(0.8);
      if (this.g.ui.panel !== 'dialogue') break;
      this.g.ui.choose(c);
    }
    yield* this.wait(0.6);
    if (this.g.ui.panel === 'dialogue') this.g.ui.choose(0);
    if (this.g.ui.isOpen() && this.g.ui.panel !== 'card') this.g.ui.close();
  }

  private *rideLift(id: string, toLevel: number, landingId: string): Gen {
    const g = this.g;
    const L = g.wd.lifts.get(id)!;
    yield* this.useHotspot(landingId);
    yield* this.waitUntil(() => Math.abs(L.t - (1 - toLevel)) < 0.001 && L.t === L.target, 30);
    // step onto the platform centre
    yield* this.goTo(() => new THREE.Vector3(L.x, 0, L.z), 0.5);
    yield* this.wait(0.3);
    this.press('KeyE');
    yield* this.waitUntil(() => L.t === toLevel, 30);
    yield* this.wait(0.4);
    // both lifts open toward +z: walk straight out of the car
    const out = new THREE.Vector3(L.x, 0, L.z + 3.6);
    let t = 0;
    while (t < 4 && this.steer(out, false) > 0.5) t += yield;
  }

  /** Dig at whichever Spill heap is ready until `enough()`; waiting doesn't count as an attempt. */
  private *scavenge(enough: () => boolean): Gen {
    const g = this.g;
    const st = g.state;
    let digs = 0;
    let waited = 0;
    while (!enough() && digs < 14 && waited < 60) {
      if (st.weight() > st.capacity() - 2) break;
      const ready = [0, 1, 2, 3, 4].map((i) => `heap${i}`).filter((id) => (st.heapReady[id] ?? 0) <= g.simTime);
      if (!ready.length) {
        waited += 1;
        yield* this.wait(1);
        continue;
      }
      const p = g.player.body.pos;
      ready.sort((a, b) => g.wd.hotspots.get(a)!.pos.distanceTo(p) - g.wd.hotspots.get(b)!.pos.distanceTo(p));
      yield* this.useHotspot(ready[0]);
      digs++;
    }
  }

  private clickTestId(id: string): boolean {
    const b = document.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement | null;
    if (!b || b.disabled) return false;
    b.click();
    return true;
  }

  private *script(): Gen {
    const g = this.g;
    const st = g.state;
    yield* this.wait(1);
    if (g.story.stage === S.TalkMara) {
      this.note('talk to Mara');
      yield* this.talk('mara', [0, 0]);
      this.note('eat at the Common Table');
      yield* this.useHotspot('kitchen-depths');
      this.note('collect water');
      yield* this.useHotspot('water-depths');
      this.note('scavenge the Spill');
      yield* this.scavenge(() => st.count('scrap') >= 4 && st.count('fabric') >= 1);
      this.note(`inventory scrap=${st.count('scrap')} fabric=${st.count('fabric')}`);
      this.note('repair the bed');
      yield* this.goTo(() => g.wd.nav.get('d.doorPlayer')!.pos, 0.6);
      yield* this.useHotspot('bed-player');
      yield* this.goTo(() => g.wd.nav.get('d.doorPlayer')!.pos, 0.6);
      this.note('sell scrap to Rook');
      const rook = g.pop.byId.get('rook')!;
      yield* this.goTo(() => rook.fig.pos, 1.8);
      this.press('KeyE');
      yield* this.waitUntil(() => g.ui.panel === 'dialogue', 3);
      yield* this.wait(0.6);
      g.ui.choose(0); // "Show me what you have."
      yield* this.waitUntil(() => g.ui.panel === 'trade', 3);
      yield* this.wait(0.6);
      this.clickTestId('sell-scrap');
      yield* this.wait(0.6);
      g.ui.close();
      this.note('talk to Ines');
      yield* this.talk('ines', [0]);
      this.note('dig for lift parts');
      yield* this.scavenge(() => st.count('metal') >= 1 && st.count('electronics') >= 1);
      this.note('repair the lift');
      yield* this.useHotspot('repair-lift');
      if (g.ui.isOpen()) g.ui.close();
      if ((g.story.stage as S) === S.RepairLift) yield* this.talk('ines', [0]);
    }
    if (g.story.stage === S.RideUp) {
      this.note('ride up to Threadmarket');
      yield* this.rideLift('depths', 1, 'lift-depths');
    }
    if (g.story.stage === S.MeetOdo) {
      this.note('talk to Odo');
      yield* this.talk('odo', [0]);
      this.note('wait for the candy');
      yield* this.waitUntil(() => g.candy.phase === 'rush', 30);
      yield* this.wait(1.5);
      this.note('collect shards');
      let tries = 0;
      while (st.count('candy') < 3 && tries < 12 && g.candy.phase === 'rush') {
        const free = g.candy.shards.map((s, i) => ({ s, i })).filter((x) => !x.s.taken);
        if (!free.length) break;
        const p = g.player.body.pos;
        free.sort((a, b) => a.s.pos.distanceTo(p) - b.s.pos.distanceTo(p));
        const target = free[0];
        yield* this.goTo(() => target.s.pos.clone().setY(g.candy.landing.y), 0.6);
        this.press('KeyF');
        yield* this.wait(0.4);
        tries++;
      }
      this.note(`candy=${st.count('candy')}`);
    }
    if (g.story.stage === S.Choose || (g.story.stage === S.Candy && st.count('candy') > 0)) {
      this.note('give the candy to the Common Table');
      yield* this.talk('bel', [0, 0]);
    }
    if (g.story.stage === S.Checkpoint) {
      this.note('checkpoint');
      yield* this.useHotspot('checkpoint');
      yield* this.waitUntil(() => g.ui.panel === 'dialogue', 3);
      yield* this.wait(0.8);
      g.ui.choose(0);
      yield* this.wait(1.2);
      this.note('ride to the Heights');
      yield* this.rideLift('heights', 1, 'lift-heights-low');
    }
    if (g.story.stage === S.Registry) {
      this.note('visit the Registry');
      yield* this.useHotspot('office');
      yield* this.waitUntil(() => g.ui.panel === 'dialogue', 3);
      yield* this.wait(1.0);
      g.ui.choose(0);
      yield* this.wait(1.0);
      if (g.ui.panel === 'dialogue') g.ui.choose(0);
      yield* this.wait(1.5);
    }
    this.note(`final stage=${S[g.story.stage]} tokens=${st.tokens}`);
  }
}
