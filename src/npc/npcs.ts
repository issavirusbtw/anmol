// NPC population: named residents with roles, schedules, navigation and reactions.
import * as THREE from 'three';
import { Rng } from '../core/rng';
import { AnimState, Figure, FigureSystem, Look, SKIN, HAIR, HairStyle } from '../characters/figure';
import { WorldData, NavNode } from '../world/worldData';
import { CrowdWalker } from '../world/distant';
import type { Faction } from '../systems/state';

export type Role =
  | 'guide'
  | 'vendor'
  | 'cook'
  | 'engineer'
  | 'guard'
  | 'official'
  | 'resident'
  | 'scavenger'
  | 'porter'
  | 'child'
  | 'sweeper'
  | 'courier'
  | 'diner'
  | 'talker'
  | 'gardener'
  | 'stroller'
  | 'clerk';

export interface NpcDef {
  id: string;
  name: string;
  role: Role;
  district: string;
  faction: Faction | 'none';
  /** primary post node */
  post: string;
  /** anim at post */
  postAnim?: AnimState;
  /** where to face while at the post */
  face?: [number, number];
  /** tags this NPC wanders between */
  wander?: string[];
  /** fixed route for porters / patrols */
  route?: string[];
  talkable?: boolean;
  look?: Partial<Look>;
}

type Mode = 'walk' | 'act' | 'rush' | 'gather' | 'guardCandy' | 'wait';

export class Npc {
  fig: Figure;
  path: NavNode[] = [];
  pi = 0;
  node: string;
  mode: Mode = 'act';
  actUntil = 0;
  actAnim: AnimState = 'idle';
  faceYaw: number | null = null;
  speed: number;
  off: number;
  lodAcc = 0;
  routeIdx = 0;
  target = new THREE.Vector3();
  rushTarget: THREE.Vector3 | null = null;
  shardsTaken = 0;
  lastTalk = -999;
  /** driven by a script (onboarding) instead of the population sim */
  pinned = false;
  constructor(
    public def: NpcDef,
    figs: FigureSystem,
    look: Look,
    start: NavNode,
    public rng: Rng,
  ) {
    this.fig = figs.add(look);
    this.fig.pos.copy(start.pos);
    this.node = start.id;
    this.speed = def.role === 'child' ? 2.6 : def.role === 'courier' ? 2.4 : rng.range(1.15, 1.55);
    this.off = rng.range(-0.25, 0.25);
    this.fig.yaw = rng.range(0, Math.PI * 2);
    this.fig.t = rng.range(0, 10);
  }
}

const POOR_SHIRTS = [0x8a5a44, 0x6b7a5a, 0x7a6a8a, 0x9a7a4a, 0x5a6a7a, 0xa0634a, 0x6a5040, 0x4a6a6a, 0xb08a5a];
const POOR_PANTS = [0x4a3b30, 0x3a3a44, 0x5a4a3a, 0x2f3a30, 0x4a4040];
const RICH = [0xe8d8e8, 0xd8ead2, 0xcfe3e8, 0xf2e6c8, 0xe8c8c8, 0xf5efe6];

