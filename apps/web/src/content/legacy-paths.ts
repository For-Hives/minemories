/**
 * Retired and former URLs, each sent straight to its final page in one hop (query string and fragment kept). The
 * same list is served as 301s by the `$mm_redirect` map of deploy/nginx.web.conf; legacy-paths.test.ts keeps the two
 * in step and checks that no target is itself redirected.
 */
export const legacyPaths: Record<string, string> = {
	'/discover': '/concept',
	'/decouvrir': '/concept',
	// The before/after block planned at /concept#avant-apres needs real dated captures of one place: plain /concept until then.
	'/nostalgia': '/concept',
	'/nostalgie': '/concept',
	'/open-source': '/legal',
	'/ranking': '/explore',
	'/classement': '/explore',
	'/explorer': '/explore',
	'/changelog': '/versions',
	'/blog': '/how-it-works',
	'/blog/premier-souvenir': '/how-it-works',
	'/fonctionnement': '/how-it-works',
	'/partager': '/sharing',
	'/telechargements': '/downloads',
}
