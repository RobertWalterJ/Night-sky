// Sky events calendar: meteor showers, eclipses, comets, planets, the Moon and the seasons.
// Everything here is computed for the user's location except the hand-written eclipse path notes.
import { $, $$, esc, state, now, emit, fmtTime, compass, D2R, R2D, clamp, toast, cachedJSON } from './util.js';
import { observer, bodyHorizontal, constellationOf, radecVec, eqjToEnuFn, altAzFromEnu, nelm, enuFromAltAz } from './astro.js';
import { comets, loadComets, cometState, bestView, perihelionNear } from './comets.js';
const A = window.Astronomy;

// name, month, day, ZHR, radiant RA, Dec, active, speed km/s, parent, note
const SHOWERS = [
  ['Quadrantids', 1, 3, 110, 230, 49, 'Dec 28 to Jan 12', 41, 'asteroid 2003 EH1', 'Sharp peak lasting only a few hours'],
  ['Lyrids', 4, 22, 18, 271, 34, 'Apr 14 to 30', 49, 'Comet Thatcher', 'Occasional bright fireballs'],
  ['Eta Aquariids', 5, 6, 50, 338, -1, 'Apr 19 to May 28', 66, "Halley's Comet", 'Best from the Southern Hemisphere, before dawn'],
  ['Southern Delta Aquariids', 7, 30, 25, 340, -16, 'Jul 12 to Aug 23', 41, 'Comet 96P/Machholz', 'Faint, steady meteors; good warm-up for the Perseids'],
  ['Perseids', 8, 12, 100, 48, 58, 'Jul 17 to Aug 24', 59, 'Comet Swift-Tuttle', 'The summer favourite; bright, fast, often with trains'],
  ['Draconids', 10, 8, 10, 262, 54, 'Oct 6 to 10', 20, 'Comet Giacobini-Zinner', 'Unusual: best in the evening, and occasionally storms'],
  ['Orionids', 10, 21, 20, 95, 16, 'Oct 2 to Nov 7', 66, "Halley's Comet", 'Fast meteors from debris shed by Halley'],
  ['Southern Taurids', 11, 5, 5, 52, 15, 'Sep 10 to Nov 20', 27, 'Comet Encke', 'Few meteors but known for slow, bright fireballs'],
  ['Northern Taurids', 11, 12, 5, 58, 22, 'Oct 20 to Dec 10', 29, 'Comet Encke', 'Slow fireballs; "Halloween fireballs" season'],
  ['Leonids', 11, 17, 15, 152, 22, 'Nov 6 to 30', 71, 'Comet Tempel-Tuttle', 'Fastest meteors of the year; famous for historic storms'],
  ['Geminids', 12, 14, 150, 112, 33, 'Dec 4 to 20', 35, 'asteroid 3200 Phaethon', 'The richest shower of the year, good before midnight too'],
  ['Ursids', 12, 22, 10, 217, 76, 'Dec 17 to 26', 33, 'Comet Tuttle', 'Quiet solstice shower, circumpolar radiant'],
];
const SOLAR_PATHS = {
  '2026-08-12': 'Total across Greenland, Iceland and northern Spain at sunset',
  '2027-02-06': 'Annular "ring of fire" across Chile and Argentina, then the South Atlantic to West Africa',
  '2027-08-02': 'Total across southern Spain, Morocco, Algeria, Tunisia, Libya, Egypt (over 6 minutes near Luxor), Saudi Arabia and Yemen',
  '2028-01-26': 'Annular across Ecuador, Peru and Brazil, ending at sunset over Portugal and Spain',
  '2028-07-22': 'Total across Australia, including Sydney, and the south of New Zealand',
  '2030-06-01': 'Annular across North Africa, Greece, Türkiye, Russia and northern Japan',
  '2030-11-25': 'Total across Namibia, Botswana, South Africa and southern Australia',
};
const MOON_NAMES = ['Wolf', 'Snow', 'Worm', 'Pink', 'Flower', 'Strawberry', 'Buck', 'Sturgeon', 'Harvest', "Hunter's", 'Beaver', 'Cold'];

