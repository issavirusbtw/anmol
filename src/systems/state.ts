// Player + world state: inventory, survival, factions, economy. Pure data + rules; no rendering.
import { Bus } from '../core/bus';
import { hashSeed } from '../core/rng';

export type Item = 'food' | 'water' | 'candy' | 'scrap' | 'fabric' | 'metal' | 'electronics' | 'fruit' | 'parcel' | 'grit' | 'silk' | 'fang' | 'foil'
  | 'key' | 'coin' | 'lighter' | 'bandage' | 'button' | 'clip' | 'watch' | 'phone' | 'shell' | 'meat' | 'cable' | 'rope';

/** Things that came down with you. The shrink beam takes everything inside it, pockets included. */
export const POSSESSIONS: { item: Item; weight: number }[] = [
  { item: 'coin', weight: 30 },
  { item: 'button', weight: 25 },
  { item: 'clip', weight: 25 },
  { item: 'key', weight: 20 },
  { item: 'bandage', weight: 15 },
  { item: 'lighter', weight: 10 },
  { item: 'watch', weight: 7 },
  { item: 'phone', weight: 1.5 },
];
/** 0 items 15%, 1 item 40%, 2 items 30%, 3 items 15%. */
const POSSESSION_COUNT = [0.15, 0.4, 0.3, 0.15];

/** Pure: the same seed always gives the same pockets. No duplicates. */
export function rollPossessions(seed: number): Item[] {
  const r = hashSeed(seed, 'pockets');
  let u = r.next();
  let n = 0;
  while (n < POSSESSION_COUNT.length - 1 && u >= POSSESSION_COUNT[n]) u -= POSSESSION_COUNT[n++];
  const pool = POSSESSIONS.slice();
  const out: Item[] = [];
  for (let k = 0; k < n; k++) {
    let w = r.next() * pool.reduce((s, p) => s + p.weight, 0);
    let i = 0;
    while (i < pool.length - 1 && w >= pool[i].weight) w -= pool[i++].weight;
    out.push(pool[i].item);
    pool.splice(i, 1);
  }
  return out;
}
export type Faction = 'authority' | 'runners' | 'table' | 'union';

export const ITEMS: Record<Item, { name: string; weight: number; base: number; desc: string }> = {
  food: { name: 'Crumb ration', weight: 0.5, base: 4, desc: 'A fist-sized crumb. Restores hunger.' },
  water: { name: 'Cap of water', weight: 0.5, base: 3, desc: 'Clean drip in a bottle cap. Restores thirst.' },
  candy: { name: 'Candy shard', weight: 1, base: 10, desc: 'A sugar shard from the sky. Very filling, very valuable.' },
  scrap: { name: 'Scrap', weight: 1, base: 3, desc: 'Card, foil, bent wire. Repairs structures.' },
  fabric: { name: 'Fabric', weight: 0.5, base: 5, desc: 'Thread and cloth scraps. Shelter and bags.' },
  metal: { name: 'Metal', weight: 1.5, base: 7, desc: 'Staples, pins, a spring. Tools and machinery.' },
  electronics: { name: 'Electronics', weight: 1, base: 10, desc: 'A tiny LED, copper wire, a contact. Machines.' },
  fruit: { name: 'Preserved fruit', weight: 0.5, base: 22, desc: 'Heights luxury. Restores hunger and health.' },
  parcel: { name: 'Courier parcel', weight: 1, base: 0, desc: 'A Threadrunner delivery. Not yours to open.' },
  grit: { name: 'Grit', weight: 0.1, base: 1, desc: 'Snapband ammunition. Sand-grain shot.' },
  silk: { name: 'Spider silk', weight: 0.2, base: 5, desc: 'Strong as wire at this size. Ropes, latches, restringing.' },
  fang: { name: 'Hopper fang', weight: 0.3, base: 7, desc: 'Proof you went into the Sump and came back.' },
  foil: { name: 'Wrapper foil', weight: 0.5, base: 4, desc: 'Crinkled foil from a Fall. The Union pays well for it.' },
  key: { name: 'House key', weight: 0.3, base: 6, desc: 'Your front door, wherever that is now. Rook pays for brass.' },
  coin: { name: 'Coin', weight: 0.3, base: 9, desc: 'Shrunk with you. Pure metal down here; Rook will weigh it.' },
  lighter: { name: 'Lighter', weight: 0.4, base: 14, desc: 'Still sparks. Fire buys a street or burns one. Rook buys it.' },
  bandage: { name: 'Plaster', weight: 0.1, base: 5, desc: 'A sticking plaster from your pocket. Use it: health +25.' },
  button: { name: 'Button', weight: 0.2, base: 3, desc: 'Four holes, good plastic. Strip it at a bench for 2 scrap.' },
  clip: { name: 'Paper clip', weight: 0.2, base: 4, desc: 'Bend it straight at a bench for 1 metal.' },
  watch: { name: 'Wristwatch', weight: 0.5, base: 18, desc: 'It still ticks. The Duke likes things that still tick.' },
  phone: { name: 'Phone', weight: 0.8, base: 30, desc: 'No signal. Never will be. Strip it at a bench for 3 electronics.' },
  shell: { name: 'Shell plate', weight: 1.5, base: 16, desc: 'A curved piece of stag-beetle wing case. Turns a blade; Rook would love to bend it into a guard.' },
  meat: { name: 'Beetle meat', weight: 1, base: 9, desc: 'Pale, rich and heavy. Feeds a household for days.' },
  cable: { name: 'Cargo cable', weight: 1, base: 18, desc: 'Silk twisted into cable. Strings the dead cargo line behind the cabinet.' },
  rope: { name: 'Climbing line', weight: 0.8, base: 14, desc: 'A knotted silk line. Rig it at the pin on the book ledge, outside.' },
};

