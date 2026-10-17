"""Render delivered GLBs, not construction geometry. Run with Blender Python."""
import bpy, math, json, contextlib, io
from mathutils import Vector, Matrix
import os
from pathlib import Path
# the repository: COMFYTURE_ROOT, else the folder above this script, else where Blender runs
ROOT=Path(os.environ.get('COMFYTURE_ROOT') or (os.path.dirname(os.path.dirname(os.path.abspath(__file__))) if '__file__' in globals() else os.getcwd()))
OUT=ROOT/'models-src/previews';OUT.mkdir(exist_ok=True)
IDS=['man','woman','teen','child','toddler','elder','heavy','athletic']
COLORS=[(.72,.19,.16,1),(.055,.52,.57,1),(.86,.49,.10,1),(.42,.23,.76,1),(.20,.56,.28,1),(.72,.19,.43,1),(.08,.34,.78,1),(.65,.39,.20,1)]
def clear():
 for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
 for pool in [bpy.data.meshes,bpy.data.materials,bpy.data.cameras,bpy.data.lights]:
  for x in list(pool):
   if x.users==0:pool.remove(x)
def mat(name,col,rough=.65):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=col
 n=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');n.inputs['Base Color'].default_value=col;n.inputs['Roughness'].default_value=rough
 return m
def import_glb(path):
 old=set(bpy.data.objects)
 with contextlib.redirect_stdout(io.StringIO()):bpy.ops.import_scene.gltf(filepath=str(ROOT/'web/models'/path))
 return list(set(bpy.data.objects)-old)
def aim(o,at):o.rotation_euler=(Vector(at)-o.location).to_track_quat('-Z','Y').to_euler()
def stage(width=10,height=2.4,res=(2600,650),target=(0,0,1),direction=(0,-1,.06)):
 sc=bpy.context.scene;sc.render.engine='BLENDER_EEVEE';sc.render.resolution_x=res[0];sc.render.resolution_y=res[1];sc.render.resolution_percentage=100
 sc.render.image_settings.file_format='PNG';sc.render.film_transparent=False
 sc.world=bpy.data.worlds.new('Studio');sc.world.use_nodes=True
 n=next(n for n in sc.world.node_tree.nodes if n.type=='BACKGROUND');n.inputs['Color'].default_value=(.015,.018,.025,1);n.inputs['Strength'].default_value=.4
 sc.view_settings.view_transform='AgX'
 sc.render.image_settings.color_mode='RGB'
 bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.003));ground=bpy.context.object;ground.name='Studio.floor';ground.data.materials.append(mat('Studio.charcoal',(.006,.008,.011,1)))
 for name,loc,power,size in [('Key',(-4,-4,6),1500,5),('Fill',(4,-2,3.8),900,5),('Rim',(0,3,5),1900,4)]:
  data=bpy.data.lights.new('Studio.'+name,'AREA');data.energy=power;data.shape='DISK';data.size=size;o=bpy.data.objects.new(data.name,data);sc.collection.objects.link(o);o.location=loc;aim(o,(0,0,1))
 data=bpy.data.cameras.new('Studio.camera');o=bpy.data.objects.new('Studio.camera',data);sc.collection.objects.link(o);o.location=Vector(target)+Vector(direction).normalized()*18;aim(o,target);data.type='ORTHO';data.ortho_scale=width;sc.camera=o
 sc.render.filepath=str(OUT/'test.png')
 return sc
