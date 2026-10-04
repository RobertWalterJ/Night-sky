// Ephemerides and catalogues (Astronomy Engine + d3-celestial data)
import { state, D2R, R2D, now } from './util.js';
const A = window.Astronomy;

export const PLANETS = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
export const BODY_FACTS = {
  Sun: { model: 'sun', d: '1,392,700 km', facts: [['Type', 'G2V main-sequence star'], ['Age', '4.6 billion years'], ['Surface temp', '5,500 °C']] },
  Moon: { model: 'moon', d: '3,474 km', facts: [['Orbital period', '27.3 days'], ['Surface gravity', '0.17 g']] },
  Mercury: { model: 'mercury', d: '4,879 km', facts: [['Day length', '176 Earth days'], ['Year', '88 days'], ['Moons', '0']] },
  Venus: { model: 'venus', d: '12,104 km', facts: [['Day length', '243 days (retrograde)'], ['Surface temp', '465 °C'], ['Moons', '0']] },
  Mars: { model: 'mars', d: '6,779 km', facts: [['Day length', '24 h 37 m'], ['Year', '687 days'], ['Moons', '2']] },
  Jupiter: { model: 'jupiter', d: '139,820 km', facts: [['Day length', '9 h 56 m'], ['Year', '11.9 years'], ['Moons', '95+']] },
  Saturn: { model: 'saturn', d: '116,460 km', facts: [['Day length', '10 h 33 m'], ['Year', '29.4 years'], ['Moons', '270+']] },
  Uranus: { model: 'uranus', d: '50,724 km', facts: [['Day length', '17 h 14 m'], ['Year', '84 years'], ['Moons', '28']] },
  Neptune: { model: 'neptune', d: '49,244 km', facts: [['Day length', '16 h 6 m'], ['Year', '165 years'], ['Moons', '16']] },
};
const DSO_TYPES = { s: 'Spiral galaxy', e: 'Elliptical galaxy', i: 'Irregular galaxy', gc: 'Globular cluster', oc: 'Open cluster', pn: 'Planetary nebula', rn: 'Reflection nebula', sfr: 'Emission nebula', snr: 'Supernova remnant', pos: 'Asterism / star cloud' };
export const dsoSprite = tc => ({ s: 'galaxy', e: 'galaxy', i: 'galaxy', gc: 'cluster', oc: 'cluster', pos: 'cluster' }[tc] || 'nebula');

export const cat = { stars: null, n: 0, names: {}, cons: {}, dsos: [], ready: false };

export async function loadCatalog() {
  const d = await (await fetch('data/sky.json')).json();
  const n = d.stars.length / 5;
  const v = new Float32Array(n * 3), mag = new Float32Array(n), id = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const ra = d.stars[i * 5] * D2R, de = d.stars[i * 5 + 1] * D2R;
    v[i * 3] = Math.cos(de) * Math.cos(ra); v[i * 3 + 1] = Math.cos(de) * Math.sin(ra); v[i * 3 + 2] = Math.sin(de);
    mag[i] = d.stars[i * 5 + 2]; id[i] = d.stars[i * 5 + 4];
  }
  Object.assign(cat, { n, vec: v, mag, id, ra: i => d.stars[i * 5], de: i => d.stars[i * 5 + 1], bv: i => d.stars[i * 5 + 3], names: d.names, cons: d.cons, ready: true });
  cat.dsos = d.dsos.map(o => ({ ...o, t: DSO_TYPES[o.tc] || o.t, v: radecVec(o.ra, o.de) }));
  for (const c of Object.values(cat.cons)) {
    c.v = radecVec(c.p[0], c.p[1]);
    c.lv = c.l.map(seg => seg.map(([ra, de]) => radecVec(ra, de)));
  }
  return cat;
}
export const radecVec = (raDeg, deDeg) => [Math.cos(deDeg * D2R) * Math.cos(raDeg * D2R), Math.cos(deDeg * D2R) * Math.sin(raDeg * D2R), Math.sin(deDeg * D2R)];

export const observer = () => new A.Observer(state.lat, state.lon, state.elev || 0);

