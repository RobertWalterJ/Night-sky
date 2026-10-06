// App shell: routing, location, theme, time travel, search
import { $, $$, state, store, on, emit, now, toast, esc, cachedJSON, isDesktop } from './util.js';
import { loadCatalog, cat, solarSystem, sunAlt, starInfo } from './astro.js';
import { initSky, setSkyActive, goTo, sky, createSky } from './sky.js';
import { initOverhead, setOverheadActive } from './overhead.js';
import { BORTLE } from './astro.js';
import { initEarth, setEarthActive } from './earth.js';
import { initCalendar, renderCalendar } from './calendar.js';
import { renderSpaceComms, stopSpaceComms } from './spacecomms.js';
import { renderTonight } from './tonight.js';
import { openInfo, closeInfo, toggleInfoMin } from './info.js';
import { initFeed, renderFeed, stopFeed } from './feed.js';
import { initRadio, renderRadio } from './radio.js';
import { declination } from './wmm.js';
import { initLab, renderLab } from './lab.js';
import { loadGroup, sats } from './sats.js';

let view = null, hero = null;
const rendered = {};

// ---------- theme ----------
function applyTheme(t, persist = true) {
  document.documentElement.dataset.theme = t;
  if (persist) { state.theme = t; store.set('theme', t); }
  $$('[data-theme-set]').forEach(b => b.classList.toggle('on', b.dataset.themeSet === t));
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  document.querySelector('meta[name=theme-color]').content = bg;
  emit('theme', t);
}
function autoTheme() {
  if (!state.autoNight || state.manualThisSession) return;
  const night = sunAlt(new Date()) < -6;
  applyTheme(night ? 'stargazer' : (state.theme === 'stargazer' ? 'airy' : state.theme), false);
}

function closeMenu() { $('#menu').hidden = true; }

// ---------- routing ----------
function go(v) {
  if (v === view) return;
  view = v;
  $$('.view').forEach(s => s.classList.toggle('on', s.id === 'view-' + v));
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.go === v));
  setSkyActive(v === 'sky');
  hero?.setActive(v === 'tonight');
  setOverheadActive(v === 'overhead');
  setEarthActive(v === 'earth');
  if (v === 'events') renderCalendar();
  if (v === 'radio') renderSpaceComms(); else stopSpaceComms();
  if (v !== 'feed') stopFeed();
  if (v === 'tonight' && !rendered.tonight) { rendered.tonight = true; renderTonight(); }
  if (v === 'feed') renderFeed();
  if (v === 'radio' && !rendered.radio) { rendered.radio = true; renderRadio(); }
  if (v === 'lab') renderLab();
  history.replaceState(null, '', '#' + v);
}

