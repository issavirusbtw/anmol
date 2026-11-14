import type { V3 } from './builder';

/** A local coordinate frame (translation + yaw) for placing assemblies. */
export class Frame {
  readonly c: number;
  readonly s: number;
  constructor(
    public x: number,
    public y: number,
    public z: number,
    public ry = 0,
  ) {
    this.c = Math.cos(ry);
    this.s = Math.sin(ry);
  }
  p(lx: number, ly: number, lz: number): V3 {
    return [this.x + lx * this.c + lz * this.s, this.y + ly, this.z - lx * this.s + lz * this.c];
  }
  r(rx = 0, ry = 0, rz = 0): V3 {
    return [rx, this.ry + ry, rz];
  }
  sub(lx: number, ly: number, lz: number, ry = 0): Frame {
    const [x, y, z] = this.p(lx, ly, lz);
    return new Frame(x, y, z, this.ry + ry);
  }
}
