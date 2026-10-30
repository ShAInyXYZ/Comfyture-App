import bpy, sys, math, mathutils
argv = sys.argv[sys.argv.index("--") + 1:]
src, out, n = argv[0], argv[1], int(argv[2])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
pts = [o.matrix_world @ mathutils.Vector(c) for o in objs for c in o.bound_box]
mn = mathutils.Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
mx = mathutils.Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
c = (mn + mx) / 2; size = max(mx - mn)
# Spin the model on a pivot at its centre.
piv = bpy.data.objects.new("piv", None); bpy.context.scene.collection.objects.link(piv); piv.location = c
for o in bpy.context.scene.objects:
    if o.parent is None and o is not piv and o.type in ('MESH', 'EMPTY'):
        mw = o.matrix_world.copy(); o.parent = piv; o.matrix_world = mw
sc = bpy.context.scene
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); cam.data.lens = 50
d = size * 2.25
cam.location = c + mathutils.Vector((0, -d, size * 0.18)); cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler(); sc.camera = cam
for loc, e in [((2, -3, 4), 900), ((-3, -1, 2), 320), ((0, 3, 2), 400)]:
    l = bpy.data.objects.new("l", bpy.data.lights.new("l", 'AREA')); l.data.energy = e * size * size; l.data.size = size * 2
    l.location = c + mathutils.Vector(loc) * size; l.rotation_euler = (c - l.location).to_track_quat('-Z', 'Y').to_euler(); sc.collection.objects.link(l)
w = bpy.data.worlds.new("w"); w.use_nodes = True; w.node_tree.nodes["Background"].inputs[0].default_value = (0.4, 0.4, 0.42, 1); w.node_tree.nodes["Background"].inputs[1].default_value = 0.6
sc.world = w
engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in engines else 'BLENDER_EEVEE'
sc.render.film_transparent = True
sc.render.resolution_x = sc.render.resolution_y = 800
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
for i in range(n):
    piv.rotation_euler = (0, 0, math.radians(-25 + 360 * i / n))
    sc.render.filepath = f"{out}{i + 1:04d}.png"
    bpy.ops.render.render(write_still=True)
