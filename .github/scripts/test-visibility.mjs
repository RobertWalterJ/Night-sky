// Offline tests for sky/js/visibility-core.js. Run: node .github/scripts/test-visibility.mjs
import { canSee, pickAlignTarget, airMass } from '../../sky/js/visibility-core.js';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL', m)); console.log(c ? 'ok  ' : 'FAIL', m); };
const dark = { lim: 5.8, sunAlt: -25 };
ok(Math.abs(airMass(90) - 1) < 0.01 && airMass(30) > 1.9 && airMass(30) < 2.1 && airMass(5) > 9, 'air mass: 1 at the zenith, about 2 at 30 degrees, about 10 at 5 degrees');
ok(canSee({ kind: 'planet', mag: -2.5, alt: 30 }, dark).level === 'yes', 'Jupiter-bright planet in a dark sky: yes');
ok(/easy/.test(canSee({ kind: 'planet', mag: -2.5, alt: 30 }, dark).text), 'bright planet reads "easy"');
ok(canSee({ kind: 'star', mag: 5.2, alt: 40 }, dark).level === 'yes', 'a magnitude 5.2 star high up under a dark sky: yes');
ok(canSee({ kind: 'star', mag: 6.5, alt: 60 }, dark).level === 'binoculars', 'a magnitude 6.5 star: binoculars');
ok(canSee({ kind: 'star', mag: 9, alt: 60 }, dark).level === 'no', 'a magnitude 9 star: too faint even for binoculars');
ok(canSee({ kind: 'dso', mag: 3.4, alt: 50, extended: true }, dark).level === 'yes', 'Andromeda galaxy (3.4, fuzzy) under a dark sky: yes');
ok(canSee({ kind: 'dso', mag: 3.4, alt: 50, extended: true }, { lim: 4.0, sunAlt: -25 }).level !== 'yes', 'the same galaxy under a city sky (limit 4.0): not a plain yes');
ok(canSee({ kind: 'star', mag: 1, alt: -3 }, dark).level === 'no' && /below the horizon/.test(canSee({ kind: 'star', mag: 1, alt: -3 }, dark).text), 'below the horizon: no, and says why');
ok(canSee({ kind: 'planet', mag: -4.2, alt: 40 }, { lim: -1, sunAlt: 20 }).level === 'maybe', 'Venus in full daylight: maybe');
ok(canSee({ kind: 'planet', mag: -2.4, alt: 40 }, { lim: -1, sunAlt: 20, nextDark: '8:42 PM' }).text.includes('8:42 PM'), 'daylight answer tells you when to try again');
ok(canSee({ kind: 'star', mag: 1, alt: 40 }, { lim: 1.5, sunAlt: -3 }).level === 'no', 'bright star in bright twilight: sky still too bright');
const low = canSee({ kind: 'planet', mag: 0.8, alt: 5 }, dark); ok(low.level === 'yes' && /low/.test(low.text), 'a bright planet very low: still visible, with a haze warning');
ok(canSee({ kind: 'sat', mag: 3, alt: 40, lit: false }, dark).level === 'no', 'a satellite in the Earth shadow: no');
ok(canSee({ kind: 'moon', alt: 30 }, dark).level === 'yes', 'the Moon above the horizon: yes');
ok(canSee({ kind: 'const', alt: 30 }, dark) === null, 'constellations: nothing to say');
// align target
const moon = { kind: 'moon', name: 'Moon', alt: 20, mag: -10, illum: .5 }, jup = { kind: 'planet', name: 'Jupiter', alt: 35, mag: -2.3 }, sat = { kind: 'planet', name: 'Saturn', alt: 25, mag: .9 }, vega = { kind: 'star', name: 'Vega', alt: 70, mag: 0 }, arc = { kind: 'star', name: 'Arcturus', alt: 30, mag: -.05 };
ok(pickAlignTarget([jup, moon, vega], dark).name === 'Moon', 'align: the Moon when it is up');
ok(pickAlignTarget([jup, sat, vega], dark).name === 'Jupiter', 'align: the brightest planet when there is no Moon');
ok(pickAlignTarget([vega, arc], dark).name === 'Arcturus', 'align: the brightest star when there is no planet');
ok(pickAlignTarget([{ ...moon, illum: .02 }, vega], dark).name === 'Vega', 'align: a hair-thin Moon is skipped');
ok(pickAlignTarget([{ ...jup, alt: 6 }], dark) === null, 'align: nothing above 10 degrees means no suggestion');
ok(pickAlignTarget([jup, vega], { lim: -1, sunAlt: 20 }) === null, 'align: in daylight with no Moon there is no suggestion');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
