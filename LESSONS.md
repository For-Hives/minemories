# Lessons learned 

## Comments

### issue : 
too much comment, multilines block of comment for everything 

### solution :
prefere self defined code, only use one line of comment when really needed for the context

## Validation du mod en jeu

Quand le développeur signale qu'un correctif ne change rien, vérifier le JAR réellement installé dans son profil CurseForge avant de modifier encore le code. Comparer les empreintes et, si nécessaire, le bytecode. Livrer le correctif dans l'instance utilisée, avec sauvegarde, et préciser qu'un redémarrage complet de Minecraft est nécessaire ; un build dans le dépôt seul ne met pas le jeu à jour.
