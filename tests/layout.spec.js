// Layout at phone, tablet and desktop widths
const { test, expect, APP } = require('./helpers');

for (const width of [320, 360, 390, 800, 1024]) {
  test(`${width} px: header buttons fit, no sideways scroll, status on one line`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 700 }, hasTouch: width < 800, isMobile: width < 800 });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(APP);
    await page.waitForFunction(() => typeof lastPhys !== 'undefined' && lastPhys);
    const r = await page.evaluate(async () => {
      applyPreset('biggame', 'type3'); document.getElementById('symSide').click(); presetDirty = true; render();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const btns = [...document.querySelectorAll('.header-actions .btn')], last = btns[btns.length - 1].getBoundingClientRect();
      return { lastRight: last.right, vw: innerWidth, scrollW: document.documentElement.scrollWidth, info: document.getElementById('statusInfo').offsetHeight, bar: document.querySelector('.status-bar').offsetHeight };
    });
    expect(r.lastRight).toBeLessThanOrEqual(r.vw);
    expect(r.scrollW).toBeLessThanOrEqual(r.vw);
    expect(r.info).toBeLessThan(20);
    expect(r.bar).toBeLessThan(30);
    expect(errors).toEqual([]);
    await context.close();
  });
}

test('the preview dialog fits a phone screen', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto(APP);
  await page.waitForFunction(() => typeof lastPhys !== 'undefined' && lastPhys);
  await page.evaluate(() => playRecommended());
  const r = await page.evaluate(() => ({ dlg: document.querySelector('.anim-dlg').getBoundingClientRect().width, canvas: document.getElementById('animCanvas').getBoundingClientRect().width, scrollW: document.documentElement.scrollWidth, vw: innerWidth }));
  expect(r.dlg).toBeLessThanOrEqual(r.vw);
  expect(r.canvas).toBeLessThanOrEqual(r.vw);
  expect(r.scrollW).toBeLessThanOrEqual(r.vw);
  await context.close();
});
