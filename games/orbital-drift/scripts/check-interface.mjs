import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';
import { JSDOM } from 'jsdom';
const root = fileURLToPath(new URL('../', import.meta.url));
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://example.test/nested/game/index.html',
  pretendToBeVisual: true,
});
const w = dom.window;
for (const key of [
  'window',
  'document',
  'location',
  'navigator',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLButtonElement',
  'HTMLDialogElement',
  'Element',
  'Node',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'MutationObserver',
  'getComputedStyle',
  'localStorage',
])
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: key === 'window' ? w : w[key],
  });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.matchMedia = w.matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
});
globalThis.ResizeObserver = class {
  observe() {}
  disconnect() {}
};
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};
globalThis.Image = class {
  width = 512;
  height = 512;
  set src(value) {
    queueMicrotask(() => this.onload());
  }
};
w.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {} });
w.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({
  width: 960,
  height: 600,
  x: 0,
  y: 0,
});
w.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
w.HTMLDialogElement.prototype.close = function () {
  if (this.open) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  }
};
globalThis.fetch = async () => {
  throw new Error('Offline test');
};
import { compile } from '../../../tooling/test-compile.mjs';
const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { default: Home } = await import(compile(root + 'app/page.tsx'));
const ui = createRoot(document.getElementById('root'));
await act(async () => ui.render(createElement(Home)));
const button = (text) =>
  [...document.querySelectorAll('button')].find(
    (b) => b.textContent.trim() === text || b.getAttribute('aria-label') === text,
  );
async function click(text) {
  const b = button(text);
  assert.ok(b, `Button exists: ${text}`);
  await act(async () => b.click());
}
assert.equal(document.querySelector('main').dataset.mode, 'ready');
await click('Enter orbit↵');
assert.equal(document.querySelector('main').dataset.mode, 'playing');
await click('Settings');
assert.equal(document.querySelector('main').dataset.mode, 'paused');
assert.ok(document.querySelector('dialog').open, 'Settings opens and pauses');
await act(async () =>
  document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', bubbles: true })),
);
assert.equal(
  document.querySelector('main').dataset.mode,
  'paused',
  'Modal blocks game restart shortcuts',
);
await click('Mute audio');
assert.equal(JSON.parse(localStorage.getItem('orbital-drift-audio')).muted, true);
await click('Close');
assert.ok(!document.querySelector('dialog').open);
assert.equal(document.querySelector('main').dataset.mode, 'paused');
await click('中文');
assert.equal(document.documentElement.lang, 'zh-CN');
await click('操作指南');
assert.ok(document.querySelector('dialog').open);
assert.match(document.querySelector('dialog').textContent, /先转动船头/);
await click('关闭');
await click('制作与署名');
assert.match(document.querySelector('dialog').textContent, /wipics/);
assert.match(document.querySelector('dialog').textContent, /Kenney/);
await click('关闭');
await click('继续飞行P');
assert.equal(document.querySelector('main').dataset.mode, 'playing');
await act(async () => w.dispatchEvent(new Event('blur')));
assert.equal(document.querySelector('main').dataset.mode, 'paused', 'Blur pauses with UI feedback');
await act(async () => ui.unmount());
// Exercise the actual copy fallback UI with a clearly isolated fixture URL.
const { ScoreShare } = await import(compile(root + 'components/score-share.tsx'));
w.HTMLCanvasElement.prototype.getContext = () =>
  new Proxy({}, { get: (_, key) => (key === 'measureText' ? () => ({ width: 20 }) : () => {}) });
w.HTMLCanvasElement.prototype.toBlob = function (callback) {
  callback(new Blob(['fixture'], { type: 'image/png' }));
};
let clipboardDenied = false,
  copied = '',
  actions = [];
Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: {
    writeText: async (text) => {
      if (clipboardDenied) throw new Error('denied');
      copied = text;
    },
  },
});
const sharing = createRoot(document.getElementById('root'));
await act(async () =>
  sharing.render(
    createElement(ScoreShare, {
      data: {
        score: 42,
        achieved: [30],
        newRecord: false,
        language: 'en',
        url: 'https://example.invalid/isolated-test',
        shareId: 'fixture-share',
      },
      analytics: { event: (type, data) => actions.push({ type, data }) },
    }),
  ),
);
await click('Copy game link');
assert.equal(copied, 'https://example.invalid/isolated-test');
assert.equal(actions.filter((e) => e.type === 'link_copy').length, 1);
clipboardDenied = true;
await click('Copy game link');
assert.equal(
  actions.filter((e) => e.type === 'link_copy').length,
  1,
  'Denied copy is not reported as success',
);
assert.equal(actions.filter((e) => e.type === 'link_copy_error').length, 1);
assert.match(document.body.textContent, /Select and copy the link below/);
await act(async () => sharing.unmount());
dom.window.close();
console.log(
  'PASS: interface start; settings pause + shortcut isolation; mute persistence; close remains paused; bilingual help/credits; resume + blur; clipboard success/denial and manual fallback. (JSDOM, not visual/mobile QA.)',
);
