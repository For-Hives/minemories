import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { RadiusMap, ShareDemo } from '../components/diagrams'
import { FileTree, Glyph, type GlyphName } from '../components/explainers'
import { buttonLime } from '../components/ui'
import { type FaqEntry, faqGroups, faqText, pageQuestions, type QuestionId, questions } from '../content/faq'
import { useI18n } from '../i18n/I18n'

export const infoLinks = [
	{ to: '/concept', label: 'The concept' },
	{ to: '/how-it-works', label: 'How it works' },
	{ to: '/installation', label: 'Install the mod' },
	{ to: '/downloads', label: 'All downloads' },
	{ to: '/faq', label: 'FAQ' },
]

export function InfoNavigation() {
	const { t } = useI18n()

	return (
		<nav aria-label={t('Minemories guides')} className="mm-info-nav">
			{infoLinks.map(link => (
				<Link key={link.to} to={link.to}>
					{t(link.label)}
				</Link>
			))}
		</nav>
	)
}

export function InfoPage({ title, children }: { title: string; children: ReactNode }) {
	const { locale, t } = useI18n()
	return (
		<article lang={locale} className="mm-info">
			<InfoNavigation />
			<h1>{t(title)}</h1>
			{children}
		</article>
	)
}

const notThis: Array<[GlyphName, string]> = [
	['refresh', 'Not playable'],
	['pencil', 'Not editable'],
	['disk', 'Not a backup'],
	['cube', 'One area, not the whole world'],
	['globe', 'Java on a computer only'],
]
type Cell = 'Yes' | 'No' | (string & {})
/** The ways to keep a build, compared on what a player asks first. Dated: the other tools change. */
const comparison: { columns: string[]; rows: Array<[string, Cell, Cell, Cell, Cell]> } = {
	columns: [
		'Nothing to install on the server',
		'Viewable without Minecraft',
		'Stays after the server closes',
		'Playable again',
	],
	rows: [
		['Minemories', 'Yes', 'Yes, in 3D', 'Yes, if captured before', 'No'],
		['Screenshots, video', 'Yes', 'Yes, one view', 'Yes', 'No'],
		['Replay Mod', 'Yes', 'No, it needs Minecraft and the mod', 'Yes', 'No'],
		['World copy (WorldTools, ZIP)', 'With the admin’s consent', 'No', 'Yes', 'Yes'],
		['BlueMap', 'No, it runs on the server', 'Yes', 'No, unless hosted separately', 'No'],
	],
}

