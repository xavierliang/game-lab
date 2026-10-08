import { cp, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = process.cwd(),
  id = process.argv[2];
if (
  !id ||
  !/^[a-z][a-z0-9-]{1,47}$/.test(id) ||
  ['admin', 'health', 'events', 'v1', 'v2', 'assets', 'portal'].includes(id)
)
  throw new Error('Usage: npm run new:game -- my-game (2–48 lowercase letters, digits or hyphens)');
if (JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).name !== 'game-lab')
  throw new Error('Run from the game-lab repository root');
const target = resolve(root, 'games', id);
try {
  await access(target);
  throw new Error('Game already exists');
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
await mkdir(target);
for (const file of ['web', 'public', 'vite.config.ts', 'game.json', 'package.json'])
  await cp(resolve(root, 'games/signal-tap', file), resolve(target, file), { recursive: true });
for (const file of [
  'web/index.html',
  'web/main.ts',
  'public/game-config.js',
  'game.json',
  'package.json',
]) {
  const p = resolve(target, file);
  await writeFile(
    p,
    (await readFile(p, 'utf8'))
      .replaceAll('signal-tap', id)
      .replaceAll('信号点击', id)
      .replaceAll('Signal Tap', id),
  );
}
console.log(
  `Created games/${id} as an explicitly Test-only example. Edit game.json and web/, then npm install; npm run build -- ${id}.`,
);
