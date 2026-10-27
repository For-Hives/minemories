# Installation sans configuration

Après installation, le mod doit fonctionner **sans aucune action** du joueur, y compris pour un enfant de 12 ans sans connaissance technique. Les réglages sont donc des exceptions que l'on peut désactiver (opt-out), pas des étapes à franchir. Cette page liste chaque clé de `config/minemories.properties`, sa valeur quand elle est absente et la raison du choix. Une clé absente n'est jamais confondue avec une valeur explicitement désactivée par le joueur : un réglage refusé reste refusé.

## Valeurs par défaut

| Clé | Si absente | Remarque |
| --- | --- | --- |
| `afkSnapshots` | `true` | Captures automatiques après 5 minutes d'inactivité, au plus toutes les 4 heures, y compris en pause ou fenêtre inactive. Un `false` explicite est conservé. |
| `afkIdleMinutes`, `afkIntervalMinutes`, `captureRadius` | 5, 240, 32 | Réglages avancés ; une valeur invalide retombe sur ces défauts. |
| `captureFullHeight` | `false` | Les captures autour du joueur gardent la profondeur réellement visitée plus cinq blocs. |
| `captureTiles`, `captureTileChunks` | `true`, 2 | Les captures AFK sont découpées en tuiles de 2×2 chunks (32 blocs) et alignées sur la grille : la zone capturée est agrandie aux tuiles entières (au plus 96 blocs de côté pour un rayon de 32). Le fichier local `capture.glb` devient alors un bundle `.mmtiles`, illisible dans Blender ; `captureTiles=false` rétablit un GLB unique, sans lecture « monde » dans le viewer. Pas encore validé en jeu (voir #145, #159). |
| `manualCaptureTiles` | `true` | Option de l'onglet **Captures** du mode avancé : les captures manuelles autour du joueur (bouton « Prendre un souvenir », `/minemories export <rayon>`) sont alignées sur la grille et enregistrées en bundle `.mmtiles`, pour rejoindre la chronologie du monde dans le viewer. Le fichier local n'est alors plus lisible dans Blender. Les sélections (`select`) restent des GLB uniques. |
| `exportDirectory` | `~/export` | Dossier des souvenirs locaux. |
| `apiUrl` | `https://api.minemories.net` | Service officiel ; changer d'API déconnecte le compte. |
| `deviceToken`, `deviceId` | absents | **Seule action nécessaire : connecter son compte** (code à 6 chiffres). Tant que le joueur n'est pas connecté, un message cliquable du chat le lui rappelle à chaque entrée dans un monde, et ouvre les réglages. Les captures restent locales jusqu'à la connexion ; après la connexion, elles partent automatiquement. |
| `diagnosticsConsent` | activé | Diagnostics techniques assainis, jamais envoyés avant l'appairage. Un `false` explicite est conservé après appairage, déconnexion ou changement d'API. Détails : [diagnostics](consented-diagnostics.md). |
| `pairingReminder` | `true` | Rappel de connexion dans le chat ; `false` le désactive. |
| `remoteWorld.<empreinte>` | absent | Sur serveur distant, une série par connexion ; l'identifiant de monde est un réglage avancé. |

L'historique d'exploration et les zones suggérées sont toujours actifs, locaux et bornés. Rien d'autre n'est envoyé avant l'appairage.

## Rappel de connexion

- Une fois par entrée dans un monde (pas à chaque changement de dimension), environ cinq secondes après l'arrivée, uniquement si le joueur n'est pas connecté et que `pairingReminder` n'est pas désactivé.
- Le message n'existe que côté client : il n'est jamais envoyé au serveur Minecraft.
- Cliquer le message exécute `/minemories settings`, qui ouvre le menu Minemories au tick suivant. L'ouverture est différée : un écran ouvert pendant que le chat se ferme serait aussitôt remplacé.

## Ce qui n'est pas validé

La logique (consentement par défaut, conservation d'un refus explicite, cadence du rappel) est testée en unitaire. Le rendu, le clic dans le chat sur NeoForge, Fabric et Forge (solo et serveur distant) et la compréhension par des joueurs réels (#87) restent à valider en jeu.

## Réglages avancés par onglets

Le bouton « Réglages » de l'écran simple ouvre l'écran avancé, organisé en quatre onglets : **Compte** (adresse de l'API, stockage, déconnexion), **Captures** (dossier local, exports, AFK, historique), **Monde** (identité du monde distant, zones suggérées) et **Confidentialité** (diagnostics). Le bouton Enregistrer reste visible sous tous les onglets. Mise en page non validée en jeu.
