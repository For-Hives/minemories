# Timelapse : fondations et travail restant

L’issue #75 est en cours. Les captures disposent désormais d’une identité de
monde et d’empreinte, ainsi que de leur origine géométrique exacte. Le codec de
découpage, le catalogue SQLite et le service de conversion/relecture en flux sont
raccordés aux routes API et validés sur filesystem et Garage. Les téléchargements
reconstruisent les GLB ; l’index temporel privé est disponible côté API. La navigation et l’animation
dans le viewer restent à livrer. La timeline de démonstration reste illustrative.

## Identifier les futurs états

Le mod écrit `worldId`, `worldScope`, `zoneId`, `captureMode`, `captureBounds` et
`captureOrigin` ensemble dans les métadonnées. L’API accepte toujours les anciens
souvenirs sans ces champs ; elle refuse une identité partielle, un volume
invalide ou une origine différente du centre entier des bornes inclusives.
Les coordonnées restent dans les métadonnées privées du souvenir.

`worldId` est un SHA-256 avec domaine versionné, marqueurs de présence et champs
UTF-8 préfixés par leur longueur. En solo (`worldScope: world`), il associe chemin
normalisé de la sauvegarde, seed connue, dimension et UUID du profil de connexion.
Aucun nom visible ni rapprochement géographique ne suffit à fusionner des mondes.
Copier ou renommer une sauvegarde peut produire une nouvelle identité. Le hash
n’est pas une preuve de propriété ni une anonymisation des coordonnées.

Sur un serveur distant, une adresse ne constitue pas un UUID de monde. Le mode
par défaut (`worldScope: session`) utilise un identifiant aléatoire de connexion,
avec adresse, dimension et profil de connexion. Une reconnexion crée une autre
série, même si le serveur conserve sa carte. Les changements de dimension puis
retours au monde initial conservent la session. Cela évite d’affecter implicitement
les captures de deux connexions à un même monde dont la seed est inconnue.

Pour une continuité voulue entre connexions, ouvrir **M → Mode avancé → Monde**,
générer un identifiant puis enregistrer. Ce choix local donne
`worldScope: namespace` : à adresse, identifiant, dimension et profil identiques,
les futurs états restent dans la même série après reconnexion et redémarrage.
Si le serveur remplace sa carte, générer et enregistrer un autre identifiant.
Effacer puis enregistrer revient au mode par connexion. Ce choix ne réaffecte pas
les anciens souvenirs. Aucun UUID universel fourni par le serveur n’est revendiqué.

Les UUID configurés sont conservés par adresse dans `config/minemories.properties`
(clés `remoteWorld.<empreinte>`). L’écran valide un UUID complet ; une valeur de
configuration invalide entraîne un repli par connexion et peut être effacée depuis
cet écran. Une édition manuelle de ces clés demande un redémarrage du client.
L’identifiant de réglage n’est pas transmis au serveur Minecraft : les captures
contiennent la portée déclarée et les empreintes calculées. L’envoi à l’API reste
subordonné à l’appairage. Modifier réellement un identifiant invalide le contexte
des captures/envois AFK en cours ; enregistrer la même valeur n’invalide pas ce
contexte. Les préférences AFK, l’API et le token de l’appareil sont conservés.

L’exploration suit ces mêmes frontières distantes. En mode par connexion, les
profondeurs et zones restent en mémoire pour au plus huit dimensions, avec
éviction des moins récemment utilisées ; aucun fichier n’est créé par session.
Le retour d’une dimension retrouve son état tant qu’il est dans cette fenêtre.
En mode configuré, les historiques sont persistés sous l’identité choisie et
retrouvés après redémarrage. Les historiques locaux existants gardent leurs clés.
Les anciens historiques distants ne sont pas réaffectés automatiquement à un
nouveau monde identifié. Le réglage configuré est mis en cache : pas de lecture
supplémentaire du fichier de propriétés à chaque tick d’exploration.

