// Live 3D Earth: day/night terminator, city lights, thousands of tracked satellites,
// your horizon footprint, ride-along and satellite's-eye cameras.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { $, $$, state, store, now, on, emit, esc, fmtTime, compass, toast, D2R, R2D, clamp } from './util.js';
import { sats, loadGroup } from './sats.js';
import { loadModel } from './ar3d.js';
import { profile, modelFor } from './satinfo.js';
import { cat } from './astro.js';
const S = window.satellite, A = window.Astronomy, RE = 6371;

const GROUPS = [
  ['stations', 'Space stations', 0xffd23c, true], ['visual', 'Brightest', 0xffffff, true], ['starlink', 'Starlink', 0xff5fb5, false],
  ['oneweb', 'OneWeb', 0xff9a2e, false], ['gnss', 'Navigation (GPS etc.)', 0x8dff4a, true], ['geo', 'Geostationary', 0xff5547, true],
  ['weather', 'Weather', 0xf2ff5c, true], ['resource', 'Earth observation', 0xc9ff9a, true], ['science', 'Science', 0xff8cf0, true],
  ['amateur', 'Amateur radio', 0xffb08a, false], ['cubesat', 'CubeSats', 0xe0e0e0, false],
];
const groupOn = store.get('globeGroups', Object.fromEntries(GROUPS.map(g => [g[0], g[3] || (g[0] === 'starlink' && matchMedia('(min-width: 1000px)').matches)])));

let renderer, scene, camera, controls, earth, clouds, atmo, stars, pts, ptsGeo, hiPts, hiGeo, selPt, selGeo, follow = false, sel = null, selModel = null, orbitLine = null, trackLine = null, me = null, ring = null;
let list = [], cursor = 0, active = false, mode = 'globe', speed = 1, lastT = 0, lastEmit = 0, labels = {}, raycaster = new THREE.Raycaster();
const up = new THREE.Vector3(0, 1, 0);

// ECEF (km) -> scene (Earth radius = 1, Y = north, lon 0 = +X, lon 90E = -Z)
const toScene = (x, y, z, out = new THREE.Vector3()) => out.set(x / RE, z / RE, -y / RE);
function geoToScene(lat, lon, r = 1) { const la = lat * D2R, lo = lon * D2R; return new THREE.Vector3(Math.cos(la) * Math.cos(lo) * r, Math.sin(la) * r, -Math.cos(la) * Math.sin(lo) * r); }
function sunScene(t) {
  const eq = A.Equator('Sun', t, new A.Observer(0, 0, 0), true, true), lon = (eq.ra - A.SiderealTime(t)) * 15;
  return geoToScene(eq.dec, lon).normalize();
}
function ecef(sat, t) {
  const pv = S.propagate(sat.rec, t); if (!pv?.position || isNaN(pv.position.x)) return null;
  return S.eciToEcf(pv.position, S.gstime(t));
}

