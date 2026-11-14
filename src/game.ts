// Game composition root: builds the world, owns systems, runs the fixed-step simulation.
import * as THREE from 'three';
import { Params, SIM_DT, TIER_Y, SAVE_KEY, SAVE_VERSION, SETTINGS_KEY, CABINET } from './config';
import { Rng } from './core/rng';
import { Input } from './core/input';
import { Bus } from './core/bus';
import { Renderer, KEY_INTENSITY, INSIDE_EXPOSURE } from './render/renderer';
import { Materials } from './render/materials';
import { Fx } from './render/fx';
import { Wildlife } from './world/wildlife';
import { CollisionWorld } from './physics/collision';
import { WorldBuilder, bakeScaleUniform } from './world/builder';
import { WorldData, Hotspot, Lift } from './world/worldData';
import { buildCabinet, buildGlass, buildRoom } from './world/cabinet';
import { buildDepths } from './world/depths';
import { buildMarket } from './world/market';
import { buildHeights } from './world/heights';
import { buildDistant, CrowdWalker } from './world/distant';
import { FigureSystem } from './characters/figure';
import { Player, CameraRig } from './player/player';
import { Population } from './npc/npcs';
import { GameState, ITEMS, Item, VENDORS, SaveData, RECIPES, HOME_TIERS } from './systems/state';
import { Story, S, NAMES } from './systems/story';
import { CandyEvent } from './events/candy';
import { UI } from './ui/ui';
import { Audio } from './audio/audio';
import { AutoPilot } from './debug/auto';
import { buildSump } from './world/sump';
import { buildOutside, outside as isOutside, inLacquer } from './world/outside';
import { Expedition } from './systems/expedition';
import { Critters } from './systems/critters';
import { Underfall } from './systems/underfall';
import { Onboarding } from './systems/onboarding';
import { Arrival } from './events/arrival';
import { Net } from './net/net';
import { TouchControls } from './ui/touch';

type Mode = 'title' | 'intro' | 'play' | 'view';

export class Game {
  rng: Rng;
  scene = new THREE.Scene();
  renderer: Renderer;
  mats: Materials;
  col = new CollisionWorld();
  wd = new WorldData();
  figs: FigureSystem;
  input: Input;
  bus = new Bus();
  player: Player;
  cam: CameraRig;
  state: GameState;
  story: Story;
  pop: Population;
  candy: CandyEvent;
  fx: Fx;
  wildlife: Wildlife;
  ui: UI;
  audio = new Audio();
  auto: AutoPilot | null = null;
  underfall!: Underfall;
  expedition!: Expedition;
  critters!: Critters;
  onboarding!: Onboarding;
  net!: Net;
  touch?: TouchControls;
  arrival: Arrival | null = null;
  /** true when F has no context prompt this tick (so F means "jab") */
  private fFree = true;
  private wasInSump = false;
  simTime = 0;
  private acc = 0;
  private last = 0;
  paused = false;
  frozen = false;
  mode: Mode = 'title';
  liftRopes = new Map<string, THREE.Mesh>();
  glassPanes: THREE.Mesh[] = [];
  private paneBase: number[] = [];
  district = 'depths';
  focusHot: Hotspot | null = null;
  checkpointOpen = false;
  private barAngle = 0;
  private autosave = 0;
  frameCount = 0;
  buildMs = 0;
  /** last time a lift moved (audio) */
  private motor = 0;
  private stuckTimer = 0;

