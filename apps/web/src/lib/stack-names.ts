const STORAGE_KEY = 'minemories-stack-names'

function readAll(): Record<string, string> {
	try {
		return JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? '{}') as Record<string, string>
	} catch {
		return {}
	}
}

function stackId(groupKey: string, stackKey: string): string {
	return `${groupKey}/${stackKey}`
}

export function getStackName(groupKey: string, stackKey: string): string | null {
	return readAll()[stackId(groupKey, stackKey)] ?? null
}

export function setStackName(groupKey: string, stackKey: string, name: string): void {
	const names = readAll()
	const trimmed = name.trim().slice(0, 80)
	if (trimmed) names[stackId(groupKey, stackKey)] = trimmed
	else delete names[stackId(groupKey, stackKey)]
	try {
		globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(names))
	} catch {
		// Private browsing can refuse storage; the custom name then lasts for this view only.
	}
}
