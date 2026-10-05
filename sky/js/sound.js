// Sky Sound: a live sonification of what is overhead.
// Everything pitched is quantised to one scale (D Dorian) so any mix of objects stays harmonious.
//   left/right = compass direction, pitch + brightness = height, rising/setting = upward/downward sweeps.
// Timbres: FM bells (stations), analog plucks (other satellites), detuned saw pads (Milky Way, galactic centre),
// sine drifts (planets, Moon), glassy sparkles (stars). Reverb + tape-style echo glue it together.
// This is sonification (data turned into sound), not a recording of space.
import { $, $$, clamp, D2R, store, state, now, compass, toast } from './util.js';
import { visibleSats, sats } from './sats.js';
import { solarSystem, eqjToEnuFn, radecVec, altAzFromEnu, GALACTIC_CENTRE, nelm } from './astro.js';
import { milkyWayAt, starCount } from './overhead.js';
import { createViz } from './soundviz.js';

const SCALE = [0, 2, 3, 5, 7, 9, 10]; // D Dorian from the root
const ROOT = 2;                        // D = pitch class 2
const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);
const degMidi = (idx, base) => { const o = Math.floor(idx / 7), s = ((idx % 7) + 7) % 7; return base + 12 * o + SCALE[s]; };
const altHz = (alt, base, span = 14) => midiHz(degMidi(Math.round(clamp(alt, 0, 90) / 90 * span), base));
const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

// Fixed notes for the Solar System, all inside the scale. [midi note, loudness]
const BODY = {
  Moon: [57, .12], Mercury: [81, .035], Venus: [69, .10], Mars: [62, .06], Jupiter: [50, .12],
  Saturn: [53, .08], Uranus: [76, .025], Neptune: [71, .025],
};
// How each satellite group sounds. family: bell | pluck | hum. [base midi note, seconds between pings, level]
const GROUP = {
  stations: ['bell', 74, 2.4, .36], visual: ['pluck', 62, 3.2, .20], gnss: ['hum', 38, 5.5, .18], geo: ['hum', 26, 7, .14],
  weather: ['pluck', 66, 3.8, .14], resource: ['pluck', 59, 3.8, .14], science: ['pluck', 69, 4.2, .14],
  amateur: ['pluck', 64, 4.5, .11], cubesat: ['pluck', 71, 4.5, .10], oneweb: ['pluck', 73, 5, .09], starlink: ['pluck', 76, 5, .08],
};
const PRIORITY = { stations: 0, visual: 1, science: 2, weather: 3, resource: 3, gnss: 4, geo: 5 };

function makeIR(ctx, secs) {
  const n = Math.floor(ctx.sampleRate * secs), buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); let lp = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; lp += (w - lp) * .35; d[i] = lp * Math.pow(1 - i / n, 2.6); } }
  return buf;
}

