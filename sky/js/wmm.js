// World Magnetic Model 2025 (WMM2025): the angle between magnetic north (what a phone compass points to) and true north.
// Coefficients are NOAA/NCEI's official WMM2025.COF (epoch 2025.0, valid to 2030.0), embedded unchanged.
// Verified against NOAA's published WMM2025 test values (see Night-sky-planning notes). Public domain model.
// Declination is positive when magnetic north is EAST of true north (Hamilton is about 9 degrees WEST, so negative).
const D2R = Math.PI / 180;
const T0 = 2025.0;
// [n, m, g, h, gDot, hDot] in nanotesla and nanotesla per year
const COF = [
  [1, 0, -29351.8, 0.0, 12.0, 0.0],
  [1, 1, -1410.8, 4545.4, 9.7, -21.5],
  [2, 0, -2556.6, 0.0, -11.6, 0.0],
  [2, 1, 2951.1, -3133.6, -5.2, -27.7],
  [2, 2, 1649.3, -815.1, -8.0, -12.1],
  [3, 0, 1361.0, 0.0, -1.3, 0.0],
  [3, 1, -2404.1, -56.6, -4.2, 4.0],
  [3, 2, 1243.8, 237.5, 0.4, -0.3],
  [3, 3, 453.6, -549.5, -15.6, -4.1],
  [4, 0, 895.0, 0.0, -1.6, 0.0],
  [4, 1, 799.5, 278.6, -2.4, -1.1],
  [4, 2, 55.7, -133.9, -6.0, 4.1],
  [4, 3, -281.1, 212.0, 5.6, 1.6],
  [4, 4, 12.1, -375.6, -7.0, -4.4],
  [5, 0, -233.2, 0.0, 0.6, 0.0],
  [5, 1, 368.9, 45.4, 1.4, -0.5],
  [5, 2, 187.2, 220.2, 0.0, 2.2],
  [5, 3, -138.7, -122.9, 0.6, 0.4],
  [5, 4, -142.0, 43.0, 2.2, 1.7],
  [5, 5, 20.9, 106.1, 0.9, 1.9],
  [6, 0, 64.4, 0.0, -0.2, 0.0],
  [6, 1, 63.8, -18.4, -0.4, 0.3],
  [6, 2, 76.9, 16.8, 0.9, -1.6],
  [6, 3, -115.7, 48.8, 1.2, -0.4],
  [6, 4, -40.9, -59.8, -0.9, 0.9],
  [6, 5, 14.9, 10.9, 0.3, 0.7],
  [6, 6, -60.7, 72.7, 0.9, 0.9],
  [7, 0, 79.5, 0.0, -0.0, 0.0],
  [7, 1, -77.0, -48.9, -0.1, 0.6],
  [7, 2, -8.8, -14.4, -0.1, 0.5],
  [7, 3, 59.3, -1.0, 0.5, -0.8],
  [7, 4, 15.8, 23.4, -0.1, 0.0],
  [7, 5, 2.5, -7.4, -0.8, -1.0],
  [7, 6, -11.1, -25.1, -0.8, 0.6],
  [7, 7, 14.2, -2.3, 0.8, -0.2],
  [8, 0, 23.2, 0.0, -0.1, 0.0],
  [8, 1, 10.8, 7.1, 0.2, -0.2],
  [8, 2, -17.5, -12.6, 0.0, 0.5],
  [8, 3, 2.0, 11.4, 0.5, -0.4],
  [8, 4, -21.7, -9.7, -0.1, 0.4],
  [8, 5, 16.9, 12.7, 0.3, -0.5],
  [8, 6, 15.0, 0.7, 0.2, -0.6],
  [8, 7, -16.8, -5.2, -0.0, 0.3],
  [8, 8, 0.9, 3.9, 0.2, 0.2],
  [9, 0, 4.6, 0.0, -0.0, 0.0],
  [9, 1, 7.8, -24.8, -0.1, -0.3],
  [9, 2, 3.0, 12.2, 0.1, 0.3],
  [9, 3, -0.2, 8.3, 0.3, -0.3],
  [9, 4, -2.5, -3.3, -0.3, 0.3],
  [9, 5, -13.1, -5.2, 0.0, 0.2],
  [9, 6, 2.4, 7.2, 0.3, -0.1],
  [9, 7, 8.6, -0.6, -0.1, -0.2],
  [9, 8, -8.7, 0.8, 0.1, 0.4],
  [9, 9, -12.9, 10.0, -0.1, 0.1],
  [10, 0, -1.3, 0.0, 0.1, 0.0],
  [10, 1, -6.4, 3.3, 0.0, 0.0],
  [10, 2, 0.2, 0.0, 0.1, -0.0],
  [10, 3, 2.0, 2.4, 0.1, -0.2],
  [10, 4, -1.0, 5.3, -0.0, 0.1],
  [10, 5, -0.6, -9.1, -0.3, -0.1],
  [10, 6, -0.9, 0.4, 0.0, 0.1],
  [10, 7, 1.5, -4.2, -0.1, 0.0],
  [10, 8, 0.9, -3.8, -0.1, -0.1],
  [10, 9, -2.7, 0.9, -0.0, 0.2],
  [10, 10, -3.9, -9.1, -0.0, -0.0],
  [11, 0, 2.9, 0.0, 0.0, 0.0],
  [11, 1, -1.5, 0.0, -0.0, -0.0],
  [11, 2, -2.5, 2.9, 0.0, 0.1],
  [11, 3, 2.4, -0.6, 0.0, -0.0],
  [11, 4, -0.6, 0.2, 0.0, 0.1],
  [11, 5, -0.1, 0.5, -0.1, -0.0],
  [11, 6, -0.6, -0.3, 0.0, -0.0],
  [11, 7, -0.1, -1.2, -0.0, 0.1],
  [11, 8, 1.1, -1.7, -0.1, -0.0],
  [11, 9, -1.0, -2.9, -0.1, 0.0],
  [11, 10, -0.2, -1.8, -0.1, 0.0],
  [11, 11, 2.6, -2.3, -0.1, 0.0],
  [12, 0, -2.0, 0.0, 0.0, 0.0],
  [12, 1, -0.2, -1.3, 0.0, -0.0],
  [12, 2, 0.3, 0.7, -0.0, 0.0],
  [12, 3, 1.2, 1.0, -0.0, -0.1],
  [12, 4, -1.3, -1.4, -0.0, 0.1],
  [12, 5, 0.6, -0.0, -0.0, -0.0],
  [12, 6, 0.6, 0.6, 0.1, -0.0],
  [12, 7, 0.5, -0.1, -0.0, -0.0],
  [12, 8, -0.1, 0.8, 0.0, 0.0],
  [12, 9, -0.4, 0.1, 0.0, -0.0],
  [12, 10, -0.2, -1.0, -0.1, -0.0],
  [12, 11, -1.3, 0.1, -0.0, 0.0],
  [12, 12, -0.7, 0.2, -0.1, -0.1]
];
const A_EQ = 6378.137, F = 1 / 298.257223563, E2 = F * (2 - F), R_REF = 6371.2, NMAX = 12;

