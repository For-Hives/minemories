import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { T, useI18n } from '../i18n/I18n'

export const infoLinks = [
	{ to: '/concept', label: 'Le concept' },
	{ to: '/fonctionnement', label: 'Comment ça marche' },
	{ to: '/installation', label: 'Installer le mod' },
	{ to: '/faq', label: 'FAQ' },
]

export function InfoNavigation() {
	const { t } = useI18n()

	return (
		<nav aria-label={t('Guides Minemories')} className="flex flex-wrap gap-x-5 gap-y-3 py-5 text-sm">
			{infoLinks.map(link => (
				<Link key={link.to} to={link.to} className="underline">
					{t(link.label)}
				</Link>
			))}
		</nav>
	)
}

function InfoPage({ title, children }: { title: string; children: ReactNode }) {
	const { locale, t } = useI18n()
	return (
		<article
			lang={locale}
			className="mx-auto max-w-3xl px-6 py-10 text-base leading-relaxed [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mt-6 [&_h3]:font-bold [&_p]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-3 [&_a]:underline [&_code]:break-all"
		>
			<InfoNavigation />
			<h1 className="text-3xl font-bold">{t(title)}</h1>
			{children}
			<InfoNavigation />
		</article>
	)
}

export function ConceptPage() {
	return (
		<InfoPage title="Les constructions restent, même quand la saison se termine">
			<p>
				<T
					message={
						'Une base construite entre amis, un château avec son enfant, un premier village : ce sont aussi des souvenirs. Quand le serveur ferme, retrouver les bonnes versions et tous les mods pour les revoir peut devenir compliqué.'
					}
				/>
			</p>
			<p>
				<T
					message={
						'Minemories transforme une zone de Minecraft en souvenir 3D que tu peux ouvrir dans ton navigateur. Une fois la capture créée, tu peux la revisiter sans relancer Minecraft ni réinstaller le modpack.'
					}
				/>
			</p>
			<h2>
				<T message={'Un souvenir à regarder, une sauvegarde à garder'} />
			</h2>
			<p>
				<T
					message={
						'La capture est une image en trois dimensions d’un lieu à un moment donné. Tu peux regarder autour, mais pas reprendre ta partie, casser des blocs ou récupérer ton inventaire. Garde aussi une sauvegarde du monde pour continuer à jouer : le souvenir 3D ne la remplace pas.'
					}
				/>
			</p>
			<h2>
				<T message={'Pour toi et les personnes avec qui tu joues'} />
			</h2>
			<p>
				<T
					message={
						'À la fin d’une saison, l’admin peut capturer les lieux du groupe avant de fermer le serveur. Un parent peut garder une construction faite avec son enfant. Un joueur occasionnel peut revoir sa maison, et un créateur de modpack peut conserver une trace de ses constructions modifiées.'
					}
				/>
			</p>
			<h2>
				<T message={'Ce que tu peux faire aujourd’hui'} />
			</h2>
			<p>
				<T
					message={
						'Capturer depuis le mod, envoyer une capture dans une galerie privée et créer volontairement un lien de partage. Une personne qui reçoit ce lien peut regarder la capture sans compte ni mod.'
					}
				/>
			</p>
			<p>
				<T
					message={
						'Le timelapse permet de parcourir les captures datées d’une même zone. La récupération directe d’anciens dossiers de monde, l’impression 3D et d’autres versions de Minecraft restent des pistes du projet. La conservation en ligne à vie n’est pas garantie : garde tes fichiers locaux.'
					}
				/>
			</p>
			<p>
				<Link to="/fonctionnement">
					<T message={'Créer mon premier souvenir, étape par étape'} />
				</Link>
			</p>
		</InfoPage>
	)
}

