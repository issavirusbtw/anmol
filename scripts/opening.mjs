// Captures the new opening: title card, then waking alone in the matchbox.
import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto('http://127.0.0.1:5173/?fresh=1');
await page.waitForFunction(() => window.__game);
await page.waitForTimeout(2500);
await page.screenshot({ path: 'shots/final/00-title.png' });
await page.locator('[data-testid=begin]').click();
await page.waitForTimeout(9800); // let the establishing flight play out
await page.waitForFunction(() => window.__game.mode === 'play');
await page.waitForTimeout(1200);
await page.screenshot({ path: 'shots/final/00-wake.png' });
await browser.close();
console.log('saved');
