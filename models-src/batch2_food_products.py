"""Batch 2 food, kitchenware and product clay models.
All dimensions are metres in the app's +Y-up/+Z-front coordinate system.
Editable named parts, real hollow vessels and deliberately authored silhouettes.
"""
from batch2_common import *
import math

CATALOG={}
def register(types,category,themes,hold=(),priority='P1',medium=()):
 for t in types.split():
  CATALOG[t]=dict(name=t.replace('-',' ').title(),category=category,themes=themes.split(),tags=t.split('-'),budget=6000 if t in medium else 2500,priority=priority)
  if t in hold:CATALOG[t].update(grip=(0,.08,0),poses=['carry','stand','talk'])
food='water-bottle wine-bottle beer-bottle champagne-bottle soda-can takeaway-coffee mug wine-glass tumbler cocktail-glass teapot jug plate bowl cutlery-set cutting-board pizza pizza-slice pizza-box burger sandwich hot-dog fries apple banana orange fruit-bowl bread-loaf baguette croissant cake cupcake donut ice-cream-cone popcorn-bucket cereal-box milk-carton juice-box jar ketchup-bottle salt-and-pepper takeaway-bag takeout-box food-tray'
food_hold='water-bottle wine-bottle beer-bottle champagne-bottle soda-can takeaway-coffee mug wine-glass tumbler cocktail-glass pizza-slice burger sandwich hot-dog fries apple banana orange baguette croissant cupcake donut ice-cream-cone popcorn-bucket cereal-box milk-carton juice-box jar ketchup-bottle takeaway-bag takeout-box food-tray'.split()
register(food,'Food','food kitchen dining',food_hold,medium=['fruit-bowl','pizza','cake','salt-and-pepper'])
for t in 'water-bottle wine-bottle beer-bottle champagne-bottle soda-can takeaway-coffee mug wine-glass tumbler cocktail-glass teapot jug milk-carton juice-box'.split():
 CATALOG[t]['themes']=['drinks','kitchen','dining'];CATALOG[t].update(poses=['drink','carry','talk']) if t in food_hold else None
register('coffee-machine kettle toaster microwave kitchen-blender saucepan frying-pan','Objects','kitchen home',hold=['frying-pan'],medium=['coffee-machine','microwave'])
products='perfume-bottle cosmetic-jar lipstick skincare-tube pump-bottle shampoo-bottle spray-can sneaker high-heel handbag watch watch-stand sunglasses headphones earbuds-case smartphone tablet laptop smartwatch game-controller vr-headset smart-speaker tv-remote credit-card gift-box shopping-bag product-box product-podium-round product-podium-square product-podium-steps display-riser display-turntable standing-mirror'
products_hold='perfume-bottle cosmetic-jar lipstick skincare-tube pump-bottle shampoo-bottle spray-can handbag watch sunglasses headphones earbuds-case smartphone tablet game-controller vr-headset tv-remote credit-card gift-box shopping-bag'.split()
register(products,'Products','product retail',products_hold,medium=['laptop','product-podium-steps','standing-mirror'])
for t in 'perfume-bottle cosmetic-jar lipstick skincare-tube pump-bottle shampoo-bottle spray-can'.split():CATALOG[t]['themes']=['beauty','product','bathroom']
for t in 'sneaker high-heel handbag watch watch-stand sunglasses standing-mirror'.split():CATALOG[t]['themes']=['fashion','product','retail']
for t in 'headphones earbuds-case smartphone tablet laptop smartwatch game-controller vr-headset smart-speaker tv-remote'.split():CATALOG[t]['themes']=['tech','product','home']
register('birthday-cake salad-bowl spaghetti-plate soup-bowl egg-carton watermelon pineapple grapes vegetable-crate wine-rack beer-keg sushi-tray cheese-board','Food','food kitchen dining',priority='P2',medium=['birthday-cake','salad-bowl','spaghetti-plate','egg-carton','vegetable-crate','wine-rack','sushi-tray','cheese-board'])
register('stand-mixer rice-cooker spice-rack dish-rack','Objects','kitchen home',priority='P2',medium=['stand-mixer','spice-rack','dish-rack'])
register('nail-polish makeup-palette razor toothbrush toothpaste deodorant sports-bottle protein-tub coffee-bag chocolate-bar chips-bag medicine-bottle drone action-camera power-bank keyboard computer-mouse ring-box necklace-bust','Products','product retail',hold='nail-polish makeup-palette razor toothbrush toothpaste deodorant sports-bottle coffee-bag chocolate-bar chips-bag medicine-bottle action-camera power-bank ring-box'.split(),priority='P2',medium=['keyboard','drone'])
for t in 'nail-polish makeup-palette razor toothbrush toothpaste deodorant'.split():CATALOG[t]['themes']=['beauty','bathroom','product']
for t in 'sports-bottle protein-tub'.split():CATALOG[t]['themes']=['fitness','sports','product']
for t in 'coffee-bag chocolate-bar chips-bag'.split():CATALOG[t]['themes']=['food','product','retail']
for t in 'drone action-camera power-bank keyboard computer-mouse'.split():CATALOG[t]['themes']=['tech','product']
CATALOG['medicine-bottle']['themes']=['medical','product']
for t in 'ring-box necklace-bust'.split():CATALOG[t]['themes']=['fashion','product','retail']
ALIASES={'soda-can':['soda','coke','can','fizzy drink'],'takeaway-coffee':['coffee','paper cup','latte','cappuccino'],'hot-dog':['hotdog','sausage','fast food'],'fries':['chips','french fries','fast food'],'kitchen-blender':['smoothie','mixer','appliance'],'smartphone':['phone','mobile','cellphone'],'tv-remote':['remote control','television'],'game-controller':['gamepad','gaming'],'high-heel':['shoe','heel','fashion'],'sneaker':['shoe','trainer'],'water-bottle':['water','drink','bottle'],'handbag':['purse','bag'],'credit-card':['payment','bank card']}
for t,a in ALIASES.items():CATALOG[t]['tags']+=a

def B(n,p,s,b=.006,mat='prop',rot=None):return box(n,p,s,b,mat,rot,segments=1)
def E(n,p,s,mat='prop',seg=12,rings=6):return ball(n,p,s,mat,seg=seg,rings=rings)
def C(n,a,b,r,mat='prop',r2=None,N=20):return rod(n,a,b,r,mat,r2=r2,vertices=N,bev=0)
def R(n,c,r,t,mat='prop',axis='y',N=20):return ring(n,c,r,t,mat,axis=axis,N=N)
def L(n,prof,c=(0,0,0),mat='prop',N=24):return lathe(n,prof,c,mat,N=N)
def P(n,pts,r,mat='prop',sides=6,closed=False):return path(n,pts,r,mat,sides,closed)
def disk(n,r,y,h,c=(0,0),mat='prop',N=24):return C(n,(c[0],y,c[1]),(c[0],y+h,c[1]),r,mat,N=N)
def label(n,w,h,z,y):B(n,(0,y,z),(w,h,.002),.003,'accent')
def arcpts(cx,cy,z,rx,ry,start,end,N=10):return [(cx+rx*math.cos(start+(end-start)*i/N),cy+ry*math.sin(start+(end-start)*i/N),z) for i in range(N+1)]
def cup(n='cup',r=.04,h=.1,c=(0,0,0),mat='prop',t=.004):
 return L(n,[(0,0),(r*.76,0),(r*.86,.006),(r,h-.004),(r*.98,h),(r-t,h),(r-t,h-.008),(r*.76,.012),(0,.012)],c,mat,N=24)
def dish(n='dish',r=.13,h=.025,c=(0,0,0),mat='prop'):
 return L(n,[(0,.004),(r*.68,.004),(r*.72,0),(r*.78,0),(r,.018+h*.2),(r,h),(r*.91,h+.002),(r*.65,.012),(0,.012)],c,mat,N=24)
def bowl(n='bowl',r=.12,h=.07,c=(0,0,0),mat='prop'):
 return L(n,[(0,0),(r*.40,0),(r*.52,h*.10),(r*.86,h*.48),(r,h*.96),(r*.98,h),(r*.91,h),(r*.78,h*.45),(r*.42,.012),(0,.012)],c,mat,N=24)
def bottle(kind):
 spec={'water-bottle':(.034,.23,.015,.035),'wine-bottle':(.038,.30,.014,.09),'beer-bottle':(.03,.24,.012,.07),'champagne-bottle':(.046,.315,.017,.09),'ketchup-bottle':(.034,.235,.015,.035),'shampoo-bottle':(.042,.23,.022,.018),'spray-can':(.032,.205,.020,.02),'sports-bottle':(.036,.23,.021,.03),'medicine-bottle':(.024,.10,.022,.02)}
 r,h,n,neck=spec[kind]
 if kind=='shampoo-bottle':
  B('bottle_curved_body',(0,(h-.02)/2,0),(r*2,h-.02,r*1.25),.025);B('flip_cap',(0,h-.009,0),(r*1.4,.022,r*.95),.01,'accent');label('label_panel',r*1.25,h*.45,r*.63,h*.50);return
 profile=[(0,0),(r*.8,0),(r,.012),(r,h-neck-.023),(r*.9,h-neck-.008),(n,h-neck+.015),(n,h-.012),(0,h-.012)]
 if kind=='beer-bottle':profile=[(0,0),(.030,0),(.033,.009),(.032,.135),(.028,.15),(.020,.171),(.012,.19),(.012,.228),(0,.228)]
 if kind=='ketchup-bottle':profile=[(0,0),(.032,0),(.039,.013),(.040,.03),(.037,.135),(.028,.175),(.015,.185),(.015,.217),(0,.217)]
 L('bottle_body',profile,N=24)
 if kind=='water-bottle':
  for y in [.04,.065,.14,.165]:R('moulded_rib',(0,y,0),r,.0015,N=16)
  L('label_wrap',[(r+.001,.08),(r+.001,.125),(r+.002,.125),(r+.002,.08)],mat='accent',N=24)
 elif kind=='beer-bottle':
  L('raised_label',[(.0325,.045),(.0325,.122),(.0335,.122),(.0335,.045)],mat='accent',N=24)
 elif kind=='ketchup-bottle':
  L('raised_label_band',[(.040,.055),(.039,.12),(.040,.12),(.041,.055)],mat='accent',N=24)
 elif kind=='spray-can':
  C('nozzle',(0,h-.012,0),(0,h+.005,0),.008,'accent',N=12);B('spray_aperture',(0,h,.008),(.006,.004,.002),.001,'prop');L('printed_band',[(r+.001,.035),(r+.001,.145),(r+.002,.145),(r+.002,.035)],mat='accent',N=20);return
 else:
  L('raised_label',[(r+.001,h*.2),(r+.001,h*.52),(r+.002,h*.52),(r+.002,h*.2)],mat='accent',N=24)
 C('closure',(0,h-.018,0),(0,h,0),n*1.12,'accent',N=16)
 if kind=='champagne-bottle':L('foil_neck',[(n*1.13,h-.08),(n*1.1,h-.005),(0,h-.005)],mat='accent',N=20)
 if kind=='ketchup-bottle':C('squeeze_nozzle',(0,h,0),(0,h+.024,0),.009,'accent',r2=.002,N=12)
 if kind=='sports-bottle':C('pull_spout',(0,h,0),(0,h+.018,0),.009,'prop',N=12)
 if kind=='medicine-bottle':B('label_cross_vertical',(0,.05,r+.003),(.007,.032,.002),.001);B('label_cross_horizontal',(0,.05,r+.003),(.026,.007,.002),.001)

