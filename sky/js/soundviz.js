// Sky Sound visual: a live map of the sky that shows WHAT is making each sound, and where.
// Looking straight up, north at the top, east on the right (the same left/right the sound uses).
//  - a ripple expands from an object each time it sounds; bigger and brighter = louder
//  - shape says the voice: diamond = station bell, circle = other satellite pluck, square = low swell,
//    big disc = planet, pale disc = Moon, four-point flash = a star shimmer
//  - a fading trail shows where a satellite has been
//  - rising objects get an up arrow and a cool shift; setting ones a down arrow and a warm shift
//    (in the red and green themes, where hue is not available, that becomes bright vs dim)
//  - the soft glow is the Milky Way drone; its centre sits on the galactic centre
import { $, D2R, css, compass } from './util.js';

export function createViz(cv, legendEl) {
  const g = cv.getContext('2d');
  let W = 0, H = 0, DPR = 1, cx = 0, cy = 0, R = 0;
  const fx = [], trails = new Map(), prevAlt = new Map();
  let sky = null, voiced = [], bed = { mw: 0, gcAlt: -90 }, running = false, raf = 0;

  new ResizeObserver(() => { const r = cv.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2); W = r.width; H = r.height; cv.width = W * DPR; cv.height = H * DPR; g.setTransform(DPR, 0, 0, DPR, 0, 0); cx = W / 2; cy = H / 2; R = Math.min(W, H) / 2 - 26; }).observe(cv);

  const theme = () => document.documentElement.dataset.theme;
  const mono = () => theme() === 'stargazer' || theme() === 'terminal';
  const C = () => ({
    bg: css('--sky-bg') || '#000', bg2: css('--sky-bg2') || '#000', text: css('--text') || '#fff', muted: css('--muted') || '#888', line: css('--line') || '#333', accent: css('--accent') || '#fff',
    sat: css('--sky-sat') || '#fff', planet: css('--sky-planet') || '#fc8', moon: css('--sky-moon') || '#ddd', cons: css('--sky-const') || '#8af', mw: css('--sky-mw') || '#88a', star: css('--sky-star') || '#fff', font: css('--font') || 'system-ui',
    up: mono() ? (css('--accent') || '#fff') : '#6fb0ff', down: mono() ? (css('--muted') || '#888') : '#ff7a55',
  });
  const pos = (az, alt) => { const r = R * (90 - Math.max(alt, -8)) / 90, a = az * D2R; return [cx + Math.sin(a) * r, cy - Math.cos(a) * r]; };
  const alpha = (hex, a) => { const c = document.createElement('canvas').getContext('2d'); c.fillStyle = hex; const v = c.fillStyle; if (v[0] === '#') { const n = parseInt(v.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; } return v.replace(/rgba?\(([^)]+)\)/, (m, p) => { const q = p.split(',').slice(0, 3); return `rgba(${q.join(',')},${a})`; }); };

  function shape(kind, x, y, r, fill) {
    g.fillStyle = fill; g.beginPath();
    if (kind === 'diamond') { g.moveTo(x, y - r * 1.3); g.lineTo(x + r, y); g.lineTo(x, y + r * 1.3); g.lineTo(x - r, y); g.closePath(); }
    else if (kind === 'square') { g.rect(x - r, y - r, r * 2, r * 2); }
    else if (kind === 'spark') { g.moveTo(x, y - r); g.quadraticCurveTo(x, y, x + r, y); g.quadraticCurveTo(x, y, x, y + r); g.quadraticCurveTo(x, y, x - r, y); g.quadraticCurveTo(x, y, x, y - r); }
    else g.arc(x, y, r, 0, 7);
    g.fill();
  }
  const kindOf = group => group === 'stations' ? 'diamond' : (group === 'gnss' || group === 'geo') ? 'square' : 'circle';
  const voiceName = group => group === 'stations' ? 'bell' : (group === 'gnss' || group === 'geo') ? 'low swell' : 'pluck';

  function draw(ms) {
    raf = requestAnimationFrame(draw);
    if (W < 2 || !cv.offsetParent) return;
    const c = C(), t = ms / 1000;
    g.clearRect(0, 0, W, H);
    const bgG = g.createRadialGradient(cx, cy, 0, cx, cy, R); bgG.addColorStop(0, c.bg2); bgG.addColorStop(1, c.bg); g.fillStyle = bgG; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
    // Milky Way drone: a breathing glow centred on the galactic centre, strength = how much band is overhead
    if (sky) {
      const lvl = Math.max(bed.mw, .06), breathe = .75 + .25 * Math.sin(t * .6);
      const [gx, gy] = pos(sky.gc.az, Math.max(sky.gc.alt, 0)), gr = R * (.35 + .55 * lvl) * breathe;
      const gg = g.createRadialGradient(gx, gy, 0, gx, gy, gr); gg.addColorStop(0, alpha(c.mw, .55 * Math.min(1, lvl + .25))); gg.addColorStop(1, alpha(c.mw, 0));
      g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 7); g.clip(); g.fillStyle = gg; g.fillRect(0, 0, W, H); g.restore();
      if (sky.gc.alt > -3) { g.fillStyle = alpha(c.mw, .9); g.font = `600 11px ${c.font}`; g.textAlign = 'center'; g.fillText('galactic centre', gx, gy + 4); }
    }
    // frame: horizon, height rings, compass
    g.strokeStyle = c.line; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
    g.lineWidth = 1; g.setLineDash([3, 5]); for (const a of [30, 60]) { g.beginPath(); g.arc(cx, cy, R * (90 - a) / 90, 0, 7); g.stroke(); } g.setLineDash([]);
    g.fillStyle = c.muted; g.font = `600 12px ${c.font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const [l, a] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]]) { const [x, y] = pos(a, -8); g.fillText(l, x + (a === 90 ? 8 : a === 270 ? -8 : 0), y + (a === 0 ? -8 : a === 180 ? 8 : 0)); }
    g.textBaseline = 'alphabetic';
    if (!sky) { g.fillStyle = c.muted; g.font = `15px ${c.font}`; g.fillText('Tap Listen to see the sound', cx, cy); return; }
    // bodies
    for (const b of sky.bodies) {
      if (b.alt <= 0 || b.id === 'Sun') continue; const [x, y] = pos(b.az, b.alt), moon = b.id === 'Moon', r = moon ? 8 : b.id === 'Jupiter' || b.id === 'Venus' ? 6 : 4;
      g.fillStyle = alpha(moon ? c.moon : c.planet, .25); g.beginPath(); g.arc(x, y, r + 5 + 1.5 * Math.sin(t * 1.3 + x), 0, 7); g.fill(); shape('circle', x, y, r, moon ? c.moon : c.planet);
      g.fillStyle = c.text; g.font = `12px ${c.font}`; g.textAlign = 'left'; g.fillText(b.id, x + r + 6, y + 4);
    }
    // satellite trails and markers (only the voiced few get a label)
    const voicedIds = new Set(voiced.map(v => v.id));
    for (const [id, tr] of trails) {
      if (tr.length < 2) continue; g.lineWidth = 1.5;
      for (let i = 1; i < tr.length; i++) { const [x0, y0] = pos(tr[i - 1][0], tr[i - 1][1]), [x1, y1] = pos(tr[i][0], tr[i][1]); g.strokeStyle = alpha(c.sat, .08 + .5 * i / tr.length); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
    }
    for (const s of sky.sats) {
      if (s.alt <= 0) continue; const [x, y] = pos(s.az, s.alt), v = voicedIds.has(s.id);
      shape(kindOf(s.group), x, y, v ? 5 : 2, alpha(c.sat, v ? 1 : .35));
      if (v) { const rising = (s.alt - (prevAlt.get(s.id) ?? s.alt)) >= 0; g.fillStyle = rising ? c.up : c.down; g.font = `600 12px ${c.font}`; g.textAlign = 'left'; g.fillText((rising ? '▲ ' : '▼ ') + s.name.split(' ')[0], x + 9, y + 4); }
    }
    // ripples from sounds
    for (let i = fx.length - 1; i >= 0; i--) {
      const e = fx[i], age = (ms - e.t0) / 1000, life = e.k === 'sweep' ? 1.2 : e.k === 'spark' ? .5 : 1.5;
      if (age > life) { fx.splice(i, 1); continue; } const k = age / life, [x, y] = pos(e.az, e.alt);
      if (e.k === 'spark') { shape('spark', x, y, 3 + 5 * (1 - k), alpha(c.star, 1 - k)); continue; }
      const col = e.k === 'sweep' ? (e.up ? c.up : c.down) : e.k === 'ping' && e.group === 'stations' ? c.accent : c.sat;
      const r = e.k === 'sweep' ? (e.up ? 6 + 44 * k : 50 - 44 * k) : 8 + (30 + 60 * e.vol) * k; // rising ripples spread out, setting ones fall in
      g.lineWidth = 2.5 * (1 - k) + .5; g.strokeStyle = alpha(col, (1 - k) * .9); g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke();
      if (e.k === 'ping' && k < .25) { g.fillStyle = alpha(col, (1 - k * 4) * .6); g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); }
    }
    // you are here
    g.fillStyle = c.text; g.beginPath(); g.arc(cx, cy, 2, 0, 7); g.fill();
  }

  function legend() {
    if (!legendEl) return;
    const rows = [];
    if (sky) {
      const mwp = Math.round(bed.mw * 100);
      rows.push(`<div class="sl-row"><span class="sl-glyph">≋</span><span><b>Drone:</b> the Milky Way band. ${mwp > 5 ? `About ${mwp}% of it is overhead, so the drone is ${mwp > 50 ? 'full and bright' : 'soft'}.` : 'Little of it is overhead, so the drone is quiet.'} The slow change you hear is the chord breathing, not a fault.</span></div>`);
      const ga = sky.gc.alt; rows.push(`<div class="sl-row"><span class="sl-glyph">◔</span><span><b>Deep swell:</b> the galactic centre, ${ga > 0 ? `${Math.round(ga)}° up in the ${compass(sky.gc.az)}` : 'below the horizon, so silent'}${ga > 0 ? (ga > (bed.prevGc ?? ga) ? ', rising' : ga < (bed.prevGc ?? ga) ? ', sinking' : '') : ''}. It gets louder as it climbs.</span></div>`);
      for (const v of voiced) rows.push(`<div class="sl-row"><span class="sl-glyph">${v.group === 'stations' ? '◆' : (v.group === 'gnss' || v.group === 'geo') ? '■' : '●'}</span><span><b>${v.name.split(' (')[0]}</b> (${voiceName(v.group)}) ${Math.round(v.alt)}° up in the ${compass(v.az)}, <span class="${v.up ? 'sh-up' : 'sh-dn'}">${v.up ? '▲ rising' : '▼ lowering'}</span></span></div>`);
      const bodies = sky.bodies.filter(b => b.alt > 0 && b.id !== 'Sun'); if (bodies.length) rows.push(`<div class="sl-row"><span class="sl-glyph">◉</span><span><b>Steady notes:</b> ${bodies.map(b => `${b.id} ${Math.round(b.alt)}° ${compass(b.az)}`).join(', ')}. One note each, louder as they climb.</span></div>`);
      rows.push(`<div class="sl-row"><span class="sl-glyph">✦</span><span><b>Shimmer:</b> little glints are stars. More glints means a darker sky.</span></div>`);
    }
    rows.push('<p class="small muted sl-key">Ripple = a sound just played. ▲ up arrow, cool shift = coming into view. ▼ down arrow, warm shift = leaving view (in red and green modes: bright vs dim). Left and right in the sound match left and right on this map.</p>');
    legendEl.innerHTML = rows.join('');
  }

  return {
    start() { if (!raf) raf = requestAnimationFrame(draw); running = true; },
    stop() { running = false; sky = null; voiced = []; fx.length = 0; trails.clear(); prevAlt.clear(); legend(); }, // keeps drawing the empty map so it never looks broken
    event(e) { fx.push({ ...e, t0: performance.now() }); if (fx.length > 60) fx.shift(); },
    update(s, eng) {
      sky = s; voiced = eng.voiced || []; bed = { ...eng.bed, prevGc: bed.gcAlt };
      for (const x of s.sats) { if (x.alt <= 0) { trails.delete(x.id); continue; } const tr = trails.get(x.id) || []; tr.push([x.az, x.alt]); if (tr.length > 30) tr.shift(); trails.set(x.id, tr); }
      legend();
      for (const x of s.sats) prevAlt.set(x.id, x.alt);
    },
  };
}
