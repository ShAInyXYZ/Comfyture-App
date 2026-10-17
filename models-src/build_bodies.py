"""Comfyture mannequin atelier. Authored mesh cages in app metres; executed in live Blender."""
import bpy, math, json
import os
from pathlib import Path
from mathutils import Vector, Matrix
# the repository: COMFYTURE_ROOT, else the folder above this script, else where Blender runs
ROOT=Path(os.environ.get('COMFYTURE_ROOT') or (os.path.dirname(os.path.dirname(os.path.abspath(__file__))) if '__file__' in globals() else os.getcwd()))
SPEC=json.loads((ROOT/'models-src/spec/skeleton.json').read_text())
C=lambda p: Vector((p[0],-p[2],p[1]))
COLORS={'man':(.72,.19,.16,1),'woman':(.055,.52,.57,1),'teen':(.86,.49,.10,1),'child':(.42,.23,.76,1),'toddler':(.20,.56,.28,1),'elder':(.72,.19,.43,1),'heavy':(.08,.34,.78,1),'athletic':(.65,.39,.20,1)}
CFG={
 'man':dict(shoulder=.215,hip=.108,chest=.195,waist=.130,pelvis=.157,depth=.104,limb=1,belly=1,head=1),
 'woman':dict(shoulder=.177,hip=.119,chest=.166,waist=.103,pelvis=.167,depth=.091,limb=.89,belly=.92,head=.94),
 'teen':dict(shoulder=.175,hip=.088,chest=.158,waist=.113,pelvis=.132,depth=.085,limb=.78,belly=.95,head=.98),
 'child':dict(shoulder=.133,hip=.079,chest=.125,waist=.109,pelvis=.112,depth=.078,limb=.68,belly=1.25,head=1.02),
 'toddler':dict(shoulder=.102,hip=.062,chest=.098,waist=.095,pelvis=.093,depth=.070,limb=.59,belly=1.32,head=.98),
 'elder':dict(shoulder=.184,hip=.108,chest=.175,waist=.149,pelvis=.160,depth=.101,limb=.91,belly=1.25,head=.97),
 'heavy':dict(shoulder=.239,hip=.140,chest=.230,waist=.239,pelvis=.205,depth=.153,limb=1.39,belly=1.38,head=1.04),
 'athletic':dict(shoulder=.249,hip=.108,chest=.226,waist=.127,pelvis=.159,depth=.119,limb=1.19,belly=.95,head=1.00),
}
def clear():
 for o in list(bpy.data.objects): bpy.data.objects.remove(o,do_unlink=True)
 for me in list(bpy.data.meshes):
  if me.users==0:bpy.data.meshes.remove(me)
 for m in list(bpy.data.materials):
  if m.users==0:bpy.data.materials.remove(m)
def material(name,color):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=color
 n=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');n.inputs['Base Color'].default_value=color;n.inputs['Roughness'].default_value=.66
 return m
def mesh(name,verts,faces,mat,parent=None):
 me=bpy.data.meshes.new(name);me.from_pydata([C(v) for v in verts],[],faces);me.update()
 o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);o.data.materials.append(mat)
 for p in me.polygons:p.use_smooth=True
 if parent:
  o.parent=parent;o.matrix_parent_inverse=parent.matrix_world.inverted()
 return o
def ell(name,pos,radii,mat,parent=None,seg=24,rings=12):
 v=[(pos[0],pos[1]-radii[1],pos[2])];f=[]
 for j in range(1,rings):
  lat=-math.pi/2+math.pi*j/rings
  for i in range(seg):
   a=2*math.pi*i/seg;v.append((pos[0]+radii[0]*math.cos(lat)*math.sin(a),pos[1]+radii[1]*math.sin(lat),pos[2]+radii[2]*math.cos(lat)*math.cos(a)))
 v.append((pos[0],pos[1]+radii[1],pos[2]));top=len(v)-1
 for i in range(seg):f.append((0,1+i,1+(i+1)%seg))
 for j in range(rings-2):
  for i in range(seg):
   a=1+j*seg+i;b=1+j*seg+(i+1)%seg;f.append((a,a+seg,b+seg,b))
 for i in range(seg):f.append((top,1+(rings-2)*seg+(i+1)%seg,1+(rings-2)*seg+i))
 return mesh(name,v,f,mat,parent)
