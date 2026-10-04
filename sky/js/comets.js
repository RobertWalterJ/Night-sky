// Comet positions from JPL orbital elements (two-body Kepler orbits; good to a fraction of a degree near apparition)
import { now, D2R, R2D } from './util.js';
import { observer, enuFromAltAz, constellationOf } from './astro.js';
const A = window.Astronomy;
export let comets = [];
export async function loadComets() { try { comets = await (await fetch('data/comets.json')).json(); } catch { comets = []; } return comets; }

const OBL = 23.4392911 * D2R;
const jd = d => d / 86400000 + 2440587.5;
// next perihelion on or after a date (or the most recent if within half an orbit)
export function perihelionNear(c, date = now()) {
  if (!c.per) return new Date((c.tp - 2440587.5) * 86400000);
  const k = Math.round((jd(date) - c.tp) / c.per);
  return new Date((c.tp + k * c.per - 2440587.5) * 86400000);
}
export function helio(c, date) {
  const a = c.q / (1 - c.e), n = 2 * Math.PI / (c.per || 2 * Math.PI * Math.sqrt(a ** 3) * 58.1324409);
  let M = n * (jd(date) - c.tp); M = ((M + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  let E = c.e > .8 ? Math.PI * Math.sign(M) * .5 + M * .5 : M;
  for (let k = 0; k < 60; k++) { const dE = (E - c.e * Math.sin(E) - M) / (1 - c.e * Math.cos(E)); E -= dE; if (Math.abs(dE) < 1e-12) break; }
  const xv = a * (Math.cos(E) - c.e), yv = a * Math.sqrt(1 - c.e * c.e) * Math.sin(E);
  const w = c.w * D2R, om = c.om * D2R, i = c.i * D2R;
  const cw = Math.cos(w), sw = Math.sin(w), co = Math.cos(om), so = Math.sin(om), ci = Math.cos(i), si = Math.sin(i);
  const xe = (co * cw - so * sw * ci) * xv + (-co * sw - so * cw * ci) * yv;
  const ye = (so * cw + co * sw * ci) * xv + (-so * sw + co * cw * ci) * yv;
  const ze = (sw * si) * xv + (cw * si) * yv;
  return [xe, ye * Math.cos(OBL) - ze * Math.sin(OBL), ye * Math.sin(OBL) + ze * Math.cos(OBL)]; // AU, equatorial J2000
}
// JPL Horizons ephemeris (bundled for each apparition) when available, otherwise a Kepler orbit
function fromEph(c, date) {
  if (!c.eph?.length) return null;
  const t = +date, rows = c.eph, t0 = Date.parse(rows[0][0]), t1 = Date.parse(rows[rows.length - 1][0]);
  if (t < t0 || t > t1) return null;
  const step = (t1 - t0) / (rows.length - 1), i = Math.min(rows.length - 2, Math.floor((t - t0) / step)), f = (t - t0 - i * step) / step;
  const a = rows[i], b = rows[i + 1];
  let dra = b[1] - a[1]; if (dra > 180) dra -= 360; if (dra < -180) dra += 360;
  return { ra: (a[1] + dra * f + 360) % 360, dec: a[2] + (b[2] - a[2]) * f, r: a[4] + (b[4] - a[4]) * f, dist: a[5] + (b[5] - a[5]) * f };
}
export function cometState(c, date = now()) {
  let ra, dec, dist, r, g;
  const ep = fromEph(c, date);
  if (ep) { ({ ra, dec, dist, r } = ep); g = [Math.cos(dec * D2R) * Math.cos(ra * D2R) * dist, Math.cos(dec * D2R) * Math.sin(ra * D2R) * dist, Math.sin(dec * D2R) * dist]; }
  else {
    const h = helio(c, date), e = A.HelioVector('Earth', date);
    g = [h[0] - e.x, h[1] - e.y, h[2] - e.z]; dist = Math.hypot(...g); r = Math.hypot(...h);
    ra = Math.atan2(g[1], g[0]) * R2D; if (ra < 0) ra += 360; dec = Math.asin(g[2] / dist) * R2D;
  }
  const hor = A.Horizon(date, observer(), ra / 15, dec, 'normal');
  const mag = c.M1 + 5 * Math.log10(dist) + c.K1 * Math.log10(r);
  const s = A.GeoVector('Sun', date, true), sd = Math.hypot(s.x, s.y, s.z);
  const elong = Math.acos((g[0] * s.x + g[1] * s.y + g[2] * s.z) / (dist * sd)) * R2D;
  return { ra, dec, dist, r, mag, alt: hor.altitude, az: hor.azimuth, v: enuFromAltAz(hor.altitude, hor.azimuth), elong, con: constellationOf(ra, dec) };
}
// best evening/morning visibility around a date: scan nights for the highest altitude in darkness
export function bestView(c, from, days = 60) {
  let best = null;
  for (let d = 0; d < days; d += 2) for (const hr of [19, 20, 21, 22, 4, 5, 6]) {
    const t = new Date(from); t.setDate(t.getDate() + d); t.setHours(hr, 0, 0, 0);
    const sun = A.Horizon(t, observer(), A.Equator('Sun', t, observer(), true, true).ra, A.Equator('Sun', t, observer(), true, true).dec).altitude;
    if (sun > -9) continue;
    const st = cometState(c, t);
    const score = st.alt > 5 ? (st.alt / 90) - st.mag / 10 : -9;
    if (!best || score > best.score) best = { t, st, score };
  }
  return best;
}
