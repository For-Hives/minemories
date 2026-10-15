# Validation des renderers de modpacks

Le périmètre ci-dessous couvre des renderers ciblés, puis des copies isolées avec
les listes complètes de JAR des profils. La compatibilité de chaque renderer tiers
et de chaque configuration du joueur reste à évaluer séparément.
Les sauvegardes personnelles ne sont pas utilisées ni modifiées. Les bancs ont leurs
propres réglages ; les essais des profils complets reproduisent aussi les réglages
de compatibilité du pack explicitement indiqués ci-dessous.

Le périmètre de cette validation est Minecraft 1.21.1, avec les listes de JAR
NeoForge des profils `mc breval` et `All the Mons - ATMons`. Le profil local
DeceasedCraft est en Minecraft 1.20.1 / Forge 47.4.0 : il ne reçoit pas ce JAR
NeoForge et n’est pas validé par ces essais. Les autres loaders sont suivis par
[l’issue de portage et la matrice de loaders](loader-support.md).

## Premier banc, 15 octobre 2026

Minecraft 1.21.1 / NeoForge 21.1.249, Mesa llvmpipe OpenGL 4.6, sans resource pack
additionnel ni shader pack activé. Le client charge ces versions exactes :

| Composant | Version |
| --- | --- |
| Create | 6.0.10 |
| Flywheel embarqué par Create | 1.0.6 |
| Ponder embarqué | 1.0.82+mc1.21.1 |
| Cobblemon | 1.7.3+1.21.1 |
| Mekanism | 10.7.19.85, version déclarée 10.7.19 |
| Kotlin for Forge | 5.12.0 |
| GeckoLib chargé | 4.9.2 — aucun renderer GeckoLib spécifique n’est validé ici |

Le banc place arbres de transmission, roue dentée, grande roue à eau et presse
Create, réservoirs Create/Mekanism, infuseur Mekanism, feuillage teinté, verre rouge,
eau courante et Pikachu avec sa texture secondaire marquée émissive. Le mod reste non appairé et
les captures AFK sont explicitement désactivées pendant ce premier essai manuel.
Les réglages et la sauvegarde sont propres au banc.

Avec le JAR précédent, Flywheel contourne le renderer CPU des composants animés.
L’export aboutit mais omet la géométrie de plusieurs composants visibles en jeu.
Pikachu et ses deux textures sont déjà présents. Le correctif donne
accès au renderer CPU uniquement pendant la collecte d’un modèle :

- une portée locale au thread entoure les renderers de block entities et d’entités ;
  elle est restaurée sur sortie normale, erreur et appels imbriqués ;
- un mixin facultatif sur l’implémentation Flywheel répond « sans visualisation GPU »
  dans cette portée. Le reste du rendu du jeu conserve son backend ;
- une sonde vérifie pendant la capture que Flywheel a effectivement cédé la place.
  Une API inconnue ou un backend qui ne cède pas fait échouer la capture plutôt que
  d’enregistrer silencieusement des pièces manquantes. L’absence de Flywheel n’est
  pas une erreur. La portée ne reste jamais active entre deux étapes AFK.

Cette intégration vise la version Flywheel ci-dessus. Elle n’extrait pas un mesh
arbitraire depuis un shader : le mod concerné doit fournir un chemin CPU utilisable.
Les effets purement GPU, glint, texte, lignes et couches sans normales restent soumis
aux [limites de capture](frozen-entities.md). Les limites de textures et primitives
ne sont pas relevées pour masquer un problème de compatibilité.

## Preuves avant/après

Le JAR de référence a l’empreinte
`4104f3cd139857846593db52b61a47c84590a0c75a3e2f43ca2460a8d464113a`.
Le premier candidat exercé a l’empreinte
`9a6433648ddb3b3ab405e2849366b6d5fb0ba2a70d162258f1cffab35090c2bc`.
Les références de textures d’un atlas sont partagées ; le nom de matériau ne suffit
pas à identifier chaque bloc. Le contrôle compte donc les triangles issus du
renderer dans les cellules géométriques des composants :

