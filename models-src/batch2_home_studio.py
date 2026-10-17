"""Batch 2: authored studio, home, retail and institutional clay set pieces.

Dimensions are metres in the application X-right / Y-up / Z-front frame.
Every silhouette is assembled from separately named manufactured or organic parts.
"""
import math
import bpy
from batch2_common import box, ball, rod, mesh, path, ring, lathe, profile_extrude, handle

CATALOG={}
def entry(typ,name,category,themes,tags='',budget=6000,priority='P1',grip=None,poses=None,seat=None,top=None):
 d=dict(name=name,category=category,themes=themes.split(),tags=list(dict.fromkeys(typ.split('-')+tags.split(','))),budget=budget,priority=priority)
 if grip is not None:d.update(grip=grip,poses=poses or ['carry','stand','walk'])
 if seat is not None:d['seat']=seat
 if top is not None:d['top']=top
 CATALOG[typ]=d

for typ,name,tags in [
 ('softbox','Softbox on a stand','lighting,photography,diffuser'),('led-panel','LED panel on a stand','lighting,video,light'),
 ('c-stand','C-stand with grip arm','lighting,grip,century stand'),('tripod-camera','Camera on a tripod','photo,photography,camera'),
 ('cinema-camera','Cinema camera on a tripod','film,movie,camera'),('camera-dolly','Camera dolly and track','film,tracking,rail'),
 ('boom-mic','Boom microphone','sound,audio,microphone'),('directors-chair','Director’s chair','director,folding chair,seat'),
 ('clapperboard','Clapperboard','slate,film,take'),('backdrop-sweep','Paper backdrop sweep','photography,background,cyclorama'),
 ('reflector','Studio reflector','lighting,bounce,reflector'),('ring-light','Ring light','lighting,portrait,creator'),
 ('field-monitor','Field monitor on a stand','video,screen,production'),('green-screen','Green screen frame','chroma,background,frame'),
 ('apple-boxes','Nesting apple boxes','grip,wooden boxes,film'),('sandbag','Studio sandbag','weight,grip,lighting'),('flag-stand','Flag on a stand','lighting,negative fill,grip')]:
 entry(typ,name,'Studio','studio',tags,2500 if typ in ['clapperboard','sandbag'] else 6000,
       grip=(-.14,.12,.018) if typ=='clapperboard' else None,
       seat={'y':.51,'z':.025,'x':[0]} if typ=='directors-chair' else None)

for typ,name,cat,themes,tags in [
 ('coffee-table','Coffee table','Furniture','living home','table,low table'),('side-table','Side table','Furniture','living bedroom home','nightstand,end table'),
 ('bookcase','Bookcase with books','Furniture','home living office','books,library,shelves'),('tv-stand','TV stand','Furniture','living home tech','media unit,television'),
 ('bunk-bed','Bunk bed','Furniture','bedroom kids home','bed,bunk,sleep'),('crib','Baby crib','Furniture','bedroom kids home','cot,baby,nursery'),
 ('book-stack','Stack of books','Objects','home school office','books,reading'),('plant-small','Small potted plant','Objects','home living garden','plant,pot,foliage'),
 ('plant-large','Large monstera plant','Objects','home living nature','plant,monstera,potted'),('vase-flowers','Vase of flowers','Objects','home living','flowers,bouquet,vase'),
 ('picture-frame','Picture frame','Objects','home living','photo,frame'),('wall-clock','Wall clock','Objects','home office school','clock,time'),
 ('toy-blocks','Wooden toy blocks','Objects','kids home','blocks,toys,play'),('teddy-bear','Teddy bear','Objects','kids bedroom home','teddy,soft toy,bear'),
 ('ceiling-lamp','Pendant ceiling lamp','Objects','home living dining','lamp,pendant,light'),('desk-lamp','Articulated desk lamp','Objects','home office','lamp,task light'),
 ('computer-desk-setup','Computer desk setup','Furniture','office tech home','desk,computer,monitor,keyboard,mouse'),('printer','Desktop printer','Objects','office tech home','print,scanner'),
 ('filing-cabinet','Filing cabinet','Furniture','office home','files,drawers,storage'),('whiteboard','Mobile whiteboard','Furniture','office school','board,teaching,presentation'),
 ('washing-machine','Washing machine','Furniture','home bathroom','laundry,washer'),('laundry-basket','Laundry basket','Objects','home bathroom','laundry,basket'),
 ('ironing-board','Ironing board','Objects','home','ironing,laundry'),('vacuum-cleaner','Canister vacuum cleaner','Objects','home','vacuum,cleaning'),
 ('toilet','Toilet','Furniture','bathroom home','wc,bathroom'),('bathroom-sink','Bathroom vanity and mirror','Furniture','bathroom home','sink,vanity,mirror'),
 ('shower-cabin','Shower cabin','Furniture','bathroom home','shower,enclosure'),('towel-rack','Towel rack','Objects','bathroom home','towel,rail'),
 ('kitchen-run','Kitchen cabinets with sink and hob','Furniture','kitchen home','cabinets,sink,hob,counter'),('wall-cabinets','Wall kitchen cabinets','Furniture','kitchen home','cabinets,storage'),
 ('dishwasher','Dishwasher','Furniture','kitchen home','dishwasher,appliance'),('radiator','Panel radiator','Objects','home','radiator,heating'),
 ('fireplace','Fireplace with logs','Furniture','living home','fireplace,hearth,chimney'),('curtains','Curtains on a pole','Objects','home bedroom living','curtains,drapes,window'),
 ('ladder','Folding step ladder','Objects','home industrial','ladder,steps,folding'),('stroller','Baby stroller','Objects','kids home street','pram,pushchair,baby')]:
 grip={'book-stack':(0,.07,0),'plant-small':(0,.09,0),'teddy-bear':(-.13,.30,.015),'laundry-basket':(.29,.45,0)}.get(typ)
 small=typ in ['book-stack','plant-small','picture-frame','wall-clock','toy-blocks','teddy-bear','ceiling-lamp','desk-lamp']
 tops={'coffee-table':.44,'side-table':.56,'bookcase':1.82,'tv-stand':.53,'computer-desk-setup':.75,'filing-cabinet':1.1,'washing-machine':.85,'bathroom-sink':.87,'kitchen-run':.92,'wall-cabinets':.75,'dishwasher':.85}
 seats={'bunk-bed':{'y':.53,'z':0,'x':[0]},'crib':{'y':.52,'z':0,'x':[0]},'toilet':{'y':.473,'z':.1,'x':[0]},'stroller':{'y':.52,'z':.08,'x':[0]}}
 entry(typ,name,cat,themes,tags,2500 if small else 6000,grip=grip,seat=seats.get(typ),top=tops.get(typ))

for typ,name,cat,tags in [
 ('shop-counter','Shop counter with register','Furniture','checkout,till,shop'),('cash-register','Cash register','Objects','checkout,till,payment'),
 ('store-shelving','Store gondola shelving','Furniture','shop,shelves,gondola'),('clothing-rack','Clothing rack with hangers','Furniture','clothes,garment,hangers'),
 ('shopping-basket','Shopping basket','Objects','basket,groceries,shopping'),('bar-counter','Bar counter with taps','Furniture','bar,pub,taps'),
 ('restaurant-booth','Restaurant booth','Furniture','restaurant,booth,seating'),('round-table','Round table with tablecloth','Furniture','restaurant,table,tablecloth'),
 ('menu-board','A-frame menu board','Objects','menu,sign,restaurant'),('reception-desk','Reception desk','Furniture','reception,lobby,hotel'),
 ('suitcase','Rolling suitcase','Objects','luggage,travel,rolling case')]:
 entry(typ,name,cat,'retail dining' if typ in ['bar-counter','restaurant-booth','round-table','menu-board'] else 'retail',tags,
       grip={'shopping-basket':(0,.51,0),'suitcase':(0,.94,0)}.get(typ),
       seat={'y':.48,'z':.035,'x':[-.4,.4]} if typ=='restaurant-booth' else None,
       top={'shop-counter':.94,'bar-counter':1.1,'round-table':.77,'reception-desk':1.12,'store-shelving':1.7}.get(typ))

for typ,name,cat,themes,tags in [
 ('hospital-bed','Hospital bed','Furniture','medical','bed,clinic,patient'),('wheelchair','Wheelchair','Objects','medical','chair,mobility,wheels'),
 ('crutches','Pair of crutches','Objects','medical','crutch,mobility,walking aid'),('iv-stand','IV drip stand','Objects','medical','drip,infusion,iv'),
 ('school-desk','School desk and chair','Furniture','school','classroom,desk,chair'),('blackboard','Classroom blackboard','Furniture','school','chalkboard,teaching,board'),
 ('conference-table','Conference table','Furniture','office','meeting,boardroom,table'),('water-cooler','Water cooler','Objects','office medical','water,dispenser'),
 ('projector-screen','Projector screen','Objects','office school','projection,presentation,screen')]:
 entry(typ,name,cat,themes,tags,grip=(-.16,.85,0) if typ=='crutches' else None,
       seat={'hospital-bed':{'y':.65,'z':0,'x':[0]},'wheelchair':{'y':.4925,'z':.015,'x':[0]},'school-desk':{'y':.4625,'z':.53,'x':[0]}}.get(typ),
       top={'school-desk':.73,'conference-table':.75}.get(typ))

# Reusable physical subassemblies; no fallback model is generated for unknown types.
def tube(n,a,b,r=.018,mat='prop',vertices=12):return rod(n,a,b,r,mat,vertices=vertices,bev=.002)
def disk(n,c,r,h=.025,mat='prop',N=20):return rod(n,(c[0],c[1]-h/2,c[2]),(c[0],c[1]+h/2,c[2]),r,mat,vertices=N,bev=.003)
def legs(w,d,h,t=.05,y=0):
 for i,x in enumerate([-w/2,w/2]):
  for j,z in enumerate([-d/2,d/2]):box('leg_%d_%d'%(i,j),(x,y+h/2,z),(t,h,t),.009)
def tripod(h=1.6,w=.43):
 tube('telescoping_stand',(0,.16,0),(0,h,0),.022,'accent')
 tube('lower_stand',(0,.22,0),(0,h*.57,0),.031)
 for i in range(3):
  a=i*math.tau/3;x=w*math.cos(a);z=w*math.sin(a)
  tube('tripod_leg_%d'%i,(0,.43,0),(x,.035,z),.018)
  ball('rubber_foot_%d'%i,(x,.028,z),(.034,.025,.034),'accent',12,6)
 for y in [h*.51,h*.8]:disk('stand_lock',(0,y,0),.041,.035,'accent',12)
def feet_cross(w=.4,y=.04):
 for a in [0,math.pi/2]:
  tube('base_rail',(-w*math.cos(a),y,-w*math.sin(a)),(w*math.cos(a),y,w*math.sin(a)),.025)
def frame(n,w,h,y,z=0,t=.035):
 for x in [-w/2,w/2]:box(n+'_side',(x,y,z),(t,h,t),.006)
 for yy in [y-h/2,y+h/2]:box(n+'_rail',(0,yy,z),(w,t,t),.006)