def pose(objects,name):
 nodes={o.name:o for o in objects}
 def R(n,axis,deg):nodes[n].rotation_euler[axis]=math.radians(deg)
 for o in objects:
  if o.type=='EMPTY':o.rotation_mode='XYZ';o.rotation_euler=(0,0,0)
 if name!='tpose':
  R('LeftArm',1,76);R('RightArm',1,-76)
  R('LeftForeArm',2,-8);R('RightForeArm',2,8)
 if name=='sit':
  for s in ['Left','Right']:R(s+'UpLeg',0,-90);R(s+'Leg',0,90)
  nodes['Hips'].location.z-=abs(nodes['LeftLeg'].location.z)
  R('LeftArm',1,82);R('RightArm',1,-82);R('LeftForeArm',2,-90);R('RightForeArm',2,90)
 elif name=='elbows130':
  R('LeftArm',1,28);R('RightArm',1,-28);R('LeftForeArm',2,-130);R('RightForeArm',2,130)
 elif name=='overhead':R('LeftArm',1,-87);R('RightArm',1,87);R('LeftForeArm',2,0);R('RightForeArm',2,0)
 elif name=='head60':R('Head',2,60)
 elif name=='spine30':R('Spine',0,30)
 bpy.context.view_layer.update()
def lineup(view='front',pose_name='stand',save=False):
 clear()
 angles={'front':0,'three-quarter':-35,'side':-90,'back':180}
 for i,id in enumerate(IDS):
  objs=import_glb(f'bodies/{id}.glb');pose(objs,pose_name)
  col=tuple(x**1.3 for x in COLORS[i][:3])+(1,);plate=mat(id+'.plate',col);joint=mat(id+'.joint',tuple(x*.35 for x in col[:3])+(1,))
  for o in objs:
   if o.type=='MESH':
    for j,m in enumerate(o.data.materials):o.data.materials[j]=joint if m.name.split('.')[0]=='joint' else plate
  root=next(o for o in objs if o.name=='Hips');holder=bpy.data.objects.new(id,None);bpy.context.collection.objects.link(holder)
  root.parent=holder;holder.location.x=(i-3.5)*1.15;holder.rotation_euler.z=math.radians(angles[view])
  for o in objs:o.name=id+'.'+o.name
 sc=stage(width=9.35,res=(2800,850 if pose_name=='overhead' else 730),target=(0,0,1.25 if pose_name=='overhead' else 1.02),direction=(0,-1,.035))
 sc.render.filepath=str(OUT/f'bodies-{view}-{pose_name}.png')
 if save:bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/f'models-src/blender/preview-{pose_name}.blend'))
 bpy.ops.render.render(write_still=True)
 print('RENDER',sc.render.filepath)
def asset_tile(file,name):
 clear();objs=import_glb(file)
 if file.startswith('hand/'):
  C=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
  A=Matrix(((-1,0,0,0),(0,0,1,0),(0,1,0,0),(0,0,0,1)))
  if name in ['hand-camera','hand-pistol']:A=Matrix(((0,0,-1,0),(-1,0,0,0),(0,1,0,0),(0,0,0,1)))
  T=(C@A@C.inverted()).inverted()
  for o in objs:
   if o.parent is None:o.matrix_world=T@o.matrix_world
 bpy.context.view_layer.update()
 points=[o.matrix_world@Vector(c) for o in objs if o.type=='MESH' for c in o.bound_box]
 low=Vector(tuple(min(v[i] for v in points) for i in range(3)));high=Vector(tuple(max(v[i] for v in points) for i in range(3)))
 centre=(low+high)/2;size=high-low
 # Normalize only the preview display size, never the delivered model.
 ratio=1.75/max(size);holder=bpy.data.objects.new('Display',None);bpy.context.collection.objects.link(holder)
 for o in objs:
  if o.parent is None:o.parent=holder
 holder.scale=(ratio,)*3;holder.location=-Vector((centre.x,centre.y,low.z))*ratio
 sc=stage(width=3.15,res=(520,480),target=(0,0,.84),direction=(.95,-1.6,.8))
 sc.render.filepath=str(OUT/'tiles'/f'{name}.png');(OUT/'tiles').mkdir(exist_ok=True)
 bpy.ops.render.render(write_still=True);print('TILE',name)
