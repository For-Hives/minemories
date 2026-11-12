import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { buttonLime } from '../components/ui'
import { T, useI18n } from '../i18n/I18n'
import { type Answers, canContinue, type GuideState, nextStep, previousStep, stepPosition } from '../lib/install-guide'
import type { System } from '../lib/platform'
import { InstructionStep, questions, stepTitles } from './InstallationSteps'
import { catalogNames } from './installation-state'
import { loaderTargets } from './mod-targets'

function Success({ onRestart }: { onRestart: () => void }) {
	return (
		<div className="install-success" role="status">
			<span aria-hidden="true">✦</span>
			<div>
				<p>
					<T message={'If it opens, you’re all set. Keep a world backup too: a 3D memory cannot resume your game.'} />
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
 * The guided installation: one screen at a time, one main action, a quiet way back and a thin progress bar. Focus lands
 * on the screen's title whenever the visitor moves, so keyboard and screen reader users follow along; a restored or
 * preset guide leaves focus where it is.
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
	const catalogs = catalogNames()
	useEffect(() => {
		if (moveFocus.current) heading.current?.focus()
	}, [guide.step])
	function go(step: GuideState['step']) {
		moveFocus.current = true
		update({ step })
	}
	const step = guide.step === 'done' ? null : guide.step
	const { current, total } = stepPosition(guide, catalogs)
	const ready = step === null || canContinue(loaderTargets, step, guide)
	const Question = step ? questions[step] : undefined
	return (
		<section className="install-guide" aria-label={t('Step-by-step guide')}>
			{step && (
				<div className="install-progress">
					<span role="status">
						<T message={'Step {current} of {total}'} params={{ current, total }} />
					</span>
					<progress value={current} max={total} aria-label={t('Installation progress')} />
				</div>
			)}
			<div className="install-panel" key={guide.step}>
				<h2 ref={heading} tabIndex={-1}>
					{step ? t(stepTitles[step], { app: guide.way }) : t('Your first memory is here.')}
				</h2>
				{step && Question && <Question guide={guide} onAnswer={(answers: Answers) => update(answers)} />}
				{step && !Question && (
					<InstructionStep step={step} guide={guide} onSystem={(system: System) => update({ system })} />
				)}
				{!step && <Success onRestart={onRestart} />}
				{step && (
					<div className="install-panel-actions">
						<button
							className={`${buttonLime} install-primary`}
							type="button"
							disabled={!ready}
							aria-describedby={ready ? undefined : 'install-pick'}
							onClick={() => go(nextStep(guide, catalogs))}
						>
							{current === total ? t('My memory opens in 3D') : t('Continue')}
						</button>
						{!ready && (
							<p id="install-pick" className="install-caption">
								<T message={'Pick an answer to continue.'} />
							</p>
						)}
						<button
							type="button"
							className="install-quiet"
							onClick={() => {
								const previous = previousStep(guide, catalogs)
								if (previous) go(previous)
								else onExit()
							}}
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
