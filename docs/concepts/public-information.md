# Information destinée aux joueurs

## Sources et périmètre

Les pages `/concept`, `/fonctionnement`, `/installation` et `/faq` reprennent le besoin de `BESOIN.md`, sections 2 et 3 : garder les lieux construits ensemble, réduire les frictions de relance et rendre les souvenirs consultables. Les ambitions du document initial ne sont pas des fonctions livrées. Les faits actuels sont recoupés avec `README.md`, `docs/features/loader-support.md`, les commandes du mod et les panneaux de galerie/partage.

Le contenu est en français et reprend les libellés anglais des boutons existants. La page d’installation possède désormais un guide interactif : système et launcher, prénom facultatif, étapes mémorisées localement, navigation libre et illustration SVG animée avec réduction des animations. Les guides sont publics, accessibles depuis toutes les pages, y compris sur mobile.

## Personas de travail et revue de clarté

Ces personnages sont des hypothèses de conception, pas des entretiens utilisateurs. La revue ci-dessous vérifie que chaque question trouve une réponse dans le contenu ; elle ne remplace pas un test avec de vraies personnes.

| Public / persona | Situation et besoin | Question de compréhension | Réponse à trouver / parcours |
| --- | --- | --- | --- |
| Admin serveur — Léo, 22 ans | Termine une saison à six amis ; veut conserver les lieux avant fermeture | Faut-il modifier le serveur ? Est-ce une sauvegarde ? | Installation côté client, règles du serveur, zones chargées ; Concept explique de garder la sauvegarde ; Fonctionnement mène au partage révocable |
| Parent — Camille, 40 ans | Veut conserver le château construit avec son enfant sans le rendre public | Qui voit le fichier ? Quand est-il envoyé ? | Fonctionnement et FAQ distinguent local, galerie privée, lien transmissible ; explicitent l’AFK après appairage et les informations associées |
| Jeune adulte — Sarah, 19 ans | Veut revoir la base de ses amis après la saison, sans réinstaller le pack | Ai-je besoin du mod ou d’un compte pour visiter ? | Concept et FAQ : une capture déjà créée se consulte par lien sans compte ni mod ; un serveur fermé ne se récupère pas directement |
| Ado — Alex, 15 ans | Veut capturer sa construction et la montrer à ses amis | Quel fichier copier ? Où ? Que taper ? | Installation définit JAR/profil/loader, étapes numérotées ; Fonctionnement donne commandes exactes et explique CODE ; partage et données personnelles explicites |
| Casual vanilla — Jules, 30 ans | N’a jamais installé de mod ; veut garder sa maison solo | Java ou Bedrock ? Vais-je modifier mon monde ? | Installation annonce les versions, conseille une copie, définit les termes ; FAQ explique pourquoi un profil NeoForge est requis même pour un monde vanilla |
| Pro modder — Morgan, 27 ans | Utilise plusieurs instances ; veut vérifier la fidélité d’un pack | Quel loader/build ? Quelles limites de rendu et d’export ? | Installation donne les versions et le dossier du profil ; FAQ annonce les rendus non garantis ; Fonctionnement précise bornes de sélection, historique local et limite de taille |

## Vérification éditoriale effectuée

- Chaque parcours a un point d’entrée, une action et un résultat attendu (mod visible, fichier exporté, capture présente dans la galerie).
- Les mots launcher, profil/instance, loader, JAR, GLB et appairage sont expliqués à leur première utilisation dans les guides concernés.
- Les fonctions actuelles sont séparées du timelapse, de l’import ZIP, des autres loaders, de l’impression et des anciens scénarios de prix.
- La consultation sans installation est distinguée de la création nécessitant Minecraft compatible.
- Aucune promesse de compatibilité universelle ou d’hébergement permanent ; confidentialité et envoi AFK automatique sont explicites.
- Le bouton télécharge le JAR inclus dans le build du site ; il reste absent si le manifeste manque ou ne correspond pas à la cible. Les publications catalogue sont en préparation.

## Sources externes vérifiées le 10 octobre 2026

