# Timelapse : fondations et travail restant

L’issue #75 est en cours. Les captures disposent désormais d’une identité de
monde et d’empreinte, ainsi que de leur origine géométrique exacte. Le codec de
découpage, le catalogue SQLite et le service de conversion/relecture en flux sont
raccordés aux routes API et validés sur filesystem et Garage. Les téléchargements
reconstruisent les GLB ; aucune navigation ou animation temporelle réelle n’est
encore livrée à ce stade. La timeline de démonstration reste illustrative.

## Identifier les futurs états

Le mod écrit `worldId`, `zoneId`, `captureMode`, `captureBounds` et
`captureOrigin` ensemble dans les métadonnées. L’API accepte toujours les anciens
souvenirs sans ces champs ; elle refuse une identité partielle, un volume
invalide ou une origine différente du centre entier des bornes inclusives.
Les coordonnées restent dans les métadonnées privées du souvenir.

`worldId` est un SHA-256 avec domaine versionné, marqueurs de présence et champs
UTF-8 préfixés par leur longueur : chemin normalisé de la sauvegarde locale ou
adresse du serveur, seed connue, dimension et UUID du joueur. Aucun nom visible
ni rapprochement géographique ne suffit à fusionner des mondes. Copier ou
renommer une sauvegarde peut produire une nouvelle identité. Sur un serveur dont
la seed est inconnue, remplacer le monde derrière la même adresse reste
indétectable avec ces seules informations ; une future identité fournie par le
serveur sera nécessaire pour distinguer automatiquement ce cas. Le hash n’est
pas une preuve de propriété ni un mécanisme d’anonymisation des coordonnées.

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

- Index temporel propriétaire, ordre déterministe des captures et vérification de
  cohérence de l’empreinte ; exclusion des anciennes captures non identifiées.
- Coupler les manifestes, les baux et le nettoyage déjà validés aux séries de
  l’index temporel ; conserver quotas, corbeille et réconciliation lors de cette
  intégration.
- Identité conservatrice pour les serveurs distants dont la seed est inconnue,
  afin de ne pas réunir deux mondes remplacés derrière une même adresse.
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
