// Snap: freeze the camera view with the sky overlay on top, add a note and a time/place stamp, then share or save it.
// The picture is built on a canvas in natural colours (the red and green themes only tint the on-screen preview).
import { state, now, compass, fmtTime, toast, $ } from './util.js';

// video + overlay canvases -> one canvas, laid out exactly as on screen (the video is drawn like object-fit: cover)
export function composeFrame({ video, overlays, W, H, scale = 2 }) {
  const c = document.createElement('canvas'); c.width = Math.round(W * scale); c.height = Math.round(H * scale);
  const g = c.getContext('2d'); g.scale(scale, scale);
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const vw = video?.videoWidth || video?.width, vh = video?.videoHeight || video?.height; // a video element, or any image or canvas
  if (vw && vh) { const s = Math.max(W / vw, H / vh), dw = vw * s, dh = vh * s; g.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh); }
  for (const o of overlays) if (o && o.width && o.height) g.drawImage(o, 0, 0, W, H);
  return c;
}

// a readable strip at the bottom: the note, where and when, and which way the phone was facing
export function stamp(src, { caption = '', lines = [] } = {}) {
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const g = c.getContext('2d'); g.drawImage(src, 0, 0);
  const pad = Math.round(c.width * .035), fs = Math.round(c.width * .036), all = [caption, ...lines].filter(Boolean), h = pad * 1.4 + all.length * fs * 1.35;
  g.fillStyle = 'rgba(0,0,0,.62)'; g.fillRect(0, c.height - h, c.width, h);
  g.fillStyle = '#fff'; g.textBaseline = 'top'; let y = c.height - h + pad * .7;
  all.forEach((t, i) => { g.font = `${i === 0 && caption ? 700 : 500} ${i === 0 && caption ? Math.round(fs * 1.15) : fs}px system-ui, sans-serif`; g.fillText(t, pad, y); y += fs * 1.35; });
  return c;
}
export const blobOf = canvas => new Promise(r => canvas.toBlob(r, 'image/jpeg', .92));

// Open the frozen view. getState() supplies the current direction and selected object for the stamp.
export function initSnap({ capture, info }) {
  const view = $('#snapView'), img = $('#snapImg'), cap = $('#snapCaption'); if (!view) return null;
  let raw = null, url = null, t = 0;
  const lines = () => { const i = info(); return [`${state.name} · ${fmtTime(now(), true)}`, `Facing ${compass(i.az)} ${Math.round(i.az)}°, ${Math.round(i.alt)}° up${i.selected ? ' · ' + i.selected : ''} · Night Sky`]; };
  const render = async () => { const b = await blobOf(stamp(raw, { caption: cap.value.trim(), lines: lines() })); if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(b); img.src = url; return b; };
  const open = async () => { raw = capture(); if (!raw) { toast('Nothing to capture yet. Turn the camera on first.'); return; } cap.value = ''; view.hidden = false; await render(); };
  const close = () => { view.hidden = true; if (url) { URL.revokeObjectURL(url); url = null; } img.removeAttribute('src'); raw = null; };
  cap.oninput = () => { clearTimeout(t); t = setTimeout(render, 250); };
  $('#snapBack').onclick = close;
  $('#snapSave').onclick = async () => { const b = await render(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `night-sky-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.jpg`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Saved to your downloads'); };
  $('#snapShare').onclick = async () => {
    const b = await render(), file = new File([b], 'night-sky.jpg', { type: 'image/jpeg' });
    try { if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Night Sky', text: cap.value.trim() || 'What I saw tonight' }); else { $('#snapSave').click(); toast('Sharing is not available here, so it was saved instead'); } }
    catch (e) { if (e?.name !== 'AbortError') toast('Could not share. Try Save instead.'); }
  };
  return { open, close };
}
