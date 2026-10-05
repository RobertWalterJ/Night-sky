// Sky Sound visual: a live map of the sky that shows WHAT is making each sound, and where.
// Design rules this follows:
//  - Signal over noise: only the few satellites that are actually sounding are drawn big and named; the rest are faint specks.
//  - Plain names ("Rocket stage", "Space station"), never raw catalogue codes. Names are real words, 14px, with a halo so they read on any background.
//  - Identity is never colour alone: every voice has its own SHAPE and a word; rising/setting is an arrow glyph + the word, with a cool/warm shift as a bonus.
//  - Always-visible status: a "Now playing" row of chips that flash when their sound plays.
//  - Tap any dot to ask "what is that?" (generous hit area).
//  - Honest feedback: the drone glow follows the real audio level; ripples are delayed to match the phone's audio delay.
//  - Calm: solid recessive hairlines, reduced motion respected, short text with the long explanation tucked away.
// Looking straight up: centre = straight overhead, edge = the horizon, north at the top, east on the right
// (the same left and right the sound uses).
import { css, compass } from './util.js';

const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const D2R = Math.PI / 180;

// plain-language names, so nobody has to know what "SL-16 R/B" means
export function plainType(s) {
  const n = s.name || '';
  if (/R\/B|ROCKET|\bDEB\b|DEBRIS/i.test(n) || /^(SL-|CZ-|ARIANE|FALCON|ATLAS|DELTA)/i.test(n)) return /DEB/i.test(n) ? 'Debris' : 'Rocket stage';
  return ({ stations: 'Space station', visual: 'Bright satellite', gnss: 'Navigation satellite', geo: 'Stationary satellite', weather: 'Weather satellite', resource: 'Earth-watching satellite', science: 'Science satellite', amateur: 'Amateur radio satellite', cubesat: 'Tiny cubesat', oneweb: 'Internet satellite', starlink: 'Internet satellite' })[s.group] || 'Satellite';
}
export const cleanName = n => (n || '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s*R\/B\s*/i, '').trim() || n;
const shapeOf = group => group === 'stations' ? 'diamond' : (group === 'gnss' || group === 'geo') ? 'square' : 'circle';
const GLYPH = { diamond: '◆', circle: '●', square: '■' };
const VOICE = { stations: 'bell', gnss: 'low swell', geo: 'low swell' };
const voiceOf = g => VOICE[g] || 'pluck';

export function createViz(cv, els = {}) {
  const g = cv.getContext('2d');
  let W = 0, H = 0, DPR = 1, cx = 0, cy = 0, R = 0;
  const fx = [], trails = new Map(), marks = [], placed = [];
  const idKey = new Map();
  let sky = null, voiced = [], bed = { mw: 0, gcAlt: -90 }, getLevel = () => 0, picked = null, lastNow = '';
  const IDLE = 'Tap a shape on the map to see what it is.';

  new ResizeObserver(() => { const r = cv.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, 2); W = r.width; H = r.height; cv.width = W * DPR; cv.height = H * DPR; g.setTransform(DPR, 0, 0, DPR, 0, 0); cx = W / 2; cy = H / 2; R = Math.min(W, H) / 2 - 30; }).observe(cv);

  const theme = () => document.documentElement.dataset.theme;
  const mono = () => theme() === 'stargazer' || theme() === 'terminal';
  const C = () => ({
    bg: css('--sky-bg') || '#000', bg2: css('--sky-bg2') || '#000', text: css('--text') || '#fff', muted: css('--muted') || '#999', line: css('--line') || '#333', accent: css('--accent') || '#fff',
    sat: css('--sky-sat') || '#fff', planet: css('--sky-planet') || '#fc8', moon: css('--sky-moon') || '#ddd', mw: css('--sky-mw') || '#88a', star: css('--sky-star') || '#fff', font: css('--font') || 'system-ui',
    up: mono() ? (css('--accent') || '#fff') : '#6fb0ff', down: mono() ? (css('--muted') || '#999') : '#ff7a55',
  });
  const pos = (az, alt) => { const r = R * (90 - Math.max(alt, -8)) / 90, a = az * D2R; return [cx + Math.sin(a) * r, cy - Math.cos(a) * r]; };
  const colorCtx = document.createElement('canvas').getContext('2d');
  const alpha = (c, a) => { colorCtx.fillStyle = c; const v = colorCtx.fillStyle; if (v[0] === '#') { const n = parseInt(v.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; } return v.replace(/rgba?\(([^)]+)\)/, (m, p) => `rgba(${p.split(',').slice(0, 3).join(',')},${a})`); };

  function shape(kind, x, y, r, fill) {
    g.fillStyle = fill; g.beginPath();
    if (kind === 'diamond') { g.moveTo(x, y - r * 1.35); g.lineTo(x + r, y); g.lineTo(x, y + r * 1.35); g.lineTo(x - r, y); g.closePath(); }
    else if (kind === 'square') g.rect(x - r, y - r, r * 2, r * 2);
    else if (kind === 'spark') { g.moveTo(x, y - r); g.quadraticCurveTo(x, y, x + r, y); g.quadraticCurveTo(x, y, x, y + r); g.quadraticCurveTo(x, y, x - r, y); g.quadraticCurveTo(x, y, x, y - r); }
    else g.arc(x, y, r, 0, 7);
    g.fill();
  }

  // labels: 14px with a halo, placed so they never overlap each other
  function label(text, x, y, c, color, bold = true) {
    g.font = `${bold ? 600 : 400} 14px ${c.font}`; const w = g.measureText(text).width, h = 16;
    for (const [dx, dy, al] of [[10, 5, 'left'], [-10, 5, 'right'], [0, -12, 'center'], [0, 22, 'center'], [10, -10, 'left'], [-10, -10, 'right']]) {
      const lx = x + dx, rx = al === 'left' ? lx : al === 'right' ? lx - w : lx - w / 2, rect = [rx, y + dy - 12, w, h];
      if (rx < 2 || rx + w > W - 2 || y + dy < 12 || y + dy > H - 4) continue;
      if (placed.some(p => rect[0] < p[0] + p[2] && rect[0] + rect[2] > p[0] && rect[1] < p[1] + p[3] && rect[1] + rect[3] > p[1])) continue;
      placed.push(rect); g.textAlign = al; g.lineJoin = 'round'; g.lineWidth = 4; g.strokeStyle = alpha(c.bg, .9); g.strokeText(text, lx, y + dy); g.fillStyle = color; g.fillText(text, lx, y + dy); return true;
    }
    return false;
  }

  function draw(ms) {
    requestAnimationFrame(draw);
    if (W < 2 || !cv.offsetParent) return;
    const c = C(), lvl = getLevel(); placed.length = 0; marks.length = 0;
    g.clearRect(0, 0, W, H);
    const bgG = g.createRadialGradient(cx, cy, 0, cx, cy, R); bgG.addColorStop(0, c.bg2); bgG.addColorStop(1, c.bg); g.fillStyle = bgG; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
    if (sky) {
      // Milky Way drone: glow centred on the galactic centre. Strength = how much band is overhead; it pulses with the REAL audio level.
      const base = Math.max(bed.mw, .06), pulse = calm ? 1 : .8 + Math.min(.6, lvl * 2.2);
      const [gx, gy] = pos(sky.gc.az, Math.max(sky.gc.alt, 0)), gr = R * (.35 + .55 * base) * pulse;
      const gg = g.createRadialGradient(gx, gy, 0, gx, gy, gr); gg.addColorStop(0, alpha(c.mw, .55 * Math.min(1, base + .25))); gg.addColorStop(1, alpha(c.mw, 0));
      g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 7); g.clip(); g.fillStyle = gg; g.fillRect(0, 0, W, H); g.restore();
      if (sky.gc.alt > -3) marks.push({ x: gx, y: gy, r: 30, kind: 'gc' });
    }
    // frame: horizon + height rings as solid recessive hairlines, with small labels
    g.strokeStyle = c.line; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
    for (const a of [30, 60]) { g.beginPath(); g.arc(cx, cy, R * (90 - a) / 90, 0, 7); g.stroke(); }
    g.fillStyle = alpha(c.muted, .9); g.font = `12px ${c.font}`; g.textAlign = 'center';
    g.fillText('overhead', cx, cy + 16); g.fillText('60°', cx, cy - R / 3 + 12); g.fillText('30°', cx, cy - R * 2 / 3 + 12); g.fillText('horizon', cx + R * .72, cy + R * .72 + 14);
    g.fillStyle = c.text; g.font = `600 15px ${c.font}`; g.textBaseline = 'middle';
    for (const [l, a] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]]) { const [x, y] = pos(a, -8); g.fillText(l, x + (a === 90 ? 10 : a === 270 ? -10 : 0), y + (a === 0 ? -9 : a === 180 ? 9 : 0)); }
    g.textBaseline = 'alphabetic';
    if (!sky) { g.fillStyle = c.muted; g.font = `16px ${c.font}`; g.fillText('Press Listen to start', cx, cy - 28); return; }
    const voicedIds = new Set(voiced.map(v => v.id));
    // silent satellites: tiny, faint specks (kept so you can see how busy the sky is, but never competing)
    for (const s of sky.sats) { if (s.alt <= 0 || voicedIds.has(s.id)) continue; const [x, y] = pos(s.az, s.alt); g.fillStyle = alpha(c.sat, .28); g.fillRect(x - .8, y - .8, 1.6, 1.6); marks.push({ x, y, r: 12, kind: 'silent', s }); }
    // planets and Moon: steady discs
    for (const b of sky.bodies) {
      if (b.alt <= 0 || b.id === 'Sun') continue; const [x, y] = pos(b.az, b.alt), moon = b.id === 'Moon', r = moon ? 8 : b.id === 'Jupiter' || b.id === 'Venus' ? 6 : 4.5;
      g.fillStyle = alpha(moon ? c.moon : c.planet, .22); g.beginPath(); g.arc(x, y, r + 5, 0, 7); g.fill(); shape('circle', x, y, r, moon ? c.moon : c.planet);
      marks.push({ x, y, r: 28, kind: 'body', b }); label(b.id, x, y, c, c.text, false);
    }
    // trails and markers for the sounding satellites only
    for (const v of voiced) {
      const tr = trails.get(v.id) || []; g.lineWidth = 2;
      for (let i = 1; i < tr.length; i++) { const [x0, y0] = pos(tr[i - 1][0], tr[i - 1][1]), [x1, y1] = pos(tr[i][0], tr[i][1]); g.strokeStyle = alpha(c.sat, .1 + .55 * i / tr.length); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
    }
    for (const v of voiced) {
      const [x, y] = pos(v.az, v.alt), sh = shapeOf(v.group);
      g.fillStyle = alpha(c.bg, .85); g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); // surface ring so overlapping marks stay separate
      shape(sh, x, y, v.group === 'stations' ? 7 : 6, c.sat);
      marks.push({ x, y, r: 28, kind: 'sat', s: v });
      label(`${v.up ? '▲' : '▼'} ${v.group === 'stations' ? cleanName(v.name) : plainType(v)}`, x, y, c, v.up ? c.up : c.down);
    }
    // ripples from sounds (delayed to match the audio the phone is actually playing)
    for (let i = fx.length - 1; i >= 0; i--) {
      const e = fx[i], age = (ms - e.t0) / 1000, life = e.k === 'sweep' ? 1.2 : e.k === 'spark' ? .5 : 1.5;
      if (age > life) { fx.splice(i, 1); continue; }
      const k = Math.max(0, age) / life, [x, y] = pos(e.az, e.alt);
      if (e.k === 'spark') { shape('spark', x, y, 3 + (calm ? 0 : 5 * (1 - k)), alpha(c.star, 1 - k)); continue; }
      const col = e.k === 'sweep' ? (e.up ? c.up : c.down) : e.group === 'stations' ? c.accent : c.sat;
      const r = calm ? 14 : e.k === 'sweep' ? (e.up ? 6 + 44 * k : 50 - 44 * k) : 10 + (26 + 54 * e.vol) * k; // rising ripples spread out, setting ones fall in
      g.lineWidth = 2.5 * (1 - k) + .6; g.strokeStyle = alpha(col, (1 - k) * .9); g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke();
    }
    // picked object: bold ring
    if (picked) { const m = marks.find(m => m.kind === picked.kind && (m.kind === 'gc' || (m.s?.id ?? m.b?.id) === picked.id)); if (m) { g.strokeStyle = c.text; g.lineWidth = 2; g.beginPath(); g.arc(m.x, m.y, 16, 0, 7); g.stroke(); } }
    g.fillStyle = c.text; g.beginPath(); g.arc(cx, cy, 2.5, 0, 7); g.fill();
  }
  requestAnimationFrame(draw);

  // ----- tap a dot to ask "what is that?" -----
  function describe(m) {
    if (m.kind === 'gc') return `Galactic centre · the middle of our galaxy · ${sky.gc.alt > 0 ? `${Math.round(sky.gc.alt)}° up in the ${compass(sky.gc.az)} · plays as the deep swell` : 'below the horizon, so silent'}`;
    if (m.kind === 'body') return `${m.b.id} · ${Math.round(m.b.alt)}° up in the ${compass(m.b.az)} · a steady note, louder as it climbs`;
    const s = m.s, v = voiced.find(x => x.id === s.id);
    return `${s.group === 'stations' ? cleanName(s.name) : plainType(s)} (${cleanName(s.name)}) · ${Math.round(s.alt)}° up in the ${compass(s.az)} · ${v ? `playing as a ${voiceOf(s.group)}, ${v.up ? 'rising' : 'lowering'}` : 'not playing: too many are up to voice them all'}`;
  }
  cv.addEventListener('pointerup', e => {
    if (!sky) return;
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let best = null, bd = 1e9; for (const m of marks) { const d = Math.hypot(m.x - x, m.y - y); if (d < Math.max(m.r, 24) && d < bd) { bd = d; best = m; } }
    const id = best && (best.kind === 'gc' ? 'gc' : best.s?.id ?? best.b?.id);
    if (!best || (picked && picked.kind === best.kind && picked.id === id)) { picked = null; if (els.pick) els.pick.textContent = IDLE; return; }
    picked = { kind: best.kind, id }; if (els.pick) els.pick.textContent = describe(best);
  });

  // ----- "Now playing" chips: always say what is sounding, and flash when it does -----
  function nowRow() {
    if (!els.now) return;
    if (!sky) { els.now.innerHTML = ''; return; }
    const chips = [], mwp = Math.round(bed.mw * 100);
    chips.push(`<span class="np" data-k="drone"><i>≋</i><b>Drone</b> Milky Way ${mwp}%</span>`);
    if (sky.gc.alt > 0) chips.push(`<span class="np" data-k="gc"><i>◔</i><b>Deep swell</b> galactic centre ${Math.round(sky.gc.alt)}°</span>`);
    // group repeated types so the row stays short: "Rocket stage x4 ... 3 rising, 1 lowering"
    const groups = new Map(); idKey.clear();
    for (const v of voiced) { const key = v.group === 'stations' ? cleanName(v.name) : plainType(v); idKey.set(v.id, key); const gp = groups.get(key) || { n: 0, up: 0, dn: 0, shape: shapeOf(v.group), voice: voiceOf(v.group) }; gp.n++; v.up ? gp.up++ : gp.dn++; groups.set(key, gp); }
    for (const [key, gp] of groups) chips.push(`<span class="np" data-k="g:${key}"><i>${GLYPH[gp.shape]}</i><b>${key}${gp.n > 1 ? ' ×' + gp.n : ''}</b> ${gp.voice} ${gp.up ? `<em class="sh-up">▲${gp.up}</em>` : ''} ${gp.dn ? `<em class="sh-dn">▼${gp.dn}</em>` : ''}</span>`);
    const bs = sky.bodies.filter(b => b.alt > 0 && b.id !== 'Sun'); if (bs.length) chips.push(`<span class="np" data-k="body"><i>◉</i><b>Notes</b> ${bs.map(b => b.id).join(', ')}</span>`);
    chips.push(`<span class="np" data-k="spark"><i>✦</i><b>Glints</b> stars</span>`);
    const html = chips.join(''); if (html !== lastNow) { els.now.innerHTML = html; lastNow = html; }
  }
  function flash(key) { const el = key && els.now?.querySelector(`[data-k="${key}"]`); if (!el) return; el.classList.add('hit'); setTimeout(() => el.classList.remove('hit'), 450); }

  return {
    start() { },
    stop() { sky = null; voiced = []; fx.length = 0; trails.clear(); picked = null; lastNow = ''; getLevel = () => 0; if (els.now) els.now.innerHTML = ''; if (els.pick) els.pick.textContent = IDLE; },
    event(e, delaySec = 0) { setTimeout(() => { fx.push({ ...e, t0: performance.now() }); if (fx.length > 60) fx.shift(); flash(e.k === 'ping' ? 'g:' + idKey.get(e.id) : e.k === 'spark' ? 'spark' : ''); }, Math.max(0, delaySec) * 1000); },
    update(s, eng) {
      sky = s; voiced = eng.voiced || []; bed = { ...eng.bed }; getLevel = eng.level || (() => 0);
      const ids = new Set(voiced.map(v => v.id));
      for (const x of s.sats) { if (x.alt <= 0 || !ids.has(x.id)) { trails.delete(x.id); continue; } const tr = trails.get(x.id) || []; tr.push([x.az, x.alt]); if (tr.length > 30) tr.shift(); trails.set(x.id, tr); }
      nowRow();
    },
  };
}
