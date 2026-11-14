// Third-person player controller and orbit camera with collision avoidance.
import * as THREE from 'three';
import { Body, CollisionWorld } from '../physics/collision';
import { Figure, FigureSystem, Look } from '../characters/figure';
import { Input } from '../core/input';
import { Bus } from '../core/bus';

export const PLAYER_LOOK: Look = {
  skin: 0xe0ac84,
  shirt: 0x2f6a6a,
  pants: 0x4a3b30,
  shoes: 0x2a2018,
  hair: 0x3a2618,
  hairStyle: 'tail',
  hat: 'none',
  hatColor: 0,
  scarf: 0xd9822b,
  pack: 0x8a6a3a,
  longSleeves: true,
  build: 1,
  height: 1,
};

export class Player {
  body: Body;
  fig: Figure;
  stamina = 100;
  private exhausted = false;
  private coyote = 0;
  private jumpBuffer = 0;
  private lastSafe = new THREE.Vector3();
  private safeTimer = 0;
  private lastStepPhase = 0;
  frozen = false;
  /** carrying capacity modifier (satchel) */
  speedMul = 1;
  distanceWalked = 0;
  jumps = 0;

  constructor(
    figs: FigureSystem,
    private col: CollisionWorld,
    private bus: Bus,
  ) {
    this.body = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), radius: 0.32, height: 1.7, grounded: false, ground: null };
    this.fig = figs.add(PLAYER_LOOK);
  }

  place(p: THREE.Vector3, yaw: number): void {
    this.body.pos.copy(p);
    this.body.vel.set(0, 0, 0);
    this.body.grounded = false;
    this.fig.yaw = yaw;
    this.lastSafe.copy(p);
    this.fig.pos.copy(p);
  }

  recover(): void {
    this.place(this.lastSafe.clone().add(new THREE.Vector3(0, 0.2, 0)), this.fig.yaw);
    this.bus.emit({ type: 'toast', text: 'You scramble back to solid ground.', kind: 'info' });
  }

  update(dt: number, input: Input, camYaw: number, pressed: string[]): void {
    const b = this.body;
    const mv = this.frozen ? { x: 0, z: 0, sprint: false } : input.move();
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    let dx = fx * mv.z + rx * mv.x;
    let dz = fz * mv.z + rz * mv.x;
    const mag = Math.hypot(dx, dz);
    if (mag > 1) {
      dx /= mag;
      dz /= mag;
    }
    const moving = mag > 0.05;
    let sprint = mv.sprint && moving && !this.exhausted;
    if (sprint) {
      this.stamina -= 16 * dt;
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.exhausted = true;
        sprint = false;
      }
    } else {
      this.stamina = Math.min(100, this.stamina + (moving ? 9 : 16) * dt);
      if (this.exhausted && this.stamina > 25) this.exhausted = false;
    }
    const speed = (sprint ? 6.6 : 3.7) * this.speedMul;
    const accel = b.grounded ? 16 : 4;
    const k = Math.min(1, accel * dt);
    b.vel.x += (dx * speed - b.vel.x) * k;
    b.vel.z += (dz * speed - b.vel.z) * k;

    // jump with coyote time and input buffering
    if (pressed.includes('Space') && !this.frozen) this.jumpBuffer = 0.14;
    this.jumpBuffer -= dt;
    this.coyote = b.grounded ? 0.12 : this.coyote - dt;
    if (this.jumpBuffer > 0 && this.coyote > 0 && this.stamina > 4) {
      b.vel.y = 8.4;
      b.grounded = false;
      b.ground = null;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.stamina -= 4;
      this.jumps++;
      this.bus.emit({ type: 'sfx', name: 'jump' });
    }
    // variable jump height
    if (b.vel.y > 0 && !input.jumpHeld() && !this.frozen) b.vel.y -= 18 * dt;

    const prevY = b.pos.y;
    const prevX = b.pos.x, prevZ = b.pos.z;
    const wasGrounded = b.grounded;
    const vy0 = b.vel.y;
    this.col.moveBody(b, dt);
    if (b.grounded && !wasGrounded && prevY - b.pos.y > -0.01 && b.vel.y === 0) {
      this.bus.emit({ type: 'sfx', name: 'land' });
      // squash scales with impact speed; a hop off a step barely registers
      this.fig.land = Math.max(this.fig.land, Math.min(1, -vy0 / 14));
    }
    // smooth visual step-ups
    const dy = b.pos.y - prevY;
    if (b.grounded && dy > 0.05 && dy < 0.6 && !(b.ground && b.ground.dynamic)) this.fig.yOffset -= dy;
    this.fig.yOffset *= Math.exp(-dt * 14);

    const moved = Math.hypot(b.pos.x - prevX, b.pos.z - prevZ);
    this.distanceWalked += moved;
    this.fig.pos.copy(b.pos);
    if (moving) {
      const targetYaw = Math.atan2(dx, dz);
      let d = targetYaw - this.fig.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.fig.yaw += d * Math.min(1, dt * 12);
    }
    const hs = Math.hypot(b.vel.x, b.vel.z);
    this.fig.speed = hs;
    if (!b.grounded) this.fig.state = b.vel.y > 0 ? 'jump' : 'fall';
    else if (hs > 4.8) this.fig.state = 'run';
    else if (hs > 0.4) this.fig.state = 'walk';
    else this.fig.state = 'idle';
    if (b.grounded) this.fig.stride(moved, hs > 4.8);
    this.fig.t += dt;
    // footsteps on each half cycle
    const stepPhase = Math.floor(this.fig.phase / Math.PI);
    if (stepPhase !== this.lastStepPhase && b.grounded && hs > 0.4) this.bus.emit({ type: 'sfx', name: 'step', vol: hs > 4.8 ? 1 : 0.6 });
    this.lastStepPhase = stepPhase;

    // safe position tracking + fall recovery
    if (b.grounded && b.ground && !b.ground.dynamic) {
      this.safeTimer += dt;
      if (this.safeTimer > 0.6) this.lastSafe.copy(b.pos);
    } else this.safeTimer = 0;
    if (b.pos.y < -12) this.recover();
  }
}

