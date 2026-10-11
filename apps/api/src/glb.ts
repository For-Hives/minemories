import { isSelfContainedGlb } from '@minemories/api-contract/glb'

export function isGlbContainer(contents: Buffer): boolean {
	return isSelfContainedGlb(contents)
}
