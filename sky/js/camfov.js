// Field-of-view geometry for the camera view and the "match my eyes" view. Pure functions, tested in Node.
//
// The sky chart projects with one focal length F (in screen pixels): a point at angle t from the centre lands F * tan(t)
// from the centre, and V.fov is defined across the SHORTER side of the canvas, so  F = (min(W, H) / 2) / tan(fov / 2).
// The camera picture is drawn with object-fit: cover, so it is scaled until it fills the canvas and the extra is cropped.
// Cameras are specified along the picture's LONG side (that side keeps its angle when a 16:9 crop trims the short one).
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
export const DEFAULT_CAM_LONG_DEG = 72; // Galaxy S23 main camera is about 85 degrees across the diagonal, so about 72 along the long side of a 4:3 picture

// V.fov to use for the overlay so that sky markers sit exactly on what the camera sees.
//  vw, vh: video size in pixels (as displayed); W, H: canvas size in CSS pixels; longDeg: camera angle along the long side.
export function cameraOverlayFov(vw, vh, W, H, longDeg = DEFAULT_CAM_LONG_DEG) {
  if (!vw || !vh || !W || !H) return null;
  const fVideo = (Math.max(vw, vh) / 2) / Math.tan(longDeg * D2R / 2); // focal length in video pixels
  const scale = Math.max(W / vw, H / vh);                              // object-fit: cover
  const f = fVideo * scale;                                            // focal length in screen pixels
  return 2 * Math.atan((Math.min(W, H) / 2) / f) * R2D;
}
// Visible angle across and along the canvas for a given focal length: handy for the on-screen explanation.
export function visibleAngles(fovShortDeg, W, H) {
  const f = (Math.min(W, H) / 2) / Math.tan(fovShortDeg * D2R / 2), span = px => 2 * Math.atan((px / 2) / f) * R2D;
  return { across: span(W), along: span(H) };
}
// "Match my eyes": the angle the phone screen covers when held at a normal distance, as if it were a window.
// Android CSS pixels are about 160 per inch, so the screen width in millimetres is roughly cssWidth / 160 * 25.4.
export function eyeViewFov(cssShortSide, distMm = 325) {
  const mm = cssShortSide / 160 * 25.4;
  return 2 * Math.atan((mm / 2) / distMm) * R2D;
}