| Composant | Avant | Après |
| --- | ---: | ---: |
| Arbre de transmission | 0 | 12 |
| Roue dentée | 0 | 1 284 |
| Grande roue à eau, cellule centrale | 0 | 279 |
| Presse | 0 | 42 |

Ces nombres sont des triangles dont le centre se trouve dans la cellule inspectée,
pas le total de tout le modèle. Les GLB contiennent respectivement 4 148 et 14 130
triangles, avec positions/UV finis. Les poses et le nombre de Pikachu ont changé
entre essais ; une identité pixel à pixel de toute la scène n’est pas revendiquée.
Les rendus Blender 5.2.2 avant/après et l’écran Minecraft après capture ont été
inspectés : les composants Create auparavant absents apparaissent.

Les bindings de texture, pack/PBO, unité active, programme et framebuffer surveillés
restent identiques avant/après capture. Flywheel est actif après la capture.
Deux tests unitaires vérifient imbrication, erreur et isolation entre threads ; les
contrôles Java, Spotless et SpotBugs passent. Ce premier essai n’exerce pas encore
toutes les conditions de #91.

Preuves locales hors Git :
`~/.local/state/minemories-validation/modpack-renderers-20261015/`, notamment
`installed-targets.json`, `cpu-fallback/runtime.json`,
`cpu-fallback/renderers.json`, `cpu-fallback/comparison.json`,
`cpu-fallback/screenshots/`, `cpu-fallback/before-blender.png`,
`cpu-fallback/after-blender.png` et `cpu-fallback/blender-report.json`.
Le projet Gradle de validation est séparé du dépôt pour lancer NeoForge 21.1.249.
Les premiers essais ont corrigé le pilote (chargement explicite des chunks et
état de bloc valide), sans attribuer ces échecs au produit.

## Mécanismes alimentés et fluides

Le candidat final de cette étape, après formatage du JSON de mixin, porte le SHA-256
`972533a8cf84199aded16a7cfc0be8ab3a734aa4a7599adc4b073e72d42008ec`.
Le second parcours client confirme les valeurs synchronisées suivantes : arbre,
roue dentée et presse à 16 tr/min, grande roue alimentée par de l’eau à 4 tr/min,
réservoir Create avec 4 000 mB de lave et réservoir Mekanism avec 8 000 mB d’eau.
L’export manuel aboutit à un GLB autonome de 2 715 596 octets, avec les neuf états
OpenGL surveillés conservés et Flywheel toujours actif après capture.

Les trois fichiers (référence, premier repli CPU et mécanismes alimentés) passent
les validateurs GLB et métadonnées réels de l’API. Les mouvements sont figés, pas
exportés comme animations jouables. Les rapports sont dans `powered/` et
`api-validation.json`. Blender importe les 22 282 triangles du second export ;
son rendu et l’écran Minecraft ont été inspectés, avec les mécanismes, la chute
d’eau et les contenus des réservoirs présents. Le premier placement de presse utilisait un axe non relié
au moteur ; le pilote a été corrigé et les vitesses non nulles sont ensuite
vérifiées sur le client, sans présenter cet échec de fixture comme un défaut du mod.

`bun run build` passe sur ce code, incluant `bun check`, les tests unitaires,
Spotless, SpotBugs et JaCoCo. Les essais complémentaires et les profils complets
sont décrits ci-dessous.

## AFK, annulation et combinaisons de rendu

