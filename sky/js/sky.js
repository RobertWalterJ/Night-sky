// Sky renderer (v2). One engine drives three views:
//   - the free Sky chart (drag, pinch, phone pointing, camera, 3D models)
//   - the Overhead dome (zenith-centred all-sky view)
//   - the mini dome in the Tonight hero
// Per-cell "sky shader" paints the Milky Way, twilight glow and the below-horizon time bands.
import { state, store, now, emit, on, D2R, R2D, clamp, css, compass, toast, fmtTime } from './util.js';
import { cat, eqjToEnuFn, enuToEqjFn, solarSystem, enuFromAltAz, altAzFromEnu, enuToRaDec, constellationOf, starInfo, dsoSprite, nelm, mwStrength, mw, loadMilkyWay, loadDeep, hoursToRise, bvColor } from './astro.js';
import { visibleSats, satPosition } from './sats.js';
import { comets, cometState, loadComets } from './comets.js';
import { radecVec } from './astro.js';
loadComets();

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const sprites = {};
for (const n of ['galaxy', 'nebula', 'cluster']) { const im = new Image(); im.src = `textures/${n}.png`; sprites[n] = im; }

// ---------- shared, time-keyed caches ----------
let ver = 0; // bumps on location/time-jump
const shared = { sol: { k: '', list: [] }, sats: { k: '', at: 0, list: [] }, lim: { k: '', v: 6 } };
function solAt(t) { const k = ver + ':' + Math.round(t / 10000); if (shared.sol.k !== k) shared.sol = { k, list: solarSystem(t) }; return shared.sol.list; }
function satsAt(t) { const k = ver + ':' + Math.round(t / 1000); if (shared.sats.k !== k && performance.now() - shared.sats.at > 400) shared.sats = { k, at: performance.now(), list: visibleSats(t) }; return shared.sats.list; }
function limAt(t) { const k = ver + ':' + state.bortle + ':' + Math.round(t / 60000); if (shared.lim.k !== k) shared.lim = { k, v: nelm(t) }; return shared.lim.v; }
on('location', () => ver++); on('time', () => ver++);

// ---------- shared device orientation ----------
const orient = { X: null, Y: null, Z: null, listeners: 0, iosOffset: null };
function onOrient(e) {
  if (e.alpha == null) return;
  let alpha = e.alpha;
  if (e.webkitCompassHeading != null) {
    const off = ((360 - e.webkitCompassHeading) - e.alpha + 720) % 360;
    if (orient.iosOffset == null) orient.iosOffset = off;
    else if (Math.abs(e.beta) < 55) { const d = ((off - orient.iosOffset + 540) % 360) - 180; orient.iosOffset = (orient.iosOffset + d * .05 + 360) % 360; }
    alpha = e.alpha + orient.iosOffset;
  }
  const a = alpha * D2R, b = e.beta * D2R, g = e.gamma * D2R;
  const cA = Math.cos(a), sA = Math.sin(a), cB = Math.cos(b), sB = Math.sin(b), cG = Math.cos(g), sG = Math.sin(g);
  const dl = state.calOffset * D2R, rot = v => [v[0] * Math.cos(dl) + v[1] * Math.sin(dl), -v[0] * Math.sin(dl) + v[1] * Math.cos(dl), v[2]];
  orient.X = rot([cA * cG - sA * sB * sG, sA * cG + cA * sB * sG, -cB * sG]);
  orient.Y = rot([-sA * cB, cA * cB, sB]);
  orient.Z = rot([cA * sG + sA * sB * cG, sA * sG - cA * sB * cG, cB * cG]);
}
const evName = () => 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
async function startOrientation() {
  try { if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) { if (await DeviceOrientationEvent.requestPermission() !== 'granted') throw 0; } }
  catch { toast('Motion access was not granted'); return false; }
  if (!orient.listeners++) window.addEventListener(evName(), onOrient);
  return true;
}
function stopOrientation() { if (orient.listeners > 0 && !--orient.listeners) window.removeEventListener(evName(), onOrient); }

// ---------- colours ----------
let colors = null;
on('theme', () => colors = null);
function parseColor(c) { const t = document.createElement('canvas').getContext('2d'); t.fillStyle = c; t.fillRect(0, 0, 1, 1); return [...t.getImageData(0, 0, 1, 1).data]; }
function C() {
  if (colors) return colors;
  const g = n => css(n);
  colors = { bg: g('--sky-bg'), bg2: g('--sky-bg2'), star: g('--sky-star'), line: g('--sky-line'), label: g('--sky-label'), cons: g('--sky-const'), grid: g('--sky-grid'), ground: g('--sky-ground'), horizon: g('--sky-horizon'), planet: g('--sky-planet'), moon: g('--sky-moon'), sat: g('--sky-sat'), dso: g('--sky-dso'), sel: g('--sky-sel'), iso: g('--sky-iso') || g('--sky-horizon'), font: g('--font'), theme: document.documentElement.dataset.theme };
  colors.groundRGBA = parseColor(colors.ground); colors.mwRGB = parseColor(g('--sky-mw') || colors.star); colors.twRGB = parseColor(g('--sky-twilight') || colors.planet);
  colors.belowRGB = parseColor(g('--sky-below') || colors.ground); colors.neverRGB = parseColor(g('--sky-never') || colors.ground);
  colors.light = colors.theme === 'airy';
  return colors;
}

