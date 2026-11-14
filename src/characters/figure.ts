// Articulated stylised people. Each figure is a small bone hierarchy whose parts are written into a
// handful of shared InstancedMeshes, so the whole population costs ~8 draw calls.
import * as THREE from 'three';
import { Materials } from '../render/materials';

export type HairStyle = 'short' | 'bun' | 'long' | 'bald' | 'curly' | 'tail';
export type Hat = 'none' | 'helmet' | 'cap' | 'wrap' | 'tall' | 'thimble' | 'goggles';

export interface Look {
  skin: number;
  shirt: number;
  pants: number;
  shoes: number;
  hair: number;
  hairStyle: HairStyle;
  hat: Hat;
  hatColor: number;
  apron?: number;
  pack?: number;
  cape?: number;
  sash?: number;
  scarf?: number;
  longSleeves: boolean;
  build: number;
  height: number;
  skirt?: boolean;
  /** mismatched right sleeve colour */
  sleeveR?: number;
  /** collector armour: bottle-cap pauldrons, ring-pull plate, blister-foil greaves (plate colour) */
  armour?: number;
  /** homemade bow slung across the back, toothpick darts at the hip */
  bow?: boolean;
  /** patch colour stitched onto the pack */
  patches?: number;
}

export type AnimState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'work'
  | 'serve'
  | 'talk'
  | 'carry'
  | 'cheer'
  | 'sit'
  | 'jump'
  | 'sweep'
  | 'cook'
  | 'guard'
  | 'point'
  | 'collect'
  | 'fall'
  | 'jab'
  | 'draw'
  | 'hurt'
  | 'down';

export class Figure {
  pos = new THREE.Vector3();
  yaw = 0;
  state: AnimState = 'idle';
  phase = 0;
  t = 0;
  speed = 0;
  carry: number | null = null; // colour of carried crate
  /** item held in the right hand: toothpick pick, snapband, or a Tallyman's hook */
  held: 'pick' | 'sling' | 'hook' | 'bow' | null = null;
  visible = true;
  /** smoothed vertical offset for step-up smoothing */
  yOffset = 0;
  /** landing impact 0..1: set on touchdown, the figure squashes and recovers */
  land = 0;
  /** sharp-turn plant, signed by turn direction: hips drop and the body shifts weight before swinging round */
  turn = 0;
  /** stopping from speed: upper body carries forward, knees absorb it */
  settle = 0;
  /** a timed contact action (dig into a heap, drink at the drip, fill a cap); t runs 0..dur */
  action: { kind: 'dig' | 'drink' | 'fill'; t: number; dur: number } | null = null;
  /** displayed pose + crossfade state, owned by FigureSystem */
  anim: { shown: Pose; from: Pose; blend: number; state: AnimState; yaw: number; bank: number } | null = null;
  constructor(
    public look: Look,
    public id: number,
    public simple = false,
  ) {}
  /** advance animation phase by distance moved */
  stride(dist: number, run: boolean): void {
    // step length follows the same walk→run blend as gait(), so the swing widens with speed and planted feet don't skate
    const r = this.speed > 0 ? Math.min(1, Math.max(0, (this.speed - 3.4) / 3.2)) : run ? 1 : 0;
    this.phase += (dist / (0.92 + 0.58 * r)) * Math.PI;
  }
}

type PartKind = 'capCloth' | 'capSkin' | 'sphCloth' | 'sphSkin' | 'eye' | 'boxCloth' | 'cylCloth' | 'metal';

interface Pose {
  bob: number;
  lean: number;
  twist: number;
  hipL: number;
  hipR: number;
  kneeL: number;
  kneeR: number;
  shL: number;
  shR: number;
  abL: number;
  abR: number;
  elL: number;
  elR: number;
  headYaw: number;
  headPitch: number;
  sit: number;
  /** pelvis rotation about the spine (stride), sideways weight shift, whole-body roll into turns */
  hipYaw: number;
  sway: number;
  bank: number;
  /** extra ankle pitch on top of "keep the foot level" (+ = toes down) */
  ankleL: number;
  ankleR: number;
}

const ZERO_POSE: Pose = {
  bob: 0, lean: 0, twist: 0, hipL: 0, hipR: 0, kneeL: 0, kneeR: 0, shL: 0, shR: 0, abL: 0.08, abR: 0.08, elL: 0.15, elR: 0.15,
  headYaw: 0, headPitch: 0, sit: 0, hipYaw: 0, sway: 0, bank: 0, ankleL: 0, ankleR: 0,
};
const POSE_KEYS = Object.keys(ZERO_POSE) as (keyof Pose)[];
/** seconds to crossfade between animation states */
const BLEND_TIME = 0.18;

/**
 * Walk and run as one gait, blended by ground speed so there is no pop at the threshold.
 * Phase convention: thigh angle = sin(phase); the knee folds just after toe-off and is straight at heel strike.
 */
