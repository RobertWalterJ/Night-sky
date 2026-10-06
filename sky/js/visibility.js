// App wrapper for the pure "can I see it?" logic in visibility-core.js: fills in the sky limit and the Sun's height.
import { now, fmtTime } from './util.js';
import { nelm, sunAlt, sunAltCross } from './astro.js';
import { canSee, pickAlignTarget, airMass } from './visibility-core.js';
export { canSee, pickAlignTarget, airMass };

export function skyNow(t = now()) {
  const lim = nelm(t), sa = sunAlt(t); let nextDark = null;
  if (sa > -9) { try { const d = sunAltCross(-12, -1, t); if (d && d > t && d - t < 10 * 3600e3) nextDark = fmtTime(d); } catch { } }
  return { lim, sunAlt: sa, nextDark };
}
export const visibilityNow = (o, t = now()) => canSee(o, skyNow(t));
