import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { RadiusMap, ShareDemo } from '../components/diagrams'
import { FileTree, Glyph } from '../components/explainers'
import {
	type FaqEntry,
	type FaqGroupId,
	faqGroups,
	faqText,
	linkWarning,
	pageFaqGroups,
	type QuestionId,
	questions,
} from '../content/faq'
import { useI18n } from '../i18n/I18n'

export function InfoPage({ title, children }: { title: string; children: ReactNode }) {
	const { locale, t } = useI18n()
	return (
		<article lang={locale} className="mm-info">
			<h1>{t(title)}</h1>
			{children}
		</article>
	)
}

const notThis = [
	'You can’t play in it or edit it.',
	'It isn’t a backup of your world.',
	'It saves one area, not the whole world.',
	'Only Minecraft Java, on a computer.',
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
		['Minemories', 'Yes', 'Yes, in 3D', 'Yes, if you captured it before', 'No'],
		['Screenshots, video', 'Yes', 'Yes, one view', 'Yes', 'No'],
		['Replay Mod', 'Yes', 'No, it needs Minecraft and the mod', 'Yes', 'No'],
		['World copy (WorldTools, ZIP)', 'With the admin’s consent', 'No', 'Yes', 'Yes'],
		['BlueMap', 'No, it runs on the server', 'Yes', 'No, unless you host it yourself', 'No'],
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
		<InfoPage title="Your Minecraft world in 3D">
			<p className="ex-lead">
				{t('Minemories is a Minecraft Java mod. It saves the area around you in 3D.')}{' '}
				{t('You walk around it in your browser, even after the server is gone.')}
			</p>
			<h2>{t('Its limits')}</h2>
			<ul className="ex-list">
				{notThis.map(label => (
					<li key={label}>{t(label)}</li>
				))}
			</ul>
			<h2>{t('Other ways to keep a build')}</h2>
			<Comparison />
			<FaqLink group={pageFaqGroups.concept} />
		</InfoPage>
	)
}

/** The four steps, top to bottom, each with its drawing: what the mod takes, where the file lands, what connecting adds, what sharing shows. */
export function HowItWorksPage() {
	const { t } = useI18n()
	return (
		<InfoPage title="How it works">
			<ol className="ex-steps">
				<li>
					<h2>{t('1. You play')}</h2>
					<p>{t('Press M → Take a memory. Or go AFK for 5 minutes: the mod takes one for you.')}</p>
					<RadiusMap initial={32} />
				</li>
				<li>
					<h2>{t('2. The file stays with you')}</h2>
					<p>{t('Each memory is a 3D file on your computer.')}</p>
					<FileTree />
				</li>
				<li>
					<h2>{t('3. You connect the game, if you want')}</h2>
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
					<h2>{t('4. You share it, if you want')}</h2>
					<p>{t('Download a postcard, or send a link.')}</p>
					<p className="ex-line">{t(linkWarning)}</p>
					<ShareDemo />
				</li>
			</ol>
			<p>
				<Link to="/safety">{t('Safety and privacy')} →</Link>
			</p>
			<FaqLink group={pageFaqGroups.howItWorks} />
		</InfoPage>
	)
}

/** The end of a guide page: one link to its group of /faq, in place of answers copied from it. */
export function FaqLink({ group }: { group: FaqGroupId }) {
	const { t } = useI18n()
	const label = faqGroups.find(entry => entry.id === group)?.label ?? 'FAQ'
	return (
		<p className="ex-faq-link">
			<Link to={`/faq#${group}`}>{t('Questions: {topic}', { topic: t(label) })}&nbsp;→</Link>
		</p>
	)
}

/** The questions of one /faq group and their short answers, from content/faq.ts, each with its anchor (`/faq#ban`). */
function Questions({ ids }: { ids: readonly QuestionId[] }) {
	const { t } = useI18n()
	return (
		<div className="ex-faq">
			{ids.map(id => {
				const entry: FaqEntry = questions[id]
				const { question, answer } = faqText(id, t)
				return (
					<div key={id} className="ex-faq-item" id={id}>
						<h3>
							<a href={`#${id}`}>{question}</a>
						</h3>
						<p>
							{answer}
							{entry.link && (
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
				<section key={group.id} id={group.id} className="ex-faq-group">
					<h2>{t(group.label)}</h2>
					<Questions ids={group.ids} />
				</section>
			))}
		</InfoPage>
	)
}