`zoneId` associe ce monde au mode et aux limites horizontales exactes. Le mode
`selection` inclut également les limites verticales explicites. En mode `around`,
la profondeur explorée peut s’étendre sans changer la zone ; changer le centre
horizontal ou le rayon produit une autre zone. Les anciens souvenirs ne seront
pas affectés rétroactivement à une série sur la seule base de leur nom ou seed.

L’origine correspond au centre des bornes effectivement exportées, et non à la
position du joueur. En AFK progressif elle est calculée après la recherche de
profondeur, juste avant la finalisation des métadonnées. Les données du monde
restent prises sur le thread client. Cela permettra de translater correctement
les scènes successives si leur centre vertical change.

## Découpage des morceaux

Le codec API parcourt un flux sans charger un GLB entier. Une fenêtre glissante
de 63 octets produit des frontières dépendantes du contenu : morceaux de
16 à 256 Kio, dernier morceau éventuellement plus court, empreinte SHA-256 par
morceau. Le tampon de travail fait 256 Kio ; chaque morceau émis est une copie
appartenant au consommateur. Le découpage reste identique quelle que soit la
fragmentation du flux entrant. Une insertion peut donc préserver les morceaux
suivants, contrairement à un découpage exclusivement par offsets fixes.

Le traitement rend la main à la boucle événementielle tous les 64 Kio et vérifie
l’annulation entre fenêtres et après chaque morceau. Il refuse une taille
annoncée invalide ou différente des octets reçus. Le consommateur devra également
annuler les E/S bloquées à la source. Le test avec insertion dans 4 Mio de données
déterministes conserve plus de 80 % des octets dans des morceaux inchangés ; ce
résultat synthétique n’est pas une mesure de gain sur des captures Minecraft.

## Catalogue transactionnel et baux

Les migrations ajoutent un catalogue de morceaux et de manifestes, sans convertir
les souvenirs existants. Un seul bail de conversion peut être actif dans la base,
y compris avec plusieurs processus ; il expire après quinze minutes sans
renouvellement. Les morceaux sont isolés par propriétaire et empreinte SHA-256.
Leurs références provisoires protègent les écritures en cours.

La publication exige l’accusé d’écriture de chaque morceau, les tailles exactes
et la présence du souvenir original, encore actif et inchangé. Une transaction
remplace sa clé logique, publie le manifeste ordonné et programme la suppression
de l’ancien GLB. Une erreur annule toute cette publication. Le catalogue ne fait
pas lui-même d’E/S : le service de conversion accuse chaque écriture après la
réponse du fournisseur. Les tests du catalogue seuls ne prouvent pas cette écriture.

Un morceau partagé reste conservé tant qu’un souvenir, une conversion ou une
lecture le référence. Les lecteurs possèdent leurs propres références temporaires,
indépendantes de la corbeille et de la suppression du souvenir : au maximum huit
lecteurs par propriétaire et soixante-quatre dans la base, avec des baux de quinze
minutes renouvelables. Le lecteur en flux ferme ou renouvelle ces
baux. La collecte retire les baux expirés et marque au plus cent morceaux sans
référence comme `deleting` avant de programmer leur suppression. Une nouvelle
conversion ne peut jamais réutiliser la clé d’un morceau ainsi marqué. Les
références et la réconciliation protègent les morceaux `pending` et `ready`.

Huit tests SQLite initiaux couvrent publication/rollback, deux propriétaires,
partage, corbeille/purge, baux expirés, état de suppression, manifestes incomplets,
limites de lecteurs, deux connexions et réouverture de la base. Un neuvième test
vérifie le nettoyage des écritures tardives. Les entrées `deleting` sont retirées
par lots de cent après consommation de leur demande de suppression physique.

## Conversion et relecture des fichiers dans l’API

