// Room-floor creatures: the skirting mouse on its run to the crumbs by the tin, and the house cat's crossings along
// the wall. Neither is saved: the mouse resets to its hole and the cat to its next crossing on load.
import * as THREE from 'three';
import type { Game } from '../game';
import type { Body } from '../physics/collision';
import { FLOOR_Y, MOUSE, outside } from '../world/outside';

type MouseState = 'home' | 'run' | 'eat' | 'back' | 'notice' | 'hunt' | 'rear' | 'lunge' | 'recover' | 'flee' | 'dead';
type CatState = 'away' | 'warn' | 'cross';

const M_HP = 120;
const CAT_Z = -34; // the cat walks the gap between the cabinet and the wall
const CAT_SPEED = 20;

/** places the cat's paw can't reach: under the cabinet, up off the floor, or under the leaning ruler */
export function catCover(p: THREE.Vector3): boolean {
  if (p.z > -14 || p.y > FLOOR_Y + 2.5) return true;
  const rulerY = -20 * ((p.x + 12) / 40); // the ruler runs from (-12, 0) down to (28, -20) at z -21
  return Math.abs(p.z + 21) < 1.6 && p.x > -12 && rulerY - p.y > 2;
}

export class Critters {
  mouse: MouseState = 'home';
  hp = M_HP;
  mb: Body = { pos: MOUSE.hole.clone(), vel: new THREE.Vector3(), radius: 1.4, height: 2.4, grounded: false, ground: null };
  cat: CatState = 'away';
  /** sim time of the next crossing (set when you first step onto the floor) */
  catAt = Infinity;
  catX = 0;
  private mt = 0;
  private homeFor = 20;
  private myaw = 0;
  private gait = 0;
  private flash = 0;
  private hit = false;
  private lungeDir = new THREE.Vector3();
  private respawnAt = 0;
  private ct = 0;
  private catDir = -1;
  private swatted = false;
  private thud = 0;
  private mg = new THREE.Group();
  private mBody = new THREE.Group();
  private mMat: THREE.MeshStandardMaterial;
  private mFeet: THREE.Mesh[] = [];
  private cg = new THREE.Group();
  private cLegs: THREE.Group[] = [];
  private cTail: THREE.Mesh[] = [];

