"""Batch 2 outdoor, sports, fantasy and creature clay models.
All dimensions and contact points use application X-right, Y-up, Z-front.
Geometry is authored here; the batch runner owns materials, placement and export.
"""
import math
import bpy
from mathutils import Vector
from batch2_common import box, ball, rod, mesh, path, ring, lathe, profile_extrude, handle

CATALOG={}
def entry(t,name,cat,themes,tags,budget=6000,grip=None,poses=None,seat=None,top=None,priority='P1'):
 d=dict(name=name,category=cat,themes=themes.split(','),tags=tags.split(','),budget=budget,priority=priority)
 if grip is not None:d.update(grip=grip,poses=poses or ['carry','stand','walk'])
 if seat is not None:d['seat']=seat
 if top is not None:d['top']=top
 CATALOG[t]=d

for t,n in [('bicycle','City bicycle'),('motorcycle','Road motorcycle'),('e-scooter','Electric scooter'),('bus','City bus'),('van','Delivery van')]:entry(t,n,'Vehicles','street,city,transport',t+',vehicle,transport',15000)
for t,n,th,ta in [
 ('traffic-light','Traffic light','street,city','signal,junction,stoplight'),('stop-sign','Octagonal stop sign','street,city','road,traffic,sign'),('street-sign','Street name signs','street,city','intersection,direction,sign'),('fire-hydrant','Fire hydrant','street,city','water,fire,safety'),('parking-meter','Parking meter','street,city','parking,payment,car'),('bollard','Street bollard','street,city','barrier,post,pedestrian'),('road-barrier','Road work barrier','street,city,industrial','construction,traffic,fence'),('dumpster','Wheeled dumpster','street,city','bin,rubbish,trash'),('shopping-cart','Shopping cart','retail,street','trolley,supermarket,groceries'),('bike-rack','Bicycle parking rack','street,city,transport','cycle,parking,rack'),('vending-machine','Vending machine','street,retail,drinks','snacks,soda,dispenser'),('atm','Cash machine','street,retail,city','cash,bank,atm'),('kiosk','Street kiosk','street,retail,city','news,stall,shop'),('market-stall','Market stall','street,retail,food','market,canopy,produce')]:entry(t,n,'Outdoor',th,ta)
for t,n in [('scaffolding','Scaffolding bay'),('billboard','Billboard on posts'),('shop-front','Shop facade'),('awning','Striped shop awning')]:entry(t,n,'Architecture','street,city,retail',t+',building,facade')

for t,n,th,ta,g in [
 ('football','Football','sports','soccer,football,ball',(0,.11,0)),('basketball','Basketball','sports','basketball,ball,court',(0,.12,0)),('tennis-racket','Tennis racket','sports','tennis,racquet,racket',(0,.11,0)),('skateboard','Skateboard','sports,street','skate,board,wheels',None),('surfboard','Surfboard','sports,beach','surf,board,sea',None),('yoga-mat','Rolled and open yoga mat','sports,fitness','yoga,exercise,mat',None),('dumbbell','Dumbbell','sports,fitness','weights,gym,dumbbell',(0,.105,0)),('kettlebell','Kettlebell','sports,fitness','weights,gym,kettlebell',(0,.27,0)),('treadmill','Treadmill','sports,fitness','running,gym,exercise',None),('drum-kit','Drum kit','music','drums,percussion,music',None),('mic-stand','Microphone stand','music,studio','microphone,performance,stand',None),('microphone','Handheld microphone','music,studio','mic,singer,microphone',(0,.10,0)),('dj-booth','DJ booth','music,party','dj,turntables,mixer',None),('pa-speaker','PA loudspeaker','music,studio','speaker,concert,amplifier',None),('golf-club','Golf club','sports','golf,club,putter',(0,.9,0)),('game-console','Game console','tech,living','gaming,console,video game',None),('balloons','Balloon cluster','party,kids','balloons,celebration,party',None),('trophy','Handled trophy','sports,party','award,cup,winner',(0,.16,0))]:
 entry(t,n,'Objects',th,ta,2500 if g is not None else 6000,g,['talk','stand'] if t=='microphone' else None)
for t,n,ta,g in [('log','Cut log','wood,log,forest',None),('tree-stump','Tree stump','wood,stump,forest',None),('flower-bed','Raised flower bed','flowers,garden,planter',None),('cactus','Branched cactus','cactus,desert,succulent',None),('beach-umbrella','Beach umbrella','parasol,umbrella,beach',None),('sun-lounger','Sun lounger','lounger,deckchair,beach',None),('beach-ball','Beach ball','ball,beach,summer',(0,.15,0)),('picnic-table','Picnic table','table,bench,picnic',None),('picnic-basket','Picnic basket','basket,picnic,wicker',(0,.42,0)),('cooler-box','Cooler box','cooler,ice,camping',None),('lantern','Camping lantern','lamp,lantern,camping',(0,.38,0)),('backpack','Backpack','rucksack,bag,hiking',(0,.43,0)),('fishing-rod','Fishing rod','fishing,rod,angling',(0,.28,0)),('kayak','Kayak','boat,kayak,paddle',None),('wheelbarrow','Wheelbarrow','barrow,garden,tools',None),('watering-can','Watering can','water,can,gardening',(0,.38,0))]:
 themes='nature,garden' if t in ['log','tree-stump','flower-bed','cactus','wheelbarrow','watering-can'] else 'nature,beach,camping'
 entry(t,n,'Outdoor',themes,ta,2500 if g is not None else (15000 if t=='kayak' else 6000),g)
CATALOG['game-console']['budget']=2500
CATALOG['kayak']['budget']=6000
CATALOG['sun-lounger']['seat']={'y':.36,'z':.12,'x':[0]}
CATALOG['picnic-table'].update(seat={'y':.45,'z':0,'x':[-.67,.67]},top=.78)
CATALOG['kayak']['seat']={'y':.17,'z':0,'x':[0]}
for t,n,ta,g in [('treasure-chest','Treasure chest','treasure,chest,pirate',None),('shield','Round shield','shield,armor,knight',(0,.32,-.06)),('throne','Royal throne','throne,king,chair',None),('crystal-cluster','Crystal cluster','crystal,gem,magic',None),('magic-staff','Magic staff','staff,wizard,magic',(0,.85,0)),('torch','Flaming torch','fire,torch,dungeon',(0,.30,0)),('potion-bottle','Potion bottle','potion,bottle,magic',(0,.13,0)),('spellbook','Spellbook','book,spell,magic',(0,.04,0)),('signpost','Wooden direction signpost','sign,post,direction',None),('stone-well','Stone well','well,water,stone',None),('wooden-cart','Wooden cart','cart,wagon,wood',None),('anvil','Blacksmith anvil','anvil,forge,blacksmith',None),('tombstone','Tombstone','grave,stone,cemetery',None),('gas-lamp','Gas street lamp','lamp,lantern,victorian',None)]:entry(t,n,'Fantasy','fantasy',ta,2500 if g is not None else 6000,g,['carry','stand','talk'] if g is not None else None)
CATALOG['throne']['seat']={'y':.55,'z':.03,'x':[0]}
for t,n,ta in [('dog','Standing dog','dog,canine,pet'),('dog-sitting','Sitting dog','dog,canine,pet,sit'),('cat','Sitting cat','cat,feline,pet'),('horse','Standing horse','horse,equine,stable'),('pigeon','Pigeon','pigeon,bird,city')]:entry(t,n,'Creatures','animals,nature',ta,12000)

# Shared detail primitives. Wheels are vertical in the YZ plane; front is +Z.
def wheel(n,x,y,z,r=.32,w=.07,spokes=False):
 ring(n+'_tire',(x,y,z),r-w*.44,w*.44,'accent',axis='x',N=24)
 rod(n+'_hub',(x-w*.62,y,z),(x+w*.62,y,z),r*.17,'prop',vertices=12,bev=.002)
 ring(n+'_rim',(x,y,z),r-w*.88,.012,'prop',axis='x',N=24)
 if spokes:
  for i in range(10):
   a=math.tau*i/10;rod(n+'_spoke',(x,y,z),(x,y+(r-w)*math.cos(a),z+(r-w)*math.sin(a)),.0045,'prop',vertices=6,bev=0)
 else:
  rod(n+'_wheel_face',(x-w*.2,y,z),(x+w*.2,y,z),r*.7,'prop',vertices=16,bev=.005)
def post(n,x,z,h,r=.035):rod(n,(x,0,z),(x,h,z),r);rod(n+'_foot',(x,0,z),(x,.04,z),r*2,'accent',vertices=12)
def side_extrude(n,outline,width,mat='prop',bevel=.02):
 # outline is a (z,y) side silhouette.
 vs=[(x,y,z) for x in [-width/2,width/2] for z,y in outline];N=len(outline)
 fs=[tuple(reversed(range(N))),tuple(range(N,2*N))]+[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)]
 return mesh(n,vs,fs,mat,bevel)
def poly_prism(n,c,r,h,sides=6,mat='prop',point=False):
 vs=[]
 for y,rr in [(0,r),(h*.72,r*.86),(h,r*.08 if point else r*.65)]:
  for i in range(sides):
   a=math.tau*i/sides;vs.append((c[0]+rr*math.cos(a),c[1]+y,c[2]+rr*math.sin(a)))
 fs=[tuple(reversed(range(sides))),tuple(2*sides+i for i in range(sides))]
 for k in range(2):
  for i in range(sides):fs.append((k*sides+i,k*sides+(i+1)%sides,(k+1)*sides+(i+1)%sides,(k+1)*sides+i))
 return mesh(n,vs,fs,mat,.004,False)
def tube_arc(n,c,rx,ry,start,end,r,mat='prop',axis='z',steps=13):
 pts=[]
 for i in range(steps):
  a=start+(end-start)*i/(steps-1)
  pts.append((c[0]+rx*math.cos(a),c[1]+ry*math.sin(a),c[2]) if axis=='z' else (c[0],c[1]+ry*math.sin(a),c[2]+rx*math.cos(a)))
 return path(n,pts,r,mat,8)
def disk(n,c,r,h=.015,mat='prop',N=20):return rod(n,(c[0],c[1]-h/2,c[2]),(c[0],c[1]+h/2,c[2]),r,mat,vertices=N,bev=.002)
def slats(n,axis,count,p,s,gap=.01,mat='prop'):
 for i in range(count):
  q=list(p);q[axis]+=(i-(count-1)/2)*(s[axis]+gap);box(n+str(i),q,s,.007,mat,segments=1)

# Street vehicles.
def bicycle():
 for z in [-.61,.61]:wheel('wheel',0,.345,z,.345,.052,True)
 A=(0,.345,-.61);B=(0,.35,-.1);C=(0,.86,-.23);D=(0,.87,.38);E=(0,.345,.61)
 for a,b in [(A,B),(A,C),(B,C),(C,D),(D,B),(D,E)]:rod('frame_tube',a,b,.022)
 rod('seat_post',C,(0,1.01,-.25),.016,'accent');box('saddle',(0,1.015,-.27),(.18,.055,.25),.026,'accent')
 for x in [-.052,.052]:rod('fork',(x,.8,.42),(x,.345,.61),.017)
 path('handlebar',[(-.27,1.08,.43),(-.16,1.08,.48),(0,1.04,.47),(.16,1.08,.48),(.27,1.08,.43)],.017,'accent')
 rod('head_stem',D,(0,1.055,.47),.018)
 for s in [-1,1]:
  rod('crank',(0,.35,-.1),(s*.07,.35+s*.10,-.1),.013,'accent');box('pedal',(s*.115,.35+s*.10,-.1),(.10,.024,.075),.008,'accent')
 ring('chainring',(0,.35,-.1),.086,.009,'accent',axis='x',N=16)
 path('chain',[(.022,.43,-.1),(.022,.39,-.61),(.022,.30,-.61),(.022,.27,-.1)],.006,'accent',6,True)
 box('front_lamp',(0,.93,.49),(.075,.065,.055),.02);box('rear_reflector',(0,.96,-.41),(.075,.04,.02),.01,'accent')

def motorcycle():
 for z in [-.68,.69]:wheel('road_wheel',0,.335,z,.335,.15)
 side_extrude('engine_frame',[(-.68,.38),(-.45,.73),(.26,.79),(.50,.55),(.30,.29),(-.28,.29)],.30,'accent',.045)
 side_extrude('fuel_tank',[(-.27,.74),(-.21,.94),(.09,1.02),(.30,.90),(.25,.75)],.38,'prop',.06)
 side_extrude('seat',[(-.67,.81),(-.59,.93),(-.28,.90),(-.15,.82)],.33,'accent',.035)
 for x in [-.14,.14]:
  rod('front_fork',(x,.94,.40),(x,.335,.69),.025,'accent');rod('rear_swingarm',(x,.38,-.15),(x,.335,-.68),.025)
  rod('shock',(x,.81,-.48),(x,.37,-.64),.025,'accent')
  rod('cylinder',(x*.5,.48,0),(x*.5,.70,.06),.085,'prop',vertices=12)
 for y in [.47,.51,.55,.59,.63]:box('engine_fin',(0,y,.02),(.38,.018,.22),.007,'accent')
 path('exhaust',[(.20,.50,.09),(.24,.28,.07),(.25,.25,-.46),(.25,.30,-.77)],.035,'accent')
 rod('muffler',(.25,.30,-.77),(.25,.32,-.38),.065)
 path('handlebars',[(-.31,1.07,.43),(-.18,1.05,.47),(0,1.01,.43),(.18,1.05,.47),(.31,1.07,.43)],.022,'accent')
 rod('headlamp',(0,.91,.50),(0,.91,.58),.103,'accent',vertices=20)
 for x in [-.26,.26]:rod('mirror_stem',(x,1.06,.43),(x,1.22,.40),.009,'accent');ball('mirror',(x,1.23,.40),(.063,.04,.022),'accent',12,6)
 box('rear_light',(0,.85,-.74),(.23,.045,.035),.012,'accent')

def e_scooter():
 for z in [-.35,.39]:wheel('wheel',0,.105,z,.105,.055)
 box('deck',(0,.15,-.02),(.16,.055,.66),.02);box('grip_deck',(0,.181,-.05),(.13,.008,.46),.006,'accent')
 path('stem',[(0,.10,.39),(0,.24,.35),(0,1.08,.26)],.023)
 rod('crossbar',(-.25,1.09,.26),(.25,1.09,.26),.021,'accent')
 box('dashboard',(0,1.11,.27),(.085,.045,.07),.012,'accent')
 for x in [-.20,.20]:rod('rubber_grip',(x-.045,1.09,.26),(x+.045,1.09,.26),.026,'accent')
 path('kickstand',[(.055,.14,-.13),(.12,.025,-.13)],.009,'accent')

def bus():
 box('lower_body',(0,.85,0),(2.4,.77,7.5),.12)
 side_extrude('upper_body',[(-3.75,1.05),(-3.75,2.73),(-3.57,2.95),(3.40,2.95),(3.72,2.60),(3.75,1.05)],2.4,'prop',.10)
 for x in [-1.15,1.15]:
  for z in [-2.35,2.45]:wheel('bus_wheel',x,.49,z,.49,.25)
  for z in [-2.72,-1.58,-.44,.70,1.84]:box('side_window',(x*1.052,2.16,z),(.025,1.03,1.04),.07,'accent')
  box('belt_line',(x*1.055,1.43,0),(.026,.045,7.18),.012,'accent')
 box('windscreen',(0,2.19,3.724),(2.14,1.07,.035),.08,'accent')
 box('route_panel',(0,2.79,3.58),(1.70,.19,.045),.04,'accent')
 box('rear_window',(0,2.20,-3.761),(1.95,.94,.025),.07,'accent')
 for z in [3.78,-3.79]:
  box('bumper',(0,.60,z),(2.29,.18,.10),.045,'accent')
  for x in [-.91,.91]:box('lights',(x,.97,z),(.31,.20,.035),.035,'accent')
 box('grille',(0,.95,3.77),(1.19,.25,.025),.015,'accent')
 for y in [.87,.95,1.03]:box('grille_bar',(0,y,3.79),(1.05,.014,.018),.004)
 for z in [1.5,2.03]:box('passenger_door',(-1.218,1.45,z),(.045,2.0,.49),.018,'accent')
 for z in [1.5,2.03]:box('door_glass',(-1.245,1.75,z),(.015,1.24,.38),.018)
 box('roof_air_unit',(0,3.04,-.7),(1.5,.20,1.7),.10)
 for x in [-1.4,1.4]:rod('mirror_arm',(x*.85,2.45,3.25),(x,2.45,3.43),.025,'accent');box('mirror',(x,2.35,3.43),(.10,.30,.17),.04,'accent')

