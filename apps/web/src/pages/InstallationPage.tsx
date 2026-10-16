import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { T, useI18n } from '../i18n/I18n'
import { InfoNavigation } from './InfoPages'
import { InstallationScene } from './InstallationScene'
import { InstallationStep, launcherNames, stepNames } from './InstallationSteps'
import {
	defaults,
	type GuideState,
	type Launcher,
	readGuide,
	resetGuide,
	type System,
	saveGuide,
} from './installation-state'
import './installation.css'

function GuidePreferences({ guide, update }: { guide: GuideState; update: (value: Partial<GuideState>) => void }) {
	const { t } = useI18n()

	return (
		<section className="install-preferences" aria-labelledby="preferences-title">
			<div>
				<span className="install-eyebrow">
					<T message={'À ta façon'} />
				</span>
				<h2 id="preferences-title">
					<T message={'Ton ordinateur. Ton parcours.'} />
				</h2>
				<p>
					<T message={'Les étapes s’adaptent à tes choix. Tu peux les changer à tout moment.'} />
				</p>
			</div>
			<div className="install-fields">
				<fieldset>
					<legend>
						<T message={'Tu joues sur…'} />
					</legend>
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
								{t(label)}
							</button>
						))}
					</div>
				</fieldset>
				<fieldset>
					<legend>
						<T message={'Tu lances Minecraft avec…'} />
					</legend>
					<div className="install-choices">
						{Object.entries(launcherNames).map(([value, label]) => (
							<button
								key={value}
								type="button"
								aria-pressed={guide.launcher === value}
								onClick={() => update({ launcher: value as Launcher, done: [], step: 0 })}
							>
								{t(label)}
							</button>
						))}
					</div>
				</fieldset>
				<label className="install-name">
					<T message={'Ton prénom (facultatif)'} />
					<input
						type="text"
						maxLength={40}
						autoComplete="off"
						value={guide.name}
						placeholder={t('Pour un guide un peu plus à toi')}
						onChange={event => update({ name: event.target.value })}
					/>
				</label>
				<label className="install-motion">
					<input
						type="checkbox"
						checked={guide.reduceMotion}
						onChange={event => update({ reduceMotion: event.target.checked })}
					/>
					<T message={'Réduire les animations'} />
				</label>
			</div>
		</section>
	)
}

function InstallationHelp() {
	return (
		<section className="install-help" aria-labelledby="help-title">
			<span className="install-eyebrow">
				<T message={'Un petit coup de main'} />
			</span>
			<h2 id="help-title">
				<T message={'Si une étape coince'} />
			</h2>
			<details>
				<summary>
					<T message={'L’installateur NeoForge ne s’ouvre pas'} />
				</summary>
				<p>
					<T
						message={
							'Il faut Java 21 pour ouvrir l’installateur. Sous Windows, essaie clic droit → Ouvrir avec → Java. S’il manque, installe Temurin 21 depuis le lien de l’étape 2. Sous macOS ou Linux, suis'
						}
					/>{' '}
					<a href="https://docs.neoforged.net/user/docs/">
						<T message={'le guide officiel NeoForge'} />
					</a>{' '}
					<T message={'pour lancer l’installateur. Ne change pas les réglages de sécurité au hasard.'} />
				</p>
			</details>
			<details>
				<summary>
					<T message={'Je ne trouve pas le dossier mods ou le mod n’apparaît pas'} />
				</summary>
				<p>
					<T
						message={
							'Ouvre le dossier depuis le profil que tu lances, plutôt qu’un dossier Minecraft trouvé ailleurs. Crée'
						}
					/>{' '}
					<code>mods</code>{' '}
					<T
						message={
							's’il manque. Vérifie que le fichier a bien l’extension .jar, et non .jar.zip, puis ferme complètement le jeu et relance le profil NeoForge 21.1.248. Les mondes sont dans saves ; le mod est dans mods.'
						}
					/>
				</p>
			</details>
			<details>
				<summary>
					<T message={'M ouvre un autre menu, ou la commande est inconnue'} />
				</summary>
				<p>
					<T
						message={
							'Change la touche Minemories dans Options → Contrôles → Attribution des touches. Une commande inconnue indique souvent que le mod n’est pas chargé : vérifie sa présence dans Mods, les versions et le dossier du profil.'
						}
					/>
				</p>
			</details>
			<details>
				<summary>
					<T message={'Minecraft plante au démarrage'} />
				</summary>
				<p>
					<T
						message={
							'Vérifie Minecraft 1.21.1, NeoForge 21.1.248 et l’absence de doublon Minemories. Retire le JAR Minemories pour revenir au profil précédent. Demande de l’aide avec le message d’erreur et les versions utilisées ; ne supprime pas ton monde.'
						}
					/>
				</p>
			</details>
			<details>
				<summary>
					<T message={'La capture est vide, incomplète ou l’envoi échoue'} />
				</summary>
				<p>
					<T
						message={
							'Attends que le terrain soit chargé, rapproche-toi de la construction et recommence avec le rayon 16. Certains blocs moddés ne sont pas reproduits fidèlement. Si l’envoi échoue, conserve capture.glb et regarde-le localement. Vérifie ta connexion, génère un nouveau code si les cinq minutes sont écoulées et réessaie ; la limite d’envoi du mod est 450 MiB.'
						}
					/>
				</p>
			</details>
		</section>
	)
}

