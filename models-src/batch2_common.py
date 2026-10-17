"""Shared clay modelling vocabulary for batch 2. All positions use app Y-up metres.

Keep production geometry texture-free and named. Reuses batch 1's edge treatment;
reduced circular tessellation reserves the small-object budget for defining detail.
"""
import bpy, bmesh, math, json, os
from pathlib import Path
from mathutils import Vector, Matrix
import build_new as base
ROOT=Path(__file__).resolve().parents[1]
V=base.V
box=base.box
mesh=base.mesh
profile_extrude=base.profile_extrude
handle=base.handle
clear=base.clear
objects=base.objects
def bounds():
 # Rotated local bounding-box corners overestimate curved/angled parts. Measure
 # actual world vertices so centring, grounding and manifest dimensions agree.
 bpy.context.view_layer.update()
 points=[o.matrix_world@v.co for o in objects() for v in o.data.vertices]
 return Vector([min(v[k] for v in points) for k in range(3)]),Vector([max(v[k] for v in points) for k in range(3)])

def ball(n,p,s,mat='prop',seg=16,rings=8):
 return base.ball(n,p,s,mat,seg,rings)

def rod(n,a,b,r,mat='prop',r2=None,vertices=16,bev=.003):
 a,b=V(a),V(b);v=b-a
 bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r,radius2=r if r2 is None else r2,depth=v.length,location=(a+b)*.5)
 o=bpy.context.object;o.rotation_euler=v.to_track_quat('Z','Y').to_euler()
 return base.finish(o,n,mat,min(bev,v.length*.2,r*.3),1)

def path(n,pts,r,mat='prop',sides=6,closed=False):
 return base.path(n,pts,r,mat,sides,closed)

def ring(n,c,r,t,mat='prop',axis='y',N=24):
 pts=[]
 for i in range(N):
  a=i*math.tau/N
  q=(r*math.cos(a),0,r*math.sin(a)) if axis=='y' else ((r*math.cos(a),r*math.sin(a),0) if axis=='z' else (0,r*math.cos(a),r*math.sin(a)))
  pts.append(tuple(c[k]+q[k] for k in range(3)))
 return path(n,pts,t,mat,6,True)

def lathe(n,profile,c=(0,0,0),mat='prop',N=24):
 """A closed radial cross section; axis samples are welded by cleanup."""
 return base.lathe(n,profile,c,mat,N)

def clean(o):
 """Triangulate deterministically, remove numerical slivers and orphan vertices."""
 bpy.context.view_layer.objects.active=o;o.select_set(True)
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 bm=bmesh.new();bm.from_mesh(o.data)
 bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7)
 bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=1e-7)
 bmesh.ops.triangulate(bm,faces=list(bm.faces),quad_method='BEAUTY',ngon_method='BEAUTY')
 tiny=[f for f in bm.faces if f.calc_area()<2e-12]
 if tiny:bmesh.ops.delete(bm,geom=tiny,context='FACES_ONLY')
 loose=[e for e in bm.edges if not e.link_faces]
 if loose:bmesh.ops.delete(bm,geom=loose,context='EDGES')
 unused=[v for v in bm.verts if not v.link_faces]
 if unused:bmesh.ops.delete(bm,geom=unused,context='VERTS')
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free();o.data.update()
 # Welding/triangulation changes loop order. Retaining the helper's original
 # custom loop normals produces striped shading on thin radial bands. Rebuild
 # them on the final topology, with real creases and weighted bevel corners.
 if o.data.has_custom_normals:bpy.ops.mesh.customdata_custom_splitnormals_clear()
 o.data.set_sharp_from_angle(angle=.75)
 normal=o.modifiers.new('Final clay corner normals','WEIGHTED_NORMAL')
 normal.keep_sharp=True;normal.weight=50
 bpy.ops.object.modifier_apply(modifier=normal.name)
 for uv in list(o.data.uv_layers):o.data.uv_layers.remove(uv)
 o.select_set(False)

def reg(catalog,typ,category,themes,**kw):
 catalog[typ]=dict(name=typ.replace('-',' ').capitalize(),category=category,themes=themes,tags=typ.split('-'),budget=6000,priority='P1',**kw)

