# Page d'accueil : le film

La page `/` est un **film de 55,5 s** (Three.js, captures réelles d'un chalet) **piloté par le défilement**, habillé de l'interface du jeu (chat, bulle de frappe, menu pause, titres `/title`, barre d'objets en HTML par-dessus le canvas), puis **le site** : le modèle 3D vivant passe dans un panneau à côté du texte (étapes, partage, limites, FAQ, pied de page). L'état du film est une **fonction pure du temps** ; le défilement, la molette, le doigt et les touches ne font que donner des deltas à l'horloge (`scrub.js`).

Le prototype (rapports, décisions, tests de contrôle) vit dans `docs/marketing/v0/` : **dossier local, ignoré par Git**. Ce document décrit ce qui est intégré au dépôt.

## Conception de l'intégration

1. `HomePage` rend `HeroFilm`. Le balisage de `hero.html` est du JSX (`HeroMarkup.tsx`, mêmes classes et mêmes `id` : le code du film et son CSS les adressent tels quels).
2. Le balisage est rendu **une seule fois** (composant mémoïsé sans props), **en français** : c'est la langue du prérendu, et la première rendue côté client. Le film réécrit ensuite les éléments `data-i18n` dans la langue du visiteur (`apply()` du pont i18n). React et le film n'écrivent donc jamais le même nœud deux fois ; pas d'erreur d'hydratation.
3. Ce qui dépend de la session ou de la langue (lien compte, sélecteur de langue, liens du pied de page, sections ajoutées) est dans `HeroParts.tsx`, des composants à part qui suivent le contexte de l'app.
4. Le **film est 100 % côté client** : `import('../hero/hero.js')` dans un `useEffect`. Le prérendu contient tout le site (titres, étapes, FAQ, « Le film, en mots »), lisible sans JavaScript et sans WebGL. Sans WebGL 2 (ou `?nowebgl=1`), la scène n'est jamais chargée : le site est la page, l'image fixe du modèle est le panneau.
5. `hero.js` n'est plus un script qui s'exécute à l'import : `mountHero({ i18n, capturesUrl })` renvoie `dispose()`. Tous les écouteurs de `window` et `document` passent par un `AbortController`, la boucle de frames s'arrête, `scene.dispose()` libère le contexte WebGL. Aller sur `/installation` puis revenir remonte un film neuf.
6. Le **CSS du film est global** (il stylise `html`, `body`, `main`, `ul`, `button`…, et `html.is-scrub` verrouille le défilement du document). Il est donc dans un `<style>` rendu par `HeroFilm` : il n'existe que tant que la page d'accueil existe. Il est importé en `?raw` (texte brut, pas `?inline`) : le minifieur CSS de Vite réécrit certains dégradés (`linear-gradient(0deg, …)` devient un dégradé inversé équivalent) et la quantification de l'écran change alors de quelques niveaux sur des rangées entières ; en brut, les images du film sont identiques au pixel à celles du prototype. `first-paint.js` (`prepareRoot`) pose sur `<html>` la phase, les variables de mise en page et la classe du film **avant la première peinture** et renvoie `restore()`, qui rend à `<html>` sa classe, son style et ses `data-*` d'avant. Pour le prérendu, `scripts/prerender-web.mjs` injecte ce même code en script inline avant le balisage de `/` (`firstPaintScripts` exporté par `prerender.tsx`) ; React ne rend aucun `<script>`.
7. Sans JavaScript, `.site` est visible (le masquage est `html.scene-on .site`, classe posée seulement par la première peinture).
8. Le pont i18n (`src/lib/hero-i18n.ts`, couvert à 100 %) donne au film `t`, `apply`, `onChange` au-dessus de `translate()` de l'app : mêmes clés (le texte anglais), mêmes catalogues, **un seul sélecteur de langue** (celui de l'app, `HeroLanguage`, dans l'en-tête ; une copie dans le menu des petits écrans, cachée au-dessus de 560 px). `<title>`, description et balises sociales restent à `RouteMetadata`. Le joueur s'appelle toujours « Efe ».
9. Assets : `apps/web/public/hero/` (captures GLB, polices, icônes, images de repli, servis tels quels sous `/hero/`) ; seuls les 4 PNG de la scène (`src/hero/assets/mc/`) passent par Vite (`new URL(…, import.meta.url)`, hachés). `scene.js` reçoit `capturesUrl: '/hero/captures/'` et `captures: 'v2light'`.

### Décisions

| Sujet | Décision |
|---|---|
| En-tête / pied de page de l'app sur `/` | **Retirés** (`SiteLayout`, branche `pathname === '/'`). Le film a son en-tête compact (marque, sections, compte, langue, « Installer le mod », menu) et un pied de page pleine largeur. Garder les deux aurait superposé deux barres fixes et cassé les calculs de mise en page. |
| Navigation du pied de page | Toutes les pages de l'app (installation, concept, fonctionnement, FAQ, versions, nouveautés, découvrir, galerie publique, blog, tarifs, confidentialité, conditions, mentions légales, GitHub) + « Se connecter » / « Ma galerie ». |
| Liens du prototype | Les trois liens racine du prototype (`/installation`, `/privacy`, `/legal`) sont de vrais `Link` vers les vraies routes ; aucun lien vers un fichier voisin. |
| Contenu de l'ancienne `HomePage` | Conservé : « Chaque monde a une histoire » (manifeste, pages de découverte, « L'histoire derrière Minemories », galerie de la communauté) et l'appel « Garder mon premier souvenir » / « Retrouver mes souvenirs » sont dans la section `#more`. Les trois étapes génériques sont remplacées par celles du film (plus justes sur le produit). Le composant `LivingLandscape` (illustration aux trois lumières), seulement utilisé par l'ancienne page, est supprimé. |
| Textes de pied de page « prototype » | « Notes du prototype », « éditeur et contact à confirmer », et la mention « prototype interne, à remplacer avant publication » **ne sont pas affichés** (le premier devient « À propos du film » ; les deux autres vivent dans ce document). Le film et la mention « ligne du mod en français seulement » restent. |
| Police lisible (Atkinson Hyperlegible Next) | Auto-hébergée (latin et latin-ext, 400 et 700) au lieu du CDN jsDelivr. |
| Couverture | `src/lib/**` reste à 100 %. `src/hero/**` (code vendorisé, 20 000 lignes) est **hors du périmètre de couverture** : il est validé par ses tests portés (`src/hero/*.test.js`), par le test d'interaction du composant et par les vérifications navigateur ci-dessous. |
| Biome | Un override ciblé sur `apps/web/src/hero/**` et `apps/web/public/hero/**` (formatage, assistant d'imports et règles de style et de complexité pensées pour l'app : complexité cognitive, longueur, ternaires imbriqués, `forEach`, regex hors fonction, noms inutilisés du prototype). Corrections, sécurité et code suspect restent actifs. `hero.js` et `first-paint.js`, adaptés à la main, restent formatés. Aucune suppression générique ailleurs. |

## Arborescence

```
apps/web/src/hero/                 code vendorisé (voir « Resynchroniser »)
  hero.js hud.js phase.js scrub.js site.js scene.js characters.js look.js life.js sky.js backdrop.js
  anim/ mcui/hotbar.js first-paint.js film.css  hero.d.ts first-paint.d.ts  *.test.js
  assets/mc/{blocks,entities}      les 4 PNG de la scène (hachés par Vite)
apps/web/public/hero/              captures/ posters/ assets/mc/ mcui/ fonts/ (servis sous /hero/)
apps/web/src/components/           HeroFilm.tsx HeroMarkup.tsx HeroParts.tsx
apps/web/src/lib/hero-i18n.ts      pont de traduction (100 % couvert)
```

## Resynchroniser avec le prototype

Le prototype est la source (`docs/marketing/v0/web/`). Pour reprendre une nouvelle version : recopier `hero.js hud.js phase.js scrub.js site.js scene.js characters.js look.js life.js sky.js backdrop.js anim/ mcui/hotbar.js`, puis **réappliquer les adaptations** :

- `hero.js` : tout le corps dans `export function mountHero(host)` (états du module devenus locaux) ; `on(target, …)` avec `signal` pour chaque écouteur de `window`/`document` ; `loop` s'arrête si `disposed` ; `dispose()` ; `i18n = host.i18n` (plus de `createI18n`, plus de sélecteurs de langue) ; `capturesUrl` et `captures: 'v2light'` ; `console.info` pour le repli WebGL attendu.
- `hud.js` : `ctx.signal` sur les deux écouteurs de `document`.
- `film.css` : concaténation de `mcui.css`, `hero.css`, `site.css` ; chemins `url('mcui/…')` et `url('assets/mc/…')` réécrits en `/hero/…` ; polices `.ttf` de repli retirées ; `.site` visible par défaut et masqué par `html.scene-on .site` ; section d'ajouts de l'app en fin de fichier.
- `HeroMarkup.tsx` : regénéré du `hero.html` (balises `data-i18n` conservées, textes en JSX) puis les parties dynamiques remplacées par `HeroParts`.
- Traductions : les clés nouvelles du prototype (`web/i18n/*.json`, sources dans `web/i18n/src/catalog-src.mjs`) sont à ajouter aux 8 catalogues complets et aux variantes de `apps/web/src/i18n/locales/` ; `catalogs.test.ts` exige les mêmes clés, les mêmes `{paramètres}` et les mêmes noms propres (Minecraft, Mojang, AFK…).
- Puis rejouer `bun run web:check` et les vérifications navigateur.

## Assets Mojang, mods et plan de remplacement

**Décision d'Andy (28/10/2026) : ces fichiers sont gardés en l'état, à sa charge.** Ils ne sont pas libres de droits ; le prototype les isole pour qu'on puisse les remplacer d'un bloc. Le manifeste d'origine (23 fichiers, sha256, jar source, chaînes reprises du jeu, polices) est recopié dans [`landing-film-manifest.json`](landing-film-manifest.json).

| Élément | Où | Origine | Avant une publication large |
|---|---|---|---|
| Police « MM Minecraft » (normal, gras) | `public/hero/assets/mc/fonts/` (woff2) | Générée à partir des atlas `ascii.png`, `accented.png`, `nonlatin_european.png` du **jar du client** (NeoForge 21.1.248), avec les métriques du jeu ; **dérivée de fichiers Mojang** | La remplacer par une police pixel libre aux **mêmes avances** (aucune mise en page ne bouge : les avances sont le contrat), ou obtenir l'accord de Mojang. |
| GNU Unifont aux mesures du jeu (ko, ja), mot-symbole « m » | `public/hero/mcui/fonts/` | GNU Unifont, SIL OFL 1.1 : **publiable** ; seuls les nombres d'espacement viennent du jeu | Rien (licence jointe). |
| Icônes d'objets (9), barre d'objets, cœurs | `public/hero/assets/mc/{items,gui,particle}/` | PNG du jar, copiés octet pour octet (sha256 au manifeste), sauf `items/map.png` dérivé | Les redessiner (16 × 16, même nom de fichier). |
| Textures de la scène : chien, collier, joueur, flammes du feu de camp | `src/hero/assets/mc/{entities,blocks}/` | Jar du jeu | Idem ; ou skin de joueur propre. |
| Image fixe du modèle, images de repli (posters) | `public/hero/assets/mc/renders/`, `public/hero/posters/` | Rendus de la scène, donc des textures ci-dessous | À refaire une fois les captures remplacées. |
| **Captures GLB** (5 stades + personnages) | `public/hero/captures/` | Environ 120 à 134 textures chacune : ~71 à 74 de **Minecraft**, des textures de **mods tiers** (Handcrafted, mcwroofs…) et des textures « maison » | Refaire une capture avec un résource-pack et des mods libres, ou obtenir les accords des auteurs de mods. |
| Textes du jeu repris tels quels (arrivée, départ, menu pause, noms d'objets), par langue | catalogues (`{name} joined the game`, `Back to Game`…) | Fichiers de langue du jeu | À réécrire, ou valider avec Mojang. |

Mentions à garder tant que ces fichiers sont là : « Pas un produit officiel Minecraft… » (pied de page du film) et la page `/legal`. **Éditeur et contact** : encore à confirmer avant ouverture publique (la page `/legal` de l'app est la référence).

### Régénérer les polices et les assets

Les outils sont dans le prototype (`docs/marketing/v0/web/mcui/`, local) :

- `extract-mc-assets.mjs` : extrait les PNG du jar du client et écrit `assets/mc/MANIFEST.json` (idempotent).
- `gen-mcfont.mjs` : fabrique « MM Minecraft » (`assets/mc/fonts/*.woff2`) depuis les atlas du jar ; `gen-unifont.mjs` : GNU Unifont aux mesures du jeu (ko, ja) ; `gen-wordmark.mjs` : le mot-symbole ; `gen-assets.mjs` : icônes et tuiles.
- `i18n/src/build.mjs` : catalogues depuis `catalog-src.mjs`.

Le jar est celui du cache de développement : `mod/minemories/neoforge/build/moddev/artifacts/…-minecraft-resources.jar`. Copier ensuite les fichiers produits dans `apps/web/public/hero/…` (mêmes noms) et relancer `bun run web:check`.

## Vérifications

- **Vitest** : `src/hero/*.test.js` (tests Node du prototype portés : `phase`, `hotbar`, HUD, scrub S1 à S16 ; courbes ; la mise en page de première peinture est comparée à `site.js` à 9 tailles), `src/pages/home-film.test.tsx` (composant sans WebGL, langue unique, démontage et remontage, touches, menu, options), `src/prerender-home.test.tsx`, `src/lib/hero-i18n.test.ts`, `scripts/prerender-web.test.mjs`.
- **Navigateur** (Playwright-core + Chromium, GPU réel, un navigateur à la fois) : voir le journal ci-dessous.

## Poids

- Dépôt : `public/hero` 8,5 Mo (captures GLB 8 Mo) + `src/hero` 1,2 Mo.
- À la première visite de `/` : code du film ~ 185 Ko gzip (en plus de `GLTFLoader`, partagé avec le viewer), puis `S0.glb` (1,3 Mo) et `personnages.glb` (1,3 Mo) ; `S1` à `S4` en arrière-plan.
- Cache (`deploy/nginx.web.conf`) : `/assets/` immuable un an (noms hachés) ; `/hero/` un jour puis revalidation (non haché ; versionner le dossier pour un cache plus long).

## Limites connues

- Assets Mojang et mods tiers : voir plus haut.
- Appareils réels (iOS Safari, Android) non testés ; Chromium de bureau uniquement (390 et 1440 px).
- Le film dépend de WebGL 2 ; sinon le site est affiché avec l'image fixe du modèle.
- Les tests du prototype qui pilotent un navigateur (batteries `renders-v10`, `renders-v12`) ne sont pas rejoués en CI : seuls leurs équivalents purs le sont.