def monitor(n,p=(0,1.1,0),w=.55,h=.34):
 x,y,z=p;box(n+'_housing',p,(w,h,.055),.016)
 box(n+'_screen',(x,y,z+.03),(w-.045,h-.045,.009),.008,'accent')
 box(n+'_button',(x+w*.38,y-h*.43,z+.037),(.018,.008,.006),.002,'accent')
def caster(n,x,y,z,r=.045):
 tube(n+'_axle',(x-.025,y,z),(x+.025,y,z),.018,'accent')
 rod(n+'_wheel',(x-.022,y,z),(x+.022,y,z),r,'accent',vertices=12,bev=.004)
def cabinet(n,p,w,h,d,doors=2,hollow=False):
 x,y,z=p
 if hollow:
  for s in [-1,1]:box(n+'_side',(x+s*(w/2-.012),y,z),(.024,h,d),.006)
  box(n+'_bottom',(x,y-h/2+.012,z),(w-.04,.024,d),.006)
  box(n+'_rear',(x,y,z-d/2+.012),(w-.04,h,.024),.006)
 else:box(n+'_carcass',p,(w,h,d),.015)
 for i in range(doors):
  xx=x+(i-(doors-1)/2)*w/doors
  box(n+'_door_%d'%i,(xx,y,z+d/2+.012),(w/doors-.016,h-.025,.028),.007)
  box(n+'_pull_%d'%i,(xx+w/doors*.3,y+h*.22,z+d/2+.043),(.025,.12,.024),.006,'accent')
def basin(n,p,w=.5,d=.35):
 x,y,z=p;N=20;vs=[];fs=[]
 for rx,rz,yy in [(w*.5,d*.5,y),(w*.43,d*.43,y+.02),(w*.32,d*.3,y-.12)]:
  for i in range(N):
   a=i*math.tau/N;vs.append((x+rx*math.cos(a),yy,z+rz*math.sin(a)))
 for k in range(2):
  for j in range(N):fs.append((k*N+j,k*N+(j+1)%N,(k+1)*N+(j+1)%N,(k+1)*N+j))
 fs.append(tuple(2*N+j for j in range(N)));mesh(n+'_bowl',vs,fs,'accent')
 disk(n+'_drain',(x,y-.116,z),.025,.006,'prop',12)
def counter_with_sink_cutout(n,y,w,d,cx,cz,hw,hd,thickness=.05,mat='prop'):
 # Four connected rings form a closed slab with a genuinely open oval cutout.
 angles=[i*math.tau/32 for i in range(32)]
 angles+= [(math.atan2(z-cz,x-cx)+math.tau)%math.tau for x in [-w/2,w/2] for z in [-d/2,d/2]]
 angles=sorted(set(round(a,10) for a in angles));N=len(angles);vs=[];fs=[]
 for inner,yy in [(False,y-thickness),(False,y),(True,y),(True,y-thickness)]:
  for a in angles:
   co,si=math.cos(a),math.sin(a)
   if inner:x,z=cx+hw*.5*co,cz+hd*.5*si
   else:
    tx=((w/2-cx)/co if co>0 else (-w/2-cx)/co) if abs(co)>1e-9 else 1e9
    tz=((d/2-cz)/si if si>0 else (-d/2-cz)/si) if abs(si)>1e-9 else 1e9
    t=min(tx,tz);x,z=cx+t*co,cz+t*si
   vs.append((x,yy,z))
 for k in range(4):
  for i in range(N):fs.append((k*N+i,k*N+(i+1)%N,((k+1)%4)*N+(i+1)%N,((k+1)%4)*N+i))
 return mesh(n,vs,fs,mat,bevel=.002)
def faucet(n,x,y,z):
 path(n,[(x,y,z),(x,y+.2,z),(x,y+.24,z+.035),(x,y+.24,z+.15),(x,y+.20,z+.17)],.014,'accent',8)
def cushion(n,p,s):box(n,p,s,min(s)*.38,'accent',segments=3)
def chair(p=(0,0,0),w=.44,h=.44):
 x,y,z=p
 for xx in [-w*.42,w*.42]:
  for zz in [-.18,.18]:tube('chair_leg',(x+xx,y,z+zz),(x+xx,y+h,z+zz),.022)
 box('chair_seat',(x,y+h,z),(w,.045,.43),.015)
 for xx in [-w*.42,w*.42]:tube('chair_back_post',(x+xx,y+h,z-.18),(x+xx,y+h+.4,z-.21),.021)
 box('chair_back',(x,y+h+.27,z-.205),(w,.22,.04),.016)
def leaf(n,a,b,width=.12,split=False):
 # Closed leaf blade with central ridge, pointed tip, shallow notches on monstera.
 from mathutils import Vector
 a,b=Vector(a),Vector(b);v=b-a;u=Vector((v.y,-v.x,0)).normalized()*width
 if u.length<.01:u=Vector((width,0,0))
 outline=[a,a+v*.25-u*.7,a+v*.52-u,a+v*.78-u*.68,b,a+v*.78+u*.68,a+v*.52+u,a+v*.25+u*.7]
 if split:
  # Broad, gently curved radial blades with rounded lobes and narrow split cuts.
  # Monstera leaves spread horizontally around the plant, rather than as billboards.
  u=Vector((-v.z,0,v.x)).normalized()*width
  side=[(0,0),(.04,-.36),(.10,-.68),(.20,-.90),(.31,-1),(.39,-.96),(.435,-.62),(.46,-.95),(.56,-.90),(.60,-.54),(.63,-.84),(.73,-.71),(.765,-.45),(.80,-.58),(.90,-.34),(1,0)]
  controls=side+[(t,-w) for t,w in reversed(side[1:-1])]
  # Corner cutting keeps the lobe silhouette soft without expensive bevel topology.
  smooth=[]
  for i,p in enumerate(controls):
   q=controls[(i+1)%len(controls)]
   smooth.extend([(p[0]*.78+q[0]*.22,p[1]*.78+q[1]*.22),(p[0]*.22+q[0]*.78,p[1]*.22+q[1]*.78)])
  outline=[a+v*t+u*w+Vector((0,.028*math.sin(math.pi*t),0)) for t,w in smooth]
 normal=v.cross(u).normalized() if split else Vector((0,0,1))
 vs=[tuple(p+normal*d) for d in [-.006,.006] for p in outline];N=len(outline)
 fs=[tuple(reversed(range(N))),tuple(range(N,2*N))]+[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)]
 mesh(n,vs,fs,'prop',bevel=0 if split else .002)
def pot(n,r=.14,h=.24):
 lathe(n,[(r*.72,0),(r,h*.92),(r*.98,h),(r*.83,h),(r*.8,h*.86),(r*.65,.025)],N=20)
 disk(n+'_soil',(0,h*.87,0),r*.8,.012,'accent',16)

