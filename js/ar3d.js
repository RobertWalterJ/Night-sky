// 3D overlay: draws the Blender models (GLB) at the exact screen positions the 2D sky chart computed,
// lit from the real direction of the Sun so the Moon and planets show their true phase.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MODELS = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'iss', 'hubble', 'satellite', 'earth'];
// yaw so the textured "front" (longitude 0 / Moon's near side) faces the viewer
export const YAW = { moon: -Math.PI / 2, earth: -Math.PI / 2 };
const cache = {}, wraps = {};
let renderer, scene, cam, sun, amb, canvas;
const loader = new GLTFLoader();

export function loadModel(name) {
  if (!cache[name]) cache[name] = new Promise((res, rej) => loader.load(`models/${name}.glb`, g => res(g.scene), undefined, rej));
  return cache[name];
}
const loaded = {};
export const has = n => !!loaded[n];
MODELS.forEach(n => loadModel(n).then(s => { loaded[n] = s; }).catch(() => { }));

export function init(cv, W, H, DPR) {
  canvas = cv;
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  amb = new THREE.AmbientLight(0xffffff, 0.06); scene.add(amb);
  sun = new THREE.DirectionalLight(0xffffff, 3.2); scene.add(sun); scene.add(sun.target);
  resize(W, H, DPR);
}
export function resize(W, H, DPR) {
  if (!renderer) return;
  renderer.setPixelRatio(DPR); renderer.setSize(W, H, false);
  cam = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 0.1, 2000); cam.position.z = 1000;
}
export function clear() { renderer?.clear(); }

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normz = a => { const l = Math.hypot(...a) || 1; return a.map(c => c / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function render(models, B, fov, W, H, sunV, project) {
  if (!renderer) return;
  renderer.autoClear = false; renderer.clear();
  for (const m of models) {
    const name = m.model || ({ Sun: 'sun', Moon: 'moon' }[m.name]) || m.name.toLowerCase();
    const src = loaded[name]; if (!src) continue;
    if (!wraps[name]) { const w = new THREE.Group(); const c = src.clone(); c.rotation.y = YAW[name] || 0; w.add(c); wraps[name] = w; }
    const obj = wraps[name];
    scene.add(obj);
    const size = name === 'iss' ? m.px / 1.1 : name === 'hubble' || name === 'satellite' ? m.px / 1.6 : m.px / 2;
    obj.scale.setScalar(size);
    obj.position.set(m.sx - W / 2, H / 2 - m.sy, 0);
    const v = m.v;
    // per-object view frame: z toward viewer, y = screen-up made perpendicular to line of sight
    const z = v.map(c => -c), y = normz(B.u.map((c, i) => c - dot(B.u, v) * v[i])), x = cross(y, z);
    const sl = [dot(sunV, x), dot(sunV, y), dot(sunV, z)];
    sun.position.set(obj.position.x + sl[0] * 500, obj.position.y + sl[1] * 500, sl[2] * 500);
    sun.target.position.copy(obj.position);
    sun.intensity = name === 'sun' ? 0 : 3.2;
    amb.intensity = name === 'sun' ? 1.5 : 0.05;
    if (name === 'iss' || name === 'hubble' || name === 'satellite') obj.rotation.set(0.6, performance.now() / 4000, 0.2);
    else obj.rotation.set(0, 0, 0);
    renderer.render(scene, cam);
    scene.remove(obj);
  }
}

// Standalone viewer for the info sheet
let viewer = null;
export async function showModel(cvs, name, opts = {}) {
  const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
  if (!viewer || viewer.canvas !== cvs) {
    const r = new THREE.WebGLRenderer({ canvas: cvs, alpha: true, antialias: true });
    r.outputColorSpace = THREE.SRGBColorSpace;
    const sc = new THREE.Scene(), c = new THREE.PerspectiveCamera(35, 1, .1, 100);
    c.position.set(0, 0.6, 5.2);
    const l = new THREE.DirectionalLight(0xffffff, 3); l.position.set(-4, 2, 3); sc.add(l); sc.add(new THREE.AmbientLight(0xffffff, .12));
    const ctl = new OrbitControls(c, cvs); ctl.enableDamping = true; ctl.autoRotate = true; ctl.autoRotateSpeed = 1.2; ctl.enablePan = false; ctl.minDistance = 2; ctl.maxDistance = 12;
    viewer = { canvas: cvs, r, sc, c, l, ctl, obj: null, raf: 0 };
  }
  const v = viewer;
  if (v.obj) v.sc.remove(v.obj);
  const src = await loadModel(name);
  const o = src.clone(); o.rotation.y = YAW[name] || 0;
  const box = new THREE.Box3().setFromObject(o), s = 2.2 / Math.max(...box.getSize(new THREE.Vector3()).toArray());
  const g = new THREE.Group(); g.add(o); g.scale.setScalar(s); v.obj = g; v.sc.add(g);
  if (name === 'sun') { v.l.intensity = 0; } else { v.l.intensity = 3; }
  // phase-accurate lighting for the Moon: light comes from the Sun's side
  if (opts.phaseAngle != null) { const a = opts.phaseAngle * Math.PI / 180; v.l.position.set(Math.sin(a) * 5, 0.5, -Math.cos(a) * 5); }
  else v.l.position.set(-4, 2, 3);
  cancelAnimationFrame(v.raf);
  const loop = () => {
    const w = cvs.clientWidth, h = cvs.clientHeight;
    if (cvs.width !== w * devicePixelRatio) { v.r.setPixelRatio(devicePixelRatio); v.r.setSize(w, h, false); v.c.aspect = w / h; v.c.updateProjectionMatrix(); }
    v.ctl.update(); v.r.render(v.sc, v.c); v.raf = requestAnimationFrame(loop);
  };
  loop();
}
export function stopViewer() { if (viewer) cancelAnimationFrame(viewer.raf); }
