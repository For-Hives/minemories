"""Flatten the Blockbench model (../minemories-logo.bbmodel) into the canonical logo SVG.

Every visible face of every cube becomes a flat polygon, hidden parts are cut away, polygons of one
colour are merged, and the paths are named after the Blockbench groups (Body, Lens, Barrel, Neck,
TripodRing, Hub, Leg*, Viewfinder, Button, ...). Face colours are read from the model's own texture,
so repainting a face in Blockbench changes the logo.

    python3 blockbench_svg.py [--yaw 50] [--pitch 30] [--fov 20] [--margin 22] [--scale 34]
                              [--model ../minemories-logo.bbmodel] [--out ../minemories-logo.svg]

  --yaw    degrees turned around the vertical axis (positive shows the button side, 0 = straight on)
  --pitch  degrees looking down (negative looks up)
  --fov    vertical field of view in degrees, like Blockbench's camera: 0 = orthographic (no perspective),
           30 = Blockbench's default; the camera is moved back so the size stays the same
  --scale  pixels per model unit at the centre of the model;  --margin  empty border in pixels

Needs numpy, Shapely and Pillow.
"""
import argparse, base64, io, json, math, os
import numpy as np
from PIL import Image
from shapely.geometry import Polygon
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument('--model', default=os.path.join(HERE, '..', 'minemories-logo.bbmodel'))
ap.add_argument('--out', default=os.path.join(HERE, '..', 'minemories-logo.svg'))
ap.add_argument('--yaw', type=float, default=50); ap.add_argument('--pitch', type=float, default=30)
ap.add_argument('--fov', type=float, default=20); ap.add_argument('--scale', type=float, default=34)
ap.add_argument('--margin', type=float, default=22)
A = ap.parse_args()
MODEL, OUT, U, MARGIN = A.model, A.out, A.scale, A.margin
_y, _p = math.radians(A.yaw), math.radians(A.pitch)
W = np.array([-math.sin(_y) * math.cos(_p), math.sin(_p), math.cos(_y) * math.cos(_p)])  # toward the viewer
RIGHT = np.array([math.cos(_y), 0, math.sin(_y)])
UP = np.cross(W, RIGHT)
TARGET, CAM, DIST = np.zeros(3), None, 1.0   # set once the model is read (perspective only)
PART_ORDER = ['Body', 'Grip', 'Lens', 'Barrel', 'Neck', 'TripodRing', 'Hub']

def P(p):
    if CAM is None: return (U * (p @ RIGHT), -U * (p @ UP))
    r = p - CAM; z = -(r @ W)
    return (U * DIST * (r @ RIGHT) / z, -U * DIST * (r @ UP) / z)

m = json.load(open(MODEL))
tex = m['textures'][0]
img = Image.open(io.BytesIO(base64.b64decode(tex['source'].split(',', 1)[1]))).convert('RGB')
sx, sy = img.width / tex.get('uv_width', img.width), img.height / tex.get('uv_height', img.height)
def colour(face):
    u0, v0, u1, v1 = face['uv']
    x = min(img.width - 1, int((u0 + u1) / 2 * sx)); y = min(img.height - 1, int((v0 + v1) / 2 * sy))
    return '#%02x%02x%02x' % img.getpixel((x, y))

group_of = {}
group_tf = {}
def walk(nodes, gname):
    for n in nodes:
        if isinstance(n, dict):
            name = next((g['name'] for g in m['groups'] if g['uuid'] == n['uuid']), gname) if 'uuid' in n else gname
            walk(n['children'], name if gname is None else gname)
        else: group_of[n] = gname
walk(m['outliner'], None)

def rot(r):
    rx, ry, rz = (math.radians(a) for a in r)
    cx, sx_, cy, sy_, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    X = np.array([[1, 0, 0], [0, cx, -sx_], [0, sx_, cx]]); Y = np.array([[cy, 0, sy_], [0, 1, 0], [-sy_, 0, cy]])
    Z = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Z @ Y @ X

