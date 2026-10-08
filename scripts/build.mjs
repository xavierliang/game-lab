import { build } from 'vite';
import { mkdir, cp, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT, loadGames, siteConfig, gamePublicConfig } from '../tooling/registry.mjs';
const args = process.argv.slice(2),
  id = args[0] === '--game' ? args[1] : args[0],
  all = loadGames(),
  selected = id ? all.filter((g) => g.id === id) : all;
if (!selected.length) throw new Error('Unknown game');
const site = siteConfig();
await mkdir(resolve(ROOT, 'dist/site'), { recursive: true });
for (const game of selected) {
  await build({ configFile: resolve(ROOT, 'games', game.id, 'vite.config.ts') });
  const source = resolve(ROOT, 'dist/games', game.id),
    target = resolve(ROOT, 'dist/site', game.slug);
  await writeFile(
    resolve(source, 'game-config.js'),
    'window.__GAME_CONFIG__=' + JSON.stringify(gamePublicConfig(game, site, 'itch')) + ';\n',
  );
  await rm(target, { recursive: true, force: true });
  await cp(source, target, { recursive: true });
  await writeFile(
    resolve(target, 'game-config.js'),
    'window.__GAME_CONFIG__=' + JSON.stringify(gamePublicConfig(game, site)) + ';\n',
  );
}
await cp(resolve(ROOT, 'apps/portal/public'), resolve(ROOT, 'dist/site'), { recursive: true });
await writeFile(
  resolve(ROOT, 'dist/site/games.json'),
  JSON.stringify(
    {
      title: site.siteTitle,
      games: all
        .filter((g) => g.status === 'ready' || site.includeExamples)
        .map((g) => ({
          id: g.id,
          slug: g.slug,
          title: g.title,
          description: g.description,
          status: g.status,
          version: g.version,
        })),
    },
    null,
    2,
  ) + '\n',
);
console.log('Built: ' + selected.map((g) => g.id).join(', '));