// ======================================================================
export function createSky(cv, cfg = {}) {
  const dome = cfg.mode === 'dome', mini = !!cfg.mini;
  const ctx = cv.getContext('2d');
  const V = { az: 180, alt: 40, fov: 90, sensor: false, camera: false, aligning: false, heading: 0, follow: false };
  let B = { f: [0, 1, 0], r: [1, 0, 0], u: [0, 0, 1] };
  let W = 0, H = 0, DPR = 1, cx = 0, cy = 0, F = 1, R = 0, rect = true, active = false, dirty = true;
  let hits = [], selected = null, track = null, sm = null, lastTick = 0, arMod = null, arLoading = false;
  const off = { sky: document.createElement('canvas'), gnd: document.createElement('canvas') };

  new ResizeObserver(() => { const r = cv.getBoundingClientRect(); DPR = Math.min(devicePixelRatio || 1, mini ? 1.5 : 2); W = r.width; H = r.height; cv.width = W * DPR; cv.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); arMod?.resize(W, H, DPR); dirty = true; }).observe(cv);
  on('theme', () => dirty = true); on('time', () => dirty = true); on('location', () => dirty = true); on('layers', () => dirty = true);

  // ---------- projection ----------
  function setup() {
    cx = W / 2; cy = H / 2;
    if (dome) {
      R = Math.min(W, H) / 2 - (mini ? 2 : 22); rect = false; F = R / 2; // stereographic: horizon at radius R
      let h = V.heading;
      if (V.follow && orient.Y) h = Math.atan2(orient.Y[0], orient.Y[1]) * R2D;
      const u = [Math.sin(h * D2R), Math.cos(h * D2R), 0], f = [0, 0, 1];
      B = { f, u, r: cross(f, u) };
      return;
    }
    const S = Math.min(W, H) / 2;
    rect = V.fov <= 110;
    F = rect ? S / Math.tan(V.fov * D2R / 2) : S / (2 * Math.tan(V.fov * D2R / 4));
    if (V.sensor && orient.Z) {
      const th = (screen.orientation?.angle ?? window.orientation ?? 0) * D2R, X = orient.X, Y = orient.Y;
      const right = [0, 1, 2].map(i => Math.cos(th) * X[i] - Math.sin(th) * Y[i]);
      const upv = [0, 1, 2].map(i => Math.sin(th) * X[i] + Math.cos(th) * Y[i]);
      const fwd = orient.Z.map(c => -c);
      if (!sm) sm = { f: fwd, u: upv };
      sm.f = norm(sm.f.map((c, i) => c + (fwd[i] - c) * .25)); sm.u = norm(sm.u.map((c, i) => c + (upv[i] - c) * .25));
      const r = norm(cross(sm.f, sm.u)); B = { f: sm.f, r, u: cross(r, sm.f) };
    } else if (!V.sensor) {
      B = { f: enuFromAltAz(V.alt, V.az), r: [Math.cos(V.az * D2R), -Math.sin(V.az * D2R), 0], u: null }; B.u = cross(B.r, B.f);
    }
  }
  function project(v) {
    const x = dot(v, B.r), y = dot(v, B.u), z = dot(v, B.f);
    if (rect) { if (z < 0.02) return null; return [cx + F * x / z, cy - F * y / z]; }
    if (z < (dome ? -0.02 : -0.8)) return null; const k = 2 / (1 + z); return [cx + F * x * k, cy - F * y * k];
  }
  function unproject(sx, sy, out) {
    let x = (sx - cx) / F, y = -(sy - cy) / F, z = 1;
    if (!rect) { const p2 = x * x + y * y; z = (4 - p2) / (4 + p2); x *= (1 + z) / 2; y *= (1 + z) / 2; }
    const a = B.r[0] * x + B.u[0] * y + B.f[0] * z, b = B.r[1] * x + B.u[1] * y + B.f[1] * z, c = B.r[2] * x + B.u[2] * y + B.f[2] * z, l = Math.hypot(a, b, c);
    out[0] = a / l; out[1] = b / l; out[2] = c / l; return out;
  }
  const onScreen = (p, m = 40) => p && p[0] > -m && p[0] < W + m && p[1] > -m && p[1] < H + m && (!dome || Math.hypot(p[0] - cx, p[1] - cy) < R + 2);

  // ---------- sky shader ----------
  function shade(col, t, L, lim, sunV) {
    const step = mini ? 4 : dome ? 4 : V.sensor ? 7 : 5;
    const gw = Math.ceil(W / step), gh = Math.ceil(H / step);
    for (const c of [off.sky, off.gnd]) if (c.width !== gw || c.height !== gh) { c.width = gw; c.height = gh; }
    const sctx = off.sky.getContext('2d'), gctx = off.gnd.getContext('2d');
    const si = sctx.createImageData(gw, gh), gi = gctx.createImageData(gw, gh), sd = si.data, gd = gi.data;
    const toEq = enuToEqjFn(t), v = [0, 0, 0], q = [0, 0, 0];
    const mwOn = L.milkyway && mw.data, mwS = L.realistic ? mwStrength(lim) : .55;
    const mwK = (col.light ? .55 : 1) * mwS * (V.camera ? .5 : 1);
    const sunAlt = Math.asin(sunV[2]) * R2D, twF = clamp((sunAlt + 18) / 18, 0, 1) * (col.light ? .25 : .55);
    const showBelow = !dome && L.below && !V.camera, lat = state.lat * D2R;
    const [mr, mg, mb] = col.mwRGB, [tr, tg, tb] = col.twRGB, [gr, gg, gb, ga] = col.groundRGBA, [br, bgc, bb] = col.belowRGB, [nr, ng, nb] = col.neverRGB;
    const sunH = norm([sunV[0], sunV[1], 0]);
    let anyG = false;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const px = x * step + step / 2, py = y * step + step / 2;
      if (dome && Math.hypot(px - cx, py - cy) > R) continue;
      unproject(px, py, v);
      const i = (y * gw + x) * 4, up = v[2];
      // Milky Way + twilight (sky layer, under the stars)
      let a = 0, r = 0, g = 0, b = 0;
      if (mwOn && (up > 0 || showBelow)) {
        toEq(v[0], v[1], v[2], q);
        let ra = Math.atan2(q[1], q[0]); if (ra < 0) ra += 2 * Math.PI;
        const dec = Math.asin(clamp(q[2], -1, 1));
        const tx = Math.min(mw.w - 1, (ra / (2 * Math.PI) * mw.w) | 0), ty = Math.min(mw.h - 1, ((Math.PI / 2 - dec) / Math.PI * mw.h) | 0);
        let m = mw.data[ty * mw.w + tx] / 255 * mwK;
        if (up > 0) m *= clamp(up * 6, .25, 1); else m *= .35; // horizon extinction
        a = m; r = mr; g = mg; b = mb;
      }
      if (twF > 0 && up > -0.05) {
        const tw = twF * (.3 + .7 * Math.max(0, v[0] * sunH[0] + v[1] * sunH[1])) * Math.exp(-Math.max(up, 0) * 5);
        if (tw > 0.01) { const s = a + tw; r = (r * a + tr * tw) / s; g = (g * a + tg * tw) / s; b = (b * a + tb * tw) / s; a = Math.min(1, s); }
      }
      if (a > 0.004) { sd[i] = r; sd[i + 1] = g; sd[i + 2] = b; sd[i + 3] = a * 255; }
      // ground / below-horizon time bands (drawn over the stars)
      if (up < 0 && L.ground) {
        anyG = true;
        if (showBelow) {
          const h = hoursToRise(v[0], v[1], v[2], lat);
          if (h === Infinity) { gd[i] = nr; gd[i + 1] = ng; gd[i + 2] = nb; gd[i + 3] = (((x + y) >> 1) % 3 === 0 ? .78 : .62) * 255; }
          else {
            const band = Math.floor(h), soon = clamp(1 - h / 12, 0, 1);
            const k = soon * soon * .55;
            gd[i] = gr + (br - gr) * k; gd[i + 1] = gg + (bgc - gg) * k; gd[i + 2] = gb + (bb - gb) * k;
            gd[i + 3] = (band % 2 ? .56 : .66) * 255 * (col.light ? .9 : 1);
          }
        } else { gd[i] = gr; gd[i + 1] = gg; gd[i + 2] = gb; gd[i + 3] = V.camera ? ga * .45 : ga; }
      }
    }
    sctx.putImageData(si, 0, 0); gctx.putImageData(gi, 0, 0);
    return anyG;
  }

  // ---------- draw ----------
  function draw() {
    if (W < 2 || H < 2) return; // canvas is hidden or not laid out yet
    const col = C(), t = now(), L = { ...state.layers };
    if (dome) { L.below = false; L.ground = false; L.grid = false; L.dsos = !mini && L.dsos; }
    setup();
    hits = [];
    const sol = solAt(t), sunV = sol[0].v, lim = limAt(t), realistic = L.realistic;
    const font = (px, w = 400) => `${w} ${col.theme === 'terminal' ? px * 1.25 : px}px ${col.font}`;
    const toEnu = eqjToEnuFn(t), tmp = [0, 0, 0];
    const showBelow = !dome && L.below && !V.camera;
    const vis = v => !L.ground || v[2] > -0.005 || showBelow;
    const dim = v => v[2] < -0.005 ? .28 : 1;
    // background
    ctx.clearRect(0, 0, W, H);
    if (dome) { ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.clip(); }
    if (!V.camera) {
      const g = dome ? ctx.createRadialGradient(cx, cy, 0, cx, cy, R) : ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, col.bg); g.addColorStop(1, col.bg2); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    const anyG = shade(col, t, L, lim, sunV);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(off.sky, 0, 0, W, H);
    if (L.grid) drawGrid(col);
    isoCache = null; if (showBelow && L.isochrones) drawIsochroneLines(col, t);

    // constellations
    if (cat.ready && (L.constLines || L.constNames)) {
      ctx.strokeStyle = col.line; ctx.lineWidth = mini ? .7 : 1.1;
      ctx.beginPath();
      if (L.constLines) for (const c of Object.values(cat.cons)) for (const seg of c.lv) {
        let prev = null;
        for (const p of seg) {
          const e = toEnu(p[0], p[1], p[2], [0, 0, 0]);
          const s = vis(e) ? project(e) : null;
          if (s && prev && Math.hypot(s[0] - prev[0], s[1] - prev[1]) < Math.max(W, H) * .6) { ctx.moveTo(prev[0], prev[1]); ctx.lineTo(s[0], s[1]); }
          prev = s;
        }
      }
      ctx.stroke();
      if (L.constNames && !mini && (dome ? R > 150 : V.fov > 12)) {
        ctx.fillStyle = col.cons; ctx.font = font(dome ? (R < 260 ? 8.5 : 10) : 11, 500); ctx.textAlign = 'center';
        for (const c of Object.values(cat.cons)) {
          const e = toEnu(...c.v); if (!vis(e)) continue;
          const s = project(e); if (!onScreen(s, 0)) continue;
          ctx.globalAlpha = .75 * dim(e);
          ctx.fillText(col.light ? c.n.toUpperCase() : c.n, s[0], s[1]);
          hits.push({ x: s[0], y: s[1], r: 14, pri: 1, obj: { kind: 'const', id: 'con' + c.n, name: c.n, gen: c.g, v: e } });
        }
        ctx.globalAlpha = 1;
      }
    }

    // deep-sky objects
    if (cat.ready && L.dsos && (dome || V.fov < 140)) {
      ctx.font = font(10); ctx.textAlign = 'left';
      for (const d of cat.dsos) {
        if (d.m > (dome ? 6 : V.fov > 60 ? 7 : 10)) continue;
        const e = toEnu(...d.v, [0, 0, 0]); if (!vis(e)) continue;
        const s = project(e); if (!onScreen(s)) continue;
        const sizeDeg = (parseFloat(d.dim) || 5) / 60, px = Math.max(!dome && V.fov < 30 ? 16 : 5, sizeDeg * F * D2R * (rect ? 1 : 2));
        const spr = sprites[dsoSprite(d.tc)];
        ctx.globalAlpha = dim(e);
        if (!dome && V.fov < 35 && spr?.complete && !col.light) { ctx.globalAlpha *= .85; ctx.drawImage(spr, s[0] - px, s[1] - px, px * 2, px * 2); }
        else {
          ctx.strokeStyle = col.dso; ctx.lineWidth = 1; ctx.beginPath();
          const r = Math.min(px, 14);
          if (/galaxy/i.test(d.t)) ctx.ellipse(s[0], s[1], r, r * .5, -.5, 0, 7);
          else if (/cluster|aster/i.test(d.t)) { ctx.setLineDash([2, 2]); ctx.arc(s[0], s[1], r, 0, 7); }
          else ctx.rect(s[0] - r * .8, s[1] - r * .8, r * 1.6, r * 1.6);
          ctx.stroke(); ctx.setLineDash([]);
        }
        if (!dome && V.fov < 70) { ctx.fillStyle = col.dso; ctx.fillText(V.fov < 25 && d.alt ? `${d.id} ${d.alt}` : d.id, s[0] + 9, s[1] - 7); }
        ctx.globalAlpha = 1;
        hits.push({ x: s[0], y: s[1], r: Math.max(12, Math.min(px, 30)), pri: 2, obj: { kind: 'dso', ...d, name: d.alt || d.id, v: e } });
      }
    }

    // stars
    const zoom = dome ? (mini ? .62 : .85) : clamp(Math.sqrt(70 / V.fov), .8, 2.6);
    const optics = dome ? 0 : Math.max(0, Math.log2(60 / V.fov)) * 1.2; // zooming in acts like binoculars
    const visLim = realistic ? lim + optics : 6.6 + optics;
    if (cat.ready) {
      const nameLim = dome ? (mini ? -9 : R < 260 ? .6 : 1.4) : V.fov > 100 ? 1.6 : V.fov > 50 ? 2.6 : V.fov > 20 ? 4 : 6.5;
      const truecol = col.theme === 'cosmos';
      const labels = [];
      ctx.fillStyle = col.star;
      for (let i = 0; i < cat.n; i++) {
        const m = cat.mag[i];
        const faint = m > visLim;
        if (faint && (realistic && m > visLim + 1.2 || dome)) continue;
        const e = toEnu(cat.vec[i * 3], cat.vec[i * 3 + 1], cat.vec[i * 3 + 2], tmp);
        if (!vis(e)) continue;
        const s = project(e); if (!onScreen(s, 4)) continue;
        const r = Math.max(.5, (6.4 - m) * .42 * zoom);
        let al = clamp(1.15 - m / 8, .35, 1) * dim(e);
        if (faint) al *= .16;
        ctx.globalAlpha = al;
        if (truecol) ctx.fillStyle = bvColor(cat.bv(i));
        if (r < 1.3) ctx.fillRect(s[0] - r, s[1] - r, r * 2, r * 2);
        else {
          if (!col.light && m < 1.6 && !faint) { const gl = ctx.createRadialGradient(s[0], s[1], 0, s[0], s[1], r * 4); gl.addColorStop(0, truecol ? bvColor(cat.bv(i)) : col.star); gl.addColorStop(1, 'transparent'); const fs = ctx.fillStyle; ctx.fillStyle = gl; ctx.globalAlpha = al * .35; ctx.fillRect(s[0] - r * 4, s[1] - r * 4, r * 8, r * 8); ctx.fillStyle = fs; ctx.globalAlpha = al; }
          ctx.beginPath(); ctx.arc(s[0], s[1], r, 0, 7); ctx.fill();
        }
        if (!faint && (m < 4.5 || V.fov < 30) && !mini) hits.push({ x: s[0], y: s[1], r: Math.max(10, r + 6), pri: 3 - m / 10, star: i });
        if (L.starNames && m < nameLim && !faint) { const nm = cat.names[cat.id[i]]; if (nm && (nm[0] || (V.fov < 20 && nm[1]))) labels.push([nm[0] || nm[1], s[0] + r + 3, s[1] + 3, dim(e)]); }
      }
      // deep catalogue (mag 6 to 8)
      const deepWanted = !mini && (visLim > 6.1);
      if (deepWanted && !cat.deep) loadDeep().then(() => dirty = true);
      if (deepWanted && cat.deep) {
        const D = cat.deep; ctx.fillStyle = col.star;
        for (let i = 0; i < D.n; i++) {
          const m = D.mag[i]; if (m > visLim) break; // sorted by magnitude
          const e = toEnu(D.vec[i * 3], D.vec[i * 3 + 1], D.vec[i * 3 + 2], tmp);
          if (!vis(e)) continue;
          const s = project(e); if (!onScreen(s, 2)) continue;
          ctx.globalAlpha = clamp((visLim - m) / 1.5, .15, .7) * dim(e);
          const r = Math.max(.45, (6.4 - m) * .42 * zoom + .35);
          ctx.fillRect(s[0] - r, s[1] - r, r * 2, r * 2);
        }
      }
      ctx.globalAlpha = 1; ctx.fillStyle = col.label; ctx.font = font(dome ? 10 : 11); ctx.textAlign = 'left';
      for (const [tx, x, y, d] of labels) { ctx.globalAlpha = d * .9; ctx.fillText(tx, x, y); }
      ctx.globalAlpha = 1;
    }

    // solar system
    const use3d = !dome && L.models3d && rect && !!window.WebGLRenderingContext;
    const models = [];
    for (const b of sol) {
      if (!vis(b.v)) continue;
      const s = project(b.v); if (!onScreen(s)) continue;
      const truePx = (b.kind === 'moon' || b.kind === 'sun' ? .52 : 0) * D2R * F / 2 * (rect ? 1 : 2);
      let r = b.kind === 'moon' || b.kind === 'sun' ? Math.max(mini ? 5 : dome ? 7 : 9, truePx) : Math.max(mini ? 2 : 3, (2 - (b.mag ?? 2)) * (mini ? .8 : 1.4) + (mini ? 2.5 : 4));
      ctx.globalAlpha = dim(b.v);
      if (use3d && arMod?.has(b.id.toLowerCase()) && b.v[2] > -0.005) models.push({ ...b, sx: s[0], sy: s[1], px: b.kind === 'planet' ? Math.max(r * 2.2, 14) : Math.max(r * 2.4, truePx * 2) });
      else drawBody2D(b, s, r, col, sunV);
      if (!mini || b.kind !== 'planet' || b.mag < 0) {
        ctx.fillStyle = b.kind === 'moon' ? col.moon : col.planet; ctx.font = font(mini ? 9 : dome ? 11 : 12, 600); ctx.textAlign = 'left';
        ctx.fillText(b.name, s[0] + r + 5, s[1] - r * .4);
      }
      ctx.globalAlpha = 1;
      hits.push({ x: s[0], y: s[1], r: Math.max(r + 8, 18), pri: 5, obj: b });
    }

    // comets (bright enough for binoculars or a small telescope)
    if (!mini) for (const c of comets) {
      const st = cometState(c, t); if (st.mag > (dome ? 8 : 11) || !vis(st.v)) continue;
      const s = project(st.v); if (!onScreen(s)) continue;
      const sp = project(sunV), ang = sp ? Math.atan2(s[1] - sp[1], s[0] - sp[0]) : Math.atan2(-dot(sunV, B.u) * -1, -dot(sunV, B.r));
      const len = clamp((9 - st.mag) * 5, 10, 60);
      const g = ctx.createLinearGradient(s[0], s[1], s[0] + Math.cos(ang) * len, s[1] + Math.sin(ang) * len);
      g.addColorStop(0, col.planet); g.addColorStop(1, 'transparent');
      ctx.globalAlpha = dim(st.v); ctx.strokeStyle = g; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.lineTo(s[0] + Math.cos(ang) * len, s[1] + Math.sin(ang) * len); ctx.stroke();
      ctx.fillStyle = col.planet; ctx.beginPath(); ctx.arc(s[0], s[1], 3, 0, 7); ctx.fill();
      ctx.font = font(11, 600); ctx.textAlign = 'left'; ctx.fillText(c.name, s[0] + 7, s[1] - 5); ctx.globalAlpha = 1;
      hits.push({ x: s[0], y: s[1], r: 16, pri: 5, obj: { kind: 'comet', id: 'comet' + c.des, des: c.des, name: c.name, v: st.v } });
    }

    // satellites
    if (L.sats) {
      ctx.font = font(10, 500); ctx.textAlign = 'left';
      for (const s_ of satsAt(t)) {
        if (s_.v[2] < 0) continue;
        const p = project(s_.v); if (!onScreen(p)) continue;
        const named = s_.norad === 25544 || s_.norad === 48274 || s_.norad === 20580;
        if (mini && !s_.lit) continue;
        ctx.fillStyle = col.sat; ctx.globalAlpha = s_.lit ? 1 : .35;
        ctx.beginPath(); ctx.arc(p[0], p[1], named ? 3.6 : s_.group === 'starlink' ? 1.5 : 2.2, 0, 7); ctx.fill();
        if (s_.lit && !mini) { ctx.globalAlpha = .25; ctx.beginPath(); ctx.arc(p[0], p[1], named ? 8 : 5, 0, 7); ctx.fill(); }
        ctx.globalAlpha = 1;
        if ((named || (!dome && V.fov < 25)) && !mini) ctx.fillText(s_.name, p[0] + 6, p[1] + 3);
        hits.push({ x: p[0], y: p[1], r: 14, pri: named ? 6 : 4, obj: s_ });
        if (use3d && named && s_.norad !== 48274 && arMod?.has(s_.model)) models.push({ ...s_, sx: p[0], sy: p[1], px: 26 });
      }
    }

    drawSelected(col, font, t);
    updateFind(t);
    updateAim(col, font, t);
    if (anyG) ctx.drawImage(off.gnd, 0, 0, W, H);
    if (!dome && L.ground) drawHorizon(col, font);
    if (showBelow && L.isochrones) drawIsochroneLabels(col, font);
    if (!dome) drawCompass(col, font); else drawDomeFrame(col, font);
    if (!dome && (V.sensor || V.aligning)) drawCrosshair(col);
    if (dome) ctx.restore(), drawDomeLabels(col, font);

    if (cfg.ar) {
      if (use3d && !arMod && !arLoading) { arLoading = true; import('./ar3d.js').then(m => { arMod = m; m.init(cfg.ar, W, H, DPR); setTimeout(() => dirty = true, 1500); }); }
      if (arMod) { if (use3d && models.length) arMod.render(models, B, V.fov, W, H, sunV, project); else arMod.clear(); }
    }
    if (cfg.hud) {
      const { az, alt } = altAzFromEnu(B.f);
      cfg.hud.dir.textContent = `${compass(az)} ${Math.round(az)}° · alt ${Math.round(alt)}° · ${Math.round(V.fov)}°`;
      cfg.hud.time.textContent = (state.offsetMin ? '⟲ ' : '● ') + fmtTime(t, !!state.offsetMin);
    }
    cfg.onDraw?.({ lim, t });
  }

  function drawBody2D(b, s, r, col, sunV) {
    if (b.kind === 'sun') {
      const g = ctx.createRadialGradient(s[0], s[1], r * .3, s[0], s[1], r * 3);
      g.addColorStop(0, col.planet); g.addColorStop(1, 'transparent');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s[0], s[1], r * 3, 0, 7); ctx.fill();
    }
    ctx.fillStyle = b.kind === 'moon' ? col.moon : col.planet;
    if (b.kind === 'moon') {
      const sp = project(sunV) || [s[0] + dot(sunV, B.r) * 1e3, s[1] - dot(sunV, B.u) * 1e3];
      const ang = Math.atan2(sp[1] - s[1], sp[0] - s[0]), f = b.illum ?? .5;
      ctx.save(); ctx.translate(s[0], s[1]); ctx.rotate(ang);
      const ga = ctx.globalAlpha; ctx.globalAlpha = ga * .18; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.globalAlpha = ga;
      ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
      ctx.ellipse(0, 0, Math.abs(1 - 2 * f) * r, r, 0, Math.PI / 2, -Math.PI / 2, f > .5);
      ctx.fill(); ctx.restore();
    } else { ctx.beginPath(); ctx.arc(s[0], s[1], r, 0, 7); ctx.fill(); }
  }
  function polyline(pts) { ctx.beginPath(); let prev = null; for (const v of pts) { const s = project(v); if (s && prev && Math.hypot(s[0] - prev[0], s[1] - prev[1]) < W) ctx.lineTo(s[0], s[1]); else if (s) ctx.moveTo(s[0], s[1]); prev = s; } ctx.stroke(); }
  function drawGrid(col) {
    ctx.strokeStyle = col.grid; ctx.lineWidth = 1;
    for (let alt = 0; alt < 90; alt += 15) { const p = []; for (let az = 0; az <= 360; az += 3) p.push(enuFromAltAz(alt, az)); polyline(p); }
    for (let az = 0; az < 360; az += 30) { const p = []; for (let alt = 0; alt <= 90; alt += 3) p.push(enuFromAltAz(alt, az)); polyline(p); }
  }
  function drawHorizon(col) {
    ctx.strokeStyle = col.horizon; ctx.lineWidth = 1.6; const p = []; for (let az = 0; az <= 360; az++) p.push(enuFromAltAz(0, az)); polyline(p);
  }
  // Where the horizon will be in +1h, +2h ... drawn on the current sky. Below the horizon these
  // lines mark what will have risen by then; above it (in the west) what will have set.
  let isoCache = null;
  function drawIsochroneLines(col, t) {
    const toEnu = eqjToEnuFn(t); isoCache = [];
    for (let k = 1; k <= 6; k++) {
      const tf = new Date(+t + k * 3600e3), toEq = enuToEqjFn(tf), pts = [];
      for (let az = 0; az <= 360; az += 2) { const e = enuFromAltAz(0, az); pts.push(toEnu(...toEq(...e))); }
      ctx.strokeStyle = col.iso; ctx.globalAlpha = .75 - k * .07; ctx.lineWidth = 1.1; ctx.setLineDash([5, 5]);
      polyline(pts); ctx.setLineDash([]); isoCache.push({ tf, pts });
    }
    ctx.globalAlpha = 1;
  }
  // labels sit where each line crosses the centre column; skip any that would collide with each other or with planets/satellites
  function drawIsochroneLabels(col, font) {
    if (!isoCache) return;
    const placed = hits.filter(h => h.pri >= 5).map(h => [h.x, h.y, 34]);
    ctx.font = font(10.5, 600); ctx.textAlign = 'center';
    for (const { tf, pts } of isoCache) for (const below of [true, false]) {
      let best = null, bd = 1e9;
      for (const v of pts) { if ((v[2] < -0.02) !== below) continue; const s = project(v); if (!onScreen(s, -30)) continue; const d = Math.abs(s[0] - cx) + Math.abs(s[1] - cy) * .15; if (d < bd) { bd = d; best = s; } }
      if (!best || placed.some(p => Math.abs(p[1] - best[1]) < (p[2] ? 22 : 17) && Math.abs(p[0] - best[0]) < (p[2] || 140))) continue;
      placed.push(best);
      const lab = `${below ? 'rises by' : 'sets by'} ${fmtTime(tf)}`;
      ctx.globalAlpha = .92; ctx.fillStyle = col.light ? '#ffffffd8' : '#000000b0';
      const w = ctx.measureText(lab).width + 12; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(best[0] - w / 2, best[1] - 8, w, 16, 8) : ctx.rect(best[0] - w / 2, best[1] - 8, w, 16); ctx.fill();
      ctx.fillStyle = col.iso; ctx.fillText(lab, best[0], best[1] + 4);
    }
    ctx.globalAlpha = 1;
  }
  function drawCompass(col, font) {
    ctx.textAlign = 'center';
    ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].forEach((n, i) => {
      const s = project(enuFromAltAz(-2.5, i * 45)); if (!onScreen(s, 0)) return;
      ctx.font = font(n.length === 1 ? 15 : 11, 700); ctx.fillStyle = n === 'N' ? col.sel : col.horizon;
      ctx.fillText(n, s[0], s[1] + 12);
    });
  }
  function drawDomeFrame(col) {
    ctx.strokeStyle = col.horizon; ctx.lineWidth = mini ? 1 : 1.5; ctx.beginPath(); ctx.arc(cx, cy, R - .5, 0, 7); ctx.stroke();
    if (!mini) { ctx.strokeStyle = col.grid; ctx.lineWidth = 1; for (const a of [30, 60]) { ctx.beginPath(); ctx.arc(cx, cy, F * 2 * Math.tan((90 - a) * D2R / 2), 0, 7); ctx.stroke(); } }
  }
  function drawDomeLabels(col, font) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [n, az] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]]) {
      const v = enuFromAltAz(0, az), x = dot(v, B.r), y = dot(v, B.u), rr = R + (mini ? 9 : 12);
      if (mini && rr > Math.min(W, H) / 2) continue;
      ctx.font = font(mini ? 9 : 12, 700); ctx.fillStyle = n === 'N' ? col.sel : col.horizon;
      ctx.fillText(n, cx + x * rr, cy - y * rr);
    }
    ctx.textBaseline = 'alphabetic';
  }
  function drawCrosshair(col) {
    ctx.strokeStyle = col.sel; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, 18, 0, 7); ctx.moveTo(cx - 28, cy); ctx.lineTo(cx - 10, cy); ctx.moveTo(cx + 10, cy); ctx.lineTo(cx + 28, cy); ctx.moveTo(cx, cy - 28); ctx.lineTo(cx, cy - 10); ctx.moveTo(cx, cy + 10); ctx.lineTo(cx, cy + 28); ctx.stroke();
  }
  function selectedVec(t) {
    const o = selected; if (!o) return null;
    if (o.kind === 'sat') return satPosition(o, t)?.v;
    if (['sun', 'moon', 'planet'].includes(o.kind)) return solAt(t).find(b => b.id === o.id)?.v;
    const toEnu = eqjToEnuFn(t);
    if (o.kind === 'star') return toEnu(cat.vec[o.idx * 3], cat.vec[o.idx * 3 + 1], cat.vec[o.idx * 3 + 2]);
    if (o.kind === 'dso') return toEnu(...cat.dsos.find(d => d.id === o.id).v);
    if (o.kind === 'const') { const c = Object.values(cat.cons).find(c => c.n === o.name); return toEnu(...c.v); }
    if (o.kind === 'comet') { const c = comets.find(x => x.des === o.des); return c ? cometState(c, t).v : null; }
    if (o.ra != null && o.dec != null && o.kind === 'point') return toEnu(...radecVec(o.ra, o.dec));
    return o.v;
  }
  // What am I pointing at? Names whatever is nearest the centre of the view, with a fist-sized circle to judge scale
  // against your own eyes (one fist at arm's length is about 10 degrees).
  let aimAt = 0, aimObj = null;
  const KIND = { star: 'star', planet: 'planet', moon: 'the Moon', sun: 'the Sun', dso: 'deep-sky object', sat: 'satellite', const: 'constellation', comet: 'comet' };
  function brightWords(o) {
    if (o.kind === 'moon' || o.kind === 'planet') return 'bright, easy to see';
    if (o.kind === 'sat') return 'a moving satellite';
    if (o.kind === 'const') return 'a pattern of stars';
    if (o.kind === 'dso') return 'faint: use binoculars or a dark sky';
    const m = o.mag; if (m == null) return '';
    return m < 0 ? 'one of the brightest stars' : m < 2 ? 'bright' : m < 4 ? 'easy to see' : m < 5.5 ? 'fainter, needs a dark sky' : 'faint: use binoculars';
  }
  function updateAim(col, font, t) {
    const el = cfg.aim; if (!el) return;
    if (!V.sensor || mini || dome) { if (!el.hidden) el.hidden = true; return; }
    if (rect) { // fist-sized circle and crosshair
      const r = F * Math.tan(5 * D2R);
      ctx.save(); ctx.strokeStyle = col.sel; ctx.fillStyle = col.sel; ctx.globalAlpha = .8; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(cx - 9, cy); ctx.lineTo(cx + 9, cy); ctx.moveTo(cx, cy - 9); ctx.lineTo(cx, cy + 9); ctx.stroke();
      ctx.font = font(12, 600); ctx.textAlign = 'center'; ctx.fillText('1 fist', cx, cy + r + 15); ctx.restore();
    }
    if (performance.now() - aimAt < 150) return; aimAt = performance.now();
    let best = null, bs = 1e9;
    for (const h of hits) { const d = Math.hypot(h.x - cx, h.y - cy); if (d < Math.max(h.r, 22) + 26) { const sc = d - (h.pri || 0) * 8; if (sc < bs) { bs = sc; best = h; } } }
    const o = best ? (best.obj || (best.star != null ? starInfo(best.star) : null)) : null;
    const dir = unproject(best ? best.x : cx, best ? best.y : cy, [0, 0, 0]), aa = altAzFromEnu(dir), rd = enuToRaDec(dir[0], dir[1], dir[2], t), con = constellationOf(rd.ra, rd.dec);
    aimObj = o; el.hidden = false; el.disabled = !o;
    if (o) {
      el.querySelector('.an').textContent = o.name || o.id;
      el.querySelector('.ad').textContent = [KIND[o.kind] || '', brightWords(o), con && o.kind !== 'const' ? `in ${con}` : '', `${Math.round(aa.alt)}° up, ${compass(aa.az)}`].filter(Boolean).join(' · ');
    } else {
      el.querySelector('.an').textContent = 'Nothing named here';
      el.querySelector('.ad').textContent = [con ? `Sky in ${con}` : '', `${Math.round(aa.alt)}° up, ${compass(aa.az)}`].filter(Boolean).join(' · ');
    }
  }
  // Point-and-find: plain-words guidance to the selected object while the phone is pointed at the sky.
  // One fist at arm's length is about 10 degrees.
  let foundNow = false;
  const fists = d => { const n = Math.max(1, Math.round(d / 10)); return `${Math.round(d)}° (about ${n} fist${n > 1 ? 's' : ''})`; };
  function updateFind(t) {
    const el = cfg.find; if (!el) return;
    const v = selected && !mini && !dome ? selectedVec(t) : null;
    if (!v) { if (!el.hidden) el.hidden = true; foundNow = false; return; }
    el.hidden = false;
    const q = s => el.querySelector(s), fd = q('.fd'), fa = q('.fa'), fb = q('.fb');
    q('.fn').textContent = selected.name || 'Target';
    if (!V.sensor) { fd.textContent = 'Turn on Point and hold your phone up to the sky.'; fa.textContent = '⌖'; fa.style.transform = ''; fb.hidden = false; el.classList.remove('found'); foundNow = false; return; }
    fb.hidden = true;
    const x = dot(v, B.r), y = dot(v, B.u), z = dot(v, B.f);
    const turn = Math.atan2(x, z) * R2D, tilt = Math.atan2(y, Math.hypot(x, z)) * R2D, ang = Math.acos(clamp(z, -1, 1)) * R2D;
    const below = altAzFromEnu(v).alt < -1;
    if (ang < 4) {
      fd.textContent = 'Found it. Hold still and look.'; fa.textContent = '✓'; fa.style.transform = ''; el.classList.add('found');
      if (!foundNow) { foundNow = true; try { navigator.vibrate?.(60); } catch { } }
    } else {
      if (ang > 8) { foundNow = false; el.classList.remove('found'); }
      const parts = [];
      if (Math.abs(turn) >= 3) parts.push(`Turn ${turn > 0 ? 'right' : 'left'} ${fists(Math.abs(turn))}`);
      if (Math.abs(tilt) >= 3) parts.push(`${parts.length ? 'tilt' : 'Tilt'} ${tilt > 0 ? 'up' : 'down'} ${fists(Math.abs(tilt))}`);
      fd.textContent = parts.join(', ') + (below ? '. It is below the horizon right now.' : '');
      fa.textContent = '➤'; fa.style.transform = `rotate(${-Math.atan2(y, x) * R2D}deg)`;
      if (ang >= 4 && ang <= 8 && foundNow) el.classList.add('found'); else if (ang > 8) el.classList.remove('found');
    }
  }
  function drawSelected(col, font, t) {
    if (mini) return;
    const v = selectedVec(t); if (!v) return;
    if (selected.kind === 'sat') {
      if (!track || Math.abs(track.t - t) > 60000) { track = { t, pts: [] }; for (let s = -420; s <= 420; s += 15) { const p = satPosition(selected, new Date(+t + s * 1000)); if (p && p.v[2] > -0.02) track.pts.push(p.v); else track.pts.push([0, 0, -2]); } }
      ctx.strokeStyle = col.sat; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.2; polyline(track.pts.map(p => p[2] < -1 ? [0, 0, -1] : p)); ctx.setLineDash([]);
    }
    const s = project(v);
    ctx.strokeStyle = col.sel; ctx.lineWidth = 2;
    if (onScreen(s, -10)) { ctx.beginPath(); ctx.arc(s[0], s[1], 20, 0, 7); ctx.stroke(); return; }
    if (dome) return;
    const dx = dot(v, B.r), dy = -dot(v, B.u), a = Math.atan2(dy, dx);
    const ex = cx + Math.cos(a) * (Math.min(W, H) / 2 - 50), ey = cy + Math.sin(a) * (Math.min(W, H) / 2 - 50);
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(a); ctx.scale(1.7, 1.7); ctx.fillStyle = col.sel;
    ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-8, -11); ctx.lineTo(-3, 0); ctx.lineTo(-8, 11); ctx.fill(); ctx.restore();
    ctx.font = font(16, 600); ctx.textAlign = 'center'; ctx.fillText(selected.name, ex, ey + 40);
  }

  // ---------- loop + interaction ----------
  function loop(ts) {
    requestAnimationFrame(loop);
    if (!active || !W) return;
    if (ts - lastTick > (mini ? 5000 : 1000)) { lastTick = ts; dirty = true; }
    if (V.sensor || V.follow) dirty = true;
    if (!dirty) return;
    dirty = false; draw();
  }
  requestAnimationFrame(loop);

  function tap(x, y) {
    if (V.aligning) return;
    if (cfg.onTap) return cfg.onTap();
    let best = null, bd = 1e9;
    for (const h of hits) { const d = Math.hypot(h.x - x, h.y - y); if (d < h.r + 6) { const sc = d - h.pri * 4; if (sc < bd) { bd = sc; best = h; } } }
    if (best) { const obj = best.obj || starInfo(best.star); selected = obj; track = null; emit('select', obj); dirty = true; return; }
    if (dome && Math.hypot(x - cx, y - cy) > R) return;
    const v = unproject(x, y, [0, 0, 0]), { alt, az } = altAzFromEnu(v), { ra, dec } = enuToRaDec(...v, now());
    const obj = { kind: 'point', id: 'pt', name: `${constellationOf(ra, dec)} region`, alt, az, ra, dec, v };
    selected = obj; emit('select', obj); dirty = true;
  }
  {
    const pts = new Map(); let start = null, pinch = null, moved = false;
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); moved = false; const r = cv.getBoundingClientRect(); start = { x: e.clientX, y: e.clientY, az: V.az, alt: V.alt, hd: V.heading, a0: Math.atan2(e.clientY - r.top - cy, e.clientX - r.left - cx) }; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), fov: V.fov }; } });
    cv.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId) || mini) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2 && pinch && !dome) { const [a, b] = [...pts.values()]; V.fov = clamp(pinch.fov * pinch.d / Math.hypot(a[0] - b[0], a[1] - b[1]), 1, 170); moved = true; dirty = true; return; }
      if (pts.size !== 1 || !start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y; if (Math.hypot(dx, dy) > 4) moved = true; else return;
      if (dome) { if (V.follow) return; const r = cv.getBoundingClientRect(), a1 = Math.atan2(e.clientY - r.top - cy, e.clientX - r.left - cx); V.heading = start.hd - (a1 - start.a0) * R2D; dirty = true; return; }
      if (V.sensor) return;
      const k = V.fov / Math.min(W, H);
      V.az = (start.az - dx * k + 360) % 360; V.alt = clamp(start.alt + dy * k, -89.9, 89.9); dirty = true;
    });
    const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!moved && start && pts.size === 0) { const r = cv.getBoundingClientRect(); tap(e.clientX - r.left, e.clientY - r.top); } if (pts.size === 0) start = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', e => { pts.delete(e.pointerId); pinch = null; start = null; });
    if (!dome) {
      cv.addEventListener('wheel', e => { e.preventDefault(); V.fov = clamp(V.fov * Math.exp(e.deltaY * .0012), 1, 170); dirty = true; }, { passive: false });
      cv.addEventListener('dblclick', () => { V.fov = clamp(V.fov / 2, 1, 170); dirty = true; });
    }
  }

  // ---------- public ----------
  const api = {
    V, get basis() { return B; },
    invalidate: () => dirty = true,
    setActive(a) { active = a; dirty = true; if (!a && V.camera) api.toggleCamera(false); },
    select(o) { selected = o; track = null; dirty = true; },
    getSelected: () => selected,
    pickAim() { if (aimObj) { selected = aimObj; track = null; emit('select', aimObj); dirty = true; } },
    goTo(obj) {
      selected = obj; track = null;
      const v = selectedVec(now());
      if (v && !V.sensor && !dome) { const { alt, az } = altAzFromEnu(v); V.az = az; V.alt = clamp(alt, -60, 89); if (V.fov > 70) V.fov = 60; }
      dirty = true;
    },
    async toggleSensor(force) {
      const want = force ?? !V.sensor;
      if (want === V.sensor) return;
      if (want) { if (!await startOrientation()) return; V.sensor = true; sm = null; if (V.fov > 100) V.fov = 70; toast('Hold your phone up to the sky. Tap Align if things look offset.'); }
      else { stopOrientation(); const { alt, az } = altAzFromEnu(B.f); V.az = az; V.alt = alt; V.sensor = false; }
      dirty = true; return V.sensor;
    },
    async toggleFollow(force) {
      const want = force ?? !V.follow; if (want === V.follow) return V.follow;
      if (want) { if (!await startOrientation()) return false; V.follow = true; } else { stopOrientation(); V.follow = false; }
      dirty = true; return V.follow;
    },
    stream: null,
    async toggleCamera(force) {
      const want = force ?? !V.camera, vid = cfg.video;
      if (want) {
        try { api.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); vid.srcObject = api.stream; V.camera = true; if (!V.sensor) await api.toggleSensor(true); V.fov = 62; }
        catch { toast('Camera not available'); return false; }
      } else { api.stream?.getTracks().forEach(t => t.stop()); api.stream = null; if (vid) vid.srcObject = null; V.camera = false; }
      dirty = true; return V.camera;
    },
    align() {
      if (!V.sensor) { toast('Turn on Point first, then align on the Moon, a planet or a bright star'); return; }
      if (!V.aligning) { V.aligning = true; dirty = true; toast('Put a bright object you can see in the crosshair, then tap Align again', 5000); return 'armed'; }
      V.aligning = false;
      const t = now(), cands = solAt(t).filter(b => b.v[2] > 0 && b.kind !== 'sun').map(b => ({ name: b.name, v: b.v })), toEnu = eqjToEnuFn(t);
      for (let i = 0; i < cat.n; i++) if (cat.mag[i] < 1.6) cands.push({ name: cat.names[cat.id[i]]?.[0] || 'star', v: toEnu(cat.vec[i * 3], cat.vec[i * 3 + 1], cat.vec[i * 3 + 2]) });
      let best = null, bd = 1e9;
      for (const c of cands) { const d = Math.acos(clamp(dot(c.v, B.f), -1, 1)); if (d < bd) { bd = d; best = c; } }
      if (!best || bd > 35 * D2R) { toast('No bright object near the crosshair'); return; }
      const tgt = altAzFromEnu(best.v), cur = altAzFromEnu(B.f), delta = ((tgt.az - cur.az + 540) % 360) - 180;
      state.calOffset = (((state.calOffset + delta) + 540) % 360) - 180; store.set('calOffset', state.calOffset);
      emit('calibrated', state.calOffset); toast(`Aligned on ${best.name} (${delta > 0 ? '+' : ''}${delta.toFixed(1)}°)`);
      dirty = true;
    },
  };
  return api;
}

