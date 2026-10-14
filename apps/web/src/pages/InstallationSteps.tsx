import { useState } from 'react'
import { Link } from 'react-router'
import type { Launcher, System } from './installation-state'
import { ModDownload } from './ModDownload'
import { WindowsScreenshot } from './WindowsScreenshot'

export const stepNames = [
	'Préparer',
	'Installer NeoForge',
	'Télécharger le mod',
	'Ranger le fichier',
	'Vérifier en jeu',
	'Créer un souvenir',
]
export const launcherNames: Record<Launcher, string> = {
	manuel: 'Minecraft Launcher',
	curseforge: 'CurseForge',
	modrinth: 'Modrinth App',
	autre: 'Un autre launcher',
}
const folders: Record<System, string> = {
	windows: '%APPDATA%\\.minecraft-minemories',
	mac: '~/Library/Application Support/minecraft-minemories',
	linux: '~/.minecraft-minemories',
}
const exports: Record<System, string> = {
	windows: '%USERPROFILE%\\export',
	mac: '~/export',
	linux: '~/export',
}

export function CopyText({ text, label }: { text: string; label: string }) {
	const [message, setMessage] = useState('')
	return (
		<div className="install-copy">
			<code>{text}</code>
			<button
				type="button"
				aria-label={label}
				onClick={async () => {
					try {
						await navigator.clipboard.writeText(text)
						setMessage('Copié !')
					} catch {
						setMessage('Sélectionne le texte ci-dessus pour le copier.')
					}
				}}
			>
				Copier
			</button>
			{message && <span role="status">{message}</span>}
		</div>
	)
}

function PrepareStep() {
	return (
		<>
			<p>
				Il te faut <strong>Minecraft Java Edition sur ordinateur</strong>. Le mod n’est pas disponible pour Bedrock, les
				consoles ou les mobiles.
			</p>
			<div className="install-note">
				<strong>Minecraft Java Edition 1.21.1 + NeoForge 21.1.248</strong>
				<p>
					C’est la seule combinaison testée. NeoForge permet au jeu de charger le mod ; Forge, Fabric et Quilt sont
					différents et ne sont pas supportés.
				</p>
			</div>
			<p>
				Pour découvrir Minemories, commence dans un <strong>nouveau monde de test</strong>. Tu n’as pas besoin de compte
				Minemories pour créer et regarder un souvenir local.
			</p>
			<details>
				<summary>Je veux utiliser mon monde ou mon serveur habituel</summary>
				<p>
					Fais une copie du monde et du profil avant toute modification. Un profil (ou une instance) regroupe le jeu,
					ses mods et ses réglages. Garde tous les mods attendus par ton monde ou ton serveur. Ne change pas sa version
					ou son loader pour ce tuto : s’il n’utilise pas déjà Java 1.21.1 et NeoForge 21.1.248, demande de l’aide à son
					responsable.
				</p>
				<p>
					Minemories s’installe sur ton ordinateur, pas sur le serveur. Vérifie les règles du serveur avant de capturer.
				</p>
			</details>
		</>
	)
}