def cans():
 L('aluminium_body',[(0,0),(.027,0),(.032,.008),(.033,.02),(.033,.105),(.030,.116),(.028,.119),(0,.119)],N=28)
 for y in [.006,.118]:R('rolled_rim',(0,y,0),.029,.002,'accent',N=20)
 L('label_band',[(.0331,.031),(.0331,.092),(.034,.092),(.034,.031)],mat='accent',N=24)
 B('pull_tab',(0,.121,.004),(.013,.003,.025),.004,'accent');E('opening',(0,.12,-.011),(.009,.001,.012),'accent')

def coffee():
 cup('paper_cup',.045,.115);L('cardboard_sleeve',[(.041,.035),(.044,.08),(.046,.08),(.043,.035)],mat='accent')
 L('snap_lid',[(0,.115),(.045,.115),(.048,.119),(.046,.125),(.040,.127),(.039,.133),(0,.133)],N=24)
 B('sip_aperture',(0,.133,.026),(.019,.002,.005),.002,'accent')

def drinking_glass(kind):
 if kind=='tumbler':cup('thick_glass',.041,.10,mat='accent',t=.005);R('lip',(0,.10,0),.039,.002,N=20);return
 disk('foot',.035,0,.006,mat='accent');C('stem',(0,.006,0),(0,.09,0),.005,'prop',N=12)
 if kind=='wine-glass':L('bowl',[(.005,.08),(.021,.09),(.038,.115),(.044,.145),(.035,.19),(.032,.19),(.040,.145),(.034,.118),(.017,.097),(.005,.094)],mat='accent',N=24)
 else:L('conical_bowl',[(.005,.085),(.065,.145),(.063,.15),(.059,.147),(.006,.099)],mat='accent',N=24)

def mug():
 cup('hollow_mug',.045,.095);P('C_handle',arcpts(.045,.051,0,.033,.035,-math.pi*.48,math.pi*.48,12),.008)

def teapot():
 L('pot_body',[(0,.008),(.05,.008),(.073,.027),(.085,.074),(.075,.118),(.05,.135),(.044,.135),(.05,.12),(.069,.073),(.055,.025),(0,.025)],N=24)
 L('lid',[(0,.132),(.053,.132),(.057,.137),(.04,.145),(0,.15)],N=20);E('lid_knob',(0,.156,0),(.012,.01,.012),'accent')
 P('arched_handle',arcpts(-.069,.077,0,.055,.055,math.pi*.45,math.pi*1.55,14),.012,'accent')
 # Tapered rising spout, with a dark recessed lip.
 P('pour_spout',[(.066,.052,0),(.092,.064,0),(.114,.099,0),(.135,.13,0)],.018)
 C('spout_mouth',(.127,.12,0),(.14,.14,0),.013,'accent',N=16)

def jug():
 L('pitcher',[(0,0),(.045,0),(.055,.02),(.062,.15),(.066,.18),(.06,.18),(.056,.15),(.046,.014),(0,.014)],N=24)
 P('pitcher_handle',[(.054,.155,0),(.098,.16,0),(.111,.13,0),(.10,.07,0),(.057,.052,0)],.009,'accent')
 mesh('sculpted_pour_lip',[(-.055,.171,-.023),(-.087,.179,0),(-.055,.171,.023),(-.055,.177,-.020),(-.081,.182,0),(-.055,.177,.020)],[(0,1,2),(3,5,4),(0,3,4,1),(1,4,5,2),(2,5,3,0)],bevel=.001)
 P('pour_rim',[(-.056,.180,-.023),(-.086,.184,0),(-.056,.180,.023)],.0025)

def cutlery():
 for x in [-.055,0,.055]:
  B('tapered_handle',(x,.005,-.065),(.012,.008,.13),.004)
 # Plate axes: handles toward viewer, business ends toward the back.
 B('fork_shoulder',(-.055,.005,.02),(.027,.008,.045),.004)
 for dx in [-.011,-.004,.004,.011]:B('fork_tine',(-.055+dx,.005,.061),(.004,.008,.048),.001)
 E('spoon_bowl',(.055,.008,.047),(.023,.008,.036),'accent')
 B('knife_blade',(.003,.006,.048),(.021,.009,.105),.008,'accent')

def cutting_board():
 B('board',(0,.012,0),(.34,.024,.23),.02);B('handle',(0,.012,-.155),(.09,.024,.10),.02)
 C('handle_hole',(0,.024,-.177),(0,.026,-.177),.013,'accent',N=12)

def pizza(slice_only=False):
 if not slice_only:
  disk('serving_board',.18,0,.015);disk('pizza_base',.155,.015,.014);disk('cheese_layer',.145,.029,.006,mat='accent');R('rolled_crust',(0,.035,0),.149,.01,N=24)
  for i in range(7):
   a=i*2.399;x=.105*math.cos(a)*(0.6+0.4*(i%2));z=.105*math.sin(a)*(0.6+0.4*(i%2));disk('pepperoni_%02d'%i,.018,.036,.004,(x,z),N=12)
  for i in range(5):
   a=i*math.tau/5;P('slice_score_'+str(i),[(0,.036,0),(.13*math.cos(a),.036,.13*math.sin(a))],.0015,'prop',sides=4)
 else:
  verts=[(-.07,0,-.08),(.07,0,-.08),(0,0,.105),(-.07,.018,-.08),(.07,.018,-.08),(0,.018,.105)]
  mesh('triangular_base',verts,[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)],bevel=.003)
  mesh('melted_cheese',[(-.064,.019,-.075),(.064,.019,-.075),(0,.019,.098),(-.064,.024,-.075),(.064,.024,-.075),(0,.024,.098)],[(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)],'accent',.002)
  P('curved_crust',[(-.07,.023,-.077),(-.035,.026,-.087),(0,.026,-.09),(.035,.026,-.087),(.07,.023,-.077)],.012)
  for x,z in [(-.032,-.043),(.026,-.036),(0,.026)]:disk('pepperoni',.015,.025,.004,(x,z),N=12)

def pizza_box():
 B('box_base',(0,.012,0),(.35,.024,.35),.008);B('lid',(0,.029,-.003),(.352,.009,.346),.004);B('front_latch',(0,.02,.177),(.07,.013,.004),.002,'accent')
 disk('raised_round_badge',.063,.034,.002,mat='accent',N=24)

def burger():
 L('bottom_bun',[(0,0),(.055,0),(.065,.012),(.065,.025),(0,.029)],N=24)
 L('grilled_patty',[(0,.026),(.062,.026),(.067,.035),(.063,.046),(0,.046)],mat='accent',N=24)
 B('cheese_slice',(0,.049,0),(.119,.006,.119),.004)
 # Wavy lettuce silhouette around the bun.
 pts=[((.063+.006*math.sin(i*math.pi/2))*math.cos(i*math.tau/20),.056+.004*math.cos(i*math.pi/2),(.063+.006*math.sin(i*math.pi/2))*math.sin(i*math.tau/20)) for i in range(20)]
 P('lettuce_edge',pts,.004,'accent',sides=4,closed=True)
 L('domed_top_bun',[(0,.054),(.061,.054),(.068,.064),(.059,.09),(.04,.105),(0,.11)],N=24)
 for x,z in [(-.024,.02),(.022,.027),(0,-.03),(.035,-.014),(-.027,-.024)]:E('sesame',(x,.104-abs(x)*.14,z),(.004,.0015,.002),'accent',seg=8,rings=4)

def sandwich():
 outline=[(-.075,0),(.075,0),(.075,.115)]
 for z in [-.032,.032]:profile_extrude('triangular_bread',outline,.018,(0,0,z),bevel=.004)
 profile_extrude('filling',[(x*.97,y*.96+.002) for x,y in outline],.045,mat='accent',bevel=.003)
 profile_extrude('bread_face',[(-.061,.008),(.064,.008),(.064,.101)],.002,(0,0,.042),bevel=.001)

def hotdog():
 E('split_roll_left',(-.024,.026,0),(.035,.026,.095));E('split_roll_right',(.024,.026,0),(.035,.026,.095));E('sausage',(0,.049,0),(.023,.023,.10),'accent')
 P('mustard_zigzag',[((.008 if i%2 else -.008),.071,-.065+i*.016) for i in range(9)],.003,'prop',sides=6)

def fries():
 # Thin folded carton with lowered curved front: the food remains visibly exposed.
 profile_extrude('carton_front',[(-.036,0),(.036,0),(.052,.10),(.03,.09),(0,.082),(-.03,.09),(-.052,.10)],.003,(0,0,.026),bevel=.001)
 profile_extrude('carton_back',[(-.036,0),(.036,0),(.052,.112),(-.052,.112)],.003,(0,0,-.026),bevel=.001)
 B('carton_floor',(0,.003,0),(.072,.006,.052),.002)
 for sx in [-1,1]:
  vs=[(sx*(.036+off),0,z) for off in [0,.003] for z in [-.025,.025]]+[(sx*(.052+off),.105,z) for off in [0,.003] for z in [-.025,.025]]
  mesh('carton_side',vs,[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)])
 for i,(x,z,h) in enumerate([(-.03,-.016,.075),(-.014,-.015,.09),(.006,-.015,.082),(.026,-.015,.093),(-.021,.009,.08),(0,.009,.07),(.022,.009,.078)]):B('fry_%02d'%i,(x,.085+h/2,z),(.013,h,.013),.002,'accent' if i%3==0 else 'prop',rot=(0,.10*(i%3-1),0))
 B('carton_band',(0,.047,.029),(.06,.025,.003),.003,'accent')

