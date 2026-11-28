// Editing on the canvas: clicks and drags, keys, mouse buttons, symmetry, dialogs, pinch
const { test, expect, frames, slide, screenOf, pointOf } = require('./helpers');

const eyeXY = page => page.evaluate(() => eyes[0]).then(q => screenOf(page, 'side', q));
const weightXY = page => page.evaluate(() => { const wp = weightPlacement(flattenSmooth(sidePts, SM, 12), weights[0]); return { x: wp.x, y: wp.z }; }).then(q => screenOf(page, 'side', q));
const state = page => page.evaluate(() => JSON.stringify({ s: sidePts, e: eyes, w: weights }));

for (const what of ['point', 'eye', 'weight']) {
  test(`a click on a ${what} only selects it; a drag edits with one undo step`, async ({ page }) => {
    await page.evaluate(() => { applyPreset('seabass', 'minnow'); undoStack = []; });
    await frames(page);
    const xy = what === 'point' ? await pointOf(page, 'side', 5) : what === 'eye' ? await eyeXY(page) : await weightXY(page);
    const before = await state(page);
    await page.mouse.move(xy.x, xy.y); await page.mouse.down(); await page.mouse.move(xy.x + 1, xy.y + 1); await page.mouse.up();
    expect(await page.evaluate(() => ({ n: undoStack.length, dirty: isModified() }))).toEqual({ n: 0, dirty: false });
    await page.mouse.move(xy.x, xy.y); await page.mouse.down(); await page.mouse.move(xy.x - 25, xy.y + 4, { steps: 5 }); await page.mouse.up();
    expect(await page.evaluate(() => ({ n: undoStack.length, dirty: isModified() }))).toEqual({ n: 1, dirty: true });
    expect(await state(page)).not.toBe(before);
    await page.evaluate(() => undoAction());
    expect(await state(page)).toBe(before);
  });
}

test('"−" with nothing to remove and a size sync with nothing to sync leave no undo step', async ({ page }) => {
  const r = await page.evaluate(() => {
    applyPreset('seabass', 'minnow'); undoStack = []; eyes = []; const before = isModified();
    removePart('eye'); syncToSide(); syncToTop();
    const quiet = { n: undoStack.length, same: isModified() === before };
    topPts.forEach(q => q.x *= 0.9); syncToSide();
    return { quiet, synced: { n: undoStack.length, same: Math.abs(xRange(topPts).mn - xRange(sidePts).mn) < 0.01 } };
  });
  expect(r.quiet).toEqual({ n: 0, same: true });
  expect(r.synced).toEqual({ n: 1, same: true });
});

test('Delete removes the selected part after a sidebar control was used', async ({ page }) => {
  await page.evaluate(() => document.querySelectorAll('.panel.collapsed').forEach(x => x.classList.remove('collapsed')));
  await page.click('#eyeSizeSlider');
  let xy = await eyeXY(page); await page.mouse.click(xy.x, xy.y); await page.keyboard.press('Delete');
  expect(await page.evaluate(() => eyes.length)).toBe(0);
  // Backspace with a typed calibration value: the part goes, the value stays
  await page.evaluate(() => applyPreset('seabass', 'minnow')); await frames(page);
  await page.fill('#calM', '16.5');
  xy = await eyeXY(page); await page.mouse.click(xy.x, xy.y); await page.keyboard.press('Backspace');
  expect(await page.evaluate(() => eyes.length)).toBe(0);
  expect(await page.inputValue('#calM')).toBe('16.5');
});

