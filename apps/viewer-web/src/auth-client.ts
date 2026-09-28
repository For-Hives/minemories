import { createAuthClient } from 'better-auth/react';

const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export const authClient = createAuthClient({
  baseURL: apiBase,
  fetchOptions: { credentials: 'include' },
});

export type AuthSession = NonNullable<typeof authClient.$Infer.Session>;
