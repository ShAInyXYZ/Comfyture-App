"""Original authored Comfyture set and hand models. Run via the live Blender MCP.
Every dimensional modelling helper accepts the app's +Y-up, +Z-forward frame.
The source consists of separately named closed mesh parts, with bevelled plate edges.
"""
import bpy, math, json, os
from mathutils import Vector
# the repository: COMFYTURE_ROOT, else the folder above this script, else where Blender runs
ROOT=os.environ.get('COMFYTURE_ROOT') or (os.path.dirname(os.path.dirname(os.path.abspath(__file__))) if '__file__' in globals() else os.getcwd())
P=os.path.join(ROOT,'models-src')
NEW={
 'fridge':('Refrigerator','Furniture',None,1.82),
 'stove':('Oven and stove','Furniture',None,.934),
 'kitchen-island':('Kitchen island','Furniture',None,.92),
 'office-chair':('Office chair','Furniture',{'y':.49,'z':.035,'x':[0]},None),
 'wardrobe':('Wardrobe','Furniture',None,2.05),
 'bathtub':('Freestanding bathtub','Furniture',{'y':.2,'z':.05,'x':[0]},None),
 'piano':('Upright piano','Furniture',None,1.23),
 'bus-stop':('Bus shelter','Outdoor',{'y':.47,'z':-.22,'x':[-.65,0,.65]},None),
 'trash-bin':('Street litter bin','Outdoor',None,None),
 'mailbox':('Post-mounted mailbox','Outdoor',None,None),
 'phone-booth':('Telephone booth','Outdoor',None,None),
 'tent':('A-frame camping tent','Outdoor',None,None),
 'campfire':('Campfire and stone ring','Outdoor',None,None),
 'pine-tree':('Layered pine tree','Outdoor',None,None),
 'palm-tree':('Curved palm tree','Outdoor',None,None),
 'rowing-boat':('Rowing boat','Outdoor',{'y':.43,'z':0,'x':[0]},None),
}
HAND={
 'phone':('Phone',['phone-call','walk-phone']), 'cup':('Cup',['drink']),
 'book':('Open book',['read']), 'camera':('Camera',['photo']),
 'sword':('Sword',['sword']), 'pistol':('Pistol',['aim']),
 'umbrella':('Umbrella',['stand','walk']), 'bag':('Carry bag',['stand','walk']),
 'guitar':('Acoustic guitar',['stand','sit']), 'steering-wheel':('Steering wheel',['drive'])
}
MATS={}

def V(p):return Vector((p[0],-p[2],p[1]))
def clear():
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 for me in list(bpy.data.meshes):
  if me.users==0:bpy.data.meshes.remove(me)
 for m in list(bpy.data.materials):
  if m.users==0:bpy.data.materials.remove(m)
 global MATS
 MATS={}
 for name,color in [('prop',(.55,.59,.58,1)),('accent',(.19,.26,.29,1))]:
  m=bpy.data.materials.new(name);m.diffuse_color=color;m.use_nodes=True
  bs=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');bs.inputs['Base Color'].default_value=color;bs.inputs['Roughness'].default_value=.72
  MATS[name]=m
 bpy.context.scene.unit_settings.system='METRIC'
 bpy.context.scene.unit_settings.scale_length=1

def finish(o,name,mat='prop',bevel=0,segments=2,smooth=True):
 o.name=name;o.data.name=name+'.mesh';o.data.materials.clear();o.data.materials.append(MATS[mat])
 bpy.context.view_layer.objects.active=o;o.select_set(True)
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  m=o.modifiers.new('Soft manufactured edge','BEVEL');m.width=bevel;m.segments=segments;m.limit_method='ANGLE';m.angle_limit=math.radians(35)
  bpy.ops.object.modifier_apply(modifier=m.name)
 for f in o.data.polygons:f.use_smooth=smooth
 if smooth:
  m=o.modifiers.new('Corner normals','WEIGHTED_NORMAL');m.keep_sharp=True;m.weight=40
  bpy.ops.object.modifier_apply(modifier=m.name)
 o.select_set(False);return o

def box(n,p,s,b=.015,mat='prop',rot=None,segments=2):
 bpy.ops.mesh.primitive_cube_add(size=1,location=V(p));o=bpy.context.object;o.scale=(s[0],s[2],s[1])
 if rot:o.rotation_euler=rot
 return finish(o,n,mat,min(b,min(s)*.42),segments)

def ball(n,p,s,mat='prop',seg=20,rings=10):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,radius=1,location=V(p));o=bpy.context.object;o.scale=(s[0],s[2],s[1]);return finish(o,n,mat)

def rod(n,a,b,r,mat='prop',r2=None,vertices=20,bev=.003):
 a,b=V(a),V(b);v=b-a
 bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r,radius2=r if r2 is None else r2,depth=v.length,location=(a+b)*.5)
 o=bpy.context.object;o.rotation_euler=v.to_track_quat('Z','Y').to_euler();return finish(o,n,mat,min(bev,v.length*.2,r*.3),2)

def mesh(n,verts,faces,mat='prop',bevel=0,smooth=True):
 import bmesh
 me=bpy.data.meshes.new(n+'.mesh');me.from_pydata([V(v) for v in verts],[],faces);me.update()
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(me);bm.free()
 o=bpy.data.objects.new(n,me);bpy.context.collection.objects.link(o);return finish(o,n,mat,bevel,2,smooth)

