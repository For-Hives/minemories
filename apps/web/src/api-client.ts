import type { apiContract } from '@minemories/api-contract'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { ContractRouterClient } from '@orpc/contract'

export const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

const link = new RPCLink({
	url: `${apiBase}/rpc`,
	fetch: (request, init) =>
		globalThis.fetch(request, {
			...init,
			credentials: 'include',
		}),
})

export const apiClient: ContractRouterClient<typeof apiContract> = createORPCClient(link)
