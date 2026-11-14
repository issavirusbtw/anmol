// Phone/tablet controls: a floating stick on the left half, drag-to-look and tap-to-jab on the right,
// and buttons that fire the same key events as the keyboard, so every system sees ordinary input.
import type { Game } from '../game';

const R = 56; // stick radius in px; pushing to the rim sprints

// [label, key code, held?]  'Click' is the jab, which the mouse path also queues
const ACTIONS: [string, string, boolean][] = [
  ['Jump', 'Space', true],
  ['Use', 'KeyE', false],
  ['Jab', 'Click', false],
  ['Act', 'KeyF', false],
  ['Sling', 'KeyQ', true],
];
const MENUS: [string, string][] = [
  ['Pack', 'KeyI'],
  ['Map', 'KeyM'],
];

export class TouchControls {
  /** ?touch=1 forces the controls on (desktop testing), ?touch=0 off; otherwise any touch-first device. */
  static wanted(): boolean {
    const t = new URLSearchParams(location.search).get('touch');
    return t === '1' || (t !== '0' && matchMedia('(pointer: coarse)').matches);
  }

  private layer = document.createElement('div');
  private actions = document.createElement('div');
  private base = document.createElement('div');
  private knob = document.createElement('div');
  private stick: { id: number; x: number; y: number } | null = null;
  private look: { id: number; x: number; y: number; t: number; x0: number; y0: number } | null = null;

  constructor(private g: Game, canvas: HTMLElement) {
    this.layer.className = 'touch';
    this.actions.className = 'touch-actions';
    this.base.className = 'touch-base';
    this.knob.className = 'touch-knob';
    this.base.appendChild(this.knob);
    for (const [label, code, held] of ACTIONS) this.actions.appendChild(this.button(label, code, held));
    const menus = document.createElement('div');
    menus.className = 'touch-menus';
    for (const [label, code] of MENUS) menus.appendChild(this.button(label, code, false));
    this.layer.append(this.base, this.actions, menus);
    // under #ui, so dialogues, the pause menu and HUD buttons stay on top
    document.body.insertBefore(this.layer, document.getElementById('ui'));
    document.body.classList.add('touch-on');

    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      e.preventDefault(); // no emulated mouse events, so the mouse path doesn't also drag/jab
      canvas.setPointerCapture(e.pointerId);
      if (e.clientX < innerWidth * 0.45 && !this.stick && this.g.mode === 'play') {
        this.stick = { id: e.pointerId, x: e.clientX, y: e.clientY };
        this.base.style.transform = `translate(${e.clientX - R}px, ${e.clientY - R}px)`;
        this.knob.style.transform = '';
        this.base.style.display = 'block';
      } else if (!this.look) {
        this.look = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), x0: e.clientX, y0: e.clientY };
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      const s = this.stick, l = this.look;
      if (s && e.pointerId === s.id) {
        let dx = e.clientX - s.x, dy = e.clientY - s.y;
        const d = Math.hypot(dx, dy);
        if (d > R) (dx *= R / d), (dy *= R / d);
        this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
        const v = this.g.input.virtual;
        v.moveX = dx / R;
        v.moveZ = -dy / R;
        v.sprint = d > R * 0.95;
      } else if (l && e.pointerId === l.id) {
        this.g.input.mouseDX += e.clientX - l.x;
        this.g.input.mouseDY += e.clientY - l.y;
        l.x = e.clientX;
        l.y = e.clientY;
      }
    });
    const end = (e: PointerEvent) => {
      if (this.stick?.id === e.pointerId) this.releaseStick();
      const l = this.look;
      if (l?.id === e.pointerId) {
        // a quick tap (not a drag) jabs, matching the mouse rule
        if (e.type === 'pointerup' && performance.now() - l.t < 220 && Math.hypot(e.clientX - l.x0, e.clientY - l.y0) < 10) this.g.input.virtualPressed.push('Click');
        this.look = null;
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  /** Show only in play; hide the action pad while a dialogue or panel has the input. */
  update(): void {
    const play = this.g.mode === 'play';
    this.layer.style.display = play ? '' : 'none';
    this.actions.style.visibility = this.g.input.uiCapture ? 'hidden' : 'visible';
    if (this.stick && (!play || this.g.input.uiCapture)) this.releaseStick();
  }

  private releaseStick(): void {
    this.stick = null;
    this.base.style.display = 'none';
    Object.assign(this.g.input.virtual, { moveX: 0, moveZ: 0, sprint: false });
  }

  private button(label: string, code: string, held: boolean): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'touch-btn';
    b.textContent = label;
    b.dataset.testid = `touch-${label.toLowerCase()}`;
    const key = (type: string) => window.dispatchEvent(new KeyboardEvent(type, { code }));
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (code === 'Click') this.g.input.virtualPressed.push('Click');
      else key('keydown');
    });
    if (held) for (const t of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(t, () => key('keyup'));
    else b.addEventListener('pointerup', () => code !== 'Click' && key('keyup'));
    return b;
  }
}