def path(n,pts,r,mat='prop',sides=8,closed=False):
 # Smooth tube along a deliberately designed centreline; caps keep open paths closed.
 pts=[Vector(p) for p in pts];verts=[];faces=[];N=len(pts)
 # A consistent plane normal avoids tube twists when tangents cross a global axis.
 normal=None
 for k in range(N-2):
  candidate=(pts[k+1]-pts[k]).cross(pts[k+2]-pts[k+1])
  if candidate.length>1e-8:
   normal=candidate.normalized();break
 if normal is None:
  tangent=(pts[-1]-pts[0]).normalized()
  ref=min([Vector((1,0,0)),Vector((0,1,0)),Vector((0,0,1))],key=lambda a:abs(a.dot(tangent)))
  normal=tangent.cross(ref).normalized()
 for i,p in enumerate(pts):
  t=(pts[(i+1)%N]-pts[(i-1)%N]) if closed else (pts[min(i+1,N-1)]-pts[max(i-1,0)])
  t.normalize();u=t.cross(normal).normalized();v=t.cross(u)
  for j in range(sides):verts.append(p+r*(u*math.cos(j*math.tau/sides)+v*math.sin(j*math.tau/sides)))
 for i in range(N if closed else N-1):
  for j in range(sides):faces.append((i*sides+j,i*sides+(j+1)%sides,((i+1)%N)*sides+(j+1)%sides,((i+1)%N)*sides+j))
 if not closed:faces.extend([tuple(reversed(range(sides))),tuple((N-1)*sides+j for j in range(sides))])
 return mesh(n,verts,faces,mat)

def ring(n,c,r,t,mat='prop',axis='y',N=32):
 pts=[]
 for i in range(N):
  a=i*math.tau/N
  q=(r*math.cos(a),0,r*math.sin(a)) if axis=='y' else ((r*math.cos(a),r*math.sin(a),0) if axis=='z' else (0,r*math.cos(a),r*math.sin(a)))
  pts.append(tuple(c[k]+q[k] for k in range(3)))
 return path(n,pts,t,mat,8,True)

def lathe(n,profile,c=(0,0,0),mat='prop',N=32):
 # Closed radial section in (radius, height); axis y.
 vs=[];fs=[]
 for r,y in profile:
  for j in range(N):
   a=j*math.tau/N;vs.append((c[0]+r*math.cos(a),c[1]+y,c[2]+r*math.sin(a)))
 for k in range(len(profile)):
  for j in range(N):fs.append((k*N+j,k*N+(j+1)%N,((k+1)%len(profile))*N+(j+1)%N,((k+1)%len(profile))*N+j))
 return mesh(n,vs,fs,mat)

def profile_extrude(n,outline,depth,c=(0,0,0),mat='prop',bevel=.01):
 # Outline x/y, thickness z. Solid closed, front facing +Z.
 vs=[(c[0]+x,c[1]+y,c[2]+z) for z in [-depth/2,depth/2] for x,y in outline];N=len(outline)
 fs=[tuple(reversed(range(N))),tuple(range(N,2*N))]
 fs.extend((i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N));return mesh(n,vs,fs,mat,bevel)

def handle(n,x,y,z,w=.16,h=.06,mat='accent'):
 return path(n,[(x-w/2,y-h,z-.02),(x-w/2,y,z),(x-w*.38,y+h*.35,z+.01),(x+w*.38,y+h*.35,z+.01),(x+w/2,y,z),(x+w/2,y-h,z-.02)],.012,mat,8)

def feet(w,d,h=.08):
 for x in [-w/2,w/2]:
  for z in [-d/2,d/2]:box('foot_%s_%s'%(x,z),(x,h/2,z),(.07,h,.07),.012,'accent')

def fridge():
 box('cabinet',(0,.93,-.025),(.76,1.78,.66),.045)
 box('kickplate',(0,.06,0),(.69,.12,.58),.025,'accent')
 box('freezer_door',(0,1.51,.324),(.73,.54,.075),.035)
 box('refrigerator_door',(0,.635,.324),(.73,1.17,.075),.035)
 for y,h in [(1.49,.26),(.9,.42)]:
  path('vertical_handle_'+str(y),[(-.25,y-h/2,.37),(-.25,y-h/2+.03,.41),(-.25,y+h/2-.03,.41),(-.25,y+h/2,.37)],.016,'accent')
 box('temperature_display',(.16,1.63,.367),(.15,.07,.009),.009,'accent')
 for x in [-.27,.27]:box('hinge_'+str(x),(x,1.8,-.02),(.08,.04,.12),.012,'accent')

def stove():
 box('oven_cabinet',(0,.44,0),(.7,.84,.62),.025);feet(.56,.48,.08)
 box('cooktop',(0,.88,0),(.72,.04,.64),.012,'accent')
 box('control_fascia',(0,.79,.323),(.68,.14,.045),.012)
 for x in [-.24,-.08,.08,.24]:rod('knob_'+str(x),(x,.79,.346),(x,.79,.369),.028,'accent',vertices=16)
 box('oven_door',(0,.4,.326),(.64,.56,.055),.025)
 box('oven_window',(0,.38,.358),(.49,.34,.012),.035,'accent')
 handle('oven_handle',0,.65,.375,.46,.015)
 for x in [-.18,.18]:
  for z in [-.17,.17]:
   rod('burner',(x,.9,z),(x,.907,z),.105,vertices=24)
   ring('burner_ring',(x,.912,z),.077,.008,'accent',N=24)
   for axis in [0,1]:
    if axis:box('burner_grate',(x,.927,z),(.18,.014,.012),.004,'accent')
    else:box('burner_grate',(x,.927,z),(.012,.014,.18),.004,'accent')

