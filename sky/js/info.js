// Object info sheet: facts, live position, Wikipedia summary, 3D model viewer
import { $, esc, now, fmtTime, compass, cachedJSON, state, emit, R2D } from './util.js';
import { BODY_FACTS, bodyHorizontal, riseSet, transit, moonInfo, constellationOf, cat, eqjToEnuFn, altAzFromEnu, dsoSprite } from './astro.js';
import { satPosition, predictPasses } from './sats.js';
import { profile, satcat, modelFor, relativeSize, ownerName, launchYearFromIntl, transmitters } from './satinfo.js';
import { comets, cometState, perihelionNear } from './comets.js';
import { visibilityNow } from './visibility.js';

const A = window.Astronomy;
const kv = rows => rows.filter(r => r && r[1] != null && r[1] !== '').map(([k, v]) => `<span class="k">${esc(k)}</span><span class="v">${esc(v)}</span>`).join('');
const raStr = ra => { const h = ra / 15, hh = Math.floor(h), mm = (h - hh) * 60; return `${hh}h ${mm.toFixed(1)}m`; };
const decStr = d => `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(2)}°`;
let viewerMod = null;

// Orbit worked out from the satellite's own elements, for objects with no catalogue row (or when the catalogue is unreachable)
function tleOrbit(rec) {
  if (!rec || !rec.no) return null;
  const per = 2 * Math.PI / rec.no, a = Math.cbrt(398600.4418 * Math.pow(per * 60 / (2 * Math.PI), 2)), e = rec.ecco || 0;
  return { PERIOD: per, INCLINATION: rec.inclo * R2D, APOGEE: a * (1 + e) - 6378.137, PERIGEE: a * (1 - e) - 6378.137 };
}