function gait(p: Pose, f: Figure, carry: boolean): void {
  const r = f.speed > 0 ? Math.min(1, Math.max(0, (f.speed - 3.4) / 3.2)) : f.state === 'run' ? 1 : 0;
  const mix = (a: number, b: number) => a + (b - a) * r;
  const ph = f.phase;
  const s = Math.sin(ph), c = Math.cos(ph);
  for (const side of [0, 1]) {
    const q = ph + side * Math.PI;
    const qs = Math.sin(q);
    const hip = qs * mix(0.55, 0.85) + mix(0.02, 0.14);
    // peak flexion in early swing (thigh passing vertical), near-straight at toe-off and heel strike
    const knee = mix(0.08, 0.22) + Math.max(0, Math.sin(q + mix(1.77, 2.2))) ** 1.4 * mix(0.85, 1.7);
    const toe = Math.max(0, -qs) ** 3 * mix(0.45, 0.6);
    if (side === 0) [p.hipL, p.kneeL, p.ankleL] = [hip, knee, toe];
    else [p.hipR, p.kneeR, p.ankleR] = [hip, knee, toe];
  }
  // walking peaks at mid-stance; running is lowest at mid-stance and floats in the flight phase
  p.bob = mix(Math.abs(c) * 0.05 - 0.025, (1 - Math.abs(c)) * 0.09 - 0.07);
  p.sway = -c * mix(0.028, 0.01);
  p.hipYaw = -s * mix(0.1, 0.16);
  p.twist = -p.hipYaw * 1.7;
  p.lean = mix(0.06, 0.26);
  p.headPitch = -p.lean * 1.1;
  p.headYaw = -p.twist * 0.8 + (r < 0.5 ? Math.sin(f.t * 0.4 + f.id) * 0.12 : 0);
  if (carry) {
    p.shL = p.shR = 1.0;
    p.elL = p.elR = 0.9;
    p.abL = p.abR = -0.12;
    return;
  }
  const arm = mix(0.42, 0.95);
  p.shL = -s * arm + mix(0, 0.15);
  p.shR = s * arm + mix(0, 0.15);
  p.elL = mix(0.3, 1.35) + Math.max(0, -s) * 0.35;
  p.elR = mix(0.3, 1.35) + Math.max(0, s) * 0.35;
  p.abL = p.abR = mix(0.1, 0.18);
}

const ease = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};
/** Contact phase where the hand meets the material; item feedback is timed to this. */
export const CONTACT_AT = { dig: 0.42, drink: 0.4, fill: 0.45 } as const;

/**
 * Timed contact actions, u = 0..1 across the action. Each one anticipates, reaches, holds the contact,
 * and recovers, so the hand visibly meets the heap or the water before anything is gained.
 */
function actionPose(p: Pose, kind: 'dig' | 'drink' | 'fill', u: number): void {
  const c = CONTACT_AT[kind];
  const down = ease(u / c); // 0→1 into the contact
  const up = ease((u - c - 0.12) / (1 - c - 0.12)); // 0→1 recovering after a short hold
  const k = down * (1 - up);
  if (kind === 'dig') {
    // squat over the heap, right hand digs in and pulls back to the chest with the find
    p.hipL = p.hipR = 1.05 * k;
    p.kneeL = 1.5 * k;
    p.kneeR = 1.25 * k;
    p.ankleL = p.ankleR = -0.25 * k;
    p.bob = -0.33 * k;
    p.lean = 0.55 * k + 0.08 * up * (1 - up);
    p.headPitch = 0.45 * k;
    const grab = u > c && u < c + 0.12 ? Math.sin(((u - c) / 0.12) * Math.PI) : 0;
    p.shR = 1.25 * k + 0.6 * up * (1 - up) * 4 * 0.25;
    p.elR = 0.25 * k + grab * 0.5 + 1.6 * up * (1 - up) * 2;
    p.abR = 0.12;
    p.shL = 0.55 * k;
    p.elL = 0.9 * k;
    p.abL = 0.3 * k + 0.08;
    p.twist = -0.15 * k;
  } else if (kind === 'drink') {
    // reach up into the drip with a cupped hand, then bring it to the mouth and tip the head back
    const toMouth = ease((u - c - 0.05) / 0.2) * (1 - ease((u - 0.86) / 0.14));
    const reach = down * (1 - ease((u - c - 0.05) / 0.2));
    p.shR = 2.65 * reach + 1.35 * toMouth;
    p.elR = 0.3 * reach + 2.25 * toMouth;
    p.abR = 0.12 + 0.1 * toMouth;
    p.lean = -0.08 * reach - 0.06 * toMouth;
    p.headPitch = -0.45 * reach - 0.35 * toMouth;
    p.ankleL = p.ankleR = 0.18 * reach; // up on the toes to reach the drop
    p.kneeL = p.kneeR = 0.08;
    p.shL = 0.15;
    p.elL = 0.3;
  } else {
    // fill: crouch at the puddle holding the cap out in both hands, then tuck it into the pack strap
    p.hipL = p.hipR = 0.7 * k;
    p.kneeL = p.kneeR = 1.05 * k;
    p.bob = -0.22 * k;
    p.lean = 0.45 * k;
    p.headPitch = 0.4 * k;
    p.shL = p.shR = 1.05 * k + 0.5 * up * (1 - up) * 2;
    p.elL = p.elR = 0.5 * k + 1.2 * up * (1 - up) * 2;
    p.abL = p.abR = 0.06;
  }
}

