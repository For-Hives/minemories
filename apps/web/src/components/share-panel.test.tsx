// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { I18nProvider } from '../i18n/I18n'
import { SharePanel } from './SharePanel'

const api = vi.hoisted(() => ({
	shareStatus: vi.fn().mockResolvedValue({ shared: false }),
	createShare: vi.fn().mockResolvedValue({ urlPath: '/shared/proof' }),
	revokeShare: vi.fn().mockResolvedValue({ ok: true }),
	notify: vi.fn(),
}))
vi.mock('../api-client', () => ({ apiClient: { memories: api } }))
vi.mock('../app-context', () => ({ useAppContext: () => ({ notify: api.notify }) }))
afterEach(cleanup)

test('opening sharing does not publish; an explicit action creates the link and revocation removes it', async () => {
	render(
		<I18nProvider initialLocale="en">
			<SharePanel memoryId="private-memory" />
		</I18nProvider>
	)
	const create = await screen.findByRole('button', { name: 'Create a link' })
	expect(api.createShare).not.toHaveBeenCalled()
	fireEvent.click(create)
	const link = (await screen.findByRole('textbox', { name: 'Share link' })) as HTMLInputElement
	expect(api.createShare).toHaveBeenCalledWith({ id: 'private-memory' })
	expect(link.value).toContain('/shared/proof')
	fireEvent.click(screen.getByRole('button', { name: 'Stop sharing' }))
	await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Share link' })).toBeNull())
	expect(api.revokeShare).toHaveBeenCalledWith({ id: 'private-memory' })
	expect(screen.getByRole('button', { name: 'Create a link' })).toBeTruthy()
})
