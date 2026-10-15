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
les dates d’ouverture. Les accès directs aux GLB originaux devront aussi obtenir
un lease avant qu’un worker d’archivage soit activé.

## Contraintes pour la suite

Le worker devra appliquer le seuil et les protections de la prévisualisation sous
réservation durable. Les métadonnées et miniatures restent accessibles.
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
- [Contraintes d’archivage AWS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/archival-storage.html) :
  tenir compte des durées minimales et des frais de suppression anticipée.
- [Classes R2](https://developers.cloudflare.com/r2/buckets/storage-classes/) et
  [tarifs R2](https://developers.cloudflare.com/r2/pricing/) : Infrequent Access
  applique des frais de récupération et une durée minimale facturée.

Aucun tarif régional ni coût d’exploitation n’est supposé. Le choix final doit
chiffrer stockage, transitions, requêtes, restauration, durée minimale et latence
avec le compte et la région réellement utilisés.