Le même JAR `972533a8…` a terminé une capture AFK progressive pendant la pause,
avec un rayon de 12 et la hauteur complète activée dans le banc. Le producteur
rapporte 909 étapes, 59 917 blocs, cinq entités et 39 622 quads. Le GLB de
6 888 448 octets contient 79 images intégrées et 79 244 triangles ; les composants
Create, les fluides des réservoirs et Pikachu sont présents. Les positions/UV sont
finis et les deux horodatages de l’intervalle sont enregistrés. Le rendu Blender
a été inspecté. Le producteur reste soumis à des opérations indivisibles : sept
dépassements du budget souple ont été mesurés, avec une étape maximale de 16,98 ms ;
aucun budget dur de deux millisecondes n’est revendiqué pour un renderer tiers.

La portée de collecte est désactivée entre les étapes AFK et Flywheel reste actif.
Un deuxième cycle est annulé : aucun souvenir supplémentaire n’est publié, le
hash du dernier GLB complet reste identique et le spool est nettoyé. Aucun
appairage ou envoi réseau Minemories n’est utilisé dans ce parcours.

| Combinaison exercée | Résultat |
| --- | --- |
| NeoForge 21.1.248, sans Flywheel | Démarrage et capture de coffre, mouton coloré, feuillage, verre et eau ; portée restaurée. |
| NeoForge 21.1.249 + Sodium 0.8.13 | Capture des mécanismes alimentés et fluides ; neuf états GL surveillés identiques, Flywheel actif après capture. |
| Même banc + Iris 1.8.14-beta.1 + MakeUp UltraFast 9.5e | API Iris confirmant le shader activé ; capture réussie, neuf états GL surveillés identiques. Dans cette combinaison Iris désactive déjà Flywheel hors capture. |

Les sept GLB de la matrice, AFK et régression compris, passent les validateurs API
réels. Les rendus Blender de la régression, de Sodium et d’Iris ont également été
inspectés. Sodium signale que le collecteur utilise le chemin de sommets générique ;
ce diagnostic n’est pas masqué et aucune accélération Sodium du collecteur n’est
annoncée. Les effets visuels propres au shader ne sont pas reproduits dans le GLB,
qui conserve la géométrie et les textures de base autonomes.

Preuves : sous-dossiers `afk/`, `vanilla/`, `sodium/`, `iris/`,
`api-validation.json` et rapports/rendus Blender associés. Ces combinaisons
emploient le sous-ensemble ciblé des mods ; les essais avec les listes complètes
sont décrits dans les sections suivantes.

## Atlas des profils complets

La copie de `mc breval` charge la liste de 483 JAR tiers du profil avec NeoForge
21.1.248 et le candidat `972533a8…`. Le chargement du monde requiert le réglage
existant `disable_chisel_modern=true` de JustDynaThings et les données KubeJS du
pack. Avec ces données, les mécanismes et fluides du banc sont visibles, mais
l’export échoue : l’atlas de blocs fait 8 192 × 8 192 pixels, au-delà de la limite
de quatre millions de pixels par image. Aucun GLB incomplet n’est publié et les
états GL surveillés sont restaurés.

Le correctif en validation identifie le sprite de chaque primitive du renderer
sur les grands atlas et lit uniquement sa région GPU, par bandes. Les UV sont
ramenés à cette image ; l’image correspond à la texture réellement affichée,
y compris la frame courante d’une texture animée. Les limites par image, de pixels
cumulés et de textures restent identiques. La recherche retient au plus 256 sprites utilisés, parcourt au plus un million
d’entrées par recherche et partage un budget de 32 millions d’entrées examinées
entre tous les atlas de la capture ; une primitive traversant plusieurs sprites
échoue explicitement plutôt que d’utiliser une image erronée. Les UV non finis
sont éliminés. Les tests couvrent le changement de coordonnées, les petits sprites,
les bords, les primitives traversantes et les budgets de recherche.

Le premier essai de la copie ATMons sans ses réglages de compatibilité échoue
avant toute capture dans le mixin Sodium de Mekanism Covers. Le profil original
définit `disableAdvancedCoverRendering=true` ; le banc reproduit désormais ce
réglage, sans retirer de mod. Ce premier échec ne prouve donc pas une
incompatibilité du profil configuré.

