export const legalContent = {
	privacy: {
		title: 'Your memories, your choices',
		sections: [
			{
				heading: 'Preferences on this device',
				body: 'Your browser keeps your language, the version and loader picked in the installation guide, the demo’s favorites and votes, some names you give in your gallery, and text you typed but did not save. Clear them in your browser’s site data.',
			},
			{
				heading: 'Optional web diagnostics',
				body: 'Web diagnostics are off by default. When they are available, a switch on this page lets you allow them and withdraw consent for this device. Only fixed error categories and public editorial page routes are transmitted, without raw messages, account details, captures, codes or private URLs. Sign-in, gallery, viewer and sharing pages are excluded. The receiving server sees the connection IP address.',
			},
			{
				heading: 'Diagnostics in the Minecraft mod',
				body: "Technical diagnostics in the mod are on by default, but nothing is ever sent before you connect the game to your account. An explicit refusal is kept, even after connecting, disconnecting or changing API. Reports are sanitized: versions, the failed step and a short technical trace, without raw messages, full crash logs, URLs, local paths, credentials, coordinates, seeds, world, player or server names, or capture contents. The mod keeps at most eight pending reports, for at most seven days. Turning diagnostics off or changing account or API purges this queue; turning them off also asks the server to delete this device's reports, and if it cannot be reached, its retention applies. Turn them off in M → Settings → Privacy → Diagnostics.",
			},
			{
				heading: 'Account and gallery',
				body: 'Sign-in uses a session cookie. Uploaded captures and their metadata belong to your account; the gallery is private by default. Avatars may load from an external service. Once the game is connected, every memory taken with M → Take a memory, or while AFK, uploads to your gallery on its own.',
			},
			{
				heading: 'Links and deletion',
				body: 'A shared link can be forwarded and gives access without an account. Stop sharing blocks new visits, not copies already made. Trash keeps captures for 30 days; Delete forever frees the space once processed.',
			},
			{
				heading: 'Mod download list',
				body: 'The downloads and versions pages load the list of mod files from the Minemories API, directly from your browser; the API receives your IP address like any request to the service. JAR downloads also come from the Minemories API, without an account or cookie.',
			},
		],
	},
	terms: {
		title: 'Using Minemories',
		sections: [
			{
				heading: 'An experimental version',
				body: 'Keep your Minecraft backups and local files. Compatibility with every modpack, permanent availability and lifetime online storage are not guaranteed.',
			},
			{
				heading: 'Capture and share',
				body: 'Respect server rules and the rights of people whose builds or information appear in your captures. Check the contents before creating a shared link.',
			},
		],
	},
	legal: {
		title: 'Who makes Minemories',
		sections: [
			{
				heading: 'Independent project',
				body: 'Minemories is an independent, unofficial project, not endorsed by Mojang or Microsoft. The source code is public on GitHub; the mod is downloaded from the Downloads page.',
			},
			{
				heading: 'Information to complete',
				body: 'This page does not list the publisher, the host or a personal-data contact yet. It describes the current project; it is not a finalized legal notice.',
			},
		],
	},
}
