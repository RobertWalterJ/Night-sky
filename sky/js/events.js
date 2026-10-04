// Upcoming sky events: twilight, risings and settings, Milky Way core, passes, meteor showers
import { now, state } from './util.js';
import { observer, riseSet, sunAltCross, PLANETS, GALACTIC_CENTRE, nextShower, cat, bodyHorizontal } from './astro.js';
import { sats, predictPasses } from './sats.js';
const A = window.Astronomy;

let passCache = { k: '', list: [] };
export function visiblePasses(t = now(), hours = 36) {
  const k = `${state.lat},${state.lon},${Math.floor(t / 600e3)},${sats.list.length}`;
  if (passCache.k !== k) {
    const targets = [25544, 48274, 20580].map(n => sats.list.find(s => s.norad === n)).filter(Boolean);
    passCache = { k, list: targets.flatMap(s => predictPasses(s, new Date(+t - 15 * 60e3), hours)).filter(p => p.visible).sort((a, b) => a.start - b.start) };
  }
  return passCache.list;
}

// fixed-star style targets for rise/set searches
const TARGETS = [
  { name: 'Milky Way core', ra: GALACTIC_CENTRE.ra, dec: GALACTIC_CENTRE.dec, icon: '≋' },
  { name: 'Orion', con: 'Ori', icon: '✧' },
  { name: 'Pleiades', dso: 'M45', icon: '✧' },
];
function starRiseSet(ra, dec, dir, from, slot) {
  try { A.DefineStar(slot, ra / 15, dec, 1000); const r = A.SearchRiseSet(slot, observer(), dir, from, 1); return r?.date || null; } catch { return null; }
}
export function targetCoords(tg) {
  if (tg.ra != null) return tg;
  if (tg.con) { const c = cat.cons[tg.con]; return c ? { ra: c.p[0], dec: c.p[1] } : null; }
  if (tg.dso) { const d = cat.dsos.find(x => x.id === tg.dso); return d ? { ra: d.ra, dec: d.de } : null; }
}

export function upcomingEvents(t = now(), hours = 14) {
  const end = +t + hours * 3600e3, ev = [];
  const add = (time, name, detail, icon, ref) => { if (time && time > t && time < end) ev.push({ time, name, detail, icon, ref }); };
  add(riseSet('Sun', t, -1), 'Sunset', '', '☀');
  add(sunAltCross(-6, -1, t), 'Civil twilight ends', 'Bright stars and planets appear', '◐');
  add(sunAltCross(-18, -1, t), 'Full darkness', 'Astronomical twilight ends', '●');
  add(sunAltCross(-18, +1, t), 'Darkness ends', 'Astronomical dawn', '◑');
  add(riseSet('Sun', t, +1), 'Sunrise', '', '☀');
  const ph = A.Illumination('Moon', t).phase_fraction;
  add(riseSet('Moon', t, +1), 'Moonrise', `${Math.round(ph * 100)}% lit`, '☾', 'Moon');
  add(riseSet('Moon', t, -1), 'Moonset', `${Math.round(ph * 100)}% lit`, '☾', 'Moon');
  for (const p of PLANETS) {
    const mag = A.Illumination(p, t).mag; if (mag > 3) continue;
    const dark = d => d && bodyHorizontal('Sun', d).alt < -6; // only risings/settings you could see
    const r = riseSet(p, t, +1), st = riseSet(p, t, -1);
    if (dark(r)) add(r, `${p} rises`, `mag ${mag.toFixed(1)}`, p[0], p);
    if (dark(st)) add(st, `${p} sets`, '', p[0], p);
  }
  TARGETS.forEach((tg, i) => {
    const c = targetCoords(tg); if (!c) return;
    add(starRiseSet(c.ra, c.dec, +1, t, A.Body['Star' + (i + 1)] || ('Star' + (i + 1))), `${tg.name} rises`, '', tg.icon);
    add(starRiseSet(c.ra, c.dec, -1, t, A.Body['Star' + (i + 1)] || ('Star' + (i + 1))), `${tg.name} sets`, '', tg.icon);
  });
  for (const p of visiblePasses(t)) add(p.start, `${p.sat.name} pass`, `max ${Math.round(p.max.alt)}°, mag ${p.minMag.toFixed(1)}`, '✦', p.sat.norad);
  ev.sort((a, b) => a.time - b.time);
  const sh = nextShower(t);
  return { events: ev, shower: sh };
}

export function until(d, t = now()) {
  const m = Math.round((d - t) / 60000);
  if (m < 0) return 'now';
  if (m < 60) return `${m} min`;
  if (m < 48 * 60) return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
  return `${Math.round(m / 1440)} days`;
}