  constructor(
    public params: Params,
    public canvas: HTMLCanvasElement,
    public uiRoot: HTMLDivElement,
  ) {
    this.rng = new Rng(params.seed);
    const settings = this.readSettings();
    const low = params.quality ? params.quality === 'low' : settings.low ?? false;
    this.renderer = new Renderer(this.scene, canvas, low);
    this.mats = new Materials(params.seed, low);
    this.input = new Input(canvas);
    if (TouchControls.wanted()) this.touch = new TouchControls(this, canvas);
    this.figs = new FigureSystem(this.scene, this.mats);

    const t0 = performance.now();
    const b = new WorldBuilder(this.scene, this.mats, this.col);
    buildRoom(b, this.rng.fork('room'));
    buildOutside(b, this.wd, this.rng.fork('outside'));
    buildCabinet(
      b,
      [[], [{ x0: 16, x1: 20, z0: -8.5, z1: -4.5 }], [{ x0: -20, x1: -16, z0: 0, z1: 4 }]],
      new Map([[2, [-22, 0]]]),
    );
    buildDepths(b, this.wd, this.rng);
    buildSump(b, this.wd, this.rng);
    buildMarket(b, this.wd, this.rng);
    buildHeights(b, this.wd, this.rng);
    const walkers: CrowdWalker[] = [];
    buildDistant(b, this.rng.fork('distant'), walkers);
    b.finish();
    this.glassPanes = buildGlass(this.scene, this.mats, this.rng);
    this.paneBase = this.glassPanes.map((p) => p.position.x);
    this.wd.lamps = b.lamps;
    this.renderer.lamps = b.lamps;
    this.buildMs = performance.now() - t0;
    console.log(`[world] built in ${this.buildMs.toFixed(0)} ms · lamps ${b.lamps.length} · solids ${this.col.solids.length} · renderer ${this.renderer.rendererInfo}`);

    for (const lift of this.wd.lifts.values()) {
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 6), new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 1 }));
      rope.castShadow = true;
      this.scene.add(rope);
      this.liftRopes.set(lift.id, rope);
    }

    this.state = new GameState(this.bus);
    this.story = new Story({
      state: this.state,
      bus: this.bus,
      openTrade: (v) => setTimeout(() => this.openTrade(v), 0),
      triggerCandy: (d) => this.triggerCandy(d),
      openCheckpoint: () => this.openCheckpoint(),
      setLiftWorking: (id) => (this.wd.lifts.get(id)!.working = true),
      hotspotPos: (id) => this.wd.hotspots.get(id)?.pos ?? null,
      npcPos: (id) => this.pop.byId.get(id)?.fig.pos ?? null,
      save: () => this.save(),
      time: () => this.simTime,
      district: () => this.district,
      npcName: (id) => this.pop.byId.get(id)?.def.name ?? NAMES[id] ?? 'Resident',
      repairLift: () => this.repairLift(),
    });
    this.pop = new Population(this.wd, this.figs, this.rng.fork('pop'));
    this.pop.addExtras(walkers);
    this.candy = new CandyEvent(this.scene, this.bus, this.rng.fork('candy'));
    // default landing: the Commons (so a schedule restored from a save always has a safe target)
    this.candy.landing.copy(this.wd.candyLanding);
    this.candy.district = 'market';
    this.candy.onImpact = (p) => {
      this.fx.burst(p, 160);
      this.state.supply += 8;
      this.pop.candy.shards = this.candy.shards.map((s, i) => ({ pos: s.pos, taken: false, id: i }));
      this.pop.reactCandy('impact', this.candy.landing, this.candy.district, this.simTime);
      this.wd.hot('candy-core', 'candy', this.candy.candy.position.clone().setY(this.candy.landing.y), 2.6, { core: true });
    };
    this.candy.onPhase = (ph) => {
      if (ph === 'shadow') this.pop.reactCandy('shadow', this.candy.landing, this.candy.district, this.simTime);
      if (ph === 'resolve') {
        this.pop.reactCandy('resolve', this.candy.landing, this.candy.district, this.simTime);
        for (const id of [...this.wd.hotspots.keys()]) if (id.startsWith('candy-')) this.wd.hotspots.delete(id);
        // shards taken by the crowd feed the community; the rest go to the granary
        this.state.supply += this.candy.communityShards * 2;
        if (this.story.stage === S.Candy && this.state.count('candy') < 3) {
          this.bus.emit({ type: 'toast', text: 'The rush is over. You can still sell or give what you found.', kind: 'info' });
          if (this.state.count('candy') > 0) this.story.advance(S.Choose);
        }
      }
    };
    this.pop.onShardTaken = (i, npc) => {
      this.candy.takeShard(i);
      if (npc.def.faction === 'authority') this.candy.authorityShards++;
      else this.candy.communityShards++;
    };
    this.fx = new Fx(this.scene, params.seed, this.wd.drips, this.wd.steam, (x, z, y) => this.col.groundAt(x, z, y));
    this.wildlife = new Wildlife(this.scene, (x, z, y) => this.col.groundAt(x, z, y), params.seed, this.wd.ants, this.wd.moths);

    this.player = new Player(this.figs, this.col, this.bus);
    this.cam = new CameraRig(this.renderer.camera, this.col);
    if (settings.camDist) this.cam.dist = settings.camDist;
    if (settings.sens) this.cam.sens = settings.sens;
    if (settings.invert) this.cam.invertY = settings.invert;
    if (settings.volume !== undefined) this.audio.volume = settings.volume;

    this.ui = new UI(uiRoot, this.uiHost());
    this.underfall = new Underfall(this);
    this.expedition = new Expedition(this);
    this.critters = new Critters(this);
    this.onboarding = new Onboarding(this);
    this.net = new Net(this);
    this.bus.on((e) => {
      if (e.type === 'toast') this.ui.toast(e.text, e.kind);
      if (e.type === 'sfx') this.audio.play(e.name, e.vol ?? 1);
      // a pickup made by a contact action chimes when the hand reaches it, not on the key press
      if (e.type === 'collect') {
        if (this.deferCollect) this.collectQueued = true;
        else this.audio.play('collect');
      }
      if (e.type === 'choice') this.applyChoiceVisuals();
      if (e.type === 'quest' && e.id === 'ch1-done')
        setTimeout(
          () =>
            this.ui.showCard(
              'Chapter 1 complete',
              this.story.choice === 'community'
                ? 'You fed the lower tiers with the sky\'s sugar, and now you carry the Water Petition: ten signatures to open the Heights Reservoir to the Depths. The Authority will remember your name. So will Drip Row.'
                : 'You sold the sky\'s sugar to the Authority and walked into the light. A Heights residence costs 150 tokens. Down on Drip Row, the bowls stayed empty.',
            ),
          600,
        );
    });

    const sp = this.wd.districtSpawn.get('depths')!;
    this.player.place(sp.pos, sp.yaw);
    this.cam.yaw = sp.yaw + Math.PI;
    this.cam.snap(this.focusPoint());
    this.applyHomeVisuals();
    window.addEventListener('keydown', (e) => this.onKey(e.code));
    this.setup();
  }

  // ---------- setup from URL params ----------
  private setup(): void {
    const p = this.params;
    if (p.fresh) localStorage.removeItem(SAVE_KEY);
    if (p.view) {
      this.mode = 'view';
      this.uiRoot.style.display = 'none';
      this.prepareState(p.view === 'market' ? 'market' : 'lower');
      if (p.event === 'candy') this.triggerCandy(2);
      if (p.t !== null) this.fastForward(p.t);
      return;
    }
    if (p.state !== 'intro' || p.auto || p.test) {
      this.prepareState(p.state === 'intro' ? 'lower' : p.state);
      this.mode = 'play';
      if (p.event === 'candy') this.triggerCandy(2);
      if (p.event === 'fall') this.underfall.triggerFall(3);
      if (p.kit) {
        // test/demo kit: both weapons and a pouch of grit
        this.state.weapons = { pick: true, sling: true };
        this.state.add('grit', 24, true);
      }
      if (p.auto) this.auto = new AutoPilot(this);
      if (p.t !== null) this.fastForward(p.t);
      return;
    }
    this.mode = 'title';
    this.ui.openTitle();
  }

  /** Put the world into a district start state, using the real progression flags. */
  private prepareState(s: 'lower' | 'market' | 'upper' | 'sump'): void {
    const st = this.state;
    if (s === 'lower') {
      this.place('depths');
      return;
    }
    st.homeRepaired = true;
    st.liftRepaired = true;
    this.wd.lifts.get('depths')!.working = true;
    this.applyHomeVisuals();
    if (s === 'sump') {
      // past Ines's lift job: the Sump gate is open
      this.story.stage = S.RideUp;
      this.place('sump');
      return;
    }
    if (s === 'market') {
      this.story.stage = S.MeetOdo;
      st.tokens = 30;
      this.wd.lifts.get('depths')!.t = this.wd.lifts.get('depths')!.target = 1;
      this.place('market');
    } else {
      this.story.stage = S.Registry;
      this.story.choice = 'community';
      this.story.flags.add('runnerTag');
      this.story.flags.add('feast');
      this.openCheckpoint(true);
      const hl = this.wd.lifts.get('heights')!;
      hl.t = hl.target = 1;
      this.place('heights');
    }
  }

  private place(d: string): void {
    const sp = this.wd.districtSpawn.get(d)!;
    this.player.place(sp.pos, sp.yaw);
    this.cam.yaw = sp.yaw + Math.PI;
    this.district = d === 'sump' ? 'depths' : d;
    this.cam.snap(this.focusPoint());
  }

  /** Deterministic presentation: run the real simulation for t seconds, then freeze. */
  fastForward(t: number): void {
    const steps = Math.round(t / SIM_DT);
    for (let i = 0; i < steps; i++) this.tick(SIM_DT);
    this.frozen = true;
  }

  beginGame(fromSave: boolean): void {
    if (fromSave) {
      if (this.load()) {
        this.mode = 'play';
        return;
      }
      setTimeout(() => this.bus.emit({ type: 'toast', text: `That save could not be read. A copy is kept as "${SAVE_KEY}.bak"; starting a new arrival.`, kind: 'bad' }), 500);
    }
    // a new arrival will overwrite the save on its first checkpoint: keep the old one
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) localStorage.setItem(`${SAVE_KEY}.bak`, raw);
    } catch {
      /* storage blocked */
    }
    this.mode = 'intro';
    this.onboarding.begin(this.pocketSeed());
    this.arrival = new Arrival(this, () => {
      this.arrival = null;
      this.mode = 'play';
      this.district = 'depths';
      this.cam.yaw = this.player.fig.yaw + Math.PI;
      this.cam.dist = Math.min(this.cam.dist, 4.2);
      this.cam.snap(this.focusPoint());
      setTimeout(() => this.ui.openNamePrompt((n) => this.onboarding.named(n)), 250);
    });
  }

  /** Seed for the starting pockets: random per playthrough, or ?pockets=N for tests. Saved, never rerolled. */
  private pocketSeed(): number {
    const q = new URLSearchParams(location.search).get('pockets');
    return q !== null && /^\d+$/.test(q) ? Number(q) : Math.floor(Math.random() * 2 ** 31);
  }

  // ---------- loop ----------
  start(): void {
    this.last = performance.now();
    const loop = (now: number) => {
      requestAnimationFrame(loop);
      const dt = Math.max(0.001, Math.min(0.1, (now - this.last) / 1000));
      this.last = now;
      this.frame(dt);
    };
    requestAnimationFrame(loop);
  }

  private frame(dt: number): void {
    this.frameCount++;
    const simRunning = !this.paused && !this.frozen && (this.mode === 'play' || this.mode === 'view' || this.mode === 'intro');
    if (simRunning) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= SIM_DT && steps < 6) {
        this.tick(SIM_DT);
        this.acc -= SIM_DT;
        steps++;
      }
      if (steps === 6) this.acc = 0;
    }
    const camera = this.renderer.camera;
    if (this.mode === 'intro') this.arrival?.update(dt);
    else if (this.mode === 'view') this.updateView();
    else if (this.mode === 'title') this.updateTitleCam();
    else {
      this.cam.handleInput(this.input, dt);
      this.cam.sprint += ((this.player.fig.state === 'run' ? 1 : 0) - this.cam.sprint) * Math.min(1, dt * 4);
      this.cam.update(this.focusPoint(), dt);
      // squeezed against a wall: don't fill the screen with the back of your own head
      if (this.mode === 'play') this.player.fig.visible = this.cam.cur > 0.8;
      if (this.candy.shake > 0.01) {
        camera.position.x += (Math.sin(this.simTime * 47) * 0.25) * this.candy.shake;
        camera.position.y += (Math.sin(this.simTime * 53) * 0.2) * this.candy.shake;
      }
    }
    const dof = this.renderer.bokeh;
    dof.enabled = this.mode === 'play' && !this.renderer.low;
    (dof.uniforms as Record<string, THREE.IUniform>).focus.value = this.cam.cur;
    // from the bedroom the city should glow; inside, keep the intimate exposure
    const outside = camera.position.z > CABINET.glassZ + 1;
    const wantExp = outside ? 1.5 : INSIDE_EXPOSURE;
    this.renderer.gl.toneMappingExposure += (wantExp - this.renderer.gl.toneMappingExposure) * Math.min(1, dt * 3);
    this.renderer.follow(this.mode === 'play' ? this.player.body.pos : this.viewFocus());
    this.renderer.updatePool(this.mode === 'play' ? this.cam.target : this.viewFocus(), dt, this.simTime);
    this.net.update(dt);
    this.figs.update(camera, this.mode === 'play' ? 140 : 260, dt);
    this.fx.update(dt, this.simTime, camera.position, this.mode === 'play' ? this.marker() : null);
    this.wildlife.update(dt, this.simTime, this.player.fig.pos, camera.position);
    this.updateGlass();
    this.ui.setHudVisible(this.mode === 'play');
    if (this.mode === 'play') this.ui.update();
    this.touch?.update();
    this.audio.setMix(this.district === 'market' ? 1 : this.district === 'depths' ? 0.6 : 0.25, this.motor);
    this.renderer.render(dt);
    this.renderer.adapt(this.mode === 'play' && !this.params.test);
  }

  tick(dt: number): void {
    this.simTime += dt;
    const pressed = this.input.takePressed();
    this.auto?.update(dt);
    this.updateLifts(dt);
    this.updateCheckpoint(dt);
    this.candy.update(dt, this.simTime);
    this.pop.updateCandy(this.simTime);
    this.pop.update(dt, { time: this.simTime, playerPos: this.player.body.pos, camPos: this.renderer.camera.position, groundAt: (x, z, y) => this.col.groundAt(x, z, y) });
    this.pop.syncHotspots();
    this.syncCandyHotspots();
    // giant's shadow dims the world
    const dimTarget = this.candy.phase === 'shadow' || this.candy.phase === 'reach' || this.candy.phase === 'release' ? 0.5 : this.underfall.dimming ? 0.75 : 1;
    this.renderer.dim += (dimTarget - this.renderer.dim) * Math.min(1, dt * 2);
    this.renderer.moon.intensity = KEY_INTENSITY * (0.4 + 0.6 * this.renderer.dim);
    bakeScaleUniform.value = 0.6 + 0.4 * this.renderer.dim;
    if (this.mode !== 'play') return;
    const uiOpen = this.ui.isOpen();
    this.player.frozen = uiOpen;
    this.player.update(dt, this.input, this.cam.yaw, uiOpen ? [] : pressed);
    if (!uiOpen) this.handleInteract(pressed);
    this.underfall.update(dt, uiOpen ? [] : pressed, this.fFree);
    this.onboarding.update(dt, uiOpen);
    const inSump = this.underfall.inSump();
    if (inSump !== this.wasInSump) {
      this.wasInSump = inSump;
      this.bus.emit({ type: 'toast', text: inSump ? 'The Sump Ward. Keep your Pick up.' : 'Back on Drip Row.', kind: 'info' });
    }
    this.expedition.update(dt);
    this.critters.update(dt);
    if (pressed.includes('KeyR') && !uiOpen) this.player.recover();
    // survival + economy
    if (this.state.tickSurvival(dt) === 'collapsed') this.collapse();
    this.state.tickEconomy(dt);
    // the crowd beat you to every shard: the giant comes back soon rather than in five minutes
    if (this.story.stage === S.Candy && this.candy.phase === 'idle' && this.state.count('candy') === 0 && this.candy.nextAt - this.simTime > 45) {
      this.candy.trigger(this.simTime, 40, this.wd.candyLanding, 'market');
      this.candy.nextAt = this.simTime + 40;
      this.bus.emit({ type: 'toast', text: 'The giant is still hovering by the glass. It may drop more soon.', kind: 'info' });
    }
    // district tracking
    const d = this.districtAt(this.player.body.pos);
    if (d !== this.district) {
      this.district = d;
      this.bus.emit({ type: 'enter', zone: d });
      const names: Record<string, string> = { depths: 'The Depths', market: 'Threadmarket', heights: 'The Heights', lacquer: 'Lacquer Court', outside: 'Outside the cabinet. The room goes on forever back here.' };
      this.bus.emit({ type: 'toast', text: names[d], kind: 'info' });
    }
    // gentle auto-unstuck: inside geometry with no progress
    if (!this.player.body.grounded && Math.abs(this.player.body.vel.y) < 0.01) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 3) {
        this.player.recover();
        this.stuckTimer = 0;
      }
    } else this.stuckTimer = 0;
    this.autosave += dt;
    if (this.autosave > 60) {
      this.autosave = 0;
      this.save();
    }
  }

  /** Current objective marker: onboarding first, then the chapter story. */
  marker(): THREE.Vector3 | null {
    return this.onboarding.active ? this.onboarding.marker() : this.story.marker();
  }

  focusPoint(): THREE.Vector3 {
    return this.player.body.pos.clone().add(new THREE.Vector3(0, 1.45, 0)).add(new THREE.Vector3(0, this.player.fig.yOffset, 0));
  }

  // ---------- interaction ----------
  private handleInteract(pressed: string[]): void {
    const p = this.player.body.pos;
    let best: Hotspot | null = null;
    let bd = Infinity;
    for (const h of this.wd.hotspots.values()) {
      if (!h.enabled) continue;
      if (Math.abs(h.pos.y - p.y) > 2.2) continue;
      const d = Math.hypot(h.pos.x - p.x, h.pos.z - p.z);
      if (d > h.radius) continue;
      // prefer hotspots in front of the player
      const fx = Math.sin(this.player.fig.yaw), fz = Math.cos(this.player.fig.yaw);
      const facing = ((h.pos.x - p.x) * fx + (h.pos.z - p.z) * fz) / (d + 1e-6);
      const actionableRepair = h.kind === 'repair' && !this.state.liftRepaired && this.story.stage >= S.RepairLift;
      const score = d - facing * 0.6 + (h.kind === 'candy' && !h.data.core ? -1 : 0) + (h.kind === 'npc' && !this.isStoryNpc(h.data.npc) ? 0.8 : 0) + (actionableRepair ? -1.5 : 0) + (h.kind === 'vendor' ? 0.7 : 0);
      if (score < bd) {
        bd = score;
        best = h;
      }
    }
    // riding a lift overrides everything
    const lift = this.liftUnderPlayer();
    this.focusHot = best;
    let promptE: string | null = null;
    let promptF: string | null = null;
    if (lift) promptE = lift.working ? `Ride the lift ${lift.t > 0.5 ? 'down' : 'up'}` : 'The lift is dead';
    else if (best) [promptE, promptF] = this.labels(best);
    const parts: string[] = [];
    if (promptE) parts.push(`<kbd>E</kbd>${promptE}`);
    if (promptF) parts.push(`<kbd>F</kbd>${promptF}`);
    this.ui.setPrompt(parts.length ? parts.join('&nbsp;&nbsp;&nbsp;') : null);
    this.fFree = !promptF;
    if (pressed.includes('KeyE')) {
      if (lift) this.rideLift(lift);
      else if (best) this.act(best, 'E');
    }
    if (pressed.includes('KeyF') && best && promptF) this.act(best, 'F');
  }

  private isStoryNpc(id: string): boolean {
    return !!this.pop.byId.get(id)?.def.talkable;
  }

  private labels(h: Hotspot): [string | null, string | null] {
    const st = this.state;
    switch (h.kind) {
      case 'npc':
        return [`Talk to ${this.pop.byId.get(h.data.npc)?.def.name ?? 'resident'}`, null];
      case 'vendor':
        return [`Trade — ${VENDORS[h.data.vendor].name}`, null];
      case 'scavenge': {
        const ready = (st.heapReady[h.id] ?? 0) <= this.simTime;
        return [ready ? 'Scavenge the heap' : `Picked clean (${Math.ceil((st.heapReady[h.id] ?? 0) - this.simTime)}s)`, null];
      }
      case 'water':
        return ['Fill a cap with water', 'Drink from the drip'];
      case 'kitchen':
        return ['Share a meal at the Common Table', null];
      case 'bed':
        return st.homeRepaired ? ['Sleep (rest and save)', 'Improve your home'] : ['Repair the bed (3 scrap, 1 fabric)', null];
      case 'repair':
        return [st.liftRepaired ? 'The motor hums' : 'Repair the lift motor (1 metal, 1 electronics)', null];
      case 'lift': {
        const L = this.wd.lifts.get(h.data.lift)!;
        if (!L.working) return ['The lift is dead', null];
        const here = Math.abs(L.t - h.data.level) < 0.01;
        return [here ? 'Step onto the platform' : 'Call the lift', null];
      }
      case 'craft':
        return ['Use the workbench', null];
      case 'checkpoint':
        return [this.checkpointOpen ? 'The gate is open' : this.story.hasPass() ? 'Show your pass' : 'Ask about passing', null];
      case 'office':
        return ['Registry counter', null];
      case 'candy':
        return h.data.core ? ['The candy core (far too heavy)', null] : ['Pick up the candy shard', 'Grab shard'];
      case 'cart':
        return [this.underfall.cartCount() ? `Lift ${this.underfall.cartCount()} item(s) off the Duke's cart` : "The Duke's cart (empty)", null];
      case 'drop': {
        const p = this.underfall.pickups.find((q) => q.id === h.data.id);
        return p ? [`Pick up ${this.underfall.itemName(p.item)}${p.qty > 1 ? ` ×${p.qty}` : ''}`, null] : [null, null];
      }
      case 'expedition':
        return this.expedition.labels(h);
    }
    return [null, null];
  }

  private deferCollect = false;
  private collectQueued = false;
  private flushCollectSfx(): void {
    if (this.collectQueued) this.audio.play('collect');
    this.collectQueued = false;
  }

  act(h: Hotspot, key: 'E' | 'F'): void {
    const st = this.state;
    switch (h.kind) {
      case 'npc': {
        const node = h.data.npc === 'patch' ? this.onboarding.talk() : this.story.talk(h.data.npc);
        this.bus.emit({ type: 'talk', npc: h.data.npc });
        this.ui.openDialogue(node);
        break;
      }
      case 'vendor':
        this.openTrade(h.data.vendor);
        break;
      case 'scavenge': {
        if ((st.heapReady[h.id] ?? 0) > this.simTime) {
          this.bus.emit({ type: 'toast', text: 'Nothing useful left here for now.', kind: 'info' });
          return;
        }
        const r = this.rng.fork(`${h.id}-${Math.floor(this.simTime)}`);
        const loot: Item[] = h.data.loot;
        const early = this.story.stage <= S.RepairHome;
        const got: Item[] = [r.chance(early ? 1 : 0.7) ? 'scrap' : r.pick(loot), early && r.chance(0.6) ? 'scrap' : r.pick(loot)];
        if (!early && r.chance(0.35)) got.push(r.pick(loot));
        // quest-aware finds: you know what you're digging for once someone tells you
        const need = (it: Item) => loot.includes(it) && st.count(it) === 0;
        if (this.story.stage >= S.LiftJob && need('metal')) got[1] = 'metal';
        if (this.story.stage >= S.LiftJob && need('electronics')) got[0] = 'electronics';
        if (this.story.stage <= S.RepairHome && need('fabric')) got[1] = 'fabric';
        // tutorial's last mission is "dig, then craft Grit (1 scrap)": the lift-job finds above can't eat the scrap
        if (this.onboarding.step === 'first' && need('scrap')) got.push('scrap');
        let n = 0;
        this.deferCollect = true;
        for (const it of got) n += st.add(it, 1);
        this.deferCollect = false;
        if (n > 0) {
          st.heapReady[h.id] = this.simTime + 30;
          this.onboarding.onScavenge();
          const text = `Found: ${got.slice(0, n).map((i) => ITEMS[i].name).join(', ')}`;
          this.player.startAction('dig', h.pos, () => {
            this.flushCollectSfx();
            this.bus.emit({ type: 'toast', text, kind: 'good' });
          });
        }
        break;
      }
      case 'water':
        if (key === 'F') {
          st.thirst = Math.min(100, st.thirst + 30);
          this.bus.emit({ type: 'drink' });
          this.player.startAction('drink', h.pos, () => {
            this.bus.emit({ type: 'sfx', name: 'drink' });
            this.bus.emit({ type: 'toast', text: 'Cool, metallic, clean enough.', kind: 'good' });
          });
        } else {
          this.deferCollect = true;
          const n = st.add('water', 2);
          this.deferCollect = false;
          if (n)
            this.player.startAction('fill', h.pos, () => {
              this.flushCollectSfx();
              this.bus.emit({ type: 'toast', text: `Filled ${n} cap${n > 1 ? 's' : ''} with water.`, kind: 'good' });
            });
        }
        break;
      case 'kitchen':
        if (st.rep.table < -25) {
          this.bus.emit({ type: 'toast', text: 'Old Fenna turns her back. "Ask your Warden for supper."', kind: 'bad' });
          return;
        }
        if (this.simTime - st.lastMeal < 90 && this.story.stage !== S.Eat) {
          this.bus.emit({ type: 'toast', text: 'Fenna: "You just ate. Come back later."', kind: 'info' });
          return;
        }
        st.lastMeal = this.simTime;
        st.hunger = Math.min(100, st.hunger + 40);
        this.bus.emit({ type: 'eat' });
        this.bus.emit({ type: 'sfx', name: 'eat' });
        this.bus.emit({ type: 'toast', text: 'A bowl of crumb broth. Warm. Mostly water. Wonderful.', kind: 'good' });
        break;
      case 'cart':
        this.underfall.liftCart();
        break;
      case 'drop':
        this.underfall.pickUp(h.data.id);
        break;
      case 'expedition':
        this.expedition.act(h, key);
        break;
      case 'bed':
        if (key === 'F' && st.homeRepaired) {
          this.ui.openHome();
          break;
        }
        if (!st.homeRepaired) {
          if (st.count('scrap') >= 3 && st.count('fabric') >= 1) {
            st.remove('scrap', 3);
            st.remove('fabric', 1);
            st.homeRepaired = true;
            this.applyHomeVisuals();
            this.bus.emit({ type: 'repair', id: 'home' });
            this.bus.emit({ type: 'sfx', name: 'repair' });
            this.bus.emit({ type: 'toast', text: 'Patched roof, a sponge mattress, a blanket. Home.', kind: 'good' });
          } else this.bus.emit({ type: 'toast', text: `Need 3 scrap and 1 fabric (you have ${st.count('scrap')} and ${st.count('fabric')}).`, kind: 'bad' });
        } else {
          st.health = st.maxHealth;
          st.hunger = Math.max(10, st.hunger - 8);
          st.thirst = Math.max(10, st.thirst - 8);
          this.onboarding.onSleep();
          this.save();
          this.bus.emit({ type: 'toast', text: 'You sleep. The giant does not come. Game saved.', kind: 'good' });
        }
        break;
      case 'repair':
        if (st.liftRepaired) return;
        if (this.story.stage < S.LiftJob) {
          this.bus.emit({ type: 'toast', text: 'The motor is cooked. Ines would know what it needs.', kind: 'info' });
          return;
        }
        if (!this.repairLift()) this.bus.emit({ type: 'toast', text: 'You need 1 metal and 1 electronics. Try the Spill.', kind: 'bad' });
        break;
      case 'lift': {
        const L = this.wd.lifts.get(h.data.lift)!;
        if (!L.working) {
          this.bus.emit({ type: 'toast', text: 'Dead. The motor needs repairs.', kind: 'bad' });
          return;
        }
        if (Math.abs(L.t - h.data.level) > 0.01) {
          L.target = h.data.level;
          this.bus.emit({ type: 'sfx', name: 'lift' });
          this.bus.emit({ type: 'toast', text: 'You tug the call cord. The thread starts to wind.', kind: 'info' });
        } else this.bus.emit({ type: 'toast', text: 'Step onto the platform and press E to ride.', kind: 'info' });
        break;
      }
      case 'craft':
        this.ui.openCraft();
        break;
      case 'checkpoint':
        this.ui.openDialogue(this.story.talk('guard1'));
        break;
      case 'office':
        this.ui.openDialogue(this.story.talk('quill'));
        break;
      case 'candy': {
        if (h.data.core) {
          this.bus.emit({ type: 'toast', text: 'It is the size of a house. Grab the shards instead.', kind: 'info' });
          return;
        }
        const i = h.data.shard as number;
        if (!st.canCarry('candy')) {
          this.bus.emit({ type: 'toast', text: 'Your pack is full.', kind: 'bad' });
          return;
        }
        if (this.candy.takeShard(i)) {
          if (this.pop.candy.shards[i]) this.pop.candy.shards[i].taken = true;
          this.candy.playerShards++;
          this.deferCollect = true;
          st.add('candy', 1);
          this.deferCollect = false;
          this.player.startAction('dig', h.pos, () => this.flushCollectSfx());
        }
        break;
      }
    }
  }

  /** Authority-aligned sellers in the Heights refuse anyone still owing the arrival levy. */
  openTrade(vendor: string): void {
    if (vendor === 'duke' && this.underfall.dukeRefusesTrade()) {
      this.bus.emit({ type: 'toast', text: '"You put one of my crew on the floor. The table is closed to you. For now."', kind: 'bad' });
      this.bus.emit({ type: 'sfx', name: 'error' });
      return;
    }
    if (VENDORS[vendor].faction === 'authority' && this.state.debt > 0) {
      this.bus.emit({ type: 'toast', text: `"We don't serve debtors. Settle your ${this.state.debt}-token levy at the Registry."`, kind: 'bad' });
      this.bus.emit({ type: 'sfx', name: 'error' });
      return;
    }
    this.ui.openTrade(vendor);
  }

  /** Repair job: consumes parts, changes the world (the lift runs), pays the player. */
  repairLift(): boolean {
    const st = this.state;
    if (st.liftRepaired) return true;
    if (st.count('metal') < 1 || st.count('electronics') < 1) return false;
    st.remove('metal');
    st.remove('electronics');
    st.liftRepaired = true;
    this.wd.lifts.get('depths')!.working = true;
    st.tokens += 20;
    st.addRep('union', 10);
    this.bus.emit({ type: 'repair', id: 'lift' });
    this.bus.emit({ type: 'sfx', name: 'repair' });
    this.bus.emit({ type: 'toast', text: 'The motor coughs, then hums. The lift works! +20 tokens', kind: 'good' });
    return true;
  }

  private barrelReadyAt = 0;

  /** Everything the home panel can do. Returns a message for the toast. */
  homeAction(action: 'build' | 'deposit' | 'take' | 'cook' | 'barrel' | 'fang', item?: Item): { ok: boolean; msg: string } {
    const st = this.state;
    const stashWeight = () => Object.entries(st.stash).reduce((w, [k, n]) => w + ITEMS[k as Item].weight * (n ?? 0), 0);
    switch (action) {
      case 'build': {
        const tier = HOME_TIERS[st.homeTier];
        if (!tier) return { ok: false, msg: 'Your matchbox is as good as it gets.' };
        const lacking = (Object.entries(tier.cost) as [Item, number][]).filter(([it, n]) => st.count(it) < n);
        if (lacking.length) return { ok: false, msg: `Still need: ${lacking.map(([it, n]) => `${n - st.count(it)} ${ITEMS[it].name.toLowerCase()}`).join(', ')}.` };
        for (const [it, n] of Object.entries(tier.cost) as [Item, number][]) st.remove(it, n);
        st.homeTier++;
        this.applyHomeVisuals();
        this.bus.emit({ type: 'sfx', name: 'repair' });
        this.save();
        return { ok: true, msg: `Built: ${tier.name}.` };
      }
      case 'deposit': {
        if (!item) return { ok: false, msg: '' };
        let n = 0;
        while (st.count(item) > 0 && stashWeight() + ITEMS[item].weight <= 30) {
          st.remove(item);
          st.stash[item] = (st.stash[item] ?? 0) + 1;
          n++;
        }
        return { ok: n > 0, msg: n ? `Stashed ${n} ${ITEMS[item].name.toLowerCase()}.` : 'The tin is full.' };
      }
      case 'take': {
        if (!item) return { ok: false, msg: '' };
        const have = st.stash[item] ?? 0;
        const got = st.add(item, have, true);
        st.stash[item] = have - got;
        if (!st.stash[item]) delete st.stash[item];
        return { ok: got > 0, msg: got ? `Took ${got} ${ITEMS[item].name.toLowerCase()}.` : 'Your pack is full.' };
      }
      case 'cook': {
        if (st.count('food') < 2 || st.count('water') < 1) return { ok: false, msg: 'A Hot Bowl needs 2 crumb rations and 1 cap of water.' };
        st.remove('food', 2);
        st.remove('water', 1);
        st.hunger = Math.min(100, st.hunger + 60);
        st.hotBowlUntil = st.now + 120;
        this.bus.emit({ type: 'sfx', name: 'eat' });
        return { ok: true, msg: 'A Hot Bowl. You feel it in your fingertips.' };
      }
      case 'barrel': {
        if (this.simTime < this.barrelReadyAt) return { ok: false, msg: `The barrel is still filling (${Math.ceil(this.barrelReadyAt - this.simTime)}s).` };
        const n = st.add('water', 2, true);
        if (n) this.barrelReadyAt = this.simTime + 120;
        return { ok: n > 0, msg: n ? 'Two caps of clean drip, from your own barrel.' : 'Your pack is full.' };
      }
      case 'fang': {
        if (st.maxHealth >= 120) return { ok: false, msg: 'The wall is full.' };
        if (!st.remove('fang', 1)) return { ok: false, msg: 'You have no fangs to mount.' };
        st.maxHealth += 2;
        st.health = Math.min(st.maxHealth, st.health + 2);
        return { ok: true, msg: `Fang mounted. Max health ${st.maxHealth}.` };
      }
    }
  }

  craft(id: string): { ok: boolean; reason?: string } {
    const r = this.craftInner(id);
    if (r.ok) this.onboarding.onCraft();
    return r;
  }

  private craftInner(id: string): { ok: boolean; reason?: string } {
    const st = this.state;
    if (id === 'satchel') {
      if (st.satchel) return { ok: false, reason: 'You already have a satchel.' };
      if (st.count('fabric') < 2 || st.count('scrap') < 1) return { ok: false, reason: 'Need 2 fabric and 1 scrap.' };
      st.remove('fabric', 2);
      st.remove('scrap', 1);
      st.satchel = true;
      this.bus.emit({ type: 'sfx', name: 'repair' });
      return { ok: true };
    }
    const recipe = RECIPES[id];
    if (recipe) {
      if (recipe.weapon && st.weapons[recipe.weapon]) return { ok: false, reason: 'You already have one.' };
      if (recipe.flag && this.story.flags.has(recipe.flag)) return { ok: false, reason: 'Already fitted.' };
      if (recipe.needs && !st.weapons[recipe.needs]) return { ok: false, reason: 'Make a Snapband first.' };
      for (const [it, n] of Object.entries(recipe.cost) as [Item, number][]) if (st.count(it) < n) return { ok: false, reason: `Need ${Object.entries(recipe.cost).map(([i, q]) => `${q} ${ITEMS[i as Item].name.toLowerCase()}`).join(', ')}.` };
      for (const [it, n] of Object.entries(recipe.cost) as [Item, number][]) st.remove(it, n);
      if (recipe.weapon) st.weapons[recipe.weapon] = true;
      if (recipe.gives) st.add(recipe.gives[0], recipe.gives[1], true);
      if (recipe.flag) this.story.flags.add(recipe.flag);
      this.bus.emit({ type: 'sfx', name: 'repair' });
      return { ok: true };
    }
    if (id === 'ration') {
      if (!st.remove('candy', 1)) return { ok: false, reason: 'Need 1 candy shard.' };
      st.add('food', 3);
      return { ok: true };
    }
    return { ok: false, reason: 'Unknown recipe.' };
  }

  private syncCandyHotspots(): void {
    this.candy.shards.forEach((s, i) => {
      const id = `candy-${i}`;
      if (s.taken) {
        this.wd.hotspots.delete(id);
        return;
      }
      const h = this.wd.hotspots.get(id) ?? this.wd.hot(id, 'candy', s.pos, 1.5, { shard: i });
      h.pos.copy(s.pos).setY(this.candy.landing.y);
    });
  }

  triggerCandy(delay: number): void {
    const inDepths = this.district === 'depths' && this.story.stage > S.Candy;
    const landing = inDepths ? new THREE.Vector3(3.5, 0, -0.6) : this.wd.candyLanding.clone();
    this.candy.trigger(this.simTime, delay, landing, inDepths ? 'depths' : 'market');
  }

  // ---------- lifts + checkpoint ----------
  /** outside and Lacquer Court are their own districts, so riding the cargo line never counts as entering Threadmarket or the Heights */
  districtAt(p: THREE.Vector3): string {
    if (isOutside(p)) return 'outside';
    if (inLacquer(p)) return 'lacquer';
    return p.y < TIER_Y[1] - 1.5 ? 'depths' : p.y < TIER_Y[2] - 1.5 ? 'market' : 'heights';
  }

  liftUnderPlayer(): Lift | null {
    const g = this.player.body.ground;
    if (!g || !g.dynamic) return null;
    for (const L of this.wd.lifts.values()) if (L.solid === g) return L;
    return null;
  }

  private rideLift(L: Lift): void {
    if (!L.working) {
      this.bus.emit({ type: 'toast', text: 'Dead. The motor needs repairs.', kind: 'bad' });
      return;
    }
    L.target = L.t > 0.5 ? 0 : 1;
    this.bus.emit({ type: 'sfx', name: 'lift' });
  }

  updateLifts(dt: number): void {
    this.motor = 0;
    for (const L of this.wd.lifts.values()) {
      const prev = L.t;
      if (L.working) {
        const d = L.target - L.t;
        const step = (L.speed / (L.y1 - L.y0)) * dt;
        L.t = Math.abs(d) < step ? L.target : L.t + Math.sign(d) * step;
      }
      const y = L.y0 + (L.y1 - L.y0) * L.t;
      this.col.moveDynamic(L.solid, L.x, y, L.z);
      L.group.position.y = y;
      const moving = L.t !== prev;
      if (moving && this.player.body.pos.distanceTo(new THREE.Vector3(L.x, y, L.z)) < 30) this.motor = 1;
      for (const g of L.gates) {
        g.enabled = moving;
        this.col.moveDynamic(g, g.cx, y + 1.6, g.cz);
      }
      if (L.landing) {
        L.landing[0].enabled = moving || L.t > 0.01;
        L.landing[1].enabled = moving || L.t < 0.99;
      }
      const rope = this.liftRopes.get(L.id);
      if (rope) {
        const top = L.y1 + 3.6;
        const bottom = y + 2.9;
        rope.scale.y = Math.max(0.01, top - bottom);
        rope.position.set(L.x, (top + bottom) / 2, L.z);
      }
    }
  }

  openCheckpoint(instant = false): void {
    if (this.checkpointOpen) return;
    this.checkpointOpen = true;
    for (const s of this.wd.barriers.get('checkpoint') ?? []) s.enabled = false;
    if (instant) this.barAngle = 1.35;
    this.bus.emit({ type: 'sfx', name: 'door' });
    if (!instant) this.bus.emit({ type: 'toast', text: 'The ruler-gate swings up. The brass lift waits.', kind: 'good' });
    this.save();
  }

  private updateCheckpoint(dt: number): void {
    const target = this.checkpointOpen ? 1.35 : 0;
    this.barAngle += (target - this.barAngle) * Math.min(1, dt * 3);
    const bar = this.wd.groups.get('checkpointBar');
    if (bar) bar.rotation.z = this.barAngle;
  }

  private updateGlass(): void {
    // the right door slides open while the giant reaches in
    const k = this.candy.doorOpen;
    if (this.glassPanes[1]) this.glassPanes[1].position.x = this.paneBase[1] + k * 62;
    // the left door slides open for Chapter Zero's hand
    if (this.glassPanes[0]) this.glassPanes[0].position.x = this.paneBase[0] - (this.arrival?.paneOpen ?? 0) * 44;
  }

  applyHomeVisuals(): void {
    const b = this.wd.groups.get('homeBroken'), f = this.wd.groups.get('homeFixed');
    if (b) b.visible = !this.state.homeRepaired;
    if (f) f.visible = this.state.homeRepaired;
    for (const l of this.wd.lamps) if (l.tag === 'home-player-fixed') l.on = this.state.homeRepaired;
    for (let i = 1; i <= 4; i++) {
      const gtier = this.wd.groups.get(`homeTier${i}`);
      if (gtier) gtier.visible = this.state.homeRepaired && this.state.homeTier >= i;
    }
    for (const l of this.wd.lamps) if (l.tag === 'home-stove') l.on = this.state.homeTier >= 2;
  }

  private applyChoiceVisuals(): void {
    // the plaza responds: a feast, or a fuller granary and guards on duty
    const feast = this.story.flags.has('feast');
    for (const n of this.pop.npcs) {
      if (n.def.district !== 'market') continue;
      if (feast && (n.def.role === 'resident' || n.def.role === 'child')) {
        n.actAnim = 'cheer';
        n.actUntil = this.simTime + 8;
      }
    }
  }

  private collapse(): void {
    if (this.underfall.inSump()) {
      const lost = this.underfall.loseHaul();
      if (lost) this.bus.emit({ type: 'toast', text: `${lost} item${lost === 1 ? '' : 's'} of your haul ended up on the Duke's cart.`, kind: 'bad' });
    }
    this.bus.emit({ type: 'toast', text: 'You collapse. Neighbours carry you home. (Lost a quarter of your tokens.)', kind: 'bad' });
    const spot = this.state.homeRepaired ? this.wd.hotspots.get('bed-player')!.pos : this.wd.districtSpawn.get('depths')!.pos;
    this.player.place(spot.clone(), 0);
    this.district = 'depths';
  }

  // ---------- intro / curated views ----------
  private viewFocus(): THREE.Vector3 {
    if (this.mode === 'intro' && this.arrival) return this.arrival.focus;
    return this.mode === 'view' && this.params.view === 'market' ? new THREE.Vector3(2, 22, 0) : new THREE.Vector3(0, 30, 0);
  }

  private updateTitleCam(): void {
    const t = performance.now() / 1000;
    const c = this.renderer.camera;
    c.position.set(Math.sin(t * 0.05) * 30, 64, 190);
    c.lookAt(0, 58, 0);
  }

  private updateView(): void {
    const c = this.renderer.camera;
    if (this.params.view === 'wide') {
      c.position.set(0, 66, 182);
      c.lookAt(0, 60, 0);
      this.renderer.bokeh.enabled = true;
      (this.renderer.bokeh.uniforms as any).focus.value = 175;
    } else if (['shadow', 'reach', 'release', 'fall'].includes(this.candy.phase)) {
      // look up toward the glass while the giant reaches in
      c.position.set(-4, 21.4, -5.5);
      c.lookAt(3, 29, 12);
    } else {
      c.position.set(-7.5, 22.0, 11.6);
      c.lookAt(4, 24.8, -3);
    }
  }

  private onKey(code: string): void {
    if (this.mode === 'intro') {
      if (code === 'Escape' || code === 'Enter') this.arrival?.finish();
      return;
    }
    if (this.mode !== 'play' && this.mode !== 'title') return;
    if (this.ui.handleKey(code)) return;
  }

  // ---------- save / load ----------
  serialize(): SaveData {
    const st = this.state;
    const p = this.player.body.pos;
    const lifts: Record<string, number> = {};
    for (const [k, L] of this.wd.lifts) lifts[k] = L.target;
    const story = this.story.serialize();
    return {
      version: SAVE_VERSION,
      time: this.simTime,
      player: { x: p.x, y: p.y, z: p.z, yaw: this.player.fig.yaw },
      stats: { health: st.health, hunger: st.hunger, thirst: st.thirst, stamina: this.player.stamina },
      inv: { ...st.inv },
      tokens: st.tokens,
      debt: st.debt,
      rep: { ...st.rep },
      satchel: st.satchel,
      weapons: { ...st.weapons },
      homeTier: st.homeTier,
      stash: { ...st.stash },
      maxHealth: st.maxHealth,
      cart: { ...this.underfall.cart },
      onboard: this.onboarding.serialize(),
      quest: { stage: story.stage, choice: story.choice, flags: story.flags, signatures: story.signatures, deliveries: story.deliveries, ...({ signed: story.signed, job: story.job, checkpoint: this.checkpointOpen } as any) },
      world: {
        liftRepaired: st.liftRepaired,
        homeRepaired: st.homeRepaired,
        supply: st.supply,
        heapReady: { ...st.heapReady },
        stock: JSON.parse(JSON.stringify(st.stock)),
        candyEvents: this.candy.count,
        nextCandy: isFinite(this.candy.nextAt) ? this.candy.nextAt : -1,
        lifts,
        lastMeal: st.lastMeal,
      },
    };
  }

  save(): boolean {
    if (this.mode !== 'play' || this.params.view) return false;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.serialize()));
      return true;
    } catch {
      return false;
    }
  }

  hasSave(): boolean {
    try {
      return !!localStorage.getItem(SAVE_KEY);
    } catch {
      return false;
    }
  }

  load(): boolean {
    let d: SaveData;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      d = JSON.parse(raw);
    } catch {
      return false;
    }
    if (!validSave(d)) return false;
    try {
      this.applySave(d);
      return true;
    } catch (err) {
      console.warn('save failed to apply', err);
      return false;
    }
  }

  private applySave(d: SaveData): void {
    const st = this.state;
    this.simTime = d.time;
    st.health = d.stats.health;
    st.hunger = d.stats.hunger;
    st.thirst = d.stats.thirst;
    this.player.stamina = d.stats.stamina;
    st.inv = { ...d.inv };
    st.tokens = d.tokens;
    st.debt = d.debt ?? 40;
    st.rep = { ...d.rep };
    st.satchel = d.satchel;
    st.weapons = { pick: false, sling: false, ...d.weapons };
    st.homeTier = d.homeTier ?? 0;
    st.stash = { ...(d.stash ?? {}) };
    st.maxHealth = d.maxHealth ?? 100;
    this.underfall.cart = { ...(d.cart ?? {}) };
    st.liftRepaired = d.world.liftRepaired;
    st.homeRepaired = d.world.homeRepaired;
    st.supply = d.world.supply;
    st.heapReady = { ...d.world.heapReady };
    st.stock = d.world.stock;
    st.lastMeal = d.world.lastMeal;
    this.story.load({ ...d.quest });
    this.wd.lifts.get('depths')!.working = st.liftRepaired;
    for (const [k, v] of Object.entries(d.world.lifts)) {
      const L = this.wd.lifts.get(k);
      if (L) L.t = L.target = v;
    }
    this.candy.count = d.world.candyEvents;
    this.candy.nextAt = d.world.nextCandy >= 0 ? d.world.nextCandy : Infinity;
    // saved mid-chapter while waiting for the sky: make sure a drop is coming
    if (this.story.stage === S.Candy && this.candy.phase === 'idle' && !isFinite(this.candy.nextAt)) this.candy.trigger(this.simTime, 4, this.wd.candyLanding, 'market');
    if ((d.quest as any).checkpoint) this.openCheckpoint(true);
    this.applyHomeVisuals();
    this.player.place(new THREE.Vector3(d.player.x, d.player.y + 0.05, d.player.z), d.player.yaw);
    this.cam.yaw = d.player.yaw + Math.PI;
    this.cam.snap(this.focusPoint());
    this.district = this.districtAt(new THREE.Vector3(d.player.x, d.player.y, d.player.z));
    this.wd.lifts.get('cargo')!.working = this.story.flags.has('cargoFixed');
    this.mode = 'play';
    // saves from before Chapter Zero have no onboard block: they count as finished
    this.onboarding.load(d.onboard);
  }

  restart(): void {
    localStorage.removeItem(SAVE_KEY);
    // back to the title screen with a clean slate (keep only seed/quality preferences)
    const q = new URLSearchParams(location.search);
    const keep = new URLSearchParams();
    for (const k of ['seed', 'quality']) if (q.has(k)) keep.set(k, q.get(k)!);
    const s = keep.toString();
    location.href = location.pathname + (s ? `?${s}` : '');
  }

  // ---------- settings ----------
  private readSettings(): any {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    } catch {
      return {};
    }
  }
  private writeSettings(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ low: this.renderer.low, camDist: this.cam.dist, sens: this.cam.sens, invert: this.cam.invertY, volume: this.audio.volume }));
    } catch {
      /* private mode */
    }
  }

  private uiHost() {
    const g = this;
    return {
      get state() {
        return g.state;
      },
      objective: () => (g.mode === 'intro' ? '' : g.onboarding.active ? (g.onboarding.objective() ?? '') : g.story.objective()),
      playerPos: () => g.player.body.pos,
      markerPos: () => g.marker(),
      stamina: () => g.player.stamina,
      save: () => g.save(),
      load: () => g.load(),
      hasSave: () => g.hasSave(),
      restart: () => g.restart(),
      unstuck: () => g.player.recover(),
      setQuality: (low: boolean) => {
        g.renderer.setQuality(low);
        g.writeSettings();
      },
      quality: () => g.renderer.low,
      camDist: (v?: number) => {
        if (v !== undefined) {
          g.cam.dist = v;
          g.writeSettings();
        }
        return g.cam.dist;
      },
      sens: (v?: number) => {
        if (v !== undefined) {
          g.cam.sens = v;
          g.writeSettings();
        }
        return g.cam.sens;
      },
      invert: (v?: boolean) => {
        if (v !== undefined) {
          g.cam.invertY = v;
          g.writeSettings();
        }
        return g.cam.invertY;
      },
      soundOn: (v?: boolean) => {
        if (v === true) g.audio.enable();
        if (v === false) g.audio.disable();
        return g.audio.enabled;
      },
      volume: (v?: number) => {
        if (v !== undefined) {
          g.audio.setVolume(v);
          g.writeSettings();
        }
        return g.audio.volume;
      },
      setUICapture: (on: boolean) => (g.input.uiCapture = on),
      setPaused: (on: boolean) => (g.paused = on),
      craft: (id: string) => g.craft(id),
      homeAction: (a: 'build' | 'deposit' | 'take' | 'cook' | 'barrel' | 'fang', i?: Item) => g.homeAction(a, i),
      beginGame: (fromSave: boolean) => g.beginGame(fromSave),
      district: () => g.district,
      hasFlag: (f: string) => g.story.flags.has(f),
      stats: () =>
        `${g.renderer.fps.toFixed(0)} fps · ${g.renderer.avgFrameMs.toFixed(1)} ms · res ${(g.renderer.resScale * 100).toFixed(0)}%\n${g.renderer.gl.info.render.calls} calls · ${(g.renderer.gl.info.render.triangles / 1000).toFixed(0)}k tris · ${g.figs.drawn} people\n${g.renderer.rendererInfo.slice(0, 60)}`,
      sfx: (n: string) => g.audio.play(n),
    };
  }
}

void CABINET;

/** Enough shape to load without throwing halfway; anything else is reported, never deleted. */
function validSave(d: any): d is SaveData {
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const obj = (v: unknown): boolean => !!v && typeof v === 'object';
  return (
    obj(d) &&
    d.version === SAVE_VERSION &&
    num(d.time) &&
    obj(d.player) && num(d.player.x) && num(d.player.y) && num(d.player.z) && num(d.player.yaw) &&
    obj(d.stats) && num(d.stats.health) && num(d.stats.hunger) && num(d.stats.thirst) && num(d.stats.stamina) &&
    obj(d.inv) && obj(d.rep) && obj(d.quest) &&
    obj(d.world) && obj(d.world.heapReady) && obj(d.world.stock) && obj(d.world.lifts)
  );
}
