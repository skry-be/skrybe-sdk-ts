# Changelog

All notable changes to `@skrybe/sdk`. Each release's section becomes its GitHub
Release notes. Add entries under Unreleased as changes merge; a release PR
(`npm run release:prepare -- <version>`) dates them.

Methods that call new API endpoints need a Skrybe install that has them
deployed; the API side lives in skry-be/skrybe-dashboard.

## [Unreleased]

## [2.0.0] - 2026-10-23

A rewrite covering the whole public API, in step with `@skrybe/cli` 0.2.0. See
"Upgrading from 1.x" in the README.

### Added
- Resource namespaces on a `Skrybe` client: `emails`, `campaigns`, `lists`,
  `subscribers`, `templates`, `autoresponders`, `brands`, `sms`, `stats`.
- Campaigns: `list`/`listAll`, `get`, `stats`, `send` (with `dryRun`),
  `testSend`, `schedule`/`unschedule`, `update`, `duplicate`, `delete`,
  `activity`/`activityAll`.
- Lists: `get`, `create`, `update`, `delete`, `activeSubscriberCount`, and
  custom fields (`addCustomField`, `renameCustomField`, `deleteCustomField`).
- Subscribers: `subscribe` (with custom fields), `unsubscribe`, `delete`,
  `status`, `list`/`listAll`.
- Templates: `list`, `get`, `create`, `update`, `delete`.
- Autoresponders: `list`, `get`, `emailStats`, `create`, `createEmail`.
- SMS: `send` and `get`.
- `brands.list()` and `stats.totalEmailsSent()`.
- Typed errors: `SkrybeError` with `AuthenticationError`, `InvalidRequestError`,
  `RateLimitError`, `ConnectionError` and `ApiError`, each with a stable `code`.
  Prose failures the API returns with HTTP 200 are recognised and thrown.
- Timeouts (`timeoutMs`), retries for reads only (`maxRetries`), and a `fetch`
  option for proxies and custom CAs.
- ESM and CommonJS builds, with types for both.

### Changed
- `SkrybeSDK` is now `Skrybe`, and `baseURL` is `baseUrl`.
- Methods return parsed results, and throw on failure instead of resolving with
  the response body.
- `campaigns.create` takes id arrays and `send: true` instead of comma-joined
  strings and `sendCampaign: 1`.

### Removed
- The axios dependency. The SDK has no runtime dependencies and uses the
  built-in `fetch` (Node.js 18 or newer).

### Fixed
- `sendEmail` no longer logs the request body, API key included, to the console.
- `package.json` points at this repository.
