// Overhead screen: zenith-centred dome + live readout of what is up right now
import { $, esc, now, state, on, emit, fmtTime, compass, D2R, R2D } from './util.js';
import { createSky } from './sky.js';
import { cat, eqjToEnuFn, enuToRaDec, constellationOf, solarSystem, nelm, mw, GALACTIC_CENTRE, radecVec, altAzFromEnu, starInfo, loadDeep, BORTLE } from './astro.js';
import { visibleSats, sats } from './sats.js';
import { upcomingEvents, until } from './events.js';

let dome = null, active = false, timer = null, lastRun = 0, deepAsked = false;

export function initOverhead() {
  dome = createSky($('#ohCanvas'), { mode: 'dome' });
  $('#ohFollow').onclick = async () => { const on_ = await dome.toggleFollow(); $('#ohFollow').classList.toggle('on', !!on_); };
  on('time', () => { if (active && performance.now() - lastRun > 900) render(); });
  on('location', () => active && render());
  on('bortle', () => active && render());
}
export function setOverheadActive(a) {
  active = a; dome?.setActive(a);
  clearInterval(timer);
  if (a) { render(); timer = setInterval(render, 5000); }
}

export function starCount(t, lim) {
  const toEnu = eqjToEnuFn(t), v = [0, 0, 0]; let n = 0;
  for (let i = 0; i < cat.n; i++) { if (cat.mag[i] > lim) continue; toEnu(cat.vec[i * 3], cat.vec[i * 3 + 1], cat.vec[i * 3 + 2], v); if (v[2] > 0.05) n++; }
  if (cat.deep && lim > 6) { const D = cat.deep; for (let i = 0; i < D.n && D.mag[i] <= lim; i++) { toEnu(D.vec[i * 3], D.vec[i * 3 + 1], D.vec[i * 3 + 2], v); if (v[2] > 0.05) n++; } }
  return n;
}
export function milkyWayAt(v, t) {
  if (!mw.data) return 0;
  const { ra, dec } = enuToRaDec(...v, t);
  return mw.data[Math.min(mw.h - 1, ((90 - dec) / 180 * mw.h) | 0) * mw.w + Math.min(mw.w - 1, (ra / 360 * mw.w) | 0)] / 255;
}

