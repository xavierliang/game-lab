import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { compile } from '../tooling/test-compile.mjs';
const { attribution } = await import(compile(resolve('packages/game-services/src/attribution.ts')));
const a = attribution(
  'https://game.test/index.html?utm_source=community&utm_campaign=launch&ref=abc',
  'https://itch.io/outer?utm_source=secret',
);
assert.equal(a.source, 'community');
assert.equal(a.referral, 'abc');
assert.equal(a.evidence, 'query');
assert.equal(
  attribution('https://game.test/', 'https://author.itch.io/game?utm_source=observed-campaign')
    .source,
  'observed-campaign',
);
assert.equal(
  attribution('https://game.test/', 'https://author.itch.io/game?utm_source=observed-campaign')
    .evidence,
  'referrer_query',
);
assert.equal(attribution('https://game.test/', 'https://author.itch.io/').source, 'itch.io');
assert.equal(
  attribution('https://game.test/', 'https://external.test/?utm_source=ignore').source,
  'external',
);
assert.equal(
  attribution('https://game.test/', 'https://author.itch.io/game?utm_source=DO-NOT-READ').campaign,
  '',
);
assert.equal(attribution('https://game.test/', '').source, 'unknown');
assert.equal(
  attribution('https://game.test/?utm_source=email%40private.com&secret=email', '').source,
  'unknown',
);
const dom = new JSDOM('<html></html>', {
    url: 'http://127.0.0.1:8746/index.html?utm_source=qa',
    pretendToBeVisual: true,
  }),
  w = dom.window;
for (const k of ['window', 'document', 'navigator', 'location', 'localStorage'])
  Object.defineProperty(globalThis, k, { configurable: true, value: k === 'window' ? w : w[k] });
globalThis.matchMedia = () => ({ matches: false });
let clock = 0;
Object.defineProperty(globalThis, 'performance', {
  configurable: true,
  value: { now: () => clock },
});
w.document.hasFocus = () => true;
const { releaseConfig } = await import(compile(resolve('packages/game-services/src/config.ts')));
w.__GAME_CONFIG__ = {
  analyticsEndpoint: 'http://127.0.0.1:8747/events',
  environment: 'production',
};
assert.equal(releaseConfig({ gameId: 'orbital-drift', gameVersion: '1.2.0' }).environment, 'test');
w.__GAME_OFFLINE__ = true;
assert.equal(
  releaseConfig({ gameId: 'orbital-drift', gameVersion: '1.2.0' }).analyticsEndpoint,
  '',
);
delete w.__GAME_OFFLINE__;
const { referralLink, systemShare } = await import(
  compile(resolve('packages/game-services/src/sharing.ts'))
);
assert.equal(referralLink({ officialUrl: 'http://localhost:8746', playUrl: '' }, 'abc'), '');
assert.equal(referralLink({ officialUrl: 'https://example.com/game', playUrl: '' }, 'abc'), '');
assert.match(
  referralLink({ officialUrl: 'https://orbital-drift.itch.io/game', playUrl: '' }, 'abc'),
  /ref=abc/,
);
const card = { gameId: 'orbital-drift', title: 'Test fixture', text: 'Fixture score', url: '' },
  blob = new Blob(['test'], { type: 'image/png' });
assert.equal((await systemShare(blob, card, {})).outcome, 'fallback');
let payload;
assert.deepEqual(
  await systemShare(blob, card, {
    canShare: () => true,
    share: async (p) => {
      payload = p;
    },
  }),
  { outcome: 'complete', method: 'file' },
);
assert.equal(payload.files[0].type, 'image/png');
assert.ok(!payload.url);
assert.equal(
  (
    await systemShare(blob, card, {
      share: async () => {
        throw new DOMException('cancel', 'AbortError');
      },
    })
  ).outcome,
  'cancel',
);
assert.equal(
  (
    await systemShare(blob, card, {
      share: async () => {
        throw new DOMException('denied', 'NotAllowedError');
      },
    })
  ).outcome,
  'error',
);
const { Analytics, SDK_VERSION } = await import(
  compile(resolve('packages/game-services/src/analytics.ts'))
);
assert.equal(
  SDK_VERSION,
  JSON.parse(readFileSync('packages/game-services/package.json', 'utf8')).version,
);
let online = false,
  sent = [],
  beacons = [];