def apple(c=(0,0,0),scale=1,n='apple'):
 x,y,z=c;N=24;profile=[(0,.004),(.020,.002),(.034,.012),(.040,.030),(.039,.050),(.033,.068),(.022,.074),(.008,.068),(0,.067)];vs=[];fs=[]
 for r,h in profile:
  for i in range(N):
   a=i*math.tau/N;rr=r*(1+.035*math.cos(a*5));vs.append((x+rr*math.cos(a)*scale,y+h*scale,z+rr*math.sin(a)*scale))
 for k in range(len(profile)):
  for i in range(N):fs.append((k*N+i,k*N+(i+1)%N,((k+1)%len(profile))*N+(i+1)%N,((k+1)%len(profile))*N+i))
 mesh(n+'_lobed_flesh',vs,fs)
 C(n+'_stem',(x,y+.068*scale,z),(x+.006*scale,y+.086*scale,z),.003*scale,'accent',N=8)
 E(n+'_leaf',(x+.014*scale,y+.078*scale,z),(.014*scale,.003*scale,.006*scale),'accent',seg=8,rings=4)

def banana():
 # Swept curved, tapered pentagonal cross-section makes the familiar bent fruit.
 pts=[(-.10,.018,0),(-.08,.009,0),(-.05,.014,0),(-.012,.034,0),(.022,.065,0),(.044,.10,0),(.049,.125,0)]
 widths=[.005,.013,.017,.019,.017,.011,.004];vs=[];fs=[];N=8
 for i,p in enumerate(pts):
  for j in range(N):
   a=j*math.tau/N;vs.append((p[0],p[1]+widths[i]*math.cos(a),p[2]+widths[i]*math.sin(a)))
 for i in range(len(pts)-1):
  for j in range(N):fs.append((i*N+j,i*N+(j+1)%N,(i+1)*N+(j+1)%N,(i+1)*N+j))
 fs+=[tuple(reversed(range(N))),tuple((len(pts)-1)*N+j for j in range(N))];mesh('curved_peel',vs,fs)
 C('dark_tip',(-.105,.016,0),(-.098,.019,0),.005,'accent',N=8);C('stem',(.049,.124,0),(.047,.143,0),.005,'accent',N=8)

def orange(c=(0,0,0),s=1):
 E('orange',(c[0],c[1]+.037*s,c[2]),(.038*s,.037*s,.038*s),seg=20,rings=10);disk('stem_dimple',.005*s,c[1]+.073*s,.001*s,(c[0],c[2]),'accent',N=8)

def fruit_bowl():
 bowl(r=.14,h=.055);apple((-.045,.045,.015));orange((.044,.045,.025));E('pear_body',(0,.085,-.045),(.034,.042,.032),'accent');E('pear_neck',(0,.123,-.045),(.020,.024,.019),'accent');C('pear_stem',(0,.144,-.045),(.007,.16,-.045),.003,N=8)

def bread(baguette=False):
 rx=.035 if baguette else .10;rz=.17 if baguette else .135;hy=.035 if baguette else .065
 E('baked_loaf',(0,hy,0),(rx,hy,rz),seg=20,rings=10)
 for i in range(4):
  z=(i-1.5)*rz*.39;pts=[]
  for j in range(5):
   x=(j-2)*rx*.23;zz=z+(j-2)*rz*.025;yy=hy+hy*math.sqrt(max(.01,1-(x/rx)**2-(zz/rz)**2));pts.append((x,yy+.0005,zz))
  P('baker_score_'+str(i),pts,.002,'accent',sides=4)

def croissant():
 # One continuously tapered curved pastry; shallow laminated folds sit on its skin.
 vs=[];fs=[];N=16;steps=25
 for i in range(steps):
  t=i/(steps-1);a=math.pi*(.08+.84*t);r=.003+.023*math.sin(math.pi*t)**.85;y=.025+.005*math.sin(math.pi*t)
  for j in range(N):
   b=j*math.tau/N;vs.append((.075*math.cos(a)+r*math.cos(b)*math.cos(a),y+r*math.sin(b),.075*math.sin(a)-.045+r*math.cos(b)*math.sin(a)))
 for i in range(steps-1):
  for j in range(N):fs.append((i*N+j,i*N+(j+1)%N,(i+1)*N+(j+1)%N,(i+1)*N+j))
 fs += [tuple(reversed(range(N))),tuple((steps-1)*N+j for j in range(N))];mesh('curved_laminated_pastry',vs,fs)
 for t in [.18,.30,.42,.54,.66,.78,.88]:
  a=math.pi*(.08+.84*t);r=.003+.023*math.sin(math.pi*t)**.85;y=.025+.005*math.sin(math.pi*t);pts=[]
  for j in range(9):
   b=j*math.pi/8;pts.append((.075*math.cos(a)+(r+.0005)*math.cos(b)*math.cos(a),y+(r+.0005)*math.sin(b),.075*math.sin(a)-.045+(r+.0005)*math.cos(b)*math.sin(a)))
  P('rolled_fold',pts,.0012,'accent',sides=4)

def cake(candles=False):
 if candles:
  disk('cake_board',.16,0,.01);L('cake_sponge',[(0,.01),(.135,.01),(.14,.025),(.14,.11),(.13,.12),(0,.12)],N=28);disk('icing_top',.142,.119,.012,mat='accent');
  for i in range(7):
   a=i*math.tau/7;x=.095*math.cos(a);z=.095*math.sin(a);C('candle_'+str(i),(x,.132,z),(x,.177,z),.004,N=8);E('flame_'+str(i),(x,.185,z),(.004,.008,.004),'accent',seg=8,rings=4)
 else:
  disk('cake_board',.16,0,.01)
  # Closed 300-degree ring sectors leave a clearly visible missing slice.
  sector('cut_cake',.14,.012,.105,math.radians(32),math.radians(328),mat='prop')
  sector('filling_layer',.141,.055,.008,math.radians(32),math.radians(328),mat='accent')
  sector('frosting',.142,.115,.012,math.radians(32),math.radians(328),mat='accent')
  for a in [1.2,2.0,2.8,3.6,4.4,5.2]:E('piped_rosette',(.115*math.cos(a),.135,.115*math.sin(a)),(.012,.009,.012),'prop',seg=8,rings=4)

def sector(n,r,y,h,start,end,mat='prop'):
 N=24;outline=[(0,0)]+[(r*math.cos(start+(end-start)*i/N),r*math.sin(start+(end-start)*i/N)) for i in range(N+1)];vs=[(x,yy,z) for yy in [y,y+h] for x,z in outline];m=len(outline);fs=[tuple(reversed(range(m))),tuple(range(m,2*m))]+[(i,(i+1)%m,(i+1)%m+m,i+m) for i in range(m)];mesh(n,vs,fs,mat,bevel=.001)

def cupcake():
 L('fluted_wrapper',[(0,0),(.025,0),(.034,.046),(0,.046)],N=20)
 for i in range(10):
  a=i*math.tau/10;C('wrapper_fold',(.026*math.cos(a),.006,.026*math.sin(a)),(.034*math.cos(a),.042,.034*math.sin(a)),.0015,'accent',N=6)
 L('frosting_swirl',[(0,.043),(.038,.043),(.041,.052),(.030,.061),(.031,.067),(.020,.077),(.020,.083),(.009,.094),(0,.102)],mat='accent',N=24)
 E('cherry',(0,.106,0),(.008,.008,.008),seg=8,rings=4)

def donut():
 R('baked_ring',(0,.021,0),.041,.021,N=28);R('icing_ring',(0,.034,0),.041,.012,'accent',N=28)
 for i in range(8):
  a=i*math.tau/8;B('sprinkle',(math.cos(a)*.042,.045,math.sin(a)*.042),(.008,.002,.003),.001)

def icecream():
 L('waffle_cone',[(0,0),(.034,.115),(.032,.12),(0,.015)],N=20)
 for i in range(6):
  a=i*math.tau/6;P('waffle_ridge_'+str(i),[(.006*math.cos(a),.02,.006*math.sin(a)),(.02*math.cos(a+.4),.07,.02*math.sin(a+.4)),(.032*math.cos(a+.6),.113,.032*math.sin(a+.6))],.0018,'accent',sides=4)
 E('ice_cream_scoop',(0,.139,0),(.044,.041,.044),seg=16,rings=8)
 for i in range(7):
  a=i*math.tau/7;E('scoop_scallop',(.034*math.cos(a),.116,.034*math.sin(a)),(.014,.012,.014),seg=8,rings=4)

def popcorn():
 L('bucket',[(0,0),(.045,0),(.065,.14),(.060,.14),(.041,.008),(0,.008)],N=20)
 for i in range(8):
  a=i*math.tau/8;C('bucket_stripe',(.045*math.cos(a),.01,.045*math.sin(a)),(.063*math.cos(a),.134,.063*math.sin(a)),.004,'accent',N=6)
 E('popcorn_heap',(0,.14,0),(.061,.018,.061),seg=12,rings=6)
 for i in range(13):
  a=i*2.399;r=.047*math.sqrt((i+.5)/13);E('popped_kernel_%02d'%i,(r*math.cos(a),.153+.009*(1-r/.05),r*math.sin(a)),(.011,.009,.010),'accent' if i%4==0 else 'prop',seg=8,rings=4)

