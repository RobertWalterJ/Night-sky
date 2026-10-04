"""Render a lineup of every exported GLB so the models can be checked visually."""
import bpy, os, math
HERE = os.path.dirname(os.path.abspath(__file__))
G = os.path.join(HERE, "glb")
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

row1 = ["sun", "mercury", "venus", "earth", "moon", "mars"]
row2 = ["jupiter", "saturn", "uranus", "neptune"]
row3 = ["iss", "hubble", "satellite"]
scale = {"saturn": .55, "iss": 2.2, "hubble": .9, "satellite": .7}

def place(names, z, spacing):
    x0 = -spacing * (len(names) - 1) / 2
    for i, n in enumerate(names):
        before = set(sc.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(G, n + ".glb"))
        new = [o for o in sc.objects if o not in before]
        root = bpy.data.objects.new(n + "_root", None); sc.collection.objects.link(root)
        for o in new:
            if o.parent is None: o.parent = root
        s = scale.get(n, .8)
        root.scale = (s, s, s); root.location = (x0 + i * spacing, 0, z)
        if n in ("iss", "satellite"): root.rotation_euler = (math.radians(55), 0, math.radians(20))
        if n == "hubble": root.rotation_euler = (math.radians(70), 0, math.radians(35))

place(row1, 2.3, 2.0); place(row2, 0, 2.6); place(row3, -2.2, 3.0)

cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam)
cam.location = (0, -15, 0); cam.rotation_euler = (math.radians(90), 0, 0)
cam.data.lens = 40; sc.camera = cam
sun = bpy.data.objects.new("light", bpy.data.lights.new("light", "SUN")); sc.collection.objects.link(sun)
sun.data.energy = 4.5; sun.rotation_euler = (math.radians(70), math.radians(-35), math.radians(-25))
w = bpy.data.worlds.new("w"); sc.world = w
w.node_tree.nodes["Background"].inputs[0].default_value = (.004, .005, .012, 1)
sc.render.engine = "CYCLES"; sc.cycles.samples = 48; sc.cycles.device = "CPU"
sc.render.resolution_x, sc.render.resolution_y = 1600, 1000
sc.view_settings.view_transform = "AgX"
sc.render.filepath = os.path.join(HERE, "preview.png")
bpy.ops.render.render(write_still=True)
print("rendered")
