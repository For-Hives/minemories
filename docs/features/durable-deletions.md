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
Les permissions S3 doivent inclure la suppression d’objet. Une erreur SQLite de
maintenance est signalée sans clé d’objet ni token, et n’arrête pas les passages
suivants. Les jobs contiennent les clés, les dates et les tentatives, aucune copie
du GLB. Le comportement filesystem suit la même file.

Validation : tests des transactions, isolation propriétaire, révocation du partage,
blocage de réutilisation, backoff, limite de batch et absence de chevauchement.
Le test Garage arrête la fixture dédiée, échoue la suppression dans un processus,
redémarre Garage puis exécute un nouveau processus contre la même base et vérifie
l’absence du fichier. Aucun objet de production n’est touché.

La file couvre les suppressions explicites et les purges à partir de cette version.
Elle ne permet pas de retrouver les clés déjà oubliées par une ancienne version.
La réconciliation historique et le nettoyage après échec d’un upload legacy restent
suivis dans TASKS.md. Les versions anciennes d’un bucket versionné dépendent aussi
de la politique de cycle de vie du provider.

Un défaut antérieur de conversion (`3_600_1_000` au lieu de `3_600_000`) rend
le seuil de corbeille environ dix fois plus long que les trente jours documentés.
Il affecte également certains délais web. Sa correction reste suivie avec une
migration préservant un délai de récupération pour les souvenirs déjà en corbeille ;
cette livraison ne raccourcit pas leur rétention.
