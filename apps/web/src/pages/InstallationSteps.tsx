import { useState } from 'react'
import { Link } from 'react-router'
import { T, useI18n } from '../i18n/I18n'
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
	const { t } = useI18n()
	const [message, setMessage] = useState('')
	return (
		<div className="install-copy">
			<code>{text}</code>
			<button
				type="button"
				aria-label={t(label)}
				onClick={async () => {
					try {
						await navigator.clipboard.writeText(text)
						setMessage('Copié !')
					} catch {
						setMessage('Sélectionne le texte ci-dessus pour le copier.')
					}
				}}
			>
				<T message={'Copier'} />
			</button>
			{message && <span role="status">{t(message)}</span>}
		</div>
	)
}

function PrepareStep() {
	return (
		<>
			<p>
				<T message={'Il te faut'} />{' '}
				<strong>
					<T message={'Minecraft Java Edition sur ordinateur'} />
				</strong>
				<T message={'. Le mod n’est pas disponible pour Bedrock, les consoles ou les mobiles.'} />
			</p>
			<div className="install-note">
				<strong>Minecraft Java Edition 1.21.1 + NeoForge 21.1.248</strong>
				<p>
					<T
						message={
							'Ce parcours détaille NeoForge, qui permet au jeu de charger le mod. Les autres versions validées sont indiquées dans'
						}
					/>{' '}
					<Link to="/versions">
						<T message={'Versions du mod'} />
					</Link>
					.
				</p>
			</div>
			<p>
				<T message={'Pour découvrir Minemories, commence dans un'} />{' '}
				<strong>
					<T message={'nouveau monde de test'} />
				</strong>
				<T
					message={
						'. Tu peux exporter une capture sans compte ; pour la consulter sur le site, relie le mod à ta galerie privée.'
					}
				/>
			</p>
			<details>
				<summary>
					<T message={'Je veux utiliser mon monde ou mon serveur habituel'} />
				</summary>
				<p>
					<T
						message={
							'Fais une copie du monde et du profil avant toute modification. Un profil (ou une instance) regroupe le jeu, ses mods et ses réglages. Garde tous les mods attendus par ton monde ou ton serveur. Ne change pas sa version ou son loader pour ce tuto : s’il n’utilise pas déjà Java 1.21.1 et NeoForge 21.1.248, demande de l’aide à son responsable.'
						}
					/>
				</p>
				<p>
					<T
						message={
							'Minemories s’installe sur ton ordinateur, pas sur le serveur. Vérifie les règles du serveur avant de capturer.'
						}
					/>
				</p>
			</details>
		</>
	)
}