globalThis.fetch = async (_url, opts) => {
  if (!online) throw new Error('offline');
  const events = JSON.parse(opts.body).events;
  sent.push(...events);
  return { ok: true, json: async () => ({ accepted: events.map((e) => e.id) }) };
};
w.navigator.sendBeacon = (_url, body) => {
  beacons.push(body);
  return true;
};
const config = {
  gameId: 'orbital-drift',
  gameVersion: '1.2.0',
  analyticsEndpoint: 'http://127.0.0.1:8747/events',
  environment: 'test',
  platform: 'itch',
  officialUrl: '',
  playUrl: '',
};
const client = new Analytics(config);
await new Promise((r) => setImmediate(r));
client.event('load_success');
clock = 5000;
client.advancePlay(2);
client.event('heartbeat');
let e = client.queue.at(-1);
assert.equal(e.foreground_ms, 5000);
assert.equal(e.play_ms, 2000);
w.dispatchEvent(new w.Event('blur'));
clock = 15000;
client.event('heartbeat');
assert.equal(client.queue.at(-1).foreground_ms, 5000);
w.dispatchEvent(new w.Event('focus'));
clock = 17000;
client.event('heartbeat');
assert.equal(client.queue.at(-1).foreground_ms, 7000);
client.hide();
assert.ok(beacons.length);
const queued = client.queue.length;
assert.ok(queued > 0, 'Beacon acceptance does not delete unacknowledged events');
const concurrent = new Analytics(config);
await new Promise((r) => setImmediate(r));
concurrent.event('load_success');
const ownKey = client.queueKey,
  concurrentKey = concurrent.queueKey;
assert.notEqual(ownKey, concurrentKey);
assert.ok(
  localStorage.getItem(ownKey) && localStorage.getItem(concurrentKey),
  'Tabs persist independent lanes',
);
concurrent.destroy();
const oldIds = client.queue.map((e) => e.id);
client.destroy();
const restored = new Analytics(config);
await new Promise((r) => setImmediate(r));
assert.ok(
  oldIds.every((id) => restored.queue.some((e) => e.id === id)),
  'Offline queue survives reload',
);
online = true;
for (let n = 0; n < 30 && restored.queue.length; n++) await restored.flush(true);
assert.equal(restored.queue.length, 0);
assert.ok(sent.length >= queued);
for (let i = 0; i < 350; i++) {
  online = false;
  restored.event('heartbeat');
}
assert.equal(restored.queue.length, 300, 'Queue bound');
await new Promise((r) => setImmediate(r));
restored.setEnabled(false);
assert.equal(restored.queue.length, 0);
assert.equal(localStorage.length, 2, 'Only current and legacy optout preferences remain');
assert.equal(
  localStorage.getItem('orbital-analytics-optout'),
  '1',
  'Rollback clients stay opted out',
);
const b = new Analytics({ ...config, gameId: 'signal-tap', gameVersion: '0.1.0' });
await new Promise((r) => setImmediate(r));
assert.equal(b.enabled, false, 'Site-wide opt-out applies across games');
b.destroy();
const oldSession = restored.session;
restored.setEnabled(true);
assert.notEqual(restored.session, oldSession, 'Opt-in starts new anonymous session');
const other = new Analytics({ ...config, gameId: 'signal-tap', gameVersion: '0.1.0' });
await new Promise((r) => setImmediate(r));
assert.notEqual(restored.visitor, other.visitor, 'Anonymous identity is per game');
assert.ok(
  other.queue.every((e) => e.game_id === 'signal-tap'),
  'Restoration never imports another game queue',
);
assert.ok(restored.queue.every((e) => e.game_id === 'orbital-drift'));
localStorage.setItem('orbital-analytics-v1:test:endpoint', '{"visitor":"legacy"}');
localStorage.setItem('orbital-analytics-v1:test:endpoint:queue:old', '[{"id":"legacy"}]');
localStorage.setItem('orbital-best', '42');
restored.setEnabled(false);
assert.equal(localStorage.getItem('orbital-analytics-v1:test:endpoint'), null);
assert.equal(localStorage.getItem('orbital-analytics-v1:test:endpoint:queue:old'), null);
assert.equal(localStorage.getItem('orbital-best'), '42', 'Game preferences survive opt-out');
// A legacy tab opting out must stop already-open v2 clients as well.
w.dispatchEvent(new w.StorageEvent('storage', { key: 'orbital-analytics-optout', newValue: '1' }));
assert.equal(other.enabled, false);
assert.equal(other.queue.length, 0);
restored.destroy();
other.destroy();
dom.window.close();
console.log(
  'PASS: direct/iframe/unknown attribution, privacy allowlist, offline/test isolation, share complete/cancel/denied/fallback, foreground clock, beacon ack semantics, persistent retry, queue bound, opt-out purge.',
);
