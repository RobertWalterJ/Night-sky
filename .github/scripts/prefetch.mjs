// Night Sky data prefetch. Runs on GitHub Actions every 3 hours and writes snapshots to the `data` branch.
// Why: CelesTrak refuses a second download of the same group within 2 hours (HTTP 403) and has a daily cap, so every
// phone hitting it directly is fragile. This job downloads once, politely, and the app reads the snapshot from the
// `data` branch (raw.githubusercontent.com allows browser access), falling back to the live source if needed.
//
// Rules this script follows:
//  - Identify ourselves in the User-Agent. Space the requests out. Never retry a 403/429 (that is the rate rule).
//  - Skip any file fetched less than 2h10m ago (so extra runs are harmless).
//  - If a download fails or looks wrong, KEEP the previous snapshot and record the error in manifest.json.
//  - Stop hitting CelesTrak after 2 failures in a row (their "too many errors" rule).
//  - Exit with an error only if there is no usable data at all.
// Output folder (default ./out) is expected to already contain the previous snapshot, if there is one.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const UA = 'NightSkyPrefetch/1.0 (+https://github.com/RobertWalterJ/Night-sky; personal stargazing app)';
export const TLE_GROUPS = ['stations', 'visual', 'gnss', 'geo', 'weather', 'resource', 'science', 'amateur', 'cubesat', 'oneweb', 'starlink'];
const MIN_GAP_MS = 2 * 3600e3 + 10 * 60e3;   // CelesTrak updates every 2 hours
const SATCAT_MAX_AGE_MS = 20 * 3600e3;       // SATCAT changes daily
const SPACING_MS = 4000;
const CT = 'https://celestrak.org';

// ---------- pure helpers (tested offline) ----------
export function parseTle(text) {
  const lines = String(text).split(/\r?\n/).map(l => l.trimEnd()).filter(Boolean), out = [];
  for (let i = 0; i + 2 < lines.length + 1; i += 3) {
    const [n, a, b] = [lines[i], lines[i + 1], lines[i + 2]];
    if (!b || !a.startsWith('1 ') || !b.startsWith('2 ') || a.length < 60 || b.length < 60) return { ok: false, sats: out, why: `bad TLE block near line ${i + 1}` };
    out.push({ name: n.trim(), norad: +a.slice(2, 7) });
  }
  return { ok: out.length > 0, sats: out, why: out.length ? '' : 'no satellites' };
}
export function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
// keep only the objects we care about, in a compact form: { cols:[...], rows:{ norad:[...] } }
export const SATCAT_KEEP = ['OBJECT_NAME', 'OBJECT_ID', 'OBJECT_TYPE', 'OPS_STATUS_CODE', 'OWNER', 'LAUNCH_DATE', 'DECAY_DATE', 'PERIOD', 'INCLINATION', 'APOGEE', 'PERIGEE', 'RCS', 'ORBIT_TYPE'];
export function trimSatcat(csvText, wantIds) {
  const t = parseCsv(csvText), head = t[0], idx = Object.fromEntries(head.map((h, i) => [h, i]));
  if (idx.NORAD_CAT_ID == null || idx.OBJECT_TYPE == null) throw new Error('unexpected SATCAT header');
  const rows = {};
  for (let i = 1; i < t.length; i++) { const r = t[i]; const id = +r[idx.NORAD_CAT_ID]; if (!id || !wantIds.has(id)) continue; rows[id] = SATCAT_KEEP.map(k => r[idx[k]] ?? ''); }
  return { cols: SATCAT_KEEP, rows };
}

// ---------- IO ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, accept = '*/*') {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept }, signal: AbortSignal.timeout(90000) });
  return { status: r.status, text: await r.text() };
}

