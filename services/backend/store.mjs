import { DatabaseSync } from 'node:sqlite';
import { logicalKey, registry } from './schema.mjs';
export function openStore(path) {
  const db = new DatabaseSync(path);
  const old = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='events'")
    .get();
  if (
    old &&
    !db
      .prepare('PRAGMA table_info(events)')
      .all()
      .some((c) => c.name === 'game_id')
  ) {
    db.close();
    throw new Error(
      'Legacy database detected. Use import-legacy.mjs into a new file; the old database is unchanged.',
    );
  }
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA user_version=2;
    CREATE TABLE IF NOT EXISTS events (game_id TEXT NOT NULL, id TEXT NOT NULL, logical_key TEXT UNIQUE NOT NULL, session TEXT NOT NULL, visitor TEXT NOT NULL, environment TEXT NOT NULL, type TEXT NOT NULL, at INTEGER NOT NULL, received INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(game_id,id)) STRICT;
    CREATE INDEX IF NOT EXISTS events_cohort ON events(game_id,environment,type,at);
    CREATE INDEX IF NOT EXISTS events_session ON events(game_id,session);
    CREATE INDEX IF NOT EXISTS events_received ON events(received);`);
  const insert = db.prepare('INSERT OR IGNORE INTO events VALUES (?,?,?,?,?,?,?,?,?,?)');
  const find = db.prepare(
    'SELECT visitor, environment FROM events WHERE game_id=? AND session=? LIMIT 1',
  );
  function ingest(events) {
    const accepted = [],
      rejected = [];
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const e of events) {
        const owner = find.get(e.game_id, e.session_id);
        if (owner && (owner.visitor !== e.visitor_id || owner.environment !== e.environment)) {
          rejected.push(e.id);
          continue;
        }
        insert.run(
          e.game_id,
          e.id,
          logicalKey(e),
          e.session_id,
          e.visitor_id,
          e.environment,
          e.type,
          e.at,
          Date.now(),
          JSON.stringify(e),
        );
        accepted.push(e.id);
      }
      db.exec('COMMIT');
      return { accepted, rejected };
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  function cohort(from, to, environment, gameId) {
    const rows = db
      .prepare(
        `SELECT e.body FROM events e JOIN (SELECT DISTINCT session FROM events WHERE type='session_start' AND game_id=? AND environment=? AND at>=? AND at<?) c ON c.session=e.session WHERE e.game_id=? AND e.environment=? ORDER BY e.at,e.id LIMIT 200001`,
      )
      .all(gameId, environment, from, to, gameId, environment);
    if (rows.length > 200000) throw new Error('Range too large; use a shorter date range');
    return rows.map((r) => JSON.parse(r.body));
  }
  function all(from, to, environment, gameId) {
    const query =
      gameId === 'all'
        ? 'SELECT body,received FROM events WHERE environment=? AND at>=? AND at<? ORDER BY at,id LIMIT 200001'
        : 'SELECT body,received FROM events WHERE environment=? AND at>=? AND at<? AND game_id=? ORDER BY at,id LIMIT 200001';
    return db
      .prepare(query)
      .all(...(gameId === 'all' ? [environment, from, to] : [environment, from, to, gameId]))
      .map((r) => ({ ...JSON.parse(r.body), received_at: r.received }));
  }
  function purge(days = 90) {
    return db.prepare('DELETE FROM events WHERE received < ?').run(Date.now() - days * 86400000)
      .changes;
  }
  return { db, ingest, cohort, all, purge };
}

const unique = (events, field) => new Set(events.map((e) => field(e))).size;
const rate = (n, d) => ({ numerator: n, denominator: d, value: d ? n / d : null });
export function summarize(events, gameId) {
  const game = registry.get(gameId);
  if (!game || events.some((e) => e.game_id !== gameId))
    throw new Error('A summary must contain exactly one registered game');
  const sessions = new Map(),
    runs = new Map(),
    daily = {},
    actions = {},
    sources = new Map(),
    dimensions = new Map();
  const outgoing = new Map();
  for (const e of events)
    if (['card_ready', 'link_copy', 'share_complete'].includes(e.type))
      outgoing.set(e.data.share_id, e.visitor_id);
  for (const e of events) {
    let s = sessions.get(e.session_id);
    if (!s) {
      s = { events: [], page: 0, foreground: 0, play: 0 };
      sessions.set(e.session_id, s);
    }
    s.events.push(e);
    s.page = Math.max(s.page, e.page_ms);
    s.foreground = Math.max(s.foreground, e.foreground_ms);
    s.play = Math.max(s.play, e.play_ms);
    if (e.type === 'session_start') s.entry = e;
    if (e.data.run_id) {
      const k = e.session_id + ':' + e.data.run_id;
      const r = runs.get(k) || [];
      r.push(e);
      runs.set(k, r);
    }
    actions[e.type] = (actions[e.type] || 0) + 1;
  }
  const cohort = [...sessions.values()].filter((s) => s.entry),
    starts = events.filter((e) => e.type === 'run_start'),
    loaded = events.filter((e) => e.type === 'load_success'),
    deaths = events.filter((e) => e.type === 'run_end');
  const startedSessions = new Set(starts.map((e) => e.session_id)),
    loadedSessions = new Set(loaded.map((e) => e.session_id));
  let replaySessions = 0,
    matched = 0,
    sameBrowser = 0;
  for (const s of cohort) {
    const e = s.entry,
      day = new Date(e.at).toISOString().slice(0, 10),
      count = s.events.filter((e) => e.type === 'run_start').length;
    const d = (daily[day] ??= {
      sessions: 0,
      loaded_sessions: 0,
      started_sessions: 0,
      runs: 0,
      foreground_ms: 0,
      play_ms: 0,
      visitors: new Set(),
      started_visitors: new Set(),
    });
    d.sessions++;
    d.loaded_sessions += Number(loadedSessions.has(e.session_id));
    d.started_sessions += Number(count > 0);
    d.runs += count;
    d.foreground_ms += s.foreground;
    d.play_ms += s.play;
    d.visitors.add(e.visitor_id);
    if (count) d.started_visitors.add(e.visitor_id);
    if (count >= 2) replaySessions++;
    const key = JSON.stringify(e.current),
      group = sources.get(key) || { ...e.current, sessions: 0, started_sessions: 0, runs: 0 };
    group.sessions++;
    group.started_sessions += Number(count > 0);
    group.runs += count;
    sources.set(key, group);
    const dimKey = [e.version, e.platform, e.language, e.device].join('/'),
      dim = dimensions.get(dimKey) || {
        version: e.version,
        platform: e.platform,
        language: e.language,
        device: e.device,
        sessions: 0,
        started_sessions: 0,
      };
    dim.sessions++;
    dim.started_sessions += Number(count > 0);
    dimensions.set(dimKey, dim);
    if (e.current.referral && outgoing.has(e.current.referral)) {
      matched++;
      if (outgoing.get(e.current.referral) === e.visitor_id) sameBrowser++;
    }
  }
  const completed = deaths.length,
    deathCauses = {},
    outcomes = {},
    edges = [0, ...game.score.buckets],
    labels = edges.map((n, i) => (i < edges.length - 1 ? `${n}–<${edges[i + 1]}` : `${n}+`)),
    scoreDistribution = Object.fromEntries(labels.map((k) => [k, 0])),
    perVisitor = new Map();
  for (const e of starts) perVisitor.set(e.visitor_id, (perVisitor.get(e.visitor_id) || 0) + 1);
  for (const e of deaths) {
    if (e.data.cause) deathCauses[e.data.cause] = (deathCauses[e.data.cause] || 0) + 1;
    outcomes[e.data.outcome] = (outcomes[e.data.outcome] || 0) + 1;
    const s = e.data.score;
    const index = edges.findLastIndex((n) => s >= n);
    scoreDistribution[labels[index]]++;
  }
  const shareSessions = unique(
    events.filter((e) => e.type === 'share_intent' && startedSessions.has(e.session_id)),
    (e) => e.session_id,
  );
  return {
    game_id: gameId,
    score_unit: game.score.unit,
    outcomes,
    sessions: cohort.length,
    visitors: unique(
      cohort.map((s) => s.entry),
      (e) => e.visitor_id,
    ),
    loaded_sessions: loadedSessions.size,
    started_sessions: startedSessions.size,
    started_visitors: perVisitor.size,
    runs: starts.length,
    completed_runs: completed,
    abandoned_runs: events.filter((e) => e.type === 'run_abandon').length,
    load_to_start: rate(
      [...startedSessions].filter((s) => loadedSessions.has(s)).length,
      loadedSessions.size,
    ),
    entry_to_start: rate(startedSessions.size, cohort.length),
    replay: rate(replaySessions, startedSessions.size),
    runs_per_started_session: rate(starts.length, startedSessions.size),
    runs_per_started_visitor: rate(starts.length, perVisitor.size),
    time_ms: {
      page: cohort.reduce((n, s) => n + s.page, 0),
      foreground: cohort.reduce((n, s) => n + s.foreground, 0),
      play: cohort.reduce((n, s) => n + s.play, 0),
    },
    milestones: Object.fromEntries(
      game.milestones.map((m) => [
        m.id,
        rate(
          unique(
            events.filter(
              (e) =>
                e.type === 'milestone' &&
                e.data.milestone === m.id &&
                runs.get(e.session_id + ':' + e.data.run_id)?.some((r) => r.type === 'run_start'),
            ),
            (e) => e.session_id + ':' + e.data.run_id,
          ),
          starts.length,
        ),
      ]),
    ),
    death_causes: deathCauses,
    score_distribution: scoreDistribution,
    mean_end_score: completed ? deaths.reduce((n, e) => n + e.data.score, 0) / completed : null,
    share_intent_rate: rate(shareSessions, startedSessions.size),
    referral_sessions: cohort.filter((s) => s.entry.current.referral).length,
    matched_referral_sessions_in_range: matched,
    same_browser_referral_sessions: sameBrowser,
    actions,
    sources: [...sources.values()],
    dimensions: [...dimensions.values()],
    daily: Object.entries(daily).map(([date, d]) => ({
      date,
      ...d,
      visitors: d.visitors.size,
      started_visitors: d.started_visitors.size,
    })),
  };
}