function poseFor(f: Figure): Pose {
  const p: Pose = { ...ZERO_POSE };
  const t = f.t;
  const breathe = Math.sin(t * 2.1 + f.id) * 0.012;
  p.bob = breathe;
  switch (f.state) {
    case 'walk':
    case 'carry':
    case 'run':
      gait(p, f, f.state === 'carry');
      break;
    case 'jump': {
      // push-off: lead knee drives up, arms swing up and out
      p.hipL = 0.95;
      p.kneeL = 1.35;
      p.hipR = -0.2;
      p.kneeR = 0.45;
      p.ankleL = 0.35;
      p.ankleR = 0.6;
      p.shL = 0.9;
      p.shR = 0.5;
      p.abL = p.abR = 0.45;
      p.elL = p.elR = 0.7;
      p.lean = 0.08;
      p.headPitch = -0.15;
      break;
    }
    case 'fall': {
      // reaching for the ground: legs extend, arms out for balance
      p.hipL = 0.35;
      p.kneeL = 0.4;
      p.hipR = 0.05;
      p.kneeR = 0.55;
      p.ankleL = p.ankleR = 0.3;
      p.shL = p.shR = 0.35;
      p.abL = p.abR = 1.05;
      p.elL = p.elR = 0.45;
      p.lean = -0.04;
      p.headPitch = 0.12;
      break;
    }
    case 'work': {
      const k = Math.sin(t * 6 + f.id);
      p.lean = 0.35;
      p.shR = 1.2 + k * 0.5;
      p.elR = 0.6 + k * 0.4;
      p.shL = 0.9;
      p.elL = 0.8;
      p.hipL = p.hipR = 0.15;
      p.kneeL = p.kneeR = 0.3;
      p.headPitch = 0.35;
      break;
    }
    case 'cook': {
      const k = t * 3 + f.id;
      p.lean = 0.18;
      p.shR = 0.9 + Math.sin(k) * 0.12;
      p.abR = 0.2 + Math.cos(k) * 0.15;
      p.elR = 0.9;
      p.shL = 0.5;
      p.elL = 1.2;
      p.headPitch = 0.3;
      break;
    }
    case 'serve': {
      const k = Math.sin(t * 1.3 + f.id);
      p.shL = 0.6 + k * 0.3;
      p.elL = 1.0;
      p.shR = 0.4 - k * 0.2;
      p.elR = 0.8;
      p.headYaw = Math.sin(t * 0.7 + f.id) * 0.4;
      p.lean = 0.08;
      break;
    }
    case 'talk': {
      const k = Math.sin(t * 2.3 + f.id * 3);
      const k2 = Math.sin(t * 1.7 + f.id);
      p.shR = 0.5 + Math.max(0, k) * 0.6;
      p.elR = 1.0 + k * 0.3;
      p.abR = 0.25;
      p.shL = 0.15 + Math.max(0, k2) * 0.4;
      p.elL = 0.5;
      p.headYaw = k2 * 0.15;
      p.headPitch = Math.sin(t * 3 + f.id) * 0.06;
      break;
    }
    case 'cheer': {
      const k = Math.sin(t * 8 + f.id);
      p.shL = p.shR = 2.6;
      p.abL = p.abR = 0.4 + k * 0.2;
      p.elL = p.elR = 0.3;
      p.bob = Math.abs(k) * 0.08;
      p.headPitch = -0.3;
      break;
    }
    case 'collect': {
      if (f.action) {
        actionPose(p, f.action.kind, f.action.t / f.action.dur);
        break;
      }
      const k = (Math.sin(t * 4 + f.id) + 1) / 2;
      p.lean = 0.5 + k * 0.4;
      p.hipL = p.hipR = 0.4 + k * 0.4;
      p.kneeL = p.kneeR = 0.6 + k * 0.6;
      p.shL = p.shR = 1.2 + k * 0.3;
      p.elL = p.elR = 0.3;
      p.bob = -k * 0.2;
      break;
    }
    case 'sit': {
      p.sit = 1;
      p.hipL = p.hipR = 1.5;
      p.kneeL = p.kneeR = 1.5;
      p.shL = 0.4;
      p.shR = 0.3 + Math.max(0, Math.sin(t * 0.8 + f.id)) * 0.5;
      p.elL = p.elR = 1.1;
      p.headYaw = Math.sin(t * 0.5 + f.id) * 0.4;
      break;
    }
    case 'sweep': {
      const k = Math.sin(t * 3 + f.id);
      p.lean = 0.25;
      p.twist = k * 0.3;
      p.shL = 0.9;
      p.shR = 0.7;
      p.elL = p.elR = 0.5;
      p.headPitch = 0.3;
      break;
    }
    case 'guard': {
      p.shL = p.shR = -0.35;
      p.abL = p.abR = 0.18;
      p.elL = p.elR = 0.8;
      p.headYaw = Math.sin(t * 0.35 + f.id) * 0.5;
      break;
    }
    case 'jab': {
      p.shR = 1.5;
      p.elR = 0.1;
      p.shL = 0.6;
      p.elL = 1.0;
      p.lean = 0.25;
      p.twist = -0.3;
      p.hipL = 0.4;
      p.kneeR = 0.3;
      break;
    }
    case 'draw': {
      p.shL = 1.55;
      p.elL = 0.05;
      p.shR = 1.45;
      p.elR = 2.1;
      p.twist = 0.35;
      p.hipL = 0.3;
      p.hipR = -0.2;
      break;
    }
    case 'hurt': {
      p.lean = -0.3;
      p.shL = p.shR = 0.6;
      p.abL = p.abR = 0.8;
      p.kneeL = p.kneeR = 0.3;
      break;
    }
    case 'down': {
      p.sit = 1;
      p.hipL = p.hipR = 1.4;
      p.kneeL = 0.4;
      p.kneeR = 1.2;
      p.lean = -0.5;
      p.shL = p.shR = -0.4;
      p.headPitch = 0.4;
      break;
    }
    case 'point': {
      p.shR = 1.6;
      p.elR = 0.05;
      p.abR = 0.1;
      p.headYaw = 0.2;
      break;
    }
    default: {
      // idle: slow weight shift between legs, breathing in the chest, relaxed arms, occasional look-around
      const k = Math.sin(t * 0.6 + f.id);
      p.sway = k * 0.025;
      p.hipL = k * 0.05;
      p.kneeL = 0.05 + Math.max(0, k) * 0.12;
      p.kneeR = 0.05 + Math.max(0, -k) * 0.12;
      p.lean = Math.sin(t * 2.1 + f.id) * 0.018;
      p.headYaw = Math.sin(t * 0.3 + f.id * 2) * 0.5;
      p.headPitch = Math.sin(t * 0.23 + f.id) * 0.08;
      p.shL = p.shR = 0.05;
      p.abL = 0.1 + Math.sin(t * 2.1 + f.id) * 0.02;
      p.abR = p.abL;
      p.elL = 0.2;
      p.elR = 0.25;
    }
  }
  return p;
}

