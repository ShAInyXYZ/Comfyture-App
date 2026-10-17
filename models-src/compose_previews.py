"""Label and lay out the actual Blender render PNGs without changing their pixels.

Usage: python models-src/compose_previews.py --bodies / --assets / --hand / --grips / --all
Every render is pasted at native resolution. No crops, recolouring, generated art,
background replacement, sharpening, or changes to geometry are made here.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parent.parent
SRC=ROOT/'models-src'
OUT=SRC/'previews'
BG=(18,21,26)
WHITE=(235,239,242)
MUTED=(147,160,174)
RULE=(49,58,69)
ACCENT=(163,195,201)
FONTROOT=Path('/usr/share/fonts/opentype/fira')

def font(size,weight='Book',mono=False):
    path=FONTROOT/(('FiraMono-Medium.otf') if mono else ('FiraSans-'+weight+'.otf'))
    if not path.exists():path=Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
    return ImageFont.truetype(str(path),size)

def metadata(name):
    return json.loads((SRC/(name+'-metadata.json')).read_text())

def render(path):
    p=OUT/path
    if not p.exists():raise FileNotFoundError('Required Blender render missing: '+str(p))
    return Image.open(p).convert('RGB')

def centered(draw,text,x,y,f,fill=WHITE):
    b=draw.textbbox((0,0),text,font=f)
    draw.text((round(x-(b[2]-b[0])/2),y),text,font=f,fill=fill)

def header(draw,width,title,subtitle,left=64):
    draw.text((left,32),'COMFYTURE  /  STAGE',font=font(19,'Medium',True),fill=ACCENT)
    draw.text((left,65),title,font=font(44,'Medium'),fill=WHITE)
    draw.text((left,124),subtitle,font=font(21),fill=MUTED)
    draw.line((left,168,width-left,168),fill=RULE,width=1)

def save(image,name,sources):
    dest=OUT/name
    image.save(dest,compress_level=6)
    report=OUT/'preview-composition.json'
    current=json.loads(report.read_text()) if report.exists() else {}
    current[name]={
        'size':list(image.size),
        'method':'Native-resolution unaltered Blender render tiles, with text and margins outside the renders.',
        'sources':[{'file':str(p.relative_to(OUT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sources],
    }
    report.write_text(json.dumps(current,indent=2)+'\n')
    print(str(dest.relative_to(ROOT)),image.size,flush=True)

def body_sheet(name,title,rows,pose=False):
    by_id={b['id']:b for b in metadata('body')}
    bodies=[by_id[id] for id in ['man','woman','teen','child','toddler','elder','heavy','athletic']]
    imgs=[render(file) for _,file in rows]
    if len({im.width for im in imgs})!=1:raise ValueError('Body lineup widths differ')
    image_w=imgs[0].width
    margin=64
    row_header=58
    labels=82
    gap=24
    footer=72
    width=image_w+2*margin
    height=190+sum(row_header+im.height+labels+gap for im in imgs)+footer
    out=Image.new('RGB',(width,height),BG);draw=ImageDraw.Draw(out)
    tris=[b['triangles'] for b in bodies]
    subtitle=(f'{len(bodies)} bodies  /  {len(bodies[0]["joints"])} named joints each  /  '
              f'{min(tris):,}–{max(tris):,} triangles  /  common scale')
    header(draw,width,title,subtitle,margin)
    y=190
    for index,((label,file),im) in enumerate(zip(rows,imgs)):
        draw.text((margin,y+11),f'{index+1:02d}  {label}',font=font(25,'Medium'),fill=WHITE)
        y+=row_header
        out.paste(im,(margin,y));y+=im.height
        for i,b in enumerate(bodies):
            # These are the exact common-scale lineup positions in render_library.py.
            x=margin+image_w*(.5+(i-3.5)*1.15/9.35)
            centered(draw,b['id'].upper(),x,y+14,font(22,'Medium',True))
            centered(draw,f'{b["triangles"]:,} tris',x,y+45,font(16,mono=True),MUTED)
        y+=labels+gap
    note=('Range test: the same delivered rigid meshes and joint hierarchy in every row.' if pose
          else 'Front, three-quarter, side and back. Matte plates and darker joint inserts; no textures.')
    draw.line((margin,y,width-margin,y),fill=RULE,width=1)
    draw.text((margin,y+23),note,font=font(20),fill=MUTED)
    save(out,name,[OUT/file for _,file in rows])

def bodies():
    body_sheet('turntable-sheet.png','Eight body types / Turntable',[
        ('FRONT','bodies-front-stand.png'),
        ('THREE-QUARTER','bodies-three-quarter-stand.png'),
        ('SIDE','bodies-side-stand.png'),
        ('BACK','bodies-back-stand.png'),
    ])
    body_sheet('pose-test.png','Eight body types / Pose test',[
        ('RELAXED STAND','bodies-front-stand.png'),
        ('SITTING — HIPS AND KNEES 90°','bodies-three-quarter-sit.png'),
        ('ELBOWS FOLDED 130°','bodies-three-quarter-elbows130.png'),
        ('ARMS RAISED OVERHEAD','bodies-front-overhead.png'),
        ('HEAD TURNED 60°','bodies-front-head60.png'),
        ('SPINE LEANED 30° FORWARD','bodies-side-spine30.png'),
    ],pose=True)

def metres(v):
    return f'{v:.3f}'.rstrip('0').rstrip('.')

def tiles(name,title,subtitle,records,cols,hand=False,grip=False):
    prefix='grip-' if grip else ('hand-' if hand else '')
    paths=[Path('tiles')/(prefix+r['type']+'.png') for r in records]
    imgs=[render(p) for p in paths]
    if len({im.size for im in imgs})!=1:raise ValueError('Tile dimensions differ; do not resize delivered renders')
    tile_w,tile_h=imgs[0].size
    margin=64;gap=22;label_h=126 if hand else 116
    rows=math.ceil(len(records)/cols)
    width=2*margin+cols*tile_w+(cols-1)*gap
    height=200+rows*(tile_h+label_h)+(rows-1)*gap+84
    out=Image.new('RGB',(width,height),BG);draw=ImageDraw.Draw(out)
    header(draw,width,title,subtitle,margin)
    for i,(r,im) in enumerate(zip(records,imgs)):
        x=margin+(i%cols)*(tile_w+gap);y=200+(i//cols)*(tile_h+label_h+gap)
        out.paste(im,(x,y));y+=tile_h
        draw.text((x,y+10),r['name'],font=font(27,'Medium'),fill=WHITE)
        kind='Right-hand fit' if grip else ('Hand prop' if hand else ('Module' if r.get('module') or '.' in r['type'] else r['category']))
        draw.text((x,y+48),r['type']+'  /  '+kind,font=font(16,mono=True),fill=ACCENT)
        if hand:
            summary=(f'{r["triangles"]:,} prop tris  /  adult right hand' if grip
                     else f'{r["triangles"]:,} tris  /  grip origin at palm')
            draw.text((x,y+76),summary,font=font(18),fill=MUTED)
            poses=', '.join(r.get('poses',[]))
            draw.text((x,y+100),poses,font=font(16),fill=MUTED)
        else:
            dim=' × '.join(metres(v) for v in r['size'])+' m'
            draw.text((x,y+77),dim+'  /  '+f'{r["triangles"]:,} tris',font=font(18),fill=MUTED)
    y=height-62
    draw.line((margin,y-12,width-margin,y-12),fill=RULE,width=1)
    footer=('RightHand-local offset (−0.075, −0.018, 0) m; identity rotation. Unscaled adult reference fit. Thumbnails individually framed.' if grip
            else 'Palm-origin models. Right/left grip transforms and compatible poses are recorded in manifest.json.' if hand
            else 'Dimensions are W × H × D in metres. Tiles are individually framed; anchors and modules are recorded in manifest.json.')
    draw.text((margin,y+8),footer,font=font(20),fill=MUTED)
    save(out,name,[OUT/p for p in paths])

def assets():
    old=metadata('existing');new=metadata('new')
    existing=[r for r in old if not r.get('module')]
    modules=[r for r in old if r.get('module')]
    ordered=existing+new+modules
    tiles('asset-sheet.png','Set pieces / Clay library',
          f'{len(existing)} original types  /  {len(new)} new set pieces  /  {len(modules)} reusable modules  /  imported GLB renders',
          ordered,6)

def hands():
    data=metadata('hand')
    tiles('hand-prop-sheet.png','Hand props / Grip library',
          f'{len(data)} hand props  /  named parts  /  matte prop and accent materials  /  imported GLB renders',
          data,5,hand=True)

def grips():
    data=metadata('hand')
    tiles('hand-grip-check.png','Palm attachment checks',
          f'{len(data)} props with the adult man’s right hand  /  actual imported meshes  /  reference palm offsets 0.075 m and 0.018 m',
          data,5,hand=True,grip=True)

def run(groups=None):
    tasks={'bodies':bodies,'assets':assets,'hand':hands,'grips':grips}
    for group in (groups or list(tasks)):
        try:tasks[group]()
        except FileNotFoundError as e:
            if groups is not None:raise
            print('Not composed yet:',group,'—',e,flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for opt in ['bodies','assets','hand','grips','all']:p.add_argument('--'+opt,action='store_true')
    args=p.parse_args();selected=[g for g in ['bodies','assets','hand','grips'] if getattr(args,g)]
    run(selected or None)