// Rotation J2000 equatorial -> horizon. Astronomy HOR frame: x=north, y=west, z=zenith. We return ENU.
export function eqjToEnuFn(date) {
  const r = A.Rotation_EQJ_HOR(date, observer()).rot;
  return (x, y, z, out = [0, 0, 0]) => {
    const n = r[0][0] * x + r[1][0] * y + r[2][0] * z;
    const w = r[0][1] * x + r[1][1] * y + r[2][1] * z;
    const u = r[0][2] * x + r[1][2] * y + r[2][2] * z;
    out[0] = -w; out[1] = n; out[2] = u; return out;
  };
}
// inverse: ENU -> RA/Dec (J2000)
export function enuToRaDec(e, n, u, date) {
  const r = A.Rotation_HOR_EQJ(date, observer()).rot;
  const x = r[0][0] * n + r[1][0] * -e + r[2][0] * u, y = r[0][1] * n + r[1][1] * -e + r[2][1] * u, z = r[0][2] * n + r[1][2] * -e + r[2][2] * u;
  let ra = Math.atan2(y, x) * R2D; if (ra < 0) ra += 360;
  return { ra, dec: Math.asin(Math.max(-1, Math.min(1, z))) * R2D };
}
export const enuFromAltAz = (alt, az) => [Math.cos(alt * D2R) * Math.sin(az * D2R), Math.cos(alt * D2R) * Math.cos(az * D2R), Math.sin(alt * D2R)];
export const altAzFromEnu = ([e, n, u]) => ({ alt: Math.asin(Math.max(-1, Math.min(1, u))) * R2D, az: (Math.atan2(e, n) * R2D + 360) % 360 });

export function bodyHorizontal(name, date = now()) {
  const obs = observer();
  const eq = A.Equator(name, date, obs, true, true);
  const h = A.Horizon(date, obs, eq.ra, eq.dec, 'normal');
  return { az: h.azimuth, alt: h.altitude, ra: eq.ra * 15, dec: eq.dec, dist: eq.dist };
}

export function solarSystem(date = now()) {
  return ['Sun', 'Moon', ...PLANETS].map(name => {
    const h = bodyHorizontal(name, date);
    let mag = null, phase = null, illum = null;
    try { const il = A.Illumination(name, date); mag = il.mag; phase = il.phase_angle; illum = il.phase_fraction; } catch { }
    return { kind: name === 'Sun' ? 'sun' : name === 'Moon' ? 'moon' : 'planet', id: name, name, ...h, mag, phase, illum, v: enuFromAltAz(h.alt, h.az) };
  });
}

export const constellationOf = (raDeg, dec) => { try { return A.Constellation(raDeg / 15, dec).name; } catch { return ''; } };
export const sunAlt = (date = now()) => bodyHorizontal('Sun', date).alt;

export function riseSet(name, from, dir) {
  try { const t = A.SearchRiseSet(name, observer(), dir, from, 1.5); return t ? t.date : null; } catch { return null; }
}
export function sunAltCross(alt, dir, from) { // dir -1 = descending (dusk), +1 ascending (dawn)
  try { const t = A.SearchAltitude('Sun', observer(), dir, from, 1.5, alt); return t ? t.date : null; } catch { return null; }
}
export function transit(name, from) {
  try { return A.SearchHourAngle(name, observer(), 0, from, 1).time.date; } catch { return null; }
}

