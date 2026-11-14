// Multiplayer client: shares your position/animation with everyone in the same room, shows theirs,
// routes PvP hits through the server, and syncs the loot bags spilled when someone is knocked down.
// Connects to /mp on the page's own host (the Vite plugin in tools/mp-server.mjs). No server -> silent single player.
import * as THREE from 'three';
import type { Game } from '../game';
import { Figure, Look, HairStyle } from '../characters/figure';
import { PLAYER_LOOK } from '../player/player';
import { ITEMS, Item } from '../systems/state';
import { cleanName } from '../systems/onboarding';

const SEND_HZ = 12;
const SHIRTS = [0xb8322a, 0x2f5fa8, 0xd9a441, 0x6a3f8a, 0x3f7a3a, 0xc4622d, 0x2a8a8a, 0x8a2f5a];
const HAIRS: HairStyle[] = ['short', 'bun', 'long', 'bald', 'curly', 'tail'];
const STATES = new Set(['idle', 'walk', 'run', 'jump', 'fall', 'jab', 'draw', 'hurt', 'down', 'collect', 'carry', 'sit']);

interface Remote {
  id: number;
  name: string;
  fig: Figure;
  target: THREE.Vector3;
  yaw: number;
  hp: number;
  seen: number;
  tag: HTMLDivElement;
  bar: HTMLDivElement;
}

const colour = (v: unknown, d: number) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffffff ? v : d);

/** Whatever another client sent as its look, rebuilt from safe parts only. */
function safeLook(raw: any, id: number): Look {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    ...PLAYER_LOOK,
    shirt: colour(r.shirt, SHIRTS[id % SHIRTS.length]),
    pants: colour(r.pants, PLAYER_LOOK.pants),
    hair: colour(r.hair, PLAYER_LOOK.hair),
    skin: colour(r.skin, PLAYER_LOOK.skin),
    hairStyle: HAIRS.includes(r.hairStyle) ? r.hairStyle : 'short',
  };
}

export class Net {
  id = 0;
  remotes = new Map<number, Remote>();
  private ws: WebSocket | null = null;
  private sendT = 0;
  private retryAt = 0;
  private immuneUntil = 0;
  private enabled: boolean;
  private room: string;
  private v = new THREE.Vector3();
  private layer: HTMLDivElement;

  constructor(private g: Game) {
    const q = new URLSearchParams(location.search);
    // tests and screenshot runs share one dev server: keep them apart unless a test asks for multiplayer
    this.enabled = q.get('mp') !== '0' && (!g.params.test || q.get('mp') === '1');
    this.room = (q.get('room') ?? 'main').replace(/[^\w-]/g, '').slice(0, 32) || 'main';
    this.layer = document.createElement('div');
    this.layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
    document.body.appendChild(this.layer);
  }

  /** connected and at least one other player is here */
  get active(): boolean {
    return this.remotes.size > 0;
  }

  private connect(): void {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${proto}://${location.host}/mp?room=${this.room}`);
    } catch {
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      // your shirt colour is how others tell you apart; pick one and wear it locally too
      const look = { ...this.g.player.fig.look, shirt: SHIRTS[Math.floor(Math.random() * SHIRTS.length)] };
      this.g.player.fig.look = look;
      this.post({ t: 'hello', name: this.g.onboarding.name, look: { shirt: look.shirt, pants: look.pants, hair: look.hair, skin: look.skin, hairStyle: look.hairStyle } });
    };
    ws.onmessage = (e) => {
      let m: any;
      try {
        m = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (m && typeof m === 'object') this.receive(m);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      for (const r of [...this.remotes.values()]) this.drop(r);
      this.retryAt = Math.max(this.retryAt, performance.now() + 5000);
    };
    ws.onerror = () => ws.close();
  }