def carton(kind):
 if kind=='cereal-box':
  B('folded_box',(0,.15,0),(.20,.30,.06),.008);B('lid_flap',(0,.301,0),(.19,.004,.052),.002,'accent');label('raised_brand_panel',.14,.07,.031,.235)
  profile_extrude('bowl_pictogram',[(-.06,.105),(.06,.105),(.05,.067),(.03,.050),(-.03,.050),(-.05,.067)],.003,(0,0,.032),'accent',bevel=.002)
  P('bowl_rim',[(-.061,.106,.036),(.061,.106,.036)],.0025)
  for x in [-.038,-.013,.013,.038]:E('cereal_pictogram',(x,.114,.034),(.008,.005,.003),'accent',seg=8,rings=4)
  return
 if kind=='juice-box':
  B('carton',(0,.06,0),(.06,.12,.045),.006);B('top_crimp',(0,.122,0),(.058,.004,.005),.001,'accent');label('front_panel',.043,.07,.023,.06);P('bendy_straw',[(.02,.123,-.012),(.02,.159,-.012),(.013,.17,-.012),(-.004,.17,-.012)],.0025,'accent',sides=6);return
 B('carton_body',(0,.10,0),(.075,.20,.075),.006)
 profile_extrude('gable_top',[(-.0375,0),(.0375,0),(0,.04)],.075,(0,.20,0),bevel=.002)
 B('sealed_ridge',(0,.243,0),(.005,.012,.075),.002,'accent');label('milk_label',.055,.08,.039,.11);C('pour_cap',(.022,.218,.02),(.027,.223,.02),.012,'accent',N=12)

def jar():
 L('glass_jar',[(0,0),(.035,0),(.041,.009),(.041,.09),(.034,.105),(.034,.115),(0,.115)],N=24);C('screw_lid',(0,.112,0),(0,.127,0),.038,'accent',N=24);L('label',[(.0411,.025),(.0411,.075),(.042,.075),(.042,.025)],mat='accent',N=24)

def saltpepper():
 for x in [-.035,.035]:
  L('shaker_body',[(0,0),(.022,0),(.024,.014),(.022,.07),(.019,.075),(0,.075)],(x,0,0),N=20)
  L('domed_cap',[(0,.075),(.022,.075),(.022,.083),(.017,.092),(0,.097)],(x,0,0),'accent',N=16)
  for dx,dz in [(-.006,0),(.006,0),(0,.006)]:E('pour_hole',(x+dx,.096,dz),(.002,.001,.002),seg=8,rings=4)

def paperbag(shopping=False):
 w,h,d=(.27,.32,.12) if shopping else (.16,.23,.10)
 B('folded_paper_body',(0,h/2,0),(w,h,d),.012);B('bag_opening',(0,h+.001,0),(w-.015,.003,d-.014),.004,'accent')
 for x in [-w/2,w/2]:P('gusset_fold',[(x,.02,-d*.32),(x*.95,h*.46,0),(x,h-.01,d*.30)],.0015,'accent',sides=4)
 for z in [-d/2+.007,d/2-.007]:P('paper_handle',arcpts(0,h+.006,z,w*.23,h*.18,0,math.pi,12),.006,'accent')
 B('blank_badge',(0,h*.47,d/2+.002),(w*.52,h*.24,.003),.003,'accent')

def takeout():
 profile_extrude('folded_carton',[(-.045,0),(.045,0),(.065,.095),(-.065,.095)],.09,bevel=.006)
 B('folded_lid',(0,.097,0),(.13,.006,.093),.004,'accent');B('lid_flap',(0,.101,.012),(.07,.003,.06),.003)
 P('wire_bail',[(-.064,.065,0),(-.072,.15,0),(-.04,.17,0),(.04,.17,0),(.072,.15,0),(.064,.065,0)],.0025,'accent',sides=6)

def tray():
 B('tray_base',(0,.006,0),(.38,.012,.27),.02)
 for x in [-.188,.188]:B('raised_side',(x,.018,0),(.012,.024,.27),.005,'accent')
 for z in [-.129,.129]:B('raised_end',(0,.018,z),(.37,.024,.012),.005,'accent')

def coffee_machine():
 B('base',(0,.018,0),(.27,.036,.31),.012,'accent');B('rear_housing',(0,.205,-.075),(.25,.37,.16),.025)
 B('brew_head',(0,.315,.045),(.25,.13,.15),.02);B('control_panel',(0,.337,.122),(.19,.07,.008),.006,'accent')
 for x in [-.052,0,.052]:C('brew_button',(x,.34,.127),(x,.34,.134),.012,N=12)
 C('portafilter',(0,.239,.05),(0,.26,.05),.045,'accent',N=20);C('filter_handle',(.03,.245,.05),(.14,.245,.12),.012,'accent',N=12)
 for x in [-.016,.016]:C('coffee_spout',(x,.235,.055),(x,.213,.055),.005,'accent',N=8)
 B('drip_tray',(0,.047,.048),(.23,.025,.17),.006)
 for x in [-.08,-.04,0,.04,.08]:B('drain_slot',(x,.061,.05),(.008,.002,.11),.001,'accent')
 P('steam_wand',[(.105,.26,.11),(.14,.23,.13),(.14,.12,.13),(.12,.10,.13)],.005,'accent')
 B('water_tank',(0,.23,-.165),(.21,.28,.055),.012,'accent');B('tank_lid',(0,.377,-.165),(.22,.015,.065),.005)

def kettle():
 L('kettle_shell',[(0,.015),(.07,.015),(.09,.04),(.095,.11),(.075,.18),(.055,.19),(0,.19)],N=24);disk('power_base',.09,0,.017,mat='accent')
 L('lid',[(0,.19),(.058,.19),(.058,.199),(0,.205)],mat='accent',N=20);B('lid_grip',(0,.211,0),(.025,.012,.04),.006)
 P('handle',[(.062,.17,0),(.12,.17,0),(.13,.07,0),(.08,.04,0)],.014,'accent')
 profile_extrude('pour_spout',[(-.07,.09),(-.14,.17),(-.13,.19),(-.055,.15)],.038,bevel=.006);B('spout_mouth',(-.127,.178,0),(.024,.012,.034),.004,'accent')
 B('switch',(.085,.033,.045),(.035,.012,.025),.004,'accent')

def toaster():
 B('toaster_shell',(0,.095,0),(.28,.18,.17),.035);B('base',(0,.012,0),(.27,.024,.16),.008,'accent')
 for z in [-.04,.04]:
  B('slot_rim',(0,.186,z),(.21,.004,.024),.008);B('bread_slot',(0,.189,z),(.18,.002,.012),.004,'accent')
 B('lever_track',(.142,.105,0),(.004,.10,.012),.003,'accent');B('lever',(.16,.12,0),(.04,.014,.03),.004)
 C('browning_knob',(.141,.05,.04),(.154,.05,.04),.018,'accent',N=16)

def microwave():
 B('oven_body',(0,.155,0),(.49,.29,.36),.018);B('front_fascia',(0,.155,.183),(.48,.28,.015),.008)
 B('door_frame',(-.047,.16,.194),(.36,.245,.014),.008);B('window',(-.059,.16,.203),(.285,.18,.005),.01,'accent')
 B('door_pull',(.115,.16,.213),(.016,.16,.026),.005);B('display',(.19,.23,.195),(.065,.045,.006),.004,'accent')
 for y in [.08,.135]:C('dial',(.19,y,.194),(.19,y,.21),.023,'accent',N=16)
 for x in [-.18,.18]:B('rubber_foot',(x,.005,0),(.055,.01,.25),.003,'accent')

def blender():
 L('motor_base',[(0,0),(.075,0),(.078,.02),(.060,.12),(.047,.14),(0,.14)],N=24)
 C('speed_dial',(0,.065,.064),(0,.065,.079),.022,'accent',N=16)
 L('glass_pitcher',[(0,.14),(.046,.14),(.06,.18),(.073,.36),(.068,.366),(.062,.355),(.051,.185),(0,.158)],mat='accent',N=24)
 P('pitcher_handle',[(.064,.32,0),(.112,.32,0),(.12,.23,0),(.055,.205,0)],.008)
 disk('lid',.074,.365,.018);C('lid_plug',(0,.383,0),(0,.403,0),.025,'accent',N=16)
 for y in [.22,.26,.30]:B('measure_tick',(0,y,.069),(.02,.002,.002),.0008)

def pan(frying=False):
 r=.14 if frying else .10;h=.035 if frying else .10
 L('pan_basin',[(0,0),(r*.75,0),(r,.015),(r,h),(r-.007,h),(r-.012,.018),(0,.012)],N=28)
 P('handle_shank',[(r*.85,h*.65,0),(r+.05,h*.85,0),(r+.16,h*.9,0)],.013,'accent',sides=8)
 B('insulated_grip',(r+.135,h*.9,0),(.13,.028,.036),.012,'accent')
 if not frying:
  P('helper_handle',[(-r,.07,-.03),(-r-.04,.07,-.03),(-r-.04,.07,.03),(-r,.07,.03)],.007,'accent')

def perfume():
 B('glass_flacon',(0,.052,0),(.075,.104,.047),.012,'accent');B('shoulder',(0,.108,0),(.065,.009,.04),.004)
 C('neck',(0,.11,0),(0,.125,0),.014,N=16);B('cap',(0,.14,0),(.035,.03,.029),.006);label('blank_label',.047,.039,.025,.054)

def cosmetic():
 L('cream_jar',[(0,0),(.035,0),(.041,.008),(.041,.04),(.038,.047),(0,.047)],N=24);C('lid',(0,.046,0),(0,.062,0),.043,'accent',N=24);R('closure_seam',(0,.046,0),.04,.0015,N=20)

def lipstick():
 C('tube_base',(0,0,0),(0,.049,0),.012,N=16);C('metal_collar',(0,.049,0),(0,.067,0),.0095,'accent',N=16)
 # Angled bullet top, instead of a featureless cylinder.
 vs=[];N=16
 for y in [.064,.092]:
  for i in range(N):
   a=i*math.tau/N;x=.008*math.cos(a);z=.008*math.sin(a);vs.append((x,y+(x*.65 if y>.08 else 0),z))
 fs=[tuple(reversed(range(N))),tuple(range(N,2*N))]+[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)];mesh('slanted_lipstick_bullet',vs,fs,'accent',bevel=.001)

def tube(kind='skincare-tube'):
 w,h,d=(.055,.15,.031) if kind=='skincare-tube' else (.038,.17,.025)
 C('flip_cap',(0,0,0),(0,.023,0),d*.52,'accent',N=16)
 # Sloping squeezable tube with narrow crimped end.
 profile_extrude('squeeze_body',[(-w*.32,.018),(w*.32,.018),(w*.5,h),(-w*.5,h)],d,bevel=.008)
 B('sealed_crimp',(0,h+.004,0),(w,.009,d*.35),.002,'accent');label('label_panel',w*.65,h*.42,d/2+.001,h*.55)

