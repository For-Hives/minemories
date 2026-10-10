# Lessons learned 

## Comments

### issue : 
too much comment, multilines block of comment for everything 

### solution :
prefere self defined code, only use one line of comment when really needed for the context

## Validation du mod en jeu

Quand le développeur signale qu'un correctif ne change rien, vérifier le JAR réellement installé dans son profil CurseForge avant de modifier encore le code. Comparer les empreintes et, si nécessaire, le bytecode. Livrer le correctif dans l'instance utilisée, avec sauvegarde, et préciser qu'un redémarrage complet de Minecraft est nécessaire ; un build dans le dépôt seul ne met pas le jeu à jour.

## Information produit avant design

Pour les pages d’information Minemories, le développeur veut d’abord du contenu concret fondé sur BESOIN.md, pensé pour plusieurs publics (admin, parent, jeune adulte, ado, casual vanilla, pro modder). Privilégier les étapes compréhensibles et vérifier les questions de chaque persona avant de travailler l’apparence.

## Commandes de build et Java local

`bun build` appelle le bundler natif, pas le script build du dépôt : utiliser `bun run build`, aussi en CI. Le JDK 21 local est dans `/home/lightin/.local/tools/jdk-21.0.12.1+1` ; définir JAVA_HOME et ajouter son bin au PATH pour les contrôles Gradle.

- Les captures AFK font partie de l’expérience simplifiée attendue : actives par défaut, même en pause ou en arrière-plan ; ne pas imposer une activation avancée. Les délais et la taille restent des réglages avancés.

- Le développeur attend un suivi concret de ses remarques : rendre visible le chargement réel du viewer et garder des tâches précises pour la profondeur visitée et les bordures des captures.
