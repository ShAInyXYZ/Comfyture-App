"""Original clay blockout props. Execute in the open Blender via its MCP.

All authoring coordinates below are the application's X/right, Y/up, Z/front.
The C() mapping makes Blender Z-up and its glTF exporter restores application Y-up.
Every part is newly modelled here; no reference geometry is imported or reused.
"""
import bpy, bmesh, math, json, os, struct
from mathutils import Vector

# the repository: COMFYTURE_ROOT, else the folder above this script, else where Blender runs
ROOT = os.environ.get('COMFYTURE_ROOT') or (os.path.dirname(os.path.dirname(os.path.abspath(__file__))) if '__file__' in globals() else os.getcwd())
SPEC = json.load(open(ROOT+'/models-src/spec/assets.json'))['assets']
BY_TYPE = {a['type']:a for a in SPEC}
MODULES = ['stairs.step', 'fence.post', 'fence.rail']

def C(p): return (p[0], -p[2], p[1])

def material(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color = (0.57,0.66,0.68,1) if name=='prop' else (0.24,0.32,0.35,1)
    m.use_nodes=True
    bs=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    bs.inputs['Base Color'].default_value=m.diffuse_color
    bs.inputs['Roughness'].default_value=.65
    bs.inputs['Metallic'].default_value=0
    return m

def finish(o,name,mat='prop',bevel=0,segments=3,smooth=True):
    o.name=name
    o.data.materials.clear();o.data.materials.append(material(mat))
    bpy.context.view_layer.objects.active=o
    o.select_set(True)
    if bevel:
        m=o.modifiers.new('soft manufactured edge','BEVEL');m.width=bevel;m.segments=segments
        m.limit_method='ANGLE';m.angle_limit=.45
        bpy.ops.object.modifier_apply(modifier=m.name)
    for p in o.data.polygons:p.use_smooth=smooth
    if smooth:
        m=o.modifiers.new('area weighted corner normals','WEIGHTED_NORMAL');m.keep_sharp=True;m.weight=50
        bpy.ops.object.modifier_apply(modifier=m.name)
    for uv in list(o.data.uv_layers):o.data.uv_layers.remove(uv)
    o.select_set(False)
    return o

def box(name,dims,pos,bevel=.015,mat='prop',segments=3):
    bpy.ops.mesh.primitive_cube_add(size=1,location=C(pos));o=bpy.context.object
    o.dimensions=(dims[0],dims[2],dims[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,mat,min(bevel,min(dims)*.44),segments)

def cyl(name,r,h,pos,r2=None,mat='prop',bevel=.008,n=40):
    bpy.ops.mesh.primitive_cone_add(vertices=n,radius1=r,radius2=r if r2 is None else r2,depth=h,location=C(pos))
    return finish(bpy.context.object,name,mat,min(bevel,h*.44,r*.44,(r if r2 is None else r2)*.44),3)

def ball(name,dims,pos,mat='prop',segments=32,rings=20):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,radius=1,location=C(pos))
    o=bpy.context.object;o.scale=(dims[0]/2,dims[2]/2,dims[1]/2)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,mat,0,smooth=True)

def mesh(name,verts,faces,mat='prop',bevel=0):
    me=bpy.data.meshes.new(name);me.from_pydata([C(p) for p in verts],[],faces);me.update()
    o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active=o;o.select_set(True)
    # Consistent outward normals, including authoring-space extrusion profiles.
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
    return finish(o,name,mat,bevel)

def extrude(name,poly,depth,z=0,mat='prop',bevel=.012):
    n=len(poly);verts=[(x,y,z+s*depth/2) for s in (-1,1) for x,y in poly]
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    return mesh(name,verts,faces,mat,min(bevel,depth*.44))

