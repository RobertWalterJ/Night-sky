// Tonight view: stargazing score, hourly timeline, Sun/Moon, planets, passes, deep-sky picks, aurora
import { state, store, $, $$, esc, now, fmtTime, fmtHour, compass, cachedJSON, clamp, D2R, R2D, emit } from './util.js';
import { bodyHorizontal, nightWindow, moonInfo, PLANETS, riseSet, transit, cat, eqjToEnuFn, constellationOf, radecVec, GALACTIC_CENTRE, BORTLE, nelm } from './astro.js';
import { upcomingEvents, until, visiblePasses, targetCoords } from './events.js';
import { starCount } from './overhead.js';
import { skyAt, nearestDark, nearestPlaces } from './darksky.js';
import { loadGroup, predictPasses, sats } from './sats.js';

const A = window.Astronomy;
export let forecast = null;

export async function renderTonight() {
  const t = now(), win = nightWindow(t);
  renderSunMoon(win, t);
  renderPlanets(win);
  renderDso(win);
  renderPlanner(win, t);
  renderCountdowns(t);
  renderDarkness(win);
  try { await renderForecast(win, t); } catch (e) { $('#heroVerdict').textContent = 'Forecast did not load'; $('#heroDetail').innerHTML = 'The sky chart, planets and passes still work offline. <button class="btn ghost sm" id="fcRetry">Try again</button>'; $('#fcRetry').onclick = () => renderTonight(); console.warn(e); }
  renderAurora();
  await renderPasses();
  renderPlanner(win, t); renderCountdowns(t);
}

function scoreHour(h, date) {
  const sAlt = bodyHorizontal('Sun', date).alt;
  const dark = sAlt < -18 ? 1 : sAlt < -12 ? .75 : sAlt < -6 ? .3 : 0;
  const m = bodyHorizontal('Moon', date), mi = A.Illumination('Moon', date).phase_fraction;
  const lowW = h.cloud_cover_low, c = Math.max(.55 * lowW + .3 * h.cloud_cover_mid + .15 * h.cloud_cover_high, h.cloud_cover * .85);
  const cloudPts = 60 * Math.pow(1 - c / 100, 1.5);
  const rh = h.relative_humidity_2m, vis = (h.visibility ?? 30000) / 1000;
  const trans = clamp(1 - (rh - 60) / 45, .3, 1) * clamp(vis / 20, .4, 1);
  const jet = h.wind_speed_250hPa ?? 60, sfc = h.wind_speed_10m ?? 10;
  const seeing = clamp(1 - (jet - 50) / 140, .25, 1) * clamp(1 - (sfc - 20) / 40, .5, 1);
  const moonPen = m.alt > 0 ? mi * (.35 + .65 * Math.sin(m.alt * D2R)) : 0;
  let score = (cloudPts + 15 * trans + 10 * seeing + 15 * (1 - moonPen)) * dark;
  if ((h.precipitation_probability ?? 0) > 50) score *= .4;
  return { date, score: Math.round(score), cloud: Math.round(c), dark, sunAlt: sAlt, moonUp: m.alt > 0, moonAlt: m.alt, trans, seeing, temp: h.temperature_2m, rh };
}
export const verdict = s => s >= 80 ? 'Excellent' : s >= 60 ? 'Good' : s >= 40 ? 'Fair' : s >= 20 ? 'Poor' : 'Not tonight';

