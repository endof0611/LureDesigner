// Physics, recommendations and the action preview
const { test, expect } = require('./helpers');

test('every preset, buoyancy and technique: the preview simulation stays finite and keeps cycling', async ({ page }) => {
  const bad = await page.evaluate(() => {
    const out = [];
    for (const cat in PRESETS) for (const key in PRESETS[cat].items) for (const dens of [null, 0.2, 0.6, 1.0, 2.0]) {
      applyPreset(cat, key); if (dens) setCtl('density', dens); calcPhysics();
      const a = lastPhys.act, tag = PRESETS[cat].items[key].name + ' ' + (dens || '') + ' ' + lastPhys.buoyCode;
      for (const tech of LURE_TYPES[a.type].techs) for (const opt of [{ power: 1, pause: 1 }, { power: 0.5, pause: 2.5 }, { power: 1.6, pause: 0.5 }]) {
        const s = newSim(a, tech, false, opt); let changes = 0, last = s.phase, lastChange = 0;
        for (let i = 0; i < 24 * 120; i++) {
          animStep(s, a, tech, 1 / 120, opt);
          if (s.phase !== last) { changes++; last = s.phase; lastChange = s.t; }
          if (![s.x, s.d, s.v, s.pitch, s.lat].every(isFinite)) { out.push(tag + ' ' + tech + ': not finite'); break; }
        }
        if (s.maxD > a.maxDepth + 1e-9) out.push(tag + ' ' + tech + ': deeper than ' + a.maxDepth);
        if (['jerk', 'twitch', 'sweep', 'liftfall'].includes(tech) && (changes < 3 || 24 - lastChange > 14)) out.push(tag + ' ' + tech + ': stalled in ' + s.phase);
      }
    }
    return out;
  });
  expect(bad).toEqual([]);
});

test('lift & fall keeps lifting a floating vibration; "bottom" only for sinking ones', async ({ page }) => {
  const r = await page.evaluate(() => [[0.45, 1], [0.45, 3], [1.05, 13]].map(([dens, g]) => {
    applyPreset('seabass', 'vibe'); weights[0].g = weights[0].gp = g; setCtl('density', dens); calcPhysics();
    const a = lastPhys.act, s = newSim(a, 'liftfall', false, { power: 1, pause: 1 }); let lifts = 0, last = 'go';
    for (let i = 0; i < 24 * 120; i++) { animStep(s, a, 'liftfall', 1 / 120, { power: 1, pause: 1 }); if (s.phase !== last) { last = s.phase; if (last === 'go') lifts++; } }
    return { sinks: a.freeRate > 0, lifts, bottom: actionText(a, 'liftfall').includes('바닥 공략') };
  }));
  for (const x of r) { expect(x.lifts).toBeGreaterThanOrEqual(3); expect(x.bottom).toBe(x.sinks); }
});

test('the saved reference keeps running next to the preview (past 24 s, after a reload)', async ({ page }) => {
  const r = await page.evaluate(() => {
    localStorage.clear(); animRef = null;
    applyPreset('biggame', 'rapido'); toggleAnimation(); setAnimTech('sweep'); animPause(); animSaveRef();
    const out = [];
    for (const T of [10, 31, 60, 120]) {
      animReset(); for (let i = 0; i < T * 120; i++) { animStep(sim, lastPhys.act, animTech, 1 / 120, animOpt); animGhostStep(1 / 120); }
      out.push({ T, onScreen: animGhost.pts.filter(q => { const x = 340 + (q.x - sim.x) * 160; return x >= -20 && x <= 700; }).length,
        graph: animGhost.ser.filter(q => q.t >= sim.t - 6 && q.t <= sim.t).length, kept: animGhost.pts.length });
    }
    // saved mid-play: the ghost starts level with the live lure
    animReset(); for (let i = 0; i < 40 * 120; i++) animStep(sim, lastPhys.act, animTech, 1 / 120, animOpt);
    animSaveRef(); const mid = Math.abs(animGhost.x - sim.x);
    closeAnimation();
    return { out, mid, stored: JSON.parse(localStorage.getItem('lureDesigner.animRef')).a.dragK === animRef.a.dragK };
  });
  for (const x of r.out) { expect(x.onScreen, 'at ' + x.T + ' s').toBeGreaterThan(20); expect(x.graph).toBeGreaterThan(50); expect(x.kept).toBeLessThan(250); }
  expect(r.mid).toBeLessThan(0.05);
  expect(r.stored).toBe(true);
  await page.reload(); await page.waitForFunction(() => typeof lastPhys !== 'undefined' && lastPhys);
  const after = await page.evaluate(() => {
    applyPreset('biggame', 'rapido'); weights[0].g = weights[0].gp = 40; calcPhysics(); toggleAnimation(); setAnimTech('sweep'); animPause();
    const ghost = !!animGhost; for (let i = 0; i < 50 * 120; i++) { animStep(sim, lastPhys.act, animTech, 1 / 120, animOpt); animGhostStep(1 / 120); }
    const apart = Math.abs(animGhost.x - sim.x); closeAnimation();
    return { ghost, apart };
  });
  expect(after.ghost).toBe(true);
  expect(after.apart).toBeGreaterThan(0.5);   // the changed design moves differently from the saved one
});

