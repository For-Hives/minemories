/** A legal section: a heading, its text and, for a list of facts, one line per item. */
export interface LegalSection {
	heading: string
	body: string
	items?: readonly string[]
}

export const legalContent: Record<'privacy' | 'terms' | 'legal', { title: string; sections: readonly LegalSection[] }> =
	{
		privacy: {
			title: 'Privacy',
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
					body: 'The mod’s error reports are on by default, but nothing is sent until you connect the game to your account.',
					items: [
						'What is sent: the versions, the step that failed and a short technical trace.',
						'What is never sent: messages, full crash logs, links, paths on your computer, passwords, coordinates, seeds, world, player or server names, or what your memories hold.',
						'The mod keeps at most eight reports, for at most seven days.',
						'If you turn them off, that choice stays, even after you reconnect or change server.',
						'Turning them off, or changing account or server, deletes the reports still waiting. Turning them off also asks our server to delete this device’s reports.',
						'To turn them off: M → Settings → Privacy → Diagnostics.',
					],
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
						'Contabo GmbH (Germany): hosting of the site, the API, the database (account, connected games, gallery details), the visit statistics and the storage of captures and mod files.',
						'Cloudflare (United States): domain name and DNS of minemories.net.',
						'head.sttr.io: the head of your Minecraft skin, if you choose it as your picture. Your browser sends it your Minecraft username, nothing else.',
						'Resend (United States): sends the email with the link when you ask for a new password. It receives your email address and your name.',
						'Google or Discord, only if you sign in with them when the option is offered: they share your name, email address and profile picture with Minemories.',
					],
				},
				{
					heading: 'Visit statistics',
					body: 'Minemories counts visits with Umami, an open-source tool the publisher hosts at Contabo, in Germany. No other company sees these statistics. It sets no cookie and shows no ads. It records the page, the site you came from, your browser, your country, page speed and page errors. Share links and public links are never recorded in full. When you are signed in, visits are tied to a code made from your account, never to your name or email. Your IP address gives the country and is not kept. The switch below turns it off on this device, as does your browser’s Do Not Track or Global Privacy Control.',
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
					body: 'Follow the server’s rules and respect the people whose builds appear in your memories. Check what’s in a memory before you share it.',
				},
			],
		},
		legal: {
			title: 'Legal notice',
			sections: [
				{
					heading: 'Independent project',
					body: 'Minemories is an independent project, not endorsed by Mojang or Microsoft. Its code is public on GitHub.',
				},
			],
		},
	}
