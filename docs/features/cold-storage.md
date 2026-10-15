# Archivage des captures inactives

Suivi de l’issue [#85](https://github.com/For-Hives/minemories/issues/85).
Le suivi des ouvertures et la prévisualisation des candidats sont implémentés ;
aucune transition vers une classe froide n’est encore activée.

## Dernière ouverture réelle

`memories.last_opened_at` est un timestamp SQLite en millisecondes, initialement
`NULL`, y compris pour les captures présentes avant migration. Les routes GLB
privées, partagées et publiques le mettent à jour lors de la livraison du premier
fragment non vide du flux. Il s’agit d’une lecture du fichier côté serveur ; cela
ne prouve pas que le navigateur a terminé son rendu ou téléchargé tout le fichier.

Une requête non autorisée, un handle ouvert sans consommation, un flux vide ou
un échec avant le premier fragment ne comptent pas. L’autorisation est vérifiée
à nouveau avant d’enregistrer l’ouverture. Les accès à la galerie, aux métadonnées,
aux miniatures et les lectures internes de conversion/réconciliation ne comptent
pas. Une livraison partielle compte si des octets ont déjà été délivrés.

La mise à jour est monotone, utilise la date de création comme borne inférieure
et suit la ligne du souvenir après conversion de sa clé physique. Une capture
supprimée ne reçoit plus de nouvelle date. En l’absence d’ouverture, la politique
d’inactivité devra utiliser `created_at` ; aucun historique antérieur n’est inventé.

## Prévisualiser l’éligibilité

Depuis la racine du dépôt :

```bash
bun api:archive:plan --idle-days 90 --limit 100
```

La commande ouvre une base existante et migrée en lecture seule. `--idle-days`
accepte un entier de 60 à 90 ; à défaut, `COLD_STORAGE_INACTIVE_DAYS` s’applique,
puis la valeur 90. `--limit` borne le résultat entre 1 et 1 000 objets (100 par
défaut). Le JSON contient des clés et identifiants privés : conserver sa sortie
dans un emplacement privé. Aucun accès au provider, archivage ni suppression
n’est effectué. Ce résultat n’est pas une réservation : un worker devra vérifier
l’éligibilité à nouveau atomiquement avant toute transition.

La sélection prend la plus récente des dates de création/ouverture de **tous**
les souvenirs qui référencent un objet. Les clés de manifestes virtuels ne sont
pas des objets physiques. Un bloc dédupliqué n’est compté qu’une fois, même s’il
apparaît plusieurs fois dans un même souvenir. Les souvenirs dans la corbeille
protègent leurs blocs ; les conversions, lectures timelapse en cours et intentions
de suppression excluent les objets concernés. La prévisualisation ne modifie pas
les dates d’ouverture.

Les lectures de GLB originaux obtiennent un lease dans `capture_readers`, visible
par les autres connexions SQLite. Il est renouvelé pendant le transfert et libéré
à la fermeture, à l’annulation ou en cas d’échec d’ouverture du stockage. Un flux
sans progrès pendant 15 minutes est interrompu ; un lease expiré ne peut pas être
renouvelé. Le budget est de 8 lecteurs par propriétaire et 64 au total pour les
originaux, en complément des limites des lecteurs timelapse.

La file de suppression et la réconciliation reconnaissent aussi ces lecteurs :
une conversion peut remplacer la clé logique pendant qu’un téléchargement garde
l’original ouvert, sans supprimer ce fichier avant la fermeture du flux. Les
leases périmés après une interruption sont collectés ; les suppressions restent
dans la file durable jusque-là.

## États durables et exclusion des lectures

`object_tiers` conserve l’état de chaque objet : `hot`, `archiving`, `cold` ou
`restoring`. L’absence de ligne signifie que l’objet est à chaud. Le catalogue
réserve un objet dans une transaction SQLite immédiate, en vérifiant à nouveau
son éligibilité exacte, toutes ses références et les lecteurs/conversions actifs.
La limite de prévisualisation ne limite pas cette vérification à un premier lot.

Les leases de lecture vérifient dans leur propre transaction que les objets sont
à chaud. Un souvenir timelapse vérifie **tous** ses blocs avant d’ouvrir un flux ;
un seul bloc indisponible empêche l’ouverture complète, sans lecteur partiellement
créé. Une conversion ne peut ni lire un original en transition ni réutiliser un
bloc froid. Les opérations d’archivage/restauration en cours protègent aussi leurs
objets contre la suppression et la réconciliation.

Les travaux ont une génération d’opération et un lease de worker de 15 minutes.
La reprise d’un lease expiré ne remet pas l’objet à chaud : une ancienne
confirmation ne peut pas modifier la nouvelle réservation. Un échec garde l’état
indisponible et une date de nouvelle tentative en base, avec un délai exponentiel
de 1 minute à 1 heure. Une demande de restauration pendant l’archivage attend sa
confirmation ; les demandes répétées sont idempotentes. La restauration est
prioritaire sur un nouvel archivage.

Après restauration confirmée, une fenêtre de 15 minutes empêche un réarchivage
immédiat avant que le viewer récupère le fichier. Cette fenêtre ne compte pas
comme une ouverture réelle et ne modifie pas `last_opened_at`. Une suppression
confirmée retire les métadonnées de tier devenues inutiles avec sa tâche durable.

Ces garanties portent sur les réservations SQLite. Un worker de stockage n’est
pas encore activé : son adaptateur devra confirmer/réconcilier les résultats
distants, y compris les requêtes dont la réponse a été perdue, avant de publier
un état lisible. Les leases SQLite ne peuvent pas annuler une copie déjà reçue
par le provider. Les API d’état/restauration et leur affichage restent à relier.

## Générations physiques et nettoyage

Les clés logiques des souvenirs et des blocs timelapse restent stables. Une copie
réserve une nouvelle clé physique dans `<propriétaire>/tiers/<uuid>.glb`, distincte
des clés d’upload. La réservation est persistée avant l’écriture. Après confirmation
du provider, la publication du pointeur physique et du nouvel état se fait dans
la même transaction. Un worker expiré reçoit une autre clé à sa reprise et ne peut
pas publier l’ancienne réservation.

Cette séparation protège aussi contre une requête distante déjà reçue dont la
réponse a été perdue : si elle finit après une restauration, elle écrit son ancienne
génération, jamais le fichier redevenu lisible. Les lectures et suppressions de
l’API résolvent le pointeur ; le flux GLB reste streaming et les URL, permissions,
métadonnées et miniatures ne changent pas. Le quota logique ne compte pas deux fois
un souvenir pendant une copie technique. Le catalogue n’accorde qu’un lease de
copie actif à la fois ; les coûts physiques transitoires restent à inclure dans le
dimensionnement de l’opérateur.

L’ancienne copie est conservée jusqu’à publication de la nouvelle. Elle rejoint
ensuite une file de nettoyage physique distincte de la suppression du souvenir.
Cette distinction permet de libérer l’ancien objet même si sa clé logique est
encore utilisée. Une génération publiée ou réservée reste protégée contre le
nettoyage et l’inventaire de réconciliation. Les copies abandonnées après perte de
lease passent par le délai de grâce des orphelins (24 heures). Le namespace `tiers`
est reconnu par la réconciliation si une écriture tardive recrée un objet déjà
retiré de cette file.

Le nettoyeur traite au plus une génération par passage, conserve les échecs et
leurs délais de reprise dans SQLite, puis attend le transfert en cours lors de
son arrêt. Son ordonnanceur sera relié au worker du provider ; aucun archivage
ni nettoyage physique de tier n’est activé automatiquement à cette étape.

Les tests utilisent de vrais fichiers : archivage/restauration avec changement de
clé, suppression de l’original, lecture via la nouvelle génération, reprise après
interruption, panne de suppression et écriture ancienne terminée en retard. Ils
vérifient aussi que le quota et le nettoyage des références restent cohérents.

## Contraintes pour la suite

### Disponibilité et demande de restauration

Le contrat partagé expose `captureStorage.status` et `captureStorage.restore`,
avec un accès propriétaire (ID du souvenir), un lien partagé (token) ou une
publication publique (ID public). L’autorisation est réévaluée dans la même
transaction que le manifeste et la demande de restauration. Les accès révoqués
ou supprimés ne peuvent ni lire l’état ni ajouter du travail.

La réponse contient l’état `ready`, `archiving`, `cold` ou `restoring`, le nombre
d’objets physiques distincts prêts et leur nombre total, sans clé ni détail du
fournisseur. Un bloc dédupliqué ne compte qu’une fois. La demande porte sur tous
les blocs du manifeste ; les répétitions restent idempotentes et ne modifient pas
la dernière ouverture. Aucun lecteur ne commence tant qu’un bloc reste froid.
La disponibilité décrit le catalogue ; une panne du stockage demeure une erreur
distincte lors de la lecture.

Les trois routes GLB répondent `202` avec `memory_restoration_required` et
`availability` lorsque la restauration est nécessaire, en conservant
`Cache-Control: private, no-store`. Consulter cet état ou recevoir ce JSON ne
compte pas comme une ouverture du GLB. Les tests HTTP/oRPC couvrent propriétaires,
partages sans compte, publications approuvées, révocation, fichiers originaux et
captures dédupliquées. L’assemblage API/provider n’étant pas encore branché,
`restorationAvailable` vaut actuellement `false` dans l’API, une demande autorisée
renvoie `503` et aucun délai de polling n’est annoncé. Le service transactionnel
de demande/progression est testé avec la restauration activée sur des fixtures.

### Configuration et traitement distant

La configuration reste désactivée par défaut (`COLD_STORAGE_PROVIDER=off`). Une
future utilisation exige un choix explicite `aws` ou `r2`, `COLD_STORAGE_CLASS`
(`GLACIER`, `DEEP_ARCHIVE` ou `STANDARD_IA` ; R2 accepte uniquement cette dernière),
et un endpoint HTTPS, un bucket et une région explicitement renseignés. Cette
configuration ne lance encore aucune copie. Garage et le stockage local ne
reçoivent pas automatiquement une politique froide.

À la première configuration, SQLite lie le catalogue au driver, à l’URL complète,
au bucket, à la région et à la politique choisie. Un catalogue préexistant sans
identité doit être réconcilié avant cette liaison. La rotation des identifiants
n’impose pas de migration. Changer de destination ou de politique exige une
migration explicite ; même après désactivation du worker, une autre destination
bloque le démarrage de l’API et la réconciliation avant l’accès à l’inventaire.
Cela protège les générations publiées et les nettoyages encore en attente.

`ColdStorageWorker` utilise le catalogue et ses réservations durables, traite
une opération par passage et regroupe les appels concurrents. Il renouvelle
son bail pendant les appels distants, transmet un signal d’annulation et attend
la fin de l’opération lors de l’arrêt. Un fournisseur doit confirmer la disponibilité
de la source avant la copie, puis vérifier la taille et la classe de la destination
avant de rendre la main. Une restauration encore en attente reprend avec le délai
de réessai durable. Une copie dont la réponse est perdue reste isolée dans sa
génération et son nettoyage attend le délai de grâce des orphelins.
Les tests couvrent ces cas avec de vrais fichiers, ainsi que la perte du bail et
les acquittements périmés. L’adaptateur `S3ColdStorageProvider` est maintenant testé
avec le vrai SDK contre un serveur HTTP local. Il ne s’exécute pas au démarrage ;
aucun ordonnanceur n’est encore branché et cette étape n’active pas l’archivage.

L’adaptateur copie côté stockage, sans télécharger le GLB dans l’API. Il contrôle
la taille (au plus 200 MiB), le propriétaire, les clés réservées, la classe et
l’ETag de la source, transmet `CopySourceIfMatch`, puis exige un résultat SDK et
un `HEAD` destination concordants avant la publication. Les métadonnées sont
conservées et aucune ACL publique n’est ajoutée. Les classes hot/cold sont
`STANDARD` et la classe explicitement choisie. Sur AWS, chaque préparation/copie
refuse un bucket versionné ou dont le versioning a été suspendu : les suppressions
ordinaires ne garantiraient pas l’effacement des anciennes versions privées.
R2 n’implémente pas `GetBucketVersioning` ; cette opération ne lui est pas envoyée.

Pour Glacier/Deep Archive, `RestoreObject` demande une copie temporaire d’un jour,
en mode Standard. Un retour accepté ou un conflit « déjà en cours » ne rend pas
le GLB lisible : le worker attend un `HEAD` confirmant la restauration, avec au
moins quinze minutes avant expiration, puis copie vers une nouvelle génération
`STANDARD` permanente. R2 et `STANDARD_IA` utilisent directement `CopyObject`.
Ce mode de restauration et ses coûts devront être validés sur le compte choisi.

Les tests HTTP couvrent aussi l’erreur XML dans une réponse 200, la réponse perdue
après écriture distante, la précondition refusée, les métadonnées incohérentes,
l’annulation du SDK et une copie distante finissant après l’arrêt du worker.
Cette dernière reste dans sa génération non publiée ; une reprise publie une
autre clé. Ces tests ne remplacent pas une validation sur le fournisseur réel.

Les
métadonnées et miniatures restent accessibles.
Une restauration doit rendre tous les blocs nécessaires
lisibles avant d’ouvrir le flux GLB ; le viewer doit afficher l’état et la progression.
Les transitions doivent pouvoir reprendre après interruption et se réconcilier
avec le provider, sans contourner les claims de suppression.

Le choix du provider et de ses classes reste à confirmer. Une compatibilité S3
ne suffit pas à établir la disponibilité de classes froides ou de `RestoreObject`.
Références officielles consultées le 15 octobre 2026 :

- [Compatibilité S3 de Garage](https://github.com/deuxfleurs-org/garage/blob/main-v2/doc/book/reference-manual/s3-compatibility.md) :
  vérifier les opérations effectivement disponibles pour la version déployée.
- [Restauration AWS S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/restoring-objects.html) :
  Glacier Flexible Retrieval/Deep Archive nécessitent une copie restaurée temporaire ;
  le maintien à chaud nécessite une transition distincte.
- [Copie AWS S3](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CopyObject.html) :
  valider la réponse complète via le SDK ; un statut HTTP 200 peut contenir une
  erreur de copie et ne suffit pas à autoriser la publication d’une génération.
- [Suppression AWS S3](https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObject.html) :
  un marqueur de suppression ne détruit pas les versions privées précédentes ;
  le premier adaptateur refuse les buckets versionnés ou suspendus.
- [Contraintes d’archivage AWS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/archival-storage.html) :
  tenir compte des durées minimales et des frais de suppression anticipée.
- [Classes R2](https://developers.cloudflare.com/r2/buckets/storage-classes/) et
  [tarifs R2](https://developers.cloudflare.com/r2/pricing/) : Infrequent Access
  applique des frais de récupération et une durée minimale facturée.
- [Compatibilité de l’API S3 R2](https://developers.cloudflare.com/r2/api/s3/api/) :
  opérations de copie conditionnelle et classes `STANDARD`/`STANDARD_IA` ;
  `GetBucketVersioning` n’est pas implémenté.

Aucun tarif régional ni coût d’exploitation n’est supposé. Le choix final doit
chiffrer stockage, transitions, requêtes, restauration, durée minimale et latence
avec le compte et la région réellement utilisés.
