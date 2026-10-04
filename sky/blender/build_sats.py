"""Satellite models shaped after the real spacecraft (simplified, low-poly, web-sized).
Run: python3 build_sats.py   (Blender 4.2+ / bpy). Exports glb/<name>.glb"""
import bpy, bmesh, math, os, random
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "glb"); os.makedirs(OUT, exist_ok=True)
BLEND = os.path.join(HERE, "blend"); os.makedirs(BLEND, exist_ok=True)

def reset(): bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name, rgb, rough=.5, metal=0., emit=0.):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1); b.inputs["Roughness"].default_value = rough; b.inputs["Metallic"].default_value = metal
    if emit: b.inputs["Emission Color"].default_value = (*rgb, 1); b.inputs["Emission Strength"].default_value = emit
    return m
def M():
    return dict(gold=mat("mli_gold", (.78, .56, .18), .32, 1), silver=mat("mli_silver", (.8, .8, .82), .28, 1),
                white=mat("white_paint", (.88, .88, .86), .5), cells=mat("solar_cells", (.05, .07, .16), .22, .5),
                frame=mat("array_frame", (.6, .6, .62), .4, .8), dark=mat("dark", (.06, .06, .07), .6),
                grey=mat("grey", (.45, .46, .48), .45, .6), black=mat("black_foil", (.03, .03, .035), .35, .2))
def box(n, s, loc, m, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot); o = bpy.context.object; o.name = n; o.scale = s; o.data.materials.append(m); return o
def cyl(n, r, d, loc, m, rot=(0, 0, 0), v=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=v, radius=r, depth=d, location=loc, rotation=rot); o = bpy.context.object; o.name = n; o.data.materials.append(m); return o
def cone(n, r1, r2, d, loc, m, rot=(0, 0, 0), v=24):
    bpy.ops.mesh.primitive_cone_add(vertices=v, radius1=r1, radius2=r2, depth=d, location=loc, rotation=rot); o = bpy.context.object; o.name = n; o.data.materials.append(m); return o
def sph(n, r, loc, m):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=r, location=loc); o = bpy.context.object; o.name = n; o.data.materials.append(m); bpy.ops.object.shade_smooth(); return o
def panel(n, w, l, loc, mm, rot=(0, 0, 0), cells=True):
    """solar panel: dark cells with a thin frame, lying in XY, length along Y"""
    p = [box(n, (w, l, .02), loc, mm['cells'] if cells else mm['white'], rot)]
    return p
def finish(name, parts):
    bpy.ops.object.select_all(action="DESELECT")
    for o in parts: o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join()
    o = bpy.context.object; o.name = name
    # normalise from the actual vertices: centre on the bounding box, largest dimension = 2 units
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    vs = [v.co.copy() for v in o.data.vertices]
    mn = Vector([min(v[i] for v in vs) for i in range(3)]); mx = Vector([max(v[i] for v in vs) for i in range(3)])
    c = (mn + mx) / 2; k = 2 / max(mx - mn)
    for v in o.data.vertices: v.co = (v.co - c) * k
    o.data.update()
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + ".glb"), export_format="GLB", use_selection=False, export_apply=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BLEND, name + ".blend"))

def tiangong():
    reset(); m = M(); p = []
    # Tianhe core along Y (1 unit = 10 m), node at +Y
    p += [cyl("tianhe_aft", .21, 1.0, (0, -.5, 0), m['white'], (math.pi / 2, 0, 0)), cyl("tianhe_fwd", .14, .6, (0, .3, 0), m['white'], (math.pi / 2, 0, 0)),
          sph("node", .15, (0, .72, 0), m['white']), cone("tianhe_tail", .21, .16, .25, (0, -1.12, 0), m['grey'], (math.pi / 2, 0, 0))]
    # Wentian and Mengtian lab modules sideways from the node
    for s in (-1, 1):
        p += [cyl(f"lab{s}", .21, 1.75, (s * 1.0, .72, 0), m['white'], (0, math.pi / 2, 0)), cyl(f"lab_neck{s}", .14, .25, (s * .2, .72, 0), m['white'], (0, math.pi / 2, 0))]
        # huge flexible arrays at the far ends of the labs, extending fore and aft
        for d in (-1, 1):
            p += panel(f"labarray{s}{d}", .42, 2.7, (s * 1.75, .72 + d * 1.5, 0), m)
            p.append(box(f"labmast{s}{d}", (.03, 2.7, .03), (s * 1.75, .72 + d * 1.5, .02), m['gold']))
        # Tianhe's own arrays
        p += panel(f"core_array{s}", .3, 1.0, (s * .55, -.55, 0), m, (0, 0, math.pi / 2))
    finish("tiangong", p)