function makeLook(role: Role, faction: string, rng: Rng, extra: Partial<Look> = {}): Look {
  const hs: HairStyle[] = ['short', 'bun', 'long', 'bald', 'curly', 'tail'];
  const base: Look = {
    skin: rng.pick(SKIN),
    shirt: rng.pick(POOR_SHIRTS),
    pants: rng.pick(POOR_PANTS),
    shoes: rng.pick([0x2a2018, 0x3a2a1e, 0x1e1e22, 0x5a3a2a]),
    hair: rng.pick(HAIR),
    hairStyle: rng.pick(hs),
    hat: 'none',
    hatColor: 0,
    longSleeves: rng.chance(0.5),
    build: rng.range(0.88, 1.15),
    height: rng.range(0.92, 1.06),
    skirt: rng.chance(0.18),
  };
  if (rng.chance(0.35)) base.scarf = rng.pick([0xc0392b, 0xd9822b, 0x2e86ab, 0x6a994e, 0xe1b12c]);
  switch (role) {
    case 'guard':
      Object.assign(base, { shirt: 0x24364a, pants: 0x1c2430, hat: 'helmet', hatColor: 0xc9a24a, sash: 0xc9a24a, longSleeves: true, skirt: false, scarf: undefined });
      break;
    case 'official':
      Object.assign(base, { shirt: 0x283a4c, pants: 0x1f2a36, hat: 'tall', hatColor: 0x1b2430, cape: 0x6a1f2d, sash: 0xd9b25a, longSleeves: true, skirt: false });
      break;
    case 'engineer':
    case 'scavenger':
      Object.assign(base, { shirt: rng.pick([0x3f4a3a, 0x4a5a6a]), apron: 0x6b4a2b, hat: 'goggles', hatColor: 0xb0b0b0 });
      break;
    case 'courier':
      Object.assign(base, { shirt: 0xe05a2b, pack: 0x8a6a3a, hat: 'cap', hatColor: 0xe05a2b, longSleeves: false });
      break;
    case 'cook':
    case 'diner':
      if (faction === 'table') Object.assign(base, { apron: 0xf0e6d0, scarf: 0xc0392b });
      break;
    case 'vendor':
      base.apron = rng.pick([0xf0e6d0, 0x8a4b3a, 0x2e6a8a]);
      break;
    case 'porter':
      Object.assign(base, { pack: 0x8a6a3a, hat: 'wrap', hatColor: rng.pick([0xc79a3a, 0x8a4b3a]) });
      break;
    case 'child':
      Object.assign(base, { height: rng.range(0.62, 0.72), build: 0.9 });
      break;
    case 'gardener':
      Object.assign(base, { shirt: 0x5d7f4a, apron: 0x3d6b48, hat: 'wrap', hatColor: 0xe8d9b0 });
      break;
    case 'stroller':
    case 'clerk':
      Object.assign(base, { shirt: rng.pick(RICH), pants: rng.pick([0x6a7a8a, 0x8a7a9a, 0xd8d0c0]), longSleeves: true, shoes: 0xf2efe6 });
      if (rng.chance(0.4)) Object.assign(base, { hat: 'tall', hatColor: rng.pick(RICH) });
      break;
  }
  return { ...base, ...extra };
}