function ManualLoader({ system }: { system: System }) {
	const { t } = useI18n()

	return (
		<>
			<ol>
				<li>
					<T message={'Dans Minecraft Launcher, ouvre'} />{' '}
					<strong>
						<T message={'Installations → Nouvelle installation'} />
					</strong>
					<T message={', choisis la version'} /> <strong>release 1.21.1</strong>{' '}
					<T message={'et lance-la une fois. Ferme le jeu et le launcher.'} />
					{system === 'windows' && <WindowsScreenshot id="minecraftVersion" />}
				</li>
				<li>
					<T message={'Installe'} />{' '}
					<a href="https://adoptium.net/temurin/releases/?version=21">
						<T message={'Java 21 (Temurin, site officiel)'} />
					</a>{' '}
					<T
						message={
							'si tu ne l’as pas. Choisis ton système, le JDK 21 et l’architecture de ton ordinateur : x64 pour Intel/AMD, aarch64 pour Apple Silicon. Le Java fourni à Minecraft n’est pas toujours disponible pour ouvrir un installateur.'
						}
					/>
					{system === 'windows' && <WindowsScreenshot id="java21" />}
				</li>
				<li>
					<T message={'Télécharge'} />{' '}
					<a href="https://maven.neoforged.net/releases/net/neoforged/neoforge/21.1.248/neoforge-21.1.248-installer.jar">
						<T message={'l’installateur NeoForge 21.1.248'} />
					</a>
					<T message={'. Ouvre'} />{' '}
					<em>
						<T message={'ce'} />
					</em>{' '}
					<T message={'fichier avec Java, coche'} /> <strong>Install client</strong>
					<T message={', puis valide. Attends le message de réussite.'} />
					{system === 'windows' && <WindowsScreenshot id="neoforge" />}
				</li>
				<li>
					<T message={'Rouvre Minecraft Launcher. Dans'} /> <strong>Installations</strong>
					<T message={', coche l’affichage des versions'} />{' '}
					<strong>
						<T message={'Modifiées / Modded'} />
					</strong>{' '}
					<T message={'si besoin. Édite l’installation NeoForge créée avec'} />{' '}
					<strong>
						<T message={'… → Modifier → Plus d’options'} />
					</strong>
					<T message={'. Vérifie que sa version contient'} /> <strong>21.1.248</strong>.
				</li>
				<li>
					<T message={'Dans'} />{' '}
					<strong>
						<T message={'Dossier du jeu / Game Directory'} />
					</strong>
					<T message={', choisis un nouveau dossier dédié à Minemories avec'} />{' '}
					<strong>
						<T message={'Parcourir'} />
					</strong>
					<T message={'. Par exemple :'} />
				</li>
			</ol>
			<CopyText text={folders[system]} label="Copier le dossier de jeu proposé" />
			<p className="install-caption">
				{system === 'windows'
					? t('Colle %APPDATA% dans la barre d’adresse de l’Explorateur, puis crée le dossier .minecraft-minemories.')
					: t(
							'Le signe ~ désigne ton dossier utilisateur. Crée le dossier proposé avec ton gestionnaire de fichiers, puis sélectionne-le dans le launcher.'
						)}
			</p>
			{system === 'windows' && <WindowsScreenshot id="gameDirectory" />}
			<p>
				<T message={'Enregistre, lance une fois'} />{' '}
				<strong>
					<T message={'cette installation NeoForge'} />
				</strong>
				<T message={', puis ferme Minecraft. Cela crée le dossier'} /> <code>mods</code>
				<T message={'. Si Java ou NeoForge bloque, ouvre l’aide en bas de la page avant de continuer.'} />
			</p>
			<p className="install-caption">
				<a href="https://docs.neoforged.net/user/docs/">
					<T message={'Guide officiel Java et NeoForge'} />
				</a>
				<T message={'. Le parcours Minecraft Launcher reste à valider en jeu avec le JAR distribué.'} />
			</p>
		</>
	)
}

function LauncherLoader({ launcher }: { launcher: Exclude<Launcher, 'manuel'> }) {
	if (launcher === 'autre')
		return (
			<>
				<p>
					<T message={'Dans Prism Launcher, ATLauncher, GDLauncher ou MultiMC, crée une instance'} />{' '}
					<strong>Minecraft 1.21.1</strong> <T message={'et ajoute le loader'} /> <strong>NeoForge 21.1.248</strong>
					<T message={'. Les boutons diffèrent selon l’application.'} />
				</p>
				<p>
					<T
						message={
							'Pour un monde existant, copie son instance compatible et conserve ses mods. Si ton launcher ne propose pas exactement ces versions, ne choisis pas une autre version au hasard : utilise le parcours Minecraft Launcher ou demande de l’aide.'
						}
					/>
				</p>
				<p>
					<T message={'Lance cette instance une fois, puis ferme le jeu. Ce parcours reste à valider en jeu.'} />
				</p>
			</>
		)
	if (launcher === 'curseforge')
		return (
			<ol>
				<li>
					<T message={'Ouvre'} /> <a href="https://www.curseforge.com/download/app">CurseForge</a>
					<T message={', choisis Minecraft, puis'} />{' '}
					<strong>
						<T message={'Create Custom Profile / Créer un profil personnalisé'} />
					</strong>
					.
				</li>
				<li>
					<T message={'Nomme-le Minemories, choisis'} /> <strong>Minecraft 1.21.1</strong>
					<T message={', le type'} /> <strong>NeoForge</strong> <T message={'et sa version'} />{' '}
					<strong>21.1.248</strong>
					<T message={'. Pour un modpack existant compatible, duplique plutôt son profil et garde ses mods.'} />
				</li>
				<li>
					<T
						message={
							'Lance le profil une fois, puis ferme le jeu. Si le profil copié est verrouillé, autorise sa modification dans ses options.'
						}
					/>
				</li>
			</ol>
		)
	return (
		<>
			<ol>
				<li>
					<T message={'Ouvre'} /> <a href="https://modrinth.com/app">Modrinth App</a>{' '}
					<T message={'et connecte ton compte Minecraft.'} />
				</li>
				<li>
					<T message={'Crée une instance'} /> <strong>Minecraft 1.21.1</strong> <T message={'avec'} />{' '}
					<strong>NeoForge</strong>
					<T message={'. Dans ses réglages, sélectionne le loader'} /> <strong>21.1.248</strong>
					<T message={'. Pour un modpack existant compatible, duplique son instance et garde ses mods.'} />
				</li>
				<li>
					<T message={'Lance cette instance une fois, puis ferme le jeu.'} />
				</li>
			</ol>
			<p className="install-caption">
				<T message={'Ce parcours avec un fichier local reste à valider en jeu.'} />{' '}
				<a href="https://support.modrinth.com/en/collections/7804910-modrinth-app">
					<T message={'Aide officielle Modrinth App'} />
				</a>
				.
			</p>
		</>
	)
}

