"""Prepare complete, padded vector stickers instead of cropped page fragments.
Uses the retained trace of the project's existing full swan reference.
Original v45 edge art is preserved in assets/home/reference/pre-drag-v45.
"""
from pathlib import Path
import xml.etree.ElementTree as E
import re

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'assets/home/vector'
NS = '{http://www.w3.org/2000/svg}'
E.register_namespace('', NS[1:-1])

def pad(root, margin=8):
    boxes=[]
    for e in root:
        if not e.get('d'): continue
        nums=list(map(float,re.findall(r'-?\d+(?:\.\d+)?',e.get('d'))))
        tr=list(map(float,re.findall(r'-?\d+(?:\.\d+)?',e.get('transform','translate(0,0)'))))
        if len(nums)%2 or len(tr)!=2: raise ValueError('Unexpected vector path transform')
        boxes.append((min(nums[::2])+tr[0],min(nums[1::2])+tr[1],max(nums[::2])+tr[0],max(nums[1::2])+tr[1]))
    x=min(b[0] for b in boxes)-margin;y=min(b[1] for b in boxes)-margin
    w=max(b[2] for b in boxes)+margin-x;h=max(b[3] for b in boxes)+margin-y
    root.set('viewBox',f'{x:.3f} {y:.3f} {w:.3f} {h:.3f}')
    root.set('preserveAspectRatio','xMidYMid meet')
    return (x,y,w,h)

# These two edge chips now use the complete matching red-chip illustration.
for name in ['chip-edge','chip-corner']:
    root=E.parse(ART/'chip-red.svg').getroot()
    E.ElementTree(root).write(ART/f'{name}.svg',encoding='unicode')

# Full swan from the project's existing reference; face left like the Home art.
root=E.parse(ROOT/'assets/home/reference/swan-complete-trace.svg').getroot()
root.set('viewBox','-12 -12 1048 951');root.set('preserveAspectRatio','xMidYMid meet')
group=E.Element(NS+'g',{'transform':'translate(1024 0) scale(-1 1)'})
for i,e in enumerate(list(root)):
    root.remove(e)
    # Keep the opaque white base (also fills the outline's compound holes),
    # the two deliberate wing contours and the flower centre. Drop speckles.
    if i in [12,13,15,16,17,18,19]: continue
    if e.get('fill') in ['#F9F9F9','#F4F4F4']: e.set('fill','#FBFBFB')
    group.append(e)
root.append(group)
E.ElementTree(root).write(ART/'swan.svg',encoding='unicode')

# The old right-hand ray and gold background fragment ended at the source
# page boundary. Keep the complete bulb, restore a round ray, drop cut dots.
root=E.parse(ROOT/'assets/home/reference/pre-drag-v45/bulb.svg').getroot()
for i,e in enumerate(list(root)):
    if i in [4,15,41,63,72,83]:root.remove(e)
E.SubElement(root,NS+'path',{'d':'M1345 111 C1355 108 1365 105 1375 102','fill':'none','stroke':'#101015','stroke-width':'9','stroke-linecap':'round'})
E.ElementTree(root).write(ART/'bulb.svg',encoding='unicode')

# Keep source curves intact, with breathing room for their antialiased edges.
for p in ART.glob('*.svg'):
    if p.stem in ['swan','bubble','bolt']: continue
    root=E.parse(p).getroot();pad(root)
    E.ElementTree(root).write(p,encoding='unicode')

# The game logos had width/height but no viewBox; their paths extended outside
# those raster-sized viewports, clipping the top and extrusion at any scale.
for name in ['main-connect-sharp.svg','main-4live-sharp.svg']:
    p=ROOT/'assets/figma'/name;root=E.parse(p).getroot();pad(root,5)
    E.ElementTree(root).write(p,encoding='unicode')
