// Data snapshots published by the prefetch job (.github/scripts/prefetch.mjs) to the `data` branch every 3 hours.
// Why: CelesTrak refuses re-downloads within 2 hours, so phones read this copy first and only fall back to the
// live source if the snapshot is missing or too old. raw.githubusercontent.com allows browser (CORS) access.
const BASE = 'https://raw.githubusercontent.com/RobertWalterJ/Night-sky/data/';
const MAX_AGE = 12 * 3600e3;
let manP = null;

export const manifest = () => (manP ||= fetch(BASE + 'manifest.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null));

async function entry(file, maxAge) {
  const m = await manifest(), f = m?.files?.[file];
  if (!f?.ok || !f.fetchedAt || Date.now() - Date.parse(f.fetchedAt) > maxAge) return null;
  return f;
}
// the snapshot's own timestamp goes in the URL, so each new snapshot is fetched fresh and an old one can be cached
export async function snapshotText(file, maxAge = MAX_AGE) {
  try { const f = await entry(file, maxAge); if (!f) return null; const r = await fetch(`${BASE}${file}?v=${encodeURIComponent(f.fetchedAt)}`); return r.ok ? await r.text() : null; } catch { return null; }
}
export async function snapshotJSON(file, maxAge = MAX_AGE) {
  const t = await snapshotText(file, maxAge); if (!t) return null; try { return JSON.parse(t); } catch { return null; }
}
export const decaying = () => snapshotJSON('decaying.json', 48 * 3600e3);
export const events = () => snapshotJSON('events.json', 24 * 3600e3);

const ago = ms => { const h = Math.round(ms / 3600e3); return h < 1 ? 'less than an hour ago' : h === 1 ? 'about an hour ago' : `about ${h} hours ago`; };
export async function describeData() {
  const m = await manifest(), f = m?.files?.['tle/visual.txt'];
  if (f?.ok && f.fetchedAt) { const age = Date.now() - Date.parse(f.fetchedAt); return age > MAX_AGE ? `Satellite data: snapshot is old (${ago(age)}), using the live source instead.` : `Satellite data: snapshot from ${ago(age)}.`; }
  return 'Satellite data: no snapshot yet, using the live source.';
}
export function initDataStatus() {
  const btn = document.getElementById('settingsBtn'), el = document.getElementById('dataAge'); if (!btn || !el) return;
  btn.addEventListener('click', async () => { el.textContent = 'Satellite data: checking...'; el.textContent = await describeData(); });
}
