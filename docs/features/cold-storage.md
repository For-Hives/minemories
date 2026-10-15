# Archivage des captures inactives

Suivi de l’issue [#85](https://github.com/For-Hives/minemories/issues/85).
Le suivi des ouvertures est implémenté ; aucune transition vers une classe froide
n’est encore activée.

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

## Contraintes pour la suite

Le seuil devra être configurable entre 60 et 90 jours. L’éligibilité d’un bloc
timelapse partagé doit dépendre de **tous** les souvenirs qui le référencent,
ainsi que des conversions et lectures en cours. Les métadonnées et miniatures
restent accessibles. Une restauration doit rendre tous les blocs nécessaires
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
