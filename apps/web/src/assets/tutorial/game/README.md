# Captures en jeu du guide d'installation

Ces images sont affichées sur `/installation`, quel que soit le système ou le loader choisi :

| Fichier | Étape du guide | Ce qu'elle montre |
| --- | --- | --- |
| `guide-pause-menu` | Lancer le jeu | Menu pause (Échap) avec le bouton Minemories en haut à droite |
| `guide-minemories-menu` | Créer un souvenir, avec le menu | Menu Minemories ouvert avec M, bouton « Take a memory » |
| `guide-export-command` | Créer un souvenir, avec une commande | Chat avec `/minemories export 16` saisi, pas encore envoyé |

Ce sont de vraies captures du jeu, prises par le test client Fabric 1.21.11 (`mod/1.21.11/fabric/src/gametest/java/dev/minemories/gametest/GuideScreenshotsGameTest.java`), en anglais, 1280 × 720, interface à l'échelle 2 (la commande est recadrée sur la ligne du chat). Sans fichier, la page n'affiche rien à cet endroit.

## Quand les refaire

**À chaque changement de l'un de ces éléments**, dans la même PR :

- la place ou le libellé du bouton Minemories du menu pause ou des options (`ClientRuntime.addPauseMenuButton`, `PauseMenuPlacement`) ;
- le menu ouvert avec M (`SimpleHubScreen` : boutons, libellés, disposition) ou sa touche par défaut ;
- la syntaxe de `/minemories export`.

Mettre aussi à jour le texte des étapes (`apps/web/src/pages/InstallationSteps.tsx`) s'il décrit l'emplacement ou le libellé.

## Comment

```bash
bun mod test fabric-mc1.21.11
```

Le test écrit les PNG (préfixés d’un numéro) dans `mod/1.21.11/fabric/build/run/clientGameTest/screenshots/`. Les convertir en WebP sous le nom exact ci-dessus :

```bash
shots=mod/1.21.11/fabric/build/run/clientGameTest/screenshots
out=apps/web/src/assets/tutorial/game
for name in guide-pause-menu guide-minemories-menu; do
	cwebp -quiet -q 90 "$(ls -t $shots/*"$name".png | head -1)" -o "$out/$name.webp"
done
# The chat line alone (bottom left), otherwise the command is unreadable on a phone.
cwebp -quiet -q 90 -crop 0 662 460 58 "$(ls -t $shots/*guide-export-command.png | head -1)" -o "$out/guide-export-command.webp"
```

Vérifier ensuite l'image sur `/installation` (taille, lisibilité à 390 px de large). Ne jamais remplacer ces captures par des images générées ou retouchées.