const sunAltAt = t => bodyHorizontal('Sun', t).alt;
const ymd = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
function region(lat, lon) {
  lon = ((lon + 540) % 360) - 180;
  const ns = lat > 23 ? 'northern ' : lat < -23 ? 'southern ' : '';
  if (lat > 66) return 'the Arctic'; if (lat < -60) return 'Antarctica and the Southern Ocean';
  if (lon > -170 && lon < -50) return lat > 12 ? 'North America' : lat > -8 ? 'Central America and the Caribbean' : 'South America';
  if (lon >= -50 && lon < -20) return lat > 0 ? 'the North Atlantic' : 'the South Atlantic';
  if (lon >= -20 && lon < 40) return lat > 35 ? 'Europe' : lat > -35 ? 'Africa' : 'the South Atlantic';
  if (lon >= 40 && lon < 60) return lat > 12 ? 'the Middle East' : lat > -40 ? 'East Africa and the Indian Ocean' : 'the Indian Ocean';
  if (lon >= 60 && lon < 100) return lat > 5 ? 'South and Central Asia' : 'the Indian Ocean';
  if (lon >= 100 && lon < 150) return lat > 10 ? 'East Asia' : lat > -10 ? 'Southeast Asia' : 'Australia';
  return lat > 0 ? 'the North Pacific' : `the ${ns}Pacific and New Zealand`;
}
function sublunar(t) {
  const eq = A.Equator('Moon', t, new A.Observer(0, 0, 0), true, true), gst = A.SiderealTime(t);
  return { lat: eq.dec, lon: ((eq.ra - gst) * 15 + 540) % 360 - 180 };
}

// ---------------- builders ----------------
function showerEvents(from, to) {
  const ev = [], lim = l => l;
  for (let y = from.getFullYear(); y <= to.getFullYear(); y++) for (const [name, m, d, zhr, ra, dec, active, speed, parent, note] of SHOWERS) {
    const peak = new Date(y, m - 1, d, 12); if (peak < from - 86400e3 || peak > to) continue;
    // scan the peak night (evening of the peak date through dawn) for the best rate
    let best = null; const v = radecVec(ra, dec);
    for (let mins = 6 * 60; mins <= 19 * 60; mins += 20) {
      const t = new Date(+peak + mins * 60e3), sa = sunAltAt(t); if (sa > -12) continue;
      const e = eqjToEnuFn(t)(...v), alt = Math.asin(e[2]) * R2D; if (alt < 5) continue;
      const L = nelm(t), rate = zhr * Math.sin(alt * D2R) * Math.pow(2.2, Math.min(L, 6.5) - 6.5);
      if (!best || rate > best.rate) best = { t, rate, alt, az: altAzFromEnu(e).az, L };
    }
    const mo = best ? bodyHorizontal('Moon', best.t) : null, ill = best ? A.Illumination('Moon', best.t).phase_fraction : 0;
    const rate = best ? Math.round(best.rate) : 0;
    ev.push({
      type: 'meteor', icon: '☄', title: `${name} meteor shower`, date: best?.t || peak, sort: best?.t || peak,
      sub: `${note}. Up to ${zhr}/h under perfect skies; from your sky expect about ${rate}/h at best. Active ${active}.`,
      look: best ? `Lie back and look about 45° away from the radiant in ${constellationOf(ra, dec)}, which is ${Math.round(best.alt)}° up in the ${compass(best.az)} at ${fmtTime(best.t)}.` : 'The radiant stays below your horizon during darkness.',
      bestFrom: dec > 30 ? 'Northern Hemisphere' : dec < -15 ? 'Southern Hemisphere' : dec > 5 ? 'Both hemispheres, a little better from the north' : 'Both hemispheres, a little better from the south',
      moon: `${Math.round(ill * 100)}% Moon${mo && mo.alt > 0 ? ', up at the time' : ', down at the time'}`,
      rating: rate >= 40 ? 3 : rate >= 15 ? 2 : rate >= 5 ? 1 : 0,
      facts: [['Peak', fmtTime(best?.t || peak, true) + ' ' + (best?.t || peak).toLocaleDateString([], { month: 'short', day: 'numeric' })], ['Speed', `${speed} km/s`], ['Parent', parent]],
      sky: best ? { kind: 'point', id: 'rad' + name, name: `${name} radiant`, ra, dec, at: best.t } : null,
    });
  }
  return ev;
}