function render() {
  lastRun = performance.now();
  const t = now(), lim = nelm(t), toEnu = eqjToEnuFn(t);
  if (lim > 6 && !cat.deep && !deepAsked) { deepAsked = true; loadDeep().then(() => cat.deep && active && render()); }
  $('#ohClock').textContent = `${state.offsetMin ? 'Sky at' : 'Overhead now'} · ${fmtTime(t, !!state.offsetMin)} · ${state.name}`;
  const sol = solarSystem(t), up = sol.filter(b => b.alt > 0 && b.kind !== 'sun');
  const sl = sats.ready ? visibleSats(t, false) : [], satsUp = sl.filter(s => s.alt > 0), lit = satsUp.filter(s => s.lit);
  const stars = starCount(t, Math.max(lim, 0));
  const sun = sol[0];
  $('#ohStats').innerHTML = [
    [sun.alt > -6 ? '–' : stars.toLocaleString(), sun.alt > -6 ? 'Stars (wait for dark)' : 'Stars you can see'],
    [lim.toFixed(1), 'Faintest star (mag)'],
    [up.filter(b => b.kind === 'planet').length + (up.some(b => b.kind === 'moon') ? ' + ☾' : ''), 'Planets up'],
    [`${lit.length}<small class="muted" style="font-size:.9rem"> / ${satsUp.length}</small>`, 'Satellites lit / up'],
  ].map(([b, s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`).join('');

  // zenith
  const z = enuToRaDec(0, 0, 1, t), zc = constellationOf(z.ra, z.dec);
  let best = null, bd = 99;
  for (let i = 0; i < cat.n; i++) { if (cat.mag[i] > 3) continue; const v = toEnu(cat.vec[i * 3], cat.vec[i * 3 + 1], cat.vec[i * 3 + 2]); const d = Math.acos(Math.min(1, v[2])) * R2D; if (d < bd) { bd = d; best = i; } }
  const mwz = milkyWayAt([0, 0, 1], t), gc = toEnu(...radecVec(GALACTIC_CENTRE.ra, GALACTIC_CENTRE.dec)), gca = altAzFromEnu(gc);
  const bn = best != null ? starInfo(best) : null;
  $('#ohZenith').innerHTML = [
    ['Constellation', zc],
    ['Nearest bright star', bn ? `${bn.name}, ${bd.toFixed(0)}° from straight up` : '–'],
    ['Milky Way', mwz > .25 ? 'Arching right overhead' : mwz > .08 ? 'Its edge passes overhead' : 'Not overhead now'],
    ['Galactic core', gca.alt > 0 ? `${Math.round(gca.alt)}° up in the ${compass(gca.az)}` : 'Below the horizon'],
    ['Your sky', `Bortle ${state.bortle}, ${BORTLE[state.bortle].name.toLowerCase()}`],
  ].map(([k, v]) => `<span class="k">${k}</span><span class="v">${esc(v)}</span>`).join('');

  // up now
  const rows = up.sort((a, b) => (a.mag ?? 0) - (b.mag ?? 0)).map(b => ({ ic: b.kind === 'moon' ? '☾' : b.name[0], name: b.name, sub: `${b.kind === 'moon' ? 'Moon' : 'Planet'} · mag ${b.mag?.toFixed(1)}`, r: `${Math.round(b.alt)}° ${compass(b.az)}`, data: `data-body="${b.id}"` }));
  const bright = [];
  for (let i = 0; i < cat.n && bright.length < 6; i++) {
    if (cat.mag[i] > 1.6) continue;
    const v = toEnu(cat.vec[i * 3], cat.vec[i * 3 + 1], cat.vec[i * 3 + 2]); if (v[2] < .17) continue;
    const s = starInfo(i), a = altAzFromEnu(v);
    bright.push({ ic: '✦', name: s.name, sub: `Star · mag ${s.mag.toFixed(1)} · ${s.spec.split(' (')[1]?.replace(')', '') || ''}`, r: `${Math.round(a.alt)}° ${compass(a.az)}`, data: `data-star="${i}"` });
  }
  const all = [...rows, ...bright.sort((a, b) => 0)];
  $('#ohUp').innerHTML = all.map(r => `<div class="row-item" ${r.data}><span class="ic">${esc(r.ic)}</span><span class="t"><b>${esc(r.name)}</b><span>${esc(r.sub)}</span></span><span class="r">${esc(r.r)}</span></div>`).join('') || '<p class="muted">Nothing bright is up yet.</p>';

  // satellites
  $('#ohSatCount').textContent = sats.ready ? `${satsUp.length} above your horizon` : 'loading orbits…';
  const showS = lit.sort((a, b) => a.mag - b.mag).slice(0, 8);
  $('#ohSats').innerHTML = showS.map(s => `<div class="row-item" data-sat="${s.norad}"><span class="ic">${s.norad === 25544 ? '✦' : '·'}</span><span class="t"><b>${esc(s.name)}</b><span>${Math.round(s.height)} km up · ${(s.vel * 3.6).toFixed(1)}k km/h</span></span><span class="r">${Math.round(s.alt)}° ${compass(s.az)}<br>mag ${s.mag.toFixed(1)}</span></div>`).join('')
    || `<p class="muted">${sun.alt > -4 ? 'Satellites show up as moving stars after sunset, while they are still in sunlight overhead.' : 'No sunlit satellites up this minute. They are brightest in the first two hours after dusk and before dawn.'}</p>`;

  // coming up
  const { events, shower } = upcomingEvents(t, 14);
  $('#ohNext').innerHTML = events.slice(0, 9).map(e => `<div class="row-item" ${e.ref ? (typeof e.ref === 'number' ? `data-sat="${e.ref}"` : `data-body="${e.ref}"`) : ''}><span class="ic">${esc(e.icon)}</span><span class="t"><b>${esc(e.name)}</b><span>${esc(e.detail || fmtTime(e.time))}</span></span><span class="r">in ${until(e.time, t)}<br>${fmtTime(e.time)}</span></div>`).join('')
    + (shower && shower.peak - t < 40 * 86400e3 ? `<div class="row-item"><span class="ic">☄</span><span class="t"><b>${esc(shower.name)} meteor shower</b><span>Up to ${shower.zhr}/h under dark skies · radiant in ${esc(shower.rad)}</span></span><span class="r">peaks in<br>${until(shower.peak, t)}</span></div>` : '');
}

// taps on the readout open the info sheet
document.addEventListener('click', e => {
  const r = e.target.closest('#view-overhead [data-body], #view-overhead [data-star], #view-overhead [data-sat]'); if (!r) return;
  let o;
  if (r.dataset.body) o = solarSystem(now()).find(b => b.id === r.dataset.body);
  if (r.dataset.star) o = starInfo(+r.dataset.star);
  if (r.dataset.sat) o = sats.list.find(s => s.norad === +r.dataset.sat);
  if (o) { dome?.select(o); emit('select', o); }
});