function ManualLoader({ system }: { system: System }) {
	return (
		<>
			<ol>
				<li>
					Dans Minecraft Launcher, ouvre <strong>Installations → Nouvelle installation</strong>, choisis la version{' '}
					<strong>release 1.21.1</strong> et lance-la une fois. Ferme le jeu et le launcher.
					{system === 'windows' && <WindowsScreenshot id="minecraftVersion" />}
				</li>
				<li>
					Installe <a href="https://adoptium.net/temurin/releases/?version=21">Java 21 (Temurin, site officiel)</a> si
					tu ne l’as pas. Choisis ton système, le JDK 21 et l’architecture de ton ordinateur : x64 pour Intel/AMD,
					aarch64 pour Apple Silicon. Le Java fourni à Minecraft n’est pas toujours disponible pour ouvrir un
					installateur.
					{system === 'windows' && <WindowsScreenshot id="java21" />}
				</li>
				<li>
					Télécharge{' '}
					<a href="https://maven.neoforged.net/releases/net/neoforged/neoforge/21.1.248/neoforge-21.1.248-installer.jar">
						l’installateur NeoForge 21.1.248
					</a>
					. Ouvre <em>ce</em> fichier avec Java, coche <strong>Install client</strong>, puis valide. Attends le message
					de réussite.
					{system === 'windows' && <WindowsScreenshot id="neoforge" />}
				</li>
				<li>
					Rouvre Minecraft Launcher. Dans <strong>Installations</strong>, coche l’affichage des versions{' '}
					<strong>Modifiées / Modded</strong> si besoin. Édite l’installation NeoForge créée avec{' '}
					<strong>… → Modifier → Plus d’options</strong>. Vérifie que sa version contient <strong>21.1.248</strong>.
				</li>
				<li>
					Dans <strong>Dossier du jeu / Game Directory</strong>, choisis un nouveau dossier dédié à Minemories avec{' '}
					<strong>Parcourir</strong>. Par exemple :
				</li>
			</ol>
			<CopyText text={folders[system]} label="Copier le dossier de jeu proposé" />
			<p className="install-caption">
				{system === 'windows'
					? 'Colle %APPDATA% dans la barre d’adresse de l’Explorateur, puis crée le dossier .minecraft-minemories.'
					: 'Le signe ~ désigne ton dossier utilisateur. Crée le dossier proposé avec ton gestionnaire de fichiers, puis sélectionne-le dans le launcher.'}
			</p>
			{system === 'windows' && <WindowsScreenshot id="gameDirectory" />}
			<p>
				Enregistre, lance une fois <strong>cette installation NeoForge</strong>, puis ferme Minecraft. Cela crée le
				dossier <code>mods</code>. Si Java ou NeoForge bloque, ouvre l’aide en bas de la page avant de continuer.
			</p>
			<p className="install-caption">
				<a href="https://docs.neoforged.net/user/docs/">Guide officiel Java et NeoForge</a>. Le parcours Minecraft
				Launcher reste à valider en jeu avec le JAR distribué.
			</p>
		</>
	)
}

function LauncherLoader({ launcher }: { launcher: Exclude<Launcher, 'manuel'> }) {
	if (launcher === 'autre')
		return (
			<>
				<p>
					Dans Prism Launcher, ATLauncher, GDLauncher ou MultiMC, crée une instance <strong>Minecraft 1.21.1</strong> et
					ajoute le loader <strong>NeoForge 21.1.248</strong>. Les boutons diffèrent selon l’application.
				</p>
				<p>
					Pour un monde existant, copie son instance compatible et conserve ses mods. Si ton launcher ne propose pas
					exactement ces versions, ne choisis pas une autre version au hasard : utilise le parcours Minecraft Launcher
					ou demande de l’aide.
				</p>
				<p>Lance cette instance une fois, puis ferme le jeu. Ce parcours reste à valider en jeu.</p>
			</>
		)
	if (launcher === 'curseforge')
		return (
			<ol>
				<li>
					Ouvre <a href="https://www.curseforge.com/download/app">CurseForge</a>, choisis Minecraft, puis{' '}
					<strong>Create Custom Profile / Créer un profil personnalisé</strong>.
				</li>
				<li>
					Nomme-le Minemories, choisis <strong>Minecraft 1.21.1</strong>, le type <strong>NeoForge</strong> et sa
					version <strong>21.1.248</strong>. Pour un modpack existant compatible, duplique plutôt son profil et garde
					ses mods.
				</li>
				<li>
					Lance le profil une fois, puis ferme le jeu. Si le profil copié est verrouillé, autorise sa modification dans
					ses options.
				</li>
			</ol>
		)
	return (
		<>
			<ol>
				<li>
					Ouvre <a href="https://modrinth.com/app">Modrinth App</a> et connecte ton compte Minecraft.
				</li>
				<li>
					Crée une instance <strong>Minecraft 1.21.1</strong> avec <strong>NeoForge</strong>. Dans ses réglages,
					sélectionne le loader <strong>21.1.248</strong>. Pour un modpack existant compatible, duplique son instance et
					garde ses mods.
				</li>
				<li>Lance cette instance une fois, puis ferme le jeu.</li>
			</ol>
			<p className="install-caption">
				Ce parcours avec un fichier local reste à valider en jeu.{' '}
				<a href="https://support.modrinth.com/en/collections/7804910-modrinth-app">Aide officielle Modrinth App</a>.
			</p>
		</>
	)
}

