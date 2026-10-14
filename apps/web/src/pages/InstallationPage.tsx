import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { InfoNavigation } from './InfoPages'
import { InstallationScene } from './InstallationScene'
import { InstallationStep, launcherNames, stepNames } from './InstallationSteps'
import { type GuideState, type Launcher, readGuide, resetGuide, type System, saveGuide } from './installation-state'
import './installation.css'

function GuidePreferences({ guide, update }: { guide: GuideState; update: (value: Partial<GuideState>) => void }) {
	return (
		<section className="install-preferences" aria-labelledby="preferences-title">
			<div>
				<span className="install-eyebrow">À ta façon</span>
				<h2 id="preferences-title">Ton ordinateur. Ton parcours.</h2>
				<p>Les étapes s’adaptent à tes choix. Tu peux les changer à tout moment.</p>
			</div>
			<div className="install-fields">
				<fieldset>
					<legend>Tu joues sur…</legend>
					<div className="install-choices">
						{(
							[
								['windows', 'Windows'],
								['mac', 'macOS'],
								['linux', 'Linux'],
							] as const
						).map(([value, label]) => (
							<button
								key={value}
								type="button"
								aria-pressed={guide.system === value}
								onClick={() => update({ system: value as System })}
							>
								{label}
							</button>
						))}
					</div>
				</fieldset>
				<fieldset>
					<legend>Tu lances Minecraft avec…</legend>
					<div className="install-choices">
						{Object.entries(launcherNames).map(([value, label]) => (
							<button
								key={value}
								type="button"
								aria-pressed={guide.launcher === value}
								onClick={() => update({ launcher: value as Launcher, done: [], step: 0 })}
							>
								{label}
							</button>
						))}
					</div>
				</fieldset>
				<label className="install-name">
					Ton prénom (facultatif)
					<input
						type="text"
						maxLength={40}
						autoComplete="off"
						value={guide.name}
						placeholder="Pour un guide un peu plus à toi"
						onChange={event => update({ name: event.target.value })}
					/>
				</label>
				<label className="install-motion">
					<input
						type="checkbox"
						checked={guide.reduceMotion}
						onChange={event => update({ reduceMotion: event.target.checked })}
					/>
					Réduire les animations
				</label>
			</div>
		</section>
	)
}

function InstallationHelp() {
	return (
		<section className="install-help" aria-labelledby="help-title">
			<span className="install-eyebrow">Un petit coup de main</span>
			<h2 id="help-title">Si une étape coince</h2>
			<details>
				<summary>L’installateur NeoForge ne s’ouvre pas</summary>
				<p>
					Il faut Java 21 pour ouvrir l’installateur. Sous Windows, essaie clic droit → Ouvrir avec → Java. S’il manque,
					installe Temurin 21 depuis le lien de l’étape 2. Sous macOS ou Linux, suis{' '}
					<a href="https://docs.neoforged.net/user/docs/">le guide officiel NeoForge</a> pour lancer l’installateur. Ne
					change pas les réglages de sécurité au hasard.
				</p>
			</details>
			<details>
				<summary>Je ne trouve pas le dossier mods ou le mod n’apparaît pas</summary>
				<p>
					Ouvre le dossier depuis le profil que tu lances, plutôt qu’un dossier Minecraft trouvé ailleurs. Crée{' '}
					<code>mods</code> s’il manque. Vérifie que le fichier a bien l’extension .jar, et non .jar.zip, puis ferme
					complètement le jeu et relance le profil NeoForge 21.1.248. Les mondes sont dans saves ; le mod est dans mods.
				</p>
			</details>
			<details>
				<summary>M ouvre un autre menu, ou la commande est inconnue</summary>
				<p>
					Change la touche Minemories dans Options → Contrôles → Attribution des touches. Une commande inconnue indique
					souvent que le mod n’est pas chargé : vérifie sa présence dans Mods, les versions et le dossier du profil.
				</p>
			</details>
			<details>
				<summary>Minecraft plante au démarrage</summary>
				<p>
					Vérifie Minecraft 1.21.1, NeoForge 21.1.248 et l’absence de doublon Minemories. Retire le JAR Minemories pour
					revenir au profil précédent. Demande de l’aide avec le message d’erreur et les versions utilisées ; ne
					supprime pas ton monde.
				</p>
			</details>
			<details>
				<summary>La capture est vide, incomplète ou l’envoi échoue</summary>
				<p>
					Attends que le terrain soit chargé, rapproche-toi de la construction et recommence avec le rayon 16. Certains
					blocs moddés ne sont pas reproduits fidèlement. Si l’envoi échoue, conserve capture.glb et regarde-le
					localement. Vérifie ta connexion, génère un nouveau code si les cinq minutes sont écoulées et réessaie ; la
					limite d’envoi du mod est 200 MiB.
				</p>
			</details>
		</section>
	)
}