def studio(typ):
 if typ in ['softbox','led-panel','field-monitor','flag-stand','reflector','ring-light']:
  tripod(1.57,.42)
  if typ=='softbox':
   # Octagonal truncated pyramidal modifier with recessed diffuser.
   N=8;vs=[]
   for z,r in [(-.22,.12),(.02,.42),(.045,.41)]:
    for i in range(N):
     a=math.tau*(i+.5)/N;vs.append((r*math.cos(a),1.83+r*math.sin(a),z))
   fs=[tuple(reversed(range(N))),tuple(2*N+i for i in range(N))]
   for k in range(2):
    for i in range(N):fs.append((k*N+i,k*N+(i+1)%N,(k+1)*N+(i+1)%N,(k+1)*N+i))
   mesh('octagonal_softbox_shell',vs,fs,'accent',bevel=.008)
   profile_extrude('diffuser',[(.389*math.cos(math.tau*(i+.5)/N),1.83+.389*math.sin(math.tau*(i+.5)/N)) for i in range(N)],.008,(0,0,.053),bevel=.003)
   tube('tilt_bracket',(0,1.57,0),(0,1.7,-.12),.025)
  elif typ=='led-panel':
   box('panel_back',(0,1.83,0),(.55,.37,.08),.018,'accent');box('diffusion_panel',(0,1.83,.045),(.5,.32,.02),.01)
   for x in [-.3,.3]:tube('yoke_side',(x,1.55,0),(x,1.84,0),.018)
   tube('yoke_base',(-.3,1.55,0),(.3,1.55,0),.018)
   for x in [-.16,-.08,0,.08,.16]:box('rear_cooling_fin',(x,1.83,-.054),(.018,.26,.024),.004)
  elif typ=='field-monitor':
   monitor('monitor',(0,1.78,0),.65,.4);box('sun_hood_roof',(0,2.0,.11),(.69,.025,.25),.005,'accent')
   for x in [-.335,.335]:box('sun_hood_side',(x,1.82,.11),(.025,.36,.25),.005,'accent')
  elif typ=='flag-stand':
   frame('flag_frame',.72,.92,1.98);box('light_cutting_fabric',(0,1.98,.005),(.69,.89,.016),.006,'accent')
  elif typ=='reflector':
   rod('reflector_fabric',(0,1.95,-.018),(0,1.95,.018),.43,vertices=32,bev=.004)
   ring('reflector_rim',(0,1.95,0),.435,.016,'accent',axis='z',N=28)
  else:
   ring('ring_light_housing',(0,1.87,0),.29,.039,'accent',axis='z',N=28)
   ring('ring_light_diffuser',(0,1.87,.027),.29,.025,'prop',axis='z',N=28)
   tube('phone_mount',(0,1.57,0),(0,1.82,0),.012);box('phone_clamp',(0,1.82,0),(.08,.045,.05),.008)
 elif typ=='c-stand':
  tube('riser',(0,.08,0),(0,1.85,0),.028);tube('extension',(0,1.1,0),(0,2.23,0),.018,'accent')
  for i in range(3):
   a=i*math.tau/3;y=.12+i*.07;path('turtle_leg_%d'%i,[(0,y,0),(.2*math.cos(a),y,.2*math.sin(a)),(.48*math.cos(a),.025,.48*math.sin(a))],.025,'prop',8)
  rod('grip_head',(0,2.1,-.045),(0,2.1,.045),.065,'accent',vertices=16)
  tube('grip_arm',(-.15,2.0,0),(.95,2.45,0),.017)
  rod('end_grip',(.87,2.42,-.04),(.87,2.42,.04),.046,'accent',vertices=12)
 elif typ in ['tripod-camera','cinema-camera']:
  for i in range(3):
   a=i*math.tau/3
   for off in [-.022,.022]:tube('tripod_twin_leg',(math.cos(a)*.12+off,1.26,math.sin(a)*.12),(math.cos(a)*.48+off,.035,math.sin(a)*.48),.016,'accent')
   tube('spreader',(0,.42,0),(.33*math.cos(a),.42,.33*math.sin(a)),.012)
  disk('fluid_head',(0,1.3,0),.09,.09);box('quick_release',(0,1.37,0),(.21,.035,.2),.008,'accent')
  if typ=='tripod-camera':
   box('camera_body',(0,1.48,0),(.25,.18,.12),.025);box('viewfinder',(0,1.59,-.01),(.1,.055,.09),.009)
   rod('lens_barrel',(0,1.48,.05),(0,1.48,.23),.07,'accent',vertices=24)
   rod('lens_glass',(0,1.48,.233),(0,1.48,.239),.057,vertices=24,bev=.001)
   box('camera_grip',(-.103,1.47,.038),(.065,.16,.09),.025,'accent')
  else:
   box('cinema_body',(0,1.58,-.04),(.3,.3,.34),.018);box('rear_battery',(0,1.57,-.26),(.22,.22,.1),.01,'accent')
   rod('cine_lens',(0,1.57,.1),(0,1.57,.37),.092,'accent',vertices=24)
   for z in [.15,.24,.32]:ring('focus_ring',(0,1.57,z),.096,.011,axis='z',N=20)
   frame('matte_box',.33,.25,1.57,.39,.035);box('matte_box_top',(0,1.73,.36),(.4,.018,.18),.004,'accent')
   path('top_handle',[(-.08,1.74,-.13),(-.08,1.84,-.13),(-.08,1.84,.12),(-.08,1.74,.12)],.019,'accent',8)
   monitor('camera_monitor',(.2,1.88,-.02),.21,.14)
  tube('pan_handle',(0,1.31,-.1),(.22,1.23,-.48),.013,'accent')
 elif typ=='camera-dolly':
  for x in [-.52,.52]:tube('dolly_track',(x,.055,-1.5),(x,.055,1.5),.035,'accent')
  for z in [-1.3,-.65,0,.65,1.3]:box('track_tie',(0,.018,z),(1.22,.036,.085),.008)
  box('dolly_deck',(0,.24,0),(1.25,.12,1.0),.035)
  for x in [-.52,.52]:
   for z in [-.37,.37]:caster('track_wheel',x,.14,z,.085)
  disk('seat_base',(.37,.34,-.15),.1,.09,'accent');tube('seat_post',(.37,.3,-.15),(.37,.68,-.15),.035)
  disk('operator_seat',(.37,.7,-.15),.18,.05)
  tube('camera_pedestal',(-.25,.3,.05),(-.25,1.1,.05),.06);disk('camera_mount',(-.25,1.1,.05),.12,.035,'accent')
  path('push_handle',[(-.45,.28,-.43),(-.45,.95,-.63),(.45,.95,-.63),(.45,.28,-.43)],.026,'accent',8)
 elif typ=='boom-mic':
  tripod(1.75,.48);tube('boom_pole',(-.4,1.55,0),(1.05,2.36,0),.018,'accent')
  rod('shotgun_body',(1.0,2.33,0),(1.24,2.45,0),.03,vertices=16)
  ball('foam_windscreen',(1.32,2.49,0),(.19,.085,.075),'accent',16,8)
  path('audio_cable',[(1.05,2.36,.02),(.45,1.93,.02),(0,1.74,.02),(.04,.18,.03),(.24,.025,.18)],.006,'accent',6)
 elif typ=='directors-chair':
  for x in [-.26,.26]:
   tube('folding_leg_a',(x,.02,-.25),(x,.65,.25),.025);tube('folding_leg_b',(x,.02,.25),(x,.65,-.25),.025)
   box('armrest',(x,.71,.02),(.065,.04,.49),.014);tube('back_post',(x,.5,-.22),(x,1.02,-.22),.022)
  box('canvas_seat',(0,.495,.025),(.5,.03,.43),.008,'accent');box('canvas_back',(0,.88,-.22),(.5,.24,.026),.008,'accent')
  tube('footrest',(-.26,.23,.19),(.26,.23,.19),.022)
 elif typ=='clapperboard':
  box('slate',(0,.12,0),(.3,.24,.025),.008,'accent')
  box('fixed_clapper',(0,.254,0),(.31,.028,.032),.005)
  o=box('open_clapper',(.006,.3,0),(.31,.028,.032),.005);o.rotation_euler[1]=-.16
  for x in [-.12,-.06,0,.06,.12]:box('clapper_stripe',(x,.255,.018),(.029,.024,.005),.001,'accent')
  for y,w in [(.195,.24),(.14,.24),(.08,.18)]:box('slate_rule',(0,y,.014),(w,.005,.003),.001)
  tube('slate_vertical',(-.04,.06,.014),(-.04,.22,.014),.0025,vertices=6)
 elif typ in ['backdrop-sweep','green-screen']:
  w=2.7;h=2.7
  for x in [-w/2,w/2]:
   tube('support_pole',(x,.04,0),(x,h,0),.03)
   tube('stand_foot',(x,.028,-.45),(x,.028,.45),.026,'accent')
   tube('stand_brace',(x-.25,.025,0),(x+.25,.025,0),.025,'accent')
  tube('top_crossbar',(-w/2,h,0),(w/2,h,0),.03)
  if typ=='green-screen':box('chroma_fabric',(0,1.49,0),(2.6,2.36,.018),.006,'accent')
  else:
   rod('paper_roll',(-1.34,2.6,0),(1.34,2.6,0),.08,vertices=24)
   profile=[(2.59,.025),(.55,.025),(.32,.09),(.14,.22),(.035,.43),(.025,1.55)]
   vs=[(x,y,z) for x in [-1.29,1.29] for y,z in profile];N=len(profile)
   fs=[(i,i+1,N+i+1,N+i) for i in range(N-1)];mesh('continuous_paper_sweep',vs,fs)
 elif typ=='apple-boxes':
  for i,(x,y,w,h,d) in enumerate([(-.14,.1,.55,.2,.4),(.14,.3,.48,.2,.34),(-.02,.48,.42,.16,.29)]):
   box('apple_box_%d'%i,(x,y,0),(w,h,d),.016)
   box('hand_hole_%d'%i,(x,y,d/2+.002),(.18,.055,.008),.025,'accent')
   for xx in [-1,1]:box('end_grain_%d'%i,(x+xx*(w/2-.035),y,0),(.012,h-.025,d+.003),.003,'accent')
 elif typ=='sandbag':
  cushion('weight_bag_left',(-.13,.09,0),(.24,.18,.36));cushion('weight_bag_right',(.13,.09,0),(.24,.18,.36))
  path('carry_webbing',[(-.12,.16,0),(-.09,.25,0),(.09,.25,0),(.12,.16,0)],.015,'prop',8)
  for x in [-.13,.13]:box('stitched_seam',(x,.172,0),(.2,.008,.015),.003)
 else:raise KeyError(typ)