const decimalYear = d => { const y = d.getUTCFullYear(), s = Date.UTC(y, 0, 1), e = Date.UTC(y + 1, 0, 1); return y + (d - s) / (e - s); };

// All field components at a place and time. Returns { X (north), Y (east), Z (down) } in nT, plus declination D in degrees.
export function wmmField(latDeg, lonDeg, heightKm = 0, date = new Date()) {
  const lat = Math.max(-89.999, Math.min(89.999, latDeg)) * D2R, lam = lonDeg * D2R, dt = decimalYear(date) - T0;
  // geodetic to geocentric spherical
  const sl = Math.sin(lat), cl = Math.cos(lat), Rc = A_EQ / Math.sqrt(1 - E2 * sl * sl);
  const p = (Rc + heightKm) * cl, z = (Rc * (1 - E2) + heightKm) * sl, r = Math.hypot(p, z), phi = Math.asin(z / r);
  const x = Math.sin(phi), s = Math.cos(phi); // x = cos(colatitude), s = sin(colatitude)
  // unnormalised associated Legendre functions (no Condon-Shortley phase) and their derivative with respect to colatitude
  const P = [], dP = [];
  for (let n = 0; n <= NMAX; n++) { P.push(new Array(n + 1).fill(0)); dP.push(new Array(n + 1).fill(0)); }
  P[0][0] = 1;
  for (let m = 0; m <= NMAX; m++) {
    if (m > 0) { let df = 1; for (let k = 1; k <= 2 * m - 1; k += 2) df *= k; P[m][m] = df * Math.pow(s, m); }
    if (m + 1 <= NMAX) P[m + 1][m] = x * (2 * m + 1) * P[m][m];
    for (let n = m + 2; n <= NMAX; n++) P[n][m] = ((2 * n - 1) * x * P[n - 1][m] - (n + m - 1) * P[n - 2][m]) / (n - m);
  }
  for (let n = 1; n <= NMAX; n++) for (let m = 0; m <= n; m++) dP[n][m] = (n * x * P[n][m] - (n + m) * (m <= n - 1 ? P[n - 1][m] : 0)) / s; // d/dtheta = -s d/dx
  // Schmidt semi-normalisation
  const fact = k => { let f = 1; for (let i = 2; i <= k; i++) f *= i; return f; };
  const S = (n, m) => Math.sqrt((m === 0 ? 1 : 2) * fact(n - m) / fact(n + m));
  let Br = 0, Bt = 0, Bp = 0;
  const ar = R_REF / r;
  for (const [n, m, g0, h0, gd, hd] of COF) {
    const g = g0 + gd * dt, h = h0 + hd * dt, k = Math.pow(ar, n + 2), sn = S(n, m), cm = Math.cos(m * lam), sm = Math.sin(m * lam), t1 = g * cm + h * sm;
    Br += k * (n + 1) * t1 * sn * P[n][m];
    Bt += k * t1 * sn * dP[n][m];
    Bp += k * m * (g * sm - h * cm) * sn * P[n][m];
  }
  Bt = -Bt; Bp = Bp / s; // field components along theta (south) and phi (east), then flip to north/east/down
  const Xg = -Bt, Yg = Bp, Zg = -Br, psi = phi - lat; // geocentric north, east, down; rotate to geodetic
  const X = Xg * Math.cos(psi) - Zg * Math.sin(psi), Z = Xg * Math.sin(psi) + Zg * Math.cos(psi);
  return { X, Y: Yg, Z, D: Math.atan2(Yg, X) / D2R };
}
export const declination = (latDeg, lonDeg, heightKm = 0, date = new Date()) => wmmField(latDeg, lonDeg, heightKm, date).D;