export const FACTIONS: Record<Faction, string> = {
  authority: 'Shelf Authority',
  runners: 'Threadrunners',
  table: 'Common Table',
  union: 'Salvage Union',
};

export interface VendorDef {
  name: string;
  sells: Partial<Record<Item, number>>; // stock
  buys: Item[];
  faction: Faction;
  markup: number;
}

export const VENDORS: Record<string, VendorDef> = {
  pell: { name: "Pell's Pantry", sells: { food: 8, water: 6 }, buys: ['candy', 'food', 'meat'], faction: 'table', markup: 1 },
  rook: { name: 'Rook (Salvage Union)', sells: { metal: 2, grit: 30 }, buys: ['scrap', 'metal', 'electronics', 'fabric', 'foil', 'silk', 'fang', 'key', 'coin', 'lighter', 'watch', 'phone', 'button', 'clip', 'shell'], faction: 'union', markup: 1.3 },
  duke: { name: 'Duke Tallow (claims table)', sells: { grit: 40, food: 4 }, buys: ['foil', 'silk', 'fang', 'metal', 'electronics', 'food'], faction: 'union', markup: 1.5 },
  odo: { name: "Odo's Crumbs", sells: { food: 12 }, buys: ['candy', 'food'], faction: 'table', markup: 1.1 },
  wren: { name: "Wren's Wells", sells: { water: 14 }, buys: ['water'], faction: 'runners', markup: 1 },
  sela: { name: 'Sela · Threads', sells: { fabric: 8 }, buys: ['fabric', 'scrap'], faction: 'runners', markup: 1.2 },
  tobb: { name: "Tobb's Salvage", sells: { metal: 4, electronics: 3, scrap: 6 }, buys: ['scrap', 'metal', 'electronics'], faction: 'union', markup: 1.25 },
  marrow: { name: 'Glasshouse Reserve', sells: { fruit: 6, water: 10 }, buys: ['candy'], faction: 'authority', markup: 1.6 },
};

/** Workbench recipes for the Underfall kit. */
export interface Recipe {
  name: string;
  cost: Partial<Record<Item, number>>;
  weapon?: 'pick' | 'sling';
  gives?: [Item, number];
  /** a one-off upgrade recorded as a story flag (saved) */
  flag?: string;
  /** needs this weapon already */
  needs?: 'sling';
  /** what it does, shown at the bench */
  does?: string;
}

