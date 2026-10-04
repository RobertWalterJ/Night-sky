// Desktop Lab: "what just passed overhead?" and agency imagery search
import { $, $$, esc, state, cachedJSON, fmtTime, compass, COMPASS, D2R, R2D, clamp, toast, emit } from './util.js';
import { sats, loadGroup, satPosition, obsSunAlt } from './sats.js';
import { solarSystem, cat, eqjToEnuFn, altAzFromEnu } from './astro.js';

export function initLab() {
  const dirs = COMPASS.filter((_, i) => i % 2 === 0);
  $('#ohFrom').innerHTML = dirs.map(d => `<option ${d === 'W' ? 'selected' : ''}>${d}</option>`).join('');
  $('#ohTo').innerHTML = dirs.map(d => `<option ${d === 'E' ? 'selected' : ''}>${d}</option>`).join('');
  const d = new Date(Date.now() - 5 * 60000); d.setSeconds(0, 0);
  $('#ohWhen').value = new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  $('#overheadForm').onsubmit = e => { e.preventDefault(); identify(); };
  $('#imgForm').onsubmit = e => { e.preventDefault(); searchImages($('#imgQuery').value, $('#imgAgency').value); };
  $$('#imgPresets button').forEach(b => b.onclick = () => b.dataset.q === 'EPIC' ? epic() : searchImages(b.dataset.q, ''));
}
export function renderLab() { if (!$('#imgGrid').children.length) searchImages('nebula', ''); }

const dirAz = d => COMPASS.indexOf(d) * 22.5;
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

async function identify() {
  const out = $('#overheadResults'); out.innerHTML = '<p class="muted">Loading orbits and searching…</p>';
  const T = new Date($('#ohWhen').value), from = dirAz($('#ohFrom').value), to = dirAz($('#ohTo').value);
  const peak = +$('#ohAlt').value, dur = +$('#ohDur').value, kind = $('#ohKind').value;
  try {
    await loadGroup('stations'); await loadGroup('visual');
    if ($('#ohStarlink').checked) { await loadGroup('starlink'); try { await loadGroup('active'); } catch { } }
  } catch { out.innerHTML = '<p class="muted">Could not download satellite orbits.</p>'; return; }
  const dark = obsSunAlt(T) < -4, results = [];
  if (kind === 'still') return identifyStatic(T, to, peak, out);
  // scan each satellite ±10 min around T at 10 s steps
  const t0 = +T - 600e3, step = 10e3;
  const cand = sats.list;
  let i = 0;
  const work = () => new Promise(res => {
    const chunk = () => {
      const stop = Math.min(i + 400, cand.length);
      for (; i < stop; i++) {
        const s = cand[i]; let pts = [];
        for (let k = 0; k <= 120; k++) { const p = satPosition(s, new Date(t0 + k * step)); if (p && p.alt > 5) pts.push({ ...p, t: t0 + k * step }); }
        if (pts.length < 2) continue;
        // keep the visible segment closest to T
        const lit = pts.filter(p => p.sunlit);
        const seg = (lit.length >= 2 ? lit : pts);
        const max = seg.reduce((a, b) => b.alt > a.alt ? b : a);
        const first = seg[0], last = seg[seg.length - 1];
        const segDur = (last.t - first.t) / 1000 + step / 1000;
        const timeFit = Math.exp(-((((max.t - T) / 1000) / 300) ** 2));
        const dirFit = (Math.max(0, 1 - angDiff(first.az, from) / 90) + Math.max(0, 1 - angDiff(last.az, to) / 90)) / 2;
        const altFit = Math.max(0, 1 - Math.abs(max.alt - peak) / 45);
        const durFit = Math.max(0, 1 - Math.abs(Math.log((segDur + 5) / (dur + 5))) / 1.6);
        const visFit = lit.length >= 2 && dark ? 1 : .12;
        const bright = max.mag < 3 ? 1 : max.mag < 4.5 ? .75 : .4;
        let score = timeFit * visFit * bright * (.35 + .65 * dirFit) * (.3 + .7 * altFit) * (.6 + .4 * durFit);
        if (kind === 'train' && s.group === 'starlink') score *= 1.4;
        if (kind === 'steady' && s.norad === 25544) score *= 1.3;
        if (kind === 'flash') score *= .6;
        if (score > .02) results.push({ s, score, first, last, max, segDur, lit: lit.length >= 2 });
      }
      if (i < cand.length) { out.innerHTML = `<p class="muted">Checked ${i.toLocaleString()} of ${cand.length.toLocaleString()} satellites…</p>`; setTimeout(chunk, 0); } else res();
    };
    chunk();
  });
  await work();
  results.sort((a, b) => b.score - a.score);
  // group Starlink trains
  const top = results.slice(0, 8), best = top[0]?.score || 1;
  const trains = results.filter(r => r.s.group === 'starlink' || /STARLINK/.test(r.s.full)).length;
  let html = top.map(r => `<div class="match"><b>${esc(r.s.name)}</b> <span class="muted small">NORAD ${r.s.norad}</span>
    <div class="small muted">Peak ${Math.round(r.max.alt)}° at ${fmtTime(new Date(r.max.t))} · ${compass(r.first.az)} → ${compass(r.last.az)} · ~${Math.round(r.segDur / 60 * 10) / 10} min · ${r.lit ? `sunlit, about mag ${r.max.mag.toFixed(1)}` : 'in shadow (would not have been visible)'}</div>
    <div class="bar"><i style="width:${Math.round(r.score / best * 100)}%"></i></div>
    <button class="btn ghost sm" data-show="${r.s.norad}" style="margin-top:8px">Show in sky</button></div>`).join('');
  if (!top.length) html = '<p>No satellite matches. It may have been an aircraft, a meteor or a rocket body not in the catalogue.</p>';
  if (trains > 6 && kind === 'train') html = `<p class="pill good">Looks like a Starlink train: ${trains} Starlink satellites crossed your sky in that window.</p>` + html;
  html += `<p class="small muted" style="margin-top:12px">Also check: <a target="_blank" rel="noopener" href="https://www.flightradar24.com/${state.lat.toFixed(2)},${state.lon.toFixed(2)}/9">aircraft (Flightradar24 ↗)</a> · <a target="_blank" rel="noopener" href="https://fireball.amsmeteors.org/members/imo_view/browse_events">fireball reports (AMS ↗)</a> · <a target="_blank" rel="noopener" href="https://thespacedevs.com/llapi">recent launches ↗</a></p>`;
  if (!dark) html = '<p class="pill bad">The Sun was up or it was still twilight, so most satellites would have been hard to see.</p>' + html;
  out.innerHTML = html;
  $$('[data-show]').forEach(b => b.onclick = () => { const s = sats.list.find(x => x.norad === +b.dataset.show); state.offsetMin = Math.round((T - Date.now()) / 60000); emit('time'); emit('goto', s); });
}