export function initEarth() {
  const cv = $('#globeCanvas');
  renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, 1, .0005, 200);
  camera.position.set(0, 1.2, 3.2);
  controls = new OrbitControls(camera, cv); controls.enableDamping = true; controls.minDistance = 1.08; controls.maxDistance = 14; controls.enablePan = false; controls.rotateSpeed = .5;
  const tl = new THREE.TextureLoader();
  const day = tl.load('textures/earth_day.jpg'), night = tl.load('textures/earth_night.jpg'), spec = tl.load('textures/earth_spec.jpg');
  for (const t of [day, night, spec]) t.anisotropy = 4;
  earth = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), new THREE.ShaderMaterial({
    uniforms: { dayMap: { value: day }, nightMap: { value: night }, specMap: { value: spec }, sunDir: { value: new THREE.Vector3(1, 0, 0) } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vP; void main(){ vUv=uv; vN=normalize((modelMatrix*vec4(normal,0.)).xyz); vec4 w=modelMatrix*vec4(position,1.); vP=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform sampler2D dayMap, nightMap, specMap; uniform vec3 sunDir; varying vec2 vUv; varying vec3 vN; varying vec3 vP;
      void main(){ vec3 n=normalize(vN); float d=dot(n,sunDir); float k=smoothstep(-.15,.12,d);
        vec3 day=texture2D(dayMap,vUv).rgb; float lights=texture2D(nightMap,vUv).r;
        vec3 nightC=vec3(1.,.74,.42)*pow(lights,1.4)*1.5 + day*.035;
        vec3 dayC=day*(.18+.95*max(d,0.));
        vec3 V=normalize(cameraPosition-vP); vec3 H=normalize(sunDir+V);
        float sp=pow(max(dot(n,H),0.),48.)*texture2D(specMap,vUv).r*k;
        vec3 c=mix(nightC,dayC,k)+vec3(1.,.93,.8)*sp*.55;
        float tw=max(0.,1.-abs(d+.03)*9.); c+=vec3(1.,.42,.12)*tw*.18;
        float rim=pow(1.-max(dot(n,V),0.),3.); c+=vec3(.3,.55,1.)*rim*(.12+.55*k);
        gl_FragColor=vec4(c,1.); }`,
  }));
  scene.add(earth);
  const cl = tl.load('textures/earth_clouds.png');
  clouds = new THREE.Mesh(new THREE.SphereGeometry(1.006, 96, 48), new THREE.ShaderMaterial({
    uniforms: { map: { value: cl }, sunDir: earth.material.uniforms.sunDir }, transparent: true, depthWrite: false,
    vertexShader: `varying vec2 vUv; varying vec3 vN; void main(){ vUv=uv; vN=normalize((modelMatrix*vec4(normal,0.)).xyz); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 sunDir; varying vec2 vUv; varying vec3 vN; void main(){ float a=texture2D(map,vUv).a; float d=dot(normalize(vN),sunDir); float k=smoothstep(-.1,.2,d); gl_FragColor=vec4(vec3(.95)*(.06+.94*k),a*(.15+.65*k)); }`,
  }));
  scene.add(clouds);
  atmo = new THREE.Mesh(new THREE.SphereGeometry(1.07, 64, 32), new THREE.ShaderMaterial({
    uniforms: { sunDir: earth.material.uniforms.sunDir }, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vN; varying vec3 vP; void main(){ vN=normalize((modelMatrix*vec4(normal,0.)).xyz); vP=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*viewMatrix*vec4(vP,1.); }`,
    fragmentShader: `uniform vec3 sunDir; varying vec3 vN; varying vec3 vP; void main(){ vec3 V=normalize(cameraPosition-vP); float i=pow(max(0.,.72-dot(-vN,V)),2.6)*2.2; float lit=.25+.75*smoothstep(-.3,.3,dot(normalize(vP),sunDir)); gl_FragColor=vec4(vec3(.35,.6,1.)*i*lit,1.); }`,
  }));
  scene.add(atmo);
  // starfield (rotated to the sidereal frame each frame)
  stars = new THREE.Group(); scene.add(stars);
  const addStars = () => {
    if (!cat.ready || stars.children.length) return;
    const pos = [], col = [];
    for (let i = 0; i < cat.n; i++) { const r = 80; pos.push(cat.vec[i * 3] * r, cat.vec[i * 3 + 2] * r, -cat.vec[i * 3 + 1] * r); const b = clamp(1.2 - cat.mag[i] / 6.5, .15, 1); col.push(b, b, b * 1.05); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    stars.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: .9 })));
  };
  addStars(); setTimeout(addStars, 2000);
  // round sprite for satellite points
  const sc = document.createElement('canvas'); sc.width = sc.height = 64; const sx = sc.getContext('2d');
  sx.fillStyle = 'rgba(0,0,0,.85)'; sx.beginPath(); sx.arc(32, 32, 30, 0, 7); sx.fill(); sx.fillStyle = '#fff'; sx.beginPath(); sx.arc(32, 32, 20, 0, 7); sx.fill(); // white core takes the group colour, black rim separates it from anything behind
  const dot = new THREE.CanvasTexture(sc);
  ptsGeo = new THREE.BufferGeometry();
  pts = new THREE.Points(ptsGeo, new THREE.PointsMaterial({ size: 7, sizeAttenuation: false, vertexColors: true, map: dot, transparent: true, depthWrite: false, alphaTest: .02 }));
  pts.frustumCulled = false; scene.add(pts);
  hiGeo = new THREE.BufferGeometry();
  hiPts = new THREE.Points(hiGeo, new THREE.PointsMaterial({ size: 13, sizeAttenuation: false, color: 0xffe066, map: dot, transparent: true, opacity: .55, depthWrite: false }));
  hiPts.frustumCulled = false; scene.add(hiPts);
  // selection ring: a bright open ring around the chosen satellite, always on top
  const rc = document.createElement('canvas'); rc.width = rc.height = 64; const rx = rc.getContext('2d');
  rx.lineWidth = 6; rx.strokeStyle = 'rgba(0,0,0,.85)'; rx.beginPath(); rx.arc(32, 32, 24, 0, 7); rx.stroke();
  rx.lineWidth = 3; rx.strokeStyle = '#fff'; rx.beginPath(); rx.arc(32, 32, 24, 0, 7); rx.stroke();
  selGeo = new THREE.BufferGeometry(); selGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([9e9, 0, 0]), 3));
  selPt = new THREE.Points(selGeo, new THREE.PointsMaterial({ size: 30, sizeAttenuation: false, color: 0xffffff, map: new THREE.CanvasTexture(rc), transparent: true, depthTest: false, depthWrite: false }));
  selPt.frustumCulled = false; selPt.visible = false; selPt.renderOrder = 10; scene.add(selPt);
  // you are here + horizon footprint for low-orbit satellites (550 km, 10 degrees elevation)
  me = new THREE.Mesh(new THREE.SphereGeometry(.009, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff5a3c }));
  scene.add(me);
  const rp = []; for (let i = 0; i <= 128; i++) rp.push(new THREE.Vector3());
  ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(rp), new THREE.LineDashedMaterial({ color: 0xffe066, dashSize: .01, gapSize: .008, transparent: true, opacity: .8 }));
  scene.add(ring); placeMe();
  const lbl = $('#globeLabels');
  for (const k of ['me', 'sel', 25544, 48274, 20580]) { const el = document.createElement('span'); el.className = 'glabel'; lbl.appendChild(el); labels[k] = el; }
  // picking
  let down = null;
  cv.addEventListener('pointerdown', e => down = [e.clientX, e.clientY]);
  cv.addEventListener('pointerup', e => { if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 6) pick(e); down = null; });
  new ResizeObserver(resize).observe(cv);
  bindUI(); buildGroupsUI();
  on('location', () => placeMe());
  on('globe-select', o => { emit('nav', 'earth'); setTimeout(() => select(sats.list.find(s => s.norad === o.norad) || o), 300); });
  renderer.setAnimationLoop(frame);
}
function resize() { const c = renderer.domElement, w = c.clientWidth, h = c.clientHeight; if (!w) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }

function placeMe() {
  if (!me) return;
  me.position.copy(geoToScene(state.lat, state.lon, 1.002));
  const h = 550, e = 10 * D2R, th = Math.acos(RE * Math.cos(e) / (RE + h)) - e;
  const o = geoToScene(state.lat, state.lon).normalize(), a = new THREE.Vector3().crossVectors(o, up).normalize(); if (a.lengthSq() < .1) a.set(1, 0, 0);
  const b = new THREE.Vector3().crossVectors(o, a);
  const p = ring.geometry.attributes.position;
  for (let i = 0; i <= 128; i++) { const t = i / 128 * 2 * Math.PI; const v = o.clone().multiplyScalar(Math.cos(th)).add(a.clone().multiplyScalar(Math.sin(th) * Math.cos(t))).add(b.clone().multiplyScalar(Math.sin(th) * Math.sin(t))).multiplyScalar(1.003); p.setXYZ(i, v.x, v.y, v.z); }
  p.needsUpdate = true; ring.computeLineDistances();
}

async function rebuild() {
  const want = GROUPS.filter(g => groupOn[g[0]]);
  $('#globeCount').textContent = 'Loading orbits…';
  for (const g of want) { try { await loadGroup(g[0]); } catch { toast(`Could not load ${g[1]}`); } }
  const seen = new Set(); list = [];
  for (const g of want) for (const s of sats.byGroup[g[0]] || []) if (!seen.has(s.norad)) { seen.add(s.norad); list.push({ s, color: new THREE.Color(g[2]), p: new THREE.Vector3(9e9, 0, 0), up: false, rising: false, lit: true }); }
  const n = list.length;
  ptsGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  ptsGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  hiGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Math.max(1, n) * 3), 3)); hiGeo.setDrawRange(0, 0);
  cursor = 0; for (let i = 0; i < n; i++) update(i, now());
  pts.geometry.computeBoundingSphere();
}

