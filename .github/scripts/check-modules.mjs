// Syntax-check every JavaScript module in sky/ (as ES modules, the way the browser loads them) and the inline
// module scripts in the HTML pages. Run before pushing: `node .github/scripts/check-modules.mjs`. Exit 1 on any failure.
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { spawnSync } from 'node:child_process';
const root = path.resolve(process.argv[2] || 'sky'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nschk-')); let bad = 0, n = 0;
const check = (name, code) => { const f = path.join(tmp, 'c.mjs'); fs.writeFileSync(f, code); const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' }); n++; if (r.status !== 0) { bad++; console.log('SYNTAX ERROR in ' + name + '\n' + (r.stderr || '').split('\n').slice(0, 6).join('\n')); } };
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (['vendor', 'models', 'data', 'node_modules'].includes(e.name) ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);
for (const f of walk(root)) {
  const rel = path.relative(root, f);
  if (/\.js$/.test(f)) check(rel, fs.readFileSync(f, 'utf8'));
  else if (/\.html$/.test(f)) { const h = fs.readFileSync(f, 'utf8'); for (const m of h.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)) if (!/importmap/.test(m[1]) && m[2].trim()) check(rel + ' (inline script)', m[2]); }
}
console.log(`${n} scripts checked, ${bad} failed`); process.exit(bad ? 1 : 0);
