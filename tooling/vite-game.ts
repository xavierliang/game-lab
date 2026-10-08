import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
function notices() {
  const packages = new Map<string, string>();
  return {
    name: 'third-party-notices',
    transform(_code: string, id: string) {
      if (!id.includes('/node_modules/')) return;
      let directory = dirname(id.split('?')[0]);
      while (directory.includes('/node_modules/')) {
        if (existsSync(join(directory, 'package.json'))) {
          const pkg = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
          if (pkg.name && !packages.has(pkg.name)) {
            const license = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'license.md'].find(
              (file) => existsSync(join(directory, file)),
            );
            packages.set(
              pkg.name,
              `${pkg.name} ${pkg.version || ''}\n${license ? readFileSync(join(directory, license), 'utf8') : 'License: ' + (pkg.license || 'See package source')}`,
            );
          }
          break;
        }
        directory = dirname(directory);
      }
    },
    generateBundle(this: {
      emitFile: (file: { type: 'asset'; fileName: string; source: string }) => void;
    }) {
      this.emitFile({
        type: 'asset',
        fileName: 'licenses/THIRD-PARTY-NOTICES.txt',
        source: [...packages]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([, text]) => text)
          .join('\n\n--------------------\n\n'),
      });
    },
  };
}
export function gameConfig(configUrl: string, entry: string) {
  const root = dirname(fileURLToPath(configUrl));
  const game = JSON.parse(readFileSync(join(root, 'game.json'), 'utf8'));
  return defineConfig({
    root: join(root, entry),
    base: './',
    publicDir: join(root, 'public'),
    plugins: [react(), notices()],
    css: { postcss: { plugins: [tailwindcss()] } },
    build: {
      outDir: resolve(root, '../../dist/games', game.id),
      emptyOutDir: true,
      sourcemap: false,
      target: 'es2020',
    },
  });
}