export function InstallationPage() {
	const [guide, setGuide] = useState(readGuide)
	const heading = useRef<HTMLHeadingElement>(null)
	const [moveFocus, setMoveFocus] = useState(false)
	useEffect(() => saveGuide(guide), [guide])
	useEffect(() => {
		if (moveFocus) heading.current?.focus()
	}, [guide.step, moveFocus])
	function update(value: Partial<GuideState>) {
		setGuide(current => ({ ...current, ...value }))
	}
	function goTo(step: number) {
		setMoveFocus(true)
		update({ step })
	}
	function completeStep() {
		setMoveFocus(true)
		setGuide(current => ({
			...current,
			done: [...new Set([...current.done, current.step])],
			step: Math.min(5, current.step + 1),
		}))
	}
	const complete = guide.done.length === 6
	return (
		<article lang="fr" className={`installation ${guide.reduceMotion ? 'install-still' : ''}`}>
			<header className="install-hero">
				<div>
					<span className="install-eyebrow">Le premier souvenir commence ici</span>
					<h1>Installer le mod Minemories</h1>
					<p className="install-lead">
						Un petit fichier.
						<br />
						Une nouvelle façon de garder tes mondes.
					</p>
					<p>
						On avance ensemble, une étape à la fois. Pas besoin de savoir coder : choisis ton ordinateur, suis le guide
						et garde ton premier souvenir en 3D.
					</p>
					<a className="install-primary" href="#parcours">
						Commencer l’installation <span aria-hidden="true">↓</span>
					</a>
					<p className="install-caption">Minecraft Java 1.21.1 · NeoForge 21.1.248 · Mod expérimental</p>
				</div>
				<div className="install-hero-art">
					<InstallationScene step={guide.step} />
					<span>Construire. Capturer. Revenir.</span>
				</div>
			</header>
			<p className="install-view-only">
				Tu viens juste regarder un souvenir partagé ? Ouvre son lien : tu n’as rien à installer.
			</p>
			<GuidePreferences guide={guide} update={update} />
			<section id="parcours" className="install-journey" aria-label="Guide pas à pas">
				<div className="install-progress-heading">
					<div>
						<span className="install-eyebrow">
							{guide.name.trim() ? `À toi de jouer, ${guide.name.trim()}` : 'À toi de jouer'}
						</span>
						<h2>Du téléchargement au premier souvenir.</h2>
					</div>
					<span role="status">{guide.done.length} / 6 étapes cochées</span>
				</div>
				<progress value={guide.done.length} max={6} aria-label="Progression de l’installation" />
				<div className="install-workspace">
					<nav className="install-step-nav" aria-label="Étapes d’installation">
						{stepNames.map((name, index) => (
							<button
								key={name}
								type="button"
								aria-current={guide.step === index ? 'step' : undefined}
								onClick={() => goTo(index)}
							>
								<span className="install-step-number" aria-hidden="true">
									{guide.done.includes(index) ? '✓' : `0${index + 1}`}
								</span>
								<span>
									{name}
									{guide.done.includes(index) && <small>Étape cochée</small>}
								</span>
							</button>
						))}
					</nav>
					<div className="install-panel" key={`${guide.launcher}-${guide.step}`}>
						<div className="install-panel-meta">
							<span>Étape 0{guide.step + 1}</span>
							<span>{launcherNames[guide.launcher]}</span>
						</div>
						<h3 ref={heading} tabIndex={-1}>
							{stepNames[guide.step]}
						</h3>
						<InstallationStep step={guide.step} system={guide.system} launcher={guide.launcher} />
						<div className="install-panel-actions">
							<button
								className="install-secondary"
								type="button"
								disabled={guide.step === 0}
								onClick={() => goTo(guide.step - 1)}
							>
								← Précédent
							</button>
							<button className="install-primary" type="button" onClick={completeStep}>
								{guide.step === 5 ? 'Mon souvenir s’ouvre en 3D' : 'C’est fait, on continue'}{' '}
								<span aria-hidden="true">✓</span>
							</button>
						</div>
						<p className="install-caption">
							Coche une étape quand tu l’as réalisée. Tu peux aussi naviguer librement entre les étapes.
						</p>
					</div>
				</div>
				{complete && (
					<div className="install-success" role="status">
						<span aria-hidden="true">✦</span>
						<div>
							<h2>
								{guide.name.trim() ? `Ton premier souvenir, ${guide.name.trim()}.` : 'Ton premier souvenir est là.'}
							</h2>
							<p>
								Si la capture s’ouvre correctement, tu as terminé ce premier essai. Garde aussi une sauvegarde du monde
								: un souvenir 3D ne permet pas de reprendre la partie.
							</p>
							<Link to="/fonctionnement">Explorer les captures, la galerie et le partage →</Link>
						</div>
					</div>
				)}
				<div className="install-resume">
					<p>
						Ton prénom, tes choix et ta progression restent dans ce navigateur, sur cet appareil. Tu peux fermer cette
						page et revenir.
					</p>
					<button
						type="button"
						onClick={() => {
							setMoveFocus(false)
							setGuide(resetGuide())
						}}
					>
						Recommencer et effacer mes choix
					</button>
				</div>
			</section>
			<InstallationHelp />
			<p className="install-caption install-final-note">
				Minemories est expérimental : commence par un monde de test et garde tes fichiers locaux. Les étapes cochées
				servent de repères ; elles ne vérifient pas le jeu à ta place.
			</p>
			<InfoNavigation />
		</article>
	)
}