Le candidat intermédiaire `0590b85a…` réussit l’export manuel du pack complet
avec l’atlas de 8 192 × 8 192 : 1 347 424 octets, 17 104 triangles et 42 images
intégrées. Les neuf états GL surveillés sont identiques après capture. La copie
d’un sprite de pierre de 16 × 16 est comparée à ses 256 pixels d’origine ; elle
préserve les états GL. Le GLB et ses métadonnées passent les validateurs réels
de l’API. L’écran Minecraft et le rendu Blender sont inspectés : mécanismes,
réservoirs, mouton coloré, verre, feuilles et eau sont présents. Le shader MakeUp
est activé ; son éclairage reste propre au jeu.

La première lecture rencontrait aussi une erreur GL déjà en attente (`1281`)
avant toute copie. Le candidat suivant journalise et consomme les erreurs
antérieures, avec une boucle bornée, puis contrôle séparément les erreurs de sa
propre lecture. Le pilote injecte une erreur préalable pour vérifier ce cas ; il
ne contourne pas les erreurs de lecture du collecteur. Le candidat `7a01ab0c…`
passe cette injection avant la lecture du sprite puis avant l’export manuel, avec restauration des neuf états GL surveillés.

Le même JAR termine une capture AFK **avant tout export manuel de cette session**
dans la copie de mc breval, en pause, rayon 12/hauteur complète. Elle contient
59 854 blocs, huit entités, 78 764 triangles et 98 images intégrées pour
6 081 860 octets. Les composants animés et les deux fluides sont présents ; les
positions/UV sont finis et les validateurs API acceptent GLB et métadonnées.
L’intervalle est `04:37:38.921451715Z`–`04:40:10.365172822Z`, le 15 octobre 2026.
La portée est désactivée entre les 813 étapes et l’état Flywheel reste identique
à celui d’avant capture (désactivé par Iris). Les 54 dépassements du budget souple,
avec un maximum de 35,57 ms, sont conservés dans les mesures ; le temps total du
banc logiciel n’est pas une promesse de performance. Le rendu Blender a été
inspecté. Le cycle suivant est annulé : historique inchangé, dernier fichier
complet préservé et spool nettoyé. L’export manuel qui suit réussit également,
avec 21 506 triangles et 42 images ; ses métadonnées et son GLB passent l’API.

Le candidat intermédiaire `5388c08c3563ebc1e5c99c14f4d0d67d83a27ea6f676407b59dfc1edfad85831`
ajoute un garde-fou : les descripteurs d’atlas comptent dans le budget de textures
avant leur construction, y compris si le renderer n’émet aucun sommet. Les tests
unitaires, Spotless, SpotBugs et `bun run build` passent (140 tests web, 235 tests
API exécutés, 33 core et 154 NeoForge). Le premier essai ATMons avec shader manque de tas Java (5 Gio) pendant
l’initialisation JEI/Ars Nouveau, avant le scénario Minemories. Il est conservé
comme échec du banc, pas comme validation du produit. Le nouvel essai conserve
les 396 JAR tiers, avec un tas de 7 Gio et les shaders désactivés ; les parcours
avec shader de mc breval et du banc ciblé sont conservés séparément.
Preuves : `full-breval/crop-clean/`, `full-breval/cold-afk/`, fichiers JAR et
empreintes conservés avec chaque parcours ; `full-atmons/heap5g-attempt/`, `full-atmons/client-sync-attempt/` et
`full-atmons/atlas-no-shader-afk/` pour la suite.

