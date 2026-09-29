# Récapitulatif du POC Minecraft

Document de contexte de l'implémentation existante, avant d'étendre le produit.

## Objectif

Valider qu'un mod côté client peut prendre une zone d'un monde Minecraft moddé, récupérer les modèles et textures déjà chargés par le jeu et produire un GLB explorable hors du jeu.

## Environnement

- Minecraft 1.21.1, NeoForge 21.1.248, Java 21.
- Profil de jeu utilisé : CurseForge `mc breval`.
- L'export est client-side et écrit `~/export/capture.glb`.
- Le GLB contient ses propres textures; il peut être ouvert dans Blender et dans le viewer web du dépôt.

## Fonctionnalités exercées

- Sélection d'une zone par deux coins et export d'une zone autour du joueur.
- Modèles de blocs cuits et données de block entities; rendu de nombreux modèles issus de mods.
- Textures du jeu, UV, teintes et transparence pour les assets rencontrés.
- Fluides standards et géométrie provenant de certains renderers de block entities.
- L'utilisateur a confirmé que des éléments cinétiques de Create s'exportent dans sa configuration.
- Le writer GLB ajoute facteurs d'émission et lumières ponctuelles pour les sources lumineuses.

Les résultats sont empiriques et dépendent des mods et du chemin de rendu actif. Ils ne signifient pas une compatibilité universelle avec les renderers ou pipelines instanciés.

## Dernier problème connu

Blender avait refusé un export avec `Bad glTF: json contained NaN`. L'inspection du fichier a localisé des bornes non finies sur des géométries associées à Create Sifter (poussière et gravier). Le core a été modifié pour ignorer tout quad avec position ou UV non fini et pour filtrer les positions de lumières invalides. La correction a compilé et le JAR a été recopié dans le profil; le nouvel export doit être régénéré et essayé pour confirmer le correctif en conditions réelles.

## Limites et travaux à venir

- Certains modèles moddés inhabituels ou rendus par des pipelines personnalisés peuvent manquer.
- Les sources de fluides et transparences doivent être vérifiées selon les mods.
- Le rendu emissif et l'intensité/portée des lumières ont été ajustés après retours utilisateur, mais restent à valider visuellement dans le nouvel export.
- La sélection UI, les performances, la réduction/optimisation du mesh et l'atlas de texture restent à améliorer.
- Fabric, Quilt et Forge ne sont pas implémentés.
- Le viewer web vient d'être créé et doit être utilisé sur des exports représentatifs.

## Commandes du mod

- `/minemories select first` / `second`: définit les coins visés.
- `/minemories select status`: affiche la sélection.
- `/minemories select clear`: efface la sélection.
- `/minemories export`: exporte la sélection.
- `/minemories export <radius>`: exporte une zone sur toute la hauteur de la dimension (rayon horizontal 2–128 blocs, 128 par défaut, chunks chargés uniquement).
