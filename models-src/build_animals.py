"""Batch 3: six deliberately simple, species-specific vinyl baby animals.

Run in Blender: import build_animals; build_animals.run()
Or: blender -b --python models-src/build_animals.py
Only the collection owned by this script is replaced. No archived batch is read.
Coordinates are metres, Blender Z up / -Y forward; GLB is Y up / +Z forward.
"""
from pathlib import Path
import argparse
import json
import math
import struct
import sys

import bpy
from mathutils import Vector, Matrix, Euler

BASE = Path(__file__).resolve().parent
MODELS = BASE.parent / 'web' / 'models'
CLIPS = ['stand', 'sit', 'lie', 'walk', 'hop']
SPECS = {
    'baby-chick': ('Baby chick', .30, '#FFDA4C', '#F7A431', ['chick', 'chicken', 'bird', 'baby', 'cute', 'farm']),
    'baby-squirrel': ('Baby squirrel', .36, '#C18D63', '#92633F', ['squirrel', 'baby', 'cute', 'woodland']),
    'puppy': ('Puppy', .40, '#E6C79E', '#B58A61', ['puppy', 'dog', 'doggy', 'baby', 'cute', 'pet']),
    'kitten': ('Kitten', .36, '#B7C5D2', '#D9A2A5', ['kitten', 'cat', 'kitty', 'baby', 'cute', 'pet']),
    'bunny': ('Bunny', .36, '#EDE3D3', '#D3A29D', ['bunny', 'rabbit', 'baby', 'cute', 'pet']),
    'piglet': ('Piglet', .34, '#F0B8BD', '#DC929F', ['piglet', 'pig', 'piggy', 'baby', 'cute', 'farm']),
}