def curve_profile(rows,steps=3):
 # Catmull-Rom cages, with clamped end tangents.
 out=[]
 for k in range(len(rows)-1):
  a=rows[max(k-1,0)];b=rows[k];c=rows[k+1];d=rows[min(k+2,len(rows)-1)]
  for j in range(steps):
   t=j/steps;out.append(tuple(.5*((2*b[q])+(-a[q]+c[q])*t+(2*a[q]-5*b[q]+4*c[q]-d[q])*t*t+(-a[q]+3*b[q]-3*c[q]+d[q])*t*t*t) for q in range(len(b))))
 out.append(rows[-1]);return out
def loft(name,rows,mat,parent,axis='Y',origin=(0,0,0),seg=28,steps=3,shape=None):
 # Rows: axial position, horizontal radius, depth radius, forward centre.
 rows=curve_profile(rows,steps);v=[];f=[]
 for j,(h,rx,rz,cz) in enumerate(rows):
  t=j/(len(rows)-1)
  for i in range(seg):
   a=2*math.pi*i/seg;x=rx*math.sin(a);z=cz+rz*math.cos(a);y=h
   if shape:x,y,z=shape(x,y,z,a,t)
   p=(x,y,z) if axis=='Y' else (y,x,z)
   v.append(tuple(p[q]+origin[q] for q in range(3)))
 for j in range(len(rows)-1):
  for i in range(seg):
   a=j*seg+i;b=j*seg+(i+1)%seg;f.append((a,a+seg,b+seg,b))
 # Cap using centre vertices, not ngons, so normals/export tessellation are deterministic.
 for row,rev in [(0,False),(len(rows)-1,True)]:
  ring=v[row*seg:(row+1)*seg];c=tuple(sum(p[q] for p in ring)/seg for q in range(3));idx=len(v);v.append(c)
  for i in range(seg):
   a=row*seg+i;b=row*seg+(i+1)%seg;f.append((idx,b,a) if rev else (idx,a,b))
 return mesh(name,v,f,mat,parent)
