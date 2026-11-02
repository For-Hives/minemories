# Score de zone, empreintes par chunk et rayon conseillé (issue #173, phase 5)

Objectif : savoir **quelles zones comptent** pour le joueur, sans rien envoyer et sans toucher à ses préférences. Cette
phase ne change **ni le déclenchement AFK, ni le rayon, ni l'envoi** : elle classe les suggestions de zones et conserve
localement ce que chaque capture a montré. Le prototype est validé sur des captures réelles et **en jeu** (essai natif du
2 novembre 2026 : voir `glb-size.md`, « Validation en jeu »). Les changements de comportement (voir « Reste ») ne sont pas faits.

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

## Validation en jeu

Essai natif NeoForge 1.21.1 sur profil isolé : `*.insights` écrit et relu, journal `Chunks seen by this capture`, et sur deux
captures AFK de même portée séparées par la modification de deux blocs : `changed=2, new=0` sur 9 chunks. L'AFK désactivé est
respecté (aucune capture en 600 images) et rien n'est envoyé sans appairage.

## Comportements (suite de la phase 5)

Validés en jeu (voir plus bas), tous **locaux** : aucun envoi supplémentaire et aucune lecture de réglage nouveau hors
`captureRadius`.

- **Rayon adaptatif de l'AFK.** Si le joueur n'a **jamais enregistré** de rayon (clé `captureRadius` absente de
  `minemories.properties`), l'AFK utilise le rayon conseillé de la zone (16, 32, 48 ou 64 selon le score) **une fois que des
  captures ont décrit cette zone** ; sinon, et dès qu'un rayon est enregistré (l'écran AFK l'écrit), le réglage est utilisé tel quel. Le
  contexte AFK (`CaptureSettings`) n'est pas modifié : seule la capture reçoit le rayon choisi, le journal indique
  `radius=…, stored=…` et le score.
- **Envoi évité pour une capture sans rien de nouveau.** Une capture AFK dont **aucun chunk n'a changé, aucun n'est nouveau
  et où le nombre de quads de créatures n'a pas bougé** reste enregistrée localement mais n'est pas téléversée
  (`upload skipped`). Les créatures entrent donc dans la décision par leur nombre de quads par chunk, pas par l'empreinte :
  un monde où des créatures se déplacent n'est jamais écarté. Un ancien fichier `*.insights` (sans ces comptes) compte comme
  « créatures déplacées » : rien n'est écarté sur une supposition. `/minemories upload` et les captures manuelles ne sont pas
  concernés ; sans appairage, rien n'est envoyé de toute façon.
- **Modifications du joueur.** Aucun point d'entrée client commun aux loaders (pose et casse sont des événements propres à chaque
  loader ou des mixins), donc la phase s'appuie sur le signal mesurable : le **nombre de captures qui ont trouvé le chunk
  différent** de la précédente (compteur `changes`, jusqu'à 1000), compté comme 16 modifications par changement observé
  (plafond du score à 64). Un chunk jamais vu changer reste « inconnu », pas « jamais modifié ».
- **`InhabitedTime`.** `ChunkAccess.getInhabitedTime()` est lu **dans le serveur intégré** (thread serveur, chunks que la capture
  vient de décrire), uniquement en solo ; sur un serveur distant le signal reste inconnu. API vanilla commune aux loaders,
  validée en jeu sur NeoForge seulement.

### Validation en jeu des comportements (2 novembre 2026)

Même méthode que `glb-size.md` (NeoForge 21.1.248, profil isolé, JAR `minemories-0.30.2-beta.1.jar` SHA-256
`2ecec8eb2697d532d674fcf13324ead29b8fea41e365bc221e5a59efebcac131`, pilote QA hors JAR, serveur HTTP local qui compte les requêtes) :

| Contrôle | Résultat |
| --- | --- |
| Avant appairage | 0 requête après deux captures AFK |
| 1re capture sans rayon enregistré, zone inconnue | rayon 32 (largeur de capture 64), score 0,26 |
| 2e capture, zone décrite, temps actif fixé à 2 h (fixture du pilote) | score 0,79 → **rayon 48** (largeur 96), 49 chunks |
| Rayon 16 enregistré | rayon 16 utilisé tel quel (`stored=true`, largeur 32) |
| Appairé, capture modifiée | tentative d'envoi (3 requêtes : refus 503 volontaire du serveur local, avec reprises) |
| Capture suivante identique | `upload skipped`, **0 requête de plus**, aucun envoi en attente |
| `InhabitedTime` | 25 chunks relevés, 4 850 à 8 692 ticks, 0 inconnu |
| Changements | 9 chunks vus changés après modification de blocs ; 2 chunks sur 25 pour deux blocs édités entre deux captures de même portée |
| AFK désactivé | aucune capture en 600 images, historique inchangé |

## Reste (suivi dans #173)

- Validation des comportements de cette phase sur Fabric et Forge (le code est commun et compile sur les trois loaders ; l'essai
  natif ne couvre que NeoForge) et sur un serveur distant (`InhabitedTime` inconnu par construction).
- Compter les vraies poses/casses de blocs : nécessite des événements par loader.