def clean_triangulation(o):
    """Collapse boolean slivers before export; never keep zero-area triangles."""
    bm=bmesh.new();bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7)
    bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=1e-7)
    bmesh.ops.triangulate(bm,faces=list(bm.faces),quad_method='BEAUTY',ngon_method='BEAUTY')
    tiny=[f for f in bm.faces if f.calc_area()<1e-12]
    if tiny:bmesh.ops.delete(bm,geom=tiny,context='FACES_ONLY')
    loose=[e for e in bm.edges if not e.link_faces]
    if loose:bmesh.ops.delete(bm,geom=loose,context='EDGES')
    unused=[v for v in bm.verts if not v.link_edges]
    if unused:bmesh.ops.delete(bm,geom=unused,context='VERTS')
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free();o.data.update()
    mat=o.data.materials[0].name
    finish(o,o.name,mat)

def lathe(name,profile,pos=(0,0,0),mat='prop',n=48,caps=True):
    closed=(profile[0]==profile[-1])
    if closed:profile=profile[:-1];caps=False
    v=[(pos[0]+r*math.cos(2*math.pi*i/n),pos[1]+y,pos[2]+r*math.sin(2*math.pi*i/n)) for r,y in profile for i in range(n)]
    f=[(j*n+i,j*n+(i+1)%n,((j+1)%len(profile))*n+(i+1)%n,((j+1)%len(profile))*n+i) for j in range(len(profile) if closed else len(profile)-1) for i in range(n)]
    if caps:f += [tuple(range(n-1,-1,-1)),tuple((len(profile)-1)*n+i for i in range(n))]
    return mesh(name,v,f,mat)

def rod(name,a,b,r,mat='prop',n=20):
    mid=tuple((a[i]+b[i])/2 for i in range(3)); delta=Vector(C(b))-Vector(C(a))
    o=cyl(name,r,delta.length,mid,mat=mat,bevel=min(r*.22,.008),n=n)
    o.rotation_mode='QUATERNION';o.rotation_quaternion=delta.to_track_quat('Z','Y')
    return o

def fourlegs(w,d,h,t=.045,inset=.035):
    for sx,xname in [(-1,'right'),(1,'left')]:
        for sz,zname in [(-1,'back'),(1,'front')]:
            box('leg_'+zname+'_'+xname,(t,h,t),(sx*(w/2-inset),h/2,sz*(d/2-inset)),.008)

def fence_post(x=0):
    box('post',(.08,1.04,.08),(x,.52,0),.008)
    box('post_cap',(.08,.06,.08),(x,1.07,0),.015)

def rounded_ring(name,r,y,thickness=.025,mat='accent'):
    lathe(name,[(r-thickness,y-.018),(r,y-.018),(r,y+.018),(r-thickness,y+.018),(r-thickness,y-.018)],mat=mat,caps=False)

