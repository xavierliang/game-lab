import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createAnalyticsServer } from '../services/backend/server.mjs';
const dataDir = await mkdtemp(join(tmpdir(), 'game-lab-browser-')),
  out = resolve('test-results');
await mkdir(out, { recursive: true });
const base = 'http://127.0.0.1:8891',
  token = 'browser-test-credential-'.repeat(3),
  app = await createAnalyticsServer({
    port: 8891,
    origin: base,
    dataDir,
    token,
    allowedOrigins: [base],
  });
await new Promise((r) => app.server.listen(8891, '127.0.0.1', r));
const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
    headless: true,
  }),
  ctx = await browser.newContext({
    viewport: { width: 960, height: 600 },
    locale: 'en-US',
    acceptDownloads: true,
  });
await ctx.addInitScript(() => {
  const tools = {};
  document.modelContext = {
    registerTool(t) {
      tools[t.name] = t;
    },
  };
  window.__qaTools = tools;
});
const page = await ctx.newPage(),
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const state = () => page.evaluate(() => window.__qaTools.read_flight_state.execute({}));
const events = () =>
  app.store.db
    .prepare('SELECT body FROM events')
    .all()
    .map((r) => JSON.parse(r.body));
const wait = async (fn, message) => {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(message);
};
const report = { browser: browser.version(), checks: [] };
try {
  await page.goto(base + '/?utm_source=monorepo-qa&utm_campaign=migration&private=do-not-forward');
  await page.getByRole('heading', { name: '近星轨道' }).waitFor();
  await page.getByRole('heading', { name: '信号点击' }).waitFor();
  await page.screenshot({ path: join(out, 'portal.png') });
  await page.getByRole('link', { name: '开始游玩', exact: false }).first().click();
  assert.match(page.url(), /\/orbital-drift\//);
  assert.ok(!page.url().includes('private='));
  await page.getByRole('button', { name: 'Enter orbit', exact: false }).click();
  await page.waitForTimeout(350);
  const first = (await state()).runId;
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const paused = (await state()).time;
  await page.waitForTimeout(250);
  assert.equal((await state()).time, paused);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('.launch-button').click();
  await page.keyboard.down('KeyW');
  await page.locator('main[data-mode="over"]').waitFor({ timeout: 25000 });
  await page.keyboard.up('KeyW');
  await page.getByRole('button', { name: 'Share flight', exact: false }).click();
  await page.locator('.score-preview').waitFor();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download PNG' }).click();
  await (await download).saveAs(join(out, 'orbital-score.png'));
  const png = await readFile(join(out, 'orbital-score.png'));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 1200);
  await page.screenshot({ path: join(out, 'orbital-share.png') });
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async () => {
        throw new DOMException('cancel', 'AbortError');
      },
    });
  });
  await page.getByRole('button', { name: 'System share' }).click();
  await page.getByText('Share dismissed or no target available. Nothing was confirmed.').waitFor();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Fly again', exact: false }).click();
  assert.notEqual((await state()).runId, first);
  await ctx.setOffline(true);
  await page.keyboard.press('KeyR');
  const offlineRun = (await state()).runId;
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await ctx.setOffline(false);
  await page.evaluate(() => dispatchEvent(new Event('online')));
  await wait(
    () => events().some((e) => e.data.run_id === offlineRun && e.type === 'run_start'),
    'Offline queue was not delivered',
  );
  for (const [width, height] of [
    [320, 568],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.locator('.launch-button').click();
    const overlap = await page.evaluate(() => {
      const a = document.querySelector('.best-time').getBoundingClientRect(),
        b = document.querySelector('.milestone-target').getBoundingClientRect();
      return b.top < a.bottom;
    });
    assert.equal(overlap, false);
    await page.screenshot({ path: join(out, `orbital-${width}x${height}.png`) });
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
  }
  await wait(
    () => events().some((e) => e.game_id === 'orbital-drift' && e.type === 'run_end'),
    'Orbital end did not reach v2',
  );
  const orbitEvents = events().filter((e) => e.game_id === 'orbital-drift');
  assert.ok(orbitEvents.some((e) => e.data.cause === 'boundary'));
  assert.ok(orbitEvents.every((e) => e.schema === 2 && e.sdk_version === '1.0.2'));
  report.checks.push(
    'Orbital: real play, pause, new run IDs, offline retry, PNG, share cancellation, narrow/landscape, v2 flight adapter',
  );
  await page.setViewportSize({ width: 960, height: 780 });
  await page.goto(base + '/signal-tap/?utm_source=second-game-qa');
  await page.getByRole('button', { name: '开始', exact: true }).click();
  await page.waitForTimeout(200);
  for (let i = 0; i < 10; i++)
    await page.getByRole('button', { name: '点击信号', exact: true }).click();
  await page.getByText('十次信号，全部捕获！').waitFor();
  await page.getByRole('button', { name: '分享成绩', exact: true }).click();
  await page.locator('#preview').waitFor();
  const signalDownload = page.waitForEvent('download');
  await page.getByRole('link', { name: '下载 PNG' }).click();
  await (await signalDownload).saveAs(join(out, 'signal-score.png'));
  assert.equal((await readFile(join(out, 'signal-score.png'))).readUInt32BE(20), 800);
  await page.screenshot({ path: join(out, 'signal-tap.png') });
  await wait(
    () => events().some((e) => e.game_id === 'signal-tap' && e.type === 'run_end'),
    'Second game end not stored',
  );
  const second = events().filter((e) => e.game_id === 'signal-tap');
  assert.ok(second.some((e) => e.type === 'milestone' && e.data.milestone === 'five-hits'));
  assert.equal(new Set(second.map((e) => e.visitor_id)).size, 1);
  assert.notEqual(second[0].visitor_id, orbitEvents[0].visitor_id);
  assert.ok(second.every((e) => e.environment === 'test'));
  report.checks.push(
    'Signal Tap uses the same SDK: own identity, milestones, completion score and PNG; Test-only',
  );
  // Opting out on one game stops the next game from collecting on this origin.
  await page.getByText('数据与隐私', { exact: true }).click();
  await page.locator('#tracking').uncheck();
  const before = events().length;
  await page.goto(base + '/orbital-drift/');
  await page.getByRole('button', { name: 'Enter orbit', exact: false }).click();
  await page.waitForTimeout(400);
  assert.equal(events().length, before);
  report.checks.push('Shared privacy opt-out applies across games without mixing best scores');
  await page.goto(base + '/');
  await page.getByRole('heading', { name: '近星轨道' }).waitFor();
  await page.evaluate(() => {
    document.body.replaceChildren();
    const frame = document.createElement('iframe');
    frame.src = '/orbital-drift/';
    frame.title = 'Embedded game';
    frame.width = '960';
    frame.height = '600';
    frame.allow = 'autoplay; fullscreen; web-share';
    document.body.append(frame);
  });
  await page
    .frameLocator('iframe')
    .getByRole('button', { name: 'Enter orbit', exact: false })
    .click();
  await page.frameLocator('iframe').locator('main[data-mode="playing"]').waitFor();
  report.checks.push('Migrated game loads with relative assets in an iframe');
  for (const [id, version] of [
    ['orbital-drift', '1.2.2'],
    ['signal-tap', '0.1.2'],
  ]) {
    await page.goto('file://' + resolve(`release/${id}/${version}/preview.html`));
    if (id === 'orbital-drift')
      await page.getByRole('button', { name: 'Enter orbit', exact: false }).click();
    else await page.getByRole('button', { name: '开始', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__GAME_OFFLINE__), true);
  }
  report.checks.push('Both standalone offline HTML files open and start');
  await page.goto(base + '/admin');
  await page.locator('#token').fill(token);
  await page.locator('#environment').selectOption('test');
  for (const id of ['orbital-drift', 'signal-tap', 'all']) {
    await page.locator('#game').selectOption(id);
    await page.getByRole('button', { name: '查看汇总', exact: true }).click();
    await page.getByText('已读取真实存储数据。').waitFor();
    const result = JSON.parse(await page.locator('#raw').textContent());
    assert.equal(result.range.game_id, id);
    if (id !== 'all') assert.ok(result.runs >= 1);
  }
  await page.screenshot({ path: join(out, 'multi-game-admin.png') });
  report.checks.push(
    'Protected per-game and portfolio summaries show separate actual browser Test data',
  );
  assert.deepEqual(errors, []);
  report.status = 'PASS';
  await writeFile(join(out, 'browser-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await page.screenshot({ path: join(out, 'last-browser.png') }).catch(() => {});
  await browser.close();
  await new Promise((r) => app.server.close(r));
  await rm(dataDir, { recursive: true, force: true });
}
