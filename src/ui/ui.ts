// HUD and panels. Small, paper-and-tape styled, and every visible button does something real.
import { GAME_TITLE, GAME_SUBTITLE, TIER_Y, CABINET } from '../config';
import { GameState, ITEMS, Item, VENDORS, FACTIONS, Faction, RECIPES, HOME_TIERS, WHERE } from '../systems/state';
import type { DialogueNode } from '../systems/story';

export interface UIHost {
  state: GameState;
  objective(): string;
  playerPos(): { x: number; y: number; z: number };
  markerPos(): { x: number; y: number; z: number } | null;
  stamina(): number;
  save(): boolean;
  load(): boolean;
  hasSave(): boolean;
  restart(): void;
  unstuck(): void;
  setQuality(low: boolean): void;
  quality(): boolean;
  camDist(v?: number): number;
  sens(v?: number): number;
  invert(v?: boolean): boolean;
  soundOn(v?: boolean): boolean;
  volume(v?: number): number;
  setUICapture(on: boolean): void;
  setPaused(on: boolean): void;
  craft(recipe: string): { ok: boolean; reason?: string };
  homeAction(a: 'build' | 'deposit' | 'take' | 'cook' | 'barrel' | 'fang', item?: Item): { ok: boolean; msg: string };
  beginGame(fromSave: boolean): void;
  district(): string;
  hasFlag(f: string): boolean;
  stats(): string;
  sfx(name: string): void;
}

type Panel = 'none' | 'dialogue' | 'trade' | 'inventory' | 'map' | 'pause' | 'craft' | 'title' | 'card' | 'home' | 'name';

const el = (tag: string, cls = '', html = ''): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

export class UI {
  panel: Panel = 'none';
  private hud: HTMLElement;
  private bars: Record<string, HTMLElement> = {};
  private tokens: HTMLElement;
  private weight: HTMLElement;
  private obj: HTMLElement;
  private prompt: HTMLElement;
  private toasts: HTMLElement;
  private sayEl: HTMLElement;
  private sayTimer = 0;
  private modal: HTMLElement;
  private soundBtn: HTMLButtonElement;
  private fpsEl: HTMLElement;
  private dlg: DialogueNode | null = null;
  private tradeVendor = '';
  private lastObjective = '\u0000';
  showStats = false;

  constructor(
    private root: HTMLElement,
    private host: UIHost,
  ) {
    this.hud = el('div', 'hud');
    const stats = el('div', 'stats card');
    for (const [k, label] of [
      ['health', 'Health'],
      ['hunger', 'Hunger'],
      ['thirst', 'Thirst'],
      ['stamina', 'Stamina'],
    ]) {
      const row = el('div', `bar bar-${k}`);
      row.innerHTML = `<span class="lbl">${label}</span><span class="track"><span class="fill"></span></span>`;
      stats.appendChild(row);
      this.bars[k] = row.querySelector('.fill') as HTMLElement;
    }
    const purse = el('div', 'purse');
    this.tokens = el('span', 'tokens');
    this.weight = el('span', 'weight');
    purse.append(this.tokens, this.weight);
    stats.appendChild(purse);
    this.hud.appendChild(stats);
    this.obj = el('div', 'objective card');
    this.hud.appendChild(this.obj);
    this.prompt = el('div', 'prompt');
    this.prompt.style.display = 'none';
    this.hud.appendChild(this.prompt);
    this.toasts = el('div', 'toasts');
    this.hud.appendChild(this.toasts);
    this.sayEl = el('div', 'say out');
    this.hud.appendChild(this.sayEl);
    const corner = el('div', 'corner');
    this.soundBtn = el('button', 'btn small interactive', '♪ Enable sound') as HTMLButtonElement;
    this.soundBtn.dataset.testid = 'sound';
    this.soundBtn.onclick = () => {
      const on = this.host.soundOn(!this.host.soundOn());
      this.soundBtn.textContent = on ? '♪ Sound on' : '♪ Enable sound';
      this.host.sfx('ui');
    };
    const menuBtn = el('button', 'btn small interactive', '☰ Menu') as HTMLButtonElement;
    menuBtn.onclick = () => this.toggle('pause');
    corner.append(this.soundBtn, menuBtn);
    this.hud.appendChild(corner);
    this.fpsEl = el('div', 'fps');
    this.hud.appendChild(this.fpsEl);
    const help = el('div', 'keys', 'WASD move · drag/arrows camera · Shift sprint · Space jump · E interact · F action · click jab · hold Q sling · I pack · M map · Esc menu');
    this.hud.appendChild(help);
    this.modal = el('div', 'modal');
    root.append(this.hud, this.modal);
  }

