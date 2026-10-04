"""Procedural, seamless equirectangular textures for bodies without a free real map.
Noise is sampled on the unit sphere in 3D so there is no seam or pole pinch."""
import numpy as np
from PIL import Image, ImageFilter

W, H = 1024, 512
rng = np.random.default_rng(7)
PERM = rng.permutation(256)
PERM = np.concatenate([PERM, PERM])
GRAD = rng.normal(size=(256, 3)); GRAD /= np.linalg.norm(GRAD, axis=1)[:, None]

def sphere_xyz(w=W, h=H):
    lon = (np.arange(w) + .5) / w * 2 * np.pi
    lat = np.pi / 2 - (np.arange(h) + .5) / h * np.pi
    lon, lat = np.meshgrid(lon, lat)
    return np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat), lat

def perlin(x, y, z):
    xi, yi, zi = [np.floor(a).astype(int) for a in (x, y, z)]
    xf, yf, zf = x - xi, y - yi, z - zi
    xi &= 255; yi &= 255; zi &= 255
    f = lambda t: t * t * t * (t * (t * 6 - 15) + 10)
    u, v, w = f(xf), f(yf), f(zf)
    def g(dx, dy, dz):
        h = PERM[PERM[PERM[xi + dx] + yi + dy] + zi + dz]
        G = GRAD[h]
        return G[..., 0] * (xf - dx) + G[..., 1] * (yf - dy) + G[..., 2] * (zf - dz)
    lerp = lambda a, b, t: a + t * (b - a)
    x1 = lerp(lerp(g(0,0,0), g(1,0,0), u), lerp(g(0,1,0), g(1,1,0), u), v)
    x2 = lerp(lerp(g(0,0,1), g(1,0,1), u), lerp(g(0,1,1), g(1,1,1), u), v)
    return lerp(x1, x2, w)

def fbm(x, y, z, octaves=6, freq=2.0, gain=.5, off=0.0):
    t, a = 0, 1
    for _ in range(octaves):
        t = t + a * perlin(x * freq + off, y * freq + off * 1.7, z * freq - off)
        freq *= 2; a *= gain
    return t

def ramp(v, stops):
    """v in 0..1 -> RGB via list of (pos, (r,g,b))."""
    out = np.zeros(v.shape + (3,))
    pos = [s[0] for s in stops]
    for c in range(3):
        out[..., c] = np.interp(v, pos, [s[1][c] for s in stops])
    return out

def norm(a):
    return (a - a.min()) / (a.max() - a.min() + 1e-9)

def save(arr, name):
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).save(f"tex/{name}", quality=88)

x, y, z, lat = sphere_xyz()

# Sun: granulation + faint limb-independent mottling (limb darkening is done in shader)
n = norm(fbm(x, y, z, 7, 6.0) + .4 * fbm(x, y, z, 3, 1.5, off=9))
save(ramp(n, [(0, (200, 70, 10)), (.45, (250, 150, 30)), (.75, (255, 205, 90)), (1, (255, 245, 200))]), "sun.jpg")

# Mercury: grey cratered regolith
base = norm(fbm(x, y, z, 7, 3.0))
craters = np.zeros_like(base)
for _ in range(220):
    c = rng.normal(size=3); c /= np.linalg.norm(c)
    r = rng.uniform(.015, .12) ** 1.3 + .01
    d = np.arccos(np.clip(x * c[0] + y * c[1] + z * c[2], -1, 1)) / r
    craters += np.where(d < 1, -.6 * (1 - d ** 2), 0) + np.where((d > .85) & (d < 1.15), .35 * (1 - abs(d - 1) / .15), 0)
m = norm(base + .5 * craters)
save(ramp(m, [(0, (60, 58, 55)), (.5, (130, 125, 118)), (1, (205, 198, 188))]), "mercury.jpg")

# Venus: thick sulphuric cloud deck, swirled bands
warp = fbm(x, y, z, 4, 1.5, off=3)
v = norm(np.sin(lat * 7 + 2.5 * warp) * .5 + fbm(x, y, z + warp, 6, 2.5) * 1.2)
save(ramp(v, [(0, (180, 140, 80)), (.5, (225, 195, 135)), (1, (250, 235, 195))]), "venus.jpg")

# Mars: rust plains, dark albedo features, polar caps
alb = norm(fbm(x, y, z, 7, 1.8, off=5))
mars = ramp(alb, [(0, (70, 35, 22)), (.38, (120, 55, 30)), (.55, (180, 95, 50)), (1, (225, 150, 95))])
cap = np.clip((np.abs(lat) - np.radians(72) + .08 * fbm(x, y, z, 4, 4)) * 12, 0, 1)[..., None]
save(mars * (1 - cap) + np.array([240, 235, 230]) * cap, "mars.jpg")

