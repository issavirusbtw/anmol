// Animation contact sheet: node tools/anim.mjs <out.png> [side|front]
// Boots a throwaway test session, takes the player figure off the controller, and renders it side-on through
// walk/run cycles and key poses, tiled into one image (labels drawn on each tile).
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const out = process.argv[2] ?? 'shots/anim.png';
const view = process.argv[3] ?? 'side';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://127.0.0.1:5173/?fresh=1&test=1&state=sump');
await page.waitForFunction(() => window.__game && window.__game.simTime > 2.5, null, { timeout: 60000 });
const url = await page.evaluate((view) => {
  const g = window.__game;
  g.player.update = () => {};
  g.cam.update = () => {};
  const f = g.player.fig;
  const cam = g.renderer.camera;
  const P = f.pos.clone();
  const frames = [];
  const walk = (speed, label) => {
    for (let i = 0; i < 8; i++) frames.push({ label: `${label} ${i}/8`, state: speed > 4.8 ? 'run' : 'walk', speed, phase: (i / 8) * Math.PI * 2 });
  };
  walk(3.7, 'walk');
  walk(6.6, 'run');
  frames.push({ label: 'idle', state: 'idle', speed: 0, phase: 0 });
  frames.push({ label: 'jump', state: 'jump', speed: 0, phase: 0 });
  frames.push({ label: 'fall', state: 'fall', speed: 0, phase: 0 });
  frames.push({ label: 'land', state: 'idle', speed: 0, phase: 0, land: 1 });
  frames.push({ label: 'run+turn', state: 'run', speed: 6.6, phase: 1, turn: 0.06 });
  frames.push({ label: 'collect', state: 'collect', speed: 0, phase: 0 });
  frames.push({ label: 'jab', state: 'jab', speed: 0, phase: 0, held: 'pick' });
  frames.push({ label: 'walk->run blend', state: 'run', speed: 6.6, phase: 2, from: 'walk' });
  const TW = 320, TH = 360, cols = 4;
  const sheet = document.createElement('canvas');
  sheet.width = TW * cols;
  sheet.height = TH * Math.ceil(frames.length / cols);
  const ctx = sheet.getContext('2d');
  const glc = g.renderer.gl.domElement;
  g.renderer.bokeh.uniforms.focus.value = 4;
  frames.forEach((fr, i) => {
    f.state = fr.from ?? fr.state;
    f.speed = fr.speed;
    f.phase = fr.phase;
    f.held = fr.held ?? null;
    f.yaw = 0;
    f.anim = null;
    f.land = 0;
    f.t = 3;
    g.figs.update(cam, 140, 1 / 60);
    if (fr.from) {
      f.state = fr.state;
      g.figs.update(cam, 140, 0.06); // a third of the way through the crossfade
    }
    if (fr.turn) for (let k = 0; k < 20; k++) { f.yaw += fr.turn; g.figs.update(cam, 140, 1 / 60); }
    if (fr.land) { f.land = fr.land; f.anim = null; }
    g.figs.update(cam, 140, 1 / 60);
    const yaw = f.yaw;
    const d = 3.6;
    const side = view === 'side' ? Math.PI / 2 : 0;
    cam.position.set(P.x + Math.sin(yaw + side) * d, P.y + 1.0, P.z + Math.cos(yaw + side) * d);
    cam.lookAt(P.x, P.y + 0.85, P.z);
    cam.updateMatrixWorld();
    g.figs.update(cam, 140, 0);
    g.renderer.composer.render(0);
    const sx = (glc.width - TW * (glc.width / 1280)) / 2, sy = (glc.height - TH * (glc.height / 720)) / 2;
    ctx.drawImage(glc, sx, sy, TW * (glc.width / 1280), TH * (glc.height / 720), (i % cols) * TW, Math.floor(i / cols) * TH, TW, TH);
    ctx.fillStyle = '#000a';
    ctx.fillRect((i % cols) * TW, Math.floor(i / cols) * TH, TW, 22);
    ctx.fillStyle = '#fff';
    ctx.font = '14px sans-serif';
    ctx.fillText(fr.label, (i % cols) * TW + 6, Math.floor(i / cols) * TH + 16);
  });
  return sheet.toDataURL('image/png');
}, view);
fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
console.log('wrote', out);
await browser.close();
