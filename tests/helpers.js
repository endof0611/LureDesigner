// Shared setup for the browser tests: every test opens index.html in a fresh page, and fails if the page
// threw an uncaught error at any point.
const path = require('path');
const { pathToFileURL } = require('url');
const base = require('@playwright/test');

const APP = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;

const test = base.test.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(APP);
    await page.waitForFunction(() => typeof lastPhys !== 'undefined' && lastPhys);
    await use(page);
    base.expect(errors, 'uncaught page errors').toEqual([]);
  },
});

// Two animation frames: lets a batched render (and its physics) run
const frames = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

// Set a sidebar slider the way a user drag does (input event; change too when asked)
const slide = (page, id, value, change = false) => page.evaluate(([id, value, change]) => {
  const s = document.getElementById(id);
  s.value = value;
  s.dispatchEvent(new Event('input', { bubbles: true }));
  if (change) s.dispatchEvent(new Event('change', { bubbles: true }));
}, [id, value, change]);

// Screen position of a point given in a view's body coordinates (mm)
const screenOf = (page, view, q) => page.evaluate(([view, q]) => {
  const r = document.getElementById(view === 'side' ? 'sideSVG' : 'topSVG').getBoundingClientRect(), o = viewOrigin(view);
  return { x: r.left + o.cx + q.x * viewZoom, y: r.top + o.cy + q.y * viewZoom };
}, [view, q]);
const pointOf = (page, view, i) => page.evaluate(([view, i]) => viewPts(view)[i], [view, i]).then(q => screenOf(page, view, q));

// Every preset as [category, key, code]
const presets = page => page.evaluate(() => Object.entries(PRESETS).flatMap(([c, v]) => Object.entries(v.items).map(([k, p]) => [c, k, p.name])));

module.exports = { test, expect: base.expect, APP, frames, slide, screenOf, pointOf, presets };
