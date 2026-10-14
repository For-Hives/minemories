# Writer GLB sur disque

`SpoolingGlbScene` est un builder du module `:core`, sans dépendance Minecraft.
Il prépare le passage des captures AFK à un parcours progressif. Il ne remplace
pas encore le parcours du mod : la lecture des blocs et des modèles, la queue
bornée, le coordinateur, la suspension et le débit réseau restent à raccorder.

## Propriété des données et publication

Le constructeur crée un dossier temporaire privé sous le parent choisi. Le
builder appartient à un seul thread ; il ne synchronise pas des appels concurrents.
`addQuad` accepte les mêmes informations primitives que `GlbScene` et consomme
les tableaux avant son retour. Le caller peut ensuite les réutiliser. Les PNG,
positions, normales, UV et indices sont écrits dans des fichiers du spool, sans
conserver les tableaux fournis. Les chaînes sont immuables et leur taille est
contrôlée avant admission. Aucun objet du monde, modèle, renderer ou atlas n’est
accepté. Ces méthodes font de l’I/O : le pipeline devra les appeler dans son
worker, après copie des données du jeu sur le thread du client.

Un cache LRU limite les streams ouverts ; la copie finale ouvre seulement la
sortie et une entrée à la fois. Le compteur `peakOpenFiles` comprend les créations
de fichiers et cette phase. Un quad utilise 152 octets de données binaires avant
texture et JSON. Les buffers sont fixes : 152 octets pour l’encodage d’un quad,
64 Kio pour la copie, 8 Kio par stream de spool et 64 Kio pour la sortie finale.
Les descriptions, bornes et compteurs restent en mémoire, bornés par les limites
d’entrées et de chaînes. Le builder ne conserve ni BIN complet ni GLB complet.
La mémoire des tableaux entrants et de leur production doit être bornée par le
futur pipeline ; ce builder ne limite pas une allocation déjà faite par le caller.

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
sur disque : son nettoyage après redémarrage n’est pas encore automatisé.

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
