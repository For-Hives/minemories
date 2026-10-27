# Tuiles Minemories

Une capture peut être découpée en **tuiles Minemories** : des carrés de N×N chunks
Minecraft alignés sur le monde, chacun exporté dans son propre `.glb`. Ce document
fixe le format commun au mod, à l'API et au viewer. Le comportement historique
(un seul `.glb` par capture) reste le défaut tant que la découpe n'est pas activée.

## Grille

- Une tuile fait `tileChunks` × `tileChunks` chunks, soit `tileBlocks = 16 × tileChunks`
  blocs de côté. `tileChunks` est compris entre 1 et 16 ; la valeur par défaut est 8
  (128 blocs). Une capture mesure au plus 257 blocs : 16 chunks reste donc la limite.
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

- les quads et les lumières sont triés avant l'écriture (clé de matériau, puis
  coordonnées, puis UV), indépendamment de l'ordre d'insertion ;
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
