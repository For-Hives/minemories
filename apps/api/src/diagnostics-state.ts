import { database } from './database'
import { diagnosticsPolicy } from './diagnostics-policy'
import { DiagnosticsStore } from './diagnostics-store'

export const diagnostics = new DiagnosticsStore(database, diagnosticsPolicy(process.env))
diagnostics.cleanup()
