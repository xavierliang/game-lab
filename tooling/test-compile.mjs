import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const cache = new Map();
export function compile(file) {
  if (cache.has(file)) return cache.get(file);
  let code =
    extname(file) === '.json'
      ? 'export default ' + readFileSync(file, 'utf8') + ';'
      : ts.transpileModule(readFileSync(file, 'utf8'), {
          compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
            jsx: ts.JsxEmit.ReactJSX,
          },
        }).outputText;
  code = code.replace(/(from\s*['"])([^'"]+)(['"])/g, (_, a, spec, b) => {
    if (spec.startsWith('.')) {
      const base = resolve(dirname(file), spec),
        found = ['', '.ts', '.tsx', '.mjs', '.json'].map((ext) => base + ext).find(existsSync);
      if (!found) throw new Error(`Missing ${spec} in ${file}`);
      return a + compile(found) + b;
    }
    const url = import.meta.resolve(spec);
    return a + (spec.startsWith('@game-lab/') ? compile(fileURLToPath(url)) : url) + b;
  });
  const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
  cache.set(file, url);
  return url;
}
