interface AvatarUser {
	image?: string | null | undefined
}

/** The account image (a Minecraft head or a sign-in provider photo), or `null` to keep the local initial. */
export function avatarUrl(user: AvatarUser): string | null {
	return user.image || null
}
