"""Batch 2 renders and independent Blender import checks of delivered GLBs."""
import bpy, sys, json, math, argparse, hashlib
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion
SRC=Path(__file__).resolve().parent
if str(SRC) not in sys.path:sys.path.insert(0,str(SRC))
import render_library as r
OUT=SRC/'previews'
HELD=['water-bottle','mug','wine-glass','burger','frying-pan','perfume-bottle','smartphone','shopping-bag','clapperboard','teddy-bear','dumbbell','magic-staff']

def records():return json.loads((SRC/'batch2-metadata.json').read_text())

def tiles(ids=None,category=None,skip=True):
 for a in records():
  if ids and a['type'] not in ids:continue
  if category and a['category']!=category:continue
  path=OUT/'tiles'/f'batch2-{a["type"]}.png'
  src=SRC.parent/'web/models'/a['file']
  if skip and path.exists() and path.stat().st_mtime>src.stat().st_mtime:continue
  r.asset_tile(a['file'],'batch2-'+a['type'])

def attach(objs,hand,grip):
 # Manifest is app Y-up; conjugate transforms into Blender's Z-up frame.
 C=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
 q=grip['quaternion'];Q=Quaternion((q[3],q[0],q[1],q[2])).to_matrix().to_4x4()
 T=Matrix.Translation(Vector(grip['position']))@Q@Matrix.Diagonal((*grip.get('scale',[1,1,1]),1))
 for o in objs:
  if o.parent is None:o.parent=hand;o.matrix_local=C@T@C.inverted()

def held_tile(a):
 r.clear();body=r.import_glb('bodies/man.glb');hand=next(o for o in body if o.name=='RightHand')
 keep=[hand]+list(hand.children_recursive)
 hand.parent=None;hand.location=(0,0,0);hand.rotation_mode='XYZ';hand.rotation_euler=(0,0,0)
 for o in body:
  if o not in keep:bpy.data.objects.remove(o,do_unlink=True)
 clay=r.mat('Palm.clay',(.52,.13,.10,1));joint=r.mat('Palm.joint',(.18,.04,.03,1))
 for o in keep:
  if o.type=='MESH':
   for i,m in enumerate(o.data.materials):o.data.materials[i]=joint if 'joint' in m.name else clay
 props=r.import_glb(a['file']);attach(props,hand,a['holdable']['grips']['right'])
 holder=bpy.data.objects.new('Display',None);bpy.context.collection.objects.link(holder);hand.parent=holder;holder.rotation_euler.x=-math.pi/2
 bpy.context.view_layer.update();points=[o.matrix_world@Vector(v) for o in keep+props if o.type=='MESH' for v in o.bound_box]
 lo=Vector([min(p[i] for p in points) for i in range(3)]);hi=Vector([max(p[i] for p in points) for i in range(3)])
 factor=1.75/max(hi-lo);holder.scale=(factor,)*3;holder.location=-Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))*factor
 sc=r.stage(width=3.15,res=(700,600),target=(0,0,.8),direction=(.65,-1.6,.8))
 sc.render.filepath=str(OUT/'tiles'/f'batch2-held-{a["type"]}.png')
 bpy.ops.render.render(write_still=True);print('HELD',a['type'],flush=True)

def held(ids=None):
 for a in records():
  if a['type'] in (ids or HELD):held_tile(a)

def full_hold_source():
 """A whole adult mannequin holding an upright mug, saved for loader/pose review."""
 r.clear();body=r.import_glb('bodies/man.glb');r.pose(body,'stand')
 nodes={o.name:o for o in body};nodes['RightForeArm'].rotation_euler.z=math.radians(85)
 a=next(a for a in records() if a['type']=='mug');props=r.import_glb(a['file']);attach(props,nodes['RightHand'],a['holdable']['grips']['right'])
 bpy.context.view_layer.update();sc=r.stage(width=2.7,res=(850,1000),target=(0,0,.9),direction=(.7,-1.6,.4))
 sc.render.filepath=str(OUT/'batch2-held-mannequin.png')
 bpy.ops.wm.save_as_mainfile(filepath=str(SRC/'blender'/'batch2-held.blend'),compress=True)
 bpy.ops.render.render(write_still=True)

def reimport():
 manifest=json.loads((SRC.parent/'web/models/manifest.json').read_text())
 legacy={a['file'] for a in json.loads((SRC/'batch1-baseline.json').read_text())['manifest']['assets']}
 entries=manifest['bodies']+manifest['assets']+manifest['handProps']
 for a in manifest['assets']:entries+=a.get('modules',[])
 reports=[]
 for a in entries:
  r.clear();objs=r.import_glb(a['file']);meshes=[o for o in objs if o.type=='MESH'];tri=0;bad=[];points=[]
  bpy.context.view_layer.update()
  for o in meshes:
   o.data.calc_loop_triangles();tri+=len(o.data.loop_triangles)
   if any(t.area<1e-12 for t in o.data.loop_triangles):bad.append(o.name)
   points.extend(o.matrix_world@v.co for v in o.data.vertices)
  lo=Vector([min(p[i] for p in points) for i in range(3)]);hi=Vector([max(p[i] for p in points) for i in range(3)])
  size=hi-lo;size=[size.x,size.z,size.y]
  errors=[]
  if tri!=a['triangles']:errors.append('triangle count mismatch')
  if bad:errors.append('tiny triangles in '+','.join(bad))
  if a.get('size'):
   # Batch 1's unchanged declared envelopes use the existing verifier tolerance;
   # batch 2's exact-vertex measurements must match within 0.2 mm.
   if any(abs(x-y)>(.002+.002*abs(y) if a['file'] in legacy else .0002) for x,y in zip(size,a['size'])):errors.append('size mismatch')
  report=dict(file=a['file'],triangles=tri,size=size,meshParts=len(meshes),errors=errors,passed=not errors)
  reports.append(report);print('REIMPORT',a['file'],report['passed'],flush=True)
 out=dict(files=reports,count=len(reports),errorCount=sum(len(a['errors']) for a in reports),passed=all(a['passed'] for a in reports))
 (OUT/'batch2-blender-reimport.json').write_text(json.dumps(out,indent=2)+'\n')
 print('REIMPORT_RESULT',out['count'],out['errorCount'],flush=True)

if __name__=='__main__':
 args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
 p=argparse.ArgumentParser();p.add_argument('--category');p.add_argument('--group');p.add_argument('--ids',nargs='+');p.add_argument('--held',action='store_true');p.add_argument('--mannequin',action='store_true');p.add_argument('--reimport',action='store_true');p.add_argument('--force',action='store_true')
 a=p.parse_args(args)
 if a.reimport:reimport()
 elif a.mannequin:full_hold_source()
 elif a.held:held(a.ids)
 else:
  ids=a.ids
  if a.group:ids=[r['type'] for r in json.loads((SRC/f'batch2-{a.group}-metadata.json').read_text())]
  tiles(ids,a.category,not a.force)
