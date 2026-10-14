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

Une zone sans géométrie visible n’est pas publiée. Cela peut arriver avant la réception des chunks ou avec une sélection vide : le menu M explique d’attendre le chargement du terrain ou de choisir une autre zone. Le dernier GLB, son JSON et l’historique restent utilisables ; aucun envoi ni intervalle AFK réussi n’est enregistré pour cet essai. Le suivi de profondeur ignore les positions dans les chunks encore absents. Les captures non vides gardent leurs textures, transparences et lumières ; des lumières seules ne suffisent pas à constituer un souvenir.

Le contrôle utilise le cache des chunks effectivement reçus, sans charger ni générer de terrain : `ClientLevel.hasChunkAt` renvoie toujours vrai et ne constitue pas un contrôle de réception. Une capture d’eau seule reste valide, même si elle ne contient aucun modèle de bloc solide. Les normales sont calculées en double avant sérialisation pour garder des valeurs finies, y compris avec des coordonnées finies extrêmes.

La liste est lue en arrière-plan, avec quatre souvenirs par page et une mémoire bornée pendant le tri. Les JSON sont lus uniquement pour les souvenirs affichés ou envoyés, avec une limite de 2 MiB. Les liens symboliques dans l’historique et les références sortant du dossier ne sont pas suivis. Une réponse arrivée après fermeture ou actualisation de l’écran ne remplace pas la page courante.

Cette conservation locale prépare les snapshots réguliers et la timelapse ; elle ne fournit pas encore de planificateur supplémentaire, de déduplication entre captures ni de lecture animée. La lecture temporelle et la déduplication restent suivies dans [issue #75](https://github.com/For-Hives/minemories/issues/75) ; la capture progressive dans [issue #84](https://github.com/For-Hives/minemories/issues/84).

## Vérification du refus des captures vides

Les tests core refusent les scènes vides ou composées seulement de lumières avant de toucher au fichier, et vérifient directement les normales du buffer binaire pour les coordonnées extrêmes. Un test d’historique conserve le modèle précédent, son JSON et sa référence après ce refus.

Le scénario Minecraft 1.21.1 / NeoForge 21.1.248 du 13 octobre 2026 utilise une copie isolée du monde et une API HTTP locale. Le bouton **Capturer et envoyer** dans un chunk absent et **Exporter la sélection** dans une zone d’air conservent exactement les anciens octets GLB/JSON, sans nouveau dossier d’historique ni référence. Aucun upload n’est lancé et le chunk absent n’entre pas dans l’historique de profondeur. Les messages des deux modes ont été inspectés à l’écran. Une sélection d’eau seule avec géométrie BLEND, puis une capture du terrain chargé, sont exportées avec succès et conservées avec l’ancien souvenir. Cette validation ne prouve pas un envoi en production.

Les deux GLB ont aussi été importés et rendus dans Blender 5.2.2 : un mesh avec 22 triangles pour l’eau, puis un mesh avec 394 triangles pour le terrain. Les images ont été inspectées : transparence et texture d’eau, végétation, textures de terrain et faces de coupe sont présentes.

Envoyer à nouveau un souvenir dont l’envoi a déjà réussi peut créer une autre entrée dans la galerie. L’interface ne présente pas de statut « déjà envoyé » : les comptes et API peuvent changer et la copie distante peut avoir été supprimée.