def home(typ):
 if typ in ['coffee-table','side-table']:
  w,d,h=(1.1,.6,.44) if typ=='coffee-table' else (.48,.48,.56)
  box('tabletop',(0,h-.025,0),(w,.05,d),.025);legs(w-.14,d-.14,h-.05)
  if typ=='coffee-table':box('lower_shelf',(0,.14,0),(w-.16,.035,d-.14),.01,'accent')
  else:
   box('drawer',(0,.43,.01),(.4,.16,.39),.01);box('drawer_pull',(0,.43,.218),(.13,.018,.025),.007,'accent')
 elif typ=='bookcase':
  for x in [-.46,.46]:box('bookcase_side',(x,.91,0),(.05,1.82,.34),.008)
  box('back_panel',(0,.91,-.158),(.88,1.78,.023),.006,'accent')
  for y in [.055,.49,.93,1.37,1.795]:box('shelf',(0,y,0),(.92,.045,.34),.007)
  for level in range(4):
   y=.08+level*.44
   for i in range(7):
    x=-.36+i*.115;h=.25+(i%3)*.045
    box('book_%d_%d'%(level,i),(x,y+h/2,.005),(.077,h,.24),.006,'accent' if (level+i)%3==0 else 'prop')
    box('book_spine_band',(x,y+h*.7,.128),(.078,.013,.005),.002,'accent',segments=1)
 elif typ=='tv-stand':
  legs(1.28,.33,.12,.06)
  box('bottom',(0,.15,0),(1.5,.06,.44),.012);box('top',(0,.5,0),(1.5,.06,.44),.015)
  for x in [-.72,-.24,.24,.72]:box('partition',(x,.325,0),(.04,.31,.42),.007)
  box('rear',(0,.325,-.21),(1.44,.31,.024),.005,'accent')
  for x in [-.48,.48]:
   box('cabinet_door',(x,.325,.219),(.43,.28,.028),.008)
   box('pull',(x,.4,.24),(.13,.016,.018),.005,'accent')
  box('media_receiver',(0,.22,.01),(.35,.08,.3),.008,'accent');box('receiver_display',(0,.225,.165),(.18,.028,.005),.003)
 elif typ in ['bunk-bed','crib']:
  if typ=='bunk-bed':
   w=1.05;d=2.05
   for x in [-w/2,w/2]:
    for z in [-d/2,d/2]:box('bed_post',(x,.95,z),(.075,1.9,.075),.012)
   for y in [.36,1.37]:
    box('bed_platform',(0,y,0),(w,.08,d),.015)
    cushion('mattress',(0,y+.105,0),(.98,.13,1.97));cushion('pillow',(0,y+.2,-.7),(.62,.1,.36))
   for x in [-w/2,w/2]:
    for y in [1.6,1.8]:tube('upper_guard',(x,y,-d/2),(x,y,d/2),.024)
   for z in [-d/2,d/2]:box('bed_end',(0,.68,z),(.99,.25,.045),.01)
   for x in [.15,.49]:tube('ladder_rail',(x,.02,1.22),(x,1.77,1.04),.022)
   for y in [.25,.52,.79,1.06,1.33,1.6]:tube('ladder_rung',(.15,y,1.22-y*.1),(.49,y,1.22-y*.1),.021)
  else:
   for x in [-.37,.37]:
    for z in [-.67,.67]:box('crib_post',(x,.55,z),(.055,1.1,.055),.012)
   box('mattress_support',(0,.43,0),(.74,.06,1.34),.012);cushion('crib_mattress',(0,.49,0),(.68,.06,1.28))
   for x in [-.37,.37]:
    for y in [.53,1.06]:tube('side_rail',(x,y,-.67),(x,y,.67),.022)
    for i in range(9):tube('crib_spindle',(x,.53,-.56+i*.14),(x,1.06,-.56+i*.14),.012,vertices=8)
   for z in [-.67,.67]:
    for y in [.53,1.06]:tube('end_rail',(-.37,y,z),(.37,y,z),.022)
    for x in [-.24,-.12,0,.12,.24]:tube('end_spindle',(x,.53,z),(x,1.06,z),.012,vertices=8)
 elif typ=='book-stack':
  for i,(w,d) in enumerate([(.29,.22),(.25,.2),(.28,.19)]):
   y=.018+i*.05
   box('book_pages_%d'%i,(0,y+.015,0),(w-.014,.028,d-.012),.004)
   for yy in [y,y+.033]:box('book_cover_%d'%i,(0,yy,0),(w,.006,d),.002,'accent')
   box('book_spine_%d'%i,(-w/2+.005,y+.016,0),(.01,.038,d),.003,'accent')
 elif typ in ['plant-small','plant-large']:
  big=typ=='plant-large';r,h=(.22,.4) if big else (.1,.17);pot('terracotta_pot',r,h)
  for i in range(7 if big else 5):
   a=i*2.4;yy=h+(.65+i*.07 if big else .12+i*.022);reach=.32 if big else .095
   x=math.cos(a)*reach;z=math.sin(a)*reach
   stem=(x*.65,yy-.12 if big else yy-.03,z*.65);tip=(x*1.65,yy-.20 if big else yy+(i%2)*.1,z*1.4)
   tube('leaf_stem_%d'%i,(0,h*.9,0),stem,.009 if big else .004,'accent',8)
   leaf('monstera_leaf_%d'%i if big else 'leaf_%d'%i,stem,tip,.19 if big else .055,big)
 elif typ=='vase-flowers':
  lathe('vase',[(.07,0),(.11,.04),(.105,.19),(.065,.26),(.058,.34),(.047,.34),(.045,.27),(.085,.18),(.087,.05)],N=24)
  for i in range(5):
   a=i*2.4;x=.12*math.cos(a);z=.09*math.sin(a);y=.5+(i%3)*.065
   tube('flower_stem',(0,.09,0),(x,y,z),.004,'accent',8)
   for j in range(5):
    aa=j*math.tau/5;ball('flower_petal',(x+.035*math.cos(aa),y+.035*math.sin(aa),z),(.026,.026,.015),seg=10,rings=5)
   ball('flower_centre',(x,y,z+.012),(.022,.022,.014),'accent',10,5)
 elif typ=='picture-frame':
  frame('picture_frame',.26,.33,.175,0,.025);box('mat_board',(0,.175,-.005),(.24,.31,.012),.003)
  box('picture_inset',(0,.175,.004),(.18,.235,.006),.003,'accent')
  tube('easel_back',(0,.28,-.02),(0,.01,-.13),.014)
 elif typ=='wall-clock':
  rod('clock_case',(0,.16,-.02),(0,.16,.02),.16,vertices=32)
  rod('clock_face',(0,.16,.021),(0,.16,.027),.142,'accent',vertices=32,bev=.001)
  for i in range(12):
   a=i*math.tau/12;tube('hour_mark',(.117*math.sin(a),.16+.117*math.cos(a),.033),(.133*math.sin(a),.16+.133*math.cos(a),.033),.004,vertices=6)
  tube('minute_hand',(0,.16,.038),(.083,.21,.038),.005);tube('hour_hand',(0,.16,.04),(-.036,.22,.04),.007)
  ball('hand_hub',(0,.16,.04),(.012,.012,.008),seg=12,rings=6)
 elif typ=='toy-blocks':
  for i,(x,y,z) in enumerate([(-.09,.04,0),(0,.04,0),(.09,.04,0),(-.045,.12,0),(.045,.12,0),(0,.2,0)]):box('toy_cube_%d'%i,(x,y,z),(.078,.078,.078),.009,'accent' if i%3==0 else 'prop')
  rod('round_block',(-.2,0,.01),(-.2,.085,.01),.047,vertices=16);profile_extrude('triangle_block',[(-.04,0),(.04,0),(0,.08)],.08,(.2,0,0),bevel=.006)
 elif typ=='teddy-bear':
  ball('stuffed_body',(0,.22,0),(.12,.16,.085),seg=16,rings=8);ball('head',(0,.41,.005),(.115,.11,.09),seg=16,rings=8)
  for s in [-1,1]:
   ball('round_ear',(s*.09,.49,0),(.044,.047,.026),seg=12,rings=6)
   ball('arm',(s*.13,.27,.005),(.045,.105,.048),seg=12,rings=6)
   ball('foot',(s*.075,.075,.04),(.058,.075,.075),seg=12,rings=6)
   ball('button_eye',(s*.038,.432,.082),(.011,.012,.008),'accent',10,5)
  ball('muzzle',(0,.386,.087),(.05,.037,.025),seg=12,rings=6);ball('nose',(0,.4,.11),(.018,.012,.01),'accent',10,5)
  box('ribbon_knot',(0,.316,.079),(.03,.028,.021),.009,'accent')
  for s in [-1,1]:ball('bow_loop',(s*.033,.315,.077),(.033,.022,.015),'accent',10,5)
 elif typ=='ceiling-lamp':
  disk('ceiling_rose',(0,1.0,0),.095,.04);tube('pendant_cord',(0,.34,0),(0,.98,0),.007,'accent')
  lathe('shade',[(.28,0),(.28,.025),(.095,.29),(.065,.32),(.053,.31),(.082,.28),(.265,.02)],N=28)
  ball('bulb',(0,.14,0),(.055,.07,.055),'accent',12,6)
 elif typ=='desk-lamp':
  disk('weighted_base',(0,.025,0),.14,.05);tube('lower_arm',(0,.05,0),(-.1,.31,0),.018)
  tube('upper_arm',(-.1,.31,0),(.09,.49,0),.018)
  for x,y in [(0,.07),(-.1,.31),(.09,.49)]:rod('hinge',(x,y,-.026),(x,y,.026),.03,'accent',vertices=12)
  lathe('lamp_shade',[(.12,0),(.12,.016),(.048,.12),(.037,.15),(.026,.15),(.036,.115),(.105,.015)],(.13,.29,0),N=20)
 elif typ=='computer-desk-setup':
  box('desk_top',(0,.72,0),(1.3,.06,.65),.018);legs(1.15,.5,.69,.055)
  disk('monitor_base',(0,.775,-.12),.15,.025,'accent');tube('monitor_neck',(0,.78,-.12),(0,1.0,-.12),.035)
  monitor('computer_monitor',(0,1.13,-.12),.59,.35)
  box('keyboard',(0,.765,.17),(.44,.025,.15),.012,'accent')
  for i in range(4):box('key_row',(0,.78,.116+i*.031),(.4,.009,.023),.003)
  ball('mouse',(.34,.78,.17),(.035,.025,.055),'accent',12,6)
  box('computer_tower',(-.44,.25,-.09),(.21,.46,.41),.018);box('tower_front',(-.44,.25,.121),(.18,.42,.018),.012,'accent')
 elif typ=='printer':
  box('printer_body',(0,.13,0),(.46,.23,.36),.035);box('scanner_lid',(0,.26,-.025),(.47,.035,.37),.012)
  box('paper_output_slot',(0,.145,.181),(.33,.035,.012),.008,'accent');box('output_tray',(0,.105,.26),(.34,.018,.2),.006)
  box('output_paper',(0,.12,.25),(.29,.008,.18),.002,'accent');box('control_display',(.145,.23,.185),(.095,.035,.01),.004,'accent')
  box('paper_input_back',(0,.335,-.16),(.34,.17,.025),.006);box('paper_stack',(0,.36,-.14),(.29,.16,.012),.003,'accent')
 elif typ=='filing-cabinet':
  box('metal_case',(0,.55,0),(.48,1.1,.6),.018)
  for y in [.195,.55,.905]:
   box('drawer_front',(0,y,.307),(.44,.325,.028),.008)
   handle('drawer_handle',0,y+.025,.34,.16,.014)
   box('label_holder',(0,y-.067,.326),(.12,.04,.008),.005,'accent')
 elif typ in ['whiteboard','blackboard']:
  w,h=(1.65,1.0) if typ=='whiteboard' else (2.0,1.2)
  frame('board_frame',w,h,1.4,0,.045);box('writing_surface',(0,1.4,.002),(w-.045,h-.045,.018),.008,'accent' if typ=='blackboard' else 'prop')
  for x in [-w*.38,w*.38]:
   tube('board_upright',(x,.12,-.05),(x,1.85,-.05),.027);tube('rolling_base',(x,.07,-.36),(x,.07,.36),.025)
   for z in [-.32,.32]:caster('board_caster',x,.045,z)
  box('marker_tray',(0,.86,.09),(w*.78,.024,.17),.006,'accent')
  box('eraser',(.37,.895,.1),(.14,.04,.065),.008,'accent')
 elif typ in ['washing-machine','dishwasher']:
  box('appliance_body',(0,.425,0),(.6,.85,.6),.018);box('top',(0,.835,0),(.61,.03,.61),.008)
  box('control_fascia',(0,.755,.307),(.57,.12,.025),.006)
  box('display',(.12,.76,.323),(.19,.045,.008),.004,'accent')
  if typ=='washing-machine':
   ring('door_rim',(0,.39,.326),.205,.027,'prop',axis='z',N=24)
   rod('door_glass',(0,.39,.31),(0,.39,.335),.174,'accent',vertices=28,bev=.007)
   rod('program_dial',(-.15,.755,.32),(-.15,.755,.344),.034,'accent',vertices=16)
   box('door_latch',(.183,.39,.351),(.03,.095,.025),.01)
  else:
   box('dishwasher_door',(0,.355,.309),(.565,.63,.03),.012)
   handle('dishwasher_pull',0,.655,.345,.36,.012)
  box('kick_panel',(0,.055,.307),(.52,.085,.025),.005,'accent')
 elif typ=='laundry-basket':
  # Open woven shell, visibly hollow from the inspection angle.
  box('basket_bottom',(0,.025,0),(.52,.05,.36),.025)
  for y in [.08,.18,.28,.39]:
   path('basket_horizontal_hoop',[(-.29,y,-.21),(.29,y,-.21),(.29,y,.21),(-.29,y,.21)],.014,'prop',6,True)
  for x in [-.25,-.15,-.05,.05,.15,.25]:
   for z in [-.205,.205]:tube('basket_upright',(x,.04,z*.85),(x*1.06,.4,z),.01,vertices=6)
  for z in [-.14,0,.14]:
   for x in [-.285,.285]:tube('basket_end_upright',(x*.87,.04,z),(x,.4,z),.01,vertices=6)
  for x in [-.29,.29]:path('side_handle',[(x,.35,-.08),(x,.45,-.08),(x,.45,.08),(x,.35,.08)],.017,'accent',8)
 elif typ=='ironing-board':
  outline=[(-.57,-.16),(.42,-.16),(.59,-.09),(.64,0),(.59,.09),(.42,.16),(-.57,.16)]
  # The plan outline is extruded vertically.
  vs=[(x,y,z) for y in [.77,.81] for x,z in outline];N=len(outline)
  mesh('padded_ironing_surface',vs,[tuple(reversed(range(N))),tuple(range(N,2*N))]+[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)],bevel=.015)
  for z in [-.09,.09]:tube('folding_leg',(-.44,.025,z),(.34,.77,z),.025);tube('cross_leg',(.44,.025,z),(-.34,.77,z),.025)
  for x in [-.44,.44]:tube('rubber_foot_bar',(x,.025,-.23),(x,.025,.23),.028,'accent')
  box('iron_rest',(-.67,.78,0),(.22,.025,.31),.008,'accent')
 elif typ=='vacuum-cleaner':
  ball('canister',(0,.19,-.12),(.23,.17,.3),seg=20,rings=10)
  for x in [-.215,.215]:caster('large_wheel',x,.12,-.21,.12)
  path('carry_handle',[(-.1,.3,-.13),(-.1,.39,-.13),(.1,.39,-.13),(.1,.3,-.13)],.019,'accent',8)
  path('corrugated_hose',[(0,.24,.13),(.17,.45,.22),(.27,.58,.38),(.23,.67,.55),(.1,.66,.64)],.035,'accent',10)
  tube('wand',(.1,.66,.64),(.1,.08,1.0),.022)
  box('floor_head',(.1,.045,1.02),(.33,.07,.17),.025,'accent')
 elif typ=='toilet':
  lathe('pedestal',[(.14,0),(.17,.05),(.105,.26),(.19,.33),(.18,.37),(.08,.34),(.075,.06)],(0,0,.035),N=24)
  # Continuous oval shell: outside, lip, and a genuinely recessed interior.
  N=28;vs=[];fs=[]
  for rx,rz,y in [(.13,.17,.22),(.23,.3,.38),(.225,.29,.442),(.177,.235,.442),(.08,.115,.29)]:
   for i in range(N):
    a=i*math.tau/N;vs.append((rx*math.cos(a),y,.075+rz*math.sin(a)))
  for j in range(4):
   for i in range(N):fs.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
  fs.extend([tuple(reversed(range(N))),tuple(4*N+i for i in range(N))]);mesh('hollow_porcelain_bowl',vs,fs)
  o=ring('toilet_seat',(0,.445,.09),.21,.028,'prop',N=28);o.scale.y=1.35
  ball('bowl_drain',(0,.293,.075),(.069,.006,.1),'accent',16,6)
  box('cistern',(0,.57,-.22),(.42,.48,.18),.035);box('cistern_lid',(0,.815,-.22),(.44,.035,.2),.012)
  disk('flush_button',(.1,.837,-.22),.023,.008,'accent',12)
 elif typ=='bathroom-sink':
  cabinet('vanity',(0,.41,0),.86,.78,.48,hollow=True);counter_with_sink_cutout('counter',.87,.91,.53,0,.03,.55,.37)
  basin('sink',(0,.875,.03),.55,.37);faucet('mixer',0,.87,-.16)
  frame('mirror_frame',.78,.72,1.5,-.235,.035);box('mirror',(0,1.5,-.233),(.75,.69,.018),.01,'accent')
 elif typ=='shower-cabin':
  box('shower_tray',(0,.08,0),(.95,.16,.95),.045)
  box('tray_inset',(0,.163,0),(.8,.016,.8),.045,'accent')
  for x in [-.45,.45]:
   for z in [-.45,.45]:tube('frame_upright',(x,.16,z),(x,2.08,z),.019)
  for y in [.18,2.08]:
   path('square_frame',[(-.45,y,-.45),(.45,y,-.45),(.45,y,.45),(-.45,y,.45)],.019,'prop',8,True)
  box('rear_glass',(0,1.13,-.45),(.88,1.88,.016),.004,'accent')
  box('side_glass',(-.45,1.13,0),(.016,1.88,.88),.004,'accent')
  # Open entry makes the depth and shower fittings visible.
  box('door_glass',(.3,1.13,.45),(.28,1.88,.016),.004,'accent');handle('shower_pull',.3,1.12,.48,.09,.06)
  path('shower_pipe',[(.18,.92,-.4),(.18,1.85,-.4),(.18,1.94,-.34),(.18,1.94,-.12)],.014)
  disk('shower_head',(.18,1.92,-.1),.11,.025);box('mixer_control',(.18,.98,-.39),(.2,.07,.055),.016)
 elif typ=='towel-rack':
  for x in [-.3,.3]:tube('upright',(x,.03,0),(x,.95,0),.019);tube('foot',(x,.025,-.18),(x,.025,.18),.022)
  for y in [.4,.68,.93]:tube('towel_rail',(-.3,y,0),(.3,y,0),.017)
  box('draped_towel_front',(0,.685,.035),(.4,.47,.018),.006);box('draped_towel_back',(0,.72,-.035),(.4,.4,.018),.006)
  tube('folded_towel_top',(-.2,.922,0),(.2,.922,0),.038)
  for y in [.49,.51]:box('woven_border',(0,y,.046),(.38,.008,.005),.002,'accent')
 elif typ=='kitchen-run':
  cabinet('base_cabinet',(0,.455,0),2.4,.79,.59,4,hollow=True);box('recessed_plinth',(0,.065,-.02),(2.3,.13,.51),.01,'accent')
  counter_with_sink_cutout('worktop',.92,2.46,.64,-.64,0,.61,.43,.06)
  basin('kitchen_sink',(-.64,.927,0),.61,.43);faucet('sink_tap',-.64,.92,-.22)
  box('hob',(.63,.925,0),(.66,.018,.51),.009,'accent')
  for x in [.46,.8]:
   for z in [-.13,.13]:ring('hob_burner',(x,.94,z),.09,.009,'prop',N=16)
  for x in [.47,.58,.69,.8]:disk('hob_knob',(x,.948,.205),.016,.013,'prop',12)
 elif typ=='wall-cabinets':
  cabinet('upper_cabinet',(0,.375,0),1.8,.75,.35,3);box('cornice',(0,.74,0),(1.84,.025,.38),.009)
 elif typ=='radiator':
  for i in range(10):box('heating_fin',((i-4.5)*.085,.4,0),(.065,.68,.13),.025)
  for y in [.13,.68]:tube('horizontal_manifold',(-.43,y,0),(.43,y,0),.035,'accent')
  for x in [-.36,.36]:tube('pipe_leg',(x,.01,0),(x,.14,0),.018)
  rod('thermostat',(.43,.68,0),(.53,.68,0),.035,vertices=16)
 elif typ=='fireplace':
  box('hearth',(0,.055,.035),(1.36,.11,.65),.02,'accent')
  for x in [-.49,.49]:box('mantel_pier',(x,.58,-.06),(.22,1.05,.42),.018)
  box('lintel',(0,1.04,-.06),(1.2,.22,.42),.025);box('mantel_shelf',(0,1.2,-.025),(1.4,.1,.55),.02)
  box('firebox_back',(0,.57,-.25),(.81,.92,.035),.006,'accent')
  for x in [-.3,0,.3]:rod('fire_log',(x,.2,-.09),(x+.13,.23,.23),.07,'accent',vertices=12)
  for x in [-.34,-.17,0,.17,.34]:tube('fire_grate',(x,.13,.29),(x,.38,.29),.012)
  tube('grate_top',(-.36,.38,.29),(.36,.38,.29),.014)
 elif typ=='curtains':
  rod('curtain_pole',(-1.1,2.25,0),(1.1,2.25,0),.022)
  for s in [-1,1]:
   ball('finial',(s*1.14,2.25,0),(.045,.045,.045),seg=12,rings=6)
   # Folded cloth cage makes a scalloped hem and a real pleated silhouette.
   xs=[s*(.35+i*.055) for i in range(12)];vs=[]
   for y in [.015,1.1,2.2]:
    for i,x in enumerate(xs):vs.append((x,y+(i%2)*.012,.07*math.cos(i*math.pi)))
   fs=[]
   for j in range(2):
    for i in range(11):fs.append((j*12+i,j*12+i+1,(j+1)*12+i+1,(j+1)*12+i))
   mesh('pleated_curtain_'+str(s),vs,fs)
   for x in xs[::2]:ring('curtain_eyelet',(x,2.2,0),.028,.007,'accent',axis='x',N=12)
 elif typ=='ladder':
  for x in [-.25,.25]:
   tube('front_rail',(x,.02,.38),(x,1.55,0),.026);tube('rear_rail',(x,.02,-.38),(x,1.55,0),.026)
  for i in range(5):
   y=.27+i*.26;z=.38*(1-y/1.55);box('step',(0,y,z),(.5,.035,.15),.008)
  box('top_platform',(0,1.54,0),(.56,.055,.26),.012,'accent')
  for x in [-.25,.25]:tube('spread_limit',(x,.65,-.22),(x,.65,.22),.012,'accent')
 elif typ=='stroller':
  for x in [-.28,.28]:
   tube('stroller_frame',(x,.12,.36),(x,.88,-.22),.022);tube('cross_frame',(x,.12,-.34),(x,.65,.27),.022)
   path('handle_side',[(x,.5,-.2),(x,1.01,-.4),(x,1.08,-.44)],.025,'accent',8)
   for z in [-.34,.36]:caster('stroller_wheel',x,.11,z,.11 if z<0 else .08)
  tube('push_handle',(-.28,1.08,-.44),(.28,1.08,-.44),.028,'accent')
  cushion('seat',(0,.485,.04),(.43,.07,.43));box('backrest',(0,.71,-.17),(.43,.45,.055),.026,'accent')
  box('footrest',(0,.27,.32),(.4,.035,.19),.012)
  # Quarter cylinder canopy, open at the front.
  vs=[];N=12
  for x in [-.26,.26]:
   for i in range(N):
    a=math.pi*.5*i/(N-1);vs.append((x,.85+.27*math.sin(a),-.2+.27*math.cos(a)))
  mesh('curved_sun_canopy',vs,[(i,i+1,N+i+1,N+i) for i in range(N-1)])
  for x in [-.26,.26]:path('canopy_rib',[(x,.85+.27*math.sin(math.pi*.5*i/8),-.2+.27*math.cos(math.pi*.5*i/8)) for i in range(9)],.014,'accent',8)
  box('underseat_basket',(0,.25,-.04),(.42,.13,.38),.03,'accent')
 else:raise KeyError(typ)