/** The cast. Named characters drive the story; the rest make the city feel lived in. */
export function npcDefs(): NpcDef[] {
  const d: NpcDef[] = [
    // --- Depths ---
    { id: 'mara', name: 'Mara', role: 'guide', district: 'depths', faction: 'table', post: 'd.doorMara', postAnim: 'talk', face: [0, 1], talkable: true, look: { shirt: 0x6a3d5e, scarf: 0xd9822b, hairStyle: 'bun', hair: 0x8c8c8c, skin: 0xc68a60, apron: 0xe8d9b0, longSleeves: true } },
    { id: 'ines', name: 'Ines', role: 'engineer', district: 'depths', faction: 'union', post: 'd.L9', postAnim: 'work', face: [1, -0.4], talkable: true, look: { skin: 0x6e4529, hairStyle: 'curly', hair: 0x1a1a1a } },
    { id: 'rook', name: 'Rook', role: 'vendor', district: 'depths', faction: 'union', post: 'd.WS0', postAnim: 'serve', face: [0, -1], talkable: true, look: { hairStyle: 'bald', skin: 0xe0ac84, apron: 0x6b4a2b, shirt: 0x3f4a3a } },
    { id: 'pell', name: 'Pell', role: 'vendor', district: 'depths', faction: 'table', post: 'd.P1', postAnim: 'serve', face: [0, -1], talkable: true },
    { id: 'aunt', name: 'Old Fenna', role: 'cook', district: 'depths', faction: 'table', post: 'd.K2', postAnim: 'cook', face: [1, -0.3], wander: ['pantry'] },
    { id: 'tamsin', name: 'Tamsin', role: 'engineer', district: 'depths', faction: 'union', post: 'd.WS1', postAnim: 'work', face: [0, 1], wander: ['heap', 'workshop'] },
    { id: 'scav1', name: 'Gil', role: 'scavenger', district: 'depths', faction: 'union', post: 'd.H0', postAnim: 'collect', route: ['d.H0', 'd.H1', 'd.WS0'] },
    { id: 'scav2', name: 'Nessa', role: 'scavenger', district: 'depths', faction: 'runners', post: 'd.H1', postAnim: 'collect', route: ['d.H1', 'd.S0', 'd.H0', 'd.W0'] },
    { id: 'res1', name: 'Juno', role: 'resident', district: 'depths', faction: 'table', post: 'd.inJuno', wander: ['lane', 'kitchen', 'water', 'window', 'door'] },
    { id: 'res2', name: 'Bram', role: 'resident', district: 'depths', faction: 'none', post: 'd.L5', wander: ['lane', 'water', 'stallFront', 'gallery'] },
    { id: 'res3', name: 'Ottilie', role: 'resident', district: 'depths', faction: 'table', post: 'd.G3', wander: ['gallery', 'tea', 'lane'] },
    { id: 'diner1', name: 'Hob', role: 'diner', district: 'depths', faction: 'table', post: 'd.K0', postAnim: 'sit', face: [0, -1] },
    { id: 'diner2', name: 'Lise', role: 'diner', district: 'depths', faction: 'table', post: 'd.K1', postAnim: 'sit', face: [0, -1] },
    { id: 'kid1', name: 'Pim', role: 'child', district: 'depths', faction: 'none', post: 'd.L4', wander: ['lane', 'spill', 'window', 'water'] },
    { id: 'kid2', name: 'Wick', role: 'child', district: 'depths', faction: 'none', post: 'd.L6', wander: ['lane', 'spill', 'window', 'kitchen'] },
    { id: 'sweep1', name: 'Dorran', role: 'sweeper', district: 'depths', faction: 'none', post: 'd.L2', postAnim: 'sweep', wander: ['lane'] },
    { id: 'win1', name: 'Ada', role: 'diner', district: 'depths', faction: 'none', post: 'd.F0', postAnim: 'sit', face: [0, 1] },
    { id: 'talkA', name: 'Corin', role: 'talker', district: 'depths', faction: 'none', post: 'd.G2', postAnim: 'talk', face: [1, 0] },
    { id: 'talkB', name: 'Mab', role: 'talker', district: 'depths', faction: 'none', post: 'd.G3', postAnim: 'talk', face: [-1, 0] },
    { id: 'patch', name: 'Patch', role: 'scavenger', district: 'depths', faction: 'none', post: 'd.S0', postAnim: 'idle', face: [0, 1], talkable: true, look: { shirt: 0x5d7f4a, sleeveR: 0xb5523b, pants: 0x6a6a6a, scarf: 0xd9a441, pack: 0x8a6a3a, patches: 0xb5523b, bow: true, hat: 'none', apron: undefined, hairStyle: 'curly', hair: 0x4a2f1c, skin: 0xe0ac84, longSleeves: true, build: 0.95, height: 1.0, skirt: false } },
    { id: 'duke', name: 'Duke Tallow', role: 'clerk', district: 'depths', faction: 'union', post: 's.GATE', postAnim: 'guard', face: [0, -1], talkable: true, look: { shirt: 0x4a3a2a, pants: 0x2a2018, cape: 0xb8bec4, sash: 0xd9a441, hat: 'tall', hatColor: 0x2a2018, hairStyle: 'short', hair: 0x8c8c8c, build: 1.15, longSleeves: true } },
    // --- Threadmarket ---
    { id: 'odo', name: 'Odo', role: 'vendor', district: 'market', faction: 'table', post: 'm.B0', postAnim: 'serve', face: [0, 1], talkable: true, look: { build: 1.2, hairStyle: 'short', hair: 0x7a4b25 } },
    { id: 'wren', name: 'Wren', role: 'vendor', district: 'market', faction: 'runners', post: 'm.B1', postAnim: 'serve', face: [0, 1], talkable: true },
    { id: 'sela', name: 'Sela', role: 'vendor', district: 'market', faction: 'runners', post: 'm.B2', postAnim: 'serve', face: [0, 1], talkable: true, look: { hairStyle: 'long', hair: 0x7b2e1e, shirt: 0x8a4f78 } },
    { id: 'tobb', name: 'Tobb', role: 'vendor', district: 'market', faction: 'union', post: 'm.B3', postAnim: 'serve', face: [0, 1], talkable: true },
    { id: 'bel', name: 'Auntie Bel', role: 'cook', district: 'market', faction: 'table', post: 'm.CT', postAnim: 'serve', face: [0, -1], talkable: true, look: { build: 1.18, hairStyle: 'bun', hair: 0xd8cfc0, apron: 0xf0e6d0, scarf: 0xc0392b, skin: 0x9a6440 } },
    { id: 'pip', name: 'Pip', role: 'courier', district: 'market', faction: 'runners', post: 'm.T0', postAnim: 'idle', face: [0, -1], talkable: true },
    { id: 'dov', name: 'Dov', role: 'engineer', district: 'market', faction: 'union', post: 'm.R1', postAnim: 'work', face: [1, 0], talkable: true },
    { id: 'calloway', name: 'Warden Calloway', role: 'official', district: 'market', faction: 'authority', post: 'm.G0', postAnim: 'guard', face: [1, -0.5], talkable: true },
    { id: 'guard1', name: 'Guard Hesk', role: 'guard', district: 'market', faction: 'authority', post: 'm.CP0', postAnim: 'guard', face: [0, 1], talkable: true },
    { id: 'guard2', name: 'Guard Tull', role: 'guard', district: 'market', faction: 'authority', post: 'm.G0', postAnim: 'guard', face: [0, 1], route: ['m.G0', 'm.P5', 'm.P0', 'm.S3', 'm.S2', 'm.S1', 'm.S0', 'm.CP0'] },
    { id: 'porter1', name: 'Fen', role: 'porter', district: 'market', faction: 'union', post: 'm.S7', postAnim: 'carry', route: ['m.S7', 'm.S6', 'm.S5', 'm.S45', 'm.S4', 'm.S3', 'm.S2', 'm.S1', 'm.GA', 'm.B0'] },
    { id: 'porter2', name: 'Lark', role: 'porter', district: 'market', faction: 'union', post: 'm.R0', postAnim: 'carry', route: ['m.R0', 'm.P2', 'm.P1', 'm.P0', 'm.P5', 'm.CT', 'm.G0'] },
    { id: 'shop1', name: 'Tessaly', role: 'resident', district: 'market', faction: 'none', post: 'm.S1', wander: ['shop', 'plaza', 'walk'] },
    { id: 'shop2', name: 'Morrow', role: 'resident', district: 'market', faction: 'none', post: 'm.S4', wander: ['shop', 'plaza', 'street'] },
    { id: 'shop3', name: 'Yan', role: 'resident', district: 'market', faction: 'runners', post: 'm.P3', wander: ['plaza', 'shop', 'tower', 'walk'] },
    { id: 'shop4', name: 'Bethe', role: 'resident', district: 'market', faction: 'table', post: 'm.P1', wander: ['plaza', 'commonTable', 'shop'] },
    { id: 'shop5', name: 'Quint', role: 'resident', district: 'market', faction: 'none', post: 'm.W2', wander: ['walk', 'street', 'plaza'] },
    { id: 'shop6', name: 'Riva', role: 'resident', district: 'market', faction: 'none', post: 'm.S5', wander: ['shop', 'repairFront', 'plaza'] },
    { id: 'mtalkA', name: 'Ebb', role: 'talker', district: 'market', faction: 'none', post: 'm.P1', postAnim: 'talk', face: [1, 0.3] },
    { id: 'mtalkB', name: 'Sorrel', role: 'talker', district: 'market', faction: 'none', post: 'm.P2', postAnim: 'talk', face: [-1, -0.3] },
    { id: 'msit1', name: 'Old Haw', role: 'diner', district: 'market', faction: 'table', post: 'm.P5', postAnim: 'sit', face: [1, 0] },
    { id: 'mkid1', name: 'Tansy', role: 'child', district: 'market', faction: 'none', post: 'm.P4', wander: ['plaza', 'street', 'walk'] },
    { id: 'mkid2', name: 'Burr', role: 'child', district: 'market', faction: 'none', post: 'm.P0', wander: ['plaza', 'street', 'tower'] },
    { id: 'msweep', name: 'Nub', role: 'sweeper', district: 'market', faction: 'none', post: 'm.S3', postAnim: 'sweep', wander: ['street', 'plaza'] },
    // --- Heights ---
    { id: 'quill', name: 'Registrar Quill', role: 'clerk', district: 'heights', faction: 'authority', post: 'h.R1', postAnim: 'serve', face: [1, 0.4], talkable: true, look: { hat: 'tall', hatColor: 0x1b2430, shirt: 0x283a4c, sash: 0xd9b25a } },
    { id: 'marrow', name: 'Lady Marrow', role: 'vendor', district: 'heights', faction: 'authority', post: 'h.M1', postAnim: 'serve', face: [0.6, 1], talkable: true, look: { shirt: 0xe8c8c8, skirt: true, hairStyle: 'bun', hair: 0xd8cfc0 } },
    { id: 'hguard', name: 'Guard Vey', role: 'guard', district: 'heights', faction: 'authority', post: 'h.AG', postAnim: 'guard', face: [-1, 0] },
    { id: 'gard1', name: 'Ilse', role: 'gardener', district: 'heights', faction: 'none', post: 'h.P1', postAnim: 'work', wander: ['plaza', 'promenade'] },
    { id: 'stroll1', name: 'Sir Abelard', role: 'stroller', district: 'heights', faction: 'authority', post: 'h.F1', wander: ['promenade', 'plaza', 'reservoir'] },
    { id: 'stroll2', name: 'Perpetua', role: 'stroller', district: 'heights', faction: 'authority', post: 'h.F2', wander: ['promenade', 'plaza', 'reserveFront'] },
    { id: 'stroll3', name: 'Thimbleton', role: 'stroller', district: 'heights', faction: 'none', post: 'h.F0', postAnim: 'sit', face: [0, 1] },
  ];
  return d;
}