async function renderForecast(win, t) {
  const vars = 'cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,relative_humidity_2m,temperature_2m,visibility,wind_speed_10m,wind_speed_250hPa,precipitation_probability';
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${state.lat.toFixed(3)}&longitude=${state.lon.toFixed(3)}&hourly=${vars}&timezone=UTC&past_days=1&forecast_days=3`;
  const d = await cachedJSON(url, 45);
  const H = d.hourly, hours = [];
  for (let i = 0; i < H.time.length; i++) {
    const date = new Date(H.time[i] + 'Z');
    const row = {}; for (const k of Object.keys(H)) row[k] = H[k][i];
    hours.push({ date, row });
  }
  // timeline: from 2h before sunset (or now) through sunrise
  const start = new Date(Math.min(+t, +(win.sunset || t) - 2 * 3600e3)); start.setMinutes(0, 0, 0);
  const end = new Date(+(win.sunrise || +t + 18 * 3600e3) + 3600e3);
  const tl = hours.filter(h => h.date >= start && h.date <= end).map(h => scoreHour(h.row, h.date));
  forecast = { tl, win };
  const darkHours = tl.filter(h => h.dark >= .75);
  const tonight = darkHours.length ? Math.round(darkHours.reduce((a, h) => a + h.score, 0) / darkHours.length) : 0;
  // best 3h window
  let best = null;
  for (let i = 0; i + 2 < tl.length; i++) { const s = (tl[i].score + tl[i + 1].score + tl[i + 2].score) / 3; if (!best || s > best.s) best = { s, from: tl[i].date, to: new Date(+tl[i + 2].date + 3600e3) }; }
  const cur = tl.find(h => Math.abs(h.date - t) < 1800e3);
  const isNight = cur && cur.dark >= .3;
  const shown = isNight ? cur.score : tonight;
  $('#scoreNum').textContent = shown;
  $('#scoreArc').style.strokeDashoffset = 358 * (1 - shown / 100);
  $('#heroEyebrow').textContent = isNight ? 'Right now' : 'Stargazing tonight';
  $('#heroVerdict').textContent = `${verdict(shown)}${isNight ? ' conditions' : ' night ahead'}`;
  const mi = moonInfo(t);
  const avgCloud = darkHours.length ? Math.round(darkHours.reduce((a, h) => a + h.cloud, 0) / darkHours.length) : (cur?.cloud ?? 0);
  $('#heroDetail').textContent = best && best.s >= 20
    ? `Best window ${fmtTime(best.from)} to ${fmtTime(best.to)}. Average cloud ${avgCloud}% through the dark hours.`
    : `Cloud averages ${avgCloud}% through the dark hours. The sky chart still shows what is up there.`;
  const pills = [`${mi.name} · ${Math.round(mi.illum * 100)}%`, cur ? `${Math.round(cur.temp)}°C` : '', cur ? `Humidity ${Math.round(cur.rh)}%` : '', cur ? `Seeing ${cur.seeing > .8 ? 'steady' : cur.seeing > .55 ? 'average' : 'turbulent'}` : '', cur ? `Transparency ${cur.trans > .8 ? 'clear' : cur.trans > .55 ? 'fair' : 'hazy'}` : ''].filter(Boolean);
  $('#heroPills').innerHTML = pills.map(p => `<span class="pill">${esc(p)}</span>`).join('');
  $('#timeline').innerHTML = tl.map(h => `<div class="hr ${Math.abs(h.date - t) < 1800e3 ? 'now' : ''}" title="${esc(fmtTime(h.date))}: score ${h.score}, cloud ${h.cloud}%">
    <div class="bars ${h.dark >= .75 ? 'dark' : ''}"><div class="c" style="height:${h.cloud * .55}%"></div><div class="s" style="height:${Math.max(2, h.score)}%"></div>${h.moonUp ? '<div class="m"></div>' : ''}</div>
    <span>${esc(fmtHour(h.date))}</span></div>`).join('');
  emit('forecast', forecast);
}

function renderSunMoon(win, t) {
  const mi = moonInfo(t);
  const mr = riseSet('Moon', win.noon, +1), ms = riseSet('Moon', mr || win.noon, -1);
  const rows = [
    ['Sunset', fmtTime(win.sunset)], ['Astronomical dark', win.astroDusk ? `${fmtTime(win.astroDusk)} to ${fmtTime(win.astroDawn)}` : 'No full darkness'],
    ['Sunrise', fmtTime(win.sunrise, true)], ['Moon', `${mi.name}, ${Math.round(mi.illum * 100)}% lit`],
    ['Moonrise', fmtTime(mr, true)], ['Moonset', fmtTime(ms, true)],
  ];
  $('#sunMoon').innerHTML = rows.map(([k, v]) => `<span class="k">${k}</span><span class="v">${esc(v)}</span>`).join('');
}

function renderPlanets(win) {
  const s = win.astroDusk || win.nautDusk || win.sunset || now(), e = win.astroDawn || win.nautDawn || win.sunrise || new Date(+s + 8 * 3600e3);
  const out = [];
  for (const p of PLANETS) {
    let best = { alt: -90 };
    for (let tt = +s; tt <= +e; tt += 30 * 60e3) { const h = bodyHorizontal(p, new Date(tt)); if (h.alt > best.alt) best = { ...h, t: new Date(tt) }; }
    const mag = A.Illumination(p, best.t || s).mag;
    out.push({ p, best, mag, con: constellationOf(best.ra, best.dec) });
  }
  const vis = out.filter(o => o.best.alt > 8).sort((a, b) => a.mag - b.mag);
  $('#planetList').innerHTML = vis.length ? vis.map(o => `<div class="row-item" data-obj="${o.p}"><span class="ic">${o.p[0]}</span><span class="t"><b>${o.p}</b><span>In ${esc(o.con)} · mag ${o.mag.toFixed(1)}</span></span><span class="r">Best ${fmtTime(o.best.t)}<br>${Math.round(o.best.alt)}° ${compass(o.best.az)}</span></div>`).join('')
    : '<p class="muted">No bright planets above the horizon during darkness tonight.</p>';
}

function renderDso(win) {
  if (!cat.ready) return;
  const mid = win.astroDusk && win.astroDawn ? new Date((+win.astroDusk + +win.astroDawn) / 2) : new Date(+(win.sunset || now()) + 4 * 3600e3);
  const toEnu = eqjToEnuFn(mid), moonBright = A.Illumination('Moon', mid).phase_fraction > .6 && bodyHorizontal('Moon', mid).alt > 0;
  const picks = cat.dsos.map(d => { const e = toEnu(...d.v); return { d, alt: Math.asin(e[2]) * R2D, az: (Math.atan2(e[0], e[1]) * R2D + 360) % 360 }; })
    .filter(o => o.alt > 30 && o.d.m < (moonBright ? 6.5 : 8.5) && !(moonBright && /galaxy/i.test(o.d.t)))
    .sort((a, b) => a.d.m - b.d.m).slice(0, 7);
  $('#dsoList').innerHTML = picks.map(o => `<div class="row-item" data-dso="${o.d.id}"><span class="ic">${o.d.id.replace('M', 'M')}</span><span class="t"><b>${esc(o.d.alt || o.d.desig || o.d.id)}</b><span>${esc(o.d.t)} · mag ${o.d.m}</span></span><span class="r">${Math.round(o.alt)}° ${compass(o.az)}<br>at ${fmtTime(mid)}</span></div>`).join('')
    + (moonBright ? '<p class="small muted">Bright Moon tonight, so faint galaxies are left out.</p>' : '');
}

export async function renderPasses() {
  try {
    await loadGroup('stations'); await loadGroup('visual');
    const targets = [25544, 48274, 20580].map(n => sats.list.find(s => s.norad === n)).filter(Boolean);
    const passes = targets.flatMap(s => predictPasses(s, now(), 72)).filter(p => p.visible).sort((a, b) => a.start - b.start).slice(0, 8);
    $('#passList').innerHTML = passes.length ? passes.map(p => `<div class="row-item" data-sat="${p.sat.norad}"><span class="ic">${p.sat.name === 'ISS' ? '✦' : '·'}</span><span class="t"><b>${esc(p.sat.name)} · ${fmtTime(p.start, true)}</b><span>${compass(p.startAz)} → ${compass(p.endAz)}, max ${Math.round(p.max.alt)}° · ${Math.round((p.end - p.start) / 60000)} min</span></span><span class="r">mag ${p.minMag < 50 ? p.minMag.toFixed(1) : '–'}</span></div>`).join('')
      : '<p class="muted">No visible passes in the next three days. Passes need the satellite in sunlight while you are in darkness.</p>';
  } catch (e) { $('#passList').innerHTML = '<p class="muted">Satellite data unavailable offline.</p>'; }
}

async function renderAurora() {
  try {
    const kp = await cachedJSON('https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json', 60);
    const rows = kp.map(r => Array.isArray(r) ? { time_tag: r[0], kp: +r[1], observed: r[2] } : r).filter(r => r.time_tag && !isNaN(+r.kp));
    const t = now(), next = rows.filter(r => { const d = new Date(r.time_tag + 'Z'); return d > t - 3 * 3600e3 && d < +t + 24 * 3600e3; });
    const maxKp = Math.max(...next.map(r => +r.kp));
    // geomagnetic latitude (dipole pole 80.7N, 72.7W)
    const pl = 80.7 * D2R, plo = -72.7 * D2R, la = state.lat * D2R, lo = state.lon * D2R;
    const gm = Math.asin(Math.sin(la) * Math.sin(pl) + Math.cos(la) * Math.cos(pl) * Math.cos(lo - plo)) * R2D;
    const boundary = 66.5 - 2.04 * maxKp; // equatorward edge of the auroral oval
    const g = Math.abs(gm);
    const chance = g >= boundary ? 'Likely overhead' : g >= boundary - 6 ? 'Possible low on the poleward horizon' : g >= boundary - 10 ? 'Only with a camera, if at all' : 'Unlikely';
    $('#aurora').innerHTML = [['Max Kp next 24 h', maxKp.toFixed(1)], ['Your geomagnetic latitude', `${gm.toFixed(1)}°`], ['Aurora tonight', chance]]
      .map(([k, v]) => `<span class="k">${k}</span><span class="v">${esc(v)}</span>`).join('') + `<span class="k"></span><span class="v small"><a href="https://www.swpc.noaa.gov/products/aurora-30-minute-forecast" target="_blank" rel="noopener">NOAA aurora forecast ↗</a></span>`;
  } catch { $('#aurora').innerHTML = '<p class="muted">Space weather unavailable.</p>'; }
}

// ---------- countdown chips ----------
export function renderCountdowns(t = now()) {
  const { events, shower } = upcomingEvents(t, 30);
  const pick = [];
  const first = (re) => events.find(e => re.test(e.name));
  for (const re of [/Full darkness|Darkness ends/, /pass$/, /Moonrise|Moonset/, /Milky Way core/, /^(Jupiter|Saturn|Venus|Mars) rises/]) { const e = first(re); if (e && !pick.includes(e)) pick.push(e); }
  const chips = pick.sort((a, b) => a.time - b.time).map(e => `<button class="cd" ${typeof e.ref === 'number' ? `data-sat="${e.ref}"` : e.ref ? `data-obj="${e.ref}"` : ''}><small>${esc(e.name)}</small><b>${until(e.time, t)}</b><span>${fmtTime(e.time)}${e.detail ? ' · ' + esc(e.detail) : ''}</span></button>`);
  if (shower) chips.push(`<div class="cd"><small>${esc(shower.name)} peak</small><b>${until(shower.peak, t)}</b><span>up to ${shower.zhr} meteors/h</span></div>`);
  $('#countdowns').innerHTML = chips.join('');
}

// ---------- night planner (ribbon chart) ----------
const SHOWPIECES = [{ name: 'Milky Way core', ra: GALACTIC_CENTRE.ra, dec: GALACTIC_CENTRE.dec }, { name: 'Orion', con: 'Ori' }, { name: 'Pleiades', dso: 'M45' }, { name: 'Andromeda Galaxy', dso: 'M31' }, { name: 'Orion Nebula', dso: 'M42' }, { name: 'Scorpius', con: 'Sco' }, { name: 'Summer Triangle', ra: 296, dec: 30 }, { name: 'Big Dipper', ra: 178, dec: 56 }];
function renderPlanner(win, t) {
  if (!win.sunset || !win.sunrise) { $('#planner').innerHTML = '<p class="muted">No sunset tonight at this latitude.</p>'; return; }
  const s0 = +win.sunset - 30 * 60e3, s1 = +win.sunrise + 30 * 60e3, N = 60, dt = (s1 - s0) / N;
  const times = [...Array(N + 1)].map((_, i) => new Date(s0 + i * dt));
  const sunAlts = times.map(d => bodyHorizontal('Sun', d).alt);
  const grad = (alts, varName = '--accent') => 'linear-gradient(90deg,' + alts.map((a, i) => { const k = a <= 0 ? 0 : Math.round(Math.pow(Math.min(a, 70) / 70, .7) * 100); return `color-mix(in srgb, var(${varName}) ${k}%, transparent) ${(i / N * 100).toFixed(1)}%`; }).join(',') + ')';
  const best = alts => { let m = -90, bi = 0; alts.forEach((a, i) => { if (sunAlts[i] < -8 && a > m) { m = a; bi = i; } }); return { alt: m, t: times[bi] }; };
  const rows = [];
  // darkness
  rows.push(`<div class="lab"><b>Darkness</b><small>${win.astroDusk ? fmtTime(win.astroDusk) + ' to ' + fmtTime(win.astroDawn) : 'twilight only'}</small></div><div class="bar" style="background:linear-gradient(90deg,${sunAlts.map((a, i) => `color-mix(in srgb, var(--sky-horizon) ${Math.round(clamp((-a - 4) / 14, 0, 1) * 70)}%, var(--surface-2)) ${(i / N * 100).toFixed(1)}%`).join(',')})"></div>`);
  const addRow = (name, alts, sub, v = '--accent') => { const b = best(alts); if (b.alt < 8) return; rows.push(`<div class="lab"><b>${esc(name)}</b><small>${sub || `best ${fmtTime(b.t)}, ${Math.round(b.alt)}°`}</small></div><div class="bar" style="background:${grad(alts, v)}, var(--surface-2)"></div>`); };
  const mo = times.map(d => bodyHorizontal('Moon', d).alt);
  addRow(`Moon`, mo, null, '--sky-moon');
  for (const p of ['Venus', 'Mars', 'Jupiter', 'Saturn', 'Mercury']) addRow(p, times.map(d => bodyHorizontal(p, d).alt), null, '--sky-planet');
  for (const sp of SHOWPIECES) {
    const c = targetCoords(sp); if (!c) continue;
    const v = radecVec(c.ra, c.dec);
    addRow(sp.name, times.map(d => Math.asin(eqjToEnuFn(d)(...v)[2]) * R2D));
  }
  // station passes as ticks
  const ps = visiblePasses(new Date(s0), (s1 - s0) / 3600e3 + 1).filter(p => p.start >= s0 && p.start <= s1);
  if (ps.length) rows.push(`<div class="lab"><b>Space stations</b><small>${ps.length} visible pass${ps.length > 1 ? 'es' : ''}</small></div><div class="bar">${ps.map(p => `<i class="pass" title="${esc(p.sat.name)} ${fmtTime(p.start)}" style="left:${((p.start - s0) / (s1 - s0) * 100).toFixed(1)}%;width:${Math.max(.8, (p.end - p.start) / (s1 - s0) * 100).toFixed(1)}%"></i>`).join('')}</div>`);
  const ticks = [0, .25, .5, .75, 1].map(f => `<span>${fmtTime(new Date(s0 + f * (s1 - s0)))}</span>`).join('');
  const nowPct = (t - s0) / (s1 - s0) * 100;
  $('#planner').innerHTML = rows.join('') + `<div></div><div class="axis">${ticks}</div>`;
  if (nowPct > 0 && nowPct < 100) $$('#planner .bar').forEach(b => b.insertAdjacentHTML('beforeend', `<i class="now" style="left:${nowPct.toFixed(1)}%"></i>`));
}

// ---------- darkness card ----------
let lpCache = null;
async function renderDarkness(win) {
  const box = $('#darkCard');
  let lp = null;
  try { lp = await skyAt(state.lat, state.lon); } catch { }
  if (lp && state.bortleAuto !== false && state.bortle !== lp.bortle) { state.bortle = lp.bortle; store.set('bortle', lp.bortle); emit('bortle'); emit('layers', 'bortle'); $$('.bortle').forEach(i => i.value = lp.bortle); }
  lpCache = lp;
  const mid = win.astroDusk && win.astroDawn ? new Date((+win.astroDusk + +win.astroDawn) / 2) : now();
  const b = BORTLE[state.bortle], lim = nelm(mid), n = starCount(mid, lim);
  const gmaps = (la, lo) => `https://www.google.com/maps/dir/?api=1&destination=${la.toFixed(4)},${lo.toFixed(4)}`;
  box.innerHTML = `${lp ? `<div class="lp-meter"><div><b>${lp.sqm.toFixed(2)}</b><span>mag/arcsec² at the zenith</span></div><div><b>${lp.zone}</b><span>light pollution zone</span></div><div><b>${lp.ratio < 1 ? lp.ratio.toFixed(2) : lp.ratio.toFixed(1)}×</b><span>artificial vs natural sky</span></div></div>
      <p class="small muted" style="margin:6px 0 10px">Modelled for ${esc(state.name)} by the Light Pollution Atlas ${2025} (VIIRS satellite data). Closest Bortle class: about ${lp.bortle}.</p>` : '<p class="small muted">Light pollution atlas unavailable here; set your sky by hand.</p>'}
    <p class="dark-name">Bortle ${state.bortle} · ${esc(b.name)}${state.bortleAuto === false && lp ? ' <button class="btn ghost sm" id="bortleAuto">Use atlas value</button>' : ''}</p><p class="small muted" style="margin:0 0 10px">${esc(b.note)}</p>
    <input type="range" class="bortle" min="1" max="9" step="1" value="${state.bortle}" aria-label="Sky darkness"><div class="dark-scale"><span>Dark site</span><span>Suburb</span><span>City</span></div>
    <div class="kv" style="margin-top:12px"><span class="k">Faintest star at best tonight</span><span class="v">mag ${lim.toFixed(1)}</span><span class="k">Stars visible at once</span><span class="v">≈ ${n.toLocaleString()}</span></div>
    <h3 class="sub-h">Darker skies near you</h3>
    <div id="nearDark" class="list"><button class="btn ghost sm" id="findDark">Find the nearest naturally dark sky</button></div>
    <h3 class="sub-h">Certified dark-sky places</h3><div id="darkPlaces" class="list"><p class="muted small">Loading…</p></div>
    <p class="small muted" style="margin-top:10px">Atlas: <a target="_blank" rel="noopener" href="https://djlorenz.github.io/astronomy/lp/">David Lorenz, Light Pollution Atlas 2025</a> (zenith brightness, not a by-eye Bortle rating). Places: DarkSky International designations as listed on <a target="_blank" rel="noopener" href="https://en.wikipedia.org/wiki/Dark-sky_preserve">Wikipedia</a>. <a target="_blank" rel="noopener" href="https://djlorenz.github.io/astronomy/lp/overlay/dark.html">Open the map ↗</a></p>`;
  $('#bortleAuto') && ($('#bortleAuto').onclick = () => { state.bortleAuto = true; store.set('bortleAuto', true); renderDarkness(win); });
  $('#findDark').onclick = async () => {
    $('#nearDark').innerHTML = '<p class="muted small">Scanning the atlas within 400 km…</p>';
    const d = await nearestDark(state.lat, state.lon).catch(() => null);
    $('#nearDark').innerHTML = d ? `<a class="row-item" target="_blank" rel="noopener" href="${gmaps(d.lat, d.lon)}"><span class="ic">◐</span><span class="t"><b>${Math.round(d.km)} km ${d.dir}</b><span>${d.lat.toFixed(3)}°, ${d.lon.toFixed(3)}° · zenith ${d.sqm.toFixed(2)} · zone ${d.zone} · about Bortle ${d.bortle}</span></span><span class="r">Directions ↗</span></a>` : '<p class="muted small">No naturally dark sky within 400 km.</p>';
  };
  const places = await nearestPlaces(state.lat, state.lon, 6);
  $('#darkPlaces').innerHTML = places.map((p, i) => `<a class="row-item" target="_blank" rel="noopener" href="${gmaps(p.lat, p.lon)}"><span class="ic">✦</span><span class="t"><b>${esc(p.name)}</b><span>${esc(p.type)}${p.year ? ', ' + p.year : ''} · ${esc([p.region, p.country].filter(Boolean).join(', '))} · <i data-lp="${i}">…</i></span></span><span class="r">${Math.round(p.km)} km ${p.dir}<br>Directions ↗</span></a>`).join('');
  places.forEach((p, i) => skyAt(p.lat, p.lon).then(r => { const el = document.querySelector(`#darkPlaces [data-lp="${i}"]`); if (el) el.textContent = r ? `zenith ${r.sqm.toFixed(2)}, about Bortle ${r.bortle}` : ''; }).catch(() => { }));
}
document.addEventListener('input', e => {
  if (!e.target.classList?.contains('bortle')) return;
  state.bortle = +e.target.value; store.set('bortle', state.bortle); state.bortleAuto = false; store.set('bortleAuto', false);
  $$('.bortle').forEach(i => { if (i !== e.target) i.value = state.bortle; });
  $$('.bortle-name').forEach(el => el.textContent = `${state.bortle} · ${BORTLE[state.bortle].name}`);
  emit('bortle'); emit('layers', 'bortle');
});
document.addEventListener('change', e => { if (e.target.classList?.contains('bortle') && e.target.closest('#darkCard')) renderDarkness(nightWindow(now())); });
