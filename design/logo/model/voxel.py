# Clean voxel/box model of the Minemories camera, oblique projection matched to the source image.
import numpy as np, json, math
from shapely.geometry import Polygon
from shapely.ops import unary_union
# Working folder: params.json, source-transparent.png and the intermediate JSON files live here.
# Defaults to this folder; set MINEMORIES_LOGO_WORKDIR to work elsewhere.
import os as _os
S=_os.environ.get('MINEMORIES_LOGO_WORKDIR', _os.path.dirname(_os.path.abspath(__file__)))+'/'
import os
Q=dict(body_x1=10,body_y1=10,knob_cx=4.5,knob_hx=1.4,lens_dx=0,lens_dy=0,neck_x1=6.2,yg=-12.4,dzf=3.9,legL_x=2.15,legL_dx=-3.5,legR_x=7.65,legR_dx=3.5)
if os.path.exists(S+'params.json'): Q.update(json.load(open(S+'params.json')))
U=34.0; DZ=(36.0,10.3); OX,OY=392.0,548.0
def P(p): x,y,z=p; return (OX+U*x+DZ[0]*z, OY-U*y+DZ[1]*z)
W=np.array([-DZ[0]/U, DZ[1]/U, 1.0])           # direction toward the viewer (projects to a point)
PAL={
 'gold':  {'top':'#fde68a','left':'#fcd35b','front':'#df9233'},
 'dring': {'top':'#4a2a20','left':'#3f221a','front':'#3b1e17'},
 'tube':  {'top':'#cc7230','left':'#9e4818','front':'#6e2c0e'},
 'body':  {'top':'#4d3a3e','left':'#3a2d33','front':'#241a1e'},
 'knob':  {'top':'#5f5563','left':'#4b414b','front':'#352b32'},
 'btn':   {'top':'#fdeb94','left':'#fdd65c','front':'#db8b2c'},
 'neck':  {'top':'#3a2e33','left':'#2e242a','front':'#1c1417'},
 'neckb': {'top':'#3a2e33','left':'#5c3121','front':'#1c1417'},
 'head':  {'top':'#8a6047','left':'#7a4f36','front':'#5f3323'},
 'legd':  {'top':'#463a42','left':'#3b3138','front':'#1d1519'},
 'lego':  {'top':'#cf7a35','left':'#b86424','front':'#78340f'},
}
GLASS=[['#3a4157','#a6e3f2','#40cde0','#1556a0'],
       ['#52b6de','#ffffff','#2a7fbd','#1556a0'],
       ['#4fd6e8','#22b0cd','#1f7ab0','#3f97cf'],
       ['#3a3f55','#46d3e6','#6ee0ea','#a6e8f5']]
boxes=[]   # (origin, e1,e2,e3, material or dict of face colours, name)
def box(x0,x1,y0,y1,z0,z1,mat,name):
    boxes.append((np.array([x0,y0,z0],float),np.array([x1-x0,0,0.]),np.array([0,y1-y0,0.]),np.array([0,0,z1-z0]),mat,name))
# --- body, grip, knob, button
box(2,Q['body_x1'], 0,Q['body_y1'], -3,0, 'body','Body')
box(2,6,  1,8,  -4.5,-3,'body','Grip')
prisms=[]   # octagonal prisms: (cx,cz,hx,hz,chamfer,y0,y1,colours,name)
KN_UP={'top':'#62586a','-x':'#2f272d','-x+z':'#5a505c','+z':'#463c46','+x+z':'#2c2329','-x-z':'#3a3038'}
KN_LO={'top':'#62586a','-x':'#272026','-x+z':'#4b424d','+z':'#3a3139','+x+z':'#251d22','-x-z':'#31282f'}
prisms.append((Q['knob_cx'],-1.8,Q['knob_hx'],0.75,0.45,Q['body_y1']+1.1,Q['body_y1']+2.3,KN_UP,'Viewfinder'))
prisms.append((Q['knob_cx'],-1.8,Q['knob_hx'],0.75,0.45,Q['body_y1'],Q['body_y1']+1.1,KN_LO,'Viewfinder'))
box(1,2, 4.5,6.75, -3,-2,'btn','Button')
# --- lens: ring plate (8x8 voxel circle) + stepped tube
ring={}
for c in range(2,6): ring[(0,c)]='gold'; ring[(7,c)]='gold'; ring[(1,c)]='dring'; ring[(6,c)]='dring'
for r in range(2,6): ring[(r,0)]='gold'; ring[(r,7)]='gold'; ring[(r,1)]='dring'; ring[(r,6)]='dring'
for r,c in [(1,1),(1,6),(6,1),(6,6)]: ring[(r,c)]='gold'
for r in range(2,6):
    for c in range(2,6): ring[(r,c)]=('glass',GLASS[r-2][c-2])
