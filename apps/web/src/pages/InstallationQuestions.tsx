import type { ReactNode } from 'react'
import { T, useI18n } from '../i18n/I18n'
import { type System, systems } from '../lib/platform'
import { loadersFor, mostUsed, type StepId, validatedMinecraft } from './installation-state'
import { minecraftVersions } from './mod-releases'

export const systemNames: Record<System, string> = { windows: 'Windows', mac: 'macOS', linux: 'Linux' }

interface Choice {
	value: string
	label: string
	hint?: string
	badge?: string
}

/** A group of large radio cards: native radios keep arrow-key navigation and screen reader semantics. */
function ChoiceCards({
	name,
	legend,
	choices,
	value,
	onChange,
}: {
	name: string
	legend: string
	choices: Choice[]
	value: string
	onChange: (value: string) => void
}) {
	return (
		<fieldset className="install-cards">
			<legend className="install-sr-only">{legend}</legend>
			{choices.map(choice => (
				<label key={choice.value} className="install-card">
					<input
						type="radio"
						name={name}
						value={choice.value}
						checked={choice.value === value}
						onChange={() => onChange(choice.value)}
					/>
					<span className="install-card-face">
						<strong>{choice.label}</strong>
						{choice.hint && <small>{choice.hint}</small>}
						{choice.badge && <em>{choice.badge}</em>}
					</span>
				</label>
			))}
		</fieldset>
	)
}

interface Selection {
	system: System
	minecraft: string
	loader: string
}

function SystemQuestion({
	selection,
	onSelect,
}: {
	selection: Selection
	onSelect: (value: Partial<Selection>) => void
}) {
	const { t } = useI18n()
	return (
		<>
			<p className="install-goal">
				<T message={'You need'} />{' '}
				<strong>
					<T message={'Minecraft Java Edition on a computer'} />
				</strong>
				<T message={'. The mod is not available for Bedrock, consoles or mobile devices.'} />
			</p>
			<ChoiceCards
				name="system"
				legend={t('Which computer do you play on?')}
				value={selection.system}
				choices={systems.map(value => ({ value, label: systemNames[value] }))}
				onChange={value => onSelect({ system: value as System })}
			/>
			<p className="install-caption">
				<T message={'We guessed this from your browser. Change it if it is not right.'} />
			</p>
		</>
	)
}

function versionBadge(version: string, t: (message: string) => string): { badge?: string } {
	if (version === mostUsed.minecraft) return { badge: t('Most used') }
	if (version === validatedMinecraft) return { badge: t('Validated in game') }
	return {}
}

function MinecraftQuestion({
	selection,
	onSelect,
}: {
	selection: Selection
	onSelect: (value: Partial<Selection>) => void
}) {
	const { t } = useI18n()
	const choices = minecraftVersions().map(version => ({
		value: version,
		label: version,
		hint: loadersFor(version)
			.map(item => item.name)
			.join(' · '),
		...versionBadge(version, t),
	}))
	return (
		<>
			<p className="install-goal">
				<T message={'Pick the version of Minecraft Java you launch. The mod file must match it.'} />
			</p>
			<ChoiceCards
				name="minecraft"
				legend={t('Which Minecraft version do you play?')}
				value={selection.minecraft}
				choices={choices}
				onChange={value => onSelect({ minecraft: value })}
			/>
		</>
	)
}

function LoaderQuestion({
	selection,
	onSelect,
}: {
	selection: Selection
	onSelect: (value: Partial<Selection>) => void
}) {
	const { t } = useI18n()
	const choices = loadersFor(selection.minecraft).map(item => ({
		value: item.loader,
		label: item.name,
		hint: item.loaderVersion,
		...(item.loader === mostUsed.loader && item.minecraft === mostUsed.minecraft ? { badge: t('Most used') } : {}),
	}))
	return (
		<>
			<p className="install-goal">
				<T message={'A loader is what lets Minecraft run mods. Pick the one your profile uses.'} />
			</p>
			<ChoiceCards
				name="loader"
				legend={t('Which mod loader do you use?')}
				value={selection.loader}
				choices={choices}
				onChange={value => onSelect({ loader: value })}
			/>
			<p className="install-caption">
				<T message={'Not sure? Fabric and NeoForge are the usual choices, and the guide works the same for both.'} />
			</p>
		</>
	)
}

/** The screens that ask a light question before the installation itself. */
export function QuestionStep({
	step,
	selection,
	onSelect,
}: {
	step: StepId
	selection: Selection
	onSelect: (value: Partial<Selection>) => void
}): ReactNode {
	if (step === 'system') return <SystemQuestion selection={selection} onSelect={onSelect} />
	if (step === 'minecraft') return <MinecraftQuestion selection={selection} onSelect={onSelect} />
	return <LoaderQuestion selection={selection} onSelect={onSelect} />
}
