"""Combine measured export records and derive head bounds from delivered GLBs."""
import json
from pathlib import Path
import numpy as np
from verify_library import GLB
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'models-src'
def read(file):return json.loads((SRC/file).read_text())
old=read('existing-metadata.json')
mods={a['type']:a for a in old if a.get('module')}
assets=[a for a in old if not a.get('module')]
for asset in assets:
 asset['modules']=[dict(mods[m['type']],**m) for m in asset['modules']]
 if asset['type']=='car':asset['frontRotationToPositiveZ']=[0,-0.7071067811865475,0,0.7071067811865476]
bodies=read('body-metadata.json');skeleton=read('spec/skeleton.json');order=list(skeleton['bodies'])
bodies.sort(key=lambda b:order.index(b['id']))
for body in bodies:
 p=skeleton['bodies'][body['id']]['profile'];scale=p['height']/1.78*p['hands']
 body['handSocketScale']=round(scale,6)
 body['handSockets']={
  'right':{'joint':'RightHand','position':[-round(.075*scale,6),-round(.018*scale,6),0]},
  'left':{'joint':'LeftHand','position':[round(.075*scale,6),-round(.018*scale,6),0]}}
 glb=GLB(ROOT/'web/models'/body['file']);head=next(i for i,n in enumerate(glb.nodes) if n['name']=='Head');mesh=next(i for i,n in enumerate(glb.nodes) if n['name']=='Head.head')
 primitive=glb.doc['meshes'][glb.nodes[mesh]['mesh']]['primitives'][0];vertices=glb.accessor(primitive['attributes']['POSITION'])
 transform=np.linalg.inv(glb.world(head))@glb.world(mesh)
 vertices=(transform@np.column_stack((vertices,np.ones(len(vertices)))).T).T[:,:3]
 low=vertices.min(axis=0);high=vertices.max(axis=0)
 body['headBounds']={'node':'Head.head','frame':'Head','min':low.round(6).tolist(),'max':high.round(6).tolist(),'centre':((low+high)/2).round(6).tolist()}
manifest={
 'version':1,'units':'metres','up':'+Y','forward':'+Z','fileBase':'relative to web/models/',
 'rig':'rigid joint-node meshes; no skinning',
 'gripConvention':{'modelOrigin':'palm grip point','coordinateSpace':'hand-joint-local','quaternionOrder':'xyzw','referenceHand':'socket .075 m along finger axis; scale position by body.handSocketScale','leftHand':'scale [-1,1,1] mirrors across X, retaining palm -Y and thumb +Z'},
 'bodies':bodies,'assets':assets+read('new-metadata.json'),'handProps':read('hand-metadata.json')}
if (SRC/'batch2-requirements.json').exists():
 from assemble_batch2 import append_batch2
 manifest=append_batch2(manifest)
(ROOT/'web/models/manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Manifest:',len(bodies),'bodies,',len(manifest['assets']),'assets,',len(manifest['handProps']),'hand props, 3 modules')