const _m = new THREE.Matrix4();
const _root = new THREE.Matrix4();
const _pelvis = new THREE.Matrix4();
const _chest = new THREE.Matrix4();
const _head = new THREE.Matrix4();
const _a = new THREE.Matrix4();
const _b = new THREE.Matrix4();
const _t = new THREE.Matrix4();
const _r = new THREE.Matrix4();
const _s = new THREE.Matrix4();
const _col = new THREE.Color();

function T(x: number, y: number, z: number): THREE.Matrix4 {
  return _t.makeTranslation(x, y, z);
}
function RX(a: number): THREE.Matrix4 {
  return _r.makeRotationX(a);
}

export class FigureSystem {
  figures: Figure[] = [];
  meshes = new Map<PartKind, THREE.InstancedMesh>();
  private counts = new Map<PartKind, number>();
  private nextId = 1;
  private frustum = new THREE.Frustum();
  private projScreen = new THREE.Matrix4();
  private sphere = new THREE.Sphere();
  drawn = 0;
  private dt = 1 / 60;

  constructor(
    scene: THREE.Scene,
    mats: Materials,
    capacity = 2400,
  ) {
    const cloth = new THREE.MeshStandardMaterial({ map: mats.fabricTex.map, bumpMap: mats.fabricTex.bump, bumpScale: 0.6, roughness: 0.88 });
    const skin = new THREE.MeshStandardMaterial({ roughness: 0.55 });
    const eye = new THREE.MeshStandardMaterial({ roughness: 0.2, color: 0xffffff });
    const metal = new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 1 });
    const cap = new THREE.CapsuleGeometry(0.5, 1, 4, 10);
    const sph = new THREE.SphereGeometry(0.5, 14, 10);
    const box = new THREE.BoxGeometry(1, 1, 1);
    const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
    const mk = (k: PartKind, g: THREE.BufferGeometry, m: THREE.Material, n: number) => {
      const im = new THREE.InstancedMesh(g, m, n);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = false;
      im.count = 0;
      im.setColorAt(0, new THREE.Color(1, 1, 1));
      scene.add(im);
      this.meshes.set(k, im);
    };
    mk('capCloth', cap, cloth, capacity * 4);
    mk('capSkin', cap, skin, capacity * 2);
    mk('sphCloth', sph, cloth, capacity * 2);
    mk('sphSkin', sph, skin, capacity * 2);
    mk('eye', sph, eye, capacity * 2);
    mk('boxCloth', box, cloth, capacity * 2);
    mk('cylCloth', cyl, cloth, capacity);
    mk('metal', sph, metal, capacity);
    this.meshes.get('eye')!.castShadow = false;
  }

  add(look: Look, simple = false): Figure {
    const f = new Figure(look, this.nextId++, simple);
    this.figures.push(f);
    return f;
  }

  remove(f: Figure): void {
    const i = this.figures.indexOf(f);
    if (i >= 0) this.figures.splice(i, 1);
  }

  private put(kind: PartKind, m: THREE.Matrix4, color: number): void {
    const im = this.meshes.get(kind)!;
    const n = this.counts.get(kind)!;
    if (n >= im.instanceMatrix.count) return;
    im.setMatrixAt(n, m);
    im.setColorAt(n, _col.setHex(color));
    this.counts.set(kind, n + 1);
  }

  /** part helper: parent * T(x,y,z) * S(sx,sy,sz) */
  private part(kind: PartKind, parent: THREE.Matrix4, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number): void {
    _m.copy(parent).multiply(T(x, y, z)).multiply(_s.makeScale(sx, sy, sz));
    this.put(kind, _m, color);
  }

  /** Crossfade into the target pose, then layer turn banking and landing squash on top. */
  private animate(f: Figure, dt: number, lod: boolean): Pose {
    const target = poseFor(f);
    let a = f.anim;
    if (!a) a = f.anim = { shown: { ...target }, from: { ...target }, blend: 1, state: f.state, yaw: f.yaw, bank: 0 };
    if (f.state !== a.state) {
      a.from = { ...a.shown };
      a.blend = 0;
      a.state = f.state;
    }
    a.blend = Math.min(1, a.blend + dt / BLEND_TIME);
    const w = lod ? 1 : a.blend * a.blend * (3 - 2 * a.blend);
    const p = a.shown;
    for (const k of POSE_KEYS) p[k] = a.from[k] + (target[k] - a.from[k]) * w;
    // lean into turns: yaw rate x ground speed, eased so a snapped NPC heading can't spike it
    let dy = f.yaw - a.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    a.yaw = f.yaw;
    const want = dt > 0 ? Math.max(-0.22, Math.min(0.22, (-dy / dt) * Math.min(f.speed, 7) * 0.012)) : 0;
    a.bank += (want - a.bank) * (1 - Math.exp(-dt * 8));
    p.bank += a.bank;
    if (f.land > 0.01) {
      const l = f.land;
      p.bob -= l * 0.16;
      p.hipL += l * 0.45;
      p.hipR += l * 0.45;
      p.kneeL += l * 0.8;
      p.kneeR += l * 0.8;
      p.lean += l * 0.25;
      p.abL += l * 0.3;
      p.abR += l * 0.3;
      f.land *= Math.exp(-dt * 7);
    } else f.land = 0;
    if (Math.abs(f.turn) > 0.01) {
      // plant before a sharp turn: drop the hips, push off the outside foot, shoulders lead the new heading
      const a = Math.abs(f.turn);
      p.sway += f.turn * 0.07;
      p.bank -= f.turn * 0.1;
      p.twist += f.turn * 0.3;
      p.headYaw += f.turn * 0.35;
      p.lean -= a * 0.12;
      p.bob -= a * 0.06;
      p.kneeL += a * 0.35;
      p.kneeR += a * 0.35;
      p.hipL += a * 0.2;
      p.hipR += a * 0.2;
      f.turn *= Math.exp(-dt * 9);
    } else f.turn = 0;
    if (f.settle > 0.01) {
      // coming to a stop: momentum tips the chest forward, knees soak it up, arms swing through
      const s = f.settle;
      p.lean += s * 0.14;
      p.bob -= s * 0.05;
      p.kneeL += s * 0.25;
      p.kneeR += s * 0.25;
      p.shL += s * 0.25;
      p.shR += s * 0.25;
      f.settle *= Math.exp(-dt * 6);
    } else f.settle = 0;
    return p;
  }

  update(camera: THREE.Camera, maxDist = 140, dt = 1 / 60): void {
    this.dt = Math.min(0.1, Math.max(0, dt));
    for (const k of this.meshes.keys()) this.counts.set(k, 0);
    this.projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreen);
    const camPos = (camera as THREE.PerspectiveCamera).position;
    this.drawn = 0;
    for (const f of this.figures) {
      if (!f.visible) continue;
      this.sphere.center.set(f.pos.x, f.pos.y + 0.9, f.pos.z);
      this.sphere.radius = 1.3;
      if (!this.frustum.intersectsSphere(this.sphere)) continue;
      const dist = camPos.distanceTo(this.sphere.center);
      if (dist > maxDist) continue;
      this.drawn++;
      this.writeFigure(f, f.simple || dist > 45);
    }
    for (const [k, im] of this.meshes) {
      im.count = this.counts.get(k)!;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }

  private writeFigure(f: Figure, lod: boolean): void {
    const L = f.look;
    const h = L.height;
    const b = L.build;
    const p = this.animate(f, this.dt, lod);
    _root
      .makeTranslation(f.pos.x, f.pos.y + f.yOffset, f.pos.z)
      .multiply(_a.makeRotationY(f.yaw))
      .multiply(_a.makeRotationZ(p.bank))
      .multiply(_s.makeScale(h, h, h));
    const hipH = 0.87 - p.sit * 0.42;
    _pelvis.copy(_root).multiply(T(p.sway, hipH + p.bob, 0)).multiply(_a.makeRotationY(p.hipYaw)).multiply(RX(p.lean * 0.3));
    _chest.copy(_pelvis).multiply(RX(p.lean)).multiply(_a.makeRotationY(p.twist));
    const torsoLen = 0.5;
    if (lod) {
      // distant: torso, head, two leg capsules
      this.part('capCloth', _chest, 0, torsoLen * 0.5, 0, 0.34 * b, 0.36, 0.26, L.shirt);
      this.part('sphSkin', _chest, 0, torsoLen + 0.2, 0, 0.3, 0.33, 0.3, L.skin);
      this.part('sphCloth', _chest, 0, torsoLen + 0.25, -0.02, 0.32, 0.27, 0.33, L.hat !== 'none' ? L.hatColor : L.hair);
      for (const side of [-1, 1]) {
        const hip = side < 0 ? p.hipL : p.hipR;
        _a.copy(_pelvis).multiply(T(side * 0.09, 0, 0)).multiply(RX(-hip));
        this.part('capCloth', _a, 0, -0.42, 0, 0.15, 0.44, 0.15, L.pants);
      }
      return;
    }
    // torso + hips: a broader ribcage over a narrower waist reads as a body, not a pill
    this.part('capCloth', _chest, 0, torsoLen * 0.45, 0, 0.32 * b, 0.34, 0.25, L.shirt);
    this.part('sphCloth', _chest, 0, torsoLen * 0.74, -0.005, 0.42 * b, 0.3, 0.28, L.shirt);
    this.part('capCloth', _pelvis, 0, 0.02, 0, 0.32 * b, 0.12, 0.24, L.skirt ? L.pants : L.pants);
    if (L.skirt) this.part('cylCloth', _pelvis, 0, -0.18, 0, 0.42 * b, 0.36, 0.34, L.pants);
    // neck + head
    this.part('capSkin', _chest, 0, torsoLen + 0.02, 0, 0.1, 0.07, 0.1, L.skin);
    // head scaled to ~1/6 of body height (was toy-like 1/5); every head part lives in this frame so it all follows
    _head
      .copy(_chest)
      .multiply(T(0, torsoLen + 0.18, 0))
      .multiply(_a.makeRotationY(p.headYaw))
      .multiply(RX(p.headPitch))
      .multiply(_s.makeScale(0.88, 0.88, 0.88));
    this.part('sphSkin', _head, 0, 0, 0, 0.31, 0.34, 0.31, L.skin);
    this.part('sphSkin', _head, 0, -0.01, 0.15, 0.06, 0.07, 0.06, L.skin); // nose
    this.part('sphSkin', _head, -0.155, 0.0, 0.0, 0.05, 0.08, 0.06, L.skin); // ears
    this.part('sphSkin', _head, 0.155, 0.0, 0.0, 0.05, 0.08, 0.06, L.skin);
    // blink every few seconds, staggered per figure
    const eyeH = (f.t + f.id * 1.7) % 4.2 < 0.12 ? 0.008 : 1;
    this.part('eye', _head, -0.055, 0.03, 0.135, 0.05, 0.06 * eyeH, 0.03, 0xf4f1ea);
    this.part('eye', _head, 0.055, 0.03, 0.135, 0.05, 0.06 * eyeH, 0.03, 0xf4f1ea);
    this.part('eye', _head, -0.055, 0.03, 0.149, 0.026, 0.032 * eyeH, 0.012, 0x1a1410);
    this.part('eye', _head, 0.055, 0.03, 0.149, 0.026, 0.032 * eyeH, 0.012, 0x1a1410);
    // mouth: a small dark line that widens when talking or cheering
    const open = f.state === 'talk' ? 0.012 + Math.abs(Math.sin(f.t * 9 + f.id)) * 0.02 : f.state === 'cheer' ? 0.03 : 0.01;
    this.part('eye', _head, 0, -0.078, 0.14, 0.075, open, 0.02, 0x5a2620);
    this.part('capCloth', _head, -0.06, 0.085, 0.13, 0.06, 0.012, 0.012, L.hair); // brows
    this.part('capCloth', _head, 0.06, 0.085, 0.13, 0.06, 0.012, 0.012, L.hair);
    // hair
    switch (L.hairStyle) {
      case 'bald':
        break;
      case 'bun':
        this.part('sphCloth', _head, 0, 0.05, -0.02, 0.33, 0.3, 0.33, L.hair);
        this.part('sphCloth', _head, 0, 0.13, -0.15, 0.14, 0.14, 0.14, L.hair);
        break;
      case 'long':
        this.part('sphCloth', _head, 0, 0.05, -0.02, 0.335, 0.31, 0.335, L.hair);
        this.part('capCloth', _head, 0, -0.12, -0.11, 0.3, 0.2, 0.12, L.hair);
        break;
      case 'curly':
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          this.part('sphCloth', _head, Math.cos(a) * 0.1, 0.1 + Math.sin(a * 2) * 0.02, Math.sin(a) * 0.08 - 0.03, 0.17, 0.16, 0.17, L.hair);
        }
        break;
      case 'tail':
        this.part('sphCloth', _head, 0, 0.05, -0.02, 0.33, 0.3, 0.33, L.hair);
        this.part('capCloth', _head, 0, -0.05, -0.19, 0.08, 0.22, 0.08, L.hair);
        break;
      default:
        this.part('sphCloth', _head, 0, 0.06, -0.025, 0.325, 0.27, 0.33, L.hair);
    }
    switch (L.hat) {
      case 'helmet':
        this.part('metal', _head, 0, 0.08, 0, 0.36, 0.26, 0.37, L.hatColor);
        this.part('cylCloth', _head, 0, 0.04, 0.0, 0.4, 0.02, 0.4, L.hatColor);
        break;
      case 'cap':
        this.part('sphCloth', _head, 0, 0.09, -0.01, 0.33, 0.22, 0.33, L.hatColor);
        this.part('boxCloth', _head, 0, 0.07, 0.17, 0.2, 0.015, 0.14, L.hatColor);
        break;
      case 'wrap':
        this.part('sphCloth', _head, 0, 0.1, -0.01, 0.35, 0.24, 0.35, L.hatColor);
        break;
      case 'tall':
        this.part('cylCloth', _head, 0, 0.2, 0, 0.24, 0.24, 0.24, L.hatColor);
        this.part('cylCloth', _head, 0, 0.1, 0, 0.36, 0.02, 0.36, L.hatColor);
        break;
      case 'thimble':
        this.part('metal', _head, 0, 0.12, 0, 0.3, 0.3, 0.3, L.hatColor);
        break;
      case 'goggles':
        this.part('metal', _head, -0.06, 0.11, 0.12, 0.08, 0.06, 0.05, L.hatColor);
        this.part('metal', _head, 0.06, 0.11, 0.12, 0.08, 0.06, 0.05, L.hatColor);
        break;
    }
    // accessories on chest
    if (L.apron !== undefined) this.part('boxCloth', _chest, 0, 0.08, 0.13, 0.3 * b, 0.55, 0.02, L.apron);
    if (L.pack !== undefined) this.part('boxCloth', _chest, 0, 0.28, -0.2, 0.28, 0.32, 0.16, L.pack);
    if (L.cape !== undefined) this.part('boxCloth', _chest, 0, 0.0, -0.15, 0.4 * b, 0.95, 0.03, L.cape);
    if (L.sash !== undefined) {
      _a.copy(_chest).multiply(T(0, 0.3, 0.13)).multiply(_b.makeRotationZ(0.7));
      this.part('boxCloth', _a, 0, 0, 0, 0.07, 0.6, 0.02, L.sash);
    }
    if (L.scarf !== undefined) this.part('capCloth', _chest, 0, torsoLen - 0.02, 0.01, 0.26, 0.08, 0.24, L.scarf);
    if (L.patches !== undefined && L.pack !== undefined) {
      this.part('boxCloth', _chest, 0.07, 0.34, -0.285, 0.1, 0.1, 0.012, L.patches);
      this.part('boxCloth', _chest, -0.07, 0.2, -0.285, 0.08, 0.09, 0.012, 0xd9a441);
      this.part('boxCloth', _chest, 0.05, 0.16, -0.285, 0.07, 0.06, 0.012, 0x6a8fb0);
    }
    if (L.armour !== undefined) {
      this.part('metal', _chest, 0, 0.3, 0.12, 0.34 * b, 0.36, 0.1, L.armour); // ring-pull breastplate
      this.part('metal', _chest, 0, torsoLen + 0.0, 0, 0.25, 0.06, 0.23, 0xd8dce0); // thimble-rim collar
      for (const s of [-1, 1]) this.part('metal', _chest, s * 0.23 * b, torsoLen - 0.03, 0, 0.21, 0.08, 0.21, 0xb8322a); // bottle-cap pauldrons
      _a.copy(_chest).multiply(T(0, 0.05, 0.135)).multiply(_b.makeRotationZ(-0.6));
      this.part('boxCloth', _a, 0, 0, 0, 0.07, 0.55, 0.02, 0x6a1f2d); // tally sash
    }
    if (L.bow && f.held !== 'bow') {
      _a.copy(_chest).multiply(T(0, 0.25, -0.2)).multiply(_b.makeRotationZ(0.55));
      this.part('boxCloth', _a, 0, 0, 0, 0.04, 1.25, 0.04, 0x8a5a2b);
      this.part('boxCloth', _a, 0, 0, -0.07, 0.008, 1.15, 0.008, 0xece4d2);
    }
    if (L.bow) {
      this.part('cylCloth', _pelvis, -0.2, 0.08, -0.06, 0.1, 0.38, 0.1, 0x6b4a2b); // quiver
      for (const dx of [-0.025, 0.02]) this.part('boxCloth', _pelvis, -0.2 + dx, 0.32, -0.06, 0.015, 0.14, 0.015, 0xe6cfa3);
    }
    // arms
    const shW = 0.19 * b;
    for (const side of [1, -1]) {
      const sh = side > 0 ? p.shL : p.shR;
      const ab = side > 0 ? p.abL : p.abR;
      const el = side > 0 ? p.elL : p.elR;
      _a.copy(_chest).multiply(T(side * shW, torsoLen - 0.06, 0)).multiply(_b.makeRotationZ(side * ab)).multiply(RX(-sh));
      const sleeve = side < 0 && L.sleeveR !== undefined ? L.sleeveR : L.shirt;
      this.part('capCloth', _a, 0, -0.13, 0, 0.12, 0.17, 0.12, sleeve);
      _b.copy(_a).multiply(T(0, -0.26, 0)).multiply(RX(-el));
      this.part(L.longSleeves ? 'capCloth' : 'capSkin', _b, 0, -0.12, 0, 0.1, 0.16, 0.1, L.longSleeves ? sleeve : L.skin);
      this.part('sphSkin', _b, 0, -0.27, 0.01, 0.1, 0.11, 0.08, L.skin);
      // held weapon: the forearm frame's -y runs out through the fist
      if (side < 0 && f.held === 'pick') {
        this.part('boxCloth', _b, 0, -0.75, 0.03, 0.05, 1.5, 0.05, 0xe6cfa3);
        this.part('boxCloth', _b, 0, -1.55, 0.03, 0.03, 0.18, 0.03, 0xc9a877);
      } else if (side < 0 && f.held === 'hook') {
        // collector hooks are oddly bright and rust-free; the Tallymen's are worn grey
        const hc = L.armour !== undefined ? 0xeef2f6 : 0x8a8f96;
        this.part('boxCloth', _b, 0, -0.6, 0.03, 0.05, 1.0, 0.05, hc);
        this.part('boxCloth', _b, 0, -1.08, 0.12, 0.05, 0.05, 0.25, hc);
      } else if (side > 0 && f.held === 'bow') {
        this.part('boxCloth', _b, 0, -0.28, 0.02, 0.045, 0.045, 1.25, 0x8a5a2b);
        this.part('boxCloth', _b, 0, -0.16, 0.02, 0.008, 0.008, 1.15, 0xece4d2);
      } else if (side > 0 && f.held === 'sling') {
        this.part('boxCloth', _b, 0, -0.42, 0.02, 0.04, 0.3, 0.04, 0x9aa0a6);
        this.part('boxCloth', _b, -0.05, -0.62, 0.02, 0.03, 0.16, 0.03, 0x9aa0a6);
        this.part('boxCloth', _b, 0.05, -0.62, 0.02, 0.03, 0.16, 0.03, 0x9aa0a6);
      }
    }
    // legs
    for (const side of [1, -1]) {
      const hip = side > 0 ? p.hipL : p.hipR;
      const kn = side > 0 ? p.kneeL : p.kneeR;
      _a.copy(_pelvis).multiply(T(side * 0.09, 0, 0)).multiply(RX(-hip));
      this.part('capCloth', _a, 0, -0.2, 0, 0.15, 0.25, 0.15, L.pants);
      _b.copy(_a).multiply(T(0, -0.42, 0)).multiply(RX(kn));
      this.part('capCloth', _b, 0, -0.19, 0, 0.12, 0.23, 0.12, L.pants);
      if (L.armour !== undefined) this.part('metal', _b, 0, -0.18, 0.07, 0.13, 0.22, 0.06, 0xd8dde2); // blister-foil greaves
      // ankle: keep the sole parallel to the ground (cancel thigh + shin pitch), then add toe-off / pointed toes
      const ank = hip - kn + (side > 0 ? p.ankleL : p.ankleR);
      _b.multiply(T(0, -0.38, 0)).multiply(RX(ank));
      this.part('boxCloth', _b, 0, -0.03, 0.05, 0.11, 0.07, 0.24, L.shoes);
    }
    if (f.carry !== null) this.part('boxCloth', _chest, 0, 0.28, 0.42, 0.42, 0.32, 0.32, f.carry);
  }
}

// ---------- looks ----------
export const SKIN = [0xf1c9a5, 0xe0ac84, 0xc68a60, 0x9a6440, 0x6e4529, 0x4f321f, 0xf5d7bd];
export const HAIR = [0x2a1d14, 0x4a2f1c, 0x7a4b25, 0xb98a4b, 0x1a1a1a, 0x8c8c8c, 0xd8cfc0, 0x7b2e1e];