export function HowItWorksPage() {
	return (
		<InfoPage title="Du monde Minecraft au souvenir 3D">
			<h2>
				<T message={'1. Installer et ouvrir le monde'} />
			</h2>
			<p>
				<Link to="/installation">
					<T message={'Installe le mod'} />
				</Link>{' '}
				<T
					message={
						'sur ton ordinateur, puis ouvre ton monde ou rejoins ton serveur avec son profil habituel compatible. Le serveur doit encore être accessible pour capturer ses constructions.'
					}
				/>
			</p>
			<h2>
				<T message={'2. Choisir une petite zone et capturer'} />
			</h2>
			<p>
				<T message={'Pour un premier essai, place-toi près de la construction et écris'} />{' '}
				<code>/minemories export 16</code>{' '}
				<T
					message={
						'dans le chat. 16 est le rayon en blocs autour de toi ; les valeurs acceptées vont de 2 à 128. Commence petit : une grande zone peut ralentir le jeu. Le mod capture ce que le client a chargé, pas tout le serveur.'
					}
				/>
			</p>
			<p>
				<T
					message={
						'Le sous-sol est limité par défaut à la profondeur visitée dans cette zone, avec au moins cinq blocs de marge sous la position visitée. Descendre dans une grotte étend les prochaines captures de la zone. Le suivi commence avec cette version du mod et reste enregistré sur ton ordinateur. Des cavités au-dessus de cette limite peuvent encore apparaître. Le mode avancé permet de capturer toute la hauteur ; une sélection précise garde la hauteur de ses deux coins.'
					}
				/>
			</p>
			<p>
				<T message={'Pour une zone précise, place-toi au premier coin et saisis'} />{' '}
				<code>/minemories select first</code>
				<T message={', puis au coin opposé avec'} /> <code>/minemories select second</code>
				<T message={'. Ces deux positions définissent aussi la hauteur. Vérifie avec'} />{' '}
				<code>/minemories select status</code>
				<T message={', puis lance'} /> <code>/minemories export selection</code>.<code> /minemories select clear</code>{' '}
				<T message={'efface la sélection.'} />
			</p>
			<p>
				<T
					message={
						'La touche M ouvre le menu Minemories. En mode simple, entre le code de ta galerie puis clique sur « Capturer et envoyer ». Le bouton devient disponible quand ton compte est connecté et qu’un monde est ouvert. Si M est déjà utilisée, change son raccourci dans les contrôles de Minecraft.'
					}
				/>
			</p>
			<p>
				<T
					message={
						'Les côtés et le dessous de la capture sont refermés avec un aspect terre/pierre, comme une portion de monde extraite. Ce sont des faces ajoutées au souvenir 3D : aucun bloc n’est changé dans Minecraft.'
					}
				/>
			</p>
			<h2>
				<T message={'3. Revoir le fichier sur ton ordinateur'} />
			</h2>
			<p>
				<T message={'Le résultat est un fichier'} /> <code>capture.glb</code> <T message={'dans le dossier'} />{' '}
				<code>export</code> <T message={'de ton dossier utilisateur ('} />
				<code>~/export/capture.glb</code>
				<T
					message={
						') par défaut, pas dans le dossier du monde. En mode avancé, tu peux choisir un autre dossier et cliquer sur « Exporter en local » sans connecter de compte. GLB signifie ici un fichier 3D contenant les formes et les textures. Avec la version actuelle du mod, chaque capture datée est aussi conservée avec ses informations dans le sous-dossier'
					}
				/>{' '}
				<code>history</code>. <code>capture.glb</code>
				<T
					message={
						'permet de retrouver le dernier export. Dans le menu M, « Captures locales » permet de choisir et d’envoyer un ancien souvenir. Garde tes propres sauvegardes : l’historique utilise de la place sur ton ordinateur.'
					}
				/>
			</p>
			<p>
				<T
					message={
						'Pour le revoir sur le site, envoie ce souvenir depuis le menu M → Captures locales, puis ouvre-le dans ta galerie privée.'
					}
				/>
			</p>
			<h2>
				<T message={'4. Envoyer dans ta galerie, si tu le souhaites'} />
			</h2>
			<ol>
				<li>
					<Link to="/register">
						<T message={'Crée ton compte'} />
					</Link>{' '}
					<T message={'ou'} />{' '}
					<Link to="/login">
						<T message={'connecte-toi'} />
					</Link>
					<T message={', puis ouvre'} />{' '}
					<Link to="/gallery">
						<T message={'Ma galerie / My gallery'} />
					</Link>
					.
				</li>
				<li>
					<T
						message={
							'Génère un code d’appairage dans la galerie. L’appairage relie ce Minecraft à ton compte Minemories.'
						}
					/>
				</li>
				<li>
					<T message={'Dans le chat de Minecraft, saisis'} /> <code>/minemories pair CODE</code>{' '}
					<T
						message={
							'en remplaçant CODE par les six chiffres. Le code expire après cinq minutes et ne sert qu’une fois. Aucun mot de passe n’est à écrire dans Minecraft.'
						}
					/>
				</li>
				<li>
					<T message={'Saisis'} /> <code>/minemories upload</code>{' '}
					<T
						message={
							'pour envoyer la capture, puis vérifie son apparition dans la galerie. Le mod accepte un fichier jusqu’à 450 MiB (environ 472 Mo). En cas de dépassement, capture une zone plus petite.'
						}
					/>
				</li>
			</ol>
			<p>
				<T
					message={
						'Les captures AFK sont actives par défaut : après 5 minutes d’inactivité, au plus une fois toutes les 4 heures, même dans le menu pause ou quand Minecraft est en arrière-plan. Sans compte connecté, elles restent dans ton dossier local. Avec un compte connecté, elles sont aussi envoyées dans ta galerie privée. Tu peux les désactiver en mode simple ; le mode avancé permet de régler les délais et le rayon de capture (32 blocs par défaut). Une préférence de désactivation déjà enregistrée est conservée.'
					}
				/>
			</p>
			<h2>
				<T message={'Utiliser sa propre API (avancé)'} />
			</h2>
			<p>
				<T message={'Le mod utilise'} /> <code>https://api.minemories.xenos.lightin.io</code>{' '}
				<T
					message={
						'par défaut. Dans « Mode avancé », tu peux renseigner l’adresse HTTPS d’une API Minemories auto-hébergée compatible et un chemin absolu pour le dossier local, puis cliquer sur « Enregistrer ». HTTP est accepté uniquement pour une API sur localhost. Changer d’API déconnecte le compte : génère ensuite le code dans la galerie correspondant à cette nouvelle API. Le bouton « API Minemories » restaure l’adresse officielle ; enregistre pour l’appliquer.'
					}
				/>
			</p>
			<h2>
				<T message={'5. Partager seulement ce que tu choisis'} />
			</h2>
			<p>
				<T
					message={
						'La galerie est privée par défaut. Sur une capture, « Share » puis « Create a link » crée un lien accessible à toute personne qui le possède ; elle peut le transmettre à son tour. Tu peux révoquer le lien depuis ce panneau, mais cela ne supprime pas les copies déjà enregistrées par quelqu’un.'
					}
				/>
			</p>
			<p>
				<T
					message={
						'Avant de partager, vérifie la capture et les informations associées : des coordonnées, le nom du serveur ou du monde, et la graine du monde solo peuvent être enregistrés. Évite les lieux ou textes contenant des informations personnelles et demande l’accord des autres constructeurs.'
					}
				/>
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
		'Un lien partagé s’ouvre sans compte et sans mod. Un compte Minemories est nécessaire pour envoyer dans ta galerie privée.',
	],
	[
		'Puis-je garder une construction vanilla ?',
		'Oui, si tu peux ouvrir une copie du monde Java 1.21.1 avec NeoForge 21.1.248 et Minemories. Vanilla signifie sans mods : le profil utilisé pour capturer doit néanmoins charger le mod. Bedrock et les consoles ne sont pas supportés.',
	],
	[
		'Est-ce compatible avec tous les mods ?',
		'Non, ce n’est pas garanti. Les cibles Java 1.21.1 validées sont détaillées sur la page Versions du mod : NeoForge, Fabric, Forge et Quilt avec le JAR Fabric. Les blocs avec un rendu particulier peuvent être incomplets. Fais une petite capture et regarde le résultat avant de capturer toute ta base.',
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
		'Comment retrouver une ancienne capture ?',
		'Dans la version actuelle du mod, M → Captures locales affiche les captures datées conservées dans le sous-dossier history de ton dossier d’export. Tu peux choisir un souvenir et l’envoyer si ton compte est connecté. capture.glb reste le dernier export. Les anciennes versions du mod écrasaient ce fichier : la mise à jour conserve celui encore présent, mais ne récupère pas les fichiers déjà écrasés. Les captures locales ne sont pas supprimées automatiquement ; prévois de la place et tes propres sauvegardes. Aucune conservation en ligne à vie n’est promise.',
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
		'Le code à six chiffres expire après cinq minutes et ne fonctionne qu’une fois : génère-en un nouveau dans la galerie. Vérifie ensuite ta connexion et la taille du GLB (450 MiB maximum depuis le mod). Conserve le fichier local et réessaie l’envoi.',
	],
	[
		'Y a-t-il un timelapse, une impression 3D ou un abonnement ?',
		'Le timelapse relie les captures datées d’une même zone ; l’impression 3D reste une piste. Cette version expérimentale ne présente pas d’offre commerciale ni de tarif confirmé. Ne te base pas sur les anciens scénarios de prix du projet.',
	],
]

export function FaqPage() {
	const { t } = useI18n()
	return (
		<InfoPage title="Questions fréquentes">
			<p>
				<T message={'Tu débutes ? Commence par'} />{' '}
				<Link to="/concept">
					<T message={'le concept'} />
				</Link>
				<T message={', puis le'} />{' '}
				<Link to="/installation">
					<T message={'guide d’installation'} />
				</Link>
				<T message={'. Les commandes Minecraft et les noms de fichiers restent identiques dans les deux langues.'} />
			</p>
			{questions.map(([question, answer]) => (
				<section key={question}>
					<h2>{t(question ?? '')}</h2>
					<p>{t(answer ?? '')}</p>
				</section>
			))}
			<p>
				<Link to="/fonctionnement">
					<T message={'Toutes les étapes pour capturer, envoyer et partager'} />
				</Link>
			</p>
			<p>
				<T
					message={
						'Minemories est un projet indépendant, non officiel, ni approuvé par ni associé à Mojang ou Microsoft.'
					}
				/>
			</p>
		</InfoPage>
	)
}
