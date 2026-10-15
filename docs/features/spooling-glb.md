# Captures AFK progressives et writer GLB sur disque

Les captures AFK utilisent maintenant `ProgressiveGameCapture` sur le client et
`QueuedGlbCapture` dans un worker. `SpoolingGlbScene`, dans `:core`, écrit le GLB
sans conserver toute sa géométrie en heap. Le parcours manuel conserve son writer
legacy : une demande manuelle arrête d’abord le travail AFK et demande de réessayer
après son arrêt, sans exporter deux scènes simultanément.

## Lecture par frames et préparation en arrière-plan

Le client parcourt progressivement la surface, les cellules et les entités. Une
frame admet au plus 4 096 opérations et arrête les nouvelles admissions après
2 ms. Une lecture de modèle, de colonne ou de bande GPU reste indivisible : le
budget ne constitue pas une limite absolue de freeze. Les dépassements et le temps
maximal de travail sont enregistrés dans le log local à la fin de la capture.

`CaptureElement` copie un bloc/renderer, sans références au monde, avec un budget
conservateur de 2 Mio et 8 192 primitives tentées. La pompe conserve cet élément
jusqu’à son admission complète ; la backpressure ne fait perdre aucune géométrie.
Les sprites et textures de renderers sont copiés sur le thread du client par bandes
d’au plus 16 384 pixels. Le framebuffer de lecture temporaire restaure framebuffer,
buffer de lecture, texture et réglages PACK/PBO, même en erreur.

La file contient au plus seize paquets ; un paquet géométrique contient au plus
64 quads et 128 lumières. Le worker accepte au total 4 095 lumières,
avec un nœud de mesh pour rester dans les 4 096 nœuds du validateur commun.
Les scènes riches en torches ne sont donc pas limitées aux 128 lumières du
writer legacy ; le viewer garde son propre plafond de lumières actives. Le worker ne reçoit que des tableaux copiés et des
descripteurs immuables. Il assemble/encode un PNG à la fois, conserve les sources
sur disque et utilise `SpoolingGlbScene`. Alpha, teintes, couches secondaires et
lumières restent conservés. Aucun monde, modèle ou renderer n’est utilisé par le
worker. Les fichiers datés sont publiés uniquement après préparation complète.

Le contrôle tourne en pause et en arrière-plan. Le retour du joueur suspend les
lectures ; elles reprennent après le délai d’inactivité configuré. Désactivation,
changement de réglages/API/compte, monde/dimension/joueur ou rechargement des
ressources annulent le travail. Les chunks déjà lus doivent conserver leur
identité jusqu’à la fin ; un déchargement/remplacement refuse la capture. Il n’y
a jamais de file de captures concurrentes. Une capture complète déjà publiée
reste conservée, même si son contexte change avant la notification.

Le statut « capture en cours / en pause / arrêt » apparaît dans les deux modes du
menu M. Après appairage, l’envoi AFK est séquentiel et limité à **512 Kio/s**, par
lectures HTTP de 16 Kio, sans crédit de débit accumulé pendant les attentes.
API/identité/réglages et sortie du monde sont vérifiés pour arrêter cet envoi ;
le GLB local et l’état de reprise sont conservés. L’envoi manuel reste inchangé.

Les métadonnées `captureStartedAt`/`captureFinishedAt` encadrent la lecture et
l’écriture réelle. Les anciennes captures restent compatibles. Il s’agit d’une
capture sur une période, pas d’un état atomique de tous les blocs/entités : les
poses et atlas animés peuvent évoluer entre leurs lectures.

`CaptureWorkspace` verrouille les espaces entre processus. Avant un nouveau
travail, le worker nettoie les spools abandonnés dont les noms et identités sont
reconnus, avec un inventaire borné. Un travail actif, un lien, une entrée inconnue
ou un GLB complet sont préservés. Un vrai processus arrêté brutalement est exercé
par les tests. La lecture d’un historique déjà publié ne bloque pas derrière la
préparation d’un autre GLB.

## Validation du raccordement

Les 14 et 15 octobre 2026, le JAR `0.1.1-dev.1` seul a été chargé dans Minecraft 1.21.1 /
NeoForge 21.1.248, sur une copie isolée. SHA-256 du JAR final :
`4d10773982896e19920fea0aa2b49bbe7406bbb3e12b76900eb1d95209fbe3bf`
(254 048 octets). Le test exerce pause, focus client désactivé, suspension/reprise,
réglage AFK désactivé, vrai reload de ressources, chunk déchargé et déconnexion
avec conservation de l’historique. Les états PACK/PBO/framebuffer/buffer de lecture
sont contrôlés pendant la capture ; les écrans simple/avancé sont inspectés.

Deux scènes sont mesurées sur Mesa llvmpipe, avec textures standards et entités :