  constructor(private g: Game) {
    // ---- the mouse: about eight centimetres of grey-brown, pink ears and a long tail ----
    this.mMat = new THREE.MeshStandardMaterial({ color: 0x7a6a5a, roughness: 0.9, emissive: new THREE.Color(0) });
    const pink = new THREE.MeshStandardMaterial({ color: 0xd99a9a, roughness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 });
    const add = (m: THREE.Mesh, p: number[], s?: number[]) => {
      m.position.set(p[0], p[1], p[2]);
      if (s) m.scale.set(s[0], s[1], s[2]);
      m.castShadow = true;
      this.mBody.add(m);
      return m;
    };
    add(new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), this.mMat), [0, 1.3, 0], [1.3, 1.1, 2.3]);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 10), this.mMat), [0, 1.6, 2.2], [0.9, 0.85, 1.25]);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), pink), [0, 1.45, 3.35]);
    for (const s of [-1, 1]) {
      add(new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), pink), [s * 0.65, 2.4, 1.95], [1, 1, 0.3]);
      add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), dark), [s * 0.45, 1.85, 2.95]);
    }
    const tail = add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.16, 5, 6), pink), [0, 0.7, -4.4]);
    tail.rotation.x = Math.PI / 2 - 0.15;
    for (const [x, z] of [[-0.8, 1.3], [0.8, 1.3], [-0.9, -1.2], [0.9, -1.2]]) this.mFeet.push(add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), pink), [x, 0.25, z], [1, 0.6, 1.4]));
    this.mg.add(this.mBody);
    g.scene.add(this.mg);

    // ---- the house cat: ginger, enormous, never looks down ----
    const fur = new THREE.MeshStandardMaterial({ color: 0xd08a4a, roughness: 0.95 });
    const stripe = new THREE.MeshStandardMaterial({ color: 0x9a5a28, roughness: 0.95 });
    const part = (m: THREE.Mesh, p: number[], s?: number[], parent: THREE.Object3D = this.cg) => {
      m.position.set(p[0], p[1], p[2]);
      if (s) m.scale.set(s[0], s[1], s[2]);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    part(new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), fur), [0, 15, 0], [16, 7, 6.5]);
    for (let i = 0; i < 5; i++) part(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 9), stripe), [-8 + i * 4, 21.6, 0]);
    part(new THREE.Mesh(new THREE.SphereGeometry(6, 20, 14), fur), [18, 21, 0]);
    part(new THREE.Mesh(new THREE.SphereGeometry(2.4, 12, 8), new THREE.MeshStandardMaterial({ color: 0xf0e0c8, roughness: 1 })), [23, 19, 0], [1, 0.8, 1.2]);
    for (const s of [-1, 1]) {
      part(new THREE.Mesh(new THREE.ConeGeometry(2.2, 4.5, 4), fur), [17, 27.5, s * 3.2]);
      part(new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), new THREE.MeshStandardMaterial({ color: 0x9ab83a, roughness: 0.2, emissive: new THREE.Color(0x1a2a00) })), [22.6, 22.5, s * 2.3]);
    }
    const legGeo = new THREE.CylinderGeometry(1.7, 1.5, 13, 10);
    for (const [x, z] of [[11, 3.5], [11, -3.5], [-11, 3.5], [-11, -3.5]]) {
      const hip = new THREE.Group();
      hip.position.set(x, 13, z);
      part(new THREE.Mesh(legGeo, fur), [0, -6.5, 0], undefined, hip);
      part(new THREE.Mesh(new THREE.SphereGeometry(2, 10, 8), fur), [0.8, -12.8, 0], [1.3, 0.6, 1], hip);
      this.cLegs.push(hip);
      this.cg.add(hip);
    }
    const tGeo = new THREE.CylinderGeometry(1.1, 1.3, 4.2, 8);
    for (let i = 0; i < 6; i++) this.cTail.push(part(new THREE.Mesh(tGeo, i % 2 ? stripe : fur), [0, 0, 0]));
    this.cg.visible = false;
    g.scene.add(this.cg);
  }

  get mouseOut(): boolean {
    return this.mouse !== 'home' && this.mouse !== 'dead';
  }

  private setM(s: MouseState): void {
    this.mouse = s;
    this.mt = 0;
  }

  /** the mouse as a target for jabs and sling shots */
  targets(): { c: THREE.Vector3; r: number; assist: boolean; hurt: (n: number, push: THREE.Vector3) => void }[] {
    if (!this.mouseOut) return [];
    return [{ c: this.mb.pos.clone().add(new THREE.Vector3(0, 1.3, 0)), r: 1.8, assist: true, hurt: (n, push) => this.hurt(n, push) }];
  }

  private hurt(n: number, push: THREE.Vector3): void {
    const g = this.g;
    // caught shaking its head after a lunge: double damage
    this.hp -= this.mouse === 'recover' ? n * 2 : n;
    if (this.mouse === 'recover') this.setM('hunt'); // one punish per opening: the hit snaps it out of it
    this.flash = 0.15;
    if (this.hp <= 0) {
      this.setM('dead');
      this.respawnAt = g.simTime + 400;
      g.state.add('fabric', 2, true);
      g.state.add('meat', 2, true);
      g.bus.emit({ type: 'toast', text: 'The skirting mouse lies still. You take a tuft of fur (2 fabric) and 2 meat.', kind: 'good' });
      return;
    }
    if (['run', 'eat', 'back', 'notice'].includes(this.mouse)) this.setM('hunt');
    this.mb.vel.add(push.clone().multiplyScalar(0.25));
  }

  update(dt: number): void {
    this.updateMouse(dt);
    this.updateCat(dt);
    this.render(dt);
  }

  private updateMouse(dt: number): void {
    const g = this.g, now = g.simTime, pp = g.player.body.pos, b = this.mb;
    const toast = (text: string, kind: 'info' | 'bad' = 'info') => g.bus.emit({ type: 'toast', text, kind });
    if (this.mouse === 'dead') {
      if (now > this.respawnAt && !outside(pp)) {
        this.hp = M_HP;
        this.homeFor = 30;
        this.setM('home');
      }
      return;
    }
    this.mt += dt;
    this.flash = Math.max(0, this.flash - dt);
    const playerOut = outside(pp) && pp.y < FLOOR_Y + 3 && g.mode === 'play';
    const dP = Math.hypot(pp.x - b.pos.x, pp.z - b.pos.z);
    const fromHole = Math.hypot(pp.x - MOUSE.hole.x, pp.z - MOUSE.hole.z);
    const wantsOut = !playerOut || fromHole > 30 || this.hp < M_HP * 0.15 || this.cat !== 'away';
    const steer = (t: THREE.Vector3, speed: number) => {
      const sx = t.x - b.pos.x, sz = t.z - b.pos.z, l = Math.hypot(sx, sz) || 1;
      b.vel.x += ((sx / l) * speed - b.vel.x) * Math.min(1, dt * 8);
      b.vel.z += ((sz / l) * speed - b.vel.z) * Math.min(1, dt * 8);
      this.myaw = Math.atan2(sx, sz);
      return l;
    };
    const stop = () => {
      b.vel.x *= Math.exp(-dt * 10);
      b.vel.z *= Math.exp(-dt * 10);
    };
    const face = () => (this.myaw = Math.atan2(pp.x - b.pos.x, pp.z - b.pos.z));
    const flee = () => {
      if (this.mouse !== 'flee') toast('The skirting mouse remembers somewhere else to be.');
      this.setM('flee');
    };

    switch (this.mouse) {
      case 'home':
        b.pos.copy(MOUSE.hole);
        b.vel.set(0, 0, 0);
        this.hp = Math.min(M_HP, this.hp + 6 * dt);
        if (this.mt > this.homeFor && this.cat === 'away') this.setM('run');
        break;
      case 'run':
        if (this.cat !== 'away') flee();
        else if (steer(MOUSE.crumbs, 4) < 1) this.setM('eat');
        else if (playerOut && dP < 9) this.setM('notice');
        break;
      case 'eat':
        stop();
        if (this.cat !== 'away') flee();
        else if (this.mt > 20) this.setM('back');
        else if (playerOut && dP < 7) this.setM('notice');
        break;
      case 'back':
        if (this.cat !== 'away') flee();
        else if (steer(MOUSE.hole, 5) < 1) {
          this.homeFor = 70;
          this.setM('home');
        }
        break;
      case 'notice':
        stop();
        face();
        if (this.mt > 0.5) {
          toast('The skirting mouse has seen you. It was here first.', 'bad');
          g.bus.emit({ type: 'sfx', name: 'skitter', vol: 0.8 });
          this.setM('hunt');
        }
        break;
      case 'hunt':
        if (wantsOut) flee();
        else {
          steer(pp, 5.5);
          if (dP < 4.5 && this.mt > 0.4) {
            // it commits to where you stand now: move during the tell and the lunge misses
            this.lungeDir.set(pp.x - b.pos.x, 0, pp.z - b.pos.z).normalize();
            this.setM('rear');
          }
        }
        break;
      case 'rear':
        // the tell: up on its hind legs, whiskers out, a squeak; then a straight lunge where you stood
        stop();
        this.myaw = Math.atan2(this.lungeDir.x, this.lungeDir.z);
        if (this.mt > 0.8) {
          this.hit = false;
          g.bus.emit({ type: 'sfx', name: 'skitter' });
          this.setM('lunge');
        }
        break;
      case 'lunge':
        b.vel.x = this.lungeDir.x * 16;
        b.vel.z = this.lungeDir.z * 16;
        if (!this.hit && Math.hypot(pp.x - b.pos.x, pp.z - b.pos.z) < 2.2 && Math.abs(pp.y - b.pos.y) < 2) {
          this.hit = true;
          g.underfall.hurtPlayer(18);
        }
        if (this.mt > 0.45) this.setM('recover');
        break;
      case 'recover':
        // it skids and sits shaking its head: the opening
        stop();
        if (this.mt > 1.5) this.setM('hunt');
        break;
      case 'flee':
        if (steer(MOUSE.hole, 9) < 1.2) {
          this.homeFor = 60;
          this.setM('home');
        }
        break;
    }
    if (this.mouseOut) {
      const before = b.pos.clone();
      g.col.moveBody(b, dt, 0.8);
      this.gait += before.distanceTo(b.pos) * 2;
    }
  }

  private updateCat(dt: number): void {
    const g = this.g, now = g.simTime, pp = g.player.body.pos;
    const onFloor = outside(pp) && pp.y < FLOOR_Y + 3 && g.mode === 'play';
    const toast = (text: string, kind: 'info' | 'bad' = 'info') => g.bus.emit({ type: 'toast', text, kind });
    this.ct += dt;
    switch (this.cat) {
      case 'away':
        if (!isFinite(this.catAt)) {
          if (onFloor) this.catAt = now + 120;
        } else if (now > this.catAt) {
          if (!onFloor) this.catAt = now + 30; // it only matters if someone is down there to see it
          else {
            this.catDir = -this.catDir;
            this.catX = -this.catDir * 125;
            this.swatted = false;
            this.cat = 'warn';
            this.ct = 0;
            toast('The floor thrums. Something heavy is coming along the wall.', 'bad');
          }
        }
        break;
      case 'warn':
        g.candy.shake = Math.max(g.candy.shake, 0.08);
        if (this.ct > 4) {
          this.cat = 'cross';
          this.ct = 0;
        }
        break;
      case 'cross': {
        this.catX += this.catDir * CAT_SPEED * dt;
        const near = Math.abs(pp.x - this.catX) < 40;
        if (near && onFloor) g.candy.shake = Math.max(g.candy.shake, 0.18);
        if (!this.swatted && onFloor && Math.abs(pp.x - this.catX) < 9 && !catCover(pp)) {
          this.swatted = true;
          g.underfall.hurtPlayer(40);
          const pb = g.player.body;
          pb.vel.set(this.catDir * 8, 11, 20); // batted towards the cabinet
          pb.grounded = false;
          toast('The house cat noticed you. Only for a moment.', 'bad');
        }
        if (Math.abs(this.catX) > 125) {
          this.cat = 'away';
          this.catAt = now + 180 + Math.random() * 60;
          if (onFloor) toast('The house cat goes by. It did not look down.');
        }
        break;
      }
    }
    // a slow thud-thud while it is near
    if (this.cat !== 'away') {
      this.thud -= dt;
      if (this.thud <= 0) {
        this.thud = 0.9;
        g.bus.emit({ type: 'sfx', name: 'rumble', vol: this.cat === 'warn' ? 0.3 : 0.6 });
      }
    }
  }

  private render(dt: number): void {
    const now = this.g.simTime;
    // mouse
    this.mg.visible = this.mouseOut;
    if (this.mouseOut) {
      const b = this.mb;
      this.mg.position.copy(b.pos);
      this.mg.rotation.y = this.myaw;
      const rear = this.mouse === 'rear';
      this.mBody.rotation.x = rear ? -0.7 : 0;
      this.mBody.position.y = rear ? 0.6 : 0;
      // unbothered at the crumbs it stops to wash its face
      const wash = this.mouse === 'eat' && Math.sin(now * 0.8) > 0.6;
      this.mBody.rotation.x += wash ? -0.35 + Math.sin(now * 14) * 0.06 : 0;
      this.mBody.rotation.z = this.mouse === 'recover' ? Math.sin(now * 18) * 0.15 : 0;
      this.mFeet.forEach((f, i) => (f.position.y = 0.25 + Math.max(0, Math.sin(this.gait + i * Math.PI * 0.5)) * 0.3));
      this.mMat.emissive.setRGB(this.flash * 4, this.flash * 2, this.flash);
    }
    // cat
    this.cg.visible = this.cat === 'cross';
    if (this.cat === 'cross') {
      // it steps over the biscuit tin
      const overTin = Math.max(0, 1 - Math.abs(this.catX - 34) / 14) * 5;
      this.cg.position.set(this.catX, FLOOR_Y + overTin, CAT_Z);
      this.cg.rotation.y = this.catDir > 0 ? 0 : Math.PI;
      const ph = (this.catX / 10) * this.catDir;
      this.cLegs.forEach((l, i) => (l.rotation.z = Math.sin(ph + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.35));
      for (let i = 0; i < this.cTail.length; i++) {
        const a = 0.5 + i * 0.22 + Math.sin(now * 2 + i * 0.5) * 0.08;
        const x = -16 - Math.cos(0.5) * 2 - i * 3.2 * Math.cos(a * 0.6), y = 16 + i * 3.4 * Math.sin(a * 0.6);
        this.cTail[i].position.set(x, y, 0);
        this.cTail[i].rotation.z = Math.PI / 2 - a * 0.6;
      }
    }
    void dt;
  }

  /** test/debug view */
  debug(): { mouse: MouseState; hp: number; pos: number[]; cat: CatState; catX: number; catAt: number } {
    return { mouse: this.mouse, hp: Math.round(this.hp), pos: this.mb.pos.toArray().map((v) => +v.toFixed(1)), cat: this.cat, catX: +this.catX.toFixed(1), catAt: +this.catAt.toFixed(1) };
  }
}