function Comparison() {
	const { t } = useI18n()
	return (
		// biome-ignore lint/a11y/noNoninteractiveTabindex: the table scrolls on its own on a phone; keyboard users need to reach it.
		<section className="ex-table-scroll" tabIndex={0} aria-label={t('Compared in November 2026.')}>
			<table className="ex-compare">
				<caption>{t('Compared in November 2026.')}</caption>
				<thead>
					<tr>
						<td />
						{comparison.columns.map(column => (
							<th key={column} scope="col">
								{t(column)}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{comparison.rows.map(([name, ...cells]) => (
						<tr key={name}>
							<th scope="row">{t(name)}</th>
							{cells.map((cell, index) => (
								<td key={comparison.columns[index]} data-verdict={cell.startsWith('Yes') ? 'yes' : 'no'}>
									{t(cell)}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</section>
	)
}

export function ConceptPage() {
	const { t } = useI18n()
	return (
		<InfoPage title="Your Minecraft world, ready to visit in 3D">
			<p className="ex-lead">
				{t(
					'Minemories is a mod for Minecraft Java. In the game, it keeps a 3D copy of the area around you: your house, your village, the group’s base. You find it again in your browser, even once the server is gone.'
				)}
			</p>
			<h2>{t('What it is not')}</h2>
			<ul className="ex-not">
				{notThis.map(([glyph, label]) => (
					<li key={label}>
						<Glyph name={glyph} />
						{t(label)}
					</li>
				))}
			</ul>
			<h2>{t('Other ways to keep a build')}</h2>
			<Comparison />
			<h2>{t('Questions')}</h2>
			<Questions ids={pageQuestions.concept} />
			<p>
				<Link className={buttonLime} to="/installation">
					{t('Install the mod')}
				</Link>
			</p>
		</InfoPage>
	)
}

/** The four steps, top to bottom, each with its drawing: what the mod takes, where the file lands, what connecting adds, what sharing shows. */
export function HowItWorksPage() {
	const { t } = useI18n()
	return (
		<InfoPage title="From Minecraft world to 3D memory">
			<ol className="ex-steps">
				<li>
					<h2>{t('1. You play')}</h2>
					<p>
						{t('Press M → Take a memory.')}{' '}
						{t(
							'Or leave the game for 5 minutes, even paused: the mod keeps one on its own (at most one every 4 hours).'
						)}{' '}
						{t('About 32 blocks around you, adjusted to what you built.')}
					</p>
					<RadiusMap initial={32} />
				</li>
				<li>
					<h2>{t('2. The file stays with you')}</h2>
					<p>
						{t('Each memory is a GLB file, textures and lights included, in the export folder of your home folder.')}
					</p>
					<FileTree />
				</li>
				<li>
					<h2>{t('3. You connect the game, if you want')}</h2>
					<p>
						{t('On the site, create an account and get a 6-digit code.')}{' '}
						{t('In Minecraft: M → type the code → Connect.')} {t('Your memories then go to your private gallery.')}
					</p>
					<ol className="ex-chain">
						<li>
							<Glyph name="key" />
							<Link to="/gallery">{t('Get a code in your gallery')}</Link>
						</li>
						<li>
							<Glyph name="code" />
							{t('In Minecraft: M → type the code → Connect')}
						</li>
						<li>
							<Glyph name="cloud" />
							{t('Your memories go to your gallery on their own')}
						</li>
					</ol>
				</li>
				<li>
					<h2>{t('4. You show it, if you want')}</h2>
					<p>
						{t('Download a postcard, or create a link to one memory or to a whole world.')}{' '}
						{t('You stop sharing whenever you want.')}
					</p>
					<ShareDemo />
					<p className="ex-line">
						{t(
							'The link also shows the coordinates, the world name, the seed (in single player) or the server name or address.'
						)}
					</p>
				</li>
			</ol>
			<h2>{t('Questions')}</h2>
			<Questions ids={pageQuestions.howItWorks} />
			<p>
				<Link to="/safety">{t('Is Minemories safe?')} →</Link>
			</p>
			<p>
				<Link className={buttonLime} to="/installation">
					{t('Install the mod')}
				</Link>
			</p>
		</InfoPage>
	)
}

/**
 * Questions and their short answers, from content/faq.ts. On /faq each one carries its anchor (`/faq#ban`). An answer's
 * link to the page it is shown on is left out.
 */
export function Questions({ ids, anchors = false }: { ids: readonly QuestionId[]; anchors?: boolean }) {
	const { t } = useI18n()
	const { pathname } = useLocation()
	return (
		<div className="ex-faq">
			{ids.map(id => {
				const entry: FaqEntry = questions[id]
				const { question, answer } = faqText(id, t)
				return (
					<div key={id} className="ex-faq-item" id={anchors ? id : undefined}>
						<h3>{anchors ? <a href={`#${id}`}>{question}</a> : question}</h3>
						<p>
							{answer}
							{entry.link && entry.link.to !== pathname && (
								<>
									{' '}
									<Link to={entry.link.to}>{t(entry.link.label)} →</Link>
								</>
							)}
						</p>
					</div>
				)
			})}
		</div>
	)
}

export function FaqPage() {
	const { t } = useI18n()
	return (
		<InfoPage title="Frequently asked questions">
			{faqGroups.map(group => (
				<section key={group.label} className="ex-faq-group">
					<h2>{t(group.label)}</h2>
					<Questions ids={group.ids} anchors />
				</section>
			))}
			<p>
				<Link className={buttonLime} to="/installation">
					{t('Install the mod')}
				</Link>
			</p>
		</InfoPage>
	)
}
