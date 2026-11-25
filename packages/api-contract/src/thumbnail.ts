import * as z from 'zod'

/** A small PNG or JPEG picture of a capture, carried inline as a data URL. */
export const thumbnailDataUrl = z
	.string()
	.max(96_000)
	.regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]*={0,2}$/)