/** Where to find each material, for the bench's "uses" panel. */
export const WHERE: Partial<Record<Item, string>> = {
  silk: 'the web behind the biscuit tin (out through the crack in the Backs); Sump hoppers drop a strand',
  fabric: 'the Spill heaps; Sela sells it in Threadmarket',
  scrap: 'any heap',
  metal: 'deep heaps, Lacquer Court, Rook',
  fang: 'Sump hoppers and the tin spider',
};

export const RECIPES: Record<string, Recipe> = {
  pick: { name: 'Pick (toothpick spear)', cost: { scrap: 2, fabric: 1 }, weapon: 'pick' },
  sling: { name: 'Snapband (hairpin sling)', cost: { metal: 1, fabric: 2 }, weapon: 'sling' },
  grit: { name: 'Grit ×3', cost: { scrap: 1 }, gives: ['grit', 3] },
  button: { name: 'Strip a button (2 scrap)', cost: { button: 1 }, gives: ['scrap', 2] },
  clip: { name: 'Straighten a paper clip (1 metal)', cost: { clip: 1 }, gives: ['metal', 1] },
  phone: { name: 'Strip the phone (3 electronics)', cost: { phone: 1 }, gives: ['electronics', 3] },
  // three uses competing for the same silk
  cable: { name: 'Cargo cable', cost: { silk: 4 }, gives: ['cable', 1], does: 'restrings the cargo line behind the cabinet: a public lift up to Lacquer Court' },
  rope: { name: 'Climbing line', cost: { silk: 3, fabric: 1 }, gives: ['rope', 1], does: 'rig it at the pin on the book ledge: a fast way down to the carpet and back' },
  bands: { name: 'Silk bands for the Snapband', cost: { silk: 2 }, flag: 'silkBands', needs: 'sling', does: 'shots hit half again as hard and draw faster' },
};

/** Home upgrade tiers for the matchbox: cost and what each set piece does. */
export const HOME_TIERS: { name: string; cost: Partial<Record<Item, number>>; does: string }[] = [
  { name: 'Stash Tin', cost: { scrap: 4, metal: 2 }, does: 'storage that survives a collapse' },
  { name: 'Tealight Stove', cost: { metal: 3, foil: 2, electronics: 1 }, does: 'cook a Hot Bowl: hunger +60, double regen for 2 min' },
  { name: 'Drip Barrel', cost: { scrap: 2, fabric: 2, silk: 3 }, does: '2 caps of water every 2 minutes, free' },
  { name: 'Fang Wall', cost: { fang: 5, foil: 2 }, does: 'mount fangs: +2 max health each (to 120)' },
];

export interface SaveData {
  version: number;
  time: number;
  player: { x: number; y: number; z: number; yaw: number };
  stats: { health: number; hunger: number; thirst: number; stamina: number };
  inv: Partial<Record<Item, number>>;
  tokens: number;
  debt?: number;
  weapons?: { pick: boolean; sling: boolean };
  homeTier?: number;
  stash?: Partial<Record<Item, number>>;
  maxHealth?: number;
  cart?: Partial<Record<Item, number>>;
  /** Chapter Zero onboarding (absent in older saves = finished) */
  onboard?: { step: string; name: string; seed: number; done: string[]; t: number };  rep: Record<Faction, number>;
  satchel: boolean;
  quest: { stage: number; choice: string | null; flags: string[]; signatures: number; deliveries: number };
  world: {
    liftRepaired: boolean;
    homeRepaired: boolean;
    supply: number;
    heapReady: Record<string, number>;
    stock: Record<string, Partial<Record<Item, number>>>;
    candyEvents: number;
    nextCandy: number;
    lifts: Record<string, number>;
    lastMeal: number;
  };
}

