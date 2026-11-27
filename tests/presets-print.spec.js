// Presets, actual-size print and SVG export
const { test, expect, frames, slide, presets } = require('./helpers');

// Buoyancy, rest posture, lure type and design code of every preset (as the README's preset table describes)
const EXPECTED = {
  BG001: ['플로팅(F)', '꼬리 숙임 48°', '다이빙 펜슬', 'BG001/F/L180/W61/B20/H38'],
  BG002: ['플로팅(F)', '꼬리 숙임 55°', '다이빙 펜슬', 'BG002/F/L200/W52/B18/H30'],
  BG003: ['플로팅(F)', '꼬리 숙임 38°', '다이빙 펜슬', 'BG003/F/L200/W79/B23/H37'],
  BG004: ['플로팅(F)', '수평', '다이빙 펜슬', 'BG004/F/L200/W81/B30/H38'],
  BG005: ['플로팅(F)', '꼬리 숙임 22°', '다이빙 펜슬', 'BG005/F/L200/W69/B26/H33'],
  BG006: ['플로팅(F)', '꼬리 숙임 20°', '다이빙 펜슬', 'BG006/F/L200/W89/B30/H36'],
  BG007: ['플로팅(F)', '꼬리 숙임 18°', '다이빙 펜슬', 'BG007/F/L200/W91/B30/H38'],
  BG008: ['플로팅(F)', '꼬리 숙임 48°', '포퍼', 'BG008/F/L165/W74/B32/H40'],
  MN001: ['플로팅(F)', '수평', '립리스 미노우', 'MN001/F/L125/W16/B14/H19'],
  MN002: ['싱킹(S)', '수평', '바이브레이션', 'MN002/S/L75/W26/B10/H27'],
  MN003: ['싱킹(S)', '수평', '싱킹 펜슬', 'MN003/S/L100/W23/B12/H15'],
  ET001: ['플로팅(F)', '꼬리 숙임 9°', '크랭크베이트', 'ET001/F/L60/W15/B22/H30'],
  ET002: ['플로팅(F)', '꼬리 숙임 76°', '톱워터 펜슬', 'ET002/F/L110/W15/B16/H16'],
  ET003: ['서스펜딩(SP)', '수평', '저크베이트', 'ET003/SP/L100/W14/B11/H22'],
};

test('every preset: buoyancy, posture, type and design code', async ({ page }) => {
  const got = await page.evaluate(() => {
    const out = {}, t = id => document.getElementById(id).textContent;
    for (const cat in PRESETS) for (const key in PRESETS[cat].items) {
      applyPreset(cat, key); calcPhysics();
      out[PRESETS[cat].items[key].name] = [t('phBuoyancy'), t('phPosture'), t('phWobble').split(' · ')[0], designCode()];
    }
    return out;
  });
  expect(got).toEqual(EXPECTED);
});

test('every preset at 266 mm prints 1:1 on A4 landscape, with and without the nose line eye', async ({ page }) => {
  const pages = await page.evaluate(() => {
    window.print = () => {}; window.alert = m => { window._alert = m; };
    const out = {};
    for (const cat in PRESETS) for (const key in PRESETS[cat].items) for (const noEye of [false, true]) {
      applyPreset(cat, key); if (noEye) lineEyes = [];
      const s = document.getElementById('lenSlider'); s.value = 266; s.dispatchEvent(new Event('input', { bubbles: true }));
      window._alert = null; printLure();
      out[PRESETS[cat].items[key].name + (noEye ? ' no eye' : '')] = document.getElementById('printPage').textContent + (window._alert ? ' + alert' : '');
    }
    return out;
  });
  for (const [name, css] of Object.entries(pages)) expect(css, name).toBe('@page{size:A4 landscape;margin:5mm}');
});

test('print: the "cm" unit stays on the page, also with nothing ahead of the nose', async ({ page }) => {
  await page.emulateMedia({ media: 'print' });
  const res = await page.evaluate(() => {
    window.print = () => {};
    const out = [];
    for (const cat in PRESETS) for (const key in PRESETS[cat].items) for (const noEye of [false, true]) {
      applyPreset(cat, key); if (noEye) lineEyes = [];
      printLure();
      const svg = document.querySelector('#printArea svg'), W = +svg.getAttribute('viewBox').split(' ')[2];
      const cm = [...svg.querySelectorAll('text')].find(t => t.textContent === 'cm').getBBox();
      out.push({ name: PRESETS[cat].items[key].name + (noEye ? ' no eye' : ''), W, end: cm.x + cm.width });
    }
    return out;
  });
  for (const r of res) expect(r.end, r.name).toBeLessThanOrEqual(r.W);
});