def pump():
 B('bottle',(0,.09,0),(.075,.18,.055),.022);C('neck',(0,.18,0),(0,.199,0),.017,'accent',N=16);C('plunger',(0,.199,0),(0,.218,0),.007,N=12)
 B('pump_head',(0,.224,.016),(.035,.014,.06),.006,'accent');B('nozzle_tip',(0,.219,.043),(.017,.012,.015),.003);label('label_panel',.05,.07,.028,.09)

def sneaker():
 # Layered shaped sole and toe, heel, tongue, collar and four laces.
 outline=[(-.047,0),(.047,0),(.054,.018),(.051,.038),(-.045,.039),(-.054,.023)]
 B('sculpted_sole',(0,.019,.012),(.105,.038,.28),.025,'accent')
 E('toe_box',(0,.052,.095),(.05,.037,.07),seg=16,rings=8);B('midfoot_upper',(0,.066,-.006),(.096,.083,.17),.029)
 B('heel_counter',(0,.079,-.095),(.085,.115,.056),.02);E('collar_shadow',(0,.137,-.08),(.028,.002,.025),'accent',seg=16,rings=6)
 P('padded_collar',[(.032*math.cos(i*math.tau/20),.140,-.08+.028*math.sin(i*math.tau/20)) for i in range(20)],.004,'prop',closed=True)
 B('tongue',(0,.11,-.015),(.041,.014,.085),.008,'accent')
 for z in [-.041,-.018,.005,.028]:P('shoelace',[(-.032,.118,z),(-.012,.121,z+.005),(.032,.118,z)],.0025,'prop',sides=6)
 P('side_seam',[(-.048,.041,.075),(-.049,.07,.006),(-.043,.105,-.08)],.002,'accent',sides=4)

def highheel():
 B('forefoot_sole',(0,.012,.07),(.075,.018,.12),.018,'accent');B('toe_upper',(0,.032,.09),(.079,.039,.105),.02)
 outline=[(-.112,.105),(-.08,.115),(-.025,.06),(.055,.018),(.057,.010),(-.03,.049),(-.085,.101)]
 vs=[(x,y,z) for x in [-.032,.032] for z,y in outline];N=len(outline)
 mesh('arched_sole',vs,[tuple(reversed(range(N))),tuple(range(N,2*N))]+[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)],'prop',bevel=.004)
 C('stiletto_heel',(0,0,-.105),(0,.113,-.092),.009,'accent',r2=.016,N=12)
 B('heel_cup',(0,.132,-.085),(.069,.059,.052),.016);B('insole',(0,.164,-.083),(.047,.004,.031),.008,'accent')
 P('ankle_strap',arcpts(0,.166,-.082,.043,.015,0,math.tau,16),.005,'accent',closed=False)

def handbag():
 profile_extrude('bag_body',[(-.14,0),(.14,0),(.12,.23),(-.12,.23)],.11,bevel=.017)
 for z in [-.047,.047]:P('leather_handle',arcpts(0,.23,z,.082,.10,0,math.pi,16),.009,'accent')
 B('front_flap',(0,.16,.061),(.23,.13,.014),.012);B('clasp',(0,.102,.071),(.033,.028,.008),.005,'accent')
 P('stitched_edge',[(-.116,.035,.057),(-.116,.205,.057),(.116,.205,.057),(.116,.035,.057)],.0015,'accent',sides=4)

def watch(smart=False,stand=False):
 if stand:
  B('stand_base',(0,.008,0),(.13,.016,.10),.012,'accent');C('stand_stem',(0,.016,-.018),(0,.14,-.018),.009,N=12)
  P('curved_display_cushion',arcpts(0,.155,0,.048,.065,-math.pi*.75,math.pi*.75,20),.018);return
 # Product presentation: strap lies flat, face upward.
 B('lower_strap',(0,.003,-.066),(.023,.006,.085),.004,'accent');B('upper_strap',(0,.003,.067),(.023,.006,.085),.004,'accent')
 if smart:B('watch_case',(0,.011,0),(.039,.015,.045),.009);B('touchscreen',(0,.020,0),(.033,.003,.039),.007,'accent')
 else:
  disk('watch_case',.022,.004,.013);disk('dial',.018,.017,.002,mat='accent');P('hour_hand',[(0,.020,0),(-.008,.020,-.004)],.0012);P('minute_hand',[(0,.020,0),(.005,.020,.012)],.001)
  for i in range(8):a=i*math.tau/8;E('hour_marker',(.015*math.cos(a),.020,.015*math.sin(a)),(.001,.0008,.001),seg=8,rings=4)
 C('crown',(.021,.012,0),(.026,.012,0),.004,'accent',N=12)
 B('strap_buckle',(0,.007,.109),(.028,.010,.016),.004)
 for z in [-.055,-.068,-.081,-.094]:disk('strap_hole',.002,.006,.001,(0,z),mat='prop',N=8)

def sunglasses():
 for x in [-.035,.035]:
  B('lens',(x,.026,.012),(.061,.043,.008),.014,'accent');P('lens_rim',[(x-.028,.009,.018),(x-.030,.04,.018),(x-.018,.049,.018),(x+.023,.048,.018),(x+.031,.038,.018),(x+.026,.009,.018),(x-.028,.009,.018)],.003,'prop',sides=6)
 P('bridge',[(-.007,.038,.018),(0,.042,.019),(.007,.038,.018)],.003)
 for x in [-.068,.068]:P('temple_arm',[(x,.04,.012),(x,.04,-.088),(x*.90,.025,-.12)],.003,'accent')

def headphones():
 P('padded_headband',arcpts(0,.099,0,.092,.105,0,math.pi,20),.011,'accent')
 for x in [-.087,.087]:
  B('ear_cup',(x,.068,0),(.038,.088,.063),.018);B('ear_cushion',(x*.78,.068,0),(.012,.074,.051),.005,'accent');B('slider',(x,.115,0),(.014,.052,.022),.005,'accent')

def earbuds():
 def shell(n,sections,mat='prop'):
  N=24;vs=[];fs=[]
  for y,w,d in sections:
   for i in range(N):
    a=i*math.tau/N;cx=math.cos(a);sz=math.sin(a);vs.append((w*.5*math.copysign(abs(cx)**.55,cx),y,d*.5*math.copysign(abs(sz)**.55,sz)))
  for k in range(len(sections)-1):
   for i in range(N):fs.append((k*N+i,k*N+(i+1)%N,(k+1)*N+(i+1)%N,(k+1)*N+i))
  fs.extend([tuple(reversed(range(N))),tuple((len(sections)-1)*N+i for i in range(N))]);mesh(n,vs,fs,mat)
 shell('charging_case',[(0,.042,.028),(.006,.057,.041),(.014,.062,.046),(.030,.062,.046),(.034,.060,.044)])
 shell('lid_seam',[(.033,.0605,.0445),(.035,.0605,.0445)],'accent')
 shell('hinged_lid',[(.035,.060,.044),(.042,.057,.041),(.046,.043,.029)])
 E('status_led',(0,.022,.0235),(.002,.002,.001),'accent',seg=8,rings=4)

def screen_device(kind):
 w,d,h=(.075,.15,.008) if kind=='smartphone' else (.185,.25,.009)
 B('device_body',(0,h/2,0),(w,h,d),.004);B('glass_screen',(0,h+.001,.002),(w-.007,.002,d-.008),.002,'accent')
 if kind=='smartphone':B('earpiece',(0,h+.002,-d*.41),(.018,.001,.002),.001);E('selfie_camera',(.018,h+.002,-d*.41),(.002,.0008,.002),seg=8,rings=4)
 else:disk('front_camera',.002,h+.002,.001,(0,-d*.45),N=8)
 B('power_key',(w/2+.001,h/2,-d*.20),(.002,.003,.018),.001,'accent')

def laptop():
 B('base',(0,.009,0),(.33,.018,.235),.008);B('keyboard_recess',(0,.020,-.026),(.286,.003,.118),.004,'accent');B('trackpad',(0,.021,.070),(.105,.002,.058),.004,'accent')
 for row in range(4):
  for col in range(10):B('key_%d_%d'%(row,col),((col-4.5)*.026,.024,-.068+row*.026),(.021,.004,.018),.002)
 B('space_bar',(0,.024,.025),(.12,.004,.012),.002)
 # Open 105 degrees: shell and glass are authored by a four-corner profile.
 profile_extrude('display_shell',[(-.165,0),(.165,0),(.165,.22),(-.165,.22)],.012,(0,.025,-.126),bevel=.006)
 B('display',(0,.139,-.117),(.31,.197,.003),.004,'accent');C('hinge',(-.14,.023,-.117),(.14,.023,-.117),.008,'accent',N=12)


def controller():
 # Connected shoulders and angled grips, raised sticks and tactile controls.
 outline=[(-.070,-.035),(-.033,-.052),(.033,-.052),(.070,-.035),(.087,.030),(.078,.076),(.055,.073),(.028,.026),(-.028,.026),(-.055,.073),(-.078,.076),(-.087,.030)]
 N=len(outline);vs=[(x,y,z) for y in [.002,.064] for x,z in outline]
 mesh('ergonomic_controller_shell',vs,[tuple(reversed(range(N))),tuple(range(N,2*N))]+[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)],bevel=.010)
 for s in [-1,1]:
  C('thumbstick_stem',(s*.032,.064,.015),(s*.032,.075,.015),.006,'accent',N=12);disk('thumbstick',.013,.075,.006,(s*.032,.015),'accent',N=16)
 B('dpad_horizontal',(-.047,.067,-.015),(.030,.008,.010),.002,'accent');B('dpad_vertical',(-.047,.067,-.015),(.010,.008,.030),.002,'accent')
 for dx,dz in [(0,-.010),(0,.010),(-.010,0),(.010,0)]:disk('action_button',.004,.065,.007,(.045+dx,-.017+dz),'accent',N=10)
 for x in [-.047,.047]:B('shoulder_button',(x,.051,-.044),(.036,.018,.012),.005,'accent')

