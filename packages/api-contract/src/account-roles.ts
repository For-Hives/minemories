import * as z from 'zod'

/**
 * Every role an account can hold for storage limits. `user` is held by every account (it is the base quota) and `admin`
 * by the accounts in `user_roles`. An account's limit is the largest limit among the roles it holds.
 *
 * To add a role (an alpha tester group, a paid tier...): add it here, then give it a membership source in
 * `ROLE_MEMBERSHIP` (`apps/api/src/role-storage.ts`) and a label in the web admin (`AdminRoleStorage.tsx`). Both are
 * typed records over this list, so the typecheck fails until they exist. No migration is needed: limits are rows of
 * `role_storage_limits`, and a role without a configured limit contributes nothing.
 */
export const storageRole = z.enum(['user', 'admin'])
export type StorageRole = z.infer<typeof storageRole>
/** Highest limit one role may be given: 1 TB (decimal, like every size shown by the web and the mod). */
export const MAX_ROLE_STORAGE_BYTES = 1_000_000_000_000
/** A configured limit: a positive whole number of bytes, at most `MAX_ROLE_STORAGE_BYTES`. */
export const roleStorageBytes = z.number().int().positive().max(MAX_ROLE_STORAGE_BYTES)
export const roleStorage = z.object({
	role: storageRole,
	/** Limit configured for this role, or `null` when none is (then `user` uses `ACCOUNT_STORAGE_BYTES`). */
	limitBytes: roleStorageBytes.nullable(),
	/** Limit of an account holding `user` and this role only: the larger of the base quota and this role's limit. */
	effectiveBytes: z.number().int().positive(),
	/** Accounts holding this role. */
	accounts: z.number().int().nonnegative(),
	updatedAt: z.number().nullable(),
})
export type RoleStorage = z.infer<typeof roleStorage>