def kitchen_island():
 box('plinth',(0,.065,0),(1.44,.13,.7),.02,'accent')
 box('cabinet',(0,.48,-.03),(1.5,.76,.74),.018)
 box('countertop',(0,.89,0),(1.7,.06,.94),.025)
 for x in [-.49,0,.49]:
  box('door_'+str(x),(x,.39,.356),(.475,.54,.035),.012)
  box('drawer_'+str(x),(x,.755,.356),(.475,.15,.035),.01)
  handle('drawer_pull_'+str(x),x,.755,.389,.18,.006)
  handle('door_pull_'+str(x),x,.58,.389,.18,.006)
 for y in [.18,.52]:box('end_shelf_'+str(y),(.795,y,-.02),(.06,.035,.66),.009,'accent')

def office_chair():
 rod('gas_lift',(0,.14,0),(0,.43,0),.038,'accent')
 rod('collar',(0,.14,0),(0,.25,0),.055)
 for i in range(5):
  a=i*math.tau/5;x=.28*math.cos(a);z=.28*math.sin(a)
  path('base_spoke_'+str(i),[(0,.18,0),(x*.5,.14,z*.5),(x,.09,z)],.026,'accent')
  rod('caster_'+str(i),(x-.022,.044,z),(x+.022,.044,z),.044,'accent',vertices=16)
 box('seat_shell',(0,.435,.025),(.5,.055,.48),.024,'accent')
 box('seat_cushion',(0,.475,.035),(.49,.03,.46),.012)
 path('back_spine',[(0,.39,-.19),(0,.64,-.27),(0,1.03,-.23)],.025,'accent')
 box('back_shell',(0,.805,-.232),(.46,.44,.065),.032,'accent')
 box('back_cushion',(0,.81,-.19),(.43,.4,.05),.024)
 for s in [-1,1]:
  path('armrest_support_'+str(s),[(s*.23,.42,-.12),(s*.29,.58,-.12),(s*.29,.66,-.04)],.017,'accent')
  box('armrest_'+str(s),(s*.29,.67,.01),(.07,.035,.29),.016)

def wardrobe():
 box('plinth',(0,.055,0),(1.15,.11,.52),.02,'accent')
 box('cabinet',(0,1.055,-.025),(1.24,1.99,.57),.025)
 for x in [-.303,.303]:
  box('door_'+str(x),(x,1.07,.286),(.59,1.9,.04),.016)
  box('inset_panel_'+str(x),(x,1.25,.309),(.49,1.41,.012),.018)
  path('pull_'+str(x),[(x*.2,.87,.321),(x*.2,.9,.36),(x*.2,1.15,.36),(x*.2,1.18,.321)],.012,'accent')
 box('cornice',(0,2.025,0),(1.3,.05,.64),.02)

def bathtub():
 # A continuous four-ring basin shell, oval in plan and deep enough for seating.
 N=48;rings=[(.78,.39,.11),(.94,.45,.54),(.86,.37,.56),(.66,.26,.2)]
 vs=[];fs=[]
 for rx,rz,y in rings:
  for j in range(N):
   a=j*math.tau/N;vs.append((rx*math.cos(a),y,rz*math.sin(a)))
 for k in range(3):
  for j in range(N):fs.append((k*N+j,k*N+(j+1)%N,(k+1)*N+(j+1)%N,(k+1)*N+j))
 fs.append(tuple(reversed(range(N))));fs.append(tuple(3*N+j for j in range(N)))
 mesh('basin_shell',vs,fs,bevel=.01)
 for x in [-.51,.51]:
  for z in [-.22,.22]:ball('foot',(x,.075,z),(.09,.075,.07),'accent',16,8)
 rod('drain',(.48,.202,0),(.48,.207,0),.035,'accent',vertices=20)
 path('faucet',[(.71,.48,-.23),(.71,.78,-.23),(.71,.82,-.2),(.71,.82,-.05),(.71,.77,-.035)],.018,'accent')
 for x in [.63,.79]:rod('tap',(x,.55,-.24),(x,.6,-.24),.026,'accent',vertices=16)

def piano():
 box('case',(0,.7,-.1),(1.42,1.0,.42),.02)
 box('lower_front',(0,.33,.14),(1.3,.49,.08),.018)
 box('soundboard_panel',(0,.98,.135),(1.28,.4,.075),.018)
 box('top_lid',(0,1.205,-.08),(1.5,.05,.49),.018)
 box('keybed',(0,.7,.245),(1.43,.075,.37),.012)
 box('music_ledge',(0,.84,.207),(.95,.025,.1),.008,'accent')
 for i in range(28):box('white_key_%02d'%i,((i-13.5)*.044,.75,.28),(.042,.024,.27),.003,segments=1)
 for i in range(27):
  if i%7 not in [2,6]:box('black_key_%02d'%i,((i-13)*.044,.774,.218),(.023,.025,.15),.003,'accent',segments=1)
 for x in [-.65,.65]:
  box('cheek_'+str(x),(x,.79,.23),(.11,.14,.33),.018)
  box('leg_'+str(x),(x,.325,.27),(.1,.65,.13),.016)
  box('foot_'+str(x),(x,.055,.2),(.14,.11,.38),.02,'accent')
 for x in [-.09,0,.09]:box('pedal_'+str(x),(x,.075,.245),(.045,.035,.18),.015,'accent')