def van():
 box('chassis',(0,.52,-.05),(1.65,.28,3.78),.065,'accent')
 side_extrude('body',[(-2.04,.50),(-2.04,2.0),(-1.85,2.18),(.70,2.18),(1.48,1.55),(1.95,1.40),(2.05,.61)],1.83,'prop',.07)
 for x in [-.91,.91]:
  for z in [-1.27,1.25]:wheel('van_wheel',x,.34,z,.34,.18)
  side_extrude('unused',[(0,0),(0,0.01),(.01,0)],.001) if False else None
  mesh('side_cab_window',[(x*1.015,1.38,.53),(x*1.015,2.04,.57),(x*1.015,1.51,1.36),(x*1.015,1.38,1.36)],[(0,1,2,3)],'accent')
  box('side_door_seam',(x*1.013,1.20,.37),(.016,1.48,.013),.003,'accent')
  box('sliding_door_seam',(x*1.013,1.29,-.48),(.016,1.57,.013),.003,'accent')
  box('door_handle',(x*1.027,1.15,.61),(.045,.04,.16),.015,'accent')
  box('cargo_handle',(x*1.027,1.17,-.72),(.045,.04,.20),.015,'accent')
 # Slope glass is a closed thin four-corner slab.
 mesh('windscreen',[(-.79,2.09,.71),(.79,2.09,.71),(.79,1.57,1.43),(-.79,1.57,1.43),(-.79,2.075,.70),(.79,2.075,.70),(.79,1.555,1.42),(-.79,1.555,1.42)],[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],'accent')
 for z in [2.04,-2.06]:box('bumper',(0,.56,z),(1.83,.18,.10),.035,'accent')
 box('front_grille',(0,.86,2.035),(.92,.26,.035),.02,'accent')
 for x in [-.64,.64]:box('headlight',(x,1.08,2.02),(.35,.23,.04),.04,'accent');box('rear_lamp',(x,1.08,-2.058),(.16,.44,.025),.025,'accent')
 box('rear_door_seam',(0,1.30,-2.063),(.015,1.57,.015),.003,'accent')
 for x in [-1.06,1.06]:box('mirror',(x,1.62,1.1),(.19,.22,.15),.035,'accent')

# Street furniture, machines, shop architecture.
def traffic_light():
 post('signal_pole',0,0,2.6,.055)
 box('signal_housing',(0,2.35,.08),(.34,.95,.22),.06,'accent')
 for y in [2.05,2.35,2.65]:
  rod('signal_lens',(0,y,.20),(0,y,.225),.105,'prop',vertices=20)
  # Short, open forward hoods give the three lamps a recognisable side silhouette.
  tube_arc('lens_hood',(0,y,.25),.12,.12,0,math.pi,.024,'accent')
 box('rear_mount',(0,2.34,-.04),(.08,.65,.13),.015)

def stop_sign():
 post('sign_post',0,0,2.1,.027)
 outline=[(.37*math.cos(math.pi/8+i*math.tau/8),.37*math.sin(math.pi/8+i*math.tau/8)) for i in range(8)]
 profile_extrude('octagon',outline,.035,(0,1.92,.035),'prop',.008)
 profile_extrude('inset_octagon',[(x*.86,y*.86) for x,y in outline],.008,(0,1.92,.058),'accent',.004)

def street_sign():
 post('street_post',0,0,2.4,.032)
 box('street_plate',(0,2.23,0),(1.0,.19,.045),.022)
 box('cross_street_plate',(0,2.42,0),(.045,.19,.86),.022)
 for z in [-.028,.028]:box('plate_inset',(0,2.23,z),(.84,.10,.008),.012,'accent')
 for x in [-.028,.028]:box('cross_inset',(x,2.42,0),(.008,.10,.71),.012,'accent')
 ball('post_finial',(0,2.56,0),(.047,.047,.047),seg=12,rings=6)

def fire_hydrant():
 disk('base_flange',(0,.045,0),.18,.09,N=16)
 rod('barrel',(0,.05,0),(0,.60,0),.115,vertices=16)
 lathe('cap',[(0,.68),(.075,.68),(.14,.62),(.14,.58),(.105,.56),(0,.56)],N=16)
 disk('cap_nut',(0,.71,0),.038,.06,N=6)
 for s in [-1,1]:
  rod('side_port',(s*.10,.42,0),(s*.23,.42,0),.075,vertices=12)
  rod('hose_cap',(s*.23,.42,0),(s*.26,.42,0),.088,'accent',vertices=12)
  rod('cap_square',(s*.26,.42,0),(s*.29,.42,0),.031,vertices=4)
 rod('front_port',(0,.35,.09),(0,.35,.17),.08);rod('front_cap',(0,.35,.17),(0,.35,.20),.09,'accent',vertices=12)
 for x in [-.11,.11]:disk('bolt',(x,.095,.07),.016,.02,N=6)

def parking_meter():
 post('meter_post',0,0,1.12,.036)
 profile_extrude('meter_head',[(-.14,0),(.14,0),(.17,.26),(.13,.36),(-.13,.36),(-.17,.26)],.19,(0,1.06,0),'prop',.035)
 box('display',(0,1.29,.105),(.23,.11,.018),.018,'accent')
 box('coin_slot',(0,1.17,.105),(.095,.014,.018),.006,'accent')
 rod('payment_knob',(.07,1.09,.10),(.07,1.09,.135),.027,'accent',vertices=12)

def bollard():
 lathe('bollard',[(0,0),(.12,0),(.12,.06),(.085,.08),(.085,.76),(.07,.82),(0,.84)],N=20)
 lathe('reflective_band',[(.085,.62),(.089,.62),(.089,.70),(.085,.70)],mat='accent',N=20)

def road_barrier():
 for x in [-.84,.84]:
  box('foot',(x,.045,0),(.20,.09,.68),.025,'accent');box('upright',(x,.56,0),(.075,1.04,.075),.016)
 for y in [.45,.86]:box('rail',(0,y,0),(1.88,.18,.06),.018)
 for x in [-.68,-.23,.23,.68]:
  profile_extrude('diagonal_warning',[(x-.11,.365),(x+.02,.365),(x+.18,.535),(x+.05,.535)],.008,(0,0,.036),'accent',.002)
 for x in [-.84,.84]:ball('warning_lamp',(x,1.14,0),(.062,.07,.05),'accent',12,6)

def dumpster():
 # Tapered bin, split lid, lifting pockets and four caster wheels.
 vs=[(x,y,z) for y,w,d in [(.16,.61,.40),(1.01,.71,.48)] for x,z in [(-w,-d),(w,-d),(w,d),(-w,d)]]
 mesh('bin_body',vs,[(0,3,2,1),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)],bevel=.035)
 for x in [-.36,.36]:box('lid_half',(x,1.06,0),(.71,.11,1.02),.035,'accent');handle('lid_handle',x,1.08,.40,.20,.018)
 for x in [-.55,.55]:
  for z in [-.33,.33]:wheel('caster',x,.10,z,.10,.065)
 for x in [-.73,.73]:box('lifting_pocket',(x,.63,0),(.09,.15,.34),.015,'accent')
 for x in [-.43,0,.43]:box('front_rib',(x,.61,.46),(.045,.64,.035),.01)

def shopping_cart():
 for x in [-.24,.24]:
  for z in [-.38,.32]:wheel('caster',x,.075,z,.075,.04)
 for x in [-.25,.25]:path('base_frame',[(x,.15,.40),(x,.15,-.42),(x,.91,-.42)],.019,'accent')
 rod('handle',(-.29,.96,-.46),(.29,.96,-.46),.026)
 path('basket_rim',[(-.27,.91,-.31),(-.33,.91,.42),(.33,.91,.42),(.27,.91,-.31)],.018,'accent',8,True)
 path('basket_floor',[(-.21,.49,-.25),(-.25,.49,.32),(.25,.49,.32),(.21,.49,-.25)],.016,'accent',8,True)
 for x in [-.25,-.15,-.05,.05,.15,.25]:
  rod('basket_front_wire',(x*.75,.49,.32),(x*1.2,.91,.42),.006,'prop',vertices=6,bev=0)
  rod('basket_floor_wire',(x*.75,.50,-.25),(x*.92,.50,.32),.006,'prop',vertices=6,bev=0)
 for x in [-1,1]:
  for z in [-.23,-.1,.03,.16,.29,.40]:rod('basket_side_wire',(x*.23,.49,z*.75),(x*(.27+(z+.31)*.082),.91,z),.006,'prop',vertices=6,bev=0)
  for y in [.59,.70,.80]:rod('basket_side_rail',(x*(.21+(y-.49)*.143),y,-.27),(x*(.25+(y-.49)*.19),y,.32+(y-.49)*.24),.006,'prop',vertices=6,bev=0)
 for y in [.59,.70,.80]:rod('basket_front_rail',(-.25-(y-.49)*.19,y,.32+(y-.49)*.24),(.25+(y-.49)*.19,y,.32+(y-.49)*.24),.006,vertices=6,bev=0)
 box('child_seat',(0,.73,-.29),(.42,.03,.19),.009,'accent')
 for x in [-.10,.10]:box('seat_leg_gap',(x,.80,-.405),(.13,.11,.015),.006,'accent')

def bike_rack():
 for z in [-.24,.24]:box('ground_rail',(0,.035,z),(1.8,.07,.06),.015,'accent')
 for x in [-.69,-.23,.23,.69]:path('parking_loop',[(x,0,-.24),(x,.64,-.24),(x,.75,-.16),(x,.75,.16),(x,.64,.24),(x,0,.24)],.028)

def vending_machine():
 box('cabinet',(0,.93,0),(.95,1.86,.73),.045)
 box('front_recess',(-.13,1.10,.375),(.64,1.31,.035),.025,'accent')
 for y in [.65,.93,1.21,1.49]:
  box('shelf',(-.13,y-.11,.40),(.60,.025,.12),.006)
  for x in [-.32,-.12,.08]:rod('drink_can',(x,y-.09,.41),(x,y+.08,.41),.055,'prop',vertices=12)
 box('selection_panel',(.34,1.20,.389),(.16,.80,.035),.02,'accent')
 box('payment_display',(.34,1.44,.412),(.115,.12,.012),.009)
 for y in [1.13,1.23,1.33]:rod('button',(.34,y,.414),(.34,y,.429),.022,vertices=12)
 box('card_slot',(.34,.99,.415),(.095,.015,.009),.003)
 box('collection_recess',(-.06,.25,.38),(.63,.19,.025),.02,'accent')
 box('pickup_flap',(-.06,.30,.398),(.59,.07,.03),.01)
 box('header_band',(0,1.77,.38),(.79,.09,.025),.012,'accent')

def atm():
 box('lower_cabinet',(0,.48,-.04),(.73,.96,.62),.04)
 side_extrude('sloped_console',[(-.35,.84),(-.35,1.70),(.17,1.70),(.30,1.24),(.38,.90)],.75,'prop',.035)
 box('screen_recess',(0,1.45,.25),(.49,.30,.03),.025,'accent')
 box('screen_inner',(0,1.45,.27),(.39,.23,.008),.01)
 for x in [-.275,.275]:
  for y in [1.37,1.45,1.53]:box('screen_button',(x,y,.27),(.036,.023,.015),.005,'accent',segments=1)
 box('keypad',(0,1.03,.40),(.27,.025,.18),.01,'accent')
 for x in [-.075,0,.075]:
  for z in [.35,.40,.45]:box('key',(x,1.049,z),(.046,.009,.034),.003,segments=1)
 box('cash_slot',(0,.84,.329),(.37,.035,.02),.006,'accent')
 box('card_slot',(.22,1.18,.34),(.14,.025,.02),.004,'accent')

def kiosk():
 box('base',(0,.055,0),(2.0,.11,1.64),.03,'accent')
 box('lower_counter',(0,.60,0),(1.86,1.12,1.48),.035)
 box('counter_lip',(0,1.18,.15),(2.05,.075,1.7),.025)
 for x in [-.88,.88]:
  for z in [-.68,.68]:box('corner_post',(x,1.69,z),(.075,1.08,.075),.015)
 box('rear_wall',(0,1.69,-.69),(1.76,1.01,.045),.015,'accent')
 box('canopy',(0,2.30,0),(2.16,.19,1.86),.055)
 box('fascia',(0,2.20,.88),(2.08,.25,.035),.015,'accent')
 for x in [-.50,.0,.50]:box('display_stack',(x,1.255,.50),(.39,.08,.35),.008,'accent')
 for y in [.35,.70]:box('front_panel',(0,y,.756),(1.55,.26,.018),.008)

def market_stall():
 for x in [-1.05,1.05]:
  for z in [-.60,.60]:box('post',(x,1.10,z),(.065,2.2,.065),.014)
 box('counter',(0,.87,0),(2.3,.10,1.28),.025)
 slats('front_panel',0,12,(0,.46,.55),(.17,.72,.035),.012)
 side_extrude('pitched_canopy',[(-.82,2.14),(0,2.54),(.82,2.14)],2.5,'prop',.025)
 for x in [-.94,-.47,0,.47,.94]:
  mesh('canopy_stripe',[(x-.115,2.152,.81),(x+.115,2.152,.81),(x+.115,2.552,0),(x-.115,2.552,0)],[(0,1,2,3)],'accent')
  box('valance',(x,2.08,.82),(.235,.14,.03),.01,'accent')
 for x in [-.68,0,.68]:
  box('produce_crate',(x,.99,.08),(.59,.14,.60),.016,'accent')
  for dx in [-.17,0,.17]:
   for z in [-.08,.12]:ball('produce',(x+dx,1.10,z),(.075,.065,.07),seg=10,rings=6)

def scaffolding():
 for x in [-1.08,1.08]:
  for z in [-.5,.5]:
   rod('upright',(x,0,z),(x,3.05,z),.027)
   disk('base_plate',(x,.018,z),.10,.035,N=8)
 for y in [.20,1.48,2.75]:
  for z in [-.5,.5]:rod('long_rail',(-1.08,y,z),(1.08,y,z),.026)
  for x in [-1.08,1.08]:rod('cross_rail',(x,y,-.5),(x,y,.5),.026)
 for z in [-.5,.5]:
  rod('diagonal',(-1.08,.20,z),(1.08,2.75,z),.017,'accent');rod('diagonal',(-1.08,2.75,z),(1.08,.20,z),.017,'accent')
 for y in [1.42,2.69]:slats('platform',2,4,(0,y,0),(2.14,.055,.23),.012)
 for x in [-1.08,1.08]:
  for y in [.45,.73,1.01,1.29,1.57,1.85,2.13,2.41]:rod('ladder_rung',(x,y,-.47),(x,y,.47),.02)

def billboard():
 for x in [-1.35,1.35]:box('support_post',(x,1.6,0),(.15,3.2,.17),.018,'accent')
 box('billboard_frame',(0,3.12,0),(4.4,2.15,.18),.035)
 box('display_panel',(0,3.12,.101),(4.15,1.90,.025),.015,'accent')
 box('bottom_ledge',(0,2.08,.16),(4.48,.075,.38),.015)
 for x in [-1.4,0,1.4]:
  path('lamp_arm',[(x,2.06,.12),(x,1.93,.50),(x,2.14,.62)],.026,'accent');box('uplight',(x,2.17,.61),(.34,.11,.20),.025)

def shop_front():
 for x,w in [(-1.7,.22),(.1,.18),(1.72,.18)]:box('facade_pier',(x,1.46,0),(w,2.92,.23),.018)
 box('header',(0,2.70,0),(3.64,.43,.27),.02);box('cornice',(0,2.96,.02),(3.78,.10,.35),.02)
 box('shop_sign',(0,2.71,.153),(3.24,.24,.025),.015,'accent')
 box('door_frame',(-.84,1.2,0),(1.43,2.4,.12),.016,'accent')
 box('door_glass',(-.84,1.40,.072),(1.24,1.74,.022),.01)
 box('door_kickplate',(-.84,.26,.078),(1.24,.40,.025),.008)
 rod('door_pull',(-.29,1.02,.115),(-.29,1.38,.115),.018,'accent')
 box('window_frame',(.93,1.39,0),(1.44,2.16,.12),.018,'accent')
 box('window_glass',(.93,1.39,.07),(1.25,1.95,.025),.01)
 box('window_sill',(.93,.30,.11),(1.51,.09,.30),.02)
 box('threshold',(-.84,.035,.13),(1.47,.07,.44),.015)

