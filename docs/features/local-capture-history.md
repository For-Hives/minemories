# Historique local des captures

Dans le menu **M**, **Captures locales** affiche les souvenirs enregistrés sur cet ordinateur, du plus récent au plus ancien. La date utilise le fuseau de l’ordinateur. Chaque ligne indique le monde ou serveur et la taille du fichier. Les flèches parcourent l’historique ; **Actualiser** relit le dossier configuré dans le mode avancé.

Sélectionner une ligne puis **Envoyer cette capture** envoie uniquement ce souvenir dans la galerie privée du compte actuellement connecté. Le bouton reste désactivé sans appairage ou pendant un autre envoi. Cette action ne recapture pas le monde ouvert. La date, les coordonnées, la dimension et les autres informations proviennent du fichier associé au souvenir choisi. Un échec réseau conserve le fichier local et son état de reprise ; une nouvelle capture ne remplace pas les données d’un envoi en cours.

## Fichiers conservés

Le dossier par défaut reste `~/export`. Chaque export manuel, par sélection ou AFK crée un dossier tel que `history/capture-20261012T123456123Z-<identifiant>/`, contenant `capture.glb` et `capture.json`. La date du nom est en UTC ; l’identifiant évite les collisions de captures prises au même instant. Le GLB contient toujours les textures et matériaux embarqués.

`~/export/capture.glb` et `capture.json` restent des copies du dernier export pour ouvrir rapidement le souvenir dans le viewer. Le mod utilise la référence `.minemories-latest` pour envoyer le fichier conservé dans l’historique, afin qu’un nouvel export ne puisse pas modifier les octets d’un envoi en cours. Conserver ensemble le GLB et son JSON lors d’une copie manuelle permet de garder les informations du souvenir.

Au premier accès à l’historique, envoi du dernier export ou nouvel export, le dernier `capture.glb` d’une ancienne version est copié dans l’historique avec son JSON et son éventuel état d’envoi. Cette migration ne récupère pas les captures déjà écrasées. Sans JSON, seules la date du fichier et les informations connues sont utilisées ; le mod ne leur attribue jamais les informations du monde actuellement ouvert. Un JSON illisible est conservé mais empêche l’envoi depuis l’interface jusqu’à réparation.

Les captures ne sont pas supprimées automatiquement. Elles utilisent de l’espace sur le disque ; prévoir ses propres sauvegardes. Pour retirer un souvenir local, supprimer son dossier complet après avoir vérifié l’envoi ou la sauvegarde. Garder le dossier désigné par `.minemories-latest` pour les commandes qui envoient le dernier export. Les suppressions de galerie et les changements de compte ne suppriment pas l’historique local. Changer le dossier d’export montre l’historique de ce nouveau dossier sans déplacer l’ancien.

## Intégrité et limites

Le mod prépare le GLB et le JSON dans un dossier temporaire, puis publie ce dossier lorsqu’ils sont complets. Une exception durant l’écriture laisse le précédent export utilisable. Les copies du dernier export et sa référence sont remplacées par renommage ; une panne pendant cette phase peut laisser un nouveau souvenir complet dans l’historique alors que l’ancien reste la référence du dernier export. Il reste accessible via **Captures locales**. Les dossiers temporaires laissés par un arrêt brutal ne sont pas présentés dans la liste.

La liste est lue en arrière-plan, avec quatre souvenirs par page et une mémoire bornée pendant le tri. Les JSON sont lus uniquement pour les souvenirs affichés ou envoyés, avec une limite de 2 MiB. Les liens symboliques dans l’historique et les références sortant du dossier ne sont pas suivis. Une réponse arrivée après fermeture ou actualisation de l’écran ne remplace pas la page courante.

Cette conservation locale prépare les snapshots réguliers et la timelapse ; elle ne fournit pas encore de planificateur supplémentaire, de déduplication entre captures ni de lecture animée. Ces tâches restent suivies dans `docs/AI/TASKS.md`.

Envoyer à nouveau un souvenir dont l’envoi a déjà réussi peut créer une autre entrée dans la galerie. L’interface ne présente pas de statut « déjà envoyé » : les comptes et API peuvent changer et la copie distante peut avoir été supprimée.