| Scène | Export synchrone | Plus longue étape AFK | Capture progressive |
| --- | --- | --- | --- |
| Rayon 32, 77 744 quads, 74 textures | 765 ms | 3,83 ms (13 dépassements du budget) | 187,6 s avec suspension et focus désactivé |
| Rayon 8, 6 141 quads, 22 textures, avant consolidation | 93 ms | 4,00 ms (2 dépassements) | 26,3 s ; environ 3 s supplémentaires pour l’envoi |

Ces mesures précèdent la consolidation des correctifs distants. Le JAR consolidé
réexerce tous les scénarios : 225 torches dans la zone, 12 194 quads, 23 textures
et 225 lumières conservées. L’export synchrone prend 105 ms, la plus longue étape
AFK 3,44 ms (5 dépassements), pour 83,3 s de capture et environ 4 s d’envoi.
Le validateur commun et l’API réelle acceptent ce fichier de 2 288 976 octets.
Le contrôle du contexte avant notification est aussi exercé. Les pas se limitent
à la capture, pas au temps complet d’une frame : rendu logiciel, limitation FPS,
menus, GC et autres mods restent visibles dans les latences totales. Ces résultats
ne garantissent pas les mêmes performances sur tous les matériels/modpacks.

Les sept GLB de la grande scène, les six de l’essai avec contrôle de contexte
et les six de l’essai consolidé à 225 lumières passent le validateur
commun API/viewer. Blender importe les rendus avant/après : même géométrie, même
nombre de matériaux et de textures. Sur la grande scène, les accessors de géométrie
sont identiques octet pour octet ; 73 images sont identiques après décodage, l’atlas
animé de blocs change pendant la période de capture. Le GLB de 1 329 204 octets et le GLB consolidé de 2 288 976 octets
sont envoyés à une API loopback réelle via appareil appairé, avec SHA-256 identique
côté stockage et dates conservées via oRPC. Aucun diagnostic n’est collecté sans
accord. Cette validation locale ne prouve pas le déploiement de l’API en production
ni la compatibilité de tous les renderers de modpacks.

Les tests couvrent budgets/admission, ordre textures-géométrie, backpressure,
annulation, crash/nettoyage, images, horodatages et refus sans écrasement. Un test
HTTP mesure le publisher réellement cadencé et l’arrêt avant finalisation lorsque
son contexte change. `bun run build` passe avec les seuils de couverture et SpotBugs.
La beta publiée et les profils CurseForge installés ne sont pas remplacés par ce
JAR de développement.

## Propriété des données et publication

Le constructeur crée un dossier temporaire privé sous le parent choisi. Le
builder appartient à un seul thread ; il ne synchronise pas des appels concurrents.
`addQuad` accepte les mêmes informations primitives que `GlbScene` et consomme
les tableaux avant son retour. Le caller peut ensuite les réutiliser. Les PNG,
positions, normales, UV et indices sont écrits dans des fichiers du spool, sans
conserver les tableaux fournis. Les chaînes sont immuables et leur taille est
contrôlée avant admission. Aucun objet du monde, modèle, renderer ou atlas n’est
accepté. Ces méthodes font de l’I/O : le pipeline les appelle dans son
worker, après copie des données du jeu sur le thread du client.

Un cache LRU limite les streams ouverts ; la copie finale ouvre seulement la
sortie et une entrée à la fois. Le compteur `peakOpenFiles` comprend les créations
de fichiers et cette phase. Un quad utilise 152 octets de données binaires avant
texture et JSON. Les buffers sont fixes : 152 octets pour l’encodage d’un quad,
64 Kio pour la copie, 8 Kio par stream de spool et 64 Kio pour la sortie finale.
Les descriptions, bornes et compteurs restent en mémoire, bornés par les limites
d’entrées et de chaînes. Le builder ne conserve ni BIN complet ni GLB complet.
La mémoire des tableaux entrants et de leur production doit être bornée par le
pipeline client ; ce builder ne limite pas une allocation déjà faite par le caller.

`write` ferme le cache, vérifie les identités et tailles réelles des fichiers,
prépare le JSON sur disque puis copie les segments dans un fichier temporaire à
côté de la destination. Le remplacement final demande `ATOMIC_MOVE` ; son refus
est une erreur, sans fallback qui supprimerait le fichier précédent. Le système
de fichiers du spool doit fournir des identités de fichiers. Les links et les
remplacements de dossier ou de fichiers sont refusés. La publication ne fait pas
un `fsync` de chaque fichier ; elle ne constitue pas une garantie contre une
coupure électrique.

Une erreur d’I/O, limite dépassée ou interruption invalide le builder. Il ne peut
plus accepter ni publier de données. Les fichiers temporaires enregistrés sont
supprimés ; le nettoyage n’entre jamais récursivement dans un dossier inconnu,
un lien ou un dossier remplacé. Les autres suppressions sont tentées même si une
suppression échoue, et `close` permet de réessayer le nettoyage. Les erreurs de
nettoyage remontent au caller. Un fichier publié par un `write` réussi reste
conservé si un nettoyage ultérieur échoue. Un arrêt brutal peut laisser un spool
sur disque : le coordinateur le nettoie avant le prochain travail, selon les
contrôles d’identité et de contenu décrits plus haut.