def build(typ):
    for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
    # Remove orphaned geometry between assets, preserving the two shared materials.
    for me in list(bpy.data.meshes):
        if me.users==0:bpy.data.meshes.remove(me)
    p=BY_TYPE.get(typ,{}).get('defaults',{})
    if typ=='box':box('solid',(.6,.6,.6),(0,.3,0),.035,segments=5)
    elif typ=='cylinder':cyl('solid',.3,.8,(0,.4,0),bevel=.025,n=64)
    elif typ=='sphere':ball('solid',(.7,.7,.7),(0,.35,0),segments=48,rings=32)
    elif typ in ('cone','traffic-cone'):
        r=.25 if typ=='cone' else .14;w=.55 if typ=='cone' else .385
        box('base',(w,.03,w),(0,.015,0),.012)
        if typ=='cone':cyl('cone',r,.67,(0,.365,0),r2=.02,bevel=.008,n=48)
        else:
            # Continuous taper; one contrasting insert band, without decals.
            cy=.03;rr=.14
            for name,hh,mat in [('lower_shell',.29,'prop'),('visibility_band',.14,'accent'),('upper_shell',.24,'prop')]:
                rn=rr-(.14-.03)*hh/.67;cyl(name,rr,hh,(0,cy+hh/2,0),r2=rn,mat=mat,bevel=.003,n=48);cy+=hh;rr=rn
    elif typ=='plane':box('wall',(4,2.6,.12),(0,1.3,0),.018)
    elif typ in ('doorway','window'):
        opening=1 if typ=='doorway' else 1.4;side=(4-opening)/2
        for s in [-1,1]:box('wall_'+('left' if s==1 else 'right'),(side,2.7,.15),(s*(opening+side)/2,1.35,0),.012)
        box('lintel',(opening,.6,.15),(0,2.4,0),.012)
        if typ=='window':
            box('sill_wall',(1.4,.9,.15),(0,.45,0),.012)
            box('sill_cap',(1.4,.04,.21),(0,.92,0),.008)
            for s in [-1,1]:box('jamb_'+str(s),(.045,1.14,.12),(s*.6775,1.51,0),.006,'accent')
            box('window_mullion',(.035,1.14,.075),(0,1.51,0),.005,'accent')
            box('window_transom',(1.31,.035,.075),(0,1.54,0),.005,'accent')
    elif typ=='door':
        for s in [-1,1]:box('frame_'+str(s),(.06,2.16,.1),(s*.48,1.08,0),.008)
        box('frame_header',(.9,.06,.1),(0,2.13,0),.008)
        box('door_slab',(.888,2.094,.045),(0,1.047,0),.009)
        for y,h in [(.45,.63),(1.45,1.02)]:box('recessed_panel_'+str(y),(.68,h,.007),(0,y,.025),.025,'accent')
        # Flush handle remains within the legacy 0.1 m overall depth.
        box('handle_escutcheon',(.032,.13,.012),(-.343,1.02,.031),.009,'accent')
        box('lever',(.09,.018,.018),(-.311,1.045,.041),.008)
    elif typ=='pillar':
        box('plinth',(.65,.12,.65),(0,.06,0),.022)
        cyl('shaft',.265,2.76,(0,1.5,0),r2=.25,bevel=.012,n=48)
        box('capital',(.65,.12,.65),(0,2.94,0),.022)
        cyl('base_collar',.292,.08,(0,.16,0),bevel=.012)
        cyl('capital_collar',.28,.08,(0,2.84,0),bevel=.012)
    elif typ=='arch':
        # Real open arch: paired pier meshes and a continuous voussoir-shaped crown.
        spring=2.15;r=.8
        box('pier_left',(.5,spring,.5),(-1.05,spring/2,0),.016)
        box('pier_right',(.5,spring,.5),(1.05,spring/2,0),.016)
        arc=[(r*math.cos(math.pi*i/32),spring+r*math.sin(math.pi*i/32)) for i in range(33)]
        poly=[(-1.3,spring),(-1.3,3.2),(1.3,3.2),(1.3,spring)]+arc
        extrude('arch_crown',poly,.5,bevel=.012)
    elif typ=='stairs':
        for i in range(5):
            h=.18*(i+1);z=-.6+.3*i;box('riser_%02d'%(i+1),(1,h,.3),(0,h/2,z),.009)
            # Tread highlight sits within the original top and footprint.
            box('tread_%02d'%(i+1),(.95,.018,.272),(0,h-.009,z+.002),.006,'accent')
    elif typ=='stairs.step':
        box('riser',(1,.18,.3),(0,.09,0),.009)
        box('tread',(.95,.018,.272),(0,.171,.002),.006,'accent')
    elif typ=='ramp':
        v=[(-.6,0,-1),(.6,0,-1),(-.6,0,1),(.6,0,1),(-.6,.6,-1),(.6,.6,-1)]
        ramp=mesh('ramp',v,[(0,2,3,1),(0,1,5,4),(0,4,2),(1,3,5),(2,4,5,3)],bevel=.006)
        # Keep the analytic wedge's envelope after rounding its knife edges.
        for axis,(lo,hi) in enumerate([(-.6,.6),(-1,1),(0,.6)]):
            mn=min(v.co[axis] for v in ramp.data.vertices);mx=max(v.co[axis] for v in ramp.data.vertices)
            for v in ramp.data.vertices:v.co[axis]=lo+(v.co[axis]-mn)*(hi-lo)/(mx-mn)
        ramp.data.update()
    elif typ=='platform':
        box('base',(2,.08,2),(0,.04,0),.014)
        box('core',(1.98,.25,1.98),(0,.205,0),.012)
        box('top',(2,.07,2),(0,.365,0),.014)
        for s in [-1,1]:box('side_inset_'+str(s),(1.86,.12,.014),(0,.16,s*.993),.014,'accent')
    elif typ=='floor':box('floor',(3,.012,2),(0,.006,0),.002)
    elif typ=='fence':
        for x in [-1.2,-.4,.4,1.2]:fence_post(x)
        for y in [.418,.902]:box('rail_'+str(y),(2.4,.07,.04),(0,y,0),.008)
    elif typ=='fence.post':fence_post()
    elif typ=='fence.rail':box('rail',(.8,.07,.04),(0,.035,0),.008)
    elif typ=='chair':
        box('seat',(.46,.055,.46),(0,.4325,0),.022,segments=4)
        fourlegs(.46,.46,.405,.04,.025)
        for s in [-1,1]:box('back_stile_'+str(s),(.035,.45,.04),(s*.2025,.675,-.205),.01)
        box('backrest',(.46,.275,.05),(0,.7625,-.205),.023,segments=4)
        rod('back_crossbar',(-.195,.555,-.205),(.195,.555,-.205),.012)
    elif typ in ('armchair','sofa'):
        w=.9 if typ=='armchair' else 2;d=.85 if typ=='armchair' else .9;h=.9 if typ=='armchair' else .85
        arm=.15 if typ=='armchair' else .18
        box('base',(w,.24,d),(0,.18,0),.055,segments=4)
        fourlegs(w-.12,d-.08,.10,.055,.04)
        box('back_shell',(w,h-.22,.18),(0,.22+(h-.22)/2,-d/2+.09),.065,segments=5)
        for s in [-1,1]:box('arm_'+str(s),(arm,.44,d),(s*(w-arm)/2,.40,0),.065,segments=5)
        n=1 if typ=='armchair' else 2;cw=(w-2*arm)/n
        for i in range(n):
            x=(i-(n-1)/2)*cw
            box('seat_cushion_'+str(i+1),(cw-.008,.12,d-.2),(x,.36,.1),.045,segments=5)
            box('back_cushion_'+str(i+1),(cw-.012,h-.47,.13),(x,.47+(h-.47)/2,-d/2+.17),.055,segments=5)
    elif typ=='stool':
        cyl('seat',.18,.05,(0,.625,0),bevel=.015,n=48)
        for i in range(4):
            a=math.pi/4+i*math.pi/2;x=.135*math.cos(a);z=.135*math.sin(a)
            cyl('leg_'+str(i+1),.018,.60,(x,.3,z),bevel=.007,n=20)
        rounded_ring('foot_rest',.135,.23,.012)
    elif typ=='bench':
        for i in range(3):box('seat_slat_'+str(i+1),(1.6,.06,.126),(0,.42,(i-1)*.137),.014)
        for s in [-1,1]:
            box('trestle_'+str(s),(.07,.39,.36),(s*.68,.195,0),.012)
        box('under_seat_brace',(1.35,.09,.06),(0,.28,0),.012,'accent')
    elif typ=='table':
        box('top',(1.2,.045,.7),(0,.7275,0),.019,segments=4)
        fourlegs(1.2,.7,.705,.05,.06)
        for s in [-1,1]:box('apron_'+str(s),(1.06,.08,.025),(0,.665,s*.28),.008)
    elif typ=='desk':
        box('top',(1.4,.045,.7),(0,.7275,0),.018,segments=4)
        for s in [-1,1]:
            box('side_panel_'+str(s),(.04,.705,.7),(s*.68,.3525,0),.012)
            box('foot_glide_'+str(s),(.04,.02,.58),(s*.68,.01,0),.007,'accent')
        box('modesty_panel',(1.32,.39,.025),(0,.51,-.32),.01)
        box('drawer_box',(.4,.13,.47),(.43,.635,.07),.014)
        box('drawer_face',(.38,.11,.025),(.43,.635,.315),.012)
        box('drawer_pull',(.13,.02,.025),(.43,.65,.3375),.008,'accent')
    elif typ=='counter':
        box('plinth',(1.94,.1,.48),(0,.05,-.03),.012,'accent')
        box('cabinet',(2,.91,.54),(0,.545,-.03),.02)
        box('top',(2.04,.05,.6),(0,1.025,0),.018)
        for i in range(3):
            x=(i-1)*.65;box('door_'+str(i+1),(.63,.8,.02),(x,.55,.247),.014)
            box('handle_'+str(i+1),(.13,.018,.025),(x,.87,.268),.007,'accent')
    elif typ=='bed':
        box('frame',(1.6,.22,2.05),(0,.16,0),.028)
        fourlegs(1.6,2.05,.09,.08,.08)
        box('mattress',(1.56,.18,1.99),(0,.36,.02),.065,segments=5)
        box('headboard',(1.6,1,.08),(0,.5,-.985),.032,segments=4)
        for s in [-1,1]:box('pillow_'+str(s),(.608,.1,.4),(s*.384,.5,-.705),.047,segments=5)
        box('headboard_inlay',(1.43,.4,.015),(0,.72,-.9375),.05,'accent')
    elif typ=='shelf':
        for s in [-1,1]:box('side_'+str(s),(.03,1.9,.35),(s*.485,.95,0),.008)
        box('back',(1,1.9,.015),(0,.95,-.1675),.004,'accent')
        for i in range(6):
            y=min(1.885,.015+i*1.87/5);box('shelf_'+str(i+1),(.94,.03,.35),(0,y,0),.007)
    elif typ=='lamp':
        cyl('base',.18,.035,(0,.0175,0),r2=.16,bevel=.01,n=48)
        cyl('stem',.015,1.375,(0,.7225,0),bevel=.003,n=24)
        lathe('shade',[(.22,1.4),(.12,1.7),(.112,1.7),(.211,1.4),(.22,1.4)],mat='accent',n=48,caps=False)
        ball('bulb',(.075,.1,.075),(0,1.46,0),segments=20,rings=12)
        rounded_ring('shade_rim',.22,1.412,.009)
    elif typ=='tv':
        box('cabinet',(1.32,.41,.385),(0,.245,-.0075),.022)
        fourlegs(1.32,.4,.06,.045,.07)
        for x in [-.32,.32]:box('cabinet_front_'+str(x),(.62,.3,.018),(x,.25,.191),.014,'accent')
        box('stand',(.08,.06,.08),(0,.48,-.05),.013)
        box('screen_housing',(1.2,.675,.05),(0,.8375,-.05),.02,segments=4)
        box('screen',(1.148,.615,.004),(0,.8425,-.023),.012,'accent')
        ball('power_indicator',(.006,.006,.003),(.53,.515,-.02),segments=12,rings=8)
    elif typ=='car':
        # Legacy model's front is +X; its 4.3 x 1.84 footprint is preserved.
        body=extrude('body_shell',[(-2.15,.39),(-1.95,.74),(-1.3,.86),(.8,.86),(1.9,.73),(2.15,.54),(2.15,.32),(-2.15,.32)],1.8,bevel=.04)
        # Open wheel wells, not tyres pasted on an uninterrupted slab.
        for x in [-1.376,1.376]:
            cutter=cyl('temporary_wheelwell',.35,2.1,(x,.33,0),bevel=0,n=48);cutter.rotation_euler[0]=math.pi/2
            bpy.context.view_layer.update();bpy.context.view_layer.objects.active=body;body.select_set(True)
            boolean=body.modifiers.new('wheel well','BOOLEAN');boolean.operation='DIFFERENCE';boolean.solver='EXACT';boolean.object=cutter
            bpy.ops.object.modifier_apply(modifier=boolean.name);bpy.data.objects.remove(cutter,do_unlink=True)
            body.select_set(False)
        finish(body,'body_shell',bevel=.006,segments=2)
        extrude('cabin',[(-1.3,.82),(-.82,1.37),(-.54,1.45),(.43,1.45),(1.04,.84)],1.49,bevel=.05)
        for s in [-1,1]:
            # Side glass and dividing B pillar, with the more raked screen toward +X.
            extrude('rear_window_'+str(s),[(-1.18,.88),(-.77,1.32),(-.55,1.38),(-.18,1.38),(-.18,.88)],.012,s*.75,'accent',.018)
            extrude('front_window_'+str(s),[(-.12,.88),(-.12,1.38),(.39,1.38),(.88,.88)],.012,s*.75,'accent',.018)
            box('door_handle_'+str(s),(.2,.035,.018),(-.04,.76,s*.905),.01,'accent')
            for x in [-1.376,1.376]:
                o=cyl('tyre_'+str(x)+'_'+str(s),.33,.24,(x,.33,s*.8),mat='accent',bevel=.045,n=48)
                o.rotation_euler[0]=math.pi/2
                o=cyl('wheel_hub_'+str(x)+'_'+str(s),.205,.017,(x,.33,s*.911),bevel=.018,n=40);o.rotation_euler[0]=math.pi/2
        # Windscreen is a thick closed pane following the cabin's sloping front.
        mesh('windscreen',[(.506,1.38,-.65),(.506,1.38,.65),(.986,.90,.65),(.986,.90,-.65),(.512,1.38,-.65),(.512,1.38,.65),(.992,.90,.65),(.992,.90,-.65)],[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],'accent',.001)
        mesh('rear_windscreen',[(-.902,1.29,-.65),(-.902,1.29,.65),(-1.242,.9,.65),(-1.242,.9,-.65),(-.908,1.29,-.65),(-.908,1.29,.65),(-1.248,.9,.65),(-1.248,.9,-.65)],[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],'accent',.001)
        for s in [-1,1]:
            box('headlight_'+str(s),(.035,.105,.39),(2.13,.56,s*.56),.027,'accent')
            box('taillight_'+str(s),(.025,.12,.32),(-2.135,.56,s*.61),.02,'accent')
        box('grille',(.022,.11,.58),(2.139,.41,0),.022,'accent')
        box('front_bumper',(.045,.09,1.62),(2.125,.32,0),.025)
    elif typ=='tree':
        lathe('trunk',[(.23,0),(.22,.16),(.16,1.9),(.13,2.7)],n=24)
        for a in [.3,2.4,4.5]:rod('branch_'+str(a),(0,1.9,0),(.55*math.cos(a),3,.55*math.sin(a)),.09,n=16)
        # Deliberately broad sculpted canopy lobes, no leaf/noise texture.
        ball('crown_main',(1.85,2.64,2.4),(0,3.3,0),segments=28,rings=20)
        ball('crown_left',(1.35,1.8,1.7),(-.525,3.25,.15),segments=24,rings=16)
        ball('crown_right',(1.35,1.85,1.7),(.525,3.38,-.13),segments=24,rings=16)
    elif typ=='bush':
        ball('crown_centre',(1.008,.756,.84),(0,.378,0),segments=28,rings=20)
        ball('crown_right',(.64,.576,.64),(.32,.3,.1),segments=24,rings=16)
        ball('crown_left',(.6,.54,.6),(-.3,.28,-.08),segments=24,rings=16)
    elif typ=='rock':
        # Broad, intentional planes; local flattening gives a stable grounded base.
        rings=[(.0,.30,.25),(.055,.4671,.37365),(.28,.44,.34),(.46,.29,.24),(.5231,.12,.10)]
        n=12;v=[]
        for j,(y,rx,rz) in enumerate(rings):
            for i in range(n):
                a=2*math.pi*i/n;v.append((rx*math.cos(a),y,rz*math.sin(a)))
        f=[tuple(range(n-1,-1,-1)),tuple((len(rings)-1)*n+i for i in range(n))]
        f += [(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(len(rings)-1) for i in range(n)]
        stone=mesh('stone',v,f,bevel=.009)
        # Bevels round the polygon's point extrema: restore the exact default envelope.
        bpy.context.view_layer.update()
        stone.scale=(.9342/stone.dimensions.x,.7473/stone.dimensions.y,.5231/stone.dimensions.z)
        bpy.context.view_layer.objects.active=stone;stone.select_set(True)
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);stone.select_set(False)
    elif typ=='streetlamp':
        base=cyl('base',.14,.4,(0,.2,0),r2=.12,bevel=.014,n=32)
        bpy.context.view_layer.update()
        base.scale.x=.28/base.dimensions.x;base.scale.y=.28/base.dimensions.y
        bpy.context.view_layer.objects.active=base;base.select_set(True)
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);base.select_set(False)
        cyl('pole',.06,4.1,(0,2.45,0),r2=.05,bevel=.008,n=32)
        box('arm',(.9,.05,.05),(.42,4.45,0),.015)
        box('lantern',(.36,.1,.22),(.82,4.38,0),.034,segments=4)
        box('diffuser',(.29,.016,.16),(.82,4.323,0),.017,'accent')
        cyl('base_collar',.085,.06,(0,.43,0),bevel=.012,n=32)
    elif typ=='crate':
        # Slats and recessed panels preserve the nominal .6 m seating surface.
        box('core',(.592,.592,.592),(0,.3,0),.012)
        for s in [-1,1]:
            for i in range(3):box('front_slat_'+str(s)+'_'+str(i),(.54,.17,.01),(0,.105+i*.19,s*.297),.006)
            for x in [-.284,.284]:box('corner_post_'+str(s)+'_'+str(x),(.036,.604,.036),(x,.302,s*.284),.006,'accent')
        for i in range(3):box('lid_slat_'+str(i),(.592,.015,.184),(0,.5925,(i-1)*.2),.005)
    elif typ=='barrel':
        lathe('barrel_shell',[(.266,0),(.276,.035),(.28,.15),(.289,.45),(.28,.75),(.276,.87),(.266,.9)],n=48)
        for y in [.198,.702]:
            lathe('hoop_'+str(y),[(.282,y-.02),(.3,y-.02),(.3,y+.02),(.282,y+.02),(.282,y-.02)],mat='accent',n=48)
        cyl('lid',.261,.018,(0,.891,0),bevel=.007,n=48)
        cyl('bung',.035,.012,(.13,.894,0),mat='accent',bevel=.004,n=24)
    else:raise ValueError('unknown type '+typ)
    if typ=='streetlamp':
        for o in bpy.context.scene.objects:o.location.x-=.43
    if typ=='bush':
        for o in bpy.context.scene.objects:o.location.x-=.02
    if typ=='car':
        for o in list(bpy.context.scene.objects):
            if o.type=='MESH':clean_triangulation(o)
    bpy.context.view_layer.update()
    return [o for o in bpy.context.scene.objects if o.type=='MESH']

