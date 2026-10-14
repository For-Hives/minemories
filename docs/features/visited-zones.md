# Suggestions de zones fréquentées

Le menu **M → Zones suggérées** et `/minemories suggestions` présentent les cinq
zones les plus fréquentées du monde, de la dimension et du joueur actuels.
Ces suggestions restent locales : ouvrir la liste ne change aucun coin de sélection,
ne produit aucun GLB et ne déclenche aucun envoi. Le joueur rejoint une zone puis
choisit normalement son export local ou sa capture.

## Score et agrégation

Le score est un temps actif approximatif, échantillonné une fois par seconde sur
le thread client. Deux observations consécutives doivent être actives et espacées
de 1 à 2 secondes ; chacune crédite une seconde au maximum. Aucun rattrapage
n’est effectué après un arrêt, un changement d’horloge ou un client bloqué.

Une observation est active lorsque le jeu est focalisé, non pausé et que le joueur
a bougé ou tourné la caméra dans la dernière minute. Le chunk doit avoir réellement
été reçu par le client : le compteur ne charge pas de terrain. Les longues pauses
AFK ne rendent donc pas une zone artificiellement intéressante. Les interactions
immobiles sans mouvement de caméra ne sont pas un signal supplémentaire.

Les chunks sont agrégés en cases fixes de **64 × 64 blocs** (4 × 4 chunks), avec
arrondi vers le bas aussi aux coordonnées négatives. Une case apparaît après
60 secondes créditées. La liste affiche ses bornes X/Z et les minutes cumulées ;
les égalités sont départagées par coordonnées. Il s’agit d’un signal de
fréquentation, sans analyse ni promesse de détection des constructions.

## Persistance et limites

Les scores sont séparés du suivi de profondeur :
`config/minemories/exploration/<identité-hachée>.properties.zones`.
L’identité reprend le chemin du monde solo ou l’adresse du serveur, la dimension
et l’UUID du joueur. Aucun nom de serveur n’apparaît dans le nom de fichier.
Le suivi fonctionne aussi sans appairage et avec les captures AFK désactivées.

Chaque historique conserve au plus 10 000 cases ; une ancienne entrée est
évincée à la limite. Le crédit replace une case en fin de file, mais l’ordre
d’éviction est reconstitué à la lecture. Un score sature à 365 jours. La lecture refuse les fichiers
supérieurs à 1 Mio, les liens symboliques et les scores/coordonnées invalides.
Les entrées textuelles endommagées sont ignorées ; un fichier illisible est
préservé, le suivi de cette session restant en mémoire. Les sauvegardes utilisent
le remplacement atomique commun aux réglages, toutes les dix secondes et lors
d’un changement d’identité/d’une déconnexion. Un arrêt brutal peut perdre les
dernières secondes non sauvegardées.

## Validation

`VisitedZonesTest` vérifie agrégation, classement, coordonnées négatives, seuil,
pause/chunks absents/horloge, persistance sans rattrapage, éviction, limite de liste,
fichiers surdimensionnés et liens symboliques. Les tests d’identité de
`ExplorationDepthTest` couvrent la clé partagée monde/dimension/joueur.
## Essai natif du 15 octobre 2026

Minecraft 1.21.1 / NeoForge 21.1.248, Temurin 21.0.12.1+1, Mesa llvmpipe
OpenGL 4.6. JAR 0.1.1-dev.1 chargé depuis `mods/`, SHA-256 :
`27f273dc654bfc6f3cef3c8f4ef839750743af2f02258e1f8241136f1fd9788a`.
Le pilote QA est un mod séparé, absent du JAR distribué. Il fait tourner la caméra
pendant deux séjours réels de 70 secondes, en fenêtre focalisée, puis ouvre le
bouton **Zones suggérées** du menu M.

Les cases X 0…63 / Z 0…63 et X 64…127 / Z 0…63 apparaissent après une minute.
L’écran est inspecté sur une capture native 900 × 600 : texte, bornes, minutes et
bouton Retour lisibles. L’ouverture conserve la sélection ; six secondes dans
cet écran pausé ne créditent rien. Un déplacement temporaire du client dans un
chunk non reçu ne crée pas de score. Un aller-retour Nether/Overworld sépare puis
restaure les suggestions du monde initial. Le compte reste non appairé et l’AFK
désactivé ; aucun export ni envoi n’est demandé.

Les processus de redémarrage, autre monde et autre joueur vérifient la persistance
et l’isolation. Les artefacts restent hors Git dans
`~/.local/state/minemories-validation/visited-zones-fixed-20261015/` : sources du
pilote, JAR/empreinte, logs, rapports d’assertions et capture d’écran. `bun check`
et `bun run build` passent avec les 140 tests NeoForge, SpotBugs et les seuils de
couverture inchangés.
