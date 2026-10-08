import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const slug = /^[a-z][a-z0-9-]{0,47}$/;
export function loadGames(root = ROOT) {
  const games = readdirSync(resolve(root, 'games'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const g = JSON.parse(readFileSync(resolve(root, 'games', d.name, 'game.json'), 'utf8'));
      if (
        !slug.test(g.id) ||
        !slug.test(g.slug) ||
        g.id !== d.name ||
        !/^\d+\.\d+\.\d+$/.test(g.version) ||
        !['ready', 'example'].includes(g.status) ||
        !g.title?.en ||
        !g.title?.zh ||
        !g.description?.en ||
        !g.description?.zh
      )
        throw new Error(`Invalid game identity: ${d.name}`);
      if (
        !Array.isArray(g.milestones) ||
        !Array.isArray(g.causes) ||
        !g.causes.every((c) => slug.test(c)) ||
        !g.milestones.every((m) => slug.test(m.id) && Number.isFinite(m.value) && m.value > 0) ||
        new Set(g.milestones.map((m) => m.id)).size !== g.milestones.length
      )
        throw new Error(`Invalid game metrics: ${g.id}`);
      if (
        !g.score?.unit ||
        !slug.test(g.score.unit) ||
        !Array.isArray(g.score.buckets) ||
        !g.score.buckets.every((n, i, a) => Number.isFinite(n) && n > 0 && (!i || n > a[i - 1]))
      )
        throw new Error(`Invalid score definition: ${g.id}`);
      return g;
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(games.map((g) => g.slug)).size !== games.length)
    throw new Error('Duplicate public slug');
  if (games.some((g) => ['admin', 'health', 'v1', 'v2', 'events', 'assets'].includes(g.slug)))
    throw new Error('Reserved public slug');
  return games;
}
export function siteConfig() {
  const c = JSON.parse(
    readFileSync(process.env.SITE_CONFIG || resolve(ROOT, 'site.config.json'), 'utf8'),
  );
  for (const key of ['publicOrigin', 'analyticsEndpoint'])
    if (c[key]) {
      const u = new URL(c[key]);
      if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash)
        throw new Error(`${key} must be public HTTPS`);
      if (key === 'publicOrigin' && u.origin !== c[key])
        throw new Error('publicOrigin must not contain a path');
    }
  return c;
}
export function gamePublicConfig(game, site, platform = 'standalone') {
  return {
    gameId: game.id,
    analyticsEndpoint: site.analyticsEndpoint || '',
    officialUrl: site.games?.[game.id]?.officialUrl || '',
    playUrl: site.publicOrigin ? `${site.publicOrigin}/${game.slug}/` : '',
    environment: game.status === 'example' ? 'test' : 'production',
    platform,
  };
}
