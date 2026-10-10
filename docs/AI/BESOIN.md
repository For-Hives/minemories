**Sauvegarder, revisiter et partager les mondes Minecraft comme des souvenirs**

Document de travail · Version 1.0 · Septembre 2026 Statut : pré-MVP, aucune ligne de code écrite

---

## Sommaire

1. [Résumé exécutif](#1-r%C3%A9sum%C3%A9-ex%C3%A9cutif)
2. [Le concept](#2-le-concept)
3. [Le besoin utilisateur](#3-le-besoin-utilisateur)
4. [Analyse du marché](#4-analyse-du-march%C3%A9)
5. [Paysage concurrentiel](#5-paysage-concurrentiel)
6. [Analyse des risques](#6-analyse-des-risques)
7. [Recommandations stratégiques](#7-recommandations-strat%C3%A9giques)
8. [Modèle économique révisé](#8-mod%C3%A8le-%C3%A9conomique-r%C3%A9vis%C3%A9)
9. [Plan go-to-market](#9-plan-go-to-market)
10. [Spécification technique préliminaire](#10-sp%C3%A9cification-technique-pr%C3%A9liminaire)
11. [Roadmap](#11-roadmap)
12. [Décisions ouvertes](#12-d%C3%A9cisions-ouvertes)
13. [Sources](#13-sources)

---

## 1. Résumé exécutif

**L'idée.** Un service en ligne qui transforme une zone d'un monde Minecraft en modèle 3D léger, hébergé, explorable dans le navigateur et partageable par simple lien — une « capsule souvenir » qui survit à la mort du serveur, à la disparition des mods et à l'oubli du dossier de sauvegarde.

**Faisabilité technique : élevée.** La brique de rendu est un problème résolu et documenté (BlueMap, Mineways, Chunky). Le vrai travail d'ingénierie porte sur trois points : le support des mods, la compression du mesh, et la modélisation temporelle pour le timelapse. Aucun de ces trois n'est bloquant.

**Faisabilité commerciale : moyenne, sous condition de repositionnement.** Le marché existe mais il est plus étroit qu'il n'y paraît, et le modèle de prix initialement envisagé (2 € le snapshot, 5 €/mois l'évolutif) attaque l'utilisateur au pire moment de son cycle d'engagement. Estimation réaliste en l'état : 15 à 35 k€/an à trois ans. Ce n'est pas un business à temps plein sans multiplicateur.

**La découverte la plus importante de l'analyse.** CoreProtect, le plugin de logging de blocs quasi universel sur les serveurs Paper/Spigot, enregistre déjà chaque changement de bloc horodaté et attribué. La donnée nécessaire au produit « timelapse » existe donc **déjà, rétroactivement, sur des dizaines de milliers de serveurs**, sans qu'aucun snapshot n'ait besoin d'être planifié. C'est la base d'une proposition de valeur que personne n'exploite aujourd'hui sous forme de service.

**Les trois recommandations structurantes.**

1. Repositionner le produit d'entrée sur le **timelapse et la rétrospective annuelle** (format « Wrapped »), gratuits et viraux, et faire de l'archive permanente le produit premium.
2. Cibler **l'admin de serveur**, pas le joueur individuel : un payeur pour cinq à dix utilisateurs exposés.
3. Ajouter un **produit physique** (impression 3D de la base) — ticket 20× supérieur, marge réelle, et pic saisonnier naturel.

---

## 2. Le concept

### 2.1 Formulation initiale

> Il arrive régulièrement qu'un groupe d'amis monte un serveur Minecraft une fois par an et s'y amuse quelques mois. On construit, on crée un monde. Puis on arrête, et on oublie tout. Au mieux on garde une sauvegarde qu'on ne relance jamais, parce que ce n'est pas pratique de retélécharger tous les mods dans leurs bonnes versions juste pour visiter un vieux monde.

### 2.2 Proposition

Générer automatiquement des **modèles 3D miniatures** des mondes — quels que soient les mods utilisés — les stocker, et permettre de les revisiter facilement depuis une galerie de souvenirs.

### 2.3 Principes produit

|Principe|Conséquence|
|---|---|
|**Le souvenir, pas la carte**|Objet figé et daté, pas une carte live d'exploration|
|**Zéro infrastructure côté joueur**|Pas de port, pas de VPS, pas de Docker, pas de config|
|**Indépendance aux mods**|Le modèle doit survivre à la disparition du modpack|
|**Sélection de zone**|On ne sauvegarde pas le monde entier, seulement ce qui a été construit|
|**Léger**|Chargeable dans un navigateur en quelques secondes, sur mobile compris|
|**Partageable**|Un lien, pas de compte requis pour le visiteur|

---

## 3. Le besoin utilisateur

### 3.1 Le problème, décomposé

Le problème réel n'est pas « je n'ai pas de sauvegarde ». C'est une chaîne de frictions :

1. **Friction de relance.** Retrouver la bonne version du modpack, du launcher, du loader. Coût : 30 à 90 minutes, pour un plaisir incertain.
2. **Friction de coordination.** Revisiter seul un monde construit à huit n'a pas le même sens. Il faudrait que tout le monde réinstalle.
3. **Friction de disparition.** Les mods sont retirés de CurseForge, les versions cassent, les hébergeurs purgent. Aternos impose par exemple une limite de 4 Go de stockage par serveur, qui sature vite avec un gros modpack.
4. **Friction d'oubli.** Une sauvegarde `.zip` sur un disque dur n'est pas un souvenir. Elle n'est pas consultable, pas partageable, pas visible. Elle ne déclenche rien.

Le produit ne résout pas le stockage — il résout **l'accessibilité émotionnelle** du souvenir.

### 3.2 Personas

**Léo — l'admin (le payeur)** 22 ans, monte un serveur modded avec 6 amis chaque été. Loue 5 €/mois chez un hébergeur ou utilise Aternos. C'est lui qui a les fichiers, l'habitude de payer, et le sentiment de responsabilité envers le groupe. **Cible primaire.**

**Sarah — la joueuse (l'utilisatrice)** 19 ans, joue 3 mois puis décroche. Ne paiera jamais elle-même, mais c'est elle qui partage le lien sur Discord et qui génère la viralité. **Cible d'usage et d'acquisition.**

**Marc — le nostalgique (le converti)** 28 ans, retrouve en 2026 le dossier `world` d'un serveur de 2015. Aucun moyen de le relancer. Prêt à payer un ticket unique élevé pour le récupérer. **Cible de conversion à forte marge, mais volume faible.**

### 3.3 Job to be done

> _Quand une saison de serveur se termine, je veux pouvoir montrer et revoir ce qu'on a construit ensemble, sans que personne n'ait à réinstaller quoi que ce soit, pour que ces mois de jeu ne disparaissent pas._

Notez le « montrer » : il précède le « revoir ». C'est un indice décisif pour le positionnement (voir §7.1).

---

## 4. Analyse du marché

### 4.1 Dimensionnement

|Niveau|Estimation|Base|
|---|---|---|
|Joueurs actifs mensuels Minecraft (toutes plateformes)|~212 M|Agrégats 2026|
|Part Java Edition dans le jeu sur serveur|~65–70 %|Statistiques serveurs 2026|
|Utilisateurs Aternos (proxy petits serveurs)|~85 M inscrits, ~1 M joueurs/jour|Aternos|
|Membres r/admincraft (admins engagés)|150 270|Reddit|
|**Serveurs « saison entre amis » actifs par an**|**~1–3 M**|Dérivé (1 admin / 5–10 joueurs)|
|**Atteignables en 3 ans, canaux organiques**|**~20–50 k serveurs**|Plafond Modrinth + Reddit + Discord|
|**Revenu réaliste à 5 % de conversion, 15 €/an**|**~15–35 k€/an**||

### 4.2 Lecture

Le sommet de l'entonnoir est gigantesque mais trompeur. Trois filtres successifs réduisent drastiquement la cible :

- **Java uniquement** (Bedrock a un format de monde différent, une communauté de mods marginale, et un public plus jeune et moins solvable) ;
- **multijoueur persistant** (le solo génère moins d'attachement collectif) ;
- **atteignable organiquement** (aucun budget d'acquisition payante viable sur ces mots-clés).

**Conclusion : en l'état, c'est un excellent side-project rentable, pas une entreprise.** Le §7.3 propose trois multiplicateurs pour changer cet ordre de grandeur.

### 4.3 Saisonnalité

Un signal exploitable et sous-estimé :

|Période|Événement|Implication|
|---|---|---|
|**Juin**|Naissance des serveurs d'été|Pic d'**acquisition**|
|**Septembre–octobre**|Mort des serveurs (rentrée)|Pic de **conversion**|
|**Décembre**|Nostalgie + cadeaux|Pic **Wrapped** + **impression 3D**|

Le produit a donc trois moments de campagne naturels par an. C'est rare et il faut construire le calendrier autour.

---

## 5. Paysage concurrentiel

### 5.1 Cartographie

|Catégorie|Acteurs|Modèle|Menace|
|---|---|---|---|
|**Cartes web live**|BlueMap, Dynmap, squaremap, Pl3xMap|Open source, self-hosted, gratuit|**Élevée** (techno proche)|
|**Export 3D desktop**|Mineways, jmc2obj, Chunky|Open source, local, gratuit|Faible (UX experte)|
|**Viewers web de builds**|cubical.xyz, Minemev, Blockical|Freemium / abonnement|Faible (schematics, pas mondes)|
|**Timelapse**|renderlapse, CoreProtect Time-Lapse|Outils CLI, non packagés|**Nulle — c'est l'opportunité**|
|**Tentative disparue**|Remix 3D (Microsoft)|Fermé en janvier 2020|Avertissement historique|

### 5.2 BlueMap — le concurrent adjacent à comprendre

C'est la référence technique et le benchmark visuel. Il génère des modèles 3D de la surface du monde, affichés dans le navigateur via three.js, dans un style de visionneuse type Google Earth. Le projet est très vivant : la v5.23 d'août 2026 cible Java 25 et publie des jars Paper/Folia, Fabric, Forge et NeoForge pour Minecraft 26.1–26.2. Il gère les blocs de resource packs.

**Ses faiblesses, qui définissent ton ouverture :**

- nécessite un serveur allumé, un port HTTP publié, de la configuration ;
- coûte cher en disque sur les gros mondes, au point que certains utilisateurs déportent le webserver sur un VPS avec un backend SQL partagé pour ne pas saturer leur bande passante ;
- **meurt avec le serveur** — or c'est précisément le moment où le besoin apparaît ;
- aucune notion de temps, de souvenir, de galerie ou de partage social ;
- inadapté au public casual.

**Règle de positionnement : ne jamais se présenter comme « BlueMap hébergé ».** Ce serait un combat perdu contre du gratuit, sur leur terrain.

### 5.3 Mineways — la preuve de demande physique

Mineways exporte les créations depuis Minecraft Java (versions 26.2 et antérieures) vers des fichiers 3D utilisables pour des images, des films ou des impressions 3D. Il dispose d'un mode d'export dédié à l'impression qui fusionne les blocs adjacents, retire les faces internes et scelle les ouvertures, et historiquement il servait de pont vers des services d'impression 3D.

**Lecture stratégique :** la demande d'objet physique existe depuis plus de dix ans, mais elle reste réservée à ceux qui savent manipuler une GUI austère et un pipeline Blender. Personne ne l'a jamais rendue accessible en un clic.

### 5.4 CoreProtect — le levier caché

CoreProtect est un outil de logging et d'anti-griefing rapide et efficace, conçu pour les gros serveurs, capable de rollback et de restauration, avec stockage SQLite par défaut ou MySQL en option, et aucune configuration requise. Il dispose d'une API publique et d'un écosystème d'add-ons documenté officiellement, qui inclut déjà **CoreProtect Time-Lapse**, un outil qui parcourt automatiquement les logs historiques pour aider à créer un timelapse de n'importe quelle durée.

**Implication majeure :** sur tout serveur Paper/Spigot équipé de CoreProtect — c'est-à-dire l'immense majorité des serveurs sérieux — l'historique complet des changements de blocs est **déjà enregistré**. Le produit « timelapse » peut donc être livré **rétroactivement**, dès la première connexion, sans qu'aucun snapshot n'ait jamais été programmé.

Argument commercial qui en découle : _« Branche ton CoreProtect. On te rend les six derniers mois de ton serveur, en animation, en deux minutes. »_

L'équivalent côté modded/Fabric existe (Ledger et assimilés), donc l'approche couvre les deux écosystèmes.

### 5.5 Remix 3D — l'échec à comprendre

Microsoft a tenté une version de cette idée : une communauté 3D navigable depuis le navigateur, avec un support intégré dans Minecraft Windows 10 permettant d'utiliser les structure blocks pour sélectionner des parties du monde et les exporter. Le service a été fermé le 10 janvier 2020.

**Hypothèse d'échec :** Remix 3D était un **dépôt de modèles**, pas un **service de mémoire**. Il n'offrait aucune raison de revenir : pas de temporalité, pas de dimension collective, pas de rattachement à une histoire vécue. L'objet était là, l'émotion n'y était pas.

### 5.6 Synthèse : le trou dans le marché

```
                      ÉPHÉMÈRE                      PERMANENT
                          │                              │
    TECHNIQUE    BlueMap, Dynmap ────────────── Mineways, jmc2obj
                 (carte live, meurt             (export local, expert,
                  avec le serveur)               fichier sur un disque)
                          │                              │
    ───────────────────────┼──────────────────────────────┼──────────────
                          │                              │
    GRAND PUBLIC    cubical.xyz,              ███  ZONE VIDE  ███
                    Minemev, Blockical         Capsule souvenir hébergée,
                    (schematics, builds)       temporelle, partageable
```

La case est vide. Microsoft y a échoué une fois — pour des raisons identifiables et évitables.

---

## 6. Analyse des risques

### 6.1 Risque juridique / plateforme — **modéré, gérable**

Les guidelines Minecraft imposent d'afficher un avertissement visible indiquant que le produit, service ou événement n'est pas officiel et n'est ni approuvé par ni associé à Mojang ou Microsoft. Elles précisent également que Minecraft peut révoquer toute permission à tout moment s'il le juge approprié, ou simplement s'il n'apprécie pas ce qui est fait.

**Mitigations obligatoires dès le jour 1 :**

- ne jamais inclure « Minecraft » (ni une variation évidente) dans le nom de marque ou le domaine ;
- disclaimer explicite en pied de page de chaque page publique — c'est exactement ce que fait Planet Minecraft, qui opère depuis 2010 sans incident ;
- ne revendiquer aucune affiliation, aucun partenariat, aucun endossement ;
- ne pas redistribuer d'assets du jeu ni de jars de mods ; ne produire que des **rendus dérivés** générés à la demande pour l'utilisateur qui possède le monde.

**Risque résiduel :** faible mais non nul et unilatéral. À accepter consciemment, pas à ignorer.

### 6.2 Risque concurrentiel — **le plus sérieux**

Si BlueMap (ou un hébergeur) sort un mode « archive hébergée », le différenciateur technique disparaît du jour au lendemain.

**Mitigation :** ne pas construire l'avantage sur la qualité du rendu, mais sur les trois choses qu'un projet de cartographie open source ne fera pas naturellement : le **timelapse rétroactif**, l'**objet physique**, et la **couche émotionnelle/sociale** (galerie, Wrapped, partage).

### 6.3 Risque de timing d'achat — **structurel**

Le produit se vend au moment où l'utilisateur se désengage. Il paie quand il arrête de jouer — c'est-à-dire quand il cesse de penser au produit. C'est le pire cycle de vente possible.

**Mitigation :** capter pendant la vie du serveur avec un produit gratuit et social (timelapse hebdomadaire, Wrapped), et vendre l'archive comme bénéfice différé. Voir §7.1.

### 6.4 Risque de sur-ingénierie — **le plus probable**

Le problème technique est amusant (parsing binaire, meshing, compression, WebGL), le marché est petit, la marge est fine. C'est la recette classique du projet magnifiquement architecturé et jamais lancé.

**Mitigation :** contrainte dure — une démo publique fonctionnelle en **trois semaines maximum**, même laide, avant toute autre chose.

### 6.5 Risque de coûts d'egress — **sous-estimé**

Le coût dominant n'est pas le stockage ni le CPU, mais la **bande passante sortante**. Une galerie partagée sur un Discord de 500 personnes sert plusieurs Go en quelques heures. Sur un fournisseur facturant l'egress, un seul succès viral peut coûter plus cher qu'un mois de revenus.

**Mitigation :** Cloudflare R2 ou Backblaze B2 (egress gratuit ou quasi nul) dès le premier jour. Décision structurante et irréversible à bas coût si prise tôt.

### 6.6 SWOT

||Positif|Négatif|
|---|---|---|
|**Interne**|**Forces**<br>Besoin réel et vécu · Aucun concurrent direct · Brique technique documentée · Angle timelapse inexploité|**Faiblesses**<br>Marché étroit · Timing d'achat défavorable · Coût technique élevé du support des mods · Projet solo|
|**Externe**|**Opportunités**<br>CoreProtect = donnée gratuite · Nostalgie Minecraft (14 ans de jeu) · Impression 3D · Canal B2B hébergeurs|**Menaces**<br>Révocation Mojang · BlueMap se déplace · Egress viral · Échec historique de Remix 3D|

---

## 7. Recommandations stratégiques

### 7.1 Recommandation n°1 — Inverser la proposition de valeur

**Problème.** Vendre de la nostalgie à des gens qui ne sont pas encore nostalgiques ne fonctionne pas. Quand ils le deviennent, ils ne pensent plus à Minecraft depuis six mois et ne trouveront jamais le service.

**Solution.** Le produit d'entrée doit être consommé **pendant** la vie du serveur, et être **social** plutôt que mémoriel.

```
AVANT (proposé initialement)          APRÈS (recommandé)
────────────────────────────          ──────────────────────────────
Entrée : snapshot 2 €                 Entrée : timelapse partageable (gratuit)
Premium : timelapse 5 €/mois          Boucle : Wrapped annuel (gratuit)
Moment : fin de serveur               Premium : archive permanente + HD
Émotion : nostalgie                   Extra : objet physique
                                      Moment : pendant le serveur
                                      Émotion : fierté, puis nostalgie
```

On vend de la **vanité maintenant** et on livre de la **nostalgie plus tard**. La nostalgie ne se vend pas, elle se récolte.

### 7.2 Recommandation n°2 — Cibler l'admin, pas le joueur

Un serveur entre amis = **un payeur pour cinq à dix utilisateurs exposés**. L'admin a déjà l'habitude de payer (hébergement), il a accès aux fichiers, et il porte le sentiment de responsabilité envers le groupe.

Conséquences concrètes :

- le pricing est **par serveur**, jamais par joueur ;
- l'onboarding cible un profil qui sait déjà installer un plugin ;
- le canal d'acquisition est r/admincraft, Modrinth et les Discords de serveur — pas les réseaux grand public ;
- le produit doit rendre l'admin **héroïque auprès de son groupe** (« regardez ce que j'ai fait pour nous »).

### 7.3 Recommandation n°3 — Les trois multiplicateurs

Sans eux, le plafond est à ~30 k€/an. Avec, l'ordre de grandeur change.

**Multiplicateur A — Le produit physique (×3 à ×5 sur le CA)**

Le mesh nettoyé existe déjà dans le pipeline. Un mode « watertight » (fusion des blocs adjacents, suppression des faces internes, fermeture des ouvertures — exactement ce que fait Mineways) permet de proposer :

> _« Commander cette base imprimée en résine colorée — 39 € »_

- ticket 20× supérieur à l'abonnement mensuel ;
- marge réelle de 30–50 % via un service d'impression à la demande en marque blanche ;
- aucun stock, aucune logistique propre ;
- pic saisonnier naturel : Noël, fin de saison, anniversaire de serveur.

**Multiplicateur B — Le « Wrapped » annuel (acquisition organique)**

Chaque décembre, chaque serveur connecté reçoit automatiquement une rétrospective animée :

- blocs posés et cassés, par joueur ;
- le plus gros builder, le plus gros mineur, le plus gros destructeur ;
- évolution de la base principale en timelapse ;
- la nuit où tout le monde était connecté en même temps ;
- le biome le plus fréquenté, la mort la plus stupide.

Gratuit, généré automatiquement, partageable en un clic. Spotify a démontré que ce format est le meilleur véhicule d'acquisition organique jamais conçu pour un produit de données personnelles. **Et toute la donnée est déjà dans CoreProtect.**

**Multiplicateur C — Le canal B2B hébergeurs (×10 sur la distribution)**

Les hébergeurs (Aternos, Minehut, FalixNodes, Minefort, ScalaCube côté gratuit, et des dizaines côté payant) possèdent déjà les fichiers, les utilisateurs, le moyen de paiement et le panel de contrôle. Ils cherchent tous une fonctionnalité de différenciation.

Un bouton « Memories » intégré chez **un seul** hébergeur de taille moyenne vaut deux ans d'acquisition organique. Modèle : revenue share ou licence white-label. À chasser dès qu'une démo convaincante existe.

### 7.4 Recommandation n°4 — Les quatre axes de différenciation à tenir

|Axe|Contenu|Défendabilité|
|---|---|---|
|**Timelapse rétroactif**|Reconstruction de l'historique via CoreProtect/Ledger, sans snapshot préalable|**Très élevée** — personne ne le fait en SaaS|
|**Indépendance aux mods**|Export client-side des meshes déjà bakés par le jeu|**Élevée** — barrière technique réelle|
|**Zéro infrastructure**|Ni port, ni VPS, ni Docker, ni reverse proxy|Moyenne — copiable|
|**Objet et émotion**|Galerie, permalien, Wrapped, impression 3D|Moyenne mais cumulative|

---

## 8. Modèle économique révisé

### 8.1 Pourquoi abandonner le 2 €

|Problème|Détail|
|---|---|
|Frais de paiement|Stripe : ~0,25 € fixe + 1,5 % → **~14 % du ticket**|
|Dette d'exploitation|Stockage « à vie » contracté pour 1,70 € net|
|Friction psychologique|Le micro-paiement déclenche une décision d'achat pour un montant dérisoire — le taux de conversion du gratuit est supérieur, à coût marginal comparable|
|Signal de valeur|Un prix très bas suggère un produit jetable, ce qui contredit frontalement la promesse de permanence|

### 8.2 Grille recommandée

|Offre|Prix|Rôle stratégique|
|---|---|---|
|**Snapshot découverte**<br>1 zone, rétention 12 mois, résolution standard|**Gratuit**|Acquisition, viralité, preuve de valeur|
|**Wrapped annuel**<br>Rétrospective automatique du serveur|**Gratuit**|Acquisition saisonnière, rétention|
|**Serveur**<br>Zones illimitées, timelapse, rétention permanente, HD, domaine perso|**4,99 €/mois ou 39 €/an**|Revenu récurrent — payé par l'admin|
|**Archive à vie**<br>Mesh figé, permalien garanti, export `.glb` téléchargeable|**19 € (paiement unique)**|Le vrai produit nostalgie, sans dette perçue|
|**Impression 3D**<br>Résine couleur, 3 tailles|**39 € / 79 € / 149 €**|Marge, pic saisonnier, cadeau|

### 8.3 Structure de coûts (ordres de grandeur)

|Poste|Coût|Commentaire|
|---|---|---|
|CPU meshing|Négligeable|Quelques secondes à minutes, en worker asynchrone|
|Stockage (R2/B2)|~0,015 $/Go/mois|Un monde archivé ≈ 5–20 Mo → ~0,003 €/an/monde|
|**Egress**|**0 sur R2/B2**|**Le piège à éviter — jamais S3 standard**|
|Paiement|~2–14 %|Décroît fortement avec la taille du ticket|
|Impression 3D|50–70 % du prix|Sous-traitance marque blanche|

**Seuil de rentabilité opérationnelle : très bas.** Le projet peut tourner à quelques dizaines d'euros par mois d'infrastructure jusqu'à plusieurs milliers de mondes archivés. Le coût réel du projet est le **temps de développement**, pas l'infrastructure.

---

## 9. Plan go-to-market

### Phase 0 — L'artefact de preuve (semaines 1–3)

**Un seul livrable :** une page publique montrant **ton propre monde**, explorable, avec le slider temporel si possible.

Pas de landing page marketing. Pas de pricing. Pas d'inscription. Juste l'objet.

**Critère de décision :** si tu ne ressens rien en revoyant ton monde, et si trois amis à qui tu l'envoies ne répondent pas dans la minute, **arrête le projet ici**. Tout le reste du plan repose sur la charge émotionnelle de cette démo.

### Phase 1 — Les admins (mois 1–3)

|Canal|Tactique|Pourquoi|
|---|---|---|
|**Modrinth + Hangar**|Publier le plugin/mod gratuitement|Canal de distribution n°1, gratuit, fournit des statistiques d'usage|
|**r/admincraft** (150 k membres)|Post **technique**, pas promotionnel : « comment j'ai reconstruit 8 mois d'historique CoreProtect en timelapse 3D », avec le code|Cette communauté récompense la technique et punit le marketing|
|**Écosystème CoreProtect**|Faire figurer l'add-on dans la page officielle des intégrations tierces|Audience parfaitement qualifiée, gratuite, durable|
|**Discords de serveurs**|Identifier 50 SMP entre amis, offrir la rétrospective de saison gratuitement|Chaque livraison expose 6–10 joueurs|

### Phase 2 — Les joueurs (mois 3–9)

|Canal|Tactique|
|---|---|
|**Micro-créateurs**|Contacter 20 YouTubers/TikTokers FR+EN de 10–100 k abonnés (pas les gros). Format garanti : _« j'ai retrouvé le serveur qu'on avait fait au lycée »_. Offrir le service à vie contre un lien en description|
|**Embed Discord**|Générer automatiquement une carte postale isométrique PNG pour les balises OpenGraph. **Canal viral principal** — soigner autant que le rendu 3D|
|**Reddit grand public**|r/Minecraft, r/feedthebeast, r/MinecraftBuilds — en montrant des mondes, jamais en vendant|
|**Saisonnalité**|Campagnes calées sur juin / septembre–octobre / décembre (§4.3)|

### Phase 3 — La distribution (mois 9+)

Pitch aux hébergeurs, avec les statistiques d'usage de la phase 1 comme preuve sociale. Cibler d'abord les hébergeurs de taille moyenne, plus accessibles et plus demandeurs de différenciation que les leaders.

### Ce qui ne marchera pas

- **Google Ads** — CPC élevé sur les mots-clés Minecraft, intention d'achat nulle
- **Planet Minecraft** — audience de créateurs de maps, pas de joueurs nostalgiques
- **App Store / Play Store** — mauvais contexte d'usage, coût de développement disproportionné
- **Partir du site web** — construire le marketing avant l'objet est le mode d'échec le plus courant

---

## 10. Spécification technique préliminaire

### 10.1 Architecture générale

```
┌─────────────────────────────────────────────────────────────────┐
│  SOURCES DE DONNÉES                                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  A. Mod client (Fabric/NeoForge)    B. Plugin serveur (Paper)   │
│     → meshes déjà bakés                → région files + CoreProtect
│     → résout les mods                  → timelapse rétroactif   │
│                                                                 │
│  C. Upload .zip (mondes morts)                                  │
│     → parsing Anvil + résolution assets via manifest            │
└────────────────────────────┬────────────────────────────────────┘
                             │  HTTPS (chunks compressés)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  API D'INGESTION (Rust/Axum ou Go)                              │
│  Authentification · quotas · mise en file                       │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  WORKERS DE MESHING (Rust)                                      │
│  1. Flood fill externe    → coquille visible seulement          │
│  2. Greedy meshing        → fusion des quads coplanaires        │
│  3. Atlas de textures     → packing + KTX2/Basis                │
│  4. LOD (3 niveaux)       → décimation par distance             │
│  5. Export glTF + meshopt → .glb final                          │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  STOCKAGE                                                       │
│  Cloudflare R2 / Backblaze B2  (egress gratuit — critique)      │
│  PostgreSQL : métadonnées, utilisateurs, index temporel         │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  FRONTEND (three.js + React)                                    │
│  Galerie · visionneuse 3D · slider temporel · partage OG        │
└─────────────────────────────────────────────────────────────────┘
```

### 10.2 Le problème des mods — trois chemins

**Chemin A — Mod companion client-side (recommandé, prioritaire)**

Le client Minecraft a **déjà** chargé et baké tous les modèles de tous les mods en mémoire, avec l'atlas de textures assemblé. Un mod d'export peut donc récupérer directement la géométrie finale, sans jamais avoir à savoir ce qu'est un mod.

- ✅ Support des mods **total et gratuit**
- ✅ Pas d'upload de plusieurs Go
- ✅ Sélection de zone in-game naturelle
- ✅ Textures et modèles exacts, y compris blocs custom, connected textures, resource packs
- ❌ Nécessite que le joueur lance le jeu (inadapté aux mondes morts)
- ❌ Deux builds à maintenir (Fabric, NeoForge)

**Chemin B — Plugin serveur (Paper/Spigot)**

Lecture directe des région files côté serveur + accès à CoreProtect pour l'historique.

- ✅ L'admin installe une seule fois, tout le serveur en bénéficie
- ✅ **Seul chemin donnant accès au timelapse rétroactif**
- ❌ Sur serveur modded, les blocs de mods ne sont pas résolus côté serveur → repli nécessaire

**Chemin C — Upload de sauvegarde (mondes morts)**

- Parsing du format Anvil (`.mca`) et du NBT
- Lecture du `level.dat` pour la version et la liste des mods
- Résolution des assets via manifest CurseForge/Modrinth → téléchargement des jars → extraction de `assets/*/models/`, `blockstates/`, `textures/`
- **Repli progressif** si un mod est introuvable :
    1. couleur moyenne de la texture si le mod est partiellement disponible
    2. couleur déterministe dérivée du hash de l'identifiant de bloc
    3. cube gris neutre

> Un monde reconnaissable à 95 % vaut infiniment mieux qu'un message d'erreur.

**Ordre d'implémentation : C (prototype) → A (produit) → B (différenciation).** Le chemin C sert à valider le pipeline sur ses propres sauvegardes, sans dépendance externe.

### 10.3 Pipeline de meshing — détail

|Étape|Technique|Gain attendu|
|---|---|---|
|**1. Flood fill externe**|BFS depuis les faces de la boîte englobante, marquage de l'air accessible ; on ne conserve que les blocs adjacents à cet air|**×50 à ×150** — l'optimisation la plus rentable|
|**2. Culling de faces**|Suppression de toute face dont le voisin est opaque|×2 à ×6|
|**3. Greedy meshing**|Fusion des quads coplanaires de même texture et même orientation|×5 à ×50 selon la régularité des builds|
|**4. Atlas**|Packing des textures utilisées, `NearestFilter` obligatoire, compression KTX2/Basis|×4 sur le poids textures|
|**5. LOD**|3 niveaux : full / demi-résolution / silhouette colorée|Chargement progressif|
|**6. Compression**|glTF binaire + `meshoptimizer` (préférable à Draco pour la géométrie voxel)|×3 à ×5|

**Cible de performance**

|Zone|Blocs bruts|Triangles après pipeline|Poids `.glb`|
|---|---|---|---|
|Petite base (64³)|260 k|~15 k|0,5–2 Mo|
|Base moyenne (256×256×128)|8,4 M|~120 k|**2–8 Mo**|
|Grande zone (512×512×256)|67 M|~600 k|15–40 Mo (LOD obligatoire)|

**Point d'attention critique :** `NearestFilter` sur toutes les textures. Un filtrage linéaire transforme le pixel art Minecraft en bouillie et détruit l'identité visuelle du produit. C'est le détail qui distingue un rendu qui émeut d'un rendu qui déçoit.

### 10.4 Modèle de données temporel (timelapse)

**Ne jamais stocker N meshes complets.** Une offre à snapshots horaires génèrerait 720 états par mois — ingérable et ruineux.

**Modèle retenu : base + patchs de blocs**

```
monde_id/
├── base.glb                 ← état T0, mesh complet
├── atlas.ktx2               ← textures, partagé par tous les états
├── timeline.json            ← index des événements et checkpoints
└── patches/
    ├── 0001.bin             ← diff de blocs (position, ancien_id, nouvel_id)
    ├── 0002.bin
    └── ...
```

**Reconstruction côté client :**

1. charger `base.glb` + `atlas.ktx2` ;
2. appliquer les patchs jusqu'à l'instant T demandé ;
3. re-mesher **uniquement les chunks touchés**, dans un Web Worker ;
4. remplacer les sous-meshes correspondants dans la scène.

**Checkpoints :** un mesh complet tous les ~200 patchs, pour éviter une reconstruction linéaire depuis l'origine sur les longs historiques.

**Ingestion depuis CoreProtect :**

```sql
-- Schéma conceptuel : chaque changement est déjà horodaté et attribué
SELECT time, user, x, y, z, type, action
FROM co_block
WHERE x BETWEEN ? AND ? AND z BETWEEN ? AND ?
ORDER BY time ASC;
```

C'est exactement la structure d'un flux de patchs. **La conversion est quasi directe** — c'est ce qui rend le multiplicateur timelapse aussi peu coûteux à implémenter.

### 10.5 Détection automatique des zones intéressantes

Fonctionnalité UX à fort impact, techniquement simple.

**Algorithme :**

1. Pour chaque chunk, calculer un **score d'artificialité** :
    - poids fort : blocs jamais générés naturellement (planches, verre, blocs de minerai, béton, laine, redstone, torches…)
    - poids moyen : blocs naturels dans une disposition improbable (pierre à Y>100, géométrie régulière détectée)
    - poids négatif : chunks purement générés
2. Construire une heatmap et appliquer un lissage gaussien
3. Extraire les maxima locaux, agréger en clusters par flood fill sur le seuil
4. Générer une boîte englobante par cluster, avec marge de 16 blocs
5. Présenter : _« On a trouvé 6 constructions dans ton monde »_, avec vignettes et cases à cocher

**Bénéfice UX :** le joueur ne sélectionne rien, il **valide**. C'est probablement la fonctionnalité qui fait la différence entre un outil d'admin et un produit grand public.

### 10.6 Parcours utilisateur cibles

**Parcours A — Depuis le jeu (chemin principal)**

```
/memories
  → un cadre holographique apparaît autour du joueur
  → molette : agrandir / réduire   ·   Shift+molette : hauteur
  → clic droit : valider
  → "Envoi en cours… 12 %"
  → chat : "✅ Ton souvenir est prêt : mem.link/a7f3k"
```

Zéro coordonnée à taper. Zéro fichier à manipuler. Zéro compte requis pour créer.

**Parcours B — Depuis le web (mondes morts)**

```
Glisser-déposer le dossier world (ou le .zip)
  → analyse automatique : version, mods détectés, zones construites trouvées
  → "On a trouvé 6 constructions" → cases à cocher + vignettes
  → génération → galerie
```

**Parcours C — Le visiteur (le plus important pour la viralité)**

```
Lien Discord → embed avec carte postale isométrique
  → clic → visionneuse 3D, aucun compte requis, chargement < 3 s
  → slider temporel visible immédiatement
  → bouton "Créer le souvenir de mon serveur"
```

### 10.7 Stack technique proposée

|Couche|Choix|Justification|
|---|---|---|
|Mod client|**Fabric + NeoForge** (Java)|Couvre l'essentiel de l'écosystème modded actuel|
|Plugin serveur|**Paper** (Java)|Accès à l'API CoreProtect|
|Parsing + meshing|**Rust** (`fastanvil`, `fastnbt`, `meshopt`)|Performance critique, déploiement en binaire unique|
|API|**Rust/Axum** ou **Go**|Cohérence avec les workers, faible empreinte|
|File d'attente|**Redis** ou **NATS**|Simplicité|
|Base|**PostgreSQL**|Métadonnées, index temporel, utilisateurs|
|Stockage objet|**Cloudflare R2**|**Egress gratuit — décision non négociable**|
|Frontend|**React + three.js + `@react-three/fiber`**|Écosystème mature pour glTF/KTX2|
|Paiement|**Stripe**|Standard|

### 10.8 Formats de fichiers concernés

|Format|Rôle|Bibliothèques|
|---|---|---|
|`.mca` (Anvil)|Région files, 32×32 chunks|`fastanvil` (Rust), `anvil-parser` (Python)|
|NBT / `level.dat`|Métadonnées de monde, version, mods|`fastnbt`, `prismarine-nbt`|
|`.jar` (mods)|Extraction d'assets (chemin C)|`zip` + parsing JSON blockstates|
|`.glb`|Livrable 3D|`gltf` (Rust), `GLTFLoader` (three.js)|
|`.ktx2`|Textures compressées GPU|`basis_universal`|
|SQLite/MySQL|Base CoreProtect|Lecture seule, jamais d'écriture|

### 10.9 Sécurité et confidentialité

- Les mondes contiennent des **pseudonymes, des coordonnées, du texte sur panneaux et livres** — donc des données potentiellement personnelles. RGPD applicable.
- Galeries **privées par défaut**, partage explicite par lien non devinable (UUID v4).
- Ne jamais indexer les galeries privées ; `robots.txt` et `noindex` par défaut.
- Option d'anonymisation des pseudonymes dans les timelapses.
- Suppression complète sur demande, en un clic, sans e-mail à écrire.
- Validation stricte des uploads : un `.zip` uploadé est une surface d'attaque (zip bombs, path traversal). Extraction en sandbox, quotas durs.

---

## 11. Roadmap

### Jalon 0 — Preuve émotionnelle (3 semaines) 🎯

- [ ] Parser `.mca` vanilla en Rust, sur une sauvegarde personnelle
- [ ] Flood fill externe + greedy meshing + atlas
- [ ] Export `.glb`
- [ ] Visionneuse three.js minimale, déployée sur une URL publique
- [ ] **Test :** l'envoyer à 3 amis ayant joué sur ce serveur

**Critère go/no-go :** réaction émotionnelle immédiate, ou arrêt du projet.

### Jalon 1 — Validation du différenciateur (semaines 4–6)

- [ ] Lire une base CoreProtect et reconstruire l'état d'une zone à une date donnée
- [ ] Générer une animation de 30 secondes montrant l'évolution d'une base
- [ ] **Critère :** si la reconstruction fonctionne, le produit a un angle unique

### Jalon 2 — Produit minimal (mois 2–4)

- [ ] Mod Fabric d'export client (résout les mods)
- [ ] API d'ingestion + workers + R2
- [ ] Galerie web + permaliens + embeds OpenGraph
- [ ] Détection automatique des zones
- [ ] Stripe

### Jalon 3 — Lancement (mois 4–6)

- [ ] Publication Modrinth
- [ ] Post technique r/admincraft
- [ ] 50 rétrospectives offertes à des Discords de serveurs
- [ ] Intégration à la page d'add-ons CoreProtect

### Jalon 4 — Multiplicateurs (mois 6–12)

- [ ] Wrapped annuel (livrer avant décembre — deadline dure)
- [ ] Mode watertight + partenariat impression 3D
- [ ] Prise de contact hébergeurs
- [ ] Support NeoForge + plugin Paper

---

## 12. Décisions ouvertes

Points à trancher avant le jalon 2 :

1. **Open source ou propriétaire ?** Un modèle open-core (mod client open source, service hébergé propriétaire) accélère massivement l'adoption sur Modrinth et la confiance des admins, au prix du risque de fork. **Penchant recommandé : open-core.**
    
2. **Bedrock, oui ou non ?** Format de monde différent (LevelDB), communauté de mods marginale, public plus jeune. **Recommandation : non, au moins jusqu'au jalon 4.**
    
3. **Nom et marque.** Contrainte absolue : ne pas contenir « Minecraft », ni « craft », ni « mine » de façon trop évocatrice. « Minemories » est probablement trop proche — à réévaluer juridiquement.
    
4. **Gratuit à vie ou rétention limitée ?** La promesse de permanence est le cœur émotionnel du produit, mais elle crée une dette. Piste : rétention gratuite de 12 ans (durée de vie plausible du service), présentée honnêtement.
    
5. **Qui construit ?** Projet solo réalisable jusqu'au jalon 3, mais le mod client Java et le backend Rust sont deux compétences distinctes. Envisager un associé technique ou limiter le scope initial au chemin C.
    

---

## 13. Sources

**Outils et projets étudiés**

- BlueMap — https://github.com/BlueMap-Minecraft/BlueMap
- Dynmap, squaremap, Pl3xMap — comparatif 2026 : https://blog.berrybyte.net/dynmap-vs-bluemap-vs-squaremap-which-map-plugin-is-best-for-your-minecraft-server/
- Mineways — https://www.realtimerendering.com/erich/minecraft/public/mineways/
- CoreProtect — https://modrinth.com/plugin/coreprotect
- CoreProtect Time-Lapse — https://modrinth.com/plugin/cptl
- Intégrations CoreProtect — https://docs.coreprotect.net/tools-integrations/
- renderlapse — https://github.com/moon44432/renderlapse
- cubical.xyz, Minemev, Blockical — visionneuses web de builds
- Remix 3D (fermé en 2020) — https://en.wikipedia.org/wiki/Remix_3D

**Données de marché**

- Statistiques Minecraft 2026 — https://www.demandsage.com/minecraft-statistics/
- Statistiques serveurs 2026 — https://dathost.com/blog/minecraft-server-player-count-statistics-2026
- Aternos et hébergement gratuit — https://www.oak-servers.com/blog/free-minecraft-server-hosting/
- r/admincraft — 150 270 membres

**Cadre juridique**

- Minecraft Usage Guidelines — https://www.minecraft.net/en-us/usage-guidelines

---

_Ce document est un support de décision, pas un plan d'exécution figé. Les estimations de marché sont des ordres de grandeur dérivés de sources publiques et doivent être validées par les premiers chiffres d'usage réels._

_Ce projet n'est pas un produit Minecraft officiel. Il n'est ni approuvé par, ni associé à Mojang ou Microsoft._