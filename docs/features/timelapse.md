# Timelapse : fondations et travail restant

L’issue #75 est en cours. Les captures disposent désormais d’une identité de
monde et d’empreinte, ainsi que de leur origine géométrique exacte. Le codec de
découpage pour la déduplication est testé isolément. Il n’est pas encore relié au
stockage : les fichiers restent des GLB complets et aucune lecture temporelle
réelle n’est livrée à ce stade. La timeline de démonstration reste illustrative.

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

## Codec de morceaux, non encore intégré

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

## Critères encore ouverts avant livraison

- Index temporel propriétaire, ordre déterministe des captures et vérification de
  cohérence de l’empreinte ; exclusion des anciennes captures non identifiées.
- Manifestes et morceaux adressés par contenu, publication transactionnelle,
  reprise après panne, nettoyage sans supprimer de données référencées et
  compatibilité avec quotas, corbeille et réconciliation.
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