function FileStep({ launcher, screenshots }: { launcher: Launcher; screenshots: boolean }) {
	let instruction = (
		<>
			Dans Minecraft Launcher → Installations, retrouve le profil NeoForge configuré à l’étape 2 et clique sur son{' '}
			<strong>icône de dossier</strong>. Vérifie que c’est le dossier de jeu dédié que tu as choisi.
		</>
	)
	if (launcher === 'curseforge')
		instruction = (
			<>
				Dans CurseForge, ouvre le menu <strong>…</strong> du profil Minemories, puis{' '}
				<strong>Open Folder / Ouvrir le dossier</strong>.
			</>
		)
	if (launcher === 'modrinth')
		instruction = (
			<>
				Dans Modrinth App, ouvre le dossier de l’instance Minemories avec son <strong>icône de dossier</strong> ou son
				menu.
			</>
		)
	if (launcher === 'autre')
		instruction = (
			<>
				Dans ton launcher, ouvre le <strong>dossier de l’instance</strong> NeoForge 21.1.248 choisie. Utilise le bouton
				de dossier ou le menu de cette instance.
			</>
		)
	return (
		<>
			<p>
				<strong>Ferme Minecraft complètement</strong> avant de copier le fichier.
			</p>
			<ol>
				<li>{instruction}</li>
				<li>
					Ouvre le sous-dossier <code>mods</code>. S’il manque, crée un dossier nommé exactement <code>mods</code>, en
					minuscules.
				</li>
				<li>
					Depuis tes <strong>Téléchargements</strong>, copie le JAR Minemories dans <code>mods</code>. Garde une seule
					version de Minemories : retire son ancien JAR si tu mets à jour.
				</li>
			</ol>
			<fieldset className="install-folder" aria-label="Emplacement du fichier">
				<span>Dossier du profil NeoForge</span>
				<span>└─ mods</span>
				<strong>　 └─ minemories-neoforge-mc1.21.1.jar</strong>
			</fieldset>
			{screenshots && <WindowsScreenshot id="modsFolder" />}
			<p>
				Le fichier reste un <code>.jar</code> : ne le décompresse pas, ne le lance pas et ne le place pas dans{' '}
				<code>saves</code>. Il n’y a rien à installer côté serveur.
			</p>
		</>
	)
}

function VerifyStep({ launcher, screenshots }: { launcher: Launcher; screenshots: boolean }) {
	return (
		<>
			<ol>
				<li>
					Relance Minecraft depuis <strong>{launcherNames[launcher]}</strong>, avec le profil{' '}
					<strong>NeoForge 21.1.248</strong> que tu viens de préparer.
				</li>
				<li>
					Dans le menu du jeu, ouvre <strong>Mods</strong> et cherche <strong>Minemories</strong>.
				</li>
				<li>
					Crée un petit monde de test, attends que le terrain soit chargé, puis appuie sur <kbd>M</kbd>. Le menu
					Minemories doit s’ouvrir.
				</li>
			</ol>
			<div className="install-note">
				<strong>Tu vois le menu Minemories ? L’installation est reconnue.</strong>
				<p>La prochaine étape vérifie aussi qu’une capture fonctionne.</p>
			</div>
			{screenshots && (
				<>
					<WindowsScreenshot id="modsList" />
					<WindowsScreenshot id="minemoriesMenu" />
				</>
			)}
			<p>
				Si M ouvre autre chose, va dans <strong>Options → Contrôles → Attribution des touches → Minemories</strong> et
				choisis une touche libre. Tu peux aussi chercher le bouton Minemories dans le menu pause ou les options.
			</p>
		</>
	)
}

