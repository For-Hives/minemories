# Score de zone, empreintes par chunk et rayon conseillé (issue #173, phase 5)

Objectif : savoir **quelles zones comptent** pour le joueur, sans rien envoyer et sans toucher à ses préférences. Cette
phase ne change **ni le déclenchement AFK, ni le rayon, ni l'envoi** : elle classe les suggestions de zones et conserve
localement ce que chaque capture a montré. Le prototype est validé sur des captures réelles hors jeu ; **rien n'est
validé en jeu** (le jeu n'est pas pilotable dans cet environnement).

## Signaux et score (`ZoneScore`, module `core`, testé sans Minecraft)

Score d'un chunk 16 × 16 dans [0, 1] : moyenne pondérée de signaux saturés (`min(1, ln(1+x)/ln(1+plafond))`, linéaire
pour une proportion). **Un signal inconnu est écarté et les poids restants renormalisés**, jamais compté comme zéro.

| Signal | Poids | Plafond | Source | État |
| --- | ---: | ---: | --- | --- |
| Temps actif de la zone | 0,30 | 2 h | `VisitedZones` (existant) | utilisé |
| Modifications du joueur (pose/casse) | 0,25 | 64 | aucun point d'entrée client sans mixin | **non implémenté** (inconnu) |
| Part de blocs construits (planches, briques, verre, laine…) | 0,20 | 30 % | quads de la capture, `NaturalBlocks` | utilisé |
| Blocs-entités (coffres, lits, fours, panneaux) | 0,15 | 8 | quads de la catégorie `block_entities` ÷ 24 | utilisé (approximatif) |
| Lumières posées | 0,05 | 16 | lumières de la capture | utilisé, peu discriminant |
| `InhabitedTime` du chunk | 0,10 | 72 000 ticks | `ChunkAccess.getInhabitedTime()` existe en 1.21.1 (vérifié par `javap`) | **non utilisé** : valeur côté client non vérifiée, prévue comme bonus facultatif |

Zone de 64 blocs (4 × 4 chunks décrits par les captures) : `0,6 × meilleur chunk + 0,4 × moyenne`. Sans capture, seul le
temps compte. **Rayon conseillé** : 16 à 64 par pas de 16 selon le score ; affiché dans la suggestion, jamais appliqué.

## Stockage local (`ZoneInsights`)

Fichier `*.insights` à côté de l'historique des zones (mêmes règles de lecture défensive et de borne : 10 000 chunks, 2 Mio) :
part de blocs construits, nombre de blocs-entités, lumières et empreinte par chunk **absolu**. Il n'est lu et écrit que
dans le monde persistant du joueur ; il ne sort jamais de l'appareil (ni avant ni après l'appairage), n'entre jamais dans
le GLB ni dans les métadonnées envoyées, et la désactivation des diagnostics, l'AFK désactivé ou tout autre réglage
explicite ne sont pas lus ni modifiés. Les captures lancées manuellement et AFK l'alimentent de la même façon.

## Empreinte par chunk (`ChunkStats`)

Pour reconnaître les chunks **inchangés** entre deux captures. Indépendante de l'origine de capture et de l'ordre des
quads : somme de hachages de forme (matériau + arêtes relatives) et moments d'ordre 1 et 2 des centres de quads,
**décalés en coordonnées absolues** une fois l'origine connue ; les entités (mobiles) sont exclues. C'est un détecteur de
changement, pas une preuve (deux blocs échangés de façon symétrique ne se voient pas). Le client journalise
`total / changed / new` après chaque capture ; **aucune capture n'est encore évitée** sur cette base : décider de ne pas
recapturer un chunk change le comportement du mod et demande une validation en jeu (voir « Reste »).

## Validation sur données réelles (hors jeu)

Les 42 captures lisibles de l'historique local (46 dossiers ; 4 d'un autre format non lus), rejouées par le vrai
writer avec les catégories déduites des noms de matériaux :

- Le score sépare nettement constructions et nature : une capture dont 66 % des quads sont construits (832 quads de
  blocs-entités) atteint 0,88 sur son meilleur chunk ; les neuf captures dont moins de 0,5 % des quads sont construits restent
  entre 0,00 et 0,29 (meilleur chunk). Les captures les mieux notées (≥ 0,85) sont toutes des sites où des blocs-entités et
  des blocs construits sont présents.
- Les lumières saturent presque toujours (128 = limite du writer, nombreuses sources naturelles en grotte) : elles
  restent à poids 0,05.
- Carte de chaleur d'une capture (chunk à 1,00 contenant la structure visible) superposée à une vue de dessus Blender :
  cohérente à l'œil, mais le rendu de dessus est plat (sable) et ne permet pas une comparaison fine.
- Empreintes : sur deux captures de même portée prises à deux minutes d'intervalle avec des origines décalées d'un
  bloc, **106 chunks sur 134 (79 %) sont reconnus identiques** ; les autres paires comparées ont des portées différentes
  (profondeur, origines différentes) et diffèrent presque partout, comme attendu.

## Reste (suivi dans #173)

- Validation en jeu du classement, du stockage `*.insights` et des journaux de changement.
- Compter les modifications du joueur (poser/casser) : nécessite un point d'entrée client propre à chaque loader.
- Utiliser `InhabitedTime` en solo (serveur intégré) une fois la lecture vérifiée en jeu.
- Éviter de recapturer/téléverser les chunks inchangés et ajuster le rayon automatiquement : changements de comportement
  à valider en jeu, en respectant AFK désactivé et réglages explicites.
