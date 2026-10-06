export const webOrigins = (process.env.WEB_ORIGIN ?? 'http://localhost:5173')
	.split(',')
	.map(origin => origin.trim())
	.filter(Boolean)