export function InstallationPage() {
	const { t, locale } = useI18n()

	const [guide, setGuide] = useState(() => ({ ...defaults, done: [] as number[] }))
	const [restored, setRestored] = useState(false)
	const heading = useRef<HTMLHeadingElement>(null)
	const [moveFocus, setMoveFocus] = useState(false)
	useEffect(() => {
		setGuide(readGuide())
		setRestored(true)
	}, [])
	useEffect(() => {
		if (restored) saveGuide(guide)
	}, [guide, restored])
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
		<article lang={locale} className={`installation ${guide.reduceMotion ? 'install-still' : ''}`}>
			<header className="install-hero">
				<div>
					<span className="install-eyebrow">
						<T message={'Le premier souvenir commence ici'} />
					</span>
					<h1>
						<T message={'Installer le mod Minemories'} />
					</h1>
					<p className="install-lead">
						<T message={'Un petit fichier.'} />
						<br />
						<T message={'Une nouvelle façon de garder tes mondes.'} />
					</p>
					<p>
						<T
							message={
								'On avance ensemble, une étape à la fois. Pas besoin de savoir coder : choisis ton ordinateur, suis le guide et garde ton premier souvenir en 3D.'
							}
						/>
					</p>
					<a className="install-primary" href="#parcours">
						<T message={'Commencer l’installation'} /> <span aria-hidden="true">↓</span>
					</a>
					<p className="install-caption">
						<T message={'Minecraft Java 1.21.1 · NeoForge 21.1.248 · Mod expérimental'} />
					</p>
				</div>
				<div className="install-hero-art">
					<InstallationScene step={guide.step} />
					<span>
						<T message={'Construire. Capturer. Revenir.'} />
					</span>
				</div>
			</header>
			<p className="install-view-only">
				<T message={'Tu viens juste regarder un souvenir partagé ? Ouvre son lien : tu n’as rien à installer.'} />
			</p>
			<GuidePreferences guide={guide} update={update} />
			<section id="parcours" className="install-journey" aria-label={t('Guide pas à pas')}>
				<div className="install-progress-heading">
					<div>
						<span className="install-eyebrow">
							{guide.name.trim() ? t('Your turn, {name}', { name: guide.name.trim() }) : t('À toi de jouer')}
						</span>
						<h2>
							<T message={'Du téléchargement au premier souvenir.'} />
						</h2>
					</div>
					<span role="status">
						{guide.done.length} <T message={'/ 6 étapes cochées'} />
					</span>
				</div>
				<progress value={guide.done.length} max={6} aria-label={t('Progression de l’installation')} />
				<div className="install-workspace">
					<nav className="install-step-nav" aria-label={t('Étapes d’installation')}>
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
									{t(name)}
									{guide.done.includes(index) && (
										<small>
											<T message={'Étape cochée'} />
										</small>
									)}
								</span>
							</button>
						))}
					</nav>
					<div className="install-panel" key={`${guide.launcher}-${guide.step}`}>
						<div className="install-panel-meta">
							<span>
								<T message={'Étape 0'} />
								{guide.step + 1}
							</span>
							<span>{t(launcherNames[guide.launcher])}</span>
						</div>
						<h3 ref={heading} tabIndex={-1}>
							{t(stepNames[guide.step] ?? '')}
						</h3>
						<InstallationStep step={guide.step} system={guide.system} launcher={guide.launcher} />
						<div className="install-panel-actions">
							<button
								className="install-secondary"
								type="button"
								disabled={guide.step === 0}
								onClick={() => goTo(guide.step - 1)}
							>
								<T message={'← Précédent'} />
							</button>
							<button className="install-primary" type="button" onClick={completeStep}>
								{guide.step === 5 ? t('Mon souvenir s’ouvre en 3D') : t('C’est fait, on continue')}{' '}
								<span aria-hidden="true">✓</span>
							</button>
						</div>
						<p className="install-caption">
							<T
								message={'Coche une étape quand tu l’as réalisée. Tu peux aussi naviguer librement entre les étapes.'}
							/>
						</p>
					</div>
				</div>
				{complete && (
					<div className="install-success" role="status">
						<span aria-hidden="true">✦</span>
						<div>
							<h2>
								{guide.name.trim()
									? t('Your first memory, {name}.', { name: guide.name.trim() })
									: t('Ton premier souvenir est là.')}
							</h2>
							<p>
								<T
									message={
										'Si la capture s’ouvre correctement, tu as terminé ce premier essai. Garde aussi une sauvegarde du monde : un souvenir 3D ne permet pas de reprendre la partie.'
									}
								/>
							</p>
							<Link to="/fonctionnement">
								<T message={'Explorer les captures, la galerie et le partage →'} />
							</Link>
						</div>
					</div>
				)}
				<div className="install-resume">
					<p>
						<T
							message={
								'Ton prénom, tes choix et ta progression restent dans ce navigateur, sur cet appareil. Tu peux fermer cette page et revenir.'
							}
						/>
					</p>
					<button
						type="button"
						onClick={() => {
							setMoveFocus(false)
							setGuide(resetGuide())
						}}
					>
						<T message={'Recommencer et effacer mes choix'} />
					</button>
				</div>
			</section>
			<InstallationHelp />
			<p className="install-caption install-final-note">
				<T
					message={
						'Minemories est expérimental : commence par un monde de test et garde tes fichiers locaux. Les étapes cochées servent de repères ; elles ne vérifient pas le jeu à ta place.'
					}
				/>
			</p>
			<InfoNavigation />
			<noscript>
				<section className="install-help">
					<h2>
						<T message={'Guide manuel Windows sans JavaScript'} />
					</h2>
					<p>
						<T message={'Télécharge le mod depuis'} />{' '}
						<a href="https://github.com/For-Hives/minemories/releases">GitHub Releases</a>
						<T message={'. Voici toutes les étapes du parcours Minecraft Launcher :'} />
					</p>
					{stepNames.map((name, index) => (
						<section key={name}>
							<h3>
								{index + 1}. {t(name)}
							</h3>
							<InstallationStep step={index} system="windows" launcher="manuel" />
						</section>
					))}
				</section>
			</noscript>
		</article>
	)
}