# Uranus: pale cyan, very soft banding
u = norm(np.sin(lat * 5) * .3 + .25 * fbm(x, y, z, 4, 2))
save(ramp(u, [(0, (140, 200, 210)), (1, (185, 230, 235))]), "uranus.jpg")

# Neptune: deep blue bands + a dark storm
nb = norm(np.sin(lat * 9 + 1.2 * fbm(x, y, z, 3, 1.5)) * .5 + .5 * fbm(x, y, z, 5, 3))
nep = ramp(nb, [(0, (30, 60, 150)), (.6, (55, 100, 200)), (1, (130, 170, 235))])
c = np.array([.6, .7, -.38]); c /= np.linalg.norm(c)
d = np.arccos(np.clip(x * c[0] + y * c[1] + z * c[2], -1, 1))
storm = np.exp(-(d / .09) ** 2)[..., None]
save(nep * (1 - .55 * storm), "neptune.jpg")

# Saturn rings: radial strip (u = inner->outer), RGBA with Cassini division
R = 1024
r = np.linspace(0, 1, R)
dens = .55 + .35 * np.sin(r * 90) * np.sin(r * 23) + .1 * rng.normal(size=R)
dens = np.convolve(dens, np.ones(5) / 5, 'same')
dens *= np.interp(r, [0, .05, .3, .55, .62, .66, .70, .95, 1], [0, .4, .9, 1, 1, .03, .9, .8, 0])
dens = np.clip(dens, 0, 1)
col = ramp(r, [(0, (150, 130, 110)), (.5, (220, 200, 165)), (1, (190, 175, 150))])
rgba = np.concatenate([col, (dens * 255)[:, None]], 1)
Image.fromarray(np.tile(rgba[None], (16, 1, 1)).astype(np.uint8), "RGBA").save("tex/saturn_ring.png")

# Deep-sky billboards (transparent PNG): spiral galaxy, emission nebula, globular cluster
S = 512
yy, xx = np.mgrid[-1:1:S * 1j, -1:1:S * 1j]
rr = np.hypot(xx, yy); th = np.arctan2(yy, xx)
zz = np.zeros_like(xx)
arms = (np.cos(2 * (th - 3.2 * np.log(rr + .05))) * .5 + .5) ** 2
g = np.exp(-rr * 2.3) * (.35 + .65 * arms) * (.75 + .5 * norm(fbm(xx, yy, zz, 6, 4)))
g += 1.4 * np.exp(-(rr / .09) ** 2)
g = np.clip(g / g.max(), 0, 1)
gc = ramp(g, [(0, (60, 80, 160)), (.4, (150, 170, 255)), (.8, (255, 230, 200)), (1, (255, 250, 240))])
Image.fromarray(np.dstack([gc, g ** .8 * 255]).astype(np.uint8), "RGBA").save("tex/galaxy.png")

w1 = fbm(xx, yy, zz + 1, 5, 2)
neb = norm(fbm(xx + .4 * w1, yy - .3 * w1, zz, 7, 2.5)) * np.clip(1 - rr ** 1.6, 0, 1)
neb = np.clip((neb - .2) * 1.6, 0, 1)
nc = ramp(neb, [(0, (90, 20, 60)), (.4, (220, 60, 110)), (.7, (110, 200, 230)), (1, (250, 250, 255))])
Image.fromarray(np.dstack([nc, neb * 255]).astype(np.uint8), "RGBA").save("tex/nebula.png")

gl = np.zeros((S, S))
for _ in range(2500):
    rad = abs(rng.normal(0, .22)); a = rng.uniform(0, 2 * np.pi)
    px, py = int(S / 2 + rad * np.cos(a) * S / 2), int(S / 2 + rad * np.sin(a) * S / 2)
    if 0 <= px < S and 0 <= py < S:
        gl[py, px] += rng.uniform(.3, 1)
gl = np.array(Image.fromarray((np.clip(gl, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))) / 255.
gl = np.clip(gl * 3 + .5 * np.exp(-(rr / .18) ** 2), 0, 1)
gcl = ramp(gl, [(0, (255, 210, 150)), (1, (255, 250, 230))])
Image.fromarray(np.dstack([gcl, gl * 255]).astype(np.uint8), "RGBA").save("tex/cluster.png")
print("done")
