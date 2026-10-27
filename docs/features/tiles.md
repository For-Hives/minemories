# Tuiles Minemories

Une capture peut être découpée en **tuiles Minemories** : des carrés de N×N chunks
Minecraft alignés sur le monde, chacun exporté dans son propre `.glb`. Ce document
fixe le format commun au mod, à l'API et au viewer. Le comportement historique
(un seul `.glb` par capture) reste le défaut tant que la découpe n'est pas activée.

## Grille

- Une tuile fait `tileChunks` × `tileChunks` chunks, soit `tileBlocks = 16 × tileChunks`
  blocs de côté. `tileChunks` est compris entre 1 et 16 ; la valeur par défaut de la grille est 8
  (128 blocs) ; le mod utilise 4 (64 blocs). Une capture mesure au plus 257 blocs : 16 chunks reste donc la limite.
- Les indices de tuile sont **absolus** : `tx = floor(x / tileBlocks)`,
  `tz = floor(z / tileBlocks)`, arrondi vers le bas aussi pour les coordonnées négatives.
  La grille ne dépend ni de l'origine de la capture ni de la position du joueur.
- La hauteur n'est pas découpée : une tuile est une colonne complète.
- Un quad appartient à la tuile qui contient son **centroïde** horizontal. Les faces
  de la capture ne sont pas modifiées : l'union des tuiles contient exactement les
  quads de la capture, sans face dupliquée ni coupure supplémentaire.

## Repère des sommets

Les sommets d'une tuile sont exprimés par rapport à `(tileMinX, 0, tileMinZ)` où
`tileMinX = tx × tileBlocks`. L'axe Y est donc le Y monde. Les octets d'une tuile ne
contiennent ni origine de capture, ni date, ni identifiant de capture, ni position
du joueur. Pour placer une tuile, le viewer la translate de `(tileMinX, 0, tileMinZ)`
moins l'origine de la capture de référence.

## Déterminisme

Deux captures qui voient les mêmes blocs doivent produire les mêmes octets de tuile :

- dans la scène en mémoire (`TiledGlbScene`), les quads et les lumières sont triés avant
  l'écriture (clé de matériau, puis coordonnées, puis UV), indépendamment de l'ordre
  d'insertion ;
- le chemin en flux (`TiledSpoolingScene`, utilisé par les captures AFK) conserve l'ordre
  d'arrivée. Pour le terrain, cet ordre est déterministe : colonnes parcourues en z puis en x,
  et y croissant. Il ne l'est pas pour les entités, dont l'ordre dépend du parcours
  de la liste d'entités du client ;
- chaque tuile calcule son propre atlas : une texture ajoutée dans une tuile voisine
  ne change pas les UV d'une autre ;
- l'empreinte d'une tuile est le SHA-256 de ses octets `.glb`.

Limite connue : les entités (créatures) font partie de la tuile qui les contient. Une
créature qui bouge change l'empreinte de sa tuile. Un changement de ressources
(atlas Minecraft) change toutes les empreintes.

## Manifeste

JSON UTF-8, tuiles triées par `tx` puis `tz` :

```json
{
	"format": "minemories-tiles-v1",
	"tileChunks": 8,
	"tiles": [
		{ "x": -1, "z": 0, "file": "x-1_z0.glb", "offset": 0, "size": 123456, "sha256": "<64 hex>", "quads": 4200 }
	]
}
```

`offset` est la position de la tuile dans la section de données du bundle ; elle est
calculée à partir des tailles cumulées, dans l'ordre du manifeste. Une tuile sans
géométrie n'est pas écrite. Dans une série (même `zoneId`), les bornes horizontales
sont identiques d'une capture à l'autre : l'absence d'une tuile signifie donc qu'elle
est devenue vide.

## Bundle `.mmtiles`

Un seul fichier, pour conserver l'envoi resumable, le quota et la suppression existants.

| Octets | Contenu |
| --- | --- |
| 0–3 | ASCII `MMTB` |
| 4–7 | version, entier 32 bits little-endian (`1`) |
| 8–11 | longueur du manifeste, entier 32 bits little-endian, multiple de 4 |
| 12… | manifeste JSON, complété par des espaces (`0x20`) jusqu'à un multiple de 4 |
| suite | les `.glb` des tuiles, dans l'ordre du manifeste, sans séparateur |

Chaque `.glb` respecte le contrat existant : autonome, textures embarquées, longueur
multiple de 4, aucun NaN/Infinity. Le serveur ne fait jamais confiance au manifeste :
il recalcule chaque SHA-256, borne les indices et les tailles et valide chaque `.glb`.

## État d'avancement

Voir les issues #145 (découpe côté mod), #146 (stockage et index API), #147 (lecture en
streaming) et #148 (export à une date et exploration).

## Côté mod

La découpe est active par défaut et se règle dans `config/minemories.properties` :

- `captureTiles` active la découpe (défaut : `true`, `false` pour un `.glb` unique) ;
- `captureTileChunks` règle la taille de tuile, de 1 à 16 chunks (défaut : 4). Une valeur
  invalide ou hors bornes revient à 4.

Il n'y a pas encore de bouton dans l'interface M.

**Alignement.** Quand la découpe est active, l'empreinte horizontale d'une capture AFK est agrandie aux tuiles entières qu'elle touche (sauf si le résultat dépasserait 257 blocs). Chaque tuile d'une capture est donc complète et peut remplacer la précédente sans perdre le reste de la tuile ; deux captures dans les mêmes tuiles ont aussi le même `zoneId`.

