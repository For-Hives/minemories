/** A legal section: a heading, its text and, for a list of facts, one line per item. */
export interface LegalSection {
	heading: string
	body: string
	items?: readonly string[]
}

export const legalContent: Record<'privacy' | 'terms' | 'legal', { title: string; sections: readonly LegalSection[] }> =
	{
		privacy: {
			title: 'Your memories, your choices',
			sections: [
				{
					heading: 'Preferences on this device',
					body: 'Your browser remembers your language, the version and loader you picked in the installation guide, the demo’s favorites and votes, and some names and drafts. You can clear all of it in your browser’s site data.',
				},
				{
					heading: 'Optional web diagnostics',
					body: 'Web diagnostics are off by default. When they exist, a switch on this page turns them on, and off again, for this device. They only send an error category and the public page it happened on: no messages, account details, captures, codes or private links. Sign-in, gallery, viewer and sharing pages are never included. Like any request, the server sees your IP address.',
				},
				{
					heading: 'Diagnostics in the Minecraft mod',
					body: 'Error reports from the mod are on by default, but nothing is sent until you connect the game to your account. If you turn them off, that choice is kept, even if you reconnect or change API. Reports hold only versions, the step that failed and a short technical trace. They never include messages, full crash logs, links, local paths, credentials, coordinates, seeds, world, player or server names, or capture contents. The mod keeps at most eight reports, for at most seven days. Turning reports off, or changing account or API, empties that queue; turning them off also asks the server to delete this device’s reports (if it can’t be reached, its retention period applies). To turn them off: M → Settings → Privacy → Diagnostics.',
				},
				{
					heading: 'Account and gallery',
					body: 'You stay signed in with a session cookie. Your captures belong to your account, and the gallery is private by default. Avatars may load from an external service. Once the game is connected, each memory you take, by hand or while AFK, goes to your gallery on its own.',
				},
				{
					heading: 'Links and deletion',
					body: 'A shared link can be forwarded and gives access without an account. Stop sharing blocks new visits, not copies already made. Trash keeps captures for 30 days; Delete forever frees the space once processed.',
				},
				{
					heading: 'Mod download list',
					body: 'The downloads and versions pages fetch the list of mod files from the Minemories API straight from your browser, so it sees your IP address, like any request. JAR downloads come from the API too, with no account or cookie.',
				},
				{
					heading: 'Who is responsible for your data',
					body: 'Andy Cinquin publishes Minemories and is responsible for the personal data it handles. Send any question or request about your data through the legal notice page.',
				},
				{
					heading: 'Service providers',
					body: 'Minemories relies on these providers to run the service. It never sells or rents your data.',
					items: [
						'Contabo GmbH (Germany): hosting of the site, the API, the database (account, connected games, gallery details) and the storage of captures and mod files.',
						'Cloudflare (United States): domain name and DNS of minemories.net.',
						'head.sttr.io: the head of your Minecraft skin, if you choose it as your picture. Your browser sends it your Minecraft username, nothing else.',
						'Google or Discord, only if you sign in with them when the option is offered: they share your name, email address and profile picture with Minemories.',
					],
				},
				{
					heading: 'No tracking',
					body: 'Minemories has no audience measurement, no advertising and no tracking cookie. The only cookies keep you signed in.',
				},
				{
					heading: 'Your rights',
					body: 'You can ask to see, correct, export or delete your data, or object to its processing, by contacting the publisher. Deleting your account removes your captures, your connected games and your shared links; only a record of the deletion (account name and date) is kept. You can also lodge a complaint with the CNIL, the French data protection authority (cnil.fr).',
				},
				{
					heading: 'Third-party sites',
					body: 'Links to GitHub, CurseForge, Modrinth and Discord open their own sites, which apply their own privacy policies.',
				},
			],
		},
		terms: {
			title: 'Using Minemories',
			sections: [
				{
					heading: 'An experimental version',
					body: 'This is a beta. Keep your Minecraft backups. We can’t promise it works with every modpack, or that your memories stay online forever.',
				},
				{
					heading: 'Capture and share',
					body: 'Follow the server’s rules and respect the people whose builds appear in your captures. Check what’s in a memory before you share it.',
				},
			],
		},
		legal: {
			title: 'Who makes Minemories',
			sections: [
				{
					heading: 'Independent project',
					body: 'Minemories is an independent project, not endorsed by Mojang or Microsoft. The code is public on GitHub; the mod is on the Downloads page.',
				},
			],
		},
	}
