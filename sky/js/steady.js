// Steady mode maths. Pure functions (tested offline).
//
// A phone gives two orientation streams. The ABSOLUTE one uses the magnetic compass, so its heading wobbles with nearby metal
// and the phone's own magnetometer calibration. The RELATIVE one (plain `deviceorientation` on Android Chrome) uses the gyroscope
// only: steady, but its zero direction is arbitrary. The two differ by a turn about the vertical, so one snapshot from the compass
// can give the gyroscope its true heading, and after that the gyroscope alone keeps the sky steady.
const D2R = Math.PI / 180, R2D = 180 / Math.PI;

// The phone's three axes (X right, Y up the screen, Z out of the screen) in East-North-Up, from W3C alpha, beta, gamma (degrees).
export function deviceAxes(alpha, beta, gamma) {
  const a = alpha * D2R, b = beta * D2R, g = gamma * D2R, cA = Math.cos(a), sA = Math.sin(a), cB = Math.cos(b), sB = Math.sin(b), cG = Math.cos(g), sG = Math.sin(g);
  return [[cA * cG - sA * sB * sG, sA * cG + cA * sB * sG, -cB * sG], [-sA * cB, cA * cB, sB], [cA * sG + sA * sB * cG, sA * sG - cA * sB * cG, cB * cG]];
}
// Turn a vector about the vertical by `deg` (positive increases its compass azimuth).
export const rotYaw = (v, deg) => { const d = deg * D2R, c = Math.cos(d), s = Math.sin(d); return [v[0] * c + v[1] * s, -v[0] * s + v[1] * c, v[2]]; };

// The turn about the vertical that takes `rel` axes onto `abs` axes. Each axis votes with its horizontal length, so an axis
// pointing nearly up or down (a phone lying flat) counts for little and the estimate stays good in any pose.
export function yawBetween(abs, rel) {
  let re = 0, im = 0;
  for (let i = 0; i < 3; i++) { // z = north + i east, so arg(z) is the compass azimuth
    const za = [abs[i][1], abs[i][0]], zr = [rel[i][1], rel[i][0]];
    re += za[0] * zr[0] + za[1] * zr[1]; im += za[1] * zr[0] - za[0] * zr[1]; // za * conj(zr)
  }
  return Math.atan2(im, re) * R2D;
}
// Average of several yaw estimates (degrees) that may straddle the 360 wrap.
export function meanAngle(list) { let s = 0, c = 0; for (const a of list) { s += Math.sin(a * D2R); c += Math.cos(a * D2R); } return Math.atan2(s, c) * R2D; }
export const spread = (list, mean) => Math.max(...list.map(a => Math.abs(((a - mean + 540) % 360) - 180)));