- [CurseForge — Getting Started](https://support.curseforge.com/support/solutions/articles/9000218572-getting-started) : profils et loaders, application.
- [Modrinth App — aide officielle](https://support.modrinth.com/en/collections/7804910-modrinth-app) : instances, dossiers, versions de loaders.
- [NeoForge — guide utilisateur](https://docs.neoforged.net/user/docs/) : Java 21 et installation client.

Les parcours Modrinth et manuel sont des instructions documentées, pas une validation en jeu de Minemories. Seul le profil CurseForge documenté dans `docs/features/loader-support.md` a été exercé.

## Validation utilisateur à réaliser

Faire lire les pages à une personne représentative de chaque public et lui demander de réaliser son parcours sans explication orale. Vérifier qu’elle sait dire : « une capture ne remplace pas une sauvegarde », « le lien peut être retransmis », « les captures AFK sont actives par défaut, et sont envoyées automatiquement seulement après connexion du compte », et retrouver le fichier exporté. Noter les hésitations et corriger le texte. Tester séparément les trois parcours d’installation avec un JAR distribué officiellement.

## Contrôles sur cette modification

- `bun format` et `git diff --check` : réussis.
- Partie web de `bun check` : typecheck et 40 tests réussis, couverture des utilitaires à 100 % ; test d’interaction ajouté pour le parcours entre les quatre guides et les ancres d’installation.
- Partie API de `bun check` : typecheck et 35 tests réussis.
- `bun web:build` : réussi.
- Validation complète après configuration du JDK 21 local et correction des dépendances de test Java : `bun run build` réussi (inclut `bun check`, le bundle web et le JAR du mod). Le test Garage réel reste ignoré sans environnement dédié ; aucune validation en jeu supplémentaire effectuée.

## Guide d’installation interactif (14 octobre 2026)

Le parcours par défaut utilise Minecraft Launcher et l’installateur officiel NeoForge 21.1.248. Windows, macOS et Linux disposent de chemins adaptés ; CurseForge, Modrinth App et les autres launchers utilisent le même JAR local, sans prétendre à une publication catalogue. Le premier essai exporte une petite zone via `/minemories export 16`, puis ouvre le GLB sans compte. Le lien à une galerie reste facultatif et explique les envois AFK après appairage. Les libellés des menus du mod ont été recoupés avec `MinemoriesScreen.java`.

La progression est déclarative : cliquer « C’est fait » n’atteste pas de l’état du jeu. Les choix, le prénom facultatif et les étapes sont conservés uniquement dans localStorage, peuvent être effacés et ne sont pas envoyés au serveur. Le parcours reste utilisable si le stockage ou le presse-papiers sont bloqués. Les animations respectent `prefers-reduced-motion` et le choix dans le guide. Les changements d’étape placent le focus sur leur titre pour la navigation clavier.

Le 14 octobre, l’URL publique du manifeste renvoyait un HTTP 200 avec le HTML de la SPA. La présence du bouton dans le dépôt ne prouvait donc pas la disponibilité du mod. Le front interroge désormais les releases publiques GitHub et télécharge directement le dernier JAR compatible ; aucun build Java ni JAR local n’est nécessaire à son déploiement. La sélection exclut les brouillons et les assets incompatibles ; les erreurs GitHub disposent d’un délai maximal et d’un bouton de réessai. Le déploiement du front et la vérification des URL publiques restent nécessaires.

Le parcours Windows / Minecraft Launcher réserve dix captures légendées : version du jeu, Java 21, installateur NeoForge, dossier du profil, JAR téléchargé, dossier mods, liste Mods, menu M, export local et viewer. Les fichiers attendus et leur contenu sont décrits dans `apps/web/src/assets/tutorial/windows/README.md`. Les vraies images remplacent les zones au prochain build ; aucune requête vers une image manquante n’est faite, et une image chargée peut être agrandie. Ces zones sont propres au parcours manuel Windows.

## Connexion et inscription : saisie accompagnée

Le champ de mot de passe propose Afficher/Masquer, conserve la valeur et se masque à nouveau quand le focus quitte son groupe. La consigne de création (12 caractères minimum) reste visible ; Verr. Maj est signalé. Les erreurs serveur reçoivent le focus et le formulaire annonce son attente. Le passage connexion/inscription conserve la destination initiale.

Cette amélioration répond aux hypothèses des six personas : Camille et Jules disposent d'une aide persistante pour vérifier leur saisie ; Alex bénéficie de commandes tactiles de 48 px minimum et de champs de 16 px ; Léo et Morgan conservent les attributs d'autocomplétion et le parcours clavier ; Sarah retrouve toujours l'accès au viewer sans compte. Les textes supplémentaires existent en français et en anglais. Aucun mot de passe n'est stocké par cette interface.

Validation : tests React de visibilité, conservation de valeur, masquage au départ, Verr. Maj, attributs de saisie, focus des erreurs et destination après changement de mode. Contrôle navigateur Chromium et Firefox au clavier et à 390 px, avec inspection des captures desktop/mobile. Ce contrôle technique ne constitue pas un entretien utilisateur ni un essai sur un téléphone physique.