const obsVec = () => geoToScene(state.lat, state.lon, 1 + (state.elev || 0) / 1000 / RE);
function update(i, t, sunD = sunScene(t), o = obsVec(), on_ = o.clone().normalize()) {
  const it = list[i], e = ecef(it.s, t), P = ptsGeo.attributes.position, C = ptsGeo.attributes.color;
  if (!e) { P.setXYZ(i, 9e9, 0, 0); return; }
  toScene(e.x, e.y, e.z, it.p);
  P.setXYZ(i, it.p.x, it.p.y, it.p.z);
  // in Earth's shadow? (cylindrical shadow along -sun)
  const proj = it.p.dot(sunD), lit = proj > 0 || it.p.clone().sub(sunD.clone().multiplyScalar(proj)).length() > 1;
  const d = it.p.clone().sub(o), sinEl = d.dot(on_) / d.length();
  it.up = sinEl > 0; it.lit = lit;
  // about to rise? look 5 minutes ahead for nearby satellites still below the horizon
  it.rising = false;
  if (!it.up && it.p.clone().normalize().dot(on_) > .55) { const f = ecef(it.s, new Date(+t + 300e3)); if (f) { const q = toScene(f.x, f.y, f.z); const dq = q.sub(o); it.rising = dq.dot(on_) / dq.length() > 0; } }
  const k = lit ? 1 : .55;
  C.setXYZ(i, it.color.r * k, it.color.g * k, it.color.b * k);
}

let frameN = 0;
function frame(ms) {
  if (!active) return;
  const dt = lastT ? ms - lastT : 16; lastT = ms;
  if (speed !== 1) { state.offsetMin += (speed - 1) * dt / 60000; if (ms - lastEmit > 500) { lastEmit = ms; emit('time'); } }
  const t = now(), sunD = sunScene(t);
  earth.material.uniforms.sunDir.value.copy(sunD);
  clouds.rotation.y += dt * 1e-6 * Math.max(1, speed / 10);
  stars.rotation.y = A.SiderealTime(t) * 15 * D2R; // stars are fixed in space; Earth-fixed frame turns under them
  // propagate a slice of the catalogue each frame
  const n = list.length;
  if (n) {
    const per = Math.max(60, Math.ceil(n / (speed > 30 ? 3 : 10))), o = obsVec(), on_ = o.clone().normalize();
    for (let k = 0; k < per && k < n; k++) { update(cursor, t, sunD, o, on_); cursor = (cursor + 1) % n; }
    ptsGeo.attributes.position.needsUpdate = true; ptsGeo.attributes.color.needsUpdate = true;
    if (++frameN % 10 === 0) {
      const H = hiGeo.attributes.position; let m = 0, ups = 0, ris = 0, lit = 0, upLeo = 0;
      for (const it of list) { const leo = it.p.lengthSq() < 1.32; if (it.up) { ups++; if (leo) { upLeo++; if (it.lit) lit++; } } if (it.rising) ris++; if (leo && (it.up || it.rising) && m < H.count) { H.setXYZ(m++, it.p.x, it.p.y, it.p.z); } }
      H.needsUpdate = true; hiGeo.setDrawRange(0, m);
      $('#globeCount').innerHTML = `<b>${n.toLocaleString()}</b> tracked · above your horizon: <b>${upLeo}</b> low-orbit (${lit} sunlit, haloed) and ${ups - upLeo} high-orbit · <b>${ris}</b> rising within 5 min`;
      const sub = (() => { const s = sunD; return { lat: Math.asin(s.y) * R2D, lon: Math.atan2(-s.z, s.x) * R2D }; })();
      $('#globeTime').textContent = `${fmtTime(t, true)} · ${speed}× · Sun overhead at ${sub.lat.toFixed(0)}°, ${sub.lon.toFixed(0)}°`;
    }
  }
  // selected satellite
  if (sel) {
    const e = ecef(sel, t), e2 = ecef(sel, new Date(+t + 1000));
    if (e && e2) {
      const p = toScene(e.x, e.y, e.z), p2 = toScene(e2.x, e2.y, e2.z), vel = p2.clone().sub(p).normalize(), rad = p.clone().normalize();
      if (selModel) {
        selModel.position.copy(p);
        const m = new THREE.Matrix4().lookAt(p, new THREE.Vector3(0, 0, 0), vel); selModel.quaternion.setFromRotationMatrix(m);
        const sz = mode === 'ride' ? .0016 : mode === 'nadir' ? .0001 : clamp(camera.position.distanceTo(p) * .035, .004, .05);
        selModel.scale.setScalar(sz); selModel.visible = mode !== 'nadir';
      }
      selGeo.attributes.position.setXYZ(0, p.x, p.y, p.z); selGeo.attributes.position.needsUpdate = true;
      if (follow && (mode === 'globe' || mode === 'above')) {
        // sustained tracking: glide the view target onto the satellite, keeping the camera's own angle and distance
        const d = p.clone().sub(controls.target).multiplyScalar(.12); controls.target.add(d); camera.position.add(d);
      }
      if (mode === 'ride') {
        camera.position.copy(p).addScaledVector(vel, -.0075).addScaledVector(rad, .0022);
        camera.up.copy(rad); camera.lookAt(p.clone().addScaledVector(vel, .02).addScaledVector(rad, -.004));
      } else if (mode === 'nadir') {
        camera.position.copy(p).addScaledVector(rad, .0005); camera.up.copy(vel); camera.lookAt(0, 0, 0);
      }
      const hgt = (Math.hypot(e.x, e.y, e.z) - RE), geo = S.eciToGeodetic(S.propagate(sel.rec, t).position, S.gstime(t));
      $('#gsHeight').textContent = `${Math.round(hgt).toLocaleString()} km up · over ${(geo.latitude * R2D).toFixed(1)}°, ${(geo.longitude * R2D).toFixed(1)}°`;
    }
    if (frameN % 120 === 0) drawOrbit();
  }
  if (mode === 'above') { const o = geoToScene(state.lat, state.lon); controls.target.copy(o); }
  pts.material.size = mode === 'above' ? 9 : 7;
  if (mode === 'globe' || mode === 'above') controls.update();
  // HTML labels
  const W = renderer.domElement.clientWidth, Hh = renderer.domElement.clientHeight;
  const place = (el, v, text) => {
    if (!v) { el.style.display = 'none'; return; }
    const c = v.clone().project(camera), behind = v.clone().normalize().dot(camera.position.clone().normalize()) < .12 && v.length() < 1.2 && camera.position.length() > 1.5;
    if (c.z > 1 || behind || mode === 'nadir') { el.style.display = 'none'; return; }
    el.style.display = 'block'; el.textContent = text; el.style.transform = `translate(${(c.x + 1) / 2 * W + 8}px, ${(1 - c.y) / 2 * Hh - 8}px)`;
  };
  place(labels.me, me.position, 'You');
  for (const id of [25544, 48274, 20580]) { const it = list.find(x => x.s.norad === id); place(labels[id], it && it.p.x < 1e8 && sel?.norad !== id ? it.p : null, it?.s.name); }
  place(labels.sel, sel && selModel ? selModel.position : null, sel ? sel.name : '');
  renderer.render(scene, camera);
}

