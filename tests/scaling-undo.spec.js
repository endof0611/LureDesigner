// Proportional length scaling, weights fitted to the body, undo of settings, slider ranges
const { test, expect, frames, slide, pointOf } = require('./helpers');

const len = async (page, v) => { await slide(page, 'lenSlider', v, true); await frames(page); };
// Each length change as a separate drag (the undo grouping window is 800 ms; skip it instead of waiting)
const newDrag = page => page.evaluate(() => { lastSaveT = 0; });
const snapshot = page => page.evaluate(() => JSON.stringify({
  w: weights.map(w => [w.g, w.d]), hook: document.getElementById('hookWeightSlider').value, eye: document.getElementById('eyeSizeSlider').value,
  lip: document.getElementById('lipLenSlider').value, M: lastPhys.raw.M.toFixed(1), pitch: lastPhys.pitch === null ? '-' : lastPhys.pitch.toFixed(0) }));

for (const [key, mid] of [['rapido', 100], ['legato', 150], ['type2', 80], ['type3', 40]]) {
  test(`proportional ${key}: 200 → ${mid} → 230 → 200 mm in separate drags gives the lure back`, async ({ page }) => {
    await page.evaluate(k => applyPreset('biggame', k), key); await frames(page);
    const before = await snapshot(page);
    for (const v of [mid, 230, 200]) { await newDrag(page); await len(page, v); }
    expect(await snapshot(page)).toBe(before);
  });
}

test('proportional: masses past a slider\'s range are kept, and the range returns afterwards', async ({ page }) => {
  await page.evaluate(() => { applyPreset('biggame', 'rapido'); setCtl('hookWeight', 12); setCtl('coat', 15); setCtl('hardware', 25); calcPhysics(); undoStack = []; });
  const m200 = await page.evaluate(() => lastPhys.raw.M.toFixed(1));
  await len(page, 266);
  const at266 = await page.evaluate(() => ['hookWeight', 'coat', 'hardware', 'eyeSize', 'hookSize'].map(id => document.getElementById(id + 'Slider').value));
  expect(at266.slice(0, 3)).toEqual(['28', '26.5', '59']);        // 12 g × (266/200)³, 15 g × (266/200)², 25 g × (266/200)³
  expect(+at266[4]).toBeLessThanOrEqual(6);                        // drawn hook-eye size stays within its range (keeps 266 mm on A4)
  await len(page, 200);
  expect(await page.evaluate(() => [document.getElementById('hookWeightSlider').value, document.getElementById('hookWeightSlider').max, lastPhys.raw.M.toFixed(1)]))
    .toEqual(['12', '15', m200]);
  // a weight scaled past 100 g: the slider shows it, keeps its range while in use, then returns
  await page.evaluate(() => { applyPreset('biggame', 'rapido'); setWeightProp('g', 60); setCtl('hookWeight', 6.5); }); await frames(page);
  await len(page, 266);
  const big = await page.evaluate(() => { const s = document.getElementById('weightSlider'); return { g: weights[0].g, v: +s.value, max: +s.max }; });
  expect(big.g).toBeGreaterThan(100); expect(big.v).toBe(big.g); expect(big.max).toBeGreaterThanOrEqual(big.g);
  const drag = await page.evaluate(() => { const s = document.getElementById('weightSlider'); s.focus(); s.value = 90; s.dispatchEvent(new Event('input', { bubbles: true })); const mid = +s.max; s.blur(); syncWeightUI(); return [mid, s.max]; });
  expect(drag).toEqual([big.max, '100']);
});

test('a weight cut down to fit a short body grows back to its mass and diameter', async ({ page }) => {
  // BG001 with its weight at the tail end: 30.5 g / 15 mm
  await page.evaluate(() => { applyPreset('biggame', 'aji'); setWeightProp('pos', 95); }); await frames(page);
  const before = await page.evaluate(() => [weights[0].g, weights[0].d, lastPhys.raw.M.toFixed(1)]);
  for (let v = 180; v >= 40; v -= 10) await len(page, v);
  const short = await page.evaluate(() => [weights[0].g, document.getElementById('weightNote').textContent]);
  expect(short[0]).toBeLessThan(30.5);
  expect(short[1]).toContain('무게 30.5→');
  for (let v = 40; v <= 180; v += 10) await len(page, v);
  expect(await page.evaluate(() => [weights[0].g, weights[0].d, lastPhys.raw.M.toFixed(1)])).toEqual(before);
  expect(await page.evaluate(() => document.getElementById('weightNote').textContent)).toBe('');
  // the popper's tail weights: diameters come back too
  await page.evaluate(() => applyPreset('biggame', 'popper')); await frames(page);
  const d0 = await page.evaluate(() => weights.map(w => w.d));
  for (let v = 165; v >= 40; v -= 5) await len(page, v);
  expect(await page.evaluate(() => weights.map(w => w.d))).not.toEqual(d0);
  for (let v = 40; v <= 165; v += 5) await len(page, v);
  await len(page, 165);
  expect(await page.evaluate(() => weights.map(w => w.d))).toEqual(d0);
});

