# Charte graphique Minemories : l'interface de Minecraft, appliquée à tout le site

Document de référence pour Andy (front, landing), Bréval (produit) et toute personne qui ajoute une page. Il complète [design-system.md](design-system.md) (jetons, composants, audit de la landing) : ce document-ci dit **quoi** appliquer et **pourquoi**, l'autre dit **comment** c'est codé.

Statut : version 1 (30/10/2026). Les gris du jeu (boutons, panneaux, cases, désactivé) sont appliqués dans `film.css :root` (section 3). Les passages marqués **[à valider]** restent des propositions non tranchées.

---

## 1. Le principe : le souvenir est un objet

Minemories garde des souvenirs de mondes Minecraft. Le site parle donc la langue du jeu : ses menus, ses cases, ses infobulles, ses messages de chat. Le visiteur doit penser « c'est fait pour le jeu » avant d'avoir lu un mot.

Trois règles gouvernent tout le reste :

1. **On reprend la grammaire du jeu, pas ses fichiers.** Biseaux, cases, infobulles, notifications, échelle de pixels, ombre du texte : oui. Textures, sprites, sons, logo : jamais (voir § 12).
2. **Le jeu est la référence.** En cas de doute entre deux solutions, on choisit celle qui ressemble le plus à ce qu'un joueur voit dans le jeu, tant qu'elle reste lisible (§ 11).
3. **Sobre.** Pas de dégradé, de pilule arrondie, d'ombre floue, de carte à trois colonnes, d'emoji, d'icône générique. Une matière (la pierre), un accent (la braise).

### Le curseur de proximité

| Niveau | Ce que ça veut dire | Où on est |
|---|---|---|
| 1. Évocateur | On sent le thème (pixels, police carrée) | dépassé |
| **2. Fidèle à la grammaire** | Mêmes formes, mêmes proportions, mêmes états, couleurs voisines | **cible de la charte** |
| 3. Copie des écrans | On refait l'écran titre, l'inventaire, le chargement de Mojang | **interdit** (droits, § 12) |

La charte vise le niveau 2 partout : un joueur reconnaît la famille, personne ne prend la page pour un écran de Mojang.

---

## 2. Ce qu'on applique aujourd'hui (landing, en production)

| Domaine | Appliqué | Où |
|---|---|---|
| Police | « MM Minecraft » pour titres et commandes ; Atkinson Hyperlegible Next pour le texte de lecture ; Unifont pour le coréen et le japonais ; option « Police lisible » | `film.css`, `charter.css` |
| Pixel | `--gp` = 2 px (3 px pour le HUD du film au-delà de 960 × 720) | `film.css`, `tokens.css` |
| Échelle de texte | titres 24 / 32 / 40 px, lecture 16 / 18 / 20 px | `tokens.css` |
| Couleurs | Nuit chaude `#14110e`, texte `#f4efe6`, pierre, cuivre, braise `#ffb347` | `film.css :root` |
| Relief | Bordure noire de 1 gp, lumière en haut à gauche, ombre en bas à droite, ombre de texte d'un texel | `.mc-btn`, `.mc-panel` |
| Composants | Bouton, panneau, case, barre d'objets, infobulle, notification, chat, onglets, champ, FAQ, étapes, pied de page | `film.css`, `charter.css` |
| Mouvement | 120 / 200 / 360 ms, entrée au défilement de 12 px, arrêt en « mouvement réduit » | `tokens.css`, `reveal.ts` |
| Accessibilité | Contraste ≥ 4,5:1, cibles de 44 px, focus visible, ordre de Tab = ordre du DOM | `charter.css` |

---

## 3. Où on colle au jeu, où on s'en écarte, et ce qu'on propose

Le jeu (Java 1.21.1, mesuré sur le client) sert de référence. La direction artistique v7 avait décalé volontairement plusieurs tons pour ne pas ressembler à un écran de Mojang. Comme tu veux te rapprocher, voici le détail.

