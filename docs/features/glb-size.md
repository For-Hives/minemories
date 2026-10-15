# Taille des GLB : mesures et optimisation

## Corpus avant modification

Mesures initiales du 15 octobre 2026 sur des captures réelles déjà exercées dans
Minecraft/Blender. Les fixtures d’upload étendues artificiellement à 200 Mio sont
exclues du corpus de taille.

| Capture | Octets | Triangles | Images | Positions | Normales | UV | Indices | PNG |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| AFK progressif rayon 32 | 2 501 392 | 27 220 | 26 | 653 280 | 653 280 | 435 520 | 326 640 | 331 100 |
| AFK progressif rayon 8 | 605 228 | 2 766 | 17 | 66 384 | 66 384 | 44 256 | 33 192 | 327 378 |
| Tour et surface | 63 096 | 412 | 12 | 9 888 | 9 888 | 6 592 | 4 944 | 3 444 |
| Hauteur complète | 483 628 | 5 716 | 25 | 137 184 | 137 184 | 91 456 | 68 592 | 7 247 |

Les colonnes binaires excluent JSON et padding. La géométrie domine le rayon 32 ;
les images dominent le petit export rayon 8. Mesures, empreintes et script borné :
`~/.local/state/minemories-validation/glb-size-20261015/baseline.json` et `baseline.py`.
Ce corpus initial doit encore être complété/exercé pour les entités, lumières,
teintes et transparences avant validation finale de #73.

## Encodage exact des indices

Les deux writers choisissent maintenant le plus petit type d’indice compatible
avec le nombre de sommets de la primitive : 8 bits jusqu’à 255 sommets, 16 bits
jusqu’à 65 535, puis 32 bits. Les quads ajoutent quatre sommets ; les frontières
réelles sont donc 252/256 et 65 532/65 536.

La [spécification glTF](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#meshes)
interdit la valeur maximale du type d’indice, réservée au primitive restart.
Le compteur de sommets, borne exclusive des indices, assure que 255/65 535 ne
sont jamais émis dans les types correspondants. Un indice corrompu est refusé,
sans troncature silencieuse.

Cette conversion ne modifie ni triangles/ordre, ni positions, normales, UV, PNG,
matériaux alpha/émissifs, lumières ou entités. Aucune extension n’est ajoutée.
Le writer spoolé garde son stockage temporaire 32 bits et le compacte uniquement
pendant la copie finale, dans le buffer existant de 64 Kio. Les limites de spool,
les budgets de capture, les plafonds d’upload et la publication atomique restent
en vigueur. Le spool temporaire peut donc être plus grand que le GLB final.

Les tests couvrent les quatre frontières de primitives, le dernier indice, la
concordance binaire des deux writers, les valeurs réservées/négatives et les
buffers endommagés. `:core:check` passe avec JaCoCo et SpotBugs, sans changement de
seuil. Les mesures après optimisation, temps, passages dans les validateurs et
comparaisons visuelles en jeu/Blender restent nécessaires avant fermeture de #73.
