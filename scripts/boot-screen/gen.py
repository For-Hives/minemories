#!/usr/bin/env python3
"""Génère l'écran de chargement (SVG + CSS + script) et l'écrit dans apps/web/index.html.

Un joueur du jeu (peau « Steve ») casse un bloc de minerai à la pioche ; le bloc se fissure, éclate et laisse tomber un diamant.
Le joueur et la pioche sont les textures du JEU (fichiers Mojang) lues dans le client local, jamais téléchargées, puis incrustées en data: URI (aucune requête de plus).
Le bloc et ses fissures sont des dessins VECTORIELS à nous ; le diamant est la vraie texture du jeu convertie en vecteur (net à toute taille).
Ce qui vient du jeu est de la marque : voir docs/features/charte-graphique.md, section 12, avant toute mise en ligne publique.

Usage : python3 scripts/boot-screen/gen.py <minecraft_1.21.1_client.jar> [apps/web/index.html]
Le bloc est entre les marqueurs <!-- boot:begin --> et <!-- boot:end --> (style, balisage, script) ; relancer remplace tout le bloc.
"""
import base64, re, subprocess, sys

jar = sys.argv[1]
target = sys.argv[2] if len(sys.argv) > 2 else 'apps/web/index.html'
T = 4.8
OY = 10


def tex(path):
	data = subprocess.run(['unzip', '-p', jar, 'assets/minecraft/textures/' + path], check=True, capture_output=True).stdout
	return 'data:image/png;base64,' + base64.b64encode(data).decode()


def p(t):
	return round(t / T * 100, 2)


def y(v):
	return v + OY