// ---------- location ----------
async function setLocation(lat, lon, name) {
  Object.assign(state, { lat, lon });
  state.declination = declination(lat, lon, (state.elev || 0) / 1000, new Date()); emit('declination', state.declination); // phone compasses point to MAGNETIC north
  state.name = name || `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
  $('#locName').textContent = state.name;
  store.set('loc', { lat, lon, name: state.name });
  if (!name) {
    try { const g = await cachedJSON(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`, 1440); state.name = [g.city || g.locality, g.principalSubdivisionCode?.split('-')[1] || g.countryCode].filter(Boolean).join(', ') || state.name; $('#locName').textContent = state.name; store.set('loc', { lat, lon, name: state.name }); } catch { }
  }
  Object.keys(rendered).forEach(k => rendered[k] = false);
  emit('location');
  if (view === 'tonight') { rendered.tonight = true; renderTonight(); }
  if (view === 'radio') { rendered.radio = true; renderRadio(); }
}
function gps(quiet) {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(p => { state.elev = p.coords.altitude || state.elev; setLocation(+p.coords.latitude.toFixed(4), +p.coords.longitude.toFixed(4)); $('#locDialog').close?.(); },
    () => { if (!quiet) toast('Location permission denied. Search for a place instead.'); }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 });
}
function bindLocation() {
  const dlg = $('#locDialog');
  $('#locChip').onclick = () => { $('#latIn').value = state.lat; $('#lonIn').value = state.lon; dlg.showModal(); };
  $('#useGps').onclick = () => gps(false);
  $('#setLatLon').onclick = () => { const la = +$('#latIn').value, lo = +$('#lonIn').value; if (Math.abs(la) <= 90 && Math.abs(lo) <= 180) { setLocation(la, lo); dlg.close(); } };
  let t;
  $('#placeQuery').oninput = e => {
    clearTimeout(t); const q = e.target.value.trim(); if (q.length < 2) return;
    t = setTimeout(async () => {
      try {
        const r = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en`)).json();
        $('#placeResults').innerHTML = (r.results || []).map((p, i) => `<button type="button" class="row-item" data-i="${i}" style="background:none;border:0;border-bottom:1px solid var(--line);text-align:left"><span class="t"><b>${esc(p.name)}</b><span>${esc([p.admin1, p.country].filter(Boolean).join(', '))}</span></span></button>`).join('');
        $$('#placeResults [data-i]').forEach(b => b.onclick = () => { const p = r.results[+b.dataset.i]; state.elev = p.elevation || 0; setLocation(p.latitude, p.longitude, `${p.name}, ${p.admin1 || p.country_code}`); dlg.close(); });
      } catch { }
    }, 300);
  };
}

// ---------- time travel ----------
function bindTime() {
  const sl = $('#timeSlider');
  const set = m => { state.offsetMin = m; sl.value = Math.max(-720, Math.min(720, m)); $('#timeLabel').textContent = m ? `${m > 0 ? '+' : '−'}${Math.floor(Math.abs(m) / 60)}h${String(Math.abs(m) % 60).padStart(2, '0')}` : 'Live'; emit('time'); };
  sl.oninput = () => set(+sl.value);
  $('#tMinus').onclick = () => set(state.offsetMin - 60);
  $('#tPlus').onclick = () => set(state.offsetMin + 60);
  $('#tNow').onclick = () => set(0);
  $('#timeChip').onclick = () => { if (state.offsetMin) set(0); else go('sky'); };
  let play = null;
  $('#tPlay').onclick = () => {
    if (play) { clearInterval(play); play = null; $('#tPlay').textContent = '▶'; return; }
    $('#tPlay').textContent = '❚❚';
    play = setInterval(() => { const m = state.offsetMin + 3; if (m > 1440) { clearInterval(play); play = null; $('#tPlay').textContent = '▶'; return; } set(m); }, 60);
  };
  on('time', () => { if (!state.offsetMin) { sl.value = 0; $('#timeLabel').textContent = 'Live'; } });
}

// ---------- search ----------
function bindSearch() {
  const inp = $('#skySearch'), box = $('#searchResults');
  inp.oninput = () => {
    const q = inp.value.trim().toLowerCase(); if (q.length < 2) { box.classList.remove('on'); return; }
    const res = [];
    for (const b of solarSystem(now())) if (b.name.toLowerCase().startsWith(q)) res.push([b.name, b.kind === 'planet' ? 'Planet' : b.name, b]);
    for (const s of sats.list) if (s.group !== 'active' && (s.name.toLowerCase().includes(q) || String(s.norad) === q)) { res.push([s.name, 'Satellite', s]); if (res.length > 12) break; }
    for (const c of Object.values(cat.cons)) if (c.n.toLowerCase().startsWith(q)) res.push([c.n, 'Constellation', { kind: 'const', id: 'con' + c.n, name: c.n, gen: c.g }]);
    for (const d of cat.dsos) if (d.id.toLowerCase() === q || (d.alt || '').toLowerCase().includes(q) || (d.desig || '').toLowerCase() === q) res.push([`${d.id}${d.alt ? ' · ' + d.alt : ''}`, d.t, { kind: 'dso', ...d, name: d.alt || d.id }]);
    for (let i = 0; i < cat.n && res.length < 14; i++) { const nm = cat.names[cat.id[i]]; if (nm?.[0] && nm[0].toLowerCase().startsWith(q)) res.push([nm[0], `Star · mag ${cat.mag[i]}`, starInfo(i)]); }
    box.innerHTML = res.slice(0, 10).map((r, i) => `<button data-r="${i}"><b>${esc(r[0])}</b> <span class="muted small">${esc(r[1])}</span></button>`).join('') || '<button disabled class="muted">No match</button>';
    box.classList.add('on');
    $$('[data-r]', box).forEach(b => b.onclick = () => { const o = res[+b.dataset.r][2]; box.classList.remove('on'); inp.value = ''; inp.blur(); goTo(o); openInfo(o); });
  };
  inp.onblur = () => setTimeout(() => box.classList.remove('on'), 200);
}

// ---------- settings ----------
function bindSettings() {
  const dlg = $('#setDialog');
  $('#settingsBtn').addEventListener('click', () => { const d = state.declination; $('#declLine').textContent = `Compass is corrected to true north automatically: magnetic declination ${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}° (World Magnetic Model 2025).`; });
  $('#settingsBtn').onclick = () => { $('#autoNight').checked = state.autoNight; $('#use24').checked = state.use24; $('#nasaKey').value = state.nasaKey; $('#calOffset').textContent = `${state.calOffset.toFixed(1)}°`; dlg.showModal(); };
  dlg.addEventListener('close', () => {
    state.autoNight = $('#autoNight').checked; store.set('autoNight', state.autoNight);
    state.use24 = $('#use24').checked; store.set('use24', state.use24);
    state.nasaKey = $('#nasaKey').value.trim(); store.set('nasaKey', state.nasaKey);
    rendered.tonight = false; if (view === 'tonight') { rendered.tonight = true; renderTonight(); }
  });
  $('#resetCal').onclick = () => { state.calOffset = 0; store.set('calOffset', 0); $('#calOffset').textContent = '0°'; };
  on('calibrated', v => $('#calOffset').textContent = `${v.toFixed(1)}°`);
}

// ---------- boot ----------
async function boot() {
  applyTheme(state.theme);
  $$('[data-theme-set]').forEach(b => b.onclick = () => { state.manualThisSession = true; applyTheme(b.dataset.themeSet); });
  $$('[data-go]').forEach(b => b.onclick = () => { go(b.dataset.go); closeMenu(); });
  // menu (hamburger) and quick theme cycle
  $('#menuBtn').onclick = () => { $('#menu').hidden = false; };
  $('#menuClose').onclick = closeMenu;
  $('#menu').onclick = e => { if (e.target.id === 'menu') closeMenu(); };
  $('#settingsBtn').addEventListener('click', closeMenu);
  const THEMES = ['airy', 'cosmos', 'stargazer', 'terminal'], ICON = { airy: '◐', cosmos: '✦', stargazer: '●', terminal: '▮' };
  $('#themeCycle').onclick = () => { const i = THEMES.indexOf(document.documentElement.dataset.theme); state.manualThisSession = true; applyTheme(THEMES[(i + 1) % 4]); };
  on('theme', t => { $('#themeCycle').textContent = ICON[t] || '◐'; }); $('#themeCycle').textContent = ICON[document.documentElement.dataset.theme] || '◐';
  if (!store.get('declV1', 0)) { const had = state.calOffset; state.calOffset = 0; store.set('calOffset', 0); store.set('declV1', 1); if (Math.abs(had) > .5) setTimeout(() => toast('The compass now corrects to true north automatically, so your old manual alignment was cleared. Use Align if it is still off.', 6000), 2500); }
  bindLocation(); bindTime(); bindSearch(); bindSettings();
  $('#sheetClose').onclick = closeInfo; $('#sheetMin').onclick = toggleInfoMin;
  $('#sheet').onclick = e => { if (e.target.id === 'sheet') closeInfo(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeInfo(); });

  const saved = store.get('loc');
  if (saved) { Object.assign(state, saved); $('#locName').textContent = saved.name; }
  else $('#locName').textContent = state.name;
  state.declination = declination(state.lat, state.lon, (state.elev || 0) / 1000, new Date()); // also for the restored or default place, not only after a location change

  await loadCatalog();
  autoTheme(); setInterval(autoTheme, 5 * 60000);
  initSky(); initFeed(); import('./livedata.js').then(m => m.initDataStatus()).catch(() => { }); import('./sound.js').then(m => m.initSound()).catch(e => console.warn('sky sound', e)); initRadio(); initLab(); initOverhead(); initEarth(); initCalendar();
  on('nav', v => go(v));
  hero = createSky($('#heroCanvas'), { mode: 'dome', mini: true, onTap: () => go('overhead') });
  $$('.bortle').forEach(i => i.value = state.bortle);
  $$('.bortle-name').forEach(el => el.textContent = `${state.bortle} · ${BORTLE[state.bortle].name}`);
  on('select', o => openInfo(o));
  on('goto', o => { go('sky'); goTo(o); });
  on('time', () => sky.invalidate());

  // list taps on Tonight
  $('#view-tonight').addEventListener('click', e => {
    const r = e.target.closest('[data-obj],[data-dso],[data-sat]'); if (!r || r.closest('#heroDome')) return;
    let o;
    if (r.dataset.obj) o = solarSystem(now()).find(b => b.id === r.dataset.obj);
    if (r.dataset.dso) { const d = cat.dsos.find(x => x.id === r.dataset.dso); o = { kind: 'dso', ...d, name: d.alt || d.id }; }
    if (r.dataset.sat) o = sats.list.find(s => s.norad === +r.dataset.sat);
    if (o) { sky.select(o); openInfo(o); }
  });

  const start = (location.hash || '').slice(1);
  go(['tonight', 'overhead', 'sky', 'earth', 'listen', 'events', 'feed', 'radio', 'lab'].includes(start) ? start : 'tonight');
  if (!saved) gps(true);
  loadGroup('stations').then(() => loadGroup('visual')).then(() => sky.invalidate()).catch(() => { });
  on('layers', l => { if (l === 'starlink' && state.layers.starlink) loadGroup('starlink').then(() => sky.invalidate()).catch(() => toast('Could not load Starlink orbits')); });
  if (state.layers.starlink) loadGroup('starlink').catch(() => { });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
}
boot();