def register(p=(0,0,0)):
 x,y,z=p;box('cash_drawer',(x,y+.06,z),(.39,.12,.35),.015)
 box('drawer_front',(x,y+.06,z+.18),(.35,.08,.018),.005,'accent');box('cash_slot',(x,y+.06,z+.192),(.17,.009,.005),.002)
 box('keypad_console',(x,y+.16,z+.03),(.32,.1,.25),.015)
 for i in range(3):
  for j in range(3):box('register_key',(x-.075+i*.05,y+.214,z+.02+j*.04),(.034,.012,.026),.003,'accent')
 tube('display_stem',(x,y+.2,z-.1),(x,y+.38,z-.1),.025);monitor('register_display',(x,y+.41,z-.1),.28,.15)
 box('receipt_printer',(x-.105,y+.215,z-.07),(.09,.04,.085),.007);box('receipt',(x-.105,y+.26,z-.09),(.065,.08,.006),.002,'accent')
def retail(typ):
 if typ in ['shop-counter','reception-desk','bar-counter']:
  w,h,d=(1.8,.94,.68) if typ=='shop-counter' else ((2.1,1.12,.77) if typ=='reception-desk' else (2.1,1.1,.65))
  box('counter_body',(0,(h-.08)/2,0),(w-.12,h-.08,d-.1),.02)
  box('countertop',(0,h-.035,0),(w,.07,d),.02);box('plinth',(0,.05,-.02),(w-.2,.1,d-.14),.012,'accent')
  for x in [-w*.3,0,w*.3]:box('front_panel',(x,h*.45,d/2-.04),(w*.28,h*.63,.018),.009,'accent')
  if typ=='shop-counter':register((.4,h,-.03));box('bagging_inset',(-.48,h+.006,0),(.57,.012,.45),.008,'accent')
  elif typ=='reception-desk':
   monitor('reception_screen',(.45,h+.27,-.1),.4,.25);tube('monitor_post',(.45,h,-.1),(.45,h+.16,-.1),.028)
   box('writing_ledge',(-.51,h-.2,.43),(.82,.045,.37),.014)
  else:
   for x in [-.35,.15]:
    path('beer_tap',[(x,h,-.12),(x,h+.36,-.12),(x,h+.4,-.06),(x,h+.4,.1),(x,h+.35,.12)],.029,'accent',10)
    tube('tap_lever',(x,h+.36,-.06),(x,h+.54,-.06),.014);ball('tap_handle',(x,h+.55,-.06),(.026,.06,.026),seg=12,rings=6)
   box('drip_tray',(-.1,h+.01,.1),(.93,.022,.3),.007,'accent')
   tube('brass_footrail',(-.96,.2,.48),(.96,.2,.48),.025)
   for x in [-.8,.8]:tube('footrail_bracket',(x,.2,.3),(x,.2,.48),.022)
 elif typ=='cash-register':register()
 elif typ=='store-shelving':
  box('gondola_base',(0,.075,0),(1.5,.15,.86),.016);box('centre_back',(0,.9,0),(1.43,1.65,.055),.008,'accent')
  for x in [-.7,.7]:box('upright',(x,.89,0),(.045,1.72,.07),.007)
  for side in [-1,1]:
   for level,y in enumerate([.18,.68,1.18,1.68]):
    box('shelf',(0,y,side*.22),(1.48,.035,.43),.007)
    box('price_rail',(0,y+.018,side*.426),(1.46,.045,.018),.004,'accent')
    if level<3:
     for i in range(5):
      box('product_carton',((i-2)*.255,y+.15,side*.24),(.19,.265,.22),.008,'accent' if i%3==0 else 'prop')
 elif typ=='clothing-rack':
  for x in [-.65,.65]:
   tube('rack_post',(x,.08,0),(x,1.67,0),.027);tube('rack_foot',(x,.07,-.3),(x,.07,.3),.026)
   for z in [-.25,.25]:caster('rack_caster',x,.045,z)
  tube('hanging_rail',(-.65,1.67,0),(.65,1.67,0),.026)
  for i in range(5):
   x=-.46+i*.23
   path('hanger_hook',[(x,1.5,0),(x,1.59,0),(x+.035,1.64,0),(x+.065,1.61,0)],.008,'accent',6)
   path('triangular_hanger',[(x,1.53,0),(x-.18,1.4,0),(x+.18,1.4,0)],.009,'prop',6,True)
 elif typ=='shopping-basket':
  box('basket_floor',(0,.018,0),(.41,.036,.28),.018)
  for y in [.06,.14,.23,.31]:path('basket_rail',[(-.25,y,-.18),(.25,y,-.18),(.25,y,.18),(-.25,y,.18)],.012,'prop',6,True)
  for x in [-.21,-.105,0,.105,.21]:
   for z in [-.18,.18]:tube('basket_slat',(x*.85,.03,z*.8),(x,.31,z),.01,vertices=6)
  for x in [-.25,.25]:
   for z in [-.12,0,.12]:tube('basket_end_slat',(x*.85,.03,z),(x,.31,z),.01,vertices=6)
  path('carry_handle',[(-.23,.3,0),(-.18,.51,0),(.18,.51,0),(.23,.3,0)],.015,'accent',8)
 elif typ=='restaurant-booth':
  box('booth_plinth',(0,.18,-.03),(1.55,.36,.68),.025,'accent');cushion('bench_cushion',(0,.435,.035),(1.6,.09,.62))
  box('back_shell',(0,.72,-.31),(1.64,1.05,.12),.045)
  for x in [-.52,0,.52]:cushion('back_cushion',(x,.85,-.22),(.51,.61,.1))
  for x in [-.79,.79]:box('booth_end',(x,.43,-.03),(.1,.59,.67),.025)
 elif typ=='round-table':
  disk('table_base',(0,.025,0),.34,.05,'accent');tube('pedestal',(0,.05,0),(0,.71,0),.055)
  disk('tabletop',(0,.733,0),.6,.045)
  N=48;vs=[(0,.77,0)];fs=[]
  for rr,y,fold in [(.608,.77,0),(.63,.66,.006),(.65,.51,.018)]:
   for i in range(N):
    a=i*math.tau/N;r=rr+fold*math.cos(a*8);vs.append((r*math.cos(a),y-(.022*math.cos(a*8) if y<.6 else 0),r*math.sin(a)))
  fs=[(0,1+i,1+(i+1)%N) for i in range(N)]
  for k in range(2):
   for i in range(N):fs.append((1+k*N+i,1+k*N+(i+1)%N,1+(k+1)*N+(i+1)%N,1+(k+1)*N+i))
  mesh('draped_tablecloth',vs,fs)
 elif typ=='menu-board':
  for z in [-.22,.22]:
   for x in [-.28,.28]:tube('a_frame_leg',(x,.015,z),(x,1.05,0),.024)
  for z in [-.1,.1]:
   box('chalk_panel',(0,.6,z),(.52,.7,.025),.01,'accent')
   frame('panel_frame',.55,.74,.6,z,.025)
  for y,w in [(.81,.32),(.72,.39),(.62,.35),(.52,.39),(.42,.25)]:box('menu_rule',(0,y,.117),(w,.012,.004),.003)
  tube('hinge',(-.3,1.04,0),(.3,1.04,0),.024,'accent')
 elif typ=='suitcase':
  box('luggage_shell',(0,.34,0),(.44,.61,.26),.055)
  for x in [-.15,.15]:caster('luggage_wheel',x,.047,0,.047)
  for x in [-.1,.1]:tube('telescopic_handle',(x,.61,-.075),(x,.94,-.075),.012,'accent')
  tube('handle_grip',(-.105,.94,-.075),(.105,.94,-.075),.022)
  for x in [-.13,0,.13]:box('shell_ridge',(x,.35,.132),(.022,.45,.018),.009,'accent')
  handle('carry_handle',0,.675,0,.17,.015)
  path('zip_seam',[(-.215,.1,0),(-.215,.59,0),(.215,.59,0),(.215,.1,0)],.005,'accent',6)
 else:raise KeyError(typ)

