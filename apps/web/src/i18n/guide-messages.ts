/** English translations of the detailed French guide copy. Protocol strings are kept outside this catalog. */
export const guideEnglishMessages: Record<string, string> = {
	'Le concept': 'The concept',
	'Comment ça marche': 'How it works',
	'Installer le mod': 'Install the mod',
	'Guides Minemories': 'Minemories guides',
	'Les constructions restent, même quand la saison se termine': 'The builds remain, even when the season ends',
	'Une base construite entre amis, un château avec son enfant, un premier village : ce sont aussi des souvenirs. Quand le serveur ferme, retrouver les bonnes versions et tous les mods pour les revoir peut devenir compliqué.':
		'A base built with friends, a castle with your child, a first village: these are memories too. When the server closes, finding the right versions and all the mods to revisit them can be difficult.',
	'Minemories transforme une zone de Minecraft en souvenir 3D que tu peux ouvrir dans ton navigateur. Une fois la capture créée, tu peux la revisiter sans relancer Minecraft ni réinstaller le modpack.':
		'Minemories turns an area of Minecraft into a 3D memory you can open in your browser. Once captured, you can revisit it without starting Minecraft or reinstalling the modpack.',
	'Un souvenir à regarder, une sauvegarde à garder': 'A memory to explore, a backup to keep',
	'La capture est une image en trois dimensions d’un lieu à un moment donné. Tu peux regarder autour, mais pas reprendre ta partie, casser des blocs ou récupérer ton inventaire. Garde aussi une sauvegarde du monde pour continuer à jouer : le souvenir 3D ne la remplace pas.':
		'The capture is a three-dimensional snapshot of a place at a moment in time. You can look around, but cannot resume the game, break blocks or recover your inventory. Keep a world backup too if you want to keep playing: the 3D memory does not replace it.',
	'Pour toi et les personnes avec qui tu joues': 'For you and the people you play with',
	'À la fin d’une saison, l’admin peut capturer les lieux du groupe avant de fermer le serveur. Un parent peut garder une construction faite avec son enfant. Un joueur occasionnel peut revoir sa maison, et un créateur de modpack peut conserver une trace de ses constructions modifiées.':
		"At the end of a season, an admin can capture the group's places before closing the server. A parent can keep a build made with their child. An occasional player can revisit their house, and a modpack creator can keep a record of their modded builds.",
	'Ce que tu peux faire aujourd’hui': 'What you can do today',
	'Capturer depuis le mod, envoyer une capture dans une galerie privée et créer volontairement un lien de partage. Une personne qui reçoit ce lien peut regarder la capture sans compte ni mod.':
		'Capture from the mod, upload to a private gallery and deliberately create a sharing link. Anyone receiving that link can view the capture without an account or mod.',
	'Le timelapse permet de parcourir les captures datées d’une même zone. La récupération directe d’anciens dossiers de monde, l’impression 3D et d’autres versions de Minecraft restent des pistes du projet. La conservation en ligne à vie n’est pas garantie : garde tes fichiers locaux.':
		'Timelapse lets you browse dated captures of the same area. Direct recovery of old world folders, 3D printing and other Minecraft versions remain future ideas. Lifetime online storage is not guaranteed: keep your local files.',
	'Créer mon premier souvenir, étape par étape': 'Create my first memory, step by step',
	'Du monde Minecraft au souvenir 3D': 'From Minecraft world to 3D memory',
	'1. Installer et ouvrir le monde': '1. Install and open the world',
	'Installe le mod': 'Install the mod',
	'sur ton ordinateur, puis ouvre ton monde ou rejoins ton serveur avec son profil habituel compatible. Le serveur doit encore être accessible pour capturer ses constructions.':
		'on your computer, then open your world or join your server using its usual compatible profile. The server must still be accessible to capture its builds.',
	'2. Choisir une petite zone et capturer': '2. Choose a small area and capture it',
	'Pour un premier essai, place-toi près de la construction et écris':
		'For your first attempt, stand near the build and type',
	'dans le chat. 16 est le rayon en blocs autour de toi ; les valeurs acceptées vont de 2 à 128. Commence petit : une grande zone peut ralentir le jeu. Le mod capture ce que le client a chargé, pas tout le serveur.':
		'in chat. 16 is the radius in blocks around you; accepted values range from 2 to 128. Start small: a large area can slow the game. The mod captures what the client has loaded, not the entire server.',
	'Le sous-sol est limité par défaut à la profondeur visitée dans cette zone, avec au moins cinq blocs de marge sous la position visitée. Descendre dans une grotte étend les prochaines captures de la zone. Le suivi commence avec cette version du mod et reste enregistré sur ton ordinateur. Des cavités au-dessus de cette limite peuvent encore apparaître. Le mode avancé permet de capturer toute la hauteur ; une sélection précise garde la hauteur de ses deux coins.':
		'By default, underground capture is limited to the depth visited in this area, with at least five blocks of margin below the visited position. Entering a cave extends future captures of that area. Tracking starts with this mod version and stays on your computer. Cavities above this limit may still appear. Advanced mode can capture the full height; an explicit selection keeps the height of its two corners.',
	'Pour une zone précise, place-toi au premier coin et saisis':
		'For a precise area, stand at the first corner and enter',
	', puis au coin opposé avec': ', then at the opposite corner with',
	'. Ces deux positions définissent aussi la hauteur. Vérifie avec':
		'. These positions also define the height. Check with',
	', puis lance': ', then run',
	'efface la sélection.': 'clears the selection.',
	'La touche M ouvre le menu Minemories. En mode simple, entre le code de ta galerie puis clique sur « Capturer et envoyer ». Le bouton devient disponible quand ton compte est connecté et qu’un monde est ouvert. Si M est déjà utilisée, change son raccourci dans les contrôles de Minecraft.':
		'The M key opens the Minemories menu. In simple mode, enter your gallery code, then click “Capture and upload”. The button becomes available when your account is connected and a world is open. If M is already assigned, change its shortcut in Minecraft controls.',
	'Les côtés et le dessous de la capture sont refermés avec un aspect terre/pierre, comme une portion de monde extraite. Ce sont des faces ajoutées au souvenir 3D : aucun bloc n’est changé dans Minecraft.':
		'The sides and bottom of the capture are closed with a dirt/stone appearance, like an extracted piece of world. These faces are added to the 3D memory: no blocks are changed in Minecraft.',
	'3. Revoir le fichier sur ton ordinateur': '3. Find the file on your computer',
	'Le résultat est un fichier': 'The result is a file named',
	'dans le dossier': 'in the folder',
	'de ton dossier utilisateur (': 'under your user directory (',
	') par défaut, pas dans le dossier du monde. En mode avancé, tu peux choisir un autre dossier et cliquer sur « Exporter en local » sans connecter de compte. GLB signifie ici un fichier 3D contenant les formes et les textures. Avec la version actuelle du mod, chaque capture datée est aussi conservée avec ses informations dans le sous-dossier':
		') by default, not in the world folder. In advanced mode, you can choose another folder and click “Export locally” without connecting an account. Here GLB means a 3D file containing shapes and textures. With the current mod version, every dated capture and its information are also kept in the subfolder',
	'permet de retrouver le dernier export. Dans le menu M, « Captures locales » permet de choisir et d’envoyer un ancien souvenir. Garde tes propres sauvegardes : l’historique utilise de la place sur ton ordinateur.':
		'points to the latest export. In the M menu, “Local captures” lets you choose and upload an older memory. Keep your own backups: the history takes up space on your computer.',
	'Pour le revoir sur le site, envoie ce souvenir depuis le menu M → Captures locales, puis ouvre-le dans ta galerie privée.':
		'To revisit it on the site, upload this memory from M → Local captures, then open it in your private gallery.',
	'4. Envoyer dans ta galerie, si tu le souhaites': '4. Upload to your gallery, if you choose',
	'Crée ton compte': 'Create your account',
	ou: 'or',
	'connecte-toi': 'sign in',
	', puis ouvre': ', then open',
	'Ma galerie / My gallery': 'My gallery',
	'Génère un code d’appairage dans la galerie. L’appairage relie ce Minecraft à ton compte Minemories.':
		'Generate a pairing code in the gallery. Pairing links this Minecraft installation to your Minemories account.',
	'Dans le chat de Minecraft, saisis': 'In Minecraft chat, enter',
	'en remplaçant CODE par les six chiffres. Le code expire après cinq minutes et ne sert qu’une fois. Aucun mot de passe n’est à écrire dans Minecraft.':
		'replacing CODE with the six digits. The code expires after five minutes and can only be used once. Never type your password in Minecraft.',
	Saisis: 'Enter',
	'pour envoyer la capture, puis vérifie son apparition dans la galerie. Le mod accepte un fichier jusqu’à 450 MiB (environ 472 Mo). En cas de dépassement, capture une zone plus petite.':
		'to upload the capture, then check that it appears in the gallery. The mod accepts files up to 450 MiB (about 472 MB). If the limit is exceeded, capture a smaller area.',
	'Les captures AFK sont actives par défaut : après 5 minutes d’inactivité, au plus une fois toutes les 4 heures, même dans le menu pause ou quand Minecraft est en arrière-plan. Sans compte connecté, elles restent dans ton dossier local. Avec un compte connecté, elles sont aussi envoyées dans ta galerie privée. Tu peux les désactiver en mode simple ; le mode avancé permet de régler les délais et le rayon de capture (32 blocs par défaut). Une préférence de désactivation déjà enregistrée est conservée.':
		'AFK captures are enabled by default: after 5 minutes of inactivity, at most once every 4 hours, even in the pause menu or while Minecraft is in the background. Without a connected account, they stay in your local folder. With a connected account, they also upload to your private gallery. You can disable them in simple mode; advanced mode lets you adjust the delays and capture radius (32 blocks by default). A previously saved disable preference is preserved.',
	'Utiliser sa propre API (avancé)': 'Use your own API (advanced)',
	'Le mod utilise': 'The mod uses',
	'par défaut. Dans « Mode avancé », tu peux renseigner l’adresse HTTPS d’une API Minemories auto-hébergée compatible et un chemin absolu pour le dossier local, puis cliquer sur « Enregistrer ». HTTP est accepté uniquement pour une API sur localhost. Changer d’API déconnecte le compte : génère ensuite le code dans la galerie correspondant à cette nouvelle API. Le bouton « API Minemories » restaure l’adresse officielle ; enregistre pour l’appliquer.':
		'by default. In “Advanced mode”, you can enter the HTTPS address of a compatible self-hosted Minemories API and an absolute path for the local folder, then click “Save”. HTTP is accepted only for an API on localhost. Changing API disconnects the account: generate a new code in the gallery belonging to that API. The “Minemories API” button restores the official address; save to apply it.',
	'5. Partager seulement ce que tu choisis': '5. Share only what you choose',
	'La galerie est privée par défaut. Sur une capture, « Share » puis « Create a link » crée un lien accessible à toute personne qui le possède ; elle peut le transmettre à son tour. Tu peux révoquer le lien depuis ce panneau, mais cela ne supprime pas les copies déjà enregistrées par quelqu’un.':
		'The gallery is private by default. On a capture, “Share” then “Create a link” creates a link accessible to anyone who has it; they can forward it too. You can revoke the link from this panel, but this does not delete copies someone has already saved.',
	'Avant de partager, vérifie la capture et les informations associées : des coordonnées, le nom du serveur ou du monde, et la graine du monde solo peuvent être enregistrés. Évite les lieux ou textes contenant des informations personnelles et demande l’accord des autres constructeurs.':
		'Before sharing, check the capture and its associated information: coordinates, server or world name, and single-player world seed may be recorded. Avoid places or text containing personal information and ask the other builders for permission.',
	'Est-ce une sauvegarde de mon monde ?': 'Is this a backup of my world?',
	'Non. C’est un modèle 3D figé d’une zone chargée dans le jeu. Il ne permet pas de reprendre la partie. Conserve ta sauvegarde Minecraft à côté.':
		'No. It is a static 3D model of an area loaded in the game. It cannot resume your game. Keep your Minecraft backup separately.',
	'Faut-il un compte ou un mod pour regarder ?': 'Do I need an account or mod to view a memory?',
	'Un lien partagé s’ouvre sans compte et sans mod. Un compte Minemories est nécessaire pour envoyer dans ta galerie privée.':
		'A shared link opens without an account or mod. You need a Minemories account to upload to your private gallery.',
	'Puis-je garder une construction vanilla ?': 'Can I keep a vanilla build?',
	'Oui, si tu peux ouvrir une copie du monde Java 1.21.1 avec NeoForge 21.1.248 et Minemories. Vanilla signifie sans mods : le profil utilisé pour capturer doit néanmoins charger le mod. Bedrock et les consoles ne sont pas supportés.':
		'Yes, if you can open a copy of the Java 1.21.1 world with NeoForge 21.1.248 and Minemories. Vanilla means without mods: the profile used for capturing must still load the mod. Bedrock and consoles are not supported.',
	'Est-ce compatible avec tous les mods ?': 'Is it compatible with every mod?',
	'Non, ce n’est pas garanti. Les cibles Java 1.21.1 validées sont détaillées sur la page Versions du mod : NeoForge, Fabric, Forge et Quilt avec le JAR Fabric. Les blocs avec un rendu particulier peuvent être incomplets. Fais une petite capture et regarde le résultat avant de capturer toute ta base.':
		'This is not guaranteed. Validated Java 1.21.1 targets are detailed on the Mod versions page: NeoForge, Fabric, Forge and Quilt using the Fabric JAR. Blocks with custom rendering may be incomplete. Try a small capture and inspect it before capturing your whole base.',
	'Dois-je installer quelque chose sur le serveur ?': 'Do I need to install anything on the server?',
	'Minemories est un mod client, sur l’ordinateur du joueur. Ce n’est pas un plugin serveur. Demande l’accord de l’admin, garde le profil attendu par le serveur et capture seulement les zones autorisées et chargées.':
		"Minemories is a client mod on the player's computer, not a server plugin. Ask the admin for permission, keep the profile expected by the server and capture only permitted, loaded areas.",
	'Qui peut voir les souvenirs de mon enfant ?': "Who can see my child's memories?",
	'La galerie est privée par défaut. Un lien créé avec Share donne accès à la capture à toute personne qui le possède, qui peut aussi le retransmettre. Vérifie le souvenir et ses informations avec ton enfant avant de partager. Révoquer le lien empêche les futurs accès par ce lien, pas les copies déjà faites.':
		'The gallery is private by default. A link created with Share gives access to anyone who has it, and they can forward it. Check the memory and its information with your child before sharing. Revoking the link stops future access through it, not copies already made.',
	'Est-ce que le mod envoie tout automatiquement ?': 'Does the mod upload everything automatically?',
	'Les captures AFK sont actives par défaut après 5 minutes d’inactivité, au plus une fois toutes les 4 heures, même en pause ou en arrière-plan. Sans compte lié, elles restent locales ; avec un compte lié, elles sont envoyées dans ta galerie privée. Le mode simple permet de les désactiver, le mode avancé de régler délai, fréquence et rayon (32 blocs par défaut). Une désactivation déjà enregistrée est conservée. Déconnecter le compte arrête les envois, mais conserve les captures locales. Le bouton Exporter en local n’envoie rien.':
		'AFK captures are enabled by default after 5 minutes of inactivity, at most once every 4 hours, even while paused or in the background. Without a linked account they stay local; with one they upload to your private gallery. Simple mode can disable them; advanced mode adjusts delay, frequency and radius (32 blocks by default). A saved disable preference is preserved. Disconnecting the account stops uploads but keeps local captures. Export locally does not upload anything.',
	'Comment retrouver une ancienne capture ?': 'How can I find an older capture?',
	'Dans la version actuelle du mod, M → Captures locales affiche les captures datées conservées dans le sous-dossier history de ton dossier d’export. Tu peux choisir un souvenir et l’envoyer si ton compte est connecté. capture.glb reste le dernier export. Les anciennes versions du mod écrasaient ce fichier : la mise à jour conserve celui encore présent, mais ne récupère pas les fichiers déjà écrasés. Les captures locales ne sont pas supprimées automatiquement ; prévois de la place et tes propres sauvegardes. Aucune conservation en ligne à vie n’est promise.':
		'In the current mod version, M → Local captures lists dated captures kept in the history subfolder of your export directory. You can choose a memory and upload it if your account is connected. capture.glb remains the latest export. Older versions overwrote that file: updating preserves the remaining file but cannot recover files already overwritten. Local captures are not automatically deleted; allow enough space and keep your own backups. Lifetime online storage is not promised.',
	'Puis-je récupérer un serveur déjà fermé ou importer un ZIP ?': 'Can I recover a closed server or import a ZIP?',
	'Pas directement aujourd’hui. Il faut pouvoir rouvrir le monde dans un environnement compatible pour capturer. L’import d’une sauvegarde ZIP et la récupération automatique d’anciens modpacks ne sont pas disponibles.':
		'Not directly today. You must be able to reopen the world in a compatible environment to capture it. ZIP world imports and automatic recovery of old modpacks are not available.',
	'Pourquoi une partie de la construction manque ?': 'Why is part of the build missing?',
	'Le mod capture une zone et les éléments chargés par le client. Rapproche-toi du lieu, vérifie les coins et la hauteur de ta sélection, réduis la zone et recommence. Certains rendus moddés peuvent ne pas être reproduits.':
		"The mod captures an area and the elements loaded by the client. Move closer, check your selection's corners and height, reduce the area and try again. Some modded rendering may not be reproduced.",
	'Le code ne marche pas ou l’envoi échoue : que faire ?':
		'The code does not work or uploading fails: what should I do?',
	'Le code à six chiffres expire après cinq minutes et ne fonctionne qu’une fois : génère-en un nouveau dans la galerie. Vérifie ensuite ta connexion et la taille du GLB (450 MiB maximum depuis le mod). Conserve le fichier local et réessaie l’envoi.':
		'The six-digit code expires after five minutes and only works once: generate another in the gallery. Then check your connection and GLB size (450 MiB maximum from the mod). Keep the local file and retry the upload.',
	'Y a-t-il un timelapse, une impression 3D ou un abonnement ?': 'Is there timelapse, 3D printing or a subscription?',
	'Le timelapse relie les captures datées d’une même zone ; l’impression 3D reste une piste. Cette version expérimentale ne présente pas d’offre commerciale ni de tarif confirmé. Ne te base pas sur les anciens scénarios de prix du projet.':
		"Timelapse links dated captures of the same area; 3D printing remains a future idea. This experimental version has no confirmed commercial offer or price. Do not rely on the project's old pricing scenarios.",
	'Questions fréquentes': 'Frequently asked questions',
	'Tu débutes ? Commence par': 'New here? Start with',
	'le concept': 'the concept',
	', puis le': ', then the',
	'guide d’installation': 'installation guide',
	'. Les commandes Minecraft et les noms de fichiers restent identiques dans les deux langues.':
		'. Minecraft commands and filenames stay the same in both languages.',
	'Toutes les étapes pour capturer, envoyer et partager': 'All the steps to capture, upload and share',
	'Minemories est un projet indépendant, non officiel, ni approuvé par ni associé à Mojang ou Microsoft.':
		'Minemories is an independent, unofficial project, neither approved by nor associated with Mojang or Microsoft.',
	'À ta façon': 'Your way',
	'Ton ordinateur. Ton parcours.': 'Your computer. Your journey.',
	'Les étapes s’adaptent à tes choix. Tu peux les changer à tout moment.':
		'The steps adapt to your choices. You can change them at any time.',
	'Tu joues sur…': 'You play on…',
	'Tu lances Minecraft avec…': 'You launch Minecraft with…',
	'Ton prénom (facultatif)': 'Your first name (optional)',
	'Pour un guide un peu plus à toi': 'For a guide that feels a little more yours',
	'Réduire les animations': 'Reduce animations',
	'Un petit coup de main': 'A little help',
	'Si une étape coince': 'If a step gets stuck',
	'L’installateur NeoForge ne s’ouvre pas': 'The NeoForge installer will not open',
	'Il faut Java 21 pour ouvrir l’installateur. Sous Windows, essaie clic droit → Ouvrir avec → Java. S’il manque, installe Temurin 21 depuis le lien de l’étape 2. Sous macOS ou Linux, suis':
		'You need Java 21 to open the installer. On Windows, try right-click → Open with → Java. If it is missing, install Temurin 21 using the link in step 2. On macOS or Linux, follow',
	'le guide officiel NeoForge': 'the official NeoForge guide',
	'pour lancer l’installateur. Ne change pas les réglages de sécurité au hasard.':
		'to run the installer. Do not change security settings at random.',
	'Je ne trouve pas le dossier mods ou le mod n’apparaît pas':
		'I cannot find the mods folder or the mod does not appear',
	'Ouvre le dossier depuis le profil que tu lances, plutôt qu’un dossier Minecraft trouvé ailleurs. Crée':
		'Open the folder from the profile you launch, rather than another Minecraft folder. Create',
	's’il manque. Vérifie que le fichier a bien l’extension .jar, et non .jar.zip, puis ferme complètement le jeu et relance le profil NeoForge 21.1.248. Les mondes sont dans saves ; le mod est dans mods.':
		'if it is missing. Check that the file ends in .jar, not .jar.zip, then fully close the game and restart the NeoForge 21.1.248 profile. Worlds belong in saves; the mod belongs in mods.',
	'M ouvre un autre menu, ou la commande est inconnue': 'M opens another menu, or the command is unknown',
	'Change la touche Minemories dans Options → Contrôles → Attribution des touches. Une commande inconnue indique souvent que le mod n’est pas chargé : vérifie sa présence dans Mods, les versions et le dossier du profil.':
		'Change the Minemories key in Options → Controls → Key Binds. An unknown command often means the mod is not loaded: check its entry in Mods, the versions and the profile folder.',
	'Minecraft plante au démarrage': 'Minecraft crashes at startup',
	'Vérifie Minecraft 1.21.1, NeoForge 21.1.248 et l’absence de doublon Minemories. Retire le JAR Minemories pour revenir au profil précédent. Demande de l’aide avec le message d’erreur et les versions utilisées ; ne supprime pas ton monde.':
		'Check Minecraft 1.21.1, NeoForge 21.1.248 and that Minemories is not duplicated. Remove the Minemories JAR to return to the previous profile. Ask for help with the error message and versions used; do not delete your world.',
	'La capture est vide, incomplète ou l’envoi échoue': 'The capture is empty, incomplete or uploading fails',
	'Attends que le terrain soit chargé, rapproche-toi de la construction et recommence avec le rayon 16. Certains blocs moddés ne sont pas reproduits fidèlement. Si l’envoi échoue, conserve capture.glb et regarde-le localement. Vérifie ta connexion, génère un nouveau code si les cinq minutes sont écoulées et réessaie ; la limite d’envoi du mod est 450 MiB.':
		'Wait for terrain to load, move closer to the build and try again with radius 16. Some modded blocks are not reproduced faithfully. If uploading fails, keep capture.glb and view it locally. Check your connection, generate another code if five minutes have passed and retry; the mod upload limit is 450 MiB.',
	'Le premier souvenir commence ici': 'Your first memory starts here',
	'Installer le mod Minemories': 'Install the Minemories mod',
	'Un petit fichier.': 'One small file.',
	'Une nouvelle façon de garder tes mondes.': 'A new way to keep your worlds.',
	'On avance ensemble, une étape à la fois. Pas besoin de savoir coder : choisis ton ordinateur, suis le guide et garde ton premier souvenir en 3D.':
		'We will take this one step at a time. No coding required: choose your computer, follow the guide and keep your first memory in 3D.',
	'Commencer l’installation': 'Start installing',
	'Minecraft Java 1.21.1 · NeoForge 21.1.248 · Mod expérimental':
		'Minecraft Java 1.21.1 · NeoForge 21.1.248 · Experimental mod',
	'Construire. Capturer. Revenir.': 'Build. Capture. Return.',
	'Tu viens juste regarder un souvenir partagé ? Ouvre son lien : tu n’as rien à installer.':
		'Just here to view a shared memory? Open its link: there is nothing to install.',
	'Guide pas à pas': 'Step-by-step guide',
	'À toi de jouer': 'Your turn',
	'Du téléchargement au premier souvenir.': 'From download to first memory.',
	'/ 6 étapes cochées': '/ 6 steps checked',
	'Progression de l’installation': 'Installation progress',
	'Étapes d’installation': 'Installation steps',
	'Étape cochée': 'Step checked',
	'Étape 0': 'Step 0',
	'← Précédent': '← Previous',
	'Mon souvenir s’ouvre en 3D': 'My memory opens in 3D',
	'C’est fait, on continue': "Done, let's continue",
	'Coche une étape quand tu l’as réalisée. Tu peux aussi naviguer librement entre les étapes.':
		'Check a step when you have completed it. You can also move freely between steps.',
	'Ton premier souvenir est là.': 'Your first memory is here.',
	'Si la capture s’ouvre correctement, tu as terminé ce premier essai. Garde aussi une sauvegarde du monde : un souvenir 3D ne permet pas de reprendre la partie.':
		'If the capture opens correctly, you have completed this first trial. Keep a world backup too: a 3D memory cannot resume your game.',
	'Explorer les captures, la galerie et le partage →': 'Explore captures, the gallery and sharing →',
	'Ton prénom, tes choix et ta progression restent dans ce navigateur, sur cet appareil. Tu peux fermer cette page et revenir.':
		'Your first name, choices and progress stay in this browser on this device. You can close this page and return.',
	'Recommencer et effacer mes choix': 'Start again and clear my choices',
	'Minemories est expérimental : commence par un monde de test et garde tes fichiers locaux. Les étapes cochées servent de repères ; elles ne vérifient pas le jeu à ta place.':
		'Minemories is experimental: start with a test world and keep your local files. Checked steps are reminders; they do not verify the game for you.',
	'Guide manuel Windows sans JavaScript': 'Manual Windows guide without JavaScript',
	'Télécharge le mod depuis': 'Download the mod from',
	'. Voici toutes les étapes du parcours Minecraft Launcher :': '. Here are all the steps for Minecraft Launcher:',
	Préparer: 'Prepare',
	'Installer NeoForge': 'Install NeoForge',
	'Télécharger le mod': 'Download the mod',
	'Ranger le fichier': 'Place the file',
	'Vérifier en jeu': 'Check in game',
	'Créer un souvenir': 'Create a memory',
	'Un autre launcher': 'Another launcher',
	'Copié !': 'Copied!',
	'Sélectionne le texte ci-dessus pour le copier.': 'Select the text above to copy it.',
	Copier: 'Copy',
	'Il te faut': 'You need',
	'Minecraft Java Edition sur ordinateur': 'Minecraft Java Edition on a computer',
	'. Le mod n’est pas disponible pour Bedrock, les consoles ou les mobiles.':
		'. The mod is not available for Bedrock, consoles or mobile devices.',
	'Ce parcours détaille NeoForge, qui permet au jeu de charger le mod. Les autres versions validées sont indiquées dans':
		'This guide covers NeoForge, which lets the game load the mod. Other validated versions are listed under',
	'Versions du mod': 'Mod versions',
	'Pour découvrir Minemories, commence dans un': 'To discover Minemories, start in a',
	'nouveau monde de test': 'new test world',
	'. Tu peux exporter une capture sans compte ; pour la consulter sur le site, relie le mod à ta galerie privée.':
		'. You can export a capture without an account; to view it on the site, link the mod to your private gallery.',
	'Je veux utiliser mon monde ou mon serveur habituel': 'I want to use my usual world or server',
	'Fais une copie du monde et du profil avant toute modification. Un profil (ou une instance) regroupe le jeu, ses mods et ses réglages. Garde tous les mods attendus par ton monde ou ton serveur. Ne change pas sa version ou son loader pour ce tuto : s’il n’utilise pas déjà Java 1.21.1 et NeoForge 21.1.248, demande de l’aide à son responsable.':
		'Copy the world and profile before making changes. A profile (or instance) groups the game, its mods and settings. Keep all mods required by your world or server. Do not change its version or loader for this tutorial: if it does not already use Java 1.21.1 and NeoForge 21.1.248, ask its administrator for help.',
	'Minemories s’installe sur ton ordinateur, pas sur le serveur. Vérifie les règles du serveur avant de capturer.':
		'Minemories installs on your computer, not on the server. Check the server rules before capturing.',
	'Dans Minecraft Launcher, ouvre': 'In Minecraft Launcher, open',
	'Installations → Nouvelle installation': 'Installations → New installation',
	', choisis la version': ', choose version',
	'et lance-la une fois. Ferme le jeu et le launcher.': 'and launch it once. Close the game and launcher.',
	Installe: 'Install',
	'Java 21 (Temurin, site officiel)': 'Java 21 (Temurin, official site)',
	'si tu ne l’as pas. Choisis ton système, le JDK 21 et l’architecture de ton ordinateur : x64 pour Intel/AMD, aarch64 pour Apple Silicon. Le Java fourni à Minecraft n’est pas toujours disponible pour ouvrir un installateur.':
		"if you do not have it. Choose your system, JDK 21 and your computer's architecture: x64 for Intel/AMD, aarch64 for Apple Silicon. The Java bundled with Minecraft is not always available to open an installer.",
	Télécharge: 'Download',
	'l’installateur NeoForge 21.1.248': 'the NeoForge 21.1.248 installer',
	'. Ouvre': '. Open',
	ce: 'this',
	'fichier avec Java, coche': 'file with Java, select',
	', puis valide. Attends le message de réussite.': ', then confirm. Wait for the success message.',
	'Rouvre Minecraft Launcher. Dans': 'Reopen Minecraft Launcher. Under',
	', coche l’affichage des versions': ', enable display of',
	'Modifiées / Modded': 'Modded',
	'si besoin. Édite l’installation NeoForge créée avec':
		'versions if necessary. Edit the NeoForge installation created using',
	'… → Modifier → Plus d’options': '… → Edit → More options',
	'. Vérifie que sa version contient': '. Check that its version contains',
	Dans: 'Under',
	'Dossier du jeu / Game Directory': 'Game Directory',
	', choisis un nouveau dossier dédié à Minemories avec': ', choose a new folder dedicated to Minemories using',
	Parcourir: 'Browse',
	'. Par exemple :': '. For example:',
	'Copier le dossier de jeu proposé': 'Copy the suggested game folder',
	'Colle %APPDATA% dans la barre d’adresse de l’Explorateur, puis crée le dossier .minecraft-minemories.':
		"Paste %APPDATA% into File Explorer's address bar, then create the .minecraft-minemories folder.",
	'Le signe ~ désigne ton dossier utilisateur. Crée le dossier proposé avec ton gestionnaire de fichiers, puis sélectionne-le dans le launcher.':
		'The ~ symbol means your user directory. Create the suggested folder in your file manager, then select it in the launcher.',
	'Enregistre, lance une fois': 'Save, launch',
	'cette installation NeoForge': 'this NeoForge installation',
	', puis ferme Minecraft. Cela crée le dossier': 'once, then close Minecraft. This creates the folder',
	'. Si Java ou NeoForge bloque, ouvre l’aide en bas de la page avant de continuer.':
		'. If Java or NeoForge gets stuck, open the help at the bottom of this page before continuing.',
	'Guide officiel Java et NeoForge': 'Official Java and NeoForge guide',
	'. Le parcours Minecraft Launcher reste à valider en jeu avec le JAR distribué.':
		'. The Minecraft Launcher walkthrough still needs in-game validation with the distributed JAR.',
	'Dans Prism Launcher, ATLauncher, GDLauncher ou MultiMC, crée une instance':
		'In Prism Launcher, ATLauncher, GDLauncher or MultiMC, create a',
	'et ajoute le loader': 'instance and add loader',
	'. Les boutons diffèrent selon l’application.': '. Buttons vary between applications.',
	'Pour un monde existant, copie son instance compatible et conserve ses mods. Si ton launcher ne propose pas exactement ces versions, ne choisis pas une autre version au hasard : utilise le parcours Minecraft Launcher ou demande de l’aide.':
		'For an existing world, copy its compatible instance and keep its mods. If your launcher does not offer these exact versions, do not choose a random alternative: use the Minecraft Launcher walkthrough or ask for help.',
	'Lance cette instance une fois, puis ferme le jeu. Ce parcours reste à valider en jeu.':
		'Launch this instance once, then close the game. This walkthrough still needs in-game validation.',
	Ouvre: 'Open',
	', choisis Minecraft, puis': ', choose Minecraft, then',
	'Create Custom Profile / Créer un profil personnalisé': 'Create Custom Profile',
	'Nomme-le Minemories, choisis': 'Name it Minemories, choose',
	', le type': ', type',
	'et sa version': 'and version',
	'. Pour un modpack existant compatible, duplique plutôt son profil et garde ses mods.':
		'. For an existing compatible modpack, duplicate its profile instead and keep its mods.',
	'Lance le profil une fois, puis ferme le jeu. Si le profil copié est verrouillé, autorise sa modification dans ses options.':
		'Launch the profile once, then close the game. If the copied profile is locked, allow editing in its options.',
	'et connecte ton compte Minecraft.': 'and sign in to your Minecraft account.',
	'Crée une instance': 'Create an instance running',
	avec: 'with',
	'. Dans ses réglages, sélectionne le loader': '. In its settings, select loader',
	'. Pour un modpack existant compatible, duplique son instance et garde ses mods.':
		'. For an existing compatible modpack, duplicate its instance and keep its mods.',
	'Lance cette instance une fois, puis ferme le jeu.': 'Launch this instance once, then close the game.',
	'Ce parcours avec un fichier local reste à valider en jeu.':
		'This local-file walkthrough still needs in-game validation.',
	'Aide officielle Modrinth App': 'Official Modrinth App help',
	'Dans Minecraft Launcher → Installations, retrouve le profil NeoForge configuré à l’étape 2 et clique sur son':
		'In Minecraft Launcher → Installations, find the NeoForge profile configured in step 2 and click its',
	'icône de dossier': 'folder icon',
	'. Vérifie que c’est le dossier de jeu dédié que tu as choisi.':
		'. Check that this is the dedicated game directory you chose.',
	'Dans CurseForge, ouvre le menu': 'In CurseForge, open the',
	'du profil Minemories, puis': 'menu of the Minemories profile, then',
	'Open Folder / Ouvrir le dossier': 'Open Folder',
	'Dans Modrinth App, ouvre le dossier de l’instance Minemories avec son':
		'In Modrinth App, open the Minemories instance folder using its',
	'ou son menu.': 'or its menu.',
	'Dans ton launcher, ouvre le': 'In your launcher, open the',
	'dossier de l’instance': 'instance folder',
	'NeoForge 21.1.248 choisie. Utilise le bouton de dossier ou le menu de cette instance.':
		"of your chosen NeoForge 21.1.248 instance. Use that instance's folder button or menu.",
	'Ferme Minecraft complètement': 'Close Minecraft completely',
	'avant de copier le fichier.': 'before copying the file.',
	'Ouvre le sous-dossier': 'Open the subfolder',
	'. S’il manque, crée un dossier nommé exactement': '. If it is missing, create a folder named exactly',
	', en minuscules.': ', in lowercase.',
	'Depuis tes': 'From your',
	Téléchargements: 'Downloads',
	', copie le JAR Minemories dans': ', copy the Minemories JAR into',
	'. Garde une seule version de Minemories : retire son ancien JAR si tu mets à jour.':
		'. Keep only one Minemories version: remove its old JAR when updating.',
	'Emplacement du fichier': 'File location',
	'Dossier du profil NeoForge': 'NeoForge profile folder',
	'Le fichier reste un': 'The file stays a',
	': ne le décompresse pas, ne le lance pas et ne le place pas dans': ': do not extract it, run it or put it in',
	'. Il n’y a rien à installer côté serveur.': '. There is nothing to install on the server.',
	'Relance Minecraft depuis': 'Restart Minecraft from',
	', avec le profil': ', using the',
	'que tu viens de préparer.': 'profile you just prepared.',
	'Dans le menu du jeu, ouvre': 'In the game menu, open',
	'et cherche': 'and look for',
	'Crée un petit monde de test, attends que le terrain soit chargé, puis appuie sur':
		'Create a small test world, wait for terrain to load, then press',
	'. Le menu Minemories doit s’ouvrir.': '. The Minemories menu should open.',
	'Tu vois le menu Minemories ? L’installation est reconnue.':
		'Can you see the Minemories menu? The installation is recognized.',
	'La prochaine étape vérifie aussi qu’une capture fonctionne.': 'The next step also checks that capturing works.',
	'Si M ouvre autre chose, va dans': 'If M opens something else, go to',
	'Options → Contrôles → Attribution des touches → Minemories': 'Options → Controls → Key Binds → Minemories',
	'et choisis une touche libre. Tu peux aussi chercher le bouton Minemories dans le menu pause ou les options.':
		'and choose an unused key. You can also find the Minemories button in the pause menu or options.',
	'Pour ton premier essai, approche-toi d’une petite construction et attends que le terrain soit chargé. Ouvre le chat avec':
		'For your first attempt, approach a small build and wait for terrain to load. Open chat with',
	', colle cette commande, puis appuie sur Entrée :': ', paste this command, then press Enter:',
	'Copier la commande de première capture': 'Copy the first capture command',
	'Attends le message de fin d’export. Le nombre 16 désigne un rayon de 16 blocs : cette petite capture permet de vérifier le résultat avant de capturer une grande zone.':
		'Wait for the export completion message. The number 16 means a radius of 16 blocks: this small capture lets you check the result before capturing a large area.',
	'Ouvre le dossier ci-dessous': 'Open the folder below',
	'en collant ce chemin dans la barre d’adresse de l’Explorateur':
		"by pasting this path into File Explorer's address bar",
	'avec ton gestionnaire de fichiers (~ désigne ton dossier utilisateur)':
		'using your file manager (~ means your user directory)',
	', puis retrouve': ', then find',
	'Copier le dossier du premier souvenir': 'Copy the first memory folder',
	'Pour revoir le souvenir dans le navigateur, relie Minecraft à ta galerie privée puis envoie la capture depuis le mod.':
		'To revisit the memory in your browser, link Minecraft to your private gallery, then upload the capture from the mod.',
	'Retrouver le souvenir dans ma galerie privée': 'Find the memory in my private gallery',
	'Génère le code d’appairage à six chiffres. Dans Minecraft, appuie sur M, entre ce code et connecte ton compte. Le code expire après cinq minutes : génère-en un nouveau si nécessaire.':
		'Generate the six-digit pairing code. In Minecraft, press M, enter the code and connect your account. The code expires after five minutes: generate another if needed.',
	'Clique sur': 'Click',
	'Capturer et envoyer / Capture and upload': 'Capture and upload',
	'dans le menu M. Attends la confirmation, puis vérifie que la capture apparaît dans la galerie.':
		'in the M menu. Wait for confirmation, then check that the capture appears in the gallery.',
	'Les captures AFK sont actives par défaut après 5 minutes d’inactivité, au plus toutes les 4 heures. Une fois le compte lié, elles sont envoyées automatiquement dans ta galerie privée. Tu peux les désactiver dans M. Sans compte lié, elles restent sur ton ordinateur.':
		'AFK captures are enabled by default after 5 minutes of inactivity, at most once every 4 hours. Once your account is linked, they upload automatically to your private gallery. You can disable them in M. Without a linked account, they stay on your computer.',
	'Le dossier d’export peut être changé dans les réglages avancés du mod.':
		"The export folder can be changed in the mod's advanced settings.",
	'En savoir plus sur les captures et le partage': 'Learn more about captures and sharing',
	'Le JAR est le fichier du mod. Télécharge-le ici, depuis le site ; il n’est pas encore publié dans les catalogues CurseForge et Modrinth. Même avec ces applications, on ajoute donc le fichier à la main.':
		'The JAR is the mod file. Download it here, from the site; it is not yet published in the CurseForge and Modrinth catalogs. Even with these applications, you add the file manually.',
	'Le JAR Minemories se copie dans le jeu. Seul l’installateur NeoForge de l’étape précédente s’exécute avec Java.':
		'The Minemories JAR is copied into the game. Only the NeoForge installer from the previous step runs with Java.',
	'Choisir Minecraft 1.21.1': 'Choose Minecraft 1.21.1',
	'Minecraft Launcher → Installations → Nouvelle installation : sélectionner release 1.21.1.':
		'Minecraft Launcher → Installations → New installation: select release 1.21.1.',
	'Installer Java 21 sur Windows': 'Install Java 21 on Windows',
	'Temurin : choisir Windows, Java 21 et l’architecture du PC, puis terminer l’installation.':
		'Temurin: choose Windows, Java 21 and your PC architecture, then finish installation.',
	'Installer NeoForge côté joueur': 'Install NeoForge on the client',
	'Dans l’installateur NeoForge 21.1.248, cocher Install client, puis valider.':
		'In the NeoForge 21.1.248 installer, select Install client, then confirm.',
	'Choisir le dossier du profil NeoForge': 'Choose the NeoForge profile folder',
	'Modifier le profil : vérifier 21.1.248 et sélectionner le dossier .minecraft-minemories dans Dossier du jeu.':
		'Edit the profile: check 21.1.248 and select the .minecraft-minemories folder under Game Directory.',
	'Retrouver le JAR téléchargé': 'Find the downloaded JAR',
	'Dans Téléchargements, retrouver minemories-neoforge-mc1.21.1.jar. Ce fichier se copie ; il ne s’ouvre pas.':
		'In Downloads, find minemories-neoforge-mc1.21.1.jar. Copy this file; do not open it.',
	'Déposer le JAR dans mods': 'Place the JAR in mods',
	'Dans l’Explorateur Windows, le dossier mods du bon profil contient une seule version du JAR Minemories.':
		"In Windows File Explorer, the correct profile's mods folder contains only one version of the Minemories JAR.",
	'Vérifier que Minecraft reconnaît Minemories': 'Check that Minecraft recognizes Minemories',
	'Dans le menu Mods du jeu, Minemories apparaît dans la liste.':
		"In the game's Mods menu, Minemories appears in the list.",
	'Ouvrir le menu avec M': 'Open the menu with M',
	'Dans un monde de test, la touche M ouvre le menu Minemories.':
		'In a test world, the M key opens the Minemories menu.',
	'Créer une petite capture locale': 'Create a small local capture',
	'Dans le chat, /minemories export 16 se termine par un message confirmant l’export.':
		'In chat, /minemories export 16 ends with an export confirmation message.',
	'Revoir le premier souvenir en 3D': 'Revisit the first memory in 3D',
	'Après envoi depuis le mod, ouvre la capture de ta galerie privée pour la revoir en 3D.':
		'After uploading from the mod, open the capture in your private gallery to revisit it in 3D.',
	'Capture d’écran à venir': 'Screenshot coming soon',
	'Repère visuel · Windows': 'Visual reference · Windows',
	'Clique sur l’image pour l’agrandir.': 'Click the image to enlarge it.',
	'Vérification du téléchargement…': 'Checking the download…',
	'Télécharger Minemories': 'Download Minemories',
	'Préversion expérimentale.': 'Experimental prerelease.',
	'Version publiée.': 'Published release.',
	'MiB · Téléchargement depuis GitHub Releases.': 'MiB · Download from GitHub Releases.',
	'Place ce fichier directement dans le dossier': "Place this file directly in the profile's folder",
	'du profil. Ne le décompresse pas et ne le lance pas par double-clic.':
		'. Do not extract it or run it by double-clicking.',
	'Vérifier le fichier téléchargé (avancé)': 'Verify the downloaded file (advanced)',
	'Empreinte SHA-256 :': 'SHA-256 checksum:',
	'Télécharger l’empreinte': 'Download checksum',
	'Aucune release compatible n’est disponible pour le moment, ou GitHub ne répond pas. Consulte les versions du projet ou réessaie dans un instant.':
		"No compatible release is available right now, or GitHub is not responding. Check the project's releases or try again shortly.",
	'Réessayer le téléchargement': 'Retry download',
	'Versions précédentes et nouveautés': "Previous versions and what's new",
	'Toutes les versions sur GitHub': 'All releases on GitHub',
}

Object.assign(guideEnglishMessages, {
	'Lecture du fichier…': 'Reading the file…',
	'Chargement du modèle et des textures…': 'Loading the model and textures…',
	'Préparation de l’affichage 3D…': 'Preparing the 3D display…',
	'Téléchargement du souvenir…': 'Downloading the memory…',
})