function drawOrbit() {
  if (!sel) return;
  for (const l of [orbitLine, trackLine]) if (l) { scene.remove(l); l.geometry.dispose(); }
  const t = now(), per = 2 * Math.PI / sel.rec.no; // minutes per orbit
  const pts_ = [], gnd = [];
  for (let m = -per * .55; m <= per * .55; m += per / 160) {
    const e = ecef(sel, new Date(+t + m * 60e3)); if (!e) continue;
    const p = toScene(e.x, e.y, e.z); pts_.push(p); gnd.push(p.clone().normalize().multiplyScalar(1.0015));
  }
  orbitLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts_), new THREE.LineBasicMaterial({ color: 0xffe066, transparent: true, opacity: .8 }));
  trackLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(gnd), new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: .01, gapSize: .01, transparent: true, opacity: .5 }));
  trackLine.computeLineDistances(); scene.add(orbitLine); scene.add(trackLine);
}

function pick(e) {
  const r = renderer.domElement.getBoundingClientRect(), m = new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  raycaster.setFromCamera(m, camera);
  raycaster.params.Points.threshold = camera.position.length() * .012;
  const hit = raycaster.intersectObject(pts)[0];
  if (hit) {
    // make sure it is not on the far side of the Earth
    const eh = raycaster.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), 1), new THREE.Vector3());
    if (!eh || eh.distanceTo(camera.position) > hit.distance) {
      const s = list[hit.index].s;
      if (sel && sel.norad === s.norad) deselect(); else select(s);
      return;
    }
  }
  if (mode === 'globe' || mode === 'above') deselect(); // tapped empty space (not while riding along)
}

function deselect() {
  if (!sel && $('#globeSel').hidden) return;
  sel = null; follow = false; selPt.visible = false;
  $('#gsFollow').classList.remove('on'); $('#gsFollow').setAttribute('aria-pressed', 'false');
  $('#globeSel').hidden = true; if (selModel) { scene.remove(selModel); selModel = null; }
  for (const l of [orbitLine, trackLine]) if (l) scene.remove(l);
  if (mode === 'ride' || mode === 'nadir') setMode('globe');
}