def awning():
 side_extrude('sloping_canopy',[(-.03,.65),(.95,.18),(.95,.12),(-.03,.59)],2.6,'prop',.018)
 for x in [-1.04,-.52,0,.52,1.04]:
  mesh('canopy_stripe',[(x-.13,.662,-.03),(x+.13,.662,-.03),(x+.13,.192,.95),(x-.13,.192,.95)],[(0,1,2,3)],'accent')
 for x in [-1.17,-.91,-.65,-.39,-.13,.13,.39,.65,.91,1.17]:
  profile_extrude('scalloped_valance',[(-.13,.18),(.13,.18),(.13,.04),(.08,.0),(-.08,.0),(-.13,.04)],.035,(x,0,.95),'accent' if int(round((x+1.17)/.26))%2==0 else 'prop',.012)
 for x in [-1.18,1.18]:rod('wall_bracket',(x,.60,0),(x,.15,.90),.018,'accent')

def build(asset_type):
 fn=globals().get(asset_type.replace('-','_'))
 if not callable(fn):raise ValueError('Missing batch 2 world builder: '+asset_type)
 fn()

# Sports, fitness, instruments and party props.
def football():
 r=.11;c=Vector((0,r,0));ball('ball',c,(r,r,r),seg=32,rings=16)
 phi=(1+5**.5)/2
 normals=[Vector(v).normalized() for v in [(0,a,b*phi) for a in [-1,1] for b in [-1,1]]+[(a,b*phi,0) for a in [-1,1] for b in [-1,1]]+[(b*phi,0,a) for a in [-1,1] for b in [-1,1]]]
 for i,n in enumerate(normals):
  u=n.cross(Vector((0,1,0)))
  if u.length<.1:u=n.cross(Vector((1,0,0)))
  u.normalize();v=n.cross(u)
  pts=[tuple(c+(n+(.29*(u*math.cos(j*math.tau/5)+v*math.sin(j*math.tau/5)))).normalized()*(r+.002)) for j in range(5)]
  pts.append(tuple(c+n*(r+.002)))
  mesh('pentagon_'+str(i),pts,[(j,(j+1)%5,5) for j in range(5)],'accent',smooth=False)

def basketball():
 r=.12;c=(0,r,0);ball('ball',c,(r,r,r),seg=24,rings=12)
 for axis in ['x','y','z']:ring('panel_seam',c,r,.0018,'accent',axis=axis,N=32)
 for s in [-1,1]:
  pts=[]
  for i in range(33):
   a=math.tau*i/33;x=s*.078*math.sin(a);rr=(r*r-x*x)**.5;pts.append((x,r+rr*math.cos(a),rr*math.sin(a)))
  path('curved_seam',pts,.0015,'accent',6,True)

def tennis_racket():
 pts=[(.125*math.cos(i*math.tau/28),.48+.165*math.sin(i*math.tau/28),0) for i in range(28)]
 path('oval_frame',pts,.012,'prop',8,True)
 path('throat',[(-.082,.36,0),(-.035,.25,0),(0,.23,0),(.035,.25,0),(.082,.36,0)],.009,'prop',8)
 rod('grip',(0,.015,0),(0,.245,0),.019,'accent',vertices=12)
 for x in [-.08,-.04,0,.04,.08]:
  h=.152*(1-(x/.115)**2)**.5;rod('vertical_string',(x,.48-h,0),(x,.48+h,0),.0014,'accent',vertices=4,bev=0)
 for dy in [-.12,-.08,-.04,0,.04,.08,.12]:
  w=.113*(1-(dy/.155)**2)**.5;rod('horizontal_string',(-w,.48+dy,0),(w,.48+dy,0),.0014,'accent',vertices=4,bev=0)
 for y in [.04,.075,.11,.145,.18,.215]:disk('grip_ridge',(0,y,0),.020,.004,'prop',N=12)

def skateboard():
 # Bent kicktails, continuous top and underside.
 xs=[-.102,.102];sections=[(-.42,.18,.073),(-.35,.125,.10),(-.27,.105,.105),(.27,.105,.105),(.35,.125,.10),(.42,.18,.073)]
 vs=[]
 for z,y,w in sections:vs.extend([(-w,y,z),(w,y,z),(-w,y-.018,z),(w,y-.018,z)])
 fs=[]
 for i in range(len(sections)-1):
  a=4*i;b=a+4;fs.extend([(a,a+1,b+1,b),(a+2,b+2,b+3,a+3),(a,b,a+2+4,a+2),(a+1,a+3,b+3,b+1)])
 fs.extend([(0,2,3,1),(20,21,23,22)]);mesh('curved_deck',vs,fs,bevel=.008)
 box('grip_tape',(0,.108,0),(.186,.004,.53),.015,'accent')
 for z in [-.26,.26]:
  rod('axle',(-.13,.065,z),(.13,.065,z),.012,'accent')
  box('truck',(0,.078,z),(.085,.037,.055),.009)
  for x in [-.12,.12]:wheel('urethane_wheel',x,.047,z,.047,.038)

def surfboard():
 sections=[(-1.02,.012,.05),(-.9,.095,.025),(-.55,.235,.008),(0,.28,0),(.52,.24,.025),(.85,.12,.08),(1.02,.012,.14)]
 vs=[]
 for z,w,y in sections:
  vs.extend([(-w,y+.055,z),(0,y+.075,z),(w,y+.055,z),(-w,y+.035,z),(0,y+.025,z),(w,y+.035,z)])
 fs=[]
 for i in range(len(sections)-1):
  a=6*i;b=a+6
  fs.extend([(a,a+1,b+1,b),(a+1,a+2,b+2,b+1),(a+3,b+3,b+4,a+4),(a+4,b+4,b+5,a+5),(a,b,b+3,a+3),(a+2,a+5,b+5,b+2)])
 fs.extend([(0,3,4,5,2,1),(36,37,38,41,40,39)]);mesh('shaped_board',vs,fs,bevel=.008)
 path('centre_stringer',[(0,y+.077,z) for z,w,y in sections],.0035,'accent',6)
 profile_extrude('tail_fin',[(-.14,0),(.13,0),(.02,.16),(-.06,.17)],.016,(0,.07,-.68),'accent',.007)

def yoga_mat():
 box('mat',(0,.006,.15),(.62,.012,1.52),.006)
 rod('rolled_mat',(-.31,.085,-.63),(.31,.085,-.63),.085,'prop',vertices=24,bev=.004)
 for x in [-.315,.315]:
  for r in [.025,.047,.068]:ring('rolled_edge',(x,.085,-.63),r,.003,'accent',axis='x',N=20)
 box('mat_edge',(0,.014,.85),(.58,.002,.008),.001,'accent')

def dumbbell():
 rod('handle',(-.095,.105,0),(.095,.105,0),.024,'accent',vertices=16)
 for x in [-.15,.15]:
  rod('weight',(x-.055,.105,0),(x+.055,.105,0),.105,'prop',vertices=10,bev=.012)
  rod('endcap',(x-.057,.105,0),(x+.057,.105,0),.032,'accent',vertices=12)
 for x in [-.06,-.03,0,.03,.06]:ring('handle_groove',(x,.105,0),.0245,.0015,'prop',axis='x',N=12)

def kettlebell():
 lathe('weight',interpolate_sections([(0,0),(.075,0),(.12,.045),(.135,.11),(.115,.18),(.065,.21),(0,.21)],3),N=32)
 path('handle',interpolate_sections([(-.075,.17,0),(-.10,.24,0),(-.09,.30,0),(-.05,.32,0),(.05,.32,0),(.09,.30,0),(.10,.24,0),(.075,.17,0)],3),.024,'accent',8)

def treadmill():
 box('deck',(0,.18,0),(.85,.19,1.76),.06)
 box('running_belt',(0,.285,0),(.61,.025,1.50),.025,'accent')
 for x in [-.365,.365]:
  box('side_rail',(x,.30,0),(.095,.05,1.57),.02)
  path('front_upright',[(x,.18,.68),(x,1.19,.59),(x,1.29,.48)],.038,'accent')
  path('handrail',[(x,1.04,.57),(x,1.04,.0)],.028)
 box('motor_cover',(0,.35,.70),(.73,.17,.30),.05)
 box('control_console',(0,1.27,.49),(.78,.13,.33),.035)
 box('display',(0,1.345,.48),(.34,.014,.19),.015,'accent')
 for x in [-.25,.25]:disk('control_button',(x,1.345,.47),.028,.014,'accent',N=12)
 for x in [-.30,.30]:
  for z in [-.66,.66]:box('foot',(x,.06,z),(.12,.12,.16),.025,'accent')

def drum(n,c,r,h,axis='y'):
 if axis=='y':
  rod(n+'_shell',(c[0],c[1]-h/2,c[2]),(c[0],c[1]+h/2,c[2]),r,'prop',vertices=16,bev=.003)
  for y in [c[1]-h/2,c[1]+h/2]:disk(n+'_head',(c[0],y,c[2]),r*.98,.012,'accent',N=16);path(n+'_rim',[(c[0]+r*math.cos(j*math.tau/16),y,c[2]+r*math.sin(j*math.tau/16)) for j in range(16)],.007,'prop',4,True)
 else:
  rod(n+'_shell',(c[0],c[1],c[2]-h/2),(c[0],c[1],c[2]+h/2),r,'prop',vertices=16,bev=.003)
  for z in [c[2]-h/2,c[2]+h/2]:rod(n+'_head',(c[0],c[1],z-.004),(c[0],c[1],z+.004),r*.98,'accent',vertices=16,bev=.001);path(n+'_rim',[(c[0]+r*math.cos(j*math.tau/16),c[1]+r*math.sin(j*math.tau/16),z) for j in range(16)],.009,'prop',4,True)
def tripod(n,c,h):
 rod(n+'_pole',(c[0],.07,c[2]),(c[0],h,c[2]),.012,'accent',vertices=8,bev=0)
 for i in range(3):
  a=i*math.tau/3;rod(n+'_leg',(c[0],.19,c[2]),(c[0]+.22*math.cos(a),.02,c[2]+.22*math.sin(a)),.012,'accent',vertices=8,bev=0)
def drum_kit():
 drum('bass',(0,.31,.24),.30,.36,'z')
 for x in [-.21,.21]:drum('rack_tom',(x,.76,.14),.16,.22);rod('tom_mount',(0,.45,.20),(x,.66,.14),.015,'accent',vertices=10)
 drum('floor_tom',(.50,.49,-.12),.22,.30)
 for a in [0,2.1,4.2]:rod('floor_tom_leg',(.5+.19*math.cos(a),.43,-.12+.19*math.sin(a)),(.5+.24*math.cos(a),.02,-.12+.24*math.sin(a)),.012,'accent',vertices=8,bev=0)
 drum('snare',(-.42,.52,-.27),.18,.13);tripod('snare_stand',(-.42,0,-.27),.48)
 for x,z,h,r in [(-.67,.14,1.05,.25),(.63,.43,1.13,.28),(-.61,-.41,.83,.19)]:
  tripod('cymbal_stand',(x,0,z),h)
  lathe('cymbal',[(0,h+.035),(.045,h+.04),(r,h),(r,h-.008),(.04,h+.023),(0,h+.023)],(x,0,z),'prop',N=20)
 box('kick_pedal',(0,.035,-.08),(.11,.03,.22),.01,'accent')
 disk('stool_cushion',(0,.49,-.61),.17,.07,'accent',N=20);tripod('stool',(0,0,-.61),.46)

def mic_stand():
 tripod('microphone_stand',(0,0,0),1.36)
 rod('boom',(0,1.30,-.14),(0,1.57,.46),.012)
 rod('microphone',(0,1.57,.43),(0,1.57,.66),.024,'accent',vertices=12)
 ball('microphone_grille',(0,1.57,.69),(.035,.035,.045),seg=12,rings=6)
 rod('adjustment_knob',(-.04,1.35,0),(.04,1.35,0),.034,'accent',vertices=12)

def microphone():
 lathe('handle',[(0,0),(.018,0),(.023,.018),(.025,.17),(.030,.19),(0,.19)],mat='accent',N=16)
 ball('grille',(0,.225,0),(.042,.048,.042),seg=20,rings=10)
 ring('grille_band',(0,.217,0),.041,.004,'accent',N=20)
 box('switch',(0,.132,.024),(.013,.031,.004),.003)

def dj_booth():
 for x in [-.70,.70]:box('support',(x,.48,0),(.08,.96,.54),.018,'accent')
 box('desk',(0,.97,0),(1.82,.11,.78),.03)
 box('front_panel',(0,.56,.34),(1.70,.73,.04),.016,'accent')
 for x in [-.57,.57]:
  box('turntable',(x,1.06,0),(.50,.07,.57),.02,'accent');disk('platter',(x,1.105,0),.185,.02,N=24);disk('label',(x,1.119,0),.055,.008,'accent',N=16)
  path('tonearm',[(x+.18,1.13,-.17),(x+.19,1.14,.04),(x+.12,1.14,.13)],.007)
 box('mixer',(0,1.06,0),(.42,.08,.55),.014,'accent')
 for x in [-.12,0,.12]:
  box('fader_slot',(x,1.106,.10),(.012,.003,.17),.002)
  box('fader',(x,1.116,.08),(.043,.015,.021),.004)
  for z in [-.17,-.08]:disk('mixer_knob',(x,1.12,z),.018,.027,N=10)

def pa_speaker():
 side_extrude('speaker_cabinet',[(-.20,0),(.25,0),(.25,.73),(-.15,.73),(-.24,.61)],.44,'prop',.04)
 box('front_grille',(0,.365,.256),(.38,.65,.025),.025,'accent')
 for y,r in [(.255,.145),(.56,.065)]:
  rod('driver',(0,y,.27),(0,y,.285),r,'prop',vertices=24)
  ring('speaker_surround',(0,y,.289),r*.80,.008,'accent',axis='z',N=24)
  ball('dust_cap',(0,y,.29),(r*.36,r*.36,.019),'accent',16,8)
 box('top_handle',(0,.733,0),(.17,.017,.07),.007,'accent')

def golf_club():
 rod('shaft',(0,.07,0),(0,.99,0),.0055,'prop',vertices=12)
 rod('grip',(0,.78,0),(0,1.02,0),.013,'accent',vertices=12)
 side_extrude('club_head',[(-.055,.012),(.075,.012),(.10,.055),(.04,.10),(-.035,.08)],.095,'prop',.014)
 for y in [.79,.83,.87,.91,.95,.99]:ring('grip_ridge',(0,y,0),.013,.0012,'prop',N=12)

def game_console():
 box('central_core',(0,.07,0),(.28,.14,.28),.025,'accent')
 for x in [-.15,.15]:box('curved_side_panel',(x,.08,0),(.035,.16,.31),.016)
 box('disc_slot',(-.07,.074,.145),(.12,.008,.006),.003)
 rod('power_button',(.07,.07,.145),(.07,.07,.151),.008,vertices=10,bev=0)
 for x in [-.08,-.04,0,.04,.08]:box('top_vent',(x,.143,-.04),(.012,.005,.11),.002)

def balloons():
 anchors=[(-.22,1.28,-.02),(.02,1.50,.01),(.23,1.28,.03)]
 for i,(x,y,z) in enumerate(anchors):
  ball('inflated_balloon',(x,y,z),(.18,.235,.17),'accent' if i==1 else 'prop',20,10)
  rod('tied_neck',(x,y-.24,z),(x,y-.27,z),.016,vertices=8)
  path('string',[(0,.04,0),(x*.25,.43,z),(x*.75,.80,z),(x,y-.27,z)],.0035,'accent',6)
 box('balloon_weight',(0,.025,0),(.15,.05,.12),.015,'accent')