/** Base field of view for play; sprinting widens it a little. */
export const PLAY_FOV = 58;

/**
 * Over-the-shoulder chase camera: the character sits left of centre so the path ahead stays visible.
 * The shoulder offset and the boom both shrink against walls, so the camera never ends up inside geometry.
 */
export class CameraRig {
  yaw = Math.PI;
  pitch = 0.2;
  dist = 4.0;
  /** current (collision-shortened) boom length */
  cur = 4.0;
  target = new THREE.Vector3();
  sens = 0.0042;
  invertY = false;
  /** lateral shoulder offset at full boom length, in metres to the right */
  shoulder = 0.62;
  /** 0..1 sprint amount, eased, drives the fov kick */
  sprint = 0;
  private side = 0.62;
  private tmp = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private right = new THREE.Vector3();
  private pivot = new THREE.Vector3();
  private look = new THREE.Vector3();

  constructor(
    public cam: THREE.PerspectiveCamera,
    private col: CollisionWorld,
  ) {}

  handleInput(input: Input, dt: number): void {
    const m = input.takeMouse();
    if (!input.uiCapture) {
      this.yaw -= m.dx * this.sens;
      this.pitch += m.dy * this.sens * (this.invertY ? -1 : 1);
      if (input.isDown('ArrowLeft')) this.yaw += 2.2 * dt;
      if (input.isDown('ArrowRight')) this.yaw -= 2.2 * dt;
      if (input.isDown('ArrowUp')) this.pitch += 1.4 * dt;
      if (input.isDown('ArrowDown')) this.pitch -= 1.4 * dt;
      if (input.isDown('Equal') || input.isDown('NumpadAdd')) this.dist -= 6 * dt;
      if (input.isDown('Minus') || input.isDown('NumpadSubtract')) this.dist += 6 * dt;
      this.dist += m.wheel * 0.6;
    }
    this.yaw += input.virtual.yawRate * dt;
    this.pitch = Math.max(-0.55, Math.min(1.2, this.pitch));
    this.dist = Math.max(1.6, Math.min(12, this.dist));
  }

  update(focus: THREE.Vector3, dt: number): void {
    // a soft follow: vertical lags more than horizontal so jumps and steps don't jolt the frame
    const kh = 1 - Math.exp(-dt * 14), kv = 1 - Math.exp(-dt * 7);
    this.target.x += (focus.x - this.target.x) * kh;
    this.target.z += (focus.z - this.target.z) * kh;
    this.target.y += (focus.y - this.target.y) * kv;
    const cp = Math.cos(this.pitch);
    this.dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp).normalize();
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    // shoulder: shrink the offset against side walls, and with the boom so close-ups stay centred
    const sideHit = this.col.raycast(this.target, this.right, this.shoulder + 0.3, 0.1);
    const sideWant = Math.max(0, Math.min(this.shoulder * Math.min(1, this.cur / 3), sideHit - 0.3));
    this.side += (sideWant - this.side) * (sideWant < this.side ? 1 - Math.exp(-dt * 20) : 1 - Math.exp(-dt * 3));
    this.pivot.copy(this.target).addScaledVector(this.right, this.side);
    const hit = this.col.raycast(this.pivot, this.dir, this.dist + 0.4, 0.14);
    const want = Math.max(0.35, Math.min(this.dist, hit - 0.3));
    // snap in fast when blocked, ease out slowly
    this.cur += (want - this.cur) * (want < this.cur ? 1 - Math.exp(-dt * 30) : 1 - Math.exp(-dt * 3));
    this.tmp.copy(this.pivot).addScaledVector(this.dir, this.cur);
    this.cam.position.copy(this.tmp);
    // aim a touch above the head, so more of the giant world above fills the frame
    this.look.copy(this.pivot);
    this.look.y += 0.15;
    this.cam.lookAt(this.look);
    const fov = PLAY_FOV + this.sprint * 6;
    if (Math.abs(this.cam.fov - fov) > 0.01) {
      this.cam.fov += (fov - this.cam.fov) * (1 - Math.exp(-dt * 6));
      this.cam.updateProjectionMatrix();
    }
  }

  snap(focus: THREE.Vector3): void {
    this.target.copy(focus);
    this.cur = this.dist;
    this.side = this.shoulder;
    this.update(focus, 1);
    this.cam.fov = PLAY_FOV;
    this.cam.updateProjectionMatrix();
  }
}