def institutional(typ):
 if typ=='hospital-bed':
  for x in [-.43,.43]:
   for z in [-.9,.9]:caster('bed_caster',x,.075,z,.065);tube('bed_leg',(x,.08,z),(x,.48,z),.027)
  box('bed_frame',(0,.46,0),(.97,.1,2.03),.015)
  cushion('patient_mattress',(0,.585,.07),(.88,.13,1.8));cushion('pillow',(0,.7,-.56),(.6,.12,.36))
  for z in [-1,1]:
   box('bed_end_panel',(0,.71,z),(.94,.46,.055),.045)
   handle('bed_push_handle',0,.94,z+.03,.58,.025)
  for x in [-.49,.49]:
   for y in [.66,.9]:tube('safety_rail',(x,y,-.52),(x,y,.55),.019,'accent')
   for z in [-.52,.02,.55]:tube('rail_support',(x,.49,z),(x,.9,z),.017)
  box('adjustment_motor',(0,.3,0),(.28,.14,.57),.016,'accent')
 elif typ=='wheelchair':
  for x in [-.3,.3]:
   ring('rear_tire',(x,.31,-.15),.29,.022,'accent',axis='x',N=24)
   ring('push_rim',(x+(.027 if x>0 else -.027),.31,-.15),.245,.012,axis='x',N=20)
   for i in range(8):
    a=i*math.tau/8;tube('wheel_spoke',(x,.31,-.15),(x,.31+.27*math.sin(a),-.15+.27*math.cos(a)),.005,vertices=6)
   tube('side_frame',(x,.25,-.2),(x,.52,.25),.021)
   caster('front_caster',x,.075,.36,.075);tube('front_fork',(x,.075,.36),(x,.29,.28),.018)
   tube('back_post',(x,.32,-.23),(x,.98,-.23),.021)
   tube('push_handle',(x,.98,-.23),(x,.98,-.4),.022,'accent')
   box('armrest',(x,.7,0),(.06,.04,.4),.014,'accent')
   tube('arm_support',(x,.5,.12),(x,.69,.12),.018)
   tube('foot_support',(x,.45,.25),(x,.17,.53),.018);box('footplate',(x*.65,.17,.5),(.19,.025,.2),.009,'accent')
  box('seat',(0,.475,.015),(.5,.035,.47),.016,'accent');box('backrest',(0,.735,-.23),(.51,.43,.035),.016,'accent')
  tube('cross_brace',(-.28,.26,-.12),(.28,.47,.17),.017);tube('cross_brace',(.28,.26,-.12),(-.28,.47,.17),.017)
 elif typ=='crutches':
  for x in [-.16,.16]:
   tube('crutch_tip',(x,.02,0),(x,.5,0),.016,'accent');disk('rubber_tip',(x,.022,0),.025,.04,'accent',12)
   for s in [-1,1]:tube('crutch_fork',(x,.4,0),(x+s*.085,1.25,0),.015)
   tube('hand_grip',(x-.065,.85,0),(x+.065,.85,0),.023,'accent')
   box('underarm_pad',(x,1.27,0),(.25,.065,.075),.028,'accent')
 elif typ=='iv-stand':
  tube('iv_pole',(0,.12,0),(0,1.98,0),.02)
  for i in range(5):
   a=i*math.tau/5;x=.32*math.cos(a);z=.32*math.sin(a)
   tube('star_base',(0,.15,0),(x,.07,z),.018);caster('iv_caster',x,.04,z,.035)
  path('hanging_hooks',[(-.22,1.91,0),(-.22,2.04,0),(.22,2.04,0),(.22,1.91,0)],.012,'accent',8)
  cushion('iv_bag',(-.18,1.74,0),(.14,.27,.055));tube('bag_neck',(-.18,1.6,0),(-.18,1.55,0),.013)
  path('infusion_line',[(-.18,1.55,0),(-.18,1.32,0),(-.12,1.15,.03),(.08,.78,.08),(.18,.59,.08)],.004,'accent',6)
  box('flow_controller',(-.15,1.26,.02),(.035,.07,.025),.008,'accent')
 elif typ=='school-desk':
  box('desk_top',(0,.705,-.15),(.68,.05,.48),.018)
  for x in [-.28,.28]:
   for z in [-.34,.02]:tube('desk_leg',(x,.025,z),(x,.68,z),.022)
  box('book_shelf',(0,.53,-.15),(.58,.025,.38),.008,'accent')
  transform_new(lambda:chair(w=.4,h=.44),(0,0,.53),math.pi)
 elif typ=='conference-table':
  box('meeting_tabletop',(0,.72,0),(2.6,.06,1.05),.15,segments=4)
  for x in [-.82,.82]:
   box('pedestal',(x,.37,0),(.2,.68,.58),.025);box('pedestal_foot',(x,.035,0),(.45,.07,.85),.025,'accent')
  box('cable_hatch',(0,.754,0),(.34,.008,.12),.01,'accent')
 elif typ=='water-cooler':
  box('cooler_cabinet',(0,.48,0),(.35,.96,.35),.028)
  box('recess',(0,.67,.18),(.27,.3,.018),.016,'accent');box('drip_tray',(0,.53,.21),(.28,.025,.13),.008)
  for x in [-.065,.065]:
   path('dispensing_tap',[(x,.78,.18),(x,.78,.23),(x,.74,.23)],.013,'prop',8)
   box('tap_button',(x,.83,.2),(.038,.04,.018),.006)
  lathe('water_bottle',[(.06,0),(.07,.06),(.13,.11),(.14,.35),(.115,.43),(.06,.45)],(0,.96,0),'accent',N=24)
  for y in [1.12,1.22,1.32]:ring('bottle_rib',(0,y,0),.14,.008,N=20)
 elif typ=='projector-screen':
  tripod(.8,.48);tube('screen_riser',(0,.5,0),(0,2.32,0),.022,'accent')
  box('screen_fabric',(0,1.52,.02),(1.85,1.06,.018),.008)
  frame('black_border',1.9,1.12,1.52,.015,.035)
  rod('screen_canister',(-1.0,.93,.025),(1.0,.93,.025),.047,'accent',vertices=16)
  tube('screen_top_rail',(-.97,2.1,.02),(.97,2.1,.02),.022)
  tube('screen_hook',(0,2.1,0),(0,2.32,0),.01)
 elif typ=='blackboard':home(typ)
 else:raise KeyError(typ)

