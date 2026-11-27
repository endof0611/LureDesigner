// Random edit sequences (seeded, so a failure can be replayed): after every step the editor's invariants must
// hold, and undoing everything must give back the starting state exactly.
const { test, expect, frames, screenOf } = require('./helpers');

const SEEDS = [1, 2, 3];
const STEPS = 30;

// Invariants checked in the page after each step
function invariants() {
  const bad = [];
  for (const [v, pts] of [['side', sidePts], ['top', topPts]]) {
    const n = pts.length;
    if (n < 8 || n > 32) bad.push(v + ' has ' + n + ' points');
    if (pts[0].x !== pts[n - 1].x || pts[0].y !== pts[n - 1].y) bad.push(v + ' nose copies differ');
    if (pts.some(q => !isFinite(q.x) || !isFinite(q.y))) bad.push(v + ' point not finite');
    if (symOn(v)) {
      if (pts[0].y !== 0 || (n % 2 && pts[(n - 1) / 2].y !== 0)) bad.push(v + ' point off the mirror axis');
      for (let i = 1; i < Math.floor(n / 2); i++) { const m = n - 1 - i; if (pts[m].x !== pts[i].x || pts[m].y !== -pts[i].y) { bad.push(v + ' symmetry broken at ' + i); break; } }
    }
    if (+document.getElementById(v + 'PtsSlider').value !== n) bad.push(v + ' point slider');
  }
  const s = xRange(sidePts), t = xRange(topPts);
  if (Math.abs(s.mn - t.mn) > 0.02 || Math.abs(s.mx - t.mx) > 0.02) bad.push('side and top lengths differ');
  if (!lastPhys || ![lastPhys.raw.M, lastPhys.gm, lastPhys.cg.x, lastPhys.cg.z].every(isFinite)) bad.push('physics not finite');
  weights.forEach((w, i) => { if (!(w.g <= w.gp + 1e-9)) bad.push('weight ' + i + ' above its asked mass'); if (![w.g, w.d, w.pos].every(isFinite)) bad.push('weight ' + i + ' not finite'); });
  if (!document.getElementById('statusInfo').textContent.startsWith(presetName())) bad.push('status line');
  // every design value is shown on its slider, label and checkbox
  const lab = (id, exp) => { const t = document.getElementById(id).textContent; if (t !== String(exp)) bad.push('label ' + id + ' "' + t + '" vs "' + exp + '"'); };
  for (const id in CTL) {
    if (!isFinite(design[id])) bad.push(id + ' not finite');
    lab(id + 'Val', CTL[id].fmt(design[id]));
    if (Math.abs(+document.getElementById(id + 'Slider').value - design[id]) > 1e-9) bad.push(id + ' slider ' + document.getElementById(id + 'Slider').value + ' vs ' + design[id]);
  }
  for (const k in CHECKS) if (document.getElementById(CHECKS[k]).checked !== design[k]) bad.push(k + ' checkbox');
  const [L, H, W] = lureSize();
  for (const [id, v] of [['len', L], ['sideH', H], ['topW', W]]) {
    const sl = document.getElementById(id + 'Slider'), want = Math.max(+sl.min, Math.min(+sl.max, Math.round(v)));
    if (+sl.value !== want) bad.push(id + ' slider ' + sl.value + ' vs ' + v.toFixed(2));
    if (document.getElementById(id + 'Val').textContent !== sl.value) bad.push(id + ' label');
  }
  if (document.getElementById('sizeInfo').textContent !== lureSize().map(Math.round).join(' × ') + ' mm') bad.push('size line');
  return bad;
}

const snap = () => JSON.stringify({ s: sidePts, t: topPts, e: eyes, h: hooks, l: lineEyes, w: weights.map(w => ({ pos: w.pos, gp: w.gp, dp: w.dp })), d: ctlState().d, SM });

const SLIDERS = [['lenSlider', 40, 266, 1], ['sideHSlider', 8, 80, 1], ['topWSlider', 6, 60, 1], ['sectNSlider', 2, 6, 0.1], ['sectESlider', -0.4, 0.4, 0.05],
  ['smoothSlider', 0, 100, 1], ['densitySlider', 0.1, 2, 0.01], ['hookWeightSlider', 0, 15, 0.5], ['coatSlider', 0, 20, 0.5], ['hardwareSlider', 0, 30, 0.5],
  ['lipLenSlider', 5, 80, 1], ['lipAngSlider', 0, 80, 1], ['eyeSizeSlider', 2, 10, 0.5], ['hookSizeSlider', 1, 6, 0.5],
  ['weightSlider', 0.5, 100, 0.5], ['weightPosSlider', 5, 95, 1], ['weightDiaSlider', 1, 30, 0.5]];
const OPS = ['drag', 'drag', 'dragPart', 'dragWeight', 'add', 'del', 'sym', 'slider', 'slider', 'slider', 'pts', 'lip', 'prop', 'part', 'weight', 'sync', 'preset', 'undo', 'reset'];