test('only the left mouse button edits', async ({ page }) => {
  let a = await pointOf(page, 'side', 6);
  await page.evaluate(() => setTool('add')); let n = await page.evaluate(() => sidePts.length);
  await page.mouse.click(a.x + 3, a.y - 20, { button: 'right' }); await page.mouse.click(a.x + 3, a.y - 20, { button: 'middle' });
  expect(await page.evaluate(() => sidePts.length)).toBe(n);
  await page.mouse.click(a.x + 3, a.y - 20);
  expect(await page.evaluate(() => sidePts.length)).toBe(n + 1);
  await page.evaluate(() => setTool('delete')); n = await page.evaluate(() => sidePts.length); a = await pointOf(page, 'side', 6);
  await page.mouse.click(a.x, a.y, { button: 'right' });
  expect(await page.evaluate(() => sidePts.length)).toBe(n);
  await page.mouse.click(a.x, a.y);
  expect(await page.evaluate(() => sidePts.length)).toBe(n - 1);
  await page.evaluate(() => { setTool('move'); applyPreset('seabass', 'minnow'); undoStack = []; }); await frames(page);
  a = await pointOf(page, 'side', 6); const y0 = await page.evaluate(() => sidePts[6].y);
  await page.mouse.move(a.x, a.y); await page.mouse.down({ button: 'right' }); await page.mouse.move(a.x, a.y - 40, { steps: 4 }); await page.mouse.up({ button: 'right' });
  expect(await page.evaluate(() => [sidePts[6].y, undoStack.length])).toEqual([y0, 0]);
});

test('a drag whose button release was missed ends instead of following the pointer', async ({ page }) => {
  let a = await pointOf(page, 'side', 6);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(a.x, a.y - 20, { steps: 3 });
  const y = await page.evaluate(() => sidePts[6].y);
  for (const dy of [60, 80]) await page.evaluate(([x, y]) => document.getElementById('sideSVG').dispatchEvent(
    new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', buttons: 0, clientX: x, clientY: y, bubbles: true })), [a.x, a.y - dy]);
  expect(await page.evaluate(() => [sidePts[6].y, dragType])).toEqual([y, null]);
  await page.mouse.up();
  a = await pointOf(page, 'side', 8); await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(a.x, a.y - 10, { steps: 2 });
  await page.evaluate(() => document.getElementById('sideSVG').dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 1, pointerType: 'mouse', bubbles: true })));
  expect(await page.evaluate(() => dragType)).toBe(null);
  await page.mouse.up();
});

test('with symmetry on, the nose and the odd tail point stay on the axis', async ({ page }) => {
  await page.evaluate(() => applyPreset('seabass', 'minnow'));
  await slide(page, 'topPtsSlider', 25, true); await frames(page);
  const half = await page.evaluate(() => Math.floor(topPts.length / 2));
  for (const i of [0, half]) {
    const a = await pointOf(page, 'top', i), x0 = await page.evaluate(i => topPts[i].x, i);
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(a.x - 12, a.y + 15, { steps: 4 }); await page.mouse.up();
    const q = await page.evaluate(i => topPts[i], i);
    expect(q.y).toBe(0);
    expect(Math.abs(q.x - x0)).toBeGreaterThan(1);
  }
  const r = await page.evaluate(() => { applyPreset('biggame', 'type2'); const y0 = sidePts[0].y; document.getElementById('symSide').click(); const y1 = sidePts[0].y; undoAction(); return [y0, y1, sidePts[0].y]; });
  expect(r).toEqual([-2.5, 0, -2.5]);
});

test('with a dialog open, Delete / Backspace leave the lure alone and Esc closes it', async ({ page }) => {
  let xy = await eyeXY(page); await page.mouse.click(xy.x, xy.y);
  await page.evaluate(() => document.getElementById('physicsResult').classList.remove('collapsed'));
  await page.click('#animBtn'); await page.click('#animPlayBtn');
  await page.keyboard.press('Backspace'); await page.keyboard.press('Delete');
  expect(await page.evaluate(() => eyes.length)).toBe(1);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => [document.getElementById('animOverlay').style.display, animRunning])).toEqual(['none', false]);
  await page.click('.header-actions .btn-accent');
  await page.keyboard.press('Delete');
  expect(await page.evaluate(() => eyes.length)).toBe(1);
  await page.click('#exportContent'); await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.getElementById('exportOverlay').style.display)).toBe('none');
  await page.keyboard.press('Delete');
  expect(await page.evaluate(() => eyes.length)).toBe(0);
  // Esc also closes the size-sync menu
  await page.click('#syncWrap > .btn'); await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.getElementById('syncMenu').style.display)).toBe('none');
});

