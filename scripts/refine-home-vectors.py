"""Smooth pixel-sized tracing noise in existing cubic SVG artwork, without scaling bitmaps.
Input is an untouched SVG directory; output is a different directory so refinement is repeatable.
"""
import math,re,sys,xml.etree.ElementTree as E
from pathlib import Path
E.register_namespace('', 'http://www.w3.org/2000/svg')
def distance(p,a,b):
 dx,dy=b[0]-a[0],b[1]-a[1];den=dx*dx+dy*dy
 t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/den)) if den else 0
 return math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)
def rdp(points,epsilon):
 if len(points)<3:return points
 distances=[distance(p,points[0],points[-1]) for p in points[1:-1]]
 m=max(distances)
 if m<=epsilon:return [points[0],points[-1]]
 i=distances.index(m)+1
 return rdp(points[:i+1],epsilon)[:-1]+rdp(points[i:],epsilon)
def smooth(sub,epsilon):
 numbers=lambda s:list(map(float,re.findall(r'-?\d+(?:\.\d+)?',s)))
 parts=re.findall(r'([MCZ])([^MCZ]*)',sub);points=[]
 for cmd,args in parts:
  v=numbers(args)
  if cmd=='M':points.append(tuple(v))
  elif cmd=='C':
   a=points[-1];b,c,d=tuple(v[:2]),tuple(v[2:4]),tuple(v[4:])
   for i in range(1,7):
    t=i/6;u=1-t
    points.append(tuple(u*u*u*a[j]+3*u*u*t*b[j]+3*u*t*t*c[j]+t*t*t*d[j] for j in (0,1)))
 if len(points)<5:return sub
 if math.dist(points[0],points[-1])<.001:points.pop()
 # Split a closed loop at its farthest point, avoiding coincident RDP endpoints.
 split=max(range(len(points)),key=lambda i:math.dist(points[0],points[i]))
 ps=rdp(points[:split+1],epsilon)[:-1]+rdp(points[split:]+[points[0]],epsilon)[:-1]
 if len(ps)<4:return sub
 tangents=[]
 for i,p in enumerate(ps):
  a,b=ps[i-1],ps[(i+1)%len(ps)]
  va=(p[0]-a[0],p[1]-a[1]);vb=(b[0]-p[0],b[1]-p[1]);la=math.hypot(*va);lb=math.hypot(*vb)
  cos=(va[0]*vb[0]+va[1]*vb[1])/(la*lb) if la*lb else -1
  # Keep deliberate corners. Only round the gently turning parts of a contour.
  span=math.dist(a,b)
  handle=min(la,lb)*.20/span if span else 0
  tangents.append(((b[0]-a[0])*handle,(b[1]-a[1])*handle) if cos>.65 else (0,0))
 f=lambda p:f'{p[0]:.2f} {p[1]:.2f}'
 result='M'+f(ps[0])
 for i,a in enumerate(ps):
  j=(i+1)%len(ps);b=ps[j];ta,tb=tangents[i],tangents[j]
  result+=' C'+f((a[0]+ta[0],a[1]+ta[1]))+' '+f((b[0]-tb[0],b[1]-tb[1]))+' '+f(b)
 return result+' Z '
source,out=map(Path,sys.argv[1:]);out.mkdir(exist_ok=True,parents=True)
count=0
for file in source.glob('*.svg'):
 tree=E.parse(file);root=tree.getroot()
 root.set('shape-rendering','geometricPrecision')
 # This tiny burst-tip remnant was accidentally assigned to the controller.
 if file.stem=='controller':
  for e in list(root):
   if e.get('transform')=='translate(1164.625,589.4375)':
    root.remove(e)
 for e in root:
  d=e.get('d')
  if not d:continue
  color=e.get('fill','#000000');rgb=[int(color[i:i+2],16) for i in (1,3,5)]
  # Larger silhouettes need firmer cleanup than small decorative halftone dots.
  epsilon=.8 if len(d)>2000 else .35
  e.set('d',''.join(smooth(sub,epsilon) for sub in re.findall(r'M[^M]*',d)))
  if max(rgb)<35:e.set('fill','#101015')
  count+=1
 tree.write(out/file.name,encoding='unicode')
print(f'Refined {count} vector paths across {len(list(source.glob("*.svg")))} illustrations.')
