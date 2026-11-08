#!/usr/bin/env python3
"""ARCHIVED (08/11/2026): the landing's loading screen until that date, replaced by the chunk-loading screen of scripts/boot-screen/gen.mjs.
Kept unchanged so it can come back: see scripts/boot-screen/legacy/README.md. Nothing in the build reads this file.
Restore: `python3 scripts/boot-screen/legacy/steve-ore.py <minecraft_1.21.1_client.jar>` (rewrites the boot:begin/boot:end blocks of apps/web/index.html),
or paste the three blocks of steve-ore.boot.html (its exact last output) back in place; then put back the matching apps/web/src/boot-screen.test.ts.

Generates the loading screen (SVG + CSS + script) and writes it into apps/web/index.html.

A player from the game ("Steve" skin) mines an ore block with a pickaxe; the block cracks, bursts and drops a diamond.
The player and the pickaxe are the GAME textures (Mojang files) read from the local client, never downloaded, then inlined as data: URIs (no extra request).
The block and its cracks are our own VECTOR drawings; the diamond is the real game texture converted to vectors (sharp at any size).
Anything taken from the game is brand material: see docs/features/brand-guidelines.md, section 12, before any public release.

Usage: python3 scripts/boot-screen/legacy/steve-ore.py <minecraft_1.21.1_client.jar> [apps/web/index.html]
The block sits between the <!-- boot:begin --> and <!-- boot:end --> markers (style, markup, script); running again replaces the whole block.
"""
import base64, re, subprocess, sys

jar = sys.argv[1]
target = sys.argv[2] if len(sys.argv) > 2 else 'apps/web/index.html'
T = 6.2   # loop length: long enough for the diamond to be seen on the ground
OY = 10


def tex(path):
	data = subprocess.run(['unzip', '-p', jar, 'assets/minecraft/textures/' + path], check=True, capture_output=True).stdout
	return 'data:image/png;base64,' + base64.b64encode(data).decode()


def p(t):
	return round(t / T * 100, 2)


def y(v):
	return v + OY


