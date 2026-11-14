// Keyboard + mouse input. Camera works without pointer lock: drag with any mouse button,
// or turn with the arrow keys. A virtual channel lets the autopilot drive the same path.

export interface VirtualInput {
  moveX: number; // strafe -1..1
  moveZ: number; // forward 1..-1
  sprint: boolean;
  yawRate: number; // radians/sec
}

export class Input {
  private down = new Set<string>();
  private pressedQueue: string[] = [];
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  dragging = false;
  pointerLocked = false;
  /** Set true while a modal UI is open so world controls ignore keys. */
  uiCapture = false;
  virtual: VirtualInput = { moveX: 0, moveZ: 0, sprint: false, yawRate: 0 };
  virtualPressed: string[] = [];
  private lastX = 0;
  private lastY = 0;
  private downAt: { t: number; x: number; y: number; button: number } | null = null;

  constructor(private canvas: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (!e.repeat) this.pressedQueue.push(e.code);
      this.down.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    canvas.addEventListener('mousedown', (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.downAt = { t: performance.now(), x: e.clientX, y: e.clientY, button: e.button };
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => {
      this.dragging = false;
      // a quick left click (not a drag) is an attack; drags keep turning the camera
      const d = this.downAt;
      if (d && d.button === 0 && e.button === 0 && performance.now() - d.t < 220 && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) this.pressedQueue.push('Click');
      this.downAt = null;
    });
    window.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      } else if (this.dragging) {
        this.mouseDX += e.clientX - this.lastX;
        this.mouseDY += e.clientY - this.lastY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // pointer lock on L (double-click would fire on fast jabs)
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyL' && !this.uiCapture) {
        if (this.pointerLocked) document.exitPointerLock?.();
        else canvas.requestPointerLock?.();
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        this.wheel += Math.sign(e.deltaY);
        e.preventDefault();
      },
      { passive: false },
    );
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** Drain the keys pressed since the last call (plus virtual presses). */
  takePressed(): string[] {
    const out = this.pressedQueue.concat(this.virtualPressed);
    this.pressedQueue = [];
    this.virtualPressed = [];
    return out;
  }

  takeMouse(): { dx: number; dy: number; wheel: number } {
    const r = { dx: this.mouseDX, dy: this.mouseDY, wheel: this.wheel };
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    return r;
  }

  /** Movement intent in camera space. */
  move(): { x: number; z: number; sprint: boolean } {
    if (this.uiCapture) return { x: 0, z: 0, sprint: false };
    let x = 0;
    let z = 0;
    if (this.down.has('KeyW')) z += 1;
    if (this.down.has('KeyS')) z -= 1;
    if (this.down.has('KeyA')) x -= 1;
    if (this.down.has('KeyD')) x += 1;
    x += this.virtual.moveX;
    z += this.virtual.moveZ;
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    const sprint = this.down.has('ShiftLeft') || this.down.has('ShiftRight') || this.virtual.sprint;
    return { x, z, sprint };
  }

  jumpHeld(): boolean {
    return !this.uiCapture && this.down.has('Space');
  }
}