def vr():
 B('visor',(0,.06,.015),(.19,.105,.092),.025);B('front_panel',(0,.06,.064),(.17,.075,.009),.018,'accent');B('face_padding',(0,.06,-.038),(.17,.09,.018),.018,'accent')
 P('head_strap',[(-.085,.07,-.02),(-.10,.07,-.12),(-.065,.07,-.18),(.065,.07,-.18),(.10,.07,-.12),(.085,.07,-.02)],.012,'accent')
 P('top_strap',[(0,.11,-.01),(0,.16,-.09),(0,.11,-.18)],.013)
 for x in [-.055,.055]:E('tracking_sensor',(x,.062,.070),(.008,.008,.002),seg=8,rings=4)

def speaker():
 L('speaker_shell',[(0,0),(.042,0),(.052,.012),(.052,.14),(.042,.153),(0,.153)],N=24)
 disk('touch_top',.043,.153,.003,mat='accent',N=24);R('top_light_band',(0,.145,0),.050,.002,'accent',N=24)
 for i in range(12):
  a=i*math.tau/12;P('woven_grille_seam',[(.052*math.cos(a),.025,.052*math.sin(a)),(.052*math.cos(a),.125,.052*math.sin(a))],.0012,'accent',sides=4)

def remote():
 B('remote_shell',(0,.010,0),(.048,.020,.18),.009);disk('navigation_ring',.014,.020,.004,(0,-.022),'accent',N=16);disk('select_button',.007,.025,.002,(0,-.022),N=12)
 for x in [-.012,0,.012]:
  for z in [.025,.045,.065]:B('key',(x,.022,z),(.008,.005,.011),.002,'accent')
 disk('power_button',.006,.020,.004,(-.012,-.066),'accent',N=12);B('infrared_window',(0,.010,-.091),(.029,.007,.003),.002,'accent')

def credit():
 B('card',(0,.0009,0),(.0856,.0018,.054),.0008);B('chip',(-.022,.002,.005),(.012,.001,.010),.001,'accent')
 for x in [-.024,-.019]:B('chip_trace',(x,.0027,.005),(.0008,.0003,.008),0)
 for x in [-.02,-.008,.004,.016]:B('raised_account_group',(x,.002,-.012),(.008,.0008,.002),.0004,'accent')
 B('signature_band',(0,.002,.018),(.058,.0006,.004),.0005,'accent')

def gift():
 B('box',(0,.075,0),(.18,.15,.16),.008);B('lid',(0,.155,0),(.19,.018,.17),.006)
 B('ribbon_vertical',(0,.158,0),(.025,.014,.173),.003,'accent');B('ribbon_horizontal',(0,.158,0),(.193,.014,.025),.003,'accent')
 for x in [-.09,.09]:B('ribbon_side',(x,.075,0),(.004,.15,.025),.001,'accent')
 for z in [-.08,.08]:B('ribbon_end',(0,.075,z),(.025,.15,.004),.001,'accent')
 for s in [-1,1]:P('bow_loop',[(0,.175,0),(s*.036,.204,-.018),(s*.053,.192,0),(s*.036,.18,.018),(0,.175,0)],.006,'accent')
 E('bow_knot',(0,.179,0),(.012,.01,.012),seg=8,rings=4)

def productbox():
 B('folding_carton',(0,.15,0),(.19,.30,.10),.006);B('top_flap',(0,.302,0),(.182,.003,.09),.001,'accent');label('raised_label_panel',.135,.16,.052,.16)
 B('bottom_fold',(0,.009,.052),(.17,.003,.002),.001,'accent')

def podium(kind):
 if kind=='product-podium-round':L('round_podium',[(0,0),(.36,0),(.38,.02),(.38,.55),(.36,.57),(0,.57)],N=40);CATALOG[kind]['top']=.57
 elif kind=='product-podium-square':B('square_podium',(0,.28,0),(.65,.56,.65),.025);CATALOG[kind]['top']=.56
 elif kind=='product-podium-steps':
  for i in range(3):B('tier_'+str(i),((i-1)*.44,(i+1)*.12,0),(.44,(i+1)*.24,.52),.012)
  CATALOG[kind]['top']=.72
 elif kind=='display-riser':
  B('acrylic_riser',(0,.124,0),(.42,.24,.28),.012,'accent')
  for x in [-.18,.18]:
   for z in [-.11,.11]:B('protective_foot',(x,.002,z),(.018,.004,.018),.001,'prop')
  CATALOG[kind]['top']=.244
 else:
  L('turntable_base',[(0,0),(.245,0),(.26,.015),(.26,.06),(.25,.07),(0,.07)],N=40);disk('rotating_deck',.27,.071,.014,mat='accent',N=40);B('power_switch',(0,.032,.261),(.025,.011,.004),.003,'accent');CATALOG[kind]['top']=.085

def standingmirror():
 B('mirror_frame',(0,.98,0),(.54,1.75,.045),.024);B('mirror_surface',(0,.99,.026),(.487,1.68,.007),.018,'accent')
 for x in [-.21,.21]:
  P('rear_support',[(x,1.42,-.025),(x,.05,-.48)],.017,'accent');B('front_foot',(x,.05,.01),(.07,.1,.13),.016)
 P('brace',[(-.21,.44,-.36),(.21,.44,-.36)],.012)

def salad():
 bowl(r=.14,h=.075)
 for i in range(9):
  a=i*2.399;r=.09*math.sqrt((i+.5)/9);E('leaf', (r*math.cos(a),.075+.008*(i%2),r*math.sin(a)),(.045,.009,.026),'accent' if i%2 else 'prop',seg=8,rings=4)
 for x,z in [(-.045,.02),(.036,.03),(0,-.04)]:E('tomato_half',(x,.09,z),(.023,.016,.023),'accent',seg=12,rings=6)

def spaghetti():
 dish(r=.15,h=.025)
 for k in range(5):
  pts=[]
  for i in range(22):
   a=i*math.tau/10+k*.8;r=.018+i*.0035;pts.append((r*math.cos(a),.026+k*.003,r*math.sin(a)))
  P('pasta_strand_'+str(k),pts,.0035,'prop',sides=5)
 for x,z in [(-.04,.02),(.036,.015),(0,-.038)]:E('meatball',(x,.055,z),(.02,.02,.02),'accent',seg=12,rings=6)

def soup():
 bowl(r=.115,h=.065);disk('soup_surface',.096,.049,.004,mat='accent',N=24)
 for x,z in [(-.03,.015),(.03,.025),(0,-.04)]:B('crouton',(x,.057,z),(.018,.012,.016),.003)
 for s in [-1,1]:P('bowl_handle',[(s*.10,.045,-.03),(s*.14,.045,-.03),(s*.14,.045,.03),(s*.10,.045,.03)],.007)

def eggcarton():
 B('pulp_base',(0,.017,0),(.26,.033,.16),.014,'accent')
 for x in [-.08,0,.08]:
  for z in [-.04,.04]:L('egg_cup',[(0,0),(.032,0),(.038,.04),(.031,.045),(.025,.012),(0,.012)],(x,.018,z),N=12);E('egg',(x,.061,z),(.027,.039,.027),seg=12,rings=8)
 B('open_lid',(0,.106,-.108),(.26,.15,.015),.012,'accent')

def watermelon():
 E('whole_melon',(0,.12,0),(.18,.12,.12),seg=24,rings=12)
 for i in range(6):
  a=i*math.tau/6;pts=[]
  for j in range(13):
   t=-math.pi*.45+j*math.pi*.90/12;pts.append((.18*math.sin(t),.12+.1205*math.cos(t)*math.cos(a),.1205*math.cos(t)*math.sin(a)))
  P('rind_stripe',pts,.003,'accent',sides=4)
 outline=[(.095*math.cos(math.pi-i*math.pi/16),.095*math.sin(math.pi-i*math.pi/16)) for i in range(17)]
 profile_extrude('cut_melon_rind',outline,.03,(.21,0,.16),bevel=.002)
 inside=[(.082*math.cos(math.pi-i*math.pi/16),.082*math.sin(math.pi-i*math.pi/16)+.003) for i in range(17)]
 profile_extrude('cut_melon_flesh',inside,.002,(.21,0,.177),'accent',bevel=.001)
 for a in [.4,.85,1.3,1.85,2.3,2.7]:E('melon_seed',(.21+.053*math.cos(a),.053*math.sin(a)+.003,.180),(.002,.004,.001),'prop',seg=8,rings=4)

def pineapple():
 E('pineapple_body',(0,.105,0),(.065,.105,.065),seg=16,rings=10)
 for direction in [-1,1]:
  for i in range(6):
   pts=[]
   for j in range(11):
    t=-1.32+j*2.64/10;a=i*math.tau/6+direction*t*1.1;r=.065*math.cos(t)+.0008
    pts.append((r*math.cos(a),.105+.105*math.sin(t),r*math.sin(a)))
   P('diamond_rind_seam',pts,.0018,'accent',sides=4)
 for i in range(7):
  a=i*math.tau/7;x=.06*math.cos(a);z=.06*math.sin(a);tx=-.012*math.sin(a);tz=.012*math.cos(a)
  mesh('crown_leaf',[(0,.192,0),(x*.35+tx,.25,z*.35+tz),(x,.31,z),(x*.35-tx,.25,z*.35-tz),(x*.35,.252,z*.35)],[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(0,3,2,1)],'accent')

def grapes():
 # Broad shoulders hang below the branch; the bunch tapers toward one lower grape.
 for row,(count,r,y) in enumerate([(6,.029,.105),(5,.024,.079),(3,.017,.052),(1,0,.024)]):
  for i in range(count):
   a=i*math.tau/count+row*.7;E('grape_%d_%d'%(row,i),(r*math.cos(a),y,r*math.sin(a)),(.019,.020,.019),seg=10,rings=6)
 P('branch',[(0,.111,0),(.007,.14,0),(.035,.15,.008)],.004,'accent')

def vegcrate():
 B('crate_floor',(0,.012,0),(.45,.024,.31),.006)
 for x in [-.213,.213]:
  for z in [-.142,.142]:B('corner_post',(x,.10,z),(.025,.18,.025),.005,'accent')
 for y in [.06,.115,.17]:
  for z in [-.145,.145]:B('side_slat',(0,y,z),(.45,.035,.018),.004)
  for x in [-.215,.215]:B('end_slat',(x,y,0),(.018,.035,.29),.004)
 for i in range(5):
  x=(i-2)*.077;E('cabbage',(x,.16,-.045),(.044,.041,.041),'accent',seg=10,rings=6);E('carrot',(x,.13,.07),(.017,.021,.09),seg=10,rings=6)