export interface PopCtx {
  time: number;
  playerPos: THREE.Vector3;
  camPos: THREE.Vector3;
  groundAt: (x: number, z: number, maxY: number) => number;
}

export class Population {
  npcs: Npc[] = [];
  byId = new Map<string, Npc>();
  extras: { fig: Figure; w: CrowdWalker; t: number }[] = [];
  candy: { active: boolean; at: THREE.Vector3; phase: string; shards: { pos: THREE.Vector3; taken: boolean; id: number }[] } = {
    active: false,
    at: new THREE.Vector3(),
    phase: 'idle',
    shards: [],
  };
  onShardTaken: ((idx: number, npc: Npc) => void) | null = null;
  /** count of NPCs currently moving (for tests / stats) */
  moving = 0;

  constructor(
    private wd: WorldData,
    private figs: FigureSystem,
    private rng: Rng,
  ) {
    for (const def of npcDefs()) {
      const r = rng.fork(def.id);
      const start = wd.nav.get(def.post);
      if (!start) throw new Error(`NPC ${def.id} post ${def.post} missing`);
      const npc = new Npc(def, figs, makeLook(def.role, def.faction, r, def.look), start, r);
      npc.actAnim = def.postAnim ?? 'idle';
      npc.actUntil = r.range(1, 6);
      if (def.face) npc.faceYaw = Math.atan2(def.face[0], def.face[1]);
      this.npcs.push(npc);
      this.byId.set(def.id, npc);
    }
  }