def srgb(s):
    rgb = [int(s[i:i+2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in rgb)


def material(name, color, roughness=.4):
    # Keep names exact even in a live session with unused legacy datablocks.
    old = bpy.data.materials.get(name)
    if old:
        old.name = 'unused-before-animals.' + name
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.diffuse_color = (*srgb(color), 1)
    p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    p.inputs['Base Color'].default_value = m.diffuse_color
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = 0
    return m


def smooth(t):
    t = max(0., min(1., t))
    return t*t*(3-2*t)


class Form:
    """One skin with smooth closed volumes, authored vertex weights, no UVs."""
    def __init__(self):
        self.verts, self.faces, self.mats, self.weights = [], [], [], []

    def add(self, verts, faces, mat, weight):
        start = len(self.verts)
        for p in verts:
            self.verts.append(Vector(p))
            w = weight(p) if callable(weight) else ({weight: 1.} if isinstance(weight, str) else weight)
            self.weights.append(w)
        self.faces.extend(tuple(start+i for i in f) for f in faces)
        self.mats.extend([mat]*len(faces))

    def egg(self, center, radius, weight, mat=0, seg=24, rings=16, rot=(0,0,0), taper=0):
        c, r = Vector(center), Vector(radius)
        R = Euler(tuple(math.radians(a) for a in rot), 'XYZ').to_matrix()
        vs = [c + R @ Vector((0,0,-r.z))]
        for j in range(1, rings):
            t = -math.pi/2 + math.pi*j/rings
            z, rr = math.sin(t), math.cos(t)
            factor = 1 - taper*z
            for i in range(seg):
                a = 2*math.pi*i/seg
                vs.append(c + R @ Vector((r.x*rr*math.cos(a)*factor, r.y*rr*math.sin(a)*factor, r.z*z)))
        vs.append(c + R @ Vector((0,0,r.z)))
        fs = []
        for i in range(seg):
            n=(i+1)%seg
            fs.append((0,1+n,1+i))
        for j in range(rings-2):
            for i in range(seg):
                n=(i+1)%seg; a=1+j*seg+i; b=1+j*seg+n
                fs.append((a,b,b+seg,a+seg))
        top=len(vs)-1; off=1+(rings-2)*seg
        for i in range(seg): fs.append((off+i,off+(i+1)%seg,top))
        self.add(vs, fs, mat, weight)

    def tube(self, points, radii, weight, mat=0, sides=12, steps=4):
        """Catmull-Rom sweep; round caps and variable radius, never fur geometry."""
        P=[Vector(p) for p in points]
        centres=[]; rs=[]
        for k in range(len(P)-1):
            a,b,c,d=P[max(0,k-1)],P[k],P[k+1],P[min(len(P)-1,k+2)]
            for j in range(steps):
                t=j/steps
                centres.append(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t))
                rs.append(radii[k]*(1-t)+radii[k+1]*t)
        centres.append(P[-1]); rs.append(radii[-1])
        # Endpoints use tiny but finite rounded cap rings and pole caps.
        vs=[]
        for k,c in enumerate(centres):
            tangent=(centres[min(k+1,len(centres)-1)]-centres[max(0,k-1)]).normalized()
            axis=Vector((1,0,0))
            if abs(axis.dot(tangent))>.9: axis=Vector((0,1,0))
            u=(axis-tangent*axis.dot(tangent)).normalized(); v=tangent.cross(u)
            for j in range(sides):
                a=2*math.pi*j/sides
                vs.append(c+rs[k]*(math.cos(a)*u+math.sin(a)*v))
        fs=[]
        for k in range(len(centres)-1):
            for j in range(sides): fs.append((k*sides+j,k*sides+(j+1)%sides,(k+1)*sides+(j+1)%sides,(k+1)*sides+j))
        vs.extend([centres[0]-(centres[1]-centres[0]).normalized()*rs[0]*.45,
                   centres[-1]+(centres[-1]-centres[-2]).normalized()*rs[-1]*.6])
        for j in range(sides):
            fs.append((len(vs)-2,(j+1)%sides,j))
            end=(len(centres)-1)*sides
            fs.append((len(vs)-1,end+j,end+(j+1)%sides))
        self.add(vs,fs,mat,weight)


class Animal:
    def __init__(self, ident):
        self.ident=ident; self.form=Form(); self.eyes=[]; self.bones={}
        self.scale=1.; self.offset=Vector((0,0,0)); self.rig=None

    def bone(self,name,head,tail=None,parent='Root'):
        self.bones[name]=(Vector(head),Vector(tail) if tail is not None else Vector(head)+Vector((0,0,.04)),parent)

    def core(self,spine,chest,head):
        self.bone('Root',(0,0,0),(0,0,.04),None)
        self.bone('Spine',spine,parent='Root')
        self.bone('Chest',chest,parent='Spine')
        self.bone('Head',head,parent='Chest')

    def leg(self,name,hip,knee,ankle,parent='Spine'):
        self.bone(name+'.Upper',hip,knee,parent)
        self.bone(name+'.Lower',knee,ankle,name+'.Upper')

    def limb_weights(self,name,low,high):
        def w(p):
            t=smooth((p[2]-low)/(high-low))
            return {name+'.Lower':1-t,name+'.Upper':t}
        return w

    def body_weights(self,low,high,axis=2):
        def w(p):
            t=smooth((p[axis]-low)/(high-low))
            return {'Spine':1-t,'Chest':t}
        return w

    def head_weights(self,p):
        return {'Head':1.}

    def dots(self,x,y,z,r=.012):
        for side in (-1,1):
            e=Form(); e.egg((side*x,y,z),(r,r*.68,r*1.05),'Head',mat=2,seg=20,rings=12)
            self.eyes.append(e)


def chick(a):
    f=a.form
    a.core((0,0,.075),(0,0,.155),(0,0,.205))
    # A single continuous egg volume, softly fuller at the belly.
    def w(p):
        h=smooth((p[2]-.15)/.10)
        c=smooth((p[2]-.065)/.10)*(1-h)
        return {'Spine':max(0,1-h-c),'Chest':c,'Head':h}
    f.egg((0,0,.156),(.116,.098,.144),w,seg=40,rings=28,taper=.035)
    for side,tag in [(-1,'R'),(1,'L')]:
        a.leg('Leg.'+tag,(side*.046,0,.065),(side*.046,-.008,.035),(side*.046,-.02,.011))
        f.egg((side*.048,-.018,.014),(.032,.043,.014),a.limb_weights('Leg.'+tag,.01,.045),mat=1,seg=24,rings=12)
        a.bone('Wing.'+tag,(side*.085,0,.15),parent='Chest')
        f.egg((side*.117,-.001,.157),(.026,.035,.056),'Wing.'+tag,seg=24,rings=16,rot=(0,side*42,0),taper=.20)
    # A short rounded diamond wedge, with one orange tip and no mouth seam.
    vs=[]; fs=[]; seg=16
    sections=[(-.083,.010,.008),(-.090,.022,.015),(-.100,.020,.014),
              (-.111,.013,.009),(-.122,.004,.003)]
    for yy,ww,hh in sections:
        for i in range(seg):
            t=2*math.pi*i/seg; c=math.cos(t); s=math.sin(t)
            vs.append((ww*math.copysign(abs(c)**1.55,c),yy,.192+hh*math.copysign(abs(s)**1.55,s)))
    for j in range(len(sections)-1):
        for i in range(seg):
            fs.append((j*seg+i,j*seg+(i+1)%seg,(j+1)*seg+(i+1)%seg,(j+1)*seg+i))
    vs.extend([(0,-.081,.192),(0,-.124,.192)])
    for i in range(seg):
        fs.append((len(vs)-2,(i+1)%seg,i))
        fs.append((len(vs)-1,(len(sections)-1)*seg+i,(len(sections)-1)*seg+(i+1)%seg))
    f.add(vs,fs,1,'Head')
    a.dots(.043,-.0845,.216,.012)


def squirrel(a):
    f=a.form
    a.core((0,.025,.085),(0,-.005,.155),(0,-.025,.222))
    f.egg((0,.025,.127),(.094,.087,.111),a.body_weights(.07,.20),seg=32,rings=20,taper=.20)
    f.egg((0,-.032,.239),(.096,.081,.094),'Head',seg=32,rings=20)
    for side,tag in [(-1,'R'),(1,'L')]:
        a.leg('Hind.'+tag,(side*.058,.045,.09),(side*.069,.025,.042),(side*.069,-.005,.02))
        f.egg((side*.066,.014,.029),(.043,.057,.029),a.limb_weights('Hind.'+tag,.02,.07),seg=20,rings=12)
        a.leg('Fore.'+tag,(side*.059,-.035,.177),(side*.066,-.066,.146),(side*.047,-.075,.122),'Chest')
        f.egg((side*.061,-.067,.146),(.022,.025,.043),a.limb_weights('Fore.'+tag,.12,.17),seg=20,rings=12,rot=(0,side*-18,0))
        a.bone('Ear.'+tag,(side*.066,-.025,.30),parent='Head')
        f.egg((side*.069,-.023,.326),(.027,.023,.032),'Ear.'+tag,seg=20,rings=12)
    a.bone('Tail',(0,.072,.068),(0,.155,.18),'Spine')
    a.bone('Tail.Tip',(0,.155,.18),(0,.15,.29),'Tail')
    def tw(p):
        t=smooth((p[2]-.10)/.16)
        return {'Tail':1-t,'Tail.Tip':t}
    f.tube([(0,.072,.067),(0,.147,.095),(0,.187,.184),(0,.174,.255),(0,.132,.296),(0,.088,.302)],
           [.034,.053,.060,.055,.037,.010],tw,sides=20,steps=6)
    f.egg((0,-.111,.227),(.013,.011,.010),'Head',mat=1,seg=16,rings=10)
    a.dots(.037,-.104,.254,.0105)


def quadruped(a,kind):
    f=a.form
    if kind=='puppy':
        body=(.122,.165,.118); bc=(0,.031,.142); hc=(0,-.118,.277); hr=(.126,.113,.123)
        legx=.075; hindy=.110; forey=-.065; legz=.060; head_drop=.027
    elif kind=='kitten':
        body=(.104,.143,.102); bc=(0,.025,.126); hc=(0,-.105,.237); hr=(.113,.098,.108)
        legx=.060; hindy=.100; forey=-.055; legz=.052; head_drop=.015
    else:
        body=(.133,.169,.121); bc=(0,.029,.140); hc=(0,-.116,.232); hr=(.123,.106,.103)
        legx=.078; hindy=.112; forey=-.070; legz=.060; head_drop=.015
    a.core((0,.075,bc[2]),(0,-.055,bc[2]+.015),(0,hc[1],hc[2]-.018))
    f.egg(bc,body,a.body_weights(.12,-.10,axis=1),seg=32,rings=20)
    f.egg(hc,hr,'Head',seg=32,rings=20)
    for side,tag in [(-1,'R'),(1,'L')]:
        for name,yy,parent in [('Fore',forey,'Chest'),('Hind',hindy,'Spine')]:
            leg=name+'.'+tag
            a.leg(leg,(side*legx,yy,legz*2),(side*legx,yy,legz),(side*legx,yy-.010,.018),parent)
            f.egg((side*legx,yy,legz),(.039 if kind=='kitten' else .045,.047 if kind=='kitten' else .052,legz),a.limb_weights(leg,legz*.65,legz*1.5),seg=20,rings=12)
        if kind=='puppy':
            a.bone('Ear.'+tag,(side*.101,-.092,.330),parent='Head')
            f.egg((side*.125,-.088,.272),(.044,.046,.090),'Ear.'+tag,mat=1,seg=24,rings=16,rot=(0,side*-10,side*-8),taper=-.20)
        elif kind=='kitten':
            a.bone('Ear.'+tag,(side*.070,-.101,.299),parent='Head')
            f.egg((side*.078,-.095,.326),(.040,.031,.056),'Ear.'+tag,seg=24,rings=16,rot=(0,side*13,0),taper=.68)
        else:
            a.bone('Ear.'+tag,(side*.081,-.077,.292),parent='Head')
            # Two soft folded flaps, no inner-ear inset or markings.
            f.egg((side*.091,-.083,.315),(.042,.035,.039),'Ear.'+tag,seg=20,rings=14,rot=(28,side*32,side*14),taper=.57)
    if kind=='puppy':
        a.bone('Tail',(0,.163,.214),(0,.219,.245),'Spine')
        f.egg((0,.207,.239),(.023,.062,.024),'Tail',seg=20,rings=12,rot=(23,0,0),taper=.15)
        f.egg((0,-.229,.262),(.019,.014,.014),'Head',mat=1,seg=20,rings=12)
        a.dots(.047,-.218,.298,.012)
    elif kind=='kitten':
        a.bone('Tail',(0,.139,.15),(0,.205,.22),'Spine')
        a.bone('Tail.Tip',(0,.205,.22),(.015,.217,.30),'Tail')
        def tw(p):
            t=smooth((p[2]-.18)/.10); return {'Tail':1-t,'Tail.Tip':t}
        f.tube([(0,.139,.16),(0,.204,.176),(.008,.245,.231),(.016,.231,.288),(.010,.191,.305),(-.003,.171,.293)],
               [.021,.021,.019,.018,.016,.006],tw,sides=12,steps=5)
        f.egg((0,-.202,.230),(.013,.010,.009),'Head',mat=1,seg=16,rings=10)
        a.dots(.042,-.192,.254,.0105)
    else:
        a.bone('Tail',(0,.183,.191),(0,.230,.22),'Spine')
        points=[(0,.177,.198),(0,.218,.21)]
        for i in range(20):
            t=i/19*math.pi*2.0
            points.append((.019*math.sin(t),.226+i*.0003,.229-.019*math.cos(t)))
        f.tube(points,[.009]*(len(points)-1)+[.004],'Tail',mat=1,sides=10,steps=2)
        # A single flat oval snout. No nostril dots, mouth, or muzzle patch.
        f.egg((0,-.221,.216),(.047,.018,.031),'Head',mat=1,seg=28,rings=16)
        a.dots(.045,-.209,.255,.011)
    # Nest the large head into the low loaf instead of perching it over long legs.
    for form in [f]+a.eyes:
        for v,weights in zip(form.verts,form.weights):
            if all(b=='Head' or b.startswith('Ear.') for b in weights): v.z-=head_drop
    for name,(h,t,parent) in a.bones.items():
        if name=='Head' or name.startswith('Ear.'):
            h.z-=head_drop; t.z-=head_drop


def bunny(a):
    f=a.form
    a.core((0,.022,.070),(0,0,.126),(0,-.037,.197))
    f.egg((0,.025,.103),(.100,.089,.095),a.body_weights(.055,.17),seg=32,rings=20)
    f.egg((0,-.037,.202),(.089,.078,.087),'Head',seg=32,rings=20)
    for side,tag in [(-1,'R'),(1,'L')]:
        a.leg('Hind.'+tag,(side*.06,.035,.080),(side*.068,.014,.036),(side*.068,-.017,.018))
        f.egg((side*.068,.003,.025),(.041,.054,.025),a.limb_weights('Hind.'+tag,.015,.07),seg=20,rings=12)
        a.leg('Fore.'+tag,(side*.052,-.031,.132),(side*.056,-.064,.102),(side*.049,-.074,.080),'Chest')
        f.egg((side*.054,-.065,.102),(.022,.027,.039),a.limb_weights('Fore.'+tag,.08,.13),seg=20,rings=12)
        a.bone('Ear.'+tag,(side*.037,-.025,.257),parent='Head')
        f.egg((side*.048,-.021,.318),(.025,.023,.081),'Ear.'+tag,seg=24,rings=18,rot=(-4,side*10,0),taper=.10)
    a.bone('Tail',(0,.086,.071),parent='Spine')
    f.egg((0,.105,.075),(.035,.035,.035),'Tail',seg=20,rings=14)
    f.egg((0,-.114,.193),(.011,.010,.008),'Head',mat=1,seg=16,rings=10)
    a.dots(.033,-.106,.217,.010)


def clean_owned():
    c=bpy.data.collections.get('Batch3.Animal')
    if c:
        for o in list(c.objects): bpy.data.objects.remove(o,do_unlink=True)
        bpy.data.collections.remove(c)
    for action in list(bpy.data.actions):
        if action.get('batch3_animal'): bpy.data.actions.remove(action)


def mesh_object(name,form,mats,col,rig):
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(form.verts,[],form.faces); mesh.update()
    o=bpy.data.objects.new(name,mesh); col.objects.link(o)
    for m in mats: mesh.materials.append(m)
    for p,idx in zip(mesh.polygons,form.mats): p.material_index=idx; p.use_smooth=True
    for bone in rig.data.bones: o.vertex_groups.new(name=bone.name)
    for i,weights in enumerate(form.weights):
        total=sum(weights.values())
        for b,w in weights.items():
            if w>1e-7: o.vertex_groups[b].add([i],w/total,'REPLACE')
    o.parent=rig
    mod=o.modifiers.new('Soft skin','ARMATURE'); mod.object=rig
    return o


def materialize(a):
    clean_owned()
    col=bpy.data.collections.new('Batch3.Animal'); bpy.context.scene.collection.children.link(col)
    forms=[a.form]+a.eyes
    points=[v for f in forms for v in f.verts]
    lo=Vector(tuple(min(v[i] for v in points) for i in range(3)))
    hi=Vector(tuple(max(v[i] for v in points) for i in range(3)))
    a.scale=SPECS[a.ident][1]/(hi.z-lo.z)
    a.offset=Vector((-(hi.x+lo.x)/2,-(hi.y+lo.y)/2,-lo.z))
    for f in forms: f.verts=[(v+a.offset)*a.scale for v in f.verts]
    arm=bpy.data.armatures.new('Natural skeleton.'+a.ident)
    rig=bpy.data.objects.new('AnimalRig',arm); col.objects.link(rig)
    rig['animal']=a.ident; rig['forward']='+Z in GLB; -Y in Blender'
    rig['batch3_animal']=True
    bpy.ops.object.select_all(action='DESELECT'); rig.select_set(True); bpy.context.view_layer.objects.active=rig
    bpy.ops.object.mode_set(mode='EDIT')
    for name,(h,t,parent) in a.bones.items():
        b=arm.edit_bones.new(name)
        b.head=(h+a.offset)*a.scale; b.tail=(t+a.offset)*a.scale
        if name=='Root': b.head=(0,0,0); b.tail=(0,0,.04*a.scale)
        if parent: b.parent=arm.edit_bones[parent]
        b.use_deform=True
        if name=='Head' and a.ident!='baby-chick': b.inherit_scale='NONE'
    bpy.ops.object.mode_set(mode='OBJECT')
    rig.show_in_front=True; a.rig=rig
    mats=[material('body',SPECS[a.ident][2]),material('accent',SPECS[a.ident][3]),material('eye','#18120F',.28)]
    body=mesh_object('Body',a.form,mats,col,rig)
    eyes=[mesh_object('Eye.'+n,f,mats,col,rig) for n,f in zip(['R','L'],a.eyes)]
    a.meshes=[body]+eyes
    return rig


def transform(a,name,move=(0,0,0),rotate=(0,0,0),scale=(1,1,1)):
    if name not in a.rig.pose.bones: return
    p=a.rig.pose.bones[name]
    B=p.bone.matrix_local.to_3x3(); inv=B.inverted()
    R=Euler(tuple(math.radians(v) for v in rotate),'XYZ').to_matrix()
    S=Matrix.Diagonal(Vector(scale))
    p.matrix_basis=Matrix.Translation(inv@(Vector(move)*a.scale)) @ (inv@R@S@B).to_4x4()


def bounds(a):
    bpy.context.view_layer.update(); dg=bpy.context.evaluated_depsgraph_get()
    lo=Vector((math.inf,)*3); hi=Vector((-math.inf,)*3)
    for o in a.meshes:
        ev=o.evaluated_get(dg); m=ev.to_mesh()
        for v in m.vertices:
            p=ev.matrix_world@v.co
            for i in range(3): lo[i]=min(lo[i],p[i]); hi[i]=max(hi[i],p[i])
        ev.to_mesh_clear()
    return lo,hi


def limb_contact(a,names,belly=False):
    """Place visible resting paws on the same support plane as the body.

    These are authored pose corrections, baked into bones, not runtime IK.
    Translating a whole two-bone chain preserves its smooth skin and round paw.
    """
    bpy.context.view_layer.update()
    dg=bpy.context.evaluated_depsgraph_get()
    ev=a.meshes[0].evaluated_get(dg); mesh=ev.to_mesh()
    points=[v.co.copy() for v in mesh.vertices]; ev.to_mesh_clear()
    if belly:
        plane=min(p.z for p,w in zip(points,a.form.weights) if set(w)<= {'Spine','Chest'})-.002*a.scale
    else:
        plane=min(p.z for p in points)
    for name in names:
        low=min(p.z for p,w in zip(points,a.form.weights) if any(b.startswith(name+'.') for b in w))
        p=a.rig.pose.bones[name+'.Upper']
        mat=p.matrix.copy(); mat.translation.z+=plane-low; p.matrix=mat
        bpy.context.view_layer.update()


def pose(a,clip,t=0):
    for p in a.rig.pose.bones: p.matrix_basis=Matrix.Identity(4)
    quad=a.ident in ['puppy','kitten','piglet']
    chickish=a.ident=='baby-chick'
    wave=math.sin(t*2*math.pi); cycle=(1-math.cos(t*2*math.pi))/2
    if clip=='sit':
        if quad:
            transform(a,'Spine',move=(0,0,-.060),rotate=(-18,0,0))
            transform(a,'Chest',move=(0,0,.010),rotate=(13,0,0))
            transform(a,'Head',rotate=(5,0,0))
            for tag in ['L','R']:
                transform(a,'Hind.'+tag+'.Upper',rotate=(55,0,0))
                transform(a,'Hind.'+tag+'.Lower',rotate=(-48,0,0))
                transform(a,'Fore.'+tag+'.Upper',rotate=(5,0,0))
        elif chickish:
            transform(a,'Spine',move=(0,0,-.029),scale=(1.06,1.03,.86))
            transform(a,'Head',rotate=(5,0,0))
            for tag in ['L','R']: transform(a,'Leg.'+tag+'.Upper',rotate=(38,0,0))
        else:
            transform(a,'Spine',move=(0,0,-.025),rotate=(8,0,0),scale=(1.04,1.03,.91))
            transform(a,'Head',rotate=(-8,0,0))
            for tag in ['L','R']:
                transform(a,'Fore.'+tag+'.Upper',rotate=(-27,0,0))
                transform(a,'Hind.'+tag+'.Upper',rotate=(20,0,0))
    elif clip=='lie':
        if quad:
            transform(a,'Spine',move=(0,0,-.075),scale=(1.03,1.03,.91))
            transform(a,'Chest',rotate=(0,0,0))
            transform(a,'Head',move=(0,-.012,-.023),rotate=(5,0,0))
            for tag in ['L','R']:
                transform(a,'Fore.'+tag+'.Upper',rotate=(-72,0,0))
                transform(a,'Fore.'+tag+'.Lower',rotate=(5,0,0))
                transform(a,'Hind.'+tag+'.Upper',rotate=(72,0,0))
                transform(a,'Hind.'+tag+'.Lower',rotate=(-5,0,0))
                transform(a,'Ear.'+tag,rotate=(10,0,0))
        elif chickish:
            transform(a,'Spine',move=(0,0,-.025),scale=(1.12,1.06,.68))
            transform(a,'Head',rotate=(14,0,0))
            for side,tag in [(-1,'R'),(1,'L')]:
                transform(a,'Wing.'+tag,rotate=(0,side*-23,0))
                transform(a,'Leg.'+tag+'.Upper',rotate=(65,0,0))
        else:
            transform(a,'Spine',move=(0,0,-.028),rotate=(62,0,0))
            transform(a,'Chest',rotate=(0,0,0))
            transform(a,'Head',move=(0,-.008,-.005),rotate=(-57,0,0))
            for tag in ['L','R']:
                transform(a,'Fore.'+tag+'.Upper',rotate=(-62,0,0))
                transform(a,'Hind.'+tag+'.Upper',rotate=(-55,0,0))
                transform(a,'Ear.'+tag,rotate=(-85 if a.ident=='bunny' else -5,0,0))
            transform(a,'Tail',rotate=(0,0,0))
    elif clip=='walk':
        wave=math.cos(t*2*math.pi)
        transform(a,'Spine',move=(0,0,.003*cycle),rotate=(0,2.3*wave,0))
        transform(a,'Chest',rotate=(0,-1.2*wave,0))
        transform(a,'Head',rotate=(0,-1.1*wave,0))
        if chickish:
            for s,tag in [(-1,'R'),(1,'L')]:
                transform(a,'Leg.'+tag+'.Upper',rotate=(s*20*wave,0,0))
                transform(a,'Leg.'+tag+'.Lower',rotate=(-s*12*wave,0,0))
                transform(a,'Wing.'+tag,rotate=(s*5*wave,s*5*cycle,0))
        else:
            for s,tag in [(-1,'R'),(1,'L')]:
                for k,name in [(1,'Fore'),(-1,'Hind')]:
                    amount=s*k*wave
                    transform(a,name+'.'+tag+'.Upper',rotate=(amount*(24 if quad else 16),0,0))
                    transform(a,name+'.'+tag+'.Lower',rotate=(-amount*13,0,0))
        transform(a,'Tail',rotate=(0,0,7*wave))
        transform(a,'Tail.Tip',rotate=(0,0,5*wave))
    elif clip=='hop':
        # Grounded, playful squash/stretch bounce required by the per-frame contact rule.
        bounce=math.cos(t*2*math.pi)
        transform(a,'Spine',scale=(1-.045*bounce,1-.035*bounce,1+.075*bounce),rotate=(3*wave,0,0))
        transform(a,'Chest',rotate=(-3*wave,0,0))
        transform(a,'Head',rotate=(-4*wave,0,0))
        for s,tag in [(-1,'R'),(1,'L')]:
            if chickish:
                transform(a,'Wing.'+tag,rotate=(0,s*(12+14*wave),0))
                transform(a,'Leg.'+tag+'.Upper',rotate=(9*wave,0,0))
                transform(a,'Leg.'+tag+'.Lower',rotate=(-9*wave,0,0))
            else:
                for k,name in [(1,'Fore'),(-1,'Hind')]:
                    transform(a,name+'.'+tag+'.Upper',rotate=(k*12*wave,0,0))
                    transform(a,name+'.'+tag+'.Lower',rotate=(-k*9*wave,0,0))
            transform(a,'Ear.'+tag,rotate=(8*wave,0,s*3*wave))
        transform(a,'Tail',rotate=(10*wave,0,0))
        transform(a,'Tail.Tip',rotate=(8*wave,0,0))
    if quad and clip=='sit':
        limb_contact(a,['Fore.L','Fore.R'])
    elif quad and clip=='lie':
        limb_contact(a,['Fore.L','Fore.R','Hind.L','Hind.R'],belly=True)
    elif not chickish and not quad and clip=='lie':
        limb_contact(a,['Fore.L','Fore.R','Hind.L','Hind.R'],belly=True)
    # Explicitly centre the evaluated skin, including appendages, at every sample.
    lo,hi=bounds(a)
    clearance=.0006 if clip in ['walk','hop'] else 0.
    delta=Vector((-(lo.x+hi.x)/2,-(lo.y+hi.y)/2,-lo.z+clearance))
    p=a.rig.pose.bones['Root']; p.location=p.bone.matrix_local.to_3x3().inverted()@delta
    bpy.context.view_layer.update()


def curves(action):
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                yield from bag.fcurves


def animate(a):
    scene=bpy.context.scene; scene.render.fps=24; scene.frame_start=1; scene.frame_end=25
    a.rig.animation_data_create()
    for clip in CLIPS:
        action=bpy.data.actions.new(clip); action['batch3_animal']=True; action.use_fake_user=True
        a.rig.animation_data.action=action
        frames=range(1,26) if clip in ['walk','hop'] else [1,2]
        for frame in frames:
            scene.frame_set(frame)
            pose(a,clip,(frame-1)/24)
            for p in a.rig.pose.bones:
                p.rotation_mode='QUATERNION'
                p.keyframe_insert('location',frame=frame,group=p.name)
                p.keyframe_insert('rotation_quaternion',frame=frame,group=p.name)
                p.keyframe_insert('scale',frame=frame,group=p.name)
        for fc in curves(action):
            for kp in fc.keyframe_points: kp.interpolation='LINEAR'
        # NLA track names are the exported public contract, independent of action slots.
        slot=a.rig.animation_data.action_slot
        track=a.rig.animation_data.nla_tracks.new(); track.name=clip
        strip=track.strips.new(clip,1,action)
        if hasattr(strip,'action_slot'): strip.action_slot=slot
        track.mute=True
    a.rig.animation_data.action=bpy.data.actions['stand']
    a.rig.animation_data.action_slot=bpy.data.actions['stand'].slots[0]
    scene.frame_set(1); bpy.context.view_layer.update()


def glb_info(path):
    data=path.read_bytes(); n=struct.unpack_from('<I',data,12)[0]; g=json.loads(data[20:20+n])
    triangles=sum(g['accessors'][p['indices']]['count']//3 for m in g['meshes'] for p in m['primitives'])
    return triangles,[x['name'] for x in g.get('animations',[])]


def build(ident,export=True):
    a=Animal(ident)
    if ident=='baby-chick': chick(a)
    elif ident=='baby-squirrel': squirrel(a)
    elif ident=='bunny': bunny(a)
    else: quadruped(a,ident)
    materialize(a); animate(a)
    lo,hi=bounds(a); d=hi-lo
    info={'type':ident,'name':SPECS[ident][0],'file':'animals/'+ident+'.glb',
          'size':[round(d.x,6),round(d.z,6),round(d.y,6)],'triangles':0,
          'clips':CLIPS,'loops':['walk','hop'],'themes':['animals','kids'],
          'tags':SPECS[ident][4],'materials':['body','accent','eye']}
    if export:
        (MODELS/'animals').mkdir(exist_ok=True)
        bpy.ops.object.select_all(action='DESELECT')
        for o in [a.rig]+a.meshes: o.select_set(True)
        bpy.context.view_layer.objects.active=a.rig
        path=MODELS/info['file']
        # Export this rig's five NLA tracks only; legacy orphan actions stay untouched.
        bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,
            export_yup=True,export_animations=True,export_animation_mode='NLA_TRACKS',
            export_force_sampling=True,export_frame_range=False,export_frame_step=1,
            export_skins=True,export_all_influences=False,export_def_bones=True,
            export_materials='EXPORT',export_texcoords=False,export_normals=True,
            export_cameras=False,export_lights=False,export_morph=False,
            export_extras=False,export_optimize_animation_size=False)
        info['triangles'],names=glb_info(path)
        assert sorted(names)==sorted(CLIPS),(ident,names)
        assert info['triangles']<=8000,info
        bpy.ops.wm.save_as_mainfile(filepath=str(BASE/'blender'/('animal-'+ident+'.blend')))
        (BASE/('animal-'+ident+'-metadata.json')).write_text(json.dumps(info,indent=2)+'\n')
        print('ANIMAL_EXPORTED',json.dumps(info))
    return a,info


def update_manifest():
    path=MODELS/'manifest.json'; original=path.read_text(); doc=json.loads(original)
    animals=[json.loads((BASE/('animal-'+i+'-metadata.json')).read_text()) for i in SPECS]
    # Splice only the new top-level member, retaining every existing byte on first write.
    if 'animals' not in doc:
        end=original.rfind('}')
        text=original[:end].rstrip()+',\n  "animals": '+json.dumps(animals,indent=2).replace('\n','\n  ')+'\n}'+original[end+1:]
        path.write_text(text)
    else:
        doc['animals']=animals; path.write_text(json.dumps(doc,indent=2)+'\n')
    now=json.loads(path.read_text())
    assert {k:v for k,v in now.items() if k!='animals'}=={k:v for k,v in doc.items() if k!='animals'}
    return animals


def run(ids=None,manifest=True):
    for ident in ids or SPECS: build(ident)
    if manifest and all((BASE/('animal-'+i+'-metadata.json')).exists() for i in SPECS): update_manifest()


if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--ids',nargs='+',choices=list(SPECS))
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    run(args.ids)
