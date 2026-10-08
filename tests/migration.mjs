import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { openStore } from '../services/backend/store.mjs';
const dir = await mkdtemp(join(tmpdir(), 'game-lab-legacy-')),
  old = join(dir, 'old.sqlite'),
  fresh = join(dir, 'new.sqlite');
try {
  const db = new DatabaseSync(old);
  db.exec('CREATE TABLE events (body TEXT,received INTEGER)');
  const src = {
      source: 'legacy-test',
      medium: 'test',
      campaign: '',
      content: '',
      referral: '',
      evidence: 'query',
    },
    e = {
      schema: 1,
      id: randomUUID(),
      type: 'session_start',
      at: Date.now(),
      session_id: randomUUID(),
      visitor_id: randomUUID(),
      version: '1.1.0',
      environment: 'test',
      platform: 'itch',
      language: 'en',
      device: 'pointer',
      current: src,
      first: src,
      page_ms: 0,
      foreground_ms: 0,
      play_ms: 0,
      data: {},
    };
  db.prepare('INSERT INTO events VALUES (?,?)').run(JSON.stringify(e), Date.now());
  db.close();
  const bytes = await readFile(old);
  assert.throws(() => openStore(old), /Legacy database detected/);
  assert.deepEqual(await readFile(old), bytes, 'Opening legacy data must not mutate it');
  execFileSync(process.execPath, [resolve('services/backend/import-legacy.mjs'), old, fresh], {
    stdio: 'pipe',
  });
  const store = openStore(fresh);
  assert.equal(store.db.prepare('SELECT game_id FROM events').get().game_id, 'orbital-drift');
  store.db.close();
  assert.deepEqual(await readFile(old), bytes);
  assert.throws(() =>
    execFileSync(process.execPath, [resolve('services/backend/import-legacy.mjs'), old, fresh], {
      stdio: 'pipe',
    }),
  );
  console.log(
    'PASS: explicit legacy import preserves original bytes and refuses in-place/overwrite migration.',
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