  addExtras(walkers: CrowdWalker[]): void {
    const r = this.rng.fork('extras');
    for (const w of walkers) {
      const look = makeLook(w.a.y > 40 ? 'stroller' : 'resident', 'none', r);
      const fig = this.figs.add(look, true);
      fig.pos.copy(w.a);
      fig.t = r.range(0, 10);
      this.extras.push({ fig, w, t: r.range(0, 1) });
    }
  }

  /** Choose the next thing for an NPC to do (deterministic per NPC). */
  private plan(n: Npc, ctx: PopCtx): void {
    const d = n.def;
    const r = n.rng;
    const goTo = (id: string) => {
      const p = this.wd.path(n.node, id);
      if (p.length > 1) {
        n.path = p;
        n.pi = 1;
        n.mode = 'walk';
      } else {
        n.mode = 'act';
        n.actUntil = ctx.time + r.range(2, 5);
      }
    };
    if (d.route) {
      // porters and patrols cycle a route, working at the ends
      n.routeIdx = (n.routeIdx + 1) % d.route.length;
      goTo(d.route[n.routeIdx]);
      n.fig.carry = d.role === 'porter' && n.routeIdx % 2 === 1 ? 0xb48a5c : d.role === 'scavenger' && d.route[n.routeIdx].includes('WS') ? 0x9a9a9a : null;
      return;
    }
    if (d.wander && r.chance(d.role === 'resident' || d.role === 'child' || d.role === 'stroller' ? 0.85 : 0.35)) {
      const tag = r.pick(d.wander);
      const opts = this.wd.nodesWith(tag, d.district).filter((x) => x.id !== n.node && !x.tags.includes('liftCar'));
      if (opts.length) {
        goTo(r.pick(opts).id);
        return;
      }
    }
    if (n.node !== d.post) {
      goTo(d.post);
      return;
    }
    n.mode = 'act';
    n.actAnim = d.postAnim ?? 'idle';
    n.actUntil = ctx.time + r.range(6, 16);
    if (d.face) n.faceYaw = Math.atan2(d.face[0], d.face[1]);
  }