def build(body_id):
 clear();b=SPEC['bodies'][body_id];cfg=CFG[body_id];h=b['profile']['height'];s=h/1.78
 plate=material('plate',(.64,.64,.64,1));joint=material('joint',(.27,.27,.27,1))
 J={n:Vector(j['world']) for n,j in b['joints'].items()}
 # Widen the shoulder and hip centres to give the plates and ball sockets room.
 for side,sign in [('Left',1),('Right',-1)]:
  delta=sign*cfg['shoulder']-J[side+'Arm'].x
  for n in ['Arm','ForeArm','Hand']:J[side+n].x+=delta
  delta=sign*cfg['hip']-J[side+'UpLeg'].x
  for n in ['UpLeg','Leg','Foot','Toe']:J[side+n].x+=delta
 nodes={}
 for n in SPEC['joint_order']:
  o=bpy.data.objects.new(n,None);bpy.context.collection.objects.link(o);p=b['joints'][n]['parent'];o.parent=nodes.get(p);o.location=C(J[n]-(J[p] if p else Vector((0,0,0))));o.empty_display_size=.025;o.empty_display_type='SPHERE';nodes[n]=o
 bpy.context.view_layer.update()
 def E(n,part,pos,radii,mat=plate,**kw):return ell(n+'.'+part,pos,radii,mat,nodes[n],**kw)
 def L(n,part,rows,**kw):return loft(n+'.'+part,rows,plate,nodes[n],**kw)
 hip=J['Hips'];sp=J['Spine'];ch=J['Chest'];neck=J['Neck'];head=J['Head'];w=cfg['pelvis'];d=cfg['depth']
 # Pelvis cup. The raised sides describe the leg openings of a briefs-shaped shell.
 def pelvis_shape(x,y,z,a,t):
  y+=.046*s*abs(math.sin(a))**1.5*(1-t)**2
  if z<0:z*=1.12 if body_id=='woman' else 1.04
  return x,y,z
 L('Hips','pelvis', [(-.102*s,w*.30,d*.40,0),(-.080*s,w*.72,d*.77,-.005*s),(-.025*s,w,d,0),(.055*s,w*.97,d*.94,0),(.125*s,w*.84,d*.87,0)],origin=hip,shape=pelvis_shape,seg=32)
 E('Spine','waist_joint',sp,(cfg['waist']*.92,.087*s,d*.90),joint)
 belly=cfg['belly'];waist=cfg['waist'];sy=ch.y-sp.y
 bellyforward=(.04 if body_id=='heavy' else .016 if body_id in ['child','toddler','elder'] else .005)*s
 if body_id=='heavy':
  L('Spine','abdomen',[(-.125*s,waist*.28,d*.40,.045*s),(-.082*s,waist*.69,d*1.03,.050*s),(-.010*s,waist*.97,d*belly,.045*s),(.062*s,waist*1.01,d*belly,.035*s),(sy*.81,waist*.88,d*1.04,.012*s),(sy+.008*s,waist*.77,d*.88,0)],origin=sp,seg=32)
 elif body_id in ['child','toddler','elder']:
  L('Spine','abdomen',[(-.045*s,waist*.70,d*.85,.006*s),(-.008*s,waist*.95,d*belly*.97,bellyforward),(.058*s,waist*1.02,d*belly,bellyforward),(sy*.73,waist*.93,d*1.06,bellyforward*.5),(sy+.008*s,waist*.78,d*.88,0)],origin=sp,seg=32)
 else:
  L('Spine','abdomen',[(-.012*s,waist*.88,d*.86,0),(.019*s,waist,d*belly,bellyforward),(.070*s,waist*1.02,d*belly,bellyforward),(sy*.78,waist*.98,d*.95,0),(sy+.008*s,waist*1.05,d*.90,0)],origin=sp,seg=32)
 E('Chest','rib_joint',ch,(cfg['chest']*.66,.055*s,d*.80),joint)
 cy=neck.y-ch.y;cw=cfg['chest'];forward=(neck.z-ch.z)
 def chest_shape(x,y,z,a,t):
  front=max(0,math.cos(a))
  if body_id=='woman':z+=.047*s*front**3*math.exp(-((abs(x)-cw*.46)/(cw*.37))**2)*math.exp(-((t-.35)/.29)**2)
  elif body_id in ['man','athletic']:z+=.016*s*(1.5 if body_id=='athletic' else 1)*front**3*math.exp(-((abs(x)-cw*.48)/(cw*.43))**2)*math.exp(-((t-.4)/.36)**2)
  y+=.014*s*abs(math.sin(a))**2*(1-t)**3
  return x,y,z
 L('Chest','chest',[(-.010*s,cw*.70,d*.84,0),(.026*s,cw*.91,d,forward*.15), (cy*.48,cw,d*1.01,forward*.45),(cy*.77,cw*.91,d*.88,forward*.75),(cy*.96,cw*.52,d*.58,forward*.96),(cy*1.01,cw*.30,d*.49,forward)],origin=ch,seg=36,shape=chest_shape)
 E('Neck','collar_joint',neck,(.053*s*b['profile']['neck'],.052*s,.054*s),joint,seg=20)
 ny=head.y-neck.y
 L('Neck','neck',[(-.008*s,.052*s*b['profile']['neck'],.049*s,0),(ny*.30,.046*s*b['profile']['neck'],.043*s,(head.z-neck.z)*.3),(ny*.9,.043*s*b['profile']['neck'],.042*s,(head.z-neck.z)*.9)],origin=neck,seg=24)
 E('Head','atlas',head,(.046*s,.043*s,.045*s),joint,seg=20)
 hr=b['head']['radius']*cfg['head'];hh=hr*2.03
 def head_shape(x,y,z,a,t):
  # Broad cranial vault, narrow jaw, quiet face plane and chin; no painted facial features.
  front=max(0,math.cos(a));z-=.010*front**6*math.exp(-((t-.58)/.25)**2)
  z+=.007*front**10*math.exp(-((t-.42)/.13)**2)
  return x,y,z
 L('Head','head',[(0,hr*.30,hr*.37,.017),(.025*hh,hr*.45,hr*.48,.022),(.15*hh,hr*.63,hr*.64,.025),(.38*hh,hr*.78,hr*.83,.019),(.66*hh,hr*.85,hr*.91,.005),(.84*hh,hr*.77,hr*.80,0),(.96*hh,hr*.48,hr*.51,0),(hh,hr*.08,hr*.09,0)],origin=head,seg=32,shape=head_shape)
 # Shoulders, tapered upper arms, forearms and independent mitten + thumb hands.
 k=cfg['limb'];muscle=1.12 if body_id=='athletic' else 1
 for side,sign in [('Left',1),('Right',-1)]:
  arm=J[side+'Arm'];elbow=J[side+'ForeArm'];hand=J[side+'Hand'];sh=J[side+'Shoulder']
  shoulder_r=.059*k;elbow_r=.039*k;wrist_r=.026*k
  mid=(sh+arm)/2;E(side+'Shoulder','clavicle',mid,((arm.x-sh.x)*sign*.61,.037*k,.047*k))
  E(side+'Arm','shoulder',arm,(shoulder_r,)*3,joint)
  al=(elbow.x-arm.x)*sign
  rows=[(.018*k,.053*k,.053*k,0),(.065*k,.067*k*muscle,.062*k*muscle,0),(al*.42,.064*k*muscle,.058*k*muscle,.003*k),(al*.72,.046*k,.045*k,0),(al-.014*k,.031*k,.031*k,0)]
  rows=[(sign*a,rx,rz,z) for a,rx,rz,z in rows]
  if sign<0: rows=rows[::-1]
  L(side+'Arm','upper_arm',rows,origin=arm,axis='X',seg=24)
  E(side+'ForeArm','elbow',elbow,(elbow_r,)*3,joint,seg=20)
  fl=(hand.x-elbow.x)*sign
  rows=[(.012*k,.032*k,.032*k,0),(.055*k,.047*k,.044*k,-.003*k),(fl*.40,.045*k,.042*k,-.004*k),(fl*.73,.031*k,.029*k,0),(fl-.009*k,.022*k,.022*k,0)]
  rows=[(sign*a,rx,rz,z) for a,rx,rz,z in rows]
  if sign<0:rows=rows[::-1]
  L(side+'ForeArm','forearm',rows,origin=elbow,axis='X',seg=24)
  E(side+'Hand','wrist',hand,(wrist_r,)*3,joint,seg=20)
  hs=s*b['profile']['hands'];hl=.149*hs
  def hand_shape(x,y,z,a,t):
   # Four shallow finger scallops in one continuous mitten cage.
   q=(y*sign/hl)
   z+=.0017*hs*math.cos(8*math.pi*(z/(.071*hs)+.5))*max(0,(q-.55)/.45)
   return x,y,z
  rows=[(.009*hs,.021*hs,.026*hs,0),(.045*hs,.024*hs,.037*hs,.003*hs),(.091*hs,.021*hs,.036*hs,0),(.132*hs,.016*hs,.031*hs,-.003*hs),(hl,.004*hs,.021*hs,-.004*hs)]
  rows=[(sign*a,rx,rz,z) for a,rx,rz,z in rows]
  if sign<0:rows=rows[::-1]
  L(side+'Hand','mitten',rows,origin=hand,axis='X',seg=20,shape=hand_shape)
  thumb=E(side+'Hand','thumb',hand+Vector((sign*.050*hs,-.010*hs,.041*hs)),(.030*hs,.019*hs,.022*hs),seg=20)
  # Thigh and shin cages overlap spherical sockets at every end.
  thigh=J[side+'UpLeg'];knee=J[side+'Leg'];ankle=J[side+'Foot'];toe=J[side+'Toe'];tl=thigh.y-knee.y;sl=knee.y-ankle.y
  hip_r=.077*k;kr=.048*k;ar=.032*k
  E(side+'UpLeg','hip',thigh,(hip_r,)*3,joint)
  L(side+'UpLeg','thigh',[(-tl+.016*k,.040*k,.040*k,0),(-tl*.78,.057*k,.060*k,.003*k),(-tl*.43,.078*k*muscle,.084*k*muscle,.004*k),(-tl*.17,.083*k,.087*k,0),(-.026*k,.065*k,.066*k,0)],origin=thigh,seg=28)
  E(side+'Leg','knee',knee,(kr,)*3,joint)
  L(side+'Leg','shin',[(-sl+.010*k,.025*k,.028*k,0),(-sl*.78,.032*k,.036*k,-.003*k),(-sl*.48,.049*k,.059*k,-.013*k),(-sl*.24,.054*k,.061*k,-.010*k),(-.016*k,.040*k,.041*k,0)],origin=knee,seg=24)
  E(side+'Foot','ankle',ankle,(ar,)*3,joint,seg=20)
  fs=s*b['profile']['feet'];toeZ=toe.z;heel=-.056*fs;front=toeZ+.047*fs
  # A flattened sole and a shaped instep, cut before the separate toe cap.
  foot_h=ankle.y+.025*fs
  def foot_shape(x,y,z,a,t):return x,y,z
  # Horizontal ring sections provide a genuine sole with a forward toe box.
  L(side+'Foot','instep',[(.002,.044*fs,(toeZ-heel)*.49,(toeZ+heel)*.5),(.010*fs,.047*fs,(toeZ-heel)*.50,(toeZ+heel)*.5),(.038*fs,.044*fs,(toeZ-heel)*.49,(toeZ+heel)*.5),(.065*fs,.036*fs,(toeZ-heel)*.40,(toeZ+heel)*.39), (foot_h,.024*fs,.039*fs,0)],origin=(ankle.x,0,0),seg=28)
  # Toe is hinged at the original low forefoot pivot and follows it separately.
  L(side+'Toe','toe_cap',[(.002,.043*fs,(front-toeZ)*.82,toeZ+(front-toeZ)*.20),(.010*fs,.046*fs,(front-toeZ)*.83,toeZ+(front-toeZ)*.21),(.030*fs,.042*fs,(front-toeZ)*.78,toeZ+(front-toeZ)*.20),(.043*fs,.028*fs,(front-toeZ)*.61,toeZ+(front-toeZ)*.12)],origin=(ankle.x,0,0),seg=24)
  E(side+'Toe','toe_joint',Vector((toe.x,.016*fs,toe.z)),(.038*fs,.012*fs,.012*fs),joint,seg=20,rings=8)
 # Recalculate orientation once (also corrects mirrored loft cages).
 bpy.ops.object.select_all(action='DESELECT')
 for o in bpy.context.scene.objects:
  if o.type=='MESH':
   bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT');o.select_set(False)
 return nodes
