# Preview, partage et profil — corrections du 19 octobre 2026

- Bloom HDR réduit de 0,24 à 0,12 (50 %), sans modifier l’exposition.
- Pluie/neige artistiques sélectionnables dans les ambiances : 768 particules GPU réutilisées autour du joueur, arrêt en mode Économie, mouvement réduit et dimensions sans ciel. Ce ne sont pas des données météo enregistrées ni une simulation de collisions : les particules peuvent traverser les toits et le sol. Les feuilles/herbes restent figées.
- Orbite centrée sur `minemoriesPlayerPosition`, pan désactivé ; le passage entre captures préserve l’angle/distance autour du nouveau joueur. Quitter le déplacement libre rétablit le cadrage joueur. Les anciennes captures sans coordonnées explicites gardent le cadrage de surface.
- Partage : commandes lisibles/tactiles, lien copiable et ouvrable, récupération du même lien à la réouverture, révocation et remplacement explicites. Le serveur conserve le jeton chiffré AES-GCM avec une clé dérivée de PAIRING_PEPPER, authentifiée avec le propriétaire et le souvenir ; seule l’API propriétaire le restitue. Migration SQLite additive. Les anciens liens sans copie chiffrée continuent de fonctionner mais doivent être remplacés pour devenir récupérables. Une rotation du pepper invalide les liens existants comme auparavant. Les jetons ne doivent pas être journalisés.
- Publication : bouton visible sur la carte ; accès depuis le partage du viewer vers le panneau de publication correspondant dans la galerie, avec focus/défilement. Consentement et modération restent requis ; l’ouverture d’un panneau ne publie rien.
- Profil : pseudo de 1 à 80 caractères, validation serveur, mise à jour de session sans déconnexion. E-mail/mot de passe conservent leur confirmation et déconnexion des sessions. Pour un compte social sans mot de passe local, l’interface renvoie vers le fournisseur.

## Google et Discord

Configurer côté API `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` et/ou `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET`. Enregistrer chez le fournisseur le callback exact `${BETTER_AUTH_URL}/api/auth/callback/google` ou `/discord`, puis redémarrer l’API. Les boutons connexion/inscription n’apparaissent que pour les paires complètes ; aucun secret n’est livré au navigateur. Le retour est limité à une URL du site. L’association automatique de comptes par e-mail est désactivée. Un utilisateur connecté peut explicitement associer Google/Discord depuis son profil ; les fournisseurs déjà associés ne sont plus proposés. Better Auth vérifie la session, l’e-mail vérifié et la concordance avec l’adresse du compte, sans fusion implicite.

L’activation et un parcours OAuth réel nécessitent les applications et identifiants du propriétaire ; aucun compte externe n’a été créé et aucun déploiement n’est effectué par ces changements.

## Validation

Tests de non-régression : bloom, particules/arrêt/libération GPU, cible orbitale préservée, récupération/révocation des liens, chiffrement et isolation propriétaire, formulaire de pseudo et rechargement de session, validation HTTP du pseudo, découverte des fournisseurs et redirection/erreurs OAuth simulées.

Suivis existants : #93 (viewer), #59 (interactions), #129 (connexion). Validation esthétique des captures réelles et OAuth de production à compléter dans leurs environnements respectifs.

Contrôle graphique local : scène synthétique avec terrain, maison, arbres et avatar générée/rendue dans Blender puis chargée en GLB dans Chromium/SwiftShader. Cadrage et neige inspectés sur bureau et viewport mobile 390 px ; aucune erreur JavaScript ni débordement horizontal. Ce contrôle ne remplace pas la revue esthétique sur les captures personnelles du développeur. Les 46 tests web et 20 tests API ciblés passent. Les suites sont exécutées avec un délai de test de 30 secondes et un worker à cause des dépassements de 5 secondes sur cette machine ; les seuils de couverture restent inchangés.

Suite complète web : **288 tests réussis / 51 fichiers**, utilitaires à **100 %** (lignes, branches, fonctions et instructions). Lint et typechecks web/API réussis. Suite complète API : **327 réussis, 6 ignorés (Garage conditionnel), 2 échecs** ; couverture globale **99,77 % lignes / 98,98 % fonctions**, nouveaux modules OAuth/chiffrement à 100 %, inventaire LCOV complet. Les échecs concernent le scénario existant d’upload de 450 Mio (délai explicite de 90 s dépassé) et la sortie SIGTERM de la fixture de démarrage (143 au lieu de 0). Le scénario SIGTERM réussit lors de sa relance isolée. Ces deux limites empêchent de déclarer `bun check` / `bun run build` entièrement verts ; aucun seuil ni délai de test du dépôt n’a été changé pour les masquer.

Build web de production réussi, avec pré-rendu de 19 pages publiques. Les fichiers de travail et captures de contrôle restent sous `work/` (ignoré par Git) ; aucun fichier de capture personnel n’a été utilisé.

Contrôle Java global tenté avec le cache Gradle fourni (`GRADLE_USER_HOME=/workspace/tooling/gradle`), puis interrompu durant la préparation/remappage initial des dépendances Minecraft/Fabric ; il n’est pas déclaré réussi. Aucun code Java ni format GLB n’a été modifié. Le build global reste non validé ; le build web séparé est réussi.