def bus_stop():
 box('base',(0,.045,0),(3.0,.09,1.3),.025,'accent')
 for x in [-1.35,1.35]:
  for z in [-.48,.4]:rod('post',(x,.09,z),(x,2.22,z),.04)
 box('roof',(0,2.24,-.01),(3.08,.12,1.42),.05)
 box('rear_panel',(0,1.23,-.49),(2.63,1.9,.035),.012,'accent')
 for x in [-1.35,1.35]:box('side_panel',(x,1.23,-.05),(.025,1.9,.83),.009,'accent')
 for y in [.38,1.0,1.94]:box('rear_rail_'+str(y),(0,y,-.462),(2.68,.035,.035),.01)
 box('bench_seat',(0,.44,-.22),(2.12,.06,.39),.022)
 box('bench_back',(0,.73,-.385),(2.12,.25,.05),.018)
 for x in [-.85,.85]:box('bench_leg',(x,.25,-.22),(.07,.4,.22),.016)
 box('route_sign',(-.88,1.65,-.446),(.48,.58,.025),.025)
 for y,w in [(1.82,.31),(1.7,.31),(1.58,.2),(1.46,.26)]:box('route_line',(-.88,y,-.428),(w,.018,.009),.004,'accent')

def trash_bin():
 lathe('body',[(.25,.04),(.28,.08),(.3,.78),(.28,.81),(.255,.79),(.235,.11)],N=32)
 ring('top_rim',(0,.79,0),.283,.025,'accent')
 rod('base',(0,0,0),(0,.08,0),.25,'accent')
 for i in range(12):
  a=i*math.tau/12;rod('rib_%02d'%i,(.26*math.cos(a),.12,.26*math.sin(a)),(.291*math.cos(a),.7,.291*math.sin(a)),.009,'accent',vertices=8)
 # Hood raised above a genuinely open deposit slot.
 for x in [-.25,.25]:box('hood_support',(x,.85,0),(.045,.15,.1),.01)
 ball('hood',(0,.94,0),(.31,.065,.31))

def mailbox():
 box('post',(0,.6,-.06),(.095,1.2,.095),.016)
 box('post_foot',(0,.025,-.06),(.22,.05,.22),.016,'accent')
 profile=[(-.22,0),(.22,0),(.22,.24),(.203,.32),(.16,.39),(.08,.435),(0,.45),(-.08,.435),(-.16,.39),(-.203,.32),(-.22,.24)]
 profile_extrude('mailbox_shell',profile,.63,(0,1.08,0),bevel=.025)
 profile_extrude('door',[(x*.92,y*.92) for x,y in profile],.025,(0,1.095,.33),bevel=.014)
 box('mail_slot',(0,1.32,.35),(.26,.027,.012),.007,'accent')
 handle('door_pull',0,1.19,.364,.11,.012)
 rod('flag_axle',(.22,1.23,-.12),(.254,1.23,-.12),.026,'accent')
 box('flag_arm',(.26,1.4,-.12),(.018,.35,.025),.007,'accent')
 box('flag',(.26,1.53,-.04),(.02,.1,.17),.012,'accent')

def phone_booth():
 box('base',(0,.055,0),(.96,.11,.96),.025,'accent')
 for x in [-.42,.42]:
  for z in [-.42,.42]:box('corner_post',(x,1.18,z),(.065,2.18,.065),.012)
 box('roof',(0,2.3,0),(1.02,.18,1.02),.05)
 for x in [-.42,.42]:box('side_glass',(x,1.25,0),(.028,1.85,.76),.008,'accent')
 box('back_glass',(0,1.25,-.42),(.76,1.85,.028),.008,'accent')
 for y in [.32,1.12,1.94]:
  for x in [-.42,.42]:box('side_crossbar',(x,y,0),(.045,.03,.8),.006)
  box('back_crossbar',(0,y,-.42),(.8,.03,.045),.006)
 box('header_sign',(0,2.17,.443),(.72,.18,.022),.012,'accent')
 box('phone_symbol',(0,2.17,.458),(.22,.038,.012),.01)
 box('payphone',(0,1.25,-.31),(.27,.43,.15),.022)
 box('dial_panel',(.04,1.27,-.225),(.13,.18,.022),.01,'accent')
 for xx in [-.005,.045,.095]:
  for yy in [1.21,1.26,1.31]:box('key',(xx,yy,-.21),(.026,.025,.008),.004)
 path('receiver',[(-.1,1.08,-.2),(-.13,1.12,-.18),(-.13,1.39,-.18),(-.1,1.43,-.2)],.027,'accent')
 path('cord',[(-.1,1.09,-.2),(-.12,.91,-.18),(.03,.9,-.17),(.1,1.04,-.22)],.009,'accent')