def trophy():
 box('plinth',(0,.035,0),(.19,.07,.17),.016,'accent')
 disk('base',(0,.087,0),.083,.04,N=20)
 rod('stem',(0,.10,0),(0,.22,0),.023)
 lathe('cup',[(.023,.20),(.07,.23),(.105,.33),(.105,.37),(.091,.37),(.086,.33),(.055,.25),(.023,.22)],N=24)
 for s in [-1,1]:path('trophy_handle',[(s*.085,.345,0),(s*.145,.35,0),(s*.16,.31,0),(s*.14,.255,0),(s*.065,.24,0)],.010)
 box('award_plaque',(0,.039,.087),(.11,.032,.006),.005)

# Garden, beach and camping.
def log():
 rod('log_trunk',(0,.19,-.56),(0,.19,.56),.19,'prop',r2=.17,vertices=16,bev=.015)
 for z in [-.565,.565]:
  rod('cut_end',(0,.19,z-.004),(0,.19,z+.004),.157,'accent',vertices=20,bev=0)
  for r in [.045,.09,.133]:ring('growth_ring',(0,.19,z*1.012),r,.0038,'prop',axis='z',N=20)
 for i in range(8):
  a=math.tau*i/8;path('bark_ridge',[(.185*math.cos(a),.19+.185*math.sin(a),-.45),(.18*math.cos(a+.04),.19+.18*math.sin(a+.04),0),(.169*math.cos(a),.19+.169*math.sin(a),.45)],.007,'accent',6)
 rod('branch_stub',(.13,.29,-.08),(.25,.42,-.02),.055,'prop',r2=.034,vertices=12)

def tree_stump():
 # Undulating flared roots and a broad sawn top.
 N=16;vs=[]
 for level in range(3):
  for i in range(N):
   a=math.tau*i/N;r=([.30+(i%2)*.075,.225,.235][level]);y=[.025,.18,.47][level]
   vs.append((r*math.cos(a),y,r*math.sin(a)))
 fs=[tuple(reversed(range(N))),tuple(range(2*N,3*N))]
 for k in range(2):
  for i in range(N):fs.append((k*N+i,k*N+(i+1)%N,(k+1)*N+(i+1)%N,(k+1)*N+i))
 mesh('stump_with_roots',vs,fs,bevel=.018)
 disk('cut_surface',(0,.477,0),.219,.013,'accent',N=24)
 for r in [.065,.12,.18]:ring('growth_ring',(0,.485,0),r,.004,N=24)
 for i in range(8):
  a=math.tau*i/8;path('bark_line',[(.31*math.cos(a),.045,.31*math.sin(a)),(.225*math.cos(a),.22,.225*math.sin(a)),(.23*math.cos(a),.43,.23*math.sin(a))],.006,'accent',6)

def leaf(n,a,b,w=.05,mat='prop'):
 a=Vector(a);b=Vector(b);v=b-a;side=v.cross(Vector((0,1,0)))
 if side.length<1e-6:side=Vector((1,0,0))
 side.normalize();mid=(a+b)*.5
 verts=[a,mid+side*w,b,mid-side*w,mid+Vector((0,w*.23,0)),mid-Vector((0,w*.12,0))]
 return mesh(n,verts,[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(1,0,5),(2,1,5),(3,2,5),(0,3,5)],mat)
def flower_bed():
 box('soil',(0,.15,0),(1.40,.22,.65),.025,'accent')
 for x in [-.75,.75]:box('bed_end',(x,.17,0),(.10,.34,.83),.02)
 for z in [-.365,.365]:box('bed_edge',(0,.17,z),(1.42,.34,.10),.02)
 for i,(x,z) in enumerate([(-.53,-.12),(-.25,.16),(.06,-.14),(.34,.15),(.57,-.10)]):
  h=.52+(i%3)*.06;path('flower_stem',[(x,.24,z),(x+.025,.40,z),(x,h,z)],.008,'accent',6)
  for s in [-1,1]:leaf('leaf',(x,.36,z),(x+s*.11,.43,z+.025),.04)
  for j in range(5):
   a=j*math.tau/5;ball('flower_petal',(x+.057*math.cos(a),h+.014,z+.057*math.sin(a)),(.046,.023,.040),seg=10,rings=6)
  ball('flower_centre',(x,h+.028,z),(.027,.020,.027),'accent',10,6)

def cactus():
 rod('main_column',(0,.10,0),(0,1.06,0),.10,vertices=20,bev=.015);ball('rounded_top',(0,1.06,0),(.10,.10,.10),seg=16,rings=8)
 for s,h,z in [(-1,.83,.02),(1,.67,-.01)]:
  path('cactus_arm',[(s*.06,.45,z),(s*.21,.45,z),(s*.30,.54,z),(s*.30,h,z)],.075,'prop',10)
  ball('arm_tip',(s*.30,h,z),(.075,.075,.075),seg=12,rings=6)
 for i in range(8):
  a=i*math.tau/8;rod('column_rib',(.101*math.cos(a),.16,.101*math.sin(a)),(.101*math.cos(a),1.04,.101*math.sin(a)),.005,'accent',vertices=6,bev=0)
 lathe('plant_pot',[(0,0),(.17,0),(.21,.25),(.225,.25),(.225,.29),(.19,.29),(.16,.04),(0,.04)],N=20)
 disk('soil',(0,.25,0),.18,.015,'accent',N=20)

def canopy(n,c,r,h,segments=12,mat='prop'):
 # Slight scallop at each rib; continuous shell with small non-zero apex.
 vs=[]
 for rad,yy in [(r,.0),(r*.63,h*.62),(.035,h)]:
  for i in range(segments*2):
   a=math.tau*i/(segments*2);rr=rad*(.96 if i%2 and rad==r else 1);vs.append((c[0]+rr*math.cos(a),c[1]+yy-(.055 if i%2 and rad==r else 0),c[2]+rr*math.sin(a)))
 N=segments*2;fs=[]
 for k in range(2):
  for i in range(N):fs.append((k*N+i,k*N+(i+1)%N,(k+1)*N+(i+1)%N,(k+1)*N+i))
 fs.append(tuple(range(2*N,3*N)));o=mesh(n,vs,fs,mat)
 return o

def beach_umbrella():
 rod('pole',(0,0,0),(0,2.12,0),.023,'accent',vertices=16)
 canopy('scalloped_canopy',(0,1.68,0),1.02,.43,12)
 for i in range(12):
  a=math.tau*i/12;path('canopy_rib',[(0,2.10,0),(.65*math.cos(a),1.94,.65*math.sin(a)),(1.02*math.cos(a),1.68,1.02*math.sin(a))],.006,'accent',6)
 ball('finial',(0,2.14,0),(.035,.045,.035),seg=12,rings=6)

def sun_lounger():
 for x in [-.34,.34]:
  path('frame',[(x,.35,.86),(x,.35,-.28),(x,.89,-.88)],.025,'accent')
  for z in [-.20,.65]:path('leg',[(x,.35,z),(x,.025,z+.12)],.023,'accent')
 slats('seat_slat',2,9,(0,.36,.29),(.66,.035,.105),.012)
 for i in range(6):
  z=-.34-i*.093;y=.40+i*.083
  box('back_slat',(0,y,z),(.66,.037,.11),.008,rot=(math.radians(-42),0,0),segments=1)
 box('head_cushion',(0,.86,-.83),(.50,.10,.20),.035)

def beach_ball():
 r=.15;ball('inflated_ball',(0,r,0),(r,r,r),seg=24,rings=12)
 for i in range(6):
  a=math.tau*i/6;pts=[(r*math.sin(j*math.pi/24)*math.cos(a),r+r*math.cos(j*math.pi/24),r*math.sin(j*math.pi/24)*math.sin(a)) for j in range(1,24)]
  path('panel_seam',pts,.0017,'accent',6)
 disk('air_valve',(0,.301,0),.013,.005,'accent',N=12)

def picnic_table():
 slats('tabletop',0,5,(0,.755,0),(.17,.05,1.83),.008)
 for x in [-.65,.65]:slats('bench',0,2,(x,.425,0),(.17,.05,1.83),.009)
 for z in [-.62,.62]:
  for s in [-1,1]:rod('splayed_leg',(s*.27,.72,z),(s*.49,.03,z),.045,vertices=4,bev=.01)
  box('bench_support',(0,.35,z),(1.62,.075,.09),.014,'accent')
 rod('centre_brace',(0,.24,-.62),(0,.24,.62),.035,vertices=4,bev=.008)

def picnic_basket():
 side_extrude('woven_basket',[(-.18,.04),(-.21,.27),(.21,.27),(.18,.04)],.43,'prop',.025)
 box('lid',(0,.29,0),(.46,.04,.45),.018,'accent')
 for x in [-.17,-.085,0,.085,.17]:box('woven_vertical',(x,.15,.213),(.017,.21,.008),.004,'accent',segments=1)
 for y in [.09,.15,.21]:box('woven_horizontal',(0,y,.217),(.40,.011,.008),.004,segments=1)
 path('arched_handle',[(-.17,.27,0),(-.17,.41,0),(-.10,.47,0),(.10,.47,0),(.17,.41,0),(.17,.27,0)],.018,'prop',8)
 box('clasp',(0,.275,.23),(.045,.06,.016),.005)

def cooler_box():
 box('insulated_body',(0,.23,0),(.61,.42,.38),.035)
 box('lid',(0,.46,0),(.64,.09,.41),.03,'accent')
 for x in [-.33,.33]:path('side_handle',[(x,.32,-.08),(x*1.13,.34,-.08),(x*1.13,.34,.08),(x,.32,.08)],.013,'accent',8)
 for x in [-.19,.19]:box('latch',(x,.39,.203),(.055,.10,.025),.009,'accent')
 for x in [-.24,.24]:box('base_foot',(x,.025,0),(.09,.05,.27),.014,'accent')

def lantern():
 lathe('base',[(0,0),(.092,0),(.105,.025),(.105,.055),(.078,.075),(0,.075)],N=20)
 lathe('glass',[(0,.065),(.073,.065),(.078,.11),(.078,.23),(.062,.255),(0,.255)],mat='accent',N=20)
 lathe('hood',[(0,.25),(.10,.25),(.105,.275),(.065,.30),(.045,.33),(0,.33)],N=20)
 for x in [-.084,.084]:rod('guard',(x,.06,0),(x,.265,0),.008,vertices=8)
 path('carry_handle',[(-.07,.29,0),(-.10,.37,0),(-.07,.41,0),(.07,.41,0),(.10,.37,0),(.07,.29,0)],.008,'accent',8)
 rod('control_knob',(0,.039,.09),(0,.039,.112),.018,'accent',vertices=12)

def backpack():
 box('main_bag',(0,.225,0),(.32,.43,.19),.075)
 box('front_pocket',(0,.15,.115),(.25,.22,.08),.04,'accent')
 path('zipper',[(-.12,.25,.148),(-.09,.28,.148),(.09,.28,.148),(.12,.25,.148)],.004)
 box('zipper_pull',(.10,.245,.16),(.012,.035,.007),.004)
 path('top_handle',[(-.055,.42,0),(-.055,.47,0),(.055,.47,0),(.055,.42,0)],.011,'accent',8)
 for x in [-.095,.095]:
  path('shoulder_strap',[(x,.40,-.075),(x,.37,-.16),(x,.12,-.18),(x,.055,-.07)],.019,'accent',8)
  box('strap_buckle',(x,.15,-.181),(.047,.045,.017),.007)

def fishing_rod():
 path('tapered_rod',[(0,.03,0),(0,.55,0),(.025,1.18,0),(.075,1.70,0),(.16,2.10,0)],.006,'prop',8)
 rod('rubber_grip',(0,.04,0),(0,.37,0),.018,'accent',vertices=12)
 rod('reel_mount',(0,.27,0),(.06,.27,0),.012,'accent',vertices=8)
 rod('spool',(.048,.27,-.025),(.048,.27,.025),.049,vertices=16)
 rod('reel_handle',(.048,.27,.035),(.09,.22,.035),.007,'accent',vertices=8)
 for x,y in [(0,.62),(.025,1.18),(.075,1.70),(.16,2.1)]:ring('line_guide',(x+.012,y,0),.012,.002,'accent',axis='y',N=12)
 path('fishing_line',[(.06,.27,0),(.012,.62,0),(.037,1.18,0),(.087,1.70,0),(.172,2.1,0),(.21,.98,0)],.001,'accent',4)

def kayak():
 # Nested top and bottom cross-sections form a hollow, pointed kayak shell.
 sections=[(-1.65,.018,.12),(-1.33,.20,.22),(-.70,.32,.25),(0,.35,.25),(.70,.30,.26),(1.33,.17,.28),(1.65,.015,.30)]
 vs=[]
 for z,w,y in sections:
  vs.extend([(-w,y,z),(0,.055+abs(z)*.015,z),(w,y,z),(-w*.80,y+.012,z),(0,.13+abs(z)*.02,z),(w*.80,y+.012,z)])
 fs=[]
 for i in range(len(sections)-1):
  a=i*6;b=a+6;fs.extend([(a,b,b+1,a+1),(a+1,b+1,b+2,a+2),(a+3,a+4,b+4,b+3),(a+4,a+5,b+5,b+4),(a,a+3,b+3,b),(a+2,b+2,b+5,a+5)])
 fs.extend([(0,1,2,5,4,3),(36,39,40,41,38,37)]);mesh('hollow_hull',vs,fs,bevel=.012)
 # Fore and aft decks frame a genuine cockpit opening.
 for z0,z1 in [(-1.65,-.47),(.47,1.65)]:
  ss=[(z,w,y) for z,w,y in sections if z0<=z<=z1]
  if z0<0:ss.append((-.47,.33,.255))
  else:ss.insert(0,(.47,.33,.255))
  verts=[]
  for z,w,y in ss:verts.extend([(-w,y,z),(0,y+.06,z),(w,y,z)])
  faces=[]
  for i in range(len(ss)-1):a=i*3;b=a+3;faces.extend([(a,a+1,b+1,b),(a+1,a+2,b+2,b+1)])
  mesh('deck',verts,faces)
 cockpit=[(.27*math.cos(i*math.tau/24),.27,.46*math.sin(i*math.tau/24)) for i in range(24)]
 path('cockpit_coaming',cockpit,.016,'accent',8,True)
 box('seat',(0,.16,0),(.39,.035,.33),.035,'accent');box('seat_back',(0,.27,-.25),(.38,.22,.04),.035,'accent')
 rod('paddle_shaft',(-.65,.37,-.35),(.65,.37,.35),.014,'accent')
 for s in [-1,1]:ball('paddle_blade',(s*.72,.37,s*.39),(.25,.025,.105),seg=16,rings=8)

def wheelbarrow():
 # Tapered basin with visible inner floor, rim and four enclosing walls.
 rings=[(.23,.28,.36),(.36,.53,.73),(.33,.50,.72),(.20,.26,.40)]
 vs=[]
 for w,d,y in rings:vs.extend([(-w,y,-d),(w,y,-d),(w,y,d),(-w,y,d)])
 fs=[]
 for k in range(3):
  for i in range(4):fs.append((4*k+i,4*k+(i+1)%4,4*(k+1)+(i+1)%4,4*(k+1)+i))
 fs.extend([(0,3,2,1),(12,13,14,15)]);mesh('open_basin',vs,fs,bevel=.025)
 wheel('front_wheel',0,.18,.62,.18,.11)
 for x in [-.26,.26]:
  path('frame_handle',[(x,.20,.62),(x,.35,-.35),(x,.63,-.94)],.022,'accent')
  rod('handle_grip',(x,.58,-.82),(x,.65,-.99),.029)
  path('rear_leg',[(x,.39,-.29),(x,.025,-.43),(x,.02,-.18),(x,.37,.02)],.02,'accent')

def watering_can():
 lathe('can_body',[(0,0),(.12,0),(.145,.035),(.145,.26),(.12,.31),(.065,.31),(.065,.285),(.115,.275),(.12,.035),(0,.035)],N=20)
 path('carry_handle',[(-.115,.25,0),(-.10,.39,0),(0,.43,0),(.10,.39,0),(.115,.25,0)],.018,'accent',8)
 path('rear_handle',[(0,.25,-.11),(0,.27,-.22),(0,.09,-.23),(0,.08,-.12)],.015,'prop',8)
 rod('spout',(0,.07,.11),(0,.29,.38),.031,r2=.017,vertices=16)
 rod('sprinkler_rose',(0,.29,.38),(0,.33,.43),.063,'accent',r2=.073,vertices=16)
 for x in [-.025,0,.025]:rod('sprinkler_hole',(x,.341,.435),(x,.345,.44),.004,vertices=6,bev=0)

