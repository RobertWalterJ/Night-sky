// Release helper: `node .github/scripts/bump.mjs <version> "<plain-language note>" ["<another note>" ...]`
// Bumps the service-worker cache name (so phones fetch the new files), keeps sky/js/version.js in step, and adds a
// "what's new" entry that Settings shows. Run it once per release, then commit and push.
import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(process.cwd(), 'sky'), swp = path.join(root, 'sw.js'), vp = path.join(root, 'js', 'version.js');
const [version, ...notes] = process.argv.slice(2);
if (!version || !/^\d+\.\d+\.\d+$/.test(version) || !notes.length) { console.error('usage: node .github/scripts/bump.mjs 1.2.3 "what changed in plain words" ["more"]'); process.exit(1); }
let sw = fs.readFileSync(swp, 'utf8'); const m = sw.match(/const VERSION = 'nightsky-v(\d+)-(\d+)'/); if (!m) { console.error('cannot find VERSION in sw.js'); process.exit(1); }
const build = `v${m[1]}-${+m[2] + 1}`; sw = sw.replace(m[0], `const VERSION = 'nightsky-${build}'`); fs.writeFileSync(swp, sw);
let v = fs.readFileSync(vp, 'utf8'); const date = new Date().toISOString().slice(0, 10);
v = v.replace(/export const APP_VERSION = '[^']*';/, `export const APP_VERSION = '${version}';`).replace(/export const BUILD = '[^']*';/, `export const BUILD = '${build}';`);
const entry = `  { v: '${version}', date: '${date}', notes: [${notes.map(n => JSON.stringify(n)).join(', ')}] },\n`;
v = v.replace(/export const CHANGELOG = \[\n/, m2 => m2 + entry); fs.writeFileSync(vp, v);
console.log(`version ${version}, build ${build}, "${notes.length}" note(s) added`);
