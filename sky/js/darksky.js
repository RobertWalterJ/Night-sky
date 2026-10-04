// Light pollution from David Lorenz's Light Pollution Atlas 2025 (VIIRS-based model of artificial zenith
// sky brightness, 1/120° grid, served as gzip binary tiles with open CORS), plus certified dark-sky places.
import { store, haversine, compass, D2R, R2D } from './util.js';

const YEAR = 2025, BASE = `https://djlorenz.github.io/astronomy/binary_tiles/${YEAR}/`;
const tiles = new Map();
const mod = (n, m) => ((n % m) + m) % m;
const compressed2full = x => (5 / 195) * (Math.exp(0.0195 * x) - 1);

async function loadTile(tx, ty) {
  const key = `${tx}_${ty}`;
  if (!tiles.has(key)) tiles.set(key, (async () => {
    if (typeof DecompressionStream === 'undefined') throw new Error('no gzip support');
    const r = await fetch(`${BASE}binary_tile_${tx}_${ty}.dat.gz`); if (!r.ok) throw new Error(r.status);
    const buf = await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    const d = new Int8Array(buf), N = 600, out = new Float32Array(N * N);
    // decode: first value is 2 bytes; column 0 then each row are running sums of 1-byte changes
    const first = 128 * d[0] + d[1];
    let col = first;
    for (let iy = 1; iy <= N; iy++) {
      if (iy > 1) col += d[N * (iy - 1) + 1];
      let v = col; out[(iy - 1) * N] = v;
      for (let ix = 2; ix <= N; ix++) { v += d[N * (iy - 1) + ix]; out[(iy - 1) * N + ix - 1] = v; }
    }
    return out;
  })());
  return tiles.get(key);
}
function cell(lat, lon) {
  const lonFromDateLine = mod(lon + 180, 360), latFromStart = lat + 65;
  const tx = Math.floor(lonFromDateLine / 5) + 1, ty = Math.floor(latFromStart / 5) + 1;
  const ix = Math.round(120 * (lonFromDateLine - 5 * (tx - 1) + 1 / 240)), iy = Math.round(120 * (latFromStart - 5 * (ty - 1) + 1 / 240));
  return { tx, ty, ix: Math.min(600, Math.max(1, ix)), iy: Math.min(600, Math.max(1, iy)) };
}
export const ZONES = [[.01, '0'], [.06, '1a'], [.11, '1b'], [.19, '2a'], [.33, '2b'], [.58, '3a'], [1, '3b'], [1.73, '4a'], [3, '4b'], [5.2, '5a'], [9, '5b'], [15.59, '6a'], [27, '6b'], [46.77, '7a'], [Infinity, '7b']];
export function describe(ratio) {
  const sqm = 22 - 2.5 * Math.log10(1 + ratio);
  const zone = ZONES.find(z => ratio < z[0])[1];
  // rough correspondence to the (whole-sky, by-eye) Bortle scale
  const bortle = sqm >= 21.75 ? 1 : sqm >= 21.6 ? 2 : sqm >= 21.3 ? 3 : sqm >= 20.8 ? 4 : sqm >= 20.3 ? 5 : sqm >= 19.25 ? 6 : sqm >= 18.5 ? 7 : sqm >= 18 ? 8 : 9;
  return { ratio, sqm, zone, bortle };
}
export async function skyAt(lat, lon) {
  if (lat < -65 || lat >= 75) return null;
  const k = `lp:${lat.toFixed(2)},${lon.toFixed(2)}`, hit = store.get(k);
  if (hit) return describe(hit);
  const c = cell(lat, lon), t = await loadTile(c.tx, c.ty);
  const ratio = compressed2full(t[(c.iy - 1) * 600 + c.ix - 1]);
  store.set(k, ratio);
  return describe(ratio);
}
// land mask from the Earth specular map (water = bright), so we never send anyone into a lake
let landP = null;
function landMask() {
  landP ||= new Promise(res => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; res({ w: c.width, h: c.height, d }); }; im.onerror = () => res(null); im.src = 'textures/earth_spec.jpg'; });
  return landP;
}
const isLand = (m, la, lo) => { if (!m) return true; const x = Math.min(m.w - 1, Math.floor((lo + 180) / 360 * m.w)), y = Math.min(m.h - 1, Math.floor((90 - la) / 180 * m.h)); for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const i = ((Math.max(0, Math.min(m.h - 1, y + dy))) * m.w + Math.max(0, Math.min(m.w - 1, x + dx))) * 4; if (m.d[i] > 90) return false; } return true; };
// nearest place with a naturally dark zenith (artificial light below ~1/3 of natural), searching the surrounding tiles
export async function nearestDark(lat, lon, maxRatio = .33, maxKm = 400) {
  const c = cell(lat, lon), cand = [];
  const ts = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const tx = mod(c.tx - 1 + dx, 72) + 1, ty = c.ty + dy; if (ty < 1 || ty > 28) continue;
    ts.push(loadTile(tx, ty).then(t => ({ t, tx, ty })).catch(() => null));
  }
  let best = null; const m = await landMask();
  for (const r of await Promise.all(ts)) {
    if (!r) continue;
    for (let iy = 1; iy <= 600; iy += 3) for (let ix = 1; ix <= 600; ix += 3) {
      const ratio = compressed2full(r.t[(iy - 1) * 600 + ix - 1]); if (ratio > maxRatio) continue;
      const la = -65 + 5 * (r.ty - 1) + (iy - .5) / 120, lo = -180 + 5 * (r.tx - 1) + (ix - .5) / 120;
      const d = haversine(lat, lon, la, lo); if (d > maxKm || (best && d >= best.km)) continue;
      if (!isLand(m, la, lo)) continue;
      if (!best || d < best.km) best = { lat: la, lon: lo, km: d, ...describe(ratio) };
    }
  }
  if (best) best.dir = compass(bearing(lat, lon, best.lat, best.lon));
  return best;
}
export function bearing(la1, lo1, la2, lo2) {
  const y = Math.sin((lo2 - lo1) * D2R) * Math.cos(la2 * D2R), x = Math.cos(la1 * D2R) * Math.sin(la2 * D2R) - Math.sin(la1 * D2R) * Math.cos(la2 * D2R) * Math.cos((lo2 - lo1) * D2R);
  return (Math.atan2(y, x) * R2D + 360) % 360;
}

let placesP = null;
export function darkPlaces() { placesP ||= fetch('data/darksky_places.json').then(r => r.json()).catch(() => []); return placesP; }
export async function nearestPlaces(lat, lon, n = 6) {
  const all = await darkPlaces();
  return all.map(p => ({ name: p[0], country: p[1], region: p[2], type: p[3] || 'Dark Sky Place', bortle: p[4], year: p[5], lat: p[6], lon: p[7], wiki: p[8], km: haversine(lat, lon, p[6], p[7]), dir: compass(bearing(lat, lon, p[6], p[7])) }))
    .sort((a, b) => a.km - b.km).slice(0, n);
}