function FileStep({ launcher, screenshots }: { launcher: Launcher; screenshots: boolean }) {
	const { t } = useI18n()

	let instruction = (
		<>
			<T
				message={
					'Dans Minecraft Launcher → Installations, retrouve le profil NeoForge configuré à l’étape 2 et clique sur son'
				}
			/>{' '}
			<strong>
				<T message={'icône de dossier'} />
			</strong>
			<T message={'. Vérifie que c’est le dossier de jeu dédié que tu as choisi.'} />
		</>
	)
	if (launcher === 'curseforge')
		instruction = (
			<>
				<T message={'Dans CurseForge, ouvre le menu'} /> <strong>…</strong> <T message={'du profil Minemories, puis'} />{' '}
				<strong>
					<T message={'Open Folder / Ouvrir le dossier'} />
				</strong>
				.
			</>
		)
	if (launcher === 'modrinth')
		instruction = (
			<>
				<T message={'Dans Modrinth App, ouvre le dossier de l’instance Minemories avec son'} />{' '}
				<strong>
					<T message={'icône de dossier'} />
				</strong>{' '}
				<T message={'ou son menu.'} />
			</>
		)
	if (launcher === 'autre')
		instruction = (
			<>
				<T message={'Dans ton launcher, ouvre le'} />{' '}
				<strong>
					<T message={'dossier de l’instance'} />
				</strong>{' '}
				<T message={'NeoForge 21.1.248 choisie. Utilise le bouton de dossier ou le menu de cette instance.'} />
			</>
		)
	return (
		<>
			<p>
				<strong>
					<T message={'Ferme Minecraft complètement'} />
				</strong>{' '}
				<T message={'avant de copier le fichier.'} />
			</p>
			<ol>
				<li>{instruction}</li>
				<li>
					<T message={'Ouvre le sous-dossier'} /> <code>mods</code>
					<T message={'. S’il manque, crée un dossier nommé exactement'} /> <code>mods</code>
					<T message={', en minuscules.'} />
				</li>
				<li>
					<T message={'Depuis tes'} />{' '}
					<strong>
						<T message={'Téléchargements'} />
					</strong>
					<T message={', copie le JAR Minemories dans'} /> <code>mods</code>
					<T message={'. Garde une seule version de Minemories : retire son ancien JAR si tu mets à jour.'} />
				</li>
			</ol>
			<fieldset className="install-folder" aria-label={t('Emplacement du fichier')}>
				<span>
					<T message={'Dossier du profil NeoForge'} />
				</span>
				<span>└─ mods</span>
				<strong>　 └─ minemories-neoforge-mc1.21.1.jar</strong>
			</fieldset>
			{screenshots && <WindowsScreenshot id="modsFolder" />}
			<p>
				<T message={'Le fichier reste un'} /> <code>.jar</code>{' '}
				<T message={': ne le décompresse pas, ne le lance pas et ne le place pas dans'} /> <code>saves</code>
				<T message={'. Il n’y a rien à installer côté serveur.'} />
			</p>
		</>
	)
}

function VerifyStep({ launcher, screenshots }: { launcher: Launcher; screenshots: boolean }) {
	const { t } = useI18n()
	return (
		<>
			<ol>
				<li>
					<T message={'Relance Minecraft depuis'} /> <strong>{t(launcherNames[launcher])}</strong>
					<T message={', avec le profil'} /> <strong>NeoForge 21.1.248</strong>{' '}
					<T message={'que tu viens de préparer.'} />
				</li>
				<li>
					<T message={'Dans le menu du jeu, ouvre'} /> <strong>Mods</strong> <T message={'et cherche'} />{' '}
					<strong>Minemories</strong>.
				</li>
				<li>
					<T message={'Crée un petit monde de test, attends que le terrain soit chargé, puis appuie sur'} />{' '}
					<kbd>M</kbd>
					<T message={'. Le menu Minemories doit s’ouvrir.'} />
				</li>
			</ol>
			<div className="install-note">
				<strong>
					<T message={'Tu vois le menu Minemories ? L’installation est reconnue.'} />
				</strong>
				<p>
					<T message={'La prochaine étape vérifie aussi qu’une capture fonctionne.'} />
				</p>
			</div>
			{screenshots && (
				<>
					<WindowsScreenshot id="modsList" />
					<WindowsScreenshot id="minemoriesMenu" />
				</>
			)}
			<p>
				<T message={'Si M ouvre autre chose, va dans'} />{' '}
				<strong>
					<T message={'Options → Contrôles → Attribution des touches → Minemories'} />
				</strong>{' '}
				<T
					message={
						'et choisis une touche libre. Tu peux aussi chercher le bouton Minemories dans le menu pause ou les options.'
					}
				/>
			</p>
		</>
	)
}