def winerack():
 for x in [-.24,.24]:B('frame_upright',(x,.24,0),(.045,.48,.25),.009)
 for y in [.025,.24,.46]:B('cross_shelf',(0,y,0),(.49,.025,.25),.006)
 for x in [-.14,0,.14]:
  for y in [.09,.31]:
   C('bottle_body',(x,y,-.12),(x,y,.08),.045,'accent',N=16);C('bottle_neck',(x,y,.08),(x,y,.17),.017,'accent',N=12);C('cork',(x,y,.17),(x,y,.184),.018,N=12)

def beerkeg():
 L('steel_keg',[(0,0),(.16,0),(.18,.035),(.19,.13),(.19,.43),(.18,.5),(.16,.53),(0,.53)],N=28)
 for y in [.035,.145,.39,.50]:R('reinforcement_hoop',(0,y,0),.187,.009,'accent',N=24)
 disk('coupler',.035,.53,.022,mat='accent',N=16)
 for x in [-.085,.085]:B('handle_recess',(x,.526,0),(.075,.006,.045),.013,'accent')

def sushi():
 B('serving_board',(0,.01,0),(.34,.02,.22),.015)
 for x in [-.10,0,.10]:
  for z in [-.055,.055]:
   L('nori_roll',[(0,0),(.032,0),(.032,.04),(0,.04)],(x,.02,z),'accent',N=16);disk('rice_top',.027,.061,.005,(x,z),N=16);B('filling',(x,.067,z),(.018,.003,.018),.003,'accent')
 P('chopstick_1',[(-.14,.025,-.09),(.13,.025,-.10)],.003,'accent');P('chopstick_2',[(-.14,.025,-.075),(.13,.025,-.08)],.003,'accent')

def cheeseboard():
 B('board',(0,.012,0),(.34,.024,.26),.024);B('handle',(0,.012,-.17),(.075,.024,.10),.012)
 sector('cheese_wedge',.085,.024,.055,math.pi*.05,math.pi*.65,mat='accent')
 for x,z,r in [(.045,.04,.009),(.025,.055,.007),(.061,.015,.006)]:disk('cheese_hole',r,.08,.001,(x,z),'prop',N=12)
 for x in [-.09,-.05,-.01]:disk('cracker',.027,.024,.005,(x,-.06),N=12)
 for i in range(5):E('grape',(-.10+(i%2)*.024,.045,.035+i*.015),(.014,.015,.014),'accent',seg=10,rings=6)

def standmixer():
 B('foot',(0,.018,0),(.22,.036,.29),.018);B('motor_column',(0,.17,-.085),(.11,.30,.12),.025)
 B('mixer_head',(0,.335,.005),(.145,.095,.28),.035);C('planetary_hub',(0,.269,.075),(0,.29,.075),.033,'accent',N=16)
 bowl('mixing_bowl',.103,.115,(0,.035,.057),'accent');C('beater_shaft',(0,.15,.075),(0,.272,.075),.005,N=8)
 for s in [-1,1]:P('whisk_wire',[(0,.25,.075),(s*.037,.18,.075),(s*.025,.10,.075),(0,.09,.075)],.003)
 B('speed_slider',(.076,.338,-.005),(.005,.018,.09),.003,'accent')

def ricecooker():
 L('cooker_body',[(0,.025),(.12,.025),(.135,.07),(.13,.19),(.11,.205),(0,.205)],N=28);L('lid',[(0,.205),(.132,.205),(.13,.225),(.09,.24),(0,.24)],mat='accent',N=28)
 B('lid_handle',(0,.251,0),(.10,.022,.04),.009)
 for x in [-.137,.137]:B('side_handle',(x,.16,0),(.05,.025,.07),.008,'accent')
 B('control_panel',(0,.11,.132),(.075,.06,.008),.007,'accent');B('cook_switch',(0,.10,.141),(.035,.015,.013),.003)
 for x in [-.08,.08]:B('foot',(x,.012,0),(.04,.025,.10),.006,'accent')

def spicerack():
 for x in [-.19,.19]:B('rack_side',(x,.15,0),(.02,.30,.12),.006)
 for y in [.015,.155]:
  B('shelf',(0,y,0),(.40,.02,.12),.005);P('front_rail',[(-.19,y+.055,.06),(.19,y+.055,.06)],.006,'accent')
  for x in [-.13,-.043,.043,.13]:
   C('spice_jar',(x,y+.01,0),(x,y+.105,0),.029,N=16);C('jar_lid',(x,y+.103,0),(x,y+.12,0),.031,'accent',N=16);B('blank_label',(x,y+.058,.03),(.035,.035,.003),.003,'accent')

def dishrack():
 B('drain_tray',(0,.008,0),(.40,.016,.30),.012,'accent')
 for x in [-.18,.18]:P('end_frame',[(x,.02,-.13),(x,.14,-.13),(x,.14,.13),(x,.02,.13)],.005)
 for z in [-.13,.13]:P('side_rail',[(-.18,.09,z),(.18,.09,z)],.005)
 for x in [-.13,-.065,0,.065,.13]:P('plate_divider',[(x,.02,-.12),(x,.11,-.10),(x,.11,.10),(x,.02,.12)],.004)
 for x in [-.065,0,.065]:C('upright_plate',(x-.005,.13,0),(x+.005,.13,0),.10,'accent',N=24)

def nailpolish():
 B('glass_bottle',(0,.025,0),(.032,.05,.026),.007,'accent');C('tapered_cap',(0,.05,0),(0,.095,0),.013,'prop',r2=.01,N=16);label('label',.021,.02,.014,.025)

def makeup():
 B('palette_base',(0,.006,0),(.13,.012,.085),.005);B('tray',(0,.013,0),(.118,.003,.074),.003,'accent')
 for x in [-.04,0,.04]:
  for z in [-.02,.02]:disk('powder_pan',.014,.015,.003,(x,z),'prop',N=16)
 B('open_lid',(0,.058,-.046),(.13,.105,.010),.005);B('mirror',(0,.06,-.040),(.113,.085,.002),.004,'accent')

def razor():
 P('curved_handle',[(0,.01,.07),(0,.012,.02),(0,.025,-.035),(0,.039,-.055)],.009)
 B('pivot_head',(0,.04,-.06),(.047,.018,.023),.006,'accent')
 for z in [-.066,-.060,-.054]:B('blade',(0,.050,z),(.040,.002,.0018),.0005)
 B('grip_insert',(0,.02,.028),(.010,.003,.06),.003,'accent')

def toothbrush():
 P('ergonomic_handle',[(0,.006,.08),(0,.007,.01),(0,.01,-.045),(0,.012,-.07)],.006)
 B('brush_head',(0,.012,-.088),(.016,.009,.038),.006)
 for x in [-.005,0,.005]:
  for z in [-.100,-.092,-.084,-.076]:C('bristle_cluster',(x,.016,z),(x,.025,z),.0018,'accent',N=6)
 B('rubber_grip',(0,.012,.025),(.008,.003,.07),.003,'accent')

def deodorant():
 o=L('oval_container',[(0,0),(.018,0),(.023,.005),(.024,.012),(.024,.082),(.023,.091),(0,.091)],N=24);o.scale.y=.625
 o=L('fitted_cap',[(0,.092),(.023,.092),(.024,.096),(.024,.115),(.021,.124),(0,.128)],mat='accent',N=24);o.scale.y=.625
 B('twist_wheel',(0,.005,.016),(.032,.007,.004),.003,'accent');label('label',.032,.046,.016,.054)

def proteintub():
 L('tub',[(0,0),(.065,0),(.073,.012),(.073,.17),(.065,.18),(0,.18)],N=24);C('screw_lid',(0,.178,0),(0,.20,0),.076,'accent',N=24);L('label_band',[(.0731,.035),(.0731,.15),(.074,.15),(.074,.035)],mat='accent',N=24)

def pouch(kind):
 if kind=='chocolate-bar':
  B('foil_wrapper',(0,.007,0),(.085,.014,.18),.004,'accent');B('paper_sleeve',(0,.015,.028),(.086,.002,.12),.001)
  for x in [-.021,.021]:
   for z in [-.062,-.025]:B('chocolate_square',(x,.018,z),(.037,.008,.031),.004)
  B('crimp',(0,.007,.094),(.09,.011,.008),.002);return
 w,h,d=(.12,.21,.07) if kind=='coffee-bag' else (.15,.23,.06)
 profile_extrude('puffed_pouch',[(-w*.43,0),(w*.43,0),(w*.52,h*.35),(w*.43,h),(-w*.43,h),(-w*.52,h*.35)],d,bevel=.012)
 for y in [.006,h-.006]:B('heat_seal',(0,y,0),(w*.96,.012,d*.60),.003,'accent')
 label('raised_label',w*.62,h*.46,d/2+.002,h*.51)
 if kind=='coffee-bag':C('valve',(0,h*.79,d/2),(0,h*.79,d/2+.004),.009,'accent',N=12)

def drone():
 B('central_fuselage',(0,.06,0),(.13,.075,.18),.028);B('battery',(0,.103,-.025),(.075,.015,.09),.007,'accent')
 for sx in [-1,1]:
  for sz in [-1,1]:
   x=sx*.19;z=sz*.15;P('folding_arm',[(sx*.045,.06,sz*.055),(x,.075,z)],.014,'accent');C('motor',(x,.07,z),(x,.105,z),.023,N=16)
   B('propeller',(x,.109,z),(.17,.006,.018),.007,'accent');C('hub',(x,.108,z),(x,.119,z),.008,N=12)
 for x in [-.06,.06]:P('landing_skid',[(x,.045,-.07),(x,0,-.07),(x,0,.08),(x,.045,.08)],.006,'accent')
 B('camera',(0,.035,.103),(.045,.036,.04),.008);C('lens',(0,.035,.12),(0,.035,.133),.014,'accent',N=16)

def actioncamera():
 B('rugged_housing',(0,.025,0),(.065,.05,.03),.008);B('lens_square',(.015,.028,.018),(.033,.033,.008),.006,'accent');C('lens',(.015,.028,.021),(.015,.028,.028),.012,'accent',N=16);R('lens_bezel',(.015,.028,.028),.013,.0015,'prop',axis='z',N=16)
 B('front_status_screen',(-.020,.028,.016),(.018,.018,.003),.003,'accent');B('shutter',(0,.053,0),(.018,.006,.012),.003,'accent');B('mount',(0,-.006,0),(.024,.012,.018),.003)

