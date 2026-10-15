# Validation des renderers de modpacks

L’issue #91 reste ouverte : les résultats ci-dessous concernent un banc isolé
construit à partir des JAR d’ATMons, pas une validation de tous les mods du profil.
Les sauvegardes et configurations personnelles ne sont pas utilisées ni modifiées.

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
eau courante et Pikachu avec sa passe lumineuse. Le mod reste non appairé et
les captures AFK sont explicitement désactivées pendant ce premier essai manuel.
Les réglages et la sauvegarde sont propres au banc.

Avec le JAR précédent, Flywheel contourne le renderer CPU des composants animés.
L’export aboutit mais omet la géométrie de plusieurs composants visibles en jeu.
Pikachu, ses textures et sa passe lumineuse sont déjà présents. Le correctif donne
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
Spotless, SpotBugs et JaCoCo. Les essais AFK, Sodium/Iris et profils complets
restent nécessaires avant fermeture de l’issue.

## Validation encore nécessaire pour #91

- Rendu Sodium/Iris et shader packs retenus, ou limites constatées avec leurs
  versions exactes ; aucun shader n’est annoncé validé par sa seule présence.
- Captures AFK progressives avec les mêmes renderers et retour à une capture
  sans Flywheel ; vérifier annulation, derniers fichiers valides et état du jeu.
- Scénarios sur les profils ciblés et documentation du périmètre réellement testé,
  puis contrôles globaux et CI avant fusion et fermeture.