`TimelapseFiles` convertit un souvenir identifié en parcourant son GLB d’origine.
Il écrit les morceaux nouveaux un par un et vérifie taille et SHA-256 des morceaux
réutilisés avant publication. Une erreur conserve le souvenir original et
programme le nettoyage des morceaux tentés, y compris lorsque le fournisseur a
écrit les octets avant de perdre son accusé. Une dette de nettoyage versionnée
empêche de commencer une autre conversion et d’accumuler les copies temporaires.

Chaque nouvelle intention de nettoyage issue du catalogue porte une génération
aléatoire. La file ne retire ou ne reporte que la génération effectivement
traitée : une écriture tardive qui redemande un nettoyage pendant un DELETE
asynchrone ne perd donc pas sa demande. Elle peut recréer cette intention même
après collecte de l’entrée de catalogue. Les anciens jobs et leurs tentatives
restent conservés à la migration.

Le lecteur reconstruit le GLB à partir du manifeste ordonné. Il vérifie chaque
morceau borné à 256 Kio avant émission et le hash global avant d’émettre le dernier
morceau. Les références de lecture restent protégées si le souvenir est purgé en
cours de téléchargement. La fermeture ou l’annulation du flux libère les baux,
y compris avant la première lecture. Un heartbeat renouvelle les baux et annule
l’opération après quinze minutes sans progrès ; le fournisseur doit honorer le
signal d’annulation pour interrompre ses E/S.

Neuf tests du service utilisent de vrais fichiers locaux et une base SQLite sur
disque : suppression des GLB originaux, réouverture de la base, comparaison exacte
des fichiers reconstruits, réutilisation des morceaux, limites d’écriture,
erreurs/corruption, purge pendant lecture, annulation et renouvellement/expiration
des baux. La maintenance de production passe toutes les cinq secondes et convertit au plus
un candidat identifié par passage, avec un seul bail de conversion dans la base.
Les erreurs disposent de délais persistants, de une minute à une heure ; une
métadonnée invalide ne bloque pas les candidats suivants. Les souvenirs anciens
non identifiés sont exclus. À l’arrêt, la maintenance annule ses E/S et attend la
persistance du nettoyage avant fermeture de SQLite.

Les chemins de téléchargement privé, partagé et public utilisent ce lecteur. Ils
réévaluent l’accès après ouverture asynchrone ; une révocation gagne avant émission
des en-têtes. Si une conversion a remplacé une clé entre recherche et ouverture,
le lecteur réessaie une fois la nouvelle clé. Les URL, droits, quotas logiques et
l’en-tête `Cache-Control: private, no-store` restent ceux des souvenirs existants.
Les adaptateurs filesystem et SDK S3 propagent les signaux d’annulation aux
écritures et aux flux ouverts.

La suite API compte 225 tests actifs passés et six tests Garage ignorés sans
serveur dédié. `bun api:garage` passe les trois tests HTTP/session existants, le
nouveau parcours de conversion, puis les six tests Garage réels avec pannes et
redémarrages. Le parcours temporel vérifie téléchargement privé/partagé/public,
modération par un autre compte, révocation, corbeille/restauration, quotas et
réclamation finale de tous les objets du propriétaire. Un inventaire vieilli de
48 heures classe tous les morceaux vivants comme protégés, sur filesystem et
Garage. La fixture Docker dédiée et ses volumes sont retirés après l’essai.

La navigation temporelle reste à implémenter.

## Validation des fondations, 15 octobre 2026

Le JAR `dce71edee097db9bb0b0206b103a392b2dcbb40ef53fa3b013c4a7e84cf4a9b3`
a été chargé dans cinq processus Minecraft 1.21.1 / NeoForge 21.1.248 avec Mesa.
Dix captures manuelles couvrent surface, grotte, retour, autre zone, hauteur
complète, sélection, retour de dimension, redémarrage, autre sauvegarde et autre
joueur. Quatre captures AFK couvrent notamment les rayons 8 et 32 et les
annulations/reprises du pipeline existant. Toutes leurs métadonnées passent le
parseur réel de l’API. Les identités attendues restent stables après redémarrage
et changement de profondeur ; monde, joueur et empreinte différents restent
séparés. Chaque origine est le centre exact des bornes finales.