function identifyStatic(T, az, alt, out) {
  const toEnu = eqjToEnuFn(T), list = [];
  for (const b of solarSystem(T)) if (b.alt > 0 && b.kind !== 'sun') list.push({ name: b.name, alt: b.alt, az: b.az, mag: b.mag });
  for (let i = 0; i < cat.n; i++) if (cat.mag[i] < 1.5) { const a = altAzFromEnu(toEnu(cat.vec[i * 3], cat.vec[i * 3 + 1], cat.vec[i * 3 + 2])); if (a.alt > 0) list.push({ name: cat.names[cat.id[i]]?.[0] || 'Bright star', ...a, mag: cat.mag[i] }); }
  list.forEach(o => o.d = angDiff(o.az, az) * Math.cos(alt * D2R) + Math.abs(o.alt - alt));
  list.sort((a, b) => a.d - b.d + (a.mag - b.mag) * 3);
  out.innerHTML = '<p class="small muted">Bright things in that part of the sky at that time:</p>' + list.slice(0, 6).map(o => `<div class="match"><b>${esc(o.name)}</b><div class="small muted">${Math.round(o.alt)}° up in the ${compass(o.az)} · mag ${o.mag?.toFixed(1) ?? '–'}</div></div>`).join('')
    + '<p class="small muted">Venus and Jupiter are the usual "very bright star that doesn\'t move" sightings.</p>';
}

async function searchImages(q, agency) {
  const grid = $('#imgGrid'); grid.innerHTML = '<p class="muted">Searching…</p>';
  const extra = { NASA: '', ESA: ' ESA', CSA: ' Canadian Space Agency', JWST: ' Webb', Hubble: ' Hubble' }[agency] || '';
  const recent = /webb|latest/i.test(q + extra) ? '&year_start=2023' : '';
  try {
    const d = await cachedJSON(`https://images-api.nasa.gov/search?q=${encodeURIComponent(q + extra)}&media_type=image&page_size=36${recent}`, 120);
    const items = d.collection.items.filter(i => i.links?.[0]?.href);
    grid.innerHTML = items.map(i => { const m = i.data[0]; return `<a href="https://images.nasa.gov/details/${encodeURIComponent(m.nasa_id)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(i.links[0].href)}" alt=""><span>${esc(m.title)}</span><span class="muted">${esc((m.date_created || '').slice(0, 10))} · ${esc(m.center || m.secondary_creator || '')}</span></a>`; }).join('') || '<p class="muted">No images found.</p>';
    grid.insertAdjacentHTML('beforeend', `<p class="small muted" style="grid-column:1/-1">More galleries: <a target="_blank" rel="noopener" href="https://esawebb.org/images/">ESA/Webb ↗</a> · <a target="_blank" rel="noopener" href="https://esahubble.org/images/">ESA/Hubble ↗</a> · <a target="_blank" rel="noopener" href="https://www.esa.int/ESA_Multimedia/Images">ESA multimedia ↗</a> · <a target="_blank" rel="noopener" href="https://www.asc-csa.gc.ca/eng/multimedia/search/image/">CSA images ↗</a> · <a target="_blank" rel="noopener" href="https://worldview.earthdata.nasa.gov/">NASA Worldview (Earth today) ↗</a></p>`);
  } catch { grid.innerHTML = '<p class="muted">Image search unavailable.</p>'; }
}

async function epic() {
  const grid = $('#imgGrid'); grid.innerHTML = '<p class="muted">Fetching the latest full-disc Earth images from DSCOVR…</p>';
  try {
    const list = await cachedJSON('https://epic.gsfc.nasa.gov/api/natural', 120);
    grid.innerHTML = list.map(i => { const [y, m, d] = i.date.slice(0, 10).split('-'); const u = `https://epic.gsfc.nasa.gov/archive/natural/${y}/${m}/${d}/jpg/${i.image}.jpg`; const th = `https://epic.gsfc.nasa.gov/archive/natural/${y}/${m}/${d}/thumbs/${i.image}.jpg`; return `<a href="${u}" target="_blank" rel="noopener"><img loading="lazy" src="${th}" alt=""><span>Earth from 1.5 million km</span><span class="muted">${esc(i.date)} UTC</span></a>`; }).join('');
  } catch { grid.innerHTML = '<p class="muted">EPIC unavailable.</p>'; }
}
