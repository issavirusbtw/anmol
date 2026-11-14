// Performance measurement at 1920x1080 with the frame-rate cap removed.
// node scripts/perf.mjs [hp|igpu]
import { chromium } from '@playwright/test';

const gpu = process.argv[2] ?? 'hp';
const args = ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'];
if (gpu === 'hp') args.push('--force_high_performance_gpu');
const browser = await chromium.launch({ headless: true, args });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const scenarios = [
  ['depths (player height)', '?state=lower&test=1', null],
  ['threadmarket (player height)', '?state=market&test=1', 'g.cam.yaw = 0.35;'],
  ['candy event rush', '?state=market&test=1&event=candy', 'g.cam.yaw = 2.6; g.cam.pitch = 0.3;'],
  ['heights', '?state=upper&test=1', null],
  ['cabinet overview', '?view=wide', null],
];
for (const [name, q, js] of scenarios) {
  await page.goto(`http://127.0.0.1:5173/${q}&fresh=1`);
  await page.waitForFunction(() => window.__game && window.__game.simTime > 1, null, { timeout: 60000 });
  if (js) await page.evaluate(`(() => { const g = window.__game; ${js} })()`);
  if (q.includes('event=candy')) await page.waitForFunction(() => window.__game.candy.phase === 'rush', null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  // sample frame times over 5 seconds
  const r = await page.evaluate(
    () =>
      new Promise((res) => {
        const times = [];
        let last = performance.now();
        const t0 = last;
        const f = (now) => {
          times.push(now - last);
          last = now;
          if (now - t0 < 5000) requestAnimationFrame(f);
          else {
            times.sort((a, b) => a - b);
            const avg = times.reduce((a, b) => a + b, 0) / times.length;
            const g = window.__game;
            res({ fps: (1000 / avg).toFixed(1), p95ms: times[Math.floor(times.length * 0.95)].toFixed(1), frames: times.length, res: g.renderer.resScale, calls: g.renderer.gl.info.render.calls, tris: g.renderer.gl.info.render.triangles, people: g.figs.drawn, renderer: g.renderer.rendererInfo.replace(/ANGLE \(|Direct3D11.*$/g, '') });
          }
        };
        requestAnimationFrame(f);
      }),
  );
  console.log(name.padEnd(30), JSON.stringify(r));
}
await browser.close();