| Élément | Jeu (vanilla) | Minemories aujourd'hui | Proposition |
|---|---|---|---|
| Bouton, repos | face `#6F6F6F`, lumière `#AAAAAA`, ombre `#565656`, contour noir | gris du jeu `#6F6F6F` / `#AAAAAA` / `#565656` (appliqué) | **Fait.** Avant : pierre chaude `#6E6862`. Texte blanc 5,0:1. |
| Bouton, survol | contour blanc `#FFFFFF`, face un cran plus clair | contour `--hover` `#FFF4E0` | garder (quasi identique) |
| Bouton, désactivé | face `#2C2C2C`, texte `#A0A0A0` | `--off #2C2C2C`, `--off-ink #A0A0A0` (appliqué) | **Fait.** Texte 5,3:1. |
| Bouton principal | aucun : tous les boutons sont gris | cuivre `#8A5A2B` | **garder le cuivre, mais un seul par zone.** Écart volontaire : il évite de singer le jeu et guide l'œil. |
| Panneau (conteneur) | face `#C6C6C6`, lumière blanche, ombre `#555555`, coins crantés, titre `#404040` | gris du jeu `#C6C6C6` / `#FFFFFF` / `#555555`, titre `#404040` (appliqué) | **Fait.** Avant : papier chaud `#CFC8BC`. Texte 6,1:1. |
| Fond des pages | depuis la 1.20.5 : voile noir 25 % sur un panorama flou | nuit chaude `#14110E` | garder : le site est de nuit. Mettre un voile sombre sur les images de fond. |
| Case d'objet | creux `#373737`, face `#8B8B8B`, bord clair `#FFFFFF` | `#373737` / `#8B8B8B` / `#FFFFFF` (appliqué) | **Fait.** Texte blanc sur la case : 3,4:1, sous 4,5:1 (c'était ~3:1 avant) : ne mettre sur une case que des icônes et des chiffres de grande taille. |
| Infobulle | fond `#100010` à 94 %, liseré violet `#5000FF` → `#28007F`, décalée de 12 gp | liseré braise | **garder la braise.** Le liseré violet est le signe le plus reconnaissable du jeu : l'abandonner sépare l'hommage de l'imitation. |
| Notification (toast) | face `#212121`, anneau `#555555`, titre jaune `#FFFF00`, 600 ms d'entrée, 5 s de tenue | face `#221D18`, titre or `#FFD25A` | garder l'or ; reprendre les durées du jeu (600 ms / 5 s) |
| Champ de texte | fond noir, contour `#A0A0A0`, contour blanc au focus | `--field`, `--field-edge` | identique en pratique |
| Texte | blanc, ombre = texte × 0,25 par canal | titres : même règle ; texte de lecture sans ombre, en sans-serif | écart voulu (« moderne ») |
| Titre | `/title` : ×4, centré, ombre portée | h1 40 px avec ombre de 5 px | identique en esprit |
| Codes de couleur | 16 couleurs du chat (§0 à §f) | `--c-name`, `--c-lore`, `--c-blue`, `--c-green`, `--c-gold` | reprendre les 16 couleurs **telles quelles** pour les noms de joueurs et de mondes, avec la vérification de contraste (§ 4.3) |

Les deux écarts qu'on garde ont chacun une raison :
- **Cuivre pour l'action principale** (le jeu n'en a pas) : lisibilité et guidage du regard.
- **Braise au lieu du violet** dans les infobulles : on évite de copier le signe le plus caractéristique.

La bascule s'est faite dans `film.css :root` (sept variables, plus l'ombre de texte des boutons gris `#3F3F3F`, blanc × 0,25) et se propage à tous les composants.

---

## 4. Couleurs

### 4.1 Palette de base (nuit, en production)

| Jeton | Valeur | Rôle |
|---|---|---|
| `--night` | `#14110E` | fond de page |
| `--night-2` | `#1F1A15` | fond de panneau sombre |
| `--night-3` | `#2E2822` | fond de carte, séparateurs |
| `--text` | `#F4EFE6` | texte principal (≥ 15:1) |
| `--text-2` | `#C9C1B4` | texte secondaire (≥ 9,6:1) |
| `--text-3` | `#9D958A` | méta, aide |
| `--outline` | `#0A0806` | contour de 1 gp |
| `--hover` | `#FFF4E0` | contour de survol, anneau de focus |

### 4.2 Matières

