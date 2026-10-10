import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ModDownload } from './ModDownload'

export const infoLinks = [
	{ to: '/concept', label: 'Le concept' },
	{ to: '/fonctionnement', label: 'Comment ça marche' },
	{ to: '/installation', label: 'Installer le mod' },
	{ to: '/faq', label: 'FAQ' },
]

export function InfoNavigation() {
	return (
		<nav aria-label="Guides Minemories" className="flex flex-wrap gap-x-5 gap-y-3 py-5 text-sm">
			{infoLinks.map(link => (
				<Link key={link.to} to={link.to} className="underline">
					{link.label}
				</Link>
			))}
		</nav>
	)
}

function InfoPage({ title, children }: { title: string; children: ReactNode }) {
	return (
		<article
			lang="fr"
			className="mx-auto max-w-3xl px-6 py-10 text-base leading-relaxed [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mt-6 [&_h3]:font-bold [&_p]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-3 [&_a]:underline [&_code]:break-all"
		>
			<InfoNavigation />
			<h1 className="text-3xl font-bold">{title}</h1>
			{children}
			<InfoNavigation />
		</article>
	)
}

export function ConceptPage() {
	return (
		<InfoPage title="Les constructions restent, même quand la saison se termine">
			<p>
				Une base construite entre amis, un château avec son enfant, un premier village : ce sont aussi des souvenirs.
				Quand le serveur ferme, retrouver les bonnes versions et tous les mods pour les revoir peut devenir compliqué.
			</p>
			<p>
				Minemories transforme une zone de Minecraft en souvenir 3D que tu peux ouvrir dans ton navigateur. Une fois la
				capture créée, tu peux la revisiter sans relancer Minecraft ni réinstaller le modpack.
			</p>
			<h2>Un souvenir à regarder, une sauvegarde à garder</h2>
			<p>
				La capture est une image en trois dimensions d’un lieu à un moment donné. Tu peux regarder autour, mais pas
				reprendre ta partie, casser des blocs ou récupérer ton inventaire. Garde aussi une sauvegarde du monde pour
				continuer à jouer : le souvenir 3D ne la remplace pas.
			</p>
			<h2>Pour toi et les personnes avec qui tu joues</h2>
			<p>
				À la fin d’une saison, l’admin peut capturer les lieux du groupe avant de fermer le serveur. Un parent peut
				garder une construction faite avec son enfant. Un joueur occasionnel peut revoir sa maison, et un créateur de
				modpack peut conserver une trace de ses constructions modifiées.
			</p>
			<h2>Ce que tu peux faire aujourd’hui</h2>
			<p>
				Capturer depuis le mod expérimental, ouvrir le fichier local, envoyer une capture dans une galerie privée et
				créer volontairement un lien de partage. Une personne qui reçoit ce lien peut regarder la capture sans compte ni
				mod.
			</p>
			<p>
				Le timelapse, la récupération directe d’anciens dossiers de monde, l’impression 3D et le support de tous les
				loaders font partie des pistes du projet. Ils ne sont pas proposés aujourd’hui. La conservation en ligne à vie
				n’est pas garantie : garde tes fichiers locaux.
			</p>
			<p>
				<Link to="/fonctionnement">Créer mon premier souvenir, étape par étape</Link>
			</p>
		</InfoPage>
	)
}