export function createEngine(ctx, o = {}) {
  const layers = { sats: true, planets: true, mw: true, stars: true, ...(o.layers || {}) };
  let threeD = !!o.threeD;
  const out = o.output || ctx.destination;
  const master = ctx.createGain(); master.gain.value = o.volume ?? .5;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -20; comp.knee.value = 18; comp.ratio.value = 4; comp.attack.value = .01; comp.release.value = .25;
  master.connect(comp); comp.connect(out);
  const an = ctx.createAnalyser(); an.fftSize = 1024; comp.connect(an); const lvBuf = new Float32Array(1024);
  const level = () => { an.getFloatTimeDomainData(lvBuf); let s = 0; for (let i = 0; i < lvBuf.length; i++) s += lvBuf[i] * lvBuf[i]; return Math.sqrt(s / lvBuf.length); };
  const dry = ctx.createGain(); dry.connect(master);
  // shared effects: hall reverb + tape-style echo
  const fx = ctx.createGain(), conv = ctx.createConvolver(), rv = ctx.createGain();
  conv.buffer = makeIR(ctx, 3.2); rv.gain.value = .55; fx.connect(conv); conv.connect(rv); rv.connect(master);
  const dl = ctx.createDelay(1.5), fb = ctx.createGain(), dlp = ctx.createBiquadFilter(), dw = ctx.createGain();
  dl.delayTime.value = .43; fb.gain.value = .36; dlp.type = 'lowpass'; dlp.frequency.value = 2200; dw.gain.value = .45;
  fx.connect(dl); dl.connect(dlp); dlp.connect(fb); fb.connect(dl); dlp.connect(dw); dw.connect(master); dlp.connect(conv);

  // ----- spatial helper: stereo pan, or HRTF 3D for headphones -----
  function place(p, az, alt, t) {
    const a = az * D2R, l = alt * D2R, d = 2, x = Math.sin(a) * Math.cos(l) * d, y = Math.sin(l) * d, z = -Math.cos(a) * Math.cos(l) * d;
    if (p.positionX) { if (t == null) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else { p.positionX.setTargetAtTime(x, t, .5); p.positionY.setTargetAtTime(y, t, .5); p.positionZ.setTargetAtTime(z, t, .5); } } else p.setPosition(x, y, z);
  }
  function makePan(az, alt) {
    if (threeD) { const p = ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 1; place(p, az, alt); return { node: p, set: (a, l, t) => place(p, a, l, t) }; }
    const p = ctx.createStereoPanner(); p.pan.value = Math.sin(az * D2R) * .85;
    return { node: p, set: (a, l, t) => p.pan.setTargetAtTime(Math.sin(a * D2R) * .85, t, .5) };
  }
  // connect a source gain to the room: panned dry + a send to the effects
  function route(g, az, alt, send) {
    const pn = makePan(az, alt), s = ctx.createGain(); s.gain.value = send;
    g.connect(pn.node); pn.node.connect(dry); g.connect(s); s.connect(fx);
    return pn;
  }
  // tell the visual when something sounds (at the moment it is heard)
  const fire = (e, t) => { if (o.onEvent) setTimeout(() => o.onEvent(e), Math.max(0, (t - ctx.currentTime + (ctx.outputLatency || ctx.baseLatency || 0)) * 1000)); };
  const tidy = (src, nodes, t) => { src.stop(t); src.onended = () => nodes.forEach(n => { try { n.disconnect(); } catch { } }); };
  const perc = (g, t, a, d, peak) => { g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(peak, .0002), t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + d); };

  // ----- one-shot voices -----
  function bell(t, hz, az, alt, vol) { // glassy FM bell
    const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    car.frequency.value = hz; mod.frequency.value = hz * 3.5; mg.gain.setValueAtTime(hz * 2.4, t); mg.gain.exponentialRampToValueAtTime(hz * .04, t + 1.5);
    mod.connect(mg); mg.connect(car.frequency); car.connect(g); perc(g, t, .004, 2, vol);
    const pn = route(g, az, alt, .6); car.start(t); mod.start(t); tidy(mod, [mg], t + 2.2); tidy(car, [g, pn.node], t + 2.2);
  }
  function pluck(t, hz, az, alt, vol) { // analog-style filtered saw pluck
    const osc = ctx.createOscillator(), osc2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    osc.type = 'sawtooth'; osc2.type = 'square'; osc.frequency.value = hz; osc2.frequency.value = hz * 1.003;
    lp.type = 'lowpass'; lp.Q.value = 5; lp.frequency.setValueAtTime(Math.min(hz * 9, 5000), t); lp.frequency.exponentialRampToValueAtTime(hz * 1.2, t + .35);
    osc.connect(lp); osc2.connect(lp); lp.connect(g); perc(g, t, .006, .55, vol);
    const pn = route(g, az, alt, .55); osc.start(t); osc2.start(t); tidy(osc2, [], t + .7); tidy(osc, [lp, g, pn.node], t + .7);
  }
  function hum(t, hz, az, alt, vol) { // slow low swell
    const a = ctx.createOscillator(), b = ctx.createOscillator(), g = ctx.createGain();
    a.type = 'sine'; b.type = 'triangle'; a.frequency.value = hz; b.frequency.value = hz * 2.003;
    a.connect(g); b.connect(g); g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(vol, t + 1.2); g.gain.linearRampToValueAtTime(.0001, t + 3.2);
    const pn = route(g, az, alt, .5); a.start(t); b.start(t); tidy(b, [], t + 3.3); tidy(a, [g, pn.node], t + 3.3);
  }
  function sparkle(t, hz, az, alt, vol) { // tiny glassy chirp
    const o2 = ctx.createOscillator(), g = ctx.createGain();
    o2.frequency.setValueAtTime(hz * 1.02, t); o2.frequency.exponentialRampToValueAtTime(hz, t + .06); o2.connect(g); perc(g, t, .003, .5, vol);
    const pn = route(g, az, alt, .8); o2.start(t); tidy(o2, [g, pn.node], t + .6);
  }
  function sweep(t, hz, up, vol, az, alt) { // rising / setting cue
    const o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o2.type = 'triangle'; lp.type = 'lowpass'; lp.frequency.value = 1800;
    o2.frequency.setValueAtTime(up ? hz / 2 : hz, t); o2.frequency.exponentialRampToValueAtTime(up ? hz : hz / 2, t + .75);
    o2.connect(lp); lp.connect(g); perc(g, t, up ? .5 : .05, up ? .3 : .7, vol);
    fire({ k: 'sweep', up, az, alt }, t);
    const pn = route(g, az, alt, .6); o2.start(t); tidy(o2, [lp, g, pn.node], t + 1.2);
  }

  // ----- persistent voices -----
  const padGain = ctx.createGain(), padLP = ctx.createBiquadFilter(), padLFO = ctx.createOscillator(), padLFOg = ctx.createGain();
  padGain.gain.value = 0; padLP.type = 'lowpass'; padLP.Q.value = 3; padLP.frequency.value = 400;
  padLFO.frequency.value = .05; padLFOg.gain.value = 180; padLFO.connect(padLFOg); padLFOg.connect(padLP.frequency); padLFO.start();
  const padB = ctx.createGain(); padB.gain.value = 0; // second chord tone that slowly breathes in and out for harmonic movement
  [[38, 'sawtooth', -6], [38, 'sawtooth', 6], [45, 'sawtooth', 0], [50, 'triangle', 0]].forEach(([m, type, det]) => { const oc = ctx.createOscillator(); oc.type = type; oc.frequency.value = midiHz(m); oc.detune.value = det; oc.connect(padLP); oc.start(); });
  [[41, 'sawtooth', -5], [41, 'sawtooth', 5]].forEach(([m, type, det]) => { const oc = ctx.createOscillator(); oc.type = type; oc.frequency.value = midiHz(m); oc.detune.value = det; oc.connect(padB); oc.start(); });
  padB.connect(padLP); padLP.connect(padGain);
  const padPan = route(padGain, 0, 90, .7); padPan.set(0, 90, 0);
  const breatheLFO = ctx.createOscillator(), breatheG = ctx.createGain(); breatheLFO.frequency.value = .03; breatheG.gain.value = .5; breatheLFO.connect(breatheG);
  const breatheOff = ctx.createConstantSource(); breatheOff.offset.value = .5; breatheOff.connect(padB.gain); breatheG.connect(padB.gain); breatheLFO.start(); breatheOff.start();

  const gcGain = ctx.createGain(), gcLP = ctx.createBiquadFilter(); gcGain.gain.value = 0; gcLP.type = 'lowpass'; gcLP.frequency.value = 520; gcLP.Q.value = 2;
  [[43, 'triangle', 0], [43, 'sawtooth', 7], [55, 'sine', 0]].forEach(([m, type, det]) => { const oc = ctx.createOscillator(); oc.type = type; oc.frequency.value = midiHz(m); oc.detune.value = det; oc.connect(gcLP); oc.start(); });
  gcLP.connect(gcGain); const gcPan = route(gcGain, 180, 20, .8);

  const bodyV = {};
  function bodyVoice(id) {
    if (bodyV[id]) return bodyV[id];
    const [m, lvl] = BODY[id] || [64, .02], g = ctx.createGain(), trem = ctx.createGain(); g.gain.value = 0; trem.gain.value = 1;
    const tl = ctx.createOscillator(), tg = ctx.createGain(); tl.frequency.value = id === 'Moon' ? .08 : .13 + Math.random() * .1; tg.gain.value = id === 'Moon' ? .35 : .15; tl.connect(tg); tg.connect(trem.gain); tl.start();
    const dets = id === 'Saturn' ? [-8, 0, 8] : [0, 5];
    dets.forEach(d => { const oc = ctx.createOscillator(); oc.type = id === 'Moon' ? 'triangle' : 'sine'; oc.frequency.value = midiHz(m); oc.detune.value = d; oc.connect(trem); oc.start(); });
    trem.connect(g); const pn = route(g, 180, 30, .85);
    return bodyV[id] = { g, pn, lvl, prev: null };
  }

  // ----- satellites tracked right now -----
  const satT = new Map();
  let lastGc = null, starAcc = 0;

  const api = {
    layers, ctx, master,
    setVolume(v) { master.gain.setTargetAtTime(v, ctx.currentTime, .1); },
    setLayer(k, v) { layers[k] = v; },
    set3D(v) { threeD = !!v; }, // applies to voices created from now on
    voiced: [], bed: { mw: 0, gcAlt: -90 }, level,
    step(at, sky) {
      const dark = sky.dark;
      // Milky Way bed: richer and brighter the more of the band is overhead
      const mwF = layers.mw ? sky.mw * dark : 0;
      api.bed = { mw: mwF, gcAlt: sky.gc.alt };
      padGain.gain.setTargetAtTime(layers.mw ? (.025 + .05 * mwF) * (.4 + .6 * dark) : 0, at, 2.5);
      padLP.frequency.setTargetAtTime(280 + 1200 * mwF, at, 2.5);
      // galactic centre: a deep warm swell that moves as it climbs and sinks
      const gcAlt = sky.gc.alt, gcOn = layers.mw && dark > .05;
      gcGain.gain.setTargetAtTime(gcOn ? smooth(gcAlt / 35) * .15 * dark : 0, at, 1.5); gcPan.set(sky.gc.az, Math.max(gcAlt, 0), at);
      if (lastGc != null && gcOn) { if (lastGc <= 0 && gcAlt > 0) sweep(at, 98, true, .10, sky.gc.az, 5); if (lastGc > 0 && gcAlt <= 0) sweep(at, 98, false, .10, sky.gc.az, 5); }
      lastGc = gcAlt;
      // planets and Moon: steady notes that fade in as they climb
      for (const b of sky.bodies) {
        if (!BODY[b.id]) continue; const v = bodyVoice(b.id), up = layers.planets && b.alt > 0;
        v.g.gain.setTargetAtTime(up ? smooth(b.alt / 30) * v.lvl * .45 : 0, at, 1.2); v.pn.set(b.az, Math.max(b.alt, 0), at);
        if (layers.planets && v.prev != null) {
          const hz = midiHz(BODY[b.id][0]);
          if (v.prev <= 0 && b.alt > 0) sweep(at, hz, true, .09, b.az, 2); else if (v.prev > 0 && b.alt <= 0) sweep(at, hz, false, .09, b.az, 2);
        }
        v.prev = b.alt;
      }
      // satellites: the most important few get a voice; others stay silent so it never turns to noise
      const want = (layers.sats ? sky.sats : []).filter(s => s.alt > 0).sort((a, b) => (PRIORITY[a.group] ?? 6) - (PRIORITY[b.group] ?? 6) || (a.mag ?? 9) - (b.mag ?? 9)).slice(0, 6);
      const ids = new Set(want.map(s => s.id));
      api.voiced = want.map(s => ({ id: s.id, name: s.name, group: s.group, alt: s.alt, az: s.az, up: s.alt >= (satT.get(s.id)?.alt ?? s.alt) }));
      for (const [id, st] of satT) if (!ids.has(id)) { const [, base] = GROUP[st.group] || GROUP.visual; sweep(at, altHz(st.alt, base), false, .08, st.az, st.alt); satT.delete(id); }
      for (const s of want) {
        const spec = GROUP[s.group] || GROUP.visual, [fam, base, every, lvl] = spec; let st = satT.get(s.id);
        if (!st) { st = { next: at + .6, group: s.group }; satT.set(s.id, st); sweep(at, altHz(s.alt, base), true, .09, s.az, s.alt); }
        st.alt = s.alt; st.az = s.az;
        if (at >= st.next) {
          const hz = altHz(s.alt, base), vol = lvl * (.35 + .65 * smooth(s.alt / 40)) * (s.lit ? 1 : .45);
          if (fam === 'bell') bell(at + .02, hz, s.az, s.alt, vol); else if (fam === 'pluck') pluck(at + .02, hz, s.az, s.alt, vol); else hum(at + .02, hz, s.az, s.alt, vol);
          fire({ k: 'ping', group: s.group, id: s.id, az: s.az, alt: s.alt, vol: Math.min(1, vol * 3) }, at + .02);
          st.next = at + every * (1.25 - .5 * smooth(s.alt / 60));
        }
      }
      // stars: a glassy shimmer, denser the more stars you can see
      if (layers.stars && dark > .05) {
        starAcc += clamp(sky.stars / 2200, 0, 1) * 2.4 * dark;
        let n = Math.floor(starAcc); starAcc -= n;
        for (; n > 0; n--) { const deg = 14 + Math.floor(Math.random() * 8), az = Math.random() * 360, alt = 15 + Math.random() * 70; const st = at + Math.random() * .95; sparkle(st, midiHz(degMidi(deg, 62)), az, alt, .06 + Math.random() * .05); fire({ k: 'spark', az, alt }, st); }
      }
    },
    summary(sky) {
      const bits = [], st = sky.sats.filter(s => s.group === 'stations' && s.alt > 0)[0];
      if (st) bits.push(`${st.name} in the ${compass(st.az)}, ${Math.round(st.alt)}° up`);
      const n = sky.sats.filter(s => s.alt > 0).length; if (n && layers.sats) bits.push(`${Math.min(api.voiced.length, n)} of ${n} satellites playing`);
      const pl = sky.bodies.filter(b => b.alt > 0 && b.id !== 'Sun').map(b => b.id); if (pl.length && layers.planets) bits.push(pl.slice(0, 4).join(', ') + ' up');
      if (layers.mw && sky.mw * sky.dark > .25) bits.push('Milky Way overhead'); else if (layers.mw && sky.gc.alt > 5 && sky.dark > .3) bits.push(`Galactic centre rising in the ${compass(sky.gc.az)}`);
      return bits.length ? bits.join(' · ') : 'Quiet sky right now';
    },
    stop() { try { ctx.close(); } catch { } },
  };
  return api;
}

