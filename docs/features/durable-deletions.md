# Suppressions durables des objets

La suppression définitive d’un souvenir et la purge de la corbeille inscrivent
l’objet dans `object_deletions` dans la même transaction SQLite que la suppression
des métadonnées. Si l’inscription échoue, le souvenir et ses liens de partage sont
conservés. Après commit, le souvenir disparaît et ses liens cessent de fonctionner,
même si le stockage est indisponible.

Une suppression manuelle tente immédiatement d’effacer son objet. Le traitement
périodique reprend les jobs au démarrage puis chaque minute, avec un maximum de
cent objets par passage et un seul passage en cours. Une panne conserve le job et
ses compteurs ; les essais sont espacés d’une, deux, quatre, huit, seize, trente-deux
puis soixante minutes au maximum. La base doit rester sur un volume persistant.

Un redémarrage reprend les jobs arrivés à échéance. Une suppression déjà effectuée
est rejouable : un crash après l’effacement S3 et avant l’acquittement SQLite laisse
un job qui sera acquitté au prochain essai. L’initialisation d’un upload ne peut pas
réutiliser une clé encore en attente, pour éviter qu’un ancien job efface une
nouvelle capture. La purge continue toutes les heures ; les suppressions physiques
peuvent être retardées par les pannes et le nombre de jobs en attente.

Cette implémentation vise un seul processus API, comme les verrous des uploads.
La file refuse aussi les jobs historiques dont la clé référence encore un souvenir
ou une session reprenable incomplète, même expirée. Elle conserve ces jobs et leurs
compteurs pour revue ; les reçus déjà terminés ne protègent pas un objet absent des
souvenirs. Le filtrage précède la limite du batch, afin qu’un grand nombre de conflits
ne bloque pas les autres suppressions. La référence est revérifiée avant effacement.
Les permissions S3 doivent inclure la suppression d’objet. Une erreur SQLite de
maintenance est signalée sans clé d’objet ni token, et n’arrête pas les passages
suivants. Les jobs contiennent les clés, les dates et les tentatives, aucune copie
du GLB. Le comportement filesystem suit la même file.

Validation : tests des transactions, isolation propriétaire, révocation du partage,
blocage de réutilisation, backoff, limite de batch et absence de chevauchement.
Le test Garage arrête la fixture dédiée, échoue la suppression dans un processus,
redémarre Garage puis exécute un nouveau processus contre la même base et vérifie
l’absence du fichier. Aucun objet de production n’est touché.

La file couvre les suppressions explicites, les purges et, depuis le 11 octobre,
les uploads legacy. Chaque legacy inscrit une intention avant l’écriture de
l’objet, protégée tant que l’envoi est en cours. La publication et le retrait
de cette intention sont atomiques. Un crash avant publication laisse un job
reprenable, qui retire aussi les parts multipart abandonnées. Une panne garde
la clé et ses octets réservés jusqu’au nettoyage réussi. Un ancien batch relit
le job avant effacement, pour préserver un upload qui vient d’être publié.
Voir [le quota et le test de crash Garage](account-storage-quota.md).

Les suppressions et purges conservent aussi le propriétaire et la taille dans
leurs nouveaux jobs pour libérer le quota après l’effacement physique. La migration
préserve les échéances et tentatives des anciens jobs ; leurs tailles oubliées
restent inconnues.

La [réconciliation historique](storage-reconciliation.md) inventorie les clés
oubliées, complète les claims récupérables et prépare les intentions manquantes.
Son exécution sur le stockage réel reste suivie dans TASKS.md. Les versions
anciennes d’un bucket versionné dépendent de la politique de cycle de vie du provider.

Les nouvelles mises en corbeille expirent après trente jours. Les anciennes
échéances sont protégées par [la migration des délais](trash-retention.md), qui
accorde aussi au moins trente jours de grâce aux souvenirs déjà dépassés.
