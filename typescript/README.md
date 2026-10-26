# @skrybe/sdk

The official TypeScript/JavaScript SDK for the [Skrybe](https://skry.be) API:
email campaigns, transactional email, lists, subscribers, templates and
autoresponders.

- **No dependencies.** It uses the built-in `fetch`, so installing it pulls in
  nothing but this package.
- **Runs anywhere `fetch` does:** Node.js 18+, Bun, Deno, Cloudflare Workers
  and other edge runtimes. Ships ESM and CommonJS, with types.
- **Typed errors.** The API often reports failures as a sentence with HTTP 200;
  the SDK turns every one into a `SkrybeError` with a stable `code`.

> Your API key can send email as your brand. Use the SDK server-side only, and
> never ship the key to a browser.

## Install

```bash
npm install @skrybe/sdk
```

## Quick start

```ts
import { Skrybe } from '@skrybe/sdk'

const skrybe = new Skrybe({ apiKey: process.env.SKRYBE_API_KEY! })

const lists = await skrybe.lists.list()

await skrybe.subscribers.subscribe({
  listId: lists[0].id,
  email: 'ada@example.com',
  name: 'Ada',
  fields: { Birthday: '1990-12-10' },
})
```

CommonJS works too: `const { Skrybe } = require('@skrybe/sdk')`.

### Options

| Option | Default | |
|---|---|---|
| `apiKey` | required | A brand's API key, from Settings in the Skrybe dashboard. |
| `baseUrl` | `https://dashboard.skry.be` | |
| `timeoutMs` | `30000` | Per attempt. |
| `maxRetries` | `2` | Extra attempts for **reads** after a dropped connection or a 429/502/503/504. Writes are never retried: the API has no idempotency keys, so a retried send could go out twice. |
| `fetch` | `globalThis.fetch` | Your own fetch, e.g. to go through a proxy or trust a corporate CA. |

## Usage

### Email

```ts
// Transactional: one email, delivered immediately. OTPs, resets, receipts.
await skrybe.emails.sendTransactional({
  toEmail: 'ada@example.com',
  subject: 'Your code',
  htmlBody: '<p>Your code is <strong>384092</strong>.</p>',
  plainBody: 'Your code is 384092.',
})

// Bulk: up to 250 addresses, or whole lists. Creates a campaign behind the scenes.
await skrybe.emails.send({
  fromName: 'Ada',
  fromEmail: 'ada@yourdomain.com',
  replyTo: 'ada@yourdomain.com',
  subject: 'Hello [recipient.first]',
  htmlText: '<p>Hi [recipient.first]!</p>',
  to: ['user@example.com'],
  recipientVariables: { 'user@example.com': { first: 'John' } },
})
```

### Campaigns

```ts
const { campaignId } = await skrybe.campaigns.create({
  fromName: 'Ada',
  fromEmail: 'ada@yourdomain.com',
  replyTo: 'ada@yourdomain.com',
  title: 'October newsletter',
  subject: 'What we shipped',
  htmlText: '<p>…</p>',
})

const id = Number(campaignId)
await skrybe.campaigns.testSend(id, ['me@yourdomain.com'])

// Count the recipients without sending, then send.
const { recipients } = await skrybe.campaigns.send(id, { listIds: [listId], dryRun: true })
await skrybe.campaigns.send(id, { listIds: [listId] })

// Or schedule it. Anything PHP's strtotime() reads.
await skrybe.campaigns.schedule(id, { listIds: [listId], at: '2027-06-15 18:05', timezone: 'Africa/Lagos' })

const stats = await skrybe.campaigns.stats(id)
const clickers = await skrybe.campaigns.activityAll(id, 'clicks')
```

Also: `list`, `listAll`, `get`, `update`, `duplicate`, `delete`,
`unschedule`, `activity`.

### Lists, subscribers and custom fields

```ts
const list = await skrybe.lists.create({ name: 'Customers', optIn: 'single' })
await skrybe.lists.addCustomField(list.id, { name: 'Birthday', type: 'date' })

const outcome = await skrybe.subscribers.subscribe({ listId: list.id, email: 'ada@example.com' })
// 'subscribed', or 'already_subscribed' (which updates the name and fields)

const status = await skrybe.subscribers.status({ listId: list.id, email: 'ada@example.com' })
const active = await skrybe.subscribers.listAll(list.id, { status: 'active' })
```

List ids are encrypted strings: pass them back exactly as the API returns them.

Lists also has `get`, `update`, `delete`, `activeSubscriberCount`,
`renameCustomField` and `deleteCustomField`. Subscribers also has `unsubscribe`,
`delete` (removes the row outright) and `list` (one page).

### Templates

```ts
const t = await skrybe.templates.create({ name: 'Welcome', htmlText: '<p>Welcome!</p>' })
await skrybe.templates.update(t.id, { fromName: 'Ada' })
```

Also `list`, `get` (`{ includeContent: true }` for the HTML) and `delete`.

### Autoresponders

```ts
const drip = await skrybe.autoresponders.create({ name: 'Onboarding', type: 'drip', listId })
await skrybe.autoresponders.createEmail(drip.id, {
  subject: 'Day 3: getting started',
  htmlText: '<p>…</p>',
  when: '+3 days',
  enabled: true, // emails are created switched off unless you say otherwise
})

// annually and on_date send on a Date custom field of the list
await skrybe.autoresponders.create({ name: 'Birthdays', type: 'annually', listId, customField: 'Birthday' })
```

Also `list`, `get` (with its emails) and `emailStats`.

### Brands and stats

```ts
const [brand] = await skrybe.brands.list() // the key's own brand
const sent = await skrybe.stats.totalEmailsSent() // installation-wide, public
```

## Errors

Every failure is a `SkrybeError` with a machine-readable `code`, a `type`, and
often a `hint`. Branch on the subclass or on `type`:

| Class | `type` | When |
|---|---|---|
| `AuthenticationError` | `authentication` | The API key is missing or wrong. |
| `InvalidRequestError` | `invalid_request` | The request is wrong; retrying it unchanged fails again. |
| `RateLimitError` | `rate_limit` | A quota, allowance or rate limit was hit. |
| `ConnectionError` | `connection` | The API could not be reached, or timed out (`code: 'timeout'`). |
| `ApiError` | `api` | Anything else, e.g. `list_not_found`, `campaign_not_draft`. |

```ts
import { SkrybeError, RateLimitError } from '@skrybe/sdk'

try {
  await skrybe.campaigns.send(id, { listIds: [listId] })
} catch (err) {
  if (err instanceof RateLimitError) {
    // quota_exceeded, rate_limited
  } else if (err instanceof SkrybeError && err.code === 'campaign_not_draft') {
    // already sent
  } else {
    throw err
  }
}
```

`err.raw` holds the response body and `err.status` the HTTP status, for
debugging.

## Security

- **TLS is always verified.** There is no option to turn it off. Use the
  `fetch` option to supply a custom CA or proxy instead.
- **Keep your runtime's CA store current.** Node.js bundles its own list of
  trusted certificate authorities, so CA distrust events (such as eMudhra's in
  October 2026) only reach you when you update Node, or when you run with
  `--use-system-ca` on an updated OS.
- **No install scripts and no dependencies**, so there is no supply chain
  beyond this package. Releases are published from GitHub Actions with
  [npm provenance](https://docs.npmjs.com/generating-provenance-statements);
  check with `npm audit signatures`.

## Upgrading from 1.x

2.0 is a rewrite. Methods moved onto resources and return parsed values instead
of raw response bodies:

| 1.x | 2.x |
|---|---|
| `new SkrybeSDK({ apiKey, baseURL })` | `new Skrybe({ apiKey, baseUrl })` |
| `sendEmail(opts)` | `emails.send(opts)`, returns `{ message, campaignId }` |
| `sendTransactional(opts)` | `emails.sendTransactional(opts)`, returns `{ message, messageId }` |
| `createCampaign(opts)` | `campaigns.create(opts)`. `listIds` etc. are now arrays and `sendCampaign: 1` is `send: true`. Returns `{ outcome, campaignId }`. |
| `getLists(includeHidden)` | `lists.list({ includeHidden })`, returns `[{ id, name }]` |

Failures now throw instead of resolving with an error string. The axios
dependency is gone.

## License

MIT