  update(dt: number, ctx: PopCtx): void {
    this.moving = 0;
    for (const n of this.npcs) {
      if (n.pinned) continue;
      // simulation LOD: far NPCs update at a quarter rate
      const far = n.fig.pos.distanceToSquared(ctx.camPos) > 45 * 45;
      n.lodAcc += dt;
      if (far && n.lodAcc < dt * 4) {
        n.fig.t += dt;
        continue;
      }
      const step = n.lodAcc;
      n.lodAcc = 0;
      this.updateNpc(n, step, ctx);
      if (n.mode === 'walk' || n.mode === 'rush') this.moving++;
    }
    // distant extras: ping-pong walkers, updated cheaply
    for (const e of this.extras) {
      e.fig.t += dt;
      if (e.w.standing) {
        e.fig.state = 'talk';
        continue;
      }
      const len = e.w.a.distanceTo(e.w.b);
      e.t += (dt * e.w.speed) / Math.max(1, len);
      const ph = e.t % 2;
      const k = ph < 1 ? ph : 2 - ph;
      const prev = e.fig.pos.clone();
      e.fig.pos.lerpVectors(e.w.a, e.w.b, k);
      const dx = e.fig.pos.x - prev.x, dz = e.fig.pos.z - prev.z;
      if (Math.abs(dx) + Math.abs(dz) > 1e-5) e.fig.yaw = Math.atan2(dx, dz);
      e.fig.state = 'walk';
      e.fig.stride(Math.hypot(dx, dz), false);
    }
  }