def gps():
    reset(); m = M(); p = []
    p.append(box("bus", (2.5, 1.9, 3.4), (0, 0, 0), m['gold']))
    p.append(box("earth_deck", (2.4, 1.8, .1), (0, 0, 1.75), m['white']))
    for i in range(12):  # L-band helix antenna array
        a = i / 12 * 2 * math.pi; p.append(cyl(f"helix{i}", .09, .5, (math.cos(a) * .55, math.sin(a) * .55, 2.05), m['white'], v=10))
    p.append(cyl("helix_c", .1, .5, (0, 0, 2.05), m['white'], v=10))
    for s in (-1, 1):
        p.append(cyl(f"yoke{s}", .05, 1.2, (s * 1.85, 0, 0), m['grey'], (0, math.pi / 2, 0), v=8))
        for k in range(2): p += panel(f"wing{s}{k}", 2.3, 3.2, (s * (3.6 + k * 2.4), 0, 0), m, (math.pi / 2, 0, 0))
    finish("gps", p)

def goes():
    reset(); m = M(); p = []
    p.append(box("bus", (2.4, 2.4, 3.6), (0, 0, 0), m['silver']))
    p.append(box("abi", (1.3, 1.1, 1.0), (.4, .3, 2.2), m['gold'])); p.append(box("glm", (.6, .6, .7), (-.6, -.4, 2.1), m['black']))
    p.append(box("suvi_platform", (1.6, .6, .5), (-1.6, 0, 1.0), m['white']))
    p.append(cyl("mag_boom", .03, 8.5, (0, 5.4, .5), m['grey'], (math.pi / 2, 0, 0), v=6))
    p.append(cyl("yoke", .07, 2.0, (2.2, 0, -.8), m['grey'], (0, math.pi / 2, 0), v=8))
    for k in range(5): p += panel(f"array{k}", 1.9, 3.8, (3.4 + k * 2.0, 0, -.8), m, (math.pi / 2, 0, 0))
    finish("goes", p)

def iridium():
    reset(); m = M(); p = []
    bpy.ops.mesh.primitive_cylinder_add(vertices=3, radius=1.1, depth=3.1, location=(0, 0, 0), rotation=(math.pi / 2, 0, 0))
    b = bpy.context.object; b.name = "bus"; b.data.materials.append(m['silver']); p.append(b)
    p.append(box("main_mission_antenna", (1.9, 3.0, .08), (0, 0, -.62), m['white']))
    for s in (-1, 1):
        p.append(cyl(f"arm{s}", .04, .9, (s * 1.2, -.9, .3), m['grey'], (0, math.pi / 2, 0), v=6))
        p += panel(f"wing{s}", 1.3, 3.0, (s * 2.3, -.9, .3), m, (math.radians(30) * s, 0, 0))
    finish("iridium", p)

def oneweb():
    reset(); m = M(); p = []
    p.append(box("bus", (1.0, 1.0, 1.3), (0, 0, 0), m['gold'])); p.append(box("ku_antennas", (.8, .8, .12), (0, 0, .72), m['white']))
    for s in (-1, 1):
        p.append(cyl(f"arm{s}", .03, .5, (s * .75, 0, 0), m['grey'], (0, math.pi / 2, 0), v=6))
        p += panel(f"wing{s}", 1.5, .95, (s * 1.75, 0, 0), m, (math.pi / 2, 0, 0))
    finish("oneweb", p)