def geometry_info():
    pts=[];tri=0
    for o in bpy.context.scene.objects:
        if o.type!='MESH':continue
        o.data.calc_loop_triangles();tri+=len(o.data.loop_triangles)
        for v in o.data.vertices:
            p=o.matrix_world@v.co;pts.append((p.x,p.z,-p.y))
    lo=[min(p[i] for p in pts) for i in range(3)];hi=[max(p[i] for p in pts) for i in range(3)]
    return tri,[round(hi[i]-lo[i],6) for i in range(3)],[[round(x,6) for x in lo],[round(x,6) for x in hi]]

def run(ids=None):
    out=ROOT+'/web/models/props';sources=ROOT+'/models-src/blender'
    os.makedirs(out,exist_ok=True);os.makedirs(sources,exist_ok=True)
    meta_path=ROOT+'/models-src/existing-metadata.json'
    old=json.load(open(meta_path)) if os.path.exists(meta_path) else []
    records={a['type']:a for a in old}
    for typ in (ids or list(BY_TYPE)+MODULES):
        build(typ);tri,size,bounds=geometry_info()
        limit=15000 if typ=='car' else 6000
        assert tri<=limit,(typ,tri,limit)
        filename=out+'/'+typ+'.glb'
        bpy.ops.export_scene.gltf(filepath=filename,export_format='GLB',export_yup=True,export_apply=True,export_texcoords=False,export_normals=True,export_materials='EXPORT',export_cameras=False,export_lights=False)
        bpy.ops.wm.save_as_mainfile(filepath=sources+'/props-'+typ+'.blend')
        # Count the actual indexed triangles in the exported GLB.
        data=open(filename,'rb').read();n=struct.unpack_from('<I',data,12)[0];g=json.loads(data[20:20+n])
        tri=sum(g['accessors'][p['indices']]['count']//3 for m in g['meshes'] for p in m['primitives'])
        assert tri<=limit,(typ,'exported',tri)
        if typ in BY_TYPE:
            a=BY_TYPE[typ]
            rec={'type':typ,'name':a['name'],'category':a['category'],'file':'props/'+typ+'.glb','size':size,'seat':a['seat_at_defaults'],'top':a['top_at_defaults'],'triangles':tri,'modules':[],'bounds':bounds,'defaultSize':a['size_at_defaults'],'front':[0,0,1]}
        else:
            sizes={'stairs.step':[1,.18,.3],'fence.post':[.08,1.1,.08],'fence.rail':[.8,.07,.04]}
            rec={'type':typ,'name':typ.replace('.',' ').title(),'category':'Architecture','file':'props/'+typ+'.glb','size':size,'seat':None,'top':None,'triangles':tri,'modules':[],'bounds':bounds,'module':True,'front':[0,0,1]}
        if typ=='stairs':rec['modules']=[{'type':'stairs.step','file':'props/stairs.step.glb','firstTranslation':[0,0,-.6],'translationPerInstance':[0,.18,.3],'count':5,'note':'Solid .18 m module. Stack infill modules below higher treads to recreate full stair solid.'}];rec['placementNote']='Centered depth -0.75..0.75; ascends toward +Z so legacy second-tread seat y=.36,z=-.3 remains on the correct surface.'
        if typ=='fence':rec['modules']=[{'type':'fence.post','file':'props/fence.post.glb','positions':[[-1.2,0,0],[-.4,0,0],[.4,0,0],[1.2,0,0]]},{'type':'fence.rail','file':'props/fence.rail.glb','positions':[[x,y-.035,0] for x in [-.8,0,.8] for y in [.418,.902]]}]
        if typ=='car':rec['front']=[1,0,0];rec['placementNote']='Explicit legacy car +X front retained to preserve 4.3 x 1.84 default footprint. Apply Y rotation -90 degrees for a +Z-facing car.'
        if typ=='streetlamp':rec['placementNote']='Asymmetric lamp recentered to X bounds -0.57..0.57; pole at X=-.43. Default width unchanged.'
        if typ=='rock':rec['placementNote']='Original nominal top .536 retained; rounded stone envelope is .5231 high. The app top is a conservative placement clearance.'
        records[typ]=rec
        with open(meta_path,'w') as f:json.dump(list(records.values()),f,indent=2)
        print('EXISTING_EXPORTED',typ,tri,size,flush=True)
    return list(records.values())

if __name__=='__main__':run()
