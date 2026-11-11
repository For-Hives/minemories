/**
 * A glTF `BLEND` material is drawn sorted per mesh without writing depth, so a texture that is really a cutout
 * (every texel fully opaque or fully transparent) shows the far faces of a model through its near ones. Captures made
 * before the mod classified textures honestly still carry such materials: this decides, from the texels, whether one
 * can be drawn as a depth-writing alpha test instead.
 */

/** Same share as the mod's `RenderedTexture.alphaMode`: 1/32 of the visible texels must be partial to blend. */
const PARTIAL_SHARE = 32

/** True when the RGBA texels only need an alpha test: no, or a stray few, partially transparent texels. */
export function isCutout(rgba: ArrayLike<number>): boolean {
	let partial = 0
	let visible = 0
	for (let index = 3; index < rgba.length; index += 4) {
		const alpha = rgba[index]
		if (alpha === 0) continue
		visible++
		if (alpha !== 255) partial++
	}
	return partial * PARTIAL_SHARE <= visible
}
