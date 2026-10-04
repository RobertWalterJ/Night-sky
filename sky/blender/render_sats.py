import bpy, os, math
HERE=os.path.dirname(os.path.abspath(__file__)); G=os.path.join(HERE,'glb')
bpy.ops.wm.read_factory_settings(use_empty=True); sc=bpy.context.scene
names=['iss','tiangong','hubble','starlink','oneweb','iridium','gps','goes','radarsat','eosat','cubesat','rocketbody','debris']
cols=5
for i,n in enumerate(names):
    before=set(sc.objects); bpy.ops.import_scene.gltf(filepath=os.path.join(G,n+'.glb'))
    new=[o for o in sc.objects if o not in before]
    root=bpy.data.objects.new(n,None); sc.collection.objects.link(root)
    for o in new:
        if o.parent is None: o.parent=root
    s=1.15 if n not in ('iss',) else 1.6
    if n=='iss': s=2.0
    if n=='hubble': s=1.15
    root.scale=(s,s,s); root.location=((i%cols-2)*2.6,0,-(i//cols-1)*2.6)
    root.rotation_euler=(math.radians(60),math.radians(15),math.radians(35))
cam=bpy.data.objects.new('c',bpy.data.cameras.new('c')); sc.collection.objects.link(cam); cam.location=(0,-17,0); cam.rotation_euler=(math.radians(90),0,0); cam.data.lens=42; sc.camera=cam
l=bpy.data.objects.new('l',bpy.data.lights.new('l','SUN')); sc.collection.objects.link(l); l.data.energy=4.5; l.rotation_euler=(math.radians(55),math.radians(-30),math.radians(-30))
w=bpy.data.worlds.new('w'); sc.world=w; w.node_tree.nodes['Background'].inputs[0].default_value=(.01,.012,.03,1); w.node_tree.nodes['Background'].inputs[1].default_value=1.5
sc.render.engine='CYCLES'; sc.cycles.samples=40; sc.render.resolution_x,sc.render.resolution_y=1600,1000; sc.view_settings.view_transform='AgX'
sc.render.filepath=os.path.join(HERE,'sats_preview.png'); bpy.ops.render.render(write_still=True)