test('pinch zoom with a finger starting on a point moves nothing and records nothing', async ({ page }) => {
  const r = await page.evaluate(() => {
    const svg = document.getElementById('sideSVG'), rc = svg.getBoundingClientRect(), o = viewOrigin('side');
    svg.setPointerCapture = () => {}; svg.releasePointerCapture = () => {}; // synthetic touches have no real pointer to capture
    const P = q => ({ x: rc.left + o.cx + q.x * viewZoom, y: rc.top + o.cy + q.y * viewZoom });
    const ev = (type, id, x, y) => svg.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: id === 1 }));
    undoStack = []; const before = JSON.stringify(sidePts), z0 = viewZoom, a = P(sidePts[5]);
    ev('pointerdown', 1, a.x, a.y); ev('pointermove', 1, a.x + 2, a.y + 1); ev('pointerdown', 2, a.x + 120, a.y);
    for (let k = 1; k <= 10; k++) { ev('pointermove', 2, a.x + 120 + k * 12, a.y); ev('pointermove', 1, a.x - k * 4, a.y); }
    ev('pointerup', 2, a.x + 240, a.y); for (let k = 1; k <= 5; k++) ev('pointermove', 1, a.x - 40 - k * 10, a.y + k * 3); ev('pointerup', 1, a.x - 90, a.y + 15);
    return { zoomed: viewZoom / z0 > 1.3, moved: JSON.stringify(sidePts) !== before, undo: undoStack.length, dirty: isModified() };
  });
  expect(r).toEqual({ zoomed: true, moved: false, undo: 0, dirty: false });
});

test('view settings: control points, G / B markers and retrieve speed; not part of undo', async ({ page }) => {
  const count = () => page.evaluate(() => ({ pts: document.querySelectorAll('#sideSVG .control-point').length === sidePts.length,
    gb: [...document.querySelectorAll('#sideSVG text')].filter(t => t.textContent === 'G' || t.textContent === 'B').length }));
  await page.evaluate(() => { document.querySelectorAll('.panel.collapsed').forEach(x => x.classList.remove('collapsed')); applyPreset('etc', 'crank'); undoStack = []; });
  await frames(page);
  expect(await count()).toEqual({ pts: true, gb: 0 });
  await page.click('#cgToggle + .toggle-slider'); await page.click('#showPtsToggle + .toggle-slider'); await frames(page);
  expect(await count()).toEqual({ pts: false, gb: 2 });
  // a lipped lure runs deeper at a faster retrieve
  const depth = () => page.evaluate(() => parseFloat(document.getElementById('phDepth').textContent));
  const slow = await (async () => { await page.evaluate(() => { const s = document.getElementById('speedSlider'); s.value = 1; s.dispatchEvent(new Event('input', { bubbles: true })); }); await frames(page); return depth(); })();
  const fast = await (async () => { await page.evaluate(() => { const s = document.getElementById('speedSlider'); s.value = 5; s.dispatchEvent(new Event('input', { bubbles: true })); }); await frames(page); return depth(); })();
  expect(fast).toBeGreaterThan(slow);
  expect(await page.evaluate(() => [viewSet.speed, document.getElementById('speedVal').textContent, undoStack.length, isModified()])).toEqual([5, '매우빠름', 0, false]);
  // an undo of a lure edit leaves the view settings alone
  await page.evaluate(() => { addPart('eye'); undoAction(); }); await frames(page);
  expect(await count()).toEqual({ pts: false, gb: 2 });
  expect(await page.evaluate(() => viewSet.speed)).toBe(5);
});