export function HowItWorksPage() {
	return (
		<InfoPage title="Du monde Minecraft au souvenir 3D">
			<h2>1. Installer et ouvrir le monde</h2>
			<p>
				<Link to="/installation">Installe le mod</Link> sur ton ordinateur, puis ouvre ton monde ou rejoins ton serveur
				avec son profil habituel compatible. Le serveur doit encore être accessible pour capturer ses constructions.
			</p>
			<h2>2. Choisir une petite zone et capturer</h2>
			<p>
				Pour un premier essai, place-toi près de la construction et écris <code>/minemories export 16</code> dans le
				chat. 16 est le rayon en blocs autour de toi ; les valeurs acceptées vont de 2 à 128. Commence petit : une
				grande zone peut ralentir le jeu. Le mod capture ce que le client a chargé, pas tout le serveur.
			</p>
			<p>
				Pour une zone précise, place-toi au premier coin et saisis <code>/minemories select first</code>, puis au coin
				opposé avec <code>/minemories select second</code>. Ces deux positions définissent aussi la hauteur. Vérifie
				avec <code>/minemories select status</code>, puis lance <code>/minemories export selection</code>.
				<code> /minemories select clear</code> efface la sélection.
			</p>
			<p>
				La touche M ouvre le menu Minemories. En mode simple, entre le code de ta galerie puis clique sur « Capturer et
				envoyer ». Le bouton devient disponible quand ton compte est connecté et qu’un monde est ouvert. Si M est déjà
				utilisée, change son raccourci dans les contrôles de Minecraft.
			</p>
			<h2>3. Revoir le fichier sur ton ordinateur</h2>
			<p>
				Le résultat est un fichier <code>capture.glb</code> dans le dossier <code>export</code> de ton dossier
				utilisateur (<code>~/export/capture.glb</code>) par défaut, pas dans le dossier du monde. En mode avancé, tu
				peux choisir un autre dossier et cliquer sur « Exporter en local » sans connecter de compte. GLB signifie ici un
				fichier 3D contenant les formes et les textures. Chaque export remplace ce fichier : copie-le et renomme-le
				avant la capture suivante.
			</p>
			<p>
				Sur le site, utilise « Open a local GLB » et choisis ce fichier. Aucun compte n’est nécessaire pour l’ouvrir
				localement. Cette ouverture ne l’ajoute pas à la galerie en ligne.
			</p>
			<h2>4. Envoyer dans ta galerie, si tu le souhaites</h2>
			<ol>
				<li>
					<Link to="/register">Crée ton compte</Link> ou <Link to="/login">connecte-toi</Link>, puis ouvre{' '}
					<Link to="/gallery">My gallery</Link>.
				</li>
				<li>Génère un code d’appairage dans la galerie. L’appairage relie ce Minecraft à ton compte Minemories.</li>
				<li>
					Dans le chat de Minecraft, saisis <code>/minemories pair CODE</code> en remplaçant CODE par les six chiffres.
					Le code expire après cinq minutes et ne sert qu’une fois. Aucun mot de passe n’est à écrire dans Minecraft.
				</li>
				<li>
					Saisis <code>/minemories upload</code> pour envoyer la capture, puis vérifie son apparition dans la galerie.
					Le mod accepte un fichier jusqu’à 200 MiB (environ 210 Mo). En cas de dépassement, capture une zone plus
					petite.
				</li>
			</ol>
			<p>
				Les captures AFK sont actives par défaut : après 5 minutes d’inactivité, au plus une fois toutes les 4 heures,
				même dans le menu pause ou quand Minecraft est en arrière-plan. Sans compte connecté, elles restent dans ton
				dossier local. Avec un compte connecté, elles sont aussi envoyées dans ta galerie privée. Tu peux les désactiver
				en mode simple ; le mode avancé permet de régler les délais et le rayon de capture (32 blocs par défaut). Une
				préférence de désactivation déjà enregistrée est conservée.
			</p>
			<h2>Utiliser sa propre API (avancé)</h2>
			<p>
				Le mod utilise <code>https://api.minemories.xenos.lightin.io</code> par défaut. Dans « Mode avancé », tu peux
				renseigner l’adresse HTTPS d’une API Minemories auto-hébergée compatible et un chemin absolu pour le dossier
				local, puis cliquer sur « Enregistrer ». HTTP est accepté uniquement pour une API sur localhost. Changer d’API
				déconnecte le compte : génère ensuite le code dans la galerie correspondant à cette nouvelle API. Le bouton «
				API Minemories » restaure l’adresse officielle ; enregistre pour l’appliquer.
			</p>
			<h2>5. Partager seulement ce que tu choisis</h2>
			<p>
				La galerie est privée par défaut. Sur une capture, « Share » puis « Create a link » crée un lien accessible à
				toute personne qui le possède ; elle peut le transmettre à son tour. Tu peux révoquer le lien depuis ce panneau,
				mais cela ne supprime pas les copies déjà enregistrées par quelqu’un.
			</p>
			<p>
				Avant de partager, vérifie la capture et les informations associées : des coordonnées, le nom du serveur ou du
				monde, et la graine du monde solo peuvent être enregistrés. Évite les lieux ou textes contenant des informations
				personnelles et demande l’accord des autres constructeurs.
			</p>
		</InfoPage>
	)
}