  setHudVisible(on: boolean): void {
    this.hud.style.visibility = on ? 'visible' : 'hidden';
  }

  // ---------- HUD ----------
  update(): void {
    const s = this.host.state;
    const set = (k: string, v: number) => {
      const b = this.bars[k];
      b.style.width = `${Math.max(0, Math.min(100, v))}%`;
      b.parentElement!.parentElement!.classList.toggle('low', v < 22);
    };
    set('health', s.health);
    set('hunger', s.hunger);
    set('thirst', s.thirst);
    set('stamina', this.host.stamina());
    this.tokens.innerHTML = `◉ ${s.tokens} tokens${s.debt > 0 ? ` <span class="debt">· owes ${s.debt}</span>` : ''}`;
    const kit = [s.weapons.pick ? 'Pick' : '', s.weapons.sling ? `Snapband ·${s.count('grit')}` : ''].filter(Boolean).join(' · ');
    this.weight.textContent = `pack ${s.weight().toFixed(1)}/${s.capacity()}${kit ? ` · ${kit}` : ''}`;
    const o = this.host.objective();
    if (o !== this.lastObjective) {
      this.lastObjective = o;
      this.obj.innerHTML = o ? `<div class="obj-h">Objective</div><div class="obj-t">${o}</div>` : '';
      this.obj.style.display = o ? '' : 'none';
      this.obj.classList.remove('pulse');
      void this.obj.offsetWidth;
      this.obj.classList.add('pulse');
    }
    this.fpsEl.textContent = this.showStats ? this.host.stats() : '';
    if (this.panel === 'map') this.drawMap();
  }

  setPrompt(text: string | null): void {
    this.prompt.style.display = text && this.panel === 'none' ? '' : 'none';
    if (text) this.prompt.innerHTML = text;
  }

