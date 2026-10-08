import assert from 'node:assert/strict';
import { readdir, readFile, mkdir, writeFile, cp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ROOT, loadGames, siteConfig } from '../tooling/registry.mjs';
export async function walk(path, prefix = '') {
  const result = [];
  for (const d of await readdir(path, { withFileTypes: true })) {
    const name = prefix + d.name;
    if (d.isDirectory()) result.push(...(await walk(join(path, d.name), name + '/')));
    else if (d.isFile()) result.push(name);
    else throw new Error('Package input must not contain symlinks');
  }
  return result.sort();
}
export const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function zip(directory, path) {
  execFileSync('python3', [
    '-c',
    `import sys,zipfile,pathlib
root=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for p in sorted(root.rglob('*')):
  if p.is_file():
   i=zipfile.ZipInfo(p.relative_to(root).as_posix(),(2026,10,8,0,0,0));i.compress_type=zipfile.ZIP_DEFLATED;i.external_attr=0o100644<<16;i.create_system=3;z.writestr(i,p.read_bytes(),compresslevel=9)
`,
    directory,
    path,
  ]);
}
async function main() {
  const args = process.argv.slice(2),
    id = args[0] === '--game' ? args[1] : args[0],
    games = loadGames().filter((g) => !id || g.id === id);
  if (!games.length) throw new Error('Unknown game');
  for (const game of games) {
    const build = resolve(ROOT, 'dist/games', game.id),
      dest = resolve(ROOT, 'release', game.id, game.version);
    await mkdir(dest, { recursive: true });
    const files = await walk(build);
    assert.ok(files.includes('index.html') && files.length < 1000);
    const manifest = [];
    for (const file of files) {
      assert.ok(!/(^|\/)\.|\.(ts|tsx|map|sqlite|env)$/.test(file));
      const bytes = await readFile(join(build, file));
      manifest.push({ file, bytes: bytes.length, sha256: sha(bytes) });
    }
    const archive = `${game.id}-${game.version}-itch.zip`;
    zip(build, join(dest, archive));
    let html = await readFile(join(build, 'index.html'), 'utf8');
    assert.ok(!/(?:src|href)=["']\//.test(html), 'Relative asset URLs');
    const embedded = {},
      mime = {
        png: 'image/png',
        jpg: 'image/jpeg',
        mp3: 'audio/mpeg',
        wav: 'audio/wav',
        svg: 'image/svg+xml',
      };
    for (const file of files) {
      const type = mime[file.split('.').at(-1)];
      if (type)
        embedded['./' + file] =
          `data:${type};base64,${(await readFile(join(build, file))).toString('base64')}`;
    }
    for (const m of [...html.matchAll(/<script[^>]+src="\.\/([^"]+)"[^>]*><\/script>/g)]) {
      const js = (await readFile(join(build, m[1]), 'utf8')).replace(/<\/script/gi, '<\\/script');
      assert.doesNotThrow(() => new Function(js));
      html = html.replace(m[0], () => `<script type="module">${js}</script>`);
    }
    for (const m of [...html.matchAll(/<link[^>]+href="\.\/([^" ]+\.css)"[^>]*>/g)]) {
      const css = await readFile(join(build, m[1]), 'utf8');
      html = html.replace(m[0], () => `<style>${css}</style>`);
    }
    html = html.replace(
      '</head>',
      `<script>window.__GAME_OFFLINE__=true;window.__ORBITAL_ASSETS__=${JSON.stringify(embedded)};</script></head>`,
    );
    if (embedded['./favicon.svg'])
      html = html.replace('href="./favicon.svg"', () => `href="${embedded['./favicon.svg']}"`);
    await writeFile(join(dest, 'preview.html'), html);
    await cp(join(build, 'licenses'), join(dest, 'licenses'), { recursive: true });
    try {
      await cp(resolve(ROOT, 'games', game.id, 'publishing'), join(dest, 'publishing'), {
        recursive: true,
      });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const artifacts = {};
    for (const file of [archive, 'preview.html']) {
      const data = await readFile(join(dest, file));
      artifacts[file] = { bytes: data.length, sha256: sha(data) };
    }
    await writeFile(
      join(dest, 'manifest.json'),
      JSON.stringify(
        {
          game_id: game.id,
          version: game.version,
          schema: 2,
          sdk_version: '1.0.2',
          files: manifest,
          artifacts,
        },
        null,
        2,
      ) + '\n',
    );
    console.log(`${game.id} ${game.version}: ${files.length} files; ${archive}`);
  }
  const release = resolve(ROOT, 'release');
  if (!id) {
    const staging = resolve(ROOT, 'release/.site-stage');
    await rm(staging, { recursive: true, force: true });
    await cp(resolve(ROOT, 'dist/site'), staging, { recursive: true });
    if (!siteConfig().includeExamples)
      for (const game of loadGames().filter((g) => g.status === 'example'))
        await rm(join(staging, game.slug), { recursive: true, force: true });
    zip(staging, join(release, 'site.zip'));
    await rm(staging, { recursive: true, force: true });
  }
  await writeFile(
    join(release, 'SHA256SUMS'),
    (
      await Promise.all(
        (await walk(release))
          .filter((f) => f !== 'SHA256SUMS')
          .map(async (f) => `${sha(await readFile(join(release, f)))}  ${f}`),
      )
    ).join('\n') + '\n',
  );
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(ROOT, 'scripts/package.mjs'))
  await main();