export function moonInfo(date = now()) {
  const ph = A.MoonPhase(date); // 0 new, 90 first quarter, 180 full, 270 last quarter
  const il = A.Illumination('Moon', date);
  const names = ['New Moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full Moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
  const name = names[Math.round(ph / 45) % 8];
  return { phaseAngle: ph, illum: il.phase_fraction, name, age: ph / 360 * 29.53, waxing: ph < 180 };
}

// Tonight's dark window, computed from local noon of the current night
export function nightWindow(date = now()) {
  const base = new Date(date);
  if (base.getHours() < 12) base.setDate(base.getDate() - 1);
  base.setHours(12, 0, 0, 0);
  const sunset = riseSet('Sun', base, -1);
  const sunrise = sunset ? riseSet('Sun', sunset, +1) : null;
  const astroDusk = sunAltCross(-18, -1, base), astroDawn = astroDusk ? sunAltCross(-18, +1, astroDusk) : null;
  const nautDusk = sunAltCross(-12, -1, base), nautDawn = nautDusk ? sunAltCross(-12, +1, nautDusk) : null;
  const civilDusk = sunAltCross(-6, -1, base), civilDawn = civilDusk ? sunAltCross(-6, +1, civilDusk) : null;
  return { noon: base, sunset, sunrise, astroDusk, astroDawn, nautDusk, nautDawn, civilDusk, civilDawn };
}

export function starInfo(i) {
  const nm = cat.names[cat.id[i]] || [];
  const bv = cat.bv(i);
  const spec = bv < -0.2 ? 'O/B (blue-white)' : bv < 0.0 ? 'B (blue-white)' : bv < 0.3 ? 'A (white)' : bv < 0.58 ? 'F (yellow-white)' : bv < 0.81 ? 'G (yellow, Sun-like)' : bv < 1.4 ? 'K (orange)' : 'M (red)';
  const label = nm[0] || (nm[1] ? `${nm[1]} ${nm[2]}` : nm[3] || `HIP ${cat.id[i]}`);
  return { kind: 'star', idx: i, id: 'star' + cat.id[i], name: label, proper: nm[0], bayer: nm[1] ? `${nm[1]} ${nm[2]}` : '', hd: nm[3], mag: cat.mag[i], bv, spec, ra: cat.ra(i), dec: cat.de(i), hip: cat.id[i] };
}

// ---------- v2: realism, Milky Way, deep stars, time-to-rise ----------
// ENU -> J2000 unit vector (inverse of eqjToEnuFn)
export function enuToEqjFn(date) {
  const r = A.Rotation_HOR_EQJ(date, observer()).rot;
  return (e, n, u, out = [0, 0, 0]) => {
    const x = n, y = -e, z = u; // HOR frame: x=north, y=west, z=zenith
    out[0] = r[0][0] * x + r[1][0] * y + r[2][0] * z;
    out[1] = r[0][1] * x + r[1][1] * y + r[2][1] * z;
    out[2] = r[0][2] * x + r[1][2] * y + r[2][2] * z; return out;
  };
}

// Naked-eye limiting magnitude from sky darkness (Bortle 1-9), Moon and twilight
export const BORTLE = [null,
  { nelm: 7.6, name: 'Pristine dark site', note: 'Zodiacal light, airglow, the Milky Way casts shadows' },
  { nelm: 7.1, name: 'Truly dark site', note: 'Milky Way richly structured; M33 visible by eye' },
  { nelm: 6.6, name: 'Rural sky', note: 'Milky Way complex; faint glow on the horizon' },
  { nelm: 6.2, name: 'Rural / suburban edge', note: 'Milky Way clear overhead, washed out low down' },
  { nelm: 5.8, name: 'Suburban', note: 'Milky Way faint, visible only high up' },
  { nelm: 5.3, name: 'Bright suburban', note: 'Milky Way barely there at the zenith' },
  { nelm: 4.8, name: 'Suburban / urban', note: 'No Milky Way; main constellations only' },
  { nelm: 4.3, name: 'City', note: 'Bright stars, planets and the Moon' },
  { nelm: 4.0, name: 'Inner city', note: 'A few dozen stars at best' }];
export function nelm(date = now(), bortle = state.bortle) {
  let m = BORTLE[bortle].nelm;
  const sun = bodyHorizontal('Sun', date).alt;
  if (sun > -18) m -= (Math.min(sun, 0) + 18) / 18 * 3.2;
  if (sun > 0) m = -1;
  const mo = bodyHorizontal('Moon', date);
  if (mo.alt > 0) m -= A.Illumination('Moon', date).phase_fraction * (0.4 + 1.1 * Math.sin(mo.alt * D2R));
  return Math.max(-1, m);
}
export const mwStrength = lim => Math.max(0, Math.min(1, (lim - 4.9) / 2.3));

// Milky Way intensity map (equirectangular in RA/Dec, 1024x512)
export const mw = { data: null, w: 0, h: 0 };
export function loadMilkyWay() {
  return new Promise(res => {
    const im = new Image(); im.onload = () => {
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const x = c.getContext('2d'); x.drawImage(im, 0, 0);
      const d = x.getImageData(0, 0, im.width, im.height).data, out = new Uint8Array(im.width * im.height);
      for (let i = 0; i < out.length; i++) out[i] = d[i * 4];
      Object.assign(mw, { data: out, w: im.width, h: im.height }); res(mw);
    }; im.onerror = () => res(mw); im.src = 'textures/milkyway.png';
  });
}

// Deep catalogue: stars magnitude 6 to 8 (36k), loaded on demand
let deepP = null;
export function loadDeep() {
  deepP ||= fetch('data/stars8.bin').then(r => r.arrayBuffer()).then(buf => {
    const n = new Uint32Array(buf, 0, 1)[0], ra = new Uint16Array(buf, 4, n), de = new Int16Array(buf, 4 + 2 * n, n), mg = new Uint8Array(buf, 4 + 4 * n, n);
    const vec = new Float32Array(n * 3), mag = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = ra[i] / 65535 * 2 * Math.PI, d = de[i] / 32767 * Math.PI / 2;
      vec[i * 3] = Math.cos(d) * Math.cos(a); vec[i * 3 + 1] = Math.cos(d) * Math.sin(a); vec[i * 3 + 2] = Math.sin(d); mag[i] = mg[i] / 20;
    }
    cat.deep = { n, vec, mag }; return cat.deep;
  }).catch(() => null);
  return deepP;
}