def grip_tile(type):
 clear();body=import_glb('bodies/man.glb');hand=next(o for o in body if o.name=='RightHand')
 keep=[hand]+list(hand.children_recursive)
 hand.parent=None;hand.location=(0,0,0);hand.rotation_mode='XYZ';hand.rotation_euler=(0,0,0)
 for o in body:
  if o not in keep:bpy.data.objects.remove(o,do_unlink=True)
 coral=mat('Palm.clay',(.52,.13,.10,1));dark=mat('Palm.joint',(.18,.04,.03,1))
 for o in keep:
  if o.type=='MESH':
   for i,m in enumerate(o.data.materials):o.data.materials[i]=dark if 'joint' in m.name else coral
 props=import_glb('hand/'+type+'.glb')
 for o in props:
  if o.parent is None:o.parent=hand;o.location=Vector((-.075,0,-.018))
 holder=bpy.data.objects.new('Display',None);bpy.context.collection.objects.link(holder);hand.parent=holder;holder.rotation_euler.x=-math.pi/2
 bpy.context.view_layer.update()
 points=[o.matrix_world@Vector(v) for o in keep+props if o.type=='MESH' for v in o.bound_box]
 lo=Vector(tuple(min(p[i] for p in points) for i in range(3)));hi=Vector(tuple(max(p[i] for p in points) for i in range(3)))
 factor=1.75/max(hi-lo);holder.scale=(factor,)*3;holder.location=-Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))*factor
 sc=stage(width=3.15,res=(700,600),target=(0,0,.8),direction=(.65,-1.6,.8));sc.render.filepath=str(OUT/'tiles'/('grip-'+type+'.png'))
 bpy.ops.render.render(write_still=True);print('GRIP',type)
def reimport_check():
 reports=[]
 for file in sorted((ROOT/'web/models').rglob('*.glb')):
  clear();objs=import_glb(str(file.relative_to(ROOT/'web/models')))
  meshes=[o for o in objs if o.type=='MESH'];tri=0;bad=[]
  for o in meshes:
   o.data.calc_loop_triangles();tri+=len(o.data.loop_triangles)
   for t in o.data.loop_triangles:
    if t.area<1e-12:bad.append(o.name)
  reports.append(dict(file=str(file.relative_to(ROOT/'web/models')),objects=len(objs),meshes=len(meshes),triangles=tri,degenerate=sorted(set(bad)),passed=bool(meshes) and not bad))
 (OUT/'blender-reimport.json').write_text(json.dumps(reports,indent=2));print('REIMPORT',len(reports),'files',sum(r['passed'] for r in reports),'passed')
def pose_source():
 clear();sc=bpy.context.scene
 sequence=[(1,'stand'),(25,'sit'),(49,'elbows130'),(73,'overhead'),(97,'head60'),(121,'spine30'),(145,'stand')]
 for i,id in enumerate(IDS):
  objs=import_glb(f'bodies/{id}.glb');root=next(o for o in objs if o.name=='Hips');rest=root.location.copy()
  for frame,name in sequence:
   sc.frame_set(frame);root.location=rest;pose(objs,name)
   for o in objs:
    if o.type=='EMPTY':o.keyframe_insert(data_path='rotation_euler',frame=frame);o.keyframe_insert(data_path='location',frame=frame)
  col=tuple(x**1.3 for x in COLORS[i][:3])+(1,);p=mat(id+'.plate',col);j=mat(id+'.joint',tuple(x*.35 for x in col[:3])+(1,))
  for o in objs:
   if o.type=='MESH':
    for k,m in enumerate(o.data.materials):o.data.materials[k]=j if 'joint' in m.name else p
   o.name=id+'.'+o.name
  holder=bpy.data.objects.new(id,None);bpy.context.collection.objects.link(holder);root.parent=holder;holder.location.x=(i-3.5)*1.15;holder.rotation_euler.z=math.radians(-25)
 sc.frame_start=1;sc.frame_end=145
 for marker in list(sc.timeline_markers):sc.timeline_markers.remove(marker)
 for frame,name in sequence:sc.timeline_markers.new(name,frame=frame)
 sc.frame_set(1);stage(width=9.35,res=(2800,850),target=(0,0,1.25),direction=(0,-1,.035))
 bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'models-src/blender/pose-tests.blend'))
 print('Saved pose-tests.blend, seven labelled keyframes, all eight delivered GLB bodies')