  private updateNpc(n: Npc, dt: number, ctx: PopCtx): void {
    const f = n.fig;
    f.t += dt;
    const c = this.candy;
    if (n.mode === 'walk' || n.mode === 'rush' || n.mode === 'gather') {
      const goal = n.mode === 'walk' ? n.path[n.pi]?.pos : n.rushTarget;
      if (!goal) {
        n.mode = 'act';
        n.actUntil = ctx.time + 2;
        return;
      }
      // lateral lane offset so crowds don't walk single-file (not on the final node, or on stairs/bridges)
      let tx = goal.x, tz = goal.z;
      if (n.mode === 'walk' && n.pi < n.path.length - 1 && n.pi > 0) {
        const from = n.path[n.pi - 1].pos;
        const sx = goal.x - from.x, sz = goal.z - from.z;
        const sl = Math.hypot(sx, sz);
        const flat = Math.abs(goal.y - from.y) < 0.05;
        if (sl > 1e-3 && flat) {
          tx += (-sz / sl) * n.off * 1.6;
          tz += (sx / sl) * n.off * 1.6;
        }
      }
      const dx = tx - f.pos.x, dz = tz - f.pos.z;
      const dist = Math.hypot(dx, dz);
      const run = n.mode === 'rush' || n.def.role === 'child';
      const sp = n.speed * (n.mode === 'rush' ? 2.1 : 1);
      // yield to the player
      const pdx = ctx.playerPos.x - f.pos.x, pdz = ctx.playerPos.z - f.pos.z;
      const pd = Math.hypot(pdx, pdz);
      const blocked = pd < 0.9 && Math.abs(ctx.playerPos.y - f.pos.y) < 1 && (pdx * dx + pdz * dz) / (pd * dist + 1e-6) > 0.6;
      if (dist < 0.15 || dist < sp * dt) {
        f.pos.x = tx;
        f.pos.z = tz;
        f.pos.y = goal.y;
        if (n.mode === 'walk') {
          n.node = n.path[n.pi].id;
          n.pi++;
          if (n.pi >= n.path.length) {
            n.mode = 'act';
            const dd = n.def;
            const atPost = n.node === dd.post || (dd.route && dd.route.includes(n.node));
            n.actAnim = atPost ? dd.postAnim ?? 'idle' : n.rng.pick(['idle', 'talk', 'idle', 'point'] as AnimState[]);
            if (dd.role === 'child') n.actAnim = n.rng.pick(['cheer', 'idle', 'collect'] as AnimState[]);
            if (n.node.includes('.F') && dd.district === 'depths') n.actAnim = 'sit';
            n.faceYaw = atPost && dd.face ? Math.atan2(dd.face[0], dd.face[1]) : null;
            n.actUntil = ctx.time + n.rng.range(atPost ? 6 : 3, atPost ? 14 : 8);
          }
        } else if (n.mode === 'rush') {
          n.mode = 'gather';
          n.actUntil = ctx.time + n.rng.range(3, 6);
        }
        return;
      }
      if (n.mode === 'gather') {
        f.state = 'collect';
        return;
      }
      if (blocked) {
        f.state = 'idle';
        return;
      }
      const mv = Math.min(dist, sp * dt);
      const ux = dx / dist, uz = dz / dist;
      // perpendicular offset fades in mid-segment
      const prevX = f.pos.x, prevZ = f.pos.z;
      f.pos.x += ux * mv;
      f.pos.z += uz * mv;
      if (n.mode === 'walk') {
        const from = n.path[n.pi - 1]?.pos ?? goal;
        const segLen = from.distanceTo(goal);
        const tSeg = segLen > 0.01 ? 1 - dist / segLen : 1;
        f.pos.y = from.y + (goal.y - from.y) * Math.max(0, Math.min(1, tSeg));
      } else {
        const g = ctx.groundAt(f.pos.x, f.pos.z, f.pos.y + 0.6);
        if (g > -Infinity) f.pos.y = g;
      }
      const wantYaw = Math.atan2(ux, uz);
      let dy = wantYaw - f.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      f.yaw += dy * Math.min(1, dt * 10);
      f.state = n.fig.carry !== null ? 'carry' : run ? 'run' : 'walk';
      f.stride(Math.hypot(f.pos.x - prevX, f.pos.z - prevZ), run);
      void n.off;
      return;
    }
    // acting
    if (c.active && n.mode === 'guardCandy') {
      f.state = 'guard';
      const dx = c.at.x - f.pos.x, dz = c.at.z - f.pos.z;
      f.yaw = Math.atan2(-dx, -dz);
      return;
    }
    f.state = n.actAnim;
    if (n.faceYaw !== null) {
      let dy = n.faceYaw - f.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      f.yaw += dy * Math.min(1, dt * 4);
    }
    // turn toward a nearby player when idle-ish and talkable
    if (n.def.talkable && f.pos.distanceTo(ctx.playerPos) < 3.2 && n.actAnim !== 'sit' && n.actAnim !== 'cook' && n.actAnim !== 'work') {
      const dx = ctx.playerPos.x - f.pos.x, dz = ctx.playerPos.z - f.pos.z;
      const want = Math.atan2(dx, dz);
      let dy = want - f.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      f.yaw += dy * Math.min(1, dt * 5);
      if (f.state === 'serve' || f.state === 'idle' || f.state === 'guard') f.state = 'talk';
    }
    if (ctx.time > n.actUntil && !n.def.talkable) this.plan(n, ctx);
    else if (ctx.time > n.actUntil && n.def.talkable) {
      // story NPCs mostly stay at their posts so the player can find them
      if (n.def.wander && n.rng.chance(0.3)) this.plan(n, ctx);
      else n.actUntil = ctx.time + n.rng.range(5, 12);
      if (n.node !== n.def.post) this.plan(n, ctx);
    }
  }

