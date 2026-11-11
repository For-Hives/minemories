interface AvatarUser {
	image?: string | null | undefined
}

/** Accounts saved before the move to head.sttr.io still hold a head.sttr.io address: `https://minotar.net/helm/<name>/64.png`. */
const LEGACY_HEAD = /^https:\/\/minotar\.net\/helm\/([^/]+)\/64\.png$/

/** The account image (a Minecraft head or a sign-in provider photo), or `null` to keep the local initial. */
export function avatarUrl(user: AvatarUser): string | null {
	if (!user.image) return null
	const legacy = LEGACY_HEAD.exec(user.image)
	return legacy ? `https://head.sttr.io/face/${legacy[1]}` : user.image
}
