export type System = 'windows' | 'mac' | 'linux'
export const systems: readonly System[] = ['windows', 'mac', 'linux']

/** What a browser tells about the computer it runs on; `navigator` satisfies it. */
export interface PlatformHints {
	userAgentData?: { platform?: string }
	platform?: string
	userAgent?: string
}

// macOS and iOS first: "Darwin" and "Mac OS X" would otherwise be read as other systems. Android reports itself as Linux.
const patterns: [System, RegExp][] = [
	['mac', /mac|darwin|iphone|ipad|ipod|\bios\b/i],
	['windows', /\bwin(?:dows|32|64|ce)?\b/i],
	['linux', /linux|x11|cros|android|freebsd|openbsd/i],
]

/** The system a platform or user-agent string names, or null when it does not name one. */
export function systemFromText(text: string | undefined): System | null {
	if (!text) return null
	return patterns.find(([, pattern]) => pattern.test(text))?.[0] ?? null
}

/**
 * The system the visitor most likely plays on. The modern client hint wins over the legacy platform, which wins over the
 * user agent; Windows is the answer when nothing is recognised, since it is the most common Minecraft Java platform.
 */
export function detectSystem(hints: PlatformHints): System {
	for (const text of [hints.userAgentData?.platform, hints.platform, hints.userAgent]) {
		const system = systemFromText(text)
		if (system) return system
	}
	return 'windows'
}

export function isSystem(value: unknown): value is System {
	return systems.includes(value as System)
}
