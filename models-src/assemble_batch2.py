"""Append measured batch 2 records; enrich batch 1 only with themes and tags."""
import json, copy
from pathlib import Path
SRC=Path(__file__).resolve().parent
THEMES=set('kitchen dining food drinks living bedroom bathroom home kids garden office tech studio retail product beauty fashion school medical street city transport nature beach camping sports fitness music party fantasy industrial animals'.split())
OLD={
 'box':'studio product','cylinder':'studio product','sphere':'studio product','cone':'studio product',
 'plane':'studio home','doorway':'home city','window':'home city','door':'home city','pillar':'city fantasy','arch':'city fantasy',
 'stairs':'home city','ramp':'city transport','platform':'studio product','floor':'home studio','fence':'garden street',
 'chair':'home dining','armchair':'home living','sofa':'home living','stool':'home dining','bench':'street garden',
 'table':'home dining','desk':'office home','counter':'retail kitchen','bed':'home bedroom','shelf':'home retail',
 'lamp':'home living','tv':'home tech','car':'street transport','tree':'nature garden','bush':'nature garden','rock':'nature fantasy',
 'streetlamp':'street city','crate':'industrial retail','barrel':'industrial fantasy','traffic-cone':'street transport',
 'fridge':'kitchen home','stove':'kitchen home','kitchen-island':'kitchen home','office-chair':'office home',
 'wardrobe':'bedroom fashion','bathtub':'bathroom home','piano':'music home','bus-stop':'street transport',
 'trash-bin':'street city','mailbox':'street home','phone-booth':'street city','tent':'camping nature',
 'campfire':'camping nature','pine-tree':'nature garden','palm-tree':'nature beach','rowing-boat':'nature sports',
 'phone':'tech office','cup':'drinks kitchen','book':'school home','camera':'studio tech','sword':'fantasy',
 'pistol':'studio','umbrella':'street fashion','bag':'fashion retail','guitar':'music','steering-wheel':'transport',
}
SYNONYMS={'phone':['mobile','cellphone','telephone'],'cup':['mug','coffee','tea'],'car':['automobile','vehicle'],
 'fridge':['refrigerator'],'stove':['oven','cooker'],'tv':['television','screen'],'lamp':['light','lighting'],
 'trash-bin':['garbage','rubbish','waste'],'bag':['handbag','carry'],'sword':['blade'],'piano':['instrument'],
 'soda-can':['soda','coke','can','fizzy drink'],'takeaway-coffee':['coffee','latte','takeout cup'],
 'e-scooter':['electric scooter'],'atm':['cash machine','bank'],'pa-speaker':['loudspeaker','sound'],
 'iv-stand':['drip','intravenous'],'vr-headset':['virtual reality'],'smartphone':['cellphone','mobile phone']}

def enrich(entry, fallback=None):
 typ=entry.get('type','');name=entry.get('name',typ)
 entry['themes']=OLD.get(typ,OLD.get(fallback,'studio')).split()
 entry['tags']=list(dict.fromkeys([typ.replace('-',' '),name.lower(),*typ.replace('.','-').split('-'),*SYNONYMS.get(typ,[])]))
 for module in entry.get('modules',[]):
  if isinstance(module,dict):enrich(module,typ)

def append_batch2(manifest):
 manifest=copy.deepcopy(manifest)
 new=[]
 for path in sorted(SRC.glob('batch2-*-metadata.json')):new.extend(json.loads(path.read_text()))
 newids={r['type'] for r in new}
 # Idempotent when called by the batch 1 assembler or on an enriched manifest.
 manifest['assets']=[r for r in manifest['assets'] if r['type'] not in newids]
 for r in manifest['assets']+manifest['handProps']:enrich(r)
 requirements=json.loads((SRC/'batch2-requirements.json').read_text())
 order={r['type']:i for i,r in enumerate(requirements)}
 new.sort(key=lambda r:order.get(r['type'],9999))
 for r in new:
  r['tags']=list(dict.fromkeys([r['type'].replace('-',' '),*r['tags'],*SYNONYMS.get(r['type'],[])]))
 manifest['assets'].extend(new)
 (SRC/'batch2-metadata.json').write_text(json.dumps(new,indent=2)+'\n')
 return manifest

def run():
 baseline=json.loads((SRC/'batch1-baseline.json').read_text())['manifest']
 m=append_batch2(baseline)
 (SRC.parent/'web/models/manifest.json').write_text(json.dumps(m,indent=2)+'\n')
 print('Manifest:',len(m['assets']),'assets;',len(json.loads((SRC/'batch2-metadata.json').read_text())),'batch 2 additions')

if __name__=='__main__':run()