function eclipseEvents(from, to) {
  const ev = [];
  try {
    let le = A.SearchLunarEclipse(from);
    for (let k = 0; k < 8 && le.peak.date < to; k++, le = A.NextLunarEclipse(le.peak)) {
      const t = le.peak.date, mo = bodyHorizontal('Moon', t), sl = sublunar(t);
      const dur = le.kind === 'total' ? `${Math.round(le.sd_total * 2)} min of totality` : le.kind === 'partial' ? `${Math.round(le.sd_partial * 2)} min partial phase` : `${Math.round(le.sd_penum * 2)} min, subtle shading only`;
      ev.push({
        type: 'eclipse', icon: '◐', title: `${le.kind[0].toUpperCase() + le.kind.slice(1)} lunar eclipse`, date: t, sort: t,
        sub: le.kind === 'total' ? `The Moon turns copper-red in Earth's shadow. ${dur}.` : le.kind === 'partial' ? `Earth's shadow takes a bite out of the Moon. ${dur}.` : `A faint dusky shading on the Moon. ${dur}.`,
        look: mo.alt > 0 ? `Visible from ${state.name}: the Moon is ${Math.round(mo.alt)}° up in the ${compass(mo.az)} at mid-eclipse.` : `Not visible from ${state.name}; the Moon is below your horizon at mid-eclipse.`,
        bestFrom: `Anywhere the Moon is up; best centred on ${region(sl.lat, sl.lon)}`,
        rating: mo.alt > 0 ? (le.kind === 'total' ? 3 : le.kind === 'partial' ? 2 : 1) : 0,
        facts: [['Mid-eclipse', `${fmtTime(t)} ${t.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`]],
        sky: mo.alt > 0 ? { kind: 'moon', id: 'Moon', name: 'Moon', at: t } : null,
      });
    }
    let se = A.SearchGlobalSolarEclipse(from);
    for (let k = 0; k < 8 && se.peak.date < to; k++, se = A.NextGlobalSolarEclipse(se.peak)) {
      const t = se.peak.date, key = ymd(t);
      const where = SOLAR_PATHS[key] || (se.latitude != null ? `Path centred near ${region(se.latitude, se.longitude)} (${se.latitude.toFixed(0)}°, ${se.longitude.toFixed(0)}°)` : 'Partial only, seen from high latitudes');
      ev.push({
        type: 'eclipse', icon: '●', title: `${se.kind === 'total' ? 'Total' : se.kind === 'annular' ? 'Annular' : se.kind === 'hybrid' ? 'Hybrid' : 'Partial'} solar eclipse`, date: t, sort: t,
        sub: se.kind === 'total' ? 'Day turns to night for a few minutes and the corona appears. Travel-worthy.' : se.kind === 'annular' ? 'The Moon leaves a "ring of fire" around the Sun.' : 'The Moon covers part of the Sun.',
        look: 'Use certified eclipse glasses for every partial phase; never look at the Sun directly.',
        bestFrom: where, rating: se.kind === 'total' ? 3 : se.kind === 'annular' ? 2 : 1,
        facts: [['Greatest eclipse', `${t.toUTCString().slice(5, 22)} UTC`]],
      });
    }
    // next solar eclipse visible from here
    let ls = A.SearchLocalSolarEclipse(from, observer());
    for (let k = 0; k < 40 && ls && ls.peak.altitude <= 2; k++) ls = A.NextLocalSolarEclipse(ls.peak.time, observer());
    if (ls && ls.peak.time.date < new Date(+from + 25 * 365 * 86400e3)) {
      const t = ls.peak.time.date;
      ev.push({
        type: 'eclipse', icon: '◑', title: `Next solar eclipse from ${state.name}`, date: t, sort: t, highlight: true,
        sub: `${ls.kind === 'partial' ? 'Partial' : ls.kind[0].toUpperCase() + ls.kind.slice(1)} eclipse from here, with ${Math.round(ls.obscuration * 100)}% of the Sun's disc covered.`,
        look: `Sun ${Math.round(ls.peak.altitude)}° up at maximum, ${fmtTime(t)}. Starts ${fmtTime(ls.partial_begin.time.date)}, ends ${fmtTime(ls.partial_end.time.date)}.`,
        bestFrom: SOLAR_PATHS[ymd(t)] || '', rating: ls.obscuration > .9 ? 3 : ls.obscuration > .4 ? 2 : 1,
        facts: [['Date', t.toLocaleDateString([], { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })]],
      });
    }
  } catch (e) { console.warn('eclipse', e); }
  return ev;
}