L’essai ATMons suivant confirme vitesses et fluides synchronisés, puis reproduit
la limite du premier index : plus de 65 536 entrées dans l’atlas. Le candidat
suivant conserve une vue paresseuse de l’atlas et ne met en cache que les sprites
trouvés pour les primitives. Il ne matérialise plus un index complet ; les limites
d’images/pixels sont identiques et le travail de recherche reste borné. Les tests
exercent un atlas de plus de 80 000 entrées sans allocation d’un index complet,
le cache des recherches répétées, le budget partagé entre atlas et la limite
des sprites retenus. Une course du pilote, qui lisait les blocs client avant
réception des chunks après téléportation, a aussi été corrigée dans le banc ;
elle n’est pas présentée comme un défaut Minemories.

## Candidat final et périmètre validé

Le JAR `6b6c10b93c29e1daa3b45dd57b7690c5e12212e24355d43c9fce29cbad71c318`
passe `bun run build`, incluant les contrôles globaux et 156 tests NeoForge.
Il est exercé dans ATMons avec ses 396 JAR tiers et 434 identifiants de mods
chargés, NeoForge 21.1.249, Sodium 0.8.13 et Iris présent avec shaders désactivés.
Le réglage Mekanism Covers du pack est reproduit ; le tas Java est de 7 Gio et
le processus de validation limité à 12 Gio, sans swap. L’atlas expose 71 641
entrées. La comparaison des 256 pixels du sprite GPU et la restauration des
neuf états GL surveillés passent, y compris après injection d’une erreur GL
antérieure. Flywheel est actif après l’export manuel.

L’export manuel contient 1 186 344 octets, 15 172 triangles et 42 images intégrées.
L’AFK en pause produit 5 298 968 octets, 71 890 triangles et 94 images, avec
59 917 blocs et cinq entités. Le producteur compte 836 étapes (837 callbacks
observés par le pilote), 19 dépassements du budget souple et un maximum de
19,85 ms. L’intervalle est `05:07:13.713390313Z`–`05:08:05.780712909Z`, le
15 octobre 2026. Portée désactivée et Flywheel actif entre les étapes ; second
cycle annulé avec historique et dernier fichier complet préservés, spool nettoyé.
Les mécanismes, fluides et textures de Pikachu sont présents, les positions/UV
sont finis. Les GLB et métadonnées passent l’API ; écrans Minecraft et rendus
Blender manuel/AFK inspectés.

La vérification des couches précise une limite : les deux textures de Pikachu,
dont `pikachu_emissive.png`, sont intégrées, mais l’auto-éclairage spécifique de
cette couche Cobblemon n’est pas traduit en émission glTF. Il ne faut pas lire
les observations précédentes de « passe lumineuse » comme une validation de cet
effet. Les effets GPU arbitraires, glint, texte et autres exclusions restent
suivis dans [les limites de capture](frozen-entities.md).

Le même JAR passe la régression NeoForge 21.1.248 sans Flywheel : coffre, mouton
coloré, feuillage, verre, eau et Enderman. Le pilote impose un PBO de lecture de
16 octets et des réglages de packing non standards (alignement 8, longueur de
ligne 23, offsets 3/2) ; les onze états GL comparés sont restaurés. Le GLB de
1 008 triangles contient neuf images intégrées, avec positions/UV finis et
métadonnées acceptées par l’API. Les yeux d’Enderman portent bien
`emissiveFactor=[0.65,0.65,0.65]` et leur texture d’émission. Les écrans
Minecraft et le rendu Blender sont inspectés, avec le mouton coloré et les yeux
lumineux présents. Le premier contrôle Blender avait révélé deux moutons
exactement superposés dans la fixture (triangles dupliqués) ; le pilote nettoie
désormais ces entités avant placement. Le parcours est rejoué avec un seul
mouton, sans modification du produit.

Preuves finales : `full-atmons/atlas-no-shader-afk/` et `vanilla/atlas-final/`,
avec JAR exact, inventaire, réglages, résultats GL, géométrie, couches spéciales,
validation API et rendus. Ces essais valident ce périmètre ; ils ne garantissent
pas tous les renderers et réglages des modpacks. CI encore nécessaire avant fusion.
