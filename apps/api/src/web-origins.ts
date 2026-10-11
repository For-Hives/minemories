import { allowedWebOrigins } from './configuration'

export const webOrigins = allowedWebOrigins(process.env)