test('a mass asked for beyond what fits is capped, then reached when there is room', async ({ page }) => {
  await page.evaluate(() => { applyPreset('biggame', 'aji'); setWeightProp('pos', 95); }); await frames(page);
  await len(page, 100);
  await page.evaluate(() => setWeightProp('g', 100)); await frames(page);
  const capped = await page.evaluate(() => [weights[0].g, weights[0].gp]);
  expect(capped[0]).toBeLessThan(100); expect(capped[1]).toBe(100);
  for (let v = 100; v <= 180; v += 5) await len(page, v);
  expect(await page.evaluate(() => weights[0].g)).toBe(100);
});

test('curve smoothness and the proportional toggle are part of undo; presets reset smoothness', async ({ page }) => {
  const r = await page.evaluate(() => {
    applyPreset('seabass', 'minnow'); undoStack = [];
    const sl = document.getElementById('smoothSlider'); sl.value = 20; sl.dispatchEvent(new Event('input', { bubbles: true }));
    const a = SM; undoAction(); const b = [SM, document.getElementById('smoothVal').textContent];
    sl.value = 30; sl.dispatchEvent(new Event('input', { bubbles: true })); resetShape(); const c = SM;
    applyPreset('seabass', 'minnow'); undoStack = []; addPart('eye'); presetDirty = false;
    const el = document.getElementById('propToggle'); el.click(); const dirty = presetDirty, on = el.checked;
    undoAction(); return { a, b, c, dirty, on, off: !el.checked, eyes: eyes.length };
  });
  expect(r).toEqual({ a: 0.2, b: [1, '1.00'], c: 1, dirty: false, on: true, off: true, eyes: 2 });
});

test('length, height and width sliders follow an outline dragged past their range', async ({ page }) => {
  await page.evaluate(() => applyPreset('biggame', 'rapido'));
  await len(page, 260);
  const tail = await page.evaluate(() => { let i = 0; sidePts.forEach((q, k) => { if (q.x < sidePts[i].x) i = k; }); return i; });
  const a = await pointOf(page, 'side', tail);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(a.x - 90, a.y, { steps: 5 }); await page.mouse.up();
  const s1 = await page.evaluate(() => ({ L: lureSize()[0], v: +document.getElementById('lenSlider').value }));
  expect(s1.L).toBeGreaterThan(266);
  expect(s1.v).toBe(Math.round(s1.L));
  await page.focus('#lenSlider'); await page.keyboard.press('ArrowLeft');
  expect(Math.abs(await page.evaluate(() => lureSize()[0]) - (s1.v - 1))).toBeLessThan(0.6);   // one step, not a jump to 265
  await page.evaluate(() => document.activeElement.blur());
  await len(page, 200);
  expect(await page.evaluate(() => document.getElementById('lenSlider').max)).toBe('266');
  // height / width past 80 / 60 mm
  const hw = await page.evaluate(() => { applyPreset('etc', 'crank'); saveH(); sidePts.forEach(q => q.y *= 3.2); topPts.forEach(q => q.y *= 3.2); syncSlidersFromPoints();
    const [, H, W] = lureSize(); const out = [Math.round(H), +document.getElementById('sideHSlider').value, Math.round(W), +document.getElementById('topWSlider').value];
    undoAction(); return out.concat([document.getElementById('sideHSlider').max, document.getElementById('topWSlider').max]); });
  expect(hw[0]).toBeGreaterThan(80); expect(hw[1]).toBe(hw[0]); expect(hw[2]).toBeGreaterThan(60); expect(hw[3]).toBe(hw[2]);
  expect(hw.slice(4)).toEqual(['80', '60']);
});
