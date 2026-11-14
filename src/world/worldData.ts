// Gameplay-facing world registry: hotspots, navigation graph, lifts, toggleable groups.
import * as THREE from 'three';
import type { Solid } from '../physics/collision';
import type { Lamp } from './builder';

export type HotKind =
  | 'npc'
  | 'vendor'
  | 'scavenge'
  | 'water'
  | 'kitchen'
  | 'bed'
  | 'lift'
  | 'craft'
  | 'office'
  | 'checkpoint'
  | 'candy'
  | 'repair'
  | 'reserve'
  | 'cart'
  | 'drop'
  | 'expedition';

export interface Hotspot {
  id: string;
  kind: HotKind;
  pos: THREE.Vector3;
  radius: number;
  data: Record<string, any>;
  enabled: boolean;
}

export interface NavNode {
  id: string;
  pos: THREE.Vector3;
  links: Set<string>;
  district: string;
  tags: string[];
}

export interface Lift {
  id: string;
  x: number;
  z: number;
  y0: number;
  y1: number;
  /** 0 = bottom, 1 = top */
  t: number;
  target: number;
  working: boolean;
  permit: boolean;
  solid: Solid;
  group: THREE.Group;
  gates: Solid[];
  landing?: Solid[];
  speed: number;
  motor?: THREE.Object3D;
}

export class WorldData {
  hotspots = new Map<string, Hotspot>();
  nav = new Map<string, NavNode>();
  lifts = new Map<string, Lift>();
  groups = new Map<string, THREE.Object3D>();
  barriers = new Map<string, Solid[]>();
  spawns: { pos: THREE.Vector3; yaw: number; district: string }[] = [];
  lamps: Lamp[] = [];
  /** points where water drips (animated) */
  drips: THREE.Vector3[] = [];
  /** points that emit steam */
  steam: THREE.Vector3[] = [];
  candyLanding = new THREE.Vector3();
  /** ambient insects placed by the district builders (see world/wildlife.ts) */
  ants: { trail: THREE.Vector3[]; count: number }[] = [];
  moths: { light: THREE.Vector3; range: number; rests: { pos: THREE.Vector3; normal: THREE.Vector3 }[] }[] = [];
  sump?: { sites: THREE.Vector3[]; spiderHomes: THREE.Vector3[]; cart: THREE.Vector3; gate: THREE.Vector3; basin: THREE.Vector3 };
  districtSpawn = new Map<string, { pos: THREE.Vector3; yaw: number }>();

  hot(id: string, kind: HotKind, pos: THREE.Vector3 | [number, number, number], radius: number, data: Record<string, any> = {}): Hotspot {
    const h: Hotspot = { id, kind, pos: Array.isArray(pos) ? new THREE.Vector3(...pos) : pos.clone(), radius, data, enabled: true };
    this.hotspots.set(id, h);
    return h;
  }

  node(id: string, pos: [number, number, number], district: string, tags: string[] = []): NavNode {
    const n: NavNode = { id, pos: new THREE.Vector3(...pos), links: new Set(), district, tags };
    this.nav.set(id, n);
    return n;
  }

  link(...ids: string[]): void {
    for (let i = 0; i < ids.length - 1; i++) {
      const a = this.nav.get(ids[i]), b = this.nav.get(ids[i + 1]);
      if (!a || !b) throw new Error(`nav link missing ${ids[i]} / ${ids[i + 1]}`);
      a.links.add(b.id);
      b.links.add(a.id);
    }
  }

  nodesWith(tag: string, district?: string): NavNode[] {
    const out: NavNode[] = [];
    for (const n of this.nav.values()) if (n.tags.includes(tag) && (!district || n.district === district)) out.push(n);
    return out;
  }

  nearestNode(p: THREE.Vector3, district?: string): NavNode | null {
    let best: NavNode | null = null;
    let bd = Infinity;
    for (const n of this.nav.values()) {
      if (district && n.district !== district) continue;
      const d = n.pos.distanceToSquared(p) + Math.abs(n.pos.y - p.y) * 50;
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  /** A* over the nav graph. */
  path(from: string, to: string): NavNode[] {
    const start = this.nav.get(from), goal = this.nav.get(to);
    if (!start || !goal) return [];
    const open = new Set<string>([from]);
    const came = new Map<string, string>();
    const g = new Map<string, number>([[from, 0]]);
    const f = new Map<string, number>([[from, start.pos.distanceTo(goal.pos)]]);
    while (open.size) {
      let cur = '';
      let bf = Infinity;
      for (const id of open) {
        const v = f.get(id) ?? Infinity;
        if (v < bf) {
          bf = v;
          cur = id;
        }
      }
      if (cur === to) {
        const out: NavNode[] = [goal];
        let c = to;
        while (came.has(c)) {
          c = came.get(c)!;
          out.unshift(this.nav.get(c)!);
        }
        return out;
      }
      open.delete(cur);
      const cn = this.nav.get(cur)!;
      for (const nid of cn.links) {
        const nn = this.nav.get(nid)!;
        const tg = g.get(cur)! + cn.pos.distanceTo(nn.pos);
        if (tg < (g.get(nid) ?? Infinity)) {
          came.set(nid, cur);
          g.set(nid, tg);
          f.set(nid, tg + nn.pos.distanceTo(goal.pos));
          open.add(nid);
        }
      }
    }
    return [];
  }
}
