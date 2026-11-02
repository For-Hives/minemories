# Variante de transport Meshopt (issue #173, phase 4)

Le `capture.glb` stocké et téléchargeable reste le glTF 2.0 quantifié lisible par Blender (voir
`docs/features/glb-size.md` et `glb-v2-decisions.md` : Blender 5.2.2 ne décode pas `EXT_meshopt_compression`). Pour le
viewer, l'API sait en produire une **variante de transport** compressée avec `EXT_meshopt_compression`.

## Principe

- `GET /api/memories/:id/file`, `/api/shared/:token/file` et `/api/public/:id/file` acceptent `?variant=meshopt`.
  Toute autre valeur, un fichier trop gros, une file d'attente pleine ou un échec de compression renvoient **l'original
  tel quel** : la variante est toujours optionnelle. L'API annonce la variante par l'en-tête `X-Minemories-Variant:
  meshopt` (exposé en CORS) ; le gzip de transport existant s'applique par-dessus.
- Le codec est dans `packages/api-contract/src/glb-meshopt.ts`, sans WebAssembly (les encodeur/décodeur `meshoptimizer`
  sont injectés) :
  - `compressGlb` compresse en `ATTRIBUTES` chaque vue de sommets et en `TRIANGLES` chaque vue d'indices (indices 8 bits
    élargis à 16 bits, exigé par la spécification), **sans réordonner** les triangles : les plages par chunk des
    `extras` restent valides. Les autres vues (images) sont copiées. Le buffer de repli est déclaré sans données et
    `EXT_meshopt_compression` est `extensionsRequired`. Une vue partagée entre plusieurs accessors ou un accessor
    avec décalage ou `sparse` n'est pas compressé.
  - `expandGlb` fait l'inverse et renvoie un GLB **ordinaire**. Il refuse (null, jamais d'exception) tout fichier mal
    formé : tampon de repli avec `uri`, plages hors du chunk binaire, `count × byteStride` différent de la taille
    déclarée, mode inconnu, plus de 256 Mio décodés, flux corrompu rejeté par le décodeur.
- **Compatibilité du validateur** : le viewer n'accepte pas le format compressé dans `validateSelfContainedGlb` (qui
  rejette toujours ces vues, voir `glb-layout.ts`). `downloadCapture` décode la variante en un GLB ordinaire **avant**
  la validation habituelle (budgets, bornes d'accessors, valeurs) : le validateur, l'API d'envoi et les anciens GLB sont
  inchangés. Le décodeur WebAssembly (`meshoptimizer/decoder`) n'est chargé qu'à la première variante reçue.

## Stockage, quota et durée de vie

Rien de durable : la variante est **calculée à la demande** depuis l'objet stocké et gardée dans un cache **mémoire**
(`capture-variants.ts`) : au plus 128 Mio, durée de vie 10 minutes, clé = SHA-256 de l'original (une capture remplacée
ou supprimée n'est donc jamais resservie après expiration), un seul encodage à la fois avec deux en attente (au-delà
on sert l'original), originaux de plus de 64 Mio non compressés. Conséquences :

- aucun objet S3 ou fichier supplémentaire : pas de quota à imputer (`account-storage-quota.md`), pas de suppression
  durable à propager (`durable-deletions.md`, `trash-retention.md`), pas de cycle de vie en stockage froid
  (`cold-storage-costs.md`) ; une capture archivée suit le chemin de restauration (HTTP 202) avant toute variante ;
- le coût est du CPU à la demande : 46 ms pour la capture de 10,6 Mio mesurée ci-dessous.

## Mesures (écriture quantifiée + repack d'atlas, hors jeu ; gzip niveau 4 comme l'API, brotli 9)

| Capture | Brut original | Brut variante | gzip original → variante | brotli original → variante |
| --- | ---: | ---: | ---: | ---: |
| AFK rayon 32 | 1 082 984 | 458 148 | 269 344 → 94 826 (−65 %) | 108 496 → 72 265 |
| AFK rayon 8 | 180 516 | 162 296 | 35 493 → 27 237 | 22 346 → 20 450 |
| Hauteur complète | 243 820 | 133 972 | 60 321 → 28 944 | 34 098 → 22 879 |
| Modèles, alpha et lumières | 302 216 | 251 492 | 62 843 → 50 923 | 42 281 → 40 542 |
| Capture réelle (modpack) | 10 614 852 | 2 975 836 | 2 430 289 → 743 867 (−69 %) | 1 212 331 → 601 470 |

Les petites captures dominées par les PNG et le JSON gagnent peu ; la capture « tour et surface » (49 Kio) n'est pas
compressible (la variante ne serait pas plus petite). Par rapport à l'export d'avant #173 (capture réelle : 20,3 Mio
bruts, 2,60 Mio en gzip), le transfert passe à 0,74 Mio.

Temps (Bun pour l'encodage, Chromium pour le décodage, médiane de 5) : encodage 46 ms sur la capture réelle, 13 ms sur le
rayon 32 ; décodage et remise en forme dans le navigateur 24,5 ms (capture réelle), 4,6 ms (rayon 32), 14,7 ms
(modèles). Le temps de chargement complet avec un GPU réel n'est pas mesuré (SwiftShader seulement) ; le décodage
reste négligeable devant le transfert et la préparation de la scène.

## Validation

- Tests API : aller-retour bit à bit des vues, indices 8/16/32 bits, entrées hostiles, cache (expiration, éviction,
  file, taille), route partagée `?variant=meshopt` ; le GLB décodé passe `validateSelfContainedGlb`.
- Tests viewer : `downloadCapture` demande la variante, décode, rejette une variante corrompue et respecte l'annulation.
- Les cinq GLB rejoués et la capture réelle sont compressés puis décodés sans écart d'un octet par rapport à l'original ;
  les six GLB décodés passent le validateur ; le viewer (Chromium headless, SwiftShader) affiche les fichiers décodés.

## Limites

- La vue d'un monde (`fetchTemporalFile`) contrôle la taille exacte de l'original et ne demande pas encore la variante.
- Le cache est par processus : plusieurs instances API recalculent chacune.
- Pas de validation en jeu (le mod n'est pas modifié par cette phase).