Preuves locales hors Git :
`~/.local/state/minemories-validation/timelapse-foundation-20261015/`, notamment
`identities-verified.json`, les journaux de jeu et les métadonnées des fixtures.
Un essai hors production découpe les 14 GLB, écrit les morceaux uniques et
reconstruit chaque fichier en flux : taille et SHA-256 restent identiques. Les
5 904 752 octets de captures occupent 3 069 548 octets de morceaux uniques
(−48,02 %, hors manifestes). Ce corpus réutilise des sauvegardes de test et ne
préjuge pas du gain en production ; ce n’est pas une intégration du stockage
dédupliqué dans l’API. Le rapport est `codec-replay/report.json`.

Les tests Java couvrent aussi la séparation par dimension/seed, les champs nuls,
les limites entières et la finalisation différée des métadonnées. Les tests API
couvrent les identités partielles/incohérentes et les propriétés du codec.

## Index temporel privé

`timelapse.frames` reçoit l’UUID d’un souvenir appartenant à la session web
connectée, une ancre facultative et une direction `around`, `before` ou `after`.
Les liens partagés, publications publiques et tokens de mod ne donnent pas accès
à l’index du propriétaire. Les souvenirs sans identité complète restent accessibles
par leurs chemins habituels ; l’index ne les affecte pas à une série par leur nom.

La clé de série est dérivée côté serveur du propriétaire, `worldId`, `zoneId`,
dimension, mode et limites horizontales exactes. Pour une sélection, les limites
verticales font aussi partie de cette clé. Réutiliser un même hash de zone avec
d’autres coordonnées ou une autre dimension ne suffit donc pas à mélanger des
captures. Autour du joueur, l’extension verticale liée à l’exploration conserve la
série ; chaque frame garde ses bornes et son origine propres.

L’ordre utilise le début de capture, puis `capturedAt` s’il manque, puis la date
d’envoi enregistrée par l’API. Le champ `timeSource` distingue explicitement cette
dernière provenance. Les dates UTC, limitées à 64 caractères, sont ordonnées par
secondes et fraction complétée à longueur fixe, sans arrondi à la milliseconde ;
les égalités sont départagées par UUID. Un intervalle terminé avant son début,
y compris d’une seule nanoseconde, est refusé par le parseur de métadonnées.

Une réponse contient au plus 128 états réels, sans images ni contenu GLB. La
fenêtre initiale inclut au plus 64 états jusqu’à l’ancre et 64 après. Les fenêtres
`before` et `after` excluent l’ancre et fournissent au plus 128 états contigus.
`hasPrevious`, `hasNext`, le nombre total et les octets logiques de la série
permettent de naviguer sans supprimer silencieusement les états hors fenêtre.
Les fichiers restent limités à 200 Mio ; le quota propriétaire existant reste
2 Gio par défaut, corbeille et dettes de suppression incluses. Les morceaux
partagés évitent de conserver une copie complète supplémentaire par état.

L’index est écrit dans la même transaction que le nouveau souvenir. Un rattrapage
traite au plus vingt souvenirs identifiés par passage de maintenance ; les imports
invalides sont marqués pour ne pas bloquer les suivants. Les renommages sont lus
dans le souvenir courant, la corbeille est exclue des requêtes et une restauration
réutilise les mêmes entrées. La purge supprime la projection par clé étrangère.