## Limites et format

`Limits` permet de régler séparément matériaux, textures, lumières, octets UTF-8
par chaîne, octets JSON, octets du spool, octets du GLB final et fichiers ouverts.
Les valeurs par défaut sont 4 096 matériaux, 1 024 textures, 128 lumières,
4 096 octets par chaîne, 4 Mio de JSON, 256 Mio de spool, 200 Mio de GLB et
8 fichiers ouverts. Au moins deux fichiers ouverts sont nécessaires à la copie.
Le spool inclut la taille non paddée du JSON ; la limite du fichier final inclut
headers, alignements, géométrie, JSON et textures. Le pic disque peut atteindre
spool + fichier final, puis les copies de compatibilité réalisées par l’historique.
Le cache du système de fichiers consomme aussi de la mémoire hors heap Java.

Les PNG partagés sont spoolés une seule fois. Un nouveau matériau qui redéfinit
une image avec d’autres octets est refusé. Comme `GlbScene`, le premier descripteur
d’un matériau est conservé pour les quads suivants de cette même clé. Les quads
aux positions/UV non finies et les lumières invalides sont ignorés. Un export sans
géométrie est refusé. Les caps ne suppriment pas silencieusement des matériaux ou
lumières : dépasser une limite invalide la capture entière.

Alpha MASK/BLEND, tint, opacité, textures émissives et `KHR_lights_punctual` sont
conservés. Les soustractions du calcul des normales ont lieu en double avant le
produit vectoriel : même des positions finies extrêmes ne deviennent pas des
normales NaN par overflow d’une soustraction en float.

## Vérification et mesures

Les tests comparent les octets avec `GlbScene` sur plusieurs matériaux, images
partagées, quads entrelacés, indices, UV, normales, alpha, tint, émissivité et
lumières. Les cas extrêmes vérifient les floats binaires des normales. Ils couvrent
les limites exactes, mutation des tableaux après admission, I/O, interruption,
fichiers/dossiers remplacés, nettoyage partiellement refusé, fermeture et refus
de publication sans géométrie. Une régression démarre un vrai processus Java avec
`-Xms16m -Xmx32m` et écrit 600 000 quads, soit un GLB de 91 201 408 octets.

Pour reproduire la mesure après `:core:testClasses` :

```sh
java -Xms16m -Xmx32m -cp core/build/classes/java/main:core/build/classes/java/test \
  dev.minemories.core.SpoolingGlbProbe /tmp/capture-spooled.glb 600000
```

Mesure locale du 13 octobre 2026, JDK 21.0.12.1, fichiers sous `/tmp` : environ
3,57 s pour ce fixture, heap maximale autorisée 32 Mio, heap utilisée observée par
échantillonnage 10 102 752 octets et RSS maximal du processus 82 264 Kio. Le RSS
inclut JVM, bibliothèques et autres allocations natives ; l’échantillonnage ne
mesure pas exactement le pic de heap. Le test utilise une texture minuscule et
une géométrie répétée ; il ne mesure ni capture de modèles Minecraft ni freezes
du client. Ajouter `legacy` comme dernier argument exerce l’ancien builder avec
les mêmes quads et la même heap, pour comparer l’usage mémoire.

`SpoolingGlbFixture` produit un petit terrain, des feuilles avec découpe alpha,
du verre transparent et une lampe. Les GLB legacy/spoolés sont identiques octet
pour octet. Blender 5.2.2 importe chaque fichier avec un mesh, quatre matériaux,
quatre images 2 × 2 et une lumière ; les deux rendus ont été inspectés visuellement.
Cette validation du format ne constitue pas une validation AFK en jeu.


## Coûts détaillés et préparation des métadonnées

Le complément de l’issue #79 ajoute des mesures cumulées par phase client et
worker, sans modifier le budget de 2 ms / 4 096 admissions ni le pacing 512 Kio/s.
Le corpus, le JAR mesuré et les limites d’interprétation sont décrits dans
[Mesures des captures AFK](afk-performance.md). La lecture des icônes de métadonnées
est bornée à 128 Kio, aux en-têtes PNG ≤512×512, et refuse les liens symboliques.

## Taille du livrable

Les indices du fichier final utilisent désormais 8/16/32 bits selon la primitive,
et les texels inutilisés des atlas de renderers peuvent être uniformisés sans
modifier UV, dimensions ou pixels échantillonnés. Le spool d’indices reste 32 bits ;
les limites et la publication atomique restent appliquées. Voir [mesures, coûts,
frontières et validations avant/après](glb-size.md).
