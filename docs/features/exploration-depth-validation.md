# Validation de la profondeur visitée

Le scénario de l’issue [#7](https://github.com/For-Hives/minemories/issues/7) a été
exercé le 15 octobre 2026 dans quatre lancements Minecraft réels, avec un mod de
validation séparé et le JAR de distribution chargé depuis `mods/`.

Versions : Minecraft 1.21.1, NeoForge 21.1.248, JDK Temurin 21.0.12.1+1,
Minemories 0.1.1-dev.1 ; Mesa llvmpipe OpenGL 4.6 et Blender 5.2.2.
SHA-256 du JAR :
`34d6bf346cfe97d869325df9282295f9a67598a7a749705e20e4ec715646068f`.

## Parcours comparatif

Une copie isolée du monde de test contient une petite construction au-dessus du
sol et une chambre à Y=30, avec deux blocs de fondation à Y=28/29. Les téléports
utilisent les commandes du serveur intégré, puis les tests attendent la position
client et les chunks reçus. Les captures autour du joueur utilisent un rayon 2
(5×5 colonnes). Le mode spectateur évite qu’un plafond de pierre empêche la visite.

| Étape | Fond du GLB, Y monde | Sommet | Hauteur | Taille |
| --- | ---: | ---: | ---: | ---: |
| Surface, avant descente | 69 | 80 | 11 | 63 096 octets |
| Chambre, pieds à Y=30 | 28 | 80 | 52 | 184 312 octets |
| Retour en surface | 28 | 80 | 52 | 184 312 octets |
| Autre zone, 64 blocs plus loin | 69 | 84 | 15 | 67 380 octets |
| Pleine hauteur explicite | -64 | 80 | 144 | 483 628 octets |
| Sélection Y=40..45 | 40 | 46 | 6 | 16 512 octets |
| Retour après passage dans le Nether | 28 | 80 | 52 | 184 312 octets |
| Même monde après redémarrage complet | 28 | 80 | 52 | 184 312 octets |
| Autre sauvegarde, mêmes nom/seed/position | 69 | 74 | 5 | 57 016 octets |
| Même sauvegarde, autre UUID joueur | 69 | 80 | 11 | 61 864 octets |

Les extrema sont lus dans les accessors de positions et replacés dans le repère
monde avec l’origine enregistrée par l’export manuel. Le sommet de la construction
est conservé avant et après la descente. Le plancher Y=28 garde bien deux blocs
sous les pieds Y=30. Les coins explicites ne reprennent pas cette profondeur ;
la pleine hauteur descend au minimum de dimension -64.

Dans le Nether, le chemin d’historique change et aucune profondeur Overworld Y=30
n’est héritée. Au retour, le chemin Overworld et son minimum sont retrouvés.
Une position client temporaire dans un chunk non reçu n’ajoute aucune entrée :
la map de visites avant/après est identique. Cette vérification appelle le suivi
avant un tick réseau puis rétablit la position ; elle ne fait pas charger le chunk.

Le second lancement reprend le même monde/joueur et retrouve le minimum Y=28 à
la surface. Le troisième ouvre une autre sauvegarde ayant le même nom et la même
seed ; sa capture reste peu profonde. Le quatrième lance un autre nom/UUID joueur
dans le premier monde ; son historique ne récupère pas celui du premier joueur.

## Persistance, limites et confidentialité

Les quatre lancements utilisent une préférence AFK explicitement désactivée,
conservée après redémarrage. Le suivi de profondeur continue malgré cette préférence.
Aucun appareil n’est appairé ; les captures et historiques restent locaux. Le
transport d’envoi lit le GLB et ses métadonnées, sans lire l’historique d’exploration.

Les tests `ExplorationDepthTest` couvrent séparément coordonnées négatives, limites
extrêmes, identités, fichiers altérés, persistance et un parcours de 100 001 chunks :
l’entrée la plus ancienne est évincée, le fichier reste sous 8 Mio et le minimum
conservé est retrouvé après lecture. L’historique est borné à 100 000 chunks par
monde/serveur, dimension et joueur. Les visites précédant l’installation ne sont
pas inventées.

Les dix GLB du scénario passent le validateur partagé API. Les rendus Blender de
la première surface et du retour après visite profonde ont été inspectés : la
construction est intacte, le volume superficiel reste court avant la descente et
le volume sous-jacent s’étend après visite. Les coupes terre/pierre gardent leurs
limites décrites dans la validation de #8.

Artefacts locaux : `~/.local/state/minemories-validation/depth-zones-20261015/`
(programme, empreinte du JAR, événements, rapports des bornes, GLB, rendus et journaux
des quatre processus). Le monde original, les profils personnels et leurs
préférences n’ont pas été modifiés. Aucun monde, GLB ou historique privé n’est committé.

Sur serveur distant, la séparation par connexion et l’identifiant de monde
configurable sont décrits dans [Timelapse](timelapse.md). Sans identifiant explicite,
l’historique est en mémoire (huit dimensions au plus) ; avec un identifiant, il
est conservé entre connexions. Les historiques solo existants restent inchangés.