// ---------- read the live sky from the app's own data ----------
let starCache = { t: 0, n: 0 };
export function readSky(t) {
  const lim = nelm(t), sol = solarSystem(t), sun = sol[0];
  const toEnu = eqjToEnuFn(t), gc = altAzFromEnu(toEnu(...radecVec(GALACTIC_CENTRE.ra, GALACTIC_CENTRE.dec)));
  let mw = 0;
  try { const pts = [[0, 0, 1], ...[0, 90, 180, 270].map(a => [Math.sin(a * D2R) * .64, Math.cos(a * D2R) * .64, .77])]; mw = Math.max(...pts.map(p => milkyWayAt(p, t))) * .6 + milkyWayAt([0, 0, 1], t) * .4; } catch { }
  if (performance.now() - starCache.t > 5000) { try { starCache = { t: performance.now(), n: starCount(t, Math.max(lim, 0)) }; } catch { } }
  const sl = sats.ready ? visibleSats(t, false) : [];
  return {
    dark: clamp((-sun.alt - 6) / 12, 0, 1), mw: clamp(mw, 0, 1), gc: { alt: gc.alt, az: gc.az }, stars: starCache.n,
    bodies: sol.filter(b => b.kind !== 'sun').map(b => ({ id: b.id, alt: b.alt, az: b.az })),
    sats: sl.filter(s => s.alt > 0).map(s => ({ id: s.norad ?? s.name, group: s.group, name: s.name, alt: s.alt, az: s.az, lit: s.lit, mag: s.mag })),
  };
}

