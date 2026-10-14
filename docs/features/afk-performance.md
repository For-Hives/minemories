# Mesures des captures AFK

Le coordinateur progressif est décrit dans [le pipeline GLB](spooling-glb.md).
Les journaux locaux `AFK capture phase timings (ns)` distinguent maintenant les
colonnes/profondeur, blocs/modèles, entités, lectures de pixels CPU/GPU, transfert
client, préparation des textures, géométrie/spool et publication GLB/historique.
La préparation de texture du renderer (chargement/binding) reste attribuée aux
modèles. Les phases client et worker se recouvrent ; leur somme n’est pas la durée
totale. Le temps maximal du pas et ses dépassements restent enregistrés.

## Corpus et matériel

Mesures du 15 octobre 2026 : copie isolée du monde de test Minecraft 1.21.1,
NeoForge 21.1.248, JDK Temurin 21.0.12.1+1, AMD Ryzen 5 3600 (6 cœurs/12 threads),
Linux CachyOS, Btrfs, Mesa 26.2.4 llvmpipe OpenGL 4.6 logiciel et ressources
Minecraft. Le mod et son core sont chargés depuis le même JAR de distribution
`0.1.1-dev.1`, SHA-256
`34d6bf346cfe97d869325df9282295f9a67598a7a749705e20e4ec715646068f`.

Après l’export manuel, la même zone est capturée en AFK sous pause. Le rayon 8
contient 755 blocs, 2 entités, 1 383 quads et 17 textures ; le rayon 32 contient
14 107 blocs, 5 entités, 13 610 quads et 26 textures. Les profils de test utilisent
idle/intervalle 1 minute ; les défauts du produit restent 5 minutes / 4 heures.

| Mesure | Rayon 8 | Rayon 32 |
| --- | ---: | ---: |
| Export manuel synchrone | 131,18 ms | 144,41 ms |
| Capture AFK totale observée | 1,62 s | 14,90 s |
| Frames traversées | 42 | 471 |
| Pas producteur maximal | 4,74 ms | 2,03 ms |
| Dépassements du budget 2 ms | 5 | 2 |
| Frame complète maximale, rendu inclus | 86,62 ms | 89,84 ms |

| Phase, temps cumulé | Rayon 8 | Rayon 32 |
| --- | ---: | ---: |
| Colonnes/profondeur | 0,64 ms | 1,24 ms |
| Blocs/modèles | 15,06 ms | 42,63 ms |
| Entités/modèles | 2,61 ms | 1,65 ms |
| Pixels CPU/GPU | 6,53 ms | 2,61 ms |
| Transfert client hors lecture pixels | 7,54 ms | 7,89 ms |
| Bandes/PNG/écriture textures, worker | 86,46 ms | 58,41 ms |
| Géométrie/spool, worker | 140,12 ms | 605,03 ms |
| Publication GLB/historique, worker | 25,51 ms | 40,37 ms |

Une opération de renderer ou de lecture GPU reste indivisible. Le pas producteur
exclut la collecte initiale de métadonnées et les contrôles de contexte ; la frame
entière comprend le rendu logiciel, le jeu et l’instrumentation. La répartition
réduit le travail concentré sur le client mais augmente la durée totale. Ces
résultats ne donnent pas de plafond FPS et ne prouvent pas les performances des
autres GPU/modpacks. La matrice monde actif/focus inactif, les autres scènes, les
tests d’envoi sur API réelle et leurs coûts réseau restent documentés dans
[la validation du pipeline](spooling-glb.md#validation-du-raccordement) ; l’envoi
utilise toujours 512 Kio/s par bandes HTTP de 16 Kio.

## Contrôles sur le JAR mesuré

Le profil isolé exerce pause, activité puis reprise, désactivation, reload réel,
chunk déchargé, changement Overworld → Nether et déconnexion. L’historique reste
intact, aucun commit partiel ni spool ne subsiste. La source de renderer est lue
avec PACK/PBO anormaux puis leur restauration est vérifiée après les mesures.
Les deux GLB passent le validateur partagé API et sont importés/rendus dans
Blender 5.2.2. Les glyphes et les renderers particuliers gardent les limites du
[contrat des entités](frozen-entities.md).

Les artefacts/programmes de cet essai sont conservés localement dans
`~/.local/state/minemories-validation/afk-main-metrics-20261015/` (empreinte, événements,
mesures JSON, journaux, GLB et rendu). Aucun profil personnel ou monde original
n’a été modifié.

## Préparation des icônes

Avant les pas de production, les métadonnées joignent l’icône du monde/serveur.
La lecture du fichier est limitée à 128 Kio et refuse les liens symboliques.
L’encodage vérifie l’en-tête PNG et des dimensions positives ≤512×512 avant Base64.
Une icône refusée devient absente et n’invalide pas le GLB. Les tests couvrent icône
Minecraft normale, fichier/dimensions excessifs, données arbitraires et symlink.
Cette préparation ne lit plus un fichier entier de taille non bornée.