  private post(m: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  private receive(m: any): void {
    const g = this.g;
    switch (m.t) {
      case 'full':
        g.bus.emit({ type: 'toast', text: `This shelf is full (${Number(m.size) || 16} players). Trying again in a minute.`, kind: 'info' });
        this.retryAt = performance.now() + 60_000;
        return;
      case 'welcome':
        this.id = m.id;
        if (Array.isArray(m.bags)) for (const b of m.bags) this.addBag(b);
        return;
      case 'join': {
        if (typeof m.id !== 'number' || this.remotes.has(m.id)) return;
        const name = cleanName(m.name);
        const fig = g.figs.add(safeLook(m.look, m.id));
        const tag = document.createElement('div');
        tag.style.cssText = 'position:absolute;transform:translate(-50%,-100%);font:600 13px sans-serif;color:#fff;text-shadow:0 1px 3px #000;text-align:center;white-space:nowrap';
        const label = document.createElement('div');
        label.textContent = name; // never innerHTML: names come from other players
        const barBox = document.createElement('div');
        barBox.style.cssText = 'width:54px;height:4px;margin:2px auto 0;background:#0008;border-radius:2px';
        const bar = document.createElement('div');
        bar.style.cssText = 'height:100%;width:100%;background:#e0503a;border-radius:2px';
        barBox.appendChild(bar);
        tag.append(label, barBox);
        this.layer.appendChild(tag);
        this.remotes.set(m.id, { id: m.id, name, fig, target: fig.pos.clone(), yaw: 0, hp: 100, seen: 0, tag, bar });
        fig.visible = false; // until the first position arrives
        g.bus.emit({ type: 'toast', text: `${name} is on the shelf with you.`, kind: 'info' });
        return;
      }
      case 'leave': {
        const r = this.remotes.get(m.id);
        if (r) {
          g.bus.emit({ type: 'toast', text: `${r.name} left.`, kind: 'info' });
          this.drop(r);
        }
        return;
      }
      case 's': {
        const r = this.remotes.get(m.id);
        if (!r || ![m.x, m.y, m.z, m.yaw, m.hp].every(Number.isFinite)) return;
        if (!r.fig.visible) r.fig.pos.set(m.x, m.y, m.z);
        r.fig.visible = true;
        r.target.set(m.x, m.y, m.z);
        r.yaw = m.yaw;
        r.hp = Math.max(0, Math.min(200, m.hp));
        r.fig.state = STATES.has(m.st) ? m.st : 'idle';
        r.fig.held = m.held === 'pick' || m.held === 'sling' ? m.held : null;
        r.seen = performance.now();
        return;
      }
      case 'hit':
        if (Number.isFinite(m.dmg) && Number.isFinite(m.px) && Number.isFinite(m.pz)) this.takeHit(m.dmg, m.px, m.pz, this.remotes.get(m.from)?.name ?? 'Someone');
        return;
      case 'bag':
        this.addBag(m);
        return;
      case 'gone': {
        const p = g.underfall.pickups.find((q) => q.netBag === m.bag);
        if (p) p.taken = true;
        return;
      }
      case 'got': {
        const p = g.underfall.pickups.find((q) => q.netBag === m.bag);
        if (p) p.taken = true;
        if (typeof m.item === 'string' && m.item in ITEMS && Number.isInteger(m.qty)) {
          g.state.add(m.item as Item, Math.min(20, m.qty));
          g.player.fig.state = 'collect';
        }
        return;
      }
    }
  }

  private addBag(b: any): void {
    const g = this.g;
    if (typeof b.item !== 'string' || !(b.item in ITEMS) || ![b.id, b.qty, b.x, b.y, b.z].every(Number.isFinite)) return;
    if (g.underfall.pickups.some((p) => p.netBag === b.id)) return;
    const gy = g.col.groundAt(b.x, b.z, b.y);
    const y = Number.isFinite(gy) ? gy : b.y - 1;
    const p = g.underfall.spawnPickup(b.item as Item, b.qty, new THREE.Vector3(b.x, y + 0.2, b.z));
    p.vel.set(0, 0, 0);
    p.netBag = b.id;
  }

  private drop(r: Remote): void {
    this.g.figs.remove(r.fig);
    r.tag.remove();
    this.remotes.delete(r.id);
  }

  /** Can this player be hurt by others right now? */
  private safe(): boolean {
    const g = this.g;
    return g.mode !== 'play' || g.onboarding.active || g.simTime < this.immuneUntil;
  }

  private takeHit(dmg: number, px: number, pz: number, from: string): void {
    const g = this.g;
    if (this.safe()) return;
    g.underfall.hurtPlayer(Math.min(24, dmg));
    g.player.body.vel.x += px * 5;
    g.player.body.vel.z += pz * 5;
    g.player.body.vel.y = Math.max(g.player.body.vel.y, 2.5);
    if (g.state.health > 0) return;
    // knocked down: spill up to three stacks (half of each) for anyone to grab, then a few seconds of grace
    const items: [string, number][] = [];
    for (const [k, n] of Object.entries(g.state.inv)) {
      const take = Math.ceil((n ?? 0) / 2);
      if (take > 0 && items.length < 3 && g.state.remove(k as Item, take)) items.push([k, take]);
    }
    if (items.length) this.post({ t: 'drop', items });
    this.immuneUntil = g.simTime + 6;
    g.bus.emit({ type: 'toast', text: `${from} knocked you down${items.length ? ' and your pack spilled' : ''}.`, kind: 'bad' });
  }

  /** E on a synced bag: ask the server; it grants each bag to exactly one player. */
  claim(bag: number): void {
    this.post({ t: 'take', bag });
  }

  /** Remote players as hit targets for the jab / sling code. */
  targets(): { c: THREE.Vector3; r: number; assist: boolean; hurt: (n: number, push: THREE.Vector3) => void }[] {
    const now = performance.now();
    const me = this.g.player.body.pos;
    const out = [];
    for (const r of this.remotes.values()) {
      if (!r.fig.visible || now - r.seen > 1000 || r.hp <= 0) continue;
      const c = r.fig.pos.clone().setY(r.fig.pos.y + 0.9);
      out.push({ c, r: 0.45, assist: true, hurt: (n: number) => this.post({ t: 'hit', to: r.id, dmg: n, kind: c.distanceTo(me) > 3 ? 'shot' : 'jab' }) });
    }
    return out;
  }

  update(dt: number): void {
    const g = this.g;
    const now = performance.now();
    if (this.enabled && !this.ws && now > this.retryAt && g.mode === 'play') this.connect();
    if (g.mode === 'play' && this.ws?.readyState === WebSocket.OPEN && (this.sendT -= dt) <= 0) {
      this.sendT = 1 / SEND_HZ;
      const b = g.player.body.pos, f = g.player.fig;
      this.post({ t: 's', x: +b.x.toFixed(3), y: +b.y.toFixed(3), z: +b.z.toFixed(3), yaw: +Math.atan2(Math.sin(f.yaw), Math.cos(f.yaw)).toFixed(3), st: f.state, held: f.held, hp: Math.round(g.state.health), safe: this.safe() });
    }
    const cam = g.renderer.camera;
    const w = innerWidth, h = innerHeight;
    for (const r of this.remotes.values()) {
      const f = r.fig;
      // smooth toward the latest snapshot; drive the gait from how far the figure actually moved
      const k = 1 - Math.exp(-dt * 12);
      const ox = f.pos.x, oz = f.pos.z;
      if (f.pos.distanceTo(r.target) > 6) f.pos.copy(r.target);
      else f.pos.lerp(r.target, k);
      let dy = r.yaw - f.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      f.yaw += dy * k;
      const moved = Math.hypot(f.pos.x - ox, f.pos.z - oz);
      f.speed += ((dt > 0 ? moved / dt : 0) - f.speed) * k;
      f.stride(moved, f.speed > 4.8);
      f.t += dt;
      if (now - r.seen > 4000) f.visible = false;
      // name tag above the head
      this.v.set(f.pos.x, f.pos.y + 2.05, f.pos.z).project(cam);
      const show = g.mode === 'play' && f.visible && this.v.z < 1 && f.pos.distanceTo(cam.position) < 45;
      r.tag.style.display = show ? 'block' : 'none';
      if (show) {
        r.tag.style.left = `${((this.v.x + 1) / 2) * w}px`;
        r.tag.style.top = `${((1 - this.v.y) / 2) * h}px`;
        r.bar.style.width = `${Math.min(100, r.hp)}%`;
      }
    }
  }
}