function cometEvents(from, to) {
  const ev = [];
  for (const c of comets) {
    if (!c.eph) continue;
    let peak = null;
    for (const row of c.eph) { const t = new Date(row[0]); if (t < from || t > to) continue; const mag = c.M1 + 5 * Math.log10(row[5]) + c.K1 * Math.log10(row[4]); if (!peak || mag < peak.mag) peak = { t, mag }; }
    if (!peak || peak.mag > 11) continue;
    const bv = bestView(c, new Date(+peak.t - 30 * 86400e3), 60);
    const st = bv?.st, m = st ? st.mag : peak.mag; // brightness when it is actually observable from here
    ev.push({
      type: 'comet', icon: '☄', title: c.name, date: bv?.t || peak.t, sort: bv?.t || peak.t,
      sub: `${c.note} Around magnitude ${m.toFixed(1)} when best placed from here: ${m < 4 ? 'possible naked-eye comet from a dark site' : m < 7 ? 'binoculars will show it' : 'small-telescope target'}. Perihelion ${perihelionNear(c, peak.t).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}.`,
      look: bv ? `Best from here around ${bv.t.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${fmtTime(bv.t)}: ${Math.round(st.alt)}° up in the ${compass(st.az)}, in ${st.con}, ${st.elong.toFixed(0)}° from the Sun.` : 'Stays too close to the Sun or below your horizon during darkness.',
      bestFrom: st ? (st.dec > 15 ? 'Northern Hemisphere' : st.dec < -15 ? 'Southern Hemisphere' : 'Both hemispheres') : '',
      rating: m < 4 ? 3 : m < 7 ? 2 : 1, facts: [['Designation', c.full]],
      sky: bv ? { kind: 'comet', id: 'comet' + c.des, name: c.name, des: c.des, at: bv.t } : null,
    });
  }
  // famous comets, always shown
  const t = now();
  for (const des of ['1P', 'C/1995 O1']) {
    const c = comets.find(x => x.des === des); if (!c) continue;
    const st = cometState(c, t), next = des === '1P' ? new Date(2061, 6, 28) : null;
    ev.push({
      type: 'comet', icon: '✧', title: `${c.name}: where is it now?`, date: next || t, sort: next || new Date(+to + 1), far: true,
      sub: `${c.note} Right now it is ${st.dist.toFixed(1)} AU (${(st.dist * 149.6).toFixed(0)} million km) from Earth, in ${st.con}, at about magnitude ${st.mag.toFixed(0)}: far beyond any backyard telescope.`,
      look: des === '1P' ? 'Next visible in mid-2061, when it should be far better placed than in 1986.' : 'Its orbit takes roughly 2,500 years; it next returns around the year 4400.',
      bestFrom: '', rating: 0, facts: [],
    });
  }
  return ev;
}

