// Satellite tracking: CelesTrak TLEs + SGP4 (satellite.js)
import { state, store, D2R, R2D, now, cachedJSON } from './util.js';
import { enuFromAltAz } from './astro.js';
import { snapshotText } from './livedata.js';
const S = window.satellite, A = window.Astronomy;
const RE = 6371;

export const sats = { list: [], byGroup: {}, ready: false, source: {} };
const KNOWN = { 25544: { std: -1.8, model: 'iss', nick: 'ISS' }, 48274: { std: -0.8, model: 'satellite', nick: 'Tiangong' }, 20580: { std: 2.0, model: 'hubble', nick: 'Hubble' } };

export async function loadGroup(group) {
  if (sats.byGroup[group]) return sats.byGroup[group];
  const ttl = group === 'active' || group === 'starlink' ? 360 : 240;
  // 1. the 3-hourly snapshot (no rate limit worries), 2. the live source
  let txt = await snapshotText(`tle/${group}.txt`).catch(() => null);
  sats.source[group] = txt ? 'snapshot' : 'live';
  if (!txt) try { txt = await cachedJSON(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`, ttl, { text: true }); }
  catch (e) {
    if (group !== 'stations') throw e;
    // fallback: ISS elements from wheretheiss.at if CelesTrak is unreachable or rate limiting
    const t = await cachedJSON('https://api.wheretheiss.at/v1/satellites/25544/tles', ttl);
    txt = `ISS (ZARYA)\n${t.line1}\n${t.line2}`;
  }
  const lines = txt.split(/\r?\n/).map(l => l.trimEnd()).filter(Boolean);
  const out = [];
  for (let i = 0; i + 2 < lines.length + 1; i += 3) {
    if (!lines[i + 2]) break;
    try {
      const rec = S.twoline2satrec(lines[i + 1], lines[i + 2]);
      const norad = +lines[i + 1].slice(2, 7);
      const k = KNOWN[norad] || {};
      out.push({ kind: 'sat', id: 'sat' + norad, norad, name: k.nick || lines[i].trim(), full: lines[i].trim(), rec, group, std: k.std ?? (group === 'starlink' || /STARLINK/.test(lines[i]) ? 5.0 : 3.5), model: k.model || 'satellite' });
    } catch { }
  }
  sats.byGroup[group] = out;
  const seen = new Set(sats.list.map(s => s.norad));
  for (const s of out) if (!seen.has(s.norad)) sats.list.push(s);
  sats.ready = true;
  return out;
}

const obsGd = () => ({ latitude: state.lat * D2R, longitude: state.lon * D2R, height: (state.elev || 0) / 1000 });

// Sun position in km (Earth-centred, equatorial of date ~ TEME for shadow purposes)
function sunVecKm(date) {
  const v = A.GeoVector('Sun', date, true);
  return [v.x * 149597870.7, v.y * 149597870.7, v.z * 149597870.7];
}
export function isSunlit(eci, date, sun = sunVecKm(date)) {
  const s = [eci.x, eci.y, eci.z], L = Math.hypot(...sun), u = sun.map(c => c / L);
  const proj = s[0] * u[0] + s[1] * u[1] + s[2] * u[2];
  if (proj > 0) return true;
  const perp = Math.hypot(s[0] - proj * u[0], s[1] - proj * u[1], s[2] - proj * u[2]);
  return perp > RE;
}

export function satPosition(sat, date = now(), gd = obsGd(), sun) {
  const pv = S.propagate(sat.rec, date);
  if (!pv || !pv.position || isNaN(pv.position.x)) return null;
  const gmst = S.gstime(date);
  const ecf = S.eciToEcf(pv.position, gmst);
  const look = S.ecfToLookAngles(gd, ecf);
  const geo = S.eciToGeodetic(pv.position, gmst);
  const alt = look.elevation * R2D, az = look.azimuth * R2D;
  const sunlit = isSunlit(pv.position, date, sun);
  const mag = sat.std + 5 * Math.log10(look.rangeSat / 1000);
  const vel = pv.velocity ? Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z) : null;
  return { alt, az, range: look.rangeSat, height: geo.height, lat: geo.latitude * R2D, lon: geo.longitude * R2D, sunlit, mag, vel, v: enuFromAltAz(alt, az) };
}

// Sun altitude at the observer, cheap: from Astronomy
export function obsSunAlt(date) {
  const o = new A.Observer(state.lat, state.lon, 0);
  const eq = A.Equator('Sun', date, o, true, true);
  return A.Horizon(date, o, eq.ra, eq.dec).altitude;
}

// Predict passes above minAlt over the next `hours`
export function predictPasses(sat, start = now(), hours = 48, minAlt = 10, step = 20) {
  const gd = obsGd(), passes = [];
  let cur = null;
  for (let t = 0; t <= hours * 3600; t += step) {
    const d = new Date(start.getTime() + t * 1000);
    const p = satPosition(sat, d, gd);
    if (!p) break;
    if (p.alt >= minAlt) {
      if (!cur) cur = { sat, start: d, startAz: p.az, max: p, maxT: d, visible: false, minMag: 99 };
      if (p.alt > cur.max.alt) { cur.max = p; cur.maxT = d; }
      if (p.sunlit && obsSunAlt(d) < -6) { cur.visible = true; cur.minMag = Math.min(cur.minMag, p.mag); }
      cur.end = d; cur.endAz = p.az;
    } else if (cur) { passes.push(cur); cur = null; }
  }
  if (cur) passes.push(cur);
  return passes;
}

// Visible satellites right now (for sky drawing)
export function visibleSats(date = now(), includeAll = false) {
  const gd = obsGd(), sun = sunVecKm(date), out = [];
  const sunAlt = obsSunAlt(date);
  for (const s of sats.list) {
    if (!includeAll && (s.group === 'active' || (s.group === 'starlink' && !state.layers.starlink))) continue;
    const p = satPosition(s, date, gd, sun);
    if (!p || p.alt < -2) continue;
    out.push({ ...s, ...p, lit: p.sunlit && sunAlt < -4 });
  }
  return out;
}
