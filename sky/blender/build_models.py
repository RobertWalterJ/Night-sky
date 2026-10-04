"""Build lightweight AR models for Night Sky and export each as GLB.
Run: python3 build_models.py   (uses the bpy module = Blender 5.2 headless)"""
import bpy, bmesh, math, os, sys
from mathutils import Vector, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(HERE, "tex")
OUT = os.path.join(HERE, "glb"); os.makedirs(OUT, exist_ok=True)
BLEND = os.path.join(HERE, "blend"); os.makedirs(BLEND, exist_ok=True)

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def img(name):
    return bpy.data.images.load(os.path.join(TEX, name), check_existing=True)

def mat_tex(name, tex, rough=.9, emission=False, alpha=False, metal=0.0):
    m = bpy.data.materials.new(name)
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bs = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bs.inputs["Roughness"].default_value = rough
    bs.inputs["Metallic"].default_value = metal
    t = nt.nodes.new("ShaderNodeTexImage"); t.image = img(tex)
    nt.links.new(t.outputs["Color"], bs.inputs["Base Color"])
    if emission:
        nt.links.new(t.outputs["Color"], bs.inputs["Emission Color"])
        bs.inputs["Emission Strength"].default_value = 1.6
    if alpha:
        nt.links.new(t.outputs["Alpha"], bs.inputs["Alpha"])
        m.surface_render_method = "BLENDED"
    nt.links.new(bs.outputs[0], out.inputs[0])
    return m

def mat_flat(name, rgb, rough=.5, metal=0.0, emit=0.0):
    m = bpy.data.materials.new(name)
    bs = m.node_tree.nodes["Principled BSDF"]
    bs.inputs["Base Color"].default_value = (*rgb, 1)
    bs.inputs["Roughness"].default_value = rough
    bs.inputs["Metallic"].default_value = metal
    if emit:
        bs.inputs["Emission Color"].default_value = (*rgb, 1)
        bs.inputs["Emission Strength"].default_value = emit
    return m

def sphere(name, r=1.0, seg=64, ring=32, mat=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=ring, radius=r)
    o = bpy.context.object; o.name = name
    bpy.ops.object.shade_smooth()
    # Blender's UV sphere seam sits at -X; rotate so texture u=0.5 (lon 0) faces +Z (glTF forward)
    if mat: o.data.materials.append(mat)
    return o

def export(name, objs=None):
    bpy.ops.object.select_all(action="DESELECT")
    for o in (objs or bpy.context.scene.objects): o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + ".glb"), export_format="GLB",
                              use_selection=True, export_image_format="AUTO",
                              export_apply=True, export_yup=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BLEND, name + ".blend"))

# ---------------- planets ----------------
PLANETS = {  # name: (texture, axial tilt deg, roughness)
    "mercury": ("mercury.jpg", .03, .95), "venus": ("venus.jpg", 177.4, .8),
    "mars": ("mars.jpg", 25.2, .95), "jupiter": ("jupiter.jpg", 3.1, .7),
    "uranus": ("uranus.jpg", 97.8, .6), "neptune": ("neptune.jpg", 28.3, .6),
    "moon": ("moon.jpg", 6.7, 1.0),
}

def build_planet(name, tex, tilt, rough):
    reset()
    o = sphere(name, mat=mat_tex(name, tex, rough))
    o.rotation_euler = Euler((0, math.radians(tilt), 0))
    export(name)

def build_sun():
    reset()
    sphere("sun", mat=mat_tex("sun", "sun.jpg", emission=True))
    export("sun")

def build_earth():
    reset()
    e = sphere("earth", mat=mat_tex("earth", "earth.jpg", .6))
    c = sphere("earth_clouds", 1.012, mat=mat_tex("clouds", "earth_clouds.png", .9, alpha=True))
    for o in (e, c): o.rotation_euler = Euler((0, math.radians(23.44), 0))
    export("earth")

def build_saturn():
    reset()
    s = sphere("saturn", mat=mat_tex("saturn", "saturn.jpg", .7))
    s.scale = (1, 1, .902)  # oblate
    # ring annulus, UV u runs inner -> outer so the radial strip texture maps cleanly
    bm = bmesh.new(); uv = bm.loops.layers.uv.new()
    n, ri, ro = 128, 1.24, 2.27
    inner = [bm.verts.new((ri * math.cos(2 * math.pi * i / n), ri * math.sin(2 * math.pi * i / n), 0)) for i in range(n)]
    outer = [bm.verts.new((ro * math.cos(2 * math.pi * i / n), ro * math.sin(2 * math.pi * i / n), 0)) for i in range(n)]
    for i in range(n):
        j = (i + 1) % n
        f = bm.faces.new((inner[i], outer[i], outer[j], inner[j]))
        for loop, u in zip(f.loops, (0, 1, 1, 0)):
            loop[uv].uv = (u, .5)
    me = bpy.data.meshes.new("rings"); bm.to_mesh(me)
    r = bpy.data.objects.new("saturn_rings", me); bpy.context.collection.objects.link(r)
    rm = mat_tex("rings", "saturn_ring.png", .9, alpha=True); rm.use_backface_culling = False
    r.data.materials.append(rm)
    for o in (s, r): o.rotation_euler = Euler((math.radians(26.7), 0, 0))
    export("saturn")

