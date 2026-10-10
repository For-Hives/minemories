import { app } from '../index'

const source = process.env.RESUME_SOURCE
const id = process.env.RESUME_ID
const token = process.env.RESUME_TOKEN
if (!(source && id && token)) throw new Error('Missing isolated upload resumption fixture.')
const bytes = Buffer.from(await Bun.file(source).arrayBuffer()).subarray(4 * 1024 * 1024)
const uploaded = await app.request(`/api/mod/uploads/${id}`, {
	method: 'PUT',
	headers: {
		authorization: `Bearer ${token}`,
		'content-type': 'application/octet-stream',
		'upload-offset': String(4 * 1024 * 1024),
	},
	body: Uint8Array.from(bytes).buffer,
})
const completed = await app.request(`/api/mod/uploads/${id}/complete`, {
	method: 'POST',
	headers: { authorization: `Bearer ${token}` },
})
process.stdout.write(`${JSON.stringify({ chunk: uploaded.status, complete: completed.status })}\n`)