def triangles():
 total=0
 for o in bpy.context.scene.objects:
  if o.type=='MESH':o.data.calc_loop_triangles();total+=len(o.data.loop_triangles)
 return total
def run(ids=None):
 path=ROOT/'models-src/body-metadata.json';records=json.loads(path.read_text()) if path.exists() else []
 for id in ids or CFG:
  nodes=build(id);bpy.context.view_layer.update();tri=triangles();assert tri<=25000,(id,tri)
  joints=[]
  for n,o in nodes.items():
   loc=o.location;w=o.matrix_world.translation
   joints.append(dict(name=n,parent=o.parent.name if o.parent else None,local=[round(loc.x,6),round(loc.z,6),round(-loc.y,6)],world=[round(w.x,6),round(w.z,6),round(-w.y,6)]))
  bpy.ops.export_scene.gltf(filepath=str(ROOT/f'web/models/bodies/{id}.glb'),export_format='GLB',export_yup=True,export_apply=True,export_animations=False,export_texcoords=False,export_extras=True)
  bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/f'models-src/blender/body-{id}.blend'))
  record=dict(id=id,file=f'bodies/{id}.glb',triangles=tri,joints=joints)
  records=[r for r in records if r['id']!=id]+[record];path.write_text(json.dumps(records,indent=2));print('BODY',id,tri)
 return records
