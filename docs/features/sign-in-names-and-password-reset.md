# Sign-in names and forgotten passwords

Added on 24 November 2026, after a player could not sign in: he remembered his name, not which of his two emails the account used.

## Sign-in name

- Players sign in with their email **or** their Minecraft name, in the same field (`/login`).
- Better Auth's `username` plugin (`apps/api/src/sign-in-name.ts`) stores the name lowercased in `user.username` (unique index) and as typed in `user.displayUsername`. A sign-in name is a Minecraft Java name: 3 to 16 letters, numbers or `_` (`SIGN_IN_NAME`, the same rule as `minecraftUsername` in the contract).
- Sign-up: the "Minecraft name" field fills `name` as before. When it is a valid Minecraft name it also becomes the sign-in name, and a name already used by another account refuses the sign-up (`USERNAME_IS_ALREADY_TAKEN`). Any other display name still creates the account, which then signs in with its email only.
- Account page: "Sign-in name" sets or changes it (`authClient.updateUser({ username, displayUsername })`), for accounts with a password.
- Existing accounts: at API start, `backfillSignInNames` gives each account without a sign-in name its display name, only when that name is a valid Minecraft name that no other account uses (as a display name or a sign-in name, case ignored). It never overwrites; clashes stay empty and those players choose a name on the account page. It is idempotent.
- `/is-username-available` is disabled (it would list which names have an account). Sign-in by name has the same rate limit as sign-in by email.

## Forgotten password

- `/login/forgot` takes the email or the Minecraft name (the `reset-by-name` hook swaps a name for its account's email; an unknown name continues as an unknown address, so the answer and the timing do not tell whether an account exists). The page always answers "if an account matches, we sent it a link".
- The email (`apps/api/src/password-reset.ts`) links to the API's `/api/auth/reset-password/<token>`, which checks the token and sends the browser to `/login/reset?token=…` (or `?error=INVALID_TOKEN`) in the language of the page that asked. The link works for one hour and once. Saving the new password signs the account out everywhere.
- The email is written in the web catalogs' language (`translateWeb`, `apps/api/src/web-catalog.ts`), from the language prefix of the page that asked for it.
- Both pages live under `/login/`, which nginx already serves as the application shell: no nginx change.
- Rate limits per client address (`apps/api/src/auth-protection.ts`): 3 reset emails an hour, 10 password saves per 10 minutes.

## Sending

- Production sends through Resend when `RESEND_API_KEY` and `MAIL_FROM` are set (sending domain `send.minemories.net`). Without them it refuses resets (`RESET_PASSWORD_DISABLED`, shown as "unavailable right now") instead of pretending to send.
- Outside production without them, the reset link is written to the API log, so a local reset needs no mail account.
- A refused email is logged with Resend's status only, never with the address or the link.
- Resend is listed among the service providers on `/privacy`.
