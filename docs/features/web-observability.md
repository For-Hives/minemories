# Optional web diagnostics

Site observability (#68) uses the official `@sentry/browser` client, loaded on demand. It is separate from the Minecraft diagnostics consent and enables neither Umami, nor browsing analytics, nor session replay. It does not measure visits and does not collect capture errors.

## Enabling and withdrawal

Without `VITE_WEB_DIAGNOSTICS_DSN`, no SDK is loaded and no report is sent, even if an old preference remains. The public HTTPS DSN is a Vite build-time setting; a Sentry admin token must never be used. No real DSN ships in the repository.

A valid DSN makes the optional choice visible on `/privacy`, unchecked by default. Consent is stored only on this device under `minemories-web-diagnostics-v1`. Missing or unavailable storage forbids collection. Withdrawal takes effect immediately in the tab and, through the `storage` event, in other tabs; in-flight requests are aborted and no deferred upload is kept. Clearing site data also withdraws consent.

Before configuring the DSN in a deployment, the operator must document the recipient, region and retention in the privacy policy, restrict access to the project and configure Sentry's origin restrictions and quotas. The collector necessarily sees the IP address and technical headers of the HTTP connection; do not describe these reports as anonymous. The shipped baseline stays disabled, and the legal contact details still to be completed in #89 are not made up.

## Allowed data

The closed list in `observability/policy.ts` only allows fixed editorial routes: home, guides, versions, overview, pricing and legal pages. No unknown route, sign-in, account, gallery, viewer, public capture, sharing, moderation or private diagnostics page is instrumented. Query parameters and fragments are never read for the report.

Only three categories exist: `runtime` (script error), `unhandled-promise` and `page-render` (React boundary). Each category is sent at most once per page mount. A report contains the category, the fixed route, a grouping fingerprint, a random event ID and the SDK's constant technical metadata. That is enough to identify a broken public page without reading the exception. Ingestion network errors are swallowed and duplicates are not retried; the Sentry transport's rate limiting stays active.

The `dataCollection` policy disables every automatic collection, including Sentry-side IP inference (`infer_ip: never`). The client installs no default integration: no breadcrumbs, session, replay, tracing or network instrumentation. No error object, message, stack, capture, file name, local path, cookie, account ID, token, pairing code or private URL is passed to the provider. `beforeSend` rebuilds the event from the closed list and even strips data from any ambient Sentry scope. The transport also refuses uploads after withdrawal or a route change, omits cookies and referrer, refuses redirects and aborts requests when the page is left.

## Validation

The tests use the real SDK with an intercepted network transport: exact envelope content, removal of an ambient scope containing an email/token/code, network errors, deduplication and cancellation. The interaction tests check that nothing loads without configuration or consent, enabling, withdrawal, cross-tab changes, private/unknown routes, leaving during the deferred import and unavailable preferences. No call to a real Sentry project is needed.

Provider references: [isolated client](https://docs.sentry.io/platforms/javascript/best-practices/shared-environments/), [filtering](https://docs.sentry.io/platforms/javascript/configuration/filtering/), [envelopes](https://develop.sentry.dev/sdk/foundations/envelopes/).