def powerbank():
 B('battery_pack',(0,.010,0),(.065,.020,.12),.008);B('usb_port',(0,.010,.061),(.014,.006,.002),.001,'accent')
 for x in [-.017,-.006,.006,.017]:E('charge_led',(x,.021,.042),(.002,.0008,.002),'accent',seg=8,rings=4)


def keyboard():
 B('keyboard_base',(0,.008,0),(.44,.016,.145),.008);B('keybed',(0,.018,0),(.424,.004,.13),.004,'accent')
 for row in range(4):
  for col in range(12):B('key_%d_%d'%(row,col),((col-5.5)*.034,.025,-.047+row*.027),(.029,.009,.022),.002)
 B('space_bar',(-.03,.025,.061),(.15,.009,.02),.003)
 for x in [-.18,-.145,.095,.13,.165]:B('modifier_key',(x,.025,.061),(.026,.009,.02),.003)

def mouse():
 E('lower_shell',(0,.007,0),(.033,.007,.054),'accent',seg=20,rings=8)
 E('ergonomic_shell',(0,.025,0),(.034,.024,.057),seg=20,rings=10)
 pts=[]
 for z in [-.045,-.025,.002]:pts.append((0,.025+.024*math.sqrt(1-(z/.057)**2)+.0004,z))
 P('button_seam',pts,.0012,'accent',sides=4)
 C('scroll_wheel',(-.004,.047,-.024),(.004,.047,-.024),.010,'accent',N=12)


def ringbox():
 B('velvet_base',(0,.018,0),(.07,.036,.065),.010);B('velvet_insert',(0,.039,0),(.057,.006,.052),.006,'accent');B('open_lid',(0,.065,-.035),(.07,.067,.016),.008)
 B('lid_lining',(0,.067,-.024),(.055,.05,.005),.006,'accent');R('engagement_ring',(0,.056,0),.014,.0025,'prop',axis='z',N=20)
 E('gem',(0,.073,0),(.006,.006,.006),'accent',seg=8,rings=4)

def necklacebust():
 B('plinth',(0,.014,0),(.22,.028,.15),.012,'accent')
 profile_extrude('display_bust',[(-.11,.035),(.11,.035),(.15,.20),(.11,.27),(.048,.29),(.04,.37),(-.04,.37),(-.048,.29),(-.11,.27),(-.15,.20)],.10,bevel=.025)
 P('necklace',[(0,.31,.056),(-.065,.265,.057),(-.075,.19,.06),(0,.12,.063),(.075,.19,.06),(.065,.265,.057),(0,.31,.056)],.003,'accent')
 E('pendant',(0,.12,.069),(.014,.019,.006),'accent',seg=12,rings=6)

# Dispatch is intentionally explicit: a missing model cannot silently become a box.
BUILDERS={
 'soda-can':cans,'takeaway-coffee':coffee,'mug':mug,'teapot':teapot,'jug':jug,
 'plate':lambda:dish(),'bowl':lambda:bowl(),'cutlery-set':cutlery,'cutting-board':cutting_board,
 'pizza':lambda:pizza(False),'pizza-slice':lambda:pizza(True),'pizza-box':pizza_box,'burger':burger,'sandwich':sandwich,'hot-dog':hotdog,'fries':fries,
 'apple':lambda:apple(),'banana':banana,'orange':lambda:orange(),'fruit-bowl':fruit_bowl,'bread-loaf':lambda:bread(False),'baguette':lambda:bread(True),'croissant':croissant,
 'cake':lambda:cake(False),'cupcake':cupcake,'donut':donut,'ice-cream-cone':icecream,'popcorn-bucket':popcorn,'jar':jar,'salt-and-pepper':saltpepper,'takeaway-bag':lambda:paperbag(False),'takeout-box':takeout,'food-tray':tray,
 'coffee-machine':coffee_machine,'kettle':kettle,'toaster':toaster,'microwave':microwave,'kitchen-blender':blender,'saucepan':lambda:pan(False),'frying-pan':lambda:pan(True),
 'perfume-bottle':perfume,'cosmetic-jar':cosmetic,'lipstick':lipstick,'skincare-tube':lambda:tube(),'pump-bottle':pump,'sneaker':sneaker,'high-heel':highheel,'handbag':handbag,'watch':lambda:watch(),'watch-stand':lambda:watch(stand=True),'sunglasses':sunglasses,'headphones':headphones,'earbuds-case':earbuds,'laptop':laptop,'smartwatch':lambda:watch(smart=True),'game-controller':controller,'vr-headset':vr,'smart-speaker':speaker,'tv-remote':remote,'credit-card':credit,'gift-box':gift,'shopping-bag':lambda:paperbag(True),'product-box':productbox,'standing-mirror':standingmirror,
 'birthday-cake':lambda:cake(True),'salad-bowl':salad,'spaghetti-plate':spaghetti,'soup-bowl':soup,'egg-carton':eggcarton,'watermelon':watermelon,'pineapple':pineapple,'grapes':grapes,'vegetable-crate':vegcrate,'wine-rack':winerack,'beer-keg':beerkeg,'sushi-tray':sushi,'cheese-board':cheeseboard,
 'stand-mixer':standmixer,'rice-cooker':ricecooker,'spice-rack':spicerack,'dish-rack':dishrack,
 'nail-polish':nailpolish,'makeup-palette':makeup,'razor':razor,'toothbrush':toothbrush,'toothpaste':lambda:tube('toothpaste'),'deodorant':deodorant,'protein-tub':proteintub,'drone':drone,'action-camera':actioncamera,'power-bank':powerbank,'keyboard':keyboard,'computer-mouse':mouse,'ring-box':ringbox,'necklace-bust':necklacebust,
}
for t in 'water-bottle wine-bottle beer-bottle champagne-bottle ketchup-bottle shampoo-bottle spray-can sports-bottle medicine-bottle'.split():BUILDERS[t]=lambda t=t:bottle(t)
for t in 'wine-glass tumbler cocktail-glass'.split():BUILDERS[t]=lambda t=t:drinking_glass(t)
for t in 'cereal-box milk-carton juice-box'.split():BUILDERS[t]=lambda t=t:carton(t)
for t in 'smartphone tablet'.split():BUILDERS[t]=lambda t=t:screen_device(t)
for t in 'product-podium-round product-podium-square product-podium-steps display-riser display-turntable'.split():BUILDERS[t]=lambda t=t:podium(t)
for t in 'coffee-bag chocolate-bar chips-bag'.split():BUILDERS[t]=lambda t=t:pouch(t)

# Authored palm contact points before the root's grounding/centering transform.
GRIPS={
 'water-bottle':(0,.105,0),'wine-bottle':(0,.15,0),'beer-bottle':(0,.11,0),'champagne-bottle':(0,.16,0),'soda-can':(0,.059,0),'takeaway-coffee':(0,.065,0),
 'mug':(.065,.051,0),'wine-glass':(0,.06,0),'tumbler':(0,.05,0),'cocktail-glass':(0,.06,0),'pizza-slice':(0,.015,-.055),'burger':(0,.015,0),'sandwich':(0,.05,0),'hot-dog':(0,.03,0),'fries':(0,.055,0),
 'apple':(0,.037,0),'banana':(-.02,.03,0),'orange':(0,.037,0),'baguette':(0,.035,0),'croissant':(0,.03,.025),'cupcake':(0,.025,0),'donut':(0,.025,-.035),'ice-cream-cone':(0,.07,0),'popcorn-bucket':(0,.07,0),
 'cereal-box':(0,.15,0),'milk-carton':(0,.10,0),'juice-box':(0,.06,0),'jar':(0,.065,0),'ketchup-bottle':(0,.12,0),'takeaway-bag':(0,.277,.043),'takeout-box':(0,.17,0),'food-tray':(.18,.015,0),'frying-pan':(.27,.03,0),
 'perfume-bottle':(0,.055,0),'cosmetic-jar':(0,.03,0),'lipstick':(0,.03,0),'skincare-tube':(0,.07,0),'pump-bottle':(0,.09,0),'shampoo-bottle':(0,.11,0),'spray-can':(0,.09,0),
 'handbag':(0,.33,.047),'watch':(0,.01,-.05),'sunglasses':(-.06,.035,-.04),'headphones':(0,.20,0),'earbuds-case':(0,.018,0),'smartphone':(0,.005,0),'tablet':(0,.005,.065),'game-controller':(-.055,.03,.035),'vr-headset':(0,.06,.02),'tv-remote':(0,.01,.03),'credit-card':(0,.001,0),'gift-box':(0,.08,0),'shopping-bag':(0,.384,.053),
 'nail-polish':(0,.025,0),'makeup-palette':(0,.01,0),'razor':(0,.01,.02),'toothbrush':(0,.008,.015),'toothpaste':(0,.075,0),'deodorant':(0,.055,0),'sports-bottle':(0,.115,0),'coffee-bag':(0,.105,0),'chocolate-bar':(0,.008,.03),'chips-bag':(0,.115,0),'medicine-bottle':(0,.05,0),'action-camera':(0,.026,0),'power-bank':(0,.01,0),'ring-box':(0,.02,0)
}
for t,p in GRIPS.items():CATALOG[t]['grip']=p
# These are table-top/hand-sized objects and use the strict small-object budget.
for t in CATALOG:
 if t not in ['product-podium-round','product-podium-square','product-podium-steps','standing-mirror']:
  CATALOG[t]['budget']=2500
for t in ['smartphone','tablet','tv-remote','watch','credit-card','power-bank']:
 CATALOG[t]['gripQuaternion']=[0,1,0,0]
for t in ['smartphone','tablet']:CATALOG[t]['poses']=['phone-call','read','photo','stand'] if t=='smartphone' else ['read','carry','stand']
for t in ['product-podium-round','product-podium-square','product-podium-steps','display-riser','display-turntable']:
 CATALOG[t]['top']={'product-podium-round':.57,'product-podium-square':.56,'product-podium-steps':.72,'display-riser':.244,'display-turntable':.085}[t]

def build(type):
 if type not in CATALOG or type not in BUILDERS:raise ValueError('Missing authored batch 2 model: '+type)
 BUILDERS[type]()
