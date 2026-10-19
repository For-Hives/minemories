import { useState } from 'react'
import { Link } from 'react-router'
import { useI18n } from '../i18n/I18n'
import { MemoryScene } from './MemoryScene'

export function LivingLandscape() {
	const { t } = useI18n()
	const [light, setLight] = useState('golden')
	return (
		<section className="album-landscape" data-light={light} aria-label={t('One memory, three lights')}>
			<div className="album-landscape-sky" aria-hidden="true">
				<span className="album-sun" />
				<span className="album-stars">· ˚ ·　　　 ✧　　　 · ˚　　　　✧</span>
				<i className="album-ridge album-ridge-back" />
				<i className="album-ridge album-ridge-front" />
			</div>
			<div className="album-landscape-heading">
				<span>MINEMORIES / 001</span>
				<span>{t('Somewhere to return to')}</span>
			</div>
			<div className="album-world">
				<MemoryScene theme="village" label={t('Illustration of a village by the water')} />
			</div>
			<div className="album-landscape-caption">
				<span className="album-kicker">{t('INTERACTIVE ILLUSTRATION')}</span>
				<h2>{t('Meet me here.')}</h2>
				<Link to="/explorer?demo=1">
					{t('Explore the demo memories')} <span aria-hidden="true">↗</span>
				</Link>
			</div>
			<fieldset className="album-light-controls">
				<legend className="sr-only">{t('Illustration lighting')}</legend>
				{(['morning', 'golden', 'night'] as const).map((value, index) => (
					<button key={value} type="button" aria-pressed={light === value} onClick={() => setLight(value)}>
						<span aria-hidden="true">{['☀', '◐', '☾'][index]}</span>
						{[t('Morning'), t('Golden hour'), t('Night')][index]}
					</button>
				))}
			</fieldset>
		</section>
	)
}
