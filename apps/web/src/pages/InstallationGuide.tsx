import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { buttonLime } from '../components/ui'
import { T, useI18n } from '../i18n/I18n'
import { QuestionStep } from './InstallationQuestions'
import { InstallationStep, stepTitles } from './InstallationSteps'
import { type GuideState, recommendedLoader, stepsFor, targetFor } from './installation-state'

function Success({ onRestart }: { onRestart: () => void }) {
	return (
		<div className="install-success" role="status">
			<span aria-hidden="true">✦</span>
			<div>
				<p>
					<T
						message={
							'If the capture opens correctly, you have completed this first trial. Keep a world backup too: a 3D memory cannot resume your game.'
						}
					/>
				</p>
				<p>
					<Link to="/how-it-works">
						<T message={'Explore captures, the gallery and sharing →'} />
					</Link>
				</p>
				<button type="button" className="install-quiet" onClick={onRestart}>
					<T message={'Start again and clear my choices'} />
				</button>
			</div>
		</div>
	)
}

/**
 * The guided installation: one screen at a time, one main action, a quiet way back and a thin progress bar.
 * Focus lands on the screen's title whenever the visitor moves, so keyboard and screen reader users follow along.
 */
export function InstallationGuide({
	guide,
	update,
	focusOnEnter,
	onExit,
	onRestart,
}: {
	guide: GuideState
	update: (value: Partial<GuideState>) => void
	focusOnEnter: boolean
	onExit: () => void
	onRestart: () => void
}) {
	const { t } = useI18n()
	const heading = useRef<HTMLHeadingElement>(null)
	const moveFocus = useRef(focusOnEnter)
	const steps = stepsFor(guide)
	const index = guide.step === 'done' ? steps.length : Math.max(0, steps.indexOf(guide.step))
	const target = targetFor(guide.minecraft, guide.loader)
	useEffect(() => {
		if (moveFocus.current) heading.current?.focus()
	}, [guide.step])
	function go(step: GuideState['step']) {
		moveFocus.current = true
		update({ step })
	}
	function choose(value: Partial<GuideState>) {
		const next = { ...guide, ...value }
		const loader = next.needsLoader ? recommendedLoader(next.minecraft) : targetFor(next.minecraft, next.loader).loader
		update({ ...value, loader })
	}
	const step = guide.step === 'done' ? null : steps[index]
	const question = step === 'system' || step === 'minecraft' || step === 'loader'
	// No version is preselected: the guide waits for one before going on.
	const waiting = step === 'minecraft' && !guide.minecraft
	return (
		<section className="install-guide" aria-label={t('Step-by-step guide')}>
			{step ? (
				<div className="install-progress">
					<span role="status">
						<T message={'Step {current} of {total}'} params={{ current: index + 1, total: steps.length }} />
					</span>
					<progress value={index + 1} max={steps.length} aria-label={t('Installation progress')} />
				</div>
			) : null}
			<div className="install-panel" key={guide.step}>
				<h2 ref={heading} tabIndex={-1}>
					{step ? t(stepTitles[step]) : t('Your first memory is here.')}
				</h2>
				{step && question && <QuestionStep step={step} selection={guide} onSelect={choose} />}
				{step && !question && (
					<InstallationStep step={step} system={guide.system} target={target} needsLoader={guide.needsLoader} />
				)}
				{!step && <Success onRestart={onRestart} />}
				{step && (
					<div className="install-panel-actions">
						<button
							className={`${buttonLime} install-primary`}
							type="button"
							disabled={waiting}
							onClick={() => go(steps[index + 1] ?? 'done')}
						>
							{index === steps.length - 1 ? t('My memory opens in 3D') : t('Continue')}
						</button>
						<button
							type="button"
							className="install-quiet"
							onClick={() => (index === 0 ? onExit() : go(steps[index - 1] ?? 'system'))}
						>
							<T message={'← Back'} />
						</button>
					</div>
				)}
			</div>
			<p className="install-caption">
				<T
					message={'Your choices and progress stay in this browser on this device. You can close this page and return.'}
				/>
			</p>
		</section>
	)
}
