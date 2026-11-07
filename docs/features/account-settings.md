# Account credentials

The private `/account` page, reached from "My account", lets users change their sign-in email or password. It is excluded from indexing and public prerendering; Nginx routing serves the application for this URL.

Every operation requires the current session and the current password, capped at 128 characters. The new password must be at least 12 characters long, and the form asks for a confirmation. The server uses the hash and verification functions configured in Better Auth instead of duplicating its algorithm.

The change and the revocation of every session on the account are committed together in one SQLite transaction. Credentials and session state are checked again after confirmation: a concurrent change or a revoked session blocks the commit. An address already in use rolls the transaction back. Confirmation attempts are limited to eight per minute per account, with a persistent counter.

The address is normalized to lowercase and stays unverified: no proof of ownership of the new mailbox is invented. The current service does not send verification emails; confirmation relies on the current password. The account identifier stays the same, along with its memories, pairings and roles. After success, the sign-in page is reloaded so no session stays cached.

Validation: service tests (concurrency, expiry, rollback and rate limiting), real Better Auth/oRPC HTTP flows (new sign-in, old password and sessions invalidated, other account untouched), and FR/EN form interactions. No password or hash is kept in validation traces.