# ---------------- spacecraft ----------------
def box(name, size, loc, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object; o.name = name; o.scale = size
    o.data.materials.append(mat); return o

def cyl(name, r, d, loc, mat, rot=(0, 0, 0), v=20):
    bpy.ops.mesh.primitive_cylinder_add(vertices=v, radius=r, depth=d, location=loc, rotation=rot)
    o = bpy.context.object; o.name = name; o.data.materials.append(mat)
    bpy.ops.object.shade_auto_smooth() if hasattr(bpy.ops.object, "shade_auto_smooth") else None
    return o

def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join(); o = bpy.context.object; o.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return o

def build_iss():
    """ISS at 1 unit = 10 m. Truss along X, modules along Y (velocity vector)."""
    reset()
    white = mat_flat("module_white", (.86, .86, .84), .45)
    truss = mat_flat("truss_metal", (.55, .56, .58), .35, .8)
    array = mat_flat("solar_array", (.12, .10, .05), .25, .4)
    gold = mat_flat("array_gold", (.75, .55, .2), .3, 1.0)
    rad = mat_flat("radiator", (.95, .95, .95), .6)
    parts = []
    parts.append(box("truss", (10.9, .45, .45), (0, 0, 0), truss))
    # pressurised modules (US segment forward, Russian aft)
    for name, r, length, y in [("node2", .22, .72, 2.3), ("destiny", .21, .85, 1.5), ("unity", .22, .55, .8),
                               ("zarya", .2, 1.26, -.3), ("zvezda", .2, 1.3, -1.6), ("pmm", .22, .65, 3.0)]:
        parts.append(cyl(name, r, length, (0, y, -.45), white, rot=(math.pi / 2, 0, 0)))
    parts.append(cyl("columbus", .22, .7, (.6, 2.3, -.45), white, rot=(0, math.pi / 2, 0)))
    parts.append(cyl("kibo", .22, 1.1, (-.75, 2.3, -.45), white, rot=(0, math.pi / 2, 0)))
    parts.append(box("kibo_ef", (.5, .5, .1), (-1.55, 2.3, -.45), truss))
    # Zvezda's small arrays
    for s in (-1, 1):
        parts.append(box(f"zv_array{s}", (1.4, .3, .01), (s * .95, -1.7, -.45), array))
    # 8 main solar array wings on 4 rotating beta gimbals
    for side in (-1, 1):
        for k, xo in enumerate((4.2, 5.4)):
            for ws in (-1, 1):
                x = side * xo
                parts.append(box(f"saw_{side}_{k}_{ws}", (.42, 3.5, .015), (x, ws * 1.95, 0), array))
                parts.append(box(f"saw_mast_{side}_{k}_{ws}", (.05, 3.5, .05), (x, ws * 1.95, .02), gold))
    # thermal radiators
    for side in (-1, 1):
        parts.append(box(f"rad{side}", (.25, .05, 2.3), (side * 1.6, 0, -1.4), rad))
    iss = join(parts, "ISS")
    iss.scale = (.1, .1, .1); bpy.ops.object.transform_apply(scale=True)  # ~1.1 units wide
    export("iss")

def build_hubble():
    reset()
    silver = mat_flat("foil", (.82, .82, .85), .25, 1.0)
    dark = mat_flat("dark", (.08, .08, .1), .6)
    array = mat_flat("array", (.15, .12, .35), .3, .3)
    p = [cyl("tube", .21, 1.0, (0, 0, .2), silver, v=24),
         cyl("aft", .23, .55, (0, 0, -.55), silver, v=24),
         cyl("aperture", .2, .02, (0, 0, .71), dark, v=24),
         box("door", (.42, .02, .42), (0, .21, .9), silver, rot=(math.radians(-60), 0, 0))]
    for s in (-1, 1):
        p.append(box(f"array{s}", (.04, .55, 1.1), (s * .55, 0, -.1), array))
        p.append(box(f"boom{s}", (.3, .02, .02), (s * .3, 0, -.1), silver))
    join(p, "Hubble"); export("hubble")

def build_satellite():
    """Generic flat-panel broadband satellite (Starlink-style) for constellation passes."""
    reset()
    body = mat_flat("bus", (.7, .7, .72), .3, .9)
    array = mat_flat("array", (.08, .1, .22), .25, .3)
    p = [box("bus", (.6, .35, .06), (0, 0, 0), body),
         box("array", (.5, 1.8, .015), (0, 1.15, .05), array),
         box("boom", (.03, .25, .03), (0, .3, .03), body),
         cyl("antenna", .08, .04, (.15, -.05, -.05), body)]
    join(p, "Satellite"); export("satellite")

if __name__ == "__main__":
    build_sun(); build_earth(); build_saturn()
    for k, v in PLANETS.items(): build_planet(k, *v)
    build_iss(); build_hubble(); build_satellite()
    for f in sorted(os.listdir(OUT)):
        print(f"{f:16s} {os.path.getsize(os.path.join(OUT, f)) / 1024:7.0f} KB")