# Fantasy stage pieces, keeping the same matte two-material vocabulary.
def treasure_chest():
 box('chest_body',(0,.26,0),(.76,.48,.46),.025)
 # Semicircular lid is a genuinely barrel-vaulted volume.
 outline=[(-.24,0),(.24,0)]+[(.24*math.cos(i*math.pi/12),.22*math.sin(i*math.pi/12)) for i in range(1,13)]
 o=side_extrude('arched_lid',outline,.78,'prop',.012);o.location.z+=.49 # Blender Z is application Y.
 for f in o.data.polygons:
  if abs(f.normal.x)>.99:f.use_smooth=False
 for x in [-.28,.28]:
  box('front_iron_band',(x,.265,.243),(.065,.45,.018),.006,'accent')
  box('rear_iron_band',(x,.265,-.243),(.065,.45,.018),.006,'accent')
  pts=[(x,.49+.225*math.sin(i*math.pi/12),.245*math.cos(i*math.pi/12)) for i in range(13)]
  path('arched_iron_band',pts,.018,'accent',6)
 for y in [.12,.25,.38]:box('plank_seam',(0,y,.246),(.68,.006,.005),.001,'accent',segments=1)
 box('lock_plate',(0,.46,.258),(.09,.15,.025),.014,'accent');rod('keyhole',(0,.47,.273),(0,.47,.279),.014,vertices=10,bev=0)
 for x in [-.39,.39]:path('side_handle',[(x,.30,-.08),(x*1.07,.24,-.08),(x*1.07,.24,.08),(x,.30,.08)],.012,'accent',8)

def shield():
 rod('shield_disc',(0,.32,-.02),(0,.32,.025),.32,'prop',vertices=32,bev=.008)
 ring('raised_rim',(0,.32,.031),.301,.015,'accent',axis='z',N=32)
 ball('central_boss',(0,.32,.035),(.10,.10,.055),'accent',20,10)
 for i in range(8):
  a=i*math.tau/8;ball('rim_rivet',(.27*math.cos(a),.32+.27*math.sin(a),.047),(.009,.009,.006),seg=8,rings=4)
 path('back_grip',[(-.06,.32,-.04),(-.055,.32,-.09),(.055,.32,-.09),(.06,.32,-.04)],.014,'accent',8)

def throne():
 for x in [-.30,.30]:
  for z in [-.25,.25]:box('leg',(x,.25,z),(.10,.50,.10),.022)
 box('seat_frame',(0,.48,0),(.76,.10,.68),.022)
 box('seat_cushion',(0,.54,.03),(.61,.07,.51),.03,'accent')
 profile_extrude('high_back',[(-.38,0),(.38,0),(.38,.81),(.26,1.09),(0,1.28),(-.26,1.09),(-.38,.81)],.11,(0,.49,-.30),'prop',.02)
 profile_extrude('back_inset',[(-.27,0),(.27,0),(.27,.75),(.18,.95),(0,1.08),(-.18,.95),(-.27,.75)],.022,(0,.60,-.229),'accent',.014)
 for x in [-.36,.36]:
  box('arm_post',(x,.68,.23),(.095,.33,.095),.018)
  box('armrest',(x,.86,.0),(.13,.08,.64),.026)
  ball('arm_finial',(x,.92,.27),(.075,.07,.075),seg=16,rings=8)
  rod('back_edge_post',(x,.48,-.30),(x,1.49,-.30),.045,vertices=12)
  poly_prism('spire',(x,1.49,-.30),.075,.28,6,point=True)
 poly_prism('crown_gem',(0,1.69,-.22),.075,.17,6,'accent',True)

def crystal_cluster():
 for x,z,r,h in [(-.18,0,.11,.43),(.02,-.04,.14,.65),(.17,.06,.09,.36),(-.02,.15,.09,.28),(.13,-.14,.075,.47)]:
  poly_prism('crystal',(x,0,z),r,h,6,'prop' if h>.4 else 'accent',True)

def magic_staff():
 path('wooden_staff',[(0,0,0),(-.015,.50,0),(.015,1.0,0),(0,1.50,0)],.020,'prop',10)
 for y in [.67,.72,.77,.82,.87]:ring('grip_wrap',(0,y,0),.024,.003,'accent',N=16)
 for s in [-1,1]:path('crown_prong',[(0,1.42,0),(s*.09,1.51,0),(s*.095,1.67,0),(s*.045,1.76,0)],.015,'accent',8)
 poly_prism('staff_crystal',(0,1.52,0),.055,.22,6,'prop',True)
 disk('heel_cap',(0,.03,0),.024,.06,'accent',N=12)

def torch():
 rod('wood_handle',(0,0,0),(0,.48,0),.024,r2=.035,vertices=12)
 lathe('torch_cage',[(.027,.43),(.060,.50),(.066,.61),(.05,.63),(.045,.60),(.040,.51)],mat='accent',N=16)
 for y in [.47,.54,.60]:ring('cage_band',(0,y,0),.043+(y-.47)*.16,.008,'accent',N=16)
 # Asymmetric solid flame with lobes and a forward leaning tip.
 profile_extrude('flame',[(-.05,0),(-.075,.10),(-.045,.18),(-.018,.14),(.008,.31),(.037,.26),(.025,.17),(.065,.20),(.073,.10),(.045,0)],.08,(0,.57,0),'prop',.016)
 profile_extrude('inner_flame',[(-.022,0),(-.035,.07),(0,.17),(.03,.07),(.02,0)],.012,(0,.59,.045),'accent',.005)

def potion_bottle():
 lathe('round_bottle',interpolate_sections([(0,0),(.06,0),(.09,.035),(.10,.10),(.083,.16),(.037,.19),(.028,.24),(.034,.245),(.034,.265),(.021,.265),(.021,.23),(.029,.19),(.067,.15),(.08,.10),(.07,.05),(0,.05)],2),N=24)
 lathe('potion_band',[(.095,.075),(.101,.075),(.100,.125),(.089,.15),(.084,.145),(.094,.12)],mat='accent',N=24)
 rod('cork',(0,.24,0),(0,.289,0),.023,'accent',r2=.026,vertices=12)
 ring('neck_ring',(0,.239,0),.03,.006,N=20)

def spellbook():
 box('lower_cover',(0,.012,0),(.25,.024,.32),.009,'accent')
 box('pages',(0,.044,.004),(.222,.043,.285),.007)
 box('upper_cover',(0,.079,0),(.25,.024,.32),.009,'accent')
 box('spine',(-.115,.045,0),(.025,.065,.31),.009,'accent')
 for z in [-.12,.12]:box('spine_binding',(-.13,.045,z),(.014,.069,.025),.004)
 for x in [-.095,.095]:
  for z in [-.13,.13]:box('cover_corner',(x,.096,z),(.045,.011,.04),.004)
 ring('embossed_sigil',(0,.097,0),.055,.004,'prop',N=20)
 poly_prism('cover_gem',(0,.095,0),.025,.025,6,'prop',True)
 box('clasp',(.129,.052,0),(.025,.055,.035),.005)

def signpost():
 box('rough_post',(0,1.05,0),(.09,2.1,.095),.012)
 for y,s,w in [(1.72,1,.91),(1.39,-1,.76),(1.05,1,.81)]:
  outline=[(-w/2,-.10),(w*.32,-.10),(w/2,0),(w*.32,.10),(-w/2,.10)]
  profile_extrude('direction_board',[(x*s,yy) for x,yy in outline],.045,(s*.10,y,.065),'prop',.008)
  for x in [-.09,.09]:rod('board_pin',(x,y,.09),(x,y,.105),.009,'accent',vertices=8,bev=0)
 poly_prism('post_cap',(0,2.1,0),.073,.16,4,point=True)

def stone_well():
 # Individual voussoir blocks form an open annulus.
 N=12
 for row in range(3):
  for i in range(N):
   a0=(i+row*.5)*math.tau/N+.018;a1=a0+math.tau/N-.036
   vs=[(r*math.cos(a),y,r*math.sin(a)) for y in [row*.19+.02,row*.19+.19] for r,a in [(.49,a0),(.66,a0),(.66,a1),(.49,a1)]]
   mesh('stone_block',vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],bevel=.012)
 for x in [-.59,.59]:box('roof_post',(x,1.05,0),(.095,1.13,.105),.018)
 side_extrude('pitched_roof',[(-.62,1.65),(0,1.98),(.62,1.65),(.62,1.59),(0,1.92),(-.62,1.59)],1.56,'prop',.015)
 rod('windlass',(-.72,1.22,0),(.72,1.22,0),.055,'accent',vertices=16)
 path('crank',[(.72,1.22,0),(.79,1.22,0),(.79,1.06,0),(.90,1.06,0)],.018,'accent',8)
 rod('rope',(0,.35,0),(0,1.23,0),.009,'accent',vertices=8)
 lathe('bucket',[(.10,.25),(.14,.47),(.125,.47),(.088,.27)],N=16)
 path('bucket_handle',[(-.12,.45,0),(-.11,.57,0),(0,.61,0),(.11,.57,0),(.12,.45,0)],.008,'accent',6)

def wooden_cart():
 for x in [-.57,.57]:wheel('cart_wheel',x,.39,0,.39,.07,True)
 rod('axle',(-.64,.39,0),(.64,.39,0),.035,'accent',vertices=12)
 slats('cart_floor',0,6,(0,.48,0),(.14,.055,1.18),.008)
 for x in [-.47,.47]:
  for z in [-.56,.56]:box('corner_post',(x,.76,z),(.055,.65,.055),.01)
  for y in [.61,.80,.99]:box('side_board',(x,y,0),(.045,.145,1.18),.009)
  path('pull_shaft',[(x,.46,.44),(x,.55,1.45)],.028)
 for z in [-.58,.58]:
  for y in [.61,.80,.99]:box('end_board',(0,y,z),(.95,.145,.045),.009)
 rod('pull_bar',(-.48,.55,1.45),(.48,.55,1.45),.025,'accent')

def anvil():
 # Distinct stepped heel, face and tapered horn.
 profile_extrude('anvil_body',[(-.22,0),(.20,0),(.15,.09),(.10,.13),(.10,.29),(.24,.34),(.24,.44),(-.25,.44),(-.25,.34),(-.11,.29),(-.11,.13),(-.17,.09)],.24,(0,0,0),'prop',.012)
 box('forging_face',(-.01,.455,0),(.54,.045,.27),.009,'accent')
 rod('horn',(.22,.382,0),(.56,.405,0),.102,'prop',r2=.008,vertices=16,bev=.003)
 box('hardy_hole',(-.19,.48,0),(.043,.008,.043),.002,'accent')

def tombstone():
 outline=[(-.24,0),(.24,0),(.24,.55)]+[(.24*math.cos(i*math.pi/12),.55+.20*math.sin(i*math.pi/12)) for i in range(1,13)]
 profile_extrude('arched_stone',outline,.13,(0,.055,0),'prop',.018)
 box('base_plinth',(0,.035,0),(.59,.07,.29),.015)
 box('inset_plaque',(0,.36,.075),(.34,.30,.018),.02,'accent')
 box('cross_vertical',(0,.62,.083),(.022,.14,.008),.004)
 box('cross_horizontal',(0,.65,.083),(.09,.022,.008),.004)

def gas_lamp():
 lathe('lamp_post',[(0,0),(.14,0),(.14,.08),(.08,.13),(.055,.32),(.045,2.02),(.08,2.05),(0,2.05)],N=16)
 for y in [.27,1.82,2.02]:disk('post_collar',(0,y,0),.074,.045,'accent',N=16)
 # Tapered glazed lantern on four slender corner bars.
 vs=[(x*r,y,z*r) for r,y in [(.14,2.05),(.22,2.53)] for x,z in [(-1,-1),(1,-1),(1,1),(-1,1)]]
 mesh('opaque_clay_glazing',vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],'accent',.008)
 for x in [-1,1]:
  for z in [-1,1]:rod('lantern_corner',(x*.14,2.05,z*.14),(x*.22,2.53,z*.22),.015)
 box('lantern_base',(0,2.05,0),(.34,.045,.34),.014)
 poly_prism('pyramidal_roof',(0,2.53,0),.35,.24,4,'prop',True)
 ball('roof_finial',(0,2.81,0),(.035,.055,.035),seg=12,rings=6)

# Animals use authored elliptical cages rather than stacks of primitive balls.
# Each section (z, centre_y, half_width_x, half_height_y) shares one smooth surface.
def interpolate_sections(sections,steps=4):
 out=[]
 for k in range(len(sections)-1):
  p0=sections[max(0,k-1)];p1=sections[k];p2=sections[k+1];p3=sections[min(len(sections)-1,k+2)]
  for j in range(steps):
   t=j/steps;t2=t*t;t3=t2*t
   out.append(tuple(.5*((2*p1[d])+(-p0[d]+p2[d])*t+(2*p0[d]-5*p1[d]+4*p2[d]-p3[d])*t2+(-p0[d]+3*p1[d]-3*p2[d]+p3[d])*t3) for d in range(len(p1))))
 out.append(sections[-1]);return out

def creature_tail(n,pts,r,mat='prop',sides=10):
 pts=[Vector(p) for p in interpolate_sections(pts,4)];normal=None
 for k in range(len(pts)-2):
  q=(pts[k+1]-pts[k]).cross(pts[k+2]-pts[k+1])
  if q.length>1e-8:normal=q.normalized();break
 if normal is None:normal=Vector((1,0,0))
 vs=[];fs=[];N=len(pts)
 for i,p in enumerate(pts):
  t=(pts[min(i+1,N-1)]-pts[max(i-1,0)]).normalized();u=t.cross(normal).normalized();v=t.cross(u);rr=r*(1-.8*(i/(N-1))**2)
  for j in range(sides):vs.append(p+rr*(u*math.cos(j*math.tau/sides)+v*math.sin(j*math.tau/sides)))
 for i in range(N-1):
  for j in range(sides):fs.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
 fs.extend([tuple(reversed(range(sides))),tuple((N-1)*sides+j for j in range(sides))])
 return mesh(n,vs,fs,mat)

def torso(n,sections,mat='prop',N=16):
 sections=interpolate_sections(sections,4);N=max(20,N)
 vs=[]
 for z,y,rx,ry in sections:
  for i in range(N):
   a=math.tau*i/N;vs.append((rx*math.cos(a),y+ry*math.sin(a),z))
 fs=[tuple(reversed(range(N))),tuple((len(sections)-1)*N+i for i in range(N))]
 for k in range(len(sections)-1):
  for i in range(N):fs.append((k*N+i,k*N+(i+1)%N,(k+1)*N+(i+1)%N,(k+1)*N+i))
 return mesh(n,vs,fs,mat)
def limb(n,sections,mat='prop',N=12):
 sections=interpolate_sections(sections,4);N=max(16,N)
 # each section is (x,y,z,rx,rz), supporting a bend at a shoulder/knee/hock.
 vs=[]
 for x,y,z,rx,rz in sections:
  for i in range(N):
   a=math.tau*i/N;vs.append((x+rx*math.cos(a),y,z+rz*math.sin(a)))
 fs=[tuple(reversed(range(N))),tuple((len(sections)-1)*N+i for i in range(N))]
 for k in range(len(sections)-1):
  for i in range(N):fs.append((k*N+i,k*N+(i+1)%N,(k+1)*N+(i+1)%N,(k+1)*N+i))
 return mesh(n,vs,fs,mat)
def ear(n,p,wx,h,d,mat='prop'):
 x,y,z=p
 return mesh(n,[(x-wx,y,z),(x+wx,y,z),(x+wx*.20,y+h,z-d*.20),(x,y+h*.40,z+d),(x,y+h*.32,z-d*.3)],[(0,1,3),(1,2,3),(2,0,3),(1,0,4),(2,1,4),(0,2,4)],mat,bevel=.007)