test('"(수정됨)" follows the lure, not the edits', async ({ page }) => {
  const state = () => page.evaluate(() => ({ undo: undoStack.length, modified: isModified(), status: document.getElementById('statusInfo').textContent.split(' | ')[0] }));
  await page.evaluate(() => { document.querySelectorAll('.panel.collapsed').forEach(x => x.classList.remove('collapsed')); applyPreset('seabass', 'minnow'); undoStack = []; });
  // a point-count slider moved and brought back without letting go
  await page.evaluate(() => { const s = document.getElementById('sidePtsSlider'), n = +s.value; for (const v of [n - 2, n - 4, n]) { s.value = v; s.dispatchEvent(new Event('input', { bubbles: true })); } s.dispatchEvent(new Event('change', { bubbles: true })); });
  await frames(page);
  expect(await state()).toEqual({ undo: 0, modified: false, status: 'MN001' });
  // a value changed and changed back by hand: two undo steps, but the lure is the preset again
  for (const v of [0.6, 0.45]) { await page.evaluate(v => { lastSaveT = 0; const s = document.getElementById('densitySlider'); s.value = v; s.dispatchEvent(new Event('input', { bubbles: true })); }, v); await frames(page); }
  expect(await state()).toEqual({ undo: 2, modified: false, status: 'MN001' });
  // the proportional-scaling mode is not a change of the lure
  await page.evaluate(() => document.getElementById('propToggle').click()); await frames(page);
  expect((await state()).modified).toBe(false);
  // a weight pushed past the furthest it can go: nothing moves, no undo step
  await page.evaluate(() => { applyPreset('biggame', 'aji'); setWeightProp('pos', 95); undoStack = []; lastSaveT = 0; });
  const pos = await page.evaluate(() => weights[0].pos);
  await page.evaluate(() => { const s = document.getElementById('weightPosSlider'); s.value = 95; s.dispatchEvent(new Event('input', { bubbles: true })); });
  expect(await page.evaluate(() => [weights[0].pos, undoStack.length, document.getElementById('weightNote').textContent.includes('멈춤')])).toEqual([pos, 0, true]);
});

test('clicking the loaded preset: nothing when unchanged, a reset (with undo) after edits', async ({ page }) => {
  await page.evaluate(() => { applyPreset('seabass', 'minnow'); undoStack = []; });
  await page.evaluate(() => document.querySelector('.preset-btn.active').click());
  expect(await page.evaluate(() => [undoStack.length, isModified()])).toEqual([0, false]);
  await page.evaluate(() => { addPart('eye'); });
  expect(await page.evaluate(() => isModified())).toBe(true);
  await page.evaluate(() => document.querySelector('.preset-btn.active').click());
  expect(await page.evaluate(() => [undoStack.length, isModified(), eyes.length])).toEqual([2, false, 1]);
});

test('undo across preset switches keeps "(수정됨)" right', async ({ page }) => {
  const r = await page.evaluate(() => {
    applyPreset('seabass', 'minnow'); undoStack = [];
    const out = [];
    addPart('eye'); out.push(isModified());                       // MN001 edited
    loadPreset('biggame', 'aji'); out.push(isModified());         // BG001 as loaded
    undoAction(); out.push(currentPreset.key, isModified());      // back to the edited MN001
    undoAction(); out.push(currentPreset.key, isModified());      // MN001 as loaded
    return out;
  });
  expect(r).toEqual([true, false, 'minnow', true, 'minnow', false]);
});

test('the add-weight button is off at the 8-weight limit', async ({ page }) => {
  const r = await page.evaluate(() => {
    applyPreset('biggame', 'aji'); for (let i = 0; i < 7; i++) addWeight();
    const b = document.getElementById('weightAddBtn'), at8 = [b.disabled, b.title]; removeWeight();
    return { at8, at7: b.disabled };
  });
  expect(r.at8).toEqual([true, '웨이트는 최대 8개']);
  expect(r.at7).toBe(false);
});
