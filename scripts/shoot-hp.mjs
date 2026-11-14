// Capture helper: node scripts/shoot.mjs <url-query> <out.png> [waitMs] [js-to-eval-before-shot]
// Uses hardware GPU via ANGLE/D3D11 when available and prints the renderer string + fps.
import { chromium } from '@playwright/test';

const [, , query = '', out = 'shots/shot.png', waitMs = '6000', pre = ''] = process.argv;
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--force_high_performance_gpu', '--use-gl=angle', '--use-angle=d3d11'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('console', (m) => {
  const t = m.text();
  if (/\[world\]|\[auto\]|error|Error/.test(t)) console.log('console:', t.slice(0, 300));
});
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(`http://127.0.0.1:5173/${query}`);
await page.waitForFunction(() => (window).__game, null, { timeout: 60000 });
await page.waitForTimeout(parseInt(waitMs, 10));
if (pre) console.log('pre:', JSON.stringify(await page.evaluate(pre)));
const info = await page.evaluate(() => {
  const g = (window).__game;
  return { renderer: g.renderer.rendererInfo, fps: g.renderer.fps.toFixed(1), ms: g.renderer.avgFrameMs.toFixed(1), res: g.renderer.resScale, calls: g.renderer.gl.info.render.calls, tris: g.renderer.gl.info.render.triangles, people: g.figs.drawn, stage: g.story.stage, t: g.simTime.toFixed(1) };
});
console.log('info:', JSON.stringify(info));
await page.screenshot({ path: out });
console.log('saved', out);
await browser.close();