  // ---------- candy event hooks ----------
  /** Residents near the drop rush in; guards and the Warden move to secure it. */
  reactCandy(phase: string, at: THREE.Vector3, district: string, time: number): void {
    const c = this.candy;
    c.phase = phase;
    if (phase === 'shadow') {
      for (const n of this.npcs) {
        if (n.def.district !== district) continue;
        if (n.mode === 'act' && n.actAnim !== 'sit') {
          n.actAnim = 'point';
          n.actUntil = time + 4;
          n.faceYaw = Math.atan2(at.x - n.fig.pos.x, 14 - n.fig.pos.z);
        }
      }
    }
    if (phase === 'impact') {
      c.active = true;
      c.at.copy(at);
      for (const n of this.npcs) {
        if (n.def.district !== district) continue;
        const r = n.def.role;
        if (r === 'guard' || r === 'official') {
          n.mode = 'rush';
          const a = n.rng.range(0, Math.PI * 2);
          n.rushTarget = at.clone().add(new THREE.Vector3(Math.cos(a) * 3.2, 0, Math.sin(a) * 3.2));
          n.path = [];
          n.actUntil = time + 999;
        } else if (r === 'resident' || r === 'child' || r === 'talker' || r === 'porter' || r === 'sweeper' || r === 'diner' || r === 'scavenger') {
          n.mode = 'rush';
          n.fig.carry = null;
          const a = n.rng.range(0, Math.PI * 2);
          n.rushTarget = at.clone().add(new THREE.Vector3(Math.cos(a) * n.rng.range(2.6, 4.6), 0, Math.sin(a) * n.rng.range(2.6, 4.6)));
          n.path = [];
        } else if (n.mode === 'act') {
          n.actAnim = 'cheer';
          n.actUntil = time + 5;
        }
      }
    }
    if (phase === 'resolve' || phase === 'idle') {
      c.active = false;
      for (const n of this.npcs) {
        if (n.mode === 'rush' || n.mode === 'gather' || n.mode === 'guardCandy') {
          const nearest = this.wd.nearestNode(n.fig.pos, n.def.district);
          n.node = nearest?.id ?? n.def.post;
          n.mode = 'act';
          n.actAnim = n.rng.chance(0.5) ? 'cheer' : 'talk';
          n.actUntil = time + n.rng.range(2, 5);
          n.fig.carry = null;
        }
      }
    }
  }

  /** During the rush, NPCs go for shards; guards hold position at the core. */
  updateCandy(time: number): void {
    const c = this.candy;
    if (!c.active) return;
    for (const n of this.npcs) {
      if (n.mode === 'gather' && time > n.actUntil) {
        const r = n.def.role;
        if (r === 'guard' || r === 'official') {
          n.mode = 'guardCandy';
          continue;
        }
        // pick the nearest free shard and try to take it
        let best = -1;
        let bd = Infinity;
        c.shards.forEach((s, i) => {
          if (s.taken) return;
          const d = s.pos.distanceToSquared(n.fig.pos);
          if (d < bd) {
            bd = d;
            best = i;
          }
        });
        if (best >= 0 && bd < 1.2 && n.shardsTaken < 1) {
          c.shards[best].taken = true;
          n.shardsTaken++;
          n.fig.carry = 0xe84a5f;
          this.onShardTaken?.(best, n);
          n.actUntil = time + 3;
          n.actAnim = 'cheer';
        } else if (best >= 0 && n.shardsTaken < 1 && n.rng.chance(0.6)) {
          n.mode = 'rush';
          n.rushTarget = c.shards[best].pos.clone();
        } else {
          n.mode = 'act';
          n.actAnim = n.rng.chance(0.5) ? 'cheer' : 'talk';
          n.actUntil = time + 6;
        }
      }
    }
  }

  /** Keep story-NPC hotspots attached to their characters. */
  syncHotspots(): void {
    for (const n of this.npcs) {
      if (!n.def.talkable) continue;
      let h = this.wd.hotspots.get(`npc-${n.def.id}`);
      if (!h) h = this.wd.hot(`npc-${n.def.id}`, 'npc', n.fig.pos, n.def.role === 'vendor' || n.def.role === 'clerk' ? 2.4 : 2.0, { npc: n.def.id });
      h.radius = n.def.role === 'vendor' || n.def.role === 'clerk' ? 2.4 : 2.0;
      h.pos.copy(n.fig.pos);
      h.data.npc = n.def.id;
      h.enabled = n.fig.visible;
    }
  }
}