// Hours until a sky direction (given in ENU) rises; Infinity if it never rises, 0 if up
export function hoursToRise(e, n, u, latRad) {
  if (u >= 0) return 0;
  const sL = Math.sin(latRad), cL = Math.cos(latRad);
  const sd = sL * u + cL * n, d = Math.asin(sd);
  const H = Math.atan2(-e, cL * u - sL * n);
  const c = -Math.tan(latRad) * Math.tan(d);
  if (c >= 1) return Infinity;
  const Hr = -Math.acos(Math.max(-1, c));
  let dt = Hr - H; dt = ((dt % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return dt * 12 / Math.PI * 0.99727;
}

// Galactic centre (Sgr A*) for "is the Milky Way core up?"
export const GALACTIC_CENTRE = { ra: 266.417, dec: -29.008 };

// Annual meteor showers (approximate peak dates; ZHR under ideal skies)
export const SHOWERS = [
  ['Quadrantids', 1, 3, 110, 'Boötes'], ['Lyrids', 4, 22, 18, 'Lyra'], ['Eta Aquariids', 5, 6, 50, 'Aquarius'],
  ['Southern Delta Aquariids', 7, 30, 25, 'Aquarius'], ['Perseids', 8, 12, 100, 'Perseus'], ['Draconids', 10, 8, 10, 'Draco'],
  ['Orionids', 10, 21, 20, 'Orion'], ['Southern Taurids', 11, 5, 5, 'Taurus'], ['Northern Taurids', 11, 12, 5, 'Taurus'],
  ['Leonids', 11, 17, 15, 'Leo'], ['Geminids', 12, 14, 150, 'Gemini'], ['Ursids', 12, 22, 10, 'Ursa Minor']];
export function nextShower(date = now()) {
  const y = date.getFullYear();
  const list = SHOWERS.flatMap(([name, m, d, zhr, rad]) => [y, y + 1].map(yy => ({ name, zhr, rad, peak: new Date(yy, m - 1, d, 23) })));
  return list.filter(s => s.peak > date - 2 * 86400e3).sort((a, b) => a.peak - b.peak)[0];
}

// B-V colour index -> RGB (for the Cosmos theme)
export function bvColor(bv) {
  const t = Math.max(-0.4, Math.min(2, bv));
  const stops = [[-0.4, [155, 176, 255]], [0, [202, 216, 255]], [0.4, [248, 247, 255]], [0.8, [255, 236, 210]], [1.2, [255, 210, 161]], [2, [255, 180, 120]]];
  for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) {
    const [a0, c0] = stops[i - 1], [a1, c1] = stops[i], f = (t - a0) / (a1 - a0);
    return `rgb(${c0.map((c, k) => Math.round(c + (c1[k] - c) * f)).join(',')})`;
  }
  return 'rgb(255,180,120)';
}