export async function select(s) {
  if (!s?.rec) return;
  sel = s; selPt.visible = true;
  if (selModel) { scene.remove(selModel); selModel = null; }
  const name = modelFor(s, null);
  try { const src = await loadModel(name); selModel = src.clone(); scene.add(selModel); } catch { }
  if (!scene.getObjectByName('selLight')) { const l = new THREE.DirectionalLight(0xffffff, 3); l.name = 'selLight'; scene.add(l); scene.add(new THREE.AmbientLight(0xffffff, .25)); }
  scene.getObjectByName('selLight').position.copy(sunScene(now()).multiplyScalar(10));
  drawOrbit();
  const pr = profile(s);
  $('#globeSel').hidden = false;
  $('#gsName').textContent = s.name; $('#gsType').textContent = pr?.name && pr.name !== s.name ? pr.name : (s.full || '');
  $('#gsInfo').onclick = () => emit('select', s);
}

function setMode(m) {
  if (m !== 'globe' && m !== 'above' && !sel) { toast('Tap a satellite first, then choose this view'); return; }
  mode = m; $$('#globeMode button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
  controls.enabled = m === 'globe' || m === 'above';
  camera.fov = m === 'nadir' ? 70 : m === 'ride' ? 60 : 42; camera.near = m === 'ride' || m === 'nadir' ? .00005 : .0005; camera.updateProjectionMatrix();
  camera.up.set(0, 1, 0);
  if (m === 'globe') { controls.target.set(0, 0, 0); camera.position.copy(obsVec().normalize().multiplyScalar(3.2).add(new THREE.Vector3(0, .6, 0))); }
  if (m === 'above') { const o = geoToScene(state.lat, state.lon); controls.target.copy(o); camera.position.copy(o.clone().multiplyScalar(1.85)); }
}

function bindUI() {
  $$('#globeMode button').forEach(b => b.onclick = () => setMode(b.dataset.m));
  $$('#globeSpeed button').forEach(b => b.onclick = () => { speed = +b.dataset.s; if (speed === 0) { speed = 1; state.offsetMin = 0; emit('time'); } $$('#globeSpeed button').forEach(x => x.classList.toggle('on', +x.dataset.s === speed && b.dataset.s !== '0')); });
  $('#gsClose').onclick = deselect;
  addEventListener('keydown', e => { if (e.key === 'Escape' && active) deselect(); });
  $('#gsFollow').onclick = () => { follow = !follow; $('#gsFollow').classList.toggle('on', follow); $('#gsFollow').setAttribute('aria-pressed', String(follow)); if (follow && mode !== 'globe' && mode !== 'above') setMode('globe'); toast(follow ? 'Following. Drag to look around, tap Follow to stop.' : 'Stopped following'); };
  $('#gsRide').onclick = () => setMode('ride'); $('#gsNadir').onclick = () => setMode('nadir');
  $('#globeSearch').oninput = e => {
    const q = e.target.value.trim().toLowerCase(), box = $('#globeResults'); if (q.length < 2) { box.innerHTML = ''; return; }
    const hits = sats.list.filter(s => s.name.toLowerCase().includes(q) || String(s.norad) === q).slice(0, 8);
    box.innerHTML = hits.map(s => `<button data-n="${s.norad}">${esc(s.name)} <small class="muted">${s.norad}</small></button>`).join('');
    $$('#globeResults button').forEach(b => b.onclick = () => { select(sats.list.find(s => s.norad === +b.dataset.n)); box.innerHTML = ''; e.target.value = ''; });
  };
  $('#globeLayersBtn').onclick = () => { const p = $('#globeGroups'); p.hidden = !p.hidden; };
}
function buildGroupsUI() {
  $('#globeGroups').innerHTML = GROUPS.map(g => `<label><input type="checkbox" data-g="${g[0]}" ${groupOn[g[0]] ? 'checked' : ''}><i style="background:#${g[2].toString(16).padStart(6, '0')}"></i>${g[1]}</label>`).join('') + '<p class="small muted">Yellow halos: above your horizon now or rising within 5 minutes. Dim dots are in Earth\'s shadow.</p>';
  $$('#globeGroups input').forEach(i => i.onchange = () => { groupOn[i.dataset.g] = i.checked; store.set('globeGroups', groupOn); rebuild(); });
}

export function setEarthActive(a) {
  const was = active; active = a;
  if (a && !was) { lastT = 0; resize(); if (!list.length) rebuild(); }
}
