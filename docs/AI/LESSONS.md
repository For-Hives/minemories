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

- Pour accueillir une personne non technique, livrer un parcours d’installation concret jusqu’au premier souvenir, avec téléchargement du JAR sur le site, personnalisation et illustrations légères ; vérifier le fichier réellement servi en production, pas seulement le bouton dans le code.

- Le déploiement web doit rester indépendant du build Minecraft/Java : distribuer le mod depuis les releases GitHub publiques et réserver Gradle à la CI du mod. Pour le web, préparer les contenus et l’i18n sans inventer d’offres commerciales, et pré-rendre les pages publiques pour les robots.

- Préparer les fonctionnalités web avec des démonstrations réellement interactives et plusieurs angles marketing (code public, nostalgie, partage, classement). L’indexation doit désormais rester bloquée jusqu’au lancement ; les nouveaux tarifs explicitement donnés remplacent l’ancien besoin sans inventer un paiement déjà connecté.

- Les releases GitHub du mod doivent devenir automatiques après merge sur main : versions des packages et de Gradle synchronisées, matrice par loader réellement disponible et changelog généré. Éviter une deuxième PR de release à fusionner ; conserver la distinction entre bêta CI et validation en jeu du JAR exact.

- Avant de faire tester le parcours par Mae, le développeur priorise l’observabilité distante : erreurs d’export et crashs doivent être remontés à l’API et exploitables dans une page d’administration privée, avec groupes, détails et statut de traitement. Les diagnostics doivent survivre aux coupures et à une relance sans activer le consentement d’un joueur à sa place.

- Pour le viewer, le développeur attend une refonte autonome et créative du parcours entier, avec une atmosphère de souvenir agréable inspirée des shaders Minecraft. La fluidité, les ambiances et le partage font partie du rendu premium ; valider sur des captures réelles et ne pas se limiter à ajouter des réglages graphiques.

- Une « vraie refonte » du viewer doit être immédiatement visible dans la composition de la page, pas seulement dans ses paramètres graphiques. Après validation technique, intégrer effectivement sur main et préciser où voir le résultat ; tester Firefox sur une vraie capture, y compris les modes avec post-traitement, avant de demander au développeur de réessayer.

- Le viewer doit privilégier la position vécue par le joueur et les visites d'intérieurs : un cadrage mathématique du volume, même correctement rendu, ne suffit pas. Ne pas confondre les anciennes coordonnées de capture (parfois le centre du volume) avec une position joueur réellement enregistrée.
