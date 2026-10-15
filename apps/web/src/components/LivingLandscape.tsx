import { useState } from 'react'
import { Link } from 'react-router'
import { useLocalizedCopy } from '../i18n/useLocalizedCopy'
import { MemoryScene } from './MemoryScene'

export function LivingLandscape() {
	const { copy } = useLocalizedCopy()
	const [light, setLight] = useState('golden')
	return (
		<section
			className="album-landscape"
			data-light={light}
			aria-label={copy('Un souvenir, trois lumières', 'One memory, three lights')}
		>
			<div className="album-landscape-sky" aria-hidden="true">
				<span className="album-sun" />
				<span className="album-stars">· ˚ ·　　　 ✧　　　 · ˚　　　　✧</span>
				<i className="album-ridge album-ridge-back" />
				<i className="album-ridge album-ridge-front" />
			</div>
			<div className="album-landscape-heading">
				<span>MINEMORIES / 001</span>
				<span>{copy('Un endroit à retrouver', 'Somewhere to return to')}</span>
			</div>
			<div className="album-world">
				<MemoryScene
					theme="village"
					label={copy('Illustration d’un village au bord de l’eau', 'Illustration of a village by the water')}
				/>
			</div>
			<div className="album-landscape-caption">
				<span className="album-kicker">{copy('ILLUSTRATION INTERACTIVE', 'INTERACTIVE ILLUSTRATION')}</span>
				<h2>{copy('On se retrouve ici.', 'Meet me here.')}</h2>
				<Link to="/explorer?demo=1">
					{copy('Découvrir les souvenirs de démonstration', 'Explore the demo memories')}{' '}
					<span aria-hidden="true">↗</span>
				</Link>
			</div>
			<fieldset className="album-light-controls">
				<legend className="sr-only">{copy('Lumière de l’illustration', 'Illustration lighting')}</legend>
				{(['morning', 'golden', 'night'] as const).map((value, index) => (
					<button key={value} type="button" aria-pressed={light === value} onClick={() => setLight(value)}>
						<span aria-hidden="true">{['☀', '◐', '☾'][index]}</span>
						{copy(['Matin', 'Heure dorée', 'Nuit'], ['Morning', 'Golden hour', 'Night'])[index]}
					</button>
				))}
			</fieldset>
		</section>
	)
}
