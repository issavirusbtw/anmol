// Procedural canvas textures. All deterministic from a seed.
import * as THREE from 'three';
import { Rng } from '../core/rng';

export type Canvas = HTMLCanvasElement;

function makeCanvas(w: number, h = w): Canvas {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Tileable value noise sampled into a Float32Array (0..1). */
export function valueNoise(size: number, cells: number, rng: Rng): Float32Array {
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = rng.next();
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const fy = (y / size) * cells;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    const sy = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const sx = tx * tx * (3 - 2 * tx);
      const a = g[(y0 % cells) * cells + (x0 % cells)];
      const b = g[(y0 % cells) * cells + ((x0 + 1) % cells)];
      const c = g[((y0 + 1) % cells) * cells + (x0 % cells)];
      const d = g[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)];
      out[y * size + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}

export function fbm(size: number, rng: Rng, base = 4, octaves = 4, gain = 0.5): Float32Array {
  const out = new Float32Array(size * size);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const n = valueNoise(size, base << o, rng);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    total += amp;
    amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function writeGray(c: Canvas, f: (i: number, x: number, y: number) => number): void {
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(c.width, c.height);
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++) {
      const i = y * c.width + x;
      const v = Math.max(0, Math.min(255, f(i, x, y) * 255));
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
}

function writeRGB(c: Canvas, f: (i: number, x: number, y: number) => [number, number, number]): void {
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(c.width, c.height);
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++) {
      const i = y * c.width + x;
      const [r, g, b] = f(i, x, y);
      img.data[i * 4] = Math.max(0, Math.min(255, r * 255));
      img.data[i * 4 + 1] = Math.max(0, Math.min(255, g * 255));
      img.data[i * 4 + 2] = Math.max(0, Math.min(255, b * 255));
      img.data[i * 4 + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
}

export function toTex(c: Canvas, srgb: boolean, repeat = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

export interface TexSet {
  map: THREE.Texture;
  bump?: THREE.Texture;
  rough?: THREE.Texture;
}

// ---------- individual generators ----------

export function cardboard(size: number, rng: Rng): TexSet {
  const n = fbm(size, rng, 4, 5);
  const fib = valueNoise(size, size / 4, rng);
  const col = makeCanvas(size);
  const bump = makeCanvas(size);
  writeRGB(col, (i, x, y) => {
    const fibre = (fib[i] - 0.5) * 0.12;
    const v = 0.82 + (n[i] - 0.5) * 0.28 + fibre;
    // faint corrugation ghosting through the liner
    const ghost = Math.sin((x / size) * Math.PI * 2 * 24) * 0.02;
    return [v + ghost, v * 0.94 + ghost, v * 0.86 + ghost];
  });
  const ctx = col.getContext('2d')!;
  // water stains and scuffs, localised not uniform
  for (let k = 0; k < 5; k++) {
    const x = rng.range(0, size), y = rng.range(0, size), r = rng.range(size * 0.05, size * 0.16);
    const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r);
    g.addColorStop(0, 'rgba(90,60,30,0)');
    g.addColorStop(0.85, 'rgba(90,60,30,0.10)');
    g.addColorStop(1, 'rgba(90,60,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  // printed fragments of a shipping box
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#3b3a6a';
  ctx.font = `bold ${size * 0.045}px Arial, sans-serif`;
  ctx.save();
  ctx.translate(size * 0.12, size * 0.78);
  ctx.rotate(-0.02);
  ctx.fillText('THIS SIDE UP', 0, 0);
  ctx.restore();
  ctx.font = `${size * 0.03}px Arial, sans-serif`;
  ctx.fillText('▲ ▲  KEEP DRY', size * 0.62, size * 0.22);
  ctx.globalAlpha = 1;
  writeGray(bump, (i, x) => 0.5 + (fib[i] - 0.5) * 0.4 + Math.sin((x / size) * Math.PI * 2 * 24) * 0.12);
  return { map: toTex(col, true), bump: toTex(bump, false) };
}

export function corrugated(size: number, rng: Rng): TexSet {
  const n = fbm(size, rng, 4, 4);
  const col = makeCanvas(size);
  const bump = makeCanvas(size);
  const flutes = 16;
  writeRGB(col, (i, x) => {
    const s = Math.sin((x / size) * Math.PI * 2 * flutes);
    const v = 0.7 + s * 0.08 + (n[i] - 0.5) * 0.2;
    return [v, v * 0.9, v * 0.75];
  });
  writeGray(bump, (i, x) => 0.5 + Math.sin((x / size) * Math.PI * 2 * flutes) * 0.45);
  return { map: toTex(col, true), bump: toTex(bump, false) };
}

export function paintedBoard(size: number, rng: Rng): TexSet {
  // white base with brush strokes (tinted by vertex colour)
  const n = fbm(size, rng, 3, 4);
  const col = makeCanvas(size);
  const fine = valueNoise(size, 96, rng);
  writeRGB(col, (i, x, y) => {
    const stroke = Math.sin(y * 0.9 + n[i] * 22 + fine[i] * 3) * 0.018;
    const v = 0.86 + stroke + (n[i] - 0.5) * 0.16 + (fine[i] - 0.5) * 0.05;
    return [v, v, v];
  });
  const ctx = col.getContext('2d')!;
  // chipped paint showing cardboard
  for (let k = 0; k < 30; k++) {
    ctx.fillStyle = `rgba(160,120,70,${rng.range(0.25, 0.6)})`;
    const x = rng.range(0, size), y = rng.range(0, size);
    ctx.beginPath();
    ctx.ellipse(x, y, rng.range(2, 9), rng.range(1, 5), rng.range(0, 3), 0, Math.PI * 2);
    ctx.fill();
  }
  const bump = makeCanvas(size);
  writeGray(bump, (i, x, y) => 0.5 + Math.sin(y * 0.9 + n[i] * 22 + fine[i] * 3) * 0.12 + (fine[i] - 0.5) * 0.2);
  return { map: toTex(col, true), bump: toTex(bump, false) };
}

export function foil(size: number, rng: Rng): TexSet {
  const bump = makeCanvas(size);
  const ctx = bump.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  // irregular crease polylines
  for (let k = 0; k < 70; k++) {
    let x = rng.range(0, size), y = rng.range(0, size);
    let a = rng.range(0, Math.PI * 2);
    ctx.strokeStyle = rng.chance(0.5) ? `rgba(255,255,255,${rng.range(0.2, 0.6)})` : `rgba(0,0,0,${rng.range(0.2, 0.6)})`;
    ctx.lineWidth = rng.range(0.6, 2.4);
    ctx.beginPath();
    ctx.moveTo(x, y);
    const segs = rng.int(2, 6);
    for (let s = 0; s < segs; s++) {
      a += rng.range(-0.7, 0.7);
      const l = rng.range(size * 0.05, size * 0.25);
      x += Math.cos(a) * l;
      y += Math.sin(a) * l;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // broad facets
  const n = fbm(size, rng, 3, 2);
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < size * size; i++) {
    const f = (Math.floor(n[i] * 7) / 7 - 0.5) * 80;
    img.data[i * 4] = Math.max(0, Math.min(255, img.data[i * 4] + f));
    img.data[i * 4 + 1] = img.data[i * 4];
    img.data[i * 4 + 2] = img.data[i * 4];
  }
  ctx.putImageData(img, 0, 0);
  const col = makeCanvas(size);
  writeRGB(col, (i) => {
    const v = 0.85 + (n[i] - 0.5) * 0.15;
    return [v, v, v * 1.02];
  });
  const rough = makeCanvas(size);
  writeGray(rough, (i) => 0.18 + n[i] * 0.3);
  return { map: toTex(col, true), bump: toTex(bump, false), rough: toTex(rough, false) };
}

export function fabric(size: number, rng: Rng): TexSet {
  const n = fbm(size, rng, 4, 3);
  const col = makeCanvas(size);
  const bump = makeCanvas(size);
  const period = 8;
  writeRGB(col, (i, x, y) => {
    const wx = Math.sin((x / period) * Math.PI * 2);
    const wy = Math.sin((y / period) * Math.PI * 2);
    const over = (Math.floor(x / (period / 2)) + Math.floor(y / (period / 2))) % 2 === 0 ? wx : wy;
    const v = 0.82 + over * 0.07 + (n[i] - 0.5) * 0.14;
    return [v, v, v];
  });
  writeGray(bump, (i, x, y) => {
    const wx = Math.sin((x / period) * Math.PI * 2);
    const wy = Math.sin((y / period) * Math.PI * 2);
    const over = (Math.floor(x / (period / 2)) + Math.floor(y / (period / 2))) % 2 === 0 ? wx : wy;
    return 0.5 + over * 0.4;
  });
  return { map: toTex(col, true), bump: toTex(bump, false) };
}

export function wood(size: number, rng: Rng, dark: boolean): TexSet {
  const n = fbm(size, rng, 2, 4);
  const fine = valueNoise(size, 64, rng);
  const col = makeCanvas(size);
  const bump = makeCanvas(size);
  writeRGB(col, (i, x, y) => {
    const ring = Math.sin((y / size) * Math.PI * 2 * 9 + n[i] * 9) * 0.5 + 0.5;
    const grain = (fine[i] - 0.5) * 0.12;
    const v = (dark ? 0.42 : 0.82) + ring * (dark ? 0.12 : 0.1) + grain;
    return dark ? [v * 0.85, v * 0.58, v * 0.38] : [v, v * 0.82, v * 0.6];
  });
  writeGray(bump, (i, x, y) => 0.5 + Math.sin((y / size) * Math.PI * 2 * 9 + n[i] * 9) * 0.15 + (fine[i] - 0.5) * 0.3);
  return { map: toTex(col, true), bump: toTex(bump, false) };
}

export function plastic(size: number, rng: Rng): TexSet {
  const col = makeCanvas(size);
  writeRGB(col, () => [0.92, 0.92, 0.92]);
  const rough = makeCanvas(size);
  const ctx = rough.getContext('2d')!;
  ctx.fillStyle = '#5a5a5a';
  ctx.fillRect(0, 0, size, size);
  for (let k = 0; k < 160; k++) {
    ctx.strokeStyle = `rgba(200,200,200,${rng.range(0.15, 0.5)})`;
    ctx.lineWidth = rng.range(0.5, 1.4);
    const x = rng.range(0, size), y = rng.range(0, size), a = rng.range(0, Math.PI), l = rng.range(5, 50);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  // mould parting line
  ctx.strokeStyle = 'rgba(30,30,30,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, size * 0.5);
  ctx.lineTo(size, size * 0.5);
  ctx.stroke();
  return { map: toTex(col, true), rough: toTex(rough, false) };
}

export function brushedMetal(size: number, rng: Rng): TexSet {
  const n = valueNoise(size, 128, rng);
  const col = makeCanvas(size);
  writeRGB(col, (i, x, y) => {
    const v = 0.78 + (n[(y * size + ((x * 7) % size)) % (size * size)] - 0.5) * 0.15;
    return [v, v, v];
  });
  const rough = makeCanvas(size);
  writeGray(rough, (i, x, y) => 0.28 + (n[(y * size) % (size * size)] - 0.5) * 0.25 + (n[i] - 0.5) * 0.1);
  return { map: toTex(col, true), rough: toTex(rough, false) };
}

export function paperScrap(size: number, rng: Rng): TexSet {
  const n = fbm(size, rng, 4, 4);
  const col = makeCanvas(size);
  writeRGB(col, (i) => {
    const v = 0.9 + (n[i] - 0.5) * 0.1;
    return [v, v * 0.98, v * 0.92];
  });
  const ctx = col.getContext('2d')!;
  // ruled lines + margin, like a torn notebook page
  ctx.strokeStyle = 'rgba(80,120,190,0.45)';
  ctx.lineWidth = 1.5;
  for (let y = size * 0.08; y < size; y += size / 12) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(200,60,60,0.5)';
  ctx.beginPath();
  ctx.moveTo(size * 0.12, 0);
  ctx.lineTo(size * 0.12, size);
  ctx.stroke();
  // pencil scribbles — giant handwriting fragments
  ctx.strokeStyle = 'rgba(60,60,70,0.35)';
  ctx.lineWidth = 3;
  for (let k = 0; k < 6; k++) {
    ctx.beginPath();
    let x = rng.range(0, size), y = rng.range(0, size);
    ctx.moveTo(x, y);
    for (let s = 0; s < 8; s++) {
      x += rng.range(5, 25);
      y += rng.range(-14, 14);
      ctx.quadraticCurveTo(x - 6, y - 18, x, y);
    }
    ctx.stroke();
  }
  return { map: toTex(col, true) };
}

const WRAPPER_STYLES: Array<(ctx: CanvasRenderingContext2D, s: number, rng: Rng) => void> = [
  (ctx, s) => {
    ctx.fillStyle = '#c8322e';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#f4ead8';
    for (let x = -s; x < s * 2; x += s / 6) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + s / 12, 0);
      ctx.lineTo(x + s / 12 + s * 0.4, s);
      ctx.lineTo(x + s * 0.4, s);
      ctx.fill();
    }
  },
  (ctx, s, rng) => {
    ctx.fillStyle = '#1d7d7a';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#f2c94c';
    for (let k = 0; k < 40; k++) {
      ctx.beginPath();
      ctx.arc(rng.range(0, s), rng.range(0, s), rng.range(s * 0.02, s * 0.05), 0, Math.PI * 2);
      ctx.fill();
    }
  },
  (ctx, s) => {
    ctx.fillStyle = '#6a3d8f';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#d9b6ff';
    ctx.lineWidth = s * 0.03;
    for (let y = 0; y < s * 1.2; y += s / 6) {
      ctx.beginPath();
      for (let x = 0; x <= s; x += s / 8) ctx.lineTo(x, y + ((x / (s / 8)) % 2 === 0 ? 0 : s / 12));
      ctx.stroke();
    }
  },
  (ctx, s) => {
    ctx.fillStyle = '#e9862c';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#ffe2a8';
    for (let y = 0; y < s; y += s / 5) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= s; x += 8) ctx.lineTo(x, y + Math.sin((x / s) * Math.PI * 4) * s * 0.04);
      ctx.lineTo(s, y + s / 14);
      for (let x = s; x >= 0; x -= 8) ctx.lineTo(x, y + s / 14 + Math.sin((x / s) * Math.PI * 4) * s * 0.04);
      ctx.fill();
    }
  },
];

/** Candy-wrapper prints: a 2x2 atlas so one material covers four designs. */
export function wrapperAtlas(size: number, rng: Rng): TexSet {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d')!;
  const h = size / 2;
  WRAPPER_STYLES.forEach((fn, k) => {
    ctx.save();
    ctx.translate((k % 2) * h, Math.floor(k / 2) * h);
    ctx.beginPath();
    ctx.rect(0, 0, h, h);
    ctx.clip();
    fn(ctx, h, rng);
    ctx.restore();
  });
  // creases
  const bump = makeCanvas(size);
  const b = bump.getContext('2d')!;
  b.fillStyle = '#808080';
  b.fillRect(0, 0, size, size);
  for (let k = 0; k < 50; k++) {
    b.strokeStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';
    b.lineWidth = rng.range(1, 3);
    b.beginPath();
    const x = rng.range(0, size), y = rng.range(0, size);
    b.moveTo(x, y);
    b.lineTo(x + rng.range(-80, 80), y + rng.range(-80, 80));
    b.stroke();
  }
  return { map: toTex(c, true), bump: toTex(bump, false) };
}

/** Prints on the big landmark objects, 2x2: sardine tin label, beer label, candy wrapper, paperback cover. All invented brands. */
export function landmarkAtlas(size: number, rng: Rng): TexSet {
  const c = makeCanvas(size);
  const x = c.getContext('2d')!;
  const h = size / 2;
  const wear = (ox: number, oy: number, n: number, col: string) => {
    for (let i = 0; i < n; i++) {
      x.fillStyle = col.replace('A', rng.range(0.05, 0.3).toFixed(2));
      x.beginPath();
      x.ellipse(ox + rng.range(0, h), oy + rng.range(0, h), rng.range(2, h * 0.08), rng.range(1, h * 0.04), rng.range(0, 3), 0, Math.PI * 2);
      x.fill();
    }
  };
  // 0: sardine tin, faded blue-and-cream with a fish and a wave band, scuffed through to bare metal
  x.fillStyle = '#c9cfd0';
  x.fillRect(0, 0, h, h);
  x.fillStyle = '#5f7f96';
  x.fillRect(0, h * 0.12, h, h * 0.5);
  x.fillStyle = '#e9dfc4';
  x.fillRect(0, h * 0.62, h, h * 0.22);
  x.fillStyle = '#e9dfc4';
  x.beginPath();
  x.ellipse(h * 0.5, h * 0.36, h * 0.3, h * 0.09, 0, 0, Math.PI * 2);
  x.moveTo(h * 0.78, h * 0.36);
  x.lineTo(h * 0.92, h * 0.26);
  x.lineTo(h * 0.92, h * 0.46);
  x.fill();
  x.fillStyle = '#2b3d4c';
  x.beginPath();
  x.arc(h * 0.28, h * 0.34, h * 0.018, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#a33a2c';
  x.textAlign = 'center';
  x.font = `bold ${h * 0.1}px Georgia, serif`;
  x.fillText('NORTHCAPE', h / 2, h * 0.75);
  x.font = `${h * 0.05}px Georgia, serif`;
  x.fillText('BRISLING IN OLIVE OIL', h / 2, h * 0.81);
  wear(0, 0, 90, 'rgba(210,214,216,A)');
  wear(0, 0, 40, 'rgba(120,90,40,A)');
  // 1: beer label, cream with a red oval, half worn away, a damp tide line at the bottom
  x.fillStyle = '#e6d6ae';
  x.fillRect(h, 0, h, h);
  x.strokeStyle = '#8a2a1e';
  x.lineWidth = h * 0.025;
  x.strokeRect(h + h * 0.05, h * 0.05, h * 0.9, h * 0.9);
  x.fillStyle = '#9e2e22';
  x.beginPath();
  x.ellipse(h * 1.5, h * 0.42, h * 0.34, h * 0.22, 0, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#efe2bd';
  x.font = `bold ${h * 0.11}px Georgia, serif`;
  x.fillText('HOLLOWAY', h * 1.5, h * 0.45);
  x.fillStyle = '#3b2a1a';
  x.font = `${h * 0.065}px Georgia, serif`;
  x.fillText('PALE ALE · EST. 1891', h * 1.5, h * 0.75);
  x.fillText('330 ml', h * 1.5, h * 0.84);
  wear(h, 0, 120, 'rgba(180,140,80,A)');
  x.fillStyle = 'rgba(120,80,30,0.25)';
  x.fillRect(h, h * 0.88, h, h * 0.12);
  // 2: candy wrapper, glossy red with white stripes and a cherry
  x.fillStyle = '#c8202f';
  x.fillRect(0, h, h, h);
  x.fillStyle = '#f6efe6';
  for (let i = -4; i < 10; i++) {
    x.beginPath();
    x.moveTo(i * h * 0.14, h);
    x.lineTo(i * h * 0.14 + h * 0.05, h);
    x.lineTo(i * h * 0.14 + h * 0.35, h * 2);
    x.lineTo(i * h * 0.14 + h * 0.3, h * 2);
    x.fill();
  }
  x.fillStyle = '#c8202f';
  x.beginPath();
  x.ellipse(h * 0.5, h * 1.5, h * 0.3, h * 0.2, 0, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#ffe9a8';
  x.font = `bold ${h * 0.1}px Georgia, serif`;
  x.fillText('CHERRY', h * 0.5, h * 1.49);
  x.font = `bold ${h * 0.07}px Georgia, serif`;
  x.fillText('DROPS', h * 0.5, h * 1.58);
  // 3: paperback cover, cloth-cream with a title block, dusty top edge
  x.fillStyle = '#d9cfb4';
  x.fillRect(h, h, h, h);
  x.fillStyle = '#35506a';
  x.fillRect(h * 1.1, h * 1.12, h * 0.8, h * 0.34);
  x.fillStyle = '#e9dfc4';
  x.font = `bold ${h * 0.08}px Georgia, serif`;
  x.fillText('THE LONG', h * 1.5, h * 1.27);
  x.fillText('SUMMER', h * 1.5, h * 1.37);
  x.fillStyle = '#5a4a36';
  x.font = `${h * 0.05}px Georgia, serif`;
  x.fillText('a novel', h * 1.5, h * 1.6);
  wear(h, h, 60, 'rgba(150,140,120,A)');
  return { map: toTex(c, true, false) };
}

/** Matchbox labels: 2x2 atlas of original designs. */
export function labelAtlas(size: number, rng: Rng): TexSet {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d')!;
  const h = size / 2;
  const designs = [
    { bg: '#e8d9b0', fg: '#b23a2a', text: 'HEARTH', sub: 'SAFETY MATCHES', icon: 'flame' },
    { bg: '#2f4f6f', fg: '#f1e3c0', text: 'LONGWICK', sub: 'KITCHEN · 250', icon: 'star' },
    { bg: '#7a2f3b', fg: '#f6d78b', text: 'RED OWL', sub: 'STRIKE ON BOX', icon: 'owl' },
    { bg: '#3d6b48', fg: '#f3efd2', text: 'PINEMARK', sub: 'EXTRA LONG', icon: 'tree' },
  ];
  designs.forEach((d, k) => {
    const ox = (k % 2) * h, oy = Math.floor(k / 2) * h;
    ctx.fillStyle = d.bg;
    ctx.fillRect(ox, oy, h, h);
    ctx.strokeStyle = d.fg;
    ctx.lineWidth = h * 0.02;
    ctx.strokeRect(ox + h * 0.05, oy + h * 0.05, h * 0.9, h * 0.9);
    ctx.fillStyle = d.fg;
    ctx.textAlign = 'center';
    ctx.font = `bold ${h * 0.14}px Georgia, serif`;
    ctx.fillText(d.text, ox + h / 2, oy + h * 0.78);
    ctx.font = `${h * 0.06}px Georgia, serif`;
    ctx.fillText(d.sub, ox + h / 2, oy + h * 0.88);
    // simple icon
    ctx.beginPath();
    const cx = ox + h / 2, cy = oy + h * 0.4;
    if (d.icon === 'flame') {
      ctx.moveTo(cx, cy - h * 0.2);
      ctx.quadraticCurveTo(cx + h * 0.16, cy, cx, cy + h * 0.16);
      ctx.quadraticCurveTo(cx - h * 0.16, cy, cx, cy - h * 0.2);
    } else if (d.icon === 'star') {
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? h * 0.07 : h * 0.17;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
    } else if (d.icon === 'owl') {
      ctx.ellipse(cx, cy, h * 0.13, h * 0.17, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = d.bg;
      ctx.beginPath();
      ctx.arc(cx - h * 0.05, cy - h * 0.04, h * 0.035, 0, Math.PI * 2);
      ctx.arc(cx + h * 0.05, cy - h * 0.04, h * 0.035, 0, Math.PI * 2);
    } else {
      ctx.moveTo(cx, cy - h * 0.2);
      ctx.lineTo(cx + h * 0.14, cy + h * 0.12);
      ctx.lineTo(cx - h * 0.14, cy + h * 0.12);
    }
    ctx.fill();
    ctx.textAlign = 'left';
  });
  // wear: rubbed corners and grime
  const n = fbm(size, rng, 6, 3);
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < size * size; i++) {
    const k = 0.85 + n[i] * 0.2;
    img.data[i * 4] *= k;
    img.data[i * 4 + 1] *= k;
    img.data[i * 4 + 2] *= k;
  }
  ctx.putImageData(img, 0, 0);
  return { map: toTex(c, true, false) };
}

export function moss(size: number, rng: Rng): TexSet {
  const n = fbm(size, rng, 8, 4);
  const d = valueNoise(size, 96, rng);
  const col = makeCanvas(size);
  writeRGB(col, (i) => {
    const v = n[i] * 0.6 + d[i] * 0.4;
    return [0.18 + v * 0.18, 0.38 + v * 0.3, 0.12 + v * 0.1];
  });
  const bump = makeCanvas(size);
  writeGray(bump, (i) => d[i]);
  return { map: toTex(col, true), bump: toTex(bump, false) };
}

export function crumb(size: number, rng: Rng): TexSet {
  const n = fbm(size, rng, 6, 4);
  const pores = valueNoise(size, 48, rng);
  const col = makeCanvas(size);
  writeRGB(col, (i) => {
    const hole = pores[i] < 0.3 ? 0.75 : 1;
    const v = (0.75 + (n[i] - 0.5) * 0.3) * hole;
    return [v, v * 0.78, v * 0.5];
  });
  const bump = makeCanvas(size);
  writeGray(bump, (i) => (pores[i] < 0.3 ? 0.2 : 0.6) + n[i] * 0.3);
  return { map: toTex(col, true), bump: toTex(bump, false) };
}

export function fingerprints(size: number, rng: Rng): THREE.Texture {
  // roughness/alpha map for glass: mostly clean, a few smudges and prints
  const c = makeCanvas(size);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  // a few partial, smeared prints (not tidy concentric targets)
  for (let k = 0; k < 5; k++) {
    const x = rng.range(size * 0.1, size * 0.9), y = rng.range(size * 0.1, size * 0.9);
    const r = rng.range(size * 0.012, size * 0.022);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rng.range(0, Math.PI));
    ctx.scale(1, rng.range(1.1, 1.5));
    for (let ring = 2; ring < 9; ring++) {
      if (rng.chance(0.35)) continue;
      ctx.strokeStyle = `rgba(255,255,255,${rng.range(0.05, 0.14)})`;
      ctx.lineWidth = rng.range(0.6, 1.2);
      ctx.beginPath();
      const a0 = rng.range(0, Math.PI * 2);
      ctx.arc(rng.range(-1, 1), rng.range(-1, 1), r * (ring / 9), a0, a0 + rng.range(1.2, 3.6));
      ctx.stroke();
    }
    ctx.restore();
  }
  for (let k = 0; k < 4; k++) {
    const x = rng.range(0, size), y = rng.range(0, size), r = rng.range(size * 0.06, size * 0.15);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return toTex(c, false);
}

// ---------- sign atlas ----------

export interface SignDef {
  key: string;
  text: string;
  sub?: string;
  bg: string;
  fg: string;
  font: 'hand' | 'serif' | 'stencil' | 'block';
  board?: 'card' | 'plank' | 'brass' | 'chalk';
}

export const SIGNS: SignDef[] = [
  { key: 'commonTable', text: 'Common Table', sub: 'no one eats alone', bg: '#f1e4c6', fg: '#8a3324', font: 'hand', board: 'card' },
  { key: 'dripRow', text: 'DRIP ROW', bg: '#2b2b2b', fg: '#f3e2b0', font: 'stencil', board: 'chalk' },
  { key: 'water', text: 'Clean drip', sub: '1 sip = free', bg: '#d6ecf0', fg: '#1d5a6e', font: 'hand', board: 'card' },
  { key: 'salvage', text: 'SALVAGE UNION', sub: 'we fix what falls', bg: '#3f4a3a', fg: '#e8d27a', font: 'stencil', board: 'plank' },
  { key: 'workshop', text: 'Workshop', sub: 'bring your own scrap', bg: '#e3d3b0', fg: '#3a2d1e', font: 'hand', board: 'plank' },
  { key: 'lift', text: 'LIFT ↑ THREADMARKET', bg: '#b8412f', fg: '#fff1d0', font: 'block', board: 'card' },
  { key: 'threadmarket', text: 'THREADMARKET', sub: 'everything that falls, for sale', bg: '#2e2a4f', fg: '#ffd27a', font: 'serif', board: 'plank' },
  { key: 'crumbs', text: "Odo's Crumbs", sub: 'baked fresh-ish', bg: '#f6d9a8', fg: '#7a2e14', font: 'hand', board: 'card' },
  { key: 'wells', text: "Wren's Wells", sub: 'water by the cap', bg: '#cfe7ef', fg: '#174a63', font: 'hand', board: 'card' },
  { key: 'threads', text: 'Sela · Threads', sub: 'fabric · rope · patches', bg: '#efd4e3', fg: '#6b2152', font: 'serif', board: 'card' },
  { key: 'scrapyard', text: "Tobb's Salvage", sub: 'buy · sell · swap', bg: '#d9d0b8', fg: '#2c3a2a', font: 'block', board: 'plank' },
  { key: 'granary', text: 'GRANARY', sub: 'Shelf Authority reserve', bg: '#1f2d3d', fg: '#d9c48a', font: 'serif', board: 'brass' },
  { key: 'checkpoint', text: 'CHECKPOINT', sub: 'permits only beyond this line', bg: '#1d2b3a', fg: '#e8d59a', font: 'serif', board: 'brass' },
  { key: 'heights', text: 'THE HEIGHTS', sub: 'order · light · water', bg: '#f5f1e6', fg: '#2d4a5c', font: 'serif', board: 'brass' },
  { key: 'registry', text: 'Registry of the Shelf', sub: 'permits · residence · petitions', bg: '#283a4c', fg: '#f0dfa8', font: 'serif', board: 'brass' },
  { key: 'reserve', text: 'Glasshouse Reserve', sub: 'preserved fruit · fine sugar', bg: '#eef3ea', fg: '#3c5a34', font: 'serif', board: 'brass' },
  { key: 'runners', text: 'THREADRUNNERS', sub: 'up · down · fast', bg: '#e05a2b', fg: '#fff6e2', font: 'stencil', board: 'card' },
  { key: 'commons', text: 'The Commons', sub: 'where the sky drops sugar', bg: '#ead9b8', fg: '#5a2f1a', font: 'hand', board: 'plank' },
  { key: 'home', text: 'Home?', bg: '#eadbc2', fg: '#4a3a2a', font: 'hand', board: 'card' },
  { key: 'mind', text: 'mind the leak', bg: '#e8e2d4', fg: '#2f5f8a', font: 'hand', board: 'card' },
  { key: 'rations', text: 'RATIONS FRIDAY', bg: '#f0e6cf', fg: '#a12d2d', font: 'stencil', board: 'card' },
  { key: 'noEntry', text: 'NO ENTRY', sub: 'by order of the Authority', bg: '#efe7d2', fg: '#7d1f1f', font: 'stencil', board: 'card' },
  { key: 'tea', text: 'hot tea', sub: '2 tokens', bg: '#f3e9d6', fg: '#3b5e2b', font: 'hand', board: 'chalk' },
  { key: 'repairs', text: 'REPAIRS', sub: 'fair prices, honest glue', bg: '#e7c75a', fg: '#2b2416', font: 'block', board: 'plank' },
  { key: 'pells', text: "Pell's Pantry", sub: 'crumbs · seeds · broth', bg: '#f4e2bd', fg: '#6d2a14', font: 'hand', board: 'card' },
  { key: 'spill', text: 'THE SPILL', sub: 'scavenge at your own risk', bg: '#3a3226', fg: '#f0c96a', font: 'stencil', board: 'plank' },
  { key: 'sumpWard', text: 'THE SUMP WARD', sub: 'by Franchise of Duke Tallow', bg: '#24201c', fg: '#d9c48a', font: 'stencil', board: 'plank' },
  { key: 'claims', text: 'CLAIMS', sub: 'all falls are tallied · the Third is owed', bg: '#e9e0c8', fg: '#5a1f1f', font: 'serif', board: 'card' },
];

export function signAtlas(): { tex: THREE.Texture; index: Map<string, number>; cols: number; rows: number } {
  const cols = 4, rows = Math.ceil(SIGNS.length / 4);
  const cw = 512, ch = 192;
  const c = makeCanvas(cols * cw, rows * ch);
  const ctx = c.getContext('2d')!;
  const index = new Map<string, number>();
  const fonts: Record<SignDef['font'], string> = {
    hand: '"Ink Free","Segoe Print","Bradley Hand","Comic Sans MS",cursive',
    serif: 'Georgia,"Times New Roman",serif',
    stencil: '"Arial Black","Impact",sans-serif',
    block: '"Trebuchet MS","Arial",sans-serif',
  };
  SIGNS.forEach((s, k) => {
    index.set(s.key, k);
    const ox = (k % cols) * cw, oy = Math.floor(k / cols) * ch;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.fillStyle = s.bg;
    ctx.fillRect(0, 0, cw, ch);
    if (s.board === 'plank') {
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      for (let y = 10; y < ch; y += 14) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(cw * 0.3, y + 4, cw * 0.6, y - 4, cw, y + 2);
        ctx.stroke();
      }
    }
    if (s.board === 'brass') {
      ctx.strokeStyle = '#c8a24a';
      ctx.lineWidth = 10;
      ctx.strokeRect(8, 8, cw - 16, ch - 16);
      ctx.lineWidth = 2;
      ctx.strokeRect(22, 22, cw - 44, ch - 44);
    }
    if (s.board === 'chalk') {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      for (let i = 0; i < 40; i++) {
        ctx.beginPath();
        ctx.moveTo((i * 37) % cw, 0);
        ctx.lineTo(((i * 37) % cw) + 30, ch);
        ctx.stroke();
      }
    }
    ctx.fillStyle = s.fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = s.font === 'hand' ? 70 : 62;
    ctx.font = `${s.font === 'hand' ? '' : 'bold '}${size}px ${fonts[s.font]}`;
    while (ctx.measureText(s.text).width > cw * 0.88 && size > 20) {
      size -= 2;
      ctx.font = `${s.font === 'hand' ? '' : 'bold '}${size}px ${fonts[s.font]}`;
    }
    ctx.fillText(s.text, cw / 2, s.sub ? ch * 0.42 : ch / 2);
    if (s.sub) {
      ctx.font = `${s.font === 'serif' ? 'italic ' : ''}28px ${fonts[s.font === 'stencil' ? 'block' : s.font]}`;
      ctx.globalAlpha = 0.85;
      ctx.fillText(s.sub, cw / 2, ch * 0.78);
      ctx.globalAlpha = 1;
    }
    // edge grime
    const g = ctx.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, 'rgba(40,25,10,0.18)');
    g.addColorStop(0.15, 'rgba(40,25,10,0)');
    g.addColorStop(0.85, 'rgba(40,25,10,0)');
    g.addColorStop(1, 'rgba(40,25,10,0.25)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);
    ctx.restore();
  });
  const tex = toTex(c, true, false);
  return { tex, index, cols, rows };
}