export function InstallationPage() {
	return (
		<InfoPage title="Installer le mod Minemories">
			<p>
				Tu veux seulement regarder un souvenir partagé ? Ouvre son lien : tu n’as rien à installer. Le mod sert à créer
				une capture depuis Minecraft sur un ordinateur.
			</p>
			<h2>Avant de commencer</h2>
			<p>
				La seule combinaison testée est <strong>Minecraft Java Edition 1.21.1 + NeoForge 21.1.248</strong>. Bedrock,
				consoles et mobiles ne sont pas pris en charge pour capturer. Fabric, Quilt et Forge ne sont pas encore
				supportés.
			</p>
			<p>
				Un launcher (CurseForge, Modrinth ou Minecraft Launcher) lance le jeu. Un profil, aussi appelé instance,
				contient une version du jeu et ses mods. NeoForge est le loader qui permet à Minecraft de charger Minemories.
				Forge et NeoForge sont différents.
			</p>
			<p>
				Fais une copie de ton monde et de ton profil avant toute modification. Ne convertis pas un vieux monde ou un
				modpack Fabric pour suivre ce tuto : demande une version compatible à son responsable.
			</p>
			<h2>Télécharger le mod</h2>
			<ModDownload />
			<p>
				Le JAR est le fichier du mod. Un ZIP ajouterait une étape d’extraction inutile. Les publications dans les
				catalogues CurseForge et Modrinth sont en préparation.
			</p>
			<p>
				Tu utilises Prism Launcher, ATLauncher, GDLauncher ou MultiMC ? Ouvre le dossier de l’instance compatible et
				place le même JAR dans <code>mods</code>. Les launchers qui proposent Modrinth ou CurseForge pourront utiliser
				ces catalogues après publication. Leur parcours Minemories reste à valider en jeu.
			</p>
			<nav aria-label="Méthodes d’installation" className="flex flex-wrap gap-5">
				<a href="#curseforge">Avec CurseForge</a>
				<a href="#modrinth">Avec Modrinth</a>
				<a href="#manuel">Manuellement</a>
			</nav>
			<h2 id="curseforge">Avec CurseForge</h2>
			<ol>
				<li>Installe et ouvre l’application CurseForge depuis son site officiel, puis choisis Minecraft.</li>
				<li>
					Pour un nouveau monde, crée un profil personnalisé en Minecraft 1.21.1 avec NeoForge 21.1.248. Pour un serveur
					ou un monde existant, utilise une copie de son profil compatible avec ces versions et tous ses mods.
				</li>
				<li>
					Dans le menu du profil, ouvre son dossier (« Open Folder » ou « Ouvrir le dossier »). Si le pack est
					verrouillé, autorise sa modification dans les options du profil copié.
				</li>
				<li>
					Ferme Minecraft. Place le JAR Minemories dans le sous-dossier <code>mods</code> de ce profil. Crée ce
					sous-dossier s’il manque. Ne le place pas dans <code>saves</code> ni dans un autre profil.
				</li>
				<li>Relance le jeu depuis ce profil CurseForge et suis la vérification ci-dessous.</li>
			</ol>
			<p>
				<a href="https://support.curseforge.com/support/solutions/articles/9000218572-getting-started">
					Guide officiel CurseForge
				</a>
			</p>
			<h2 id="modrinth">Avec Modrinth</h2>
			<ol>
				<li>
					Installe et ouvre Modrinth App depuis son site officiel, puis connecte ton compte Minecraft dans
					l’application.
				</li>
				<li>
					Crée une instance Minecraft 1.21.1 avec NeoForge, puis sélectionne la version 21.1.248 du loader dans ses
					paramètres. Pour un monde ou serveur existant, conserve une copie de son instance compatible et ses mods.
				</li>
				<li>
					Depuis cette instance, ouvre son dossier avec le bouton de dossier ou son menu. Les noms des boutons peuvent
					changer suivant la langue et la version de l’application.
				</li>
				<li>
					Ferme Minecraft et copie le JAR Minemories dans le sous-dossier <code>mods</code> de cette instance, à créer
					s’il manque. Garde une seule version de Minemories dans ce dossier.
				</li>
				<li>
					Lance cette instance. Ce parcours utilise un JAR local ; il ne signifie pas que Minemories est publié sur
					Modrinth. Le parcours Modrinth reste à essayer en jeu.
				</li>
			</ol>
			<p>
				<a href="https://support.modrinth.com/en/collections/7804910-modrinth-app">Aide officielle Modrinth App</a>
			</p>
			<h2 id="manuel">Manuellement avec Minecraft Launcher</h2>
			<ol>
				<li>Installe Minecraft Java Edition et lance une fois la version 1.21.1, puis ferme le jeu.</li>
				<li>
					Installe Java 21 en 64 bits si nécessaire, en suivant le guide NeoForge lié ci-dessous. Java est le programme
					nécessaire pour exécuter son installateur.
				</li>
				<li>
					Ferme aussi Minecraft Launcher. Depuis le site officiel NeoForge, choisis exactement l’installateur 21.1.248
					pour Minecraft 1.21.1. Ouvre-le avec Java, sélectionne « Install client » et termine l’installation.
				</li>
				<li>
					Dans Minecraft Launcher, sélectionne l’installation NeoForge créée. Dans « Installations », édite ce profil et
					choisis un dossier de jeu distinct pour éviter de mélanger tes mods et tes mondes.
				</li>
				<li>
					Lance ce profil une fois, ferme le jeu, puis ouvre son dossier de jeu. Copie le JAR Minemories dans son
					sous-dossier <code>mods</code>. Pour un monde existant, utilise une copie de sa sauvegarde et ses mods
					compatibles.
				</li>
				<li>Relance le profil NeoForge, pas le profil vanilla. Ce parcours manuel reste à essayer en jeu.</li>
			</ol>
			<p>
				<a href="https://neoforged.net/">Site officiel NeoForge</a> ·{' '}
				<a href="https://docs.neoforged.net/user/docs/">Java et installation NeoForge</a>
			</p>
			<h2>Vérifier que c’est installé</h2>
			<p>
				Dans le menu « Mods » du jeu, cherche Minemories. Ouvre un monde de test, appuie sur M ou saisis
				<code> /minemories export 16</code>. Tu dois obtenir un message de fin d’export et un fichier
				<code> ~/export/capture.glb</code>.{' '}
				<Link to="/fonctionnement">Ouvre ensuite ton premier souvenir sur le site</Link>.
			</p>
			<h2>Si ça bloque</h2>
			<p>
				Mod absent ou commande inconnue : vérifie le profil lancé et son dossier mods. Crash au démarrage : vérifie les
				deux versions exactes et retire les doublons ; retire le JAR Minemories pour revenir au profil précédent. Si
				21.1.248 n’est pas disponible dans ton launcher, ne choisis pas une autre version au hasard.
			</p>
			<p>
				Tu administres un serveur ? Ce mod s’installe côté joueur, pas comme plugin Paper/Spigot. Vérifie les règles du
				serveur avant de capturer ; cette page ne garantit pas la compatibilité avec chaque serveur ou modpack.
			</p>
		</InfoPage>
	)
}

