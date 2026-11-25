/**
 * The capture a world opens on: the link's snapshot when it is one the viewer loads, else the oldest loaded one, so
 * Play shows the world growing from there. Zero when nothing is loaded.
 */
export function startStep(ids: readonly string[], planned: readonly boolean[], snapshot?: string | null): number {
	const linked = snapshot ? ids.indexOf(snapshot) : -1
	if (linked >= 0 && planned[linked]) return linked
	return Math.max(0, planned.indexOf(true))
}
