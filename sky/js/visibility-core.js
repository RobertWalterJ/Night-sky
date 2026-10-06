// "Can I see it?": a plain-language verdict for one object, from its brightness, height and how dark the sky is.
// Pure functions with no imports, so they can be tested offline. The app wrapper is visibility.js.
const D2R = Math.PI / 180;

// Air mass (how much atmosphere the light crosses), Pickering 2002, good down to the horizon.
export const airMass = altDeg => 1 / Math.sin((altDeg + 244 / (165 + 47 * Math.pow(Math.max(altDeg, 0), 1.1))) * D2R);
const K = 0.22;        // magnitudes lost per air mass in clear air (a typical value, so low objects are dimmer)
const BINOC_GAIN = 3;  // how many magnitudes fainter 10x50 binoculars reach, roughly

// o: { kind, mag, alt, lit?, extended?, illum? (Moon, 0 to 1), sepSun? (Moon, degrees from the Sun) }   sky: { lim (naked-eye limit, mag), sunAlt (deg), nextDark? (text) }
// Returns { level: 'yes' | 'maybe' | 'binoculars' | 'no', text }, or null when there is nothing sensible to say.
export function canSee(o, sky) {
  const { kind, mag, alt } = o;
  if (alt == null) return null;
  if (alt < 0) return { level: 'no', text: 'No: it is below the horizon right now' };
  if (kind === 'sun') return { level: 'yes', text: 'Yes, but never look at the Sun without a proper solar filter' };
  if (kind === 'moon') {
    // The Moon is bright but its glow is spread out, so a thin crescent vanishes in a bright sky. Phase, the Sun's height and how close it is to the Sun decide.
    const il = o.illum ?? 1, sep = o.sepSun ?? 90, pct = Math.round(il * 100), sunUp = sky.sunAlt > 0;
    if (sunUp && sep < 20) return { level: 'no', text: 'No: the Moon is too close to the Sun to see' };
    if (!sunUp && sky.sunAlt > -6) return il > .03 ? { level: 'yes', text: `Yes, twilight is a good time to look for the Moon (${pct}% lit)` } : { level: 'maybe', text: 'Maybe: it is a very thin sliver' };
    if (!sunUp) return il > .02 ? { level: 'yes', text: alt < 8 ? 'Yes, the Moon is easy to see, low in the sky' : 'Yes, the Moon is easy to see' } : { level: 'maybe', text: 'Maybe: it is a very thin sliver' };
    if (il >= .45) return { level: 'yes', text: `Yes: a ${pct}% lit Moon shows up as a pale shape in daylight` };
    if (il >= .12) return { level: 'maybe', text: `Maybe: only ${pct}% is lit, so it is faint against a daytime sky. It is easiest on a clear, deep blue sky, away from the Sun. Look carefully, or wait for dusk` };
    return { level: 'no', text: `No: only ${pct}% is lit, too thin to find in daylight. Try after dusk` };
  }
  if (kind === 'sat' && o.lit === false) return { level: 'no', text: "No: it is in the Earth's shadow, so it cannot reflect sunlight" };
  if (kind === 'const') return null;
  if (mag == null || isNaN(mag)) return null;
  const low = alt < 12 ? ', and it is low so haze dims it' : '';
  // daylight: only the very brightest planets can be found, with difficulty
  if (sky.sunAlt > 0) return mag <= -3.8 ? { level: 'maybe', text: 'Maybe: it is bright enough to find in daylight, but hard to spot without knowing exactly where' } : { level: 'no', text: `No: the Sun is up${sky.nextDark ? '. Try after ' + sky.nextDark : ''}` };
  const eff = mag + (o.extended ? 1.5 : 0) + K * (airMass(alt) - 1);   // fuzzy objects (galaxies, nebulae) look fainter than their magnitude
  const margin = sky.lim - eff;
  if (sky.sunAlt > -6 && margin < 1) return { level: 'no', text: `No: the sky is still too bright${sky.nextDark ? '. Try after ' + sky.nextDark : ''}` };
  if (margin >= 1.2) return { level: 'yes', text: `Yes, easy to see${low}` };
  if (margin >= 0.2) return { level: 'yes', text: `Yes, you should see it${low}` };
  if (margin >= -0.7) return { level: 'maybe', text: `Maybe: right at the limit for your sky. Look slightly to the side of it, or use binoculars${low}` };
  if (margin >= -BINOC_GAIN) return { level: 'binoculars', text: `Not with your eyes alone. Binoculars should show it${low}` };
  return { level: 'no', text: 'No: too faint even for binoculars from here' };
}

// Best thing to align the compass on right now, in the order a person can actually find it.
// cands: [{ kind, name, mag, alt, illum? }] already above the horizon. Returns one or null.
export function pickAlignTarget(cands, sky) {
  const moon = cands.find(c => c.kind === 'moon' && c.alt > 5 && canSee(c, sky)?.level === 'yes');
  if (moon) return moon;
  const score = c => c.mag - Math.min(c.alt, 40) * .01; // brighter first, a little credit for being higher
  const planets = cands.filter(c => c.kind === 'planet' && c.alt > 10 && c.mag < 2.2 && canSee(c, sky)?.level === 'yes').sort((a, b) => score(a) - score(b));
  if (planets.length) return planets[0];
  const stars = cands.filter(c => c.kind === 'star' && c.alt > 20 && c.mag < 1.6 && canSee(c, sky)?.level === 'yes').sort((a, b) => a.mag - b.mag);
  return stars[0] || null;
}