def tent():
 # Separate softly bevelled canvas panels leave a real triangular entrance.
 ridge=1.48;w=1.15;d=1.15
 box('groundsheet',(0,.025,0),(2.3,.05,2.3),.02,'accent')
 for s in [-1,1]:
  vs=[(s*w,.05,-d),(0,ridge,-d),(0,ridge,d),(s*w,.05,d)]
  # closed 12 mm fabric shell
  vv=vs+[(x,y+.012,z) for x,y,z in vs];mesh('canvas_'+str(s),vv,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],bevel=0)
  rod('front_pole_'+str(s),(s*w,.035,d),(0,ridge+.02,d),.018,'accent')
  # pulled-open doorway flap
  vs=[(s*w,.05,d-.02),(0,ridge-.03,d-.02),(s*.79,.06,d+.08)]
  mesh('door_flap_'+str(s),vs+[(x,y,z+.012) for x,y,z in vs],[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)],bevel=.004)
 rod('ridge_pole',(0,ridge,-d-.02),(0,ridge,d+.02),.018,'accent')
 mesh('back_canvas',[(-w,.05,-d),(w,.05,-d),(0,ridge,-d),(-w,.05,-d+.012),(w,.05,-d+.012),(0,ridge,-d+.012)],[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)])
 for z in [-1.43,1.43]:
  path('guyline',[(0,ridge,z*.78),(0,.04,z)],.007,'accent',6)
  rod('peg',(0,0,z),(0,.12,z+.02),.015,'accent',vertices=10)

def campfire():
 for i in range(10):
  a=i*math.tau/10;ball('ring_stone_%02d'%i,(.48*math.cos(a),.09,.48*math.sin(a)),(.14,.09,.115),seg=12,rings=6)
 for i in range(4):
  a=i*math.pi/4;rod('log_%02d'%i,(-.37*math.cos(a),.12+i*.035,-.37*math.sin(a)),(.37*math.cos(a),.12+i*.035,.37*math.sin(a)),.07,'accent',vertices=12,bev=.012)
 # Broad flame shapes, deliberate asymmetry rather than noisy emissive particles.
 for i,(x,z,h,lean) in enumerate([(-.16,.02,.46,-.09),(.1,-.08,.69,.12),(.01,.12,.38,-.03)]):
  outline=[(-.11,0),(-.14,.13),(-.09,.27),(-.02,.33),(lean,h),(.08,.3),(.12,.14),(.09,0)]
  profile_extrude('flame_'+str(i),outline,.07,(x,.2,z),'prop',.025)

def pine_tree():
 rod('trunk',(0,0,0),(0,3.55,0),.18,'accent',r2=.07,vertices=20,bev=.012)
 for i,(y,r,h) in enumerate([(.65,1.04,1.4),(1.45,.85,1.32),(2.2,.64,1.16),(2.95,.41,1.05)]):
  N=24;vs=[];fs=[]
  for k,(hh,rr) in enumerate([(0,.65),(.12,1),(.48,.74),(.88,.38),(1,.05)]):
   for j in range(N):
    a=j*math.tau/N;rrr=r*rr*(1+.035*math.cos(6*a+i));vs.append((rrr*math.cos(a),y+h*hh,rrr*math.sin(a)))
  for k in range(4):
   for j in range(N):fs.append((k*N+j,k*N+(j+1)%N,(k+1)*N+(j+1)%N,(k+1)*N+j))
  fs.extend([tuple(reversed(range(N))),tuple(4*N+j for j in range(N))]);mesh('foliage_tier_'+str(i),vs,fs,bevel=min(.006,r*.006))

def palm_tree():
 # A swept tapered trunk and individually sculpted, thick ribbon leaves.
 N=16;K=11;vs=[];fs=[]
 for k in range(K):
  t=k/(K-1);cx=.3*math.sin(t*1.5);cy=3.6*t;rr=.18-.085*t
  for j in range(N):
   a=j*math.tau/N;vs.append((cx+rr*math.cos(a),cy,rr*math.sin(a)))
 for k in range(K-1):
  for j in range(N):fs.append((k*N+j,k*N+(j+1)%N,(k+1)*N+(j+1)%N,(k+1)*N+j))
 fs.extend([tuple(reversed(range(N))),tuple((K-1)*N+j for j in range(N))]);mesh('curved_trunk',vs,fs,'accent')
 for k in range(1,10):ring('trunk_collar_'+str(k),(.3*math.sin(k/10*1.5),3.6*k/10,0),.18-.085*k/10,.009,'prop',N=16)
 for i in range(9):
  a=i*math.tau/9;cx=.3;pts=[];verts=[];faces=[]
  for j in range(8):
   t=j/7;r=1.8*t;y=3.58+.64*math.sin(t*math.pi)-.56*t;w=.24*math.sin(t*math.pi)**.7+.008
   p=(cx+r*math.cos(a),y,r*math.sin(a));pts.append(p)
   for side in [-1,0,1]:verts.append((p[0]-side*w*math.sin(a),y+(.05 if side==0 else 0),p[2]+side*w*math.cos(a)))
  for j in range(7):
   for s in range(2):faces.append((j*3+s,(j+1)*3+s,(j+1)*3+s+1,j*3+s+1))
  o=mesh('frond_'+str(i),verts,faces);bpy.context.view_layer.objects.active=o
  m=o.modifiers.new('Leaf thickness','SOLIDIFY');m.thickness=.018;bpy.ops.object.modifier_apply(modifier=m.name)
  path('frond_rib_'+str(i),pts,.012,'accent',6)
 for x,z in [(.17,.11),(.38,.1),(.28,-.15)]:ball('coconut',(x,3.44,z),(.13,.15,.13),'accent',16,8)

