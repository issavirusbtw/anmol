// Debug: walk out of the matchbox and report what render geometry sits between camera and player.
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://127.0.0.1:5173/?fresh=1&test=1&state=lower`);
await page.waitForFunction(() => window.__game && window.__game.simTime > 2.5);
await page.locator('#view').focus();
await page.keyboard.down('KeyW');
for (let i = 0; i < 1; i++) {
  await page.waitForTimeout(100);
  const r = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const g = window.__game;
    const cam = g.renderer.camera;
    const tgt = g.cam.target;
    const dir = tgt.clone().sub(cam.position);
    const len = dir.length();
    const rc = new THREE.Raycaster(cam.position.clone(), dir.normalize(), 0, len);
    const hits = rc.intersectObjects(g.scene.children, true).filter((h) => h.object.visible && !h.object.isInstancedMesh);
    const h = hits[0];
    return { p: g.player.body.pos.toArray().map((v) => +v.toFixed(2)), cam: cam.position.toArray().map((v) => +v.toFixed(2)), hit: h ? { d: +h.distance.toFixed(2), name: h.object.name, mat: h.object.material?.name ?? h.object.material?.type, pt: h.point.toArray().map((v) => +v.toFixed(2)), tri: [h.face.a, h.face.b, h.face.c].map((i) => { const p = h.object.geometry.attributes.position; return [p.getX(i), p.getY(i), p.getZ(i)].map((v) => +v.toFixed(2)); }), col: h.object.geometry.attributes.color ? [0,1,2].map(k=>+h.object.geometry.attributes.color.getComponent(h.face.a,k).toFixed(2)) : null } : null };
  });
  console.log(JSON.stringify(r));
}
await page.screenshot({ path: 'shots/base/walk_dbg.png' });
await browser.close();