| Matière | Jetons | Usage |
|---|---|---|
| Pierre | `--stone-hi/stone/stone-lo` | boutons, cases |
| Cuivre | `--copper-hi/copper/copper-lo` | bouton principal (un par zone) |
| Panneau clair | `--panel-hi/panel/panel-lo`, `--panel-ink` | conteneurs de type inventaire |
| Braise | `--ember #FFB347`, `--ember-deep #E07B24`, `--gold #FFD25A` | accent : survol, état ouvert, titres de notification |

### 4.3 Couleurs du jeu pour le contenu

Les noms de joueurs, de mondes, d'objets et les messages de chat utilisent les couleurs du jeu :

| Code | Valeur | Code | Valeur |
|---|---|---|---|
| §0 noir | `#000000` | §8 gris foncé | `#555555` |
| §1 bleu foncé | `#0000AA` | §9 bleu | `#5555FF` |
| §2 vert foncé | `#00AA00` | §a vert | `#55FF55` |
| §3 cyan foncé | `#00AAAA` | §b cyan | `#55FFFF` |
| §4 rouge foncé | `#AA0000` | §c rouge | `#FF5555` |
| §5 violet foncé | `#AA00AA` | §d violet clair | `#FF55FF` |
| §6 or | `#FFAA00` | §e jaune | `#FFFF55` |
| §7 gris | `#AAAAAA` | §f blanc | `#FFFFFF` |

Règle de contraste : sur fond sombre, seules les couleurs claires (§7, §a à §f ; vérifier §9, plus faible) passent 4,5:1. Les sombres (§0 à §6, §8) ne servent qu'en décor ou doublées d'une icône ou d'un libellé. Sur panneau clair, le blanc et le jaune sont interdits (1,6 à 1,7:1).

États : erreur `--bad #FF9A8C` (8,9:1), succès `--c-green`, avertissement `--gold`, information `--c-blue`. Jamais de couleur seule pour porter un sens : toujours une icône ou un mot.

---

## 5. Typographie : deux voix, une moderne et une du jeu

Depuis la v1.1 (30/10/2026), le site n'est plus tout en police du jeu : en 16 px sur de longs paragraphes, elle fatigue et fait « jouet ». On garde le jeu pour ce qui **titre et se commande**, et une sans-serif moderne pour ce qui **se lit**.

| Rôle | Police | Où |
|---|---|---|
| Voix du jeu | **MM Minecraft** (la police du jeu), gras pour les titres | logo, H1 à H3, boutons, étiquettes de la barre, HUD et texte du film, nombres |
| Voix de lecture | **Atkinson Hyperlegible Next** (OFL, hébergée, déjà dans le dépôt) | chapeau, paragraphes, cartes d'étape, FAQ, listes, pied de page, textes d'aide et d'erreur |
| Étiquettes | Atkinson gras, 13 px, capitales, interlettrage 0,08 em | pastille « Minecraft Java mod · beta » |
| Coréen, japonais | Unifont (OFL) partout, comme avant | pas de glyphes CJK en Atkinson |
| Option « Police lisible » | Atkinson pour tout, film compris | inchangée |

Un seul jeton change la police de lecture : `--ds-f-text` (`tokens.css`). Candidate de remplacement plus moderne si on veut aller plus loin : Inter ou Geist (OFL), à héberger ; non fait ici, il faut ajouter un fichier de police.

Échelle de la voix du jeu (la police est un pixel de 8 texels : seuls les multiples de 8 sont nets) :

| Niveau | Taille / interligne | Ombre de texte | Usage |
|---|---|---|---|
| H1 | 32/40, 40/48 dès 640 px | 3 px, 4 px | titre de page |
| H2 | 32/40 | 3 px | titre de section |
| H3 | 24/32 | 2 px | titre de carte ou d'étape |
| Bouton, étiquette | 16/18 | 2 px | commandes |

Échelle de la voix de lecture :

| Niveau | Taille / interligne | Usage |
|---|---|---|
| Chapeau | 18/1,6, 20 px dès 1 000 px | sous le H1 |
| Texte de section | 18/1,6 | paragraphes |
| Texte courant | 16/1,5 | cartes, FAQ (réponse), listes, pied de page |
| Question de FAQ | 18 gras, 1,35 | |

