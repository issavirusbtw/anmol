// Runs ?auto=1 (the autopilot plays Chapter 1 through real input) and captures screenshots at milestones.
// node scripts/autorun.mjs [maxSeconds] [outDir]
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const maxS = parseInt(process.argv[2] ?? '420', 10);
const outDir = process.argv[3] ?? 'shots/auto';
const extra = process.argv[4] ?? '';
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
page.on('console', (m) => {
  const t = m.text();
  if (/\[auto\]|Uncaught|TypeError/.test(t)) console.log(t.slice(0, 200));
});
await page.goto(`http://127.0.0.1:5173/?auto=1&fresh=1${extra}`);
await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
const t0 = Date.now();
let lastStep = '';
let shot = 0;
const fpsSamples = [];
while ((Date.now() - t0) / 1000 < maxS) {
  await page.waitForTimeout(2000);
  const s = await page.evaluate(() => {
    const g = window.__game;
    return { step: g.auto?.step ?? '', done: g.auto?.done, stage: g.story.stage, fps: g.renderer.fps, phase: g.candy.phase, t: g.simTime, district: g.district };
  });
  fpsSamples.push({ fps: s.fps, district: s.district, phase: s.phase });
  if (s.step !== lastStep || (s.phase === 'reach' && shot < 40) || (s.phase === 'rush' && shot < 40)) {
    lastStep = s.step;
    const name = `${outDir}/${String(++shot).padStart(2, '0')}-${s.step.replace(/[^a-z0-9]+/gi, '_').slice(0, 40)}-${s.phase}.png`;
    await page.screenshot({ path: name });
  }
  if (s.done) break;
}
const fin = await page.evaluate(() => {
  const g = window.__game;
  return { log: g.auto.log, stage: g.story.stage, choice: g.story.choice, tokens: g.state.tokens, rep: g.state.rep, supply: g.state.supply, inv: g.state.inv, flags: [...g.story.flags], t: g.simTime, home: g.state.homeRepaired, lift: g.state.liftRepaired, district: g.district };
});
console.log(JSON.stringify(fin, null, 1));
const byD = {};
for (const f of fpsSamples) (byD[f.district] ??= []).push(f.fps);
for (const [d, arr] of Object.entries(byD)) console.log(`fps ${d}: avg ${(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1)} min ${Math.min(...arr).toFixed(1)} (n=${arr.length})`);
await page.screenshot({ path: `${outDir}/zz-final.png` });
await browser.close();
