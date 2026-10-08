import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createAnalyticsServer } from '../services/backend/server.mjs';
import { fixture } from './contracts.mjs';
const dir = await mkdtemp(join(tmpdir(), 'game-lab-service-')),
  token = 'temporary-test-token-'.repeat(3),
  origin = 'http://127.0.0.1:8810';
let app;
try {
  app = await createAnalyticsServer({ port: 0, dataDir: dir, token, allowedOrigins: [origin] });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  let base = `http://127.0.0.1:${app.server.address().port}`;
  const post = (events, path = '/v2/events', o = origin) =>
    fetch(base + path, {
      method: 'POST',
      headers: { Origin: o, 'Content-Type': 'text/plain' },
      body: JSON.stringify({ events }),
    });
  const headers = { Authorization: 'Bearer ' + token };
  const get = (id) =>
    fetch(base + '/admin/summary?environment=test&game_id=' + id, { headers }).then((r) =>
      r.json(),
    );
  const sid = randomUUID(),
    visitor = randomUUID(),
    run = randomUUID(),
    eid = randomUUID();
  for (const game of ['orbital-drift', 'signal-tap']) {
    const extra = { session_id: sid, visitor_id: visitor },
      score = game === 'orbital-drift' ? 30 : 10,
      milestone = game === 'orbital-drift' ? 'survive-30' : 'five-hits';
    const events = [
      fixture('session_start', game, {}, { ...extra, id: eid }),
      fixture('load_success', game, {}, extra),
      fixture('run_start', game, { run_id: run, score: 0, index: 1 }, extra),
      fixture('milestone', game, { run_id: run, score, milestone }, extra),
      fixture(
        'run_end',
        game,
        {
          run_id: run,
          score,
          outcome: game === 'orbital-drift' ? 'failed' : 'completed',
          ...(game === 'orbital-drift' ? { cause: 'planet', new_record: true } : {}),
        },
        extra,
      ),
    ];
    assert.equal((await post(events)).status, 200);
    await post(events);
    await post(events.map((e) => ({ ...e, id: randomUUID() })));
  }
  const orbital = await get('orbital-drift'),
    signal = await get('signal-tap');
  assert.equal(orbital.sessions, 1);
  assert.equal(signal.sessions, 1);
  assert.equal(orbital.runs, 1);
  assert.equal(signal.runs, 1);
  assert.equal(orbital.score_unit, 'seconds');
  assert.equal(signal.score_unit, 'hits');
  assert.equal(signal.mean_end_score, 10);
  assert.equal(orbital.mean_end_score, 30);
  assert.ok(!signal.milestones['survive-30']);
  assert.equal(signal.milestones['five-hits'].value, 1);
  assert.equal((await get('all')).totals.sessions, 2);
  assert.equal((await get('all')).games.length, 2);
  const exported = await (
    await fetch(base + '/admin/export?environment=test&game_id=signal-tap', { headers })
  ).text();
  assert.equal(exported.trim().split('\n').length, 5);
  assert.ok(
    exported
      .trim()
      .split('\n')
      .every((l) => JSON.parse(l).game_id === 'signal-tap'),
  );
  assert.equal((await fetch(base + '/admin/summary')).status, 401);
  assert.equal((await fetch(base + '/admin/games')).status, 401);
  assert.equal((await fetch(base + '/admin/export?token=' + token)).status, 401);
  assert.equal(
    (
      await fetch(base + '/admin/export', {
        headers: { Authorization: 'Bearer ' + 'x'.repeat(token.length) },
      })
    ).status,
    401,
  );
  assert.equal((await fetch(base + '/.data/admin-token.txt')).status, 404);
  assert.equal((await fetch(base + '/orbital-drift/..%2f..%2f.data/admin-token.txt')).status, 403);
  const csv = await fetch(base + '/admin/export?environment=test&game_id=signal-tap&format=csv', {
    headers,
  });
  assert.match(csv.headers.get('content-disposition'), /^attachment;/);
  assert.equal((await csv.text()).split('\r\n').length, 6);
  const malformed = await fetch(base + '/v2/events', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'text/plain' },
    body: '{',
  });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { error: 'Invalid JSON' });
  assert.equal((await post([fixture()], '/v2/events', 'https://bad.invalid')).status, 403);
  assert.equal(
    (
      await fetch(base + '/v2/events', {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'text/plain' },
        body: 'x'.repeat(33000),
      })
    ).status,
    413,
  );
  const invalid = fixture('milestone', 'signal-tap', {
    run_id: run,
    score: 30,
    milestone: 'survive-30',
  });
  assert.deepEqual((await (await post([invalid])).json()).rejected, [invalid.id]);
  // Old published clients use the explicit legacy route, never inferred game IDs.
  const v1 = fixture();
  delete v1.game_id;
  delete v1.sdk_version;
  v1.schema = 1;
  v1.version = '1.1.0';
  assert.deepEqual((await (await post([v1], '/events')).json()).accepted, [v1.id]);
  assert.equal((await get('orbital-drift')).sessions, 2);
  assert.equal((await get('signal-tap')).sessions, 1);
  assert.deepEqual((await (await post([v1], '/v2/events')).json()).rejected, [v1.id]);
  const prod = await (await fetch(base + '/admin/summary?game_id=all', { headers })).json();
  assert.equal(prod.totals.sessions, 0);
  await new Promise((r) => app.server.close(r));
  app = await createAnalyticsServer({
    port: 0,
    dataDir: dir,
    token,
    allowedOrigins: [origin],
    maxRequests: 2,
  });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.server.address().port}`;
  assert.equal((await get('signal-tap')).sessions, 1, 'Durable restart');
  await post([fixture()]);
  await post([fixture()]);
  assert.equal((await post([fixture()])).status, 429);
  app.store.db.prepare('UPDATE events SET received=?').run(Date.now() - 91 * 86400000);
  assert.ok(app.store.purge() > 0);
  await new Promise((r) => app.server.close(r));
  app = await createAnalyticsServer({
    production: true,
    port: 0,
    dataDir: dir,
    token,
    origin: 'https://data.game.test',
    allowedOrigins: ['https://play.game.test'],
  });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.server.address().port}`;
  for (const path of ['/', '/orbital-drift/', '/play.html', '/.data/events.sqlite'])
    assert.equal(
      (await fetch(base + path)).status,
      404,
      'Production API exposes no game or data files',
    );
  assert.equal((await fetch(base + '/admin/games', { headers })).status, 200);
  assert.equal(
    (await post([fixture()], '/v2/events', 'https://play.game.test.attacker.test')).status,
    403,
  );
  const dailyLimit = process.env.MAX_EVENTS_PER_DAY;
  try {
    process.env.MAX_EVENTS_PER_DAY = '1';
    assert.equal((await post([fixture()], '/v2/events', 'https://play.game.test')).status, 200);
    assert.equal((await post([fixture()], '/v2/events', 'https://play.game.test')).status, 429);
  } finally {
    if (dailyLimit === undefined) delete process.env.MAX_EVENTS_PER_DAY;
    else process.env.MAX_EVENTS_PER_DAY = dailyLimit;
  }
  console.log(
    'PASS: two games with intentionally colliding IDs remain isolated; HTTP ack/dedupe; game-filtered scores, summaries and export; v1 compatibility; auth/CORS/size/rate/retention; durable restart; production zero.',
  );
} finally {
  if (app?.server.listening) await new Promise((r) => app.server.close(r));
  await rm(dir, { recursive: true, force: true });
}