Règles : rien au-dessus de 40 px (voix du jeu) hors du film ; mesure de 58 caractères ; **pas d'ombre pixel sur le texte de lecture** ; jamais de gras ou d'italique fabriqué pour la voix du jeu (le jeu n'a pas d'italique) ; ombre des titres = couleur du texte × 0,25 par canal, adoucie (2 à 4 px au lieu de 3 à 5) ; pas de capitales décoratives hors étiquettes.

---

## 6. Grille, espacement, échelle

- **Pixel de GUI** `--gp` = 2 px. Toute bordure, tout biseau, tout décalage est un multiple de `--gp`. Aucun arrondi, aucun flou.
- **Espacement** : pas de 4 px (`--ds-sp-1` à `-8` : 4, 8, 12, 16, 24, 32, 48, 64). **Rythme vertical** : 24 px (`--ds-gap`) entre un titre et son contenu et entre deux blocs ; 12 px entre deux lignes de FAQ ; une section a 32 px de marge haute et basse (40 px dès 640 px), donc 64 px (80 px dès 640 px) entre deux sections. Rien d'autre : pas de marge propre à un composant.
- **Cibles** : tout ce qui se touche fait au moins 44 px de haut (`--ds-hit`).
- **Largeur** : texte à 58 caractères ; contenu centré, jamais pleine largeur sur les grands écrans.
- **Points de rupture** : 640, 900, 1 000 px ; mobile d'abord (390 px de référence).
- **Pas de coins arrondis.** Les coins sont droits ou crantés (anneau sans coins, comme dans le code du jeu).

---

## 7. Composants : du jeu vers le site

| Composant du jeu | Notre composant | Classe | Règles |
|---|---|---|---|
| Bouton gris | Bouton | `mc-btn` | 44 px, relief, survol = contour clair + 1 px vers le haut, pression = relief enfoncé |
| Bouton « fait » | Bouton principal | `mc-btn--primary` | cuivre ; un par zone |
| Panneau d'inventaire | Panneau | `mc-panel`, `mc-panel--dark` | coins crantés, titre en `--panel-ink` |
| Barre d'objets | Barre d'objets | `mc-hotbar` | neuf cases ; sélection par cadre blanc ; numéro de touche |
| Infobulle | Infobulle | `mc-tip`, `mc-hovertip` | nom en cyan, description en violet clair, faits en gris ; liseré braise |
| Message de chat | Chat | `mc-chat` | une ligne par événement, texte du jeu |
| Étiquette de nom | Étiquette | `mc-nametag` | fond noir 25 % |
| Champ de texte | Champ | `mc-field` | fond noir, contour gris, contour blanc au focus |
| Case à cocher, option | Option | `mc-check`, `mc-check--radio` | ligne de 44 px |
| Recette (grille 3×3) | Étapes | `mc-recipe`, `mc-step` | pour expliquer un fonctionnement |
| Barre de progression | Barre | `mc-bar` | remplissage vert comme l'XP |

Tout composant nouveau doit répondre à : quel élément du jeu ressemble-t-il ? S'il n'en a pas, c'est probablement du décor qu'on peut supprimer.

---

## 8. Images, icônes, illustrations

- **Icônes** : SVG en pixel (`public/hero/mcui/icons/`), `image-rendering: pixelated`, `shape-rendering: crispEdges`. Grille de 16 ou 8 pixels, un seul trait de 2 px. Pas d'icônes de bibliothèque générique.
- **Objets du jeu** (os, braise, journal) : dessinés par nous dans l'esprit des items, jamais copiés.
- **Captures de monde** : c'est le contenu. Toujours en pixel net (`image-rendering: pixelated` quand on agrandit), sans filtre, sans bord arrondi. Légende dans l'esprit d'une infobulle.
- **Fond** : voile noir 25 % sur capture floue, comme le menu du jeu depuis la 1.20.5.
- **Interdit** : photos de stock, illustrations vectorielles lisses, 3D qui ne vient pas d'une capture, captures d'écran réelles de Mojang.

---

## 9. Mouvement et son

Le mouvement sert à **confirmer** (j'ai cliqué, ça répond), **orienter** (ça arrive d'ici) et **donner du poids** (un pixel à la fois). Il ne décore pas.