test('print: the browser\'s own print (Ctrl+P) gets the same drawing', async ({ page }) => {
  const r = await page.evaluate(() => {
    window.alert = () => { window._alert = true; };
    window.dispatchEvent(new Event('beforeprint'));
    const filled = document.getElementById('printArea').innerHTML.length;
    window.dispatchEvent(new Event('afterprint'));
    return { filled, cleared: document.getElementById('printArea').innerHTML === '', alerted: !!window._alert };
  });
  expect(r.filled).toBeGreaterThan(1000);
  expect(r.cleared).toBe(true);
  expect(r.alerted).toBe(false);
  // the printed PDF has the drawing (a blank page is under 1 kB)
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ format: 'A4' });
  expect(pdf.length).toBeGreaterThan(50000);
});

test('print button builds the drawing once; a lure too big for A4 gets A3 and a note', async ({ page }) => {
  const r = await page.evaluate(() => {
    let builds = 0; const orig = buildPrint; window.buildPrint = function () { builds++; return orig(); };
    window.print = () => window.dispatchEvent(new Event('beforeprint'));
    window.alert = m => { window._alert = m; };
    applyPreset('biggame', 'rapido'); setCheck('lip', true); setCtl('lipLen', 80); setCtl('lipAng', 0);
    const s = document.getElementById('lenSlider'); s.value = 266; s.dispatchEvent(new Event('input', { bubbles: true }));
    printLure(); window.buildPrint = orig;
    return { builds, page: document.getElementById('printPage').textContent, alert: window._alert || '' };
  });
  expect(r.builds).toBe(1);
  expect(r.page).toContain('A3');
  expect(r.alert).toContain('A4보다 커서');
});

test('SVG export: real size in mm, hairlines, well-formed for every preset', async ({ page }) => {
  const res = await page.evaluate(() => {
    const out = [];
    for (const cat in PRESETS) for (const key in PRESETS[cat].items) {
      applyPreset(cat, key); setCheck('lip', true); exportSVG();
      const t = document.getElementById('exportContent').value, doc = new DOMParser().parseFromString(t, 'image/svg+xml');
      const widths = [...t.matchAll(/stroke-width="([\d.]+)"/g)].map(m => +m[1]);
      out.push({ name: PRESETS[cat].items[key].name, head: t.split('\n')[0], parseError: !!doc.querySelector('parsererror'), maxStroke: Math.max(...widths), code: /class="design-code"/.test(t) });
    }
    closeExport();
    return out;
  });
  for (const r of res) {
    expect(r.head, r.name).toMatch(/width="[\d.]+mm" height="[\d.]+mm" viewBox=/);
    expect(r.parseError, r.name).toBe(false);
    expect(r.maxStroke, r.name).toBeLessThanOrEqual(0.3);
    expect(r.code, r.name).toBe(true);
  }
});

test('design code text stays clear of the weights and the eyes', async ({ page }) => {
  const res = await page.evaluate(() => {
    const out = [];
    for (const cat in PRESETS) for (const key in PRESETS[cat].items) {
      applyPreset(cat, key);
      const sideF = flattenSmooth(sidePts, SM, 12), code = designCode(), m = designCodeMarkup(code, sideF);
      const x = +m.match(/ x="([-\d.]+)"/)[1], yb = +m.match(/ y="([-\d.]+)"/)[1], fs = +m.match(/font-size="([\d.]+)"/)[1];
      const w = code.length * 0.62 * fs, h = fs * 0.8, box = { x1: x - w / 2, x2: x + w / 2, y1: yb - h, y2: yb };
      const hitW = weights.some(wt => { const wp = weightPlacement(sideF, wt), sh = weightShape(wt);
        for (let k = 0; k < 144; k++) { const a = k / 144 * 2 * Math.PI, ex = wp.x + sh.rx * Math.cos(a), ey = wp.z + sh.ry * Math.sin(a); if (ex >= box.x1 && ex <= box.x2 && ey >= box.y1 && ey <= box.y2) return true; }
        return false; });
      const eyeR = +document.getElementById('eyeSizeSlider').value;
      const hitE = eyes.some(e => Math.hypot(Math.max(Math.abs(e.x - x) - w / 2, 0), Math.max(Math.abs(e.y - (yb - h / 2)) - h / 2, 0)) < eyeR);
      out.push({ name: PRESETS[cat].items[key].name, fs, hitW, hitE });
    }
    return out;
  });
  for (const r of res) { expect(r.hitW, r.name).toBe(false); expect(r.hitE, r.name).toBe(false); expect(r.fs, r.name).toBe(3); }
});
