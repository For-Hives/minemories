import json,sys
from shapely import wkt
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union
# Working folder: params.json, source-transparent.png and the intermediate JSON files live here.
# Defaults to this folder; set MINEMORIES_LOGO_WORKDIR to work elsewhere.
import os as _os
S=_os.environ.get('MINEMORIES_LOGO_WORKDIR', _os.path.dirname(_os.path.abspath(__file__)))+'/'
OFF=(280,105) if len(sys.argv)<2 else tuple(map(float,sys.argv[1].split(',')))
W,H=(585,920) if len(sys.argv)<3 else tuple(map(float,sys.argv[2].split(',')))
sh=json.load(open(S+'vox_shapes.json'))
def ring(c): return 'M'+' L'.join(f'{x-OFF[0]:.2f} {y-OFF[1]:.2f}' for x,y in list(c.coords)[:-1])+'Z'
def pathd(g):
    ps=[g] if isinstance(g,Polygon) else list(getattr(g,'geoms',[]))
    d=''
    for p in ps:
        if not isinstance(p,Polygon) or p.area<0.3: continue
        d+=ring(p.exterior)+''.join(ring(i) for i in p.interiors)
    return d
items=[]
for s in sh:
    g=wkt.loads(s['wkt']); items.append(dict(name=s['name'],col=s['col'],d=pathd(g),area=g.area))
glow=dict(cx=350-OFF[0],cy=330-OFF[1],rx=58,ry=66)
json.dump(dict(items=items,glow=glow,W=W,H=H),open(S+'vox_items.json','w'))
body=''
for it in items:
    if it['name']=='Button': continue
    body+=f'<path fill="{it["col"]}" stroke="{it["col"]}" stroke-width="0.5" stroke-linejoin="round" fill-rule="evenodd" d="{it["d"]}"/>'
g=glow
body+=f'<ellipse cx="{g["cx"]}" cy="{g["cy"]}" rx="{g["rx"]}" ry="{g["ry"]}" fill="url(#glow)"/>'
for it in items:
    if it['name']!='Button': continue
    body+=f'<path fill="{it["col"]}" stroke="{it["col"]}" stroke-width="0.5" stroke-linejoin="round" fill-rule="evenodd" d="{it["d"]}"/>'
defs=f'<radialGradient id="glow" gradientUnits="userSpaceOnUse" cx="{g["cx"]}" cy="{g["cy"]}" r="{g["rx"]}" gradientTransform="translate({g["cx"]} {g["cy"]}) scale(1 {g["ry"]/g["rx"]}) translate({-g["cx"]} {-g["cy"]})"><stop offset="0" stop-color="#ffd25a" stop-opacity="0.34"/><stop offset="0.5" stop-color="#ffc94f" stop-opacity="0.12"/><stop offset="1" stop-color="#ffc94f" stop-opacity="0"/></radialGradient>'
open(S+'vox.svg','w').write(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}"><defs>{defs}</defs>{body}</svg>')
print(len(items),'shapes')
