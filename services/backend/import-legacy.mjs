import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, chmodSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { openStore } from './store.mjs';
import { normalizeLegacy, validEvent } from './schema.mjs';
const [inputArg, outputArg] = process.argv.slice(2);
if (!inputArg || !outputArg)
  throw new Error('Usage: node services/backend/import-legacy.mjs OLD.sqlite NEW.sqlite');
const input = resolve(inputArg),
  output = resolve(outputArg);
if (input === output || existsSync(output))
  throw new Error('Output must be a new file; never overwrite the legacy database');
mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
const source = new DatabaseSync(input, { readOnly: true }),
  dest = openStore(output);
let count = 0,
  rejected = 0;
try {
  for (const row of source.prepare('SELECT body,received FROM events').iterate()) {
    const e = normalizeLegacy(JSON.parse(row.body));
    if (!e || !validEvent(e, e.at)) {
      rejected++;
      continue;
    }
    dest.ingest([e]);
    dest.db
      .prepare('UPDATE events SET received=? WHERE game_id=? AND id=?')
      .run(row.received, e.game_id, e.id);
    count++;
  }
  dest.purge();
  chmodSync(output, 0o600);
  console.log(
    JSON.stringify({
      imported: count,
      rejected,
      game_id: 'orbital-drift',
      sourceUnchanged: true,
      retentionApplied: true,
    }),
  );
} finally {
  source.close();
  dest.db.close();
}