export class GameState {
  health = 100;
  hunger = 80;
  thirst = 70;
  inv: Partial<Record<Item, number>> = {};
  tokens = 10;
  /** the Shelf Authority's arrival levy, owed by every newcomer */
  debt = 40;
  weapons = { pick: false, sling: false };
  /** 0 = repaired matchbox; 1 stash tin, 2 stove, 3 drip barrel, 4 fang wall */
  homeTier = 0;
  stash: Partial<Record<Item, number>> = {};
  maxHealth = 100;
  /** sim time until which natural regen is paused (after taking a hit) */
  regenPausedUntil = 0;
  /** sim time until which a Hot Bowl doubles regen */
  hotBowlUntil = 0;
  now = 0;
  rep: Record<Faction, number> = { authority: 0, runners: 0, table: 0, union: 0 };
  satchel = false;
  supply = 55;
  stock: Record<string, Partial<Record<Item, number>>> = {};
  heapReady: Record<string, number> = {};
  liftRepaired = false;
  homeRepaired = false;
  lastMeal = -9999;
  deaths = 0;
  sales = 0;
  purchases = 0;

  constructor(private bus: Bus) {
    for (const [k, v] of Object.entries(VENDORS)) this.stock[k] = { ...v.sells };
  }

  // ---------- inventory ----------
  count(i: Item): number {
    return this.inv[i] ?? 0;
  }
  weight(): number {
    let w = 0;
    for (const [k, n] of Object.entries(this.inv)) w += ITEMS[k as Item].weight * (n ?? 0);
    return w;
  }
  capacity(): number {
    return this.satchel ? 22 : 12;
  }
  canCarry(i: Item, n = 1): boolean {
    return this.weight() + ITEMS[i].weight * n <= this.capacity() + 1e-6;
  }
  add(i: Item, n = 1, quiet = false): number {
    let added = 0;
    for (let k = 0; k < n; k++) {
      if (!this.canCarry(i)) break;
      this.inv[i] = this.count(i) + 1;
      added++;
    }
    if (added > 0) this.bus.emit({ type: 'collect', item: i, qty: added });
    if (added < n && !quiet) this.bus.emit({ type: 'toast', text: 'Your pack is full.', kind: 'bad' });
    return added;
  }
  remove(i: Item, n = 1): boolean {
    if (this.count(i) < n) return false;
    this.inv[i] = this.count(i) - n;
    if (this.inv[i] === 0) delete this.inv[i];
    return true;
  }

  // ---------- survival ----------
  tickSurvival(dt: number): 'ok' | 'collapsed' {
    this.now += dt;
    this.hunger = Math.max(0, this.hunger - dt * 0.085);
    this.thirst = Math.max(0, this.thirst - dt * 0.12);
    if (this.hunger <= 0 || this.thirst <= 0) this.health -= dt * 0.6;
    else if (this.hunger > 35 && this.thirst > 35 && this.now > this.regenPausedUntil)
      this.health = Math.min(this.maxHealth, this.health + dt * 0.25 * (this.now < this.hotBowlUntil ? 2 : 1));
    if (this.health <= 0) {
      this.deaths++;
      this.health = 60;
      this.hunger = Math.max(this.hunger, 45);
      this.thirst = Math.max(this.thirst, 45);
      this.tokens = Math.floor(this.tokens * 0.75);
      return 'collapsed';
    }
    return 'ok';
  }

  /** Take damage; returns true if it dropped health to zero. */
  hurt(n: number): boolean {
    this.health = Math.max(0, this.health - n);
    this.regenPausedUntil = this.now + 8;
    return this.health <= 0;
  }

  consume(i: Item): boolean {
    if (i === 'bandage') {
      if (this.health >= this.maxHealth || !this.remove(i)) return false;
      this.health = Math.min(this.maxHealth, this.health + 25);
      this.bus.emit({ type: 'sfx', name: 'repair' });
      return true;
    }
    if (!this.remove(i)) return false;
    if (i === 'food') this.hunger = Math.min(100, this.hunger + 32);
    if (i === 'water') this.thirst = Math.min(100, this.thirst + 38);
    if (i === 'candy') {
      this.hunger = Math.min(100, this.hunger + 45);
      this.health = Math.min(this.maxHealth, this.health + 5);
    }
    if (i === 'fruit') {
      this.hunger = Math.min(100, this.hunger + 40);
      this.health = Math.min(this.maxHealth, this.health + 20);
    }
    this.bus.emit({ type: i === 'water' ? 'drink' : 'eat' });
    this.bus.emit({ type: 'sfx', name: i === 'water' ? 'drink' : 'eat' });
    return true;
  }