function MemoryStep({ system, screenshots }: { system: System; screenshots: boolean }) {
	return (
		<>
			<p>
				Pour ton premier essai, approche-toi d’une petite construction et attends que le terrain soit chargé. Ouvre le
				chat avec <kbd>T</kbd>, colle cette commande, puis appuie sur Entrée :
			</p>
			<CopyText text="/minemories export 16" label="Copier la commande de première capture" />
			<p>
				Attends le message de fin d’export. Le nombre 16 désigne un rayon de 16 blocs : cette petite capture permet de
				vérifier le résultat avant de capturer une grande zone.
			</p>
			{screenshots && <WindowsScreenshot id="localCapture" />}
			<p>
				Ouvre le dossier ci-dessous{' '}
				{system === 'windows'
					? 'en collant ce chemin dans la barre d’adresse de l’Explorateur'
					: 'avec ton gestionnaire de fichiers (~ désigne ton dossier utilisateur)'}
				, puis retrouve <strong>capture.glb</strong> :
			</p>
			<CopyText text={exports[system]} label="Copier le dossier du premier souvenir" />
			<p>
				Sur le site, clique sur <strong>Ouvrir un GLB local / Open a local GLB</strong> en haut de la page, puis choisis{' '}
				<strong>capture.glb</strong>. Sur mobile, ce bouton est représenté par un +. Ton souvenir doit apparaître en 3D.
				Cette ouverture reste locale et ne demande aucun compte.
			</p>
			{screenshots && <WindowsScreenshot id="viewer" />}
			<details>
				<summary>Je veux aussi le retrouver dans ma galerie privée</summary>
				<ol>
					<li>
						<Link to="/register" target="_blank">
							Crée ton compte
						</Link>{' '}
						ou{' '}
						<Link to="/login" target="_blank">
							connecte-toi
						</Link>
						, puis ouvre{' '}
						<Link to="/gallery" target="_blank">
							Ma galerie / My gallery
						</Link>
						.
					</li>
					<li>
						Génère le code d’appairage à six chiffres. Dans Minecraft, appuie sur M, entre ce code et connecte ton
						compte. Le code expire après cinq minutes : génère-en un nouveau si nécessaire.
					</li>
					<li>
						Clique sur <strong>Capturer et envoyer / Capture and upload</strong> dans le menu M. Attends la
						confirmation, puis vérifie que la capture apparaît dans la galerie.
					</li>
				</ol>
				<p>
					Les captures AFK sont actives par défaut après 5 minutes d’inactivité, au plus toutes les 4 heures. Une fois
					le compte lié, elles sont envoyées automatiquement dans ta galerie privée. Tu peux les désactiver dans M. Sans
					compte lié, elles restent sur ton ordinateur.
				</p>
			</details>
			<p className="install-caption">
				Le dossier d’export peut être changé dans les réglages avancés du mod.{' '}
				<Link to="/fonctionnement">En savoir plus sur les captures et le partage</Link>.
			</p>
		</>
	)
}

export function InstallationStep({ step, system, launcher }: { step: number; system: System; launcher: Launcher }) {
	const screenshots = system === 'windows' && launcher === 'manuel'
	switch (step) {
		case 0:
			return <PrepareStep />
		case 1:
			return launcher === 'manuel' ? <ManualLoader system={system} /> : <LauncherLoader launcher={launcher} />
		case 2:
			return (
				<>
					<p>
						Le JAR est le fichier du mod. Télécharge-le ici, depuis le site ; il n’est pas encore publié dans les
						catalogues CurseForge et Modrinth. Même avec ces applications, on ajoute donc le fichier à la main.
					</p>
					<ModDownload />
					{screenshots && <WindowsScreenshot id="jarDownload" />}
					<p>
						Le JAR Minemories se copie dans le jeu. Seul l’installateur NeoForge de l’étape précédente s’exécute avec
						Java.
					</p>
				</>
			)
		case 3:
			return <FileStep launcher={launcher} screenshots={screenshots} />
		case 4:
			return <VerifyStep launcher={launcher} screenshots={screenshots} />
		default:
			return <MemoryStep system={system} screenshots={screenshots} />
	}
}
