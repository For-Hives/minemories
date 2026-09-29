export function hashHandle(value: string): string {
	let hash = 5381
	for (let index = 0; index < value.length; index += 1) {
		hash = ((hash << 5) + hash + value.charCodeAt(index)) >>> 0
	}
	return hash.toString(16).padStart(8, '0')
}

interface AvatarUser {
	id?: string | null | undefined
	email?: string | null | undefined
	name?: string | null | undefined
	image?: string | null | undefined
}

export function avatarUrl(user: AvatarUser): string {
	if (user.image) return user.image
	const handle = [user.id, user.email, user.name].filter(Boolean).join('|') || 'player'
	const seed = hashHandle(handle)
	return `https://api.dicebear.com/9.x/pixel-art/svg?seed=${seed}&backgroundColor=1c2720,2a362e`
}