### Jetons
| Jeton | Valeur | Usage |
|---|---|---|
| `--ds-dur-1` | 120 ms | survol, pression (la pression va deux fois plus vite : 60 ms) |
| `--ds-dur-2` | 200 ms | changement d'état : ouverture, couleur, icône |
| `--ds-dur-3` | 360 ms | entrée d'un bloc au défilement, ouverture d'un panneau |
| `--ds-dur-4` | 560 ms | entrée du hero au chargement (une seule fois) |
| `--ds-ease` | `cubic-bezier(.2,.8,.2,1)` | arrivée douce (par défaut) |
| `--ds-ease-std` | `cubic-bezier(.4,0,.2,1)` | aller-retour |
| `--ds-ease-pop` | `cubic-bezier(.34,1.56,.64,1)` | rebond de 6 % : pastilles, icônes, numéros, **jamais** un bloc de texte |
| `--ds-lift` | 2 px | soulèvement d'un bouton |

### Catalogue (chaque élément interactif ou qui apparaît)
| Élément | Mouvement |
|---|---|
| Hero au chargement | kicker, titre, chapeau, boutons, mention arrivent l'un après l'autre (12 px + fondu, décalage de 60 ms) |
| Titres de section | balayage par pas de gauche à droite (12 pas, comme un texte qui se tape) en entrant à l'écran |
| Blocs de contenu | 12 px + fondu au défilement, une fois, frères décalés de 60 ms |
| Bouton | survol : monte de 2 px + contour clair ; pression : descend de 1 px, 60 ms ; l'icône braise grossit de 20 %, les flèches avancent de 3 px |
| Lien | le soulignement s'écarte du texte (3 px → 6 px) ; navigation du bandeau : barre braise qui entre depuis la gauche |
| Carte d'étape | le numéro « tombe » en place avec un rebond à l'entrée, puis grossit de 8 % quand la carte est survolée ou focalisée |
| FAQ, détails d'étape, pied de page | la hauteur s'anime (360 ms) et le contenu se fond ; le chevron tourne avec un rebond |
| Liste de langue (sélecteur) | le panneau s'ouvre en descendant de 8 px en se fondant (200 ms), style du jeu (fond nuit, relief), option survolée en braise, option courante repérée par une barre braise ; le chevron se retourne. Chrome 135+ (`appearance: base-select`), liste native ailleurs |
| Menu du bandeau (petits écrans) | descend de 8 px en se fondant ; la croix arrive en rebond |
| Barre du film (bord droit) | frise verticale : remplissage braise et poignée qui suivent le temps du film (pleine sur le site) ; cinq repères de chapitre avec infobulle ; un glissement déplace la poignée et le film saute **une seule fois**, au relâchement (garde-fous anti-flash) ; clavier : haut / bas = chapitre précédent / suivant, Début, Fin |
| Fin du film → site | la carte rétrécit à rythme constant (rapport de taille constant) et se rapproche du panneau comme un recul de caméra autour d'un point fixe ; 1,8 s au lieu de 1,2 s ; recadrage de la carte quand le texte change de largeur : 1,1 s, courbe symétrique |
| Notifications | entrée et sortie de 600 ms, tenue de 5 s (valeurs du jeu) |

### Règles
- **Transform et opacité seulement** (plus `clip-path` pour le balayage, et `block-size` pour les panneaux) : jamais de largeur, de marge ni de position qui saute.
- **Jamais de variation de luminosité** : pas plus de 2 flashs par seconde. Rien ne boucle sous le film.
- **Par pas** pour ce qui avance en distance (`steps(n)`) : un objet progresse d'un pixel à la fois. L'opacité reste continue.
- Le canvas du film et son HUD ne sont jamais animés par la charte.
- **Mouvement réduit** (système ou option du pied de page) : aucune animation, aucun déplacement, même au survol ; le contenu est là tout de suite. Le code du mouvement n'existe que derrière `prefers-reduced-motion: no-preference` et l'option, et un test de charte le vérifie.
- **Amélioration progressive** : l'animation d'ouverture des panneaux (`::details-content`) et du menu (`display` discret) demande un Chrome récent ; ailleurs ça s'ouvre sans animation, sans rien casser.
- **Son** : aucun son par défaut, jamais d'autoplay, les sons du jeu ne sont pas réutilisés.

---

## 10. Ton des textes

