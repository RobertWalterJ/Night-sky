// Offline tests for sky/js/steady.js. Run: node .github/scripts/test-steady.mjs
import { deviceAxes, rotYaw, yawBetween, meanAngle, spread } from '../../sky/js/steady.js';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL', m)); console.log(c ? 'ok  ' : 'FAIL', m); };
const R2D = 180 / Math.PI, wrap = a => ((a % 360) + 540) % 360 - 180, near = (a, b, t) => Math.abs(wrap(a - b)) <= t;
const az = v => (Math.atan2(v[0], v[1]) * R2D + 360) % 360, alt = v => Math.asin(v[2]) * R2D;
// the axes formula: an upright phone tilted back, camera at azimuth 182 and 38 degrees up
const ax = deviceAxes(178, 128, 0), cam = ax[2].map(c => -c);
ok(near(az(cam), 182, .01) && Math.abs(alt(cam) - 38) < .01, `camera direction from alpha 178, beta 128: az ${az(cam).toFixed(2)}, alt ${alt(cam).toFixed(2)}`);
ok(near(az(rotYaw([0, 1, 0], 30)), 30, 1e-9) && near(az(rotYaw([0, 1, 0], -45)), 315, 1e-9), 'rotYaw turns the azimuth by the given amount (positive = clockwise)');
// recover a known yaw between the two frames, across many poses including flat, upright, rolled and upside-down-ish
let worst = 0, n = 0;
for (const theta of [-170, -90, -12, 0, 9.76, 25, 90, 175]) for (const [al, be, ga] of [[10, 90, 0], [200, 128, -15], [300, 0, 0], [45, 30, 10], [120, 150, 25], [350, 170, -30], [80, 60, -60]]) {
  const abs = deviceAxes(al, be, ga), rel = abs.map(v => rotYaw(v, -theta)), est = yawBetween(abs, rel); worst = Math.max(worst, Math.abs(wrap(est - theta))); n++;
}
ok(worst < 1e-6, `recovers a known yaw in ${n} poses (worst error ${worst.toExponential(1)} deg)`);
// noise: a real compass reading is a few degrees off in places; the mean of 8 noisy samples should still be close
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - .5;
const theta = 41, est = []; for (let i = 0; i < 8; i++) { const abs = deviceAxes(200 + rnd() * 4, 120 + rnd() * 4, rnd() * 4), rel = deviceAxes(0, 0, 0).map((_, k) => rotYaw(abs[k], -theta)); est.push(yawBetween(abs.map(v => rotYaw(v, rnd() * 3)), rel)); }
const m = meanAngle(est); ok(near(m, theta, 2), `with 3 degree compass noise the mean of 8 samples is within 2 degrees (got ${m.toFixed(2)})`);
ok(near(meanAngle([179, -179, 178, -178]), 180, 1.5), 'averaging angles across the 180 wrap works');
ok(spread([40, 41, 42], 41) <= 1.0001, 'spread reports the widest gap from the mean');
// the full idea: the phone moves, the gyroscope frame follows it, and the corrected heading stays right while the compass wobbles
const trueAz = 182, yaw0 = 33; // relative frame is 33 degrees off the true frame
const relAt = (a, b, g) => deviceAxes(a, b, g).map(v => rotYaw(v, -yaw0));       // what the gyroscope reports
const startAbs = deviceAxes(178, 128, 0), startRel = relAt(178, 128, 0), cal = yawBetween(startAbs, startRel);
ok(near(cal, yaw0, .01), `calibration recovers the frame difference (${cal.toFixed(2)})`);
let maxErr = 0; for (const turn of [0, 20, -35, 60, -90, 130]) { const a = 178 - turn; const gyro = relAt(a, 128, 0), world = rotYaw(gyro[2].map(c => -c), cal); const expect = trueAz + turn; maxErr = Math.max(maxErr, Math.abs(wrap(az(world) - expect))); }
ok(maxErr < 1e-6, `after turning the phone by 20, -35, 60, -90 and 130 degrees the gyroscope-based heading stays exact (error ${maxErr.toExponential(1)})`);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