// ---------- main Sky view wiring ----------
export let sky = null;
export function initSky() {
  loadMilkyWay().then(() => sky?.invalidate());
  sky = createSky(document.getElementById('skyCanvas'), { aim: document.getElementById('aimHud'), find: document.getElementById('findHud'), ar: document.getElementById('arCanvas'), video: document.getElementById('camVideo'), hud: { dir: document.getElementById('hudDir'), time: document.getElementById('hudTime') } });
  const $ = id => document.getElementById(id);
  $('btnSensor').onclick = async () => { await sky.toggleSensor(); $('btnSensor').classList.toggle('on', sky.V.sensor); };
  $('btnCamera').onclick = async () => { await sky.toggleCamera(); $('skyWrap').classList.toggle('cam', sky.V.camera); $('btnCamera').classList.toggle('on', sky.V.camera); $('btnSensor').classList.toggle('on', sky.V.sensor); };
  $('btnAlign').onclick = () => { const r = sky.align(); $('btnAlign').classList.toggle('on', r === 'armed'); };
  $('aimHud').onclick = () => sky.pickAim();
  $('findHud').querySelector('.fb').onclick = async () => { await sky.toggleSensor(true); $('btnSensor').classList.toggle('on', sky.V.sensor); };
  $('findStop').onclick = () => sky.select(null);
  const lp = $('layersPanel');
  $('btnLayers').onclick = () => { lp.hidden = !lp.hidden; $('btnLayers').classList.toggle('on', !lp.hidden); };
  lp.querySelectorAll('input[data-layer]').forEach(i => {
    i.checked = !!state.layers[i.dataset.layer];
    i.onchange = () => { state.layers[i.dataset.layer] = i.checked; store.set('layers', state.layers); emit('layers', i.dataset.layer); };
  });
}
export const setSkyActive = a => sky?.setActive(a);
export const goTo = o => sky?.goTo(o);
