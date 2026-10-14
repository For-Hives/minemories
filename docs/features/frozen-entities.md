# Entités et modèles animés figés dans les captures

Le souvenir contient les animaux, mobs et joueurs **déjà chargés par le client**
dont la position de référence se trouve dans la zone sélectionnée. Leur modèle
entier est conservé, même si une patte ou un bras dépasse légèrement du bord.
Les entités supprimées ou invisibles sont exclues. La pose, les équipements et
les variantes visibles correspondent au dernier tick du client, y compris
lorsque la partie est en pause. Le GLB reste une image 3D figée : il ne contient
ni intelligence artificielle, ni inventaire, ni animation jouable.

Les lits, coffres et autres blocs avec un renderer de block entity passent par
leur renderer Minecraft. Les blocs `ENTITYBLOCK_ANIMATED` ne reçoivent plus le
modèle de substitution du gestionnaire de blocs. Un bloc combinant modèle baked
et renderer conserve ses deux parties.

## Géométrie et textures

Le collecteur reçoit les positions transformées par le renderer et ses UV. Il
lit la texture réellement sélectionnée par chaque passe de rendu, plutôt que
d'essayer de deviner un sprite de l'atlas des blocs. Les atlas de lits/coffres,
skins et textures d'animaux sont intégrés en PNG dans le GLB. Les couleurs des
couches (laine, collier…), leur transparence et les passes lumineuses usuelles
sont conservées. Le lecteur n'a pas besoin du modpack d'origine.

Les couches secondaires transparentes reçoivent un très léger écart le long de
la normale (2 mm pour la première, 16 mm maximum). Cela évite qu'un collier
exactement superposé au corps fasse disparaître ce corps dans un moteur à rayons
comme Blender. La forme et les UV sont conservés ; la couche principale et les
passes opaques ne sont pas déplacées.

Les quads et les triangles, strips et fans sont collectés avec leur orientation.
Une seule primitive reste en attente par passe : le collecteur ne garde pas une
seconde liste complète de sommets du renderer. Le writer historique reste en
mémoire ; son remplacement par le writer sur disque et la capture progressive
AFK restent suivis séparément.

Les noms affichés au-dessus des entités et le texte des panneaux ne sont pas
exportés. Les passes de texte sans normales, lignes/laisses, ombres au sol,
hitboxes, flammes ajoutées par le dispatcher, glint et effets utilisant des
shaders spéciaux ne font pas partie de cette capture. Les renderers procéduraux
sans texture accessible et les pipelines GPU propres à certains mods ne sont
pas annoncés comme supportés. Une passe géométrique texturée impossible à copier
fait échouer la capture avant l'enregistrement ; le dernier souvenir complet
reste disponible.

## Limites

Par capture : 2 048 entités, 500 000 primitives de renderers, 256 textures de
renderers et 64 MiB de PNG pour ces textures. Un modèle peut utiliser au plus
128 passes ; une texture au plus 4 194 304 pixels et 16 MiB de PNG. Ces limites
s'ajoutent aux limites de sélection, de GLB et d'upload. Le dépassement demande
de réduire la zone, sans sauvegarder un fichier incomplet. Aucun chunk absent
n'est chargé pour retrouver un animal.

La lecture des modèles et textures reste sur le thread du jeu, avec restauration
de l'état de lecture OpenGL. Aucune modification de blocs, de pose d'entité ou
de sauvegarde de monde n'est nécessaire pour l'export. Un skin déjà utilisé par
le client est copié depuis sa texture chargée ; Minemories ne lance pas un
téléchargement de skin séparé.

## Validation

Les tests unitaires couvrent les limites de sélection, positions non finies,
dernière primitive, attributs, couleurs, orientation des triangles et traitement
d'un modèle de 40 000 sommets sans réutiliser ses tableaux publiés. Les tests PNG
vérifient les canaux, l'alpha, l'ordre des lignes et les limites avant allocation.
Validation du 14 octobre 2026 : Minecraft 1.21.1 / NeoForge 21.1.248 a chargé
le JAR `0.1.0-beta` seul, accompagné d'un mod de test distinct dans un profil
jetable. Empreinte :
`249fa27d83b00a78beef6bca300a94b60a8e1297c2948ffde6e645c61cd70b20`
(181 754 octets). La scène exportée comprend loup apprivoisé assis avec collier,
chat assis, mouton magenta, zombie casqué, squelette avec arc, poulet,
porte-armure équipé et joueur, lit complet et coffres simple/double. Les exports
fermés/ouverts et les exports loup seul, lit seul et coffre seul ont été importés
et rendus dans Blender 5.2.2 ; le corps du loup et le collier sont tous deux
visibles après la séparation des couches. Le nom personnalisé n'est pas dans
le GLB, l'entité invisible et l'entité hors zone sont exclues.

Un déplacement de test vers un chunk absent ne transforme pas le joueur local
en faux souvenir : la capture échoue et préserve le dernier fichier. Le même
JAR a aussi terminé une capture AFK locale avec le vrai menu pause ouvert
(minuteurs accélérés à une minute pour cet essai). Les six GLB passent le
validateur partagé API/viewer. `bun check`, inclus dans `bun run build`, passe
avec 172 tests API, 98 web, 24 core et 98 NeoForge, et les seuils de couverture.

Cette fixture n'annonce pas la compatibilité de tous les renderers de tous les
mods. Les pipelines procéduraux et GPU propres à des modpacks doivent être
exercés séparément. L'envoi vers l'API de production n'a pas été déclenché par
ce test sans appairage.

Le scénario exerce aussi une texture déchargée juste avant l’export et un état
de lecture OpenGL non standard (packing et pixel-pack buffer). La copie remet
la lecture à zéro puis restaure binding, offsets, alignement et buffer ; les
assertions en jeu vérifient ces six valeurs après chaque export.
