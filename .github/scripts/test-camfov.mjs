// Offline tests for sky/js/camfov.js. Run: node .github/scripts/test-camfov.mjs
import { cameraOverlayFov, visibleAngles, eyeViewFov, DEFAULT_CAM_LONG_DEG } from '../../sky/js/camfov.js';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL', m)); console.log(c ? 'ok  ' : 'FAIL', m); };
const D2R = Math.PI / 180, near = (a, b, tol) => Math.abs(a - b) <= tol;
// 1. the overlay must place a point exactly where the camera picture shows it, for several shapes
for (const [name, vw, vh, W, H, longDeg] of [['portrait 4:3 video, tall screen', 480, 640, 411, 700, 72], ['portrait 16:9 video, tall screen', 360, 640, 411, 700, 72], ['landscape 4:3 video, wide screen', 640, 480, 800, 411, 72], ['portrait 4:3 video, screen same shape', 480, 640, 360, 480, 65], ['desktop webcam', 1280, 720, 1000, 600, 70]]) {
  const fov = cameraOverlayFov(vw, vh, W, H, longDeg), F = (Math.min(W, H) / 2) / Math.tan(fov * D2R / 2), fVideo = (Math.max(vw, vh) / 2) / Math.tan(longDeg * D2R / 2), scale = Math.max(W / vw, H / vh);
  let worst = 0; for (const t of [2, 8, 15, 22]) { const overlay = F * Math.tan(t * D2R), camera = scale * fVideo * Math.tan(t * D2R); worst = Math.max(worst, Math.abs(overlay - camera)); }
  ok(worst < 1e-6, `${name}: overlay and camera agree at 2, 8, 15 and 22 degrees (worst ${worst.toExponential(1)} px) fov=${fov.toFixed(1)}`);
}
// 2. the case that was wrong: a portrait phone with a 4:3 picture and the old fixed 62 degrees
const right = cameraOverlayFov(480, 640, 411, 700, DEFAULT_CAM_LONG_DEG);
ok(right > 40 && right < 52, `a portrait phone should use about 46 degrees across, not 62 (got ${right.toFixed(1)})`);
const va = visibleAngles(right, 411, 700); ok(near(va.along, 70, 4) && near(va.across, right, .01), `visible along the long side about 70 degrees (got ${va.along.toFixed(1)})`);
// 3. cover geometry: when the canvas is exactly the picture's shape nothing is cropped, so the short side keeps its own angle
const exact = cameraOverlayFov(480, 640, 360, 480, 72), shortOfCam = 2 * Math.atan(Math.tan(36 * D2R) * 480 / 640) / D2R;
ok(near(exact, shortOfCam, .01), `no crop: short side ${exact.toFixed(2)} = ${shortOfCam.toFixed(2)}`);
// 4. a narrower camera (smaller long angle) must give a larger focal length, so a smaller overlay fov
ok(cameraOverlayFov(480, 640, 411, 700, 60) < cameraOverlayFov(480, 640, 411, 700, 80), 'a wider camera needs a wider overlay field of view');
ok(cameraOverlayFov(0, 0, 411, 700) === null, 'no video size yet returns null instead of a wrong number');
// 5. eye view: Galaxy S23 is 411 CSS px wide, about 65 mm; at half an arm's length about 11-12 degrees
const eye = eyeViewFov(411); ok(near(eye, 11.4, .5), `eye view for a 411 px wide screen at 325 mm is about 11.4 degrees (got ${eye.toFixed(2)})`);
ok(near(eyeViewFov(411, 300), 12.4, .5), `closer (300 mm) is wider (${eyeViewFov(411, 300).toFixed(2)})`);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
