# Délais de récupération des souvenirs

Une nouvelle mise en corbeille conserve le souvenir pendant trente jours de
24 heures, soit 2 592 000 000 ms. La date de suppression et l’échéance sont
enregistrées ensemble dans `deleted_at` et `purge_after`. Restaurer le souvenir
efface ces deux dates ; le remettre ensuite en corbeille ouvre un nouveau délai.

La conversion antérieure utilisait `3_600_1_000` pour une heure, soit 36 001 000 ms
au lieu de 3 600 000 ms. Elle produisait une rétention d’environ trois cents jours.
La migration ne raccourcit pas la période de récupération déjà accordée : pour
chaque souvenir déjà en corbeille, elle conserve la plus tardive des deux dates
suivantes : son ancienne échéance ou trente jours après la migration. Un souvenir
dont l’ancienne échéance est dépassée reçoit donc au moins trente jours de grâce.
Certains souvenirs anciens affichent encore plus de trente jours restants.

La colonne et les échéances sont ajoutées dans une transaction SQLite. Un échec
annule l’ensemble ; un redémarrage après réussite ne prolonge pas les échéances.
Les souvenirs actifs gardent une échéance nulle. Le repli pour une ligne en
corbeille sans échéance est `deleted_at + trente jours`.

`memories.listTrash` retourne `purgeAt`, utilisé par le compte à rebours du site.
Ce champ est optionnel dans le contrat pour accepter une ancienne API ; le repli
web est alors trente jours après `deletedAt`. Déployer l’API migrée avant le front
permet d’afficher correctement les échéances protégées des anciennes captures.
La purge examine les échéances au démarrage et toutes les heures. L’effacement
physique suit [la file de suppressions durables](durable-deletions.md) et peut être
retardé par une panne du stockage.

Le cache web du badge d’appairage conserve sa durée prévue de soixante jours de
24 heures. Cette correction ne modifie ni les codes d’appairage de cinq minutes,
ni les tokens des appareils.

Validation : migration d’une base ancienne persistante puis réouverture, rollback
et reprise après erreur SQL, protection des anciennes dates, purge à l’échéance,
restauration et nouvelle mise en corbeille, isolation propriétaire, contrat oRPC
réel et compte à rebours avec restauration depuis la galerie. Les tests utilisent
des durées et dates calendaires indépendantes des constantes de production.
`bun run build`, `bun web:check` et les sept scénarios `bun run api:garage` passent.