def rowing_boat():
 # Closed clinker-like shell with a true hollow interior and a pointed bow.
 N=40;vs=[];fs=[]
 for y,w,l in [(.08,.21,1.0),(.5,.63,1.65),(.51,.585,1.58),(.18,.19,.96)]:
  for j in range(N):
   a=j*math.tau/N;z=l*math.cos(a);x=w*math.sin(a)*(1-.35*max(math.cos(a),0));vs.append((x,y+.08*abs(math.cos(a))**4,z))
 for k in range(3):
  for j in range(N):fs.append((k*N+j,k*N+(j+1)%N,(k+1)*N+(j+1)%N,(k+1)*N+j))
 fs.extend([tuple(reversed(range(N))),tuple(3*N+j for j in range(N))]);mesh('hull',vs,fs,bevel=.012)
 pts=[]
 for j in range(N):
  a=j*math.tau/N;pts.append((.61*math.sin(a)*(1-.35*max(math.cos(a),0)),.525+.08*abs(math.cos(a))**4,1.615*math.cos(a)))
 path('gunwale',pts,.025,'accent',8,True)
 for z,w in [(-.73,.92),(0,1.13),(.65,.85)]:box('thwart_'+str(z),(0,.405,z),(w,.05,.21),.018)
 for x in [-.5,.5]:
  ring('oarlock',(x,.55,.1),.025,.008,'accent',axis='z',N=16)
 for i,x in enumerate([-.3,.3]):
  rod('oar_shaft_'+str(i),(x,.46,-1.13),(x,.46,1.14),.021,'accent',vertices=12)
  box('oar_blade_'+str(i),(x,.46,1.26),(.16,.04,.48),.018)

# Hand props are designed in a convenient upright canonical frame, then transformed
# together into the right-hand frame. Grip origin is retained exactly at zero.
def h_phone():
 box('body',(0,.025,0),(.076,.154,.011),.005)
 box('screen',(0,.027,.0065),(.067,.135,.003),.004,'accent')
 box('speaker',(0,.087,.008),(.018,.002,.0015),.0007)
 for x in [-.019,.019]:rod('rear_camera',(x,.083,-.007),(x,.083,-.01),.008,'accent',vertices=16,bev=.001)
 box('side_button',(-.039,.041,0),(.002,.025,.004),.001,'accent')

def h_cup():
 # Origin sits through the handle opening, not inside the cup body.
 lathe('ceramic_body',[(.029,-.048),(.036,-.042),(.044,.061),(.041,.067),(.036,.066),(.032,-.037)],c=(.071,0,0),N=32)
 pts=[]
 for j in range(19):
  a=-math.pi*.62+j/18*math.pi*1.24;pts.append((.027-.031*math.cos(a),.005+.038*math.sin(a),0))
 path('handle',pts,.009,sides=10)
 ring('lip',(.071,.064,0),.039,.003,N=32)

def h_book():
 # Open book: lower right corner is held, pages fan away to the reader's left.
 for side in [-1,1]:
  outline=[(0,-.01),(side*.16,.012),(side*.16,.24),(0,.218)]
  profile_extrude('cover_'+str(side),outline,.012,(-.145,-.012,0),'accent',.003)
  profile_extrude('page_block_'+str(side),[(x*.96,y*.96+.005) for x,y in outline],.012,(-.145,-.012,.01),bevel=.003)
  for j in range(3):
   rod('page_edge_'+str(side)+'_'+str(j),(-.145+side*.018,.01+j*.002,.02+j*.002),(-.145+side*.148,.03+j*.002,.02+j*.002),.0008,'accent',vertices=6,bev=0)
 path('spine',[(-.145,-.018,-.006),(-.145,.22,-.006)],.006,'accent')
 path('bookmark',[(-.145,.16,.02),(-.14,.005,.028),(-.13,-.05,.03)],.004,'accent',6)

def h_camera():
 box('camera_body',(.049,.012,0),(.145,.085,.05),.012)
 box('handgrip',(0,0,.018),(.034,.09,.061),.014,'accent')
 rod('lens_barrel',(.069,.01,.02),(.069,.01,.095),.033,'accent',vertices=32,bev=.003)
 ring('focus_ring',(.069,.01,.07),.033,.004,'prop',axis='z',N=28)
 rod('front_glass',(.069,.01,.097),(.069,.01,.1),.026,'accent',vertices=32,bev=.001)
 box('viewfinder',(.062,.063,-.004),(.043,.022,.035),.005,'accent')
 box('screen',(.061,.009,-.028),(.085,.053,.005),.006,'accent')
 rod('shutter',(.002,.047,.007),(.002,.052,.007),.008,'accent',vertices=16,bev=.001)
 for x in [-.022,.124]:ring('strap_eye',(x,.033,0),.008,.002,'accent',axis='z',N=12)

def h_sword():
 rod('grip',(0,-.09,0),(0,.09,0),.022,'accent',vertices=16,bev=.007)
 for y in [-.065,-.03,.005,.04,.075]:ring('grip_binding',(0,y,0),.0225,.002,'prop',N=16)
 ball('pommel',(0,-.108,0),(.035,.025,.025),seg=16,rings=8)
 path('crossguard',[(-.14,.083,0),(-.1,.107,0),(0,.11,0),(.1,.107,0),(.14,.083,0)],.014,'prop',8)
 # Diamond cross-section, carefully tapered to one tip; no coplanar overlay.
 vs=[]
 for y,w,t in [(.11,.041,.009),(.2,.038,.009),(.75,.026,.006)]:vs.extend([(-w,y,0),(0,y,t),(w,y,0),(0,y,-t)])
 vs.append((0,.95,0));fs=[(3,2,1,0)]
 for k in range(2):
  for j in range(4):fs.append((k*4+j,k*4+(j+1)%4,(k+1)*4+(j+1)%4,(k+1)*4+j))
 for j in range(4):fs.append((8+j,8+(j+1)%4,12))
 mesh('blade',vs,fs,bevel=.001,smooth=False)