Huit tests dédiés couvrent les comparaisons temporelles, 300 états et les fenêtres
bidirectionnelles, les empreintes incompatibles, les propriétaires, les noms,
corbeille/restauration/purge, imports invalides et réouverture de SQLite. Le test
HTTP/oRPC vérifie aussi accès anonyme/autre propriétaire et restauration, sur
filesystem et Garage. Les 14 captures natives déjà validées donnent sept séries,
dont six états de l’empreinte principale. Les écarts d’origine Y de −21 blocs en
grotte et −67 blocs en hauteur complète sont conservés pour la future relecture.
Preuve locale : `native-index-report.json`. `bun check` et `bun run build`
passent, avec 233 tests API actifs et six tests Garage ignorés sans service dédié.

## Validation de la portée distante, 15 octobre 2026

Le JAR `4104f3cd139857846593db52b61a47c84590a0c75a3e2f43ca2460a8d464113a`
passe neuf processus Minecraft 1.21.1 / NeoForge 21.1.248 : hôte intégré écoutant
uniquement sur boucle locale, deux processus clients distants, cinq parcours de
régression locaux et un parcours de mise à jour de l’ancienne sauvegarde de test.
La fixture distante utilise l’authentification hors ligne, sans publication LAN.

Les douze GLB distants et leurs métadonnées passent les validateurs réels de l’API
et donnent six séries. Le retour du Nether conserve la même identité et la
profondeur de grotte en mémoire. La reconnexion par défaut repart d’une autre
identité et n’hérite pas de cette profondeur. Le monde configuré conserve cinq
états dans la même série, dont après reconnexion et redémarrage du client ; son
historique persistant retrouve la grotte à Y=28. Changer d’UUID puis l’effacer
sépare les nouveaux états et ne réutilise pas cette profondeur. La préférence AFK
désactivée reste conservée. Les écrans réel vide/configuré ont été capturés et
inspectés, avec génération, effacement et enregistrement via leurs boutons.

Les parcours locaux conservent dix captures de profondeur/sélection et quatre du
parcours AFK, y compris annulations, reprise, états OpenGL et rayons 8/32. L’essai
sur l’ancien dossier du JAR précédent retrouve exactement les mêmes `worldId`,
`zoneId` et profondeur Y=28 : aucune migration des historiques solo n’est imposée.
Preuves hors Git : `~/.local/state/minemories-validation/timelapse-remote-20261015/`
(`report.json`, captures et screenshots) et `timelapse-world-scope-20261015/`
(`identities-verified.json`, `upgrade/report.json`).

L’API expose `TemporalWindow.scope` pour distinguer monde connu, session distante
et monde déclaré. Les tags distants anciens sans seed ni portée déclarée sont
exclus des séries mais restent téléchargeables. La migration de cache d’index
reconstruit seulement la projection et conserve souvenirs, manifestes et fichiers.
Les tests couvrent cette migration et les trois portées ; le helper partagé
`temporalIdentity` permettra au viewer de proposer seulement les captures compatibles.

## Préparation du lecteur temporel, 15 octobre 2026

Le moteur Three.js accepte une translation d’origine et conserve la caméra entre
captures. Il garde le modèle précédent jusqu’à la compilation réussie du suivant ;
une annulation ou une erreur libère le modèle rejeté et réaffiche le précédent.
Les géométries, matériaux, textures et pixels ImageBitmap partagés sont libérés une
seule fois par capture. Le ciel est repositionné avant les rendus immédiats, y compris
les miniatures. Les lumières importées appartiennent au modèle remplacé et gardent
leur position après translation.

Le contrôleur `TemporalLoader` borne les demandes à un chargement actif et une
sélection suivante remplaçable. Un défilement rapide annule la demande active,
attend que son parseur termine et charge uniquement la dernière sélection. Aucun
modèle ne se télécharge ou ne se décode en parallèle ; une erreur demande une
nouvelle sélection explicite. Ce contrôleur doit encore être raccordé à l’interface.

