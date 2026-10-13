# Information destinée aux joueurs

## Sources et périmètre

Les pages `/concept`, `/fonctionnement`, `/installation` et `/faq` reprennent le besoin de `BESOIN.md`, sections 2 et 3 : garder les lieux construits ensemble, réduire les frictions de relance et rendre les souvenirs consultables. Les ambitions du document initial ne sont pas des fonctions livrées. Les faits actuels sont recoupés avec `README.md`, `docs/features/loader-support.md`, les commandes du mod et les panneaux de galerie/partage.

Le contenu est en français et reprend les libellés anglais des boutons existants. Pas de refonte graphique. Les guides sont publics, accessibles depuis toutes les pages, y compris sur mobile.

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
