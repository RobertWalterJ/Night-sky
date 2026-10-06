// Offline tests for sky/js/autoalign.js. Run: node .github/scripts/test-autoalign.mjs
import { findBlobs, pickBlob, headingCorrection, wrapDeg, azOf, altOf } from '../../sky/js/autoalign.js';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL', m)); console.log(c ? 'ok  ' : 'FAIL', m); };
const D = Math.PI / 180, near = (a, b, t) => Math.abs(a - b) <= t;
ok(wrapDeg(190) === -170 && wrapDeg(-190) === 170 && wrapDeg(10) === 10, 'wrapDeg keeps angles within -180..180');
// synthetic frame: sky-blue background, a saturated Sun disc, and a bright white wall that is NOT saturated
const W = 96, H = 160, img = new Uint8ClampedArray(W * H * 4);
const put = (x, y, r, g, b) => { const i = (y * W + x) * 4; img[i] = r; img[i + 1] = g; img[i + 2] = b; img[i + 3] = 255; };
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, 40, 100, 200);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const d = Math.hypot(x - 25, y - 80); if (d < 7) put(x, y, 255, 255, 250); else if (d < 11) put(x, y, 230, 235, 245); }
for (let y = 90; y < 150; y++) for (let x = 78; x < 96; x++) put(x, y, 236, 236, 236); // the wall
const blobs = findBlobs(img, W, H); const sun = pickBlob(blobs, [30, 78]);
ok(blobs.length >= 1 && sun && near(sun.blob.x, 25, .6) && near(sun.blob.y, 80, .6), `finds the Sun glare centre (got ${sun?.blob.x.toFixed(1)}, ${sun?.blob.y.toFixed(1)})`);
ok(!pickBlob(findBlobs(img, W, H, { minPeak: 240 }), [30, 78]) || near(pickBlob(findBlobs(img, W, H, { minPeak: 240 }), [30, 78]).blob.x, 25, .6), 'a stricter threshold ignores the unsaturated wall');
const dark = new Uint8ClampedArray(W * H * 4).fill(30); for (let i = 3; i < dark.length; i += 4) dark[i] = 255;
ok(findBlobs(dark, W, H).length === 0, 'a dark frame has no blob (nothing to align on)');
// the whole chain, using the same camera maths as the sky view
const proj = (B, v, F, cx, cy) => { const x = v[0] * B.r[0] + v[1] * B.r[1] + v[2] * B.r[2], y = v[0] * B.u[0] + v[1] * B.u[1] + v[2] * B.u[2], z = v[0] * B.f[0] + v[1] * B.f[1] + v[2] * B.f[2]; return [cx + F * x / z, cy - F * y / z]; };
const unproj = (B, sx, sy, F, cx, cy) => { const x = (sx - cx) / F, y = -(sy - cy) / F, a = [0, 1, 2].map(i => B.r[i] * x + B.u[i] * y + B.f[i]); const l = Math.hypot(...a); return a.map(c => c / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const basis = (az, alt) => { const f = [Math.sin(az * D) * Math.cos(alt * D), Math.cos(az * D) * Math.cos(alt * D), Math.sin(alt * D)], r = [Math.cos(az * D), -Math.sin(az * D), 0]; return { f, r, u: cross(r, f) }; };
const vec = (az, alt) => [Math.sin(az * D) * Math.cos(alt * D), Math.cos(az * D) * Math.cos(alt * D), Math.sin(alt * D)];
for (const [name, headingErr, sunAz, sunAlt, phoneAz, phoneAlt] of [['your photo: app heading 12 degrees too small', -12, 165, 39, 175, 41], ['heading 9.76 too small (double declination)', -9.76, 165, 39, 170, 40], ['heading 7 too large', 7, 200, 25, 190, 30], ['Moon low, large error', -20, 95, 18, 100, 22]]) {
  const F = 400, cx = 192, cy = 330, trueB = basis(phoneAz, phoneAlt), appB = basis(phoneAz + headingErr, phoneAlt), p = vec(sunAz, sunAlt);
  const px = proj(trueB, p, F, cx, cy);                  // where the camera really sees the Sun
  const dWorld = unproj(appB, px[0], px[1], F, cx, cy);  // where the app thinks that pixel points
  const c = headingCorrection(p, dWorld);
  ok(near(c.yaw, -headingErr, .35), `${name}: recovers a ${(-headingErr).toFixed(2)} degree correction (got ${c.yaw.toFixed(2)}), leftover height error ${c.pitch.toFixed(2)}`);
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
