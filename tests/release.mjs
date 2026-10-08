import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, cp, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { loadGames, ROOT } from '../tooling/registry.mjs';
const hash = (b) => createHash('sha256').update(b).digest('hex');
const before = (await readFile('release/SHA256SUMS', 'utf8'))
  .trim()
  .split('\n')
  .map((l) => l.split('  '));
for (const [sha, file] of before) assert.equal(hash(await readFile('release/' + file)), sha);
execFileSync('npm', ['run', 'build'], { stdio: 'pipe' });
execFileSync('npm', ['run', 'package'], { stdio: 'pipe' });
for (const [sha, file] of before)
  assert.equal(hash(await readFile('release/' + file)), sha, `Reproducible artifact: ${file}`);
const python = String.raw`import pathlib,zipfile,json,hashlib
root=pathlib.Path('.')
for game in (root/'games').iterdir():
 m=json.loads((game/'game.json').read_text());r=root/'release'/m['id']/m['version'];manifest=json.loads((r/'manifest.json').read_text())
 with zipfile.ZipFile(r/(m['id']+'-'+m['version']+'-itch.zip')) as z:
  assert set(z.namelist())==set(f['file'] for f in manifest['files'])
  for f in manifest['files']:assert hashlib.sha256(z.read(f['file'])).hexdigest()==f['sha256']
  assert 'index.html' in z.namelist()
  assert not any(n.endswith(('.ts','.tsx','.sqlite','.env')) for n in z.namelist())
with zipfile.ZipFile(root/'release/site.zip') as z:
 assert 'orbital-drift/index.html' in z.namelist()
 assert not any(n.startswith('signal-tap/') for n in z.namelist())
 assert len(json.loads(z.read('games.json'))['games'])==1
print('PASS: individual archives, runtime hashes, and public site excludes integration examples')
`;
console.log(execFileSync('python3', ['-c', python], { encoding: 'utf8' }).trim());
// Rebuilding one game must not rewrite the other game's built bytes.
const other = loadGames().find((g) => g.id === 'signal-tap');
const beforeOther = await readFile(`release/${other.id}/${other.version}/manifest.json`);
execFileSync('npm', ['run', 'build', '--', 'orbital-drift'], { stdio: 'pipe' });
execFileSync('npm', ['run', 'package', '--', 'orbital-drift'], { stdio: 'pipe' });
assert.deepEqual(await readFile(`release/${other.id}/${other.version}/manifest.json`), beforeOther);
// Exercise creation and collision protection outside the real repository.
const temp = await mkdtemp(join(tmpdir(), 'game-lab-template-'));
try {
  await writeFile(join(temp, 'package.json'), '{"name":"game-lab"}');
  await mkdir(join(temp, 'games'));
  await cp('games/signal-tap', join(temp, 'games/signal-tap'), { recursive: true });
  execFileSync(process.execPath, [resolve('scripts/new-game.mjs'), 'third-game'], { cwd: temp });
  const generated = JSON.parse(await readFile(join(temp, 'games/third-game/game.json'), 'utf8'));
  assert.equal(generated.id, 'third-game');
  assert.equal(generated.status, 'example');
  assert.throws(() =>
    execFileSync(process.execPath, [resolve('scripts/new-game.mjs'), 'third-game'], {
      cwd: temp,
      stdio: 'pipe',
    }),
  );
  assert.throws(() =>
    execFileSync(process.execPath, [resolve('scripts/new-game.mjs'), '../escape'], {
      cwd: temp,
      stdio: 'pipe',
    }),
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
console.log(
  'PASS: deterministic rebuild, independent game builds, and new-game template creation without overwriting existing work.',
);