for (const seed of SEEDS) {
  test(`random edits, seed ${seed}`, async ({ page }) => {
    let rnd = seed * 9301 + 49297; const R = () => { rnd = (rnd * 9301 + 49297) % 233280; return rnd / 233280; }, pick = a => a[Math.floor(R() * a.length)];
    await page.evaluate(() => document.querySelectorAll('.panel.collapsed').forEach(x => x.classList.remove('collapsed')));
    await page.evaluate(c => { loadPreset(c, Object.keys(PRESETS[c].items)[0]); undoStack = []; }, pick(['biggame', 'seabass', 'etc']));
    await frames(page);
    const start = await page.evaluate(snap);
    const log = [];
    for (let step = 0; step < STEPS; step++) {
      const op = pick(OPS); let desc = op;
      if (op === 'drag' || op === 'add' || op === 'del') {
        const view = pick(['side', 'top']);
        const info = await page.evaluate(view => { const pts = viewPts(view); return { n: pts.length, ec: editableCount(pts.length, symOn(view)), pts }; }, view);
        if (op === 'drag') {
          const i = Math.floor(R() * info.ec), a = await screenOf(page, view, info.pts[i]), dx = (R() - 0.5) * 80, dy = (R() - 0.5) * 60;
          await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(a.x + dx, a.y + dy, { steps: 4 }); await page.mouse.up();
          desc += ` ${view}#${i}`;
        } else if (op === 'add') {
          const i = Math.floor(R() * (info.n - 1)), q = { x: (info.pts[i].x + info.pts[i + 1].x) / 2, y: (info.pts[i].y + info.pts[i + 1].y) / 2 }, a = await screenOf(page, view, q);
          await page.evaluate(() => setTool('add')); await page.mouse.click(a.x + (R() - 0.5) * 6, a.y + (R() - 0.5) * 6); await page.evaluate(() => setTool('move'));
          desc += ` ${view} seg ${i}`;
        } else {
          const i = 1 + Math.floor(R() * Math.max(1, Math.min(info.n - 2, info.ec - 1))), a = await screenOf(page, view, info.pts[i]);
          await page.evaluate(() => setTool('delete')); await page.mouse.click(a.x, a.y); await page.evaluate(() => setTool('move'));
          desc += ` ${view}#${i}`;
        }
      } else if (op === 'dragPart' || op === 'dragWeight') {
        const q = await page.evaluate(op => { if (op === 'dragPart') { const all = [...eyes, ...hooks, ...lineEyes]; return all[0] || null; }
          if (!weights.length) return null; const wp = weightPlacement(flattenSmooth(sidePts, SM, 12), weights[0]); return { x: wp.x, y: wp.z }; }, op);
        if (q) { const a = await screenOf(page, 'side', q); await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(a.x + (R() - 0.5) * (op === 'dragPart' ? 60 : 200), a.y + (op === 'dragPart' ? (R() - 0.5) * 40 : 0), { steps: 4 }); await page.mouse.up(); }
      } else if (op === 'sym') { const id = pick(['symSide', 'symTop']); await page.evaluate(id => document.getElementById(id).click(), id); desc += ' ' + id; }
      else if (op === 'slider') {
        const [id, mn, mx, st] = pick(SLIDERS), v = +(mn + Math.round(R() * (mx - mn) / st) * st).toFixed(2);
        await page.evaluate(([id, v]) => { lastSaveT = 0; const s = document.getElementById(id); s.value = v; s.dispatchEvent(new Event('input', { bubbles: true })); if (id === 'lenSlider') s.dispatchEvent(new Event('change', { bubbles: true })); }, [id, v]);
        desc += ` ${id}=${v}`;
      }
      else if (op === 'pts') { const id = pick(['sidePtsSlider', 'topPtsSlider']), v = 8 + Math.floor(R() * 25); await page.evaluate(([id, v]) => { const s = document.getElementById(id); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, [id, v]); desc += ` ${id}=${v}`; }
      else if (op === 'lip') await page.evaluate(() => document.getElementById('lipToggle').click());
      else if (op === 'prop') await page.evaluate(() => document.getElementById('propToggle').click());
      else if (op === 'part') { const t = pick(['eye', 'hook', 'lineEye']), add = R() < 0.5; await page.evaluate(([t, add]) => add ? addPart(t) : removePart(t), [t, add]); desc += (add ? ' +' : ' -') + t; }
      else if (op === 'weight') { const add = R() < 0.6; await page.evaluate(add => add ? addWeight() : removeWeight(), add); desc += add ? ' +' : ' -'; }
      else if (op === 'sync') await page.evaluate(f => window[f](), pick(['syncToSide', 'syncToTop']));
      else if (op === 'preset') { const c = pick(['biggame', 'seabass', 'etc']), k = pick(await page.evaluate(c => Object.keys(PRESETS[c].items), c)); await page.evaluate(([c, k]) => loadPreset(c, k), [c, k]); desc += ` ${c}/${k}`; }
      else if (op === 'undo') await page.evaluate(() => undoAction());
      else if (op === 'reset') await page.evaluate(() => resetShape());
      await frames(page);
      log.push(desc);
      expect(await page.evaluate(invariants), `seed ${seed}, step ${step}: ${log.slice(-4).join(' | ')}`).toEqual([]);
      if (await page.evaluate(() => undoStack.length) >= 39) break; // the history keeps 40 steps
    }
    await page.evaluate(async () => { while (undoStack.length) undoAction(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
    expect(JSON.parse(await page.evaluate(snap)), 'undo all: ' + log.join(' | ')).toEqual(JSON.parse(start));
  });
}