def canine_head(y=.83,z=.34):
 o=torso('sculpted_head',[(-.10,y,.055,.08),(-.055,y+.02,.09,.115),(.04,y+.015,.098,.105),(.105,y-.005,.070,.072),(.16,y-.023,.053,.045)],N=16);o.location.y-=z
 o=torso('muzzle',[(-.005,y-.045,.07,.045),(.10,y-.055,.065,.045),(.18,y-.060,.050,.031)],N=12);o.location.y-=z
 ball('nose',(0,y-.045,z+.182),(.044,.029,.025),'accent',16,8)
 for s in [-1,1]:
  ball('eye',(s*.078,y+.04,z+.092),(.013,.014,.009),'accent',12,6)
  # Folded ear: flared at the skull, hanging to a rounded point.
  profile_extrude('folded_ear',[(s*.065,y+.09),(s*.145,y+.045),(s*.143,y-.06),(s*.112,y-.10),(s*.086,y-.03)],.065,(0,0,z-.025),'prop',.018)

def dog():
 torso('ribcage',[(-.39,.53,.06,.11),(-.28,.55,.14,.17),(-.08,.57,.15,.19),(.17,.59,.14,.20),(.30,.60,.09,.15),(.36,.63,.025,.06)],N=20)
 limb('neck',[(0,.62,.21,.085,.08),(0,.69,.27,.105,.11),(0,.81,.32,.075,.08)],N=16)
 for s in [-1,1]:
  limb('front_leg',[(s*.075,.66,.22,.035,.045),(s*.105,.61,.22,.060,.075),(s*.113,.43,.25,.045,.045),(s*.115,.24,.24,.028,.031),(s*.115,.065,.25,.024,.029)],N=12)
  box('front_paw',(s*.115,.038,.285),(.085,.076,.14),.035)
  limb('rear_leg',[(s*.07,.63,-.27,.04,.05),(s*.11,.59,-.27,.085,.10),(s*.13,.41,-.20,.065,.075),(s*.13,.23,-.32,.031,.035),(s*.13,.07,-.29,.022,.026)],N=12)
  box('rear_paw',(s*.13,.036,-.255),(.08,.072,.135),.03)
 canine_head()
 creature_tail('tail',[(-.015,.59,-.34),(-.025,.66,-.50),(-.04,.78,-.65),(-.035,.87,-.70)],.041,'prop',10)
 # Collar is a restrained dimensional cue; no painted markings.
 ring('collar',(0,.73,.29),.086,.012,'accent',N=20)

def dog_sitting():
 torso('seated_ribcage',[(-.22,.30,.055,.14),(-.12,.33,.17,.27),(.07,.40,.15,.29),(.20,.49,.09,.20),(.27,.51,.025,.07)],N=20)
 limb('upright_chest',[(0,.21,.10,.12,.10),(0,.48,.10,.14,.14),(0,.70,.16,.10,.11),(0,.80,.22,.075,.08)],N=16)
 for s in [-1,1]:
  ball('haunch',(s*.13,.21,-.10),(.13,.19,.14),seg=16,rings=8)
  box('rear_paw',(s*.19,.042,.02),(.11,.084,.20),.04)
  limb('foreleg',[(s*.065,.65,.16,.025,.035),(s*.10,.58,.18,.055,.065),(s*.105,.37,.22,.036,.042),(s*.11,.065,.26,.026,.03)],N=12)
  box('front_paw',(s*.11,.035,.30),(.086,.07,.14),.03)
 canine_head(.82,.24)
 creature_tail('resting_tail',[(0,.22,-.22),(-.20,.13,-.30),(-.31,.065,-.16),(-.29,.045,.04)],.044,'prop',10)

def cat():
 limb('seated_body',[(0,.06,0,.105,.12),(0,.16,-.025,.14,.14),(0,.31,-.015,.115,.115),(0,.43,.015,.08,.075)],N=20)
 for s in [-1,1]:
  ball('rounded_haunch',(s*.09,.13,-.025),(.08,.12,.10),seg=16,rings=8)
  limb('foreleg',[(s*.04,.38,.04,.022,.024),(s*.054,.32,.055,.031,.036),(s*.05,.17,.075,.023,.026),(s*.05,.035,.09,.022,.025)],N=12)
  box('front_paw',(s*.05,.025,.12),(.061,.05,.09),.024)
  box('hind_paw',(s*.115,.027,.025),(.07,.054,.12),.026)
 ball('head',(0,.48,.04),(.105,.092,.086),seg=20,rings=12)
 for s in [-1,1]:
  ear('pointed_ear',(s*.071,.537,.025),.039,.102,.025)
  ear('inner_ear',(s*.071,.545,.049),.024,.073,.006,'accent')
  ball('muzzle_pad',(s*.022,.454,.114),(.032,.025,.021),seg=12,rings=6)
  ball('eye',(s*.052,.494,.113),(.016,.012,.005),'accent',12,6)
 ball('nose',(0,.468,.137),(.011,.007,.005),'accent',12,6)
 creature_tail('curled_tail',[(0,.16,-.12),(.14,.10,-.18),(.23,.05,-.11),(.23,.035,.05),(.15,.035,.14)],.029,'prop',10)

def horse():
 torso('barrel',[(-.84,1.17,.08,.13),(-.67,1.20,.25,.29),(-.28,1.22,.27,.31),(.18,1.25,.255,.31),(.44,1.28,.17,.24),(.53,1.29,.035,.08)],N=24)
 # Neck narrows while leaning forward from chest to poll.
 limb('arched_neck',[(0,1.20,.27,.13,.12),(0,1.43,.47,.16,.18),(0,1.69,.58,.11,.15),(0,1.87,.60,.085,.11)],N=20)
 for s in [-1,1]:
  limb('foreleg',[(s*.105,1.39,.32,.045,.055),(s*.17,1.29,.34,.085,.105),(s*.18,.91,.35,.059,.065),(s*.18,.63,.38,.048,.05),(s*.18,.20,.38,.030,.035),(s*.18,.07,.40,.041,.05)],N=12)
  box('front_hoof',(s*.18,.055,.43),(.115,.11,.15),.026,'accent')
  limb('hind_leg',[(s*.12,1.37,-.61,.055,.065),(s*.17,1.27,-.65,.125,.15),(s*.20,.93,-.53,.105,.12),(s*.20,.58,-.69,.044,.055),(s*.20,.20,-.63,.030,.036),(s*.20,.07,-.60,.039,.05)],N=12)
  box('hind_hoof',(s*.20,.055,-.57),(.112,.11,.15),.026,'accent')
 o=torso('long_head',[(-.06,1.91,.065,.09),(.035,1.91,.105,.12),(.18,1.81,.09,.10),(.31,1.73,.071,.075),(.34,1.71,.058,.055)],N=20);o.location.y-=.60
 for s in [-1,1]:
  ear('horse_ear',(s*.066,1.985,.58),.035,.18,.034)
  ball('eye',(s*.093,1.90,.72),(.016,.018,.009),'accent',12,6)
  ball('nostril',(s*.058,1.735,.915),(.013,.019,.008),'accent',12,6)
 # Mane follows crest, and the tapered tail hangs from the dock.
 profile_extrude('mane',[(-.055,1.25),(.055,1.25),(.055,1.99),(-.04,2.005),(-.085,1.85),(-.095,1.56)],.055,(0,0,.45),'accent',.012)
 creature_tail('tail',[(0,1.30,-.80),(.015,1.16,-.97),(.025,.88,-1.02),(.04,.58,-1.05)],.075,'accent',12)
 creature_tail('tail_tip',[(.04,.63,-1.05),(.06,.42,-1.07),(.09,.31,-1.10)],.048,'accent',10)

def pigeon():
 torso('bird_body',[(-.16,.13,.015,.025),(-.10,.15,.06,.068),(-.025,.17,.075,.085),(.045,.18,.06,.085),(.085,.21,.033,.05),(.105,.22,.012,.02)],N=20)
 limb('neck',[(0,.21,.04,.028,.025),(0,.25,.072,.029,.031),(0,.295,.08,.028,.029)],N=16)
 ball('head',(0,.30,.088),(.041,.045,.044),seg=20,rings=10)
 for s in [-1,1]:
  # Folded wing cage lies smoothly over each flank with a pointed rear end.
  verts=[(s*.066,.205,.02),(s*.082,.165,-.025),(s*.056,.11,-.11),(s*.035,.125,-.155),(s*.055,.20,-.07),(s*.085,.177,-.04)]
  mesh('folded_wing',verts,[(0,1,5),(1,2,5),(2,3,5),(3,4,5),(4,0,5),(0,4,3,2,1)],'accent')
  ball('eye',(s*.034,.311,.11),(.006,.006,.004),'accent',10,6)
  rod('leg',(s*.026,.12,-.003),(s*.026,.025,.012),.007,'accent',vertices=8,bev=0)
  for d in [-1,0,1]:path('toe',[(s*.026,.025,.012),(s*.026+d*.014,.012,.055)],.003,'accent',6)
  path('rear_toe',[(s*.026,.025,.012),(s*.026,.012,-.025)],.003,'accent',6)
 mesh('beak',[(-.016,.298,.123),(.016,.298,.123),(0,.285,.162),(0,.307,.129),(0,.288,.127)],[(0,1,3),(0,3,2),(3,1,2),(1,4,2),(4,0,2),(0,4,1)],'accent')
 side_extrude('tail_fan',[(-.24,.105),(-.24,.118),(-.10,.15),(-.10,.135)],.085,'prop',.004)

# Additional P2 street and leisure collection.
for t,n in [('pickup-truck','Pickup truck'),('taxi','City taxi'),('tram','City tram')]:entry(t,n,'Vehicles','street,city,transport',t+',vehicle,transport',15000,priority='P2')
for t,n,th in [('newspaper-stand','Newspaper stand','street,retail'),('drinking-fountain','Drinking fountain','street,garden'),('crosswalk-sign','Pedestrian crossing sign','street,city'),('bus-shelter-ad','Advertising bus shelter','street,city,transport'),('electric-car-charger','Electric vehicle charger','street,transport,tech')]:entry(t,n,'Outdoor',th,t+',street,city',priority='P2')
for t,n,th,g in [('bowling-pin','Bowling pin','sports',None),('boxing-bag','Punching bag','sports,fitness',None),('bench-press','Bench press','sports,fitness',None),('keyboard-stand','Keyboard on stand','music',None),('violin','Violin and bow','music',(0,.40,0)),('saxophone','Alto saxophone','music',(0,.28,0))]:entry(t,n,'Objects',th,t+',leisure',2500 if t in ['bowling-pin','violin','saxophone'] else 6000,g,['stand','talk'] if g else None,priority='P2')
CATALOG['bus-shelter-ad']['seat']={'y':.47,'z':-.24,'x':[-.55,0,.55]}
CATALOG['bench-press']['seat']={'y':.47,'z':0,'x':[0]}

def pickup_truck():
 box('chassis',(0,.47,0),(1.66,.30,4.65),.06,'accent')
 side_extrude('front_cab',[(-.12,.55),(-.12,1.90),(.04,2.03),(1.12,2.03),(1.58,1.43),(2.30,1.35),(2.38,.58)],1.88,'prop',.07)
 box('bed_floor',(0,.78,-1.22),(1.79,.15,2.0),.025)
 for x in [-.88,.88]:box('bed_side',(x,1.04,-1.22),(.14,.57,2.04),.035)
 box('tailgate',(0,1.04,-2.22),(1.80,.57,.13),.03)
 box('bed_inner',(0,.87,-1.20),(1.61,.035,1.80),.02,'accent')
 for x in [-.94,.94]:
  for z in [-1.46,1.51]:wheel('truck_wheel',x,.39,z,.39,.21)
  box('side_window',(x*1.01,1.69,.55),(.025,.48,.93),.03,'accent')
  box('door_handle',(x*1.03,1.27,.20),(.045,.04,.17),.012,'accent')
 sloped_glass('front_glass',.80,1.96,1.18,1.48,1.55)
 for z in [2.39,-2.31]:box('bumper',(0,.57,z),(1.96,.18,.14),.035,'accent')
 box('grille',(0,1.00,2.37),(1.04,.34,.025),.015,'accent')
 for x in [-.68,.68]:box('headlamp',(x,1.12,2.36),(.30,.23,.04),.035,'accent');box('tail_lamp',(x,1.09,-2.30),(.18,.35,.025),.018,'accent')
 box('tailgate_handle',(0,1.22,-2.30),(.30,.05,.025),.012,'accent')

def taxi():
 box('floorpan',(0,.43,0),(1.65,.25,4.23),.06,'accent')
 side_extrude('sedan_body',[(-2.15,.45),(-2.1,.99),(-1.15,1.05),(-.61,1.62),(.74,1.62),(1.24,1.05),(2.08,.95),(2.18,.49)],1.83,'prop',.08)
 for x in [-.91,.91]:
  for z in [-1.37,1.40]:wheel('taxi_wheel',x,.34,z,.34,.18)
  box('rear_side_window',(x*1.018,1.34,-.34),(.026,.43,.61),.035,'accent')
  box('front_side_window',(x*1.018,1.34,.39),(.026,.43,.69),.035,'accent')
  for z in [-.48,.23]:box('door_handle',(x*1.03,1.04,z),(.035,.035,.15),.01,'accent')
  box('belt_trim',(x*1.017,.89,0),(.022,.035,3.86),.008,'accent')
 sloped_glass('windshield',.76,1.55,.80,1.11,1.19)
 sloped_glass('rear_glass',.75,1.55,-.68,1.11,-1.11)
 box('taxi_roof_sign',(0,1.74,.06),(.46,.17,.20),.03)
 box('roof_sign_inset',(0,1.75,.167),(.33,.08,.008),.01,'accent')
 for z in [2.15,-2.15]:box('bumper',(0,.52,z),(1.83,.16,.10),.03,'accent')
 for x in [-.64,.64]:box('headlight',(x,.83,2.14),(.39,.16,.035),.025,'accent');box('rear_light',(x,.83,-2.13),(.35,.15,.03),.02,'accent')
 box('front_grille',(0,.80,2.16),(.62,.16,.02),.012,'accent')

def tram():
 side_extrude('tram_body',[(-4.4,.45),(-4.4,2.70),(-4.12,2.95),(4.03,2.95),(4.43,2.50),(4.43,.48)],2.30,'prop',.10)
 for x in [-1.0,1.0]:
  for z in [-2.9,-2.2,2.2,2.9]:wheel('rail_wheel',x,.35,z,.35,.15)
  for z in [-3.5,-2.35,-1.20,-.05,1.10,2.25,3.40]:box('side_glass',(x*1.162,2.0,z),(.023,1.11,1.01),.05,'accent')
  box('lower_trim',(x*1.165,.91,0),(.026,.07,8.4),.012,'accent')
  for z in [-1.14,1.16]:
   box('sliding_door',(x*1.17,1.43,z),(.035,2.13,.84),.02,'accent')
   box('door_glass',(x*1.19,1.75,z),(.018,1.21,.66),.018)
 for z in [-4.42,4.45]:
  box('cab_glass',(0,2.07,z),(2.02,1.18,.035),.055,'accent')
  box('destination_board',(0,2.72,z),(1.50,.18,.035),.025,'accent')
  for x in [-.8,.8]:rod('headlamp',(x,.86,z),(x,.86,z+.025),.09,'accent',vertices=16)
 box('roof_unit',(0,3.02,0),(1.30,.16,3.50),.06)
 for x in [-.40,.40]:
  path('pantograph',[(x,3.10,-.62),(x,3.78,.12),(x,3.34,.68)],.026,'accent',8)
 rod('contact_bar',(-.75,3.79,.12),(.75,3.79,.12),.025,'accent')

def newspaper_stand():
 for x in [-.46,.46]:box('frame_post',(x,.67,0),(.055,1.34,.055),.01,'accent')
 for y in [.20,.52,.84]:
  box('shelf',(0,y,.14),(.98,.05,.51),.01)
  box('shelf_lip',(0,y+.09,.37),(.98,.15,.025),.007,'accent')
  for x in [-.31,0,.31]:box('newspaper_stack',(x,y+.08,.14),(.27,.11,.39),.007)
 box('header',(0,1.30,.05),(1.02,.26,.09),.022)
 box('header_inset',(0,1.30,.10),(.84,.12,.01),.008,'accent')
 for x in [-.42,.42]:box('foot',(x,.035,.10),(.12,.07,.65),.015,'accent')

def drinking_fountain():
 lathe('pedestal',[(0,0),(.21,0),(.21,.07),(.12,.11),(.12,.70),(.20,.76),(0,.76)],N=20)
 lathe('drinking_basin',[(.10,.74),(.25,.77),(.28,.84),(.28,.88),(.25,.88),(.22,.82),(.10,.79)],N=24)
 disk('drain',(0,.803,0),.027,.008,'accent',N=16)
 path('bubbler',[(.13,.83,-.09),(.13,.94,-.09),(.10,.96,-.07),(.08,.94,-.05)],.014,'accent',8)
 rod('button',(.20,.85,0),(.235,.85,0),.028,'accent',vertices=12)

