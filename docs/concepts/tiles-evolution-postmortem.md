# Tuiles Minemories et mode évolution : bilan d'une tentative (27 octobre 2026)

Ce document garde une trace de ce qui a été construit le 27 octobre 2026 pour découper les captures en
tuiles (`.mmtiles`) et afficher l'évolution d'un monde dans le temps, de ce qui n'a pas fonctionné et de ce
qu'il faut retenir. Le code correspondant a ensuite été retiré de `main` par des commits de retour en arrière ;
il reste consultable dans l'historique Git (liste des commits en bas).

Statut : **abandonné en l'état.** Les tests automatiques passaient, mais le résultat en conditions réelles
(jeu, API de production, navigateur) était insatisfaisant. Rien de ce qui est décrit ici n'a été validé
complètement en jeu avant d'être poussé.

## Objectif de départ

Un joueur joue, le mod prend des snapshots (AFK ou manuels) ; dans le viewer il voit **un seul monde qui
évolue** : une zone peut changer pendant qu'une autre reste figée dans son dernier état connu. Pas deux modes
(vue classique / évolution) : l'évolution est la vue normale.

## Ce qui a été construit

### 1. Format de tuiles (mod, API, viewer)

- Grille **absolue** de N×N chunks (`tileBlocks = 16 × N`), indices `floor(x / tileBlocks)`, colonne complète
  en hauteur. Un quad appartient à la tuile de son centroïde horizontal ; l'union des tuiles = les quads de la
  capture. Sommets exprimés par rapport à `(tileMinX, 0, tileMinZ)` ; le viewer translate selon l'origine de
  la capture de référence.
- Chaque tuile est un `.glb` autonome avec son propre atlas de textures (une texture ajoutée ailleurs ne
  change pas les UV d'une autre tuile). Empreinte = SHA-256 des octets.
- Manifeste JSON `minemories-tiles-v1` (tuiles triées par `(x, z)`, décalages contigus).
- Bundle `.mmtiles` : `MMTB` + version + longueur du manifeste (multiple de 4) + manifeste + tuiles bout à
  bout. Un seul fichier pour conserver l'envoi resumable, le quota et la suppression.
- Mod (`core`) : `TiledGlbScene` (en mémoire, tri déterministe), `TiledSpoolingScene` (flux pour l'AFK, un
  spool par tuile occupée), `TileBundle`. Captures AFK d'abord, puis option pour les captures manuelles.
- API : détection de l'en-tête `MMTB` sur l'envoi resumable, validation stricte (manifeste, chaque GLB,
  deux SHA-256), table `memory_tiles` (offset, taille, empreinte), lecture d'un intervalle d'octets,
  `GET /api/memories/:id/tiles/:x/:z` (propriétaire seulement), GLB assemblé pour les routes de fichier
  (galerie, partage, public).
- Viewer : planificateur de tuiles (diff par empreinte, concurrence 4, préchargement de 8, nouvelles
  tentatives), lecture tuile par tuile, fusion de GLB (`mergeGlbTiles`) pour exporter un seul `.glb`.

### 2. Évolution « monde »

- Série d'index temporel **par monde** pour les captures tuilées (au lieu d'une série par `zoneId`), avec un
  nouvel appel `timelapse.tiles({ cumulative: true })` : pour chaque cellule de la grille, la tuile écrite la
  plus récemment à la date choisie ; une capture plus récente qui contient entièrement une cellule sans tuile
  la vide.
- Alignement de l'empreinte de capture sur la grille de tuiles (pour qu'une tuile soit toujours complète et
  puisse en remplacer une autre sans perdre le reste).
