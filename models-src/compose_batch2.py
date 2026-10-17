"""Compose unchanged Blender tiles in the batch 1 sheet typography and layout."""
import json, math, argparse
from pathlib import Path
from PIL import Image, ImageDraw
import compose_previews as c
SRC=Path(__file__).resolve().parent
OUT=SRC/'previews'

def sheet(records,category,held=False):
 cols=4 if held else 5
 prefix='batch2-held-' if held else 'batch2-'
 paths=[OUT/'tiles'/f'{prefix}{r["type"]}.png' for r in records]
 images=[Image.open(p).convert('RGB') for p in paths]
 w,h=images[0].size;gap=22;margin=64;label=116;rows=math.ceil(len(images)/cols)
 width=margin*2+cols*w+(cols-1)*gap;height=284+rows*(h+label)+(rows-1)*gap
 out=Image.new('RGB',(width,height),c.BG);d=ImageDraw.Draw(out)
 title='Batch 2 / Right-hand attachment checks' if held else f'Batch 2 / {category}'
 subtitle=f'{len(records)} pieces  /  actual imported GLBs  /  matte clay  /  separate named parts'
 c.header(d,width,title,subtitle)
 for i,(a,im) in enumerate(zip(records,images)):
  x=margin+i%cols*(w+gap);y=200+i//cols*(h+label+gap)
  out.paste(im,(x,y));y+=h
  d.text((x,y+10),a['name'],font=c.font(27,'Medium'),fill=c.WHITE)
  d.text((x,y+48),a['type']+(' / holdable' if a.get('holdable') else ''),font=c.font(16,mono=True),fill=c.ACCENT)
  dim=' × '.join(c.metres(v) for v in a['size'])+' m'
  d.text((x,y+77),dim+' / '+f'{a["triangles"]:,} tris',font=c.font(18),fill=c.MUTED)
 d.line((margin,height-74,width-margin,height-74),fill=c.RULE)
 note='Actual right mitten, reference socket and manifest root transforms. Individual framing.' if held else 'Dimensions W × H × D. Base-centred roots; metres, +Y up, +Z front. Individually framed.'
 d.text((margin,height-52),note,font=c.font(20),fill=c.MUTED)
 name='batch2-held.png' if held else f'batch2-{category.lower()}.png'
 c.save(out,name,paths)

def run():
 rows=json.loads((SRC/'batch2-metadata.json').read_text())
 for category in dict.fromkeys(a['category'] for a in rows):sheet([a for a in rows if a['category']==category],category)
 held=[a for a in rows if (OUT/'tiles'/f'batch2-held-{a["type"]}.png').exists()]
 if held:sheet(held,'held',True)

if __name__=='__main__':run()
