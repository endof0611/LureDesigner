// Measured calibration panel and its stored records
const { test, expect, frames, slide } = require('./helpers');

const openPanel = page => page.evaluate(() => { document.getElementById('calibPanel').classList.remove('collapsed'); calibUI(); });

test('inputs are cleared after a save (no double saves) and when another preset is loaded', async ({ page }) => {
  await page.evaluate(() => { localStorage.clear(); calib = { on: true, samples: [] }; applyPreset('etc', 'jerk'); });
  await openPanel(page);
  await page.fill('#calD', '1.5');
  await page.evaluate(() => calibAdd());
  expect(await page.inputValue('#calD')).toBe('');
  expect(await page.textContent('#calibMsg')).toContain('저장했습니다');
  await page.evaluate(() => calibAdd());
  expect(await page.evaluate(() => calib.samples.length)).toBe(1);
  await page.fill('#calM', '18'); await page.fill('#calP', '10'); await page.selectOption('#calPDir', '1');
  await page.evaluate(() => loadPreset('biggame', 'aji'));
  expect([await page.inputValue('#calM'), await page.inputValue('#calP'), await page.inputValue('#calPDir'), await page.textContent('#calibMsg')]).toEqual(['', '', '-1', '']);
  await page.fill('#calM', '60'); await page.evaluate(() => resetShape());
  expect(await page.inputValue('#calM')).toBe('60');   // same preset: kept
  await page.evaluate(() => { undoAction(); undoAction(); });
  expect(await page.evaluate(() => currentPreset.key)).toBe('jerk');
  expect(await page.inputValue('#calM')).toBe('');      // undo back to another preset: cleared
});

test('a measured posture is signed only by the tail / head choice', async ({ page }) => {
  await page.evaluate(() => applyPreset('etc', 'jerk'));
  await openPanel(page);
  const r = await page.evaluate(() => {
    const e = document.getElementById('calP'), d = document.getElementById('calPDir');
    e.value = '-10'; d.value = '-1'; const tail = calibInputs().P; d.value = '1'; const head = calibInputs().P; e.value = '';
    return [tail, head, isNaN(calibInputs().P)];
  });
  expect(r).toEqual([-10, 10, true]);
});

test('density fit makes the predicted mass match the measured one', async ({ page }) => {
  await page.evaluate(() => applyPreset('seabass', 'minnow'));
  await openPanel(page);
  await page.fill('#calM', '18');
  await page.evaluate(() => calibFitDensity());
  expect(await page.evaluate(() => Math.abs(lastPhys.raw.M - 18))).toBeLessThan(0.2);
  expect(await page.inputValue('#densitySlider')).toBe('0.55');
});

test('malformed stored records are dropped and the editor keeps redrawing', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('lureDesigner.calib', JSON.stringify({ on: true, samples: [
    { t: 1, label: 'x', r: { sink: 'abc' }, m: {}, p: { M: 10, pitch: 0 } }, { t: 1, label: 'y', r: { sink: 1.1 } }, null, 5,
    { t: 2, label: '<b>z</b>', r: { wobble: 1.2 }, m: { M: 5, P: null }, p: { M: 16.1, pitch: -2 } },
    { t: 3, label: 'BG003', type: 'divingPencil', speed: 3, r: { pencilDive: 1.3 }, m: { M: null, P: -30 }, p: { M: 78.7, pitch: -38 } }] })));
  await page.reload(); await page.waitForFunction(() => typeof lastPhys !== 'undefined' && lastPhys);
  expect(await page.evaluate(() => calib.samples.map(x => x.label))).toEqual(['<b>z</b>', 'BG003']);
  await openPanel(page);
  await slide(page, 'lenSlider', 180); await frames(page);
  expect(await page.textContent('#sideDim')).toContain('180.0');
  expect(await page.evaluate(() => document.getElementById('calibList').innerHTML)).toContain('&lt;b&gt;z');
});

test('an error inside the physics step is logged but the views are still drawn', async ({ page }) => {
  const logged = [];
  page.on('console', m => { if (m.type() === 'error') logged.push(m.text()); });
  await page.evaluate(() => { window._calibUI = calibUI; window.calibUI = () => { throw new Error('test failure'); }; });
  await slide(page, 'lenSlider', 150); await frames(page);
  await page.evaluate(() => { window.calibUI = window._calibUI; });
  expect(await page.textContent('#sideDim')).toContain('150.0');
  expect(await page.evaluate(() => inRender)).toBe(false);
  expect(logged.join(' ')).toContain('test failure');
});

test('the app works when browser storage is blocked', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } }); });
  await page.goto(require('./helpers').APP);
  await page.waitForFunction(() => typeof lastPhys !== 'undefined' && lastPhys);
  await page.evaluate(() => {
    toggleAnimation(); animSaveRef(); animClearRef(); closeAnimation();
    document.getElementById('calibPanel').classList.remove('collapsed'); document.getElementById('calD').value = '1'; calibAdd(); calibDel(0);
  });
  expect(errors).toEqual([]);
  await context.close();
});