function planetEvents(from, to) {
  const ev = [];
  for (const p of ['Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune']) {
    try {
      const o = A.SearchRelativeLongitude(p, 0, from).date; if (o > to) continue;
      const il = A.Illumination(p, o), h = bodyHorizontal(p, new Date(+o));
      ev.push({ type: 'planet', icon: p[0], title: `${p} at opposition`, date: o, sort: o, sub: `${p} is opposite the Sun: closest, brightest (mag ${il.mag.toFixed(1)}) and up all night. The best time of the year to see it.`, look: `Rises at sunset in the east, highest around midnight, in ${constellationOf(h.ra, h.dec)}.`, bestFrom: h.dec > 10 ? 'Northern Hemisphere' : h.dec < -10 ? 'Southern Hemisphere' : 'Everywhere', rating: ['Mars', 'Jupiter', 'Saturn'].includes(p) ? 3 : 1, facts: [], sky: { kind: 'planet', id: p, name: p, at: new Date(o.getFullYear(), o.getMonth(), o.getDate(), 23, 59) } });
    } catch { }
  }
  for (const p of ['Mercury', 'Venus']) {
    let t = from;
    for (let k = 0; k < (p === 'Mercury' ? 4 : 2); k++) {
      try {
        const e = A.SearchMaxElongation(p, t); const d = e.time.date; if (d > to) break;
        ev.push({ type: 'planet', icon: p[0], title: `${p} at greatest ${e.visibility} elongation`, date: d, sort: d, sub: `${p} is ${e.elongation.toFixed(0)}° from the Sun, as far as it gets. Look ${e.visibility === 'evening' ? 'low in the west after sunset' : 'low in the east before sunrise'}.`, look: '', bestFrom: '', rating: p === 'Venus' ? 2 : 1, facts: [], sky: { kind: 'planet', id: p, name: p, at: new Date(d.getFullYear(), d.getMonth(), d.getDate(), e.visibility === 'evening' ? 19 : 6, 0) } });
        t = new Date(+d + 20 * 86400e3);
      } catch { break; }
    }
  }
  // close pairings of bright planets (and with the Moon only when very close)
  const bodies = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];
  for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
    let prev = 99, prev2 = 99;
    for (let d = new Date(from); d < to; d = new Date(+d + 86400e3)) {
      const a = A.Equator(bodies[i], d, observer(), true, true), b = A.Equator(bodies[j], d, observer(), true, true);
      const sep = A.AngleBetween(new A.Vector(...radecVec(a.ra * 15, a.dec), d), new A.Vector(...radecVec(b.ra * 15, b.dec), d));
      if (prev < 2 && prev < sep && prev <= prev2) {
        const t = new Date(+d - 86400e3), el = A.AngleFromSun(bodies[i], t);
        if (el > 15) ev.push({ type: 'planet', icon: '⚭', title: `${bodies[i]} and ${bodies[j]} together`, date: t, sort: t, sub: `A close pairing just ${prev.toFixed(1)}° apart, closer than two finger-widths at arm's length.`, look: `${el.toFixed(0)}° from the Sun.`, bestFrom: '', rating: prev < .7 ? 3 : 2, facts: [], sky: { kind: 'planet', id: bodies[i], name: bodies[i], at: new Date(t.getFullYear(), t.getMonth(), t.getDate(), 20, 0) } });
      }
      prev2 = prev; prev = sep;
    }
  }
  return ev;
}

function moonSeasonEvents(from, to) {
  const ev = [];
  try {
    let q = A.SearchMoonQuarter(from);
    const fulls = [];
    for (let k = 0; k < 120 && q.time.date < to; k++, q = A.NextMoonQuarter(q)) if (q.quarter === 2) fulls.push(q.time.date);
    fulls.forEach((t, i) => {
      const dist = A.GeoMoon(t), km = Math.hypot(dist.x, dist.y, dist.z) * 149597870.7;
      const sameMonth = i > 0 && fulls[i - 1].getMonth() === t.getMonth() && fulls[i - 1].getFullYear() === t.getFullYear();
      if (km < 360000 || sameMonth) ev.push({ type: 'moon', icon: '○', title: km < 360000 ? `Supermoon (${MOON_NAMES[t.getMonth()]} Moon)` : 'Blue Moon', date: t, sort: t, sub: km < 360000 ? `Full Moon only ${Math.round(km).toLocaleString()} km away, up to 14% larger and 30% brighter than a full Moon at its farthest.` : 'The second full Moon in a calendar month.', look: 'Watch it rise in the east at sunset; near the horizon it looks enormous.', bestFrom: 'Everywhere', rating: 1, facts: [], sky: { kind: 'moon', id: 'Moon', name: 'Moon', at: t } });
    });
  } catch { }
  for (let y = from.getFullYear(); y <= to.getFullYear(); y++) {
    const s = A.Seasons(y), north = state.lat >= 0;
    for (const [k, n] of [['mar_equinox', north ? 'Spring equinox' : 'Autumn equinox'], ['jun_solstice', north ? 'Summer solstice' : 'Winter solstice'], ['sep_equinox', north ? 'Autumn equinox' : 'Spring equinox'], ['dec_solstice', north ? 'Winter solstice' : 'Summer solstice']]) {
      const t = s[k].date; if (t < from || t > to) continue;
      ev.push({ type: 'moon', icon: '◒', title: n, date: t, sort: t, sub: /Winter/.test(n) ? 'The longest night of the year.' : /Summer/.test(n) ? 'The shortest night of the year.' : 'Day and night of nearly equal length.', look: '', bestFrom: '', rating: 0, facts: [] });
    }
  }
  return ev;
}

