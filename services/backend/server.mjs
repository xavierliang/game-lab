import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, chmod } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { openStore, summarize } from './store.mjs';
import { validEvent, normalizeLegacy, registry } from './schema.mjs';
import { ROOT, siteConfig, gamePublicConfig } from '../../tooling/registry.mjs';
const here = dirname(fileURLToPath(import.meta.url)),
  root = ROOT;
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
};
export async function createAnalyticsServer(options = {}) {
  const host = options.host || process.env.HOST || '127.0.0.1',
    port = Number(options.port ?? process.env.PORT ?? 8810);
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const origin = options.origin || process.env.PUBLIC_ORIGIN || `http://127.0.0.1:${port}`;
  const dataDir = resolve(options.dataDir || process.env.DATA_DIR || resolve(root, '.data'));
  const allowed = new Set(
    options.allowedOrigins ||
      String(process.env.ALLOWED_ORIGINS || `${origin},http://127.0.0.1:8746`)
        .split(',')
        .filter(Boolean),
  );
  if (new URL(origin).origin !== origin)
    throw new Error('PUBLIC_ORIGIN must be an origin without path or trailing slash');
  if (
    production &&
    (new URL(origin).protocol !== 'https:' ||
      (!process.env.ADMIN_TOKEN && !options.token) ||
      (!process.env.ALLOWED_ORIGINS && !options.allowedOrigins))
  )
    throw new Error(
      'Production requires HTTPS PUBLIC_ORIGIN, ADMIN_TOKEN, explicit ALLOWED_ORIGINS',
    );
  if (production)
    for (const value of allowed) {
      const u = new URL(value);
      if (u.origin !== value || u.protocol !== 'https:')
        throw new Error('Allowed origins must be exact HTTPS origins');
    }
  if (!production && !['127.0.0.1', 'localhost', '::1'].includes(host))
    throw new Error('Non-production service is loopback only');
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  let token = options.token || process.env.ADMIN_TOKEN;
  if (!token) {
    const path = resolve(dataDir, 'admin-token.txt');
    try {
      token = (await readFile(path, 'utf8')).trim();
    } catch {
      token = randomBytes(32).toString('hex');
      await writeFile(path, token + '\n', { mode: 0o600 });
    }
  }
  if (token.length < 32) throw new Error('ADMIN_TOKEN must contain at least 32 characters');
  const dbPath = resolve(dataDir, 'events.sqlite'),
    store = openStore(dbPath);
  await chmod(dbPath, 0o600);
  store.purge();
  const gameDir = resolve(options.gameDir || process.env.GAME_DIR || resolve(root, 'dist/site'));
  const site = siteConfig();
  const serveGames = options.serveGames ?? !production;
  const limits = new Map(),
    salt = randomBytes(24),
    maxRequests = options.maxRequests || Number(process.env.MAX_REQUESTS_PER_MINUTE) || 120;
  let globalWindow = 0,
    globalCount = 0;
  function rateLimit(req) {
    const minute = Math.floor(Date.now() / 60000);
    if (globalWindow !== minute) {
      globalWindow = minute;
      globalCount = 0;
      limits.clear();
    }
    if (++globalCount > 6000) return false;
    // Do not trust user-controlled forwarding headers; rate by proxy socket unless configured upstream.
    const key = createHash('sha256')
      .update(salt)
      .update(req.socket.remoteAddress || '')
      .digest('hex');
    const count = (limits.get(key) || 0) + 1;
    limits.set(key, count);
    return count <= maxRequests;
  }
  function authenticated(req) {
    const given = String(req.headers.authorization || '').replace(/^Bearer /, '');
    const a = Buffer.from(given),
      b = Buffer.from(token);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  function range(url) {
    const now = new Date().toISOString().slice(0, 10),
      from = url.searchParams.get('from') || now,
      to = url.searchParams.get('to') || now,
      environment = url.searchParams.get('environment') || 'production';
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
      !['production', 'test'].includes(environment)
    )
      throw new Error('Invalid date or environment');
    const a = Date.parse(from + 'T00:00:00Z'),
      b = Date.parse(to + 'T00:00:00Z') + 86400000;
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a || b - a > 93 * 86400000)
      throw new Error('Date range must be 1–93 UTC days');
    const gameId = url.searchParams.get('game_id') || 'orbital-drift';
    if (gameId !== 'all' && !registry.has(gameId)) throw new Error('Unknown game');
    return { from, to, a, b, environment, gameId };
  }
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: data:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
    );
    const json = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    try {
      const url = new URL(req.url, origin),
        path = decodeURIComponent(url.pathname);
      if (serveGames && [...registry.values()].some((g) => path.startsWith('/' + g.slug + '/')))
        res.setHeader(
          'Content-Security-Policy',
          `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self' ${[...allowed].join(' ')}`,
        );
      if (path === '/health' && req.method === 'GET') return json(200, { ok: true });
      if (['/events', '/v1/events', '/v2/events'].includes(path)) {
        const requestOrigin = req.headers.origin;
        if (!allowed.has(requestOrigin)) return json(403, { error: 'Origin not allowed' });
        res.setHeader('Access-Control-Allow-Origin', requestOrigin);
        res.setHeader('Vary', 'Origin');
        if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Methods', 'POST');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          res.writeHead(204);
          return res.end();
        }
        if (req.method !== 'POST') return json(405, { error: 'POST required' });
        if (!rateLimit(req)) {
          res.setHeader('Retry-After', '60');
          return json(429, { error: 'Rate limited' });
        }
        if (
          !/^(text\/plain|application\/json)(;|$)/.test(String(req.headers['content-type'] || ''))
        )
          return json(415, { error: 'Unsupported content type' });
        if (Number(req.headers['content-length']) > 32768)
          return json(413, { error: 'Request too large' });
        let size = 0,
          parts = [];
        for await (const part of req) {
          size += part.length;
          if (size > 32768) {
            json(413, { error: 'Request too large' });
            return;
          }
          parts.push(part);
        }
        let body;
        try {
          body = JSON.parse(Buffer.concat(parts).toString('utf8'));
        } catch {
          return json(400, { error: 'Invalid JSON' });
        }
        if (
          !body ||
          Object.keys(body).length !== 1 ||
          !Array.isArray(body.events) ||
          body.events.length < 1 ||
          body.events.length > 20
        )
          return json(400, { error: 'Expected 1–20 events' });
        const valid = [],
          rejected = [];
        for (const raw of body.events) {
          const e = path === '/v2/events' ? raw : normalizeLegacy(raw);
          if (validEvent(e)) valid.push(e);
          else if (typeof raw?.id === 'string' && raw.id.length <= 64) rejected.push(raw.id);
        }
        const today = Math.floor(Date.now() / 86400000) * 86400000;
        if (
          store.db.prepare('SELECT count(*) n FROM events WHERE received>=?').get(today).n +
            valid.length >
          Number(process.env.MAX_EVENTS_PER_DAY || 100000)
        ) {
          res.setHeader('Retry-After', '3600');
          return json(429, { error: 'Daily collection capacity reached' });
        }
        const result = store.ingest(valid);
        return json(200, {
          accepted: result.accepted,
          rejected: [...rejected, ...result.rejected],
        });
      }
      if (path.startsWith('/admin/')) {
        if (req.method !== 'GET') return json(405, { error: 'GET required' });
        if (!authenticated(req)) {
          if (!rateLimit(req)) return json(429, { error: 'Rate limited' });
          return json(401, { error: 'Admin token required' });
        }
        if (path === '/admin/games') return json(200, { games: [...registry.values()] });
        const r = range(url);
        if (path === '/admin/summary') {
          const meta = {
            range: {
              from: r.from,
              to: r.to,
              timezone: 'UTC',
              environment: r.environment,
              game_id: r.gameId,
              basis:
                'session-start cohort; all received events for these sessions, as of query time',
            },
            as_of: new Date().toISOString(),
          };
          if (r.gameId === 'all') {
            const games = [...registry.keys()].map((id) =>
              summarize(store.cohort(r.a, r.b, r.environment, id), id),
            );
            return json(200, {
              ...meta,
              games,
              totals: {
                sessions: games.reduce((n, g) => n + g.sessions, 0),
                runs: games.reduce((n, g) => n + g.runs, 0),
              },
              visitor_scope: 'per-game anonymous IDs; do not sum into unique people',
            });
          }
          return json(200, {
            ...meta,
            ...summarize(store.cohort(r.a, r.b, r.environment, r.gameId), r.gameId),
          });
        }
        if (path === '/admin/export') {
          const events = store.all(r.a, r.b, r.environment, r.gameId);
          if (events.length > 200000)
            return json(413, { error: 'Export too large; shorten the range' });
          const csv = url.searchParams.get('format') === 'csv',
            fields = [
              'game_id',
              'schema',
              'sdk_version',
              'id',
              'type',
              'at',
              'received_at',
              'session_id',
              'visitor_id',
              'version',
              'environment',
              'platform',
              'language',
              'device',
              'page_ms',
              'foreground_ms',
              'play_ms',
              'current',
              'first',
              'data',
            ];
          res.writeHead(200, {
            'Content-Type': csv ? 'text/csv; charset=utf-8' : 'application/x-ndjson',
            'Content-Disposition': `attachment; filename="game-lab-events-${r.environment}-${r.from}.${csv ? 'csv' : 'ndjson'}"`,
          });
          // Quote all fields and neutralize spreadsheet formula prefixes.
          const cell = (v) => {
            let s = typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');
            if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
            return '"' + s.replaceAll('"', '""') + '"';
          };
          return res.end(
            csv
              ? [
                  fields.join(','),
                  ...events.map((e) => fields.map((k) => cell(e[k])).join(',')),
                ].join('\r\n')
              : events.map((e) => JSON.stringify(e)).join('\n') + (events.length ? '\n' : ''),
          );
        }
        return json(404, { error: 'Not found' });
      }
      if (req.method !== 'GET' && req.method !== 'HEAD')
        return json(405, { error: 'GET required' });
      let file;
      if (path === '/admin') file = resolve(here, 'admin.html');
      else if (path === '/admin.js') file = resolve(here, 'admin.js');
      else if (serveGames) {
        if (path === '/play.html') {
          const u = new URL('/orbital-drift/', origin);
          for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'ref'])
            if (url.searchParams.has(k)) u.searchParams.set(k, url.searchParams.get(k));
          res.writeHead(302, { Location: u.pathname + u.search });
          return res.end();
        }
        if (path === '/games.json')
          return json(200, { title: site.siteTitle, games: [...registry.values()] });
        const game = [...registry.values()].find((g) => path.startsWith('/' + g.slug + '/'));
        if (game && path === `/${game.slug}/game-config.js`) {
          res.writeHead(200, { 'Content-Type': 'text/javascript' });
          return res.end(
            'window.__GAME_CONFIG__=' +
              JSON.stringify({
                ...gamePublicConfig(game, site),
                analyticsEndpoint: origin + '/v2/events',
                environment: 'test',
              }) +
              ';',
          );
        }
        const bare = [...registry.values()].find((g) => path === '/' + g.slug);
        if (bare) {
          res.writeHead(308, { Location: path + '/' + url.search });
          return res.end();
        }
        const relative =
          path === '/'
            ? 'index.html'
            : path.endsWith('/')
              ? path.slice(1) + 'index.html'
              : path.slice(1);
        file = resolve(gameDir, relative);
        if (!file.startsWith(gameDir + sep)) return json(403, { error: 'Forbidden' });
        if (
          !(
            game || ['/', '/index.html', '/portal.js', '/portal.css', '/favicon.svg'].includes(path)
          )
        )
          return json(404, { error: 'Not found' });
      } else return json(404, { error: 'Not found' });
      try {
        const bytes = await readFile(file);
        res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
        res.end(req.method === 'HEAD' ? undefined : bytes);
      } catch {
        return json(404, { error: 'File not found. Build the game first.' });
      }
    } catch (error) {
      if (!res.headersSent)
        json(400, {
          error:
            error.message === 'Range too large; use a shorter date range'
              ? error.message
              : 'Invalid request',
        });
      else res.end();
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.maxHeadersCount = 50;
  const cleanup = setInterval(() => store.purge(), 86400000);
  cleanup.unref();
  server.on('close', () => {
    clearInterval(cleanup);
    store.db.close();
  });
  return { server, store, host, port, origin, dataDir };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await createAnalyticsServer();
  app.server.listen(app.port, app.host, () =>
    console.log(
      `Game Lab service (${process.env.NODE_ENV === 'production' ? 'production' : 'LOCAL TEST'})\nGames: ${app.origin}/\nData: ${app.origin}/admin\nLocal admin key file (if not supplied via env): ${app.dataDir}/admin-token.txt`,
    ),
  );
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => app.server.close(() => process.exit(0)));
}
