# Identifiants du compte

La page privée `/account`, accessible depuis « Mon compte », permet de changer l’e-mail de connexion ou le mot de passe. Elle est exclue de l’indexation et du prérendu public ; le routage Nginx sert l’application pour cette URL.

Chaque opération exige la session courante et le mot de passe actuel, limité à 128 caractères. Le nouveau mot de passe contient au moins 12 caractères ; le formulaire demande une confirmation. Le serveur utilise les fonctions de hash et de vérification configurées par Better Auth, sans dupliquer son algorithme.

Le changement et la révocation de toutes les sessions du compte sont publiés ensemble dans une transaction SQLite. L’état des identifiants et de la session est revérifié après la confirmation : une modification concurrente ou une session révoquée empêche la publication. Une adresse déjà utilisée annule la transaction. Les tentatives de confirmation sont limitées à huit par minute et par compte, avec compteur persistant.

L’adresse est normalisée en minuscules et reste non vérifiée : aucune preuve de possession de la nouvelle boîte n’est inventée. Le service actuel n’envoie pas d’e-mails de vérification ; la confirmation repose sur le mot de passe actuel. L’identifiant du compte reste stable, ainsi que ses souvenirs, appairages et rôles. Un nouveau chargement de la page de connexion évite de garder une session en cache après succès.

Validation : tests du service (concurrence, expiration, rollback et limitation), vrais parcours HTTP Better Auth/oRPC (nouvelle connexion, ancien mot de passe et sessions invalides, autre compte intact), et interactions FR/EN des formulaires. Aucun mot de passe ni hash n’est conservé dans les traces de validation.