  // ---------- factions ----------
  addRep(f: Faction, n: number): void {
    this.rep[f] = Math.max(-100, Math.min(100, this.rep[f] + n));
    if (n !== 0) this.bus.emit({ type: 'toast', text: `${FACTIONS[f]} ${n > 0 ? '+' : ''}${n}`, kind: n > 0 ? 'good' : 'bad' });
  }

  // ---------- economy ----------
  /** Food is supply-sensitive: scarce food is expensive, a candy drop makes it cheap. */
  supplyFactor(): number {
    return Math.max(0.5, Math.min(2.4, 60 / Math.max(10, this.supply)));
  }
  priceBuy(vendor: string, i: Item): number {
    const v = VENDORS[vendor];
    let p = ITEMS[i].base * v.markup;
    if (i === 'food' || i === 'candy' || i === 'fruit') p *= this.supplyFactor();
    const rep = this.rep[v.faction];
    p *= 1 - Math.max(-0.2, Math.min(0.2, rep / 250));
    return Math.max(1, Math.round(p));
  }
  priceSell(vendor: string, i: Item): number {
    const v = VENDORS[vendor];
    let p = ITEMS[i].base * 0.55;
    if (i === 'food' || i === 'candy') p *= this.supplyFactor();
    if (vendor === 'marrow' && i === 'candy') p *= 1.6;
    p *= 1 + Math.max(-0.2, Math.min(0.2, this.rep[v.faction] / 250));
    return Math.max(1, Math.round(p));
  }
  buy(vendor: string, i: Item): { ok: boolean; reason?: string } {
    const st = this.stock[vendor];
    if (!st || (st[i] ?? 0) <= 0) return { ok: false, reason: 'Out of stock.' };
    const p = this.priceBuy(vendor, i);
    if (this.tokens < p) return { ok: false, reason: `Not enough tokens (need ${p}).` };
    if (!this.canCarry(i)) return { ok: false, reason: 'Your pack is full.' };
    this.tokens -= p;
    st[i] = (st[i] ?? 0) - 1;
    this.inv[i] = this.count(i) + 1;
    this.purchases++;
    if (i === 'food') this.supply = Math.max(10, this.supply - 0.5);
    this.bus.emit({ type: 'trade', vendor, item: i, qty: 1, buy: true });
    this.bus.emit({ type: 'sfx', name: 'coin' });
    return { ok: true };
  }
  sell(vendor: string, i: Item): { ok: boolean; reason?: string } {
    const v = VENDORS[vendor];
    if (!v.buys.includes(i)) return { ok: false, reason: `${v.name} doesn't buy that.` };
    if (!this.remove(i)) return { ok: false, reason: 'You have none to sell.' };
    const p = this.priceSell(vendor, i);
    this.tokens += p;
    const st = this.stock[vendor];
    if (v.sells[i] !== undefined) st[i] = (st[i] ?? 0) + 1;
    this.sales++;
    if (i === 'food' || i === 'candy') this.supply += i === 'candy' ? 2 : 0.5;
    this.bus.emit({ type: 'trade', vendor, item: i, qty: 1, buy: false });
    this.bus.emit({ type: 'sfx', name: 'coin' });
    return { ok: true };
  }
  /** Slow drift of supply back toward scarcity; vendors restock a little. */
  private restockTimer = 0;
  tickEconomy(dt: number): void {
    this.supply += (55 - this.supply) * dt * 0.004;
    this.restockTimer += dt;
    if (this.restockTimer < 30) return;
    this.restockTimer = 0;
    for (const [k, v] of Object.entries(VENDORS)) {
      const st = this.stock[k];
      for (const [item, max] of Object.entries(v.sells)) {
        const cur = st[item as Item] ?? 0;
        if (cur < (max ?? 0)) st[item as Item] = cur + 1;
      }
    }
  }
}