  toast(text: string, kind: 'good' | 'bad' | 'info' = 'info'): void {
    const t = el('div', `toast ${kind}`, text);
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 5) this.toasts.firstChild!.remove();
    setTimeout(() => t.classList.add('out'), 4200);
    setTimeout(() => t.remove(), 5000);
  }

  /** A spoken line (subtitle). Built from text nodes: names typed by the player are never parsed as HTML. */
  say(who: string, text: string): void {
    const b = document.createElement('b');
    b.textContent = who;
    this.sayEl.replaceChildren(b, document.createTextNode(text));
    this.sayEl.classList.remove('out');
    clearTimeout(this.sayTimer);
    this.sayTimer = window.setTimeout(() => this.sayEl.classList.add('out'), 2600 + text.length * 45);
  }

  /** Chapter Zero: "What should we call you?" Empty answers get a default. */
  openNamePrompt(done: (name: string) => void): void {
    const box = this.open('name', 'm-name');
    box.innerHTML = `<div class="title small">What should we call you?</div>`;
    const input = document.createElement('input');
    input.maxLength = 16;
    input.placeholder = 'Newcomer';
    input.dataset.testid = 'name-input';
    input.autocomplete = 'off';
    const ok = el('button', 'btn big', 'That’s me') as HTMLButtonElement;
    ok.dataset.testid = 'name-ok';
    const submit = () => {
      this.host.sfx('ui');
      this.close();
      done(input.value);
    };
    ok.onclick = submit;
    input.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') submit();
    };
    box.append(input, el('br'), ok);
    setTimeout(() => input.focus(), 50);
  }

  // ---------- panels ----------
  isOpen(): boolean {
    return this.panel !== 'none';
  }

  close(): void {
    this.panel = 'none';
    this.modal.innerHTML = '';
    this.modal.className = 'modal';
    this.host.setUICapture(false);
    this.host.setPaused(false);
  }

  toggle(p: Panel): void {
    if (this.panel === 'title' || this.panel === 'card' || this.panel === 'name') return;
    if (this.panel === p) return this.close();
    if (p === 'inventory') this.openInventory();
    else if (p === 'map') this.openMap();
    else if (p === 'pause') this.openPause();
  }

  private open(p: Panel, cls: string): HTMLElement {
    this.panel = p;
    this.modal.innerHTML = '';
    this.modal.className = `modal open ${cls}`;
    this.host.setUICapture(true);
    const box = el('div', 'sheet interactive');
    this.modal.appendChild(box);
    return box;
  }

  // dialogue
  openDialogue(node: DialogueNode): void {
    this.dlg = node;
    const box = this.open('dialogue', 'm-dialogue');
    box.innerHTML = `<div class="speaker">${node.speaker}</div><div class="line">${node.text}</div>`;
    const opts = el('div', 'options');
    node.options.forEach((o, i) => {
      const b = el('button', 'btn opt', `<span class="num">${i + 1}</span> ${o.label}`) as HTMLButtonElement;
      b.disabled = !!o.disabled;
      b.dataset.testid = `opt-${i}`;
      b.onclick = () => this.choose(i);
      opts.appendChild(b);
    });
    box.appendChild(opts);
  }

  /** Select a dialogue option (mouse, number key, or autopilot). */
  choose(i: number): void {
    if (this.panel !== 'dialogue' || !this.dlg) return;
    const o = this.dlg.options[i];
    if (!o || o.disabled) return;
    this.host.sfx('ui');
    const next = o.run ? o.run() : null;
    if (next) this.openDialogue(next);
    else if (this.panel === 'dialogue') this.close();
  }

  // trade
  openTrade(vendor: string): void {
    this.tradeVendor = vendor;
    const v = VENDORS[vendor];
    const s = this.host.state;
    const box = this.open('trade', 'm-trade');
    box.innerHTML = `<div class="speaker">${v.name}</div><div class="sub">You have <b>${s.tokens}</b> tokens · pack ${s.weight().toFixed(1)}/${s.capacity()} · food supply ${s.supplyFactor() > 1.4 ? 'scarce' : s.supplyFactor() > 0.9 ? 'steady' : 'plentiful'}</div>`;
    const cols = el('div', 'cols');
    const buy = el('div', 'col', '<h3>Buy</h3>');
    for (const [item, _] of Object.entries(v.sells)) {
      const it = item as Item;
      const stock = s.stock[vendor][it] ?? 0;
      const price = s.priceBuy(vendor, it);
      const row = el('div', 'row', `<span>${ITEMS[it].name} <i>×${stock}</i></span><span class="price">${price}</span>`);
      const b = el('button', 'btn small', 'Buy') as HTMLButtonElement;
      b.dataset.testid = `buy-${it}`;
      b.disabled = stock <= 0;
      b.onclick = () => {
        const r = s.buy(vendor, it);
        if (!r.ok) {
          this.toast(r.reason!, 'bad');
          this.host.sfx('error');
        }
        this.openTrade(vendor);
      };
      row.appendChild(b);
      buy.appendChild(row);
    }
    const sell = el('div', 'col', '<h3>Sell</h3>');
    for (const it of v.buys) {
      const have = s.count(it);
      const row = el('div', 'row', `<span>${ITEMS[it].name} <i>you have ${have}</i></span><span class="price">${s.priceSell(vendor, it)}</span>`);
      const b = el('button', 'btn small', 'Sell') as HTMLButtonElement;
      b.dataset.testid = `sell-${it}`;
      b.disabled = have <= 0;
      b.onclick = () => {
        const r = s.sell(vendor, it);
        if (!r.ok) {
          this.toast(r.reason!, 'bad');
          this.host.sfx('error');
        }
        this.openTrade(vendor);
      };
      row.appendChild(b);
      sell.appendChild(row);
    }
    cols.append(buy, sell);
    box.appendChild(cols);
    const close = el('button', 'btn', 'Done') as HTMLButtonElement;
    close.onclick = () => this.close();
    box.appendChild(close);
  }

  // inventory
  openInventory(): void {
    const s = this.host.state;
    const box = this.open('inventory', 'm-inv');
    box.innerHTML = `<div class="speaker">Your pack</div><div class="sub">${s.weight().toFixed(1)} / ${s.capacity()} weight · ${s.tokens} tokens${s.satchel ? ' · satchel' : ''}</div>`;
    const list = el('div', 'list');
    const entries = Object.entries(s.inv).filter(([, n]) => (n ?? 0) > 0);
    if (!entries.length) list.appendChild(el('div', 'empty', 'Empty. The Spill is a good place to start.'));
    for (const [k, n] of entries) {
      const it = k as Item;
      const row = el('div', 'row', `<span><b>${ITEMS[it].name}</b> ×${n}<br><i>${ITEMS[it].desc}</i></span>`);
      if (['food', 'water', 'candy', 'fruit', 'bandage'].includes(it)) {
        const b = el('button', 'btn small', it === 'water' ? 'Drink' : it === 'bandage' ? 'Use' : 'Eat') as HTMLButtonElement;
        b.dataset.testid = `use-${it}`;
        b.onclick = () => {
          s.consume(it);
          this.openInventory();
        };
        row.appendChild(b);
      }
      list.appendChild(row);
    }
    box.appendChild(list);
    const rep = el('div', 'rep');
    for (const [f, name] of Object.entries(FACTIONS)) {
      const v = s.rep[f as Faction];
      rep.appendChild(el('div', 'reprow', `<span>${name}</span><span class="${v >= 0 ? 'pos' : 'neg'}">${v > 0 ? '+' : ''}${v}</span>`));
    }
    box.appendChild(el('h3', '', 'Standing'));
    box.appendChild(rep);
    const close = el('button', 'btn', 'Close') as HTMLButtonElement;
    close.onclick = () => this.close();
    box.appendChild(close);
  }

  openCraft(): void {
    const s = this.host.state;
    const box = this.open('craft', 'm-inv');
    box.innerHTML = `<div class="speaker">Workbench</div><div class="sub">Turn scrap into something useful.</div>`;
    const recipes: [string, string, string][] = [
      ['satchel', 'Satchel', '2 fabric + 1 scrap → carry 22 instead of 12'],
      ['ration', 'Crumb ration (pressed)', '1 candy → 3 crumb rations'],
      // pocket items (button, clip, phone) only show while you own one
      ...Object.entries(RECIPES).filter(([id]) => !['button', 'clip', 'phone'].includes(id) || s.count(id as Item) > 0).map(([id, r]): [string, string, string] => [
        id,
        r.name,
        `${Object.entries(r.cost).map(([i, n]) => `${n} ${ITEMS[i as Item].name.toLowerCase()}`).join(' + ')}${r.weapon === 'pick' ? ' → click / F to jab, 3rd hit lunges' : r.weapon === 'sling' ? ' → hold Q to draw, release to fire' : r.does ? ` → ${r.does}` : ''}`,
      ]),
    ];
    // what the materials you carry are good for: every recipe and home piece that uses them, and where to find more
    const uses: string[] = [];
    for (const [k, n] of Object.entries(s.inv)) {
      const it = k as Item;
      if (!n) continue;
      const by = [...Object.values(RECIPES).filter((r) => r.cost[it]).map((r) => r.name), ...HOME_TIERS.filter((t) => t.cost[it]).map((t) => `${t.name} (home)`)];
      if (by.length > 1 || WHERE[it]) uses.push(`<b>${ITEMS[it].name}</b> ×${n}: ${by.join(' · ') || 'nothing at the bench'}${WHERE[it] ? `<br><i>Find more: ${WHERE[it]}</i>` : ''}`);
    }
    if (uses.length) box.appendChild(el('div', 'sub', uses.join('<br>')));
    for (const [id, name, desc] of recipes) {
      const row = el('div', 'row', `<span><b>${name}</b><br><i>${desc}</i></span>`);
      const b = el('button', 'btn small', 'Make') as HTMLButtonElement;
      b.dataset.testid = `craft-${id}`;
      const r = RECIPES[id];
      if ((id === 'satchel' && s.satchel) || (r?.weapon && s.weapons[r.weapon]) || (r?.flag && this.host.hasFlag(r.flag))) b.disabled = true;
      b.onclick = () => {
        const r = this.host.craft(id);
        this.toast(r.ok ? `Made: ${name}` : r.reason!, r.ok ? 'good' : 'bad');
        this.openCraft();
      };
      row.appendChild(b);
      box.appendChild(row);
    }
    const close = el('button', 'btn', 'Close') as HTMLButtonElement;
    close.onclick = () => this.close();
    box.appendChild(close);
  }

  /** Your matchbox: build the next tier, use what you've built. */
  openHome(): void {
    const s = this.host.state;
    const act = (a: 'build' | 'deposit' | 'take' | 'cook' | 'barrel' | 'fang', it?: Item) => {
      const r = this.host.homeAction(a, it);
      if (r.msg) this.toast(r.msg, r.ok ? 'good' : 'bad');
      this.openHome();
    };
    const box = this.open('home', 'm-inv');
    box.innerHTML = `<div class="speaker">Your matchbox</div><div class="sub">${s.homeTier ? HOME_TIERS.slice(0, s.homeTier).map((t) => t.name).join(' · ') : 'A patched box with a sponge bed.'}</div>`;
    const next = HOME_TIERS[s.homeTier];
    if (next) {
      const cost = Object.entries(next.cost).map(([i, n]) => `${n} ${ITEMS[i as Item].name.toLowerCase()} (${s.count(i as Item)})`).join(', ');
      const row = el('div', 'row', `<span><b>Next: ${next.name}</b><br><i>${next.does}. Needs ${cost}.</i></span>`);
      const b = el('button', 'btn small', 'Build') as HTMLButtonElement;
      b.dataset.testid = 'home-build';
      b.onclick = () => act('build');
      row.appendChild(b);
      box.appendChild(row);
    }
    const btn = (label: string, id: string, fn: () => void, row: HTMLElement) => {
      const b = el('button', 'btn small', label) as HTMLButtonElement;
      b.dataset.testid = id;
      b.onclick = fn;
      row.appendChild(b);
    };
    if (s.homeTier >= 2) btn('Cook a Hot Bowl', 'home-cook', () => act('cook'), box.appendChild(el('div', 'row', '<span>Tealight stove: 2 crumb + 1 water → hunger +60, double regen</span>')));
    if (s.homeTier >= 3) btn('Draw water', 'home-barrel', () => act('barrel'), box.appendChild(el('div', 'row', '<span>Drip barrel: 2 caps of water</span>')));
    if (s.homeTier >= 4) btn('Mount a fang', 'home-fang', () => act('fang'), box.appendChild(el('div', 'row', `<span>Fang wall: max health ${s.maxHealth}/120 · fangs ${s.count('fang')}</span>`)));
    if (s.homeTier >= 1) {
      box.appendChild(el('h3', '', 'Stash tin'));
      const items = new Set([...Object.keys(s.inv), ...Object.keys(s.stash)] as Item[]);
      items.delete('parcel');
      if (!items.size) box.appendChild(el('div', 'empty', 'Nothing to stash.'));
      for (const it of items) {
        const row = el('div', 'row', `<span>${ITEMS[it].name} <i>pack ${s.count(it)} · tin ${s.stash[it] ?? 0}</i></span>`);
        if (s.count(it)) btn('Stash', `stash-${it}`, () => act('deposit', it), row);
        if (s.stash[it]) btn('Take', `take-${it}`, () => act('take', it), row);
        box.appendChild(row);
      }
    }
    const close = el('button', 'btn', 'Close') as HTMLButtonElement;
    close.onclick = () => this.close();
    box.appendChild(close);
  }

  // map: a cross-section of the cabinet with districts and markers
  private mapCanvas: HTMLCanvasElement | null = null;
  openMap(): void {
    const box = this.open('map', 'm-map');
    box.innerHTML = `<div class="speaker">The Cabinet — cross-section</div>`;
    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.width = 760;
    this.mapCanvas.height = 520;
    box.appendChild(this.mapCanvas);
    box.appendChild(el('div', 'sub', '● you · ◆ objective · Depths (floor) · Threadmarket (shelf 1) · the Heights (shelf 2)'));
    const close = el('button', 'btn', 'Close') as HTMLButtonElement;
    close.onclick = () => this.close();
    box.appendChild(close);
    this.drawMap();
  }

  private drawMap(): void {
    const c = this.mapCanvas;
    if (!c) return;
    const g = c.getContext('2d')!;
    const W = c.width, H = c.height;
    const sx = (x: number) => 30 + ((x - CABINET.minX) / (CABINET.maxX - CABINET.minX)) * (W - 60);
    const sy = (y: number) => H - 20 - (y / CABINET.top) * (H - 40);
    g.fillStyle = '#efe2c6';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#5a3a22';
    g.lineWidth = 4;
    g.strokeRect(sx(CABINET.minX), sy(CABINET.top), sx(CABINET.maxX) - sx(CABINET.minX), sy(0) - sy(CABINET.top));
    const names = ['the Depths', 'Threadmarket', 'the Heights', 'Upper Shelves', 'Upper Shelves', 'the Crown'];
    TIER_Y.forEach((y, i) => {
      g.strokeStyle = '#7a5a3a';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(sx(CABINET.minX), sy(y));
      g.lineTo(sx(CABINET.maxX), sy(y));
      g.stroke();
      g.fillStyle = i < 3 ? '#2b2118' : '#8a7a66';
      g.font = `${i < 3 ? 'bold ' : ''}14px Georgia`;
      g.fillText(names[i], sx(-60), sy(y) - 6);
    });
    // playable regions
    const region = (x0: number, x1: number, y: number, h: number, col: string) => {
      g.fillStyle = col;
      g.fillRect(sx(x0), sy(y + h), sx(x1) - sx(x0), sy(y) - sy(y + h));
    };
    region(-22, 22, 0, 18.7, 'rgba(181,82,59,0.18)');
    region(-22, 22, 20, 20.7, 'rgba(201,154,74,0.22)');
    region(-22, -1, 42, 20.7, 'rgba(63,110,140,0.2)');
    // lifts
    g.strokeStyle = '#2b2118';
    g.setLineDash([4, 4]);
    for (const [x, y0, y1] of [
      [18, 0, 20],
      [-18, 20, 42],
    ]) {
      g.beginPath();
      g.moveTo(sx(x), sy(y0));
      g.lineTo(sx(x), sy(y1));
      g.stroke();
    }
    g.setLineDash([]);
    const m = this.host.markerPos();
    if (m) {
      g.fillStyle = '#d9822b';
      g.beginPath();
      g.moveTo(sx(m.x), sy(m.y + 3) - 7);
      g.lineTo(sx(m.x) + 6, sy(m.y + 3));
      g.lineTo(sx(m.x), sy(m.y + 3) + 7);
      g.lineTo(sx(m.x) - 6, sy(m.y + 3));
      g.fill();
    }
    const p = this.host.playerPos();
    g.fillStyle = '#2f6a6a';
    g.beginPath();
    g.arc(sx(p.x), sy(p.y + 1), 6, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#fff';
    g.lineWidth = 2;
    g.stroke();
  }

  // pause / settings
  openPause(): void {
    const h = this.host;
    const box = this.open('pause', 'm-pause');
    h.setPaused(true);
    box.innerHTML = `<div class="speaker">${GAME_TITLE} — paused</div>`;
    const btns = el('div', 'btns');
    const mk = (label: string, id: string, fn: () => void) => {
      const b = el('button', 'btn', label) as HTMLButtonElement;
      b.dataset.testid = id;
      b.onclick = fn;
      btns.appendChild(b);
      return b;
    };
    mk('Resume', 'resume', () => this.close());
    mk('Save', 'save', () => this.toast(h.save() ? 'Game saved.' : 'Could not save.', 'info'));
    const lb = mk('Load', 'load', () => {
      if (h.load()) {
        this.close();
        this.toast('Save loaded.', 'info');
      } else this.toast('No save found.', 'bad');
    });
    lb.disabled = !h.hasSave();
    mk('Unstuck', 'unstuck', () => {
      h.unstuck();
      this.close();
    });
    mk('Restart chapter', 'restart', () => {
      if (confirm('Restart from the beginning? Your save will be cleared.')) h.restart();
    });
    box.appendChild(btns);
    // settings
    const set = el('div', 'settings');
    set.innerHTML = `
      <label>Quality <select data-testid="quality"><option value="high">High</option><option value="low">Low</option></select></label>
      <label>Camera distance <input type="range" min="1.6" max="12" step="0.1" data-testid="camdist"></label>
      <label>Mouse sensitivity <input type="range" min="0.001" max="0.01" step="0.0005" data-testid="sens"></label>
      <label>Invert camera Y <input type="checkbox" data-testid="invert"></label>
      <label>Sound <input type="checkbox" data-testid="soundtoggle"></label>
      <label>Volume <input type="range" min="0" max="1" step="0.05" data-testid="volume"></label>
      <label>Show performance <input type="checkbox" data-testid="perf"></label>`;
    const q = set.querySelector('[data-testid=quality]') as HTMLSelectElement;
    q.value = h.quality() ? 'low' : 'high';
    q.onchange = () => h.setQuality(q.value === 'low');
    const cd = set.querySelector('[data-testid=camdist]') as HTMLInputElement;
    cd.value = String(h.camDist());
    cd.oninput = () => h.camDist(parseFloat(cd.value));
    const se = set.querySelector('[data-testid=sens]') as HTMLInputElement;
    se.value = String(h.sens());
    se.oninput = () => h.sens(parseFloat(se.value));
    const inv = set.querySelector('[data-testid=invert]') as HTMLInputElement;
    inv.checked = h.invert();
    inv.onchange = () => h.invert(inv.checked);
    const so = set.querySelector('[data-testid=soundtoggle]') as HTMLInputElement;
    so.checked = h.soundOn();
    so.onchange = () => {
      const on = h.soundOn(so.checked);
      this.soundBtn.textContent = on ? '♪ Sound on' : '♪ Enable sound';
    };
    const vo = set.querySelector('[data-testid=volume]') as HTMLInputElement;
    vo.value = String(h.volume());
    vo.oninput = () => h.volume(parseFloat(vo.value));
    const pf = set.querySelector('[data-testid=perf]') as HTMLInputElement;
    pf.checked = this.showStats;
    pf.onchange = () => (this.showStats = pf.checked);
    box.appendChild(el('h3', '', 'Settings'));
    box.appendChild(set);
    box.appendChild(el('div', 'sub', 'Controls: WASD move · mouse drag or arrow keys turn the camera (L to lock the pointer) · wheel or −/= zoom · Shift sprint · Space jump · E interact · F context action · I pack · M map · R unstuck · Esc menu'));
  }

  openTitle(): void {
    const h = this.host;
    const box = this.open('title', 'm-title');
    box.innerHTML = `<div class="title">${GAME_TITLE}</div><div class="subtitle">${GAME_SUBTITLE}</div><div class="blurb">You are two and a half centimetres tall, inside a giant's display cabinet. Thousands of tiny people live on its shelves. The poor live below. The giant outside can change everything.</div>`;
    const btns = el('div', 'btns');
    const b1 = el('button', 'btn big', 'Begin') as HTMLButtonElement;
    b1.dataset.testid = 'begin';
    b1.onclick = () => {
      this.close();
      h.beginGame(false);
    };
    btns.appendChild(b1);
    if (h.hasSave()) {
      const b2 = el('button', 'btn big', 'Continue') as HTMLButtonElement;
      b2.dataset.testid = 'continue';
      b2.onclick = () => {
        this.close();
        h.beginGame(true);
      };
      btns.appendChild(b2);
    }
    box.appendChild(btns);
    box.appendChild(el('div', 'sub', 'Sound starts muted — use ♪ Enable sound in the corner. Drag the mouse or use arrow keys to look around.'));
  }

  showCard(title: string, body: string): void {
    const box = this.open('card', 'm-title');
    box.innerHTML = `<div class="title small">${title}</div><div class="blurb">${body}</div>`;
    const b = el('button', 'btn big', 'Continue') as HTMLButtonElement;
    b.dataset.testid = 'card-continue';
    b.onclick = () => {
      this.panel = 'none';
      this.close();
    };
    box.appendChild(b);
  }

  handleKey(code: string): boolean {
    if (this.panel === 'dialogue' && /^Digit[1-9]$/.test(code)) {
      this.choose(parseInt(code.slice(5), 10) - 1);
      return true;
    }
    if (this.panel === 'name') return true;
    if (code === 'Escape') {
      if (this.panel === 'title' || this.panel === 'card') return true;
      if (this.panel !== 'none') this.close();
      else this.openPause();
      return true;
    }
    if (this.panel === 'title' || this.panel === 'card') return true;
    if (code === 'KeyI') {
      this.toggle('inventory');
      return true;
    }
    if (code === 'KeyM') {
      this.toggle('map');
      return true;
    }
    return this.panel !== 'none';
  }

  get tradeOpen(): string {
    return this.panel === 'trade' ? this.tradeVendor : '';
  }
}