def h_pistol():
 # Stylized nonfunctional scene prop, no internal mechanism.
 profile_extrude('grip',[(-.025,-.065),(.02,-.065),(.034,.042),(-.013,.05)],.032,mat='accent',bevel=.008)
 box('slide',(0,.065,.067),(.037,.038,.2),.006)
 box('frame',(0,.042,.051),(.034,.018,.17),.004,'accent')
 rod('muzzle',(0,.065,.167),(0,.065,.17),.009,'accent',vertices=16,bev=.001)
 path('trigger_guard',[(0,.04,.035),(0,-.007,.038),(0,-.013,.08),(0,.006,.095),(0,.04,.095)],.005,'accent',8)
 path('trigger',[(0,.035,.062),(0,.015,.056),(0,.012,.068)],.003,'prop',6)
 box('front_sight',(0,.09,.143),(.008,.013,.013),.002,'accent')
 for z in [-.013,-.004,.005]:box('slide_groove',(0,.078,z),(.04,.008,.002),.0007,'accent')

def h_umbrella():
 rod('shaft',(0,-.075,0),(0,.69,0),.008,'accent',vertices=16,bev=.001)
 path('hook',[(0,.025,0),(0,-.07,0),(.008,-.105,0),(.032,-.117,0),(.057,-.105,0),(.063,-.077,0)],.012,'prop',10)
 N=48;vs=[];fs=[]
 for k in range(5):
  t=k/4;r=.55*t;y=.7-.23*t*t
  for j in range(N):
   a=j*math.tau/N;rr=r*(1-.04*t*math.cos(a*8));vs.append((max(rr,.001)*math.cos(a),y,max(rr,.001)*math.sin(a)))
 for k in range(4):
  for j in range(N):fs.append((k*N+j,k*N+(j+1)%N,(k+1)*N+(j+1)%N,(k+1)*N+j))
 o=mesh('canopy',vs,fs);bpy.context.view_layer.objects.active=o;m=o.modifiers.new('Canvas thickness','SOLIDIFY');m.thickness=.006;bpy.ops.object.modifier_apply(modifier=m.name)
 for i in range(8):
  a=i*math.tau/8;pts=[(.53*t*math.cos(a),.69-.23*t*t,.53*t*math.sin(a)) for t in [0,.25,.5,.75,1]];path('rib_'+str(i),pts,.004,'accent',6)
 rod('tip',(0,.69,0),(0,.74,0),.012,'accent',vertices=12,bev=.002)

def h_bag():
 box('bag_body',(0,-.26,0),(.34,.31,.14),.045)
 box('front_pocket',(0,-.265,.076),(.25,.2,.022),.025,'accent')
 box('pocket_flap',(0,-.173,.083),(.26,.045,.024),.016)
 box('zipper',(0,-.101,0),(.26,.009,.016),.004,'accent')
 for z in [-.045,.045]:path('handle_'+str(z),[(-.104,-.12,z),(-.095,-.01,z),(-.065,.018,z),(.065,.018,z),(.095,-.01,z),(.104,-.12,z)],.012,'accent',10)
 for x in [-.14,.14]:rod('seam',(x,-.38,.07),(x,-.14,.07),.003,'accent',vertices=6,bev=0)

def h_guitar():
 # Grip is centred around the neck, with body hanging below the hand.
 outline=[(0,-.79),(-.12,-.77),(-.18,-.69),(-.19,-.59),(-.15,-.51),(-.11,-.47),(-.13,-.4),(-.12,-.34),(-.07,-.29),(0,-.28),(.07,-.29),(.12,-.34),(.13,-.4),(.11,-.47),(.15,-.51),(.19,-.59),(.18,-.69),(.12,-.77)]
 profile_extrude('body',outline,.095,(0,0,0),bevel=.024)
 profile_extrude('soundboard',[(x*.95,(y+.54)*.96-.54) for x,y in outline],.008,(0,0,.05),bevel=.001)
 rod('soundhole',(0,-.43,.054),(0,-.43,.059),.049,'accent',vertices=32,bev=.001)
 ring('rosette',(0,-.43,.061),.054,.003,'accent',axis='z',N=32)
 box('neck',(0,-.07,0),(.052,.48,.038),.014,'accent')
 box('fingerboard',(0,-.07,.024),(.054,.48,.012),.004,'accent')
 box('headstock',(0,.225,0),(.072,.13,.025),.014)
 box('bridge',(0,-.64,.063),(.13,.026,.018),.004,'accent')
 for j in range(6):path('string_'+str(j),[((j-2.5)*.007,-.644,.075),((j-2.5)*.007,.25,.035)],.0007,'accent',5)
 for j in range(10):box('fret_'+str(j),(0,-.27+j*.044,.031),(.052,.002,.002),.0005)
 for x in [-.05,.05]:
  for y in [.18,.22,.26]:rod('tuning_key',(x*.65,y,0),(x,y,0),.009,'accent',vertices=10,bev=.002)