for (r,c),m in ring.items():
    mat=m if isinstance(m,str) else {'top':m[1],'left':m[1],'front':m[1]}
    box(2+c+Q['lens_dx'],3+c+Q['lens_dx'], 8.6-r+Q['lens_dy'],9.6-r+Q['lens_dy'], 2,3, mat, 'Lens')
# tube: the ring's voxel circle extruded back to the body (copper), which gives the stepped side
for (r,c) in ring:
    box(2+c+Q['lens_dx'],3+c+Q['lens_dx'], 8.6-r+Q['lens_dy'],9.6-r+Q['lens_dy'], 0,2, 'tube','Barrel')
# --- tripod (measured on the source): hub = neck / copper band / lower hub, side legs hooked behind it, centre leg below
box(3.0,Q['neck_x1'], -1.4,0,   -0.9,0, 'neckb','Neck')
box(3.75,6.0, -2.7,-1.4, -0.7,0, 'head','TripodRing')
box(3.75,6.0, -3.9,-2.7, -0.7,0, 'neck','Hub')
def bands(fr):
    edges=[0]+fr+[1]
    return [(edges[i],edges[i+1],'legd' if i%2==0 else 'lego') for i in range(len(edges)-1)]
FR=[0.2,0.4,0.62,0.8]
YG=Q['yg']
YC=-3.9; L=YC-YG
# front leg: leans towards the viewer (+Z) by DZF; the X shift keeps it vertical on screen (34*dX + 36*dZ = 0)
DZF=Q['dzf']
dC=np.array([-DZ[0]/U*DZF, -L, DZF])
for f0,f1,m in bands(FR):
    o=np.array([4.4,YC,-0.65])+dC*f0
    boxes.append((o,dC*(f1-f0),np.array([1.0,0,0.]),np.array([0,0,0.65]),m,'LegCenter'))
YT=-1.4; LS=YT-YG
for side,name in [(-1,'LegLeft'),(1,'LegRight')]:
    top=np.array([Q['legL_x'] if side<0 else Q['legR_x'],YT,-0.9])
    d=np.array([Q['legL_dx'] if side<0 else Q['legR_dx'],-LS,0.0])
    for f0,f1,m in bands([0.27,0.45,0.65,0.81]):
        o=top+d*f0-np.array([0.7,0,0.55])
        boxes.append((o,d*(f1-f0),np.array([1.4,0,0.]),np.array([0,0,1.1]),m,name))
# ---------- faces
faces=[]
occ={}
for bi,(o,a,b,c,mat,name) in enumerate(boxes):
    corners=lambda u,v,w: o+u*a+v*b+w*c
    for (fixed,val),(e1,e2) in [((0,0),(b,c)),((0,1),(b,c)),((1,0),(a,c)),((1,1),(a,c)),((2,0),(a,b)),((2,1),(a,b))]:
        vec=[a,b,c][fixed]
        base=o+vec*val
        n=np.cross(e1,e2); n=n/np.linalg.norm(n)
        # outward
        if (n@vec)*(1 if val==1 else -1)<0: n=-n
        if n@W<=1e-9: continue
        quad=[base,base+e1,base+e1+e2,base+e2]
        # classify face orientation
        cand={'top':np.array([0,1,0.]),'left':np.array([-1,0,0.]),'front':np.array([0,0,1.])}
        kind=max(cand,key=lambda k:n@cand[k])
        col=(PAL[mat] if isinstance(mat,str) else mat)[kind]
        poly=Polygon([P(q) for q in quad])
        faces.append(dict(poly=poly,o=base,e1=e1,e2=e2,col=col,name=name,kind=kind,box=bi))
