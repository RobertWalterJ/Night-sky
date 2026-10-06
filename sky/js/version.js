// What version of Night Sky is this? Settings shows these, and checks the phone is running the latest files.
// BUILD must equal the cache name in sw.js; `node .github/scripts/bump.mjs <version> "<note>"` keeps them in step
// (and a check blocks a push if they drift apart).
export const APP_VERSION = '1.1.1';
export const BUILD = 'v5-40';
// Newest first. Plain language: this is what you read in Settings > What's new.
export const CHANGELOG = [
  { v: '1.1.1', date: '2026-10-06', notes: ["Sun diagnostic in the menu: a 3 minute test that measures heading and camera scale and gives you results to paste to Claude"] },
  { v: '1.1.0', date: '2026-10-06', notes: ["Sun lock: with the camera on and the Sun in view, the app keeps the Sun marker on the real Sun while you turn, so drift is corrected automatically (switch and log in the Fit panel)"] },
  { v: '1.0.0', date: '2026-10-06', notes: ["Steady gyroscope mode: tap Compass at the top of the Sky view to switch. It follows the phone's gyroscope instead of the magnetic compass, so the sky stays put as you turn", "Version number and What's new in Settings, with a check that tells you if a newer build is available", "Moon visibility now accounts for phase and distance from the Sun, and Align no longer suggests an invisible Moon", "Align from the camera picture: put the Sun or Moon in the camera view and tap Align", "Snap stamps record the moment of the photo"] },
  { v: '0.9.0', date: '2026-10-05', notes: ['Camera view uses the camera\'s real field of view, with a Fit slider and an Eyes view', 'Snap: freeze the camera view, add a note, share or save', 'Can I see it? verdicts and a guided Align', 'True-north compass correction, data prefetch, satellite profile and orbit-loading fixes'] },
  { v: '0.8.0', date: '2026-10-04', notes: ['Sky Sound and the Listen tab, with a live map and retro mission tones', 'Point-and-find guidance and a Pointing-at card', 'Menu, five bottom tabs, clearer satellites on Earth'] },
];