test('preview drawing: rings and splashes at the head, lip and eye at their real sizes', async ({ page }) => {
  const r = await page.evaluate(() => {
    const head = s => 340 + Math.cos(s.pitch * Math.PI / 180) * Math.max(0.3, Math.cos(s.yaw * Math.PI / 180)) * xRange(sidePts).mx * animLureScale();
    applyPreset('etc', 'walker'); toggleAnimation(); setAnimTech('walk'); animPause(); animReset();
    let g = 0; do { animStep(sim, lastPhys.act, animTech, 1 / 120, animOpt); } while (!(sim.rings.length && sim.rings[sim.rings.length - 1].age <= 1 / 120 + 1e-9 && sim.t > 1) && ++g < 5000);
    const ring = Math.abs(340 + (sim.rings[sim.rings.length - 1].x - sim.x) * 160 - head(sim)); closeAnimation();
    applyPreset('biggame', 'popper'); toggleAnimation(); setAnimTech('pop'); animPause(); animReset();
    g = 0; do { animStep(sim, lastPhys.act, animTech, 1 / 120, animOpt); } while (!(sim.splash.length && sim.t > 1.3) && ++g < 5000);
    const splash = Math.abs(340 + (sim.splash[0].x - sim.x) * 160 - head(sim)); closeAnimation();
    applyPreset('etc', 'crank'); toggleAnimation(); animPause();
    const sc = animLureScale(), gm = lipGeom(sidePts[0].x * sc, sidePts[0].y * sc, lastPhys.lipLen * sc, lastPhys.lipAng * Math.PI / 180, 6 * sc);
    const lip = Math.hypot((gm.hull[2].x + gm.hull[3].x) / 2 - sidePts[0].x * sc, (gm.hull[2].y + gm.hull[3].y) / 2 - sidePts[0].y * sc) / (lastPhys.lipLen * sc);
    const eye = animEyeR(sc) / (document.getElementById('eyeSizeSlider').value * sc); closeAnimation();
    return { ring, splash, lip, eye };
  });
  expect(r.ring).toBeLessThan(4);
  expect(r.splash).toBeLessThan(4);
  expect(r.lip).toBeCloseTo(1, 2);
  expect(r.eye).toBeCloseTo(1, 5);
});

test('the recommendation does not change once applied', async ({ page }) => {
  const bad = await page.evaluate(() => {
    const out = [];
    for (const cat in PRESETS) for (const key in PRESETS[cat].items) for (const dens of [null, 0.3, 1.3]) for (const sp of [1, 3, 5]) {
      applyPreset(cat, key); if (dens) setCtl('density', dens); setSpeed(sp); calcPhysics();
      const k = r => JSON.stringify([r.tech, r.speed, r.power, r.pause]), a = k(recommendAction()); applyRecommended();
      if (k(recommendAction()) !== a) out.push(PRESETS[cat].items[key].name + ' ' + dens + ' ' + sp);
    }
    return out;
  });
  expect(bad).toEqual([]);
});

test('texts follow the design: sinking lip minnow, level diving pencil', async ({ page }) => {
  const r = await page.evaluate(() => {
    applyPreset('etc', 'jerk'); setCtl('density', 0.9); calcPhysics();
    const sinking = document.getElementById('phRecWhy').innerText;
    applyPreset('biggame', 'legato'); calcPhysics(); const level = actionText(lastPhys.act, 'sweep');
    applyPreset('biggame', 'aji'); calcPhysics(); const tail = actionText(lastPhys.act, 'sweep');
    return { sinking, level, tail };
  });
  expect(r.sinking).toContain('싱킹');
  expect(r.sinking).not.toContain('떠서');
  expect(r.level).toContain('수평 자세로');
  expect(r.tail).toContain('꼬리 숙인 자세로');
});

test('rest posture changes smoothly as the weight moves along every preset', async ({ page }) => {
  const bad = await page.evaluate(() => {
    const out = [];
    for (const cat in PRESETS) for (const key in PRESETS[cat].items) {
      applyPreset(cat, key); const w = weights[0]; let prev = null;
      for (let pos = 5; pos <= 95; pos++) {
        w.pos = pos; if (!weightFits(w)) { prev = null; continue; }
        calcPhysics(); const p = lastPhys.pitch;
        if (p === null || !isFinite(lastPhys.gm)) out.push(PRESETS[cat].items[key].name + ' ' + pos + '%: no posture');
        else { if (prev !== null && Math.abs(p - prev) > 15) out.push(PRESETS[cat].items[key].name + ' ' + pos + '%: jump'); prev = p; }
      }
    }
    return out;
  });
  expect(bad).toEqual([]);
});