Les captures AFK et progressives sont découpées. Les captures manuelles autour du joueur le sont sauf si `manualCaptureTiles=false` (interrupteur de l'onglet Captures) ; les sélections et `captureTiles=false` donnent un `.glb` unique. Le bundle est enregistré sous le nom d'historique habituel `capture.glb`,
mais ce n'est **pas** un `.glb` ordinaire : il ne s'ouvre pas directement dans Blender. Il faut
passer par la chronologie ou l'export de Minemories. L'API le reconnaît grâce à son
en-tête `MMTB`.

Chaque tuile a son propre spool sur disque. Les limites de spool et le nombre de descripteurs
de fichiers croissent donc avec le nombre de tuiles occupées.

La capture commence par un paquet d'origine (centre de la zone capturée). Les coordonnées des
quads sont relatives à cette origine, ce qui permet de calculer les indices de tuile. Une
géométrie reçue avant ce paquet fait échouer la capture.

## Côté API

**Détection.** Un envoi resumable (`/api/mod/uploads`) dont les 4 premiers octets valent
`MMTB` est traité comme un bundle ; les autres envois restent des `.glb` uniques. L'endpoint
historique `POST /api/mod/memories` n'accepte que des `.glb`.

**Validation.** À la finalisation, le serveur contrôle l'en-tête, le manifeste (strict : format,
`tileChunks`, noms de fichiers, ordre `(x, z)`, décalages contigus), chaque `.glb` de tuile
(autonomie, alignement, contrat GLB) et deux SHA-256 : celui de chaque tuile et celui du
fichier entier, déclaré dans l'envoi. Un échec répond `400 invalid_glb_or_checksum`, comme
pour un `.glb` invalide, et ne crée aucune capture.

**Stockage.** Le bundle est stocké tel quel sous la clé habituelle `<utilisateur>/<id>.glb`.
Les quotas, la suppression et la conversion en chunks ne changent pas.

**Index.** La table `memory_tiles` garde pour chaque tuile `(x, z)`, la taille, le SHA-256,
le nombre de quads et l'**offset absolu** dans l'objet stocké (décalage de données du bundle
plus décalage du manifeste). Une capture sans tuile n'a aucune ligne.

**Routes privées.**

- `GET /api/memories/:id/tiles/:x/:z` renvoie les octets du `.glb` de la tuile en
  `model/gltf-binary`, avec `Cache-Control: private, no-store` et `X-Content-Type-Options: nosniff`.
  Elle exige la session du propriétaire. Une coordonnée hors de `±2 000 000` ou non numérique,
  une tuile inconnue, celle d'un autre compte ou d'une capture dans la corbeille répondent
  `404 tile_not_found`. Les erreurs de stockage froid suivent la route de fichier (`202
  memory_restoration_required`). Une tuile dont l'empreinte ne correspond pas répond
  `502 tile_integrity_failed`. Les autres échecs répondent `503 memory_storage_unavailable`.
  La lecture est un intervalle d'octets borné. Si la lecture échoue parce que l'objet a changé
  de clé pendant la conversion, elle est reprise une fois à l'emplacement courant ; l'empreinte
  est toujours vérifiée sur l'emplacement effectivement lu.
- oRPC `timelapse.tiles({ memoryId })` renvoie la liste `{ memoryId, tileChunks, tiles: [{ x, z,
  size, sha256, quads }] }` triée par `(x, z)`, ou `NOT_FOUND`.
- `timelapse.frames` ajoute `tileCount` aux trames qui ont des tuiles. Sans tuile, la clé est
  absente, comme avant.

**Limites.** 1024 tuiles au plus par bundle, 64 MiB par tuile, 450 MiB par envoi. Au plus 8 lecteurs
simultanés par propriétaire : un client garde au plus 4 requêtes de tuiles en vol et réessaie avec
un délai croissant en cas de `503`.

**Partage.** Les trois routes de fichier (`GET /api/memories/:id/file`,
`GET /api/shared/:token/file` et `GET /api/public/:id/file`) répondent pour une capture tuilée
par un `.glb` unique assemblé à partir de ses tuiles : chaque tuile est lue puis vérifiée
(SHA-256), placée selon sa position et le centre de capture, puis fusionnée avec la validation
GLB autonome. Le lien partagé et la publication publique sont inclus ; une capture dont
l'assemblage dépasse 128 Mio de tuiles répond `413 capture_too_large_to_assemble`. La route de
tuile reste réservée au propriétaire.

## Vue « monde » dans le temps

Les captures tuilées d'un même monde, d'une même dimension et d'un même compte forment
**une seule série** dans l'index temporel, quelle que soit leur zone ; les captures en
GLB unique gardent une série par zone. À une date donnée, la liste cumulative
(`timelapse.tiles` avec `cumulative: true`) donne pour chaque cellule de la grille la tuile
la plus récente écrite à cette date ou avant. Une capture plus récente qui contient entièrement
une cellule sans y avoir de tuile l'a vidée : elle disparaît. Une zone qui n'est plus capturée
reste donc figée dans son dernier état, pendant que l'autre évolue. Chaque tuile de la liste
porte le `memoryId` de la capture qui l'a écrite ; le viewer la télécharge depuis celle-ci.
Au-delà de 1024 cellules, les plus proches de la capture sont conservées.

Limite : une capture non alignée (empreinte de plus de 257 blocs une fois alignée, ou
anciennes captures) qui ne couvre qu'une partie d'une tuile remplace toute la tuile.