// One failing detail must never blank the whole sheet: show what is known and say so.
export async function openInfo(o) {
  try { await openInfoCore(o); }
  catch (e) {
    console.warn('info sheet', e); $('#sheet').hidden = false; $('#sheet').classList.remove('min');
    $('#objType').textContent = 'Details'; $('#objName').textContent = o.name || '';
    $('#objFacts').innerHTML = kv([['Note', 'Some details could not be loaded just now. Showing what is known.'], ['NORAD ID', o.norad], ['Direction and height', null]]);
    $('#objActions').innerHTML = `<button class="btn sm" id="showInSky">Show in sky</button>`; $('#showInSky').onclick = () => { closeInfo(); emit('goto', o); };
  }
}
async function openInfoCore(o) {
  const sheet = $('#sheet'); sheet.hidden = false; sheet.classList.remove('min'); setMinUi();
  const t = now(), mw = $('#modelWrap');
  let type = '', rows = [], wiki = [], model = null, phase = null, sprite = null, extra = '', vis = null;
  if (o.kind === 'sun' || o.kind === 'moon' || o.kind === 'planet') {
    const h = bodyHorizontal(o.id, t), F = BODY_FACTS[o.id];
    const il = (() => { try { return A.Illumination(o.id, t); } catch { return null; } })();
    type = o.kind === 'planet' ? 'Planet' : o.kind === 'moon' ? "Earth's Moon" : 'Our star';
    const distKm = h.dist * 149597870.7;
    rows = [['Altitude', `${h.alt.toFixed(1)}°`], ['Direction', `${compass(h.az)} (${h.az.toFixed(0)}°)`], ['Constellation', constellationOf(h.ra, h.dec)],
      ['Magnitude', il ? il.mag.toFixed(2) : null], ['Distance', o.kind === 'moon' ? `${Math.round(distKm).toLocaleString()} km` : `${h.dist.toFixed(3)} AU (${(distKm / 1e6).toFixed(0)} M km)`],
      ['Rises', fmtTime(riseSet(o.id, t, +1), true)], ['Transits', fmtTime(transit(o.id, t), true)], ['Sets', fmtTime(riseSet(o.id, t, -1), true)],
      ['Diameter', F?.d], ...(F?.facts || [])];
    let sepSun; if (o.kind === 'moon') { const sh = bodyHorizontal('Sun', t), d2r = Math.PI / 180, vv = (az, al) => [Math.sin(az * d2r) * Math.cos(al * d2r), Math.cos(az * d2r) * Math.cos(al * d2r), Math.sin(al * d2r)], a1 = vv(h.az, h.alt), a2 = vv(sh.az, sh.alt); sepSun = Math.acos(Math.max(-1, Math.min(1, a1[0] * a2[0] + a1[1] * a2[1] + a1[2] * a2[2]))) / d2r; }
    vis = visibilityNow({ kind: o.kind, mag: il ? il.mag : null, alt: h.alt, illum: il ? il.phase_fraction : undefined, sepSun }, t);
    if (o.kind === 'moon') { const mi = moonInfo(t); phase = mi.phaseAngle; rows.splice(3, 0, ['Phase', `${mi.name}, ${Math.round(mi.illum * 100)}% lit`], ['Age', `${mi.age.toFixed(1)} days`]); }
    if (o.kind === 'planet' && il) rows.splice(4, 0, ['Illuminated', `${Math.round(il.phase_fraction * 100)}%`]);
    model = F?.model; wiki = o.kind === 'planet' && o.id === 'Mercury' ? ['Mercury (planet)'] : [o.id];
    if (o.kind === 'sun') rows.unshift(['Warning', 'Never look at the Sun without a certified solar filter']);
  } else if (o.kind === 'star') {
    const e = eqjToEnuFn(t)(cat.vec[o.idx * 3], cat.vec[o.idx * 3 + 1], cat.vec[o.idx * 3 + 2]), aa = altAzFromEnu(e);
    const con = cat.cons[cat.names[o.hip]?.[2]];
    type = `Star · ${o.spec.split(' ')[0]}-type`;
    rows = [['Altitude', `${aa.alt.toFixed(1)}°`], ['Direction', `${compass(aa.az)} (${aa.az.toFixed(0)}°)`], ['Magnitude', o.mag.toFixed(2)], ['Colour', o.spec],
      ['Designation', o.bayer && con ? `${o.bayer.split(' ')[0]} ${con.g}` : o.bayer], ['Catalogue', [o.hd, `HIP ${o.hip}`].filter(Boolean).join(' · ')],
      ['RA / Dec', `${raStr(o.ra)} / ${decStr(o.dec)}`], ['Constellation', constellationOf(o.ra, o.dec)]];
    wiki = o.proper ? [`${o.proper} (star)`, o.proper] : o.bayer && con ? [`${o.bayer.split(' ')[0]} ${con.g}`] : [];
    vis = visibilityNow({ kind: 'star', mag: o.mag, alt: aa.alt }, t);
  } else if (o.kind === 'dso') {
    const d = cat.dsos.find(x => x.id === o.id), e = eqjToEnuFn(t)(...d.v), aa = altAzFromEnu(e);
    type = d.t; sprite = dsoSprite(d.tc);
    rows = [['Catalogue', `${d.id}${d.desig ? ' · ' + d.desig : ''}`], ['Altitude', `${aa.alt.toFixed(1)}°`], ['Direction', compass(aa.az)], ['Magnitude', d.m], ['Apparent size', d.dim ? `${d.dim} arcmin` : null],
      ['Constellation', constellationOf(d.ra, d.de)], ['RA / Dec', `${raStr(d.ra)} / ${decStr(d.de)}`], ['Best seen with', d.m < 5 ? 'Naked eye or binoculars' : d.m < 8 ? 'Binoculars or small telescope' : 'Telescope']];
    wiki = [`Messier ${d.id.slice(1)}`];
    vis = visibilityNow({ kind: 'dso', mag: +d.m, alt: aa.alt, extended: true }, t);
  } else if (o.kind === 'sat') {
    const p = satPosition(o, t), pr = profile(o), tx = await transmitters(o.norad).catch(() => []);
    const sc = await Promise.race([satcat(o.norad), new Promise(r => setTimeout(() => r(null), 2500))]);
    const status = { '+': 'Operational', '-': 'Not operational', P: 'Partially operational', B: 'Backup', S: 'Spare', X: 'Extended mission', D: 'Decayed', '?': 'Unknown' }[sc?.OPS_STATUS_CODE] || '';
    type = pr?.name && pr.name !== o.name ? pr.name : sc?.OBJECT_TYPE === 'R/B' ? 'Rocket body' : sc?.OBJECT_TYPE === 'DEB' ? 'Debris' : o.norad === 25544 ? 'Crewed space station' : 'Satellite';
    const orb = sc && sc.PERIOD != null ? sc : tleOrbit(o.rec);
    const geo = o.rec && 2 * Math.PI / o.rec.no > 600;
    const next = geo ? null : predictPasses(o, t, 48).find(x => x.visible);
    const SITES = { AFETR: 'Cape Canaveral, Florida', AFWTR: 'Vandenberg, California', TYMSC: 'Baikonur, Kazakhstan', PKMTR: 'Plesetsk, Russia', VOSTO: 'Vostochny, Russia', XICLF: 'Xichang, China', JSC: 'Jiuquan, China', TAISC: 'Taiyuan, China', WSC: 'Wenchang, China', TNSTA: 'Tanegashima, Japan', KSCUT: 'Uchinoura, Japan', SRILR: 'Sriharikota, India', FRGUI: 'Kourou, French Guiana', RLLB: 'Mahia, New Zealand (Rocket Lab)', WRAS: 'Wallops Island, Virginia', KODAK: 'Kodiak, Alaska', SEAL: 'Sea Launch platform', SVOBO: 'Svobodny, Russia', YAVNE: 'Palmachim, Israel', SEMLS: 'Semnan, Iran', NSC: 'Naro, South Korea', DLS: 'Dombarovsky, Russia', SNMLP: 'San Marco platform, Kenya' };
    const launched = sc?.LAUNCH_DATE ? new Date(sc.LAUNCH_DATE + 'T12:00Z') : null;
    const age = launched ? ((t - launched) / 3.156e10) : null;
    rows = [['Operator', pr?.operator || ownerName(sc?.OWNER)], ['Status', status], ['Launched', launched ? `${launched.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })} (${age.toFixed(age < 2 ? 1 : 0)} years ago)` : launchYearFromIntl(sc?.OBJECT_ID || '') || null],
      ['Launch site', SITES[sc?.LAUNCH_SITE] || sc?.LAUNCH_SITE], ['Expected end', pr?.end], ['Mission', pr?.mission],
      ['Size', pr?.dims || (pr?.len ? `≈ ${pr.len} m` : sc?.RCS ? `radar cross-section ${sc.RCS.toFixed(2)} m²` : null)],
      ['Compared with', pr?.len ? relativeSize(pr.len) : sc?.RCS ? relativeSize(Math.sqrt(sc.RCS) * 1.6) : null], ['Mass', pr?.mass],
      ['Orbit', orb ? `${Math.round(orb.PERIGEE)} to ${Math.round(orb.APOGEE)} km, ${(+orb.INCLINATION).toFixed(1)}° inclination, ${(+orb.PERIOD).toFixed(1)} min per orbit${sc && sc.PERIOD != null ? '' : ' (from its orbit data)'}` : null],
      ['Right now', p ? `${p.alt.toFixed(1)}° above your horizon in the ${compass(p.az)}, ${Math.round(p.range)} km away` : null],
      ['Over', p ? `${p.lat.toFixed(1)}°, ${p.lon.toFixed(1)}°, ${Math.round(p.height)} km up` : null],
      ['Speed', p?.vel ? `${(p.vel * 3600).toLocaleString(undefined, { maximumFractionDigits: 0 })} km/h` : null],
      ['In sunlight', p ? (p.sunlit ? 'Yes' : "No, in Earth's shadow") : null], ['Brightness', p ? `about mag ${p.mag.toFixed(1)}` : null],
      ['Next visible pass', geo ? 'None: it hangs almost still in your sky, too faint to see without a telescope' : next ? `${fmtTime(next.start, true)}, ${compass(next.startAz)} → ${compass(next.endAz)}, max ${Math.round(next.max.alt)}°` : 'None in 48 h'],
      ['NORAD ID', `${o.norad}${sc?.OBJECT_ID ? ' · ' + sc.OBJECT_ID : ''}`], ['Did you know', pr?.fun]];
    vis = p ? visibilityNow({ kind: 'sat', mag: p.mag, alt: p.alt, lit: p.sunlit }, t) : null;
    if (tx.length) rows.push(['Radio', tx.slice(0, 6).map(x => `${x[2].toFixed(3)} MHz ${x[1]}${x[0] ? ' (' + x[0] + ')' : ''}`).join(' · ')]);
    model = modelFor(o, sc); wiki = pr?.name ? [pr.name] : { 25544: ['International Space Station'], 48274: ['Tiangong space station'], 20580: ['Hubble Space Telescope'] }[o.norad] || [];
    extra = `<a class="btn ghost sm" target="_blank" rel="noopener" href="https://network.satnogs.org/observations/?norad=${o.norad}&future=0&bad=0&unknown=0&failed=0">Recordings (SatNOGS) ↗</a><button class="btn ghost sm" id="onGlobe">See on 3D Earth</button>`;
  } else if (o.kind === 'comet') {
    const c = comets.find(x => x.des === o.des), st = cometState(c, t);
    type = 'Comet';
    rows = [['Altitude', `${st.alt.toFixed(1)}°`], ['Direction', compass(st.az)], ['Constellation', st.con], ['Brightness', `about mag ${st.mag.toFixed(1)}`], ['Distance from Earth', `${st.dist.toFixed(2)} AU`], ['Distance from Sun', `${st.r.toFixed(2)} AU`], ['From the Sun in the sky', `${st.elong.toFixed(0)}°`], ['Perihelion', perihelionNear(c, t).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })], ['Designation', c.full]];
    wiki = [c.full.replace(/ \(.*$/, ''), c.name];
  } else if (o.kind === 'const') {
    type = 'Constellation'; rows = [['Latin genitive', o.gen]]; wiki = [`${o.name} (constellation)`, o.name];
  } else if (o.kind === 'point') {
    type = 'Patch of sky'; rows = [['Altitude', `${o.alt.toFixed(1)}°`], ['Direction', `${compass(o.az)} (${o.az.toFixed(0)}°)`], ['RA / Dec', `${raStr(o.ra)} / ${decStr(o.dec)}`], ['Constellation', constellationOf(o.ra, o.dec)]];
    wiki = [`${constellationOf(o.ra, o.dec)} (constellation)`];
  }
  if (vis) rows.unshift(['Can I see it?', vis.text]);
  $('#objType').textContent = type; $('#objName').textContent = o.name;
  $('#objFacts').innerHTML = kv(rows);
  $('#objActions').innerHTML = `<button class="btn sm" id="showInSky">Show in sky</button>` + (o.kind === 'sat' ? `<a class="btn ghost sm" target="_blank" rel="noopener" href="https://www.n2yo.com/satellite/?s=${o.norad}">Live map ↗</a>` : '')
    + `<a class="btn ghost sm" target="_blank" rel="noopener" href="https://images.nasa.gov/search?q=${encodeURIComponent(o.kind === 'dso' && o.alt ? o.alt : o.name)}">NASA images ↗</a>` + extra;
  $('#showInSky').onclick = () => { closeInfo(); emit('goto', o); };
  if ($('#onGlobe')) $('#onGlobe').onclick = () => { closeInfo(); emit('globe-select', o); };
  // model / sprite
  const mc = $('#modelCanvas'), mi = $('#modelImg');
  if (model) {
    mw.hidden = false; mc.style.display = 'block'; mi.style.display = 'none';
    viewerMod ||= await import('./ar3d.js');
    viewerMod.showModel(mc, model, { phaseAngle: phase });
  } else if (sprite) { mw.hidden = false; mc.style.display = 'none'; mi.style.display = 'block'; mi.src = `textures/${sprite}.png`; viewerMod?.stopViewer(); }
  else { mw.hidden = true; viewerMod?.stopViewer(); }
  // wikipedia
  const w = $('#objWiki'); w.textContent = '';
  for (const title of wiki) {
    try {
      const r = await cachedJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, 60 * 24 * 7);
      if (r.type === 'disambiguation' || !r.extract) continue;
      w.innerHTML = `${esc(r.extract)} <a href="${esc(r.content_urls?.desktop?.page)}" target="_blank" rel="noopener">Wikipedia ↗</a>`; break;
    } catch { }
  }
}
// minimise the sheet to a slim bar (in place of the tab bar) so the globe and the satellite's journey stay in view
function setMinUi() { const m = $('#sheet').classList.contains('min'), b = $('#sheetMin'); if (b) { b.textContent = m ? '▴' : '▾'; b.setAttribute('aria-label', m ? 'Expand details' : 'Minimise details'); b.title = m ? 'Expand details' : 'Minimise to watch'; } }
export function toggleInfoMin() { $('#sheet').classList.toggle('min'); setMinUi(); }
export function closeInfo() { $('#sheet').hidden = true; $('#sheet').classList.remove('min'); setMinUi(); viewerMod?.stopViewer(); }