faces = []
for bi, e in enumerate(m['elements']):
    f, t = np.array(e['from'], float), np.array(e['to'], float)
    o = np.array(e.get('origin', [0, 0, 0]), float); R = rot(e.get('rotation', [0, 0, 0]))
    grp = next((g for g in m['groups'] if g['name'] == group_of.get(e['uuid'])), None)
    go = np.array(grp['origin'], float) if grp else np.zeros(3); Rg = rot(grp['rotation']) if grp else np.eye(3)
    place = lambda p: go + Rg @ (p - go)        # the group's own rotation, around its origin
    corner = lambda ix, iy, iz: place(o + R @ (np.array([t[0] if ix else f[0], t[1] if iy else f[1], t[2] if iz else f[2]]) - o))
    spec = {'west': (0, (0, 1, 2)), 'east': (1, (0, 1, 2)), 'down': (0, (1, 0, 2)), 'up': (1, (1, 0, 2)),
            'north': (0, (2, 0, 1)), 'south': (1, (2, 0, 1))}
    for name, face in e['faces'].items():
        if face.get('texture') is None: continue
        side, (fixed, a1, a2) = spec[name]
        def pt(i, j, k=side):
            idx = [0, 0, 0]; idx[fixed] = k; idx[a1] = i; idx[a2] = j
            return corner(*idx)
        base = pt(0, 0); e1 = pt(1, 0) - base; e2 = pt(0, 1) - base
        n = np.cross(e1, e2); n /= np.linalg.norm(n)
        centre = place(o + R @ ((f + t) / 2 - o))
        if n @ (base + e1 / 2 + e2 / 2 - centre) < 0: n = -n
        quad = [base, base + e1, base + e1 + e2, base + e2]
        faces.append(dict(quad=quad, n=n, o=base, e1=e1, e2=e2, col=colour(face),
                          name=group_of.get(e['uuid'], e['name']), box=bi))

pts = np.array([q for fc in faces for q in fc['quad']])
TARGET = (pts.min(0) + pts.max(0)) / 2
if A.fov > 0:
    DIST = (pts[:, 1].max() - pts[:, 1].min()) / 2 / math.tan(math.radians(A.fov) / 2)
    CAM = TARGET + W * DIST
else:
    CAM = None
L = np.array([U * RIGHT, -U * UP])    # orthographic: 3D -> screen
if CAM is None: faces = [fc for fc in faces if fc['n'] @ W > 1e-9]
else: faces = [fc for fc in faces if fc['n'] @ (CAM - fc['o']) > 1e-9]
for fc in faces: fc['poly'] = Polygon([P(q) for q in fc['quad']])

def depth_at(fc, s):
    """How near to the viewer the face is at screen point s (bigger = nearer)."""
    if CAM is None:
        M = np.stack([L @ fc['e1'], L @ fc['e2']], 1)
        try: uv = np.linalg.solve(M, np.array(s) - np.array(P(fc['o'])))
        except np.linalg.LinAlgError: return -1e9
        return (fc['o'] + uv[0] * fc['e1'] + uv[1] * fc['e2']) @ W
    d = (s[0] / (U * DIST)) * RIGHT - (s[1] / (U * DIST)) * UP - W
    den = fc['n'] @ d
    return -1e9 if abs(den) < 1e-12 else -(fc['n'] @ (fc['o'] - CAM)) / den

groups = {}
for i, fc in enumerate(faces):
    g = fc['poly']
    if g.area < 1e-6: continue
    blockers = []
    for j, h in enumerate(faces):
        if i == j or h['box'] == fc['box']: continue
        if not g.intersects(h['poly']): continue
        inter = g.intersection(h['poly'])
        if inter.area < 1e-3: continue
        pt = inter.representative_point().coords[0]
        if depth_at(h, pt) > depth_at(fc, pt) + 1e-6: blockers.append(h['poly'])
    v = g.difference(unary_union(blockers)) if blockers else g
    if v.area > 0.5: groups.setdefault((fc['name'], fc['col']), []).append(v)

shapes = [(n, c, unary_union(gs).buffer(0.01).buffer(-0.01).simplify(0.05)) for (n, c), gs in groups.items()]
minx = min(g.bounds[0] for _, _, g in shapes); miny = min(g.bounds[1] for _, _, g in shapes)
maxx = max(g.bounds[2] for _, _, g in shapes); maxy = max(g.bounds[3] for _, _, g in shapes)
OX, OY = MARGIN - minx, MARGIN - miny
Wd, Hd = math.ceil(maxx - minx + 2 * MARGIN), math.ceil(maxy - miny + 2 * MARGIN)

