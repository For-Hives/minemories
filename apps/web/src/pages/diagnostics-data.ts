import type { apiClient } from '../api-client'

export type DiagnosticIssue = Awaited<ReturnType<typeof apiClient.diagnostics.list>>['items'][number]
export type DiagnosticDetail = Awaited<ReturnType<typeof apiClient.diagnostics.detail>>
export type IssueState = DiagnosticIssue['state']
export type IssueFilters = Parameters<typeof apiClient.diagnostics.list>[0]

export const issueStates: IssueState[] = ['open', 'in_progress', 'resolved', 'ignored']
export const stateLabels = {
	open: 'diagnostics.state.open',
	in_progress: 'In progress',
	resolved: 'Resolved',
	ignored: 'Ignored',
}
export const phaseLabels = {
	capture: 'Export',
	upload: 'Upload',
	pairing: 'Pairing',
	crash: 'Client crash',
}