# --- bloc isométrique 2:1, dessiné en vectoriel : 24 px de demi-largeur, 24 px de haut (plus petit que le joueur, plus mignon) ---
BW, BH = 24, 24
Nx, Ny = 100, y(60)
poly = lambda *a: ' '.join(f'{px:g},{py:g}' for px, py in a)
Np, Ep, Sp, Wp = (Nx, Ny), (Nx + BW, Ny + BW // 2), (Nx, Ny + BW), (Nx - BW, Ny + BW // 2)
Wb, Sb, Eb = (Nx - BW, Ny + BW // 2 + BH), (Nx, Ny + BW + BH), (Nx + BW, Ny + BW // 2 + BH)
top_poly, left_poly, right_poly = poly(Np, Ep, Sp, Wp), poly(Wp, Sp, Sb, Wb), poly(Sp, Ep, Eb, Sb)


def uv(face, u, v):
	"""Point d'une face (u, v dans [0,1]) ; haut, gauche, droite."""
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
	for _ in range(9):   # taches de pierre, claires et sombres
		u, v = rnd.random() * 0.8, rnd.random() * 0.8
		vec_faces += quad(f, u, v, 0.12 + rnd.random() * 0.14, 0.1 + rnd.random() * 0.12, hi if rnd.random() < 0.5 else lo, 0.85)
	for _ in range(ORE[f]):   # filons de diamant : un losange cyan avec un reflet
		u, v = 0.12 + rnd.random() * 0.55, 0.12 + rnd.random() * 0.55
		vec_faces += quad(f, u, v, 0.26, 0.2, '#2bb8aa') + quad(f, u + 0.03, v + 0.03, 0.17, 0.12, '#58f0dd') + quad(f, u + 0.05, v + 0.04, 0.06, 0.04, '#e9fffb')
# --- joueur (vue de côté, face à droite), 1 texel = 2 px : tête 16, torse 24, jambes 24 ---
gy = y(106)          # sol sous les pieds
leg_y = gy - 24
torso_y = leg_y - 24
head_y = torso_y - 16
x0 = 42
sx, sy = x0 + 4, torso_y + 3   # épaule


def part(sx_, sy_, sw, sh, dx, dy, dw, dh, extra=''):
	return f'<svg x="{dx}" y="{dy}" width="{dw}" height="{dh}" viewBox="{sx_} {sy_} {sw} {sh}" preserveAspectRatio="none"{extra}><use href="#skin"/></svg>'


body = ''.join([
	part(16, 52, 4, 12, x0 + 2, leg_y, 8, 24, ' opacity=".7"'),    # jambe gauche (derrière, assombrie, décalée de 2 px)
	part(0, 20, 4, 12, x0, leg_y, 8, 24),                          # jambe droite, côté (aussi large que le torse)
	part(16, 20, 4, 12, x0, torso_y, 8, 24),                       # torse, côté
	part(0, 8, 8, 8, x0 - 4, head_y, 16, 16),                      # tête, côté droit (le visage est à droite)
	part(32, 8, 8, 8, x0 - 4, head_y, 16, 16),                     # calque de la tête
])
# la pioche est DERRIÈRE le bras : elle est dessinée avant, la main passe devant le manche
arm = f'<g transform="translate({sx} {sy + 22}) rotate(135)"><use href="#pick" x="-8" y="-24"/></g>' + part(40, 20, 4, 12, sx - 4, sy, 8, 24)

# --- images du jeu (data: URI, une seule fois) : le joueur et la pioche ; tout le reste est vectoriel ---
defs = (f'<defs><image id="skin" width="64" height="64" href="{tex("entity/player/wide/steve.png")}"/>'
	f'<image id="pick" width="32" height="32" href="{tex("item/iron_pickaxe.png")}"/></defs>')


def crack(face, *pts_uv):
	pts = [uv(face, u, v) for u, v in pts_uv]
	return f'<polyline points="{poly(*pts)}" fill="none" stroke="#17140f" stroke-width="1.2" stroke-linejoin="miter" stroke-linecap="square"/>'


# fissures en trois étapes (vectorielles), sur les faces gauche, droite et haute
cracks = [
	crack('l', (0.3, 0.2), (0.45, 0.42), (0.4, 0.6)) + crack('t', (0.3, 0.35), (0.45, 0.5)),
	crack('l', (0.55, 0.35), (0.72, 0.5), (0.68, 0.78)) + crack('l', (0.45, 0.42), (0.25, 0.7)) + crack('r', (0.25, 0.2), (0.45, 0.4), (0.4, 0.55)),
	crack('l', (0.15, 0.5), (0.35, 0.62), (0.3, 0.85)) + crack('r', (0.6, 0.3), (0.78, 0.5), (0.7, 0.75)) + crack('t', (0.6, 0.2), (0.7, 0.45), (0.5, 0.62)),
]
block = (vec_faces
	+ f'<polygon points="{left_poly}" fill="#000" opacity=".12"/><polygon points="{right_poly}" fill="#000" opacity=".2"/>'
	+ ''.join(f'<g class="bk-c{i}">{c}</g>' for i, c in enumerate(cracks))
	+ f'<polygon points="{poly(Wp, Wb, Sb, Eb, Ep, Np)}" fill="none" stroke="#0a0806" stroke-width="1.6" stroke-linejoin="round"/><polyline points="{poly(Wp, Sp, Ep)} {poly(Sp, Sb)}" fill="none" stroke="#0a0806" stroke-width="1.2" stroke-linejoin="round"/>')

# diamant : la VRAIE texture du jeu (item/diamond.png), convertie en vecteur (un carré par pixel, regroupés en un tracé par couleur) : exactement le dessin du jeu, net à toute taille
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

ix, iy = Nx - 14, y(84)   # point d'impact sur la face gauche
HIT0, STEP = 0.44, 0.8
hits = [HIT0 + STEP * k for k in range(4)]
Wd, Sd, Rd = -150, -55, -30
arm_kf = []
for k in range(4):
	s = STEP * k
	arm_kf += [(s, Wd, 'cubic-bezier(.3,0,.6,1)'), (s + 0.12, Wd - 12, 'cubic-bezier(.6,0,.9,.4)'), (s + HIT0, Sd, 'linear'), (s + 0.62, Sd, 'cubic-bezier(.3,.6,.4,1)')]
arm_kf = [(t, a_, e) for (t, a_, e) in arm_kf if t < 3.0] + [(3.0, Sd, 'cubic-bezier(.3,.6,.4,1)'), (3.5, Rd, 'linear'), (4.2, Rd, 'ease-in-out'), (4.8, Wd, '')]


def kf(name, items, prop):
	out = f'@keyframes {name}{{'
	for tt, val, ease in items:
		out += f'{p(tt)}%{{{prop}:{val};' + (f'animation-timing-function:{ease};' if ease else '') + '}'
	return out + '}'


css = [kf('b-arm', [(a_, f'rotate({b_}deg)', c_) for a_, b_, c_ in arm_kf], 'transform')]
# le joueur se fend vers le bloc à chaque coup (un peu de corps derrière la pioche)
lg = [(0, 'translateX(0) rotate(0)', '')]
for h in hits:
	lg += [(h - 0.14, 'translateX(-1px) rotate(-1deg)', 'cubic-bezier(.6,0,.9,.4)'), (h, 'translateX(3px) rotate(2.5deg)', 'ease-out'), (h + 0.25, 'translateX(0) rotate(0)', '')]
css.append(kf('b-lunge', lg + [(4.8, 'translateX(0) rotate(0)', '')], 'transform'))
# tremblement de l'ensemble à l'impact, plus fort à l'éclatement
sk = [(0, 'translate(0,0)', '')]
for i_, h in enumerate(hits):
	amp = 3.2 if i_ == 3 else 1.5
	sk += [(h - 0.001, 'translate(0,0)', ''), (h + 0.04, f'translate({-amp}px,{amp * .6}px)', ''), (h + 0.09, f'translate({amp * .8}px,{-amp * .5}px)', ''), (h + 0.14, f'translate({-amp * .4}px,{amp * .3}px)', ''), (h + 0.2, 'translate(0,0)', '')]
css.append(kf('b-shake', sk + [(4.8, 'translate(0,0)', '')], 'transform'))
# le bloc s'écrase à chaque coup puis rebondit ; au dernier il gonfle et éclate
bk = [(0, 'translateY(0) scale(1,1)', '')]
for h in hits[:3]:
	bk += [(h - 0.001, 'translateY(0) scale(1,1)', 'ease-out'), (h + 0.05, 'translateY(3px) scale(1.07,.92)', 'ease-out'), (h + 0.13, 'translateY(0) scale(.98,1.03)', 'ease-out'), (h + 0.22, 'translateY(0) scale(1,1)', '')]
bk += [(hits[3] - 0.001, 'translateY(0) scale(1,1)', 'ease-out'), (hits[3] + 0.07, 'translateY(0) scale(1.18,1.18)', 'ease-in'), (hits[3] + 0.26, 'translateY(4px) scale(.3,.3)', ''), (4.8, 'translateY(4px) scale(.3,.3)', '')]
css.append(kf('b-block', bk, 'transform'))
css.append(kf('b-blockfade', [(0, '1', ''), (hits[3] + 0.07, '1', 'ease-in'), (hits[3] + 0.26, '0', ''), (4.6, '0', ''), (4.75, '1', ''), (4.8, '1', '')], 'opacity'))
for k in range(3):
	t0 = hits[k]
	css.append(kf(f'b-c{k}', [(0, '0', ''), (t0 - 0.001, '0', ''), (t0, '1', ''), (4.6, '1', ''), (4.7, '0', ''), (4.8, '0', '')], 'opacity'))
# éclats de pierre à chaque coup : 6 particules en arc (montée rapide, chute avec la gravité)
vec = [(-14, -20, 3, '#9a9a9a'), (-6, -26, 2, '#4aedd9'), (4, -24, 3, '#6b6b6b'), (12, -18, 2, '#c9c9c9'), (-22, -10, 2, '#5a5a5a'), (-10, -14, 3, '#2bb8aa')]
for i, (dx, dy, sz, col) in enumerate(vec):
	its, fade = [(0, 'translate(0,0)', '')], [(0, '0', '')]
	for h in hits:
		its += [(h - 0.001, 'translate(0,0)', 'cubic-bezier(.2,.7,.4,1)'), (h + 0.16, f'translate({dx}px,{dy}px)', 'cubic-bezier(.5,0,.9,.5)'), (h + 0.42, f'translate({dx * 1.5:g}px,{dy + 26}px)', '')]
		fade += [(h - 0.001, '0', ''), (h, '1', ''), (h + 0.3, '1', 'ease-in'), (h + 0.42, '0', '')]
	css.append(kf(f'b-p{i}', its + [(4.8, 'translate(0,0)', '')], 'transform'))
	css.append(kf(f'b-p{i}o', fade + [(4.8, '0', '')], 'opacity'))
# éclatement : 9 morceaux, une bouffée de poussière
sh = [(-30, -18, 5, '#8b8b8b'), (-12, -30, 4, '#6b6b6b'), (14, -28, 5, '#7f7f7f'), (32, -12, 4, '#4aedd9'), (4, -16, 6, '#5a5a5a'), (-22, -6, 4, '#9a9a9a'), (22, -20, 3, '#2bb8aa'), (-4, -34, 3, '#c9c9c9'), (36, -2, 4, '#6b6b6b')]
tb = hits[3]
for i, (dx, dy, sz, col) in enumerate(sh):
	css.append(kf(f'b-s{i}', [(0, 'translate(0,0) rotate(0)', ''), (tb, 'translate(0,0) rotate(0)', 'cubic-bezier(.2,.7,.4,1)'), (tb + 0.28, f'translate({dx}px,{dy}px) rotate({dx * 6}deg)', 'cubic-bezier(.5,0,.9,.5)'), (tb + 0.8, f'translate({dx * 1.4:g}px,{dy + 46}px) rotate({dx * 12}deg)', ''), (4.8, f'translate({dx * 1.4:g}px,{dy + 46}px) rotate({dx * 12}deg)', '')], 'transform'))
	css.append(kf(f'b-s{i}o', [(0, '0', ''), (tb - 0.001, '0', ''), (tb, '1', ''), (tb + 0.6, '1', 'ease-in'), (tb + 0.8, '0', ''), (4.8, '0', '')], 'opacity'))
for i, (dx, dy) in enumerate([(-10, 2), (10, 0), (0, -6)]):
	css.append(kf(f'b-d{i}', [(0, 'translate(0,0) scale(.3)', ''), (tb, 'translate(0,0) scale(.3)', 'ease-out'), (tb + 0.45, f'translate({dx}px,{dy}px) scale(1.6)', ''), (4.8, f'translate({dx}px,{dy}px) scale(1.6)', '')], 'transform'))
	css.append(kf(f'b-d{i}o', [(0, '0', ''), (tb, '.55', 'ease-out'), (tb + 0.45, '0', ''), (4.8, '0', '')], 'opacity'))
# le diamant jaillit du bloc, rebondit deux fois, flotte, puis s'efface ; trois éclats de lumière brillent à tour de rôle
ti = tb + 0.12
css.append(kf('b-item', [(0, 'translateY(0) scale(0)', ''), (ti, 'translateY(0) scale(0)', 'cubic-bezier(.2,.8,.2,1)'), (ti + 0.3, 'translateY(-30px) scale(1.3)', 'cubic-bezier(.5,0,.9,.5)'), (ti + 0.55, 'translateY(-10px) scale(1)', 'cubic-bezier(.2,.8,.4,1)'), (ti + 0.7, 'translateY(-18px) scale(1)', 'cubic-bezier(.5,0,.9,.5)'), (ti + 0.85, 'translateY(-11px) scale(1)', 'steps(3,end)'), (ti + 1.2, 'translateY(-14px) scale(1)', 'steps(3,end)'), (ti + 1.55, 'translateY(-11px) scale(1)', ''), (4.5, 'translateY(-12px) scale(1)', ''), (4.7, 'translateY(-12px) scale(0)', ''), (4.8, 'translateY(0) scale(0)', '')], 'transform'))
for i in range(3):
	t_on = ti + 0.55 + i * 0.28
	css.append(kf(f'b-g{i}', [(0, 'scale(0) rotate(0)', ''), (t_on, 'scale(0) rotate(0)', 'ease-out'), (t_on + 0.14, 'scale(1) rotate(45deg)', 'ease-in'), (t_on + 0.34, 'scale(0) rotate(90deg)', ''), (4.8, 'scale(0) rotate(90deg)', '')], 'transform'))

cls = (f'#boot{{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:#14110e;opacity:0;animation:b-in .2s ease-out .25s forwards,b-max .3s ease-in 20s forwards}}'
	'#boot.is-done{animation:none;opacity:0;transition:opacity .25s ease-out;pointer-events:none}'
	'#boot>svg{width:min(62vw,300px);height:auto;overflow:visible}#boot image{image-rendering:pixelated}'
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
cls += f'#boot .bk-item{{transform-origin:{Nx}px {y(76)}px;animation:b-item {T}s linear infinite}}'
static_hidden = ','.join([f'#boot .bk-p{i}o' for i in range(len(vec))] + [f'#boot .bk-s{i}o' for i in range(len(sh))] + [f'#boot .bk-d{i}o' for i in range(3)] + ['#boot .bk-item', '#boot .bk-c2'])
cls += ('@media (prefers-reduced-motion:reduce){#boot *{animation:none!important}#boot .bk-arm{transform:rotate(-55deg)}#boot .bk-c0,#boot .bk-c1{opacity:1}'
	f'{static_hidden}{{opacity:0}}#boot .bk-g0,#boot .bk-g1,#boot .bk-g2{{transform:scale(0)}}}}')
style = f'<style>{cls}{"".join(css)}</style>'

parts = ''.join(f'<g class="bk-p{i}"><g class="bk-p{i}o"><rect x="{ix}" y="{iy}" width="{sz}" height="{sz}" fill="{col}"/></g></g>' for i, (_, _, sz, col) in enumerate(vec))
shards = ''.join(f'<g class="bk-s{i}"><g class="bk-s{i}o"><rect x="{Nx - sz // 2}" y="{y(66)}" width="{sz}" height="{sz}" fill="{col}"/></g></g>' for i, (_, _, sz, col) in enumerate(sh))
dust = ''.join(f'<g class="bk-d{i}"><g class="bk-d{i}o"><circle cx="{Nx + (i - 1) * 6}" cy="{y(86)}" r="9" fill="#b8b4ac"/></g></g>' for i in range(3))
GX, GY = Nx - GEM_W // 2, y(62)
star = lambda cx, cy, r: f'<polygon points="{cx},{cy - r} {cx + r * .28:g},{cy - r * .28:g} {cx + r},{cy} {cx + r * .28:g},{cy + r * .28:g} {cx},{cy + r} {cx - r * .28:g},{cy + r * .28:g} {cx - r},{cy} {cx - r * .28:g},{cy - r * .28:g}" fill="#eafffb"/>'
sparkles = ''.join(f'<g transform="translate({cx} {cy})"><g class="bk-g{i}">{star(0, 0, r)}</g></g>' for i, (cx, cy, r) in enumerate([(GX + 2, GY + 3, 5), (GX + GEM_W - 1, GY + 8, 4), (GX + 9, GY - 4, 3.5)]))
svg = (f'<svg viewBox="0 0 160 136" aria-hidden="true" focusable="false">{defs}<g class="bk-shake"><polygon points="{poly((Nx, y(86)), (146, y(106)), (Nx, y(126)), (54, y(106)))}" fill="#000" opacity=".4"/>'
	f'<g class="bk-fade"><g class="bk-blk">{block}</g></g>{dust}{parts}{shards}'
	f'<g class="bk-item"><g transform="translate({GX} {GY})">{GEM}</g>{sparkles}</g>'
	f'<g class="bk-chr">{body}<g class="bk-arm">{arm}</g></g></g></svg>')
markup = f'<div id="boot" role="status"><span class="boot-t boot-en">Loading…</span><span class="boot-t boot-fr">Chargement…</span>{svg}</div>'
script = ("<script>!function(){var b=document.getElementById('boot');if(!b)return;var t=performance.now(),d=0,l=0,r=0;function h(){if(d)return;d=1;var e=performance.now()-t,"
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
print('ok', len(html), 'octets')