P2_TYPES={
 'jib-crane':('Camera jib crane','Studio','studio','jib,crane,film'),
 'teleprompter':('Teleprompter on tripod','Studio','studio','prompter,broadcast,presenter'),
 'makeup-mirror':('Makeup mirror with bulbs','Studio','studio beauty','mirror,vanity,makeup'),
 'film-light':('Fresnel film light','Studio','studio','fresnel,spotlight,lighting'),
 'dining-set':('Dining table and four chairs','Furniture','dining home','dining,table,chairs'),
 'sectional-sofa':('L-shaped sectional sofa','Furniture','living home','sectional,sofa,couch'),
 'bean-bag':('Bean bag chair','Furniture','living kids home','beanbag,seat,cushion'),
 'wardrobe-open':('Open wardrobe','Furniture','bedroom home fashion','wardrobe,closet,clothes'),
 'mirror-round':('Round mirror on a stand','Objects','home living','mirror,round'),
 'shoe-rack':('Shoe rack with shoes','Furniture','home','shoes,rack,storage'),
 'coat-stand':('Freestanding coat stand','Furniture','home office','coat,stand,hooks'),
 'alarm-clock':('Twin-bell alarm clock','Objects','bedroom home','clock,alarm,bells'),
 'candles':('Cluster of candles','Objects','home living','candles,wax,light'),
 'cushion':('Soft cushion','Objects','home living bedroom','pillow,cushion'),
 'luggage-trolley':('Hotel luggage trolley','Objects','retail transport','luggage,trolley,hotel'),
 'coat-check':('Coat check rail','Furniture','retail fashion','cloakroom,coat,check'),
 'buffet-table':('Buffet table with serving dishes','Furniture','dining retail','buffet,food,serving'),
 'high-table':('High cocktail table','Furniture','dining retail','bar,table,cocktail'),
 'lab-bench':('Laboratory bench','Furniture','medical school','lab,bench,laboratory'),
 'microscope':('Laboratory microscope','Objects','medical school','microscope,lab,science'),
 'server-rack':('Server rack','Furniture','tech office','server,rack,data centre'),
 'desk-phone':('Office desk phone','Objects','office','phone,telephone,landline')}
for typ,(name,cat,themes,tags) in P2_TYPES.items():
 entry(typ,name,cat,themes,tags,2500 if typ in ['alarm-clock','candles','cushion','microscope','desk-phone'] else 6000,'P2',
       grip={'alarm-clock':(0,.11,0),'cushion':(0,.1,0)}.get(typ),
       seat={'dining-set':{'y':.4775,'z':-.74,'x':[0]},'sectional-sofa':{'y':.43,'z':.0,'x':[-.72,0,.72]},'bean-bag':{'y':.28,'z':.08,'x':[0]}}.get(typ),
       top={'dining-set':.75,'wardrobe-open':1.95,'shoe-rack':.62,'buffet-table':.79,'high-table':1.07,'lab-bench':.92}.get(typ))

# Keep every small footprint below the strict 2,500-triangle allowance.
for typ in ['side-table','printer','cash-register','shopping-basket','laundry-basket']:
 CATALOG[typ]['budget']=2500

def transform_new(fn,p=(0,0,0),yaw=0):
 from mathutils import Matrix,Vector
 before=set(bpy.data.objects);fn();R=Matrix.Rotation(-yaw,4,'Z');T=Matrix.Translation(Vector((p[0],-p[2],p[1])))
 for o in set(bpy.data.objects)-before:o.matrix_world=T@R@o.matrix_world

