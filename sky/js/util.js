// Shared helpers and app state
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const D2R = Math.PI / 180, R2D = 180 / Math.PI;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const store = {
  get(k, d) { try { const v = localStorage.getItem('ns:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('ns:' + k, JSON.stringify(v)); } catch { /* storage full or blocked */ } },
};

// tiny event bus + state
const subs = {};
export const on = (ev, fn) => (subs[ev] ||= []).push(fn);
export const emit = (ev, data) => (subs[ev] || []).forEach(fn => fn(data));

export const state = {
  lat: 43.2557, lon: -79.8711, name: 'Hamilton, ON', elev: 90,
  offsetMin: 0,          // time travel offset in minutes
  theme: store.get('theme', 'airy'),
  autoNight: store.get('autoNight', true),
  use24: store.get('use24', false),
  nasaKey: store.get('nasaKey', ''),
  calOffset: store.get('calOffset', 0), // manual compass alignment correction, degrees
  declination: 0, // magnetic declination at the observer (World Magnetic Model), degrees, east positive
  layers: Object.assign({ constLines: true, constNames: true, starNames: true, dsos: true, sats: true, starlink: false, models3d: true, grid: false, ground: true, below: true, isochrones: true, milkyway: true, realistic: true }, store.get('layers', {})),
  bortle: store.get('bortle', 4),
  bortleAuto: store.get('bortleAuto', true),
};
export const now = () => new Date(Date.now() + state.offsetMin * 60000);
export const isDesktop = () => matchMedia('(min-width: 1000px)').matches;

// fetch JSON with localStorage cache (ttl minutes); falls back to stale cache when offline
export async function cachedJSON(url, ttlMin = 30, opts = {}) {
  const key = 'c:' + url, hit = store.get(key);
  if (hit && Date.now() - hit.t < ttlMin * 60000) return hit.d;
  try {
    let r;
    for (let i = 0; i < 2; i++) { try { r = await fetch(url, { signal: AbortSignal.timeout(25000), ...opts }); if (r.ok || r.status < 500) break; } catch (e) { if (i) throw e; } await new Promise(z => setTimeout(z, 1500)); }
    if (!r.ok) throw new Error(r.status);
    const d = opts.text ? await r.text() : await r.json();
    store.set(key, { t: Date.now(), d });
    return d;
  } catch (e) {
    if (hit) return hit.d;
    throw e;
  }
}

export function fmtTime(d, withDay = false) {
  if (!d) return '–';
  const o = { hour: 'numeric', minute: '2-digit', hour12: !state.use24 };
  if (withDay) o.weekday = 'short';
  return d.toLocaleTimeString([], o);
}
export const fmtHour = d => d.toLocaleTimeString([], { hour: 'numeric', hour12: !state.use24 }).replace(/\s?[AP]M/i, m => m.trim()[0].toLowerCase());
export const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const compass = az => COMPASS[Math.round(((az % 360) + 360) % 360 / 22.5) % 16];

let toastT;
export function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, ms);
}
export const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export function haversine(lat1, lon1, lat2, lon2) {
  const a = Math.sin((lat2 - lat1) * D2R / 2) ** 2 + Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin((lon2 - lon1) * D2R / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}
