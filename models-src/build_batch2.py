"""Batch 2 entry point. Run in the connected Blender or Blender --background.

python expression: import build_batch2 as b; b.run(group='food_products')
Each source saves an editable .blend and a base-centred, metre-scale GLB.
Never writes batch 1 geometry or the manifest; assembly is a separate operation.
"""
import bpy, sys, json, importlib, math, argparse
from pathlib import Path
from mathutils import Vector, Matrix
SRC=Path(__file__).resolve().parent
if str(SRC) not in sys.path:sys.path.insert(0,str(SRC))
import batch2_common as c
GROUPS={'food_products':'batch2_food_products','home_studio':'batch2_home_studio','world':'batch2_world'}

def catalog():
 out={}
 for group,module in GROUPS.items():
  m=importlib.import_module(module)
  for typ,record in m.CATALOG.items():
   if typ in out:raise ValueError('Duplicate batch 2 type '+typ)
   out[typ]=(group,m,record)
 return out

def write_spec():
 records=catalog();reqs={r['type']:r for r in json.loads((SRC/'batch2-requirements.json').read_text())}
 missing=[t for t,r in reqs.items() if r['priority']=='P1' and t not in records]
 if missing:raise ValueError('Required builders absent: '+', '.join(missing))
 out={}
 for typ,(group,module,record) in records.items():
  req=reqs.get(typ)
  if not req:raise ValueError('Unrequested type '+typ)
  if req['holdable'] and record.get('grip') is None:raise ValueError('Missing grip authoring: '+typ)
  out[typ]=dict(priority=req['priority'],holdable=req['holdable'],group=group,budget=record['budget'],
                source=module.__name__+'.py',authoredGrip=record.get('grip'))
 (SRC/'batch2-spec.json').write_text(json.dumps(out,indent=2)+'\n')
 print('SPEC',len(out),'types;',len([r for r in out.values() if r['priority']=='P1']),'P1')
 return out

def grip_record(point,poses,quaternion=None):
 # Same hand frame as batch 1: upright -> thumb, face -> palm, width -> -X.
 A=Matrix(((-1,0,0),(0,0,1),(0,1,0)))
 if quaternion is not None:
  from mathutils import Quaternion
  A=Quaternion((quaternion[3],*quaternion[:3])).to_matrix()
 q=A.to_quaternion();quat=[q.x,q.y,q.z,q.w]
 right=Vector((-.075,-.018,0))-A@Vector(point)
 return dict(gripCoordinateSpace='hand-joint-local',gripPoint=[round(v,7) for v in point],
  referenceSocket={'right':[-.075,-.018,0],'left':[.075,-.018,0]},
  grips={'right':dict(joint='RightHand',position=[round(v,7) for v in right],quaternion=quat),
         'left':dict(joint='LeftHand',position=[round(-right.x,7),round(right.y,7),round(right.z,7)],quaternion=quat,scale=[-1,1,1])},
  poses=poses)

def build(typ,module,record):
 c.clear();module.build(typ)
 if not c.objects():raise ValueError('No geometry for '+typ)
 for o in c.objects():c.clean(o)
 lo,hi=c.bounds();delta=Vector((-(lo.x+hi.x)/2,-(lo.y+hi.y)/2,-lo.z))
 for o in c.objects():o.location+=delta
 shift=Vector((delta.x,delta.z,-delta.y))
 root=bpy.data.objects.new('prop.'+typ,None);bpy.context.collection.objects.link(root)
 for o in c.objects():o.parent=root
 bpy.context.view_layer.update()
 tri=0
 for o in c.objects():o.data.calc_loop_triangles();tri+=len(o.data.loop_triangles)
 if tri>record['budget']:raise ValueError(f'{typ}: {tri} triangles exceeds {record["budget"]}')
 lo,hi=c.bounds();size=hi-lo
 row=dict(type=typ,name=record.get('name',typ.replace('-',' ').capitalize()),category=record['category'],
          file=f'props/{typ}.glb',size=[round(size.x,6),round(size.z,6),round(size.y,6)],seat=None,top=None,
          triangles=tri,modules=[],themes=record['themes'],tags=record['tags'])
 if record.get('seat') is not None:
  s=record['seat'];row['seat']=dict(y=round(s['y']+shift.y,6),z=round(s['z']+shift.z,6),x=[round(x+shift.x,6) for x in s['x']])
 if record.get('top') is not None:row['top']=round(record['top']+shift.y,6)
 if record.get('grip') is not None:
  row['holdable']=grip_record(Vector(record['grip'])+shift,record.get('poses',['carry','stand']),record.get('gripQuaternion'))
 return row

def run(ids=None,group=None):
 records={}
 for g,mod in GROUPS.items():
  if group and group!=g:continue
  m=importlib.import_module(mod)
  for typ,r in m.CATALOG.items():records[typ]=(g,m,r)
 selected=list(records) if ids is None else ids
 out=[];fail=[]
 for typ in selected:
  try:
   g,m,r=records[typ];row=build(typ,m,r)
   bpy.ops.wm.save_as_mainfile(filepath=str(SRC/'blender'/f'batch2-{typ}.blend'),compress=True)
   bpy.ops.export_scene.gltf(filepath=str(SRC.parent/'web/models'/row['file']),export_format='GLB',export_yup=True,
      export_materials='EXPORT',export_texcoords=False,export_normals=True,export_animations=False,export_cameras=False,export_lights=False)
   path=SRC/f'batch2-{g}-metadata.json'
   prior={r['type']:r for r in json.loads(path.read_text())} if path.exists() else {}
   prior[typ]=row;path.write_text(json.dumps(list(prior.values()),indent=2)+'\n')
   out.append(row);print('BATCH2_OK',typ,row['triangles'],flush=True)
  except Exception as exc:
   import traceback
   traceback.print_exc();fail.append(dict(type=typ,error=str(exc)));print('BATCH2_FAIL',typ,str(exc),flush=True)
 report=dict(success=[r['type'] for r in out],failures=fail)
 (SRC/'previews'/f'batch2-build-{group or "all"}.json').write_text(json.dumps(report,indent=2)+'\n')
 print('BATCH2_RESULT',json.dumps(dict(built=len(out),failures=fail)),flush=True)
 return report

if __name__=='__main__':
 args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
 p=argparse.ArgumentParser();p.add_argument('--group',choices=list(GROUPS));p.add_argument('--ids',nargs='+')
 a=p.parse_args(args);run(a.ids,a.group)