bi=len(boxes)
for (cx,cz,hx,hz,ch,y0,y1,cols,name) in prisms:
    bi+=1
    oc=[(cx-hx+ch,cz-hz),(cx+hx-ch,cz-hz),(cx+hx,cz-hz+ch),(cx+hx,cz+hz-ch),(cx+hx-ch,cz+hz),(cx-hx+ch,cz+hz),(cx-hx,cz+hz-ch),(cx-hx,cz-hz+ch)]
    for k in range(8):
        (xa,za),(xb,zb)=oc[k],oc[(k+1)%8]
        e1=np.array([xb-xa,0,zb-za]); e2=np.array([0,y1-y0,0.]); o=np.array([xa,y0,za])
        n=np.array([zb-za,0,-(xb-xa)]); n=n/np.linalg.norm(n)   # outward for CCW in (x,z)? fixed below
        mid=np.array([(xa+xb)/2-cx,0,(za+zb)/2-cz])
        if n@mid<0: n=-n
        if n@W<=1e-9: continue
        key=('-x' if n[0]<-0.5 else '+x' if n[0]>0.5 else '')+('+z' if n[2]>0.5 else '-z' if n[2]<-0.5 else '')
        col=cols.get(key)
        if col is None: continue
        quad=[o,o+e1,o+e1+e2,o+e2]
        faces.append(dict(poly=Polygon([P(q) for q in quad]),o=o,e1=e1,e2=e2,col=col,name=name,kind=key,box=bi))
    top=[np.array([x,y1,z]) for x,z in oc]
    faces.append(dict(poly=Polygon([P(q) for q in top]),o=top[0],e1=top[1]-top[0],e2=top[3]-top[0],col=cols['top'],name=name,kind='top',box=bi))
print(len(boxes),'boxes',len(faces),'candidate faces')
def depth_at(f,s):
    # 3D point on face plane that projects to screen point s -> depth along W
    M=np.array([[U*f['e1'][0]+DZ[0]*f['e1'][2], U*f['e2'][0]+DZ[0]*f['e2'][2]],
                [-U*f['e1'][1]+DZ[1]*f['e1'][2], -U*f['e2'][1]+DZ[1]*f['e2'][2]]])
    b0=np.array(P(f['o']))
    try: uv=np.linalg.solve(M,np.array(s)-b0)
    except np.linalg.LinAlgError: return -1e9
    p=f['o']+uv[0]*f['e1']+uv[1]*f['e2']; return p@W
vis=[]
for i,f in enumerate(faces):
    g=f['poly']
    blockers=[]
    for j,h in enumerate(faces):
        if i==j or h['box']==f['box']: continue
        inter=g.intersection(h['poly'])
        if inter.area<1e-3: continue
        pt=inter.representative_point().coords[0]
        if depth_at(h,pt)>depth_at(f,pt)+1e-6: blockers.append(h['poly'])
    v=g.difference(unary_union(blockers)) if blockers else g
    if v.area>0.5: vis.append(dict(geom=v,col=f['col'],name=f['name'],kind=f['kind']))
# merge by colour (and part name) into clean shapes
groups={}
for v in vis: groups.setdefault((v['name'],v['col']),[]).append(v['geom'])
shapes=[]
for (name,col),gs in groups.items():
    u=unary_union(gs).buffer(0.01).buffer(-0.01).simplify(0.05)
    shapes.append(dict(name=name,col=col,geom=u))
json.dump([dict(name=s['name'],col=s['col'],wkt=s['geom'].wkt) for s in shapes],open(S+'vox_shapes.json','w'))
print(len(shapes),'merged shapes')
