# Polar billing foundation

The code prepares the Better Auth/Polar integration; it is not an active commercial offer. Owner decision of 16 October 2026: keep payments disabled for now. The example file explicitly keeps `POLAR_ENVIRONMENT=off`. By default, `POLAR_ENVIRONMENT` is absent or `off`: no plugin, checkout or provider call is added. No Polar customer is created when someone signs up to Minemories.

## Explicit configuration

For an isolated test environment, provide `POLAR_ENVIRONMENT=sandbox`, `POLAR_ORGANIZATION_ID` (UUID), `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `WEB_ORIGIN` and `POLAR_PRODUCTS` (a JSON array of `{ "slug": "test-offer", "productId": "UUID" }`). Slugs and products are unique. Secrets stay in the deployment environment, never in Git or in issues.

Production additionally requires `POLAR_PRODUCTION_READY=true`, an explicit `POLAR_TERMS_VERSION` and an HTTPS origin. These settings record an operator decision; the code cannot verify the legal review. Only enable them after the Polar account is set up (#63), the offer and terms are approved (#89), and the sandbox has been exercised for real. A database is permanently bound to one organization and one environment; changing them requires an explicit migration.

## Checkout and webhooks

`POST /api/auth/checkout` only accepts `{ "slug": "test-offer" }`, for an authenticated session. The product is picked from the server-side list. Product, customer, organization, price, metadata, trial, discount and redirect identifiers supplied by the client are rejected. Return URLs stay within the configured gallery; the client's IP address is not sent. Returning from checkout grants no rights. The customer portal also uses the Better Auth session identity. The `reference_id` and `organizationId` parameters are rejected on customer routes to prevent lookups by a foreign organization reference.

The plugin verifies the Standard Webhooks signature and its time window on the exact body of `POST /api/auth/polar/webhooks`, capped at 256 KiB. The context keeps the delivery ID and its SHA-256. The minimal SQLite projection of orders and subscriptions checks the organization and the external ID of the Minemories account. Identical duplicates are idempotent, a reused ID with a different body fails, older revisions do not roll the state back, and a resource's owner cannot change. Orders and subscriptions have separate ID spaces. Unused event types are acknowledged without changes. Polar-related authentication logs are reduced to a generic event so that provider errors containing personal data are never written there.

## Remaining scope before going commercial

The projection is a technical cache, not a quota authority: today no event changes upload limits, access rights, retention or an offer. Identical revisions with diverging content will need reconciliation against the provider's canonical state before this cache can drive rights. The billing model (per capture or per account), taxes, quotas and retention/cancellation commitments must be decided in #89; do not invent a monthly subscription to replace the prepared prices.

Still to do to close #80: tie the approved commercial contract to rights and quotas, offer the matching user flow, check plan changes/cancellations and their effects, make a real sandbox payment, and prepare the deployment with the real account and secrets. This foundation does not validate a sandbox charge or a production payment.

## Local validation

The tests use the real Better Auth plugin and the Polar SDK, real sessions and a locally simulated provider server. They check the identity passed along, rejection of an arbitrary product, enforced URLs, no call on sign-up and no rights after checkout, invalid/expired signatures, duplicate deliveries, out-of-order retries, refunds, foreign organizations and provider errors. They send no real account data to Polar.

References: [Better Auth adapter](https://polar.sh/docs/integrate/sdk/adapters/better-auth), [Polar webhooks](https://polar.sh/docs/integrate/webhooks/endpoints).