const questions = [
	[
		'Est-ce une sauvegarde de mon monde ?',
		'Non. C’est un modèle 3D figé d’une zone chargée dans le jeu. Il ne permet pas de reprendre la partie. Conserve ta sauvegarde Minecraft à côté.',
	],
	[
		'Faut-il un compte ou un mod pour regarder ?',
		'Un lien partagé s’ouvre sans compte et sans mod. Un fichier GLB local s’ouvre aussi sans compte. Un compte Minemories est nécessaire pour envoyer dans ta galerie privée.',
	],
	[
		'Puis-je garder une construction vanilla ?',
		'Oui, si tu peux ouvrir une copie du monde Java 1.21.1 avec NeoForge 21.1.248 et Minemories. Vanilla signifie sans mods : le profil utilisé pour capturer doit néanmoins charger le mod. Bedrock et les consoles ne sont pas supportés.',
	],
	[
		'Est-ce compatible avec tous les mods ?',
		'Non, ce n’est pas garanti. Seule la combinaison Java 1.21.1 et NeoForge 21.1.248 est testée. Les blocs avec un rendu particulier peuvent être incomplets. Fais une petite capture et regarde le résultat avant de capturer toute ta base.',
	],
	[
		'Dois-je installer quelque chose sur le serveur ?',
		'Minemories est un mod client, sur l’ordinateur du joueur. Ce n’est pas un plugin serveur. Demande l’accord de l’admin, garde le profil attendu par le serveur et capture seulement les zones autorisées et chargées.',
	],
	[
		'Qui peut voir les souvenirs de mon enfant ?',
		'La galerie est privée par défaut. Un lien créé avec Share donne accès à la capture à toute personne qui le possède, qui peut aussi le retransmettre. Vérifie le souvenir et ses informations avec ton enfant avant de partager. Révoquer le lien empêche les futurs accès par ce lien, pas les copies déjà faites.',
	],
	[
		'Est-ce que le mod envoie tout automatiquement ?',
		'Les captures AFK sont actives par défaut après 5 minutes d’inactivité, au plus une fois toutes les 4 heures, même en pause ou en arrière-plan. Sans compte lié, elles restent locales ; avec un compte lié, elles sont envoyées dans ta galerie privée. Le mode simple permet de les désactiver, le mode avancé de régler délai, fréquence et rayon (32 blocs par défaut). Une désactivation déjà enregistrée est conservée. Déconnecter le compte arrête les envois, mais conserve les captures locales. Le bouton Exporter en local n’envoie rien.',
	],
	[
		'Mon ancienne capture a disparu du dossier export : pourquoi ?',
		'Chaque export remplace capture.glb. Copie et renomme ce fichier avant le suivant. Les captures déjà envoyées restent distinctes dans la galerie. Garde aussi tes propres copies : aucune conservation en ligne à vie n’est promise.',
	],
	[
		'Puis-je récupérer un serveur déjà fermé ou importer un ZIP ?',
		'Pas directement aujourd’hui. Il faut pouvoir rouvrir le monde dans un environnement compatible pour capturer. L’import d’une sauvegarde ZIP et la récupération automatique d’anciens modpacks ne sont pas disponibles.',
	],
	[
		'Pourquoi une partie de la construction manque ?',
		'Le mod capture une zone et les éléments chargés par le client. Rapproche-toi du lieu, vérifie les coins et la hauteur de ta sélection, réduis la zone et recommence. Certains rendus moddés peuvent ne pas être reproduits.',
	],
	[
		'Le code ne marche pas ou l’envoi échoue : que faire ?',
		'Le code à six chiffres expire après cinq minutes et ne fonctionne qu’une fois : génère-en un nouveau dans la galerie. Vérifie ensuite ta connexion et la taille du GLB (200 MiB maximum depuis le mod). Conserve le fichier local et réessaie l’envoi.',
	],
	[
		'Y a-t-il un timelapse, une impression 3D ou un abonnement ?',
		'Le timelapse et l’impression 3D sont des pistes, pas des fonctions disponibles. Cette version expérimentale ne présente pas d’offre commerciale ni de tarif confirmé. Ne te base pas sur les anciens scénarios de prix du projet.',
	],
]

export function FaqPage() {
	return (
		<InfoPage title="Questions fréquentes">
			<p>
				Tu débutes ? Commence par <Link to="/concept">le concept</Link>, puis le{' '}
				<Link to="/installation">guide d’installation</Link>. Les noms entre guillemets correspondent aux boutons
				actuellement en anglais sur le site.
			</p>
			{questions.map(([question, answer]) => (
				<section key={question}>
					<h2>{question}</h2>
					<p>{answer}</p>
				</section>
			))}
			<p>
				<Link to="/fonctionnement">Toutes les étapes pour capturer, envoyer et partager</Link>
			</p>
			<p>Minemories est un projet indépendant, non officiel, ni approuvé par ni associé à Mojang ou Microsoft.</p>
		</InfoPage>
	)
}