def crosswalk_sign():
 post('sign_post',0,0,2.12,.028)
 profile_extrude('diamond',[(-.42,0),(0,.42),(.42,0),(0,-.42)],.035,(0,1.93,.025),'prop',.008)
 profile_extrude('inset_diamond',[(-.36,0),(0,.36),(.36,0),(0,-.36)],.009,(0,1.93,.05),'accent',.004)
 ball('pictogram_head',(0,2.10,.063),(.045,.045,.008),seg=12,rings=6)
 path('pictogram_body',[(0,2.05,.065),(-.02,1.91,.065),(-.12,1.77,.065)],.022,'prop',6)
 path('pictogram_leg',[(-.02,1.91,.065),(.10,1.78,.065)],.022,'prop',6)
 path('pictogram_arms',[(-.13,1.94,.065),(0,2.01,.065),(.13,1.94,.065)],.018,'prop',6)

def bus_shelter_ad():
 for x in [-1.25,1.25]:
  for z in [-.48,.44]:rod('corner_post',(x,.02,z),(x,2.16,z),.035)
 box('roof',(0,2.20,0),(2.78,.12,1.27),.045)
 box('rear_glass',(0,1.15,-.49),(2.48,1.95,.025),.012,'accent')
 box('ad_cabinet',(1.25,1.17,0),(.10,1.98,1.01),.028)
 box('ad_panel',(1.311,1.17,0),(.022,1.80,.83),.015,'accent')
 box('bench',(0,.435,-.24),(1.82,.07,.39),.02)
 box('bench_back',(0,.74,-.41),(1.82,.27,.04),.015)
 for x in [-.67,.67]:box('bench_leg',(x,.23,-.24),(.065,.46,.28),.015,'accent')
 for y in [.38,1.9]:box('rear_rail',(0,y,-.465),(2.46,.035,.035),.008)

def electric_car_charger():
 box('base',(0,.04,0),(.50,.08,.38),.02,'accent')
 box('charging_column',(0,.74,0),(.38,1.40,.28),.055)
 box('display',(0,1.17,.15),(.25,.27,.025),.025,'accent')
 box('card_reader',(0,.92,.15),(.09,.08,.017),.008,'accent')
 path('cable',interpolate_sections([(.17,1.20,0),(.34,1.03,0),(.38,.37,0),(.27,.25,.08),(.21,.38,.16),(.22,.83,.16)],4),.014,'accent',8)
 path('charging_plug',[(.22,.83,.16),(.25,.92,.16),(.21,1.0,.16)],.027,'prop',8)
 box('status_strip',(0,1.41,.15),(.19,.025,.014),.006,'accent')

def bowling_pin():
 lathe('pin',interpolate_sections([(0,0),(.045,0),(.061,.04),(.063,.10),(.055,.16),(.033,.22),(.025,.29),(.04,.33),(.043,.36),(.031,.39),(0,.40)],2),N=32)
 for y in [.265,.286]:lathe('neck_band',[(.026,y),(.029,y),(.029,y+.01),(.026,y+.01)],mat='accent',N=24)

def boxing_bag():
 lathe('weighted_base',[(0,0),(.34,0),(.35,.07),(.29,.16),(.10,.21),(0,.21)],mat='accent',N=24)
 rod('flexible_stem',(0,.16,0),(0,.46,0),.055,'accent')
 lathe('padded_bag',[(0,.36),(.16,.36),(.23,.43),(.23,1.45),(.19,1.52),(0,1.52)],N=24)
 for y in [.46,1.42]:ring('reinforcement_band',(0,y,0),.231,.008,'accent',N=24)
 path('seam',[(.229,.49,0),(.229,1.39,0)],.003,'accent',6)

def bench_press():
 for x in [-.49,.49]:
  box('rack_foot',(x,.035,-.48),(.18,.07,.86),.016,'accent')
  box('rack_upright',(x,.59,-.45),(.065,1.18,.065),.012)
  box('bar_hook',(x,1.04,-.38),(.09,.07,.13),.012,'accent')
 box('bench_cushion',(0,.44,.21),(.35,.08,1.25),.035,'accent')
 for z in [-.27,.68]:
  box('bench_leg',(0,.23,z),(.07,.39,.07),.012)
  box('bench_foot',(0,.04,z),(.58,.08,.16),.018)
 rod('barbell',(-.92,1.10,-.37),(.92,1.10,-.37),.018,'accent')
 for x in [-.75,-.64,.64,.75]:rod('weight_plate',(x-.032,1.10,-.37),(x+.032,1.10,-.37),.21,'prop',vertices=20)

def keyboard_stand():
 for x in [-.40,.40]:
  rod('cross_leg',(x,.03,-.31),(x,.84,.16),.027,'accent')
  rod('cross_leg',(x,.03,.31),(x,.84,-.16),.027,'accent')
 box('keyboard_case',(0,.89,0),(1.17,.11,.36),.028)
 box('key_recess',(0,.951,.08),(1.02,.012,.20),.01,'accent')
 for i in range(28):box('white_key',((i-13.5)*.0355,.966,.095),(.033,.025,.17),.002,segments=1)
 for i in range(27):
  if i%7 not in [2,6]:box('black_key',((i-13)*.0355,.982,.05),(.020,.023,.09),.002,'accent',segments=1)
 for x in [-.45,-.34]:disk('control_knob',(x,.958,-.10),.019,.018,'accent',N=10)
 box('display',(.33,.951,-.10),(.19,.012,.07),.008,'accent')

def violin():
 outline=[(-.07,.02),(-.11,.05),(-.115,.11),(-.095,.16),(-.05,.19),(-.049,.22),(-.08,.25),(-.08,.29),(-.055,.32),(0,.335),(.055,.32),(.08,.29),(.08,.25),(.049,.22),(.05,.19),(.095,.16),(.115,.11),(.11,.05),(.07,.02)]
 profile_extrude('waisted_body',outline,.055,(0,0,0),'prop',.012)
 box('neck',(0,.39,0),(.035,.20,.027),.008,'accent')
 box('fingerboard',(0,.345,.033),(.033,.25,.012),.003,'accent')
 ball('scroll',(0,.515,0),(.023,.033,.018),seg=12,rings=8)
 for y in [.47,.49]:rod('tuning_peg',(-.035,y,0),(.035,y,0),.006,'accent',vertices=8)
 profile_extrude('tailpiece',[(-.022,0),(.022,0),(.015,.075),(-.015,.075)],.012,(0,.045,.036),'accent',.003)
 box('bridge',(0,.145,.045),(.064,.012,.015),.003)
 for x in [-.006,-.002,.002,.006]:rod('string',(x,.08,.054),(x,.48,.046),.0007,'accent',vertices=4,bev=0)
 for s in [-1,1]:path('soundhole',[(s*.054,.10,.031),(s*.062,.12,.032),(s*.051,.16,.033),(s*.06,.19,.032),(s*.05,.21,.031)],.0035,'accent',6)
 path('bow',[(.16,.01,0),(.17,.29,0),(.16,.57,0)],.004,'accent',6)
 rod('bow_hair',(.153,.035,0),(.153,.55,0),.0015,vertices=4,bev=0)

def saxophone():
 path('sax_body',interpolate_sections([(0,.50,0),(-.025,.44,0),(-.025,.18,0),(0,.08,0),(.09,.075,0),(.12,.15,0),(.12,.24,0)],4),.027,'prop',10)
 lathe('flared_bell',[(.022,.19),(.030,.25),(.052,.30),(.071,.32),(.073,.333),(.061,.333),(.043,.30),(.021,.25)],(.12,0,0),'prop',N=20)
 path('crook',interpolate_sections([(0,.50,0),(.015,.55,0),(.063,.57,0),(.095,.54,0)],3),.014,'prop',8)
 rod('mouthpiece',(.085,.548,0),(.123,.52,0),.014,'accent',r2=.008,vertices=10)
 for y in [.19,.24,.29,.34,.39]:
  rod('key_stem',(-.025,y,.021),(.018,y,.038),.004,'accent',vertices=6,bev=0)
  rod('key_pad',(.018,y,.035),(.018,y,.044),.014,'accent',vertices=10,bev=0)
 path('key_rail',[(.02,.16,.037),(.02,.42,.037)],.003,'accent',6)


def sloped_glass(n,w,yt,zt,yb,zb):
 sign=1 if zb>zt else -1
 vs=[(-w,yt,zt+sign*.012),(w,yt,zt+sign*.012),(w,yb,zb+sign*.012),(-w,yb,zb+sign*.012),(-w,yt,zt),(w,yt,zt),(w,yb,zb),(-w,yb,zb)]
 return mesh(n,vs,[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],'accent',.004)

# P2 nature, fantasy and animals, added after the required silhouettes were reviewed.
for t,n in [('fallen-tree','Fallen tree'),('mushroom-cluster','Mushroom cluster'),('sandcastle','Sandcastle'),('garden-shed','Garden shed'),('garden-hose','Coiled garden hose'),('birdhouse','Birdhouse on post'),('hammock','Hammock on frame')]:entry(t,n,'Outdoor','nature,garden',t+',outdoor,garden',2500 if t=='mushroom-cluster' else 6000,priority='P2')
for t,n in [('sci-fi-crate','Science fiction crate'),('control-console','Control console'),('cauldron','Cauldron'),('banner-pole','Banner pole'),('weapon-rack','Weapon rack')]:entry(t,n,'Fantasy','fantasy',t+',genre,set',priority='P2')
for t,n in [('cow','Standing cow'),('chicken','Chicken'),('fish','Market fish on stand'),('deer','Standing deer')]:entry(t,n,'Creatures','animals,nature',t+',animal',12000,priority='P2')
CATALOG['hammock']['seat']={'y':.39,'z':0,'x':[0]}
CATALOG['sci-fi-crate']['top']=.62

def fallen_tree():
 rod('fallen_trunk',(0,.23,-1.2),(0,.23,1.2),.23,'prop',r2=.17,vertices=20,bev=.018)
 for z,r in [(-1.2,.21),(1.2,.15)]:
  rod('sawn_end',(0,.23,z-.006),(0,.23,z+.006),r,'accent',vertices=20,bev=0)
  for rr in [r*.33,r*.66]:ring('growth_ring',(0,.23,z*1.008),rr,.004,'prop',axis='z',N=20)
 for x,y,z,bx,by,bz in [(.12,.34,-.5,.65,.68,-.35),(-.12,.30,.20,-.54,.42,.52),(.10,.30,.65,.44,.65,1.02)]:
  rod('broken_branch',(x,y,z),(bx,by,bz),.080,r2=.032,vertices=12)
  ball('branch_collar',(x,y,z),(.11,.09,.12),seg=12,rings=6)
 for i in range(8):
  a=i*math.tau/8;path('bark_ridge',[(.226*math.cos(a),.23+.226*math.sin(a),-1.1),(.205*math.cos(a+.035),.23+.205*math.sin(a+.035),0),(.174*math.cos(a),.23+.174*math.sin(a),1.1)],.009,'accent',6)

def mushroom_cluster():
 for x,z,h,r in [(-.10,-.025,.22,.12),(.085,.045,.15,.086),(.015,-.10,.11,.065)]:
  rod('mushroom_stem',(x,.015,z),(x,h-.045,z),r*.26,'prop',r2=r*.20,vertices=12,bev=.006)
  lathe('mushroom_cap',[(0,h),(r*.32,h),(r*.72,h-.025),(r,h-.065),(r,h-.079),(r*.72,h-.085),(r*.22,h-.08),(0,h-.065)],(x,0,z),'prop',N=20)
  lathe('gill_band',[(r*.25,h-.079),(r*.73,h-.084),(r*.91,h-.078),(r*.91,h-.074),(r*.70,h-.078),(r*.25,h-.074)],(x,0,z),'accent',N=20)

def sandcastle():
 box('sand_foundation',(0,.025,0),(.93,.05,.85),.045)
 box('central_keep',(0,.22,0),(.52,.40,.43),.025)
 for x in [-.33,.33]:
  for z in [-.28,.28]:
   lathe('corner_tower',[(0,.04),(.125,.04),(.11,.39),(.13,.40),(.13,.47),(.105,.47),(.105,.42),(0,.42)],(x,0,z),N=16)
   for j in range(6):
    a=j*math.tau/6;box('tower_merlon',(x+.108*math.cos(a),.49,z+.108*math.sin(a)),(.06,.07,.06),.009,segments=1)
 for x in [-.19,0,.19]:
  for z in [-.20,.20]:box('wall_merlon',(x,.445,z),(.085,.08,.07),.008,segments=1)
 profile_extrude('arched_entry',[(-.075,0),(.075,0),(.075,.11),(.053,.16),(0,.18),(-.053,.16),(-.075,.11)],.009,(0,.035,.225),'accent',.005)
 rod('flag_pole',(0,.42,0),(0,.76,0),.007,'accent',vertices=8,bev=0)
 profile_extrude('pennant',[(0,0),(.13,-.04),(0,-.08)],.008,(0,.75,0),'prop',.003)

def garden_shed():
 box('floor',(0,.045,0),(1.80,.09,1.62),.02,'accent')
 box('rear_wall',(0,1.02,-.77),(1.72,1.95,.07),.016)
 for x in [-.85,.85]:box('side_wall',(x,1.02,0),(.07,1.95,1.54),.016)
 for x in [-.64,.64]:box('front_wall',(x,1.02,.77),(.43,1.95,.07),.016)
 box('door_header',(0,1.87,.77),(.86,.25,.07),.014)
 box('shed_door',(0,.88,.78),(.81,1.69,.065),.018,'accent')
 for x in [-.30,-.15,0,.15,.30]:box('door_board',(x,.88,.818),(.135,1.59,.015),.005,segments=1)
 for y in [.25,1.47]:box('door_crossbrace',(0,y,.84),(.74,.065,.025),.007)
 rod('door_diagonal',(-.33,.28,.85),(.33,1.44,.85),.027,vertices=4,bev=.004)
 box('door_handle',(.28,.89,.865),(.035,.17,.025),.006,'accent')
 side_extrude('gable_wall',[(-.77,2.0),(0,2.40),(.77,2.0)],1.76,'prop',.008)
 side_extrude('gable_roof',[(-.94,2.00),(0,2.48),(.94,2.00),(.94,1.93),(0,2.40),(-.94,1.93)],2.04,'prop',.018)
 for y in [.28,.55,.82,1.09,1.36,1.63,1.9]:
  for x in [-.894,.894]:box('side_siding',(x,y,0),(.012,.015,1.50),.003,'accent',segments=1)
 box('side_window_frame',(.90,1.36,.01),(.045,.63,.68),.015,'accent')
 box('side_window',(.927,1.36,.01),(.013,.50,.55),.009)
 for z in [-.26,.01,.28]:box('window_mullion',(.94,1.36,z),(.013,.51,.026),.004,'accent')
 box('window_crossbar',(.94,1.36,.01),(.014,.025,.56),.004,'accent')

def garden_hose():
 for i,r in enumerate([.20,.235,.27,.305]):
  pts=[(r*math.cos(j*math.tau/40),.018+i*.004,r*math.sin(j*math.tau/40)) for j in range(40)]
  path('hose_coil',pts,.013,'prop',8,True)
 path('loose_hose',[(.31,.035,0),(.40,.03,.04),(.43,.025,.20),(.35,.025,.36)],.013,'prop',8)
 rod('sprayer_body',(.35,.027,.34),(.27,.027,.44),.025,'accent',vertices=12)
 rod('sprayer_nozzle',(.27,.027,.44),(.22,.027,.49),.032,'prop',r2=.022,vertices=12)
 path('trigger',[(.32,.03,.39),(.35,.07,.44),(.31,.07,.46)],.007,'accent',6)