def h_steering_wheel():
 # Grip at the right-hand 3-o'clock rim, wheel centre to the left.
 ring('rim',(.175,0,0),.175,.017,'prop',axis='z',N=48)
 rod('hub',(.175,0,-.018),(.175,0,.02),.052,'accent',vertices=24,bev=.008)
 for a in [0,math.pi,math.pi*1.5]:
  path('spoke_'+str(a),[(.175+.035*math.cos(a),.035*math.sin(a),0),(.175+.155*math.cos(a),.155*math.sin(a),0)],.014,'accent',8)
 box('horn',(.175,0,.023),(.067,.055,.014),.008)

FUNCS={k:globals()[k.replace('-','_')] for k in NEW}
HFUNCS={k:globals()['h_'+k.replace('-','_')] for k in HAND}

def objects():return [o for o in bpy.context.scene.objects if o.type=='MESH']
def bounds():
 bpy.context.view_layer.update();vs=[o.matrix_world@Vector(v) for o in objects() for v in o.bound_box]
 lo=Vector([min(v[k] for v in vs) for k in range(3)]);hi=Vector([max(v[k] for v in vs) for k in range(3)]);return lo,hi

def build(type,hand=False):
 global ASSET_SHIFT
 ASSET_SHIFT=Vector((0,0,0))
 clear();(HFUNCS if hand else FUNCS)[type]()
 if hand:
  # Canonical axes x=across palm, y=toward thumb, z=out of palm become
  # native hand x=-longitudinal, y=-palm, z=thumb. Proper rotation, no reflections.
  from mathutils import Matrix
  R=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1))) # Blender rotation follows app y→z, z→-y
  # Conversion C maps app to Blender; canonical transform A: x→-x,y→z,z→y.
  C=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
  A=Matrix(((-1,0,0,0),(0,0,1,0),(0,1,0,0),(0,0,0,1)))
  if type in ['pistol','camera']:
   # Lens/barrel follows the finger axis -X; upright grip follows thumb +Z.
   A=Matrix(((0,0,-1,0),(-1,0,0,0),(0,1,0,0),(0,0,0,1)))
  T=C@A@C.inverted()
  for o in objects():o.matrix_world=T@o.matrix_world
 else:
  lo,hi=bounds();delta=Vector((-(lo.x+hi.x)/2,-(lo.y+hi.y)/2,-lo.z))
  for o in objects():o.location+=delta
  ASSET_SHIFT=Vector((delta.x,delta.z,-delta.y))
 root=bpy.data.objects.new(('hand.' if hand else 'prop.')+type,None);bpy.context.collection.objects.link(root)
 for o in objects():o.parent=root
 bpy.context.view_layer.update();return objects()

def triangle_count():
 n=0
 for o in objects():o.data.calc_loop_triangles();n+=len(o.data.loop_triangles)
 return n

def run(ids=None,hand=False):
 catalog=HAND if hand else NEW;ids=list(catalog) if ids is None else ids;out=[]
 folder=os.path.join(ROOT,'web/models', 'hand' if hand else 'props');os.makedirs(folder,exist_ok=True);os.makedirs(os.path.join(P,'blender'),exist_ok=True)
 for id in ids:
  build(id,hand);n=triangle_count()
  if n>6000:raise RuntimeError('%s has %s triangles'%(id,n))
  lo,hi=bounds();size=hi-lo
  bpy.ops.wm.save_as_mainfile(filepath=os.path.join(P,'blender',('hand-' if hand else 'new-')+id+'.blend'))
  bpy.ops.export_scene.gltf(filepath=os.path.join(folder,id+'.glb'),export_format='GLB',export_yup=True,export_materials='EXPORT',export_texcoords=False,export_normals=True,export_animations=False,export_cameras=False,export_lights=False)
  row={'type':id,'name':catalog[id][0],'file':('hand/' if hand else 'props/')+id+'.glb','triangles':n}
  if hand:
   row.update({'modelGripOrigin':[0,0,0],'gripCoordinateSpace':'hand-joint-local','grips':{'right':{'joint':'RightHand','position':[-.075,-.018,0],'quaternion':[0,0,0,1]},'left':{'joint':'LeftHand','position':[.075,-.018,0],'quaternion':[0,0,0,1],'scale':[-1,1,1]}},'poses':catalog[id][1]})
  else:
   seat=catalog[id][2]
   if seat:seat={'y':round(seat['y']+ASSET_SHIFT.y,6),'z':round(seat['z']+ASSET_SHIFT.z,6),'x':[round(x+ASSET_SHIFT.x,6) for x in seat['x']]}
   top=catalog[id][3]
   if top is not None:top=round(top+ASSET_SHIFT.y,6)
   row.update({'category':catalog[id][1],'size':[round(size.x,6),round(size.z,6),round(size.y,6)],'seat':seat,'top':top,'modules':[]})
  out.append(row)
 pathout=os.path.join(P,'hand-metadata.json' if hand else 'new-metadata.json')
 # Partial regenerations merge records, preserving canonical order.
 if len(ids)!=len(catalog) and os.path.exists(pathout):
  old={r['type']:r for r in json.load(open(pathout))};old.update({r['type']:r for r in out});out=[old[k] for k in catalog if k in old]
 with open(pathout,'w') as f:json.dump(out,f,indent=2)
 return out