Le site parle comme le jeu : court, concret, au présent.

- **Chat du jeu** : les lignes de la landing viennent du chat réel (« Minemories: world capture done. »). Quand une ligne existe dans le mod, le site la reprend à l'identique. *À décider avec Bréval : le mod affiche encore « Souvenir AFK enregistré localement ».*
- **Boutons** : un verbe (« Installer », « Capturer », « Partager »), pas de point.
- **Titres** : 6 mots au plus par ligne ; naturels à l'oral ; pas de tournure littéraire.
- **Erreurs** : dire ce qui s'est passé et quoi faire, sans jargon ni majuscules.
- **Tutoiement**, comme le jeu ; formulations neutres pour le genre.
- **11 langues** : traduit par une personne qui parle, pas mot à mot. Noms propres et paramètres préservés.

---

## 11. Accessibilité (non négociable, même si le jeu ne le fait pas)

Le jeu n'est pas une référence d'accessibilité : plusieurs de ses couleurs ne passent pas 4,5:1. On garde l'esprit, on corrige le contraste.

- Texte ≥ 4,5:1 (le plus faible aujourd'hui : bouton principal, 5,87:1) ; texte large ≥ 3:1.
- Focus visible partout : anneau de 2 px clair, décalé de 2 px.
- Tab suit l'ordre du DOM ; lien d'évitement en premier.
- Cibles de 44 px.
- Option « Police lisible » ; option « Mouvement réduit » ; `<html lang>` à jour.
- Aucune information portée par la couleur seule.
- Tout ce qui se fait à la souris se fait au clavier (le viewer 3D compris).

---

## 12. Droits et mentions (à respecter ; ce n'est pas du conseil juridique)

Les règles d'usage de Minecraft (lues le 23/10/2026) disent en substance :

- la marque couvre « logos, fonts, textures, and any other distinctive characteristics » ;
- on ne doit rien faire qui laisse croire que c'est officiel, approuvé, soutenu ou associé ;
- le nom Minecraft ne doit jamais dominer, et aucun élément de la marque n'entre dans un logo ;
- il faut dire **qui est responsable** et **comment le contacter** ;
- une mention « similaire » doit être affichée bien en vue : **« NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT »**, sur le site et les supports.

Conséquences pour la charte :

1. Jamais de texture, de sprite, de son, de logo, d'écran titre, de panorama ni d'inventaire reproduit en entier.
2. **Police** : « MM Minecraft » est dérivée de celle du jeu (extraite des atlas). Elle a été acceptée « en l'état » pour le prototype, mais c'est un fichier Mojang : **à remplacer ou à faire valider avant tout lancement public**. Le plan de remplacement existe (`assets/mc/MANIFEST.json`, clé `mcFont`) : les chasses sont le contrat, donc le remplacer ne bouge aucune mise en page. Alternatives indépendantes : Pixel Operator (CC0), Departure Mono et Pixelify Sans (OFL). Monocraft est exclue.
3. **Écran de chargement** (`apps/web/index.html`, bloc `boot:begin` à `boot:end`) : le joueur (peau Steve) et la pioche sont de **vraies textures du jeu** (client 1.21.1 local, incrustées en `data:` URI) ; le bloc de minerai, ses fissures et le diamant sont des **dessins vectoriels à nous**. Les deux textures sont des fichiers Mojang, au même titre que la police : **gardées en connaissance de cause par Andy (30/10/2026), à valider ou à remplacer avant le lancement public** (la règle 1 ci-dessus les interdit). Régénération : `python3 scripts/boot-screen/gen.py <minecraft_1.21.1_client.jar>` ; pour remplacer le joueur et la pioche par des dessins à nous, changer les deux images de `defs` dans le script.
4. Logo : Pixel Operator gras avec une braise à nous. Pas de lettres de pierre biseautées.
5. La mention « not official » apparaît dans le pied de page de toutes les pages, pas seulement la landing.
6. La ressemblance du nom « Minemories » avec « Minecraft » est une question pour Andy et Bréval (les règles visent les noms « confusingly similar ») ; elle n'est pas traitée ici.

---

## 13. Appliquer la charte page par page

Une page adopte la charte en : (1) portant `.ds-page` sur sa racine ; (2) utilisant uniquement les classes `mc-*` ; (3) chargeant `tokens.css` + `film.css` + `charter.css` (aujourd'hui injectés par `HeroFilm`, à déplacer dans un `DesignSystemStyles` partagé à la deuxième page migrée) ; (4) ne définissant aucune taille en dur.

| Page | Écran du jeu évoqué | Composants |
|---|---|---|
| Landing `/` | écran titre + cinématique | déjà en production. La section « Ce que Minemories ne fait pas » (cadre doré) a été retirée ; ses quatre limites (pas une sauvegarde, rien avant le mod, une capture AFK toutes les 4 h, Java 1.21.1 en bêta) restent à dire ailleurs si besoin (FAQ, page installation) |
| Guides (`/installation`, `/fonctionnement`, `/faq`…) | livre, écran d'aide | `mc-step`, `mc-faq`, `mc-recipe`, `mc-section` |
| Découverte (`/decouvrir`, `/classement`, `/explorer`) | sélection de monde | ligne de monde : miniature carrée, nom en blanc, détail en gris, bouton à droite |
| Textes longs (`/blog`, `/privacy`, `/terms`) | livre signé | `mc-prose`, mesure de 58 caractères |
| Connexion, inscription, compte | écran de réglages | `mc-form`, `mc-field`, `mc-check`, `mc-select`, un seul bouton principal |
| Galerie, partage | album de captures | grille de cases, légende en infobulle au survol et au focus |
| Visualiseur 3D | le jeu lui-même | garde son interface propre : `mc-hotbar`, `mc-dock`, `mc-panel`, `mc-btn--icon` |
| Administration, modération | écran de commandes | `mc-panel--dark`, tableau dense en 16/24, pas d'animation |

Pour toute nouvelle page, répondre dans l'ordre : quel écran du jeu cette page évoque-t-elle ? quels composants du § 7 ? quel est le seul bouton principal ? qu'est-ce qui est visible sans JavaScript ?

---

## 14. À faire / à ne pas faire

**À faire**
- Mesurer en multiples de `--gp`.
- Mettre une ombre de texte (texte × 0,25) sous tout texte clair sur fond sombre.
- N'utiliser qu'un bouton principal par zone.
- Écrire dans le ton du chat du jeu.
- Vérifier le contraste de chaque nouvelle couleur.
- Tester à 390, 820 et 1440 px, et avec « mouvement réduit ».

**À ne pas faire**
- Coins arrondis, ombres floues, dégradés, verre dépoli, cartes à trois colonnes, emoji, icônes de bibliothèque, photos de stock.
- Taille de police hors de l'échelle (16, 24, 32, 40) ou gras / italique synthétique.
- Couleur seule pour un sens ; texte blanc ou jaune sur panneau clair.
- Reproduire l'écran titre, l'inventaire, l'écran de chargement ou le logo de Minecraft.
- Texte d'accroche jaune qui pulse (trop reconnaissable), son ou musique par défaut.
- Animation plus longue que 360 ms, ou qui bouge dans un bloc de texte déjà affiché.

---

## 15. Décisions à trancher

1. ~~Rapprochement des gris~~ : fait (boutons, panneaux, cases, désactivé).
2. **Police du jeu** : garder « MM Minecraft » en production publique, ou la remplacer (Pixel Operator) avant le lancement ? Décision de droit, pas de design.
3. **Bouton principal** : cuivre conservé (recommandé) ou gris comme dans le jeu ?
4. **Ligne de chat du mod** : aligner « Souvenir AFK enregistré localement » sur celle du film (avec Bréval).
5. **Page `/design`** : créer la page de démonstration des composants lors de la première migration (recommandé).
6. **Corps de texte à 16 px sur grand écran** : lisible mais petit à 1 920 px ; l'alternative nette avec la police pixel est 24 px, mais pas 20 px.

## 16. Sources

- Mesures de l'interface vanilla et droits : `docs/marketing/v0/hero/direction-da-v7.md` (local, hors dépôt public).
- Jetons et composants : `apps/web/src/hero/tokens.css`, `film.css`, `charter.css` ; audit et captures : [design-system.md](design-system.md).
- Règles d'usage de Minecraft : https://www.minecraft.net/en-us/usage-guidelines