export async function main() {
  const OUT = path.resolve(process.env.OUT || 'out'); fs.mkdirSync(path.join(OUT, 'tle'), { recursive: true });
  const mpath = path.join(OUT, 'manifest.json');
  const man = fs.existsSync(mpath) ? JSON.parse(fs.readFileSync(mpath, 'utf8')) : { files: {} };
  man.files ||= {};
  const now = Date.now(), age = f => man.files[f]?.fetchedAt ? now - Date.parse(man.files[f].fetchedAt) : Infinity;
  const mark = (f, o) => { man.files[f] = { ...(man.files[f] || {}), ...o }; };
  const save = (f, data) => { fs.mkdirSync(path.dirname(path.join(OUT, f)), { recursive: true }); fs.writeFileSync(path.join(OUT, f), data); };
  let failStreak = 0, ctDown = false;
  const ctFetch = async url => {
    if (ctDown) return { status: 0, text: '', skipped: true };
    await sleep(SPACING_MS);
    try { const r = await get(url); if (r.status === 200) failStreak = 0; else if (++failStreak >= 2) ctDown = true; return r; }
    catch (e) { if (++failStreak >= 2) ctDown = true; return { status: 0, text: String(e.message || e) }; }
  };

  // 1. satellite groups (TLE)
  const have = new Map(); // group -> norad ids (from this run or the previous snapshot)
  for (const g of TLE_GROUPS) {
    const f = `tle/${g}.txt`;
    if (age(f) < MIN_GAP_MS && fs.existsSync(path.join(OUT, f))) { console.log(`skip ${g} (fresh)`); }
    else {
      const r = await ctFetch(`${CT}/NORAD/elements/gp.php?GROUP=${g}&FORMAT=tle`);
      const p = r.status === 200 ? parseTle(r.text) : { ok: false, why: r.skipped ? 'skipped after repeated errors' : `HTTP ${r.status} ${String(r.text).slice(0, 80)}` };
      if (p.ok) { save(f, r.text.endsWith('\n') ? r.text : r.text + '\n'); mark(f, { ok: true, fetchedAt: new Date().toISOString(), count: p.sats.length, bytes: r.text.length, error: null }); console.log(`ok ${g}: ${p.sats.length}`); }
      else { mark(f, { ok: fs.existsSync(path.join(OUT, f)), error: p.why, lastTried: new Date().toISOString() }); console.log(`KEEP OLD ${g}: ${p.why}`); }
    }
    if (fs.existsSync(path.join(OUT, f))) { const p = parseTle(fs.readFileSync(path.join(OUT, f), 'utf8')); if (p.sats.length) have.set(g, p.sats.map(s => s.norad)); }
  }

  // 2. decaying objects (re-entry watch)
  {
    const f = 'decaying.json';
    if (age(f) >= MIN_GAP_MS || !fs.existsSync(path.join(OUT, f))) {
      const r = await ctFetch(`${CT}/NORAD/elements/gp.php?SPECIAL=DECAYING&FORMAT=json`);
      try { const j = JSON.parse(r.text); if (!Array.isArray(j)) throw new Error('not an array'); save(f, JSON.stringify(j)); mark(f, { ok: true, fetchedAt: new Date().toISOString(), count: j.length, error: null }); console.log(`ok decaying: ${j.length}`); }
      catch (e) { mark(f, { ok: fs.existsSync(path.join(OUT, f)), error: r.skipped ? 'skipped' : `HTTP ${r.status} ${e.message}`, lastTried: new Date().toISOString() }); console.log('KEEP OLD decaying'); }
    } else console.log('skip decaying (fresh)');
  }

  // 3. SATCAT, trimmed to the objects the app shows (not Starlink: they are classified by name)
  {
    const f = 'satcat-min.json';
    if (age(f) >= SATCAT_MAX_AGE_MS || !fs.existsSync(path.join(OUT, f))) {
      const want = new Set(); for (const [g, ids] of have) if (g !== 'starlink') ids.forEach(i => want.add(i));
      try { const d = JSON.parse(fs.readFileSync(path.join(OUT, 'decaying.json'), 'utf8')); d.forEach(o => o.NORAD_CAT_ID && want.add(+o.NORAD_CAT_ID)); } catch { }
      const r = await ctFetch(`${CT}/pub/satcat.csv`);
      try { if (r.status !== 200) throw new Error(`HTTP ${r.status}`); const m = trimSatcat(r.text, want); const n = Object.keys(m.rows).length; if (n < Math.min(100, Math.floor(want.size * 0.5))) throw new Error(`only ${n} rows for ${want.size} wanted`); save(f, JSON.stringify(m)); mark(f, { ok: true, fetchedAt: new Date().toISOString(), count: n, bytes: JSON.stringify(m).length, error: null }); console.log(`ok satcat-min: ${n}`); }
      catch (e) { mark(f, { ok: fs.existsSync(path.join(OUT, f)), error: r.skipped ? 'skipped' : e.message, lastTried: new Date().toISOString() }); console.log('KEEP OLD satcat-min'); }
    } else console.log('skip satcat-min (fresh)');
  }

  // 4. upcoming and recent events (splashdowns, dockings, spacewalks) from The Space Devs (separate service, own limits)
  {
    const f = 'events.json';
    if (age(f) >= 50 * 60e3 || !fs.existsSync(path.join(OUT, f))) {
      try {
        const pick = e => ({ id: e.id, name: e.name, type: e.type?.name || '', date: e.date, precision: e.date_precision?.name || '', location: e.location || '', description: String(e.description || '').slice(0, 280), webcast: !!e.webcast_live, video: e.video_url || '', news: e.news_url || '', launches: (e.launches || []).map(l => ({ id: l.id, name: l.name })), programs: (e.program || []).map(p => p.name) });
        const a = await get('https://ll.thespacedevs.com/2.3.0/events/upcoming/?limit=40&mode=normal', 'application/json'); if (a.status !== 200) throw new Error(`upcoming HTTP ${a.status}`);
        await sleep(2000);
        const b = await get('https://ll.thespacedevs.com/2.3.0/events/previous/?limit=15&mode=normal', 'application/json'); if (b.status !== 200) throw new Error(`previous HTTP ${b.status}`);
        const ev = { upcoming: JSON.parse(a.text).results.map(pick), previous: JSON.parse(b.text).results.map(pick) };
        save(f, JSON.stringify(ev)); mark(f, { ok: true, fetchedAt: new Date().toISOString(), count: ev.upcoming.length + ev.previous.length, error: null }); console.log(`ok events: ${ev.upcoming.length}+${ev.previous.length}`);
      } catch (e) { mark(f, { ok: fs.existsSync(path.join(OUT, f)), error: e.message, lastTried: new Date().toISOString() }); console.log('KEEP OLD events:', e.message); }
    } else console.log('skip events (fresh)');
  }

  man.generatedAt = new Date().toISOString(); man.version = 1; man.note = 'Snapshots for Night Sky. Sources: CelesTrak (GP, SATCAT) and The Space Devs Launch Library 2. See .github/scripts/prefetch.mjs.';
  save('manifest.json', JSON.stringify(man, null, 1));
  save('README.md', '# Night Sky data snapshots\n\nGenerated by `.github/scripts/prefetch.mjs` in the main branch every 3 hours. This branch is replaced on each run, so it has no history. Sources: CelesTrak (satellite elements and SATCAT) and The Space Devs Launch Library 2.\n');
  const usable = Object.values(man.files).filter(f => f.ok).length;
  console.log(`done: ${usable} usable files`);
  if (!usable) { console.error('no usable data at all'); process.exit(1); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => { console.error(e); process.exit(1); });