def extras(typ):
 if typ=='jib-crane':
  # Balanced camera arm on a wheeled triangular chassis.
  for a in [0,math.tau/3,math.tau*2/3]:
   x=.7*math.cos(a);z=.7*math.sin(a);tube('base_spoke',(0,.2,0),(x,.11,z),.04);caster('crane_caster',x,.09,z,.085)
  tube('crane_column',(0,.2,0),(0,1.8,0),.065)
  for z in [-.09,.09]:
   tube('jib_upper_rail',(-1,1.48,z),(2.0,2.58,z),.035)
   tube('jib_lower_rail',(-1,1.24,z),(2.0,2.34,z),.035)
   for i in range(6):
    x=-1+i*.6;y=1.24+(x+1)*1.1/3;tube('jib_brace',(x,y,z),(x,y+.24,z),.021)
  rod('pivot_axle',(0,1.72,-.14),(0,1.72,.14),.09,'accent',vertices=20)
  for x in [-.96,-.82,-.68]:box('counterweight',(x,1.42,0),(.11,.42,.36),.018,'accent')
  tube('camera_drop',(2,2.47,0),(2,2.16,0),.028)
  box('camera_platform',(2,2.13,0),(.35,.045,.32),.012)
  box('camera',(2,2.29,0),(.27,.23,.28),.025);rod('camera_lens',(2,2.29,.13),(2,2.29,.35),.08,'accent',vertices=20)
 elif typ=='teleprompter':
  tripod(1.25,.48);box('camera_plate',(0,1.3,0),(.6,.05,.54),.01)
  box('prompter_display',(0,1.35,.11),(.48,.035,.36),.012,'accent')
  # Beam-splitter glass tilted over an upward facing monitor.
  vs=[(-.27,1.38,-.05),(.27,1.38,-.05),(.27,1.83,.35),(-.27,1.83,.35)]
  mesh('beam_splitter_glass',vs,[(0,1,2,3)],'accent')
  for x in [-.28,.28]:
   tube('glass_side_rail',(x,1.38,-.05),(x,1.83,.35),.016)
   mesh('hood_side',[(x,1.37,-.24),(x,1.37,.32),(x,1.84,.35),(x,1.65,-.24)],[(0,1,2,3)])
  box('hood_roof',(0,1.83,.12),(.57,.025,.5),.008)
  box('broadcast_camera',(0,1.54,-.34),(.25,.22,.27),.025);rod('camera_lens',(0,1.55,-.23),(0,1.55,-.02),.072,'accent',vertices=20)
 elif typ=='makeup-mirror':
  box('mirror_base',(0,.035,0),(.7,.07,.31),.018)
  for x in [-.27,.27]:tube('mirror_support',(x,.07,0),(x,.4,0),.024)
  frame('vanity_frame',.64,.72,.57,0,.065);box('mirror_glass',(0,.57,.006),(.57,.65,.018),.012,'accent')
  for x in [-.32,.32]:
   for y in [.31,.57,.83]:ball('vanity_bulb',(x,y,.052),(.035,.035,.035),seg=12,rings=6)
  for x in [-.16,0,.16]:ball('vanity_bulb',(x,.93,.052),(.035,.035,.035),seg=12,rings=6)
 elif typ=='film-light':
  tripod(1.5,.43)
  rod('fresnel_body',(0,1.8,-.2),(0,1.8,.12),.18,vertices=24)
  rod('fresnel_lens',(0,1.8,.123),(0,1.8,.135),.15,'accent',vertices=24)
  for rr in [.05,.1,.145]:ring('fresnel_lens_ridge',(0,1.8,.14),rr,.004,'prop',axis='z',N=20)
  for x in [-.22,.22]:tube('lamp_yoke',(x,1.49,0),(x,1.8,0),.02)
  tube('yoke_crossbar',(-.22,1.49,0),(.22,1.49,0),.02)
  for s in [-1,1]:
   box('barn_door_side',(s*.23,1.8,.22),(.14,.34,.024),.006,'accent')
   box('barn_door_top_bottom',(0,1.8+s*.23,.22),(.34,.14,.024),.006,'accent')
  for i in range(6):tube('housing_rib',(.17*math.cos(i*math.tau/6),1.8+.17*math.sin(i*math.tau/6),-.17),(.17*math.cos(i*math.tau/6),1.8+.17*math.sin(i*math.tau/6),.1),.012,'accent',8)
 elif typ=='dining-set':
  box('dining_tabletop',(0,.72,0),(1.5,.06,.88),.025);legs(1.32,.7,.69,.06)
  for p,yaw in [((0,0,-.74),0),((0,0,.74),math.pi),((-.98,0,0),math.pi/2),((.98,0,0),-math.pi/2)]:transform_new(lambda:chair(h=.455),p,yaw)
 elif typ=='sectional-sofa':
  box('main_sofa_base',(0,.19,0),(2.5,.3,.86),.06)
  box('chaise_base',(.78,.19,.58),(.94,.3,1.2),.06)
  for x in [-1.05,1.05]:
   for z in [-.3,.3]:box('sofa_foot',(x,.045,z),(.08,.09,.08),.014,'accent')
  for x in [-.78,0,.78]:cushion('seat_cushion',(x,.39,.035),(.75,.08,.74))
  cushion('chaise_cushion',(.78,.39,.83),(.88,.08,.82))
  box('rear_shell',(0,.59,-.4),(2.5,.72,.14),.045)
  for x in [-.78,0,.78]:cushion('back_cushion',(x,.68,-.28),(.75,.48,.16))
  for x in [-1.2,1.2]:box('armrest',(x,.48,.015),(.14,.55,.87),.045)
 elif typ=='bean-bag':
  # A single stuffed sack surface with a broad base and a depressed sitting well.
  N=32;vs=[];fs=[]
  for rx,rz,y,zc,slope in [(.25,.28,.015,0,0),(.39,.4,.08,0,0),(.44,.43,.2,0,0),(.41,.38,.35,-.025,.025),(.31,.3,.49,-.07,-.14),(.18,.17,.44,-.055,-.14),(.075,.075,.295,.035,0)]:
   for i in range(N):
    a=i*math.tau/N;wrinkle=1+.018*math.cos(5*a)
    vs.append((rx*math.cos(a)*wrinkle,y+slope*math.sin(a),zc+rz*math.sin(a)*wrinkle))
  for k in range(6):
   for i in range(N):fs.append((k*N+i,k*N+(i+1)%N,(k+1)*N+(i+1)%N,(k+1)*N+i))
  fs.extend([tuple(reversed(range(N))),tuple(6*N+i for i in range(N))])
  sack=mesh('continuous_beanbag_shell',vs,fs)
  bpy.context.view_layer.objects.active=sack
  sub=sack.modifiers.new('Soft filled upholstery','SUBSURF');sub.levels=1
  bpy.ops.object.modifier_apply(modifier=sub.name)
  path('front_sewn_seam',[(-.29,.11,.29),(0,.08,.4),(.29,.11,.29)],.005,'accent',6)
 elif typ=='wardrobe-open':
  for x in [-.64,.64]:box('wardrobe_side',(x,.975,0),(.055,1.95,.58),.012)
  for y in [.04,1.92]:box('wardrobe_horizontal',(0,y,0),(1.28,.06,.58),.012)
  box('wardrobe_back',(0,.975,-.28),(1.24,1.88,.025),.006,'accent')
  box('divider',(.16,1.01,0),(.04,1.78,.55),.008)
  for y in [.49,.91,1.33,1.75]:box('open_shelf',(.4,y,0),(.45,.035,.55),.006)
  tube('clothes_rail',(-.6,1.66,0),(.12,1.66,0),.018,'accent')
  for x in [-.45,-.25,-.05]:
   path('hanger_hook',[(x,1.5,0),(x,1.62,0),(x+.035,1.65,0),(x+.055,1.62,0)],.007,'accent',6)
   path('hanger',[(x,1.53,0),(x-.16,1.39,0),(x+.16,1.39,0)],.009,'prop',6,True)
  for i in range(3):box('folded_clothing',(.4,.54+i*.07,.05),(.35,.055,.36),.012,'accent' if i%2 else 'prop')
  box('storage_drawer',(-.25,.22,0),(.71,.32,.54),.012);handle('drawer_pull',-.25,.27,.29,.21,.015)
 elif typ=='mirror-round':
  disk('mirror_stand_base',(0,.02,0),.2,.04);tube('mirror_neck',(0,.04,0),(0,.39,0),.025)
  ring('round_frame',(0,.64,0),.28,.023,'prop',axis='z',N=32)
  rod('mirror_glass',(0,.64,-.012),(0,.64,.012),.263,'accent',vertices=32,bev=.002)
 elif typ=='shoe-rack':
  for x in [-.46,.46]:
   for z in [-.15,.15]:box('rack_leg',(x,.31,z),(.035,.62,.035),.006)
  for y in [.075,.33,.6]:
   for z in [-.13,0,.13]:box('shelf_slat',(0,y,z),(.96,.025,.085),.005)
  for y in [.13,.385]:
   for x in [-.28,-.14,.14,.28]:
    ball('shoe_upper',(x,y+.025,.035),(.05,.05,.13),seg=12,rings=6)
    box('shoe_sole',(x,y-.025,.035),(.11,.025,.28),.01,'accent')
 elif typ in ['coat-stand','coat-check']:
  if typ=='coat-stand':
   disk('coat_stand_base',(0,.025,0),.3,.05);tube('coat_stand_pole',(0,.05,0),(0,1.8,0),.035)
   for i in range(6):
    a=i*math.tau/6;x=.24*math.cos(a);z=.24*math.sin(a);path('coat_hook',[(0,1.52,0),(x,1.74,z),(x,1.83,z)],.018,'prop',8)
    ball('hook_cap',(x,1.83,z),(.027,.027,.027),'accent',10,5)
  else:
   for x in [-.85,.85]:tube('cloakroom_post',(x,.025,0),(x,1.8,0),.032);tube('foot',(x,.025,-.34),(x,.025,.34),.03)
   for y in [.15,1.8]:tube('cloakroom_crossbar',(-.85,y,0),(.85,y,0),.027)
   for x in [-.6,-.3,0,.3,.6]:
    path('hanger_hook',[(x,1.63,0),(x,1.76,0),(x+.04,1.8,0),(x+.06,1.76,0)],.008,'accent',6)
    path('hanger',[(x,1.67,0),(x-.19,1.51,0),(x+.19,1.51,0)],.01,'prop',6,True)
   box('hat_shelf',(0,1.92,0),(1.85,.045,.42),.012)
 elif typ=='alarm-clock':
  rod('clock_body',(0,.12,-.035),(0,.12,.035),.105,vertices=24)
  rod('clock_face',(0,.12,.036),(0,.12,.041),.092,'accent',vertices=24,bev=.001)
  for x in [-.075,.075]:
   tube('clock_foot',(x,.006,0),(x*.8,.055,0),.012)
   ball('bell',(x,.22,0),(.055,.031,.041),seg=16,rings=8);tube('bell_post',(x*.8,.18,0),(x,.22,0),.008)
  tube('bell_hammer',(0,.21,0),(0,.26,0),.006);ball('hammer_head',(0,.26,0),(.012,.008,.01),'accent',10,5)
  tube('hour_hand',(0,.12,.046),(-.035,.155,.046),.005);tube('minute_hand',(0,.12,.047),(.06,.145,.047),.004)
  for x,y in [(0,.193),(.073,.12),(0,.047),(-.073,.12)]:ball('hour_dot',(x,y,.045),(.006,.006,.003),seg=8,rings=4)
 elif typ=='candles':
  for i,(x,z,h,r) in enumerate([(-.1,0,.23,.055),(.06,-.06,.17,.048),(.09,.08,.1,.04)]):
   lathe('pillar_candle_%d'%i,[(0,0),(r,0),(r,h),(r*.7,h-.007),(0,h-.006)],(x,0,z),N=20)
   tube('wick',(x,h-.005,z),(x,h+.012,z),.003,'accent',6)
   ball('flame',(x,h+.03,z),(.009,.023,.009),'accent',10,5)
   disk('candle_coaster',(x,.004,z),r+.009,.008,'accent',16)
 elif typ=='cushion':
  cushion('pillow_body',(0,.085,0),(.45,.17,.42))
  path('piped_edge',[(-.19,.085,-.19),(.19,.085,-.19),(.21,.085,-.17),(.21,.085,.17),(.19,.085,.19),(-.19,.085,.19),(-.21,.085,.17),(-.21,.085,-.17)],.007,'prop',6,True)
 elif typ=='luggage-trolley':
  box('luggage_deck',(0,.19,0),(.83,.08,1.05),.035,'accent')
  for x in [-.35,.35]:
   for z in [-.43,.43]:caster('trolley_caster',x,.08,z,.075)
   path('arched_frame',[(x,.2,-.43),(x,1.55,-.43),(x,1.78,-.25),(x,1.83,.25),(x,1.55,.43),(x,.2,.43)],.029,'prop',10)
  for z in [-.43,.43]:tube('luggage_rail',(-.35,.4,z),(.35,.4,z),.026)
  tube('hanger_rail',(-.35,1.78,0),(.35,1.78,0),.026)
  ball('top_finial',(0,1.82,0),(.055,.055,.055),'accent',12,6)
 elif typ=='buffet-table':
  box('buffet_top',(0,.76,0),(1.9,.06,.76),.02);legs(1.7,.58,.73,.06)
  box('lower_shelf',(0,.22,0),(1.74,.035,.59),.01,'accent')
  for x in [-.55,0,.55]:
   box('chafing_dish_base',(x,.83,0),(.46,.08,.52),.035,'accent')
   box('serving_lid',(x,.91,0),(.46,.1,.5),.044)
   handle('lid_handle',x,.99,0,.16,.016)
  for x in [-.77,.77]:tube('utensil_support',(x,.79,.29),(x,1.08,.29),.016)
 elif typ=='high-table':
  disk('table_base',(0,.035,0),.32,.07,'accent');tube('tall_pedestal',(0,.07,0),(0,1.035,0),.05)
  disk('high_tabletop',(0,1.045,0),.43,.05)
  ring('footrest',(0,.3,0),.2,.018,N=24)
  for a in [0,math.pi/2,math.pi,math.pi*1.5]:tube('footrest_spoke',(0,.3,0),(.2*math.cos(a),.3,.2*math.sin(a)),.013)
 elif typ=='lab-bench':
  counter_with_sink_cutout('laboratory_top',.92,1.8,.72,.6,.02,.42,.37,.06,'accent')
  for x in [-.6,.6]:cabinet('lab_drawer_unit',(x,.44,0),.5,.84,.61,1,hollow=True)
  box('rear_splash',(0,1.01,-.34),(1.8,.24,.035),.008)
  basin('lab_sink',(.6,.928,.02),.42,.37);faucet('lab_tap',.6,.92,-.24)
  for x in [-.55,-.28]:
   lathe('laboratory_flask',[(0,0),(.085,0),(.1,.04),(.085,.15),(.025,.23),(.025,.31),(.014,.31),(.014,.23),(.07,.14),(.075,.035)],(x,.92,0),N=20)
 elif typ=='microscope':
  box('microscope_base',(0,.025,.025),(.2,.05,.27),.025)
  profile_extrude('curved_arm',[(-.055,.04),(-.075,.22),(-.035,.37),(.035,.4),(.09,.35),(.065,.31),(.02,.33),(-.015,.24),(.005,.08)],.055,(0,0,-.045),bevel=.012)
  box('stage',(0,.18,.035),(.19,.018,.16),.006,'accent')
  rod('objective_turret',(0,.265,.045),(0,.28,.045),.047,vertices=16)
  for x in [-.025,.025]:tube('objective',(x,.23,.045),(x,.27,.045),.014,'accent',12)
  tube('optical_body',(0,.28,.045),(-.045,.41,-.015),.028)
  tube('eyepiece',(-.045,.41,-.015),(-.063,.46,-.04),.019,'accent',12)
  rod('focus_knob',(-.079,.24,-.045),(.079,.24,-.045),.027,'accent',vertices=16)
  disk('illuminator',(0,.07,.045),.032,.025,'accent',16)
  box('slide',(0,.194,.045),(.085,.005,.03),.001)
 elif typ=='server-rack':
  box('rack_plinth',(0,.06,0),(.62,.12,.85),.018)
  for x in [-.29,.29]:box('rack_side',(x,1.0,0),(.035,1.95,.81),.008)
  box('rack_roof',(0,1.98,0),(.62,.04,.85),.012)
  box('rack_rear',(0,1.01,-.4),(.57,1.87,.025),.005,'accent')
  for i in range(8):
   y=.24+i*.215;box('rack_server_%d'%i,(0,y,.05),(.55,.19,.68),.009)
   box('vent_face_%d'%i,(0,y,.395),(.45,.115,.01),.004,'accent')
   for x in [-.23,.23]:box('rack_ear_handle',(x,y,.414),(.025,.11,.025),.006)
   for x in [-.14,-.07,0,.07,.14]:box('vent_slot',(x,y,.402),(.012,.08,.005),.001,segments=1)
 elif typ=='desk-phone':
  box('phone_base',(0,.036,0),(.22,.072,.23),.018)
  box('phone_display',(0,.078,-.053),(.12,.012,.053),.006,'accent')
  for i in range(3):
   for j in range(4):box('dial_key',((i-1)*.035,.08,.0+j*.026),(.025,.012,.018),.003,'accent',segments=1)
  path('handset',[(-.085,.09,-.075),(-.085,.135,-.04),(-.085,.135,.07),(-.085,.09,.105)],.022,'prop',10)
  for z in [-.075,.105]:ball('handset_capsule',(-.085,.09,z),(.037,.022,.035),seg=12,rings=6)
  path('curly_cord',[(-.11,.055,.08),(-.15,.03,.09),(-.16,.025,.02),(-.14,.025,-.04),(-.13,.07,-.06)],.006,'accent',6)
 else:raise KeyError(typ)

def build(typ):
 if typ not in CATALOG:raise KeyError('Unknown authored asset: '+typ)
 if typ in P2_TYPES:return extras(typ)
 cat=CATALOG[typ]['category']
 if cat=='Studio':studio(typ)
 elif typ in ['shop-counter','cash-register','store-shelving','clothing-rack','shopping-basket','bar-counter','restaurant-booth','round-table','menu-board','reception-desk','suitcase']:retail(typ)
 elif typ in ['hospital-bed','wheelchair','crutches','iv-stand','school-desk','blackboard','conference-table','water-cooler','projector-screen']:institutional(typ)
 else:home(typ)