# --- 2:1 isometric block, drawn as vectors: 24 px half-width, 24 px tall (smaller than the player, cuter) ---
BW, BH = 24, 24
Nx, Ny = 100, y(60)
poly = lambda *a: ' '.join(f'{px:g},{py:g}' for px, py in a)
Np, Ep, Sp, Wp = (Nx, Ny), (Nx + BW, Ny + BW // 2), (Nx, Ny + BW), (Nx - BW, Ny + BW // 2)
Wb, Sb, Eb = (Nx - BW, Ny + BW // 2 + BH), (Nx, Ny + BW + BH), (Nx + BW, Ny + BW // 2 + BH)
top_poly, left_poly, right_poly = poly(Np, Ep, Sp, Wp), poly(Wp, Sp, Sb, Wb), poly(Sp, Ep, Eb, Sb)


def uv(face, u, v):
	"""Point on a face (u, v in [0,1]); top, left, right."""
	if face == 't':
		return (Nx + u * BW - v * BW, Ny + u * BW / 2 + v * BW / 2)
	if face == 'l':
		return (Wp[0] + u * BW, Wp[1] + u * BW / 2 + v * BH)
	return (Sp[0] + u * BW, Sp[1] - u * BW / 2 + v * BH)


def quad(face, u, v, du, dv, fill, op=1):
	pts = [uv(face, u, v), uv(face, u + du, v), uv(face, u + du, v + dv), uv(face, u, v + dv)]
	return f'<polygon points="{poly(*pts)}" fill="{fill}"' + (f' opacity="{op}"' if op != 1 else '') + '/>'


import random
rnd = random.Random(7)
FACE = {'t': ('#a3a3a3', '#bcbcbc', '#8a8a8a'), 'l': ('#7d7d7d', '#939393', '#686868'), 'r': ('#646464', '#777777', '#515151')}
ORE = {'t': 1, 'l': 2, 'r': 2}
vec_faces = ''
for f, (base, hi, lo) in FACE.items():
	poly_f = {'t': top_poly, 'l': left_poly, 'r': right_poly}[f]
	vec_faces += f'<polygon points="{poly_f}" fill="{base}"/>'
	for _ in range(9):   # stone speckles, light and dark
		u, v = rnd.random() * 0.8, rnd.random() * 0.8
		vec_faces += quad(f, u, v, 0.12 + rnd.random() * 0.14, 0.1 + rnd.random() * 0.12, hi if rnd.random() < 0.5 else lo, 0.85)
	for _ in range(ORE[f]):   # diamond veins: a cyan rhombus with a highlight
		u, v = 0.12 + rnd.random() * 0.55, 0.12 + rnd.random() * 0.55
		vec_faces += quad(f, u, v, 0.26, 0.2, '#2bb8aa') + quad(f, u + 0.03, v + 0.03, 0.17, 0.12, '#58f0dd') + quad(f, u + 0.05, v + 0.04, 0.06, 0.04, '#e9fffb')
# --- player (side view, facing right), 1 texel = 2 px: head 16, torso 24, legs 24 ---
gy = y(106)          # ground under the feet
leg_y = gy - 24
torso_y = leg_y - 24
head_y = torso_y - 16
x0 = 42
sx, sy = x0 + 4, torso_y + 3   # shoulder


def part(sx_, sy_, sw, sh, dx, dy, dw, dh, extra=''):
	return f'<svg x="{dx}" y="{dy}" width="{dw}" height="{dh}" viewBox="{sx_} {sy_} {sw} {sh}" preserveAspectRatio="none"{extra}><use href="#skin"/></svg>'


body = ''.join([
	part(16, 52, 4, 12, x0 + 2, leg_y, 6, 24, ' opacity=".7"'),    # left leg (behind, darkened), 6 px wide
	part(0, 20, 4, 12, x0, leg_y, 6, 24),                          # right leg, side: 6 px, both legs are 8 px like the torso
	part(16, 20, 4, 12, x0, torso_y, 8, 24),                       # torso, side
	part(0, 8, 8, 8, x0 - 4, head_y, 16, 16),                      # head, right side (the face is on the right)
	part(32, 8, 8, 8, x0 - 4, head_y, 16, 16),                     # head overlay layer
])
# the pickaxe is BEHIND the arm: it is drawn first, the hand goes in front of the handle
arm = f'<g transform="translate({sx} {sy + 22}) rotate(135)"><use href="#pick" x="-8" y="-24"/></g>' + part(40, 20, 4, 12, sx - 4, sy, 8, 24)

# Game images are shown at a WHOLE multiple of their size (160 viewBox: 240 px = x1.5, i.e. 3 px per texel; 320 px = x2, i.e. 4 px per texel) with `image-rendering: pixelated`:
# a texel always has the same on-screen size and nothing is smoothed.
# --- game images (data: URIs, once): the player and the pickaxe; everything else is vector ---
defs = (f'<defs><image id="skin" width="64" height="64" href="{tex("entity/player/wide/steve.png")}"/>'
	f'<image id="pick" width="32" height="32" href="{tex("item/iron_pickaxe.png")}"/>')


def destroy_stage(n):
	"""A REAL game breaking texture (block/destroy_stage_N.png) as vectors: dark pixels (61) carve the crack, light ones (155) brighten it.
	The game blends the texture with the block by multiplying (result = 2 x texture x block): here, half-transparent black for the dark pixels, very faint white for the light ones."""
	from PIL import Image
	import io
	data = subprocess.run(['unzip', '-p', jar, f'assets/minecraft/textures/block/destroy_stage_{n}.png'], check=True, capture_output=True).stdout
	im = Image.open(io.BytesIO(data)).convert('RGBA')
	runs = {61: [], 155: []}
	for yy in range(im.height):
		xx = 0
		while xx < im.width:
			r, _, _, aa = im.getpixel((xx, yy))
			if aa < 128 or r not in runs:
				xx += 1
				continue
			x1 = xx
			while x1 + 1 < im.width and im.getpixel((x1 + 1, yy))[:1] == (r,) and im.getpixel((x1 + 1, yy))[3] >= 128:
				x1 += 1
			runs[r].append((xx, yy, x1 - xx + 1))
			xx = x1 + 1
	path = lambda rs: ''.join(f'M{x} {yy}h{w}v1h-{w}z' for x, yy, w in rs)
	return f'<g id="ds{n}" shape-rendering="crispEdges"><path fill="#fff" opacity=".13" d="{path(runs[155])}"/><path fill="#000" opacity=".55" d="{path(runs[61])}"/></g>'


# like in the game: the same texture on EVERY face, changing on each hit (stages 2, 5 then 8 out of 10); the 4th hit breaks the block
STAGES = [2, 5, 8]
# SVG matrix of a face: 16 x 16 texture -> the face's parallelogram (top, left, right)
FACE_MATRIX = {
	't': (BW / 16, BW / 32, -BW / 16, BW / 32, Nx, Ny),
	'l': (BW / 16, BW / 32, 0, BH / 16, Wp[0], Wp[1]),
	'r': (BW / 16, -BW / 32, 0, BH / 16, Sp[0], Sp[1]),
}
cracks = [''.join(f'<use href="#ds{n}" transform="matrix({" ".join(f"{v:g}" for v in m)})"/>' for m in FACE_MATRIX.values()) for n in STAGES]
stage_defs = ''.join(destroy_stage(n) for n in STAGES)
block = (vec_faces
	+ f'<polygon points="{left_poly}" fill="#000" opacity=".12"/><polygon points="{right_poly}" fill="#000" opacity=".2"/>'
	+ ''.join(f'<g class="bk-c{i}">{c}</g>' for i, c in enumerate(cracks))
	+ f'<polygon points="{poly(Wp, Wb, Sb, Eb, Ep, Np)}" fill="none" stroke="#0a0806" stroke-width="1.6" stroke-linejoin="round"/><polyline points="{poly(Wp, Sp, Ep)} {poly(Sp, Sb)}" fill="none" stroke="#0a0806" stroke-width="1.2" stroke-linejoin="round"/>')

# diamond: the REAL game texture (item/diamond.png) converted to vectors (one square per pixel, grouped into one path per color): exactly the game drawing, sharp at any size
def vector_texture(path):
	from PIL import Image
	import io
	data = subprocess.run(['unzip', '-p', jar, 'assets/minecraft/textures/' + path], check=True, capture_output=True).stdout
	im = Image.open(io.BytesIO(data)).convert('RGBA')
	runs = {}
	for yy in range(im.height):
		xx = 0
		while xx < im.width:
			r, gg, bb, aa = im.getpixel((xx, yy))
			if aa < 8:
				xx += 1
				continue
			x1 = xx
			while x1 + 1 < im.width and im.getpixel((x1 + 1, yy)) == (r, gg, bb, aa):
				x1 += 1
			runs.setdefault(f'#{r:02x}{gg:02x}{bb:02x}', []).append((xx, yy, x1 - xx + 1))
			xx = x1 + 1
	return ''.join(f'<path fill="{c}" d="' + ''.join(f'M{x} {yy}h{w}v1h-{w}z' for x, yy, w in rs) + '"/>' for c, rs in runs.items())


GEM = f'<g transform="scale(1.3)">{vector_texture("item/diamond.png")}</g>'   # 21 x 21 px
GEM_W = 21

ix, iy = Nx - 14, y(84)   # impact point on the left face
HIT0, STEP = 0.44, 0.8
hits = [HIT0 + STEP * k for k in range(4)]
Wd, Sd, Rd = -150, -55, -30
arm_kf = []
for k in range(4):
	s = STEP * k
	arm_kf += [(s, Wd, 'cubic-bezier(.3,0,.6,1)'), (s + 0.2, Wd - 24, 'linear'), (s + 0.3, Wd - 24, 'cubic-bezier(.7,0,.95,.35)'), (s + HIT0, Sd, 'linear'), (s + 0.64, Sd, 'cubic-bezier(.3,.6,.4,1)')]
arm_kf = [(t, a_, e) for (t, a_, e) in arm_kf if t < 3.0] + [(3.0, Sd, 'cubic-bezier(.3,.6,.4,1)'), (3.5, Rd, 'linear'), (T - 0.9, Rd, 'ease-in-out'), (T, Wd, '')]


def kf(name, items, prop):
	out = f'@keyframes {name}{{'
	for tt, val, ease in items:
		out += f'{p(tt)}%{{{prop}:{val};' + (f'animation-timing-function:{ease};' if ease else '') + '}'
	return out + '}'


css = [kf('b-arm', [(a_, f'rotate({b_}deg)', c_) for a_, b_, c_ in arm_kf], 'transform')]
# the player lunges toward the block on each hit (some body weight behind the pickaxe)
lg = [(0, 'translateX(0) rotate(0)', '')]
for h in hits:
	lg += [(h - 0.32, 'translateX(0) rotate(0)', 'ease-out'), (h - 0.2, 'translateX(-3px) rotate(-5deg)', 'linear'), (h - 0.1, 'translateX(-3px) rotate(-5deg)', 'cubic-bezier(.7,0,.95,.35)'), (h, 'translateX(4px) rotate(3.5deg)', 'ease-out'), (h + 0.28, 'translateX(0) rotate(0)', '')]
css.append(kf('b-lunge', lg + [(T, 'translateX(0) rotate(0)', '')], 'transform'))
# the whole scene shakes on impact, harder when the block bursts
sk = [(0, 'translate(0,0)', '')]
for i_, h in enumerate(hits):
	amp = 3.2 if i_ == 3 else 1.5
	sk += [(h - 0.001, 'translate(0,0)', ''), (h + 0.04, f'translate({-amp}px,{amp * .6}px)', ''), (h + 0.09, f'translate({amp * .8}px,{-amp * .5}px)', ''), (h + 0.14, f'translate({-amp * .4}px,{amp * .3}px)', ''), (h + 0.2, 'translate(0,0)', '')]
css.append(kf('b-shake', sk + [(T, 'translate(0,0)', '')], 'transform'))
# the block squashes on each hit then bounces back; on the last one it swells and bursts
bk = [(0, 'translateY(0) scale(1,1)', '')]
for h in hits[:3]:
	bk += [(h - 0.001, 'translateY(0) scale(1,1)', 'ease-out'), (h + 0.05, 'translateY(3px) scale(1.07,.92)', 'ease-out'), (h + 0.13, 'translateY(0) scale(.98,1.03)', 'ease-out'), (h + 0.22, 'translateY(0) scale(1,1)', '')]
bk += [(hits[3] - 0.001, 'translateY(0) scale(1,1)', 'ease-out'), (hits[3] + 0.07, 'translateY(0) scale(1.18,1.18)', 'ease-in'), (hits[3] + 0.26, 'translateY(4px) scale(.3,.3)', ''), (T, 'translateY(4px) scale(.3,.3)', '')]
css.append(kf('b-block', bk, 'transform'))
css.append(kf('b-blockfade', [(0, '1', ''), (hits[3] + 0.07, '1', 'ease-in'), (hits[3] + 0.26, '0', ''), (T - 0.2, '0', ''), (T - 0.05, '1', ''), (T, '1', '')], 'opacity'))
for k in range(3):
	t0 = hits[k]
	off = [(hits[k + 1] - 0.001, '1', ''), (hits[k + 1], '0', '')] if k < 2 else [(T - 0.2, '1', ''), (T - 0.1, '0', '')]
	css.append(kf(f'b-c{k}', [(0, '0', ''), (t0 - 0.001, '0', ''), (t0, '1', '')] + off + [(T, '0', '')], 'opacity'))
# stone chips on each hit: 6 particles in an arc (fast rise, fall with gravity), DIFFERENT on each hit (random origin and vectors, fixed seed)
rnd2 = random.Random(21)
origins = [(0, 0), (9, -7), (-5, 5), (13, 3)]
cols = ['#9a9a9a', '#4aedd9', '#6b6b6b', '#c9c9c9', '#5a5a5a', '#2bb8aa']
sizes = [3, 2, 3, 2, 2, 3]
vec = [(0, 0, sizes[i], cols[i]) for i in range(6)]
for i in range(6):
	its, fade = [(0, 'translate(0,0)', '')], [(0, '0', '')]
	for k, h in enumerate(hits):
		ox, oy = origins[k]
		dx = rnd2.randint(-36, 32)
		dy = -rnd2.randint(10, 36)
		its += [(h - 0.001, f'translate({ox}px,{oy}px)', 'cubic-bezier(.2,.7,.4,1)'), (h + 0.16, f'translate({ox + dx}px,{oy + dy}px)', 'cubic-bezier(.5,0,.9,.5)'), (h + 0.44, f'translate({ox + dx * 1.5:g}px,{oy + dy + 30}px)', '')]
		fade += [(h - 0.001, '0', ''), (h, '1', ''), (h + 0.3, '1', 'ease-in'), (h + 0.44, '0', '')]
	css.append(kf(f'b-p{i}', its + [(T, 'translate(0,0)', '')], 'transform'))
	css.append(kf(f'b-p{i}o', fade + [(T, '0', '')], 'opacity'))
# burst: 9 pieces, a puff of dust
sh = [(-30, -18, 5, '#8b8b8b'), (-12, -30, 4, '#6b6b6b'), (14, -28, 5, '#7f7f7f'), (32, -12, 4, '#4aedd9'), (4, -16, 6, '#5a5a5a'), (-22, -6, 4, '#9a9a9a'), (22, -20, 3, '#2bb8aa'), (-4, -34, 3, '#c9c9c9'), (36, -2, 4, '#6b6b6b')]
tb = hits[3]
for i, (dx, dy, sz, col) in enumerate(sh):
	css.append(kf(f'b-s{i}', [(0, 'translate(0,0) rotate(0)', ''), (tb, 'translate(0,0) rotate(0)', 'cubic-bezier(.2,.7,.4,1)'), (tb + 0.28, f'translate({dx}px,{dy}px) rotate({dx * 6}deg)', 'cubic-bezier(.5,0,.9,.5)'), (tb + 0.8, f'translate({dx * 1.4:g}px,{dy + 46}px) rotate({dx * 12}deg)', ''), (T, f'translate({dx * 1.4:g}px,{dy + 46}px) rotate({dx * 12}deg)', '')], 'transform'))
	css.append(kf(f'b-s{i}o', [(0, '0', ''), (tb - 0.001, '0', ''), (tb, '1', ''), (tb + 0.6, '1', 'ease-in'), (tb + 0.8, '0', ''), (T, '0', '')], 'opacity'))
for i, (dx, dy) in enumerate([(-10, 2), (10, 0), (0, -6)]):
	css.append(kf(f'b-d{i}', [(0, 'translate(0,0) scale(.3)', ''), (tb, 'translate(0,0) scale(.3)', 'ease-out'), (tb + 0.45, f'translate({dx}px,{dy}px) scale(1.6)', ''), (T, f'translate({dx}px,{dy}px) scale(1.6)', '')], 'transform'))
	css.append(kf(f'b-d{i}o', [(0, '0', ''), (tb, '.55', 'ease-out'), (tb + 0.45, '0', ''), (T, '0', '')], 'opacity'))
# the diamond pops out of the block, lands ON THE GROUND (squashing a little), bounces twice, rests long enough to be seen, then fades; three sparkles shine in turn
ti = tb + 0.12
FLOOR = 16   # the ground: 16 px below the block center
css.append(kf('b-item', [(0, 'translateY(0) scale(0)', ''), (ti, 'translateY(0) scale(0)', 'cubic-bezier(.2,.8,.2,1)'), (ti + 0.3, 'translateY(-32px) scale(1.3)', 'cubic-bezier(.5,0,.9,.5)'), (ti + 0.64, f'translateY({FLOOR}px) scale(1,1)', 'ease-out'), (ti + 0.68, f'translateY({FLOOR + 2}px) scale(1.2,.8)', 'cubic-bezier(.2,.8,.4,1)'), (ti + 0.84, f'translateY({FLOOR - 14}px) scale(1,1)', 'cubic-bezier(.5,0,.9,.5)'), (ti + 1.0, f'translateY({FLOOR}px) scale(1.08,.92)', 'cubic-bezier(.2,.8,.4,1)'), (ti + 1.1, f'translateY({FLOOR - 5}px) scale(1,1)', 'cubic-bezier(.5,0,.9,.5)'), (ti + 1.18, f'translateY({FLOOR}px) scale(1,1)', ''), (T - 0.5, f'translateY({FLOOR}px) scale(1,1)', ''), (T - 0.3, f'translateY({FLOOR}px) scale(0)', ''), (T, 'translateY(0) scale(0)', '')], 'transform'))
css.append(kf('b-gs', [(0, 'scale(0)', ''), (ti + 0.3, 'scale(.3)', ''), (ti + 0.64, 'scale(1)', ''), (ti + 0.84, 'scale(.6)', ''), (ti + 1.0, 'scale(1)', ''), (T - 0.5, 'scale(1)', ''), (T - 0.3, 'scale(0)', ''), (T, 'scale(0)', '')], 'transform'))
for i in range(3):
	t_on = ti + 1.0 + i * 0.32
	css.append(kf(f'b-g{i}', [(0, 'scale(0) rotate(0)', ''), (t_on, 'scale(0) rotate(0)', 'ease-out'), (t_on + 0.14, 'scale(1) rotate(45deg)', 'ease-in'), (t_on + 0.34, 'scale(0) rotate(90deg)', ''), (T, 'scale(0) rotate(90deg)', '')], 'transform'))

cls = (f'#boot{{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:#14110e;opacity:0;animation:b-in .2s ease-out .25s forwards,b-max .3s ease-in 20s forwards}}'
	'#boot.is-done{animation:none;opacity:0;transition:opacity .25s ease-out;pointer-events:none}'
	'#boot>svg{width:240px;height:auto;overflow:visible}@media (min-width:420px){#boot>svg{width:320px}}#boot svg,#boot image,#boot use{image-rendering:pixelated}'
	'#boot .boot-t{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}'
	'html[lang^=fr] #boot .boot-en,html:not([lang^=fr]) #boot .boot-fr{display:none}'
	'@keyframes b-in{to{opacity:1}}@keyframes b-max{to{opacity:0;visibility:hidden}}#boot svg *{transform-box:view-box}'
	f'#boot .bk-shake{{animation:b-shake {T}s linear infinite}}'
	f'#boot .bk-arm{{transform-origin:{sx}px {sy}px;animation:b-arm {T}s linear infinite}}#boot .bk-chr{{transform-origin:{x0 + 4}px {gy}px;animation:b-lunge {T}s linear infinite}}'
	f'#boot .bk-blk{{transform-origin:{Nx}px {Sb[1]}px;animation:b-block {T}s linear infinite}}#boot .bk-fade{{animation:b-blockfade {T}s linear infinite}}')
for i in range(3):
	cls += f'#boot .bk-c{i}{{animation:b-c{i} {T}s linear infinite}}'
for i in range(len(vec)):
	cls += f'#boot .bk-p{i}{{animation:b-p{i} {T}s linear infinite}}#boot .bk-p{i}o{{animation:b-p{i}o {T}s linear infinite}}'
for i in range(len(sh)):
	cls += f'#boot .bk-s{i}{{transform-origin:{Nx}px {y(70)}px;animation:b-s{i} {T}s linear infinite}}#boot .bk-s{i}o{{animation:b-s{i}o {T}s linear infinite}}'
for i in range(3):
	cls += f'#boot .bk-d{i}{{transform-origin:{Nx}px {y(86)}px;animation:b-d{i} {T}s linear infinite}}#boot .bk-d{i}o{{animation:b-d{i}o {T}s linear infinite}}'
	cls += f'#boot .bk-g{i}{{animation:b-g{i} {T}s linear infinite}}'
cls += f'#boot .bk-item{{transform-origin:{Nx}px {y(76)}px;animation:b-item {T}s linear infinite}}#boot .bk-gs{{transform-origin:{Nx}px {y(98)}px;animation:b-gs {T}s linear infinite}}'
static_hidden = ','.join([f'#boot .bk-p{i}o' for i in range(len(vec))] + [f'#boot .bk-s{i}o' for i in range(len(sh))] + [f'#boot .bk-d{i}o' for i in range(3)] + ['#boot .bk-item', '#boot .bk-gs', '#boot .bk-c0', '#boot .bk-c2'])
cls += ('@media (prefers-reduced-motion:reduce){#boot *{animation:none!important}#boot .bk-arm{transform:rotate(-55deg)}#boot .bk-c1{opacity:1}'
	f'{static_hidden}{{opacity:0}}#boot .bk-g0,#boot .bk-g1,#boot .bk-g2{{transform:scale(0)}}}}')
style = f'<style>{cls}{"".join(css)}</style>'

parts = ''.join(f'<g class="bk-p{i}"><g class="bk-p{i}o"><rect x="{ix}" y="{iy}" width="{sz}" height="{sz}" fill="{col}"/></g></g>' for i, (_, _, sz, col) in enumerate(vec))
shards = ''.join(f'<g class="bk-s{i}"><g class="bk-s{i}o"><rect x="{Nx - sz // 2}" y="{y(66)}" width="{sz}" height="{sz}" fill="{col}"/></g></g>' for i, (_, _, sz, col) in enumerate(sh))
dust = ''.join(f'<g class="bk-d{i}"><g class="bk-d{i}o"><circle cx="{Nx + (i - 1) * 6}" cy="{y(86)}" r="9" fill="#b8b4ac"/></g></g>' for i in range(3))
GX, GY = Nx - GEM_W // 2, y(62)
star = lambda cx, cy, r: f'<polygon points="{cx},{cy - r} {cx + r * .28:g},{cy - r * .28:g} {cx + r},{cy} {cx + r * .28:g},{cy + r * .28:g} {cx},{cy + r} {cx - r * .28:g},{cy + r * .28:g} {cx - r},{cy} {cx - r * .28:g},{cy - r * .28:g}" fill="#eafffb"/>'
sparkles = ''.join(f'<g transform="translate({cx} {cy})"><g class="bk-g{i}">{star(0, 0, r)}</g></g>' for i, (cx, cy, r) in enumerate([(GX + 2, GY + 3, 5), (GX + GEM_W - 1, GY + 8, 4), (GX + 9, GY - 4, 3.5)]))
svg = (f'<svg viewBox="0 0 160 136" aria-hidden="true" focusable="false">{defs}{stage_defs}</defs><g class="bk-shake"><polygon points="{poly((Nx, y(86)), (146, y(106)), (Nx, y(126)), (54, y(106)))}" fill="#000" opacity=".4"/>'
	f'<g class="bk-fade"><g class="bk-blk">{block}</g></g>{dust}{parts}{shards}'
	f'<g class="bk-gs"><ellipse cx="{Nx}" cy="{y(98)}" rx="9" ry="3.2" fill="#000" opacity=".5"/></g>'
	f'<g class="bk-item"><g transform="translate({GX} {GY})">{GEM}</g>{sparkles}</g>'
	f'<g class="bk-chr">{body}<g class="bk-arm">{arm}</g></g></g></svg>')
markup = f'<div id="boot" role="status"><span class="boot-t boot-en">Loading…</span><span class="boot-t boot-fr">Chargement…</span>{svg}</div>'
script = ("<script>!function(){var b=document.getElementById('boot');if(!b)return;if(location.pathname!=='/'){b.remove();return}var t=performance.now(),d=0,l=0,r=0;function h(){if(d)return;d=1;var e=performance.now()-t,"
	"w=e>250&&e<1150?1150-e:0;setTimeout(function(){b.classList.add('is-done');setTimeout(function(){b.remove()},300)},w)}"
	"function g(){if(l&&r)h()}"
	"if(document.readyState==='complete')l=1;if(document.documentElement.dataset.mmReady==='1')r=1;"
	"addEventListener('load',function(){l=1;g()});addEventListener('mm:ready',function(){r=1;g()});g();setTimeout(h,20000)}()</script>")

html = open(target).read()
html = re.sub(r'\s*<!-- boot:begin -->.*?<!-- boot:end -->', '', html, flags=re.S)
html = re.sub(r'\s*<style>#boot\{.*?</style>', '', html, flags=re.S)
html = re.sub(r'\s*<div id="boot".*?</div>(?=\s*<div id="app">)', '', html, flags=re.S)
html = re.sub(r'\s*<script>!function\(\)\{var b=document.getElementById\(\'boot\'\).*?</script>', '', html, flags=re.S)
html = html.replace('</head>', f'    <!-- boot:begin -->{style}<!-- boot:end -->\n  </head>', 1)
html = html.replace('<div id="app"></div>', f'<!-- boot:begin -->{markup}<!-- boot:end -->\n    <div id="app"></div>', 1)
html = html.replace('<script type="module" src="/src/main.tsx"></script>', f'<!-- boot:begin -->{script}<!-- boot:end -->\n    <script type="module" src="/src/main.tsx"></script>', 1)
open(target, 'w').write(html)
print('ok', len(html), 'bytes')