// ---------------- view ----------------
let filter = 'all', cache = null;
export function initCalendar() {
  $$('#calFilter button').forEach(b => b.onclick = () => { filter = b.dataset.f; $$('#calFilter button').forEach(x => x.classList.toggle('on', x === b)); render(); });
}
export async function renderCalendar() {
  if (!comets.length) await loadComets();
  const key = `${state.lat},${state.lon},${state.bortle},${Math.floor(now() / 3600e3)}`;
  if (!cache || cache.key !== key) {
    $('#calList').innerHTML = '<p class="muted">Working out the next two years of sky events for your location…</p>';
    await new Promise(r => setTimeout(r, 30));
    const from = now(), to = new Date(+from + 2 * 365 * 86400e3);
    const all = [...showerEvents(from, to), ...eclipseEvents(from, to), ...cometEvents(from, to), ...planetEvents(from, to), ...moonSeasonEvents(from, to)].sort((a, b) => a.sort - b.sort);
    cache = { key, all };
  }
  render();
}
function render() {
  const list = cache.all.filter(e => filter === 'all' || e.type === filter);
  let month = '', html = '';
  const t0 = now();
  for (const [i, e] of list.entries()) {
    const m = e.far ? 'Famous comets' : e.date.toLocaleDateString([], { month: 'long', year: 'numeric' });
    if (m !== month) { html += `<h3 class="cal-month">${esc(m)}</h3>`; month = m; }
    const days = Math.round((e.date - t0) / 86400e3);
    html += `<article class="ev card ${e.highlight ? 'hl' : ''}" data-i="${cache.all.indexOf(e)}">
      <div class="ev-date"><b>${e.far ? '∞' : e.date.getDate()}</b><span>${e.far ? '' : e.date.toLocaleDateString([], { weekday: 'short' })}</span></div>
      <div class="ev-body"><p class="eyebrow">${esc(e.type === 'meteor' ? 'Meteor shower' : e.type)} ${'★'.repeat(e.rating)}<span class="muted">${'☆'.repeat(3 - e.rating)}</span>${!e.far && days >= 0 ? ` · in ${days === 0 ? 'under a day' : days + ' day' + (days > 1 ? 's' : '')}` : ''}</p>
      <h2>${/^[A-Z]$/.test(e.icon) ? '' : esc(e.icon) + ' '}${esc(e.title)}</h2><p>${esc(e.sub)}</p>
      ${e.look ? `<p class="small"><b>Where to look:</b> ${esc(e.look)}</p>` : ''}
      ${e.bestFrom ? `<p class="small muted"><b>Best seen from:</b> ${esc(e.bestFrom)}</p>` : ''}
      ${e.moon ? `<p class="small muted">${esc(e.moon)}</p>` : ''}
      <div class="pillrow">${e.facts.map(([k, v]) => `<span class="pill">${esc(k)}: ${esc(v)}</span>`).join('')}
      ${e.sky ? `<button class="btn sm" data-sky="${cache.all.indexOf(e)}">Show in sky</button>` : ''}
      ${!e.far ? `<button class="btn ghost sm" data-ics="${cache.all.indexOf(e)}">Add to calendar</button>` : ''}</div></div></article>`;
  }
  $('#calList').innerHTML = html || '<p class="muted">Nothing in this category in the next two years.</p>';
  $$('[data-sky]').forEach(b => b.onclick = () => showInSky(cache.all[+b.dataset.sky]));
  $$('[data-ics]').forEach(b => b.onclick = () => ics(cache.all[+b.dataset.ics]));
}
function showInSky(e) {
  const s = e.sky; state.offsetMin = Math.round((s.at - Date.now()) / 60000); emit('time');
  let o = s;
  if (s.kind === 'point') { const v = eqjToEnuFn(s.at)(...radecVec(s.ra, s.dec)); const aa = altAzFromEnu(v); o = { ...s, v, alt: aa.alt, az: aa.az }; }
  emit('goto', o);
  toast(`Sky set to ${s.at.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${fmtTime(s.at)}. Tap Now to return.`, 4000);
}
function ics(e) {
  const f = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const end = new Date(+e.date + 2 * 3600e3);
  const txt = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Night Sky//EN', 'BEGIN:VEVENT', `UID:${f(e.date)}-${e.title.replace(/\W/g, '')}@nightsky`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(e.date)}`, `DTEND:${f(end)}`, `SUMMARY:${e.title}`, `DESCRIPTION:${(e.sub + ' ' + (e.look || '')).replace(/[,;]/g, ' ')}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/calendar' })); a.download = e.title.replace(/[^\w ]/g, '') + '.ics'; a.click();
}
