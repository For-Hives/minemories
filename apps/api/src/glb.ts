import { validateSelfContainedGlb } from '@minemories/api-contract/glb'

export function isGlbContainer(contents: Buffer): Promise<boolean> {
	return validateSelfContainedGlb(contents)
}