// ---------- the Listen panel and the live loop ----------
let ctx = null, eng = null, timer = null, audioEl = null, viz = null;
const layerStore = () => ({ sats: true, planets: true, mw: true, stars: true, ...store.get('soundLayers', {}) });
export const isPlaying = () => !!eng;

export async function startSound() {
  if (eng) return;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) { toast('This browser cannot play Sky Sound'); return; }
  ctx = new AC(); await ctx.resume();
  let output = ctx.destination;
  try { // route through an <audio> element so Android treats it as media and keeps it going with the screen off
    const md = ctx.createMediaStreamDestination(); audioEl = audioEl || Object.assign(document.createElement('audio'), { playsInline: true });
    audioEl.srcObject = md.stream; await audioEl.play(); output = md;
    if (navigator.mediaSession) { navigator.mediaSession.metadata = new MediaMetadata({ title: 'Sky Sound', artist: 'Night Sky', album: 'Live from overhead' }); navigator.mediaSession.setActionHandler('pause', stopSound); navigator.mediaSession.setActionHandler('stop', stopSound); }
  } catch { output = ctx.destination; }
  eng = createEngine(ctx, { layers: layerStore(), volume: +store.get('soundVol', .5), threeD: !!store.get('sound3d', false), output, onEvent: e => viz?.event(e) });
  viz?.start();
  const tick = () => { if (!eng) return; const sky = readSky(now()); eng.step(ctx.currentTime, sky); viz?.update(sky, eng); const s = $('#soundStatus'); if (s) s.textContent = eng.summary(sky); };
  tick(); timer = setInterval(tick, 1000); paint();
}
export function stopSound() {
  clearInterval(timer); timer = null; eng?.stop(); eng = null; ctx = null; if (audioEl) { audioEl.pause(); audioEl.srcObject = null; }
  viz?.stop(); const s = $('#soundStatus'); if (s) s.textContent = 'Stopped'; paint();
}
function paint() {
  const on = isPlaying();
  $('#soundToggle')?.classList.toggle('on', on); if ($('#soundToggle')) $('#soundToggle').textContent = on ? 'Stop listening' : 'Listen to the sky';
  $('#soundBtn')?.classList.toggle('on', on); if ($('#soundBtn')) $('#soundBtn').hidden = !on;
}

export function initSound() {
  if ($('#soundViz')) { viz = createViz($('#soundViz'), { now: $('#soundNow'), pick: $('#soundPick') }); viz.stop(); }
  const L = layerStore();
  $$('#soundLayers input[data-sl]').forEach(i => { i.checked = !!L[i.dataset.sl]; i.onchange = () => { L[i.dataset.sl] = i.checked; store.set('soundLayers', L); eng?.setLayer(i.dataset.sl, i.checked); }; });
  const vol = $('#soundVol'); if (vol) { vol.value = store.get('soundVol', .5); vol.oninput = () => { store.set('soundVol', +vol.value); eng?.setVolume(+vol.value); }; }
  const d3 = $('#sound3d'); if (d3) { d3.checked = !!store.get('sound3d', false); d3.onchange = () => { store.set('sound3d', d3.checked); toast(isPlaying() ? 'Headphone 3D applies the next time you start listening' : 'Headphone 3D on'); }; }
  const toggle = () => isPlaying() ? stopSound() : startSound();
  if ($('#soundToggle')) $('#soundToggle').onclick = toggle;
  if ($('#soundBtn')) $('#soundBtn').onclick = toggle;
}