def num(v): return ('%.1f' % v).rstrip('0').rstrip('.')
def ring(c): return 'M' + ' L'.join(f'{num(x + OX)} {num(y + OY)}' for x, y in list(c.coords)[:-1]) + ' Z'
def pathd(g):
    out = ''
    for p in ([g] if g.geom_type == 'Polygon' else list(g.geoms)):
        if p.geom_type != 'Polygon' or p.area < 6: continue
        out += ring(p.exterior) + ''.join(' ' + ring(i) for i in p.interiors) + ' '
    return out.strip()

def rank(name): return PART_ORDER.index(name) if name in PART_ORDER else (50 if name.startswith('Leg') else 60 if name == 'Viewfinder' else 90)
shapes.sort(key=lambda s: (rank(s[0]), s[0], -s[2].area))
lines, seen = [], {}
button = [g for n, _, g in shapes if n == 'Button']
for n, c, g in shapes:
    if n == 'Button': continue
    d = pathd(g)
    if not d: continue
    seen[n] = seen.get(n, 0) + 1
    pid = n if seen[n] == 1 else f'{n}-{seen[n]}'
    lines.append(f'    <path id="{pid}" d="{d}" fill="{c}" stroke="{c}" stroke-width="0.6" stroke-linejoin="round"/>')
# soft glow around the side button (same size as the original logo), drawn under the button
glow = ''
if button:
    bx0, by0, bx1, by1 = unary_union(button).bounds
    gx, gy = (bx0 + bx1) / 2 + OX, (by0 + by1) / 2 + OY
    k = 0.5523
    rx, ry = 58, 66
    gd = (f'M{num(gx - rx)} {num(gy)} C{num(gx - rx)} {num(gy - ry * k * 1.0 * 1.0)} {num(gx - rx * k)} {num(gy - ry)} {num(gx)} {num(gy - ry)} '
          f'C{num(gx + rx * k)} {num(gy - ry)} {num(gx + rx)} {num(gy - ry * k)} {num(gx + rx)} {num(gy)} '
          f'C{num(gx + rx)} {num(gy + ry * k)} {num(gx + rx * k)} {num(gy + ry)} {num(gx)} {num(gy + ry)} '
          f'C{num(gx - rx * k)} {num(gy + ry)} {num(gx - rx)} {num(gy + ry * k)} {num(gx - rx)} {num(gy)} Z')
    lines.append(f'    <path id="ButtonGlow" d="{gd}" fill="url(#radial-gradient-1)"/>')
    seen = {}
    for n, c, g in shapes:
        if n != 'Button': continue
        seen[n] = seen.get(n, 0) + 1
        pid = n if seen[n] == 1 else f'{n}-{seen[n]}'
        lines.append(f'    <path id="{pid}" d="{pathd(g)}" fill="{c}" stroke="{c}" stroke-width="0.6" stroke-linejoin="round"/>')
    glow = (f'    <radialGradient id="radial-gradient-1" cx="{num(gx)}" cy="{num(gy)}" r="{rx}" gradientTransform="translate({num(gx)} {num(gy)}) scale(1 {ry / rx:.3f}) translate({-gx:.1f} {-gy:.1f})" gradientUnits="userSpaceOnUse">\n'
            '      <stop offset="0" stop-color="#ffd25a" stop-opacity="0.34"/>\n'
            '      <stop offset="0.5" stop-color="#ffc94f" stop-opacity="0.12"/>\n'
            '      <stop offset="1" stop-color="#ffc94f" stop-opacity="0"/>\n'
            '    </radialGradient>')
open(OUT, 'w').write(
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    f'<svg xmlns="http://www.w3.org/2000/svg" width="{Wd}" height="{Hd}" viewBox="0 0 {Wd} {Hd}">\n'
    f'  <defs>\n{glow}\n  </defs>\n  <title>Minemories</title>\n  <g id="Layer_1" data-name="Layer 1">\n'
    + '\n'.join(lines) + '\n  </g>\n</svg>\n')
print(len(lines), 'paths,', Wd, 'x', Hd, '->', os.path.abspath(OUT))