def starlink():
    reset(); m = M(); p = []
    p.append(box("chassis", (4.1, 2.7, .3), (0, 0, 0), m['grey']))
    p.append(box("phased_arrays", (3.6, 2.2, .04), (0, 0, -.17), m['white']))
    for s in (-1, 1):
        p.append(cyl(f"mast{s}", .05, 1.2, (s * 2.6, 0, .2), m['grey'], (0, math.pi / 2, 0), v=6))
        p += panel(f"wing{s}", 12.5, 4.0, (s * 9.4, 0, .2), m, (0, 0, 0))
    finish("starlink", p)

def radarsat():
    reset(); m = M(); p = []
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=1.1, depth=3.6, location=(0, 0, 0)); b = bpy.context.object; b.name = "bus"; b.data.materials.append(m['black']); p.append(b)
    p.append(box("sar_antenna", (6.75, .12, 1.38), (0, -1.05, .4), m['white']))
    p.append(cyl("array_yoke", .05, 1.0, (0, 1.4, 1.2), m['grey'], (math.pi / 2, 0, 0), v=6))
    p += panel("array", 1.2, 2.2, (0, 2.9, 1.2), m, (0, 0, 0))
    finish("radarsat", p)

def eosat():
    """Earth-observation platform in the Landsat / Sentinel / JPSS mould"""
    reset(); m = M(); p = []
    p.append(box("bus", (2.0, 2.0, 3.6), (0, 0, 0), m['gold']))
    p.append(box("instrument", (1.6, 1.4, 1.4), (0, .2, -2.4), m['silver'])); p.append(box("baffle", (.7, .7, .6), (.3, .2, -3.4), m['black']))
    p.append(cyl("dish", .45, .08, (-1.1, -.6, -1.0), m['white'], (0, math.pi / 2, 0)))
    p.append(cyl("yoke", .06, 1.4, (0, 1.6, 1.0), m['grey'], (math.pi / 2, 0, 0), v=8))
    for k in range(3): p += panel(f"array{k}", 2.0, 2.0, (0, 3.3 + k * 2.05, 1.0), m, (math.radians(20), 0, 0))
    finish("eosat", p)

def cubesat():
    reset(); m = M(); p = []
    p.append(box("body", (.1, .1, .34), (0, 0, 0), m['cells']))
    for x in (-.05, .05):
        for y in (-.05, .05): p.append(box(f"rail{x}{y}", (.008, .008, .35), (x, y, 0), m['silver']))
    for a in range(4):
        r = a * math.pi / 2
        p.append(box(f"deploy{a}", (.1, .3, .006), (math.cos(r) * .2, math.sin(r) * .2, .16), m['cells'], (0, 0, r + math.pi / 2)))
    p.append(cyl("antenna", .002, .5, (0, 0, -.42), m['silver'], v=4))
    finish("cubesat", p)

def rocketbody():
    reset(); m = M(); p = []
    p.append(cyl("stage", 1.83, 9.0, (0, 0, 0), m['white'], v=32))
    p.append(cyl("band", 1.86, .5, (0, 0, 4.0), m['dark'], v=32)); p.append(cyl("band2", 1.86, .3, (0, 0, -3.5), m['grey'], v=32))
    p.append(cone("dome", 1.83, .9, .9, (0, 0, -4.95), m['grey'], (math.pi, 0, 0), v=32))
    p.append(cone("nozzle", .4, 1.2, 2.4, (0, 0, -6.3), m['dark'], (math.pi, 0, 0), v=24))
    finish("rocketbody", p)

def debris():
    reset(); m = M(); random.seed(4)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1)
    o = bpy.context.object; o.name = "fragment"
    for v in o.data.vertices: v.co *= random.uniform(.55, 1.25); v.co.z *= .35
    o.data.materials.append(m['gold']); o.data.materials.append(m['grey'])
    for i, f in enumerate(o.data.polygons): f.material_index = 1 if random.random() < .4 else 0
    finish("debris", [o])

for f in (tiangong, gps, goes, iridium, oneweb, starlink, radarsat, eosat, cubesat, rocketbody, debris): f()
for f in sorted(os.listdir(OUT)): print(f"{f:16s} {os.path.getsize(os.path.join(OUT, f)) / 1024:7.0f} KB")