Onze tests ciblés vérifient remplacement, annulation avant lecture/pendant
compilation, fermeture pendant parsing, erreur GPU/reprise, libération des ressources
et 300 sélections rapides. `bun web:check` passe avec les seuils de couverture inchangés.
Le contrôle global `bun run build`, incluant `bun check`, passe à cette étape.

Validation graphique : Chromium headless avec WebGL/SwiftShader charge réellement
24 captures successives (surface, grotte, pleine hauteur, retour surface), avec
position et cible de caméra inchangées et un seul modèle courant. Les compteurs
GPU restent exactement constants pour chacun des quatre états sur six cycles :
30/14, 34/17, 44/19 et 34/17 géométries/textures respectivement. Cela vérifie ce
parcours borné, sans prétendre mesurer toute la mémoire du navigateur. Le journal
ne contient aucune exception JavaScript ; son unique erreur réseau concerne le
favicon absent du banc de validation. Les rendus ont été inspectés.

Blender 5.2.2 importe et rend les quatre GLB natifs avec une caméra commune et la
même correction d’origine (axes glTF convertis en axes Blender). La surface et la
colonne témoin restent alignées malgré les différences de profondeur. Preuves hors
Git : `~/.local/state/minemories-validation/timelapse-viewer-20261015/`,
`report.json`, quatre rendus Chromium, `blender-report.json` et quatre rendus Blender.
Le premier cadrage du banc Blender visait le zéro plutôt que la géométrie ; le
cadrage corrigé vise les limites de la première capture et les rendus finaux ont
été inspectés. Aucun contrôle de lecture temporelle n’est encore exposé à l’utilisateur.

## Essai en flux à la limite de 200 Mio

Un GLB réellement capturé avec le JAR ci-dessus a été étendu à 209 715 200 octets
par ajout de zéros inutilisés dans son BIN, sans changer géométrie ou textures.
Ce fichier passe le validateur API en flux. Le moteur de production filesystem
le convertit, supprime l’original puis, dans un nouveau processus, le sert par la
route HTTP privée : taille et SHA-256 restent identiques
(`9083bafe3aa58c4306c8253ff7a3d4355d47d7773851b0857b2efee288d5c3ab`).
Blender 5.2.2 importe et rend le fichier reconstruit : un mesh, 2 766 polygones,
terrain, végétation et entités visibles.

Le pic RSS observé passe de 84 416 à 164 700 Kio pour la conversion, et de
83 892 à 152 716 Kio pour la relecture HTTP dans le nouveau processus. Les
chemins de production conservent des tampons par morceau ; ces mesures incluent
le runtime et ses allocations temporaires. Ce remplissage artificiel produit six
morceaux uniques et ne constitue pas un benchmark de compression de scènes.
Preuves locales : `large-stream/report.json`, `fixture.json`, `blender.json` et
`replayed.png` dans le dossier de validation des fondations.

## Critères encore ouverts avant livraison

- Raccorder l’index privé, son ordre déterministe et ses fenêtres bornées au
  viewer ; conserver l’exclusion des captures anciennes non identifiées.
- Coupler les manifestes, les baux et le nettoyage déjà validés aux séries de
  l’index temporel ; conserver quotas, corbeille et réconciliation lors de cette
  intégration.
- Bornes explicites sur les séries et leur stockage, comportement documenté
  lorsque ces bornes sont atteintes, sans suppression silencieuse des souvenirs.
- Navigation et lecture des seuls états réellement disponibles, alignement des
  origines, annulation des chargements, reprise et validation d’interaction.
- Mesures sur plusieurs captures réelles et relecture du GLB reconstruit après
  redémarrage ; validation complète avant fusion et fermeture de #75.

La cadence AFK existante reste cinq minutes d’inactivité, au plus une capture
toutes les quatre heures par défaut. Une future animation représentera les
snapshots présents, avec leurs intervalles réels ; elle ne pourra pas reconstruire
les modifications antérieures à la première capture ni inventer les états entre
deux souvenirs.