- Visualiseur unique (l'évolution intégrée au studio), galerie à une carte par évolution, ouverture sur la
  dernière capture, réponses GZIP de l'API.

## Ce qui n'a pas fonctionné

1. **Mauvaise série affichée.** Les captures n'étaient pas regroupées comme voulu : la galerie montrait une
   carte par capture et chaque « évolution » n'avait qu'une étape. Causes successives : captures manuelles non
   tuilées (donc une série par `zoneId` aux bornes exactes, qui change au moindre déplacement), interrupteur
   désactivé par défaut, puis regroupement fait côté API mais pas côté galerie.
2. **Poids et lenteur.** Un quad pèse environ 150 octets dans le GLB (4 sommets position + normale + UV). Une
   tuile de 64×64 blocs fait ~7,5 Mio ; une capture alignée de 128×128 blocs, 30 à 50 Mio. Le chargement dans
   le navigateur dépassait la minute. Le GZIP réduit environ 8× le transfert (mesuré), mais le décodage dans
   le navigateur (une tuile à la fois, `compileAsync` à chaque tuile) restait à mesurer.
3. **L'alignement agrandit les captures.** Pour garder des tuiles complètes, la zone capturée passe de
   65×65 à 128×128 blocs (puis 96×96 avec des tuiles de 32) : 2 à 4 fois plus de données par capture.
4. **Tuiles partielles.** Une capture qui ne couvre qu'une partie d'une tuile remplace toute la tuile : les
   anciennes captures non alignées « perdent » du terrain. Les chunks non chargés dans la zone agrandie
   laissent des trous qui remplacent aussi de l'ancien contenu.
5. **Compatibilité.** `capture.glb` devenait un bundle illisible dans Blender (comportement trompeur) ;
   changer la taille de tuile rend les anciennes captures incombinables ; les anciennes captures restent des
   séries isolées.
6. **Validation insuffisante.** Aucun bundle réel n'a été ouvert dans Blender ni dans le viewer avant de
   pousser ; le premier vrai test a révélé les problèmes 1 à 3 d'un coup. L'environnement de test ne permettait
   pas de piloter la fenêtre de jeu (pas de capture d'écran ni de clavier virtuel).
7. **Déploiement.** La CI échouait sur `bun audit` (faille dans `better-auth`), ce qui bloquait la mise en
   production sans que ce soit visible.

## Points difficiles à anticiper la prochaine fois

- Le vrai problème est la **composition de plusieurs captures partielles** d'un même monde : tuiles
  complètes ou non, trous de chunks non chargés, captures de formes et d'époques différentes. Il faut décider
  du modèle (tuiles complètes alignées ? volumes de blocs ? différences entre captures ?) avant d'écrire du
  code.
- Le **poids brut de la géométrie** domine (pas les textures) : il faut un budget par capture et une
  réduction (suppression des faces cachées, quantification, niveaux de détail, maillage fusionné) avant
  d'augmenter la zone.
- Le **regroupement** (qu'est-ce qui est « la même zone ») doit être validé sur des données réelles avant de
  construire dessus.
- Tout changement de **valeur par défaut** (tuiles activées, captures manuelles alignées) touche tous les
  joueurs : à faire en dernier, une fois le bout en bout validé.

## Leçons

- Valider le bout en bout avec de **vraies données** (un vrai bundle dans le viewer et dans Blender) avant de
  multiplier les couches (API, viewer, galerie, options).
- Mesurer avant d'optimiser : taille et temps de décodage réels d'une tuile et d'une capture complète.
- Ne pas activer par défaut une fonction non validée en jeu ; garder l'ancien chemin utilisable.
- Garder la vue produit simple d'abord (un seul visualiseur, une carte par monde), puis ajouter la technique
  derrière.
- Vérifier que la CI de déploiement est verte (`bun audit` inclus) avant de supposer qu'un push est en
  production.

## Commits retirés (consultables dans l'historique)

Format de tuiles et mod : `b04f474` (découpe dans le cœur), `2bd39f0` (spool par tuile), `baaaea5` (bundle
pour l'AFK), `0bf0a39` (option captures manuelles en tuiles).
API : `509718f` (validation et contrat), `f192555` (index et intervalle d'octets), `735ed1f` (envoi et service
des tuiles), `9e3eb90` (test), `71950ee` (GLB assemblé sur les routes de fichier).
Viewer : `e9dc2eb` (planificateur), `f92829a` (lecture tuile par tuile), `6421a5f` (fusion de GLB),
`e292557` (export d'une capture), `b73b976` (fusion dans le package de contrat).
Évolution monde : `43832af` (timelapse cumulatif), `76c0b20` (visualiseur unique), `7aaadeb` (une carte par
évolution, GZIP, tuiles de 32), `9bd26e1` (test d'ancien historique et `zoneId`).

Commits conservés le même jour : écran simple, réglages avancés par onglets, rappel de connexion, diagnostics
(`e37123b` à `7c60436`), domaines `minemories.net` (`690b6a5`), correctif de sécurité `better-auth`
(`3e5eac2`) et avis `bun audit` (`5b1fd1b`).
