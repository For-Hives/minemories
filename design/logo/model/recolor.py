import numpy as np, cv2, json
from PIL import Image
from shapely import wkt
# Working folder: params.json, source-transparent.png and the intermediate JSON files live here.
# Defaults to this folder; set MINEMORIES_LOGO_WORKDIR to work elsewhere.
import os as _os
S=_os.environ.get('MINEMORIES_LOGO_WORKDIR', _os.path.dirname(_os.path.abspath(__file__)))+'/'
src=np.array(Image.open(S+'source-transparent.png'))
rgb=np.ascontiguousarray(src[...,:3]); A=src[...,3]>0
lab=cv2.cvtColor(rgb,cv2.COLOR_RGB2LAB).astype(float)
sh=json.load(open(S+'vox_shapes.json'))
def hex2lab(h):
    c=np.array([[[int(h[i:i+2],16) for i in (1,3,5)]]],np.uint8); return cv2.cvtColor(c,cv2.COLOR_RGB2LAB)[0,0].astype(float)
def de(a,b): return np.linalg.norm((a-b)*np.array([100/255,1,1]))
from collections import defaultdict
pool=defaultdict(list)
for s_ in sh:
    if s_['name']=='Button': continue
    g=wkt.loads(s_['wkt']).buffer(-4)
    if g.is_empty or g.area<40: continue
    m=np.zeros(A.shape,np.uint8)
    for p in getattr(g,'geoms',[g]):
        if p.geom_type!='Polygon': continue
        cv2.fillPoly(m,[np.array(p.exterior.coords).round().astype(np.int32)],1)
        for i in p.interiors: cv2.fillPoly(m,[np.array(i.coords).round().astype(np.int32)],0)
    m=(m>0)&A
    if m.sum()>=40: pool[s_['col']].append(lab[m])
newcol={}
for col,arrs in pool.items():
    med=np.median(np.vstack(arrs),axis=0); d=de(med,hex2lab(col))
    if d<20:
        c=cv2.cvtColor(np.array([[med]],np.uint8),cv2.COLOR_LAB2RGB)[0,0]; newcol[col]='#%02x%02x%02x'%tuple(int(v) for v in c)
    else: print('kept',col,'dE',round(d,1))
for s_ in sh:
    if s_['col'] in newcol: s_['design']=s_['col']; s_['col']=newcol[s_['col']]
json.dump(sh,open(S+'vox_shapes.json','w')); json.dump(newcol,open(S+'colormap.json','w'),indent=1)
print(len(newcol),'material colours sampled from source')