function MemoryStep({ system, screenshots }: { system: System; screenshots: boolean }) {
	const { t } = useI18n()

	return (
		<>
			<p>
				<T
					message={
						'Pour ton premier essai, approche-toi d’une petite construction et attends que le terrain soit chargé. Ouvre le chat avec'
					}
				/>{' '}
				<kbd>T</kbd>
				<T message={', colle cette commande, puis appuie sur Entrée :'} />
			</p>
			<CopyText text="/minemories export 16" label="Copier la commande de première capture" />
			<p>
				<T
					message={
						'Attends le message de fin d’export. Le nombre 16 désigne un rayon de 16 blocs : cette petite capture permet de vérifier le résultat avant de capturer une grande zone.'
					}
				/>
			</p>
			{screenshots && <WindowsScreenshot id="localCapture" />}
			<p>
				<T message={'Ouvre le dossier ci-dessous'} />{' '}
				{system === 'windows'
					? t('en collant ce chemin dans la barre d’adresse de l’Explorateur')
					: t('avec ton gestionnaire de fichiers (~ désigne ton dossier utilisateur)')}
				<T message={', puis retrouve'} /> <strong>capture.glb</strong> :
			</p>
			<CopyText text={exports[system]} label="Copier le dossier du premier souvenir" />
			<p>
				<T
					message={
						'Pour revoir le souvenir dans le navigateur, relie Minecraft à ta galerie privée puis envoie la capture depuis le mod.'
					}
				/>
			</p>
			{screenshots && <WindowsScreenshot id="viewer" />}
			<div>
				<h4>
					<T message={'Retrouver le souvenir dans ma galerie privée'} />
				</h4>
				<ol>
					<li>
						<Link to="/register" target="_blank">
							<T message={'Crée ton compte'} />
						</Link>{' '}
						<T message={'ou'} />{' '}
						<Link to="/login" target="_blank">
							<T message={'connecte-toi'} />
						</Link>
						<T message={', puis ouvre'} />{' '}
						<Link to="/gallery" target="_blank">
							<T message={'Ma galerie / My gallery'} />
						</Link>
						.
					</li>
					<li>
						<T
							message={
								'Génère le code d’appairage à six chiffres. Dans Minecraft, appuie sur M, entre ce code et connecte ton compte. Le code expire après cinq minutes : génère-en un nouveau si nécessaire.'
							}
						/>
					</li>
					<li>
						<T message={'Clique sur'} />{' '}
						<strong>
							<T message={'Capturer et envoyer / Capture and upload'} />
						</strong>{' '}
						<T
							message={'dans le menu M. Attends la confirmation, puis vérifie que la capture apparaît dans la galerie.'}
						/>
					</li>
				</ol>
				<p>
					<T
						message={
							'Les captures AFK sont actives par défaut après 5 minutes d’inactivité, au plus toutes les 4 heures. Une fois le compte lié, elles sont envoyées automatiquement dans ta galerie privée. Tu peux les désactiver dans M. Sans compte lié, elles restent sur ton ordinateur.'
						}
					/>
				</p>
			</div>
			<p className="install-caption">
				<T message={'Le dossier d’export peut être changé dans les réglages avancés du mod.'} />{' '}
				<Link to="/fonctionnement">
					<T message={'En savoir plus sur les captures et le partage'} />
				</Link>
				.
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
						<T
							message={
								'Le JAR est le fichier du mod. Télécharge-le ici, depuis le site ; il n’est pas encore publié dans les catalogues CurseForge et Modrinth. Même avec ces applications, on ajoute donc le fichier à la main.'
							}
						/>
					</p>
					<ModDownload />
					{screenshots && <WindowsScreenshot id="jarDownload" />}
					<p>
						<T
							message={
								'Le JAR Minemories se copie dans le jeu. Seul l’installateur NeoForge de l’étape précédente s’exécute avec Java.'
							}
						/>
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
