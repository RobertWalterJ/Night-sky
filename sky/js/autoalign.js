// Align from the camera picture: find the Sun or Moon as the brightest blob in the frame, compare it with where the
// sky model says it should be, and turn the difference into a compass heading correction. Pure functions (tested offline).
//
// Why a heading correction: phone compasses can be off by 10 degrees or more (magnetic vs true north, nearby metal, drift),
// but the phone's tilt sensors are good. The Sun and Moon are bright and their true positions are known, so the picture
// can measure the heading error directly, whatever its cause.

export const wrapDeg = a => ((a % 360) + 540) % 360 - 180;   // into -180..180
export const azOf = ([e, n]) => (Math.atan2(e, n) * 180 / Math.PI + 360) % 360;
export const altOf = ([, , u]) => Math.asin(Math.max(-1, Math.min(1, u))) * 180 / Math.PI;

// rgba: Uint8ClampedArray of a small frame (w x h). Returns bright connected blobs, biggest first:
// { x, y (centroid, in frame pixels), area, peak }.  Only pixels at or near the frame's brightest are used.
export function findBlobs(rgba, w, h, { minPeak = 225, minArea = 6, maxBlobs = 6 } = {}) {
  const lum = new Float32Array(w * h); let peak = 0;
  for (let i = 0; i < w * h; i++) { const l = .299 * rgba[i * 4] + .587 * rgba[i * 4 + 1] + .114 * rgba[i * 4 + 2]; lum[i] = l; if (l > peak) peak = l; }
  if (peak < minPeak) return [];
  const thr = Math.max(minPeak, peak - 14), seen = new Uint8Array(w * h), out = [];
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || lum[s] < thr) continue;
    let sx = 0, sy = 0, n = 0, pk = 0; const stack = [s]; seen[s] = 1;
    while (stack.length) {
      const p = stack.pop(), x = p % w, y = (p / w) | 0; sx += x; sy += y; n++; if (lum[p] > pk) pk = lum[p];
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) if (q >= 0 && !seen[q] && lum[q] >= thr) { seen[q] = 1; stack.push(q); }
    }
    if (n >= minArea) out.push({ x: sx / n, y: sy / n, area: n, peak: pk });
  }
  return out.sort((a, b) => b.area - a.area).slice(0, maxBlobs);
}

// Choose the blob that is the target: the one nearest where the target is predicted to be (frame pixels).
export function pickBlob(blobs, predicted) {
  if (!blobs.length) return null;
  let best = null, bd = Infinity;
  for (const b of blobs) { const d = Math.hypot(b.x - predicted[0], b.y - predicted[1]); if (d < bd) { bd = d; best = b; } }
  return { blob: best, distPx: bd };
}

// trueVec: where the sky model says the target is (east, north, up). detectedVec: where the picture says it is, using the
// phone's current (possibly mis-headed) orientation. Returns the heading correction to ADD to the compass offset, in degrees,
// plus the leftover height error (informational: tilt sensors are normally good).
export function headingCorrection(trueVec, detectedVec) {
  return { yaw: wrapDeg(azOf(trueVec) - azOf(detectedVec)), pitch: altOf(trueVec) - altOf(detectedVec) };
}
