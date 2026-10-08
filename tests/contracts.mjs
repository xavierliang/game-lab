import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { loadGames, siteConfig } from '../tooling/registry.mjs';
import { validEvent, normalizeLegacy, logicalKey } from '../services/backend/schema.mjs';
const games = loadGames();
for (const game of games)
  assert.equal(
    game.version,
    JSON.parse(readFileSync(new URL(`../games/${game.id}/package.json`, import.meta.url), 'utf8'))
      .version,
    'Game package and manifest versions must agree',
  );
assert.equal(new Set(games.map((g) => g.id)).size, games.length);
assert.ok(games.length >= 2);
assert.equal(siteConfig().publicOrigin, '');
const source = {
  source: 'qa',
  medium: 'test',
  campaign: '',
  content: '',
  referral: '',
  evidence: 'query',
};
export function fixture(type = 'session_start', gameId = 'orbital-drift', data = {}, extra = {}) {
  return {
    schema: 2,
    game_id: gameId,
    sdk_version: '1.0.0',
    id: randomUUID(),
    type,
    at: Date.now(),
    session_id: randomUUID(),
    visitor_id: randomUUID(),
    version: gameId === 'orbital-drift' ? '1.2.0' : '0.1.0',
    environment: 'test',
    platform: 'standalone',
    language: 'en',
    device: 'pointer',
    current: source,
    first: source,
    page_ms: 40000,
    foreground_ms: 30000,
    play_ms: 25000,
    data,
    ...extra,
  };
}
assert.ok(validEvent(fixture()));
assert.ok(!validEvent(fixture('session_start', 'unknown')));
assert.ok(!validEvent(fixture('session_start', 'signal-tap', {}, { environment: 'production' })));
const run = randomUUID();
assert.ok(
  validEvent(
    fixture('milestone', 'orbital-drift', { run_id: run, score: 30, milestone: 'survive-30' }),
  ),
);
assert.ok(
  !validEvent(
    fixture('milestone', 'signal-tap', { run_id: run, score: 30, milestone: 'survive-30' }),
  ),
);
assert.ok(
  validEvent(fixture('milestone', 'signal-tap', { run_id: run, score: 5, milestone: 'five-hits' })),
);
assert.ok(
  !validEvent(
    fixture('run_end', 'signal-tap', {
      run_id: run,
      score: 10,
      outcome: 'completed',
      cause: 'planet',
    }),
  ),
);
assert.ok(!validEvent({ ...fixture(), email: 'not-collected@example.invalid' }));
const legacy = {
  ...fixture('death', 'orbital-drift', {
    run_id: run,
    score_ms: 30400,
    cause: 'planet',
    new_record: true,
  }),
  schema: 1,
  version: '1.1.0',
};
delete legacy.game_id;
delete legacy.sdk_version;
const adapted = normalizeLegacy(legacy);
assert.ok(validEvent(adapted));
assert.equal(adapted.data.score, 30.4);
assert.equal(adapted.type, 'run_end');
assert.equal(adapted.sdk_version, '0.0.0');
assert.equal(normalizeLegacy({ ...legacy, game_id: 'signal-tap' }), null);
assert.equal(normalizeLegacy({ ...legacy, data: { ...legacy.data, email: 'bad' } }), null);
const same = fixture();
assert.notEqual(logicalKey(same), logicalKey({ ...same, game_id: 'signal-tap' }));
assert.notEqual(logicalKey(same), logicalKey({ ...same, environment: 'production' }));
console.log(
  'PASS: registry identity, per-game score/milestone contracts, example exclusion, private field rejection, explicit v1 compatibility and game-scoped logical dedupe.',
);
