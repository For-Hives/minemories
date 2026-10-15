import type { apiClient } from '../api-client'

export type DiagnosticIssue = Awaited<ReturnType<typeof apiClient.diagnostics.list>>['items'][number]
export type DiagnosticDetail = Awaited<ReturnType<typeof apiClient.diagnostics.detail>>
export type IssueState = DiagnosticIssue['state']
export type IssueFilters = Parameters<typeof apiClient.diagnostics.list>[0]

export const issueStates: IssueState[] = ['open', 'in_progress', 'resolved', 'ignored']
export const stateLabels = {
	open: { fr: 'À examiner', en: 'Open' },
	in_progress: { fr: 'En cours', en: 'In progress' },
	resolved: { fr: 'Résolu', en: 'Resolved' },
	ignored: { fr: 'Ignoré', en: 'Ignored' },
}
export const phaseLabels = {
	capture: { fr: 'Export', en: 'Export' },
	upload: { fr: 'Envoi', en: 'Upload' },
	pairing: { fr: 'Appairage', en: 'Pairing' },
	crash: { fr: 'Crash client', en: 'Client crash' },
}