def birdhouse():
 post('wooden_post',0,0,.90,.033)
 box('house_body',(0,1.055,0),(.27,.31,.23),.018)
 side_extrude('pitched_roof',[(-.17,1.20),(0,1.38),(.17,1.20),(.17,1.17),(0,1.34),(-.17,1.17)],.35,'prop',.010)
 rod('round_entrance',(0,1.085,.122),(0,1.085,.13),.047,'accent',vertices=20,bev=0)
 ring('entry_rim',(0,1.085,.135),.048,.006,'prop',axis='z',N=20)
 rod('perch',(0,.977,.11),(0,.977,.23),.009,'accent',vertices=10)
 box('base_ledge',(0,.902,.015),(.33,.04,.29),.01)

def hammock():
 for z in [-.97,.97]:
  box('frame_foot',(0,.045,z),(1.03,.09,.15),.025,'accent')
  rod('angled_support',(0,.09,z),(0,1.11,z*1.25),.045,vertices=12)
 rod('bottom_frame',(0,.09,-.98),(0,.09,.98),.05,'accent',vertices=12)
 # Continuous fabric sags in both width and length; no planar placeholder.
 vs=[];nx=10;nz=22
 for i in range(nz+1):
  z=-1.05+2.1*i/nz;t=z/1.05
  for j in range(nx+1):
   u=-1+2*j/nx;w=.39*(1-.55*abs(t)**4);x=u*w;y=.38+.52*t*t+.09*u*u
   vs.append((x,y,z))
 fs=[]
 for i in range(nz):
  for j in range(nx):a=i*(nx+1)+j;fs.append((a,a+1,a+nx+2,a+nx+1))
 mesh('sagging_fabric',vs,fs)
 for z in [-1.05,1.05]:
  rod('spreader_bar',(-.20,.99,z),(.20,.99,z),.018,'accent',vertices=12)
  for x in [-.18,-.09,0,.09,.18]:rod('end_rope',(x,.99,z),(0,1.11,z/1.05*1.21),.004,'accent',vertices=6,bev=0)
 for s in [-1,1]:path('bound_edge',[(s*.39*(1-.55*abs((-1+2*i/nz))**4),.47+.52*(-1+2*i/nz)**2,-1.05+2.1*i/nz) for i in range(nz+1)],.008,'accent',6)

def sci_fi_crate():
 box('armored_case',(0,.31,0),(.84,.58,.55),.045)
 for x in [-.36,.36]:
  for z in [-.23,.23]:box('corner_guard',(x,.31,z),(.13,.62,.12),.022,'accent')
 box('lid',(0,.60,0),(.83,.04,.54),.016,'accent')
 box('front_inset',(0,.31,.285),(.55,.34,.025),.02,'accent')
 for x in [-.16,.16]:box('panel_rib',(x,.31,.304),(.045,.31,.017),.006)
 box('center_lock',(0,.48,.307),(.17,.08,.035),.014)
 for x in [-.44,.44]:path('side_handle',[(x,.35,-.08),(x*1.04,.30,-.08),(x*1.04,.30,.08),(x,.35,.08)],.014,'accent',8)

def control_console():
 side_extrude('console_body',[(-.38,0),(.38,0),(.38,.72),(.18,.91),(-.38,.91)],1.12,'prop',.035)
 box('rear_display_case',(0,1.06,-.25),(1.08,.55,.18),.035)
 box('screen',(0,1.07,-.149),(.88,.36,.022),.02,'accent')
 box('desk_panel',(0,.90,.15),(1.0,.025,.38),.014,'accent')
 for x in [-.35,-.21,-.07,.07,.21,.35]:
  for z in [.05,.16]:box('button',(x,.925,z),(.08,.025,.06),.006)
 for x in [-.29,.29]:rod('control_stick',(x,.93,.26),(x,1.06,.26),.012,'accent',vertices=10);ball('stick_grip',(x,1.07,.26),(.029,.029,.029),seg=12,rings=6)
 for y in [.19,.27,.35]:box('vent',(0,y,.389),(.70,.020,.014),.004,'accent')

def cauldron():
 lathe('open_cauldron',[(.12,.06),(.22,.09),(.29,.22),(.27,.39),(.235,.45),(.255,.46),(.255,.49),(.21,.49),(.22,.44),(.24,.37),(.255,.23),(.19,.13),(.12,.11)],N=28)
 for a in [0,math.tau/3,math.tau*2/3]:
  x=.19*math.cos(a);z=.19*math.sin(a);rod('foot',(x,.10,z),(x*1.2,.025,z*1.2),.032,r2=.025,vertices=10)
 for s in [-1,1]:
  ring('handle_ring',(s*.29,.32,0),.075,.012,'accent',axis='x',N=20)
  rod('handle_mount',(s*.23,.37,0),(s*.30,.37,0),.020,'accent',vertices=12)
 ring('rolled_rim',(0,.478,0),.238,.019,'accent',N=28)

def banner_pole():
 disk('weighted_base',(0,.035,0),.24,.07,'accent',N=20)
 rod('pole',(0,.05,0),(0,2.40,0),.024,vertices=16)
 rod('crossbar',(-.43,2.23,0),(.43,2.23,0),.019,'accent',vertices=12)
 poly_prism('spear_finial',(0,2.40,0),.048,.17,4,'prop',True)
 vs=[];nx=12;ny=12
 for j in range(ny+1):
  y=2.18-j*.095
  for i in range(nx+1):
   x=-.36+i*.06;yy=y-(.13*(1-abs(x)/.36) if j==ny else 0);z=.045+.028*math.sin(i*math.pi/3+j*.24)
   vs.append((x,yy,z))
 fs=[]
 for j in range(ny):
  for i in range(nx):a=j*(nx+1)+i;fs.append((a,a+1,a+nx+2,a+nx+1))
 mesh('hanging_banner',vs,fs)
 for x in [-.26,0,.26]:ring('hanging_loop',(x,2.21,0),.032,.007,'accent',axis='x',N=12)
 profile_extrude('raised_emblem',[(-.10,0),(0,.16),(.10,0),(0,-.16)],.012,(0,1.65,.082),'accent',.004)

def weapon_rack():
 for x in [-.51,.51]:
  box('upright',(x,.72,0),(.075,1.44,.075),.014)
  box('rack_foot',(x,.045,0),(.15,.09,.64),.019,'accent')
 for y in [.25,.86,1.32]:box('crossbeam',(0,y,0),(1.07,.075,.08),.013)
 # Two distinct long weapons in fitted hooks.
 for x in [-.30,.29]:
  rod('weapon_shaft',(x,.09,.11),(x,1.37,.11),.016,'accent',vertices=12)
  for y in [.85,1.27]:path('weapon_hook',[(x-.055,y,0),(x-.055,y,.13),(x+.055,y,.13),(x+.055,y,0)],.009,'accent',6)
 poly_prism('spearhead',(-.30,1.37,.11),.055,.30,4,'prop',True)
 profile_extrude('axe_blade',[(-.02,0),(.17,.03),(.22,.20),(.17,.34),(-.02,.28)],.04,(.29,1.24,.11),'prop',.012)
 rod('shield_disc',(0,.62,.12),(0,.62,.16),.24,vertices=24,bev=.008)
 ring('shield_rim',(0,.62,.17),.22,.012,'accent',axis='z',N=24)
 ball('shield_boss',(0,.62,.18),(.07,.07,.035),'accent',16,8)

def cow():
 torso('broad_barrel',[(-.88,1.02,.09,.15),(-.69,1.05,.30,.33),(-.28,1.06,.35,.37),(.20,1.10,.32,.36),(.48,1.11,.19,.25),(.58,1.13,.025,.07)],N=24)
 limb('short_neck',[(0,1.02,.31,.13,.12),(0,1.21,.54,.18,.19),(0,1.42,.67,.13,.14)],N=20)
 for s in [-1,1]:
  limb('foreleg',[(s*.14,1.27,.34,.05,.06),(s*.21,1.12,.34,.090,.105),(s*.22,.76,.36,.060,.068),(s*.22,.46,.38,.043,.046),(s*.22,.12,.39,.035,.043)],N=16)
  limb('hind_leg',[(s*.13,1.25,-.67,.05,.07),(s*.22,1.13,-.69,.115,.13),(s*.24,.77,-.59,.078,.09),(s*.24,.45,-.73,.046,.052),(s*.24,.12,-.67,.032,.043)],N=16)
  for z in [.42,-.64]:
   box('cloven_hoof',(s*.22,.06,z),(.13,.12,.16),.023,'accent')
   box('hoof_split',(s*.22,.06,z+.081),(.007,.07,.004),.001)
 o=torso('long_face',[(-.09,1.43,.085,.11),(.02,1.44,.14,.15),(.16,1.32,.12,.13),(.28,1.19,.115,.08),(.32,1.18,.095,.065)],N=20);o.location.y-=.66
 ball('broad_muzzle',(0,1.18,.97),(.123,.073,.057),'accent',20,10)
 for s in [-1,1]:
  ball('nostril',(s*.063,1.204,1.018),(.016,.012,.006),seg=12,rings=6)
  ball('eye',(s*.123,1.44,.77),(.017,.020,.010),'accent',12,6)
  leaf('broad_ear',(s*.10,1.49,.65),(s*.31,1.52,.63),.067)
  path('horn',[(s*.085,1.54,.64),(s*.15,1.63,.60),(s*.21,1.67,.61),(s*.235,1.65,.65)],.023,'accent',10)
 ball('udder',(0,.65,-.44),(.16,.11,.14),seg=20,rings=10)
 for x in [-.07,.07]:
  for z in [-.51,-.38]:rod('teat',(x,.61,z),(x,.52,z),.018,r2=.012,vertices=10)
 creature_tail('tail',[(0,1.15,-.87),(.035,.92,-1.03),(.08,.61,-1.02),(.10,.37,-1.01)],.018,'prop',10)
 ball('tail_tuft',(.10,.31,-1.01),(.038,.095,.035),'accent',16,8)

def chicken():
 torso('hen_body',[(-.15,.24,.025,.048),(-.095,.24,.096,.11),(.015,.25,.115,.13),(.085,.29,.070,.10),(.11,.32,.035,.06),(.135,.33,.012,.025)],N=20)
 limb('upright_neck',[(0,.27,.055,.040,.035),(0,.37,.105,.033,.038),(0,.43,.12,.028,.031)],N=16)
 ball('head',(0,.435,.135),(.043,.05,.044),seg=20,rings=10)
 for s in [-1,1]:
  # A closed folded wing with feather tips overlapping the body contour.
  pts=[(s*.08,.32,.04),(s*.12,.28,-.01),(s*.095,.19,-.10),(s*.043,.19,-.13),(s*.059,.30,-.06),(s*.122,.25,-.04)]
  mesh('folded_wing',pts,[(0,1,5),(1,2,5),(2,3,5),(3,4,5),(4,0,5),(0,4,3,2,1)],'prop')
  ball('eye',(s*.035,.45,.159),(.006,.006,.004),'accent',10,6)
  rod('leg',(s*.036,.18,0),(s*.036,.045,.018),.010,'accent',vertices=10)
  for j in [-1,0,1]:path('toe',[(s*.036,.045,.018),(s*.036+j*.019,.012,.072)],.005,'accent',6)
  path('hind_toe',[(s*.036,.045,.018),(s*.036,.012,-.023)],.004,'accent',6)
 mesh('beak',[(-.018,.427,.173),(.018,.427,.173),(0,.415,.217),(0,.443,.176),(0,.415,.176)],[(0,1,3),(0,3,2),(3,1,2),(1,4,2),(4,0,2),(0,4,1)],'accent')
 for z,h in [(.10,.04),(.125,.055),(.15,.045)]:ball('comb_lobe',(0,.48+h*.20,z),(.011,h,.018),'accent',12,6)
 ball('wattle',(0,.398,.17),(.014,.028,.014),'accent',12,6)
 for x,y,z in [(-.03,.34,-.20),(0,.38,-.22),(.03,.34,-.20)]:
  leaf('tail_feather',(x*.5,.25,-.11),(x,y,z),.036)

def fish():
 # Fish is suspended by a visible neutral market-display stand, as requested.
 box('display_base',(0,.018,0),(.18,.036,.36),.016,'accent')
 rod('display_post',(0,.03,0),(0,.17,0),.012,'accent',vertices=12)
 torso('fish_body',[(-.22,.23,.009,.023),(-.14,.23,.043,.070),(-.03,.23,.065,.105),(.10,.23,.060,.09),(.20,.23,.040,.055),(.25,.23,.018,.023)],N=24)
 for s in [-1,1]:
  ball('eye',(s*.036,.252,.198),(.006,.011,.011),'accent',12,6)
  path('gill_arc',[(s*.042,.29,.15),(s*.057,.25,.14),(s*.047,.18,.14)],.003,'accent',6)
  mesh('pectoral_fin',[(s*.055,.23,.085),(s*.095,.185,-.035),(s*.055,.19,.015),(s*.060,.22,.025)],[(0,1,2),(0,3,1),(1,3,2),(2,3,0)],'accent',smooth=False)
 mesh('tail_fin',[(0,.23,-.21),(0,.33,-.34),(0,.24,-.315),(0,.13,-.34),(.008,.23,-.27),(-.008,.23,-.27)],[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(1,0,5),(2,1,5),(3,2,5),(0,3,5)],'prop',smooth=False)
 mesh('dorsal_fin',[(0,.29,-.13),(0,.405,-.03),(0,.335,.10),(.008,.31,-.02),(-.008,.31,-.02)],[(0,1,3),(1,2,3),(2,0,3),(1,0,4),(2,1,4),(0,2,4)],'accent',smooth=False)
 path('mouth',[(0,.237,.252),(0,.225,.254)],.002,'accent',6)

def deer():
 torso('slender_body',[(-.65,.91,.055,.10),(-.50,.93,.18,.22),(-.15,.95,.20,.24),(.18,.98,.18,.23),(.36,1.0,.115,.17),(.45,1.02,.025,.06)],N=24)
 limb('upright_neck',[(0,1.04,.22,.09,.08),(0,1.20,.39,.10,.12),(0,1.46,.46,.063,.077),(0,1.56,.48,.054,.06)],N=20)
 for s in [-1,1]:
  limb('foreleg',[(s*.085,1.10,.23,.035,.04),(s*.12,1.00,.23,.054,.069),(s*.13,.71,.25,.033,.041),(s*.13,.46,.27,.028,.032),(s*.13,.09,.28,.020,.027)],N=16)
  limb('hind_leg',[(s*.08,1.07,-.49,.04,.05),(s*.13,1.01,-.49,.083,.093),(s*.15,.73,-.39,.056,.064),(s*.15,.43,-.53,.028,.036),(s*.15,.09,-.48,.018,.027)],N=16)
  for x,z in [(s*.13,.30),(s*.15,-.46)]:box('hoof',(x,.045,z),(.073,.09,.10),.016,'accent')
 o=torso('deer_head',[(-.05,1.55,.045,.065),(.025,1.56,.075,.085),(.13,1.52,.056,.056),(.22,1.48,.036,.033)],N=20);o.location.y-=.48
 ball('nose',(0,1.48,.71),(.034,.027,.018),'accent',16,8)
 for s in [-1,1]:
  ball('eye',(s*.064,1.57,.56),(.012,.014,.008),'accent',12,6)
  leaf('long_ear',(s*.052,1.62,.45),(s*.22,1.75,.42),.049)
  # Sweeping antler beam and separate tapered tines form a clear deer silhouette.
  creature_tail('antler_beam',[(s*.043,1.62,.47),(s*.09,1.80,.43),(s*.18,1.96,.36),(s*.25,2.02,.29)],.014,'accent',8)
  for a,b in [((s*.075,1.74,.44),(s*.055,1.90,.57)),((s*.13,1.88,.39),(s*.13,2.07,.43)),((s*.20,1.98,.34),(s*.23,2.13,.37))]:rod('antler_tine',a,b,.012,'accent',r2=.003,vertices=8,bev=0)
 creature_tail('short_tail',[(0,1.03,-.62),(.02,1.08,-.73),(.025,1.11,-.77)],.031,'prop',10)

# Contact centres lie on the authored handle tube or shaft, in application space.
CATALOG['picnic-basket']['grip']=(0, 0.47, 0)
CATALOG['backpack']['grip']=(0, 0.47, 0)
CATALOG['lantern']['grip']=(0, 0.41, 0)
CATALOG['watering-can']['grip']=(0, 0.43, 0)
CATALOG['kettlebell']['grip']=(0, 0.32, 0)
CATALOG['shield']['grip']=(0, 0.32, -0.09)
CATALOG['saxophone']['grip']=(-0.025, 0.28, 0)
